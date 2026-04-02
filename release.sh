#!/bin/bash

# ================================================================
# release.sh — Order Cafe Release Script
# Chạy từ máy Mac của developer.
# Usage:
#   ./release.sh 1.4.0          → release version cụ thể
#   ./release.sh patch          → tự động tăng patch (1.3.3 → 1.3.4)
#   ./release.sh minor          → tự động tăng minor (1.3.3 → 1.4.0)
#   ./release.sh major          → tự động tăng major (1.3.3 → 2.0.0)
# ================================================================

set -e  # Dừng ngay nếu có lệnh nào thất bại

# --- Đọc version hiện tại từ package.json ---
CURRENT_VERSION=$(node -e "console.log(require('./package.json').version)")
echo ""
echo "📦 Phiên bản hiện tại trong package.json: v${CURRENT_VERSION}"

# --- Tính toán version mới ---
if [ -z "$1" ]; then
  echo ""
  echo "Usage:"
  echo "  ./release.sh 1.4.0    → release version cụ thể"
  echo "  ./release.sh patch    → tăng patch (v${CURRENT_VERSION} → patch++)"
  echo "  ./release.sh minor    → tăng minor (v${CURRENT_VERSION} → minor++)"
  echo "  ./release.sh major    → tăng major (v${CURRENT_VERSION} → major++)"
  exit 1
fi

# Hỗ trợ patch/minor/major tự động
IFS='.' read -r V_MAJOR V_MINOR V_PATCH <<< "$CURRENT_VERSION"
if [ "$1" = "patch" ]; then
  NEW_VERSION="${V_MAJOR}.${V_MINOR}.$((V_PATCH + 1))"
elif [ "$1" = "minor" ]; then
  NEW_VERSION="${V_MAJOR}.$((V_MINOR + 1)).0"
elif [ "$1" = "major" ]; then
  NEW_VERSION="$((V_MAJOR + 1)).0.0"
else
  NEW_VERSION=$1
fi

TAG="v$NEW_VERSION"

# Validate semver cơ bản
if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "❌ Version không hợp lệ: '$NEW_VERSION'"
  echo "   Phải theo định dạng X.Y.Z (ví dụ: 1.3.4)"
  exit 1
fi

echo ""
echo "=================================================="
echo "  🚀 CHUẨN BỊ PHÁT HÀNH ORDER CAFE $TAG"
echo "=================================================="
echo "  Từ: v${CURRENT_VERSION}  →  Tới: ${TAG}"
echo ""
read -p "Xác nhận release $TAG? (y/N): " CONFIRM_RELEASE
if [[ "$CONFIRM_RELEASE" != "y" && "$CONFIRM_RELEASE" != "Y" ]]; then
  echo "❌ Hủy release."
  exit 0
fi

# --- Kiểm tra working directory sạch (ngoài package.json sẽ được tự sửa) ---
DIRTY=$(git status --porcelain | grep -v "package.json" || true)
if [[ -n "$DIRTY" ]]; then
  echo ""
  echo "⚠️  Phát hiện file chưa commit (ngoài package.json):"
  echo "$DIRTY"
  echo ""
  read -p "Vẫn tiếp tục release? (y/N): " CONFIRM_DIRTY
  if [[ "$CONFIRM_DIRTY" != "y" && "$CONFIRM_DIRTY" != "Y" ]]; then
    echo "❌ Hủy release."
    exit 1
  fi
fi

# --- BƯỚC 1: Cập nhật version trong package.json ---
echo ""
echo "[1/5] 📝 Đang cập nhật version → $NEW_VERSION trong package.json..."
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  pkg.version = '$NEW_VERSION';
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
  console.log('  ✅ package.json đã được cập nhật: ' + pkg.version);
"

# --- BƯỚC 2: Kiểm tra các file quan trọng đều tồn tại ---
echo ""
echo "[2/5] 🔍 Đang kiểm tra tính toàn vẹn của các file quan trọng..."

REQUIRED_FILES=(
  "server.cjs"
  "db.cjs"
  "migration.cjs"
  "main.cjs"
  "package.json"
  "src/utils/timeUtils.cjs"
  "src/utils/taxUtils.cjs"
  "routes/paymentWebhook.cjs"
)

ALL_OK=true
for f in "${REQUIRED_FILES[@]}"; do
  if [ ! -f "$f" ]; then
    echo "  ❌ Thiếu file bắt buộc: $f"
    ALL_OK=false
  else
    echo "  ✅ $f"
  fi
done

if [ "$ALL_OK" = false ]; then
  echo ""
  echo "❌ Phát hiện file thiếu. Hủy release."
  exit 1
fi

# --- BƯỚC 3: Git commit & push ---
echo ""
echo "[3/5] 📦 Đang commit và đẩy code lên GitHub..."
git add .
git commit -m "chore: release $TAG"
git push origin main
echo "  ✅ Code đã được đẩy lên GitHub."

# --- BƯỚC 4: Tạo Git Tag để kích hoạt GitHub Actions ---
echo ""
echo "[4/5] 🏷️  Đang tạo Git Tag $TAG và đẩy lên GitHub..."

# Xóa tag cũ nếu tồn tại (tránh lỗi khi retag)
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "  ⚠️  Tag $TAG đã tồn tại cục bộ, đang xóa và tạo lại..."
  git tag -d "$TAG"
  git push origin ":refs/tags/$TAG" 2>/dev/null || true
fi

git tag "$TAG"
git push origin "$TAG"
echo "  ✅ Tag $TAG đã được đẩy lên — GitHub Actions đang bắt đầu build."

# --- BƯỚC 5: Thông báo kết quả ---
echo ""
echo "=================================================="
echo "  ✅ PHÁT HÀNH $TAG ĐÃ BẮT ĐẦU!"
echo "=================================================="
echo ""
echo "📋 QUY TRÌNH BUILD:"
echo ""
echo "  [GitHub Actions]"
echo "  ├── build-electron (macOS-latest):  → .dmg cho Mac"
echo "  ├── build-electron (windows-latest): → .exe (NSIS) cho Windows"
echo "  ├── build-linux:                     → order-cafe-$TAG.tar.gz"
echo "  │     Bao gồm: dist/ server.cjs db.cjs migration.cjs"
echo "  │               src/utils/ package.json public/"
echo "  └── publish: → GitHub Release tự động"
echo ""
echo "📦 NỘI DUNG GÓI LINUX (order-cafe-$TAG.tar.gz):"
echo "  • dist/            — Giao diện React đã build"
echo "  • server.cjs       — Backend Express"
echo "  • db.cjs           — SQLite schema + helpers"
echo "  • migration.cjs    — Tự động chuyển JSON cũ → SQLite"
echo "  • src/utils/       — timeUtils.cjs, taxUtils.cjs (dùng bởi server)"
echo "  • routes/          — paymentWebhook.cjs (BẮT BUỘC)"
echo "  • package.json     — Dependencies (version: $NEW_VERSION)"
echo "  • public/          — Static assets"
echo ""
echo "🔄 CÁC THIẾT BỊ TỰ CẬP NHẬT:"
echo "  • Desktop Mac/Win: Electron auto-updater tự phát hiện"
echo "  • Linux Server:    Admin Dashboard → Cài Đặt → Cập nhật hệ thống"
echo "    (Hệ thống tự tải .tar.gz, giải nén, chạy migration, pm2 restart)"
echo ""
echo "🔗 GitHub Release:"
echo "  https://github.com/mvcthinhofficial/order-cafe/releases/tag/$TAG"
echo ""
echo "⏱️  Thời gian build ước tính: 5–10 phút"
echo ""
echo "⚠️  NHẮC NHỞ: Luôn dùng ./release.sh để tạo release!"
echo "   Tạo tag tay sẽ không bump package.json → version hiển thị bị sai!"
echo "=================================================="
