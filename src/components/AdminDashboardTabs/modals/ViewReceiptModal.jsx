import { motion } from 'framer-motion';
import React from 'react';
import { X } from 'lucide-react';

const ViewReceiptModal = ({ viewReceiptOrder, setViewReceiptOrder, SERVER_URL }) => {
  return (
    <>
                          {viewReceiptOrder && (
                        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
                            <motion.div initial={{ y: 50, opacity: 0, scale: 0.95 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 50, opacity: 0, scale: 0.95 }}
                                className="relative bg-slate-50 p-6 shadow-2xl max-w-lg w-full z-10 border border-slate-200">
                                <button onClick={() => setViewReceiptOrder(null)} className="absolute top-4 right-4 p-2 bg-white text-gray-500 hover:bg-gray-50 transition-all z-20 shadow-sm border border-slate-100 active:scale-95">
                                    <X size={20} />
                                </button>
                                <h3 className="text-xl font-black text-gray-900 mb-4 px-2 tracking-tight">Ủy nhiệm chi - #{viewReceiptOrder.queueNumber}</h3>
                                <div className="bg-white overflow-hidden flex items-center justify-center border border-slate-100 shadow-sm" style={{ padding: '16px' }}>
                                    <img src={`${SERVER_URL}/data/receipts/${viewReceiptOrder.paymentReceipt}`} alt="Receipt" className="max-w-full max-h-[65vh] object-contain" />
                                </div>
                            </motion.div>
                        </div>
                    )}
    </>
  );
};

export default ViewReceiptModal;
