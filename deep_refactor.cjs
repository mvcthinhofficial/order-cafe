const fs = require('fs');
const path = require('path');

const COMPONENTS_DIR = path.join(__dirname, 'src', 'components');

function refactorFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // Mass replace hex colors in JSX className strings or inline styles to predefined CSS variables / Tw classes
  content = content.replace(/style=\{\{\s*backgroundColor:\s*['"]#(8[Bb]5[Ee]3[Cc]|f5[Aa]623|007[Aa][Ff][Ff])['"]\s*\}\}/gi, '');
  content = content.replace(/style=\{\{\s*color:\s*['"]#(8[Bb]5[Ee]3[Cc]|f5[Aa]623|007[Aa][Ff][Ff])['"]\s*\}\}/gi, '');
  
  // Also inline styles with other stuff
  content = content.replace(/backgroundColor:\s*['"]#(8[Bb]5[Ee]3[Cc]|f5[Aa]623|007[Aa][Ff][Ff])['"]/gi, 'backgroundColor: "var(--brand-600)"');
  content = content.replace(/color:\s*['"]#(8[Bb]5[Ee]3[Cc]|f5[Aa]623|007[Aa][Ff][Ff])['"]/gi, 'color: "var(--brand-600)"');

  // className overrides
  content = content.replace(/text-\[\#f5a623\]/gi, 'text-brand-500');
  content = content.replace(/bg-\[\#f5a623\]/gi, 'bg-brand-500');
  content = content.replace(/border-\[\#f5a623\]/gi, 'border-brand-500');
  
  content = content.replace(/text-\[\#8b5e3c\]/gi, 'text-brand-600');
  content = content.replace(/bg-\[\#8b5e3c\]/gi, 'bg-brand-600');
  content = content.replace(/border-\[\#8b5e3c\]/gi, 'border-brand-600');

  content = content.replace(/text-\[\#1a1a1a\]/gi, 'text-gray-900');
  content = content.replace(/bg-\[\#1a1a1a\]/gi, 'bg-gray-900');
  content = content.replace(/border-\[\#1a1a1a\]/gi, 'border-gray-900');

  content = content.replace(/bg-\[\#fff9f2\]/gi, 'bg-brand-50');

  content = content.replace(/text-\[\#007aff\]/gi, 'text-brand-600');
  content = content.replace(/bg-\[\#007aff\]/gi, 'bg-brand-600');
  content = content.replace(/border-\[\#007aff\]/gi, 'border-brand-600');
  
  content = content.replace(/text-\[\#34c759\]/gi, 'text-brand-500');
  content = content.replace(/bg-\[\#34c759\]/gi, 'bg-brand-500');
  content = content.replace(/border-\[\#34c759\]/gi, 'border-brand-500');


  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Deep Refactored: ${path.basename(filePath)}`);
  }
}

const files = fs.readdirSync(COMPONENTS_DIR);
files.forEach(file => {
  if (file.endsWith('.jsx')) {
    refactorFile(path.join(COMPONENTS_DIR, file));
  }
});
console.log("Deep refactoring complete.");
