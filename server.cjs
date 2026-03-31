const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const db = require('./db.cjs');
const migrate = require('./migration.cjs');
const app = express();
const port = process.env.PORT || 3001;

const DATA_DIR = process.env.DATA_PATH || path.join(__dirname, 'data');

// --- CORE TIME HELPERS ---
const { parseDate, getCurrentISOString, getDateStr: getVNDateStr, getClientDateParts } = require('./src/utils/timeUtils.cjs');
const { calculateLiveOrderTax, calculateSimulatedTax } = require('./src/utils/taxUtils.cjs');

// Security Helpers
const isLocal = (req) => {
    let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    if (ip.includes(',')) ip = ip.split(',')[0].trim();
    
    // Kiểm tra trực tiếp loopback IPv6
    if (ip === '::1' || ip === '127.0.0.1') return true;

    // Chuẩn hóa IP (loại bỏ ::ffff: nếu có)
    const normalizedIp = ip.replace(/^.*:/, ''); 
    
    // Kiểm tra các dải LAN và localhost
    const isLan = normalizedIp === '127.0.0.1' || normalizedIp === 'localhost' || 
                 normalizedIp.startsWith('192.168.') || normalizedIp.startsWith('10.') || 
                 /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(normalizedIp);

    // Kiểm tra thêm qua Header Host nếu vẫn nghi ngờ
    const host = req.headers['host'] || '';
    const isLocalHost = host.startsWith('localhost:') || host.startsWith('127.0.0.1:') || host.startsWith('192.168.');

    return isLan || isLocalHost;
};
const isRemote = (req) => {
    // Nếu có header của Cloudflare hoặc không phải IP LAN
    const hasCf = !!req.headers['cf-ray'] || !!req.headers['cf-connecting-ip'];
    return hasCf || !isLocal(req);
};

// --- CRITICAL INITIALIZATION ---
// NOTE: Variables must be declared BEFORE loadData() or migrate() use them
let menu = [];
let reports = { totalSales: 0, successfulOrders: 0, cancelledOrders: 0, logs: [], fixedCosts: { rent: 0, machines: 0, electricity: 0, water: 0, salaries: 0, other: 0, useDynamicSalaries: false } };
let tables = [];
let inventory = [];
let staff = [];
let imports = [];
let expenses = []; 
let inventory_audits = []; 
let schedules = []; 
let disciplinary_logs = []; 
let roles = [];
let orders = [];
let promotions = [];
let shifts = [];

let nextQueueNumber = 1;
let customerIdCounter = 1;
let lastResetDate = getVNDateStr();
let completedNotifications = [];

let settings = {
    shopName: 'VIBE CAFE',
    shopSlogan: 'Tự chọn • Tự phục vụ',
    themeColor: '#F5A623',
    paymentQRShowOnKiosk: false, 
    headerImageUrl: null,
    featuredPromoImage: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?q=80&w=1000&auto=format&fit=crop',
    featuredPromoTitle: 'Cà phê đặc biệt hôm nay!',
    bankId: 'MB',
    accountNo: '0123456789',
    accountName: 'VIBE CAFE',
    customQrUrl: null,
    preferDynamicQr: true, 
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
    annualRevenueTier: 'UNDER_500M',
    taxMode: 'NONE', 
    taxRate: 0, 
    deductionTaxMode: 'INCLUSIVE', 
    deductionTaxRate: 8, 
    kitchenPrinterName: null,
    kitchenPaperSize: 'K80',
    kitchenFontSize: 14,
    kitchenLineGap: 1.5
};

// Migrate JSON to SQLite if needed BEFORE any other logic
migrate();
loadData();

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

// Helpers moved to top

const log = (msg) => {
    // Dùng new Date() chuẩn hóa log (TimeZone Hệ thống định đoạt)
    const vnDisplayObj = new Date();
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

// --- BACKUP & RESTORE APIs (PRIORITY) ---
app.get('/api/admin/backups', (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Chưa đăng nhập' });
        const token = authHeader.substring(7);
        const user = activeTokens.get(token);
        if (!user || user.role !== 'ADMIN') return res.status(403).json({ error: 'Không có quyền' });

        log(`[BACKUP] Request handled at PRIORITY route.`);
        const backupsDir = path.join(DATA_DIR, 'backups');
        if (!fs.existsSync(backupsDir)) return res.json([]);
        const folders = fs.readdirSync(backupsDir)
            .filter(f => fs.lstatSync(path.join(backupsDir, f)).isDirectory())
            .map(f => {
                const stats = fs.statSync(path.join(backupsDir, f));
                let type = 'Tự động';
                if (f.startsWith('manual_')) type = 'Thủ công';
                else if (f.startsWith('backup_khaitruong_')) type = 'Khai trương';
                else if (f.startsWith('pre_restore_')) type = 'Trước khôi phục';
                return { name: f, createdAt: stats.birthtime, type };
            })
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json(folders);
    } catch (e) {
        log(`[BACKUP ERROR] ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/admin/backups', (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Chưa đăng nhập' });
        const token = authHeader.substring(7);
        const user = activeTokens.get(token);
        if (!user || user.role !== 'ADMIN') return res.status(403).json({ error: 'Không có quyền' });

        log(`[BACKUP] POST Request handled at PRIORITY route.`);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFolderName = `manual_backup_${timestamp}`;
        const backupsDir = path.join(DATA_DIR, 'backups');
        const backupFolderPath = path.join(backupsDir, backupFolderName);
        
        if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });
        fs.mkdirSync(backupFolderPath, { recursive: true });

        const files = fs.readdirSync(DATA_DIR);
        for (const file of files) {
            if (file === 'backups') continue;
            fs.cpSync(path.join(DATA_DIR, file), path.join(backupFolderPath, file), { recursive: true });
        }
        res.json({ success: true, folderName: backupFolderName });
    } catch (e) {
        log(`[BACKUP ERROR] ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/admin/backups/:folder/restore', (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Chưa đăng nhập' });
        const token = authHeader.substring(7);
        const user = activeTokens.get(token);
        if (!user || user.role !== 'ADMIN') return res.status(403).json({ error: 'Không có quyền' });

        const folderName = req.params.folder;
        const backupSourcePath = path.join(DATA_DIR, 'backups', folderName);
        if (!fs.existsSync(backupSourcePath)) return res.status(404).json({ error: 'Không tìm thấy bản sao lưu' });

        log(`[RESTORE] Priority route restore from: ${folderName}`);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const preRestoreBackup = path.join(DATA_DIR, 'backups', `pre_restore_${timestamp}`);
        fs.mkdirSync(preRestoreBackup, { recursive: true });
        fs.readdirSync(DATA_DIR).forEach(file => {
            if (file !== 'backups') fs.cpSync(path.join(DATA_DIR, file), path.join(preRestoreBackup, file), { recursive: true });
        });

        db.close();
        const backupFiles = fs.readdirSync(backupSourcePath);
        for (const file of backupFiles) {
            fs.cpSync(path.join(backupSourcePath, file), path.join(DATA_DIR, file), { recursive: true });
        }
        db.reconnect();
        loadData();
        res.json({ success: true });
    } catch (e) {
        console.error('[RESTORE ERROR]', e);
        try { db.reconnect(); } catch (re) {}
        res.status(500).json({ error: `Lỗi khôi phục: ${e.message}` });
    }
});

app.delete('/api/admin/backups/:folder', (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Chưa đăng nhập' });
        const token = authHeader.substring(7);
        const user = activeTokens.get(token);
        if (!user || user.role !== 'ADMIN') return res.status(403).json({ error: 'Không có quyền' });

        const folderName = req.params.folder;
        const backupPath = path.join(DATA_DIR, 'backups', folderName);
        if (!fs.existsSync(backupPath)) return res.status(404).json({ error: 'Không tìm thấy bản sao lưu' });

        log(`[BACKUP] DELETE Request for folder: ${folderName}`);
        if (!backupPath.startsWith(path.join(DATA_DIR, 'backups'))) return res.status(403).json({ error: 'Đường dẫn không hợp lệ' });

        fs.rmSync(backupPath, { recursive: true, force: true });
        res.json({ success: true });
    } catch (e) {
        log(`[BACKUP ERROR] ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

// Debug middleware to log all API requests (Disabled to reduce noise)
/*
app.use((req, res, next) => {
    if (req.url.startsWith('/api')) {
        log(`[API REQUEST] ${req.method} ${req.url}`);
    }
    next();
});
*/

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

app.get('/api/auth/check-connection', (req, res) => {
    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    res.json({ success: true, isRemote: isRemote(req), ip: rawIp, isLocal: isLocal(req) });
});

app.post('/api/auth/login', (req, res) => {
    const { type, username, password, staffId, pin } = req.body;
    if (type === 'admin') {
        if (username === settings.adminUsername && verifyPassword(password, settings.adminPassword)) {
            const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
            const permissions = getRolePermissions('admin', 'Quản lý');
            const roleName = 'Quản lý';
            activeTokens.set(token, { role: 'ADMIN', name: 'Quản lý', permissions, roleName });
            return res.json({ success: true, token, role: 'ADMIN', name: 'Quản lý', permissions, roleName });
        }
        return res.status(401).json({ success: false, message: 'Sai tên đăng nhập hoặc mật khẩu!' });
    } else if (type === 'staff') {
        const s = staff.find(st => st.id === staffId);
        if (s && verifyPassword(pin, s.pin)) {
            // [REMOTE RESTRICTION] Chỉ cho phép Admin truy cập từ xa
            if (isRemote(req)) {
                log(`[SECURITY] Chặn Nhân viên ${s.name} đăng nhập từ xa.`);
                return res.status(403).json({ success: false, message: 'Nhân viên chỉ được phép đăng nhập trong mạng nội bộ (LAN) của quán.' });
            }

            const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
            const roleObj = roles.find(r => r.id === s.roleId);
            const roleName = roleObj ? roleObj.name : s.role;
            const permissions = getRolePermissions(s.roleId, roleName);
            activeTokens.set(token, { role: 'STAFF', staffId: s.id, name: s.name, permissions, roleName });
            return res.json({ success: true, token, role: 'STAFF', staffId: s.id, name: s.name, permissions, roleName });
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
    saveData();
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
    saveData();
    log(`Staff PIN changed for ID: ${staffId}`);
    res.json({ success: true, message: 'Đổi mã PIN thành công' });
});

// --- Code Recovery Login ---
app.post('/api/auth/login-recovery-code', (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ success: false, message: 'Vui lòng nhập Mã khôi phục.' });

    // [SECURITY] Chặn dùng mã khôi phục từ xa để tránh Hacker tấn công brute-force từ Internet
    if (isRemote(req)) {
        log(`[SECURITY] Chặn truy cập Mã khôi phục từ Remote.`);
        return res.status(403).json({ success: false, message: 'Tính năng Khôi phục không khả dụng khi truy cập từ xa để đảm bảo bảo mật. Vui lòng thực hiện trong mạng LAN.' });
    }

    const token = Math.random().toString(36).substring(2) + Date.now().toString(36);

    if (settings.adminRecoveryCode && code.trim().toUpperCase() === settings.adminRecoveryCode.toUpperCase()) {
        const roleName = 'Quản lý';
        activeTokens.set(token, { role: 'ADMIN', name: 'Quản lý', permissions, roleName });
        log(`Admin logged in via recovery code`);
        return res.json({ success: true, token, role: 'ADMIN', name: 'Quản lý', permissions, roleName, requirePasswordChange: true });
    }

    const s = staff.find(st => st.recoveryCode && st.recoveryCode.toUpperCase() === code.trim().toUpperCase());
    if (s) {
        const roleObj = roles.find(r => r.id === s.roleId);
        const roleName = roleObj ? roleObj.name : s.role;
        const permissions = getRolePermissions(s.roleId, roleName);
        activeTokens.set(token, { role: 'STAFF', staffId: s.id, name: s.name, permissions, roleName });
        log(`Staff ${s.name} logged in via recovery code`);
        return res.json({ success: true, token, role: 'STAFF', staffId: s.id, name: s.name, permissions, roleName, requirePasswordChange: true });
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
    // Sync: Lấy role name mới nhất từ bảng Roles theo roleId
    const publicStaff = staff.filter(s => !s.isDeleted).map(s => {
        const roleObj = roles.find(r => r.id === s.roleId);
        return {
            id: s.id,
            name: s.name,
            role: roleObj ? roleObj.name : s.role
        };
    });
    res.json(publicStaff);
});

// Middleware bảo mật phân quyền (RBAC)
app.use('/api', (req, res, next) => {
    const path = req.path;

    // Bỏ qua xác thực cho các route auth
    if (path.startsWith('/auth')) return next();

    // Các API dành cho khách hàng Kiosk / Menu Quét Mã (Public)
    if (req.method === 'GET') {
        if (['/menu', '/inventory', '/settings', '/qr-info', '/qr-token', '/lan-info', '/order/status', '/staff/public', '/attendance', '/notifications', '/staff/check-token', '/shifts', '/orders', '/promotions'].some(p => path.startsWith(p))) {
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

    // Tạm thời nới lỏng Check Auth cho DELETE /api/imports (Xử lý dữ liệu rác trong Development)
    if (req.method === 'DELETE' && path.startsWith('/imports/')) {
        return next();
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
// Variables moved to top for hoisting safety

// --- CALL LOAD DATA ---
// (Already called at top of file after migrate())

function loadData() {
    try {
        // Load Settings
        const settingsRows = db.prepare('SELECT * FROM settings').all();
        settingsRows.forEach(row => {
            try { settings[row.key] = JSON.parse(row.value); } catch (e) { settings[row.key] = row.value; }
        });

        // Load Menu
        const menuRows = db.prepare('SELECT * FROM menu').all();
        menu = menuRows.map(row => ({
            ...row,
            sizes: JSON.parse(row.sizes || '[]'),
            addons: JSON.parse(row.addons || '[]'),
            recipe: JSON.parse(row.recipe || '[]'),
            sugarOptions: JSON.parse(row.sugarOptions || '[]'),
            iceOptions: JSON.parse(row.iceOptions || '[]'),
            isDeleted: !!row.isDeleted
        }));

        // Load Reports
        const reportsRow = db.prepare('SELECT * FROM reports WHERE id = 1').get();
        if (reportsRow) {
            reports = {
                ...reports,
                totalSales: reportsRow.totalSales,
                successfulOrders: reportsRow.successfulOrders,
                cancelledOrders: reportsRow.cancelledOrders,
                lastResetDate: reportsRow.lastResetDate,
                customerIdCounter: reportsRow.customerIdCounter,
                nextQueueNumber: reportsRow.nextQueueNumber,
                fixedCosts: JSON.parse(reportsRow.fixedCosts || '{}'),
                logs: []
            };
            const logRows = db.prepare('SELECT data FROM report_logs ORDER BY id DESC LIMIT 1000').all();
            reports.logs = logRows.map(row => JSON.parse(row.data));
        }

        // Load Tables, Inventory, Staff, Roles, Promotions, Orders
        tables = db.prepare('SELECT * FROM tables').all();
        inventory = db.prepare('SELECT * FROM inventory').all().map(row => ({ ...row, usageHistory: JSON.parse(row.usageHistory || '{}') }));
        staff = db.prepare('SELECT * FROM staff').all().map(row => {
            const { data, ...rest } = row;
            return { ...JSON.parse(data || '{}'), ...rest, isDeleted: !!rest.isDeleted };
        });
        roles = db.prepare('SELECT * FROM roles').all().map(row => ({ ...row, permissions: JSON.parse(row.permissions || '{}') }));
        promotions = db.prepare('SELECT * FROM promotions').all().map(row => JSON.parse(row.data || '{}'));
        orders = db.prepare('SELECT * FROM orders').all().map(row => ({
            ...row,
            options: JSON.parse(row.options || '{}'),
            cartItems: JSON.parse(row.cartItems || '[]'),
            isPaid: !!row.isPaid
        }));

        // Load Metadata
        imports = db.prepare('SELECT * FROM imports').all();
        expenses = db.prepare('SELECT * FROM expenses').all().map(e => ({ ...e, date: e.date || e.timestamp }));
        inventory_audits = db.prepare('SELECT * FROM inventory_audits').all().map(row => {
            const { data, ...rest } = row;
            return { ...JSON.parse(data || '{}'), ...rest };
        });
        schedules = db.prepare('SELECT * FROM schedules').all().map(row => {
            const { data, ...rest } = row;
            return { ...JSON.parse(data || '{}'), ...rest };
        });

        // --- AUTO-CLEANUP: Loại bỏ bản ghi trùng lặp (Ngày + Nhân viên + Mẫu ca) ---
        const initialCount = schedules.length;
        const cleanedSchedules = [];
        const seenSchedules = new Set();
        schedules.forEach(s => {
            const key = `${s.date}-${s.staffId || 'none'}-${s.templateId || 'none'}`;
            if (!seenSchedules.has(key)) {
                cleanedSchedules.push(s);
                seenSchedules.add(key);
            }
        });
        if (cleanedSchedules.length < initialCount) {
            console.log(`[CLEANUP] Đã loại bỏ ${initialCount - cleanedSchedules.length} bản ghi ca làm trùng lặp.`);
            schedules = cleanedSchedules;
        }

        // --- KHAI TỬ GHOST: Wipe clean toàn bộ ca Cố định/Template từ 01/04/2026 trở đi (Yêu cầu người dùng) ---
        const initialSchedulesCount = schedules.length;
        const APRIL_1ST = '2026-04-01';
        
        schedules = schedules.filter(s => {
            const isFuture = (s.date || '') >= APRIL_1ST;
            const isAutoGenerated = s.isFixed || s.templateId;
            // GIỮ LẠI: (Không phải tương lai) HOẶC (Không phải tự động sinh)
            // Nói cách khác: XÓA nếu (là tương lai VÀ là tự động sinh)
            return !(isFuture && isAutoGenerated);
        });

        if (schedules.length < initialSchedulesCount) {
            console.log(`[WIPE CLEAN] Đã quy hoạch lại tháng 4. Xóa ${initialSchedulesCount - schedules.length} bản ghi Cố định/Thumbnail.`);
        }
        // saveData() sẽ được gọi ở cuối loadData() để lưu lại trạng thái sạch rác
        disciplinary_logs = db.prepare('SELECT * FROM disciplinary_logs').all();

        const shiftRows = db.prepare('SELECT * FROM shifts').all();
        shifts = shiftRows.map(row => ({ ...row, editHistory: JSON.parse(row.editHistory || '[]') }));

        // --- BACKWARDS COMPATIBILITY & DEFAULTS ---
        let settingsUpdated = false;
        if (!settings.adminUsername) { settings.adminUsername = 'admin'; settingsUpdated = true; }
        if (!settings.adminPassword) { settings.adminPassword = hashPassword('adminpassword'); settingsUpdated = true; }
        // ... (Other settings checks)
        if (settingsUpdated) saveData();

    } catch (e) {
        console.error('Error loading data from SQLite:', e);
    }

    // Logic to fix and reset counter daily
    // Lấy ngày chính xác để lưu log
    const nowVNObj = new Date();
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
    lastResetDate = reports.lastResetDate || todayVNStr;
    saveData();

    // Đồng nhất ID cho dữ liệu cũ (Chạy sau khi đã load hết inventory)
    normalizeInventoryIds();
};

/** 
 * DI TRÚ DỮ LIỆU: Đồng nhất ID cho các bản ghi cũ chỉ có Tên 
 * Chạy 1 lần khi khởi động máy chủ để gắn kết lịch sử với danh mục hiện tại.
 */
function normalizeInventoryIds() {
    console.log('--- [Migration] Bắt đầu đồng nhất ID Nguyên liệu ---');
    const nameMap = {};
    inventory.forEach(item => {
        if (item.name) {
            nameMap[item.name.toLowerCase().trim()] = { id: item.id, unit: item.unit };
        }
    });

    let updatedAudits = 0;
    inventory_audits.forEach(audit => {
        let changed = false;
        
        // 1. Với các bản ghi Kiểm kê/Hao hụt thông thường (loại cũ chưa có ID)
        if (!audit.ingredientId && audit.ingredientName) {
            const match = nameMap[audit.ingredientName.toLowerCase().trim()];
            if (match) {
                audit.ingredientId = match.id;
                audit.unit = audit.unit || match.unit;
                changed = true;
            }
        }

        // 2. Với các bản ghi Chế biến (PRODUCTION)
        if (audit.type === 'PRODUCTION') {
            if (audit.inputs) {
                audit.inputs.forEach(input => {
                    if (!input.id && input.name) {
                        const match = nameMap[input.name.toLowerCase().trim()];
                        if (match) {
                            input.id = match.id;
                            input.unit = input.unit || match.unit;
                            changed = true;
                        }
                    }
                });
            }
            if (audit.output && !audit.output.id && audit.output.name) {
                const match = nameMap[audit.output.name.toLowerCase().trim()];
                if (match) {
                    audit.output.id = match.id;
                    audit.output.unit = audit.output.unit || match.unit;
                    changed = true;
                }
            }
        }

        if (changed) updatedAudits++;
    });

    let updatedImports = 0;
    imports.forEach(imp => {
        if (!imp.ingredientId && imp.ingredientName) {
            const match = nameMap[imp.ingredientName.toLowerCase().trim()];
            if (match) {
                imp.ingredientId = match.id;
                updatedImports++;
            }
        }
    });

    if (updatedAudits > 0 || updatedImports > 0) {
        console.log(`[Migration] Đã đồng nhất ${updatedAudits} bản ghi Audit và ${updatedImports} bản ghi Nhập kho.`);
        saveData(); // Lưu lại vào SQLite
    } else {
        console.log('[Migration] Không có dữ liệu cần đồng nhất.');
    }
}

function saveData() {
    try {
        db.transaction(() => {
            // Save Settings
            for (const [key, value] of Object.entries(settings)) {
                db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, JSON.stringify(value));
            }

            // Save Menu
            const clearMenu = db.prepare('DELETE FROM menu');
            clearMenu.run();
            const insertMenu = db.prepare(`
                INSERT INTO menu (id, name, category, price, rating, volume, description, shortcutCode, image, sizes, addons, recipe, sugarOptions, iceOptions, defaultSugar, defaultIce, recipeInstructions, isDeleted)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            for (const item of menu) {
                insertMenu.run(
                    item.id, item.name, item.category, item.price, item.rating, item.volume, item.description,
                    item.shortcutCode, item.image, JSON.stringify(item.sizes || []), JSON.stringify(item.addons || []),
                    JSON.stringify(item.recipe || []), JSON.stringify(item.sugarOptions || []),
                    JSON.stringify(item.iceOptions || []), item.defaultSugar, item.defaultIce, item.recipeInstructions || '',
                    item.isDeleted ? 1 : 0
                );
            }

            // Save Reports & Logs
            db.prepare(`
                INSERT OR REPLACE INTO reports (id, totalSales, successfulOrders, cancelledOrders, lastResetDate, customerIdCounter, nextQueueNumber, fixedCosts)
                VALUES (1, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                reports.totalSales || 0, reports.successfulOrders || 0, reports.cancelledOrders || 0,
                reports.lastResetDate, reports.customerIdCounter || 1, reports.nextQueueNumber || 1, JSON.stringify(reports.fixedCosts || {})
            );
            
            // Note: report_logs are usually appended as they happen, not saved in bulk here to avoid duplicates.
            // But for consistency with the existing saveData logic, if we must:
            // (In a real DB app, we'd only insert new logs)

            // Save Tables
            db.prepare('DELETE FROM tables').run();
            const insertTable = db.prepare('INSERT INTO tables (id, name, status, currentOrderId) VALUES (?, ?, ?, ?)');
            for (const t of tables) {
                insertTable.run(t.id, t.name, t.status, t.currentOrderId);
            }

            // Save Inventory
            db.prepare('DELETE FROM inventory').run();
            const insertInv = db.prepare('INSERT INTO inventory (id, name, unit, stock, minStock, usageHistory) VALUES (?, ?, ?, ?, ?, ?)');
            for (const i of inventory) {
                insertInv.run(i.id, i.name, i.unit, i.stock, i.minStock, JSON.stringify(i.usageHistory || {}));
            }

            // Save Staff
            db.prepare('DELETE FROM staff').run();
            const insertStaff = db.prepare('INSERT INTO staff (id, name, roleId, pin, attendanceToken, recoveryCode, isDeleted, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
            for (const s of staff) {
                insertStaff.run(s.id, s.name, s.roleId, s.pin, s.attendanceToken, s.recoveryCode, s.isDeleted ? 1 : 0, JSON.stringify(s));
            }

            // Save Orders (Active)
            db.prepare('DELETE FROM orders').run();
            const insertOrder = db.prepare(`
                INSERT INTO orders (id, queueNumber, customerId, deviceId, itemName, customerName, price, timestamp, note, options, cartItems, tableId, status, isPaid)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            for (const o of orders) {
                insertOrder.run(
                    o.id, o.queueNumber, o.customerId, o.deviceId, o.itemName, o.customerName,
                    o.price, o.timestamp, o.note, JSON.stringify(o.options || {}),
                    JSON.stringify(o.cartItems || []), o.tableId, o.status, o.isPaid ? 1 : 0
                );
            }

            // Save Roles
            db.prepare('DELETE FROM roles').run();
            const insertRole = db.prepare('INSERT INTO roles (id, name, permissions) VALUES (?, ?, ?)');
            for (const r of roles) {
                insertRole.run(r.id, r.name, JSON.stringify(r.permissions));
            }

            // Save others (Audits, Imports, etc.) - TỐI ƯU HÓA: HISTORY DATA CHI DÙNG UPSERT, KHÔNG DELETE!
            const insertImport = db.prepare(`
                INSERT OR REPLACE INTO imports (id, timestamp, ingredientId, ingredientName, importUnit, quantity, volumePerUnit, costPerUnit, totalCost, addedStock, baseUnit, supplier, isDeleted)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            for (const imp of imports) {
                insertImport.run(
                    imp.id, imp.timestamp, imp.ingredientId, imp.ingredientName, imp.importUnit, 
                    imp.quantity, imp.volumePerUnit, imp.costPerUnit, imp.totalCost, imp.addedStock, imp.baseUnit, imp.supplier || '', imp.isDeleted ? 1 : 0
                );
            }

            const insertAudit = db.prepare('INSERT OR REPLACE INTO inventory_audits (id, timestamp, orderId, data) VALUES (?, ?, ?, ?)');
            for (const audit of inventory_audits) {
                insertAudit.run(audit.id, audit.timestamp, audit.orderId, JSON.stringify(audit));
            }

            db.prepare('DELETE FROM promotions').run(); // Active state
            const insertPromo = db.prepare('INSERT INTO promotions (id, name, description, isActive, data) VALUES (?, ?, ?, ?, ?)');
            for (const p of promotions) {
                insertPromo.run(p.id, p.name, p.description, p.isActive ? 1 : 0, JSON.stringify(p));
            }

            const insertSched = db.prepare('INSERT OR REPLACE INTO schedules (id, staffId, date, shiftId, data) VALUES (?, ?, ?, ?, ?)');
            for (const s of schedules) {
                insertSched.run(s.id, s.staffId || null, s.date, s.shiftId || null, JSON.stringify(s));
            }

            const insertDisc = db.prepare('INSERT OR REPLACE INTO disciplinary_logs (id, staffId, timestamp, type, note, points) VALUES (?, ?, ?, ?, ?, ?)');
            for (const d of disciplinary_logs) {
                insertDisc.run(d.id, d.staffId, d.timestamp, d.type, d.note, d.points);
            }

            const insertExp = db.prepare('INSERT OR REPLACE INTO expenses (id, name, timestamp, category, amount, note, staffId) VALUES (?, ?, ?, ?, ?, ?, ?)');
            for (const e of expenses) {
                insertExp.run(e.id, e.name || '', e.timestamp || e.date || '', e.category, e.amount, e.note, e.staffId);
            }

            const insertShift = db.prepare('INSERT OR REPLACE INTO shifts (id, staffId, createdAt, clockIn, clockOut, actualHours, hourlyRate, totalPay, editHistory) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
            for (const s of shifts) {
                insertShift.run(s.id, s.staffId, s.createdAt, s.clockIn, s.clockOut, s.actualHours, s.hourlyRate || 0, s.totalPay || 0, JSON.stringify(s.editHistory || []));
            }
        })();
    } catch (e) {
        console.error('Error saving data to SQLite:', e);
    }
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
    tunnelStatus.lastStarted = Date.now();
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

// Helper to get permissions by role ID or legacy role name
const getRolePermissions = (roleId, roleName) => {
    // 1. Try to find by roleId
    let role = roles.find(r => r.id === roleId);
    
    // 2. Fallback to legacy role name mapping if roleId is missing
    if (!role && roleName) {
        const nameMap = {
            'Quản lý': 'manager',
            'Pha chế': 'kitchen',
            'Phục vụ': 'waiter',
            'Nhân viên': 'staff'
        };
        const mappedId = nameMap[roleName];
        if (mappedId) {
            role = roles.find(r => r.id === mappedId);
        }
    }
    
    // 3. Fallback to system admin if it's the hardcoded ADMIN
    if (!role && (roleId === 'ADMIN' || roleId === 'admin')) {
        role = roles.find(r => r.id === 'admin');
    }

    // Default permissions if nothing found (very restrictive)
    return role ? role.permissions : {
        orders: "none",
        menu: "none",
        inventory: "none",
        staff: "none",
        reports: "none"
    };
};

// loadData(); // Moved to the very end


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

const handleInventoryForOrder = (order, isRefund = false) => {
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
                    
                    if (isRefund) {
                        ingredient.stock = parseFloat((ingredient.stock + usedQty).toFixed(3));
                    } else {
                        ingredient.stock = parseFloat((ingredient.stock - usedQty).toFixed(3));
                    }
                    
                    if (!orderDeductions[ingredient.id]) orderDeductions[ingredient.id] = 0;
                    orderDeductions[ingredient.id] += usedQty;

                    if (!ingredient.usageHistory || Array.isArray(ingredient.usageHistory)) ingredient.usageHistory = {};
                    const todayStr = getVNDateStr();
                    
                    if (isRefund) {
                        ingredient.usageHistory[todayStr] = Math.max(0, parseFloat(((ingredient.usageHistory[todayStr] || 0) - usedQty).toFixed(3)));
                        console.log(`[INVENTORY] Refunded ${usedQty} ${ingredient.unit} to ${ingredient.name} (${contextString})`);
                    } else {
                        ingredient.usageHistory[todayStr] = parseFloat(((ingredient.usageHistory[todayStr] || 0) + usedQty).toFixed(3));
                        console.log(`[INVENTORY] Deducted ${usedQty} ${ingredient.unit} from ${ingredient.name} (${contextString})`);
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

    if (Object.keys(orderDeductions).length > 0) {
        const auditInputs = Object.entries(orderDeductions).map(([invId, qty]) => {
            const inv = inventory.find(i => i.id === invId);
            return {
                id: invId,
                name: inv?.name || invId,
                qty: parseFloat(qty.toFixed(3)),
                unit: inv?.unit || '',
                costDifference: isRefund 
                    ? parseFloat((qty * (inv?.importPrice || 0)).toFixed(0)) 
                    : parseFloat((-(qty * (inv?.importPrice || 0))).toFixed(0))
            };
        });

        inventory_audits.push({
            id: `audit-order-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            timestamp: getCurrentISOString(),
            type: isRefund ? 'ORDER_REFUND' : 'ORDER',
            orderId: order.id || '',
            queueNumber: order.queueNumber || 0,
            userName: 'Hệ thống',
            inputs: auditInputs
        });
    }
};

// --- INVENTORY STATS HELPER ---
const getInternalAvgCosts = () => {
    const avgCosts = {}; 
    imports.forEach(imp => {
        if (imp.isDeleted || !imp.ingredientId) return;
        if (!avgCosts[imp.ingredientId]) avgCosts[imp.ingredientId] = { totalCost: 0, totalQty: 0 };
        avgCosts[imp.ingredientId].totalCost += imp.totalCost || 0;
        avgCosts[imp.ingredientId].totalQty += imp.addedStock || 0;
    });
    // Bán Thành Phẩm Tracking (Production loops)
    inventory_audits.forEach(audit => {
        if (audit.type === 'PRODUCTION' && audit.output && audit.calculatedCost !== undefined) {
            const outId = audit.output.id;
            const outName = audit.output.name;
            const invItem = outId ? inventory.find(i => i.id === outId) : inventory.find(i => i.name === outName);
            
            if (invItem) {
                if (!avgCosts[invItem.id]) avgCosts[invItem.id] = { totalCost: 0, totalQty: 0 };
                avgCosts[invItem.id].totalCost += audit.calculatedCost || 0;
                avgCosts[invItem.id].totalQty += parseFloat(audit.output.qty) || 0;
            }
        }
    });
    
    const finalAvgs = {};
    Object.keys(avgCosts).forEach(id => {
        finalAvgs[id] = avgCosts[id].totalQty > 0 ? (avgCosts[id].totalCost / avgCosts[id].totalQty) : 0;
    });
    return finalAvgs;
};

// --- PRE-CALCULATED SNAPSHOT HELPER ---
const calculateOrderMetrics = (order) => {
    if (!order || !order.cartItems || order.cartItems.length === 0) return { cogs: 0, grossProfit: 0, netRevenue: 0 };
    
    // 1. Tính toán COGS dựa trên Order Deduction Logic
    const avgs = getInternalAvgCosts();
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

        const applyRecipe = (recipe, mult = 1) => {
            if (!recipe || !Array.isArray(recipe)) return;
            recipe.forEach(recipeItem => {
                const ingredient = inventory.find(inv => inv.id === recipeItem.ingredientId);
                if (ingredient) {
                    const unitUsedQty = Math.ceil(parseFloat(recipeItem.quantity || 0) * mult);
                    const usedQty = unitUsedQty * count;
                    if (usedQty === 0) return;
                    if (!orderDeductions[ingredient.id]) orderDeductions[ingredient.id] = 0;
                    orderDeductions[ingredient.id] += usedQty;
                }
            });
        };

        if (menuItem) {
            applyRecipe(menuItem.recipe, sizeMultiplier);
            if (cartItem.size) {
                 const selectedSizeLabel = typeof cartItem.size === 'string' ? cartItem.size : (cartItem.size.label || cartItem.size.name);
                 const menuSize = menuItem?.sizes?.find(s => s.label === selectedSizeLabel);
                 applyRecipe(menuSize?.recipe, 1);
            }
            if (cartItem.addons && Array.isArray(cartItem.addons)) {
                cartItem.addons.forEach(addonItem => {
                     const addonLabel = typeof addonItem === 'string' ? addonItem : addonItem.label;
                     const menuAddon = menuItem?.addons?.find(a => a.label === addonLabel);
                     applyRecipe(menuAddon?.recipe, 1);
                });
            }
        }
    });

    let totalCogs = 0;
    Object.keys(orderDeductions).forEach(invId => {
        const qty = orderDeductions[invId];
        const avg = avgs[invId] || 0;
        totalCogs += (qty * avg);
    });

    // 2. Doanh thu và Biên lợi nhuận Snapshot
    const price = parseFloat(order.price) || 0; 
    const partnerFee = parseFloat(order.partnerFee) || 0;
    const netRevenue = Math.max(0, price - partnerFee);
    const grossProfit = netRevenue - totalCogs;

    return {
        cogs: parseFloat(totalCogs.toFixed(3)),
        netRevenue: parseFloat(netRevenue.toFixed(3)),
        grossProfit: parseFloat(grossProfit.toFixed(3))
    };
};

function saveReportLogToDB(logItem) {
    try {
        const orderIdStr = logItem.orderId ? logItem.orderId.toString() : `${Date.now()}`;
        // UPSERT LOG TO SQLITE WITH SNAPSHOT DATA COLUMNS (Zero-memory Architecture)
        db.prepare(`INSERT OR REPLACE INTO report_logs (orderId, data, cogs, grossProfit, netRevenue) VALUES (?, ?, ?, ?, ?)`).run(
            orderIdStr,
            JSON.stringify(logItem),
            logItem.cogs || 0,
            logItem.grossProfit || 0,
            logItem.netRevenue || 0
        );
    } catch (err) {
        console.error('Error saving report log to DB:', err);
    }
}

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
    // Daily reset check in-request - dựa trên cấu hình Múi giờ trung tâm (Store Timezone)
    const storeTimezoneOffset = settings.storeTimezoneOffset != null ? settings.storeTimezoneOffset : new Date().getTimezoneOffset();
    const { dd, mm, yy, dateStr: clientDateStr } = getClientDateParts(now, storeTimezoneOffset);
    
    // So sánh chuỗi ngày theo giờ Local của quán (sau offset) để chống lệch ngày
    if (lastResetDate !== clientDateStr) {
        lastResetDate = clientDateStr;
        customerIdCounter = 1;
        nextQueueNumber = 1;
        reports.lastResetDate = clientDateStr;
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
            const todayStr = getVNDateStr(newOrder.timestamp);
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
            const dateStr = getVNDateStr(removed.timestamp);
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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    if (req.query.id) {
        res.json(orders.filter(o => o.id === req.query.id));
    } else if (req.query.history === 'true') {
        // PHÂN TRANG SQL CHO LỊCH SỬ ĐƠN HÀNG
        if (req.query.date) {
            const rows = db.prepare(`
                SELECT * FROM orders 
                WHERE status = 'COMPLETED' 
                AND date(timestamp) = date(?) 
                ORDER BY timestamp DESC
                LIMIT ? OFFSET ?
            `).all(req.query.date, limit, offset);
            
            // Map JSON strings back to objects (for items closing)
            const parsed = rows.map(r => ({
                ...r,
                options: JSON.parse(r.options || '{}'),
                cartItems: JSON.parse(r.cartItems || '[]'),
                isPaid: !!r.isPaid
            }));
            res.json(parsed);
        } else {
            const rows = db.prepare(`
                SELECT * FROM orders 
                WHERE status = 'COMPLETED' 
                ORDER BY timestamp DESC
                LIMIT ? OFFSET ?
            `).all(limit, offset);
            
            const parsed = rows.map(r => ({
                ...r,
                options: JSON.parse(r.options || '{}'),
                cartItems: JSON.parse(r.cartItems || '[]'),
                isPaid: !!r.isPaid
            }));
            res.json(parsed);
        }
    } else if (req.query.debt === 'true') {
        res.json(orders.filter(o => o.isDebt));
    } else {
        // Active orders vẫn dùng RAM để Real-time nhanh nhất
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
            timestamp: getCurrentISOString(),
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
        lastPaidKioskOrder = { orderId: order.id, timestamp: getCurrentISOString() };
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
        timestamp: getCurrentISOString(),
        orderData: order // Save full data for detailed view
    });

    reports.cancelledOrders = (reports.cancelledOrders || 0) + 1;

    if (order.appliedPromoCode && order.discount > 0) {
        let promo = promotions.find(p => p.code === order.appliedPromoCode || p.name === order.appliedPromoCode);
        if (promo && promo.dailyLimit && promo.dailyLimit > 0) {
            const dateStr = getVNDateStr(order.timestamp);
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
        timestamp: getCurrentISOString(),
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
        timestamp: getCurrentISOString(),
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

let kitchenPrintQueue = [];

app.post('/api/print/kitchen', (req, res) => {
    try {
        const { html, printerName, paperSize } = req.body;
        if (!html) return res.status(400).json({ success: false, error: 'Missing html' });
        kitchenPrintQueue.push({
            id: Date.now() + '-' + Math.random().toString(36).substr(2, 5),
            html,
            printerName: printerName || null,
            paperSize: paperSize || 'K80'
        });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/api/print/queue', (req, res) => {
    res.json(kitchenPrintQueue);
});

app.post('/api/print/queue/:id', (req, res) => {
    kitchenPrintQueue = kitchenPrintQueue.filter(p => p.id !== req.params.id);
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

        // TÍNH TOÁN DATA SNAPSHOT VÀ CHỐT SỔ ĐƠN HÀNG KẾ TOÁN (PRE-CALCULATED DATA)
        const metrics = calculateOrderMetrics(order);
        order.cogs = metrics.cogs;
        order.grossProfit = metrics.grossProfit;
        order.netRevenue = metrics.netRevenue;

        const newLog = {
            type: 'COMPLETED',
            orderId: order.id,
            queueNumber: order.queueNumber,
            itemName: order.itemName,
            customerName: order.customerName,
            price: order.price,
            timestamp: getCurrentISOString(),
            orderData: order,
            // Đính kèm số liệu vào RAM Log
            cogs: metrics.cogs,
            grossProfit: metrics.grossProfit,
            netRevenue: metrics.netRevenue
        };
        reports.logs.push(newLog);
        saveReportLogToDB(newLog); // Lưu trực tiếp DB theo hướng DB-Driven!
        // Push to kiosk notification queue
        completedNotifications.push({
            queueNumber: order.queueNumber,
            customerId: order.customerId,
            itemName: order.itemName,
            timestamp: getCurrentISOString()
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

app.post('/api/orders/cancel/:id', (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    const order = orders.find(o => o.id.toString() === id.toString());

    if (order) {
        order.status = 'CANCELLED';
        reports.cancelledOrders++;
        const metrics = calculateOrderMetrics(order);
        
        const newLog = {
            type: 'CANCELLED',
            orderId: order.id,
            queueNumber: order.queueNumber,
            itemName: order.itemName,
            customerName: order.customerName,
            price: order.price,
            timestamp: getCurrentISOString(),
            reason: reason || 'N/A',
            orderData: order,
            cogs: metrics.cogs, // Lưu tham khảo quỹ vốn hao hụt (Nếu hủy là vứt hàng)
            grossProfit: 0,
            netRevenue: 0
        };
        reports.logs.push(newLog);
        saveReportLogToDB(newLog);

        if (order.appliedPromoCode && order.discount > 0) {
            let promo = promotions.find(p => p.code === order.appliedPromoCode || p.name === order.appliedPromoCode);
            if (promo && promo.dailyLimit && promo.dailyLimit > 0) {
                const dateStr = getVNDateStr(order.timestamp);
                if (promo.usageHistory && promo.usageHistory[dateStr] > 0) {
                    promo.usageHistory[dateStr] -= 1;
                    console.log(`[PROMO] Hoàn lại lượt dùng mã ${promo.name} do hủy đơn. Lượt dùng: ${promo.usageHistory[dateStr]}/${promo.dailyLimit}`);
                }
            }
        }

        // Hoàn kho khi HỦY đơn
        handleInventoryForOrder(order, true);

        saveData();
        res.json({ success: true, order });
    } else {
        res.status(404).json({ success: false, message: 'Order not found' });
    }
});

app.get('/api/report', (req, res) => {
    res.json({ ...reports, hasDebt: orders.some(o => o.isDebt) });
});

// Update fixed costs
app.post('/api/report/fixed-costs', (req, res) => {
    const { rent, machines, machineDepreciationMonths, electricity, water, salaries, other, useDynamicRent, useDynamicMachines, useDynamicElectricity, useDynamicWater, useDynamicSalaries, useDynamicOther, targetRevenue, useDynamicRevenue } = req.body;
    reports.fixedCosts = {
        rent: parseFloat(rent) || 0,
        machines: parseFloat(machines) || 0,
        machineDepreciationMonths: parseInt(machineDepreciationMonths) || 1,
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
    posCheckoutSession = { amount, orderId, timestamp: getCurrentISOString() };
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
    const todayStr = new Date().toDateString();
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

    const now = Date.now();
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

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
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
        
        // 1b. Clear SQLite detail logs (must be done explicitly as saveData skips this table)
        db.prepare('DELETE FROM report_logs').run();
        // Also clear tables that use UPSERT (not full replace) in saveData
        db.prepare('DELETE FROM imports').run();
        db.prepare('DELETE FROM expenses').run();
        db.prepare('DELETE FROM inventory_audits').run();
        db.prepare('DELETE FROM schedules').run();
        db.prepare('DELETE FROM shifts').run();

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
        disciplinary_logs.length = 0;
        schedules.length = 0;

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
        saveData();

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

    saveData();
    res.json({ success: true, expense: Object.assign({}, newExpense) });
});

app.delete('/api/expenses/:id', (req, res) => {
    const index = expenses.findIndex(e => e.id === req.params.id);
    if (index !== -1) {
        expenses.splice(index, 1);
        saveData();
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
        const { name, unit, importUnit, quantity, volumePerUnit, costPerUnit, minStock } = itemData;
        if (!name) return;

        let ingredient = inventory.find(i => i.name.toLowerCase().trim() === name.toLowerCase().trim());
        if (!ingredient) {
            ingredient = {
                id: `inv-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                name: name.trim(),
                unit: unit ? String(unit).trim() : 'g',
                stock: 0,
                minStock: minStock !== undefined ? parseFloat(minStock) || 0 : 0,
                usageHistory: []
            };
            inventory.push(ingredient);
        } else if (minStock !== undefined) {
             ingredient.minStock = parseFloat(minStock) || 0;
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
            timestamp: new Date().toISOString(),
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
        timestamp: getCurrentISOString(),
        type: 'PRODUCTION',
        userName: userName || 'Admin',
        inputs: inputs.map(i => {
            const inv = inventory.find(adj => adj.id === i.id);
            return {
                id: i.id,
                name: inv?.name || i.id,
                qty: i.qty,
                unit: inv?.unit || ''
            };
        }),
        output: {
            id: outItem.id,
            name: outItem.name,
            qty: outputQty,
            unit: outItem.unit
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
    const past7 = getVNDateStr(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
    const past30 = getVNDateStr(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

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
            const outId = audit.output.id;
            const outName = audit.output.name;
            const invItem = outId ? inventory.find(i => i.id === outId) : inventory.find(i => i.name === outName);
            
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
                const dateStr = parseDate(audit.timestamp).toISOString().split('T')[0];
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
            const dateStr = parseDate(imp.timestamp).toISOString().split('T')[0];
            const cost = parseFloat(imp.totalCost) || 0;
            if (dateStr >= todayStr) imp1 += cost;
            if (dateStr >= past7) imp7 += cost;
            if (dateStr >= past30) imp30 += cost;
            impAll += cost;
        });

        // Add Import Costs tracking from Bán Thành Phẩm Production (Produced Goods values)
        inventory_audits.forEach(audit => {
            if (audit.type === 'PRODUCTION' && audit.output) {
                const dateStr = parseDate(audit.timestamp).toISOString().split('T')[0];
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
            const dateStr = parseDate(imp.timestamp).toISOString().split('T')[0];
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
app.get('/api/imports', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const showTrash = req.query.showTrash === 'true' ? 1 : 0;
    const period = req.query.period || 'all'; // today, week, month, all
    const offset = (page - 1) * limit;

    try {
        const rows = db.prepare('SELECT * FROM imports WHERE isDeleted = ? ORDER BY timestamp DESC').all(showTrash);
        
        const now = new Date();
        const todayStr = getVNDateStr(now);
        const past7Str = getVNDateStr(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
        const past30Str = getVNDateStr(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

        let filteredRows = rows;
        if (period !== 'all') {
            filteredRows = rows.filter(imp => {
                let dStr = '';
                if (typeof imp.timestamp === 'string' && imp.timestamp.includes('T')) {
                    dStr = imp.timestamp.split('T')[0];
                } else if (imp.timestamp) {
                    dStr = getVNDateStr(new Date(parseInt(imp.timestamp)));
                } else {
                    return false;
                }

                if (period === 'today') return dStr === todayStr;
                if (period === 'week') return dStr >= past7Str;
                if (period === 'month') return dStr >= past30Str;
                return true;
            });
        }

        // Deduplicate rows by ID in case of DB inconsistency
        const uniqueRows = [];
        const seenIds = new Set();
        filteredRows.forEach(r => {
            if (!seenIds.has(r.id)) {
                uniqueRows.push(r);
                seenIds.add(r.id);
            }
        });

        // Apply pagination
        const paginated = uniqueRows.slice(offset, offset + limit);
        res.json(paginated);
    } catch (err) {
        console.error('Error fetching imports:', err);
        // Tái tạo lại logic phân trang cho fallback in-memory array
        const offsetFallback = (page - 1) * limit;
        const validImports = imports.filter(imp => !!imp.isDeleted === !!showTrash)
               .sort((a,b) => b.timestamp - a.timestamp)
               .slice(offsetFallback, offsetFallback + limit);
        res.json(validImports);
    }
});

app.get('/api/imports/latest/:ingredientId', (req, res) => {
    try {
        const row = db.prepare('SELECT * FROM imports WHERE (ingredientId = ? OR ingredientName = ?) AND isDeleted = 0 ORDER BY timestamp DESC LIMIT 1').get(req.params.ingredientId, req.params.ingredientId);
        if (row) {
            res.json(row);
        } else {
            res.json(null);
        }
    } catch (err) {
        console.error('Error fetching latest import:', err);
        res.status(500).json({ error: 'Failed to fetch latest import' });
    }
});
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
        timestamp: getCurrentISOString(),
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
    // Mark ALL records with this ID as deleted (to handle duplicates)
    let foundCount = 0;
    imports.forEach(imp => {
        if (imp.id === id && !imp.isDeleted) {
            imp.isDeleted = true;
            foundCount++;
        }
    });

    if (foundCount === 0) {
        // Fallback: try to delete directly from SQLite (e.g. after factory reset wiped RAM)
        const sqliteResult = db.prepare('UPDATE imports SET isDeleted = 1 WHERE id = ? AND (isDeleted IS NULL OR isDeleted = 0)').run(id);
        if (sqliteResult.changes === 0) {
            return res.status(404).json({ error: 'Import not found' });
        }
        // Re-sync imports RAM from SQLite so future requests are consistent
        imports = db.prepare('SELECT * FROM imports WHERE isDeleted = 0').all();
        return res.json({ success: true, import: null, ingredientUpdated: false });
    }
    
    // SYNC TO SQLITE
    try {
        db.prepare('UPDATE imports SET isDeleted = 1 WHERE id = ?').run(id);
    } catch (err) {
        console.error('Error syncing delete to SQLite:', err);
    }

    // Deduct stock from active inventory (using the first match for calculations)
    const targetImport = imports.find(imp => imp.id === id); // We already marked it as isDeleted, but we need the data
    const ingredient = inventory.find(i => i.id === targetImport?.ingredientId);
    if (ingredient && targetImport) {
        const stockToDeduct = targetImport.addedStock !== undefined ? targetImport.addedStock : targetImport.quantity;
        ingredient.stock -= stockToDeduct;
    }

    saveData();
    res.json({ success: true, import: targetImport, ingredientUpdated: !!ingredient });
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
        saveData();
        console.log("Đã tạo token chấm công cho nhân viên cũ.");
    }
    const staffWithRoles = staff.map(s => {
        const roleObj = roles.find(r => r.id === s.roleId);
        // [SECURITY FIX] Chỉ trả về các trường cần thiết, tuyệt đối không lộ PIN HASH hay RECOVERY CODE
        return {
            id: s.id,
            name: s.name,
            roleId: s.roleId,
            role: roleObj ? roleObj.name : s.role,
            isDeleted: s.isDeleted,
            attendanceToken: s.attendanceToken,
            hourlyRate: s.hourlyRate,
            monthlyLimit: s.monthlyLimit,
            diligencePoints: s.diligencePoints
        };
    });
    res.json(staffWithRoles);
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

    const roleObj = roles.find(r => r.id === member.roleId);
    const memberWithRole = {
        ...member,
        role: roleObj ? roleObj.name : member.role
    };

    res.json({ success: true, member: memberWithRole });
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

// --- Role Management ---
app.get('/api/roles', (req, res) => {
    res.json(roles);
});

app.post('/api/roles', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
    const user = activeTokens.get(authHeader.substring(7));
    if (!user || user.role !== 'ADMIN') return res.status(403).json({ success: false, message: 'Không có quyền thực hiện' });

    const newRole = req.body;
    if (!newRole.name) return res.status(400).json({ success: false, message: 'Thiếu tên vai trò' });

    const index = roles.findIndex(r => r.id === newRole.id);
    if (index !== -1) {
        roles[index] = { ...roles[index], ...newRole };
    } else {
        newRole.id = newRole.id || Date.now().toString();
        roles.push(newRole);
    }

    saveData();
    log(`Role ${newRole.name} saved.`);
    res.json({ success: true, role: newRole });
});

app.delete('/api/roles/:id', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
    const user = activeTokens.get(authHeader.substring(7));
    if (!user || user.role !== 'ADMIN') return res.status(403).json({ success: false, message: 'Không có quyền thực hiện' });

    const { id } = req.params;
    const role = roles.find(r => r.id === id);
    if (role && role.isSystem) return res.status(400).json({ success: false, message: 'Không thể xóa vai trò hệ thống' });

    roles = roles.filter(r => r.id !== id);
    saveData();
    log(`Role ID ${id} deleted.`);
    res.json({ success: true });
});

// --- SHIFTS API (SQLite handled in loadData now) ---
const SHIFTS_FILE = path.join(DATA_DIR, 'shifts.json');
if (fs.existsSync(SHIFTS_FILE) && !db.prepare('SELECT value FROM migration_metadata WHERE key = ?').get('json_to_sqlite_v1')) {
    try { shifts = JSON.parse(fs.readFileSync(SHIFTS_FILE, 'utf8')); } catch (e) { console.error('Error parsing shifts.json', e); }
}
const saveShifts = () => saveData();

app.get('/api/shifts', (req, res) => res.json(shifts));

app.post('/api/shifts', (req, res) => {
    const shift = { id: `shift-${Date.now()}`, createdAt: getCurrentISOString(), ...req.body };
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
            editedAt: getCurrentISOString(),
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
    s.clockIn = getCurrentISOString();
    saveShifts();
    res.json({ success: true, shift: s });
});

app.post('/api/shifts/:id/clockout', (req, res) => {
    const s = shifts.find(s => s.id === req.params.id);
    if (!s) return res.status(404).json({ success: false });
    s.clockOut = getCurrentISOString();
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

    const vnTimeT = new Date(); // Dùng giờ gốc máy chủ (GMT+7)
    const todayStr = getVNDateStr(vnTimeT);

    // Auto-match schedule
    let matchedScheduleId = req.body.scheduleId || null;
    let shiftDateStr = todayStr;

    // Handle overnight shift matching in VN Time
    const currentHourVN = vnTimeT.getUTCHours();
    if (currentHourVN >= 0 && currentHourVN < 5) {
        const yesterdayVN = new Date(vnTimeT.getTime() - 24 * 3600 * 1000);
        shiftDateStr = getVNDateStr(yesterdayVN);
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

    s.clockOut = getCurrentISOString();
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
    const list = Array.isArray(req.body) ? req.body : [req.body];
    const newSchedules = [];

    list.forEach(item => {
        let schedule = { createdAt: getCurrentISOString(), ...item };
        
        // --- QUY TẮC SIÊU GỘP: 1 Hàng + 1 Ngày = 1 Bản ghi ---
        const rIdx = schedule.rowIdx ?? 0;
        const tplId = schedule.templateId;
        
        for (let i = schedules.length - 1; i >= 0; i--) {
            const sameDate = schedules[i].date === schedule.date;
            const sameTemplate = (tplId && schedules[i].templateId === tplId);
            const sameRow = ((schedules[i].rowIdx ?? 0) === rIdx);
            
            if (sameDate && (sameTemplate || sameRow)) {
                if (schedules[i].id !== schedule.id) {
                    schedules.splice(i, 1);
                }
            }
        }

        
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
    res.json({ success: true, count: list.length });
});

app.put('/api/schedules/:id', (req, res) => {
    const s = schedules.find(shift => shift.id === req.params.id);
    if (!s) return res.status(404).json({ success: false, message: 'Schedule not found' });
    Object.assign(s, req.body);

    saveData();
    res.json({ success: true, schedule: s });
});

app.post('/api/schedules-cleanup', (req, res) => {
    const { startDate, endDate, onlyEmpty } = req.body;
    if (!startDate || !endDate) return res.status(400).json({ success: false, message: 'Missing range' });

    // 1. Lọc mảng trong bộ nhớ để đồng bộ UI ngay lập tức
    schedules = schedules.filter(s => {
        const inRange = s.date >= startDate && s.date <= endDate;
        if (!inRange) return true; // Giữ lại nếu ngoài dải ngày
        
        if (onlyEmpty) {
            const hasS = (s.staffIds && s.staffIds.length > 0);
            return hasS; // Giữ lại nếu có nhân sự
        }
        return false; // Xóa sạch nếu trong dải ngày
    });

    // 2. Thực thi xóa trong Database SQLite
    // Do staffIds nằm trong cột 'data' (JSON), ta cần dùng json_extract để lọc
    let sql = 'DELETE FROM schedules WHERE date >= ? AND date <= ?';
    const params = [startDate, endDate];
    
    if (onlyEmpty) {
        // SQLite: json_array_length(json_extract(data, '$.staffIds'))
        sql += " AND (json_extract(data, '$.staffIds') IS NULL OR json_array_length(json_extract(data, '$.staffIds')) = 0)";
    }
    
    try {
        db.prepare(sql).run(...params);
        saveData();
        res.json({ success: true, message: 'Dọn dẹp thành công!' });
    } catch (e) {
        console.error('Lỗi dọn dẹp DB:', e);
        res.status(500).json({ success: false, message: 'Lỗi dọn dẹp cơ sở dữ liệu' });
    }
});

app.delete('/api/schedules/:id', (req, res) => {
    schedules = schedules.filter(s => s.id !== req.params.id);
    db.prepare('DELETE FROM schedules WHERE id = ?').run(req.params.id);
    saveData();
    res.json({ success: true });
});

// --- DISCIPLINARY LOGS API ---
app.get('/api/disciplinary', (req, res) => res.json(disciplinary_logs));

app.post('/api/disciplinary', (req, res) => {
    const log = { id: `dl-${Date.now()}`, createdAt: getCurrentISOString(), ...req.body };
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
const saveRatings = () => { /* Not implemented in DB yet, but ratings are usually in menu item. Keeping as no-op or adding to menu. */ };

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
    const rating = { id: `r-${Date.now()}`, orderId, stars, comment, staffId, timestamp: getCurrentISOString() };
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

// Endpoint cập nhật hệ thống (Chủ yếu cho Linux)
app.post('/api/system/update', (req, res) => {
    const { downloadUrl } = req.body;
    
    // 1. Kiểm tra quyền ADMIN
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
    const token = authHeader.substring(7);
    const user = activeTokens.get(token);
    if (!user || user.role !== 'ADMIN') return res.status(403).json({ success: false, message: 'Không có quyền thực hiện' });

    // 2. Chỉ cho phép chạy trên Linux (máy chủ)
    if (process.platform === 'win32' || process.platform === 'darwin') {
        return res.status(400).json({ success: false, message: 'Tính năng này chỉ dành cho máy chủ Linux. Trên Windows/Mac vui lòng sử dụng bộ cài mới.' });
    }

    if (!downloadUrl) return res.status(400).json({ success: false, message: 'Thiếu link tải bản cập nhật' });

    const { exec } = require('child_process');
    const appDir = __dirname;
    
    console.log(`[SystemUpdate] Bắt đầu quá trình cập nhật từ: ${downloadUrl}`);
    console.log(`[SystemUpdate] Thư mục ứng dụng: ${appDir}`);
    console.log(`[SystemUpdate] DATA_DIR hiện tại: ${DATA_DIR}`);
    
    // Quyết định phương thức: git pull (ưu tiên) hoặc tar.gz download
    const hasGit = fs.existsSync(path.join(appDir, '.git'));
    
    let updateCommand;
    if (hasGit) {
        // === PHƯƠNG THỨC GIT PULL ===
        console.log('[SystemUpdate] Phát hiện thư mục .git, sử dụng git pull...');
        updateCommand = [
            `cd "${appDir}"`,
            'git fetch --all',
            'git reset --hard origin/main',
            'npm install --omit=dev',
            'npm run build',
        ].join(' && ');
    } else {
        // === PHƯƠNG THỨC TẢI .TAR.GZ ===
        // Bundle là order-cafe-vX.X.X.tar.gz chứa: dist/ server.cjs db.cjs migration.cjs src/utils/ package.json public/
        console.log('[SystemUpdate] Không có Git, sử dụng curl để tải .tar.gz...');
        updateCommand = [
            `cd "${appDir}"`,
            // Tải file
            `curl -L --fail --show-error "${downloadUrl}" -o _update.tar.gz`,
            // Giải nén đè lên thư mục hiện tại
            // --strip-components=0: không bỏ thư mục gốc (bundle tar.gz không có thư mục gốc)
            'tar -xzf _update.tar.gz --overwrite',
            // Dọn dẹp file tải về
            'rm -f _update.tar.gz',
            // Cài lại node_modules (chỉ production dependencies)
            'npm install --omit=dev',
        ].join(' && ');
    }

    // Trả response TRƯỚC để đảm bảo client nhận được trước khi pm2 restart
    res.json({ 
        success: true, 
        message: `Hệ thống đang tải bản cập nhật (${hasGit ? 'git pull' : 'tar.gz download'}). Quá trình này mất 1–5 phút. Server sẽ tự khởi động lại và migration dữ liệu sẽ chạy tự động.` 
    });
    
    setTimeout(() => {
        console.log(`[SystemUpdate] Đang thực thi lệnh cập nhật...`);
        exec(updateCommand, { cwd: appDir, timeout: 300000 /* 5 phút */ }, (error, stdout, stderr) => {
            if (error) {
                console.error(`[SystemUpdate] ❌ Lỗi cập nhật file: ${error.message}`);
                console.error(`[SystemUpdate] stderr: ${stderr}`);
                // Cố restart dù lỗi để server không chết
                exec(`pm2 restart order-cafe || pm2 restart all || exit 0`, () => { process.exit(0); });
                return;
            }
            
            console.log(`[SystemUpdate] ✅ Cập nhật file hoàn tất.`);
            if (stdout) console.log(`[SystemUpdate] stdout:\n${stdout}`);
            
            // Truyền DATA_PATH khi restart để migration.cjs đọc đúng thư mục dữ liệu
            // Migration sẽ tự chạy khi server.cjs khởi động (trong migrate() ở đầu file)
            console.log(`[SystemUpdate] Đang khởi động lại qua PM2 với DATA_PATH="${DATA_DIR}"...`);
            const restartCmd = `DATA_PATH="${DATA_DIR}" pm2 restart order-cafe --update-env || DATA_PATH="${DATA_DIR}" pm2 restart all --update-env || exit 0`;
            
            exec(restartCmd, (restartErr) => {
                if (restartErr) {
                    console.error(`[SystemUpdate] Lỗi restart PM2: ${restartErr.message}. Thoát process để PM2 tự restart...`);
                }
                process.exit(0);
            });
        });
    }, 2000);
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
            const vnTime = new Date(s.clockIn); // Giờ máy chủ đã là GMT+7
            let shiftDay = getVNDateStr(vnTime);

            // Apply the same 0h-5h overnight logic as in clock-in
            if (vnTime.getHours() < 5) {
                const yesterdayVN = new Date(vnTime.getTime() - 24 * 3600 * 1000);
                shiftDay = getVNDateStr(yesterdayVN);
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

// --- FINAL INITIALIZATION ---
// migrate() and loadData() moved to top of file

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
