import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Coffee, Circle, X, ChevronRight, Plus } from 'lucide-react';
import { getImageUrl } from '../api';

const KIOSK_DEFAULT_SUGAR = ['100%', '50%', '0%'];
const KIOSK_DEFAULT_ICE = ['Bình thường', 'Ít đá', 'Không đá'];

const SharedCustomizationModal = ({
    isOpen,
    item,
    editItem,
    onClose,
    onAddToCart,
    formatVND
}) => {
    const [selectedSize, setSelectedSize] = useState(null);
    const [selectedSugar, setSelectedSugar] = useState('100%');
    const [selectedIce, setSelectedIce] = useState('Bình thường');
    const [selectedAddons, setSelectedAddons] = useState([]);
    const [itemCount, setItemCount] = useState(1);
    const [shortcutPrefix, setShortcutPrefix] = useState(null);
    const prefixTimeoutRef = React.useRef(null);

    useEffect(() => {
        if (isOpen && item) {
            setShortcutPrefix(null);
            if (editItem) {
                setItemCount(editItem.count || 1);
                setSelectedSize(editItem.size);
                setSelectedAddons(editItem.addons || []);
                setSelectedSugar(editItem.sugar || '100%');
                setSelectedIce(editItem.ice || 'Bình thường');
            } else {
                setItemCount(1);
                setSelectedSize(item.sizes?.[0] || null);
                setSelectedAddons([]);
                const sugars = item.sugarOptions?.length ? item.sugarOptions : KIOSK_DEFAULT_SUGAR;
                const ices = item.iceOptions?.length ? item.iceOptions : KIOSK_DEFAULT_ICE;
                setSelectedSugar(item.defaultSugar || sugars[0] || '100%');
                setSelectedIce(item.defaultIce || ices[0] || 'Bình thường');
            }
        }
    }, [isOpen, item, editItem]);

    const toggleAddon = (addon) => {
        setSelectedAddons(prev =>
            prev.find(a => a.label === addon.label)
                ? prev.filter(a => a.label !== addon.label)
                : [...prev, addon]
        );
    };

    const handleAddToCart = useCallback(() => {
        let finalPrice = parseFloat(item?.price || 0);
        if (selectedSize?.priceAdjust) finalPrice += selectedSize.priceAdjust;
        if (selectedAddons.length > 0) finalPrice += selectedAddons.reduce((s, a) => s + (a.price || 0), 0);

        const customizedItem = {
            item,
            size: selectedSize,
            sugar: selectedSugar,
            ice: selectedIce,
            addons: selectedAddons,
            count: itemCount,
            note: '',
            totalPrice: finalPrice
        };
        onAddToCart(customizedItem, !!editItem);
    }, [item, selectedSize, selectedSugar, selectedIce, selectedAddons, itemCount, editItem, onAddToCart]);

    // Keyboard shortcuts — MUST be before early return
    useEffect(() => {
        if (!isOpen || !item) return;

        const handleKeyDown = (e) => {
            if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

            // Map numpad keys bằng e.code để đảm bảo hoạt động ổn định trên mọi OS/Electron
            const numpadCodeMap = {
                'NumpadSubtract': '-', 'NumpadDivide': '/', 'NumpadMultiply': '*',
                'NumpadDecimal': '.', 'NumpadSeparator': '.',
                'Numpad0': '0', 'Numpad1': '1', 'Numpad2': '2', 'Numpad3': '3',
                'Numpad4': '4', 'Numpad5': '5', 'Numpad6': '6', 'Numpad7': '7',
                'Numpad8': '8', 'Numpad9': '9',
            };
            const key = numpadCodeMap[e.code] || e.key;

            // Prefix triggers
            if (['-', '/', '*'].includes(key)) {
                e.preventDefault();
                setShortcutPrefix(key);
                if (prefixTimeoutRef.current) clearTimeout(prefixTimeoutRef.current);
                prefixTimeoutRef.current = setTimeout(() => { setShortcutPrefix(null); }, 3000);
                return;
            }

            // Size cycle
            if (key === '.') {
                if (item.sizes?.length > 1) {
                    setSelectedSize(prev => {
                        const currentIndex = item.sizes.findIndex(s => s.label === prev?.label);
                        const nextIndex = (currentIndex + 1) % item.sizes.length;
                        return item.sizes[nextIndex];
                    });
                }
                setShortcutPrefix(null);
                return;
            }

            if (key === 'Enter') {
                e.preventDefault();
                handleAddToCart();
                return;
            }
            if (key === 'Escape') {
                onClose();
                return;
            }

            const num = parseInt(key, 10);
            if (!isNaN(num) && num >= 0 && num <= 9) {
                if (shortcutPrefix === '*') {
                    if (num >= 1 && num <= 9) setItemCount(num);
                    setShortcutPrefix(null);
                } else if (shortcutPrefix === '-') {
                    const sugarMap = { 0: '0%', 5: '50%', 1: '100%' };
                    if (sugarMap[num]) setSelectedSugar(sugarMap[num]);
                    setShortcutPrefix(null);
                } else if (shortcutPrefix === '/') {
                    const iceMap = { 0: 'Không đá', 5: 'Ít đá', 1: 'Bình thường', 9: 'Nhiều đá' };
                    if (iceMap[num]) setSelectedIce(iceMap[num]);
                    setShortcutPrefix(null);
                } else {
                    // No prefix -> Toppings
                    if (num >= 1 && num <= 9) {
                        const addon = item.addons?.[num - 1];
                        if (addon) toggleAddon(addon);
                    }
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, item, selectedAddons, selectedSize, selectedSugar, selectedIce, itemCount, shortcutPrefix, handleAddToCart, onClose]);

    if (!isOpen || !item) return null;

    const currentBasePrice = parseFloat(item.price) + (selectedSize?.priceAdjust || 0) + selectedAddons.reduce((s, a) => s + (a.price || 0), 0);
    const totalWithCount = currentBasePrice * itemCount;
    const displayPrice = formatVND ? formatVND(totalWithCount) : `${totalWithCount}.000đ`;

    const sugarOptionsMap = [
        { label: '0%', heightClass: 'h-4' },
        { label: '30%', heightClass: 'h-10' },
        { label: '50%', heightClass: 'h-16' },
        { label: '100%', heightClass: 'h-24' },
        { label: '120%', heightClass: 'h-28' }
    ];

    const iceOptionsMap = [
        { label: 'Không đá', mappedDisplay: 'None', heightClass: 'h-6' },
        { label: 'Ít đá', mappedDisplay: 'Less', heightClass: 'h-14' },
        { label: 'Bình thường', mappedDisplay: 'Normal', heightClass: 'h-20' },
        { label: 'Nhiều đá', mappedDisplay: 'Extra', heightClass: 'h-28' }
    ];

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm" style={{ padding: '24px' }}>
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0"
                />
                
                <motion.div 
                    initial={{ y: 50, opacity: 0, scale: 0.95 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    exit={{ y: 50, opacity: 0, scale: 0.95 }}
                    className="bg-white w-full max-w-[850px] overflow-hidden shadow-2xl flex flex-col md:flex-row h-auto md:h-[680px] relative z-10"
                    style={{ borderRadius: 'var(--radius-modal)', maxHeight: '100%' }}
                >
                    {/* Left Section: Visual Preview */}
                    <div className="md:w-[320px] bg-[#222222] text-white flex flex-col relative overflow-hidden shrink-0 shadow-lg z-20">
                        {/* Background Image (Absolute, full bleed) */}
                        <div className="absolute inset-0 z-0 opacity-40">
                            {item.image ? (
                                <img className="w-full h-full object-cover scale-105" src={getImageUrl(item.image)} alt={item.name} />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                    <Coffee size={120} className="opacity-20" />
                                </div>
                            )}
                        </div>

                        {/* Bottom Gradient Overlay (Absolute, full bleed) */}
                        <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-[#222222] via-[#222222]/60 to-transparent pointer-events-none z-0" />

                        {/* Padded Content Wrapper */}
                        <div className="relative z-10 flex flex-col h-full" style={{ padding: 'var(--spacing-modal-body)' }}>
                            <button onClick={onClose} className="self-start rounded-full bg-black/40 hover:bg-black/60 transition-colors mb-6 cursor-pointer z-20 text-white p-2">
                                <X size={20} className="w-5 h-5 drop-shadow-md" />
                            </button>
                            <div className="relative z-10 mt-auto">
                                <span className="text-[12px] tracking-widest font-black text-[#E1A63F] block mb-1 uppercase drop-shadow-md">{item.category || 'MENU ITEM'}</span>
                                <h2 className="text-[34px] font-black mb-2 leading-tight drop-shadow-lg tracking-tight w-full">{item.name}</h2>
                                <p className="text-[#DFDFDF] text-[15px] font-bold leading-relaxed drop-shadow-md w-[95%]">{item.description}</p>
                            </div>
                        </div>
                    </div>

                    {/* Right Section: Interactive Controls & Footer (Clean Parent Padding Model) */}
                    <div className="flex-1 bg-white flex flex-col overflow-hidden min-h-0 min-w-0" style={{ padding: 'var(--spacing-modal-p)' }}>
                        
                        {/* Scrollable Content Area (No inner padding needed, constrained by parent) */}
                        <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col gap-8 pb-4 min-h-0">
                            
                            {/* Size Selection */}
                            {item.sizes?.length > 0 && (
                                <section>
                                    <label className="text-[11px] font-black tracking-[0.16em] text-[#6B6B6B] mb-4 block uppercase">SELECT SIZE</label>
                                    <div className="flex flex-wrap gap-4">
                                        {item.sizes.map(s => (
                                            <button 
                                                key={s.label}
                                                onClick={() => setSelectedSize(s)}
                                                className={`w-[72px] h-[72px] rounded-[18px] font-black text-[22px] transition-colors flex items-center justify-center relative shadow-sm
                                                    ${selectedSize?.label === s.label 
                                                        ? 'bg-white border-[2.5px] border-[#C18218] text-[#C18218]' 
                                                        : 'bg-white border-[1.5px] border-[#F0F0F0] text-[#1b1b1d] hover:border-gray-300'}`}
                                            >
                                                <span>{s.label}</span>
                                                {s.priceAdjust !== 0 && (
                                                    <span className="absolute -bottom-5 text-[10px] font-bold text-gray-400 whitespace-nowrap">
                                                        {s.priceAdjust > 0 ? `+${s.priceAdjust}K` : `${s.priceAdjust}K`}
                                                    </span>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </section>
                            )}

                            {/* Customization Grids */}
                            <div className="flex gap-8 lg:gap-[40px]">
                                {/* Sugar Equalizer */}
                                {item.sugarOptions?.length > 0 && (
                                    <section className="flex-1">
                                        <label className="text-[11px] font-black tracking-[0.16em] text-[#6B6B6B] mb-4 block uppercase">Sugar Level</label>
                                        <div className="flex items-end justify-between h-[80px]">
                                            {[
                                                { label: '0%', height: 'h-[10px]' },
                                                { label: '30%', height: 'h-[24px]' },
                                                { label: '50%', height: 'h-[48px]' },
                                                { label: '100%', height: 'h-[64px]' },
                                                { label: '120%', height: 'h-[80px]' }
                                            ].map(opt => {
                                                const isActive = selectedSugar === opt.label;
                                                return (
                                                    <div key={opt.label} onClick={() => setSelectedSugar(opt.label)} className="flex flex-col items-center gap-2 cursor-pointer h-full justify-end flex-1">
                                                        <div className={`w-[28px] rounded-t-[4px] transition-colors
                                                            ${isActive 
                                                                ? 'bg-[#C18218]' 
                                                                : 'bg-[#FCE5CD] hover:bg-[#F2D5B1]'} 
                                                            ${opt.height}`}
                                                        ></div>
                                                        <span className={`text-[10px] font-black uppercase transition-colors ${isActive ? 'text-[#C18218]' : 'text-[#888888]'}`}>
                                                            {opt.label}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </section>
                                )}

                                {/* Ice Equalizer */}
                                {item.iceOptions?.length > 0 && (
                                    <section className="flex-1">
                                        <label className="text-[11px] font-black tracking-[0.16em] text-[#6B6B6B] mb-4 block uppercase">Ice Level</label>
                                        <div className="flex items-end justify-between h-[80px]">
                                            {[
                                                { label: 'Không đá', mappedDisplay: 'None', height: 'h-[16px]' },
                                                { label: 'Ít đá', mappedDisplay: 'Less', height: 'h-[36px]' },
                                                { label: 'Bình thường', mappedDisplay: 'Normal', height: 'h-[60px]' },
                                                { label: 'Nhiều đá', mappedDisplay: 'Extra', height: 'h-[80px]' }
                                            ].map(opt => {
                                                const isActive = selectedIce === opt.label;
                                                return (
                                                    <div key={opt.label} onClick={() => setSelectedIce(opt.label)} className="flex flex-col items-center gap-2 cursor-pointer h-full justify-end flex-1">
                                                        <div className={`w-[28px] rounded-t-[4px] transition-colors
                                                            ${isActive 
                                                                ? 'bg-[#4DBBFF]' 
                                                                : 'bg-[#D6EFFF] hover:bg-[#B5E4FF]'} 
                                                            ${opt.height}`}
                                                        ></div>
                                                        <span className={`text-[10px] font-black uppercase transition-colors ${isActive ? 'text-[#006591]' : 'text-[#888888]'}`}>
                                                            {opt.mappedDisplay}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </section>
                                )}
                            </div>

                            {/* Toppings Selection */}
                            {item.addons?.length > 0 && (
                                <section>
                                    {/* Section header with keyboard shortcut legend */}
                                    <div className="flex items-center justify-between mb-4">
                                        <label className="text-[11px] font-black tracking-[0.16em] text-[#6B6B6B] uppercase">TOPPINGS</label>
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            <span className={`text-[9px] font-black px-2 py-0.5 rounded shadow-sm transition-colors border
                                                ${shortcutPrefix ? 'bg-[#C18218] text-white border-[#C18218]' : 'bg-[#F5F5F7] text-[#888] border-[#E0E0E0]'}`}>
                                                {shortcutPrefix === '-' ? 'Đường: Chờ 0, 1, 5' : 
                                                 shortcutPrefix === '/' ? 'Đá: Chờ 0, 1, 5, 9' : 
                                                 shortcutPrefix === '*' ? 'SL: Chờ số 1-9' : 
                                                 'Phím: Sẵn sàng'}
                                            </span>
                                            <span className="mx-1 text-[#E0E0E0] text-xs hidden sm:inline">|</span>
                                            <div className="hidden sm:flex gap-1.5">
                                                {item.addons.slice(0, 9).map((_, idx) => (
                                                    <span key={idx} className="w-5 h-5 rounded-full bg-[#F5F5F7] border border-[#E0E0E0] text-[9px] font-black text-[#888] flex items-center justify-center shadow-sm">
                                                        {idx + 1}
                                                    </span>
                                                ))}
                                            </div>
                                            <span className="mx-1 text-[#E0E0E0] text-xs">|</span>
                                            <span className="text-[9px] font-black text-[#AAA] bg-[#F5F5F7] border border-[#E0E0E0] px-1.5 py-0.5 rounded shadow-sm">↵ LƯU</span>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-4">
                                        {item.addons.map((addon, idx) => {
                                            const isActive = selectedAddons.find(a => a.label === addon.label);
                                            const shortcut = idx < 9 ? String(idx + 1) : null;
                                            return (
                                                <button 
                                                    key={addon.label} 
                                                    onClick={() => toggleAddon(addon)}
                                                    className={`relative flex items-center gap-3 px-5 py-3 rounded-xl transition-all shadow-sm
                                                        ${isActive 
                                                            ? 'bg-[#FFF6E9] border-2 border-[#C18218]' 
                                                            : 'bg-white border border-[#F0F0F0] text-[#1b1b1d] hover:border-[#C18218]'}`}
                                                >
                                                    {/* Keyboard shortcut badge */}
                                                    {shortcut && (
                                                        <span className={`absolute -top-2 -left-2 w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center shadow-sm border
                                                            ${isActive 
                                                                ? 'bg-[#C18218] text-white border-[#C18218]' 
                                                                : 'bg-white text-[#888] border-[#E0E0E0]'}`}>
                                                            {shortcut}
                                                        </span>
                                                    )}
                                                    {isActive 
                                                        ? <CheckCircle2 size={20} className="text-[#835500] fill-[#C18218] shrink-0" /> 
                                                        : <Circle size={20} className="text-[#835500] shrink-0" />
                                                    }
                                                    <span className={`text-[15px] font-black ${isActive ? 'text-[#1b1b1d]' : 'text-[#1b1b1d]'}`}>
                                                        {addon.label}
                                                    </span>
                                                    {addon.price > 0 && (
                                                        <span className={`font-bold text-[13px] ${isActive ? 'text-[#845E1B]' : 'text-[#888888]'}`}>
                                                            +{addon.price}K
                                                        </span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </section>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="mt-4 pt-4 flex items-center justify-between shrink-0 border-t border-[#F0F0F0]">
                            <div className="flex flex-col flex-1 min-w-0 pr-4">
                                <span className="text-[10px] sm:text-[11px] font-black tracking-[0.15em] text-[#888888] uppercase mb-1">Total Adjustment</span>
                                <span className="text-[32px] sm:text-[36px] font-black text-[#1b1b1d] leading-none tracking-tighter block -ml-0.5">{displayPrice}</span>
                            </div>
                            <div className="flex shrink-0 items-center">
                                {itemCount > 1 && (
                                    <div className="hidden sm:flex flex-col items-center justify-center bg-[#F5F5F7] px-4 mr-3 h-[56px] border border-[#E0E0E0]" style={{ borderRadius: '16px' }}>
                                        <span className="text-[10px] font-black text-[#888] tracking-wider uppercase">Số lượng</span>
                                        <span className="text-[20px] font-black text-[#1b1b1d] leading-none">x{itemCount}</span>
                                    </div>
                                )}
                                <button 
                                    onClick={handleAddToCart}
                                    className="bg-[#C18218] font-black flex items-center justify-center hover:opacity-90 transition-opacity shadow-lg shadow-[#C18218]/20 shrink-0 w-[56px] h-[56px] rounded-full sm:w-auto sm:px-6 sm:rounded-[16px]"
                                >
                                    {/* Desktop text */}
                                    <span className="hidden sm:inline text-[16px] text-white tracking-wide mr-2">
                                        {editItem ? 'UPDATE ITEM' : 'THÊM VÀO GIỎ'}
                                    </span>
                                    {/* Mobile big Plus icon */}
                                    <Plus size={32} strokeWidth={2.5} className="text-white sm:hidden" />
                                    
                                    {/* Desktop decorative Plus circle */}
                                    <div className="hidden sm:flex bg-white/20 w-7 h-7 rounded-full items-center justify-center">
                                        <Plus size={18} strokeWidth={3} className="text-white" />
                                    </div>
                                </button>
                            </div>
                        </div>

                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default SharedCustomizationModal;
