const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_PATH || path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'cafe.db');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

let dbInstance = new Database(DB_PATH);
dbInstance.pragma('journal_mode = WAL');

const initSchema = (db) => {
    // Settings
    db.prepare(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`).run();
    // Menu
    db.prepare(`CREATE TABLE IF NOT EXISTS menu (id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT, price REAL, rating REAL, volume TEXT, description TEXT, shortcutCode TEXT, image TEXT, sizes TEXT, addons TEXT, recipe TEXT, sugarOptions TEXT, iceOptions TEXT, defaultSugar TEXT, defaultIce TEXT, recipeInstructions TEXT, isDeleted INTEGER DEFAULT 0)`).run();
    // Orders
    db.prepare(`CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, queueNumber INTEGER, customerId TEXT, deviceId TEXT, itemName TEXT, customerName TEXT, price REAL, timestamp TEXT, note TEXT, options TEXT, cartItems TEXT, tableId TEXT, status TEXT, isPaid INTEGER)`).run();
    // Staff (Có thêm cột data để lưu các thuộc tính mở rộng như hourlyRate, monthlyLimit)
    db.prepare(`CREATE TABLE IF NOT EXISTS staff (id TEXT PRIMARY KEY, name TEXT NOT NULL, roleId TEXT, pin TEXT, attendanceToken TEXT, recoveryCode TEXT, isDeleted INTEGER DEFAULT 0, data TEXT)`).run();
    // Roles
    db.prepare(`CREATE TABLE IF NOT EXISTS roles (id TEXT PRIMARY KEY, name TEXT NOT NULL, permissions TEXT)`).run();
    // Tables
    db.prepare(`CREATE TABLE IF NOT EXISTS tables (id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT, currentOrderId TEXT)`).run();
    // Reports
    db.prepare(`CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY DEFAULT 1, totalSales REAL DEFAULT 0, successfulOrders INTEGER DEFAULT 0, cancelledOrders INTEGER DEFAULT 0, lastResetDate TEXT, customerIdCounter INTEGER DEFAULT 1, nextQueueNumber INTEGER DEFAULT 1, fixedCosts TEXT)`).run();
    // Report Logs (Có thêm các cột Phụ - Pre-calculated Snapshot)
    db.prepare(`CREATE TABLE IF NOT EXISTS report_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, orderId TEXT, data TEXT, cogs REAL, grossProfit REAL, netRevenue REAL)`).run();
    // Inventory
    db.prepare(`CREATE TABLE IF NOT EXISTS inventory (id TEXT PRIMARY KEY, name TEXT NOT NULL, unit TEXT, stock REAL DEFAULT 0, minStock REAL DEFAULT 0, usageHistory TEXT)`).run();
    // Promotions
    db.prepare(`CREATE TABLE IF NOT EXISTS promotions (id TEXT PRIMARY KEY, name TEXT, description TEXT, discountType TEXT, discountValue REAL, startDate TEXT, endDate TEXT, isActive INTEGER, data TEXT)`).run();
    // Imports (Flattened Item-based schema)
    db.prepare(`CREATE TABLE IF NOT EXISTS imports (
        id TEXT PRIMARY KEY,
        timestamp TEXT,
        ingredientId TEXT,
        ingredientName TEXT,
        importUnit TEXT,
        quantity REAL,
        volumePerUnit REAL,
        costPerUnit REAL,
        totalCost REAL,
        addedStock REAL,
        baseUnit TEXT,
        supplier TEXT
    )`).run();
    // Expenses
    db.prepare(`CREATE TABLE IF NOT EXISTS expenses (id TEXT PRIMARY KEY, name TEXT, timestamp TEXT, category TEXT, amount REAL, note TEXT, staffId TEXT)`).run();
    // Inventory Audits
    db.prepare(`CREATE TABLE IF NOT EXISTS inventory_audits (id TEXT PRIMARY KEY, timestamp TEXT, orderId TEXT, data TEXT)`).run();
    // Schedules
    db.prepare(`CREATE TABLE IF NOT EXISTS schedules (id TEXT PRIMARY KEY, staffId TEXT, date TEXT, shiftId TEXT, data TEXT)`).run();
    // Disciplinary Logs
    db.prepare(`CREATE TABLE IF NOT EXISTS disciplinary_logs (id TEXT PRIMARY KEY, staffId TEXT, timestamp TEXT, type TEXT, note TEXT, points INTEGER)`).run();
    // Shifts
    db.prepare(`CREATE TABLE IF NOT EXISTS shifts (id TEXT PRIMARY KEY, staffId TEXT, createdAt TEXT, clockIn TEXT, clockOut TEXT, actualHours REAL, hourlyRate REAL, totalPay REAL, editHistory TEXT)`).run();
    // Migration Status
    db.prepare(`CREATE TABLE IF NOT EXISTS migration_metadata (key TEXT PRIMARY KEY, value TEXT)`).run();
    // Migration Registry
    db.prepare(`CREATE TABLE IF NOT EXISTS migrated_files (filename TEXT PRIMARY KEY, last_modified INTEGER)`).run();
    // Loyalty & Membership
    db.prepare(`CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, phone TEXT UNIQUE, name TEXT, points INTEGER DEFAULT 0, tier TEXT DEFAULT 'Bạc', totalSpent REAL DEFAULT 0, visits INTEGER DEFAULT 0, joinedAt TEXT, lastVisit TEXT)`).run();
    db.prepare(`CREATE TABLE IF NOT EXISTS customer_vouchers (id TEXT PRIMARY KEY, customerId TEXT, promotionId TEXT, code TEXT, status TEXT DEFAULT 'ACTIVE', acquiredAt TEXT, usedAt TEXT, expiresAt TEXT)`).run();
    db.prepare(`CREATE TABLE IF NOT EXISTS loyalty_logs (id TEXT PRIMARY KEY, customerId TEXT, orderId TEXT, pointsChanged INTEGER, note TEXT, timestamp TEXT)`).run();

    db.prepare(`CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_orders_timestamp ON orders(timestamp)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_inventory_audits_timestamp ON inventory_audits(timestamp)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_report_logs_orderId ON report_logs(orderId)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_shifts_staffId ON shifts(staffId)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_schedules_staffId ON schedules(staffId)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_schedules_date ON schedules(date)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_imports_timestamp_ingredient ON imports(timestamp, ingredientId)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_expenses_timestamp_category ON expenses(timestamp, category)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_shifts_staff_clockIn ON shifts(staffId, clockIn)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_customer_vouchers_customerId ON customer_vouchers(customerId)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_loyalty_logs_customerId ON loyalty_logs(customerId)`).run();

    // Evolution
    const addColumn = (table, column, type) => {
        try { db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`).run(); } catch (e) {}
    };
    addColumn('menu', 'category', 'TEXT');
    addColumn('menu', 'rating', 'REAL');
    addColumn('menu', 'shortcutCode', 'TEXT');
    addColumn('menu', 'image', 'TEXT');
    addColumn('menu', 'recipeInstructions', 'TEXT');
    addColumn('expenses', 'name', 'TEXT');
    addColumn('imports', 'isDeleted', 'INTEGER DEFAULT 0');
    addColumn('menu', 'isDeleted', 'INTEGER DEFAULT 0');
    
    // Thêm các cột phụ Kế toán (Pre-calculated Snapshot) vào bảng Báo cáo cũ
    addColumn('report_logs', 'cogs', 'REAL');
    addColumn('report_logs', 'grossProfit', 'REAL');
    addColumn('report_logs', 'netRevenue', 'REAL');
    addColumn('staff', 'data', 'TEXT');
    // Loyalty evolution
    addColumn('customers', 'birthday', 'TEXT');          // YYYY-MM-DD
    addColumn('customers', 'streak', 'INTEGER DEFAULT 0'); // Chuỗi ngày ghé liên tiếp
    addColumn('customers', 'lastStreakDate', 'TEXT');      // Ngày cuối chuỗi streak
    addColumn('customers', 'favoriteItems', 'TEXT');       // JSON: [{ name, count }]


    // Mở rộng Index sau khi cập nhật schema
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_imports_isDeleted ON imports(isDeleted)`).run();
};

initSchema(dbInstance);

module.exports = {
    get: () => dbInstance,
    prepare: (sql) => dbInstance.prepare(sql),
    transaction: (fn) => dbInstance.transaction(fn),
    close: () => dbInstance.close(),
    reconnect: () => {
        try { dbInstance.close(); } catch (e) {}
        dbInstance = new Database(DB_PATH);
        dbInstance.pragma('journal_mode = WAL');
        initSchema(dbInstance);
        return dbInstance;
    }
};
