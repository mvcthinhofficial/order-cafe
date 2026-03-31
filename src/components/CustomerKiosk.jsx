import React, { useState, useEffect, useRef, useMemo } from 'react';
import { formatTime, formatDate, formatDateTime, getDateStr } from '../utils/timeUtils';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X, CheckCircle, CreditCard, Coffee, Sparkles, QrCode, Camera, Gift, ChevronDown, ChevronUp, Trash2, BookOpen, History
} from 'lucide-react';
import { SERVER_URL, getImageUrl } from '../api.js';
import { calculateCartWithPromotions } from '../utils/promotionEngine';
import IceLevelIcon from './IceLevelIcon';
import SugarLevelIcon from './SugarLevelIcon';
import SharedCustomizationModal from './SharedCustomizationModal';
import { QRCodeCanvas } from 'qrcode.react';
import StaffQrKiosk from './StaffQrKiosk';

const formatVND = (price) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(price * 1000);
};


// Category color mapping for indicator dots
const CATEGORY_COLORS = {
    'TRUYỀN THỐNG': '#D97706',
    'PHA MÁY': '#2563EB',
    'TRÀ': '#059669',
};
const getCategoryColor = (cat) => CATEGORY_COLORS[cat?.toUpperCase()] || '#6B7280';

const CustomerKiosk = () => {
    const [menu, setMenu] = useState([]);
    const [categories, setCategories] = useState([]);
    const [activeCategory, setActiveCategory] = useState('TẤT CẢ');
    const [loading, setLoading] = useState(true);
    const [promotions, setPromotions] = useState([]);
    const [promoCodeInput, setPromoCodeInput] = useState('');
    const [orderNote, setOrderNote] = useState('');
    const [isPromoExpanded, setIsPromoExpanded] = useState(false);
    
    // ----------- NEW STATE FOR ORDERING -----------
    const [cart, setCart] = useState([]);
    const [selectedItem, setSelectedItem] = useState(null);
    const [showCartModal, setShowCartModal] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showOrderSentSuccess, setShowOrderSentSuccess] = useState(false);
    const [pendingOrders, setPendingOrders] = useState([]);
    const [debtOrders, setDebtOrders] = useState([]);
    const [activeDebtTab, setActiveDebtTab] = useState(false);
    const [showPendingOrdersModal, setShowPendingOrdersModal] = useState(false);
    const [editingOption, setEditingOption] = useState(null);
    
    // --- QR PAYMENT & RECEIPT CAPTURE ---
    const [tableNumber, setTableNumber] = useState('');
    const [paymentQrOrder, setPaymentQrOrder] = useState(null);
    const fileInputRef = useRef(null);
    const [uploadingOrderId, setUploadingOrderId] = useState(null);

    const submitPaymentReceipt = async (orderId, base64) => {
        try {
            const res = await fetch(`${SERVER_URL}/api/orders/confirm-payment/${orderId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paymentReceipt: base64 })
            });
            if (res.ok) {
                setUploadingOrderId(null);
                if (paymentQrOrder?.id === orderId) setPaymentQrOrder(null);
                fetchData(); // reload pending orders
                alert('Xác nhận thanh toán và lưu ảnh bill thành công!');
            } else {
                alert('Lỗi xác nhận thanh toán!');
            }
        } catch (err) {
            alert('Lỗi kết nối server!');
        }
    };

    const handleCaptureReceipt = (e) => {
        const file = e.target.files[0];
        if (!file || !uploadingOrderId) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const max = 800; 
                if (width > height && width > max) {
                    height *= max / width;
                    width = max;
                } else if (height > max) {
                    width *= max / height;
                    height = max;
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                // Nén JPEG 30% để giảm thiểu dung lượng lưu trữ (rất thấp nhưng đủ xem số)
                const base64 = canvas.toDataURL('image/jpeg', 0.3); 
                
                submitPaymentReceipt(uploadingOrderId, base64);
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };
    // ----------------------------------------------

    const [settings, setSettings] = useState({ shopName: 'TH-POS', shopSlogan: 'Cần là có ngay.', bankId: 'TCB', accountNo: '1919729292', accountName: 'TH-POS', customQrUrl: null, requirePrepayment: true, qrProtectionEnabled: false });

    const sortedCategories = useMemo(() => {
        const order = settings?.categoryOrder || [];
        return [...categories].sort((a, b) => {
            const idxA = order.indexOf(a);
            const idxB = order.indexOf(b);
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;
            return a.localeCompare(b);
        });
    }, [categories, settings?.categoryOrder]);

    const [showQrModal, setShowQrModal] = useState(false);
    const [qrInfo, setQrInfo] = useState({ orderUrl: '', token: '' });
    const [showPaymentSuccess, setShowPaymentSuccess] = useState(false);

    const prevPosSessionRef = useRef(null);
    const initialLoadRef = useRef(true);

    const settingsRef = useRef(settings);
    useEffect(() => { settingsRef.current = settings; }, [settings]);

    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                if (showQrModal) setShowQrModal(false);
                if (selectedItem) setSelectedItem(null);
                if (showCartModal) setShowCartModal(false);
                if (showPendingOrdersModal) setShowPendingOrdersModal(false);
            }
        };
        window.addEventListener('keydown', handleEsc, { capture: true });
        return () => window.removeEventListener('keydown', handleEsc, { capture: true });
    }, [showQrModal, selectedItem, showCartModal]);



    const fetchQrInfo = async () => {
        try {
            const res = await fetch(`${SERVER_URL}/api/qr-info`);
            const data = await res.json();
            if (data.success) {
                setQrInfo(data);

                // Detect Payment Success explicitly from backend signal
                if (data.lastPaidKioskOrder) {
                    if (initialLoadRef.current) {
                        prevPosSessionRef.current = data.lastPaidKioskOrder.timestamp;
                        initialLoadRef.current = false;
                    } else if (data.lastPaidKioskOrder.timestamp !== prevPosSessionRef.current) {
                        setShowPaymentSuccess(true);
                        setTimeout(() => setShowPaymentSuccess(false), 5000);
                        prevPosSessionRef.current = data.lastPaidKioskOrder.timestamp;
                    }
                } else {
                    initialLoadRef.current = false;
                }

                // Hiển thị QR Modal (Dành cho POS hoặc Đặt món từ xa)
                if (data.posCheckoutSession) {
                    setShowQrModal(true);
                } else {
                    // Don't auto-dismiss if success is showing
                    if (!showPaymentSuccess) {
                        setShowQrModal(!!data.showQrOnKiosk);
                    }
                }
            }
        } catch (err) { console.error("Lỗi lấy thông tin QR:", err); }
    };

    useEffect(() => {
        fetchQrInfo();
        const interval = setInterval(fetchQrInfo, 1000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const res = await fetch(`${SERVER_URL}/api/settings`);
                if (res.ok) {
                    const data = await res.json();
                    setSettings(prev => ({ ...prev, ...data }));
                }
            } catch (err) { console.error(err); }
        };
        fetchSettings();
        const interval = setInterval(fetchSettings, 10000); // Poll every 10s
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const fetchPendingOrders = async () => {
            try {
                const res = await fetch(`${SERVER_URL}/api/order/status/queue`);
                if (res.ok) {
                    const data = await res.json();
                    setPendingOrders(data);
                }
                const resDebt = await fetch(`${SERVER_URL}/api/orders?debt=true`);
                if (resDebt.ok) {
                    const debtData = await resDebt.json();
                    setDebtOrders(debtData);
                }
            } catch (err) { console.error(err); }
        };
        fetchPendingOrders();
        const interval = setInterval(fetchPendingOrders, 3000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const pollKioskEvents = async () => {
            try {
                const res = await fetch(`${SERVER_URL}/api/kiosk/events`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.forceKioskQrDebtOrderId) {
                        // Find the corresponding debt order and open QR
                        // We must fetch it directly or rely on debtOrders state
                        const targetId = data.forceKioskQrDebtOrderId;
                        // To avoid stale closure on debtOrders, we just rely on the API clearing it.
                        // We set it inside a functional state update if needed, but since this runs independently,
                        // we'll just find it from an endpoint or the latest state.
                        
                        // We don't have access to the *latest* debtOrders without risking stale closures inside useEffect.
                        // Wait, we can fetch that specific order directly if needed:
                        const orderRes = await fetch(`${SERVER_URL}/api/orders?id=${targetId}`);
                        if (orderRes.ok) {
                            const orderList = await orderRes.json();
                            const targetOrder = orderList.find(o => o.id === targetId);
                            if (targetOrder && !targetOrder.isPaid) {
                                setActiveDebtTab(true);
                                setShowPendingOrdersModal(true);
                                setPaymentQrOrder(targetOrder);
                                // Acknowledge to server that we got it
                                await fetch(`${SERVER_URL}/api/kiosk/clear-qr`, { method: 'POST' });
                            }
                        }
                    }
                }
            } catch (err) {}
        };
        const interval = setInterval(pollKioskEvents, 2000);
        return () => clearInterval(interval);
    }, []);

    const getVietQR = (amount, orderRef = '') => {
        const BANK_ID = settings.bankId || 'MB';
        const ACCOUNT_NO = settings.accountNo || '0123456789';
        const ACCOUNT_NAME = settings.accountName || 'TH-POS';
        const amountVND = Math.round(amount * 1000);
        const memo = orderRef ? `DH ${orderRef}` : (settings.shopName || 'Cafe Coffee');
        const desc = encodeURIComponent('Thanh toan ' + memo);
        return `https://img.vietqr.io/image/${BANK_ID}-${ACCOUNT_NO}-compact2.png?amount=${amountVND}&addInfo=${desc}&accountName=${encodeURIComponent(ACCOUNT_NAME)}`;
    };
    const [completedQueue, setCompletedQueue] = useState([]);

    const scrollContainerRef = useRef(null);
    const categoryRefs = useRef({});

    // Detect screen orientation and calculate optimal columns
    const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });
    useEffect(() => {
        const handleResize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const isLandscape = windowSize.width > windowSize.height;
    const isMobile = windowSize.width < 500;
    const aspectRatio = windowSize.width / windowSize.height;

    // Dynamic columns: 
    // 6 for wide landscape, 4 for standard landscape, 
    // 3 for normal portrait, 2 for narrow portrait (9:16)
    let cols = 2;
    if (isLandscape) {
        cols = aspectRatio > 1.8 ? 6 : 4;
    } else {
        cols = aspectRatio < 0.6 ? 2 : 3;
    }

    useEffect(() => {
        fetchData();
        // Giảm xuống 5s để SL nguyên liệu cập nhật nhanh hơn sau khi đặt đơn
        const interval = setInterval(fetchData, 5000);
        return () => clearInterval(interval);
    }, []);

    const fetchData = async () => {
        try {
            const res = await fetch(`${SERVER_URL}/api/menu`);
            const data = await res.json();
            const drinkData = data.filter(i => {
                const cat = (i.category || '').toLowerCase();
                return !cat.includes('food') && !cat.includes('ăn') && !cat.includes('bánh');
            });
            setMenu(drinkData);
            const cats = [...new Set(drinkData.map(i => i.category))];
            setCategories(cats);

            const promoRes = await fetch(`${SERVER_URL}/api/promotions`);
            if (promoRes.ok) {
                setPromotions(await promoRes.json());
            }

            setLoading(false);
        } catch (err) { console.error(err); }
    };



    const scrollToCategory = (cat) => {
        setActiveCategory(cat);
        const el = categoryRefs.current[cat];
        if (el) {
            const container = scrollContainerRef.current;
            if (container) {
                container.scrollTo({
                    top: el.offsetTop - 10,
                    behavior: 'smooth'
                });
            }
        }
    };

    // Poll for completed order notifications
    useEffect(() => {
        const poll = setInterval(async () => {
            try {
                const r = await fetch(`${SERVER_URL}/api/notifications/completed`);
                const data = await r.json();
                if (data.length > 0) {
                    setCompletedQueue(data);
                    // Dismiss notifications
                    for (const n of data) {
                        await fetch(`${SERVER_URL}/api/notifications/dismiss/${n.queueNumber}`, { method: 'POST' });
                    }
                    setTimeout(() => setCompletedQueue([]), 8000);
                }
            } catch (e) { /* ignore */ }
        }, 5000);
        return () => clearInterval(poll);
    }, []);

    // ─── KIOSK ORDERING LOGIC ───
    const KIOSK_DEFAULT_SUGAR = ['100%', '50%', '0%'];
    const KIOSK_DEFAULT_ICE = ['Bình thường', 'Ít đá', 'Không đá'];

    const handlePlusClick = (item) => {
        if (item.isSoldOut) return;
        if (item.sizes?.length > 0 || item.addons?.length > 0
            || (item.sugarOptions && item.sugarOptions.length >= 0)
            || (item.iceOptions && item.iceOptions.length >= 0)) {
            setSelectedItem(item);
        } else {
            addDirectly(item);
        }
    };

    const addDirectly = (item) => {
        const sugars = (item.sugarOptions?.length ? item.sugarOptions : KIOSK_DEFAULT_SUGAR).slice().sort((a,b) => KIOSK_DEFAULT_SUGAR.indexOf(a) - KIOSK_DEFAULT_SUGAR.indexOf(b));
        const ices = (item.iceOptions?.length ? item.iceOptions : KIOSK_DEFAULT_ICE).slice().sort((a,b) => KIOSK_DEFAULT_ICE.indexOf(a) - KIOSK_DEFAULT_ICE.indexOf(b));
        const cartItem = {
            id: `kiosk-item-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            item: item,
            size: null,
            sugar: sugars !== undefined && sugars.length > 0 ? (item.defaultSugar || sugars[0]) : '',
            ice: ices !== undefined && ices.length > 0 ? (item.defaultIce || ices[0]) : '',
            addons: [],
            count: 1,
            note: '',
            totalPrice: parseFloat(item.price)
        };
        setCart(prev => [...prev, cartItem]);
    };

    const handleAddToCartFromModal = (customizedItem, isEdit) => {
        setCart(prev => {
            const existing = prev.find(c =>
                c.item.id === customizedItem.item.id &&
                c.size?.label === customizedItem.size?.label &&
                c.sugar === customizedItem.sugar &&
                c.ice === customizedItem.ice &&
                JSON.stringify(c.addons) === JSON.stringify(customizedItem.addons)
            );
            if (existing) {
                return prev.map(c => c.id === existing.id ? { ...c, count: c.count + 1, totalPrice: customizedItem.totalPrice } : c);
            }
            return [...prev, { id: `kiosk-item-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`, ...customizedItem }];
        });
        setSelectedItem(null);
    };

    const removeItem = (id) => {
        setCart(prev => prev.filter(c => c.id !== id));
    };

    const [selectedPromoId, setSelectedPromoId] = useState(null);

    const calculateCart = () => {
        const promoResult = calculateCartWithPromotions(cart, promotions, promoCodeInput, menu, selectedPromoId, settings.enablePromotions);
        
        let taxAmount = 0;
        let finalTotal = promoResult.totalOrderPrice;
        const rate = parseFloat(settings?.taxRate) || 0;
        const preTaxTotal = promoResult.totalOrderPrice;

        if (settings?.taxMode === 'EXCLUSIVE' && rate > 0) {
            taxAmount = Math.round(preTaxTotal * (rate / 100));
            finalTotal = preTaxTotal + taxAmount;
        } else if ((settings?.taxMode === 'INCLUSIVE' || settings?.taxMode === 'DIRECT_INCLUSIVE') && rate > 0) {
            taxAmount = Math.round(preTaxTotal - (preTaxTotal / (1 + rate / 100)));
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

    const updateItemOption = (itemId, type, value) => {
        setCart(prev => {
            const newCart = [...prev];
            const index = newCart.findIndex(c => c.id === itemId);
            if (index === -1) return prev;
            
            const itemObj = { ...newCart[index] };

            if (type === 'size') {
                itemObj.size = value;
            } else if (type === 'sugar') {
                itemObj.sugar = value;
            } else if (type === 'ice') {
                itemObj.ice = value;
            }

            let finalPrice = parseFloat(itemObj.item.price);
            if (itemObj.size?.priceAdjust) finalPrice += itemObj.size.priceAdjust;
            if (itemObj.addons?.length > 0) {
                finalPrice += itemObj.addons.reduce((sum, ad) => sum + (ad.price || 0), 0);
            }
            itemObj.totalPrice = finalPrice;
            
            newCart[index] = itemObj;
            return newCart;
        });
        setEditingOption(null);
    };

    const removeAddon = (itemId, addonIndex) => {
        setCart(prev => {
            const newCart = [...prev];
            const index = newCart.findIndex(c => c.id === itemId);
            if (index === -1) return prev;
            
            const itemObj = { ...newCart[index] };
            const newAddons = [...(itemObj.addons || [])];
            newAddons.splice(addonIndex, 1);
            itemObj.addons = newAddons;

            let finalPrice = parseFloat(itemObj.item.price);
            if (itemObj.size?.priceAdjust) finalPrice += itemObj.size.priceAdjust;
            if (itemObj.addons?.length > 0) {
                finalPrice += itemObj.addons.reduce((sum, ad) => sum + (ad.price || 0), 0);
            }
            itemObj.totalPrice = finalPrice;
            
            newCart[index] = itemObj;
            return newCart;
        });
    };

    const addSuggestedGiftToCart = (giftId) => {
        const item = menu.find(m => m.id === giftId);
        if (!item) return;
        // Quà tặng luôn ở size cơ bản (không size, không add-on)
        const cartItem = {
            id: `kiosk-item-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            item: item,
            size: null,       // Không có size upgrade
            sugar: item.defaultSugar || item.sugarOptions?.[0] || '100%',
            ice: item.defaultIce || item.iceOptions?.[0] || 'Bình thường',
            addons: [],       // Không add-on
            count: 1,
            note: '(Khách chọn làm quà)',
            totalPrice: parseFloat(item.price) // Giá base, không cộng size
        };
        // Cứ thêm vào giỏ như món bình thường, promotionEngine sẽ tự động bắt lấy và đổi thành quà tặng (isGift: true)
        // và tự động trừ vào số lượng quà tặng còn lại!
        setCart(prev => [...prev, cartItem]);
    };

    const submitOrder = async () => {
        if (cart.length === 0) return;
        setIsSubmitting(true);
        try {
            const { totalOrderPrice, preTaxTotal, taxAmount, taxRate, taxMode, baseTotal, discount, validPromo, processedCart } = calculateCart();

            const finalCart = [...processedCart];

            const orderData = {
                id: Date.now().toString() + '-' + Math.random().toString(36).substring(2, 9),
                itemName: finalCart.map(c => `${c.item.name} x${c.count}`).join(', '),
                customerName: tableNumber ? (settings?.isTakeaway ? `Khách Thẻ ${tableNumber}` : `Khách Bàn ${tableNumber}`) : 'Khách Kiosk',
                note: orderNote,
                price: totalOrderPrice,
                basePrice: baseTotal,
                preTaxTotal: preTaxTotal,
                taxAmount: taxAmount,
                taxRate: taxRate,
                taxMode: taxMode,
                discount: discount,
                appliedPromoCode: validPromo ? (validPromo.code || validPromo.name) : null,
                timestamp: new Date().toISOString(),
                cartItems: finalCart,
                tableName: (tableNumber && !settings?.isTakeaway) ? `Bàn ${tableNumber}` : '',
                tagNumber: (tableNumber && settings?.isTakeaway) ? tableNumber : '',
                status: settings.requirePrepayment === false ? 'PENDING' : 'AWAITING_PAYMENT',
                isPOS: true // Bypass QR protection for trusted local Kiosk
            };

            const res = await fetch(`${SERVER_URL}/api/order`, {
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(orderData)
            });

            if (res.ok) {
                setCart([]);
                setShowCartModal(false);
                setTableNumber('');
                // Hiển thị Order Sent success
                setShowOrderSentSuccess(true);
                setTimeout(() => setShowOrderSentSuccess(false), 5000);
                // Refetch menu ngay để cập nhật SL nguyên liệu (availablePortions)
                try { await fetchData(); } catch (e) { /* ignore */ }
            } else {
                const errData = await res.json().catch(() => ({}));
                if (errData.error === 'INSUFFICIENT_INVENTORY') {
                    alert('Hết nguyên liệu:\n' + errData.message);
                } else {
                    alert('Lỗi khi gửi order!');
                }
            }
        } catch (e) {
            console.error(e);
            alert('Lỗi kết nối khi gửi order!');
        } finally {
            setIsSubmitting(false);
        }
    };
    // ────────────────────────────

    if (loading) return (
        <div className="fixed inset-0 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #FAF9F6 0%, #F5F0E8 100%)' }}>
            <div style={{ textAlign: 'center' }}>
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                    style={{ width: 56, height: 56, borderRadius: '50%', border: '4px solid #F5A623', borderTopColor: 'transparent', margin: '0 auto 16px' }}
                />
                <p style={{ color: '#D97706', fontWeight: 900, letterSpacing: '0.2em', fontSize: 12 }}>LOADING MENU...</p>
            </div>
        </div>
    );

    return (
        <div style={{ position: 'fixed', inset: 0, background: '#FAF9F6', display: 'flex', flexDirection: 'column', fontFamily: "'Inter', sans-serif", userSelect: 'none', overflow: 'hidden', color: '#1C1C1E' }}>
            
            {qrInfo?.showStaffQrOnKiosk && (
                 <div className="absolute inset-0 z-[1000] bg-white">
                     <StaffQrKiosk isEmbedded={true} />
                 </div>
            )}

            {/* Main Container */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#FFFFFF', margin: 8, borderRadius: 24, boxShadow: '0 20px 80px rgba(0,0,0,0.08)', overflow: 'hidden', position: 'relative' }}>

                {/* ── HEADER ── */}
                <header style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(20px)', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 50, borderBottom: '1px solid #F3F0EB', position: 'sticky', top: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        {settings.headerImageUrl ? (
                            <img src={getImageUrl(settings.headerImageUrl)} alt={settings.shopName} style={{ height: 44, borderRadius: 8, objectFit: 'contain' }} />
                        ) : (
                            <>
                                <div style={{ width: 44, height: 44, borderRadius: 14, background: `linear-gradient(135deg, ${settings.themeColor || '#F5A623'}, ${settings.themeColor ? settings.themeColor + 'DD' : '#E8950F'})`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
                                    <Coffee size={22} color="#FFF" />
                                </div>
                                <div>
                                    <h1 style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.5px', lineHeight: 1, marginBottom: 2, color: '#1C1C1E' }}>
                                        {settings.shopName}
                                    </h1>
                                    <p style={{ fontSize: 10, color: settings.themeColor || '#D97706', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em' }}>{settings.shopSlogan || 'Tự chọn • Tự phục vụ'}</p>
                                </div>
                            </>
                        )}
                    </div>

                </header>

                {/* ── QR CODE MODAL ── */}
                <AnimatePresence>
                    {showQrModal && (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(20px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobile ? 12 : 40 }}
                        >
                            <motion.div
                                initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
                                style={{ background: '#FFF', borderRadius: isMobile ? 24 : 40, padding: isMobile ? '40px 20px' : 50, textAlign: 'center', maxWidth: 650, width: '100%', position: 'relative', boxShadow: '0 40px 100px rgba(0,0,0,0.5)', overflowY: 'auto', maxHeight: '95vh' }}
                            >
                                <button onClick={async () => {
                                    setShowQrModal(false);
                                    if (qrInfo.posCheckoutSession) {
                                        await fetch(`${SERVER_URL}/api/pos/checkout/stop`, { method: 'POST' });
                                    } else {
                                        await fetch(`${SERVER_URL}/api/settings/kiosk-dismiss`, { method: 'POST' });
                                    }
                                }} style={{ position: 'absolute', top: isMobile ? 16 : 30, right: isMobile ? 16 : 30, background: '#F3F4F6', border: 'none', width: isMobile ? 36 : 50, height: isMobile ? 36 : 50, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={isMobile ? 20 : 24} /></button>

                                {qrInfo.posCheckoutSession ? (
                                    <>
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, background: 'rgba(245,166,35,0.1)', color: '#D97706', padding: '12px 24px', borderRadius: 99, marginBottom: 24 }}>
                                            <CreditCard size={20} />
                                            <span style={{ fontWeight: 900, fontSize: 14, textTransform: 'uppercase', letterSpacing: '2px' }}>VUI LÒNG QUÉT MÃ ĐỂ THANH TOÁN</span>
                                        </div>

                                        <div style={{ background: '#FFF', padding: '12px', borderRadius: 24, border: '8px solid #F9FAFB', display: 'inline-block', marginBottom: 24, boxShadow: '0 10px 40px rgba(0,0,0,0.05)' }}>
                                            {settings.preferDynamicQr !== false || !settings.customQrUrl ? (
                                                <img src={getVietQR(qrInfo.posCheckoutSession.amount, qrInfo.posCheckoutSession.orderId)} style={{ width: Math.min(windowSize.width - (isMobile ? 64 : 180), 400), height: Math.min(windowSize.width - (isMobile ? 64 : 180), 400) }} alt="VietQR" />
                                            ) : (
                                                <img src={getImageUrl(settings.customQrUrl)} style={{ width: Math.min(windowSize.width - (isMobile ? 64 : 180), 400), height: Math.min(windowSize.width - (isMobile ? 64 : 180), 400), objectFit: 'contain' }} alt="Payment QR" />
                                            )}
                                        </div>

                                        <div style={{ background: '#F9FAFB', padding: isMobile ? '12px 20px' : '20px 32px', borderRadius: 24, display: 'inline-flex', flexDirection: 'column', gap: 4, width: isMobile ? '100%' : 'auto', boxSizing: 'border-box' }}>
                                            <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px' }}>TỔNG SỐ TIỀN</p>
                                            <p style={{ color: '#1C1C1E', fontSize: isMobile ? 36 : 64, fontWeight: 900, letterSpacing: '-2px' }}>{formatVND(qrInfo.posCheckoutSession.amount)}</p>
                                        </div>

                                        <p style={{ marginTop: 32, color: '#6B7280', fontWeight: 600, fontSize: 16, lineHeight: 1.6, maxWidth: 450, margin: '32px auto 0' }}>
                                            Vui lòng thực hiện chuyển khoản đúng số tiền.<br />
                                            Nội dung chuyển khoản: {settings.shopName}
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, background: 'rgba(16,185,129,0.1)', color: '#059669', padding: '12px 24px', borderRadius: 99, marginBottom: 24 }}>
                                            <Sparkles size={20} />
                                            <span style={{ fontWeight: 900, fontSize: 14, textTransform: 'uppercase', letterSpacing: '2px' }}>QUÉT MÃ ĐỂ ĐẶT MÓN TỪ XA</span>
                                        </div>

                                        <div style={{ background: '#FFF', padding: '12px', borderRadius: 24, border: '8px solid #F9FAFB', display: 'inline-block', marginBottom: 24, boxShadow: '0 10px 40px rgba(0,0,0,0.05)' }}>
                                            <QRCodeCanvas
                                                key={qrInfo.token}
                                                value={qrInfo.orderUrl}
                                                size={Math.min(windowSize.width - (isMobile ? 84 : 180), 400)}
                                                level="H"
                                                includeMargin={false}
                                            />
                                        </div>

                                        <div style={{ background: '#F9FAFB', padding: isMobile ? '12px 20px' : '20px 32px', borderRadius: 24, display: 'inline-flex', flexDirection: 'column', gap: 4, width: isMobile ? '100%' : 'auto', boxSizing: 'border-box' }}>
                                            <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px' }}>MÃ PHIÊN LÀM VIỆC</p>
                                            <p style={{ color: '#1C1C1E', fontSize: isMobile ? 24 : 32, fontWeight: 900, letterSpacing: isMobile ? '2px' : '4px' }}>{qrInfo.token}</p>
                                        </div>

                                        <p style={{ marginTop: 24, color: '#6B7280', fontWeight: 600, fontSize: isMobile ? 14 : 16, lineHeight: 1.6, maxWidth: 450, margin: '24px auto 0' }}>
                                            Mã này hợp lệ cho (01) lượt đặt hàng tại quán. <br />
                                            Vui lòng không tắt hoặc tải lại trang khi đang chọn món.
                                        </p>
                                    </>
                                )}
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ── PAYMENT SUCCESS OVERLAY ── */}
                <AnimatePresence>
                    {showPaymentSuccess && (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(20px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                            <motion.div
                                initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}
                                style={{ textAlign: 'center', padding: 40 }}
                            >
                                <div style={{ width: 120, height: 120, borderRadius: '50%', background: '#34C759', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 30px', boxShadow: '0 20px 40px rgba(52,199,89,0.3)' }}>
                                    <CheckCircle size={64} color="#FFF" />
                                </div>
                                <h2 style={{ fontSize: isMobile ? 32 : 48, fontWeight: 900, color: '#1C1C1E', marginBottom: 12 }}>THANH TOÁN THÀNH CÔNG</h2>
                                <p style={{ fontSize: isMobile ? 18 : 24, color: '#6B7280', fontWeight: 600 }}>Cảm ơn bạn! Đơn hàng đang được chuẩn bị.</p>
                                <motion.div
                                    initial={{ width: '100%' }}
                                    animate={{ width: 0 }}
                                    transition={{ duration: 5, ease: 'linear' }}
                                    style={{ height: 4, background: '#34C759', borderRadius: 2, marginTop: 40 }}
                                />
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>



                <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    {/* ── CATEGORY NAV ── */}
                    <div style={{ padding: '12px 20px', display: 'flex', gap: 10, overflowX: 'auto', borderBottom: '1px solid #F3F0EB', background: '#FDFCFA', scrollbarWidth: 'none' }}>
                        {['TẤT CẢ', ...categories].map(cat => {
                            const isActive = activeCategory === cat;
                            const color = cat === 'TẤT CẢ' ? '#1C1C1E' : getCategoryColor(cat);
                            return (
                                <button
                                    key={cat}
                                    onClick={() => cat === 'TẤT CẢ' ? (setActiveCategory('TẤT CẢ'), scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })) : scrollToCategory(cat)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 7,
                                        padding: '8px 16px',
                                        borderRadius: 999,
                                        border: `2px solid ${isActive ? color : '#E5E7EB'}`,
                                        background: isActive ? color : '#FFF',
                                        color: isActive ? '#FFF' : '#6B7280',
                                        fontWeight: 900, fontSize: 11,
                                        whiteSpace: 'nowrap',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                        boxShadow: isActive ? `0 4px 12px ${color}40` : 'none',
                                    }}
                                >
                                    {cat !== 'TẤT CẢ' && (
                                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: isActive ? 'rgba(255,255,255,0.8)' : color, flexShrink: 0 }} />
                                    )}
                                    {cat.toUpperCase()}
                                </button>
                            );
                        })}
                    </div>

                    {/* ── MENU GRID ── */}
                    <div ref={scrollContainerRef} style={{ flex: 1, overflowY: 'auto', padding: '20px 16px', background: '#FDFCFA', scrollbarWidth: 'thin', scrollbarColor: '#E5E7EB transparent' }}>
                        {sortedCategories.map(category => (
                            <div key={category} ref={el => categoryRefs.current[category] = el} style={{ marginBottom: 40 }}>
                                {/* Category Header */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, padding: '10px 16px', background: '#1A202C', borderRadius: 14, border: `1px solid #1A202C`, borderLeft: `6px solid ${getCategoryColor(category)}`, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: getCategoryColor(category), flexShrink: 0 }} />
                                    <h2 style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#FFF', flex: 1 }}>{category}</h2>
                                    <span style={{ fontSize: 10, color: '#A0AEC0', fontWeight: 'bold', background: 'rgba(0,0,0,0.2)', padding: '2px 8px', borderRadius: 4 }}>
                                        {menu.filter(i => i.category === category).length} món
                                    </span>
                                </div>

                                {/* Product Grid */}
                                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: !isLandscape ? 16 : 12 }}>
                                    {menu.filter(item => item.category === category).map(item => (
                                        <motion.div
                                            key={item.id}
                                            layout
                                            onClick={() => { if (!item.isSoldOut) handlePlusClick(item); }}
                                            whileHover={item.isSoldOut ? {} : { y: -4, boxShadow: '0 12px 30px rgba(0,0,0,0.1)' }}
                                            style={{ background: '#FFF', borderRadius: 18, border: '1px solid #F3F0EB', overflow: 'hidden', display: 'flex', flexDirection: 'column', cursor: item.isSoldOut ? 'not-allowed' : 'pointer', transition: 'all 0.25s', opacity: item.isSoldOut ? 0.6 : 1 }}
                                        >
                                            {/* Image */}
                                            <div style={{ aspectRatio: '4/5', background: 'linear-gradient(135deg, #FDF6EE 0%, #F8EDDC 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
                                                {item.image ? (
                                                    <img src={getImageUrl(item.image)} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: item.isSoldOut ? 'grayscale(100%)' : 'none' }} alt={item.name} />
                                                ) : (
                                                    <Coffee size={36} color="#D97706" strokeWidth={1.5} />
                                                )}
                                                {item.isSoldOut && (
                                                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.1)', zIndex: 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        <span style={{ background: 'rgba(220,38,38,0.9)', color: '#FFF', fontWeight: 900, padding: '8px 16px', fontSize: 13, textTransform: 'uppercase', letterSpacing: '2px', boxShadow: '0 4px 12px rgba(220,38,38,0.4)', borderRadius: 4 }}>HẾT MÓN</span>
                                                    </div>
                                                )}
                                                {/* Category Badge */}
                                                <span style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', color: '#FFF', fontSize: 8, fontWeight: 900, padding: '3px 8px', borderRadius: 99, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                                                    {item.category}
                                                </span>
                                            </div>

                                            {/* Info */}
                                            <div style={{ padding: '10px 12px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 8 }}>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <h3 style={{ fontWeight: 900, fontSize: 14, color: '#1C1C1E', lineHeight: 1.2, marginBottom: 3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.name}</h3>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
                                                        <p style={{ fontSize: 13, fontWeight: 900, color: settings.themeColor || '#F5A623', lineHeight: 1 }}>{formatVND(item.price)}</p>
                                                        {!item.isSoldOut && item.availablePortions !== null && item.availablePortions !== undefined && item.availablePortions <= (settings?.warningThreshold !== undefined ? settings.warningThreshold : 2) && item.availablePortions > 0 && (
                                                            <span style={{ fontSize: 12, fontWeight: 900, color: '#EF4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '2px 6px', borderRadius: 4, lineHeight: 1 }}>
                                                                SL:{item.availablePortions}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); if (!item.isSoldOut) handlePlusClick(item); }}
                                                    style={{ width: 32, height: 32, borderRadius: '50%', background: '#F9FAFB', border: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1C1C1E', flexShrink: 0, cursor: item.isSoldOut ? 'not-allowed' : 'pointer' }}
                                                >
                                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                                </button>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </main>

                {/* ── COMPLETED ORDER ANNOUNCEMENT ── */}
                <AnimatePresence>
                    {
                        completedQueue.length > 0 && (
                            <motion.div
                                initial={{ opacity: 0, y: -100, x: '-50%' }}
                                animate={{ opacity: 1, y: 0, x: '-50%' }}
                                exit={{ opacity: 0, y: -100, x: '-50%' }}
                                style={{
                                    position: 'fixed', top: isMobile ? 12 : 30, left: '50%', zIndex: 1000,
                                    background: 'linear-gradient(135deg, #1C1C1E, #3A3A3C)', borderRadius: isMobile ? 32 : 40,
                                    padding: isMobile ? '32px 20px' : '40px 60px',
                                    boxShadow: '0 30px 80px rgba(0,0,0,0.6)', textAlign: 'center',
                                    width: isMobile ? '92%' : 'auto',
                                    minWidth: isMobile ? 'auto' : 500,
                                    maxWidth: isMobile ? '96%' : 700,
                                    border: '1px solid rgba(255,255,255,0.15)',
                                    backdropFilter: 'blur(10px)'
                                }}
                            >
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: isMobile ? 12 : 20 }}>
                                    <div style={{ background: 'rgba(245,166,35,0.1)', color: "var(--brand-600)", padding: '8px 20px', borderRadius: 99, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                        <Sparkles size={isMobile ? 16 : 20} />
                                        <span style={{ fontSize: isMobile ? 12 : 14, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '3px' }}>🔔 GỌI MÓN</span>
                                    </div>

                                    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 15 }}>
                                        {completedQueue.map(n => (
                                            <div key={n.queueNumber} style={{ position: 'relative' }}>
                                                <p style={{ fontSize: isMobile ? 64 : 100, fontWeight: 900, color: '#FFF', lineHeight: 1, letterSpacing: '-2px' }}>
                                                    #{n.queueNumber}
                                                </p>
                                                <motion.div
                                                    animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0.8, 0.5] }}
                                                    transition={{ repeat: Infinity, duration: 2 }}
                                                    style={{ position: 'absolute', inset: -10, border: '2px solid #F5A623', borderRadius: 20, pointerEvents: 'none' }}
                                                />
                                            </div>
                                        ))}
                                    </div>

                                    <div style={{ marginTop: isMobile ? 8 : 15 }}>
                                        <p style={{ fontSize: isMobile ? 18 : 22, color: '#FFF', fontWeight: 800, marginBottom: 4 }}>MỜI QUÝ KHÁCH ĐẾN NHẬN MÓN</p>
                                        <p style={{ fontSize: isMobile ? 13 : 16, color: '#9CA3AF', fontWeight: 600 }}>Cảm ơn quý khách đã chờ đợi!</p>
                                    </div>
                                </div>
                            </motion.div>
                        )
                    }
                </AnimatePresence>

                <SharedCustomizationModal
                    isOpen={!!selectedItem}
                    item={selectedItem}
                    onClose={() => setSelectedItem(null)}
                    onAddToCart={handleAddToCartFromModal}
                    formatVND={formatVND}
                />

                {/* ── CART BUTTON (FLOATING) ── */}
                <AnimatePresence>
                    {cart.length > 0 && !showCartModal && (
                        <motion.div
                            initial={{ y: 100, x: "-50%", opacity: 0 }} animate={{ y: 0, x: "-50%", opacity: 1 }} exit={{ y: 100, x: "-50%", opacity: 0 }}
                            style={{ position: 'absolute', bottom: 24, left: '50%', zIndex: 2000, width: '90%', maxWidth: 400 }}
                        >
                            <button
                                onClick={() => setShowCartModal(true)}
                                style={{ width: '100%', background: '#1C1C1E', border: '1px solid #3A3A3C', borderRadius: 99, padding: '8px 8px 8px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#FFF', cursor: 'pointer', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}
                            >
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                                    <span style={{ fontSize: 11, fontWeight: 900, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '1px' }}>Giỏ Hàng Kiosk</span>
                                    <span style={{ fontSize: 16, fontWeight: 900 }}>{formatVND(cart.reduce((s, c) => s + (c.totalPrice * c.count), 0))}</span>
                                </div>
                                <div style={{ background: settings.themeColor || '#F5A623', padding: '10px 20px', borderRadius: 99, fontWeight: 900, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, color: '#FFF' }}>
                                    XEM ({cart.reduce((sum, c) => sum + c.count, 0)})
                                </div>
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ── PENDING ORDERS BUTTON (FLOATING) ── */}
                <AnimatePresence>
                    {pendingOrders.length > 0 && !showCartModal && !showPendingOrdersModal && (
                        <motion.div
                            initial={{ y: 100, x: "-50%", opacity: 0 }} animate={{ y: 0, x: "-50%", opacity: 1 }} exit={{ y: 100, x: "-50%", opacity: 0 }}
                            style={{ position: 'absolute', bottom: cart.length > 0 ? 100 : 24, left: '50%', zIndex: 1900, width: '90%', maxWidth: 400 }}
                        >
                            <button
                                onClick={() => { setActiveDebtTab(false); setShowPendingOrdersModal(true); }}
                                style={{ width: '100%', background: 'rgba(255,255,255,0.95)', border: '1px solid #E5E7EB', borderRadius: 99, padding: '8px 8px 8px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#1C1C1E', cursor: 'pointer', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', backdropFilter: 'blur(10px)' }}
                            >
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                                    <span style={{ fontSize: 11, fontWeight: 900, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '1px' }}>Đang thực hiện</span>
                                    <span style={{ fontSize: 16, fontWeight: 900, color: "var(--brand-600)" }}>{pendingOrders.length} Đơn</span>
                                </div>
                                <div style={{ background: '#007AFF', padding: '10px 20px', borderRadius: 99, fontWeight: 900, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, color: '#FFF' }}>
                                    XEM LỊCH SỬ
                                </div>
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ── DEBT ICON (FLOATING) ── */}
                <AnimatePresence>
                    {pendingOrders.length === 0 && debtOrders.length > 0 && !showCartModal && !showPendingOrdersModal && (
                        <motion.div
                            initial={{ y: 100, scale: 0.8, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 100, scale: 0.8, opacity: 0 }}
                            style={{ position: 'absolute', bottom: cart.length > 0 ? 100 : 24, left: 24, zIndex: 1900 }}
                        >
                            <button
                                onClick={() => { setActiveDebtTab(true); setShowPendingOrdersModal(true); }}
                                style={{
                                    width: 60, height: 60, borderRadius: '50%', background: '#8b5cf6',
                                    border: '3px solid #FFF', color: '#FFF', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                    boxShadow: '0 10px 30px rgba(139,92,246,0.4)', cursor: 'pointer'
                                }}
                            >
                                <BookOpen size={20} />
                                <span style={{ fontSize: 10, fontWeight: 900, marginTop: 2 }}>NỢ</span>
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ── CART MODAL ── */}
                <AnimatePresence>
                    {showCartModal && (
                        <div style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobile ? 12 : 40 }}>
                            <motion.div
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                onClick={() => setShowCartModal(false)}
                                style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
                            />
                            <motion.div
                                initial={{ y: "100%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: "100%", opacity: 0 }}
                                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                                style={{ position: 'relative', background: '#F9FAFB', borderRadius: isMobile ? 24 : 32, width: '100%', maxWidth: 500, padding: 24, paddingTop: 32, boxShadow: '0 40px 100px rgba(0,0,0,0.3)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
                                drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.5 }}
                                onDragEnd={(e, info) => { if (info.offset.y > 100 || info.velocity.y > 500) setShowCartModal(false); }}
                            >
                                <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', width: 40, height: 5, borderRadius: 3, background: '#E5E7EB' }} />
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                                    <h2 style={{ fontSize: 24, fontWeight: 900, color: '#1C1C1E', letterSpacing: '-0.5px' }}>Đơn Hàng Của Khách</h2>
                                    <button onClick={() => setShowCartModal(false)} style={{ background: '#E5E7EB', border: 'none', width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#4B5563' }}>
                                        <X size={18} />
                                    </button>
                                </div>
                                
                                <div style={{ overflowY: 'auto', flex: 1, scrollbarWidth: 'thin', display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 4, paddingBottom: 20 }} onPointerDownCapture={(e) => e.stopPropagation()}>
                                    {(() => {
                                        const { processedCart } = calculateCart();
                                        return processedCart.map((c, i) => {
                                            const sugarOpts = c.item.sugarOptions?.length ? c.item.sugarOptions : KIOSK_DEFAULT_SUGAR;
                                            const iceOpts = c.item.iceOptions?.length ? c.item.iceOptions : KIOSK_DEFAULT_ICE;
                                            const hasSizes = c.item.sizes?.length > 1;
                                            const hasSugar = sugarOpts.length > 1;
                                            const hasIce = iceOpts.length > 1;

                                            return (
                                            <div key={c.id || i} style={{ position: 'relative', borderRadius: 16, flexShrink: 0 }}>
                                                {!c.isGift && (
                                                    <div style={{ position: 'absolute', inset: 0, backgroundColor: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 24, borderRadius: 16, zIndex: 1 }}>
                                                        <Trash2 size={24} color="#FFF" />
                                                    </div>
                                                )}
                                                <motion.div 
                                                    drag={c.isGift ? false : "x"}
                                                    dragConstraints={{ left: -80, right: 0 }}
                                                    dragDirectionLock
                                                    dragElastic={0.05}
                                                    onDragEnd={(e, info) => {
                                                        if (!c.isGift && info.offset.x < -60) {
                                                            removeItem(c.id);
                                                        }
                                                    }}
                                                    style={{ background: c.isGift ? '#ECFDF5' : '#FFF', borderRadius: 16, padding: '20px 16px', border: `1px solid ${c.isGift ? '#6EE7B7' : '#E5E7EB'}`, position: 'relative', zIndex: 10, width: '100%', boxSizing: 'border-box' }}
                                                >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                                                    <h3 style={{ fontSize: 16, fontWeight: 900, color: c.isGift ? '#065F46' : '#1C1C1E', paddingRight: 30, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        {c.isGift && <Gift size={16} color="#10B981" />}
                                                        {c.isGift ? '(KM) ' + c.item.name : c.item.name} 
                                                        <span style={{ color: settings.themeColor || '#F5A623', marginLeft: 4 }}>x{c.count}</span>
                                                    </h3>
                                                    {/* Nút xóa — gift item cũng có thể xóa */}
                                                    <button onClick={() => {
                                                        if (c.originalCartItemId) {
                                                            setCart(prev => prev.map(x => x.id === c.originalCartItemId ? { ...x, count: x.count - c.count } : x).filter(x => x.count > 0));
                                                        } else {
                                                            removeItem(c.id);
                                                        }
                                                    }} style={{ background: '#F3F4F6', border: 'none', color: '#EF4444', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'absolute', top: 16, right: 16 }}>
                                                        <X size={14} strokeWidth={3} />
                                                    </button>
                                                </div>

                                                {!c.isGift && (
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, position: 'relative' }}>
                                                        {/* Edit Size */}
                                                        {hasSizes && (
                                                            <div style={{ position: 'relative' }}>
                                                                <button
                                                                    onClick={() => setEditingOption(editingOption?.id === `size-${i}` ? null : { id: `size-${i}`, index: c.id, type: 'size', opts: c.item.sizes })}
                                                                    style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#F9FAFB', border: '1px solid #E5E7EB', padding: '6px 10px', borderRadius: 8, fontSize: 13, fontWeight: 700, color: '#4B5563', cursor: 'pointer' }}
                                                                >
                                                                    Size {String(typeof c.size === 'object' && c.size !== null ? (c.size.label || 'S') : (c.size || 'S'))}
                                                                    <ChevronDown size={14} color="#9CA3AF" />
                                                                </button>
                                                                {editingOption?.id === `size-${i}` && (
                                                                    <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 12, boxShadow: '0 10px 25px rgba(0,0,0,0.1)', zIndex: 50, minWidth: 120, overflow: 'hidden' }}>
                                                                        {editingOption.opts.map(s => (
                                                                            <button
                                                                                key={s.label}
                                                                                onClick={() => updateItemOption(c.id, 'size', s)}
                                                                                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 16px', borderBottom: '1px solid #F3F4F6', background: String(typeof c.size === 'object' && c.size !== null ? (c.size.label || 'S') : (c.size || 'S')) === s.label ? 'rgba(245,166,35,0.05)' : '#FFF', color: String(typeof c.size === 'object' && c.size !== null ? (c.size.label || 'S') : (c.size || 'S')) === s.label ? (settings.themeColor || '#D97706') : '#4B5563', fontSize: 14, fontWeight: 800, border: 'none', cursor: 'pointer' }}
                                                                            >{s.label}</button>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}

                                                        {/* Edit Sugar */}
                                                        {hasSugar && (
                                                            <div style={{ position: 'relative' }}>
                                                                <button
                                                                    onClick={() => setEditingOption(editingOption?.id === `sugar-${i}` ? null : { id: `sugar-${i}`, index: c.id, type: 'sugar', opts: sugarOpts })}
                                                                    style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#F9FAFB', border: '1px solid #E5E7EB', padding: '6px 10px', borderRadius: 8, fontSize: 13, fontWeight: 700, color: '#4B5563', cursor: 'pointer' }}
                                                                >
                                                                    {c.sugar}
                                                                    <ChevronDown size={14} color="#9CA3AF" />
                                                                </button>
                                                                {editingOption?.id === `sugar-${i}` && (
                                                                    <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 12, boxShadow: '0 10px 25px rgba(0,0,0,0.1)', zIndex: 50, minWidth: 120, overflow: 'hidden' }}>
                                                                        {editingOption.opts.map(opt => (
                                                                            <button
                                                                                key={opt}
                                                                                onClick={() => updateItemOption(c.id, 'sugar', opt)}
                                                                                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 16px', borderBottom: '1px solid #F3F4F6', background: c.sugar === opt ? 'rgba(245,166,35,0.05)' : '#FFF', color: c.sugar === opt ? (settings.themeColor || '#D97706') : '#4B5563', fontSize: 14, fontWeight: 800, border: 'none', cursor: 'pointer' }}
                                                                            >{opt}</button>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}

                                                        {/* Edit Ice */}
                                                        {hasIce && (
                                                            <div style={{ position: 'relative' }}>
                                                                <button
                                                                    onClick={() => setEditingOption(editingOption?.id === `ice-${i}` ? null : { id: `ice-${i}`, index: c.id, type: 'ice', opts: iceOpts })}
                                                                    style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#F9FAFB', border: '1px solid #E5E7EB', padding: '6px 10px', borderRadius: 8, fontSize: 13, fontWeight: 700, color: '#4B5563', cursor: 'pointer' }}
                                                                >
                                                                    {c.ice}
                                                                    <ChevronDown size={14} color="#9CA3AF" />
                                                                </button>
                                                                {editingOption?.id === `ice-${i}` && (
                                                                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, minWidth: 120, marginTop: 4, background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 12, boxShadow: '0 10px 25px rgba(0,0,0,0.1)', zIndex: 60, overflow: 'hidden' }}>
                                                                        {editingOption.opts.map(opt => (
                                                                            <button
                                                                                key={opt}
                                                                                onClick={() => updateItemOption(c.id, 'ice', opt)}
                                                                                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 16px', borderBottom: '1px solid #F3F4F6', background: c.ice === opt ? 'rgba(245,166,35,0.05)' : '#FFF', color: c.ice === opt ? (settings.themeColor || '#D97706') : '#4B5563', fontSize: 14, fontWeight: 800, border: 'none', cursor: 'pointer' }}
                                                                            >{opt}</button>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {c.isGift && (
                                                    <p style={{ fontSize: 12, color: '#10B981', fontWeight: 600, display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                                                        {c.size && <span>Size {c.size.label}</span>}
                                                        {c.size && <span>•</span>}
                                                        <span>{c.sugar} đường</span>
                                                        <span>•</span>
                                                        <span>{c.ice}</span>
                                                    </p>
                                                )}

                                                {c.addons && c.addons.length > 0 && (
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                                                        {c.addons.map((a, idx) => (
                                                            <div key={idx} style={{ background: 'rgba(245,166,35,0.1)', color: settings.themeColor || '#D97706', fontSize: 11, fontWeight: 800, padding: '4px 6px 4px 10px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                                +{a.label}
                                                                <button onClick={() => removeAddon(c.id, idx)} style={{ background: 'none', border: 'none', color: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 2, marginRight: -2 }}>
                                                                    <X size={12} strokeWidth={3} />
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                
                                                {c.note && (
                                                    <p style={{ fontSize: 11, color: '#9CA3AF', fontStyle: 'italic', marginBottom: 8 }}>Mô tả: {c.note}</p>
                                                )}

                                                <div style={{ textAlign: 'right', marginTop: 8, paddingTop: 12, borderTop: `1px dashed ${c.isGift ? '#A7F3D0' : '#F3F4F6'}` }}>
                                                    {c.isGift ? (
                                                        <>
                                                            <span style={{ fontSize: 12, fontWeight: 800, color: '#9CA3AF', textDecoration: 'line-through', marginRight: 8 }}>{formatVND(c.originalPrice * c.count)}</span>
                                                            <span style={{ fontSize: 16, fontWeight: 900, color: '#10B981' }}>0 đ</span>
                                                        </>
                                                    ) : (
                                                        <span style={{ fontSize: 16, fontWeight: 900, color: '#1C1C1E' }}>{formatVND(c.totalPrice * c.count)}</span>
                                                    )}
                                                </div>
                                                </motion.div>
                                            </div>
                                            );
                                        });
                                    })()}
                                </div>

                                <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: 20, marginTop: 'auto' }}>
                                {/* MÃ KHUYẾN MÃI & THẺ BÀN (Giao diện nhỏ gọn) */}
                                    {(() => {
                                        const { validPromo, availablePromotions } = calculateCart();
                                        
                                        return (
                                            <div style={{ paddingBottom: 16 }}>
                                                {/* GHI CHÚ ĐƠN HÀNG */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                                    <label style={{ fontSize: 11, fontWeight: 900, color: '#6B7280', textTransform: 'uppercase', width: 90, flexShrink: 0 }}>GHI CHÚ</label>
                                                    <div style={{ flex: 1 }}>
                                                        <input 
                                                            type="text" 
                                                            value={orderNote}
                                                            onChange={e => setOrderNote(e.target.value)}
                                                            placeholder="Cám ơn quán..."
                                                            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#FFF', fontSize: 14, fontWeight: 600, outline: 'none', transition: 'all 0.2s' }}
                                                        />
                                                    </div>
                                                </div>
                                                {/* Dòng MÃ KHUYẾN MÃI */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                                    <label style={{ fontSize: 13, fontWeight: 900, color: '#6B7280', textTransform: 'uppercase', width: 90, flexShrink: 0 }}>MÃ KM</label>
                                                    <div style={{ flex: 1, position: 'relative' }}>
                                                        <div 
                                                            onClick={() => setIsPromoExpanded(!isPromoExpanded)}
                                                            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${validPromo ? (settings.themeColor || '#10B981') : '#E5E7EB'}`, background: validPromo ? 'rgba(16,185,129,0.05)' : '#FFF', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: 'all 0.2s' }}
                                                        >
                                                            <span style={{ fontSize: 13, fontWeight: validPromo ? 800 : 700, color: validPromo ? (settings.themeColor || '#065F46') : '#9CA3AF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                {validPromo ? `✓ ${validPromo.code || validPromo.name}` : 'Nhập mã KM'}
                                                            </span>
                                                            {isPromoExpanded ? <ChevronUp size={16} color={validPromo ? (settings.themeColor || '#065F46') : '#6B7280'} /> : <ChevronDown size={16} color={validPromo ? (settings.themeColor || '#065F46') : '#6B7280'} />}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Phần mở rộng của Khuyến Mãi */}
                                                <AnimatePresence>
                                                    {isPromoExpanded && (
                                                        <motion.div 
                                                            initial={{ height: 0, opacity: 0 }} 
                                                            animate={{ height: 'auto', opacity: 1 }} 
                                                            exit={{ height: 0, opacity: 0 }}
                                                            style={{ overflow: 'hidden', paddingLeft: 98, marginBottom: 16 }}
                                                        >
                                                            <input 
                                                                type="text" 
                                                                value={promoCodeInput} 
                                                                onChange={e => {
                                                                    setPromoCodeInput(e.target.value.toUpperCase());
                                                                    setSelectedPromoId(null);
                                                                }}
                                                                placeholder="Nhập mã giảm giá..."
                                                                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E5E7EB', outline: 'none', fontSize: 13, fontWeight: 700, color: '#1C1C1E', transition: 'border-color 0.2s', boxSizing: 'border-box', textTransform: 'uppercase', marginBottom: 8 }}
                                                                onFocus={(e) => e.target.style.borderColor = (settings.themeColor || '#10B981')}
                                                                onBlur={(e) => e.target.style.borderColor = '#E5E7EB'}
                                                            />
                                                            
                                                            {promoCodeInput && availablePromotions.length === 0 && <p style={{color: '#EF4444', fontSize: 11, fontWeight: 800, marginBottom: 8}}>Mã không hợp lệ hoặc chưa đủ điều kiện</p>}
                                                            
                                                            {availablePromotions.length > 0 && (
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                                    {availablePromotions.map(ap => {
                                                                        const isSelected = validPromo?.id === ap.promo.id;
                                                                        const brandColor = settings.themeColor || '#10B981';
                                                                        return (
                                                                            <label key={ap.promo.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', borderRadius: 8, border: `1px solid ${isSelected ? brandColor : '#E5E7EB'}`, background: isSelected ? 'rgba(16,185,129,0.05)' : '#F9FAFB', cursor: 'pointer', transition: 'all 0.2s' }}>
                                                                                <input 
                                                                                    type="radio" 
                                                                                    name="kiosk_promo"
                                                                                    checked={isSelected}
                                                                                    onChange={() => {
                                                                                        setSelectedPromoId(ap.promo.id);
                                                                                        setIsPromoExpanded(false); // Code Collapse tự động!
                                                                                    }}
                                                                                    style={{ marginTop: 2, accentColor: brandColor, transform: 'scale(1.1)' }}
                                                                                />
                                                                                <div style={{ flex: 1 }}>
                                                                                    <p style={{ fontSize: 12, fontWeight: 900, color: isSelected ? brandColor : '#4B5563', marginBottom: 2 }}>{ap.promo.name}</p>
                                                                                    {ap.messages && ap.messages.map((m, i) => (
                                                                                        <p key={i} style={{ fontSize: 10, fontWeight: 600, fontStyle: 'italic', color: isSelected ? '#059669' : '#6B7280' }}>- {m}</p>
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

                                                {/* Dòng Số Tag / Thẻ Bàn */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <label style={{ fontSize: 13, fontWeight: 900, color: '#6B7280', textTransform: 'uppercase', width: 90, flexShrink: 0, lineHeight: 1.1 }}>
                                                        {settings?.isTakeaway ? 'THẺ BÀN' : 'SỐ BÀN'}
                                                    </label>
                                                    <div style={{ flex: 1 }}>
                                                        <input 
                                                            type="text" 
                                                            value={tableNumber} 
                                                            onChange={(e) => setTableNumber(e.target.value)}
                                                            placeholder={settings?.isTakeaway ? 'Nhập số thẻ/tag...' : 'Nhập số/tên bàn...'}
                                                            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E5E7EB', outline: 'none', fontSize: 13, fontWeight: 700, color: '#1C1C1E', transition: 'border-color 0.2s', boxSizing: 'border-box' }}
                                                            onFocus={(e) => e.target.style.borderColor = (settings.themeColor || '#10B981')}
                                                            onBlur={(e) => e.target.style.borderColor = '#E5E7EB'}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {(() => {
                                        const { totalOrderPrice, baseTotal, discount, giftMessages, suggestedGifts } = calculateCart();
                                        return (
                                            <>
                                                {discount > 0 && (
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                                        <span style={{ fontSize: 12, fontWeight: 900, color: '#9CA3AF', textTransform: 'uppercase' }}>Tạm tính</span>
                                                        <span style={{ fontSize: 14, fontWeight: 900, color: '#9CA3AF' }}>{formatVND(baseTotal)}</span>
                                                    </div>
                                                )}
                                                {discount > 0 && (
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                                        <span style={{ fontSize: 12, fontWeight: 900, color: '#10B981', textTransform: 'uppercase' }}>Khuyến mãi</span>
                                                        <span style={{ fontSize: 14, fontWeight: 900, color: '#10B981' }}>-{formatVND(discount)}</span>
                                                    </div>
                                                )}
                                                {giftMessages && giftMessages.length > 0 && (
                                                    <div style={{ marginBottom: 16, paddingTop: 16, borderTop: '1px dashed #D1D5DB' }}>
                                                        <p style={{ fontSize: 12, fontWeight: 900, color: '#10B981', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                            <Gift size={14}/> THÔNG BÁO QUÀ TẶNG:
                                                        </p>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                            {giftMessages.map((msg, gIdx) => (
                                                                <div key={gIdx} style={{ display: 'flex', justifyContent: 'space-between', background: '#ECFDF5', padding: '8px 12px', borderRadius: 8 }}>
                                                                    <span style={{ fontSize: 11, fontWeight: 800, color: '#065F46', flex: 1, fontStyle: 'italic' }}>🎁 {msg}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                        {suggestedGifts && suggestedGifts.length > 0 && (
                                                            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingTop: 8, paddingBottom: 4, scrollbarWidth: 'none' }}>
                                                                {suggestedGifts.map(giftId => {
                                                                    const giftItem = menu.find(m => m.id === giftId);
                                                                    if (!giftItem) return null;
                                                                    return (
                                                                        <button 
                                                                            key={giftId}
                                                                            onClick={() => addSuggestedGiftToCart(giftId)}
                                                                            style={{ background: '#10B981', color: '#FFF', border: 'none', padding: '8px 12px', borderRadius: 8, fontSize: 11, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 2px 4px rgba(16,185,129,0.2)' }}
                                                                        >
                                                                            + Lấy quà: {giftItem.name}
                                                                        </button>
                                                                    )
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                                    <span style={{ fontSize: 14, fontWeight: 900, color: '#6B7280', textTransform: 'uppercase' }}>Tổng cộng</span>
                                                    <span style={{ fontSize: 28, fontWeight: 900, color: '#1C1C1E', letterSpacing: '-1px' }}>{formatVND(totalOrderPrice)}</span>
                                                </div>
                                            </>
                                        );
                                    })()}
                                    <button 
                                        onClick={submitOrder} 
                                        disabled={isSubmitting}
                                        style={{ width: '100%', background: isSubmitting ? '#9CA3AF' : (settings.themeColor || '#10B981'), color: '#FFF', padding: 20, borderRadius: 20, border: 'none', fontWeight: 900, fontSize: 16, cursor: isSubmitting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: isSubmitting ? 'none' : '0 10px 30px rgba(16,185,129,0.3)', transition: 'all 0.2s' }}
                                    >
                                        {isSubmitting ? 'ĐANG GỬI ODER...' : 'GỬI ĐƠN HÀNG VỀ QUẦY (POS)'}
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* ── PENDING ORDERS MODAL ── */}
                <AnimatePresence>
                    {showPendingOrdersModal && (
                        <motion.div
                            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            style={{ position: 'fixed', inset: 0, zIndex: 2100, background: '#FAF9F6', display: 'flex', flexDirection: 'column' }}
                            drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.5 }}
                            onDragEnd={(e, info) => { if (info.offset.y > 100 || info.velocity.y > 500) setShowPendingOrdersModal(false); }}
                        >
                            <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', width: 40, height: 5, borderRadius: 3, background: '#E5E7EB' }} />
                            {/* Modal Header */}
                            <div style={{ padding: '20px 24px', background: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #E5E7EB', position: 'sticky', top: 0, zIndex: 10 }}>
                                {debtOrders.length > 0 ? (
                                    <div style={{ display: 'flex', gap: 12 }}>
                                        <button onClick={() => setActiveDebtTab(false)} style={{ background: !activeDebtTab ? '#1C1C1E' : '#F3F4F6', color: !activeDebtTab ? '#FFF' : '#6B7280', padding: '8px 16px', borderRadius: 99, fontWeight: 900, fontSize: 13, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, textTransform: 'uppercase' }}>
                                            <History size={16} /> Đang làm
                                        </button>
                                        <button onClick={() => setActiveDebtTab(true)} style={{ background: activeDebtTab ? '#8b5cf6' : '#F3F4F6', color: activeDebtTab ? '#FFF' : '#6B7280', padding: '8px 16px', borderRadius: 99, fontWeight: 900, fontSize: 13, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, textTransform: 'uppercase' }}>
                                            <BookOpen size={16} /> Ghi nợ
                                        </button>
                                    </div>
                                ) : (
                                    <h3 style={{ fontSize: 20, fontWeight: 900, color: '#1C1C1E', textTransform: 'uppercase', letterSpacing: '1px' }}>Đơn Đang Thực Hiện</h3>
                                )}
                                <button onClick={() => setShowPendingOrdersModal(false)} style={{ background: '#F3F4F6', border: 'none', width: 44, height: 44, borderRadius: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4B5563' }}>
                                    <X size={24} />
                                </button>
                            </div>

                            {/* Orders List */}
                            <div style={{ flex: 1, overflowY: 'auto', padding: 24 }} onPointerDownCapture={(e) => e.stopPropagation()}>
                                {(() => {
                                    const displayOrders = activeDebtTab ? debtOrders : pendingOrders.filter(p => !debtOrders.some(d => d.id === p.id));
                                    const emptyMsg = activeDebtTab ? 'Không có đơn nợ nào.' : 'Hiện không có đơn nào đang chờ';

                                    if (displayOrders.length === 0) {
                                        return (
                                            <div style={{ textAlign: 'center', marginTop: 100, color: '#9CA3AF' }}>
                                                {activeDebtTab ? <BookOpen size={64} style={{ margin: '0 auto 16px', opacity: 0.5 }} /> : <Coffee size={64} style={{ margin: '0 auto 16px', opacity: 0.5 }} />}
                                                <p style={{ fontWeight: 700, fontSize: 16 }}>{emptyMsg}</p>
                                            </div>
                                        );
                                    }

                                    return (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                            {displayOrders.map((order, idx) => (
                                                <div key={idx} style={{ background: '#FFF', borderRadius: 20, padding: 20, boxShadow: '0 4px 12px rgba(0,0,0,0.05)', border: `1px solid ${activeDebtTab ? '#D8B4FE' : '#F3F4F6'}` }}>
                                                    <div style={{ marginBottom: 12, borderBottom: `1px solid ${activeDebtTab ? '#F3E8FF' : '#F3F4F6'}`, paddingBottom: 12 }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                                                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0, flex: 1 }}>
                                                                <div style={{ width: 40, height: 40, background: activeDebtTab ? '#8b5cf6' : '#007AFF', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', fontWeight: 900, fontSize: 18, flexShrink: 0 }}>
                                                                    {order.queueNumber}
                                                                </div>
                                                                {order.tagNumber && (
                                                                    <div style={{ width: 40, height: 40, background: activeDebtTab ? '#6D28D9' : '#1C1C1E', borderRadius: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#FFF', fontWeight: 900, fontSize: 14, border: `1px solid ${activeDebtTab ? '#5B21B6' : '#3A3A3C'}`, flexShrink: 0, lineHeight: 1 }}>
                                                                        <span style={{ fontSize: 9, opacity: 0.8, marginBottom: 2 }}>TAG</span>
                                                                        <span>{order.tagNumber}</span>
                                                                    </div>
                                                                )}
                                                                <div style={{ minWidth: 0 }}>
                                                                    <p style={{ fontWeight: 900, fontSize: 14, color: activeDebtTab ? '#5B21B6' : '#1C1C1E', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{order.customerName}</p>
                                                                    <p style={{ fontSize: 12, color: activeDebtTab ? '#8B5CF6' : '#6B7280', fontWeight: 700 }}>TG: {formatTime(order.timestamp)}</p>
                                                                </div>
                                                            </div>
                                                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                                <span style={{ fontSize: 10, fontWeight: 900, background: activeDebtTab ? '#F3E8FF' : (!order.isPaid ? '#FEF3C7' : '#E0E7FF'), color: activeDebtTab ? '#7C3AED' : (!order.isPaid ? '#D97706' : '#4338CA'), padding: '4px 8px', borderRadius: 6, textTransform: 'uppercase' }}>
                                                                    {activeDebtTab ? 'GHI NỢ (CHƯA TT)' : (!order.isPaid ? (order.status === 'COMPLETED' ? 'Đã Xong (Chưa TT)' : 'Chưa TT') : 'Đang Pha')}
                                                                </span>
                                                                <p style={{ fontWeight: 900, fontSize: 16, color: activeDebtTab ? '#6D28D9' : '#C68E5E', marginTop: 4 }}>{formatVND(order.price)}</p>
                                                            </div>
                                                        </div>

                                                        {!order.isPaid && (
                                                            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 12 }}>
                                                                <button 
                                                                    onClick={() => setPaymentQrOrder(order)}
                                                                    style={{ background: activeDebtTab ? '#8b5cf6' : '#007AFF', color: 'white', border: 'none', padding: '10px', borderRadius: 12, fontSize: 12, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flex: 1 }}>
                                                                    <QrCode size={16} /> MỞ QR
                                                                </button>
                                                                <button 
                                                                    onClick={() => {
                                                                        setUploadingOrderId(order.id);
                                                                        if (fileInputRef.current) fileInputRef.current.click();
                                                                    }}
                                                                    style={{ background: activeDebtTab ? '#6D28D9' : '#34C759', color: 'white', border: 'none', padding: '10px', borderRadius: 12, fontSize: 12, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flex: 1 }}>
                                                                    <Camera size={16} /> XÁC NHẬN
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Items */}
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                        {order.cartItems && order.cartItems.length > 0 ? order.cartItems.map((item, i) => (
                                                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                                <div>
                                                                    <p style={{ fontWeight: 800, fontSize: 14, color: '#374151' }}>{i + 1}. {item.item?.name || 'Món'} <span >x{item.count}</span></p>
                                                                    <p style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600, marginTop: 2 }}>
                                                                        Size: {item.size?.label || 'Mặc định'}
                                                                        {item.sugar && ` • ${item.sugar}`}
                                                                        {item.ice && ` • ${item.ice}`}
                                                                    </p>
                                                                    {item.addons?.length > 0 && (
                                                                        <p style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600 }}>Thêm: {item.addons.map(a => a.label).join(', ')}</p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )) : (
                                                            <div style={{ padding: '8px 0' }}>
                                                                <p style={{ fontSize: 13, fontWeight: 700, color: '#4B5563', lineHeight: 1.5, whiteSpace: 'pre-line' }}>{order.itemName}</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })()}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

            </div>
            {/* --- HIDDEN FILE INPUT FOR RECEIPT --- */}
            <input 
                type="file" 
                accept="image/*" 
                capture="environment" 
                ref={fileInputRef} 
                style={{ display: 'none' }} 
                onChange={handleCaptureReceipt} 
            />

            {/* --- PAYMENT QR MODAL FOR KIOSK IPAD --- */}
            <AnimatePresence>
                {paymentQrOrder && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
                    >
                        <div style={{ background: '#FFF', borderRadius: 24, padding: 32, width: '100%', maxWidth: 400, textAlign: 'center', position: 'relative' }}>
                            <button onClick={() => setPaymentQrOrder(null)} style={{ position: 'absolute', top: 16, right: 16, background: '#F3F4F6', border: 'none', width: 36, height: 36, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <X size={20} />
                            </button>
                            <h3 style={{ fontSize: 22, fontWeight: 900, marginBottom: 8, color: '#1C1C1E' }}>Thanh toán đơn hàng</h3>
                            <p style={{ fontSize: 15, fontWeight: 700, color: '#6B7280', marginBottom: 24 }}>#{paymentQrOrder.queueNumber} - {formatVND(paymentQrOrder.price)}</p>
                            
                            <div style={{ background: '#F8F9FA', padding: 16, borderRadius: 16, display: 'inline-block', marginBottom: 24 }}>
                                <img 
                                    src={getVietQR(paymentQrOrder.price, paymentQrOrder.queueNumber || paymentQrOrder.id)}
                                    style={{ width: 240, height: 240, objectFit: 'contain', borderRadius: 8 }} 
                                    alt="VietQR" 
                                />
                            </div>
                            
                            <button 
                                onClick={() => {
                                    setUploadingOrderId(paymentQrOrder.id);
                                    if (fileInputRef.current) fileInputRef.current.click();
                                }}
                                style={{ width: '100%', background: '#34C759', color: 'white', border: 'none', padding: '16px', borderRadius: 16, fontSize: 16, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                            >
                                <Camera size={20} /> CHỤP LẠI BILL
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default CustomerKiosk;
