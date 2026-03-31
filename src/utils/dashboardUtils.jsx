/**
 * Common Utility Functions for Admin Dashboard
 */

import React from 'react';

export const CurrencyInput = ({ value, onChange, placeholder, autoFocus, className = '', containerClassName = '', suffix = '.000đ', suffixClassName = '', ...props }) => {
    return (
        <div className={`relative flex items-center bg-white border border-gray-200 focus-within:border-brand-600 px-3 py-2 ${containerClassName}`}>
            <input
                type="number"
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                className={`w-full font-black text-gray-900 outline-none text-right bg-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${className}`}
                autoFocus={autoFocus}
                {...props}
            />
            <span className={`font-black text-gray-400 select-none ml-1 pointer-events-none ${suffixClassName}`}>{suffix}</span>
        </div>
    );
};

export const formatVND = (price) => {
    const num = parseFloat(price);
    if (isNaN(num)) return '0đ';
    // Đảm bảo không bao giờ có phần thập phân dư thừa
    return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Math.round(num * 1000)) + 'đ';
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

// Helper for Local Time
export const getVNTime = (date = new Date()) => new Date(date);
export const getVNDateStr = (date = new Date()) => {
    const d = new Date(date);
    return d.toLocaleDateString('en-CA');
};

// VietQR parser
export const BIN_MAP = {
    '970436': 'VCB', '970422': 'MB', '970407': 'TCB', '970415': 'VietinBank',
    '970418': 'BIDV', '970416': 'ACB', '970423': 'TPBank', '970432': 'VPBank',
    '970441': 'VIB', '970405': 'Agribank', '970429': 'SCB', '970448': 'OCB',
    '970437': 'HDBank', '970428': 'NamABank', '970454': 'VietCapitalBank',
    '970403': 'Sacombank'
};

export const parseVietQR = (content) => {
    if (!content || !content.startsWith('000201')) return null;
    try {
        const fields = {};
        let idx = 0;
        while (idx < content.length) {
            const id = content.slice(idx, idx + 2);
            const len = parseInt(content.slice(idx + 2, idx + 4));
            const val = content.slice(idx + 4, idx + 4 + len);
            fields[id] = val;
            idx += 4 + len;
        }
        if (fields['38']) {
            const subContent = fields['38'];
            const subFields = {};
            let sIdx = 0;
            while (sIdx < subContent.length) {
                const sId = subContent.slice(sIdx, sIdx + 2);
                const sLen = parseInt(subContent.slice(sIdx + 2, sIdx + 4));
                const sVal = subContent.slice(sIdx + 4, sIdx + 4 + sLen);
                subFields[sId] = sVal;
                sIdx += 4 + sLen;
            }
            if (subFields['01']) {
                const pspContent = subFields['01'];
                const pspFields = {};
                let pIdx = 0;
                while (pIdx < pspContent.length) {
                    const pId = pspContent.slice(pIdx, pIdx + 2);
                    const pLen = parseInt(pspContent.slice(pIdx + 2, pIdx + 4));
                    const pVal = pspContent.slice(pIdx + 4, pIdx + 4 + pLen);
                    pspFields[pId] = pVal;
                    pIdx += 4 + pLen;
                }
                return {
                    bankId: BIN_MAP[pspFields['00']] || pspFields['00'],
                    accountNo: pspFields['01'],
                    accountName: fields['59'] || ''
                };
            }
        }
    } catch (e) {
        console.error("L\u1ed7i ph\u00e2n t\u00edch VietQR:", e);
    }
    return null;
};
