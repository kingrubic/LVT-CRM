export function isApnsDeviceToken(token: string) {
  return /^[0-9a-f]{64}$/i.test(token.trim());
}

export function buildFcmMessage(args: {
  token: string;
  title: string;
  body: string;
  kind: string;
  sourceType: string;
  sourceId: string;
}) {
  return {
    token: args.token,
    data: {
      kind: args.kind,
      sourceType: args.sourceType,
      sourceId: args.sourceId,
      title: args.title,
      body: args.body,
    },
    android: {
      // Data-only + high priority. An empty `android.notification` makes FCM a
      // display message: background Android skips onMessageReceived and shows
      // nothing useful because title/body are missing.
      priority: "high" as const,
    },
  };
}

export function apnsHosts(production: boolean) {
  const productionHost = "api.push.apple.com";
  const sandboxHost = "api.sandbox.push.apple.com";
  return production ? [productionHost, sandboxHost] : [sandboxHost, productionHost];
}

/** Lock-screen / banner payload. iOS ignores data-only FCM for APNs device tokens. */
export function buildApnsPayload(args: {
  title: string;
  body: string;
  kind: string;
  sourceType: string;
  sourceId: string;
}) {
  return {
    aps: {
      alert: {
        title: args.title,
        body: args.body,
      },
      sound: "default",
    },
    kind: args.kind,
    sourceType: args.sourceType,
    sourceId: args.sourceId,
  };
}
