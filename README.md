# LVT CRM

CRM nội bộ cho Trường THCS Lê Văn Tám. Stack: **Vite + React 19**, backend **Convex self-hosted** (local Docker) với **Convex Auth (Password provider)** — đăng nhập email + mật khẩu, hồ sơ do admin cấp.

**URL vận hành hiện tại (dev/staging qua tunnel):** https://lvt.vscgroup.io.vn  
Frontend: Vite dev (`--host 0.0.0.0`). Backend: Convex local `http://127.0.0.1:3210` (proxy qua domain khi hostname = `lvt.vscgroup.io.vn`).

## Phạm vi hiện tại

- Xác thực **email + password only**. Không public signup, không email verification, không tự khôi phục mật khẩu (quên MK → liên hệ Admin).
- **Ba vai trò hệ thống** trên `users.role`:
  - `admin` — **Administrator**: toàn quyền, bao gồm **Cài đặt tối cao** và quản lý tài khoản.
  - `moderator` — **Moderator**: toàn quyền nghiệp vụ và **Quản trị hệ thống**, không thấy/không truy cập **Cài đặt tối cao**.
  - `user` — **User**: các chức năng chính theo **nhóm quyền** do Administrator gán.
- Administrator quản lý thông số tối cao; Administrator và Moderator cùng quản lý bán trú, công việc và các module nghiệp vụ.
- Mật khẩu băm bởi Convex Auth (Scrypt); plaintext không lưu / không ghi audit. Tài khoản tạo/reset có `mustChangePassword=true`.
- Module Công tác, Báo cáo và Công việc đã có luồng dữ liệu; các menu khác tiếp tục dùng placeholder theo phạm vi triển khai.

## Mô hình phân quyền

### Vai trò hệ thống (`users.role`)

| Key | Tên UI | Quyền |
|-----|--------|--------|
| `admin` | Administrator | Toàn quyền, gồm Cài đặt tối cao và lifecycle tài khoản |
| `moderator` | Moderator | Toàn quyền chức năng và quản trị nghiệp vụ; không truy cập Cài đặt tối cao |
| `user` | User | Menu = `permissionGroups.menuAccess` (mặc định ẩn nếu chưa gán nhóm) |

Chỉ Administrator thấy **Cài đặt tối cao**. Moderator thấy **Chức năng chính** và **Quản trị hệ thống**. User thấy **Chức năng chính** theo nhóm quyền.

### Nhóm quyền (`permissionGroups`)

Mỗi nhóm quy định quyền trên 5 menu **Chức năng chính**:

| Menu id | Nhãn |
|---------|------|
| `reports` | Báo cáo |
| `duties` | Công tác |
| `work` | Công việc |
| `homeroom` | Lớp chủ nhiệm |
| `people-review` | Đánh giá nhân sự |

Mỗi menu có một mức: **`hidden`** (ẩn) · **`view`** (chỉ xem phạm vi thông thường) · **`view_all`** (xem mọi user, không chỉnh sửa) · **`edit`** (thêm/sửa nội dung khi module sẵn sàng).

Gán user: form Quản lý người dùng **hoặc** nút **Thêm user** trong Quản lý nhóm quyền.

### Phòng ban (`departments`)

CRUD phòng ban (tên + mã). Gán user khi tạo user hoặc từ màn phòng ban. Xóa = soft-delete (`active=false`) + gỡ gán user.

### Chức vụ (`positions`)

CRUD chức vụ với **cấp bậc 1–5 sao** (vàng). Cấp bậc dùng cho **quy trình duyệt** (workflow sau):

| Cấp | Ý nghĩa duyệt |
|-----|----------------|
| 5★ | Duyệt được cấp 4, 3, 2, 1 |
| 4★ | Duyệt được 3, 2, 1 (không duyệt 5) |
| 3★ / 2★ | Duyệt cấp thấp hơn |
| 1★ | Không duyệt được ai |

- Cùng cấp không duyệt nhau; chỉ **cấp cao hơn** duyệt cấp thấp hơn (`canApproveLevel` trong `convex/lib.ts`).
- Task nhiều cấp duyệt: cấp cao hơn được **duyệt thay** cấp thấp; mỗi lần duyệt ghi `approvalLogs` (actor, level, task, on-behalf, thời điểm).
- Gán user: form user hoặc nút **Thêm user** trong Quản lý chức vụ.

### Cấu trúc menu

1. **Chức năng chính**: Báo cáo, Công tác, Công việc, Lớp chủ nhiệm, Đánh giá nhân sự, Thông tin cá nhân.
2. **Quản trị hệ thống**: Quản lý bán trú, Quản lý công việc (Administrator và Moderator).
3. **Cài đặt tối cao**: Quản lý người dùng, phòng ban, địa điểm, nhóm quyền, chức vụ (chỉ Administrator).

## Schema chính

| Bảng | Mục đích |
|------|----------|
| `users` (+ authTables) | Hồ sơ, `role`, `departmentId`, `permissionGroupId`, `positionId`, status, `mustChangePassword` |
| `departments` | Phòng ban (`code` unique) |
| `permissionGroups` | Nhóm quyền + `menuAccess[]` |
| `positions` | Chức vụ + `level` 1–5 |
| `officeDocuments` | Công văn, tệp đính kèm, người duyệt và trạng thái duyệt |
| `workItems` | Công việc phòng ban sau khi công văn được duyệt |
| `personalTasks` | Đầu mục cá nhân, người thực hiện, deadline và trạng thái hoàn thành |
| `roles` | Legacy seed admin permissions (tùy chọn; gate admin thực tế = `role === "admin"`) |
| `auditLogs` | Audit thao tác admin |
| `approvalLogs` | Log duyệt / duyệt thay (nền tảng workflow) |

Backend modules: `convex/users.ts`, `departments.ts`, `permissionGroups.ts`, `positions.ts`, `duties.ts`, `boarding.ts`, `reports.ts`, `work.ts`, `lib.ts`, `seed.ts`, `auth.ts`, `http.ts`.

## Convex Auth beta

`@convex-dev/auth` đang **beta**:

- JWT access token vẫn hợp lệ đến khi hết hạn (~1 giờ) sau khi session bị revoke; refresh/session vô hiệu theo `invalidateSessions`.
- Không có managed IdP; backup volume Docker và first-admin là trách nhiệm vận hành.
- Trước production cứng: security review + kế hoạch rollback/migration.

## Yêu cầu

- Node.js 20+ và npm.
- Docker/Colima cho Convex local.
- Admin key local. **Không** commit secret, password, token, `.env` thật.

## Clone và chạy local

```bash
git clone https://github.com/kingrubic/LVT-CRM.git
cd LVT-CRM
npm install
cp .env.example .env.local
```

### Convex local (Docker/Colima)

```bash
colima start --cpu 4 --memory 8 --disk 60 --vm-type=vz --mount-type=virtiofs
docker compose -f infra/convex-local/docker-compose.yml up -d
```

| Service | URL |
|--------|-----|
| Backend/API | `http://127.0.0.1:3210` |
| Site proxy (auth HTTP) | `http://127.0.0.1:3211` |
| Dashboard | `http://127.0.0.1:6791` |

`.env.local` (gitignored):

```dotenv
VITE_CONVEX_URL=http://127.0.0.1:3210
CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3210
CONVEX_SELF_HOSTED_ADMIN_KEY=<admin key from local deployment>
# optional site origin for auth routes
# VITE_CONVEX_SITE_URL=http://127.0.0.1:3211
```

**Lưu ý shell:** admin key thường chứa ký tự `|`. Không `source .env.local` trực tiếp trong bash (pipe bị hiểu nhầm). Dùng export an toàn hoặc load qua script/Python.

Không đưa admin key vào source, bundle Vite, hoặc browser.

### Convex Auth keys (deployment env)

Cần `JWT_PRIVATE_KEY` và `JWKS` trên **deployment** (không phải Vite):

```bash
node --input-type=module -e '
import { exportJWK, exportPKCS8, generateKeyPair } from "jose";
const keys = await generateKeyPair("RS256", { extractable: true });
const privateKey = await exportPKCS8(keys.privateKey);
const publicKey = await exportJWK(keys.publicKey);
const jwks = JSON.stringify({ keys: [{ use: "sig", ...publicKey }] });
process.stdout.write(`JWT_PRIVATE_KEY="${privateKey.trimEnd().replace(/\n/g, " ")}"\n`);
process.stdout.write(`JWKS=${jwks}\n`);
'
```

```bash
npx convex env set JWT_PRIVATE_KEY "..."
npx convex env set JWKS "..."
npx convex env set SITE_URL http://localhost:5173
# production tunnel ví dụ: SITE_URL=https://lvt.vscgroup.io.vn
```

`auth.config.ts` dùng `process.env.CONVEX_SITE_URL` (local proxy `http://127.0.0.1:3211`).

### Đẩy functions + seed + frontend

```bash
# Push functions (self-hosted). -y bỏ confirm.
npx convex deploy -y
# hoặc: npx convex dev

npx convex run seed:seed

npm run dev
# production-like build:
npm run build
```

**Seed tạo:**

- Phòng ban mẫu: BGH, Tổ Toán, Tổ Ngữ văn, Hành chính  
- Nhóm quyền: **Cơ bản**, **Toàn quyền nghiệp vụ**  
- Chức vụ: Hiệu trưởng 5★ … Nhân viên 1★  
- Đồng bộ legacy `roles` key `admin` (permissions audit); deactivate key `manager` / `user` cũ  

### First admin (operator-only)

Không có admin/password mặc định, không public bootstrap.

```bash
npx convex run internal.users.provisionFirstAdmin \
  '{"email":"admin@example.school","name":"Quản trị viên","temporaryPassword":"<temp-at-least-8-chars>"}'
```

- Chỉ thành công khi **chưa có** active admin.
- `role=admin`, `mustChangePassword=true`.
- Truyền password tạm qua kênh nội bộ; không commit/chat plaintext.
- Đăng nhập → bắt buộc đổi MK trước khi vào CRM.

## Admin user lifecycle

1. Administrator tạo user: email (unique, trim+lowercase), tên, **role** (`admin`|`moderator`|`user`), phòng ban / chức vụ / nhóm quyền (tùy chọn), temporary password ≥8. `createAccount` (provider `password`).
2. `mustChangePassword=true`; audit không chứa password.
3. User `signIn` only. Flag còn true → chỉ form đổi MK; server chặn thao tác admin.
4. `changeOwnPassword` → `modifyAccountCredentials`, `invalidateSessions` (giữ session hiện tại), clear flag.
5. Admin reset MK → flag + credentials + revoke mọi session target.
6. Disable → `disabled` + invalidate; `beforeSessionCreation` từ chối user không active.
7. Remove → soft-delete (`disabled` + revoke). Không xóa auth tables trực tiếp. Cấm tự xóa active account.
8. Public `signUp` / `reset` / email verification bị từ chối trong `convex/auth.ts`.

## Authorization (server)

- Identity: `getAuthUserId` từ JWT Convex Auth.
- Supreme gate: `status === "active"`, `role === "admin"`, không còn `mustChangePassword` (`adminOrThrow` / `adminPermissionOrThrow`); chỉ dùng cho Cài đặt tối cao và lifecycle tài khoản.
- Operational manager gate: vai trò `admin` hoặc `moderator` (`operationalManagerOrThrow` / `operationalManagerPermissionOrThrow`); dùng cho quản trị bán trú, công việc và nghiệp vụ.
- Menu user: `resolveUserMenuAccess` / query `users.sessionContext`.
- Client chỉ là UX; mọi mutation/action admin re-check server-side.

## Generated files & scripts

`convex/_generated/` và `convex/tsconfig.json` giữ trong tree. Sau khi đổi schema/function:

```bash
npm run check          # scripts/check-files.mjs
npm run build
git diff --check
npx convex deploy -y   # cần CONVEX_SELF_HOSTED_* 
```

`npm run typecheck` = `convex codegen --typecheck enable` (cần credentials).

## Deploy (self-hosted hiện tại)

1. Docker Convex up; `.env.local` có URL + admin key.
2. `JWT_PRIVATE_KEY`, `JWKS`, `SITE_URL` đã set trên deployment.
3. `npx convex deploy -y`
4. `npx convex run seed:seed`
5. Frontend: `npm run dev` (tunnel/domain) hoặc serve `dist/` sau `npm run build`.
6. Host `lvt.vscgroup.io.vn`: client dùng `window.location.origin` làm Convex URL (xem `src/main.jsx`).

## Backup local

- Volume Docker `infra/convex-local` (`data`) = DB. Sao lưu trước khi reset stack.
- Không commit dump có PII/hash.

## Chuyển sang Convex Pro

1. Deployment Pro + `JWT_PRIVATE_KEY` / `JWKS` / `SITE_URL` (không commit key).
2. `VITE_CONVEX_URL` → Pro; deploy keys chỉ CI/máy deploy.
3. Migrate users, authAccounts (hash), departments, permissionGroups, positions, auditLogs, approvalLogs.
4. Smoke: login, admin CRUD, gán PB/nhóm/chức vụ, reset MK, forced change, menu theo nhóm quyền.
5. Giữ local tới khi backup + migration OK. Không dùng admin key local cho Pro.

## Production checklist

- [ ] Không có `.env*` thật, JWT private key, password, deploy token, DB dump, PII trong `git diff`.
- [ ] Auth keys chỉ trên deployment env; có quy trình rotate.
- [ ] First admin qua internal action; password tạm đã rotate.
- [ ] Public signup/reset/email verification disabled.
- [ ] Vai trò chỉ `admin`|`moderator`|`user`; user cũ `manager` đã migrate.
- [ ] Test: CRUD user/PB/nhóm quyền/chức vụ; gán user; menu ẩn/xem/sửa; profile + đổi MK; self-disable/delete blocked; audit.
- [ ] Hiểu JWT TTL vs session invalidation (beta).
- [ ] `SITE_URL` / origins khớp domain thật.

## Rollback

- **Frontend:** redeploy commit QA trước với `VITE_CONVEX_URL` tương ứng.
- **Convex functions:** deploy revision trước; không xóa DB bừa bãi.
- **Auth data:** hash trong `authAccounts`; schema rollback cần migration. Remove = soft-delete.
- **Clerk (legacy):** đã gỡ khỏi app.

## Known limitations

- Convex Auth beta.
- Đổi email đăng nhập chưa hỗ trợ qua UI (account id = email).
- Session invalidate không kick JWT ngay (chờ hết hạn access token).
- Module nghiệp vụ (báo cáo, công việc, …) vẫn placeholder; `view`/`edit` sẵn sàng khi module có nội dung.
- Workflow duyệt task đầy đủ chưa UI — chỉ helper + bảng `approvalLogs`.
- Production “hard” (Convex Pro + CDN static) chưa bắt buộc; stack hiện tại self-hosted + Vite/tunnel.

## Tham chiếu

- <https://labs.convex.dev/auth>
- <https://labs.convex.dev/auth/config/passwords>
- <https://labs.convex.dev/auth/api_reference/server>
- <https://docs.convex.dev/auth/convex-auth>
