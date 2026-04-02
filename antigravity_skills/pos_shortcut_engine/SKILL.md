---
name: pos_shortcut_engine
description: Cấu trúc phím tắt Numpad Đa tầng và Logic Buffer ngắt sự kiện
---
# Cấu trúc Phím Tắt POS Đa Tầng (Shortcut Engine)

Dự án Order Cafe sử dụng hệ thống bàn phím thu ngân siêu tốc 2 tầng. Để sửa đổi phần cứng này mà không gây bug dính phím, phải tuân thủ chuẩn mức sau:

## 1. Vấn đề "Component Con đăng ký sự kiện trước"
Trong React, Component con mounted TRƯỚC Component cha. Điều này có nghĩa nếu cả Thẻ cha `ShortcutProvider` và thẻ con `StaffOrderPanelInner` đều dùng `window.addEventListener('keydown')`, Thẻ con sẽ "thính" được cụm phím trước. Việc gọi `e.stopPropagation()` ở thẻ cha VÔ DỤNG.
- **Giải pháp bứt thiết:** Thẻ con PHẢI dùng callback được thẻ cha cung cấp là `isShortcutActive()` để dò hỏi trạng thái: *"Cha ơi, cha đang xử lý shortcut đúng không? Nếu đúng con sẽ không xử lý phím ESC tắt form hóa đơn lúc này"*.
- Hàm `isShortcutActive` cần được thiết kế qua `useCallback` rút logic từ **`useRef`**, không phải `useState` để tránh tình trạng Closure bị đọc trễ 1 frame khi truy xuất trong EventListener.

## 2. e.code và e.key không đồng nhất
- OS khác nhau sinh `e.key` Numpad khác nhau. Ở tầng 2 (bên trong SharedCustomizationModal), LUÔN LUÔN map biến qua hệ `e.code` (sẽ báo là `Numpad1`, `NumpadDecimal`, v.v... không phụ thuộc OS/Tiếng Việt Unikey).

## 3. Buffer Window Timeout
- Phím tắt Tầng 1 (ngoài màn hình POS) quy định timeout `1.5 giây` ở hàm Window Timeout, nếu không gõ tiếp chuỗi sẽ reset.
- Việc so sánh String trong Shortcut (Ví dụ: Tra cứu phím chọn độ Ngọt `0`) tuyệt đối dùng lệnh `startsWith('0')`, không dùng `.includes('0')` vì `'100%'.includes('0')` sẽ ra True gây lỗi chọn nhầm.
