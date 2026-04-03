import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    DollarSign, BookOpen, ShoppingCart, XCircle, FileUp, 
    BarChart, Calculator, PackageCheck
} from 'lucide-react';
import { getDateStr } from '../../utils/timeUtils';
import { formatVND } from '../../utils/dashboardUtils';
import BusinessAnalyticsSection from './BusinessAnalyticsSection';
import TaxReportSection from './TaxReportSection';
import FixedCostsSection from './reports/FixedCostsSection';
import MasterLedgerSection from './reports/MasterLedgerSection';
import InventoryAuditSection from './reports/InventoryAuditSection';
import PromotionROISection from './reports/PromotionROISection';
import { calculateSimulatedTax, getSavedTaxData } from '../../utils/taxUtils';

const ReportsTab = ({
    report, orders, inventory, inventoryAudits, inventoryStats, historicalStockLevels,
    expenses, staff, shifts, menu, settings, hasPermission, updateFixedCosts, 
    SERVER_URL, showToast, setSelectedLog,
    calculationMode, setCalculationMode
}) => {
    // Standard Report States
    const [reportPeriod, setReportPeriod] = useState('today');
    const [customStartDate, setCustomStartDate] = useState(() => getDateStr());
    const [customEndDate, setCustomEndDate] = useState(() => getDateStr());
    
    // Sub-tabs State for Operations UX
    const [activeSubTab, setActiveSubTab] = useState('overview');

    const [bepMode, setBepMode] = useState('item');

    // Memoized Maps
    const inventoryStatsMap = useMemo(() => new Map((inventoryStats || []).map(inv => [inv.id, inv])), [inventoryStats]);
    const menuMap = useMemo(() => new Map((menu || []).map(m => [m.id, m])), [menu]);

    // Data Filtering & Statistics
    const getFilteredLogs = () => {
        if (!report || !report.logs) return [];
        const logs = report.logs;
        if (reportPeriod === 'all') return logs;
        if (reportPeriod === 'today') {
            const today = getDateStr();
            return logs.filter(l => getDateStr(l.timestamp) === today);
        }
        if (reportPeriod === 'week') {
            const lastWeek = new Date(); lastWeek.setDate(lastWeek.getDate() - 7);
            return logs.filter(l => new Date(l.timestamp) >= lastWeek);
        }
        if (reportPeriod === '30days') {
            const last30 = new Date(); last30.setDate(last30.getDate() - 30);
            return logs.filter(l => new Date(l.timestamp) >= last30);
        }
        if (reportPeriod === 'month') {
            const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
            return logs.filter(l => new Date(l.timestamp) >= monthStart);
        }
        if (reportPeriod === 'quarter') {
            const now = new Date();
            const q = Math.floor(now.getMonth() / 3);
            const qStart = new Date(now.getFullYear(), q * 3, 1);
            return logs.filter(l => new Date(l.timestamp) >= qStart);
        }
        if (reportPeriod === 'year') {
            const now = new Date();
            const yearStart = new Date(now.getFullYear(), 0, 1);
            return logs.filter(l => new Date(l.timestamp) >= yearStart);
        }
        if (reportPeriod === 'custom') {
            const start = new Date(customStartDate); start.setHours(0,0,0,0);
            const end = new Date(customEndDate); end.setHours(23,59,59,999);
            return logs.filter(l => {
                const d = new Date(l.timestamp);
                return d >= start && d <= end;
            });
        }
        return logs;
    };

    const filteredLogs = getFilteredLogs();
    
    const stats = useMemo(() => ({
        sales: filteredLogs.reduce((s, l) => {
            const isRevenueLog = l.type === 'COMPLETED' || l.type === 'DEBT_MARKED' || l.type === 'DEBT_PAID';
            const gross = parseFloat(l.price) || 0;
            const tax = l.orderData?.taxAmount || 0;
            return s + (isRevenueLog ? (gross - tax) : 0);
        }, 0),
        debt: filteredLogs.reduce((s, l) => s + (l.type === 'DEBT_MARKED' ? (parseFloat(l.price) || l.orderData?.price || 0) : 0), 0),
        success: filteredLogs.filter(l => l.type === 'COMPLETED' || l.type === 'DEBT_MARKED' || l.type === 'DEBT_PAID').length,
        cancelled: filteredLogs.filter(l => l.type === 'CANCELLED').length
    }), [filteredLogs]);

    const calculateItemCOGS = (orderItem) => {
        const menuItem = menuMap.get(orderItem.item?.id);
        if (!menuItem) return 0;

        let itemCost = 0;

        (menuItem.recipe || []).forEach(r => {
            const inv = inventoryStatsMap.get(r.ingredientId);
            if (inv) itemCost += (inv.avgCost || 0) * r.quantity;
        });

        const sizeOption = orderItem.size;
        if (sizeOption) {
            const sizeLabel = typeof sizeOption === 'string' ? sizeOption : (sizeOption.label || sizeOption.name);
            const menuSize = menuItem.sizes?.find(s => s.label === sizeLabel);
            if (menuSize) {
                const multiplier = menuSize.multiplier || 1.0;
                itemCost *= multiplier; 

                (menuSize.recipe || []).forEach(r => {
                    const inv = inventoryStatsMap.get(r.ingredientId);
                    if (inv) itemCost += (inv.avgCost || 0) * r.quantity;
                });
            }
        }

        (orderItem.addons || []).forEach(addonOption => {
            const addonLabel = typeof addonOption === 'string' ? addonOption : addonOption.label;
            const menuAddon = menuItem.addons?.find(a => a.label === addonLabel);
            if (menuAddon && menuAddon.recipe) {
                menuAddon.recipe.forEach(r => {
                    const inv = inventoryStatsMap.get(r.ingredientId);
                    if (inv) itemCost += (inv.avgCost || 0) * r.quantity;
                });
            }
        });

        return itemCost * (orderItem.count || 1);
    };

    const totalCOGS = useMemo(() => {
        let c = 0;
        filteredLogs.forEach(l => {
            if (l.type !== 'COMPLETED' && l.type !== 'DEBT_MARKED' && l.type !== 'DEBT_PAID') return;
            const o = l.orderData || {};
            (o.cartItems || []).forEach(item => {
                c += calculateItemCOGS(item);
            });
        });
        return c;
    }, [filteredLogs, menuMap, inventoryStatsMap]);

    const exportToCSV = () => {
        const headers = ['Ma Don', 'Ngay Gio', 'Doanh Thu', 'Giam Gia', 'Thuc Nhan'];
        const rows = filteredLogs.map(l => [
            l.orderId, 
            getDateStr(l.timestamp), 
            l.price, 
            l.orderData?.discount || 0, 
            (parseFloat(l.price) || 0) - (l.orderData?.discount || 0)
        ]);
        const content = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob(["\uFEFF" + content], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a'); 
        link.href = URL.createObjectURL(blob); 
        link.download = `Bao_Cao_${getDateStr()}.csv`; 
        link.click();
    };

    return (
        <motion.section 
            key="reports" 
            initial={{ opacity: 0, scale: 0.98 }} 
            animate={{ opacity: 1, scale: 1 }} 
            exit={{ opacity: 0, scale: 0.98 }} 
            className="flex flex-col gap-4" 
            style={{ marginTop: '20px', paddingBottom: '40px' }}
        >
            {/* Filter Bar - Global */}
            <div className="sticky top-0 z-40 w-full flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 bg-white/90 backdrop-blur-md p-1.5 sm:p-2 border border-gray-100 shadow-sm transition-all" style={{ borderRadius: 'var(--radius-card)', marginTop: '0px' }}>
                <div className="flex flex-nowrap sm:flex-wrap items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar w-full sm:w-auto">
                    {['today', 'week', '30days', 'month', 'quarter', 'year', 'all', 'custom'].map(p => (
                        <button 
                            key={p} 
                            onClick={() => setReportPeriod(p)} 
                            className={`px-3 sm:px-6 py-2 font-black text-[10px] sm:text-xs uppercase tracking-wider sm:tracking-widest transition-all rounded-md sm:rounded-lg whitespace-nowrap flex-shrink-0 ${reportPeriod === p ? 'bg-gray-900 text-white shadow-md' : 'text-gray-500 hover:bg-gray-100'}`}
                            style={{ minHeight: '32px' }}
                        >
                            {p === 'today' ? 'Hôm nay' : p === 'week' ? '7 ngày' : p === '30days' ? '30 ngày' : p === 'month' ? 'Tháng này' : p === 'quarter' ? 'Quý này' : p === 'year' ? 'Năm nay' : p === 'all' ? 'Tất cả' : 'Tùy chỉnh'}
                        </button>
                    ))}
                    {reportPeriod === 'custom' && (
                        <div className="flex items-center gap-1 sm:gap-2 ml-1 sm:ml-3 pl-1 sm:pl-3 border-l border-gray-200 shrink-0">
                            <input type="date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} className="px-2 sm:px-3 py-1.5 border border-gray-200 text-[10px] sm:text-sm font-bold bg-gray-50 rounded-md sm:rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-gray-900" style={{ height: '32px' }}/>
                            <span className="text-gray-400 font-bold">&rarr;</span>
                            <input type="date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} className="px-2 sm:px-3 py-1.5 border border-gray-200 text-[10px] sm:text-sm font-bold bg-gray-50 rounded-md sm:rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-gray-900" style={{ height: '32px' }}/>
                        </div>
                    )}
                </div>
                {hasPermission('reports', 'edit') && (
                    <button 
                        onClick={exportToCSV} 
                        className="flex items-center gap-2 bg-brand-50 text-brand-600 px-6 py-2 font-black text-xs uppercase tracking-widest hover:bg-brand-100 transition-all border border-brand-100 rounded-sm"
                        style={{ minHeight: '44px' }}
                    >
                        <FileUp size={16} /> XUẤT CSV
                    </button>
                )}
            </div>

            {/* Sub-Tabs Navigation — scroll ngang trên mobile */}
            <div className="flex bg-white border border-slate-200 p-1 rounded-xl w-full sm:w-fit shadow-sm gap-1 overflow-x-auto no-scrollbar">
                <button 
                    onClick={() => setActiveSubTab('overview')} 
                    className={`flex items-center gap-1.5 px-3 sm:px-5 py-2 transition-all font-black text-[10px] sm:text-[11px] uppercase tracking-wider rounded-lg whitespace-nowrap flex-shrink-0 ${activeSubTab === 'overview' ? 'bg-brand-50 text-brand-700 pointer-events-none' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50'}`}
                    style={{ minHeight: '36px' }}
                >
                    <BarChart size={14} />
                    <span className="hidden sm:inline">TỔNG QUAN</span>
                    <span className="sm:hidden">TỔNG</span>
                </button>
                <button 
                    onClick={() => setActiveSubTab('accounting')} 
                    className={`flex items-center gap-1.5 px-3 sm:px-5 py-2 transition-all font-black text-[10px] sm:text-[11px] uppercase tracking-wider rounded-lg whitespace-nowrap flex-shrink-0 ${activeSubTab === 'accounting' ? 'bg-blue-50 text-blue-700 pointer-events-none' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50'}`}
                    style={{ minHeight: '36px' }}
                >
                    <Calculator size={14} />
                    <span className="hidden sm:inline">KẾ TOÁN &amp; BEP</span>
                    <span className="sm:hidden">KẾ TOÁN</span>
                </button>
                <button 
                    onClick={() => setActiveSubTab('inventory')} 
                    className={`flex items-center gap-1.5 px-3 sm:px-5 py-2 transition-all font-black text-[10px] sm:text-[11px] uppercase tracking-wider rounded-lg whitespace-nowrap flex-shrink-0 ${activeSubTab === 'inventory' ? 'bg-amber-50 text-amber-700 pointer-events-none' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50'}`}
                    style={{ minHeight: '36px' }}
                >
                    <PackageCheck size={14} />
                    <span className="hidden sm:inline">KHO &amp; HAO HỤT</span>
                    <span className="sm:hidden">KHO</span>
                </button>
            </div>

            {/* Dynamic Content based on Active Tab */}
            <AnimatePresence mode="wait">
                {activeSubTab === 'overview' && (
                    <motion.div key="overview" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
                        {/* Revenue Stats */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {[
                                { label: 'Doanh thu (Kỳ này)', value: formatVND(stats.sales), icon: DollarSign, color: "var(--brand-600)" },
                                { label: 'Công Nợ', value: formatVND(stats.debt), icon: BookOpen, color: "#8b5cf6" },
                                { label: 'Đơn thành công', value: stats.success, icon: ShoppingCart, color: '#34C759' },
                                { label: 'Đơn đã hủy', value: stats.cancelled, icon: XCircle, color: '#FF3B30' },
                            ].map(card => (
                                <div key={card.label} className="bg-white border border-gray-100 shadow-sm relative overflow-hidden" style={{ borderRadius: 'var(--radius-card)', padding: '24px' }}>
                                    <div className="absolute top-0 right-0 opacity-[0.05] pointer-events-none"><card.icon size={100} /></div>
                                    <p className="text-[9px] text-gray-400 font-black uppercase tracking-[0.15em] mb-2 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: card.color }} /> {card.label}</p>
                                    <p className="text-xl sm:text-2xl font-black text-gray-900 break-all leading-tight">{card.value}</p>
                                </div>
                            ))}
                        </div>

                        <BusinessAnalyticsSection
                            filteredLogs={filteredLogs}
                            allLogs={report?.logs || []}
                            stats={stats}
                            totalCOGS={totalCOGS}
                            menu={menu}
                            inventoryStats={inventoryStats}
                            inventoryStatsMap={inventoryStatsMap}
                            calculateItemCOGS={calculateItemCOGS}
                            fixedCosts={report?.fixedCosts || {}}
                            expenses={expenses}
                            shifts={shifts}
                            staff={staff}
                        />

                        <TaxReportSection 
                            logs={(report?.logs || []).filter(l => l.type === 'COMPLETED')}
                            settings={settings}
                            hasPermission={hasPermission}
                            calculationMode={calculationMode}
                            setCalculationMode={setCalculationMode}
                        />
                    </motion.div>
                )}

                {activeSubTab === 'accounting' && (
                    <motion.div key="accounting" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
                        
                        <FixedCostsSection 
                            costs={report?.fixedCosts || {}} onUpdate={updateFixedCosts} menu={menu} 
                            inventoryStats={inventoryStats} inventoryStatsMap={inventoryStatsMap}
                            shifts={shifts} staff={staff} 
                            reportPeriod={reportPeriod} report={report} bepMode={bepMode} 
                            setBepMode={setBepMode} expenses={expenses} hasPermission={hasPermission} 
                            calculateItemCOGS={calculateItemCOGS} totalCOGS={totalCOGS}
                            filteredLogs={filteredLogs} stats={stats}
                        />

                        <MasterLedgerSection 
                            filteredLogs={filteredLogs}
                            orders={orders}
                            reportPeriod={reportPeriod}
                            customStartDate={customStartDate}
                            customEndDate={customEndDate}
                            calculateItemCOGS={calculateItemCOGS}
                            calculationMode={calculationMode}
                            settings={settings}
                            setSelectedLog={setSelectedLog}
                        />

                        <PromotionROISection 
                            filteredLogs={filteredLogs}
                            inventoryStatsMap={inventoryStatsMap}
                            settings={settings}
                            setSelectedLog={setSelectedLog}
                        />
                    </motion.div>
                )}

                {activeSubTab === 'inventory' && (
                    <motion.div key="inventory" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                        <InventoryAuditSection 
                            inventoryAudits={inventoryAudits}
                            inventoryStatsMap={inventoryStatsMap}
                            inventory={inventory}
                            report={report}
                            orders={orders}
                            historicalStockLevels={historicalStockLevels}
                            setSelectedLog={setSelectedLog}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.section>
    );
};

export default ReportsTab;
