import React, { useState, useEffect } from 'react';
import { formatTime, formatDate, formatDateTime } from '../utils/timeUtils';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Play, Square, CheckCircle, Info, User, DollarSign, AlertCircle } from 'lucide-react';
import { SERVER_URL } from '../api';

const formatLocalTime = (dateStr) => {
    const date = dateStr ? new Date(dateStr) : new Date();
    return date.toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

const formatLocalDate = (dateStr) => {
    const date = dateStr ? new Date(dateStr) : new Date();
    return date.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
};

const AttendanceView = () => {
    const location = useLocation();

    // Robust extraction of query params (handles both standard and HashRouter cases)
    const getQueryParam = (key) => {
        const searchParams = new URLSearchParams(location.search);
        if (searchParams.has(key)) return searchParams.get(key);

        // Fallback for HashRouter: check the hash part for ?key=value
        const hash = window.location.hash;
        if (hash.includes('?')) {
            const hashParams = new URLSearchParams(hash.split('?')[1]);
            return hashParams.get(key);
        }
        return null;
    };

    const staffIdFromQuery = getQueryParam('staffId');
    const sessionToken = getQueryParam('token');

    const [member, setMember] = useState(null);
    const [shifts, setShifts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isTokenExpired, setIsTokenExpired] = useState(false);

    useEffect(() => {
        const init = async () => {
            if (!staffIdFromQuery || !sessionToken) {
                setError('Link không hợp lệ hoặc thiếu thông tin bảo mật.');
                setLoading(false);
                return;
            }
            await fetchMember();
            setLoading(false);
        };
        init();
    }, [staffIdFromQuery, sessionToken]);

    useEffect(() => {
        if (!member?.id) return;

        // Poll shifts every 5 seconds to sync with Admin/POS changes
        // Using member.id in dependencies ensures we poll for the right person
        const t = setInterval(fetchShifts, 5000);
        return () => clearInterval(t);
    }, [member?.id]);

    const fetchMember = async () => {
        try {
            const res = await fetch(`${SERVER_URL}/api/staff/check-token?staffId=${staffIdFromQuery}&token=${sessionToken}`);
            if (res.status === 403) {
                setIsTokenExpired(true);
                throw new Error('Mã QR đã hết hạn');
            }
            if (!res.ok) throw new Error('Yêu cầu không hợp lệ');

            const data = await res.json();
            setMember(data.member);
            await fetchShifts(data.member.id);
            setError(null);
        } catch (err) {
            setError(err.message);
        }
    };

    const fetchShifts = async (forcedId) => {
        const staffId = forcedId || member?.id;
        if (!staffId) return;

        try {
            const sRes = await fetch(`${SERVER_URL}/api/shifts`);
            const sData = await sRes.json();
            const memberShifts = sData
                .filter(s => s.staffId === staffId)
                .sort((a, b) => new Date(b.clockIn) - new Date(a.clockIn));
            setShifts(memberShifts);
        } catch (err) {
            console.error("Lỗi cập nhật ca làm:", err);
        }
    };

    const activeShift = shifts.find(s => !s.clockOut);

    const [showConfirm, setShowConfirm] = useState(false);

    const handleClock = async () => {
        if (!member) return;
        setLoading(true);
        try {
            const endpoint = activeShift ? `/api/attendance/clockout` : `/api/attendance/clockin`;
            const res = await fetch(`${SERVER_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    staffId: member.id,
                    token: sessionToken
                })
            });

            if (res.ok) {
                setShowConfirm(false);
                await fetchShifts();
            } else {
                const data = await res.json();
                alert(data.message || 'Lỗi xử lý!');
            }
        } catch (err) {
            alert('Lỗi kết nối server!');
        } finally {
            setLoading(false);
        }
    };

    if (loading && !member && !error && !isTokenExpired) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Đang tải thông tin...</p>
                </div>
            </div>
        );
    }

    if (error || isTokenExpired) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
                <div className="bg-white p-10 rounded-[32px] shadow-xl text-center space-y-4 max-w-sm border border-red-50">
                    <div className="bg-red-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
                        <AlertCircle className="text-red-500" size={32} />
                    </div>
                    <h2 className="text-xl font-black text-gray-900 uppercase">
                        {isTokenExpired ? 'Phiên hết hạn' : 'Lỗi truy cập'}
                    </h2>
                    <p className="text-gray-400 text-sm font-bold">
                        {isTokenExpired ? 'Mã QR chấm công đã hết hạn bảo mật. Vui lòng quét lại mã mới tại quầy POS.' : error}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans">
            <div className="max-w-md mx-auto space-y-6 lg:pb-12">
                {/* Header Profile */}
                <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="bg-white rounded-[32px] p-8 shadow-xl border border-gray-100 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-brand-600/5 rounded-bl-full -mr-8 -mt-8" />

                    <div className="flex flex-col items-center text-center space-y-4 relative z-10">
                        <div className="w-20 h-20 rounded-[24px] bg-gradient-to-br from-[#007AFF] to-[#0055FF] flex items-center justify-center text-white text-3xl font-black shadow-lg shadow-[#007AFF]/30">
                            {member?.name ? member.name.split(' ').map(n => n[0]).join('').substring(0, 2) : '??'}
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-brand-600 uppercase tracking-[3px] mb-1">{member.role}</p>
                            <h1 className="text-2xl font-black text-gray-900 leading-tight">{member.name}</h1>
                        </div>

                        <div className="flex gap-4 w-full pt-4">
                            <div className="flex-1 bg-gray-50 rounded-[20px] p-3 border border-gray-100">
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center justify-center gap-1">
                                    <Clock size={10} /> Tổng giờ làm
                                </p>
                                <p className="text-lg font-black text-gray-900">{shifts.reduce((acc, s) => acc + (s.actualHours || 0), 0).toFixed(1)}h</p>
                            </div>
                            <div className="flex-1 bg-gray-50 rounded-[20px] p-3 border border-gray-100">
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center justify-center gap-1">
                                    <DollarSign size={10} /> Lương hiện tại
                                </p>
                                <p className="text-lg font-black text-brand-500">{member.hourlyRate}k<span className="text-[10px] text-gray-400">/h</span></p>
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* Clocking Action */}
                <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.1 }}>
                    <button
                        onClick={() => setShowConfirm(true)}
                        disabled={loading}
                        className={`w-full p-10 rounded-[40px] shadow-2xl transition-all active:scale-95 flex flex-col items-center gap-4 border-8 ${activeShift
                            ? 'bg-amber-500 border-amber-100 text-white'
                            : 'bg-brand-500 border-green-100 text-white'
                            }`}
                    >
                        <div className="bg-white/20 p-6 rounded-full">
                            {activeShift ? <Square size={48} fill="currentColor" /> : <Play size={48} fill="currentColor" className="ml-2" />}
                        </div>
                        <div className="text-center">
                            <span className="text-2xl font-black uppercase tracking-[4px] block mb-1">
                                {activeShift ? 'KẾT THÚC CA' : 'VÀO CA LÀM'}
                            </span>
                            <span className="text-xs font-bold opacity-80 uppercase tracking-widest">
                                {formatLocalTime()}
                            </span>
                        </div>
                    </button>
                    {activeShift && (
                        <p className="mt-4 text-center text-xs font-black text-amber-600 uppercase tracking-widest animate-pulse">
                            Đang làm từ: {formatLocalTime(activeShift.clockIn)}
                        </p>
                    )}
                </motion.div>

                {/* Confirmation Overlay */}
                <AnimatePresence>
                    {showConfirm && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-gray-900/60 backdrop-blur-sm"
                        >
                            <motion.div
                                initial={{ scale: 0.9, y: 20 }}
                                animate={{ scale: 1, y: 0 }}
                                exit={{ scale: 0.9, y: 20 }}
                                className="bg-white rounded-[32px] p-8 shadow-2xl w-full max-w-sm text-center space-y-6"
                            >
                                <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto ${activeShift ? 'bg-amber-50 text-amber-500' : 'bg-green-50 text-green-500'}`}>
                                    {activeShift ? <Square size={40} fill="currentColor" /> : <Play size={40} fill="currentColor" className="ml-1" />}
                                </div>
                                <div className="space-y-2">
                                    <h2 className="text-2xl font-black text-gray-900">XÁC NHẬN</h2>
                                    <p className="text-gray-400 font-bold uppercase text-xs tracking-widest">
                                        Bạn muốn {activeShift ? 'Kết thúc ca làm' : 'Bắt đầu Ca Làm'}?
                                    </p>
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setShowConfirm(false)}
                                        className="flex-1 p-5 rounded-[24px] bg-gray-100 text-gray-400 font-black uppercase tracking-widest hover:bg-gray-200 transition-colors"
                                    >
                                        Hủy
                                    </button>
                                    <button
                                        onClick={handleClock}
                                        disabled={loading}
                                        className={`flex-1 p-5 rounded-[24px] text-white font-black uppercase tracking-widest shadow-lg transition-transform active:scale-95 ${activeShift ? 'bg-amber-500 shadow-amber-200' : 'bg-brand-500 shadow-green-200'}`}
                                    >
                                        Đồng ý
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Recent History */}
                <div className="space-y-4 pt-4">
                    <div className="flex items-center justify-between px-2">
                        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[4px]">Lịch sử gần đây</h3>
                        <div className="w-1.5 h-1.5 rounded-full bg-gray-200" />
                    </div>

                    <div className="space-y-3">
                        {shifts.slice(0, 5).map(s => (
                            <motion.div key={s.id} initial={{ x: -10, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="bg-white p-5 rounded-[24px] border border-gray-100 shadow-sm flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className={`p-3 rounded-2xl ${s.clockOut ? 'bg-gray-50 text-gray-400' : 'bg-green-50 text-green-500'}`}>
                                        {s.clockOut ? <CheckCircle size={18} /> : <Clock size={18} className="animate-spin-slow" />}
                                    </div>
                                    <div>
                                        <p className="text-sm font-black text-gray-900">{formatLocalDate(s.clockIn)}</p>
                                        <p className="text-[10px] text-gray-400 font-bold uppercase">
                                            {formatLocalTime(s.clockIn)}
                                            {s.clockOut && ` — ${formatLocalTime(s.clockOut)}`}
                                        </p>
                                    </div>
                                </div>
                                {s.clockOut && (
                                    <div className="text-right">
                                        <p className="text-sm font-black text-gray-900">{s.actualHours} giờ</p>
                                        <p className="text-[9px] text-brand-500 font-black">+{s.totalPay}k VND</p>
                                    </div>
                                )}
                            </motion.div>
                        ))}
                        {shifts.length === 0 && (
                            <div className="p-12 text-center grayscale opacity-20 flex flex-col items-center">
                                <Clock size={32} className="mb-2" />
                                <p className="font-black uppercase text-xs">Chưa có dữ liệu</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AttendanceView;
