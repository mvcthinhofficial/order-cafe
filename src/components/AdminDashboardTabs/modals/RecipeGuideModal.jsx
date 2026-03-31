import { useEffect } from 'react';
import React, { useState, useMemo } from 'react';
import { X, Search, BookOpen } from 'lucide-react';
import { formatVND } from '../../../utils/dashboardUtils';
import { isInputFocused } from '../../../utils/ShortcutUtils.js';
import { getImageUrl } from '../../../api';

const RecipeGuideModal = ({ menu, inventory, inventoryStats = [], onClose, initialSearchTerm = '' }) => {
    const safeMenu = Array.isArray(menu) ? menu : [];
    const safeInventory = Array.isArray(inventory) ? inventory : [];
    const [selectedItem, setSelectedItem] = useState(null);
    const [searchTerm, setSearchTerm] = useState(initialSearchTerm);

    useEffect(() => {
        const handleEsc = (e) => {
            if ((e.key === 'Escape' || (e.key === 'Backspace' && !isInputFocused()))) onClose();
        };
        window.addEventListener('keydown', handleEsc, { capture: true });
        return () => window.removeEventListener('keydown', handleEsc, { capture: true });
    }, [onClose]);

    const filteredMenu = safeMenu.filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase()));
    return (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-6 bg-gray-100">
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="bg-white w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden rounded-none border border-gray-200">
                <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center z-10">
                    <div>
                        <h3 className="text-xl font-black text-gray-900 uppercase tracking-widest">Danh sách công thức pha chế</h3>
                        <p className="text-xs text-gray-400 font-bold mt-1">Dành cho nhân viên học theo</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-none text-gray-500 transition-all"><X size={24} /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-gray-50/50">
                    {filteredMenu.filter(m => m.recipe?.length > 0 || m.addons?.some(a => a.recipe?.length > 0) || m.sizes?.some(s => s.recipe?.length > 0) || m.recipeInstructions).map(item => (
                        <div key={item.id} className="bg-white border border-gray-200 shadow-sm p-6 rounded-none break-inside-avoid">
                            <div className="flex items-center gap-4 mb-4 border-b border-gray-100 pb-3">
                                {item.image ? <img src={getImageUrl(item.image)} className="w-12 h-12 object-cover rounded-none" alt="" /> : <div className="w-12 h-12 bg-gray-100 rounded-none" />}
                                <div>
                                    <h4 className="text-lg font-black text-brand-600">{item.name}</h4>
                                    <span className="text-[10px] font-black uppercase text-gray-400 border px-2 py-0.5 rounded-none tracking-widest">{item.category}</span>
                                </div>
                            </div>
                            {(() => {
                                const hasSizes = item.sizes && item.sizes.some(s => s.multiplier || (s.recipe && s.recipe.length > 0));
                                return (
                                    <div className={`grid grid-cols-1 ${hasSizes ? 'md:grid-cols-2' : ''} gap-6 items-start`}>
                                        {/* Cột 1: Công thức gốc & Add-ons */}
                                        <div className="space-y-6 flex-1">
                                            {/* Main Recipe */}
                                            {item.recipe && item.recipe.length > 0 && (
                                                <div className="space-y-2">
                                                    <p className="text-xs font-black uppercase tracking-widest text-brand-600 bg-brand-50 px-3 py-1.5 inline-block rounded-none">Công thức gốc</p>
                                                    <ul className="space-y-2 mt-2">
                                                        {item.recipe.map((r, i) => {
                                                            const inv = inventory.find(inv => inv.id === r.ingredientId);
                                                            const stat = inv ? inventoryStats.find(s => s.id === inv.id) : null;
                                                            const costStr = stat && stat.avgCost ? `(~${formatVND(stat.avgCost * r.quantity)})` : '';
                                                            return (
                                                                <li key={i} className="flex justify-between items-center text-sm border-b border-dashed border-gray-200 pb-1">
                                                                    <span className="font-bold text-gray-700">{inv?.name || 'Không rõ'} <span className="text-[10px] text-gray-400 font-normal">{costStr}</span></span>
                                                                    <span className="font-black text-brand-600">{r.quantity} {inv?.unit}</span>
                                                                </li>
                                                            );
                                                        })}
                                                    </ul>
                                                </div>
                                            )}

                                            {/* Addon Recipes */}
                                            {item.addons && item.addons.some(a => a.recipe && a.recipe.length > 0) && (
                                                <div className="space-y-2">
                                                    <p className="text-xs font-black uppercase tracking-widest text-brand-600 bg-brand-50 px-3 py-1.5 inline-block rounded-none">Tùy chọn thêm (Add-ons)</p>
                                                    <div className="space-y-4 mt-2">
                                                        {item.addons.filter(a => a.recipe && a.recipe.length > 0).map((a, i) => (
                                                            <div key={i} className="bg-brand-50/20 p-3 rounded-none border border-brand-50">
                                                                <p className="font-black text-sm text-gray-800 mb-2">+ {a.label}</p>
                                                                <ul className="space-y-1">
                                                                    {(a.recipe || []).map((r, j) => {
                                                                        const inv = inventory.find(inv => inv.id === r.ingredientId);
                                                                        const stat = inv ? inventoryStats.find(st => st.id === inv.id) : null;
                                                                        const costStr = stat && stat.avgCost ? `(~${formatVND(stat.avgCost * r.quantity)})` : '';
                                                                        return (
                                                                            <li key={`addon-${j}`} className="flex justify-between items-center text-xs border-b border-dashed border-brand-100 pb-1">
                                                                                <span className="font-bold text-gray-600">{inv?.name || 'Không rõ'} <span className="text-[9px] font-normal opacity-70">{costStr}</span></span>
                                                                                <span className="font-black text-brand-600 text-[11px]">{r.quantity} {inv?.unit}</span>
                                                                            </li>
                                                                        );
                                                                    })}
                                                                </ul>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Cột 2: Phân theo Size (Chỉ render nếu có) */}
                                        {hasSizes && (
                                            <div className="space-y-6 flex-1">
                                                <div className="space-y-2">
                                                    <p className="text-xs font-black uppercase tracking-widest text-brand-600 bg-brand-50 px-3 py-1.5 inline-block rounded-none">Phân theo Size</p>
                                                    <div className="space-y-4 mt-2">
                                                        {item.sizes.filter(s => s.multiplier || (s.recipe && s.recipe.length > 0)).map((s, i) => (
                                                            <div key={i} className="bg-brand-50/20 p-3 rounded-none border border-brand-50">
                                                                <p className="font-black text-sm text-gray-800 mb-2">Size {s.label} {s.multiplier && s.multiplier !== 1 ? `(HS x${s.multiplier})` : ''}</p>
                                                                <ul className="space-y-1">
                                                                    {s.multiplier && (item.recipe || []).map((r, j) => {
                                                                        const inv = inventory.find(inv => inv.id === r.ingredientId);
                                                                        const totalQty = Math.ceil(r.quantity * s.multiplier);
                                                                        const stat = inv ? inventoryStats.find(st => st.id === inv.id) : null;
                                                                        const costStr = stat && stat.avgCost ? `(~${formatVND(stat.avgCost * totalQty)})` : '';
                                                                        return (
                                                                            <li key={`base-${j}`} className="flex justify-between items-center text-xs border-b border-dashed border-brand-100 pb-1 italic opacity-80">
                                                                                <span className="font-bold text-gray-600">{inv?.name || 'Không rõ'} <span className="text-[9px] font-normal">{costStr}</span></span>
                                                                                <span className="font-black text-brand-600 text-[11px]">{totalQty} {inv?.unit}</span>
                                                                            </li>
                                                                        );
                                                                    })}
                                                                    {(s.recipe || []).map((r, j) => {
                                                                        const inv = inventory.find(inv => inv.id === r.ingredientId);
                                                                        const stat = inv ? inventoryStats.find(st => st.id === inv.id) : null;
                                                                        const costStr = stat && stat.avgCost ? `(~${formatVND(stat.avgCost * r.quantity)})` : '';
                                                                        return (
                                                                            <li key={`size-${j}`} className="flex justify-between items-center text-xs border-b border-dashed border-brand-100 pb-1">
                                                                                <span className="font-bold text-gray-600">{inv?.name || 'Không rõ'} <span className="text-[9px] font-normal opacity-70">{costStr}</span></span>
                                                                                <span className="font-black text-brand-600 text-[11px]">{r.quantity} {inv?.unit}</span>
                                                                            </li>
                                                                        );
                                                                    })}
                                                                </ul>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                            {/* Chế biến / Cách làm */}
                            {item.recipeInstructions && (
                                <div className="mt-6 pt-6 border-t border-gray-100">
                                    <p className="text-[11px] font-black uppercase tracking-widest text-brand-600 bg-brand-50 px-3 py-1.5 inline-block rounded-none mb-3">SỔ TAY CÁCH LÀM</p>
                                    <div className="text-[13px] font-bold text-gray-700 whitespace-pre-wrap leading-relaxed bg-gray-50 p-4 rounded-none border border-gray-200">
                                        {item.recipeInstructions}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                    {menu.filter(m => m.recipe?.length > 0 || m.addons?.some(a => a.recipe?.length > 0) || m.sizes?.some(s => s.recipe?.length > 0) || m.recipeInstructions).length === 0 && (
                        <div className="text-center py-20 text-gray-400 font-bold">Chưa có công thức nào được thiết lập. Vui lòng thêm định lượng ở phần chỉnh sửa món.</div>
                    )}
                </div>
            </motion.div>
        </div>
    );
};







export default RecipeGuideModal;
