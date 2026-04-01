import React from 'react';
import { motion } from 'framer-motion';
import { Trash2 } from 'lucide-react';
import { SERVER_URL } from '../../../api';

const DeleteInventoryModal = ({ deleteInventoryModal, setDeleteInventoryModal, inventory, setInventory, showToast, fetchData }) => {
    return (
        <>
            {deleteInventoryModal && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[1100]">
                        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white max-w-sm w-full shadow-2xl overflow-hidden shadow-red-500/20">
                            <div className="text-center bg-red-50/30" style={{ padding: '24px' }}>
                                <div className="w-16 h-16 bg-red-50 flex items-center justify-center mx-auto mb-4 text-red-500">
                                    <Trash2 size={32} />
                                </div>
                                <h3 className="text-xl font-black text-gray-900 uppercase tracking-widest">Xác nhận xóa</h3>
                                <p className="text-sm font-bold text-gray-500 mt-2">Nguyên liệu sẽ bị xóa hoàn toàn khỏi kho!</p>
                            </div>
                            <div className="p-6 space-y-4">
                                <p className="text-sm text-gray-600 mb-2">Vui lòng nhập <span className="font-black text-red-600">XOA</span> để xác nhận:</p>
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder="Nhập XOA..."
                                    className="w-full text-center p-4 bg-slate-50 border border-slate-200 outline-none focus:border-red-500 focus:bg-white font-black text-xl tracking-[5px] uppercase placeholder:font-normal placeholder:text-gray-300 placeholder:tracking-normal transition-colors"
                                    onKeyDown={async (e) => {
                                        if (e.key === 'Enter' && e.target.value === 'XOA') {
                                            setDeleteInventoryModal(null);
                                            await fetch(`${SERVER_URL}/api/inventory/${deleteInventoryModal}`, { method: 'DELETE' });
                                            fetchData();
                                        } else if ((e.key === 'Escape' || (e.key === 'Backspace' && !isInputFocused()))) {
                                            setDeleteInventoryModal(null);
                                        }
                                    }}
                                />
                                <div className="grid grid-cols-2 gap-3 mt-6 border-t border-slate-100" style={{ paddingTop: '16px' }}>
                                    <button onClick={() => setDeleteInventoryModal(null)} className="p-4 bg-slate-100 text-slate-600 font-bold text-sm hover:bg-slate-200 uppercase tracking-widest active:scale-95 transition-all">HỦY</button>
                                    <button
                                        onClick={async (e) => {
                                            const inputVal = e.target.parentElement.previousElementSibling.value;
                                            if (inputVal === 'XOA') {
                                                setDeleteInventoryModal(null);
                                                await fetch(`${SERVER_URL}/api/inventory/${deleteInventoryModal}`, { method: 'DELETE' });
                                                fetchData();
                                            } else {
                                                alert("Vui lòng gõ XOA vào ô chuẩn xác (viết hoa).");
                                            }
                                        }}
                                        className="p-4 bg-red-500 text-white font-bold text-sm hover:bg-red-600 uppercase tracking-widest active:scale-95 transition-all shadow-lg shadow-red-500/30">
                                        XÓA NGAY
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
            )}
        </>
    );
};

export default DeleteInventoryModal;
