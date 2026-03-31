import React from 'react';
import { motion } from 'framer-motion';
import { Table, Plus, Users, CheckCircle, Clock, Settings } from 'lucide-react';
import { formatVND } from '../../utils/dashboardUtils';
import { formatTime } from '../../utils/timeUtils';

const TablesTab = ({ tables, orders, settings, setActionTable, setEditTable }) => {
    return (
                            <motion.section key="tables" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} className="space-y-6" style={{ paddingLeft: '32px', paddingRight: '32px' }}>
                                <div className="flex justify-between items-center px-1">
                                    <div>
                                        <h3 className="text-xl font-black text-gray-900">Sơ đồ bàn</h3>
                                        <p className="text-xs text-gray-400 font-bold mt-0.5">{tables.length} vị trí · Phân theo khu vực</p>
                                    </div>
                                    <div className="flex gap-3">
                                        <div className="flex items-center gap-4 bg-white px-5 py-2.5  border border-gray-100 shadow-sm text-[10px] font-black uppercase tracking-widest text-gray-400">
                                            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5  bg-gray-200" /> Trống</div>
                                            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5  bg-orange-400" /> Đang dùng</div>
                                            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5  bg-brand-500" /> Đã đặt</div>
                                        </div>
                                        <button onClick={() => setEditTable({})} className="bg-gray-900 text-white px-8 py-4  font-black flex items-center gap-2 shadow-xl hover:scale-105 transition-all text-sm uppercase tracking-widest">
                                            <Plus size={18} /> THÊM BÀN
                                        </button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 xl:grid-cols-8 gap-5">
                                    {tables.map(table => {
                                        const activeOrder = orders.find(o => o.tableId === table.id && o.status !== 'COMPLETED' && o.status !== 'CANCELLED');
                                        const computedStatus = activeOrder ? 'Occupied' : table.status;

                                        if (computedStatus === 'Occupied' && activeOrder) {
                                            const isUnpaid = !activeOrder.isPaid;
                                            const isPaid = activeOrder.isPaid;
                                            const isPending = activeOrder.status === 'PENDING';

                                            return (
                                                <button key={table.id}
                                                    onClick={() => setActionTable({ ...table, computedStatus, activeOrder })}
                                                    className="bg-white p-3 border-2 border-orange-400 shadow-xl ring-2 ring-orange-50 hover:border-brand-600 transition-all aspect-square min-h-[140px] flex flex-col justify-between overflow-hidden group relative text-left">
                                                    <div className="absolute inset-0 opacity-5 pointer-events-none bg-orange-500" />
                                                    {/* Header */}
                                                    <div className="flex justify-between items-start w-full relative z-10">
                                                        <div className="flex flex-col">
                                                            <div className="flex items-center gap-1.5">
                                                                <div className="w-10 h-10 flex items-center justify-center font-black text-lg shadow-inner bg-orange-500 text-white rounded-none">
                                                                    {table.name}
                                                                </div>
                                                                <button onClick={(e) => { e.stopPropagation(); setEditTable(table); }} className="p-1.5 text-orange-400 hover:bg-orange-100 hover:text-orange-600 rounded-none transition-all outline-none opacity-50 hover:opacity-100">
                                                                    <Settings size={16} />
                                                                </button>
                                                            </div>
                                                            <span className="font-extrabold text-[9px] text-gray-500 uppercase tracking-widest mt-1.5">{table.area}</span>
                                                        </div>
                                                        <div className="flex flex-col items-end">
                                                            <span className="text-[10px] bg-orange-100 text-orange-600 px-2 py-0.5 font-black uppercase tracking-widest rounded-none shadow-sm">
                                                                #{activeOrder.queueNumber}
                                                            </span>
                                                            <span className="text-[9px] font-bold text-gray-400 mt-0.5">
                                                                {formatTime(activeOrder.timestamp)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    {/* Order Line Items Truncated */}
                                                    <div className="flex-1 w-full my-2 overflow-hidden flex flex-col justify-center relative z-10 gap-1.5">
                                                        {(activeOrder.cartItems || []).slice(0, 3).map((c, idx) => (
                                                            <div key={idx} className="flex flex-col border-b border-orange-50/50 pb-1 last:border-0 last:pb-0">
                                                                <div className="font-bold text-[10px] text-gray-800 leading-tight truncate">
                                                                    <span className="text-orange-600 mr-1">{c.count}x</span>{c.isGift ? '(KM) ' : ''}{c.item?.name || c.name || 'Món'}
                                                                </div>
                                                                <div className="flex flex-wrap gap-1 mt-0.5 pl-3">
                                                                    <span className="text-[8px] bg-gray-100 px-1 py-0.5 font-bold text-gray-600 rounded-none">S: {c.size?.label || 'Mặc định'}</span>
                                                                    {c.sugar && <span className="text-[8px] bg-amber-50 px-1 py-0.5 font-bold text-amber-700 border border-amber-100/50 rounded-none">Đường: {c.sugar}</span>}
                                                                    {c.ice && <span className="text-[8px] bg-brand-50 px-1 py-0.5 font-bold text-brand-700 border border-brand-100/50 rounded-none">Đá: {c.ice}</span>}
                                                                </div>
                                                                {c.note && <div className="text-[8px] italic text-gray-400 pl-3 mt-0.5 truncate shrink-0">"{c.note}"</div>}
                                                            </div>
                                                        ))}
                                                        {(activeOrder.cartItems || []).length > 3 && (
                                                            <div className="text-[9px] italic text-gray-400 font-bold mt-0.5">
                                                                +{(activeOrder.cartItems || []).length - 3} món khác...
                                                            </div>
                                                        )}
                                                    </div>
                                                    {/* Footer Price */}
                                                    <div className="w-full pt-1.5 border-t border-orange-100 flex justify-between items-center relative z-10 mt-auto">
                                                        <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">TỔNG</span>
                                                        <span className="font-black text-xs text-[#C68E5E]">{formatVND(activeOrder.price)}</span>
                                                    </div>
                                                </button>
                                            );
                                        }

                                        return (
                                            <button key={table.id}
                                                onClick={() => setActionTable({ ...table, computedStatus, activeOrder })}
                                                className={`bg-white border-2 border-transparent hover:border-brand-600 hover:shadow-xl transition-all relative overflow-hidden group flex flex-col items-center justify-center gap-2 aspect-square p-6`}>
                                                <div className={`absolute inset-0 opacity-5 pointer-events-none ${computedStatus === 'Occupied' ? 'bg-orange-500' : computedStatus === 'Reserved' ? 'bg-brand-500' : 'bg-gray-200'}`} />
                                                <button onClick={(e) => { e.stopPropagation(); setEditTable(table); }} className="absolute top-2 right-2 p-1.5 text-gray-300 hover:text-gray-600 hover:bg-gray-100 rounded-none transition-all opacity-0 group-hover:opacity-100 outline-none">
                                                    <Settings size={14} />
                                                </button>
                                                <div className={`w-14 h-14 flex items-center justify-center font-black text-lg shadow-inner ${computedStatus === 'Reserved' ? 'bg-brand-100 text-brand-600' : 'bg-gray-100 text-gray-400'}`}>
                                                    {table.name}
                                                </div>
                                                <div>
                                                    <p className="font-extrabold text-xs text-gray-900 uppercase tracking-tighter">{table.area}</p>
                                                    <p className={`text-[9px] font-black uppercase tracking-widest mt-0.5 ${computedStatus === 'Reserved' ? 'text-brand-500' : 'text-gray-300'}`}>
                                                        {computedStatus === 'Reserved' ? 'ĐÃ ĐẶT' : 'TRỐNG'}
                                                    </p>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </motion.section>
    );
};

export default TablesTab;
