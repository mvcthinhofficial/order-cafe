---
name: linux_deployment_ops
description: Quy trình triển khai Order Cafe lên Linux server, nguyên nhân crash phổ biến, checklist file bắt buộc, và quy tắc cập nhật ĐỒNG BỘ tất cả script liên quan
---

# Linux Server Deployment — Order Cafe

## ⚠️ Quy tắc vàng: Cập nhật ĐỒNG BỘ tất cả script liên quan

> Học từ sự cố 04/2026: Khi fix một bug trong pipeline deploy, không thể chỉ fix 1 file.
> Phải tìm và update **tất cả** các file liên quan trong cùng một lần.

Dự án này có **4 điểm** định nghĩa "file nào được đưa vào bundle Linux":

| File | Vai trò |
|------|---------|
| `deploy_linux.sh` | Script deploy thủ công từ Mac |
| `.github/workflows/release.yml` | CI/CD tự động khi push tag |
| `release.sh` | Script release tích hợp validation + push tag |
| `antigravity_skills/linux_deployment_ops/SKILL.md` | Tài liệu + checklist cho AI |

**Khi thêm file mới vào server** (ví dụ `routes/newFeature.cjs`), phải cập nhật **cả 4 nơi trên cùng lúc**.

### Quy trình checklist khi thêm file server mới:
```
[ ] deploy_linux.sh      → thêm vào PACK_FILES
[ ] release.yml          → thêm vào TAR_FILES (có điều kiện [ -d ... ])
[ ] release.sh           → thêm vào REQUIRED_FILES array
[ ] SKILL.md (file này) → cập nhật checklist BẮT BUỘC
```

---

# Linux Server Deployment — Order Cafe

## Kiến trúc triển khai: 2 channel riêng biệt

| Channel | Môi trường | Công cụ | Ghi chú |
|---------|-----------|---------|---------|
| **Desktop App** | Mac / Windows | `electron-builder` → `.dmg` / `.nsis` | `autoUpdater` của electron-updater |
| **Linux Server** | Ubuntu/Debian server | `deploy_linux.sh` → SSH + PM2 | KHÔNG dùng `electron-updater` |

> ⚠️ **QUAN TRỌNG:** GitHub Auto-Update (`/api/system/update`) chỉ dành cho Linux server Node.js.
> Electron Desktop App trên Mac/Win dùng `autoUpdater` riêng. Đây là 2 pipeline khác nhau hoàn toàn.

---

## Cách deploy an toàn (Linux Server)

```bash
# Từ máy Mac của developer
cd /path/to/order-cafe
./deploy_linux.sh
# → Chọn [1] để update source code (giữ nguyên database)
# → Chọn [2] chỉ khi cài lần đầu hoặc muốn reset DB
```

Script tự động:
1. Build frontend (Vite)
2. Nén tar.gz (KHÔNG include `node_modules` — giữ nguyên binary native trên server)
3. SCP lên server qua SSH
4. Giải nén, kiểm tra `node_modules`, tạo `ecosystem.config.cjs`
5. `pm2 restart` và `pm2 save`

---

## Checklist file BẮT BUỘC trong Linux bundle

Nếu thiếu bất kỳ file nào dưới đây, server crash ngay khi khởi động:

```
✅ dist/                    ← React frontend build (Vite)
✅ server.cjs               ← Backend Express + SQLite chính
✅ db.cjs                   ← Database init/migration runner
✅ migration.cjs            ← Schema migration
✅ package.json             ← Version + metadata
✅ package-lock.json        ← Lock file cho npm install
✅ src/utils/               ← BẮT BUỘC: server.cjs require('./src/utils/timeUtils.cjs') & taxUtils.cjs
✅ routes/                  ← BẮT BUỘC: paymentWebhook
✅ server/                  ← BẮT BUỘC: Theo quy tắc Anti-Monolith (chứa authRoutes, v.v.)
✅ public/                  ← Optional: logo, manifest (frontend serve)

❌ node_modules/            ← KHÔNG đưa vào! Binary native compile trên Ubuntu CI sẽ không
                               tương thích với server Linux khác distro/arch
❌ deploy_linux.sh          ← KHÔNG đưa vào! Script này chạy trên Mac, không phải server
❌ data/                    ← CHỈ đưa vào khi mode [2] cài đặt lần đầu
```

---

## Root cause crash sau GitHub Auto-Update

**Nguyên nhân 1 (Cũ): Thiếu thư mục routes/**
- Thiếu `routes/paymentWebhook.cjs` do script deploy cũ bỏ sót. Đã fix bằng cách thêm vào `PACK_FILES` và GitHub CI.

**Nguyên nhân 2 (04/2026): Thiếu thư mục server/ (Anti-Monolith)**
- Khi dự án chuyển sang cấu trúc Anti-Monolith (đưa API mới vào `server/routes/`), script `deploy_linux.sh` quên không được cập nhật.
- Hậu quả: `server.cjs` lỗi `MODULE_NOT_FOUND` do thiếu `server/routes/...`.
- **Fix:** Đã cập nhật mảng `PACK_FILES` thêm mục `server`.

**Nguyên nhân 3 (Chí mạng - 04/2026): Bỏ qua `npm install`**
- Trong cả `deploy_linux.sh` lẫn `/api/system/update`, hệ thống có logic: Nếu thấy `node_modules/better-sqlite3` đã tồn tại -> KHÔNG chạy `npm install` nữa.
- Hậu quả: Khi `package.json` có thêm thư viện mới (ví dụ thư viện crypto, axios up version, ...), Linux Server cập nhật xong sẽ không chịu cài các packet mới này -> Lỗi `MODULE_NOT_FOUND` và crash sạch sẽ.
- **Fix:** Đã gỡ bỏ logic "ném đá giấu tay" kể trên. Kể cả phát hiện có `better-sqlite3`, vẫn bắt buộc chạy lệnh `npm install --omit=dev`. Npm rất thông minh, việc này chỉ mất khoảng 2 giây để check/update dependency mới và đảm bảo không bao giờ trượt module nào.

---

## Dấu hiệu nhận biết crash do thiếu file

Kiểm tra PM2 logs khi server không chạy được:

```bash
# SSH vào server
ssh user@server
pm2 logs order-cafe --lines 30 --nostream

# Dấu hiệu crash do thiếu file:
# Error: Cannot find module './routes/paymentWebhook.cjs'
# Error: Cannot find module './src/utils/timeUtils.cjs'

# Dấu hiệu restart loop:
# pm2 status → ↺ (số cao, vd: 144) = đã crash và restart nhiều lần
```

---

## PM2 Health Check Commands

```bash
ssh user@192.168.1.6

# Kiểm tra trạng thái tổng quan
pm2 status

# Xem logs realtime
pm2 logs order-cafe

# Xem logs gần đây (không cần giữ kết nối)
pm2 logs order-cafe --lines 50 --nostream

# Restart thủ công
pm2 restart order-cafe

# Khởi động lại hoàn toàn bằng ecosystem file
pm2 stop order-cafe && pm2 delete order-cafe
pm2 start ecosystem.config.cjs
pm2 save
```

---

## Linux Auto-Update qua GitHub Release (/api/system/update)

**Flow hoạt động:**
1. Frontend gọi `GET https://api.github.com/repos/.../releases/latest`
2. Lấy URL tar.gz: `order-cafe-v{VERSION}.tar.gz`
3. Gửi `POST /api/system/update` với `downloadUrl`
4. Server validate URL (chỉ accept `github.com` domains, `https`, `.tar.gz`)
5. `curl` download → `tar -xzf` → kiểm tra `node_modules/better-sqlite3`
6. Tạo `_restart_update.sh` → `nohup bash` → `process.exit(0)` → PM2 tự restart

**Điều kiện để auto-update hoạt động:**
- Server đang chạy trên **Linux** (`process.platform === 'linux'`)
- User đăng nhập với role **ADMIN**
- Server có quyền ghi vào `__dirname`
- `curl` và `tar` có trong PATH của server
- PM2 đã được install và `order-cafe` đang được quản lý

**Anti-pattern:** Đừng dùng `electron-updater` cho Linux server — `autoUpdater` chỉ hoạt động với AppImage desktop app, không phải Node.js server process.

---

## macOS tar → Linux tar: Warning về xattr

Khi pack bằng tar trên macOS và giải nén trên Linux, sẽ có warning:
```
tar: Ignoring unknown extended header keyword 'LIBARCHIVE.xattr.com.apple.provenance'
tar: Ignoring unknown extended header keyword 'SCHILY.fflags'
```

**Đây là warning vô hại** — Linux tar bỏ qua các macOS-specific extended attributes.
Không gây lỗi, không ảnh hưởng đến file được giải nén.

Nếu muốn loại bỏ warning, pack trên macOS với `--no-xattrs`:
```bash
# Tuy nhiên flag này không phải lúc nào cũng available trên BSD tar của macOS
tar --no-xattrs -czf bundle.tar.gz files...
# Hoặc dùng gtar (GNU tar via homebrew)
gtar -czf bundle.tar.gz files...
```
