import React, { useState } from 'react';
import { useAction } from 'convex/react';
import { anyApi } from 'convex/server';
import { messageFor } from '../lib/appErrorMessage.js';

export default function ChangePasswordPanel() {
  const changeOwnPassword = useAction(anyApi.users.changeOwnPassword);
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setFeedback('');
    if (!currentPassword) return setFeedback('Vui lòng nhập mật khẩu hiện tại.');
    if (password.length < 8) return setFeedback('Mật khẩu mới phải có ít nhất 8 ký tự.');
    if (password !== confirmation) return setFeedback('Xác nhận mật khẩu không khớp.');
    setPending(true);
    try {
      await changeOwnPassword({ currentPassword, newPassword: password });
      setFeedback('Đã đổi mật khẩu thành công.');
      setCurrentPassword('');
      setPassword('');
      setConfirmation('');
    } catch (error) {
      setFeedback(messageFor(error));
    } finally {
      setPending(false);
    }
  };

  const feedbackType = feedback === 'Đã đổi mật khẩu thành công.' ? 'success' : 'error';

  return (
    <form className="profile-paper profile-security" onSubmit={submit}>
      <header className="profile-panel-heading">
        <span className="profile-shield" aria-hidden="true">✓</span>
        <div>
          <span className="profile-eyebrow">BẢO MẬT TÀI KHOẢN</span>
          <h3>Đổi mật khẩu</h3>
          <p>Sử dụng ít nhất 8 ký tự và không chia sẻ mật khẩu qua kênh công khai.</p>
        </div>
      </header>

      <label className="profile-field">
        <span>Mật khẩu hiện tại</span>
        <input required type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
      </label>
      <label className="profile-field">
        <span>Mật khẩu mới</span>
        <input required minLength={8} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <label className="profile-field">
        <span>Xác nhận mật khẩu</span>
        <input required minLength={8} type="password" autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
      </label>

      <div className="profile-password-hint">
        <span className={password.length >= 8 ? 'is-ready' : ''} />
        <p>{password.length >= 8 ? 'Độ dài mật khẩu đã đạt yêu cầu.' : 'Mật khẩu cần có tối thiểu 8 ký tự.'}</p>
      </div>

      {feedback ? (
        <p className={`profile-feedback ${feedbackType}`} role="status" aria-live="polite">
          {feedback}
        </p>
      ) : null}

      <button className="work-primary-button profile-submit" disabled={pending}>
        {pending ? 'Đang cập nhật…' : 'Đổi mật khẩu'}
      </button>
    </form>
  );
}
