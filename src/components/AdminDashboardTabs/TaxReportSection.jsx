import React, { useMemo } from 'react';
import { 
    PieChart, FileUp, TrendingUp, AlertTriangle, 
    CheckCircle, Calculator, Sparkles, ArrowRight, Settings, Calendar
} from 'lucide-react';
import { formatVND } from '../../utils/dashboardUtils';
import { getDateStr } from '../../utils/timeUtils';
import { calculateSimulatedTax, getSavedTaxData } from '../../utils/taxUtils';

const TaxReportSection = ({ logs = [], settings = {}, hasPermission = () => true, calculationMode, setCalculationMode }) => {
    const [taxReportPeriod, setTaxReportPeriod] = React.useState('MONTH');

    // 1. Tính toán doanh thu thực tế và Thuế dựa trên cài đặt hiện tại (Recalculate)
    const groupedTaxData = useMemo(() => {
        const data = {};
        
        logs.forEach(log => {
            const date = new Date(log.timestamp);
            let periodKey = '', displayLabel = '';
            const y = date.getFullYear(), m = date.getMonth() + 1;

            if (taxReportPeriod === 'MONTH') { 
                periodKey = `${y}-${String(m).padStart(2, '0')}`; 
                displayLabel = `Tháng ${String(m).padStart(2, '0')}/${y}`; 
            } else if (taxReportPeriod === 'QUARTER') { 
                const q = Math.ceil(m / 3); 
                periodKey = `${y}-Q${q}`; 
                displayLabel = `Quý ${q}/${y}`; 
            } else { 
                periodKey = `${y}`; 
                displayLabel = `Năm ${y}`; 
            }

            if (!data[periodKey]) data[periodKey] = { label: displayLabel, grossRevenue: 0, taxAmount: 0, netRevenue: 0, orderCount: 0, year: y };

            let taxValue = 0, netRevenue = 0, displayGross = 0;

            if (calculationMode === 'AUTO') {
                const sim = calculateSimulatedTax(log.orderData?.price || parseFloat(log.price) || 0, settings?.taxRate || 0);
                taxValue = sim.tax;
                netRevenue = sim.net;
                displayGross = sim.gross;
            } else {
                const saved = getSavedTaxData(log);
                taxValue = saved.tax;
                netRevenue = saved.net;
                displayGross = saved.gross;
            }

            data[periodKey].grossRevenue += displayGross;
            data[periodKey].taxAmount += taxValue;
            data[periodKey].netRevenue += netRevenue;
            data[periodKey].orderCount += 1;
        });
        return data;
    }, [logs, taxReportPeriod, calculationMode, settings]);

    // 2. Logic Dự báo Doanh thu (Projections)
    const projections = useMemo(() => {
        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const diffDays = Math.ceil(Math.abs(now - startOfYear) / (1000 * 60 * 60 * 24)) || 1;

        const currentYear = now.getFullYear();
        let ytdNetRevenue = 0;
        let countLogsInYear = 0;
        
        logs.forEach(log => {
            const d = new Date(log.timestamp);
            if (d.getFullYear() === currentYear) {
                const saved = getSavedTaxData(log); // Dự báo luôn dựa trên số liệu Net thực hưởng
                ytdNetRevenue += saved.net;
                countLogsInYear++;
            }
        });

        const projectYTD = (ytdNetRevenue / diffDays) * 365;

        const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        let last30DaysNetRevenue = 0;
        logs.forEach(log => {
            const d = new Date(log.timestamp);
            if (d >= thirtyDaysAgo) {
                const saved = getSavedTaxData(log);
                last30DaysNetRevenue += saved.net;
            }
        });
        const projectRecent = (last30DaysNetRevenue / 30) * 365;

        return {
            ytdNetRevenue,
            projectedYearly: projectYTD,
            projectedRecent: projectRecent,
            remainingTo3B: Math.max(0, 3000000 - ytdNetRevenue),
            isDataLimited: countLogsInYear < 30
        };
    }, [logs]);

    const exportTaxToCSV = () => {
        const headers = ['Ky Ke Toan', 'Ngay Gio', 'Ma HD', 'Nen Tang', 'Chi Tiet', 'DT Thuan (Net)', 'Thue (VAT)', 'Tong TT (Gross)'];
        const rows = logs.map(log => {
            const date = new Date(log.timestamp), y = date.getFullYear(), m = date.getMonth() + 1;
            let pKey = taxReportPeriod === 'MONTH' ? `Tháng ${m}/${y}` : taxReportPeriod === 'QUARTER' ? `Quý ${Math.ceil(m/3)}/${y}` : `Năm ${y}`;
            let taxVal = 0, netVal = 0, grossVal = 0;
            if (calculationMode === 'AUTO') {
                const sim = calculateSimulatedTax(log.orderData?.price || parseFloat(log.price) || 0, settings?.taxRate || 0);
                taxVal = sim.tax; netVal = sim.net; grossVal = sim.gross;
            } else {
                const saved = getSavedTaxData(log);
                taxVal = saved.tax; netVal = saved.net; grossVal = saved.gross;
            }
            return [pKey, date.toLocaleString(), log.orderId, log.orderData?.orderSource || 'INSTORE', (log.itemName || 'N/A').replace(/,/g, '-'), Math.round(netVal * 1000), Math.round(taxVal * 1000), Math.round(grossVal * 1000)];
        });
        const content = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob(["\uFEFF" + content], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `Audit_Thue_${getDateStr()}.csv`; link.click();
    };

    const sortedKeys = useMemo(() => Object.keys(groupedTaxData).sort().reverse(), [groupedTaxData]);

    return (
        <div className="flex flex-col gap-4 mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="bg-slate-950 text-white p-6 shadow-2xl relative overflow-hidden border border-slate-800">
                    <div className="absolute top-0 right-0 opacity-10"><TrendingUp size={120} /></div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-4 text-brand-400 font-black text-[10px] uppercase tracking-widest">
                            <Sparkles size={14} /> DỰ BÁO DOANH THU THUẦN {new Date().getFullYear()}
                        </div>
                        <h3 className="text-3xl font-black mb-1">{formatVND(projections.projectedYearly)}</h3>
                        <p className="text-[10px] text-slate-500 font-bold uppercase mb-6 flex items-center gap-2">
                            Dựa trên bình quân YTD 
                            {projections.isDataLimited && <span className="text-amber-500 bg-amber-500/10 px-1 py-0.5 border border-amber-500/20 text-[8px] flex items-center gap-1"><AlertTriangle size={8} /> Dữ liệu ít</span>}
                        </p>
                        <div className="space-y-4">
                            <div className="flex justify-between items-end">
                                <span className="text-[9px] text-slate-500 font-bold uppercase">Tiến độ 3 Tỷ (Thuần)</span>
                                <span className="text-sm font-black text-brand-400">{(projections.ytdNetRevenue / 3000000 * 100).toFixed(1)}%</span>
                            </div>
                            <div className="w-full h-2 bg-slate-900 border border-slate-800 shadow-inner">
                                <div className="h-full bg-brand-500 transition-all duration-1000 shadow-[0_0_15px_rgba(var(--brand-500-rgb),0.5)]" style={{ width: `${Math.min(100, projections.ytdNetRevenue / 3000000 * 100)}%` }} />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-2 bg-white border border-slate-100 shadow-sm p-6 flex flex-col md:flex-row gap-8">
                    <div className="flex-1 space-y-4">
                        <div className="flex items-center gap-2 text-slate-400 font-black text-[10px] uppercase tracking-widest">
                            <Calculator size={14} /> TRỢ LÝ CHIẾN LƯỢC THUẾ
                        </div>
                        {projections.ytdNetRevenue < 500000 ? (
                            <div className="p-4 bg-brand-50 border border-brand-100 space-y-2">
                                <div className="flex items-center gap-2 text-brand-600 font-black text-sm uppercase"><CheckCircle size={20} /> Ưu tiên Thuế Khoán</div>
                                <p className="text-xs text-brand-900/70 leading-relaxed font-medium italic">Bản chất doanh thu thuần dưới 500tr chưa cần áp dụng các mô hình VAT phức tạp.</p>
                            </div>
                        ) : projections.ytdNetRevenue < 3000000 ? (
                            <div className="p-4 bg-amber-50 border border-amber-100 space-y-2">
                                <div className="flex items-center gap-2 text-amber-600 font-black text-sm uppercase"><AlertTriangle size={20} /> Lộ trình VAT 8% (Trực tiếp)</div>
                                <p className="text-xs text-amber-900/70 leading-relaxed font-medium italic">Dự báo chạm ngưỡng đóng thuế cao. Nên trích lập dự phòng thuế ngay từ giá bán hiện tại.</p>
                            </div>
                        ) : (
                            <div className="p-4 bg-red-50 border border-red-100 space-y-2">
                                <div className="flex items-center gap-2 text-red-600 font-black text-sm uppercase"><AlertTriangle size={20} /> CHẠM NGƯỠNG VAT 8-10% (Khấu trừ)</div>
                                <p className="text-xs text-red-900/70 leading-relaxed font-medium italic">Bạn bắt buộc phải kê khai VAT. Hãy minh bạch phần thuế trích từ doanh thu trong báo cáo này.</p>
                            </div>
                        )}
                        <div className="pt-4 border-t border-slate-50 grid grid-cols-2 gap-4">
                            <div className="p-3 bg-slate-50 border-l-4 border-l-indigo-500">
                                <p className="text-[8px] text-slate-400 font-black uppercase">Thực đạt (Net YTD)</p>
                                <p className="text-sm font-black text-slate-800">{formatVND(projections.ytdNetRevenue)}</p>
                            </div>
                            <div className="p-3 bg-slate-50 border-l-4 border-l-emerald-500">
                                <p className="text-[8px] text-slate-400 font-black uppercase">Dự báo (Bình quân 30 ngày)</p>
                                <p className="text-sm font-black text-slate-800">{formatVND(projections.projectedRecent)}</p>
                            </div>
                        </div>
                    </div>
                    <div className="w-full md:w-64 bg-slate-50 p-4 border border-slate-100 flex flex-col justify-between rounded-none shadow-inner">
                        <div>
                            <h4 className="text-[10px] font-black uppercase text-slate-500 mb-3 tracking-widest flex items-center gap-2 font-black"><Settings size={12} /> CHẾ ĐỘ HIỂN THỊ</h4>
                            <div className="space-y-4">
                                <div className="flex flex-col gap-1.5">
                                    <div className="flex bg-white p-1 border border-slate-200 gap-1">
                                        <button onClick={() => setCalculationMode('SAVED')} className={`flex-1 py-2 text-[9px] font-black uppercase transition-all ${calculationMode === 'SAVED' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400'}`}>SỔ CÁI (REAL)</button>
                                        <button onClick={() => setCalculationMode('AUTO')} className={`flex-1 py-2 text-[9px] font-black uppercase transition-all ${calculationMode === 'AUTO' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400'}`}>MÔ PHỎNG (VAT)</button>
                                    </div>
                                </div>
                                <p className="text-[10px] text-slate-500 italic leading-tight">
                                    {calculationMode === 'AUTO' ? `Đang trích ${settings.taxRate || 0}% VAT từ doanh thu đã bán để hậu kiểm.` : 'Hiển thị đúng số thuế thực tế đã thu được.'}
                                </p>
                            </div>
                        </div>
                        {calculationMode === 'AUTO' && (
                            <div className="mt-4 p-3 bg-indigo-50 border border-indigo-100">
                                <p className="text-[8px] font-black uppercase text-indigo-600 flex items-center gap-1 mb-1"><Calendar size={10} /> Mẹo Kiểm Tra</p>
                                <p className="text-[9px] text-indigo-900/60 font-bold leading-tight uppercase">Hãy dùng bộ lọc "QUARTER" hoặc "YEAR" phía dưới để xem tổng quát.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="bg-white border border-slate-100 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4 bg-slate-50/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-100 text-red-600"><PieChart size={18} /></div>
                        <div>
                            <h3 className="font-black text-sm text-slate-800 uppercase tracking-tight">Kiểm soát Nghĩa vụ Thuế</h3>
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest italic">{calculationMode === 'SAVED' ? 'Dữ liệu lịch sử đã lưu' : 'Mô phỏng trích nộp VAT từ doanh thu'}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex gap-1 bg-white border border-slate-200 p-1">
                            {['MONTH', 'QUARTER', 'YEAR'].map(p => (
                                <button key={p} onClick={() => setTaxReportPeriod(p)} className={`px-4 py-1.5 text-[9px] font-black uppercase transition-all ${taxReportPeriod === p ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}>
                                    {p === 'MONTH' ? 'Tháng' : p === 'QUARTER' ? 'Quý' : 'Năm'}
                                </button>
                            ))}
                        </div>
                        {hasPermission('reports', 'edit') && (
                            <button onClick={exportTaxToCSV} className="bg-red-600 text-white px-5 py-2 font-black text-[10px] uppercase hover:bg-red-700 transition-all flex items-center gap-2">
                                <FileUp size={14} /> XUẤT CSV
                            </button>
                        )}
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-900 border-b border-slate-800">
                                <th className="p-4 text-[10px] uppercase font-black text-white/50 tracking-widest">Kỳ Kế Toán</th>
                                <th className="p-4 text-[10px] uppercase font-black text-white/50 text-right">SL Đơn</th>
                                <th className="p-4 text-[10px] uppercase font-black text-white/50 text-right">Tổng Thanh Toán</th>
                                <th className="p-4 text-[10px] uppercase font-black text-brand-400 text-right">Doanh Thu Thuần</th>
                                <th className="p-4 text-[10px] uppercase font-black text-red-400 text-right">Thuế Nghĩa Vụ</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 uppercase text-xs">
                            {sortedKeys.map(key => {
                                const data = groupedTaxData[key];
                                return (
                                    <tr key={key} className="hover:bg-brand-50/30 transition-colors group">
                                        <td className="p-4 font-black text-slate-800 border-l-2 border-transparent group-hover:border-brand-500">{data.label}</td>
                                        <td className="p-4 text-right font-bold text-slate-400">{data.orderCount.toLocaleString()}</td>
                                        <td className="p-4 text-right font-black text-slate-600 bg-slate-50/30 group-hover:bg-transparent">{formatVND(data.grossRevenue)}</td>
                                        <td className="p-4 text-right font-black text-brand-600">{formatVND(data.netRevenue)}</td>
                                        <td className="p-4 text-right font-black text-red-600">
                                            <div className="flex flex-col items-end">
                                                <span>{formatVND(data.taxAmount)}</span>
                                                <span className="text-[8px] opacity-40 font-bold uppercase tracking-widest">+{Math.round(data.taxAmount / data.orderCount).toLocaleString()}đ/đơn</span>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot className="bg-slate-900 font-black text-[11px] uppercase text-white shadow-2xl">
                            <tr>
                                <td colSpan="2" className="p-5 text-right text-white/40 tracking-widest">TỔNG CỘNG ({logs.length} đơn):</td>
                                <td className="p-5 text-right text-white/70">{formatVND(sortedKeys.reduce((s, k) => s + groupedTaxData[k].grossRevenue, 0))}</td>
                                <td className="p-5 text-right text-brand-400 font-black text-lg">{formatVND(sortedKeys.reduce((s, k) => s + groupedTaxData[k].netRevenue, 0))}</td>
                                <td className="p-5 text-right text-red-400 font-black text-lg">{formatVND(sortedKeys.reduce((s, k) => s + groupedTaxData[k].taxAmount, 0))}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default TaxReportSection;
