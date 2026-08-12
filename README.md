# LVT CRM

CRM nội bộ cho Trường THCS Lê Văn Tám. Stack: **Vite + React 19**, backend **Convex self-hosted** (local Docker) với **Convex Auth (Password provider)** — đăng nhập email + mật khẩu, hồ sơ do admin cấp.

**URL production:** https://lvt.vscgroup.io.vn
Frontend production chạy static server qua LaunchAgent; Convex self-hosted chạy Docker với persistent volume, chỉ bind localhost. Public backend/auth proxy: `https://lvt-convex.vscgroup.io.vn` và `https://lvt-convex-site.vscgroup.io.vn`; hai hostname này đi qua Cloudflare Tunnel.

Vận hành production:

- Build: `npm run build:production`
- Chạy local production: `npm run start`
- Auto-start Colima + Convex: LaunchAgent `ai.lvt.crm.convex` chạy `./scripts/lvt-convex-ensure.sh` (RunAtLoad + KeepAlive). Log: `~/Library/Logs/lvt-crm-convex-ensure.log`.
- Backup Convex gồm file storage: `./scripts/lvt-convex-backup.sh`
- Backup tự động hằng đêm lúc 00:30, lưu ngoài repo dưới `/Users/vsc_agent/clawd/backups/lvt-crm-convex/nightly/`.
- Admin key chỉ đọc từ macOS Keychain bởi script deploy/backup; không lưu trong `.env.local`, source hoặc bundle.
- File công văn mới được lưu private trong Google Drive của tài khoản vận hành; Convex chỉ giữ Drive file ID, SHA-256 và metadata. Trình duyệt không nhận link Drive: frontend gửi Convex Auth token đến `/api/files/:documentId`, server kiểm tra quyền CRM rồi mới stream file.
- Drive OAuth do `gog` quản lý ngoài repo. Folder ID được đọc từ macOS Keychain với service `lvt-crm-drive-folder-id`; không commit OAuth token/credential hoặc bật “Anyone with the link”.
- Quên mật khẩu (web / Android / API iOS): `users.requestPasswordReset` gửi mật khẩu tạm qua Gmail API từ `thcslevantambinhthanh@gmail.com`. Cấu hình Convex env `GMAIL_*` (xem `.env.example`); lấy refresh token một lần bằng `node scripts/gmail-oauth-setup.mjs`. Không commit `client_secret*.json`.

## Phạm vi hiện tại

- Xác thực **email + password only**. Không public signup, không email verification. Quên mật khẩu tự phục vụ: gửi mật khẩu tạm + bắt buộc đổi MK (`mustChangePassword`).
- **Ba vai trò hệ thống** trên `users.role`:
  - `admin` — **Administrator**: toàn quyền, bao gồm **Thiết lập tối cao** và quản lý tài khoản.
  - `moderator` — **Moderator**: toàn quyền nghiệp vụ và **Quản trị hệ thống**, không thấy/không truy cập **Thiết lập tối cao**.
  - `user` — **User**: các chức năng chính theo **nhóm quyền** do Administrator gán.
- Administrator quản lý thông số tối cao; Administrator và Moderator cùng quản lý bán trú, công việc và các module nghiệp vụ.
- Mật khẩu băm bởi Convex Auth (Scrypt); plaintext không lưu / không ghi audit. Tài khoản tạo/reset có `mustChangePassword=true`.
- **Đã có luồng dữ liệu:** Công tác (lịch + xác nhận tham gia), Công việc (công văn / duyệt / phòng ban / cá nhân), Bán trú, Báo cáo (Công tác · Công việc · Bán trú), Thông báo (mốc hạn + click mở đúng mục), Địa điểm, Thiết lập hiển thị.
- **Vẫn placeholder:** Lớp chủ nhiệm, Đánh giá nhân sự.

## Mô hình phân quyền

### Vai trò hệ thống (`users.role`)

| Key | Tên UI | Quyền |
|-----|--------|--------|
| `admin` | Administrator | Toàn quyền, gồm Thiết lập tối cao và lifecycle tài khoản |
| `moderator` | Moderator | Toàn quyền chức năng và quản trị nghiệp vụ; không truy cập Thiết lập tối cao |
| `user` | User | Menu = `permissionGroups.menuAccess` (mặc định ẩn nếu chưa gán nhóm; **Thông báo** mặc định `view`) |

Chỉ Administrator thấy **Thiết lập tối cao**. Moderator thấy **Chức năng chính** và **Quản trị hệ thống**. User thấy **Chức năng chính** theo nhóm quyền.

### Nhóm quyền (`permissionGroups`)

Mỗi nhóm quy định quyền trên **6** menu **Chức năng chính**:

| Menu id | Nhãn |
|---------|------|
| `reports` | Báo cáo |
| `notifications` | Thông báo |
| `duties` | Công tác |
| `work` | Công việc |
| `homeroom` | Lớp chủ nhiệm |
| `people-review` | Đánh giá nhân sự |

Mỗi menu có một mức: **`hidden`** (ẩn) · **`view`** (chỉ xem phạm vi thông thường) · **`view_all`** (xem mọi user, không chỉnh sửa) · **`edit`** (thêm/sửa nội dung khi module sẵn sàng).

- Mỗi nhóm có **mã** (`code`): tối đa **20** ký tự, chỉ `A–Z 0–9 _ -`, luôn lưu/hiển thị **IN HOA**; dùng trong file import user (`ma_nhom_quyen`).
- Nhóm cũ thiếu mã được backfill tự động (`permissionGroups.ensureCodes`): chữ cái đầu mỗi từ tên (bỏ dấu), nếu trùng thì 3 rồi 4 ký tự đầu, rồi thêm số.
- Gán user: form Thiết lập người dùng **hoặc** nút **Thêm user** trong Thiết lập nhóm quyền.
- Xóa = soft-delete (`active=false`). **Không cho xóa** nếu còn user đang gán (`HAS_ASSIGNED_USERS`). Tạo lại trùng **mã** (không phải tên) → bật lại bản ghi soft-deleted.

### Phòng ban (`departments`)

CRUD phòng ban (tên + mã). Rule mã giống nhóm quyền/chức vụ (≤20, `A–Z0–9_-`, IN HOA). Gán user khi tạo user hoặc từ màn phòng ban. Xóa = soft-delete; **chặn xóa** khi còn user đang gán. Tạo lại trùng mã → reactivate.

### Chức vụ (`positions`)

CRUD chức vụ với **cấp bậc 1–5 sao** (vàng). Cấp bậc dùng cho **quy trình duyệt** công văn / công việc và nền tảng workflow:

| Cấp | Ý nghĩa duyệt |
|-----|----------------|
| 5★ | Duyệt được cấp 4, 3, 2, 1 |
| 4★ | Duyệt được 3, 2, 1 (không duyệt 5) |
| 3★ / 2★ | Duyệt cấp thấp hơn |
| 1★ | Không duyệt được ai |

- Cùng cấp không duyệt nhau; chỉ **cấp cao hơn** duyệt cấp thấp hơn (`canApproveLevel` trong `convex/lib.ts`).
- Task nhiều cấp duyệt: cấp cao hơn được **duyệt thay** cấp thấp; mỗi lần duyệt ghi `approvalLogs` (actor, level, task, on-behalf, thời điểm).
- Rule mã / soft-delete / chặn xóa khi còn user / reactivate theo mã: giống phòng ban.
- Gán user: form user hoặc nút **Thêm user** trong Thiết lập chức vụ.

### Cấu trúc menu

1. **Chức năng chính**: Báo cáo (submenu: Công tác · Công việc · Bán trú), Thông báo, Công tác, Công việc, Lớp chủ nhiệm, Đánh giá nhân sự, Thông tin cá nhân.
2. **Quản trị hệ thống**: Quản lý công tác, Quản lý bán trú, Quản lý công việc (Administrator và Moderator).
3. **Thiết lập tối cao** (chỉ Administrator): Thiết lập người dùng, phòng ban, địa điểm, nhóm quyền, chức vụ, **Thiết lập hiển thị**.

### Thông báo & Thiết lập hiển thị

- Feed tính theo mốc giờ trước hạn (mặc định `48 · 24 · 12 · 0` / Đến hạn) cho **Công tác** và **Công việc** được gán cho user.
- Chuông trên header + trang Thông báo; đánh dấu đã đọc / đọc tất cả; xóa thông báo khi quyền menu `notifications` = `edit`.
- **Click thông báo** → chuyển sang menu Công tác hoặc Công việc và scroll/highlight đúng bản ghi (`sourceType` + `sourceId`).
- Admin cấu hình trong **Thiết lập hiển thị**: bật/tắt xác nhận tham gia công tác; bật/tắt nguồn thông báo Công tác/Công việc; chỉnh danh sách mốc giờ.

## Schema chính

| Bảng | Mục đích |
|------|----------|
| `users` (+ authTables) | Hồ sơ, `role`, `departmentId`, `permissionGroupId`, `positionId`, status, `mustChangePassword` |
| `departments` | Phòng ban (`code` unique) |
| `locations` | Địa điểm công tác |
| `permissionGroups` | Nhóm quyền + `code` + `menuAccess[]` |
| `positions` | Chức vụ + `code` + `level` 1–5 |
| `userImportUploads` | File Excel import user tạm (Convex Storage, TTL 1 giờ) |
| `duties` / `dutyAttendances` | Lịch công tác + trạng thái tham gia |
| `boardingPeriods` | Kỳ bán trú |
| `officeDocuments` | Công văn, tệp đính kèm, người duyệt và trạng thái duyệt |
| `workItems` | Công việc phòng ban sau khi công văn được duyệt |
| `personalTasks` | Đầu mục cá nhân, người thực hiện, deadline và trạng thái hoàn thành |
| `systemSettings` | Cờ hiển thị / cấu hình thông báo |
| `notificationReads` / `notificationDismissals` | Đã đọc / đã xóa theo `notificationKey` |
| `roles` | Legacy seed admin permissions (tùy chọn; gate admin thực tế = `role === "admin"`) |
| `auditLogs` | Audit thao tác admin |
| `approvalLogs` | Log duyệt / duyệt thay (nền tảng workflow) |

Backend modules: `convex/users.ts`, `userImport.ts`, `userImportParse.ts`, `userImportValidate.ts`, `userImportSheet.ts`, `entityCodes.ts`, `departments.ts`, `locations.ts`, `permissionGroups.ts`, `positions.ts`, `duties.ts`, `boarding.ts`, `reports.ts`, `work.ts`, `notifications.ts`, `settings.ts`, `lib.ts`, `seed.ts`, `auth.ts`, `http.ts`.

Cấu trúc frontend gợi ý:

```
src/
  main.jsx              # shell, auth UI, duties CRUD, profile
  notifications/        # feed, chuông, click → focus bản ghi
  work/                 # công văn & công việc
  boarding/             # bán trú
  reports/              # báo cáo công tác / công việc
  settings/             # thiết lập hiển thị
  duties/ · profile/ · management/
convex/                 # schema + functions
infra/convex-local/     # Docker Compose Convex local
scripts/check-files.mjs
```

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

### Convex self-hosted (Docker/Colima)

```bash
colima start --cpu 4 --memory 8 --disk 60 --vm-type=vz --mount-type=virtiofs
docker compose -f infra/convex-local/docker-compose.yml up -d
```

| Service | URL |
|--------|-----|
| Backend/API | `http://127.0.0.1:3210` |
| Site proxy (auth HTTP) | `http://127.0.0.1:3211` |
| Dashboard | `http://127.0.0.1:6791` |

`.env.local` (gitignored, chỉ dành cho local development):

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
# hoặc: npm run convex:deploy / npm run convex:dev

npx convex run internal.seed.seed

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
2. `mustChangePassword=true`; audit không chứa password. **Mọi user đăng nhập lần đầu / sau reset đều phải đổi mật khẩu.**
3. User `signIn` only. Flag còn true → chỉ form đổi MK; server chặn thao tác admin.
4. `changeOwnPassword` → `modifyAccountCredentials`, `invalidateSessions` (giữ session hiện tại), clear flag.
5. Admin reset MK → flag + credentials + revoke mọi session target.
6. Disable → `disabled` + invalidate; `beforeSessionCreation` từ chối user không active.
7. Remove → soft-delete (`disabled` + revoke). Không xóa auth tables trực tiếp. Cấm tự xóa active account.
8. Public `signUp` / `reset` / email verification bị từ chối trong `convex/auth.ts`.

### Import user hàng loạt (SYS-011 · chỉ Administrator)

UI: **Thiết lập người dùng** — nút *Tải file nhập liệu mẫu* + *Import file nhập liệu* (`src/settings/UserBulkImport.jsx`).

**Phạm vi**

- Chỉ tạo tài khoản `role=user`. Moderator/Admin phải tạo tay trên web.
- Chỉ file **`.xlsx`**, tối đa **2 MB**. Không CSV.
- All-or-nothing: một dòng lỗi → không commit; báo lỗi theo dòng + tải PDF báo cáo.
- Chỉ khi **mọi dòng hợp lệ** mới hiện xem trước → Admin xác nhận mới tạo user.

**Cột file mẫu (không dấu)**

`ho_ten`, `email`, `ma_phong_ban`, `ma_chuc_vu`, `ma_nhom_quyen`, `mat_khau_tam_thoi`

- Không có cột vai trò (luôn `user`).
- Không được để trống bất kỳ cột nào → `"Vui lòng điền đầy đủ các cột thông tin người dùng"`.
- PB / chức vụ / nhóm quyền map theo **mã** (không phân biệt hoa thường; chuẩn hóa IN HOA). Sai/không khớp → `"Thông tin [Phòng ban, Chức vụ, Nhóm quyền] không chính xác, vui lòng đảm bảo chính xác với hệ thống"`.
- Trùng email trong file hoặc đã có trong DB → `"Phát hiện email trùng, vui lòng kiểm tra lại"` (chi tiết dòng / email).
- Mật khẩu tạm do admin điền trong file, ≥ 8 ký tự; user tạo ra luôn `mustChangePassword=true`.
- Mã PB/chức vụ/nhóm quyền đang dùng trong hệ thống nếu sai rule (≤20, `A–Z0–9_-`) → chặn import và chỉ rõ mục nào admin phải sửa trước.

**Flow server-first (bắt buộc)**

1. Client chỉ kiểm tra extension/size tối thiểu, rồi **upload file lên Convex Storage** + `userImport.registerUpload` (TTL **1 giờ**, kể cả khi file lỗi hoặc đã import thành công).
2. `userImport.validateUpload({ uploadId })` — server đọc lại file từ storage (`userImportParse.parseStorageXlsx`), validate, trả errors hoặc preview.
3. `userImport.commit({ uploadId })` — server **đọc lại cùng file**, validate lần nữa, rồi tạo user. **Không tin rows từ client.**
4. Nếu tạo dở dang giữa chừng: soft-disable các user đã tạo trong lô (`user.import_rollback`); auth account không hard-delete được.

**Code chính:** `convex/userImport.ts`, `userImportParse.ts`, `userImportSheet.ts`, `userImportValidate.ts`, `entityCodes.ts`; test `tests/user-import.test.mjs`.

## Authorization (server)

- Identity: `getAuthUserId` từ JWT Convex Auth.
- Supreme gate: `status === "active"`, `role === "admin"`, không còn `mustChangePassword` (`adminOrThrow` / `adminPermissionOrThrow`); chỉ dùng cho Thiết lập tối cao và lifecycle tài khoản.
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
# alias: npm run convex:deploy
```

`npm run typecheck` = `convex codegen --typecheck enable` (cần credentials).

| Script | Việc |
|--------|------|
| `npm run dev` | Vite frontend |
| `npm run build` / `preview` | Build / xem `dist/` |
| `npm run check` | Kiểm tra file bắt buộc |
| `npm run typecheck` | Codegen + typecheck Convex |
| `npm run convex:dev` | `convex dev` |
| `npm run convex:deploy` | `convex deploy` |

## Deploy (self-hosted hiện tại)

1. Docker Convex up; `.env.local` có URL + admin key.
2. `JWT_PRIVATE_KEY`, `JWKS`, `SITE_URL` đã set trên deployment.
3. `npx convex deploy -y`
4. `npx convex run internal.seed.seed`
5. Frontend: `npm run dev` (tunnel/domain) hoặc serve `dist/` sau `npm run build`.
6. Host `lvt.vscgroup.io.vn`: client dùng `window.location.origin` làm Convex URL (xem `src/main.jsx`).

## Backup local

- Volume Docker `infra/convex-local` (`data`) = DB. Sao lưu trước khi reset stack.
- Không commit dump có PII/hash.

## Chuyển sang Convex Pro

1. Deployment Pro + `JWT_PRIVATE_KEY` / `JWKS` / `SITE_URL` (không commit key).
2. `VITE_CONVEX_URL` → Pro; deploy keys chỉ CI/máy deploy.
3. Migrate: users, authAccounts (hash), departments, locations, permissionGroups, positions, duties, dutyAttendances, boardingPeriods, officeDocuments, workItems, personalTasks, systemSettings, notificationReads, notificationDismissals, auditLogs, approvalLogs.
4. Smoke: login; CRUD catalog; menu theo nhóm quyền; công tác / công việc / bán trú; báo cáo 3 loại; chuông thông báo + click mở đúng mục; thiết lập hiển thị; reset MK / forced change.
5. Giữ local tới khi backup + migration OK. Không dùng admin key local cho Pro.

## Production checklist

- [ ] Không có `.env*` thật, JWT private key, password, deploy token, DB dump, PII trong `git diff`.
- [ ] Auth keys chỉ trên deployment env; có quy trình rotate.
- [ ] First admin qua internal action; password tạm đã rotate.
- [ ] Public signup/reset/email verification disabled.
- [ ] Vai trò chỉ `admin`|`moderator`|`user`; user cũ `manager` đã migrate.
- [ ] Test: CRUD user/PB/địa điểm/nhóm quyền/chức vụ; gán user; menu ẩn/xem/sửa; profile + đổi MK; self-disable/delete blocked; audit.
- [ ] Test: thông báo (chuông, đọc, click → Công tác/Công việc); thiết lập hiển thị; báo cáo 3 loại.
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
- Placeholder còn lại: **Lớp chủ nhiệm**, **Đánh giá nhân sự**.
- Workflow duyệt task đầy đủ (duyệt thay đa cấp ngoài công văn) chưa UI — helper + bảng `approvalLogs` sẵn sàng.
- Production “hard” (Convex Pro + CDN static) chưa bắt buộc; stack hiện tại self-hosted + Vite/tunnel.

## Tham chiếu

- <https://labs.convex.dev/auth>
- <https://labs.convex.dev/auth/config/passwords>
- <https://labs.convex.dev/auth/api_reference/server>
- <https://docs.convex.dev/auth/convex-auth>
