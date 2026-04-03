import { useEffect } from 'react';
import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { X, Search, BookOpen, Printer } from 'lucide-react';
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

    const handlePrint = () => {
        let printContent = `
            <style>
                body { font-family: Arial, sans-serif; padding: 10px; color: #111; font-size: 12px; }
                h2 { text-align: center; margin-bottom: 15px; text-transform: uppercase; font-size: 18px; }
                .masonry { column-count: 2; column-gap: 15px; }
                .item { break-inside: avoid; page-break-inside: avoid; border: 1px solid #ccc; padding: 10px; margin-bottom: 15px; border-radius: 6px; }
                .flex { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; border-bottom: 1px solid #eee; padding-bottom: 8px; }
                .title { font-size: 15px; font-weight: bold; }
                .cat { font-size: 9px; color: #555; text-transform: uppercase; border: 1px solid #ddd; padding: 2px 5px; border-radius: 4px; display: inline-block; margin-top: 3px; }
                .grid { display: flex; flex-direction: column; gap: 12px; }
                .col { width: 100%; }
                .badge { background: #f0f0f0; padding: 4px 8px; font-size: 10px; font-weight: bold; border-radius: 4px; display: inline-block; margin-bottom: 6px; color: #333; }
                ul { list-style: none; padding: 0; margin: 0; }
                li { display: flex; justify-content: space-between; border-bottom: 1px dashed #eee; padding: 4px 0; font-size: 12px; }
                li > span { font-weight: 600; color: #444; }
                li > strong { font-weight: 900; }
                .addon-box { background: #fafafa; padding: 8px; border-radius: 4px; margin-bottom: 8px; border: 1px solid #eee; }
                .addon-title { font-size: 11px; font-weight: bold; margin: 0 0 6px 0; }
            </style>
            <h2>DANH SÁCH CÔNG THỨC PHA CHẾ</h2>
            <div class="masonry">
        `;

        filteredMenu.filter(m => m.recipe?.length > 0 || m.addons?.some(a => a.recipe?.length > 0) || m.sizes?.some(s => s.recipe?.length > 0) || m.recipeInstructions).forEach(item => {
            printContent += `<div class="item"><div class="flex">`;
            if (item.image) printContent += `<img src="${getImageUrl(item.image)}" width="50" height="50" style="object-fit:cover;border-radius:6px;" />`;
            printContent += `<div><div class="title">${item.name}</div><div class="cat">${item.category}</div></div></div><div class="grid">`;
            
            // Cột 1
            printContent += `<div class="col">`;
            if (item.recipe?.length) {
                printContent += `<div class="badge">CÔNG THỨC GỐC</div><ul>`;
                item.recipe.forEach(r => {
                    const inv = inventory.find(inv => inv.id === r.ingredientId);
                    printContent += `<li><span>${inv?.name || '?'}</span><strong>${r.quantity} ${inv?.unit}</strong></li>`;
                });
                printContent += `</ul>`;
            }
            if (item.addons?.some(a => a.recipe?.length > 0)) {
                printContent += `<div style="margin-top:15px;" class="badge">TÙY CHỌN THÊM (ADD-ONS)</div>`;
                item.addons.filter(a => a.recipe?.length).forEach(a => {
                    printContent += `<div class="addon-box"><p class="addon-title">+ ${a.label}</p><ul>`;
                    a.recipe.forEach(r => {
                        const inv = inventory.find(inv => inv.id === r.ingredientId);
                        printContent += `<li><span>${inv?.name || '?'}</span><strong>${r.quantity} ${inv?.unit}</strong></li>`;
                    });
                    printContent += `</ul></div>`;
                });
            }
            printContent += `</div>`;

            // Cột 2
            const hasSizes = item.sizes?.some(s => s.multiplier || s.recipe?.length > 0);
            if (hasSizes) {
                printContent += `<div class="col"><div class="badge">PHÂN THEO SIZE</div>`;
                item.sizes.filter(s => s.multiplier || s.recipe?.length).forEach(s => {
                    printContent += `<div class="addon-box"><p class="addon-title">Size ${s.label} ${s.multiplier && s.multiplier !== 1 ? `(x${s.multiplier})` : ''}</p><ul>`;
                    if (s.multiplier) {
                        item.recipe?.forEach(r => {
                            const inv = inventory.find(inv => inv.id === r.ingredientId);
                            const totalQty = Math.ceil(r.quantity * s.multiplier);
                            printContent += `<li style="opacity:0.8;"><span>${inv?.name || '?'}</span><strong>${totalQty} ${inv?.unit}</strong></li>`;
                        });
                    }
                    s.recipe?.forEach(r => {
                        const inv = inventory.find(inv => inv.id === r.ingredientId);
                        printContent += `<li><span>${inv?.name || '?'}</span><strong>${r.quantity} ${inv?.unit}</strong></li>`;
                    });
                    printContent += `</ul></div>`;
                });
                printContent += `</div>`;
            }
            
            printContent += `</div>`;
            
            if (item.recipeInstructions) {
                printContent += `<div style="margin-top: 20px; border-top: 1px solid #eee; padding-top: 15px;">
                    <div class="badge">SỔ TAY CÁCH LÀM</div>
                    <div style="font-size:14px; white-space:pre-wrap; line-height: 1.6; background: #fafafa; padding: 15px; border-radius: 6px; border: 1px solid #eee;">${item.recipeInstructions}</div>
                </div>`;
            }
            
            printContent += `</div>`;
        });
        printContent += `</div>`;

        const w = window.open('', '_blank');
        if (w) {
            w.document.write(`<!DOCTYPE html><html><head><title>IN CÔNG THỨC PHA CHẾ</title></head><body>${printContent}</body></html>`);
            w.document.close();
            setTimeout(() => { w.focus(); w.print(); }, 500);
        } else {
            alert("Vui lòng cho phép popup để in.");
        }
    };

    return (
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-gray-900/50 backdrop-blur-sm" style={{ padding: 'var(--spacing-card, 24px)' }}>
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="bg-white w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-gray-200 mx-2 sm:mx-0" style={{ borderRadius: 'var(--radius-modal, 20px)' }}>
                <div className="border-b border-gray-100 bg-gray-50 flex justify-between items-center z-10" style={{ padding: 'var(--spacing-card, 24px)' }}>
                    <div>
                        <h3 className="text-xl font-black text-gray-900 uppercase tracking-widest">Danh sách công thức pha chế</h3>
                        <p className="text-xs text-gray-400 font-bold mt-1">Dành cho nhân viên học theo</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={handlePrint} className="px-5 py-2 hover:bg-gray-200 text-gray-700 transition-all font-bold text-sm bg-gray-100 flex items-center justify-center gap-2 border border-gray-200" style={{ minHeight: '44px', borderRadius: 'var(--radius-btn, 10px)' }}>
                            <Printer size={18} /> In Ra Khổ A4
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-gray-200 text-gray-500 transition-all flex items-center justify-center bg-gray-100 border border-gray-200" style={{ minHeight: '44px', minWidth: '44px', borderRadius: 'var(--radius-btn, 10px)' }}><X size={24} /></button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto space-y-8 bg-gray-50/50" style={{ padding: 'var(--spacing-card, 24px)' }}>
                    {filteredMenu.filter(m => m.recipe?.length > 0 || m.addons?.some(a => a.recipe?.length > 0) || m.sizes?.some(s => s.recipe?.length > 0) || m.recipeInstructions).map(item => (
                        <div key={item.id} className="bg-white border border-gray-200 shadow-sm break-inside-avoid" style={{ padding: 'var(--spacing-card, 24px)', borderRadius: 'var(--radius-card, 16px)' }}>
                            <div className="flex items-center gap-4 mb-4 border-b border-gray-100" style={{ paddingBottom: '16px' }}>
                                {item.image ? <img src={getImageUrl(item.image)} className="w-12 h-12 object-cover" style={{ borderRadius: 'var(--radius-badge, 8px)' }} alt="" /> : <div className="w-12 h-12 bg-gray-100" style={{ borderRadius: 'var(--radius-badge, 8px)' }} />}
                                <div>
                                    <h4 className="text-lg font-black" style={{ color: 'var(--color-brand)' }}>{item.name}</h4>
                                    <span className="text-[10px] font-black uppercase text-gray-400 border px-2 py-0.5 tracking-widest bg-gray-50" style={{ borderRadius: 'var(--radius-chip, 6px)' }}>{item.category}</span>
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
                                                    <p className="text-xs font-black uppercase tracking-widest bg-gray-100 px-3 py-1.5 inline-block" style={{ color: 'var(--color-brand)', borderRadius: 'var(--radius-chip, 6px)' }}>Công thức gốc</p>
                                                    <ul className="space-y-2 mt-2">
                                                        {item.recipe.map((r, i) => {
                                                            const inv = inventory.find(inv => inv.id === r.ingredientId);
                                                            const stat = inv ? inventoryStats.find(s => s.id === inv.id) : null;
                                                            const costStr = stat && stat.avgCost ? `(~${formatVND(stat.avgCost * r.quantity)})` : '';
                                                            return (
                                                                <li key={i} className="flex justify-between items-center text-sm border-b border-dashed border-gray-200 pb-1">
                                                                    <span className="font-bold text-gray-700">{inv?.name || 'Không rõ'} <span className="text-[10px] text-gray-400 font-normal">{costStr}</span></span>
                                                                    <span className="font-black" style={{ color: 'var(--color-brand)' }}>{r.quantity} {inv?.unit}</span>
                                                                </li>
                                                            );
                                                        })}
                                                    </ul>
                                                </div>
                                            )}

                                            {/* Addon Recipes */}
                                            {item.addons && item.addons.some(a => a.recipe && a.recipe.length > 0) && (
                                                <div className="space-y-2">
                                                    <p className="text-xs font-black uppercase tracking-widest bg-gray-100 px-3 py-1.5 inline-block" style={{ color: 'var(--color-brand)', borderRadius: 'var(--radius-chip, 6px)' }}>Tùy chọn thêm (Add-ons)</p>
                                                    <div className="space-y-4 mt-2">
                                                        {item.addons.filter(a => a.recipe && a.recipe.length > 0).map((a, i) => (
                                                            <div key={i} className="bg-gray-50 border border-gray-200" style={{ padding: '12px', borderRadius: 'var(--radius-badge, 8px)' }}>
                                                                <p className="font-black text-sm text-gray-800 mb-2">+ {a.label}</p>
                                                                <ul className="space-y-1">
                                                                    {(a.recipe || []).map((r, j) => {
                                                                        const inv = inventory.find(inv => inv.id === r.ingredientId);
                                                                        const stat = inv ? inventoryStats.find(st => st.id === inv.id) : null;
                                                                        const costStr = stat && stat.avgCost ? `(~${formatVND(stat.avgCost * r.quantity)})` : '';
                                                                        return (
                                                                            <li key={`addon-${j}`} className="flex justify-between items-center text-xs border-b border-dashed border-gray-200 pb-1">
                                                                                <span className="font-bold text-gray-600">{inv?.name || 'Không rõ'} <span className="text-[9px] font-normal opacity-70">{costStr}</span></span>
                                                                                <span className="font-black text-[11px]" style={{ color: 'var(--color-brand)' }}>{r.quantity} {inv?.unit}</span>
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
                                                    <p className="text-xs font-black uppercase tracking-widest bg-gray-100 px-3 py-1.5 inline-block" style={{ color: 'var(--color-brand)', borderRadius: 'var(--radius-chip, 6px)' }}>Phân theo Size</p>
                                                    <div className="space-y-4 mt-2">
                                                        {item.sizes.filter(s => s.multiplier || (s.recipe && s.recipe.length > 0)).map((s, i) => (
                                                            <div key={i} className="bg-gray-50 border border-gray-200" style={{ padding: '12px', borderRadius: 'var(--radius-badge, 8px)' }}>
                                                                <p className="font-black text-sm text-gray-800 mb-2">Size {s.label} {s.multiplier && s.multiplier !== 1 ? `(HS x${s.multiplier})` : ''}</p>
                                                                <ul className="space-y-1">
                                                                    {s.multiplier && (item.recipe || []).map((r, j) => {
                                                                        const inv = inventory.find(inv => inv.id === r.ingredientId);
                                                                        const totalQty = Math.ceil(r.quantity * s.multiplier);
                                                                        const stat = inv ? inventoryStats.find(st => st.id === inv.id) : null;
                                                                        const costStr = stat && stat.avgCost ? `(~${formatVND(stat.avgCost * totalQty)})` : '';
                                                                        return (
                                                                            <li key={`base-${j}`} className="flex justify-between items-center text-xs border-b border-dashed border-gray-200 pb-1 italic opacity-80">
                                                                                <span className="font-bold text-gray-600">{inv?.name || 'Không rõ'} <span className="text-[9px] font-normal">{costStr}</span></span>
                                                                                <span className="font-black text-[11px]" style={{ color: 'var(--color-brand)' }}>{totalQty} {inv?.unit}</span>
                                                                            </li>
                                                                        );
                                                                    })}
                                                                    {(s.recipe || []).map((r, j) => {
                                                                        const inv = inventory.find(inv => inv.id === r.ingredientId);
                                                                        const stat = inv ? inventoryStats.find(st => st.id === inv.id) : null;
                                                                        const costStr = stat && stat.avgCost ? `(~${formatVND(stat.avgCost * r.quantity)})` : '';
                                                                        return (
                                                                            <li key={`size-${j}`} className="flex justify-between items-center text-xs border-b border-dashed border-gray-200 pb-1">
                                                                                <span className="font-bold text-gray-600">{inv?.name || 'Không rõ'} <span className="text-[9px] font-normal opacity-70">{costStr}</span></span>
                                                                                <span className="font-black text-[11px]" style={{ color: 'var(--color-brand)' }}>{r.quantity} {inv?.unit}</span>
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
                                <div className="mt-8 border-t border-gray-100" style={{ paddingTop: '24px' }}>
                                    <p className="text-[11px] font-black uppercase tracking-widest bg-gray-100 px-3 py-1.5 inline-block mb-4" style={{ color: 'var(--color-brand)', borderRadius: 'var(--radius-chip, 6px)' }}>SỔ TAY CÁCH LÀM</p>
                                    <div className="text-[13px] font-bold text-gray-700 whitespace-pre-wrap leading-relaxed bg-gray-50 border border-gray-200" style={{ padding: '16px', borderRadius: 'var(--radius-badge, 8px)' }}>
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
