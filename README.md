# ☕️ Order Cafe - Hệ Thống Quản Lý Quán Cà Phê Chuyên Nghiệp

Chào mừng bạn đến với **Order Cafe**, giải pháp quản lý đa nền tảng (Windows, macOS, Linux) giúp tối ưu hóa quy trình bán hàng, nhân sự và kiểm soát doanh thu cho quán cà phê của bạn.

---

## 🚀 Tải về bản mới nhất
Để đảm bảo trải nghiệm tốt nhất, hãy luôn tải về phiên bản mới nhất tại đây:
👉 **[Tải về Order Cafe (Bản mới nhất)](https://github.com/mvcthinhofficial/order-cafe/releases/latest)**

---

## 💻 Hướng dẫn Cài đặt

### 1. Dành cho Windows
- Tải file có đuôi `.exe` (ví dụ: `Order-Cafe-Setup-1.0.4.exe`).
- Nhấn đôi vào file để bắt đầu cài đặt.
- **Lưu ý:** Nếu Windows hiện cảnh báo "SmartScreen", hãy nhấn *More info* -> *Run anyway*.

### 2. Dành cho macOS
- Tải file có đuôi `.dmg` (ví dụ: `Order-Cafe-1.0.4.dmg`).
- Mở file `.dmg` và kéo biểu tượng **Order Cafe** vào thư mục **Applications**.
- Lần đầu mở, nếu macOS báo lỗi bảo mật, hãy vào *System Settings* -> *Privacy & Security* -> Nhấn *Open Anyway*.

### 3. Dành cho Linux Server (Cần cài đặt PM2)
Hệ thống Server chạy trên Node.js. Các bước cài đặt:
1. Tải bản `.tar.gz`.
2. Giải nén và chạy lệnh:
   ```bash
   npm install
   pm2 start server.cjs --name order-cafe-server
   ```

---

## ⚙️ Hướng dẫn Sử dụng & Cập nhật

### 1. Đồng bộ dữ liệu
- Khi mở ứng dụng lần đầu, hãy thiết lập địa chỉ Server (IP hoặc Domain) để các máy khách (Kiosk) có thể kết nối với máy chủ trung tâm.

### 2. Cập nhật hệ thống (Auto-Update)
- **Desktop (Win/Mac):** Khi có bản mới, một thông báo sẽ hiện lên. Bạn chỉ cần nhấn đồng ý, ứng dụng sẽ tự động tải và cài đặt lại.
- **Linux Server:** Vào **Admin Dashboard** -> **Cài đặt** -> **Cập nhật hệ thống** (Mục 14). Nhấn nút cập nhật, server sẽ tự động làm mới mã nguồn mà không cần can thiệp thủ công.

---

## 🛠 Yêu cầu Hệ thống
- **Windows:** Win 10 trở lên.
- **macOS:** Monterey trở lên.
- **Server:** Node.js v18+, PM2.

---

## 📞 Hỗ trợ
Nếu gặp bất kỳ khó khăn nào trong quá trình cài đặt, vui lòng liên hệ đội ngũ kỹ thuật qua mục Issues trên GitHub này.

---
*Phát triển bởi [mvcthinhofficial](https://github.com/mvcthinhofficial)*
