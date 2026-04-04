import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, User, Phone, CheckCircle, ChevronRight, Award } from 'lucide-react';
import { SERVER_URL } from '../../../api';

const LoyaltyIdentifyModal = ({ isOpen, onClose, onIdentify }) => {
    const [phone, setPhone] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [successProfile, setSuccessProfile] = useState(null);
    const [isRegistering, setIsRegistering] = useState(false);
    const [registerName, setRegisterName] = useState('');

    const handleNumberClick = (num) => {
        if (phone.length < 11) {
            setPhone(prev => prev + num);
            setError('');
        }
    };

    useEffect(() => {
        if (!isOpen) {
            setPhone('');
            setError('');
            setSuccessProfile(null);
            setIsLoading(false);
            setIsRegistering(false);
            setRegisterName('');
        }
    }, [isOpen]);

    const handleDelete = () => {
        setPhone(prev => prev.slice(0, -1));
        setError('');
    };

    const handleSearch = async () => {
        if (!phone || phone.length < 9) {
            setError('Vui lòng nhập SDT hợp lệ.');
            return;
        }
        setIsLoading(true);
        setError('');
        try {
            const res = await fetch(`${SERVER_URL}/api/loyalty/customer/${phone}`);
            const data = await res.json();
            if (data.success && data.customer) {
                setSuccessProfile(data.customer);
                setTimeout(() => {
                    onIdentify(data.customer);
                    onClose();
                }, 2000);
            } else {
                // Not found -> move to register step
                setIsRegistering(true);
            }
        } catch (e) {
            setError('Lỗi kết nối đến máy chủ.');
        } finally {
            setIsLoading(false);
        }
    };

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

                    {successProfile ? (
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

                            {isRegistering ? (
                                <div className="mb-6 animate-fade-in">
                                    <p className="text-sm font-bold text-gray-700 mb-2">Tên gọi của bạn:</p>
                                    <input
                                        type="text"
                                        autoFocus
                                        value={registerName}
                                        onChange={e => setRegisterName(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleRegister()}
                                        placeholder="Nhập tên..."
                                        className="w-full px-4 py-4 bg-gray-50 border-2 border-gray-100 focus:border-brand-500 focus:bg-white rounded-2xl text-xl font-black text-gray-900 outline-none transition-all"
                                    />
                                    {error && <p className="text-red-500 text-sm font-bold mt-2 text-center">{error}</p>}
                                    
                                    <div className="flex gap-3 mt-6">
                                        <button
                                            onClick={() => { setIsRegistering(false); setError(''); }}
                                            className="px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors"
                                        >
                                            Quay lại
                                        </button>
                                        <button
                                            onClick={handleRegister}
                                            disabled={isLoading}
                                            className="flex-1 bg-brand-600 text-white rounded-2xl py-4 font-black uppercase tracking-widest hover:bg-brand-700 disabled:opacity-50 transition-colors shadow-lg shadow-brand-500/30 flex items-center justify-center gap-2"
                                        >
                                            {isLoading ? 'ĐANG ĐĂNG KÝ...' : 'TẠO THẺ NGAY'}
                                            {!isLoading && <ChevronRight size={20} />}
                                        </button>
                                    </div>
                                    <p className="text-center text-gray-400 text-xs font-bold mt-4">Tên sẽ được in lên ly/bill để gọi đồ</p>
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
                                            onClick={handleSearch}
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
