export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_MAX_EDGE = 512;
export const AVATAR_ACCEPT = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function isAllowedAvatarFile(file) {
  if (!file) return false;
  const name = String(file.name || '').toLowerCase();
  const type = String(file.type || '').toLowerCase();
  if (ALLOWED_TYPES.has(type)) return true;
  return /\.(png|jpe?g|webp)$/.test(name);
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('INVALID_AVATAR_FILE'));
    };
    image.src = url;
  });
}

function canvasToJpegBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error('INVALID_AVATAR_FILE'));
      else resolve(blob);
    }, 'image/jpeg', quality);
  });
}

/** Resize/compress a picked photo so camera originals fit the 2 MiB Convex Storage cap. */
export async function prepareAvatarFile(file) {
  if (!isAllowedAvatarFile(file)) throw new Error('INVALID_AVATAR_FILE');
  const image = await loadImage(file);
  const largest = Math.max(image.width || 0, image.height || 0);
  if (!largest) throw new Error('INVALID_AVATAR_FILE');
  const scale = largest > AVATAR_MAX_EDGE ? AVATAR_MAX_EDGE / largest : 1;
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('INVALID_AVATAR_FILE');
  context.drawImage(image, 0, 0, width, height);
  let quality = 0.85;
  let blob = await canvasToJpegBlob(canvas, quality);
  while (blob.size > AVATAR_MAX_BYTES && quality > 0.5) {
    quality -= 0.1;
    blob = await canvasToJpegBlob(canvas, quality);
  }
  if (blob.size > AVATAR_MAX_BYTES) throw new Error('AVATAR_FILE_TOO_LARGE');
  return new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
}
