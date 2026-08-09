#!/usr/bin/env node
/**
 * One-time Desktop OAuth to obtain GMAIL_REFRESH_TOKEN for forgot-password mail.
 *
 * Usage (from repo root):
 *   node scripts/gmail-oauth-setup.mjs
 *   node scripts/gmail-oauth-setup.mjs ./client_secret_….json
 *
 * Sign in as thcslevantambinhthanh@gmail.com, then set Convex env:
 *   GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN / GMAIL_FROM
 */
import { createServer } from "node:http";
import { readFileSync, readdirSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCOPE = "https://www.googleapis.com/auth/gmail.send";
const LISTEN_HOST = "127.0.0.1";
const LISTEN_PORT = 8765;
const REDIRECT_URI = `http://localhost:${LISTEN_PORT}`;

function findClientSecretPath(explicit) {
  if (explicit) return path.resolve(explicit);
  const matches = readdirSync(projectRoot).filter(
    (name) => name.startsWith("client_secret") && name.endsWith(".json"),
  );
  if (matches.length === 0) {
    throw new Error(
      "Không tìm thấy client_secret*.json ở root. Truyền đường dẫn: node scripts/gmail-oauth-setup.mjs ./client_secret_….json",
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `Có nhiều client_secret*.json (${matches.join(", ")}). Truyền đường dẫn cụ thể.`,
    );
  }
  return path.join(projectRoot, matches[0]);
}

function loadInstalledCredentials(filePath) {
  const raw = JSON.parse(readFileSync(filePath, "utf8"));
  const installed = raw.installed ?? raw.web;
  if (!installed?.client_id || !installed?.client_secret) {
    throw new Error(`File không có installed.client_id / client_secret: ${filePath}`);
  }
  return {
    clientId: installed.client_id,
    clientSecret: installed.client_secret,
    filePath,
  };
}

function openBrowser(url) {
  const platform = process.platform;
  if (platform === "darwin") spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
  else if (platform === "win32") spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
  else spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
}

function waitForCode() {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      try {
        const url = new URL(req.url ?? "/", `http://${LISTEN_HOST}:${LISTEN_PORT}`);
        if (url.pathname !== "/") {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        const error = url.searchParams.get("error");
        const code = url.searchParams.get("code");
        if (error) {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end(`<h1>OAuth lỗi</h1><p>${error}</p>`);
          server.close();
          reject(new Error(`OAuth error: ${error}`));
          return;
        }
        if (!code) {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end("<h1>Thiếu code</h1>");
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<h1>Đã nhận mã OAuth</h1><p>Có thể đóng tab này và quay lại terminal.</p>");
        server.close();
        resolve(code);
      } catch (err) {
        server.close();
        reject(err);
      }
    });
    server.listen(LISTEN_PORT, LISTEN_HOST, () => {
      console.log(`Đang chờ redirect OAuth tại ${REDIRECT_URI} …`);
    });
    server.on("error", reject);
  });
}

async function exchangeCode({ clientId, clientSecret, code }) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(`Token exchange failed: ${JSON.stringify(json)}`);
  }
  if (!json.refresh_token) {
    throw new Error(
      "Không nhận được refresh_token. Thu hồi quyền app tại https://myaccount.google.com/permissions rồi chạy lại (cần prompt=consent).",
    );
  }
  return json;
}

async function main() {
  const creds = loadInstalledCredentials(findClientSecretPath(process.argv[2]));
  console.log(`Dùng credentials: ${creds.filePath}`);
  console.log("Đăng nhập đúng tài khoản: thcslevantambinhthanh@gmail.com");

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", creds.clientId);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPE);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");

  const codePromise = waitForCode();
  console.log("\nMở trình duyệt:\n", authUrl.toString(), "\n");
  openBrowser(authUrl.toString());

  const code = await codePromise;
  const tokens = await exchangeCode({
    clientId: creds.clientId,
    clientSecret: creds.clientSecret,
    code,
  });

  console.log("\n=== Đặt các biến môi trường Convex (không commit) ===\n");
  console.log(`GMAIL_CLIENT_ID=${creds.clientId}`);
  console.log(`GMAIL_CLIENT_SECRET=${creds.clientSecret}`);
  console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
  console.log("GMAIL_FROM=thcslevantambinhthanh@gmail.com");
  console.log("\nVí dụ (self-hosted):\n  ./scripts/lvt-convex-self-hosted-env.sh npx convex env set GMAIL_REFRESH_TOKEN '<token>'\n");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
