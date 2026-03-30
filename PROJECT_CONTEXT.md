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
| Database | SQLite (better-sqlite3) | 11.x |
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
│   └── release.yml       # GitHub Actions: Tự động build Win/Mac khi có tag v*
├── main.cjs              # Electron main process: cửa sổ, IPC, khởi server, auto-update
├── server.cjs            # Backend Express: toàn bộ API + update logic server
├── release.sh            # Script đóng gói bản phát hành (Windows, Mac, Linux) từ máy Mac
├── vite.config.js        # Cấu hình Vite build
├── index.html            # HTML entry point
├── package.json          # Scripts, dependencies & GitHub publish config
├── data/                 # THƯ MỤC LƯU TRỮ CHÍNH
│   ├── .env              # Chứa mã khôi phục Admin (không phải env thực sự)
│   ├── cafe.db           # Cơ sở dữ liệu SQLite chứa toàn bộ hệ thống
│   ├── archived_migration/ # Thư mục chứa JSON cũ đã được chuyển sang SQLite
│   ├── receipts/         # Ảnh biên lai thanh toán (jpg)
│   ├── menu_images/      # Ảnh món ăn (webp, resize 800px)
│   └── server.log        # Log server tự động ghi
├── src/
│   ├── main.jsx          # React entry point, URL interceptor, ErrorBoundary
│   ├── App.jsx           # Routing chính, fetch settings, wake lock
│   ├── api.js            # SERVER_URL constant + global fetch interceptor
│   ├── index.css         # Global CSS + Tailwind
│   ├── fonts.css         # Custom fonts
│   └── components/
│       ├── AdminDashboard.jsx   # ~624KB, 8200+ dòng - UI Admin POS chính
│       ├── AdminDashboard.css   # CSS riêng cho Admin
│       ├── CustomerKiosk.jsx    # Kiosk tự phục vụ tại quán
│       ├── Menu.jsx             # Giao diện đặt món qua điện thoại (QR scan)
│       ├── BillView.jsx         # Thanh toán và xem bill
│       ├── Login.jsx            # Màn hình đăng nhập Admin/Staff
│       ├── Portal.jsx           # Trang chào / chọn giao diện
│       ├── KitchenDashboard.jsx # Màn hình bếp
│       ├── AttendanceView.jsx   # Chấm công nhân viên (qua QR)
│       ├── StaffQrKiosk.jsx     # QR chấm công hiển thị trên Kiosk
│       ├── CustomerQrKiosk.jsx  # QR đặt món hiển thị cho khách
│       ├── ShortcutManager.jsx  # Quản lý phím tắt (hotkey)
│       └── VisualFlashOverlay.jsx # Hiệu ứng flash khi nhận đơn
└── public/
    ├── logo.png          # Logo
    └── sw.js             # Service Worker
```

### Quy ước đặt tên file
- Component: `PascalCase.jsx` (VD: `CustomerKiosk.jsx`)
- CSS riêng của component: `ComponentName.css`
- Server/config: `camelCase.cjs` (CommonJS)
- Data files: `snake_case.json`

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
| Route | Component | Mô tả |
|-------|-----------|-------|
| `/#/` | Portal | Trang chào |
| `/#/login` | Login | Đăng nhập |
| `/#/admin` | AdminDashboard | POS chính (bảo vệ bởi authToken) |
| `/#/kiosk` | CustomerKiosk | Kiosk tự phục vụ |
| `/#/order` | Menu | Đặt món qua QR phone |
| `/#/bill` | BillView | Thanh toán |
| `/#/kitchen` | KitchenDashboard | Màn hình bếp |
| `/#/attendance` | AttendanceView | Chấm công |
| `/#/staff-qr` | StaffQrKiosk | QR chấm công |
| `/#/customer-qr` | CustomerQrKiosk | QR đặt món |

### Luồng đặt đơn từ Kiosk
```
CustomerKiosk → chọn món → giỏ hàng → submitOrder()
  → POST /api/order { cartItems, customerName, price, ... }
  → Server: tạo order với ID = {TTTT}{DD}{MM}{YY}, lưu orders.json
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
  → Menu.jsx: lưu token vào localStorage
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

### Saving Data (server.cjs)
```javascript
// saveData() ghi đồng thời TẤT CẢ file JSON một lúc
// Gọi sau mọi thao tác thay đổi dữ liệu
// shifts.json dùng saveShifts() riêng
// ratings.json dùng saveRatings() riêng
```

### Design Pattern
- **AdminDashboard.jsx** = một file khổng lồ (~517KB) chứa TẤT CẢ module con: sub-components, modal, state management
- Các sub-component (ConfirmDialog, TableModal, InventoryModal...) được khai báo inline trong cùng file
- Pattern: `useState` draft → submit → call API → refresh state
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

### settings.json — Các field quan trọng
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
  featuredPromoImage, featuredPromoTitle, featuredPromoCTA
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
   - Mọi file JSON phải nằm trong `DATA_DIR` (được truyền qua `process.env.DATA_PATH`)
   - KHÔNG hardcode `path.join(__dirname, 'data')`; dùng biến `DATA_DIR` trong server.cjs

3. **KHÔNG dùng `window.location.href` để navigate trong React**
   - Dùng `useNavigate()` từ react-router-dom hoặc `window.location.hash = '#/route'`
   - App dùng HashRouter, mọi route bắt đầu bằng `#/`

4. **KHÔNG gọi `saveData()` từ shifts/ratings**
   - Ca làm: dùng `saveShifts()`
   - Đánh giá: dùng `saveRatings()`
   - `saveData()` không biết về shifts/ratings

5. **KHÔNG thêm API mới mà không kiểm tra RBAC middleware**
   - Mọi route sau middleware auth đều bị kiểm tra token
   - Public routes phải được khai báo tường minh trong middleware (dòng ~246-258 server.cjs)

6. **KHÔNG sửa Order ID sau khi server đã gán**
   - Server LUÔN ghi đè ID theo format `{TTTT}{DD}{MM}{YY}`
   - Client-generated ID (dạng `Date.now()`) chỉ là temp, server bỏ qua

7. **KHÔNG thêm component mới vào file riêng nếu nó chỉ dùng trong AdminDashboard**
   - Theo pattern hiện tại, sub-components của AdminDashboard được khai báo inline
   - Nếu cần file riêng, chỉ dành cho components dùng ở nhiều nơi

### ⚠️ Lỗi thường gặp

1. **Inventory deduction chỉ xảy ra khi `status → COMPLETED`**
   - Đơn PAID chưa trừ kho; chỉ khi `POST /api/orders/complete/:id` mới trừ
   - Khi sửa order đã PAID: bỏ qua inventory check (đã trừ rồi)

2. **`loadData()` chạy lại mỗi khi server restart, auto-fix order IDs**
   - Không can thiệp vào logic auto-fix ID trong `loadData()`, nó chuẩn hóa toàn bộ ID mỗi ngày
   - `nextQueueNumber` được tính từ số lượng orders + logs hiện tại của ngày

3. **Cloudflare Tunnel URL được dùng cho QR order link**
   - Nếu tunnel đang chạy, QR sẽ dùng URL tunnel thay vì IP LAN
   - URL format: `{tunnelUrl}/?action=order&token={TOKEN}`
   - Không dùng port 5173 cho LAN QR — luôn dùng port 3001

4. **TTS (Text-to-Speech) cần audio unlock trước**
   - `CustomerKiosk` có splash screen "BẮT ĐẦU SỬ DỤNG" để unlock audio
   - `speakTTS()` kiểm tra cả `settings.ttsEnabled` và `ttsSettings.enabled` (localStorage)

5. **`posCheckoutSession` là in-memory, không persist**
   - Nếu server restart khi đang checkout → session mất, phải bắt đầu lại

6. **Giá trong CartItem là `totalPrice` PER ITEM (không nhân count)**
   - Tổng tiền = `cartItems.reduce((s, c) => s + c.totalPrice * c.count, 0)`
   - VD: `totalPrice: 21, count: 3` → đóng góp 63k cho tổng

### 🔒 Rule bất biến

| Rule | Lý do |
|------|-------|
| Luôn dùng `SERVER_URL` từ `src/api.js` cho mọi call API | Tự động resolve đúng URL theo môi trường |
| `hashPassword()` dùng PBKDF2, **không** dùng btoa/MD5 | Security |
| Luôn kiểm tra `fs.existsSync()` trước khi đọc file JSON | File có thể chưa tồn tại khi mới setup |
| Gọi `saveData()` sau MỌI thao tác thay đổi data | Không để data chỉ tồn tại trong memory |
| Không xóa cứng (hard delete) menu item lần đầu — dùng `isDeleted: true` | Soft delete trước, hard delete lần 2 |
| Import tạo ingredient mới nếu chưa có trong inventory | Match theo tên (case-insensitive) |
| `usageHistory` của ingredient phải là object `{dateStr: qty}`, **không** array | Bug cũ đã fix, nếu là array phải convert |
| Không sửa file `data/.env` — chỉ là backup text thủ công | Không phải biến môi trường thực |
| **BO GÓC (ROUNDED):** Chỉ dành cho Avatar hoặc các nút bấm đặc biệt. Layout chính, Bảng biểu, và Tooltip phải luôn vuông vức. | Quy tắc thẩm mỹ |
| **TIÊU CHUẨN CHỮ:** "Chữ thường" nghĩa là Font Weight bình thường (không in đậm vô tội vạ). Tiêu đề chính phải **IN HOA, TO RÕ (Size 24px)** để dễ thao tác trên iPad. | iPad Usability |

---

## 8. Sơ đồ tương tác giữa các module chính

```
main.cjs (Electron)
  │── spawn → server.cjs (Express :3001)
  │                │── Database: SQLite (cafe.db)
  │                │── mode: WAL (Write-Ahead Logging) cho concurrency
  │                └── Cloudflare Tunnel (subprocess)
  │
  └── BrowserWindow(s)
        ├── Admin (#/admin) → AdminDashboard.jsx
        │     ├── poll GET /api/orders (active orders)
        │     ├── poll GET /api/qr-info (QR + tunnel status)
        │     ├── POST /api/orders/complete (hoàn thành)
        │     ├── POST /api/pos/checkout/start (hiện QR payment trên kiosk)
        │     └── IPC toggle-kiosk → mở/đóng Kiosk window
        │
        └── Kiosk (#/kiosk) → CustomerKiosk.jsx
              ├── poll GET /api/qr-info (1s) → hiện QR đặt món / thanh toán
              ├── poll GET /api/order/status/queue (3s) → pending orders
              ├── poll GET /api/notifications/completed (5s) → TTS
              └── POST /api/order (submit order)

Mobile (QR scan) → http://LAN_IP:3001/?action=order&token=XXX
  → server.cjs serve dist/index.html
  → React load, main.jsx URL interceptor → #/order?token=XXX
  → Menu.jsx: check token, cho đặt món
  → POST /api/order → server validate token → tạo order
```

---

## 9. Các tính năng đã thêm gần đây (Tham khảo khi viết code liên quan)

### 9.1 Master Ledger (Sổ Hóa Đơn Chi Tiết)
- **File:** `AdminDashboard.jsx` — Tab Báo Cáo
- **Vị trí:** Bảng phía dưới cùng của trang Báo Cáo
- **10 cột:** STT (Mã Đơn), Giờ Xong, Chi Tiết Món (Bill), Nền Tảng, Tổng Bill, Khuyến Mãi/Phí Sàn, Thực Nhận, Chi Phí (COGS), Lợi Nhuận Gộp, Ghi Chú
- **COGS tính động:** Tra cứu recipe của mỗi `cartItem` → nhân với `avgCost` từ `inventoryStats`
- **Lọc:** Tuân theo bộ lọc thời gian (`reportPeriod`) hiện tại của trang Báo Cáo
- **Đơn hủy:** Show đỏ nhạt, chỉ hiện Ghi Chú "Hủy: {reason}", các cột tài chính = 0

### 9.2 Xuất EXCEL/CSV — Master Ledger
- **Hàm:** `exportToCSV()` trong `AdminDashboard.jsx` (dòng ~3817)
- **Cột xuất:** Khớp 100% với Master Ledger trên màn hình (11 cột bao gồm cả COGS)
- **Encoding:** UTF-8 BOM (`\uFEFF`) — đọc đúng Tiếng Việt trong Microsoft Excel
- **Giá:** Nhân x1000 khi xuất CSV (trả về VND thực, không phải đơn vị nghìn)
- **Lọc:** Xuất dữ liệu đang hiển thị theo bộ lọc thời gian hiện tại
- **Tên file:** `Master_Ledger_{period}_{date}.csv`

### 9.3 Sửa lỗi Giá Legacy (Critical Bug Fix)
- **Vấn đề:** Một lỗi cũ đã ghi nhầm giá dạng float `1.431` thay vì `1431` vào DB
  - Khi `formatVND(1.431)` chạy: `1.431 * 1000 = 1431` → hiển thị `1.431 đ` (sai nghiêm trọng)
- **Giải pháp:** Modal Order Details KHÔNG dùng `selectedLog.price` để hiển thị tổng tiền
  - Thay bằng: tính lại từ `orderData.cartItems` → `reduce((acc, c) => acc + parseFloat(c.totalPrice) * c.count, 0) - discount`
  - Áp dụng cả ở UI Modal lẫn HTML in bill
- **Lưu ý:** Các đơn mới không bị lỗi này vì đã được fix từ trước. Logic trên là để tương thích ngược

### 9.4 Hotkey Chuyển Tab Nền Tảng (POS Order Screen)
- **Phím `+` trên numpad:** Chuyển tuần tự qua các tab: INSTORE → GRAB → SHOPEE → INSTORE
- **Phím `0` `0` (nhập hai số 0):** Mở modal xác nhận hoàn tất đơn
  - Modal tự focus để Enter hoạt động ngay lập tức (không delay 500ms)
  - Trước đây phải click vào modal mới dùng Enter được

### 9.5 Báo Cáo Doanh Thu Đa Nền Tảng (Delivery Apps)
- Bảng phân tích riêng cho Grab/Shopee trong Tab Báo Cáo
- Tự động tính: Gross, Phí sàn (%), Thực nhận, COGS, Lợi nhuận gộp
- Phí sàn mỗi nền tảng được cấu hình trong Settings (`deliveryAppsConfigs.{GRAB|SHOPEE}.fee`)
- Giá menu tự động markup khi chọn tab Grab/Shopee để bù phí sàn (công thức: `1 / (1 - feePercent/100)`)

### 9.6 Phím Tắt Tìm Kiếm Shortcut theo CODE
- Menu item và Shortcut có thể được gán `shortcutCode` ngắn (VD: `CFM` cho Cà Phê Muối)
- Tìm kiếm bằng code cho kết quả khớp ngay cả khi không gõ tên đầy đủ

### 9.7 Hệ thống Quản lý Giờ làm & Chấm công Khắt khe
- **Nguyên lý:** Khóa chặt chức năng tự do chấm công lúc nào chả được của trước đây. Nhân viên chỉ được `clockIn` vào một Ca làm (Schedule) cố định dựa trên thời gian thực.
- **Dung sai:** `±30 phút` so với thời gian bắt đầu Ca (nếu đi sớm hơn/hoặc trễ hơn đều sẽ văng 403 Forbidden).
- **Auto-Clockout:** `server.cjs` tự chạy một background process quét mỗi 1 phút thông qua `autoClockoutEndedShifts`. Bất kỳ Shift nào trễ quá 30 phút so với giờ End của Schedule thì đều bị hệ thống can thiệp, dập tắt ca làm, tự gút sổ tiền lương và cắt đứt thời gian ăn gian.
- **Skip Validation Mode:** Các lệnh "VÀO CA / CHẤM CÔNG" thủ công từ UI Bảng Táp lô Admin sẽ tự động bỏ qua check Security Token (Do Admin bấm) thông qua biến `token: 'ADMIN_BYPASS'`.

### 9.8 Biểu đồ Ca làm (Gantt Chart Interactive)
- **Vị trí:** `AdminDashboard.jsx` (Staff Report Modal)
- **Hiển thị màu sắc nội suy:** Lấy `scheduleId` của mỗi `Shift` trong Báo cáo giờ làm để tìm kiếm thông tin gốc trên bảng `schedules.json`, kéo giá trị color về nhuộm nền thay vì dùng màu fixed.
- **Scroll Layering:** Layout được thiết kế lại thành `flex-col`, Modal có Body scroll và Bottom Sticky riêng biệt nhằm tránh lỗi overflow che input Số điện thoại của Nhân sự.

### 9.9 Hệ thống Báo Cáo Thuế Định Kỳ
- **Vị trí:** `AdminDashboard.jsx` (Dưới cùng Tab Báo Cáo)
- **Nguyên lý Độc lập Cột mốc:** Khác với Master Ledger (dựa trên bộ lọc ngày hiện tại), Báo Cáo Thuế lấy toàn bộ dữ liệu lịch sử từ `report.logs` để đảm bảo chu kỳ tính thuế chính xác tuyệt đối.
- **Tab linh hoạt:** Bổ sung các dải nút bấm (Tháng / Quý / Năm) trên header của bảng. Code tự động gom nhóm (Group By) doanh thu tĩnh theo chuẩn thời gian đã chọn, không bị báo cáo sai do thao tác đổi ngày của người dùng.
- **Tuân thủ quy chuẩn Thuế 2026:** Tính năng Xuất CSV (Bảng Kê Hóa Đơn) sử dụng vòng lặp bóc tách chi tiết từng `cartItem` trong từng `log.orderData`. Bản xuất ra Excel không ghi gộp 1 dòng mà đổ ra danh sách đầy đủ Bằng Chứng Giao Dịch: Ngày Giờ, Mã Đơn, Tên Món, Số Lượng, Tiền Thuế GTGT được phân bổ tỷ lệ theo từng món... đáp ứng yêu cầu thanh tra thuế điện tử.

---

### 9.10 Hệ thống Tự động Cập nhật (Auto-Update)
- **Cơ chế chính:** Dựa trên GitHub Releases (`mvcthinhofficial/order-cafe`) làm nơi lưu trữ bản cài đặt và gói cập nhật.
- **Desktop (Electron):** Sử dụng `electron-updater`. Logic kiểm tra và cài đặt nằm trong `main.cjs`. Người dùng nhận thông báo qua banner xanh tại Admin Dashboard.
- **Linux Server:**
    - API `/api/system/version`: Trả về version hiện tại từ `package.json`.
    - API `/api/system/update`: Tự động tải file `.tar.gz` từ GitHub, giải nén đè lên code cũ và gọi `pm2 restart` để cập nhật server.
- **Quy trình đóng gói (`release.sh`):**
    1. Chạy `npm run electron:build` để tạo bản cài Desktop.
    2. Tạo file `order-cafe-v{version}.tar.gz` chứa mã nguồn server.
    3. User upload thủ công các file này lên GitHub Release hoặc qua CI/CD.
- **UI Thông báo:** Banner xanh hiển thị ở Header của AdminDashboard khi `latestVersion` (từ GitHub) khác với phiên bản cục bộ.

---

### 9.11 Hệ thống Cơ Sở Dữ Liệu SQLite & Indexing
- **Cơ chế chính:** Thay thế toàn bộ lưu trữ file JSON cũ thành hệ quản trị cơ sở dữ liệu tốc độ cao `better-sqlite3`.
- **Auto Migration:** Hệ thống tự động phát hiện JSON cũ ở `data/`, tiến hành 1 chiều đưa vào `cafe.db` trong lần khởi động server. Cất giữ JSON file vào `archived_migration/`.
- **Tối ưu Hóa Indexing:** Hệ thống được áp dụng Custom Indexes (`timestamp`, `orderId`) chặn rớt frame do Full Table Scan trên các bảng lớn (orders, report_logs, inventory_audits), đáp ứng hàng triệu records.
- **Transactions an toàn:** Ngăn chặn xung đột xử lý song song nhờ chế độ `WAL (Write-Ahead-Logging)`, bảo vệ dữ liệu toàn vẹn tuyệt đối.

### 9.12 Chuẩn hóa Thời gian Đồng bộ (TimeUtils)
- **Quy tắc Tối Cổ Tức:** KHÔNG ĐƯỢC PHÉP dùng tự do `Date.now()`, `new Date()` hay `toLocaleString()` rải rác trong component hoặc server khi KHỞI TẠO hoặc LƯU dữ liệu mang ý nghĩa thời gian thực tế. (Chỉ cho phép dùng `Date.now()` để random mã ID nối chuỗi).
- **Backend (`server.cjs`):** Bắt buộc chỉ gọi `getCurrentISOString()` cho các thuộc tính `timestamp`, `createdAt`, `editedAt`, `clockIn`, `clockOut`. Bắt buộc gọi `parseDate(ts).toISOString()` khi format thời gian bên ngoài gửi lên.
- **Frontend (`*.jsx`):** Bắt buộc dùng `formatDateTime(ts)`, `formatDate(ts)`, `formatTime(ts)` lấy từ `src/utils/timeUtils.js` để hiển thị trên UI. Cơ chế `parseDate` nội bộ của bộ core này sẽ bao bọc bẻ gãy mọi lỗi định dạng.
- **Tại sao:** Dữ liệu cũ bị lẫn lộn giữa chuỗi số (`'177...'`) và số nguyên khiến `new Date(ts)` gây crash Server (`Invalid time value`).

---

*Cập nhật lần cuối: 29/03/2026 — Tiêu chuẩn hóa TimeUtils (ESM/CJS).*
