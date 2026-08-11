export function matchDriveMutationRoute(method, requestUrl) {
  const pathname = new URL(requestUrl || '/', 'http://localhost').pathname;
  if (method === 'POST' || method === 'DELETE') {
    const staged = pathname.match(/^\/api\/files\/uploads\/([^/]+)$/);
    if (staged) return { kind: 'staged-upload', id: staged[1], finalize: method === 'POST' };
  }
  if (method === 'DELETE') {
    const cleanup = pathname.match(/^\/api\/files\/cleanup-jobs\/(work|people-review)\/([^/]+)$/);
    if (cleanup) return { kind: 'cleanup-job', purpose: cleanup[1], id: cleanup[2] };
  }
  return null;
}
