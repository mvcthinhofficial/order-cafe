import React, { useState, useEffect } from 'react';
import { SERVER_URL } from '../api';
import { CheckCircle } from 'lucide-react';

const formatVND = (price) => {
    const num = parseFloat(price);
    if (isNaN(num)) return '0 ₫';
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num * 1000);
};

const KitchenDashboard = () => {
    const [orders, setOrders] = useState([]);
    const [tables, setTables] = useState([]);
    const [orderGridColumns, setOrderGridColumns] = useState(() => parseInt(localStorage.getItem('kitchenGridColumns')) || 5);
    const [windowWidth, setWindowWidth] = useState(window.innerWidth);

    useEffect(() => {
        const handleResize = () => setWindowWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        localStorage.setItem('kitchenGridColumns', orderGridColumns.toString());
    }, [orderGridColumns]);

    const [settings, setSettings] = useState({});

    const fetchData = async () => {
        try {
            const [ordersRes, tablesRes, settingsRes] = await Promise.allSettled([
                fetch(`${SERVER_URL}/api/orders`),
                fetch(`${SERVER_URL}/api/tables`),
                fetch(`${SERVER_URL}/api/settings`)
            ]);
            
            if (ordersRes.status === 'fulfilled' && ordersRes.value.ok) {
                setOrders(await ordersRes.value.json());
            }
            if (tablesRes.status === 'fulfilled' && tablesRes.value.ok) {
                setTables(await tablesRes.value.json());
            }
            if (settingsRes.status === 'fulfilled' && settingsRes.value.ok) {
                setSettings(await settingsRes.value.json());
            }
        } catch (e) {
            console.error("Lỗi tải dữ liệu bếp:", e);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 3000);
        return () => clearInterval(interval);
    }, []);

    const completeOrder = async (id) => {
        try {
            await fetch(`${SERVER_URL}/api/orders/complete/${id}`, { method: 'POST' });
            fetchData();
        } catch (e) {
            console.error(e);
        }
    };

    const activeOrders = orders.filter(o => o.status !== 'COMPLETED' && o.status !== 'CANCELLED');

    const sortedActiveObj = {};
    const sortedActive = [...activeOrders].sort((a,b) => a.queueNumber - b.queueNumber);
    sortedActive.forEach((o, i) => {
        sortedActiveObj[o.id] = i;
    });

    const minQueue = activeOrders.length > 0 ? Math.min(...activeOrders.map(o => o.queueNumber)) : null;

    return (
        <div className="w-full h-screen bg-[#F2F2F7] overflow-x-hidden overflow-y-auto">
            <div className="w-full mx-auto min-h-full pb-12 bg-[#F2F2F7] relative">
                <header className="w-full border-b border-gray-100 bg-white shadow-sm p-4 sticky top-0 z-50">
                    <div className="flex justify-between items-center px-2 lg:px-6 mx-auto">
                        <h1 className="text-xl font-black tracking-tighter text-gray-900">
                            BẾP / PHA CHẾ <span className="text-brand-600">ƯU TIÊN</span>
                        </h1>
                        <div className="flex items-center gap-3">
                            <div className="hidden lg:flex gap-1.5 shrink-0">
                                <button
                                    title={`Đang hiển thị ${orderGridColumns} cột (Click để đổi)`}
                                    onClick={() => setOrderGridColumns(prev => prev === 7 ? 3 : prev + 1)}
                                    className="px-3 py-2 flex items-center justify-center transition-all bg-brand-50 border border-brand-600 rounded-2xl shadow-sm hover:bg-brand-100 active:scale-95"
                                >
                                    <div className="flex gap-1 items-center">
                                        {Array.from({ length: orderGridColumns }).map((_, i) => (
                                            <div key={i} className="w-1.5 h-4 rounded-full bg-brand-600" />
                                        ))}
                                    </div>
                                </button>
                            </div>
                        </div>
                    </div>
                </header>

                <main className="w-full px-2 md:px-8 mx-auto py-6">
                    <div className="grid gap-6 grid-flow-row-dense px-2 lg:px-6" style={{ gridTemplateColumns: `repeat(${windowWidth < 768 ? 1 : orderGridColumns}, minmax(0, 1fr))` }}>
                        {sortedActive.map(order => {
                            const isOldest = minQueue !== null && order.queueNumber === minQueue;
                            const isTagNumber = !!order.tagNumber;
                            const tableNameToDisplay = order.tagNumber || order.tableName || tables.find(t => t.id === order.tableId)?.name;
                            const tableAreaToDisplay = order.tagNumber ? 'TAG BÀN' : tables.find(t => t.id === order.tableId)?.area;
                            
                            const orderIndex = sortedActiveObj[order.id];
                            let dimClass = '';
                            if (orderIndex !== undefined && orderIndex > 0) {
                                if (orderIndex === 1) dimClass = 'opacity-[0.95] grayscale-[15%]';
                                else if (orderIndex === 2) dimClass = 'opacity-[0.90] grayscale-[25%]';
                                else if (orderIndex === 3) dimClass = 'opacity-[0.85] grayscale-[35%]';
                                else if (orderIndex === 4) dimClass = 'opacity-[0.80] grayscale-[40%]';
                                else dimClass = 'opacity-[0.75] grayscale-[50%]';
                                dimClass += ' hover:opacity-100 hover:grayscale-0 bg-slate-50';
                            } else {
                                dimClass = 'bg-white shadow-sm';
                            }

                            return (
                                <div key={order.id}
                                    className={`transition-all flex flex-col border ${
                                        isOldest ? 'bg-white shadow-2xl ring-4 ring-[#007AFF]/40 z-20 border-brand-600 row-span-2 scale-[1.01]' : ''
                                    } ${dimClass} border-gray-200 hover:shadow-md`}>
                                    
                                    <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
                                        <div className="flex items-center gap-3">
                                            <div className={`text-xl font-black bg-brand-600 text-white w-12 h-12 flex items-center justify-center shadow ${isOldest ? 'animate-pulse' : ''}`}>
                                                {order.queueNumber}
                                            </div>
                                            {tableNameToDisplay && (
                                                <div className={`text-sm font-black text-white w-12 h-12 flex flex-col items-center justify-center shadow border uppercase tracking-tighter shrink-0 rounded-2xl ${isTagNumber ? 'bg-[#000] border-gray-800' : 'bg-[#C68E5E] border-[#A67B5B]'}`}>
                                                    <span className={`leading-none pt-1 ${isTagNumber && order.tagNumber.length < 3 ? 'text-lg' : ''}`}>{tableNameToDisplay}</span>
                                                    {tableAreaToDisplay && <span className="text-[6px] font-black opacity-90 mt-1 tracking-widest truncate w-full text-center px-0.5">{tableAreaToDisplay}</span>}
                                                </div>
                                            )}
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <p className="font-black text-base text-gray-900 truncate">{order.customerName}</p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {isOldest && <span className="text-[10px] font-black bg-brand-600 text-white px-2 py-0.5 uppercase mb-1">ĐƠN CŨ NHẤT</span>}
                                                    {!order.isPaid && <span className="text-[10px] font-black bg-red-500 text-white px-2 py-0.5 rounded-2xl shadow-sm uppercase mb-1 animate-pulse">CHƯA TT</span>}
                                                    <p className="text-[10px] text-brand-500 font-black uppercase tracking-widest">ID: {order.id}</p>
                                                    <span className="text-gray-300">·</span>
                                                    <p className="text-xs text-gray-400 font-bold">{new Date(order.timestamp).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' })}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2 pointer-events-none">
                                        {(order.cartItems || []).map((c, idx) => (
                                            <div key={idx} className="flex items-start justify-between gap-3 border-b border-gray-100 pb-2 mb-2 last:border-0 last:pb-0 last:mb-0">
                                                <div className="flex-1 min-w-0">
                                                    <span className="font-bold text-base text-gray-800">{idx + 1}. {c.item?.name || 'Món'}</span>
                                                    <div className="flex flex-wrap gap-2 mt-1.5 pl-4">
                                                        <span className="text-sm px-3 py-1 font-black bg-gray-100 text-gray-700 border border-gray-200">SIZE: {c.size?.label || 'S'}</span>
                                                        {c.sugar && <span className="text-sm px-3 py-1 font-black bg-amber-50 text-amber-700 border border-amber-200">ĐƯỜNG: {c.sugar}</span>}
                                                        {c.ice && <span className="text-sm px-3 py-1 font-black bg-brand-50 text-brand-700 border border-brand-200">ĐÁ: {c.ice}</span>}
                                                        {c.addons?.length > 0 && <span className="text-sm px-3 py-1 font-black bg-brand-50 text-brand-700 border border-brand-200">+{c.addons.length} THÊM</span>}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3 flex-shrink-0 mt-2">
                                                    <span className="font-black text-xl text-gray-900">x{c.count}</span>
                                                </div>
                                            </div>
                                        ))}
                                        {order.note && <p className="text-sm italic text-amber-600 bg-amber-50 px-3 py-2 mt-2 ">"{order.note}"</p>}
                                    </div>

                                    <div className="px-5 pb-5 pt-3 border-t border-gray-100">
                                        <button onClick={() => completeOrder(order.id)}
                                            className="w-full bg-brand-500 text-white py-5 font-black text-xl flex items-center justify-center gap-2 hover:bg-[#2EB350] transition-all shadow-md rounded-2xl uppercase">
                                            <CheckCircle size={24} /> HOÀN THÀNH MÓN
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {sortedActive.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-20 opacity-50">
                            <CheckCircle size={64} className="text-gray-400 mb-4" />
                            <p className="text-2xl font-black text-gray-500">HIỆN KHÔNG CÓ ĐƠN HÀNG</p>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
};

export default KitchenDashboard;
