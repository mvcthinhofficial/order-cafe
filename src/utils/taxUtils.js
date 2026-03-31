/**
 * Tiện ích tính toán thuế mô phỏng & vận hành cho Frontend.
 * Đồng bộ logic với taxUtils.cjs để đảm bảo không lệch số.
 * Quy tắc làm tròn: Math.floor (cắt bỏ phần thập phân, không làm tròn lên).
 * Đơn vị: amount đầu vào là NGHÌN ĐỒNG (VD: 46 = 46.000đ).
 * Tính nội bộ trên đơn vị đồng (x1000) rồi trả về nghìn đồng (/1000).
 */

/**
 * Tính toán thuế cho đơn hàng thực tế (Live Ordering).
 * @param {number} amount - Số tiền theo đơn vị NGHÌN ĐỒNG (VD: 46 = 46.000đ)
 * @param {object} settings - Cấu hình thuế { taxRate, taxMode }
 * @returns {object} { taxAmount, finalTotal } - Cũng theo đơn vị nghìn đồng
 */
export const calculateLiveOrderTax = (amount, settings = {}) => {
    const rate = parseFloat(settings.taxRate) || 0;
    const mode = settings.taxMode || 'NONE';
    const numAmount = parseFloat(amount) || 0;
    // Đổi sang đơn vị đồng để tránh mất độ chính xác khi Math.floor
    const amountVND = numAmount * 1000;

    if (mode === 'NONE' || rate <= 0) {
        return { taxAmount: 0, finalTotal: numAmount };
    }

    if (mode === 'EXCLUSIVE') {
        const taxVND = Math.floor(amountVND * (rate / 100));
        return { 
            taxAmount: taxVND / 1000, 
            finalTotal: numAmount + taxVND / 1000
        };
    } else {
        const taxVND = Math.floor(amountVND - (amountVND / (1 + (rate / 100))));
        return { 
            taxAmount: taxVND / 1000, 
            finalTotal: numAmount 
        };
    }
};

/**
 * Tính toán thuế mô phỏng cho báo cáo lịch sử (Luôn là Inclusive).
 */
export const calculateSimulatedTax = (gross, rate = 0) => {
    const numGross = parseFloat(gross) || 0;
    const numRate = parseFloat(rate) || 0;
    
    if (numRate <= 0) return { tax: 0, net: numGross, gross: numGross };
    
    // Không làm tròn để đảm bảo tính tổng chính xác
    const net = numGross / (1 + (numRate / 100));
    const tax = numGross - net;
    
    return { tax, net, gross: numGross };
};

/**
 * Lấy số liệu thuế thực tế từ dữ liệu đơn hàng đã lưu.
 */
export const getSavedTaxData = (log) => {
    const o = log.orderData || {};
    const gross = o.price || parseFloat(log.price) || 0;
    const tax = o.taxAmount || 0;
    const net = gross - tax;
    
    return { tax, net, gross };
};
