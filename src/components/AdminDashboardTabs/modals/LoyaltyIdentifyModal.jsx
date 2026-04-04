import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, User, Phone, CheckCircle, ChevronRight, Award } from 'lucide-react';
import { SERVER_URL } from '../../../api';

const LS_KEY = 'loyalty_remembered_customer'; // Shared localStorage key

const LoyaltyIdentifyModal = ({ isOpen, onClose, onIdentify }) => {
    const [phone, setPhone] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [successProfile, setSuccessProfile] = useState(null);
    const [isRegistering, setIsRegistering] = useState(false);
    const [registerName, setRegisterName] = useState('');
    const [rememberedCustomer, setRememberedCustomer] = useState(null); // chỉ dùng khi auto-verify lỗi mạng
    const [autoVerifying, setAutoVerifying] = useState(false); // đang tự động đối chiếu

    const handleNumberClick = (num) => {
        if (phone.length < 11) {
            setPhone(prev => prev + num);
            setError('');
        }
    };

    useEffect(() => {
        if (!isOpen) {
            // Reset khi đóng
            setPhone('');
            setError('');
            setSuccessProfile(null);
            setIsLoading(false);
            setIsRegistering(false);
            setRegisterName('');
            setAutoVerifying(false);
            setRememberedCustomer(null);
        } else {
            // Mở modal → kiểm tra localStorage → tự động đối chiếu ngay
            (async () => {
                try {
                    const saved = localStorage.getItem(LS_KEY);
                    if (!saved) return;
                    const parsed = JSON.parse(saved);
                    if (!parsed?.phone || !parsed?.name) return;

                    setAutoVerifying(true);
                    setPhone(parsed.phone);
                    const res = await fetch(`${SERVER_URL}/api/loyalty/customer/${parsed.phone}`);
                    const data = await res.json();
                    if (data.success && data.customer) {
                        // Tìm thấy → cập nhật cache và xác nhận luôn
                        try {
                            localStorage.setItem(LS_KEY, JSON.stringify({
                                phone: data.customer.phone,
                                name: data.customer.name,
                                tier: data.customer.tier,
                            }));
                        } catch {}
                        setSuccessProfile(data.customer);
                        setTimeout(() => {
                            onIdentify(data.customer);
                            onClose();
                        }, 1500); // ngắn hơn (1.5s) vì khách quen, không cần đọc lâu
                    } else {
                        // Không tìm thấy → xóa cache, hiện form
                        try { localStorage.removeItem(LS_KEY); } catch {}
                        setRememberedCustomer(parsed); // giữ để gợi ý
                    }
                } catch {
                    // Mạng lỗi → show form, giữ SĐT đã nhớ
                    try {
                        const fallback = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
                        if (fallback?.phone) {
                            setPhone(fallback.phone);
                            setRememberedCustomer(fallback);
                        }
                    } catch {}
                } finally {
                    setAutoVerifying(false);
                }
            })();
        }
    }, [isOpen]);

    const handleDelete = () => {
        setPhone(prev => prev.slice(0, -1));
        setError('');
    };

    const handleSearch = async (phoneStr) => {
        const searchPhone = phoneStr || phone;
        if (!searchPhone || searchPhone.length < 9) {
            setError('Vui lòng nhập SDT hợp lệ.');
            return;
        }
        setIsLoading(true);
        setError('');
        try {
            const res = await fetch(`${SERVER_URL}/api/loyalty/customer/${searchPhone}`);
            const data = await res.json();
            if (data.success && data.customer) {
                // ✅ Tìm thấy trong loyalty → lưu localStorage + xác nhận
                try {
                    localStorage.setItem(LS_KEY, JSON.stringify({
                        phone: data.customer.phone,
                        name: data.customer.name,
                        tier: data.customer.tier,
                    }));
                } catch {}
                setSuccessProfile(data.customer);
                setTimeout(() => {
                    onIdentify(data.customer);
                    onClose();
                }, 2000);
            } else {
                // Không có trong loyalty → tra tên từ lịch sử đơn hàng
                try {
                    const lookupRes = await fetch(`${SERVER_URL}/api/loyalty/lookup-by-phone/${searchPhone}`);
                    const lookupData = await lookupRes.json();
                    if (lookupData.success && lookupData.name) {
                        // Tìm được tên từ lịch sử → xác nhận luôn không cần hỏi gì
                        const guestProfile = { phone: searchPhone, name: lookupData.name, points: 0, tier: 'Khách', isGuest: true };
                        // Lưu vào localStorage để lần sau nhận ra
                        try { localStorage.setItem(LS_KEY, JSON.stringify(guestProfile)); } catch {}
                        setSuccessProfile(guestProfile);
                        setTimeout(() => {
                            onIdentify(guestProfile);
                            onClose();
                        }, 1500);
                    } else {
                        // Không có lịch sử → cho nhập tên (optional) hoặc bỏ qua
                        setIsRegistering(true);
                        setRememberedCustomer(null);
                    }
                } catch {
                    // Lỗi lookup → vẫn cho đăng ký
                    setIsRegistering(true);
                    setRememberedCustomer(null);
                }
            }
        } catch (e) {
            setError('Lỗi kết nối đến máy chủ.');
        } finally {
            setIsLoading(false);
        }
    };

    // ✅ Tự động tìm kiếm sau 800ms ngừng gõ (debounce) — không fix cứng độ dài
    const searchTimerRef = useRef(null);
    useEffect(() => {
        if (isLoading || autoVerifying || successProfile || isRegistering) return;
        if (phone.length < 9) return; // chưa đủ độ dài
        clearTimeout(searchTimerRef.current);
        searchTimerRef.current = setTimeout(() => {
            handleSearch(phone);
        }, 800);
        return () => clearTimeout(searchTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phone]);

    const handleRegister = async () => {
        if (!registerName.trim()) {
            setError('Vui lòng nhập tên của bạn.');
            return;
        }
        setIsLoading(true);
        setError('');
        try {
            const regRes = await fetch(`${SERVER_URL}/api/loyalty/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, name: registerName })
            });
            const regData = await regRes.json();
            if (regData.success) {
                // ✅ Lưu vào localStorage sau khi đăng ký
                try {
                    localStorage.setItem(LS_KEY, JSON.stringify({
                        phone: regData.customer.phone,
                        name: regData.customer.name,
                        tier: regData.customer.tier,
                    }));
                } catch {}
                setIsRegistering(false);
                setSuccessProfile(regData.customer);
                setTimeout(() => {
                    onIdentify(regData.customer);
                    onClose();
                }, 2000);
            } else {
                setError('Thay đổi bị từ chối. SĐT có thể đã được đăng ký.');
            }
        } catch (e) {
            setError('Lỗi máy chủ khi đăng ký.');
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    const overlayVariants = {
        hidden: { opacity: 0 },
        visible: { opacity: 1 }
    };
    
    const contentVariants = {
        hidden: { scale: 0.95, opacity: 0, y: 20 },
        visible: { scale: 1, opacity: 1, y: 0 }
    };

    return (
        <AnimatePresence>
            <motion.div
                initial="hidden" animate="visible" exit="hidden" variants={overlayVariants}
                className="fixed inset-0 z-[4000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            >
                <motion.div
                    variants={contentVariants}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    className="bg-white max-w-[450px] w-full shadow-2xl relative flex flex-col"
                    style={{ borderRadius: 'var(--radius-modal)', overflow: 'hidden' }}
                >
                    <button
                        onClick={onClose}
                        className="absolute right-4 top-4 w-9 h-9 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-full flex items-center justify-center transition-colors z-10"
                    >
                        <X size={20} />
                    </button>

                    {/* Case 1: Đang tự động nhận diện */}
                    {autoVerifying ? (
                        <div className="p-8 flex flex-col items-center text-center gap-4">
                            <motion.div
                                animate={{ scale: [1, 1.08, 1] }}
                                transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
                                className="w-20 h-20 rounded-full flex items-center justify-center"
                                style={{ background: 'linear-gradient(135deg, #6366F1, #818CF8)', boxShadow: '0 8px 24px rgba(99,102,241,0.35)' }}
                            >
                                <User size={34} color="#fff" />
                            </motion.div>
                            <div>
                                <h2 className="text-xl font-black text-gray-900 mb-1">Đang nhận diện...</h2>
                                <p className="text-sm font-semibold text-gray-500">Hệ thống đang xác minh thẻ thành viên</p>
                            </div>
                            <div className="flex gap-2">
                                {[0, 1, 2].map(i => (
                                    <motion.div key={i}
                                        animate={{ y: [0, -8, 0], opacity: [0.4, 1, 0.4] }}
                                        transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.2, ease: 'easeInOut' }}
                                        className="w-2 h-2 rounded-full bg-indigo-500"
                                    />
                                ))}
                            </div>
                        </div>
                    ) : successProfile ? (
                        /* Case 2: Tìm thấy → Welcome screen */
                        <div className="p-8 flex flex-col items-center text-center">
                            <motion.div
                                initial={{ scale: 0 }} animate={{ scale: 1 }}
                                transition={{ type: "spring", bounce: 0.5 }}
                                className="w-20 h-20 bg-green-100 text-green-500 flex items-center justify-center rounded-full mb-6"
                            >
                                <CheckCircle size={40} />
                            </motion.div>
                            <h2 className="text-2xl font-black text-gray-900 mb-2 uppercase tracking-tight">Xin chào, {successProfile.name}!</h2>
                            <div className="bg-brand-50 text-brand-700 px-4 py-2 rounded-lg font-bold flex items-center gap-2 mb-2">
                                <Award size={18} />
                                Thành viên Hạng {successProfile.tier}
                            </div>
                            <p className="text-gray-500 font-medium">Bạn có {successProfile.points} điểm tích luỹ.</p>
                        </div>
                    ) : (
                        /* Case 3: Form nhập SĐT (luôn show nếu không có localStorage) */
                        <div className="p-6 md:p-8 flex flex-col">
                            <div className="mb-6 flex items-center gap-3">
                                <div className="w-12 h-12 bg-brand-50 text-brand-600 rounded-full flex items-center justify-center">
                                    <User size={24} />
                                </div>
                                <div className="flex-1">
                                    <h2 className="text-[20px] font-black text-gray-900 leading-none mb-1">Khách Hàng Quen</h2>
                                    <p className="text-sm font-semibold text-gray-500">
                                        {isRegistering ? 'Đăng ký nhanh để bắt đầu tích điểm' : 'Nhập SDT để tích điểm & nhận ưu đãi'}
                                    </p>
                                </div>
                            </div>

                            {/* Banner cảnh báo khi mạng lỗi (auto-verify thất bại) */}
                            <AnimatePresence>
                                {rememberedCustomer && !isRegistering && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -8 }}
                                        className="mb-4 rounded-2xl overflow-hidden border border-orange-100 bg-orange-50"
                                    >
                                        <div className="px-4 py-3">
                                            <p className="text-xs font-black text-orange-500 uppercase tracking-wider mb-2">⚠️ Không kết nối được server</p>
                                            <p className="text-sm text-orange-800 font-semibold mb-3">
                                                SĐT đã lưu: <strong>{rememberedCustomer.phone}</strong> ({rememberedCustomer.name})
                                            </p>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => handleSearch(rememberedCustomer.phone)}
                                                    disabled={isLoading}
                                                    className="flex-1 py-2 rounded-xl font-black text-sm text-white flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 transition-colors"
                                                >
                                                    <Search size={14} /> Thử lại
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        try { localStorage.removeItem(LS_KEY); } catch {}
                                                        setRememberedCustomer(null);
                                                        setPhone('');
                                                    }}
                                                    className="px-4 py-2 rounded-xl font-black text-sm text-orange-600 bg-orange-100 hover:bg-orange-200 transition-colors"
                                                >
                                                    Bỏ qua
                                                </button>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {isRegistering ? (
                                <div className="mb-6 animate-fade-in">
                                    <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-xl">
                                        <p className="text-xs font-bold text-blue-600 mb-1">📱 SĐT: <span className="font-black text-blue-800">{phone}</span></p>
                                        <p className="text-xs text-blue-500 font-semibold">SĐT này chưa có thẻ thành viên. Nhập tên để tạo thẻ tích điểm, hoặc bỏ qua để tiếp tục order.</p>
                                    </div>
                                    <p className="text-sm font-bold text-gray-700 mb-2">Tên gọi <span className="text-gray-400 font-semibold">(không bắt buộc)</span>:</p>
                                    <input
                                        type="text"
                                        autoFocus
                                        value={registerName}
                                        onChange={e => setRegisterName(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleRegister()}
                                        placeholder="Nhập tên để tạo thẻ thành viên..."
                                        className="w-full px-4 py-4 bg-gray-50 border-2 border-gray-100 focus:border-brand-500 focus:bg-white rounded-2xl text-xl font-black text-gray-900 outline-none transition-all"
                                    />
                                    {error && <p className="text-red-500 text-sm font-bold mt-2 text-center">{error}</p>}
                                    
                                    <div className="flex gap-3 mt-4">
                                        <button
                                            onClick={() => { setIsRegistering(false); setError(''); }}
                                            className="px-4 py-3 rounded-2xl font-black text-sm text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors"
                                        >
                                            ← Quay lại
                                        </button>
                                        <button
                                            onClick={() => {
                                                // Tiếp tục order chỉ với SĐT — không tạo thẻ
                                                const guestProfile = { phone, name: phone, points: 0, tier: 'Khách', isGuest: true };
                                                onIdentify(guestProfile);
                                                onClose();
                                            }}
                                            className="px-4 py-3 rounded-2xl font-black text-sm text-brand-600 bg-brand-50 hover:bg-brand-100 transition-colors border border-brand-200 whitespace-nowrap"
                                        >
                                            Bỏ qua →
                                        </button>
                                        <button
                                            onClick={handleRegister}
                                            disabled={isLoading || !registerName.trim()}
                                            className="flex-1 bg-brand-600 text-white rounded-2xl py-3 font-black text-sm uppercase tracking-wide hover:bg-brand-700 disabled:opacity-40 transition-colors shadow-md shadow-brand-500/20 flex items-center justify-center gap-2"
                                        >
                                            {isLoading ? 'ĐANG TẠO...' : 'TẠO THẺ'}
                                            {!isLoading && <ChevronRight size={16} />}
                                        </button>
                                    </div>
                                    <p className="text-center text-gray-400 text-xs font-bold mt-3">Tên sẽ được in lên ly/bill để gọi đồ</p>
                                </div>
                            ) : (
                                <>
                                    <div className="mb-6">
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                                <Phone size={20} className="text-gray-400" />
                                            </div>
                                            <input
                                                type="text"
                                                value={phone}
                                                readOnly
                                                placeholder="Nhập số điện thoại..."
                                                className="w-full pl-11 pr-4 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl text-xl font-black text-gray-900 tracking-wide outline-none text-center"
                                            />
                                        </div>
                                        {error && <p className="text-red-500 text-sm font-bold mt-2 text-center">{error}</p>}
                                    </div>

                                    {/* Numpad */}
                                    <div className="grid grid-cols-3 gap-3 mb-6">
                                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                                            <button
                                                key={num}
                                                onClick={() => handleNumberClick(num.toString())}
                                                className="aspect-[3/2] bg-gray-50 hover:bg-gray-100 rounded-xl text-2xl font-black text-gray-800 flex items-center justify-center transition-colors active:scale-95"
                                            >
                                                {num}
                                            </button>
                                        ))}
                                        <button
                                            onClick={handleDelete}
                                            className="aspect-[3/2] bg-gray-50 hover:bg-red-50 text-red-500 hover:text-red-600 rounded-xl flex items-center justify-center transition-colors active:scale-95"
                                        >
                                            <X size={24} strokeWidth={3} />
                                        </button>
                                        <button
                                            onClick={() => handleNumberClick('0')}
                                            className="aspect-[3/2] bg-gray-50 hover:bg-gray-100 rounded-xl text-2xl font-black text-gray-800 flex items-center justify-center transition-colors active:scale-95"
                                        >
                                            0
                                        </button>
                                        <button
                                            onClick={() => handleSearch()}
                                            disabled={isLoading || !phone}
                                            className="aspect-[3/2] bg-brand-500 hover:bg-brand-600 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl flex items-center justify-center transition-colors active:scale-95"
                                        >
                                            {isLoading ? <span className="animate-spin relative"><Search size={24}/></span> : <ChevronRight size={32} strokeWidth={3} />}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export default LoyaltyIdentifyModal;
