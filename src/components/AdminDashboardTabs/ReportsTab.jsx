import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    DollarSign, BookOpen, ShoppingCart, XCircle, FileUp, Gift, Package, 
    PieChart, ClipboardList, AlertTriangle, BarChart3, TrendingDown, 
    TrendingUp, Calculator, CheckCircle, Info, ChevronDown, ChevronUp,
    LineChart, Search, Edit2, Trash2, Plus, Save, X, Settings
} from 'lucide-react';
import { formatTime, formatDate, getDateStr } from '../../utils/timeUtils';
import { formatVND, getLogOrderId } from '../../utils/dashboardUtils';
import BusinessAnalyticsSection from './BusinessAnalyticsSection';
import TaxReportSection from './TaxReportSection';
import { calculateSimulatedTax, getSavedTaxData } from '../../utils/taxUtils';

// --- Sub-components (Fixed Costs) ---
const CostGroup = ({ title, value, children, color = "blue", icon: Icon }) => (
    <div className={`p-4 bg-white border border-gray-100 shadow-sm space-y-3 border-t-2 ${color === 'blue' ? 'border-t-blue-500' : 'border-t-brand-500'}`}>
        <div className="flex justify-between items-center pb-2 border-b border-gray-50">
            <div className="flex items-center gap-2">
                {Icon && <Icon size={14} className="text-gray-400" />}
                <h4 className="text-[10px] font-black uppercase text-gray-400 tracking-widest">{title}</h4>
            </div>
            <span className={`text-sm font-black ${color === 'blue' ? 'text-blue-600' : 'text-brand-600'}`}>{formatVND(value)}</span>
        </div>
        <div className="space-y-2">{children}</div>
    </div>
);

const FixedCostItem = ({ label, value, onEdit, isEditing, tempValue, setTempValue, onSave, onCancel, icon: Icon, percentage, totalRevenue, isActual = false, subValueLabel }) => (
    <div className="flex flex-col gap-2 p-3 bg-gray-50/50 rounded-sm border border-transparent hover:border-gray-100 transition-all group">
        <div className="flex justify-between items-start">
            <div className="space-y-1">
                <span className={`text-[10px] font-black ${isActual ? 'text-blue-500' : 'text-gray-400'} uppercase flex items-center gap-2 tracking-wider`}>
                    {Icon && <Icon size={12} />}
                    {label}
                </span>
                {subValueLabel && <p className="text-[9px] font-bold text-gray-400 italic lowercase">{subValueLabel}</p>}
                <div className="flex items-center gap-2">
                    {isEditing ? (
                        <div className="flex items-center gap-1.5 bg-white p-1 shadow-sm border border-brand-200">
                            <input
                                type="number"
                                value={tempValue}
                                onChange={(e) => setTempValue(e.target.value)}
                                className="w-24 text-[13px] font-black focus:outline-none"
                                autoFocus
                            />
                            <button onClick={onSave} className="text-green-600 hover:scale-110 transition-transform"><CheckCircle size={14} /></button>
                            <button onClick={onCancel} className="text-gray-400 hover:scale-110 transition-transform"><X size={14} /></button>
                        </div>
                    ) : (
                        <div className="flex items-baseline gap-2">
                            <span className={`text-lg font-black tracking-tight ${isActual ? 'text-blue-600' : 'text-gray-800'}`}>{formatVND(value)}</span>
                            {isActual && <span className="text-[8px] font-black bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full uppercase">Thực tế</span>}
                            {!isActual && (
                                <button onClick={onEdit} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-brand-600 transition-all">
                                    <Edit2 size={12} />
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
            {totalRevenue > 0 && (
                <div className="text-right">
                    <span className={`text-[10px] font-black ${percentage > 15 ? 'text-red-500' : 'text-gray-400'}`}>{percentage.toFixed(1)}%</span>
                    <p className="text-[8px] text-gray-300 font-bold uppercase">Tỷ trọng DT</p>
                </div>
            )}
        </div>
        {!isEditing && totalRevenue > 0 && (
            <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
                <div 
                    className={`h-full transition-all duration-1000 ${percentage > 15 ? 'bg-red-500' : percentage > 8 ? 'bg-amber-400' : 'bg-brand-500'}`} 
                    style={{ width: `${Math.min(100, (value / totalRevenue) * 100)}%` }} 
                />
            </div>
        )}
    </div>
);

const FixedCostsSection = ({ costs, onUpdate, menu, inventoryStats, inventoryStatsMap = new Map(), report, bepMode, setBepMode, shifts = [], staff = [], reportPeriod = 'month', expenses = [], calculateItemCOGS, totalCOGS, filteredLogs = [], stats = {}, hasPermission = () => true }) => {
    const [editingKey, setEditingKey] = React.useState(null);
    const [tempVal, setTempVal] = React.useState('');
    const [selectedItem, setSelectedItem] = React.useState('');
    const [bepBasis, setBepBasis] = React.useState('fixed'); // 'fixed' or 'opex'
    const [costMode, setCostMode] = React.useState('manual'); // 'manual' or 'actual'
    const [showDetailedBEP, setShowDetailedBEP] = React.useState(false);

    const handleSave = (key) => {
        onUpdate({ ...costs, [key]: parseFloat(tempVal) || 0 });
        setEditingKey(null);
    };

    // Calculate Dynamic Salaries
    const dynamicSalaries = React.useMemo(() => {
        if (!costs.useDynamicSalaries) return 0;
        let total = 0;
        (shifts || []).forEach(s => {
            const st = staff.find(p => p.id === s.staffId);
            if (st && st.salary) {
                const hours = (new Date(s.endTime) - new Date(s.startTime)) / 3600000;
                total += (st.salary * hours);
            }
        });
        return total; // stored as k VND internally, no need to divide
    }, [costs.useDynamicSalaries, shifts, staff]);

    // activeSalaries calculation moved below to be closer to OPEX calculation and include costMode logic


    // Current Month Expenses for OPEX
    const currentMonthExpenses = React.useMemo(() => {
        const now = new Date();
        const curM = now.getMonth();
        const curY = now.getFullYear();
        return expenses.filter(e => {
            const d = new Date(e.timestamp);
            // Nếu ngày hợp lệ, lọc theo tháng hiện tại. Nếu Invalid Date, vẫn giữ lại để tránh mất dữ liệu (vì Dashboard đã lọc sẵn rồi)
            if (isNaN(d.getTime())) return true;
            return d.getMonth() === curM && d.getFullYear() === curY;
        });
    }, [expenses]);

    const totalIncurredExpenses = currentMonthExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

    // Actual Calculation for Fixed Costs based on categorized expense strings
    const actualRent = useMemo(() => {
        return currentMonthExpenses
            .filter(e => {
                const name = (e.name || '').toLowerCase();
                const cat = (e.category || '').toLowerCase();
                return cat.includes('mặt bằng') || name.includes('mặt bằng') || name.includes('thuê') || name.includes('tiền nhà');
            })
            .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    }, [currentMonthExpenses]);

    const actualMachines = useMemo(() => {
        return currentMonthExpenses
            .filter(e => {
                const name = (e.name || '').toLowerCase();
                const cat = (e.category || '').toLowerCase();
                return cat.includes('máy móc') || cat.includes('đầu tư') || name.includes('máy móc') || name.includes('khấu hao') || name.includes('thiết bị');
            })
            .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    }, [currentMonthExpenses]);

    const actualOtherExpenses = useMemo(() => {
        // All expenses that are NOT rent or machines
        return currentMonthExpenses
            .filter(e => {
                const name = (e.name || '').toLowerCase();
                const cat = (e.category || '').toLowerCase();
                const isRent = cat.includes('mặt bằng') || name.includes('mặt bằng') || name.includes('thuê') || name.includes('tiền nhà');
                const isMachine = cat.includes('máy móc') || cat.includes('đầu tư') || name.includes('máy móc') || name.includes('khấu hao') || name.includes('thiết bị');
                return !isRent && !isMachine;
            })
            .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    }, [currentMonthExpenses]);

    const activeRent = costMode === 'actual' ? actualRent : (costs.rent || 0);
    const rawActualMachines = actualMachines;
    const rawForecastMachines = (costs.machines || 0);
    const depreciationMonths = costs.machineDepreciationMonths || 1;
    
    // Depreciation logic applied here
    const activeMachines = (costMode === 'actual' ? rawActualMachines : rawForecastMachines) / depreciationMonths;
    const activeSalaries = (costMode === 'actual' || costs.useDynamicSalaries) ? dynamicSalaries : (costs.salaries || 0);

    const totalFixed = activeRent + activeMachines + activeSalaries;
    const totalVariable = costMode === 'actual' 
        ? actualOtherExpenses 
        : ((costs.electricity || 0) + (costs.water || 0) + (costs.other || 0) + totalIncurredExpenses);
    
    const totalOPEX = totalFixed + totalVariable;

    // (calculateItemCOGS moved to ReportsTab)

    // BEP Calculator Logic
    const stats30Days = useMemo(() => {
        const completed = (report?.logs || []).filter(l => l.type === 'COMPLETED' && l.orderData);
        const totalRev = completed.reduce((sum, l) => sum + (parseFloat(l.price) || 0), 0);
        const totalCount = completed.length;
        
        let totalItems = 0;
        let totalCalcCOGS = 0;
        completed.forEach(l => {
            (l.orderData.cartItems || []).forEach(item => {
                totalItems += (item.count || 1);
                totalCalcCOGS += calculateItemCOGS(item);
            });
        });

        return {
            avgPrice: totalItems > 0 ? totalRev / totalItems : 0,
            avgCost: totalItems > 0 ? totalCalcCOGS / totalItems : 0,
            totalRev,
            totalCalcCOGS,
            totalItems
        };
    }, [report, menu, inventoryStats]);

    const menuBEPStats = useMemo(() => {
        const statsMap = new Map();
        
        // Cơ sở dữ liệu mặc định từ Menu
        (menu || []).forEach(item => {
            const mockOrder = { item, count: 1, size: (item.sizes && item.sizes.length > 0) ? item.sizes[0].label : null };
            const unitCost = calculateItemCOGS(mockOrder);
            const basePrice = parseFloat(item.price) || 0;
            const sizeAdjust = (item.sizes && item.sizes.length > 0) ? (parseFloat(item.sizes[0].priceAdjust) || 0) : 0;
            const price = basePrice + sizeAdjust;
            
            statsMap.set(item.id, { 
                id: item.id, 
                name: item.name, 
                price, 
                unitCost, 
                margin: Math.max(0, price - unitCost),
                actualQty: 0,
                actualRevenue: 0
            });
        });

        // Cập nhật số liệu thực tế từ filteredLogs
        (filteredLogs || []).forEach(l => {
            if (l.type !== 'COMPLETED' && l.type !== 'DEBT_MARKED' && l.type !== 'DEBT_PAID') return;
            (l.orderData?.cartItems || []).forEach(ci => {
                const s = statsMap.get(ci.item?.id || ci.id);
                if (s) {
                    s.actualQty += (ci.count || 1);
                    s.actualRevenue += (parseFloat(ci.totalPrice) || 0);
                }
            });
        });

        const totalActualQty = Array.from(statsMap.values()).reduce((sum, s) => sum + s.actualQty, 0);
        const basisValue = bepBasis === 'fixed' ? totalFixed : totalOPEX;

        return Array.from(statsMap.values()).map(s => {
            // Tỷ trọng đóng góp (Sales Mix) - Nếu chưa bán thì mặc định chia đều để dự phóng
            const mixPercentage = totalActualQty > 0 ? (s.actualQty / totalActualQty) : (1 / (menu.length || 1));
            
            // BEP riêng lẻ (Nếu chỉ bán món này)
            const individualBEP = s.margin > 0 ? Math.ceil(basisValue / s.margin) : Infinity;
            
            return { ...s, mixPercentage, individualBEP };
        }).sort((a, b) => b.actualQty - a.actualQty);
    }, [filteredLogs, menu, inventoryStatsMap, totalFixed, totalOPEX, bepBasis]);

    // Biên đóng góp bình quân gia quyền (Weighted Average Contribution Margin)
    const weightedAverageCost = useMemo(() => {
        return menuBEPStats.reduce((sum, s) => sum + (s.unitCost * s.mixPercentage), 0);
    }, [menuBEPStats]);

    const weightedAveragePrice = useMemo(() => {
        return menuBEPStats.reduce((sum, s) => sum + (s.price * s.mixPercentage), 0);
    }, [menuBEPStats]);

    const weightedMargin = useMemo(() => {
        return weightedAveragePrice - weightedAverageCost;
    }, [weightedAveragePrice, weightedAverageCost]);

    const bepResult = useMemo(() => {
        let sellingPrice = 0;
        let itemCost = 0;

        if (bepMode === 'average') {
            sellingPrice = weightedAveragePrice;
            itemCost = weightedAverageCost;
        } else {
            if (!selectedItem) return null;
            const item = menu.find(i => i.id === selectedItem);
            if (!item) return null;
            
            // Simplified for single item (using first size)
            const mockOrderItem = { item: item, count: 1, size: item.sizes?.[0]?.label };
            itemCost = calculateItemCOGS(mockOrderItem);
            sellingPrice = (parseFloat(item.price) || 0) + (item.sizes?.[0]?.priceAdjust || 0);
        }

        const margin = sellingPrice - itemCost;
        const basisValue = bepBasis === 'fixed' ? totalFixed : totalOPEX;
        const monthlyQty = margin > 0 ? Math.ceil(basisValue / margin) : Infinity;
        const dailyQty = margin > 0 ? Math.ceil(monthlyQty / 30) : Infinity;

        return { margin, monthlyQty, dailyQty, sellingPrice, itemCost };
    }, [bepMode, selectedItem, stats30Days, totalFixed, totalOPEX, bepBasis, menu, inventoryStats, weightedAveragePrice, weightedAverageCost]);

    const overallBEP = useMemo(() => {
        const basisValue = bepBasis === 'fixed' ? totalFixed : totalOPEX;
        return weightedMargin > 0 ? Math.ceil(basisValue / weightedMargin) : 0;
    }, [weightedMargin, totalFixed, totalOPEX, bepBasis]);

    // 30-Day Projection Logic
    const daysInPeriod = useMemo(() => {
        if (filteredLogs.length === 0) return 1;
        const uniqueDates = new Set(filteredLogs.map(l => {
            const d = new Date(l.timestamp);
            return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
        }));
        return Math.max(1, uniqueDates.size);
    }, [filteredLogs]);

    const projectedRevenue30 = (stats.sales / daysInPeriod) * 30;
    const projectedCOGS30 = (totalCOGS / daysInPeriod) * 30;
    const projectedNetProfit30 = projectedRevenue30 - projectedCOGS30 - totalOPEX;
    const projectedNetMargin30 = projectedRevenue30 > 0 ? (projectedNetProfit30 / projectedRevenue30) * 100 : 0;
    
    // Actual Profit for the selected period (for internal check if needed, but UI shows Projected)
    const actualNetProfit = stats.sales - totalCOGS - (totalOPEX * (daysInPeriod / 30));
    const actualNetMargin = stats.sales > 0 ? (actualNetProfit / stats.sales) * 100 : 0;

    // normalized costs for the specific selected period (avoiding fake "month-sized" loss on 1 day)
    const normalizedPeriodFixed = (totalFixed / 30) * daysInPeriod;
    const periodActualNetProfit = stats.sales - totalCOGS - (normalizedPeriodFixed + (totalVariable / 30 * daysInPeriod));
    const periodActualNetMargin = stats.sales > 0 ? (periodActualNetProfit / stats.sales) * 100 : 0;

    return (
        <div className="bg-white border border-gray-100 shadow-xl overflow-hidden mt-10 rounded-sm">
            {/* Header with Glassmorphism touch */}
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-slate-900 text-white relative">
                <div className="absolute top-0 left-0 w-1 h-full bg-brand-500" />
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-brand-500/20 rounded-lg">
                        <DollarSign size={20} className="text-brand-400" />
                    </div>
                    <div>
                        <h3 className="font-black uppercase tracking-[0.2em] text-sm">Phân tích Chi phí & Điểm hòa vốn</h3>
                        <p className="text-[10px] text-gray-400 font-bold uppercase mt-0.5">Vận hành chiến lược & Dự phóng tài chính</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="hidden md:flex flex-col items-end">
                        <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Tình trạng dự báo</span>
                        <div className={`text-[11px] font-black flex items-center gap-1 ${projectedNetProfit30 >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {projectedNetProfit30 >= 0 ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
                            {projectedNetProfit30 >= 0 ? 'Dự kiến Có lãi' : 'Dự kiến Lỗ ròng'}
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 divide-x divide-gray-100">
                {/* Section 1: Inputs (Cơ cấu chi phí) */}
                <div className="xl:col-span-4 p-6 space-y-6">
                    <div className="flex justify-between items-center">
                        <h4 className="text-[11px] font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
                            <Settings size={14} className="text-gray-400" />
                            Cấu trúc Chi phí
                        </h4>
                        <div className="flex bg-gray-100 p-0.5 rounded-sm">
                            <button onClick={() => setCostMode('manual')} className={`px-3 py-1 text-[9px] font-black uppercase transition-all ${costMode === 'manual' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400'}`}>Dự toán</button>
                            <button onClick={() => setCostMode('actual')} className={`px-3 py-1 text-[9px] font-black uppercase transition-all ${costMode === 'actual' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400'}`}>Thực tế</button>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <FixedCostItem label="Phí Mặt bằng / Cố định" value={activeRent} isActual={costMode === 'actual'} isEditing={editingKey === 'rent'} tempValue={tempVal} setTempValue={setTempVal} onEdit={() => { setEditingKey('rent'); setTempVal(costs.rent); }} onSave={() => handleSave('rent')} onCancel={() => setEditingKey(null)} icon={DollarSign} percentage={(activeRent / (stats.sales || 1)) * 100} totalRevenue={stats.sales} />
                        
                        <div className="relative">
                            <FixedCostItem 
                                label="Khấu hao Máy móc / Thiết bị" 
                                value={activeMachines} 
                                isActual={costMode === 'actual'} 
                                isEditing={editingKey === 'machines'} 
                                tempValue={tempVal} 
                                setTempValue={setTempVal} 
                                onEdit={() => { setEditingKey('machines'); setTempVal(rawForecastMachines); }} 
                                onSave={() => handleSave('machines')} 
                                onCancel={() => setEditingKey(null)} 
                                icon={Settings} 
                                percentage={(activeMachines / (stats.sales || 1)) * 100} 
                                totalRevenue={stats.sales}
                                subValueLabel={depreciationMonths > 1 ? `Chia cho ${depreciationMonths} tháng khấu hao` : null}
                            />
                            {/* Depreciation months input */}
                            <div className="absolute top-2 right-14 flex items-center gap-1.5 bg-gray-100/50 px-2 py-1 rounded-sm border border-transparent hover:border-gray-200 transition-all">
                                <span className="text-[8px] font-black text-gray-400 uppercase">K.Hao:</span>
                                {editingKey === 'depreciation' ? (
                                    <input
                                        type="number"
                                        value={tempVal}
                                        onChange={(e) => setTempVal(e.target.value)}
                                        className="w-8 bg-transparent text-[10px] font-black focus:outline-none focus:border-b border-brand-500"
                                        onBlur={() => handleSave('machineDepreciationMonths')}
                                        autoFocus
                                    />
                                ) : (
                                    <button 
                                        onClick={() => { setEditingKey('depreciation'); setTempVal(depreciationMonths); }}
                                        className="text-[10px] font-black text-gray-600 hover:text-brand-600"
                                    >
                                        {depreciationMonths} tháng
                                    </button>
                                )}
                            </div>
                        </div>
                        
                        <div className="pt-4 border-t border-dashed border-gray-200">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Quản lý Quỹ lương</span>
                                <div className="flex bg-gray-50 p-0.5 rounded-sm border border-gray-100">
                                    <button onClick={() => onUpdate({ ...costs, useDynamicSalaries: false })} className={`px-2 py-1 text-[8px] font-black uppercase ${!costs.useDynamicSalaries && costMode !== 'actual' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-400'}`} disabled={costMode === 'actual'}>Nhập tay</button>
                                    <button onClick={() => onUpdate({ ...costs, useDynamicSalaries: true })} className={`px-2 py-1 text-[8px] font-black uppercase ${costs.useDynamicSalaries || costMode === 'actual' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-400'}`} disabled={costMode === 'actual'}>Auto (Ca)</button>
                                </div>
                            </div>
                            <FixedCostItem label={(costs.useDynamicSalaries || costMode === 'actual') ? "Tổng lương (Tạm tính)" : "Quỹ lương dự tính"} value={activeSalaries} isActual={costMode === 'actual' || costs.useDynamicSalaries} isEditing={editingKey === 'salaries'} tempValue={tempVal} setTempValue={setTempVal} onEdit={() => { if (!costs.useDynamicSalaries && costMode !== 'actual') { setEditingKey('salaries'); setTempVal(costs.salaries); } }} onSave={() => handleSave('salaries')} onCancel={() => setEditingKey(null)} icon={ShoppingCart} percentage={(activeSalaries / (stats.sales || 1)) * 100} totalRevenue={stats.sales} />
                        </div>
                    </div>

                    <div className="mt-8 p-4 bg-gray-900 border-l-4 border-red-500 rounded-r-lg">
                        <div className="flex justify-between items-baseline">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Tổng chi cố định</span>
                            <span className="text-2xl font-black text-white">{formatVND(totalFixed)}</span>
                        </div>
                        <p className="text-[9px] text-gray-500 font-bold uppercase mt-1 italic">* Tương đương {formatVND(totalFixed/30)} / ngày</p>
                    </div>
                </div>

                {/* Section 2: BEP Calculator (Điểm hòa vốn) */}
                <div className="xl:col-span-4 p-6 bg-gray-50/50 space-y-6 relative">
                    <div className="flex justify-between items-center">
                        <h4 className="text-[11px] font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
                            <Calculator size={14} className="text-gray-400" />
                            Toán học Hòa vốn
                        </h4>
                        <button onClick={() => setShowDetailedBEP(!showDetailedBEP)} className="p-1 px-2 border border-brand-200 text-[10px] font-black text-brand-600 hover:bg-brand-50 uppercase rounded-sm transition-all flex items-center gap-1">
                            {showDetailedBEP ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
                            {showDetailedBEP ? 'Đóng bảng' : 'Chi tiết'}
                        </button>
                    </div>

                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-1 p-1 bg-white border border-gray-200 rounded-sm">
                            <button onClick={() => setBepBasis('fixed')} className={`py-1.5 text-[10px] font-black uppercase rounded-sm ${bepBasis === 'fixed' ? 'bg-gray-900 text-white shadow-lg' : 'text-gray-400'}`}>Cố định</button>
                            <button onClick={() => setBepBasis('opex')} className={`py-1.5 text-[10px] font-black uppercase rounded-sm ${bepBasis === 'opex' ? 'bg-gray-900 text-white shadow-lg' : 'text-gray-400'}`}>Tổng Vận hành</button>
                        </div>

                        {!showDetailedBEP ? (
                            <div className="animate-in fade-in duration-300 space-y-4">
                                <div className="flex items-center gap-1 bg-white border border-gray-100 rounded-sm overflow-hidden p-1 shadow-sm">
                                    <button onClick={() => setBepMode('average')} className={`flex-1 py-1.5 text-[9px] font-black uppercase transition-all ${bepMode === 'average' ? 'bg-brand-500 text-white' : 'text-gray-400 hover:bg-gray-50'}`}>Bình quân</button>
                                    <button onClick={() => setBepMode('item')} className={`flex-1 py-1.5 text-[9px] font-black uppercase transition-all ${bepMode === 'item' ? 'bg-brand-500 text-white' : 'text-gray-400 hover:bg-gray-50'}`}>Chọn món</button>
                                </div>

                                {bepMode === 'item' ? (
                                    <div className="space-y-2">
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={12} />
                                            <select value={selectedItem} onChange={e => setSelectedItem(e.target.value)} className="w-full bg-white border border-gray-200 pl-8 pr-3 py-3 font-black text-xs appearance-none outline-none focus:border-brand-500 transition-all rounded-sm">
                                                <option value="">-- CHỌN MÓN CHIẾN LƯỢC --</option>
                                                {(menu || []).map(m => <option key={m.id} value={m.id}>{m.name.toUpperCase()}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="p-4 bg-white border border-gray-100 shadow-sm rounded-sm">
                                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Cơ cấu Sales Mix TB:</span>
                                        <div className="flex justify-between items-baseline">
                                            <span className="text-[10px] text-gray-500 font-bold italic">Lợi nhuận gộp/ly:</span>
                                            <span className="text-lg font-black text-brand-600">{formatVND(weightedMargin)}</span>
                                        </div>
                                    </div>
                                )}

                                {bepResult && (
                                    <div className="space-y-4 pt-2">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="bg-white p-3 border-l-2 border-l-gray-300">
                                                <p className="text-[9px] text-gray-400 font-black uppercase">Giá vốn (COGS)</p>
                                                <p className="font-black text-gray-600 italic mt-0.5">{formatVND(bepResult.itemCost)}</p>
                                            </div>
                                            <div className="bg-white p-3 border-l-2 border-l-brand-500">
                                                <p className="text-[9px] text-gray-400 font-black uppercase">Biên LN Gộp</p>
                                                <p className="font-black text-brand-600 mt-0.5">{formatVND(bepResult.margin)}</p>
                                            </div>
                                        </div>
                                        
                                        <div className="bg-brand-600 p-6 shadow-xl relative overflow-hidden group hover:scale-[1.02] transition-transform cursor-pointer">
                                            <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:rotate-12 transition-transform">
                                                <TrendingUp size={80} className="text-white" />
                                            </div>
                                            <div className="relative z-10 text-center">
                                                <p className="text-[11px] font-black text-brand-100 uppercase tracking-[0.3em] mb-2">ĐIỂM HÒA VỐN THÁNG</p>
                                                <div className="flex items-baseline justify-center gap-2 text-white">
                                                    <span className="text-5xl font-black">{bepMode === 'average' ? overallBEP.toLocaleString() : bepResult.monthlyQty.toLocaleString()}</span>
                                                    <span className="text-xs font-black opacity-60 uppercase">LY / Tháng</span>
                                                </div>
                                                <div className="mt-4 pt-4 border-t border-brand-500/50">
                                                    <p className="text-[10px] font-black text-brand-200 uppercase tracking-widest">
                                                        Mục tiêu: <span className="text-white">≈ {bepMode === 'average' ? Math.ceil(overallBEP / 30) : bepResult.dailyQty} ly mỗi ngày</span>
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="bg-white border border-gray-200 overflow-hidden max-h-[350px] overflow-y-auto custom-scrollbar animate-in zoom-in-95 duration-200 shadow-inner">
                                <table className="w-full text-left text-[11px] border-collapse">
                                    <thead className="bg-gray-900 text-white sticky top-0 uppercase font-black tracking-widest text-[8px] z-10">
                                        <tr>
                                            <th className="p-3">Món Menu</th>
                                            <th className="p-3 text-right">Biên LN</th>
                                            <th className="p-3 text-right">Q.BEP/Tháng</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {menuBEPStats.map(s => (
                                            <tr key={s.id} className="hover:bg-brand-50 transition-colors">
                                                <td className="p-3">
                                                    <div className="font-black text-gray-900 truncate max-w-[120px]">{s.name}</div>
                                                    <div className="text-[8px] text-gray-400 font-bold uppercase">MIX: {(s.mixPercentage * 100).toFixed(1)}%</div>
                                                </td>
                                                <td className="p-3 text-right">
                                                    <div className="font-black text-brand-600">{formatVND(s.margin)}</div>
                                                    <div className="text-[8px] text-gray-400 font-bold italic">COST: {formatVND(s.unitCost)}</div>
                                                </td>
                                                <td className="p-3 text-right font-black text-gray-900 bg-gray-50/50">
                                                    {s.individualBEP === Infinity ? '--' : s.individualBEP.toLocaleString()}
                                                    <span className="text-[8px] block text-gray-400 opacity-60 uppercase">ly/tháng</span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                {/* Section 3: Summary (Hiệu quả hoạt động) */}
                <div className="xl:col-span-4 p-6 bg-gradient-to-br from-gray-900 to-black text-white flex flex-col justify-between relative">
                    <PieChart size={200} className="absolute -right-20 -bottom-20 opacity-5 text-brand-500" />
                    
                    <div className="relative z-10 space-y-8">
                        {/* Tab 1: Actual This Period */}
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <h5 className="text-[10px] font-black text-brand-400 uppercase tracking-widest flex items-center gap-2">
                                    <TrendingUp size={14} />
                                    Hiệu quả Kỳ này (Thực tế)
                                </h5>
                                <span className="text-[8px] font-black text-gray-500 uppercase">{daysInPeriod} ngày</span>
                            </div>
                            <div className="space-y-1">
                                <p className={`text-3xl font-black tracking-tighter ${periodActualNetProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {formatVND(periodActualNetProfit)}
                                </p>
                                <p className="text-[10px] font-black uppercase text-gray-500 flex items-center gap-2">
                                    Tỉ suất Lợi nhuận kỳ này: 
                                    <span className={periodActualNetProfit >= 0 ? 'text-green-400' : 'text-red-400'}>
                                        {periodActualNetMargin > 0 ? '+' : ''}{periodActualNetMargin.toFixed(1)}%
                                    </span>
                                </p>
                            </div>
                        </div>

                        {/* Tab 2: 30-Day STRATEGIC PROJECTION */}
                        <div className="pt-6 border-t border-white/10 space-y-4">
                            <div className="flex justify-between items-center">
                                <h5 className="text-[10px] font-black text-amber-400 uppercase tracking-widest flex items-center gap-2">
                                    <LineChart size={14} />
                                    Dự phóng Chiến lược (30 ngày)
                                </h5>
                                <span className="text-[8px] font-black text-gray-900 bg-amber-500 px-2 py-0.5 rounded-full">FORECAST</span>
                            </div>
                            <div className="space-y-1">
                                <p className={`text-4xl font-black tracking-tighter ${projectedNetProfit30 >= 0 ? 'text-white' : 'text-red-500'}`}>
                                    {formatVND(projectedNetProfit30)}
                                </p>
                                <div className="flex items-center gap-3">
                                    <p className={`text-[12px] font-black uppercase flex items-center gap-1.5 ${projectedNetProfit30 >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                        {projectedNetProfit30 >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />} 
                                        {projectedNetMargin30.toFixed(1)}% Biên LN
                                    </p>
                                </div>
                            </div>
                            
                            <div className="space-y-3 mt-6 pt-6 border-t border-white/5">
                                <div className="flex justify-between items-center text-[10px] font-bold">
                                    <span className="text-gray-500 uppercase">Doanh thu dự phóng</span>
                                    <span className="font-black">{formatVND(projectedRevenue30)}</span>
                                </div>
                                <div className="flex justify-between items-center text-[10px] font-bold">
                                    <span className="text-gray-500 uppercase">Giá vốn dự kiến (COGS)</span>
                                    <span className="font-black text-amber-500">-{formatVND(projectedCOGS30)}</span>
                                </div>
                                <div className="flex justify-between items-center text-[10px] font-bold">
                                    <span className="text-gray-500 uppercase">Gánh nặng OPEX Tháng</span>
                                    <span className="font-black text-blue-400">-{formatVND(totalOPEX)}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="relative z-10 mt-10 p-4 bg-white/5 rounded border border-white/10 flex items-center gap-3">
                        <Info size={16} className="text-brand-500 shrink-0" />
                        <p className="text-[9px] text-gray-400 font-bold leading-relaxed uppercase">
                            * Hiệu quả thực tế được tính trên chi phí định mức theo ngày ({daysInPeriod} ngày). Dự phóng 30 ngày dựa trên trung bình hiệu suất thực tế.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- Main Reports Component ---
const ReportsTab = ({
    report, orders, inventory, inventoryAudits, inventoryStats, historicalStockLevels,
    expenses, staff, shifts, menu, settings, hasPermission, updateFixedCosts, 
    SERVER_URL, showToast, setSelectedLog,
    calculationMode, setCalculationMode
}) => {
    // Standard Report States
    const [reportPeriod, setReportPeriod] = useState('today');
    // calculationMode now comes from props
    const [customStartDate, setCustomStartDate] = useState(() => getDateStr());
    const [customEndDate, setCustomEndDate] = useState(() => getDateStr());
    
    // Audit / Inventory Report States
    const [auditReportTab, setAuditReportTab] = useState('history');
    const [auditFilterIngredient, setAuditFilterIngredient] = useState('all');
    const [auditFilterPeriod, setAuditFilterPeriod] = useState('all');
    const [auditStartDate, setAuditStartDate] = useState(() => getDateStr());
    const [auditEndDate, setAuditEndDate] = useState(() => getDateStr());
    const [auditLimit, setAuditLimit] = useState(50);
    const [masterLedgerLimit, setMasterLedgerLimit] = useState(50);
    const [bepMode, setBepMode] = useState('item');

    // Memoized Maps
    const inventoryStatsMap = useMemo(() => new Map((inventoryStats || []).map(inv => [inv.id, inv])), [inventoryStats]);
    const menuMap = useMemo(() => new Map((menu || []).map(m => [m.id, m])), [menu]);
    const nameToIdMap = useMemo(() => {
        const map = new Map();
        (inventory || []).forEach(i => {
            if (i.name) map.set(i.name.toLowerCase().trim(), i.id);
        });
        return map;
    }, [inventory]);

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

    // Advanced COGS calculation including Sizes and Addons
    const calculateItemCOGS = (orderItem) => {
        const menuItem = menuMap.get(orderItem.item?.id);
        if (!menuItem) return 0;

        let itemCost = 0;

        // 1. Base Recipe
        (menuItem.recipe || []).forEach(r => {
            const inv = inventoryStatsMap.get(r.ingredientId);
            if (inv) itemCost += (inv.avgCost || 0) * r.quantity;
        });

        // 2. Size Specifics (apply multiplier to base or use specific recipe)
        const sizeOption = orderItem.size;
        if (sizeOption) {
            const sizeLabel = typeof sizeOption === 'string' ? sizeOption : (sizeOption.label || sizeOption.name);
            const menuSize = menuItem.sizes?.find(s => s.label === sizeLabel);
            if (menuSize) {
                const multiplier = menuSize.multiplier || 1.0;
                itemCost *= multiplier; // Multiplier often applies to base cost

                // Add size-specific ingredients
                (menuSize.recipe || []).forEach(r => {
                    const inv = inventoryStatsMap.get(r.ingredientId);
                    if (inv) itemCost += (inv.avgCost || 0) * r.quantity;
                });
            }
        }

        // 3. Addons
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

    // Report Sub-logic (ROI, Tax, Ledger, Audits)
    // --- (Most of these are extracted directly from the research snippets) ---
    
    // ROI Promotion Report
    const memoizedPromotionReport = useMemo(() => {
        const completedOrders = filteredLogs.filter(l => l.type === 'COMPLETED' && l.orderData && l.orderData.appliedPromoCode).slice().reverse();
        if (completedOrders.length === 0) {
            return (
                <tbody className="divide-y divide-gray-50 uppercase text-xs">
                    <tr><td colSpan="7" className="p-6 text-center text-gray-400 italic text-[11px] normal-case">Chưa có dữ liệu khuyến mãi trong thời gian này.</td></tr>
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
            totalRevenue += revenue; totalDiscount += discount; totalGiftCostAgg += giftCost;
            return (
                <tr key={log.orderId} onClick={() => setSelectedLog(log)} className="hover:bg-gray-100 transition-colors cursor-pointer">
                    <td className="p-3 text-gray-500 font-medium">{formatTime(log.timestamp)} <span className="text-[9px] block text-gray-400">{formatDate(log.timestamp)}</span></td>
                    <td className="p-3 font-bold text-brand-500 uppercase tracking-widest">{log.orderId.slice(0, 4)}...</td>
                    <td className="p-3 font-bold text-brand-700">{pCode}</td>
                    <td className="p-3 text-right font-black text-brand-600">{formatVND(revenue)}</td>
                    <td className="p-3 text-right font-bold text-amber-600">{formatVND(discount)}</td>
                    <td className="p-3 text-right font-bold text-amber-700">{formatVND(giftCost)}</td>
                    <td className="p-3 text-right">
                        <div className="font-black text-gray-900">{ratio}%</div>
                        <div className="text-[10px] font-bold text-gray-500 mt-0.5">MẤT: {formatVND(oppCost)}</div>
                    </td>
                </tr>
            );
        });
        const totalOppCost = totalDiscount - totalGiftCostAgg;
        const overallRatio = totalRevenue > 0 ? ((totalGiftCostAgg / totalRevenue) * 100).toFixed(1) : 0;
        return (
            <>
                <tbody className="divide-y divide-gray-50 uppercase text-xs">{rows}</tbody>
                <tfoot className="bg-brand-50/50 font-black text-xs uppercase border-t border-brand-200">
                    <tr>
                        <td colSpan="3" className="p-4 text-right text-brand-800">TỔNG CỘNG ({completedOrders.length} ĐƠN):</td>
                        <td className="p-4 text-right text-brand-600">{formatVND(totalRevenue)}</td>
                        <td className="p-4 text-right text-amber-600">{formatVND(totalDiscount)}</td>
                        <td className="p-4 text-right text-amber-700">{formatVND(totalGiftCostAgg)}</td>
                        <td className="p-4 text-right">
                            <div className="text-gray-900">{overallRatio}%</div>
                            <div className="text-[10px] text-gray-600 mt-1">ĐÁNH ĐỔI CPCH: {formatVND(totalOppCost)}</div>
                        </td>
                    </tr>
                </tfoot>
            </>
        );
    }, [filteredLogs, inventoryStatsMap, settings, setSelectedLog]);

    // ROI Delivery Partner Report
    const memoizedDeliveryPartnerReport = useMemo(() => {
        const appOrders = filteredLogs.filter(l => l.type === 'COMPLETED' && l.orderData && (l.orderData.orderSource === 'GRAB' || l.orderData.orderSource === 'SHOPEE')).slice().reverse();
        if (appOrders.length === 0) {
            return (
                <tbody className="divide-y divide-gray-50 uppercase text-xs">
                    <tr><td colSpan="8" className="p-6 text-center text-gray-400 italic text-[11px] normal-case">Chưa có đơn hàng trên nền tảng trong thời gian này.</td></tr>
                </tbody>
            );
        }
        let totalGross = 0, totalFee = 0, totalNet = 0, totalCOGS = 0, totalProfit = 0;
        const rows = appOrders.map(log => {
            const source = log.orderData.orderSource, gross = parseFloat(log.orderData.price) || 0, fee = parseFloat(log.orderData.partnerFee) || 0;
            const tax = parseFloat(log.orderData.taxAmount) || 0, net = (gross - tax) - fee;
            let cogs = 0;
            (log.orderData.cartItems || []).forEach(item => {
                if (item.item) {
                    (item.item.recipe || []).forEach(r => {
                        const inv = inventoryStatsMap.get(r.ingredientId);
                        if (inv) cogs += (inv.avgCost || 0) * r.quantity * item.count;
                    });
                }
            });
            const profit = net - cogs, marginRatio = net > 0 ? ((profit / net) * 100).toFixed(1) : 0;
            totalGross += gross; totalFee += fee; totalNet += net; totalCOGS += cogs; totalProfit += profit;
            return (
                <tr key={log.orderId} onClick={() => setSelectedLog(log)} className="hover:bg-gray-100 transition-colors cursor-pointer">
                    <td className="p-3 text-gray-500 font-medium">{formatTime(log.timestamp)} <span className="text-[9px] block text-gray-400">{formatDate(log.timestamp)}</span></td>
                    <td className="p-3 font-bold text-brand-500 uppercase tracking-widest">{log.orderId.slice(0, 4)}...</td>
                    <td className={`p-3 font-bold ${source === 'GRAB' ? 'text-[#00B14F]' : 'text-[#EE4D2D]'}`}>{source}</td>
                    <td className="p-3 text-right font-medium text-gray-600">{formatVND(gross)}</td>
                    <td className="p-3 text-right font-medium text-red-500">-{formatVND(fee)}</td>
                    <td className="p-3 text-right font-bold text-brand-600">{formatVND(net)}</td>
                    <td className="p-3 text-right font-bold text-amber-700">{formatVND(cogs)}</td>
                    <td className="p-3 text-right">
                        <div className={`font-black ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatVND(profit)}</div>
                        <div className="text-[10px] font-bold text-gray-400 mt-0.5">Biên: {marginRatio}%</div>
                    </td>
                </tr>
            );
        });
        const overallMargin = totalNet > 0 ? ((totalProfit / totalNet) * 100).toFixed(1) : 0;
        return (
            <>
                <tbody className="divide-y divide-gray-50 uppercase text-xs">{rows}</tbody>
                <tfoot className="bg-orange-50/50 font-black text-xs uppercase border-t border-orange-200">
                    <tr>
                        <td colSpan="3" className="p-4 text-left text-orange-800">TỔNG CỘNG ({appOrders.length} ĐƠN):</td>
                        <td className="p-4 text-left text-gray-600">{formatVND(totalGross)}</td>
                        <td className="p-4 text-left text-red-500">-{formatVND(totalFee)}</td>
                        <td className="p-4 text-left text-brand-600">{formatVND(totalNet)}</td>
                        <td className="p-4 text-left text-amber-700">{formatVND(totalCOGS)}</td>
                        <td className="p-4 text-left">
                            <div className={`${totalProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatVND(totalProfit)}</div>
                            <div className="text-[10px] text-gray-600 mt-1">BIÊN LN: {overallMargin}%</div>
                        </td>
                    </tr>
                </tfoot>
            </>
        );
    }, [filteredLogs, inventoryStatsMap, setSelectedLog]);


    // Master Ledger
    const memoizedMasterLedgerRows = useMemo(() => {
        const logOrderIds = new Set(filteredLogs.map(l => String(l.orderId || l.id)));
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
            if (reportPeriod === 'custom') {
                const start = new Date(customStartDate); start.setHours(0,0,0,0);
                const end = new Date(customEndDate); end.setHours(23,59,59,999);
                const d = new Date(o.timestamp);
                return d >= start && d <= end;
            }
            return true;
        }).map(o => ({ type: 'ACTIVE', orderId: o.id, timestamp: o.timestamp, orderData: o }));
        
        const allEntries = [...filteredLogs, ...activeOrderEntries].sort((a, b) => new Date(b.orderData?.timestamp || b.timestamp).getTime() - new Date(a.orderData?.timestamp || a.timestamp).getTime());
        const rows = allEntries.slice(0, masterLedgerLimit).map((log, idx) => {
            const isCancelled = log.type === 'CANCELLED', isActive = log.type === 'ACTIVE', o = log.orderData || {};
            const timeStart = o.timestamp ? formatTime(o.timestamp) : '--:--', timeEnd = log.timestamp ? formatTime(log.timestamp) : '--:--';
            const source = o.orderSource || 'INSTORE';
            
            // LOGIC TÍNH THUẾ ĐỒNG BỘ:
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
            
            let discount = o.discount || 0, fee = o.partnerFee || 0;
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
                <tr key={idx} onClick={() => setSelectedLog(log)} className={`cursor-pointer transition-colors border-l-4 border-l-transparent hover:border-l-[#007AFF] ${isCancelled ? 'bg-red-50/50' : isActive ? 'bg-amber-50/30' : 'hover:bg-brand-50/30'}`}>
                    <td className="px-5 py-3 font-medium text-brand-500 tracking-widest">{orderIdShort}</td>
                    <td className="px-5 py-3 text-gray-500 font-medium whitespace-nowrap"><div className="flex flex-col gap-1"><div><span className="text-[9px] text-gray-400 uppercase w-6">IN:</span> {timeStart}</div><div><span className="text-[9px] text-gray-400 uppercase w-6">OUT:</span> <span className="text-brand-600">{timeEnd}</span></div></div></td>
                    <td className="px-5 py-3 text-gray-700 max-w-[300px] truncate">{billDetail}</td>
                    <td className="px-5 py-3 font-medium">{source}</td>
                    <td className="px-5 py-3 text-right font-bold">{isCancelled ? '-' : formatVND(gross)}</td>
                    <td className="px-5 py-3 text-right font-medium text-teal-600">{isCancelled ? '-' : formatVND(taxValue)}</td>
                    <td className="px-5 py-3 text-right font-medium text-amber-500">{isCancelled ? '-' : formatVND(discount + fee)}</td>
                    <td className="px-5 py-3 text-right font-medium text-brand-600">{isCancelled ? '-' : formatVND(net)}</td>
                    <td className="px-5 py-3 text-right font-medium text-amber-700">{isCancelled ? '-' : formatVND(cogs)}</td>
                    <td className={`px-5 py-3 text-right font-bold ${isCancelled ? 'text-gray-400' : profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>{isCancelled ? '-' : formatVND(profit)}</td>
                    <td className="px-5 py-3 text-[10px] uppercase font-medium">{log.type}</td>
                </tr>
            );
        });
        return rows;
    }, [filteredLogs, orders, masterLedgerLimit, setSelectedLog, reportPeriod, customStartDate, customEndDate, menuMap, inventoryStatsMap, calculationMode, settings]);

    // Inventory Audits
    const flattenedAuditsList = useMemo(() => {
        const flattened = [];
        (inventoryAudits || []).forEach(audit => {
            if (audit.type === 'PRODUCTION') {
                // 1. Dòng các Nguyên liệu hao hụt (Inputs)
                (audit.inputs || []).forEach((item, idx) => {
                    const qty = item.qty || 0;
                    const diff = -Math.abs(qty); // Luôn là âm cho hao hụt
                    
                    // Fallback theo tên nếu thiếu ID (dữ liệu cũ)
                    const lookupId = item.id || item.ingredientId || nameToIdMap.get((item.name || item.ingredientName || '').toLowerCase().trim());
                    const invStat = inventoryStatsMap.get(lookupId);
                    
                    // Thiệt hại dương = hiện đỏ
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

                // 2. Dòng Bán thành phẩm thu được (Output)
                if (audit.output) {
                    const lookupId = audit.output.id || nameToIdMap.get((audit.output.name || '').toLowerCase().trim());
                    const invStat = inventoryStatsMap.get(lookupId);

                    flattened.push({
                        ...audit,
                        rowId: `${audit.id}-out`,
                        displayIngredientName: audit.output.name,
                        displayDifference: Math.abs(audit.output.qty || 0), // Dương cho thu hồi
                        displayCost: -Math.abs(audit.calculatedCost || 0), // Âm cho thu hồi (hiện xanh)
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
                    
                    // Bán hàng = thiệt hại dương (đỏ), Hoàn đơn = thu hồi âm (xanh)
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

                // Kiểm kê: diff âm = thiệt hại dương (đỏ), diff dương = thu hồi âm (xanh)
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
        // Sort by timestamp newest first
        return flattened.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }, [inventoryAudits, inventoryStatsMap]);


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
        historicalStockLevels.filter(a => a.ingredientId === auditFilterIngredient).forEach(audit => {
            const dateStr = formatDate(audit.timestamp, 'yyyy-mm-dd');
            if (!aggregatedMap[dateStr]) aggregatedMap[dateStr] = { stockAfter: audit.stockAfter, sumDiff: 0 };
            aggregatedMap[dateStr].sumDiff += audit.displayDifference || 0;
            displayUnit = audit.unit || displayUnit;
        });
        const chartData = Object.keys(aggregatedMap).sort().map(d => ({ dateStr: d, stockAfter: aggregatedMap[d].stockAfter, sumDiff: aggregatedMap[d].sumDiff }));
        if (chartData.length === 0) return null;
        return (
            <div className="w-full bg-slate-50 border-b border-gray-100 p-8 flex flex-col items-center">
                <h4 className="text-[11px] font-black uppercase tracking-widest text-amber-700/60 mb-10 flex items-center gap-2"><BarChart3 size={16} /> TỒN KHO LŨY KẾ THEO NGÀY</h4>
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

    const exportToCSV = () => {
        const headers = ['Ma Don', 'Ngay Gio', 'Doanh Thu', 'Giam Gia', 'Thuc Nhan'];
        const rows = filteredLogs.map(l => [l.orderId, formatDate(l.timestamp), l.price, l.orderData?.discount || 0, (parseFloat(l.price) || 0) - (l.orderData?.discount || 0)]);
        const content = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob(["\uFEFF" + content], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `Bao_Cao_${getDateStr()}.csv`; link.click();
    };

    return (
        <motion.section key="reports" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-[10px]" style={{ paddingLeft: '32px', paddingRight: '32px' }}>
            {/* Revenue Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-[10px]">
                {[
                    { label: 'Doanh thu (Kỳ này)', value: formatVND(stats.sales), icon: DollarSign, color: "var(--brand-600)" },
                    { label: 'Công Nợ', value: formatVND(stats.debt), icon: BookOpen, color: "#8b5cf6" },
                    { label: 'Đơn thành công', value: stats.success, icon: ShoppingCart, color: '#34C759' },
                    { label: 'Đơn đã hủy', value: stats.cancelled, icon: XCircle, color: '#FF3B30' },
                ].map(card => (
                    <div key={card.label} className="bg-white p-6 border border-gray-100 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 right-0 opacity-[0.05] pointer-events-none"><card.icon size={100} /></div>
                        <p className="text-[9px] text-gray-400 font-black uppercase tracking-[0.15em] mb-1.5 flex items-center gap-1.5"><span className="w-1.5 h-1.5 inline-block" style={{ backgroundColor: card.color }} /> {card.label}</p>
                        <p className="text-2xl font-black text-gray-900 break-all leading-tight">{card.value}</p>
                    </div>
                ))}
            </div>

            {/* Filter Bar - Sticky */}
            <div className="sticky top-0 z-40 flex justify-between items-center flex-wrap gap-2 bg-white/90 backdrop-blur-md p-2 border border-gray-100 shadow-sm transition-all">
                <div className="flex flex-wrap items-center gap-1">
                    {['today', 'week', 'month', 'quarter', 'all', 'custom'].map(p => (
                        <button key={p} onClick={() => setReportPeriod(p)} className={`px-4 md:px-6 py-2 lg:py-3 font-black text-xs uppercase tracking-widest transition-all ${reportPeriod === p ? 'bg-gray-900 text-white shadow-lg' : 'text-gray-400 hover:bg-gray-50'}`}>
                            {p === 'today' ? 'Hôm nay' : p === 'week' ? '7 ngày' : p === 'month' ? 'Tháng này' : p === 'quarter' ? 'Quý này' : p === 'all' ? 'Tất cả' : 'Tùy chỉnh'}
                        </button>
                    ))}
                    {reportPeriod === 'custom' && (
                        <div className="flex items-center gap-2 ml-2">
                            <input type="date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} className="px-3 py-1.5 border border-gray-200 text-sm font-bold bg-gray-50 rounded-none shadow-sm focus:outline-none focus:ring-1 focus:ring-gray-900" />
                            <span className="text-gray-400 font-bold">-</span>
                            <input type="date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} className="px-3 py-1.5 border border-gray-200 text-sm font-bold bg-gray-50 rounded-none shadow-sm focus:outline-none focus:ring-1 focus:ring-gray-900" />
                        </div>
                    )}
                </div>
                {hasPermission('reports', 'edit') && (
                    <button onClick={exportToCSV} className="flex items-center gap-2 bg-brand-50 text-brand-600 px-6 py-2 lg:py-3 font-black text-xs uppercase tracking-widest hover:bg-brand-100 transition-all border border-brand-100">
                        <FileUp size={16} /> XUẤT CSV
                    </button>
                )}
            </div>

            {/* Promotion ROI */}
            {settings?.enablePromotions && (
                <div className="bg-white border border-slate-100 shadow-sm overflow-hidden rounded-none">
                    <div className="p-5 border-b border-slate-100 flex items-center bg-slate-50 gap-4"><Gift size={16} className="text-brand-600" /><h3 className="font-bold text-sm text-slate-800">Hiệu quả Khuyến Mãi (ROI)</h3></div>
                    <div className="overflow-x-auto"><table className="w-full text-left border-collapse"><thead><tr className="bg-gray-50 border-b border-gray-100"><th className="p-3 text-[10px] uppercase font-black text-gray-400">Thời gian</th><th className="p-3 text-[10px] uppercase font-black text-gray-400">Mã đơn</th><th className="p-3 text-[10px] uppercase font-black text-gray-400">Chương trình</th><th className="p-3 text-[10px] uppercase font-black text-gray-400 text-right">Doanh thu</th><th className="p-3 text-[10px] uppercase font-black text-gray-400 text-right">Giảm giá</th><th className="p-3 text-[10px] uppercase font-black text-gray-400 text-right">Giá trị quà</th><th className="p-3 text-[10px] uppercase font-black text-gray-400 text-right">Tỉ lệ</th></tr></thead>{memoizedPromotionReport}</table></div>
                </div>
            )}

            {/* Tax Report Section */}
            <TaxReportSection 
                logs={(report?.logs || []).filter(l => l.type === 'COMPLETED')}
                settings={settings}
                hasPermission={hasPermission}
                calculationMode={calculationMode}
                setCalculationMode={setCalculationMode}
            />

            {/* Master Ledger */}
            <div className="bg-white border border-slate-100 shadow-sm overflow-hidden rounded-none mt-4">
                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50"><div className="flex items-center gap-3"><ClipboardList size={16} className="text-brand-600" /><h3 className="font-bold text-sm text-slate-800">Sổ Hóa Đơn Chi Tiết (Master Ledger)</h3></div><span className="text-[10px] font-bold text-brand-600 tracking-wider bg-brand-50 px-3 py-1">Real-time</span></div>
                <div className="overflow-auto max-h-[600px] custom-scrollbar" onScroll={(e) => { if (e.target.scrollHeight - e.target.scrollTop - e.target.clientHeight < 150) setMasterLedgerLimit(prev => prev + 50); }}><table className="w-full text-left border-collapse min-w-[1200px]"><thead className="sticky top-0 bg-gray-50 z-10 shadow-sm"><tr><th className="px-5 py-4 text-[10px] uppercase font-bold text-gray-400">Mã Đơn</th><th className="px-5 py-4 text-[10px] uppercase font-bold text-gray-400">Thời Gian</th><th className="px-5 py-4 text-[10px] uppercase font-bold text-gray-400">Chi Tiết</th><th className="px-5 py-4 text-[10px] uppercase font-bold text-gray-400">Nguồn</th><th className="px-5 py-4 text-[10px] uppercase font-bold text-gray-400 text-right">Tổng</th><th className="px-5 py-4 text-[10px] uppercase font-bold text-gray-400 text-right">Thuế</th><th className="px-5 py-4 text-[10px] uppercase font-bold text-gray-400 text-right">KM/Phí</th><th className="px-5 py-4 text-[10px] uppercase font-bold text-gray-400 text-right">Thuần</th><th className="px-5 py-4 text-[10px] uppercase font-bold text-gray-400 text-right">COGS</th><th className="px-5 py-4 text-[10px] uppercase font-bold text-gray-400 text-right">LN Gộp</th><th className="px-5 py-4 text-[10px] uppercase font-bold text-gray-400">Trạng Thái</th></tr></thead><tbody className="divide-y divide-gray-50 uppercase text-xs">{memoizedMasterLedgerRows}</tbody></table></div>
            </div>

            {/* Inventory Audits */}
            <div className="bg-white border border-slate-100 shadow-sm overflow-hidden rounded-none mt-4">
                <div className="p-5 border-b border-slate-100 bg-slate-50 flex gap-4"><button onClick={() => setAuditReportTab('history')} className={`pb-2 font-bold text-[13px] border-b-2 ${auditReportTab === 'history' ? 'text-brand-700 border-brand-500' : 'text-slate-400 border-transparent'}`}>Lịch Sử Hao Hụt Máy Pha</button><button onClick={() => setAuditReportTab('manual')} className={`pb-2 font-bold text-[13px] border-b-2 ${auditReportTab === 'manual' ? 'text-brand-700 border-brand-500' : 'text-slate-400 border-transparent'}`}>Lịch Sử Kiểm Kê Kho</button></div>
                {chartContent}
                <div className="overflow-auto max-h-[400px] custom-scrollbar" onScroll={(e) => { if (e.target.scrollHeight - e.target.scrollTop - e.target.clientHeight < 150) setAuditLimit(p => p + 50); }}><table className="w-full text-left"><thead><tr className="bg-slate-50 text-[10px] uppercase font-bold text-gray-500"><th className="px-6 py-4">Thời gian</th><th className="px-6 py-4">Nguyên liệu</th><th className="px-6 py-4">Biến động</th><th className="px-6 py-4">Thiệt hại</th><th className="px-6 py-4">Lý do</th></tr></thead><tbody className="divide-y divide-gray-100">{(memoizedDisplayAudits || []).slice(0, auditLimit).map((a, i) => (<tr key={i} onClick={() => { if (a.orderId) { const logEntry = report.logs.find(l => l.orderId === a.orderId) || { orderId: a.orderId, timestamp: a.timestamp, type: 'ORDER_INFO', orderData: orders.find(o => o.id === a.orderId) }; setSelectedLog(logEntry); } }} className={`hover:bg-amber-50/40 text-[12px] ${a.orderId ? 'cursor-pointer' : ''}`}><td className="px-6 py-4">{formatDate(a.timestamp)}</td><td className="px-6 py-4">{a.displayIngredientName}</td><td className={`px-6 py-4 font-bold ${a.displayDifference < 0 ? 'text-red-500' : 'text-brand-500'}`}>{a.displayDifference > 0 ? '+' : ''}{a.displayDifference} {a.displayUnit}</td><td className={`px-6 py-4 font-bold ${a.displayCost > 0 ? 'text-red-500' : 'text-brand-600'}`}>{a.displayCost < 0 ? '+' : ''}{formatVND(Math.abs(a.displayCost))}</td><td className="px-6 py-4 italic">{a.displayReason}</td></tr>))}</tbody></table></div>
            </div>

            <FixedCostsSection 
                costs={report?.fixedCosts || {}} onUpdate={updateFixedCosts} menu={menu} 
                inventoryStats={inventoryStats} inventoryStatsMap={inventoryStatsMap}
                shifts={shifts} staff={staff} 
                reportPeriod={reportPeriod} report={report} bepMode={bepMode} 
                setBepMode={setBepMode} expenses={expenses} hasPermission={hasPermission} 
                calculateItemCOGS={calculateItemCOGS} totalCOGS={totalCOGS}
                filteredLogs={filteredLogs} stats={stats}
            />

            <BusinessAnalyticsSection
                filteredLogs={filteredLogs}
                stats={stats}
                totalCOGS={totalCOGS}
                menu={menu}
                inventoryStatsMap={inventoryStatsMap}
                calculateItemCOGS={calculateItemCOGS}
                fixedCosts={report?.fixedCosts || {}}
                expenses={expenses}
                shifts={shifts}
                staff={staff}
            />
        </motion.section>
    );
};

export default ReportsTab;
