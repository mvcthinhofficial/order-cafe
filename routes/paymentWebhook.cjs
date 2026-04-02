/**
 * ══════════════════════════════════════════════════════════════════════════════
 * routes/paymentWebhook.cjs
 * Xác nhận Thanh toán Tự động — SePay & MB Bank Open API
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Hỗ trợ 2 chế độ hoạt động:
 *
 * [POLLING] — Không cần URL public
 *   Server tự gọi SePay API mỗi N giây, kiểm tra giao dịch mới.
 *   Hoạt động kể cả với localhost, quick tunnel thay đổi URL, hay mất internet.
 *   → Phù hợp cho hầu hết quán cafe.
 *
 * [WEBHOOK] — Cần URL public (Cloudflare named tunnel / domain riêng)
 *   SePay gửi HTTP POST vào URL của app ngay khi có giao dịch (~1-3 giây).
 *   → Nhanh hơn, nhưng cần URL cố định.
 *
 * Được inject vào server.cjs qua:
 *   require('./routes/paymentWebhook.cjs')(app, { orders, settings, broadcastEvent, db })
 *
 * Docs tham khảo:
 *   SePay API:     https://my.sepay.vn/userapi/transactions/list
 *   SePay Webhook: https://docs.sepay.vn/webhooks/
 *   MB Bank:       https://developer.mbbank.com.vn
 */

'use strict';

const SEPAY_API_BASE = 'https://my.sepay.vn/userapi';

module.exports = function registerPaymentWebhooks(app, { orders, settings, broadcastEvent, db }) {

    // ──────────────────────────────────────────────────────────────────────────
    // HELPERS
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Tìm đơn hàng khớp với giao dịch ngân hàng.
     * Chiến lược 1: Khớp mã đơn trong nội dung CK
     *   - Format chuẩn QR app: "Thanh toan DH TTTTDDMMYY" (TTTT = số thứ tự, DDMMYY = ngày)
     *   - Format QuickPayment: "Don 0001", "SP 0001"
     *   - Fallback: chứa số queueNumber bất kỳ
     * Chiến lược 2: Fallback theo số tiền gần nhất trong cửa sổ thời gian
     */
    function extractQueueFromDH(content) {
        // Khớp pattern "DH TTTTDDMMYY" hoặc "DH TTTT" — trả về số thứ tự (TTTT bỏ số 0 đầu)
        // VD: "DH 000102042026" → "1", "DH 00010204" → "1"
        const m = content.match(/DH\s+(\d{4})\d*/i);
        if (m) return { padded: m[1], num: String(parseInt(m[1], 10)) };
        return null;
    }

    function findMatchingOrder(transferAmount, content = '') {
        const matchWindowMs = (settings.paymentMatchWindow || 30) * 60 * 1000;
        const now = Date.now();
        const normalContent = content.toUpperCase().replace(/\s+/g, ' ').trim();

        // Chấp nhận mọi trạng thái trừ CANCELLED — khách có thể trả trước khi đơn được làm xong
        const candidates = orders.filter(o =>
            o.status !== 'CANCELLED' &&
            !o.isPaid &&
            (now - new Date(o.timestamp).getTime()) < matchWindowMs
        );

        // Chiến lược 1a: Khớp theo "DH TTTTDDMMYY" — format chuẩn QR app
        const dhExtracted = extractQueueFromDH(normalContent);
        if (dhExtracted) {
            const found = candidates.find(o => {
                const qNum = String(o.queueNumber || '');
                const qPadded = qNum.padStart(4, '0');
                return qPadded === dhExtracted.padded || qNum === dhExtracted.num;
            });
            if (found) {
                console.log(`[PAYMENT] Khớp DH format: "${content}" → Đơn #${found.queueNumber}`);
                return found;
            }
        }

        // Chiến lược 1b: Khớp các pattern legacy / QuickPayment
        for (const order of candidates) {
            const qNum = String(order.queueNumber || '');
            const qNumPadded = qNum.padStart(4, '0');
            const patterns = [
                qNumPadded, qNum,
                `DON ${qNumPadded}`, `DON ${qNum}`,
                `SP ${qNumPadded}`, `DH${qNumPadded}`,
                `ORDER ${qNumPadded}`,
            ];
            if (patterns.some(p => normalContent.includes(p))) {
                console.log(`[PAYMENT] Khớp mã đơn #${qNum} từ nội dung: "${content}"`);
                return order;
            }
        }

        // Chiến lược 2: Fallback theo số tiền
        const byAmount = candidates
            .filter(o => Math.abs((o.price || 0) - transferAmount) < 1000)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        if (byAmount[0]) {
            console.log(`[PAYMENT] Khớp theo số tiền ${transferAmount}đ → Đơn #${byAmount[0].queueNumber}`);
        }
        return byAmount[0] || null;
    }

    /**
     * Xác nhận thanh toán: cập nhật memory + SQLite + broadcast SSE
     */
    async function confirmPaymentForOrder(order, source, transactionRef = '') {
        if (settings.autoConfirmPayment === false) return false;

        order.isPaid = true;
        order.paymentConfirmedAt = new Date().toISOString();
        order.paymentSource = source;
        order.paymentRef = transactionRef;

        try {
            db.prepare('UPDATE orders SET isPaid = 1 WHERE id = ?').run(order.id);
        } catch (e) {
            console.error('[PAYMENT] SQLite update thất bại:', e.message);
        }

        broadcastEvent('PAYMENT_CONFIRMED', {
            orderId: order.id,
            queueNumber: order.queueNumber,
            amount: order.price,
            source,
            transactionRef,
            confirmedAt: order.paymentConfirmedAt,
        });

        console.log(`[PAYMENT] ✅ Đơn #${order.queueNumber} (${order.id}) xác nhận qua ${source} | Ref: ${transactionRef}`);
        return true;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // SEPAY POLLING ENGINE
    // ──────────────────────────────────────────────────────────────────────────
    // Cách hoạt động:
    //   1. Server gọi SePay API mỗi N giây (mặc định 10s)
    //   2. Lấy danh sách giao dịch tiền vào trong 30 phút gần nhất
    //   3. Với mỗi GD mới (chưa xử lý), tìm đơn khớp theo mã đơn
    //   4. Nếu khớp → confirmPaymentForOrder → broadcast SSE lên POS
    //
    // Ưu điểm so với Webhook:
    //   ✅ Không cần URL public — chạy được với localhost, quick tunnel
    //   ✅ URL Cloudflare thay đổi cũng không ảnh hưởng
    //   ✅ App tự recover nếu bị mất kết nối tạm thời
    //
    // Nhược điểm so với Webhook:
    //   ⏱ Trễ tối đa = poll interval (mặc định 10s, có thể chỉnh)
    //   📡 Cần kết nối internet liên tục để gọi SePay API

    const processedTxIds = new Set(); // Tránh xử lý trùng giao dịch
    let pollTimer = null;
    let pollStats = {
        lastChecked: null,
        lastError: null,
        txFoundCount: 0,
        confirmedCount: 0,
        isRunning: false,
    };

    async function pollSePayOnce() {
        if (!settings.sePayEnabled) return;
        // sePayMode mặc định là 'polling' nếu chưa được set
        const currentMode = settings.sePayMode || 'polling';
        if (currentMode !== 'polling') return;

        const apiKey = (settings.sePayApiKey || '').trim();
        if (!apiKey) return;

        pollStats.isRunning = true;
        pollStats.lastChecked = new Date().toISOString();

        try {
            // Lấy GD từ tối đa 30 phút trước (khớp với paymentMatchWindow)
            const matchWindowMin = settings.paymentMatchWindow || 30;
            const sinceDate = new Date(Date.now() - matchWindowMin * 60 * 1000);
            // SePay API dùng định dạng: YYYY-MM-DD HH:mm:ss
            const pad2 = n => String(n).padStart(2, '0');
            const sinceStr = `${sinceDate.getFullYear()}-${pad2(sinceDate.getMonth()+1)}-${pad2(sinceDate.getDate())} ${pad2(sinceDate.getHours())}:${pad2(sinceDate.getMinutes())}:${pad2(sinceDate.getSeconds())}`;

            const url = `${SEPAY_API_BASE}/transactions/list?limit=20&transaction_date_min=${encodeURIComponent(sinceStr)}`;

            // Node 18+ có fetch native; Node cũ dùng https module
            let responseData;
            if (typeof fetch !== 'undefined') {
                const res = await fetch(url, {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                    },
                });
                if (!res.ok) {
                    pollStats.lastError = `HTTP ${res.status}`;
                    return;
                }
                responseData = await res.json();
            } else {
                // Fallback: dùng https module (Node < 18)
                const https = require('https');
                responseData = await new Promise((resolve, reject) => {
                    const parsedUrl = new URL(url);
                    const options = {
                        hostname: parsedUrl.hostname,
                        path: parsedUrl.pathname + parsedUrl.search,
                        headers: { 'Authorization': `Bearer ${apiKey}` },
                    };
                    https.get(options, res => {
                        let data = '';
                        res.on('data', c => data += c);
                        res.on('end', () => {
                            try { resolve(JSON.parse(data)); } catch { reject(new Error('Parse error')); }
                        });
                    }).on('error', reject);
                });
            }

            pollStats.lastError = null;

            // SePay API trả về: { transactions: [...] }
            // Mỗi transaction: { id, amount_in, amount_out, transaction_content, bank_sub_acc_id, ... }
            const transactions = responseData?.transactions || responseData?.data?.transactions || [];
            pollStats.txFoundCount = transactions.length;
            for (const tx of transactions) {
                // Chỉ xử lý tiền vào
                const amountIn = Number(tx.amount_in || 0);
                if (amountIn <= 0) continue;

                // Đã xử lý rồi → bỏ qua
                const txId = String(tx.id);
                if (processedTxIds.has(txId)) continue;

                const content = tx.transaction_content || tx.description || '';
                const matched = findMatchingOrder(amountIn, content);

                if (matched) {
                    processedTxIds.add(txId);
                    await confirmPaymentForOrder(matched, 'sepay', txId);
                    pollStats.confirmedCount++;
                } else {
                    // Chỉ skip nếu GD đã quá cũ (> matchWindow)
                    const txTime = tx.transaction_date ? new Date(tx.transaction_date).getTime() : 0;
                    if (txTime && (Date.now() - txTime) > (matchWindowMin + 5) * 60 * 1000) {
                        processedTxIds.add(txId);
                    }
                }
            }

            // Giới hạn Set size để tránh memory leak
            if (processedTxIds.size > 500) {
                const arr = [...processedTxIds];
                arr.slice(0, 250).forEach(id => processedTxIds.delete(id));
            }

        } catch (e) {
            pollStats.lastError = e.message;
            console.error('[SEPAY POLL] Lỗi:', e.message);
        } finally {
            pollStats.isRunning = false;
        }
    }

    function startPolling() {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        const currentMode = settings.sePayMode || 'polling';
        if (!settings.sePayEnabled || currentMode !== 'polling') {
            console.log(`[SEPAY POLL] Không khởi động: sePayEnabled=${settings.sePayEnabled}, mode=${currentMode}`);
            return;
        }

        const intervalSec = Math.max(5, Number(settings.sePayPollInterval) || 10);
        console.log(`[SEPAY POLL] ▶ Bắt đầu polling mỗi ${intervalSec}s (API key: ${settings.sePayApiKey ? '✓' : 'CHƯA CÓ!'})`); 

        // Kiểm tra ngay lần đầu sau 2 giây
        setTimeout(pollSePayOnce, 2000);
        pollTimer = setInterval(pollSePayOnce, intervalSec * 1000);
    }

    function stopPolling() {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        console.log('[SEPAY POLL] ⏹ Dừng polling');
    }

    // Khởi động polling khi module được load
    startPolling();

    // API để Settings UI bật/tắt polling mà không cần restart
    app.post('/api/payment/polling/restart', (req, res) => {
        stopPolling();
        startPolling();
        return res.json({ success: true, mode: settings.sePayMode, interval: settings.sePayPollInterval });
    });

    // API để UI xem trạng thái polling
    app.get('/api/payment/polling/status', (req, res) => {
        return res.json({
            enabled: settings.sePayEnabled,
            mode: settings.sePayMode || 'polling',
            interval: settings.sePayPollInterval || 10,
            isRunning: pollStats.isRunning,
            lastChecked: pollStats.lastChecked,
            lastError: pollStats.lastError,
            txFoundCount: pollStats.txFoundCount,
            confirmedCount: pollStats.confirmedCount,
            processedTxCount: processedTxIds.size,
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // ENDPOINT 1: SePay Webhook (chỉ dùng khi mode = 'webhook')
    // ──────────────────────────────────────────────────────────────────────────
    app.post('/api/payment/webhook/sepay', async (req, res) => {
        try {
            if (!settings.sePayEnabled) {
                return res.status(200).json({ success: false, message: 'SePay chưa được bật' });
            }
            if (settings.sePayMode === 'polling') {
                return res.status(200).json({ success: false, message: 'App đang dùng chế độ Polling, không nhận Webhook' });
            }

            const authHeader = req.headers['authorization'] || '';
            const expectedKey = (settings.sePayApiKey || '').trim();
            if (expectedKey && authHeader !== `Apikey ${expectedKey}`) {
                console.warn('[SEPAY] ⚠️  Unauthorized webhook');
                return res.status(401).json({ success: false, message: 'Unauthorized' });
            }

            const { id, gateway, accountNumber, content, transferAmount, transferType, referenceCode, description } = req.body;
            console.log(`[SEPAY WEBHOOK] ${transferType} ${transferAmount}đ | Content: "${content}"`);

            if (transferType !== 'in') {
                return res.status(200).json({ success: true, message: 'Bỏ qua: tiền ra' });
            }

            const txId = String(id);
            if (processedTxIds.has(txId)) {
                return res.status(200).json({ success: true, message: 'GD đã được xử lý trước đó' });
            }

            const matched = findMatchingOrder(transferAmount, content || description || '');
            if (!matched) {
                return res.status(200).json({ success: true, message: 'Không tìm thấy đơn khớp', received: true });
            }

            processedTxIds.add(txId);
            await confirmPaymentForOrder(matched, 'sepay', referenceCode || txId);
            return res.status(200).json({ success: true, orderId: matched.id });

        } catch (err) {
            console.error('[SEPAY WEBHOOK] Lỗi:', err);
            return res.status(200).json({ success: false, message: 'Internal error' });
        }
    });

    // ──────────────────────────────────────────────────────────────────────────
    // ENDPOINT 2: MoMo IPN Webhook
    // ──────────────────────────────────────────────────────────────────────────
    // Đăng ký tại: business.momo.vn (cần tài khoản doanh nghiệp)
    // URL callback: <domain>/api/payment/webhook/momo
    //
    // Payload từ MoMo IPN (v2):
    // {
    //   partnerCode: "MOMOXXXX",
    //   orderId: "0001020426",   ← Map với queueNumber của đơn
    //   requestId: "...",
    //   amount: 35000,
    //   orderInfo: "Don 0001",
    //   orderType: "momo_wallet",
    //   transId: 1234567890,
    //   resultCode: 0,           ← 0 = thành công
    //   message: "Successful",
    //   payType: "qr",
    //   responseTime: 1234567890,
    //   extraData: "",
    //   signature: "<HMAC-SHA256>"
    // }
    app.post('/api/payment/webhook/momo', async (req, res) => {
        try {
            if (!settings.momoEnabled) {
                return res.status(200).json({ success: false, message: 'MoMo chưa được bật' });
            }

            const {
                partnerCode, orderId, requestId, amount,
                orderInfo, transId, resultCode, message: momoMsg,
                payType, responseTime, extraData, signature,
            } = req.body;

            // Xác thực HMAC-SHA256 khi có Secret Key
            const secretKey = (settings.momoSecretKey || '').trim();
            if (secretKey) {
                const crypto = require('crypto');
                const rawHash = `accessKey=${settings.momoAccessKey}&amount=${amount}&extraData=${extraData}&message=${momoMsg}&orderId=${orderId}&orderInfo=${orderInfo}&orderType=${req.body.orderType}&partnerCode=${partnerCode}&payType=${payType}&requestId=${requestId}&responseTime=${responseTime}&resultCode=${resultCode}&transId=${transId}`;
                const computed = crypto.createHmac('sha256', secretKey).update(rawHash).digest('hex');
                if (signature !== computed) {
                    console.warn('[MOMO IPN] ⚠️  Signature không hợp lệ');
                    return res.status(400).json({ success: false, message: 'Invalid signature' });
                }
            }

            console.log(`[MOMO IPN] resultCode=${resultCode} | amount=${amount}đ | orderId=${orderId} | info="${orderInfo}"`);

            // Chỉ xử lý giao dịch thành công
            if (resultCode !== 0) {
                return res.status(200).json({ success: true, message: `Bỏ qua: resultCode=${resultCode}` });
            }

            // Tránh xử lý trùng
            const txId = String(transId);
            if (processedTxIds.has(txId)) {
                return res.status(200).json({ success: true, message: 'GD đã được xử lý' });
            }

            // Khớp đơn: ưu tiên theo orderId (nếu trùng queueNumber), fallback theo số tiền + orderInfo
            const matched = findMatchingOrder(amount, orderInfo || orderId || '');
            if (!matched) {
                console.log(`[MOMO IPN] Không tìm được đơn cho ${amount}đ | orderId=${orderId}`);
                return res.status(200).json({ success: true, message: 'Không tìm thấy đơn khớp', received: true });
            }

            processedTxIds.add(txId);
            await confirmPaymentForOrder(matched, 'momo', txId);
            return res.status(200).json({ success: true, orderId: matched.id });

        } catch (err) {
            console.error('[MOMO IPN] Lỗi:', err);
            return res.status(200).json({ success: false, message: 'Internal error' });
        }
    });

    // ──────────────────────────────────────────────────────────────────────────
    // ENDPOINT 3: MB Bank Open API Webhook (placeholder)
    // ──────────────────────────────────────────────────────────────────────────
    app.post('/api/payment/webhook/mbbank', async (req, res) => {
        try {
            if (!settings.mbbankEnabled) {
                return res.status(200).json({ success: false, message: 'MB Bank API chưa được bật' });
            }

            // TODO: Verify HMAC signature khi có credentials từ MB Bank
            // const crypto = require('crypto');
            // const signature = req.headers['x-mb-signature'] || '';
            // const secret = (settings.mbbankWebhookSecret || '').trim();
            // if (secret) {
            //     const computed = crypto.createHmac('sha256', secret).update(JSON.stringify(req.body)).digest('hex');
            //     if (signature !== computed) return res.status(401).json({ success: false });
            // }

            const { transId, amount, description, refNo } = req.body;
            console.log(`[MBBANK] ${amount}đ | Content: "${description}"`);

            const matched = findMatchingOrder(amount, description || '');
            if (!matched) {
                return res.status(200).json({ success: true, message: 'Không tìm thấy đơn khớp', received: true });
            }

            await confirmPaymentForOrder(matched, 'mbbank', refNo || transId);
            return res.status(200).json({ success: true, orderId: matched.id });

        } catch (err) {
            console.error('[MBBANK] Lỗi:', err);
            return res.status(200).json({ success: false, message: 'Internal error' });
        }
    });

    // ──────────────────────────────────────────────────────────────────────────
    // ENDPOINT 3: Test (local debug)
    // ──────────────────────────────────────────────────────────────────────────
    app.post('/api/payment/webhook/test', async (req, res) => {
        try {
            const { amount, content = '', source = 'test' } = req.body;
            if (!amount) return res.status(400).json({ error: 'Thiếu "amount"' });

            const matched = findMatchingOrder(Number(amount), content);
            if (!matched) {
                return res.json({
                    success: false,
                    message: 'Không tìm thấy đơn khớp',
                    hint: 'Đơn phải có status=COMPLETED, chưa isPaid, tạo trong 30 phút gần nhất',
                });
            }

            await confirmPaymentForOrder(matched, source, 'TEST-' + Date.now());
            return res.json({
                success: true,
                order: { id: matched.id, queueNumber: matched.queueNumber, amount: matched.price },
            });
        } catch (err) {
            return res.status(500).json({ success: false, message: err.message });
        }
    });

    console.log('[PAYMENT] ✅ Routes đăng ký: /sepay | /mbbank | /test | polling/status | polling/restart');
};
