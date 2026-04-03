---
name: ui_fluid_design
description: Quy tắc thiết kế UI nhất quán, responsive và fluid cho toàn bộ Admin Dashboard. Bao gồm chuẩn button 36px, responsive label pattern, modal overflow-y-auto, mobile-first component density, form flex-wrap, và typography standard.
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

---

## ⚠️ QUY TẮC HOLISTIC UI AUDIT (BẮT BUỘC — 03/04/2026)

> **"Không bao giờ sửa 1 tab rồi dừng lại."**

Khi user yêu cầu sửa UI ở một tab cụ thể, AI PHẢI tự hỏi:
> *"Các tab khác trong cùng hệ thống có đang bị vấn đề tương tự không?"*

Nếu không tự hỏi → kết quả là giao diện **thiếu nhất quán** — một chỗ đẹp, chỗ khác vẫn cũ.

### Checklist audit khi sửa toolbar/header button:
1. **Quét TẤT CẢ tab files** (`OrdersTab`, `MenuTab`, `InventoryTab`, `StaffTab`, ...) ngay sau khi sửa xong tab đầu tiên
2. Dùng grep để tìm nhanh: `grep -n "minHeight\|text-\[9px\]\|borderRadius: '999px'\|hidden md:inline\|md:hidden"` trên toàn bộ `AdminDashboardTabs/`
3. Nếu phát hiện tab khác dùng chuẩn khác → sửa luôn, báo cáo cho user
4. **Luôn verify bằng cách list diff** sau khi sửa

### Pattern chuẩn — Responsive Button Label (desktop full / mobile rút gọn)

```jsx
// ✅ Pattern chuẩn: desktop đầy đủ, mobile rút gọn
<button style={{ minHeight: '36px', padding: '0 12px', borderRadius: 'var(--radius-badge)' }}
        className="font-black text-xs sm:text-sm uppercase tracking-widest">
  <Icon size={13} />
  <span className="hidden md:inline">TÊN ĐẦY ĐỦ CHỨC NĂNG</span>
  <span className="md:hidden">VIẾT TẮT</span>
</button>

// ✅ Toggle button với dot indicator — icon-only trên mobile
<button ...>
  <Icon size={13} />
  <span className="hidden md:inline">TÊN ĐẦY ĐỦ</span>
  {/* KHÔNG có md:hidden span — mobile chỉ thấy icon + dot */}
  <span className={`w-5 h-2.5 rounded-full ${active ? 'bg-green-400' : 'bg-slate-200'}`} />
</button>

// ❌ Sai — text quá nhỏ (không đọc được):
<span className="text-[9px]">CSV</span>

// ❌ Sai — không có mobile fallback, desktop cũng mất text:
<span className="hidden sm:inline">PREFIX </span>WORD  // ← "WORD" vẫn show, nhưng PREFIX mất

// ❌ Sai — pill shape không theo design token:
style={{ borderRadius: '999px' }}  // ← dùng var(--radius-badge) thay thế
```

### Breakpoint sử dụng thống nhất trong project:
| Breakpoint | Tailwind | Khi nào dùng |
|---|---|---|
| `md` (768px) | `hidden md:inline` / `md:hidden` | Ẩn/hiện text theo desktop/mobile — **CHUẨN CHÍNH** |
| `sm` (640px) | `hidden sm:inline` / `sm:hidden` | Chỉ dùng khi cần mức trung gian (tablet nhỏ) |

> ⚠️ **KHÔNG mix `sm` và `md` trên cùng một toolbar** — chọn 1 breakpoint, dùng nhất quán.

---

## ⚠️ QUY TẮC MOBILE-FIRST COMPONENT (BẮT BUỘC — 03/04/2026)

> Phát hiện từ audit session: mỗi tab dùng layout riêng → giao diện **không nhất quán** khi chuyển tab.

### Rule 1: Component Density Rule — "Phần tử phụ phải collapse trên mobile"

Bất kỳ component nào có **secondary content** (QR code, metadata panel, action icon sets, stats grid) phải:
- `sm+`: hiện đầy đủ
- `mobile (<sm)`: collapse → nút nhỏ compact OR ẩn hoàn toàn

```jsx
// ✅ QR trong staff card
<div className="hidden sm:flex ...">  {/* Full QR — chỉ tablet+ */}
    <QRCodeCanvas size={140} />
</div>
<button className="sm:hidden ...">   {/* Compact button — chỉ mobile */}
    <QrCode size={12}/> QR CHẤM CÔNG
</button>

// ✅ Action icons trong product card — ẩn phụ trên mobile
<button className="hidden sm:flex ..."><ArrowUp /></button>    {/* Sắp xếp */}
<button className="hidden sm:flex ..."><BookOpen /></button>   {/* Công thức */}
<button className="hidden sm:flex ..."><Copy /></button>       {/* Sao chép */}
<button className="flex ..."><Pencil /></button>              {/* Sửa — LUÔN hiện */}
<button className="flex ..."><Trash2 /></button>              {/* Xóa — LUÔN hiện */}
```

**Quy tắc phân loại:**
| Loại | Desktop | Mobile |
|---|---|---|
| Critical (edit, delete, confirm) | ✅ Hiện | ✅ Hiện |
| Secondary (sort, duplicate, view-detail) | ✅ Hiện | ❌ Ẩn (`hidden sm:flex`) |
| Informational (QR, stats chart) | ✅ Hiện full | 📦 Collapse → icon/button |

---

### Rule 2: Form Flex-wrap Rule — "Form nhiều cột phải tự co"

Mọi form có **3+ input trên 1 hàng** phải dùng `flex-wrap` + `min-w` để tự nhiên xuống hàng:

```jsx
// ✅ Đúng — tự wrap khi hẹp, không cắt text
<div className="flex flex-wrap gap-2 items-start">
    <input className="flex-[3] min-w-[160px]" />   {/* wrap first nếu không đủ chỗ */}
    <div className="flex-shrink-0" style={{ minWidth: '90px' }} />
    <select className="flex-[2] min-w-[100px]" />
</div>

// ❌ Sai — 3 items trong 1 hàng không có min-w → text bị cắt trên mobile
<div className="flex gap-2">
    <input className="flex-[3] min-w-[100px]" />  {/* quá nhỏ, cắt thành "CAFE Đ" */}
    <div style={{ minWidth: '90px' }} />
    <select className="flex-[2] min-w-[80px]" />  {/* quá nhỏ */}
</div>

// ✅ Hoặc dùng grid responsive
<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
    <input />   <select />
</div>
```

**Ngưỡng min-w tham khảo cho màn 430px:**
- Field tên (chính): `min-w-[160px]` → wrap trước tiên
- Field số/giá: `min-w-[90px]` → compact nhất
- Field select: `min-w-[100px]` → cần đủ chỗ hiển thị option

---

### Rule 3: "5 câu hỏi Mobile-First" — Checklist bắt buộc

Trước khi mark xong bất kỳ component mới nào, phải tự hỏi:

| # | Câu hỏi | Kiểm tra |
|---|---|---|
| 1 | Layout có `flex-col sm:flex-row` chưa? | Outer container |
| 2 | Form có `flex-wrap` + `min-w` chưa? | Inner form row |
| 3 | Secondary content (QR, stats) có collapse trên mobile chưa? | `hidden sm:flex` |
| 4 | Icon action bar còn ≤ 2-3 icon trên mobile? | `hidden sm:flex` cho phụ |
| 5 | Sau khi sửa 1 tab, đã audit tất cả tab khác chưa? | Holistic audit |
| 6 | **Typography có nhất quán giữa tất cả tab chưa?** | Xem bảng bên dưới |

---

## ⚠️ QUY TẮC TYPOGRAPHY NHẤT QUÁN (BẮT BUỘC — 03/04/2026)

> Phát hiện: mỗi tab dùng font-size riêng cho tiêu đề (NV: `sm:text-lg`, MENU: `sm:text-xl`, KHO: `sm:text-xl`) → khi chuyển tab, chữ tiêu đề thay đổi kích thước → **cảm giác "ứng dụng khác nhau"**.

### Typography Standard — Bảng chuẩn bắt buộc

| Loại element | Class chuẩn | Ghi chú |
|---|---|---|
| **Page/Tab Title** | `text-base sm:text-xl font-black` | Tất cả tab PHẢI dùng như nhau |
| **Section header (h3)** | `text-xs sm:text-sm font-black uppercase tracking-wider` | Trong content area |
| **Sub-tab button label** | `text-[10px] sm:text-[11px] font-black uppercase tracking-wider` | Kèm `whitespace-nowrap` |
| **Toolbar button label** | `text-[10px] sm:text-xs font-black uppercase tracking-widest` | `hidden md:inline` trên label |
| **Card label (tiny)** | `text-[9px] sm:text-[10px] font-black uppercase tracking-widest` | Luôn uppercase |
| **Card value (big number)** | `text-lg sm:text-2xl font-black` | Hoặc `clamp(15px, 4vw, 22px)` |
| **Period/filter button** | `text-[10px] sm:text-xs font-black uppercase tracking-wider` | `whitespace-nowrap` |

### Anti-patterns cần tránh

```jsx
// ❌ Sai — mỗi tab 1 size khác nhau
// NV tab:
<h3 className="text-sm sm:text-lg ...">QUẢN LÝ NHÂN SỰ</h3>   // sm:text-lg

// MENU tab:
<h3 className="text-base sm:text-xl ...">Thực đơn</h3>          // sm:text-xl

// KHO tab:
<h3 className="text-sm sm:text-xl ...">Chi phí & Kho</h3>       // text-sm (mobile khác)

// ✅ Đúng — tất cả tabs dùng CÙNG 1 pattern
<h3 className="text-base sm:text-xl font-black text-gray-900">...</h3>
```

```jsx
// ❌ Sai — section h3 dùng font-bold (nhẹ hơn)
<h3 className="font-bold uppercase tracking-wider text-sm">Bảng Sức khỏe</h3>

// ✅ Đúng — font-black + responsive
<h3 className="font-black uppercase tracking-wider text-xs sm:text-sm">Bảng Sức khỏe</h3>
```

### Khi nào phải audit typography?

- Sau khi thêm tab mới → so sánh tiêu đề với 2 tab khác
- Khi thêm section header → dùng class chuẩn trong bảng
- Khi import component từ file khác → check font-size của headings

---

## ⚠️ QUY TẮC CAPITALIZATION NHẤT QUÁN (BẮT BUỘC — 03/04/2026)

> Phát hiện: 4 kiểu viết khác nhau cho Page Title → cảm giác "4 ứng dụng ghép lại thành 1".

### Chuẩn duy nhất: Page Title = ALL CAPS + tracking-widest

```jsx
// ✅ Chuẩn — ALL CAPS, mọi tab phải như nhau
<h3 className="text-base sm:text-xl font-black text-gray-900 uppercase tracking-widest">
    THỰC ĐƠN
</h3>
<h3 className="text-base sm:text-xl font-black text-gray-900 uppercase tracking-widest">
    CHI PHÍ & KHO
</h3>
<h3 className="text-base sm:text-xl font-black text-gray-900 uppercase tracking-widest">
    QUẢN LÝ NHÂN SỰ
</h3>

// ❌ Sai — mỗi tab kiểu viết hoa khác nhau
<h3>Thực đơn</h3>        // sentence case
<h3>Chi phí & Kho</h3>   // sentence case
<h3>Quản Lý Khuyến Mãi</h3>  // Title Case (hoa từng từ)
<h3>QUẢN LÝ NHÂN SỰ</h3>     // ALL CAPS ← chỉ có tab này đúng
```

**Tại sao ALL CAPS?**
- DNA của POS system này là: `font-black uppercase tracking-widest` trên buttons, badges, toolbar labels
- Dùng Sentence case/Title Case cho page title → mâu thuẫn với toàn bộ hệ thống
- ALL CAPS = nhất quán, chuyên nghiệp, dễ scan nhanh trong môi trường quán cafe

---

## ⚠️ QUY TẮC ĐỒNG NHẤT FILTER CÙNG CHỨC NĂNG (BẮT BUỘC — 03/04/2026)

> Phát hiện: BC tab có period filter khác KHO tab. KHO bị thiếu mốc và đặt tiêu đề lộn xộn so với BC.

### Rule: Các filter thời gian (Period Filter) phải dùng MẢNG MẶC ĐỊNH DUY NHẤT

Mọi tab (Báo cáo, Kho,...) cần thống kê theo thời gian bắt buộc phải dùng nguyên gốc bộ 8 mốc thời gian này, không tự ý rút gọn hoặc thay đổi tên:
- `1 ngày` (Hôm nay / today)
- `7 ngày` (week)
- `30 ngày` (30days)
- `Tháng này` (month - tính từ ngày 1 đến hiện tại)
- `Quý này` (quarter)
- `Năm nay` (year)
- `Tất cả` (all)
- `Tùy chỉnh` (custom - kèm 2 ô chọn ngày start/end)

_Lý do: Giữ sự phân biệt rạch ròi giữa "30 ngày gần nhất" và "Tháng này" (chỉ tính từ đầu tháng)._

### Rule: Visual Layout của Period Filter phải là STICKY TOP
Khi 2+ tab đều có **bộ lọc thời gian** (period selector), chúng phải:
1. Đặt Filter Bar ở **trên cùng (top-aligned)** và **sticky (`sticky top-0 z-40`)**.
2. Người dùng chỉ cần "vuốt lên vuốt xuống thì sort luôn đi theo", và "khi vào tab chỉ cần nhìn lên đầu là biết đang xem mốc thời gian nào".
3. Dưới Filter Bar mới đến Title (ALL CAPS) và Sub-tabs. Không trộn lẫn Filter Bar và Sub-tabs.
4. Trên giao diện điện thoại (Mobile `sm:hidden`), text của các filter bắt buộc phải thu gọn thành tên viết tắt chuẩn, để MỌI MỐC LỌC ĐỀU NẰM ĐƯỢC TRÊN DUY NHẤT 1 HÀNG. Sử dụng class `overflow-x-auto no-scrollbar whitespace-nowrap` kết hợp với rút ngắn khoảng cách (VD: `gap-1 sm:gap-1.5` hay `px-2 sm:px-6`).
- Chuẩn mobile text: `TODAY - 7N - 30N - 1 THÁNG - QUÝ - NĂM - ALL - CHỌN`.
- Chuẩn web text (hidden trên mobile): `Hôm nay - 7 ngày - 30 ngày - Tháng này - Quý này - Năm nay - Tất cả - Tùy chỉnh`.

## ⚠️ QUY TẮC NÚT BẤM (BUTTONS) TIÊU CHUẨN MỚI (BẮT BUỘC — 03/04/2026)

> Phát hiện: Các nút dành cho việc thêm mới (Add) chưa tương đồng nhau, cái thì xanh (brand-600) cái thì đen (gray-900), kiểu bóng đổ (shadow-lg vs shadow-xl) cũng khác nhau và không nhất quán về padding.

### Rule: Nút Thêm Mới Góc Trên Cùng Phải Tuân Chuẩn Sau Đây

Trong mọi Tab (Nhân Sự, Khuyến Mãi, Thực Đơn, Bàn, Kho, v.v.), tất cả các nút đóng vai trò là "Thêm mới" (Primary Add Action) phải **bắt buộc** dùng chung chuỗi CSS này để đồng bộ giao diện nhận diện:

```jsx
// Template chuẩn duy nhất cho nút Thêm:
<button onClick={...} 
    className="bg-brand-600 text-white font-black flex items-center justify-center gap-1.5 shadow-md hover:shadow-lg hover:bg-brand-700 transition-all uppercase text-xs tracking-widest" 
    style={{ minHeight: '36px', borderRadius: 'var(--radius-btn)', padding: '0 12px' }}>
    <Plus size={14} /> 
    <span className="hidden sm:inline">THÊM ...</span>
    <span className="sm:hidden">THÊM</span>
</button>
```

- **Màu nền bắt buộc:** Xanh dương (Blue - `bg-brand-600`) - TUYỆT ĐỐI không dùng nút Đen (`bg-gray-900`) hoặc Đỏ cho tác vụ tạo mới (ngoại trừ Delete/Cancel).
- **Icon:** Luôn xài `<Plus size={14} />`.
- **Text:** Chữ phải in hoa (`uppercase text-xs font-black tracking-widest`), ở mobile có thể viết gọn chữ để chống tràn dòng nhưng tuyệt đối không ẩn hoàn toàn và thay thế bằng icon dấu cộng (`+ +`). Tức là phải dùng thuộc tính `<span className="hidden sm:inline">` và `<span className="sm:hidden">`.

**Nghiêm cấm:**
- Dùng style cũ 3D (border-bottom) cho các nút primary trong dashboard admin.
- Dùng màu xanh / đen tự do cho các Tab khác nhau, gây mất đồng nhất thương hiệu.
- Text bên trong không in hoa.

## ⚠️ QUY TẮC BỐ CỤC MOBILE SIDEBAR (CART PANEL) KHÔNG BỊ TRÀN (BẮT BUỘC)

> Phát hiện: Trên màn hình Mobile ngang, chiều cao `100vh` cực thấp (chỉ ~350px). Khi dùng `flex flex-col` và cắt `flex-1` riêng cho danh sách món, các Inputs ở trên đã ăn hết diện tích, ép chết phần danh sách và đẩy Footer (chứa nút Thanh Toán) vượt ra ngoài màn hình không thể tương tác.

### Rule: Single Scrollable Body cho Layout Hẹp
- Header: `shrink-0`
- **MỌI THỨ CÒN LẠI (Thông tin khách, Danh sách món, Ghi chú, Mã KM):** Nằm gọn trong 1 thẻ TỔNG `className="flex-1 overflow-y-auto custom-scrollbar flex flex-col"`.
- Footer (tổng tiền, action buttons): `shrink-0 z-10`.
**Điều này bắt buộc nút quan trọng nhất (THANH TOÁN) sẽ LUÔN BÁM ĐÁY, và user có thể cuộn toàn bộ nội dung phía trên mà không gặp rủi ro gãy layout.**

## ⚠️ QUY TẮC HIỂN THỊ DỮ LIỆU PHỨC TẠP TRÊN MOBILE (GANTT CHART)

> Phát hiện: Cố gắng bóp méo bảng phân ca phức tạp (có cột nhân viên + timeline ngang) vào nửa dưới màn hình làm triệt tiêu trải nghiệm kéo thả trên màn hình dọc nhỏ bé.

### Rule: Trích xuất thành Full-Screen Modal
1. Giao diện chính: Chỉ giữ lại Biểu đồ tổng quan (Dự toán chi phí, Lương, Công suất...).
2. Cung cấp một nút "MỞ BẢNG ..." to, rõ ràng, ghim nổi bật.
3. Chỉnh sửa chi tiết: Khi bấm nút sẽ mở `fixed inset-0 z-[1000] bg-white` che phủ ứng dụng.
4. Điều này buộc user Mobile cầm ngang thiết bị để tận dụng full 100% diện tích cho thao tác kéo/thả, tạo ra "Desktop-level Workspace" ngay trên Mobile. Đi kèm với Action Tab và nút "QUAY LẠI" (Close).
