const fs = require('fs');
const path = require('path');
const os = require('os');

// Logic matching server.cjs for DATA_DIR
const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';

let DATA_DIR = process.env.DATA_PATH;
if (!DATA_DIR) {
    if (isMac) {
        DATA_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'order-cafe', 'data');
    } else if (isWin) {
        DATA_DIR = path.join(process.env.APPDATA, 'order-cafe', 'data');
    } else {
        DATA_DIR = path.join(os.homedir(), '.order-cafe', 'data');
    }
}
console.log("Fixing data in:", DATA_DIR);

const REPORTS_FILE = path.join(DATA_DIR, 'reports.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');

if (!fs.existsSync(REPORTS_FILE)) {
    console.log("No reports file found at:", REPORTS_FILE);
    process.exit(0);
}

const reports = JSON.parse(fs.readFileSync(REPORTS_FILE, 'utf8'));
let orders = [];
if (fs.existsSync(ORDERS_FILE)) {
    try { orders = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8')); } catch (e) { }
}

const fixData = () => {
    // Combine logs and current orders to get the full picture (needed to maintain consistent numbering)
    // Note: completed logs should usually come before active orders in numbering if they happened earlier
    const allItems = [
        ...reports.logs.map(l => ({ ...l, _source: 'logs' })),
        ...orders.map(o => ({ ...o, _source: 'orders' }))
    ];

    // Group by local day to assign TTTT starting from 1 each day
    const days = {};
    allItems.forEach(item => {
        const d = new Date(item.timestamp);
        // Use local date string for grouping
        const dayKey = d.toLocaleDateString('en-US'); // Grouping key
        if (!days[dayKey]) days[dayKey] = [];
        days[dayKey].push(item);
    });

    Object.keys(days).forEach(dayKey => {
        // Sort items in each day strictly by timestamp
        days[dayKey].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        days[dayKey].forEach((item, index) => {
            const d = new Date(item.timestamp);
            const dd = String(d.getDate()).padStart(2, '0');
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const yy = String(d.getFullYear()).slice(-2);
            const suffix = `${dd}${mm}${yy}`;
            const tttt = String(index + 1).padStart(4, '0');
            const newId = `${tttt}${suffix}`;

            // Re-assign IDs
            item.id = newId;
            item.orderId = newId;
            item.queueNumber = index + 1;
        });
    });

    // Extract sorted logs back
    const newLogs = allItems
        .filter(i => i._source === 'logs')
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)) // Keep overall history sorted
        .map(i => {
            const clean = { ...i };
            delete clean._source;
            return clean;
        });

    const newOrders = allItems
        .filter(i => i._source === 'orders')
        .map(i => {
            const clean = { ...i };
            delete clean._source;
            return clean;
        });

    reports.logs = newLogs;

    // Update nextQueueNumber for today
    const now = new Date();
    const todayKey = now.toLocaleDateString('en-US');
    if (days[todayKey]) {
        reports.nextQueueNumber = days[todayKey].length + 1;
    } else {
        reports.nextQueueNumber = 1;
    }

    fs.writeFileSync(REPORTS_FILE, JSON.stringify(reports, null, 4));
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(newOrders, null, 4));

    console.log("Data fixed and saved to:", DATA_DIR);
};

fixData();
