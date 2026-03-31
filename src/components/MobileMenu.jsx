import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    LayoutGrid, ShoppingBag, Plus, AlertCircle, CheckCircle2, QrCode, Home, Heart, Bell, Coffee
} from 'lucide-react';
import IceLevelIcon from './IceLevelIcon';
import SugarLevelIcon from './SugarLevelIcon';
import SharedCustomizationModal from './SharedCustomizationModal';
import { motion, AnimatePresence } from 'framer-motion';

import { calculateCartWithPromotions } from '../utils/promotionEngine';
import { SERVER_URL, getImageUrl } from '../api';

const formatVND = (price) => {
    const num = parseFloat(price);
    // If the price is already in 1000s (e.g., 21000), don't multiply. 
    // But per instructions: "input 21 tức là hiển thị 21.000đ"
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num * 1000);
};

const KIOSK_DEFAULT_SUGAR = ['100%', '50%', '0%'];
const KIOSK_DEFAULT_ICE = ['Bình thường', 'Ít đá', 'Không đá'];

let _idCounter = Date.now();

const MobileMenu = ({ settings }) => {
    const navigate = useNavigate();
    const [activeCategory, setActiveCategory] = useState('Tất cả');
    const [isTokenValid, setIsTokenValid] = useState(false);
    const [tokenChecked, setTokenChecked] = useState(false);
    const [qrToken, setQrToken] = useState(localStorage.getItem('qrToken'));
    const [selectedItem, setSelectedItem] = useState(null);
    const [cart, setCart] = useState(() => {
        const saved = localStorage.getItem('cart');
        return saved ? JSON.parse(saved) : [];
    });
    const [menuData, setMenuData] = useState([]);
    const [categories, setCategories] = useState(['Tất cả']);
    const [promotions, setPromotions] = useState([]);

    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape' && selectedItem) {
                e.preventDefault();
                setSelectedItem(null);
            }
        };
        window.addEventListener('keydown', handleEsc, { capture: true });
        return () => window.removeEventListener('keydown', handleEsc, { capture: true });
    }, [selectedItem]);

    useEffect(() => {
        localStorage.setItem('cart', JSON.stringify(cart));
    }, [cart]);

    useEffect(() => {
        const fetchMenu = async () => {
            try {
                const res = await fetch(`${SERVER_URL}/api/menu`);
                const data = await res.json();
                setMenuData(data);

                const cats = ['Tất cả', ...new Set(data.map(item => item.category))];
                setCategories(cats);
            } catch (e) {
                console.error("Lỗi fetch menu:", e);
            }
        };
        const fetchPromotions = async () => {
            try {
                const res = await fetch(`${SERVER_URL}/api/promotions`);
                if (res.ok) setPromotions(await res.json());
            } catch (e) {}
        };
        fetchMenu();
        fetchPromotions();
    }, []);

    useEffect(() => {
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
                setQrToken(savedToken);
            } catch (e) {
                setTokenChecked(true);
            }
        };
        checkToken();
        window.addEventListener('storage', checkToken);
        return () => window.removeEventListener('storage', checkToken);
    }, [qrToken]);

    const filteredDrinks = activeCategory === 'Tất cả'
        ? menuData
        : menuData.filter(d => d.category === activeCategory);

    const handlePlusClick = (item) => {
        const threshold = item.availablePortions;
        if (threshold !== null && threshold !== undefined) {
            const currentCountInCart = cart.filter(c => c.item.id === item.id).reduce((sum, c) => sum + c.count, 0);
            if (currentCountInCart + 1 > threshold) {
                 alert(`Xin lỗi, số lượng khả dụng của món này chỉ còn ${threshold} ly!`);
                 return;
            }
        }

        if (!isTokenValid) {
            alert('Mã QR code đã hết hạn hoặc không hợp lệ. Vui lòng quét lại QR code tại bàn.');
            return;
        }

        if ((item.sizes && item.sizes.length > 0) || (item.addons && item.addons.length > 0)
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
            id: `item-${_idCounter++}`,
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

    const handleAddToCartFromModal = async (customizedItem, isEdit) => {
        const token = localStorage.getItem('qrToken');
        if (token) {
            await fetch(`${SERVER_URL}/api/qr-token/accessed`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: token.toUpperCase() })
            }).catch(e => console.error("QR Accessed Error:", e));
        }

        setCart(prev => {
            const existing = prev.find(c =>
                c.item.id === customizedItem.item.id &&
                c.size?.label === customizedItem.size?.label &&
                c.sugar === customizedItem.sugar &&
                c.ice === customizedItem.ice &&
                JSON.stringify(c.addons) === JSON.stringify(customizedItem.addons) &&
                c.note === customizedItem.note
            );
            if (existing) {
                return prev.map(c => c.id === existing.id ? { ...c, count: c.count + 1, totalPrice: customizedItem.totalPrice } : c);
            }
            return [...prev, { id: `item-${_idCounter++}`, ...customizedItem }];
        });
        setSelectedItem(null);
    };

    return (
        <div className="page-transition pb-10">
            {/* QR Protection Banner */}
            {tokenChecked && !isTokenValid && (
                <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6 flex items-start gap-3 animate-pulse shadow-sm">
                    <AlertCircle className="text-red-500 shrink-0" size={20} />
                    <div>
                        <p className="text-red-800 font-black text-sm uppercase leading-none mb-1">YÊU CẦU MÃ QR</p>
                        <p className="text-red-600 text-[11px] font-medium">Bạn cần quét mã QR tại quầy để kích hoạt quyền đặt món.</p>
                    </div>
                </div>
            )}

            {/* Header */}
            <header className="flex justify-between items-center mb-8 px-1">
                <div className="flex items-center gap-3">
                    <div className="bg-accent/10 w-12 h-12 rounded-none flex items-center justify-center">
                        <Coffee size={24} className="text-accent" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em]">Welcome to</span>
                        <span className="font-black text-gray-900 text-lg leading-tight">{settings?.shopName || 'Caffee'}</span>
                    </div>
                </div>

            </header>

            <h1 className="mb-2 text-2xl font-black italic tracking-tighter">
                {tokenChecked ? (isTokenValid ? 'READY TO ORDER!' : 'VUI LÒNG QUÉT QR') : 'ĐANG KIỂM TRA...'}
            </h1>

            {/* Featured Hero Banner */}
            {settings?.featuredPromoImage && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-8 mt-2 group overflow-hidden shadow-sm border border-gray-100 bg-white"
                >
                    <div className="w-full relative overflow-hidden aspect-[21/9]">
                        <img
                            src={getImageUrl(settings.featuredPromoImage)}
                            alt="Featured"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                        />
                    </div>
                    <div className="p-5 flex flex-col items-center justify-center text-center bg-gradient-to-b from-white to-[#FDFCFB]">
                        <h2 className="text-gray-900 text-[18px] font-black mb-3 leading-tight tracking-tight uppercase">
                            {settings.featuredPromoTitle || 'Cà phê đặc biệt hôm nay!'}
                        </h2>
                        <button
                            onClick={() => {
                                const grid = document.querySelector('.grid');
                                grid?.scrollIntoView({ behavior: 'smooth' });
                            }}
                            className="text-white font-black px-8 py-3 text-xs w-fit flex items-center gap-2 shadow-lg hover:opacity-90 transition-all active:scale-95 uppercase tracking-[0.2em]"
                            
                        >
                            {settings.featuredPromoCTA || 'GỌI MÓN NGAY'}
                        </button>
                    </div>
                </motion.div>
            )}

            {/* Categories */}
            <div className="flex gap-3 overflow-x-auto pb-6 pt-2 no-scrollbar mb-4 mt-2 px-1">
                {categories.map(cat => (
                    <button
                        key={cat}
                        onClick={() => setActiveCategory(cat)}
                        className={`px-5 py-2 whitespace-nowrap text-[10px] font-black transition-all cursor-pointer rounded-none border-2 uppercase tracking-widest ${activeCategory === cat
                                ? 'bg-gray-900 border-gray-900 text-white shadow-lg'
                                : 'bg-white border-gray-100 text-gray-400 hover:border-gray-200'
                            }`}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            {/* Grid */}
            <div className="grid grid-cols-2 gap-6 mt-8">
                {filteredDrinks.map(drink => (
                    <div key={drink.id} className="coffee-card group">
                        <div className="coffee-card-image-wrap relative">
                            <img
                                src={getImageUrl(drink.image)}
                                alt={drink.name}
                                className={drink.isSoldOut ? 'grayscale' : ''}
                            />
                            {drink.isSoldOut && (
                                <div className="absolute inset-0 bg-black/10 z-30 flex items-center justify-center rounded-none">
                                    <span className="bg-red-600/90 text-white shadow-xl font-black px-4 py-2 rounded-none text-sm uppercase tracking-widest border border-red-800 whitespace-nowrap">HẾT MÓN</span>
                                </div>
                            )}
                            <span className="category-badge">{drink.category}</span>
                            <div className="card-overlay" />
                        </div>
                        <div className="card-info">
                            <h3 className="line-clamp-2">{drink.name}</h3>
                            <p className="text-[10px] text-gray-400 font-bold line-clamp-1 h-4 mb-1">
                                {drink.description || "Hương vị đậm đà truyền thống"}
                            </p>
                            <div className="flex items-center justify-between mt-auto pt-1">
                                <div className="flex flex-col items-start gap-1">
                                    <span className="card-price leading-none">{formatVND(drink.price)}</span>
                                    {!drink.isSoldOut && drink.availablePortions !== null && drink.availablePortions !== undefined && drink.availablePortions <= (settings?.warningThreshold !== undefined ? settings.warningThreshold : 2) && drink.availablePortions > 0 && (
                                        <span className="text-[10px] font-black text-red-500 bg-red-50 px-1.5 py-0.5 rounded-none leading-none w-max">
                                            SL:{drink.availablePortions}
                                        </span>
                                    )}
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (drink.isSoldOut) {
                                            alert('Món này tạm thời hết hàng. Mong quý khách thông cảm chọn món khác ạ!');
                                            return;
                                        }
                                        if (isTokenValid) {
                                            handlePlusClick(drink);
                                        }
                                    }}
                                    className={`add-btn shrink-0 ${isTokenValid && !drink.isSoldOut ? 'active:scale-90 hover:scale-105' : 'opacity-40 grayscale cursor-not-allowed'}`}
                                >
                                    <Plus size={20} />
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Bottom Nav */}
            <div className="bottom-nav">
                <Home size={24} className="text-accent" />
                <Heart size={24} className="text-gray-300" />
                <div className="relative" onClick={() => cart.length > 0 && navigate('/bill', { state: { cart, totalPrice: cart.reduce((s, c) => s + c.totalPrice, 0) } })}>
                    <ShoppingBag size={24} className={cart.length > 0 ? "text-accent" : "text-gray-300"} />
                    {cart.length > 0 && <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-none" />}
                </div>
                <Bell size={24} className="text-gray-300" />
            </div>

            <SharedCustomizationModal
                isOpen={!!selectedItem}
                item={selectedItem}
                onClose={() => setSelectedItem(null)}
                onAddToCart={handleAddToCartFromModal}
                formatVND={formatVND}
            />

            {/* Floating Bottom Cart Button */}
            <AnimatePresence>
                {cart.length > 0 && (
                    <motion.div
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 100, opacity: 0 }}
                        className="fixed bottom-6 left-0 right-0 z-40 flex justify-center px-4 pointer-events-none"
                    >
                        {(() => {
                            const { totalOrderPrice, discount, suggestedGifts } = calculateCartWithPromotions(cart, promotions, '', menuData, null, settings.enablePromotions);
                            return (
                                <button
                                    onClick={() => navigate('/bill', { state: { cart, totalPrice: totalOrderPrice } })}
                                    className="bg-gray-900 text-white rounded-none pl-2 pr-6 py-2 flex items-center gap-4 w-full max-w-[320px] shadow-[0_10px_40px_rgba(0,0,0,0.3)] pointer-events-auto active:scale-95 transition-transform border border-gray-800"
                                >
                                    <div className="w-12 h-12 bg-accent text-white rounded-none flex items-center justify-center shrink-0 shadow-inner relative" >
                                        <ShoppingBag size={20} />
                                        <div className="absolute -top-1 -right-1 bg-red-500 text-[10px] w-5 h-5 rounded-none flex items-center justify-center font-black border-2 border-gray-900">
                                            {cart.length}
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-start flex-1 min-w-0">
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                            Giỏ hàng của bạn
                                            {discount > 0 && <span className="bg-red-500 text-white px-1.5 py-0.5 rounded-none text-[8px] animate-pulse">-{formatVND(discount)}</span>}
                                        </span>
                                        <span className="font-black text-white text-lg truncate w-full text-left leading-none mt-0.5 flex flex-col">
                                            {formatVND(totalOrderPrice)}
                                            {suggestedGifts && suggestedGifts.length > 0 && (
                                                <span className="text-[9px] text-brand-500 normal-case mt-0.5 whitespace-normal leading-tight font-bold">
                                                    * Bạn có {suggestedGifts.length} phần quà tặng miễn phí chưa nhận!
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                    <div className="text-gray-400 flex items-center">
                                        <span className="text-xs font-bold mr-1 text-accent" >T.TOÁN</span>
                                    </div>
                                </button>
                            );
                        })()}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default MobileMenu;
