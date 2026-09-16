import { AVATAR_OUTPUT_EDGE, clampSourceRect } from './avatarCrop.js';

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_MAX_EDGE = AVATAR_OUTPUT_EDGE;
export const AVATAR_ACCEPT = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function isAllowedAvatarFile(file) {
  if (!file) return false;
  const name = String(file.name || '').toLowerCase();
  const type = String(file.type || '').toLowerCase();
  if (ALLOWED_TYPES.has(type)) return true;
  return /\.(png|jpe?g|webp)$/.test(name);
}

export function loadAvatarImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('INVALID_AVATAR_FILE'));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error('INVALID_AVATAR_FILE'));
      else resolve(blob);
    }, type, quality);
  });
}

async function encodeCanvasToAvatarFile(canvas) {
  let quality = 0.82;
  let blob = null;
  try {
    blob = await canvasToBlob(canvas, 'image/webp', quality);
  } catch {
    blob = null;
  }
  const useWebp = Boolean(blob && blob.type === 'image/webp' && blob.size > 0);
  if (!useWebp) {
    quality = 0.85;
    blob = await canvasToBlob(canvas, 'image/jpeg', quality);
  }
  const type = useWebp ? 'image/webp' : 'image/jpeg';
  while (blob.size > AVATAR_MAX_BYTES && quality > 0.45) {
    quality -= 0.1;
    blob = await canvasToBlob(canvas, type, quality);
  }
  if (blob.size > AVATAR_MAX_BYTES) throw new Error('AVATAR_FILE_TOO_LARGE');
  return new File([blob], useWebp ? 'avatar.webp' : 'avatar.jpg', { type });
}

/** Draw a 1:1 source rect and encode WebP (JPEG fallback if the browser cannot write WebP). */
export async function encodeCroppedAvatar(image, sourceRect) {
  const width = image.naturalWidth || image.width || 0;
  const height = image.naturalHeight || image.height || 0;
  if (!width || !height) throw new Error('INVALID_AVATAR_FILE');
  const crop = clampSourceRect(width, height, sourceRect);
  const output = Math.max(1, Math.min(AVATAR_MAX_EDGE, Math.round(crop.size)));
  const canvas = document.createElement('canvas');
  canvas.width = output;
  canvas.height = output;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('INVALID_AVATAR_FILE');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, crop.x, crop.y, crop.size, crop.size, 0, 0, output, output);
  return encodeCanvasToAvatarFile(canvas);
}
