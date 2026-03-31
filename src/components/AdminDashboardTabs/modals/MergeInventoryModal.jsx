import React, { useState, useEffect } from 'react';
import { X, Merge, AlertTriangle } from 'lucide-react';
import { SERVER_URL } from '../../../api';

const MergeInventoryModal = ({ selectedItems, inventory, menu, onClose, onSuccess }) => {
    const [targetId, setTargetId] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const mergeObjects = selectedItems.map(id => {
        const item = inventory.find(i => i.id === id);
        if (!item) return null;

        let usedInMenuName = null;
        for (const menuItem of menu.filter(m => !m.isDeleted)) {
            if (menuItem.recipe?.some(r => r.ingredientId === item.id) ||
                menuItem.sizes?.some(s => s.recipe?.some(r => r.ingredientId === item.id)) ||
                menuItem.addons?.some(a => a.recipe?.some(r => r.ingredientId === item.id))) {
                usedInMenuName = menuItem.name;
                break;
            }
        }

        return { ...item, usedInMenuName };
    }).filter(Boolean);

    const totalStock = mergeObjects.reduce((acc, curr) => acc + (curr.stock || 0), 0);

    useEffect(() => {
        if (mergeObjects.length > 0 && !targetId) {
            setTargetId(mergeObjects[0].id);
        }
    }, [mergeObjects, targetId]);

    const handleMerge = async () => {
        if (!targetId || isSubmitting) return;
        setIsSubmitting(true);
        try {
            const res = await fetch(`${SERVER_URL}/api/inventory/merge`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetId, sourceIds: selectedItems })
            });
            const data = await res.json();
            if (data.success) {
                onSuccess(data.message);
            } else {
                alert(data.message || 'Lỗi khi gộp.');
            }
        } catch (error) {
            alert('Lỗi kết nối tới Server');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white max-w-2xl w-full shadow-2xl rounded-none flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between p-6 bg-brand-600 text-white">
                    <div className="flex items-center gap-3">
                        <Merge size={24} />
                        <h2 className="text-lg font-black uppercase tracking-widest">Gộp {selectedItems.length} Nguyên Liệu Trùng Lặp</h2>
                    </div>
                    <button onClick={onClose} className="hover:bg-brand-700 p-2 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto bg-gray-50 flex-1">
                    <div className="mb-6 bg-brand-50 border border-brand-100 p-4 text-sm text-brand-900 leading-relaxed font-medium">
                        Bạn đang chuẩn bị gộp <strong className="text-brand-600">{selectedItems.length} nguyên liệu</strong> lại thành một.
                        Số tồn kho của tất cả sẽ được <strong>cộng dồn</strong>. Lịch sử tiêu thụ, lịch sử nhập hàng và các công thức món ăn đang sử dụng các nguyên liệu lỗi này cũng sẽ được tự động đổi sang nguyên liệu chuẩn!
                    </div>

                    <h3 className="font-bold text-gray-800 mb-4 px-1 flex items-center gap-2">
                        <CheckCircle2 className="text-green-500" size={18} /> Vui lòng chọn 1 TÊN CHUẨN ĐÍCH để giữ lại:
                    </h3>

                    <div className="space-y-3">
                        {mergeObjects.map(item => (
                            <label key={item.id} className={`flex items-start gap-4 p-4 border-2 cursor-pointer transition-all ${targetId === item.id ? 'border-brand-600 bg-brand-50/50 shadow-sm' : 'border-gray-200 bg-white hover:border-brand-300'}`}>
                                <div className="mt-0.5">
                                    <input
                                        type="radio"
                                        name="targetIngredient"
                                        checked={targetId === item.id}
                                        onChange={() => setTargetId(item.id)}
                                        className="w-5 h-5 text-brand-600 border-gray-300 focus:ring-brand-500"
                                    />
                                </div>
                                <div className="flex-1">
                                    <div className="font-bold text-gray-900 text-[15px]">{item.name}</div>
                                    <div className="text-[11px] font-semibold text-gray-500 tracking-wide mt-1 flex flex-wrap gap-x-4 gap-y-1 items-center">
                                        <span>Tồn kho cộng dồn/chuyển: <b className="text-[#C68E5E] text-[12px]">{item.stock} {item.unit}</b></span>
                                        <span className={`px-2 py-0.5 rounded-none border ${item.usedInMenuName ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-gray-200 bg-gray-50 text-gray-400'}`}>
                                            - {item.usedInMenuName ? `Nguyên liệu đang liên kết món: ${item.usedInMenuName}` : 'Chưa liên kết món'}
                                        </span>
                                    </div>
                                </div>
                            </label>
                        ))}
                    </div>

                    <div className="mt-8 pt-6 border-t border-gray-200 flex items-center justify-between">
                        <div className="text-gray-600 font-medium">Tổng tồn kho sau khi gộp:</div>
                        <div className="text-right flex items-baseline gap-2">
                            <span className="text-3xl font-black text-[#C68E5E]">{parseFloat(totalStock.toFixed(3))}</span>
                            <span className="text-gray-500 font-bold">{mergeObjects[0]?.unit || 'g'}</span>
                        </div>
                    </div>
                </div>

                <div className="p-6 bg-white border-t border-gray-100 flex gap-4">
                    <button onClick={onClose} disabled={isSubmitting} className="flex-1 px-4 py-4 bg-gray-100 text-gray-700 font-bold hover:bg-gray-200 transition-colors uppercase tracking-widest text-sm text-[12px]">Hủy Bỏ</button>
                    <button onClick={handleMerge} disabled={isSubmitting || !targetId} className="flex-1 px-4 py-4 bg-brand-600 text-white font-black hover:bg-brand-700 shadow-lg border border-brand-600 transition-all uppercase tracking-widest text-[12px] flex items-center justify-center gap-2 disabled:opacity-50">
                        {isSubmitting ? <RefreshCw className="animate-spin" size={18} /> : <Merge size={18} />} XÁC NHẬN GỘP LIÊN KẾT
                    </button>
                </div>
            </motion.div>
        </div>
    );
};


export default MergeInventoryModal;
