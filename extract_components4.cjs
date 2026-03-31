/**
 * Script 4: Replace auto-update and backup blocks with custom hooks
 */
const fs = require('fs');
const SRC = 'src/components/AdminDashboard.jsx';

let lines = fs.readFileSync(SRC, 'utf8').split('\n');

// === STEP 1: Replace auto-update block (lines 194-305) with hook call ===
const updateStart = lines.findIndex(l => l.trim() === '// --- AUTO UPDATE STATE ---');
const updateEnd = lines.findIndex((l,i) => i > updateStart + 50 && l === '    };');
console.log(`Replacing update block: ${updateStart+1}-${updateEnd+1} (${updateEnd-updateStart+1} lines)`);

const updateReplacement = [
    `    // --- AUTO UPDATE (via hook) ---`,
    `    const {`,
    `        systemVersion, latestVersion, latestDescription, showReleaseNotes, setShowReleaseNotes,`,
    `        latestAssets, updateUrl, isUpdating, showUpdateBanner, setShowUpdateBanner,`,
    `        desktopUpdateProgress, isDesktopDownloading, handleSystemUpdate`,
    `    } = useSystemUpdate(setActiveTab);`,
    ``
];
lines.splice(updateStart, updateEnd - updateStart + 1, ...updateReplacement);
console.log(`✅ Replaced auto-update block (saved ${updateEnd-updateStart+1 - updateReplacement.length} lines)`);

// === STEP 2: Replace backup state declarations ===
// Re-read after splice
const backupStatePatterns = [
    '// Backup & Restore State',
    'const [backups, setBackups] = useState([]);',
    'const [isBackingUp, setIsBackingUp] = useState(false);',
    'const [isRestoring, setIsRestoring] = useState(false);',
];

// Find and remove each backup state line
for (const pattern of backupStatePatterns) {
    const idx = lines.findIndex(l => l.trim() === pattern.trim());
    if (idx >= 0) {
        lines.splice(idx, 1);
        console.log(`🗑️  Removed: ${pattern.slice(0,50)}`);
    }
}

// === STEP 3: Replace backup functions block ===
const backupStart = lines.findIndex(l => l.trim() === '// --- BACKUP & RESTORE FUNCTIONS ---');
const backupEnd = lines.findIndex((l,i) => i > backupStart + 30 && (l.includes('// Tính toán số liệu') || l.includes('const { stats30Days')));
console.log(`Backup functions: ${backupStart+1}-${backupEnd+1}`);

const backupReplacement = [
    `    // --- BACKUP & RESTORE (via hook) ---`,
    `    const { backups, isBackingUp, isRestoring, fetchBackups, handleCreateBackup, handleRestoreBackup } = useBackupRestore({ activeTab, userRole, showToast });`,
    ``
];
lines.splice(backupStart, backupEnd - backupStart, ...backupReplacement);
console.log(`✅ Replaced backup block`);

// === STEP 4: Add hook imports ===
const importInsert = lines.findIndex(l => l.includes("import TablesTab from"));
lines.splice(importInsert, 0,
    `import { useSystemUpdate } from '../utils/useSystemUpdate';`,
    `import { useBackupRestore } from '../utils/useBackupRestore';`
);
console.log(`✅ Added hook imports`);

fs.writeFileSync(SRC, lines.join('\n'));
console.log(`\n📊 Final: ${lines.length} lines`);
