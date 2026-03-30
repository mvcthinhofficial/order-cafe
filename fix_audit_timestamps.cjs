/**
 * fix_audit_timestamps.cjs
 * Fix 7 record inventory_audits với timestamp = "0.0" bị corrupt khi migration.
 * Phương pháp: Tái tạo timestamp từ Unix ms nhúng trong ID record.
 *   ID format: "audit-order-{unix_ms}-{random}"
 *   VD: "audit-order-1774673872429-evz2e" → timestamp = 1774673872429
 *
 * Usage:
 *   node fix_audit_timestamps.cjs            # Dry-run (xem trước, không thay đổi DB)
 *   node fix_audit_timestamps.cjs --apply    # Thực sự ghi vào DB
 */

const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_PATH || path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'cafe.db');
const DRY_RUN = !process.argv.includes('--apply');

console.log('='.repeat(60));
console.log('  fix_audit_timestamps.cjs');
console.log('='.repeat(60));
console.log(`  Database  : ${DB_PATH}`);
console.log(`  Mode      : ${DRY_RUN ? '🔍 DRY-RUN (dùng --apply để ghi thực sự)' : '✏️  APPLY — ĐANG GHI VÀO DATABASE'}`);
console.log('='.repeat(60));

const db = new Database(DB_PATH, { readonly: DRY_RUN });

// Tìm các record bị corrupt
const corruptRecords = db.prepare(
    `SELECT id, timestamp, data FROM inventory_audits WHERE timestamp = '0.0' OR timestamp = '0'`
).all();

if (corruptRecords.length === 0) {
    console.log('\n✅ Không tìm thấy record bị corrupt. Database đã sạch!');
    db.close();
    process.exit(0);
}

console.log(`\n📋 Tìm thấy ${corruptRecords.length} record cần fix:\n`);

const fixes = [];

for (const record of corruptRecords) {
    // Tái tạo timestamp từ ID: "audit-order-{unix_ms}-{random}"
    const match = record.id.match(/audit-order-(\d+)-/);
    let recoveredTs = null;

    if (match) {
        recoveredTs = parseInt(match[1]);
        // Sanity check: phải là ms hợp lý (2026 ± 5 năm)
        const year = new Date(recoveredTs).getFullYear();
        if (year < 2020 || year > 2030) {
            console.warn(`  ⚠️  ${record.id} → timestamp ${recoveredTs} nằm ngoài khoảng hợp lệ (năm ${year}), dùng Date.now()`);
            recoveredTs = null;
        }
    }

    if (!recoveredTs) {
        // Fallback: dùng current time (last resort)
        recoveredTs = Date.now();
        console.warn(`  ⚠️  ${record.id} → không tái tạo được từ ID, dùng thời gian hiện tại`);
    }

    const humanDate = new Date(recoveredTs).toISOString();

    console.log(`  ID     : ${record.id}`);
    console.log(`  Cũ     : timestamp = "${record.timestamp}"`);
    console.log(`  Mới    : timestamp = ${recoveredTs}  (${humanDate})`);
    console.log('  ---');

    fixes.push({ id: record.id, oldTs: record.timestamp, newTs: recoveredTs, data: record.data });
}

if (DRY_RUN) {
    console.log('\n🔍 DRY-RUN hoàn tất. Không có gì được thay đổi.');
    console.log('   Chạy lại với --apply để thực sự ghi vào database:\n');
    console.log('   node fix_audit_timestamps.cjs --apply\n');
    db.close();
    process.exit(0);
}

// === APPLY MODE ===
console.log('\n✏️  Đang ghi vào database...\n');

const updateStmt = db.prepare(`
    UPDATE inventory_audits 
    SET timestamp = ?, data = ?
    WHERE id = ?
`);

const applyAll = db.transaction(() => {
    let successCount = 0;
    for (const fix of fixes) {
        // Cập nhật data blob nếu có
        let updatedDataStr = fix.data;
        if (fix.data) {
            try {
                const dataObj = JSON.parse(fix.data);
                if (dataObj.timestamp !== undefined) {
                    dataObj.timestamp = fix.newTs;
                    updatedDataStr = JSON.stringify(dataObj);
                }
            } catch (e) {
                console.warn(`  ⚠️  Không thể parse data JSON của ${fix.id}:`, e.message);
            }
        }

        const result = updateStmt.run(
            fix.newTs.toString(),   // timestamp column (TEXT)
            updatedDataStr,          // data column
            fix.id                   // WHERE id =
        );

        if (result.changes === 1) {
            console.log(`  ✅ OK  : ${fix.id} → ${fix.newTs}`);
            successCount++;
        } else {
            console.error(`  ❌ FAIL: ${fix.id} — không có row nào được update`);
        }
    }
    return successCount;
});

const successCount = applyAll();
db.close();

console.log('\n' + '='.repeat(60));
console.log(`  KẾT QUẢ: ${successCount}/${fixes.length} record đã được fix thành công.`);
console.log('='.repeat(60));

if (successCount === fixes.length) {
    console.log('\n✅ Hoàn tất! Tất cả timestamp đã được chuẩn hóa.\n');
    process.exit(0);
} else {
    console.error('\n❌ Có lỗi xảy ra. Kiểm tra log phía trên.\n');
    process.exit(1);
}
