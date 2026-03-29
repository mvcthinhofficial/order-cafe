#!/bin/bash

# Configuration
REMOTE_USER="mvcthinh"
REMOTE_HOST="192.168.1.6"
REMOTE_DIR="~/order-cafe"

echo "======================================"
echo " BẮT ĐẦU ĐÓNG GÓI CHO LINUX SERVER"
echo "======================================"

# 1. Build Frontend
echo "[1/4] Đang build giao diện web (React/Vite) bản chính thức..."
npm run build

# Khởi tạo danh sách file cơ bản cần pack (Lõi + Giao diện)
PACK_FILES="dist server.cjs db.cjs migration.cjs package.json package-lock.json public LINUX_DEPLOYMENT_GUIDE.md"

echo "[2/4] Bạn đang thao tác CẬP NHẬT hay CÀI ĐẶT LẦN ĐẦU?"
echo "  [1] Chỉ cập nhật Mã Nguồn (An toàn dữ liệu, KHÔNG đè mất các đơn hàng đang có trên Linux)"
echo "  [2] Cài đặt lần đầu (Mang theo Toàn Bộ Cấu Hình, Menu và Tồn Kho từ Mac ném qua Linux)"
read -p "Chọn (1 hoặc 2, mặc định là 1): " SYNC_MODE

if [ "$SYNC_MODE" = "2" ]; then
    echo "⚠️ BẠN ĐÃ CHỌN MANG THEO DATABASE! Sẽ ghi đè dữ liệu cũ trên Linux."
    PACK_FILES="$PACK_FILES data"
else
    echo "✅ Chế độ Update An Toàn. Bỏ qua Database."
fi

echo "Đang nén file..."
tar -czf order-cafe-linux.tar.gz $PACK_FILES 2>/dev/null
echo "  -> Đã tạo file nén: order-cafe-linux.tar.gz"

# 3. Gửi sang Server
echo "[3/4] Đang copy file sang máy cục bộ Linux ($REMOTE_USER@$REMOTE_HOST)..."
echo "(Vui lòng nhập MẬT KHẨU máy MAC/LINUX nếu được Terminal hỏi)"
ssh -t $REMOTE_USER@$REMOTE_HOST "mkdir -p $REMOTE_DIR"
scp order-cafe-linux.tar.gz $REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR/

# 4. Trích xuất và chạy trên Server
echo "[4/4] Đang gửi lệnh cài đặt và khởi động tự động trên máy Linux..."
ssh -t $REMOTE_USER@$REMOTE_HOST "
  cd ~/order-cafe && \\
  echo '=> Giải nén file...' && \\
  tar -xzf order-cafe-linux.tar.gz && \\
  echo '=> Kiểm tra môi trường Node.js...' && \\
  node -v && \\
  echo '=> Cài đặt thư viện lõi (Production)...' && \\
  npm install --omit=dev && \\
  if ! command -v pm2 &> /dev/null; then \\
      echo '==============================================='; \\
      echo ' MÁY CHỦ CHƯA CÀI ĐẶT CÔNG CỤ QUẢN LÝ NỀN (PM2)'; \\
      echo ' Vui lòng đăng nhập vào Linux và chạy 2 lệnh sau:'; \\
      echo '   1. sudo npm install -g pm2'; \\
      echo '   2. cd ~/order-cafe && pm2 start server.cjs --name order-cafe && pm2 save'; \\
      echo '==============================================='; \\
  else \\
      echo '=> Phát hiện PM2, Tiến hành khởi động lại phần mềm...'; \\
      pm2 stop order-cafe 2>/dev/null || true; \\
      pm2 start server.cjs --name order-cafe; \\
      pm2 save; \\
      echo '=> KÍCH HOẠT HOÀN TẤT! Phần mềm đang chạy ổn định trong nền.'; \\
  fi
"

# Dọn dẹp rác cục bộ
rm order-cafe-linux.tar.gz
echo "======================================"
echo " ĐÃ TRIỂN KHAI THÀNH CÔNG PHIÊN BẢN 1.1.0!"
echo " Máy chủ Linux ($REMOTE_HOST) hiện đã sẵn sàng."
echo "--------------------------------------"
echo " 👉 URL truy cập nội bộ: http://$REMOTE_HOST:3001"
echo "======================================"
