import React, { useMemo, useState } from 'react';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import './peopleReview.css';

const ACCEPTED = ['pdf', 'png', 'jpg', 'jpeg'];

function todayIso() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function formatDateTime(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleString('vi-VN', { hour12: false });
}

function currentSchoolYear() {
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const start = month >= 9 ? year : year - 1;
  return `${start}-${start + 1}`;
}

function currentQuarter() {
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return { year: now.getUTCFullYear(), quarter: Math.floor(now.getUTCMonth() / 3) + 1 };
}

function periodLabel(file) {
  if (file.kind === 'quarterly') return `Quý ${file.quarter}/${file.year}`;
  if (file.kind === 'civil_servant') return `Năm học ${file.schoolYear}`;
  if (file.kind === 'boarding') return `HK${file.semester} · ${file.schoolYear}`;
  return file.periodKey;
}

async function uploadDriveFile(fetchAccessToken, file) {
  const token = await fetchAccessToken({ forceRefreshToken: false });
  if (!token) throw new Error('AUTH_REQUIRED');
  const response = await fetch('/api/files/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': file.type || 'application/octet-stream',
      'X-File-Name': encodeURIComponent(file.name),
    },
    body: file,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.driveFileId) throw new Error(`UPLOAD_FAILED:${response.status}`);
  return result;
}

async function deleteDriveFile(fetchAccessToken, driveFileId) {
  if (!driveFileId) return;
  try {
    const token = await fetchAccessToken({ forceRefreshToken: false });
    if (!token) return;
    await fetch(`/api/files/drive/${encodeURIComponent(driveFileId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // best-effort
  }
}

function PrivateFileButton({ kind, fileId, fileName, className = 'pr-file-link' }) {
  const { fetchAccessToken } = useConvexAuth();
  const [opening, setOpening] = useState(false);
  const open = async () => {
    if (opening) return;
    setOpening(true);
    try {
      const token = await fetchAccessToken({ forceRefreshToken: false });
      if (!token) throw new Error('AUTH_REQUIRED');
      const response = await fetch(
        `/api/people-review/files/${kind}/${encodeURIComponent(fileId)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok) throw new Error(`DOWNLOAD_FAILED:${response.status}`);
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = window.document.createElement('a');
      anchor.href = objectUrl;
      anchor.target = '_blank';
      anchor.rel = 'noreferrer';
      anchor.download = fileName || '';
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      console.error(error);
      window.alert('Không thể mở tệp. Vui lòng thử lại.');
    } finally {
      setOpening(false);
    }
  };
  return (
    <button type="button" className={className} onClick={() => void open()} disabled={opening}>
      {opening ? 'Đang mở…' : `↗ ${fileName || 'Mở tệp'}`}
    </button>
  );
}

function DateRangeFilter({ from, to, onChange, label }) {
  return (
    <div className="pr-date-filter">
      <span>{label}</span>
      <label>
        Từ
        <input type="date" value={from} onChange={(event) => onChange({ from: event.target.value, to })} />
      </label>
      <label>
        Đến
        <input type="date" value={to} onChange={(event) => onChange({ from, to: event.target.value })} />
      </label>
    </div>
  );
}

function FaultList({ faults }) {
  if (!faults.length) return <div className="pr-empty">Không có ghi nhận lỗi trong khoảng thời gian này.</div>;
  return (
    <div className="pr-fault-list">
      {faults.map((fault) => (
        <article className="pr-fault-card" key={fault._id}>
          <header>
            <strong>{formatDate(fault.violationDate)}</strong>
            <span>Ghi bởi {fault.recordedByName}</span>
          </header>
          <p>{fault.reason}</p>
          <PrivateFileButton kind="fault" fileId={fault._id} fileName={fault.fileName} />
        </article>
      ))}
    </div>
  );
}

function WorkKpiPanel({ workKpi }) {
  return (
    <div className="pr-kpi">
      <div className="pr-kpi-grid">
        <div><strong>{workKpi.total}</strong><span>Tổng việc</span></div>
        <div className="on-time"><strong>{workKpi.onTime}</strong><span>Đúng hạn</span></div>
        <div className="late"><strong>{workKpi.late}</strong><span>Trễ hạn</span></div>
        <div className="incomplete"><strong>{workKpi.incomplete}</strong><span>Chưa hoàn thành</span></div>
      </div>
      <div className="pr-task-list">
        {workKpi.tasks.length ? workKpi.tasks.map((task) => (
          <div className={`pr-task-row status-${task.status}`} key={task._id}>
            <div>
              <strong>{task.content}</strong>
              <small>Hạn {formatDate(task.deadline)}</small>
            </div>
            <span>
              {task.status === 'completed' ? 'Đúng hạn' : task.status === 'completed_late' ? 'Trễ hạn' : 'Chưa hoàn thành'}
              {task.qualityPercent != null ? ` · ${task.qualityPercent}%` : ''}
            </span>
          </div>
        )) : <div className="pr-empty">Không có công việc trong khoảng này.</div>}
      </div>
    </div>
  );
}

function EvalBlock({ title, options, value, onChange, file }) {
  return (
    <section className="pr-eval-block">
      <header>
        <h4>{title}</h4>
        {options.length ? (
          <select value={value} onChange={(event) => onChange(event.target.value)}>
            {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        ) : null}
      </header>
      {!file ? (
        <div className="pr-empty">Chưa có file đánh giá.</div>
      ) : (
        <div className="pr-eval-file">
          <PrivateFileButton kind="evaluation" fileId={file._id} fileName={file.fileName} />
          <small>
            Cập nhật {formatDateTime(file.lastUploadedAt)}
            {file.versionCount > 1 ? ` · Đã đổi ${file.versionCount - 1} lần` : ''}
            {file.uploadedByName ? ` · Upload bởi ${file.uploadedByName}` : ''}
          </small>
          {file.texts.length ? (
            <div className="pr-text-list">
              <strong>{file.texts.length} đánh giá text</strong>
              {file.texts.map((text) => (
                <article key={text._id}>
                  <header>
                    <span>{text.evaluatorName}</span>
                    <time>{formatDateTime(text.createdAt)}</time>
                  </header>
                  <p>{text.content}</p>
                </article>
              ))}
            </div>
          ) : (
            <small className="pr-muted">Chưa có đánh giá text từ ban giám hiệu.</small>
          )}
        </div>
      )}
    </section>
  );
}

function EvaluationViewer({ evaluations, boardingOptions }) {
  const quarterly = evaluations.filter((item) => item.kind === 'quarterly');
  const civil = evaluations.filter((item) => item.kind === 'civil_servant');
  const boarding = evaluations.filter((item) => item.kind === 'boarding');
  const [quarterKey, setQuarterKey] = useState(quarterly[0]?.periodKey || '');
  const [civilKey, setCivilKey] = useState(civil[0]?.periodKey || '');
  const [boardingKey, setBoardingKey] = useState(boarding[0]?.periodKey || '');
  const selectedQuarter = quarterly.find((item) => item.periodKey === quarterKey) || quarterly[0] || null;
  const selectedCivil = civil.find((item) => item.periodKey === civilKey) || civil[0] || null;
  const selectedBoarding = boarding.find((item) => item.periodKey === boardingKey) || boarding[0] || null;

  return (
    <div className="pr-eval-viewer">
      <EvalBlock
        title="Đánh giá theo quý"
        options={quarterly.map((item) => ({ value: item.periodKey, label: periodLabel(item) }))}
        value={selectedQuarter?.periodKey || ''}
        onChange={setQuarterKey}
        file={selectedQuarter}
      />
      <EvalBlock
        title="Đánh giá viên chức"
        options={civil.map((item) => ({ value: item.periodKey, label: periodLabel(item) }))}
        value={selectedCivil?.periodKey || ''}
        onChange={setCivilKey}
        file={selectedCivil}
      />
      {boardingOptions.length ? (
        <EvalBlock
          title="Đánh giá công tác bán trú"
          options={boarding.map((item) => ({ value: item.periodKey, label: periodLabel(item) }))}
          value={selectedBoarding?.periodKey || ''}
          onChange={setBoardingKey}
          file={selectedBoarding}
        />
      ) : null}
    </div>
  );
}

function FaultModal({ person, onClose, onSaved }) {
  const { fetchAccessToken } = useConvexAuth();
  const recordFault = useMutation(anyApi.peopleReview.recordFault);
  const [violationDate, setViolationDate] = useState(todayIso());
  const [reason, setReason] = useState('');
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    if (!file) return setError('Vui lòng đính kèm ảnh/PDF bằng chứng.');
    setSaving(true);
    setError('');
    try {
      const uploaded = await uploadDriveFile(fetchAccessToken, file);
      await recordFault({
        targetUserId: person._id,
        violationDate,
        reason,
        driveFileId: uploaded.driveFileId,
        driveChecksum: uploaded.driveChecksum,
        fileName: file.name,
        fileType: file.type || 'application/octet-stream',
        fileSize: file.size,
      });
      onSaved();
      onClose();
    } catch {
      setError('Không thể ghi nhận lỗi. Kiểm tra quyền và tệp đính kèm.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pr-modal-backdrop" role="presentation">
      <form className="pr-modal" onSubmit={submit}>
        <button type="button" className="pr-modal-close" onClick={onClose} aria-label="Đóng">×</button>
        <span className="pr-kicker">Ghi nhận lỗi</span>
        <h3>{person.name}</h3>
        <label className="pr-field-label">Ngày vi phạm</label>
        <input type="date" value={violationDate} max={todayIso()} onChange={(event) => setViolationDate(event.target.value)} required />
        <label className="pr-field-label">Lý do</label>
        <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={4} maxLength={2000} required />
        <label className="pr-field-label">Ảnh / PDF bằng chứng</label>
        <input
          type="file"
          accept=".pdf,.png,.jpg,.jpeg"
          onChange={(event) => {
            const next = event.target.files?.[0] || null;
            if (!next) return setFile(null);
            const ext = next.name.toLowerCase().split('.').pop();
            if (!ACCEPTED.includes(ext) || next.size > 20 * 1024 * 1024) {
              setError('Chỉ nhận PDF/PNG/JPG tối đa 20MB.');
              setFile(null);
              return;
            }
            setError('');
            setFile(next);
          }}
          required
        />
        {error ? <div className="pr-feedback error">{error}</div> : null}
        <div className="pr-modal-actions">
          <button type="button" className="pr-ghost-button" onClick={onClose}>Hủy</button>
          <button type="submit" className="pr-primary-button" disabled={saving}>{saving ? 'Đang lưu…' : 'Ghi nhận'}</button>
        </div>
      </form>
    </div>
  );
}

function EvaluationModal({ person, boardingOptions, existingEvaluations, onClose, onSaved }) {
  const { fetchAccessToken } = useConvexAuth();
  const upsertFile = useMutation(anyApi.peopleReview.upsertEvaluationFile);
  const submitText = useMutation(anyApi.peopleReview.submitEvaluationText);
  const nowQ = currentQuarter();
  const [quarter, setQuarter] = useState(nowQ.quarter);
  const [year, setYear] = useState(nowQ.year);
  const [schoolYear, setSchoolYear] = useState(currentSchoolYear());
  const [boardingKey, setBoardingKey] = useState(boardingOptions[0]?.periodKey || '');
  const [quarterFile, setQuarterFile] = useState(null);
  const [civilFile, setCivilFile] = useState(null);
  const [boardingFile, setBoardingFile] = useState(null);
  const [quarterText, setQuarterText] = useState('');
  const [civilText, setCivilText] = useState('');
  const [boardingText, setBoardingText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const findExisting = (kind, periodKey) =>
    existingEvaluations.find((item) => item.kind === kind && item.periodKey === periodKey) || null;

  const existingQuarter = findExisting('quarterly', `Q${quarter}-${year}`);
  const existingCivil = findExisting('civil_servant', `CS-${schoolYear}`);
  const existingBoarding = boardingKey ? findExisting('boarding', boardingKey) : null;

  const pickFile = (setter) => (event) => {
    const next = event.target.files?.[0] || null;
    if (!next) return setter(null);
    const ext = next.name.toLowerCase().split('.').pop();
    if (!ACCEPTED.includes(ext) || next.size > 20 * 1024 * 1024) {
      setError('Chỉ nhận PDF/PNG/JPG tối đa 20MB.');
      setter(null);
      return;
    }
    setError('');
    setter(next);
  };

  const saveSection = async ({ kind, file, text, periodArgs, existing }) => {
    let fileId = existing?._id || null;
    if (file) {
      if (existing?.textLocked) throw new Error('EVALUATION_FILE_LOCKED');
      const uploaded = await uploadDriveFile(fetchAccessToken, file);
      const result = await upsertFile({
        targetUserId: person._id,
        kind,
        ...periodArgs,
        driveFileId: uploaded.driveFileId,
        driveChecksum: uploaded.driveChecksum,
        fileName: file.name,
        fileType: file.type || 'application/octet-stream',
        fileSize: file.size,
      });
      fileId = result.fileId;
      if (result.previousDriveFileId) await deleteDriveFile(fetchAccessToken, result.previousDriveFileId);
    }
    if (text.trim()) {
      if (!fileId) throw new Error('EVALUATION_FILE_REQUIRED');
      await submitText({ fileId, content: text.trim() });
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const jobs = [];
      if (quarterFile || quarterText.trim()) {
        jobs.push({
          kind: 'quarterly',
          file: quarterFile,
          text: quarterText,
          periodArgs: { year, quarter },
          existing: existingQuarter,
        });
      }
      if (civilFile || civilText.trim()) {
        jobs.push({
          kind: 'civil_servant',
          file: civilFile,
          text: civilText,
          periodArgs: { schoolYear },
          existing: existingCivil,
        });
      }
      if (boardingKey && (boardingFile || boardingText.trim())) {
        const option = boardingOptions.find((item) => item.periodKey === boardingKey);
        jobs.push({
          kind: 'boarding',
          file: boardingFile,
          text: boardingText,
          periodArgs: { schoolYear: option.schoolYear, semester: option.semester },
          existing: existingBoarding,
        });
      }
      if (!jobs.length) {
        setError('Chọn ít nhất một mục để upload hoặc đánh giá text.');
        setSaving(false);
        return;
      }
      for (const job of jobs) await saveSection(job);
      onSaved();
      onClose();
    } catch (err) {
      const message = String(err?.data || err?.message || err);
      if (message.includes('EVALUATION_FILE_LOCKED')) setError('File kỳ này đã có đánh giá text — không thể upload lại.');
      else if (message.includes('EVALUATION_FILE_REQUIRED')) setError('Cần có file upload trước khi ghi đánh giá text.');
      else if (message.includes('EVALUATION_TEXT_ALREADY_SUBMITTED')) setError('Bạn đã ghi đánh giá text cho kỳ này rồi.');
      else setError('Không thể lưu đánh giá. Kiểm tra quyền và dữ liệu.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pr-modal-backdrop" role="presentation">
      <form className="pr-modal pr-modal-wide" onSubmit={submit}>
        <button type="button" className="pr-modal-close" onClick={onClose} aria-label="Đóng">×</button>
        <span className="pr-kicker">Thêm đánh giá</span>
        <h3>{person.name}</h3>
        <p className="pr-modal-context">{person.departmentName}</p>

        <section className="pr-form-section">
          <header>
            <h4>Đánh giá theo quý</h4>
            <div className="pr-inline-fields">
              <label>
                Quý
                <select value={quarter} onChange={(event) => setQuarter(Number(event.target.value))}>
                  {[1, 2, 3, 4].map((value) => <option key={value} value={value}>Quý {value}</option>)}
                </select>
              </label>
              <label>
                Năm
                <input type="number" min="2000" max="2100" value={year} onChange={(event) => setYear(Number(event.target.value))} />
              </label>
            </div>
          </header>
          {existingQuarter ? (
            <div className="pr-existing-file">
              <PrivateFileButton kind="evaluation" fileId={existingQuarter._id} fileName={existingQuarter.fileName} />
              <small>{existingQuarter.textLocked ? 'Đã khóa upload' : `Version ${existingQuarter.versionCount}`}</small>
              {existingQuarter.texts.map((text) => (
                <article className="pr-mini-text" key={text._id}>
                  <strong>{text.evaluatorName}</strong>
                  <span>{formatDateTime(text.createdAt)}</span>
                  <p>{text.content}</p>
                </article>
              ))}
            </div>
          ) : null}
          {person.canUpload && !existingQuarter?.textLocked ? (
            <label className="pr-field-label">Upload file<input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={pickFile(setQuarterFile)} /></label>
          ) : null}
          {person.canWriteText ? (
            <label className="pr-field-label">
              Đánh giá text
              <textarea rows={3} value={quarterText} onChange={(event) => setQuarterText(event.target.value)} disabled={!existingQuarter && !quarterFile} />
            </label>
          ) : null}
        </section>

        <section className="pr-form-section">
          <header>
            <h4>Đánh giá viên chức</h4>
            <label>
              Năm học
              <input type="text" value={schoolYear} onChange={(event) => setSchoolYear(event.target.value)} placeholder="2025-2026" />
            </label>
          </header>
          {existingCivil ? (
            <div className="pr-existing-file">
              <PrivateFileButton kind="evaluation" fileId={existingCivil._id} fileName={existingCivil.fileName} />
              <small>{existingCivil.textLocked ? 'Đã khóa upload' : `Version ${existingCivil.versionCount}`}</small>
              {existingCivil.texts.map((text) => (
                <article className="pr-mini-text" key={text._id}>
                  <strong>{text.evaluatorName}</strong>
                  <span>{formatDateTime(text.createdAt)}</span>
                  <p>{text.content}</p>
                </article>
              ))}
            </div>
          ) : null}
          {person.canUpload && !existingCivil?.textLocked ? (
            <label className="pr-field-label">Upload file<input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={pickFile(setCivilFile)} /></label>
          ) : null}
          {person.canWriteText ? (
            <label className="pr-field-label">
              Đánh giá text
              <textarea rows={3} value={civilText} onChange={(event) => setCivilText(event.target.value)} disabled={!existingCivil && !civilFile} />
            </label>
          ) : null}
        </section>

        {boardingOptions.length ? (
          <section className="pr-form-section">
            <header>
              <h4>Đánh giá công tác bán trú</h4>
              <label>
                Học kỳ
                <select value={boardingKey} onChange={(event) => setBoardingKey(event.target.value)}>
                  {boardingOptions.map((option) => (
                    <option key={option.periodKey} value={option.periodKey}>{option.label}</option>
                  ))}
                </select>
              </label>
            </header>
            {existingBoarding ? (
              <div className="pr-existing-file">
                <PrivateFileButton kind="evaluation" fileId={existingBoarding._id} fileName={existingBoarding.fileName} />
                <small>{existingBoarding.textLocked ? 'Đã khóa upload' : `Version ${existingBoarding.versionCount}`}</small>
                {existingBoarding.texts.map((text) => (
                  <article className="pr-mini-text" key={text._id}>
                    <strong>{text.evaluatorName}</strong>
                    <span>{formatDateTime(text.createdAt)}</span>
                    <p>{text.content}</p>
                  </article>
                ))}
              </div>
            ) : null}
            {person.canUpload && !existingBoarding?.textLocked ? (
              <label className="pr-field-label">Upload file<input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={pickFile(setBoardingFile)} /></label>
            ) : null}
            {person.canWriteText ? (
              <label className="pr-field-label">
                Đánh giá text
                <textarea rows={3} value={boardingText} onChange={(event) => setBoardingText(event.target.value)} disabled={!existingBoarding && !boardingFile} />
              </label>
            ) : null}
          </section>
        ) : null}

        {error ? <div className="pr-feedback error">{error}</div> : null}
        <div className="pr-modal-actions">
          <button type="button" className="pr-ghost-button" onClick={onClose}>Hủy</button>
          <button type="submit" className="pr-primary-button" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu'}</button>
        </div>
      </form>
    </div>
  );
}

function PersonDashboard({ userId, permissions, showActions }) {
  const defaultTo = todayIso();
  const defaultFrom = addDays(defaultTo, -29);
  const [faultRange, setFaultRange] = useState({ from: defaultFrom, to: defaultTo });
  const [workRange, setWorkRange] = useState({ from: defaultFrom, to: defaultTo });
  const [faultOpen, setFaultOpen] = useState(false);
  const [evalOpen, setEvalOpen] = useState(false);
  const data = useQuery(anyApi.peopleReview.personDetail, {
    userId,
    faultFrom: faultRange.from,
    faultTo: faultRange.to,
    workFrom: workRange.from,
    workTo: workRange.to,
  });

  if (data === undefined) return <div className="pr-loading">Đang tải hồ sơ…</div>;

  const person = {
    ...data.person,
    canUpload: permissions?.canUpload ?? data.permissions.canUpload,
    canWriteText: permissions?.canWriteText ?? data.permissions.canWriteText,
    canRecordFault: permissions?.canRecordFault ?? data.permissions.canRecordFault,
  };

  return (
    <div className="pr-person-dashboard">
      {showActions ? (
        <div className="pr-person-actions">
          {person.canRecordFault ? (
            <button type="button" className="pr-outline-button" onClick={() => setFaultOpen(true)}>＋ Ghi nhận lỗi</button>
          ) : null}
          {person.canUpload || person.canWriteText ? (
            <button type="button" className="pr-primary-button" onClick={() => setEvalOpen(true)}>＋ Thêm đánh giá</button>
          ) : null}
        </div>
      ) : null}

      <div className="pr-section">
        <header className="pr-section-head"><div><span>GHI NHẬN LỖI</span><h3>Các lần vi phạm</h3></div></header>
        <DateRangeFilter from={faultRange.from} to={faultRange.to} onChange={setFaultRange} label="Lọc lỗi" />
        <FaultList faults={data.faults} />
      </div>

      <div className="pr-section">
        <header className="pr-section-head"><div><span>CÔNG VIỆC</span><h3>Mức độ hoàn thành</h3></div></header>
        <DateRangeFilter from={workRange.from} to={workRange.to} onChange={setWorkRange} label="Lọc công việc" />
        <WorkKpiPanel workKpi={data.workKpi} />
      </div>

      <div className="pr-section">
        <header className="pr-section-head"><div><span>HỒ SƠ ĐÁNH GIÁ</span><h3>File và nhận xét theo kỳ</h3></div></header>
        <EvaluationViewer evaluations={data.evaluations} boardingOptions={data.boardingOptions} />
      </div>

      {faultOpen ? <FaultModal person={person} onClose={() => setFaultOpen(false)} onSaved={() => {}} /> : null}
      {evalOpen ? (
        <EvaluationModal
          person={person}
          boardingOptions={data.boardingOptions}
          existingEvaluations={data.evaluations}
          onClose={() => setEvalOpen(false)}
          onSaved={() => {}}
        />
      ) : null}
    </div>
  );
}

function EvalTargetModal({ person, onClose }) {
  const detail = useQuery(anyApi.peopleReview.personDetail, { userId: person._id });
  if (detail === undefined) {
    return (
      <div className="pr-modal-backdrop">
        <div className="pr-modal"><div className="pr-loading">Đang tải…</div></div>
      </div>
    );
  }
  return (
    <EvaluationModal
      person={{ ...person, departmentName: detail.person.departmentName }}
      boardingOptions={detail.boardingOptions}
      existingEvaluations={detail.evaluations}
      onClose={onClose}
      onSaved={onClose}
    />
  );
}

export default function PeopleReviewView() {
  const overview = useQuery(anyApi.peopleReview.overview);
  const [selectedId, setSelectedId] = useState('');
  const [faultTarget, setFaultTarget] = useState(null);
  const [evalTarget, setEvalTarget] = useState(null);

  const groups = useMemo(() => {
    if (!overview?.people?.length) return [];
    const map = new Map();
    for (const person of overview.people) {
      const key = person.departmentName || 'Chưa xác định phòng ban';
      const list = map.get(key) || [];
      list.push(person);
      map.set(key, list);
    }
    return [...map.entries()].map(([departmentName, people]) => ({ departmentName, people }));
  }, [overview]);

  if (overview === undefined) return <div className="pr-loading">Đang tải đánh giá nhân sự…</div>;

  const selected = overview.people.find((person) => String(person._id) === String(selectedId)) || null;
  const isSelfMode = overview.mode === 'self';

  return (
    <section className="pr-view">
      <header className="pr-hero">
        <div>
          <span className="pr-kicker">Chức năng chính · Đánh giá nhân sự</span>
          <h2>Đánh giá nhân sự</h2>
          <p>
            {isSelfMode
              ? 'Theo dõi ghi nhận lỗi, mức hoàn thành công việc và hồ sơ đánh giá của bạn.'
              : overview.mode === 'team'
                ? 'Quản lý đánh giá và ghi nhận lỗi cho nhân viên cấp dưới cùng phòng ban.'
                : 'Toàn trường theo phòng ban — upload file tự đánh giá và ghi nhận xét BGH.'}
          </p>
        </div>
        <div className="pr-hero-stamp">
          <strong>{isSelfMode ? 1 : overview.people.length}</strong>
          <span>{isSelfMode ? 'CÁ NHÂN' : 'NHÂN SỰ'}</span>
        </div>
      </header>

      {isSelfMode ? (
        <PersonDashboard
          userId={overview.self._id}
          showActions
          permissions={{
            canUpload: overview.actor.canSelfUpload,
            canWriteText: false,
            canRecordFault: overview.actor.canSelfFault,
          }}
        />
      ) : (
        <div className="pr-layout">
          <aside className="pr-people-panel">
            <div className="pr-people-self">
              <button type="button" className={!selectedId ? 'is-active' : ''} onClick={() => setSelectedId('')}>
                <strong>{overview.self.name}</strong>
                <small>Hồ sơ của tôi</small>
              </button>
            </div>
            {groups.map((group) => (
              <div className="pr-dept-group" key={group.departmentName}>
                <h4>{group.departmentName}</h4>
                {group.people.map((person) => (
                  <div className={`pr-person-row ${String(selectedId) === String(person._id) ? 'is-active' : ''}`} key={person._id}>
                    <button type="button" className="pr-person-main" onClick={() => setSelectedId(person._id)}>
                      <strong>{person.name}</strong>
                      <small>
                        {person.isOps
                          ? person.positionName
                          : `${person.positionLevel || '—'}★ · ${person.positionName}`}
                      </small>
                    </button>
                    <div className="pr-row-actions">
                      {person.canRecordFault ? (
                        <button type="button" className="pr-mini-button" onClick={() => setFaultTarget(person)} title="Ghi nhận lỗi / vi phạm">Ghi lỗi</button>
                      ) : null}
                      {person.canUpload || person.canWriteText ? (
                        <button type="button" className="pr-mini-button primary" onClick={() => setEvalTarget(person)} title="Thêm đánh giá">Đánh giá</button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </aside>
          <div className="pr-detail-panel">
            {selected ? (
              <PersonDashboard
                userId={selected._id}
                showActions={false}
                permissions={{
                  canUpload: selected.canUpload,
                  canWriteText: selected.canWriteText,
                  canRecordFault: selected.canRecordFault,
                }}
              />
            ) : (
              <PersonDashboard
                userId={overview.self._id}
                showActions
                permissions={{
                  canUpload: overview.actor.canSelfUpload,
                  canWriteText: false,
                  canRecordFault: overview.actor.canSelfFault,
                }}
              />
            )}
          </div>
        </div>
      )}

      {faultTarget ? (
        <FaultModal person={faultTarget} onClose={() => setFaultTarget(null)} onSaved={() => setFaultTarget(null)} />
      ) : null}
      {evalTarget ? <EvalTargetModal person={evalTarget} onClose={() => setEvalTarget(null)} /> : null}
    </section>
  );
}
