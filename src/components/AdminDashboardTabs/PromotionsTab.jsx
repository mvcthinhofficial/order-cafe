import React from 'react';
import { motion } from 'framer-motion';
import { Gift, Plus, Trash2, Edit2, Calendar } from 'lucide-react';
import { formatVND, getVNDateStr } from '../../utils/dashboardUtils';
import { CustomSwitch } from './SettingsTab';

const PromotionsTab = ({ promotions, menu, settings, hasPermission, setEditPromo, deleteP, saveP }) => {
    return (
        <motion.section key="promotions" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} className="space-y-4 sm:space-y-6" style={{ marginTop: '20px' }}>
            {/* Toolbar */}
            <div className="flex justify-between items-center">
                <h3 className="text-base sm:text-xl font-black text-gray-900 uppercase tracking-widest flex items-center gap-2"><Gift size={18} className="text-brand-600" /> KHUYếN MÃI</h3>
                <button onClick={() => setEditPromo({ type: 'PROMO_CODE', discountType: 'PERCENT', discountValue: 0, minOrderValue: 0, isActive: true, applicableItems: ['ALL'] })}
                    className="bg-brand-600 text-white font-black flex items-center justify-center gap-1.5 shadow-md hover:shadow-lg hover:bg-brand-700 transition-all uppercase text-xs tracking-widest"
                    style={{ minHeight: '36px', borderRadius: 'var(--radius-btn)', padding: '0 12px' }}
                >
                    <Plus size={14} />
                    <span className="hidden sm:inline">THÊM KHUYẾN MÃI</span>
                    <span className="sm:hidden">THÊM</span>
                </button>
            </div>

            {promotions.length === 0 ? (
                <div className="py-20 flex flex-col items-center justify-center text-gray-400 bg-white border-2 border-dashed border-gray-200" style={{ borderRadius: 'var(--radius-card)', padding: 'var(--spacing-card-p)' }}>
                    <Gift size={64} className="mb-4 opacity-50 text-gray-300" />
                    <h3 className="text-base sm:text-xl font-black text-gray-500 mb-2">Chưa có khuyến mãi nào!</h3>
                    <p className="text-sm">Bấm THÊM MỚI để tạo chương trình giảm giá đầu tiên.</p>
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                    {promotions.map(p => (
                        <div key={p.id} className="bg-white shadow-sm border-2 border-gray-100 flex flex-col hover:shadow-xl hover:border-brand-100 transition-all group" style={{ borderRadius: 'var(--radius-card)', padding: 'clamp(10px, 3vw, 20px)' }}>
                            {/* Header \u2014 dots m\u00e0u theo lo\u1ea1i KM */}
                            <div className="flex w-full items-center justify-between shrink-0 mb-2 sm:mb-4">
                                <div className="flex gap-1.5 items-center">
                                    {/* M\u00e0u dots ph\u1ea3n \u00e1nh lo\u1ea1i KM */}
                                    <span className={`inline-block w-2.5 h-2.5 ${
                                        p.type === 'PROMO_CODE' ? 'bg-brand-500' :
                                        p.type === 'COMBO_GIFT' ? 'bg-green-500' :
                                        p.type === 'HAPPY_HOUR' ? 'bg-amber-500' : 'bg-pink-500'
                                    }`} style={{ borderRadius: '50%' }} />
                                    <span className={`inline-block w-2.5 h-2.5 ${
                                        p.type === 'PROMO_CODE' ? 'bg-brand-400' :
                                        p.type === 'COMBO_GIFT' ? 'bg-green-400' :
                                        p.type === 'HAPPY_HOUR' ? 'bg-amber-400' : 'bg-pink-400'
                                    }`} style={{ borderRadius: '50%' }} />
                                    <span className="bg-gray-200 inline-block w-2.5 h-2.5" style={{ borderRadius: '50%' }} />
                                </div>
                                <div className="scale-75 sm:scale-90 origin-right">
                                    <CustomSwitch isOn={p.isActive} onToggle={() => saveP({ ...p, isActive: !p.isActive })} />
                                </div>
                            </div>

                            {/* Content */}
                            <div className="flex flex-col justify-between flex-1">
                                <div className="pb-1 sm:pb-2">
                                    <div className="mb-2">
                                        <span className="text-[9px] font-black px-1.5 py-0.5 bg-brand-50 text-brand-600 uppercase tracking-widest inline-block" style={{ borderRadius: 'var(--radius-badge)' }}>
                                            {p.type === 'PROMO_CODE' ? 'MÃ GG' : p.type === 'COMBO_GIFT' ? 'TẶNG QUÀ' : p.type === 'HAPPY_HOUR' ? 'GIỜ VÀNG' : 'MUA TẶNG'}
                                        </span>
                                    </div>
                                    <h4 className="font-black text-gray-900 mb-1 sm:mb-3 leading-tight text-sm sm:text-base line-clamp-2" title={p.name}>{p.name}</h4>
                                    
                                    <div className="flex flex-col items-start gap-1 mb-1">
                                        {p.code && <p className="text-[10px] font-black text-brand-600 bg-brand-50 px-2 py-1 truncate border border-brand-200 leading-none inline-block w-fit max-w-full" style={{ borderRadius: 'var(--radius-badge)' }}>MÃ: {p.code}</p>}
                                        {p.ignoreGlobalDisable && <p className="text-[9px] font-black text-white bg-red-500 px-2 py-1 leading-none tracking-wider shadow-sm inline-block w-fit" style={{ borderRadius: 'var(--radius-badge)' }}>LUÔN BẬT</p>}
                                        {p.dailyLimit > 0 && <p className="text-[9px] font-bold text-gray-600 bg-gray-50 px-2 py-1 border border-gray-200 leading-none inline-block w-fit" style={{ borderRadius: 'var(--radius-badge)' }}>{(p.usageHistory && p.usageHistory[getVNDateStr()]) || 0}/{p.dailyLimit}</p>}
                                    </div>

                                    <div className="mt-2 sm:mt-4 space-y-0.5 bg-slate-50 border border-gray-100" style={{ padding: '8px', borderRadius: 'var(--radius-card)' }}>
                                        {p.type === 'PROMO_CODE' && <p className="text-xs text-gray-600 font-medium">Giảm: <span className="font-black text-gray-900">{p.discountType === 'PERCENT' ? `${p.discountValue}%` : `${p.discountValue}k`}</span> {p.maxDiscount > 0 && <span className="text-[10px]">(Max: {p.maxDiscount}k)</span>}</p>}
                                        {p.minOrderValue > 0 && <p className="text-xs text-gray-600 font-medium">Đơn TT: <span className="font-black text-gray-900">{p.minOrderValue}k</span></p>}
                                        {(p.giftItems || []).length > 0 && <p className="text-xs text-green-600 font-bold flex items-center gap-1"><Gift size={12}/> Tặng {p.giftItems.length} món</p>}
                                    </div>
                                </div>
                                <div className="mt-2 sm:mt-4 pt-2 sm:pt-4 border-t border-gray-100 flex items-center justify-between gap-2 opacity-100 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => setEditPromo(p)} className="text-brand-700 bg-brand-50 border border-brand-200 font-black text-xs tracking-widest uppercase hover:bg-brand-600 hover:text-white transition-all flex-1 text-center shadow-sm" style={{ borderRadius: 'var(--radius-btn)', minHeight: '36px' }}>CẬP NHẬT</button>
                                    {hasPermission('menu', 'edit') && (
                                        <button onClick={() => { if (window.confirm('Xóa CTKM này?')) deleteP(p.id) }} className="text-red-500 bg-red-50 border border-red-200 font-black hover:bg-red-500 hover:text-white transition-all w-[40px] text-center shadow-sm flex items-center justify-center shrink-0" style={{ borderRadius: 'var(--radius-btn)', minHeight: '36px' }}><Trash2 size={15}/></button>
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
