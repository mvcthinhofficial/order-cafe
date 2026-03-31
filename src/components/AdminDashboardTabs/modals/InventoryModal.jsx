import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Save, X } from 'lucide-react';
import { isInputFocused } from '../../../utils/ShortcutUtils.js';

const InventoryModal = ({ item, onSave, onClose }) => {
    const [draft, setDraft] = useState(item || { name: '', stock: 0, minStock: 0, unit: 'g' });

    useEffect(() => {
        const handleEsc = (e) => {
            if ((e.key === 'Escape' || (e.key === 'Backspace' && !isInputFocused()))) onClose();
        };
        window.addEventListener('keydown', handleEsc, { capture: true });
        return () => window.removeEventListener('keydown', handleEsc, { capture: true });
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="admin-modal-container">
                <h3 className="font-black text-gray-900 uppercase tracking-widest text-sm text-center">Nguyên liệu kho</h3>
                <div className="space-y-4">
                    <input autoFocus placeholder="Tên nguyên liệu" className="admin-input"
                        value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
                    <div className="grid grid-cols-2 gap-4">
                        <input type="number" disabled={!!item?.id} placeholder="Số lượng" className={`admin-input ${item?.id ? 'opacity-60 cursor-not-allowed bg-gray-50' : ''}`}
                            value={draft.stock} onChange={e => setDraft({ ...draft, stock: parseFloat(e.target.value) || 0 })} />
                        <input placeholder="Đơn vị (g, ml...)" className="admin-input"
                            value={draft.unit} onChange={e => setDraft({ ...draft, unit: e.target.value })} />
                    </div>
                    <label className="admin-label">Mức cảnh báo (Min)</label>
                    <input autoFocus={!!item?.id} type="number" className="admin-input"
                        value={draft.minStock} onChange={e => setDraft({ ...draft, minStock: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="flex gap-4 pt-4">
                    <button onClick={onClose} className="admin-btn-secondary">HỦY</button>
                    <button onClick={() => onSave(draft)} className="admin-btn-primary">LƯU KHO</button>
                </div>
            </motion.div>
        </div>
    );
};


export default InventoryModal;
