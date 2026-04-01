/**
 * ShortcutUtils.js
 * ─────────────────────────────────────────────────────────────
 * Logic xử lý phím tắt cho hệ thống POS (Ghost Hotkeys).
 * Tách biệt khỏi các Component React để dễ quản lý và kiểm thử.
 * ─────────────────────────────────────────────────────────────
 */

// ─── Hằng số ────────────────────────────────────────────────
export const BUFFER_TIMEOUT_MS = 1500;
export const FLASH_DURATION_MS = 700;
export const ERROR_FLASH_MS = 500;

/**
 * Kiểm tra xem có đang focus vào input/textarea/select không.
 */
export const isInputActive = () => {
    if (typeof document === 'undefined') return false;
    const tag = document.activeElement?.tagName?.toLowerCase() || '';
    const isEditable = document.activeElement?.isContentEditable;
    return ['input', 'textarea', 'select'].includes(tag) || isEditable;
};

// Alias cho tương thích ngược nếu cần
export const isInputFocused = isInputActive;

/**
 * Tìm món chính theo mã shortcutCode.
 */
export const findMainItem = (code, menu) => {
    if (!menu) return null;
    return menu.find(item => item.shortcutCode === code && !item.isDeleted);
};

/**
 * Tìm addon theo mã addonCode trong món chính.
 */
export const findAddon = (code, mainItem) => {
    if (!mainItem || !mainItem.addons) return null;
    return mainItem.addons.find(a => a.addonCode === code);
};

/**
 * Xử lý chuyển đổi Size (.).
 */
export const getNextSize = (mainItem, currentSize) => {
    if (!mainItem || !mainItem.sizes || mainItem.sizes.length === 0) return currentSize;
    const sizes = mainItem.sizes;
    const currentIdx = sizes.findIndex(s => s.label === currentSize?.label);
    const nextIdx = (currentIdx + 1) % sizes.length;
    return sizes[nextIdx];
};

/**
 * Phân tích mã Đường (-).
 */
export const parseSugar = (code, mainItem) => {
    if (!mainItem || !code.startsWith('-') || code.length < 2) return null;
    const t = code[1];
    const opts = (mainItem.sugarOptions?.length ? mainItem.sugarOptions : ['100%', '50%', '0%']);
    // Dùng startsWith('0') thay vì includes('0') để tránh match nhầm '100%' hay '50%'
    if (t === '0') return opts.find(o => o.startsWith('0') || o.toLowerCase().includes('không đường'));
    if (t === '5') return opts.find(o => o.startsWith('5') || o.includes('50'));
    if (t === '1') return opts.find(o => o.startsWith('1') && o.includes('100') || o.toLowerCase().includes('bình thường'));
    return null;
};

/**
 * Phân tích mã Đá (/).
 */
export const parseIce = (code, mainItem) => {
    if (!mainItem || !code.startsWith('/') || code.length < 2) return null;
    const t = code[1];
    const opts = (mainItem.iceOptions?.length ? mainItem.iceOptions : ['Bình thường', 'Ít đá', 'Không đá', 'Nhiều đá']);
    if (t === '0') return opts.find(o => o.toLowerCase().includes('không') || o.includes('0'));
    if (t === '5') return opts.find(o => o.toLowerCase().includes('ít') || o.includes('50'));
    if (t === '1') return opts.find(o => o.toLowerCase().includes('bình thường') || o.includes('100'));
    if (t === '9') return opts.find(o => o.toLowerCase().includes('nhiều') || o.includes('Nhiều đá'));
    return null;
};

/**
 * Phân tích mã Số lượng (*).
 */
export const parseQuantity = (code) => {
    if (!code.startsWith('*') || code.length < 2) return null;
    const qtyStr = code.substring(1);
    const qty = parseInt(qtyStr, 10);
    if (!isNaN(qty) && qty > 0 && qty <= 99) return qty;
    return null;
};

/**
 * Ánh xạ phím Numpad sang phím chuẩn.
 */
export const mapNumpadKey = (key) => {
    switch (key) {
        case 'NumpadSubtract': return '-';
        case 'NumpadDivide': return '/';
        case 'NumpadDecimal':
        case ',': return '.';
        case 'NumpadMultiply': return '*';
        default: return key;
    }
};

/**
 * Xử lý chuyển đổi Nguồn đơn hàng (Order Source).
 */
export const getNextOrderSource = (current) => {
    const sources = ['INSTORE', 'GRAB', 'SHOPEE'];
    const idx = sources.indexOf(current);
    return sources[(idx + 1) % sources.length];
};

/**
 * Detector cho nhấn đúp phím (Double Tap).
 * @param {number} last - Thời điểm nhấn lần trước.
 * @param {number} threshold - Ngưỡng thời gian (ms).
 * @returns {boolean} - True nếu là kích hoạt nhấn đúp.
 */
export const isDoubleTap = (last, threshold = 500) => {
    return (Date.now() - last < threshold);
};
