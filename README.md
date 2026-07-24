# LVT CRM

Milestone đầu tiên của CRM nội bộ Trường THCS Lê Văn Tám: Vite + React, Clerk frontend authentication scaffold, role-based navigation và giao diện prototype cũ được giữ làm authenticated demo view.

## Chạy cục bộ

```bash
npm install
cp .env.example .env.local
# Thay VITE_CLERK_PUBLISHABLE_KEY bằng Clerk publishable key của môi trường dev.
npm run dev
```

Không thêm Clerk secret key vào frontend. Khi chưa cấu hình publishable key, app hiển thị trang hướng dẫn thiết lập an toàn thay vì crash.

## Role scaffold

App đọc role từ Clerk `user.publicMetadata.role`:

- `admin`: có menu quản trị và các trang scaffold.
- mọi giá trị khác hoặc chưa có role: không gian `demo` mặc định.

Menu admin gồm Báo cáo, Công tác, Công việc, Lớp chủ nhiệm, Đánh giá nhân sự và Cài đặt. Cài đặt có Quản lý người dùng, Quản lý Phòng ban và Quản lý nhóm quyền. Chỉ Quản lý người dùng có scaffold dữ liệu cục bộ ở milestone này; chưa có ghi dữ liệu thật.

## Cấu trúc

- `src/`: React shell, auth boundary, navigation và admin scaffold.
- `public/demo/`: bản prototype tĩnh được bảo tồn nguyên vẹn.
- `public/assets/`: tài nguyên public cho Vite app.
- `.env.example`: tên biến môi trường frontend, không chứa credential thật.

## Build

```bash
npm run build
```

## Lưu ý bảo mật

Repository không được chứa token, secret key, khóa phiên, cấu hình auth server hay dữ liệu người dùng thật. Convex/backend chưa được tích hợp trong milestone này.
