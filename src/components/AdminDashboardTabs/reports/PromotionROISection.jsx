import React, { useMemo } from 'react';
import { Gift } from 'lucide-react';
import { formatTime, formatDate } from '../../../utils/timeUtils';
import { formatVND } from '../../../utils/dashboardUtils';

const PromotionROISection = ({ filteredLogs, inventoryStatsMap, settings, setSelectedLog }) => {
    const memoizedPromotionReport = useMemo(() => {
        const completedOrders = (filteredLogs || []).filter(l => l.type === 'COMPLETED' && l.orderData && l.orderData.appliedPromoCode).slice().reverse();
        if (completedOrders.length === 0) {
            return (
                <tbody className="divide-y divide-gray-50 uppercase text-xs">
                    <tr>
                        <td colSpan="7" className="p-8 text-center text-gray-400 italic text-[11px] normal-case bg-white">
                            Chưa có dữ liệu khuyến mãi trong thời gian này.
                        </td>
                    </tr>
                </tbody>
            );
        }
        
        let totalRevenue = 0, totalDiscount = 0, totalGiftCostAgg = 0;
        
        const rows = completedOrders.map(log => {
            const pCode = log.orderData.appliedPromoCode || '';
            const revenue = parseFloat(log.price) || 0;
            let discount = parseFloat(log.orderData.discount) || 0;
            let giftCost = 0, giftRetailValue = 0;
            
            (log.orderData.cartItems || []).forEach(item => {
                const isFreeItem = item.isGift || parseFloat(item.totalPrice) === 0 || parseFloat(item.originalPrice) === 0;
                if (isFreeItem && item.item) {
                    giftRetailValue += (parseFloat(item.item.price) || 0) * item.count;
                    (item.item.recipe || []).forEach(r => {
                        const inv = inventoryStatsMap.get(r.ingredientId);
                        if (inv) giftCost += (inv.avgCost || 0) * r.quantity * item.count;
                    });
                }
            });
            
            if (pCode.toUpperCase().includes('KHÔI PHỤC') && discount === 0 && giftRetailValue > 0) discount = giftRetailValue;
            
            const oppCost = discount - giftCost;
            const ratio = revenue > 0 ? ((giftCost / revenue) * 100).toFixed(1) : 0;
            totalRevenue += revenue; 
            totalDiscount += discount; 
            totalGiftCostAgg += giftCost;
            
            return (
                <tr key={log.orderId} onClick={() => setSelectedLog(log)} className="hover:bg-brand-50/30 transition-colors cursor-pointer bg-white">
                    <td className="p-4 text-gray-500 font-medium">
                        {formatTime(log.timestamp)} 
                        <span className="text-[9px] block text-gray-400 mt-1">{formatDate(log.timestamp)}</span>
                    </td>
                    <td className="p-4 font-black text-brand-500 uppercase tracking-widest">{log.orderId.slice(0, 4)}...</td>
                    <td className="p-4 font-bold text-gray-900 bg-gray-50/50">{pCode}</td>
                    <td className="p-4 text-right font-black text-brand-600">{formatVND(revenue)}</td>
                    <td className="p-4 text-right font-bold text-amber-600">{formatVND(discount)}</td>
                    <td className="p-4 text-right font-bold text-amber-700">{formatVND(giftCost)}</td>
                    <td className="p-4 text-right">
                        <div className="font-black text-gray-900 bg-gray-100 px-2 py-1 inline-block rounded-sm">{ratio}%</div>
                        <div className="text-[9px] font-bold text-gray-400 mt-1 uppercase">Mất: {formatVND(oppCost)}</div>
                    </td>
                </tr>
            );
        });
        
        const totalOppCost = totalDiscount - totalGiftCostAgg;
        const overallRatio = totalRevenue > 0 ? ((totalGiftCostAgg / totalRevenue) * 100).toFixed(1) : 0;
        
        return (
            <>
                <tbody className="divide-y divide-gray-50 uppercase text-[11px]">{rows}</tbody>
                <tfoot className="bg-brand-50/50 font-black text-xs uppercase border-t-2 border-brand-200">
                    <tr>
                        <td colSpan="3" className="p-5 text-right text-brand-800 tracking-widest">TỔNG ({completedOrders.length} ĐƠN):</td>
                        <td className="p-5 text-right text-brand-600 text-lg">{formatVND(totalRevenue)}</td>
                        <td className="p-5 text-right text-amber-600 text-lg">{formatVND(totalDiscount)}</td>
                        <td className="p-5 text-right text-amber-700 text-lg">{formatVND(totalGiftCostAgg)}</td>
                        <td className="p-5 text-right">
                            <div className="text-gray-900 text-sm bg-white px-2 py-1 inline-block border border-gray-200 shadow-sm">{overallRatio}%</div>
                            <div className="text-[9px] text-gray-500 mt-1.5 uppercase font-bold tracking-widest">ĐÁNH ĐỔI (OPP. COST): {formatVND(totalOppCost)}</div>
                        </td>
                    </tr>
                </tfoot>
            </>
        );
    }, [filteredLogs, inventoryStatsMap, settings, setSelectedLog]);

    if (!settings?.enablePromotions) return null;

    return (
        <div className="bg-white border border-slate-100 shadow-sm overflow-hidden" style={{ borderRadius: 'var(--radius-card)', marginTop: '16px' }}>
            <div className="border-b border-slate-100 flex items-center bg-slate-50 gap-4" style={{ padding: '16px 24px' }}>
                <div className="p-2 bg-brand-100 rounded-lg">
                    <Gift size={20} className="text-brand-600" />
                </div>
                <div>
                    <h3 className="font-black text-sm text-slate-800 uppercase tracking-widest">Hiệu quả Khuyến Mãi (ROI)</h3>
                    <p className="text-[10px] text-gray-400 font-bold uppercase mt-0.5">Phân tích Chi phí Cơ hội & Vật tư</p>
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 border-b border-gray-100">
                        <tr>
                            <th className="px-4 py-3 text-[10px] uppercase font-black text-gray-400 tracking-wider">Thời gian</th>
                            <th className="px-4 py-3 text-[10px] uppercase font-black text-gray-400 tracking-wider">Mã đơn</th>
                            <th className="px-4 py-3 text-[10px] uppercase font-black text-gray-400 tracking-wider">Chương trình</th>
                            <th className="px-4 py-3 text-[10px] uppercase font-black text-gray-400 tracking-wider text-right">Doanh thu</th>
                            <th className="px-4 py-3 text-[10px] uppercase font-black text-gray-400 tracking-wider text-right">Giảm giá</th>
                            <th className="px-4 py-3 text-[10px] uppercase font-black text-gray-400 tracking-wider text-right">Giá vốn Quà</th>
                            <th className="px-4 py-3 text-[10px] uppercase font-black text-gray-400 tracking-wider text-right">Tỉ lệ ROI</th>
                        </tr>
                    </thead>
                    {memoizedPromotionReport}
                </table>
            </div>
        </div>
    );
};

export default PromotionROISection;
