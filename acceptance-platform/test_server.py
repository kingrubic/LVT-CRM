import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import server


class AcceptanceStateTests(unittest.TestCase):
    def tearDown(self):
        with server.AUTH_LOCK:
            server.SESSIONS.clear()
            server.LOGIN_FAILURES.clear()

    def test_validate_state_accepts_supported_values(self):
        state = server.validate_state(
            {"issueStatuses": {"SYS-001": "Done"}, "uatStates": {"SYS-001": "Đã UAT"}}
        )
        self.assertEqual(state["revision"], 0)
        self.assertEqual(state["issueStatuses"]["SYS-001"], "Done")
        self.assertEqual(state["uatStates"]["SYS-001"], "Đã UAT")

    def test_validate_state_rejects_unknown_values(self):
        with self.assertRaises(ValueError):
            server.validate_state({"issueStatuses": {"SYS-001": "Unknown"}, "uatStates": {}})

    def test_save_and_load_round_trip(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "state.json"
            expected = server.validate_state(
                {"issueStatuses": {"SYS-001": "Pending"}, "uatStates": {"SYS-001": "Chưa UAT"}}
            )
            with patch.object(server, "STATE_PATH", path):
                server.save_state(expected)
                self.assertEqual(server.load_state(), expected)
                self.assertEqual(json.loads(path.read_text(encoding="utf-8")), expected)

    def test_session_cookie_is_http_only_server_state(self):
        token = server.create_session(now=100)
        cookie = f"other=value; {server.SESSION_COOKIE}={token}"
        self.assertTrue(server.is_authenticated(cookie, now=101))
        self.assertFalse(server.is_authenticated(cookie, now=100 + server.SESSION_TTL_SECONDS + 1))

    def test_delete_session_revokes_cookie(self):
        token = server.create_session(now=100)
        cookie = f"{server.SESSION_COOKIE}={token}"
        server.delete_session(cookie)
        self.assertFalse(server.is_authenticated(cookie, now=101))

    def test_login_rate_limit_fails_closed(self):
        for _ in range(server.LOGIN_MAX_FAILURES):
            server.record_login_failure(now=100)
        self.assertTrue(server.login_rate_limited(now=101))
        self.assertFalse(server.login_rate_limited(now=100 + server.LOGIN_WINDOW_SECONDS + 1))

    def test_read_admin_password_from_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "admin-password"
            path.write_text("file-secret\n", encoding="utf-8")
            with patch.object(server, "ADMIN_PASSWORD_FILE", path), patch.object(
                server, "KEYCHAIN_HELPER", Path(directory) / "missing-helper"
            ), patch.dict(os.environ, {server.ADMIN_PASSWORD_ENV: "env-secret"}, clear=False):
                self.assertEqual(server.read_admin_password(), "file-secret")

    def test_read_admin_password_from_env_when_file_missing(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "admin-password"
            with patch.object(server, "ADMIN_PASSWORD_FILE", path), patch.object(
                server, "KEYCHAIN_HELPER", Path(directory) / "missing-helper"
            ), patch.dict(os.environ, {server.ADMIN_PASSWORD_ENV: "env-secret"}, clear=False):
                self.assertEqual(server.read_admin_password(), "env-secret")

    def test_write_admin_password_persists_file_without_keychain(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "admin-password"
            with patch.object(server, "ADMIN_PASSWORD_FILE", path), patch.object(
                server, "KEYCHAIN_HELPER", Path(directory) / "missing-helper"
            ):
                self.assertTrue(server.write_admin_password("new-secret-1"))
                self.assertEqual(path.read_text(encoding="utf-8"), "new-secret-1\n")
                self.assertEqual(server.read_admin_password(), "new-secret-1")


if __name__ == "__main__":
    unittest.main()