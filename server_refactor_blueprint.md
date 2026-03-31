# 🏗️ Blueprint: Refactor `server.cjs` → Feature-Based Module Architecture

> **Mục tiêu:** Tách file `server.cjs` (4324 dòng, ~175KB) thành kiến trúc Module/Feature-based an toàn,  
> không thay đổi bất kỳ logic nghiệp vụ hay hành vi runtime nào hiện tại.  
> **Chuẩn:** CommonJS (`require`/`module.exports`) — **KHÔNG chuyển sang ESM.**

---

## 1. Phân tích State — Biến Global Hiện Tại

Đây là **rủi ro lớn nhất** của toàn bộ cuộc refactor. Tất cả biến sau đang được khai báo tại scope module-top-level của `server.cjs` và bị **mutate trực tiếp** bởi hàng chục route handler khác nhau:

### 1.1 — Bảng kiểm kê biến Global

| Biến | Loại | Được mutate bởi | Rủi ro nếu tách |
|------|------|-----------------|-----------------|
| `menu` | `Array` | `loadData`, POST/PUT/DELETE `/api/menu` | ⚠️ Cao — `checkCartInventory`, `handleInventoryForOrder` cùng đọc |
| `orders` | `Array` | `loadData`, POST `/api/order`, complete, cancel | 🔴 Rất cao — Đa luồng ghi đồng thời |
| `inventory` | `Array` | `loadData`, `handleInventoryForOrder`, audit, save | 🔴 Rất cao — Là nút trung tâm nghiệp vụ |
| `settings` | `Object` | `loadData`, `saveData`, POST `/api/settings` | ⚠️ Cao — Tunnel, Auth đều đọc settings |
| `activeTokens` | `Map` | Login, Logout, RBAC middleware | ⚠️ Cao — Middleware auth đọc mỗi request |
| `staff` | `Array` | `loadData`, POST/DELETE `/api/staff` | Trung bình |
| `roles` | `Array` | `loadData`, `getRolePermissions` | Trung bình |
| `shifts` | `Array` | `loadData`, clockin/clockout, `saveShifts()` | Trung bình |
| `reports` | `Object` | `loadData`, `saveData`, `/api/report` | Trung bình |
| `tables` | `Array` | `loadData`, `/api/tables` | Thấp |
| `promotions` | `Array` | `loadData`, `/api/promotions` | Thấp |
| `expenses` | `Array` | `loadData`, `/api/expenses` | Thấp |
| `imports` | `Array` | `loadData`, `/api/imports` | Thấp |
| `inventory_audits` | `Array` | `loadData`, `handleInventoryForOrder` | Trung bình |
| `schedules` | `Array` | `loadData`, `/api/schedules` | Thấp |
| `disciplinary_logs` | `Array` | `loadData`, `/api/disciplinary` | Thấp |
| `nextQueueNumber` | `number` | `loadData`, `reports.nextQueueNumber` | Cao — quyết định số thứ tự POS |
| `completedNotifications` | `Array` | POST order complete, dismiss | Thấp |
| `kitchenPrintQueue` | `Array` | POST `/api/print/kitchen`, GET/POST `/api/print/queue` | Thấp |
| `tunnelProcess` / `tunnelStatus` | `Process`/`Object` | `startTunnel`, `stopTunnel` | Trung bình |

### 1.2 — Giải pháp: Tạo `MemoryStore` Trung Tâm

**Nguyên tắc quan trọng nhất:** Tất cả biến trên phải được đóng gói vào **một object duy nhất** được `require` xuyên suốt mọi module. Nhờ cơ chế **Module Cache** của Node.js (`require()` trả về cùng một object instance), mọi mutation đều được chia sẻ tự động.

```javascript
// server/store/memoryStore.cjs  <-- File cần tạo ĐẦU TIÊN

const store = {
    menu: [],
    orders: [],
    inventory: [],
    settings: { /* default settings object */ },
    activeTokens: new Map(),
    staff: [],
    roles: [],
    shifts: [],
    reports: { totalSales: 0, ... },
    tables: [],
    promotions: [],
    expenses: [],
    imports: [],
    inventory_audits: [],
    schedules: [],
    disciplinary_logs: [],
    nextQueueNumber: 1,
    customerIdCounter: 1,
    lastResetDate: null,
    completedNotifications: [],
    kitchenPrintQueue: [],
    tunnelProcess: null,
    tunnelStatus: { active: false, log: '', lastStarted: null, url: null }
};

module.exports = store;
```

> **Lưu ý quan trọng:** Các route/service sẽ **không khai báo lại biến local**, mà trực tiếp mutate `store.menu.push(...)`, `store.orders = ...`, v.v. Tuyệt đối không được `const { menu } = require('./store')` vì sẽ bị mất reference khi reassign.

---

## 2. Kiến Trúc Thư Mục Mới (Sau Refactor)

```
Order Cafe/
├── server.cjs                  ← Entry point (giảm xuống ~80 dòng)
├── db.cjs
├── migration.cjs
│
└── server/
    ├── store/
    │   └── memoryStore.cjs     ← Tất cả biến global state tập trung ở đây
    │
    ├── core/
    │   ├── logger.cjs          ← Hàm log(), console.log override
    │   ├── dataLoader.cjs      ← loadData() + saveData() + normalizeInventoryIds()
    │   └── saveShifts.cjs      ← saveShifts() (tách do dùng chung ở nhiều nơi)
    │
    ├── middleware/
    │   ├── rbac.cjs            ← Middleware auth + RBAC (app.use('/api', ...))
    │   ├── accessLogger.cjs    ← Global access logging middleware
    │   └── helpers.cjs         ← isLocal(), isRemote(), hashPassword(), verifyPassword()
    │
    ├── services/
    │   ├── tunnelService.cjs   ← startTunnel(), stopTunnel(), tunnelStatus
    │   ├── inventoryService.cjs ← checkCartInventory(), handleInventoryForOrder(), getInternalAvgCosts()
    │   ├── orderService.cjs    ← calculateOrderMetrics(), saveReportLogToDB()
    │   └── authService.cjs     ← getRolePermissions(), getLANIP(), rotateAttendanceToken()
    │
    └── routes/
        ├── backup.routes.cjs       ← /api/admin/backups (cần đặt trước RBAC!)
        ├── auth.routes.cjs         ← /api/auth/*
        ├── menu.routes.cjs         ← /api/menu
        ├── orders.routes.cjs       ← /api/order, /api/orders/*
        ├── inventory.routes.cjs    ← /api/inventory/*, /api/imports/*
        ├── print.routes.cjs        ← /api/print/*
        ├── report.routes.cjs       ← /api/report
        ├── settings.routes.cjs     ← /api/settings, /api/system/*
        ├── tables.routes.cjs       ← /api/tables
        ├── staff.routes.cjs        ← /api/staff, /api/roles
        ├── shifts.routes.cjs       ← /api/shifts, /api/attendance/*
        ├── schedules.routes.cjs    ← /api/schedules
        ├── promotions.routes.cjs   ← /api/promotions
        ├── expenses.routes.cjs     ← /api/expenses
        ├── ratings.routes.cjs      ← /api/ratings
        ├── kiosk.routes.cjs        ← /api/kiosk/*, /api/qr-token/*, /api/qr-info
        └── static.routes.cjs       ← SPA fallback, /dist, /data/* static
```

### `server.cjs` sau khi refactor (Entry Point tối giản):

```javascript
// server.cjs — Entry Point (sau refactor)
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db.cjs');
const migrate = require('./migration.cjs');
const store = require('./server/store/memoryStore.cjs');
const { log } = require('./server/core/logger.cjs');
const { loadData } = require('./server/core/dataLoader.cjs');
const { startTunnel } = require('./server/services/tunnelService.cjs');

const app = express();
const port = process.env.PORT || 3001;

// Middleware cơ bản
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Khởi tạo dữ liệu
migrate();
loadData();

// Routes (theo thứ tự ưu tiên)
app.use(require('./server/routes/backup.routes.cjs'));  // PHẢI ĐỨng TRƯỚC rbac!
app.use(require('./server/middleware/rbac.cjs'));
app.use(require('./server/routes/auth.routes.cjs'));
app.use(require('./server/routes/menu.routes.cjs'));
// ... còn lại

app.listen(port, () => {
    if (store.settings.cfEnabled) startTunnel();
});
```

---

## 3. Lộ Trình Thực Thi 5 Bước (Step-By-Step)

> **Quy tắc vàng:** Sau mỗi bước → Chạy `node server.cjs` → Test tối thiểu 3 endpoint → Chỉ làm bước tiếp khi không có lỗi.

---

### **BƯỚC 1: Tạo MemoryStore — Nền móng của mọi thứ**
**Rủi ro:** Thấp — Chỉ tạo file mới, chưa thay đổi `server.cjs`

1. Tạo thư mục `server/store/`
2. Tạo `server/store/memoryStore.cjs` với toàn bộ biến global copy từ `server.cjs` (lines 48–102)
3. **Chưa import vào `server.cjs`** — chỉ tạo file
4. Tạo `server/core/logger.cjs` — copy hàm `log()`, override `console.log`
5. **Test:** `node -e "const s = require('./server/store/memoryStore.cjs'); console.log(Object.keys(s))"`

---

### **BƯỚC 2: Tách Core Infrastructure — `dataLoader`, `saveData`, `tunnelService`**
**Rủi ro:** 🔴 Cao — `loadData()` và `saveData()` đọc/ghi TẤT CẢ biến global

1. Tạo `server/core/dataLoader.cjs`:
   - Import `store` từ memoryStore
   - Copy toàn bộ `loadData()` — **thay tất cả `menu = ...` thành `store.menu = ...`**
   - Copy toàn bộ `saveData()` — **thay tất cả `menu` thành `store.menu`**, v.v.
2. Tạo `server/services/tunnelService.cjs` — copy `startTunnel()`, `stopTunnel()`
3. Trong `server.cjs`: thay khai báo biến global bằng `const store = require('./server/store/memoryStore.cjs')`, xóa các khai báo `let menu = []` v.v., thêm `const { loadData, saveData } = require('./server/core/dataLoader.cjs')`
4. **Test:** Khởi động server → GET `/api/menu` → GET `/api/settings` → GET `/api/orders` → Phải trả đúng dữ liệu

---

### **BƯỚC 3: Tách Middleware & Auth Services**
**Rủi ro:** ⚠️ Trung bình — Middleware RBAC phải giữ đúng thứ tự mount

1. Tạo `server/middleware/helpers.cjs` — copy `isLocal()`, `isRemote()`, `hashPassword()`, `verifyPassword()`
2. Tạo `server/middleware/rbac.cjs` — copy middleware `app.use('/api', ...)` (lines 496–558)
   - Đây phải là `express.Router()` mounting với `module.exports = router`
   - **Lưu ý quan trọng:** Middleware này đọc `store.activeTokens` và `store.staff`
3. Tạo `server/services/authService.cjs` — copy `getRolePermissions()`, `getLANIP()`, `rotateAttendanceToken()`
4. Tạo `server/routes/auth.routes.cjs` — copy tất cả `/api/auth/*` và `/api/staff/public`
5. Tạo `server/routes/backup.routes.cjs` — copy `/api/admin/backups*` (**mount TRƯỚC rbac trong `server.cjs`!**)
6. **Test:** Đăng nhập qua POST `/api/auth/login` → GET `/api/auth/me` → Đăng xuất

---

### **BƯỚC 4: Tách Business Logic Routes (Feature-by-Feature)**
**Rủi ro:** ⚠️ Cao — Phải tách từng feature không làm gãy reference đến `store`

Thực hiện từng feature một, **theo thứ tự từ ít dependency nhất**:

1. **`tables.routes.cjs`** — Đơn giản nhất, chỉ đọc/ghi `store.tables`
2. **`promotions.routes.cjs`**, **`expenses.routes.cjs`** — Ít dependency
3. **`menu.routes.cjs`** — Đọc `store.menu`, `store.inventory`; cần import `inventoryService`
4. **`inventory.routes.cjs`** — Phức tạp, cần `handleInventoryForOrder`, `checkCartInventory`, `getInternalAvgCosts`
5. **`orders.routes.cjs`** — **PHỨC TẠP NHẤT**: cần `inventoryService`, `orderService`, `saveReportLogToDB`
6. **`staff.routes.cjs`**, **`shifts.routes.cjs`**, **`schedules.routes.cjs`**
7. **`report.routes.cjs`**, **`settings.routes.cjs`**, **`kiosk.routes.cjs`**, **`print.routes.cjs`**
8. **`static.routes.cjs`** — SPA fallback, mount CUỐI CÙNG

Sau mỗi feature route: Test endpoint tương ứng trước khi sang feature tiếp theo.

---

### **BƯỚC 5: Dọn Dẹp Entry Point & Verification**
**Rủi ro:** Thấp — Chỉ xóa code đã được chuyển đi

1. Xóa toàn bộ code đã tách ra khỏi `server.cjs` entry point
2. `server.cjs` chỉ còn: `require`, `app = express()`, mount middleware/routes, `app.listen()`
3. Chạy full smoke test:
   - `node server.cjs` — Không có lỗi startup
   - GET `/api/menu`, `/api/orders`, `/api/inventory`
   - POST `/api/auth/login` → POST `/api/order` → POST `/api/orders/complete/:id`
   - Kiểm tra backup/restore
   - Kiểm tra Cloudflare Tunnel (nếu có token)
4. Commit bằng `git commit -m "refactor: server modularization complete"`

---

## 4. Đánh Giá Rủi Ro Chi Tiết

### 🔴 Rủi ro NGUY HIỂM NHẤT

#### `loadData()` + `saveData()` — Lines 596–987
- **Vấn đề:** Hàm `loadData` dùng **reassign trực tiếp** (`menu = db.prepare(...).all()`) — nếu tách file mà không dùng `store.menu = ...` thì dữ liệu sẽ **KHÔNG bao giờ cập nhật** vào store shared.
- **Nguyên tắc xử lý:** Tuyệt đối không bao giờ `const { menu } = store` trong route handlers — phải luôn `store.menu`.

#### `handleInventoryForOrder()` — Lines 1449–1541
- **Vấn đề:** Hàm này vừa đọc `inventory`, vừa mutate `inventory[idx].stock`, vừa push vào `inventory_audits`. Nếu import sai sẽ dẫn đến **inventory không bị trừ** khi order được tạo.
- **Nguyên tắc:** Hàm này phải luôn nhận tham chiếu `store` chứ không phải copy giá trị.

#### `activeTokens` (Map) — Lines 316, 529
- **Vấn đề:** Map này được khai báo ở backup route (line 169 dùng `activeTokens.get(token)`) TRƯỚC KHI middleware RBAC được khai báo (line 316). Sau khi tách, nếu import sai thứ tự có thể tạo ra 2 instance Map khác nhau → Token luôn báo invalid.
- **Giải pháp:** `activeTokens` phải là `store.activeTokens` từ ngay bước 1.

### ⚠️ Rủi ro TRUNG BÌNH

#### Cloudflare Tunnel (`startTunnel`/`stopTunnel`) — Lines 994–1134
- **Vấn đề:** `tunnelProcess` là một tiến trình con (child process) không được serialize. Nếu tách module và có 2 biến `tunnelProcess` do lỗi import thì Tunnel sẽ bị leak không tắt được.
- **Giải pháp:** `tunnelProcess` phải là `store.tunnelProcess` trong `tunnelService.cjs`.

#### Backup/Restore với `db.close()` + `db.reconnect()` — Lines 242–248
- **Vấn đề:** Thứ tự mount của `backup.routes.cjs` **PHẢI đứng trước** middleware RBAC trong `server.cjs`. Nếu đặt sau RBAC sẽ bị block bởi token check → không restore được sau khi token mất.
- **Giải pháp:** Ghi chú rõ ràng trong `server.cjs` — backup route luôn mount đầu tiên.

#### Auto Clock-out (`autoClockoutOldShifts`) — Lines 4287–4305
- **Vấn đề:** Hàm này gọi `saveShifts()` một hàm không phải `saveData()` đầy đủ. Tiềm ẩn rủi ro nếu tách module mà `shifts` array bị đứt reference.
- **Giải pháp:** Tạo `server/core/saveShifts.cjs` riêng, import `store.shifts` và `db`.

#### Double `loadData()` call — Lines 106 & 594
- **Vấn đề hiện tại:** `loadData()` đang được gọi **2 lần** (line 106 và 594). Sau refactor chỉ nên gọi 1 lần.
- **Đề xuất:** Xóa lần gọi thứ 2 tại line 594 khi refactor.

### 🟡 Rủi ro THẤP

#### Route đăng ký trùng `/api/orders/cancel/:id` — Lines 2003 & 2205
- Hiện tại có 2 handler cho cùng route — cái sau có thể shadow cái trước. Cần kiểm tra sau refactor.

#### Biến `permissions` chưa khai báo — Line 453
- `activeTokens.set(token, { role: 'ADMIN', ..., permissions, roleName })` nhưng `permissions` không được khai báo trong scope hàm recovery code login. Đây là bug tiềm ẩn hiện có, cần fix trong bước auth routes.

---

## 5. Tổng Kết Thứ Tự Ưu Tiên

```
Priority 1 (Nền móng):    memoryStore.cjs → logger.cjs → dataLoader.cjs
Priority 2 (Bảo mật):     helpers.cjs → rbac.cjs → authService.cjs → auth.routes.cjs
Priority 3 (Business):    inventoryService.cjs → orderService.cjs → menu/order/inventory routes
Priority 4 (Feature):     Các routes còn lại (tables, staff, shifts, kiosk, print, v.v.)
Priority 5 (Hoàn thiện):  Dọn dẹp server.cjs → Smoke Test → Commit
```

> **Khuyến nghị thực tế:** Làm từng bước nhỏ, mỗi lần chỉ tách 1 file mới. Đừng làm nhiều file cùng lúc vì rất khó debug khi có lỗi. Mỗi `require` mới trong `server.cjs` phải được kiểm tra ngay bằng cách khởi động server và gọi ít nhất 2 endpoint.
