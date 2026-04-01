import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { Save, X, Plus, Trash2, Edit2, ChevronDown, ChevronUp, ArrowUp, ArrowDown, Search, GripVertical, Camera, Info, Upload, RefreshCw } from 'lucide-react';
import { createPortal } from 'react-dom';
import { SERVER_URL, getImageUrl } from '../../api';
import { formatVND } from '../../utils/dashboardUtils';

// Phải khớp với SharedCustomizationModal.jsx (thứ tự từ nhỏ → lớn)
const DEFAULT_SUGAR = ['0%', '30%', '50%', '100%', '120%'];
const DEFAULT_ICE = ['Không đá', 'Ít đá', 'Bình thường', 'Nhiều đá'];

// ── Inline edit panel (with sizes + addons) ──
const InlineEditPanel = ({ item, inventory, inventoryStats = [], onSave, onCancel, onDraftChange, settings, stats30Days, totalFixed, fixedCosts = {} }) => {
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
    const [isDirty, setIsDirty] = useState(false);
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => { setIsMounted(true); }, []);

    // Track dirty state whenever draft changes
    useEffect(() => {
        if (onDraftChange) onDraftChange(draft);
        setIsDirty(true);
    }, [draft]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKey = (e) => {
            // Ctrl+Enter or Ctrl+S = save
            if ((e.ctrlKey || e.metaKey) && (e.key === 'Enter' || e.key === 's')) {
                e.preventDefault();
                if (draft.name && !draft.submitting) handleSave();
                return;
            }
            // Escape = close (with dirty check)
            if (e.key === 'Escape' && !showCostExplanation) {
                e.preventDefault();
                handleClose();
            }
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [draft, isDirty, showCostExplanation]);

    const handleSave = async () => {
        setDraft(d => ({ ...d, submitting: true }));
        await onSave(draft);
        setIsDirty(false);
        setDraft(d => ({ ...d, submitting: false }));
    };

    const handleClose = () => {
        if (isDirty) {
            const choice = window.confirm('Bạn có thay đổi chưa được lưu. Bạn có muốn lưu trước khi đóng không?');
            if (choice) {
                handleSave().then(() => onCancel());
                return;
            }
        }
        onCancel();
    };

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

    // Fixed cost per cup (top-level for header display)
    const _depMonths = fixedCosts.machineDepreciationMonths || 36;
    const _monthlyMachines = (parseFloat(fixedCosts.machines) * 1000 || 0) / _depMonths;
    const _monthlyOther = (parseFloat(fixedCosts.rent) * 1000 || 0)
        + (parseFloat(fixedCosts.electricity) * 1000 || 0)
        + (parseFloat(fixedCosts.water) * 1000 || 0)
        + (parseFloat(fixedCosts.salaries) * 1000 || 0)
        + (parseFloat(fixedCosts.other) * 1000 || 0);
    const _adjustedFixed = _monthlyMachines + _monthlyOther;
    const _projected = stats30Days?.projectedMonthlyItems || 1;
    const fixedCostPerCupBase = _projected > 0 ? (_adjustedFixed / 1000) / _projected : 0;

    return (
        <>
        {isMounted && typeof document !== 'undefined' && document.body && createPortal(
        <>
        {/* Backdrop */}
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9997] bg-black/50 backdrop-blur-[3px] flex items-center justify-center"
            onClick={handleClose}
        >
        {/* Centered Modal */}
        <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="relative flex flex-col bg-[#F9F8F6] z-[9998]"
            style={{ width: 'min(900px, 96vw)', maxHeight: '92vh', borderRadius: '16px', boxShadow: '0 25px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}
        >
            {/* Sticky Header */}
            <div className="flex-shrink-0 flex items-center justify-between bg-gray-800 text-white" style={{ padding: '14px 20px' }}>
                <div className="flex items-center gap-3 min-w-0">
                    <button onClick={handleClose} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center flex-shrink-0 transition-colors">
                        <X size={16} />
                    </button>
                    <div className="min-w-0">
                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Chỉnh sửa món</p>
                        <p className="font-black text-white text-[15px] truncate">{draft.name || 'Chưa có tên'}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right hidden sm:block" style={{ lineHeight: '1.6' }}>
                        {isDirty && (
                            <span className="block text-[10px] text-amber-400 font-black uppercase tracking-widest">⬤ Chưa lưu</span>
                        )}
                        <span className="block text-[9px] text-gray-500">Ctrl+S → Lưu &nbsp;·&nbsp; Esc → Đóng</span>
                    </div>
                    <button
                        disabled={!draft.name || draft.submitting}
                        onClick={handleSave}
                        className="flex items-center gap-2 font-black text-[11px] uppercase tracking-widest bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ borderRadius: '6px', padding: '8px 18px', minWidth: '84px' }}
                    >
                        {draft.submitting
                            ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white animate-spin rounded-full" /> Lưu...</>
                            : <><Save size={13} strokeWidth={2.5} /> Lưu</>
                        }
                    </button>
                </div>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto">
                <div className="space-y-6" style={{ padding: '24px 28px' }}>
                    {/* Top info bar: Name / Price / Fixed Cost */}
                    <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 140px 1fr' }}>
                        {/* Col 1: Tên món + Danh mục */}
                        <div className="space-y-3">
                            <div className="space-y-1">
                                <label className="admin-label">Tên món</label>
                                <input className="admin-input-small !text-lg !font-black !tracking-tight text-gray-900"
                                    value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
                            </div>
                            <div className="space-y-1">
                                <label className="admin-label">Danh mục</label>
                                <select className="admin-input-small appearance-none !font-bold"
                                    value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })}>
                                    {(settings?.menuCategories || ['TRUYỀN THỐNG', 'PHA MÁY', 'Trà', 'Khác']).map(c => <option key={c} value={c}>{c}</option>)}
                                    {(!settings?.menuCategories?.includes(draft.category) && draft.category) && <option value={draft.category}>{draft.category}</option>}
                                </select>
                            </div>
                        </div>

                        {/* Col 2: Giá bán - nổi bật giữa trung tâm */}
                        <div className="flex flex-col items-center justify-center bg-white border-2 border-amber-200 shadow-md" style={{ borderRadius: '12px', padding: '14px 12px', gap: '6px' }}>
                            <label className="text-[9px] font-black uppercase tracking-widest text-amber-600">Giá bán</label>
                            <div className="flex items-baseline gap-0">
                                <input
                                    type="number"
                                    value={draft.price}
                                    onChange={e => setDraft({ ...draft, price: e.target.value })}
                                    className="text-right text-[28px] font-black text-amber-600 outline-none bg-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    style={{ width: `${Math.max(1, String(draft.price || '').length || 1)}ch`, fontSize: '28px' }}
                                />
                                <span className="text-[18px] font-black text-amber-400 select-none pointer-events-none" style={{ fontSize: '18px', lineHeight: 1 }}>.000đ</span>
                            </div>
                        </div>

                        {/* Col 3: Phí cố định + URL */}
                        <div className="space-y-3">
                            <div
                                onClick={() => setShowCostExplanation(true)}
                                className="flex items-center justify-between cursor-pointer bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors"
                                style={{ borderRadius: '10px', padding: '10px 14px' }}
                                title="Nhấn để xem giải thích phí cố định"
                            >
                                <div>
                                    <p className="text-[9px] font-black uppercase tracking-widest text-amber-600 flex items-center gap-1">
                                        <Info size={10} /> Phí Cố Định/Ly
                                    </p>
                                    <p className="text-[18px] font-black text-amber-700 mt-0.5">{formatVND(fixedCostPerCupBase)}</p>
                                </div>
                                <ChevronDown size={14} className="text-amber-400 flex-shrink-0" />
                            </div>
                            <div className="space-y-1">
                                <label className="admin-label">URL Hình ảnh</label>
                                <div className="flex gap-2 items-center">
                                    <input className="admin-input-small flex-1 !text-brand-600 !font-semibold !text-sm"
                                        placeholder="http:// hoặc dán ảnh (Ctrl+V)"
                                        value={draft.image || ''} onChange={e => setDraft({ ...draft, image: e.target.value })}
                                        onPaste={async (e) => {
                                            const items = e.clipboardData?.items;
                                            if (!items) return;
                                            for (const item of Array.from(items)) {
                                                if (item.type.startsWith('image/')) {
                                                    e.preventDefault();
                                                    const file = item.getAsFile();
                                                    if (!file) return;
                                                    setIsUploadingImage(true);
                                                    const formData = new FormData();
                                                    formData.append('image', file);
                                                    try {
                                                        const res = await fetch(`${SERVER_URL}/api/upload-image`, { method: 'POST', body: formData });
                                                        const data = await res.json();
                                                        if (res.ok) setDraft(d => ({ ...d, image: data.url }));
                                                        else alert(data.error || 'Lỗi tải ảnh');
                                                    } catch { alert('Không thể kết nối máy chủ.'); }
                                                    setIsUploadingImage(false);
                                                    return;
                                                }
                                            }
                                        }}
                                    />
                                    {/* Paste from clipboard button */}
                                    <button
                                        type="button"
                                        title="Dán ảnh từ clipboard"
                                        disabled={isUploadingImage}
                                        onClick={async () => {
                                            try {
                                                const clipItems = await navigator.clipboard.read();
                                                for (const ci of clipItems) {
                                                    const imgType = ci.types.find(t => t.startsWith('image/'));
                                                    if (imgType) {
                                                        const blob = await ci.getType(imgType);
                                                        const file = new File([blob], 'paste.png', { type: imgType });
                                                        setIsUploadingImage(true);
                                                        const formData = new FormData();
                                                        formData.append('image', file);
                                                        const res = await fetch(`${SERVER_URL}/api/upload-image`, { method: 'POST', body: formData });
                                                        const data = await res.json();
                                                        if (res.ok) setDraft(d => ({ ...d, image: data.url }));
                                                        else alert(data.error || 'Lỗi tải ảnh');
                                                        setIsUploadingImage(false);
                                                        return;
                                                    }
                                                }
                                                alert('Không tìm thấy ảnh trong clipboard');
                                            } catch { alert('Hãy thử Ctrl+V vào ô nhập URL.'); }
                                        }}
                                        className={`cursor-pointer bg-white px-2 py-2 border border-purple-200 text-purple-600 hover:bg-purple-50 transition-colors uppercase tracking-widest text-[9px] font-black flex items-center gap-1 flex-shrink-0 ${isUploadingImage ? 'opacity-50 pointer-events-none' : ''}`}
                                        style={{ borderRadius: '6px' }}
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                        {isUploadingImage ? 'Đang...' : 'Dán'}
                                    </button>
                                    <label className={`cursor-pointer bg-white px-2 py-2 border border-brand-200 text-brand-600 hover:bg-brand-50 transition-colors uppercase tracking-widest text-[9px] font-black flex items-center gap-1 flex-shrink-0 ${isUploadingImage ? 'opacity-50 pointer-events-none' : ''}`} style={{ borderRadius: '6px' }}>
                                        {isUploadingImage ? <RefreshCw className="animate-spin" size={12} /> : <Upload size={12} />}
                                        {isUploadingImage ? 'Tải...' : 'Tải lên'}
                                        <input type="file" accept="image/*" className="hidden"
                                            onChange={async (e) => {
                                                const file = e.target.files[0];
                                                if (!file) return;
                                                setIsUploadingImage(true);
                                                const formData = new FormData();
                                                formData.append('image', file);
                                                try {
                                                    const res = await fetch(`${SERVER_URL}/api/upload-image`, { method: 'POST', body: formData });
                                                    const data = await res.json();
                                                    if (res.ok) { setDraft({ ...draft, image: data.url }); }
                                                    else { alert(data.error || 'Lỗi khi tải ảnh lên'); }
                                                } catch { alert('Không thể kết nối với máy chủ.'); }
                                                setIsUploadingImage(false);
                                            }}
                                        />
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>{/* end 3-col grid */}

                    {/* Description */}
                    <div className="space-y-1">
                        <label className="admin-label">Mô tả món</label>
                        <textarea className="admin-input-small !font-medium !text-gray-700 min-h-[60px]"
                            value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} />
                    </div>

                    {/* Sizes — group box */}
                    <div style={{ marginTop: '12px', border: '1.5px solid #d1d5db', borderRadius: '12px', overflow: 'hidden' }}>
                        {/* Header bar */}
                        <div className="flex items-center justify-between bg-gray-600" style={{ paddingLeft: '20px', paddingRight: '14px', paddingTop: '10px', paddingBottom: '10px' }}>
                            <label className="admin-label !mb-0 !text-white !text-[14px]">Kích thước / Dung tích</label>
                            <button onClick={addSize} className="text-[11px] font-bold text-gray-700 bg-white px-3 py-1.5 hover:bg-gray-50 transition-all flex items-center gap-1 shadow-sm" style={{ borderRadius: '6px' }}>
                                <Plus size={14} /> Thêm size
                            </button>
                        </div>
                        {/* Content */}
                        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {draft.sizes.map((s, idx) => (
                            <div key={idx} className="bg-white border border-gray-200 shadow-sm flex flex-col" style={{ borderRadius: '10px', padding: '16px 20px', gap: '12px' }}>
                                <div className="flex items-center gap-2">
                                    <input placeholder="VD: M" className="w-12 flex-shrink-0 border-b-2 border-gray-100 font-black text-[15px] text-center outline-none bg-transparent focus:border-brand-600 transition-all"
                                        value={s.label} onChange={e => updateSize(idx, 'label', e.target.value)} />
                                    <input placeholder="Thể tích (350ml)" className="flex-1 min-w-[60px] border-b-2 border-gray-100 text-[15px] font-bold outline-none bg-transparent focus:border-brand-600 transition-all"
                                        value={s.volume} onChange={e => updateSize(idx, 'volume', e.target.value)} />
                                    {/* Hệ số stepper */}
                                    <div className="flex items-center flex-shrink-0 border border-brand-200 overflow-hidden" style={{ borderRadius: '6px', background: 'rgba(var(--color-brand-rgb, 99,91,255),0.04)' }}>
                                        <button
                                            onClick={() => updateSize(idx, 'multiplier', Math.max(0.1, Math.round(((parseFloat(s.multiplier)||1) - 0.05) * 100) / 100))}
                                            className="text-brand-600 hover:bg-brand-100 active:bg-brand-200 transition-colors font-black text-sm flex-shrink-0" style={{ padding: '8px 14px', minWidth: '36px', textAlign: 'center' }}
                                        >−</button>
                                        <div className="flex items-center px-1">
                                            <span className="text-[9px] text-brand-500 font-extrabold uppercase mr-1">Hệ số</span>
                                            <input
                                                type="number" step="0.05"
                                                value={s.multiplier || 1.0}
                                                onChange={e => updateSize(idx, 'multiplier', e.target.value)}
                                                className="font-black text-brand-600 text-center outline-none bg-transparent text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                style={{ width: `${Math.max(2, String(s.multiplier || '1').length || 2)}ch` }}
                                            />
                                        </div>
                                        <button
                                            onClick={() => updateSize(idx, 'multiplier', Math.round(((parseFloat(s.multiplier)||1) + 0.05) * 100) / 100)}
                                            className="text-brand-600 hover:bg-brand-100 active:bg-brand-200 transition-colors font-black text-sm flex-shrink-0" style={{ padding: '8px 14px', minWidth: '36px', textAlign: 'center' }}
                                        >+</button>
                                    </div>
                                    {/* Điều chỉnh giá stepper */}
                                    <div className="flex items-center flex-shrink-0 border border-orange-200 overflow-hidden" style={{ borderRadius: '6px', backgroundColor: 'rgb(255 247 237 / 0.5)' }}>
                                        <button
                                            onClick={() => updateSize(idx, 'priceAdjust', (parseInt(s.priceAdjust)||0) - 1)}
                                            className="text-orange-600 hover:bg-orange-100 active:bg-orange-200 transition-colors font-black text-sm flex-shrink-0" style={{ padding: '8px 14px', minWidth: '36px', textAlign: 'center' }}
                                        >−</button>
                                        <div className="flex items-baseline gap-0 px-1">
                                            <input
                                                type="number"
                                                value={s.priceAdjust}
                                                onChange={e => updateSize(idx, 'priceAdjust', e.target.value)}
                                                className="font-black text-orange-600 text-right outline-none bg-transparent text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                style={{ width: `${Math.max(1, String(s.priceAdjust || '').length || 1)}ch` }}
                                            />
                                            <span className="text-[10px] text-orange-400 font-black">.000đ</span>
                                        </div>
                                        <button
                                            onClick={() => updateSize(idx, 'priceAdjust', (parseInt(s.priceAdjust)||0) + 1)}
                                            className="text-orange-600 hover:bg-orange-100 active:bg-orange-200 transition-colors font-black text-sm flex-shrink-0" style={{ padding: '8px 14px', minWidth: '36px', textAlign: 'center' }}
                                        >+</button>
                                    </div>
                                    <button onClick={() => removeSize(idx)} className="flex-shrink-0 p-1.5 bg-red-50 text-red-500 hover:bg-red-100 transition-all shadow-sm" style={{ borderRadius: '6px' }}>
                                        <X size={16} />
                                    </button>
                                </div>

                                {/* Size Recipe section */}
                                <div className="mt-3 space-y-1.5" style={{ borderLeft: '2px dashed #e5e7eb', paddingLeft: '12px' }}>
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] uppercase font-black tracking-widest text-brand-600 bg-brand-50 px-2 py-1" style={{ borderRadius: '4px' }}>Định lượng kèm Size</span>
                                        <button onClick={() => addSizeRecipe(idx)} className="text-[10px] font-black text-brand-600 hover:bg-brand-100 flex items-center gap-1 px-2 py-1 transition-all" style={{ borderRadius: '4px' }}>
                                            <Plus size={12} /> THÊM
                                        </button>
                                    </div>
                                    {(s.recipe || []).map((r, recipeIdx) => (
                                        <div key={recipeIdx} className="flex items-center gap-2 bg-white border border-brand-100 text-sm" style={{ borderRadius: '6px', padding: '6px 10px' }}>
                                            <select className="flex-1 min-w-0 bg-transparent font-normal outline-none text-gray-700 text-[13px]"
                                                value={r.ingredientId} onChange={e => updateSizeRecipe(idx, recipeIdx, 'ingredientId', e.target.value)}>
                                                <option value="">-- Chọn NL --</option>
                                                {inventory.map(inv => {
                                                    const stat = Array.isArray(inventoryStats) ? inventoryStats.find(s => s.id === inv.id) : null;
                                                    const avgCost = stat?.avgCost || inv.importPrice || 0;
                                                    const costStr = avgCost ? ` (${formatVND(avgCost)}/${inv.unit})` : '';
                                                    return <option key={inv.id} value={inv.id}>{inv.name}{costStr}</option>;
                                                })}
                                            </select>
                                            <input className="w-14 bg-gray-50 font-black text-brand-600 text-center outline-none border border-brand-100 text-[13px] flex-shrink-0" style={{ borderRadius: '4px', padding: '2px 4px' }}
                                                type="number" step="1" value={r.quantity} onChange={e => updateSizeRecipe(idx, recipeIdx, 'quantity', e.target.value)} />
                                            <span className="text-[11px] text-brand-500 font-black flex-shrink-0" style={{ minWidth: '20px' }}>{inventory.find(inv => inv.id === r.ingredientId)?.unit}</span>
                                            <button onClick={() => removeSizeRecipe(idx, recipeIdx)} className="text-gray-300 hover:text-red-500 flex-shrink-0"><X size={14} /></button>
                                        </div>
                                    ))}
                                    {(!s.recipe || s.recipe.length === 0) && (
                                        <p className="text-[11px] text-gray-400 italic">Chưa có nguyên liệu đi kèm</p>
                                    )}
                                </div>

                                {/* Cost/Profit analysis — AFTER recipe, 3-col row */}
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
                                    // Lãi mặc định: chỉ trừ NVL
                                    const profitNVL = sellingPrice - totalCostForSize;
                                    const profitMarginNVL = sellingPrice > 0 ? Math.round((profitNVL / sellingPrice) * 100) : 0;
                                    // Lãi đầy đủ: trừ cả phí cố định (dùng cho màu và tooltip)
                                    const profitFull = sellingPrice - totalCostForSize - fixedCostPerCupBase;
                                    const fullMarginPct = sellingPrice > 0 ? Math.round((profitFull / sellingPrice) * 100) : 0;
                                    const suggestedMinPrice = totalCostForSize + fixedCostPerCupBase;
                                    // Color: profit đầy đủ >25% = xanh, âm = đỏ, còn lại = vàng
                                    const isGreen = fullMarginPct > 25;
                                    const isRed = profitFull <= 0;
                                    const bgColor = isGreen ? '#f0fdf4' : isRed ? '#fef2f2' : '#fffbeb';
                                    const bdColor = isGreen ? '#bbf7d0' : isRed ? '#fecaca' : '#fde68a';
                                    const txtColor = isGreen ? '#15803d' : isRed ? '#dc2626' : '#d97706';
                                    const statusLabel = isGreen ? '✅ Lãi tốt' : isRed ? '❌ Lỗ' : '⚠️ Biên thấp';
                                    return (
                                        <div className="grid grid-cols-3 gap-2 mt-3">
                                            {/* NVL */}
                                            <div className="flex flex-col bg-gray-50 border border-gray-100" style={{ borderRadius: '8px', padding: '8px 12px' }}>
                                                <span className="text-[9px] text-gray-400 font-black uppercase tracking-widest">Vốn NVL</span>
                                                <span className="text-[13px] font-black text-gray-800 mt-0.5">{formatVND(totalCostForSize)}</span>
                                            </div>
                                            {/* Giá đề xuất */}
                                            <div className="flex flex-col bg-blue-50 border border-blue-100" style={{ borderRadius: '8px', padding: '8px 12px' }} title="Giá tối thiểu phải bán (NVL + phí cố định)">
                                                <span className="text-[9px] text-blue-600 font-black uppercase tracking-widest">Giá Đề Xuất</span>
                                                <span className="text-[13px] font-black text-blue-700 mt-0.5">&gt; {formatVND(Math.ceil(suggestedMinPrice))}</span>
                                            </div>
                                            {/* LN mỗi ly — hover để xem sau phí cố định */}
                                            <div className="group relative flex flex-col border cursor-help" style={{ borderRadius: '8px', padding: '8px 12px', background: bgColor, borderColor: bdColor }}>
                                                <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: txtColor }}>LN MỖI LY</span>
                                                <span className="text-[13px] font-black mt-0.5" style={{ color: txtColor }}>
                                                    {formatVND(profitNVL)}{' '}
                                                    <span className="text-[10px]">({profitMarginNVL}%{isGreen ? ' · Lãi tốt' : isRed ? ' · Lỗ' : ''})</span>
                                                </span>
                                                {/* Hover tooltip */}
                                                <div className="absolute bottom-full mb-2 right-0 w-52 hidden group-hover:block z-20 pointer-events-none">
                                                    <div className="bg-gray-900 text-white shadow-2xl" style={{ borderRadius: '10px', padding: '10px 12px' }}>
                                                        <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-2">Nếu tính thêm Phí Cố Định</p>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                <span className="text-[11px] text-gray-300">Giá bán</span>
                                                                <span className="text-[11px] font-black text-white">{formatVND(sellingPrice)}</span>
                                                            </div>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                <span className="text-[11px] text-gray-300">− NVL</span>
                                                                <span className="text-[11px] font-black text-red-400">− {formatVND(totalCostForSize)}</span>
                                                            </div>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                <span className="text-[11px] text-gray-300">− Phí cố định</span>
                                                                <span className="text-[11px] font-black text-red-400">− {formatVND(fixedCostPerCupBase)}</span>
                                                            </div>
                                                            <div style={{ borderTop: '1px solid #374151', paddingTop: '6px', display: 'flex', justifyContent: 'space-between' }}>
                                                                <span className="text-[11px] font-black text-white">= Lãi thực</span>
                                                                <span className="text-[12px] font-black" style={{ color: profitFull > 0 ? '#4ade80' : '#f87171' }}>
                                                                    {formatVND(profitFull)} ({fullMarginPct}%)
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div style={{ width: '8px', height: '8px', background: '#111827', transform: 'rotate(45deg)', marginLeft: 'auto', marginRight: '16px', marginTop: '-4px' }} />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}

                            </div>
                        ))}
                        </div>
                    </div>

                    {/* Add-ons — group box */}
                    <div style={{ marginTop: '12px', border: '1.5px solid #d1d5db', borderRadius: '12px', overflow: 'hidden' }}>
                        {/* Header bar */}
                        <div className="flex items-center justify-between bg-gray-600" style={{ paddingLeft: '20px', paddingRight: '14px', paddingTop: '10px', paddingBottom: '10px' }}>
                            <label className="admin-label !mb-0 !text-white !text-[13px] !tracking-wider">Add-ons</label>
                            <button onClick={addAddon} className="text-[11px] font-bold text-gray-700 bg-white px-3 py-1.5 hover:bg-gray-50 transition-all flex items-center gap-1 shadow-sm flex-shrink-0" style={{ borderRadius: '6px' }}>
                                <Plus size={14} /> Thêm
                            </button>
                        </div>
                        {/* Content */}
                        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {draft.addons.map((a, idx) => (
                            <div key={idx} className="bg-white border border-gray-200 shadow-sm flex flex-col" style={{ borderRadius: '10px', padding: '14px 20px', gap: '12px' }}>
                                <div className="flex items-center gap-2">
                                    {/* Shortcut Addon */}
                                    <div className="flex-shrink-0 flex items-center gap-1 bg-yellow-50 px-2 py-1 border border-yellow-200 shadow-sm" style={{ borderRadius: '6px' }} title="Mã phím tắt Addon">
                                        <span className="text-[10px] font-normal text-yellow-600">⌨️</span>
                                        <input placeholder="Mã" className="w-5 text-center text-sm font-normal outline-none bg-transparent text-yellow-700"
                                            value={a.addonCode || ''} onChange={e => updateAddon(idx, 'addonCode', e.target.value)} />
                                    </div>
                                    <input placeholder="Tên tùy chọn" className="flex-1 min-w-[80px] border-b-2 border-gray-100 text-[15px] font-normal outline-none bg-transparent focus:border-brand-600 transition-all"
                                        value={a.label} onChange={e => updateAddon(idx, 'label', e.target.value)} />
                                    {/* Giá add-on stepper */}
                                    <div className="flex items-center flex-shrink-0 border border-green-200 overflow-hidden" style={{ borderRadius: '6px', backgroundColor: 'rgb(240 253 244 / 0.5)' }}>
                                        <button
                                            onClick={() => updateAddon(idx, 'price', Math.max(0, (parseFloat(a.price)||0) - 1))}
                                            className="text-green-600 hover:bg-green-100 active:bg-green-200 transition-colors font-black text-sm flex-shrink-0" style={{ padding: '8px 14px', minWidth: '36px', textAlign: 'center' }}
                                        >−</button>
                                        <div className="flex items-baseline gap-0 px-1">
                                            <input
                                                type="number"
                                                value={a.price}
                                                onChange={e => updateAddon(idx, 'price', e.target.value)}
                                                className="font-normal text-green-700 text-right outline-none bg-transparent text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                style={{ width: `${Math.max(1, String(a.price || '').length || 1)}ch` }}
                                            />
                                            <span className="text-[10px] text-green-500 font-normal">.000đ</span>
                                        </div>
                                        <button
                                            onClick={() => updateAddon(idx, 'price', (parseFloat(a.price)||0) + 1)}
                                            className="text-green-600 hover:bg-green-100 active:bg-green-200 transition-colors font-black text-sm flex-shrink-0" style={{ padding: '8px 14px', minWidth: '36px', textAlign: 'center' }}
                                        >+</button>
                                    </div>
                                    <div className="flex-shrink-0 flex items-center shadow-sm overflow-hidden" style={{ borderRadius: '6px' }}>
                                        <button disabled={idx === 0} onClick={() => moveAddon(idx, -1)} className="p-1.5 bg-gray-50 text-gray-400 hover:text-brand-500 hover:bg-brand-50 transition-all border-r border-gray-100 disabled:opacity-30" title="Chuyển lên">
                                            <ArrowUp size={16} />
                                        </button>
                                        <button disabled={idx === draft.addons.length - 1} onClick={() => moveAddon(idx, 1)} className="p-1.5 bg-gray-50 text-gray-400 hover:text-brand-500 hover:bg-brand-50 transition-all border-r border-gray-100 disabled:opacity-30" title="Chuyển xuống">
                                            <ArrowDown size={16} />
                                        </button>
                                        <button onClick={() => removeAddon(idx)} className="p-1.5 bg-red-50 text-red-500 hover:bg-red-100 transition-all" style={{ borderRadius: '0 6px 6px 0' }} title="Xóa tùy chọn">
                                            <X size={16} />
                                        </button>
                                    </div>
                                </div>

                                {/* Addon Recipe section */}
                                <div className="mt-3 space-y-1.5" style={{ borderLeft: '2px dashed #e5e7eb', paddingLeft: '12px' }}>
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] uppercase font-black tracking-widest text-brand-600 bg-brand-50 px-2 py-1" style={{ borderRadius: '4px' }}>Định lượng kèm Add-on</span>
                                        <button onClick={() => addAddonRecipe(idx)} className="text-[10px] font-black text-brand-600 hover:bg-brand-100 flex items-center gap-1 px-2 py-1 transition-all" style={{ borderRadius: '4px' }}>
                                            <Plus size={12} /> THÊM
                                        </button>
                                    </div>
                                    {(a.recipe || []).map((r, recipeIdx) => (
                                        <div key={recipeIdx} className="flex items-center gap-2 bg-white border border-brand-100 text-sm" style={{ borderRadius: '6px', padding: '6px 10px' }}>
                                            <select className="flex-1 min-w-0 bg-transparent font-normal outline-none text-gray-700 text-[13px]"
                                                value={r.ingredientId} onChange={e => updateAddonRecipe(idx, recipeIdx, 'ingredientId', e.target.value)}>
                                                <option value="">-- Chọn NL --</option>
                                                {inventory.map(inv => {
                                                    const stat = Array.isArray(inventoryStats) ? inventoryStats.find(s => s.id === inv.id) : null;
                                                    const avgCost = stat?.avgCost || inv.importPrice || 0;
                                                    const costStr = avgCost ? ` (${formatVND(avgCost)}/${inv.unit})` : '';
                                                    return <option key={inv.id} value={inv.id}>{inv.name}{costStr}</option>;
                                                })}
                                            </select>
                                            <input className="w-14 bg-gray-50 font-black text-brand-600 text-center outline-none border border-brand-100 text-[13px] flex-shrink-0" style={{ borderRadius: '4px', padding: '2px 4px' }}
                                                type="number" step="1" value={r.quantity} onChange={e => updateAddonRecipe(idx, recipeIdx, 'quantity', e.target.value)} />
                                            <span className="text-[11px] text-brand-500 font-black flex-shrink-0" style={{ minWidth: '20px' }}>{inventory.find(inv => inv.id === r.ingredientId)?.unit}</span>
                                            {(() => {
                                                const stat = Array.isArray(inventoryStats) ? inventoryStats.find(s => s.id === r.ingredientId) : null;
                                                const invVal = inventory.find(i => i.id === r.ingredientId);
                                                const avgCost = stat?.avgCost || invVal?.importPrice || 0;
                                                const cost = avgCost * parseFloat(r.quantity || 0);
                                                return cost > 0 ? (
                                                    <span className="text-[11px] font-black text-gray-400 flex-shrink-0">
                                                        ~{formatVND(cost)}
                                                    </span>
                                                ) : null;
                                            })()}
                                            <button onClick={() => removeAddonRecipe(idx, recipeIdx)} className="text-gray-300 hover:text-red-500 flex-shrink-0"><X size={14} /></button>
                                        </div>
                                    ))}
                                    {(!a.recipe || a.recipe.length === 0) && (
                                        <p className="text-[11px] text-gray-400 italic">Chưa có nguyên liệu đi kèm</p>
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
                                            <div className="flex justify-between items-center bg-gray-50/50 px-2 py-1.5 border border-gray-100 mt-1" style={{ borderRadius: '6px' }}>
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
                            <p className="text-[11px] text-gray-400 font-bold text-center py-3 bg-gray-50 border-2 border-dashed border-gray-100" style={{ borderRadius: '8px' }}>Chưa có tùy chọn nào</p>
                        )}
                        </div>
                    </div>

                    {/* Recipe Setup — group box */}
                    <div style={{ marginTop: '12px', border: '1.5px solid #d1d5db', borderRadius: '12px', overflow: 'hidden' }}>
                        {/* Header bar */}
                        <div className="flex items-center justify-between bg-gray-600" style={{ paddingLeft: '20px', paddingRight: '14px', paddingTop: '10px', paddingBottom: '10px' }}>
                            <label className="admin-label !mb-0 !text-white !text-[13px] !tracking-wider">Nguyên liệu</label>
                            <button onClick={addRecipe} className="text-[11px] font-bold text-gray-700 bg-white px-3 py-1.5 hover:bg-gray-50 transition-all flex items-center gap-1 shadow-sm flex-shrink-0" style={{ borderRadius: '6px' }}>
                                <Plus size={14} /> Thêm
                            </button>
                        </div>
                        {/* Content */}
                        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {draft.recipe.map((r, idx) => (
                            <div key={idx} className="bg-white border border-gray-200 shadow-sm flex flex-wrap items-center gap-3" style={{ borderRadius: '8px', padding: '12px 20px' }}>
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
                                <div className="flex items-center gap-1 flex-shrink-0 bg-brand-50/50 px-2 py-1 border border-brand-100" style={{ borderRadius: '6px' }}>
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
                            <p className="text-xs text-gray-300 font-bold text-center py-4 bg-gray-50 border-2 border-dashed border-gray-100" style={{ borderRadius: '8px' }}>Chưa thiết lập định lượng</p>
                        )}
                        </div>
                    </div>

                    {/* Preparation Instructions */}
                    <div className="space-y-1" style={{ marginTop: '4px' }}>
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
                                            <div key={val} className="flex items-center justify-between group px-2 py-1.5 hover:bg-gray-50 transition-colors">
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
                                            <div key={val} className="flex items-center justify-between group px-2 py-1.5 hover:bg-gray-50 transition-colors">
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
                </div>
            </div>{/* end scrollable content */}
        </motion.div>{/* end side drawer */}

            {/* Cost Explanation Modal — redesigned */}
            {showCostExplanation && createPortal(
                <div className="fixed inset-0 z-[99999] bg-slate-900/70 backdrop-blur-sm flex justify-center items-end sm:items-center p-0 sm:p-4"
                    onClick={e => e.stopPropagation()}
                >
                    <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}
                        className="bg-white w-full sm:max-w-sm shadow-2xl relative overflow-hidden"
                        style={{ borderRadius: '20px 20px 0 0', maxHeight: '92vh', overflowY: 'auto' }}>

                        {/* Header */}
                        <div className="sticky top-0 z-10 bg-amber-500 flex items-center justify-between" style={{ padding: '18px 20px 16px' }}>
                            <div className="flex items-center gap-2">
                                <Info size={20} className="text-white" />
                                <h3 className="text-[15px] font-black text-white uppercase tracking-wide">Giải thích Phí Cố Định</h3>
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); setShowCostExplanation(false); }} className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors">
                                <X size={16} />
                            </button>
                        </div>

                        <div style={{ padding: '20px' }} className="space-y-4">

                            {/* Giải thích khái niệm */}
                            <div className="bg-amber-50 border border-amber-100 space-y-2 text-[13px] text-amber-900" style={{ borderRadius: '10px', padding: '14px 16px' }}>
                                <p className="font-bold leading-relaxed">Ngoài tiền NVL, quán phải gánh các khoản <strong>chi phí cố định</strong> dù bán ít hay nhiều:</p>
                                <div className="grid grid-cols-2 gap-1.5">
                                    {[
                                        { icon: '🏠', label: 'Mặt bằng' },
                                        { icon: '⚡', label: 'Điện / Nước' },
                                        { icon: '👤', label: 'Lương cứng' },
                                        { icon: '🔧', label: 'Khấu hao máy móc' },
                                    ].map(({ icon, label }) => (
                                        <div key={label} className="flex items-center gap-1.5 bg-amber-100/60 px-2 py-1.5" style={{ borderRadius: '6px' }}>
                                            <span className="text-[14px]">{icon}</span>
                                            <span className="text-[11px] font-black text-amber-800">{label}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Breakdown khấu hao máy móc */}
                            {fixedCosts.machines > 0 && (() => {
                                const depMonths = fixedCosts.machineDepreciationMonths || 36;
                                const totalMachines = parseFloat(fixedCosts.machines) * 1000;
                                const monthlyMachineAmort = totalMachines / depMonths;
                                return (
                                    <div className="border border-orange-200 bg-orange-50/40" style={{ borderRadius: '10px', padding: '14px 16px' }}>
                                        <p className="text-[10px] font-black text-orange-600 uppercase tracking-widest mb-3">🔧 Khấu Hao Thiết Bị (Amortization)</p>
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center">
                                                <span className="text-[12px] text-gray-600 font-bold">Tổng đầu tư thiết bị</span>
                                                <span className="text-[13px] font-black text-orange-700">{formatVND(totalMachines / 1000)}</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-[12px] text-gray-600 font-bold">Thời gian khấu hao</span>
                                                <span className="text-[13px] font-black text-gray-700">{depMonths} tháng</span>
                                            </div>
                                            <div className="border-t border-orange-200 pt-2 flex justify-between items-center">
                                                <span className="text-[11px] font-black text-orange-700 uppercase">→ Mỗi tháng gánh</span>
                                                <span className="text-[15px] font-black text-orange-600">{formatVND(monthlyMachineAmort / 1000)}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Cách tính phân bổ */}
                            <div className="bg-gray-50 border border-gray-100 space-y-2" style={{ borderRadius: '10px', padding: '14px 16px' }}>
                                <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-3">Cách hệ thống phân bổ ra mỗi ly:</p>
                                {(() => {
                                    const depMonths = fixedCosts.machineDepreciationMonths || 36;
                                    const monthlyMachineAmort = (parseFloat(fixedCosts.machines) * 1000 || 0) / depMonths;
                                    const monthlyOther = (parseFloat(fixedCosts.rent) * 1000 || 0)
                                        + (parseFloat(fixedCosts.electricity) * 1000 || 0)
                                        + (parseFloat(fixedCosts.water) * 1000 || 0)
                                        + (parseFloat(fixedCosts.salaries) * 1000 || 0)
                                        + (parseFloat(fixedCosts.other) * 1000 || 0);
                                    const adjustedTotal = monthlyMachineAmort + monthlyOther;
                                    const projected = stats30Days?.projectedMonthlyItems || 1;
                                    const perCup = projected > 0 ? (adjustedTotal / 1000) / projected : 0;
                                    return (
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center bg-white border border-gray-100 shadow-sm" style={{ borderRadius: '8px', padding: '10px 12px' }}>
                                                <span className="text-[12px] font-bold text-gray-600">A. Tổng CF tháng (đã khấu hao)</span>
                                                <span className="text-[13px] font-black text-amber-600">{formatVND(adjustedTotal / 1000)}</span>
                                            </div>
                                            <div className="flex justify-between items-center bg-white border border-gray-100 shadow-sm" style={{ borderRadius: '8px', padding: '10px 12px' }}>
                                                <span className="text-[12px] font-bold text-gray-600">B. Lượng ly dự phóng</span>
                                                <span className="text-[13px] font-black text-brand-600">~{Math.round(projected)} ly/tháng</span>
                                            </div>
                                            <div className="flex justify-between items-center" style={{ borderRadius: '8px', padding: '12px', background: '#1e293b' }}>
                                                <span className="text-[11px] font-black text-slate-300 uppercase tracking-wide">Phí gánh / 1 ly (A ÷ B)</span>
                                                <span className="text-[18px] font-black text-amber-400">{formatVND(perCup)}</span>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>

                            {/* Lưu ý */}
                            <div className="flex gap-2 bg-brand-50 border border-brand-100" style={{ borderRadius: '10px', padding: '12px 14px' }}>
                                <span className="text-[16px] flex-shrink-0">💡</span>
                                <p className="text-[12px] text-brand-800 font-bold leading-relaxed">
                                    Chỉ khi bán <strong>CAO HƠN Giá Lập Đáy</strong> thì quán mới thực sự sinh lời sau khi trừ cả NVL lẫn chi phí vận hành!
                                </p>
                            </div>

                            <button onClick={(e) => { e.stopPropagation(); setShowCostExplanation(false); }}
                                className="w-full bg-slate-900 text-white font-black uppercase tracking-widest hover:bg-amber-600 active:scale-95 transition-all shadow-md"
                                style={{ borderRadius: '10px', padding: '14px', minHeight: '50px' }}>
                                Đã Hiểu Cách Tính ✓
                            </button>
                        </div>
                    </motion.div>
                </div>,
                document.body
            )}
        </motion.div>{/* end backdrop */}
        </>,
        document.body
    )}
    </>
);
};

// ── Staff Order Panel ──
// ── Staff Order Panel (POS) ──

export { InlineEditPanel, DEFAULT_SUGAR, DEFAULT_ICE };
