import { emptyWorkAssignment } from './workDisplay';

export default function WorkAssignmentRows({
  assignments,
  onChange,
  departments = [],
  users = [],
  showDepartments = true,
}) {
  const selectedDepartmentIds = new Set(
    assignments
      .filter((row) => row.type !== 'individual' && row.departmentId)
      .map((row) => String(row.departmentId)),
  );
  const selectedUserIds = new Set(
    assignments
      .filter((row) => row.type === 'individual')
      .flatMap((row) => (row.userIds || []).map(String)),
  );

  const updateRow = (index, patch) => {
    onChange(assignments.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  };

  return (
    <section className="work-department-assignments duty-field">
      <header>
        <div>
          <span>PHÂN CÔNG</span>
          <h4>Người nhận việc</h4>
        </div>
        <div className="work-assignment-actions">
          {showDepartments ? (
            <button type="button" className="work-outline-button" onClick={() => onChange([...assignments, emptyWorkAssignment('department')])}>
              ＋ Phòng ban
            </button>
          ) : null}
          <button type="button" className="work-outline-button" onClick={() => onChange([...assignments, emptyWorkAssignment('individual')])}>
            ＋ Cá nhân
          </button>
        </div>
      </header>
      {assignments.length ? (
        <div className="work-inline-assignments">
          {assignments.map((row, index) => {
            const isIndividual = row.type === 'individual';
            const departmentOptions = departments.filter((department) => (
              String(department._id) === String(row.departmentId)
              || !selectedDepartmentIds.has(String(department._id))
            ));
            const userOptions = users.filter((user) => (
              (row.userIds || []).some((id) => String(id) === String(user._id))
              || !selectedUserIds.has(String(user._id))
            ));
            return (
              <div className="work-inline-row" key={`${row.type}-${index}`}>
                {isIndividual ? (
                  <label>
                    Cá nhân
                    <select
                      required
                      value={row.userIds?.[0] || ''}
                      onChange={(event) => updateRow(index, { userIds: event.target.value ? [event.target.value] : [] })}
                    >
                      <option value="">Chọn người nhận</option>
                      {userOptions.map((user) => (
                        <option key={user._id} value={user._id}>
                          {user.name}{user.departmentName ? ` · ${user.departmentName}` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label>
                    Phòng ban
                    <select
                      required
                      value={row.departmentId || ''}
                      onChange={(event) => updateRow(index, { departmentId: event.target.value })}
                    >
                      <option value="">Chọn phòng ban</option>
                      {departmentOptions.map((department) => (
                        <option key={department._id} value={department._id}>{department.name}</option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="work-inline-content">
                  Nội dung công việc
                  <textarea
                    required
                    maxLength={2000}
                    rows={2}
                    value={row.content}
                    onChange={(event) => updateRow(index, { content: event.target.value })}
                    placeholder="Nhập yêu cầu cho người nhận này…"
                  />
                  <small>{String(row.content || '').length}/2000</small>
                </label>
                <label>
                  Hạn chót
                  <input
                    required
                    type="date"
                    value={row.deadline || ''}
                    onChange={(event) => updateRow(index, { deadline: event.target.value })}
                  />
                </label>
                <button
                  type="button"
                  className="work-inline-remove"
                  onClick={() => onChange(assignments.filter((_, rowIndex) => rowIndex !== index))}
                  aria-label="Xóa phân công"
                  title="Xóa phân công"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="work-assignment-empty">
          <span>⌁</span>
          <p>
            {showDepartments
              ? 'Bấm ＋ Phòng ban hoặc ＋ Cá nhân để thêm row nhận việc.'
              : 'Bấm ＋ Cá nhân để thêm người nhận việc.'}
          </p>
        </div>
      )}
    </section>
  );
}
