export const AVATAR_MIN_ZOOM = 1;
export const AVATAR_MAX_ZOOM = 4;
export const AVATAR_OUTPUT_EDGE = 512;

export function coverScale(imageWidth, imageHeight, cropSize) {
  const smallest = Math.min(imageWidth, imageHeight);
  if (!(smallest > 0) || !(cropSize > 0)) return 1;
  return cropSize / smallest;
}

export function clampZoom(zoom) {
  const value = Number(zoom);
  if (!Number.isFinite(value)) return AVATAR_MIN_ZOOM;
  return Math.min(AVATAR_MAX_ZOOM, Math.max(AVATAR_MIN_ZOOM, value));
}

export function displaySize(imageWidth, imageHeight, cropSize, zoom) {
  const scale = coverScale(imageWidth, imageHeight, cropSize) * clampZoom(zoom);
  return {
    width: imageWidth * scale,
    height: imageHeight * scale,
    scale,
  };
}

export function clampOffset(offsetX, offsetY, displayWidth, displayHeight, cropSize) {
  const minX = Math.min(0, cropSize - displayWidth);
  const minY = Math.min(0, cropSize - displayHeight);
  return {
    x: Math.min(0, Math.max(minX, offsetX)),
    y: Math.min(0, Math.max(minY, offsetY)),
  };
}

export function centeredOffset(displayWidth, displayHeight, cropSize) {
  return clampOffset(
    (cropSize - displayWidth) / 2,
    (cropSize - displayHeight) / 2,
    displayWidth,
    displayHeight,
    cropSize,
  );
}

export function offsetAfterZoom({
  imageWidth,
  imageHeight,
  cropSize,
  oldZoom,
  newZoom,
  offsetX,
  offsetY,
  focusX,
  focusY,
}) {
  const nextZoom = clampZoom(newZoom);
  const oldScale = coverScale(imageWidth, imageHeight, cropSize) * clampZoom(oldZoom);
  const next = displaySize(imageWidth, imageHeight, cropSize, nextZoom);
  if (!(oldScale > 0)) {
    return centeredOffset(next.width, next.height, cropSize);
  }
  const anchorX = focusX == null ? cropSize / 2 : focusX;
  const anchorY = focusY == null ? cropSize / 2 : focusY;
  return clampOffset(
    anchorX - ((anchorX - offsetX) / oldScale) * next.scale,
    anchorY - ((anchorY - offsetY) / oldScale) * next.scale,
    next.width,
    next.height,
    cropSize,
  );
}

export function sourceCropRect(imageWidth, imageHeight, cropSize, zoom, offsetX, offsetY) {
  const { scale } = displaySize(imageWidth, imageHeight, cropSize, zoom);
  const size = cropSize / scale;
  return clampSourceRect(imageWidth, imageHeight, {
    x: -offsetX / scale,
    y: -offsetY / scale,
    size,
  });
}

export function clampSourceRect(imageWidth, imageHeight, rect) {
  const maxSquare = Math.min(imageWidth, imageHeight);
  const size = Math.min(Math.max(1, rect.size), maxSquare);
  return {
    x: Math.min(Math.max(0, rect.x), Math.max(0, imageWidth - size)),
    y: Math.min(Math.max(0, rect.y), Math.max(0, imageHeight - size)),
    size,
  };
}
