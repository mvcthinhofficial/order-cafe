# HƯỚNG DẪN BẢO TRÌ VÀ CẬP NHẬT TRÊN MÁY CHỦ LINUX (MẠNG LAN)

Tài liệu này dành cho Quản trị viên (hoặc các phiên AI sau này) để biết cách hệ thống đang được triển khai trên máy chủ Linux nội bộ.

## 1. Kiến trúc hệ thống hiện tại
- **Mã nguồn gốc (Dev):** Đang nằm trên Mac Mini của anh Thịnh.
- **Máy chủ chạy thực tế (Production):** Máy chủ Linux (IP: `192.168.1.6`, User: `mvcthinh`).
- **Phân tách dữ liệu:** Lõi phần mềm (`server.cjs`, `dist/`) có thể cập nhật liên tục, nhưng thư mục **`data/` (chứa Database JSON bán hàng)** trên máy Linux phải được **BẢO TOÀN TUYỆT ĐỐI**, không được phép để máy Mac chép đè lên, nếu không sẽ làm mất lịch sử đơn hàng và tồn kho của quán đang chạy Live.

## 2. Quy trình Cập nhật (Update / Sync) an toàn
Mỗi khi AI lập trình hoặc thay đổi mã nguồn trên máy Mac xong, để đưa tính năng mới sang Linux:

1. Chạy lệnh Build Giao diện trên máy Mac:
   ```bash
   npm run build
   ```
2. Mở file `deploy_linux.sh` và chạy lệnh này để nó tự động tóm gọn cấu hình lõi:
   ```bash
   ./deploy_linux.sh
   ```
*(Lưu ý: File `deploy_linux.sh` đã được hệ thống cấu hình để "Lờ đi" thư mục `data/` nhằm bảo vệ Database trên máy Linux không bị ghi đè. Lệnh `tar` chỉ gom `server.cjs`, `package.json`, và Web App `dist/`)*

3. PM2 trên Linux sẽ tự động khởi động lại (Zero Downtime) nhờ các câu lệnh SSH tự động có sẵn trong file bash.

## 3. Cấu hình Ports & Tránh xung đột
- Do Vite dev server mặc định sử dụng Port 5173, Backend (Node.js) đã được quy định cố định chạy ở **Port 3001** để tránh xung đột mất dữ liệu (như hiện tượng API trả HTML thay vì JSON).
- Trên máy Mac: Frontend chạy qua `npm run dev` (Port 5173), Backend là Port 3001. Frontend sẽ gọi Backend qua `http://localhost:3001`.
- Trên Linux: PM2 chạy `server.cjs` ở Port 3001 phục vụ CẢ API CẪN STATICS (Thư mục `dist`). Cloudflare Tunnel và mạng LAN đều trỏ thẳng vào IP Linux Port 3001.
- Nếu cần đổi port, không can thiệp vào mã nguồn mà chạy `export PORT=...` trước khi start PM2.

## 4. Khắc phục sự cố (Dành cho AI các phiên sau)
- Khi thêm thư viện ngoại (Package `npm` mới) vào hệ thống: Nếu sau khi chạy Script mà Server Linux báo lỗi `MODULE_NOT_FOUND`, yêu cầu AI nhắc người dùng SSH vào Linux và chạy `npm install` trong thư mục `~/order-cafe` để cập nhật `package.json`.
- Danh sách công cụ Server Cần Có: 
  - `pm2` (Để quản lý ngầm)
  - `Node.js` v18 trở lên.
  - SSH User Password.

*-- Tài liệu này được tạo tự động để duy trì vòng đời phần mềm an toàn --*
