import React, { useState, useEffect } from 'react';
import { Save, X, Trash2, Calendar, DollarSign } from 'lucide-react';
import { formatVND, CurrencyInput, getVNDateStr } from '../../../utils/dashboardUtils';

const ExpenseModal = ({ expense, expenses, onSave, onClose }) => {
    const [category, setCategory] = useState(expense?.category || 'Đầu tư & Máy móc');
    const [name, setName] = useState(expense?.name || '');
    const [showSuggestions, setShowSuggestions] = useState(false);

    const handleCategoryChange = (e) => {
        const newCat = e.target.value;
        setCategory(newCat);
        setName('');
    };

    const isFixed = false;

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
            <div className="bg-white flex flex-col w-full max-w-[480px] max-h-[90vh] overflow-hidden" style={{ borderRadius: 'var(--radius-modal)', boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}>
                
                {/* ── Header ── */}
                <div className="flex justify-between items-center border-b border-gray-100 bg-white" style={{ padding: '20px 24px' }}>
                    <div className="flex items-center gap-3">
                        <div className="bg-brand-50 text-brand-600 flex items-center justify-center shadow-sm" style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-btn)' }}>
                            <DollarSign size={20} className="stroke-[3px]" />
                        </div>
                        <h3 className="text-base font-black text-gray-900 tracking-tight uppercase">
                            {expense ? 'Sửa Phiếu Chi' : 'Ghi Phiếu Chi'}
                        </h3>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-red-500 bg-transparent hover:bg-red-50 transition-colors flex items-center justify-center" style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-btn)' }}>
                        <X size={20} strokeWidth={3} />
                    </button>
                </div>

                {/* ── Body ── */}
                <div className="p-6 overflow-y-auto custom-scrollbar flex-1 overflow-visible bg-white">
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
                    }} className="space-y-5">
                        
                        {/* Phân mục */}
                        <div>
                            <label className="block text-[11px] font-black uppercase text-gray-500 tracking-widest mb-1.5">Phân mục (Category)</label>
                            <select 
                                name="category" 
                                value={category} 
                                onChange={handleCategoryChange} 
                                className="w-full border border-gray-200 bg-gray-50/50 p-3 focus:bg-white focus:border-brand-600 outline-none font-bold text-gray-900 transition-all shadow-sm"
                                style={{ borderRadius: 'var(--radius-input)', minHeight: '44px' }}
                            >
                                <option value="Đầu tư & Máy móc">🎨 Chi phí Đầu tư (CapEx: Decor, Máy móc...)</option>
                                <option value="Khác">💸 Khác (Lặt vặt, Marketing...)</option>
                                <option disabled>──────────</option>
                                <option value="Mặt bằng (Cố định)">🏠 Mặt bằng & Vận hành (Cố định)</option>
                                <option value="Điện, Nước & Internet">⚡ Điện, Nước & Internet (Utilities)</option>
                                <option value="Lương, thưởng ngoài">👷 Lương bổng ngoài lề</option>
                            </select>
                        </div>

                        {/* Nội dung chi */}
                        <div className="relative">
                            <label className="block text-[11px] font-black uppercase text-gray-500 tracking-widest mb-1.5">Nội dung chi</label>
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
                                className={`w-full border border-gray-200 p-3 outline-none font-bold transition-all shadow-sm ${isFixed ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-white text-gray-900 focus:border-brand-600 focus:ring-4 focus:ring-brand-500/10'}`}
                                style={{ borderRadius: 'var(--radius-input)', minHeight: '44px' }}
                            />
                            {!isFixed && showSuggestions && suggestions.length > 0 && (
                                <div className="absolute top-[calc(100%+4px)] left-0 right-0 bg-white border border-gray-100 shadow-xl overflow-y-auto z-[60]" style={{ borderRadius: 'var(--radius-card)', maxHeight: '180px' }}>
                                    {suggestions.map((s, i) => (
                                        <div
                                            key={i}
                                            className="p-3 hover:bg-brand-50 cursor-pointer text-sm font-bold text-gray-700 border-b border-gray-50 last:border-none flex items-center justify-between group transition-colors"
                                            onMouseDown={(e) => { e.preventDefault(); setName(s); setShowSuggestions(false); }}
                                        >
                                            <span>{s}</span>
                                            <span className="text-[10px] text-brand-600 uppercase font-black opacity-0 group-hover:opacity-100 tracking-widest">Chọn</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Số tiền & Ngày */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[11px] font-black uppercase text-gray-500 tracking-widest mb-1.5">Số tiền (VNĐ)</label>
                                <CurrencyInput
                                    name="amount"
                                    defaultValue={expense?.amount}
                                    required
                                    min="0"
                                    placeholder="0"
                                    containerClassName="bg-white border-gray-200 shadow-sm transition-all focus-within:ring-4 focus-within:ring-brand-500/10"
                                    containerStyle={{ borderRadius: 'var(--radius-input)', minHeight: '44px' }}
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-black uppercase text-gray-500 tracking-widest mb-1.5">Ngày chi</label>
                                <input 
                                    type="date" 
                                    name="date" 
                                    defaultValue={expense?.date || getVNDateStr()} 
                                    required 
                                    className="w-full border border-gray-200 bg-white p-3 focus:border-brand-600 outline-none font-bold text-gray-900 transition-all shadow-sm focus:ring-4 focus:ring-brand-500/10"
                                    style={{ borderRadius: 'var(--radius-input)', minHeight: '44px' }}
                                />
                            </div>
                        </div>

                        {/* Ghi chú */}
                        <div>
                            <label className="block text-[11px] font-black uppercase text-gray-500 tracking-widest mb-1.5">Ghi chú thêm</label>
                            <textarea 
                                name="note" 
                                defaultValue={expense?.note} 
                                rows="3" 
                                placeholder="Chi tiết nếu cần..." 
                                className="w-full border border-gray-200 bg-white p-3 focus:border-brand-600 outline-none text-sm text-gray-900 transition-all shadow-sm focus:ring-4 focus:ring-brand-500/10"
                                style={{ borderRadius: 'var(--radius-input)' }}
                            />
                        </div>
                    </form>
                </div>

                {/* ── Footer ── */}
                <div className="border-t border-gray-100 bg-gray-50/50 flex gap-3" style={{ padding: '20px 24px' }}>
                    <button type="button" onClick={onClose} className="flex-1 bg-white border border-gray-200 text-gray-600 text-[12px] font-black uppercase tracking-widest hover:bg-gray-50 transition-colors shadow-sm" style={{ borderRadius: 'var(--radius-btn)', minHeight: '48px' }}>
                        HỦY
                    </button>
                    <button type="submit" form="expense-form" className="flex-[2] bg-brand-600 text-white text-[13px] font-black uppercase tracking-widest shadow-lg shadow-brand-500/25 hover:bg-brand-500 transition-all" style={{ borderRadius: 'var(--radius-btn)', minHeight: '48px' }}>
                        {expense ? 'CẬP NHẬT' : 'GHI PHIẾU CHI'}
                    </button>
                </div>

            </div>
        </div>
    );
};

export default ExpenseModal;
