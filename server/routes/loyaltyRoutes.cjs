module.exports = function(context) {
    const router = require('express').Router();
    const { db, activeTokens, log, getCurrentISOString, reloadPromotions, otpService, getSettings } = context;

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

    // ── Auth helpers ──────────────────────────────────────────────────────────
    const getUser = (req) => {
        const h = req.headers.authorization;
        if (!h || !h.startsWith('Bearer ')) return null;
        return activeTokens.get(h.substring(7)) || null;
    };
    const getPerms = (user) => {
        let p = user?.permissions;
        if (typeof p === 'string') { try { p = JSON.parse(p); } catch { p = {}; } }
        return p || {};
    };
    // ADMIN hoặc nhân viên có customers >= view
    const canViewCustomers = (user) => {
        if (!user) return false;
        if (user.role === 'ADMIN') return true;
        const p = getPerms(user).customers;
        return p === 'view' || p === 'edit';
    };
    // ADMIN hoặc nhân viên có customers = edit
    const canEditCustomers = (user) => {
        if (!user) return false;
        if (user.role === 'ADMIN') return true;
        return getPerms(user).customers === 'edit';
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

    // 1. Get customer by phone — 3-tier lookup (c\u1ea7n ph\u00f2ng sai format S\u0110T trong DB)
    router.get('/customer/:phone', (req, res) => {
        const rawPhone = req.params.phone;
        // Chu\u1ea9n ho\u00e1: xo\u00e1 t\u1ea5t c\u1ea3 d\u1ea5u ph\u1ea9y, kho\u1ea3ng tr\u1eafng, g\u1ea1ch n\u1ed1i
        const normalizedPhone = rawPhone.replace(/[\s\-\.\,]/g, '');
        try {
            // Tier 1: Exact match
            let customer = db.prepare('SELECT * FROM customers WHERE phone = ?').get(rawPhone);
            if (!customer) {
                // Tier 2: Exact match v\u1edbi phone \u0111\u00e3 normalize
                customer = db.prepare('SELECT * FROM customers WHERE phone = ?').get(normalizedPhone);
            }
            if (!customer) {
                // Tier 3: SQL REPLACE \u2014 x\u1eed l\u00fd DB c\u0169 c\u00f3 spaces trong phone
                customer = db.prepare(
                    "SELECT * FROM customers WHERE REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '.', '') = ?"
                ).get(normalizedPhone);
            }
            log(`[LOYALTY] Lookup "${rawPhone}" (normalized: "${normalizedPhone}") \u2192 ${customer ? `FOUND: ${customer.name}` : 'NOT FOUND'}`);
            if (customer) {
                const vouchers = db.prepare(`SELECT * FROM customer_vouchers WHERE customerId = ? AND status = 'ACTIVE'`).all(customer.id);
                res.json({ success: true, customer, vouchers });
            } else {
                res.status(404).json({ success: false, message: 'Kh\u00f4ng t\u00ecm th\u1ea5y kh\u00e1ch h\u00e0ng' });
            }
        } catch (e) {
            log(`[LOYALTY ERROR] Fetching customer "${rawPhone}": ${e.message}`);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // 1b. Get active LOYALTY_REWARD promotions (public — dùng trên trang điểm khách)
    router.get('/rewards', (req, res) => {
        try {
            const today = new Date().toISOString().slice(0, 10);
            const rows = db.prepare(`SELECT * FROM promotions WHERE isActive = 1`).all();
            const rewards = rows
                .map(r => {
                    try { return { ...r, ...JSON.parse(r.data || '{}') }; } catch { return r; }
                })
                .filter(r => r.type === 'LOYALTY_REWARD' && r.pointsCost > 0
                    && (!r.startDate || r.startDate <= today)
                    && (!r.endDate || r.endDate >= today)
                )
                .map(r => {
                    // Nếu có linkedPromoId, tìm promo đó để hiển thị thêm chi tiết
                    let linkedPromoLabel = null;
                    if (r.linkedPromoId) {
                        const lp = db.prepare('SELECT * FROM promotions WHERE id = ?').get(r.linkedPromoId);
                        if (lp) {
                            let lpData = {};
                            try { lpData = JSON.parse(lp.data || '{}'); } catch {}
                            const dt = lpData.discountType || lp.discountType;
                            const dv = lpData.discountValue ?? lp.discountValue;
                            linkedPromoLabel = dt === 'PERCENT'
                                ? `Giảm ${dv}%`
                                : dt === 'AMOUNT' ? `Trừ ${dv}k` : lp.name;
                        }
                    }
                    return {
                        id: r.id,
                        name: r.name,
                        rewardIcon: r.rewardIcon || '🎁',
                        rewardDesc: r.rewardDesc || '',
                        pointsCost: r.pointsCost,
                        minTier: r.minTier || '',
                        startDate: r.startDate,
                        endDate: r.endDate,
                        linkedPromoId: r.linkedPromoId || null,
                        linkedPromoLabel,
                    };
                });
            res.json({ success: true, rewards });
        } catch (e) {
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

    // ─── 2d. Khách TỰ đổi điểm lấy voucher ──────────────────────────────────
    // POST /api/loyalty/self-redeem   { phone, rewardId }
    router.post('/self-redeem', (req, res) => {
        const { phone, rewardId } = req.body;
        if (!phone || !rewardId) return res.status(400).json({ success: false, message: 'Thiếu SĐT hoặc phần quà' });

        try {
            const customer = db.prepare('SELECT * FROM customers WHERE phone = ?').get(phone);
            if (!customer) return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản thành viên' });

            // Lấy reward từ promotions (type = LOYALTY_REWARD)
            const promoRow = db.prepare('SELECT * FROM promotions WHERE id = ? AND isActive = 1').get(rewardId);
            if (!promoRow) return res.status(404).json({ success: false, message: 'Phần quà không tồn tại hoặc đã hết hạn' });

            let rewardData = {};
            try { rewardData = JSON.parse(promoRow.data || '{}'); } catch {}
            if (rewardData.type !== 'LOYALTY_REWARD') return res.status(400).json({ success: false, message: 'Không phải phần quà đổi điểm' });

            const pointsCost = rewardData.pointsCost || 0;
            if (pointsCost <= 0) return res.status(400).json({ success: false, message: 'Phần quà không hợp lệ' });
            if (customer.points < pointsCost) {
                return res.status(400).json({ success: false, message: `Không đủ điểm. Cần ${pointsCost} điểm, bạn có ${customer.points} điểm.` });
            }

            // Kiểm tra minTier nếu có
            const TIER_ORDER = { 'Bạc': 1, 'Vàng': 2, 'Kim Cương': 3 };
            if (rewardData.minTier && (TIER_ORDER[customer.tier] || 0) < (TIER_ORDER[rewardData.minTier] || 0)) {
                return res.status(400).json({ success: false, message: `Phần quà này yêu cầu hạng ${rewardData.minTier} trở lên` });
            }

            let voucherCode = null;
            const ts = getCurrentISOString ? getCurrentISOString() : new Date().toISOString();

            db.transaction(() => {
                // Trừ điểm
                db.prepare('UPDATE customers SET points = points - ? WHERE id = ?').run(pointsCost, customer.id);

                // Tạo mã voucher duy nhất
                const code = `LYL-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
                voucherCode = code;

                // Thời hạn: 30 ngày mặc định
                const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

                // Lưu voucher vào DB
                const vouchId = 'vouch_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
                db.prepare(`INSERT INTO customer_vouchers (id, customerId, promotionId, code, status, acquiredAt, expiresAt)
                            VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)`)
                  .run(vouchId, customer.id, rewardData.linkedPromoId || rewardId, code, ts, expiresAt);

                // Ghi log
                db.prepare('INSERT INTO loyalty_logs (id, customerId, orderId, pointsChanged, note, timestamp) VALUES (?, ?, ?, ?, ?, ?)')
                  .run('log_' + Date.now(), customer.id, null, -pointsCost, `[Khách tự đổi] ${promoRow.name}`, ts);
            })();

            log(`[LOYALTY] Khách ${customer.name} (${phone}) tự đổi "${promoRow.name}" = -${pointsCost}đ → Voucher: ${voucherCode}`);
            res.json({
                success: true,
                voucherCode,
                rewardName: promoRow.name,
                pointsDeducted: pointsCost,
                expiresAt: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
                message: `Đổi thành công! Mã voucher của bạn: ${voucherCode}`,
            });
        } catch (e) {
            log(`[LOYALTY ERROR] self-redeem: ${e.message}`);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // ─── 2e. Lấy danh sách voucher ACTIVE của khách ──────────────────────────
    // GET /api/loyalty/my-vouchers/:phone
    router.get('/my-vouchers/:phone', (req, res) => {
        const { phone } = req.params;
        if (!phone) return res.status(400).json({ success: false });
        try {
            const customer = db.prepare('SELECT id FROM customers WHERE phone = ?').get(phone);
            if (!customer) return res.json({ success: true, vouchers: [] });

            const vouchers = db.prepare(`
                SELECT cv.*, p.name as promoName, p.data as promoData
                FROM customer_vouchers cv
                LEFT JOIN promotions p ON p.id = cv.promotionId
                WHERE cv.customerId = ? AND cv.status = 'ACTIVE'
                  AND (cv.expiresAt IS NULL OR cv.expiresAt >= date('now'))
                ORDER BY cv.acquiredAt DESC
            `).all(customer.id);

            const enriched = vouchers.map(v => {
                let pd = {};
                try { pd = JSON.parse(v.promoData || '{}'); } catch {}
                const dt = pd.discountType || v.discountType;
                const dv = pd.discountValue ?? v.discountValue;
                return {
                    id: v.id,
                    code: v.code,
                    promoName: v.promoName,
                    description: dt === 'PERCENT' ? `Giảm ${dv}%` : dt === 'AMOUNT' ? `Trừ ${dv.toLocaleString('vi-VN')}đ` : 'Phần quà đặc biệt',
                    acquiredAt: v.acquiredAt,
                    expiresAt: v.expiresAt,
                };
            });
            res.json({ success: true, vouchers: enriched });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // ─── OTP Routes ─────────────────────────────────────────────────────────────

    // 2f. Kiểm tra trạng thái OTP (Zalo/Telegram đã cấu hình chưa, Telegram đã link chưa)
    // GET /api/loyalty/otp/status/:phone
    router.get('/otp/status/:phone', (req, res) => {
        const { phone } = req.params;
        const settings = getSettings ? getSettings() : {};
        const provider = settings?.otpProvider || 'none';
        const otpEnabled = provider !== 'none';

        log(`[OTP] Status check — phone: ${phone}, provider: ${provider}, enabled: ${otpEnabled}`);

        let telegramLinked = false;
        if (provider === 'telegram' && otpService?.checkTelegramLinked) {
            telegramLinked = otpService.checkTelegramLinked(phone);
        }

        const telegramBotUsername = settings?.telegramBotUsername || '';

        res.json({
            success: true,
            otpEnabled,
            provider,              // 'zalo' | 'telegram' | 'console' | 'none'
            telegramLinked,        // Telegram: đã link SĐT chưa
            telegramBotUsername,   // để tạo deep link t.me/...
        });
    });

    // 2g. Yêu cầu gửi OTP
    // POST /api/loyalty/otp/request   { phone }
    router.post('/otp/request', async (req, res) => {
        const { phone } = req.body;
        if (!phone) return res.status(400).json({ success: false, message: 'Thiếu SĐT' });

        const customer = db.prepare('SELECT * FROM customers WHERE phone = ?').get(phone);
        if (!customer) return res.status(404).json({ success: false, message: 'Không tìm thấy thành viên với SĐT này' });

        if (!otpService) return res.status(503).json({ success: false, message: 'Dịch vụ OTP chưa được cấu hình' });

        try {
            const result = await otpService.sendOTP(phone);
            if (result.ok) {
                const settings = getSettings ? getSettings() : {};
                const resp = { success: true, message: 'Đã gửi OTP' };
                // Dev mode: trả về OTP để test (chỉ khi provider = console)
                if (settings?.otpProvider === 'console' && result.devOtp) {
                    resp.devOtp = result.devOtp;
                }
                return res.json(resp);
            } else {
                return res.status(400).json({ success: false, message: result.reason });
            }
        } catch (e) {
            log(`[OTP ERROR] ${e.message}`);
            return res.status(500).json({ success: false, error: e.message });
        }
    });

    // 2h. Xác minh OTP
    // POST /api/loyalty/otp/verify   { phone, otp }
    router.post('/otp/verify', (req, res) => {
        const { phone, otp } = req.body;
        if (!phone || !otp) return res.status(400).json({ success: false, message: 'Thiếu thông tin' });

        if (!otpService) return res.status(503).json({ success: false, message: 'OTP chưa cấu hình' });

        const result = otpService.verifyOTP(phone, otp);
        if (result.ok) {
            // Tạo session token để dùng cho self-redeem (nếu cần)
            const sessionToken = `OTP-${Math.random().toString(36).substring(2, 12).toUpperCase()}`;
            // Store in a simple map (5 phút)
            if (!context.otpSessions) context.otpSessions = new Map();
            context.otpSessions.set(sessionToken, { phone, expiresAt: Date.now() + 5 * 60 * 1000 });
            return res.json({ success: true, sessionToken, message: 'Xác thực thành công' });
        } else {
            return res.status(400).json({ success: false, message: result.reason });
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
        if (!canEditCustomers(getUser(req))) return res.status(403).json({ success: false, message: 'Chỉ Quản lý' });

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
        if (!user) return res.status(401).json({ success: false, message: 'Phiên đăng nhập hết hạn' });
        // Cho phép ADMIN và nhân viên có quyền customers:edit trở lên
        let permsObj = user.permissions;
        if (typeof permsObj === 'string') { try { permsObj = JSON.parse(permsObj); } catch { permsObj = {}; } }
        const canAct = user.role === 'ADMIN' || (permsObj && permsObj.customers === 'edit');
        if (!canAct) return res.status(403).json({ success: false, message: 'Không có quyền đổi điểm. Vui lòng liên hệ quản lý.' });

        const { id } = req.params;
        const { points, reason, linkedPromoId } = req.body;

        // [SECURITY] STAFF chỉ được đổi điểm (trừ điểm, points < 0)
        // Chỉ ADMIN mới được THÊM điểm thủ công
        if (user.role !== 'ADMIN' && Number(points) > 0) {
            return res.status(403).json({ success: false, message: 'Nhân viên không được cộng điểm thủ công. Điểm được tự động tích qua đơn hàng.' });
        }
        
        try {
            let voucherCode = null;
            const actorName = user.name || 'Nhân viên';

            db.transaction(() => {
                const cust = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
                if (!cust) throw new Error('Customer not found');

                db.prepare('UPDATE customers SET points = points + ? WHERE id = ?').run(points, id);
                
                const ts = getCurrentISOString ? getCurrentISOString() : new Date().toISOString();
                // Ghi log kèm tên người thực hiện để audit
                db.prepare('INSERT INTO loyalty_logs (id, customerId, orderId, pointsChanged, note, timestamp) VALUES (?, ?, ?, ?, ?, ?)')
                  .run('log_' + Date.now(), id, null, points, `[${actorName}] ${reason || 'Đổi quà'}`, ts);

                // Nếu có linkedPromoId → tạo voucher single-use từ promo đó
                if (linkedPromoId && points < 0) {
                    const promo = db.prepare('SELECT * FROM promotions WHERE id = ?').get(linkedPromoId);
                    if (promo) {
                        let promoData = {};
                        try { promoData = JSON.parse(promo.data || '{}'); } catch {}
                        // Tạo mã unique 6 ký tự
                        const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
                        voucherCode = `LYL${rand}`;
                        const vid = 'vchr_' + Date.now();
                        const expiresAt = (() => {
                            const d = new Date();
                            d.setDate(d.getDate() + 30); // hết hạn 30 ngày
                            return d.toISOString().slice(0, 10);
                        })();
                        // Lưu voucher với code riêng (không phải code gốc của promo)
                        db.prepare(`
                            INSERT INTO customer_vouchers (id, customerId, promotionId, code, status, acquiredAt, usedAt, expiresAt)
                            VALUES (?, ?, ?, ?, 'ACTIVE', ?, NULL, ?)
                        `).run(vid, id, linkedPromoId, voucherCode, ts, expiresAt);
                    }
                }
            })();
            res.json({ success: true, voucherCode });
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
        const user = getUser(req);
        if (!canViewCustomers(user)) return res.status(403).json({ success: false, message: 'Không có quyền xem khách hàng' });

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
        const user = getUser(req);
        if (!canViewCustomers(user)) return res.status(403).json({ success: false, message: 'Không có quyền' });
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
        const user = getUser(req);
        if (!canViewCustomers(user)) return res.status(403).json({ success: false, message: 'Không có quyền' });

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
        const user = getUser(req);
        if (!canEditCustomers(user)) return res.status(403).json({ success: false, message: 'Không có quyền' });

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
        const normalizedPhone = req.params.phone.replace(/[\s\-\.]/g, '');
        try {
            const customer = db.prepare(
                "SELECT * FROM customers WHERE REPLACE(REPLACE(phone, ' ', ''), '-', '') = ?"
            ).get(normalizedPhone);
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
        const user = getUser(req);
        if (!canViewCustomers(user)) return res.status(403).json({ success: false, message: 'Không có quyền' });

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
        const user = getUser(req);
        if (!canViewCustomers(user)) return res.status(403).json({ success: false, message: 'Không có quyền' });

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


    // 10. Tra tên khách từ lịch sử đơn hàng theo SĐT (public — không cần loyalty member)
    // Dùng khi khách nhập SĐT nhưng chưa có thẻ thành viên
    router.get('/lookup-by-phone/:phone', (req, res) => {
        const rawPhone = req.params.phone;
        const normalizedPhone = rawPhone.replace(/[\s\-\.]/g, '');
        if (!normalizedPhone || normalizedPhone.length < 9) return res.status(400).json({ success: false });
        try {
            // Tìm đơn gần nhất, thử cả SĐT raw lẫn normalized (tương thích dữ liệu cũ)
            const order = db.prepare(`
                SELECT customerName FROM orders
                WHERE (customerId = ? OR REPLACE(REPLACE(customerId, ' ', ''), '-', '') = ?)
                  AND customerName IS NOT NULL AND customerName != ''
                ORDER BY timestamp DESC
                LIMIT 1
            `).get(phone);

            if (order?.customerName) {
                res.json({ success: true, name: order.customerName });
            } else {
                res.json({ success: false, message: 'Kh\u00f4ng t\u00ecm th\u1ea5y \u0111\u01a1n h\u00e0ng n\u00e0o v\u1edbi S\u0110T n\u00e0y' });
            }
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // ─── Fraud Detection Report ─────────────────────────────────────────────
    // GET /api/loyalty/admin/fraud-report
    // Phát hiện pattern bất thường: nhân viên tích điểm cho 1 tài khoản liên tục
    router.get('/admin/fraud-report', (req, res) => {
        const user = getUser(req);
        if (!canViewCustomers(user)) return res.status(403).json({ success: false, message: 'Không có quyền' });

        try {
            // Phân tích loyalty_logs: gom nhóm theo customerId + nhân viên trong note
            const logs = db.prepare(`
                SELECT ll.customerId, ll.note, ll.pointsChanged, ll.timestamp, ll.orderId,
                       c.name as customerName, c.phone as customerPhone, c.points as totalPoints
                FROM loyalty_logs ll
                LEFT JOIN customers c ON c.id = ll.customerId
                WHERE ll.pointsChanged > 0
                ORDER BY ll.timestamp DESC
                LIMIT 1000
            `).all();

            // Gom nhóm: { customerId → { staffName → count } }
            const byCustomer = {};
            logs.forEach(l => {
                if (!byCustomer[l.customerId]) {
                    byCustomer[l.customerId] = {
                        customerId: l.customerId,
                        customerName: l.customerName,
                        customerPhone: l.customerPhone,
                        totalPoints: l.totalPoints,
                        staffCounts: {},
                        totalEarned: 0,
                    };
                }
                // Extract staffName từ note: "Tích điểm đơn #41 [Jazz]" → "Jazz"
                const match = l.note?.match(/\[([^\]]+)\]/);
                const staff = match ? match[1] : 'Hệ thống';
                byCustomer[l.customerId].staffCounts[staff] = (byCustomer[l.customerId].staffCounts[staff] || 0) + 1;
                byCustomer[l.customerId].totalEarned += l.pointsChanged;
            });

            // Flag suspicious: 1 nhân viên chiếm > 80% tổng điểm của 1 tài khoản (và có >= 3 lần)
            const suspicious = Object.values(byCustomer)
                .map(c => {
                    const total = Object.values(c.staffCounts).reduce((s, n) => s + n, 0);
                    const topStaff = Object.entries(c.staffCounts).sort((a, b) => b[1] - a[1])[0];
                    const ratio = topStaff ? topStaff[1] / total : 0;
                    return { ...c, topStaff: topStaff?.[0], topStaffCount: topStaff?.[1], ratio, total };
                })
                .filter(c => c.total >= 3 && c.ratio > 0.8 && c.topStaff && c.topStaff !== 'Hệ thống' && c.topStaff !== 'Khách tự đặt')
                .sort((a, b) => b.ratio - a.ratio);

            res.json({ success: true, suspicious, total: Object.values(byCustomer).length });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    return router;
};
