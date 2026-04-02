import React, { useState, useMemo } from 'react';
import { ClipboardList } from 'lucide-react';
import { formatTime, formatDate, getDateStr } from '../../../utils/timeUtils';
import { formatVND, getLogOrderId } from '../../../utils/dashboardUtils';
import { calculateSimulatedTax, getSavedTaxData } from '../../../utils/taxUtils';

const MasterLedgerSection = ({ 
    filteredLogs, 
    orders, 
    reportPeriod, 
    customStartDate, 
    customEndDate, 
    calculateItemCOGS,
    calculationMode, 
    settings, 
    setSelectedLog 
}) => {
    const [masterLedgerLimit, setMasterLedgerLimit] = useState(50);

    const memoizedMasterLedgerRows = useMemo(() => {
        const logOrderIds = new Set((filteredLogs || []).map(l => String(l.orderId || l.id)));
        
        const activeOrderEntries = (orders || []).filter(o => {
            if (o.status === 'COMPLETED' || o.status === 'CANCELLED') return false;
            if (logOrderIds.has(String(o.id))) return false;
            
            if (reportPeriod === 'today') return getDateStr(o.timestamp) === getDateStr();
            if (reportPeriod === 'week') {
                const lastWeek = new Date(); lastWeek.setDate(lastWeek.getDate() - 7);
                return new Date(o.timestamp) >= lastWeek;
            }
            if (reportPeriod === 'month') {
                const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
                return new Date(o.timestamp) >= monthStart;
            }
            if (reportPeriod === 'quarter') {
                const now = new Date();
                const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
                return new Date(o.timestamp) >= qStart;
            }
            if (reportPeriod === 'custom' && customStartDate && customEndDate) {
                const start = new Date(customStartDate); start.setHours(0,0,0,0);
                const end = new Date(customEndDate); end.setHours(23,59,59,999);
                const d = new Date(o.timestamp);
                return d >= start && d <= end;
            }
            return true;
        }).map(o => ({ type: 'ACTIVE', orderId: o.id, timestamp: o.timestamp, orderData: o }));
        
        const allEntries = [...(filteredLogs || []), ...activeOrderEntries]
            .sort((a, b) => new Date(b.orderData?.timestamp || b.timestamp).getTime() - new Date(a.orderData?.timestamp || a.timestamp).getTime());
            
        return allEntries.slice(0, masterLedgerLimit).map((log, idx) => {
            const isCancelled = log.type === 'CANCELLED';
            const isActive = log.type === 'ACTIVE';
            const o = log.orderData || {};
            
            const timeStart = o.timestamp ? formatTime(o.timestamp) : '--:--';
            const timeEnd = log.timestamp ? formatTime(log.timestamp) : '--:--';
            const source = o.orderSource || 'INSTORE';
            
            let taxValue = 0, net = 0, gross = 0;
            if (calculationMode === 'AUTO') {
                const sim = calculateSimulatedTax(o.price || parseFloat(log.price) || 0, settings?.taxRate || 0);
                taxValue = sim.tax;
                net = sim.net;
                gross = sim.gross;
            } else {
                const saved = getSavedTaxData(log);
                taxValue = saved.tax;
                net = saved.net;
                gross = saved.gross;
            }
            
            let discount = o.discount || 0;
            let fee = o.partnerFee || 0;
            net = net - discount - fee;
            
            let cogs = 0;
            if (!isCancelled) {
                (o.cartItems || []).forEach(item => {
                    cogs += calculateItemCOGS(item);
                });
            }
            
            const profit = net - cogs;
            
            let billDetail = o.cartItems?.map(c => {
                const sizeLabel = c.size ? (typeof c.size === 'string' ? c.size : (c.size.label || c.size.name)) : '';
                return `${c.item?.name}${sizeLabel ? ` (${sizeLabel})` : ''} x${c.count}`;
            }).join(', ') || log.itemName || '';
            
            const orderIdShort = getLogOrderId(log).slice(0, 4) + '...';
            
            return (
                <tr 
                    key={idx} 
                    onClick={() => setSelectedLog && setSelectedLog(log)} 
                    className={`cursor-pointer transition-colors border-l-4 border-l-transparent hover:border-l-[#007AFF] bg-white ${isCancelled ? 'bg-red-50/50' : isActive ? 'bg-amber-50/30' : 'hover:bg-brand-50/30'}`}
                >
                    <td className="px-5 py-4 font-black text-brand-500 tracking-widest text-[11px]">{orderIdShort}</td>
                    <td className="px-5 py-4 text-gray-500 font-medium whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                            <div><span className="text-[9px] text-gray-400 uppercase font-black w-6 inline-block">IN</span> {timeStart}</div>
                            <div><span className="text-[9px] text-gray-400 uppercase font-black w-6 inline-block">OUT</span> <span className="text-brand-600 font-bold">{timeEnd}</span></div>
                        </div>
                    </td>
                    <td className="px-5 py-4 text-gray-700 max-w-[250px] truncate text-xs">{billDetail || '--'}</td>
                    <td className="px-5 py-4">
                        <span className={`px-2 py-1 rounded-sm text-[9px] font-black tracking-widest ${source === 'GRAB' ? 'bg-[#00B14F]/10 text-[#00B14F]' : source === 'SHOPEE' ? 'bg-[#EE4D2D]/10 text-[#EE4D2D]' : 'bg-gray-100 text-gray-600'}`}>
                            {source}
                        </span>
                    </td>
                    <td className="px-5 py-4 text-right font-black text-gray-900">{isCancelled ? '-' : formatVND(gross)}</td>
                    <td className="px-5 py-4 text-right font-medium text-teal-600">{isCancelled ? '-' : formatVND(taxValue)}</td>
                    <td className="px-5 py-4 text-right font-medium text-amber-500">{isCancelled ? '-' : formatVND(discount + fee)}</td>
                    <td className="px-5 py-4 text-right font-black text-brand-600 bg-brand-50/20">{isCancelled ? '-' : formatVND(net)}</td>
                    <td className="px-5 py-4 text-right font-medium text-amber-700">{isCancelled ? '-' : formatVND(cogs)}</td>
                    <td className={`px-5 py-4 text-right font-black ${isCancelled ? 'text-gray-400' : profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>{isCancelled ? '-' : formatVND(profit)}</td>
                    <td className="px-5 py-4">
                        <span className={`px-2 py-1 text-[9px] uppercase font-black tracking-widest ${isCancelled ? 'bg-red-100 text-red-600' : isActive ? 'bg-amber-100 text-amber-600' : 'bg-green-100 text-green-600'}`}>
                            {log.type === 'COMPLETED' ? 'DONE' : log.type?.substring(0, 6)}
                        </span>
                    </td>
                </tr>
            );
        });
    }, [filteredLogs, orders, masterLedgerLimit, reportPeriod, customStartDate, customEndDate, calculationMode, settings, calculateItemCOGS, setSelectedLog]);

    return (
        <div className="bg-white border border-slate-100 shadow-sm overflow-hidden" style={{ borderRadius: 'var(--radius-card)', marginTop: '16px' }}>
            <div className="border-b border-slate-100 flex justify-between items-center bg-slate-50" style={{ padding: '16px 24px' }}>
                <div className="flex items-center gap-4">
                    <div className="p-2 bg-brand-100 rounded-lg">
                        <ClipboardList size={20} className="text-brand-600" />
                    </div>
                    <div>
                        <h3 className="font-black text-sm text-slate-800 uppercase tracking-widest">Sổ Hóa Đơn Chi Tiết</h3>
                        <p className="text-[10px] text-gray-400 font-bold uppercase mt-0.5">Master Ledger (Nhật ký dòng tiền)</p>
                    </div>
                </div>
                <span className="text-[9px] font-black text-brand-600 tracking-widest bg-brand-50 px-3 py-1.5 rounded-sm border border-brand-100">
                    REAL-TIME SYNC
                </span>
            </div>
            
            <div className="overflow-auto custom-scrollbar" style={{ maxHeight: '600px' }} onScroll={(e) => { 
                if (e.target.scrollHeight - e.target.scrollTop - e.target.clientHeight < 150) setMasterLedgerLimit(prev => prev + 50); 
            }}>
                <table className="w-full text-left border-collapse min-w-[1100px]">
                    <thead className="sticky top-0 bg-slate-50 z-10 shadow-sm">
                        <tr>
                            <th className="px-5 py-4 text-[10px] uppercase font-black tracking-wider text-gray-400">Mã Đơn</th>
                            <th className="px-5 py-4 text-[10px] uppercase font-black tracking-wider text-gray-400">Thời Gian</th>
                            <th className="px-5 py-4 text-[10px] uppercase font-black tracking-wider text-gray-400">Chi Tiết</th>
                            <th className="px-5 py-4 text-[10px] uppercase font-black tracking-wider text-gray-400">Nguồn</th>
                            <th className="px-5 py-4 text-[10px] uppercase font-black tracking-wider text-gray-400 text-right">Tổng (Gross)</th>
                            <th className="px-5 py-4 text-[10px] uppercase font-black tracking-wider text-gray-400 text-right">Thuế</th>
                            <th className="px-5 py-4 text-[10px] uppercase font-black tracking-wider text-gray-400 text-right">KM/Phí</th>
                            <th className="px-5 py-4 text-[10px] uppercase font-black tracking-wider text-gray-400 text-right">Thuần (Net)</th>
                            <th className="px-5 py-4 text-[10px] uppercase font-black tracking-wider text-gray-400 text-right">Giá vốn (COGS)</th>
                            <th className="px-5 py-4 text-[10px] uppercase font-black tracking-wider text-gray-400 text-right">LN Gộp</th>
                            <th className="px-5 py-4 text-[10px] uppercase font-black tracking-wider text-gray-400">TT</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {memoizedMasterLedgerRows}
                        {memoizedMasterLedgerRows.length === 0 && (
                            <tr>
                                <td colSpan="11" className="px-5 py-10 text-center text-gray-400 italic text-sm">
                                    Chưa có đơn hàng trong thời gian này.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default MasterLedgerSection;
