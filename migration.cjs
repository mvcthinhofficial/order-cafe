const fs = require('fs');
const path = require('path');
const db = require('./db.cjs');

const DATA_DIR = process.env.DATA_PATH || path.join(__dirname, 'data');

const ARCHIVE_DIR = path.join(DATA_DIR, 'archived_migration');

/**
 * Migration Registry Logic
 * -----------------------
 * Hệ thống tự động quét và chuyển đổi dữ liệu từ JSON sang SQLite.
 * Sử dụng bảng `migrated_files` để theo dõi trạng thái từng file dựa trên tên và thời điểm sửa đổi (mtime).
 */

const migrate = () => {
    console.log('[Migration] Khởi động hệ thống Nhật ký chuyển đổi dữ liệu...');

    // Đảm bảo thư mục lưu trữ tồn tại
    if (!fs.existsSync(ARCHIVE_DIR)) {
        fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
    }

    // 1. Quét tất cả các file tiềm năng trong DATA_DIR (.json, .json.bak)
    // Không quét trong thư mục con để giữ thư mục data sạch sẽ
    const files = fs.readdirSync(DATA_DIR).filter(f => 
        (f.endsWith('.json') || f.endsWith('.json.bak')) && 
        fs.statSync(path.join(DATA_DIR, f)).isFile()
    );

    if (files.length === 0) {
        console.log('[Migration] Thư mục data sạch sẽ. Không có file cần chuyển đổi.');
        return;
    }

    try {
        for (const filename of files) {
            const filepath = path.join(DATA_DIR, filename);
            const stats = fs.statSync(filepath);
            const lastModified = stats.mtimeMs;

            // Kiểm tra xem file này đã được nạp chưa
            const record = db.prepare('SELECT last_modified FROM migrated_files WHERE filename = ?').get(filename);
            
            if (record && record.last_modified === Math.floor(lastModified)) {
                // Nếu file vẫn ở thư mục data nhưng đã có trong registry với cùng timestamp, 
                // có thể do lần trước chưa kịp di chuyển. Tiến hành di chuyển ngay.
                const archivePath = path.join(ARCHIVE_DIR, filename);
                if (fs.existsSync(archivePath)) fs.unlinkSync(archivePath);
                fs.renameSync(filepath, archivePath);
                continue; 
            }

            // Tiến hành xử lý file
            console.log(`[Migration] Đang xử lý file mới: ${filename}...`);
            const success = processFile(filename, filepath);

            if (success) {
                // Cập nhật Nhật ký
                db.prepare('INSERT OR REPLACE INTO migrated_files (filename, last_modified) VALUES (?, ?)').run(filename, Math.floor(lastModified));
                
                // Di chuyển file vào kho lưu trữ (Archive)
                const archivePath = path.join(ARCHIVE_DIR, filename);
                
                // Nếu đã tồn tại file cùng tên trong archive, xóa nó để ghi đè bản mới nhất
                if (fs.existsSync(archivePath)) fs.unlinkSync(archivePath);
                fs.renameSync(filepath, archivePath);
                
                console.log(`[Migration] Hoàn tất: ${filename} -> archived_migration/`);
            }
        }
    } catch (error) {
        console.error('[Migration] Lỗi nghiêm trọng trong quá trình chuyển đổi:', error);
    }
};

/**
 * Xử lý từng file cụ thể dựa trên tên file
 */
const processFile = (filename, filepath) => {
    try {
        const content = fs.readFileSync(filepath, 'utf8');
        if (!content || content.trim() === '') return false;
        const data = JSON.parse(content);

        // Xác định loại dữ liệu dựa trên tên file (không quan trọng đuôi file)
        const baseName = filename.split('.')[0].toLowerCase();

        return db.transaction(() => {
            switch (baseName) {
                case 'settings':
                    for (const [key, value] of Object.entries(data)) {
                        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, JSON.stringify(value));
                    }
                    break;

                case 'menu':
                    for (const item of data) {
                        db.prepare(`
                            INSERT OR REPLACE INTO menu 
                            (id, name, category, price, rating, volume, description, shortcutCode, image, sizes, addons, recipe, sugarOptions, iceOptions, defaultSugar, defaultIce, recipeInstructions, isDeleted)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `).run(
                            item.id, item.name, item.category, item.price, item.rating, item.volume, item.description, 
                            item.shortcutCode, item.image, JSON.stringify(item.sizes || []), JSON.stringify(item.addons || []), 
                            JSON.stringify(item.recipe || []), JSON.stringify(item.sugarOptions || []), 
                            JSON.stringify(item.iceOptions || []), item.defaultSugar, item.defaultIce, item.recipeInstructions || '',
                            item.isDeleted ? 1 : 0
                        );
                    }
                    break;

                case 'staff':
                    for (const s of data) {
                        db.prepare('INSERT OR REPLACE INTO staff (id, name, roleId, pin, attendanceToken, recoveryCode, isDeleted, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
                          .run(s.id, s.name, s.roleId, s.pin, s.attendanceToken, s.recoveryCode, s.isDeleted ? 1 : 0, JSON.stringify(s));
                    }
                    break;

                case 'roles':
                    for (const r of data) {
                        db.prepare('INSERT OR REPLACE INTO roles (id, name, permissions) VALUES (?, ?, ?)')
                          .run(r.id, r.name, JSON.stringify(r.permissions));
                    }
                    break;

                case 'tables':
                    for (const t of data) {
                        db.prepare('INSERT OR REPLACE INTO tables (id, name, status, currentOrderId) VALUES (?, ?, ?, ?)')
                          .run(t.id, t.name, t.status, t.currentOrderId);
                    }
                    break;

                case 'reports':
                    // Xử lý báo cáo tổng hợp
                    db.prepare(`
                        INSERT OR REPLACE INTO reports (id, totalSales, successfulOrders, cancelledOrders, lastResetDate, customerIdCounter, nextQueueNumber, fixedCosts)
                        VALUES (1, ?, ?, ?, ?, ?, ?, ?)
                    `).run(
                        data.totalSales || 0, data.successfulOrders || 0, data.cancelledOrders || 0, 
                        data.lastResetDate, data.customerIdCounter || 1, data.nextQueueNumber || 1, JSON.stringify(data.fixedCosts || {})
                    );
                    // Xử lý logs nếu có trong file reports
                    if (data.logs && Array.isArray(data.logs)) {
                        for (const log of data.logs) {
                            db.prepare('INSERT OR REPLACE INTO report_logs (orderId, data) VALUES (?, ?)').run(log.id || log.orderId, JSON.stringify(log));
                        }
                    }
                    break;

                case 'orders':
                    for (const o of data) {
                        db.prepare(`
                            INSERT OR REPLACE INTO orders 
                            (id, queueNumber, customerId, deviceId, itemName, customerName, price, timestamp, note, options, cartItems, tableId, status, isPaid)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `).run(
                            o.id, o.queueNumber, o.customerId, o.deviceId, o.itemName, o.customerName, 
                            o.price, o.timestamp, o.note, JSON.stringify(o.options || {}), 
                            JSON.stringify(o.cartItems || []), o.tableId, o.status, o.isPaid ? 1 : 0
                        );
                    }
                    break;

                case 'inventory':
                    for (const i of data) {
                        db.prepare('INSERT OR REPLACE INTO inventory (id, name, unit, stock, minStock, usageHistory) VALUES (?, ?, ?, ?, ?, ?)')
                          .run(i.id, i.name, i.unit, i.stock, i.minStock, JSON.stringify(i.usageHistory || {}));
                    }
                    break;

                case 'promotions':
                    for (const p of data) {
                        db.prepare('INSERT OR REPLACE INTO promotions (id, name, description, isActive, data) VALUES (?, ?, ?, ?, ?)')
                          .run(p.id, p.name, p.description, p.isActive ? 1 : 0, JSON.stringify(p));
                    }
                    break;

                case 'imports':
                    for (const imp of data) {
                        db.prepare(`
                            INSERT OR REPLACE INTO imports 
                            (id, timestamp, ingredientId, ingredientName, importUnit, quantity, volumePerUnit, costPerUnit, totalCost, addedStock, baseUnit, supplier, isDeleted) 
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `).run(
                            imp.id, imp.timestamp, imp.ingredientId, imp.ingredientName, 
                            imp.importUnit, imp.quantity, imp.volumePerUnit, imp.costPerUnit, 
                            imp.totalCost, imp.addedStock, imp.baseUnit, imp.supplier || '',
                            imp.isDeleted ? 1 : 0
                        );
                    }
                    break;

                case 'expenses':
                    for (const e of data) {
                        db.prepare('INSERT OR REPLACE INTO expenses (id, name, timestamp, category, amount, note, staffId) VALUES (?, ?, ?, ?, ?, ?, ?)')
                          .run(e.id, e.name || e.description || '', e.timestamp || e.date, e.category, e.amount, e.note, e.staffId);
                    }
                    break;

                case 'inventory_audits':
                    for (const audit of data) {
                        db.prepare('INSERT OR REPLACE INTO inventory_audits (id, timestamp, orderId, data) VALUES (?, ?, ?, ?)')
                          .run(audit.id, audit.timestamp, audit.orderId, JSON.stringify(audit));
                    }
                    break;

                case 'schedules':
                    for (const s of data) {
                        db.prepare('INSERT OR REPLACE INTO schedules (id, staffId, date, shiftId, data) VALUES (?, ?, ?, ?, ?)')
                          .run(s.id, s.staffId, s.date, s.shiftId, JSON.stringify(s));
                    }
                    break;

                case 'disciplinary_logs':
                    for (const l of data) {
                        db.prepare('INSERT OR REPLACE INTO disciplinary_logs (id, staffId, timestamp, type, note, points) VALUES (?, ?, ?, ?, ?, ?)')
                          .run(l.id, l.staffId, l.timestamp, l.type, l.note, l.points);
                    }
                    break;

                case 'shifts':
                    for (const s of data) {
                        db.prepare(`
                            INSERT OR REPLACE INTO shifts (id, staffId, createdAt, clockIn, clockOut, actualHours, hourlyRate, totalPay, editHistory)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `).run(
                            s.id, s.staffId, s.createdAt, s.clockIn, s.clockOut, s.actualHours, 
                            s.hourlyRate || 0, s.totalPay || 0, JSON.stringify(s.editHistory || [])
                        );
                    }
                    break;

                case 'report_logs':
                    // File report_logs.json riêng biệt (nếu export ra từ hệ thống cũ)
                    if (Array.isArray(data)) {
                        for (const log of data) {
                            db.prepare('INSERT OR REPLACE INTO report_logs (orderId, data) VALUES (?, ?)').run(log.orderId || log.id, JSON.stringify(log));
                        }
                    }
                    break;

                default:
                    console.log(`[Migration] Không biết cách xử lý file: ${filename}. Bỏ qua.`);
                    return false;
            }
            return true;
        })();
    } catch (err) {
        console.error(`[Migration] Lỗi khi xử lý file ${filename}:`, err);
        return false;
    }
};

module.exports = migrate;
