#!/bin/bash

# Kiểm tra nếu người dùng không nhập version
if [ -z "$1" ]; then
  echo "❌ Vui lòng nhập số phiên bản (Ví dụ: ./release.sh 1.0.3)"
  exit 1
fi

NEW_VERSION=$1

echo "🚀 Đang chuẩn bị phát hành bản cập nhật v$NEW_VERSION..."

# 1. Cập nhật version trong package.json
echo "📝 Đang cập nhật version trong package.json..."
sed -i '' "s/\"version\": \".*\"/\"version\": \"$NEW_VERSION\"/" package.json

# 2. Git Commit & Push
echo "📦 Đang đẩy code lên GitHub..."
git add .
git commit -m "Release v$NEW_VERSION"
git push origin main

# 3. Tạo Tag và Push Tag để kích hoạt GitHub Actions
echo "🏷️ Đang tạo Tag v$NEW_VERSION..."
git tag "v$NEW_VERSION"
git push origin "v$NEW_VERSION"

echo ""
echo "✅ TẤT CẢ ĐÃ XONG!"
echo "--------------------------------------------------"
echo "1. GitHub Actions đang bắt đầu build bản cài đặt cho Windows, Mac và LINUX."
echo "2. Sau khoảng 5-10 phút, bản cài đặt (.exe, .dmg, .tar.gz) sẽ tự động xuất hiện trong GitHub Releases."
echo "3. Các ứng dụng Desktop sẽ tự nhận diện bản cập nhật."
echo "4. Đối với Linux Server: Anh chỉ cần vào Admin Dashboard > Settings > Cập nhật hệ thống và nhấn nút."
echo "   (Lưu ý: Quá trình build frontend trên Linux có thể mất 2-5 phút tùy cấu hình máy)"
echo "--------------------------------------------------"
