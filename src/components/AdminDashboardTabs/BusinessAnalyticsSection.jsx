import React from 'react';
import { BarChart3, PieChart, TrendingUp, TrendingDown, LineChart } from 'lucide-react';
import { formatVND } from '../../utils/dashboardUtils';

// ===================== MODULE 1: Business Health Scorecard =====================
const StatusDot = ({ status }) => {
    const colors = { good: '#22c55e', warn: '#f59e0b', bad: '#ef4444', neutral: '#6b7280' };
    return <span style={{ background: colors[status] }} className="inline-block w-2 h-2 rounded-full" />;
};

const KPICard = ({ label, value, sub, status, hint }) => {
    const bgMap = { good: '#f0fdf4', warn: '#fffbeb', bad: '#fef2f2', neutral: '#f9fafb' };
    const textMap = { good: '#166534', warn: '#92400e', bad: '#991b1b', neutral: '#374151' };
    const accentMap = { good: '#22c55e', warn: '#f59e0b', bad: '#ef4444', neutral: '#6b7280' };
    return (
        <div className="p-5 relative group" style={{ background: bgMap[status] }}>
            <div className="absolute top-0 left-0 w-full h-1" style={{ background: accentMap[status] }} />
            <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-2">{label}</p>
            <p className="text-xl font-black leading-tight" style={{ color: textMap[status] }}>{value}</p>
            <p className="text-[9px] font-bold text-gray-400 mt-1">{sub}</p>
            {hint && (
                <div className="absolute hidden group-hover:block bottom-full left-0 bg-gray-900 text-white text-[10px] p-3 w-64 z-20 shadow-2xl pointer-events-none border border-white/10">
                    <div className="space-y-2">
                        {typeof hint === 'string' ? hint : hint}
                    </div>
                </div>
            )}
        </div>
    );
};

// ===================== MODULE 2: Menu Matrix =====================
const QUADRANT_META = {
    star:     { label: '⭐ Stars',            desc: 'Bán nhiều · Lãi cao — Bảo vệ và phát triển', color: '#16a34a', bg: '#f0fdf4' },
    cow:      { label: '💰 Hidden Gems',       desc: 'Bán ít · Lãi cao — Đẩy marketing nhẹ',        color: '#d97706', bg: '#fffbeb' },
    question: { label: '❓ Cần tối ưu',        desc: 'Bán nhiều · Lãi thấp — Xem lại giá vốn',      color: '#2563eb', bg: '#eff6ff' },
    dog:      { label: '💀 Xem xét khai tử',  desc: 'Bán ít · Lãi thấp — Cân nhắc loại bỏ',        color: '#dc2626', bg: '#fef2f2' },
};

// ===================== MAIN COMPONENT =====================
const BusinessAnalyticsSection = ({
    filteredLogs, stats, totalCOGS, menu, inventoryStatsMap,
    calculateItemCOGS, fixedCosts = {}, expenses = [], shifts = [], staff = [],
}) => {

    // ---- Recalculate OPEX for analytics (mirrors FixedCostsSection) ----
    const daysInPeriod = React.useMemo(() => {
        if (!filteredLogs || filteredLogs.length === 0) return 1;
        const uniqueDates = new Set(filteredLogs.map(l => {
            const d = new Date(l.timestamp);
            return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
        }));
        return Math.max(1, uniqueDates.size);
    }, [filteredLogs]);

    const dynSalaries = React.useMemo(() => {
        let total = 0;
        (shifts || []).forEach(s => {
            const st = (staff || []).find(p => p.id === s.staffId);
            if (st && st.salary) {
                const hours = (new Date(s.endTime) - new Date(s.startTime)) / 3600000;
                total += st.salary * hours;
            }
        });
        return total;
    }, [shifts, staff]);

    const periodExpenses = React.useMemo(() => {
        if (!filteredLogs || filteredLogs.length === 0) return [];
        const times = filteredLogs.map(l => new Date(l.timestamp).getTime());
        const minTime = Math.min(...times);
        const maxTime = Math.max(...times);
        
        // Start of min day and End of max day
        const start = new Date(minTime); start.setHours(0,0,0,0);
        const end = new Date(maxTime); end.setHours(23,59,59,999);

        return (expenses || []).filter(e => {
            const d = new Date(e.timestamp);
            if (isNaN(d.getTime())) return false;
            return d >= start && d <= end;
        });
    }, [expenses, filteredLogs]);

    // Apply Depreciation and Period Normalization
    const depreciationMonths = fixedCosts.machineDepreciationMonths || 1;
    const monthlyMachines = (fixedCosts.machines || 0) / depreciationMonths;
    const monthlyRent = (fixedCosts.rent || 0);
    const monthlySalaries = (fixedCosts.useDynamicSalaries ? dynSalaries : (fixedCosts.salaries || 0));
    
    const analyticsTotalFixedMonthly = monthlyRent + monthlyMachines + monthlySalaries;
    
    // Normalized fixed costs for the ACTUAL period shown (e.g. 1 day)
    const normalizedPeriodFixed = (analyticsTotalFixedMonthly / 30) * daysInPeriod;

    const analyticsTotalOPEX = normalizedPeriodFixed
        + ((fixedCosts.electricity || 0) / 30 * daysInPeriod) 
        + ((fixedCosts.water || 0) / 30 * daysInPeriod) 
        + ((fixedCosts.other || 0) / 30 * daysInPeriod)
        + periodExpenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);

    // ---- MODULE 1: KPI Computations ----
    const grossMarginPct = stats.sales > 0 ? ((stats.sales - totalCOGS) / stats.sales) * 100 : 0;
    const netProfit      = stats.sales - totalCOGS - analyticsTotalOPEX;
    const netMarginPct   = stats.sales > 0 ? (netProfit / stats.sales) * 100 : 0;
    const cogsRatioPct   = stats.sales > 0 ? (totalCOGS / stats.sales) * 100 : 0;
    const aov            = stats.success > 0 ? stats.sales / stats.success : 0;
    const totalAttempts  = stats.success + stats.cancelled;
    const cancelRatePct  = totalAttempts > 0 ? (stats.cancelled / totalAttempts) * 100 : 0;

    const avgServiceMins = React.useMemo(() => {
        const times = (filteredLogs || [])
            .filter(l => l.type === 'COMPLETED' && l.orderData?.timestamp && l.timestamp)
            .map(l => (new Date(l.timestamp) - new Date(l.orderData.timestamp)) / 60000)
            .filter(t => t > 0 && t < 120);
        return times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
    }, [filteredLogs]);

    const netMarginHint = (
        <div className="space-y-2">
            <p className="font-black border-b border-white/20 pb-1 uppercase tracking-tight">Bảng Kê Chi Tiết (Kỳ này)</p>
            <div className="flex justify-between">
                <span>Doanh thu (+)</span>
                <span className="font-bold text-green-400">{formatVND(stats.sales)}</span>
            </div>
            <div className="flex justify-between">
                <span>Giá vốn COGS (-)</span>
                <span className="font-bold text-red-400">-{formatVND(totalCOGS)}</span>
            </div>
            <div className="flex justify-between">
                <span>Phí cố định phân bổ (-)</span>
                <span className="font-bold text-red-400">-{formatVND(normalizedPeriodFixed)}</span>
            </div>
            <div className="flex justify-between">
                <span>Điện/Nước/Khác (-)</span>
                <span className="font-bold text-red-400">-{formatVND(((fixedCosts.electricity || 0) + (fixedCosts.water || 0) + (fixedCosts.other || 0)) / 30 * daysInPeriod)}</span>
            </div>
            <div className="flex justify-between">
                <span>Chi phí lẻ thực tế (-)</span>
                <span className="font-bold text-red-400">-{formatVND(periodExpenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0))}</span>
            </div>
            <div className="pt-1 border-t border-white/20 flex justify-between text-[11px]">
                <span className="font-black uppercase">Lợi nhuận ròng</span>
                <span className={`font-black ${netProfit >= 0 ? 'text-green-400' : 'text-red-500'}`}>{formatVND(netProfit)}</span>
            </div>
            <p className="text-[8px] text-gray-400 italic pt-1">* Phí cố định đã được chia nhỏ theo {daysInPeriod} ngày báo cáo.</p>
        </div>
    );

    const kpiCards = [
        { label: 'Biên LN Gộp',        value: `${grossMarginPct.toFixed(1)}%`,  sub: 'Mục tiêu: > 65%',  status: grossMarginPct >= 65 ? 'good' : grossMarginPct >= 45 ? 'warn' : 'bad', hint: 'Doanh thu sau khi trừ giá vốn nguyên liệu' },
        { label: 'Biên LN Ròng',        value: `${netMarginPct > 0 ? '+' : ''}${netMarginPct.toFixed(1)}%`, sub: 'Mục tiêu: > 15%', status: netMarginPct >= 15 ? 'good' : netMarginPct >= 0 ? 'warn' : 'bad', hint: netMarginHint },
        { label: 'COGS / Doanh thu',    value: `${cogsRatioPct.toFixed(1)}%`,    sub: 'Mục tiêu: < 30%',  status: cogsRatioPct <= 30 ? 'good' : cogsRatioPct <= 40 ? 'warn' : 'bad', hint: 'Giá vốn chiếm % doanh thu' },
        { label: 'Giá trị đơn TB(AOV)', value: formatVND(aov),                   sub: `Trên ${stats.success} đơn`, status: 'neutral', hint: 'Trung bình mỗi khách chi bao nhiêu tiền' },
        { label: 'TG Phục vụ TB',       value: avgServiceMins > 0 ? `${avgServiceMins.toFixed(1)} ph` : '--', sub: 'Mục tiêu: < 5ph', status: avgServiceMins > 0 ? (avgServiceMins <= 5 ? 'good' : avgServiceMins <= 10 ? 'warn' : 'bad') : 'neutral', hint: 'Giờ đặt → giờ hoàn thành đơn' },
        { label: 'Tỉ lệ hủy đơn',       value: `${cancelRatePct.toFixed(1)}%`,   sub: 'Mục tiêu: < 5%',   status: cancelRatePct <= 5 ? 'good' : cancelRatePct <= 15 ? 'warn' : 'bad', hint: 'Đơn hủy / Tổng đơn' },
    ];

    // ---- MODULE 2: Menu Matrix ----
    const menuMatrix = React.useMemo(() => {
        const sMap = new Map();
        (menu || []).forEach(item => {
            const mockOrder = { item, count: 1, size: item.sizes?.[0]?.label || null };
            const unitCost  = calculateItemCOGS(mockOrder);
            const price     = (parseFloat(item.price) || 0) + (item.sizes?.[0]?.priceAdjust || 0);
            const margin    = Math.max(0, price - unitCost);
            const marginPct = price > 0 ? (margin / price) * 100 : 0;
            sMap.set(item.id, { id: item.id, name: item.name, price, unitCost, margin, marginPct, qty: 0 });
        });
        (filteredLogs || []).forEach(l => {
            if (!['COMPLETED','DEBT_MARKED','DEBT_PAID'].includes(l.type)) return;
            (l.orderData?.cartItems || []).forEach(ci => {
                const s = sMap.get(ci.item?.id || ci.id);
                if (s) s.qty += (ci.count || 1);
            });
        });
        const all = Array.from(sMap.values()).filter(s => s.price > 0);
        if (all.length === 0) return { star: [], cow: [], question: [], dog: [] };
        const avgMarginPct = all.reduce((sum, s) => sum + s.marginPct, 0) / all.length;
        const avgQty       = all.reduce((sum, s) => sum + s.qty, 0) / all.length;
        const groups = { star: [], cow: [], question: [], dog: [] };
        all.forEach(s => {
            const hi = s.marginPct >= avgMarginPct, hv = s.qty >= avgQty;
            const q  = hi && hv ? 'star' : hi && !hv ? 'cow' : !hi && hv ? 'question' : 'dog';
            groups[q].push(s);
        });
        return groups;
    }, [filteredLogs, menu, inventoryStatsMap, calculateItemCOGS]);

    // ---- MODULE 3: Daily Revenue Chart ----
    const dailyRevenue = React.useMemo(() => {
        const map = {};
        (filteredLogs || []).forEach(l => {
            if (!['COMPLETED','DEBT_MARKED','DEBT_PAID'].includes(l.type)) return;
            const d = new Date(l.timestamp);
            const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            map[key] = (map[key] || 0) + (l.orderData?.preTaxTotal || parseFloat(l.price) || 0);
        });
        const entries = Object.entries(map).sort(([a],[b]) => a.localeCompare(b));
        const maxRev  = Math.max(1, ...entries.map(([,v]) => v));
        return entries.map(([date, revenue]) => ({ date: date.slice(5), revenue, pct: (revenue / maxRev) * 100 }));
    }, [filteredLogs]);

    // ---- MODULE 3: Hourly Heatmap ----
    const heatmap = React.useMemo(() => {
        const grid = {};
        let maxVal = 0;
        (filteredLogs || []).forEach(l => {
            if (!['COMPLETED','DEBT_MARKED'].includes(l.type)) return;
            const d = new Date(l.timestamp);
            const key = `${d.getDay()}-${d.getHours()}`;
            grid[key] = (grid[key] || 0) + 1;
            if (grid[key] > maxVal) maxVal = grid[key];
        });
        return { grid, maxVal: Math.max(1, maxVal), dayLabels: ['CN','T2','T3','T4','T5','T6','T7'] };
    }, [filteredLogs]);

    // ---- MODULE 4: Today P&L Progress ----
    const dailyOPEX = analyticsTotalOPEX / 30;
    const dailyRevenueTarget = (cogsRatioPct < 100 && dailyOPEX > 0)
        ? dailyOPEX / (1 - cogsRatioPct / 100) : 0;

    const todayStats = React.useMemo(() => {
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
        return (filteredLogs || []).filter(l => {
            const d = new Date(l.timestamp);
            const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            return ds === todayStr && ['COMPLETED','DEBT_MARKED','DEBT_PAID'].includes(l.type);
        }).reduce((acc, l) => ({
            revenue: acc.revenue + (l.orderData?.preTaxTotal || parseFloat(l.price) || 0),
            orders: acc.orders + 1,
        }), { revenue: 0, orders: 0 });
    }, [filteredLogs]);

    const todayProgress  = dailyRevenueTarget > 0 ? Math.min(100, (todayStats.revenue / dailyRevenueTarget) * 100) : 0;
    const currentHour    = new Date().getHours();
    const dayProgressPct = Math.min(100, (currentHour / 24) * 100);
    const isOnTrack      = todayProgress >= dayProgressPct * 0.8;

    // ---- MODULE 5: Top Cost Ingredients ----
    const topIngredients = React.useMemo(() => {
        const costMap = new Map();
        (filteredLogs || []).forEach(l => {
            if (!['COMPLETED','DEBT_MARKED','DEBT_PAID'].includes(l.type)) return;
            (l.orderData?.cartItems || []).forEach(ci => {
                const menuItem = (menu || []).find(m => m.id === (ci.item?.id || ci.id));
                if (!menuItem) return;
                (menuItem.recipe || []).forEach(r => {
                    const inv  = inventoryStatsMap.get(r.ingredientId);
                    if (!inv) return;
                    const cost = (inv.avgCost || 0) * r.quantity * (ci.count || 1);
                    const ex   = costMap.get(r.ingredientId) || { name: inv.name || '?', totalCost: 0, totalQty: 0, unit: inv.unit || '' };
                    ex.totalCost += cost;
                    ex.totalQty  += r.quantity * (ci.count || 1);
                    costMap.set(r.ingredientId, ex);
                });
            });
        });
        const sorted = Array.from(costMap.values()).sort((a,b) => b.totalCost - a.totalCost).slice(0, 5);
        const maxCost = Math.max(1, sorted[0]?.totalCost || 1);
        return sorted.map(s => ({ ...s, pct: (s.totalCost / maxCost) * 100, pctOfCOGS: totalCOGS > 0 ? (s.totalCost / totalCOGS) * 100 : 0 }));
    }, [filteredLogs, menu, inventoryStatsMap, totalCOGS]);

    const barColors = ['#ef4444','#f97316','#f59e0b','#84cc16','#6b7280'];

    return (
        <div className="space-y-4 mt-4">

            {/* ======== MODULE 1: Business Health Scorecard ======== */}
            <div className="bg-white border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-gray-100 flex items-center gap-3 bg-gradient-to-r from-gray-900 to-gray-800 text-white">
                    <BarChart3 size={18} className="text-amber-400" />
                    <div>
                        <h3 className="font-bold uppercase tracking-wider text-sm">Bảng Sức khỏe Kinh doanh</h3>
                        <p className="text-[10px] text-gray-400 mt-0.5">6 chỉ số KPI phản ánh tình trạng vận hành thực tế</p>
                    </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 divide-x divide-y divide-gray-50">
                    {kpiCards.map((kpi, i) => <KPICard key={i} {...kpi} />)}
                </div>
                {/* Detailed Breakdown Row */}
                <div className="bg-slate-50/50 p-4 border-t border-gray-100 overflow-x-auto">
                    <div className="flex items-center gap-2 mb-3">
                        <StatusDot status="neutral" />
                        <span className="text-[10px] font-black uppercase tracking-tight text-gray-500">Bảng kê chi tiết cấu thành lợi nhuận (Kỳ này)</span>
                    </div>
                    <table className="w-full text-[11px] border-collapse min-w-[600px]">
                        <thead>
                            <tr className="text-gray-400 uppercase text-[9px] font-black border-b border-gray-100">
                                <th className="text-left pb-2 font-black">Hạng mục</th>
                                <th className="text-right pb-2 font-black">Giá trị (+) Doanh thu</th>
                                <th className="text-right pb-2 font-black">Giá trị (-) Chi phí</th>
                                <th className="text-right pb-2 font-black">Tỉ lệ / Doanh thu</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            <tr>
                                <td className="py-2 font-bold text-gray-700">TỔNG DOANH THU (Sales)</td>
                                <td className="py-2 text-right font-black text-green-600">{formatVND(stats.sales)}</td>
                                <td className="py-2 text-right">--</td>
                                <td className="py-2 text-right font-bold">100%</td>
                            </tr>
                            <tr>
                                <td className="py-2 font-bold text-gray-700">Giá vốn nguyên liệu (COGS)</td>
                                <td className="py-2 text-right">--</td>
                                <td className="py-2 text-right font-black text-red-500">-{formatVND(totalCOGS)}</td>
                                <td className="py-2 text-right text-gray-400">{cogsRatioPct.toFixed(1)}%</td>
                            </tr>
                            <tr className="bg-gray-50/50">
                                <td className="py-2 font-black text-gray-800 uppercase text-[10px]">Lợi nhuận gộp (Gross Profit)</td>
                                <td className="py-2 text-right font-black text-brand-600">{formatVND(stats.sales - totalCOGS)}</td>
                                <td className="py-2 text-right">--</td>
                                <td className="py-2 text-right font-black text-brand-600">{grossMarginPct.toFixed(1)}%</td>
                            </tr>
                            {/* Detailed Expenses */}
                            <tr>
                                <td className="py-2 pl-4 text-gray-500">• Chi phí cố định (Mặt bằng, Máy móc, Lương)</td>
                                <td className="py-2 text-right">--</td>
                                <td className="py-2 text-right font-bold text-red-400">-{formatVND(normalizedPeriodFixed)}</td>
                                <td className="py-2 text-right text-gray-400">{(normalizedPeriodFixed / stats.sales * 100).toFixed(1)}%</td>
                            </tr>
                            <tr>
                                <td className="py-2 pl-4 text-gray-500">• Phí định mức (Điện, Nước, Internet)</td>
                                <td className="py-2 text-right">--</td>
                                <td className="py-2 text-right font-bold text-red-400">-{formatVND(((fixedCosts.electricity || 0) + (fixedCosts.water || 0) + (fixedCosts.other || 0)) / 30 * daysInPeriod)}</td>
                                <td className="py-2 text-right text-gray-400">{((((fixedCosts.electricity || 0) + (fixedCosts.water || 0) + (fixedCosts.other || 0)) / 30 * daysInPeriod) / stats.sales * 100).toFixed(1)}%</td>
                            </tr>
                            <tr>
                                <td className="py-2 pl-4 text-gray-500">• Chi phí lẻ phát sinh (Manual Expenses)</td>
                                <td className="py-2 text-right">--</td>
                                <td className="py-2 text-right font-bold text-red-400">-{formatVND(periodExpenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0))}</td>
                                <td className="py-2 text-right text-gray-400">{(periodExpenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0) / stats.sales * 100).toFixed(1)}%</td>
                            </tr>
                            <tr className="bg-gray-900 text-white">
                                <td className="py-3 px-2 font-black uppercase text-[10px] tracking-widest text-amber-400">LỢI NHUẬN RÒNG THỰC TẾ (Net Profit)</td>
                                <td className="py-3 text-right">--</td>
                                <td className={`py-3 px-2 text-right font-black text-sm ${netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatVND(netProfit)}</td>
                                <td className={`py-3 px-2 text-right font-black ${netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{netMarginPct.toFixed(1)}%</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ======== MODULE 2: Menu Performance Matrix ======== */}
            <div className="bg-white border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-gray-100 flex items-center gap-3 bg-gradient-to-r from-gray-900 to-gray-800 text-white">
                    <PieChart size={18} className="text-blue-400" />
                    <div>
                        <h3 className="font-bold uppercase tracking-wider text-sm">Ma trận Hiệu suất Menu</h3>
                        <p className="text-[10px] text-gray-400 mt-0.5">Phân loại món theo doanh số × biên lợi nhuận</p>
                    </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-gray-100">
                    {(['star','cow','question','dog']).map(q => {
                        const meta  = QUADRANT_META[q];
                        const items = menuMatrix[q] || [];
                        return (
                            <div key={q} className="p-4" style={{ background: meta.bg }}>
                                <p className="text-[11px] font-black mb-0.5" style={{ color: meta.color }}>{meta.label}</p>
                                <p className="text-[9px] text-gray-400 font-bold mb-3">{meta.desc}</p>
                                <div className="space-y-2">
                                    {items.length === 0
                                        ? <p className="text-[10px] text-gray-300 italic">Không có món</p>
                                        : items.map(item => (
                                            <div key={item.id} className="bg-white/80 p-2 border rounded-sm" style={{ borderColor: meta.color + '40' }}>
                                                <p className="text-[11px] font-black text-gray-900 truncate">{item.name}</p>
                                                <div className="flex justify-between mt-1">
                                                    <span className="text-[9px] font-bold" style={{ color: meta.color }}>Lãi {item.marginPct.toFixed(0)}%</span>
                                                    <span className="text-[9px] text-gray-400 font-bold">{item.qty} ly</span>
                                                </div>
                                            </div>
                                        ))
                                    }
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ======== MODULE 3: Time Analytics ======== */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Daily Revenue Chart */}
                <div className="bg-white border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-5 border-b border-gray-100 flex items-center gap-3 bg-gray-900 text-white">
                        <LineChart size={18} className="text-green-400" />
                        <div>
                            <h3 className="font-bold uppercase tracking-wider text-sm">Xu hướng Doanh thu</h3>
                            <p className="text-[10px] text-gray-400">Doanh thu từng ngày trong kỳ</p>
                        </div>
                    </div>
                    <div className="p-6">
                        {dailyRevenue.length === 0
                            ? <p className="text-center text-gray-400 py-10 text-sm">Chưa có dữ liệu</p>
                            : (
                                <div className="space-y-3">
                                    <div className="flex items-end gap-1 h-28">
                                        {dailyRevenue.slice(-20).map((d, i) => (
                                            <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
                                                <div className="w-full bg-gray-100 relative overflow-hidden" style={{ height: '80px' }}>
                                                    <div
                                                        className="absolute bottom-0 w-full"
                                                        style={{ height: `${d.pct}%`, background: 'linear-gradient(to top, #f97316, #fbbf24)' }}
                                                    />
                                                    <div className="absolute inset-0 flex items-end justify-center pb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <span className="text-[7px] font-black text-white bg-gray-800/80 px-1 rounded whitespace-nowrap">{formatVND(d.revenue)}</span>
                                                    </div>
                                                </div>
                                                <span className="text-[7px] text-gray-400 font-bold">{d.date}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase pt-2 border-t border-gray-50">
                                        <span>{dailyRevenue.length} ngày ghi nhận</span>
                                        <span>Đỉnh cao: {formatVND(Math.max(...dailyRevenue.map(d => d.revenue)))}</span>
                                    </div>
                                </div>
                            )
                        }
                    </div>
                </div>

                {/* Hourly Heatmap */}
                <div className="bg-white border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-5 border-b border-gray-100 flex items-center gap-3 bg-gray-900 text-white">
                        <BarChart3 size={18} className="text-purple-400" />
                        <div>
                            <h3 className="font-bold uppercase tracking-wider text-sm">Bản đồ Nhiệt Giờ Vàng</h3>
                            <p className="text-[10px] text-gray-400">Mật độ đơn hàng theo giờ × ngày trong tuần</p>
                        </div>
                    </div>
                    <div className="p-4 overflow-x-auto">
                        {(filteredLogs || []).filter(l => ['COMPLETED','DEBT_MARKED'].includes(l.type)).length === 0
                            ? <p className="text-center text-gray-400 py-10 text-sm">Chưa có dữ liệu</p>
                            : (
                                <div>
                                    <div className="flex gap-0.5 mb-1 ml-6">
                                        {Array.from({length: 18}, (_, i) => i + 6).map(h => (
                                            <div key={h} className="flex-1 text-center text-[7px] text-gray-400 font-bold">{h}h</div>
                                        ))}
                                    </div>
                                    {heatmap.dayLabels.map((day, dayIdx) => (
                                        <div key={dayIdx} className="flex gap-0.5 mb-0.5 items-center">
                                            <span className="text-[8px] font-bold text-gray-400 w-6 shrink-0">{day}</span>
                                            {Array.from({length: 18}, (_, i) => i + 6).map(hour => {
                                                const count     = heatmap.grid[`${dayIdx}-${hour}`] || 0;
                                                const intensity = count / heatmap.maxVal;
                                                return (
                                                    <div
                                                        key={hour}
                                                        className="flex-1 h-5 rounded-sm relative group cursor-default"
                                                        style={{ background: count > 0 ? `rgba(251,146,60,${0.1 + intensity * 0.9})` : '#f3f4f6' }}
                                                    >
                                                        {count > 0 && (
                                                            <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[8px] px-1.5 py-0.5 rounded hidden group-hover:block whitespace-nowrap z-10">
                                                                {count} đơn
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ))}
                                    <div className="flex items-center gap-1.5 mt-3 justify-end">
                                        <span className="text-[9px] text-gray-400 font-bold">Ít</span>
                                        {[0.1, 0.3, 0.5, 0.7, 0.95].map(o => (
                                            <div key={o} className="w-4 h-3 rounded-sm" style={{ background: `rgba(251,146,60,${o})` }} />
                                        ))}
                                        <span className="text-[9px] text-gray-400 font-bold">Nhiều</span>
                                    </div>
                                </div>
                            )
                        }
                    </div>
                </div>
            </div>

            {/* ======== MODULE 4: Quick P&L Progress ======== */}
            <div className="bg-white border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-gray-100 flex items-center gap-3 bg-gradient-to-r from-gray-900 to-gray-800 text-white">
                    <TrendingUp size={18} className="text-green-400" />
                    <div>
                        <h3 className="font-bold uppercase tracking-wider text-sm">Tiến độ Hòa vốn Hôm nay</h3>
                        <p className="text-[10px] text-gray-400">Doanh thu thực tế so với mục tiêu hòa vốn trong ngày</p>
                    </div>
                </div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                    <div className="md:col-span-2 space-y-4">
                        <div className="flex justify-between items-baseline flex-wrap gap-2">
                            <div>
                                <p className="text-[9px] font-black uppercase text-gray-400 tracking-widest">Doanh thu hôm nay</p>
                                <p className={`text-3xl font-black mt-1 ${todayStats.revenue >= dailyRevenueTarget ? 'text-green-600' : 'text-gray-900'}`}>
                                    {formatVND(todayStats.revenue)}
                                </p>
                            </div>
                            <div className="text-right">
                                <p className="text-[9px] font-black uppercase text-gray-400 tracking-widest">Mục tiêu hòa vốn/ngày</p>
                                <p className="text-xl font-black text-gray-400 mt-1">{formatVND(dailyRevenueTarget)}</p>
                            </div>
                        </div>
                        {/* Progress bar */}
                        <div className="space-y-1.5">
                            <div className="w-full h-7 bg-gray-100 overflow-hidden relative rounded-sm">
                                <div
                                    className="h-full transition-all duration-700 relative rounded-sm"
                                    style={{
                                        width: `${todayProgress}%`,
                                        background: todayProgress >= 100 ? 'linear-gradient(to right,#22c55e,#16a34a)'
                                            : todayProgress >= 70 ? 'linear-gradient(to right,#f97316,#ea580c)'
                                            : 'linear-gradient(to right,#ef4444,#dc2626)',
                                    }}
                                >
                                    {todayProgress > 10 && (
                                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-white text-[10px] font-black">
                                            {todayProgress.toFixed(0)}%
                                        </span>
                                    )}
                                </div>
                                {/* Time-of-day marker */}
                                <div
                                    className="absolute top-0 h-full w-0.5 bg-gray-500 opacity-60"
                                    style={{ left: `${dayProgressPct}%` }}
                                    title={`Hiện tại: ${currentHour}h`}
                                />
                            </div>
                            <div className="flex justify-between text-[9px] font-bold text-gray-400 uppercase">
                                <span>00:00</span>
                                <span>▲ {currentHour}:00 hiện tại</span>
                                <span>24:00</span>
                            </div>
                        </div>
                        {/* Status */}
                        <div className={`p-3 text-[11px] font-bold border-l-4 rounded-sm ${
                            todayProgress >= 100 ? 'bg-green-50 border-green-500 text-green-800'
                            : isOnTrack ? 'bg-amber-50 border-amber-500 text-amber-800'
                            : 'bg-red-50 border-red-500 text-red-800'
                        }`}>
                            {todayProgress >= 100
                                ? `🎉 Vượt mục tiêu! Đang lãi thêm ${formatVND(todayStats.revenue - dailyRevenueTarget)}`
                                : isOnTrack
                                ? `✅ Đúng hướng — Còn cần ${formatVND(dailyRevenueTarget - todayStats.revenue)} để hòa vốn hôm nay`
                                : `⚠️ Chậm so với kế hoạch — Cần đẩy mạnh trong ${24 - currentHour}h còn lại`
                            }
                        </div>
                    </div>
                    <div className="space-y-4 border-l border-gray-100 pl-6">
                        {[
                            { label: 'Đơn hôm nay', value: `${todayStats.orders} đơn`, color: 'text-gray-900' },
                            { label: 'Chi phí vận hành / ngày', value: `-${formatVND(dailyOPEX)}`, color: 'text-red-500' },
                            { label: 'Số ly cần bán (BEP/ngày)', value: aov > 0 && dailyRevenueTarget > 0 ? `${Math.ceil(dailyRevenueTarget / aov)} ly` : '--', color: 'text-amber-600' },
                        ].map(item => (
                            <div key={item.label}>
                                <p className="text-[9px] font-black uppercase text-gray-400 tracking-widest">{item.label}</p>
                                <p className={`text-xl font-black mt-0.5 ${item.color}`}>{item.value}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ======== MODULE 5: Cost Optimization ======== */}
            <div className="bg-white border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-gray-100 flex items-center gap-3 bg-gradient-to-r from-gray-900 to-gray-800 text-white">
                    <TrendingDown size={18} className="text-red-400" />
                    <div>
                        <h3 className="font-bold uppercase tracking-wider text-sm">Tối ưu Giá vốn Nguyên liệu</h3>
                        <p className="text-[10px] text-gray-400">Top 5 nguyên liệu tiêu tốn nhiều chi phí nhất trong kỳ</p>
                    </div>
                </div>
                <div className="p-6">
                    {topIngredients.length === 0
                        ? <p className="text-center text-gray-400 py-10 text-sm">Chưa có dữ liệu giá vốn</p>
                        : (
                            <div className="space-y-5">
                                {topIngredients.map((ing, i) => (
                                    <div key={i} className="space-y-1.5">
                                        <div className="flex justify-between items-center">
                                            <div className="flex items-center gap-2">
                                                <span className="w-6 h-6 text-[10px] font-black flex items-center justify-center rounded-sm text-white" style={{ background: barColors[i] }}>
                                                    {i + 1}
                                                </span>
                                                <span className="font-black text-sm text-gray-900">{ing.name}</span>
                                            </div>
                                            <div className="text-right">
                                                <span className="font-black text-red-600">{formatVND(ing.totalCost)}</span>
                                                <span className="text-[9px] text-gray-400 font-bold block">{ing.pctOfCOGS.toFixed(1)}% tổng COGS</span>
                                            </div>
                                        </div>
                                        <div className="w-full h-2.5 bg-gray-100 rounded-sm overflow-hidden">
                                            <div className="h-full rounded-sm transition-all duration-700" style={{ width: `${ing.pct}%`, background: barColors[i] }} />
                                        </div>
                                        <div className="flex justify-between text-[9px] text-gray-400 font-bold">
                                            <span>Đã dùng: {ing.totalQty.toFixed(1)} {ing.unit}</span>
                                            <span className="text-green-600">Tiết kiệm 10% → +{formatVND(ing.totalCost * 0.1)} lợi nhuận</span>
                                        </div>
                                    </div>
                                ))}
                                {topIngredients[0] && (
                                    <div className="mt-4 p-4 bg-amber-50 border border-amber-100 rounded-sm">
                                        <p className="text-[10px] font-black text-amber-800 uppercase tracking-widest mb-1">💡 Phân tích Nhạy cảm (Sensitivity)</p>
                                        <p className="text-[11px] text-amber-700 font-bold leading-relaxed">
                                            Nếu giảm 10% chi phí mua <strong>{topIngredients[0].name}</strong>, 
                                            lợi nhuận tháng dự kiến tăng thêm{' '}
                                            <strong className="text-amber-900">{formatVND(topIngredients[0].totalCost * 0.1 * 30)}</strong>.{' '}
                                            Tổng tiềm năng tiết kiệm từ Top 5:{' '}
                                            <strong className="text-green-700">{formatVND(topIngredients.reduce((s, x) => s + x.totalCost * 0.1, 0) * 30)}</strong>/tháng.
                                        </p>
                                    </div>
                                )}
                            </div>
                        )
                    }
                </div>
            </div>
        </div>
    );
};

export default BusinessAnalyticsSection;
