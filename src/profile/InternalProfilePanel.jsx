import React, { useRef, useState } from 'react';
import { useAction, useMutation } from 'convex/react';
import { anyApi } from 'convex/server';
import { AVATAR_ACCEPT, isAllowedAvatarFile } from '../lib/prepareAvatarFile.js';
import { avatarSessionFromCommit } from '../lib/profileAvatar.js';
import { messageFor } from '../lib/appErrorMessage.js';
import StarRating from '../lib/StarRating.jsx';
import AvatarCropModal from './AvatarCropModal.jsx';
import { useOwnAvatarContext } from './useOwnAvatar.jsx';

const ROLE_LABELS = { admin: 'Administrator', moderator: 'Moderator', user: 'User' };

export default function InternalProfilePanel({ session }) {
  const generateAvatarUploadUrl = useMutation(anyApi.userAvatar.generateUploadUrl);
  const setOwnAvatar = useAction(anyApi.userAvatar.setOwnAvatar);
  const clearOwnAvatar = useMutation(anyApi.userAvatar.clearOwnAvatar);
  const { user, department, permissionGroup, position, isOperationalManager } = session;
  const {
    avatarUrl,
    hasAvatar,
    initials,
    setAvatarOverlay,
    showAvatarBlob,
  } = useOwnAvatarContext();
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarFeedback, setAvatarFeedback] = useState('');
  const [avatarCropFile, setAvatarCropFile] = useState(null);
  const avatarInputRef = useRef(null);

  const displayName = user.name || user.email || 'Chưa đặt tên';
  const roleLabel = ROLE_LABELS[user.role] || user.role;

  const resetAvatarPicker = () => {
    if (avatarInputRef.current) avatarInputRef.current.value = '';
  };

  const openAvatarCrop = (file) => {
    setAvatarFeedback('');
    if (!isAllowedAvatarFile(file)) {
      setAvatarFeedback(messageFor(new Error('INVALID_AVATAR_FILE')));
      resetAvatarPicker();
      return;
    }
    setAvatarCropFile(file);
    resetAvatarPicker();
  };

  const cancelAvatarCrop = () => {
    setAvatarCropFile(null);
    resetAvatarPicker();
  };

  const uploadPreparedAvatar = async (prepared) => {
    setAvatarCropFile(null);
    setAvatarFeedback('');
    setAvatarBusy(true);
    try {
      const uploadUrl = await generateAvatarUploadUrl({});
      const uploaded = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': prepared.type || 'image/webp' },
        body: prepared,
      });
      if (!uploaded.ok) throw new Error('AVATAR_UPLOAD_FAILED');
      const { storageId } = await uploaded.json();
      if (!storageId) throw new Error('AVATAR_UPLOAD_FAILED');
      const committed = await setOwnAvatar({ storageId, fileName: prepared.name, fileSize: prepared.size });
      showAvatarBlob(prepared);
      setAvatarOverlay(avatarSessionFromCommit(committed, `local-${Date.now()}`));
      setAvatarFeedback('Đã cập nhật ảnh đại diện.');
    } catch (error) {
      setAvatarFeedback(messageFor(error));
    } finally {
      setAvatarBusy(false);
      resetAvatarPicker();
    }
  };

  const removeAvatar = async () => {
    setAvatarFeedback('');
    setAvatarBusy(true);
    try {
      const committed = await clearOwnAvatar({});
      showAvatarBlob(null);
      setAvatarOverlay(avatarSessionFromCommit(committed));
      setAvatarFeedback('Đã gỡ ảnh đại diện.');
    } catch (error) {
      setAvatarFeedback(messageFor(error));
    } finally {
      setAvatarBusy(false);
    }
  };

  return (
    <>
      <article className="profile-paper profile-overview">
        <header className="profile-identity">
          <button
            type="button"
            className={`profile-avatar ${avatarUrl ? 'has-photo' : ''}`}
            disabled={avatarBusy}
            onClick={() => avatarInputRef.current?.click()}
            aria-label="Đổi ảnh đại diện"
          >
            {avatarUrl ? <img src={avatarUrl} alt="" /> : (initials || 'LV')}
          </button>
          <input
            ref={avatarInputRef}
            className="profile-avatar-input"
            type="file"
            accept={AVATAR_ACCEPT}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) openAvatarCrop(file);
            }}
          />
          <div>
            <span className="profile-eyebrow">HỒ SƠ NỘI BỘ</span>
            <h3>{displayName}</h3>
            <p>{user.email || 'Chưa có email đăng nhập'}</p>
            <div className="profile-avatar-actions">
              <button type="button" disabled={avatarBusy} onClick={() => avatarInputRef.current?.click()}>
                {avatarBusy ? 'Đang cập nhật…' : 'Đổi ảnh đại diện'}
              </button>
              {hasAvatar ? (
                <button type="button" disabled={avatarBusy} onClick={removeAvatar}>
                  Gỡ ảnh
                </button>
              ) : null}
            </div>
            {avatarFeedback ? (
              <p className={`profile-avatar-feedback ${avatarFeedback.startsWith('Đã') ? 'success' : 'error'}`} role="status">
                {avatarFeedback}
              </p>
            ) : null}
          </div>
          <span className={`profile-role profile-role-${user.role}`}>{roleLabel}</span>
        </header>

        <dl className="profile-modern-dl">
          <div>
            <dt><i>01</i> Họ tên</dt>
            <dd>{displayName}</dd>
          </div>
          <div>
            <dt><i>02</i> Email đăng nhập</dt>
            <dd>{user.email || '—'}</dd>
          </div>
          <div>
            <dt><i>03</i> Vai trò</dt>
            <dd>{roleLabel}</dd>
          </div>
          <div>
            <dt><i>04</i> Phòng ban</dt>
            <dd>{department?.name || 'Chưa gán'}</dd>
          </div>
          <div>
            <dt><i>05</i> Chức vụ</dt>
            <dd>
              {position ? (
                <span className="profile-position">
                  {position.name}
                  <StarRating level={position.level} />
                </span>
              ) : (
                'Chưa gán'
              )}
            </dd>
          </div>
          {!isOperationalManager && (
            <div>
              <dt><i>06</i> Nhóm quyền</dt>
              <dd>{permissionGroup?.name || 'Chưa gán'}</dd>
            </div>
          )}
        </dl>

        <footer className="profile-help">
          <span aria-hidden="true">?</span>
          <p><strong>Cần hỗ trợ tài khoản?</strong> Liên hệ Administrator để được đặt lại mật khẩu an toàn.</p>
        </footer>
      </article>
      {avatarCropFile ? (
        <AvatarCropModal
          file={avatarCropFile}
          onCancel={cancelAvatarCrop}
          onSave={uploadPreparedAvatar}
        />
      ) : null}
    </>
  );
}
