#!/bin/bash

# ================================================================
# deploy_linux.sh — Triển khai Order Cafe lên máy Linux
# Chạy từ máy Mac của developer.
# Usage: ./deploy_linux.sh
# ================================================================

# Configuration
REMOTE_USER="mvcthinh"
REMOTE_HOST="192.168.1.6"
REMOTE_DIR="/home/${REMOTE_USER}/order-cafe"

# DATA_PATH trên Linux — PHẢI nhất quán qua mọi lần deploy/restart
# Mặc định: {REMOTE_DIR}/data (NẰM NGOÀI thư mục app, không bị đè khi update)
REMOTE_DATA_PATH="${REMOTE_DIR}/data"

echo "======================================"
echo " BẮT ĐẦU ĐÓNG GÓI CHO LINUX SERVER"
echo "======================================"
echo "Remote:    ${REMOTE_USER}@${REMOTE_HOST}"
echo "App Dir:   ${REMOTE_DIR}"
echo "Data Path: ${REMOTE_DATA_PATH}"
echo ""

# 1. Build Frontend
echo "[1/4] Đang build giao diện web (React/Vite) bản chính thức..."
npm run build

# Khởi tạo danh sách file cơ bản cần pack
# src/utils/ BẮT BUỘC vì server.cjs require('./src/utils/timeUtils.cjs') và taxUtils.cjs
PACK_FILES="dist src/utils server.cjs db.cjs migration.cjs package.json package-lock.json public LINUX_DEPLOYMENT_GUIDE.md"

echo ""
echo "[2/4] Bạn đang thao tác CẬP NHẬT hay CÀI ĐẶT LẦN ĐẦU?"
echo "  [1] Chỉ cập nhật Mã Nguồn (An toàn dữ liệu — KHÔNG đè database trên Linux)"
echo "  [2] Cài đặt lần đầu (Mang theo Database từ Mac ném qua Linux)"
read -p "Chọn (1 hoặc 2, mặc định là 1): " SYNC_MODE

if [ "$SYNC_MODE" = "2" ]; then
    echo "⚠️  BẠN ĐÃ CHỌN MANG THEO DATABASE! Sẽ ghi đè dữ liệu cũ trên Linux."
    PACK_FILES="$PACK_FILES data"
else
    echo "✅ Chế độ Update An Toàn. Bỏ qua Database."
fi

echo ""
echo "Đang nén file..."
tar -czf order-cafe-linux.tar.gz $PACK_FILES 2>/dev/null
echo "  -> Đã tạo file nén: order-cafe-linux.tar.gz ($(du -sh order-cafe-linux.tar.gz | cut -f1))"

# 3. Gửi sang Server
echo ""
echo "[3/4] Đang copy file sang máy Linux ($REMOTE_USER@$REMOTE_HOST)..."
ssh -t $REMOTE_USER@$REMOTE_HOST "mkdir -p $REMOTE_DIR"
scp order-cafe-linux.tar.gz $REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR/

# 4. Trích xuất và chạy trên Server
echo ""
echo "[4/4] Đang gửi lệnh cài đặt và khởi động tự động trên máy Linux..."
ssh -t $REMOTE_USER@$REMOTE_HOST "
  set -e
  cd $REMOTE_DIR

  echo '=> Giải nén file...'
  tar -xzf order-cafe-linux.tar.gz
  rm -f order-cafe-linux.tar.gz

  echo '=> Đảm bảo thư mục data tồn tại ngoài thư mục app...'
  mkdir -p $REMOTE_DATA_PATH

  echo '=> node_modules đã được đóng gói sẵn trong bundle — bỏ qua npm install...'
  echo '   (Nếu gặp lỗi module, chạy thủ công: npm install --omit=dev)'

  echo '=> Tạo PM2 ecosystem file để DATA_PATH persist qua mọi lần restart...'
  cat > ecosystem.config.cjs << EOF
module.exports = {
  apps: [{
    name: 'order-cafe',
    script: 'server.cjs',
    env: {
      NODE_ENV: 'production',
      DATA_PATH: '${REMOTE_DATA_PATH}',
      PORT: 3001
    },
    restart_delay: 3000,
    max_restarts: 10,
    autorestart: true
  }]
};
EOF

  if ! command -v pm2 &> /dev/null; then
      echo '==============================================='
      echo ' MÁY CHỦ CHƯA CÀI ĐẶT CÔNG CỤ QUẢN LÝ NỀN (PM2)'
      echo ' Vui lòng đăng nhập vào Linux và chạy 2 lệnh sau:'
      echo '   1. sudo npm install -g pm2'
      echo '   2. cd $REMOTE_DIR && pm2 start ecosystem.config.cjs && pm2 save'
      echo '==============================================='
  else
      echo '=> Phát hiện PM2, Tiến hành khởi động lại với ecosystem.config.cjs...'
      pm2 stop order-cafe 2>/dev/null || true
      pm2 delete order-cafe 2>/dev/null || true
      pm2 start ecosystem.config.cjs
      pm2 save
      echo '=> KÍCH HOẠT HOÀN TẤT! Phần mềm đang chạy ổn định trong nền.'
      pm2 status order-cafe
  fi
"

# Dọn dẹp rác cục bộ
rm -f order-cafe-linux.tar.gz

echo ""
echo "======================================"
echo " ĐÃ TRIỂN KHAI THÀNH CÔNG LÊN LINUX!"
echo " Data được lưu tại: ${REMOTE_DATA_PATH}"
echo " (Đường dẫn này được ghi vào ecosystem.config.cjs"
echo "  và sẽ KHÔNG thay đổi khi update phiên bản mới)"
echo ""
echo " Hãy mở trình duyệt và truy cập:"
echo " 👉 http://${REMOTE_HOST}:3001"
echo "======================================"
