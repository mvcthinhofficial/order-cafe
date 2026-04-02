import React, { useState, useMemo } from 'react';
import { DollarSign, Settings, ShoppingCart, Calculator, ChevronUp, ChevronDown, CheckCircle, AlertTriangle, TrendingUp, TrendingDown, LineChart, Search, Edit2, X, PieChart, Info } from 'lucide-react';
import { formatVND } from '../../../utils/dashboardUtils';

const FixedCostItem = ({ label, value, onEdit, isEditing, tempValue, setTempValue, onSave, onCancel, icon: Icon, percentage, totalRevenue, isActual = false, subValueLabel }) => (
    <div className="flex flex-col gap-2 group" style={{ padding: '12px 16px', background: '#f8fafc', borderRadius: 'var(--radius-badge)', border: '1px solid transparent', transition: 'all 0.2s' }}>
        <div className="flex justify-between items-start">
            <div className="space-y-1">
                <span className={`text-[10px] font-black ${isActual ? 'text-blue-500' : 'text-gray-400'} uppercase flex items-center gap-2 tracking-wider`}>
                    {Icon && <Icon size={12} />}
                    {label}
                </span>
                {subValueLabel && <p className="text-[9px] font-bold text-gray-400 italic lowercase">{subValueLabel}</p>}
                <div className="flex items-center gap-2">
                    {isEditing ? (
                        <div className="flex items-center gap-1.5 bg-white shadow-sm" style={{ padding: '4px', borderRadius: 'var(--radius-badge)', border: '1px solid var(--brand-200)' }}>
                            <input
                                type="number"
                                value={tempValue}
                                onChange={(e) => setTempValue(e.target.value)}
                                className="w-24 text-[13px] font-black focus:outline-none bg-transparent"
                                autoFocus
                            />
                            <button onClick={onSave} className="text-green-600 hover:scale-110 transition-transform"><CheckCircle size={14} /></button>
                            <button onClick={onCancel} className="text-gray-400 hover:scale-110 transition-transform"><X size={14} /></button>
                        </div>
                    ) : (
                        <div className="flex items-baseline gap-2">
                            <span className={`text-lg font-black tracking-tight ${isActual ? 'text-blue-600' : 'text-gray-800'}`}>{formatVND(value)}</span>
                            {isActual && <span className="text-[8px] font-black bg-blue-100 text-blue-600 px-1.5 py-0.5 uppercase" style={{ borderRadius: '99px' }}>Thực tế</span>}
                            {!isActual && (
                                <button onClick={onEdit} className="opacity-100 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 text-gray-300 hover:text-brand-600 transition-all">
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
            <div className="w-full h-1 bg-gray-200 overflow-hidden" style={{ borderRadius: '99px' }}>
                <div 
                    className={`h-full transition-all duration-1000 ${percentage > 15 ? 'bg-red-500' : percentage > 8 ? 'bg-amber-400' : 'bg-brand-500'}`} 
                    style={{ width: `${Math.min(100, (value / totalRevenue) * 100)}%`, borderRadius: '99px' }} 
                />
            </div>
        )}
    </div>
);

const FixedCostsSection = ({ costs = {}, onUpdate, menu, inventoryStats, inventoryStatsMap = new Map(), report, bepMode, setBepMode, shifts = [], staff = [], reportPeriod = 'month', expenses = [], calculateItemCOGS, totalCOGS = 0, filteredLogs = [], stats = {}, hasPermission = () => true }) => {
    const [editingKey, setEditingKey] = useState(null);
    const [tempVal, setTempVal] = useState('');
    const [selectedItem, setSelectedItem] = useState('');
    const [bepBasis, setBepBasis] = useState('fixed'); // 'fixed' or 'opex'
    const [costMode, setCostMode] = useState('manual'); // 'manual' or 'actual'
    const [showDetailedBEP, setShowDetailedBEP] = useState(false);

    const handleSave = (key) => {
        onUpdate({ ...costs, [key]: parseFloat(tempVal) || 0 });
        setEditingKey(null);
    };

    // Calculate Dynamic Salaries
    const dynamicSalaries = useMemo(() => {
        if (!costs.useDynamicSalaries) return 0;
        let total = 0;
        (shifts || []).forEach(s => {
            const st = staff.find(p => p.id === s.staffId);
            if (st && st.salary) {
                const hours = (new Date(s.endTime) - new Date(s.startTime)) / 3600000;
                total += (st.salary * hours);
            }
        });
        return total;
    }, [costs.useDynamicSalaries, shifts, staff]);


    // Current Month Expenses for OPEX
    const currentMonthExpenses = useMemo(() => {
        const now = new Date();
        const curM = now.getMonth();
        const curY = now.getFullYear();
        return expenses.filter(e => {
            const d = new Date(e.timestamp);
            if (isNaN(d.getTime())) return true;
            return d.getMonth() === curM && d.getFullYear() === curY;
        });
    }, [expenses]);

    const totalIncurredExpenses = currentMonthExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

    const actualRent = useMemo(() => {
        return currentMonthExpenses
            .filter(e => {
                const name = (e.name || '').toLowerCase();
                const cat = (e.category || '').toLowerCase();
                return cat.includes('mặt bằng') || name.includes('mặt bằng') || name.includes('thuê') || name.includes('tiền nhà');
            })
            .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    }, [currentMonthExpenses]);

    const allCapExExpenses = useMemo(() => {
        return expenses.filter(e => {
            const name = (e.name || '').toLowerCase();
            const cat = (e.category || '').toLowerCase();
            return cat.includes('máy móc') || cat.includes('đầu tư') || name.includes('máy móc') || name.includes('khấu hao') || name.includes('thiết bị');
        });
    }, [expenses]);

    const actualOtherExpenses = useMemo(() => {
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
    const rawForecastMachines = (costs.machines || 0);
    const depreciationMonths = costs.machineDepreciationMonths || 1;
    
    const activeMachines = useMemo(() => {
        if (costMode !== 'actual') return rawForecastMachines / depreciationMonths;

        const now = new Date();
        const curAbsMonth = now.getFullYear() * 12 + now.getMonth(); 

        return allCapExExpenses.reduce((sum, e) => {
            const expDate = new Date(e.timestamp || e.date);
            if (isNaN(expDate.getTime())) return sum; 
            const expAbsMonth = expDate.getFullYear() * 12 + expDate.getMonth();
            const monthsElapsed = curAbsMonth - expAbsMonth; 
            if (monthsElapsed >= 0 && monthsElapsed < depreciationMonths) {
                return sum + (parseFloat(e.amount) || 0) / depreciationMonths;
            }
            return sum;
        }, 0);
    }, [costMode, rawForecastMachines, depreciationMonths, allCapExExpenses]);
    const activeSalaries = (costMode === 'actual' || costs.useDynamicSalaries) ? dynamicSalaries : (costs.salaries || 0);

    const totalFixed = activeRent + activeMachines + activeSalaries;
    const totalVariable = costMode === 'actual' 
        ? actualOtherExpenses 
        : ((costs.electricity || 0) + (costs.water || 0) + (costs.other || 0) + totalIncurredExpenses);
    
    const totalOPEX = totalFixed + totalVariable;

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
    }, [report, menu, inventoryStats, calculateItemCOGS]);

    const menuBEPStats = useMemo(() => {
        const statsMap = new Map();
        
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
            const mixPercentage = totalActualQty > 0 ? (s.actualQty / totalActualQty) : (1 / (menu.length || 1));
            const individualBEP = s.margin > 0 ? Math.ceil(basisValue / s.margin) : Infinity;
            return { ...s, mixPercentage, individualBEP };
        }).sort((a, b) => b.actualQty - a.actualQty);
    }, [filteredLogs, menu, inventoryStatsMap, totalFixed, totalOPEX, bepBasis, calculateItemCOGS]);

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
            
            const mockOrderItem = { item: item, count: 1, size: item.sizes?.[0]?.label };
            itemCost = calculateItemCOGS(mockOrderItem);
            sellingPrice = (parseFloat(item.price) || 0) + (item.sizes?.[0]?.priceAdjust || 0);
        }

        const margin = sellingPrice - itemCost;
        const basisValue = bepBasis === 'fixed' ? totalFixed : totalOPEX;
        const monthlyQty = margin > 0 ? Math.ceil(basisValue / margin) : Infinity;
        const dailyQty = margin > 0 ? Math.ceil(monthlyQty / 30) : Infinity;

        return { margin, monthlyQty, dailyQty, sellingPrice, itemCost };
    }, [bepMode, selectedItem, stats30Days, totalFixed, totalOPEX, bepBasis, menu, inventoryStats, weightedAveragePrice, weightedAverageCost, calculateItemCOGS]);

    const overallBEP = useMemo(() => {
        const basisValue = bepBasis === 'fixed' ? totalFixed : totalOPEX;
        return weightedMargin > 0 ? Math.ceil(basisValue / weightedMargin) : 0;
    }, [weightedMargin, totalFixed, totalOPEX, bepBasis]);

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
    
    const actualNetProfit = stats.sales - totalCOGS - (totalOPEX * (daysInPeriod / 30));
    const actualNetMargin = stats.sales > 0 ? (actualNetProfit / stats.sales) * 100 : 0;

    const normalizedPeriodFixed = (totalFixed / 30) * daysInPeriod;
    const periodActualNetProfit = stats.sales - totalCOGS - (normalizedPeriodFixed + (totalVariable / 30 * daysInPeriod));
    const periodActualNetMargin = stats.sales > 0 ? (periodActualNetProfit / stats.sales) * 100 : 0;

    const normalizedRentForPct     = (activeRent      / 30) * daysInPeriod;
    const normalizedMachinesForPct = (activeMachines  / 30) * daysInPeriod;
    const normalizedSalariesForPct = (activeSalaries  / 30) * daysInPeriod;
    const periodLabel = daysInPeriod < 30 ? `Phân bổ ${daysInPeriod} ngày: ` : null;

    return (
        <div className="bg-white border border-gray-100 shadow-xl overflow-hidden mt-6" style={{ borderRadius: 'var(--radius-card)' }}>
            <div className="border-b border-gray-100 flex justify-between items-center bg-slate-900 text-white relative" style={{ padding: '20px 24px' }}>
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
                <div className="xl:col-span-4 space-y-5" style={{ padding: '20px 24px' }}>
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
                        <FixedCostItem label="Phí Mặt bằng / Cố định" value={activeRent} isActual={costMode === 'actual'} isEditing={editingKey === 'rent'} tempValue={tempVal} setTempValue={setTempVal} onEdit={() => { setEditingKey('rent'); setTempVal(costs.rent); }} onSave={() => handleSave('rent')} onCancel={() => setEditingKey(null)} icon={DollarSign} percentage={(normalizedRentForPct / (stats.sales || 1)) * 100} totalRevenue={stats.sales} subValueLabel={periodLabel ? `${periodLabel}${formatVND(normalizedRentForPct)}` : null} />
                        
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
                                percentage={(normalizedMachinesForPct / (stats.sales || 1)) * 100} 
                                totalRevenue={stats.sales}
                                subValueLabel={depreciationMonths > 1 ? `Chia cho ${depreciationMonths} tháng khấu hao${periodLabel ? ` · ${periodLabel}${formatVND(normalizedMachinesForPct)}` : ''}` : periodLabel ? `${periodLabel}${formatVND(normalizedMachinesForPct)}` : null}
                            />
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
                                <div className="flex bg-gray-50 border border-gray-100" style={{ padding: '2px', borderRadius: 'var(--radius-badge)' }}>
                                    <button onClick={() => onUpdate({ ...costs, useDynamicSalaries: false })} className={`px-2 py-1 text-[8px] font-black uppercase ${!costs.useDynamicSalaries && costMode !== 'actual' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-400'}`} style={{ borderRadius: 'var(--radius-badge)' }} disabled={costMode === 'actual'}>Nhập tay</button>
                                    <button onClick={() => onUpdate({ ...costs, useDynamicSalaries: true })} className={`px-2 py-1 text-[8px] font-black uppercase ${costs.useDynamicSalaries || costMode === 'actual' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-400'}`} style={{ borderRadius: 'var(--radius-badge)' }} disabled={costMode === 'actual'}>Auto (Ca)</button>
                                </div>
                            </div>
                            <FixedCostItem label={(costs.useDynamicSalaries || costMode === 'actual') ? "Tổng lương (Tạm tính)" : "Quỹ lương dự tính"} value={activeSalaries} isActual={costMode === 'actual' || costs.useDynamicSalaries} isEditing={editingKey === 'salaries'} tempValue={tempVal} setTempValue={setTempVal} onEdit={() => { if (!costs.useDynamicSalaries && costMode !== 'actual') { setEditingKey('salaries'); setTempVal(costs.salaries); } }} onSave={() => handleSave('salaries')} onCancel={() => setEditingKey(null)} icon={ShoppingCart} percentage={(normalizedSalariesForPct / (stats.sales || 1)) * 100} totalRevenue={stats.sales} subValueLabel={periodLabel ? `${periodLabel}${formatVND(normalizedSalariesForPct)}` : null} />
                        </div>
                    </div>

                    <div className="border-l-4 border-red-500" style={{ marginTop: '20px', padding: '16px 20px', background: '#0f172a', borderRadius: '0 var(--radius-badge) var(--radius-badge) 0' }}>
                        <div className="flex justify-between items-baseline">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Tổng chi cố định</span>
                            <span className="text-2xl font-black text-white">{formatVND(totalFixed)}</span>
                        </div>
                        <p className="text-[9px] text-gray-500 font-bold uppercase mt-1 italic">* Tương đương {formatVND(totalFixed/30)} / ngày</p>
                    </div>
                </div>

                <div className="xl:col-span-4 bg-gray-50/50 relative" style={{ padding: '20px 24px' }}>
                    <div className="flex justify-between items-center" style={{ marginBottom: '16px' }}>
                        <h4 className="text-[11px] font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
                            <Calculator size={14} className="text-gray-400" />
                            Toán học Hòa vốn
                        </h4>
                        <button onClick={() => setShowDetailedBEP(!showDetailedBEP)} className="text-[10px] font-black text-brand-600 hover:bg-brand-50 transition-all flex items-center gap-1" style={{ padding: '4px 10px', borderRadius: 'var(--radius-btn)', border: '1px solid var(--brand-200)' }}>
                            {showDetailedBEP ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
                            {showDetailedBEP ? 'Đóng bảng' : 'Chi tiết'}
                        </button>
                    </div>

                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-1 bg-white border border-gray-200" style={{ padding: '3px', borderRadius: 'var(--radius-badge)'}}>
                            <button onClick={() => setBepBasis('fixed')} className={`py-1.5 text-[10px] font-black uppercase ${bepBasis === 'fixed' ? 'bg-gray-900 text-white shadow-lg' : 'text-gray-400'}`} style={{ borderRadius: 'var(--radius-badge)' }}>Cố định</button>
                            <button onClick={() => setBepBasis('opex')} className={`py-1.5 text-[10px] font-black uppercase ${bepBasis === 'opex' ? 'bg-gray-900 text-white shadow-lg' : 'text-gray-400'}`} style={{ borderRadius: 'var(--radius-badge)' }}>Tổng Vận hành</button>
                        </div>

                        {!showDetailedBEP ? (
                            <div className="animate-in fade-in duration-300 space-y-4">
                                <div className="flex items-center gap-1 bg-white border border-gray-100 overflow-hidden shadow-sm" style={{ padding: '3px', borderRadius: 'var(--radius-badge)' }}>
                                    <button onClick={() => setBepMode('average')} className={`flex-1 py-1.5 text-[9px] font-black uppercase transition-all ${bepMode === 'average' ? 'bg-brand-500 text-white' : 'text-gray-400 hover:bg-gray-50'}`} style={{ borderRadius: 'var(--radius-badge)' }}>Bình quân</button>
                                    <button onClick={() => setBepMode('item')} className={`flex-1 py-1.5 text-[9px] font-black uppercase transition-all ${bepMode === 'item' ? 'bg-brand-500 text-white' : 'text-gray-400 hover:bg-gray-50'}`} style={{ borderRadius: 'var(--radius-badge)' }}>Chọn món</button>
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
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="bg-white border-l-2 border-l-gray-300" style={{ padding: '12px', borderRadius: '0 var(--radius-badge) var(--radius-badge) 0' }}>
                                                <p className="text-[9px] text-gray-400 font-black uppercase">Giá vốn (COGS)</p>
                                                <p className="font-black text-gray-600 italic mt-0.5">{formatVND(bepResult.itemCost)}</p>
                                            </div>
                                            <div className="bg-white border-l-2 border-l-brand-500" style={{ padding: '12px', borderRadius: '0 var(--radius-badge) var(--radius-badge) 0' }}>
                                                <p className="text-[9px] text-gray-400 font-black uppercase">Biên LN Gộp</p>
                                                <p className="font-black text-brand-600 mt-0.5">{formatVND(bepResult.margin)}</p>
                                            </div>
                                        </div>
                                        
                                        <div className="bg-brand-600 shadow-xl relative overflow-hidden group hover:scale-[1.02] transition-transform cursor-pointer" style={{ padding: '20px 24px', borderRadius: 'var(--radius-card)' }}>
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

                <div className="xl:col-span-4 bg-gradient-to-br from-gray-900 to-black text-white flex flex-col justify-between relative" style={{ padding: '20px 24px' }}>
                    <PieChart size={200} className="absolute -right-20 -bottom-20 opacity-5 text-brand-500" />
                    
                    <div className="relative z-10 space-y-8">
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

                    <div className="relative z-10 flex items-center gap-3 bg-white/5 border border-white/10" style={{ marginTop: '24px', padding: '14px 16px', borderRadius: 'var(--radius-badge)' }}>
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

export default FixedCostsSection;
