/**
 * OTP Service — Zalo ZNS (primary) + Telegram (secondary)
 * Zalo ZNS gửi OTP thẳng vào Zalo của khách qua SĐT, không cần follow OA trước.
 */

const ZALO_ZNS_URL = 'https://business.openapi.zalo.me/message/template';
const TELEGRAM_API = 'https://api.telegram.org';
const OTP_TTL_MS = 5 * 60 * 1000; // 5 phút

// In-memory OTP store: phone → { otp, expiresAt, provider }
const otpStore = new Map();

// Telegram polling state
let tgOffset = 0;
let tgRunning = false;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateOTP() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

function storeOTP(phone, otp) {
    otpStore.set(phone, { otp, expiresAt: Date.now() + OTP_TTL_MS });
}

function verifyOTP(phone, otp) {
    const entry = otpStore.get(phone);
    if (!entry) return { ok: false, reason: 'Chưa yêu cầu OTP hoặc mã đã hết hạn' };
    if (Date.now() > entry.expiresAt) {
        otpStore.delete(phone);
        return { ok: false, reason: 'Mã OTP đã hết hạn (5 phút)' };
    }
    if (entry.otp !== String(otp)) {
        return { ok: false, reason: 'Mã OTP không đúng' };
    }
    otpStore.delete(phone); // one-time use
    return { ok: true };
}

// ─── Zalo ZNS ─────────────────────────────────────────────────────────────────
// Docs: https://developers.zalo.me/docs/zalo-notification-service/gui-zns

async function sendZaloZNS({ phone, otp, accessToken, templateId, log }) {
    // Chuẩn hóa SĐT sang định dạng quốc tế Vietnam: 0979... → 84979...
    const normalizedPhone = phone.replace(/^0/, '84');

    const body = {
        phone: normalizedPhone,
        template_id: templateId,
        template_data: {
            otp: otp,
            // Tên biến phải khớp với template Zalo đã được duyệt
        },
        tracking_id: `OTP-${Date.now()}`,
    };

    try {
        const resp = await fetch(ZALO_ZNS_URL, {
            method: 'POST',
            headers: {
                'access_token': accessToken,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });
        const data = await resp.json();
        if (data.error === 0) {
            log(`[OTP] Zalo ZNS gửi OTP đến ${phone} ✅`);
            return { ok: true };
        } else {
            log(`[OTP] Zalo ZNS lỗi: ${data.message} (code: ${data.error})`);
            return { ok: false, reason: data.message || 'Lỗi Zalo ZNS' };
        }
    } catch (e) {
        log(`[OTP] Zalo ZNS exception: ${e.message}`);
        return { ok: false, reason: 'Không kết nối được Zalo API' };
    }
}

// ─── Telegram ─────────────────────────────────────────────────────────────────
// Dùng khi khách đã link Telegram (gửi /start SĐT đến bot)

async function sendTelegramOTP({ chatId, phone, otp, botToken, log }) {
    const text = `🔐 Mã OTP của bạn: *${otp}*\n\n⏱ Hiệu lực 5 phút\n📱 SĐT: ${phone}`;
    try {
        const resp = await fetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
        });
        const data = await resp.json();
        if (data.ok) {
            log(`[OTP] Telegram gửi OTP đến chatId ${chatId} ✅`);
            return { ok: true };
        } else {
            log(`[OTP] Telegram error: ${data.description}`);
            return { ok: false, reason: data.description };
        }
    } catch (e) {
        return { ok: false, reason: e.message };
    }
}

// ─── Telegram bot polling — link SĐT với chatId ───────────────────────────────
// Khách gửi /start 0979xxx đến bot → hệ thống lưu chatId vào DB

async function pollTelegramUpdates({ botToken, db, log }) {
    if (!botToken || !tgRunning) return;

    try {
        const resp = await fetch(`${TELEGRAM_API}/bot${botToken}/getUpdates?offset=${tgOffset}&timeout=20`);
        const data = await resp.json();

        if (data.ok && data.result?.length > 0) {
            for (const update of data.result) {
                tgOffset = update.update_id + 1;
                const message = update.message;
                if (!message) continue;

                const chatId = String(message.chat.id);
                const text = (message.text || '').trim();

                if (text.startsWith('/start')) {
                    const rawPhone = text.split(' ')[1]?.replace(/\D/g, '');
                    if (rawPhone && rawPhone.length >= 9) {
                        const phone = rawPhone.startsWith('84') ? '0' + rawPhone.slice(2) : rawPhone;
                        try {
                            db.prepare('UPDATE customers SET telegramChatId = ? WHERE phone = ?').run(chatId, phone);
                            const cust = db.prepare('SELECT name FROM customers WHERE phone = ?').get(phone);
                            if (cust) {
                                await fetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        chat_id: chatId,
                                        text: `✅ Đã liên kết SĐT ${phone} với Telegram!\n\nXin chào ${cust.name}, bạn sẽ nhận OTP qua đây khi đăng nhập trang điểm.`,
                                    }),
                                });
                                log(`[OTP] Telegram linked chatId ${chatId} → ${phone} (${cust.name})`);
                            } else {
                                await fetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        chat_id: chatId,
                                        text: `❌ Không tìm thấy thành viên với SĐT ${phone}.\n\nHãy đăng ký thành viên tại quán trước.`,
                                    }),
                                });
                            }
                        } catch (e) {
                            log(`[OTP] Telegram link error: ${e.message}`);
                        }
                    } else {
                        await fetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                chat_id: chatId,
                                text: '👋 Chào bạn! Nhấn nút "Liên kết Telegram" trên trang điểm thành viên để kết nối tài khoản.',
                            }),
                        });
                    }
                }
            }
        }
    } catch (e) {
        // silent — network error or bad token
    }

    if (tgRunning) setTimeout(() => pollTelegramUpdates({ botToken, db, log }), 3000);
}

// ─── Exported factory ─────────────────────────────────────────────────────────

module.exports = function createOTPService({ db, getSettings, log }) {
    // Auto-migration: thêm cột telegramChatId nếu chưa có
    try {
        db.prepare('ALTER TABLE customers ADD COLUMN telegramChatId TEXT').run();
        log('[OTP] Migration: thêm cột telegramChatId vào customers');
    } catch { /* already exists */ }

    let tgBotToken = null;

    const startTelegramPolling = (token) => {
        if (tgRunning) return;
        tgBotToken = token;
        tgRunning = true;
        log('[OTP] Bắt đầu Telegram bot polling...');
        pollTelegramUpdates({ botToken: token, db, log });
    };

    const stopTelegramPolling = () => { tgRunning = false; };

    // Khởi động polling nếu token đã được cấu hình
    const s = getSettings();
    if (s?.telegramBotToken) startTelegramPolling(s.telegramBotToken);

    return {
        otpStore,
        verifyOTP,

        // Kiểm tra khách đã có Telegram chatId chưa
        checkTelegramLinked: (phone) => {
            const cust = db.prepare('SELECT telegramChatId FROM customers WHERE phone = ?').get(phone);
            return !!(cust?.telegramChatId);
        },

        // Gửi OTP — tự chọn provider theo settings
        sendOTP: async (phone) => {
            const settings = getSettings();
            const otp = generateOTP();
            storeOTP(phone, otp);

            const provider = settings?.otpProvider || 'none';

            // --- Zalo ZNS (ưu tiên) ---
            if (provider === 'zalo' && settings?.zaloOaToken && settings?.zaloZnsTemplateId) {
                const result = await sendZaloZNS({
                    phone, otp,
                    accessToken: settings.zaloOaToken,
                    templateId: settings.zaloZnsTemplateId,
                    log,
                });
                return result;
            }

            // --- Telegram ---
            if (provider === 'telegram' && settings?.telegramBotToken) {
                const cust = db.prepare('SELECT telegramChatId FROM customers WHERE phone = ?').get(phone);
                if (!cust?.telegramChatId) {
                    return { ok: false, reason: 'Chưa liên kết Telegram. Nhấn "Liên kết Telegram" trước.' };
                }
                return sendTelegramOTP({
                    chatId: cust.telegramChatId, phone, otp,
                    botToken: settings.telegramBotToken, log,
                });
            }

            // --- Dev/Test mode: log OTP ra console (không gửi) ---
            if (provider === 'console') {
                log(`[OTP-DEV] SĐT ${phone} → OTP: ${otp}`);
                return { ok: true, devOtp: otp }; // Trả về OTP cho dev
            }

            return { ok: false, reason: 'OTP chưa được cấu hình. Vào Cài Đặt → Xác thực OTP để thiết lập.' };
        },

        // Restart Telegram polling khi settings thay đổi
        onSettingsChanged: (newSettings) => {
            if (newSettings?.telegramBotToken && newSettings.telegramBotToken !== tgBotToken) {
                stopTelegramPolling();
                startTelegramPolling(newSettings.telegramBotToken);
            }
        },

        stopTelegramPolling,
    };
};
