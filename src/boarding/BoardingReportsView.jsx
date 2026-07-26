import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import './boarding.css';

function periodStatus(period) {
  const firstYear = Number(period.schoolYear.split('-')[0]);
  const start = period.semester === 1
    ? new Date(firstYear, 7, 1)
    : new Date(firstYear + 1, 0, 1);
  const end = period.semester === 1
    ? new Date(firstYear, 11, 31, 23, 59, 59)
    : new Date(firstYear + 1, 5, 30, 23, 59, 59);
  const now = new Date();
  if (now < start) return { id: 'upcoming', label: 'Sắp diễn ra' };
  if (now > end) return { id: 'completed', label: 'Đã hoàn thành' };
  return { id: 'ongoing', label: 'Đang tham gia' };
}

export default function BoardingReportsView() {
  const [selectedUserId, setSelectedUserId] = useState('');
  const data = useQuery(anyApi.boarding.report, selectedUserId ? { userId: selectedUserId } : {});

  useEffect(() => {
    if (data?.selectedUserId && !selectedUserId) {
      setSelectedUserId(data.selectedUserId);
    }
  }, [data?.selectedUserId, selectedUserId]);

  const peopleGroups = useMemo(() => {
    const groups = new Map();
    for (const person of data?.people || []) {
      const departmentName = person.departmentName || 'Chưa gán phòng ban';
      const people = groups.get(departmentName) || [];
      people.push(person);
      groups.set(departmentName, people);
    }
    return [...groups.entries()]
      .map(([departmentName, people]) => ({ departmentName, people }))
      .sort((a, b) => {
        const aHasSelf = a.people.some((person) => person.isSelf);
        const bHasSelf = b.people.some((person) => person.isSelf);
        return Number(bHasSelf) - Number(aHasSelf) ||
          a.departmentName.localeCompare(b.departmentName, 'vi');
      });
  }, [data?.people]);

  if (data === undefined) {
    return <div className="boarding-report-loading">Đang tải các kỳ bán trú…</div>;
  }

  const periods = data.periods;
  const ongoingCount = periods.filter((period) => periodStatus(period).id === 'ongoing').length;
  const isGlobalView = data.visibilityScope === 'all';

  return (
    <section className="boarding-report">
      <header className="boarding-report-hero">
        <div>
          <span>Báo cáo · Bán trú</span>
          <h2>{isGlobalView ? `Hành trình bán trú · ${data.selectedUserName}` : 'Hành trình bán trú của tôi'}</h2>
          <p>
            {isGlobalView
              ? 'Chọn nhân sự theo phòng ban để xem các kỳ bán trú đã được đăng ký.'
              : 'Mỗi kỳ tham gia là một dấu mốc đồng hành cùng học sinh và nhà trường.'}
          </p>
        </div>
        <div className="boarding-report-score">
          <strong>{periods.length}</strong>
          <span>Kỳ đã đăng ký</span>
        </div>
      </header>

      {isGlobalView ? (
        <section className="boarding-report-people">
          <header>
            <div>
              <span>NHÂN SỰ TOÀN HỆ THỐNG</span>
              <strong>Chọn người cần xem</strong>
            </div>
            <small>{data.people.length} người · {peopleGroups.length} phòng ban</small>
          </header>
          <div className="boarding-report-departments">
            {peopleGroups.map((group) => (
              <section key={group.departmentName}>
                <header>
                  <strong>{group.departmentName}</strong>
                  <span>{group.people.length}</span>
                </header>
                <div>
                  {group.people.map((person) => (
                    <button
                      type="button"
                      className={String(person._id) === String(data.selectedUserId) ? 'active' : ''}
                      key={person._id}
                      onClick={() => setSelectedUserId(person._id)}
                    >
                      <i>{String(person.name).trim().charAt(0).toLocaleUpperCase('vi') || '?'}</i>
                      <span>
                        <strong>{person.name}</strong>
                        <small>{person.isSelf ? 'Tài khoản của tôi' : person.positionName || 'Chưa gán chức vụ'}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>
      ) : null}

      <div className="boarding-report-stats">
        <div>
          <i>◉</i>
          <span><strong>{ongoingCount}</strong><small>Đang tham gia</small></span>
        </div>
        <div>
          <i>◇</i>
          <span><strong>{periods.length - ongoingCount}</strong><small>Các kỳ khác</small></span>
        </div>
        <p>Dữ liệu được lấy từ thiết lập Quản lý bán trú của Admin.</p>
      </div>

      {periods.length ? (
        <div className="boarding-report-timeline">
          {periods.map((period, index) => {
            const status = periodStatus(period);
            return (
              <article className={`boarding-report-card status-${status.id}`} key={period._id}>
                <div className="boarding-timeline-marker">
                  <span>{index + 1}</span>
                </div>
                <div className="boarding-report-card-main">
                  <header>
                    <span className={`boarding-period-status ${status.id}`}>{status.label}</span>
                    <small>{period.participantCount} giáo viên cùng tham gia</small>
                  </header>
                  <div>
                    <span>HỌC KỲ</span>
                    <strong>{period.semester}</strong>
                  </div>
                  <div>
                    <span>NĂM HỌC</span>
                    <h3>{period.schoolYear}</h3>
                  </div>
                  <footer>
                    <span>✓</span>
                    {isGlobalView
                      ? `${data.selectedUserName} đã được đăng ký tham gia kỳ bán trú này`
                      : 'Bạn đã được đăng ký tham gia kỳ bán trú này'}
                  </footer>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="boarding-report-empty">
          <span>☼</span>
          <h3>{isGlobalView ? `${data.selectedUserName} chưa được đăng ký kỳ bán trú nào` : 'Bạn chưa được đăng ký kỳ bán trú nào'}</h3>
          <p>{isGlobalView ? 'Hãy chọn nhân sự khác hoặc kiểm tra thiết lập Quản lý bán trú.' : 'Khi Admin thêm bạn vào một kỳ bán trú, thông tin sẽ xuất hiện tại đây.'}</p>
        </div>
      )}
    </section>
  );
}
