#!/bin/bash

# Tên file nén đầu ra
OUTPUT_FILE="OrderCafe_Windows_Source.zip"

echo "=========================================================="
echo "Đang dọn dẹp và tạo file nén mã nguồn chuyển sang Windows..."
echo "Tên file: $OUTPUT_FILE"
echo "=========================================================="

# Xóa file cũ nếu đã tồn tại
if [ -f "$OUTPUT_FILE" ]; then
    rm "$OUTPUT_FILE"
    echo "Đã xóa file nén cũ..."
fi

# Lệnh nén zip với các cờ loại trừ (-x)
# Lưu ý: -r là nén đệ quy (recursive), dấu chấm (.) đại diện cho thư mục hiện tại
zip -r "$OUTPUT_FILE" . -x \
    "node_modules/*" \
    "dist/*" \
    "release/*" \
    "out/*" \
    "mac/*" \
    "build/*" \
    ".git/*" \
    ".vscode/*" \
    ".idea/*" \
    "*.DS_Store" \
    "*.tar.gz" \
    "*.zip" \
    "data/server.log" \
    "data/receipts/*" \
    "logs/*" \
    "*.log"

echo ""
echo "=========================================================="
echo "✅ HOÀN TẤT! File nén đã sẵn sàng: $OUTPUT_FILE"
echo ""
echo "📌 HƯỚNG DẪN BUILD TRÊN WINDOWS:"
echo "1. Chép file $OUTPUT_FILE sang máy Windows và giải nén."
echo "2. Mở trình duyệt file, gõ 'cmd' trên thanh địa chỉ để mở Terminal."
echo "3. Chạy lệnh: npm install"
echo "4. Chạy lệnh: npm run build"
echo "5. Chạy lệnh: npm run dist (để electron-builder tự trích xuất ra .exe)"
echo "=========================================================="
