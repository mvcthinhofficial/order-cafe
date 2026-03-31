/**
 * Script 3: Tách AdminHeader, FactoryResetModal
 */
const fs = require('fs');
const TABS = 'src/components/AdminDashboardTabs';
const MODALS = 'src/components/AdminDashboardTabs/modals';
const SRC = 'src/components/AdminDashboard.jsx';

// === Extract AdminHeader ===
let lines = fs.readFileSync(SRC, 'utf8').split('\n');

const hStart = lines.findIndex(l => l.includes('{/* Header */}'));
let hEnd = lines.findIndex((l, i) => i > hStart && l.trim() === '</header>');
console.log(`AdminHeader: ${hStart+1}-${hEnd+1} (${hEnd-hStart+1} lines)`);

const headerContent = lines.slice(hStart + 1, hEnd).join('\n'); // skip comment, skip </header>

const headerFile = `import React from 'react';
import { Settings, LogOut } from 'lucide-react';
import {
    ClipboardList, Table, Package, BarChart3, Users, Gift
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { SERVER_URL } from '../../api';
import StoreClock from './StoreClock';

const AdminHeader = ({
    settings, activeTab, handleTabChange,
    isDirty, userRole, userName, userRoleName
}) => {
    const navigate = useNavigate();
    return (
        <header className="admin-header w-full border-b border-gray-100 bg-white flex-shrink-0 z-50 relative">
${headerContent}
        </header>
    );
};

export default AdminHeader;
`;
fs.writeFileSync(`${TABS}/AdminHeader.jsx`, headerFile);
console.log(`✅ Wrote AdminHeader.jsx`);

// === Extract StoreClock ===
lines = fs.readFileSync(SRC, 'utf8').split('\n');
const scStart = lines.findIndex(l => l.startsWith('const StoreClock'));
let d=0, scEnd=scStart;
for(let i=scStart; i<lines.length; i++) {
    for(const c of lines[i]){if(c==='('||c==='{')d++;if(c===')'||c==='}')d--;}
    if(d<=0&&i>scStart){scEnd=i;break;}
}
console.log(`StoreClock: ${scStart+1}-${scEnd+1} (${scEnd-scStart+1} lines)`);
const scContent = lines.slice(scStart, scEnd+1).join('\n');
const scFile = `import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

${scContent}

export default StoreClock;
`;
fs.writeFileSync(`${TABS}/StoreClock.jsx`, scFile);
console.log(`✅ Wrote StoreClock.jsx`);

// Remove StoreClock from AdminDashboard
lines.splice(scStart, scEnd - scStart + 1);
fs.writeFileSync(SRC, lines.join('\n'));
console.log(`🗑️  Removed StoreClock from AdminDashboard`);

// === Extract FactoryResetModal ===
lines = fs.readFileSync(SRC, 'utf8').split('\n');
const fStart = lines.findIndex(l => l.includes('showFactoryResetModal &&'));
let d2=0, fEnd=fStart;
for(let i=fStart; i<lines.length; i++) {
    for(const c of lines[i]){if(c==='('||c==='{')d2++;if(c===')'||c==='}')d2--;}
    if(d2<=0&&i>fStart){fEnd=i;break;}
}
console.log(`FactoryResetModal inline: ${fStart+1}-${fEnd+1} (${fEnd-fStart+1} lines)`);
const fContent = lines.slice(fStart, fEnd+1).join('\n');

// Write full modal component
const fFile = `import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, Rocket, RefreshCw } from 'lucide-react';
import { SERVER_URL } from '../../../api';

const FactoryResetModal = ({
    showFactoryResetModal, setShowFactoryResetModal, showToast, backups
}) => {
    const [factoryResetStep, setFactoryResetStep] = useState(1);
    const [factoryResetInput, setFactoryResetInput] = useState('');
    const [isFactoryResetting, setIsFactoryResetting] = useState(false);

    const setStep = setFactoryResetStep;
    const setInput = setFactoryResetInput;
    const setModal = setShowFactoryResetModal;

    return (
        <AnimatePresence>
${fContent}
        </AnimatePresence>
    );
};

export default FactoryResetModal;
`;
fs.writeFileSync(`${MODALS}/FactoryResetModal.jsx`, fFile);
console.log(`✅ Wrote FactoryResetModal.jsx`);

// Replace in AdminDashboard with component call
const fReplacement = `                <FactoryResetModal
                    showFactoryResetModal={showFactoryResetModal}
                    setShowFactoryResetModal={setShowFactoryResetModal}
                    showToast={showToast}
                    backups={backups}
                />`;
const fReplacementLines = fReplacement.split('\n');
lines.splice(fStart, fEnd - fStart + 1, ...fReplacementLines);
fs.writeFileSync(SRC, lines.join('\n'));
console.log(`🔄 Replaced FactoryResetModal inline with component`);

// === Replace AdminHeader ===
lines = fs.readFileSync(SRC, 'utf8').split('\n');
const hCommentStart = lines.findIndex(l => l.includes('{/* Header */}'));
const hCloseEnd = lines.findIndex((l, i) => i > hCommentStart && l.trim() === '</header>');
const adminHeaderReplacement = `                {/* Header */}
                <AdminHeader
                    settings={settings} activeTab={activeTab} handleTabChange={handleTabChange}
                    isDirty={isDirty} userRole={userRole} userName={userName} userRoleName={userRoleName}
                />`;
lines.splice(hCommentStart, hCloseEnd - hCommentStart + 1, ...adminHeaderReplacement.split('\n'));
fs.writeFileSync(SRC, lines.join('\n'));
console.log(`🔄 Replaced AdminHeader inline with component`);

// === Add new imports ===
lines = fs.readFileSync(SRC, 'utf8').split('\n');
const importInsert = lines.findIndex(l => l.includes("import TablesTab from"));
const newImports = [
    `import StoreClock from './AdminDashboardTabs/StoreClock';`,
    `import AdminHeader from './AdminDashboardTabs/AdminHeader';`,
    `import FactoryResetModal from './AdminDashboardTabs/modals/FactoryResetModal';`,
];
lines.splice(importInsert, 0, ...newImports);
fs.writeFileSync(SRC, lines.join('\n'));

console.log(`\n📊 Final AdminDashboard.jsx: ${lines.length} lines`);
