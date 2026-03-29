import React, { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    FileUp, Plus, RefreshCw, CheckCircle, ArrowDownLeft, ArrowUpRight,
    Database, Download, Upload, Trash2, CheckCircle2, Pencil,
    ChevronUp, ChevronDown, ArrowRightLeft, BarChart3, Edit2, X,
    DollarSign, Merge, Info
} from 'lucide-react';
import '../AdminDashboard.css';

const InventoryTab = ({
    // Data
    inventory,
    inventoryStats,
    inventoryAudits,
    imports,
    expenses,
    inventorySummary,
    inventoryStatsMapping,
    menuIngredientsInUse,
    memoizedProductionMap,

    // States
    inventorySubTab,
    inventoryReportMode,
    inventoryPeriod,
    calType,
    selectedMonth,
    selectedQuarter,
    selectedYear,
    showImportTrash,
    selectedMergeItems,
    editingIngId,
    editingIngName,
    isLoadingMoreImports,
    hasMoreImports,
    setIsLoadingMoreImports,
    userRole,
    cfStatus,
    settings,

    // Parent Setters
    setInventorySubTab,
    setInventoryReportMode,
    setInventoryPeriod,
    setCalType,
    setSelectedMonth,
    setSelectedQuarter,
    setSelectedYear,
    setShowImportTrash,
    setSelectedMergeItems,
    setEditingIngId,
    setEditingIngName,
    setEditExpense,
    setEditImport,
    setShowProductionModal,
    setShowAuditModal,
    setShowMergeModal,
    setViewingIngredientStats,
    setEditInventory,
    setProductionOutputItem,
    setProductionOutputUnit,
    setProductionOutputQty,
    setProductionInputs,
    setInventory,
    setExpenses,
    setImports,
    setImportsPage,
    setHasMoreImports,

    // Helpers
    formatVND,
    hasPermission,
    showToast,
    fetchData,
    SERVER_URL,
    isInputFocused,
    generateCSV,
    parseCSV
}) => {
    const importsSentinelRef = useRef(null);

    // --- Migrated Logic ---

    const handleRenameIngredient = async (ingredientId, newName) => {
        if (!newName.trim()) return;
        try {
            const token = localStorage.getItem('authToken');
            const res = await fetch(`${SERVER_URL}/api/inventory/${ingredientId}/name`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ name: newName })
            });

            if (res.ok) {
                showToast('Đã đổi tên nguyên liệu!', 'success');
                setEditingIngId(null);
                fetchData();
            } else {
                const err = await res.json();
                showToast(err.error || 'Lỗi đổi tên', 'error');
            }
        } catch (e) {
            showToast('Lỗi kết nối', 'error');
        }
    };

    const handleDeleteImport = async (importId) => {
        if (!confirm('Bạn có chắc muốn xóa phiếu nhập này? Khoản tồn kho tương ứng sẽ bị trừ đi.')) return;
        try {
            const token = localStorage.getItem('authToken');
            const res = await fetch(`${SERVER_URL}/api/imports/${importId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                showToast('Đã xóa phiếu nhập!', 'success');
                setImports(prev => prev.filter(imp => imp.id !== importId));
                fetchData();
            } else {
                const err = await res.json();
                showToast(err.error || 'Lỗi khi xóa', 'error');
            }
        } catch (e) {
            showToast('Lỗi kết nối', 'error');
        }
    };

    const moveIngredientUp = (index) => {
        if (index === 0) return;
        const newInv = [...inventory];
        [newInv[index - 1], newInv[index]] = [newInv[index], newInv[index - 1]];
        setInventory(newInv);
        // Persist order if needed, or wait for explicit save
    };

    const moveIngredientDown = (index) => {
        if (index === inventory.length - 1) return;
        const newInv = [...inventory];
        [newInv[index + 1], newInv[index]] = [newInv[index], newInv[index + 1]];
        setInventory(newInv);
    };

    const handleDownloadInventoryTemplate = () => {
        const headers = [
            "Tên nguyên liệu (*)",
            "Đơn vị lưu kho gốc của NL",
            "Đơn vị lúc mua hàng (VD: Thùng, Bao, Két)",
            "Tỷ lệ quy đổi (VD: 1 Thùng = 24 Lon -> Điền 24)",
            "Số lượng Thùng/Bao vừa nhập",
            "Giá mua tính trên mỗi Thùng/Bao",
            "Mức tồn kho tối thiểu để cảnh báo"
        ];
        const rows = [
            ["Cà phê hạt", "g", "Bao", "5000", "2", "850000", "2000"],
            ["Sữa đặc", "g", "Thùng", "380", "1", "950000", "5"],
            ["Đá bi", "kg", "Bao", "10", "5", "15000", "2"]
        ];

        const csvContent = "\uFEFF" + generateCSV([headers, ...rows]);
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Mau_Nhap_Kho_${new Date().toLocaleDateString()}.csv`);
        link.click();
    };

    const handleImportInventoryCSV = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            const text = event.target.result;
            const rows = parseCSV(text);
            if (rows.length <= 1) return;

            const data = rows.slice(1).map(cols => {
                if (cols.length < 2) return null;
                return {
                    name: cols[0],
                    baseUnit: cols[1],
                    importUnit: cols[2] || '',
                    volumePerUnit: parseFloat(cols[3]) || 1,
                    importQuantity: parseFloat(cols[4]) || 0,
                    costPerImportUnit: parseFloat(cols[5]) || 0,
                    minStock: parseFloat(cols[6]) || 0
                };
            }).filter(Boolean);

            try {
                const token = localStorage.getItem('authToken');
                const res = await fetch(`${SERVER_URL}/api/inventory/import-csv`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ items: data })
                });
                if (res.ok) {
                    showToast('Đã import dữ liệu thành công!', 'success');
                    fetchData();
                } else {
                    const err = await res.json();
                    alert(`Lỗi khi import: ${err.error || 'Vui lòng kiểm tra định dạng file.'}`);
                }
            } catch (err) {
                alert('Lỗi kết nối server.');
            }
        };
        reader.readAsText(file);
    };

    const deleteInventory = async (id) => {
        if (!confirm('Bạn có chắc muốn xóa nguyên liệu này? Dữ liệu lịch sử sẽ được giữ lại nhưng không thể nhập kho thêm.')) return;
        try {
            const token = localStorage.getItem('authToken');
            const res = await fetch(`${SERVER_URL}/api/inventory/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                setInventory(prev => prev.filter(i => i.id !== id));
                showToast('Đã xóa nguyên liệu!', 'success');
            }
        } catch (e) { }
    };

    const deleteExpense = async (id) => {
        if (!confirm('Bạn có chắc muốn xóa khoản chi này?')) return;
        try {
            const token = localStorage.getItem('authToken');
            const res = await fetch(`${SERVER_URL}/api/expenses/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                setExpenses(prev => prev.filter(e => e.id !== id));
                showToast('Đã xóa khoản chi!', 'success');
            }
        } catch (e) { }
    };

    const resetAndFetchImports = async (trashMode) => {
        try {
            const token = localStorage.getItem('authToken');
            const headers = { 'Authorization': `Bearer ${token}` };
            const res = await fetch(`${SERVER_URL}/api/imports?page=1&limit=20&showTrash=${trashMode}&period=${inventoryPeriod}`, { headers });
            const data = await res.json();
            setImports(data);
            setImportsPage(1);
            setHasMoreImports(data.length === 20);
        } catch (e) {
            console.error("Failed to reset imports:", e);
        }
    };

    useEffect(() => {
        resetAndFetchImports(showImportTrash);
    }, [inventoryPeriod, inventoryReportMode, calType, selectedMonth, selectedYear, showImportTrash]);

    const fetchMoreImports = async () => {
        if (isLoadingMoreImports || !hasMoreImports) return;
        setIsLoadingMoreImports(true);
        try {
            const nextPage = (imports.length / 20) + 1; // Simple calc if setImportsPage is not passed perfectly
            const token = localStorage.getItem('authToken');
            const res = await fetch(`${SERVER_URL}/api/imports?page=${nextPage}&limit=20&showTrash=${showImportTrash}&period=${inventoryPeriod}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.length > 0) {
                setImports(prev => {
                    const newItems = data.filter(newItem => !prev.find(p => p.id === newItem.id));
                    return [...prev, ...newItems];
                });
                setImportsPage(prev => prev + 1);
            }
            if (data.length < 20) setHasMoreImports(false);
        } catch (e) {
            console.error("Failed to fetch more imports:", e);
        } finally {
            setIsLoadingMoreImports(false);
        }
    };

    // --- Intersection Observer for Lazy Loading Imports ---
    React.useEffect(() => {
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                fetchMoreImports();
            }
        }, { threshold: 0.1 });

        if (importsSentinelRef.current) observer.observe(importsSentinelRef.current);
        return () => observer.disconnect();
    }, [imports.length, hasMoreImports, isLoadingMoreImports, showImportTrash, inventoryPeriod]);

    return (
        <motion.section key="inventory" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} className="space-y-6" style={{ paddingLeft: '32px', paddingRight: '32px' }}>
            {/* Toolbar */}
            <div className="flex justify-between items-center gap-2 border-b border-gray-200 pb-4">
                <div>
                    <h3 className="text-xl font-black text-gray-900">Chi phí & Kho</h3>
                    <div className="flex gap-6 mt-4 items-center">
                        <button onClick={() => setInventorySubTab('import')} className={`font-black text-sm pb-2 border-b-2 transition-all ${inventorySubTab === 'import' ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                            LỊCH SỬ NHẬP KHO
                        </button>
                        <button onClick={() => setInventorySubTab('raw')} className={`font-black text-sm pb-2 border-b-2 transition-all ${inventorySubTab === 'raw' ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                            NGUYÊN LIỆU ({inventory.length})
                        </button>
                        <button onClick={() => setInventorySubTab('fixed')} className={`font-black text-sm pb-2 border-b-2 transition-all ${inventorySubTab === 'fixed' ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                            ĐẦU TƯ & CHI PHÍ
                        </button>
                        {hasPermission('inventory', 'view') && (
                            <button
                                onClick={() => {
                                    const nextVal = !showImportTrash;
                                    setShowImportTrash(nextVal);
                                    resetAndFetchImports(nextVal);
                                }}
                                className={`text-[10px] uppercase font-black px-3 py-1 mb-2 ml-2 rounded-none transition-all ${showImportTrash ? 'bg-red-50 text-red-500 shadow-sm' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'}`}
                            >
                                {showImportTrash ? 'DANH SÁCH CHÍNH' : 'THÙNG RÁC'}
                            </button>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {/* Report Mode Switcher */}
                    <div className="flex bg-gray-100 p-1 rounded-none">
                        <button onClick={() => setInventoryReportMode('standard')}
                            className={`px-4 py-1.5 rounded-none text-[10px] font-black uppercase tracking-widest transition-all ${inventoryReportMode === 'standard' ? 'bg-white text-brand-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
                            Mặc định
                        </button>
                        <button onClick={() => setInventoryReportMode('calendar')}
                            className={`px-4 py-1.5 rounded-none text-[10px] font-black uppercase tracking-widest transition-all ${inventoryReportMode === 'calendar' ? 'bg-white text-brand-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
                            Theo Lịch
                        </button>
                    </div>

                    {inventoryReportMode === 'standard' ? (
                        <div className="flex bg-gray-100 p-1 rounded-none">
                            {[
                                { id: 'today', label: 'Hôm nay' },
                                { id: 'week', label: '7 ngày' },
                                { id: 'month', label: '30 ngày' },
                                { id: 'all', label: 'Tất cả' }
                            ].map(p => (
                                <button key={p.id} onClick={() => setInventoryPeriod(p.id)}
                                    className={`px-4 py-1.5 rounded-none text-[10px] font-black uppercase tracking-widest transition-all ${inventoryPeriod === p.id ? 'bg-white text-brand-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
                                    {p.label}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-none">
                            <select value={calType} onChange={e => setCalType(e.target.value)} className="bg-transparent text-[10px] font-black uppercase outline-none px-2 text-gray-600">
                                <option value="month">Tháng</option>
                                <option value="quarter">Quý</option>
                                <option value="year">Năm</option>
                            </select>
                            <div className="w-[1px] h-4 bg-gray-200" />
                            {calType === 'month' && (
                                <select value={selectedMonth} onChange={e => setSelectedMonth(parseInt(e.target.value))} className="bg-transparent text-[10px] font-black outline-none px-2 text-brand-600">
                                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                        <option key={m} value={m}>Tháng {m}</option>
                                    ))}
                                </select>
                            )}
                            {calType === 'quarter' && (
                                <select value={selectedQuarter} onChange={e => setSelectedQuarter(parseInt(e.target.value))} className="bg-transparent text-[10px] font-black outline-none px-2 text-brand-600">
                                    {[1, 2, 3, 4].map(q => <option key={q} value={q}>Quý {q}</option>)}
                                </select>
                            )}
                            <select value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))} className="bg-transparent text-[10px] font-black outline-none px-2 text-brand-600">
                                {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                        </div>
                    )}

                    <div className="flex gap-2">
                        <button onClick={() => {
                            const headers = ["Nguyên liệu", "Tồn kho", "Đơn vị", "Đã dùng", "Giá trị tiêu thụ", "Tổng nhập"];
                            const body = inventoryStats.map(s => {
                                const usedQty = inventoryReportMode === 'calendar' ? s.usageQty : (inventoryPeriod === 'today' ? s.use1 : inventoryPeriod === 'week' ? s.use7 : s.use30);
                                const usedCost = inventoryReportMode === 'calendar' ? s.usageCost : (inventoryPeriod === 'today' ? s.cost1 : inventoryPeriod === 'week' ? s.cost7 : s.cost30);
                                const impCost = inventoryReportMode === 'calendar' ? s.importCost : (inventoryPeriod === 'today' ? s.imp1 : inventoryPeriod === 'week' ? s.imp7 : s.imp30);
                                return [s.name, s.stock, s.unit, usedQty, usedCost * 1000, impCost * 1000].join(",");
                            });
                            const csv = [headers.join(","), ...body].join("\n");
                            const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
                            const url = URL.createObjectURL(blob);
                            const link = document.createElement("a");
                            link.href = url;
                            link.download = `Bao-cao-kho-${inventoryPeriod}-${new Date().toLocaleDateString()}.csv`;
                            link.click();
                        }} className="bg-white text-gray-600 border border-gray-200 px-4 py-2.5 font-black text-[10px] uppercase rounded-none hover:bg-gray-50 transition-all flex items-center gap-2">
                            <FileUp size={14} /> XUẤT CSV
                        </button>
                        {hasPermission('inventory', 'edit') && (
                            <>
                                {inventorySubTab === 'fixed' ? (
                                    <button onClick={() => setEditExpense({})} className="bg-brand-600 text-white px-5 py-2.5 font-black flex items-center gap-2 shadow-lg hover:shadow-[#007AFF]/20 hover:scale-105 transition-all text-sm uppercase tracking-widest rounded-none">
                                        <Plus size={16} /> GHI PHIẾU CHI
                                    </button>
                                ) : (
                                    <button onClick={() => setEditImport({})} className="bg-brand-600 text-white px-5 py-2.5 font-black flex items-center gap-2 shadow-lg hover:shadow-[#007AFF]/20 hover:scale-105 transition-all text-sm uppercase tracking-widest rounded-none">
                                        <Plus size={16} /> LẬP PHIẾU NHẬP
                                    </button>
                                )}
                                <button onClick={() => {
                                    setProductionOutputItem('');
                                    setProductionOutputUnit('');
                                    setProductionOutputQty('');
                                    setProductionInputs([{ id: '', qty: '' }]);
                                    setShowProductionModal(true);
                                }} className="bg-orange-500 text-white px-5 py-2.5 font-black flex items-center gap-2 shadow-lg hover:shadow-orange-500/20 hover:scale-105 transition-all text-sm uppercase tracking-widest rounded-none hidden sm:flex">
                                    <RefreshCw size={16} /> CHẾ BIẾN BTP
                                </button>
                                <button onClick={() => setShowAuditModal(true)} className="bg-brand-600 text-white px-5 py-2.5 font-black flex items-center gap-2 shadow-lg hover:shadow-brand-600/20 hover:scale-105 transition-all text-sm uppercase tracking-widest rounded-none">
                                    <CheckCircle size={16} /> KIỂM KHO
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Inventory Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                    {
                        label: 'Tổng tiền nhập kho',
                        icon: <ArrowDownLeft size={20} />,
                        color: 'red',
                        value: inventorySummary.totalImport
                    },
                    {
                        label: 'Chi phí NL đã dùng',
                        icon: <ArrowUpRight size={20} />,
                        color: 'amber',
                        value: inventorySummary.totalUsage
                    },
                    {
                        label: 'Giá trị tồn kho hiện tại',
                        icon: <Database size={20} />,
                        color: 'blue',
                        value: inventorySummary.totalStockValue
                    }
                ].map((card, i) => (
                    <div key={i} className="bg-white p-6 border border-gray-100 shadow-sm flex items-center justify-between group hover:shadow-md transition-all">
                        <div className="space-y-1">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{card.label}</p>
                            <p className={`text-2xl font-black text-${card.color}-600`}>{formatVND(card.value)}</p>
                        </div>
                        <div className={`p-4 bg-${card.color}-50 text-${card.color}-600 rounded-none transform group-hover:scale-110 transition-transform`}>
                            {card.icon}
                        </div>
                    </div>
                ))}
            </div>

            {inventorySubTab === 'import' && (
                <div className="space-y-4">
                    {/* Mass Import / Export Dashboard Box */}
                    {hasPermission('inventory', 'edit') && (
                        <div className="flex justify-between items-center bg-brand-50/50 p-6 border border-brand-100 shadow-sm rounded-none col-span-full">
                            <div className="flex flex-col">
                                <h4 className="font-black text-sm text-brand-600 uppercase tracking-widest flex items-center gap-2">
                                    <FileUp size={16} /> Quản lý Phiếu Nhập Hàng Loạt bằng CSV
                                </h4>
                                <p className="text-xs text-brand-900/60 font-medium mt-1">Sử dụng định dạng file bảng tính .CSV (mở bằng Microsoft Excel) để thêm mới nhiều Phiếu Nhập cùng lúc.</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <button onClick={handleDownloadInventoryTemplate} className="bg-white text-brand-600 border-2 border-brand-600 px-6 py-3 font-black text-[11px] uppercase tracking-widest hover:bg-brand-50 transition-all flex items-center gap-2">
                                    <Download size={16} /> MẪU NHẬP KHO HÀNG LOẠT
                                </button>
                                <label className="bg-brand-600 border-2 border-brand-600 text-white px-6 py-3 font-black text-[11px] uppercase tracking-widest hover:bg-[#0066DD] transition-all flex items-center gap-2 cursor-pointer shadow-md">
                                    <Upload size={16} /> IMPORT HÀNG LOẠT
                                    <input type="file" accept=".csv" className="hidden" onChange={handleImportInventoryCSV} />
                                </label>
                            </div>
                        </div>
                    )}

                    <div className="bg-white  border border-gray-100 shadow-sm overflow-hidden rounded-none">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-gray-200 border-b border-gray-300">
                                    <th className="px-5 py-4 text-[14px] font-bold text-gray-700 uppercase tracking-widest">Thời gian</th>
                                    <th className="px-5 py-4 text-[14px] font-bold text-gray-700 uppercase tracking-widest">Nguyên liệu</th>
                                    <th className="px-5 py-4 text-[14px] font-bold text-brand-600 uppercase tracking-widest text-right">Quy cách</th>
                                    <th className="px-5 py-4 text-[14px] font-bold text-brand-600 uppercase tracking-widest text-right">Đã cộng kho</th>
                                    <th className="px-5 py-4 text-[14px] font-bold text-red-500 uppercase tracking-widest text-right">Tổng chi phí</th>
                                    <th className="px-5 py-4 text-[14px] font-bold text-[#C68E5E] uppercase tracking-widest text-right">Giá / Quy cách</th>
                                    <th className="w-12"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {imports.map((item) => {
                                    const isLegacy = !item.ingredientName;
                                    const invName = isLegacy ? (inventory.find(i => i.id === item.ingredientId)?.name || 'Không rõ') : item.ingredientName;
                                    const invUnit = isLegacy ? (inventory.find(i => i.id === item.ingredientId)?.unit || '') : item.baseUnit;

                                    return (
                                        <tr key={item.id} className={`hover:bg-gray-50/50 transition-colors ${item.isDeleted ? 'opacity-60 bg-gray-50' : ''}`}>
                                            <td className="px-5 py-4 font-normal text-[12px] text-gray-500 whitespace-nowrap">{new Date(item.timestamp).toLocaleString('vi-VN')}</td>
                                            <td className="px-5 py-4 font-normal text-[12px] text-gray-900">
                                                {editingIngId === item.ingredientId ? (
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            autoFocus
                                                            type="text"
                                                            value={editingIngName}
                                                            onChange={(e) => setEditingIngName(e.target.value)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') handleRenameIngredient(item.ingredientId, editingIngName);
                                                                if ((e.key === 'Escape' || (e.key === 'Backspace' && !isInputFocused()))) setEditingIngId(null);
                                                            }}
                                                            className="border-2 border-brand-600 px-3 py-1 text-sm outline-none w-full font-normal"
                                                        />
                                                        <button
                                                            onClick={() => handleRenameIngredient(item.ingredientId, editingIngName)}
                                                            className="bg-brand-600 hover:bg-[#0066DD] text-white p-1 rounded-none"
                                                        >
                                                            <CheckCircle2 size={16} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-col">
                                                        <div className="group/name flex items-center gap-2">
                                                            <span className="font-bold tracking-tight text-[12px]">{invName}</span>
                                                            <button
                                                                onClick={() => {
                                                                    setEditingIngId(item.ingredientId);
                                                                    setEditingIngName(invName);
                                                                }}
                                                                className="opacity-0 group-hover/name:opacity-100 p-1 text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-all rounded-none"
                                                            >
                                                                <Pencil size={14} />
                                                            </button>
                                                        </div>
                                                        {(() => {
                                                            const stat = inventoryStats.find(s => s.id === item.ingredientId);
                                                            if (stat && stat.avgCost > 0) {
                                                                return (
                                                                    <span className="text-[10px] text-gray-400 font-normal mt-0.5 max-w-[150px] truncate block" title={`TB: ${formatVND(stat.avgCost)}/${invUnit}`}>
                                                                        Giá TB: {formatVND(stat.avgCost)}/{invUnit}
                                                                    </span>
                                                                );
                                                            }
                                                            return null;
                                                        })()}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-5 py-4 text-right font-normal text-[12px] text-gray-600">
                                                {isLegacy ? '-' : `${item.quantity} ${item.importUnit} (x${item.volumePerUnit}${item.baseUnit})`}
                                            </td>
                                            <td className="px-5 py-4 text-right font-normal text-[12px] text-brand-600 bg-brand-50/20">
                                                +{isLegacy ? item.quantity : item.addedStock} <span className="text-[12px] font-normal text-brand-400">{invUnit}</span>
                                            </td>
                                            <td className="px-5 py-4 text-right font-normal text-[12px] text-red-500">
                                                -{formatVND(isLegacy ? item.cost : item.totalCost)}
                                            </td>
                                            <td className="px-5 py-4 text-right font-normal text-[12px] text-[#C68E5E] bg-orange-50/20">
                                                {isLegacy ? (item.quantity > 0 ? formatVND(item.cost / item.quantity) : '-') : formatVND(item.costPerUnit)}
                                                <span className="text-[12px] text-gray-400"> / {isLegacy ? invUnit : item.importUnit}</span>
                                            </td>
                                            <td className="px-2 py-4 text-right">
                                                {!item.isDeleted && hasPermission('inventory', 'delete') && (
                                                    <button onClick={() => handleDeleteImport(item.id)} className="text-gray-300 hover:text-red-500 p-2 transition-colors rounded-none hover:bg-red-50" title="Đưa vào thùng rác">
                                                        <Trash2 size={16} />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {imports.length === 0 && (
                                    <tr>
                                        <td colSpan="7" className="px-8 py-20 text-center text-gray-300 font-bold text-sm border-dashed border-2 m-4 border-gray-100 italic">
                                            {inventoryPeriod === 'today' ? 'Hôm nay chưa có lượt nhập kho nào.' :
                                                inventoryPeriod === 'week' ? 'Trong 7 ngày qua chưa có lượt nhập kho nào.' :
                                                    inventoryPeriod === 'month' ? 'Trong 30 ngày qua chưa có lượt nhập kho nào.' :
                                                        'Chưa có lịch sử nhập kho.'}
                                            <br />Bấm "LẬP PHIẾU NHẬP" để bắt đầu.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                        {/* SENTINEL CHO IMPORT HISTORY */}
                        <div ref={importsSentinelRef} className="h-20 flex flex-col items-center justify-center w-full opacity-60">
                            {isLoadingMoreImports ? (
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
                            ) : hasMoreImports ? (
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.3em] animate-pulse">Đang tải thêm...</p>
                            ) : (
                                imports.length > 0 && <p className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em] bg-gray-50 px-4 py-1.5 ">HẾT DỮ LIỆU NHẬP KHO</p>
                            )}
                        </div>

                    </div>
                </div>
            )}

            {inventorySubTab === 'raw' && (
                <div className="space-y-4 relative">
                    {/* Hiển thị thanh công cụ Gộp nguyên liệu nếu chọn nhiều */}
                    {selectedMergeItems.length >= 2 && (
                        <div className="bg-brand-50 border border-brand-200 p-4 sticky top-0 z-10 shadow-sm flex items-center justify-between">
                            <div className="flex items-center gap-3 text-brand-800">
                                <div className="bg-brand-600 text-white w-6 h-6 rounded-none flex items-center justify-center font-bold text-sm shadow">
                                    {selectedMergeItems.length}
                                </div>
                                <span className="font-semibold text-sm">Đang chọn {selectedMergeItems.length} nguyên liệu để gộp</span>
                            </div>
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => setSelectedMergeItems([])}
                                    className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-700 transition"
                                >
                                    HỦY BỎ
                                </button>
                                <button
                                    onClick={() => setShowMergeModal(true)}
                                    className="px-6 py-2 bg-brand-600 hover:bg-brand-700 text-white text-[11px] font-black shadow transition flex items-center gap-2 uppercase tracking-widest border-2 border-brand-600"
                                >
                                    <Merge size={16} /> Bấm Gộp Liên Kết
                                </button>
                            </div>
                        </div>
                    )}
                    <div className="bg-white border border-gray-100 shadow-sm overflow-hidden rounded-none">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-gray-200 border-b border-gray-300">
                                    <th className="px-5 py-5 w-12 text-center text-[14px] font-bold text-gray-700 uppercase tracking-widest">
                                    </th>
                                    <th className="px-8 py-5 text-[14px] font-bold text-gray-700 uppercase tracking-widest text-left w-16">Thứ tự</th>
                                    <th className="px-8 py-5 text-[14px] font-bold text-gray-700 uppercase tracking-widest text-left">Nguyên liệu</th>
                                    <th className="px-8 py-5 text-[14px] font-bold text-[#C68E5E] uppercase tracking-widest text-right">Giá nhập TB</th>
                                    <th className="px-8 py-5 text-[14px] font-bold text-gray-700 uppercase tracking-widest text-right">Cảnh báo</th>
                                    <th className="px-8 py-5 text-[14px] font-bold text-gray-700 uppercase tracking-widest text-right">Tồn hiện tại</th>
                                    <th className="px-8 py-5 text-[14px] font-bold text-green-600 uppercase tracking-widest text-right">Số lượng đã dùng</th>
                                    <th className="px-8 py-5 text-[14px] font-bold text-amber-600 uppercase tracking-widest text-right">Giá trị tiêu thụ</th>
                                    <th className="px-8 py-5 text-[14px] font-bold text-gray-700 uppercase tracking-widest text-right">Thao tác</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {(() => {
                                    const latestProductionMap = memoizedProductionMap;

                                    return inventory.map((item, idx) => {
                                        const stat = inventoryStatsMapping[item.id] || { use1: 0, use7: 0, use30: 0, cost1: 0, cost7: 0, cost30: 0, avgCost: 0, usageQty: 0, usageCost: 0 };
                                        const usedQty = inventoryReportMode === 'calendar' ? stat.usageQty : (inventoryPeriod === 'today' ? stat.use1 : inventoryPeriod === 'week' ? stat.use7 : stat.use30);
                                        const usedCost = inventoryReportMode === 'calendar' ? stat.usageCost : (inventoryPeriod === 'today' ? stat.cost1 : inventoryPeriod === 'week' ? stat.cost7 : stat.cost30);

                                        const usedInMenuName = menuIngredientsInUse[item.id];

                                        return (
                                            <tr key={item.id} className={`hover:bg-gray-50/50 transition-colors ${selectedMergeItems.includes(item.id) ? 'bg-brand-50/40' : ''}`}>
                                                <td className="px-5 py-6 text-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedMergeItems.includes(item.id)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setSelectedMergeItems(prev => [...prev, item.id]);
                                                            } else {
                                                                setSelectedMergeItems(prev => prev.filter(id => id !== item.id));
                                                            }
                                                        }}
                                                        className="w-4 h-4 text-brand-600 bg-white border-gray-300 rounded-none focus:ring-brand-500 cursor-pointer"
                                                    />
                                                </td>
                                                <td className="px-8 py-6">
                                                    <div className="flex flex-col gap-1 items-center">
                                                        <button
                                                            onClick={() => moveIngredientUp(idx)}
                                                            disabled={idx === 0}
                                                            className={`p-1 hover:text-accent transition-colors ${idx === 0 ? 'opacity-20 cursor-not-allowed' : 'text-gray-300'}`}
                                                        >
                                                            <ChevronUp size={16} strokeWidth={3} />
                                                        </button>
                                                        <button
                                                            onClick={() => moveIngredientDown(idx)}
                                                            disabled={idx === inventory.length - 1}
                                                            className={`p-1 hover:text-accent transition-colors ${idx === inventory.length - 1 ? 'opacity-20 cursor-not-allowed' : 'text-gray-300'}`}
                                                        >
                                                            <ChevronDown size={16} strokeWidth={3} />
                                                        </button>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6">
                                                    <div className="flex items-center gap-2 group/ingredient">
                                                        <p className="font-bold text-gray-900 text-[12px] tracking-tight">{item.name}</p>
                                                        {(() => {
                                                            const prodRecipe = latestProductionMap[item.id] || latestProductionMap[item.name];
                                                            if (prodRecipe) {
                                                                return (
                                                                    <div className="relative group/tooltip flex items-center">
                                                                        <button
                                                                            onClick={() => {
                                                                                setProductionOutputItem(prodRecipe.output?.name || item.name);
                                                                                setProductionOutputUnit(prodRecipe.output?.unit || item.unit);
                                                                                setProductionOutputQty(prodRecipe.output?.qty || '');
                                                                                setProductionInputs(prodRecipe.inputs?.length > 0 ? prodRecipe.inputs.map(i => {
                                                                                    const matchedInv = inventory.find(inv => (i.id && inv.id === i.id) || (i.name && inv.name.toLowerCase() === i.name.toLowerCase()));
                                                                                    return { id: matchedInv ? matchedInv.id : '', qty: i.qty };
                                                                                }) : [{ id: '', qty: '' }]);
                                                                                setShowProductionModal(true);
                                                                            }}
                                                                            className="text-brand-500 cursor-pointer opacity-40 hover:opacity-100 hover:text-brand-600 hover:bg-brand-50 p-1.5 -ml-1.5 rounded-none transition-all group-hover/ingredient:opacity-100"
                                                                            title="Làm lại mẻ này"
                                                                        >
                                                                            <RefreshCw size={14} strokeWidth={2.5} />
                                                                        </button>
                                                                        {/* Tooltip Popup */}
                                                                        <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 hidden group-hover/tooltip:block bg-gray-900 text-white text-[12px] font-medium px-4 py-3 whitespace-nowrap z-50 shadow-xl border-l-4 border-brand-500 pointer-events-none rounded-none w-max">
                                                                            <p className="text-brand-300 text-[9px] uppercase font-black tracking-widest mb-1.5 opacity-80">Bán thành phẩm chế biến</p>
                                                                            <div className="flex items-center font-mono">
                                                                                {prodRecipe.inputs?.length > 0 ? prodRecipe.inputs.map(i => `${i.qty}${inventory.find(inv => inv.id === i.id || inv.name === i.name)?.unit || ''} ${i.name}`).join(' + ') : '---'}
                                                                                <ArrowRightLeft size={12} className="text-amber-400 mx-3 opacity-60" />
                                                                                <span className="text-brand-300 font-black">{prodRecipe.output?.qty}{prodRecipe.output?.unit || item.unit} {prodRecipe.output?.name}</span>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            }
                                                            return null;
                                                        })()}
                                                    </div>
                                                    <p className="text-[10px] text-gray-400 font-normal uppercase tracking-tighter mt-1 bg-gray-100 inline-block px-2 py-0.5 rounded-none">Đơn vị: {item.unit}</p>
                                                </td>
                                                <td className="px-8 py-6 text-right font-normal text-[12px] text-[#C68E5E] bg-orange-50/20">
                                                    {formatVND(stat.avgCost)} <span className="text-[10px] opacity-60">/{item.unit}</span>
                                                </td>
                                                <td className="px-8 py-6 text-right font-normal text-[12px] text-gray-500 bg-gray-50/50">{item.minStock}</td>
                                                <td className="px-8 py-6 text-right">
                                                    <div className="flex flex-col items-end">
                                                        <span className={`inline-block px-4 py-1.5 font-normal text-[12px] rounded-none ${item.stock <= item.minStock ? 'bg-red-50 text-red-600 border border-red-200 shadow-sm shadow-red-100' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                                                            {item.stock} <span className="text-[10px] opacity-70">{item.unit}</span>
                                                        </span>
                                                        {item.stock <= item.minStock && (
                                                            <span className="text-[9px] font-normal text-red-500 uppercase mt-2 tracking-widest px-2 py-0.5 bg-red-50 rounded-none animate-pulse">CẦN NHẬP KHO</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6 text-right font-normal text-[12px] text-green-600 bg-green-50/20">{usedQty || 0} {item.unit}</td>
                                                <td className="px-8 py-6 text-right font-normal text-[12px] text-amber-600 bg-amber-50/20">{formatVND(usedCost)}</td>
                                                <td className="px-8 py-6 text-right">
                                                    <div className="flex justify-end gap-2">
                                                        <button onClick={() => setViewingIngredientStats(item)} className="icon-btn-edit !text-brand-600 !bg-brand-50 hover:!bg-brand-600 hover:!text-white" title="Thống kê tiêu thụ"><BarChart3 size={16} /></button>
                                                        {hasPermission('inventory', 'edit') && (
                                                            <>
                                                                <button onClick={() => setEditInventory(item)} className="icon-btn-edit"><Edit2 size={16} /></button>
                                                                <button
                                                                    onClick={() => deleteInventory(item.id)}
                                                                    disabled={!!usedInMenuName}
                                                                    title={usedInMenuName ? `Chưa thể xóa. Các món đang dùng: ${usedInMenuName}` : 'Xóa nguyên liệu này'}
                                                                    className={`icon-btn-delete ${usedInMenuName ? 'opacity-30 cursor-not-allowed hover:bg-transparent hover:text-red-500 saturate-0' : ''}`}
                                                                >
                                                                    <Trash2 size={16} />
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        )
                                    })
                                })()}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {inventorySubTab === 'fixed' && (
                <div className="bg-white border border-gray-100 shadow-sm overflow-hidden rounded-none flex">
                    {/* Right Side: List Full Width */}
                    <div className="flex-1 overflow-x-auto flex flex-col">
                        {/* Tổng chi phí Banner */}
                        <div className="bg-rose-50 border-b border-rose-100 p-6 flex justify-between items-center">
                            <div>
                                <p className="text-[10px] font-black uppercase text-rose-500 mb-1 tracking-widest">Tổng Tích Lũy Các Khoản Chi Phí</p>
                                <p className="text-3xl font-black text-rose-700 tracking-tighter">
                                    {formatVND(expenses.reduce((sum, e) => sum + Number(e.amount), 0))}
                                </p>
                            </div>
                            <div className="p-4 bg-white/60 rounded-none text-rose-500">
                                <DollarSign size={24} strokeWidth={3} />
                            </div>
                        </div>

                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-gray-100 border-b border-gray-200">
                                    <th className="px-6 py-4 text-[12px] font-black text-gray-500 uppercase tracking-widest text-left w-32">Ngày</th>
                                    <th className="px-6 py-4 text-[12px] font-black text-gray-500 uppercase tracking-widest text-left">Nội dung chi</th>
                                    <th className="px-6 py-4 text-[12px] font-black text-gray-500 uppercase tracking-widest text-left">Phân loại</th>
                                    <th className="px-6 py-4 text-[12px] font-black text-rose-600 uppercase tracking-widest text-right">Số tiền</th>
                                    <th className="px-6 py-4 text-[12px] font-black text-gray-500 uppercase tracking-widest text-right w-24">Thao tác</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {expenses.sort((a, b) => new Date(b.date) - new Date(a.date)).map((exp) => (
                                    <tr key={exp.id} className="hover:bg-brand-50/30 transition-colors group">
                                        <td className="px-6 py-4 text-sm font-medium text-gray-500">{new Date(exp.date).toLocaleDateString('vi-VN')}</td>
                                        <td className="px-6 py-4">
                                            <p className="text-sm font-bold text-gray-900">{exp.name}</p>
                                            {exp.note && <p className="text-xs text-gray-400 mt-1">{exp.note}</p>}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="inline-block px-2.5 py-1 bg-gray-100 text-gray-600 text-[10px] font-black uppercase tracking-wider">{exp.category}</span>
                                        </td>
                                        <td className="px-6 py-4 text-right font-bold text-rose-600">{formatVND(exp.amount)}</td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => setEditExpense(exp)} className="icon-btn-edit text-brand-500 hover:bg-brand-50"><Edit2 size={16} /></button>
                                                {hasPermission('inventory', 'edit') && (
                                                    <button onClick={() => deleteExpense(exp.id)} className="icon-btn-delete text-red-500 hover:bg-red-50"><Trash2 size={16} /></button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {expenses.length === 0 && (
                                    <tr>
                                        <td colSpan="5" className="px-8 py-20 text-center text-gray-400 font-bold text-sm italic">
                                            Chưa có khoản chi nào được ghi nhận.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </motion.section>
    );
};

export default InventoryTab;
