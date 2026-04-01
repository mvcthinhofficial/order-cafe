# 🎯 MỤC TIÊU TỔNG THỂ: Giao Diện Dễ Tùy Biến

## Tầm nhìn (Vision)

> Xây dựng một hệ thống UI mà **chủ quán có thể thay đổi toàn bộ giao diện chỉ bằng vài cú nhấp chuột** — không cần biết code, không cần chỉnh file.

Ví dụ: Chủ quán muốn đổi màu chủ đạo từ xanh sang nâu? Chỉ cần vào Settings → Giao diện → chọn màu. **Toàn bộ app tự cập nhật ngay lập tức.**

---

## Tại Sao Phải Làm Điều Này?

- Mỗi quán cà phê có identity riêng (màu, font, style)
- Developer phải cứng nhắc hardcode màu sắc → khó maintain
- Giải pháp: **CSS Variables làm single source of truth**

---

## Kiến Trúc Tùy Biến (Design Token System)

Tất cả giá trị trực quan được lưu dưới dạng **CSS custom properties** trong `:root`:

```css
:root {
  /* Màu chủ đạo */
  --color-brand: cho phép người dùng chọn
  --color-brand-dark: tự chọn dựa trên màu người dùng chọn để nó tối ưu hiển thị
  
  /* Rounded corners — thay đổi 1 chỗ → đổi toàn app */
  --radius-card: 16px;
  --radius-btn: 10px;
  --radius-modal: 20px;
  --radius-input: 10px;
  --radius-badge: 8px;

  /* Typography */
  --font-primary: 'Inter', sans-serif;
  --font-size-base: 14px;

  /* Spacing */
  --spacing-section: 32px;
  --spacing-card: 24px 28px;
}
```

Các biến này được đọc/ghi từ **Settings → Giao diện** và lưu vào `server.cjs` (giống như cách `theme` đang hoạt động).

---

## Hai Giai Đoạn Thực Hiện

### ✅ PHASE 1 — Nền Tảng Kỹ Thuật (Đang làm)
**Mục tiêu:** Chuẩn hóa toàn bộ UI về "breathing room" và loại bỏ `rounded-none`

**Quy tắc cốt lõi bắt buộc:**
1. **Mọi padding/margin quan trọng dùng `style={{ }}`** (không dùng Tailwind class) → bypass JIT scanner của Tailwind 4
2. **Không có nội dung sát viền** — tất cả card, modal, container phải có padding tối thiểu 20px
3. **Button height `minHeight: '44px'`** — touch-friendly
4. **Không có `rounded-none`** — thay bằng `style={{ borderRadius: '12px' }}` v.v.

**Tiến độ Phase 1:**
- [x] `OrdersTab.jsx` — toolbar, cards, buttons, badges
- [x] `CustomerKiosk.jsx` — grid, modal
- [x] Tất cả `/modals/` — CancelOrder, OrderDetail, ViewReceipt, TableAction, DeleteMenu, DeleteInventory, Expense, FactoryReset
- [x] `MenuTab.jsx` — cards, toolbar, category headers
- [x] `InventoryTab.jsx` — đã có `minHeight: '44px'`, không có `rounded-none`
- [x] `StaffTab.jsx` — đã có `minHeight: '44px'`, không có `rounded-none`
- [x] `ReportsTab.jsx` — đã có inline styles, không có `rounded-none`
- [x] `SettingsTab.jsx` — đã có inline styles, không có `rounded-none`
- [x] `TablesTab.jsx` — đã có `minHeight: '44px'`, không có `rounded-none`
- [x] `PromotionsTab.jsx` — đã có `minHeight`, không có `rounded-none`
- [x] `StaffReportModal.jsx` — đã có `minHeight: '44px'`, không có `rounded-none`

✅ **PHASE 1 HOÀN THÀNH** — Kiểm tra thực tế 01/04/2026

---

### 🔜 PHASE 2 — Hệ Thống Tùy Biến Thực Sự
**Mục tiêu:** Chủ quán thay đổi giao diện qua UI, không cần code

**Tiến độ Phase 2:**
- [x] `index.css` — Thêm CSS variables `--radius-card`, `--radius-btn`, `--radius-modal`, `--radius-input`, `--radius-badge`, `--radius-chip`
- [x] `themeEngine.js` — Thêm `RADIUS_PRESETS` (Sharp / Rounded / Pill) + `applyRadiusPreset()`
- [x] `App.jsx` — Auto-apply radius preset khi load settings từ server
- [x] `SettingsTab.jsx` → Section "Giao diện" — UI 3 nút chọn preset bo góc với live preview
- [x] **`ReportsTab.jsx`** — Chuyển tất cả `rounded-none`, `rounded-sm` → `var(--radius-card)`, `var(--radius-badge)`. Date inputs → `var(--radius-input)` (19 fixes, 01/04/2026)
- [x] **`BusinessAnalyticsSection.jsx`** — Chuyển `rounded-sm` → `var(--radius-badge)` (10 fixes, 01/04/2026)
- [x] **`TaxReportSection.jsx`** — Chuyển `rounded-none` → `var(--radius-card)` (1 fix, 01/04/2026)
- [x] **`StaffReportModal.jsx`** — Chuyển 26 hardcoded `borderRadius: 'Xpx'` sang CSS variables (01/04/2026)
- [x] **`InventoryTab.jsx`** — padding inline (6) + border-radius CSS vars (36) (01/04/2026)
- [x] **`MenuTab.jsx`** — border-radius CSS vars (25) (01/04/2026)
- [x] **`PromotionsTab.jsx`** — border-radius CSS vars (8) (01/04/2026)
- [x] **`StaffTab.jsx`** — padding inline (15) + border-radius CSS vars (52) (01/04/2026)
- [x] **`TablesTab.jsx`** — border-radius CSS vars (17) (01/04/2026)
- [x] **`OrdersTab.jsx`** — padding inline (2) + border-radius CSS vars (21) (01/04/2026)
- [x] **`AdminDashboard.jsx`** — padding inline (7) (01/04/2026)
- [x] **Tất cả `/modals/`** — border-radius CSS vars tổng 264 fixes (01/04/2026)
- [x] Thêm Spacing Preset (Compact / Normal / Spacious) vào Phase 2

**Việc cần làm:**
1. **Chuyển hardcoded values sang CSS variables:**
   - `borderRadius: '12px'` → `var(--radius-card)` ✅ **HOÀN THÀNH TOÀN BỘ**
   - `#007AFF` → `var(--color-brand)` ✅ **HOÀN THÀNH TOÀN BỘ**
   - `padding: '24px 28px'` → `var(--spacing-card)` ✅ **HOÀN THÀNH TOÀN BỘ**
2. **Thêm UI vào SettingsTab → Tab "Giao diện":**
   - Color picker cho brand color ✅ (đã có)
   - Slider/toggle cho border radius preset (Sharp / Rounded / Pill) ✅ **VỪA THÊM**
   - Font selector ✅ (đã có)
   - Spacing preset (Compact / Normal / Spacious) ✅ **VỪA THÊM**
3. **Lưu settings vào `server.cjs`** và inject CSS variables vào `<style>` runtime ✅ (persist qua `radiusPreset` & `spacingPreset` field)

✅ **PHASE 2 HOÀN THÀNH** — Kiểm tra thực tế 01/04/2026

---

## Quy Tắc Thiết Kế Bất Biến (Non-Negotiables)

> Những quy tắc này PHẢI được tuân thủ trong mọi code được viết mới:

| Quy tắc | Lý do |
|---|---|
| Dùng `style={{ }}` cho padding, borderRadius, minHeight | Tailwind 4 JIT không generate class mới nếu không dùng trước |
| Padding tối thiểu 20px cho mọi card/section | Không có nội dung sát viền |
| Button `minHeight: 44px` | Touch target tiêu chuẩn |
| Modal container `borderRadius: 20px` | Nhìn premium, không phải vuông cứng |
| Không dùng `rounded-none` trong code mới | Sẽ phải refactor lại sau |

---

## Nhắc Nhở Cho AI

Nếu bạn (AI) đang làm việc trong session mới và quên mục tiêu, hãy nhớ:

> **Chúng ta đang xây dựng một hệ thống UI tùy biến complete. Phase 1 là standardize spacing/rounded corners bằng inline styles. Phase 2 là chuyển sang CSS variables để chủ quán tự thay đổi giao diện từ Settings, không cần code.**

---
*Cập nhật lần cuối: 2026-03-31*
