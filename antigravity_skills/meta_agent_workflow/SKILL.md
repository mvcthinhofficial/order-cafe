---
name: meta_agent_workflow
description: Vòng lặp Tiến hoá của Agent - Cách tự học và đồng bộ lên OpenSpace Dashboard
---
# QUY TRÌNH TIẾN HOÁ TỰ ĐỘNG (META AGENT WORKFLOW)

Đây là kỹ năng cấp cao (Meta-Skill) quy định cách thức Antigravity Agent (AI nội bộ) bắt đầu và bảo trì dự án Order Cafe để liên tục mở rộng trí khôn mà không làm phình to file Context gốc.

## 1. Khởi động Phiên Chat Mới
- Khi User bắt đầu một phiên chat mới, hệ thống tự động yêu cầu Agent rà soát `PROJECT_CONTEXT.md`.
- Tại đó, Agent sẽ tìm thấy **ANTIGRAVITY EVOLUTION DIRECTIVE**.
- Agent LẬP TỨC sử dụng công cụ `list_dir` quét thư mục `antigravity_skills/` để nạp danh sách các thủ thuật lập trình đã đúc kết được trong quá khứ.
- Agent dùng `view_file` đọc qua các Skill liên quan để đánh thức lại trí nhớ (Pattern recognition).

## 2. Xử lý Task Mới
- Agent nhận yêu cầu viết Code từ User. Sử dụng Memory (Skills) để đưa ra hướng đi Architecture ổn định, viết code, sửa lỗi đến khi tính năng hoàn hảo.

## 3. Post-Action Reflection (Phản Tỉnh Lõi)
Trọng tâm sức mạnh của quy trình nằm ở đây:
- Sau khi User xác nhận tính năng đã hoạt động, Agent TỰ ĐỘNG dành một lượt (Turn) suy nghĩ: "Có kỹ năng/thủ năng nào có thể tái sử dụng không?".
- Nếu có, Agent dùng `write_to_file` tạo ra 1 file MarkDown tại `antigravity_skills/[tên_logic_moi]/SKILL.md` gồm tên tựa và miêu tả Frontmatter, ở dưới viết cú pháp Markdown ghi lại bài học. Ghi chú súc tích, ngắn gọn.

## 4. Đồng Bộ Dashboard (OpenSpace Bridge)
Sau khi file Skill lưu xong, Agent TỰ KÍCH HOẠT lệnh bash qua Terminal:
```bash
source OpenSpace/venv/bin/activate && python OpenSpace/sync_to_openspace.py
```
*(Chạy từ root dự án).* Lệnh này sẽ chọc vào CSDL SQLite của OpenSpace ở `.openspace.db` thông qua script tùy biến, qua đó đẩy dữ liệu lên Local UI để Human tương tác đa chiều.
