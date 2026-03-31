/**
 * Script 5: Tách EditPromoModal, DeleteInventoryModal, DeleteMenuModal
 */
const fs = require('fs');
const SRC = 'src/components/AdminDashboard.jsx';
const MODALS = 'src/components/AdminDashboardTabs/modals';

let lines = fs.readFileSync(SRC, 'utf8').split('\n');

function findBlockAt(lineIdx) {
    let d = 0, end = lineIdx;
    for (let i = lineIdx; i < lines.length; i++) {
        for (const c of lines[i]) {
            if (c === '(' || c === '{') d++;
            if (c === ')' || c === '}') d--;
        }
        if (d <= 0 && i > lineIdx) { end = i; break; }
    }
    return { start: lineIdx, end };
}

// ============================================================
// 1. EditPromoModal (276 lines) — 1575-1850
// ============================================================
const epStart = lines.findIndex((l, i) => i > 1300 && l.includes('editPromo &&'));
const epBlock = findBlockAt(epStart);
console.log(`EditPromoModal: ${epBlock.start+1}-${epBlock.end+1} (${epBlock.end-epBlock.start+1} lines)`);

const epContent = lines.slice(epBlock.start, epBlock.end + 1).join('\n');
const epFile = `import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Gift, Save } from 'lucide-react';
import { formatVND, getVNDateStr } from '../../../utils/dashboardUtils';

const EditPromoModal = ({ editPromo, setEditPromo, menu, settings, saveP }) => {
    return (
        <AnimatePresence>
${epContent}
        </AnimatePresence>
    );
};

export default EditPromoModal;
`;
fs.writeFileSync(`${MODALS}/EditPromoModal.jsx`, epFile);
console.log(`✅ Wrote EditPromoModal.jsx`);

// ============================================================
// 2. DeleteInventoryModal (48 lines) — 2333-2380
// ============================================================
// Re-read after potential index shifts (not yet applied)
const diStart = lines.findIndex((l, i) => i > 1300 && l.trim() === '{deleteInventoryModal && (');
const diBlock = findBlockAt(diStart);
console.log(`DeleteInventoryModal: ${diBlock.start+1}-${diBlock.end+1} (${diBlock.end-diBlock.start+1} lines)`);

const diContent = lines.slice(diBlock.start, diBlock.end + 1).join('\n');
const diFile = `import React from 'react';
import { motion } from 'framer-motion';
import { Trash2 } from 'lucide-react';
import { SERVER_URL } from '../../../api';

const DeleteInventoryModal = ({ deleteInventoryModal, setDeleteInventoryModal, inventory, setInventory, showToast }) => {
    return (
${diContent}
    );
};

export default DeleteInventoryModal;
`;
fs.writeFileSync(`${MODALS}/DeleteInventoryModal.jsx`, diFile);
console.log(`✅ Wrote DeleteInventoryModal.jsx`);

// ============================================================
// 3. DeleteMenuModal (19 lines) — 2383-2401
// ============================================================
const dmStart = lines.findIndex((l, i) => i > 1300 && l.trim() === '{deleteMenuModal && (');
const dmBlock = findBlockAt(dmStart);
console.log(`DeleteMenuModal: ${dmBlock.start+1}-${dmBlock.end+1} (${dmBlock.end-dmBlock.start+1} lines)`);

const dmContent = lines.slice(dmBlock.start, dmBlock.end + 1).join('\n');
const dmFile = `import React from 'react';
import { Trash2 } from 'lucide-react';
import { SERVER_URL } from '../../../api';

const DeleteMenuModal = ({ deleteMenuModal, setDeleteMenuModal, setMenu, showToast }) => {
    return (
${dmContent}
    );
};

export default DeleteMenuModal;
`;
fs.writeFileSync(`${MODALS}/DeleteMenuModal.jsx`, dmFile);
console.log(`✅ Wrote DeleteMenuModal.jsx`);

// ============================================================
// Replace all 3 in AdminDashboard (from bottom up)
// ============================================================
// Sort desc by start line to splice safely
const toReplace = [
    { block: dmBlock, replacement: `                <DeleteMenuModal
                    deleteMenuModal={deleteMenuModal} setDeleteMenuModal={setDeleteMenuModal}
                    setMenu={setMenu} showToast={showToast}
                />` },
    { block: diBlock, replacement: `                <DeleteInventoryModal
                    deleteInventoryModal={deleteInventoryModal} setDeleteInventoryModal={setDeleteInventoryModal}
                    inventory={inventory} setInventory={setInventory} showToast={showToast}
                />` },
    { block: epBlock, replacement: `                <EditPromoModal
                    editPromo={editPromo} setEditPromo={setEditPromo}
                    menu={menu} settings={settings} saveP={saveP}
                />` },
].sort((a, b) => b.block.start - a.block.start);

for (const { block, replacement } of toReplace) {
    const indent = lines[block.start].match(/^(\s*)/)[1];
    const repLines = replacement.split('\n').map((l, i) => i === 0 ? indent + l.trimStart() : indent + l.trimStart());
    lines.splice(block.start, block.end - block.start + 1, ...repLines);
    console.log(`🔄 Replaced ${block.end - block.start + 1} lines with ${repLines.length} lines`);
}

// Add imports
lines = fs.readFileSync(SRC, 'utf8').split('\n'); // re-read after all replacements confusing index
// Actually write the spliced version first
fs.writeFileSync(SRC, lines.join('\n'));

// Now add imports
let content = fs.readFileSync(SRC, 'utf8');
const importMarker = "import MergeInventoryModal from './AdminDashboardTabs/modals/MergeInventoryModal';";
const newImports = `import MergeInventoryModal from './AdminDashboardTabs/modals/MergeInventoryModal';
import EditPromoModal from './AdminDashboardTabs/modals/EditPromoModal';
import DeleteInventoryModal from './AdminDashboardTabs/modals/DeleteInventoryModal';
import DeleteMenuModal from './AdminDashboardTabs/modals/DeleteMenuModal';`;
content = content.replace(importMarker, newImports);
fs.writeFileSync(SRC, content);

const finalLines = content.split('\n');
console.log(`\n📊 Final AdminDashboard.jsx: ${finalLines.length} lines`);
