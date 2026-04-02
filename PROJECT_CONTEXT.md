# PROJECT_CONTEXT.md — Order Cafe POS System

> **Mục đích:** Tài liệu này giúp AI assistant hiểu chính xác kiến trúc, luồng hoạt động và các quy ước bất biến của dự án để tránh sai khi viết code mới.
> Đọc ngay Khối lượng Tự học ở phía dưới:

> [!IMPORTANT]
> 🤖 **ANTIGRAVITY EVOLUTION DIRECTIVE (Luật Tự Tiến Hoá Tối Cao)**
> 1. Trái tim linh hoạt của dự án nằm ở thư mục `antigravity_skills`. Sau khi đọc file này, bạn cần quét (`list_dir` và `view_file`) thư mục `antigravity_skills` để load lại não bộ các thủ thuật xử lý code trước khi đụng vào Source Code.
> 2. **Vòng lặp Năng suất:** Ngay khi hoàn thành trọn vẹn 1 tính năng mới do Human yêu cầu, BẠN PHẢI TỰ ĐỘNG ĐÚC KẾT nó thành 1 thư mục Skill mới trong `antigravity_skills/`, sao đó tự kích hoạt Terminal chạy lệnh: 
> `source OpenSpace/venv/bin/activate && python OpenSpace/sync_to_openspace.py`
> ...để đồng bộ "chất xám" của bạn trực tiếp lên OpenSpace Local Dashboard!

---

## 1. Tổng quan dự án

### Mục đích
Hệ thống POS (Point of Sale) tự phục vụ cho quán cafe, hỗ trợ:
- Đặt món qua Kiosk (màn hình cảm ứng tại quán)
- Đặt món qua điện thoại (quét QR)
- Quản lý đơn hàng, kho nguyên liệu, nhân viên, ca làm
- Thanh toán VietQR động
- Chấm công nhân viên qua QR
- Đặt hàng từ nền tảng GRAB / Shopee Food
- Báo cáo doanh thu (Master Ledger) xuất được file EXCEL/CSV
- Báo cáo thuế định kỳ (Tháng/Quý/Năm) — chuẩn kê khai thuế GTGT 2026

### Tech Stack

| Lớp | Công nghệ | Phiên bản |
|-----|-----------|-----------|
| Desktop Shell | Electron | 40.x |
| Frontend | React + Vite | React 19, Vite 7 |
| UI Framework | Tailwind CSS 4 | 4.x (dùng class utility) |
| Animation | Framer Motion | 12.x | ⚠️ CHỈ DÙNG trong component có `import { motion, AnimatePresence } from 'framer-motion'` |
| Icons | Lucide React | 0.576.x |
| Router | React Router DOM | 7.x (HashRouter) |
| QR Code | qrcode.react | 4.x |
| Backend | Node.js + Express 5 | Express 5.x |
| Database | SQLite (better-sqlite3) | 12.x |
| Image Upload | Multer + Sharp | 2.x / 0.34.x |
| Tunnel ngoài mạng | Cloudflare Tunnel (cloudflared) | 0.7.1 |
| Email | Nodemailer | 8.x |
| Build | electron-builder | 26.x |
| Auto-Update | electron-updater | 6.x |

---

## 2. Cấu trúc thư mục

```
Order Cafe/
├── .github/workflows/
│   └── release.yml         # GitHub Actions: Tự động build Win/Mac khi có tag v*
├── main.cjs                # Electron main process: cửa sổ, IPC, khởi server, auto-update
├── server.cjs              # Backend Express MONOLITH: toàn bộ API + business logic
├── db.cjs                  # Helper khởi tạo SQLite DB, schema migration, indexes
├── migration.cjs           # Script chuyển dữ liệu từ JSON cũ sang SQLite (1 lần)
├── release.sh              # Script đóng gói bản phát hành (Windows, Mac, Linux)
├── deploy_linux.sh         # Script cài đặt/cập nhật máy chủ Linux
├── vite.config.js          # Cấu hình Vite build
├── index.html              # HTML entry point
├── package.json            # Scripts, dependencies & GitHub publish config (v1.1.6)
├── data/                   # THƯ MỤC LƯU TRỮ CHÍNH (runtime)
│   ├── .env                # Chứa mã khôi phục Admin (không phải env thực sự)
│   ├── cafe.db             # Cơ sở dữ liệu SQLite chứa toàn bộ hệ thống
│   ├── archived_migration/ # JSON cũ đã được chuyển sang SQLite (archive, không xóa)
│   ├── receipts/           # Ảnh biên lai thanh toán (jpg)
│   ├── menu_images/        # Ảnh món ăn (webp, resize 800px)
│   └── server.log          # Log server tự động ghi
├── server/                 # THƯ MỤC DỰ PHÒNG (blueprint cho refactor tương lai — HIỆN CÒN TRỐNG)
│   ├── core/
│   ├── middleware/
│   ├── routes/
│   ├── services/
│   └── store/
├── src/
│   ├── main.jsx            # React entry point, URL interceptor, ErrorBoundary
│   ├── App.jsx             # Routing chính, fetch settings, wake lock, LanOnlyRoute
│   ├── api.js              # SERVER_URL constant + global fetch interceptor (auto-inject token)
│   ├── App.css             # CSS cấp app
│   ├── index.css           # Global CSS + Tailwind tokens
│   ├── fonts.css           # Custom fonts (khai báo @font-face)
│   ├── fonts-base64.css    # Fonts nhúng Base64 (dùng trong build offline)
│   ├── assets/             # Static assets (hình ảnh, v.v.)
│   ├── utils/
│   │   ├── timeUtils.js         # ESM: formatDateTime, formatDate, formatTime, parseDate
│   │   ├── timeUtils.cjs        # CJS: cùng logic timeUtils nhưng cho server-side import
│   │   ├── taxUtils.js          # ESM: tính VAT, GTGT, định dạng thuế
│   │   ├── taxUtils.cjs         # CJS: cùng logic taxUtils cho server
│   │   ├── promotionEngine.js   # Logic khuyến mãi, voucher, giảm giá
│   │   ├── printHelpers.js      # Hàm tạo HTML bill, in bill, QR bill
│   │   ├── themeEngine.js       # generateTheme(), applyTheme() — CSS vars động
│   │   ├── dashboardUtils.jsx   # Các hàm tiện ích cho AdminDashboard
│   │   ├── ShortcutUtils.js     # Tiện ích phím tắt shortcutCode, match logic
│   │   ├── useBackupRestore.js  # Hook backup/restore dữ liệu
│   │   ├── useKeyboardShortcuts.js  # Hook đăng ký và quản lý keyboard shortcuts
│   │   └── useSystemUpdate.js   # Hook kiểm tra và xử lý system update
│   └── components/
│       ├── AdminDashboard.jsx        # Shell chính, state trung tâm, điều phối tabs
│       ├── AdminDashboard.css        # CSS riêng cho Admin
│       ├── AdminDashboard.jsx.bak    # Bản backup (KHÔNG CHỈNH SỬA)
│       ├── AdminDashboardTabs/       # CÁC MODULE TAB ĐÃ TÁCH RA (xem chi tiết dưới)
│       │   ├── AdminHeader.jsx          # Header admin với thông tin + update banner
│       │   ├── StoreClock.jsx           # Đồng hồ thời gian thực hiển thị ở header
│       │   ├── FloatingButtons.jsx      # Nút nổi (scroll to top, v.v.)
│       │   ├── OrdersTab.jsx            # Tab Đơn Hàng (active orders, POS receipt)
│       │   ├── StaffOrderPanel.jsx      # Panel nhập đơn thủ công của nhân viên
│       │   ├── InlineEditPanel.jsx      # Panel chỉnh sửa đơn hàng inline
│       │   ├── MenuTab.jsx              # Tab Menu (CRUD item, category, shortcode)
│       │   ├── InventoryTab.jsx         # Tab Kho (CRUD ingredient, import, audit)
│       │   ├── StaffTab.jsx             # Tab Nhân Sự (staff, roles, lương, ca làm)
│       │   ├── TablesTab.jsx            # Tab Bàn (dine-in tables, QR per table)
│       │   ├── PromotionsTab.jsx        # Tab Khuyến Mãi (promo, voucher)
│       │   ├── ReportsTab.jsx           # Tab Báo Cáo (Master Ledger, charts)
│       │   ├── SettingsTab.jsx          # Tab Cài Đặt (toàn bộ settings hệ thống)
│       │   ├── BusinessAnalyticsSection.jsx  # Section phân tích kinh doanh nâng cao
│       │   ├── TaxReportSection.jsx     # Section Báo Cáo Thuế (Tháng/Quý/Năm)
│       │   ├── StaffReportModal.jsx     # Modal báo cáo giờ làm + Gantt Chart
│       │   └── modals/                  # CÁC MODAL ĐÃ TÁCH RA
│       │       ├── OrderDetailModal.jsx      # Chi tiết đơn hàng
│       │       ├── CancelOrderModal.jsx      # Hủy đơn hàng
│       │       ├── ImportModal.jsx           # Nhập kho nguyên liệu
│       │       ├── InventoryModal.jsx        # Thêm/sửa nguyên liệu
│       │       ├── DeleteInventoryModal.jsx  # Xóa nguyên liệu
│       │       ├── MergeInventoryModal.jsx   # Gộp nguyên liệu trùng tên
│       │       ├── IngredientUsageModal.jsx  # Xem lịch sử sử dụng nguyên liệu
│       │       ├── InventoryAuditModal.jsx   # Kiểm kê / điều chỉnh tồn kho
│       │       ├── ProductionModal.jsx       # Sản xuất nội bộ (mix nguyên liệu)
│       │       ├── RecipeGuideModal.jsx      # Hướng dẫn công thức pha chế
│       │       ├── ExpenseModal.jsx          # Ghi chi phí / khoản thu
│       │       ├── EditPromoModal.jsx        # Tạo / sửa chương trình khuyến mãi
│       │       ├── CategoryManagerModal.jsx  # Quản lý danh mục menu
│       │       ├── TableModal.jsx            # Thêm/sửa bàn
│       │       ├── TableActionModal.jsx      # Hành động trên bàn (merge, split...)
│       │       ├── DeleteMenuModal.jsx       # Xóa item menu
│       │       ├── FactoryResetModal.jsx     # Reset toàn bộ dữ liệu hệ thống
│       │       └── ViewReceiptModal.jsx      # Xem ảnh biên lai thanh toán
│       ├── CustomerKiosk.jsx         # Kiosk tự phục vụ tại quán (full-screen)
│       ├── MobileMenu.jsx            # Giao diện đặt món qua điện thoại (QR scan)
│       ├── BillView.jsx              # Thanh toán và xem bill (mobile)
│       ├── Login.jsx                 # Màn hình đăng nhập Admin/Staff
│       ├── Portal.jsx                # Trang chào / chọn giao diện
│       ├── KitchenDashboard.jsx      # Màn hình bếp (hiển thị đơn cần pha chế)
│       ├── AttendanceView.jsx        # Chấm công nhân viên (public, không cần auth)
│       ├── StaffQrKiosk.jsx          # QR chấm công hiển thị trên Kiosk (LAN only)
│       ├── CustomerQrKiosk.jsx       # QR đặt món hiển thị cho khách (LAN only)
│       ├── SchedulesView.jsx         # Quản lý lịch ca làm (schedules/timesheets)
│       ├── SharedCustomizationModal.jsx  # Modal tuỳ chỉnh size/đường/đá/addon (dùng chung Kiosk + Staff)
│       ├── ShortcutManager.jsx       # Quản lý phím tắt (hotkey)
│       ├── VisualFlashOverlay.jsx    # Hiệu ứng flash khi nhận đơn mới
│       ├── VisualFlashOverlay.css    # CSS cho flash overlay
│       ├── IceLevelIcon.jsx          # Icon mức đá (SVG inline)
│       └── SugarLevelIcon.jsx        # Icon mức đường (SVG inline)
└── public/
    ├── logo.png            # Logo
    └── sw.js               # Service Worker
```

### Quy ước đặt tên file
- Component: `PascalCase.jsx` (VD: `CustomerKiosk.jsx`)
- CSS riêng của component: `ComponentName.css`
- Server/config: `camelCase.cjs` (CommonJS)
- Utility ESM: `camelCase.js` (dùng trong React)
- Utility CJS: `camelCase.cjs` (dùng trong server/node)

### ⚠️ Về cấu trúc `server/`
Thư mục `server/core`, `server/middleware`, `server/routes`, `server/services`, `server/store` hiện **đều TRỐNG** — chúng được tạo ra theo blueprint refactoring nhưng chưa được điền nội dung. **Toàn bộ logic server vẫn nằm trong `server.cjs`.**

---

## 3. Luồng hoạt động (Data Flow)

### Kiến trúc tổng quan
```
Electron main.cjs
  ├── Spawn → server.cjs (Node process, port 3001)
  └── BrowserWindow → http://localhost:5173/#/admin (dev) hoặc dist/index.html#/admin (prod)
```

### Cách xác định SERVER_URL (src/api.js)
```
file:// protocol (Electron packaged)  → http://localhost:3001
port 5173 (Vite dev)                  → http://{hostname}:3001
LAN IP / Cloudflare Tunnel (https)    → window.location.origin (cùng origin)
```

### Routes (HashRouter - dùng `#/`)
| Route | Component | Guard | Mô tả |
|-------|-----------|-------|-------|
| `/#/` | Portal (nếu đã login) / Login | Auth check | Trang chào |
| `/#/login` | Login | Public | Đăng nhập |
| `/#/admin` | AdminDashboard | PrivateRoute + LanOnly | POS chính |
| `/#/kiosk` | CustomerKiosk | LanOnly | Kiosk tự phục vụ |
| `/#/order` | MobileMenu | Public | Đặt món qua QR phone |
| `/#/item/:itemId` | MobileMenu | Public | Deep link vào item cụ thể |
| `/#/bill` | BillView | LanOnly | Thanh toán |
| `/#/kitchen` | KitchenDashboard | LanOnly | Màn hình bếp |
| `/#/attendance` | AttendanceView | Public | Chấm công nhân viên |
| `/#/staff-qr` | StaffQrKiosk | LanOnly | QR chấm công |
| `/#/customer-qr` | CustomerQrKiosk | LanOnly | QR đặt món |

> **LanOnlyRoute:** Chỉ cho phép truy cập từ `localhost`, `127.0.0.1`, dải IP LAN (`192.168.*`, `10.*`, `172.16-31.*`) hoặc `file://`. Ngoại lệ: Role `ADMIN` được phép truy cập mọi nơi.

### Luồng đặt đơn từ Kiosk
```
CustomerKiosk → chọn món → SharedCustomizationModal → giỏ hàng → submitOrder()
  → POST /api/order { cartItems, customerName, price, ... }
  → Server: tạo order → broadcastEvent('ORDER_CHANGED') via SSE
  → AdminDashboard nhận SSE event (~150ms) → fetchOrders() → cập nhật UI ngay
  → CustomerKiosk nhận SSE 'ORDER_CHANGED' (~200ms) → fetchPendingOrders()
  → Admin nhấn "Complete" → POST /api/orders/complete/:id
    → Server: trừ kho, cập nhật reports, broadcast SSE
  → CustomerKiosk poll /api/notifications/completed (10s)
    → TTS thông báo "Mời khách số X lấy đồ"
```

### Luồng đặt đơn qua QR điện thoại
```
Kiosk hiển thị QR → khách quét → mở URL: ?action=order&token=XXXX
  → main.jsx interceptor → window.location.hash = "#/order?token=XXXX"
  → MobileMenu.jsx: lưu token vào localStorage
  → App.jsx: gửi POST /api/qr-token/accessed (signal xoay QR mới)
  → Kiosk nhận signal, tạo QR token mới
  → Khách gọi món → POST /api/order { qrToken: "XXXX", ... }
  → Server: kiểm tra token nếu qrProtectionEnabled = true
```

### Luồng thanh toán POS
```
Admin chọn "Thanh toán" → POST /api/pos/checkout/start { amount, orderId }
  → Kiosk poll /api/qr-info → phát hiện posCheckoutSession
  → Kiosk hiện QR VietQR với số tiền đúng
  → Admin xác nhận → POST /api/orders/confirm-payment/:id
  → Server: order.isPaid = true, xóa posCheckoutSession
  → Kiosk phát hiện lastPaidKioskOrder mới → hiện "Thanh toán thành công 5s"
```

---

## 4. Các quy ước & pattern đang dùng

### Giá tiền — QUY TẮC QUAN TRỌNG NHẤT
> ⚠️ **GIÁ TRONG DATABASE LƯU THEO ĐƠN VỊ NGHÌN ĐỒNG (VND / 1000)**
> - `price: 21` → hiển thị là **21.000 ₫**
> - Hàm `formatVND(price)` = `new Intl.NumberFormat('vi-VN').format(num * 1000)`
> - Khi gửi API, truyền giá nguyên (21), không phải 21000
> - Khi tính tổng: `totalPrice = price_in_thousands`, VD: `cart.reduce((s, c) => s + c.totalPrice * c.count, 0)` cho ra số nghìn đồng
> - VietQR cần VND thực: `amountVND = Math.round(amount * 1000)`

### Hiển thị giá trong Form nhập liệu — QUY ƯỚC UI CHUẨN
> **TIÊU CHUẨN `.000đ`:** Mọi ô nhập giá tiền trong Admin UI PHẢI hiển thị hậu tố `.000đ` dính liền ngay sau số người dùng nhập.
> - Người dùng nhập `25` → hiển thị **`25.000đ`** (`.000đ` xuất hiện inline, không xuống dòng)
> - **KHÔNG dùng:** `k`, `nghìn`, `nghìn đồng`, `nghìn ₫`, `K`, hoặc bất kỳ ký hiệu nào khác
> - **Component chuẩn:** `CurrencyInput` trong `src/utils/dashboardUtils.jsx` — dùng cho mọi form nhập giá mới
> - **Inline thủ công (khi cần custom style):** Dùng `<input type="number" ... />` kèm `<span className="...select-none pointer-events-none">.000đ</span>` ngay sau trên cùng dòng (items-baseline)
> - **Lý do:** Người bán nhìn thấy ngay `25.000đ` và xác nhận đã nhập đúng, không lo nhập thiếu số 0

### Cấu trúc Order ID
```
Format: {TTTT}{DD}{MM}{YY}
VD: 0023190326 = đơn thứ 23, ngày 19/03/26
Server LUÔN ghi đè ID khi tạo mới (client-generated ID bị bỏ qua)
```

### Cấu trúc CartItem (định dạng chuẩn)
```javascript
{
  id: "kiosk-item-{timestamp}-{random}",  // unique local ID
  item: { id, name, price, category, recipe, ... },  // snapshot của menu item
  size: { label: "M", priceAdjust: 5, recipe: [...], multiplier: 1.0 } | null,
  sugar: "100%",
  ice: "Bình thường",
  addons: [{ label: "Thêm sữa", price: 5, recipe: [...] }],
  count: 1,
  note: "",
  totalPrice: 21  // (base price + size adjust + addon prices) tính theo nghìn đồng
}
```

### Order Status Lifecycle
```
AWAITING_PAYMENT → (admin "Đã nhận tiền") → PAID → (admin "Hoàn thành") → COMPLETED
PENDING → (admin "Hoàn thành") → COMPLETED
* → CANCELLED
```

> **Lưu ý:** `settings.requirePrepayment === false` → đơn tạo với status `PENDING` (không cần thanh toán trước)
> Mặc định: `AWAITING_PAYMENT`

### Authentication (RBAC)
```
Tokens in-memory: activeTokens Map (reset khi restart server)
Admin: authToken lưu localStorage → Authorization: Bearer {token}
Staff: tương tự nhưng role = 'STAFF'

STAFF bị chặn:
- DELETE bất kỳ resource nào
- POST/PUT lên /inventory, /imports, /settings, /report
  (Ngoại trừ: /settings/toggle-staff-kiosk-qr, /settings/toggle-kiosk-qr, /settings/qr-protection)
```

### Password Hashing
```
Format: "sha256:{salt}:{hash}" (PBKDF2, 10000 iterations, 64 bytes)
Fallback plain-text nếu chưa được hash (migration path)
```

### Fetch Interceptor (src/api.js)
- Global fetch override tự động inject `Authorization: Bearer {token}` cho mọi request tới `/api`
- Nếu 401 → xóa token localStorage → redirect `#/login` (chỉ khi đang ở route `/admin`)
- Route `/api/auth/` được miễn inject token

### SSE Hybrid Architecture (Real-time Sync — ÁP DỤNG TỪ 02/04/2026)
> **Kiến trúc hiện tại dùng SSE chứ không phải WebSocket hay polling thuần túy**

```
Server /api/events  ←── SSE endpoint (text/event-stream)
  │  broadcastEvent('ORDER_CHANGED', data) → broadcast tới TẤT CẢ client
  │  broadcastEvent('KIOSK_QR_DEBT', { orderId }) → khi admin trigger debt QR
  │  Heartbeat 30s để giữ kết nối qua Cloudflare Tunnel
  │
  ├── AdminDashboard (EventSource)
  │     └── ORDER_CHANGED → debounce 150ms → fetchOrders() + setReport()
  │         Backup polling: 15s (an toàn nếu SSE miss event)
  │
  └── CustomerKiosk (EventSource)
        ├── ORDER_CHANGED → debounce 200ms → fetchPendingOrders()
        │   Backup polling: 10s (thay vì 3s cũ)
        └── KIOSK_QR_DEBT → hiện QR modal cho debt order ngay lập tức
            (thay vì pollKioskEvents 2s cũ)
```

**Endpoints broadcast `ORDER_CHANGED`:** Create, Update, Delete, Pay, Cancel, Debt, Complete, CompleteDebt (9 routes)

**Polling còn lại (không thay bằng SSE):**
- `CustomerKiosk`: `/api/qr-info` **1s** (QR payment session cần detect nhanh)
- `CustomerKiosk`: settings **10s**, menu+promotions **15s**
- `CustomerKiosk`: notifications/completed **10s** (TTS)
- `AdminDashboard`: backup **15s** (đề phòng SSE disconnect)

### Database (server.cjs + db.cjs)
```javascript
// db.cjs khởi tạo SQLite với WAL mode
// Schema: orders, report_logs, inventory, inventory_audits, schedules, ...
// Mỗi thao tác ghi đều dùng prepared statements (better-sqlite3 sync API)
// Transactions bảo vệ đồng thời với WAL (Write-Ahead-Logging)
// saveData() KHÔNG còn ghi JSON — mọi thứ đã chuyển sang SQLite
```

> **Lưu ý:** Không còn dùng `saveData()` / `loadData()` kiểu file JSON. Toàn bộ đã dùng SQLite.

### Design Pattern — AdminDashboard
- **AdminDashboard.jsx** = Shell container: quản lý global state và điều phối props xuống tabs
- **Mỗi tab là một file riêng** trong `AdminDashboardTabs/` (VD: `OrdersTab.jsx`, `MenuTab.jsx`)
- **Modal phức tạp** được tách sang `AdminDashboardTabs/modals/`
- Pattern: `useState` draft → submit → call API → refresh state (props drilling / callback)
- Framer Motion với `AnimatePresence` dùng cho hầu hết modal/overlay

---

## 5. Cấu hình & biến môi trường

### data/.env
- **Không phải** file `.env` thực sự của Node.js (không dùng `process.env` để đọc)
- Chỉ là file text lưu mã khôi phục Admin để backup thủ công

### Biến môi trường thực sự
```bash
DATA_PATH  # Đường dẫn thư mục data, do main.cjs truyền vào khi spawn server.cjs
           # Default: ./data (dev), hoặc path từ CONFIG_FILE (prod)
```

### CONFIG_FILE (Electron)
```
{userData}/app-config.json  # Lưu { dataPath: "/path/to/data" }
# Cho phép user chọn thư mục data khác nhau qua dialog
```

### settings — Các field quan trọng
```javascript
{
  shopName, shopSlogan, themeColor,
  bankId, accountNo, accountName,    // Thông tin QR thanh toán
  customQrUrl,                        // URL ảnh QR tĩnh tùy chỉnh
  preferDynamicQr: true,              // Ưu tiên VietQR động (có số tiền)
  cfEnabled: true,                    // Bật Cloudflare Tunnel
  cfToken, cfDomain, tunnelType,     // "auto" hoặc "manual"
  ttsEnabled: true,                  // Text-to-Speech thông báo gọi món
  requirePrepayment: true,           // true = AWAITING_PAYMENT, false = PENDING
  qrProtectionEnabled: false,        // Bảo vệ đặt món phải có QR token hợp lệ
  showQrOnKiosk: false,              // Hiện QR đặt món full-screen trên Kiosk
  showStaffQrOnKiosk: false,         // Hiện QR chấm công trên Kiosk
  adminUsername, adminPassword,      // Thông tin đăng nhập admin (password đã hash)
  adminRecoveryCode,                 // Mã khôi phục admin
  menuCategories: [],                // Thứ tự sắp xếp danh mục menu
  isTakeaway: false,                 // Chế độ mang về (dùng thẻ số thay bàn)
  headerImageUrl,                    // URL ảnh logo tùy chỉnh
  featuredPromoImage, featuredPromoTitle, featuredPromoCTA,
  deliveryAppsConfigs: {             // Cấu hình nền tảng giao hàng
    GRAB:   { fee: 25, enabled: true },
    SHOPEE: { fee: 20, enabled: true }
  }
}
```

---

## 6. Dependencies & tích hợp ngoài

### VietQR API
```
URL: https://img.vietqr.io/image/{bankId}-{accountNo}-compact2.png?amount={amountVND}&addInfo={desc}&accountName={name}
Không cần API key, public API
amountVND = price_in_thousands * 1000
```

### Cloudflare Tunnel
```
Binary: node_modules/cloudflared/bin/cloudflared
Auto mode: cloudflared tunnel --url http://localhost:3001
Manual mode: cloudflared tunnel --no-autoupdate run --token {cfToken}
URL trả về: tunnelStatus.url (*.trycloudflare.com cho auto)
```

### Electron IPC Handlers
```
select-data-directory  → dialog chọn folder data
get-current-data-path  → trả về DATA_PATH hiện tại
get-printers           → danh sách printer
print-html             → in HTML qua silent print
toggle-kiosk           → toggle cửa sổ Kiosk
open-kiosk             → mở cửa sổ Kiosk (singleton)
```

### Kiosk Window (Electron)
- Singleton: chỉ 1 Kiosk window tại một thời điểm
- Admin window `window.open('#/kiosk')` bị intercept → `createKioskWindow()` IPC
- Dev: `http://localhost:5173/#/kiosk`
- Prod: `file://.../dist/index.html#/kiosk`

---

## 7. Những điều AI PHẢI LƯU Ý khi viết code mới

### ❌ Anti-patterns cần tránh

1. **KHÔNG nhân giá với 1000 khi lưu/gửi API**
   - `price: 21` = 21k đồng, ĐÚNG
   - `price: 21000` = sai (sẽ hiển thị 21.000.000 ₫)
   - Chỉ nhân 1000 khi render UI (`formatVND`) hoặc gửi VietQR (`amountVND`)

2. **KHÔNG tạo file data mới bên ngoài thư mục `DATA_DIR`**
   - Mọi file JSON/DB phải nằm trong `DATA_DIR` (được truyền qua `process.env.DATA_PATH`)
   - KHÔNG hardcode `path.join(__dirname, 'data')`; dùng biến `DATA_DIR` trong server.cjs

3. **KHÔNG dùng `window.location.href` để navigate trong React**
   - Dùng `useNavigate()` từ react-router-dom hoặc `window.location.hash = '#/route'`
   - App dùng HashRouter, mọi route bắt đầu bằng `#/`

4. **KHÔNG thêm API mới mà không kiểm tra RBAC middleware**
   - Mọi route sau middleware auth đều bị kiểm tra token
   - Public routes phải được khai báo tường minh trong middleware

5. **KHÔNG sửa Order ID sau khi server đã gán**
   - Server LUÔN ghi đè ID theo format `{TTTT}{DD}{MM}{YY}`
   - Client-generated ID (dạng `Date.now()`) chỉ là temp, server bỏ qua

6. **`AdminDashboard.jsx` CHỈ LÀ SHELL LÕI — TUYỆT ĐỐI KHÔNG XÂY THÊM CẤU TRÚC VÀO ĐÂY**
   - File này chỉ được phép chứa: global state, shared props, tab routing, event handlers cấp cao
   - **KHÔNG** được viết thêm JSX render phức tạp, sub-component, modal, form, hay UI block mới vào `AdminDashboard.jsx`
   - Mọi thành phần mới BẮT BUỘC được tách ra file riêng:
     - **Tab mới** → `AdminDashboardTabs/{TenTab}.jsx`
     - **Modal mới** → `AdminDashboardTabs/modals/{TenModal}.jsx`
     - **Component tái sử dụng** → `src/components/{TenComponent}.jsx`
     - **Section/block lớn trong tab** → tách thành sub-component trong `AdminDashboardTabs/`
   - Nguyên tắc kiểm tra: nếu `AdminDashboard.jsx` tăng kích thước đáng kể → bạn đang làm sai

7. **KHÔNG dùng `Date.now()`, `new Date()`, `toLocaleString()` tùy tiện cho dữ liệu thời gian**
   - Backend: dùng `getCurrentISOString()` cho `timestamp`, `createdAt`, `clockIn`, `clockOut`
   - Frontend: dùng `formatDateTime(ts)`, `formatDate(ts)`, `formatTime(ts)` từ `src/utils/timeUtils.js`

8. **KHÔNG gọi saveData() / saveShifts() kiểu JSON cũ — đã chuyển sang SQLite**
   - Mọi read/write phải qua prepared statements của `better-sqlite3`

9. **KHÔNG dùng `<motion.X>` hoặc `<AnimatePresence>` trong file KHÔNG có `import { motion } from 'framer-motion'`**
   - `motion` là runtime object — nếu không import sẽ crash với `ReferenceError: motion is not defined`
   - `HUDItemCard.jsx` là ví dụ điển hình: animation đã bị xóa để tối ưu POS, `<motion.img>` còn sót lại gây crash
   - **Quy tắc kiểm tra:** Trước khi commit code có `motion.`, chạy search xem file đó có dòng `import { motion` chưa
   - **HUDItemCard.jsx là NO-ANIMATION ZONE** — component này tối ưu cho iPad POS, KHÔNG dùng Framer Motion, dùng `<img>` và `<div>` thông thường

### ⚠️ Lỗi thường gặp

1. **Inventory deduction chỉ xảy ra khi `status → COMPLETED`**
   - Đơn PAID chưa trừ kho; chỉ khi `POST /api/orders/complete/:id` mới trừ
   - Khi sửa order đã PAID: bỏ qua inventory check (đã trừ rồi)

2. **Cloudflare Tunnel URL được dùng cho QR order link**
   - Nếu tunnel đang chạy, QR sẽ dùng URL tunnel thay vì IP LAN
   - URL format: `{tunnelUrl}/?action=order&token={TOKEN}`
   - Không dùng port 5173 cho LAN QR — luôn dùng port 3001

3. **TTS (Text-to-Speech) cần audio unlock trước**
   - `CustomerKiosk` có splash screen "BẮT ĐẦU SỬ DỤNG" để unlock audio
   - `speakTTS()` kiểm tra cả `settings.ttsEnabled` và `ttsSettings.enabled` (localStorage)

4. **`posCheckoutSession` là in-memory, không persist**
   - Nếu server restart khi đang checkout → session mất, phải bắt đầu lại

5. **Giá trong CartItem là `totalPrice` PER ITEM (không nhân count)**
   - Tổng tiền = `cartItems.reduce((s, c) => s + c.totalPrice * c.count, 0)`
   - VD: `totalPrice: 21, count: 3` → đóng góp 63k cho tổng

6. **Giá Legacy (dữ liệu cũ):** Một số đơn cũ có thể có `price` ghi sai dạng float `1.431` thay vì `1431`
   - Modal Order Details KHÔNG dùng `selectedLog.price` trực tiếp
   - Luôn tính lại từ `orderData.cartItems` để hiển thị tổng tiền chính xác

7. **`ReferenceError: motion is not defined` — React Crash (03/04/2026)**
   - **Nguyên nhân:** Code cũ dùng `<motion.img>` hoặc `<motion.div>` còn sót lại sau khi animation bị xóa, nhưng dòng `import { motion } from 'framer-motion'` không bao giờ có trong file đó
   - **Nơi xảy ra:** `HUDItemCard.jsx` — dòng `<motion.img layoutId={...}` tại vị trí hiển thị ảnh sản phẩm
   - **Fix:** Thay `<motion.img>` → `<img>` thông thường. HUDItemCard KHÔNG cần animation; overlay xuất hiện tức thì là thiết kế có chủ ý
   - **Lesson learned:** Khi refactor xóa animation (loại bỏ `AnimatePresence`, `motion.div` bọc ngoài), phải quét toàn bộ file để tìm `motion.` còn sót

8. **SSE Kiosk 401 — `/api/events` phải được public (CRITICAL):**
   - `EventSource` (SSE) **không hỗ trợ custom headers** — không thể gửa `Authorization: Bearer {token}`
   - `CustomerKiosk` không có auth token (public screen)
   - Nếu `/api/events` không có trong whitelist public GET routes → Kiosk nhận **401** → `onerror` → reconnect 5s → 401 lại → vòng lặp vô tận
   - Hậu quả: SSE hoàn toàn thất bại, fallback về backup 10s (tệ hơn 3s polling cũ!)
   - **Fix:** Thêm `'/events'` vào array whitelist tại `app.use('/api', ...)` trong `server.cjs`
   - **Lý do an toàn:** `/api/events` là read-only SSE push, chỉ gửa event type (không lộ dữ liệu nhạy cảm)

### 🔒 Rule bất biến

| Rule | Lý do |
|------|-------|
| Luôn dùng `SERVER_URL` từ `src/api.js` cho mọi call API | Tự động resolve đúng URL theo môi trường |
| `hashPassword()` dùng PBKDF2, **không** dùng btoa/MD5 | Security |
| Kiểm tra tồn tại record trước khi đọc SQLite | Tránh crash khi DB mới init |
| Không xóa cứng (hard delete) menu item lần đầu — dùng `isDeleted: true` | Soft delete trước, hard delete lần 2 |
| Import tạo ingredient mới nếu chưa có trong inventory | Match theo tên (case-insensitive) |
| Không sửa file `data/.env` — chỉ là backup text thủ công | Không phải biến môi trường thực |
| **HỆ THỐNG GIAO DIỆN TÙY BIẾN (DESIGN TOKENS - CỐT LÕI):** Dự án dùng **CSS Variables (`:root`)** làm Single Source of Truth để chủ cửa hàng tùy biến UI không cần code. MỌI COMPONENT MỚI TUYỆT ĐỐI TUÂN THỦ 4 QUY TẮC SAU: <br><br>1. **KHÔNG DÙNG `rounded-none` hoặc Tailwind class tĩnh cho bo góc.** Bắt buộc dùng `style={{ borderRadius: 'var(--radius-card)' }}` v.v... Các biến có sẵn: `--radius-card`, `--radius-btn`, `--radius-modal`, `--radius-input`, `--radius-badge`, `--radius-chip`.<br>2. **KHÔNG DÙNG MÃ MÀU HARDCODE (vd: #007AFF).** Bắt buộc dùng `var(--color-brand)` cho các element chủ đạo.<br>3. **PADDING & KHOẢNG TRỐNG THỞ:** Không để nội dung dính sát viền. Mọi card/modal phải có padding tối thiểu 20px (gợi ý `var(--spacing-card)`).<br>4. **TOUCH TARGET:** Mọi nút bấm (Button) phải có inline style `minHeight: '44px'` để dễ chạm trên iPad/Tablet. | ⚠️ BẮT BUỘC — QUY TẮC UI SỐNG CÒN |
| **HÀNH VI HIỂN THỊ (LAYOUT BEHAVIOR):** Cấp thuộc tính `min-h-0` trên các khu vực cần cuộn dọc (scroll) để nó co dãn đúng kích cỡ `max-h` của thẻ cha mà không ép ngược thẻ cha dài ra, khiến thành phần bên dưới (Footer/Button) bị đẩy tụt ra khỏi viền Padding hoặc ra khỏi giới hạn màn hình. Nếu linh kiện có khả năng bị rộng quá thì dùng `flex-wrap`. | Đảm bảo tính nhất quán trên tablet |
| **⚠️ TAILWIND CSS 4 — GIỚI HẠN JIT (Phát hiện thực tế, BẮT BUỘC ĐỌC):** Tailwind CSS 4 dùng JIT scanner — chỉ generate CSS cho các class đã từng xuất hiện trong codebase. Nếu bạn thêm một class padding MỚI như `p-7`, `px-7`, `py-6` mà **chưa từng được dùng ở bất kỳ file nào**, class đó sẽ **KHÔNG được compile → padding = 0 → nội dung vẫn dính sát viền mặc dù code trông đúng**. **GIẢI PHÁP BẮT BUỘC:** Với mọi phần tử UI cần đảm bảo khoảng cách tách rời khỏi viền (Card Header, Card Body, Card Footer, Modal wrapper, inner container, action row), PHẢI dùng **`style={{ padding: '28px' }}`** thay vì Tailwind utility class `p-7`. Cú pháp inline style được React biên dịch thành CSS-in-JS, KHÔNG phụ thuộc vào Tailwind scanner, do đó **ĐẢM BẢO 100% hoạt động**. Tham chiếu đúng: `SharedCustomizationModal.jsx` dùng `style={{ padding: '40px' }}` — đây là mẫu chuẩn cần làm theo. **⚠️ MỞ RỘNG — CLASS DIRECTIONAL (pl, pr, pt, pb) CŨNG BỊ ẢNH HƯỞNG:** Không chỉ `p-X` mà CÁC CLASS DIRECTIONAL như `pl-7`, `pr-6`, `pt-5`, `pb-8` cũng bị JIT bỏ qua nếu chưa tồn tại. Một trường hợp thực tế đã gặp: dùng `pl-7` để tạo khoảng cách giữa chữ và viền bo cong (`borderRadius` + `boxShadow: inset`) — code trông đúng nhưng chữ vẫn dính sát viền vì class bị bỏ qua. **LUÔN LUÔN** dùng `style={{ paddingLeft: '28px' }}` (hoặc `paddingRight`, `paddingTop`, `paddingBottom`) thay vì `pl-7`. **⚠️ PATTERN CARD CONTAINER (QUAN TRỌNG):** Mọi card/container/box có `border` và `borderRadius` (sử dụng CSS variables) đều PHẢI dùng inline style cho padding để tránh nội dung dính viền: (1) `overflow-hidden` + `borderRadius` → content bên trong cần `padding` riêng. (2) `flex flex-col` card → phần tử cuối cùng (footer/action row) vẫn cần card có `paddingBottom` đủ hoặc tự thêm `marginBottom`. (3) Quy tắc: **Card container** dùng `style={{ borderRadius: 'var(--radius-card)', padding: 'var(--spacing-card, 20px)' }}`. | ⚠️ CRITICAL — lỗi im lặng khó debug |
| **TIÊU CHUẨN CHỮ:** "Chữ thường" nghĩa là Font Weight bình thường (không in đậm vô tội vạ). Tiêu đề chính phải **IN HOA, TO RÕ (Size 24px)** để dễ thao tác trên iPad. | iPad Usability |
| `usageHistory` của ingredient phải là object `{dateStr: qty}`, **không** array | Bug cũ đã fix, nếu là array phải convert |

---

## 8. Sơ đồ tương tác giữa các module chính

```
main.cjs (Electron)
  │── spawn → server.cjs (Express :3001)
  │                │── Database: SQLite (cafe.db) via db.cjs
  │                │   ├── WAL mode (Write-Ahead Logging) cho concurrency
  │                │   └── Indexes: timestamp, orderId (tối ưu query lớn)
  │                └── Cloudflare Tunnel (subprocess)
  │
  └── BrowserWindow(s)
        ├── Admin (#/admin) → AdminDashboard.jsx
        │     ├── AdminDashboardTabs/OrdersTab.jsx
        │     │     └── StaffOrderPanel.jsx (nhập đơn thủ công)
        │     ├── AdminDashboardTabs/MenuTab.jsx
        │     ├── AdminDashboardTabs/InventoryTab.jsx
        │     ├── AdminDashboardTabs/StaffTab.jsx
        │     │     └── SchedulesView.jsx (lịch ca)
        │     ├── AdminDashboardTabs/ReportsTab.jsx
        │     │     ├── BusinessAnalyticsSection.jsx
        │     │     └── TaxReportSection.jsx
        │     ├── AdminDashboardTabs/SettingsTab.jsx
        │     └── IPC toggle-kiosk → mở/đóng Kiosk window
        │
        └── Kiosk (#/kiosk) → CustomerKiosk.jsx
              ├── SSE /api/events → ORDER_CHANGED → fetchPendingOrders() (debounce 200ms)
              │                 → KIOSK_QR_DEBT → mở QR modal debt ngay lập tức
              ├── poll GET /api/qr-info (1s) → detect POS checkout session
              ├── poll GET /api/order/status/queue (10s, backup)
              ├── poll GET /api/notifications/completed (10s) → TTS
              ├── SharedCustomizationModal.jsx (inline tùy chỉnh)
              └── POST /api/order (submit order)

Mobile (QR scan) → http://LAN_IP:3001/?action=order&token=XXX
  → server.cjs serve dist/index.html
  → React load, main.jsx URL interceptor → #/order?token=XXX
  → MobileMenu.jsx: check token, cho đặt món
  → POST /api/order → server validate token → tạo order
```

---

## 9. Các tính năng đã thêm gần đây (Tham khảo khi viết code liên quan)

### 9.1 Master Ledger (Sổ Hóa Đơn Chi Tiết)
- **File:** `AdminDashboardTabs/ReportsTab.jsx`
- **10 cột:** STT (Mã Đơn), Giờ Xong, Chi Tiết Món (Bill), Nền Tảng, Tổng Bill, Khuyến Mãi/Phí Sàn, Thực Nhận, Chi Phí (COGS), Lợi Nhuận Gộp, Ghi Chú
- **COGS tính động:** Tra cứu recipe của mỗi `cartItem` → nhân với `avgCost` từ `inventoryStats`
- **Lọc:** Tuân theo bộ lọc thời gian (`reportPeriod`) hiện tại của trang Báo Cáo
- **Đơn hủy:** Show đỏ nhạt, chỉ hiện Ghi Chú "Hủy: {reason}", các cột tài chính = 0

### 9.2 Xuất EXCEL/CSV — Master Ledger
- **Hàm:** `exportToCSV()` trong `ReportsTab.jsx`
- **Cột xuất:** Khớp 100% với Master Ledger trên màn hình (11 cột bao gồm cả COGS)
- **Encoding:** UTF-8 BOM (`\uFEFF`) — đọc đúng Tiếng Việt trong Microsoft Excel
- **Giá:** Nhân x1000 khi xuất CSV (trả về VND thực, không phải đơn vị nghìn)
- **Tên file:** `Master_Ledger_{period}_{date}.csv`

### 9.3 Hotkey Chuyển Tab Nền Tảng (POS Order Screen)
- **Phím `+` trên numpad:** Chuyển tuần tự qua các tab: INSTORE → GRAB → SHOPEE → INSTORE
- **Phím `0` `0` (nhập hai số 0):** Mở `QuickPaymentModal` cho đơn cũ nhất (đồng bộ giao diện với STT + Enter)
  - Modal hiển thị danh sách món, QR VietQR, checkbox in hóa đơn, [ESC]/[ENTER]
- **Phím số (1-9):** Chọn add-on nhanh trong `SharedCustomizationModal` (xem 9.13)
- **Phím ESC (khi shortcut active):** Reset shortcut, giữ nguyên cửa sổ order
- **Phím ESC (khi shortcut idle):** Đóng cửa sổ order

### 9.4 Báo Cáo Doanh Thu Đa Nền Tảng (Delivery Apps)
- Bảng phân tích riêng cho Grab/Shopee trong Tab Báo Cáo
- Tự động tính: Gross, Phí sàn (%), Thực nhận, COGS, Lợi nhuận gộp
- Phí sàn mỗi nền tảng được cấu hình trong Settings (`deliveryAppsConfigs.{GRAB|SHOPEE}.fee`)
- Giá menu tự động markup khi chọn tab Grab/Shopee để bù phí sàn (công thức: `1 / (1 - feePercent/100)`)

### 9.5 Phím Tắt Tìm Kiếm theo ShortcutCode
- Menu item và Shortcut có thể được gán `shortcutCode` ngắn (VD: `CFM` cho Cà Phê Muối)
- Tìm kiếm bằng code cho kết quả khớp ngay cả khi không gõ tên đầy đủ
- Logic trong `src/utils/ShortcutUtils.js`

### 9.6 Hệ thống Quản lý Giờ làm & Chấm công
- **Nguyên lý:** Khóa chặt chức năng tự do chấm công. Nhân viên chỉ được `clockIn` vào Ca làm (Schedule) cố định dựa trên thời gian thực.
- **Dung sai:** `±30 phút` so với thời gian bắt đầu Ca (sớm hơn/trễ hơn đều 403 Forbidden).
- **Auto-Clockout:** `server.cjs` chạy background process quét mỗi 1 phút (`autoClockoutEndedShifts`). Shift trễ quá 30 phút sau giờ End bị hệ thống tự clockout và tính lương.
- **Skip Validation Mode:** Các lệnh thủ công từ Admin UI dùng `token: 'ADMIN_BYPASS'` để bỏ qua security check.

### 9.7 Biểu đồ Ca làm (Gantt Chart Interactive)
- **File:** `AdminDashboardTabs/StaffReportModal.jsx`
- **Màu nội suy:** Lấy `scheduleId` của mỗi `Shift` → tìm `color` trong `schedules` → nhuộm nền Gantt bar.
- **Scroll Layering:** Modal có Body scroll và Bottom Sticky riêng cho thanh tổng kết lương.

### 9.8 Hệ thống Báo Cáo Thuế Định Kỳ
- **File:** `AdminDashboardTabs/TaxReportSection.jsx`
- **Nguyên lý Độc lập Cột mốc:** Lấy toàn bộ lịch sử `report.logs` (không theo bộ lọc ngày của UI) để đảm bảo chu kỳ thuế chính xác.
- **Tab linh hoạt:** Tháng / Quý / Năm — `group by` doanh thu theo chuẩn thời gian.
- **Xuất CSV Thuế:** Bóc tách từng `cartItem` trong từng `log.orderData` — chuẩn kê khai thuế GTGT 2026.

### 9.9 Hệ thống Tự động Cập nhật (Auto-Update)
- **Desktop (Electron):** `electron-updater` trong `main.cjs`. Banner xanh tại AdminDashboard.
- **Linux Server:**
    - API `/api/system/version`: Trả về version từ `package.json`.
    - API `/api/system/update`: Tải `.tar.gz` từ GitHub, giải nén, gọi `pm2 restart`.
- **Quy trình đóng gói (`release.sh`):**
    1. `npm run electron:build` (tạo bản Desktop)
    2. Tạo `order-cafe-v{version}.tar.gz` (mã nguồn server cho Linux)
    3. Upload thủ công lên GitHub Release

### 9.10 Hệ thống Cơ Sở Dữ Liệu SQLite & Indexing
- **Thay thế hoàn toàn** JSON file storage bằng `better-sqlite3`.
- **Auto Migration:** Phát hiện JSON cũ, chuyển sang `cafe.db`, lưu JSON cũ vào `archived_migration/`.
- **Indexes:** `timestamp`, `orderId` — tối ưu query trên bảng lớn (orders, report_logs, inventory_audits).
- **WAL Mode:** Bảo vệ concurrency và toàn vẹn dữ liệu.
- **File:** `db.cjs` — khởi tạo schema, indexes, và helper functions.

### 9.11 Chuẩn hóa Thời gian (TimeUtils)
- **Backend (`server.cjs`):** Dùng `getCurrentISOString()` cho timestamp. `parseDate(ts).toISOString()` khi format thời gian ngoài.
- **Frontend (`*.jsx`):** Dùng `formatDateTime(ts)`, `formatDate(ts)`, `formatTime(ts)` từ `src/utils/timeUtils.js`.
- **Lý do:** Dữ liệu cũ bị lẫn lộn giữa string số và số nguyên khiến `new Date(ts)` crash (`Invalid time value`).

### 9.12 Modularization của AdminDashboard
- **Trước:** `AdminDashboard.jsx` là file đơn ~8200+ dòng, ~624KB.
- **Hiện tại:** `AdminDashboard.jsx` là shell nhỏ gọn, từng Tab được tách ra `AdminDashboardTabs/`.
- **Bản backup:** `AdminDashboard.jsx.bak` — KHÔNG chỉnh sửa, KHÔNG import.
- **Modals phức tạp** đã vào `AdminDashboardTabs/modals/` (18 modal files).

### 9.13 SharedCustomizationModal (Tầng 2 — Shortcut trong Modal)
- **File:** `src/components/SharedCustomizationModal.jsx`
- **Dùng chung:** `CustomerKiosk.jsx` và `StaffOrderPanel.jsx`
- **Mục đích:** Sau khi chọn món mở modal, nhân viên dùng phím tắt để chỉnh option không cần chuột.
- **Numpad Mapping:** Dùng `e.code` (độc lập với OS/locale) để map sang ký tự tiêu chuẩn, fallback về `e.key`.
- **Hệ thống Phím tắt (Key Buffer 3 giây):**
  - **Đổi Size:** Phím `.` → Xoay vòng thứ tự qua lại các Size.
  - **Nhân Số Lượng:** Phím `*` → Chờ `1-9` → Cập nhật số lượng & tính lại Tổng tiền.
  - **Mức Đường:** Phím `-` → Chờ `0` (0%), `5` (50%), `1` (100%).
  - **Mức Đá:** Phím `/` → Chờ `0` (Không đá), `5` (Ít đá), `1` (Bình thường), `9` (Nhiều đá).
  - **Topping/Add-on:** Phím `1-9` (Trực tiếp, không qua buffer) → Toggle addon thứ tự tương ứng.
  - **Xác nhận/Hủy:** `Enter` (Lưu vào giỏ) / `Esc` (Đóng modal).

### 9.16 Kiến trúc Hệ thống Phím Tắt 2 Tầng (POS Flash Shortcuts)

#### Tầng 1 — ShortcutProvider (ShortcutManager.jsx)
- **Mục đích:** ORDER MÓN không cần mở modal. Gõ `shortcutCode` món → modifier → Enter → vào giỏ luôn.
- **Files:** `src/components/ShortcutManager.jsx` + `src/utils/ShortcutUtils.js`
- **Wrapper:** `<ShortcutProvider>` bao ngoài `StaffOrderPanelInner` trong `StaffOrderPanel.jsx`
- **Tắt tự động** khi `SharedCustomizationModal` đang mở (prop `isEnabled={!modalOpen}`)
- **Buffer timeout:** 1500ms — tự xử lý nếu không nhập thêm sau 1.5 giây.
- Ánh xạ phím Tầng 1:

  | Phím | Hành động |
  |------|----------|
  | `14` + `Enter` | Thêm món shortcutCode=14 vào giỏ |
  | `.` / `NumpadDecimal` | Xoay vòng Size |
  | `-` + `0/5/1` | Đường: 0%, 50%, 100% |
  | `/` + `0/5/1/9` | Đá: Không/Ít/Bình thường/Nhiều |
  | `*` + `1-9` | Số lượng |
  | `+` / `NumpadAdd` | Đổi nguồn đơn (INSTORE→GRAB→SHOPEE) |
  | `ESC/Backspace` (shortcut active) | Reset shortcut + Toast thông báo, giữ nguyên cửa sổ |
  | `ESC/Backspace` (idle) | Đóng cửa sổ order |

#### Tầng 2 — SharedCustomizationModal (khi modal đang mở)
- Xem **9.13** — loại phím tắt kép prefix + số, timeout 3 giây.
- Tầng 1 bị tắt trong thời gian modal mở.

#### ⚠️ QUY TẮC BẤT BIẾN KHI SỬA CODE SHORTCUT

**1. Logic `parseSugar` trong ShortcutUtils.js — CẢNH BÁO:**
- `t === '0'` PHẢI dùng `o.startsWith('0')`, **TUYỆT ĐỐI KHÔNG** dùng `o.includes('0')`.
- Lý do: `'100%'.includes('0') === true` → tìm nhầm `'100%'` thay vì `'0%'`.
- `t === '5'` dùng `o.startsWith('5') || o.includes('50')`.
- `t === '1'` dùng `(o.startsWith('1') && o.includes('100')) || o.toLowerCase().includes('bình thường')`.
- Khi `sugarOptions` / `iceOptions` rỗng: fallback → `['100%', '50%', '0%']` / `['Bình thường', 'Ít đá', 'Không đá', 'Nhiều đá']`.

**2. Thứ tự Event Listener — BẾP NÚT KIẾN TRÚC QUAN TRỌNG:**
- React chạy effect của component **con trước, cha sau**.
- `StaffOrderPanelInner` (con) đăng ký `handlePosKey` vào `window` **TRƯỚC**.
- `ShortcutProvider` (cha) đăng ký `handleKeyDown` vào `window` **SAU**.
- Với `capture: true`, listener đăng ký trước chạy trước → `handlePosKey` luôn chạy TRƯỚC `handleKeyDown`.
- **Hệ quả:** `e.stopPropagation()` trong `ShortcutProvider` vô dụng vì `handlePosKey` đã chạy rồi.
- **Giải pháp bất biến:** `handlePosKey` phải tự kiểm tra `isShortcutActive()` trước khi gọi `onClose()`.

**3. Pattern `isShortcutActive` — Ref-based Guard:**
- `isShortcutActive` là `useCallback(() => !!(mainItemRef.current || bufferRef.current), [])`.
- Đọc từ **ref** (không phải state) → luôn trả giá trị hiện tại, không bị stale closure.
- Exposed qua `ShortcutContext` → `useShortcut()` trong bất kỳ component con nào.
- `handlePosKey` trong `StaffOrderPanelInner` phải include `isShortcutActive` trong deps array.

**4. Numpad Mapping — Hai cách khác nhau mỗi tầng:**
- Tầng 1: `mapNumpadKey(e.key)` trong `ShortcutUtils.js` (switch theo `e.key`).
- Tầng 2 (Modal): `numpadCodeMap[e.code] || e.key` (switch theo `e.code` — ổn định hơn trên mọi OS/Electron).

**5. Context API của ShortcutProvider:**
- `buffer`, `mainItem`, `toppings`, `currentSize`, `currentSugar`, `currentIce`, `currentQuantity`: state values.
- `overlayState`, `flashKey`: quản lý flash animation.
- `escResetKey` (counter): tăng mỗi khi ESC reset shortcut → component con watch để hiện toast.
- `isShortcutActive()`: hàm đọc từ ref, stable (useCallback với deps=[]).
- `dismissOverlay`: alias của `resetAll`.

### 9.14 Promotion Engine
- **File:** `src/utils/promotionEngine.js`
- **Logic:** Tính toán khuyến mãi, voucher, giảm giá phức tạp — tách hoàn toàn khỏi UI.
- **Dùng trong:** `StaffOrderPanel.jsx`, `MobileMenu.jsx`, `CustomerKiosk.jsx`.

### 9.15 MobileMenu (đổi tên từ Menu.jsx)
- **File:** `src/components/MobileMenu.jsx` (trước là `Menu.jsx`)
- **Route:** `/#/order` và `/#/item/:itemId` — đặt món qua QR phone.
- **Tính năng mới:** Deep link vào item cụ thể qua `itemId` trong URL.

### 9.17 Kiến trúc SSE Hybrid Real-time Sync (02/04/2026)

#### Server — `server.cjs`
```javascript
// Hàm broadcast chung — gọi sau MỌI mutation của order
function broadcastEvent(eventName, data = {}) {
    // Gửi SSE event tới tất cả sseClients đang kết nối
    // Format: 'event: ORDER_CHANGED\ndata: {...}\n\n'
}

// 9 routes gọi broadcastEvent('ORDER_CHANGED'):
// POST /api/order (create), PUT /api/orders/:id (update),
// DELETE /api/orders/:id, POST /api/orders/confirm-payment/:id,
// POST /api/orders/cancel/:id, POST /api/orders/mark-debt/:id,
// POST /api/orders/pay-debt/:id, POST /api/orders/complete/:id,
// POST /api/orders/complete-debt/:id

// Route /api/kiosk/show-qr/:id — broadcast KIOSK_QR_DEBT
// Khosk nhận ngay thay vì chờ 2s poll
app.post('/api/kiosk/show-qr/:id', (req, res) => {
    forceKioskQrDebtOrderId = req.params.id;
    broadcastEvent('KIOSK_QR_DEBT', { orderId: req.params.id }); // ← SSE push
    ...
});

// Heartbeat 30s để giữ kết nối qua Cloudflare Tunnel
// (Cloudflare timeout idle connections sau 100s)
```

#### AdminDashboard — `AdminDashboard.jsx`
- SSE EventSource → `ORDER_CHANGED` → debounce 150ms → `fetchOrders()`
- `fetchOrders()` fetch đồng thời: `/api/orders` + `/api/report` → update `orders` + `report` state
- **Bug fix (02/04/2026):** `setReport` trước dùng sai field names (`totalRevenue`, `totalOrders`, `totalCancelled`) → luôn so sánh `undefined === undefined → true` → report không bao giờ update. **Fix:** dùng đúng field server: `totalSales`, `successfulOrders`, `cancelledOrders`, `logs.length`
- Backup polling 15s đảm bảo eventual consistency khi SSE disconnect

#### CustomerKiosk — `CustomerKiosk.jsx`
- SSE EventSource kết nối `/api/events` (cùng endpoint AdminDashboard)
- `ORDER_CHANGED` → debounce 200ms → `fetchPendingOrders()`
- `KIOSK_QR_DEBT` → `handleKioskQrDebt(orderId)` — mở QR modal ngay lập tức cho debt order
- Xóa `pollKioskEvents` setInterval 2s (thay bằng SSE)
- Backup polling `fetchPendingOrders` đổi từ **3s → 10s**
- `fetchData` (menu) đổi từ **5s → 15s** (SSE xử lý order sync)
- `completedQueue` (TTS) đổi từ **5s → 10s**
- SSE auto-reconnect sau 5s nếu bị ngắt kết nối

#### OrdersTab — Keyboard Shortcut Logic Fix (02/04/2026)
```javascript
// TRƯỚC: COMPLETED luôn show toast "đã hoàn tất" dù chưa thu tiền
if (target.status === 'COMPLETED') {
    showToast(`Đơn #${qNum} đã hoàn tất trước đó`, 'warning'); // ← BUG
}

// SAU: COMPLETED nhưng chưa thu tiền → mở QuickPaymentModal
if (target.status === 'COMPLETED') {
    if (!target.isPaid && !target.isDebt) {
        setShowPaymentModal(target); // ← Mở QR payment ngay
    } else {
        showToast(`Đơn #${qNum} đã hoàn tất trước đó`, 'warning');
    }
}
// Use case: Bếp mark COMPLETED → thu ngân gõ số đơn + Enter → QR payment mở ngay
```

#### Bug fix quan trọng — PUBLIC ROUTE cho `/api/events` (02/04/2026)
```javascript
// server.cjs — app.use('/api', ...) auth middleware whitelist

// CRITICAL: EventSource không hỗ trợ custom headers
// → Kiosk (không có token) bị 401 → SSE không hoạt động
// → Fallback 10s (tệ hơn 3s polling cũ!)

// FIX: Thêm '/events' vào public GET route whitelist
if (['/menu', ..., '/promotions', '/events']  // ← '/events' được thêm ở đây
    .some(p => path.startsWith(p))) {
    return next(); // Public — không cần auth
}

// Tại sao an toàn:
// /api/events chỉ push 'ORDER_CHANGED' / 'KIOSK_QR_DEBT'
// Không trả về dữ liệu nhạy cảm (không có thông tin đơn hàng cụ thể)
// Chỉ là tin hiệu “có gì đó thay đổi” → client tự fetch nếu cần
```

> ⚠️ **QUY TẬ BẤT BIẼN:** Nếu thêm SSE endpoint mới cho Kiosk, luôn đảm bảo endpoint đó được thêm vào public whitelist. `EventSource` không gửa được headers.

---

*Cập nhật lần cuối: 02/04/2026 — Bổ sung fix cực kỳ quan trọng: `/api/events` phải được public trong auth middleware whitelist. EventSource không hỗ trợ Authorization header — Kiosk không có token sẽ bị 401 dẫn đến SSE thất bại hoàn toàn.*

---

### 9.18 QuickPaymentModal — Modal Thu Tiền Thống Nhất (02/04/2026)

#### File mới: `src/components/AdminDashboardTabs/QuickPaymentModal.jsx`

Modal dùng chung cho tất cả luồng thanh toán POS, thay thế các logic inline riêng lẻ trước đây:

```
QuickPaymentModal props:
  order          — object đơn hàng (có cartItems, price, queueNumber)
  onClose        — callback đóng modal (ESC phím tắt)
  onConfirmPayment(id) — gọi khi thu tiền xong → isPaid = true
  onCompleteOrder(id)  — gọi khi hoàn tất đơn
  formatVND      — hàm format giá
  settings       — object settings (bankId, accountNo, accountName, customQrUrl)
  generateReceiptHTML  — hàm tạo HTML in bill
  showToast      — hàm hiện toast
```

**Layout: 2 cột**
- Cột trái: Danh sách món (tên + size + số lượng `x N` + giá)
- Cột phải: QR VietQR (hoặc placeholder nếu chưa cấu hình ngân hàng)
- Footer: Checkbox in bill + [ESC] Hủy / [ENTER] Đã nhận tiền

**Keyboard shortcuts trong modal:**
- `ESC` → `onClose()` (capture phase, ngắt sự kiện trước)
- `Enter` → `handleConfirm()` (tự động thu tiền + in bill nếu checked)

**Sử dụng trong:**
- `OrdersTab.jsx` — khi nhấn "STT + Enter" keyboard shortcut (đơn chưa thanh toán hoặc COMPLETED chưa thu tiền)
- `AdminDashboard.jsx` — import để dùng cho phím tắt `00` (đơn cũ nhất)

> ⚠️ **Không được tạo logic thu tiền inline mới** — mọi luồng đều phải qua `QuickPaymentModal`.

---

### 9.19 Reprint Indicator — Chỉ thị In Lại Bill (02/04/2026)

**File:** `AdminDashboardTabs/OrdersTab.jsx`

Khi nhân viên nhấn "In lại Bill" trong lịch sử đơn (`showCompletedOrders = true`):

1. In HTML bill via Electron `ipcRenderer.invoke('print-html', ...)`
2. Tăng `reprintCount` của đơn: `PUT /api/orders/:id { reprintCount: N }`
3. Gọi `fetchOrders(true)` để làm mới trạng thái
4. Nút đổi màu cam + hiện số lần in: `In lại Bill (2)`

```jsx
// Logic nút "In lại Bill"
<button
  className={`... ${(order.reprintCount || 0) > 0
    ? 'bg-orange-50 text-orange-600 border-orange-200'  // Đã in lại ít nhất 1 lần → cam
    : 'bg-bg-surface text-gray-600 border-gray-200'     // Chưa in lại → xám
  }`}
>
  <Printer size={18} />
  In lại Bill {(order.reprintCount || 0) > 0 ? `(${order.reprintCount})` : ''}
</button>
```

**Field mới trong order:** `reprintCount: number` (default 0) — cho phép kiểm tra xem bill đã bị in lại bao nhiêu lần (chống gian lận in thêm).

---

### 9.20 Kitchen Printing — In Phiếu Bếp (02/04/2026)

**File:** `src/utils/printHelpers.js` — hai hàm mới:
- `generateKitchenTicketHTML(order, cartItems, settings)` — phiếu bếp đơn giản (chỉ tên món + số lượng + options)
- `generateCombinedKitchenTicketHTML(order, cartItems, settings)` — Phiếu bếp kết hợp (dùng khi in đồng thời với hóa đơn)

**File:** `AdminDashboardTabs/StaffOrderPanel.jsx`
```javascript
const [printKitchenTicket, setPrintKitchenTicket] = useState(
  localStorage.getItem('printKitchenEnabled') === 'true'
);
```

**Luồng in bếp trong `submitOrder()`:**
```javascript
if (printKitchenTicket && window.require) {
  const kitchenPrinter = localStorage.getItem('kitchenPrinter') || selectedPrinter;
  const kitchenHtmlContent = generateCombinedKitchenTicketHTML(...);
  
  if (printCurrentOrder) {
    // In hóa đơn trước, đợi 1.5s rồi in bếp (tránh đụng độ printer queue)
    setTimeout(() => {
      ipcRenderer.invoke('print-html', kitchenHtmlContent, kitchenPrinter, settings?.kitchenPaperSize);
    }, 1500);
  } else {
    ipcRenderer.invoke('print-html', kitchenHtmlContent, kitchenPrinter, settings?.kitchenPaperSize);
  }
}
```

**Toggle UI trong Checkout Modal:** Toggle nút cam "In bếp" ở footer xà checkout, lưu `localStorage.printKitchenEnabled`.

**Settings fields mới:**
- `kitchenPaperSize` — kích thước giấy bếp (mặc định `null` → dùng `receiptPaperSize`)
- `kitchenPrinter` — tên máy in bếp (lưu `localStorage` riêng)

---

### 9.21 mergedCart — Gộp Món Trùng Nhau (02/04/2026)

**File:** `AdminDashboardTabs/StaffOrderPanel.jsx`

```javascript
const mergedCart = useMemo(() => {
  // Gộp các cartItem có cùng: item.id, size.label, sugar, ice, note, totalPrice, addons
  // Cộng dồn count của các item trùng nhau thay vì tạo dòng riêng
}, [processedCart]);
```

**Quy tắc gộp (tất cả phải khớp):**
- `item.id` — cùng sản phẩm
- `size?.label` — cùng size
- `sugar` — cùng mức đường
- `ice` — cùng mức đá
- `note` — cùng ghi chú
- `totalPrice` — cùng giá (đảm bảo nếu giá thay đổi do markup GRAB/SHOPEE)
- `addons[].label` sorted — cùng topping

**Ứng dụng của `mergedCart`:**
- **In hóa đơn:** `generateReceiptHTML(order, mergedCart, ...)` → in gọn, không bị dư dòng
- **In phiếu bếp:** `generateCombinedKitchenTicketHTML(order, mergedCart, ...)` → bếp đọc rõ ràng
- **Gửi server:** `orderData.cartItems = mergedCart` → DB lưu đơn đã gộp
- **Checkout Modal:** Hiển thị `mergedCart` (mỗi dòng = 1 loại món với `x N`)

> ⚠️ **Bộ lọc Cart hiển thị trong POS vẫn dùng `processedCart` (chưa gộp)** để nhân viên thấy từng lần thêm riêng và có thể xóa từng cái. `mergedCart` chỉ dùng khi checkout, in, gửi API.

---

### 9.22 Mobile POS — Bottom Sheet Cart Drawer (02/04/2026)

**File:** `AdminDashboardTabs/StaffOrderPanel.jsx`

**Vấn đề cũ:** Giao diện POS trên điện thoại/tablet nhỏ hiển thị giỏ hàng dưới dạng cột phải cố định → chiếm quá nhiều diện tích, không dùng được.

**Giải pháp mới — Bottom Sheet Architecture:**

```jsx
// State
const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);

// Cart Panel — kết hợp sidebar (desktop) + bottom sheet (mobile)
<div className={`
  w-full md:w-[320px] lg:w-[350px]          // Desktop: sidebar cố định bên phải
  fixed md:static inset-x-0 bottom-0 z-[600] // Mobile: fixed ở bottom
  h-[85vh] md:h-auto                         // Mobile: chiếm 85% màn hình
  rounded-t-3xl md:rounded-none              // Mobile: bo góc trên
  transform transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]
  ${isMobileCartOpen ? 'translate-y-0' : 'translate-y-full md:translate-y-0'}
`}>

// Floating Summary Bar — chỉ hiện trên mobile khi cart có hàng và drawer đóng
{!isMobileCartOpen && cart.length > 0 && (
  <div className="md:hidden fixed bottom-4 left-4 right-4 z-[400]">
    <button onClick={() => setIsMobileCartOpen(true)} className="w-full bg-brand-600 ...">
      <ShoppingBag /> {formatVND(totalOrderPrice)} · {cart.length} món trong giỏ
      <span>Xem ↑</span>
    </button>
  </div>
)}
```

**Layout sản phẩm trên mobile:**
```css
/* Override CSS: Luôn 2 cột trên màn hình < 768px */
@media (max-width: 767px) {
  .pos-item-grid-mobile { grid-template-columns: repeat(2, minmax(0,1fr)) !important; }
}
```

**Drag Handle:** Thanh xám ở top của bottom sheet để kéo đóng (UX mobile chuẩn iOS).

**Backdrop:** Overlay mờ đen che phía sau khi bottom sheet mở, tap để đóng.

**Z-Index hierarchy (mobile):**
```
700  — Checkout modal (highest)
600  — Bottom sheet cart
550  — Backdrop overlay
400  — Floating summary bar
500  — StaffOrderPanel container
```

---

### 9.23 HUD-Touch Mode — Giao Diện Chạm Nhanh (03/04/2026)

**File:** `AdminDashboardTabs/HUDItemCard.jsx` + `AdminDashboardTabs/StaffOrderPanel.jsx`

#### Tổng quan

Chế độ thứ 2 của POS Staff Panel, tối ưu cho màn hình cảm ứng lớn (iPad, tablet). Mỗi card hàng hoá trong lưới khi được tap sẽ phóng to thành overlay HUD toàn màn hình để chọn size / đường / đá / topping và thêm vào giỏ ngay lập tức.

#### Kiến trúc `HUDItemCard`

```
StaffOrderPanel (orderMode === 'touch')
  └─ Renders HUDItemCard for every filtered item
       ├─ <div> (thẻ nhỏ trong lưới) — click để kích hoạt overlay
       └─ {isActive && <div>} (overlay z-[900]) — hiện tức thì, KHÔNG animation
```

> ⚠️ **HUDItemCard là NO-ANIMATION ZONE.** Tất cả `motion.div`, `motion.img`, `AnimatePresence` và `layoutId`
> đã bị XÓA có chủ ý để tối ưu hiệu suất cảm ứng trên iPad POS. Overlay xuất hiện tức thì (0ms delay).
> TUYỆT ĐỐI KHÔNG thêm lại Framer Motion vào file này.

**State quản lý:** `activeHudItem` trong `StaffOrderPanelInner` — chỉ 1 item được mở HUD tại một thời điểm, truyền `isActive={activeHudItem?.id === item.id}`.

#### Layout HUD Overlay (khi active)

```
+--------------------------------------------------+
| [Sugar Row: 0% | 30% | 50% | 100%] 15% height   |
+--------+---------------------------+-------------+
| [Size] |    [Center: Item Image]   | [Addons]    |
| col    |    + confirm button       | col         |
| 80-100 |    (tap → add to cart)    | 80-100px    |
|   px   |                           |             |
+--------+---------------------------+-------------+
| [Ice Row: Không đá | Ít đá | Bình thường | Nhiều đá] 15% |
+--------------------------------------------------+
| [×] Đóng (absolute -top-12)                      |
+--------------------------------------------------+
```

**Pastel Color Coding (4 gradient stops mỗi loại):**
- **Sugar:** Yellow → Orange (nhạt → đậm theo %)
- **Ice:** Blue-50 → Blue-300 (trong → đậm theo lượng đá)
- **Size:** Gray-50 → Gray-300 (nhạt → đậm)
- **Addons:** Brown pastel (4 mức)

**Selected state:** `boxShadow: inset 0 0 0 6px {color.border}` — viền inset rõ ràng thay vì background thay đổi (dễ nhìn trên cảm ứng).

#### Header POS — Refactor Điều Khiển (03/04/2026)

Trước đây: nút Classic/HUD-Touch ở góc phải → bị ẩn trong HUD-Touch mode (Cart panel che phủ).

**Sau refactor:**
```jsx
<header className="flex justify-between items-center">
  {/* Trái: Nút đóng + Tiêu đề */}
  <div className="shrink-0">
    <X /> [BÁN HÀNG hidden trên mobile]
  </div>

  {/* Giữa: Switcher Classic/HUD + Toggle cột — chiếm flex-1 */}
  <div className="flex-1 max-w-[800px] mx-auto flex gap-2">
    <div className="flex-1 h-[54px] bg-gray-100/80 rounded-[12px]">
      <button Classic /> <button HUD-Touch />
    </div>
    <button /* Toggle cột */ h-[54px] w-[80-100px] />
  </div>

  {/* Phải: Avatar nhân viên */}
  <div className="shrink-0">...</div>
</header>
```

**Lý do:** Cả 2 nút đều luôn hiển thị ở trung tâm header, không bao giờ bị Cart panel che phủ. Kích thước `h-[54px]` đảm bảo touch target đủ lớn (> 44px tối thiểu).

**Nút toggle cột hoạt động ở CẢ HAI mode** — Classic mode dùng để đổi cột grid sản phẩm, HUD-Touch mode dùng để đổi mật độ lưới HUD card.

#### Các bug đã fix (03/04/2026)

| Bug | Nguyên nhân | Fix |
|-----|-------------|-----|
| `selectedIce`/`selectedSugar` = `undefined` khi item có ít option | `ices[2]` / `sugars[3]` hardcode index → vượt bounds nếu list ngắn | Dùng `includes()` để validate `defaultIce`/`defaultSugar`, fallback về tìm 'Bình thường' hoặc `Math.floor(len/2)` |
| HUD overlay crash nếu item không có hình ảnh | `<motion.img src={getImageUrl(undefined)}>` không có guard | Check `item.image` truthy trước, fallback hiển thị chữ cái đầu tên món |
| Addon ẩn không được thông báo khi item có > 4 addons | HUD chỉ hiển thị `slice(0, 4)` mà không có indicator | Thêm badge `+N thêm` phía dưới cột addon |
| HUD overlay vẫn mở khi chuyển Classic → HUD-Touch và ngược lại | `setActiveHudItem(null)` không được gọi khi `orderMode` thay đổi | Thêm `setActiveHudItem(null)` vào `useEffect([orderMode])` |

#### Lưu ý khi sửa code liên quan

- `HUDItemCard` render **2 phần tử đồng thời** (Fragment `<>`): thẻ nhỏ trong lưới + overlay toàn màn hình (z-[900]).
- **KHÔNG dùng `layoutId`** — tính năng zoom animation của Framer Motion đã bị xóa. Overlay xuất hiện tức thì.
- **KHÔNG import `motion` hay `AnimatePresence`** trong `HUDItemCard.jsx` — file này là NO-ANIMATION ZONE.
- `onModalStateChange` trong `StaffOrderPanelInner` **không nhận biết** HUD item — điều này có chủ ý: HUD không disable ShortcutProvider vì HUD cần cảm ứng, không phím tắt.
- Tối đa **4 addon** được hiển thị trong HUD (thiết kế có chủ ý để giữ layout không bị vỡ). Món có > 4 addon hiển thị badge "+N thêm" cuối cột.

#### Muscle Memory Color System (03/04/2026 — cập nhật)

**Triết lý thiết kế:**
- **Chưa chọn:** Nền **trắng** + chữ **màu** → đọc được nội dung, không gây nhiễu thị giác
- **Đã chọn:** Nền **ĐẶC full màu** + chữ **trắng** + dấu `✓` → nhận ra ngay, không thể nhầm
- **`active:scale-95`** → phản hồi cảm ứng tức thì khi tap

**Bảng màu theo nhóm:**

| Nhóm | Ánh xạ trực giác | Màu theo mức |
|------|-----------------|--------------|
| **Đường** | Ngọt tăng → Ấm → Nóng | `0%=#6B7280` (xám) `30%=#F59E0B` (vàng) `50%=#F97316` (cam) `100%=#DC2626` (đỏ) `120%=#991B1B` (đỏ đậm) |
| **Đá** | Lạnh tăng → Xanh đậm dần + Đỏ cho "không lạnh" | `Không đá=#EF4444` (đỏ/nóng) `Ít đá=#60A5FA` `Bình thường=#3B82F6` `Nhiều đá=#1D4ED8` |
| **Size** | Mỗi size một màu độc lập | S=`#10B981` (xanh lá) M=`#3B82F6` (xanh dương) L=`#8B5CF6` (tím) XL=`#F59E0B` (vàng cam) |
| **Addon** | Mỗi slot một màu nghệ thuật | 1=`#EC4899` (hồng) 2=`#8B5CF6` (tím) 3=`#14B8A6` (ngọc) 4=`#F97316` (cam) |

> ⚠️ **Khi thêm màu mới:** Đường dùng `getSugarColor(val)` với fallback theo số %. Đá dùng `getIceColor(val)` với key lookup + fallback xanh dương. Không hardcode index mảng.

---

*Cập nhật lần cuối: 03/04/2026 (lần 3) — Rút kinh nghiệm bug `motion is not defined` tại `HUDItemCard.jsx`: bổ sung anti-pattern số 9 (không dùng `motion.*` mà không import), cập nhật lỗi thường gặp số 7, đánh dấu HUDItemCard là NO-ANIMATION ZONE trong mô tả kiến trúc.*
