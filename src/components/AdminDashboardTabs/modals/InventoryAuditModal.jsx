import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, CheckCircle, AlertTriangle } from 'lucide-react';
import { SERVER_URL } from '../../../api';

const InventoryAuditModal = ({ isOpen, onClose, inventory, onSave }) => {
    const [auditData, setAuditData] = useState([]);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen && inventory) {
            setAuditData(inventory.map(item => ({
                ingredientId: item.id,
                ingredientName: item.name,
                systemStock: item.stock || 0,
                unit: item.unit,
                actualStock: item.stock || 0,
                reason: 'Không rõ'
            })));
        }
    }, [isOpen, inventory]);

    if (!isOpen) return null;

    const handleChange = (index, field, value) => {
        const newData = [...auditData];
        newData[index][field] = value;
        setAuditData(newData);
    };

    const handleSave = async () => {
        const changedItems = auditData.filter(item => parseFloat(item.actualStock) !== parseFloat(item.systemStock));
        if (changedItems.length === 0) {
            alert('Không có nguyên liệu nào bị thay đổi so với tồn kho máy.');
            onClose();
            return;
        }

        if (!window.confirm(`Xác nhận ghi đè Tồn Kho Thực Tế cho ${changedItems.length} nguyên liệu?`)) return;

        setSubmitting(true);
        try {
            const res = await fetch(`${SERVER_URL}/api/inventory/audit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(changedItems.map(item => ({
                    ingredientId: item.ingredientId,
                    actualStock: parseFloat(item.actualStock),
                    reason: item.reason
                })))
            });
            if (res.ok) {
                onSave();
                onClose();
            } else {
                alert('Có lỗi xảy ra khi lưu phiếu kiểm kho');
            }
        } catch (e) {
            console.error(e);
            alert('Không thể kết nối máy chủ');
        }
        setSubmitting(false);
    };

    return (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl relative z-10 overflow-hidden font-main" style={{ borderRadius: 'var(--radius-modal)' }}>
                {/* Header */}
                <div className="bg-brand-600 text-white flex items-center justify-between" style={{ paddingLeft: '32px', paddingRight: '32px', paddingTop: '24px', paddingBottom: '24px' }}>
                    <div className="flex items-center gap-4">
                        <CheckCircle size={28} />
                        <div>
                            <h2 className="text-2xl font-black uppercase tracking-tight">Kiểm Khê Thực Tế</h2>
                            <p className="text-brand-100 text-[10px] uppercase tracking-[0.2em] font-black mt-1">Cập nhật số dư kho chính xác</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="hover:bg-brand-700 p-2 transition-colors"><X size={24} /></button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-auto bg-gray-50" style={{ padding: '32px' }}>
                    <div className="bg-white shadow-sm border border-gray-100 overflow-hidden">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 text-[10px] uppercase font-bold tracking-[0.2em] text-[#9ca3af]">
                                <tr>
                                    <th className="px-6 py-4 text-left">Nguyên liệu</th>
                                    <th className="px-6 py-4 text-left">Tồn Máy</th>
                                    <th className="px-6 py-4 text-left">Tồn Thực Tế (Đếm)</th>
                                    <th className="px-6 py-4 text-left">Chênh Lệch</th>
                                    <th className="px-6 py-4 text-left">Lý do Hao hụt/Dư</th>
                                </tr>
                            </thead>
                            <tbody>
                                {auditData.map((item, index) => {
                                    const diff = parseFloat(item.actualStock || 0) - item.systemStock;
                                    const diffColor = diff < 0 ? 'text-red-500 bg-red-50/50' : diff > 0 ? 'text-brand-600 bg-brand-50/50' : 'text-gray-300';
                                    const diffSign = diff > 0 ? '+' : '';
                                    return (
                                        <tr key={item.ingredientId} className="border-t border-gray-50 hover:bg-gray-50/50 transition-colors">
                                            <td className="px-6 py-5 font-bold text-[15px]">{item.ingredientName}</td>
                                            <td className="px-6 py-5 text-left font-mono text-gray-500 font-medium">{item.systemStock} <span className="text-[10px] text-gray-400">{item.unit}</span></td>
                                            <td className="px-6 py-5 text-left">
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="number"
                                                        value={item.actualStock}
                                                        onChange={(e) => handleChange(index, 'actualStock', e.target.value)}
                                                        className={`w-28 border-2 ${parseFloat(item.actualStock) !== item.systemStock ? 'border-brand-500 bg-brand-50/30' : 'border-gray-200'} px-4 py-2.5 text-center font-mono font-black text-lg focus:border-brand-500 focus:ring-4 focus:ring-brand-500/20 outline-none transition-all`}
                                                        style={{ borderRadius: 'var(--radius-input, var(--radius-btn))' }}
                                                        onClick={(e) => e.target.select()}
                                                    />
                                                    <span className="text-[10px] text-gray-400 font-bold uppercase">{item.unit}</span>
                                                </div>
                                            </td>
                                            <td className={`px-6 py-5 text-left font-mono font-bold text-lg ${diffColor}`}>
                                                {diff === 0 ? '-' : `${diffSign}${diff.toFixed(2)}`}
                                            </td>
                                            <td className="px-6 py-5 text-left">
                                                {diff !== 0 && (
                                                    <select
                                                        value={item.reason}
                                                        onChange={(e) => handleChange(index, 'reason', e.target.value)}
                                                        className="w-full border-2 border-gray-100 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700 focus:border-brand-500 focus:bg-white outline-none cursor-pointer transition-colors"
                                                        style={{ borderRadius: 'var(--radius-btn)' }}
                                                    >
                                                        <option>Không rõ</option>
                                                        <option>Hao hụt tự nhiên</option>
                                                        <option>Đổ vỡ / Hư hỏng</option>
                                                        <option>Sai định lượng lúc pha</option>
                                                        <option>Kiểm kê sai lần trước</option>
                                                        <option>Hàng Tặng / Hủy</option>
                                                    </select>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Footer */}
                <div className="bg-white border-t border-gray-100 flex justify-between items-center" style={{ paddingLeft: '32px', paddingRight: '32px', paddingTop: '24px', paddingBottom: '24px' }}>
                    <div className="bg-amber-50 w-1/2 flex items-center gap-3" style={{ padding: '12px', borderRadius: 'var(--radius-btn)' }}>
                        <AlertTriangle size={20} className="text-amber-500 flex-shrink-0" />
                        <p className="text-[10px] text-amber-800 font-black uppercase tracking-widest leading-relaxed">
                            Lưu ý: Mọi số liệu Tồn Máy tính sẽ bị thay thế thành Tồn Đếm Thực Tế.
                        </p>
                    </div>
                    <div className="flex gap-4">
                        <button onClick={onClose} className="px-8 py-4 text-gray-500 font-black text-[11px] uppercase tracking-[0.2em] hover:bg-gray-100 transition-all" style={{ borderRadius: 'var(--radius-btn)' }}>Hủy</button>
                        <button onClick={handleSave} disabled={submitting} className="bg-brand-600 text-white px-10 py-4 font-black text-xs uppercase tracking-[0.2em] shadow-lg shadow-brand-500/30 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2" style={{ borderRadius: 'var(--radius-btn)' }}>
                            {submitting ? 'ĐANG LƯU...' : <><CheckCircle size={18} strokeWidth={3} /> XÁC NHẬN CHỐT</>}
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};



export default InventoryAuditModal;
