import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    X, ShoppingBag, Search, Trash2, Plus, Minus, 
    CheckCircle2, Gift, QrCode, Camera, Printer, 
    ChevronUp, ChevronDown, GripVertical, Lock, Star, DollarSign, LayoutGrid 
} from 'lucide-react';
import { ShortcutProvider, useShortcut } from '../ShortcutManager';
import { calculateCartWithPromotions } from '../../utils/promotionEngine';
import { calculateLiveOrderTax } from '../../utils/taxUtils';
import { 
    isInputActive, isInputFocused, getNextOrderSource, isDoubleTap 
} from '../../utils/ShortcutUtils.js';
import { SERVER_URL as API_URL, getImageUrl } from '../../api';
import VisualFlashOverlay from '../VisualFlashOverlay';
import { getSortedCategories } from '../AdminDashboard';
import { generateKitchenTicketHTML, generateReceiptHTML, generateCombinedKitchenTicketHTML } from '../../utils/printHelpers';
import { CurrencyInput } from '../../utils/dashboardUtils';
import SharedCustomizationModal from '../SharedCustomizationModal';
import HUDItemCard from './HUDItemCard';


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
    // Hiện ô nhập mã khi: có PROMO_CODE đang bật + giỏ hàng có món thuộc chương trình
    const hasActivePromoCode = (promotions || []).some(p => {
        if (!p.isActive || p.type !== 'PROMO_CODE') return false;
        if (p.startDate && new Date(`${p.startDate}T00:00:00`).getTime() > Date.now()) return false;
        if (p.endDate   && new Date(`${p.endDate}T23:59:59`).getTime()   < Date.now()) return false;
        const ids = p.applicableItems || [];
        if (ids.length === 0 || ids.includes('ALL')) return true;
        return cart.some(c => ids.includes(c.item?.id));
    });
    const [selectedItem, setSelectedItem] = useState(null);
    const [editingCartItemId, setEditingCartItemId] = useState(null);
    const [activeHudItem, setActiveHudItem] = useState(null);
    const [editItemData, setEditItemData] = useState(null);
    const [selectedTableId, setSelectedTableId] = useState(initialOrder?.tableId || initialTableId || null);
    const [showCheckout, setShowCheckout] = useState(false);
    const [receivedAmount, setReceivedAmount] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('Chuyển khoản');
    const [printCurrentOrder, setPrintCurrentOrder] = useState(localStorage.getItem('printReceiptEnabled') !== 'false');
    const [printKitchenTicket, setPrintKitchenTicket] = useState(localStorage.getItem('printKitchenEnabled') === 'true');

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
    const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
    const [posAlert, setPosAlert] = useState(null);
    const [orderMode, setOrderMode] = useState(() => localStorage.getItem('orderMode') || 'classic');

    useEffect(() => {
        localStorage.setItem('posGridColumns', gridColumns.toString());
    }, [gridColumns]);

    useEffect(() => {
        localStorage.setItem('orderMode', orderMode);
        // Reset HUD khi chuyển chế độ
        setActiveHudItem(null);

        if (orderMode === 'touch') {
            // Fix 8: Giới hạn gridColumns ≤ 4 khi màn hình nhỏ (iPad vuông/nhỏ)
            const clampColumns = () => {
                if (window.innerWidth < 810) setGridColumns(c => Math.min(c, 4));
            };
            clampColumns();
            window.addEventListener('resize', clampColumns);

            // Fix Q2: Cảnh báo 1 lần khi có món nhiều topping (>4 addon)
            const HUD_WARNED_KEY = 'hud_topping_warned';
            if (!localStorage.getItem(HUD_WARNED_KEY) && menu?.length) {
                const highAddonCount = menu.filter(i => (i.addons?.length || 0) > 4).length;
                if (highAddonCount > 0) {
                    showToast(
                        `⚡ HUD-Touch: Có ${highAddonCount} món vượt 4 topping — chỉ hiển 4 đầu tiên. Giao diện này tối ưu cho quán ít món & ít topping.`,
                        'info'
                    );
                    localStorage.setItem(HUD_WARNED_KEY, '1');
                }
            }

            return () => window.removeEventListener('resize', clampColumns);
        }
    }, [orderMode, menu]);

    useEffect(() => {
        localStorage.setItem('printReceiptEnabled', printCurrentOrder.toString());
    }, [printCurrentOrder]);

    useEffect(() => {
        localStorage.setItem('printKitchenEnabled', printKitchenTicket.toString());
    }, [printKitchenTicket]);

    useEffect(() => {
        if (!posAlert) return;
        const handleAlertKey = (e) => {
            if (e.key === 'Enter' || e.key === 'NumpadEnter' || e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                setPosAlert(null);
            }
        };
        window.addEventListener('keydown', handleAlertKey, { capture: true });
        return () => window.removeEventListener('keydown', handleAlertKey, { capture: true });
    }, [posAlert]);

    // Notify parent khi modal mở/đóng để tắt ShortcutProvider
    useEffect(() => {
        if (onModalStateChange) onModalStateChange(showCheckout || !!selectedItem || !!posAlert);
    }, [showCheckout, selectedItem, posAlert, onModalStateChange]);

    // Lắng nghe tín hiệu ESC reset từ ShortcutProvider → hiện thông báo
    const { escResetKey, isShortcutActive } = useShortcut() || {};
    useEffect(() => {
        if (!escResetKey) return;
        if (showToast) showToast('Phím tắt đã đặt lại  ·  Nhấn ESC lần nữa để đóng', 'info');
    }, [escResetKey]);

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
                } else if (isShortcutActive?.()) {
                    // Shortcut đang active — để ShortcutProvider xử lý ESC, không đóng order
                    return;
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
    }, [showCheckout, selectedItem, onClose, settings?.enableDeliveryApps, isShortcutActive]);

    const sortedCategories = getSortedCategories(menu, settings);
    const categories = ['All', ...sortedCategories];

    // Đặt ở module level để không tạo lại mỗi render
    // (normalizeString và isSubsequence không phụ thuộc state nào)
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

    // useMemo: chỉ filter+sort lại khi menu, tab, search, sort thực sự thay đổi
    // Tránh chạy lại khi gõ tên khách, chọn bàn, nhập mã promo...
    const filtered = useMemo(() => {
        const normalizedQuery = normalizeString(searchQuery);
        return menu
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
    }, [menu, activeCategory, searchQuery, sortOption]); // eslint-disable-line react-hooks/exhaustive-deps

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
                setPosAlert(`Số lượng khả dụng của món này chỉ còn ${threshold} phần!`);
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
            setPosAlert('Món này đã hết hàng!');
            return;
        }
        const threshold = mainItem.availablePortions;
        if (threshold !== null && threshold !== undefined) {
            const currentCountInCart = cart.filter(c => c.item.id === mainItem.id).reduce((sum, c) => sum + c.count, 0);
            let qtyToAdd = shortcutQuantity || 1;
            if (currentCountInCart + qtyToAdd > threshold) {
                setPosAlert(`Số lượng khả dụng của món này chỉ còn ${threshold} phần!`);
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

    // useMemo: chỉ tính lại khi giỏ hàng, nguồn đơn, promo, hoặc settings thực sự thay đổi
    // Tránh JSON.parse(JSON.stringify) deep clone mỗi render khi gõ tên khách, chọn bàn...
    const calculation = useMemo(() => {
        let effectiveCart = cart;
        const feePercent = settings?.deliveryAppsConfigs?.[orderSource]?.fee || 0;
        if (orderSource !== 'INSTORE' && feePercent > 0 && feePercent < 100) {
            const multiplier = 1 / (1 - (feePercent / 100));
            effectiveCart = cart.map(c => {
                // Shallow clone + override giá trị thay vì JSON.parse(JSON.stringify)
                // Nhanh hơn ~10x, tránh serialize toàn bộ nested object
                const applyMarkup = (price) => Math.ceil(price * multiplier);
                const newItem = c.item ? { ...c.item, price: applyMarkup(c.item.price || 0) } : c.item;
                const newSize = c.size ? { ...c.size, priceAdjust: applyMarkup(c.size.priceAdjust || 0) } : c.size;
                const newAddons = (c.addons || []).map(a => ({ ...a, price: applyMarkup(a.price || 0) }));
                const baseP = parseFloat(newItem?.price) || 0;
                const sizeP = parseFloat(newSize?.priceAdjust) || 0;
                const addonP = newAddons.reduce((s, a) => s + (parseFloat(a.price) || 0), 0);
                return { ...c, item: newItem, size: newSize, addons: newAddons, totalPrice: baseP + sizeP + addonP };
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
    }, [cart, orderSource, promoCodeInput, selectedPromoId, promotions, settings, menu]); // eslint-disable-line react-hooks/exhaustive-deps
    const { totalOrderPrice, preTaxTotal, taxAmount, taxRate, taxMode, baseTotal, discount, validPromo, availablePromotions, processedCart } = calculation;

    const mergedCart = useMemo(() => {
        const merged = [];
        processedCart.forEach(curr => {
            const matchIndex = merged.findIndex(item => {
                if (item.isGift !== curr.isGift) return false;
                if (item.item.id !== curr.item.id) return false;
                if (item.size?.label !== curr.size?.label) return false;
                if (item.sugar !== curr.sugar) return false;
                if (item.ice !== curr.ice) return false;
                if (item.note !== curr.note) return false;
                if (item.totalPrice !== curr.totalPrice) return false;
                const a1 = (item.addons || []).map(a => a.label).sort().join('|');
                const a2 = (curr.addons || []).map(a => a.label).sort().join('|');
                if (a1 !== a2) return false;
                return true;
            });
            if (matchIndex > -1) {
                merged[matchIndex] = { ...merged[matchIndex], count: merged[matchIndex].count + curr.count };
            } else {
                merged.push({ ...curr });
            }
        });
        return merged;
    }, [processedCart]);

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
                itemName: mergedCart.map(c => `${c.item.name} (${c.size?.label || 'Mặc định'}) x${c.count}`).join(', '),
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
                cartItems: mergedCart,
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
                    const htmlContent = generateReceiptHTML({ ...data.order, paymentMethod, tagNumber, tableName: orderData.tableName }, mergedCart, settings, false);
                    ipcRenderer.invoke('print-html', htmlContent, selectedPrinter, settings?.receiptPaperSize).catch(console.error);
                }
                if (printKitchenTicket && window.require) {
                    const { ipcRenderer } = window.require('electron');
                    const kitchenPrinter = localStorage.getItem('kitchenPrinter') || selectedPrinter;
                    const kitchenHtmlContent = generateCombinedKitchenTicketHTML({ ...data.order, paymentMethod, tagNumber, tableName: orderData.tableName }, mergedCart, settings);
                    
                    if (printCurrentOrder) {
                        setTimeout(() => {
                            ipcRenderer.invoke('print-html', kitchenHtmlContent, kitchenPrinter, settings?.kitchenPaperSize).catch(console.error);
                        }, 1500); 
                    } else {
                        ipcRenderer.invoke('print-html', kitchenHtmlContent, kitchenPrinter, settings?.kitchenPaperSize).catch(console.error);
                    }
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
                else setPosAlert(errData.message || 'Lỗi khi gửi đơn hàng!');
            }
        } catch (err) {
            console.error('submitOrder error:', err);
            const msg = err?.message || 'Lỗi kết nối máy chủ!';
            if (showToast) showToast(msg, 'error');
            else setPosAlert(msg);
        }
        setSubmitting(false);
    };

    const changeDue = Math.max(0, parseFloat(receivedAmount || 0) - totalOrderPrice);
    const categoryStyles = { 'TRUYỀN THỐNG': 'bg-amber-600', 'PHA MÁY': 'bg-zinc-900', 'Trà': 'bg-brand-600', 'Khác': 'bg-orange-600', 'All': 'bg-brand-600' };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[500] bg-gray-100 flex flex-col font-main overflow-hidden">
            {settings?.flashConfirmationEnabled !== false && <VisualFlashOverlay />}
            <div className="bg-white border-b border-gray-200 flex justify-between items-center shadow-sm z-10" style={{ padding: 'clamp(8px,1.2vw,14px) clamp(12px,2vw,24px)' }}>
                <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                    <button onClick={onClose} className="p-1.5 sm:p-2 hover:bg-gray-100 transition-all rounded-lg">
                        <X size={20} />
                    </button>
                    <h2 className="font-black tracking-tight uppercase hidden lg:block" style={{ fontSize: 'clamp(14px,1.5vw,20px)' }}>BÁN HÀNG</h2>
                </div>
                <div className="flex-1 flex items-center justify-center gap-2 px-2 sm:px-4 max-w-[800px] w-full mx-auto">
                    <div className="flex items-center bg-gray-100/80 p-1 border border-gray-200 rounded-[10px] flex-1" style={{ height: 'clamp(40px,5vh,54px)' }}>
                        <button 
                            onClick={() => setOrderMode('classic')} 
                            className={`flex-1 h-full font-black uppercase tracking-wider transition-all rounded-[8px] flex items-center justify-center gap-1 ${orderMode === 'classic' ? 'bg-white shadow-[0_2px_10px_rgba(0,0,0,0.1)] text-gray-900 border border-gray-200/50' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200/50'}`}
                            style={{ fontSize: 'clamp(10px,1.2vw,13px)' }}
                        >
                            Classic
                        </button>
                        <button 
                            onClick={() => setOrderMode('touch')} 
                            className={`flex-1 h-full font-black uppercase tracking-wider transition-all rounded-[8px] flex items-center justify-center gap-1 ${orderMode === 'touch' ? 'bg-brand-600 text-white shadow-[0_4px_15px_rgba(0,0,0,0.2)] border border-brand-500' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200/50'}`}
                            style={{ fontSize: 'clamp(10px,1.2vw,13px)' }}
                        >
                            HUD-Touch
                        </button>
                    </div>
                    <button 
                        title={`Đang hiển thị ${gridColumns} cột`} 
                        onClick={() => setGridColumns(prev => prev === 6 ? 2 : prev + 1)} 
                        className="flex items-center justify-center transition-all bg-white border border-brand-600 shadow-sm hover:bg-brand-50 active:scale-95 shrink-0" 
                        style={{ borderRadius: '10px', height: 'clamp(40px,5vh,54px)', width: 'clamp(56px,7vw,100px)' }}
                    >
                        <div className="flex gap-1 items-center">
                            {Array.from({ length: gridColumns }).map((_, i) => <div key={i} className="w-1.5 bg-brand-600" style={{ borderRadius: '4px', height: 'clamp(16px,2.5vw,24px)' }} />)}
                        </div>
                    </button>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                    <div className="text-right hidden sm:block">
                        <p className="text-gray-400 font-black uppercase tracking-widest" style={{ fontSize: 'clamp(8px,0.9vw,10px)' }}>Nhân viên trực</p>
                        <p className="font-black text-gray-900" style={{ fontSize: 'clamp(11px,1.2vw,14px)' }}>{userName || 'Admin'}</p>
                    </div>
                    <div className="bg-gray-100 border border-gray-200 flex items-center justify-center font-black text-brand-600 rounded-[10px]" style={{ width: 'clamp(32px,3.5vw,40px)', height: 'clamp(32px,3.5vw,40px)', fontSize: 'clamp(10px,1.1vw,13px)' }}>
                        {userName ? userName.substring(0, 2).toUpperCase() : 'AD'}
                    </div>
                </div>
            </div>
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                <div className="flex-1 flex flex-col bg-[#F8F4EF] overflow-hidden">
                    {orderMode !== 'touch' && (
                    <div className="bg-white border-b border-gray-100 flex flex-col shadow-sm z-10">
                        <div className="hidden md:flex flex-col sm:flex-row gap-2 w-full border-b border-gray-50" style={{ padding: 'clamp(8px,1.2vw,12px) clamp(10px,1.5vw,16px)' }}>
                            <div className="relative flex-1 w-full">
                                <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Tìm món nhanh..."
                                    className="w-full h-full bg-gray-50 border border-gray-200 font-black text-gray-800 outline-none focus:ring-4 focus:ring-brand-600/10 transition-all rounded-[var(--radius-btn)]"
                                    style={{ padding: 'clamp(8px,1vw,12px) clamp(36px,4vw,52px) clamp(8px,1vw,12px) clamp(10px,1.2vw,16px)', minHeight: 'clamp(38px,4.5vh,46px)', fontSize: 'clamp(12px,1.2vw,14px)' }} />
                            </div>
                            <div className="flex gap-2 w-full sm:w-auto">
                                <select value={sortOption} onChange={e => setSortOption(e.target.value)}
                                    className="flex-1 sm:w-44 bg-gray-50 border border-gray-200 font-black text-gray-800 outline-none focus:ring-4 focus:ring-brand-600/10 transition-all cursor-pointer rounded-[var(--radius-btn)] shrink-0"
                                    style={{ padding: 'clamp(8px,1vw,12px) clamp(10px,1.2vw,16px)', fontSize: 'clamp(11px,1.1vw,14px)' }}>
                                    <option value="shortcut">Theo phím tắt</option><option value="category">Theo danh mục</option><option value="name">Theo tên (A-Z)</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar" style={{ padding: 'clamp(6px,1vw,10px) clamp(10px,1.5vw,16px)' }}>
                            {categories.map(cat => (
                                <button key={cat} onClick={() => setActiveCategory(cat)}
                                    className={`flex-shrink-0 flex items-center gap-1.5 font-black tracking-wider transition-all border ${activeCategory === cat ? (categoryStyles[cat] || 'bg-gray-900 border-transparent') + ' text-white shadow-md' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50 active:scale-95'}`}
                                    style={{ borderRadius: 'var(--radius-btn)', minHeight: 'clamp(32px,4vh,40px)', padding: 'clamp(5px,0.8vw,8px) clamp(10px,1.5vw,20px)', fontSize: 'clamp(10px,1.1vw,13px)' }}>
                                    <div className={`w-1.5 h-1.5 flex-shrink-0 ${activeCategory === cat ? 'bg-white' : (categoryStyles[cat] || 'bg-gray-400')}`} style={{ borderRadius: '2px' }} />
                                    <span>{cat === 'All' ? 'TẤT CẢ' : cat}</span>
                                </button>
                            ))}
                            <div className="flex-1"></div>
                        </div>
                    </div>
                    )}
                    <style>{`@media(max-width:767px){ .pos-item-grid-mobile{ grid-template-columns: repeat(2, minmax(0,1fr)) !important; } }`}</style>
                    {/* Fix Q3: Swipe-right trên lưới → mở cart panel */}
                    <div
                        className={`pos-item-grid pos-item-grid-mobile pb-24 md:pb-0 ${orderMode === 'touch' ? '!gap-[2px]' : ''}`}
                        style={{ gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))`, WebkitOverflowScrolling: 'touch', padding: orderMode === 'touch' ? '2px' : undefined }}
                        onTouchStart={(e) => {
                            if (orderMode === 'touch') {
                                window._hudSwipeStartX = e.touches[0].clientX;
                                window._hudSwipeStartY = e.touches[0].clientY;
                            }
                        }}
                        onTouchEnd={(e) => {
                            if (orderMode === 'touch' && window._hudSwipeStartX !== undefined) {
                                const dx = e.changedTouches[0].clientX - window._hudSwipeStartX;
                                const dy = Math.abs(e.changedTouches[0].clientY - window._hudSwipeStartY);
                                const startY = window._hudSwipeStartY;
                                const screenH = window.innerHeight;
                                // Chỉ xử lý khi horizontal > vertical (không phải scroll dọc)
                                if (dx > 70 && dy < 80 && cart.length > 0) {
                                    // Vùng dưới 35% màn hình (gần nút thanh toán) → thẳng checkout
                                    if (startY > screenH * 0.65) {
                                        setIsMobileCartOpen(false);
                                        setTimeout(() => setShowCheckout(true), 100);
                                    } else {
                                        // Vùng trên → mở giỏ hàng
                                        setIsMobileCartOpen(true);
                                    }
                                }
                                window._hudSwipeStartX = undefined;
                                window._hudSwipeStartY = undefined;
                            }
                        }}
                    >
                        {filtered.map(item => {
                            if (orderMode === 'touch') {
                                return (
                                    <HUDItemCard 
                                        key={item.id}
                                        item={item}
                                        isActive={activeHudItem?.id === item.id}
                                        onActivate={setActiveHudItem}
                                        onClose={() => setActiveHudItem(null)}
                                        onQuickAdd={(customizedItem) => handleAddToCartFromModal(customizedItem, false)}
                                        formatVND={formatVND}
                                        getImageUrl={getImageUrl}
                                        categoryStyles={categoryStyles}
                                    />
                                );
                            }

                            const warnLimit = (settings?.warningThreshold !== undefined && settings?.warningThreshold !== '') ? Number(settings.warningThreshold) : 2;
                            const showLowStock = !item.isSoldOut && item.availablePortions !== null && item.availablePortions !== undefined && item.availablePortions <= warnLimit && item.availablePortions > 0;
                            return (
                                <div key={item.id} onClick={() => item.isSoldOut ? setPosAlert('Món này đã hết hàng!') : openItem(item)} className={`pos-item-card group relative ${item.isSoldOut ? 'grayscale cursor-not-allowed' : 'cursor-pointer'}`}>
                                    {item.image && <img src={getImageUrl(item.image)} className={`w-full h-full object-cover ${item.isSoldOut ? '' : ''}`} loading="lazy" alt="" />}
                                    {item.isSoldOut && <div className="absolute inset-0 bg-black/10 z-30 flex flex-col items-center justify-center"><span className="bg-red-600/90 text-white shadow-xl font-black text-sm uppercase tracking-widest border border-red-800" style={{ padding: '8px 16px', borderRadius: 'var(--radius-badge)' }}>HẾT MÓN</span></div>}
                                    {/* Left column: Addon shortcuts + SL stacked */}
                                    {!item.isSoldOut && (item.availablePortions !== null && item.availablePortions !== undefined || item.addons?.length > 0) && (
                                        <div className="absolute bottom-[38px] left-0 z-20 flex flex-col items-start pointer-events-none gap-0.5 pb-0.5">
                                            {/* Addon shortcut badges — dùng background đặc không có blur (bọng blur tạo GPU layer riêng, rất nặng khi scroll) */}
                                            {item.addons?.length > 0 && item.addons.slice(0, 5).map((addon, idx) => (
                                                <span key={idx} className="flex items-center gap-1" style={{ padding: '3px 6px', borderRadius: 'var(--radius-badge)', background: 'rgba(0,0,0,0.65)' }}>
                                                    <span className="text-[10px] font-black text-yellow-300 leading-none">[{idx + 1}]</span>
                                                    <span className="text-[10px] font-bold text-white/90 leading-none max-w-[140px] truncate">{addon.label}</span>
                                                </span>
                                            ))}
                                            {item.addons?.length > 5 && (
                                                <span className="text-[10px] font-black text-white/60 leading-none" style={{ padding: '3px 6px', borderRadius: 'var(--radius-badge)', background: 'rgba(0,0,0,0.65)' }}>+{item.addons.length - 5} more</span>
                                            )}
                                            {/* SL indicator */}
                                            {showLowStock && (
                                                <span className="font-black text-[12px] bg-red-500 text-white animate-pulse" style={{ padding: '2px 8px', borderRadius: 'var(--radius-badge)' }}>
                                                    SL: {item.availablePortions}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                    <div className="absolute top-2 right-2 z-20 flex flex-col items-end gap-1"><span className="bg-[#1A1A1A] text-[#FFD60A] font-mono text-[14px] font-black shadow-md" style={{ padding: '4px 8px', borderRadius: 'var(--radius-badge)' }}>{Math.round(parseFloat(item.price))}K</span></div>
                                    <div className="absolute top-2 left-2 z-10"><span className={`${categoryStyles[item.category] || 'bg-black/60'} text-white text-[10px] font-black uppercase tracking-widest shadow-lg block`} style={{ padding: '4px 10px', borderRadius: 'var(--radius-badge)' }}>{item.category}</span></div>
                                    {/* Thanh tên phía dưới — dùng bg-white/90 không có blur (backdrop-filter tạo stacking context mới, buộc GPU composite độc lập cho mỗi card) */}
                                    <div className="absolute bottom-0 left-0 right-0 flex justify-center items-center gap-2 z-10" style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.92)' }}><p className="font-black text-[13px] text-gray-900 truncate uppercase text-center w-full">{item.name}{settings?.showHotkeys && item.shortcutCode && <span className="text-gray-500 ml-1">- {item.shortcutCode}</span>}</p></div>
                                </div>
                            );
                        })}
                    </div>
                </div>
                
                {isMobileCartOpen && (
                    <div 
                        className={`fixed inset-0 bg-black/50 z-[450] ${orderMode === 'touch' ? '' : 'md:hidden'} backdrop-blur-sm transition-opacity`} 
                        onClick={() => setIsMobileCartOpen(false)}
                    />
                )}

                {/* Cart Panel: Persistent right sidebar on Desktop, Bottom Sheet on Mobile */}
                <div 
                    className={`w-full border-l border-gray-100 flex flex-col bg-[#FAFAFA] shrink-0 ${
                        orderMode === 'touch' 
                            ? `fixed right-0 top-0 bottom-0 w-[100vw] sm:w-[min(420px,42vw)] z-[500] shadow-[-15px_0_50px_rgba(0,0,0,0.4)] transform transition-transform duration-300 flex flex-col ${isMobileCartOpen ? 'translate-x-0' : 'translate-x-full'}` 
                            : `md:w-[min(380px,36vw)] md:relative md:z-10 md:transform-none md:translate-x-0 transition-transform duration-300 fixed right-0 top-0 bottom-0 w-[100vw] z-[500] flex flex-col ${isMobileCartOpen ? 'translate-x-0' : 'translate-x-full'}`
                    }`}
                >
                    {/* Overlay mờ phía sau giỏ hàng trên mobile đã được chuyển ra ngoài để tránh dính z-index conflict */}

                    <div className="border-b border-gray-100 bg-white flex justify-between items-center" style={{ padding: 'clamp(12px,1.8vw,24px) clamp(16px,2.5vw,32px)' }}>
                        <h3 className="font-black text-gray-900 tracking-tight text-base lg:text-xl uppercase">Giỏ hàng</h3>
                        <button className="md:hidden p-2 bg-gray-100 rounded-full text-gray-500 hover:text-gray-900 absolute right-4 transition-transform active:scale-95" onClick={() => setIsMobileCartOpen(false)}>
                            <X size={20} />
                        </button>
                    </div>

                    <div className="border-b border-gray-100 bg-gray-50/30" style={{ padding: 'clamp(12px,1.8vw,24px) clamp(16px,2.5vw,32px)' }} >
                        <div className="flex justify-between items-center mb-3"><h3 className="font-black text-base text-gray-900 flex items-center gap-2"><ShoppingBag size={20} className="text-brand-600" /> CHI TIẾT</h3><button onClick={() => setCart([])} className="text-xs font-black text-red-500 hover:bg-red-50 px-2 py-1 transition-all">XÓA TẤT CẢ</button></div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {!settings?.isTakeaway ? (
                                <select value={selectedTableId || ''} onChange={e => setSelectedTableId(e.target.value || null)} className="w-full bg-white border border-gray-200 px-4 py-3 text-sm font-black text-brand-600 outline-none shadow-sm cursor-pointer"><option value="">🛵 Khách mang đi</option>{tables.map(t => <option key={t.id} value={t.id}>🍽️ {t.area} - {t.name} ({t.status})</option>)}</select>
                            ) : (
                                <div className="relative"><input value={tagNumber} onChange={e => setTagNumber(e.target.value)} placeholder="Tag Number / Thẻ Bàn..." className="w-full bg-white border border-gray-200 text-sm font-bold text-brand-500 outline-none shadow-sm h-[44px] px-3" style={{ borderRadius: 'var(--radius-btn)' }} /><div className="absolute right-3 top-1/2 -translate-y-1/2"><span className="text-[10px] font-black text-brand-500 bg-orange-50 px-3 py-1 uppercase" style={{ borderRadius: 'var(--radius-badge)' }}>Tag</span></div></div>
                            )}
                            <div className="relative"><input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Tên khách hàng..." className="w-full bg-white border border-gray-200 text-sm font-bold outline-none shadow-sm h-[44px] px-3" style={{ borderRadius: 'var(--radius-btn)' }} />{!customerName && <div className="absolute right-3 top-1/2 -translate-y-1/2"><span className="text-[10px] font-black text-brand-600 bg-brand-50 px-3 py-1 uppercase" style={{ borderRadius: 'var(--radius-badge)' }}>Auto</span></div>}</div>

                            {/* --- CHỌN ĐỐI TÁC GIAO HÀNG (NẾU BẬT) --- */}
                            {settings?.enableDeliveryApps !== false && (
                                <div className="flex bg-gray-50 p-1 border border-gray-100 gap-1 mt-3" style={{ borderRadius: '8px' }}>
                                    {['INSTORE', 'GRAB', 'SHOPEE'].map(src => {
                                        const isSelected = orderSource === src;
                                        let activeClass = 'bg-white text-brand-600 border border-brand-600/30 shadow-sm';
                                        if (src === 'GRAB') activeClass = 'bg-[#00B14F] text-white font-black shadow-md border-transparent';
                                        if (src === 'SHOPEE') activeClass = 'bg-[#EE4D2D] text-white font-black shadow-md border-transparent';

                                        return (
                                            <button key={src} onClick={() => setOrderSource(src)}
                                                className={`flex-1 py-2 text-xs font-black uppercase tracking-wider transition-all ${isSelected ? activeClass : 'text-gray-500 hover:bg-gray-100'}`} style={{ borderRadius: '6px' }}
                                            >
                                                {src === 'INSTORE' ? 'Tại Quán' : src === 'GRAB' ? 'Grab' : 'Shopee'}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar" style={{ padding: 'clamp(12px,1.8vw,24px) clamp(12px,2vw,28px)', display: 'flex', flexDirection: 'column', gap: 'clamp(8px,1.2vw,14px)' }}>
                        {processedCart.map((c, idx) => (
                            <div key={c.id || idx} className="relative border-b border-gray-100 last:border-0 shrink-0">
                                {!c.isGift && <div className="absolute inset-y-0 right-0 w-24 bg-red-500 flex items-center justify-end px-5"><Trash2 size={20} className="text-white" /></div>}
                                <motion.div drag={c.isGift ? false : "x"} dragConstraints={{ left: -80, right: 0 }} onDragEnd={(e, info) => !c.isGift && info.offset.x < -60 && removeFromCart(c.id)} className={`bg-gray-50 relative group ${c.isGift ? 'border-green-300 bg-green-50/30' : ''} w-full`} style={{ padding: '14px 16px' }}>
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex-1 min-w-0"><p className="font-black text-sm text-gray-900 truncate">{c.isGift ? '(KM) ' : ''}{c.item?.name || 'Món'}</p>
                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                            {c.size?.label && <span onClick={() => openItem(c.item, c)} className="text-[11px] font-black bg-white border border-gray-200 px-2.5 py-1 text-gray-600 uppercase cursor-pointer hover:bg-gray-50 transition-colors shadow-sm" style={{ borderRadius: '5px' }}>{c.size.label}</span>}
                                            {c.sugar && <span onClick={() => openItem(c.item, c)} className="text-[11px] font-black bg-amber-50 border border-amber-200 px-2.5 py-1 text-amber-700 cursor-pointer hover:bg-amber-100 transition-colors shadow-sm" style={{ borderRadius: '5px' }}>Đường: {c.sugar}</span>}
                                            {c.ice && <span onClick={() => openItem(c.item, c)} className="text-[11px] font-black bg-blue-50 border border-blue-200 px-2.5 py-1 text-blue-700 cursor-pointer hover:bg-blue-100 transition-colors shadow-sm" style={{ borderRadius: '5px' }}>Đá: {c.ice}</span>}
                                            {c.addons?.map((addon, aIdx) => <span key={aIdx} onClick={() => openItem(c.item, c)} className="text-[11px] font-black bg-orange-50 border border-orange-200 px-2.5 py-1 text-orange-700 cursor-pointer hover:bg-orange-100 transition-colors shadow-sm" style={{ borderRadius: '5px' }}>+{addon.label}</span>)}
                                            {c.note && <span onClick={() => openItem(c.item, c)} className="text-[11px] font-black bg-gray-100 border border-gray-300 px-2.5 py-1 text-gray-700 cursor-pointer hover:bg-gray-200 transition-colors shadow-sm whitespace-nowrap overflow-hidden text-ellipsis max-w-[120px]" style={{ borderRadius: '5px' }}>📝 {c.note}</span>}
                                        </div>
                                        </div>
                                        <div className="text-right ml-3 shrink-0"><p className="font-black text-sm text-gray-900">{formatVND(c.totalPrice * c.count)}</p><div className="flex items-center gap-2 mt-2 bg-white border border-gray-200 p-0.5"><button onClick={() => c.count > 1 ? setCart(cart.map(x => x.id === c.id ? { ...x, count: x.count - 1 } : x)) : removeFromCart(c.id)} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-red-500"><Minus size={12} /></button><span className="font-black text-sm w-4 text-center">{c.count}</span><button onClick={() => setCart(cart.map(x => x.id === c.id ? { ...x, count: x.count + 1 } : x))} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-brand-600"><Plus size={12} /></button></div></div>
                                    </div>
                                </motion.div>
                            </div>
                        ))}
                    </div>
                    <div className="border-t border-gray-200 bg-white" style={{ padding: 'clamp(12px,1.8vw,24px) clamp(12px,2vw,28px) clamp(16px,2.5vw,32px)', display: 'flex', flexDirection: 'column', gap: 'clamp(8px,1.2vw,14px)' }}>
                        <input value={orderNote} onChange={e => setOrderNote(e.target.value)} placeholder="Ghi chú đơn hàng..." className="w-full bg-gray-50 border border-gray-200 font-bold text-gray-900 outline-none text-sm" style={{ padding: '10px 14px', borderRadius: 'var(--radius-btn)' }} />
                        {hasActivePromoCode && (
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest shrink-0" style={{ width: '52px' }}>Mã KM</span>
                                <div className="flex-1 relative">
                                    <input
                                        type="text"
                                        value={promoCodeInput}
                                        onChange={e => { setPromoCodeInput(e.target.value.toUpperCase()); setSelectedPromoId(null); }}
                                        placeholder="Nhập mã giảm giá..."
                                        className="w-full bg-gray-50 border border-gray-200 font-bold text-gray-900 outline-none text-sm uppercase"
                                        style={{ padding: '10px 14px', borderRadius: 'var(--radius-btn)' }}
                                    />
                                    {promoCodeInput && availablePromotions.length === 0 && (
                                        <p className="text-red-500 text-[10px] font-extrabold mt-1">Mã không hợp lệ hoặc chưa đủ điều kiện</p>
                                    )}
                                    {validPromo && (
                                        <p className="text-[10px] font-black mt-1" style={{ color: 'var(--color-brand)' }}>✓ {validPromo.name} — Giảm {new Intl.NumberFormat('vi-VN').format(discount * 1000)}đ</p>
                                    )}
                                </div>
                            </div>
                        )}
                        <div className="flex justify-between items-center text-gray-400 font-black text-[10px] uppercase tracking-[2px]"><span>Tạm tính</span><span>{formatVND(baseTotal)}</span></div>
                        {discount > 0 && <div className="flex justify-between items-center text-brand-600 font-black text-[10px] uppercase tracking-[2px]"><span>Khuyến mãi</span><span>-{formatVND(discount)}</span></div>}
                        <div className="flex justify-between items-center border-t border-gray-100" style={{ paddingTop: '10px', marginTop: '2px' }}><span className="text-base font-black text-gray-900">Tổng thanh toán</span><span className="text-2xl font-black text-brand-600 tracking-tighter">{formatVND(totalOrderPrice)}</span></div>
                        <div className="grid grid-cols-2" style={{ gap: '12px', marginTop: '4px' }}><button onClick={() => onClose()} className="admin-btn-secondary !text-gray-400">HỦY ĐƠN</button><button onClick={() => { setIsMobileCartOpen(false); setTimeout(() => setShowCheckout(true), 300); }} disabled={submitting || cart.length === 0} className="admin-btn-primary">THANH TOÁN</button></div>
                    </div>
                </div>
            </div>

            {/* Floating Cart Tab + Quick Checkout Button — 1 cột liền */}
            {!isMobileCartOpen && cart.length > 0 && (
                <div
                    className={`fixed right-0 z-[400] flex flex-col transition-all duration-300 ${orderMode === 'touch' ? '' : 'md:hidden'}`}
                    style={{ top: 0, bottom: 0 }}
                >
                    {/* Phần 1 (2/3): Nút giỏ hàng */}
                    <button
                        onClick={() => setIsMobileCartOpen(true)}
                        className="bg-brand-600 text-white flex flex-col items-center justify-center gap-4 hover:bg-brand-500 active:bg-brand-700 transition-colors border-l border-t border-white/20"
                        style={{
                            flexGrow: 2,
                            flexBasis: 0,
                            width: 'clamp(36px, 5vw, 52px)',
                            boxShadow: '-4px 0 20px rgba(0,0,0,0.25)',
                            borderRadius: orderMode === 'touch' ? '0' : '16px 0 0 0',
                        }}
                    >
                        <div className="relative">
                            <ShoppingBag size={22} />
                            <span className="absolute -top-2 -right-2 bg-red-600 text-white text-[10px] font-black rounded-full min-w-[20px] h-[20px] px-0.5 flex items-center justify-center border-2 border-brand-600 shadow-sm">
                                {cart.length}
                            </span>
                        </div>
                        <div className="flex flex-col items-center gap-1" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                            <span className="font-black text-sm tracking-widest leading-none" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.3)' }}>{formatVND(totalOrderPrice)}</span>
                            <span className="text-[9px] text-white/75 font-bold uppercase tracking-[3px]">GIỎ HÀNG</span>
                        </div>
                    </button>

                    {/* Ranh giới mỏng giữa 2 phần */}
                    <div style={{ height: '1px', background: 'rgba(255,255,255,0.25)', flexShrink: 0 }} />

                    {/* Phần 2 (1/3): Nút thanh toán */}
                    <button
                        onClick={() => { setIsMobileCartOpen(false); setTimeout(() => setShowCheckout(true), 100); }}
                        className="text-white flex flex-col items-center justify-center gap-1.5 hover:brightness-110 active:scale-x-95 transition-all border-l border-b border-white/20"
                        style={{
                            flexGrow: 1,
                            flexBasis: 0,
                            width: 'clamp(36px, 5vw, 52px)',
                            background: 'linear-gradient(180deg, #16a34a 0%, #15803d 100%)',
                            boxShadow: '-4px 0 20px rgba(22,163,74,0.4)',
                            borderRadius: orderMode === 'touch' ? '0' : '0 0 0 16px',
                            writingMode: 'vertical-rl',
                            transform: 'rotate(180deg)',
                        }}
                        title="Thanh toán nhanh"
                    >
                        <span style={{ fontSize: 'clamp(8px,1vw,10px)', letterSpacing: '2px', writingMode: 'vertical-rl' }} className="uppercase font-black text-white/90">THANH TOÁN</span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="9 18 15 12 9 6"/>
                        </svg>
                    </button>
                </div>
            )}


            <ShortcutDoubleEnter onDoubleEnter={() => { if (cart.length > 0 && !showCheckout && !selectedItem) setShowCheckout(true); }} disabled={showCheckout || !!selectedItem} />
            <AnimatePresence>
                {showCheckout && (
                    <div className="fixed inset-0 z-[700] flex items-center justify-center p-6">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowCheckout(false)} className="absolute inset-0 bg-black/60 backdrop-blur-md" />
                        <motion.div initial={{ y: 50, opacity: 0, scale: 0.95 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 50, opacity: 0, scale: 0.95 }} className="admin-modal-container !max-w-lg flex flex-col" style={{ maxHeight: '90vh' }}>
                            <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
                            <div style={{ padding: '28px 28px 20px', display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'center' }}>
                                <p className="text-sm text-gray-400 font-black uppercase tracking-[4px]">Tổng thanh toán</p>
                                <h3 className="font-black text-brand-600" style={{ fontSize: '72px', lineHeight: 1 }}>{formatVND(totalOrderPrice)}</h3>

                                {/* Chi tiết món */}
                                <div className="text-left bg-gray-50 border border-gray-100" style={{ borderRadius: 'var(--radius-card)', padding: '12px 16px' }}>
                                    <p className="text-[9px] font-black uppercase tracking-[3px] text-gray-400 mb-3">Chi tiết đơn hàng</p>
                                    <div className="space-y-2 overflow-y-auto custom-scrollbar" style={{ maxHeight: '200px', paddingRight: '4px' }}>
                                        {mergedCart.map((c, idx) => (
                                            <div key={c.id || idx} className="flex justify-between items-start gap-2">
                                                <div className="flex-1 min-w-0">
                                                    <span className="font-black text-[13px] text-gray-900">{c.item?.name}</span>
                                                    <span className="text-[11px] font-black text-brand-600 ml-1">x{c.count}</span>
                                                    {c.size?.label && <span className="text-[11px] text-gray-400 ml-1">· {c.size.label}</span>}
                                                    {c.addons?.length > 0 && <span className="text-[11px] text-brand-500 ml-1">· {c.addons.map(a => a.label).join(', ')}</span>}
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <span className="font-black text-[13px] text-[#C68E5E]">{formatVND(c.totalPrice * c.count)}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    {discount > 0 && (
                                        <div className="flex justify-between items-center border-t border-dashed border-gray-200 mt-2 pt-2">
                                            <span className="text-[11px] font-bold text-brand-600">Khuyến mãi</span>
                                            <span className="font-bold text-[12px] text-brand-600">-{formatVND(discount)}</span>
                                        </div>
                                    )}
                                </div>
                                {/* Tab lựa chọn phương thức */}
                                <div className="grid grid-cols-2 gap-3">
                                    {['Tiền mặt', 'Chuyển khoản'].map(m => (
                                        <button key={m} onClick={() => setPaymentMethod(m)} className={`py-4 font-black text-base border-2 ${paymentMethod === m ? 'border-brand-600 bg-brand-600/5 text-brand-600' : 'border-gray-100 text-gray-400'}`} style={{ borderRadius: 'var(--radius-btn)' }}>{m}</button>
                                    ))}
                                </div>

                                {/* Tiền mặt: nhận tiền + tiền thừa */}
                                {paymentMethod === 'Tiền mặt' && (
                                    <div className="text-left" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        <div>
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[2px] mb-2">Tiền khách đưa</p>
                                            <CurrencyInput
                                                value={receivedAmount}
                                                onChange={e => setReceivedAmount(e.target.value)}
                                                placeholder={totalOrderPrice.toString()}
                                                autoFocus
                                                containerClassName="mb-3 border-2"
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
                                                        className="flex-1 bg-white border-2 border-brand-100 text-brand-700 font-black hover:bg-brand-50 hover:border-brand-400 transition-all text-[13px]" style={{ padding: '8px 4px', borderRadius: 'var(--radius-badge)' }}
                                                    >
                                                        {amount === totalOrderPrice && amount !== 500 && amount !== 200 && amount !== 100 && amount !== 50 ? "Vừa đủ" : formatVND(amount)}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        {parseFloat(receivedAmount || 0) >= totalOrderPrice && (
                                            <div className="flex justify-between items-center bg-green-50 border border-green-200" style={{ borderRadius: 'var(--radius-badge)', padding: '12px 16px' }}>
                                                <span className="font-black text-sm text-green-700 uppercase tracking-wider">Tiền thừa trả lại</span>
                                                <span className="font-black text-2xl text-green-600">{formatVND(changeDue)}</span>
                                            </div>
                                        )}
                                        {parseFloat(receivedAmount || 0) > 0 && parseFloat(receivedAmount || 0) < totalOrderPrice && (
                                            <div className="flex justify-between items-center bg-red-50 border border-red-200" style={{ borderRadius: 'var(--radius-badge)', padding: '12px 16px' }}>
                                                <span className="font-black text-sm text-red-600 uppercase tracking-wider">Còn thiếu</span>
                                                <span className="font-black text-2xl text-red-500">{formatVND(totalOrderPrice - parseFloat(receivedAmount))}</span>
                                            </div>
                                        )}

                                    </div>
                                )}

                                {/* Chuyển khoản: QR — margin-top để cách tab */}
                                {paymentMethod === 'Chuyển khoản' && (
                                    <div className="bg-gray-50 border border-gray-100 flex flex-col items-center gap-4" style={{ marginTop: '8px', padding: '20px', borderRadius: 'var(--radius-card)' }}>
                                        <img src={getVietQR(totalOrderPrice, initialOrder ? initialOrder.id : getOrderId())} className="w-48 h-48 border" style={{ borderRadius: '8px' }} />
                                        <p className="text-xs font-black text-gray-800 uppercase">{settings.bankId} · {settings.accountNo}</p>
                                    </div>
                                )}
                            </div>
                            </div>{/* end overflow-y-auto */}

                            {/* Toggle In hóa đơn / In bếp — cố định phía dưới, ngoài vùng scroll */}
                            <div className="border-t border-gray-100 flex items-center justify-center gap-8" style={{ padding: '16px 28px' }}>
                                <div className="flex items-center gap-3">
                                    <button onClick={() => setPrintCurrentOrder(v => !v)} className={`relative w-11 h-6 rounded-full transition-colors ${printCurrentOrder ? 'bg-brand-600' : 'bg-gray-200'}`}>
                                        <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${printCurrentOrder ? 'translate-x-5' : ''}`} />
                                    </button>
                                    <span className="font-black text-sm text-gray-500 uppercase tracking-wider">In hóa đơn</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button onClick={() => setPrintKitchenTicket(v => !v)} className={`relative w-11 h-6 rounded-full transition-colors ${printKitchenTicket ? 'bg-orange-500' : 'bg-gray-200'}`}>
                                        <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${printKitchenTicket ? 'translate-x-5' : ''}`} />
                                    </button>
                                    <span className="font-black text-sm text-gray-500 uppercase tracking-wider">In bếp</span>
                                </div>
                            </div>

                            <div className="bg-white flex gap-4" style={{ padding: '0 28px 28px' }}><button onClick={() => setShowCheckout(false)} className="admin-btn-secondary flex-1">QUAY LẠI</button><button onClick={() => submitOrder()} disabled={submitting} className="admin-btn-primary flex-1">XÁC NHẬN</button></div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Custom POS Alert Modal thay cho native alert */}
            <AnimatePresence>
                {posAlert && (
                    <div className="fixed inset-0 z-[800] flex items-center justify-center p-6 bg-black/20 backdrop-blur-sm">
                        <motion.div initial={{ opacity: 0, scale: 1.05 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1 }} className="bg-[#2C2C2E]/95 backdrop-blur-xl border border-white/10 flex flex-col items-center justify-center shadow-2xl pt-6 pb-0 px-0 overflow-hidden" style={{ borderRadius: '14px', width: '270px', maxWidth: '90vw' }}>
                            <h3 className="font-semibold text-[17px] text-white mb-5 px-4 text-center leading-relaxed">{posAlert}</h3>
                            <div className="w-full border-t border-[#3F3F42] flex flex-col">
                                <button onClick={() => setPosAlert(null)} className="w-full bg-transparent hover:bg-white/5 active:bg-white/10 text-[#0A84FF] font-semibold text-[17px] py-3.5 transition-colors flex items-center justify-center gap-2">
                                    Đóng
                                </button>
                                <div className="w-full pb-2 pt-1 flex justify-center border-t border-[#3F3F42]/30">
                                    <span className="text-[9px] text-white/40 tracking-widest uppercase font-black">PHÍM TẮT: ENTER HOẶC ESC</span>
                                </div>
                            </div>
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

