---
name: ui_fluid_design
description: Kiến trúc CSS Variables động, Tailwind JIT Scanner, Touch Target iPad/Mobile, Muscle Memory Color System, và các pattern tối ưu cho POS cảm ứng
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

---

## Muscle Memory Color System (POS Cảm ứng — 03/04/2026)

### Triết lý thiết kế
Dành cho giao diện cần phản ứng cực nhanh (POS, bếp, kho) — không có thời gian đọc chữ:
- **Chưa chọn:** Nền trắng + chữ màu → đọc được nội dung, không gây nhiễu thị giác
- **Đã chọn:** Nền ĐẶC full màu + chữ TRẮNG + icon ✓ → nhận ra ngay, không thể nhầm
- **Không dùng `boxShadow: inset` hay `opacity` để đánh dấu selected** — quá mờ, thiếu độ tương phản

```jsx
// Pattern chuẩn cho mỗi button trong Muscle Memory System
<button
  style={{
    backgroundColor: isSel ? color.solid : '#FFFFFF',
    color: isSel ? '#FFFFFF' : color.label,
    borderColor: isSel ? color.solid : '#111111', // border cũng đổi màu
    touchAction: 'manipulation',     // ← BẮT BUỘC: loại 300ms delay iOS
    userSelect: 'none',              // ← BẮT BUỘC: chặn context menu iOS
    WebkitUserSelect: 'none',
  }}
>
```

### Ánh xạ màu theo trực giác
| Nhóm | Ánh xạ | Màu |
|------|---------|-----|
| **Đường (% ngọt)** | 0% Xám → 30% Vàng → 50% Cam → 100% Đỏ → 120% Đỏ đậm | Ngọt tăng = nóng tăng |
| **Đá (lượng)** | Không đá=Đỏ, Ít đá=Xanh nhạt, Bình thường=Xanh, Nhiều đá=Xanh đậm | Lạnh tăng = xanh đậm dần |
| **Size** | S=Xanh lá, M=Xanh dương, L=Tím, XL=Vàng cam | Mỗi size 1 màu riêng biệt |
| **Addon** | Slot 1=Hồng, 2=Tím, 3=Ngọc, 4=Cam | Màu riêng từng slot, không tùy thuộc nội dung |

### Dynamic font-size cho label (ít option = chữ to hơn)
```jsx
const labelFontSize = options.length <= 2 ? '20px' : options.length <= 3 ? '17px' : '13px';
```

---

## iPad Touch Optimization Checklist

### Bắt buộc cho mọi overlay/HUD trên iOS/iPadOS:

```jsx
// 1. Hằng số dùng chung — đặt ngoài component để không re-create
const BTN_TOUCH_STYLE = {
  touchAction: 'manipulation', // loại bỏ 300ms double-tap delay
  userSelect: 'none',
  WebkitUserSelect: 'none',
};

// 2. Không dùng backdrop-blur trên overlay có animation
// backdrop-blur → GPU compositing → giật lag khi AnimatePresence
// ❌ <div className="backdrop-blur-sm bg-black/70">
// ✅ <div style={{ background: 'rgba(0,0,0,0.4)' }}>

// 3. Touch target tối thiểu 44×44px (Apple HIG)
// Column side panel trong HUD: tối thiểu 96px wide
// Row header/footer: tối thiểu h-[54px] hoặc h-[15%] của container

// 4. Swipe gesture chuẩn (không dùng thư viện nặng)
onTouchStart={(e) => { window._swipeStartX = e.touches[0].clientX; }}
onTouchEnd={(e) => {
  const dx = e.changedTouches[0].clientX - window._swipeStartX;
  if (dx > 70) { /* swipe right */ }
  window._swipeStartX = undefined;
}}
```

### Giới hạn grid columns theo breakpoint:
```jsx
useEffect(() => {
  const clamp = () => {
    if (window.innerWidth < 810) setGridColumns(c => Math.min(c, 4));
  };
  clamp();
  window.addEventListener('resize', clamp);
  return () => window.removeEventListener('resize', clamp);
}, [trigger]);
```

### Cảnh báo 1 lần (one-time toast):
```jsx
const WARNED_KEY = 'feature_warned_v1'; // đổi key khi logic cảnh báo thay đổi
if (!localStorage.getItem(WARNED_KEY)) {
  showToast('Thông báo...', 'info');
  localStorage.setItem(WARNED_KEY, '1');
}
```

---

## Flash Success Pattern (Xác nhận hành động cảm ứng)

Dùng khi không có âm thanh hay rung — cần visual acknowledgement tức thì:

```jsx
const [confirmed, setConfirmed] = useState(false);

const handleConfirm = useCallback((e) => {
  e.stopPropagation();
  if (confirmed) return; // chặn double-trigger trong thời gian flash

  setConfirmed(true);
  setTimeout(() => {
    // thực hiện action
    doAction();
    setConfirmed(false);
  }, 280); // 280ms = đủ để mắt nhận ra, không quá lâu để chờ
}, [confirmed, ...deps]);

// Trong JSX — đổi màu dựa trên state
style={{ backgroundColor: confirmed ? '#16A34A' : '#ea580c' }} // cam → xanh lá
```

**Quy tắc:**
- Thời gian flash: 250-300ms (quá ngắn không nhận ra, quá dài cảm giác lag)
- Màu flash: xanh lá `#16A34A` cho success, đỏ `#DC2626` cho error
- Guard `if (confirmed) return` để chặn double-tap trigger 2 lần

---

## Quantity Control Pattern (POS In-place)

Bộ điều chỉnh số lượng nhỏ gọn trong overlay — không mở modal mới:

```jsx
// State
const [quantity, setQuantity] = useState(1);

// Reset trong useEffect khi overlay mở
useEffect(() => {
  if (isActive) { setQuantity(1); /* reset các state khác */ }
}, [isActive]);

// JSX — đặt ở góc overlay, onClick phải stopPropagation
<div onClick={(e) => e.stopPropagation()} style={{ ...BTN_TOUCH_STYLE }}>
  <button onClick={() => setQuantity(q => Math.max(1, q - 1))}
    style={{ minWidth: 32, minHeight: 32 }}>−</button>
  <span>{quantity}</span>
  <button onClick={() => setQuantity(q => Math.min(9, q + 1))}
    style={{ minWidth: 32, minHeight: 32 }}>+</button>
</div>
```
