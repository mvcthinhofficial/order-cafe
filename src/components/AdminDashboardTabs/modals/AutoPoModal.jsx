import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingCart, Copy, Download, Trash2, X, AlertTriangle, CheckCircle, ChefHat, RefreshCw } from 'lucide-react';
import { isInputFocused } from '../../../utils/ShortcutUtils.js';

const AutoPoModal = ({ SERVER_URL, showToast, formatVND, memoizedProductionMap, onClose, onRefreshImports }) => {
    const [rawMaterials, setRawMaterials] = useState([]);
    const [semiFinished, setSemiFinished] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    
    // Custom Confirm State: { type: 'PO' | 'PRODUCE', items: [...], totalCost: 0, validationErrors: [] }
    const [confirmModalData, setConfirmModalData] = useState(null);

    useEffect(() => {
        const fetchLowStock = async () => {
            try {
                const token = localStorage.getItem('authToken');
                const res = await fetch(`${SERVER_URL}/api/inventory-auto-po/low-stock`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    
                    const raws = [];
                    const semis = [];
                    
                    data.forEach(item => {
                        if (memoizedProductionMap && (memoizedProductionMap[item.id] || memoizedProductionMap[item.name])) {
                            // Tính suggestedQty dựa trên deficit so với minStock,
                            // làm tròn lên theo đúng kích thước mẻ tham chiếu
                            const recipeAudit = memoizedProductionMap[item.id] || memoizedProductionMap[item.name];
                            const refBatchQty = recipeAudit?.output?.qty || 1;
                            const deficit = Math.max(0, (item.minStock || 0) - (item.stock || 0));
                            const batches = deficit > 0 ? Math.ceil(deficit / refBatchQty) : 1;
                            semis.push({ ...item, suggestedQty: parseFloat((batches * refBatchQty).toFixed(3)) });
                        } else {
                            raws.push(item);
                        }
                    });
                    
                    setRawMaterials(raws);
                    setSemiFinished(semis);
                }
            } catch (e) {
                showToast('Lỗi khi lấy danh sách cảnh báo tồn kho', 'error');
            } finally {
                setIsLoading(false);
            }
        };
        fetchLowStock();
    }, [SERVER_URL, memoizedProductionMap, showToast]);

    useEffect(() => {
        const handleEsc = (e) => {
            if ((e.key === 'Escape' || (e.key === 'Backspace' && !isInputFocused()))) {
                if (confirmModalData) setConfirmModalData(null);
                else onClose();
            }
        };
        window.addEventListener('keydown', handleEsc, { capture: true });
        return () => window.removeEventListener('keydown', handleEsc, { capture: true });
    }, [onClose, confirmModalData]);

    const handleQtyChange = (id, newQty, type) => {
        if (type === 'raw') {
            setRawMaterials(prev => prev.map(item => item.id === id ? { ...item, suggestedQty: Math.max(0, parseFloat(newQty) || 0) } : item));
        } else {
            setSemiFinished(prev => prev.map(item => item.id === id ? { ...item, suggestedQty: Math.max(0, parseFloat(newQty) || 0) } : item));
        }
    };

    const handleCopyPOText = () => {
        const todayStr = new Date().toLocaleDateString('vi-VN');
        let text = `*ĐƠN NHẬP KHO (${todayStr})*\n\n`;
        let totalCost = 0;
        
        rawMaterials.filter(i => i.suggestedQty > 0).forEach(item => {
            text += `- ${item.name}: ${item.suggestedQty} ${item.importUnit}\n`;
            totalCost += item.suggestedQty * item.costPerUnit;
        });

        text += `\nDự kiến: ${formatVND(totalCost)}`;
        
        navigator.clipboard.writeText(text);
        showToast('Đã copy danh sách Mua Hàng!', 'success');
    };

    const handleCopyPrepText = () => {
        const todayStr = new Date().toLocaleDateString('vi-VN');
        let text = `*YÊU CẦU BẾP CHUẨN BỊ (${todayStr})*\nCác món bán thành phẩm dưới đây đã hết lượng tồn an toàn, vui lòng chế biến thêm:\n\n`;
        
        semiFinished.filter(i => i.suggestedQty > 0).forEach(item => {
            text += `- Cần chế biến: ${item.suggestedQty} ${item.unit} ${item.name}\n`;
        });
        
        navigator.clipboard.writeText(text);
        showToast('Đã copy danh sách Yêu cầu bếp!', 'success');
    };

    const triggerAutoImportConfirm = () => {
        const importPayload = rawMaterials.filter(i => i.suggestedQty > 0);
        if (importPayload.length === 0) return showToast('Không có nguyên liệu nào có số lượng > 0', 'error');
        
        const totalEstCost = importPayload.reduce((sum, i) => sum + (i.suggestedQty * i.costPerUnit), 0);
        setConfirmModalData({ type: 'PO', items: importPayload, totalCost: totalEstCost });
    };

    const executeAutoImport = async () => {
        setIsSaving(true);
        try {
            const payload = confirmModalData.items.map(i => ({
                name: i.name,
                unit: i.baseUnit,
                importUnit: i.importUnit,
                volumePerUnit: i.volumePerUnit,
                quantity: i.suggestedQty,
                costPerUnit: i.costPerUnit,
                minStock: i.minStock
            }));
            
            const token = localStorage.getItem('authToken');
            const res = await fetch(`${SERVER_URL}/api/imports/bulk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                showToast('Nhập kho hàng loạt thành công!', 'success');
                if (onRefreshImports) onRefreshImports();
                onClose();
            } else {
                const err = await res.json();
                showToast(err.error || 'Lỗi khi nhập phiếu', 'error');
            }
        } catch (e) {
            showToast('Lỗi kết nối', 'error');
        } finally {
            setIsSaving(false);
            setConfirmModalData(null);
        }
    };

    const triggerAutoProduceConfirm = async () => {
        const producePayload = semiFinished.filter(i => i.suggestedQty > 0);
        if (producePayload.length === 0) return showToast('Không có bán thành phẩm nào cần chế biến', 'error');
    
        // Tính toán Deduction (Trừ nguyên liệu thô) dựa trên Recipe Map
        const deductions = {}; // rawMaterialName -> {qty, cost}
        const validationErrors = [];
        
        /* Cần fetch thông tin Inventory để biết Tồn khả dụng của Nguyên Liệu */
        let currentInventory = [];
        try {
             const token = localStorage.getItem('authToken');
             const res = await fetch(`${SERVER_URL}/api/inventory`, { headers: { 'Authorization': `Bearer ${token}` } });
             if (res.ok) currentInventory = await res.json();
        } catch(e) {}
        
        producePayload.forEach(semi => {
            const recipeAudit = memoizedProductionMap[semi.id] || memoizedProductionMap[semi.name];
            if (!recipeAudit || !recipeAudit.output.qty) {
                validationErrors.push(`Món ${semi.name} không có lịch sử công thức để nội suy.`);
                return;
            }
            
            const scale = semi.suggestedQty / recipeAudit.output.qty; // Tỷ lệ phóng lớn mẻ
            
            recipeAudit.inputs.forEach(input => {
                const deductionQty = input.qty * scale;
                const invItem = currentInventory.find(inv => inv.id === input.id || inv.name === input.name); 
                
                if (!deductions[input.id]) {
                    deductions[input.id] = { 
                        name: input.name, 
                        totalQty: 0, 
                        unit: input.unit, 
                        availableStock: invItem?.stock || 0
                    };
                }
                deductions[input.id].totalQty += deductionQty;
            });
        });
        
        // Kiểm tra xem có khoản trừ nào vượt quá Kho thực tế không (API chặn nên ta báo trước)
        Object.values(deductions).forEach(d => {
             if (d.totalQty > d.availableStock) {
                 validationErrors.push(`[Thiếu Hụt] Cần ${d.totalQty.toFixed(1)} ${d.unit} ${d.name} nhưng kho hiện chỉ còn ${d.availableStock} ${d.unit}.`);
             }
        });
        
        const now = new Date();
        const dd = String(now.getDate()).padStart(2, '0');
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const yy = String(now.getFullYear()).slice(-2);
        const prodId = `CB-${dd}${mm}${yy}-${String(Date.now()).slice(-4)}`;
        setConfirmModalData({ 
            type: 'PRODUCE',
            prodId,
            items: producePayload, 
            deductions: Object.values(deductions),
            validationErrors 
        });
    };

    const executeAutoProduce = async () => {
        setIsSaving(true);
        try {
            const token = localStorage.getItem('authToken');
            
            // Xử lý song song gọi API produce cho từng món
            const promises = confirmModalData.items.map(async (semi) => {
                const recipeAudit = memoizedProductionMap[semi.id] || memoizedProductionMap[semi.name];
                const scale = semi.suggestedQty / recipeAudit.output.qty;
                
                const inputs = recipeAudit.inputs.map(input => ({
                    id: input.id,
                    qty: input.qty * scale,
                    // Giữ lại importPrice (nếu có the server sẽ tính lại avgCost)
                }));
                
                return fetch(`${SERVER_URL}/api/inventory/produce`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({
                        inputs,
                        outputItemName: semi.name,
                        outputQty: semi.suggestedQty,
                        outputUnit: semi.unit,
                        userName: 'Auto PO System'
                    })
                });
            });
            
            const results = await Promise.all(promises);
            const allOk = results.every(r => r.ok);
            
            if (allOk) {
                showToast('Đã trừ kho nguyên liệu thô & Cộng kho bán thành phẩm!', 'success');
                if (onRefreshImports) onRefreshImports();
                onClose();
            } else {
                showToast('Có món chưa thể chế biến do lỗi kho.', 'error');
            }
        } catch (e) {
            showToast('Lỗi kết nối khi chế biến', 'error');
        } finally {
            setIsSaving(false);
            setConfirmModalData(null);
        }
    };

    const totalEstCost = rawMaterials.reduce((sum, i) => sum + (i.suggestedQty * i.costPerUnit), 0);

    const handleConfirmPoEdit = (idx, field, value) => {
        if (!confirmModalData || confirmModalData.type !== 'PO') return;
        const newItems = [...confirmModalData.items];
        const parsedValue = field === 'importUnit' ? value : (parseFloat(value) || 0);
        newItems[idx] = { ...newItems[idx], [field]: parsedValue };
        const newTotalCost = newItems.reduce((sum, i) => sum + ((parseFloat(i.suggestedQty) || 0) * (parseFloat(i.costPerUnit) || 0)), 0);
        setConfirmModalData({ ...confirmModalData, items: newItems, totalCost: newTotalCost });
    };

    // Chỉnh sửa số lượng chế biến — tính lại deductions động khi user thay số
    const handleConfirmProduceEdit = (idx, newQty) => {
        if (!confirmModalData || confirmModalData.type !== 'PRODUCE') return;
        const newItems = [...confirmModalData.items];
        const parsedQty = Math.max(0, parseFloat(newQty) || 0);
        newItems[idx] = { ...newItems[idx], suggestedQty: parsedQty };

        const newDeductionsMap = {};
        newItems.forEach(semi => {
            const recipeAudit = memoizedProductionMap[semi.id] || memoizedProductionMap[semi.name];
            if (!recipeAudit?.output?.qty) return;
            const scale = semi.suggestedQty / recipeAudit.output.qty;
            recipeAudit.inputs.forEach(input => {
                const key = input.id || input.name;
                const deductionQty = input.qty * scale;
                if (!newDeductionsMap[key]) {
                    const existing = confirmModalData.deductions.find(d => d.name === input.name);
                    newDeductionsMap[key] = { name: input.name, totalQty: 0, unit: input.unit, availableStock: existing?.availableStock || 0 };
                }
                newDeductionsMap[key].totalQty += deductionQty;
            });
        });

        const newDeductions = Object.values(newDeductionsMap);
        const newValidationErrors = [];
        newDeductions.forEach(d => {
            if (d.totalQty > d.availableStock) {
                newValidationErrors.push(`[Thiếu Hụt] Cần ${d.totalQty.toFixed(1)} ${d.unit} ${d.name} nhưng kho hiện chỉ còn ${d.availableStock} ${d.unit}.`);
            }
        });

        setConfirmModalData({ ...confirmModalData, items: newItems, deductions: newDeductions, validationErrors: newValidationErrors });
    };
    return (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 sm:p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose} className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="bg-white shadow-2xl relative z-10 flex flex-col w-[95vw] sm:w-[90vw] md:max-w-6xl h-[90vh] sm:h-[85vh]" style={{ borderRadius: 'var(--radius-card)' }}>
                
                {/* --- LỚP PHỦ CONFIRM MODAL OVERRIDE --- */}
                <AnimatePresence>
                    {confirmModalData && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-50 bg-white/95 backdrop-blur-md flex flex-col p-3 sm:p-6 lg:p-8" style={{ borderRadius: 'var(--radius-card)' }}>
                            <div className="flex-1 flex flex-col max-w-5xl mx-auto w-full h-full">
                                {confirmModalData.type === 'PO' && (
                                    <div className="flex flex-col h-full">
                                        <div className="text-center mb-4 sm:mb-6">
                                            <div className="inline-flex w-12 h-12 sm:w-16 sm:h-16 bg-brand-100 text-brand-600 rounded-full items-center justify-center mb-2 sm:mb-4">
                                                <ShoppingCart size={24} className="sm:w-8 sm:h-8" />
                                            </div>
                                            <h3 className="text-lg sm:text-2xl font-black text-gray-900 uppercase tracking-tight">XÁC NHẬN PHIẾU NHẬP HÀNG</h3>
                                            <p className="text-xs sm:text-sm text-gray-500 font-medium">Phiếu nhập sẽ được gộp tự động vào sổ sách ngay khi bạn đồng ý.</p>
                                        </div>
                                        
                                        <div className="flex-1 overflow-y-auto bg-white border border-gray-200 shadow-sm mb-4 sm:mb-6 flex flex-col" style={{ borderRadius: 'var(--radius-card)' }}>
                                            <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 sm:px-6 sm:py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                                                <div>
                                                    <p className="font-bold border border-brand-200 bg-brand-50 text-brand-700 px-3 py-1 uppercase text-xs sm:text-sm inline-block" style={{ borderRadius: 'var(--radius-badge)' }}>Phiếu nhập hàng</p>
                                                    <p className="text-[11px] sm:text-xs text-gray-500 mt-2">Hệ thống tạo tự động từ Cảnh báo tồn kho thấp</p>
                                                </div>
                                                <div className="text-left sm:text-right">
                                                    <p className="text-xs sm:text-sm font-bold text-gray-400">Ngày lập: {new Date().toLocaleDateString('vi-VN')}</p>
                                                </div>
                                            </div>
                                            
                                            <div className="flex-1 overflow-y-auto p-3 sm:p-6 bg-gray-50/50">
                                                <div className="space-y-3">
                                                    {confirmModalData.items.map((i, idx) => (
                                                        <div key={idx} className="bg-white border border-gray-200 rounded-xl p-3 sm:p-4 shadow-sm hover:shadow-md transition-shadow">
                                                            
                                                            {/* Hàng 1: Tên & Quy cách */}
                                                            <div className="border-b border-gray-100 pb-3 mb-3">
                                                                <h4 className="font-black text-gray-900 text-sm sm:text-base">{i.name}</h4>
                                                                <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-2 flex-wrap">
                                                                    <span className="font-medium">Nhập:</span>
                                                                    <input type="text" 
                                                                           className="w-[45px] text-center text-gray-900 bg-gray-50 border border-gray-200 rounded outline-none p-0.5 focus:ring-1 focus:ring-brand-400 focus:bg-white font-bold transition-colors" 
                                                                           value={i.importUnit} 
                                                                           onChange={(e) => handleConfirmPoEdit(idx, 'importUnit', e.target.value)} />
                                                                    <span className="text-gray-300 mx-0.5">•</span>
                                                                    <span className="whitespace-nowrap font-medium">1 {i.importUnit} =</span>
                                                                    <div className="inline-flex items-center bg-gray-50 border border-gray-200 rounded overflow-hidden shadow-sm focus-within:ring-1 focus-within:ring-brand-400 focus-within:bg-white transition-colors">
                                                                        <button onClick={() => handleConfirmPoEdit(idx, 'volumePerUnit', Math.max(0, parseFloat(i.volumePerUnit) - 1))} className="px-2 py-0.5 bg-gray-100 text-gray-500 hover:bg-gray-200 font-bold border-r border-gray-200 transition-colors leading-none">−</button>
                                                                        <input type="number" 
                                                                               className="w-10 text-center text-gray-900 bg-transparent outline-none p-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none font-bold leading-none" 
                                                                               value={i.volumePerUnit === 0 ? '' : i.volumePerUnit} 
                                                                               onChange={(e) => handleConfirmPoEdit(idx, 'volumePerUnit', e.target.value)} />
                                                                        <button onClick={() => handleConfirmPoEdit(idx, 'volumePerUnit', (parseFloat(i.volumePerUnit) || 0) + 1)} className="px-2 py-0.5 bg-gray-100 text-gray-500 hover:bg-gray-200 font-bold border-l border-gray-200 transition-colors leading-none">+</button>
                                                                    </div>
                                                                    <span className="font-medium">{i.baseUnit}</span>
                                                                </div>
                                                            </div>
                                                            
                                                            {/* Hàng 2: Số lượng, Đơn giá & Thành tiền */}
                                                            <div className="flex flex-wrap items-end justify-between gap-3">
                                                                <div>
                                                                    <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">SL Nhập</p>
                                                                    <div className="inline-flex items-center gap-0 bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm focus-within:ring-1 focus-within:ring-brand-400 transition-colors">
                                                                        <button onClick={() => handleConfirmPoEdit(idx, 'suggestedQty', Math.max(0, (parseFloat(i.suggestedQty) || 0) - 1))} className="px-2 py-1.5 bg-gray-50 text-brand-600 hover:bg-brand-50 hover:text-brand-700 font-black border-r border-gray-200 transition-colors leading-none">−</button>
                                                                        <input type="number" 
                                                                               className="w-10 text-center font-black text-brand-700 bg-transparent outline-none py-1.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none leading-none"
                                                                               value={i.suggestedQty === 0 ? '' : i.suggestedQty} 
                                                                               onChange={(e) => handleConfirmPoEdit(idx, 'suggestedQty', e.target.value)} />
                                                                        <button onClick={() => handleConfirmPoEdit(idx, 'suggestedQty', (parseFloat(i.suggestedQty) || 0) + 1)} className="px-2 py-1.5 bg-gray-50 text-brand-600 hover:bg-brand-50 hover:text-brand-700 font-black border-l border-gray-200 transition-colors leading-none">+</button>
                                                                    </div>
                                                                </div>
                                                                
                                                                <div>
                                                                    <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1 text-center">Đơn giá / {i.importUnit}</p>
                                                                    <div className="inline-flex items-center bg-white border border-gray-200 rounded-lg overflow-hidden justify-end focus-within:ring-1 focus-within:ring-gray-400 shadow-sm transition-colors w-[120px] sm:w-[140px]">
                                                                        <button onClick={() => handleConfirmPoEdit(idx, 'costPerUnit', Math.max(0, (parseFloat(i.costPerUnit) || 0) - 1))} className="px-2 py-1.5 bg-gray-50 text-gray-500 hover:bg-gray-100 font-bold border-r border-gray-200 hover:text-gray-800 transition-colors leading-none">−</button>
                                                                        <input type="number" 
                                                                               className="w-full text-right font-bold text-gray-800 bg-transparent outline-none py-1.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none leading-none text-sm"
                                                                               value={i.costPerUnit === 0 ? '' : i.costPerUnit} 
                                                                               onChange={(e) => handleConfirmPoEdit(idx, 'costPerUnit', e.target.value)} />
                                                                        <span className="text-gray-500 font-bold pointer-events-none select-none shrink-0 text-xs py-1.5 pr-1">.000đ</span>
                                                                        <button onClick={() => handleConfirmPoEdit(idx, 'costPerUnit', (parseFloat(i.costPerUnit) || 0) + 1)} className="px-2 py-1.5 bg-gray-50 text-gray-500 hover:bg-gray-100 font-bold border-l border-gray-200 hover:text-gray-800 transition-colors leading-none">+</button>
                                                                    </div>
                                                                </div>

                                                                <div className="text-right shrink-0">
                                                                    <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Thành tiền</p>
                                                                    <p className="font-black text-amber-600 text-base sm:text-lg mb-1">{formatVND((parseFloat(i.suggestedQty) || 0) * (parseFloat(i.costPerUnit) || 0))}</p>
                                                                </div>
                                                            </div>
                                                            
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                            
                                            <div className="bg-amber-50 border-t border-amber-100 p-4 sm:p-6 flex justify-between items-center flex-col sm:flex-row md:flex-row gap-2 sm:gap-4">
                                                <div className="text-center sm:text-left">
                                                    <p className="text-[10px] sm:text-xs font-black text-amber-700/60 uppercase tracking-widest mb-1">Tổng số tiền thanh toán</p>
                                                    <p className="text-[10px] sm:text-xs text-amber-700/80">Cho toàn bộ {confirmModalData.items.length} hạng mục</p>
                                                </div>
                                                <p className="text-2xl sm:text-3xl font-black text-amber-600">{formatVND(confirmModalData.totalCost)}</p>
                                            </div>
                                        </div>
                                        
                                        <div className="flex gap-2 sm:gap-4 mt-auto">
                                            <button onClick={() => setConfirmModalData(null)} disabled={isSaving} className="flex-1 py-3 sm:py-4 bg-gray-100 text-gray-600 font-black uppercase text-xs sm:text-base tracking-widest hover:bg-gray-200 transition-colors" style={{ borderRadius: 'var(--radius-btn)' }}>QUAY LẠI</button>
                                            <button onClick={executeAutoImport} disabled={isSaving} className="flex-1 py-3 sm:py-4 bg-brand-600 text-white font-black uppercase text-xs sm:text-base tracking-widest hover:bg-brand-700 transition-colors shadow-lg shadow-brand-600/30 disabled:opacity-50" style={{ borderRadius: 'var(--radius-btn)' }}>{isSaving ? 'ĐANG CẬP NHẬT...' : 'XÁC NHẬN'}</button>
                                        </div>
                                    </div>
                                )}
                                
                                {confirmModalData.type === 'PRODUCE' && (
                                    <div className="flex flex-col h-full max-w-5xl mx-auto w-full">
                                        <div className="text-center mb-6">
                                            <div className="inline-flex w-16 h-16 bg-orange-100 text-orange-600 rounded-full items-center justify-center mb-4">
                                                <ChefHat size={32} />
                                            </div>
                                            <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tight">XÁC NHẬN PHIẾU LỆNH CHẾ BIẾN</h3>
                                            <p className="text-gray-500 font-medium">Hệ thống sẽ ngay lập tức đối trừ kho nguyên liệu và nạp tồn kho bán thành phẩm.</p>
                                        </div>
                                        
                                        <div className="flex-1 overflow-y-auto bg-white border border-gray-200 shadow-sm mb-6 flex flex-col" style={{ borderRadius: 'var(--radius-card)' }}>
                                            <div className="bg-gray-50 border-b border-gray-200 px-6 py-4 flex justify-between items-center">
                                                <div>
                                                    <p className="font-bold text-gray-900 flex items-center gap-2"><span className="text-orange-600 font-mono tracking-wider">{confirmModalData.prodId || `PROD-${Date.now().toString().slice(-6)}`}</span></p>
                                                    <p className="text-xs text-gray-500 mt-1">Lệnh sản xuất hàng loạt dựa trên lịch sử công thức</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-sm font-bold text-gray-400">Ngày lập: {new Date().toLocaleDateString('vi-VN')}</p>
                                                </div>
                                            </div>
                                            
                                            <div className="flex-1 overflow-x-auto p-6 flex flex-col gap-6">
                                                {/* Output SECTION */}
                                                <div>
                                                    <h4 className="font-black text-sm text-green-600 uppercase mb-3 flex items-center gap-2">
                                                        <span className="w-2 h-2 bg-green-500 rounded-full inline-block"></span> MỤC TIÊU THU ĐƯỢC (CỘNG KHO)
                                                    </h4>
                                                    <div className="border border-green-200 rounded-lg overflow-hidden">
                                                        <table className="w-full text-left" style={{ minWidth: '400px' }}>
                                                            <thead>
                                                                <tr className="bg-green-50/50 border-b border-green-100 text-xs font-black text-green-700 uppercase tracking-wider">
                                                                    <th className="p-3">Bán Thành Phẩm</th>
                                                                    <th className="p-3 text-right">Lượng chế biến</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-green-50">
                                                                {confirmModalData.items.map((i, idx) => {
                                                                    const audit = memoizedProductionMap?.[i.id] || memoizedProductionMap?.[i.name];
                                                                    const refBatch = audit?.output?.qty || 1;
                                                                    return (
                                                                        <tr key={idx}>
                                                                            <td className="p-3">
                                                                                <p className="font-bold text-gray-900 text-sm">{i.name}</p>
                                                                                {audit && <p className="text-[10px] text-gray-400 mt-0.5">Mẻ gốc: {refBatch} {i.unit} → {audit.inputs?.map(inp => `${inp.qty}${inp.unit} ${inp.name}`).join(' + ')}</p>}
                                                                            </td>
                                                                            <td className="p-3 text-right">
                                                                                <div className="inline-flex items-center bg-green-50 border border-green-200 rounded-lg overflow-hidden shadow-sm focus-within:ring-1 focus-within:ring-green-400 transition-colors">
                                                                                    <button onClick={() => handleConfirmProduceEdit(idx, Math.max(0, (parseFloat(i.suggestedQty)||0) - refBatch))} className="px-2.5 py-1.5 bg-green-100 text-green-700 hover:bg-green-200 font-black border-r border-green-200 transition-colors leading-none">−</button>
                                                                                    <input
                                                                                        type="number"
                                                                                        className="w-20 text-center font-black text-green-700 bg-transparent outline-none py-1.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none leading-none"
                                                                                        value={i.suggestedQty === 0 ? '' : i.suggestedQty}
                                                                                        onChange={e => handleConfirmProduceEdit(idx, e.target.value)}
                                                                                    />
                                                                                    <span className="text-green-600 font-bold text-xs px-2 pointer-events-none select-none">{i.unit}</span>
                                                                                    <button onClick={() => handleConfirmProduceEdit(idx, (parseFloat(i.suggestedQty)||0) + refBatch)} className="px-2.5 py-1.5 bg-green-100 text-green-700 hover:bg-green-200 font-black border-l border-green-200 transition-colors leading-none">+</button>
                                                                                </div>
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                                
                                                {/* Input SECTION */}
                                                <div>
                                                    <h4 className="font-black text-sm text-red-500 uppercase mb-3 flex items-center gap-2">
                                                        <span className="w-2 h-2 bg-red-500 rounded-full inline-block"></span> NGUYÊN LIỆU ĐỐI TRỪ (TRỪ KHO)
                                                    </h4>
                                                    <div className="border border-red-200 rounded-lg overflow-hidden">
                                                        <table className="w-full text-left" style={{ minWidth: '400px' }}>
                                                            <thead>
                                                                <tr className="bg-red-50/50 border-b border-red-100 text-xs font-black text-red-700 uppercase tracking-wider">
                                                                    <th className="p-3">Nguyên liệu thô</th>
                                                                    <th className="p-3 text-center">Tồn kho hiện hữu</th>
                                                                    <th className="p-3 text-right">Lượng tiêu hao dự kiến</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-red-50">
                                                                {confirmModalData.deductions.map((d, idx) => (
                                                                    <tr key={idx} className={d.totalQty > d.availableStock ? 'bg-red-50/80' : ''}>
                                                                        <td className="p-3 font-bold text-gray-900 text-sm">{d.name}</td>
                                                                        <td className="p-3 text-center font-medium text-gray-500 text-sm">{d.availableStock} {d.unit}</td>
                                                                        <td className="p-3 text-right">
                                                                            <span className={`inline-block font-black px-3 py-1 text-sm rounded ${d.totalQty > d.availableStock ? 'bg-red-600 text-white shadow-sm' : 'bg-red-100 text-red-600'}`}>
                                                                                -{d.totalQty.toFixed(1)} {d.unit}
                                                                            </span>
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                                
                                                {/* Lỗi */}
                                                {confirmModalData.validationErrors.length > 0 && (
                                                    <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg p-4 mt-2">
                                                        <p className="font-black text-sm mb-2 flex items-center gap-2"><AlertTriangle size={16} /> LỆNH CẤM THỰC THI (KHO KHÔNG ĐỦ HÀNG)</p>
                                                        <ul className="list-disc pl-6 text-sm font-medium space-y-1">
                                                            {confirmModalData.validationErrors.map((err, i) => <li key={i}>{err}</li>)}
                                                        </ul>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        
                                        <div className="flex gap-4 mt-auto">
                                            <button onClick={() => setConfirmModalData(null)} disabled={isSaving} className="flex-1 py-4 bg-gray-100 text-gray-600 font-black uppercase tracking-widest hover:bg-gray-200 transition-colors" style={{ borderRadius: 'var(--radius-btn)' }}>QUAY LẠI</button>
                                            {confirmModalData.validationErrors.length === 0 ? (
                                                <button onClick={executeAutoProduce} disabled={isSaving} className="flex-1 py-4 bg-orange-600 text-white font-black uppercase tracking-widest hover:bg-orange-700 transition-colors shadow-lg shadow-orange-600/30 disabled:opacity-50" style={{ borderRadius: 'var(--radius-btn)' }}>{isSaving ? 'ĐANG LƯU KHO...' : 'XÁC NHẬN'}</button>
                                            ) : (
                                                <button disabled className="flex-1 py-4 bg-gray-300 text-gray-400 font-black uppercase tracking-widest cursor-not-allowed" style={{ borderRadius: 'var(--radius-btn)' }}>KHÔNG THỂ THỰC THI LỆNH</button>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Header */}
                <div className="flex justify-between items-center bg-red-50 border-b border-red-100" style={{ padding: 'clamp(16px, 3vw, 24px)', borderTopLeftRadius: 'var(--radius-card)', borderTopRightRadius: 'var(--radius-card)' }}>
                    <div className="flex items-center gap-3 text-red-600">
                        <AlertTriangle size={24} />
                        <div>
                            <h3 className="font-black uppercase tracking-widest text-sm sm:text-lg">CẢNH BÁO TỒN KHO THÔNG MINH</h3>
                            <p className="text-[11px] sm:text-xs text-red-500 font-medium">Hệ thống phân tách nhu cầu Mua nhập và Chế biến nội bộ</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-red-400 hover:bg-red-100 hover:text-red-700 transition" style={{ borderRadius: 'var(--radius-badge)' }}><X size={24} /></button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto" style={{ padding: 'clamp(12px, 2vw, 24px)' }}>
                    {isLoading ? (
                        <div className="flex justify-center py-20 text-brand-600"><div className="animate-spin rounded-full h-10 w-10 border-b-4 border-brand-600"></div></div>
                    ) : (rawMaterials.length === 0 && semiFinished.length === 0) ? (
                        <div className="text-center py-20">
                            <CheckCircle size={48} className="mx-auto text-green-500 mb-4" />
                            <p className="text-gray-500 font-bold uppercase tracking-widest text-sm">Tuyệt vời! Không có mặt hàng nào thiếu hụt.</p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-8">
                            
                            {/* KHU VỰC 1: BÁN THÀNH PHẨM (YÊU CẦU CHẾ BIẾN) */}
                            {semiFinished.length > 0 && (
                                <div>
                                    <div className="flex justify-between items-end mb-3">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-600 flex justify-center items-center">
                                                <ChefHat size={16} />
                                            </div>
                                            <div>
                                                <h4 className="font-black text-orange-600 uppercase tracking-widest text-sm">Cần Chế Biến Thêm</h4>
                                                <p className="text-gray-500 text-[10px]">Bán thành phẩm sắp hết, dùng nguyên liệu để chế biến</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={handleCopyPrepText} className="border border-orange-500 text-orange-500 hover:bg-orange-50 px-3 py-1.5 font-bold text-[10px] uppercase tracking-widest transition-all gap-1.5 hidden flex-none items-center sm:flex" style={{ borderRadius: 'var(--radius-badge)' }}>
                                                <Copy size={12} /> Zalo Y/C Bếp
                                            </button>
                                            <button onClick={triggerAutoProduceConfirm} className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-1.5 font-bold text-[10px] uppercase tracking-widest transition-all shadow-md flex justify-center items-center gap-1.5" style={{ borderRadius: 'var(--radius-badge)' }}>
                                                <RefreshCw size={12} /> Chế Biến Tự Động
                                            </button>
                                        </div>
                                    </div>
                                    <div className="overflow-x-auto border border-orange-200" style={{ borderRadius: 'var(--radius-btn)' }}>
                                        <table className="w-full text-left" style={{ minWidth: '500px' }}>
                                            <thead>
                                                <tr className="bg-orange-50 border-b border-orange-100">
                                                    <th className="text-xs font-black text-orange-700 uppercase p-3">Bán Thành Phẩm</th>
                                                    <th className="text-xs font-black text-orange-700 uppercase p-3 text-right">Tồn hiện tại</th>
                                                    <th className="text-xs font-black text-red-500 uppercase p-3 text-right">Cảnh báo</th>
                                                    <th className="text-xs font-black text-orange-600 uppercase p-3 text-right">Cần Chế Biến Thêm</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-orange-100">
                                                {semiFinished.map(item => (
                                                    <tr key={item.id} className="hover:bg-orange-50/50">
                                                        <td className="p-3">
                                                            <p className="font-bold text-gray-900 text-[13px]">{item.name}</p>
                                                        </td>
                                                        <td className="p-3 text-right font-bold text-gray-700 text-xs">
                                                            {item.stock} <span className="font-normal text-[10px]">{item.unit}</span>
                                                        </td>
                                                        <td className="p-3 text-right font-bold text-red-500 text-xs">
                                                            {item.minStock} <span className="font-normal text-[10px]">{item.unit}</span>
                                                        </td>
                                                        <td className="p-3 text-right">
                                                            <div className="flex items-center justify-end gap-2">
                                                                <input 
                                                                    type="number" 
                                                                    min="0"
                                                                    value={item.suggestedQty} 
                                                                    onChange={e => handleQtyChange(item.id, e.target.value, 'semi')}
                                                                    className="admin-input !w-20 text-right bg-white border-orange-200 font-bold !text-orange-900 !py-1 !px-2 focus:ring-orange-500"
                                                                    style={{ minHeight: '32px' }}
                                                                />
                                                                <span className="text-[11px] font-bold text-gray-400 w-10 text-left">{item.unit}</span>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* KHU VỰC 2: NGUYÊN LIỆU (YÊU CẦU MUA NGOÀI) */}
                            {rawMaterials.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-600 flex justify-center items-center">
                                            <ShoppingCart size={16} />
                                        </div>
                                        <div>
                                            <h4 className="font-black text-brand-600 uppercase tracking-widest text-sm">Gợi ý Nhập Kho (Nguyên Liệu)</h4>
                                            <p className="text-gray-500 text-[10px]">Cần đặt mua thêm từ nhà cung cấp</p>
                                        </div>
                                    </div>
                                    <div className="overflow-x-auto border border-brand-200" style={{ borderRadius: 'var(--radius-btn)' }}>
                                        <table className="w-full text-left" style={{ minWidth: '600px' }}>
                                            <thead>
                                                <tr className="bg-brand-50 border-b border-brand-100">
                                                    <th className="text-xs font-black text-brand-700 uppercase p-3">Nguyên liệu</th>
                                                    <th className="text-xs font-black text-brand-700 uppercase p-3 text-right">Tồn hiện tại</th>
                                                    <th className="text-xs font-black text-red-500 uppercase p-3 text-right">Cảnh báo</th>
                                                    <th className="text-xs font-black text-brand-600 uppercase p-3 text-right">Cần đặt (Đề xuất)</th>
                                                    <th className="text-xs font-black text-amber-600 uppercase p-3 text-right">Đơn giá<span className="font-normal text-amber-400 ml-1 text-[9px]">.000đ/đv</span></th>
                                                    <th className="text-xs font-black text-amber-700 uppercase p-3 text-right">Thành tiền</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-brand-100">
                                                {rawMaterials.map(item => (
                                                    <tr key={item.id} className="hover:bg-brand-50/30">
                                                        <td className="p-3">
                                                            <p className="font-bold text-gray-900 text-[13px]">{item.name}</p>
                                                            <p className="text-[10px] text-gray-400">1 {item.importUnit} = {item.volumePerUnit} {item.baseUnit}</p>
                                                        </td>
                                                        <td className="p-3 text-right font-bold text-gray-700 text-xs">
                                                            {item.stock} <span className="font-normal text-[10px]">{item.unit}</span>
                                                        </td>
                                                        <td className="p-3 text-right font-bold text-red-500 text-xs">
                                                            {item.minStock} <span className="font-normal text-[10px]">{item.unit}</span>
                                                        </td>
                                                        <td className="p-3 text-right">
                                                            <div className="flex items-center justify-end gap-2">
                                                                <input 
                                                                    type="number" 
                                                                    min="0"
                                                                    value={item.suggestedQty} 
                                                                    onChange={e => handleQtyChange(item.id, e.target.value, 'raw')}
                                                                    className="admin-input !w-20 text-right bg-white border-brand-300 font-bold !text-brand-900 !py-1 !px-2 focus:ring-brand-500"
                                                                    style={{ minHeight: '32px' }}
                                                                />
                                                                <span className="text-[11px] font-bold text-gray-400 w-10 text-left">{item.importUnit}</span>
                                                            </div>
                                                        </td>
                                                        <td className="p-3 text-right bg-amber-50/30">
                                                            <p className="font-bold text-gray-800 text-sm">{item.costPerUnit > 0 ? item.costPerUnit : '—'}<span className="text-gray-400 font-normal text-[10px] ml-0.5">.000đ</span></p>
                                                        </td>
                                                        <td className="p-3 text-right font-black text-amber-700 text-sm bg-amber-50/50">
                                                            {item.costPerUnit > 0 ? formatVND(item.suggestedQty * item.costPerUnit) : <span className="text-gray-300 font-normal text-xs">Chưa có giá</span>}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                        </div>
                    )}
                </div>

                {/* Footer */}
                {(rawMaterials.length > 0 || semiFinished.length > 0) && (
                    <div className="bg-gray-50 border-t border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-4" style={{ padding: 'clamp(16px, 3vw, 24px)', borderBottomLeftRadius: 'var(--radius-card)', borderBottomRightRadius: 'var(--radius-card)' }}>
                        <div className="flex flex-col text-center sm:text-left">
                            {rawMaterials.length > 0 ? (
                                <>
                                    <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Tổng phí Mua NL ước tính</span>
                                    <span className="text-xl sm:text-2xl font-black text-amber-600 tracking-tighter">{formatVND(totalEstCost)}</span>
                                </>
                            ) : (
                                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mt-2">{semiFinished.length} món bị thiếu kho</span>
                            )}
                        </div>
                        <div className="flex flex-wrap sm:flex-nowrap gap-3 w-full sm:w-auto">
                            {semiFinished.length > 0 && rawMaterials.length === 0 && (
                                <button onClick={handleCopyPrepText} className="flex-1 sm:flex-none border border-orange-500 text-orange-500 hover:bg-orange-50 px-5 sm:px-8 py-3 font-black text-[11px] uppercase tracking-widest transition-all flex justify-center items-center gap-2" style={{ borderRadius: 'var(--radius-badge)' }}>
                                    <Copy size={16} /> Báo Y/c Tới Bếp (Zalo)
                                </button>
                            )}
                            
                            {rawMaterials.length > 0 && (
                                <>
                                    <button onClick={handleCopyPOText} className="flex-1 sm:flex-none border border-brand-600 text-brand-600 hover:bg-brand-50 px-5 sm:px-8 py-3 font-black text-[11px] uppercase tracking-widest transition-all flex justify-center items-center gap-2" style={{ borderRadius: 'var(--radius-badge)' }}>
                                        <Copy size={16} /> Báo Mua NL (Zalo)
                                    </button>
                                    <button onClick={triggerAutoImportConfirm} disabled={isSaving} className="flex-1 sm:flex-none bg-brand-600 hover:bg-[#0066DD] text-white px-5 sm:px-8 py-3 font-black text-[11px] uppercase tracking-widest transition-all shadow-md flex justify-center items-center gap-2 disabled:opacity-50" style={{ borderRadius: 'var(--radius-badge)' }}>
                                        {isSaving ? <span className="animate-spin">⌛</span> : <ShoppingCart size={16} />} 
                                        Nhập PO Tự Động
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </motion.div>
        </div>
    );
};

export default AutoPoModal;
