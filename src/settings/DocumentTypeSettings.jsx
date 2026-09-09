import React, { useEffect, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { messageFor } from '../lib/appErrorMessage';

function useFeedback() {
  const [pending, setPending] = useState('');
  const [feedback, setFeedback] = useState({ type: '', text: '' });
  const run = async (name, operation, success) => {
    setPending(name);
    setFeedback({ type: '', text: '' });
    try {
      await operation();
      setFeedback({ type: 'success', text: success });
      return true;
    } catch (error) {
      console.error('CRM operation failed', name, error);
      setFeedback({ type: 'error', text: messageFor(error) });
      return false;
    } finally {
      setPending('');
    }
  };
  return { pending, feedback, run };
}

export default function DocumentTypeSettings() {
  const data = useQuery(anyApi.documentTypes.list);
  const create = useMutation(anyApi.documentTypes.create);
  const update = useMutation(anyApi.documentTypes.update);
  const remove = useMutation(anyApi.documentTypes.remove);
  const ensureDefaults = useMutation(anyApi.documentTypes.ensureDefaults);
  const [form, setForm] = useState({ name: '', code: '' });
  const [editing, setEditing] = useState(null);
  const { pending, feedback, run } = useFeedback();

  useEffect(() => {
    void ensureDefaults({}).catch(() => {});
  }, [ensureDefaults]);

  const types = (data?.documentTypes || []).filter((item) => item.active);

  const submit = async (event) => {
    event.preventDefault();
    if (editing) {
      const ok = await run(
        'save',
        () => update({ id: editing._id, name: form.name, code: form.code }),
        'Đã cập nhật loại văn bản.',
      );
      if (ok) {
        setEditing(null);
        setForm({ name: '', code: '' });
      }
      return;
    }
    const ok = await run(
      'save',
      () => create({ name: form.name, code: form.code }),
      'Đã thêm loại văn bản.',
    );
    if (ok) setForm({ name: '', code: '' });
  };

  if (data === undefined) return <section className="admin-view"><p className="muted">Đang tải loại văn bản…</p></section>;

  return (
    <section className="admin-view modern-management">
      <div className="page-heading">
        <div>
          <span className="status-pill blue">Loại văn bản</span>
          <h2>Thiết lập loại văn bản</h2>
          <p>
            Dùng khi đính kèm file lúc tạo công việc hoặc nộp bằng chứng hoàn thành.
            Hệ thống tạo sẵn Kế hoạch, Biên bản và Báo cáo; có thể thêm loại khác.
          </p>
        </div>
      </div>
      <div className={`feedback ${feedback.type}`} role="status" aria-live="polite">
        {feedback.text}
      </div>
      <form className="admin-form" onSubmit={submit}>
        <div className="form-heading">
          <strong>{editing ? `Sửa: ${editing.name}` : 'Thêm loại văn bản'}</strong>
          {editing ? (
            <button type="button" className="text-button" onClick={() => { setEditing(null); setForm({ name: '', code: '' }); }}>
              Hủy
            </button>
          ) : null}
        </div>
        <label>
          Tên loại văn bản
          <input required maxLength={120} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
        </label>
        <label>
          Mã
          <input required maxLength={20} value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} />
        </label>
        <button className="primary-button" disabled={Boolean(pending)}>
          {editing ? 'Lưu loại văn bản' : '+ Thêm loại văn bản'}
        </button>
      </form>
      <div className="card-list">
        {types.map((item) => (
          <article className="mgmt-card" key={item._id}>
            <div className="mgmt-card-head">
              <div>
                <strong>{item.name}</strong>
                <span className="code-tag">{item.code}</span>
              </div>
              <div className="row-actions">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(item);
                    setForm({ name: item.name, code: item.code });
                  }}
                  disabled={Boolean(pending)}
                >
                  Sửa
                </button>
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => {
                    if (window.confirm(`Xóa loại văn bản ${item.name}? Chỉ xóa được khi chưa có file đang dùng loại này.`)) {
                      void run(`del-${item._id}`, () => remove({ id: item._id }), 'Đã xóa loại văn bản.');
                    }
                  }}
                  disabled={Boolean(pending)}
                >
                  Xóa
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
