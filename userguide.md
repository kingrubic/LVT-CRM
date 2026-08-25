# Hướng dẫn sử dụng LVT CRM

Tài liệu dành cho Trường THCS Lê Văn Tám  
Cập nhật theo phiên bản web ngày 28/07/2026

Địa chỉ sử dụng: <https://lvt.vscgroup.io.vn/>

## Trước khi bắt đầu

LVT CRM có ba loại tài khoản:

- **Administrator (Admin):** thiết lập toàn bộ hệ thống, quản lý tài khoản và sử dụng tất cả chức năng.
- **Moderator:** quản lý các hoạt động hằng ngày của nhà trường, gồm Công tác, Bán trú và Công việc.
- **User:** sử dụng các chức năng được nhà trường cấp cho tài khoản.

Admin có thể làm mọi việc của Moderator và User. Moderator có thể dùng phần Quản trị hệ thống và các Chức năng chính đã hoàn thiện trong tài liệu này, nhưng không vào được phần Thiết lập tối cao.

Menu của mỗi User có thể khác nhau. Điều này phụ thuộc vào nhóm quyền, phòng ban và chức vụ được Admin gán.

### Đăng nhập lần đầu

1. Mở địa chỉ LVT CRM.
2. Nhập email và mật khẩu tạm thời do Admin cung cấp.
3. Nếu hệ thống yêu cầu đổi mật khẩu, nhập mật khẩu mới ít nhất 8 ký tự và nhập lại lần nữa để xác nhận.
4. Chọn **Đổi mật khẩu và tiếp tục**.

Hệ thống không có chức năng tự đăng ký hoặc tự lấy lại mật khẩu. Nếu quên mật khẩu, hãy liên hệ Admin.

---

# Phần 1 — Thiết lập tối cao cho Admin

Phần **Thiết lập tối cao** chỉ xuất hiện với tài khoản Administrator.

## 1. Trình tự thiết lập được khuyến nghị

Khi chuẩn bị hệ thống lần đầu, Admin nên thực hiện theo thứ tự:

1. Tạo địa điểm.
2. Tạo phòng ban.
3. Tạo chức vụ và cấp bậc.
4. Tạo nhóm quyền.
5. Tạo tài khoản người dùng.
6. Kiểm tra thiết lập hiển thị và thông báo.

Làm theo thứ tự này giúp Admin có sẵn đầy đủ lựa chọn khi tạo tài khoản.

## 2. Thiết lập địa điểm

Địa điểm được dùng khi tạo lịch công tác.

### Thêm địa điểm

1. Vào **Thiết lập tối cao → Thiết lập địa điểm**.
2. Nhập **Tên địa điểm**.
3. Nhập mô tả nếu cần.
4. Chọn **Thêm địa điểm**.

### Sửa hoặc xóa địa điểm

- Chọn **Sửa** tại địa điểm cần thay đổi, cập nhật thông tin rồi chọn **Lưu**.
- Chọn **Xóa** và xác nhận khi địa điểm không còn sử dụng.

Nên kiểm tra các lịch công tác đang dùng địa điểm đó trước khi xóa.

## 3. Thiết lập phòng ban

Phòng ban được dùng để phân công công tác, giao việc, xem báo cáo và xác định quan hệ cấp trên — cấp dưới.

### Thêm phòng ban

1. Vào **Thiết lập tối cao → Thiết lập phòng ban**.
2. Nhập tên phòng ban.
3. Nhập mã ngắn, ví dụ `BGH`, `TOAN`, `VAN`.
4. Chọn **Thêm phòng ban**.

### Thêm người vào phòng ban

1. Tìm phòng ban trong danh sách.
2. Chọn **Thêm user**.
3. Chọn người cần thêm.
4. Chọn **Thêm user vào phòng ban**.

Có thể chọn **Gỡ** để đưa một người ra khỏi phòng ban.

### Sửa hoặc xóa phòng ban

- Chọn **Sửa**, cập nhật tên hoặc mã rồi lưu.
- Chọn **Xóa** và xác nhận khi phòng ban không còn sử dụng.

Khi xóa phòng ban, các tài khoản trong phòng ban sẽ bị gỡ khỏi phòng ban đó nhưng tài khoản vẫn còn hoạt động.

## 4. Thiết lập chức vụ

Chức vụ gồm tên, mã và cấp bậc từ 1 đến 5 sao. Cấp bậc ảnh hưởng đến việc duyệt công văn, giao việc và theo dõi cấp dưới.

### Cách hiểu cấp bậc

- **5 sao:** cấp cao nhất.
- **4 sao:** có thể duyệt cho cấp 3 sao trở xuống.
- **3 sao:** có thể quản lý người cấp thấp hơn trong cùng phòng ban.
- **2 sao:** có thể quản lý người cấp thấp hơn trong cùng phòng ban.
- **1 sao:** cấp thực hiện.

Người có cấp cao hơn mới được duyệt hoặc quản lý người cấp thấp hơn. Hai người cùng cấp không duyệt cho nhau.

### Thêm chức vụ

1. Vào **Thiết lập tối cao → Thiết lập chức vụ**.
2. Nhập tên chức vụ.
3. Nhập mã ngắn.
4. Chọn cấp bậc từ 1 đến 5 sao.
5. Chọn **Thêm chức vụ**.

### Gán người vào chức vụ

1. Tìm chức vụ trong danh sách.
2. Chọn **Thêm user**.
3. Chọn người cần gán.
4. Chọn **Thêm user vào chức vụ**.

### Sửa hoặc xóa chức vụ

- Chọn **Sửa**, cập nhật thông tin rồi lưu.
- Chọn **Xóa** và xác nhận khi chức vụ không còn sử dụng.

Khi xóa chức vụ, những tài khoản đang mang chức vụ đó sẽ được gỡ chức vụ nhưng không bị xóa tài khoản.

## 5. Thiết lập nhóm quyền

Nhóm quyền quyết định User nhìn thấy menu nào và được sử dụng ở mức nào. Administrator và Moderator không cần gán nhóm quyền.

### Các mức quyền

- **Ẩn:** không thấy menu.
- **Xem:** xem và thao tác nghiệp vụ trong phạm vi thông thường của mình.
- **Xem tối cao:** xem và thao tác nghiệp vụ trên phạm vi rộng hơn hoặc toàn hệ thống ở những chức năng có hỗ trợ.
- **Giám thị:** chỉ có trên menu **Lớp chủ nhiệm**. Tài khoản vẫn là User; mức này mở workflow điểm danh/camera trong phạm vi được phân công, không phải quyền xem toàn trường và không áp dụng cho menu khác.

Tạo công việc hoặc công tác cho cả trường vẫn theo vai trò/cấp bậc, không do mức Xem hay Xem tối cao.

### Tạo nhóm quyền

1. Vào **Thiết lập tối cao → Thiết lập nhóm quyền**.
2. Nhập tên nhóm và mô tả.
3. Chọn mức quyền cho từng menu đang được nhà trường sử dụng. Cột **Giám thị** chỉ chọn được ở hàng **Lớp chủ nhiệm**; các hàng khác hiện `—`.
4. Chọn **Thêm nhóm quyền**.

### Thêm User vào nhóm quyền

1. Tìm nhóm quyền trong danh sách.
2. Chọn **Thêm user**.
3. Chọn tài khoản cần gán.
4. Chọn **Thêm user vào nhóm quyền**.

Một User chỉ thuộc một nhóm quyền tại một thời điểm. Có thể chọn **Gỡ** để bỏ gán.

### Sửa hoặc xóa nhóm quyền

- Chọn **Sửa**, thay đổi mức quyền rồi chọn **Lưu nhóm quyền**.
- Chọn **Xóa** và xác nhận khi nhóm không còn sử dụng.

Khi xóa nhóm quyền, các User trong nhóm sẽ bị gỡ nhóm quyền. Những menu không được cấp sẽ không còn xuất hiện với họ.

## 6. Thiết lập người dùng

### Tạo tài khoản

1. Vào **Thiết lập tối cao → Thiết lập người dùng**.
2. Nhập họ tên và email đăng nhập.
3. Chọn vai trò:
   - **Administrator:** toàn quyền hệ thống.
   - **Moderator:** quản lý nghiệp vụ, không có Thiết lập tối cao.
   - **User:** dùng chức năng theo nhóm quyền.
4. Chọn phòng ban và chức vụ.
5. Nếu là User, chọn nhóm quyền.
6. Nhập mật khẩu tạm thời ít nhất 8 ký tự.
7. Chọn **Tạo tài khoản**.

Gửi mật khẩu tạm thời trực tiếp cho người nhận qua kênh riêng. Không gửi mật khẩu trong nhóm chat công khai.

Khi đăng nhập lần đầu, người dùng phải đổi mật khẩu trước khi vào hệ thống.

### Sửa tài khoản

1. Tìm tài khoản trong danh sách.
2. Chọn **Sửa**.
3. Cập nhật họ tên, vai trò, phòng ban, chức vụ hoặc nhóm quyền.
4. Chọn **Lưu thay đổi**.

Email đăng nhập không sửa được tại màn hình này. Nếu cần thay email, hãy tạo tài khoản mới sau khi đã kiểm tra dữ liệu liên quan.

### Đặt lại mật khẩu

1. Chọn **Đặt lại MK** tại tài khoản cần hỗ trợ.
2. Nhập mật khẩu tạm thời mới, ít nhất 8 ký tự.
3. Chọn **Đặt lại mật khẩu**.
4. Gửi mật khẩu tạm thời cho người dùng qua kênh riêng.

Các phiên đăng nhập cũ của tài khoản sẽ bị thu hồi. Người dùng phải đổi mật khẩu khi đăng nhập lại.

### Khóa, mở khóa hoặc xóa tài khoản

- Chọn **Khóa** để tạm ngừng tài khoản.
- Chọn **Mở khóa** để cho phép đăng nhập lại.
- Chọn **Xóa** khi tài khoản không còn sử dụng và xác nhận thao tác.

Không khóa hoặc xóa chính tài khoản Admin đang đăng nhập.

## 7. Thiết lập hiển thị

Vào **Thiết lập tối cao → Thiết lập hiển thị**.

### Xác nhận tham gia công tác

- Khi **Đang bật**, người được phân công có thể chọn **Đã tham gia** hoặc **Chưa tham gia** trong thời gian công tác đang diễn ra.
- Khi **Đang tắt**, các nút xác nhận được ẩn và công tác được xem là đã tham gia trong báo cáo.

### Chọn người giao việc

Chỉ chọn một trong hai cách:

- **Admin / Mod:** Admin hoặc Moderator giao việc trực tiếp cho phòng ban hoặc cá nhân. Đây là cách phù hợp khi nhà trường muốn quản lý tập trung.
- **Cấp trên:** người cấp 2–3 sao chia việc cho cấp dưới cùng phòng ban.

Sau khi đổi cách giao việc, nên thông báo cho các thầy cô liên quan để tránh nhầm quy trình.

### Thiết lập thông báo

1. Bật hoặc tắt thông báo cho **Công tác**.
2. Bật hoặc tắt thông báo cho **Công việc**.
3. Thêm các mốc nhắc trước hạn bằng số giờ.
4. Mốc `0` có nghĩa là nhắc khi đến hạn.
5. Chọn **Lưu thiết lập thông báo**.

Ví dụ: `48`, `24`, `12`, `0` tương ứng với nhắc trước 48 giờ, 24 giờ, 12 giờ và khi đến hạn.

## 8. Kiểm tra sau khi thiết lập

Admin nên dùng một tài khoản thử để kiểm tra:

- Đăng nhập và đổi mật khẩu lần đầu.
- Menu hiển thị đúng theo nhóm quyền.
- Phòng ban và chức vụ hiển thị đúng trong hồ sơ.
- User nhận được công tác hoặc công việc đã giao.
- Thông báo mở đúng công tác hoặc công việc.

---

# Phần 2 — Quản trị hệ thống cho Moderator

Moderator có ba menu trong phần **Quản trị hệ thống**:

- Quản lý công tác.
- Quản lý bán trú.
- Quản lý công việc.

Moderator cũng dùng được các Chức năng chính ở Phần 3.

## 1. Quản lý công tác

### Thêm công tác

1. Vào **Quản trị hệ thống → Quản lý công tác**.
2. Chọn **Thêm công tác**.
3. Nhập ngày bắt đầu và ngày kết thúc.
4. Nếu công tác diễn ra trong một ngày, có thể chọn **Cả ngày**.
5. Nhập giờ bắt đầu và giờ kết thúc.
6. Nhập nội dung công tác.
7. Chọn một hoặc nhiều địa điểm.
8. Chọn phòng ban tham gia và/hoặc cá nhân tham gia.
9. Chọn **Lưu công tác**.

Khi chọn cả phòng ban, tất cả tài khoản đang hoạt động trong phòng ban đó sẽ được tính là người tham gia.

### Sửa hoặc xóa công tác

- Mở công tác cần thay đổi và chọn **Sửa**.
- Cập nhật thông tin rồi chọn **Lưu thay đổi**.
- Chọn **Xóa** và xác nhận khi muốn bỏ công tác.

### Theo dõi người tham gia

1. Chọn **Chi tiết** tại một công tác.
2. Xem danh sách người tham gia và trạng thái.
3. Nếu chính Moderator cũng được phân công, có thể xác nhận trạng thái của mình trong thời gian công tác đang diễn ra.

## 2. Quản lý bán trú

### Thêm kỳ bán trú

1. Vào **Quản trị hệ thống → Quản lý bán trú**.
2. Chọn **Thêm kỳ bán trú**.
3. Chọn học kỳ 1 hoặc học kỳ 2.
4. Chọn năm học.
5. Chọn **Thêm giáo viên**.
6. Tìm và đánh dấu các giáo viên tham gia. Có thể chọn tất cả hoặc bỏ chọn tất cả.
7. Chọn **Hoàn thành**.
8. Chọn **Tạo kỳ bán trú**.

Mỗi học kỳ của một năm học chỉ tạo một lần.

### Sửa hoặc xóa kỳ bán trú

- Chọn **Sửa** để thay đổi học kỳ, năm học hoặc danh sách giáo viên.
- Chọn dấu `×` cạnh tên giáo viên để bỏ người đó khỏi kỳ.
- Chọn **Xóa** và xác nhận khi kỳ bán trú không còn sử dụng.

## 3. Quản lý công việc

### Thêm công văn và giao việc

1. Vào **Quản trị hệ thống → Quản lý công việc**.
2. Chọn **Thêm công văn**.
3. Tải tệp công văn lên. Hệ thống nhận PDF, DOCX, Excel, PNG và JPG, tối đa 20 MB.
4. Chọn người duyệt công văn. Danh sách này gồm những người đủ cấp bậc duyệt.
5. Chọn **Phòng ban** để thêm việc cho một phòng ban:
   - Chọn phòng ban.
   - Nhập nội dung công việc.
   - Chọn hạn hoàn thành.
6. Nếu hệ thống đang dùng cách **Admin / Mod giao việc**, có thể chọn **Cá nhân** để giao trực tiếp:
   - Chọn một hoặc nhiều người.
   - Nhập nội dung công việc.
   - Chọn hạn hoàn thành.
7. Kiểm tra lại các phân công.
8. Chọn **Lưu & gửi duyệt**.

Công việc chỉ xuất hiện với người thực hiện sau khi công văn được duyệt đầy đủ.

### Theo dõi công văn

Trong **Kho công văn**, Moderator có thể:

- Mở tệp công văn.
- Xem trạng thái chờ duyệt, đã duyệt hoặc không duyệt.
- Xem số người đã duyệt trên tổng số người duyệt.
- Xem các phòng ban hoặc cá nhân nhận việc.
- Theo dõi số đầu mục đã hoàn thành và chất lượng được ghi nhận.

### Duyệt kết quả hoàn thành

Khi có người báo hoàn thành, hệ thống hiển thị mục **Duyệt hoàn thành**.

1. Chọn **Duyệt / Chưa duyệt** tại công việc.
2. Nếu đồng ý:
   - Chọn **Duyệt**.
   - Nhập mức độ hoàn thành từ 0% đến 100%.
   - Chọn **Duyệt hoàn thành**.
3. Nếu chưa đồng ý:
   - Chọn **Chưa duyệt**.
   - Nhập lý do rõ ràng để người thực hiện biết cần sửa gì.
   - Chọn **Trả về user**.

Người thực hiện sẽ nhìn thấy lý do và có thể gửi hoàn thành lại.

---

# Phần 3 — Chức năng chính cho User

User chỉ nhìn thấy các menu được Admin cấp. Nếu không thấy một menu, hãy liên hệ Admin để kiểm tra nhóm quyền.

## 1. Thông báo

Trang **Thông báo** hiển thị các công tác và công việc sắp đến hạn.

### Xem một thông báo

1. Chọn biểu tượng chuông ở góc trên, rồi **Xem toàn bộ** nếu cần danh sách đầy đủ.
2. Chọn thông báo cần xem.
3. Hệ thống tự mở đúng công tác hoặc công việc liên quan.

Thông báo vừa mở sẽ được đánh dấu là đã đọc.

### Đánh dấu tất cả là đã đọc

Chọn **Đánh dấu tất cả là đã đọc** ở đầu trang.

Nếu tài khoản có quyền xóa thông báo, dấu `×` sẽ xuất hiện trên từng thông báo.

## 2. Công tác

Trang **Công tác** hiển thị lịch được giao cho cá nhân, phòng ban hoặc cấp dưới thuộc phạm vi được phép xem.

Mỗi công tác có:

- Thời gian bắt đầu và kết thúc.
- Nội dung.
- Địa điểm.
- Phòng ban và cá nhân tham gia.
- Trạng thái sắp diễn ra, đang diễn ra hoặc đã quá hạn.

### Xác nhận tham gia

Nếu Admin đang bật chức năng xác nhận:

1. Mở công tác đang diễn ra.
2. Chọn **Đã tham gia** hoặc **Chưa tham gia**.

Không thể xác nhận trước giờ bắt đầu hoặc sau khi công tác kết thúc.

Nếu tài khoản có chức vụ cao hơn và được cấp quyền phù hợp, hệ thống có thể hiển thị cấp dưới cùng phòng ban. Khi công tác đang diễn ra, người quản lý có thể cập nhật trạng thái cho họ.

## 3. Công việc

Màn hình Công việc thay đổi theo nhiệm vụ và chức vụ của từng người. Một tài khoản có thể thấy một hoặc nhiều nội dung dưới đây.

**Việc của tôi** và **Việc tôi tạo** dùng bốn tab: **Chưa hoàn thành**, **Đã hoàn thành**, **Chưa đến hạn**, **Đã quá hạn**. Việc quá hạn vẫn nằm ở **Chưa hoàn thành** cho đến khi được duyệt xong; **Đã quá hạn** chỉ việc chưa xong mà hạn đã qua, **Chưa đến hạn** là việc chưa xong còn hạn. Tab **Chưa hoàn thành** hiện vòng tròn đỏ với số việc còn lại. Badge trên menu **Công việc** là tổng: task chờ duyệt hoàn thành + việc chưa hoàn thành của tôi + việc chưa hoàn thành tôi tạo.

### Xử lý công văn cần duyệt

Nếu được chọn làm người duyệt:

1. Mở menu **Công việc**.
2. Chọn công văn cần xử lý và mở tệp để đọc.
3. Kiểm tra nội dung, nơi nhận việc và thời hạn.
4. Chọn **Tôi duyệt công văn này** hoặc **Tôi không duyệt công văn này**.

### Giao đầu mục cho cấp dưới

Mục này xuất hiện khi hệ thống dùng cách **Cấp trên giao việc** và tài khoản có chức vụ phù hợp.

1. Mở công việc phòng ban.
2. Chọn **Chỉ định công việc cá nhân**.
3. Nhập tên đầu mục.
4. Chọn hạn hoàn thành.
5. Chọn người thực hiện trong danh sách.
6. Chọn **Giao công việc**.

### Báo hoàn thành công việc

1. Mở công việc được giao.
2. Đọc nội dung, thời hạn và công văn đính kèm.
3. Chọn **Đã hoàn thành**.
4. Hệ thống chuyển công việc sang trạng thái **Chờ duyệt hoàn thành**.

Nếu bị trả lại:

1. Đọc phần **Lý do chưa duyệt**.
2. Hoàn thiện lại công việc.
3. Chọn **Gửi hoàn thành lại**.

Kết quả chỉ được tính hoàn thành sau khi người có quyền duyệt xác nhận. Việc hoàn thành sau hạn sẽ được ghi nhận là hoàn thành trễ.

### Duyệt hoàn thành cho cấp dưới

Nếu trên màn hình có mục **Duyệt hoàn thành**, tài khoản đã được phép xử lý kết quả của cấp dưới:

1. Chọn **Duyệt / Chưa duyệt**.
2. Khi duyệt, nhập mức độ hoàn thành từ 0% đến 100%.
3. Khi chưa duyệt, nhập lý do để người thực hiện làm lại.

## 4. Báo cáo

Menu **Báo cáo** có ba phần.

### Báo cáo Công tác

- Chọn người cần xem nếu tài khoản được phép xem nhiều người.
- Chọn chế độ Tuần, Tháng, Quý hoặc Năm.
- Dùng nút mũi tên để chuyển kỳ hoặc chọn **Hôm nay**.
- Chọn một công tác trên lịch để xem chi tiết.
- Khi xác nhận tham gia đang bật, báo cáo có số công tác đã tham gia và chưa xác nhận.

### Báo cáo Công việc

- Chọn người cần xem nếu được phép.
- Chọn chế độ Tuần, Tháng, Quý hoặc Năm.
- Chọn một công việc để xem nội dung, hạn hoàn thành, trạng thái và chất lượng.
- Phần tổng hợp cho biết số việc đúng hạn, trễ hạn và chưa hoàn thành.

### Báo cáo Bán trú

1. Chọn kỳ bán trú.
2. Xem tổng số giáo viên tham gia.
3. Xem danh sách được nhóm theo phòng ban.

Phạm vi nhìn thấy phụ thuộc vào quyền của tài khoản: toàn trường, phòng ban hoặc cá nhân.

## 5. Đánh giá nhân sự

Trang **Đánh giá nhân sự** có thể hiển thị hồ sơ của cá nhân, cấp dưới hoặc toàn trường tùy chức vụ và quyền được cấp.

### Xem hồ sơ của mình

Người dùng có thể:

- Xem hồ sơ theo ba ô màu: **Ghi nhận lỗi**, **Công việc**, **Kỳ đánh giá**.
- Xem các ghi nhận lỗi trong khoảng ngày đã chọn (tạo mới nằm ở menu **Ghi nhận lỗi**).
- Xem số công việc đúng hạn, trễ hạn và chưa hoàn thành.
- Xem tệp đánh giá theo quý.
- Xem tệp đánh giá viên chức theo năm học.
- Xem đánh giá bán trú nếu có tham gia kỳ bán trú.
- Đọc nhận xét của Ban Giám hiệu.

### Tải tệp tự đánh giá

Nếu nút **Thêm đánh giá** xuất hiện:

1. Chọn loại đánh giá và kỳ cần nộp.
2. Chọn tệp PDF, PNG hoặc JPG, tối đa 20 MB.
3. Chọn **Lưu**.

Đánh giá bán trú chỉ dùng cho người có tên trong kỳ bán trú tương ứng.

Khi tệp đã có nhận xét của Ban Giám hiệu, hệ thống không cho thay tệp khác trong cùng kỳ.

### Đánh giá người khác

Nút **Đánh giá** chỉ xuất hiện khi tài khoản được phép theo chức vụ và phạm vi quản lý. Tạo ghi nhận lỗi nằm ở menu **Ghi nhận lỗi**, không còn trên trang này.

Khi thêm đánh giá:

1. Chọn đúng người và đúng kỳ.
2. Tải tệp nếu được phép.
3. Ban Giám hiệu nhập nhận xét vào phần **BGH đánh giá**.
4. Chọn **Lưu**.

## 5B. Lớp chủ nhiệm và điểm danh

Menu **Lớp chủ nhiệm** chỉ hiện khi nhóm quyền cho phép **Xem**, **Xem tối cao**, hoặc **Giám thị**. Giáo viên chỉ thấy lớp được phân công. Giám thị nhập file camera và phân loại vắng trong phạm vi được giao — không phải quyền xem toàn trường.

1. Chọn năm học trên trang tổng quan.
2. Mở lớp → **Danh sách học sinh** để xem sĩ số; Admin/Mod (hoặc GVCN được phép) có thể tải mẫu Excel và nhập danh sách. Nếu một dòng lỗi, hệ thống **không nhập dòng nào** và liệt kê từng dòng, cột, mã lỗi.
3. Giám thị vào **Nhập điểm danh camera**, chọn ngày/lớp, tải file `.xlsx`, xác nhận cột, rồi công bố. File trùng ngày khác nội dung phải chọn bổ sung hoặc thay quan sát camera.
4. Tab **Điểm danh** xem trạng thái camera gốc và trạng thái hiệu lực. Đổi có phép/không phép cần lý do; quan sát camera không bị ghi đè.
5. Tab **Báo cáo** xem tổng hợp và xuất XLSX/PDF trong đúng phạm vi.

Chưa dùng ảnh học sinh. Lịch ngày học/cảnh báo 08:30 chỉ chạy khi nhà trường đã cấu hình ngày học — không tự hiểu thứ bảy/chủ nhật.

## 5C. Ghi nhận lỗi

Menu **Ghi nhận lỗi** hiện theo nhóm quyền (**Ẩn** / **Xem** / **Xem tối cao**), độc lập với **Đánh giá nhân sự**.

- **Xem:** hai danh sách **Lỗi của tôi** và **Lỗi do tôi ghi nhận**. Tìm theo tên; lọc ngày vi phạm nằm trong **Tìm kiếm nâng cao**.
- Empty list hiện mặt cười và dòng **Không có lỗi nào được ghi nhận**.
- **Xem tối cao** (và admin/mod): cùng hai danh sách; xem được cả lỗi của người khác nếu mình là người bị ghi hoặc người ghi nhận.
- Nút **Thêm ghi nhận lỗi** nằm ở mục **Lỗi do tôi ghi nhận**, chỉ hiện với admin/mod và nhân sự từ 2★ trở lên. Nhân viên 1★ không có nút này dù đang Xem tối cao.

Khi thêm:

1. Chọn nhân sự được phép ghi nhận (theo chức vụ và phạm vi quản lý hiện tại).
2. Chọn ngày vi phạm.
3. Nhập lý do.
4. Đính kèm ảnh hoặc PDF làm căn cứ, tối đa 20 MB.
5. Chọn **Ghi nhận**.

## 6. Thông tin cá nhân

Vào **Thông tin cá nhân** để xem:

- Họ tên.
- Email đăng nhập.
- Vai trò.
- Phòng ban.
- Chức vụ.
- Nhóm quyền, nếu là User.

### Đổi mật khẩu

1. Nhập mật khẩu mới ít nhất 8 ký tự.
2. Nhập lại mật khẩu để xác nhận.
3. Chọn **Đổi mật khẩu**.

Nếu quên mật khẩu và không đăng nhập được, liên hệ Admin để được đặt lại mật khẩu tạm thời.

## 7. Đăng xuất

Chọn **Đăng xuất** ở góc trên bên phải khi kết thúc làm việc, đặc biệt khi sử dụng máy tính dùng chung.

## 8. Khi không thấy nút hoặc dữ liệu

- Kiểm tra đúng tài khoản đang đăng nhập.
- Tải lại trang một lần.
- Kiểm tra đã chọn đúng kỳ báo cáo hoặc khoảng ngày chưa.
- Một số nút chỉ xuất hiện khi đúng thời gian, đúng chức vụ hoặc đúng người được giao.
- Nếu menu không xuất hiện hoặc phạm vi dữ liệu chưa đúng, liên hệ Admin để kiểm tra phòng ban, chức vụ và nhóm quyền.
