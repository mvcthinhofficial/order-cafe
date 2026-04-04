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
        <div className="relative group" style={{ background: bgMap[status], padding: '20px 16px 16px' }}>
            <div className="absolute top-0 left-0 w-full h-1" style={{ background: accentMap[status] }} />
            <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-2">{label}</p>
            <p className="text-xl font-black leading-tight" style={{ color: textMap[status] }}>{value}</p>
            <p className="text-[9px] font-bold text-gray-400 mt-1">{sub}</p>
            {hint && (
                <div className="absolute hidden group-hover:block z-50 bg-gray-900 text-white text-[10px] w-56 shadow-2xl pointer-events-none border border-white/10" style={{ padding: '10px 12px', bottom: 'calc(100% + 4px)', left: '0', borderRadius: 'var(--radius-badge)', whiteSpace: 'normal', lineHeight: '1.5' }}>
                    {typeof hint === 'string' ? hint : hint}
                    <div className="absolute w-2 h-2 bg-gray-900 rotate-45" style={{ bottom: '-4px', left: '20px', borderRight: '1px solid rgba(255,255,255,0.1)', borderBottom: '1px solid rgba(255,255,255,0.1)' }} />
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
    filteredLogs, stats, totalCOGS, menu, inventoryStatsMap, inventoryStats = [],
    calculateItemCOGS, fixedCosts = {}, expenses = [], shifts = [], staff = [],
    allLogs = [], // Tất cả logs (không lọc) — dùng để tính kỳ liền trước
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
        <div className="flex flex-col" style={{ gap: '8px' }}>
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

    // ---- MODULE 3.5: Peak Analytics ----
    const peakAnalytics = React.useMemo(() => {
        const hourTotal = {};
        let maxHourTotal = 0;
        (filteredLogs || []).forEach(l => {
            if (!['COMPLETED','DEBT_MARKED','DEBT_PAID'].includes(l.type)) return;
            const d = new Date(l.timestamp);
            const hour = d.getHours();
            hourTotal[hour] = (hourTotal[hour] || 0) + 1;
            if (hourTotal[hour] > maxHourTotal) {
                maxHourTotal = hourTotal[hour];
            }
        });

        let storeStartHour = parseInt((localStorage.getItem('cafe-op-start') || '06:00').split(':')[0], 10);
        let storeEndHour = parseInt((localStorage.getItem('cafe-op-end') || '22:00').split(':')[0], 10);
        if (isNaN(storeStartHour)) storeStartHour = 6;
        if (isNaN(storeEndHour)) storeEndHour = 22;

        const HOURS = Array.from(
            { length: storeEndHour - storeStartHour + 1 },
            (_, i) => storeStartHour + i
        );

        return { hourTotal, maxHourTotal, HOURS };
    }, [filteredLogs]);

    const getHeatColor = (count, maxCount) => {
        if (count === 0) return { bg: '#F1F5F9', text: '#9CA3AF' };
        const ratio = maxCount > 0 ? count / maxCount : 0;
        if (ratio < 0.3) return { bg: '#93C5FD', text: '#1E3A8A' };
        if (ratio < 0.7) return { bg: '#3B82F6', text: '#fff' };
        return { bg: '#DC2626', text: '#fff' };
    };

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
    const now            = new Date();
    const currentHour    = now.getHours();
    const currentMinute  = now.getMinutes();
    const dayProgressPct = Math.min(100, ((currentHour * 60 + currentMinute) / (24 * 60)) * 100);
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

    // ---- MODULE 6: So sánh Kỳ này vs Kỳ trước ----
    const periodComparison = React.useMemo(() => {
        const completed = ['COMPLETED', 'DEBT_MARKED', 'DEBT_PAID'];
        if (!allLogs?.length || !filteredLogs?.length) return null;
        const currTimes = filteredLogs.map(l => new Date(l.timestamp).getTime()).filter(t => !isNaN(t));
        if (currTimes.length === 0) return null;
        const currStart = Math.min(...currTimes);
        const currEnd   = Math.max(...currTimes);
        const periodLen = Math.max(currEnd - currStart, 86400000);
        const prevEnd   = currStart - 1;
        const prevStart = prevEnd - periodLen;
        const prevLogs  = allLogs.filter(l => {
            const t = new Date(l.timestamp).getTime();
            return t >= prevStart && t <= prevEnd && completed.includes(l.type);
        });
        if (prevLogs.length === 0) return null;
        const prevRevenue = prevLogs.reduce((s, l) => s + (l.orderData?.preTaxTotal || parseFloat(l.price) || 0), 0);
        const prevOrders  = prevLogs.length;
        const d = (curr, prev) => prev === 0 ? (curr > 0 ? 100 : 0) : ((curr - prev) / prev) * 100;
        return {
            currRevenue: stats.sales, prevRevenue,
            currOrders: stats.success, prevOrders,
            currCOGS: totalCOGS,
            deltaRevenue: d(stats.sales, prevRevenue),
            deltaOrders:  d(stats.success, prevOrders),
        };
    }, [filteredLogs, allLogs, stats, totalCOGS]);

    // ---- MODULE 7: Hiệu suất Nhân viên theo Ca ----
    const staffPerformance = React.useMemo(() => {
        if (!shifts?.length || !staff?.length || !filteredLogs?.length) return [];
        const currTimes = filteredLogs.map(l => new Date(l.timestamp).getTime()).filter(t => !isNaN(t));
        if (currTimes.length === 0) return [];
        const rangeStart = Math.min(...currTimes);
        const rangeEnd   = Math.max(...currTimes);
        const perfMap = {};
        (shifts || []).forEach(shift => {
            const start = new Date(shift.startTime).getTime();
            const end   = new Date(shift.endTime).getTime();
            if (isNaN(start) || isNaN(end) || end < rangeStart || start > rangeEnd) return;
            const shiftLogs = filteredLogs.filter(l => {
                if (!['COMPLETED','DEBT_MARKED','DEBT_PAID'].includes(l.type)) return false;
                const t = new Date(l.timestamp).getTime();
                return t >= start && t <= end;
            });
            const revenue = shiftLogs.reduce((s, l) => s + (l.orderData?.preTaxTotal || parseFloat(l.price) || 0), 0);
            const hours   = Math.max(0.25, (end - start) / 3600000);
            const member  = staff.find(s => s.id === shift.staffId);
            if (!member) return;
            if (!perfMap[shift.staffId]) {
                perfMap[shift.staffId] = { name: member.name, role: member.role || 'NV', revenue: 0, orders: 0, hours: 0 };
            }
            perfMap[shift.staffId].revenue += revenue;
            perfMap[shift.staffId].orders  += shiftLogs.length;
            perfMap[shift.staffId].hours   += hours;
        });
        return Object.values(perfMap)
            .map(p => ({ ...p, revenuePerHour: p.hours > 0 ? p.revenue / p.hours : 0 }))
            .sort((a, b) => b.revenue - a.revenue);
    }, [filteredLogs, shifts, staff]);

    // ---- MODULE 8: Tồn kho chậm luân chuyển ----
    const slowInventory = React.useMemo(() => {
        if (!inventoryStats?.length) return { deadStock: [], slowSellers: [], lowStock: [] };

        // Tính usage trong kỳ lọc từ filteredLogs (thực tế bán ra trong kỳ)
        const usageInPeriod = new Map(); // ingredientId -> qty used
        (filteredLogs || []).forEach(l => {
            if (!['COMPLETED','DEBT_MARKED','DEBT_PAID'].includes(l.type)) return;
            (l.orderData?.cartItems || []).forEach(ci => {
                const menuItem = (menu || []).find(m => m.id === (ci.item?.id || ci.id));
                if (!menuItem) return;
                (menuItem.recipe || []).forEach(r => {
                    const prev = usageInPeriod.get(r.ingredientId) || 0;
                    usageInPeriod.set(r.ingredientId, prev + r.quantity * (ci.count || 1));
                });
                if (ci.size) {
                    const sl = typeof ci.size === 'string' ? ci.size : (ci.size.label || '');
                    const mSize = menuItem.sizes?.find(s => s.label === sl);
                    (mSize?.recipe || []).forEach(r => {
                        const prev = usageInPeriod.get(r.ingredientId) || 0;
                        usageInPeriod.set(r.ingredientId, prev + r.quantity * (ci.count || 1));
                    });
                }
                (ci.addons || []).forEach(a => {
                    const al = typeof a === 'string' ? a : a.label;
                    const mAddon = menuItem.addons?.find(x => x.label === al);
                    (mAddon?.recipe || []).forEach(r => {
                        const prev = usageInPeriod.get(r.ingredientId) || 0;
                        usageInPeriod.set(r.ingredientId, prev + r.quantity * (ci.count || 1));
                    });
                });
            });
        });

        const result = inventoryStats
            .filter(s => s.stock > 0 && (s.avgCost || 0) > 0)
            .map(inv => {
                const usedInPeriod = usageInPeriod.get(inv.id) || 0;
                const stockValue = inv.stock * (inv.avgCost || 0);
                // Ngày dự trữ tồn kho: tồn hiện tại / số dùng mỗi ngày
                const dailyUsage = usedInPeriod / Math.max(1, daysInPeriod);
                const daysOfStock = dailyUsage > 0 ? inv.stock / dailyUsage : Infinity;
                const turnoverScore = dailyUsage > 0 ? (inv.stock / dailyUsage) : 999; // số ngày để tiêu hết tồn kho
                return { ...inv, usedInPeriod, stockValue, dailyUsage, daysOfStock, turnoverScore };
            });

        // Phân loại:
        // Dead Stock: Tồn > 0, không dùng gì trong kỳ (usage = 0)
        // Thêm menu items liên quan
        const getMenuItemsUsingIngredient = (ingredientId) => {
            return (menu || []).filter(m => {
                if (m.isDeleted) return false;
                const inBase = (m.recipe || []).some(r => r.ingredientId === ingredientId);
                const inSizes = (m.sizes || []).some(s => (s.recipe || []).some(r => r.ingredientId === ingredientId));
                const inAddons = (m.addons || []).some(a => (a.recipe || []).some(r => r.ingredientId === ingredientId));
                return inBase || inSizes || inAddons;
            }).map(m => m.name);
        };

        const deadStock = result
            .filter(s => s.usedInPeriod === 0)
            .sort((a, b) => b.stockValue - a.stockValue)
            .slice(0, 10)
            .map(s => ({ ...s, relatedMenuItems: getMenuItemsUsingIngredient(s.id) }));

        // Chậm luân chuyển: dùng ít, tồn nhiều (daysOfStock > 60)
        const slowSellers = result
            .filter(s => s.usedInPeriod > 0 && s.daysOfStock > 60)
            .sort((a, b) => b.daysOfStock - a.daysOfStock)
            .slice(0, 8)
            .map(s => ({ ...s, relatedMenuItems: getMenuItemsUsingIngredient(s.id) }));

        // Cần nhập gấp: daysOfStock < 5 nhưng được dùng nhiều
        const lowStock = result
            .filter(s => s.dailyUsage > 0 && s.daysOfStock <= 5)
            .sort((a, b) => a.daysOfStock - b.daysOfStock)
            .slice(0, 8);

        // Tổng hợp các Món menu có nguyên liệu tồn chậm (dead + slow)
        const menuItemsToUpsale = new Map();
        [...deadStock, ...slowSellers].forEach(inv => {
            (inv.relatedMenuItems || []).forEach(name => {
                if (!menuItemsToUpsale.has(name)) menuItemsToUpsale.set(name, []);
                menuItemsToUpsale.get(name).push(inv.name);
            });
        });

        return { deadStock, slowSellers, lowStock, menuItemsToUpsale };
    }, [filteredLogs, inventoryStats, menu, daysInPeriod]);


    return (
        <div className="flex flex-col mt-4" style={{ gap: '16px' }}>

            {/* ======== MODULE 1: Business Health Scorecard ======== */}
            <div className="bg-white border border-gray-100 shadow-sm" style={{ overflow: 'visible', borderRadius: 'var(--radius-card)' }}>
                <div className="border-b border-gray-100 flex items-center gap-3 bg-gradient-to-r from-gray-900 to-gray-800 text-white" style={{ padding: '20px', borderRadius: 'var(--radius-card) var(--radius-card) 0 0' }}>
                    <BarChart3 size={18} className="text-amber-400" />
                    <div>
                        <h3 className="font-black uppercase tracking-wider text-xs sm:text-sm">Bảng Sức khỏe Kinh doanh</h3>
                        <p className="text-[10px] text-gray-400 mt-0.5">6 chỉ số KPI phản ánh tình trạng vận hành thực tế</p>
                    </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 divide-x divide-y divide-gray-100" style={{ overflow: 'visible', position: 'relative', zIndex: 10 }}>
                    {kpiCards.map((kpi, i) => <KPICard key={i} {...kpi} />)}
                </div>
                {/* Detailed Breakdown Row */}
                <div className="bg-slate-50/50 border-t border-gray-100 overflow-x-auto" style={{ padding: '16px' }}>
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
            <div className="bg-white border border-gray-100 shadow-sm overflow-hidden" style={{ borderRadius: 'var(--radius-card)' }}>
                <div className="border-b border-gray-100 flex items-center gap-3 bg-gradient-to-r from-gray-900 to-gray-800 text-white" style={{ padding: '20px', borderRadius: 'var(--radius-card) var(--radius-card) 0 0' }}>
                    <PieChart size={18} className="text-blue-400" />
                    <div>
                        <h3 className="font-black uppercase tracking-wider text-xs sm:text-sm">Ma trận Hiệu suất Menu</h3>
                        <p className="text-[10px] text-gray-400 mt-0.5">Phân loại món theo doanh số × biên lợi nhuận</p>
                    </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
                    {(['star','cow','question','dog']).map(q => {
                        const meta  = QUADRANT_META[q];
                        const items = menuMatrix[q] || [];
                        return (
                            <div key={q} style={{ padding: '16px', background: meta.bg }}>
                                <p className="text-[11px] font-black mb-0.5" style={{ color: meta.color }}>{meta.label}</p>
                                <p className="text-[9px] text-gray-400 font-bold mb-3">{meta.desc}</p>
                                <div className="flex flex-col" style={{ gap: '8px' }}>
                                    {items.length === 0
                                        ? <p className="text-[10px] text-gray-300 italic">Không có món</p>
                                        : items.map(item => (
                                            <div key={item.id} className="bg-white/80 border flex items-center gap-2" style={{ padding: '10px 12px', borderColor: meta.color + '40', borderRadius: 'var(--radius-badge)' }}>
                                                <p className="text-[11px] font-black text-gray-900 truncate flex-1 text-left" title={item.name}>{item.name}</p>
                                                <span className="text-[10px] font-black shrink-0 text-center w-14" style={{ color: meta.color }}>Lãi {item.marginPct.toFixed(0)}%</span>
                                                <span className="text-[10px] text-gray-500 font-black shrink-0 text-right w-8">{item.qty} ly</span>
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
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {/* Daily Revenue Chart */}
                <div className="bg-white border border-gray-100 shadow-sm overflow-hidden flex flex-col" style={{ borderRadius: 'var(--radius-card)' }}>
                    <div className="border-b border-gray-100 flex items-center gap-3 bg-gray-900 text-white" style={{ padding: '20px', borderRadius: 'var(--radius-card) var(--radius-card) 0 0' }}>
                        <LineChart size={18} className="text-green-400" />
                        <div>
                            <h3 className="font-black uppercase tracking-wider text-xs sm:text-sm">Xu hướng Doanh thu</h3>
                            <p className="text-[10px] text-gray-400">Doanh thu từng ngày trong kỳ</p>
                        </div>
                    </div>
                    <div className="flex-1 flex flex-col justify-center" style={{ padding: '24px' }}>
                        {dailyRevenue.length === 0
                            ? <p className="text-center text-gray-400 py-10 text-sm">Chưa có dữ liệu</p>
                            : (
                                <div className="flex flex-col flex-1" style={{ gap: '12px' }}>
                                    <div className="flex items-end gap-1 flex-1 min-h-[160px]">
                                        {dailyRevenue.slice(-20).map((d, i) => (
                                            <div key={i} className="flex flex-col items-center group relative h-full" style={{ flex: '1 1 0', minWidth: '24px', maxWidth: '48px', gap: '4px' }}>
                                                <div className="w-full bg-gray-100 relative overflow-hidden flex-1" style={{ borderRadius: 'var(--radius-badge)' }}>
                                                    <div
                                                        className="absolute bottom-0 w-full rounded-t-sm"
                                                        style={{ height: `${d.pct}%`, background: 'linear-gradient(to top, #f97316, #fbbf24)' }}
                                                    />
                                                </div>
                                                {/* Premium Floating Tooltip */}
                                                <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all duration-200 z-50 pointer-events-none translate-y-2 group-hover:translate-y-0">
                                                    <div className="bg-gray-900 text-white text-[10px] font-black px-2.5 py-1 whitespace-nowrap shadow-xl" style={{ borderRadius: 'var(--radius-badge)' }}>
                                                        {formatVND(d.revenue)}
                                                    </div>
                                                    <div className="w-2 h-2 bg-gray-900 absolute left-1/2 -translate-x-1/2 -bottom-1 rotate-45"></div>
                                                </div>
                                                <span className="text-[7px] text-gray-400 font-bold">{d.date}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase border-t border-gray-50" style={{ paddingTop: '8px' }}>
                                        <span>{dailyRevenue.length} ngày ghi nhận</span>
                                        <span>Đỉnh cao: {formatVND(Math.max(...dailyRevenue.map(d => d.revenue)))}</span>
                                    </div>
                                </div>
                            )
                        }
                    </div>
                </div>

                {/* Hourly Heatmap */}
                <div className="bg-white border border-gray-100 shadow-sm overflow-hidden flex flex-col" style={{ borderRadius: 'var(--radius-card)' }}>
                    <div className="border-b border-gray-100 flex items-center gap-3 bg-gray-900 text-white" style={{ padding: '20px', borderRadius: 'var(--radius-card) var(--radius-card) 0 0' }}>
                        <BarChart3 size={18} className="text-purple-400" />
                        <div>
                            <h3 className="font-black uppercase tracking-wider text-xs sm:text-sm">Bản đồ Nhiệt Giờ Vàng</h3>
                            <p className="text-[10px] text-gray-400">Mật độ đơn hàng theo giờ × ngày trong tuần</p>
                        </div>
                    </div>
                    <div className="overflow-x-auto flex-1 flex flex-col justify-center" style={{ padding: '16px' }}>
                        {(filteredLogs || []).filter(l => ['COMPLETED','DEBT_MARKED'].includes(l.type)).length === 0
                            ? <p className="text-center text-gray-400 py-10 text-sm">Chưa có dữ liệu</p>
                            : (
                                <div className="flex flex-col flex-1 h-full w-full min-h-[220px]">
                                    <div className="flex gap-0.5 mb-2 ml-6 shrink-0">
                                        {Array.from({length: 18}, (_, i) => i + 6).map(h => (
                                            <div key={h} className="flex-1 text-center text-[7px] text-gray-400 font-bold">{h}h</div>
                                        ))}
                                    </div>
                                    {heatmap.dayLabels.map((day, dayIdx) => (
                                        <div key={dayIdx} className="flex gap-0.5 mb-1 items-stretch flex-1">
                                            <span className="text-[8px] font-bold text-gray-400 w-6 shrink-0 flex items-center">{day}</span>
                                            {Array.from({length: 18}, (_, i) => i + 6).map(hour => {
                                                const count     = heatmap.grid[`${dayIdx}-${hour}`] || 0;
                                                const intensity = count / heatmap.maxVal;
                                                return (
                                                    <div
                                                        key={hour}
                                                        className="flex-1 h-full min-h-[20px] relative group cursor-default"
                                                        style={{ borderRadius: 'var(--radius-badge)', background: count > 0 ? `rgba(251,146,60,${0.1 + intensity * 0.9})` : '#f3f4f6' }}
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
                                            <div key={o} className="w-4 h-3" style={{ background: `rgba(251,146,60,${o})` }} />
                                        ))}
                                        <span className="text-[9px] text-gray-400 font-bold">Nhiều</span>
                                    </div>
                                </div>
                            )
                        }
                    </div>
                </div>

                {/* Store Heatmap Peak Hours */}
                <div className="bg-white border border-gray-100 shadow-sm overflow-hidden flex flex-col" style={{ borderRadius: 'var(--radius-card)' }}>
                    <div className="border-b border-gray-100 flex items-center gap-3 bg-gray-900 text-white" style={{ padding: '20px', borderRadius: 'var(--radius-card) var(--radius-card) 0 0' }}>
                        <BarChart3 size={18} className="text-red-400" />
                        <div>
                            <h3 className="font-black uppercase tracking-wider text-xs sm:text-sm">Giờ Cao Điểm Toàn Quán</h3>
                            <p className="text-[10px] text-gray-400">Thống kê theo ca trong kỳ được chọn</p>
                        </div>
                    </div>
                    <div className="overflow-y-auto" style={{ padding: '16px', maxHeight: '400px' }}>
                        {Object.keys(peakAnalytics.hourTotal).length === 0 ? (
                            <p className="text-center text-gray-400 py-10 text-sm">Chưa có dữ liệu trong kỳ</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {peakAnalytics.HOURS.map((hour) => {
                                    const count = peakAnalytics.hourTotal[hour] || 0;
                                    const c = getHeatColor(count, peakAnalytics.maxHourTotal);
                                    const barPct = peakAnalytics.maxHourTotal > 0 ? Math.max(4, (count / peakAnalytics.maxHourTotal) * 100) : 4;
                                    return (
                                        <div key={hour} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <span style={{
                                                fontSize: 11, fontWeight: 800, color: '#6B7280',
                                                width: 28, textAlign: 'right', flexShrink: 0,
                                            }}>
                                                {hour}h
                                            </span>
                                            <div style={{
                                                flex: 1, height: 22, background: '#F1F5F9',
                                                borderRadius: 6, overflow: 'hidden', position: 'relative',
                                            }}>
                                                <div style={{
                                                    width: `${barPct}%`,
                                                    height: '100%',
                                                    background: c.bg,
                                                    borderRadius: 6,
                                                    transition: 'width 0.5s ease',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                                                    paddingRight: 6,
                                                }}>
                                                    {count > 0 && (
                                                        <span style={{
                                                            fontSize: 10, fontWeight: 900,
                                                            color: count / peakAnalytics.maxHourTotal > 0.4 ? c.text : '#374151',
                                                            whiteSpace: 'nowrap',
                                                        }}>
                                                            {count} đơn
                                                        </span>
                                                    )}
                                                </div>
                                                {count === 0 && (
                                                    <span style={{
                                                        position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                                                        fontSize: 10, color: '#CBD5E1', fontWeight: 600,
                                                    }}>
                                                        Không có
                                                    </span>
                                                )}
                                            </div>
                                            {/* Chỉ báo "giờ vàng" */}
                                            {count > 0 && count === peakAnalytics.maxHourTotal && (
                                                <span style={{
                                                    fontSize: 9, fontWeight: 900, color: '#DC2626',
                                                    background: '#FEE2E2', borderRadius: 99,
                                                    padding: '1px 6px', flexShrink: 0,
                                                }}>
                                                    GIỜ VÀNG
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    {/* Gợi ý phân ca */}
                    {Object.keys(peakAnalytics.hourTotal).length > 0 && (() => {
                        const peakHour = Object.entries(peakAnalytics.hourTotal).sort((a, b) => b[1] - a[1])[0];
                        if (!peakHour) return null;
                        const [h, cnt] = peakHour;
                        return (
                            <div className="mt-auto border-t border-amber-200" style={{
                                background: '#FFFBEB',
                                padding: '12px 16px',
                                display: 'flex', alignItems: 'flex-start', gap: 10,
                            }}>
                                <span style={{ fontSize: 18, flexShrink: 0, lineHeight: 1 }}>💡</span>
                                <div>
                                    <p style={{ margin: 0, fontSize: 11, fontWeight: 900, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Gợi ý phân ca
                                    </p>
                                    <p style={{ margin: '4px 0 0', fontSize: 11, color: '#B45309', fontWeight: 600 }}>
                                        Nên tăng cường nhân viên lúc <strong>{h}:00 – {parseInt(h, 10) + 1}:00</strong>. Khung giờ này có lượng đơn cao nhất ({cnt} đơn).
                                    </p>
                                </div>
                            </div>
                        );
                    })()}
                </div>
            </div>

            {/* ======== MODULE 4: Quick P&L Progress ======== */}
            <div className="bg-white border border-gray-100 shadow-sm overflow-hidden" style={{ borderRadius: 'var(--radius-card)' }}>
                <div className="border-b border-gray-100 flex items-center gap-3 bg-gradient-to-r from-gray-900 to-gray-800 text-white" style={{ padding: '20px', borderRadius: 'var(--radius-card) var(--radius-card) 0 0' }}>
                    <TrendingUp size={18} className="text-green-400" />
                    <div>
                        <h3 className="font-black uppercase tracking-wider text-xs sm:text-sm">Tiến độ Hòa vốn Hôm nay</h3>
                        <p className="text-[10px] text-gray-400">Doanh thu thực tế so với mục tiêu hòa vốn trong ngày</p>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start" style={{ padding: '24px' }}>
                    <div className="md:col-span-2 flex flex-col" style={{ gap: '16px' }}>
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
                        <div className="flex flex-col" style={{ gap: '6px' }}>
                            <div className="w-full h-7 bg-gray-100 overflow-hidden relative" style={{ borderRadius: 'var(--radius-badge)' }}>
                                <div
                                    className="h-full transition-all duration-700 relative"
                                    style={{
                                        borderRadius: 'var(--radius-badge)',
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
                            {/* Labels: 00:00 — current time (absolute theo dayProgressPct) — 24:00 */}
                            <div className="relative w-full text-[9px] font-bold text-gray-400 uppercase" style={{ height: '14px' }}>
                                <span className="absolute left-0">00:00</span>
                                <span
                                    className="absolute -translate-x-1/2 whitespace-nowrap"
                                    style={{ left: `${dayProgressPct}%` }}
                                >
                                    ▲ {String(currentHour).padStart(2,'0')}:{String(currentMinute).padStart(2,'0')} hiện tại
                                </span>
                                <span className="absolute right-0">24:00</span>
                            </div>
                        </div>
                        {/* Status */}
                        <div className={`text-[11px] font-bold border-l-4 ${
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
                    <div className="border-l border-gray-100 flex flex-col" style={{ paddingLeft: '24px', gap: '16px' }}>
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
            <div className="bg-white border border-gray-100 shadow-sm overflow-hidden" style={{ borderRadius: 'var(--radius-card)' }}>
                <div className="border-b border-gray-100 flex items-center gap-3 bg-gradient-to-r from-gray-900 to-gray-800 text-white" style={{ padding: '20px', borderRadius: 'var(--radius-card) var(--radius-card) 0 0' }}>
                    <TrendingDown size={18} className="text-red-400" />
                    <div>
                        <h3 className="font-black uppercase tracking-wider text-xs sm:text-sm">Tối ưu Giá vốn Nguyên liệu</h3>
                        <p className="text-[10px] text-gray-400">Top 5 nguyên liệu tiêu tốn nhiều chi phí nhất trong kỳ</p>
                    </div>
                </div>
                <div style={{ padding: '24px' }}>
                    {topIngredients.length === 0
                        ? <p className="text-center text-gray-400 py-10 text-sm">Chưa có dữ liệu giá vốn</p>
                        : (
                            <div className="flex flex-col" style={{ gap: '20px' }}>
                                {topIngredients.map((ing, i) => (
                                    <div key={i} className="flex flex-col" style={{ gap: '6px' }}>
                                        <div className="flex justify-between items-center">
                                            <div className="flex items-center gap-2">
                                                <span className="w-6 h-6 text-[10px] font-black flex items-center justify-center text-white" style={{ background: barColors[i], borderRadius: 'var(--radius-badge)' }}>
                                                    {i + 1}
                                                </span>
                                                <span className="font-black text-sm text-gray-900">{ing.name}</span>
                                            </div>
                                            <div className="text-right">
                                                <span className="font-black text-red-600">{formatVND(ing.totalCost)}</span>
                                                <span className="text-[9px] text-gray-400 font-bold block">{ing.pctOfCOGS.toFixed(1)}% tổng COGS</span>
                                            </div>
                                        </div>
                                        <div className="w-full h-2.5 bg-gray-100 overflow-hidden" style={{ borderRadius: 'var(--radius-badge)' }}>
                                            <div className="h-full transition-all duration-700" style={{ borderRadius: 'var(--radius-badge)', width: `${ing.pct}%`, background: barColors[i] }} />
                                        </div>
                                        <div className="flex justify-between text-[9px] text-gray-400 font-bold">
                                            <span>Đã dùng: {ing.totalQty.toFixed(1)} {ing.unit}</span>
                                            <span className="text-green-600">Tiết kiệm 10% → +{formatVND(ing.totalCost * 0.1)} lợi nhuận</span>
                                        </div>
                                    </div>
                                ))}
                                {topIngredients[0] && (
                                    <div className="mt-4 bg-amber-50 border border-amber-100" style={{ padding: '16px', borderRadius: 'var(--radius-badge)' }}>
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
            {/* ======== MODULE 6: So sánh Kỳ ======== */}
            {periodComparison && (
                <div className="bg-white border border-gray-100 shadow-sm overflow-hidden" style={{ borderRadius: 'var(--radius-card)' }}>
                    <div className="border-b border-gray-100 flex items-center gap-3 bg-gradient-to-r from-indigo-900 to-indigo-800 text-white" style={{ padding: '20px' }}>
                        <TrendingUp size={18} className="text-cyan-400" />
                        <div>
                            <h3 className="font-black uppercase tracking-wider text-xs sm:text-sm">So sánh Kỳ này vs Kỳ trước</h3>
                            <p className="text-[10px] text-gray-400 mt-0.5">Delta hiệu suất so với kỳ liền trước cùng độ dài</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y divide-gray-100">
                        {[
                            { label: 'Doanh thu', curr: periodComparison.currRevenue, prev: periodComparison.prevRevenue, delta: periodComparison.deltaRevenue, fmt: v => formatVND(v) },
                            { label: 'Số đơn', curr: periodComparison.currOrders, prev: periodComparison.prevOrders, delta: periodComparison.deltaOrders, fmt: v => `${v} đơn` },
                            { label: 'AOV trung bình', curr: periodComparison.currOrders > 0 ? periodComparison.currRevenue / periodComparison.currOrders : 0, prev: periodComparison.prevOrders > 0 ? periodComparison.prevRevenue / periodComparison.prevOrders : 0, delta: (() => { const c = periodComparison.currOrders > 0 ? periodComparison.currRevenue / periodComparison.currOrders : 0; const p = periodComparison.prevOrders > 0 ? periodComparison.prevRevenue / periodComparison.prevOrders : 0; return p === 0 ? 0 : ((c - p) / p) * 100; })(), fmt: v => formatVND(v) },
                            { label: 'COGS', curr: periodComparison.currCOGS, prev: 0, delta: null, fmt: v => formatVND(v) },
                        ].map(({ label, curr, prev, delta, fmt }) => (
                            <div key={label} style={{ padding: '20px 16px' }}>
                                <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-2">{label}</p>
                                <p className="text-xl font-black text-gray-900 leading-tight">{fmt(curr)}</p>
                                {prev > 0 && <p className="text-[10px] text-gray-400 mt-1">Kỳ trước: {fmt(prev)}</p>}
                                {delta !== null && (
                                    <div className={`inline-flex items-center gap-1 mt-2 px-2 py-0.5 text-[10px] font-black rounded-full ${delta >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                        {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ======== MODULE 7: Hiệu suất Nhân viên ======== */}
            {staffPerformance.length > 0 && (
                <div className="bg-white border border-gray-100 shadow-sm overflow-hidden" style={{ borderRadius: 'var(--radius-card)' }}>
                    <div className="border-b border-gray-100 flex items-center gap-3 bg-gradient-to-r from-violet-900 to-violet-800 text-white" style={{ padding: '20px' }}>
                        <BarChart3 size={18} className="text-violet-300" />
                        <div>
                            <h3 className="font-black uppercase tracking-wider text-xs sm:text-sm">Hiệu suất Nhân viên theo Kỳ</h3>
                            <p className="text-[10px] text-gray-400 mt-0.5">Xếp hạng nhân viên theo doanh thu tạo ra trong ca làm việc</p>
                        </div>
                    </div>
                    <div style={{ padding: '0' }}>
                        <table className="w-full text-[11px] border-collapse">
                            <thead>
                                <tr className="text-gray-400 uppercase text-[9px] font-black bg-gray-50 border-b border-gray-100">
                                    <th className="text-left px-4 py-3 font-black">#</th>
                                    <th className="text-left px-4 py-3 font-black">Nhân viên</th>
                                    <th className="text-right px-4 py-3 font-black">Doanh thu</th>
                                    <th className="text-right px-4 py-3 font-black">Số đơn</th>
                                    <th className="text-right px-4 py-3 font-black">Giờ làm</th>
                                    <th className="text-right px-4 py-3 font-black">DT / giờ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {staffPerformance.map((p, i) => {
                                    const maxRev = staffPerformance[0]?.revenue || 1;
                                    const barW = Math.max(4, (p.revenue / maxRev) * 100);
                                    return (
                                        <tr key={p.name} className="hover:bg-violet-50/40 transition-colors">
                                            <td className="px-4 py-3">
                                                <span className="w-6 h-6 text-[10px] font-black flex items-center justify-center text-white rounded" style={{ background: ['#7c3aed','#6d28d9','#5b21b6','#4c1d95','#6b7280'][i] || '#6b7280' }}>{i + 1}</span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <p className="font-black text-gray-900">{p.name}</p>
                                                <p className="text-[9px] text-gray-400 uppercase font-bold">{p.role}</p>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <p className="font-black text-violet-700">{formatVND(p.revenue)}</p>
                                                <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden w-full">
                                                    <div className="h-full rounded-full" style={{ width: `${barW}%`, background: 'linear-gradient(to right,#7c3aed,#a78bfa)' }} />
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-right font-black text-gray-600">{p.orders}</td>
                                            <td className="px-4 py-3 text-right font-black text-gray-500">{p.hours.toFixed(1)}h</td>
                                            <td className="px-4 py-3 text-right">
                                                <span className="font-black text-green-700">{formatVND(p.revenuePerHour)}</span>
                                                <span className="text-[9px] text-gray-400 block font-bold">/giờ</span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            {staffPerformance.length > 1 && (
                                <tfoot className="bg-gray-900 text-white">
                                    <tr>
                                        <td colSpan={2} className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-amber-400">Tổng</td>
                                        <td className="px-4 py-3 text-right font-black text-amber-400">{formatVND(staffPerformance.reduce((s, p) => s + p.revenue, 0))}</td>
                                        <td className="px-4 py-3 text-right font-black text-white">{staffPerformance.reduce((s, p) => s + p.orders, 0)}</td>
                                        <td className="px-4 py-3 text-right font-black text-gray-400">{staffPerformance.reduce((s, p) => s + p.hours, 0).toFixed(1)}h</td>
                                        <td className="px-4 py-3 text-right font-black text-green-400">{formatVND(staffPerformance.reduce((s, p) => s + p.revenue, 0) / Math.max(1, staffPerformance.reduce((s, p) => s + p.hours, 0)))}</td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>
            )}
            {/* ======== MODULE 8: Tồn kho chậm luân chuyển ======== */}
            {inventoryStats.length > 0 && (
                <div className="bg-white border border-gray-100 shadow-sm overflow-hidden" style={{ borderRadius: 'var(--radius-card)' }}>
                    <div className="border-b border-gray-100 flex items-center gap-3 bg-gradient-to-r from-rose-900 to-rose-800 text-white" style={{ padding: '20px' }}>
                        <TrendingDown size={18} className="text-rose-300" />
                        <div>
                            <h3 className="font-black uppercase tracking-wider text-xs sm:text-sm">Phân tích Tồn kho & Luân chuyển</h3>
                            <p className="text-[10px] text-gray-400 mt-0.5">Xác định nguyên liệu tồn nhiều, bán chậm, ít sinh doanh thu</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-3 divide-x divide-gray-100">

                        {/* Zone 1: Dead Stock */}
                        <div style={{ padding: '20px' }}>
                            <div className="flex items-center gap-2 mb-4">
                                <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                                <p className="text-[10px] font-black uppercase tracking-widest text-red-600">Tồn kho kỳ này — Không bán ra</p>
                                <span className="ml-auto text-[9px] font-black text-gray-400">{slowInventory.deadStock.length} mục</span>
                            </div>
                            {slowInventory.deadStock.length === 0
                                ? <p className="text-[11px] text-gray-400 italic text-center py-6">✅ Tất cả nguyên liệu đều được dùng trong kỳ</p>
                                : <div className="flex flex-col" style={{ gap: '8px' }}>
                                    {slowInventory.deadStock.map((inv, i) => (
                                        <div key={inv.id} className="flex flex-col p-2 bg-red-50 border border-red-100 rounded" style={{ gap: '4px' }}>
                                            <div className="flex items-center gap-3">
                                                <span className="text-[9px] font-black text-red-400 w-4 shrink-0">{i+1}</span>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-black text-gray-900 text-[11px] truncate">{inv.name}</p>
                                                    <p className="text-[9px] text-gray-400 font-bold">{inv.stock.toFixed(1)} {inv.unit} tồn</p>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <p className="font-black text-red-600 text-[11px]">{formatVND(inv.stockValue)}</p>
                                                    <p className="text-[8px] text-gray-400 font-bold">vốn tồn</p>
                                                </div>
                                            </div>
                                            {inv.relatedMenuItems?.length > 0 && (
                                                <div className="ml-5 pl-2 border-l-2 border-red-200">
                                                    <p className="text-[8px] text-red-500 font-black uppercase mb-0.5">Món dùng NL này:</p>
                                                    <p className="text-[9px] text-gray-600 font-bold">{inv.relatedMenuItems.join(', ')}</p>
                                                </div>
                                            )}
                                            {inv.relatedMenuItems?.length === 0 && (
                                                <div className="ml-5 pl-2 border-l-2 border-red-200">
                                                    <p className="text-[8px] text-red-500 font-black">⚠️ Không có món nào dùng NL này — cân nhắc xóa khỏi kho</p>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    <div className="mt-2 p-2 bg-red-900 rounded flex justify-between items-center">
                                        <span className="text-[9px] font-black text-red-200 uppercase">Tổng vốn bị tồn động</span>
                                        <span className="font-black text-red-300 text-sm">{formatVND(slowInventory.deadStock.reduce((s, x) => s + x.stockValue, 0))}</span>
                                    </div>
                                </div>
                            }
                        </div>

                        {/* Zone 2: Slow Sellers (daysOfStock > 60) */}
                        <div style={{ padding: '20px' }}>
                            <div className="flex items-center gap-2 mb-4">
                                <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                                <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">Chậm luân chuyển — Tồn &gt; 60 ngày</p>
                                <span className="ml-auto text-[9px] font-black text-gray-400">{slowInventory.slowSellers.length} mục</span>
                            </div>
                            {slowInventory.slowSellers.length === 0
                                ? <p className="text-[11px] text-gray-400 italic text-center py-6">✅ Lưu lượng tồn kho ổn định</p>
                                : <div className="flex flex-col" style={{ gap: '8px' }}>
                                    {slowInventory.slowSellers.map((inv, i) => (
                                        <div key={inv.id} className="flex flex-col p-2 bg-amber-50 border border-amber-100 rounded" style={{ gap: '4px' }}>
                                            <div className="flex items-center gap-3">
                                                <span className="text-[9px] font-black text-amber-500 w-4 shrink-0">{i+1}</span>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-black text-gray-900 text-[11px] truncate">{inv.name}</p>
                                                    <p className="text-[9px] text-gray-400 font-bold">{inv.dailyUsage.toFixed(2)} {inv.unit}/ngày</p>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <p className="font-black text-amber-700 text-[11px]">
                                                        {inv.daysOfStock === Infinity ? '∞' : `${Math.round(inv.daysOfStock)}ng`}
                                                    </p>
                                                    <p className="text-[8px] text-gray-400 font-bold">dự trữ còn</p>
                                                </div>
                                            </div>
                                            {inv.relatedMenuItems?.length > 0 && (
                                                <div className="ml-5 pl-2 border-l-2 border-amber-300">
                                                    <p className="text-[8px] text-amber-600 font-black uppercase mb-0.5">Cần upsale món:</p>
                                                    <p className="text-[9px] text-gray-600 font-bold">{inv.relatedMenuItems.join(', ')}</p>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            }
                        </div>

                        {/* Zone 3: Low Stock */}
                        <div style={{ padding: '20px' }}>
                            <div className="flex items-center gap-2 mb-4">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Cần nhập ngược — Cạn &lt; 5 ngày</p>
                                <span className="ml-auto text-[9px] font-black text-gray-400">{slowInventory.lowStock.length} mục</span>
                            </div>
                            {slowInventory.lowStock.length === 0
                                ? <p className="text-[11px] text-gray-400 italic text-center py-6">✅ Không có nguyên liệu nào sắp cạn</p>
                                : <div className="flex flex-col" style={{ gap: '8px' }}>
                                    {slowInventory.lowStock.map((inv, i) => (
                                        <div key={inv.id} className="relative flex items-center gap-3 p-2 bg-emerald-50 border border-emerald-200 rounded overflow-hidden">
                                            <div className="absolute inset-0 h-full" style={{ width: `${Math.min(100, (inv.daysOfStock / 5) * 100)}%`, background: 'rgba(16,185,129,0.08)' }} />
                                            <span className="text-[9px] font-black text-emerald-600 w-4 relative">{i+1}</span>
                                            <div className="flex-1 min-w-0 relative">
                                                <p className="font-black text-gray-900 text-[11px] truncate">{inv.name}</p>
                                                <p className="text-[9px] text-gray-400 font-bold">{inv.stock.toFixed(2)} {inv.unit} còn lại</p>
                                            </div>
                                            <div className="text-right shrink-0 relative">
                                                <p className={`font-black text-[11px] ${inv.daysOfStock <= 2 ? 'text-red-600' : 'text-emerald-700'}`}>{inv.daysOfStock.toFixed(1)} ngày</p>
                                                <p className="text-[8px] text-gray-400 font-bold">còn đủ dùng</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            }
                        </div>

                    </div>
                    {/* Footer insight — Actionable */}
                    {(slowInventory.deadStock.length > 0 || slowInventory.slowSellers.length > 0) && (() => {
                        const totalSlow = slowInventory.deadStock.length + slowInventory.slowSellers.length;
                        const totalValue = slowInventory.deadStock.reduce((s, x) => s + x.stockValue, 0) + slowInventory.slowSellers.reduce((s, x) => s + x.stockValue, 0);
                        const upsaleEntries = Array.from(slowInventory.menuItemsToUpsale?.entries() || []);
                        return (
                            <div className="border-t border-gray-200 bg-rose-50" style={{ padding: '16px 20px' }}>
                                <div className="flex items-start gap-3">
                                    <span className="text-base shrink-0 mt-0.5">💡</span>
                                    <div className="flex flex-col" style={{ gap: '8px' }}>
                                        <p className="text-[11px] font-black text-rose-900">
                                            Có <strong>{totalSlow}</strong> loại nguyên liệu chậm bán ra. Tổng tồn kho: <strong>{formatVND(totalValue)}</strong>.
                                        </p>
                                        {upsaleEntries.length > 0 && (
                                            <div>
                                                <p className="text-[10px] font-black text-rose-700 uppercase tracking-wider mb-2">Món cần xét Upsale / Kiểm tra để giải phóng tồn kho:</p>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                    {upsaleEntries.map(([menuName, ingredients]) => (
                                                        <div key={menuName} className="bg-white border border-rose-200 rounded px-3 py-2 flex items-start gap-2">
                                                            <span className="text-rose-500 font-black text-[11px] shrink-0">↑</span>
                                                            <div className="min-w-0">
                                                                <p className="font-black text-gray-900 text-[11px]">{menuName}</p>
                                                                <p className="text-[9px] text-gray-400 font-bold truncate">Dùng: {ingredients.join(', ')}</p>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                                <p className="text-[9px] text-rose-600 font-bold mt-2 italic">Xét đưa vào combo, giảm giá giờ vàng, hoặc xóa món nếu không có NL thay thế.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })()}
                </div>
            )}
        </div>
    );
};

export default BusinessAnalyticsSection;
