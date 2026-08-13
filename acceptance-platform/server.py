#!/usr/bin/env python3
"""Serve approved acceptance-portal assets and persist checklist state safely.

Admin password lookup order (first match wins):

1. File `LVT_ACCEPTANCE_ADMIN_PASSWORD_FILE` (default `.runtime/admin-password`)
2. Env `LVT_ACCEPTANCE_ADMIN_PASSWORD`
3. Compiled macOS `keychain-helper` in this directory

Never commit the password. Linux/production should use the file or env.
"""

from __future__ import annotations

import json
import os
import secrets
import subprocess
import tempfile
import threading
import time
from http.cookies import SimpleCookie
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
STATE_PATH = Path(os.environ.get("LVT_ACCEPTANCE_STATE_PATH", ROOT / ".runtime" / "acceptance-state.json"))
MAX_BODY_BYTES = 512 * 1024
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD_ENV = "LVT_ACCEPTANCE_ADMIN_PASSWORD"
ADMIN_PASSWORD_FILE = Path(
    os.environ.get("LVT_ACCEPTANCE_ADMIN_PASSWORD_FILE", ROOT / ".runtime" / "admin-password")
)
KEYCHAIN_SERVICE = "com.bemi.lvt-acceptance-platform.admin"
KEYCHAIN_HELPER = ROOT / "keychain-helper"
SESSION_COOKIE = "lvt_acceptance_session"
SESSION_TTL_SECONDS = 12 * 60 * 60
LOGIN_WINDOW_SECONDS = 15 * 60
LOGIN_MAX_FAILURES = 8
ISSUE_STATUS_OPTIONS = {"Backlog", "In process", "Done", "Pending", "Cancel"}
UAT_OPTIONS = {"Chưa UAT", "Đã UAT"}
STATE_LOCK = threading.Lock()
AUTH_LOCK = threading.Lock()
SESSIONS: dict[str, float] = {}
LOGIN_FAILURES: list[float] = []
PUBLIC_FILES = {
    "/": "index.html",
    "/index.html": "index.html",
    "/data.js": "data.js",
    "/logo-thcs-le-van-tam.png": "logo-thcs-le-van-tam.png",
}


def load_issue_ids() -> set[str]:
    source = (ROOT / "data.js").read_text(encoding="utf-8").strip()
    prefix = "window.ACCEPTANCE_DATA = "
    if not source.startswith(prefix):
        raise RuntimeError("Không thể đọc danh mục hạng mục")
    payload = json.loads(source[len(prefix) :].rstrip(";"))
    return {str(item["id"]) for item in payload.get("issues", []) if item.get("id")}


ISSUE_IDS = load_issue_ids()


def _clean_mapping(value: Any, allowed: set[str], field: str) -> dict[str, str]:
    if not isinstance(value, dict):
        raise ValueError(f"{field} phải là object")
    cleaned: dict[str, str] = {}
    for raw_key, raw_value in value.items():
        if not isinstance(raw_key, str) or raw_key not in ISSUE_IDS:
            raise ValueError(f"{field} chứa mã hạng mục không hợp lệ")
        if raw_value not in allowed:
            raise ValueError(f"{field} chứa trạng thái không hợp lệ")
        cleaned[raw_key] = raw_value
    return cleaned


def validate_state(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("Dữ liệu phải là object")
    revision = payload.get("revision", 0)
    if not isinstance(revision, int) or revision < 0:
        raise ValueError("Phiên bản dữ liệu không hợp lệ")
    return {
        "revision": revision,
        "issueStatuses": _clean_mapping(
            payload.get("issueStatuses", {}), ISSUE_STATUS_OPTIONS, "issueStatuses"
        ),
        "uatStates": _clean_mapping(payload.get("uatStates", {}), UAT_OPTIONS, "uatStates"),
    }


def _read_state_unlocked() -> dict[str, Any]:
    try:
        return validate_state(json.loads(STATE_PATH.read_text(encoding="utf-8")))
    except FileNotFoundError:
        return {"revision": 0, "issueStatuses": {}, "uatStates": {}}
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        raise RuntimeError("Không thể đọc dữ liệu trạng thái") from exc


def load_state() -> dict[str, Any]:
    with STATE_LOCK:
        return _read_state_unlocked()


def _atomic_write_unlocked(state: dict[str, Any]) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix="acceptance-state-", suffix=".tmp", dir=STATE_PATH.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(state, handle, ensure_ascii=False, separators=(",", ":"))
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_name, STATE_PATH)
        directory_fd = os.open(STATE_PATH.parent, os.O_RDONLY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        try:
            os.unlink(temp_name)
        except FileNotFoundError:
            pass


def save_state(state: dict[str, Any]) -> None:
    with STATE_LOCK:
        _atomic_write_unlocked(state)


def save_state_if_current(state: dict[str, Any], base_revision: int) -> Optional[dict[str, Any]]:
    with STATE_LOCK:
        current = _read_state_unlocked()
        if current["revision"] != base_revision:
            return None
        saved = {**state, "revision": base_revision + 1}
        _atomic_write_unlocked(saved)
        return saved


def _normalize_password(value: Optional[str]) -> Optional[str]:
    if not isinstance(value, str):
        return None
    password = value.rstrip("\r\n")
    if not password or "\n" in password or "\r" in password:
        return None
    return password


def _read_password_file() -> Optional[str]:
    try:
        return _normalize_password(ADMIN_PASSWORD_FILE.read_text(encoding="utf-8"))
    except (FileNotFoundError, OSError):
        return None


def _read_password_env() -> Optional[str]:
    return _normalize_password(os.environ.get(ADMIN_PASSWORD_ENV))


def _read_password_keychain() -> Optional[str]:
    if not KEYCHAIN_HELPER.is_file():
        return None
    try:
        result = subprocess.run(
            [str(KEYCHAIN_HELPER), "get"],
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        )
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError):
        return None
    return _normalize_password(result.stdout)


def read_admin_password() -> Optional[str]:
    return _read_password_file() or _read_password_env() or _read_password_keychain()


def _write_password_file(password: str) -> bool:
    try:
        ADMIN_PASSWORD_FILE.parent.mkdir(parents=True, exist_ok=True)
        fd, temp_name = tempfile.mkstemp(
            prefix="admin-password-",
            suffix=".tmp",
            dir=ADMIN_PASSWORD_FILE.parent,
        )
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                handle.write(password)
                handle.write("\n")
                handle.flush()
                os.fsync(handle.fileno())
            os.chmod(temp_name, 0o600)
            os.replace(temp_name, ADMIN_PASSWORD_FILE)
            os.chmod(ADMIN_PASSWORD_FILE, 0o600)
            return True
        finally:
            try:
                os.unlink(temp_name)
            except FileNotFoundError:
                pass
    except OSError:
        return False


def _write_password_keychain(password: str) -> bool:
    if not KEYCHAIN_HELPER.is_file():
        return False
    try:
        subprocess.run(
            [str(KEYCHAIN_HELPER), "set"],
            input=password + "\n",
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        )
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError):
        return False
    return True


def write_admin_password(password: str) -> bool:
    wrote_file = _write_password_file(password)
    wrote_keychain = _write_password_keychain(password)
    return wrote_file or wrote_keychain


def parse_session_token(cookie_header: str) -> str:
    cookie = SimpleCookie()
    try:
        cookie.load(cookie_header)
    except Exception:
        return ""
    morsel = cookie.get(SESSION_COOKIE)
    return morsel.value if morsel else ""


def is_authenticated(cookie_header: str, now: Optional[float] = None) -> bool:
    token = parse_session_token(cookie_header)
    if not token:
        return False
    current_time = time.time() if now is None else now
    with AUTH_LOCK:
        expires_at = SESSIONS.get(token, 0)
        if expires_at <= current_time:
            SESSIONS.pop(token, None)
            return False
        return True


def create_session(now: Optional[float] = None) -> str:
    current_time = time.time() if now is None else now
    token = secrets.token_urlsafe(32)
    with AUTH_LOCK:
        SESSIONS[token] = current_time + SESSION_TTL_SECONDS
    return token


def delete_session(cookie_header: str) -> None:
    token = parse_session_token(cookie_header)
    if token:
        with AUTH_LOCK:
            SESSIONS.pop(token, None)


def login_rate_limited(now: Optional[float] = None) -> bool:
    current_time = time.time() if now is None else now
    with AUTH_LOCK:
        LOGIN_FAILURES[:] = [value for value in LOGIN_FAILURES if current_time - value < LOGIN_WINDOW_SECONDS]
        return len(LOGIN_FAILURES) >= LOGIN_MAX_FAILURES


def record_login_failure(now: Optional[float] = None) -> None:
    with AUTH_LOCK:
        LOGIN_FAILURES.append(time.time() if now is None else now)


def clear_login_failures() -> None:
    with AUTH_LOCK:
        LOGIN_FAILURES.clear()


class AcceptanceHandler(SimpleHTTPRequestHandler):
    server_version = "LvtAcceptance/1.1"

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def _send_json(self, status: HTTPStatus, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _origin_is_valid(self) -> bool:
        origin = self.headers.get("Origin")
        return not origin or urlsplit(origin).netloc == self.headers.get("Host")

    def _read_json_body(self) -> Any:
        content_type = self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
        if content_type != "application/json":
            raise TypeError("Chỉ chấp nhận JSON")
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            content_length = -1
        if content_length <= 0 or content_length > MAX_BODY_BYTES:
            raise OverflowError("Kích thước dữ liệu không hợp lệ")
        return json.loads(self.rfile.read(content_length))

    def _set_session_cookie(self, token: str) -> None:
        self.send_header(
            "Set-Cookie",
            f"{SESSION_COOKIE}={token}; Path=/; Max-Age={SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Strict",
        )

    def _clear_session_cookie(self) -> None:
        self.send_header(
            "Set-Cookie",
            f"{SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict",
        )

    def do_GET(self) -> None:
        path = urlsplit(self.path).path
        if path == "/api/state":
            try:
                self._send_json(
                    HTTPStatus.OK,
                    {
                        **load_state(),
                        "writeEnabled": is_authenticated(self.headers.get("Cookie", "")),
                    },
                )
            except RuntimeError as exc:
                self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(exc)})
            return
        if path == "/api/session":
            self._send_json(
                HTTPStatus.OK,
                {
                    "authenticated": is_authenticated(self.headers.get("Cookie", "")),
                    "username": ADMIN_USERNAME,
                    "configured": read_admin_password() is not None,
                },
            )
            return
        public_file = PUBLIC_FILES.get(path)
        if not public_file:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        self.path = "/" + public_file
        super().do_GET()

    def do_POST(self) -> None:
        path = urlsplit(self.path).path
        if path == "/api/login":
            self._handle_login()
            return
        if path == "/api/logout":
            self._handle_logout()
            return
        if path == "/api/change-password":
            self._handle_change_password()
            return
        if path != "/api/state":
            self._send_json(HTTPStatus.NOT_FOUND, {"error": "Không tìm thấy endpoint"})
            return
        if not is_authenticated(self.headers.get("Cookie", "")):
            self._send_json(HTTPStatus.UNAUTHORIZED, {"error": "Chỉ admin mới được lưu dữ liệu"})
            return
        if not self._origin_is_valid():
            self._send_json(HTTPStatus.FORBIDDEN, {"error": "Origin không hợp lệ"})
            return
        try:
            payload = self._read_json_body()
            if "issueStatuses" not in payload or "uatStates" not in payload:
                raise ValueError("Thiếu dữ liệu trạng thái bắt buộc")
            base_revision = payload.get("baseRevision")
            if not isinstance(base_revision, int) or base_revision < 0:
                raise ValueError("Thiếu phiên bản dữ liệu gốc")
            state = validate_state(payload)
            saved = save_state_if_current(state, base_revision)
            if saved is None:
                self._send_json(HTTPStatus.CONFLICT, {"error": "Dữ liệu đã thay đổi ở nơi khác; vui lòng tải lại"})
                return
        except TypeError as exc:
            self._send_json(HTTPStatus.UNSUPPORTED_MEDIA_TYPE, {"error": str(exc)})
            return
        except OverflowError as exc:
            self._send_json(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {"error": str(exc)})
            return
        except (json.JSONDecodeError, UnicodeDecodeError, ValueError) as exc:
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": str(exc) or "Dữ liệu không hợp lệ"})
            return
        except (OSError, RuntimeError):
            self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "Không thể lưu dữ liệu"})
            return
        self._send_json(HTTPStatus.OK, {**saved, "saved": True})

    def _handle_login(self) -> None:
        if not self._origin_is_valid():
            self._send_json(HTTPStatus.FORBIDDEN, {"error": "Origin không hợp lệ"})
            return
        if login_rate_limited():
            self._send_json(HTTPStatus.TOO_MANY_REQUESTS, {"error": "Đăng nhập sai quá nhiều lần; thử lại sau"})
            return
        try:
            payload = self._read_json_body()
        except TypeError as exc:
            self._send_json(HTTPStatus.UNSUPPORTED_MEDIA_TYPE, {"error": str(exc)})
            return
        except OverflowError as exc:
            self._send_json(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {"error": str(exc)})
            return
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Dữ liệu đăng nhập không hợp lệ"})
            return
        expected_password = read_admin_password()
        if expected_password is None:
            self._send_json(HTTPStatus.SERVICE_UNAVAILABLE, {"error": "Tài khoản admin chưa được cấu hình"})
            return
        username = payload.get("username") if isinstance(payload, dict) else None
        password = payload.get("password") if isinstance(payload, dict) else None
        valid = (
            isinstance(username, str)
            and isinstance(password, str)
            and secrets.compare_digest(username, ADMIN_USERNAME)
            and secrets.compare_digest(password, expected_password)
        )
        if not valid:
            record_login_failure()
            self._send_json(HTTPStatus.UNAUTHORIZED, {"error": "Tên đăng nhập hoặc mật khẩu không đúng"})
            return
        clear_login_failures()
        token = create_session()
        body = json.dumps({"authenticated": True, "username": ADMIN_USERNAME}, ensure_ascii=False).encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self._set_session_cookie(token)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _handle_logout(self) -> None:
        if not self._origin_is_valid():
            self._send_json(HTTPStatus.FORBIDDEN, {"error": "Origin không hợp lệ"})
            return
        delete_session(self.headers.get("Cookie", ""))
        body = b'{"authenticated":false}'
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self._clear_session_cookie()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _handle_change_password(self) -> None:
        if not is_authenticated(self.headers.get("Cookie", "")):
            self._send_json(HTTPStatus.UNAUTHORIZED, {"error": "Chỉ admin mới được đổi mật khẩu"})
            return
        if not self._origin_is_valid():
            self._send_json(HTTPStatus.FORBIDDEN, {"error": "Origin không hợp lệ"})
            return
        try:
            payload = self._read_json_body()
        except TypeError as exc:
            self._send_json(HTTPStatus.UNSUPPORTED_MEDIA_TYPE, {"error": str(exc)})
            return
        except OverflowError as exc:
            self._send_json(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {"error": str(exc)})
            return
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Dữ liệu đổi mật khẩu không hợp lệ"})
            return
        current_password = payload.get("currentPassword") if isinstance(payload, dict) else None
        new_password = payload.get("newPassword") if isinstance(payload, dict) else None
        confirmation = payload.get("confirmation") if isinstance(payload, dict) else None
        expected_password = read_admin_password()
        if not isinstance(current_password, str) or expected_password is None or not secrets.compare_digest(current_password, expected_password):
            self._send_json(HTTPStatus.UNAUTHORIZED, {"error": "Mật khẩu hiện tại không đúng"})
            return
        if not isinstance(new_password, str) or len(new_password) < 8 or len(new_password) > 128:
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Mật khẩu mới phải có từ 8 đến 128 ký tự"})
            return
        if new_password != confirmation:
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Xác nhận mật khẩu mới không khớp"})
            return
        if secrets.compare_digest(new_password, current_password):
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Mật khẩu mới phải khác mật khẩu hiện tại"})
            return
        if not write_admin_password(new_password):
            self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "Không thể cập nhật mật khẩu admin"})
            return
        with AUTH_LOCK:
            SESSIONS.clear()
        body = b'{"changed":true,"authenticated":false}'
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self._clear_session_cookie()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()


def main() -> None:
    host = os.environ.get("LVT_ACCEPTANCE_HOST", "127.0.0.1")
    port = int(os.environ.get("LVT_ACCEPTANCE_PORT", "8787"))
    server = ThreadingHTTPServer((host, port), AcceptanceHandler)
    print(f"LVT acceptance portal listening on http://{host}:{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
