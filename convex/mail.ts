"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";

type GmailConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  from: string;
};

function requireGmailConfig(): GmailConfig {
  const clientId = process.env.GMAIL_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim() ?? "";
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN?.trim() ?? "";
  const from = process.env.GMAIL_FROM?.trim() || "thcslevantambinhthanh@gmail.com";
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("MAIL_NOT_CONFIGURED");
  }
  return { clientId, clientSecret, refreshToken, from };
}

async function gmailAccessToken(config: GmailConfig): Promise<string> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const json = (await response.json()) as { access_token?: string; error?: string };
  if (!response.ok || !json.access_token) {
    throw new Error("MAIL_AUTH_FAILED");
  }
  return json.access_token;
}

function encodeSubject(subject: string): string {
  return `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}

function buildRawMessage(args: {
  from: string;
  to: string;
  subject: string;
  text: string;
}): string {
  const lines = [
    `From: ${args.from}`,
    `To: ${args.to}`,
    `Subject: ${encodeSubject(args.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(args.text, "utf8").toString("base64"),
  ];
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}

export const sendPasswordResetEmail = internalAction({
  args: {
    to: v.string(),
    temporaryPassword: v.string(),
    recipientName: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const config = requireGmailConfig();
    const accessToken = await gmailAccessToken(config);
    const greeting = args.recipientName?.trim()
      ? `Xin chào ${args.recipientName.trim()},`
      : "Xin chào,";
    const text = [
      greeting,
      "",
      "Bạn (hoặc ai đó) đã yêu cầu khôi phục mật khẩu cho tài khoản Lê Văn Tám CRM.",
      "",
      `Mật khẩu tạm thời của bạn là: ${args.temporaryPassword}`,
      "",
      "Hãy đăng nhập bằng mật khẩu tạm, hệ thống sẽ yêu cầu bạn tạo mật khẩu mới ngay.",
      "Nếu bạn không yêu cầu, hãy liên hệ quản trị viên và đổi mật khẩu ngay khi có thể.",
      "",
      "Trân trọng,",
      "THCS Lê Văn Tám",
    ].join("\n");

    const response = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          raw: buildRawMessage({
            from: config.from,
            to: args.to,
            subject: "Mật khẩu tạm — Lê Văn Tám CRM",
            text,
          }),
        }),
      },
    );
    if (!response.ok) {
      throw new Error("PASSWORD_RESET_EMAIL_FAILED");
    }
    return { ok: true as const };
  },
});
