/**
 * Common Utility Functions for Admin Dashboard
 */

export const formatVND = (price) => {
    const num = parseFloat(price);
    if (isNaN(num)) return '0 \u20ab';
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num * 1000);
};

// Helper for semver comparison (v1.0.1 > v1.0.0)
export const isNewerVersion = (latest, current) => {
    if (!latest || !current) return false;
    const parse = v => v.toString().replace(/^v/, '').split('.').map(num => parseInt(num) || 0);
    const [lMajor, lMinor, lPatch] = parse(latest);
    const [cMajor, cMinor, cPatch] = parse(current);

    if (lMajor > cMajor) return true;
    if (lMajor < cMajor) return false;

    if (lMinor > cMinor) return true;
    if (lMinor < cMinor) return false;

    return lPatch > cPatch;
};

export const getLogOrderId = (log) => {
    if (!log) return '';
    const idStr = (log.orderId || log.id || '').toString();

    // N\u1ebfu \u0111\u00e3 \u0111\u00fang \u0111\u1ecbnh d\u1ea1ng 10 s\u1ed1 TTTTDDMMYY (chu\u1ea9n m\u1edbi)
    if (/^\d{10}$/.test(idStr)) {
        return idStr;
    }

    // N\u1ebfu c\u00f3 queueNumber (\u0111\u00e3 g\u00e1n t\u1eeb server ho\u1eb7c POS)
    if (log.queueNumber && log.timestamp) {
        const d = new Date(log.timestamp);
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yy = String(d.getFullYear()).slice(-2);
        const tttt = String(log.queueNumber).padStart(4, '0');
        return `${tttt}${dd}${mm}${yy}`;
    }

    return '---';
};

export const getSortedCategories = (menu, settings) => {
    const uniqueCats = [...new Set(menu.filter(m => !m.isDeleted).map(i => i.category))];
    const order = settings?.menuCategories || [];
    return uniqueCats.sort((a, b) => {
        const idxA = order.indexOf(a);
        const idxB = order.indexOf(b);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.localeCompare(b);
    });
};
