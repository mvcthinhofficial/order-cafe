import React, { useState, useEffect, useCallback } from 'react';
import { Check, X, Plus, Minus, ShoppingBag } from 'lucide-react';

const KIOSK_DEFAULT_SUGAR = ['0%', '30%', '50%', '100%'];
const KIOSK_DEFAULT_ICE = ['Không đá', 'Ít đá', 'Bình thường', 'Nhiều đá'];

// Style dùng chung cho tất cả button trong HUD — loại bỏ 300ms delay trên iOS/iPadOS
const BTN_TOUCH_STYLE = { touchAction: 'manipulation', WebkitUserSelect: 'none', userSelect: 'none' };

const HUDItemCard = ({
    item,
    isActive,
    onActivate,
    onClose,
    onQuickAdd,
    formatVND,
    getImageUrl,
    categoryStyles
}) => {
    const [selectedSize, setSelectedSize] = useState(null);
    const [selectedSugar, setSelectedSugar] = useState('');
    const [selectedIce, setSelectedIce] = useState('');
    const [selectedAddons, setSelectedAddons] = useState([]);
    const [quantity, setQuantity] = useState(1);       // Fix Q1: state số lượng, reset sau mỗi add
    const [confirmed, setConfirmed] = useState(false); // Fix Q3: flash xanh lá sau confirm

    useEffect(() => {
        if (isActive && item) {
            setSelectedSize(item.sizes?.[0] || null);
            setSelectedAddons([]);
            setQuantity(1); // Reset số lượng mỗi khi mở HUD
            setConfirmed(false);
            const sugars = item.sugarOptions?.length ? item.sugarOptions : KIOSK_DEFAULT_SUGAR;
            const ices = item.iceOptions?.length ? item.iceOptions : KIOSK_DEFAULT_ICE;
            // Ưu tiên defaultSugar/defaultIce trên item; fallback về phần tử cuối (cao nhất)
            const defaultSugar = item.defaultSugar && sugars.includes(item.defaultSugar)
                ? item.defaultSugar
                : (sugars[sugars.length - 1] || '100%');
            const defaultIce = item.defaultIce && ices.includes(item.defaultIce)
                ? item.defaultIce
                : (ices.find(i => i === 'Bình thường') || ices[Math.floor(ices.length / 2)] || ices[0] || 'Bình thường');
            setSelectedSugar(defaultSugar);
            setSelectedIce(defaultIce);
        }
    }, [isActive, item]);

    const toggleAddon = (addon) => {
        setSelectedAddons(prev =>
            prev.find(a => a.label === addon.label)
                ? prev.filter(a => a.label !== addon.label)
                : [...prev, addon]
        );
    };

    // Fix Q3: Flash xanh lá → đóng HUD → giỏ hàng KHÔNG tự mở
    // Staff tiếp tục chọn, vuốt phải để mở cart
    const handleConfirm = useCallback((e) => {
        e.stopPropagation();
        if (confirmed) return; // chặn double-tap trong thời gian flash
        let finalPrice = parseFloat(item?.price || 0);
        if (selectedSize?.priceAdjust) finalPrice += selectedSize.priceAdjust;
        if (selectedAddons.length > 0) finalPrice += selectedAddons.reduce((s, a) => s + (a.price || 0), 0);

        const customizedItem = {
            item,
            size: selectedSize,
            sugar: selectedSugar,
            ice: selectedIce,
            addons: selectedAddons,
            count: quantity, // Q1: dùng state quantity
            note: '',
            totalPrice: finalPrice
        };

        setConfirmed(true); // Trigger flash xanh
        setTimeout(() => {
            onQuickAdd(customizedItem);
            onClose(); // Đóng HUD → quay về lưới (cart không tự mở)
            setConfirmed(false);
        }, 280);
    }, [confirmed, item, selectedSize, selectedSugar, selectedIce, selectedAddons, quantity, onQuickAdd, onClose]);

    const isSoldOut = item.isSoldOut;

    // ===== MUSCLE MEMORY COLOR SYSTEM =====
    // Chưa chọn = nền trắng + chữ màu | Đã chọn = nền ĐẶC + chữ TRẮNG
    // Ánh xạ trực giác: đường ngọt → ấm/nóng, đá lạnh → xanh đậm dần

    // ĐƯỜNG
    const sugarColorMap = {
        '0%':   { solid: '#6B7280', label: '#6B7280' },
        '30%':  { solid: '#F59E0B', label: '#D97706' },
        '50%':  { solid: '#F97316', label: '#EA580C' },
        '70%':  { solid: '#EF4444', label: '#DC2626' },
        '100%': { solid: '#DC2626', label: '#B91C1C' },
        '120%': { solid: '#991B1B', label: '#7F1D1D' },
    };
    const getSugarColor = (val) => {
        const key = Object.keys(sugarColorMap).find(k => k === val);
        if (key) return sugarColorMap[key];
        const n = parseInt(val) || 0;
        if (n === 0) return sugarColorMap['0%'];
        if (n <= 30) return sugarColorMap['30%'];
        if (n <= 50) return sugarColorMap['50%'];
        if (n <= 70) return sugarColorMap['70%'];
        if (n <= 100) return sugarColorMap['100%'];
        return sugarColorMap['120%'];
    };

    // ĐÁ
    const iceColorMap = {
        'Không đá':   { solid: '#EF4444', label: '#DC2626' },
        'Ít đá':      { solid: '#60A5FA', label: '#3B82F6' },
        'Bình thường':{ solid: '#3B82F6', label: '#2563EB' },
        'Nhiều đá':   { solid: '#1D4ED8', label: '#1E40AF' },
    };
    const getIceColor = (val) => iceColorMap[val] || { solid: '#3B82F6', label: '#2563EB' };

    // SIZE — mỗi size 1 màu riêng biệt dễ nhớ
    const sizeColorPalette = [
        { solid: '#10B981', label: '#059669' }, // S: xanh lá
        { solid: '#3B82F6', label: '#2563EB' }, // M: xanh dương
        { solid: '#8B5CF6', label: '#7C3AED' }, // L: tím
        { solid: '#F59E0B', label: '#D97706' }, // XL: vàng cam
    ];

    // ADDON
    const addonColorPalette = [
        { solid: '#EC4899', label: '#DB2777' },
        { solid: '#8B5CF6', label: '#7C3AED' },
        { solid: '#14B8A6', label: '#0D9488' },
        { solid: '#F97316', label: '#EA580C' },
    ];

    const sortedSugars = (item.sugarOptions?.length ? [...item.sugarOptions] : KIOSK_DEFAULT_SUGAR)
        .sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0));

    const iceWeights = { 'Không đá': 0, 'Ít đá': 1, 'Bình thường': 2, 'Nhiều đá': 3 };
    const sortedIces = (item.iceOptions?.length ? [...item.iceOptions] : KIOSK_DEFAULT_ICE)
        .sort((a, b) => (iceWeights[a] ?? 99) - (iceWeights[b] ?? 99));

    // Fix 7: Dynamic font-size cho label sugar/ice theo số option — ít option = to chữ hơn
    const sugarFontSize = sortedSugars.length <= 2 ? '20px' : sortedSugars.length <= 3 ? '17px' : '13px';
    const iceFontSize   = sortedIces.length   <= 2 ? '20px' : sortedIces.length   <= 3 ? '17px' : '14px';

    // Tính giá hiện tại (phản chiếu realtime khi chọn size/addon)
    const currentPrice = parseFloat(item?.price || 0)
        + (selectedSize?.priceAdjust || 0)
        + selectedAddons.reduce((s, a) => s + (a.price || 0), 0);

    return (
        <>
            {/* THẺ NHỎ TRONG LƯỚI */}
            <div
                onClick={() => isSoldOut ? null : onActivate(item)}
                className={`pos-item-card group relative ${isSoldOut ? 'grayscale cursor-not-allowed' : 'cursor-pointer'}`}
                style={{ borderRadius: '0', border: '1px solid #E5E7EB', touchAction: 'manipulation' }}
            >
                {item.image && (
                    <img
                        src={getImageUrl(item.image)}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        alt={item.name}
                    />
                )}
                {isSoldOut && (
                    <div className="absolute inset-0 bg-black/10 z-30 flex flex-col items-center justify-center">
                        <span className="bg-red-600/90 text-white shadow-xl font-black text-sm uppercase tracking-widest border border-red-800" style={{ padding: '8px 16px' }}>HẾT MÓN</span>
                    </div>
                )}
                <div className="absolute top-2 right-2 z-20">
                    <span className="bg-[#1A1A1A] text-[#FFD60A] font-mono text-[14px] font-black shadow-md px-2 py-1">
                        {Math.round(parseFloat(item.price))}K
                    </span>
                </div>
                <div className="absolute top-2 left-2 z-10">
                    <span className={`${categoryStyles?.[item.category] || 'bg-black/60'} text-white text-[10px] font-black uppercase tracking-widest shadow-lg block px-2 py-1`}>
                        {item.category}
                    </span>
                </div>
                <div className="absolute bottom-0 left-0 right-0 flex justify-center items-center z-10" style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.95)', borderTop: '1px solid #E5E7EB' }}>
                    <p className="font-black text-[13px] text-gray-900 truncate uppercase text-center w-full">{item.name}</p>
                </div>
            </div>

            {/* HUD OVERLAY — hiện tức thì khi isActive, không animation */}
            {isActive && (
                <div
                    className="fixed inset-0 z-[900] flex items-center justify-center bg-black/40"
                    onClick={onClose}
                    style={{ touchAction: 'manipulation', userSelect: 'none', WebkitUserSelect: 'none' }}
                >
                    <div
                        className="relative bg-white flex flex-col shadow-2xl"
                        style={{
                            width: 'min(96vw, 620px)',
                            height: 'min(92vh, 720px)',
                            border: '2px solid #111',
                            userSelect: 'none',
                            WebkitUserSelect: 'none',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                            {/* HÀNG TRÊN: ĐƯỜNG */}
                            {sortedSugars.length > 0 && (
                                <div className="flex w-full h-[15%] sm:h-[12%] border-b-2 border-black">
                                    {sortedSugars.map((s) => {
                                        const isSel = selectedSugar === s;
                                        const color = getSugarColor(s);
                                        return (
                                            <button
                                                key={s}
                                                onClick={() => setSelectedSugar(s)}
                                                className="flex-1 h-full border-r-2 border-black last:border-r-0 flex items-center justify-center transition-colors duration-100 active:scale-95"
                                                style={{
                                                    backgroundColor: isSel ? color.solid : '#FFFFFF',
                                                    color: isSel ? '#FFFFFF' : color.label,
                                                    borderColor: isSel ? color.solid : '#111111',
                                                    ...BTN_TOUCH_STYLE,
                                                }}
                                            >
                                                <span className="font-black uppercase tracking-wider flex flex-col items-center gap-0.5" style={{ fontSize: sugarFontSize }}>
                                                    <span>{s}</span>
                                                    {isSel && <Check size={14} strokeWidth={4} className="text-current" />}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {/* KHUNG GIỮA: SIZE — IMAGE — ADDON */}
                            <div className="flex-1 flex w-full overflow-hidden bg-white">

                                {/* Cột Trái: Size — Fix 4: tăng lên 96px/110px */}
                                <div className="w-[96px] sm:w-[110px] h-full flex flex-col border-r-2 border-black shrink-0">
                                    {item.sizes?.map((sz, idx) => {
                                        const isSel = selectedSize?.label === sz.label;
                                        const color = sizeColorPalette[Math.min(idx, sizeColorPalette.length - 1)];
                                        return (
                                            <button
                                                key={sz.label}
                                                onClick={() => setSelectedSize(sz)}
                                                className="flex-1 w-full border-b-2 border-black last:border-b-0 flex flex-col items-center justify-center transition-colors duration-100 active:scale-95"
                                                style={{
                                                    backgroundColor: isSel ? color.solid : '#FFFFFF',
                                                    color: isSel ? '#FFFFFF' : color.label,
                                                    borderColor: isSel ? color.solid : '#111111',
                                                    ...BTN_TOUCH_STYLE,
                                                }}
                                            >
                                                <span className="font-black text-[28px] sm:text-[36px] leading-none">{sz.label}</span>
                                                {sz.priceAdjust !== 0 && (
                                                    <span className="text-[10px] sm:text-[12px] font-bold mt-0.5 opacity-80">+{sz.priceAdjust}K</span>
                                                )}
                                                {isSel && <Check size={14} strokeWidth={4} className="text-current mt-1" />}
                                            </button>
                                        );
                                    })}
                                    {(!item.sizes || item.sizes.length === 0) && (
                                        <div className="flex-1 w-full flex items-center justify-center p-2 text-center text-gray-300 text-[10px] font-bold uppercase">Mặc định</div>
                                    )}
                                </div>

                                {/* Tâm Điểm: Hình ảnh + Confirm Button + Quantity */}
                                {/* Fix Q3: onClick → flash xanh 280ms → đóng HUD (không mở cart) */}
                                <div
                                    className="flex-1 h-full relative bg-black"
                                    style={{ cursor: confirmed ? 'default' : 'pointer', ...BTN_TOUCH_STYLE }}
                                    onClick={handleConfirm}
                                >
                                    {item.image ? (
                                        <img
                                            src={getImageUrl(item.image)}
                                            className="w-full h-full object-cover opacity-60"
                                            alt={item.name}
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-gray-900">
                                            <span className="font-black text-white/20 text-[48px] uppercase tracking-widest select-none">{item.name?.charAt(0)}</span>
                                        </div>
                                    )}

                                    {/* Overlay với confirm button — đổi sang xanh khi confirmed */}
                                    <div className="absolute inset-0 transition-colors duration-150 flex flex-col items-center justify-center"
                                        style={{ backgroundColor: confirmed ? 'rgba(22,163,74,0.5)' : 'rgba(0,0,0,0.2)' }}>
                                        <div className="w-20 h-20 sm:w-28 sm:h-28 border-[5px] border-white flex flex-col items-center justify-center shadow-2xl transition-all duration-150 active:scale-95"
                                            style={{ backgroundColor: confirmed ? '#16A34A' : 'rgba(234,88,12,0.9)' }}>
                                            <Check size={56} className="text-white drop-shadow-md" strokeWidth={5} />
                                        </div>
                                        <div className="mt-4 sm:mt-6 bg-black/75 px-4 py-2 text-center border-t border-b border-white/20 w-full overflow-hidden">
                                            <p className="font-black text-[16px] sm:text-[20px] text-white tracking-widest uppercase truncate leading-none">
                                                {confirmed ? '✓ ĐÃ THÊM VÀO GIỎ' : item.name}
                                            </p>
                                            <p className="font-bold text-[14px] text-[#FFD60A] tracking-wider mt-1">
                                                {formatVND(currentPrice * quantity)}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Fix Q1: Bộ điều chỉnh số lượng — góc dưới phải, không che confirm */}
                                    <div
                                        className="absolute bottom-3 right-2 flex items-center gap-1 rounded-lg shadow-lg border border-white/20"
                                        style={{ background: 'rgba(0,0,0,0.75)', padding: '4px 6px' }}
                                        onClick={(e) => e.stopPropagation()} // không trigger confirmhandler
                                    >
                                        <button
                                            className="flex items-center justify-center text-white font-black transition-colors active:bg-white/20 rounded"
                                            style={{ width: 32, height: 32, ...BTN_TOUCH_STYLE }}
                                            onClick={(e) => { e.stopPropagation(); setQuantity(q => Math.max(1, q - 1)); }}
                                        >
                                            <Minus size={16} strokeWidth={3} />
                                        </button>
                                        <span className="font-black text-white text-lg w-7 text-center leading-none">{quantity}</span>
                                        <button
                                            className="flex items-center justify-center text-white font-black transition-colors active:bg-white/20 rounded"
                                            style={{ width: 32, height: 32, ...BTN_TOUCH_STYLE }}
                                            onClick={(e) => { e.stopPropagation(); setQuantity(q => Math.min(9, q + 1)); }}
                                        >
                                            <Plus size={16} strokeWidth={3} />
                                        </button>
                                    </div>
                                </div>

                                {/* Cột Phải: Addons — Fix 4: tăng lên 96px/110px */}
                                <div className="w-[96px] sm:w-[110px] h-full flex flex-col border-l-2 border-black shrink-0">
                                    {item.addons?.slice(0, 4).map((add, idx) => {
                                        const isSel = !!selectedAddons.find(a => a.label === add.label);
                                        const color = addonColorPalette[Math.min(idx, addonColorPalette.length - 1)];
                                        return (
                                            <button
                                                key={add.label}
                                                onClick={() => toggleAddon(add)}
                                                className="flex-1 w-full border-b-2 border-black last:border-b-0 flex flex-col items-center justify-center p-1 text-center transition-colors duration-100 active:scale-95"
                                                style={{
                                                    backgroundColor: isSel ? color.solid : '#FFFFFF',
                                                    color: isSel ? '#FFFFFF' : color.label,
                                                    borderColor: isSel ? color.solid : '#111111',
                                                    ...BTN_TOUCH_STYLE,
                                                }}
                                            >
                                                {isSel && <Check size={12} strokeWidth={4} className="text-current mb-0.5 shrink-0" />}
                                                <span className="font-black text-[10px] sm:text-[12px] leading-tight uppercase text-current">
                                                    {add.label}
                                                </span>
                                                {add.price > 0 && (
                                                    <span className="text-[9px] sm:text-[10px] font-bold mt-0.5 opacity-90">+{add.price}K</span>
                                                )}
                                            </button>
                                        );
                                    })}

                                    {item.addons?.length > 4 && (
                                        <div className="flex-shrink-0 w-full flex items-center justify-center border-t-2 border-black bg-gray-50" style={{ minHeight: '28px' }}>
                                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider">+{item.addons.length - 4} thêm</span>
                                        </div>
                                    )}

                                    {(!item.addons || item.addons.length === 0) && (
                                        <div className="flex-1 w-full flex items-center justify-center p-2 text-center text-gray-300 text-[10px] font-bold uppercase">
                                            Không Topping
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* HÀNG DƯỚI: ĐÁ */}
                            {sortedIces.length > 0 && (
                                <div className="flex w-full h-[15%] sm:h-[12%] border-t-2 border-black">
                                    {sortedIces.map((ice) => {
                                        const isSel = selectedIce === ice;
                                        const color = getIceColor(ice);
                                        return (
                                            <button
                                                key={ice}
                                                onClick={() => setSelectedIce(ice)}
                                                className="flex-1 h-full border-r-2 border-black last:border-r-0 flex items-center justify-center transition-colors duration-100 active:scale-95"
                                                style={{
                                                    backgroundColor: isSel ? color.solid : '#FFFFFF',
                                                    color: isSel ? '#FFFFFF' : color.label,
                                                    borderColor: isSel ? color.solid : '#111111',
                                                    ...BTN_TOUCH_STYLE,
                                                }}
                                            >
                                                <span className="font-black uppercase tracking-wider flex flex-col items-center gap-0.5 text-center leading-tight" style={{ fontSize: iceFontSize }}>
                                                    <span>{ice}</span>
                                                    {isSel && <Check size={14} strokeWidth={4} className="text-current" />}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Nút đóng + gợi ý vuốt phải để mở giỏ */}
                            <button
                                onClick={onClose}
                                className="absolute -top-12 right-0 p-2 text-white/60 hover:text-white transition-colors cursor-pointer flex items-center gap-2"
                                style={BTN_TOUCH_STYLE}
                            >
                                <span className="font-bold text-sm uppercase tracking-widest">Đóng</span>
                                <X size={24} />
                            </button>
                            <div className="absolute -top-12 left-0 flex items-center gap-1.5 text-white/40 pointer-events-none">
                                <ShoppingBag size={14} />
                                <span className="text-[11px] font-bold tracking-wider">Vuốt phải → Giỏ hàng</span>
                            </div>
                        </div>
                    </div>
            )}
        </>
    );
};

export default HUDItemCard;
