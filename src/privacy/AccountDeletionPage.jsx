import {
  PRIVACY_APP_NAME,
  PRIVACY_CONTACT_EMAIL,
  PRIVACY_ORGANIZATION_EN,
  PRIVACY_ORGANIZATION_VI,
  PRIVACY_POLICY_CANONICAL_PATH,
  PRIVACY_SITE_ORIGIN,
} from './privacyPolicy';
import './privacy.css';

export default function AccountDeletionPage() {
  const mail = `mailto:${PRIVACY_CONTACT_EMAIL}?subject=${encodeURIComponent(`Yêu cầu xóa tài khoản ${PRIVACY_APP_NAME}`)}`;
  return (
    <main className="privacy-page">
      <article className="privacy-page-inner">
        <img src="/assets/logo-thcs-le-van-tam.png" alt={`Logo ${PRIVACY_ORGANIZATION_VI}`} />
        <nav className="privacy-lang" aria-label="Language">
          <a href="#vi">Tiếng Việt</a>
          <a href="#en">English</a>
        </nav>

        <section id="vi" lang="vi">
          <p className="eyebrow">{PRIVACY_APP_NAME}</p>
          <h1>Yêu cầu xóa tài khoản</h1>
          <p className="privacy-lede">
            Trang này dành cho ứng dụng {PRIVACY_APP_NAME} do {PRIVACY_ORGANIZATION_VI} vận hành
            ({PRIVACY_SITE_ORIGIN}). Nhân sự không tự tạo tài khoản trong app; tài khoản do nhà trường cấp.
          </p>

          <div className="privacy-section">
            <h2>Cách gửi yêu cầu</h2>
            <ol>
              <li>
                Gửi email tới <a href={mail}>{PRIVACY_CONTACT_EMAIL}</a>.
              </li>
              <li>Tiêu đề: Yêu cầu xóa tài khoản {PRIVACY_APP_NAME}.</li>
              <li>Trong thư ghi họ tên và địa chỉ email dùng để đăng nhập.</li>
              <li>Nhà trường xác minh người gửi rồi vô hiệu hóa tài khoản.</li>
            </ol>
          </div>

          <div className="privacy-section">
            <h2>Dữ liệu bị xóa hoặc ngừng dùng</h2>
            <ul>
              <li>Quyền đăng nhập web, Android và iOS bị tắt.</li>
              <li>Phiên đăng nhập và token thông báo đẩy trên thiết bị bị gỡ.</li>
              <li>Không còn nhận thông báo công tác / công việc trên máy đó.</li>
            </ul>
          </div>

          <div className="privacy-section">
            <h2>Dữ liệu nhà trường có thể giữ</h2>
            <p>
              Hồ sơ công tác, điểm danh, công việc và tệp công văn gắn với quá trình làm việc có thể được lưu
              theo quy chế nội bộ và nghĩa vụ lưu trữ của nhà trường. Những bản ghi này không còn gắn với
              tài khoản đang hoạt động sau khi vô hiệu hóa.
            </p>
            <p>Nhà trường không xóa tự động sau 90 ngày; yêu cầu được xử lý thủ công sau khi nhận email.</p>
          </div>
        </section>

        <section id="en" className="privacy-en" lang="en">
          <p className="eyebrow">{PRIVACY_APP_NAME}</p>
          <h1>Account deletion request</h1>
          <p className="privacy-lede">
            This page is for the {PRIVACY_APP_NAME} app operated by {PRIVACY_ORGANIZATION_EN} (
            {PRIVACY_SITE_ORIGIN}). Staff cannot create an account in the app; accounts are issued by the school.
          </p>

          <div className="privacy-section">
            <h2>How to request deletion</h2>
            <ol>
              <li>
                Email <a href={mail}>{PRIVACY_CONTACT_EMAIL}</a>.
              </li>
              <li>Subject: Account deletion request for {PRIVACY_APP_NAME}.</li>
              <li>Include your full name and the email address used to sign in.</li>
              <li>The school verifies the requester and disables the account.</li>
            </ol>
          </div>

          <div className="privacy-section">
            <h2>What is deleted or stopped</h2>
            <ul>
              <li>Sign-in to web, Android, and iOS is disabled.</li>
              <li>Device sessions and push tokens are removed.</li>
              <li>The device no longer receives duty or work notifications for that account.</li>
            </ul>
          </div>

          <div className="privacy-section">
            <h2>What the school may retain</h2>
            <p>
              Duty, attendance, work, and official-document records tied to school operations may be kept under
              internal rules and record-keeping duties. After the account is disabled they are no longer tied to
              an active login.
            </p>
            <p>Data is not auto-deleted within 90 days. Requests are handled manually after the email is received.</p>
          </div>
        </section>

        <p>
          <a className="privacy-home" href={PRIVACY_POLICY_CANONICAL_PATH}>
            ← Chính sách bảo mật
          </a>
        </p>
        <a className="privacy-home" href="/">
          ← {PRIVACY_APP_NAME}
        </a>
      </article>
    </main>
  );
}
