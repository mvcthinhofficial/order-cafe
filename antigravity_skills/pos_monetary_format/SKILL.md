---
name: pos_monetary_format
description: Nguyên tắc lưu trữ Backend tĩnh và định dạng Tiền tệ nghìn VND trong UI
---
# QUY TẮC HIỂN THỊ VÀ TÍNH TOÁN GIÁ TIỀN

Kỹ năng này định nghĩa chuẩn mực cao nhất để không xảy ra lỗi khi tính toán tổng số tiền giỏ hàng (Cart) và hiển thị ra UI.

## Quy tắc Hệ cơ số DB
- Giá tiền LUÔN ĐƯỢC LƯU Ở ĐƠN VỊ NGHÌN ĐỒNG: `(price: 21) -> (21,000 VND)`
- TUYỆT ĐỐI KHÔNG nhân giá trị với 1000 trước khi gửi lên API hay khi lưu trạng thái trong Redux/React Context. Làm vậy sẽ khiến dữ liệu sai tỷ lệ `1000 lần` (`21000` -> `21.000.000 ₫`).

## Quy tắc Form Nhập Liệu
- Mọi Form nhập số tiền trong UI (ví dụ thêm Add-on, Chỉnh Promo) phải kèm theo chữ `.000đ` dính liền.
- Cách sử dụng: Dùng `CurrencyInput` trong `src/utils/dashboardUtils.jsx` hoặc chèn manual 1 thẻ `span` inline.
- KHÔNG sử dụng ký tự `k`, `nghìn`, `K`.

## Ứng dụng khi thanh toán & Checkout
- VietQR API nhận giá nguyên tệ (VND thuần): `amountVND = Math.round(price_in_thousands * 1000)`
- Logic tính tiền tổng bill chạy qua hàm `reduce` trên array `cartItems`, nhân lấy giá trị nguyên thủy các fields và chỉ dùng hàm format VND (`formatVND` từ `src/utils/timeUtils.js`) ở bước render text string cuối cùng lên UI HTML.
