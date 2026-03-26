const fs = require('fs');
const parser = require('@babel/parser');
const code = fs.readFileSync('src/components/AdminDashboard.jsx', 'utf-8');
try {
  parser.parse(code, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript']
  });
  console.log('No syntax errors found.');
} catch (e) {
  console.error(e.message);
}
