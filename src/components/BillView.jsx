import React, { useEffect, useState, useMemo } from 'react';
import { formatTime, formatDate, formatDateTime } from '../utils/timeUtils';
// import { motion, AnimatePresence } from 'framer-motion'; /* Not used to save resources */
import { motion } from 'framer-motion'; /* Keep for the main animation */
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
    const qrUrl = `https://img.vietqr.io/image/${BANK_ID}-${ACCOUNT_NO}-compact2.png?amount=${amountVND}&addInfo=${encodeURIComponent(memo)}&accountName=${encodeURIComponent(ACCOUNT_NAME)}`;
    return { qrUrl };
};

// MoMo: ảnh QR tĩnh upload từ app MoMo (chuẩn VietQR/NAPAS)
const getMomoImgSrc = (settings) => {
    const url = settings?.momoQrImageUrl || '';
    if (!url) return null;
    if (url.startsWith('http') || url.startsWith('blob') || url.startsWith('data')) return url;
    return `${SERVER_URL}/${url}`;
};


const BillView = ({ order: propOrder, settings }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [status, setStatus] = useState(propOrder?.status || location.state?.order?.status || 'PENDING');
    const [promotions, setPromotions] = useState([]);
    const [promoCodeInput, setPromoCodeInput] = useState('');
    const [orderNote, setOrderNote] = useState('');
    const [isPromoExpanded, setIsPromoExpanded] = useState(false);

    const [showThankYou, setShowThankYou] = useState(false);
    const [showCopySuccess, setShowCopySuccess] = useState(false);
    const [menu, setMenu] = useState([]);
    const [billQrTab, setBillQrTab] = useState('vietqr'); // 'vietqr' | 'momo'
    const [loyaltyProfile, setLoyaltyProfile] = useState(null);
    const [countdown, setCountdown] = useState(0);

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
    const [isOrderable, setIsOrderable] = useState(false); // false khi đang cooldown
    const [inCooldown, setInCooldown] = useState(false);
    const [cooldownRemain, setCooldownRemain] = useState(0); // phút còn lại
    const [tokenChecked, setTokenChecked] = useState(false);

    // Support both prop-based (from App.jsx) and location.state (from Menu.jsx cart)
    const order = propOrder || location.state?.order;
    const [localCart, setLocalCart] = useState(location.state?.cart || JSON.parse(localStorage.getItem('cart') || '[]'));
    const [editingOption, setEditingOption] = useState(null); // { itemIndex, type, options }
    const [selectedPromoId, setSelectedPromoId] = useState(null);

    // Hiện ô nhập mã khi: có PROMO_CODE đang bật + giỏ hàng có món thuộc chương trình
    // HOẶC khách có voucher cá nhân (specificPhone)
    const hasActivePromoCode = useMemo(() => {
        return (promotions || []).some(p => {
            if (!p.isActive || p.type !== 'PROMO_CODE') return false;
            if (p.startDate && new Date(`${p.startDate}T00:00:00`).getTime() > Date.now()) return false;
            if (p.endDate   && new Date(`${p.endDate}T23:59:59`).getTime()   < Date.now()) return false;
            if (p.specificPhone) return p.specificPhone === (loyaltyProfile?.phone || null);
            const ids = p.applicableItems || [];
            if (ids.length === 0 || ids.includes('ALL')) return true;
            return localCart.some(c => ids.includes(c.item?.id));
        });
    }, [promotions, localCart, loyaltyProfile]);
    const personalVoucher = useMemo(() => (
        (promotions || []).find(p =>
            p.isActive && p.type === 'PROMO_CODE' && p.specificPhone
            && p.specificPhone === loyaltyProfile?.phone
            && p.endDate && new Date(`${p.endDate}T23:59:59`).getTime() >= Date.now()
        )
    ), [promotions, loyaltyProfile]);

    const cartPromoResult = useMemo(() => {
        const promoResult = calculateCartWithPromotions(localCart, promotions, promoCodeInput, menu, selectedPromoId, settings?.enablePromotions, loyaltyProfile?.phone || null);
        
        let taxAmount = 0;
        let finalTotal = promoResult.totalOrderPrice;
        const rate = parseFloat(settings?.taxRate) || 0;
        const preTaxTotal = promoResult.totalOrderPrice;

        if (settings?.taxMode === 'EXCLUSIVE' && rate > 0) {
            taxAmount = Math.floor(preTaxTotal * 1000 * (rate / 100)) / 1000;
            finalTotal = preTaxTotal + taxAmount;
        } else if ((settings?.taxMode === 'INCLUSIVE' || settings?.taxMode === 'DIRECT_INCLUSIVE') && rate > 0) {
            taxAmount = Math.floor(preTaxTotal * 1000 - (preTaxTotal * 1000 / (1 + rate / 100))) / 1000;
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
    }, [localCart, promotions, promoCodeInput, menu, selectedPromoId, settings?.enablePromotions, settings?.taxMode, settings?.taxRate]);

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
        if (order?.customerId && String(order.customerId).length >= 9) {
            fetch(`${SERVER_URL}/api/loyalty/customer/${order.customerId}`)
                .then(r => r.json())
                .then(data => {
                    if (data.success && data.customer) {
                        setLoyaltyProfile(data.customer);
                    }
                }).catch(() => {});
        }
    }, [order?.customerId]);

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
                setIsOrderable(false);
                setTokenChecked(true);
                return;
            }
            try {
                const res = await fetch(`${SERVER_URL}/api/qr-token/check/${savedToken}`);
                const data = await res.json();
                setIsTokenValid(data.isValid);
                setIsOrderable(data.isOrderable !== false); // backward compat
                setInCooldown(data.inCooldown || false);
                setCooldownRemain(data.remainMinutes || 0);
                setTokenChecked(true);
            } catch (e) {
                setTokenChecked(true);
            }
        };
        checkToken();
        // Poll lại mỗi 30s để phát hiện khi cooldown kết thúc
        const pollInterval = setInterval(checkToken, 30_000);
        return () => clearInterval(pollInterval);
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
    // isOrderReady: token checked + (protected disabled hoặc token hợp lệ + không trong cooldown)
    const isOrderReady = tokenChecked && (!settings?.qrProtectionEnabled || (isTokenValid && isOrderable));

    // Cart-based bill (from mobile menu, before submitting order)
    if (!order && localCart) {
        if (localCart.length === 0) {
            return (
                <div className="page-transition p-8 text-center flex flex-col items-center justify-center min-h-[60vh]">
                    <div className="w-20 h-20 bg-gray-50 flex items-center justify-center rounded-xl mb-6">
                        <Coffee size={40} className="text-gray-200" />
                    </div>
                    <p className="text-gray-400 font-black uppercase tracking-widest text-xs mb-8">Giỏ hàng đang trống</p>
                    <button onClick={() => navigate('/order')} className="px-10 py-4 bg-accent text-white font-black text-xs uppercase tracking-widest" >
                        Quay lại chọn món
                    </button>
                </div>
            );
        }



        const submitOrder = async () => {
            if (settings.qrProtectionEnabled && (!qrToken || !isTokenValid)) {
                alert('Mã QR đã hết hạn hoặc không hợp lệ. Vui lòng quét mã mới tại quầy để đặt món.');
                return;
            }

            const { totalOrderPrice, preTaxTotal, taxAmount, taxRate, taxMode, baseTotal, discount, validPromo, processedCart } = cartPromoResult;

            const finalCart = [...processedCart];

            const customerProfile = location.state?.customerProfile;

            const orderData = {
                id: Date.now().toString() + '-' + Math.random().toString(36).substring(2, 9),
                itemName: finalCart.map(c => `${c.item.name} x${c.count}`).join(', '),
                customerName: customerProfile ? customerProfile.name : (localStorage.getItem('customerName') || 'Khách đặt online'),
                customerId: customerProfile ? customerProfile.phone : null,
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
                    } else if (errData.error === 'QR_COOLDOWN') {
                        alert(`⏳ ${errData.message || 'Bạn vừa đặt hàng. Vui lòng đợi một lúc rồi đặt thêm hoặc quét mã QR mới tại quầy.'}`);
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
            <div className="page-transition pb-28 px-4 md:px-8 max-w-2xl mx-auto w-full pt-4">
                <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-400 font-bold text-sm mb-6 mt-2 hover:text-gray-700 transition-colors">
                    <ArrowLeft size={18} /> Quay lại
                </button>
                <h1 className="text-3xl font-black tracking-tighter mb-8">Xác nhận đơn hàng</h1>

                {/* Security Warning */}
                {tokenChecked && settings?.qrProtectionEnabled && !isTokenValid && (
                    <div className="bg-red-50 border-l-4 border-red-500 rounded-r-xl p-5 mb-8 flex items-start gap-4 shadow-sm animate-pulse">
                        <div className="bg-red-500 p-2 text-white rounded-xl">
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
                        const { processedCart } = cartPromoResult;
                        return processedCart.map((c, i) => {
                            const sugarOpts = c.item.sugarOptions?.length ? c.item.sugarOptions : ['0%', '50%', '100%'];
                            const iceOpts = c.item.iceOptions?.length ? c.item.iceOptions : ['Không đá', 'Ít đá', 'Bình thường'];
                            const hasSizes = c.item.sizes?.length > 1;
                            const hasSugar = sugarOpts.length > 1;
                            const hasIce = iceOpts.length > 1;

                            return (
                                <div key={i} className="relative mb-0 shrink-0">
                                    <div
                                        className={`bg-bg-surface p-6 border shadow-sm relative group z-10 transition-colors rounded-2xl overflow-hidden ${c.isGift ? 'border-green-300 bg-green-50/20' : 'border-gray-100'} w-full`}
                                    >

                                    <div className="flex justify-between items-start mb-6">
                                        <div className="flex items-center gap-3 flex-1 min-w-0 pr-3">
                                            {c.isGift ? (
                                                <span className="text-xs font-black text-white bg-green-500 w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm"><Gift size={14}/></span>
                                            ) : (
                                                <span className="text-xs font-black text-white bg-gray-900 w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm">{i + 1}</span>
                                            )}
                                            <h3 className={`font-black uppercase tracking-tighter truncate ${c.isGift ? 'text-green-800 text-lg' : 'text-gray-900 text-xl'}`}>{c.item.name}</h3>
                                        </div>
                                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                            {c.isGift ? (
                                                <>
                                                    <p className="font-black text-gray-400 text-xs line-through">{formatVND(c.originalPrice * c.count)}</p>
                                                    <p className="font-black text-green-600 text-lg">0 đ</p>
                                                </>
                                            ) : (
                                                <p className="font-black text-gray-900 text-lg">{formatVND(c.totalPrice * c.count)}</p>
                                            )}
                                            <div className="flex items-center gap-2">
                                                <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">SL: {c.count}</p>
                                                {!c.isGift && (
                                                    <button
                                                        onClick={() => removeItem(i)}
                                                        className="w-7 h-7 rounded-full bg-red-50 flex items-center justify-center text-red-400 hover:bg-red-500 hover:text-white transition-colors"
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                <div className="flex flex-col gap-3">
                                    {/* Size Dropdown */}
                                    {c.size && (
                                        <div className="relative">
                                            <button
                                                onClick={() => hasSizes && setEditingOption(editingOption?.id === `size-${i}` ? null : { id: `size-${i}`, index: i, type: 'size', opts: c.item.sizes })}
                                                className={`flex items-center gap-2 px-5 py-4 w-full text-sm font-black uppercase tracking-wider transition-all border rounded-xl ${hasSizes ? 'bg-gray-50 border-gray-200 hover:border-accent' : 'bg-gray-50/50 border-transparent'}`}
                                            >
                                                Size: {String(typeof c.size === 'object' && c.size !== null ? (c.size.label || 'S') : (c.size || 'S'))} {hasSizes && <ChevronDown size={16} className="text-gray-400 ml-auto" />}
                                            </button>
                                            {editingOption?.id === `size-${i}` && (
                                                <div className="absolute top-full left-0 mt-2 bg-bg-surface border border-gray-200 shadow-2xl z-50 min-w-full rounded-2xl overflow-hidden">
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
                                            className={`flex items-center gap-2 px-5 py-4 w-full text-sm font-black uppercase tracking-wider transition-all border rounded-xl ${hasSugar ? 'bg-gray-50 border-gray-200 hover:border-accent' : 'bg-gray-50/50 border-transparent'}`}
                                        >
                                            Đường: {c.sugar} {hasSugar && <ChevronDown size={16} className="text-gray-400 ml-auto" />}
                                        </button>
                                        {editingOption?.id === `sugar-${i}` && (
                                            <div className="absolute top-full left-0 mt-2 bg-bg-surface border border-gray-200 shadow-2xl z-50 min-w-full rounded-2xl overflow-hidden">
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
                                            className={`flex items-center gap-2 px-5 py-4 w-full text-sm font-black uppercase tracking-wider transition-all border rounded-xl ${hasIce ? 'bg-gray-50 border-gray-200 hover:border-accent' : 'bg-gray-50/50 border-transparent'}`}
                                        >
                                            Đá: {c.ice} {hasIce && <ChevronDown size={16} className="text-gray-400 ml-auto" />}
                                        </button>
                                        {editingOption?.id === `ice-${i}` && (
                                            <div className="absolute top-full left-0 mt-2 bg-bg-surface border border-gray-200 shadow-2xl z-50 min-w-full rounded-2xl overflow-hidden">
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
                                        <div className="flex flex-wrap gap-2 mt-2 pl-1">
                                            {c.addons.map((a, ai) => (
                                                <div key={ai} className="flex items-center gap-2 bg-accent-light/50 text-accent pl-4 pr-1.5 py-1 transition-all group/addon border border-accent/20 rounded-full">
                                                    <span className="text-[11px] font-black uppercase tracking-wider">+{a.label}</span>
                                                    <button
                                                        onClick={() => removeAddon(i, ai)}
                                                        className="w-7 h-7 bg-white rounded-full flex items-center justify-center text-accent/60 hover:text-red-500 hover:bg-red-50 transition-colors shadow-sm"
                                                    >
                                                        <X size={14} strokeWidth={3} />
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
                                    </div>
                            </div>
                        );
                    });
                })()}
                </div>

                {/* Total */}
                <div className="bg-bg-surface p-8 border border-gray-100 shadow-xl rounded-3xl mb-8">
                    <div className="mb-6">
                        {(() => {
                            const { validPromo, availablePromotions } = cartPromoResult;
                            
                            return (
                                <>
                                    <div className="mb-4">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] block mb-2">Ghi chú đơn hàng / Lời nhắn</label>
                                        <textarea
                                            value={orderNote}
                                            onChange={(e) => setOrderNote(e.target.value)}
                                            placeholder="Giao tận bàn số 5, mang đi, gọi khi đến..."
                                            className="w-full px-5 py-4 bg-gray-50 border border-gray-200 focus:border-accent rounded-xl font-medium text-gray-900 outline-none text-[13px] resize-none h-20 shadow-sm"
                                        />
                                    </div>
                                    {/* Nhập mã KM — chỉ hiện khi có promo nhập mã đang bật */}
                                    {hasActivePromoCode && (<>
                                    {/* Hint voucher cá nhân */}
                                    {personalVoucher && !validPromo && (
                                        <div
                                            onClick={() => { setPromoCodeInput(personalVoucher.code); setIsPromoExpanded(true); }}
                                            className="cursor-pointer mb-2 flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl"
                                        >
                                            <span style={{ fontSize: 18 }}>🎁</span>
                                            <div style={{ flex: 1 }}>
                                                <p className="text-xs font-black text-amber-800 mb-0.5">Bạn có voucher cá nhân!</p>
                                                <p className="text-[11px] font-bold text-amber-600">
                                                    Mã <span className="font-black tracking-widest">{personalVoucher.code}</span>
                                                    {' '}— Giảm {personalVoucher.discountValue}{personalVoucher.discountType === 'PERCENT' ? '%' : 'k'}
                                                </p>
                                            </div>
                                            <span className="text-xs font-black text-brand-600 underline">Áp dụng</span>
                                        </div>
                                    )}

                                    <div className="flex items-center gap-3 mb-3">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] w-20 shrink-0">MÃ KM</label>
                                        <div className="flex-1 relative">
                                            <div 
                                                onClick={() => setIsPromoExpanded(!isPromoExpanded)}
                                                className={`w-full px-5 py-4 border rounded-xl flex justify-between items-center cursor-pointer transition-all shadow-sm ${validPromo ? 'bg-accent/5 border-accent' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'}`}
                                            >
                                                <span className={`text-[13px] font-bold whitespace-nowrap overflow-hidden text-ellipsis ${validPromo ? 'text-accent' : 'text-gray-500'}`}>
                                                    {validPromo ? `✓ ${validPromo.code || validPromo.name}` : 'Nhập mã KM (nếu có)'}
                                                </span>
                                                {isPromoExpanded ? <ChevronUp size={16} className={validPromo ? 'text-accent' : 'text-gray-400'} /> : <ChevronDown size={16} className={validPromo ? 'text-accent' : 'text-gray-400'} />}
                                            </div>
                                        </div>
                                    </div>

                                    {isPromoExpanded && (
                                        <div className="overflow-hidden pl-[92px] fade-in">
                                            <input 
                                                    type="text" 
                                                    value={promoCodeInput}
                                                    onChange={e => {
                                                        setPromoCodeInput(e.target.value.toUpperCase());
                                                        setSelectedPromoId(null);
                                                    }}
                                                    placeholder="Nhập mã giảm giá..."
                                                    className="w-full px-5 py-4 bg-white border border-gray-200 focus:border-accent rounded-xl font-bold text-gray-900 outline-none transition-all uppercase placeholder:normal-case placeholder:font-normal mb-2 text-sm shadow-inner"
                                                />
                                                {promoCodeInput && availablePromotions.length === 0 && <p className="text-xs font-bold text-red-500 mb-2">Mã không hợp lệ hoặc chưa đủ điều kiện</p>}
                                                {availablePromotions.length > 0 && (
                                                    <div className="flex flex-col gap-2">
                                                        {availablePromotions.map(ap => {
                                                            const isSelected = validPromo?.id === ap.promo.id;
                                                            return (
                                                                <label key={ap.promo.id} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${isSelected ? 'border-accent bg-accent/5' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
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
                                        </div>
                                    )}
                                    </>)}
                                </>
                            );
                        })()}
                    </div>
                    {(() => {
                        const { totalOrderPrice, baseTotal, discount, giftMessages, suggestedGifts } = cartPromoResult;
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
                                                <div key={gIdx} className="flex justify-between items-center bg-brand-50/80 p-2 rounded-xl border border-brand-100/50 group-hover:bg-brand-100/50 transition-colors">
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
                    {status === 'AWAITING_PAYMENT' && (
                        <div className="bg-accent-light py-4 px-6 text-center rounded-xl mb-2">
                            <p className="text-[10px] text-accent font-black uppercase tracking-widest italic">Mã QR thanh toán kèm ID đơn hàng sẽ xuất hiện ở bước tiếp theo.</p>
                        </div>
                    )}
                    {(settings.requirePrepayment === false || status === 'PENDING') && (
                        <div className="bg-green-50 py-4 px-6 text-center rounded-xl mb-2">
                            <p className="text-[10px] font-black text-green-700 uppercase tracking-widest italic">Bạn có thể thanh toán trước qua QR, hoặc thanh toán sau tại thẻ bàn.</p>
                        </div>
                    )}
                </div>

                {/* Cooldown Banner */}
                {tokenChecked && settings?.qrProtectionEnabled && isTokenValid && inCooldown && (
                    <div className="bg-orange-50 border-l-4 border-orange-500 rounded-r-xl p-5 mb-8 flex items-start gap-4 shadow-sm">
                        <div className="bg-orange-500 p-2 text-white rounded-xl text-lg">⏳</div>
                        <div>
                            <p className="text-orange-800 font-black text-xs uppercase tracking-widest mb-1">Đã đặt hàng gần đây</p>
                            <p className="text-orange-600 text-[11px] font-bold leading-relaxed">
                                Vui lòng đợi thêm <strong>{cooldownRemain} phút</strong> hoặc quét mã QR mới tại quầy để tiếp tục đặt hàng. Điều này giúp tránh đặt trùng lặp.
                            </p>
                        </div>
                    </div>
                )}

                {/* Order confirmation button */}
                <div className="mt-auto space-y-8 pt-12">
                    <button
                        onClick={submitOrder}
                        disabled={!isOrderReady}
                        className={`w-full py-6 font-black text-xl shadow-2xl transition-all active:scale-95 border border-transparent rounded-2xl ${!isOrderReady ? 'bg-gray-100 text-gray-400' : 'bg-btn-bg text-btn-text shadow-brand-500/20 hover:scale-[1.02] hover:opacity-90'}`}
                    >
                        {!tokenChecked ? 'ĐANG KIỂM TRA...' : inCooldown ? `⏳ ĐỢI ${cooldownRemain} PHÚT` : isOrderReady ? 'ĐẶT HÀNG NGAY' : 'VUI LÒNG QUÉT QR...'}
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
            <div className="text-center p-12 bg-bg-surface border border-gray-100 shadow-sm rounded-3xl mt-10">
                <p className="text-gray-400 font-black uppercase tracking-widest text-xs">Chưa có order nào.</p>
                <button onClick={() => navigate('/order')} className="mt-8 px-10 py-5 bg-btn-bg text-btn-text rounded-2xl font-black text-sm uppercase tracking-widest hover:scale-[1.02] transition-transform">QUAY LẠI CHỌN MÓN</button>
            </div>
        );
    }

    return (
        <div className="fade-in space-y-8 page-transition px-4 md:px-8 max-w-2xl mx-auto w-full pb-16 pt-4">
            {/* Back button */}
            <button onClick={() => navigate('/order')} className="flex items-center gap-2 text-gray-400 font-bold text-sm pt-2 hover:text-gray-700 transition-colors">
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

            {/* Thẻ Thành Viên (Khách hàng theo dõi) */}
            {loyaltyProfile && (
                <div style={{
                    background: 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)',
                    borderRadius: '24px', padding: '20px',
                    border: '1px solid #C7D2FE',
                    boxShadow: '0 8px 32px rgba(79, 70, 229, 0.1)',
                    marginBottom: '20px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{
                            width: 50, height: 50, borderRadius: '16px',
                            background: 'linear-gradient(135deg, #6366F1, #4F46E5)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)', flexShrink: 0
                        }}>
                            <Sparkles size={24} color="#fff" />
                        </div>
                        <div style={{ flex: 1 }}>
                            <p style={{ fontSize: 13, fontWeight: 900, color: '#4338CA', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 2px' }}>
                                Điểm thành viên
                            </p>
                            <h3 style={{ fontSize: 24, fontWeight: 900, color: '#111827', margin: 0, letterSpacing: '-0.02em' }}>
                                {loyaltyProfile.points} <span style={{ fontSize: 14, fontWeight: 700, color: '#6B7280' }}>pts</span>
                            </h3>
                        </div>
                        <button onClick={() => navigate('/loyalty')} style={{
                            background: '#fff', border: '1px solid #E5E7EB', borderRadius: '12px',
                            padding: '8px 12px', fontSize: 12, fontWeight: 800, color: '#4F46E5',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.05)', cursor: 'pointer'
                        }}>
                            Tra cứu
                        </button>
                    </div>
                    
                    <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                        <div style={{ flex: 1, background: 'rgba(255,255,255,0.6)', borderRadius: '12px', padding: '10px', textAlign: 'center' }}>
                            <p style={{ fontSize: 11, fontWeight: 800, color: '#6B7280', textTransform: 'uppercase', margin: '0 0 4px' }}>Hạng Mức</p>
                            <p style={{ fontSize: 15, fontWeight: 900, color: '#4F46E5', margin: 0 }}>
                                {loyaltyProfile.tier === 'Kim Cương' ? '💎' : loyaltyProfile.tier === 'Vàng' ? '🥇' : '🥈'} {loyaltyProfile.tier}
                            </p>
                        </div>
                        {(loyaltyProfile.streak > 1) && (
                            <div style={{ flex: 1, background: 'rgba(255,255,255,0.6)', borderRadius: '12px', padding: '10px', textAlign: 'center' }}>
                                <p style={{ fontSize: 11, fontWeight: 800, color: '#6B7280', textTransform: 'uppercase', margin: '0 0 4px' }}>Chuỗi Ghé Quán</p>
                                <p style={{ fontSize: 15, fontWeight: 900, color: '#D97706', margin: 0 }}>
                                    🔥 {loyaltyProfile.streak} Ngày
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Bill card */}
            <motion.div
                initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                className="bg-bg-surface text-gray-900 p-8 shadow-2xl font-mono relative overflow-hidden border border-gray-100 rounded-3xl"
            >
                {/* Header */}
                <div className="text-center border-b-2 border-dashed border-gray-200 pb-6 mb-6">
                    {settings.headerImageUrl ? (
                        <div className="flex justify-center mb-2">
                            <img src={getImageUrl(settings.headerImageUrl)} alt={settings.shopName} className="h-12 object-contain" />
                        </div>
                    ) : (
                        <h1 className="text-3xl font-black tracking-tighter mb-1">
                            {(settings?.shopName || 'TH POS').split(' ')[0]} <span className="text-brand-600">{(settings?.shopName || '').split(' ').slice(1).join(' ')}</span>
                        </h1>
                    )}
                    <p className="text-[10px] font-black uppercase opacity-40 tracking-[0.3em] mt-1">{settings.shopSlogan || 'Artisan Coffee & Spirits'}</p>
                </div>

                {/* Queue number */}
                <div className="flex flex-col items-center mb-8">
                    <span className="text-[10px] font-black opacity-30 tracking-[0.4em] mb-1 uppercase">Số thứ tự của bạn</span>
                    <span className="text-8xl font-black tracking-tighter text-brand-500">{String(order.queueNumber)}</span>
                    <p className="text-[10px] font-black text-brand-500 uppercase tracking-widest mt-2">Mã ĐH: {String(order.id)}</p>
                </div>

                <div className="space-y-3 mb-8 text-sm">
                    <div className="flex justify-between items-center bg-gray-50 p-4">
                        <span className="opacity-30 font-black text-[10px] uppercase">Khách:</span>
                        <span className="font-black text-gray-800 tracking-tight">{String(order.customerName)}</span>
                    </div>
                    {order.cartItems?.length > 0 ? (
                        <div className="p-3 bg-gray-50/50 rounded-xl space-y-2">
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
                                            <span className="font-black text-[11px] text-brand-600">{formatVND(Number(c.totalPrice || 0) * Number(c.count || 1))}</span>
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
                        <div className="p-3 bg-gray-50/50 rounded-xl">
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
                        <span className="font-black text-xl text-brand-500">{formatVND(Number(order.price || 0))}</span>
                    </div>
                </div>

                {/* QR Code for payment - Only show if NOT paid */}
                {(status === 'AWAITING_PAYMENT' || status === 'PENDING') && (settings.bankId || (settings?.momoEnabled && settings?.momoPhone)) && (
                    <div className="border-t-2 border-dashed border-gray-200 pt-6 text-center">
                        <p className="text-[9px] font-black uppercase opacity-60 tracking-[0.3em] mb-1">Thanh toán qua ngân hàng / Ví điện tử</p>
                        {status === 'PENDING' && <p className="text-[9px] font-medium text-gray-400 mb-3">(Hoặc thanh toán bằng tiền mặt tại quầy)</p>}

                        {/* Tab switcher MoMo / VietQR */}
                        {settings?.momoEnabled && settings?.momoPhone && settings?.bankId && (
                            <div style={{ display: 'flex', borderRadius: '999px', overflow: 'hidden', border: '1.5px solid #E2E8F0', marginBottom: '12px', maxWidth: '240px', margin: '0 auto 12px' }}>
                                <button
                                    onClick={() => setBillQrTab('vietqr')}
                                    style={{
                                        flex: 1, padding: '8px 12px', fontSize: '10px', fontWeight: 900,
                                        background: billQrTab === 'vietqr' ? '#0066CC' : '#F8FAFC',
                                        color: billQrTab === 'vietqr' ? '#fff' : '#94A3B8',
                                        border: 'none', cursor: 'pointer',
                                    }}
                                >
                                    🏦 VietQR
                                </button>
                                <button
                                    onClick={() => setBillQrTab('momo')}
                                    style={{
                                        flex: 1, padding: '8px 12px', fontSize: '10px', fontWeight: 900,
                                        background: billQrTab === 'momo' ? '#A50064' : '#F8FAFC',
                                        color: billQrTab === 'momo' ? '#fff' : '#94A3B8',
                                        border: 'none', borderLeft: '1.5px solid #E2E8F0', cursor: 'pointer',
                                    }}
                                >
                                    💜 MoMo
                                </button>
                            </div>
                        )}

                        {(() => {
                            const billHasMomo = !!(settings?.momoEnabled && settings?.momoQrImageUrl);

                            const currentTab = billHasMomo && settings?.bankId ? billQrTab : (billHasMomo ? 'momo' : 'vietqr');

                            if (currentTab === 'momo' && billHasMomo) {
                                // MoMo QR — ảnh tĩnh từ app MoMo
                                const momoSrc = getMomoImgSrc(settings);
                                return (
                                    <div className="flex flex-col items-center mb-3">
                                        <div style={{ padding: '10px', background: '#fff', border: '2px solid #F0D0E8', borderRadius: '16px', marginBottom: '12px' }}>
                                            {momoSrc ? (
                                                <img
                                                    src={momoSrc}
                                                    alt="QR MoMo"
                                                    style={{ width: '180px', height: '180px', objectFit: 'contain' }}
                                                />
                                            ) : (
                                                <p style={{ color: '#E2C0D8', fontSize: '12px', fontWeight: 700 }}>Upload QR từ app MoMo<br/>trong mục Cài dặt</p>
                                            )}
                                        </div>
                                        <p style={{ fontSize: '11px', color: '#A50064', fontWeight: 900, marginBottom: '6px' }}>📱 {settings.momoPhone || 'MoMo'}</p>
                                        <p style={{ fontSize: '9px', color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Quét bằng bất kỳ app nào</p>
                                    </div>
                                );
                            }

                            // VietQR Tab (default)
                            const transferAmount = order.price * 1000;
                            const transferMemo = `Thanh toan DH ${order.id}`;
                            const BANK_ID = settings.bankId || 'MB';
                            const ACCOUNT_NO = settings.accountNo || '0123456789';
                            const ACCOUNT_NAME = settings.accountName || 'TH-POS';
                            const finalQrUrl = `https://img.vietqr.io/image/${BANK_ID}-${ACCOUNT_NO}-compact2.png?amount=${transferAmount}&addInfo=${encodeURIComponent(transferMemo)}&accountName=${encodeURIComponent(ACCOUNT_NAME)}`;

                            return (
                                <div className="flex flex-col items-center mb-3">
                                    <div className="relative group mb-4">
                                        <div className="block active:scale-95 transition-transform" onClick={() => handleDownloadQR(finalQrUrl)}>
                                            <img
                                                src={finalQrUrl}
                                                alt="QR Thanh toán"
                                                className="w-[180px] h-[180px] rounded-xl border border-[#F3F0EB] object-contain"
                                                onError={e => { e.target.style.display = 'none'; }}
                                            />
                                        </div>

                                        <>
                                            {showCopySuccess && (
                                                <div
                                                    className="absolute inset-0 flex items-center justify-center bg-white/90 backdrop-blur-sm p-4 text-center z-10 rounded-xl"
                                                >
                                                    <div className="flex flex-col items-center gap-2">
                                                        <div className="w-10 h-10 rounded-xl bg-green-500 flex items-center justify-center text-white">
                                                            <CheckCircle size={20} />
                                                        </div>
                                                        <p className="text-[10px] font-bold text-green-700 leading-tight">ĐÃ SAO CHÉP</p>
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    </div>

                                    <div className="flex flex-col gap-2 w-full max-w-[260px]">
                                        <button
                                            onClick={() => handleDownloadQR(finalQrUrl)}
                                            className="w-full bg-btn-bg text-btn-text py-3 rounded-xl font-black text-[11px] uppercase tracking-widest shadow-brand-500/20 shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-transform"
                                        >
                                            ↓ TẢI ẢNH QR XUỐNG MÁY
                                        </button>

                                        <div className="grid grid-cols-2 gap-2 mt-2">
                                            <button
                                                onClick={() => handleCopyInfo(settings.accountNo || '')}
                                                className="w-full bg-gray-100 text-gray-700 py-2.5 rounded-xl font-bold text-[10px] uppercase tracking-wider border border-gray-200 active:bg-gray-200 transition-colors"
                                            >
                                                COPY STK
                                            </button>
                                            <button
                                                onClick={() => handleCopyInfo(`${transferAmount}`)}
                                                className="w-full bg-gray-100 text-gray-700 py-2.5 rounded-xl font-bold text-[10px] uppercase tracking-wider border border-gray-200 active:bg-gray-200 transition-colors"
                                            >
                                                COPY SỐ TIỀN
                                            </button>
                                            <button
                                                onClick={() => handleCopyInfo(transferMemo)}
                                                className="w-full bg-gray-100 text-gray-700 py-2.5 rounded-xl font-bold text-[10px] uppercase tracking-wider border border-gray-200 active:bg-gray-200 transition-colors col-span-2"
                                            >
                                                COPY NỘI DUNG CHUYỂN
                                            </button>
                                        </div>
                                    </div>

                                    <p className="mt-4 text-[10px] font-medium text-amber-800 bg-amber-50 px-3 py-2 border border-amber-100 rounded-xl">
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
                        <div className="inline-flex items-center justify-center w-12 h-12 bg-brand-100 text-brand-600 rounded-xl mb-4">
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
                className="w-full bg-bg-surface text-gray-400 py-5 font-black text-[10px] uppercase tracking-[0.3em] border border-gray-100 hover:bg-gray-50 transition-all shadow-sm rounded-2xl"
            >
                — ĐẶT THÊM MÓN KHÁC —
            </button>

            {/* Thank You Overlay */}
            <>
                {showThankYou && (
                    <div
                        className="fixed inset-0 z-[1000] bg-brand-500 flex flex-col items-center justify-center p-8 text-white text-center"
                    >
                        <div
                            className="bg-white/20 p-10 rounded-3xl mb-8"
                        >
                            <CheckCircle size={100} className="text-white" />
                        </div>
                        <h2 className="text-4xl font-black mb-4 tracking-tighter">THANH TOÁN THÀNH CÔNG</h2>
                        <p className="text-xl font-bold opacity-90 mb-12">Cảm ơn bạn! Món của bạn đang được chuẩn bị.</p>

                        <div className="bg-white/10 px-8 py-5 rounded-3xl backdrop-blur-md">
                            <p className="text-xs font-black uppercase tracking-widest opacity-60 mb-1">Tự động quay lại sau</p>
                            <p className="text-3xl font-black">{countdown}s</p>
                        </div>
                    </div>
                )}
            </>
        </div>
    );
};

export default BillView;
