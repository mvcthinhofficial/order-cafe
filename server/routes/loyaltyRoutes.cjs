module.exports = function(context) {
    const router = require('express').Router();
    const { db, activeTokens, log, getCurrentISOString, reloadPromotions } = context;

    const TIER_THRESHOLDS = {
        'Kim Cương': 15000000,
        'Vàng': 5000000,
        'Bạc': 0
    };

    const calculateTier = (totalSpent) => {
        if (totalSpent >= TIER_THRESHOLDS['Kim Cương']) return 'Kim Cương';
        if (totalSpent >= TIER_THRESHOLDS['Vàng']) return 'Vàng';
        return 'Bạc';
    };

    // 0. Search by partial phone or name
    router.get('/search', (req, res) => {
        const { q } = req.query;
        if (!q || q.length < 2) return res.json({ success: true, customers: [] });
        try {
            const customers = db.prepare('SELECT * FROM customers WHERE phone LIKE ? OR name LIKE ? COLLATE NOCASE LIMIT 8').all(`%${q}%`, `%${q}%`);
            res.json({ success: true, customers });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // 1. Get customer by phone
    router.get('/customer/:phone', (req, res) => {
        const { phone } = req.params;
        try {
            const customer = db.prepare('SELECT * FROM customers WHERE phone = ?').get(phone);
            if (customer) {
                // Fetch valid vouchers
                const vouchers = db.prepare(`SELECT * FROM customer_vouchers WHERE customerId = ? AND status = 'ACTIVE'`).all(customer.id);
                res.json({ success: true, customer, vouchers });
            } else {
                res.status(404).json({ success: false, message: 'Không tìm thấy khách hàng' });
            }
        } catch (e) {
            log(`[LOYALTY ERROR] Fetching customer ${phone}: ${e.message}`);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // 2. Register new customer (phone optional — name-only allowed)
    router.post('/register', (req, res) => {
        const { phone, name } = req.body;
        if (!name) return res.status(400).json({ success: false, message: 'Thiếu Tên khách hàng' });

        try {
            if (phone) {
                const exists = db.prepare('SELECT * FROM customers WHERE phone = ?').get(phone);
                if (exists) {
                    return res.status(400).json({ success: false, message: 'Số điện thoại này đã được đăng ký' });
                }
            }

            const id = 'cust_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
            const joinedAt = getCurrentISOString ? getCurrentISOString() : new Date().toISOString();
            // phone = null nếu chưa cung cấp → partial customer
            db.prepare(`INSERT INTO customers (id, phone, name, points, tier, totalSpent, visits, joinedAt, lastVisit) 
                        VALUES (?, ?, ?, 0, 'Bạc', 0, 0, ?, ?)`).run(id, phone || null, name, joinedAt, joinedAt);

            const newCustomer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
            res.json({ success: true, customer: newCustomer, message: phone ? 'Đăng ký thành viên thành công' : 'Đã lưu tên khách (chưa có SĐT)' });
        } catch (e) {
            log(`[LOYALTY ERROR] Registering customer: ${e.message}`);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // 2b. Bổ sung SĐT cho khách tên-only
    router.patch('/admin/customers/:id/phone', (req, res) => {
        const { id } = req.params;
        const { phone } = req.body;
        if (!phone) return res.status(400).json({ success: false, message: 'Thiếu SĐT' });
        try {
            const exists = db.prepare('SELECT id FROM customers WHERE phone = ? AND id != ?').get(phone, id);
            if (exists) return res.status(400).json({ success: false, message: 'SĐT này đã thuộc khách khác' });
            db.prepare('UPDATE customers SET phone = ? WHERE id = ?').run(phone, id);
            res.json({ success: true, message: 'Đã bổ sung SĐT thành công' });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // 2c. Tự động xóa khách tên-only không quay lại sau 60 ngày (chạy khi gọi)
    router.delete('/admin/cleanup-partial', (req, res) => {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ success: false });
        try {
            const cutoff = new Date(Date.now() - 60 * 86400000).toISOString();
            const result = db.prepare(`
                DELETE FROM customers 
                WHERE phone IS NULL AND (lastVisit < ? OR lastVisit IS NULL)
            `).run(cutoff);
            res.json({ success: true, deleted: result.changes, message: `Đã xóa ${result.changes} hồ sơ tên-only không hoạt động` });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // 2d. Đồng bộ lại số liệu cho khách name-only từ lịch sử đơn hàng (Admin only)
    // Dùng khi có đơn cũ chưa được link customerId — tính lại visits, totalSpent, points, favoriteItems
    router.post('/admin/resync-name-only', (req, res) => {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ success: false });
        const token = authHeader.substring(7);
        const user = activeTokens.get(token);
        if (!user || user.role !== 'ADMIN') return res.status(403).json({ success: false, message: 'Chỉ Quản lý' });

        try {
            const TIER_THRESHOLDS = { 'Kim Cương': 15000000, 'Vàng': 5000000, 'Bạc': 0 };
            const calcTier = t => t >= TIER_THRESHOLDS['Kim Cương'] ? 'Kim Cương' : t >= TIER_THRESHOLDS['Vàng'] ? 'Vàng' : 'Bạc';

            // Lấy tất cả khách name-only
            const nameOnlyCustomers = db.prepare('SELECT * FROM customers WHERE phone IS NULL').all();
            let synced = 0;

            nameOnlyCustomers.forEach(cust => {
                // Lấy tất cả đơn khớp: theo customerId HOẶC theo customerName (đơn chưa link)
                const orders = db.prepare(`
                    SELECT id, timestamp, price, cartItems, customerId
                    FROM orders
                    WHERE (
                        customerId = ?
                        OR (customerName = ? COLLATE NOCASE AND (customerId IS NULL OR customerId = '' OR customerId NOT LIKE 'cust_%'))
                    )
                    AND (status IN ('PAID','COMPLETED') OR isPaid = 1)
                    ORDER BY timestamp ASC
                `).all(cust.id, cust.name);

                if (orders.length === 0) return;

                // Tính lại tổng số liệu
                let totalSpent = 0;
                let visits = orders.length;
                const itemMap = {};
                let lastVisit = cust.lastVisit;

                orders.forEach(o => {
                    totalSpent += parseFloat(o.price || 0) * 1000; // price là đơn vị nghìn → * 1000 = VND thực
                    if (o.timestamp > (lastVisit || '')) lastVisit = o.timestamp;
                    // Đếm món
                    try {
                        const cart = typeof o.cartItems === 'string' ? JSON.parse(o.cartItems) : (o.cartItems || []);
                        cart.forEach(c => {
                            const n = c.item?.name || c.name || 'Không rõ';
                            itemMap[n] = (itemMap[n] || 0) + (c.count || 1);
                        });
                    } catch {}

                    // Link customerId cho đơn chưa được link
                    if (!o.customerId || o.customerId === '' || !o.customerId.startsWith('cust_')) {
                        db.prepare('UPDATE orders SET customerId = ? WHERE id = ?').run(cust.id, o.id);
                    }
                });

                const points = Math.floor((totalSpent / 1000) / 10); // 10,000đ = 1 điểm (price in thousands)
                const tier = calcTier(totalSpent);
                const favoriteItems = JSON.stringify(
                    Object.entries(itemMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count }))
                );

                const ts = getCurrentISOString ? getCurrentISOString() : new Date().toISOString();
                db.prepare(`
                    UPDATE customers SET visits = ?, totalSpent = ?, points = ?, tier = ?, lastVisit = ?, favoriteItems = ?
                    WHERE id = ?
                `).run(visits, totalSpent, points, tier, lastVisit || ts, favoriteItems, cust.id);

                synced++;
            });

            res.json({ success: true, synced, message: `Đã đồng bộ ${synced} hồ sơ khách tên-only` });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });


    // 3. Redeem points for a custom voucher
    // This is typically called by Admin on behalf of User
    router.post('/redeem', (req, res) => {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
        
        const { phone, pointsToDeduct, voucherDetails } = req.body;
        if (!phone || !pointsToDeduct || !voucherDetails) return res.status(400).json({ success: false, message: 'Thiếu thông tin' });

        try {
            db.transaction(() => {
                const customer = db.prepare('SELECT * FROM customers WHERE phone = ?').get(phone);
                if (!customer) throw new Error('Khách hàng không tồn tại');
                if (customer.points < pointsToDeduct) throw new Error('Điểm tích luỹ không đủ');

                // Deduct points
                db.prepare('UPDATE customers SET points = points - ? WHERE phone = ?').run(pointsToDeduct, phone);

                // Add log
                const logId = 'log_' + Date.now();
                const ts = getCurrentISOString ? getCurrentISOString() : new Date().toISOString();
                db.prepare('INSERT INTO loyalty_logs (id, customerId, orderId, pointsChanged, note, timestamp) VALUES (?, ?, ?, ?, ?, ?)')
                  .run(logId, customer.id, null, -pointsToDeduct, `Đổi thưởng: ${voucherDetails.title}`, ts);

                // Create Voucher
                const vouchId = 'vouch_' + Date.now();
                const code = voucherDetails.code || `RW${Date.now().toString().slice(-6)}`;
                db.prepare(`INSERT INTO customer_vouchers (id, customerId, promotionId, code, status, acquiredAt, expiresAt)
                            VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)`).run(
                    vouchId, customer.id, voucherDetails.promotionId || null, code, ts, voucherDetails.expiresAt || null
                );
            })();
            res.json({ success: true, message: 'Đổi thưởng thành công!' });
        } catch (e) {
            log(`[LOYALTY ERROR] Redeeming points for ${phone}: ${e.message}`);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // 4. Update customer points after an order (Internal use mostly, but exposed for Admin edits)
    router.post('/admin/customers/:id/adjust-points', (req, res) => {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
        const token = authHeader.substring(7);
        const user = activeTokens.get(token);
        if (!user || user.role !== 'ADMIN') return res.status(403).json({ success: false, message: 'Chỉ Quản lý mới được phép' });

        const { id } = req.params;
        const { points, reason } = req.body;
        
        try {
            db.transaction(() => {
                const cust = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
                if (!cust) throw new Error('Customer not found');

                db.prepare('UPDATE customers SET points = points + ? WHERE id = ?').run(points, id);
                
                const ts = getCurrentISOString ? getCurrentISOString() : new Date().toISOString();
                db.prepare('INSERT INTO loyalty_logs (id, customerId, orderId, pointsChanged, note, timestamp) VALUES (?, ?, ?, ?, ?, ?)')
                  .run('log_' + Date.now(), id, null, points, `Điều chỉnh admin: ${reason}`, ts);
            })();
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // 4b. Tối ưu: Admin cập nhật trực tiếp tên khách hàng
    router.put('/admin/customers/:id', (req, res) => {
        const { id } = req.params;
        const { name } = req.body;
        if (!name) return res.status(400).json({ success: false, message: 'Tên không được trống' });
        try {
            db.prepare('UPDATE customers SET name = ? WHERE id = ?').run(name, id);
            res.json({ success: true, message: 'Cập nhật tên thành công' });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // 5. Get all customers for Admin Dashboard (kèm visitsThisWeek)
    router.get('/admin/customers', (req, res) => {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
        const token = authHeader.substring(7);
        const user = activeTokens.get(token);
        if (!user || user.role !== 'ADMIN') return res.status(403).json({ success: false, message: 'Chỉ Quản lý mới được phép' });

        try {
            const customers = db.prepare('SELECT * FROM customers ORDER BY visits DESC').all();
            // Tính visitsThisWeek từ bảng orders (7 ngày vừa qua)
            const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
            const weeklyWithPhone = db.prepare(`
                SELECT COUNT(*) as cnt FROM orders 
                WHERE (customerId = ? OR customerId = ?) 
                  AND (status IN ('PAID','COMPLETED') OR isPaid = 1) 
                  AND timestamp >= ?
            `);
            // Cho khách name-only: fallback tìm theo customerName (đơn cũ chưa link)
            const weeklyNameOnly = db.prepare(`
                SELECT COUNT(*) as cnt FROM orders 
                WHERE (
                    customerId = ?
                    OR (customerName = ? COLLATE NOCASE AND (customerId IS NULL OR customerId = '' OR customerId NOT LIKE 'cust_%'))
                )
                  AND (status IN ('PAID','COMPLETED') OR isPaid = 1) 
                  AND timestamp >= ?
            `);
            const enriched = customers.map(c => ({
                ...c,
                visitsThisWeek: c.phone
                    ? (weeklyWithPhone.get(c.id, c.phone, weekAgo) || { cnt: 0 }).cnt
                    : (weeklyNameOnly.get(c.id, c.name, weekAgo) || { cnt: 0 }).cnt,
            }));
            res.json({ success: true, customers: enriched });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });


    // 5b. Get loyalty log history for a specific customer
    router.get('/admin/customers/:id/logs', (req, res) => {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
        const token = authHeader.substring(7);
        const user = activeTokens.get(token);
        if (!user || user.role !== 'ADMIN') return res.status(403).json({ success: false, message: 'Chỉ Quản lý mới được phép' });

        try {
            const logs = db.prepare('SELECT * FROM loyalty_logs WHERE customerId = ? ORDER BY timestamp DESC LIMIT 50').all(req.params.id);
            res.json({ success: true, logs });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // 5c-new. Phân tích hành vi khách hàng (Customer Behavior Analysis)
    router.get('/admin/customers/:id/analysis', (req, res) => {
        try {
            const cust = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
            if (!cust) return res.status(404).json({ success: false, message: 'Không tìm thấy khách hàng' });

            // Lấy toàn bộ orders của khách — match theo id, phone (dữ liệu cũ) và customerName (fallback cho name-only)
            // Khách name-only (phone=null): thêm fallback match theo customerName để hiển thị đơn trước khi có auto-link
            let orders;
            if (!cust.phone) {
                // Khách chưa có SĐT: ưu tiên match id, fallback thêm customerName chính xác
                orders = db.prepare(`
                    SELECT id, timestamp, price, cartItems, itemName 
                    FROM orders 
                    WHERE (
                        customerId = ?
                        OR (customerName = ? COLLATE NOCASE AND (customerId IS NULL OR customerId = '' OR customerId NOT LIKE 'cust_%'))
                    )
                      AND (status IN ('PAID','COMPLETED') OR isPaid = 1)
                    ORDER BY timestamp DESC
                `).all(cust.id, cust.name);
            } else {
                // Khách có SĐT: match theo id hoặc phone (tương thích dữ liệu cũ)
                orders = db.prepare(`
                    SELECT id, timestamp, price, cartItems, itemName 
                    FROM orders 
                    WHERE (customerId = ? OR customerId = ?)
                      AND (status IN ('PAID','COMPLETED') OR isPaid = 1)
                    ORDER BY timestamp DESC
                `).all(cust.id, cust.phone);
            }

            // ---- Phân tích giờ ghé ----
            const hourCount = {};
            const itemCount = {};
            let totalItems = 0;

            orders.forEach(o => {
                // Hour buckets
                const ts = o.timestamp ? new Date(o.timestamp) : null;
                if (ts) {
                    const h = ts.getHours();
                    const bucket = h < 10 ? 'Sáng (7-10h)' : h < 12 ? 'Trưa (10-12h)' : h < 14 ? 'Trưa muộn (12-14h)' : h < 17 ? 'Chiều (14-17h)' : h < 20 ? 'Tối (17-20h)' : 'Khuya (>20h)';
                    hourCount[bucket] = (hourCount[bucket] || 0) + 1;
                }

                // Item count from cartItems
                try {
                    const cart = typeof o.cartItems === 'string' ? JSON.parse(o.cartItems) : (o.cartItems || []);
                    cart.forEach(c => {
                        const name = c.item?.name || c.name || 'Không rõ';
                        const qty  = c.count || c.quantity || 1;
                        itemCount[name] = (itemCount[name] || 0) + qty;
                        totalItems += qty;
                    });
                } catch { /* ignore parse error */ }
            });

            // Top 5 món yêu thích
            const topItems = Object.entries(itemCount)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([name, count]) => ({ name, count }));

            // Top khung giờ
            const peakHours = Object.entries(hourCount)
                .sort((a, b) => b[1] - a[1])
                .map(([bucket, count]) => ({ bucket, count }));

            // Churn Risk
            let daysSinceLastVisit = null;
            let churnRisk = 'low';
            if (cust.lastVisit) {
                const diff = (Date.now() - new Date(cust.lastVisit).getTime()) / 86400000;
                daysSinceLastVisit = Math.round(diff);
                if (diff > 30) churnRisk = 'high';
                else if (diff > 15) churnRisk = 'medium';
            }

            const avgItemsPerVisit = orders.length > 0 ? (totalItems / orders.length).toFixed(1) : 0;

            // Số lần ghé trong tuần và tháng này
            const weekAgo  = new Date(Date.now() - 7  * 86400000).toISOString();
            const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString();
            const visitsThisWeek  = orders.filter(o => o.timestamp >= weekAgo).length;
            const visitsThisMonth = orders.filter(o => o.timestamp >= monthAgo).length;

            res.json({
                success: true,
                analysis: {
                    totalOrders: orders.length,
                    visitsThisWeek,
                    visitsThisMonth,
                    avgItemsPerVisit: parseFloat(avgItemsPerVisit),
                    avgSpendPerVisit: orders.length > 0 ? Math.round((cust.totalSpent || 0) / orders.length) : 0,
                    topItems,
                    peakHours,
                    daysSinceLastVisit,
                    churnRisk,
                    lastVisit: cust.lastVisit,
                }
            });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // 5d-new. Tạo Voucher tri ân để gửi cho khách
    router.post('/admin/customers/:id/send-voucher', (req, res) => {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
        const token = authHeader.substring(7);
        const user = activeTokens.get(token);
        if (!user || user.role !== 'ADMIN') return res.status(403).json({ success: false, message: 'Chỉ Quản lý mới được phép' });

        try {
            const cust = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
            if (!cust) return res.status(404).json({ success: false });

            const {
                discountType = 'PERCENT',
                discountValue = 20,
                expiryDays = 14,
                reason = 'Tri ân khách hàng',
                minOrderValue = 0,
            } = req.body;

            // Tạo mã code duy nhất (dạng TRIXXX cho dễ đọc trên hóa đơn)
            const code = `TRI${Math.random().toString(36).toUpperCase().slice(2, 7)}`;
            const ts = getCurrentISOString ? getCurrentISOString() : new Date().toISOString();
            const expiresAt = new Date(Date.now() + expiryDays * 86400000).toISOString().split('T')[0];
            const promoId = 'promo_voucher_' + Date.now();

            // Xây dựng full promo object — cùng cấu trúc với tab Khuyến Mãi
            const promoObj = {
                id: promoId,
                name: `Voucher ${code}`,
                description: `${reason} — Dành riêng cho ${cust.name}`,
                type: 'PROMO_CODE',
                code,
                discountType,
                discountValue,
                minOrderValue: minOrderValue || 0,
                maxDiscount: 0,
                applicableItems: ['ALL'],
                isActive: true,
                singleUse: true,
                specificPhone: cust.phone || null,
                specificCustomerId: cust.id,
                startDate: ts.split('T')[0],
                endDate: expiresAt,
                ignoreGlobalDisable: true,  // Voucher cá nhân luôn hiệu lực
                createdAt: ts,
            };

            // Lưu vào DB (toàn bộ trong field data — khớp cách server.cjs load)
            db.prepare(`INSERT INTO promotions (id, name, description, isActive, data) VALUES (?, ?, ?, 1, ?)`)
              .run(promoId, promoObj.name, promoObj.description, JSON.stringify(promoObj));

            // Reload in-memory promotions ngay lập tức
            if (reloadPromotions) reloadPromotions();

            // Ghi loyalty log
            db.prepare('INSERT INTO loyalty_logs (id, customerId, orderId, pointsChanged, note, timestamp) VALUES (?, ?, ?, ?, ?, ?)')
              .run('log_' + Date.now(), cust.id, null, 0,
                  `Nhận Voucher tri ân: ${code} (${discountValue}${discountType === 'PERCENT' ? '%' : 'k'} giảm)`, ts);

            res.json({ success: true, code, discountType, discountValue, expiresAt, phone: cust.phone, name: cust.name, promoId });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });




    // 5c. Admin manually register a customer
    router.post('/admin/register', (req, res) => {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
        const token = authHeader.substring(7);
        const user = activeTokens.get(token);
        if (!user || user.role !== 'ADMIN') return res.status(403).json({ success: false, message: 'Chỉ Quản lý mới được phép' });

        const { phone, name } = req.body;
        if (!phone || !name) return res.status(400).json({ success: false, message: 'Thiếu SĐT hoặc Tên' });

        try {
            const exists = db.prepare('SELECT * FROM customers WHERE phone = ?').get(phone);
            if (exists) return res.status(400).json({ success: false, message: 'Số điện thoại đã tồn tại trong hệ thống' });

            const id = 'cust_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
            const ts = getCurrentISOString ? getCurrentISOString() : new Date().toISOString();
            db.prepare(`INSERT INTO customers (id, phone, name, points, tier, totalSpent, visits, joinedAt, lastVisit) VALUES (?, ?, ?, 0, 'Bạc', 0, 0, ?, ?)`).run(id, phone, name, ts, ts);
            const newCustomer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
            res.json({ success: true, customer: newCustomer });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });


    // 6. Public: Get loyalty logs by phone (for /loyalty page — no auth, customer-facing)
    router.get('/customer/:phone/logs', (req, res) => {
        try {
            const customer = db.prepare('SELECT * FROM customers WHERE phone = ?').get(req.params.phone);
            if (!customer) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
            const logs = db.prepare('SELECT * FROM loyalty_logs WHERE customerId = ? ORDER BY timestamp DESC LIMIT 30').all(customer.id);
            res.json({ success: true, logs });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // 7. Provide tier details info for Kiosk
    router.get('/config', (req, res) => {
        res.json({ success: true, configs: TIER_THRESHOLDS, pointRate: 0.0001 }); // 10,000đ = 1đ
    });

    // ─── 8. Weekly Orders của 1 khách — dùng cho Calendar Drinking Schedule ───
    // GET /api/loyalty/admin/customers/:id/weekly-orders?weekStart=YYYY-MM-DD
    router.get('/admin/customers/:id/weekly-orders', (req, res) => {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ success: false });
        const token = authHeader.substring(7);
        const user = activeTokens.get(token);
        if (!user || user.role !== 'ADMIN') return res.status(403).json({ success: false, message: 'Chỉ Quản lý mới được phép' });

        try {
            const cust = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
            if (!cust) return res.status(404).json({ success: false, message: 'Không tìm thấy khách hàng' });

            // Xác định dải thời gian: weekStart (Monday) → weekStart+6 days (Sunday)
            const { weekStart } = req.query;
            let startDate, endDate;
            if (weekStart && /^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
                startDate = new Date(weekStart + 'T00:00:00.000Z');
            } else {
                // Fallback: tuần hiện tại (Monday VN time)
                const now = new Date();
                const day = now.getDay(); // 0=CN, 1=T2...
                const diff = (day === 0) ? -6 : 1 - day;
                startDate = new Date(now);
                startDate.setDate(now.getDate() + diff);
                startDate.setHours(0, 0, 0, 0);
            }
            endDate = new Date(startDate.getTime() + 7 * 86400000); // +7 ngày

            const startISO = startDate.toISOString();
            const endISO = endDate.toISOString();

            // Query đơn hàng trong tuần — match theo customerId hoặc fallback name-only
            let orders;
            if (!cust.phone) {
                orders = db.prepare(`
                    SELECT id, timestamp, price, cartItems, customerName, status
                    FROM orders
                    WHERE (
                        customerId = ?
                        OR (customerName = ? COLLATE NOCASE AND (customerId IS NULL OR customerId = '' OR customerId NOT LIKE 'cust_%'))
                    )
                    AND (status IN ('PAID','COMPLETED') OR isPaid = 1)
                    AND timestamp >= ? AND timestamp < ?
                    ORDER BY timestamp ASC
                `).all(cust.id, cust.name, startISO, endISO);
            } else {
                orders = db.prepare(`
                    SELECT id, timestamp, price, cartItems, customerName, status
                    FROM orders
                    WHERE (customerId = ? OR customerId = ?)
                    AND (status IN ('PAID','COMPLETED') OR isPaid = 1)
                    AND timestamp >= ? AND timestamp < ?
                    ORDER BY timestamp ASC
                `).all(cust.id, cust.phone, startISO, endISO);
            }

            // Enrich mỗi đơn với thông tin giờ và thứ trong tuần (1=T2...7=CN)
            const enriched = orders.map(o => {
                const ts = o.timestamp ? new Date(o.timestamp) : null;
                // Tính giờ VN (UTC+7)
                const hourVN = ts ? ((ts.getUTCHours() + 7) % 24) : null;
                // Tính ngày trong tuần VN: getDay() trả 0=CN,1=T2...6=T7
                const localDate = ts ? new Date(ts.getTime() + 7 * 3600000) : null;
                const rawDay = localDate ? localDate.getUTCDay() : null; // 0=CN...6=T7
                // Chuẩn hoá: T2=1, T3=2, ..., T7=6, CN=7
                const dayOfWeek = rawDay === null ? null : (rawDay === 0 ? 7 : rawDay);

                // Parse cartItems để lấy danh sách món
                let items = [];
                try {
                    const cart = typeof o.cartItems === 'string' ? JSON.parse(o.cartItems) : (o.cartItems || []);
                    items = cart.map(c => ({
                        name: c.item?.name || c.name || 'Không rõ',
                        count: c.count || 1,
                        size: c.size?.label || null,
                    }));
                } catch { /* ignore */ }

                return {
                    orderId: o.id,
                    timestamp: o.timestamp,
                    price: o.price || 0,
                    hour: hourVN,
                    dayOfWeek,   // 1=T2...7=CN
                    items,
                };
            });

            res.json({ success: true, orders: enriched, weekStart: startISO, weekEnd: endISO });
        } catch (e) {
            log(`[LOYALTY ERROR] weekly-orders: ${e.message}`);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // ─── 9. Store Heatmap — giờ cao điểm TOÀN QUÁN trong 1 tuần ───────────
    // GET /api/loyalty/admin/store-heatmap?weekStart=YYYY-MM-DD
    router.get('/admin/store-heatmap', (req, res) => {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ success: false });
        const token = authHeader.substring(7);
        const user = activeTokens.get(token);
        if (!user || user.role !== 'ADMIN') return res.status(403).json({ success: false, message: 'Chỉ Quản lý mới được phép' });

        try {
            const { weekStart } = req.query;
            let startDate;
            if (weekStart && /^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
                startDate = new Date(weekStart + 'T00:00:00.000Z');
            } else {
                const now = new Date();
                const day = now.getDay();
                const diff = (day === 0) ? -6 : 1 - day;
                startDate = new Date(now);
                startDate.setDate(now.getDate() + diff);
                startDate.setHours(0, 0, 0, 0);
            }
            const endDate = new Date(startDate.getTime() + 7 * 86400000);
            const startISO = startDate.toISOString();
            const endISO = endDate.toISOString();

            // Lấy TẤT CẢ đơn hàng hoàn thành trong tuần
            const allOrders = db.prepare(`
                SELECT timestamp FROM orders
                WHERE (status IN ('PAID','COMPLETED') OR isPaid = 1)
                AND timestamp >= ? AND timestamp < ?
            `).all(startISO, endISO);

            // Group by (dayOfWeek, hour) — key = "dayIndex-hour"
            const heatmap = {}; // { "1-6": 12, "1-7": 8, ... }
            const hourTotal = {}; // { 6: 12, 7: 8, ... } — tổng theo giờ (không phân ngày)

            allOrders.forEach(o => {
                if (!o.timestamp) return;
                const ts = new Date(o.timestamp);
                const localTs = new Date(ts.getTime() + 7 * 3600000);
                const hourVN = localTs.getUTCHours();
                const rawDay = localTs.getUTCDay(); // 0=CN...6=T7
                const dayOfWeek = rawDay === 0 ? 7 : rawDay; // 1=T2...7=CN

                const cellKey = `${dayOfWeek}-${hourVN}`;
                heatmap[cellKey] = (heatmap[cellKey] || 0) + 1;

                hourTotal[hourVN] = (hourTotal[hourVN] || 0) + 1;
            });

            res.json({
                success: true,
                heatmap,
                hourTotal,
                weekStart: startISO,
                weekEnd: endISO,
            });
        } catch (e) {
            log(`[LOYALTY ERROR] store-heatmap: ${e.message}`);
            res.status(500).json({ success: false, error: e.message });
        }
    });


    return router;
};
