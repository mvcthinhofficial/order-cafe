import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { isInputFocused } from '../../../utils/ShortcutUtils.js';
import { formatVND } from '../../../utils/dashboardUtils';
import { X, ShoppingCart, CheckCircle, XCircle, ArrowRightLeft, Play, Square } from 'lucide-react';

const TableActionModal = ({ table, onClose, onOrder, onUpdateStatus, onChangeTable }) => {
    useEffect(() => {
        const handleEsc = (e) => {
            if ((e.key === 'Escape' || (e.key === 'Backspace' && !isInputFocused()))) onClose();
        };
        window.addEventListener('keydown', handleEsc, { capture: true });
        return () => window.removeEventListener('keydown', handleEsc, { capture: true });
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} className="bg-white rounded-none w-full max-w-sm overflow-hidden shadow-2xl relative z-10 p-2">
                <div className="p-8 text-center border-b border-gray-50 bg-gray-50/50 rounded-none">
                    <div className={`w-20 h-20 flex items-center justify-center font-black text-2xl mx-auto mb-4 shadow-xl ${(table.computedStatus || table.status) === 'Occupied' ? 'bg-orange-100 text-orange-600' : (table.computedStatus || table.status) === 'Reserved' ? 'bg-brand-100 text-brand-600' : 'bg-gray-100 text-gray-400'}`}>
                        {table.name}
                    </div>
                    <h3 className="font-black text-gray-900 uppercase tracking-[4px] text-xs mb-1">{table.area}</h3>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{(table.computedStatus || table.status) === 'Occupied' ? 'ĐANG PHỤC VỤ' : (table.computedStatus || table.status) === 'Reserved' ? 'ĐÃ ĐẶT TRƯỚC' : 'BÀN TRỐNG'}</p>
                </div>
                <div className="p-6 space-y-3">
                    {table.activeOrder ? (
                        <div className="text-left border border-orange-200 rounded-none overflow-hidden shadow-sm bg-white">
                            <div className="bg-orange-50 px-4 py-2 border-b border-orange-200 flex justify-between items-center">
                                <span className="font-black text-orange-800 text-[10px] uppercase tracking-widest">CHI TIẾT ORDER</span>
                                <span className="font-bold text-orange-600 text-[10px]">{new Date(table.activeOrder.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <div className="p-4 space-y-3 max-h-[40vh] overflow-y-auto custom-scrollbar">
                                {(table.activeOrder.cartItems || []).map((c, idx) => (
                                    <div key={idx} className="flex flex-col text-sm border-b border-dashed border-gray-100 pb-3 last:border-0 last:pb-0">
                                        <div className="flex justify-between items-start">
                                            <div className="font-bold text-gray-800 pr-2 leading-tight">
                                                <span className="text-orange-600 mr-1.5 text-base">{c.count}x</span>{c.item?.name || c.name || 'Món'}
                                            </div>
                                            <div className="font-black text-gray-900 shrink-0">
                                                {formatVND(c.totalPrice * c.count)}
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-1 mt-1 pl-6">
                                            <span className="text-[10px] bg-gray-100 px-1.5 py-0.5 font-bold text-gray-600 rounded-none">S: {c.size?.label || 'S'}</span>
                                            {c.sugar && <span className="text-[10px] bg-amber-50 px-1.5 py-0.5 font-bold text-amber-700 rounded-none">Đường: {c.sugar}</span>}
                                            {c.ice && <span className="text-[10px] bg-brand-50 px-1.5 py-0.5 font-bold text-brand-700 rounded-none">Đá: {c.ice}</span>}
                                        </div>
                                        {c.note && <div className="text-xs font-medium italic text-gray-500 pl-6 mt-1 flex items-start gap-1"><span className="text-gray-400">Ghi chú:</span> <span className="text-red-500 break-words flex-1">"{c.note}"</span></div>}
                                    </div>
                                ))}
                            </div>
                            <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
                                <span className="text-[10px] text-gray-500 font-bold uppercase">Tổng cộng</span>
                                <span className="font-black text-base text-[#C68E5E]">{formatVND(table.activeOrder.price)}</span>
                            </div>
                            <button onClick={() => onOrder(table.activeOrder)} className="w-full py-4 bg-orange-500 text-white font-black text-sm uppercase tracking-widest hover:bg-orange-600 flex items-center justify-center gap-2 transition-all">
                                SỬA ĐƠN / THÊM MÓN <Edit2 size={18} />
                            </button>
                        </div>
                    ) : (
                        <button onClick={() => onOrder()} className="w-full flex items-center justify-between p-6 bg-brand-600 text-white rounded-none font-black text-base shadow-xl shadow-[#007AFF]/20 active:scale-95 transition-all uppercase tracking-widest">
                            TẠO ĐƠN MỚI <Plus size={24} />
                        </button>
                    )}
                    <div className="grid grid-cols-2 gap-5">
                        {table.activeOrder ? (
                            <>
                                <button onClick={() => onChangeTable(table.activeOrder)} className="p-5 bg-brand-50 text-brand-600 rounded-none font-black text-sm uppercase tracking-widest hover:bg-brand-100 active:scale-95 transition-all flex flex-col items-center justify-center gap-2">
                                    <ArrowRightLeft size={24} /> ĐỔI BÀN
                                </button>
                                <button onClick={() => onUpdateStatus('Available')} className="p-5 bg-gray-50 text-gray-400 rounded-none font-black text-sm uppercase tracking-widest hover:bg-gray-100 hover:text-gray-500 active:scale-95 transition-all flex flex-col items-center justify-center gap-2">
                                    <CheckCircle size={24} /> TRỐNG
                                </button>
                            </>
                        ) : (
                            <>
                                <button onClick={() => onUpdateStatus('Available')} className="p-5 bg-gray-50 text-gray-500 rounded-none font-black text-sm uppercase tracking-widest hover:bg-gray-100 active:scale-95 transition-all flex flex-col items-center justify-center gap-2">
                                    <CheckCircle size={24} /> TRỐNG
                                </button>
                                <button onClick={() => onUpdateStatus('Reserved')} className="p-5 bg-brand-50 text-brand-600 rounded-none font-black text-sm uppercase tracking-widest hover:bg-brand-100 active:scale-95 transition-all flex flex-col items-center justify-center gap-2">
                                    <Calendar size={24} /> ĐẶT TRƯỚC
                                </button>
                            </>
                        )}
                    </div>
                    <button onClick={onClose} className="w-full p-4 text-gray-300 font-black text-[10px] uppercase tracking-[5px] hover:text-gray-500 transition-all mt-2">ĐÓNG</button>
                </div>
            </motion.div>
        </div>
    );
};


export default TableActionModal;
