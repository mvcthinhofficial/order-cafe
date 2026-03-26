const fs = require('fs');
const path = require('path');

const fontsCssPath = path.join(__dirname, '../src/fonts.css');
const outputCssPath = path.join(__dirname, '../src/fonts-base64.css');
const fontsDir = path.join(__dirname, '../src');

if (!fs.existsSync(fontsCssPath)) {
  console.error("src/fonts.css not found!");
  process.exit(1);
}

let cssData = fs.readFileSync(fontsCssPath, 'utf8');

// The regex to find url(./fonts/somefont.woff2) or url("...") or url('...')
const urlRegex = /url\(['"]?(?:\.\/)?(fonts\/[^'"]+)['"]?\)/g;

let localCssData = cssData;
let match;
let count = 0;

while ((match = urlRegex.exec(cssData)) !== null) {
  const fullMatch = match[0];
  const fontRelPath = match[1]; // e.g. "fonts/font.woff2"
  
  const fontAbsPath = path.join(fontsDir, fontRelPath);
  
  if (fs.existsSync(fontAbsPath)) {
    const fontData = fs.readFileSync(fontAbsPath);
    const base64Data = fontData.toString('base64');
    
    // Determine mime type based on extension
    const ext = path.extname(fontAbsPath).toLowerCase();
    let mimeType = 'font/woff2';
    if (ext === '.woff') mimeType = 'font/woff';
    else if (ext === '.ttf') mimeType = 'font/ttf';
    
    const dataUri = `url(data:${mimeType};charset=utf-8;base64,${base64Data})`;
    
    localCssData = localCssData.replace(fullMatch, dataUri);
    count++;
  } else {
    console.warn(`Font file not found: ${fontAbsPath}`);
  }
}

fs.writeFileSync(outputCssPath, localCssData, 'utf8');
console.log(`Successfully converted ${count} font URLs to base64.`);
console.log(`Wrote to: ${outputCssPath}`);
