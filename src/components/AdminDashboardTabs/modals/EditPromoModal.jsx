import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Gift, Save, CheckCircle } from 'lucide-react';
import { formatVND, getVNDateStr } from '../../../utils/dashboardUtils';
import { SERVER_URL } from '../../../api';

const CustomerAutocomplete = ({ customersUrl, value, onChange, onSelectCustomer }) => {
    const [open, setOpen] = React.useState(false);
    const [customers, setCustomers] = React.useState(null); // null means not loaded
    const [loading, setLoading] = React.useState(false);

    React.useEffect(() => {
        if (open && customers === null && !loading) {
            setLoading(true);
            const tok = localStorage.getItem('adminToken') || sessionStorage.getItem('adminToken');
            fetch(customersUrl, { headers: { Authorization: `Bearer ${tok}` } })
                .then(r => r.json())
                .then(d => { if (d.success) setCustomers(d.customers); })
                .catch(() => {})
                .finally(() => setLoading(false));
        }
    }, [open, customersUrl, customers, loading]);

    const filtered = (customers || []).filter(c => {
        const q = (value || '').toLowerCase();
        if (!q) return true;
        return (c.name && c.name.toLowerCase().includes(q)) || 
               (c.phone && c.phone.includes(q));
    });
    
    const displayList = filtered.slice(0, 40); // limit to keep it fast

    return (
        <div className="relative w-full">
            <input 
                type="text" 
                value={value || ''} 
                onChange={(e) => {
                    onChange(e.target.value);
                    setOpen(true);
                }} 
                onFocus={() => setOpen(true)}
                className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent focus:border-brand-600 font-bold text-gray-900 outline-none" 
                placeholder="Ví dụ: Gõ 'Jazz' hoặc '0905' để tìm tìm khách..." 
            />
            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)}></div>
                    <div className="absolute z-50 top-full mt-2 left-0 w-full max-h-[300px] overflow-y-auto bg-white border border-gray-200 shadow-xl rounded-xl p-2 custom-scrollbar">
                        {loading && <p className="text-xs text-gray-500 p-2 text-center font-bold bg-gray-50 rounded">Đang tải danh sách...</p>}
                        {!loading && displayList.map(c => (
                            <button key={c.id} type="button" onClick={() => { onSelectCustomer(c); setOpen(false); }} className={`w-full flex items-center justify-between text-left p-3 hover:bg-brand-50 rounded-lg mb-1 transition-colors border border-transparent hover:border-brand-200`}>
                                <p className="font-black text-sm text-gray-800 uppercase">{c.name}</p>
                                <p className="text-xs text-brand-600 font-bold font-mono bg-brand-50 px-2 py-0.5 rounded">{c.phone || '(Không có)'}</p>
                            </button>
                        ))}
                        {!loading && displayList.length === 0 && <p className="text-xs text-gray-500 p-2 text-center font-bold">Không khớp với khách hàng nào.</p>}
                    </div>
                </>
            )}
        </div>
    );
};

const EditPromoModal = ({ editPromo, setEditPromo, menu, settings, promotions, saveP }) => {
    return (
        <AnimatePresence>
                    {editPromo && (
                        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 sm:p-6 bg-black/40 backdrop-blur-sm">
                            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} className="bg-white w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl relative" style={{ borderRadius: "16px" }}>
                                <div className="border-b border-gray-100 flex justify-between items-center bg-gray-50 flex-shrink-0" style={{ padding: "clamp(12px, 3vw, 20px)", borderRadius: "16px 16px 0 0" }}>
                                    <h2 className="text-base md:text-xl font-black text-gray-800 uppercase tracking-widest flex items-center gap-2"><Gift size={18} className="md:hidden text-brand-600" /><Gift size={24} className="hidden md:block text-brand-600" /> {editPromo.id ? 'Sửa Khuyến Mãi' : 'Tạo Khuyến Mãi'}</h2>
                                    <button onClick={() => setEditPromo(null)} className="p-2 hover:bg-gray-200 text-gray-500 transition-colors"><X size={20} /></button>
                                </div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar" style={{ padding: 'clamp(10px, 3vw, 20px)' }}>
                                    <div className="space-y-4 md:space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="col-span-1 md:col-span-2">
                                            <label className="block text-xs font-black tracking-widest text-brand-600 mb-2 uppercase">Loại Chương Trình</label>
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                                {[
                                                    { id: 'PROMO_CODE', label: 'Mã Giảm Giá', desc: 'Khách nhập mã' },
                                                    { id: 'ORDER_DISCOUNT', label: 'Giảm Theo Đơn', desc: 'Đơn >= X → Giảm tự động' },
                                                    { id: 'DISCOUNT_ON_CATEGORY', label: 'Giảm Theo Danh Mục', desc: 'Giảm % / tiền theo loại' },
                                                    { id: 'COMBO_GIFT', label: 'Tặng Quà Theo Đơn', desc: 'Đơn >= X → Tặng món' },
                                                    { id: 'HAPPY_HOUR', label: 'Khung Giờ Vàng', desc: 'Giảm / tặng theo giờ' },
                                                    { id: 'BUY_X_GET_Y', label: 'Mua X Tặng Y', desc: 'Mua đủ số lượng → Tặng' },
                                                    { id: 'LOYALTY_REWARD', label: '🎁 Đổi Điểm Thưởng', desc: 'Hiển thị trên trang điểm khách' },
                                                ].map(t => (
                                                    <button key={t.id} onClick={() => setEditPromo({ ...editPromo, type: t.id })} className={`p-2 md:p-3 text-left border-2 rounded-lg transition-all ${editPromo.type === t.id ? 'border-brand-600 bg-brand-50 text-brand-600 shadow-sm' : 'border-gray-100 text-gray-500 hover:border-gray-300'}`}>
                                                        <p className="text-xs md:text-sm font-bold">{t.label}</p>
                                                        <p className={`text-[9px] md:text-[10px] mt-0.5 hidden sm:block ${editPromo.type === t.id ? 'text-brand-400' : 'text-gray-400'}`}>{t.desc}</p>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="col-span-1 md:col-span-2">
                                            <label className="block text-xs font-black tracking-widest text-gray-500 mb-2 uppercase">Tên Chương Trình (VD: Khai trương giảm 10%)</label>
                                            <input type="text" value={editPromo.name || ''} onChange={(e) => setEditPromo({ ...editPromo, name: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent focus:border-brand-600 focus:bg-white font-bold text-gray-900 outline-none transition-all rounded-lg" placeholder="Nhập tên dễ nhớ..." />
                                        </div>
                                        <div className="col-span-1">
                                            <label className="block text-xs font-black tracking-widest text-gray-500 mb-2 uppercase">Từ Ngày (Bắt Đầu)</label>
                                            <input type="date" value={editPromo.startDate || ''} onChange={(e) => setEditPromo({ ...editPromo, startDate: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent focus:border-brand-600 focus:bg-white font-bold text-gray-900 outline-none transition-all" />
                                        </div>
                                        <div className="col-span-1">
                                            <label className="block text-xs font-black tracking-widest text-gray-500 mb-2 uppercase">Đến Ngày (Kết Thúc)</label>
                                            <input type="date" value={editPromo.endDate || ''} onChange={(e) => setEditPromo({ ...editPromo, endDate: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent focus:border-brand-600 focus:bg-white font-bold text-gray-900 outline-none transition-all" />
                                        </div>

                                        {editPromo.type === 'LOYALTY_REWARD' && (
                                            <>
                                                <div className="col-span-1 md:col-span-2 bg-purple-50 border border-purple-100 rounded-xl p-4">
                                                    <p className="text-xs font-black text-purple-700 uppercase tracking-widest mb-3">🎁 Cấu Hình Phần Thưởng Điểm</p>
                                                    <p className="text-[10px] text-purple-500 mb-4 font-bold">Phần thưởng này sẽ hiển thị nổi bật trên trang điểm thành viên. Khách nhờ nhân viên đổi khi đủ điểm.</p>
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div>
                                                            <label className="block text-xs font-black tracking-widest text-purple-600 mb-1.5 uppercase">Điểm Cần Để Đổi</label>
                                                            <input type="number" min="1" value={editPromo.pointsCost || ''} onChange={(e) => setEditPromo({ ...editPromo, pointsCost: Number(e.target.value) })} className="w-full px-3 py-2.5 bg-white border-2 border-purple-200 focus:border-purple-500 font-black text-purple-700 outline-none rounded-lg text-center text-lg" placeholder="10" />
                                                            <p className="text-[10px] text-purple-400 mt-1 font-bold text-center">10.000đ = 1 điểm</p>
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-black tracking-widest text-purple-600 mb-1.5 uppercase">Icon Hiển Thị</label>
                                                            <div className="grid grid-cols-5 gap-1.5">
                                                                {['☕','🍵','🥤','🎁','🏷️','👑','🎂','🍰','⭐','💎'].map(icon => (
                                                                    <button key={icon} type="button"
                                                                        onClick={() => setEditPromo({ ...editPromo, rewardIcon: icon })}
                                                                        className={`text-lg p-1.5 rounded-lg border-2 transition-all ${editPromo.rewardIcon === icon ? 'border-purple-500 bg-purple-100 shadow-sm' : 'border-gray-100 bg-white hover:border-purple-300'}`}>
                                                                        {icon}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="mt-3">
                                                        <label className="block text-xs font-black tracking-widest text-purple-600 mb-1.5 uppercase">Mô Tả Ngắn (hiển thị cho khách)</label>
                                                        <input type="text" value={editPromo.rewardDesc || ''} onChange={(e) => setEditPromo({ ...editPromo, rewardDesc: e.target.value })} className="w-full px-3 py-2.5 bg-white border-2 border-purple-200 focus:border-purple-500 font-bold text-gray-800 outline-none rounded-lg" placeholder="VD: Bất kỳ món size S, Áp dụng 1 đơn..." />
                                                    </div>
                                                    <div className="mt-3">
                                                        <label className="block text-xs font-black tracking-widest text-purple-600 mb-1.5 uppercase">Điều Kiện Hạng Tối Thiểu (tùy chọn)</label>
                                                        <div className="flex gap-2">
                                                            {[{ v: '', l: 'Tất cả' }, { v: 'Bạc', l: '🥈 Bạc' }, { v: 'Vàng', l: '🥇 Vàng' }, { v: 'Kim Cương', l: '💎 Kim Cương' }].map(opt => (
                                                                <button key={opt.v} type="button"
                                                                    onClick={() => setEditPromo({ ...editPromo, minTier: opt.v })}
                                                                    className={`flex-1 py-2 text-xs font-bold rounded-lg border-2 transition-all ${(editPromo.minTier || '') === opt.v ? 'border-purple-500 bg-purple-100 text-purple-700' : 'border-gray-100 text-gray-500 hover:border-purple-200'}`}>
                                                                    {opt.l}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {/* ─── Liên kết Khuyến Mãi ─── */}
                                                    <div className="mt-4 pt-4 border-t border-purple-100">
                                                        <label className="block text-xs font-black tracking-widest text-indigo-600 mb-1.5 uppercase flex items-center gap-1.5">
                                                            🔗 Liên Kết Chương Trình Khuyến Mãi
                                                            <span className="text-[9px] text-gray-400 font-normal normal-case tracking-normal">(tùy chọn)</span>
                                                        </label>
                                                        <p className="text-[10px] text-indigo-400 mb-2 font-bold">
                                                            Khi admin đổi điểm, hệ thống tự tạo <strong>1 voucher single-use</strong> từ chương trình đã chọn và giao cho khách. Linh hoạt: giảm %, trừ tiền, tặng món...
                                                        </p>
                                                        <select
                                                            value={editPromo.linkedPromoId || ''}
                                                            onChange={(e) => setEditPromo({ ...editPromo, linkedPromoId: e.target.value || null })}
                                                            className="w-full px-3 py-2.5 bg-white border-2 border-indigo-200 focus:border-indigo-500 font-bold text-gray-800 outline-none rounded-lg text-sm"
                                                        >
                                                            <option value="">-- Không liên kết (chỉ trừ điểm) --</option>
                                                            {(promotions || [])
                                                                .filter(p => p.isActive && (p.isLoyaltyOnly || (p.type === 'PROMO_CODE' && !p.isLoyaltyOnly && false)))
                                                                .map(p => {
                                                                    const typeLabel = p.type === 'PROMO_CODE'
                                                                        ? (p.discountType === 'PERCENT' ? `Giảm ${p.discountValue}%` : p.discountType === 'AMOUNT' ? `Trừ ${p.discountValue}k` : '')
                                                                        : p.type === 'COMBO_GIFT' ? 'Tặng món'
                                                                        : p.type === 'HAPPY_HOUR' ? 'Khung giờ vàng'
                                                                        : p.type === 'BUY_X_GET_Y' ? 'Mua X Tặng Y'
                                                                        : p.type;
                                                                    return (
                                                                        <option key={p.id} value={p.id}>
                                                                            {p.name} — {typeLabel}{p.code ? ` [${p.code}]` : ''}
                                                                        </option>
                                                                    );
                                                                })
                                                            }
                                                        </select>
                                                        {editPromo.linkedPromoId && (
                                                            <p className="text-[10px] text-indigo-600 mt-1.5 font-bold flex items-center gap-1">
                                                                ✓ Khi đổi điểm → hệ thống tự tạo mã voucher 1 lần dùng giao cho nhân viên.
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            </>
                                        )}

                                        {editPromo.type === 'PROMO_CODE' && (
                                            <>
                                                <div>
                                                    <label className="block text-xs font-black tracking-widest text-gray-500 mb-2 uppercase">Mã (Cần Viết Liền)</label>
                                                    <input type="text" value={editPromo.code || ''} onChange={(e) => setEditPromo({ ...editPromo, code: e.target.value.toUpperCase().replace(/\s/g, '') })} className="w-full px-4 py-3 bg-brand-50 border-2 border-brand-200 focus:border-brand-600 font-black text-brand-700 tracking-wider outline-none transition-all uppercase placeholder:font-bold placeholder:text-brand-300" placeholder="VD: SALE10" />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-black tracking-widest text-gray-500 mb-2 uppercase">Hình Thức Giảm</label>
                                                    <div className="flex bg-gray-100 p-1">
                                                        <button onClick={() => setEditPromo({ ...editPromo, discountType: 'PERCENT' })} className={`flex-1 py-2 font-bold text-sm rounded-md transition-all ${editPromo.discountType !== 'AMOUNT' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>% GIÁ TRỊ</button>
                                                        <button onClick={() => setEditPromo({ ...editPromo, discountType: 'AMOUNT' })} className={`flex-1 py-2 font-bold text-sm rounded-md transition-all ${editPromo.discountType === 'AMOUNT' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>TRỪ TIỀN</button>
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-black tracking-widest text-gray-500 mb-2 uppercase">Mức Giảm {editPromo.discountType === 'AMOUNT' ? '(VNĐ)' : '(%)'}</label>
                                                    <input type="number" min="0" value={editPromo.discountValue || 0} onChange={(e) => setEditPromo({ ...editPromo, discountValue: Number(e.target.value) })} className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent focus:border-brand-600 font-bold text-gray-900 outline-none" />
                                                </div>
                                                {editPromo.discountType !== 'AMOUNT' && (
                                                    <div>
                                                        <label className="block text-xs font-black tracking-widest text-gray-500 mb-2 uppercase">Giảm Tối Đa (Ngàn Đồng)</label>
                                                        <input type="number" min="0" value={editPromo.maxDiscount || 0} onChange={(e) => setEditPromo({ ...editPromo, maxDiscount: Number(e.target.value) })} className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent focus:border-brand-600 font-bold text-gray-900 outline-none" placeholder="0 = Không giới hạn" />
                                                    </div>
                                                )}
                                                <div className="border-t border-gray-100 mt-2" style={{ paddingTop: '8px' }}>
                                                    <label className="flex items-center gap-2 cursor-pointer mb-2">
                                                        <input type="checkbox" checked={editPromo.ignoreGlobalDisable || false} onChange={e => setEditPromo({ ...editPromo, ignoreGlobalDisable: e.target.checked })} className="w-4 h-4 text-brand-600 cursor-pointer" />
                                                        <span className="text-xs font-black tracking-widest text-brand-600 uppercase mt-0.5">Luôn Hoạt Động (Bỏ qua tắt Khuyến Mãi)</span>
                                                    </label>
                                                    <p className="text-[10px] text-gray-400 font-bold mb-4 ml-6">Mã này vẫn dùng được ngay cả khi đã tắt tính năng Khuyến Mãi chung.</p>

                                                    <label className="flex items-center gap-2 cursor-pointer mb-2">
                                                        <input type="checkbox" checked={editPromo.singleUse || false} onChange={e => setEditPromo({ ...editPromo, singleUse: e.target.checked })} className="w-4 h-4 text-brand-600 cursor-pointer" />
                                                        <span className="text-xs font-black tracking-widest text-brand-600 uppercase mt-0.5">Mã dùng 1 lần (Tự động vô hiệu hóa sau khi dùng)</span>
                                                    </label>

                                                    {/* ─ isLoyaltyOnly ─ */}
                                                    <label className="flex items-center gap-2 cursor-pointer mb-1 mt-2">
                                                        <input type="checkbox" checked={editPromo.isLoyaltyOnly || false} onChange={e => setEditPromo({ ...editPromo, isLoyaltyOnly: e.target.checked })} className="w-4 h-4 text-purple-600 cursor-pointer accent-purple-600" />
                                                        <span className="text-xs font-black tracking-widest text-purple-700 uppercase mt-0.5">🎁 Chỉ dùng cho Đổi Điểm Thưởng</span>
                                                    </label>
                                                    {editPromo.isLoyaltyOnly ? (
                                                        <p className="text-[10px] text-purple-500 font-bold mb-3 ml-6">
                                                            Khách không thể tự nhập mã này. Hệ thống tự động tạo mã 1 lần dùng khi admin đổi điểm cho khách.
                                                        </p>
                                                    ) : (
                                                        <p className="text-[10px] text-gray-400 font-bold mb-3 ml-6">
                                                            Tick vào để chỉ dùng mã này trong chương trình đổi điểm.
                                                        </p>
                                                    )}

                                                    <label className="block text-xs font-black tracking-widest text-gray-500 mb-2 mt-4 uppercase">Dành riêng cho Khách Hàng (Tùy chọn)</label>
                                                    <CustomerAutocomplete 
                                                        customersUrl={`${SERVER_URL}/api/loyalty/admin/customers`}
                                                        value={editPromo.specificPhone}
                                                        onChange={(val) => setEditPromo({ ...editPromo, specificPhone: val })}
                                                        onSelectCustomer={(c) => {
                                                            setEditPromo({ ...editPromo, specificPhone: c.phone || '', specificCustomerName: c.name, specificCustomerId: c.id });
                                                        }}
                                                    />
                                                    {editPromo.specificCustomerName && <p className="text-xs text-brand-600 mt-1.5 font-bold ml-1 flex items-center gap-1.5"><CheckCircle size={14} /> Điền nhanh thành công SĐT của: {editPromo.specificCustomerName}</p>}

                                                    <label className="block text-xs font-black tracking-widest text-gray-500 mb-2 mt-4 uppercase">Giới Hạn Dùng / Ngày (Lượt)</label>
                                                    <input type="number" min="0" value={editPromo.dailyLimit || ''} onChange={(e) => setEditPromo({ ...editPromo, dailyLimit: e.target.value === '' ? '' : Number(e.target.value) })} className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent focus:border-brand-600 font-bold text-gray-900 outline-none" placeholder="Để trống = Không giới hạn" />
                                                </div>
                                            </>
                                        )}

                                        {editPromo.type === 'HAPPY_HOUR' && (
                                            <>
                                                <div>
                                                    <label className="block text-xs font-black tracking-widest text-gray-500 mb-2 uppercase">Giờ Bắt Đầu</label>
                                                    <input type="time" value={(editPromo.validHours || [])[0] || '08:00'} onChange={(e) => setEditPromo({ ...editPromo, validHours: [e.target.value, (editPromo.validHours || [])[1] || '10:00'] })} className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent font-bold" />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-black tracking-widest text-gray-500 mb-2 uppercase">Giờ Kết Thúc</label>
                                                    <input type="time" value={(editPromo.validHours || [])[1] || '10:00'} onChange={(e) => setEditPromo({ ...editPromo, validHours: [(editPromo.validHours || [])[0] || '08:00', e.target.value] })} className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent font-bold" />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-black tracking-widest text-gray-500 mb-2 uppercase">Hình Thức Ưu Đãi</label>
                                                    <div className="flex bg-gray-100 p-1">
                                                        <button onClick={() => setEditPromo({ ...editPromo, discountType: 'PERCENT' })} className={`flex-1 py-2 font-bold text-sm rounded-md transition-all ${editPromo.discountType !== 'AMOUNT' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>% GIÁ TRỊ</button>
                                                        <button onClick={() => setEditPromo({ ...editPromo, discountType: 'AMOUNT' })} className={`flex-1 py-2 font-bold text-sm rounded-md transition-all ${editPromo.discountType === 'AMOUNT' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>TIỀN MẶT</button>
                                                        <button onClick={() => setEditPromo({ ...editPromo, discountType: 'GIFT' })} className={`flex-1 py-2 font-bold text-sm rounded-md transition-all ${editPromo.discountType === 'GIFT' ? 'bg-white shadow text-green-700' : 'text-gray-500'}`}>TẶNG QUÀ</button>
                                                    </div>
                                                </div>
                                                {editPromo.discountType !== 'GIFT' && (
                                                    <div>
                                                        <label className="block text-xs font-black tracking-widest text-gray-500 mb-2 uppercase">Mức Giảm {editPromo.discountType === 'AMOUNT' ? '(Ngàn Đồng)' : '(%)'}</label>
                                                        <input type="number" min="0" value={editPromo.discountValue || 0} onChange={(e) => setEditPromo({ ...editPromo, discountValue: Number(e.target.value) })} className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent focus:border-brand-600 font-bold text-gray-900 outline-none" />
                                                    </div>
                                                )}
                                                {editPromo.discountType === 'GIFT' && (
                                                    <div>
                                                        <label className="block text-xs font-black tracking-widest text-green-600 mb-2 uppercase">Số Phần Quà Tặng</label>
                                                        <input type="number" min="1" value={editPromo.giftQuantity || 1} onChange={(e) => setEditPromo({ ...editPromo, giftQuantity: Number(e.target.value) })} className="w-full px-4 py-3 bg-green-50 text-green-700 font-bold outline-none border border-green-200" />
                                                    </div>
                                                )}
                                            </>
                                        )}

                                        {editPromo.type === 'BUY_X_GET_Y' && (
                                            <>
                                                <div>
                                                    <label className="block text-xs font-black tracking-widest text-gray-500 mb-2 uppercase">Mua [X] Sản Phẩm</label>
                                                    <input type="number" min="1" value={editPromo.requiredQuantity || 1} onChange={(e) => setEditPromo({ ...editPromo, requiredQuantity: Number(e.target.value) })} className="w-full px-4 py-3 bg-gray-50 font-bold outline-none" />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-black tracking-widest text-green-600 mb-2 uppercase">Tặng [Y] Phần Quà</label>
                                                    <input type="number" min="1" value={editPromo.giftQuantity || 1} onChange={(e) => setEditPromo({ ...editPromo, giftQuantity: Number(e.target.value) })} className="w-full px-4 py-3 bg-green-50 text-green-700 font-bold outline-none border border-green-200" />
                                                </div>
                                            </>
                                        )}

                                        {/* ORDER_DISCOUNT: Giảm thẳng hóa đơn khi đạt ngưỡng */}
                                        {editPromo.type === 'ORDER_DISCOUNT' && (
                                            <>
                                                <div>
                                                    <label className="block text-xs font-black tracking-widest text-gray-500 mb-2 uppercase">Hình Thức Giảm</label>
                                                    <div className="flex bg-gray-100 p-1">
                                                        <button onClick={() => setEditPromo({ ...editPromo, discountType: 'PERCENT' })} className={`flex-1 py-2 font-bold text-sm rounded-md transition-all ${editPromo.discountType !== 'AMOUNT' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>% GIÁ TRỊ</button>
                                                        <button onClick={() => setEditPromo({ ...editPromo, discountType: 'AMOUNT' })} className={`flex-1 py-2 font-bold text-sm rounded-md transition-all ${editPromo.discountType === 'AMOUNT' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>TRỪ TIỀN</button>
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-black tracking-widest text-gray-500 mb-2 uppercase">Mức Giảm {editPromo.discountType === 'AMOUNT' ? '(Ngàn Đồng)' : '(%)'}</label>
                                                    <input type="number" min="0" value={editPromo.discountValue || 0} onChange={(e) => setEditPromo({ ...editPromo, discountValue: Number(e.target.value) })} className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent focus:border-brand-600 font-bold text-gray-900 outline-none" />
                                                </div>
                                                {editPromo.discountType !== 'AMOUNT' && (
                                                    <div>
                                                        <label className="block text-xs font-black tracking-widest text-gray-500 mb-2 uppercase">Giảm Tối Đa (Ngàn Đồng, 0 = không giới hạn)</label>
                                                        <input type="number" min="0" value={editPromo.maxDiscount || 0} onChange={(e) => setEditPromo({ ...editPromo, maxDiscount: Number(e.target.value) })} className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent focus:border-brand-600 font-bold text-gray-900 outline-none" />
                                                    </div>
                                                )}
                                            </>
                                        )}

                                        {/* DISCOUNT_ON_CATEGORY: Giảm theo danh mục */}
                                        {editPromo.type === 'DISCOUNT_ON_CATEGORY' && (
                                            <>
                                                <div className="col-span-1 md:col-span-2">
                                                    <label className="block text-xs font-black tracking-widest text-orange-600 mb-2 uppercase">Chọn Danh Mục Áp Dụng</label>
                                                    <div className="flex flex-wrap gap-2">
                                                        {[...new Set(menu.filter(m => !m.isDeleted).map(m => m.category).filter(Boolean))].map(cat => (
                                                            <button key={cat} onClick={() => setEditPromo({ ...editPromo, targetCategory: cat })}
                                                                className={`px-3 py-2 text-xs font-bold rounded-md border transition-all ${editPromo.targetCategory === cat ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-600 border-gray-200 hover:border-orange-300'}`}>
                                                                {cat}
                                                            </button>
                                                        ))}
                                                    </div>
                                                    {editPromo.targetCategory && <p className="text-xs text-orange-500 mt-2 font-bold">Đang chọn: {editPromo.targetCategory}</p>}
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-black tracking-widest text-gray-500 mb-2 uppercase">Hình Thức Giảm</label>
                                                    <div className="flex bg-gray-100 p-1">
                                                        <button onClick={() => setEditPromo({ ...editPromo, discountType: 'PERCENT' })} className={`flex-1 py-2 font-bold text-sm rounded-md transition-all ${editPromo.discountType !== 'AMOUNT' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>% GIÁ TRỊ</button>
                                                        <button onClick={() => setEditPromo({ ...editPromo, discountType: 'AMOUNT' })} className={`flex-1 py-2 font-bold text-sm rounded-md transition-all ${editPromo.discountType === 'AMOUNT' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>TRỪ TIỀN</button>
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-black tracking-widest text-gray-500 mb-2 uppercase">Mức Giảm {editPromo.discountType === 'AMOUNT' ? '(Ngàn Đồng)' : '(%)'}</label>
                                                    <input type="number" min="0" value={editPromo.discountValue || 0} onChange={(e) => setEditPromo({ ...editPromo, discountValue: Number(e.target.value) })} className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent focus:border-brand-600 font-bold text-gray-900 outline-none" />
                                                </div>
                                                {editPromo.discountType !== 'AMOUNT' && (
                                                    <div>
                                                        <label className="block text-xs font-black tracking-widest text-gray-500 mb-2 uppercase">Giảm Tối Đa (Ngàn Đồng, 0 = không giới hạn)</label>
                                                        <input type="number" min="0" value={editPromo.maxDiscount || 0} onChange={(e) => setEditPromo({ ...editPromo, maxDiscount: Number(e.target.value) })} className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent focus:border-brand-600 font-bold text-gray-900 outline-none" />
                                                    </div>
                                                )}
                                            </>
                                        )}

                                        {/* Hóa đơn tối thiểu - ẩn cho DISCOUNT_ON_CATEGORY */}
                                        {editPromo.type !== 'DISCOUNT_ON_CATEGORY' && (
                                            <div>
                                                <label className="block text-xs font-black tracking-widest text-gray-500 mb-2 uppercase">Hóa Đơn Tối Thiểu (Ngàn Đồng)</label>
                                                <input type="number" min="0" value={editPromo.minOrderValue || 0} onChange={(e) => setEditPromo({ ...editPromo, minOrderValue: Number(e.target.value) })} className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent focus:border-brand-600 font-bold text-gray-900 outline-none" />
                                            </div>
                                        )}

                                        <div className="col-span-1 md:col-span-2 mt-4 space-y-4">
                                            {/* Chọn món quà tặng */}
                                            {(editPromo.type === 'COMBO_GIFT' || (editPromo.type === 'HAPPY_HOUR' && editPromo.discountType === 'GIFT') || editPromo.type === 'BUY_X_GET_Y') && (
                                                <div className="bg-green-50 border border-green-100 rounded-xl" style={{ padding: '16px' }}>
                                                    <label className="block text-xs font-black tracking-widest text-green-700 mb-3 uppercase flex items-center gap-2"><Gift size={16} /> Chọn Món Được Tặng (0đ)</label>
                                                    <div className="flex flex-wrap gap-2">
                                                        {menu.filter(m => !m.isDeleted).map(m => (
                                                            <button key={`g-${m.id}`} onClick={() => {
                                                                const gifts = editPromo.giftItems || [];
                                                                setEditPromo({ ...editPromo, giftItems: gifts.includes(m.id) ? gifts.filter(g => g !== m.id) : [...gifts, m.id] });
                                                            }} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all border ${(editPromo.giftItems || []).includes(m.id) ? 'bg-green-600 text-white border-green-600 shadow' : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
                                                                }`}>
                                                                {m.name}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Chọn món áp dụng KM (áp dụng cho một số loại) */}
                                            {(editPromo.type === 'PROMO_CODE' || editPromo.type === 'BUY_X_GET_Y' || editPromo.type === 'HAPPY_HOUR') && (
                                                <div className="bg-brand-50 border border-brand-100 rounded-xl" style={{ padding: '16px' }}>
                                                    <label className="block text-xs font-black tracking-widest text-brand-700 mb-1 uppercase flex items-center gap-2">
                                                        <CheckCircle size={16} />
                                                        {editPromo.type === 'BUY_X_GET_Y' ? 'Món Bắt Buộc Phải Mua (để được tặng)' : 'Áp Dụng Cho Món'}
                                                    </label>
                                                    <p className="text-[10px] text-brand-500 mb-3">
                                                        {editPromo.type === 'BUY_X_GET_Y'
                                                            ? 'Chọn cụ thể món nào khách phải mua. Để trống = tất cả món đều tính.'
                                                            : 'Chọn món được áp dụng KM. Để trống = toàn menu.'}
                                                    </p>
                                                    {/* Toggle TẤT CẢ MENU */}
                                                    <button
                                                        onClick={() => setEditPromo({
                                                            ...editPromo, applicableItems:
                                                                (editPromo.applicableItems || []).includes('ALL') ? [] : ['ALL']
                                                        })}
                                                        className={`mr-2 mb-2 px-3 py-1.5 text-xs font-bold rounded-md transition-all border ${(editPromo.applicableItems || []).includes('ALL')
                                                            ? 'bg-brand-600 text-white border-brand-600 shadow'
                                                            : 'bg-white text-gray-400 border-gray-200 hover:border-brand-300'
                                                            }`}
                                                    >
                                                        {(editPromo.applicableItems || []).includes('ALL') ? '✓ TẤT CẢ MENU (nhấn để chọn riêng)' : 'TẤT CẢ MENU'}
                                                    </button>

                                                    {/* Danh sách món cụ thể — chỉ hiện khi không chọn ALL */}
                                                    {!(editPromo.applicableItems || []).includes('ALL') && (
                                                        <div className="flex flex-wrap gap-2 border-t border-brand-200/50" style={{ paddingTop: '12px' }}>
                                                            {menu.filter(m => !m.isDeleted).map(m => (
                                                                <button key={`a-${m.id}`} onClick={() => {
                                                                    const items = (editPromo.applicableItems || []).filter(i => i !== 'ALL');
                                                                    setEditPromo({ ...editPromo, applicableItems: items.includes(m.id) ? items.filter(g => g !== m.id) : [...items, m.id] });
                                                                }} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all border ${(editPromo.applicableItems || []).includes(m.id) ? 'bg-brand-600 text-white border-brand-600 shadow' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'
                                                                    }`}>
                                                                    {m.name}
                                                                </button>
                                                            ))}
                                                            {((editPromo.applicableItems || []).filter(i => i !== 'ALL')).length > 0 && (
                                                                <p className="w-full text-[10px] text-brand-600 font-bold mt-1">
                                                                    ✓ Đã chọn {(editPromo.applicableItems || []).filter(i => i !== 'ALL').length} món
                                                                </p>
                                                            )}
                                                            {((editPromo.applicableItems || []).filter(i => i !== 'ALL')).length === 0 && (
                                                                <p className="w-full text-[10px] text-gray-400 italic mt-1">
                                                                    * Chưa chọn → tính tất cả món (tương đương TẤT CẢ MENU)
                                                                </p>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    </div>
                                </div>
                                <div className="border-t border-gray-100 flex justify-end gap-2 bg-gray-50 align-end flex-shrink-0" style={{ padding: "clamp(10px, 3vw, 16px)", borderRadius: "0 0 16px 16px" }}>
                                    <button onClick={() => setEditPromo(null)} className="px-5 py-2.5 font-bold text-gray-500 hover:bg-gray-200 transition-all rounded-lg">Hủy</button>
                                    <button onClick={() => {
                                        if (!editPromo.name) return alert('Vui lòng nhập tên CTKM');
                                        if (editPromo.type === 'DISCOUNT_ON_CATEGORY' && !editPromo.targetCategory) return alert('Vui lòng chọn danh mục áp dụng');
                                        saveP(editPromo);
                                    }} className="bg-brand-600 text-white px-6 py-2.5 font-bold shadow-lg shadow-brand-500/30 flex items-center gap-2 hover:bg-brand-600 transition-all rounded-lg">
                                        <Save size={18} /> LƯU
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
        </AnimatePresence>
    );
};

export default EditPromoModal;
