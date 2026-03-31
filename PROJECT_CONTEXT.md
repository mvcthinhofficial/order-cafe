# PROJECT_CONTEXT.md — Order Cafe POS System

> **Mục đích:** Tài liệu này giúp AI assistant hiểu chính xác kiến trúc, luồng hoạt động và các quy ước bất biến của dự án để tránh sai khi viết code mới.

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
| Animation | Framer Motion | 12.x |
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
  → Server: tạo order với ID = {TTTT}{DD}{MM}{YY}, lưu SQLite
  → AdminDashboard poll GET /api/orders mỗi vài giây
  → Admin nhấn "Complete" → POST /api/orders/complete/:id
    → Server: trừ kho, cập nhật reports, push notification TTS
  → CustomerKiosk poll /api/notifications/completed (5s)
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

### Polling Pattern (Frontend)
- `CustomerKiosk`: poll `/api/qr-info` mỗi **1s**, `/api/order/status/queue` mỗi **3s**, settings mỗi **10s**, menu mỗi **15s**, notifications mỗi **5s**
- `AdminDashboard`: poll các API tương ứng
- Không dùng WebSocket — hoàn toàn HTTP polling

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

### 🔒 Rule bất biến

| Rule | Lý do |
|------|-------|
| Luôn dùng `SERVER_URL` từ `src/api.js` cho mọi call API | Tự động resolve đúng URL theo môi trường |
| `hashPassword()` dùng PBKDF2, **không** dùng btoa/MD5 | Security |
| Kiểm tra tồn tại record trước khi đọc SQLite | Tránh crash khi DB mới init |
| Không xóa cứng (hard delete) menu item lần đầu — dùng `isDeleted: true` | Soft delete trước, hard delete lần 2 |
| Import tạo ingredient mới nếu chưa có trong inventory | Match theo tên (case-insensitive) |
| Không sửa file `data/.env` — chỉ là backup text thủ công | Không phải biến môi trường thực |
| **BO GÓC (ROUNDED):** Chỉ dành cho Avatar hoặc các nút bấm đặc biệt. Layout chính, Bảng biểu, và Tooltip phải luôn vuông vức. | Quy tắc thẩm mỹ |
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
              ├── poll GET /api/qr-info (1s) → hiện QR đặt món / thanh toán
              ├── poll GET /api/order/status/queue (3s) → pending orders
              ├── poll GET /api/notifications/completed (5s) → TTS
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
- **Phím `0` `0` (nhập hai số 0):** Mở modal xác nhận hoàn tất đơn
  - Modal tự focus để Enter hoạt động ngay lập tức
- **Phím số Numpad (1-9):** Chọn add-on nhanh trong `SharedCustomizationModal`

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

### 9.13 SharedCustomizationModal
- **File:** `src/components/SharedCustomizationModal.jsx`
- **Dùng chung:** `CustomerKiosk.jsx` và `StaffOrderPanel.jsx`
- **Tính năng:** Chọn Size, Đường, Đá, Add-on; cộng giá tự động; phím tắt numpad cho addon.
- **Phím tắt Addon:** Số 1–9 trên numpad → toggle addon tương ứng (chỉ khi modal đang mở).

### 9.14 Promotion Engine
- **File:** `src/utils/promotionEngine.js`
- **Logic:** Tính toán khuyến mãi, voucher, giảm giá phức tạp — tách hoàn toàn khỏi UI.
- **Dùng trong:** `StaffOrderPanel.jsx`, `MobileMenu.jsx`, `CustomerKiosk.jsx`.

### 9.15 MobileMenu (đổi tên từ Menu.jsx)
- **File:** `src/components/MobileMenu.jsx` (trước là `Menu.jsx`)
- **Route:** `/#/order` và `/#/item/:itemId` — đặt món qua QR phone.
- **Tính năng mới:** Deep link vào item cụ thể qua `itemId` trong URL.

---

*Cập nhật lần cuối: 31/03/2026 — Phản ánh cấu trúc modular AdminDashboardTabs, SQLite, TimeUtils, SharedCustomizationModal, và MobileMenu.*
