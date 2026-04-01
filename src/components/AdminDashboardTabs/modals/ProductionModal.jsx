import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Package, Plus, Trash2, Save, RefreshCw, ArrowDown, ArrowUp, AlertCircle } from 'lucide-react';
import { SERVER_URL } from '../../../api';
import { formatVND } from '../../../utils/dashboardUtils';

const ProductionModal = ({
    showProductionModal, setShowProductionModal,
    inventory, productionInputs, setProductionInputs,
    productionOutputItem, setProductionOutputItem,
    productionOutputQty, setProductionOutputQty,
    productionOutputUnit, setProductionOutputUnit,
    inventoryStats = [],
    fetchData,
    showToast
}) => {
    const [showConfirm, setShowConfirm] = React.useState(false);

    React.useEffect(() => {
        if (!showProductionModal) {
            setShowConfirm(false);
        }
    }, [showProductionModal]);

    const executeProduction = async () => {
        setShowConfirm(false);
        const validInputs = productionInputs.filter(i => i.id && parseFloat(i.qty) > 0);
        try {
            const res = await fetch(`${SERVER_URL}/api/inventory/produce`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    inputs: validInputs.map(i => {
                        const stat = inventoryStats.find(s => s.id === i.id);
                        const costPrice = stat?.avgCost || inventory.find(inv => inv.id === i.id)?.importPrice || 0;
                        return { id: i.id, qty: parseFloat(i.qty), unitCost: costPrice };
                    }),
                    outputItemName: productionOutputItem,
                    outputUnit: productionOutputUnit,
                    outputQty: parseFloat(productionOutputQty),
                    userName: localStorage.getItem('adminToken') ? 'Admin' : 'Staff'
                })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                showToast('Đã San Chiết Thành Công!', 'success');
                fetchData();
                setShowProductionModal(false);
                setProductionInputs([{ id: '', qty: '' }]);
                setProductionOutputItem('');
                setProductionOutputQty('');
                setProductionOutputUnit('');
            } else {
                alert(data.message || "Lỗi khi chế biến");
            }
        } catch (e) {
            console.error('ProductionModal error:', e);
            alert("Lỗi: " + (e?.message || 'Không thể kết nối máy chủ'));
        }
    };

    return (
        <AnimatePresence>
                {showProductionModal && (
                    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[100] overflow-y-auto">
                        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white max-w-2xl w-full shadow-2xl my-8 relative overflow-hidden" style={{ borderRadius: 'var(--radius-modal)' }}>
                           {/* Custom Confirm Modal Override */}
                           <AnimatePresence>
                                {showConfirm && (
                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-50 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center p-8 text-center border-4 border-orange-500 shadow-2xl">
                                        <div className="w-20 h-20 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mb-6 shadow-inner">
                                            <AlertCircle size={40} />
                                        </div>
                                        <h3 className="text-2xl font-black text-gray-900 mb-2 uppercase tracking-tight">Xác nhận điều chuyển?</h3>
                                        <p className="text-gray-600 text-base mb-8 max-w-sm font-medium">
                                            Hãy kiểm tra kỹ đơn vị tính và số lượng. Dòng tiền <span className="font-bold text-red-600">Giá trị Tồn Kho</span> sẽ được điều chuyển <span className="font-bold text-gray-900">mà không sinh ra Phiếu Nhập</span>.
                                        </p>
                                        <div className="flex gap-4 w-full max-w-sm">
                                            <button onClick={() => setShowConfirm(false)} className="flex-1 py-4 bg-gray-100 text-gray-600 font-black uppercase tracking-widest hover:bg-gray-200 transition-colors border-2 border-transparent">
                                                QUAY LẠI
                                            </button>
                                            <button onClick={executeProduction} className="flex-1 py-4 bg-orange-600 text-white font-black uppercase tracking-widest hover:bg-orange-700 transition-colors shadow-lg shadow-orange-600/30">
                                                CHẮC CHẮN
                                            </button>
                                        </div>
                                    </motion.div>
                                )}
                           </AnimatePresence>

                            <button onClick={() => setShowProductionModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-900 transition-colors z-10"><X size={24} /></button>
                            <div className="border-b border-gray-100 bg-orange-50" style={{ padding: 'var(--spacing-card-p, 24px)' }}>
                                <div className="flex items-center gap-3 text-orange-600 mb-2">
                                    <RefreshCw size={28} />
                                    <h3 className="text-2xl font-black uppercase tracking-widest">Chế Biến Bán Thành Phẩm</h3>
                                </div>
                                <p className="text-sm font-bold text-gray-500">Chuyển hóa Nguyên liệu thô (Trừ kho) thành Bán thành phẩm mới (Cộng kho).</p>
                            </div>

                            <div className="p-6 space-y-6">
                                {/* ... Trống ... */}
                                {/* Nguyên Liệu Thô Đầu Vào */}
                                <div className="bg-gray-50 border border-gray-200" style={{ padding: 'var(--spacing-card-p, 16px)', borderRadius: 'var(--radius-card)' }}>
                                    <h4 className="font-black text-sm uppercase text-gray-700 mb-3 flex items-center gap-2"><ArrowDown size={16} className="text-red-500" /> NGUYÊN LIỆU THÔ HAO HỤT (- Trừ Kho)</h4>

                                    {productionInputs.map((input, idx) => {
                                        const selectedInv = inventory.find(i => i.id === input.id);
                                        return (
                                            <div key={idx} className="flex flex-col mb-3">
                                                <div className="flex gap-2">
                                                    <select
                                                        value={input.id}
                                                        onChange={(e) => {
                                                            const newInputs = [...productionInputs];
                                                            newInputs[idx].id = e.target.value;
                                                            setProductionInputs(newInputs);
                                                        }}
                                                        className={`flex-1 p-3 border-2 outline-none font-bold text-sm bg-white ${selectedInv && parseFloat(input.qty) > selectedInv.stock ? 'border-red-400 focus:border-red-500 text-red-700' : 'border-gray-200 focus:border-orange-500'}`}
                                                        style={{ borderRadius: 'var(--radius-input)' }}
                                                    >
                                                        <option value="">-- Chọn Nguyên Liệu Thô --</option>
                                                        {inventory.map(inv => (
                                                            <option key={inv.id} value={inv.id}>{inv.name} (Tồn hiện tại: {inv.stock} {inv.unit})</option>
                                                        ))}
                                                    </select>
                                                    <div className="relative w-32">
                                                        <input
                                                            type="number"
                                                            min="0" step="0.1"
                                                            placeholder="Khối lượng"
                                                            value={input.qty}
                                                            onChange={(e) => {
                                                                const newInputs = [...productionInputs];
                                                                newInputs[idx].qty = e.target.value;
                                                                setProductionInputs(newInputs);
                                                            }}
                                                            className={`w-full p-3 pr-10 border-2 outline-none font-bold text-sm text-center ${selectedInv && parseFloat(input.qty) > selectedInv.stock ? 'border-red-400 focus:border-red-500 text-red-700 bg-red-50' : 'border-gray-200 focus:border-orange-500'}`}
                                                            style={{ borderRadius: 'var(--radius-input)' }}
                                                        />
                                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold pointer-events-none text-gray-400">
                                                            {selectedInv ? selectedInv.unit : ''}
                                                        </span>
                                                    </div>
                                                    {productionInputs.length > 1 && (
                                                        <button onClick={() => setProductionInputs(productionInputs.filter((_, i) => i !== idx))} className="px-4 bg-red-100 text-red-600 hover:bg-red-200 transition-colors font-black" style={{ borderRadius: 'var(--radius-btn)' }}><Trash2 size={16} /></button>
                                                    )}
                                                </div>
                                                {selectedInv && parseFloat(input.qty) > selectedInv.stock && (
                                                    <p className="text-xs font-black text-red-500 mt-1 pl-1 flex items-center gap-1">
                                                        ⚠️ Vượt quá số lượng tồn kho hiện tại ({selectedInv.stock} {selectedInv.unit})
                                                    </p>
                                                )}
                                            </div>
                                        );
                                    })}
                                    <button
                                        onClick={() => setProductionInputs([...productionInputs, { id: '', qty: '' }])}
                                        className="text-orange-600 font-bold text-sm flex items-center gap-1 hover:text-orange-700 uppercase"
                                    >
                                        <Plus size={14} /> Thêm Nguyên Liệu Thô Khác
                                    </button>

                                    {/* Báo giá vốn tạm tính */}
                                    <div className="mt-4 border-t border-gray-200 flex justify-between items-center text-sm" style={{ paddingTop: '12px' }}>
                                        <span className="font-bold text-gray-500">Tổng Giá Vốn Tạm Tính (COGS):</span>
                                        <span className="font-black text-red-600">
                                            {formatVND(productionInputs.reduce((sum, input) => {
                                                const stat = inventoryStats.find(s => s.id === input.id);
                                                const costPrice = stat?.avgCost || inventory.find(i => i.id === input.id)?.importPrice || 0;
                                                return sum + (costPrice * (parseFloat(input.qty) || 0));
                                            }, 0))}
                                        </span>
                                    </div>
                                </div>

                                {/* Bán Thành Phẩm Đầu Ra */}
                                <div className="bg-orange-50/50 border border-orange-200" style={{ padding: 'var(--spacing-card-p, 16px)', borderRadius: 'var(--radius-card)' }}>
                                    <h4 className="font-black text-sm uppercase text-orange-700 mb-3 flex items-center gap-2"><ArrowUp size={16} className="text-brand-500" /> BÁN THÀNH PHẨM THU ĐƯỢC (+ Cộng Kho)</h4>
                                    <div className="flex gap-2">
                                        <div className="flex-[2] relative">
                                            <input
                                                type="text"
                                                list="production-outputs"
                                                placeholder="VD: Cốt Cafe Phin (Tên mới hoặc chọn sẵn)"
                                                value={productionOutputItem}
                                                onChange={(e) => {
                                                    setProductionOutputItem(e.target.value);
                                                    const existing = inventory.find(i => i.name.toLowerCase() === e.target.value.toLowerCase() || i.id === e.target.value);
                                                    if (existing) setProductionOutputUnit(existing.unit);
                                                    else setProductionOutputUnit('');
                                                }}
                                                className="w-full p-3 border-2 border-orange-200 outline-none focus:border-orange-500 font-bold text-sm bg-white text-orange-900"
                                                style={{ borderRadius: 'var(--radius-input)' }}
                                            />
                                            <datalist id="production-outputs">
                                                {inventory.map(inv => (
                                                    <option key={inv.id} value={inv.name}>{inv.stock} {inv.unit} hiện hành</option>
                                                ))}
                                            </datalist>
                                        </div>

                                        {(() => {
                                            const existing = inventory.find(i => i.name.toLowerCase() === productionOutputItem.toLowerCase() || i.id === productionOutputItem);
                                            return !existing ? (
                                                <input
                                                    type="text"
                                                    placeholder="Đơn vị (ml, g, ly...)"
                                                    value={productionOutputUnit}
                                                    onChange={(e) => setProductionOutputUnit(e.target.value)}
                                                    className="flex-1 p-3 border-2 border-orange-200 outline-none focus:border-orange-500 font-bold text-sm bg-white text-orange-900"
                                                    style={{ borderRadius: 'var(--radius-input)' }}
                                                />
                                            ) : null;
                                        })()}

                                        <div className="relative w-40">
                                            <input
                                                type="number"
                                                min="0" step="0.1"
                                                placeholder="Sản lượng"
                                                value={productionOutputQty}
                                                onChange={(e) => setProductionOutputQty(e.target.value)}
                                                className="w-full p-3 pr-10 border-2 border-orange-200 outline-none focus:border-orange-500 font-black text-orange-900 text-lg text-center bg-white"
                                                style={{ borderRadius: 'var(--radius-input)' }}
                                            />
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-black text-orange-400 pointer-events-none">
                                                {inventory.find(i => i.name.toLowerCase() === productionOutputItem.toLowerCase() || i.id === productionOutputItem)?.unit || productionOutputUnit || ''}
                                            </span>
                                        </div>
                                    </div>
                                    {/* Đoán giá vốn mẻ và đơn vị */}
                                    {productionOutputQty > 0 && productionOutputItem && (() => {
                                        const outputUnitDisplay = inventory.find(i => i.name.toLowerCase() === productionOutputItem.toLowerCase() || i.id === productionOutputItem)?.unit || productionOutputUnit || 'đơn vị';
                                        const batchCost = productionInputs.reduce((sum, input) => {
                                            const stat = inventoryStats.find(s => s.id === input.id);
                                            const costPrice = stat?.avgCost || inventory.find(i => i.id === input.id)?.importPrice || 0;
                                            return sum + (costPrice * (parseFloat(input.qty) || 0));
                                        }, 0);
                                        return (
                                            <div className="mt-4 text-sm font-bold text-brand-800 flex flex-col gap-1 bg-brand-100/50 border border-brand-200" style={{ padding: '12px', borderRadius: 'var(--radius-badge)' }}>
                                                <div className="flex justify-between items-center bg-white border border-brand-100 shadow-sm" style={{ padding: '8px', borderRadius: 'var(--radius-badge)' }}>
                                                    <span>Tổng giá trị dồn sang {productionOutputQty} {outputUnitDisplay}:</span>
                                                    <span className="font-black text-lg text-red-600">{formatVND(batchCost)}</span>
                                                </div>
                                                <div className="flex justify-between items-center px-2 pt-1 text-brand-600">
                                                    <span className="text-xs">Giá vốn trung bình chia ra 1 {outputUnitDisplay}:</span>
                                                    <span className="font-bold">{formatVND(batchCost / parseFloat(productionOutputQty))}</span>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>

                            <div className="bg-gray-50 flex gap-3 border-t border-gray-100" style={{ padding: 'var(--spacing-card-p, 24px)' }}>
                                <button
                                    onClick={() => setShowProductionModal(false)}
                                    className="flex-1 py-4 bg-white border-2 border-gray-200 text-gray-500 font-black hover:bg-gray-50 transition-colors uppercase tracking-widest text-sm"
                                    style={{ borderRadius: 'var(--radius-btn)' }}
                                >
                                    HỦY BỎ
                                </button>
                                <button
                                    onClick={async () => {
                                        // Validation logic
                                        const validInputs = productionInputs.filter(i => i.id && parseFloat(i.qty) > 0);
                                        if (validInputs.length === 0) return alert("Vui lòng chọn ít nhất 1 nguyên liệu thô bị trừ đi!");

                                        const outOfStockInputs = validInputs.filter(i => {
                                            const inv = inventory.find(invItem => invItem.id === i.id);
                                            return inv && parseFloat(i.qty) > inv.stock;
                                        });
                                        if (outOfStockInputs.length > 0) {
                                            const names = outOfStockInputs.map(i => inventory.find(inv => inv.id === i.id)?.name).join(', ');
                                            return alert(`Không đủ tồn kho để chuyển hoá nguyên liệu: ${names}. Cần kiểm tra lại định lượng!`);
                                        }

                                        if (!productionOutputItem) return alert("Vui lòng gõ Tên Bán thành phẩm nhắm đến!");
                                        const isNew = !inventory.find(i => i.name.toLowerCase() === productionOutputItem.toLowerCase() || i.id === productionOutputItem);
                                        if (!productionOutputUnit && !inventory.find(i => i.name.toLowerCase() === productionOutputItem.toLowerCase() || i.id === productionOutputItem)) return alert("Vui lòng bổ sung Đơn vị tính (VD: ml, phần...) cho món mới này!");
                                        if (parseFloat(productionOutputQty) <= 0 || !productionOutputQty) return alert("Vui lòng nhập số lượng Bán thành phẩm thu được hợp lệ!");

                                        setShowConfirm(true);
                                    }}
                                    className="flex-1 py-4 bg-orange-600 text-white font-black hover:bg-orange-700 transition-colors uppercase tracking-widest shadow-lg shadow-orange-600/30 text-sm flex items-center justify-center gap-2"
                                    style={{ borderRadius: 'var(--radius-btn)' }}
                                >
                                    <RefreshCw size={18} /> THỰC THI CHẾ BIẾN
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
        </AnimatePresence>
    );
};

export default ProductionModal;
