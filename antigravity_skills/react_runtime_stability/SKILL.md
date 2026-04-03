---
name: react_runtime_stability
description: Các nguyên tắc sống còn khi làm việc với React Hooks, Build Cache tĩnh và CORS trên Cloudflare Tunnels để tránh sập app.
---

# Kỹ năng Ổn định React Runtime & Tunnel Caching

Kỹ năng này đúc kết từ các sự cố Màn Hình Đỏ xảy ra tại quá trình giao dịch đơn hàng trên thiết bị Di Động/POS, liên quan tới Vòng đời của Hook, Quên lệnh Build tĩnh và Chặn CORS cục bộ.

## 1. Temporal Dead Zone (TDZ)
Tuyệt đối KHÔNG dùng các biến nội suy computed values (VD: `const hasActivePromo = localCart.some(...)`) **ĐẶT TRƯỚC** dòng khai báo `useState([localCart])` của chính biến state đó. 
👉 JS sẽ Hoist tên biến lên nhưng chưa cung cấp giá trị mặc định, nếu vô tình truy cập chéo sẽ gây lỗi crash: `ReferenceError: Cannot access variable before initialization`.
**Quy tắc:** Phải ưu tiên nhóm 100% mọi dòng lệnh cắm `useState` và `useRef` lên rào chắn đầu tiên của Component, rồi mới đến các Logic khác.

## 2. Minified React Error #300 (Hooks Khuyết Thiếu)
- **Luật sắt Hook:** Mọi khối biến hình đa trạng thái (`useMemo`, `useEffect`, `useState`) **BẮT BUỘC ĐƯỢC CHẠY VÔ ĐIỀU KIỆN** ở "Top-level" của thân Functional Component. 
- **Lỗi chí mạng:** Không bao giờ vứt Hook lửng lơ ở dưới một câu truy vấn `return` sớm (`if (!order) return null;`) HOẶC nhét thẳng cục Hook vào khu vực khuất nẻo như `if (condition) { const result = useMemo(...) }`.
- **Hệ quả:** Khi hàm render chạy lần 1 điều kiện A đúng -> load 5 cái hook. Chạy lần 2 điều kiện A sai -> return sớm -> load được 3 cái hook. Lúc này React Engine sẽ bối rối vì đếm số Hook lệch nhau giữa các chu kì và tạt Acid sập trắng ứng dụng: `React Error 300: Rendered fewer hooks than expected`.

## 3. Lỗi Ảo Giác Production Cache (Cloudflare Tunnels)
- React Vite Dev Server (port 5173/5174) thường tự Hot-Reload để sửa Component. Tuy nhiên, Domain Tunnels động (VD: Cloudflare) lại luôn đâm trực tiếp vào Node Server Backend (port 3001) phục vụ truy cập ngoài LAN.
- Node Server không Hot-Reload mà nó nhai tệp dữ liệu tĩnh trong thư mục `dist/`.
- **Lesson:** Cứ mỗi lần sửa lỗi React và Dev Server báo Done, mà điện thoại từ Tunnels vẫn báo lỗi Y HỆT lúc nãy? Nguyên do 100% chưa tạo Build tĩnh. **BẮT BUỘC phải gõ lệnh `npm run build`** để xuất File Bundle .JS mới thì điện thoại Tunnels mới bám được update. Không bao giờ được phép quên.

## 4. Animation Inconsistency (Mảng Sót Framer Motion)
- Hạn chế tối đa dùng `framer-motion` cho các thiết bị yếu. Nếu muốn cắt bỏ hiệu ứng, phải dùng Regex lùng sục triệt để mọi vệt chữ `<motion.img>`, `layoutId=`, `<AnimatePresence>` ra khỏi Component.
- Đặc quyền: Tuyệt đối không xóa dòng `import { motion }` ở đỉnh file nếu nửa thân dưới vẫn lẩn khuất các Object Motion trốn trong `AnimatePresence`. Hậu quả: `ReferenceError: Can't find variable motion`.

## 5. Cổ Cồn CORS Trên Tunnels Không Cố Định
- Tunnels tạo ra các Domain URL vô tận (`trycloudflare.com`). Nếu Node.js Server cài Middleware CORS thắt chặt (`localhost`, `192.168...`) thì Tunnel Requests sẽ vỡ vụn tại vạch gôn thành lỗi `HTTP 500 Network Failed` ngay lúc Call Fetch.
- Khi App đã được trang bị rào giáp Auth Token/JWT kín kẽ, **hãy giải phóng rào CORS Server** bằng lệnh `app.use(cors())` mặc định (allow * Origin). Đừng đi thắt cổ những Tunnels.
