import { useEffect, useRef, useState } from 'react';
import { useAction, useMutation } from 'convex/react';
import { anyApi } from 'convex/server';
import {
  downloadUserImportErrorPdf,
  downloadUserImportTemplate,
  parseUserImportFile,
} from '../lib/userImportExcel.js';

/**
 * Bulk user import panel for Thiết lập người dùng (admin only).
 * Flow: template download → upload xlsx (stored 1h) → validate → preview → commit.
 */
export default function UserBulkImport({ onImported = null } = {}) {
  const fileInputRef = useRef(null);
  const generateUploadUrl = useMutation(anyApi.userImport.generateUploadUrl);
  const registerUpload = useMutation(anyApi.userImport.registerUpload);
  const ensureCodes = useMutation(anyApi.permissionGroups.ensureCodes);
  const validateRows = useAction(anyApi.userImport.validateRows);
  const commitImport = useAction(anyApi.userImport.commit);

  const [busy, setBusy] = useState(null);
  const [feedback, setFeedback] = useState({ type: '', text: '' });
  const [errors, setErrors] = useState([]);
  const [preview, setPreview] = useState([]);
  const [rawRows, setRawRows] = useState([]);
  const [uploadId, setUploadId] = useState(null);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    void ensureCodes({}).catch(() => {});
  }, [ensureCodes]);

  const resetStage = () => {
    setErrors([]);
    setPreview([]);
    setRawRows([]);
    setUploadId(null);
    setFileName('');
    setResult(null);
  };

  const handlePickFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setBusy('upload');
    setFeedback({ type: '', text: '' });
    setResult(null);
    setErrors([]);
    setPreview([]);

    try {
      const parsed = await parseUserImportFile(file);
      if (!parsed.ok) {
        setFeedback({ type: 'error', text: parsed.message });
        setBusy(null);
        return;
      }

      const uploadUrl = await generateUploadUrl({});
      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
        body: file,
      });
      if (!uploadResponse.ok) {
        throw new Error('IMPORT_UPLOAD_FAILED');
      }
      const { storageId } = await uploadResponse.json();
      const registered = await registerUpload({
        storageId,
        fileName: file.name,
        fileSize: file.size,
      });

      setUploadId(registered.uploadId);
      setFileName(file.name);
      setRawRows(parsed.rows);

      setBusy('validate');
      const validation = await validateRows({ rows: parsed.rows });
      if (!validation.ok) {
        setErrors(validation.errors || []);
        setPreview([]);
        setFeedback({
          type: 'error',
          text: `File có ${validation.errors.length} lỗi. Vui lòng sửa và import lại.`,
        });
        setBusy(null);
        return;
      }

      setErrors([]);
      setPreview(validation.preview || []);
      setFeedback({
        type: 'ok',
        text: `File hợp lệ (${validation.preview.length} dòng). Kiểm tra xem trước rồi xác nhận import.`,
      });
    } catch (error) {
      const message = String(error?.message || error || '');
      setFeedback({
        type: 'error',
        text: message.includes('IMPORT_FILE_TOO_LARGE')
          ? 'File vượt quá giới hạn 2 MB.'
          : message.includes('INVALID_IMPORT_FILE')
            ? 'Chỉ chấp nhận file Excel (.xlsx).'
            : 'Không thể xử lý file import. Vui lòng thử lại.',
      });
      resetStage();
    } finally {
      setBusy(null);
    }
  };

  const handleCommit = async () => {
    if (!uploadId || !rawRows.length || !preview.length) return;
    setBusy('commit');
    try {
      const committed = await commitImport({ uploadId, rows: rawRows });
      setResult(committed);
      setPreview([]);
      setFeedback({
        type: 'ok',
        text: `Đã import thành công ${committed.createdCount} tài khoản User. File được giữ trên server 1 giờ.`,
      });
      onImported?.();
    } catch (error) {
      const message = String(error?.message || error || '');
      setFeedback({
        type: 'error',
        text: message.includes('EMAIL_TAKEN')
          ? 'Phát hiện email trùng khi ghi dữ liệu. Không tạo tài khoản nào (đã hoàn tác nếu có).'
          : message.includes('IMPORT_VALIDATION_FAILED')
            ? 'Dữ liệu không còn hợp lệ. Vui lòng import lại file.'
            : 'Import thất bại. Vui lòng thử lại.',
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="user-bulk-import">
      <div className="form-heading">
        <strong>Import người dùng hàng loạt</strong>
      </div>
      <p className="user-bulk-import-help">
        Chỉ tạo tài khoản vai trò User. Tải file mẫu, điền đủ cột, rồi import file .xlsx (tối đa 2 MB).
        Mã phòng ban / chức vụ / nhóm quyền phải khớp hệ thống (không phân biệt hoa thường).
      </p>
      <div className="user-bulk-import-actions">
        <button type="button" className="secondary-button" onClick={downloadUserImportTemplate} disabled={Boolean(busy)}>
          Tải file nhập liệu mẫu
        </button>
        <button type="button" className="primary-button" onClick={handlePickFile} disabled={Boolean(busy)}>
          {busy === 'upload' || busy === 'validate' ? 'Đang xử lý…' : 'Import file nhập liệu'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          hidden
          onChange={handleFileChange}
        />
      </div>

      {feedback.text ? (
        <div className={`feedback ${feedback.type}`} role="status" aria-live="polite">
          {feedback.text}
        </div>
      ) : null}

      {errors.length > 0 ? (
        <div className="user-bulk-import-errors">
          <div className="form-heading">
            <strong>Báo cáo lỗi ({errors.length})</strong>
            <button
              type="button"
              className="text-button"
              onClick={() => downloadUserImportErrorPdf(errors, { fileName })}
            >
              Tải PDF báo cáo lỗi
            </button>
          </div>
          <div className="user-table wide-table" aria-label="Lỗi import người dùng">
            <div className="user-table-head user-table-head-3">
              <span>Dòng</span>
              <span>Lỗi</span>
              <span>Chi tiết</span>
            </div>
            {errors.map((error, index) => (
              <div className="user-row user-row-3" key={`${error.rowNumber}-${index}`}>
                <span>{error.rowNumber > 0 ? error.rowNumber : '—'}</span>
                <strong>{error.message}</strong>
                <span>{error.detail || '—'}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {preview.length > 0 ? (
        <div className="user-bulk-import-preview">
          <div className="form-heading">
            <strong>Xem trước ({preview.length} tài khoản)</strong>
            <button type="button" className="text-button" onClick={resetStage} disabled={Boolean(busy)}>
              Hủy
            </button>
          </div>
          <div className="user-table wide-table" aria-label="Xem trước import người dùng">
            <div className="user-table-head user-table-head-5">
              <span>Dòng</span>
              <span>Họ tên / Email</span>
              <span>PB / Chức vụ</span>
              <span>Nhóm quyền</span>
              <span>Vai trò</span>
            </div>
            {preview.map((row) => (
              <div className="user-row user-row-5" key={row.rowNumber}>
                <span>{row.rowNumber}</span>
                <div>
                  <strong>{row.name}</strong>
                  <span>{row.email}</span>
                </div>
                <div className="meta-stack">
                  <span>
                    {row.departmentName} ({row.departmentCode})
                  </span>
                  <span>
                    {row.positionName} ({row.positionCode})
                  </span>
                </div>
                <span>
                  {row.permissionGroupName} ({row.permissionGroupCode})
                </span>
                <span className="role-tag">User</span>
              </div>
            ))}
          </div>
          <button type="button" className="primary-button" onClick={handleCommit} disabled={Boolean(busy)}>
            {busy === 'commit' ? 'Đang import…' : `Xác nhận import ${preview.length} tài khoản`}
          </button>
        </div>
      ) : null}

      {result ? (
        <div className="user-bulk-import-result">
          <div className="form-heading">
            <strong>Kết quả import ({result.createdCount})</strong>
          </div>
          <div className="user-table wide-table" aria-label="Kết quả import người dùng">
            <div className="user-table-head user-table-head-2">
              <span>Họ tên</span>
              <span>Email</span>
            </div>
            {result.users.map((user) => (
              <div className="user-row user-row-2" key={user.email}>
                <strong>{user.name}</strong>
                <span>{user.email}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
