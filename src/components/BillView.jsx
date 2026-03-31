import React, { useEffect, useState } from 'react';
import { formatTime, formatDate, formatDateTime } from '../utils/timeUtils';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, Clock, ArrowLeft, Coffee, X, ChevronDown, ChevronUp, Trash2, Gift, Sparkles } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { SERVER_URL, getImageUrl } from '../api.js';
import { calculateCartWithPromotions } from '../utils/promotionEngine';

const formatVND = (price) => {
    const num = parseFloat(price);
    if (isNaN(num)) return '0 ₫';
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num * 1000);
};

// Generate VietQR URL (works without API key for basic format)
const getVietQR = (amount, settings, orderRef = '') => {
    const BANK_ID = settings.bankId || 'MB';
    const ACCOUNT_NO = settings.accountNo || '0123456789';
    const ACCOUNT_NAME = settings.accountName || 'TH-POS';
    const amountVND = Math.round(amount * 1000);
    const memo = orderRef ? `DH ${orderRef}` : (settings.shopName || 'Cafe Coffee');

    // Link for scanning (Image)
    const qrUrl = `https://img.vietqr.io/image/${BANK_ID}-${ACCOUNT_NO}-compact2.png?amount=${amountVND}&addInfo=${encodeURIComponent(memo)}&accountName=${encodeURIComponent(ACCOUNT_NAME)}`;

    return { qrUrl };
};

const BillView = ({ order: propOrder, settings }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [status, setStatus] = useState(propOrder?.status || location.state?.order?.status || 'PENDING');
    const [promotions, setPromotions] = useState([]);
    const [promoCodeInput, setPromoCodeInput] = useState('');
    const [orderNote, setOrderNote] = useState('');
    const [isPromoExpanded, setIsPromoExpanded] = useState(false);
    const [countdown, setCountdown] = useState(2);
    const [showThankYou, setShowThankYou] = useState(false);
    const [showCopySuccess, setShowCopySuccess] = useState(false);
    const [menu, setMenu] = useState([]);

    const handleCopyInfo = (text) => {
        navigator.clipboard.writeText(text).then(() => {
            setShowCopySuccess(true);
            setTimeout(() => setShowCopySuccess(false), 2000);
        });
    };

    const handleDownloadQR = async (qrUrl) => {
        try {
            const response = await fetch(qrUrl);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `QR_ThanhToan_${order.id}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error downloading QR:', error);
            alert('Không thể tải mã QR. Vui lòng chụp màn hình hoặc copy thông tin.');
        }
    };

    const [isTokenValid, setIsTokenValid] = useState(false);
    const [tokenChecked, setTokenChecked] = useState(false);

    // Support both prop-based (from App.jsx) and location.state (from Menu.jsx cart)
    const order = propOrder || location.state?.order;
    const [localCart, setLocalCart] = useState(location.state?.cart || JSON.parse(localStorage.getItem('cart') || '[]'));
    const [editingOption, setEditingOption] = useState(null); // { itemIndex, type, options }
    const [selectedPromoId, setSelectedPromoId] = useState(null);

    const updateCart = (newCart) => {
        setLocalCart(newCart);
        localStorage.setItem('cart', JSON.stringify(newCart));
    };

    const removeItem = (index) => {
        const newCart = localCart.filter((_, i) => i !== index);
        updateCart(newCart);
    };

    const updateItemOption = (itemIndex, type, newValue) => {
        const newCart = [...localCart];
        const item = { ...newCart[itemIndex] };

        if (type === 'size') {
            item.size = newValue;
        } else if (type === 'sugar') {
            item.sugar = newValue;
        } else if (type === 'ice') {
            item.ice = newValue;
        } else if (type === 'addons') {
            // Addition logic would go here if we had an "add addon" dropdown
            // For now we use the existing addon list
        }

        // Recalculate price
        const basePrice = parseFloat(item.item.price);
        const sizePrice = item.size?.priceAdjust || 0;
        const addonPrice = item.addons?.reduce((sum, a) => sum + (a.price || 0), 0) || 0;
        item.totalPrice = basePrice + sizePrice + addonPrice;

        newCart[itemIndex] = item;
        updateCart(newCart);
        setEditingOption(null);
    };

    const removeAddon = (itemIndex, addonIndex) => {
        const newCart = [...localCart];
        const item = { ...newCart[itemIndex] };
        item.addons = item.addons.filter((_, i) => i !== addonIndex);

        // Recalculate price
        const basePrice = parseFloat(item.item.price);
        const sizePrice = item.size?.priceAdjust || 0;
        const addonPrice = item.addons?.reduce((sum, a) => sum + (a.price || 0), 0) || 0;
        item.totalPrice = basePrice + sizePrice + addonPrice;

        newCart[itemIndex] = item;
        updateCart(newCart);
    };

    const totalWeight = localCart.reduce((sum, c) => sum + (c.totalPrice * c.count), 0);

    useEffect(() => {
        if (!order || !settings) return;
        const checkStatus = async () => {
            try {
                const response = await fetch(`${SERVER_URL}/api/order/status/${order.id}`);
                const data = await response.json();
                if (data.status === 'PAID' && status !== 'PAID') {
                    setStatus('PAID');
                    setShowThankYou(true);
                    setCountdown(2);
                } else if (data.status === 'COMPLETED') {
                    setStatus('COMPLETED');
                } else if (data.status === 'AWAITING_PAYMENT') {
                    setStatus('AWAITING_PAYMENT');
                }
            } catch (err) {
                console.error("Error fetching status:", err);
            }
        };
        const statusInterval = setInterval(checkStatus, 3000);
        return () => {
            clearInterval(statusInterval);
        };
    }, [order, status, settings]);

    useEffect(() => {
        const fetchPromo = async () => {
            try {
                const res = await fetch(`${SERVER_URL}/api/promotions`);
                if (res.ok) setPromotions(await res.json());
            } catch (err) {}
        };
        fetchPromo();

        const fetchMenu = async () => {
            try {
                const res = await fetch(`${SERVER_URL}/api/menu`);
                if (res.ok) setMenu(await res.json());
            } catch (err) {}
        };
        fetchMenu();

        const checkToken = async () => {
            const savedToken = localStorage.getItem('qrToken');
            if (!savedToken) {
                setIsTokenValid(false);
                setTokenChecked(true);
                return;
            }
            try {
                const res = await fetch(`${SERVER_URL}/api/qr-token/check/${savedToken}`);
                const data = await res.json();
                setIsTokenValid(data.isValid);
                setTokenChecked(true);
            } catch (e) {
                setTokenChecked(true);
            }
        };
        checkToken();
    }, []);

    useEffect(() => {
        if (showThankYou && countdown > 0) {
            const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
            return () => clearTimeout(timer);
        } else if (showThankYou && countdown === 0) {
            const t = setTimeout(() => setShowThankYou(false), 0);
            return () => clearTimeout(t);
        }
    }, [showThankYou, countdown]);

    if (!settings) {
        return (
            <div className="flex h-screen items-center justify-center bg-[#F9F8F6]">
                <div className="animate-pulse flex flex-col items-center gap-3 text-brand-600">
                    <Coffee size={32} />
                    <span className="font-black text-xs uppercase tracking-widest text-brand-500">Đang chuẩn bị...</span>
                </div>
            </div>
        );
    }

    const qrToken = localStorage.getItem('qrToken');
    const isOrderReady = tokenChecked && (!settings?.qrProtectionEnabled || isTokenValid);

    // Cart-based bill (from mobile menu, before submitting order)
    if (!order && localCart) {
        if (localCart.length === 0) {
            return (
                <div className="page-transition p-8 text-center flex flex-col items-center justify-center min-h-[60vh]">
                    <div className="w-20 h-20 bg-gray-50 flex items-center justify-center rounded-none mb-6">
                        <Coffee size={40} className="text-gray-200" />
                    </div>
                    <p className="text-gray-400 font-black uppercase tracking-widest text-xs mb-8">Giỏ hàng đang trống</p>
                    <button onClick={() => navigate('/order')} className="px-10 py-4 bg-accent text-white font-black text-xs uppercase tracking-widest" >
                        Quay lại chọn món
                    </button>
                </div>
            );
        }

        const calculateCart = () => {
            const promoResult = calculateCartWithPromotions(localCart, promotions, promoCodeInput, menu, selectedPromoId, settings?.enablePromotions);
            
            let taxAmount = 0;
            let finalTotal = promoResult.totalOrderPrice;
            const rate = parseFloat(settings?.taxRate) || 0;
            const preTaxTotal = promoResult.totalOrderPrice;

            if (settings?.taxMode === 'EXCLUSIVE' && rate > 0) {
                taxAmount = Math.floor(preTaxTotal * (rate / 100));
                finalTotal = preTaxTotal + taxAmount;
            } else if ((settings?.taxMode === 'INCLUSIVE' || settings?.taxMode === 'DIRECT_INCLUSIVE') && rate > 0) {
                taxAmount = Math.floor(preTaxTotal - (preTaxTotal / (1 + rate / 100)));
                finalTotal = preTaxTotal;
            }

            return { 
                ...promoResult, 
                totalOrderPrice: finalTotal, 
                preTaxTotal,
                taxAmount, 
                taxRate: rate, 
                taxMode: settings?.taxMode || 'NONE'
            };
        };

        const submitOrder = async () => {
            if (settings.qrProtectionEnabled && (!qrToken || !isTokenValid)) {
                alert('Mã QR đã hết hạn hoặc không hợp lệ. Vui lòng quét mã mới tại quầy để đặt món.');
                return;
            }

            const { totalOrderPrice, preTaxTotal, taxAmount, taxRate, taxMode, baseTotal, discount, validPromo, processedCart } = calculateCart();

            const finalCart = [...processedCart];

            const orderData = {
                id: Date.now().toString() + '-' + Math.random().toString(36).substring(2, 9),
                itemName: finalCart.map(c => `${c.item.name} x${c.count}`).join(', '),
                customerName: localStorage.getItem('customerName') || 'Khách đặt online',
                note: orderNote,
                price: totalOrderPrice,
                basePrice: baseTotal,
                preTaxTotal: preTaxTotal,
                taxAmount: taxAmount,
                taxRate: taxRate,
                taxMode: taxMode,
                discount: discount,
                appliedPromoCode: validPromo ? (validPromo.code || validPromo.name) : null,
                qrToken: qrToken?.toUpperCase(),
                timestamp: new Date().toISOString(),
                cartItems: finalCart,
                status: settings.requirePrepayment === false ? 'PENDING' : 'AWAITING_PAYMENT'
            };
            try {
                // Tín hiệu xoay QR khi có hành động đặt hàng quan trọng
                if (qrToken) {
                    await fetch(`${SERVER_URL}/api/qr-token/accessed`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ token: qrToken.toUpperCase() })
                    }).catch(e => console.error("Signal QR error:", e));
                }

                const res = await fetch(`${SERVER_URL}/api/order`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(orderData)
                });

                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    if (errData.error === 'INSUFFICIENT_INVENTORY') {
                        alert(errData.message);
                    } else if (res.status === 403) {
                        alert('Mã QR đã hết hạn hoặc không hợp lệ. Vui lòng quét mã mới tại quầy.');
                    } else {
                        alert('Có lỗi xảy ra khi tạo đơn hàng. Vui lòng thử lại sau.');
                    }
                    return;
                }

                const data = await res.json();
                localStorage.removeItem('cart'); // Clear cart after success
                navigate('/bill', { replace: true, state: { order: data.order } });

            } catch (err) { console.error(err); }
        };

        return (
            <div className="page-transition pb-28">
                <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-400 font-bold text-sm mb-6 mt-2">
                    <ArrowLeft size={18} /> Quay lại
                </button>
                <h1 className="text-3xl font-black tracking-tighter mb-16">Xác nhận đơn hàng</h1>

                {/* Security Warning */}
                {tokenChecked && settings?.qrProtectionEnabled && !isTokenValid && (
                    <div className="bg-red-50 border-l-4 border-red-500 p-5 mb-8 flex items-start gap-4 shadow-sm animate-pulse">
                        <div className="bg-red-500 p-2 text-white">
                            <Clock size={20} />
                        </div>
                        <div>
                            <p className="text-red-800 font-black text-xs uppercase tracking-widest mb-1">Mã QR Hết Hạn</p>
                            <p className="text-red-600 text-[11px] font-bold leading-relaxed">Vui lòng quét mã QR mới tại quầy để tiếp tục đặt món. Bạn không thể đặt món với mã đã cũ.</p>
                        </div>
                    </div>
                )}

                {/* Cart items */}
                <div className="space-y-6 mb-12">
                    {(() => {
                        const { processedCart } = calculateCart();
                        return processedCart.map((c, i) => {
                            const sugarOpts = c.item.sugarOptions?.length ? c.item.sugarOptions : ['0%', '50%', '100%'];
                            const iceOpts = c.item.iceOptions?.length ? c.item.iceOptions : ['Không đá', 'Ít đá', 'Bình thường'];
                            const hasSizes = c.item.sizes?.length > 1;
                            const hasSugar = sugarOpts.length > 1;
                            const hasIce = iceOpts.length > 1;

                            return (
                                <div key={i} className="relative mb-0 shrink-0">
                                    {!c.isGift && (
                                        <div className="absolute inset-y-0 right-0 w-24 bg-red-500 flex items-center justify-end px-6 shadow-inner z-[1]">
                                            <Trash2 size={24} className="text-white" />
                                        </div>
                                    )}
                                    <motion.div
                                        drag={c.isGift ? false : "x"}
                                        dragConstraints={{ left: -100, right: 0 }}
                                        dragDirectionLock
                                        dragElastic={0.05}
                                        onDragEnd={(e, info) => {
                                            if (!c.isGift && info.offset.x < -60) {
                                                removeItem(i);
                                            }
                                        }}
                                        className={`bg-white p-6 border shadow-sm relative group z-10 transition-colors ${c.isGift ? 'border-green-300 bg-green-50/20' : 'border-gray-100'} w-full`}
                                    >

                                    <div className="flex justify-between items-start mb-6">
                                        <div className="flex items-center gap-3">
                                            {c.isGift ? (
                                                <span className="text-xs font-black text-white bg-green-500 w-6 h-6 flex items-center justify-center flex-shrink-0"><Gift size={12}/></span>
                                            ) : (
                                                <span className="text-xs font-black text-white bg-gray-900 w-6 h-6 flex items-center justify-center flex-shrink-0">{i + 1}</span>
                                            )}
                                            <h3 className={`font-black uppercase tracking-tighter ${c.isGift ? 'text-green-800 text-lg' : 'text-gray-900 text-xl'}`}>{c.item.name}</h3>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            {c.isGift ? (
                                                <>
                                                    <p className="font-black text-gray-400 text-xs line-through">{formatVND(c.originalPrice * c.count)}</p>
                                                    <p className="font-black text-green-600 text-lg">0 đ</p>
                                                </>
                                            ) : (
                                                <p className="font-black text-gray-900 text-lg">{formatVND(c.totalPrice * c.count)}</p>
                                            )}
                                            <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest text-right w-full mt-1">Số lượng: {c.count}</p>
                                        </div>
                                    </div>

                                <div className="flex flex-col gap-3">
                                    {/* Size Dropdown */}
                                    {c.size && (
                                        <div className="relative">
                                            <button
                                                onClick={() => hasSizes && setEditingOption(editingOption?.id === `size-${i}` ? null : { id: `size-${i}`, index: i, type: 'size', opts: c.item.sizes })}
                                                className={`flex items-center gap-2 px-5 py-4 w-full text-sm font-black uppercase tracking-wider transition-all border ${hasSizes ? 'bg-gray-50 border-gray-200 hover:border-accent' : 'bg-gray-50/50 border-transparent'}`}
                                            >
                                                Size: {String(typeof c.size === 'object' && c.size !== null ? (c.size.label || 'S') : (c.size || 'S'))} {hasSizes && <ChevronDown size={16} className="text-gray-400 ml-auto" />}
                                            </button>
                                            {editingOption?.id === `size-${i}` && (
                                                <div className="absolute top-full left-0 mt-2 bg-white border border-gray-200 shadow-2xl z-50 min-w-full">
                                                    {editingOption.opts.map(s => (
                                                        <button
                                                            key={s.label}
                                                            onClick={() => updateItemOption(i, 'size', s)}
                                                            className={`w-full text-left px-5 py-5 text-sm font-black uppercase border-b border-gray-50 last:border-0 hover:bg-gray-50 ${String(typeof c.size === 'object' && c.size !== null ? (c.size.label || 'S') : (c.size || 'S')) === s.label ? 'text-brand-500 bg-orange-50' : 'text-gray-600'}`}
                                                        >
                                                            {s.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Sugar Dropdown */}
                                    <div className="relative">
                                        <button
                                            onClick={() => hasSugar && setEditingOption(editingOption?.id === `sugar-${i}` ? null : { id: `sugar-${i}`, index: i, type: 'sugar', opts: sugarOpts })}
                                            className={`flex items-center gap-2 px-5 py-4 w-full text-sm font-black uppercase tracking-wider transition-all border ${hasSugar ? 'bg-gray-50 border-gray-200 hover:border-accent' : 'bg-gray-50/50 border-transparent'}`}
                                        >
                                            Đường: {c.sugar} {hasSugar && <ChevronDown size={16} className="text-gray-400 ml-auto" />}
                                        </button>
                                        {editingOption?.id === `sugar-${i}` && (
                                            <div className="absolute top-full left-0 mt-2 bg-white border border-gray-200 shadow-2xl z-50 min-w-full">
                                                {editingOption.opts.map(opt => (
                                                    <button
                                                        key={opt}
                                                        onClick={() => updateItemOption(i, 'sugar', opt)}
                                                        className={`w-full text-left px-5 py-5 text-sm font-black uppercase border-b border-gray-50 last:border-0 hover:bg-gray-50 ${c.sugar === opt ? 'text-brand-500 bg-orange-50' : 'text-gray-600'}`}
                                                    >
                                                        {opt}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Ice Dropdown */}
                                    <div className="relative">
                                        <button
                                            onClick={() => hasIce && setEditingOption(editingOption?.id === `ice-${i}` ? null : { id: `ice-${i}`, index: i, type: 'ice', opts: iceOpts })}
                                            className={`flex items-center gap-2 px-5 py-4 w-full text-sm font-black uppercase tracking-wider transition-all border ${hasIce ? 'bg-gray-50 border-gray-200 hover:border-accent' : 'bg-gray-50/50 border-transparent'}`}
                                        >
                                            Đá: {c.ice} {hasIce && <ChevronDown size={16} className="text-gray-400 ml-auto" />}
                                        </button>
                                        {editingOption?.id === `ice-${i}` && (
                                            <div className="absolute top-full left-0 mt-2 bg-white border border-gray-200 shadow-2xl z-50 min-w-full">
                                                {editingOption.opts.map(opt => (
                                                    <button
                                                        key={opt}
                                                        onClick={() => updateItemOption(i, 'ice', opt)}
                                                        className={`w-full text-left px-5 py-5 text-sm font-black uppercase border-b border-gray-50 last:border-0 hover:bg-gray-50 ${c.ice === opt ? 'text-brand-500 bg-orange-50' : 'text-gray-600'}`}
                                                    >
                                                        {opt}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Addons with Delete */}
                                    {c.addons && c.addons.length > 0 && (
                                        <div className="flex flex-wrap gap-2 mt-1">
                                            {c.addons.map((a, ai) => (
                                                <div key={ai} className="flex items-center gap-2 bg-accent-light text-accent pl-4 pr-1 py-1.5 transition-all group/addon border border-accent/20">
                                                    <span className="text-xs font-black uppercase tracking-wider">+{a.label}</span>
                                                    <button
                                                        onClick={() => removeAddon(i, ai)}
                                                        className="w-10 h-10 flex items-center justify-center text-accent/60 hover:text-red-500 transition-colors"
                                                    >
                                                        <X size={16} strokeWidth={3} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {c.note && (
                                    <div className="mt-4 pt-4 border-t border-gray-50">
                                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Ghi chú:</p>
                                        <p className="text-xs text-gray-600 italic leading-relaxed">{c.note}</p>
                                    </div>
                                )}
                                </motion.div>
                            </div>
                        );
                    });
                })()}
                </div>

                {/* Total */}
                <div className="bg-white p-8 border border-gray-100 shadow-sm mb-8">
                    <div className="mb-6">
                        {(() => {
                            const { validPromo, availablePromotions } = calculateCart();
                            
                            return (
                                <>
                                    <div className="mb-4">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] block mb-2">Ghi chú đơn hàng / Lời nhắn</label>
                                        <textarea
                                            value={orderNote}
                                            onChange={(e) => setOrderNote(e.target.value)}
                                            placeholder="Giao tận bàn số 5, mang đi, gọi khi đến..."
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 focus:border-accent rounded-none font-medium text-gray-900 outline-none text-xs resize-none h-16"
                                        />
                                    </div>
                                    <div className="flex items-center gap-3 mb-3">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] w-20 shrink-0">MÃ KM</label>
                                        <div className="flex-1 relative">
                                            <div 
                                                onClick={() => setIsPromoExpanded(!isPromoExpanded)}
                                                className={`w-full px-4 py-3 border flex justify-between items-center cursor-pointer transition-all ${validPromo ? 'bg-accent/5 border-accent' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'}`}
                                            >
                                                <span className={`text-xs font-bold whitespace-nowrap overflow-hidden text-ellipsis ${validPromo ? 'text-accent' : 'text-gray-500'}`}>
                                                    {validPromo ? `✓ ${validPromo.code || validPromo.name}` : 'Nhập mã KM (nếu có)'}
                                                </span>
                                                {isPromoExpanded ? <ChevronUp size={16} className={validPromo ? 'text-accent' : 'text-gray-400'} /> : <ChevronDown size={16} className={validPromo ? 'text-accent' : 'text-gray-400'} />}
                                            </div>
                                        </div>
                                    </div>

                                    <AnimatePresence>
                                        {isPromoExpanded && (
                                            <motion.div 
                                                initial={{ height: 0, opacity: 0 }} 
                                                animate={{ height: 'auto', opacity: 1 }} 
                                                exit={{ height: 0, opacity: 0 }}
                                                className="overflow-hidden pl-[92px]"
                                            >
                                                <input 
                                                    type="text" 
                                                    value={promoCodeInput}
                                                    onChange={e => {
                                                        setPromoCodeInput(e.target.value.toUpperCase());
                                                        setSelectedPromoId(null);
                                                    }}
                                                    placeholder="Nhập mã giảm giá..."
                                                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 focus:border-accent rounded-none font-bold text-gray-900 outline-none transition-all uppercase placeholder:normal-case placeholder:font-normal mb-2 text-xs"
                                                />
                                                {promoCodeInput && availablePromotions.length === 0 && <p className="text-xs font-bold text-red-500 mb-2">Mã không hợp lệ hoặc chưa đủ điều kiện</p>}
                                                {availablePromotions.length > 0 && (
                                                    <div className="flex flex-col gap-2">
                                                        {availablePromotions.map(ap => {
                                                            const isSelected = validPromo?.id === ap.promo.id;
                                                            return (
                                                                <label key={ap.promo.id} className={`flex items-start gap-3 p-3 rounded-none border cursor-pointer transition-all ${isSelected ? 'border-accent bg-accent/5' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                                                                    <input 
                                                                        type="radio" 
                                                                        name="bill_promo"
                                                                        checked={isSelected}
                                                                        onChange={() => {
                                                                            setSelectedPromoId(ap.promo.id);
                                                                            setIsPromoExpanded(false);
                                                                        }}
                                                                        className="mt-1 w-4 h-4 accent-accent"
                                                                    />
                                                                    <div className="flex-1">
                                                                        <p className={`text-xs font-black ${isSelected ? 'text-accent' : 'text-gray-900'}`}>{ap.promo.name}</p>
                                                                        {ap.messages && ap.messages.map((m, i) => (
                                                                            <p key={i} className={`text-[10px] italic mt-1 ${isSelected ? 'text-accent/80' : 'text-gray-500'}`}>- {m}</p>
                                                                        ))}
                                                                    </div>
                                                                </label>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </>
                            );
                        })()}
                    </div>
                    {(() => {
                        const { totalOrderPrice, baseTotal, discount, giftMessages, suggestedGifts } = calculateCart();
                        return (
                            <>
                                {discount > 0 && (
                                    <div className="flex justify-between items-center mb-1 drop-shadow-sm">
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Tạm tính</span>
                                        <span className="text-[11px] font-black text-gray-400 font-mono">{formatVND(baseTotal)}</span>
                                    </div>
                                )}
                                {discount > 0 && (
                                    <div className="flex justify-between items-center mb-2 drop-shadow-sm">
                                        <span className="text-[10px] font-black text-brand-600 uppercase tracking-widest flex items-center gap-1 group-hover:scale-105 transition-transform"><Sparkles size={10}/> Khuyến mãi</span>
                                        <span className="text-[12px] font-black text-brand-600 font-mono animate-pulse">-{formatVND(discount)}</span>
                                    </div>
                                )}
                                {giftMessages && giftMessages.length > 0 && (
                                    <div className="mb-4 pt-4 border-t border-dashed border-brand-200">
                                        <p className="text-[10px] font-black text-brand-600 uppercase tracking-widest mb-2 flex items-center gap-1">
                                            <Sparkles size={12}/> THÔNG BÁO QUÀ TẶNG:
                                        </p>
                                        <div className="flex flex-col gap-1.5">
                                            {giftMessages.map((msg, gIdx) => (
                                                <div key={gIdx} className="flex justify-between items-center bg-brand-50/80 p-2 rounded-none border border-brand-100/50 backdrop-blur-sm group-hover:bg-brand-100/50 transition-colors">
                                                    <span className="text-[11px] font-bold text-brand-800 flex-1 italic drop-shadow-sm"><span className="text-brand-500 mr-1 opacity-80">🎁</span> {msg}</span>
                                                </div>
                                            ))}
                                        </div>
                                        {suggestedGifts && suggestedGifts.length > 0 && (
                                            <p className="text-xs text-orange-500 font-bold mt-2">
                                                * Vui lòng <button onClick={() => navigate('/order')} className="underline text-orange-600">quay lại menu</button> để chọn thêm {suggestedGifts.length} phần quà tặng miễn phí. 
                                            </p>
                                        )}
                                    </div>
                                )}
                                <div className="flex justify-between items-center mb-6 border-t border-gray-50 pt-4 mt-2">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Tổng thanh toán</span>
                                    <span className="text-3xl font-black text-gray-900">{formatVND(totalOrderPrice)}</span>
                                </div>
                            </>
                        );
                    })()}
                    {/* QR Code Meta */}
                    {settings.requirePrepayment !== false && (
                        <div className="bg-accent-light py-4 px-6 text-center">
                            <p className="text-[10px] text-accent font-black uppercase tracking-widest italic">Mã QR thanh toán kèm ID đơn hàng sẽ xuất hiện ở bước tiếp theo.</p>
                        </div>
                    )}
                    {settings.requirePrepayment === false && (
                        <div className="bg-green-50 py-4 px-6 text-center">
                            <p className="text-[10px] font-black text-green-700 uppercase tracking-widest italic">Quý khách vui lòng thanh toán sau khi dùng món.</p>
                        </div>
                    )}
                </div>

                {/* Order confirmation button */}
                <div className="mt-auto space-y-12 pt-16">
                    <button
                        onClick={submitOrder}
                        disabled={!isOrderReady}
                        className={`w-full py-6 font-black text-xl shadow-2xl transition-all active:scale-95 border-2 ${!isOrderReady ? 'bg-gray-50 border-gray-200 text-gray-300' : 'bg-accent border-accent text-white shadow-accent/20 hover:scale-[1.02]'}`}
                        style={isOrderReady ? { backgroundColor: "var(--brand-600)", bordercolor: "var(--brand-600)", color: '#FFFFFF' } : {}}
                    >
                        {isOrderReady ? 'ĐẶT HÀNG NGAY' : 'VUI LÒNG QUÉT QR...'}
                    </button>

                    <button onClick={() => navigate('/order')} className="w-full py-4 text-gray-400 font-black text-[10px] uppercase tracking-[0.3em] hover:text-accent transition-colors">
                        — CHỌN THÊM MÓN —
                    </button>
                </div>
            </div>
        );
    }

    if (!order) {
        return (
            <div className="text-center p-12 bg-gray-50 border border-gray-100">
                <p className="text-gray-400 font-black uppercase tracking-widest text-xs">Chưa có order nào.</p>
                <button onClick={() => navigate('/order')} className="buy-btn mt-6">QUAY LẠI MENU</button>
            </div>
        );
    }

    return (
        <div className="fade-in space-y-8 page-transition">
            {/* Back button */}
            <button onClick={() => navigate('/order')} className="flex items-center gap-2 text-gray-400 font-bold text-sm pt-2">
                <ArrowLeft size={18} /> Về trang chủ
            </button>

            {/* Status indicator */}
            <div className="flex flex-col items-center pt-4">
                <div className={`p-8 mb-5 transition-all duration-1000 shadow-2xl 
                    ${status === 'COMPLETED' ? 'bg-brand-500 text-white' :
                        status === 'PAID' ? 'bg-green-600 text-white' :
                            status === 'AWAITING_PAYMENT' ? 'bg-orange-500 text-white animate-pulse' :
                                'bg-accent text-white animate-pulse'}`}>
                    {status === 'COMPLETED' || status === 'PAID' ? <CheckCircle size={56} /> : <Clock size={56} />}
                </div>
                <h2 className="text-3xl font-black tracking-tighter text-center">
                    {status === 'COMPLETED' ? 'MÓN ĐÃ XONG!' :
                        status === 'PAID' ? 'ĐÃ NHẬN TIỀN' :
                            status === 'AWAITING_PAYMENT' ? 'CHỜ THANH TOÁN' :
                                status === 'PENDING' ? 'ĐANG CHẾ BIẾN...' :
                                    'ĐANG XỬ LÝ...'}
                </h2>
                <p className="text-gray-400 text-sm font-bold uppercase tracking-widest mt-1 text-center">
                    {status === 'COMPLETED' ? 'Vui lòng đến quầy nhận món' :
                        status === 'AWAITING_PAYMENT' ? 'Vui lòng thực hiện chuyển khoản' :
                            status === 'PAID' ? 'Cảm ơn quý khách!' :
                                'Nhân viên đang chuẩn bị món'}
                </p>
            </div>

            {/* Bill card */}
            <motion.div
                initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                className="bg-white text-gray-900 p-8 shadow-2xl font-mono relative overflow-hidden border border-gray-100"
            >
                {/* Header */}
                <div className="text-center border-b-2 border-dashed border-gray-200 pb-6 mb-6">
                    {settings.headerImageUrl ? (
                        <div className="flex justify-center mb-2">
                            <img src={getImageUrl(settings.headerImageUrl)} alt={settings.shopName} style={{ height: 48, objectFit: 'contain' }} />
                        </div>
                    ) : (
                        <h1 className="text-3xl font-black tracking-tighter mb-1">
                            {(settings?.shopName || 'TH POS').split(' ')[0]} <span style={{ color: settings?.themeColor || '#F5A623' }}>{(settings?.shopName || '').split(' ').slice(1).join(' ')}</span>
                        </h1>
                    )}
                    <p className="text-[10px] font-black uppercase opacity-40 tracking-[0.3em] mt-1">{settings.shopSlogan || 'Artisan Coffee & Spirits'}</p>
                </div>

                {/* Queue number */}
                <div className="flex flex-col items-center mb-8">
                    <span className="text-[10px] font-black opacity-30 tracking-[0.4em] mb-1 uppercase">Số thứ tự của bạn</span>
                    <span className="text-8xl font-black tracking-tighter" style={{ color: settings.themeColor || 'var(--gold)' }}>{String(order.queueNumber)}</span>
                    <p className="text-[10px] font-black text-brand-500 uppercase tracking-widest mt-2">Mã ĐH: {String(order.id)}</p>
                </div>

                <div className="space-y-3 mb-8 text-sm">
                    <div className="flex justify-between items-center bg-gray-50 p-4">
                        <span className="opacity-30 font-black text-[10px] uppercase">Khách:</span>
                        <span className="font-black text-gray-800 tracking-tight">{String(order.customerName)}</span>
                    </div>
                    {order.cartItems?.length > 0 ? (
                        <div className="p-3 bg-gray-50/50 rounded-none space-y-2">
                            <span className="opacity-30 font-black text-[10px] uppercase">Chi tiết:</span>
                            {order.cartItems.map((c, i) => (
                                <div key={i} className="border-b border-gray-100/50 pb-2 last:border-0 last:pb-0">
                                    <div className="flex justify-between items-start">
                                        <span className={`font-black text-[11px] leading-tight flex-1 ${c.isGift ? 'text-green-700' : 'text-gray-800'}`}>
                                            {c.isGift ? <span className="mr-1 text-[9px]"><Gift size={10} className="inline mb-0.5" /></span> : <span className="mr-1 text-[9px] opacity-40">#{i + 1}</span>}
                                            {c.item?.name ? String(c.item.name) : ''}
                                            <span className="text-accent font-bold ml-1">x{Number(c.count)}</span>
                                        </span>
                                        {c.isGift ? (
                                            <span className="font-black text-[11px] text-green-600">0 đ <span className="text-[9px] text-gray-400 line-through ml-1">{formatVND(Number(c.originalPrice || 0) * Number(c.count || 1))}</span></span>
                                        ) : (
                                            <span className="font-black text-[11px]" style={{ color: settings.themeColor || '#F5A623' }}>{formatVND(Number(c.totalPrice || 0) * Number(c.count || 1))}</span>
                                        )}
                                    </div>
                                    <div className="mt-1 flex flex-wrap gap-1">
                                        <span className="text-[8px] opacity-50 uppercase">{String(typeof c.size === 'object' && c.size !== null ? (c.size.label || 'S') : (c.size || 'S'))}</span>
                                        {c.sugar && <span className="text-[8px] opacity-50 uppercase">/ {String(c.sugar)} đường</span>}
                                        {c.ice && <span className="text-[8px] opacity-50 uppercase">/ {String(c.ice)}</span>}
                                        {c.note && <span className="text-[8px] text-accent font-bold w-full mt-0.5 italic">Note: {String(c.note)}</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="p-3 bg-gray-50/50 rounded-none">
                            <span className="opacity-30 font-black text-[10px] uppercase block mb-1">Chi tiết:</span>
                            <span className="font-black text-gray-800">{String(order.itemName || '')}</span>
                        </div>
                    )}
                    {Number(order.discount || 0) > 0 && (
                        <div className="flex justify-between items-center p-3 border-b border-gray-100/50">
                            <span className="opacity-30 font-black text-[10px] uppercase">Tạm tính:</span>
                            <span className="font-black text-gray-800">{formatVND(Number(order.basePrice || order.price + order.discount))}</span>
                        </div>
                    )}
                    {Number(order.discount || 0) > 0 && (
                        <div className="flex justify-between items-center p-3 border-b border-gray-100/50">
                            <span className="opacity-30 font-black text-green-500 text-[10px] uppercase">Khuyến mãi {order.appliedPromoCode ? `(${String(order.appliedPromoCode)})` : ''}:</span>
                            <span className="font-black text-green-500">-{formatVND(Number(order.discount))}</span>
                        </div>
                    )}
                    <div className="flex justify-between items-center p-3">
                        <span className="opacity-30 font-black text-[10px] uppercase">Tổng cộng:</span>
                        <span className="font-black text-xl" style={{ color: settings.themeColor || 'var(--gold)' }}>{formatVND(Number(order.price || 0))}</span>
                    </div>
                </div>

                {/* QR Code for payment - Only show if NOT paid */}
                {(status === 'AWAITING_PAYMENT' || (settings.requirePrepayment !== false && status === 'PENDING')) && settings.bankId && settings.accountNo && (
                    <div className="border-t-2 border-dashed border-gray-200 pt-6 text-center">
                        <p className="text-[9px] font-black uppercase opacity-30 tracking-[0.3em] mb-3">Thanh toán qua ngân hàng</p>
                        
                        {(() => {
                            const transferAmount = order.price * 1000;
                            const transferMemo = `Thanh toan DH ${order.id}`;
                            const BANK_ID = settings.bankId || 'MB';
                            const ACCOUNT_NO = settings.accountNo || '0123456789';
                            const ACCOUNT_NAME = settings.accountName || 'TH-POS';
                            
                            // Always use dynamically generated QR for specific orders to include amount and memo
                            const finalQrUrl = `https://img.vietqr.io/image/${BANK_ID}-${ACCOUNT_NO}-compact2.png?amount=${transferAmount}&addInfo=${encodeURIComponent(transferMemo)}&accountName=${encodeURIComponent(ACCOUNT_NAME)}`;

                            return (
                                <div className="flex flex-col items-center mb-3">
                                    <div className="relative group mb-4">
                                        <div className="block active:scale-95 transition-transform" onClick={() => handleDownloadQR(finalQrUrl)}>
                                            <img
                                                src={finalQrUrl}
                                                alt="QR Thanh toán"
                                                style={{ width: 180, height: 180, borderRadius: 12, border: '1px solid #F3F0EB', objectFit: 'contain' }}
                                                onError={e => { e.target.style.display = 'none'; }}
                                            />
                                        </div>
                                        
                                        <AnimatePresence>
                                            {showCopySuccess && (
                                                <motion.div
                                                    initial={{ opacity: 0, scale: 0.8 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    exit={{ opacity: 0, scale: 0.8 }}
                                                    className="absolute inset-0 flex items-center justify-center bg-white/90 backdrop-blur-sm p-4 text-center z-10 rounded-none"
                                                >
                                                    <div className="flex flex-col items-center gap-2">
                                                        <div className="w-10 h-10 rounded-none bg-green-500 flex items-center justify-center text-white">
                                                            <CheckCircle size={20} />
                                                        </div>
                                                        <p className="text-[10px] font-bold text-green-700 leading-tight">ĐÃ SAO CHÉP</p>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>

                                    <div className="flex flex-col gap-2 w-full max-w-[260px]">
                                        <button 
                                            onClick={() => handleDownloadQR(finalQrUrl)}
                                            className="w-full bg-accent text-white py-3 rounded-none font-black text-[11px] uppercase tracking-widest shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-transform"
                                        >
                                            ↓ TẢI ẢNH QR XUỐNG MÁY
                                        </button>
                                        
                                        <div className="grid grid-cols-2 gap-2 mt-2">
                                            <button 
                                                onClick={() => handleCopyInfo(settings.accountNo || '')}
                                                className="w-full bg-gray-100 text-gray-700 py-2.5 rounded-none font-bold text-[10px] uppercase tracking-wider border border-gray-200 active:bg-gray-200 transition-colors"
                                            >
                                                COPY STK
                                            </button>
                                            <button 
                                                onClick={() => handleCopyInfo(`${transferAmount}`)}
                                                className="w-full bg-gray-100 text-gray-700 py-2.5 rounded-none font-bold text-[10px] uppercase tracking-wider border border-gray-200 active:bg-gray-200 transition-colors"
                                            >
                                                COPY SỐ TIỀN
                                            </button>
                                            <button 
                                                onClick={() => handleCopyInfo(transferMemo)}
                                                className="w-full bg-gray-100 text-gray-700 py-2.5 rounded-none font-bold text-[10px] uppercase tracking-wider border border-gray-200 active:bg-gray-200 transition-colors col-span-2"
                                            >
                                                COPY NỘI DUNG CHUYỂN
                                            </button>
                                        </div>
                                    </div>

                                    <p className="mt-4 text-[10px] font-medium text-amber-800 bg-amber-50 px-3 py-2 border border-amber-100 rounded-none">
                                        Mẹo: Tải ảnh QR xuống máy, sau đó mở ứng dụng ngân hàng và chọn ảnh từ thư viện để quét.
                                    </p>
                                </div>
                            );
                        })()}

                        <p className="text-[9px] font-black opacity-40 tracking-[0.2em] mt-2">
                            {settings.customQrUrl ? settings.shopName : `${settings.bankId} · ${settings.accountNo} · ${settings.accountName}`}
                        </p>
                    </div>
                )}

                {/* Status: PAID / COMPLETED - Persistent Message */}
                {(status === 'PAID' || status === 'COMPLETED') && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="border-t-2 border-dashed border-gray-200 pt-8 pb-4 text-center"
                    >
                        <div className="inline-flex items-center justify-center w-12 h-12 bg-brand-100 text-brand-600 rounded-none mb-4">
                            <CheckCircle size={28} />
                        </div>
                        <h3 className="text-brand-700 font-black text-sm uppercase tracking-wider mb-2">Thanh toán thành công</h3>
                        <p className="text-[10px] font-medium text-gray-400 leading-relaxed max-w-[200px] mx-auto uppercase tracking-tighter">
                            Cảm ơn quý khách!<br />Đơn hàng đang được quán chuẩn bị.
                        </p>
                    </motion.div>
                )}

                {/* Footer */}
                <div className="text-center text-[10px] font-black opacity-30 uppercase space-y-1 mt-8 tracking-[0.3em]">
                    <p>Cảm ơn bạn đã lựa chọn</p>
                    <p>Hẹn gặp lại sớm!</p>
                </div>

                {/* Decorative */}
                <div className="absolute top-0 left-0 w-full flex justify-between opacity-5">
                    {[...Array(12)].map((_, i) => <div key={i} className="w-6 h-6 bg-black -translate-y-3 rotate-45" />)}
                </div>
                <div className="absolute bottom-0 left-0 w-full flex justify-between opacity-5">
                    {[...Array(12)].map((_, i) => <div key={i} className="w-6 h-6 bg-black translate-y-3 rotate-45" />)}
                </div>
            </motion.div>

            <button
                onClick={() => { localStorage.removeItem('currentOrder'); navigate('/order'); }}
                className="w-full bg-white text-gray-400 py-5 font-black text-[10px] uppercase tracking-[0.3em] border border-gray-100 hover:bg-gray-50 transition-all shadow-sm"
            >
                — ĐẶT THÊM MÓN KHÁC —
            </button>

            {/* Thank You Overlay */}
            <AnimatePresence>
                {showThankYou && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[1000] bg-brand-500 flex flex-col items-center justify-center p-8 text-white text-center"
                    >
                        <motion.div
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="bg-white/20 p-10 rounded-none mb-8"
                        >
                            <CheckCircle size={100} className="text-white" />
                        </motion.div>
                        <h2 className="text-4xl font-black mb-4 tracking-tighter">THANH TOÁN THÀNH CÔNG</h2>
                        <p className="text-xl font-bold opacity-90 mb-12">Cảm ơn bạn! Món của bạn đang được chuẩn bị.</p>

                        <div className="bg-white/10 px-8 py-4 rounded-none backdrop-blur-md">
                            <p className="text-xs font-black uppercase tracking-widest opacity-60 mb-1">Tự động quay lại sau</p>
                            <p className="text-3xl font-black">{countdown}s</p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default BillView;
