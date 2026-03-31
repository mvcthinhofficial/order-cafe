import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, Rocket, RefreshCw, Shield } from 'lucide-react';
import { SERVER_URL } from '../../../api';

const FactoryResetModal = ({
    showFactoryResetModal, setShowFactoryResetModal, showToast, backups
}) => {
    const [factoryResetStep, setFactoryResetStep] = useState(1);
    const [factoryResetInput, setFactoryResetInput] = useState('');
    const [isFactoryResetting, setIsFactoryResetting] = useState(false);

    const setStep = setFactoryResetStep;
    const setInput = setFactoryResetInput;
    const setModal = setShowFactoryResetModal;

    return (
        <AnimatePresence>
                    {showFactoryResetModal && (
                        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white max-w-md w-full shadow-2xl rounded-none overflow-hidden">
                                <div className="bg-red-600 text-white p-5 text-center relative">
                                    <div className="absolute top-0 right-0 p-3">
                                        <button onClick={() => { setShowFactoryResetModal(false); setFactoryResetStep(1); setFactoryResetInput(''); }} className="text-white/80 hover:text-white transition-colors">
                                            <X size={20} />
                                        </button>
                                    </div>
                                    <div className="mx-auto bg-red-500 rounded-none w-14 h-14 flex items-center justify-center mb-3">
                                        <AlertTriangle size={30} className="text-white" />
                                    </div>
                                    <h2 className="text-xl font-black uppercase tracking-widest">CẢNH BÁO QUAN TRỌNG</h2>
                                </div>
                                <div className="p-6">
                                    <p className="text-sm font-semibold text-gray-800 text-center mb-4 leading-relaxed bg-red-50 p-3 rounded-none border border-red-100">
                                        Thao tác này sẽ xoá sạch toàn bộ Báo cáo, Đơn hàng, Nhập/Kiểm kho và Chấm công hiện có trên màn hình. Mọi tồn kho trở về 0. (Menu và thông tin nhân viên vẫn giữ nguyên).
                                    </p>

                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-[11px] font-black uppercase text-gray-500">
                                                {factoryResetStep === 1
                                                    ? 'Bước 1: Gõ lệnh đồng ý xóa'
                                                    : 'Bước 2: Hiệu Lệnh Cuối Cùng'}
                                            </label>
                                            <div className="bg-gray-100 p-3 rounded-none text-center border border-gray-200">
                                                <span className="font-mono font-bold text-red-600 select-all underline decoration-red-300 underline-offset-4">
                                                    {factoryResetStep === 1 ? 'DONG Y XOA' : 'CHUC MUNG KHAI TRUONG'}
                                                </span>
                                            </div>
                                            <input
                                                autoFocus
                                                type="text"
                                                value={factoryResetInput}
                                                onChange={(e) => setFactoryResetInput(e.target.value.toUpperCase())}
                                                placeholder="Gõ chính xác dòng chữ trên vào đây..."
                                                className="w-full text-center tracking-widest font-bold uppercase py-3 px-4 bg-white border border-gray-300 focus:border-red-500 focus:ring-2 focus:ring-red-200 rounded-none outline-none transition-all placeholder:normal-case placeholder:font-normal placeholder:tracking-normal"
                                            />
                                        </div>

                                        <div className="pt-2">
                                            <button
                                                disabled={
                                                    isFactoryResetting ||
                                                    (factoryResetStep === 1 && factoryResetInput !== 'DONG Y XOA') ||
                                                    (factoryResetStep === 2 && factoryResetInput !== 'CHUC MUNG KHAI TRUONG')
                                                }
                                                onClick={async () => {
                                                    if (factoryResetStep === 1) {
                                                        setFactoryResetStep(2);
                                                        setFactoryResetInput('');
                                                    } else if (factoryResetStep === 2) {
                                                        setIsFactoryResetting(true);
                                                        try {
                                                            const res = await fetch(`${SERVER_URL}/api/settings/factory-reset`, {
                                                                method: 'POST',
                                                                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
                                                            });
                                                            const data = await res.json();
                                                            if (data.success && data.folderName) {
                                                                alert(`Quán mới đã được tạo thành công! Toàn bộ dữ liệu cũ đã được sao lưu an toàn tại thư mục: data/backups/${data.folderName}`);
                                                                window.location.reload();
                                                            } else {
                                                                alert('Lỗi: ' + (data.error || 'Server không phản hồi.'));
                                                            }
                                                        } catch (error) {
                                                            alert('Lỗi kết nối đến máy chủ.');
                                                        } finally {
                                                            setIsFactoryResetting(false);
                                                        }
                                                    }
                                                }}
                                                className={`w-full py-4 rounded-none font-black uppercase tracking-widest transition-all flex justify-center items-center gap-2 ${(factoryResetStep === 1 && factoryResetInput === 'DONG Y XOA') || (factoryResetStep === 2 && factoryResetInput === 'CHUC MUNG KHAI TRUONG')
                                                    ? 'bg-red-600 text-white shadow-xl shadow-red-500/30 hover:bg-red-700'
                                                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                                    }`}
                                            >
                                                {isFactoryResetting ? <RefreshCw size={18} className="animate-spin" /> : <Shield size={18} />}
                                                {factoryResetStep === 1 ? 'XÁC NHẬN BƯỚC 1' : 'CHÍNH THỨC KHAI TRƯƠNG'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    )}
        </AnimatePresence>
    );
};

export default FactoryResetModal;
