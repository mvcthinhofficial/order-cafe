import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle } from 'lucide-react';

const CancelOrderModal = ({ cancelOrderId, cancelOrder, setCancelOrderId }) => {
    const [cancelReason, setCancelReason] = useState('');
    return (
        <AnimatePresence>
                    {cancelOrderId && (
                        <div className="fixed inset-0 z-[1200] flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                                className="bg-white w-full max-w-sm rounded-none overflow-hidden shadow-2xl"
                            >
                                <div className="p-8">
                                    <div className="w-14 h-14 bg-red-50  flex items-center justify-center mx-auto mb-5">
                                        <XCircle size={28} className="text-red-500" />
                                    </div>
                                    <h3 className="text-lg font-black text-gray-900 text-center mb-1">HỦY ĐƠN HÀNG</h3>
                                    <p className="text-xs text-gray-400 font-bold text-center uppercase tracking-widest mb-6">Đơn sẽ được lưu vào báo cáo</p>
                                    <div className="space-y-3">
                                        <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Lý do hủy (không bắt buộc)</p>
                                        <div className="flex gap-2 flex-wrap">
                                            {['Khách đổi ý', 'Hết nguyên liệu', 'Khách không đến', 'Lỗi order'].map(r => (
                                                <button key={r} onClick={() => setCancelReason(r)}
                                                    className={`px-3 py-1.5  text-xs font-black transition-all border ${cancelReason === r ? 'bg-gray-900 text-white border-gray-900' : 'bg-gray-50 text-gray-500 border-gray-100 hover:border-gray-300'}`}>
                                                    {r}
                                                </button>
                                            ))}
                                        </div>
                                        <input
                                            type="text"
                                            value={cancelReason}
                                            onChange={e => setCancelReason(e.target.value)}
                                            placeholder="Hoặc nhập lý do..."
                                            className="w-full bg-gray-50 border border-gray-100  px-5 py-4 text-sm font-bold text-gray-800 outline-none focus:ring-2 focus:ring-red-200 focus:border-red-200 transition-all"
                                        />
                                    </div>
                                </div>
                                <div className="p-6 pt-0 flex gap-3">
                                    <button onClick={() => { setCancelOrderId(null); setCancelReason(''); }}
                                        className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-none font-bold text-sm uppercase tracking-wider hover:bg-slate-200 active:scale-95 transition-all">
                                        QUAY LẠI
                                    </button>
                                    <button onClick={() => cancelOrder(cancelOrderId, cancelReason || 'Khách đổi ý')}
                                        className="flex-1 py-4 bg-red-500 text-white rounded-none font-bold text-sm uppercase tracking-wider hover:bg-red-600 active:scale-95 transition-all shadow-lg shadow-red-500/20">
                                        XÁC NHẬN HỦY
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
        </AnimatePresence>
    );
};

export default CancelOrderModal;
