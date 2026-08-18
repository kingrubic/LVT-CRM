"use node";

import { createSign } from "node:crypto";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

function base64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

function isApnsDeviceToken(token: string) {
  return /^[0-9a-f]{64}$/i.test(token.trim());
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
    const rawCredential = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!rawCredential) return { sent: 0, skipped: "FCM_NOT_CONFIGURED" };
    const credential = JSON.parse(rawCredential) as {
      project_id: string;
      client_email: string;
      private_key: string;
      token_uri: string;
    };
    const tokens: Array<{ id: Id<"pushTokens">; userId: string; token: string }> =
      await ctx.runQuery(internal.push.tokensForUsers, {
      userIds: args.userIds,
      });
        if (!tokens.length) return { sent: 0, skipped: "NO_REGISTERED_TOKENS" };
    const fcmTokens = tokens.filter((row) => !isApnsDeviceToken(row.token));
    if (!fcmTokens.length) return { sent: 0, skipped: "NO_FCM_TOKENS" };
    const bearer = await accessToken(credential);
    const invalidIds = [];
    let sent = 0;
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
            message: {
              token: row.token,
              data: {
                kind: args.kind,
                sourceType: args.sourceType,
                sourceId: args.sourceId,
                title: args.title,
                body: args.body,
              },
              android: {
                priority: "high",
                notification: { channel_id: "lvt_crm_deadlines" },
              },
            },
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
    if (invalidIds.length) {
      await ctx.runMutation(internal.push.removeTokens, { ids: invalidIds });
    }
    return { sent, attempted: tokens.length };
  },
});
