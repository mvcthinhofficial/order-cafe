---
name: electron-packaging
description: Hướng dẫn và checklist để đóng gói Electron app (Mac/Win) cho Order Cafe POS đúng cách, tránh lặp lại các lỗi đã xảy ra từ v2.0.18–v2.0.21.
---

# Electron Packaging — Order Cafe POS

## Bối cảnh

Order Cafe POS dùng kiến trúc **Electron + Express backend**. Backend (`server.cjs`) chạy
trực tiếp trong Electron main process. Frontend React load từ `dist/index.html` qua `file://`.

---

## ❌ Các lỗi đã xảy ra (v2.0.18–v2.0.21) — KHÔNG LẶP LẠI

### Lỗi 1: `spawn(electronBinary, ELECTRON_RUN_AS_NODE=1)` không hoạt động

**Triệu chứng:** "Lỗi kết nối máy chủ" trên bản packaged Mac/Win. Dev mode (`electron:dev`) hoạt động bình thường.

**Root cause:** Khi spawn Electron binary với `ELECTRON_RUN_AS_NODE=1` để chạy `server.cjs`:
- Nếu `electron:dev` đang chạy song song → port 3001 bị chiếm → `EADDRINUSE` fail silently
- Child process có asar path resolution khác main process → native module `dlopen()` bất ổn
- Lỗi crash silently, không có error dialog → user không biết lý do

**Fix đúng:** Dùng `require('./server.cjs')` TRỰC TIẾP trong Electron main process (production mode).

```js
// main.cjs — startBackend()
if (isDev) {
    // Dev: spawn để hỗ trợ hot reload
    serverProcess = spawn('node', [serverScript], { env: {...process.env, DATA_PATH: dataPath} });
} else {
    // Production: require trực tiếp — KHÔNG dùng ELECTRON_RUN_AS_NODE=1 spawn
    process.env.DATA_PATH = dataPath;
    try {
        require('./server.cjs');
    } catch (err) {
        dialog.showErrorBox('Lỗi khởi động máy chủ nội bộ', 
            `Không thể khởi động backend server.\n\nLỗi: ${err.message}\n\nVui lòng chụp màn hình và liên hệ hỗ trợ.`);
    }
}
```

---

### Lỗi 2: Thiếu file local trong `package.json "files"` — Cannot find module

**Triệu chứng:** Error dialog hiện "Cannot find module './routes/paymentWebhook.cjs'" sau khi cài bản packaged.

**Root cause:** `package.json > build > files` kiểm soát file nào được đưa vào `.asar`. Nếu thiếu thư mục, `require()` sẽ crash khi packaged dù dev mode hoạt động bình thường.

**Công thức:** Phải map TOÀN BỘ `require()` trong `server.cjs` sang thư mục tương ứng trong `files`.

```json
"files": [
  "dist/**/*",
  "main.cjs",
  "server.cjs",
  "db.cjs",
  "migration.cjs",
  "package.json",
  "routes/**/*",        ← require('./routes/paymentWebhook.cjs')
  "server/**/*",        ← require('./server/routes/authRoutes.cjs')
  "src/utils/**/*"      ← require('./src/utils/timeUtils.cjs')
]
```

**Checklist khi thêm route/module mới vào `server.cjs`:**
```
grep -n "^require\|^const.*= require" server.cjs | grep "\.\/"
```
→ Mỗi `./path/` phải có glob pattern tương ứng trong `"files"`.

---

### Lỗi 3: CI dùng Node 20 nhưng Electron 40 cần Node 22 (ABI mismatch)

**Triệu chứng:** Bản build từ CI crash (server không start), bản build local hoạt động.

**Root cause:** 
- CI cũ: `node-version: 20` → Node ABI **115**
- Electron 40 built-in Node: v22 → ABI **127**
- `better-sqlite3` compiled với ABI 115 → crash khi Electron load với ABI 127

**Fix trong `.github/workflows/release.yml`:**
```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 22   # ← PHẢI match Node version của Electron target
    cache: 'npm'
- name: Install dependencies
  run: npm install
- name: Rebuild native modules for Electron
  run: npx electron-builder install-app-deps   # ← Đảm bảo native ABI đúng
```

**Quy tắc:** Khi upgrade Electron, kiểm tra Node version tương ứng:
- Electron 33–35: Node 20
- Electron 36–40: Node 22
- Kiểm tra: https://releases.electronjs.org/

---

### Lỗi 4: Thiếu `.zip` và `.blockmap` cho `electron-updater`

**Triệu chứng:** Auto-update không hoạt động trên Mac. `electron-updater` không tìm thấy file để download.

**Root cause:** `electron-updater` trên Mac cần file `.zip` (KHÔNG phải `.dmg`) để update.

**Fix `package.json`:**
```json
"mac": {
  "target": [
    { "target": "dmg", "arch": ["x64", "arm64"] },
    { "target": "zip", "arch": ["x64", "arm64"] }  ← BẮT BUỘC cho auto-update
  ]
}
```

**Fix `release.yml` — upload artifacts:**
```yaml
path: |
  release/*.exe
  release/*.dmg
  release/*.zip           ← upload .zip
  release/*.blockmap      ← upload .blockmap
  release/latest*.yml
```

---

### Lỗi 5: `asarUnpack` thiếu native modules

**Triệu chứng:** Native modules (`.node` binary files) không load được từ bên trong `.asar`.

**Root cause:** File `.node` binary KHÔNG thể `dlopen()` từ bên trong `.asar` archive.

**Fix:**
```json
"asarUnpack": [
  "node_modules/better-sqlite3/**/*",
  "node_modules/sharp/**/*",
  "node_modules/cloudflared/**/*",
  "node_modules/nodemailer/**/*",
  "node_modules/multer/**/*",
  "src/utils/**/*"
]
```

**Quy tắc:** Mọi dependency có file `.node` (native addon) PHẢI nằm trong `asarUnpack`.
Kiểm tra: `find node_modules -name "*.node" | grep -v ".bin"` → mỗi package xuất hiện phải có trong `asarUnpack`.

### Lỗi 6: `require('./server.cjs')` trong main process block UI (2-3s lag)

**Triệu chứng:** Chuyển tab trong admin dashboard bị lag/đơ 2-3 giây.

**Root cause:** `better-sqlite3` là synchronous library. Khi `server.cjs` chạy **trong Electron main process**:
- React fetch API → Express route handler → `db.prepare(...).all()` → **blocking SQLite query**
- Block toàn bộ Electron event loop (UI, IPC, rendering đều dừng)
- Quập xong mới tiếp tục → user thấy UI đọ

**Fix đúng: `utilityProcess.fork()`** — Electron official API (Electron v20+)

```js
// main.cjs
const { app, BrowserWindow, ipcMain, dialog, utilityProcess } = require('electron');

function startBackend() {
    const isDev = !app.isPackaged;
    const serverScript = path.join(__dirname, 'server.cjs');
    const env = { ...process.env, DATA_PATH: dataPath };

    if (isDev) {
        // Dev: spawn với system node
        serverProcess = spawn('node', [serverScript], { stdio: ['ignore', 'pipe', 'pipe'], env });
    } else {
        // Production: utilityProcess.fork() — OFFICIAL ELECTRON WAY
        // • Chạy trong process riêng → không block UI
        // • Hỗ trợ .asar + native modules (.node) đúng cách
        // • Không cần ELECTRON_RUN_AS_NODE=1
        serverProcess = utilityProcess.fork(serverScript, [], { env });
    }
}
```

**Kiến trúc chínhxác:**
```
Dev mode:   spawn('node', [...])          → system Node.js process
Production: utilityProcess.fork(...)      → Electron child process (non-blocking)
TUYỆT ĐỐI KHÔNG: require('./server.cjs') → runs IN main process, blocks UI
```

---


```
[ ] Đã chạy grep kiểm tra require trong server.cjs → đủ entries trong "files"?
[ ] Tất cả *.node native modules có trong asarUnpack?
[ ] Node version trong CI match Electron version (kiểm tra releases.electronjs.org)?
[ ] Mac target có cả "dmg" và "zip"?
[ ] release.yml upload cả *.zip và *.blockmap?
[ ] Đã test bản packaged LOCAL (npm run electron:build) TRƯỚC khi push tag?
[ ] server.cjs không có route mới nằm ngoài "files" list?
```

---

## ✅ Cách test bản packaged trên Mac (local)

```bash
# 1. TẮT electron:dev trước để tránh port conflict
#    (Ctrl+C terminal đang chạy npm run electron:dev)

# 2. Build local
npm run electron:build

# 3. Cài file DMG trong release/
# Mac Intel: release/Order Cafe-2.x.x.dmg
# Mac M1+:   release/Order Cafe-2.x.x-arm64.dmg

# 4. Mở app, đăng nhập để xác nhận
```

---

## ✅ Quy trình release lên GitHub (CI build)

```bash
# 1. Chạy checklist trên
# 2. Bump version trong package.json
# 3. Commit tất cả thay đổi
git add .
git commit -m "chore: release vX.Y.Z"

# 4. Tag và push (trigger CI)
git tag vX.Y.Z
git push origin main --tags

# 5. Theo dõi GitHub Actions
# https://github.com/mvcthinhofficial/order-cafe/actions
# Chờ tất cả jobs: build-electron (mac), build-electron (win), build-linux, publish
```

---

## Kiến trúc hiện tại (v2.0.21+)

```
Electron Main Process
├── main.cjs  
│   ├── app.on('ready') → startBackend() → require('./server.cjs')  ← chạy trong main process
│   ├── createMainWindow() → load dist/index.html#/admin
│   └── autoUpdater → kiểm tra GitHub Releases
│
├── server.cjs [Express + better-sqlite3] ← chạy TRONG main process (production)
│   ├── ./db.cjs
│   ├── ./migration.cjs  
│   ├── ./routes/paymentWebhook.cjs
│   ├── ./server/routes/authRoutes.cjs
│   ├── ./src/utils/timeUtils.cjs
│   └── ./src/utils/taxUtils.cjs
│
└── dist/index.html [React SPA]
    └── fetch('http://localhost:3001/api/...') ← api.js khi isElectronFile
```
