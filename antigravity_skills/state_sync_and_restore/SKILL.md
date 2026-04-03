---
name: State Synchronization & Safe Restore (Component Boundaries)
description: Hướng dẫn các nguyên tắc an toàn khi xử lý State, Props và các bộ lọc hiển thị cấp Component, giúp tránh rơi vào các lỗ hổng Fallback logic và React Crash khi refactor/rollback UI.
---

# State Synchronization & Safe Restore Guidelines

Kỹ năng này giúp AI tránh được những sai lầm thảm họa khi thực hiện refactoring hoặc rollback trên các giao diện React phức tạp (như Admin Dashboard), đặc biệt với các ứng dụng có luồng Props Drilling nhiều cấp.

## 1. Hiểm Họa "Lỗ Hổng Fallback" Trong Các Filter
Khi có yêu cầu thêm một lựa chọn hiển thị MỚI vào UI (ví dụ: `inventoryPeriod === 'custom'`), phần thay đổi giao diện (UI Toggle) là **CHƯA ĐỦ**.

BẮT BUỘC thực hiện kiểm tra chuỗi (Chain Validation) theo các bước:
- **UI Element (Bộ chọn/Select/Radio):** Đã truyền được giá trị mới vào state chưa?
- **Data Fetching:** Thư viện `fetch()` hoặc API call đã gắn param cho tuỳ chọn mới này chưa? (VD: `?start=${customStartDate}`)
- **Data Rendering (MẢNG DỮ LIỆU):** Component vẽ dữ liệu ra UI KHÔNG ĐƯỢC CHỈ CHIA NHÁNH (if/else) CHO UI. Nó thường có các hàm bóc tách dữ liệu nội tại (như `use1`, `use7`, `use30`). 
  -> Bất kỳ chỗ nào gọi đến mảng gốc (như `map()` hay `forEach()`) đều PHẢI BAO GỒM logic phân phối (Ternary Expression) nhằm bắt gọn tuỳ chọn dữ liệu MỚI.
  -> **Nguyên nhân chính:** Nếu tuỳ chọn filter MỚI không được hàm xử lý dữ liệu nhận diện, đoạn code sẽ tự "rơi" về tuỳ chọn mặc định cũ (Cái hay xảy ra là tuỳ chọn "Tất Cả Thời Gian" kiểu `useAll` thay vì `usageQty`).
  -> **Hệ lụy:** Dữ liệu API thì chuẩn mà số liệu trên bảng Render thì sai lệch nặng!

## 2. Quy Tắc SINH TỬ Về Lệnh Hard-Rollback (Git Restore / File Replacement Toàn Cục)
Khi code UI thất bại, phản ứng thông thường là tìm lại mã nguồn cũ và "xóa đè" cả file (VD: git restore).
**QUY TẮC: DO NOT BLINDLY RESTORE LARGE COMPONENTS.**

Nếu nhất định phải Restore/Replace đoạn code lớn, BẮT BUỘC RÀ SOÁT CÁC "MỐC NỐI":
1. **Destructured Props:** Component cha (như AdminDashboard) truyền `setCustomStartDate` xuống, mà Component con khôi phục bản cũ xong "quên" nhận => React ngay lập tức **CRASH (is not a function)**.
2. **State Cục Bộ / Ref:** Bản cũ không có state `trashCount` - thế nhưng UI cũ lại bị trộn lẫn với UI mới cần show thông báo => **Undefined values**.
3. **Các Effect Liên Quan:** `useEffect` của Component khôi phục lại không chứa các cleanup hoặc thiếu dependencies tracking phù hợp. 

**✅ Giải pháp an toàn nhất:**
- Khoanh vùng chính xác (Line Range) phần thẻ Div hỏng -> dùng công cụ `replace_file_content` hoặc `multi_replace_file_content` để ĐIỀU CHỈNH CỤC BỘ.
- Chữa bệnh đúng dòng báo lỗi, THAY VÌ "xóa bàn cờ làm lại từ đầu".

## Lịch Sử Bài Học
Skill này được thiết lập sau sự cố nghiêm trọng (03/04/2026), dẫn đến việc mất sạch tham số `setCustomStartDate`, `trashCount` và việc UI bảng biểu liên tục báo cáo láo do chỉ xử lý custom date ở lúc lấy Fetch, chứ không xử lý lúc Component nội tại bóc tách `usageQty`. 
Mất ngót ngét 4 vòng debug mới khôi phục xong. 
-> Phải ghi nhớ KHẮC CỐT ghi tâm!
