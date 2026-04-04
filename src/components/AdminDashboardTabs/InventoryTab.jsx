import React, { useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
    FileUp, Plus, RefreshCw, CheckCircle, ArrowDownLeft, ArrowUpRight,
    Database, Download, Upload, Trash2, CheckCircle2, Pencil,
    ChevronUp, ChevronDown, ArrowRightLeft, BarChart3, Edit2, X,
    DollarSign, Merge, Info, ClipboardList, Package, AlertTriangle
} from 'lucide-react';
import '../AdminDashboard.css';
import { formatDateTime } from '../../utils/timeUtils';

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
    customStartDate,
    customEndDate,
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
    setCustomStartDate,
    setCustomEndDate,
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
    setShowAutoPoModal,
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
    const reorderTimerRef = useRef(null); // Debounce timer cho API reorder

    const [trashCount, setTrashCount] = React.useState(0);

    React.useEffect(() => {
        const fetchTrashCount = async () => {
            try {
                const token = localStorage.getItem('authToken');
                const res = await fetch(`${SERVER_URL}/api/imports/trash/count`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setTrashCount(data.count || 0);
                }
            } catch (err) {
                // Ignore errors silently
            }
        };
        if (hasPermission('inventory', 'view') && inventorySubTab === 'import') {
            fetchTrashCount();
        }
    }, [SERVER_URL, inventorySubTab, showImportTrash, imports.length, hasPermission]);

    const lowStockCount = inventory.filter(item => !item.isDeleted && item.stock <= item.minStock).length;

    // --- Helpers ---
    const getLastImport = (item) => {
        if (!imports || imports.length === 0) return null;
        // Ưu tiên tìm theo ID, sau đó mới tên (đề phòng đổi tên)
        return [...imports]
            .filter(imp => !imp.isDeleted && (imp.ingredientId === item.id || imp.ingredientName === item.name))
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
    };

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

    const handlePermanentDeleteImport = async (importId) => {
        if (!confirm('⚠️ XÓA VĨNH VIỂN phiếu nhập này? Hành động này không thể hoàn tác!')) return;
        try {
            const token = localStorage.getItem('authToken');
            const res = await fetch(`${SERVER_URL}/api/imports/${importId}/permanent`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                showToast('Đã xóa vĩnh viễn phiếu nhập!', 'success');
                setImports(prev => prev.filter(imp => imp.id !== importId));
            } else {
                const err = await res.json();
                showToast(err.message || 'Lỗi khi xóa vĩnh viễn', 'error');
            }
        } catch (e) {
            showToast('Lỗi kết nối', 'error');
        }
    };

    const handleRestoreImport = async (importId) => {
        try {
            const token = localStorage.getItem('authToken');
            const res = await fetch(`${SERVER_URL}/api/imports/${importId}/restore`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                showToast('Đã khôi phục phiếu nhập!', 'success');
                setImports(prev => prev.filter(imp => imp.id !== importId));
                setTrashCount(prev => Math.max(0, prev - 1));
                fetchData();
            } else {
                const err = await res.json();
                showToast(err.error || 'Lỗi khi khôi phục', 'error');
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
        // Debounce: gọi API sau 500ms kể từ lần bấm cuối cùng
        if (reorderTimerRef.current) clearTimeout(reorderTimerRef.current);
        reorderTimerRef.current = setTimeout(async () => {
            try {
                const token = localStorage.getItem('authToken');
                await fetch(`${SERVER_URL}/api/inventory/reorder`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ inventory: newInv })
                });
            } catch (e) {
                console.error('[InventoryTab] Lỗi lưu thứ tự nguyên liệu:', e);
            }
        }, 500);
    };

    const moveIngredientDown = (index) => {
        if (index === inventory.length - 1) return;
        const newInv = [...inventory];
        [newInv[index + 1], newInv[index]] = [newInv[index], newInv[index + 1]];
        setInventory(newInv);
        // Debounce: gọi API sau 500ms kể từ lần bấm cuối cùng
        if (reorderTimerRef.current) clearTimeout(reorderTimerRef.current);
        reorderTimerRef.current = setTimeout(async () => {
            try {
                const token = localStorage.getItem('authToken');
                await fetch(`${SERVER_URL}/api/inventory/reorder`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ inventory: newInv })
                });
            } catch (e) {
                console.error('[InventoryTab] Lỗi lưu thứ tự nguyên liệu:', e);
            }
        }, 500);
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
        let rows = [];
        if (inventory && inventory.length > 0) {
            rows = inventory.map(item => {
                const last = getLastImport(item);
                return [
                    item.name,
                    item.unit,
                    last ? last.importUnit : 'Hộp',
                    last ? last.volumePerUnit : '1',
                    '0', // Số lượng để người dùng điền
                    last ? last.costPerUnit : (item.importPrice || '0'),
                    item.minStock || '0'
                ];
            });
        } else {
            rows = [
                ["Cà phê hạt", "g", "Bao", "5000", "2", "850000", "2000"],
                ["Sữa đặc", "g", "Thùng", "380", "1", "950000", "5"],
                ["Đá bi", "kg", "Bao", "10", "5", "15000", "2"]
            ];
        }

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
                    unit: cols[1], // server expectations
                    importUnit: cols[2] || '',
                    volumePerUnit: parseFloat(cols[3]) || 1,
                    quantity: parseFloat(cols[4]) || 0, // server expectations
                    costPerUnit: parseFloat(cols[5]) || 0, // server expectations
                    minStock: parseFloat(cols[6]) || 0
                };
            }).filter(Boolean);

            try {
                const token = localStorage.getItem('authToken');
                const res = await fetch(`${SERVER_URL}/api/imports/bulk`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify(data)
                });
                if (res.ok) {
                    showToast('Đã import dữ liệu thành công!', 'success');
                    fetchData();
                    resetAndFetchImports(showImportTrash);
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

    React.useEffect(() => {
        if (showImportTrash && trashCount === 0) {
            setShowImportTrash(false);
            resetAndFetchImports(false);
        }
    }, [trashCount, showImportTrash]);

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

    const exportToCSV = () => {
        const headers = ["Nguyên liệu", "Tồn kho", "Đơn vị", "Đã dùng", "Giá trị tiêu thụ", "Tổng nhập"];
        const body = inventoryStats.map(s => {
            let usedQty, usedCost, impCost;
            if (inventoryReportMode === 'calendar' || inventoryPeriod === 'custom') {
                usedQty = s.usageQty; usedCost = s.usageCost; impCost = s.importCost;
            } else {
                if (inventoryPeriod === 'today') { usedQty = s.use1; usedCost = s.cost1; impCost = s.imp1; }
                else if (inventoryPeriod === 'week') { usedQty = s.use7; usedCost = s.cost7; impCost = s.imp7; }
                else if (inventoryPeriod === '30days') { usedQty = s.use30; usedCost = s.cost30; impCost = s.imp30; }
                else if (inventoryPeriod === 'month') { usedQty = s.useMonth; usedCost = s.costMonth; impCost = s.impMonth; }
                else if (inventoryPeriod === 'quarter') { usedQty = s.useQuarter; usedCost = s.costQuarter; impCost = s.impQuarter; }
                else if (inventoryPeriod === 'year') { usedQty = s.useYear; usedCost = s.costYear; impCost = s.impYear; }
                else { usedQty = s.useAll; usedCost = s.costAll; impCost = s.impAll; }
            }
            return [s.name, s.stock, s.unit, usedQty || 0, (usedCost || 0) * 1000, (impCost || 0) * 1000].join(",");
        });
        const csv = [headers.join(","), ...body].join("\n");
        const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `Bao-cao-kho-${inventoryPeriod}-${new Date().toLocaleDateString()}.csv`;
        link.click();
    };

    return (
        <React.Fragment>
        <motion.section 
            key="inventory" 
            initial={{ opacity: 0, scale: 0.98 }} 
            animate={{ opacity: 1, scale: 1 }} 
            exit={{ opacity: 0, scale: 0.98 }} 
            className="flex flex-col gap-4" 
            style={{ marginTop: '20px', paddingBottom: '40px' }}
        >
            {/* Filter Bar - Global (Sticky at top) */}
            <div className="sticky top-0 z-40 w-full flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 bg-white/90 backdrop-blur-md p-1.5 sm:p-2 border border-gray-100 shadow-sm transition-all" style={{ borderRadius: 'var(--radius-card)', marginTop: '0px' }}>
                <div className="flex flex-nowrap sm:flex-wrap items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar w-full sm:w-auto">
                    {['today', 'week', '30days', 'month', 'quarter', 'year', 'all', 'custom'].map(p => (
                        <button key={p} onClick={() => setInventoryPeriod(p)}
                            className={`px-3 sm:px-6 py-2 font-black text-[10px] sm:text-xs uppercase tracking-wider sm:tracking-widest transition-all rounded-md sm:rounded-lg whitespace-nowrap flex-shrink-0 ${inventoryPeriod === p ? 'bg-gray-900 text-white shadow-md' : 'text-gray-500 hover:bg-gray-100'}`}
                            style={{ minHeight: '32px' }}>
                            {p === 'today' ? 'Hôm nay' : p === 'week' ? '7 ngày' : p === '30days' ? '30 ngày' : p === 'month' ? 'Tháng này' : p === 'quarter' ? 'Quý này' : p === 'year' ? 'Năm nay' : p === 'all' ? 'Tất cả' : 'Tùy chỉnh'}
                        </button>
                    ))}
                    {inventoryPeriod === 'custom' && setCustomStartDate && (
                        <div className="flex items-center gap-1 sm:gap-2 ml-1 sm:ml-3 pl-1 sm:pl-3 border-l border-gray-200 shrink-0">
                            <input type="date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} className="px-2 sm:px-3 py-1.5 border border-gray-200 text-[10px] sm:text-sm font-bold bg-gray-50 rounded-md sm:rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-gray-900" style={{ height: '32px' }}/>
                            <span className="text-gray-400 font-bold">&rarr;</span>
                            <input type="date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} className="px-2 sm:px-3 py-1.5 border border-gray-200 text-[10px] sm:text-sm font-bold bg-gray-50 rounded-md sm:rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-gray-900" style={{ height: '32px' }}/>
                        </div>
                    )}
                </div>
                {hasPermission('inventory', 'view') && (
                    <button 
                        onClick={exportToCSV} 
                        className="flex items-center gap-2 bg-brand-50 text-brand-600 px-6 py-2 font-black text-xs uppercase tracking-widest hover:bg-brand-100 transition-all border border-brand-100 rounded-sm"
                        style={{ minHeight: '44px' }}
                    >
                        <FileUp size={16} /> XUẤT CSV
                    </button>
                )}
            </div>

            {/* Sub-Tabs Navigation */}
            <div className="flex bg-white border border-slate-200 p-1 rounded-xl w-full sm:w-fit shadow-sm gap-1 overflow-x-auto no-scrollbar">
                <button onClick={() => setInventorySubTab('import')}
                    className={`flex items-center gap-1.5 px-3 sm:px-5 py-2 transition-all font-black text-[10px] sm:text-[11px] uppercase tracking-wider rounded-lg whitespace-nowrap flex-shrink-0 ${inventorySubTab === 'import' ? 'bg-brand-50 text-brand-700 pointer-events-none' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50'}`}
                    style={{ minHeight: '36px' }}>
                    <ClipboardList size={14} />
                    <span className="hidden sm:inline">LỊCH SỬ NHẬP KHO</span>
                    <span className="sm:hidden">NHẬP KHO</span>
                </button>
                <button onClick={() => setInventorySubTab('raw')}
                    className={`flex items-center gap-1.5 px-3 sm:px-5 py-2 transition-all font-black text-[10px] sm:text-[11px] uppercase tracking-wider rounded-lg whitespace-nowrap flex-shrink-0 ${inventorySubTab === 'raw' ? 'bg-blue-50 text-blue-700 pointer-events-none' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50'}`}
                    style={{ minHeight: '36px' }}>
                    <Package size={14} />
                    <span>NGUYÊN LIỆU</span> ({inventory.length})
                </button>
                <button onClick={() => setInventorySubTab('fixed')}
                    className={`flex items-center gap-1.5 px-3 sm:px-5 py-2 transition-all font-black text-[10px] sm:text-[11px] uppercase tracking-wider rounded-lg whitespace-nowrap flex-shrink-0 ${inventorySubTab === 'fixed' ? 'bg-amber-50 text-amber-700 pointer-events-none' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50'}`}
                    style={{ minHeight: '36px' }}>
                    <DollarSign size={14} />
                    <span className="hidden sm:inline">CHI PHÍ MẶT BẰNG &amp; VẬN HÀNH</span>
                    <span className="sm:hidden">VẬN HÀNH</span>
                </button>
            </div>

            {/* Title & Actions Row */}
            <div className="flex flex-wrap justify-between items-center gap-2" style={{ marginTop: '8px' }}>
                <div className="flex items-center gap-3">
                    <h3 className="text-base sm:text-xl font-black text-gray-900 uppercase tracking-widest hidden sm:block">CHI PHÍ & KHO</h3>
                </div>
                <div className="flex items-center gap-1.5 md:gap-2 ml-auto">
                    {hasPermission('inventory', 'view') && inventorySubTab === 'import' && (trashCount > 0 || showImportTrash) && (
                        <button
                            onClick={() => { const nextVal = !showImportTrash; setShowImportTrash(nextVal); resetAndFetchImports(nextVal); }}
                            className={`flex items-center gap-1.5 font-black text-xs uppercase tracking-widest transition-all border shadow-sm ${showImportTrash ? 'bg-red-500 text-white border-red-500' : 'bg-white text-red-500 border-red-100 hover:bg-red-50 hover:border-red-200'}`}
                            style={{ minHeight: '36px', borderRadius: 'var(--radius-btn)', padding: '0 10px', flexShrink: 0 }}
                            title={showImportTrash ? 'Quay về danh sách chính' : 'Xem thùng rác nhập kho'}
                        >
                            <Trash2 size={16} />
                            <span>{showImportTrash ? 'DS CHÍNH' : `THÙNG RÁC (${trashCount})`}</span>
                        </button>
                    )}
                    {hasPermission('inventory', 'edit') && (
                        <>
                            {inventorySubTab === 'fixed' ? (
                                <button onClick={() => setEditExpense({})} className="bg-brand-600 text-white border border-brand-700 font-black flex items-center gap-1.5 shadow-sm hover:shadow-md hover:bg-brand-700 transition-all uppercase text-xs tracking-widest" style={{ minHeight: '36px', borderRadius: 'var(--radius-btn)', padding: '0 12px' }}>
                                    <Plus size={14} />
                                    <span className="md:hidden">CHI</span>
                                    <span className="hidden md:inline">Thêm Chi Phí</span>
                                </button>
                            ) : (
                                <>
                                    {lowStockCount > 0 && (
                                        <button onClick={() => setShowAutoPoModal(true)} className="bg-red-50 text-red-600 border border-red-200 font-black flex items-center gap-1.5 shadow-sm hover:shadow-md hover:bg-red-100 transition-all uppercase text-xs tracking-widest relative overflow-hidden group" style={{ minHeight: '36px', borderRadius: 'var(--radius-btn)', padding: '0 12px' }}>
                                            <div className="absolute inset-0 bg-red-400 opacity-20 animate-pulse"></div>
                                            <AlertTriangle size={14} className="relative z-10" />
                                            <span className="hidden md:inline relative z-10">Gợi Ý Đặt Hàng ({lowStockCount})</span>
                                            <span className="md:hidden relative z-10">PO ({lowStockCount})</span>
                                        </button>
                                    )}
                                    <button onClick={() => setEditImport({})} className="bg-brand-600 text-white border border-brand-700 font-black flex items-center gap-1.5 shadow-sm hover:shadow-md hover:bg-brand-700 transition-all uppercase text-xs tracking-widest" style={{ minHeight: '36px', borderRadius: 'var(--radius-btn)', padding: '0 12px' }}>
                                        <Plus size={14} />
                                        <span className="md:hidden">NHẬP</span>
                                        <span className="hidden md:inline">Thêm Phiếu Nhập</span>
                                    </button>
                                </>
                            )}
                            <button onClick={() => { setProductionOutputItem(''); setProductionOutputUnit(''); setProductionOutputQty(''); setProductionInputs([{ id: '', qty: '' }]); setShowProductionModal(true); }} className="bg-orange-500 text-white border border-orange-600 font-black flex items-center gap-1.5 shadow-sm hover:shadow-md hover:bg-orange-600 transition-all uppercase text-xs tracking-widest hidden sm:flex" style={{ minHeight: '36px', borderRadius: 'var(--radius-btn)', padding: '0 12px' }}>
                                <RefreshCw size={14} />
                                <span className="hidden md:inline">Chế Biến</span>
                            </button>
                            <button onClick={() => setShowAuditModal(true)} className="bg-brand-600 text-white border border-brand-700 font-black flex items-center gap-1.5 shadow-sm hover:shadow-md hover:bg-brand-700 transition-all uppercase text-xs tracking-widest hidden md:flex" style={{ minHeight: '36px', borderRadius: 'var(--radius-btn)', padding: '0 12px' }}>
                                <CheckCircle size={14} />
                                <span className="hidden md:inline">Kiểm Kho</span>
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Inventory Summary Cards — always 3 cols */}
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
                {[
                    {
                        label: 'Nhập kho',
                        fullLabel: 'Tổng tiền nhập kho',
                        icon: <ArrowDownLeft size={16} />,
                        color: 'red',
                        value: inventorySummary.totalImport
                    },
                    {
                        label: 'NL dùng',
                        fullLabel: 'Chi phí NL đã dùng',
                        icon: <ArrowUpRight size={16} />,
                        color: 'amber',
                        value: inventorySummary.totalUsage
                    },
                    {
                        label: 'Tồn kho',
                        fullLabel: 'Giá trị tồn kho hiện tại',
                        icon: <Database size={16} />,
                        color: 'blue',
                        value: inventorySummary.totalStockValue
                    }
                ].map((card, i) => (
                    <div key={i} className="bg-white border border-gray-100 shadow-sm flex flex-col justify-between group hover:shadow-md transition-all" style={{ padding: 'clamp(10px, 2.5vw, 20px)', borderRadius: 'var(--radius-card)' }}>
                        <div className="flex items-center justify-between mb-1">
                            <p className="text-[9px] sm:text-[10px] font-black text-gray-400 uppercase tracking-widest leading-tight">
                                <span className="hidden sm:inline">{card.fullLabel}</span>
                                <span className="inline sm:hidden">{card.label}</span>
                            </p>
                            <div className={`hidden sm:flex bg-${card.color}-50 text-${card.color}-600`} style={{ borderRadius: 'var(--radius-btn)', padding: '8px' }}>{card.icon}</div>
                        </div>
                        <p className={`font-black text-${card.color}-600`} style={{ fontSize: 'clamp(13px, 3.5vw, 22px)' }}>{formatVND(card.value)}</p>
                    </div>
                ))}
            </div>

            {inventorySubTab === 'import' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Mass Import / Export — ẩn trên mobile */}
                    {hasPermission('inventory', 'edit') && (
                        <div className="hidden sm:flex justify-between items-center bg-brand-50/50 border border-brand-100 shadow-sm col-span-full" style={{ padding: '24px', borderRadius: 'var(--radius-card)' }}>
                            <div className="flex flex-col">
                                <h4 className="font-black text-sm text-brand-600 uppercase tracking-widest flex items-center gap-2">
                                    <FileUp size={16} /> Quản lý Phiếu Nhập Hàng Loạt bằng CSV
                                </h4>
                                <p className="text-xs text-brand-900/60 font-medium mt-1">Sử dụng định dạng file bảng tính .CSV (mở bằng Microsoft Excel) để thêm mới nhiều Phiếu Nhập cùng lúc.</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <button onClick={handleDownloadInventoryTemplate} className="bg-white text-brand-600 border-2 border-brand-600 px-6 py-3 font-black text-[11px] uppercase tracking-widest hover:bg-brand-50 transition-all flex items-center gap-2" style={{ borderRadius: 'var(--radius-badge)' }}>
                                    <Download size={16} /> MẪU NHẬP KHO HÀNG LOẠT
                                </button>
                                <label className="bg-brand-600 border-2 border-brand-600 text-white px-6 py-3 font-black text-[11px] uppercase tracking-widest hover:bg-[#0066DD] transition-all flex items-center gap-2 cursor-pointer shadow-md" style={{ borderRadius: 'var(--radius-badge)' }}>
                                    <Upload size={16} /> IMPORT HÀNG LOẠT
                                    <input type="file" accept=".csv" className="hidden" onChange={handleImportInventoryCSV} />
                                </label>
                            </div>
                        </div>
                    )}

                    <div className="bg-white border border-gray-100 shadow-sm" style={{ borderRadius: 'var(--radius-card)', overflowX: 'auto' }}>
                        <table className="w-full text-left" style={{ minWidth: '600px' }}>
                            <thead>
                                <tr className="bg-gray-200 border-b border-gray-300">
                                    <th className="text-[10px] font-bold text-gray-700 uppercase tracking-wide whitespace-nowrap" style={{ padding: '5px 10px' }}>Thời gian</th>
                                    <th className="text-[10px] font-bold text-gray-700 uppercase tracking-wide whitespace-nowrap" style={{ padding: '5px 10px' }}>Nguyên liệu</th>
                                    <th className="text-[10px] font-bold text-brand-600 uppercase tracking-wide text-right whitespace-nowrap" style={{ padding: '5px 10px' }}>Quy cách</th>
                                    <th className="text-[10px] font-bold text-brand-600 uppercase tracking-wide text-right whitespace-nowrap" style={{ padding: '5px 10px' }}>+ Kho</th>
                                    <th className="text-[10px] font-bold text-red-500 uppercase tracking-wide text-right whitespace-nowrap" style={{ padding: '5px 10px' }}>Chi phí</th>
                                    <th className="text-[10px] font-bold text-[#C68E5E] uppercase tracking-wide text-right whitespace-nowrap" style={{ padding: '5px 10px' }}>Giá/QC</th>
                                    <th className="w-8"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {imports.map((item) => {
                                    const isLegacy = !item.ingredientName;
                                    const invName = isLegacy ? (inventory.find(i => i.id === item.ingredientId)?.name || 'Không rõ') : item.ingredientName;
                                    const invUnit = isLegacy ? (inventory.find(i => i.id === item.ingredientId)?.unit || '') : item.baseUnit;

                                    return (
                                        <tr key={item.id} className={`hover:bg-gray-50/50 transition-colors ${item.isDeleted ? 'opacity-60 bg-gray-50' : ''}`}>
                                            <td className="font-normal text-[10px] text-gray-500 whitespace-nowrap" style={{ padding: '4px 8px' }}>{formatDateTime(item.timestamp)}</td>
                                            <td className="font-normal text-[10px] text-gray-900" style={{ padding: '4px 8px' }}>
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
                                                            className="bg-brand-600 hover:bg-[#0066DD] text-white p-1"
                                                            style={{ borderRadius: 'var(--radius-badge)' }}
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
                                                                className="opacity-100 [@media(hover:hover)]:opacity-0 group-hover/name:opacity-100 p-1 text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-all"
                                                                style={{ borderRadius: 'var(--radius-badge)' }}
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
                                            <td className="text-right font-normal text-[10px] text-gray-600 whitespace-nowrap" style={{ padding: '4px 8px' }}>
                                                {isLegacy ? '-' : `${item.quantity} ${item.importUnit} (x${item.volumePerUnit}${item.baseUnit})`}
                                            </td>
                                            <td className="text-right font-normal text-[10px] text-brand-600 bg-brand-50/20 whitespace-nowrap" style={{ padding: '4px 8px' }}>
                                                +{isLegacy ? item.quantity : item.addedStock} <span className="text-[9px] font-normal text-brand-400">{invUnit}</span>
                                            </td>
                                            <td className="text-right font-normal text-[10px] text-red-500 whitespace-nowrap" style={{ padding: '4px 8px' }}>
                                                -{formatVND(isLegacy ? item.cost : item.totalCost)}
                                            </td>
                                            <td className="text-right font-normal text-[10px] text-[#C68E5E] bg-orange-50/20 whitespace-nowrap" style={{ padding: '4px 8px' }}>
                                                {isLegacy ? (item.quantity > 0 ? formatVND(item.cost / item.quantity) : '-') : formatVND(item.costPerUnit)}
                                                <span className="text-[9px] text-gray-400">/{isLegacy ? invUnit : item.importUnit}</span>
                                            </td>
                                            <td className="text-right" style={{ padding: '4px 4px' }}>
                                                {showImportTrash ? (
                                                    hasPermission('inventory', 'delete') && (
                                                        <div className="flex flex-col gap-1 items-end">
                                                            <button 
                                                                onClick={() => handleRestoreImport(item.id)} 
                                                                className="flex items-center gap-1 text-green-500 hover:text-white hover:bg-green-500 px-2 py-1 font-black text-[10px] uppercase transition-all" 
                                                                style={{ borderRadius: 'var(--radius-badge)' }}
                                                                title="Khôi phục lại vào kho"
                                                            >
                                                                Khôi phục
                                                            </button>
                                                            <button
                                                                onClick={() => handlePermanentDeleteImport(item.id)}
                                                                className="flex items-center gap-1 text-red-400 hover:text-white hover:bg-red-500 px-2 py-1 font-black text-[10px] uppercase transition-all"
                                                                style={{ borderRadius: 'var(--radius-badge)' }}
                                                                title="Xóa vĩnh viễn khỏi hệ thống"
                                                            >
                                                                Xóa vĩnh viễn
                                                            </button>
                                                        </div>
                                                    )
                                                ) : (
                                                    !item.isDeleted && hasPermission('inventory', 'delete') && (
                                                        <button onClick={() => handleDeleteImport(item.id)} className="text-gray-300 hover:text-red-500 p-2 transition-colors hover:bg-red-50" style={{ borderRadius: 'var(--radius-badge)' }} title="Đưa vào thùng rác">
                                                            <Trash2 size={16} />
                                                        </button>
                                                    )
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
                                imports.length > 0 && <p className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em] bg-gray-50 px-4 py-1.5" style={{ borderRadius: 'var(--radius-badge)' }}>HẾT DỮ LIỆU NHẬP KHO</p>
                            )}
                        </div>

                    </div>
                </div>
            )}

            {inventorySubTab === 'raw' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative' }}>
                    {/* Hiển thị thanh công cụ Gộp nguyên liệu nếu chọn nhiều */}
                    {selectedMergeItems.length >= 2 && (
                        <div className="bg-brand-50 border border-brand-200 sticky top-0 z-10 shadow-sm flex items-center justify-between" style={{ padding: '16px',  borderRadius: 'var(--radius-btn)' }}>
                            <div className="flex items-center gap-3 text-brand-800">
                                <div className="bg-brand-600 text-white w-6 h-6 flex items-center justify-center font-bold text-sm shadow" style={{ borderRadius: 'var(--radius-badge)' }}>
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
                                    style={{ borderRadius: 'var(--radius-badge)' }}
                                >
                                    <Merge size={16} /> Bấm Gộp Liên Kết
                                </button>
                            </div>
                        </div>
                    )}
                    <div className="bg-white border border-gray-100 shadow-sm" style={{ borderRadius: 'var(--radius-card)', overflowX: 'auto' }}>
                        <table className="w-full text-left" style={{ minWidth: '620px' }}>
                            <thead>
                                <tr className="bg-gray-200 border-b border-gray-300">
                                    <th className="w-8 text-center text-[10px] font-bold text-gray-700 uppercase" style={{ padding: '5px 4px' }}>
                                    </th>
                                    <th className="text-[10px] font-bold text-gray-700 uppercase text-left whitespace-nowrap" style={{ padding: '5px 6px' }}>TT</th>
                                    <th className="text-[10px] font-bold text-gray-700 uppercase text-left whitespace-nowrap" style={{ padding: '5px 6px' }}>Nguyên liệu</th>
                                    <th className="text-[10px] font-bold text-[#C68E5E] uppercase text-right whitespace-nowrap" style={{ padding: '5px 6px' }}>Giá TB</th>
                                    <th className="text-[10px] font-bold text-gray-700 uppercase text-right whitespace-nowrap" style={{ padding: '5px 6px' }}>Cảnh báo</th>
                                    <th className="text-[10px] font-bold text-gray-700 uppercase text-right whitespace-nowrap" style={{ padding: '5px 6px' }}>Tồn hiện tại</th>
                                    <th className="text-[10px] font-bold text-green-600 uppercase text-right whitespace-nowrap" style={{ padding: '5px 6px' }}>Đã dùng</th>
                                    <th className="text-[10px] font-bold text-amber-600 uppercase text-right whitespace-nowrap" style={{ padding: '5px 6px' }}>Giá trị tiêu thụ</th>
                                    <th className="text-[10px] font-bold text-gray-700 uppercase text-right whitespace-nowrap" style={{ padding: '5px 6px' }}>TT</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {(() => {
                                    const latestProductionMap = memoizedProductionMap;

                                    return inventory.map((item, idx) => {
                                        const stat = inventoryStatsMapping[item.id] || { use1: 0, use7: 0, use30: 0, cost1: 0, cost7: 0, cost30: 0, avgCost: 0, usageQty: 0, usageCost: 0 };
                                        const isRange = inventoryReportMode === 'calendar' || inventoryPeriod === 'custom';
                                        const usedQty = isRange ? stat.usageQty : (inventoryPeriod === 'today' ? stat.use1 : inventoryPeriod === 'week' ? stat.use7 : inventoryPeriod === 'month' ? stat.use30 : inventoryPeriod === 'quarter' ? stat.useQuarter : inventoryPeriod === 'year' ? stat.useYear : stat.useAll);
                                        const usedCost = isRange ? stat.usageCost : (inventoryPeriod === 'today' ? stat.cost1 : inventoryPeriod === 'week' ? stat.cost7 : inventoryPeriod === 'month' ? stat.cost30 : inventoryPeriod === 'quarter' ? stat.costQuarter : inventoryPeriod === 'year' ? stat.costYear : stat.costAll);

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
                                                        className="w-4 h-4 text-brand-600 bg-white border-gray-300 focus:ring-brand-500 cursor-pointer"
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
                                                    {(() => {
                                                        const prodRecipe = latestProductionMap[item.id] || latestProductionMap[item.name];
                                                        return (
                                                            <>
                                                                <div className="flex items-center gap-2 group/ingredient">
                                                                    <p className="font-bold text-gray-900 text-[12px] tracking-tight">{item.name}</p>
                                                                    {/* Chỉ hiện nút [+] Nhập kho nếu KHÔNG PHẢI Bán thành phẩm */}
                                                                    {(hasPermission('inventory', 'edit') && !prodRecipe) && (
                                                                        <button
                                                                            onClick={async () => {
                                                                                let last = null;
                                                                                try {
                                                                                    const token = localStorage.getItem('authToken');
                                                                                    const res = await fetch(`${SERVER_URL}/api/imports/latest/${item.id}`, { headers: { 'Authorization': `Bearer ${token}` } });
                                                                                    if (res.ok) {
                                                                                        const data = await res.json();
                                                                                        if (data && data.id) last = data;
                                                                                    }
                                                                                } catch (e) {}

                                                                                if (!last) last = getLastImport(item);

                                                                                setEditImport({
                                                                                    name: item.name,
                                                                                    unit: item.unit,
                                                                                    importUnit: last ? (last.importUnit || 'hộp') : 'hộp',
                                                                                    volumePerUnit: last ? (last.volumePerUnit || 0) : 0,
                                                                                    costPerUnit: last ? (last.costPerUnit || 0) : 0,
                                                                                    quantity: last ? (last.quantity || 0) : 0
                                                                                });
                                                                            }}
                                                                            className="text-brand-600 bg-brand-50 hover:bg-brand-600 hover:text-white p-1 opacity-100 [@media(hover:hover)]:opacity-0 group-hover/ingredient:opacity-100 transition-all ml-1" style={{ borderRadius: 'var(--radius-badge)' }}
                                                                            title="Nhập kho nhanh"
                                                                        >
                                                                            <Plus size={14} strokeWidth={3} />
                                                                        </button>
                                                                    )}
                                                                    {prodRecipe && (
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
                                                                                className="text-brand-500 cursor-pointer opacity-40 hover:opacity-100 hover:text-brand-600 hover:bg-brand-50 p-1.5 -ml-1.5 transition-all group-hover/ingredient:opacity-100" style={{ borderRadius: 'var(--radius-badge)' }}
                                                                                title="Làm lại mẻ này"
                                                                            >
                                                                                <RefreshCw size={14} strokeWidth={2.5} />
                                                                            </button>
                                                                            {/* Tooltip Popup */}
                                                                            <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 hidden group-hover/tooltip:block bg-gray-900 text-white text-[12px] font-medium whitespace-nowrap z-50 shadow-xl border-l-4 border-brand-500 pointer-events-none w-max" style={{ paddingLeft: '16px', paddingRight: '16px', paddingTop: '12px', paddingBottom: '12px',  borderRadius: 'var(--radius-badge)' }}>
                                                                                <p className="text-brand-300 text-[9px] uppercase font-black tracking-widest mb-1.5 opacity-80">Bán thành phẩm chế biến</p>
                                                                                <div className="flex items-center font-mono">
                                                                                    {prodRecipe.inputs?.length > 0 ? prodRecipe.inputs.map(i => `${i.qty}${inventory.find(inv => inv.id === i.id || inv.name === i.name)?.unit || ''} ${i.name}`).join(' + ') : '---'}
                                                                                    <ArrowRightLeft size={12} className="text-amber-400 mx-3 opacity-60" />
                                                                                    <span className="text-brand-300 font-black">{prodRecipe.output?.qty}{prodRecipe.output?.unit || item.unit} {prodRecipe.output?.name}</span>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <div className="flex items-center gap-1.5 mt-1">
                                                                    {prodRecipe ? (
                                                                        <span className="text-[9px] font-black bg-orange-100 text-orange-600 px-1.5 py-0.5 uppercase tracking-widest whitespace-nowrap" style={{ borderRadius: 'var(--radius-badge)' }}>Bán thành phẩm</span>
                                                                    ) : (
                                                                        <span className="text-[9px] font-black bg-brand-50 text-brand-500 px-1.5 py-0.5 uppercase tracking-widest whitespace-nowrap" style={{ borderRadius: 'var(--radius-badge)' }}>Nguyên liệu</span>
                                                                    )}
                                                                    <p className="text-[10px] text-gray-400 font-normal bg-gray-100 inline-block px-1.5 py-0.5" style={{ borderRadius: 'var(--radius-badge)' }}>({item.unit})</p>
                                                                </div>
                                                            </>
                                                        );
                                                    })()}
                                                </td>
                                                <td className="px-8 py-6 text-right font-normal text-[12px] text-[#C68E5E] bg-orange-50/20">
                                                    {formatVND(stat.avgCost)} <span className="text-[10px] opacity-60">/{item.unit}</span>
                                                </td>
                                                <td className="px-8 py-6 text-right font-normal text-[12px] text-gray-500 bg-gray-50/50">{item.minStock}</td>
                                                <td className="px-8 py-6 text-right">
                                                    <div className="flex flex-col items-end">
                                                        <span className={`inline-block px-4 py-1.5 font-normal text-[12px] ${item.stock <= item.minStock ? 'bg-red-50 text-red-600 border border-red-200 shadow-sm shadow-red-100' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                                                            {item.stock} <span className="text-[10px] opacity-70">{item.unit}</span>
                                                        </span>
                                                        {item.stock <= item.minStock && (
                                                            <span className="text-[9px] font-normal text-red-500 uppercase mt-2 tracking-widest px-2 py-0.5 bg-red-50 animate-pulse" style={{ borderRadius: 'var(--radius-badge)' }}>CẦN NHẬP KHO</span>
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
                <div className="bg-white border border-gray-100 shadow-sm overflow-hidden flex" style={{ borderRadius: 'var(--radius-card)' }}>
                    {/* Right Side: List Full Width */}
                    <div className="flex-1 overflow-x-auto flex flex-col">
                        {/* Tổng chi phí Banner */}
                        <div className="bg-rose-50 border-b border-rose-100 flex justify-between items-center" style={{ padding: '24px' }}>
                            <div>
                                <p className="text-[10px] font-black uppercase text-rose-500 mb-1 tracking-widest">Tổng Tích Lũy Các Khoản Chi Phí</p>
                                <p className="text-3xl font-black text-rose-700 tracking-tighter">
                                    {formatVND(expenses.reduce((sum, e) => sum + Number(e.amount), 0))}
                                </p>
                            </div>
                            <div className="bg-white/60 text-rose-500" style={{ padding: '16px',  borderRadius: 'var(--radius-btn)' }}>
                                <DollarSign size={24} strokeWidth={3} />
                            </div>
                        </div>

                        <table className="w-full text-left" style={{ minWidth: '520px' }}>
                            <thead>
                                <tr className="bg-gray-100 border-b border-gray-200">
                                    <th className="text-[10px] font-black text-gray-500 uppercase whitespace-nowrap text-left" style={{ padding: '6px 8px' }}>Ngày</th>
                                    <th className="text-[10px] font-black text-gray-500 uppercase whitespace-nowrap text-left" style={{ padding: '6px 8px' }}>Nội dung chi</th>
                                    <th className="text-[10px] font-black text-gray-500 uppercase whitespace-nowrap text-left" style={{ padding: '6px 8px' }}>Phân loại</th>
                                    <th className="text-[10px] font-black text-rose-600 uppercase whitespace-nowrap text-right" style={{ padding: '6px 8px' }}>Số tiền</th>
                                    <th className="text-[10px] font-black text-gray-500 uppercase whitespace-nowrap text-right" style={{ padding: '6px 8px' }}>TT</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {expenses.sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date)).map((exp) => (
                                    <tr key={exp.id} className="hover:bg-brand-50/30 transition-colors group">
                                        <td className="text-[10px] font-medium text-gray-500 whitespace-nowrap" style={{ padding: '5px 8px' }}>{new Date(exp.timestamp || exp.date).toLocaleDateString('vi-VN')}</td>
                                        <td style={{ padding: '5px 8px' }}>
                                            <p className="text-[11px] font-bold text-gray-900 whitespace-nowrap max-w-[140px] truncate" title={exp.name}>{exp.name}</p>
                                            {exp.note && <p className="text-[9px] text-gray-400 truncate max-w-[140px]" title={exp.note}>{exp.note}</p>}
                                        </td>
                                        <td style={{ padding: '5px 8px' }}>
                                            <span className="inline-block bg-gray-100 text-gray-600 text-[9px] font-black uppercase whitespace-nowrap" style={{ padding: '2px 6px', borderRadius: 'var(--radius-badge)' }}>{exp.category}</span>
                                        </td>
                                        <td className="text-right font-bold text-rose-600 text-[11px] whitespace-nowrap" style={{ padding: '5px 8px' }}>{formatVND(exp.amount)}</td>
                                        <td className="text-right" style={{ padding: '5px 4px' }}>
                                            <div className="flex justify-end gap-1 opacity-100 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => setEditExpense(exp)} className="icon-btn-edit text-brand-500 hover:bg-brand-50"><Edit2 size={14} /></button>
                                                {hasPermission('inventory', 'edit') && (
                                                    <button onClick={() => deleteExpense(exp.id)} className="icon-btn-delete text-red-500 hover:bg-red-50"><Trash2 size={14} /></button>
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
        </React.Fragment>
    );
};

export default InventoryTab;
