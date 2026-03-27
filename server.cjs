const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const app = express();
const port = process.env.PORT || 3001;

const DATA_DIR = process.env.DATA_PATH || path.join(__dirname, 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
const RECEIPTS_DIR = path.join(DATA_DIR, 'receipts');
if (!fs.existsSync(RECEIPTS_DIR)) {
    fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
}

const MENU_IMAGES_DIR = path.join(DATA_DIR, 'menu_images');
if (!fs.existsSync(MENU_IMAGES_DIR)) {
    fs.mkdirSync(MENU_IMAGES_DIR, { recursive: true });
}

let multer = null;
let sharp = null;
try {
    multer = require('multer');
    sharp = require('sharp');
} catch (e) {
    console.error("Warning: 'multer' or 'sharp' is not installed. Image uploads will not work.");
}

const upload = multer ? multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }) : null;

// --- Logging Setup (MOVE TO TOP) ---
let logStream = null;
try {
    const LOG_FILE = path.join(DATA_DIR, 'server.log');
    logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
} catch (e) { }

// Helper to get Vietnam Time Info
// LƯU Ý QUAN TRỌNG: getVNTime() trả về Date gốc (UTC chuẩn) để tránh lỗi double-offset.
// Trước đây cộng +7h rồi gọi .toISOString() tạo ra timestamp sai (ví dụ: 15:30 UTC → 22:30Z)
// Browser VN (+7) parse "22:30Z" → ra "05:30 sáng hôm sau" → báo cáo bị sai ngày.
const getVNTime = (date = new Date()) => date; // Trả về Date gốc, KHÔNG cộng +7h nữa

// getVNDateStr vẫn tính đúng chuỗi ngày theo múi giờ Việt Nam (UTC+7)
// Chỉ dùng cho: usageHistory key, dateSuffix trong order ID, không dùng làm timestamp lưu DB
const getVNDateStr = (date = new Date()) => {
    const vnMs = date.getTime() + 7 * 3600 * 1000;
    return new Date(vnMs).toISOString().split('T')[0]; // YYYY-MM-DD theo giờ VN
};

// Lấy đối tượng Date đã được điều chỉnh sang giờ VN (chỉ dùng để đọc getUTCDate/Month/FullYear)
const getVNDateObj = (date = new Date()) => new Date(date.getTime() + 7 * 3600 * 1000);

const log = (msg) => {
    // Dùng getVNDateObj() để hiển thị thời gian VN chuẩn trong log text
    const vnDisplayObj = getVNDateObj();
    const timestamp = vnDisplayObj.toISOString().replace('Z', '+07:00');
    const formattedMsg = `[${timestamp}] ${msg}\n`;
    process.stdout.write(formattedMsg);
    if (logStream) logStream.write(formattedMsg);
};
console.log = log;
console.error = (...args) => log(`ERROR: ${args.map(a => typeof a === 'object' ? (a.stack || JSON.stringify(a)) : String(a)).join(' ')}`);

log("======================================================");
log("!!! CAFE SERVER STARTING - ACCESS TRACKING ON !!!");
log("ANTIGRAVITY: DATABASE LOGGING TEST - ACTIVE");
log(`!!! DATA_DIR: ${DATA_DIR}`);
log("======================================================");

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.use('/data/receipts', express.static(RECEIPTS_DIR));
app.use('/data/menu_images', express.static(MENU_IMAGES_DIR));

if (upload) {
    app.post('/api/upload-image', upload.single('image'), async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ error: "Không tìm thấy file ảnh." });
            }
            const fileName = `img_${Date.now()}_${Math.round(Math.random() * 1e4)}.webp`;
            const filePath = path.join(MENU_IMAGES_DIR, fileName);

            await sharp(req.file.buffer)
                .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
                .webp({ quality: 80 })
                .toFile(filePath);

            res.json({ url: `/data/menu_images/${fileName}` });
        } catch (error) {
            console.error("Upload error:", error);
            res.status(500).json({ error: "Lỗi khi xử lý ảnh." });
        }
    });
}

// --- AUTHENTICATION SYSTEM & RBAC ---
const activeTokens = new Map();

// Generate a salted SHA-256 hash
const hashPassword = (password) => {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha256').toString('hex');
    return `sha256:${salt}:${hash}`;
};

// Verify a password against a hash or plain text (for migration)
const verifyPassword = (password, storedHashOrText) => {
    if (!storedHashOrText) return false;

    if (storedHashOrText.startsWith('sha256:')) {
        const parts = storedHashOrText.split(':');
        if (parts.length !== 3) return false;
        const salt = parts[1];
        const hash = parts[2];
        const verifyHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha256').toString('hex');
        return hash === verifyHash;
    }

    // Fallback for plain-text (migration phase)
    return password === storedHashOrText;
};

app.post('/api/auth/login', (req, res) => {
    const { type, username, password, staffId, pin } = req.body;
    if (type === 'admin') {
        if (username === settings.adminUsername && verifyPassword(password, settings.adminPassword)) {
            const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
            activeTokens.set(token, { role: 'ADMIN', name: 'Quản lý' });
            return res.json({ success: true, token, role: 'ADMIN', name: 'Quản lý' });
        }
        return res.status(401).json({ success: false, message: 'Sai tên đăng nhập hoặc mật khẩu!' });
    } else if (type === 'staff') {
        const s = staff.find(st => st.id === staffId);
        if (s && verifyPassword(pin, s.pin)) {
            const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
            activeTokens.set(token, { role: 'STAFF', staffId: s.id, name: s.name });
            return res.json({ success: true, token, role: 'STAFF', staffId: s.id, name: s.name });
        }
        return res.status(401).json({ success: false, message: 'Mã PIN không đúng!' });
    }
    return res.status(400).json({ success: false, message: 'Yêu cầu không hợp lệ' });
});

app.post('/api/auth/logout', (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        activeTokens.delete(token);
    }
    res.json({ success: true });
});

app.post('/api/auth/change-admin-password', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
    const token = authHeader.substring(7);
    const user = activeTokens.get(token);

    if (!user || user.role !== 'ADMIN') return res.status(403).json({ success: false, message: 'Không có quyền thực hiện' });

    const { oldPassword, newPassword } = req.body;
    if (!verifyPassword(oldPassword, settings.adminPassword)) {
        return res.status(400).json({ success: false, message: 'Mật khẩu cũ không chính xác' });
    }
    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ success: false, message: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
    }

    settings.adminPassword = hashPassword(newPassword);
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    log(`Admin password changed successfully.`);
    res.json({ success: true, message: 'Đổi mật khẩu thành công' });
});

app.post('/api/auth/change-staff-pin', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
    const token = authHeader.substring(7);
    const user = activeTokens.get(token);

    if (!user) return res.status(401).json({ success: false, message: 'Phiên đăng nhập không hợp lệ' });

    const { staffId, newPin } = req.body;

    // Only Admin can change any staff PIN, or staff can change their own PIN
    if (user.role !== 'ADMIN' && user.staffId !== staffId) {
        return res.status(403).json({ success: false, message: 'Không có quyền đổi mã PIN của người khác' });
    }

    if (!newPin || newPin.length !== 6) {
        return res.status(400).json({ success: false, message: 'Mã PIN phải bao gồm đúng 6 ký tự' });
    }

    const staffIndex = staff.findIndex(s => s.id === staffId);
    if (staffIndex === -1) return res.status(404).json({ success: false, message: 'Không tìm thấy nhân viên' });

    staff[staffIndex].pin = hashPassword(newPin);
    fs.writeFileSync(STAFF_FILE, JSON.stringify(staff, null, 4));
    log(`Staff PIN changed for ID: ${staffId}`);
    res.json({ success: true, message: 'Đổi mã PIN thành công' });
});

// --- Code Recovery Login ---
app.post('/api/auth/login-recovery-code', (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ success: false, message: 'Vui lòng nhập Mã khôi phục.' });

    const token = Math.random().toString(36).substring(2) + Date.now().toString(36);

    if (settings.adminRecoveryCode && code.trim().toUpperCase() === settings.adminRecoveryCode.toUpperCase()) {
        activeTokens.set(token, { role: 'ADMIN', name: 'Quản lý' });
        log(`Admin logged in via recovery code`);
        return res.json({ success: true, token, role: 'ADMIN', name: 'Quản lý', requirePasswordChange: true });
    }

    const s = staff.find(st => st.recoveryCode && st.recoveryCode.toUpperCase() === code.trim().toUpperCase());
    if (s) {
        activeTokens.set(token, { role: 'STAFF', staffId: s.id, name: s.name });
        log(`Staff ${s.name} logged in via recovery code`);
        return res.json({ success: true, token, role: 'STAFF', staffId: s.id, name: s.name, requirePasswordChange: true });
    }

    return res.status(404).json({ success: false, message: 'Mã khôi phục không chính xác.' });
});

app.get('/api/auth/me', (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const user = activeTokens.get(token);
        if (user) return res.json({ success: true, user });
    }
    return res.status(401).json({ success: false, message: 'Not authenticated' });
});

app.get('/api/staff/public', (req, res) => {
    // Chỉ trả về data cơ bản, không lộ mã PIN hay Token
    const publicStaff = staff.map(s => ({
        id: s.id,
        name: s.name,
        role: s.role
    }));
    res.json(publicStaff);
});

// Middleware bảo mật phân quyền (RBAC)
app.use('/api', (req, res, next) => {
    const path = req.path;

    // Bỏ qua xác thực cho các route auth
    if (path.startsWith('/auth')) return next();

    // Các API dành cho khách hàng Kiosk / Menu Quét Mã (Public)
    if (req.method === 'GET') {
        if (['/menu', '/settings', '/qr-info', '/qr-token', '/lan-info', '/order/status', '/staff/public', '/attendance', '/notifications', '/staff/check-token', '/shifts', '/orders', '/promotions'].some(p => path.startsWith(p))) {
            return next();
        }
    }
    if (req.method === 'POST') {
        if (path.startsWith('/orders/confirm-payment') || path.startsWith('/orders/complete')) {
            return next();
        }
        if (['/order', '/pos/checkout', '/notifications', '/momo', '/attendance', '/settings/kiosk-dismiss'].some(p => path.startsWith(p)) && !path.startsWith('/orders')) {
            return next();
        }
    }

    // Các API còn lại bắt buộc Đăng nhập
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập' });
    }

    const token = authHeader.substring(7);
    const user = activeTokens.get(token);
    if (!user) {
        return res.status(401).json({ success: false, message: 'Phiên đăng nhập hết hạn. Vui lòng tải lại trang và đăng nhập lại.' });
    }

    // Phân quyền giới hạn cho ROLE: STAFF
    if (user.role === 'STAFF') {
        // Cầm nhân viên xóa bất kỳ dữ liệu nào (Món, Order, Bàn, Tồn kho...)
        if (req.method === 'DELETE') {
            log(`[RBAC] Chặn Nhân viên ${user.name} dùng lệnh XÓA ở: ${path}`);
            return res.status(403).json({ success: false, message: 'Nhân viên không có quyền xóa' });
        }
        // Cấm nhân viên thao tác Kho Hàng / Cài Đặt (chỉ được GET) TRỪ tính năng bật/tắt màn hình Kiosk
        if (['/inventory', '/imports', '/settings', '/report', '/promotions'].some(p => path.startsWith(p)) && req.method !== 'GET') {
            const allowedStaffSettings = ['/settings/toggle-staff-kiosk-qr', '/settings/toggle-kiosk-qr', '/settings/qr-protection'];
            if (!allowedStaffSettings.includes(path)) {
                log(`[RBAC] Chặn Nhân viên ${user.name} dùng lệnh ${req.method} ở: ${path}`);
                return res.status(403).json({ success: false, message: 'Chức năng này yêu cầu quyền Quản lý' });
            }
        }
    }

    // Log lại thao tác thay đổi dữ liệu
    if (['POST', 'PUT', 'DELETE'].includes(req.method) && !path.startsWith('/auth')) {
        log(`[ACTION] ${user.name} (${user.role}) - ${req.method} /api${path}`);
    }

    req.user = user;
    next();
});

// --- GLOBAL ACCESS LOGGING ---
app.use((req, res, next) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const ua = req.headers['user-agent'] || 'Unknown Device';

    // Log ALL non-static requests for maximum visibility
    const isStatic = /\.(js|css|png|jpg|jpeg|svg|ico|json|map)$/.test(req.url);
    const ignoredEndpoints = [
        '/api/qr-info',
        '/api/orders',
        '/api/report',
        '/api/shifts',
        '/api/ratings',
        '/api/settings',
        '/api/menu',
        '/api/notifications/completed',
        '/api/inventory',
        '/api/inventory/stats',
        '/api/imports',
        '/api/tables',
        '/api/lan-info'
    ];

    if ((!isStatic || req.url.startsWith('/api/')) && !(req.method === 'GET' && ignoredEndpoints.includes(req.url))) {
        // Redundant trace logging removed per user request
    }
    next();
});

const MENU_FILE = path.join(DATA_DIR, 'menu.json');
const REPORTS_FILE = path.join(DATA_DIR, 'reports.json');
const TABLES_FILE = path.join(DATA_DIR, 'tables.json');
const INVENTORY_FILE = path.join(DATA_DIR, 'inventory.json');
const STAFF_FILE = path.join(DATA_DIR, 'staff.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const IMPORTS_FILE = path.join(DATA_DIR, 'imports.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const EXPENSES_FILE = path.join(DATA_DIR, 'expenses.json');
const INVENTORY_AUDITS_FILE = path.join(DATA_DIR, 'inventory_audits.json');
const PROMOTIONS_FILE = path.join(DATA_DIR, 'promotions.json');
const SCHEDULES_FILE = path.join(DATA_DIR, 'schedules.json');
const DISCIPLINARY_LOGS_FILE = path.join(DATA_DIR, 'disciplinary_logs.json');

// Initial Data Load
let menu = [];
let reports = { totalSales: 0, successfulOrders: 0, cancelledOrders: 0, logs: [], fixedCosts: { rent: 0, machines: 0, electricity: 0, water: 0, salaries: 0, other: 0, useDynamicSalaries: false } };
let tables = [];
let inventory = [];
let staff = [];
let imports = [];
let expenses = []; // Fixed standard expenses
let inventory_audits = []; // Inventory actual vs system loss tracking
let schedules = []; // pre-assigned shifts
let disciplinary_logs = []; // red flags and diligence tracking
let settings = {
    shopName: 'VIBE CAFE',
    shopSlogan: 'Tự chọn • Tự phục vụ',
    themeColor: '#F5A623',
    paymentQRShowOnKiosk: false, // Hiệu lực cho việc hiện QR thanh toán toàn màn hình
    headerImageUrl: null,
    featuredPromoImage: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?q=80&w=1000&auto=format&fit=crop',
    featuredPromoTitle: 'Cà phê đặc biệt hôm nay!',
    bankId: 'MB',
    accountNo: '0123456789',
    accountName: 'VIBE CAFE',
    customQrUrl: null,
    preferDynamicQr: true, // Ưu tiên dùng VietQR động (có số tiền) thay vì ảnh tĩnh
    isTakeaway: false,
    qrProtectionEnabled: false,
    showQrOnKiosk: false,
    featuredPromoCTA: 'GỌI MÓN NGAY',
    cfEnabled: true,
    ttsEnabled: true,
    enablePromotions: false,
    enableDeliveryApps: false,
    deliveryAppsConfigs: {
        GRAB: { fee: 18.18 },
        SHOPEE: { fee: 20.00 }
    },
    annualRevenueTier: 'UNDER_500M', // Luật Thuế 2026: 'UNDER_500M' (EXEMPT), '500M_TO_3B' (DIRECT), 'OVER_3B' (DEDUCTION)
    taxMode: 'NONE', // Backwards-compatible runtime state: INCLUSIVE, EXCLUSIVE, NONE, DIRECT_INCLUSIVE
    taxRate: 0, // Runtime state
    deductionTaxMode: 'INCLUSIVE', // Cấu hình user cho mô hình KHẤU TRỪ
    deductionTaxRate: 8 // Cấu hình user cho mô hình KHẤU TRỪ
};
if (fs.existsSync(SETTINGS_FILE)) {
    try {
        const stored = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
        settings = { ...settings, ...stored };
    } catch (e) {
        console.error("Lỗi đọc settings:", e);
    }
} else {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    fs.writeFileSync(EXPENSES_FILE, JSON.stringify(expenses, null, 4));
    fs.writeFileSync(INVENTORY_AUDITS_FILE, JSON.stringify(inventory_audits, null, 4));
}
let orders = [];
let promotions = [];

let nextQueueNumber = 1;
let customerIdCounter = 1;
let lastResetDate = getVNTime().toDateString();
let completedNotifications = []; // queue for kiosk TTS announcements

const loadData = () => {
    if (fs.existsSync(MENU_FILE)) { try { menu = JSON.parse(fs.readFileSync(MENU_FILE, 'utf8')); } catch (e) { console.error('Error parsing menu.json', e); menu = []; } }
    if (fs.existsSync(REPORTS_FILE)) { try { reports = JSON.parse(fs.readFileSync(REPORTS_FILE, 'utf8')); } catch (e) { console.error('Error parsing reports.json', e); } }
    if (fs.existsSync(TABLES_FILE)) { try { tables = JSON.parse(fs.readFileSync(TABLES_FILE, 'utf8')); } catch (e) { console.error('Error parsing tables.json', e); tables = []; } }
    if (fs.existsSync(INVENTORY_FILE)) { try { inventory = JSON.parse(fs.readFileSync(INVENTORY_FILE, 'utf8')); } catch (e) { console.error('Error parsing inventory.json', e); inventory = []; } }
    if (fs.existsSync(STAFF_FILE)) {
        try { staff = JSON.parse(fs.readFileSync(STAFF_FILE, 'utf8')); } catch (e) { console.error('Error parsing staff.json', e); staff = []; }
        let migrated = false;
        staff.forEach(s => {
            if (!s.attendanceToken) {
                s.attendanceToken = Math.random().toString(36).substring(2, 15);
                migrated = true;
            }
            if (!s.recoveryCode) {
                s.recoveryCode = 'S-' + Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
                migrated = true;
            }
        });
        if (migrated) fs.writeFileSync(STAFF_FILE, JSON.stringify(staff, null, 4));
    }
    if (fs.existsSync(EXPENSES_FILE)) {
        try { expenses = JSON.parse(fs.readFileSync(EXPENSES_FILE, 'utf8')); } catch (e) { console.error('Error parsing expenses.json', e); expenses = []; }
    }
    if (fs.existsSync(INVENTORY_AUDITS_FILE)) {
        try { inventory_audits = JSON.parse(fs.readFileSync(INVENTORY_AUDITS_FILE, 'utf8')); } catch (e) { console.error('Error parsing inventory_audits.json', e); inventory_audits = []; }
    }
    if (fs.existsSync(PROMOTIONS_FILE)) {
        try { promotions = JSON.parse(fs.readFileSync(PROMOTIONS_FILE, 'utf8')); } catch (e) { console.error('Error parsing promotions.json', e); promotions = []; }
    }
    if (fs.existsSync(SCHEDULES_FILE)) {
        try { schedules = JSON.parse(fs.readFileSync(SCHEDULES_FILE, 'utf8')); } catch (e) { console.error('Error parsing schedules.json', e); schedules = []; }
    }
    if (fs.existsSync(DISCIPLINARY_LOGS_FILE)) {
        try { disciplinary_logs = JSON.parse(fs.readFileSync(DISCIPLINARY_LOGS_FILE, 'utf8')); } catch (e) { console.error('Error parsing disciplinary_logs.json', e); disciplinary_logs = []; }
    }
    if (fs.existsSync(SETTINGS_FILE)) {
        try {
            const stored = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
            // Merge with defaults to prevent losing fields
            Object.assign(settings, stored);
        } catch (e) { console.error('Error parsing settings.json', e); }
    }

    let settingsUpdated = false;
    if (!settings.adminUsername) {
        settings.adminUsername = 'admin';
        settingsUpdated = true;
    }
    if (!settings.adminPassword) {
        settings.adminPassword = hashPassword('adminpassword');
        settingsUpdated = true;
    }
    if (!settings.adminRecoveryCode) {
        settings.adminRecoveryCode = 'ADMIN-' + Math.random().toString(36).substring(2, 6).toUpperCase();
        settingsUpdated = true;
    }
    // VAT 2026 Migration
    if (!settings.annualRevenueTier) {
        settings.annualRevenueTier = 'UNDER_500M';
        settings.taxMode = 'NONE';
        settings.taxRate = 0;
        settings.deductionTaxMode = 'INCLUSIVE';
        settings.deductionTaxRate = 8;
        settingsUpdated = true;
    }
    if (settingsUpdated) {
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 4));
    }
    if (fs.existsSync(IMPORTS_FILE)) {
        try { imports = JSON.parse(fs.readFileSync(IMPORTS_FILE, 'utf8')); } catch (e) { console.error('Error parsing imports.json', e); imports = []; }
    }


    if (fs.existsSync(ORDERS_FILE)) {
        try { orders = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8')); } catch (e) { orders = []; }
    }

    // Logic to fix and reset counter daily
    // Dùng getVNDateObj() để lấy ngày VN chính xác (UTC+7)
    const nowVNObj = getVNDateObj();
    const todayVNStr = getVNDateStr(); // YYYY-MM-DD theo giờ VN

    if (!reports.logs) reports.logs = [];

    // Reset daily counters if needed - so sánh bằng chuỗi ngày VN
    if (reports.lastResetDate !== todayVNStr) {
        reports.lastResetDate = todayVNStr;
        reports.customerIdCounter = 1;
        reports.nextQueueNumber = 1;
        saveData();
    }

    // --- AUTO-FIX: Chuẩn hóa toàn bộ ID theo thời gian thực tế ---
    // nowVNObj.getUTCDate/Month/FullYear cho ra ngày VN chính xác
    const dateSuffix = `${String(nowVNObj.getUTCDate()).padStart(2, '0')}${String(nowVNObj.getUTCMonth() + 1).padStart(2, '0')}${String(nowVNObj.getUTCFullYear()).slice(-2)}`;

    // Thu thập tất cả đơn hàng và log của ngày hôm nay
    const todayOrders = orders.filter(o => String(o.id).endsWith(dateSuffix));
    const todayLogs = reports.logs.filter(l => {
        const logOrderId = l.orderId || l.id;
        return logOrderId && String(logOrderId).endsWith(dateSuffix);
    });

    // SỬA LỖI QUAN TRỌNG: Gộp và khử trùng trước khi đánh số
    // Mỗi đơn hàng (theo ID) chỉ được đếm 1 lần, không được đếm cả trong orders[] lẫn reports.logs[]
    const seenIds = new Set();
    const todayOrderIds = new Set(todayOrders.map(o => String(o.id)));

    // Lấy tất cả log nhưng CHỈ LẤY log của các đơn KHÔNG còn trong orders[]
    // (đơn vẫn còn active trong orders[] thì đã được đếm bởi todayOrders)
    const uniqueLogs = todayLogs.filter(l => {
        const logId = String(l.orderId || l.id);
        return !todayOrderIds.has(logId);
    });

    // Hợp nhất rồi sắp xếp theo thời gian tạo đơn gốc (đảm bảo đơn tạo lúc 0h là số 1)
    const combined = [...todayOrders, ...uniqueLogs].sort((a, b) => {
        const timeA = a.timestamp || (a.orderData?.timestamp) || '';
        const timeB = b.timestamp || (b.orderData?.timestamp) || '';
        return new Date(timeA) - new Date(timeB);
    });

    // Tạo bản đồ ID cũ → ID mới để cập nhật audit log
    const idReMap = {};

    combined.forEach((item, index) => {
        const tttt = String(index + 1).padStart(4, '0');
        const newId = `${tttt}${dateSuffix}`;
        const oldId = item.id || item.orderId;
        if (oldId && oldId !== newId) {
            idReMap[String(oldId)] = newId;
        }
        if (item.id) item.id = newId;
        if (item.orderId) item.orderId = newId;
        item.queueNumber = index + 1;
    });

    // Cập nhật inventory_audits theo ID mới nếu có
    if (Object.keys(idReMap).length > 0) {
        inventory_audits.forEach(audit => {
            if (audit.orderId && idReMap[String(audit.orderId)]) {
                audit.orderId = idReMap[String(audit.orderId)];
            }
        });
        console.log(`[STARTUP-FIX] Re-mapped ${Object.keys(idReMap).length} order IDs to sequential numbering. Unique orders today: ${combined.length}`);
    }

    nextQueueNumber = combined.length + 1;
    reports.nextQueueNumber = nextQueueNumber;
    customerIdCounter = reports.customerIdCounter || 1;
    lastResetDate = reports.lastResetDate || today;
    saveData();
};

const saveData = () => {
    fs.writeFileSync(MENU_FILE, JSON.stringify(menu, null, 4));
    fs.writeFileSync(REPORTS_FILE, JSON.stringify(reports, null, 4));
    fs.writeFileSync(TABLES_FILE, JSON.stringify(tables, null, 4));
    fs.writeFileSync(INVENTORY_FILE, JSON.stringify(inventory, null, 4));
    fs.writeFileSync(STAFF_FILE, JSON.stringify(staff, null, 4));
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 4));
    fs.writeFileSync(IMPORTS_FILE, JSON.stringify(imports, null, 4));
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 4));
    fs.writeFileSync(INVENTORY_AUDITS_FILE, JSON.stringify(inventory_audits, null, 4));
    fs.writeFileSync(PROMOTIONS_FILE, JSON.stringify(promotions, null, 4));
    fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(schedules, null, 4));
    fs.writeFileSync(DISCIPLINARY_LOGS_FILE, JSON.stringify(disciplinary_logs, null, 4));
};

// --- Cloudflare Tunnel Control ---
const { spawn } = require('child_process');
let tunnelProcess = null;
let tunnelStatus = { active: false, log: '', lastStarted: null, url: null };

function stopTunnel() {
    if (tunnelProcess) {
        tunnelProcess.kill('SIGINT');
        tunnelProcess = null;
    }
    tunnelStatus.active = false;
}

function startTunnel() {
    const isAuto = settings.tunnelType === 'auto' || !settings.tunnelType;

    if (!isAuto && !settings.cfToken) {
        log('Cloudflare Tunnel skipped: No token provided in manual mode.');
        tunnelStatus = { active: false, log: 'Chưa có Token', lastStarted: null, url: null };
        return;
    }

    stopTunnel();

    tunnelStatus.log = 'Đang khởi tạo kết nối...';
    tunnelStatus.lastStarted = getVNTime().toISOString();
    tunnelStatus.url = null;

    // Find cloudflared binary in node_modules
    let cfPath = 'npx cloudflared'; // Default fallback

    // Handle Electron ASAR unpack path
    let baseDir = __dirname;
    if (baseDir.includes('app.asar') && !baseDir.includes('app.asar.unpacked')) {
        baseDir = baseDir.replace('app.asar', 'app.asar.unpacked');
    }

    const isWin = process.platform === 'win32';
    const possiblePaths = [
        path.join(baseDir, 'node_modules', 'cloudflared', 'bin', `cloudflared${isWin ? '.exe' : ''}`),
        path.join(baseDir, 'node_modules', '.bin', `cloudflared${isWin ? '.exe' : ''}`),
        path.join(__dirname, 'node_modules', 'cloudflared', 'bin', `cloudflared${isWin ? '.exe' : ''}`),
        path.join(__dirname, 'node_modules', '.bin', `cloudflared${isWin ? '.exe' : ''}`)
    ];

    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            cfPath = `"${p}"`;
            break;
        }
    }

    log(`Starting Cloudflare Tunnel using: ${cfPath}`);

    // If we found a native path, we run it directly, otherwise we try npx
    let command = '';
    if (isAuto) {
        log(`Starting Cloudflare Quick Tunnel (Auto mode)...`);
        command = cfPath.startsWith('"')
            ? `${cfPath} tunnel --metrics 127.0.0.1:45173 --url http://127.0.0.1:${port}`
            : `npx -y cloudflared tunnel --metrics 127.0.0.1:45173 --url http://127.0.0.1:${port}`;
    } else {
        log(`Starting Cloudflare Tunnel manually with token prefix: ${settings.cfToken.substring(0, 10)}...`);
        command = cfPath.startsWith('"')
            ? `${cfPath} tunnel --no-autoupdate run --token ${settings.cfToken}`
            : `npx -y cloudflared tunnel --no-autoupdate run --token ${settings.cfToken}`;
    }

    const env = { ...process.env };
    if (!isWin) {
        env.PATH = process.env.PATH + ':/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin';
    }

    // Ép Cloudflare không đọc file cấu hình chung của hệ thống Linux nếu chạy Quick Tunnel
    if (isAuto) {
        env.TUNNEL_ORIGINCERT = '';
        env.TUNNEL_CRED_FILE = '';
        env.TUNNEL_CONFIG = '/dev/null';
    }

    tunnelProcess = spawn(command, {
        shell: true,
        env
    });

    const processOutput = (data) => {
        const out = data.toString().trim();
        log(`[Tunnel] ${out}`);
        tunnelStatus.log = out;

        // Trích xuất URL từ log nếu có
        const urlMatch = out.match(/(https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com)/);
        if (isAuto && !tunnelStatus.url && urlMatch && urlMatch[1] && !urlMatch[1].includes('api.') && !urlMatch[1].includes('update.')) {
            tunnelStatus.url = urlMatch[1];
            tunnelStatus.active = true;
            log(`[Tunnel] Quick Tunnel URL ready from logs: ${tunnelStatus.url}`);
        } else if (!isAuto && (out.toLowerCase().includes('connected') || out.toLowerCase().includes('registered'))) {
            tunnelStatus.active = true;
            tunnelStatus.url = settings.cfDomain ? (settings.cfDomain.startsWith('http') ? settings.cfDomain : `https://${settings.cfDomain}`) : null;
        }
    };

    // Nếu Auto Mode, dùng API của Metrics Server để móc chính xác cái URL ra (Do Linux PM2 đôi khi k in URL vào stdout)
    let urlFetcher;
    if (isAuto) {
        let fetchAttempts = 0;
        urlFetcher = setInterval(async () => {
            if (tunnelStatus.url || fetchAttempts > 60) {
                clearInterval(urlFetcher);
                return;
            }
            fetchAttempts++;
            try {
                // cloudflared exposes /quicktunnel on the metrics port
                const res = await fetch('http://127.0.0.1:45173/quicktunnel');
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.hostname) {
                        tunnelStatus.url = 'https://' + data.hostname;
                        tunnelStatus.active = true;
                        log(`[Tunnel] Quick Tunnel URL successfully fetched from Metrics API: ${tunnelStatus.url}`);
                        clearInterval(urlFetcher);
                    }
                }
            } catch (e) {
                // Server chưa lên, thử lại sau 1s
            }
        }, 1000);
    }

    tunnelProcess.stdout.on('data', processOutput);
    tunnelProcess.stderr.on('data', processOutput);

    tunnelProcess.on('error', (err) => {
        log(`Failed to start Cloudflare Tunnel: ${err.message}`);
        tunnelStatus.active = false;
        tunnelStatus.log = `Lỗi khởi động: ${err.message}`;
    });

    tunnelProcess.on('close', (code) => {
        log(`Cloudflare Tunnel exited with code ${code}`);
        tunnelProcess = null;
        tunnelStatus.active = false;
        tunnelStatus.log = code === 0 ? 'Đã tắt.' : `Dừng với mã lỗi: ${code}`;
    });
}

loadData();


// --- LAN INFO (for QR code and link sharing) ---
const os = require('os');
const getLANIP = () => {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
};

app.get('/api/lan-info', (req, res) => {
    res.json({
        ip: getLANIP(),
        port: port,
        hostname: os.hostname().includes('.local') ? os.hostname() : `${os.hostname()}.local`
    });
});

// --- MENU API ---
app.get('/api/menu', (req, res) => {
    const checkSoldOut = (item) => {
        if (!inventory || inventory.length === 0) return { isSoldOut: false, missingIngredients: [], availablePortions: null };

        const missingIngredients = [];
        let isSoldOut = false;
        let availablePortions = null;

        // Tổng hợp Base Recipe và Recipe của Size mặc định để tính toán chính xác (Bao gồm các món chế biến nằm trong Size)
        let combinedRecipe = (item.recipe || []).map(r => ({ ...r }));
        if (item.sizes && item.sizes.length > 0 && item.sizes[0].recipe) {
            item.sizes[0].recipe.forEach(sr => {
                const existing = combinedRecipe.find(r => r.ingredientId === sr.ingredientId);
                if (existing) {
                    existing.quantity = (parseFloat(existing.quantity) || 0) + (parseFloat(sr.quantity) || 0);
                } else {
                    combinedRecipe.push({ ...sr });
                }
            });
        }

        if (combinedRecipe.length > 0) {
            let limit = Infinity;
            combinedRecipe.forEach(r => {
                const invItem = inventory.find(i => i.id === r.ingredientId);
                const neededStock = Math.ceil(parseFloat(r.quantity) || 0);
                if (invItem && typeof invItem.stock === 'number') {
                    if (neededStock > 0) {
                        const possible = Math.floor(invItem.stock / neededStock);
                        if (possible < limit) limit = possible;
                    }
                    if (invItem.stock < neededStock) {
                        isSoldOut = true;
                        if (!missingIngredients.includes(invItem.name)) {
                            missingIngredients.push(invItem.name);
                        }
                    }
                }
            });
            if (limit !== Infinity) availablePortions = limit > 0 ? limit : 0;
        }

        return { isSoldOut, missingIngredients, availablePortions };
    };

    const appendSoldOut = (item) => {
        const soldOutData = checkSoldOut(item);
        // Bỏ qua isSoldOut từ db vì không có nút toggle thủ công, món chỉ hết khi thiếu nguyên liệu.
        return { ...item, isSoldOut: soldOutData.isSoldOut, missingIngredients: soldOutData.missingIngredients, availablePortions: soldOutData.availablePortions };
    };

    if (req.query.all) {
        res.json(menu.map(appendSoldOut));
    } else {
        res.json(menu.filter(item => !item.isDeleted).map(appendSoldOut));
    }
});

app.post('/api/menu', async (req, res) => {
    // Strip dynamic fields before saving
    const { isSoldOut, missingIngredients, availablePortions, warningThreshold, ...cleanItem } = req.body;
    let updatedItem = cleanItem;

    // Convert temporary IDs to permanent ones
    if (updatedItem.id && updatedItem.id.toString().startsWith('new-')) {
        const lastId = menu.length > 0 ? Math.max(...menu.map(m => parseInt(m.id) || 0)) : 0;
        updatedItem.id = (lastId + 1).toString();
    }

    // --- AUTO-PROCESS IMAGES TO AVOID FILE BLOAT ---
    if (updatedItem.image && (updatedItem.image.startsWith('http://') || updatedItem.image.startsWith('https://'))) {
        try {
            console.log(`[BACKEND] Auto-downloading image for ${updatedItem.id}`);
            const imgRes = await fetch(updatedItem.image);
            if (!imgRes.ok) throw new Error(`HTTP Error ${imgRes.status}`);
            const arrayBuffer = await imgRes.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            const fileName = `${updatedItem.id}.webp`;
            const filePath = path.join(MENU_IMAGES_DIR, fileName);

            if (typeof sharp !== 'undefined') {
                await sharp(buffer)
                    .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
                    .webp({ quality: 80 })
                    .toFile(filePath);
            } else {
                fs.writeFileSync(filePath, buffer);
            }
            updatedItem.image = `/data/menu_images/${fileName}?v=${Date.now()}`;
            console.log(`[BACKEND] Saved local image: ${filePath}`);
        } catch (error) {
            console.error(`[BACKEND] Error downloading image for ${updatedItem.id}:`, error);
        }
    } else if (updatedItem.image && updatedItem.image.match(/^\/data\/menu_images\/img_.*\.webp(\?.*)?$/)) {
        try {
            const urlPath = updatedItem.image.split('?')[0];
            const tempFileName = path.basename(urlPath);
            const tempFilePath = path.join(MENU_IMAGES_DIR, tempFileName);

            if (fs.existsSync(tempFilePath)) {
                const finalFileName = `${updatedItem.id}.webp`;
                const finalFilePath = path.join(MENU_IMAGES_DIR, finalFileName);
                fs.copyFileSync(tempFilePath, finalFilePath);
                fs.unlinkSync(tempFilePath); // Remove orphan temp file
                updatedItem.image = `/data/menu_images/${finalFileName}?v=${Date.now()}`;
                console.log(`[BACKEND] Processed uploaded image to persistent name: ${finalFileName}`);
            }
        } catch (error) {
            console.error(`[BACKEND] Error renaming image for ${updatedItem.id}:`, error);
        }
    }

    const index = menu.findIndex(item => item.id === updatedItem.id);
    if (index !== -1) {
        menu[index] = { ...menu[index], ...updatedItem };
        console.log(`[BACKEND] Updated item: ${updatedItem.name} (ID: ${updatedItem.id})`);
    } else {
        menu.push(updatedItem);
        console.log(`[BACKEND] Created new item: ${updatedItem.name} (ID: ${updatedItem.id})`);
    }

    try {
        saveData();
        res.json({ success: true, item: updatedItem });
    } catch (err) {
        console.error('[BACKEND] Error saving menu:', err);
        res.status(500).json({ success: false, message: 'Failed to save data' });
    }
});

app.post('/api/menu/reorder', (req, res) => {
    const newMenu = req.body;
    if (!Array.isArray(newMenu)) {
        return res.status(400).json({ success: false, message: 'Data must be an array' });
    }
    // Strip dynamic fields
    menu = newMenu.map(({ isSoldOut, missingIngredients, availablePortions, warningThreshold, ...item }) => item);
    saveData();
    console.log(`[BACKEND] Menu reordered. Total items: ${menu.length}`);
    res.json({ success: true });
});

app.delete('/api/menu/:id', (req, res) => {
    const itemIndex = menu.findIndex(item => item.id === req.params.id);
    if (itemIndex === -1) {
        return res.status(404).json({ success: false, message: 'Item not found' });
    }

    if (!menu[itemIndex].isDeleted) {
        // Soft delete
        menu[itemIndex].isDeleted = true;
        console.log(`[BACKEND] Soft deleted menu item: ${menu[itemIndex].name} (ID: ${req.params.id})`);
    } else {
        // Hard delete
        menu = menu.filter(item => item.id !== req.params.id);
        console.log(`[BACKEND] Hard deleted menu item ID: ${req.params.id}`);
    }

    saveData();
    res.json({ success: true });
});

app.post('/api/menu/:id/restore', (req, res) => {
    const itemIndex = menu.findIndex(item => item.id === req.params.id);
    if (itemIndex !== -1 && menu[itemIndex].isDeleted) {
        menu[itemIndex].isDeleted = false;
        saveData();
        console.log(`[BACKEND] Restored menu item: ${menu[itemIndex].name} (ID: ${req.params.id})`);
        res.json({ success: true });
    } else {
        res.status(404).json({ success: false, message: 'Deleted item not found' });
    }
});

app.post('/api/menu/bulk', (req, res) => {
    const items = req.body;
    if (!Array.isArray(items)) {
        return res.status(400).json({ success: false, message: 'Data must be an array' });
    }

    // Simple deduplication based on ID or Name
    items.forEach(newItem => {
        const index = menu.findIndex(item => item.id === newItem.id || (newItem.id.startsWith('new-') && item.name === newItem.name));
        if (index !== -1) {
            menu[index] = { ...menu[index], ...newItem };
        } else {
            menu.push(newItem);
        }
    });

    saveData();
    res.json({ success: true, count: items.length });
});

// --- ORDERS API ---
const checkCartInventory = (cartItems) => {
    if (!inventory || !cartItems || cartItems.length === 0) return { valid: true };
    const required = {};

    cartItems.forEach(cartItem => {
        const menuItem = menu.find(m => m.id === cartItem.item.id) || cartItem.item;
        const count = parseInt(cartItem.count) || 1;
        const sizeMultiplier = cartItem.size?.multiplier || 1;

        const addReq = (ingId, qty) => {
            if (!ingId || !qty) return;
            const inv = inventory.find(i => i.id === ingId);
            if (!inv) return;
            if (!required[ingId]) required[ingId] = { name: inv.name, neededQty: 0, stock: inv.stock || 0, unit: inv.unit || '' };
            required[ingId].neededQty += (parseFloat(qty) || 0) * count;
        };

        if (menuItem.recipe) {
            menuItem.recipe.forEach(r => {
                const unitUsedQty = Math.ceil((parseFloat(r.quantity) || 0) * sizeMultiplier);
                addReq(r.ingredientId, unitUsedQty);
            });
        }

        if (cartItem.size && cartItem.size.recipe) {
            cartItem.size.recipe.forEach(r => {
                const unitUsedQty = Math.ceil(parseFloat(r.quantity) || 0);
                addReq(r.ingredientId, unitUsedQty);
            });
        }

        if (cartItem.addons) {
            cartItem.addons.forEach(addonItem => {
                const menuItemAddon = (menuItem.addons || []).find(a => (a.label === addonItem.label || a.addonCode === addonItem.addonCode)) || addonItem;
                if (menuItemAddon.recipe) {
                    menuItemAddon.recipe.forEach(r => {
                        const unitUsedQty = Math.ceil(parseFloat(r.quantity) || 0);
                        addReq(r.ingredientId, unitUsedQty);
                    });
                }
            });
        }
    });

    const insufficient = [];
    for (const [ingId, reqData] of Object.entries(required)) {
        if (reqData.stock < reqData.neededQty) {
            insufficient.push(`${reqData.name} (Cần: ${reqData.neededQty} ${reqData.unit}, Còn: ${reqData.stock} ${reqData.unit})`);
        }
    }

    if (insufficient.length > 0) {
        return { valid: false, errors: insufficient };
    }
    return { valid: true };
};

const handleInventoryForOrder = (order, action = 'DEDUCT_STOCK_ONLY') => {
    const actionType = action === true ? 'REFUND_STOCK_ONLY' : (action === false ? 'DEDUCT_STOCK_ONLY' : action);
    if (!order.cartItems || order.cartItems.length === 0) return;
    const orderDeductions = {};
    
    order.cartItems.forEach(cartItem => {
        const menuItem = menu.find(m => m.id === cartItem.item.id) || cartItem.item;
        const count = parseInt(cartItem.count) || 1;
        
        let sizeMultiplier = 1;
        if (cartItem.size) {
            const selectedSizeLabel = typeof cartItem.size === 'string' ? cartItem.size : (cartItem.size.label || cartItem.size.name);
            const menuSize = menuItem?.sizes?.find(s => s.label === selectedSizeLabel);
            if (menuSize && menuSize.multiplier) sizeMultiplier = parseFloat(menuSize.multiplier);
        }

        const applyRecipe = (recipe, mult = 1, contextString = '') => {
            if (!recipe || !Array.isArray(recipe)) return;
            recipe.forEach(recipeItem => {
                const ingredient = inventory.find(inv => inv.id === recipeItem.ingredientId);
                if (ingredient) {
                    const unitUsedQty = Math.ceil(parseFloat(recipeItem.quantity || 0) * mult);
                    const usedQty = unitUsedQty * count;
                    if (usedQty === 0) return;
                    
                    if (actionType === 'REFUND_STOCK_ONLY') {
                        ingredient.stock = parseFloat((ingredient.stock + usedQty).toFixed(3));
                    } else if (actionType === 'DEDUCT_STOCK_ONLY') {
                        ingredient.stock = parseFloat((ingredient.stock - usedQty).toFixed(3));
                    }
                    
                    if (!orderDeductions[ingredient.id]) orderDeductions[ingredient.id] = 0;
                    orderDeductions[ingredient.id] += usedQty;

                    if (actionType === 'LOG_AUDIT_ONLY') {
                        if (!ingredient.usageHistory || Array.isArray(ingredient.usageHistory)) ingredient.usageHistory = {};
                        const todayStr = getVNDateStr();
                        ingredient.usageHistory[todayStr] = parseFloat(((ingredient.usageHistory[todayStr] || 0) + usedQty).toFixed(3));
                        console.log(`[INVENTORY] Logged daily usage ${usedQty} ${ingredient.unit} from ${ingredient.name} (${contextString})`);
                    } else if (actionType === 'REFUND_STOCK_ONLY') {
                        console.log(`[INVENTORY] Refunded stock: ${usedQty} ${ingredient.unit} to ${ingredient.name} (${contextString})`);
                    } else if (actionType === 'DEDUCT_STOCK_ONLY') {
                        console.log(`[INVENTORY] Deducted stock: ${usedQty} ${ingredient.unit} from ${ingredient.name} (${contextString})`);
                    }
                }
            });
        };

        if (menuItem) {
            applyRecipe(menuItem.recipe, sizeMultiplier, `Món: ${menuItem.name}`);
            
            if (cartItem.size) {
                 const selectedSizeLabel = typeof cartItem.size === 'string' ? cartItem.size : (cartItem.size.label || cartItem.size.name);
                 const menuSize = menuItem?.sizes?.find(s => s.label === selectedSizeLabel);
                 applyRecipe(menuSize?.recipe, 1, `Size: ${selectedSizeLabel}`);
            }
            
            if (cartItem.addons && Array.isArray(cartItem.addons)) {
                cartItem.addons.forEach(addonItem => {
                     const addonLabel = typeof addonItem === 'string' ? addonItem : addonItem.label;
                     const menuAddon = menuItem?.addons?.find(a => a.label === addonLabel);
                     applyRecipe(menuAddon?.recipe, 1, `Addon: ${addonLabel}`);
                });
            }
        }
    });

    if (actionType === 'LOG_AUDIT_ONLY' && Object.keys(orderDeductions).length > 0) {
        const auditInputs = Object.entries(orderDeductions).map(([invId, qty]) => {
            const inv = inventory.find(i => i.id === invId);
            return {
                id: invId,
                name: inv?.name || invId,
                qty: parseFloat(qty.toFixed(3)),
                unit: inv?.unit || '',
                costDifference: parseFloat((-(qty * (inv?.importPrice || 0))).toFixed(0))
            };
        });

        inventory_audits.push({
            id: `audit-order-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            timestamp: getVNTime().toISOString(),
            type: 'ORDER',   // Refund audits are no longer needed since pending orders aren't logged
            orderId: order.id || '',
            queueNumber: order.queueNumber || 0,
            userName: 'Hệ thống',
            inputs: auditInputs
        });
    }
};

app.post('/api/order', (req, res) => {
    const newOrderData = req.body;

    // Lấy IP client để xác định mạng LAN
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '';
    const isLAN = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp.includes('192.168.') || clientIp.includes('10.') || clientIp.includes('172.') || clientIp === '::ffff:127.0.0.1';

    // Check QR Token if Protection is enabled
    // Only enforced for non-POS orders AND external IPs (không phải LAN)
    if (settings.qrProtectionEnabled && !newOrderData.isPOS && !isLAN) {
        console.log(`[DEBUG] Checking token for order. qrToken: ${req.body.qrToken}, isPOS: ${newOrderData.isPOS}`);
        const clientToken = (req.body.qrToken || '').toUpperCase();
        const now = Date.now();
        const tokenObj = validQrTokens.find(t => t.token === clientToken && t.expiresAt > now);

        if (!tokenObj) {
            console.log(`[SECURITY-ALERT] Blocked Order! Token ${clientToken} expired or invalid.`);
            return res.status(403).json({
                success: false,
                error: 'QR_REQUIRED',
                message: 'Mã QR đã hết hạn hoặc không hợp lệ. Vui lòng quét mã mới tại quầy.'
            });
        }

        // Kích hoạt xoay mã QR ngay khi có đơn hàng thành công từ Token này
        lastAccessedToken = clientToken;
        console.log(`[QR-SIGNAL] Đơn hàng từ Token ${clientToken} thành công. Yêu cầu Kiosk tạo mã mới.`);
    }

    const { itemName, customerName, price, basePrice, preTaxTotal, taxAmount, taxRate, taxMode, discount, appliedPromoCode, timestamp, note, options, tableId, tableName, tagNumber, deviceId, cartItems, status, id, isPaid, orderSource, partnerFee } = newOrderData;

    if (cartItems && cartItems.length > 0) {
        const invCheck = checkCartInventory(cartItems);
        if (!invCheck.valid) {
            return res.status(400).json({
                success: false,
                error: 'INSUFFICIENT_INVENTORY',
                message: 'Không đủ nguyên liệu để đặt đơn này:\n- ' + invCheck.errors.join('\n- ')
            });
        }
    }


    const now = new Date();
    // Daily reset check in-request - dùng ngày VN chuẩn để tránh timezone bug
    const todayVN = getVNDateStr(now);
    if (lastResetDate !== todayVN) {
        lastResetDate = todayVN;
        customerIdCounter = 1;
        nextQueueNumber = 1;
        reports.lastResetDate = todayVN;
        reports.customerIdCounter = 1;
        reports.nextQueueNumber = 1;
    }

    const currentIdStr = `K${String(customerIdCounter).padStart(4, '0')}`;

    // Auto-formatting customer names to shorter tags
    let formattedCustomerName = customerName || '';
    if (formattedCustomerName === 'Khách đặt online' || formattedCustomerName === 'Khách Kiosk') {
        formattedCustomerName = '(Online)';
    } else if (formattedCustomerName.startsWith('Khách Bàn ') || formattedCustomerName.startsWith('Bàn ')) {
        const num = formattedCustomerName.replace(/\D/g, '');
        formattedCustomerName = `(B${num})`;
    } else if (formattedCustomerName.startsWith('Khách Thẻ ')) {
        const num = formattedCustomerName.replace(/\D/g, '');
        formattedCustomerName = `(Thẻ ${num})`;
    } else if (tableName && !formattedCustomerName.includes('B')) {
        const num = tableName.replace(/\D/g, '');
        if (num) formattedCustomerName += ` (B${num})`;
    }

    const finalCustomerName = formattedCustomerName ? (formattedCustomerName.includes('K') && formattedCustomerName.length < 8 ? formattedCustomerName : `${currentIdStr} - ${formattedCustomerName}`) : currentIdStr;
    // Dùng getVNDateObj() để lấy ngày VN chính xác khi tạo order ID
    const nowVN = getVNDateObj(now);
    const dd = String(nowVN.getUTCDate()).padStart(2, '0');
    const mm = String(nowVN.getUTCMonth() + 1).padStart(2, '0');
    const yy = String(nowVN.getUTCFullYear()).slice(-2);

    // --- Lấy ID TTTT lớn nhất hiện tại để chống trùng khi xóa đơn ---
    let maxQueue = 0;
    const dateSuffixMatch = `${dd}${mm}${yy}`;
    
    // Quét toàn bộ orders và reports.logs của ngày hôm nay để tìm Max TTTT
    const todayOrders = orders.filter(o => o.id && o.id.toString().endsWith(dateSuffixMatch));
    const todayLogs = reports.logs ? reports.logs.filter(l => {
        const logOrderId = l.orderId || l.id || l.orderData?.id;
        return logOrderId && logOrderId.toString().endsWith(dateSuffixMatch);
    }) : [];
    
    todayOrders.forEach(o => {
        const num = parseInt(o.id.substring(0, 4));
        if (num > maxQueue) maxQueue = num;
    });
    todayLogs.forEach(l => {
        const logOrderId = l.orderId || l.id || l.orderData?.id;
        if (logOrderId) {
            const num = parseInt(logOrderId.toString().substring(0, 4));
            if (num > maxQueue) maxQueue = num;
        }
    });
    
    const currentQueue = maxQueue + 1;
    nextQueueNumber = currentQueue + 1; // Cập nhật sync để an toàn
    const orderRef = `${String(currentQueue).padStart(4, '0')}${dd}${mm}${yy}`;

    const newOrder = {
        id: orderRef, // Server luôn ghi đè ID cho đơn hàng mới
        queueNumber: currentQueue,
        customerId: currentIdStr,
        deviceId: deviceId || null,
        itemName,
        customerName: finalCustomerName,
        price,
        basePrice: basePrice || price,
        preTaxTotal: preTaxTotal !== undefined ? preTaxTotal : (basePrice || price),
        taxAmount: taxAmount || 0,
        taxRate: taxRate || 0,
        taxMode: taxMode || 'NONE',
        discount: discount || 0,
        appliedPromoCode: appliedPromoCode || null,
        timestamp: now.toISOString(),
        note: note || '',
        options: options || {},
        cartItems: cartItems || [],
        tableId,
        tableName: tableName || '',
        tagNumber: tagNumber || '',
        status: status || (settings.requirePrepayment === false ? 'PENDING' : 'AWAITING_PAYMENT'),
        isPaid: (status === 'PAID' || isPaid === true) ? true : false,
        orderSource: orderSource || 'INSTORE',
        partnerFee: partnerFee || 0,
    };

    customerIdCounter++;
    reports.customerIdCounter = customerIdCounter;
    reports.nextQueueNumber = nextQueueNumber;

    orders.push(newOrder);

    // CHÍNH THỨC: Trừ kho ngay khi đơn hàng được TẠO
    handleInventoryForOrder(newOrder, false);

    if (newOrder.appliedPromoCode && newOrder.discount > 0) {
        let promo = promotions.find(p => p.isActive && (p.code === newOrder.appliedPromoCode || p.name === newOrder.appliedPromoCode));
        if (promo && promo.dailyLimit && promo.dailyLimit > 0) {
            const todayStr = new Date(newOrder.timestamp).toISOString().split('T')[0];
            if (!promo.usageHistory) promo.usageHistory = {};
            promo.usageHistory[todayStr] = (promo.usageHistory[todayStr] || 0) + 1;
            console.log(`[PROMO] Ghi nhận lượt dùng mã ${promo.name}. Lượt dùng hôm nay: ${promo.usageHistory[todayStr]}/${promo.dailyLimit}`);
        }
    }

    saveData();
    console.log(`[ORDER]: New order #${newOrder.queueNumber} ID: ${newOrder.id}`);
    res.status(201).json({ success: true, order: newOrder });
});

// Sửa đơn hàng (cập nhật thông tin, cartItems, table)
app.put('/api/orders/:id', (req, res) => {
    const order = orders.find(o => o.id.toString() === req.params.id.toString());
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.status === 'COMPLETED' || order.status === 'CANCELLED') return res.status(400).json({ success: false, message: 'Không thể sửa đơn đã hoàn thành/hủy' });

    const { cartItems, tableId, tableName, customerName, basePrice, preTaxTotal, taxAmount, taxRate, taxMode, discount, appliedPromoCode, price, orderSource, partnerFee } = req.body;

    if (cartItems) {
        // Chỉ check kho nếu đơn chưa thanh toán, vì nếu đã thanh toán thì đã trừ rồi
        if (order.status !== 'PAID' && order.isPaid !== true) {
            const invCheck = checkCartInventory(cartItems);
            if (!invCheck.valid) {
                return res.status(400).json({
                    success: false,
                    error: 'INSUFFICIENT_INVENTORY',
                    message: 'Không đủ nguyên liệu để cập nhật đơn này:\n- ' + invCheck.errors.join('\n- ')
                });
            }
        }

        // Hoàn kho cho giỏ cũ trước khi đổi giỏ
        handleInventoryForOrder(order, true);
        order.cartItems = cartItems;
        // Trừ kho với giỏ vừa cập nhật
        handleInventoryForOrder(order, false);
        order.itemName = cartItems.map(c => `${c.item.name} (${c.size?.label || 'Mặc định'}) x${c.count}`).join(', ');
        // Trust the frontend's price calculation which includes global discounts, fallback to sum of cart items
        order.price = price !== undefined ? price : cartItems.reduce((s, c) => s + (c.totalPrice * c.count), 0);
        if (basePrice !== undefined) order.basePrice = basePrice;
        if (preTaxTotal !== undefined) order.preTaxTotal = preTaxTotal;
        if (taxAmount !== undefined) order.taxAmount = taxAmount;
        if (taxRate !== undefined) order.taxRate = taxRate;
        if (taxMode !== undefined) order.taxMode = taxMode;
        if (discount !== undefined) order.discount = discount;
        if (appliedPromoCode !== undefined) order.appliedPromoCode = appliedPromoCode;
        if (orderSource !== undefined) order.orderSource = orderSource;
        if (partnerFee !== undefined) order.partnerFee = partnerFee;
    }

    if (tableId !== undefined) order.tableId = tableId;
    if (tableName !== undefined) order.tableName = tableName;
    if (customerName !== undefined) order.customerName = customerName;

    saveData();
    console.log(`[ORDER]: Updated order #${order.queueNumber}`);
    res.json({ success: true, order });
});

// Xóa đơn hàng (chỉ PENDING)
app.delete('/api/orders/:id', (req, res) => {
    const idx = orders.findIndex(o => o.id.toString() === req.params.id.toString());
    if (idx === -1) return res.status(404).json({ success: false, message: 'Order not found' });
    if (orders[idx].status !== 'PENDING') return res.status(400).json({ success: false, message: 'Chỉ được xóa đơn chưa hoàn thành' });

    const removed = orders.splice(idx, 1)[0];

    if (removed.appliedPromoCode && removed.discount > 0) {
        let promo = promotions.find(p => p.code === removed.appliedPromoCode || p.name === removed.appliedPromoCode);
        if (promo && promo.dailyLimit && promo.dailyLimit > 0) {
            const dateStr = new Date(removed.timestamp).toISOString().split('T')[0];
            if (promo.usageHistory && promo.usageHistory[dateStr] > 0) {
                promo.usageHistory[dateStr] -= 1;
                console.log(`[PROMO] Hoàn lại lượt dùng mã ${promo.name} do xóa đơn. Lượt dùng: ${promo.usageHistory[dateStr]}/${promo.dailyLimit}`);
            }
        }
    }

    // Hoàn kho khi đơn hàng bị XÓA hẳn
    handleInventoryForOrder(removed, true);

    saveData();
    console.log(`[ORDER]: Deleted order #${removed.queueNumber}`);
    res.json({ success: true });
});

app.get('/api/orders/:id', (req, res) => {
    const order = orders.find(o => o.id.toString() === req.params.id.toString());
    if (order) {
        res.json(order);
    } else {
        res.status(404).json({ success: false, message: 'Order not found' });
    }
});

app.get('/api/orders', (req, res) => {
    if (req.query.id) {
        res.json(orders.filter(o => o.id === req.query.id));
    } else if (req.query.history === 'true') {
        let completed = orders.filter(o => o.status === 'COMPLETED');
        if (req.query.date) {
            completed = completed.filter(o => {
                const d = new Date(o.timestamp);
                const localDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                return localDate === req.query.date;
            });
        } else {
            completed = completed.slice(-100);
        }
        res.json(completed);
    } else if (req.query.debt === 'true') {
        res.json(orders.filter(o => o.isDebt));
    } else {
        res.json(orders.filter(o => (o.status !== 'COMPLETED' || (!o.isPaid && !o.isDebt)) && o.status !== 'CANCELLED'));
    }
});

// Confirm payment: AWAITING_PAYMENT → PAID (admin clicks "Đã nhận tiền")
app.post('/api/orders/confirm-payment/:id', (req, res) => {
    const order = orders.find(o => o.id.toString() === req.params.id.toString());
    if (!order) return res.status(404).json({ success: false });
    order.isPaid = true;
    if (order.status === 'AWAITING_PAYMENT') {
        order.status = 'PAID';
    }

    if (order.isDebt) {
        order.isDebt = false;
        // Log the debt payment for accounting
        if (!reports.logs) reports.logs = [];
        reports.logs.push({
            type: 'DEBT_PAID',
            orderId: order.id,
            queueNumber: order.queueNumber,
            customerName: order.customerName,
            price: order.price,
            timestamp: getVNTime().toISOString(),
            orderData: order
        });
        saveData();
    }

    // Save payment receipt if provided
    if (req.body && req.body.paymentReceipt) {
        try {
            const base64Data = req.body.paymentReceipt.replace(/^data:image\/\w+;base64,/, "");
            const fileName = `receipt-${order.id}.jpg`;
            const filePath = path.join(DATA_DIR, 'receipts', fileName);
            fs.writeFileSync(filePath, base64Data, 'base64');
            order.paymentReceipt = fileName;
        } catch (e) {
            console.error('Error saving payment receipt:', e);
        }
    }

    // Auto-dismiss Kiosk QR if this order was being paid there
    if (posCheckoutSession && posCheckoutSession.orderId === order.id) {
        posCheckoutSession = null;
        lastPaidKioskOrder = { orderId: order.id, timestamp: Date.now() };
        console.log(`[POS-PAYMENT] Order ${order.id} PAID. Autos-dismissing Kiosk QR.`);
    }

    saveData();
    log(`[PAYMENT]: Order #${order.queueNumber} confirmed as PAID`);
    res.json({ success: true, order });
});

// Cancel order: (PENDING or AWAITING_PAYMENT) → CANCELLED
app.post('/api/orders/cancel/:id', (req, res) => {
    const order = orders.find(o => o.id.toString() === req.params.id.toString());
    if (!order) return res.status(404).json({ success: false });

    order.status = 'CANCELLED';

    // Log to reports
    reports.logs.push({
        type: 'CANCELLED',
        orderId: order.id,
        queueNumber: order.queueNumber,
        customerName: order.customerName,
        price: order.price,
        timestamp: getVNTime().toISOString(),
        orderData: order // Save full data for detailed view
    });

    reports.cancelledOrders = (reports.cancelledOrders || 0) + 1;

    if (order.appliedPromoCode && order.discount > 0) {
        let promo = promotions.find(p => p.code === order.appliedPromoCode || p.name === order.appliedPromoCode);
        if (promo && promo.dailyLimit && promo.dailyLimit > 0) {
            const dateStr = new Date(order.timestamp).toISOString().split('T')[0];
            if (promo.usageHistory && promo.usageHistory[dateStr] > 0) {
                promo.usageHistory[dateStr] -= 1;
                console.log(`[PROMO] Hoàn lại lượt dùng mã ${promo.name} do hủy đơn. Lượt dùng: ${promo.usageHistory[dateStr]}/${promo.dailyLimit}`);
            }
        }
    }

    // Hoàn kho khi HỦY đơn
    handleInventoryForOrder(order, true);

    saveData();
    log(`[ORDER]: Order #${order.queueNumber} CANCELLED`);
    res.json({ success: true, order });
});

// Mark as DEBT
app.post('/api/orders/debt/mark/:id', (req, res) => {
    const order = orders.find(o => o.id.toString() === req.params.id.toString());
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.status !== 'COMPLETED' || order.isPaid) {
        return res.status(400).json({ success: false, message: 'Chỉ đơn đã hoàn thành và chưa thanh toán mới có thể ghi nợ' });
    }

    order.isDebt = true;

    reports.logs.push({
        type: 'DEBT_MARKED',
        orderId: order.id,
        queueNumber: order.queueNumber,
        customerName: order.customerName,
        price: order.price,
        timestamp: getVNTime().toISOString(),
        orderData: order
    });

    saveData();
    log(`[ORDER]: Order #${order.queueNumber} DEBT_MARKED`);
    res.json({ success: true, order });
});

// Pay DEBT
app.post('/api/orders/debt/pay/:id', (req, res) => {
    const orderId = req.params.id.toString();
    const orderInActive = orders.find(o => o.id.toString() === orderId);

    // If order still in active orders
    if (orderInActive) {
        if (!orderInActive.isDebt) {
            return res.status(400).json({ success: false, message: 'Đơn này không phải đơn nợ (Active Order)' });
        }
        orderInActive.isDebt = false;
        orderInActive.isPaid = true;
    }

    // Whether in active orders or not, we MUST verify it was marked as debt in reports
    const debtMarkedLog = reports.logs.find(l => l.type === 'DEBT_MARKED' && l.orderId && l.orderId.toString() === orderId);

    // Check if already paid
    const alreadyPaid = reports.logs.find(l => l.type === 'DEBT_PAID' && l.orderId && l.orderId.toString() === orderId);
    if (alreadyPaid) {
        return res.status(400).json({ success: false, message: 'Đơn này đã được thu nợ rồi!' });
    }

    let orderData = orderInActive;
    if (!orderData) {
        if (!debtMarkedLog) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy thông tin nợ của đơn này trên hệ thống' });
        }
        orderData = debtMarkedLog.orderData;
    }

    reports.logs.push({
        type: 'DEBT_PAID',
        orderId: orderData.id,
        queueNumber: orderData.queueNumber,
        customerName: orderData.customerName,
        price: orderData.price,
        timestamp: getVNTime().toISOString(),
        orderData: orderData
    });

    saveData();
    log(`[ORDER]: Order #${orderData.queueNumber} DEBT_PAID (Cross-check)`);
    res.json({ success: true, order: orderData });
});

// Completed notifications queue (for kiosk TTS announcement)
app.get('/api/notifications/completed', (req, res) => {
    res.json(completedNotifications);
});
app.post('/api/notifications/dismiss/:queueNumber', (req, res) => {
    completedNotifications = completedNotifications.filter(n => n.queueNumber !== parseInt(req.params.queueNumber));
    res.json({ success: true });
});

// Low stock alerts
app.get('/api/inventory/alerts', (req, res) => {
    const alerts = inventory.filter(i => i.stock <= (i.minStock || 0));
    res.json(alerts);
});

app.post('/api/orders/complete/:id', (req, res) => {
    const { id } = req.params;
    const order = orders.find(o => o.id.toString() === id.toString());

    if (order) {
        order.status = 'COMPLETED';
        reports.successfulOrders++;
        reports.totalSales += parseFloat(order.price);

        // Đẩy báo cáo hao hụt và usageHistory KHI HOÀN THÀNH ĐƠN
        handleInventoryForOrder(order, 'LOG_AUDIT_ONLY');

        reports.logs.push({
            type: 'COMPLETED',
            orderId: order.id,
            queueNumber: order.queueNumber,
            itemName: order.itemName,
            customerName: order.customerName,
            price: order.price,
            timestamp: getVNTime().toISOString(),
            orderData: order
        });
        // Push to kiosk notification queue
        completedNotifications.push({
            queueNumber: order.queueNumber,
            customerId: order.customerId,
            itemName: order.itemName,
            timestamp: getVNTime().toISOString()
        });

        // Trigger rating prompt on Kiosk
        if (!pendingRatings.includes(order.id.toString())) {
            pendingRatings.push(order.id.toString());
        }

        saveData();
        res.json({ success: true, order });
    } else {
        res.status(404).json({ success: false, message: 'Order not found' });
    }
});

// Removed duplicate '/api/orders/cancel/:id' endpoint. The active version is above at line 1422.

app.get('/api/report', (req, res) => {
    res.json({ ...reports, hasDebt: orders.some(o => o.isDebt) });
});

// Update fixed costs
app.post('/api/report/fixed-costs', (req, res) => {
    const { rent, machines, electricity, water, salaries, other, useDynamicRent, useDynamicMachines, useDynamicElectricity, useDynamicWater, useDynamicSalaries, useDynamicOther, targetRevenue, useDynamicRevenue } = req.body;
    reports.fixedCosts = {
        rent: parseFloat(rent) || 0,
        machines: parseFloat(machines) || 0,
        electricity: parseFloat(electricity) || 0,
        water: parseFloat(water) || 0,
        salaries: parseFloat(salaries) || 0,
        other: parseFloat(other) || 0,
        useDynamicRent: !!useDynamicRent,
        useDynamicMachines: !!useDynamicMachines,
        useDynamicElectricity: !!useDynamicElectricity,
        useDynamicWater: !!useDynamicWater,
        useDynamicSalaries: !!useDynamicSalaries,
        useDynamicOther: !!useDynamicOther,
        targetRevenue: parseFloat(targetRevenue) || 0,
        useDynamicRevenue: !!useDynamicRevenue
    };
    saveData();
    res.json({ success: true, fixedCosts: reports.fixedCosts });
});

// --- QR TOKEN PROTECTION ---
let validQrTokens = []; // Store active tokens: { token: string, expiresAt: number }
let activeAttendanceTokens = []; // { token: string, expiresAt: number }
const ATTENDANCE_TOKEN_LIFETIME = 60 * 1000; // 60 seconds rotation

const rotateAttendanceToken = () => {
    const now = Date.now();
    activeAttendanceTokens = activeAttendanceTokens.filter(t => t.expiresAt > now);
    const newToken = Math.random().toString(36).substring(2, 8).toUpperCase();
    activeAttendanceTokens.push({ token: newToken, expiresAt: now + ATTENDANCE_TOKEN_LIFETIME });
    // console.log(`[ATTENDANCE-ROTATE] New security token: ${newToken}`);
};

// Start rotation
rotateAttendanceToken();
setInterval(rotateAttendanceToken, 30 * 1000); // Check/Add every 30s to ensure overlap

let lastTokenGenerationTime = 0;
let lastAccessedToken = null; // Track which token was last scanned
let posCheckoutSession = null; // { amount: number, timestamp: number }
let lastPaidKioskOrder = { orderId: null, timestamp: 0 };

app.post('/api/pos/checkout/start', (req, res) => {
    const { amount, orderId } = req.body;
    posCheckoutSession = { amount, orderId, timestamp: Date.now() };
    console.log(`[POS-CHECKOUT] Đã kích hoạt hiển thị QR thanh toán trên Kiosk cho đơn ${orderId}: ${amount}k`);
    res.json({ success: true });
});

app.post('/api/pos/checkout/stop', (req, res) => {
    posCheckoutSession = null;
    console.log(`[POS-CHECKOUT] Đã tắt hiển thị QR thanh toán trên Kiosk.`);
    res.json({ success: true });
});

app.get('/api/pos/checkout/status', (req, res) => {
    res.json({ activeOrderId: posCheckoutSession?.orderId || null });
});
const TOKEN_LIFETIME = 5 * 60 * 1000; // 5 minutes session

app.get('/api/qr-token/new', (req, res) => {
    const token = Math.random().toString(36).substring(2, 8).toUpperCase();
    validQrTokens.push({ token, expiresAt: Date.now() + TOKEN_LIFETIME });
    res.json({ success: true, token });
});

app.get('/api/qr-token/check/:token', (req, res) => {
    const { token } = req.params;
    const now = Date.now();
    const tokenUpper = token.toUpperCase();

    // SIMPLE VALIDATION: Just check if token exists and is not expired
    const t = validQrTokens.find(t => t.token === tokenUpper && t.expiresAt > now);

    res.json({
        success: true,
        isValid: !!t,
        isOrderable: !!t, // In simple mode, valid means orderable
        error: !t ? 'QR_EXPIRED' : null
    });
});

// Endpoint called by Client when they scan the QR
app.post('/api/qr-token/accessed', (req, res) => {
    const { token } = req.body;
    if (!token) {
        console.log(`[QR-ERROR] Nhận tín hiệu Accessed nhưng không có Token.`);
        return res.status(400).json({ success: false });
    }

    const tokenUpper = token.toUpperCase();
    const now = Date.now();
    const tokenObj = validQrTokens.find(t => t.token === tokenUpper && t.expiresAt > now);

    if (tokenObj) {
        lastTokenGenerationTime = now;
        lastAccessedToken = tokenUpper;
        console.log(`[QR-SIGNAL] Token ${tokenUpper} đã xác nhận truy cập. Đã kích hoạt xoay mã trên Kiosk.`);
        return res.json({ success: true });
    } else {
        console.log(`[QR-SIGNAL] Nhận tín hiệu từ Token ${tokenUpper} nhưng mã này đã hết hạn hoặc không tồn tại.`);
        res.status(404).json({ success: false, error: 'TOKEN_INVALID' });
    }
});

app.get('/api/qr-info', (req, res) => {
    const now = Date.now();
    validQrTokens = validQrTokens.filter(t => t.expiresAt && t.expiresAt > now);

    const currentDisplayToken = validQrTokens[validQrTokens.length - 1];

    // Generate new token if:
    // 1. No tokens exist
    // 2. The token currently on display (currentDisplayToken) was just reported as ACCESSED via Splash Screen
    const shouldRotate = !currentDisplayToken || (lastAccessedToken && currentDisplayToken && lastAccessedToken === currentDisplayToken.token);

    if (shouldRotate) {
        const token = Math.random().toString(36).substring(2, 8).toUpperCase();
        validQrTokens.push({ token, expiresAt: now + TOKEN_LIFETIME });
        lastAccessedToken = null; // Reset signal after rotating
        lastTokenGenerationTime = now;
        console.log(`[QR-ROTATE] Signal received or first init. New token: ${token}`);
    }

    const tokenToRedndrive = validQrTokens[validQrTokens.length - 1];
    const lanIP = getLANIP();
    let baseUrl;
    if (settings.cfEnabled) {
        if ((!settings.tunnelType || settings.tunnelType === 'auto') && tunnelStatus.url) {
            baseUrl = `${tunnelStatus.url}/`;
        } else if (settings.tunnelType === 'manual' && settings.cfDomain) {
            baseUrl = `https://${settings.cfDomain}/`;
        }
    }
    if (!baseUrl) {
        baseUrl = `http://${lanIP}:${port}/`;
    }
    const orderUrl = `${baseUrl}?action=order&token=${tokenToRedndrive.token}`;

    res.json({
        success: true,
        token: tokenToRedndrive.token,
        lanIP,
        port,
        orderUrl,
        protectionEnabled: !!settings.qrProtectionEnabled,
        showQrOnKiosk: !!settings.showQrOnKiosk,
        showStaffQrOnKiosk: !!settings.showStaffQrOnKiosk,
        posCheckoutSession, // Trả về thông tin thanh toán từ POS
        lastPaidKioskOrder  // Tín hiệu đơn hàng vừa được thành công thực sự trên Kiosk
    });
});

app.post('/api/settings/toggle-staff-kiosk-qr', (req, res) => {
    settings.showStaffQrOnKiosk = !settings.showStaffQrOnKiosk;
    saveData();
    res.json({ success: true, showStaffQrOnKiosk: settings.showStaffQrOnKiosk });
});

app.post('/api/settings/toggle-kiosk-qr', (req, res) => {
    settings.showQrOnKiosk = !settings.showQrOnKiosk;
    saveData();
    res.json({ success: true, showQrOnKiosk: settings.showQrOnKiosk });
});

app.post('/api/settings/kiosk-dismiss', (req, res) => {
    settings.showQrOnKiosk = false;
    saveData();
    res.json({ success: true, showQrOnKiosk: false });
});

app.post('/api/settings/qr-protection', (req, res) => {
    const { enabled } = req.body;
    settings.qrProtectionEnabled = !!enabled;
    // Clear old tokens when turning on/off
    validQrTokens = [];
    saveData();
    res.json({ success: true, qrProtectionEnabled: settings.qrProtectionEnabled });
});

// --- KIOSK EVENTS API ---
let forceKioskQrDebtOrderId = null;

app.post('/api/kiosk/show-qr/:id', (req, res) => {
    forceKioskQrDebtOrderId = req.params.id;
    // Auto clear signal after 60s
    setTimeout(() => {
        if (forceKioskQrDebtOrderId === req.params.id) forceKioskQrDebtOrderId = null;
    }, 60000);
    res.json({ success: true });
});

app.post('/api/kiosk/clear-qr', (req, res) => {
    forceKioskQrDebtOrderId = null;
    res.json({ success: true });
});

app.get('/api/kiosk/events', (req, res) => {
    res.json({ forceKioskQrDebtOrderId });
});

// --- ORDERS API ---
app.get('/api/order/status/queue', (req, res) => {
    // Public endpoint for Kiosks: Only return minimal info about pending/awaiting orders
    const pendingOrders = orders
        .filter(o => {
            if (o.status === 'CANCELLED') return false;
            // Đã là đơn nợ thì không hiện ở Đang Thực Hiện nữa
            if (o.isDebt) return false;
            // Trả về nếu đơn đang làm (PENDING, PAID, AWAITING_PAYMENT) HOẶC đơn đã xong nhưng chưa thanh toán
            if (o.status === 'PENDING' || o.status === 'AWAITING_PAYMENT' || o.status === 'PAID') return true;
            if (o.status === 'COMPLETED' && !o.isPaid) return true;
            return false;
        })
        .map(o => ({
            id: o.id,
            queueNumber: o.queueNumber,
            customerName: o.customerName,
            status: o.status,
            isPaid: !!o.isPaid,
            timestamp: o.timestamp,
            price: o.price,
            itemName: o.itemName,
            tagNumber: o.tagNumber,
            tableName: o.tableName,
            cartItems: o.cartItems
        }));
    res.json(pendingOrders);
});

app.get('/api/orders/today', (req, res) => {
    const todayStr = getVNTime().toDateString();
    const todayOrders = orders.filter(o => {
        const orderDate = new Date(o.timestamp).toDateString();
        return orderDate === todayStr;
    });
    res.json(todayOrders);
});

// Redundant end-of-file handlers removed.

// --- TABLES API ---
app.get('/api/tables', (req, res) => res.json(tables));

app.post('/api/tables/status', (req, res) => {
    const { id, status, currentOrderId } = req.body;
    const table = tables.find(t => t.id === id);
    if (table) {
        table.status = status;
        table.currentOrderId = currentOrderId || null;
        saveData();
        res.json({ success: true, table });
    } else res.status(404).json({ success: false });
});
app.post('/api/tables/update', (req, res) => {
    const updatedTable = req.body;
    const index = tables.findIndex(t => t.id === updatedTable.id);
    if (index !== -1) {
        tables[index] = { ...tables[index], ...updatedTable };
    } else {
        tables.push(updatedTable);
    }
    saveData();
    res.json({ success: true, table: updatedTable });
});

app.delete('/api/tables/:id', (req, res) => {
    tables = tables.filter(t => t.id !== req.params.id);
    saveData();
    res.json({ success: true });
});

// --- INVENTORY API ---
app.get('/api/inventory/audits', (req, res) => res.json(inventory_audits));

app.post('/api/inventory/audit', (req, res) => {
    const audits = req.body;
    if (!Array.isArray(audits)) {
        return res.status(400).json({ success: false, message: 'Invalid data format' });
    }

    const now = getVNTime().toISOString();
    const newRecords = [];

    audits.forEach(auditData => {
        const item = inventory.find(i => i.id === auditData.ingredientId);
        if (item) {
            const systemStock = item.stock || 0;
            const actualStock = parseFloat(auditData.actualStock) || 0;
            const difference = actualStock - systemStock;

            const importedItems = imports.filter(imp => imp.ingredientId === item.id && !imp.isDeleted);
            let avgPrice = 0;
            if (importedItems.length > 0) {
                const totalCost = importedItems.reduce((sum, imp) => sum + (parseFloat(imp.totalCost) || 0), 0);
                const totalAddedStock = importedItems.reduce((sum, imp) => sum + (parseFloat(imp.addedStock) || 0), 0);
                if (totalAddedStock > 0) avgPrice = totalCost / totalAddedStock;
            } else if (item.price) {
                avgPrice = parseFloat(item.price);
            }

            const costDifference = difference * avgPrice;

            const record = {
                id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                timestamp: now,
                ingredientId: item.id,
                ingredientName: item.name,
                systemStock,
                actualStock,
                difference,
                costDifference,
                reason: auditData.reason || 'Không rõ',
                unit: item.unit
            };

            newRecords.push(record);
            inventory_audits.push(record);

            item.stock = actualStock;
            if (item.stock > 0 && item.isSoldOut) {
                item.isSoldOut = false;
            }
        }
    });

    if (newRecords.length > 0) {
        saveData();
    }
    res.json({ success: true, records: newRecords });
});


// --- PROMOTIONS API ---
app.get('/api/promotions', (req, res) => res.json(promotions));

app.post('/api/promotions', (req, res) => {
    const promo = req.body;
    promo.id = 'promo-' + Date.now() + '-' + Math.round(Math.random() * 1000);
    promotions.push(promo);
    saveData();
    res.json({ success: true, promo });
});

app.put('/api/promotions/:id', (req, res) => {
    const index = promotions.findIndex(p => p.id === req.params.id);
    if (index !== -1) {
        promotions[index] = { ...promotions[index], ...req.body };
        saveData();
        res.json({ success: true, promo: promotions[index] });
    } else {
        res.status(404).json({ success: false, message: 'Not found' });
    }
});

// Khai trương quán mới (Factory Reset)
app.post('/api/settings/factory-reset', (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
        const token = authHeader.substring(7);
        const user = activeTokens.get(token);
        if (!user || user.role !== 'ADMIN') return res.status(403).json({ success: false, message: 'Không có quyền thực hiện' });

        const { execSync } = require('child_process');

        // 1. Tạo backup an toàn (Copy không nén để tránh SIP/Privacy chặn)
        const backupsDir = path.join(DATA_DIR, 'backups');
        if (!fs.existsSync(backupsDir)) {
            fs.mkdirSync(backupsDir, { recursive: true });
        }

        const timestamp = getVNTime().toISOString().replace(/[:.]/g, '-');
        const backupFolderName = `backup_khaitruong_${timestamp}`;
        const backupFolderPath = path.join(backupsDir, backupFolderName);

        fs.mkdirSync(backupFolderPath, { recursive: true });

        // Copy data hiện hành qua folder backup riêng (quét từng file để tránh lỗi copy đè vào chính nó)
        const files = fs.readdirSync(DATA_DIR);
        for (const file of files) {
            if (file === 'backups') continue; // Bỏ qua thư mục backups
            const srcPath = path.join(DATA_DIR, file);
            const destPath = path.join(backupFolderPath, file);
            try {
                fs.cpSync(srcPath, destPath, { recursive: true });
            } catch (err) {
                console.error(`Lỗi copy file ${file}:`, err.message);
            }
        }

        console.log(`[FACTORY RESET] Backup created at: ${backupFolderPath}`);

        // 2. Reset data variables in memory
        orders.length = 0;
        if (reports) {
            reports.logs = [];
            reports.totalSales = 0;
            reports.successfulOrders = 0;
            reports.cancelledOrders = 0;
        }

        expenses.length = 0;
        imports.length = 0;
        inventory_audits.length = 0;
        shifts.length = 0;

        // Reset inventory quantities to 0
        inventory.forEach(item => {
            item.stock = 0;
            item.usageHistory = {};
        });

        // Reset counters
        nextQueueNumber = 1;
        customerIdCounter = 1;

        // 3. Force save all
        saveData();
        saveShifts();

        // Also explicitly save the arrays that aren't natively handled by saveData
        fs.writeFileSync(IMPORTS_FILE, JSON.stringify(imports, null, 4));
        fs.writeFileSync(INVENTORY_AUDITS_FILE, JSON.stringify(inventory_audits, null, 4));

        res.json({ success: true, folderName: backupFolderName });
    } catch (error) {
        console.error('[FACTORY RESET] Error:', error);
        res.status(500).json({ error: `Lỗi hệ thống: ${error.message}`, details: error.stack });
    }
});

app.delete('/api/promotions/:id', (req, res) => {
    const index = promotions.findIndex(p => p.id === req.params.id);
    if (index !== -1) {
        promotions.splice(index, 1);
        saveData();
        res.json({ success: true });
    } else {
        res.status(404).json({ success: false, message: 'Not found' });
    }
});
// ----------------------

// --- Expenses APIs ---
app.get('/api/expenses', (req, res) => res.json(expenses || []));

app.post('/api/expenses', (req, res) => {
    const expenseData = req.body;
    const id = expenseData.id || `exp-${Date.now()}`;
    const newExpense = { ...expenseData, id };

    const index = expenses.findIndex(e => e.id === id);
    if (index !== -1) {
        expenses[index] = { ...expenses[index], ...newExpense };
    } else {
        expenses.push(newExpense);
    }

    fs.writeFileSync(EXPENSES_FILE, JSON.stringify(expenses, null, 4));
    res.json({ success: true, expense: Object.assign({}, newExpense) });
});

app.delete('/api/expenses/:id', (req, res) => {
    const index = expenses.findIndex(e => e.id === req.params.id);
    if (index !== -1) {
        expenses.splice(index, 1);
        fs.writeFileSync(EXPENSES_FILE, JSON.stringify(expenses, null, 4));
        res.json({ success: true });
    } else {
        res.status(404).json({ success: false, message: 'Expense not found' });
    }
});

app.get('/api/inventory', (req, res) => res.json(inventory));

app.post('/api/inventory/update', (req, res) => {
    const { id, stock } = req.body;
    const item = inventory.find(i => i.id === id);
    if (item) {
        item.stock = stock;
        saveData();
        res.json({ success: true, item });
    } else res.status(404).json({ success: false });
});

// Upsert (create or update) full inventory item
app.post('/api/inventory/save', (req, res) => {
    const itemData = req.body;
    const id = itemData.id || `inv-${Date.now()}`;
    const index = inventory.findIndex(i => i.id === id);
    const newItem = { ...itemData, id };

    let isNameChanged = false;
    let oldName = '';

    if (index !== -1) {
        oldName = inventory[index].name;
        if (newItem.name && newItem.name !== oldName) {
            isNameChanged = true;
        }
        inventory[index] = { ...inventory[index], ...newItem };
    } else {
        inventory.push(newItem);
    }

    if (isNameChanged) {
        const newName = newItem.name;
        console.log(`[INVENTORY] Auto-syncing name change from "${oldName}" to "${newName}" for ID ${id}`);

        // Sync imports data
        imports.forEach(imp => {
            if (imp.ingredientId === id) imp.ingredientName = newName;
        });

        // Sync audits data (including PRODUCTION items)
        inventoryAudits.forEach(audit => {
            if (audit.ingredientId === id) audit.ingredientName = newName;

            if (audit.type === 'PRODUCTION') {
                if (audit.inputs) {
                    audit.inputs.forEach(input => {
                        if (input.name === oldName) input.name = newName;
                    });
                }
                if (audit.output && audit.output.name === oldName) {
                    audit.output.name = newName;
                }
            }
        });
    }

    saveData();
    res.json({ success: true, item: newItem });
});

// Bulk Import Receipts (Nhập Hàng Loạt Phiếu Nhập)
app.post('/api/imports/bulk', (req, res) => {
    const items = req.body;
    if (!Array.isArray(items)) {
        return res.status(400).json({ success: false, message: 'Dữ liệu không hợp lệ. Mong đợi một mảng (array).' });
    }

    let addedImports = 0;
    const newImportsData = [];

    items.forEach(itemData => {
        const { name, unit, importUnit, quantity, volumePerUnit, costPerUnit } = itemData;
        if (!name) return;

        let ingredient = inventory.find(i => i.name.toLowerCase().trim() === name.toLowerCase().trim());
        if (!ingredient) {
            ingredient = {
                id: `inv-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                name: name.trim(),
                unit: unit ? String(unit).trim() : 'g',
                stock: 0,
                minStock: 0,
                usageHistory: []
            };
            inventory.push(ingredient);
        }

        const qty = parseFloat(quantity) || 0;
        const vol = parseFloat(volumePerUnit) || 1;
        const cost = parseFloat(costPerUnit) || 0;

        if (qty <= 0) return; // Bỏ qua nếu số lượng nhập không hợp lệ

        const addedStock = qty * vol;
        const totalCost = qty * cost;

        ingredient.stock = parseFloat((ingredient.stock + addedStock).toFixed(3));

        const importData = {
            id: `imp-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            timestamp: getVNTime().toISOString(),
            ingredientId: ingredient.id,
            ingredientName: ingredient.name,
            importUnit: importUnit ? String(importUnit).trim() : 'hộp',
            quantity: qty,
            volumePerUnit: vol,
            costPerUnit: cost,
            totalCost: totalCost,
            addedStock: addedStock,
            baseUnit: ingredient.unit
        };
        imports.push(importData);
        newImportsData.push(importData);
        addedImports++;
    });

    if (addedImports > 0) {
        saveData();
    }

    res.json({
        success: true,
        message: `Import thành công. Đã nạp ${addedImports} phiếu nhập kho tự động.`,
        imports: newImportsData
    });
});
// Gộp Nguyên Liệu Trùng Lặp
app.post('/api/inventory/merge', (req, res) => {
    const { targetId, sourceIds } = req.body;

    if (!targetId || !sourceIds || !Array.isArray(sourceIds) || sourceIds.length === 0) {
        return res.status(400).json({ success: false, message: 'Dữ liệu gộp không hợp lệ.' });
    }

    const targetItem = inventory.find(i => i.id === targetId);
    if (!targetItem) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy nguyên liệu đích gốc.' });
    }

    // Force usageHistory to be object
    if (!targetItem.usageHistory || Array.isArray(targetItem.usageHistory)) {
        targetItem.usageHistory = {};
    }

    let addedStock = 0;
    const idsToRemove = sourceIds.filter(id => id !== targetId);

    if (idsToRemove.length === 0) {
        return res.json({ success: true, message: 'Không có nguyên liệu nào cần gộp.' });
    }

    idsToRemove.forEach(srcId => {
        const srcItem = inventory.find(i => i.id === srcId);
        if (srcItem) {
            addedStock += srcItem.stock || 0;
            // Merge usageHistory 
            if (srcItem.usageHistory && !Array.isArray(srcItem.usageHistory)) {
                Object.entries(srcItem.usageHistory).forEach(([dateStr, qty]) => {
                    targetItem.usageHistory[dateStr] = parseFloat(((targetItem.usageHistory[dateStr] || 0) + (qty || 0)).toFixed(3));
                });
            }
        }
    });

    targetItem.stock = parseFloat((targetItem.stock + addedStock).toFixed(3));

    // Remove source items from inventory
    for (let i = inventory.length - 1; i >= 0; i--) {
        if (idsToRemove.includes(inventory[i].id)) {
            inventory.splice(i, 1);
        }
    }

    // Update imports.json
    imports.forEach(imp => {
        if (idsToRemove.includes(imp.ingredientId)) {
            imp.ingredientId = targetId;
            imp.ingredientName = targetItem.name;
        }
    });

    // Update inventory_audits.json
    inventory_audits.forEach(audit => {
        if (idsToRemove.includes(audit.ingredientId)) {
            audit.ingredientId = targetId;
            audit.ingredientName = targetItem.name;
        }
        if (audit.type === 'PRODUCTION') {
            if (audit.inputs) {
                audit.inputs.forEach(input => {
                    if (idsToRemove.includes(input.id)) {
                        input.id = targetId;
                        input.name = targetItem.name;
                    }
                });
            }
            if (audit.output && idsToRemove.includes(audit.output.id)) {
                audit.output.id = targetId;
                audit.output.name = targetItem.name;
            }
        }
    });

    // Update menu.json recipes safely using map accumulation
    const updateRecipe = (recipe) => {
        if (!recipe || !Array.isArray(recipe)) return;

        let mergedMap = {}; // ingredientId -> qty
        recipe.forEach(r => {
            const finalId = idsToRemove.includes(r.ingredientId) ? targetId : r.ingredientId;
            mergedMap[finalId] = parseFloat(((mergedMap[finalId] || 0) + parseFloat(r.quantity || 0)).toFixed(3));
        });

        recipe.length = 0; // clear array in place
        for (const [id, qty] of Object.entries(mergedMap)) {
            recipe.push({ ingredientId: id, quantity: qty });
        }
    };

    menu.forEach(item => {
        updateRecipe(item.recipe);
        if (item.sizes) {
            item.sizes.forEach(size => updateRecipe(size.recipe));
        }
        if (item.addons) {
            item.addons.forEach(addon => updateRecipe(addon.recipe));
        }
    });

    saveData();
    res.json({ success: true, message: 'Gộp nguyên liệu thành công! Toàn bộ lịch sử và công thức món ăn đã tự cập nhật.' });
});

// Chế biến Bán Thành Phẩm (Production)
app.post('/api/inventory/produce', (req, res) => {
    const { inputs, outputItemName, outputUnit, outputQty, userName } = req.body;

    if (!inputs || !Array.isArray(inputs) || inputs.length === 0 || !outputItemName || !outputQty) {
        return res.status(400).json({ success: false, message: 'Dữ liệu đầu vào không hợp lệ' });
    }

    // Xác thực đủ hàng và tính toán tổng Giá Vốn (COGS)
    let totalCost = 0;
    for (const input of inputs) {
        const item = inventory.find(i => i.id === input.id);
        if (!item || item.stock < input.qty) {
            return res.status(400).json({ success: false, message: `Nguyên liệu ${item?.name || input.id} không đủ tồn kho để chế biến.` });
        }
        totalCost += (input.unitCost ?? item.importPrice ?? 0) * input.qty;
    }

    // Trừ kho nguyên liệu thô (Đầu vào)
    for (const input of inputs) {
        const item = inventory.find(i => i.id === input.id);
        item.stock -= input.qty;
    }

    // Tự động tìm hoặc tạo mới Bán Thành Phẩm (Đầu ra)
    let outItem = inventory.find(i => i.id === outputItemName || i.name.toLowerCase() === outputItemName.toLowerCase());

    if (!outItem) {
        // Khởi tạo mới Bán thành phẩm chưa có
        outItem = {
            id: `inv-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            name: outputItemName,
            stock: 0,
            unit: outputUnit || 'đơn vị',
            minStock: 0,
            importPrice: 0 // Will strictly rely on rolling average
        };
        inventory.push(outItem);
    }

    const currentStock = outItem.stock > 0 ? outItem.stock : 0;
    const oldTotalValue = currentStock * (outItem.importPrice || 0);
    const newTotalValue = oldTotalValue + totalCost;

    outItem.stock = currentStock + outputQty;

    // Thuật toán Trung bình lăn (Rolling Average) cập nhật lại giá vốn
    if (outItem.stock > 0) {
        // Giữ lại 3 chữ số thập phân (VD: 0.145 nghìn đồng = 145 VNĐ)
        outItem.importPrice = Math.round((newTotalValue / outItem.stock) * 1000) / 1000;
    }

    // Ghi sổ Audit theo vết
    inventory_audits.push({
        id: `audit-${Date.now()}`,
        timestamp: getVNTime().toISOString(),
        type: 'PRODUCTION',
        userName: userName || 'Admin',
        inputs: inputs.map(i => ({
            name: inventory.find(inv => inv.id === i.id)?.name || i.id,
            qty: i.qty
        })),
        output: {
            name: outItem.name,
            qty: outputQty
        },
        calculatedCost: totalCost
    });

    saveData();
    res.json({ success: true, item: outItem, totalCost });
});

app.delete('/api/inventory/:id', (req, res) => {
    const id = req.params.id;

    // Check if ingredient is used in any active menu item
    let usedInMenuName = null;
    for (const item of menu) {
        if (item.recipe?.some(r => r.ingredientId === id)) {
            usedInMenuName = item.name;
            break;
        }
        if (item.sizes?.some(s => s.recipe?.some(r => r.ingredientId === id))) {
            usedInMenuName = item.name;
            break;
        }
        if (item.addons?.some(a => a.recipe?.some(r => r.ingredientId === id))) {
            usedInMenuName = item.name;
            break;
        }
    }

    if (usedInMenuName) {
        return res.status(400).json({
            success: false,
            message: `Không thể xóa Nguyên Liệu này do đang được sử dụng trong công thức của món: ${usedInMenuName}`
        });
    }

    inventory = inventory.filter(i => i.id !== id);
    saveData();
    res.json({ success: true });
});

app.put('/api/inventory/:id/name', (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    let updatedHistory = false;
    const item = inventory.find(i => i.id === id);

    if (item) {
        console.log(`[INVENTORY] Renaming ingredient ${item.name} (ID: ${id}) to ${name.trim()}`);
        item.name = name.trim();
    }

    // Also update all historical import records for this ingredient
    imports.forEach(imp => {
        if (imp.ingredientId === id) {
            imp.ingredientName = name.trim();
            updatedHistory = true;
        }
    });

    if (!item && !updatedHistory) {
        return res.status(404).json({ error: 'Ingredient not found in active inventory or history' });
    }

    saveData();
    res.json({ success: true, name: name.trim() });
});

app.post('/api/inventory/reorder', (req, res) => {
    const { inventory: newInventory } = req.body;
    if (!Array.isArray(newInventory)) return res.status(400).json({ error: 'Array required' });

    // We update the global inventory array while keeping original objects to preserve references if any
    // but usually replacing the array is fine as long as we call saveData()
    inventory = newInventory;
    saveData();
    console.log("[INVENTORY] Reorder saved successfully.");
    res.json({ success: true });
});

app.get('/api/inventory/stats', (req, res) => {
    const todayStr = getVNDateStr();
    const past7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const past30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Calculate Average Cost per Unit for each ingredient
    const avgCosts = {}; // { ingredientId: { totalCost: 0, totalQty: 0, avg: 0 } }
    imports.forEach(imp => {
        if (imp.isDeleted) return;
        if (!imp.ingredientId) return;
        if (!avgCosts[imp.ingredientId]) avgCosts[imp.ingredientId] = { totalCost: 0, totalQty: 0 };
        avgCosts[imp.ingredientId].totalCost += imp.totalCost || 0;
        avgCosts[imp.ingredientId].totalQty += imp.addedStock || 0;
    });

    // Bán Thành Phẩm Production Integration for Average Cost calculation
    inventory_audits.forEach(audit => {
        if (audit.type === 'PRODUCTION' && audit.output && audit.calculatedCost !== undefined) {
            const invItem = inventory.find(i => i.name === audit.output.name);
            if (invItem) {
                const id = invItem.id;
                if (!avgCosts[id]) avgCosts[id] = { totalCost: 0, totalQty: 0 };
                avgCosts[id].totalCost += audit.calculatedCost || 0;
                avgCosts[id].totalQty += parseFloat(audit.output.qty) || 0;
            }
        }
    });
    Object.keys(avgCosts).forEach(id => {
        const item = avgCosts[id];
        item.avg = item.totalQty > 0 ? (item.totalCost / item.totalQty) : 0;
    });

    const result = inventory.map(item => {
        // Usage History defaults (from orders API)
        let use1 = 0, use7 = 0, use30 = 0, useAll = 0;
        if (item.usageHistory) {
            Object.entries(item.usageHistory).forEach(([dateStr, qty]) => {
                const q = parseFloat(qty) || 0;
                if (dateStr >= todayStr) use1 += q;
                if (dateStr >= past7) use7 += q;
                if (dateStr >= past30) use30 += q;
                useAll += q;
            });
        }

        // Add Usage tracking from Bán Thành Phẩm Production (Raw Materials taken from output loops)
        inventory_audits.forEach(audit => {
            if (audit.type === 'PRODUCTION' && audit.inputs) {
                const dateStr = audit.timestamp.split('T')[0];
                const inputMatch = audit.inputs.find(i => i.name === item.name || i.id === item.id);
                if (inputMatch) {
                    const q = parseFloat(inputMatch.qty) || 0;
                    if (dateStr >= todayStr) use1 += q;
                    if (dateStr >= past7) use7 += q;
                    if (dateStr >= past30) use30 += q;
                    useAll += q;
                }
            }
        });

        // Calculate Import Costs for periods
        let imp1 = 0, imp7 = 0, imp30 = 0, impAll = 0;
        imports.forEach(imp => {
            if (imp.isDeleted) return;
            if (imp.ingredientId !== item.id) return;
            const dateStr = imp.timestamp.split('T')[0];
            const cost = parseFloat(imp.totalCost) || 0;
            if (dateStr >= todayStr) imp1 += cost;
            if (dateStr >= past7) imp7 += cost;
            if (dateStr >= past30) imp30 += cost;
            impAll += cost;
        });

        // Add Import Costs tracking from Bán Thành Phẩm Production (Produced Goods values)
        inventory_audits.forEach(audit => {
            if (audit.type === 'PRODUCTION' && audit.output) {
                const dateStr = audit.timestamp.split('T')[0];
                const invItem = inventory.find(i => i.name === audit.output.name);
                if (invItem && invItem.id === item.id) {
                    const cost = parseFloat(audit.calculatedCost) || 0;
                    if (dateStr >= todayStr) imp1 += cost;
                    if (dateStr >= past7) imp7 += cost;
                    if (dateStr >= past30) imp30 += cost;
                    impAll += cost;
                }
            }
        });

        const avg = avgCosts[item.id]?.avg || 0;

        return {
            id: item.id,
            name: item.name,
            unit: item.unit,
            stock: item.stock,
            minStock: item.minStock,
            avgCost: parseFloat(avg.toFixed(3)),
            use1: parseFloat(use1.toFixed(3)),
            use7: parseFloat(use7.toFixed(3)),
            use30: parseFloat(use30.toFixed(3)),
            useAll: parseFloat(useAll.toFixed(3)),
            cost1: parseFloat((use1 * avg).toFixed(3)),
            cost7: parseFloat((use7 * avg).toFixed(3)),
            cost30: parseFloat((use30 * avg).toFixed(3)),
            costAll: parseFloat((useAll * avg).toFixed(3)),
            imp1: parseFloat(imp1.toFixed(3)),
            imp7: parseFloat(imp7.toFixed(3)),
            imp30: parseFloat(imp30.toFixed(3)),
            impAll: parseFloat(impAll.toFixed(3))
        };
    });
    res.json(result);
});

app.get('/api/inventory/stats/range', (req, res) => {
    const { start, end } = req.query; // Expected: YYYY-MM-DD
    if (!start || !end) return res.status(400).json({ error: 'Start and end dates required' });

    // Calculate Average Cost per Unit (always uses all history for accuracy)
    const avgCosts = {};
    imports.forEach(imp => {
        if (imp.isDeleted) return;
        if (!imp.ingredientId) return;
        if (!avgCosts[imp.ingredientId]) avgCosts[imp.ingredientId] = { totalCost: 0, totalQty: 0 };
        avgCosts[imp.ingredientId].totalCost += imp.totalCost || 0;
        avgCosts[imp.ingredientId].totalQty += imp.addedStock || 0;
    });
    Object.keys(avgCosts).forEach(id => {
        const item = avgCosts[id];
        item.avg = item.totalQty > 0 ? (item.totalCost / item.totalQty) : 0;
    });

    const result = inventory.map(item => {
        let usageQty = 0;
        if (item.usageHistory) {
            Object.entries(item.usageHistory).forEach(([dateStr, qty]) => {
                if (dateStr >= start && dateStr <= end) usageQty += qty;
            });
        }

        let importCost = 0;
        imports.forEach(imp => {
            if (imp.isDeleted) return;
            if (imp.ingredientId !== item.id) return;
            const dateStr = imp.timestamp.split('T')[0];
            if (dateStr >= start && dateStr <= end) importCost += imp.totalCost || 0;
        });

        const avg = avgCosts[item.id]?.avg || 0;

        return {
            id: item.id,
            name: item.name,
            unit: item.unit,
            stock: item.stock,
            minStock: item.minStock,
            avgCost: parseFloat(avg.toFixed(3)),
            usageQty: parseFloat(usageQty.toFixed(3)),
            usageCost: parseFloat((usageQty * avg).toFixed(3)),
            importCost: parseFloat(importCost.toFixed(3))
        };
    });
    res.json(result);
});

// --- IMPORTS API ---
app.get('/api/imports', (req, res) => res.json(imports));

app.post('/api/imports', (req, res) => {
    // req.body contains: name, unit, importUnit, quantity, volumePerUnit, costPerUnit
    const { name, unit, importUnit, quantity, volumePerUnit, costPerUnit } = req.body;

    let ingredient = inventory.find(i => i.name.toLowerCase().trim() === name.toLowerCase().trim());

    if (!ingredient) {
        ingredient = {
            id: `inv-${Date.now()}`,
            name: name.trim(),
            unit: unit.trim() || 'g',
            stock: 0,
            minStock: 0,
            usageHistory: []
        };
        inventory.push(ingredient);
    } // else we reuse the found ingredient id

    const addedStock = parseFloat(quantity) * parseFloat(volumePerUnit);
    const totalCost = parseFloat(quantity) * parseFloat(costPerUnit);

    ingredient.stock = parseFloat((ingredient.stock + addedStock).toFixed(3));

    const importData = {
        id: `imp-${Date.now()}`,
        timestamp: getVNTime().toISOString(),
        ingredientId: ingredient.id,
        ingredientName: ingredient.name,
        importUnit: importUnit || 'hộp',
        quantity: parseFloat(quantity),
        volumePerUnit: parseFloat(volumePerUnit),
        costPerUnit: parseFloat(costPerUnit),
        totalCost: totalCost,
        addedStock: addedStock,
        baseUnit: ingredient.unit
    };
    imports.push(importData);

    try {
        saveData();
    } catch (e) {
        console.error("Lỗi khi save data import:", e);
    }

    res.json({ success: true, import: importData, ingredient });
});

app.delete('/api/imports/:id', (req, res) => {
    const { id } = req.params;
    const importData = imports.find(imp => imp.id === id);
    if (!importData) return res.status(404).json({ error: 'Import not found' });
    if (importData.isDeleted) return res.json({ success: true, message: 'Already deleted' });

    importData.isDeleted = true;

    // Deduct stock from active inventory
    const ingredient = inventory.find(i => i.id === importData.ingredientId);
    if (ingredient) {
        const stockToDeduct = importData.addedStock !== undefined ? importData.addedStock : importData.quantity;
        ingredient.stock -= stockToDeduct;
        // Optional: allow negative stock to highlight mistakes or keep floor at 0
        // We let it go negative so admin knows exact deficit
    }

    saveData();
    res.json({ success: true, import: importData, ingredientUpdated: !!ingredient });
});

// --- STAFF API ---
app.get('/api/staff', (req, res) => {
    let migrated = false;
    staff.forEach(s => {
        if (!s.attendanceToken) {
            s.attendanceToken = Math.random().toString(36).substring(2, 12);
            migrated = true;
        }
    });
    if (migrated) {
        fs.writeFileSync(STAFF_FILE, JSON.stringify(staff, null, 4));
        console.log("Đã tạo token chấm công cho nhân viên cũ.");
    }
    res.json(staff);
});

// Get staff member by dynamic session token
app.get('/api/staff/check-token', (req, res) => {
    const { token, staffId } = req.query;
    if (!token || !staffId) return res.status(400).json({ success: false, message: 'Missing params' });

    const now = Date.now();
    const isValid = activeAttendanceTokens.some(t => t.token === token.toUpperCase() && t.expiresAt > now);

    if (!isValid) return res.status(403).json({ success: false, message: 'TOKEN_EXPIRED' });

    const member = staff.find(s => s.id === staffId);
    if (!member) return res.status(404).json({ success: false, message: 'Staff not found' });

    res.json({ success: true, member });
});

// Endpoint for Admin/POS to get the current valid attendance token
app.get('/api/attendance/token', (req, res) => {
    const now = Date.now();
    const active = activeAttendanceTokens.filter(t => t.expiresAt > now);
    res.json({ success: true, token: active[active.length - 1]?.token });
});

app.post('/api/staff', async (req, res) => {
    const updatedMember = req.body;

    if (!updatedMember.attendanceToken) {
        updatedMember.attendanceToken = Math.random().toString(36).substring(2, 15);
    }

    // Hash new PIN if provided
    if (updatedMember.newPin) {
        updatedMember.pin = await hashPassword(updatedMember.newPin);
        delete updatedMember.newPin; // Remove plain text PIN before saving
    }

    const index = staff.findIndex(s => s.id === updatedMember.id);
    if (index !== -1) {
        staff[index] = { ...staff[index], ...updatedMember };
    } else {
        if (!updatedMember.id) updatedMember.id = Date.now().toString();
        staff.push(updatedMember);
    }
    saveData();
    res.json({ success: true, member: updatedMember });
});

app.post('/api/staff/update', async (req, res) => {
    const updatedMember = req.body;

    if (!updatedMember.attendanceToken) {
        updatedMember.attendanceToken = Math.random().toString(36).substring(2, 15);
    }

    // Hash new PIN if provided
    if (updatedMember.newPin) {
        updatedMember.pin = await hashPassword(updatedMember.newPin);
        delete updatedMember.newPin; // Remove plain text PIN before saving
    }

    const index = staff.findIndex(s => s.id === updatedMember.id);
    if (index !== -1) {
        staff[index] = { ...staff[index], ...updatedMember };
    } else {
        if (!updatedMember.id) updatedMember.id = Date.now().toString();
        staff.push(updatedMember);
    }
    saveData();
    res.json({ success: true, member: updatedMember });
});


app.delete('/api/staff/:id', (req, res) => {
    staff = staff.filter(s => s.id !== req.params.id);
    saveData();
    res.json({ success: true });
});

// --- SHIFTS API ---
const SHIFTS_FILE = path.join(DATA_DIR, 'shifts.json');
let shifts = [];
if (fs.existsSync(SHIFTS_FILE)) { try { shifts = JSON.parse(fs.readFileSync(SHIFTS_FILE, 'utf8')); } catch (e) { console.error('Error parsing shifts.json', e); shifts = []; } }
const saveShifts = () => fs.writeFileSync(SHIFTS_FILE, JSON.stringify(shifts, null, 2));

app.get('/api/shifts', (req, res) => res.json(shifts));

app.post('/api/shifts', (req, res) => {
    const shift = { id: `shift-${Date.now()}`, createdAt: getVNTime().toISOString(), ...req.body };
    const idx = shifts.findIndex(s => s.id === shift.id);
    if (idx !== -1) shifts[idx] = { ...shifts[idx], ...req.body };
    else shifts.push(shift);
    saveShifts();
    res.json({ success: true, shift });
});

app.delete('/api/shifts/:id', (req, res) => {
    shifts = shifts.filter(s => s.id !== req.params.id);
    saveShifts();
    res.json({ success: true });
});

app.put('/api/shifts/:id', (req, res) => {
    const s = shifts.find(shift => shift.id === req.params.id);
    if (!s) return res.status(404).json({ success: false, message: 'Shift not found' });

    const { clockIn, clockOut, actualHours } = req.body;
    let changed = false;

    // Check if new data differs from old data
    if ((clockIn !== undefined && clockIn !== s.clockIn) ||
        (clockOut !== undefined && clockOut !== s.clockOut) ||
        (actualHours !== undefined && parseFloat(actualHours) !== s.actualHours)) {
        changed = true;
    }

    if (changed) {
        if (!s.editHistory) s.editHistory = [];
        s.editHistory.push({
            editedAt: getVNTime().toISOString(),
            previousClockIn: s.clockIn,
            previousClockOut: s.clockOut,
            previousHours: s.actualHours
        });
    }

    if (clockIn !== undefined) s.clockIn = clockIn;
    if (clockOut !== undefined) s.clockOut = clockOut;

    if (actualHours !== undefined) {
        s.actualHours = parseFloat(actualHours);
        // Recalculate totalPay if hourlyRate exists
        if (s.hourlyRate) {
            s.totalPay = Math.round(s.actualHours * parseFloat(s.hourlyRate));
        }
    }

    saveShifts();
    res.json({ success: true, shift: s });
});

// Clock-in / Clock-out
app.post('/api/shifts/:id/clockin', (req, res) => {
    const s = shifts.find(s => s.id === req.params.id);
    if (!s) return res.status(404).json({ success: false });
    s.clockIn = getVNTime().toISOString();
    saveShifts();
    res.json({ success: true, shift: s });
});

app.post('/api/shifts/:id/clockout', (req, res) => {
    const s = shifts.find(s => s.id === req.params.id);
    if (!s) return res.status(404).json({ success: false });
    s.clockOut = getVNTime().toISOString();
    // Calculate actual hours
    if (s.clockIn) {
        const diff = (new Date(s.clockOut) - new Date(s.clockIn)) / 3600000;
        s.actualHours = Math.round(diff * 10) / 10;

        // Match with staff to store hourlyRate at time of shift
        const member = staff.find(st => st.id === s.staffId);
        if (member) {
            s.hourlyRate = member.hourlyRate || 0;
            s.totalPay = Math.round(s.actualHours * (parseFloat(s.hourlyRate) || 0));
        }
    }
    saveShifts();
    res.json({ success: true, shift: s });
});

const createPhysicalDateVN = (dateStr, h, m) => {
    const yyyy = parseInt(dateStr.substring(0, 4));
    const mm = parseInt(dateStr.substring(5, 7)) - 1;
    const dd = parseInt(dateStr.substring(8, 10));
    return new Date(Date.UTC(yyyy, mm, dd, h - 7, m, 0));
};

// New simplified clock-in by staffId (for common use)
app.post('/api/attendance/clockin', (req, res) => {
    const { staffId, token } = req.body;

    // Verify Token
    if (token !== 'ADMIN_BYPASS') {
        const now = Date.now();
        const isTokenValid = activeAttendanceTokens.some(t => t.token === (token || '').toUpperCase() && t.expiresAt > now);
        if (!isTokenValid) {
            return res.status(403).json({ success: false, message: 'Mã QR đã hết hạn, vui lòng quét lại tại quầy.' });
        }
    }

    const member = staff.find(s => s.id === staffId);
    if (!member) return res.status(404).json({ success: false, message: 'Staff not found' });

    // Check for active shift
    const active = shifts.find(s => s.staffId === staffId && !s.clockOut);
    if (active) return res.status(400).json({ success: false, message: 'Đã vào ca trước đó' });

    const nowPhysical = new Date();
    // Tính toán ngày hiện tại theo đúng Múi giờ Việt Nam (UTC+7)
    const vnTimeT = new Date(nowPhysical.getTime() + 7 * 3600 * 1000);
    const todayStr = vnTimeT.toISOString().split('T')[0];

    // Auto-match schedule
    let matchedScheduleId = req.body.scheduleId || null;
    let shiftDateStr = todayStr;

    // Handle overnight shift matching in VN Time
    const currentHourVN = vnTimeT.getUTCHours();
    if (currentHourVN >= 0 && currentHourVN < 5) {
        const yesterdayVN = new Date(vnTimeT.getTime() - 24 * 3600 * 1000);
        shiftDateStr = yesterdayVN.toISOString().split('T')[0];
    }

    let status = 'ON_TIME';
    let isWithinWorkingHours = false;

    if (!matchedScheduleId) {
        const mySchedules = schedules.filter(sc => {
            const sIds = sc.staffIds || (sc.staffId ? [sc.staffId] : []);
            return sIds.includes(staffId) && sc.date === shiftDateStr;
        });

        for (const sc of mySchedules) {
            if (sc.startTime && sc.endTime) {
                const [sH, sM] = sc.startTime.split(':').map(Number);
                const [eH, eM] = sc.endTime.split(':').map(Number);

                const startLimit = createPhysicalDateVN(shiftDateStr, sH, sM);
                startLimit.setMinutes(startLimit.getMinutes() - 30); // Cho phép vào sớm 30p

                const endLimit = createPhysicalDateVN(shiftDateStr, eH, eM);
                endLimit.setMinutes(endLimit.getMinutes() + 30); // Cho phép vào trễ tối đa trước 30p đóng ca

                // Nếu ca xuyên đêm, cộng thêm 1 ngày cho endLimit
                if (eH < sH) {
                    endLimit.setTime(endLimit.getTime() + 24 * 3600 * 1000);
                }

                if (nowPhysical >= startLimit && nowPhysical <= endLimit) {
                    matchedScheduleId = sc.id;
                    isWithinWorkingHours = true;

                    const schedStart = createPhysicalDateVN(shiftDateStr, sH, sM);
                    const diffMin = (nowPhysical - schedStart) / 60000;
                    if (diffMin > 10) status = 'LATE';
                    break;
                }
            }
        }
    } else {
        isWithinWorkingHours = true;
    }

    if (!matchedScheduleId || !isWithinWorkingHours) {
        return res.status(403).json({ success: false, message: 'Ngoài giờ làm việc, không thể chấm công. Bạn chỉ được duyệt khi giờ hiện tại nằm đúng trong khung ca biểu (±30 phút).' });
    }

    // Tự động trừ điểm nếu đi trễ
    if (status === 'LATE') {
        const deductPoints = 2; // trừ 2 điểm
        const dLog = {
            id: `disc-${Date.now()}`,
            employeeId: staffId,
            date: todayStr,
            reason: 'Hệ thống tự động: Đi trễ so với lịch làm việc phân bổ (>10 phút)',
            pointsImpact: -deductPoints,
            type: 'RED_FLAG',
            createdAt: nowPhysical.toISOString()
        };
        disciplinary_logs.push(dLog);

        member.diligencePoints = (member.diligencePoints ?? 100) - deductPoints;
        saveData();
    }

    const shift = {
        id: `shift-${Date.now()}`,
        staffId,
        date: shiftDateStr, // Logical business date (overnight-aware)
        clockIn: nowPhysical.toISOString(),
        createdAt: nowPhysical.toISOString(),
        scheduleId: matchedScheduleId,
        status: status
    };
    shifts.push(shift);
    saveShifts();
    res.json({ success: true, shift });
});

// New simplified clock-out by staffId
app.post('/api/attendance/clockout', (req, res) => {
    const { staffId, token } = req.body;

    // Verify Token
    if (token !== 'ADMIN_BYPASS') {
        const now = Date.now();
        const isTokenValid = activeAttendanceTokens.some(t => t.token === (token || '').toUpperCase() && t.expiresAt > now);
        if (!isTokenValid) {
            return res.status(403).json({ success: false, message: 'Mã QR đã hết hạn, vui lòng quét lại tại quầy.' });
        }
    }

    const s = shifts.find(s => s.id === req.params.id || (s.staffId === staffId && !s.clockOut));
    if (!s) return res.status(404).json({ success: false, message: 'Không tìm thấy ca làm việc nào đang chạy.' });

    s.clockOut = getVNTime().toISOString();
    const diff = (new Date(s.clockOut) - new Date(s.clockIn)) / 3600000;
    s.actualHours = Math.round(diff * 10) / 10;

    const member = staff.find(st => st.id === s.staffId);
    if (member) {
        s.hourlyRate = member.hourlyRate || 0;
        s.totalPay = Math.round(s.actualHours * (parseFloat(s.hourlyRate) || 0));
    }

    saveShifts();
    res.json({ success: true, shift: s });
});

// --- SCHEDULES API ---
app.get('/api/schedules', (req, res) => res.json(schedules));

app.post('/api/schedules', (req, res) => {
    const scheduleList = Array.isArray(req.body) ? req.body : [req.body];
    const newSchedules = [];

    scheduleList.forEach(item => {
        let schedule = { createdAt: getVNTime().toISOString(), ...item };
        if (!schedule.id) {
            schedule.id = `sc-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        }

        const idx = schedules.findIndex(s => s.id === schedule.id);
        if (idx !== -1) {
            schedules[idx] = { ...schedules[idx], ...item };
        } else {
            schedules.push(schedule);
            newSchedules.push(schedule);
        }
    });

    saveData();
    res.json({ success: true, schedules: newSchedules });
});

app.put('/api/schedules/:id', (req, res) => {
    const s = schedules.find(shift => shift.id === req.params.id);
    if (!s) return res.status(404).json({ success: false, message: 'Schedule not found' });
    Object.assign(s, req.body);

    saveData();
    res.json({ success: true, schedule: s });
});

app.delete('/api/schedules/:id', (req, res) => {
    schedules = schedules.filter(s => s.id !== req.params.id);
    // Shift ID automatic deduction constraint is handled by front-end re-ordering or can be dynamic
    saveData();
    res.json({ success: true });
});

// --- DISCIPLINARY LOGS API ---
app.get('/api/disciplinary', (req, res) => res.json(disciplinary_logs));

app.post('/api/disciplinary', (req, res) => {
    const log = { id: `dl-${Date.now()}`, createdAt: getVNTime().toISOString(), ...req.body };
    disciplinary_logs.push(log);

    // Auto deduct point impact for employee if specified
    if (log.employeeId && log.pointsImpact) {
        const staffIndex = staff.findIndex(s => s.id === log.employeeId);
        if (staffIndex !== -1) {
            staff[staffIndex].diligencePoints = (parseFloat(staff[staffIndex].diligencePoints) || 100) + parseFloat(log.pointsImpact);
        }
    }
    saveData();
    res.json({ success: true, log });
});

app.delete('/api/disciplinary/:id', (req, res) => {
    const logIndex = disciplinary_logs.findIndex(d => d.id === req.params.id);
    if (logIndex !== -1) {
        const log = disciplinary_logs[logIndex];
        // Revert points if deleted
        if (log.employeeId && log.pointsImpact) {
            const staffIndex = staff.findIndex(s => s.id === log.employeeId);
            if (staffIndex !== -1) {
                staff[staffIndex].diligencePoints = (parseFloat(staff[staffIndex].diligencePoints) || 100) - parseFloat(log.pointsImpact);
            }
        }
        disciplinary_logs.splice(logIndex, 1);
        saveData();
    }
    res.json({ success: true });
});

// --- RATINGS API ---
const RATINGS_FILE = path.join(DATA_DIR, 'ratings.json');
let ratings = [];
if (fs.existsSync(RATINGS_FILE)) { try { ratings = JSON.parse(fs.readFileSync(RATINGS_FILE, 'utf8')); } catch (e) { console.error('Error parsing ratings.json', e); ratings = []; } }
let pendingRatings = []; // orderId queue for kiosk to show rating prompt
const saveRatings = () => fs.writeFileSync(RATINGS_FILE, JSON.stringify(ratings, null, 2));

// Trigger rating prompt for an order (called when order is PAID/COMPLETED)
app.post('/api/ratings/request/:orderId', (req, res) => {
    if (!pendingRatings.includes(req.params.orderId)) {
        pendingRatings.push(req.params.orderId);
    }
    res.json({ success: true });
});

// Kiosk polls this to see if there's a rating prompt waiting
app.get('/api/ratings/pending', (req, res) => {
    res.json(pendingRatings.length > 0 ? { orderId: pendingRatings[0] } : { orderId: null });
});

// Submit a rating (from Kiosk) 
app.post('/api/ratings', (req, res) => {
    const { orderId, stars, comment, staffId } = req.body;
    const rating = { id: `r-${Date.now()}`, orderId, stars, comment, staffId, timestamp: getVNTime().toISOString() };
    ratings.push(rating);
    pendingRatings = pendingRatings.filter(id => id !== orderId);
    saveRatings();
    res.json({ success: true, rating });
});

// Dismiss (skip) a rating
app.post('/api/ratings/dismiss/:orderId', (req, res) => {
    pendingRatings = pendingRatings.filter(id => id !== req.params.orderId);
    res.json({ success: true });
});

// Get all ratings (admin)
app.get('/api/ratings', (req, res) => {
    const { staffId, date } = req.query;
    let result = ratings;
    if (staffId) result = result.filter(r => r.staffId === staffId);
    if (date) result = result.filter(r => r.timestamp.startsWith(date));
    res.json(result);
});

app.get('/api/order/status/:id', (req, res) => {
    const { id } = req.params;
    const order = orders.find(o => o.id.toString() === id.toString());
    res.json(order || { status: 'NOT_FOUND' });
});


// --- SYSTEM API ---
app.get('/api/system/version', (req, res) => {
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
        res.json({ version: pkg.version });
    } catch (e) {
        res.status(500).json({ version: '1.0.0', error: "Could not read package.json" });
    }
});

// --- SETTINGS API ---
app.get('/api/settings', (req, res) => {
    res.json(settings);
});

app.get('/api/tunnel-status', (req, res) => {
    res.json(tunnelStatus);
});

app.post('/api/settings', (req, res) => {
    const oldToken = settings.cfToken;
    const oldCfEnabled = settings.cfEnabled;
    const oldTunnelType = settings.tunnelType;
    const oldDomain = settings.cfDomain;

    settings = { ...settings, ...req.body };
    saveData();

    // Restart tunnel if token changed or toggle flipped
    if (settings.cfToken !== oldToken || settings.cfDomain !== oldDomain || settings.tunnelType !== oldTunnelType || settings.cfEnabled !== oldCfEnabled) {
        if (settings.cfEnabled) {
            startTunnel();
        } else {
            stopTunnel();
        }
    }

    res.json({ success: true, settings });
});

// --- SERVE FRONTEND (For LAN Access in Production) ---
// In production (app packaged), the React frontend is built into the 'dist' folder.
// We serve it from Express so LAN devices can access it via port 5173.
const distPath = path.join(__dirname, 'dist');

// Rewrite relative requests for assets when loading from nested routes
app.use((req, res, next) => {
    if (req.url.includes('/assets/')) {
        req.url = req.url.substring(req.url.indexOf('/assets/'));
    }
    next();
});

app.use(express.static(distPath));
app.use('/data/receipts', express.static(RECEIPTS_DIR));

// --- ROUTING FIX FOR ELECTRON HASHTROUTER & CACHE BUSTING ---
// When the app runs on LAN, users scanning old QR codes
app.get('/item/:id', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.redirect(`/?t=${Date.now()}#/item/${req.params.id}`);
});
app.get('/bill', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.redirect(`/?t=${Date.now()}#/bill`);
});
app.get('/admin', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.redirect(`/?t=${Date.now()}#/admin`);
});
app.get('/kiosk', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.redirect(`/?t=${Date.now()}#/kiosk`);
});

// Fallback for missing old assets (Force browser reload to break cache)
app.use('/assets', (req, res) => {
    res.type('application/javascript');
    res.send('console.log("Old asset requested, forcing reload..."); window.location.href = "/?t=" + Date.now();');
});

// Catch-all route for React Router (must be the last route)
// Express 5 strict routing does not allow string '*'. We use generic middleware.
app.use((req, res, next) => {
    if (req.method === 'GET' && req.accepts('html')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.sendFile(path.join(distPath, 'index.html'));
    } else {
        next();
    }
});

// --- AUTO CLOCK-OUT FOR FORGOTTEN SHIFTS ---
const autoClockoutEndedShifts = () => {
    let modified = false;
    const nowTime = new Date();

    shifts.forEach(s => {
        if (!s.clockOut) {
            // Calculate shift day based on VN Time (UTC+7) to match schedules
            const clockInTime = new Date(s.clockIn);
            const vnTime = new Date(clockInTime.getTime() + 7 * 3600 * 1000);
            let shiftDay = vnTime.toISOString().split('T')[0];

            // Apply the same 0h-5h overnight logic as in clock-in
            if (vnTime.getUTCHours() < 5) {
                const yesterdayVN = new Date(vnTime.getTime() - 24 * 3600 * 1000);
                shiftDay = yesterdayVN.toISOString().split('T')[0];
            }

            const mySchedules = schedules.filter(sc => {
                const sIds = sc.staffIds || (sc.staffId ? [sc.staffId] : []);
                return sIds.includes(s.staffId) && sc.date === shiftDay;
            });

            if (mySchedules.length === 0) {
                // No schedule at all for this day
                s.clockOut = s.clockIn; // Neutralize shift
                s.actualHours = 0;
                s.totalPay = 0;
                modified = true;
                log(`Auto-closed UNSCHEDULED shift for staff ${s.staffId} (${s.id}).`);
            } else {
                let maxEndLimit = null;
                let exactEndTime = null;

                mySchedules.forEach(sc => {
                    if (sc.endTime) {
                        const [eH, eM] = sc.endTime.split(':').map(Number);
                        const scEnd = createPhysicalDateVN(sc.date, eH, eM);

                        // Handle overnight shift logical ending
                        const [sH, sM] = sc.startTime.split(':').map(Number);
                        if (eH < sH) {
                            scEnd.setTime(scEnd.getTime() + 24 * 3600 * 1000);
                        }

                        const limit = new Date(scEnd.getTime());
                        limit.setMinutes(limit.getMinutes() + 30); // Cho phép làm lố 30 hút trước khi auto-close

                        if (!maxEndLimit || limit > maxEndLimit) {
                            maxEndLimit = limit;
                            exactEndTime = scEnd;
                        }
                    }
                });

                if (maxEndLimit && nowTime > maxEndLimit) {
                    s.clockOut = exactEndTime.toISOString();
                    const diff = (exactEndTime.getTime() - new Date(s.clockIn).getTime()) / 3600000;
                    s.actualHours = Math.max(0, Math.round(diff * 10) / 10);
                    const member = staff.find(st => st.id === s.staffId);
                    if (member) {
                        s.hourlyRate = member.hourlyRate || 0;
                        s.totalPay = Math.round(s.actualHours * (parseFloat(member.hourlyRate) || 0));
                    }
                    modified = true;
                    log(`Auto-closed shift for staff ${s.staffId} (${s.id}) at shift endTime.`);
                }
            }
        }
    });

    if (modified) saveShifts();
};

const autoClockoutOldShifts = () => {
    let modified = false;
    const now = new Date();

    shifts.forEach(s => {
        if (!s.clockOut) {
            const clockInDate = new Date(s.clockIn);

            // Check if clockIn was from a previous day (before today at 00:00:00)
            const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

            if (clockInDate < startOfToday) {
                // Auto clock-out at 23:59:59 of the clockIn day
                const clockOutDate = new Date(clockInDate);
                clockOutDate.setHours(23, 59, 59, 999);

                s.clockOut = clockOutDate.toISOString();

                // Calculate hours
                const diff = (clockOutDate.getTime() - clockInDate.getTime()) / 3600000;
                s.actualHours = diff;

                // Calculate pay
                if (s.hourlyRate) {
                    s.totalPay = Math.round(s.actualHours * parseFloat(s.hourlyRate));
                }

                modified = true;
                log(`Auto-closed forgotten shift for staff ${s.staffId} (${s.id}) at ${s.clockOut}`);
            }
        }
    });

    if (modified) saveShifts();
};

app.listen(port, () => {
    console.log(`Cafe Server running at http://localhost:${port}`);

    // Run auto clock-out once on startup, then every hour
    autoClockoutOldShifts();
    autoClockoutEndedShifts();
    setInterval(autoClockoutOldShifts, 3600 * 1000);
    setInterval(autoClockoutEndedShifts, 60000);

    // Start Cloudflare Tunnel AFTER server is listening
    if (settings.cfEnabled) {
        startTunnel();
    }
});
