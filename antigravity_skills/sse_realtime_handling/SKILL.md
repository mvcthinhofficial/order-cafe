---
name: sse_realtime_handling
description: Kiến trúc SSE Hybrid thay thế Polling, lưu ý bắt buộc về Public Endpoint và Fallback
---
# Kiến trúc Real-time Sync với SSE

Đây là luồng hoạt động chuẩn để đồng bộ hóa Kiosk tự phục vụ và Admin Dashboard với Server thời gian thực bằng công nghệ SSE (Server-Sent Events) - thay thế cho polling.

## 1. Bản chất Hybrid và Backend
- Backend (`server.cjs`) có hàm `broadcastEvent(eventName, data)` quản lý SSE.
- 9 thao tác làm thay đổi hóa đơn (`create`, `pay`, `complete`...) đều gọi `broadcastEvent('ORDER_CHANGED')`.
- Event Source (Client API Browser Node) không hỗ trợ Header `Authorization: Bearer <TOKEN>`.
- **CỰC KỲ QUAN TRỌNG:** API Route của SSE (`/api/events`) BẮT BUỘC phải nằm trong vùng Whitelist (Miễn chứng thực) của Middleware hệ thống. Nếu không, Kiosk sẽ bị dội lại Status Code `401 Unauthorized` liên tục, gây kẹt vòng lặp Reconnect mỗi 5 giây.

## 2. Client Side Debounce
- Việc thay đổi State React từ event SSE nếu xảy ra quá nhiều `ORDER_CHANGED` trong 1 giây sẽ gây kẹt UI Thread.
- **Kiosk:** `debounce 200ms` trước khi gọi HTTP request `fetchPendingOrders()`. Suy ra Kiosk chỉ thực sự query vào CSDL SQLite mỗi 200ms, vừa đảm bảo thời gian thực, vừa chống spam API.

## 3. Quyền năng Backup
- Dù đã có SSE cực nhanh, Kiosk TỰ ĐỘNG fallback về lại chế độ Polling Background cứ `10 giây/lần` (để nếu SSE bị timeout / Cloudflare bóp băng thông, trạng thái vẫn tiếp tục được cập nhật). Không bao giờ dựa 100% vào mạng mảng SSE.
- `KIOSK_QR_DEBT` sẽ trigger ngay một cửa sổ thanh toán QR thay vì phải đợi hàm polling 2s phát hiện `posCheckoutSession`.
