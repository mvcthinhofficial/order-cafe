#!/bin/bash

# Kiểm tra version
VERSION=$(node -p "require('./package.json').version")
echo "🚀 Đang bắt đầu quy trình đóng gói bản phát hành v$VERSION..."

# 1. Build frontend & Electron app (Windows & Mac)
echo "📦 Đang Build bản cài đặt cho Windows và Mac..."
npm run electron:build

# 2. Đóng gói bản cập nhật cho Linux Server
echo "📦 Đang đóng gói bản cập nhật cho Linux Server..."
mkdir -p dist-server
cp -r server.cjs package.json package-lock.json dist-server/
# Copy các thư mục cần thiết nếu có (ví dụ public nếu server dùng)
# tar -czf release-v$VERSION.tar.gz dist-server/
tar -czf order-cafe-v$VERSION.tar.gz server.cjs package.json package-lock.json

echo "✅ Đã tạo xong file: order-cafe-v$VERSION.tar.gz"
echo ""
echo "🔥 TIẾP THEO:"
echo "1. Đẩy code lên GitHub: git push origin main"
echo "2. Tạo một 'New Release' trên GitHub với tag: v$VERSION"
echo "3. Tải các file trong thư mục 'dist' (exe, dmg) và file 'order-cafe-v$VERSION.tar.gz' lên bản Release đó."
echo "4. Hệ thống Desktop và Server sẽ tự động nhận diện bản cập nhật!"

rm -rf dist-server
