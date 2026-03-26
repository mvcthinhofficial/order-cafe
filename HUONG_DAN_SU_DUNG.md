# HƯỚNG DẪN SỬ DỤNG PHẦN MỀM TH-POS

**Phần mềm TH-POS** là giải pháp quản lý bán hàng chuyên nghiệp dành cho quán cafe, đặc biệt phù hợp với mô hình kinh doanh mang đi (take-away) cũng như các cơ sở kinh doanh vừa và nhỏ. Hệ thống cung cấp khả năng quản lý toàn diện, tự động tính toán tồn kho và hỗ trợ phân tích điểm hòa vốn một cách chính xác.

Dưới đây là các bước thiết lập và sử dụng cơ bản:

---

### BƯỚC 1: HỆ THỐNG THỰC ĐƠN (MENU)
Để bắt đầu bán hàng, đầu tiên bạn cần tạo danh sách thực đơn.
- **Tạo món mới:** Vào mục Cài đặt -> Thực đơn -> Thêm món. Hệ thống cung cấp hướng dẫn từng bước để thiết lập thông tin món.
- **Định lượng nguyên vật liệu:** Lưu ý nhập đầy đủ định lượng nguyên vật liệu cấu thành nên món ăn/thức uống. Nếu chưa khai báo dữ liệu nguyên vật liệu trên kho, có thể tạm thời bỏ qua phần định lượng này để tiến tới Bước 2.

### BƯỚC 2: QUẢN LÝ VÀ NHẬP KHO NGUYÊN VẬT LIỆU
Bước này hỗ trợ nhập kho nguyên vật liệu và thiết lập đơn vị đo lường cơ sở.
- **Hướng dẫn nhập kho:** Cần lưu ý cách chia nhỏ đơn vị đo lường để quản lý tồn kho chính xác. Lấy ví dụ từ dữ liệu mẫu đang có sẵn của phần mềm: "Cacao" được lưu dưới đơn vị "g", "Sữa tươi" dưới đơn vị "ml", "Cà phê" là "g".
- **Liên kết thực đơn:** Từ các nguyên liệu của Bước 2, người dùng tiến hành nhập trở lại phần công thức của từng món trong thẻ Thực đơn (Bước 1).
- **Tính toán theo công thức:** Những món bán ra sẽ tính toán tự động dựa trên những nguyên liệu được nhập vào. Từng loại kích cỡ (Size S, M, L) sẽ được liên kết với một công thức định lượng khác nhau, dựa vào thiết lập của hệ thống.

### BƯỚC 3: MÀN HÌNH BÁN HÀNG (ORDER & SHORTCUTS)
Hệ thống cho phép thao tác tạo đơn hàng nhanh chóng và chính xác.
- **Mã gọi nhanh:** Mỗi danh mục sản phẩm quy định mã số gọi món nhanh. Khuyến nghị mỗi danh mục nên giới hạn từ 9 món trở xuống để tối ưu hóa tốc độ xuất hóa đơn (Việc duy trì ít số lượng món để tập trung bán hàng sẽ đem lại hiệu năng tốt hơn).
- **Tùy chọn thêm (Topping):** Mỗi đơn hàng có thể đi kèm topping riêng. Đề xuất quy ước đánh số giống nhau đối với cùng một loại nhóm topping để nhân viên dễ dàng ghi nhớ.
- **Hướng dẫn phím tắt (Nhập liệu bằng bàn phím số Numpad):** 
  + Gõ **Mã Món** (Ví dụ `12`) để đưa món vào Order nhanh chóng.
  + Nhấn phím `. (Chấm)` để thay đổi và chọn Size.
  + Nhấn `- (Trừ)` tiếp theo là số (Ví dụ `-0` hoặc `-5`) để tùy chỉnh mức Đường.
  + Nhấn `/ (Chia)` tiếp theo là số (Ví dụ `/0` hoặc `/5`) để tùy chỉnh mức Đá.
  + Nhấn `* (Nhân)` tiếp theo là số (Ví dụ `*2` hoặc `*5`) để chọn số lượng ly.
  + Phím **Enter** mặc định dùng để chốt hóa đơn hoặc hoàn tất đơn nhanh. Phím **ESC** để hủy lệnh.

### BƯỚC 4: QUẢN LÝ NHÂN SỰ VÀ CHẤM CÔNG
Hệ thống tích hợp công cụ ghi nhận thời gian làm việc của nhân viên.
- **Chấm công nhân sự:** Hướng dẫn nhân sự sử dụng mã PIN bảo mật cá nhân (6 số) để thao tác ORDER trên máy POS, Check-In và Check-Out trực tiếp thông qua QR Code trên phần mềm.
- **Báo cáo nhân viên:** Quản lý có thể xem chi tiết thời gian làm việc cũng như kết xuất báo cáo lịch sử giờ công của từng thành viên.

### BƯỚC 5: KIỂM ĐẾM KHO (AUDIT)
Chức năng hỗ trợ đối chiếu rủi ro thất thoát trong quá trình kinh doanh.
- **Quy trình kiểm kho:** Người sử dụng có thể nhập trực tiếp số lượng nguyên liệu đếm được trên thực tế vào bảng theo dõi.
- **Kết quả tồn kho:** Phần mềm sẽ dùng các thông số này để kiểm tra kết quả tồn kho và hiển thị các số dư hoặc thiếu để kịp thời khắc phục.

### BƯỚC 6: HỆ THỐNG BÁO CÁO KINH DOANH
Cung cấp bức tranh báo cáo tài chính tổng thể của cửa hàng theo thời gian thực.
- **Xem báo cáo:** Hỗ trợ kiểm tra mọi báo cáo số liệu, từ bán hàng, tồn kho cho đến nhân sự.
- **Báo cáo chi tiết (Master Ledger):** Lưu vết toàn bộ lịch sử đơn hàng. Cung cấp minh bạch "Giờ Lập Bill" và "Giờ Hoàn Tất". Nếu quán dùng chế độ "Thanh toán sau", báo cáo sẽ tự động tính toán "Thời gian khách ngồi" nhằm đo lường hiệu suất phục vụ.
- **Phân tích điểm hòa vốn (Break-Even & Benchmarking):** Hệ thống tích hợp công cụ máy tính điểm hòa vốn chuyên sâu:
  + Cho phép nhập "Doanh thu dự kiến" để đo lường % tỷ trọng của từng nhóm chi phí cố định (Mặt bằng, Điện nước, Nhân sự).
  + Hệ thống thanh tiến trình (ProgressBar) cảnh báo màu sắc mức độ an toàn (Xanh/Vàng/Đỏ) theo chuẩn ngành F&B.
  + Đối chiếu "Lợi nhuận ròng dự phóng" dựa trên mức % Giá vốn mục tiêu (VD: 35%) so với "Lợi nhuận ròng thực tế" (Actual COGS) để có chiến lược điều chỉnh giá bán và cắt giảm hao hụt nguyên liệu.

### BƯỚC 7: QUẢN LÝ ĐẦU TƯ & CHI PHÍ HOẠT ĐỘNG
Kiểm soát dòng tiền ra (Cash-Out) và tự động đồng bộ chéo với hệ thống phân tích báo cáo.
- **Ghi Phiếu Chi thông minh:** Khai báo các khoản chi đầu tư (Máy móc, trang trí) và vận hành (Mặt bằng, điện nước, rác, lương). Popup Ghi phiếu chi tự động gợi ý nội dung (Smart Suggestions) dựa trên lịch sử để tinh gọn thao tác.
- **Đồng bộ tự động vĩ mô (Auto-Sync):** Các khoản định phí thực tế (Chi phí trung bình 30 ngày) sinh ra từ Phiếu chi sẽ được hệ thống trích xuất và đồng bộ tự động ngược về "Máy tính Điểm hòa vốn", loại bỏ việc phải nhập liệu ước tính bằng tay. Chi phí đầu tư máy móc được hệ thống tự hiểu và chia đều Khấu hao theo mốc 1 năm (12 tháng).

### BƯỚC 8: QUẢN LÝ DỮ LIỆU HÀNG LOẠT (IMPORT/EXPORT)
Hệ thống cho phép khởi tạo Kho hoặc đồng bộ thông tin (Giá/Mức tồn) cho hàng trăm mã nguyên liệu thông qua file bảng tính (giải pháp CSV để tối ưu hóa thay cho Excel).
- **Tải File Dữ Liệu:** Quản lý bấm để tải file Danh mục Nguyên liệu hiện hành về máy tính, mở bằng Microsoft Excel hoặc Google Sheets để bổ sung tên món, đơn vị tính, hoặc cập nhật thông tin định mức mới nhất.
- **Nhập File Vào Kho:** Sau khi lưu dạng .CSV, hệ thống sẽ tự động đối chiếu, cập nhật các mã hiện tại và tự sinh mã hệ thống cho các nguyên liệu mới được khai báo trong bảng tính. Nhờ đó quy trình tinh chỉnh kho bãi diễn ra siêu tốc với 1 Click chuột.

---
*Văn bản Hướng dẫn sử dụng phần mềm TH-POS chính thức.*
