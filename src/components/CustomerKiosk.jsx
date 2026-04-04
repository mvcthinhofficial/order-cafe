import React, { useState, useEffect, useRef, useMemo } from 'react';
import { formatTime, formatDate, formatDateTime, getDateStr } from '../utils/timeUtils';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X, CheckCircle, CreditCard, Coffee, Sparkles, QrCode, Camera, Gift, ChevronDown, ChevronUp, Trash2, BookOpen, History, User
} from 'lucide-react';
import { SERVER_URL, getImageUrl } from '../api.js';
import { calculateCartWithPromotions } from '../utils/promotionEngine';
import IceLevelIcon from './IceLevelIcon';
import SugarLevelIcon from './SugarLevelIcon';
import SharedCustomizationModal from './SharedCustomizationModal';
import { QRCodeCanvas } from 'qrcode.react';
import StaffQrKiosk from './StaffQrKiosk';
import LoyaltyIdentifyModal from './AdminDashboardTabs/modals/LoyaltyIdentifyModal';

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
    // hasActivePromoCode: đặt SAU khai báo cart để tránh TDZ (Temporal Dead Zone)
    
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

    // --- LOYALTY ---
    const [customerProfile, setCustomerProfile] = useState(null);
    const [showIdentityModal, setShowIdentityModal] = useState(false);
    const [showMemberMenu, setShowMemberMenu] = useState(false);

    // ─── AUTO DETECT THÀNH VIÊN từ localStorage ──────────────────────────────
    // Dùng cùng key với LoyaltyPage để khách đã "nhớ thiết bị" tự động nhận diện
    const KIOSK_LS_KEY = 'loyalty_remembered_customer';
    useEffect(() => {
        (async () => {
            try {
                const saved = localStorage.getItem(KIOSK_LS_KEY);
                if (!saved) return;
                const parsed = JSON.parse(saved);
                if (!parsed?.phone || !parsed?.name) return;

                // Tra cứu server để xác nhận vẫn còn trong hệ thống
                const res = await fetch(`${SERVER_URL}/api/loyalty/customer/${parsed.phone}`);
                const data = await res.json();
                if (data.success && data.customer) {
                    setCustomerProfile(data.customer);
                    // Cập nhật cache với dữ liệu mới nhất
                    try {
                        localStorage.setItem(KIOSK_LS_KEY, JSON.stringify({
                            phone: data.customer.phone,
                            name: data.customer.name,
                            tier: data.customer.tier,
                        }));
                    } catch {}
                }
                // Nếu không tìm thấy → không làm gì, để khách tự bấm đăng nhập
            } catch { /* Mạng lỗi → bỏ qua */ }
        })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    // ─────────────────────────────────────────────────────────────────────────

    // Hiện ô nhập mã khi: có PROMO_CODE đang bật + giỏ hàng có món thuộc chương trình
    // HOẶC khách đăng nhập có voucher cá nhân (specificPhone)
    // Đặt SAU useState([cart]) để tránh TDZ (Temporal Dead Zone)
    const hasActivePromoCode = (promotions || []).some(p => {
        if (!p.isActive || p.type !== 'PROMO_CODE') return false;
        if (p.startDate && new Date(`${p.startDate}T00:00:00`).getTime() > Date.now()) return false;
        if (p.endDate   && new Date(`${p.endDate}T23:59:59`).getTime()   < Date.now()) return false;
        if (p.specificPhone) return p.specificPhone === (customerProfile?.phone || null);
        const ids = p.applicableItems || [];
        if (ids.length === 0 || ids.includes('ALL')) return true;
        return cart.some(c => ids.includes(c.item?.id));
    });
    const personalVoucher = (promotions || []).find(p =>
        p.isActive && p.type === 'PROMO_CODE' && p.specificPhone
        && p.specificPhone === customerProfile?.phone
        && p.endDate && new Date(`${p.endDate}T23:59:59`).getTime() >= Date.now()
    );
    
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

    // fetchPendingOrders: dùng làm ref để SSE có thể gọi ngay khi có order mới
    const fetchPendingOrdersRef = useRef(null);
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
        fetchPendingOrdersRef.current = fetchPendingOrders;
        fetchPendingOrders();
        // 10s backup nếu SSE miss event (thay vì 3s polling cũ)
        const interval = setInterval(fetchPendingOrders, 10000);
        return () => clearInterval(interval);
    }, []);

    // ─── SSE CONNECTION ───────────────────────────────────────────────────────
    // Thay thế pollKioskEvents (2s) + giảm fetchPendingOrders (3s→10s backup)
    // SSE connection đến /api/events — cùng endpoint với AdminDashboard
    useEffect(() => {
        let es = null;
        let debounceTimer = null;
        let reconnectTimer = null;

        const handleKioskQrDebt = async (orderId) => {
            try {
                const orderRes = await fetch(`${SERVER_URL}/api/orders?id=${orderId}`);
                if (!orderRes.ok) return;
                const orderList = await orderRes.json();
                const targetOrder = orderList.find(o => o.id === orderId);
                if (targetOrder && !targetOrder.isPaid) {
                    setActiveDebtTab(true);
                    setShowPendingOrdersModal(true);
                    setPaymentQrOrder(targetOrder);
                    await fetch(`${SERVER_URL}/api/kiosk/clear-qr`, { method: 'POST' });
                }
            } catch (e) {}
        };

        const connect = () => {
            es = new EventSource(`${SERVER_URL}/api/events`);

            es.addEventListener('ORDER_CHANGED', () => {
                // Debounce 200ms để gom burst từ nhiều order cùng lúc
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    if (fetchPendingOrdersRef.current) fetchPendingOrdersRef.current();
                }, 200);
            });

            es.addEventListener('KIOSK_QR_DEBT', (e) => {
                // Server push ngay khi admin trigger debt QR → không cần poll 2s
                try {
                    const data = JSON.parse(e.data);
                    if (data.orderId) handleKioskQrDebt(data.orderId);
                } catch {}
            });

            es.onerror = () => {
                es.close();
                reconnectTimer = setTimeout(connect, 5000); // Reconnect sau 5s
            };
        };

        connect();
        return () => {
            if (es) es.close();
            clearTimeout(debounceTimer);
            clearTimeout(reconnectTimer);
        };
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

    // MoMo ảnh tĩnh (lấy từ app MoMo, chuẩn VietQR/NAPAS)
    const getMomoImgSrc = () => {
        const url = settings?.momoQrImageUrl || '';
        if (!url) return null;
        if (url.startsWith('http') || url.startsWith('blob') || url.startsWith('data')) return url;
        return `${SERVER_URL}/${url}`;
    };

    const kioskHasMomo = !!(settings?.momoEnabled && settings?.momoQrImageUrl);
    const kioskHasVietQr = !!(settings?.customQrUrl || (settings?.bankId && settings?.accountNo));
    const [kioskQrTab, setKioskQrTab] = useState('vietqr'); // 'vietqr' | 'momo'

    // Cập nhật tab mặc định khi settings thay đổi
    useEffect(() => {
        setKioskQrTab((settings?.momoPreferred && kioskHasMomo) ? 'momo' : 'vietqr');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [settings?.momoPreferred, settings?.momoEnabled, settings?.momoPhone]);

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
        // 15s — SSE xử lý order sync real-time, đây chỉ để cập nhật menu/availablePortions
        const interval = setInterval(fetchData, 15000);
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

    // Poll for completed order notifications — 10s thay vì 5s (ít quan trọng hơn)
    useEffect(() => {
        const poll = setInterval(async () => {
            try {
                const r = await fetch(`${SERVER_URL}/api/notifications/completed`);
                const data = await r.json();
                if (data.length > 0) {
                    setCompletedQueue(data);
                    for (const n of data) {
                        await fetch(`${SERVER_URL}/api/notifications/dismiss/${n.queueNumber}`, { method: 'POST' });
                    }
                    setTimeout(() => setCompletedQueue([]), 8000);
                }
            } catch (e) { /* ignore */ }
        }, 10000);
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
        const promoResult = calculateCartWithPromotions(cart, promotions, promoCodeInput, menu, selectedPromoId, settings.enablePromotions, customerProfile?.phone || null);
        
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
    };

    // Memo hoá kết quả calculateCart — tránh gọi calculateCartWithPromotions() 3 lần/render
    // trong Cart Modal. Chỉ tính lại khi cart, promotions hoặc settings thực sự thay đổi.
    const cartCalcResult = useMemo(
        () => calculateCart(),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [cart, promotions, promoCodeInput, selectedPromoId, menu, settings?.enablePromotions, settings?.taxMode, settings?.taxRate]
    );

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
                customerName: customerProfile ? customerProfile.name : (tableNumber ? (settings?.isTakeaway ? `Khách Thẻ ${tableNumber}` : `Khách Bàn ${tableNumber}`) : 'Khách Kiosk'),
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
                customerId: customerProfile ? customerProfile.phone : null,
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
                // Mobile web: giữ thành viên — không reset để khách thấy điểm tích lũy
                // Refresh điểm từ server sau khi order thành công
                if (customerProfile?.phone) {
                    try {
                        const profileRes = await fetch(`${SERVER_URL}/api/loyalty/customer/${customerProfile.phone}`);
                        const profileData = await profileRes.json();
                        if (profileData.success && profileData.customer) {
                            setCustomerProfile(profileData.customer);
                        }
                    } catch {}
                }
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
        <div className="fixed inset-0 flex items-center justify-center bg-bg-global">
            <div className="text-center">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                    className="w-14 h-14 rounded-full border-4 border-brand-500 border-t-transparent mx-auto mb-4"
                />
                <p className="text-brand-600 font-black tracking-[0.2em] text-xs">LOADING MENU...</p>
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 flex flex-col font-sans select-none overflow-hidden bg-bg-global text-text-primary">
            
            {qrInfo?.showStaffQrOnKiosk && (
                 <div className="absolute inset-0 z-[1000] bg-bg-surface">
                     <StaffQrKiosk isEmbedded={true} />
                 </div>
            )}

            {/* Main Container */}
            <div className="flex-1 flex flex-col bg-bg-surface overflow-hidden relative shadow-[0_20px_80px_rgba(0,0,0,0.08)]" style={{ margin: '8px', borderRadius: 'var(--radius-modal)' }}>

                {/* ── HEADER ── */}
                <header className="bg-bg-surface flex justify-between items-center z-50 border-b border-gray-100 sticky top-0" style={{ padding: '16px 24px' }}>
                    <div className="flex items-center gap-3.5">
                        {settings.headerImageUrl ? (
                            <img src={getImageUrl(settings.headerImageUrl)} alt={settings.shopName} className="h-11 rounded-lg object-contain" />
                        ) : (
                            <>
                                <div className="w-11 h-11 rounded-xl flex items-center justify-center shadow-md bg-btn-bg text-btn-text">
                                    <Coffee size={22} color="#FFF" />
                                </div>
                                <div className="flex flex-col">
                                    <h1 className="text-[20px] font-black tracking-tight leading-none mb-0.5 text-[#1C1C1E]">
                                        {settings.shopName}
                                    </h1>
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-brand-600">
                                        {settings.shopSlogan || 'Tự chọn • Tự phục vụ'}
                                    </p>
                                </div>
                            </>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {customerProfile ? (
                            <div className="relative">
                                <button
                                    onClick={() => setShowMemberMenu(v => !v)}
                                    className="bg-brand-50 hover:bg-brand-100 text-brand-700 transition-colors flex items-center shadow-sm cursor-pointer border border-brand-200"
                                    style={{ padding: '8px 16px', borderRadius: '999px', gap: '8px' }}
                                >
                                    <div className="w-6 h-6 rounded-full bg-brand-500 text-white flex items-center justify-center font-bold text-[10px]">
                                        {customerProfile.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex flex-col text-left">
                                        <span className="text-[12px] font-black leading-none mb-1">{customerProfile.name}</span>
                                        <span className="text-[10px] font-bold leading-none text-brand-600">Hạng {customerProfile.tier} • {customerProfile.points} Điểm</span>
                                    </div>
                                </button>

                                {/* Dropdown menu */}
                                {showMemberMenu && (
                                    <>
                                        {/* Overlay để đóng menu */}
                                        <div className="fixed inset-0 z-40" onClick={() => setShowMemberMenu(false)} />
                                        <div className="absolute right-0 top-full mt-2 z-50 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden" style={{ minWidth: 200 }}>
                                            <div className="px-4 py-3 bg-brand-50 border-b border-brand-100">
                                                <p className="text-[11px] font-black text-brand-700 uppercase tracking-wider">{customerProfile.name}</p>
                                                <p className="text-[10px] text-brand-500 font-bold">{customerProfile.points} điểm • Hạng {customerProfile.tier}</p>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    setShowMemberMenu(false);
                                                    window.open('/loyalty', '_blank');
                                                }}
                                                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-indigo-50 transition-colors"
                                            >
                                                <span style={{ fontSize: 18 }}>⭐</span>
                                                <div>
                                                    <p className="text-[12px] font-black text-gray-900">Xem điểm thành viên</p>
                                                    <p className="text-[10px] text-gray-400 font-medium">Lịch sử & đổi điểm</p>
                                                </div>
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setShowMemberMenu(false);
                                                    try { localStorage.removeItem(KIOSK_LS_KEY); } catch {}
                                                    setCustomerProfile(null);
                                                    setShowIdentityModal(true);
                                                }}
                                                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-red-50 transition-colors border-t border-gray-50"
                                            >
                                                <span style={{ fontSize: 18 }}>🔄</span>
                                                <div>
                                                    <p className="text-[12px] font-black text-gray-700">Đổi thành viên</p>
                                                    <p className="text-[10px] text-gray-400 font-medium">Đăng nhập tài khoản khác</p>
                                                </div>
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        ) : (
                            <button
                                onClick={() => setShowIdentityModal(true)}
                                className="bg-gray-100 hover:bg-brand-50 transition-colors flex items-center text-gray-700 hover:text-brand-600 shadow-sm cursor-pointer"
                                style={{ padding: '10px 16px', borderRadius: '999px', gap: '8px' }}
                            >
                                <User size={18} strokeWidth={2.5}/>
                                <span className="text-[12px] font-black uppercase tracking-[0.5px]">Thành viên</span>
                            </button>
                        )}
                    </div>
                </header>

                <LoyaltyIdentifyModal 
                    isOpen={showIdentityModal}
                    onClose={() => setShowIdentityModal(false)}
                    onIdentify={(profile) => {
                        setCustomerProfile(profile);
                        // ✅ Lưu vào localStorage để giữ session qua F5
                        try {
                            localStorage.setItem(KIOSK_LS_KEY, JSON.stringify({
                                phone: profile.phone,
                                name: profile.name,
                                tier: profile.tier,
                            }));
                        } catch {}
                    }}
                    isMobile={isMobile}
                />

                {/* ── QR CODE MODAL ── */}
                <AnimatePresence>
                    {showQrModal && (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[1000] bg-black/90 backdrop-blur-xl flex items-center justify-center flex-col"
                            style={{ padding: '24px' }}
                        >
                            <motion.div
                                initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
                                className="bg-white text-center w-full relative shadow-[0_40px_100px_rgba(0,0,0,0.5)] overflow-y-auto flex flex-col items-center"
                                style={{ padding: '48px 32px', borderRadius: 'var(--radius-modal)', maxHeight: '100%', maxWidth: '650px' }}
                            >
                                <button onClick={async () => {
                                    setShowQrModal(false);
                                    if (qrInfo.posCheckoutSession) {
                                        await fetch(`${SERVER_URL}/api/pos/checkout/stop`, { method: 'POST' });
                                    } else {
                                        await fetch(`${SERVER_URL}/api/settings/kiosk-dismiss`, { method: 'POST' });
                                    }
                                }} className="absolute bg-gray-100 hover:bg-gray-200 transition-colors rounded-full flex items-center justify-center text-gray-700 cursor-pointer"
                                style={{ top: '24px', right: '24px', width: '44px', height: '44px' }}>
                                    <X size={24} strokeWidth={2.5} />
                                </button>

                                {qrInfo.posCheckoutSession ? (
                                    <>
                                        <div className="inline-flex items-center bg-[#F5A623]/10 text-[#D97706] rounded-full justify-center" style={{ padding: '12px 24px', gap: '8px', marginBottom: '24px' }}>
                                            <CreditCard size={20} />
                                            <span className="font-black text-[14px] uppercase tracking-[2px]">VUI LÒNG QUÉT MÃ ĐỂ THANH TOÁN</span>
                                        </div>

                                        {/* Tab Switcher MoMo / VietQR */}
                                        {kioskHasMomo && kioskHasVietQr && (
                                            <div style={{ display: 'flex', borderRadius: '999px', overflow: 'hidden', border: '2px solid #E2E8F0', marginBottom: '20px', gap: 0 }}>
                                                <button
                                                    onClick={() => setKioskQrTab('vietqr')}
                                                    style={{
                                                        flex: 1, padding: '12px 20px', fontSize: '13px', fontWeight: 900,
                                                        background: kioskQrTab === 'vietqr' ? '#0066CC' : '#F8FAFC',
                                                        color: kioskQrTab === 'vietqr' ? '#fff' : '#94A3B8',
                                                        border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                                    }}
                                                >
                                                    🏦 VietQR
                                                </button>
                                                <button
                                                    onClick={() => setKioskQrTab('momo')}
                                                    style={{
                                                        flex: 1, padding: '12px 20px', fontSize: '13px', fontWeight: 900,
                                                        background: kioskQrTab === 'momo' ? '#A50064' : '#F8FAFC',
                                                        color: kioskQrTab === 'momo' ? '#fff' : '#94A3B8',
                                                        border: 'none', borderLeft: '2px solid #E2E8F0', cursor: 'pointer', transition: 'all 0.15s',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                                    }}
                                                >
                                                    💜 MoMo
                                                </button>
                                            </div>
                                        )}

                                        <div className="bg-white inline-block shadow-sm" style={{ padding: '12px', borderRadius: '24px', marginBottom: '24px', border: `8px solid ${kioskQrTab === 'momo' ? '#F8E0F1' : '#F9FAFB'}` }}>
                                            {/* VietQR */}
                                            {(kioskQrTab === 'vietqr' || !kioskHasMomo) && (
                                                settings.preferDynamicQr !== false || !settings.customQrUrl ? (
                                                    <img src={getVietQR(qrInfo.posCheckoutSession.amount, qrInfo.posCheckoutSession.orderId)} style={{ width: '320px', height: '320px' }} className="object-contain" alt="VietQR" />
                                                ) : (
                                                    <img src={getImageUrl(settings.customQrUrl)} style={{ width: '320px', height: '320px' }} className="object-contain" alt="Payment QR" />
                                                )
                                            )}
                                            {/* MoMo QR — ảnh tĩnh upload từ app MoMo */}
                                            {kioskQrTab === 'momo' && kioskHasMomo && (
                                                getMomoImgSrc() ? (
                                                    <img
                                                        src={getMomoImgSrc()}
                                                        alt="QR MoMo"
                                                        style={{ width: '320px', height: '320px', objectFit: 'contain' }}
                                                    />
                                                ) : (
                                                    <div style={{ width: '320px', height: '320px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        <p style={{ color: '#E2C0D8', fontSize: '14px', fontWeight: 700 }}>Chưa cấu hình MoMo</p>
                                                    </div>
                                                )
                                            )}
                                        </div>

                                        <div className="bg-gray-50 inline-flex flex-col w-full justify-center" style={{ padding: '24px', gap: '8px', borderRadius: '24px' }}>
                                            <p className="text-gray-400 text-[11px] font-black uppercase tracking-[1px] m-0 leading-none">TỔNG SỐ TIỀN</p>
                                            <p className="text-gray-900 text-[64px] font-black tracking-tighter m-0 leading-none">{formatVND(qrInfo.posCheckoutSession.amount)}</p>
                                        </div>

                                        <p className="mt-8 text-gray-500 font-semibold text-[16px] leading-[1.6] max-w-[450px] mx-auto">
                                            {kioskQrTab === 'momo' && kioskHasMomo
                                                ? <>Quét QR bằng app <b>MoMo</b> trên điện thoại.<br />Nhập đúng số tiền và xác nhận để hoàn tất.</>
                                                : <>Vui lòng thực hiện chuyển khoản đúng số tiền.<br />Nội dung chuyển khoản: {settings.shopName}</>
                                            }
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        <div className="inline-flex items-center bg-emerald-500/10 text-emerald-600 rounded-full justify-center" style={{ padding: '12px 24px', gap: '8px', marginBottom: '24px' }}>
                                            <Sparkles size={20} />
                                            <span className="font-black text-[14px] uppercase tracking-[2px]">QUÉT MÃ ĐỂ ĐẶT MÓN TỪ XA</span>
                                        </div>

                                        <div className="bg-white border-8 border-gray-50 inline-block shadow-sm" style={{ padding: '12px', borderRadius: '24px', marginBottom: '24px' }}>
                                            <QRCodeCanvas
                                                key={qrInfo.token}
                                                value={qrInfo.orderUrl}
                                                size={320}
                                                level="H"
                                                includeMargin={false}
                                                style={{ width: '320px', height: '320px' }}
                                            />
                                        </div>

                                        <div className="bg-gray-50 inline-flex flex-col w-full justify-center items-center" style={{ padding: '24px', gap: '8px', borderRadius: '24px' }}>
                                            <p className="text-gray-400 text-[11px] font-black uppercase tracking-[1px] m-0 leading-none">MÃ PHIÊN LÀM VIỆC</p>
                                            <p className="text-gray-900 text-[32px] font-black tracking-[4px] m-0 leading-none">{qrInfo.token}</p>
                                        </div>

                                        <p className="mt-6 text-gray-500 font-semibold text-[14px] md:text-[16px] leading-[1.6] max-w-[450px] mx-auto">
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
                            className="fixed inset-0 z-[2000] bg-white/95 backdrop-blur-xl flex items-center justify-center p-4"
                        >
                            <motion.div
                                initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}
                                className="text-center max-w-[600px] w-full"
                            >
                                <div className="bg-green-500 flex items-center justify-center mx-auto shadow-[0_20px_40px_rgba(52,199,89,0.3)]" style={{ width: '120px', height: '120px', borderRadius: '50%', marginBottom: '32px' }}>
                                    <CheckCircle size={64} color="#FFF" />
                                </div>
                                <h2 className="text-[32px] md:text-[48px] font-black text-gray-900 mb-3 leading-tight">THANH TOÁN THÀNH CÔNG</h2>
                                <p className="text-[18px] md:text-[24px] text-gray-500 font-semibold">Cảm ơn bạn! Đơn hàng đang được chuẩn bị.</p>
                                <motion.div
                                    initial={{ scaleX: 1 }}
                                    animate={{ scaleX: 0 }}
                                    transition={{ duration: 5, ease: 'linear' }}
                                    style={{ transformOrigin: 'left' }}
                                    className="h-1 bg-green-500 rounded-full mt-10"
                                />
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>



                <main className="flex-1 flex flex-col overflow-hidden">
                    {/* ── CATEGORY NAV ── */}
                    <div className="flex overflow-x-auto border-b border-[#F3F0EB] bg-[#FDFCFA] no-scrollbar items-center" style={{ padding: '12px', gap: '10px' }}>
                        {['TẤT CẢ', ...categories].map(cat => {
                            const isActive = activeCategory === cat;
                            const color = cat === 'TẤT CẢ' ? '#1C1C1E' : getCategoryColor(cat);
                            return (
                                <button
                                    key={cat}
                                    onClick={() => cat === 'TẤT CẢ' ? (setActiveCategory('TẤT CẢ'), scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })) : scrollToCategory(cat)}
                                    className={`flex items-center font-black text-[11px] whitespace-nowrap cursor-pointer transition-all duration-200 border-2`}
                                    style={{
                                        padding: '8px 16px', gap: '8px', borderRadius: '999px',
                                        borderColor: isActive ? color : '#E5E7EB',
                                        background: isActive ? color : '#FFF',
                                        color: isActive ? '#FFF' : '#6B7280',
                                        boxShadow: isActive ? `0 4px 12px ${color}40` : 'none',
                                    }}
                                >
                                    {cat !== 'TẤT CẢ' && (
                                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: isActive ? 'rgba(255,255,255,0.8)' : color }} />
                                    )}
                                    {cat.toUpperCase()}
                                </button>
                            );
                        })}
                    </div>

                    {/* ── MENU GRID ── */}
                    <div ref={scrollContainerRef} className="flex-1 overflow-y-auto bg-[#FDFCFA] custom-scrollbar" style={{ padding: '24px' }}>
                        {sortedCategories.map(category => (
                            <div key={category} ref={el => categoryRefs.current[category] = el} style={{ marginBottom: '40px' }}>
                                {/* Category Header */}
                                <div className="flex items-center bg-[#1A202C] shadow-sm" style={{ padding: '10px 16px', marginBottom: '16px', gap: '12px', borderRadius: '14px', borderLeft: `6px solid ${getCategoryColor(category)}` }}>
                                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: getCategoryColor(category) }} />
                                    <h2 className="text-xs font-black uppercase tracking-[0.15em] text-white flex-1">{category}</h2>
                                    <span className="text-[10px] text-[#A0AEC0] font-bold bg-black/20 px-2 py-0.5 rounded">
                                        {menu.filter(i => i.category === category).length} món
                                    </span>
                                </div>

                                {/* Product Grid: Responsive pure CSS */}
                                <div className="grid grid-cols-2 min-[600px]:grid-cols-3 md:grid-cols-4 min-[1100px]:grid-cols-5 xl:grid-cols-6" style={{ gap: '16px' }}>
                                    {menu.filter(item => item.category === category).map(item => (
                                        <motion.div
                                            key={item.id}
                                            onClick={() => { if (!item.isSoldOut) handlePlusClick(item); }}
                                            whileHover={item.isSoldOut ? {} : { y: -4, boxShadow: '0 12px 30px rgba(0,0,0,0.1)' }}
                                            className={`bg-white border border-[#F3F0EB] overflow-hidden flex flex-col transition-all duration-250 ${item.isSoldOut ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                                            style={{ borderRadius: 'var(--radius-card)' }}
                                        >
                                            {/* Image */}
                                            <div className="aspect-[4/5] bg-gradient-to-br from-[#FDF6EE] to-[#F8EDDC] flex items-center justify-center overflow-hidden relative">
                                                {item.image ? (
                                                    <img src={getImageUrl(item.image)} className={`w-full h-full object-cover ${item.isSoldOut ? 'grayscale' : ''}`} alt={item.name} />
                                                ) : (
                                                    <Coffee size={36} color="#D97706" strokeWidth={1.5} />
                                                )}
                                                {item.isSoldOut && (
                                                    <div className="absolute inset-0 bg-black/10 z-30 flex items-center justify-center">
                                                        <span className="bg-red-600/90 text-white font-black px-4 py-2 text-[13px] uppercase tracking-[2px] shadow-[0_4px_12px_rgba(220,38,38,0.4)] rounded">HẾT MÓN</span>
                                                    </div>
                                                )}
                                                {/* Category Badge */}
                                                <span className="absolute top-2 left-2 bg-black/70 text-white text-[8px] font-black px-2 py-1 rounded-full uppercase tracking-[0.12em]">
                                                    {item.category}
                                                </span>
                                            </div>

                                            {/* Info */}
                                            <div className="flex justify-between items-end" style={{ padding: '16px', paddingBottom: '20px', gap: '8px' }}>
                                                <div className="flex-1 min-w-0">
                                                    <h3 className="font-black text-[14px] text-[#1C1C1E] leading-[1.2] mb-1 line-clamp-2">{item.name}</h3>
                                                    <div className="flex flex-col gap-0.5 items-start">
                                                        <p className="text-[13px] font-black leading-none text-brand-600">{formatVND(item.price)}</p>
                                                        {!item.isSoldOut && item.availablePortions !== null && item.availablePortions !== undefined && item.availablePortions <= (settings?.warningThreshold !== undefined ? settings.warningThreshold : 2) && item.availablePortions > 0 && (
                                                            <span className="text-[12px] font-black text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded leading-none mt-1">
                                                                SL:{item.availablePortions}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); if (!item.isSoldOut) handlePlusClick(item); }}
                                                    className={`w-8 h-8 rounded-full bg-[#F9FAFB] border border-[#E5E7EB] flex items-center justify-center text-[#1C1C1E] flex-shrink-0 ${item.isSoldOut ? 'cursor-not-allowed' : 'cursor-pointer'}`}
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
                                className="fixed top-3 md:top-8 left-1/2 z-[1000] bg-gradient-to-br from-[#1C1C1E] to-[#3A3A3C] rounded-[32px] md:rounded-[40px] p-8 md:p-10 shadow-[0_30px_80px_rgba(0,0,0,0.6)] text-center w-[92%] md:w-auto min-w-auto md:min-w-[500px] max-w-[96%] md:max-w-[700px] border border-white/15 backdrop-blur-md"
                            >
                                <div className="flex flex-col items-center gap-3 md:gap-5">
                                    <div className="bg-[#F5A623]/10 text-[#D97706] px-5 py-2 rounded-full inline-flex items-center gap-2">
                                        <Sparkles className="w-4 h-4 md:w-5 md:h-5" />
                                        <span className="text-xs md:text-sm font-black uppercase tracking-[3px]">🔔 GỌI MÓN</span>
                                    </div>

                                    <div className="flex flex-wrap justify-center gap-4">
                                        {completedQueue.map(n => (
                                            <div key={n.queueNumber} className="relative">
                                                <p className="text-[64px] md:text-[100px] font-black text-white leading-none tracking-[-2px]">
                                                    #{n.queueNumber}
                                                </p>
                                                <motion.div
                                                    animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0.8, 0.5] }}
                                                    transition={{ repeat: 2, duration: 2, repeatDelay: 3 }}
                                                    className="absolute -inset-2.5 border-2 border-[#F5A623] rounded-2xl pointer-events-none"
                                                />
                                            </div>
                                        ))}
                                    </div>

                                    <div className="mt-2 md:mt-4">
                                        <p className="text-[18px] md:text-[22px] text-white font-extrabold mb-1">MỜI QUÝ KHÁCH ĐẾN NHẬN MÓN</p>
                                        <p className="text-[13px] md:text-[16px] text-gray-400 font-semibold">Cảm ơn quý khách đã chờ đợi!</p>
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
                            className="absolute bottom-6 left-1/2 z-[2000] w-[90%] max-w-[400px]"
                        >
                            <button
                                onClick={() => setShowCartModal(true)}
                                className="w-full bg-[#1C1C1E] border border-[#3A3A3C] rounded-full flex items-center justify-between text-white shadow-[0_20px_40px_rgba(0,0,0,0.5)] cursor-pointer"
                                style={{ padding: '12px 12px 12px 28px' }}
                            >
                                <div className="flex flex-col items-start">
                                    <span className="text-[11px] font-black text-gray-400 uppercase tracking-[1px]">Giỏ Hàng Kiosk</span>
                                    <span className="text-[16px] font-black">{formatVND(cart.reduce((s, c) => s + (c.totalPrice * c.count), 0))}</span>
                                </div>
                                <div className="rounded-full font-black text-[14px] flex items-center text-btn-text bg-btn-bg" style={{ padding: '10px 20px', gap: '8px' }}>
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
                            className="absolute left-1/2 z-[1900] w-[90%] max-w-[400px]"
                            style={{ bottom: cart.length > 0 ? 100 : 24 }}
                        >
                            <button
                                onClick={() => { setActiveDebtTab(false); setShowPendingOrdersModal(true); }}
                                className="w-full bg-white/95 border border-gray-200 rounded-full flex items-center justify-between text-[#1C1C1E] shadow-[0_10px_30px_rgba(0,0,0,0.1)] backdrop-blur-md cursor-pointer"
                                style={{ padding: '12px 12px 12px 28px' }}
                            >
                                <div className="flex flex-col items-start">
                                    <span className="text-[11px] font-black text-gray-500 uppercase tracking-[1px]">Đang thực hiện</span>
                                    <span className="text-[16px] font-black text-brand-600">{pendingOrders.length} Đơn</span>
                                </div>
                                <div className="bg-blue-500 rounded-full font-black text-[14px] flex items-center text-white" style={{ padding: '10px 20px', gap: '8px' }}>
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
                            className="absolute left-6 z-[1900]"
                            style={{ bottom: cart.length > 0 ? 100 : 24 }}
                        >
                            <button
                                onClick={() => { setActiveDebtTab(true); setShowPendingOrdersModal(true); }}
                                className="w-[60px] h-[60px] rounded-full bg-purple-500 border-4 border-white text-white flex flex-col items-center justify-center shadow-[0_10px_30px_rgba(139,92,246,0.4)] cursor-pointer hover:bg-purple-600 transition-colors"
                            >
                                <BookOpen size={20} />
                                <span className="text-[10px] font-black mt-0.5">NỢ</span>
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ── CART MODAL ── */}
                <AnimatePresence>
                    {showCartModal && (
                        <div className="fixed inset-0 z-[3000] flex items-center justify-center pointer-events-none" style={{ padding: '24px' }}>
                            <motion.div
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                onClick={() => setShowCartModal(false)}
                                className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto"
                            />
                            <motion.div
                                initial={{ y: "100%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: "100%", opacity: 0 }}
                                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                                className="relative bg-[#F9FAFB] w-full max-w-[500px] shadow-[0_40px_100px_rgba(0,0,0,0.3)] flex flex-col pointer-events-auto"
                                style={{ padding: '40px 28px 28px 28px', borderRadius: 'var(--radius-modal)', maxHeight: '100%' }}
                                drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.5 }}
                                onDragEnd={(e, info) => { if (info.offset.y > 100 || info.velocity.y > 500) setShowCartModal(false); }}
                            >
                                <div className="absolute top-3 left-1/2 -translate-x-1/2 w-10 h-1.5 rounded-full bg-gray-200" />
                                <div className="flex items-center justify-between mb-5">
                                    <h2 className="text-[24px] font-black text-gray-900 tracking-[-0.5px]">Đơn Hàng Của Khách</h2>
                                    <button onClick={() => setShowCartModal(false)} className="bg-gray-200 hover:bg-gray-300 transition-colors border-none w-9 h-9 rounded-full flex items-center justify-center cursor-pointer text-gray-600">
                                        <X size={18} />
                                    </button>
                                </div>
                                
                                <div className="overflow-y-auto flex-1 custom-scrollbar flex flex-col gap-3 pr-1 pb-5" onPointerDownCapture={(e) => e.stopPropagation()}>
                                    {(() => {
                                        const { processedCart } = cartCalcResult;
                                        return processedCart.map((c, i) => {
                                            const sugarOpts = c.item.sugarOptions?.length ? c.item.sugarOptions : KIOSK_DEFAULT_SUGAR;
                                            const iceOpts = c.item.iceOptions?.length ? c.item.iceOptions : KIOSK_DEFAULT_ICE;
                                            const hasSizes = c.item.sizes?.length > 1;
                                            const hasSugar = sugarOpts.length > 1;
                                            const hasIce = iceOpts.length > 1;

                                            return (
                                            <div key={c.id || i} className="relative rounded-2xl shrink-0">
                                                {!c.isGift && (
                                                    <div className="absolute inset-0 bg-red-500 flex items-center justify-end pr-6 rounded-2xl z-[1]">
                                                        <Trash2 size={24} color="#FFF" />
                                                    </div>
                                                )}
                                                <motion.div 
                                                    drag={c.isGift ? false : "x"}
                                                    dragConstraints={{ left: -80, right: 0 }}
                                                    dragDirectionLock
                                                    dragElastic={0.05}
                                                    onDragEnd={(e, info) => {
                                                        if (!c.isGift && info.offset.x < -60) removeItem(c.id);
                                                    }}
                                                    className={`relative z-10 w-full box-border ${c.isGift ? 'bg-emerald-50 border border-emerald-300' : 'bg-white border border-gray-200'}`}
                                                    style={{ padding: '20px', borderRadius: 'var(--radius-card)' }}
                                                >
                                                <div className="flex justify-between items-start mb-3">
                                                    <h3 className={`text-[16px] font-black pr-8 flex items-center gap-1.5 ${c.isGift ? 'text-emerald-800' : 'text-gray-900'}`}>
                                                        {c.isGift && <Gift size={16} className="text-emerald-500" />}
                                                        {c.isGift ? '(KM) ' + c.item.name : c.item.name} 
                                                        <span className="ml-1 text-brand-600">x{c.count}</span>
                                                    </h3>
                                                    {/* Nút xóa — gift item cũng có thể xóa */}
                                                    <button onClick={() => {
                                                        if (c.originalCartItemId) {
                                                            setCart(prev => prev.map(x => x.id === c.originalCartItemId ? { ...x, count: x.count - c.count } : x).filter(x => x.count > 0));
                                                        } else {
                                                            removeItem(c.id);
                                                        }
                                                    }} className="bg-gray-100 hover:bg-red-100 text-red-500 border-none rounded-full w-7 h-7 flex items-center justify-center cursor-pointer absolute top-4 right-4 transition-colors">
                                                        <X size={14} strokeWidth={3} />
                                                    </button>
                                                </div>

                                                {!c.isGift && (
                                                    <div className="flex flex-wrap gap-2 mb-3 relative">
                                                        {/* Edit Size */}
                                                        {hasSizes && (
                                                            <div className="relative">
                                                                <button
                                                                    onClick={() => setEditingOption(editingOption?.id === `size-${i}` ? null : { id: `size-${i}`, index: c.id, type: 'size', opts: c.item.sizes })}
                                                                    className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 py-1.5 px-2.5 rounded-lg text-[13px] font-bold text-gray-600 cursor-pointer hover:bg-gray-100 transition-colors"
                                                                >
                                                                    Size {String(typeof c.size === 'object' && c.size !== null ? (c.size.label || 'S') : (c.size || 'S'))}
                                                                    <ChevronDown size={14} className="text-gray-400" />
                                                                </button>
                                                                {editingOption?.id === `size-${i}` && (
                                                                    <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-[0_10px_25px_rgba(0,0,0,0.1)] z-50 min-w-[120px] overflow-hidden">
                                                                        {editingOption.opts.map(s => {
                                                                            const isSelected = String(typeof c.size === 'object' && c.size !== null ? (c.size.label || 'S') : (c.size || 'S')) === s.label;
                                                                            return (
                                                                            <button
                                                                                key={s.label}
                                                                                onClick={() => updateItemOption(c.id, 'size', s)}
                                                                                className={`block w-full text-left px-4 py-3 border-b border-gray-50 text-[14px] font-extrabold border-none cursor-pointer hover:bg-gray-50 transition-colors ${isSelected ? 'bg-[#F5A623]/5' : 'bg-white'}`}
                                                                                style={{ color: isSelected ? 'var(--brand-600)' : '#4B5563' }}
                                                                            >{s.label}</button>
                                                                        )})}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}

                                                        {/* Edit Sugar */}
                                                        {hasSugar && (
                                                            <div className="relative">
                                                                <button
                                                                    onClick={() => setEditingOption(editingOption?.id === `sugar-${i}` ? null : { id: `sugar-${i}`, index: c.id, type: 'sugar', opts: sugarOpts })}
                                                                    className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 py-1.5 px-2.5 rounded-lg text-[13px] font-bold text-gray-600 cursor-pointer hover:bg-gray-100 transition-colors"
                                                                >
                                                                    {c.sugar}
                                                                    <ChevronDown size={14} className="text-gray-400" />
                                                                </button>
                                                                {editingOption?.id === `sugar-${i}` && (
                                                                    <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-[0_10px_25px_rgba(0,0,0,0.1)] z-50 min-w-[120px] overflow-hidden">
                                                                        {editingOption.opts.map(opt => (
                                                                            <button
                                                                                key={opt}
                                                                                onClick={() => updateItemOption(c.id, 'sugar', opt)}
                                                                                className={`block w-full text-left px-4 py-3 border-b border-gray-50 text-[14px] font-extrabold border-none cursor-pointer hover:bg-gray-50 transition-colors ${c.sugar === opt ? 'bg-[#F5A623]/5' : 'bg-white'}`}
                                                                                style={{ color: c.sugar === opt ? 'var(--brand-600)' : '#4B5563' }}
                                                                            >{opt}</button>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}

                                                        {/* Edit Ice */}
                                                        {hasIce && (
                                                            <div className="relative">
                                                                <button
                                                                    onClick={() => setEditingOption(editingOption?.id === `ice-${i}` ? null : { id: `ice-${i}`, index: c.id, type: 'ice', opts: iceOpts })}
                                                                    className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 py-1.5 px-2.5 rounded-lg text-[13px] font-bold text-gray-600 cursor-pointer hover:bg-gray-100 transition-colors"
                                                                >
                                                                    {c.ice}
                                                                    <ChevronDown size={14} className="text-gray-400" />
                                                                </button>
                                                                {editingOption?.id === `ice-${i}` && (
                                                                    <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-[0_10px_25px_rgba(0,0,0,0.1)] z-50 min-w-[120px] overflow-hidden">
                                                                        {editingOption.opts.map(opt => (
                                                                            <button
                                                                                key={opt}
                                                                                onClick={() => updateItemOption(c.id, 'ice', opt)}
                                                                                className={`block w-full text-left px-4 py-3 border-b border-gray-50 text-[14px] font-extrabold border-none cursor-pointer hover:bg-gray-50 transition-colors ${c.ice === opt ? 'bg-[#F5A623]/5' : 'bg-white'}`}
                                                                                style={{ color: c.ice === opt ? 'var(--brand-600)' : '#4B5563' }}
                                                                            >{opt}</button>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {c.isGift && (
                                                    <p className="text-[12px] text-emerald-500 font-semibold flex flex-wrap gap-1.5 mb-2">
                                                        {c.size && <span>Size {c.size.label}</span>}
                                                        {c.size && <span>•</span>}
                                                        <span>{c.sugar} đường</span>
                                                        <span>•</span>
                                                        <span>{c.ice}</span>
                                                    </p>
                                                )}

                                                {c.addons && c.addons.length > 0 && (
                                                    <div className="flex flex-wrap gap-1.5 mb-3">
                                                        {c.addons.map((a, idx) => (
                                                            <div key={idx} className="bg-brand-50 text-[11px] font-extrabold py-1 pl-2.5 pr-1.5 rounded-md flex items-center gap-1 text-brand-600">
                                                                +{a.label}
                                                                <button onClick={() => removeAddon(c.id, idx)} className="bg-transparent border-none text-inherit flex items-center justify-center cursor-pointer p-0.5 -mr-0.5 opacity-60 hover:opacity-100">
                                                                    <X size={12} strokeWidth={3} />
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                
                                                {c.note && (
                                                    <p className="text-[11px] text-gray-400 italic mb-2">Mô tả: {c.note}</p>
                                                )}

                                                <div className={`text-right mt-2 pt-3 border-t border-dashed ${c.isGift ? 'border-emerald-200' : 'border-gray-100'}`}>
                                                    {c.isGift ? (
                                                        <>
                                                            <span className="text-[12px] font-extrabold text-gray-400 line-through mr-2">{formatVND(c.originalPrice * c.count)}</span>
                                                            <span className="text-[16px] font-black text-emerald-500">0 đ</span>
                                                        </>
                                                    ) : (
                                                        <span className="text-[16px] font-black text-gray-900">{formatVND(c.totalPrice * c.count)}</span>
                                                    )}
                                                </div>
                                                </motion.div>
                                            </div>
                                            );
                                        });
                                    })()}
                                </div>

                                <div className="border-t border-gray-200 pt-5 mt-auto">
                                {/* MÃ KHUYẾN MÃI & THẺ BÀN (Giao diện nhỏ gọn) */}
                                    {(() => {
                                        const { validPromo, availablePromotions } = cartCalcResult;
                                        
                                        return (
                                            <div className="pb-4">
                                                {/* GHI CHÚ ĐƠN HÀNG */}
                                                <div className="flex items-center gap-2 mb-3">
                                                    <label className="text-[11px] font-black text-gray-500 uppercase w-[90px] shrink-0">GHI CHÚ</label>
                                                    <div className="flex-1">
                                                        <input 
                                                            type="text" 
                                                            value={orderNote}
                                                            onChange={e => setOrderNote(e.target.value)}
                                                            placeholder="Cám ơn quán..."
                                                            className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 bg-white text-[14px] font-semibold outline-none transition-colors focus:border-gray-400"
                                                        />
                                                    </div>
                                                </div>
                                                {/* Dòng MÃ KHUYẾN MÃI — chỉ hiện khi có promo nhập mã đang bật */}
                                                {hasActivePromoCode && (<>
                                                {/* Hint voucher cá nhân */}
                                                {personalVoucher && !validPromo && (
                                                    <div
                                                        onClick={() => { setPromoCodeInput(personalVoucher.code); setIsPromoExpanded(true); }}
                                                        className="cursor-pointer mb-2 flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-300"
                                                        style={{ borderRadius: 'var(--radius-badge)' }}
                                                    >
                                                        <span style={{ fontSize: 13 }}>🎁</span>
                                                        <div style={{ flex: 1 }}>
                                                            <p style={{ margin: 0, fontSize: 12, fontWeight: 900, color: '#92400E' }}>
                                                                {customerProfile?.name} có voucher cá nhân!
                                                            </p>
                                                            <p style={{ margin: 0, fontSize: 11, color: '#B45309' }}>
                                                                Mã <span style={{ fontWeight: 900, letterSpacing: '0.08em' }}>{personalVoucher.code}</span>
                                                                {' '}— Giảm {personalVoucher.discountValue}{personalVoucher.discountType === 'PERCENT' ? '%' : 'k'}
                                                            </p>
                                                        </div>
                                                        <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--color-brand)' }}>Áp dụng ↓</span>
                                                    </div>
                                                )}
                                                <div className="flex items-center gap-2 mb-3">
                                                    <label className="text-[13px] font-black text-gray-500 uppercase w-[90px] shrink-0">MÃ KM</label>
                                                    <div className="flex-1 relative">
                                                        <div 
                                                            onClick={() => setIsPromoExpanded(!isPromoExpanded)}
                                                            className={`w-full px-3.5 py-2.5 rounded-lg border flex justify-between items-center cursor-pointer transition-colors ${validPromo ? 'bg-emerald-50 border-emerald-500' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
                                                            style={{ borderColor: validPromo ? 'var(--brand-600)' : '' }}
                                                        >
                                                            <span className="text-[13px] whitespace-nowrap overflow-hidden text-ellipsis" style={{ fontWeight: validPromo ? 800 : 700, color: validPromo ? 'var(--brand-700)' : '#9CA3AF' }}>
                                                                {validPromo ? `✓ ${validPromo.code || validPromo.name}` : 'Nhập mã KM'}
                                                            </span>
                                                            {isPromoExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className={validPromo ? 'text-emerald-700' : 'text-gray-500'} style={{ color: validPromo ? 'var(--brand-700)' : '' }} />}
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
                                                            className="overflow-hidden pl-[98px] mb-4"
                                                        >
                                                            <input 
                                                                type="text" 
                                                                value={promoCodeInput} 
                                                                onChange={e => {
                                                                    setPromoCodeInput(e.target.value.toUpperCase());
                                                                    setSelectedPromoId(null);
                                                                }}
                                                                placeholder="Nhập mã giảm giá..."
                                                                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 outline-none text-[13px] font-bold text-gray-900 transition-colors uppercase mb-2"
                                                                onFocus={(e) => e.target.style.borderColor = 'var(--brand-600)'}
                                                                onBlur={(e) => e.target.style.borderColor = '#E5E7EB'}
                                                            />
                                                            
                                                            {promoCodeInput && availablePromotions.length === 0 && <p className="text-red-500 text-[11px] font-extrabold mb-2">Mã không hợp lệ hoặc chưa đủ điều kiện</p>}
                                                            
                                                            {availablePromotions.length > 0 && (
                                                                <div className="flex flex-col gap-1.5">
                                                                    {availablePromotions.map(ap => {
                                                                        const isSelected = validPromo?.id === ap.promo.id;
                                                                        const brandColor = 'var(--brand-600)';
                                                                        return (
                                                                            <label key={ap.promo.id} className={`flex items-start gap-2 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${isSelected ? 'bg-emerald-50' : 'bg-gray-50 border-gray-200'}`} style={{ borderColor: isSelected ? brandColor : '' }}>
                                                                                <input 
                                                                                    type="radio" 
                                                                                    name="kiosk_promo"
                                                                                    checked={isSelected}
                                                                                    onChange={() => {
                                                                                        setSelectedPromoId(ap.promo.id);
                                                                                        setIsPromoExpanded(false);
                                                                                    }}
                                                                                    className="mt-0.5 scale-110 accent-emerald-500"
                                                                                    style={{ accentColor: brandColor }}
                                                                                />
                                                                                <div className="flex-1">
                                                                                    <p className="text-[12px] font-black mb-0.5" style={{ color: isSelected ? brandColor : '#4B5563' }}>{ap.promo.name}</p>
                                                                                    {ap.messages && ap.messages.map((m, i) => (
                                                                                        <p key={i} className={`text-[10px] font-semibold italic ${isSelected ? 'text-emerald-600' : 'text-gray-500'}`}>- {m}</p>
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
                                                </>)}

                                                {/* Dòng Số Tag / Thẻ Bàn */}
                                                <div className="flex items-center gap-2">
                                                    <label className="text-[13px] font-black text-gray-500 uppercase w-[90px] shrink-0 leading-tight">
                                                        {settings?.isTakeaway ? 'THẺ BÀN' : 'SỐ BÀN'}
                                                    </label>
                                                    <div className="flex-1">
                                                        <input 
                                                            type="text" 
                                                            value={tableNumber} 
                                                            onChange={(e) => setTableNumber(e.target.value)}
                                                            placeholder={settings?.isTakeaway ? 'Nhập số thẻ/tag...' : 'Nhập số/tên bàn...'}
                                                            className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 outline-none text-[13px] font-bold text-gray-900 transition-colors"
                                                            onFocus={(e) => e.target.style.borderColor = 'var(--brand-600)'}
                                                            onBlur={(e) => e.target.style.borderColor = '#E5E7EB'}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {(() => {
                                        const { totalOrderPrice, baseTotal, discount, giftMessages, suggestedGifts } = cartCalcResult;
                                        return (
                                            <>
                                                {discount > 0 && (
                                                    <div className="flex justify-between items-center mb-1">
                                                        <span className="text-[12px] font-black text-gray-400 uppercase">Tạm tính</span>
                                                        <span className="text-[14px] font-black text-gray-400">{formatVND(baseTotal)}</span>
                                                    </div>
                                                )}
                                                {discount > 0 && (
                                                    <div className="flex justify-between items-center mb-2">
                                                        <span className="text-[12px] font-black text-emerald-500 uppercase">Khuyến mãi</span>
                                                        <span className="text-[14px] font-black text-emerald-500">-{formatVND(discount)}</span>
                                                    </div>
                                                )}
                                                {giftMessages && giftMessages.length > 0 && (
                                                    <div className="mb-4 pt-4 border-t border-dashed border-gray-300">
                                                        <p className="text-[12px] font-black text-emerald-500 uppercase mb-2 flex items-center gap-1">
                                                            <Gift size={14}/> THÔNG BÁO QUÀ TẶNG:
                                                        </p>
                                                        <div className="flex flex-col gap-1.5">
                                                            {giftMessages.map((msg, gIdx) => (
                                                                <div key={gIdx} className="flex justify-between bg-emerald-50 px-3 py-2 rounded-lg">
                                                                    <span className="text-[11px] font-extrabold text-emerald-800 flex-1 italic">🎁 {msg}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                        {suggestedGifts && suggestedGifts.length > 0 && (
                                                            <div className="flex gap-2 overflow-x-auto pt-2 pb-1 no-scrollbar">
                                                                {suggestedGifts.map(giftId => {
                                                                    const giftItem = menu.find(m => m.id === giftId);
                                                                    if (!giftItem) return null;
                                                                    return (
                                                                        <button 
                                                                            key={giftId}
                                                                            onClick={() => addSuggestedGiftToCart(giftId)}
                                                                            className="bg-emerald-500 text-white border-none py-2 px-3 rounded-lg text-[11px] font-extrabold cursor-pointer whitespace-nowrap shadow-[0_2px_4px_rgba(16,185,129,0.2)] hover:bg-emerald-600 active:scale-95 transition-all"
                                                                        >
                                                                            + Lấy quà: {giftItem.name}
                                                                        </button>
                                                                    )
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                <div className="flex justify-between items-center mb-5">
                                                    <span className="text-[14px] font-black text-gray-500 uppercase">Tổng cộng</span>
                                                    <span className="text-[28px] font-black text-gray-900 tracking-[-1px]">{formatVND(totalOrderPrice)}</span>
                                                </div>
                                            </>
                                        );
                                    })()}
                                    <button 
                                        onClick={submitOrder} 
                                        disabled={isSubmitting}
                                        className={`w-full text-white border-none font-black text-[16px] flex items-center justify-center transition-all ${isSubmitting ? 'bg-gray-400 cursor-not-allowed' : 'shadow-[0_10px_30px_rgba(16,185,129,0.3)] cursor-pointer hover:opacity-90 active:scale-95'}`}
                                        style={{ background: isSubmitting ? '' : 'var(--btn-bg)', padding: '20px', gap: '10px', borderRadius: 'var(--radius-btn)' }}
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
                            className="fixed inset-0 z-[2100] bg-bg-global flex flex-col pointer-events-auto"
                            drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.5 }}
                            onDragEnd={(e, info) => { if (info.offset.y > 100 || info.velocity.y > 500) setShowPendingOrdersModal(false); }}
                        >
                            <div className="absolute top-3 left-1/2 -translate-x-1/2 w-10 h-1.5 rounded-full bg-gray-200" />
                            {/* Modal Header */}
                            <div className="bg-white flex items-center justify-between border-b border-gray-200 sticky top-0 z-10" style={{ padding: '20px 24px' }}>
                                {debtOrders.length > 0 ? (
                                    <div className="flex gap-3">
                                        <button onClick={() => setActiveDebtTab(false)} className={`px-4 py-2 rounded-full font-black text-[13px] border-none cursor-pointer flex items-center gap-1.5 uppercase transition-colors ${!activeDebtTab ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                                            <History size={16} /> Đang làm
                                        </button>
                                        <button onClick={() => setActiveDebtTab(true)} className={`px-4 py-2 rounded-full font-black text-[13px] border-none cursor-pointer flex items-center gap-1.5 uppercase transition-colors ${activeDebtTab ? 'bg-purple-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                                            <BookOpen size={16} /> Ghi nợ
                                        </button>
                                    </div>
                                ) : (
                                    <h3 className="text-[20px] font-black text-gray-900 uppercase tracking-[1px]">Đơn Đang Thực Hiện</h3>
                                )}
                                <button onClick={() => setShowPendingOrdersModal(false)} className="bg-gray-100 hover:bg-gray-200 transition-colors border-none w-11 h-11 rounded-full flex items-center justify-center text-gray-600 cursor-pointer">
                                    <X size={24} />
                                </button>
                            </div>

                            {/* Orders List */}
                            <div className="flex-1 overflow-y-auto" style={{ padding: '24px' }} onPointerDownCapture={(e) => e.stopPropagation()}>
                                {(() => {
                                    const displayOrders = activeDebtTab ? debtOrders : pendingOrders.filter(p => !debtOrders.some(d => d.id === p.id));
                                    const emptyMsg = activeDebtTab ? 'Không có đơn nợ nào.' : 'Hiện không có đơn nào đang chờ';

                                    if (displayOrders.length === 0) {
                                        return (
                                            <div className="text-center mt-24 text-gray-400">
                                                {activeDebtTab ? <BookOpen size={64} className="mx-auto mb-4 opacity-50" /> : <Coffee size={64} className="mx-auto mb-4 opacity-50" />}
                                                <p className="font-bold text-[16px]">{emptyMsg}</p>
                                            </div>
                                        );
                                    }

                                    return (
                                        <div className="flex flex-col gap-4 max-w-[800px] mx-auto">
                                            {displayOrders.map((order, idx) => (
                                                <div key={idx} className={`bg-white rounded-[20px] shadow-[0_4px_12px_rgba(0,0,0,0.05)] border ${activeDebtTab ? 'border-purple-300' : 'border-gray-100'}`} style={{ padding: '20px' }}>
                                                    <div className={`mb-3 pb-3 border-b ${activeDebtTab ? 'border-purple-100' : 'border-gray-100'}`}>
                                                        <div className="flex justify-between items-start gap-3">
                                                            <div className="flex items-start gap-3 min-w-0 flex-1">
                                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-black text-[18px] shrink-0 ${activeDebtTab ? 'bg-purple-500' : 'bg-blue-500'}`}>
                                                                    {order.queueNumber}
                                                                </div>
                                                                {order.tagNumber && (
                                                                    <div className={`w-10 h-10 rounded-lg flex flex-col items-center justify-center text-white font-black text-[14px] shrink-0 leading-none border ${activeDebtTab ? 'bg-purple-700 border-purple-800' : 'bg-gray-900 border-gray-800'}`}>
                                                                        <span className="text-[9px] opacity-80 mb-0.5">TAG</span>
                                                                        <span>{order.tagNumber}</span>
                                                                    </div>
                                                                )}
                                                                <div className="min-w-0 pt-0.5">
                                                                    <p className={`font-black text-[14px] uppercase whitespace-nowrap overflow-hidden text-ellipsis ${activeDebtTab ? 'text-purple-800' : 'text-gray-900'}`}>{order.customerName}</p>
                                                                    <p className={`text-[12px] font-bold ${activeDebtTab ? 'text-purple-500' : 'text-gray-500'}`}>TG: {formatTime(order.timestamp)}</p>
                                                                </div>
                                                            </div>
                                                            <div className="text-right shrink-0">
                                                                <span className={`text-[10px] font-black px-2 py-1 rounded-md uppercase ${activeDebtTab ? 'bg-purple-100 text-purple-700' : (!order.isPaid ? 'bg-amber-100 text-amber-600' : 'bg-indigo-100 text-indigo-700')}`}>
                                                                    {activeDebtTab ? 'GHI NỢ (CHƯA TT)' : (!order.isPaid ? (order.status === 'COMPLETED' ? 'Đã Xong (Chưa TT)' : 'Chưa TT') : 'Đang Pha')}
                                                                </span>
                                                                <p className={`font-black text-[16px] mt-1 ${activeDebtTab ? 'text-purple-700' : 'text-[#C68E5E]'}`}>{formatVND(order.price)}</p>
                                                            </div>
                                                        </div>

                                                        {!order.isPaid && (
                                                            <div className="flex gap-2.5 justify-between mt-4">
                                                                <button 
                                                                    onClick={() => setPaymentQrOrder(order)}
                                                                    className={`text-white border-none p-2.5 rounded-xl text-[12px] font-black cursor-pointer flex items-center justify-center gap-1.5 flex-1 transition-opacity hover:opacity-90 ${activeDebtTab ? 'bg-purple-500' : 'bg-blue-500'}`}>
                                                                    <QrCode size={16} /> MỞ QR
                                                                </button>
                                                                <button 
                                                                    onClick={() => {
                                                                        setUploadingOrderId(order.id);
                                                                        if (fileInputRef.current) fileInputRef.current.click();
                                                                    }}
                                                                    className={`text-white border-none p-2.5 rounded-xl text-[12px] font-black cursor-pointer flex items-center justify-center gap-1.5 flex-1 transition-opacity hover:opacity-90 ${activeDebtTab ? 'bg-purple-700' : 'bg-green-500'}`}>
                                                                    <Camera size={16} /> XÁC NHẬN
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Items */}
                                                    <div className="flex flex-col gap-2">
                                                        {order.cartItems && order.cartItems.length > 0 ? order.cartItems.map((item, i) => (
                                                            <div key={i} className="flex justify-between items-start">
                                                                <div>
                                                                    <p className="font-extrabold text-[14px] text-gray-700">{i + 1}. {item.item?.name || 'Món'} <span>x{item.count}</span></p>
                                                                    <p className="text-[11px] text-gray-400 font-semibold mt-0.5">
                                                                        Size: {item.size?.label || 'Mặc định'}
                                                                        {item.sugar && ` • ${item.sugar}`}
                                                                        {item.ice && ` • ${item.ice}`}
                                                                    </p>
                                                                    {item.addons?.length > 0 && (
                                                                        <p className="text-[11px] text-gray-400 font-semibold">Thêm: {item.addons.map(a => a.label).join(', ')}</p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )) : (
                                                            <div className="py-2">
                                                                <p className="text-[13px] font-bold text-gray-600 leading-snug whitespace-pre-line">{order.itemName}</p>
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
                className="hidden" 
                onChange={handleCaptureReceipt} 
            />

            {/* --- PAYMENT QR MODAL FOR KIOSK IPAD --- */}
            <AnimatePresence>
                {paymentQrOrder && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[3000] bg-black/80 backdrop-blur-md flex items-center justify-center p-5"
                    >
                        <div className="bg-white rounded-3xl p-8 w-full max-w-[400px] text-center relative shadow-2xl">
                            <button onClick={() => setPaymentQrOrder(null)} className="absolute top-4 right-4 bg-gray-100 hover:bg-gray-200 transition-colors border-none w-9 h-9 rounded-full flex items-center justify-center cursor-pointer text-gray-700">
                                <X size={20} />
                            </button>
                            <h3 className="text-[22px] font-black mb-2 text-gray-900 tracking-tight">Thanh toán đơn hàng</h3>
                            <p className="text-[15px] font-bold text-gray-500 mb-6">#{paymentQrOrder.queueNumber} - {formatVND(paymentQrOrder.price)}</p>
                            
                            <div className="bg-gray-50 p-4 rounded-2xl inline-block mb-6 shadow-inner border border-gray-100">
                                <img 
                                    src={getVietQR(paymentQrOrder.price, paymentQrOrder.queueNumber || paymentQrOrder.id)}
                                    className="w-[240px] h-[240px] object-contain rounded-xl bg-white" 
                                    alt="VietQR" 
                                />
                            </div>
                            
                            <button 
                                onClick={() => {
                                    setUploadingOrderId(paymentQrOrder.id);
                                    if (fileInputRef.current) fileInputRef.current.click();
                                }}
                                className="w-full bg-green-500 hover:bg-green-600 text-white border-none py-4 rounded-2xl text-[16px] font-black flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-[0_10px_20px_rgba(34,197,89,0.3)] active:scale-95"
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
