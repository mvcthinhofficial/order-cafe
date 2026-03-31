import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    X, ShoppingBag, Search, Trash2, Plus, Minus, 
    CheckCircle2, Gift, QrCode, Camera, Printer, 
    ChevronUp, ChevronDown, GripVertical, Lock, Star, DollarSign, LayoutGrid 
} from 'lucide-react';
import { ShortcutProvider } from '../ShortcutManager';
import { calculateCartWithPromotions } from '../../utils/promotionEngine';
import { calculateLiveOrderTax } from '../../utils/taxUtils';
import { 
    isInputActive, isInputFocused, getNextOrderSource, isDoubleTap 
} from '../../utils/ShortcutUtils.js';
import { SERVER_URL as API_URL, getImageUrl } from '../../api';
import VisualFlashOverlay from '../VisualFlashOverlay';
import { getSortedCategories } from '../AdminDashboard';
import { generateKitchenTicketHTML, generateReceiptHTML } from '../../utils/printHelpers';
import { CurrencyInput } from '../../utils/dashboardUtils';
import SharedCustomizationModal from '../SharedCustomizationModal';


const DEFAULT_SUGAR = ['100%', '50%', '0%'];
const DEFAULT_ICE = ['Bình thường', 'Ít đá', 'Không đá'];

const getSugarLevel = (val) => DEFAULT_SUGAR.includes(val) ? val : DEFAULT_SUGAR[0];
const getIceLevel = (val) => DEFAULT_ICE.includes(val) ? val : DEFAULT_ICE[0];

const ShortcutDoubleEnter = ({ onDoubleEnter, disabled }) => {
    const lastEnterTime = useRef(0);
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (disabled) return;
            if (e.key === 'Enter' || e.key === 'NumpadEnter') {
                const now = Date.now();
                if (now - lastEnterTime.current < 400) {
                    onDoubleEnter();
                    lastEnterTime.current = 0;
                } else {
                    lastEnterTime.current = now;
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onDoubleEnter, disabled]);
    return null;
};

const StaffOrderPanelInner = ({ 
    inventory,
    menu, 
    tables, 
    promotions = [], 
    initialTableId, 
    initialOrder, 
    onClose, 
    onSuccess,
    SERVER_URL,
    userRole,
    userName,
    fetchLatestMenu,
    settings, 
    onRegisterShortcutAdd,
    idCounter,
    setIdCounter,
    showToast,
    formatVND,
    getVNTime,
    setMenu,
    onModalStateChange
}) => {
    const [cart, setCart] = useState(initialOrder?.cartItems || []);
    const [promoCodeInput, setPromoCodeInput] = useState(initialOrder?.appliedPromoCode || '');
    const [selectedItem, setSelectedItem] = useState(null);
    const [editingCartItemId, setEditingCartItemId] = useState(null);
    const [editItemData, setEditItemData] = useState(null);
    const [selectedTableId, setSelectedTableId] = useState(initialOrder?.tableId || initialTableId || null);
    const [showCheckout, setShowCheckout] = useState(false);
    const [receivedAmount, setReceivedAmount] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('Chuyển khoản');
    const [printCurrentOrder, setPrintCurrentOrder] = useState(localStorage.getItem('printReceiptEnabled') !== 'false');

    const [customerName, setCustomerName] = useState(initialOrder?.customerName || '');
    const [orderNote, setOrderNote] = useState(initialOrder?.note || '');
    const [orderSource, setOrderSource] = useState(initialOrder?.orderSource || 'INSTORE');
    const [tagNumber, setTagNumber] = useState(initialOrder?.tagNumber || '');
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [activeCategory, setActiveCategory] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortOption, setSortOption] = useState('shortcut');
    const [gridColumns, setGridColumns] = useState(() => parseInt(localStorage.getItem('posGridColumns')) || 4);

    useEffect(() => {
        localStorage.setItem('posGridColumns', gridColumns.toString());
    }, [gridColumns]);

    // Notify parent khi modal mở/đóng để tắt ShortcutProvider
    useEffect(() => {
        if (onModalStateChange) onModalStateChange(showCheckout || !!selectedItem);
    }, [showCheckout, selectedItem]);

    const getVietQR = (amount, orderRef = '') => {
        const BANK_ID = settings.bankId || 'MB';
        const ACCOUNT_NO = settings.accountNo || '0123456789';
        const ACCOUNT_NAME = settings.accountName || 'TH-POS';
        const amountVND = Math.round(amount * 1000);
        const memo = orderRef ? `DH ${orderRef}` : (settings.shopName || 'TH-POS');
        const desc = encodeURIComponent('Thanh toan ' + memo);
        return `https://img.vietqr.io/image/${BANK_ID}-${ACCOUNT_NO}-compact2.png?amount=${amountVND}&addInfo=${desc}&accountName=${encodeURIComponent(ACCOUNT_NAME)}`;
    };

    useEffect(() => {
        if (showCheckout && cart.length > 0 && paymentMethod === 'Chuyển khoản' && settings.autoPushPaymentQr !== false) {
            const currentTotal = cart.reduce((s, c) => s + (c.totalPrice * c.count), 0);
            fetch(`${API_URL}/api/pos/checkout/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: currentTotal,
                    orderId: initialOrder ? initialOrder.id : getOrderId()
                })
            }).catch(e => console.error("Kiosk start checkout error", e));
        }
    }, [showCheckout]);

    useEffect(() => {
        if (!showCheckout) return;
        const handleCheckoutKey = async (e) => {
            const tag = document.activeElement?.tagName?.toLowerCase() || '';
            if (['input', 'textarea', 'select'].includes(tag)) return;
            if ((e.key === 'Escape' || (e.key === 'Backspace' && !isInputFocused()))) {
                e.preventDefault();
                if (paymentMethod === 'Chuyển khoản' || paymentMethod === 'Momo') {
                    await fetch(`${API_URL}/api/pos/checkout/stop`, { method: 'POST' });
                }
                setShowCheckout(false);
            } else if (e.key === 'Enter' || e.key === 'NumpadEnter') {
                e.preventDefault();
                if (submitting || success) return;
                if (paymentMethod !== 'Chuyển khoản') {
                    await fetch(`${API_URL}/api/pos/checkout/stop`, { method: 'POST' });
                }
                submitOrder();
            }
        };
        window.addEventListener('keydown', handleCheckoutKey, { capture: true });
        return () => window.removeEventListener('keydown', handleCheckoutKey, { capture: true });
    }, [showCheckout, paymentMethod, submitting, success]);

    useEffect(() => {
        const handlePosKey = (e) => {
            if (showCheckout) return;
            const isInput = isInputActive();
            if ((e.key === 'Escape' || (e.key === 'Backspace' && !isInput))) {
                if (isInput) return;
                e.preventDefault();
                if (selectedItem) {
                    setSelectedItem(null);
                } else {
                    onClose();
                }
            } else if ((e.key === '+' || e.code === 'NumpadAdd') && !isInput) {
                if (settings?.enableDeliveryApps !== false) {
                    e.preventDefault();
                    setOrderSource(prev => getNextOrderSource(prev));
                }
            }
        };
        window.addEventListener('keydown', handlePosKey, { capture: true });
        return () => window.removeEventListener('keydown', handlePosKey, { capture: true });
    }, [showCheckout, selectedItem, onClose, settings?.enableDeliveryApps]);

    const sortedCategories = getSortedCategories(menu, settings);
    const categories = ['All', ...sortedCategories];

    const normalizeString = (str) => {
        return str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().replace(/\s+/g, '') : '';
    };

    const isSubsequence = (search, text) => {
        if (!search) return true;
        let i = 0, j = 0;
        while (i < search.length && j < text.length) {
            if (search[i] === text[j]) i++;
            j++;
        }
        return i === search.length;
    };

    const normalizedQuery = normalizeString(searchQuery);

    const filtered = menu
        .filter(i => {
            if (activeCategory !== 'All' && i.category !== activeCategory) return false;
            if (!searchQuery) return true;
            if (i.name.toLowerCase().includes(searchQuery.toLowerCase())) return true;
            if (i.shortcutCode && i.shortcutCode.toString().toLowerCase().includes(searchQuery.toLowerCase())) return true;
            const normalizedName = normalizeString(i.name);
            return isSubsequence(normalizedQuery, normalizedName);
        })
        .sort((a, b) => {
            if (sortOption === 'name') return a.name.localeCompare(b.name);
            if (sortOption === 'category') return a.category.localeCompare(b.category) || a.name.localeCompare(b.name);
            const aCode = Number(a.shortcutCode);
            const bCode = Number(b.shortcutCode);
            if (!isNaN(aCode) && !isNaN(bCode)) return aCode - bCode;
            return (a.shortcutCode || '').localeCompare(b.shortcutCode || '');
        });

    const openItem = (item, editItem = null) => {
        setSelectedItem(item);
        if (editItem) {
            setEditingCartItemId(editItem.id);
            setEditItemData(editItem);
        } else {
            setEditingCartItemId(null);
            setEditItemData(null);
        }
    };

    const handleAddToCartFromModal = (customizedItem, isEdit) => {
        const threshold = customizedItem.item.availablePortions;
        if (threshold !== null && threshold !== undefined) {
            const currentCountInCart = cart.filter(c => c.item.id === customizedItem.item.id && c.id !== editingCartItemId).reduce((sum, c) => sum + c.count, 0);
            if (currentCountInCart + 1 > threshold) {
                alert(`Số lượng khả dụng của món này chỉ còn ${threshold} phần!`);
                return;
            }
        }
        
        if (isEdit && editingCartItemId !== null) {
            setCart(cart.map(c => c.id === editingCartItemId ? {
                ...c,
                size: customizedItem.size,
                addons: customizedItem.addons,
                sugar: customizedItem.sugar,
                ice: customizedItem.ice,
                note: customizedItem.note,
                totalPrice: customizedItem.totalPrice
            } : c));
        } else {
            const cartItem = {
                id: Date.now() + Math.random(),
                ...customizedItem
            };
            setCart([...cart, cartItem]);
        }
        setSelectedItem(null);
        setEditingCartItemId(null);
        setEditItemData(null);
    };

    const handleShortcutAdd = useCallback((mainItem, toppings, shortcutSize, shortcutSugar, shortcutIce, shortcutQuantity = 1) => {
        if (!mainItem) return;
        if (mainItem.isSoldOut) {
            alert('Món này đã hết hàng!');
            return;
        }
        const threshold = mainItem.availablePortions;
        if (threshold !== null && threshold !== undefined) {
            const currentCountInCart = cart.filter(c => c.item.id === mainItem.id).reduce((sum, c) => sum + c.count, 0);
            let qtyToAdd = shortcutQuantity || 1;
            if (currentCountInCart + qtyToAdd > threshold) {
                alert(`Số lượng khả dụng của món này chỉ còn ${threshold} phần!`);
                return;
            }
        }
        const size = shortcutSize || mainItem.sizes?.[0] || null;
        const sugars = (mainItem.sugarOptions?.length ? mainItem.sugarOptions : DEFAULT_SUGAR).slice().sort((a, b) => DEFAULT_SUGAR.indexOf(a) - DEFAULT_SUGAR.indexOf(b));
        const ices = (mainItem.iceOptions?.length ? mainItem.iceOptions : DEFAULT_ICE).slice().sort((a, b) => DEFAULT_ICE.indexOf(a) - DEFAULT_ICE.indexOf(b));
        const sugar = shortcutSugar || mainItem.defaultSugar || sugars[0] || '100%';
        const ice = shortcutIce || mainItem.defaultIce || ices[0] || 'Bình thường';
        const basePrice = parseFloat(mainItem.price) || 0;
        const sizePrice = size?.priceAdjust || 0;
        const mappedAddons = toppings.map(t => ({
            label: t.label || t.name,
            price: parseFloat(t.price) || 0,
            addonCode: t.addonCode || t.shortcutCode
        }));
        const toppingPrice = mappedAddons.reduce((s, t) => s + t.price, 0);
        const cartItem = {
            id: Date.now() + Math.random(),
            item: mainItem,
            size,
            addons: mappedAddons,
            sugar,
            ice,
            count: shortcutQuantity || 1,
            note: '',
            totalPrice: basePrice + sizePrice + toppingPrice,
        };
        setCart(prev => [...prev, cartItem]);
    }, [cart]);

    useEffect(() => {
        if (typeof onRegisterShortcutAdd === 'function') {
            onRegisterShortcutAdd(handleShortcutAdd);
        }
    }, [handleShortcutAdd, onRegisterShortcutAdd]);

    const removeFromCart = (id) => setCart(cart.filter(c => c.id !== id));
    const [selectedPromoId, setSelectedPromoId] = useState(null);

    const calculateCart = () => {
        let effectiveCart = cart;
        const feePercent = settings?.deliveryAppsConfigs?.[orderSource]?.fee || 0;
        if (orderSource !== 'INSTORE' && feePercent > 0 && feePercent < 100) {
            const multiplier = 1 / (1 - (feePercent / 100));
            effectiveCart = cart.map(c => {
                const clonedItem = JSON.parse(JSON.stringify(c));
                const applyMarkup = (price) => Math.ceil(price * multiplier);
                if (clonedItem.item && clonedItem.item.price) clonedItem.item.price = applyMarkup(clonedItem.item.price);
                if (clonedItem.size && clonedItem.size.priceAdjust) clonedItem.size.priceAdjust = applyMarkup(clonedItem.size.priceAdjust);
                if (clonedItem.addons) {
                    clonedItem.addons.forEach(a => { if (a.price) a.price = applyMarkup(a.price); });
                }
                const baseP = parseFloat(clonedItem.item?.price) || 0;
                const sizeP = parseFloat(clonedItem.size?.priceAdjust) || 0;
                const addonP = (clonedItem.addons || []).reduce((s, a) => s + (parseFloat(a.price) || 0), 0);
                clonedItem.totalPrice = baseP + sizeP + addonP;
                clonedItem.originalPrice = clonedItem.totalPrice;
                return clonedItem;
            });
        }
        const promoResult = calculateCartWithPromotions(effectiveCart, promotions, promoCodeInput, menu, selectedPromoId, settings.enablePromotions);
        const taxResult = calculateLiveOrderTax(promoResult.totalOrderPrice, settings);
        return {
            ...promoResult,
            totalOrderPrice: taxResult.finalTotal,
            preTaxTotal: taxResult.finalTotal - taxResult.taxAmount,
            taxAmount: taxResult.taxAmount,
            taxRate: parseFloat(settings?.taxRate) || 0,
            taxMode: settings?.taxMode || 'NONE'
        };
    };

    const calculation = calculateCart();
    const { totalOrderPrice, preTaxTotal, taxAmount, taxRate, taxMode, baseTotal, discount, validPromo, availablePromotions, processedCart } = calculation;

    const getOrderId = () => {
        const now = new Date();
        const dd = String(now.getDate()).padStart(2, '0');
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const yy = String(now.getFullYear()).slice(-2);
        return `${String(idCounter).padStart(4, '0')}${dd}${mm}${yy}`;
    };

    const submitOrder = async () => {
        if (cart.length === 0) return;
        setSubmitting(true);
        try {
            const deviceId = localStorage.getItem('deviceId') || 'staff-pos';
            const isUpdate = !!initialOrder;
            const nowTs = getVNTime ? getVNTime().toISOString() : new Date().toISOString();
            const orderData = {
                id: isUpdate ? initialOrder.id : null,
                itemName: processedCart.map(c => `${c.item.name} (${c.size?.label || 'Mặc định'}) x${c.count}`).join(', '),
                customerName: customerName || (isUpdate ? initialOrder.customerName : ''),
                note: orderNote,
                price: totalOrderPrice,
                preTaxTotal: preTaxTotal,
                taxAmount: taxAmount,
                taxRate: taxRate,
                taxMode: taxMode,
                basePrice: baseTotal,
                discount: discount,
                orderSource: orderSource,
                partnerFee: orderSource !== 'INSTORE' ? totalOrderPrice * (settings?.deliveryAppsConfigs?.[orderSource]?.fee || 0) / 100 : 0,
                appliedPromoCode: validPromo ? (validPromo.code || validPromo.name) : null,
                status: isUpdate ? initialOrder.status : (settings.requirePrepayment === false ? 'PENDING' : 'AWAITING_PAYMENT'),
                isPaid: isUpdate ? initialOrder.isPaid : false,
                timestamp: isUpdate ? initialOrder.timestamp : nowTs,
                cartItems: processedCart,
                tableId: settings?.isTakeaway ? null : selectedTableId,
                tableName: settings?.isTakeaway ? '' : (tables.find(t => t.id === selectedTableId)?.name || ''),
                tagNumber: settings?.isTakeaway ? tagNumber : '',
                deviceId: deviceId,
                isPOS: true
            };
            const res = await fetch(isUpdate ? `${API_URL}/api/orders/${initialOrder.id}` : `${API_URL}/api/order`, {
                method: isUpdate ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(orderData)
            });
            if (res.ok) {
                const data = await res.json();
                if (data.order?.queueNumber) setIdCounter(data.order.queueNumber + 1);
                if (paymentMethod === 'Chuyển khoản' && settings.autoPushPaymentQr !== false) {
                    await fetch(`${API_URL}/api/pos/checkout/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: totalOrderPrice, orderId: data.order.id }) });
                }
                const selectedPrinter = localStorage.getItem('selectedPrinter');
                if (printCurrentOrder && window.require) {
                    const { ipcRenderer } = window.require('electron');
                    const htmlContent = generateReceiptHTML({ ...data.order, paymentMethod, tagNumber, tableName: orderData.tableName }, processedCart, settings, false);
                    ipcRenderer.invoke('print-html', htmlContent, selectedPrinter, settings?.receiptPaperSize).catch(console.error);
                }
                setSuccess(true);
                if (showToast) showToast(isUpdate ? 'Đã cập nhật đơn hàng!' : 'Đã tạo đơn hàng thành công!', 'success');
                setTimeout(() => {
                    setCart([]); setCustomerName(''); setTagNumber(''); setOrderSource('INSTORE');
                    setSuccess(false); onClose();
                }, 100);
            } else {
                const errData = await res.json().catch(() => ({}));
                if (showToast) showToast(errData.message || 'Lỗi khi gửi đơn hàng!', 'error');
                else alert(errData.message || 'Lỗi khi gửi đơn hàng!');
            }
        } catch (err) {
            console.error('submitOrder error:', err);
            const msg = err?.message || 'Lỗi kết nối máy chủ!';
            if (showToast) showToast(msg, 'error');
            else alert(msg);
        }
        setSubmitting(false);
    };

    const changeDue = Math.max(0, parseFloat(receivedAmount || 0) - totalOrderPrice);
    const categoryStyles = { 'TRUYỀN THỐNG': 'bg-amber-600', 'PHA MÁY': 'bg-zinc-900', 'Trà': 'bg-brand-600', 'Khác': 'bg-orange-600', 'All': 'bg-brand-600' };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[500] bg-gray-100 flex flex-col font-main overflow-hidden">
            {settings?.flashConfirmationEnabled !== false && <VisualFlashOverlay />}
            <div className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center shadow-sm z-10">
                <div className="flex items-center gap-4">
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 transition-all"><X size={24} /></button>
                    <h2 className="text-xl font-black tracking-tight uppercase">BÁN HÀNG (POS)</h2>
                </div>
                <div className="flex items-center gap-3">
                    <div className="text-right"><p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Nhân viên trực</p><p className="font-black text-sm text-gray-900">Admin</p></div>
                    <div className="w-10 h-10 bg-gray-100 border border-gray-200 flex items-center justify-center font-black text-brand-600">AD</div>
                </div>
            </div>
            <div className="flex-1 flex overflow-hidden">
                <div className="flex-1 flex flex-col bg-[#F8F4EF] overflow-hidden">
                    <div className="bg-white border-b border-gray-100 flex flex-col shadow-sm z-10">
                        <div className="p-4 flex gap-2 w-full border-b border-gray-50">
                            <div className="relative flex-1">
                                <Search className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Tìm món nhanh..."
                                    className="w-full h-full bg-gray-50 border border-gray-200 py-4 pl-4 pr-14 font-black text-gray-800 outline-none focus:ring-4 focus:ring-[#007AFF]/10 transition-all" />
                            </div>
                            <select value={sortOption} onChange={e => setSortOption(e.target.value)} className="bg-gray-50 border border-gray-200 px-4 py-4 font-black text-sm text-gray-800 outline-none focus:ring-4 focus:ring-[#007AFF]/10 transition-all cursor-pointer w-48 shrink-0">
                                <option value="shortcut">Theo phím tắt</option><option value="category">Theo danh mục</option><option value="name">Theo tên (A-Z)</option>
                            </select>
                            <div className="flex gap-2 shrink-0">
                                <button title={`Đang hiển thị ${gridColumns} cột`} onClick={() => setGridColumns(prev => prev === 6 ? 3 : prev + 1)} className="px-4 py-3 flex items-center justify-center transition-all bg-white border border-brand-600 shadow-sm bg-brand-50/50 hover:bg-brand-100/50 active:scale-95">
                                    <div className="flex gap-1 items-center">{Array.from({ length: gridColumns }).map((_, i) => <div key={i} className="w-1.5 h-5 rounded-none bg-brand-600" />)}</div>
                                </button>
                            </div>
                        </div>
                        <div className="px-4 py-3 flex items-center gap-2 overflow-x-auto hide-scrollbar">
                            {categories.map(cat => (
                                <button key={cat} onClick={() => setActiveCategory(cat)} className={`flex-shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-none font-black text-[13px] tracking-wider transition-all border ${activeCategory === cat ? (categoryStyles[cat] || 'bg-gray-900 border-transparent') + ' text-white shadow-md' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50 active:scale-95'}`}>
                                    <div className={`w-2 h-2 rounded-none flex-shrink-0 ${activeCategory === cat ? 'bg-white' : (categoryStyles[cat] || 'bg-gray-400')}`} /><span>{cat === 'All' ? 'TẤT CẢ' : cat}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="pos-item-grid" style={{ gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))` }}>
                        {filtered.map(item => {
                            const showLowStock = !item.isSoldOut && item.availablePortions !== null && item.availablePortions !== undefined && item.availablePortions <= (settings?.warningThreshold !== undefined ? settings.warningThreshold : 2) && item.availablePortions > 0;
                            const showAllPortions = !item.isSoldOut && item.availablePortions !== null && item.availablePortions !== undefined && item.availablePortions > (settings?.warningThreshold !== undefined ? settings.warningThreshold : 2);
                            return (
                                <div key={item.id} onClick={() => item.isSoldOut ? alert('Món này đã hết hàng!') : openItem(item)} className={`pos-item-card group relative ${item.isSoldOut ? 'grayscale cursor-not-allowed' : 'cursor-pointer'}`}>
                                    {item.image && <img src={getImageUrl(item.image)} className={`w-full h-full object-cover transition-transform duration-500 ${!item.isSoldOut ? 'group-hover:scale-105' : ''}`} alt="" />}
                                    {item.isSoldOut && <div className="absolute inset-0 bg-black/10 z-30 flex flex-col items-center justify-center"><span className="bg-red-600/90 text-white shadow-xl font-black px-4 py-2 text-sm uppercase tracking-widest border border-red-800">HẾT MÓN</span></div>}
                                    {/* Left column: Addon shortcuts + SL stacked */}
                                    {!item.isSoldOut && (item.availablePortions !== null && item.availablePortions !== undefined || item.addons?.length > 0) && (
                                        <div className="absolute bottom-[38px] left-0 z-20 flex flex-col items-start pointer-events-none gap-0.5 pb-0.5">
                                            {/* Addon shortcut badges */}
                                            {item.addons?.length > 0 && item.addons.slice(0, 5).map((addon, idx) => (
                                                <span key={idx} className="flex items-center gap-0.5 bg-black/55 backdrop-blur-sm px-1.5 py-0.5">
                                                    <span className="text-[8px] font-black text-yellow-300 leading-none">[{idx + 1}]</span>
                                                    <span className="text-[8px] font-bold text-white/90 leading-none max-w-[60px] truncate">{addon.label}</span>
                                                </span>
                                            ))}
                                            {item.addons?.length > 5 && (
                                                <span className="text-[8px] font-black text-white/60 bg-black/55 px-1.5 py-0.5 leading-none">+{item.addons.length - 5} more</span>
                                            )}
                                            {/* SL indicator */}
                                            {item.availablePortions !== null && item.availablePortions !== undefined && (
                                                <span className={`font-black text-[10px] px-2 py-0.5 ${showLowStock ? 'bg-red-500 text-white animate-pulse' : 'bg-black/60 text-white'}`}>
                                                    SL: {item.availablePortions}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                    <div className="absolute top-2 right-2 z-20 flex flex-col items-end gap-1"><span className="bg-[#1A1A1A] text-[#FFD60A] font-mono text-[14px] font-black px-2 py-1 shadow-md">{Math.round(parseFloat(item.price))}K</span></div>
                                    <div className="absolute top-2 left-2 z-10"><span className={`${categoryStyles[item.category] || 'bg-black/60'} text-white text-[10px] font-black px-3 py-2 uppercase tracking-widest shadow-lg block`}>{item.category}</span></div>
                                    <div className="absolute bottom-0 left-0 right-0 py-3 px-3 bg-white/80 backdrop-blur-sm flex justify-center items-center gap-2 z-10"><p className="font-black text-[13px] text-gray-900 truncate uppercase text-center w-full">{item.name}{settings?.showHotkeys && item.shortcutCode && <span className="text-gray-500 ml-1">- {item.shortcutCode}</span>}</p></div>
                                </div>
                            );
                        })}
                    </div>
                </div>
                <div className="w-[30%] bg-white border-l border-gray-200 flex flex-col shadow-[-10px_0_30px_rgba(0,0,0,0.02)] shrink-0">
                    <div className="p-6 border-b border-gray-100 bg-gray-50/30">
                        <div className="flex justify-between items-center mb-4"><h3 className="font-black text-base text-gray-900 flex items-center gap-2"><ShoppingBag size={20} className="text-brand-600" /> GIỎ HÀNG</h3><button onClick={() => setCart([])} className="text-xs font-black text-red-500 hover:bg-red-50 px-3 py-1.5 transition-all">XÓA TẤT CẢ</button></div>
                        <div className="space-y-3">
                            {!settings?.isTakeaway ? (
                                <select value={selectedTableId || ''} onChange={e => setSelectedTableId(e.target.value || null)} className="w-full bg-white border border-gray-200 px-4 py-3 text-sm font-black text-brand-600 outline-none shadow-sm cursor-pointer"><option value="">🛵 Khách mang đi</option>{tables.map(t => <option key={t.id} value={t.id}>🍽️ {t.area} - {t.name} ({t.status})</option>)}</select>
                            ) : (
                                <div className="relative"><input value={tagNumber} onChange={e => setTagNumber(e.target.value)} placeholder="Tag Number / Thẻ Bàn..." className="w-full bg-white border border-gray-200 px-4 py-3 text-sm font-bold text-brand-500 outline-none shadow-sm" /><div className="absolute right-4 top-1/2 -translate-y-1/2"><span className="text-[10px] font-black text-brand-500 bg-orange-50 px-3 py-1 uppercase">Tag</span></div></div>
                            )}
                            <div className="relative"><input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Tên khách hàng..." className="w-full bg-white border border-gray-200 px-4 py-3 text-sm font-bold outline-none shadow-sm" />{!customerName && <div className="absolute right-4 top-1/2 -translate-y-1/2"><span className="text-[10px] font-black text-brand-600 bg-brand-50 px-3 py-1 uppercase">Auto ID</span></div>}</div>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-5 space-y-4">
                        {processedCart.map((c, idx) => (
                            <div key={c.id || idx} className="relative border-b border-gray-100 last:border-0 shrink-0">
                                {!c.isGift && <div className="absolute inset-y-0 right-0 w-24 bg-red-500 flex items-center justify-end px-5"><Trash2 size={20} className="text-white" /></div>}
                                <motion.div drag={c.isGift ? false : "x"} dragConstraints={{ left: -80, right: 0 }} onDragEnd={(e, info) => !c.isGift && info.offset.x < -60 && removeFromCart(c.id)} className={`bg-gray-50 p-4 relative group ${c.isGift ? 'border-green-300 bg-green-50/30' : ''} w-full`}>
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex-1 min-w-0"><p className="font-black text-sm text-gray-900 truncate">{c.isGift ? '(KM) ' : ''}{c.item?.name || 'Món'}</p>
                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                            {c.size?.label && <span onClick={() => openItem(c.item, c)} className="text-[11px] font-black bg-white border border-gray-200 px-2.5 py-1 text-gray-600 uppercase rounded-sm cursor-pointer hover:bg-gray-50 transition-colors shadow-sm">{c.size.label}</span>}
                                            {c.sugar && <span onClick={() => openItem(c.item, c)} className="text-[11px] font-black bg-amber-50 border border-amber-200 px-2.5 py-1 text-amber-700 rounded-sm cursor-pointer hover:bg-amber-100 transition-colors shadow-sm">Đường: {c.sugar}</span>}
                                            {c.ice && <span onClick={() => openItem(c.item, c)} className="text-[11px] font-black bg-blue-50 border border-blue-200 px-2.5 py-1 text-blue-700 rounded-sm cursor-pointer hover:bg-blue-100 transition-colors shadow-sm">Đá: {c.ice}</span>}
                                            {c.addons?.map((addon, aIdx) => <span key={aIdx} onClick={() => openItem(c.item, c)} className="text-[11px] font-black bg-orange-50 border border-orange-200 px-2.5 py-1 text-orange-700 rounded-sm cursor-pointer hover:bg-orange-100 transition-colors shadow-sm">+{addon.label}</span>)}
                                            {c.note && <span onClick={() => openItem(c.item, c)} className="text-[11px] font-black bg-gray-100 border border-gray-300 px-2.5 py-1 text-gray-700 rounded-sm cursor-pointer hover:bg-gray-200 transition-colors shadow-sm whitespace-nowrap overflow-hidden text-ellipsis max-w-[120px]">📝 {c.note}</span>}
                                        </div>
                                        </div>
                                        <div className="text-right ml-3 shrink-0"><p className="font-black text-sm text-gray-900">{formatVND(c.totalPrice * c.count)}</p><div className="flex items-center gap-2 mt-2 bg-white border border-gray-200 p-0.5"><button onClick={() => c.count > 1 ? setCart(cart.map(x => x.id === c.id ? { ...x, count: x.count - 1 } : x)) : removeFromCart(c.id)} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-red-500"><Minus size={12} /></button><span className="font-black text-sm w-4 text-center">{c.count}</span><button onClick={() => setCart(cart.map(x => x.id === c.id ? { ...x, count: x.count + 1 } : x))} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-brand-600"><Plus size={12} /></button></div></div>
                                    </div>
                                </motion.div>
                            </div>
                        ))}
                    </div>
                    <div className="p-6 border-t border-gray-200 bg-white space-y-3">
                        <input value={orderNote} onChange={e => setOrderNote(e.target.value)} placeholder="Ghi chú đơn hàng..." className="w-full px-4 py-2 bg-gray-50 border border-gray-200 font-bold text-gray-900 outline-none text-sm mb-3" />
                        <div className="flex justify-between items-center text-gray-400 font-black text-[10px] uppercase tracking-[2px] pt-2"><span>Tạm tính</span><span>{formatVND(baseTotal)}</span></div>
                        {discount > 0 && <div className="flex justify-between items-center text-brand-600 font-black text-[10px] uppercase tracking-[2px]"><span>Khuyến mãi</span><span>-{formatVND(discount)}</span></div>}
                        <div className="flex justify-between items-center border-t border-gray-100 pt-2 mt-2"><span className="text-base font-black text-gray-900">Tổng thanh toán</span><span className="text-2xl font-black text-brand-600 tracking-tighter">{formatVND(totalOrderPrice)}</span></div>
                        <div className="grid grid-cols-2 gap-3 pt-3"><button onClick={() => onClose()} className="admin-btn-secondary !text-gray-400">HỦY ĐƠN</button><button onClick={() => setShowCheckout(true)} disabled={submitting || cart.length === 0} className="admin-btn-primary">THANH TOÁN</button></div>
                    </div>
                </div>
            </div>
            <ShortcutDoubleEnter onDoubleEnter={() => { if (cart.length > 0 && !showCheckout && !selectedItem) setShowCheckout(true); }} disabled={showCheckout || !!selectedItem} />
            <AnimatePresence>
                {showCheckout && (
                    <div className="fixed inset-0 z-[700] flex items-center justify-center p-6">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowCheckout(false)} className="absolute inset-0 bg-black/60 backdrop-blur-md" />
                        <motion.div initial={{ y: 50, opacity: 0, scale: 0.95 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 50, opacity: 0, scale: 0.95 }} className="admin-modal-container !max-w-lg flex flex-col">
                            <div className="p-8 space-y-6 text-center">
                                <p className="text-sm text-gray-400 font-black uppercase tracking-[4px]">Tổng thanh toán</p>
                                <h3 className="font-black text-brand-600" style={{ fontSize: '80px', lineHeight: 1 }}>{formatVND(totalOrderPrice)}</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    {['Tiền mặt', 'Chuyển khoản'].map(m => (
                                        <button key={m} onClick={() => setPaymentMethod(m)} className={`py-4 font-black text-base border-2 ${paymentMethod === m ? 'border-brand-600 bg-brand-600/5 text-brand-600' : 'border-gray-100 text-gray-400'}`}>{m}</button>
                                    ))}
                                </div>

                                {/* Tiền mặt: nhận tiền + tiền thừa */}
                                {paymentMethod === 'Tiền mặt' && (
                                    <div className="space-y-3 text-left">
                                        <div>
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[2px] mb-2">Tiền khách đưa</p>
                                            <CurrencyInput
                                                value={receivedAmount}
                                                onChange={e => setReceivedAmount(e.target.value)}
                                                placeholder={totalOrderPrice.toString()}
                                                autoFocus
                                                containerClassName="px-4 py-3 mb-3 border-2"
                                                className="text-3xl"
                                                suffixClassName="text-3xl"
                                            />
                                            {/* Gợi ý mệnh giá VND chuẩn từ 500k xuống */}
                                            <div className="flex gap-2">
                                                {Array.from(new Set([
                                                    500, 200, 100, 50, totalOrderPrice
                                                ])).filter(v => v >= totalOrderPrice).sort((a,b) => b - a).map(amount => (
                                                    <button 
                                                        key={amount} 
                                                        onClick={() => setReceivedAmount(amount.toString())} 
                                                        className="flex-1 bg-white border-2 border-brand-100 text-brand-700 font-black py-2 rounded-md hover:bg-brand-50 hover:border-brand-400 transition-all text-[13px]"
                                                    >
                                                        {amount === totalOrderPrice && amount !== 500 && amount !== 200 && amount !== 100 && amount !== 50 ? "Vừa đủ" : formatVND(amount)}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        {parseFloat(receivedAmount || 0) >= totalOrderPrice && (
                                            <div className="flex justify-between items-center bg-green-50 border border-green-200 px-4 py-3">
                                                <span className="font-black text-sm text-green-700 uppercase tracking-wider">Tiền thừa trả lại</span>
                                                <span className="font-black text-2xl text-green-600">{formatVND(changeDue)}</span>
                                            </div>
                                        )}
                                        {parseFloat(receivedAmount || 0) > 0 && parseFloat(receivedAmount || 0) < totalOrderPrice && (
                                            <div className="flex justify-between items-center bg-red-50 border border-red-200 px-4 py-3">
                                                <span className="font-black text-sm text-red-600 uppercase tracking-wider">Còn thiếu</span>
                                                <span className="font-black text-2xl text-red-500">{formatVND(totalOrderPrice - parseFloat(receivedAmount))}</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Chuyển khoản: QR */}
                                {paymentMethod === 'Chuyển khoản' && <div className="bg-gray-50 p-6 flex flex-col items-center gap-4"><img src={getVietQR(totalOrderPrice, initialOrder ? initialOrder.id : getOrderId())} className="w-48 h-48 border" /><p className="text-xs font-black text-gray-800 uppercase">{settings.bankId} · {settings.accountNo}</p></div>}
                            </div>

                            {/* Toggle In hóa đơn */}
                            <div className="px-8 pb-4 flex items-center justify-center gap-3">
                                <button onClick={() => setPrintCurrentOrder(v => !v)} className={`relative w-11 h-6 rounded-full transition-colors ${printCurrentOrder ? 'bg-brand-600' : 'bg-gray-200'}`}>
                                    <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${printCurrentOrder ? 'translate-x-5' : ''}`} />
                                </button>
                                <span className="font-black text-sm text-gray-500 uppercase tracking-wider">In hóa đơn</span>
                            </div>

                            <div className="p-6 border-t border-gray-100 bg-gray-50 flex gap-4"><button onClick={() => setShowCheckout(false)} className="admin-btn-secondary flex-1">QUAY LẠI</button><button onClick={() => submitOrder()} disabled={submitting} className="admin-btn-primary flex-1">XÁC NHẬN</button></div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
            <SharedCustomizationModal
                isOpen={!!selectedItem}
                item={selectedItem}
                editItem={editItemData}
                onClose={() => {
                    setSelectedItem(null);
                    setEditingCartItemId(null);
                    setEditItemData(null);
                }}
                onAddToCart={handleAddToCartFromModal}
                formatVND={formatVND}
            />
        </motion.div>
    );
};

export const StaffOrderPanel = (props) => {
    const addRef = useRef(null);
    const [modalOpen, setModalOpen] = useState(false);
    const handleAdd = useCallback((m, t, s, su, i, q) => addRef.current && addRef.current(m, t, s, su, i, q), []);
    return (
        <ShortcutProvider menu={props.menu} onAdd={handleAdd} isEnabled={props.settings?.flashConfirmationEnabled !== false && !modalOpen}>
            <StaffOrderPanelInner {...props} onRegisterShortcutAdd={(fn) => { addRef.current = fn; }} onModalStateChange={setModalOpen} />
        </ShortcutProvider>
    );
};

export const ReceiptBuilder = ({ value, onChange, settings, setSettings, menu }) => {
    const [editingId, setEditingId] = useState(null);
    const fallbackConfig = [
        { id: 'shopName', label: 'Tên quán', enabled: true },
        { id: 'address', label: 'Địa chỉ quán', enabled: true },
        { id: 'receiptTitle', label: 'Tiêu đề (PHIẾU THANH TOÁN)', enabled: true },
        { id: 'orderInfo', label: 'Thông tin đơn (Mã, Thời gian)', enabled: true },
        { id: 'customerInfo', label: 'Mã khách hàng ✱', enabled: true },
        { id: 'itemsList', label: 'Danh Sách Món', enabled: true, locked: true },
        { id: 'financials', label: 'Tổng tiền & Chiết khấu', enabled: true },
        { id: 'wifi', label: 'Mật khẩu Wifi', enabled: true },
        { id: 'qrCode', label: 'Mã QR Thanh Toán ✱', enabled: true },
        { id: 'footer', label: 'Lời cảm ơn', enabled: true }
    ];

    const config = value && value.length > 0 ? value : fallbackConfig;

    const moveUp = (index) => {
        if (index <= 0 || config[index].locked || config[index - 1].locked) return;
        const newConfig = [...config];
        [newConfig[index - 1], newConfig[index]] = [newConfig[index], newConfig[index - 1]];
        onChange(newConfig);
    };

    const moveDown = (index) => {
        if (index >= config.length - 1 || config[index].locked || config[index + 1].locked) return;
        const newConfig = [...config];
        [newConfig[index], newConfig[index + 1]] = [newConfig[index + 1], newConfig[index]];
        onChange(newConfig);
    };

    const sampleItems = (menu || []).filter(m => !m.isDeleted).slice(0, 2);
    const mockCart = sampleItems.length > 0 ? sampleItems.map((m, idx) => ({
        count: idx + 1, item: m, size: m.sizes?.[0] || { label: 'M' },
        sugar: m.sugarOptions?.[0] || 'Ngọt ít', ice: m.iceOptions?.[0] || 'Nhiều đá',
        addons: idx === 1 && m.addons?.length > 0 ? [m.addons[0]] : [],
        totalPrice: (m.price + (m.sizes?.[0]?.priceAdjust || 0)) + (idx === 1 && m.addons?.length > 0 ? m.addons[0].price : 0), note: idx === 1 ? 'Ít đường' : ''
    })) : [];

    const mockSubTotal = mockCart.reduce((total, c) => total + (c.totalPrice * c.count), 0);
    const mockTotal = mockSubTotal; // simplified for builder

    const mockOrder = {
        id: '1234', queueNumber: 99, tagNumber: 'TAG-12', tableName: 'Bàn A1',
        customerName: 'Khách VIP', customerPhone: '0901234567', price: mockTotal,
        preTaxTotal: mockTotal, taxAmount: 0, taxMode: 'NONE', taxRate: 0,
        paymentMethod: 'Chuyển khoản', timestamp: Date.now()
    };

    const previewHTML = generateReceiptHTML(mockOrder, mockCart, { ...settings, receiptConfig: config }, false);

    return (
        <div className="mt-6 border-t border-gray-100 pt-6">
            <h4 className="text-[10px] font-black uppercase text-gray-900 mb-4">Bố cục hóa đơn in</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                <div className="space-y-4">
                    <div className="bg-white border border-gray-100 p-4 shadow-sm mb-4">
                        <h5 className="text-[10px] font-black uppercase text-gray-900 mb-3 border-b pb-2">Kích thước & Khoảng cách</h5>
                        <div className="space-y-4">
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="text-[10px] font-black text-gray-500 uppercase">Cỡ chữ cơ bản</label>
                                    <span className="text-xs font-bold text-brand-600 px-1">{settings.receiptFontSize || 12}px</span>
                                </div>
                                <input type="range" min="8" max="16" step="1" value={settings.receiptFontSize || 12} onChange={e => setSettings({ ...settings, receiptFontSize: parseInt(e.target.value) })} className="w-full accent-brand-500" />
                            </div>
                        </div>
                    </div>
                    <div className="bg-gray-50/50 border border-gray-100 p-4 space-y-2 max-h-[400px] overflow-y-auto">
                        {config.map((item, index) => (
                            <div key={item.id} className={`flex items-center justify-between p-3 bg-white border ${item.locked ? 'border-amber-200 bg-amber-50/30' : 'border-gray-200'}`}>
                                <div className="flex-1 flex items-center gap-3">
                                    {!item.locked ? (
                                        <div className="flex flex-col gap-0.5">
                                            <button onClick={() => moveUp(index)} disabled={index === 0 || config[index - 1]?.locked} className="p-1 text-gray-400 hover:text-brand-500 disabled:opacity-20"><ChevronUp size={14} /></button>
                                            <button onClick={() => moveDown(index)} disabled={index === config.length - 1 || config[index + 1]?.locked} className="p-1 text-gray-400 hover:text-brand-500 disabled:opacity-20"><ChevronDown size={14} /></button>
                                        </div>
                                    ) : <div className="p-1 text-amber-400"><Lock size={14} /></div>}
                                    <span className={`text-[11px] font-black uppercase ${item.locked ? 'text-amber-700' : 'text-gray-700'}`}>{item.label}</span>
                                </div>
                                {!item.locked && (
                                    <button onClick={() => { const next = [...config]; next[index].enabled = !next[index].enabled; onChange(next); }} className={`w-10 h-6 flex items-center p-1 transition-all ${item.enabled ? 'bg-green-500 justify-end' : 'bg-gray-300 justify-start'}`}><div className="w-4 h-4 bg-white shadow-sm" /></button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
                <div className="space-y-4">
                    <p className="text-[10px] font-black uppercase text-gray-500 mb-2">Live Preview (Bản xem trước)</p>
                    <div className="bg-gray-200 p-6 flex justify-center items-start min-h-[500px] border border-gray-300 shadow-inner overflow-hidden relative">
                        <div className="bg-white p-4 shadow-xl border border-gray-100 overflow-hidden" style={{ width: '300px' }} dangerouslySetInnerHTML={{ __html: previewHTML }} />
                    </div>
                </div>
            </div>
        </div>
    );
};

export const KitchenTicketBuilder = ({ settings, setSettings, menu, inventory }) => {
    const sampleItem = (menu || []).filter(m => !m.isDeleted && m.recipe && m.recipe.length > 0)[0] || (menu || []).filter(m => !m.isDeleted)[0];
    const mockOrder = { id: 'ORDER-1234', queueNumber: 88, tagNumber: 'TAG-05', timestamp: Date.now() };
    const mockItem = sampleItem ? {
        count: 2, item: sampleItem, size: sampleItem.sizes?.[0] || { label: 'L' },
        sugar: sampleItem.sugarOptions?.[0] || '50% Đường', ice: sampleItem.iceOptions?.[0] || 'Ít đá',
        addons: sampleItem.addons?.slice(0, 2) || [], note: 'Giao nhanh giúp em'
    } : { count: 2, item: { name: 'CAFE ĐÁ' }, size: { label: 'L' }, sugar: '50%', ice: 'Ít đá', note: 'Giao nhanh' };
    
    let mockRecipe = ['- 150ml Trà', '- 30g Bột sữa'];
    if (sampleItem && sampleItem.recipe && sampleItem.recipe.length > 0) {
        mockRecipe = sampleItem.recipe.map(r => {
            const inv = (inventory || []).find(i => i.id === r.ingredientId);
            return `- ${r.quantity} ${inv?.unit || ''} ${inv?.name || 'Nguyên liệu'}`;
        });
    }
    
    const previewHTML = generateKitchenTicketHTML(mockOrder, mockItem, mockRecipe, settings);

    return (
        <div className="mt-6 border-t border-gray-100 pt-6">
            <h4 className="text-[10px] font-black uppercase text-gray-900 mb-4">Cấu hình giao diện In Bếp</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                <div className="bg-white border border-gray-100 p-4 shadow-sm space-y-4">
                    <h5 className="text-[10px] font-black uppercase text-gray-900 mb-3 border-b pb-2">Kích thước & Khoảng cách</h5>
                    <div>
                        <div className="flex justify-between items-center mb-1"><label className="text-[10px] font-black text-gray-500 uppercase">Cỡ chữ cơ bản</label><span className="text-xs font-bold text-brand-600 px-1">{settings.kitchenFontSize || 14}px</span></div>
                        <input type="range" min="8" max="24" step="1" value={settings.kitchenFontSize || 14} onChange={e => setSettings({ ...settings, kitchenFontSize: parseInt(e.target.value) })} className="w-full accent-brand-500" />
                    </div>
                </div>
                <div className="space-y-4">
                    <p className="text-[10px] font-black uppercase text-gray-500 mb-2">Xem trước (Máy in Bếp)</p>
                    <div className="bg-gray-200 p-6 flex justify-center items-start min-h-[400px] border border-gray-300 shadow-inner overflow-hidden">
                        <div className="bg-white p-4 shadow-xl border border-gray-100 overflow-hidden" style={{ width: settings.kitchenPaperSize === 'K58' ? '200px' : '300px' }} dangerouslySetInnerHTML={{ __html: previewHTML }} />
                    </div>
                </div>
            </div>
        </div>
    );
};

