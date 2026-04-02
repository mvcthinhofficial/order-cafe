import React, { useState, useMemo } from 'react';
import { BarChart3 } from 'lucide-react';
import { formatDate } from '../../../utils/timeUtils';
import { formatVND } from '../../../utils/dashboardUtils';

const InventoryAuditSection = ({ 
    inventoryAudits, 
    inventoryStatsMap, 
    inventory, 
    report, 
    orders, 
    historicalStockLevels, 
    setSelectedLog 
}) => {
    const [auditReportTab, setAuditReportTab] = useState('history');
    const [auditFilterIngredient, setAuditFilterIngredient] = useState('all');
    const [auditFilterPeriod, setAuditFilterPeriod] = useState('all');
    const [auditLimit, setAuditLimit] = useState(50);

    const nameToIdMap = useMemo(() => {
        const map = new Map();
        (inventory || []).forEach(i => {
            if (i.name) map.set(i.name.toLowerCase().trim(), i.id);
        });
        return map;
    }, [inventory]);

    // Flatten logic
    const flattenedAuditsList = useMemo(() => {
        const flattened = [];
        (inventoryAudits || []).forEach(audit => {
            if (audit.type === 'PRODUCTION') {
                (audit.inputs || []).forEach((item, idx) => {
                    const qty = item.qty || 0;
                    const diff = -Math.abs(qty); 
                    
                    const lookupId = item.id || item.ingredientId || nameToIdMap.get((item.name || item.ingredientName || '').toLowerCase().trim());
                    const invStat = inventoryStatsMap.get(lookupId);
                    
                    const costVal = Math.abs((item.unitCost || invStat?.avgCost || 0) * qty);

                    flattened.push({
                        ...audit,
                        rowId: `${audit.id}-in-${idx}`,
                        displayIngredientName: item.name || item.ingredientName,
                        displayDifference: diff,
                        displayCost: costVal,
                        displayUnit: item.unit || invStat?.unit || inventory.find(i => i.id === lookupId)?.unit || '',
                        displayReason: `Chế biến ${audit.output?.name || ''}`
                    });
                });

                if (audit.output) {
                    const lookupId = audit.output.id || nameToIdMap.get((audit.output.name || '').toLowerCase().trim());
                    const invStat = inventoryStatsMap.get(lookupId);

                    flattened.push({
                        ...audit,
                        rowId: `${audit.id}-out`,
                        displayIngredientName: audit.output.name,
                        displayDifference: Math.abs(audit.output.qty || 0),
                        displayCost: -Math.abs(audit.calculatedCost || 0), 
                        displayUnit: audit.output.unit || invStat?.unit || inventory.find(i => i.id === lookupId)?.unit || '',
                        displayReason: `Thu hồi từ chế biến`
                    });
                }
            } else if (audit.type === 'ORDER' || audit.type === 'ORDER_REFUND') {
                const items = audit.changes || audit.inputs || [];
                const isRefund = audit.type === 'ORDER_REFUND';
                items.forEach((item, idx) => {
                    const qty = item.difference || item.qty || 0;
                    const diff = isRefund ? Math.abs(qty) : -Math.abs(qty);
                    
                    let costDiff = item.costDifference;
                    if (!costDiff && qty !== 0) {
                        const invStat = inventoryStatsMap.get(item.ingredientId || item.id);
                        if (invStat) costDiff = (invStat.avgCost || 0) * qty;
                    }
                    
                    const displayCostVal = isRefund ? -Math.abs(costDiff || 0) : Math.abs(costDiff || 0);

                    flattened.push({
                        ...audit,
                        rowId: `${audit.id}-${idx}`,
                        displayIngredientName: item.ingredientName || item.name,
                        displayDifference: diff,
                        displayCost: displayCostVal,
                        displayUnit: item.unit || '',
                        displayReason: isRefund ? `Hoàn đơn #${audit.orderId}` : `Trừ đơn #${audit.orderId}`
                    });
                });
            } else {
                const diff = audit.difference || 0;
                let costDiff = audit.costDifference;
                if (!costDiff && diff !== 0) {
                    const invStat = inventoryStatsMap.get(audit.ingredientId);
                    if (invStat) costDiff = (invStat.avgCost || 0) * Math.abs(diff);
                }

                const displayCostVal = diff < 0 ? Math.abs(costDiff || 0) : -Math.abs(costDiff || 0);

                flattened.push({
                    ...audit,
                    rowId: audit.id,
                    displayIngredientName: audit.ingredientName,
                    displayDifference: diff,
                    displayCost: displayCostVal,
                    displayUnit: audit.unit || '',
                    displayReason: audit.reason || 'Kiểm kho'
                });
            }
        });
        return flattened.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }, [inventoryAudits, inventoryStatsMap, inventory, nameToIdMap]);

    const memoizedDisplayAudits = useMemo(() => {
        const filtered = flattenedAuditsList.filter(a => {
            const isOrderRelated = ['PRODUCTION', 'ORDER', 'ORDER_REFUND'].includes(a.type);
            if (auditReportTab === 'history') return isOrderRelated;
            return !isOrderRelated;
        });

        if (auditFilterIngredient !== 'all') {
            return filtered.filter(a => a.ingredientId === auditFilterIngredient || a.displayIngredientName === inventory.find(i => i.id === auditFilterIngredient)?.name);
        }
        return filtered;
    }, [auditReportTab, flattenedAuditsList, auditFilterIngredient, inventory]);
    
    // Inventory Chart Logic (Historical Stock)
    const chartContent = useMemo(() => {
        if (auditReportTab !== 'history' || auditFilterIngredient === 'all') return null;
        const aggregatedMap = {}; let displayUnit = '';
        const start = auditFilterPeriod === 'today' ? new Date().setHours(0,0,0,0) : 0;
        (historicalStockLevels || []).filter(a => a.ingredientId === auditFilterIngredient).forEach(audit => {
            const dateStr = formatDate(audit.timestamp, 'yyyy-mm-dd');
            if (!aggregatedMap[dateStr]) aggregatedMap[dateStr] = { stockAfter: audit.stockAfter, sumDiff: 0 };
            aggregatedMap[dateStr].sumDiff += audit.displayDifference || 0;
            displayUnit = audit.unit || displayUnit;
        });
        const chartData = Object.keys(aggregatedMap).sort().map(d => ({ dateStr: d, stockAfter: aggregatedMap[d].stockAfter, sumDiff: aggregatedMap[d].sumDiff }));
        if (chartData.length === 0) return null;
        return (
            <div className="w-full bg-slate-50 border-b border-gray-100 flex flex-col items-center" style={{ padding: '24px' }}>
                <h4 className="text-[11px] font-black uppercase tracking-widest text-amber-700/60 mb-10 flex items-center gap-2">
                    <BarChart3 size={16} /> TỒN KHO LŨY KẾ THEO NGÀY
                </h4>
                <div className="w-full max-w-4xl h-32 flex items-end gap-2 px-10">
                    {chartData.map(d => (
                        <div key={d.dateStr} className="flex-1 bg-blue-500 relative group" style={{ height: `${Math.min(100, (d.stockAfter / 10) * 100)}%` }}>
                            <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[9px] font-bold opacity-0 group-hover:opacity-100">{d.stockAfter}{displayUnit}</div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }, [auditReportTab, auditFilterIngredient, auditFilterPeriod, historicalStockLevels]);

    return (
        <div className="bg-white border border-slate-100 shadow-sm overflow-hidden" style={{ borderRadius: 'var(--radius-card)' }}>
            <div className="border-b border-slate-100 bg-slate-50 flex gap-4" style={{ padding: '16px 24px' }}>
                <button 
                    onClick={() => setAuditReportTab('history')} 
                    className={`font-bold text-[13px] border-b-2 transition-colors ${auditReportTab === 'history' ? 'text-brand-700 border-brand-500' : 'text-slate-400 border-transparent hover:text-slate-600'}`}
                    style={{ minHeight: '36px' }}
                >
                    Lịch Sử Hao Hụt Máy Pha
                </button>
                <button 
                    onClick={() => setAuditReportTab('manual')} 
                    className={`font-bold text-[13px] border-b-2 transition-colors ${auditReportTab === 'manual' ? 'text-brand-700 border-brand-500' : 'text-slate-400 border-transparent hover:text-slate-600'}`}
                    style={{ minHeight: '36px' }}
                >
                    Lịch Sử Kiểm Kê Kho
                </button>
            </div>
            {chartContent}
            
            <div className="overflow-auto custom-scrollbar" style={{ maxHeight: '600px' }} onScroll={(e) => { 
                if (e.target.scrollHeight - e.target.scrollTop - e.target.clientHeight < 150) setAuditLimit(p => p + 50); 
            }}>
                <table className="w-full text-left">
                    <thead className="sticky top-0 bg-slate-50 z-10 shadow-sm border-b border-gray-100">
                        <tr className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">
                            <th className="px-6 py-4">Thời gian</th>
                            <th className="px-6 py-4">Nguyên liệu</th>
                            <th className="px-6 py-4">Biến động</th>
                            <th className="px-6 py-4">Thiệt hại</th>
                            <th className="px-6 py-4">Lý do</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {(memoizedDisplayAudits || []).slice(0, auditLimit).map((a, i) => (
                            <tr 
                                key={i} 
                                onClick={() => { 
                                    if (a.orderId && setSelectedLog) { 
                                        const logEntry = report?.logs?.find(l => l.orderId === a.orderId) || { 
                                            orderId: a.orderId, 
                                            timestamp: a.timestamp, 
                                            type: 'ORDER_INFO', 
                                            orderData: orders?.find(o => o.id === a.orderId) 
                                        }; 
                                        setSelectedLog(logEntry); 
                                    } 
                                }} 
                                className={`transition-colors text-[12px] ${a.orderId ? 'cursor-pointer hover:bg-amber-50/40' : 'hover:bg-slate-50/50'}`}
                            >
                                <td className="px-6 py-4 text-gray-600">{formatDate(a.timestamp)}</td>
                                <td className="px-6 py-4 font-medium text-gray-900">{a.displayIngredientName}</td>
                                <td className={`px-6 py-4 font-bold ${a.displayDifference < 0 ? 'text-red-500' : 'text-brand-500'}`}>
                                    {a.displayDifference > 0 ? '+' : ''}{a.displayDifference} <span className="text-[10px] font-normal uppercase">{a.displayUnit}</span>
                                </td>
                                <td className={`px-6 py-4 font-bold ${a.displayCost > 0 ? 'text-red-500' : 'text-brand-600'}`}>
                                    {a.displayCost < 0 ? '+' : ''}{formatVND(Math.abs(a.displayCost))}
                                </td>
                                <td className="px-6 py-4 italic text-gray-500">{a.displayReason}</td>
                            </tr>
                        ))}
                        {memoizedDisplayAudits.length === 0 && (
                            <tr>
                                <td colSpan="5" className="px-6 py-10 text-center text-gray-400 italic text-sm">
                                    Không có dữ liệu hao hụt / kiểm kê trong khoảng thời gian này.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default InventoryAuditSection;
