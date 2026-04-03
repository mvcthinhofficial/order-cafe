---
name: Backend Modularization Policy
description: Hướng dẫn phân tách tính năng Backend mới ra khỏi khối server.cjs khổng lồ. Tuân thủ tuyệt đối quy tắc Anti-Monolith.
---

# Lệnh Cấm Bất Biến: Không Viết Thêm Logic Vào server.cjs

File `server.cjs` hiện tại đã trở nên quá tải (>4.700 dòng lệnh). Từ bây giờ trở đi, khi được yêu cầu thêm một tính năng hoặc API mới ở Backend, bạn **BẮT BUỘC PHẢI TUÂN THỦ** nguyên tắc sau:

### 1. Không Nhồi Nhét Vào server.cjs
Tuyệt đối không viết thêm các khối `app.get()`, `app.post()`, hoặc logic tính toán xử lý dữ liệu trực tiếp vào trong tệp `server.cjs`. Việc này sẽ làm nghiêm trọng thêm khoản "nợ kỹ thuật" của hệ thống.

### 2. Sử Dụng Cấu Trúc Thư Mục Đã Chuẩn Bị Sẵn
Bất kỳ tính năng backend mới nào cũng phải được bóc tách và viết vào thư mục `server/` theo kiến trúc lớp:
- **Tầng Controllers (Routing):** Thêm vào thư mục `server/routes/`. Khai báo API Endpoint tại đây, sau đó `module.exports` ra ngoài. Tại `server.cjs` chỉ việc `app.use('/api/...', require('./server/routes/tenFile'))`.
- **Tầng Logic (Nghiệp Vụ):** Nếu tính năng đòi hỏi xử lý toán học, kiểm tra điều kiện phức tạp, kết nối chéo..., viết hàm tách bạch vào thư mục `server/services/`.
- **Tầng Database (Lưu trữ):** Nếu tính năng cần thêm câu lệnh SQL mới vào SQLite (`cafe.db`), bạn viết phương thức vào thư mục `server/store/`. Tốt nhất là tạo một file DAO chuyên biệt như `server/store/newFeatureDao.js`.

### 3. Cách Kết Nối Khối Mới Vào Trái Tim Hệ Thống
Để liên kết các File mới tạo với hệ thống cũ:
- Trong `server.cjs`, thêm thao tác Import ở khu vực Configs.
- Nếu File mới cần sử dụng `db` (better-sqlite3 instance) hoặc `broadcastEvent` (hệ thống SSE), bạn phải "truyền" (inject) chúng vào từ `server.cjs` thông qua tham số hàm (Dependency Injection) thay vì cố tạo biến Global. 

Ví dụ:
```javascript
// Thay vì viết logic trong server.cjs:
// app.post('/api/new-feature', (req, res) => { /* 100 dòng logic */ })

// Hãy tạo server/routes/newFeature.js
module.exports = function(db, broadcastEvent) {
    const router = require('express').Router();
    router.post('/', (req, res) => {
        // ... xử lý
    });
    return router;
};

// Rồi ở server.cjs chỉ import:
const newFeatureRoute = require('./server/routes/newFeature')(db, broadcastEvent);
app.use('/api/new-feature', newFeatureRoute);
```

### 4. Triết lý Phát triển
"Rời khỏi vùng an toàn của Monolith, tự động tách file khi xây tính năng cứng". Mọi quyết định thiết kế Backend giờ phải qua lăng kính Modularization.
