const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const MENU_FILE = path.join(DATA_DIR, 'menu.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

const menu = JSON.parse(fs.readFileSync(MENU_FILE, 'utf-8'));
const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));

const uniqueCats = [...new Set(menu.filter(m => !m.isDeleted).map(i => i.category))];
const order = settings.categoryOrder || [];
const sortedCats = [...uniqueCats].sort((a, b) => {
    const idxA = order.indexOf(a);
    const idxB = order.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b);
});

const trackers = {};
const newMenu = menu.map(item => {
    if (item.isDeleted) return item;
    const idx = sortedCats.indexOf(item.category);
    const prefix = idx !== -1 ? String(idx + 1) : '9';
    if (!trackers[item.category]) trackers[item.category] = 1;
    return { ...item, shortcutCode: `${prefix}${trackers[item.category]++}` };
});

fs.writeFileSync(MENU_FILE, JSON.stringify(newMenu, null, 2), 'utf-8');
console.log('Fixed shortcuts!');
