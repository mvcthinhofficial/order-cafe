const fs = require('fs');
const files = [
    'src/components/AdminDashboard.jsx',
    'src/components/AdminDashboardTabs/StaffTab.jsx',
    'src/components/AdminDashboardTabs/StaffReportModal.jsx',
    'src/components/CustomerKiosk.jsx',
    'src/components/BillView.jsx',
    'src/components/SchedulesView.jsx',
    'src/components/AttendanceView.jsx'
];

for (const file of files) {
    if (!fs.existsSync(file)) continue;
    let code = fs.readFileSync(file, 'utf-8');
    
    // add import if not exist and needs substitution
    if (!code.includes('formatTime')) {
        let importPath = "'../utils/timeUtils'";
        if (file.includes('AdminDashboardTabs/')) {
            importPath = "'../../utils/timeUtils'";
        }
        const importStmt = "import { formatTime, formatDate, formatDateTime } from " + importPath + ";\n";
        const firstImportIdx = code.indexOf('import');
        if (firstImportIdx !== -1) {
            const endOfLine = code.indexOf('\n', firstImportIdx);
            code = code.slice(0, endOfLine + 1) + importStmt + code.slice(endOfLine + 1);
        } else {
            code = importStmt + code;
        }
    }

    // replace patterns precisely
    // Since some inside arguments may have nested parentheses like `new Date(o.timestamp ? o.timestamp : 0)`
    // we use a more refined regex or simply manual replacement loop for the most common ones.
    
    code = code.replace(/new Date\(([^)]+)\)\.toLocaleTimeString\([^)]*\)/g, 'formatTime($1)');
    code = code.replace(/new Date\(([^)]+)\)\.toLocaleDateString\([^)]*\)/g, 'formatDate($1)');
    code = code.replace(/new Date\(([^)]+)\)\.toLocaleString\([^)]*\)/g, 'formatDateTime($1)');

    fs.writeFileSync(file, code);
}
console.log('UI files refactored');
