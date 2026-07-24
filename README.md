# LVT CRM

CRM nội bộ cho Trường THCS Lê Văn Tám. Repository này giữ nguyên prototype trong `public/demo/` và bổ sung lớp xác thực Clerk + dữ liệu/ủy quyền Convex cho hồ sơ người dùng và quản trị hệ thống.

## Trạng thái triển khai

- **Frontend:** Vite + React 19, Clerk React, Convex React provider.
- **Backend:** Convex schema/functions cho users, roles, departments và audit logs.
- **Authorization:** mọi query/mutation quản trị đều kiểm tra identity trong Convex và role `admin` trong bảng `users`; frontend chỉ dùng để hiển thị, không phải ranh giới bảo mật.
- **Clerk:** tạo user bằng username + mật khẩu tạm thời, cập nhật user, ban/unban và reset mật khẩu được gọi server-side từ Convex action. Không self-signup, không email reset; secret key không đi qua browser.
- **Production:** không tự triển khai từ repository này. Cần hoàn tất checklist domain, Clerk production instance, Convex production deployment và review quyền trước khi deploy.

## Yêu cầu

- Node.js 20+ và npm.
- Một Clerk application (development hoặc production).
- Một Convex deployment.
- Người triển khai có quyền cấu hình Clerk/Convex. Không cần và không được commit secret.

## Clone và chạy local

```bash
git clone https://github.com/kingrubic/LVT-CRM.git
cd LVT-CRM
npm install
cp .env.example .env.local
```

Điền **chỉ** hai biến public vào `.env.local`:

```dotenv
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_CONVEX_URL=https://<deployment>.convex.cloud
```

`.env.local` bị ignore. Không đặt `CLERK_SECRET_KEY` trong file Vite hoặc bất kỳ file nào được bundle.

```bash
npm run dev
```

Nếu thiếu key, ứng dụng hiện trang hướng dẫn cấu hình thay vì crash. Nếu đã đăng nhập nhưng chưa có hồ sơ Convex, `users.storeCurrent` tạo hồ sơ mặc định `user`; không tự cấp quyền admin.

## Cấu hình Clerk + Convex

1. Trong Clerk Dashboard tạo application và bật phương thức đăng nhập phù hợp.
2. Bật tích hợp Convex theo hướng dẫn chính thức của Convex.
3. Lấy Clerk **Frontend API URL** (issuer domain), ví dụ `https://verb-noun-00.clerk.accounts.dev`.
4. Cấu hình biến `CLERK_JWT_ISSUER_DOMAIN` trên Convex deployment. `convex/auth.config.ts` dùng issuer này với `applicationID: "convex"`.
5. Cấu hình `CLERK_SECRET_KEY` **trên Convex Dashboard**, không đặt trong frontend. Đây là secret để action gọi Clerk Backend API.
6. Trong Clerk, cấu hình redirect/origin cho URL local của Vite (thường `http://localhost:5173`).

Các URL chính thức được dùng làm API boundary:

- Convex + Clerk: <https://docs.convex.dev/auth/clerk>
- Lưu user trong Convex: <https://docs.convex.dev/auth/database-auth>
- Clerk create user: <https://clerk.com/docs/reference/backend-api/tag/Users#operation/CreateUser>
- Clerk `banUser()` / `unbanUser()`: <https://clerk.com/docs/reference/backend/user/ban-user>
- Clerk `updateUser()`: <https://clerk.com/docs/reference/backend/user/update-user>

## Backend model và quyền

`convex/schema.ts` định nghĩa:

- `users`: `clerkUserId`, email, tên, role, phòng ban, `pending|active|disabled`, cờ `mustChangePassword`, timestamps.
- `roles`: key và danh sách permission.
- `departments`: mã, tên và trạng thái.
- `auditLogs`: actor, action, target, details và thời điểm.

`convex/lib.ts` cung cấp `identityOrThrow()` và `adminOrThrow()`. Các operation quản trị không được gọi trực tiếp từ browser nếu không qua kiểm tra này.

`convex/users.ts` cung cấp:

- `current`, `storeCurrent`: liên kết identity JWT `subject` (Clerk user ID) với bản ghi app.
- `list`, `bootstrap`: đọc dữ liệu quản trị sau khi xác thực admin.
- `create`: admin tạo Clerk user bằng username + mật khẩu tạm thời, đồng thời tạo hồ sơ app; không gửi invitation/email.
- `update`: cập nhật tên/role/phòng ban trong Clerk metadata và Convex.
- `setDisabled`: gọi Clerk ban/unban (Clerk ban thu hồi sessions và chặn đăng nhập), rồi đồng bộ trạng thái Convex.
- `resetPassword`: đặt mật khẩu tạm thời qua Clerk Backend API, sign out các session khác và đặt `mustChangePassword=true`.

`convex/seed.ts` là internal mutation tạo role/phòng ban mẫu, không tự chạy và không chứa dữ liệu người thật.

### Bootstrap admin an toàn

Không có “admin mặc định” hoặc mật khẩu mặc định trong source. Quy trình đề xuất:

1. Đăng nhập tài khoản Clerk đầu tiên.
2. Xác định Clerk `userId` qua Clerk Dashboard.
3. Tạo/patch bản ghi `users` đầu tiên bằng một migration/internal operation được review riêng, đặt `role=admin`, `status=active`, `mustChangePassword=false`.
4. Chạy seed role/phòng ban nếu cần.
5. Sau bootstrap, mọi thao tác quản trị dùng `adminOrThrow` và được ghi audit.

Không expose internal mutation cho client để “tự nhận admin”. Nếu cần migration, thực hiện trong môi trường Convex đã xác thực và review diff/target trước khi chạy.

## Tạo user, reset và must-change-password

Admin chủ động tạo từng user bằng username và mật khẩu tạm thời dùng chung theo quy trình nội bộ. Mật khẩu này không được ghi vào Git, audit log hoặc gửi tự động qua email. Không có self-signup và không có email reset; user liên hệ admin khi quên mật khẩu.

Clerk không cung cấp một cờ universal bảo đảm bắt buộc đổi mật khẩu ở mọi sign-in flow. Vì vậy app dùng contract minh bạch:

- Convex lưu `mustChangePassword` và đặt metadata tương ứng trên Clerk khi reset.
- Frontend chặn phần workspace khi cờ này là `true`, hiển thị hướng dẫn mở Clerk User Menu để đổi mật khẩu.
- Việc đổi mật khẩu thực tế và xác nhận mật khẩu thuộc Clerk UI/instance policy. Sau khi hoàn tất, một flow đồng bộ được triển khai có thể clear cờ; không coi metadata frontend là authorization.
- Admin reset không gửi mật khẩu qua audit log; không log secret trong lỗi.

Nếu instance yêu cầu đảm bảo cứng hơn (ví dụ password reset ticket riêng hoặc custom sign-in flow), phải thiết kế và kiểm thử với Clerk docs/instance trước khi bật production; không tự suy diễn API.

## Seed và Convex commands

Sau khi cài Convex CLI và đã liên kết deployment:

```bash
npx convex dev
```

Lệnh trên sinh `convex/_generated/` và sync schema/functions. Chạy seed internal mutation theo cách được Convex Dashboard/CLI của deployment hiện tại hỗ trợ; không chạy seed lên production nếu chưa review target.

Deploy backend sau khi QA:

```bash
npm run convex:deploy
```

Các lệnh deploy cần credentials của người vận hành được cấp qua CLI/dashboard. Không đưa token vào script, log, commit hoặc chat.

## Admin UI và prototype

- Dashboard authenticated vẫn nhúng `public/demo/index.html` nguyên bản.
- Menu placeholder Báo cáo, Công tác, Công việc, Lớp chủ nhiệm, Đánh giá nhân sự và settings vẫn được giữ.
- Menu người dùng dùng query/action Convex khi role backend là admin; không còn dùng dữ liệu cục bộ làm nguồn sự thật.
- UI không dùng `publicMetadata.role` để cấp quyền. Metadata chỉ là dữ liệu Clerk hỗ trợ hiển thị/đồng bộ.

## QA và security gate

```bash
npm install
npm run check
npm run build
git diff --check
```

Trước push/deploy, kiểm tra:

- `git status --short` và `git diff --stat`.
- Không có `.env*` thật, Clerk secret, webhook secret, deploy key, password, session secret, database dump hay user data.
- Không sửa `/Users/vsc_agent/deployments/lvt-crm-local` khi chưa có deployment approval và checklist domain/config.
- Convex auth config dùng issuer domain đúng môi trường; Clerk secret chỉ ở Convex environment.
- Test tạo username trùng, ban/unban, reset password, non-admin rejection và audit log trên development deployment.

## Deployment và rollback

### Frontend

Build static assets bằng `npm run build`, cấu hình host với `VITE_CLERK_PUBLISHABLE_KEY` và `VITE_CONVEX_URL` của **cùng một môi trường** trước build. Không dùng development Clerk key với production Convex hoặc ngược lại. Chỉ deploy khi custom domain, HTTPS, Clerk allowed origins/redirects và Convex production URL đã được xác minh.

### Rollback

- Frontend: redeploy artifact/commit cuối cùng đã QA.
- Convex: dùng lịch sử deployment/migration của Convex để rollback theo quy trình chính thức; không xóa database bằng script tùy tiện.
- Clerk: không “unban” hàng loạt hoặc thay metadata hàng loạt khi rollback ứng dụng; review audit logs và thực hiện operation mục tiêu.
- Nếu schema đã có dữ liệu production, rollback code phải tương thích schema. Tạo migration forward nếu rollback ngược schema không an toàn.

## Giới hạn đã biết

- Chưa có production deployment trong repository này.
- Chưa có webhook Clerk → Convex; `storeCurrent` và các action quản trị là synchronization path hiện tại. Webhook nên được thêm khi cần đồng bộ delete/update ngoài app.
- Chưa có custom password-change callback để tự clear `mustChangePassword`; cờ này là UI contract được document rõ ở trên.
- Không coi giao diện ẩn menu, Clerk public metadata hoặc client state là security boundary.

### Quy trình tài khoản demo và admin

- Tài khoản demo hiện hữu được giữ dữ liệu/menu dummy và nên được đổi username thành `demo` trong Clerk + Convex migration có review.
- Tạo tài khoản `admin` bằng cùng quy trình server-side, dùng mật khẩu mặc định nội bộ do người vận hành truyền lúc seed; không hard-code mật khẩu trong source.
- Đặt `role=admin`, `status=active`, `mustChangePassword=true` cho admin lần đầu; sau đăng nhập admin phải đổi mật khẩu.
- Chỉ `admin` mới được gọi các action quản lý user. Không dùng hidden menu, Clerk metadata hay client state làm quyền bảo mật.
