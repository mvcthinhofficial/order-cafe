/**
 * Normalizes different timestamp representations (ISO string, numeric ms, string ms) into a valid Date object.
 * @param {string|number|Date} timestamp 
 * @returns {Date} 
 */
export const parseDate = (timestamp) => {
    if (!timestamp) return new Date(''); // Invalid Date
    if (timestamp instanceof Date) return timestamp;
    
    // Nếu là string chỉ chứa số (VD: '1774794154425' hoặc '1774794154425.0')
    if (typeof timestamp === 'string' && /^\d+(\.\d+)?$/.test(timestamp)) {
        return new Date(parseFloat(timestamp));
    }
    
    // Fallback thông thường (ISO string hoặc number)
    return new Date(timestamp);
};

/**
 * Returns 'HH:mm'
 * @param {string|number|Date} timestamp 
 * @returns {string} e.g. "16:39"
 */
export const formatTime = (timestamp) => {
    if (!timestamp) return '--:--';
    const d = parseDate(timestamp);
    if (isNaN(d.getTime())) return '--:--';
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
};

/**
 * Returns 'DD/MM/YYYY'
 * @param {string|number|Date} timestamp 
 * @returns {string} e.g. "29/03/2026"
 */
export const formatDate = (timestamp) => {
    if (!timestamp) return '--/--/----';
    const d = parseDate(timestamp);
    if (isNaN(d.getTime())) return '--/--/----';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
};

/**
 * Returns 'DD/MM/YYYY HH:mm'
 * @param {string|number|Date} timestamp 
 * @returns {string} e.g. "29/03/2026 16:39"
 */
export const formatDateTime = (timestamp) => {
    if (!timestamp) return '--/--/---- --:--';
    const d = parseDate(timestamp);
    if (isNaN(d.getTime())) return '--/--/---- --:--';
    return `${formatDate(timestamp)} ${formatTime(timestamp)}`;
};

/**
 * Returns date string in 'YYYY-MM-DD' format based on device local time.
 * @param {Date|string|number} [date=new Date()] 
 * @returns {string} e.g. "2026-03-29"
 */
export const getDateStr = (date = new Date()) => {
    const d = parseDate(date);
    if (isNaN(d.getTime())) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${yyyy}-${mm}-${dd}`;
};

/**
 * Generates a strictly unified ISO 8601 string time.
 * Ideal for recording events in Database uniformly.
 * @returns {string} e.g. "2026-03-29T13:46:59.197Z"
 */
export const getCurrentISOString = () => {
    return new Date().toISOString();
};
