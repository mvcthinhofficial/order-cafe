import React, { useState } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { Save, X, Plus, Trash2, Edit2, ChevronDown, ChevronUp, ArrowUp, ArrowDown, Search, GripVertical, Camera, Info } from 'lucide-react';
import { SERVER_URL, getImageUrl } from '../../api';
import { formatVND } from '../../utils/dashboardUtils';

const DEFAULT_SUGAR = ['100%', '50%', '0%'];
const DEFAULT_ICE = ['Bình thường', 'Ít đá', 'Không đá'];

// ── Inline edit panel (with sizes + addons) ──
const InlineEditPanel = ({ item, inventory, inventoryStats = [], onSave, onCancel, onDraftChange, settings, stats30Days, totalFixed }) => {
    const [draft, setDraft] = useState({
        ...item,
        sizes: (item.sizes || [{ label: 'Nhỏ', volume: '200ml', priceAdjust: 0 }]).map(s => ({
            ...s,
            recipe: s.recipe || [],
            multiplier: s.multiplier ?? 1.0
        })),
        addons: item.addons || [],
        recipe: item.recipe || [],
        recipeInstructions: item.recipeInstructions || '',
        sugarOptions: item.sugarOptions ?? [...DEFAULT_SUGAR],
        iceOptions: item.iceOptions ?? [...DEFAULT_ICE],
    });

    const [isUploadingImage, setIsUploadingImage] = useState(false);
    const [showCostExplanation, setShowCostExplanation] = useState(false);

    useEffect(() => {
        if (onDraftChange) onDraftChange(draft);
    }, [draft, onDraftChange]);

    const updateSize = (idx, field, val) => {
        const next = [...draft.sizes];
        next[idx] = { ...next[idx], [field]: (field === 'priceAdjust' || field === 'multiplier') ? parseFloat(val) || 0 : val };
        setDraft({ ...draft, sizes: next });
    };
    const addSize = () => setDraft({ ...draft, sizes: [...draft.sizes, { label: '', volume: '', priceAdjust: 0, multiplier: 1.0, recipe: [] }] });
    const removeSize = (idx) => setDraft({ ...draft, sizes: draft.sizes.filter((_, i) => i !== idx) });

    const updateSizeRecipe = (idx, recipeIdx, field, val) => {
        const next = [...draft.sizes];
        const nextRecipe = [...(next[idx].recipe || [])];
        nextRecipe[recipeIdx] = { ...nextRecipe[recipeIdx], [field]: field === 'quantity' ? parseFloat(val) || 0 : val };
        next[idx] = { ...next[idx], recipe: nextRecipe };
        setDraft({ ...draft, sizes: next });
    };
    const addSizeRecipe = (idx) => {
        const next = [...draft.sizes];
        next[idx] = { ...next[idx], recipe: [...(next[idx].recipe || []), { ingredientId: '', quantity: 0 }] };
        setDraft({ ...draft, sizes: next });
    };
    const removeSizeRecipe = (idx, recipeIdx) => {
        const next = [...draft.sizes];
        next[idx] = { ...next[idx], recipe: (next[idx].recipe || []).filter((_, i) => i !== recipeIdx) };
        setDraft({ ...draft, sizes: next });
    };

    const updateAddon = (idx, field, val) => {
        const next = [...draft.addons];
        next[idx] = { ...next[idx], [field]: field === 'price' ? parseFloat(val) || 0 : val };
        setDraft({ ...draft, addons: next });
    };
    const generateAddonHotkey = (addons) => {
        if (!addons || addons.length === 0) return '1';
        const codes = addons.map(a => parseInt(a.addonCode || '0', 10)).filter(n => !isNaN(n));
        if (codes.length === 0) return '1';
        return (Math.max(...codes) + 1).toString();
    };

    const addAddon = () => {
        const newAddonCode = generateAddonHotkey(draft.addons);
        setDraft({ ...draft, addons: [...(draft.addons || []), { addonCode: newAddonCode, label: '', price: 0, recipe: [] }] });
    };
    const removeAddon = (idx) => setDraft({ ...draft, addons: draft.addons.filter((_, i) => i !== idx) });
    const moveAddon = (idx, direction) => {
        const targetIdx = idx + direction;
        if (targetIdx < 0 || targetIdx >= draft.addons.length) return;
        const next = [...draft.addons];
        const temp = next[idx];
        next[idx] = next[targetIdx];
        next[targetIdx] = temp;
        setDraft({ ...draft, addons: next });
    };

    const updateAddonRecipe = (idx, recipeIdx, field, val) => {
        const next = [...draft.addons];
        const nextRecipe = [...(next[idx].recipe || [])];
        nextRecipe[recipeIdx] = { ...nextRecipe[recipeIdx], [field]: field === 'quantity' ? parseInt(val, 10) || 0 : val };
        next[idx] = { ...next[idx], recipe: nextRecipe };
        setDraft({ ...draft, addons: next });
    };
    const addAddonRecipe = (idx) => {
        const next = [...draft.addons];
        next[idx] = { ...next[idx], recipe: [...(next[idx].recipe || []), { ingredientId: '', quantity: 0 }] };
        setDraft({ ...draft, addons: next });
    };
    const removeAddonRecipe = (idx, recipeIdx) => {
        const next = [...draft.addons];
        next[idx] = { ...next[idx], recipe: (next[idx].recipe || []).filter((_, i) => i !== recipeIdx) };
        setDraft({ ...draft, addons: next });
    };

    const updateRecipe = (idx, field, val) => {
        const next = [...draft.recipe];
        next[idx] = { ...next[idx], [field]: field === 'quantity' ? parseInt(val, 10) || 0 : val };
        setDraft({ ...draft, recipe: next });
    };
    const addRecipe = () => setDraft({ ...draft, recipe: [...draft.recipe, { ingredientId: '', quantity: 0 }] });
    const removeRecipe = (idx) => setDraft({ ...draft, recipe: draft.recipe.filter((_, i) => i !== idx) });

    const baseRecipeCost = (draft.recipe || []).reduce((sum, r) => {
        const stats = Array.isArray(inventoryStats) ? inventoryStats : [];
        const stat = stats.find(s => s.id === r.ingredientId);
        const inv = inventory.find(i => i.id === r.ingredientId);
        const cost = stat?.avgCost || inv?.importPrice || 0;
        return sum + (cost * r.quantity);
    }, 0);

    return (
        <>
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="bg-[#F9F8F6] border-t border-gray-100 p-4 space-y-4">
                    {/* Name + Price */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="admin-label">Tên món</label>
                            <input className="admin-input-small !text-lg !font-black !tracking-tight text-gray-900"
                                value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                            <label className="admin-label">Giá bán (nghìn ₫)</label>
                            <input className="admin-input-small !text-[#C68E5E] !font-black !text-lg"
                                type="number" value={draft.price} onChange={e => setDraft({ ...draft, price: e.target.value })} />
                        </div>
                    </div>


                    {/* Category */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="admin-label">Danh mục</label>
                            <select className="admin-input-small appearance-none !font-bold"
                                value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })}>
                                {(settings?.menuCategories || ['TRUYỀN THỐNG', 'PHA MÁY', 'Trà', 'Khác']).map(c => <option key={c} value={c}>{c}</option>)}
                                {(!settings?.menuCategories?.includes(draft.category) && draft.category) && <option value={draft.category}>{draft.category}</option>}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="admin-label">URL Hình ảnh (Nhập Link hoặc Tải Lên)</label>
                            <div className="flex gap-2 items-center">
                                <input className="admin-input-small flex-1 !text-brand-600 !font-semibold !text-sm"
                                    placeholder="http://..."
                                    value={draft.image || ''} onChange={e => setDraft({ ...draft, image: e.target.value })} />

                                <label className={`cursor-pointer bg-white px-3 py-2 border border-brand-200 text-brand-600 hover:bg-brand-50 transition-colors uppercase tracking-widest text-[10px] font-black rounded-none flex items-center gap-1 flex-shrink-0 ${isUploadingImage ? 'opacity-50 pointer-events-none' : ''}`}>
                                    {isUploadingImage ? <RefreshCw className="animate-spin" size={14} /> : <Upload size={14} />}
                                    {isUploadingImage ? 'ĐANG TẢI...' : 'TẢI TỪ MÁY TÍNH'}
                                    <input type="file" accept="image/*" className="hidden"
                                        onChange={async (e) => {
                                            const file = e.target.files[0];
                                            if (!file) return;
                                            setIsUploadingImage(true);
                                            const formData = new FormData();
                                            formData.append('image', file);
                                            try {
                                                const res = await fetch(`${SERVER_URL}/api/upload-image`, {
                                                    method: 'POST',
                                                    body: formData
                                                });
                                                const data = await res.json();
                                                if (res.ok) {
                                                    setDraft({ ...draft, image: data.url });
                                                } else {
                                                    alert(data.error || 'Lỗi khi tải ảnh lên');
                                                }
                                            } catch (err) {
                                                alert('Không thể kết nối với máy chủ.');
                                            }
                                            setIsUploadingImage(false);
                                        }}
                                    />
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* Description */}
                    <div className="space-y-1">
                        <label className="admin-label">Mô tả món</label>
                        <textarea className="admin-input-small !font-medium !text-gray-700 min-h-[80px]"
                            value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} />
                    </div>

                    {/* Sizes */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between bg-gray-600 p-2 px-3 rounded-none shadow-sm">
                            <label className="admin-label !mb-0 !text-white !text-[14px]">Kích thước / Dung tích</label>
                            <button onClick={addSize} className="text-[11px] font-bold text-gray-700 bg-white px-3 py-1.5 hover:bg-gray-50 transition-all flex items-center gap-1 shadow-sm rounded-none">
                                <Plus size={14} /> Thêm size
                            </button>
                        </div>
                        {draft.sizes.map((s, idx) => (
                            <div key={idx} className="bg-white border border-gray-200 p-3 shadow-sm flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                    <input placeholder="VD: M" className="w-12 flex-shrink-0 border-b-2 border-gray-100 font-black text-[15px] text-center outline-none bg-transparent focus:border-brand-600 transition-all"
                                        value={s.label} onChange={e => updateSize(idx, 'label', e.target.value)} />
                                    <input placeholder="Thể tích (350ml)" className="flex-1 min-w-[60px] border-b-2 border-gray-100 text-[15px] font-bold outline-none bg-transparent focus:border-brand-600 transition-all"
                                        value={s.volume} onChange={e => updateSize(idx, 'volume', e.target.value)} />
                                    <div className="flex items-center gap-1 flex-shrink-0 bg-brand-50/50 px-2 py-1 border border-brand-100">
                                        <span className="text-[9px] text-brand-500 font-extrabold uppercase">Hệ số</span>
                                        <input placeholder="1.0" className="w-10 font-black text-brand-600 text-center outline-none bg-transparent text-sm"
                                            type="number" step="0.1" value={s.multiplier || 1.0} onChange={e => updateSize(idx, 'multiplier', e.target.value)} />
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0 bg-orange-50/50 px-2 py-1 border border-orange-100">
                                        <span className="text-[10px] text-orange-500 font-black">±</span>
                                        <input placeholder="0" className="w-10 font-black text-orange-600 text-center outline-none bg-transparent text-sm"
                                            type="number" value={s.priceAdjust} onChange={e => updateSize(idx, 'priceAdjust', e.target.value)} />
                                        <span className="text-[10px] text-orange-500 font-black">k</span>
                                    </div>
                                    <button onClick={() => removeSize(idx)} className="flex-shrink-0 p-1.5 bg-red-50 text-red-500 hover:bg-red-100 transition-all shadow-sm">
                                        <X size={16} />
                                    </button>
                                </div>

                                {/* Cost/Profit analysis for this size */}
                                {(() => {
                                    const sizeMultiplier = s.multiplier || 1.0;
                                    const sizeSpecificCost = (s.recipe || []).reduce((sum, r) => {
                                        const stats = Array.isArray(inventoryStats) ? inventoryStats : [];
                                        const stat = stats.find(i => i.id === r.ingredientId);
                                        const inv = inventory.find(i => i.id === r.ingredientId);
                                        const cost = stat?.avgCost || inv?.importPrice || 0;
                                        return sum + (cost * r.quantity);
                                    }, 0);
                                    const totalCostForSize = (baseRecipeCost * sizeMultiplier) + sizeSpecificCost;
                                    const sellingPrice = (parseFloat(draft.price) || 0) + (s.priceAdjust || 0);
                                    const profit = sellingPrice - totalCostForSize;
                                    const profitMargin = sellingPrice > 0 ? Math.round((profit / sellingPrice) * 100) : 0;

                                    const projectedItems = stats30Days?.projectedMonthlyItems || 1;
                                    const fixedCostPerCup = projectedItems > 0 ? (totalFixed / 1000) / projectedItems : 0;
                                    const suggestedMinPrice = totalCostForSize + fixedCostPerCup;

                                    return (
                                        <div className="mt-2 space-y-2">
                                            <div className="grid grid-cols-3 gap-2 bg-gray-50/50 p-2 rounded-none border border-gray-100 items-start">
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter leading-snug">Giá NVL Cốt</span>
                                                    <span className="text-[12px] font-normal text-gray-900 mt-0.5">{formatVND(totalCostForSize)}</span>
                                                </div>
                                                <div onClick={() => setShowCostExplanation(true)} className="flex flex-col border-l border-amber-200 pl-2 cursor-pointer hover:bg-amber-50/80 bg-amber-50/30 transition-colors -my-2 py-2" title="Nhấn để xem giải thích chi tiết về Phí Cố Định">
                                                    <span className="flex items-center gap-1 text-[10px] text-amber-700 font-black uppercase tracking-tighter leading-snug">
                                                        *Phí Cố Định/Ly <Info size={10} className="text-amber-500" />
                                                    </span>
                                                    <span className="text-[12px] font-black text-amber-600 mt-0.5">{formatVND(fixedCostPerCup)}</span>
                                                </div>
                                                <div className="flex flex-col border-l border-brand-200 pl-2 bg-brand-50/50 -m-2 p-2" title="Mức giá tối thiểu để thu hồi vốn NVL + Lỗ hổng chi phí cố định">
                                                    <span className="text-[10px] text-brand-700 font-black uppercase tracking-tighter leading-snug cursor-help">*Giá Lập Đáy</span>
                                                    <span className="text-[12px] font-black text-brand-600 mt-0.5">&gt; {formatVND(Math.ceil(suggestedMinPrice))}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between px-1 bg-white border border-gray-100 p-2">
                                                <span className="text-[11px] text-gray-500 uppercase font-bold tracking-widest">Lợi nhuận gộp Size này: {sellingPrice > suggestedMinPrice ? '✅ LÃI TỐT' : (profit > 0 ? '⚠️ CHỈ ĐỦ VỐN NVL' : '❌ LỖ (ÂM VỐN)')}</span>
                                                <span className={`text-[12px] font-black ${profitMargin >= 65 ? 'text-green-600' : profitMargin >= 40 ? 'text-amber-500' : 'text-red-500'}`}>
                                                    {formatVND(profit)} ({profitMargin}%)
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* Size Recipe section */}
                                <div className="pl-4 border-l-2 border-dashed border-gray-200 space-y-2 mt-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] uppercase font-bold tracking-widest text-brand-700 bg-brand-100/50 px-2 py-1 rounded-none">Định lượng đi kèm Size</span>
                                        <button onClick={() => addSizeRecipe(idx)} className="text-[10px] font-bold text-brand-600 hover:text-brand-800 transition-all flex items-center gap-1 hover:bg-brand-100 px-2 py-1 rounded-none">
                                            <Plus size={14} /> THÊM
                                        </button>
                                    </div>
                                    {(s.recipe || []).map((r, recipeIdx) => (
                                        <div key={recipeIdx} className="flex items-center gap-2 bg-brand-50/30 p-2 border border-brand-50 text-sm">
                                            <select className="flex-1 bg-transparent font-normal outline-none text-gray-700 max-w-[150px] sm:max-w-none"
                                                value={r.ingredientId} onChange={e => updateSizeRecipe(idx, recipeIdx, 'ingredientId', e.target.value)}>
                                                <option value="">-- Chọn NL --</option>
                                                {inventory.map(inv => {
                                                    const stat = Array.isArray(inventoryStats) ? inventoryStats.find(s => s.id === inv.id) : null;
                                                    const avgCost = stat?.avgCost || inv.importPrice || 0;
                                                    const costStr = avgCost ? ` - ${formatVND(avgCost)}/${inv.unit}` : '';
                                                    return <option key={inv.id} value={inv.id}>{inv.name}{costStr}</option>;
                                                })}
                                            </select>
                                            <input className="w-16 bg-transparent font-normal text-brand-600 text-center outline-none border-b border-brand-100"
                                                type="number" step="1" value={r.quantity} onChange={e => updateSizeRecipe(idx, recipeIdx, 'quantity', e.target.value)} />
                                            <span className="text-xs text-brand-500 font-normal w-6">{inventory.find(inv => inv.id === r.ingredientId)?.unit}</span>
                                            <button onClick={() => removeSizeRecipe(idx, recipeIdx)} className="text-gray-300 hover:text-red-500"><X size={14} /></button>
                                        </div>
                                    ))}
                                    {(!s.recipe || s.recipe.length === 0) && (
                                        <p className="text-xs text-gray-500 italic">Không có nguyên liệu đi kèm</p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Add-ons */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between bg-gray-600 p-2 px-3 rounded-none shadow-sm">
                            <label className="admin-label !mb-0 !text-white !text-[14px]">Tùy chọn thêm (Add-ons)</label>
                            <button onClick={addAddon} className="text-[11px] font-bold text-gray-700 bg-white px-3 py-1.5 hover:bg-gray-50 transition-all flex items-center gap-1 shadow-sm rounded-none">
                                <Plus size={14} /> Thêm option
                            </button>
                        </div>
                        {draft.addons.map((a, idx) => (
                            <div key={idx} className="bg-white border border-gray-200 p-3 shadow-sm flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                    {/* Shortcut Addon */}
                                    <div className="flex-shrink-0 flex items-center gap-1 bg-yellow-50 px-2 py-1 border border-yellow-200 shadow-sm" title="Mã phím tắt Addon">
                                        <span className="text-[10px] font-normal text-yellow-600">⌨️</span>
                                        <input placeholder="Mã" className="w-5 text-center text-sm font-normal outline-none bg-transparent text-yellow-700"
                                            value={a.addonCode || ''} onChange={e => updateAddon(idx, 'addonCode', e.target.value)} />
                                    </div>
                                    <input placeholder="Tên tùy chọn" className="flex-1 min-w-[80px] border-b-2 border-gray-100 text-[15px] font-normal outline-none bg-transparent focus:border-brand-600 transition-all"
                                        value={a.label} onChange={e => updateAddon(idx, 'label', e.target.value)} />
                                    <div className="flex items-center gap-1 flex-shrink-0 bg-green-50/50 px-2 py-1 border border-green-100">
                                        <span className="text-[10px] text-green-500 font-normal">+</span>
                                        <input placeholder="0" className="w-10 font-normal text-green-600 text-center outline-none bg-transparent text-sm"
                                            type="number" value={a.price} onChange={e => updateAddon(idx, 'price', e.target.value)} />
                                        <span className="text-[10px] text-green-500 font-normal">k</span>
                                    </div>
                                    <div className="flex-shrink-0 flex items-center shadow-sm">
                                        <button disabled={idx === 0} onClick={() => moveAddon(idx, -1)} className="p-1.5 bg-gray-50 text-gray-400 hover:text-brand-500 hover:bg-brand-50 transition-all rounded-none border-r border-gray-100 disabled:opacity-30" title="Chuyển lên">
                                            <ArrowUp size={16} />
                                        </button>
                                        <button disabled={idx === draft.addons.length - 1} onClick={() => moveAddon(idx, 1)} className="p-1.5 bg-gray-50 text-gray-400 hover:text-brand-500 hover:bg-brand-50 transition-all border-r border-gray-100 disabled:opacity-30" title="Chuyển xuống">
                                            <ArrowDown size={16} />
                                        </button>
                                        <button onClick={() => removeAddon(idx)} className="p-1.5 bg-red-50 text-red-500 hover:bg-red-100 transition-all rounded-none" title="Xóa tùy chọn">
                                            <X size={16} />
                                        </button>
                                    </div>
                                </div>

                                {/* Addon Recipe section */}
                                <div className="pl-3 border-l-2 border-dashed border-gray-200 space-y-2 mt-1">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] uppercase font-bold tracking-widest text-brand-700 bg-brand-100/50 px-2 py-1 rounded-none">Định lượng đi kèm Add-on</span>
                                        <button onClick={() => addAddonRecipe(idx)} className="text-[10px] font-bold text-brand-700 hover:text-brand-800 transition-all flex items-center gap-1 hover:bg-brand-100 px-2 py-1 rounded-none">
                                            <Plus size={14} /> THÊM
                                        </button>
                                    </div>
                                    {(a.recipe || []).map((r, recipeIdx) => (
                                        <div key={recipeIdx} className="flex items-center gap-2 bg-brand-50/30 p-1.5 border border-brand-50 text-sm">
                                            <select className="flex-1 bg-transparent font-normal outline-none text-gray-700 max-w-[150px] sm:max-w-none text-[13px]"
                                                value={r.ingredientId} onChange={e => updateAddonRecipe(idx, recipeIdx, 'ingredientId', e.target.value)}>
                                                <option value="">-- Chọn NL --</option>
                                                {inventory.map(inv => {
                                                    const stat = Array.isArray(inventoryStats) ? inventoryStats.find(s => s.id === inv.id) : null;
                                                    const avgCost = stat?.avgCost || inv.importPrice || 0;
                                                    const costStr = avgCost ? ` - ${formatVND(avgCost)}/${inv.unit}` : '';
                                                    return <option key={inv.id} value={inv.id}>{inv.name}{costStr}</option>;
                                                })}
                                            </select>
                                            <input className="w-12 bg-transparent font-normal text-brand-600 text-center outline-none border-b border-brand-100 text-[13px]"
                                                type="number" step="1" value={r.quantity} onChange={e => updateAddonRecipe(idx, recipeIdx, 'quantity', e.target.value)} />
                                            <span className="text-[11px] text-brand-500 font-normal w-6">{inventory.find(inv => inv.id === r.ingredientId)?.unit}</span>
                                            {(() => {
                                                const stat = Array.isArray(inventoryStats) ? inventoryStats.find(s => s.id === r.ingredientId) : null;
                                                const invVal = inventory.find(i => i.id === r.ingredientId);
                                                const avgCost = stat?.avgCost || invVal?.importPrice || 0;
                                                const cost = avgCost * parseFloat(r.quantity || 0);
                                                return cost > 0 ? (
                                                    <span className="text-[11px] font-normal text-gray-500 tracking-tighter ml-auto pr-2">
                                                        ~ {formatVND(cost)}
                                                    </span>
                                                ) : <div className="ml-auto" />;
                                            })()}
                                            <button onClick={() => removeAddonRecipe(idx, recipeIdx)} className="text-gray-300 hover:text-red-500"><X size={14} /></button>
                                        </div>
                                    ))}
                                    {(!a.recipe || a.recipe.length === 0) && (
                                        <p className="text-xs text-gray-500 italic">Không có nguyên liệu đi kèm</p>
                                    )}

                                    {/* Cost/Profit analysis for Addon */}
                                    {(() => {
                                        const addonCost = (a.recipe || []).reduce((sum, r) => {
                                            const stats = Array.isArray(inventoryStats) ? inventoryStats : [];
                                            const stat = stats.find(i => i.id === r.ingredientId);
                                            const invItem = inventory.find(i => i.id === r.ingredientId);
                                            const avgCost = stat?.avgCost || invItem?.importPrice || 0;
                                            return sum + (avgCost * parseFloat(r.quantity || 0));
                                        }, 0);
                                        const addonSellingPrice = parseFloat(a.price || 0);
                                        const profit = addonSellingPrice - addonCost;
                                        const profitMargin = addonSellingPrice > 0 ? Math.round((profit / addonSellingPrice) * 100) : 0;

                                        if (addonCost === 0 && addonSellingPrice === 0) return null;

                                        return (
                                            <div className="flex justify-between items-center bg-gray-50/50 px-2 py-1.5 rounded-none border border-gray-100 mt-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[13px] text-gray-500 font-bold uppercase tracking-tighter">VỐN:</span>
                                                    <span className="text-[11px] font-normal text-gray-600">{formatVND(addonCost)}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[13px] text-gray-500 font-bold uppercase tracking-tighter">LÃI:</span>
                                                    <span className="text-[11px] font-normal text-gray-500 whitespace-nowrap">
                                                        <span className={`${profitMargin >= 65 ? 'text-green-600' : profitMargin >= 40 ? 'text-amber-500' : 'text-red-500'}`}>{formatVND(profit)}</span> ({profitMargin}%)
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                        ))}
                        {draft.addons.length === 0 && (
                            <p className="text-[11px] text-gray-400 font-bold text-center py-3 bg-gray-50 border-2 border-dashed border-gray-100">Chưa có tùy chọn nào</p>
                        )}
                    </div>

                    {/* Recipe Setup */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between bg-gray-600 p-2 px-3 rounded-none shadow-sm">
                            <label className="admin-label !mb-0 !text-white !text-[14px]">Định lượng nguyên liệu (Recipes)</label>
                            <button onClick={addRecipe} className="text-[11px] font-bold text-gray-700 bg-white px-3 py-1.5 hover:bg-gray-50 transition-all flex items-center gap-1 shadow-sm rounded-none">
                                <Plus size={14} /> Thêm định lượng
                            </button>
                        </div>
                        {draft.recipe.map((r, idx) => (
                            <div key={idx} className="bg-white border border-gray-200 p-3 flex flex-wrap items-center gap-2 shadow-sm">
                                <select className="flex-1 border-b-2 border-gray-100 text-[14px] font-normal outline-none bg-transparent focus:border-brand-600 transition-all min-w-[150px]"
                                    value={r.ingredientId} onChange={e => updateRecipe(idx, 'ingredientId', e.target.value)}>
                                    <option value="">-- Chọn nguyên liệu --</option>
                                    {inventory.map(inv => {
                                        const stat = Array.isArray(inventoryStats) ? inventoryStats.find(s => s.id === inv.id) : null;
                                        const avgCost = stat?.avgCost || inv.importPrice || 0;
                                        const costStr = avgCost ? ` - ${formatVND(avgCost)}/${inv.unit}` : '';
                                        return <option key={inv.id} value={inv.id}>{inv.name}{costStr}</option>;
                                    })}
                                </select>
                                <div className="flex items-center gap-1 flex-shrink-0 bg-brand-50/50 px-2 py-1 border border-brand-100">
                                    <input placeholder="Số lượng" className="w-12 font-normal text-brand-600 text-center outline-none bg-transparent text-sm"
                                        type="number" step="1" value={r.quantity} onChange={e => updateRecipe(idx, 'quantity', e.target.value)} />
                                    <span className="text-[11px] text-brand-500 font-normal">
                                        {inventory.find(inv => inv.id === r.ingredientId)?.unit || ''}
                                    </span>
                                </div>
                                <button onClick={() => removeRecipe(idx)} className="p-2 text-gray-300 hover:text-red-500 transition-all">
                                    <X size={20} />
                                </button>
                            </div>
                        ))}
                        {draft.recipe.length === 0 && (
                            <p className="text-xs text-gray-300 font-bold text-center py-4 bg-gray-50  border-2 border-dashed border-gray-100">Chưa thiết lập định lượng</p>
                        )}
                    </div>

                    {/* Preparation Instructions */}
                    <div className="space-y-1">
                        <label className="admin-label">Cách làm / Hướng dẫn chế biến (Tùy chọn)</label>
                        <textarea
                            className="admin-input-small !font-medium !text-gray-700 min-h-[100px]"
                            placeholder="VD: B1: Cho 30ml cốt cafe vào ly..."
                            value={draft.recipeInstructions}
                            onChange={e => setDraft({ ...draft, recipeInstructions: e.target.value })}
                        />
                    </div>

                    {/* Sugar & Ice Options Grid (Minimalist) */}
                    <div className="mt-4 pt-4 border-t border-gray-100">
                        <div className="grid grid-cols-2 gap-8">
                            {/* Sugar Options */}
                            <div>
                                <h4 className="font-black text-gray-900 text-[13px] tracking-wider uppercase mb-3 text-center border-b pb-2">Đường</h4>
                                <div className="flex flex-col gap-2">
                                    {DEFAULT_SUGAR.map(val => {
                                        const active = draft.sugarOptions.includes(val);
                                        const sortedOpts = draft.sugarOptions.slice().sort((a, b) => DEFAULT_SUGAR.indexOf(a) - DEFAULT_SUGAR.indexOf(b));
                                        const isDefault = draft.defaultSugar ? (draft.defaultSugar === val) : (sortedOpts[0] === val);
                                        return (
                                            <div key={val} className="flex items-center justify-between group px-2 py-1.5 hover:bg-gray-50 rounded-none transition-colors">
                                                <label className="flex items-center gap-3 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={active}
                                                        onChange={(e) => {
                                                            setDraft(d => {
                                                                const newOpts = e.target.checked ? [...d.sugarOptions, val] : d.sugarOptions.filter(v => v !== val);
                                                                return { ...d, sugarOptions: newOpts, defaultSugar: (!e.target.checked && newOpts.length === 1) ? newOpts[0] : (d.defaultSugar === val && e.target.checked ? (newOpts[newOpts.length - 1] || null) : d.defaultSugar) };
                                                            });
                                                        }}
                                                        className="w-4 h-4 text-amber-500 rounded border-gray-300 focus:ring-amber-500 cursor-pointer"
                                                    />
                                                    <span className={`text-[13px] ${active ? 'font-black text-gray-900' : 'font-medium text-gray-500'}`}>{val}</span>
                                                </label>

                                                {active && (
                                                    <input
                                                        type="radio"
                                                        name={`defaultSugar_${item?.id || 'new'}`}
                                                        checked={isDefault}
                                                        onChange={() => setDraft(d => ({ ...d, defaultSugar: val }))}
                                                        className="w-3.5 h-3.5 text-amber-600 border-gray-300 focus:ring-amber-500 cursor-pointer opacity-50 group-hover:opacity-100 transition-opacity"
                                                        title="Chọn mức mặc định"
                                                    />
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Ice Options */}
                            <div>
                                <h4 className="font-black text-gray-900 text-[13px] tracking-wider uppercase mb-3 text-center border-b pb-2">Đá</h4>
                                <div className="flex flex-col gap-2">
                                    {DEFAULT_ICE.map(val => {
                                        const active = draft.iceOptions.includes(val);
                                        const sortedOpts = draft.iceOptions.slice().sort((a, b) => DEFAULT_ICE.indexOf(a) - DEFAULT_ICE.indexOf(b));
                                        const isDefault = draft.defaultIce ? (draft.defaultIce === val) : (sortedOpts[0] === val);
                                        return (
                                            <div key={val} className="flex items-center justify-between group px-2 py-1.5 hover:bg-gray-50 rounded-none transition-colors">
                                                <label className="flex items-center gap-3 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={active}
                                                        onChange={(e) => {
                                                            setDraft(d => {
                                                                const newOpts = e.target.checked ? [...d.iceOptions, val] : d.iceOptions.filter(v => v !== val);
                                                                return { ...d, iceOptions: newOpts, defaultIce: (!e.target.checked && newOpts.length === 1) ? newOpts[0] : (d.defaultIce === val && e.target.checked ? (newOpts[newOpts.length - 1] || null) : d.defaultIce) };
                                                            });
                                                        }}
                                                        className="w-4 h-4 text-brand-500 rounded border-gray-300 focus:ring-brand-500 cursor-pointer"
                                                    />
                                                    <span className={`text-[13px] ${active ? 'font-black text-gray-900' : 'font-medium text-gray-500'}`}>{val}</span>
                                                </label>

                                                {active && (
                                                    <input
                                                        type="radio"
                                                        name={`defaultIce_${item?.id || 'new'}`}
                                                        checked={isDefault}
                                                        onChange={() => setDraft(d => ({ ...d, defaultIce: val }))}
                                                        className="w-3.5 h-3.5 text-brand-600 border-gray-300 focus:ring-brand-500 cursor-pointer opacity-50 group-hover:opacity-100 transition-opacity"
                                                        title="Chọn mức mặc định"
                                                    />
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Legend / Note */}
                        <div className="mt-5 pt-3 border-t border-gray-50 flex items-center justify-center gap-8 text-[11px] text-gray-500 font-medium italic">
                            <div className="flex items-center gap-2">
                                <span className="w-3.5 h-3.5 border-2 border-gray-400 rounded-sm inline-block" />
                                Chọn mức hiển thị
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-3.5 h-3.5 border-2 border-gray-400 rounded-full inline-block flex items-center justify-center"><div className="w-1.5 h-1.5 bg-gray-400 rounded-full"></div></span>
                                Chọn mức mặc định
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-4 pt-4">
                        <button onClick={onCancel} className="admin-btn-secondary">Hủy</button>
                        <button
                            disabled={!draft.name || draft.submitting}
                            onClick={async () => {
                                setDraft(d => ({ ...d, submitting: true }));
                                await onSave(draft);
                                setDraft(d => ({ ...d, submitting: false }));
                            }}
                            className={`admin-btn-primary ${(!draft.name || draft.submitting) ? 'opacity-50 cursor-not-allowed' : ''}`}>
                            {draft.submitting ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white  animate-spin" />
                            ) : (
                                <Save size={20} />
                            )}
                            {draft.submitting ? ' Đang lưu...' : ' Lưu thay đổi'}
                        </button>
                    </div>
                </div>
            </motion.div >

            {/* Cost Explanation Modal */}
            {showCostExplanation && createPortal(
                <div className="fixed inset-0 z-[99999] bg-slate-900/60 backdrop-blur-sm flex justify-center items-center p-4">
                    <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                        className="bg-white p-6 max-w-sm w-full shadow-2xl space-y-5 rounded-none border-t-4 border-amber-500 relative">
                        <button onClick={() => setShowCostExplanation(false)} className="absolute top-4 right-4 text-gray-400 hover:text-red-500 transition-colors">
                            <X size={20} />
                        </button>
                        <div className="space-y-1 pr-6">
                            <h3 className="text-lg font-black text-gray-900 flex items-center gap-2 uppercase tracking-tight">
                                <Info size={20} className="text-amber-500" /> Giải thích Phí Cố Định
                            </h3>
                            <p className="text-[13px] font-medium text-gray-500 leading-relaxed">
                                Tại sao mỗi ly nước lại phải cõng thêm một khoản phí vô hình?
                            </p>
                        </div>

                        <div className="bg-amber-50 border border-amber-200 p-4 space-y-2 text-[13px] text-amber-900 shadow-inner">
                            <p className="leading-relaxed">
                                Ngoài tiền Nguyên Vật Liệu (NVL), quán của bạn mỗi tháng đều phải chi trả các khoản phí <strong>không thay đổi</strong> dù bán được ít hay nhiều:
                            </p>
                            <ul className="list-disc pl-4 font-bold space-y-1 text-amber-800 tracking-tight">
                                <li>Mặt bằng & Khấu hao thiết bị</li>
                                <li>Tiền Điện, Tiền Nước</li>
                                <li>Lương nhân sự cứng</li>
                                <li>Wifi, Rác, Phần mềm...</li>
                            </ul>
                        </div>

                        <div className="bg-gray-50 border border-gray-100 p-4 space-y-3 shadow-sm">
                            <p className="text-[11px] text-gray-500 font-black uppercase tracking-widest">Cách hệ thống phân bổ:</p>
                            <div className="flex justify-between items-center bg-white p-2.5 border border-gray-100 shadow-sm">
                                <span className="text-xs font-bold text-gray-600">A. Tổng CF Cố định (tháng)</span>
                                <span className="text-sm font-black text-amber-600">{formatVND(totalFixed / 1000)}</span>
                            </div>
                            <div className="flex justify-between items-center bg-white p-2.5 border border-gray-100 shadow-sm mt-1.5">
                                <span className="text-xs font-bold text-gray-600">B. Lượng ly bán dự phóng</span>
                                <span className="text-sm font-black text-brand-600">~{Math.round(stats30Days?.projectedMonthlyItems || 1)} ly/tháng</span>
                            </div>
                            <div className="border-t-2 border-dashed border-gray-200 pt-3 mt-1 flex justify-between items-center">
                                <span className="text-xs font-black text-gray-800 uppercase tracking-tighter">Phí gánh / 1 ly (A ÷ B)</span>
                                <span className="text-lg font-black text-red-500">{formatVND((stats30Days?.projectedMonthlyItems || 1) > 0 ? (totalFixed / 1000) / (stats30Days?.projectedMonthlyItems || 1) : 0)}</span>
                            </div>
                        </div>

                        <div className="bg-brand-50 text-brand-800 p-3 text-[13px] font-medium border-l-4 border-brand-500 leading-relaxed shadow-sm">
                            Chỉ khi bạn bán <strong>CAO HƠN Giá Lập Đáy</strong> thì quán mới thực sự sinh lời sau khi trừ cả vốn NVL lẫn các phí duy trì!
                        </div>

                        <button onClick={() => setShowCostExplanation(false)}
                            className="w-full bg-slate-900 text-white font-black uppercase tracking-widest py-3.5 text-xs hover:bg-brand-600 active:scale-95 transition-all shadow-md">
                            Đã Hiểu Cách Tính
                        </button>
                    </motion.div>
                </div>,
                document.body
            )}
        </>
    );
};

// ── Staff Order Panel ──
// ── Staff Order Panel (POS) ──

export { InlineEditPanel, DEFAULT_SUGAR, DEFAULT_ICE };
