import React from 'react';
import { motion } from 'framer-motion';
import { Gift, Plus, Trash2, Edit2, Calendar } from 'lucide-react';
import { formatVND, getVNDateStr } from '../../utils/dashboardUtils';
import { CustomSwitch } from './SettingsTab';

const PromotionsTab = ({ promotions, menu, settings, hasPermission, setEditPromo, deleteP, saveP }) => {
                            <motion.section key="promotions" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} className="space-y-6" style={{ paddingLeft: '32px', paddingRight: '32px' }}>
                                {/* Toolbar */}
                                <div className="flex justify-between items-center">
                                    <h3 className="text-xl font-black text-gray-900 flex items-center gap-2"><Gift className="text-brand-600" /> Quản Lý Khuyến Mãi</h3>
                                    <button onClick={() => setEditPromo({ type: 'PROMO_CODE', discountType: 'PERCENT', discountValue: 0, minOrderValue: 0, isActive: true, applicableItems: ['ALL'] })} className="bg-brand-600 text-white px-4 py-2 rounded-none border-b-4 border-brand-700 font-bold active:translate-y-1 active:border-b-0 hover:bg-brand-600 transition-all flex items-center gap-2">
                                        <Plus size={18} /> THÊM MỚI
                                    </button>
                                </div>

                                {promotions.length === 0 ? (
                                    <div className="py-20 flex flex-col items-center justify-center text-gray-400">
                                        <Gift size={64} className="mb-4 opacity-50 text-gray-300" />
                                        <h3 className="text-xl font-bold text-gray-500 mb-2">Chưa có khuyến mãi nào!</h3>
                                        <p className="text-sm">Bấm THÊM MỚI để tạo chương trình giảm giá đầu tiên.</p>
                                    </div>
                                ) : (
                                    <div className="flex flex-wrap gap-5 px-1">
                                        {promotions.map(p => (
                                            <div key={p.id} className="bg-white rounded-none shadow-md border border-gray-100 flex flex-col hover:shadow-lg transition-all group overflow-hidden w-48 shrink-0">
                                                {/* Header */}
                                                <div className="flex w-full items-center justify-between px-[8px] pt-[8px] pb-1 shrink-0">
                                                    <div className="flex gap-[6px] pl-1">
                                                        <span className="bg-brand-500 inline-block w-[10px] h-[10px] rounded-none"></span>
                                                        <span className="bg-brand-500 inline-block w-[10px] h-[10px] rounded-none"></span>
                                                        <span className="bg-pink-500 inline-block w-[10px] h-[10px] rounded-none"></span>
                                                    </div>
                                                    <div className="scale-90 origin-right">
                                                        <CustomSwitch isOn={p.isActive} onToggle={() => savePromotion({ ...p, isActive: !p.isActive })} />
                                                    </div>
                                                </div>

                                                {/* Content */}
                                                <div className="px-[12px] pb-[12px] pt-1 flex flex-col justify-between flex-1">
                                                    <div className="pb-2">
                                                        <div className="mb-2">
                                                            <span className="text-[9px] font-black px-1.5 py-0.5 bg-brand-50 text-brand-600 rounded-none uppercase tracking-wider">{p.type === 'PROMO_CODE' ? 'MÃ GIẢM GIÁ' : p.type === 'COMBO_GIFT' ? 'TẶNG QUÀ ĐƠN' : p.type === 'HAPPY_HOUR' ? 'GIỜ VÀNG' : 'MUA X TẶNG Y'}</span>
                                                        </div>
                                                        <h4 className="font-black text-gray-900 mb-1 leading-tight text-sm line-clamp-2" title={p.name}>{p.name}</h4>

                                                        {p.code && <p className="text-[10px] font-black text-brand-600 mt-1.5 mb-1 bg-brand-50 px-2 py-1 w-max rounded-none border border-brand-200 leading-none">MÃ: {p.code}</p>}
                                                        {p.ignoreGlobalDisable && <p className="text-[9px] font-black text-white mt-1 mb-1 bg-red-500 px-2 py-1 w-max rounded-none leading-none tracking-wider shadow-sm">LUÔN HOẠT ĐỘNG</p>}
                                                        {p.dailyLimit > 0 && <p className="text-[9px] font-bold text-gray-600 mt-1 mb-1 bg-gray-100 px-2 py-1 w-max rounded-none border border-gray-200 leading-none">Dùng hôm nay: {(p.usageHistory && p.usageHistory[getVNDateStr()]) || 0}/{p.dailyLimit}</p>}
                                                        {p.type === 'PROMO_CODE' && <p className="text-[11px] text-gray-600 mt-1">Giảm: <span className="font-bold text-gray-900">{p.discountType === 'PERCENT' ? `${p.discountValue}%` : `${p.discountValue}k`}</span> {p.maxDiscount > 0 && `(Max: ${p.maxDiscount}k)`}</p>}
                                                        {p.minOrderValue > 0 && <p className="text-[11px] text-gray-600 mt-0.5">Đơn TT: <span className="font-bold text-gray-900">{p.minOrderValue}k</span></p>}
                                                        {(p.giftItems || []).length > 0 && <p className="text-[11px] text-green-600 mt-0.5 font-bold">+ Tặng {p.giftItems.length} món</p>}
                                                    </div>
                                                    <div className="mt-2 pt-2 border-t border-gray-50 flex items-center justify-between gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                                        <button onClick={() => setEditPromo(p)} className="text-brand-600 bg-brand-50 font-bold px-2 py-1.5 text-[9px] tracking-widest uppercase hover:bg-brand-600 hover:text-white rounded-none transition-colors flex-1 text-center">SỬA</button>
                                                        {hasPermission('menu', 'edit') && (
                                                            <button onClick={() => { if (window.confirm('Xóa CTKM này?')) deletePromotion(p.id) }} className="text-red-500 bg-red-50 font-bold px-2 py-1.5 text-[9px] tracking-widest uppercase hover:bg-red-500 hover:text-white rounded-none transition-colors flex-1 text-center">XÓA</button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </motion.section>
};

export default PromotionsTab;
