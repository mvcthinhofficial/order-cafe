import React from 'react';
import { motion } from 'framer-motion';
import { Gift, Plus, Trash2, Edit2, Calendar } from 'lucide-react';
import { formatVND, getVNDateStr } from '../../utils/dashboardUtils';
import { CustomSwitch } from './SettingsTab';

const PromotionsTab = ({ promotions, menu, settings, hasPermission, setEditPromo, deleteP, saveP }) => {
    return (
        <motion.section key="promotions" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} className="space-y-6" style={{ marginTop: '20px' }}>
            {/* Toolbar */}
            <div className="flex justify-between items-center">
                <h3 className="text-xl font-black text-gray-900 flex items-center gap-2"><Gift className="text-brand-600" /> Quản Lý Khuyến Mãi</h3>
                <button
                    onClick={() => setEditPromo({ type: 'PROMO_CODE', discountType: 'PERCENT', discountValue: 0, minOrderValue: 0, isActive: true, applicableItems: ['ALL'] })}
                    className="bg-brand-600 text-white px-5 font-bold border-b-4 border-brand-700 active:translate-y-1 active:border-b-0 hover:bg-brand-700 transition-all flex items-center gap-2"
                    style={{ minHeight: '40px', borderRadius: 'var(--radius-btn)' }}
                >
                    <Plus size={18} /> THÊM MỚI
                </button>
            </div>

            {promotions.length === 0 ? (
                <div className="py-20 flex flex-col items-center justify-center text-gray-400 bg-white border-2 border-dashed border-gray-200" style={{ borderRadius: 'var(--radius-card)', padding: 'var(--spacing-card-p)' }}>
                    <Gift size={64} className="mb-4 opacity-50 text-gray-300" />
                    <h3 className="text-xl font-bold text-gray-500 mb-2">Chưa có khuyến mãi nào!</h3>
                    <p className="text-sm">Bấm THÊM MỚI để tạo chương trình giảm giá đầu tiên.</p>
                </div>
            ) : (
                <div className="flex flex-wrap gap-5 px-1 py-1">
                    {promotions.map(p => (
                        <div key={p.id} className="bg-white shadow-sm border-2 border-gray-100 flex flex-col hover:shadow-xl hover:border-brand-100 transition-all group shrink-0" style={{ borderRadius: 'var(--radius-card)', minWidth: '280px', maxWidth: '300px', flex: '1 1 auto', padding: 'var(--spacing-card-p)' }}>
                            {/* Header — window dots */}
                            <div className="flex w-full items-center justify-between shrink-0 mb-4">
                                <div className="flex gap-2">
                                    <span className="bg-brand-500 inline-block w-3 h-3" style={{ borderRadius: '50%' }}></span>
                                    <span className="bg-brand-500 inline-block w-3 h-3" style={{ borderRadius: '50%' }}></span>
                                    <span className="bg-pink-500 inline-block w-3 h-3" style={{ borderRadius: '50%' }}></span>
                                </div>
                                <div className="scale-90 origin-right">
                                    <CustomSwitch isOn={p.isActive} onToggle={() => saveP({ ...p, isActive: !p.isActive })} />
                                </div>
                            </div>

                            {/* Content */}
                            <div className="flex flex-col justify-between flex-1">
                                <div className="pb-2">
                                    <div className="mb-3">
                                        <span className="text-[10px] font-black px-2 py-1 bg-brand-50 text-brand-600 uppercase tracking-widest inline-block" style={{ borderRadius: 'var(--radius-badge)' }}>
                                            {p.type === 'PROMO_CODE' ? 'MÃ GIẢM GIÁ' : p.type === 'COMBO_GIFT' ? 'TẶNG QUÀ ĐƠN' : p.type === 'HAPPY_HOUR' ? 'GIỜ VÀNG' : 'MUA X TẶNG Y'}
                                        </span>
                                    </div>
                                    <h4 className="font-black text-gray-900 mb-3 leading-tight text-lg line-clamp-2" title={p.name}>{p.name}</h4>
                                    
                                    <div className="flex flex-col items-start gap-1.5 mb-2">
                                        {p.code && <p className="text-[11px] font-black text-brand-600 bg-brand-50 px-2.5 py-1.5 truncate border border-brand-200 leading-none inline-block w-fit max-w-full" style={{ borderRadius: 'var(--radius-badge)' }}>MÃ: {p.code}</p>}
                                        {p.ignoreGlobalDisable && <p className="text-[10px] font-black text-white bg-red-500 px-2.5 py-1.5 leading-none tracking-wider shadow-sm inline-block w-fit" style={{ borderRadius: 'var(--radius-badge)' }}>LUÔN HOẠT ĐỘNG</p>}
                                        {p.dailyLimit > 0 && <p className="text-[10px] font-bold text-gray-600 bg-gray-50 px-2 py-1.5 border border-gray-200 leading-none inline-block w-fit" style={{ borderRadius: 'var(--radius-badge)' }}>Dùng hôm nay: {(p.usageHistory && p.usageHistory[getVNDateStr()]) || 0}/{p.dailyLimit}</p>}
                                    </div>

                                    <div className="mt-4 space-y-1 bg-slate-50 border border-gray-100" style={{ padding: '12px', borderRadius: 'var(--radius-card)' }}>
                                        {p.type === 'PROMO_CODE' && <p className="text-sm text-gray-600 font-medium">Giảm: <span className="font-black text-gray-900 text-[15px]">{p.discountType === 'PERCENT' ? `${p.discountValue}%` : `${p.discountValue}k`}</span> {p.maxDiscount > 0 && <span className="text-xs">(Max: {p.maxDiscount}k)</span>}</p>}
                                        {p.minOrderValue > 0 && <p className="text-sm text-gray-600 font-medium">Đơn TT: <span className="font-black text-gray-900 text-[15px]">{p.minOrderValue}k</span></p>}
                                        {(p.giftItems || []).length > 0 && <p className="text-sm text-green-600 font-bold flex items-center gap-1"><Gift size={14}/> Tặng {p.giftItems.length} món</p>}
                                    </div>
                                </div>
                                <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between gap-3 opacity-100 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => setEditPromo(p)} className="text-brand-700 bg-brand-50 border border-brand-200 font-black text-xs tracking-widest uppercase hover:bg-brand-600 hover:text-white transition-all flex-1 text-center shadow-sm" style={{ borderRadius: 'var(--radius-btn)', minHeight: '44px' }}>CẬP NHẬT</button>
                                    {hasPermission('menu', 'edit') && (
                                        <button onClick={() => { if (window.confirm('Xóa CTKM này?')) deleteP(p.id) }} className="text-red-500 bg-red-50 border border-red-200 font-black hover:bg-red-500 hover:text-white transition-all w-[56px] text-center shadow-sm flex items-center justify-center shrink-0" style={{ borderRadius: 'var(--radius-btn)', minHeight: '44px' }}><Trash2 size={18}/></button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </motion.section>
    );
};

export default PromotionsTab;
