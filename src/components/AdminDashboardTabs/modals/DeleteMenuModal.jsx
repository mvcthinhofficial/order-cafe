import React from 'react';
import { motion } from 'framer-motion';
import { Trash2 } from 'lucide-react';
import { SERVER_URL } from '../../../api';

const DeleteMenuModal = ({ deleteMenuModal, setDeleteMenuModal, setMenu, showToast }) => {
    return (
                {deleteMenuModal && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[1100]">
                        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white max-w-sm w-full rounded-none shadow-2xl overflow-hidden shadow-red-500/20">
                            <div className="p-6 text-center bg-red-50/30">
                                <div className="w-16 h-16 bg-red-50 rounded-none flex items-center justify-center mx-auto mb-4 text-red-500">
                                    <Trash2 size={32} />
                                </div>
                                <h3 className="text-xl font-black text-gray-900 uppercase tracking-widest">{showMenuTrash ? 'Xóa Vĩnh Viễn Menu' : 'Đưa Vào Thùng Rác'}</h3>
                                <p className="text-sm font-bold text-gray-500 mt-2">
                                    {showMenuTrash ? 'Hành động này không thể hoàn tác!' : 'Bạn có thể khôi phục lại món này bất kỳ lúc nào.'}
                                </p>
                            </div>
                            <div className="p-6 flex gap-3 border-t border-slate-100">
                                <button onClick={() => setDeleteMenuModal(null)} className="flex-1 px-4 py-4 bg-slate-100 text-slate-600 rounded-none font-bold hover:bg-slate-200 transition-all active:scale-95 text-sm uppercase tracking-widest">Hủy</button>
                                <button onClick={confirmDeleteMenuItem} className="flex-1 px-4 py-4 bg-red-500 text-white rounded-none font-bold hover:bg-red-600 transition-all active:scale-95 shadow-lg shadow-red-500/20 text-sm uppercase tracking-widest">Đồng Ý</button>
                            </div>
                        </motion.div>
                    </div>
                )}
    );
};

export default DeleteMenuModal;
