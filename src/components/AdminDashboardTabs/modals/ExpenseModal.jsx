import React, { useState, useEffect } from 'react';
import { Save, X, Trash2, Calendar, DollarSign } from 'lucide-react';
import { formatVND } from '../../../utils/dashboardUtils';

const ExpenseModal = ({ expense, expenses, onSave, onClose }) => {
    const [category, setCategory] = useState(expense?.category || 'Đầu tư & Máy móc');
    const [name, setName] = useState(expense?.name || '');
    const [showSuggestions, setShowSuggestions] = useState(false);

    const handleCategoryChange = (e) => {
        const newCat = e.target.value;
        setCategory(newCat);
        setName('');
    };

    const isFixed = false; // Cho phép điền tự do tất cả các mục

    let baseSuggestions = [];
    if (category === 'Điện, Nước & Internet') {
        baseSuggestions = ['Tiền Điện', 'Tiền Nước', 'Tiền Internet', 'Phí quản lý / Rác', 'Khác (bảo trì điện nước)'];
    } else if (category === 'Mặt bằng (Cố định)') {
        baseSuggestions = ['Tiền mặt bằng', 'Chi phí ban quản lý', 'Bảo vệ / Gửi xe'];
    } else if (category === 'Lương, thưởng ngoài') {
        baseSuggestions = ['Lương Quản lý', 'Lương Nhân viên', 'Thưởng / Phụ cấp'];
    }

    const suggestions = Array.from(new Set([
        ...baseSuggestions,
        ...(expenses ? expenses.filter(e => e.category === category).map(e => e.name) : [])
    ])).filter(n => n.toLowerCase().includes(name.toLowerCase()) && n !== name);

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4 animate-in fade-in duration-200">
            <div className="bg-white shadow-2xl w-[450px] relative flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-gray-50/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-brand-100 text-brand-600 rounded-none">
                            <DollarSign size={20} className="stroke-[3px]" />
                        </div>
                        <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">{expense ? 'Sửa Phiếu Chi' : 'Ghi Phiếu Chi'}</h3>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-2 transition-colors rounded-none">
                        <X size={20} strokeWidth={3} />
                    </button>
                </div>
                <div className="p-6 overflow-y-auto custom-scrollbar flex-1 overflow-visible">
                    <form id="expense-form" onSubmit={(e) => {
                        e.preventDefault();
                        const formData = new FormData(e.target);
                        onSave({
                            id: expense?.id,
                            name: name,
                            amount: parseFloat(formData.get('amount')),
                            date: formData.get('date'),
                            timestamp: formData.get('date'), // Synchronize with SQLite schema
                            category: category,
                            note: formData.get('note')
                        });
                    }} className="space-y-4">
                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Phân mục (Category)</label>
                            <select name="category" value={category} onChange={handleCategoryChange} className="w-full border-2 border-transparent bg-gray-50 p-3 focus:bg-white focus:border-brand-600 outline-none font-bold text-gray-900 transition-all">
                                <option value="Đầu tư & Máy móc">🎨 Chi phí Đầu tư (CapEx: Decor, Máy móc...)</option>
                                <option value="Khác">💸 Khác (Lặt vặt, Marketing...)</option>
                                <option disabled>──────────</option>
                                <option value="Mặt bằng (Cố định)">🏠 Mặt bằng & Vận hành (Cố định)</option>
                                <option value="Điện, Nước & Internet">⚡ Điện, Nước & Internet (Utilities)</option>
                                <option value="Lương, thưởng ngoài">👷 Lương bổng ngoài lề</option>
                            </select>
                        </div>
                        <div className="relative">
                            <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Nội dung chi</label>
                            <input
                                name="name"
                                value={name}
                                onChange={e => {
                                    setName(e.target.value);
                                    setShowSuggestions(true);
                                }}
                                onFocus={() => setShowSuggestions(true)}
                                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                                disabled={isFixed}
                                required
                                placeholder={isFixed ? '' : 'Chọn hoặc gõ nội dung chi...'}
                                className={`w-full border-2 border-transparent p-3 outline-none font-bold transition-all ${isFixed ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-gray-50 text-gray-900 focus:bg-white focus:border-brand-600'}`}
                            />
                            {!isFixed && showSuggestions && suggestions.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 shadow-2xl max-h-48 overflow-y-auto z-[60] rounded-none">
                                    {suggestions.map((s, i) => (
                                        <div
                                            key={i}
                                            className="p-3 hover:bg-brand-50 cursor-pointer text-sm font-bold text-gray-700 border-b border-gray-50 last:border-none flex items-center justify-between group"
                                            onMouseDown={(e) => { e.preventDefault(); setName(s); setShowSuggestions(false); }}
                                        >
                                            <span>{s}</span>
                                            <span className="text-[10px] text-brand-600 uppercase font-black opacity-0 group-hover:opacity-100 tracking-widest">Chọn</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Số tiền (VNĐ)</label>
                                <input type="number" name="amount" defaultValue={expense?.amount} required min="0" className="w-full border-2 border-transparent bg-gray-50 p-3 focus:bg-white focus:border-brand-600 outline-none font-bold text-gray-900 transition-all font-mono" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Ngày chi</label>
                                <input type="date" name="date" defaultValue={expense?.date || getVNDateStr()} required className="w-full border-2 border-transparent bg-gray-50 p-3 focus:bg-white focus:border-brand-600 outline-none font-bold text-gray-900 transition-all" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Ghi chú thêm</label>
                            <textarea name="note" defaultValue={expense?.note} rows="2" placeholder="Chi tiết nếu cần..." className="w-full border-2 border-transparent bg-gray-50 p-3 focus:bg-white focus:border-brand-600 outline-none text-sm text-gray-900 transition-all" />
                        </div>
                    </form>
                </div>
                <div className="p-5 border-t border-gray-100 bg-gray-50 flex gap-3 mt-auto">
                    <button type="button" onClick={onClose} className="flex-1 px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-widest hover:bg-gray-200 transition-colors">
                        HỦY
                    </button>
                    <button type="submit" form="expense-form" className="flex-[2] bg-brand-600 text-white px-4 py-3 text-xs font-black uppercase tracking-widest shadow-lg shadow-brand-500/30 hover:bg-brand-600 hover:shadow-brand-500/50 transition-all">
                        {expense ? 'CẬP NHẬT' : 'GHI PHIẾU CHI'}
                    </button>
                </div>
            </div>
        </div>
    );
};


export default ExpenseModal;
