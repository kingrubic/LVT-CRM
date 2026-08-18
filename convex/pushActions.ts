"use node";

import { createSign } from "node:crypto";
import { connect, type ClientHttp2Session } from "node:http2";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  apnsHosts,
  buildApnsPayload,
  buildFcmMessage,
  isApnsDeviceToken,
} from "./pushPayload";

function base64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

async function accessToken(serviceAccount: {
  client_email: string;
  private_key: string;
  token_uri: string;
}) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: serviceAccount.token_uri,
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const assertion = `${unsigned}.${signer.sign(serviceAccount.private_key, "base64url")}`;
  const response = await fetch(serviceAccount.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) throw new Error("FCM_AUTH_FAILED");
  const json = await response.json() as { access_token?: string };
  if (!json.access_token) throw new Error("FCM_AUTH_TOKEN_MISSING");
  return json.access_token;
}

function apnsJwt(keyP8: string, keyId: string, teamId: string) {
  const header = base64Url(JSON.stringify({ alg: "ES256", kid: keyId }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64Url(JSON.stringify({ iss: teamId, iat: now }));
  const unsigned = `${header}.${payload}`;
  const signer = createSign("SHA256");
  signer.update(unsigned);
  const signature = signer.sign({
    key: keyP8.replace(/\\n/g, "\n"),
    dsaEncoding: "ieee-p1363",
  });
  return `${unsigned}.${Buffer.from(signature).toString("base64url")}`;
}

function readApnsConfig() {
  const keyP8 = process.env.APNS_KEY_P8?.trim();
  const keyId = process.env.APNS_KEY_ID?.trim();
  const teamId = process.env.APNS_TEAM_ID?.trim();
  const bundleId = process.env.APNS_BUNDLE_ID?.trim() || "vn.lvt.crm.uikit";
  if (!keyP8 || !keyId || !teamId) return null;
  return {
    keyP8,
    keyId,
    teamId,
    bundleId,
    production: process.env.APNS_PRODUCTION === "true",
  };
}

function connectApns(host: string) {
  return new Promise<ClientHttp2Session>((resolve, reject) => {
    const client = connect(`https://${host}`);
    client.once("error", reject);
    client.once("connect", () => resolve(client));
  });
}

async function postApns(
  client: ClientHttp2Session,
  args: { token: string; jwt: string; bundleId: string; payload: object },
): Promise<{ ok: boolean; status: number; reason?: string }> {
  const body = JSON.stringify(args.payload);
  const result = await new Promise<{ status: number; text: string }>((resolve, reject) => {
    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${args.token}`,
      authorization: `bearer ${args.jwt}`,
      "apns-topic": args.bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    });
    let status = 0;
    let text = "";
    req.setEncoding("utf8");
    req.on("response", (headers) => {
      status = Number(headers[":status"] || 0);
    });
    req.on("data", (chunk) => {
      text += chunk;
    });
    req.on("end", () => resolve({ status, text }));
    req.on("error", reject);
    req.end(body);
  });
  let reason: string | undefined;
  try {
    reason = (JSON.parse(result.text) as { reason?: string }).reason;
  } catch {
    reason = result.text || undefined;
  }
  return { ok: result.status === 200, status: result.status, reason };
}

async function sendApnsAlerts(
  tokens: Array<{ id: Id<"pushTokens">; token: string }>,
  args: { title: string; body: string; kind: string; sourceType: string; sourceId: string },
): Promise<{ sent: number; invalidIds: Array<Id<"pushTokens">> }> {
  const config = readApnsConfig();
  if (!config || !tokens.length) return { sent: 0, invalidIds: [] };
  const jwt = apnsJwt(config.keyP8, config.keyId, config.teamId);
  const payload = buildApnsPayload(args);
  const hosts = apnsHosts(config.production);
  const clients = new Map<string, ClientHttp2Session>();
  const invalidIds: Array<Id<"pushTokens">> = [];
  let sent = 0;
  try {
    const clientFor = async (host: string) => {
      const existing = clients.get(host);
      if (existing) return existing;
      const client = await connectApns(host);
      clients.set(host, client);
      return client;
    };
    for (const row of tokens) {
      let result = await postApns(await clientFor(hosts[0]), {
        token: row.token,
        jwt,
        bundleId: config.bundleId,
        payload,
      });
      if (!result.ok && result.reason === "BadDeviceToken" && hosts[1]) {
        result = await postApns(await clientFor(hosts[1]), {
          token: row.token,
          jwt,
          bundleId: config.bundleId,
          payload,
        });
      }
      if (result.ok) {
        sent += 1;
      } else if (result.status === 410 || /Unregistered|ExpiredToken|BadDeviceToken/i.test(result.reason || "")) {
        invalidIds.push(row.id);
      }
    }
  } finally {
    for (const client of clients.values()) client.close();
  }
  return { sent, invalidIds };
}

export const sendToUsers = internalAction({
  args: {
    userIds: v.array(v.string()),
    title: v.string(),
    body: v.string(),
    kind: v.string(),
    sourceType: v.string(),
    sourceId: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ sent: number; skipped?: string; attempted?: number }> => {
    const tokens: Array<{ id: Id<"pushTokens">; userId: string; token: string }> =
      await ctx.runQuery(internal.push.tokensForUsers, {
        userIds: args.userIds,
      });
    if (!tokens.length) return { sent: 0, skipped: "NO_REGISTERED_TOKENS" };
    const fcmTokens = tokens.filter((row) => !isApnsDeviceToken(row.token));
    const apnsTokens = tokens.filter((row) => isApnsDeviceToken(row.token));
    const invalidIds: Array<Id<"pushTokens">> = [];
    let sent = 0;
    const skipped: string[] = [];

    const rawCredential = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (fcmTokens.length && !rawCredential) skipped.push("FCM_NOT_CONFIGURED");
    if (fcmTokens.length && rawCredential) {
      const credential = JSON.parse(rawCredential) as {
        project_id: string;
        client_email: string;
        private_key: string;
        token_uri: string;
      };
      const bearer = await accessToken(credential);
      for (const row of fcmTokens) {
        const response = await fetch(
          `https://fcm.googleapis.com/v1/projects/${credential.project_id}/messages:send`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${bearer}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              message: buildFcmMessage({
                token: row.token,
                title: args.title,
                body: args.body,
                kind: args.kind,
                sourceType: args.sourceType,
                sourceId: args.sourceId,
              }),
            }),
          },
        );
        if (response.ok) {
          sent += 1;
        } else {
          const errorText = await response.text();
          if (/UNREGISTERED|INVALID_ARGUMENT/i.test(errorText)) invalidIds.push(row.id);
        }
      }
    }

    if (apnsTokens.length && !readApnsConfig()) skipped.push("APNS_NOT_CONFIGURED");
    if (apnsTokens.length && readApnsConfig()) {
      const apns = await sendApnsAlerts(apnsTokens, args);
      sent += apns.sent;
      invalidIds.push(...apns.invalidIds);
    }

    if (invalidIds.length) {
      await ctx.runMutation(internal.push.removeTokens, { ids: invalidIds });
    }
    if (!sent && skipped.length) return { sent: 0, skipped: skipped.join(","), attempted: tokens.length };
    return { sent, attempted: tokens.length, skipped: skipped.length ? skipped.join(",") : undefined };
  },
});
