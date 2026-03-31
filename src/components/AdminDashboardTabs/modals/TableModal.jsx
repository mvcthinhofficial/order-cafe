import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Save, Trash2, X } from 'lucide-react';
import { isInputFocused } from '../../../utils/ShortcutUtils.js';

const TableModal = ({ table, onSave, onClose, onDelete }) => {
    const [draft, setDraft] = useState(table || { name: '', area: 'Trong nhà', status: 'Available' });

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
                <h3 className="font-black text-gray-900 uppercase tracking-widest text-sm text-center">Thông tin bàn</h3>
                <div className="space-y-6">
                    <div className="space-y-2">
                        <label className="admin-label">Tên bàn (Số bàn)</label>
                        <input autoFocus placeholder="VD: Bàn 01" className="admin-input"
                            value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                        <label className="admin-label">Khu vực / Tầng</label>
                        <input list="area-options" placeholder="VD: Sảnh lớn, Cổng sau..." className="admin-input"
                            value={draft.area} onChange={e => setDraft({ ...draft, area: e.target.value })} />
                        <datalist id="area-options">
                            <option value="Trong nhà" />
                            <option value="Sân vườn" />
                            <option value="Tầng 1" />
                            <option value="Tầng 2" />
                            <option value="Ban công" />
                        </datalist>
                    </div>
                </div>
                <div className="flex gap-3 pt-5 w-full">
                    {onDelete && draft.id && userRole === 'ADMIN' && (
                        <button onClick={() => onDelete(draft.id)} className="admin-btn-secondary flex-1 !bg-red-50 !text-red-500 !border-red-200 hover:!bg-red-100 uppercase tracking-widest text-xs">XÓA BÀN</button>
                    )}
                    <button onClick={onClose} className="admin-btn-secondary flex-1 uppercase tracking-widest text-xs">HỦY</button>
                    <button onClick={() => onSave(draft)} className="admin-btn-primary flex-1 uppercase tracking-widest text-xs">LƯU BÀN</button>
                </div>
            </motion.div>
        </div>
    );
};


export default TableModal;
