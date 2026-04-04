const express = require('express');

module.exports = function(db, log) {
    const router = express.Router();

    // GET /api/inventory-auto-po/low-stock
    router.get('/low-stock', (req, res) => {
        try {
            // Find all inventory items where stock <= minStock
            const lowStockItems = db.prepare(`SELECT * FROM inventory WHERE stock <= minStock`).all();

            // For each item, look up the last import record
            const results = lowStockItems.map(item => {
                const lastImport = db.prepare(`SELECT * FROM imports WHERE ingredientId = ? AND isDeleted = 0 ORDER BY timestamp DESC LIMIT 1`).get(item.id);
                
                // Calculate a recommended order quantity based on last import or default to 1
                let suggestedQty = 1;
                if (lastImport && lastImport.quantity > 0) {
                    suggestedQty = lastImport.quantity; 
                }

                return {
                    id: item.id,
                    name: item.name,
                    unit: item.unit,
                    stock: item.stock,
                    minStock: item.minStock,
                    importUnit: lastImport ? (lastImport.importUnit || 'hộp') : 'hộp',
                    volumePerUnit: lastImport ? (lastImport.volumePerUnit || 1) : 1,
                    costPerUnit: lastImport ? (lastImport.costPerUnit || 0) : 0,
                    baseUnit: lastImport ? (lastImport.baseUnit || item.unit) : item.unit,
                    suggestedQty: suggestedQty
                };
            });

            res.json(results);
        } catch (e) {
            if (log) log('[InventoryAutoPo] Lỗi lấy danh sách cảnh báo: ' + e.message);
            console.error('[InventoryAutoPo]', e);
            res.status(500).json({ error: 'Lỗi khi lấy thông tin hàng tồn kho thấp' });
        }
    });

    return router;
};
