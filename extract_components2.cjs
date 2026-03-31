/**
 * Script 2: Tách TablesTab, PromotionsTab, CancelOrderModal, OrderDetailModal, ProductionModal
 */
const fs = require('fs');
const path = require('path');

const SRC = 'src/components/AdminDashboard.jsx';
const TABS = 'src/components/AdminDashboardTabs';
const MODALS = 'src/components/AdminDashboardTabs/modals';

let lines = fs.readFileSync(SRC, 'utf8').split('\n');

function findBlock(searchStr, fromLine = 0) {
    const idx = lines.findIndex((l, i) => i >= fromLine && l.includes(searchStr));
    if (idx < 0) return null;
    let d = 0, end = idx;
    for (let i = idx; i < lines.length; i++) {
        for (const c of lines[i]) {
            if (c === '(' || c === '{') d++;
            if (c === ')' || c === '}') d--;
        }
        if (d <= 0 && i > idx) { end = i; break; }
    }
    return { start: idx, end };
}

// =============================================
// 1. TablesTab (108 lines render block)
// =============================================
const tablesBlock = findBlock("activeTab === 'tables' &&");
const tablesContent = lines.slice(tablesBlock.start + 1, tablesBlock.end).join('\n'); // inner content (skip wrapping ternary)
const tablesFileContent = `import React from 'react';
import { motion } from 'framer-motion';
import { Table, Plus, Users, CheckCircle, Clock } from 'lucide-react';
import { formatVND } from '../../utils/dashboardUtils';

const TablesTab = ({ tables, orders, settings, setActionTable, setEditTable }) => {
${tablesContent}
};

export default TablesTab;
`;
fs.writeFileSync(`${TABS}/TablesTab.jsx`, tablesFileContent);
console.log(`✅ TablesTab: ${tablesBlock.start+1}-${tablesBlock.end+1} (${tablesBlock.end - tablesBlock.start + 1} lines)`);

// =============================================
// 2. PromotionsTab (60 lines render block)
// =============================================
const promoBlock = findBlock("activeTab === 'promotions' && settings");
const promoContent = lines.slice(promoBlock.start + 1, promoBlock.end).join('\n');
const promoFileContent = `import React from 'react';
import { motion } from 'framer-motion';
import { Gift, Plus, Trash2, Edit2, Calendar } from 'lucide-react';
import { formatVND, getVNDateStr } from '../../utils/dashboardUtils';
import { CustomSwitch } from './SettingsTab';

const PromotionsTab = ({ promotions, menu, settings, hasPermission, setEditPromo, deleteP, saveP }) => {
${promoContent}
};

export default PromotionsTab;
`;
fs.writeFileSync(`${TABS}/PromotionsTab.jsx`, promoFileContent);
console.log(`✅ PromotionsTab: ${promoBlock.start+1}-${promoBlock.end+1} (${promoBlock.end - promoBlock.start + 1} lines)`);

// =============================================
// 3. CancelOrderModal (46 lines)
// =============================================
const cancelBlock = findBlock('cancelOrderId &&');
const cancelContent = lines.slice(cancelBlock.start, cancelBlock.end + 1).join('\n');
const cancelFileContent = `import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle } from 'lucide-react';

const CancelOrderModal = ({ cancelOrderId, cancelOrder, setCancelOrderId }) => {
    const [cancelReason, setCancelReason] = useState('');
    return (
        <AnimatePresence>
${cancelContent}
        </AnimatePresence>
    );
};

export default CancelOrderModal;
`;
fs.writeFileSync(`${MODALS}/CancelOrderModal.jsx`, cancelFileContent);
console.log(`✅ CancelOrderModal: ${cancelBlock.start+1}-${cancelBlock.end+1} (${cancelBlock.end - cancelBlock.start + 1} lines)`);

// =============================================
// 4. OrderDetailModal (224 lines)
// =============================================
const odBlock = findBlock('selectedLog && (() =>');
const odContent = lines.slice(odBlock.start, odBlock.end + 1).join('\n');
const odFileContent = `import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, Printer, XCircle } from 'lucide-react';
import { formatVND, getLogOrderId } from '../../utils/dashboardUtils';
import { getSavedTaxData } from '../../utils/taxUtils';
import { generateReceiptHTML } from '../../utils/printHelpers';

const OrderDetailModal = ({ selectedLog, setSelectedLog, settings, showToast }) => {
    return (
        <AnimatePresence>
${odContent}
        </AnimatePresence>
    );
};

export default OrderDetailModal;
`;
fs.writeFileSync(`${MODALS}/OrderDetailModal.jsx`, odFileContent);
console.log(`✅ OrderDetailModal: ${odBlock.start+1}-${odBlock.end+1} (${odBlock.end - odBlock.start + 1} lines)`);

// =============================================
// 5. ProductionModal (232 lines)
// =============================================
const prodBlock = findBlock('showProductionModal &&');
const prodContent = lines.slice(prodBlock.start, prodBlock.end + 1).join('\n');
const prodFileContent = `import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Package, Plus, Trash2, Save } from 'lucide-react';
import { SERVER_URL } from '../../api';
import { formatVND } from '../../utils/dashboardUtils';

const ProductionModal = ({
    showProductionModal, setShowProductionModal,
    inventory, productionInputs, setProductionInputs,
    productionOutputItem, setProductionOutputItem,
    productionOutputQty, setProductionOutputQty,
    productionOutputUnit, setProductionOutputUnit,
    showToast
}) => {
    return (
        <AnimatePresence>
${prodContent}
        </AnimatePresence>
    );
};

export default ProductionModal;
`;
fs.writeFileSync(`${MODALS}/ProductionModal.jsx`, prodFileContent);
console.log(`✅ ProductionModal: ${prodBlock.start+1}-${prodBlock.end+1} (${prodBlock.end - prodBlock.start + 1} lines)`);

// =============================================
// Replace blocks in AdminDashboard with component calls
// =============================================
// Re-read fresh
lines = fs.readFileSync(SRC, 'utf8').split('\n');

const replacements = [
    {
        search: "activeTab === 'tables' &&",
        replacement: `{activeTab === 'tables' && (
                            <TablesTab
                                tables={tables} orders={orders} settings={settings}
                                setActionTable={setActionTable} setEditTable={setEditTable}
                            />
                        )}`
    },
    {
        search: "activeTab === 'promotions' && settings",
        replacement: `{activeTab === 'promotions' && settings.enablePromotions && (
                            <PromotionsTab
                                promotions={promotions} menu={menu} settings={settings}
                                hasPermission={hasPermission} setEditPromo={setEditPromo}
                                deleteP={deleteP} saveP={saveP}
                            />
                        )}`
    },
    {
        search: 'cancelOrderId &&',
        replacement: `<CancelOrderModal
                    cancelOrderId={cancelOrderId}
                    cancelOrder={cancelOrder}
                    setCancelOrderId={setCancelOrderId}
                />`
    },
    {
        search: 'selectedLog && (() =>',
        replacement: `<OrderDetailModal
                    selectedLog={selectedLog}
                    setSelectedLog={setSelectedLog}
                    settings={settings}
                    showToast={showToast}
                />`
    },
    {
        search: 'showProductionModal &&',
        replacement: `<ProductionModal
                    showProductionModal={showProductionModal}
                    setShowProductionModal={setShowProductionModal}
                    inventory={inventory}
                    productionInputs={productionInputs} setProductionInputs={setProductionInputs}
                    productionOutputItem={productionOutputItem} setProductionOutputItem={setProductionOutputItem}
                    productionOutputQty={productionOutputQty} setProductionOutputQty={setProductionOutputQty}
                    productionOutputUnit={productionOutputUnit} setProductionOutputUnit={setProductionOutputUnit}
                    showToast={showToast}
                />`
    }
];

for (const { search, replacement } of replacements) {
    const idx = lines.findIndex(l => l.includes(search));
    if (idx < 0) { console.log('WARN replace not found:', search); continue; }
    let d = 0, end = idx;
    for (let i = idx; i < lines.length; i++) {
        for (const c of lines[i]) {
            if (c === '(' || c === '{') d++;
            if (c === ')' || c === '}') d--;
        }
        if (d <= 0 && i > idx) { end = i; break; }
    }
    const indent = lines[idx].match(/^(\s*)/)[1];
    const replacementLines = replacement.split('\n').map((l, i) => i === 0 ? indent + l.trimStart() : indent + l.trimStart());
    lines.splice(idx, end - idx + 1, ...replacementLines);
    console.log(`🔄 Replaced: ${search.slice(0, 40)}`);
}

fs.writeFileSync(SRC, lines.join('\n'));
console.log(`\n📊 AdminDashboard.jsx: ${lines.length} lines`);
