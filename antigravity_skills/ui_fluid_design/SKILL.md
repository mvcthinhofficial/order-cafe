---
name: ui_fluid_design
description: Kiến trúc CSS Variables động, vấn đề Scanner của Tailwind và quy tắc Touch Target trên di dộng/tablet
---
# Hệ thống giao diện tùy biến (Design Tokens) & Fluid Design

Kỹ năng này cung cấp các nguyên lý về xây dựng giao diện tùy chỉnh và cách khắc phục lỗi Silent Fallback của Tailwind.

## Sự số biên dịch (JIT Scanner Tailwind 4)
- Mặc định Tailwind CSS 4 sử dụng JIT (Just in Time) scanner.
- Nếu thêm mới một class mang tính định hướng (vd: `p-7`, `px-7`, `py-6`, `pl-7`, `pr-7`, `pt-7`, `pb-7`) mà codebase chưa có sẵn, JIT sẽ không phát hiện ra.
- Hậu quả: Không sinh CSS -> thuộc tính đó có giá trị `0`, khiến nội dung dính sát viền mặc dù code có class.
- **Cách khắc phục bắt buộc:** Dùng `style={{ padding: '28px' }}` trên thẻ thay cho class tiện ích. Điều này áp dụng với MỌI container (thẻ cha, header, footer của modal/card). Không dùng Tailwind classes cho padding động trong trường hợp này.

## Giao diện tùy biến theo CSS Variables (Single Source of Truth)
- Tuyệt đối không dùng mã màu Hardcode như `#007AFF` hay `bg-blue-600`. Sử dụng class màu động chuẩn hệ thống (vd: `var(--color-brand)`) hoặc biến Tailwind đã config sẵn khớp hệ thống cũ.
- Khi tạo bo viền, không dùng `rounded-none`, hãy dùng `style={{ borderRadius: 'var(--radius-card)' }}` hoặc các biến tương tự: `--radius-btn`, `--radius-modal`, `--radius-input`.

## Touch Target & Safe Spacing (iPad/Mobile)
- Mọi Card/Modal CẦN thiết lập padding bao bên trong ít nhất 20px (gợi ý `var(--spacing-card, 20px)`).
- Mọi thiết kế chạm bấm (Button, TouchableRow): sử dụng style inline `minHeight: '44px'` để tương thích chuẩn với chuẩn ngón tay cảm ứng trên iPad.
- Tiêu đề Form trên di động phải to rõ (24px). Chữ thường dùng font-weight chuẩn.
- Các list cần hiển thị trên một không gian bị ép chiều dọc phải giới hạn bằng cờ `min-h-0` của khu vực đó để trình duyệt cho phép cuộn nội dung, tránh ép cha đẩy lùi thẻ tiếp theo xuống.
