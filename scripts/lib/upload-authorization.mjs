import { anyApi } from 'convex/server';
import { FileHttpError } from './file-http-errors.mjs';

export function uploadApiForPurpose(purpose, api = anyApi) {
  if (purpose === 'work') return api.work;
  if (purpose === 'people-review') return api.peopleReview;
  throw new FileHttpError(400, 'INVALID_UPLOAD_PURPOSE');
}

export async function authorizeUpload(client, purpose, api = anyApi) {
  const moduleApi = uploadApiForPurpose(purpose, api);
  try {
    return await client.query(moduleApi.authorizeFileUpload, {});
  } catch (error) {
    throw new FileHttpError(403, 'FILE_ACCESS_DENIED', error);
  }
}
