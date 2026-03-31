/**
 * Tiện ích tính toán thuế mô phỏng & vận hành cho Backend (Node.js).
 * Đảm bảo đồng bộ tuyệt đối với Frontend.
 * Quy tắc làm tròn: Math.floor (cắt bỏ phần thập phân, không làm tròn lên).
 */

/**
 * Tính toán thuế cho đơn hàng thực tế (Live Ordering).
 */
const calculateLiveOrderTax = (amount, settings = {}) => {
    const rate = parseFloat(settings.taxRate) || 0;
    const mode = settings.taxMode || 'NONE';
    const numAmount = parseFloat(amount) || 0;

    if (mode === 'NONE' || rate <= 0) {
        return { taxAmount: 0, finalTotal: numAmount };
    }

    if (mode === 'EXCLUSIVE') {
        const taxAmount = Math.floor(numAmount * (rate / 100));
        return { 
            taxAmount, 
            finalTotal: numAmount + taxAmount 
        };
    } else {
        const taxAmount = Math.floor(numAmount - (numAmount / (1 + (rate / 100))));
        return { 
            taxAmount, 
            finalTotal: numAmount 
        };
    }
};

/**
 * Tính toán thuế mô phỏng cho báo cáo lịch sử (Luôn là Inclusive).
 */
const calculateSimulatedTax = (gross, rate = 0) => {
    const numGross = parseFloat(gross) || 0;
    const numRate = parseFloat(rate) || 0;
    
    if (numRate <= 0) return { tax: 0, net: numGross, gross: numGross };
    
    const net = numGross / (1 + (numRate / 100));
    const tax = numGross - net;
    
    return { tax, net, gross: numGross };
};

module.exports = {
    calculateLiveOrderTax,
    calculateSimulatedTax
};
