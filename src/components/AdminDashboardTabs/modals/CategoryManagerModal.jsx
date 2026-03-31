import React, { useState } from 'react';
import { motion, Reorder } from 'framer-motion';
import { X, Plus, Edit2, Trash2, Save, GripVertical, CheckCircle } from 'lucide-react';
import { SERVER_URL } from '../../../api';

const CategoryManagerModal = ({ settings, setSettings, menu, setMenu, onRefreshMenu, onClose }) => {
    const [cats, setCats] = useState(settings.menuCategories || ['TRUYỀN THỐNG', 'PHA MÁY', 'Trà', 'Khác']);
    const [editingIdx, setEditingIdx] = useState(null);
    const [editVal, setEditVal] = useState('');
    const [newCat, setNewCat] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const handleSaveSettings = async (newCats) => {
        const newSettings = { ...settings, menuCategories: newCats, categoryOrder: newCats };
        await fetch(`${SERVER_URL}/api/settings`, {
            method: 'POST',
            body: JSON.stringify(newSettings),
            headers: { 'Content-Type': 'application/json' }
        });
        setSettings(newSettings);
        setCats(newCats);

        if (setMenu) {
            setMenu(currentMenu => {
                const trackers = {};
                const fullNewMenu = currentMenu.map(item => {
                    if (item.isDeleted) return item;
                    const idx = newCats.indexOf(item.category);
                    const prefix = idx !== -1 ? String(idx + 1) : Math.max(9, newCats.length + 1).toString();
                    if (!trackers[item.category]) trackers[item.category] = 1;
                    return { ...item, shortcutCode: `${prefix}${trackers[item.category]++}` };
                });

                fetch(`${SERVER_URL}/api/menu/reorder`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(fullNewMenu)
                }).catch(console.error);

                return fullNewMenu;
            });
        }
    };

    const handleRename = async (idx) => {
        if (!editVal || editVal.trim() === '' || editVal === cats[idx]) { setEditingIdx(null); return; }
        const oldName = cats[idx];
        const newName = editVal.trim();
        setIsSaving(true);

        const itemsToUpdate = menu.filter(m => m.category === oldName);
        for (const item of itemsToUpdate) {
            await fetch(`${SERVER_URL}/api/menu`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...item, category: newName })
            });
        }

        const next = [...cats];
        next[idx] = newName;

        // Tránh lỗi Reorder ghi đè dữ liệu cũ: Cấp nhật trước Menu state thì mới chạy handleSaveSettings
        if (setMenu) {
            setMenu(currentMenu => currentMenu.map(m => m.category === oldName ? { ...m, category: newName } : m));
        }

        // Cần chút độ trễ nhỏ để React hook cập nhật kịp (tuỳ không bắt buộc nhưng cho chắc ăn)
        await new Promise(r => setTimeout(r, 50));
        await handleSaveSettings(next);

        setEditingIdx(null);
        if (itemsToUpdate.length > 0) {
            setTimeout(onRefreshMenu, 200); // Trigger refresh data at very end
        }
        setIsSaving(false);
    };

    const handleDelete = async (idx) => {
        const catToDelete = cats[idx];
        if (!window.confirm(`Bạn có chắc muốn xóa danh mục "${catToDelete}"? Các món bên trong sẽ bị chuyển thành "Không Phân Loại" nếu bạn lưu lại.`)) return;
        setIsSaving(true);

        const itemsToUpdate = menu.filter(m => m.category === catToDelete);
        for (const item of itemsToUpdate) {
            await fetch(`${SERVER_URL}/api/menu`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...item, category: 'Không Phân Loại' })
            });
        }

        const next = cats.filter((_, i) => i !== idx);

        if (setMenu) {
            setMenu(currentMenu => currentMenu.map(m => m.category === catToDelete ? { ...m, category: 'Không Phân Loại' } : m));
        }

        await new Promise(r => setTimeout(r, 50));
        await handleSaveSettings(next);

        if (itemsToUpdate.length > 0) {
            setTimeout(onRefreshMenu, 200);
        }
        setIsSaving(false);
    };

    const handleAdd = async () => {
        if (!newCat.trim()) return;
        setIsSaving(true);
        const next = [...cats, newCat.trim()];
        await handleSaveSettings(next);
        setNewCat('');
        setIsSaving(false);
    };

    const moveCat = async (idx, dir) => {
        const next = [...cats];
        const temp = next[idx];
        next[idx] = next[idx + dir];
        next[idx + dir] = temp;
        setIsSaving(true);
        await handleSaveSettings(next);
        setIsSaving(false);
    };

    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <h3 className="text-lg font-black text-gray-900 uppercase tracking-widest">QUẢN LÝ DANH MỤC</h3>
                    <button onClick={onClose} disabled={isSaving} className="p-2 hover:bg-gray-200 rounded-none text-gray-500 disabled:opacity-50"><X size={20} /></button>
                </div>
                <div className="p-6 overflow-y-auto flex-1 bg-gray-50/30">
                    <div className="flex gap-2 mb-6">
                        <input className="admin-input flex-1 !text-sm" placeholder="Tên danh mục mới..." value={newCat} onChange={e => setNewCat(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()} disabled={isSaving} />
                        <button onClick={handleAdd} disabled={isSaving || !newCat.trim()} className="admin-btn-primary !px-4 whitespace-nowrap !text-xs disabled:opacity-50"><Plus size={16} /> THÊM</button>
                    </div>
                    <div className="space-y-2">
                        {cats.map((c, i) => (
                            <div key={i} className="flex items-center justify-between p-3 bg-white border border-gray-200 shadow-sm group">
                                {editingIdx === i ? (
                                    <div className="flex-1 flex gap-2">
                                        <input autoFocus className="admin-input-small flex-1 !py-1 !px-2" value={editVal} onChange={e => setEditVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleRename(i)} />
                                        <button onClick={() => handleRename(i)} className="bg-green-500 text-white px-3 py-1 text-xs font-bold rounded-none shadow-sm hover:bg-green-600"><CheckCircle2 size={14} /></button>
                                        <button onClick={() => setEditingIdx(null)} className="bg-gray-200 text-gray-600 px-3 py-1 text-xs font-bold rounded-none hover:bg-gray-300"><X size={14} /></button>
                                    </div>
                                ) : (
                                    <>
                                        <span className="font-bold text-gray-800 flex-1">{c}</span>
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button disabled={isSaving || i === 0} onClick={() => moveCat(i, -1)} className="p-1.5 text-gray-400 hover:text-brand-500 hover:bg-brand-50 rounded-none"><ArrowUp size={16} /></button>
                                            <button disabled={isSaving || i === cats.length - 1} onClick={() => moveCat(i, 1)} className="p-1.5 text-gray-400 hover:text-brand-500 hover:bg-brand-50 rounded-none"><ArrowDown size={16} /></button>
                                            <div className="w-px h-4 bg-gray-200 mx-1"></div>
                                            <button disabled={isSaving} onClick={() => { setEditingIdx(i); setEditVal(c); }} className="p-1.5 text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded-none"><Edit2 size={16} /></button>
                                            <button disabled={isSaving} onClick={() => handleDelete(i)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-none"><Trash2 size={16} /></button>
                                        </div>
                                    </>
                                )}
                            </div>
                        ))}
                        {cats.length === 0 && <p className="text-center text-gray-400 font-medium py-4 text-sm">Chưa có danh mục nào.</p>}
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default CategoryManagerModal;
