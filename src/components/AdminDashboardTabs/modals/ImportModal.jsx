import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Save, X, Plus, Trash2, Search, Package, TrendingUp } from 'lucide-react';
import { formatVND } from '../../../utils/dashboardUtils';

const ImportModal = ({ inventory, inventoryStats = [], onSave, onClose, initialData = null, memoizedProductionMap = {} }) => {
    const safeInventory = Array.isArray(inventory) ? inventory : [];

    useEffect(() => {
        const handleEsc = (e) => {
            if ((e.key === 'Escape' || (e.key === 'Backspace' && !isInputFocused()))) onClose();
        };
        window.addEventListener('keydown', handleEsc, { capture: true });
        return () => window.removeEventListener('keydown', handleEsc, { capture: true });
    }, [onClose]);

    const [draft, setDraft] = useState(initialData || {
        name: '',
        unit: 'g',
        importUnit: 'hộp',
        quantity: 0,
        volumePerUnit: 0,
        costPerUnit: 0
    });

    const calculateTotalAdded = () => {
        return (parseFloat(draft.quantity) || 0) * (parseFloat(draft.volumePerUnit) || 0);
    };

    const calculateTotalCost = () => {
        return (parseFloat(draft.quantity) || 0) * (parseFloat(draft.costPerUnit) || 0);
    };

    const handleNameChange = (val) => {
        const found = safeInventory.find(i => i.name.toLowerCase().trim() === val.toLowerCase().trim());
        if (found) {
            setDraft({ ...draft, name: val, unit: found.unit });
        } else {
            setDraft({ ...draft, name: val });
        }
    };

    return (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-6 sm:p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="admin-modal-container max-w-lg w-full max-h-[90vh] overflow-y-auto">
                <h3 className="font-black text-gray-900 uppercase tracking-widest text-sm text-center mb-6">Lập phiếu nhập kho</h3>

                <div className="space-y-5">
                    {/* Hàng 1: Tên S/P và Đơn vị */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="admin-label flex items-center gap-1">Tên nguyên liệu <span className="text-red-500">*</span></label>
                            <input type="text" list="inventory-names" placeholder="VD: Sữa đặc" className="admin-input"
                                value={draft.name} onChange={e => handleNameChange(e.target.value)} />
                            <datalist id="inventory-names">
                                {safeInventory.filter(inv => !memoizedProductionMap[inv.id] && !memoizedProductionMap[inv.name]).map(inv => <option key={inv.id || Math.random()} value={inv.name} />)}
                            </datalist>
                            {/* Display avgCost if known */}
                            {(() => {
                                const found = safeInventory.find(i => i.name.toLowerCase().trim() === draft.name.toLowerCase().trim());
                                const stat = found ? inventoryStats.find(s => s.id === found.id) : null;
                                if (stat && stat.avgCost > 0) {
                                    return (
                                        <p className="text-[10px] text-brand-600 font-bold italic mt-1 flex items-center gap-1">
                                            <TrendingUp size={10} /> Giá TB kho: {formatVND(stat.avgCost)}/{draft.unit}
                                        </p>
                                    );
                                }
                                return null;
                            })()}
                        </div>
                        <div className="space-y-2">
                            <label className="admin-label">Đơn vị lưu kho</label>
                            <input type="text" placeholder="VD: g, ml" className="admin-input"
                                value={draft.unit} onChange={e => setDraft({ ...draft, unit: e.target.value })} />
                        </div>
                    </div>

                    <hr className="border-gray-100" />

                    {/* Hàng 2: Nhập số lượng và quy cách */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="admin-label">Số lượng nhập</label>
                            <input type="number" placeholder="0" className="admin-input text-brand-600 font-bold"
                                value={draft.quantity === 0 ? '' : draft.quantity}
                                onChange={e => setDraft({ ...draft, quantity: parseFloat(e.target.value) || 0 })} />
                        </div>
                        <div className="space-y-2">
                            <label className="admin-label">Quy cách nhập</label>
                            <input type="text" placeholder="VD: hộp, thùng" className="admin-input"
                                value={draft.importUnit}
                                onChange={e => setDraft({ ...draft, importUnit: e.target.value })} />
                        </div>
                    </div>

                    {/* Hàng 3: Dung lượng và Giá */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="admin-label">Dung lượng / {draft.importUnit || 'Đơn vị'}</label>
                            <div className="relative">
                                <input type="number" placeholder="0" className="admin-input pr-10"
                                    value={draft.volumePerUnit === 0 ? '' : draft.volumePerUnit}
                                    onChange={e => setDraft({ ...draft, volumePerUnit: parseFloat(e.target.value) || 0 })} />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">{draft.unit}</span>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="admin-label">Giá mua / {draft.importUnit || 'Đơn vị'}</label>
                            <div className="relative">
                                <input type="number" placeholder="0" className="admin-input pr-10"
                                    value={draft.costPerUnit === 0 ? '' : draft.costPerUnit}
                                    onChange={e => setDraft({ ...draft, costPerUnit: parseFloat(e.target.value) || 0 })} />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">nghìn ₫</span>
                            </div>
                        </div>
                    </div>

                    {/* Tổng kết phiếu nhập */}
                    {draft.quantity > 0 && (
                        <div className="bg-brand-50/50 p-4 border border-brand-100 rounded-none mt-4 text-center">
                            <p className="text-xs text-gray-500 font-bold uppercase mb-2">Tổng kết phiếu nhập</p>
                            <div className="flex justify-around items-center">
                                <div>
                                    <p className="text-[10px] text-gray-400 uppercase tracking-widest">Tồn kho được cộng</p>
                                    <p className="text-xl font-black text-brand-600">+{calculateTotalAdded()} <span className="text-sm">{draft.unit}</span></p>
                                </div>
                                <div className="w-px h-8 bg-brand-200"></div>
                                <div>
                                    <p className="text-[10px] text-gray-400 uppercase tracking-widest">Tổng tiền phải trả</p>
                                    <p className="text-xl font-black text-red-500">{formatVND(calculateTotalCost())}</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex gap-4 pt-6">
                    <button onClick={onClose} className="admin-btn-secondary flex-1">HỦY</button>
                    <button
                        onClick={() => {
                            if (!draft.name || !draft.quantity || !draft.volumePerUnit) {
                                alert('Vui lòng nhập Tên nguyên liệu, Số lượng nhập và Dung lượng quy đổi');
                                return;
                            }
                            onSave(draft);
                        }}
                        className="admin-btn-primary flex-1">
                        LƯU NHẬP KHO
                    </button>
                </div>
            </motion.div>
        </div>
    );
};


export default ImportModal;
