const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const appDir = path.resolve(__dirname);
const dataDir = path.join(appDir, 'data');
const archiveDir = path.join(dataDir, 'archived_migration');
const dbPath = path.join(dataDir, 'cafe.db');

const db = new Database(dbPath, { readonly: true });

const tablesToCheck = [
    { jsonFile: 'orders.migrated', tableName: 'orders' },
    { jsonFile: 'menu.migrated', tableName: 'menu' },
    { jsonFile: 'inventory.migrated', tableName: 'inventory' },
    { jsonFile: 'imports.migrated', tableName: 'imports' },
    { jsonFile: 'inventory_audits.migrated', tableName: 'inventory_audits' },
    { jsonFile: 'expenses.json', tableName: 'expenses' }, // It's named expenses.json in list
    { jsonFile: 'staff.migrated', tableName: 'staff' },
    { jsonFile: 'roles.migrated', tableName: 'roles' },
    { jsonFile: 'schedules.migrated', tableName: 'schedules' },
    { jsonFile: 'shifts.migrated', tableName: 'shifts' },
    { jsonFile: 'promotions.migrated', tableName: 'promotions' },
    { jsonFile: 'settings.migrated', tableName: 'settings' },
    { jsonFile: 'tables.migrated', tableName: 'tables' },
    { jsonFile: 'disciplinary_logs.migrated', tableName: 'disciplinary_logs' },
    { jsonFile: 'reports.migrated', tableName: 'report_logs' } // Note: report logs or reports?
];

console.log("=== DB AUDIT REPORT ===");
console.log("Database file size:", (fs.statSync(dbPath).size / 1024 / 1024).toFixed(2), "MB\n");

const sizeCheck = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all();
console.log("Tables in DB:", sizeCheck.map(t => t.name).join(', '));
console.log("");

let possibleIssues = [];

tablesToCheck.forEach(({ jsonFile, tableName }) => {
    let jsonCount = 0;
    const filePath = path.join(archiveDir, jsonFile);
    if (!fs.existsSync(filePath)) {
        console.log(`[WARN] File ${jsonFile} not found in archived_migration.`);
    } else {
        try {
            const fileData = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(fileData);
            
            // Handle different json structures
            if (Array.isArray(data)) {
                if (tableName === 'imports' && data.length > 0 && data[0].items) {
                    // It was a receipt based import, count all items inside
                    jsonCount = data.reduce((acc, receipt) => acc + (receipt.items ? receipt.items.length : 0), 0);
                } else {
                    jsonCount = data.length;
                }
            } else if (typeof data === 'object') {
                if (tableName === 'reports') {
                    jsonCount = 1; // It's an object holding general stats
                } else if (tableName === 'settings') {
                    jsonCount = Object.keys(data).length;
                } else if (data !== null) {
                    jsonCount = Object.keys(data).length;
                }
            } else {
                jsonCount = 0;
            }
        } catch (e) {
            console.log(`[ERROR] Parsing ${jsonFile}:`, e.message);
        }
    }

    let sqliteCount = 0;
    try {
        if (tableName === 'settings' || tableName === 'reports') {
            const stmt = db.prepare(`SELECT COUNT(*) as c FROM ${tableName}`);
            sqliteCount = stmt.get().c;
        } else {
            const stmt = db.prepare(`SELECT COUNT(*) as c FROM ${tableName}`);
            sqliteCount = stmt.get().c;
        }
    } catch (e) {
        console.log(`[ERROR] Querying table ${tableName}:`, e.message);
    }
    
    // Custom logic for reports.migrated which migrated into two tables
    if (jsonFile === 'reports.migrated') {
        try {
            const repStmt = db.prepare(`SELECT COUNT(*) as c FROM reports`).get().c;
            const logStmt = db.prepare(`SELECT COUNT(*) as c FROM report_logs`).get().c;
            console.log(`- ${tableName} (files vs DB): N/A -> It maps to 'reports': ${repStmt} rows, 'report_logs': ${logStmt} rows`);
            if (logStmt > 10000) {
                 possibleIssues.push(`[PERFORMANCE] Table \`report_logs\` is very large (${logStmt} rows). Might cause lag if queried without limit.`);
            }
        } catch(e) {}
    } else {
        const matchStr = (jsonCount === sqliteCount && jsonCount > 0) ? "OK" : (jsonCount === sqliteCount ? "EMPTY_OK" : (sqliteCount > jsonCount ? "MORE_IN_DB(EXPECTED)" : "MISSING_IN_DB"));
        console.log(`- ${tableName.padEnd(18)}: JSON= ${jsonCount.toString().padEnd(5)} | DB= ${sqliteCount.toString().padEnd(5)} [${matchStr}]`);
        
        if (sqliteCount > 10000) {
             possibleIssues.push(`[PERFORMANCE] Table \`${tableName}\` is very large (${sqliteCount} rows). Could cause lag.`);
        }
    }
});

console.log("\n=== PERFORMANCE & CONFLICT CHECK ===");
// Check indexes
const pragmaIdx = db.prepare(`SELECT type, name, tbl_name FROM sqlite_master WHERE type='index'`).all();
const customIndexes = pragmaIdx.filter(i => !i.name.startsWith('sqlite_autoindex'));
console.log(`Custom Indexes created: ${customIndexes.length === 0 ? 'None (No custom indexes found. THIS CAN CAUSE LAG on large tables like orders/inventory_audits)' : customIndexes.map(i=>i.name).join(', ')}`);

if (customIndexes.length === 0) {
    possibleIssues.push(`[PERFORMANCE] Missing custom indexes on large tables (like timestamp fields in \`orders\`, \`inventory_audits\`). Table scans will slow down the app over time.`);
}

const sqliteMode = db.pragma('journal_mode', { simple: true });
console.log(`SQLite Journal Mode: ${sqliteMode} (WAL is resilient against conflicts)`);

console.log("\n=== POTENTIAL ISSUES YIELD ===");
if (possibleIssues.length > 0) {
    possibleIssues.forEach(i => console.log(i));
} else {
    console.log("No obvious performance or data loss issues found.");
}
db.close();
