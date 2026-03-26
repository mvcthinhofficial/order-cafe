const fs = require('fs');
const path = require('path');

const COMPONENTS_DIR = path.join(__dirname, 'src', 'components');

function refactorFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // 1. Replace hardcoded emerald with brand
  content = content.replace(/emerald-/g, 'brand-');
  content = content.replace(/bg-emerald/g, 'bg-brand');
  content = content.replace(/text-emerald/g, 'text-brand');
  content = content.replace(/border-emerald/g, 'border-brand');
  content = content.replace(/ring-emerald/g, 'ring-brand');
  content = content.replace(/from-emerald/g, 'from-brand');
  content = content.replace(/to-emerald/g, 'to-brand');

  // 2. Adjust border-radius (rounded-none to rounded-xl/2xl for softer look)
  // For standard elements
  content = content.replace(/rounded-none/g, 'rounded-2xl');

  // 3. For pure minimalist effect: replace hardcoded '#F8F9FA' / '#FDFDFD' with bg-slate-50 or bg-white
  content = content.replace(/bg-\[\#f8f9fa\]/gi, 'bg-slate-50');
  content = content.replace(/bg-\[\#fdfdfd\]/gi, 'bg-white');

  // 4. Update the primary color HEX to brand variables where obvious
  content = content.replace(/text-\[\#007AFF\]/gi, 'text-brand-600');
  content = content.replace(/bg-\[\#007AFF\]/gi, 'bg-brand-600');
  content = content.replace(/border-\[\#007AFF\]/gi, 'border-brand-600');

  // Find any remaining primary blue/brown and optionally map them? 
  // Wait, let's keep it safe. The user just asked to build the CSS Variables for theming.

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Refactored: ${path.basename(filePath)}`);
  }
}

// Read all jsx files in src/components
const files = fs.readdirSync(COMPONENTS_DIR);
files.forEach(file => {
  if (file.endsWith('.jsx')) {
    refactorFile(path.join(COMPONENTS_DIR, file));
  }
});
console.log("Refactoring complete.");
