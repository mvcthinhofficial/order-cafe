/**
 * Script tách components inline từ AdminDashboard.jsx ra file riêng
 * Chạy: node extract_components.cjs
 */
const fs = require('fs');
const path = require('path');

const SRC = 'src/components/AdminDashboard.jsx';
const TABS_DIR = 'src/components/AdminDashboardTabs';
const MODALS_DIR = 'src/components/AdminDashboardTabs/modals';

let lines = fs.readFileSync(SRC, 'utf8').split('\n');

function findComponentBlock(name, startPattern) {
    const idx = lines.findIndex(l => l.match(startPattern));
    if (idx < 0) return null;
    let depth = 0, endIdx = idx;
    for (let i = idx; i < lines.length; i++) {
        for (const ch of lines[i]) {
            if (ch === '(' || ch === '{') depth++;
            if (ch === ')' || ch === '}') depth--;
        }
        if (depth <= 0 && i > idx) { endIdx = i; break; }
    }
    // Include trailing semicolons or empty lines
    while (endIdx + 1 < lines.length && (lines[endIdx + 1].trim() === '' || lines[endIdx + 1].trim() === ';')) endIdx++;
    return { name, start: idx, end: endIdx, size: endIdx - idx + 1 };
}

// === STEP 1: Extract all inline components to separate files ===

const components = [
    // Modals
    { name: 'TableModal', pattern: /^const TableModal = /, file: `${MODALS_DIR}/TableModal.jsx`,
      imports: `import React, { useState } from 'react';\nimport { Save, Trash2, X } from 'lucide-react';\n`,
      exportLine: 'export default TableModal;' },

    { name: 'TableActionModal', pattern: /^const TableActionModal = /, file: `${MODALS_DIR}/TableActionModal.jsx`,
      imports: `import React, { useState } from 'react';\nimport { motion } from 'framer-motion';\nimport { X, ShoppingCart, CheckCircle, XCircle, ArrowRightLeft, Play, Square } from 'lucide-react';\n`,
      exportLine: 'export default TableActionModal;' },

    { name: 'InventoryModal', pattern: /^const InventoryModal = /, file: `${MODALS_DIR}/InventoryModal.jsx`,
      imports: `import React, { useState } from 'react';\nimport { Save, X } from 'lucide-react';\n`,
      exportLine: 'export default InventoryModal;' },

    { name: 'ExpenseModal', pattern: /^const ExpenseModal = /, file: `${MODALS_DIR}/ExpenseModal.jsx`,
      imports: `import React, { useState, useEffect } from 'react';\nimport { Save, X, Trash2, Calendar } from 'lucide-react';\nimport { formatVND } from '../../../utils/dashboardUtils';\n`,
      exportLine: 'export default ExpenseModal;' },

    { name: 'ImportModal', pattern: /^const ImportModal = /, file: `${MODALS_DIR}/ImportModal.jsx`,
      imports: `import React, { useState, useEffect, useMemo } from 'react';\nimport { Save, X, Plus, Trash2, Search, Package } from 'lucide-react';\nimport { formatVND } from '../../../utils/dashboardUtils';\n`,
      exportLine: 'export default ImportModal;' },

    { name: 'RecipeGuideModal', pattern: /^const RecipeGuideModal = /, file: `${MODALS_DIR}/RecipeGuideModal.jsx`,
      imports: `import React, { useState, useMemo } from 'react';\nimport { X, Search, BookOpen } from 'lucide-react';\nimport { formatVND } from '../../../utils/dashboardUtils';\n`,
      exportLine: 'export default RecipeGuideModal;' },

    { name: 'CategoryManagerModal', pattern: /^const CategoryManagerModal = /, file: `${MODALS_DIR}/CategoryManagerModal.jsx`,
      imports: `import React, { useState } from 'react';\nimport { motion, Reorder } from 'framer-motion';\nimport { X, Plus, Edit2, Trash2, Save, GripVertical, CheckCircle } from 'lucide-react';\nimport { SERVER_URL } from '../../../api';\n`,
      exportLine: 'export default CategoryManagerModal;' },

    { name: 'InventoryAuditModal', pattern: /^const InventoryAuditModal = /, file: `${MODALS_DIR}/InventoryAuditModal.jsx`,
      imports: `import React, { useState, useEffect } from 'react';\nimport { motion, AnimatePresence } from 'framer-motion';\nimport { X, Save, CheckCircle, AlertTriangle } from 'lucide-react';\n`,
      exportLine: 'export default InventoryAuditModal;' },

    { name: 'IngredientUsageModal', pattern: /^const IngredientUsageModal = /, file: `${MODALS_DIR}/IngredientUsageModal.jsx`,
      imports: `import React, { useState, useEffect } from 'react';\nimport { X, TrendingUp, TrendingDown, Package } from 'lucide-react';\nimport { SERVER_URL } from '../../../api';\nimport { formatVND } from '../../../utils/dashboardUtils';\n`,
      exportLine: 'export default IngredientUsageModal;' },

    { name: 'MergeInventoryModal', pattern: /^const MergeInventoryModal = /, file: `${MODALS_DIR}/MergeInventoryModal.jsx`,
      imports: `import React, { useState } from 'react';\nimport { X, Merge, AlertTriangle } from 'lucide-react';\nimport { SERVER_URL } from '../../../api';\n`,
      exportLine: 'export default MergeInventoryModal;' },

    // Tab-level components
    { name: 'InlineEditPanel', pattern: /^const DEFAULT_SUGAR = /, file: `${TABS_DIR}/InlineEditPanel.jsx`,
      imports: `import React, { useState } from 'react';\nimport { motion, AnimatePresence, Reorder } from 'framer-motion';\nimport { Save, X, Plus, Trash2, Edit2, ChevronDown, ChevronUp, ArrowUp, ArrowDown, Search, GripVertical, Camera, Info } from 'lucide-react';\nimport { SERVER_URL, getImageUrl } from '../../api';\nimport { formatVND } from '../../utils/dashboardUtils';\n`,
      exportLine: 'export { InlineEditPanel, DEFAULT_SUGAR, DEFAULT_ICE };', endPattern: /^\/\/ --- Hook/ },
];

const extracted = [];

for (const comp of components) {
    const block = findComponentBlock(comp.name, comp.pattern);
    if (!block) { console.log(`WARN: ${comp.name} not found!`); continue; }

    // For InlineEditPanel, find the right end (before ShortcutDoubleEnter)
    if (comp.endPattern) {
        const endIdx = lines.findIndex((l, i) => i > block.start && l.match(comp.endPattern));
        if (endIdx > 0) block.end = endIdx - 1;
        // Remove trailing empty lines
        while (block.end > block.start && lines[block.end].trim() === '') block.end--;
        block.size = block.end - block.start + 1;
    }

    const content = lines.slice(block.start, block.end + 1).join('\n');
    const fileContent = `${comp.imports}\n${content}\n\n${comp.exportLine}\n`;
    fs.writeFileSync(comp.file, fileContent);
    console.log(`✅ ${comp.name}: ${block.start+1}-${block.end+1} (${block.size} lines) → ${comp.file}`);
    extracted.push(block);
}

// === STEP 2: Remove extracted blocks from AdminDashboard.jsx ===
// Sort by start DESC to remove from bottom first
extracted.sort((a, b) => b.start - a.start);

for (const block of extracted) {
    lines.splice(block.start, block.end - block.start + 1);
    console.log(`🗑️  Removed ${block.name} (${block.size} lines)`);
}

fs.writeFileSync(SRC, lines.join('\n'));
console.log(`\n📊 Final AdminDashboard.jsx: ${lines.length} lines`);
