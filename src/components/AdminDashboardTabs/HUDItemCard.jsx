import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X } from 'lucide-react';

const KIOSK_DEFAULT_SUGAR = ['0%', '30%', '50%', '100%'];
const KIOSK_DEFAULT_ICE = ['Không đá', 'Ít đá', 'Bình thường', 'Nhiều đá'];

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

    useEffect(() => {
        if (isActive && item) {
            setSelectedSize(item.sizes?.[0] || null);
            setSelectedAddons([]);
            const sugars = item.sugarOptions?.length ? item.sugarOptions : KIOSK_DEFAULT_SUGAR;
            const ices = item.iceOptions?.length ? item.iceOptions : KIOSK_DEFAULT_ICE;
            // Ưu tiên defaultSugar/defaultIce trên item; fallback về phần tử cuối của list (mức cao nhất)
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

    const handleConfirm = (e) => {
        e.stopPropagation();
        let finalPrice = parseFloat(item?.price || 0);
        if (selectedSize?.priceAdjust) finalPrice += selectedSize.priceAdjust;
        if (selectedAddons.length > 0) finalPrice += selectedAddons.reduce((s, a) => s + (a.price || 0), 0);

        const customizedItem = {
            item,
            size: selectedSize,
            sugar: selectedSugar,
            ice: selectedIce,
            addons: selectedAddons,
            count: 1,
            note: '',
            totalPrice: finalPrice
        };
        onQuickAdd(customizedItem);
        onClose();
    };

    const isSoldOut = item.isSoldOut;

    // ===== MUSCLE MEMORY COLOR SYSTEM =====
    // Triết lý: Chưa chọn = nền trắng + viền + chữ màu
    //           Đã chọn   = nền ĐẶC full màu + chữ TRẮNG → mắt nhận ra ngay, không thể nhầm
    // Ánh xạ trực giác: đường ngọt = nóng/cam-đỏ đậm dần, đá lạnh = xanh lạnh đậm dần

    // ĐƯỜNG — ngọt tăng dần = ấm → nóng (trắng → vàng → cam → đỏ cam → đỏ)
    const sugarColorMap = {
        '0%':   { solid: '#6B7280', label: '#6B7280' }, // Xám: không có đường
        '30%':  { solid: '#F59E0B', label: '#D97706' }, // Vàng hổ phách
        '50%':  { solid: '#F97316', label: '#EA580C' }, // Cam
        '70%':  { solid: '#EF4444', label: '#DC2626' }, // Đỏ nhạt
        '100%': { solid: '#DC2626', label: '#B91C1C' }, // Đỏ
        '120%': { solid: '#991B1B', label: '#7F1D1D' }, // Đỏ đậm
    };
    const getSugarColor = (val) => {
        const key = Object.keys(sugarColorMap).find(k => k === val);
        if (key) return sugarColorMap[key];
        // Fallback theo giá trị số
        const n = parseInt(val) || 0;
        if (n === 0) return sugarColorMap['0%'];
        if (n <= 30) return sugarColorMap['30%'];
        if (n <= 50) return sugarColorMap['50%'];
        if (n <= 70) return sugarColorMap['70%'];
        if (n <= 100) return sugarColorMap['100%'];
        return sugarColorMap['120%'];
    };

    // ĐÁ — lạnh tăng dần = xanh lạnh đậm dần (kèm màu đặc trưng cho "không đá")
    const iceColorMap = {
        'Không đá':   { solid: '#EF4444', label: '#DC2626' }, // Đỏ = NÓNG, không đá
        'Ít đá':      { solid: '#60A5FA', label: '#3B82F6' }, // Xanh nhạt
        'Bình thường':{ solid: '#3B82F6', label: '#2563EB' }, // Xanh vừa
        'Nhiều đá':   { solid: '#1D4ED8', label: '#1E40AF' }, // Xanh đậm = RẤT LẠNH
    };
    const getIceColor = (val) => {
        return iceColorMap[val] || { solid: '#3B82F6', label: '#2563EB' };
    };

    // SIZE — hệ màu riêng biệt, mỗi size 1 màu dễ nhớ
    const sizeColorPalette = [
        { solid: '#10B981', label: '#059669' }, // Xanh lá = S (nhỏ, fresh)
        { solid: '#3B82F6', label: '#2563EB' }, // Xanh dương = M (standard)
        { solid: '#8B5CF6', label: '#7C3AED' }, // Tím = L (lớn, premium)
        { solid: '#F59E0B', label: '#D97706' }, // Vàng cam = XL (extra)
    ];

    // ADDON — mỗi addon 1 màu riêng biệt dễ phân biệt
    const addonColorPalette = [
        { solid: '#EC4899', label: '#DB2777' }, // Hồng
        { solid: '#8B5CF6', label: '#7C3AED' }, // Tím
        { solid: '#14B8A6', label: '#0D9488' }, // Xanh ngọc
        { solid: '#F97316', label: '#EA580C' }, // Cam
    ];

    // Ensure options are sensibly sorted if they come from the item data
    const sortedSugars = (item.sugarOptions?.length ? [...item.sugarOptions] : KIOSK_DEFAULT_SUGAR)
        .sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0));

    const iceWeights = { 'Không đá': 0, 'Ít đá': 1, 'Bình thường': 2, 'Nhiều đá': 3 };
    const sortedIces = (item.iceOptions?.length ? [...item.iceOptions] : KIOSK_DEFAULT_ICE)
        .sort((a, b) => (iceWeights[a] ?? 99) - (iceWeights[b] ?? 99));

    // Component trả về ĐỒNG THỜI Thẻ Nhỏ (để giữ layout lưới) VÀ Bảng HUD Overlay (khi Active)
    return (
        <>
            {/* LƯỚI CƠ BẢN (CLASSIC LOOK) KHÔNG BAO GIỜ BIẾN MẤT */}
            <motion.div 
                layoutId={`hud-card-container-${item.id}`} // Đổi tên để không đụng layoutId
                onClick={() => isSoldOut ? null : onActivate(item)} 
                className={`pos-item-card group relative ${isSoldOut ? 'grayscale cursor-not-allowed' : 'cursor-pointer'}`}
                whileTap={{ scale: 0.95 }}
                style={{ borderRadius: '0', border: '1px solid #E5E7EB', opacity: isActive ? 0 : 1 }} 
            >
                {item.image && (
                    <motion.img 
                        layoutId={isActive ? undefined : `hud-img-${item.id}`} // Bật tắt layoutId
                        src={getImageUrl(item.image)} 
                        className={`w-full h-full object-cover`} 
                        loading="lazy" 
                        alt={item.name} 
                    />
                )}
                {isSoldOut && (
                    <div className="absolute inset-0 bg-black/10 z-30 flex flex-col items-center justify-center">
                        <span className="bg-red-600/90 text-white shadow-xl font-black text-sm uppercase tracking-widest border border-red-800" style={{ padding: '8px 16px' }}>HẾT MÓN</span>
                    </div>
                )}
                <div className="absolute top-2 right-2 z-20 flex flex-col items-end gap-1">
                    <span className="bg-[#1A1A1A] text-[#FFD60A] font-mono text-[14px] font-black shadow-md px-2 py-1">
                        {Math.round(parseFloat(item.price))}K
                    </span>
                </div>
                <div className="absolute top-2 left-2 z-10">
                    <span className={`${categoryStyles?.[item.category] || 'bg-black/60'} text-white text-[10px] font-black uppercase tracking-widest shadow-lg block px-2 py-1`}>
                        {item.category}
                    </span>
                </div>
                <div 
                    className="absolute bottom-0 left-0 right-0 flex justify-center items-center gap-2 z-10" 
                    style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.95)', borderTop: '1px solid #E5E7EB' }}
                >
                    <p className="font-black text-[13px] text-gray-900 truncate uppercase text-center w-full">
                        {item.name}
                    </p>
                </div>
            </motion.div>

            {/* BẢNG HUD MỞ RỘNG (FULL STRICT LAYOUT) ĐƯỢC OVERLAY */}
            <AnimatePresence>
                {isActive && (
                    <div className="fixed inset-0 z-[900] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
                        <motion.div 
                            layoutId={`hud-card-container-${item.id}`} // Zoom khung ngoài
                            className="relative bg-white flex flex-col shadow-2xl"
                            style={{ 
                                width: 'min(95vw, 600px)', 
                                height: 'min(90vh, 700px)', 
                                border: '2px solid #111'
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
                                                className="flex-1 h-full border-r-2 border-black last:border-r-0 flex items-center justify-center transition-all duration-150 active:scale-95"
                                                style={{ 
                                                    backgroundColor: isSel ? color.solid : '#FFFFFF',
                                                    color: isSel ? '#FFFFFF' : color.label,
                                                    borderColor: isSel ? color.solid : '#111111',
                                                }}
                                            >
                                                <span className="font-black text-[13px] sm:text-[17px] uppercase tracking-wider flex flex-col items-center gap-0.5">
                                                    <span>{s}</span>
                                                    {isSel && <Check size={14} strokeWidth={4} className="text-current" />}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {/* KHUNG GIỮA: SIZE - HÌNH MÓN CHÍT - TOPPING */}
                            <div className="flex-1 flex w-full overflow-hidden bg-white">
                                
                                {/* Cột Trái: Size */}
                                <div className="w-[80px] sm:w-[100px] h-full flex flex-col border-r-2 border-black shrink-0">
                                    {item.sizes?.map((sz, idx) => {
                                        const isSel = selectedSize?.label === sz.label;
                                        const color = sizeColorPalette[Math.min(idx, sizeColorPalette.length - 1)];
                                        return (
                                            <button 
                                                key={sz.label} 
                                                onClick={() => setSelectedSize(sz)}
                                                className="flex-1 w-full border-b-2 border-black last:border-b-0 flex flex-col items-center justify-center transition-all duration-150 active:scale-95"
                                                style={{ 
                                                    backgroundColor: isSel ? color.solid : '#FFFFFF',
                                                    color: isSel ? '#FFFFFF' : color.label,
                                                    borderColor: isSel ? color.solid : '#111111',
                                                }}
                                            >
                                                <div className="flex items-center gap-1">
                                                    <span className="font-black text-[28px] sm:text-[36px] leading-none">{sz.label}</span>
                                                </div>
                                                {sz.priceAdjust !== 0 && (
                                                    <span className="text-[10px] sm:text-[12px] font-bold mt-0.5 opacity-80">
                                                        +{sz.priceAdjust}K
                                                    </span>
                                                )}
                                                {isSel && <Check size={14} strokeWidth={4} className="text-current mt-1" />}
                                            </button>
                                        );
                                    })}
                                    
                                    {(!item.sizes || item.sizes.length === 0) && (
                                        <div className="flex-1 w-full items-center justify-center flex p-2 text-center text-gray-300 text-[10px] font-bold uppercase">
                                            Mặc định
                                        </div>
                                    )}
                                </div>

                                {/* Tâm Điểm: Hình ảnh hiển thị & Nút CHỐT */}
                                <div className="flex-1 h-full relative cursor-pointer group bg-black transition-transform" onClick={handleConfirm}>
                                    {item.image ? (
                                        <motion.img 
                                            layoutId={isActive ? `hud-img-${item.id}` : undefined}
                                            src={getImageUrl(item.image)} 
                                            className="w-full h-full object-cover opacity-60" 
                                            alt={item.name} 
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-gray-900">
                                            <span className="font-black text-white/20 text-[48px] uppercase tracking-widest select-none">{item.name?.charAt(0)}</span>
                                        </div>
                                    )}
                                    <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors flex flex-col items-center justify-center">
                                        <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-none border-[5px] border-white flex flex-col items-center justify-center shadow-2xl bg-[#ea580c]/90 group-hover:bg-[#ea580c] group-hover:border-[#f97316] group-active:scale-95 transition-all">
                                            <Check size={56} className="text-white drop-shadow-md" strokeWidth={5} />
                                        </div>
                                        <div className="mt-6 bg-black/75 px-4 py-2 text-center border-t border-b border-white/20 w-full overflow-hidden">
                                            <p className="font-black text-[18px] sm:text-[22px] text-white tracking-widest uppercase truncate w-full leading-none">
                                                {item.name}
                                            </p>
                                            <p className="font-bold text-[14px] text-[#FFD60A] tracking-wider mt-1">
                                                {formatVND(parseFloat(item.price) + (selectedSize?.priceAdjust || 0) + selectedAddons.reduce((s,a) => s + (a.price || 0), 0))}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Cột Phải: Addons */}
                                <div className="w-[80px] sm:w-[100px] h-full flex flex-col border-l-2 border-black shrink-0">
                                    {item.addons?.slice(0, 4).map((add, idx) => {
                                        const isSel = !!selectedAddons.find(a => a.label === add.label);
                                        const color = addonColorPalette[Math.min(idx, addonColorPalette.length - 1)];
                                        return (
                                            <button 
                                                key={add.label} 
                                                onClick={() => toggleAddon(add)}
                                                className="flex-1 w-full border-b-2 border-black last:border-b-0 flex flex-col items-center justify-center p-1 text-center transition-all duration-150 active:scale-95"
                                                style={{ 
                                                    backgroundColor: isSel ? color.solid : '#FFFFFF',
                                                    color: isSel ? '#FFFFFF' : color.label,
                                                    borderColor: isSel ? color.solid : '#111111',
                                                }}
                                            >
                                                {isSel && <Check size={12} strokeWidth={4} className="text-current mb-0.5 shrink-0" />}
                                                <span className="font-black text-[10px] sm:text-[12px] leading-tight uppercase text-current">
                                                    {add.label}
                                                </span>
                                                {add.price > 0 && (
                                                    <span className="text-[9px] sm:text-[10px] font-bold mt-0.5 opacity-90">
                                                        +{add.price}K
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}

                                    {/* Badge thể hiện addon ẩn khi item có > 4 addon */}
                                    {item.addons?.length > 4 && (
                                        <div className="flex-shrink-0 w-full flex items-center justify-center border-t-2 border-black bg-gray-50" style={{ minHeight: '28px' }}>
                                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider">+{item.addons.length - 4} thêm</span>
                                        </div>
                                    )}

                                    {(!item.addons || item.addons.length === 0) && (
                                        <div className="flex-1 w-full items-center justify-center flex p-2 text-center text-gray-300 text-[10px] font-bold uppercase">
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
                                                className="flex-1 h-full border-r-2 border-black last:border-r-0 flex items-center justify-center transition-all duration-150 active:scale-95"
                                                style={{ 
                                                    backgroundColor: isSel ? color.solid : '#FFFFFF',
                                                    color: isSel ? '#FFFFFF' : color.label,
                                                    borderColor: isSel ? color.solid : '#111111',
                                                }}
                                            >
                                                <span className="font-black text-[13px] sm:text-[16px] uppercase tracking-wider flex flex-col items-center gap-0.5 text-center leading-tight">
                                                    <span>{ice}</span>
                                                    {isSel && <Check size={14} strokeWidth={4} className="text-current" />}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Nút thoát */}
                            <button onClick={onClose} className="absolute -top-12 right-0 p-2 text-white/50 hover:text-white transition-colors cursor-pointer flex items-center gap-2">
                                <span className="font-bold text-sm uppercase tracking-widest">Đóng</span>
                                <X size={24} />
                            </button>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </>
    );
};

export default HUDItemCard;
