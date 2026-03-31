import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, Printer, XCircle } from 'lucide-react';
import { formatVND, getLogOrderId } from '../../../utils/dashboardUtils';
import { getSavedTaxData } from '../../../utils/taxUtils';
import { generateReceiptHTML } from '../../../utils/printHelpers';

const OrderDetailModal = ({ selectedLog, setSelectedLog, settings, showToast }) => {
    return (
        <AnimatePresence>
                    {selectedLog && (() => {
                        const modalOrderData = selectedLog.orderData || {};
                        const mCreateTime = modalOrderData.timestamp ? new Date(modalOrderData.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '--:--';
                        const mCompleteTime = (selectedLog.type === 'COMPLETED' && selectedLog.timestamp) ? new Date(selectedLog.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '--:--';

                        // Stay Time Math
                        const durationMs = (selectedLog.timestamp && modalOrderData.timestamp) ? (new Date(selectedLog.timestamp).getTime() - new Date(modalOrderData.timestamp).getTime()) : 0;
                        const mMins = Math.max(0, Math.floor(durationMs / 60000));
                        const mHours = Math.floor(mMins / 60);
                        const mRemMins = mMins % 60;
                        const mStayTimeStr = mHours > 0 ? `${mHours}h${mRemMins > 0 ? ` ${mRemMins}p` : ''}` : `${mMins}p`;
                        const mShowStay = (!settings?.requirePrepayment && selectedLog.type === 'COMPLETED' && (modalOrderData.orderSource || 'INSTORE') === 'INSTORE');

                        return (
                            <div className="fixed inset-0 z-[1100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                                    className="bg-white w-full max-w-lg rounded-none overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
                                >
                                    <div className="p-8 border-b border-gray-100 flex justify-between items-start bg-gray-50/50">
                                        <div>
                                            <h3 className="text-xl font-bold text-gray-900 leading-tight mb-1">CHI TIẾT ĐƠN HÀNG</h3>
                                            <div className="text-[11px] text-gray-500 font-medium uppercase tracking-widest flex items-center gap-2 mb-1.5">
                                                <span>Mã: {getLogOrderId(selectedLog)}</span>
                                                <span className="text-gray-300">•</span>
                                                <span>{new Date(selectedLog.timestamp).toLocaleDateString('vi-VN')}</span>
                                            </div>
                                            <div className="text-[11px] font-medium text-gray-600 flex items-center gap-2">
                                                <span className="text-gray-400 uppercase tracking-widest">In:</span> <span className="text-gray-900 text-sm">{mCreateTime}</span>
                                                <span className="text-gray-400 uppercase tracking-widest ml-1">Out:</span> <span className="text-brand-600 text-sm">{mCompleteTime}</span>
                                                {mShowStay && (
                                                    <>
                                                        <span className="text-gray-300 mx-1">-</span>
                                                        <span className="text-brand-600 text-sm">{mStayTimeStr}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        <button onClick={() => setSelectedLog(null)} className="p-3 bg-white rounded-none transition-all shadow-sm border border-gray-100 hover:bg-gray-50 active:scale-95">
                                            <X size={24} className="text-gray-500" />
                                        </button>
                                    </div>

                                    <div className="flex-1 overflow-y-auto p-8 space-y-6">
                                        {/* Status Badge */}
                                        <div className="flex justify-center">
                                            {(() => {
                                                const isCanceledLog = selectedLog.type === 'CANCELLED';
                                                const isCurrentlyDebt = modalOrderData.isDebt;
                                                const isActuallyPaid = modalOrderData.isPaid && !modalOrderData.isDebt;

                                                if (isCanceledLog) {
                                                    return <span className="px-6 py-2 bg-red-100 text-red-700 font-bold text-xs uppercase tracking-[0.1em]">Đã hủy</span>;
                                                }
                                                if (isCurrentlyDebt) {
                                                    return <span className="px-6 py-2 bg-purple-100 text-purple-700 font-bold text-xs uppercase tracking-[0.1em]">Đang Nợ</span>;
                                                }
                                                if (isActuallyPaid || selectedLog.type === 'COMPLETED' || selectedLog.type === 'DEBT_PAID') {
                                                    return <span className="px-6 py-2 bg-green-100 text-green-700 font-bold text-xs uppercase tracking-[0.1em]">Đã hoàn tất</span>;
                                                }
                                                return <span className="px-6 py-2 bg-gray-100 text-gray-700 font-bold text-xs uppercase tracking-[0.1em]">{selectedLog.type}</span>;
                                            })()}
                                        </div>

                                        {/* Items */}
                                        <div className="space-y-4">
                                            <p className="text-[10px] font-bold uppercase text-gray-400 tracking-widest px-1">Danh sách món</p>
                                            <div className="bg-slate-50 p-6 space-y-4 rounded-none border border-slate-100">
                                                {selectedLog.orderData?.cartItems ? (
                                                    selectedLog.orderData.cartItems.map((c, i) => {
                                                        const details = [];
                                                        if (c.size || c.item?.sizes?.length > 0) details.push(`Size ${c.size?.label || 'S'}`);
                                                        if (c.sugar) details.push(`Đường ${c.sugar}`);
                                                        if (c.ice) details.push(`Đá ${c.ice === 'Bình thường' ? 'Bth' : c.ice}`);
                                                        if (c.addons && c.addons.length > 0) {
                                                            c.addons.forEach(a => details.push(`+ ${a.label}`));
                                                        }
                                                        const detailsStr = details.join(', ');

                                                        return (
                                                            <div key={i} className="flex flex-col border-b border-gray-200/50 pb-3 mb-3 last:border-0 last:pb-0 last:mb-0">
                                                                <div className="flex justify-between items-start">
                                                                    <p className="font-medium text-gray-900 text-base">
                                                                        {i + 1} - {c.item?.name} <span className="text-gray-500 text-sm ml-1 font-medium">x{c.count}</span>
                                                                    </p>
                                                                    {!detailsStr && (
                                                                        <p className="font-bold text-sm text-gray-900 whitespace-nowrap">{formatVND(c.totalPrice * c.count)}</p>
                                                                    )}
                                                                </div>
                                                                {detailsStr && (
                                                                    <div className="flex justify-between items-start mt-0.5">
                                                                        <p className="text-sm text-gray-500 flex-1 pr-4 leading-snug">{detailsStr}</p>
                                                                        <p className="font-bold text-sm text-gray-900 whitespace-nowrap">{formatVND(c.totalPrice * c.count)}</p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })
                                                ) : (
                                                    <div className="space-y-4">
                                                        {selectedLog.itemName?.split(', ').map((itemStr, idx) => (
                                                            <div key={idx} className="flex justify-between items-start border-b border-gray-200/50 pb-4 last:border-0 last:pb-0">
                                                                <p className="font-medium text-gray-800 text-base">{itemStr}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Financial Breakdown Summary */}
                                        <div className="bg-slate-50 border border-slate-100 p-6 space-y-3">
                                            {(() => {
                                                const subtotal = (selectedLog.orderData?.cartItems || []).reduce((ac, c) => ac + (parseFloat(c.totalPrice || c.price) * c.count), 0);
                                                const discount = parseFloat(selectedLog.orderData?.discount) || 0;
                                                const orderTotal = subtotal - discount;
                                                
                                                let taxValue = 0, net = 0, gross = orderTotal;
                                                if (calculationMode === 'AUTO') {
                                                    const sim = calculateSimulatedTax(orderTotal, settings?.taxRate || 0);
                                                    taxValue = sim.tax; net = sim.net; gross = sim.gross;
                                                } else {
                                                    const saved = getSavedTaxData(selectedLog);
                                                    taxValue = saved.tax; net = saved.net; gross = saved.gross;
                                                }

                                                return (
                                                    <>
                                                        <div className="flex justify-between items-center text-sm text-gray-500 font-medium">
                                                            <span className="uppercase tracking-widest text-[10px]">Tạm tính (Net)</span>
                                                            <span>{formatVND(net)}</span>
                                                        </div>
                                                        {discount > 0 && (
                                                            <div className="flex justify-between items-center text-sm text-red-500 font-medium">
                                                                <span className="uppercase tracking-widest text-[10px]">Giảm giá</span>
                                                                <span>-{formatVND(discount)}</span>
                                                            </div>
                                                        )}
                                                        <div className="flex justify-between items-center text-sm text-blue-600 font-medium pb-2 border-b border-dashed border-gray-200">
                                                            <span className="uppercase tracking-widest text-[10px] flex items-center gap-1.5">
                                                                Thuế VAT {calculationMode === 'AUTO' ? `(${settings?.taxRate || 0}%)` : ''}
                                                                {calculationMode === 'AUTO' && <Sparkles size={10} className="animate-pulse" />}
                                                            </span>
                                                            <span>{formatVND(taxValue)}</span>
                                                        </div>
                                                        <div className="flex justify-between items-end pt-1">
                                                            <span className="font-bold text-gray-900 uppercase tracking-widest text-xs">Tổng cộng</span>
                                                                <div className="text-right">
                                                                    <p className="font-black text-2xl text-brand-600 leading-none">
                                                                        {formatVND(gross)}
                                                                    </p>
                                                                    {calculationMode === 'AUTO' && (
                                                                        <p className="text-[9px] font-bold text-brand-400 mt-1 uppercase tracking-tighter italic">Chế độ mô phỏng</p>
                                                                    )}
                                                                </div>
                                                        </div>
                                                    </>
                                                );
                                            })()}
                                        </div>

                                        {selectedLog.type === 'CANCELLED' && selectedLog.reason && (
                                            <div className="bg-red-50 p-5 rounded-none border border-red-100">
                                                <p className="text-[10px] font-bold uppercase text-red-500 tracking-widest mb-1">Lý do hủy</p>
                                                <p className="font-medium text-sm text-red-700 italic">"{selectedLog.reason}"</p>
                                            </div>
                                        )}
                                    </div>

                                    <div className="p-8 border-t border-slate-100 bg-white flex gap-4">
                                        <button onClick={() => setSelectedLog(null)} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-none font-bold text-sm uppercase tracking-widest hover:bg-slate-200 active:scale-95 transition-all">
                                            ĐÓNG CHI TIẾT
                                        </button>
                                        {selectedLog.type === 'COMPLETED' && window.require && (
                                            <button
                                                onClick={() => {
                                                    const selectedPrinter = localStorage.getItem('selectedPrinter');
                                                    if (!selectedPrinter) {
                                                        showToast('Chưa chọn máy in mặc định trong cài đặt', 'error');
                                                        return;
                                                    }
                                                    const { ipcRenderer } = window.require('electron');
                                                    try {
                                                        const cartForPrint = selectedLog.orderData?.cartItems || [];
                                                        const logOrderData = {
                                                            id: getLogOrderId(selectedLog),
                                                            queueNumber: selectedLog.queueNumber,
                                                            tagNumber: selectedLog.orderData?.tagNumber,
                                                            tableName: selectedLog.orderData?.tableName,
                                                            customerName: selectedLog.orderData?.customerName,
                                                            customerPhone: selectedLog.orderData?.customerPhone,
                                                            price: (selectedLog.orderData?.cartItems || []).reduce((ac, c) => ac + (parseFloat(c.totalPrice || c.price) * c.count), 0) - (parseFloat(selectedLog.orderData?.discount) || 0),
                                                            paymentMethod: selectedLog.orderData?.paymentMethod,
                                                            timestamp: selectedLog.timestamp
                                                        };
                                                        const htmlContent = generateReceiptHTML(logOrderData, cartForPrint, settings, true);
                                                        ipcRenderer.invoke('print-html', htmlContent, selectedPrinter, settings?.receiptPaperSize).catch(console.error);
                                                    } catch (err) {
                                                        console.error('Lỗi in hóa đơn:', err);
                                                    }
                                                }}
                                                className="flex-1 py-4 bg-brand-100 text-brand-700 rounded-none font-bold text-sm uppercase tracking-widest hover:bg-brand-200 active:scale-95 transition-all flex items-center justify-center gap-2"
                                            >
                                                <Printer size={18} /> IN LẠI BILL
                                            </button>
                                        )}
                                        {modalOrderData.isDebt && (
                                            <button
                                                onClick={() => {
                                                    setSelectedLog(null);
                                                    handlePayDebt(modalOrderData.id); // Gọi pop-up thu nợ
                                                }}
                                                className="flex-1 py-4 bg-purple-600 text-white rounded-none font-bold text-sm uppercase tracking-widest hover:bg-purple-700 active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-500/30"
                                            >
                                                <DollarSign size={18} /> THU NỢ ĐƠN NÀY
                                            </button>
                                        )}
                                    </div>
                                </motion.div>
                            </div>
                        )
                    })()}
        </AnimatePresence>
    );
};

export default OrderDetailModal;
