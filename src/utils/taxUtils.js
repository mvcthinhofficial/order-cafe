/**
 * Tiện ích tính toán thuế mô phỏng & vận hành cho Frontend.
 * Đồ bộ logic với taxUtils.cjs để đảm bảo không lệch số.
 * Đính chính: KHÔNG sử dụng Math.round để giữ độ chính xác cho tổng doanh thu.
 */

/**
 * Tính toán thuế cho đơn hàng thực tế (Live Ordering).
 * @param {number} amount - Số tiền gốc (hoặc tổng tùy chế độ)
 * @param {object} settings - Cấu hình thuế { taxRate, taxMode }
 * @returns {object} { taxAmount, finalTotal }
 */
export const calculateLiveOrderTax = (amount, settings = {}) => {
    const rate = parseFloat(settings.taxRate) || 0;
    const mode = settings.taxMode || 'NONE';
    const numAmount = parseFloat(amount) || 0;

    if (mode === 'NONE' || rate <= 0) {
        return { taxAmount: 0, finalTotal: numAmount };
    }

    if (mode === 'EXCLUSIVE') {
        const taxAmount = numAmount * (rate / 100);
        return { 
            taxAmount, 
            finalTotal: numAmount + taxAmount 
        };
    } else {
        const taxAmount = numAmount - (numAmount / (1 + (rate / 100)));
        return { 
            taxAmount, 
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
