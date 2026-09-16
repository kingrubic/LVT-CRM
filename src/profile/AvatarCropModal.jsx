import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  AVATAR_MAX_ZOOM,
  AVATAR_MIN_ZOOM,
  centeredOffset,
  clampOffset,
  clampZoom,
  displaySize,
  offsetAfterZoom,
  sourceCropRect,
} from '../lib/avatarCrop.js';
import { encodeCroppedAvatar, loadAvatarImage } from '../lib/prepareAvatarFile.js';
import { messageFor } from '../lib/appErrorMessage.js';

const NUDGE_PX = 12;

export default function AvatarCropModal({ file, onCancel, onSave }) {
  const titleId = useId();
  const stageRef = useRef(null);
  const dragRef = useRef(null);
  const pointersRef = useRef(new Map());
  const pinchRef = useRef(null);
  const centeredRef = useRef(false);
  const stateRef = useRef({ zoom: 1, offset: { x: 0, y: 0 }, cropSize: 0, image: null });
  const [image, setImage] = useState(null);
  const [cropSize, setCropSize] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const imageWidth = image?.naturalWidth || image?.width || 0;
  const imageHeight = image?.naturalHeight || image?.height || 0;

  useEffect(() => {
    stateRef.current = { zoom, offset, cropSize, image };
  }, [zoom, offset, cropSize, image]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';
    setImage(null);
    setError('');
    (async () => {
      try {
        const loaded = await loadAvatarImage(file);
        if (cancelled) {
          if (loaded.src.startsWith('blob:')) URL.revokeObjectURL(loaded.src);
          return;
        }
        objectUrl = loaded.src;
        setImage(loaded);
        setZoom(1);
        centeredRef.current = false;
      } catch (cause) {
        if (!cancelled) setError(messageFor(cause));
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl.startsWith('blob:')) URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  useEffect(() => {
    const node = stageRef.current;
    if (!node) return undefined;
    const sync = () => setCropSize(node.clientWidth);
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    return () => observer.disconnect();
  }, [image]);

  useEffect(() => {
    if (!imageWidth || !cropSize || centeredRef.current) return;
    const shown = displaySize(imageWidth, imageHeight, cropSize, 1);
    setOffset(centeredOffset(shown.width, shown.height, cropSize));
    setZoom(1);
    centeredRef.current = true;
  }, [imageWidth, imageHeight, cropSize]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const applyZoom = useCallback((nextZoom, focus) => {
    const current = stateRef.current;
    if (!current.image || !current.cropSize) return;
    const width = current.image.naturalWidth || current.image.width;
    const height = current.image.naturalHeight || current.image.height;
    const clamped = clampZoom(nextZoom);
    const nextOffset = offsetAfterZoom({
      imageWidth: width,
      imageHeight: height,
      cropSize: current.cropSize,
      oldZoom: current.zoom,
      newZoom: clamped,
      offsetX: current.offset.x,
      offsetY: current.offset.y,
      focusX: focus?.x,
      focusY: focus?.y,
    });
    setZoom(clamped);
    setOffset(nextOffset);
  }, []);

  const applyPan = useCallback((nextX, nextY) => {
    const current = stateRef.current;
    if (!current.image || !current.cropSize) return;
    const width = current.image.naturalWidth || current.image.width;
    const height = current.image.naturalHeight || current.image.height;
    const shown = displaySize(width, height, current.cropSize, current.zoom);
    setOffset(clampOffset(nextX, nextY, shown.width, shown.height, current.cropSize));
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if (saving) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
        return;
      }
      const current = stateRef.current;
      if (!current.cropSize) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        applyPan(current.offset.x + NUDGE_PX, current.offset.y);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        applyPan(current.offset.x - NUDGE_PX, current.offset.y);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        applyPan(current.offset.x, current.offset.y + NUDGE_PX);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        applyPan(current.offset.x, current.offset.y - NUDGE_PX);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [applyPan, onCancel, saving]);

  useEffect(() => {
    const node = stageRef.current;
    if (!node) return undefined;
    const onWheel = (event) => {
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      const factor = event.deltaY < 0 ? 1.08 : 1 / 1.08;
      applyZoom(stateRef.current.zoom * factor, {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [applyZoom, image]);

  const onPointerDown = (event) => {
    if (saving) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size === 1) {
      dragRef.current = {
        x: event.clientX,
        y: event.clientY,
        ox: offset.x,
        oy: offset.y,
      };
    }
    if (pointersRef.current.size === 2) {
      const points = [...pointersRef.current.values()];
      const dx = points[0].x - points[1].x;
      const dy = points[0].y - points[1].y;
      pinchRef.current = { distance: Math.hypot(dx, dy) || 1, zoom };
      dragRef.current = null;
    }
  };

  const onPointerMove = (event) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size >= 2 && pinchRef.current) {
      const points = [...pointersRef.current.values()];
      const dx = points[0].x - points[1].x;
      const dy = points[0].y - points[1].y;
      const distance = Math.hypot(dx, dy) || 1;
      applyZoom(pinchRef.current.zoom * (distance / pinchRef.current.distance));
      return;
    }
    if (!dragRef.current) return;
    applyPan(
      dragRef.current.ox + (event.clientX - dragRef.current.x),
      dragRef.current.oy + (event.clientY - dragRef.current.y),
    );
  };

  const onPointerUp = (event) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size === 0) dragRef.current = null;
  };

  const save = async () => {
    if (!image || !cropSize || saving) return;
    setSaving(true);
    setError('');
    try {
      const rect = sourceCropRect(imageWidth, imageHeight, cropSize, zoom, offset.x, offset.y);
      const prepared = await encodeCroppedAvatar(image, rect);
      await onSave(prepared);
    } catch (cause) {
      setError(messageFor(cause));
      setSaving(false);
    }
  };

  const shown = cropSize && imageWidth
    ? displaySize(imageWidth, imageHeight, cropSize, zoom)
    : { width: 0, height: 0 };
  const previewUrl = image?.src || '';

  return (
    <div className="avatar-crop-backdrop" role="presentation">
      <section
        className="avatar-crop-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId}>Cắt ảnh</h2>
        <div
          ref={stageRef}
          className="avatar-crop-stage"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {previewUrl ? (
            <img
              className="avatar-crop-image"
              src={previewUrl}
              alt=""
              draggable={false}
              style={{
                width: shown.width,
                height: shown.height,
                transform: `translate(${offset.x}px, ${offset.y}px)`,
              }}
            />
          ) : (
            <p className="avatar-crop-loading">Đang tải ảnh…</p>
          )}
          <div className="avatar-crop-mask" aria-hidden="true" />
          <p className="avatar-crop-hint">
            <span className="avatar-crop-hint-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 3v18M3 12h18M7 7l-4 5 4 5M17 7l4 5-4 5M7 17l5 4 5-4M7 7l5-4 5 4" />
              </svg>
            </span>
            Kéo hoặc dùng phím mũi tên để di chuyển ảnh
          </p>
        </div>
        <div className="avatar-crop-zoom">
          <button
            type="button"
            className="avatar-crop-zoom-btn"
            aria-label="Thu nhỏ"
            disabled={saving || zoom <= AVATAR_MIN_ZOOM}
            onClick={() => applyZoom(zoom - 0.12)}
          >
            −
          </button>
          <input
            className="avatar-crop-slider"
            type="range"
            min={AVATAR_MIN_ZOOM}
            max={AVATAR_MAX_ZOOM}
            step="0.01"
            value={zoom}
            disabled={saving || !image}
            aria-label="Thu phóng"
            onChange={(event) => applyZoom(Number(event.target.value))}
          />
          <button
            type="button"
            className="avatar-crop-zoom-btn"
            aria-label="Phóng to"
            disabled={saving || zoom >= AVATAR_MAX_ZOOM}
            onClick={() => applyZoom(zoom + 0.12)}
          >
            +
          </button>
        </div>
        {error ? <p className="avatar-crop-error" role="alert">{error}</p> : null}
        <footer className="avatar-crop-actions">
          <button type="button" className="avatar-crop-cancel" onClick={onCancel} disabled={saving}>
            Hủy
          </button>
          <button
            type="button"
            className="avatar-crop-save"
            onClick={save}
            disabled={saving || !image}
          >
            {saving ? 'Đang lưu…' : 'Lưu'}
          </button>
        </footer>
      </section>
    </div>
  );
}
