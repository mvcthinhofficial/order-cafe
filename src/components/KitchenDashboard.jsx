import React, { useState, useEffect } from 'react';
import { SERVER_URL } from '../api';
import { CheckCircle, Printer, BookOpen } from 'lucide-react';

const formatVND = (price) => {
    const num = parseFloat(price);
    if (isNaN(num)) return '0 ₫';
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num * 1000);
};

const KitchenDashboard = () => {
    const [orders, setOrders] = useState([]);
    const [tables, setTables] = useState([]);
    const [orderGridColumns, setOrderGridColumns] = useState(() => parseInt(localStorage.getItem('kitchenGridColumns')) || 5);
    
    const generateKitchenTicketHTML = (order, cartItem, recipeDetails, settings) => {
        const isK58 = settings?.kitchenPaperSize === 'K58';
        const baseSize = settings?.kitchenFontSize || 14;
        const lineGap = settings?.kitchenLineGap || 1.5;
        const paperWidth = isK58 ? '200px' : '300px';

        const tableName = order.tagNumber || order.tableName || tables.find(t => t.id === order.tableId)?.name || 'GIAO ĐI';
        const sizeLabel = typeof cartItem.size === 'string' ? cartItem.size : cartItem.size?.label;

        return `
            <div style="font-family: Arial, sans-serif; width: ${paperWidth}; margin: 0 auto; color: #000; line-height: ${lineGap};">
                <div style="text-align: center; border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 10px;">
                    <h3 style="margin: 0; font-size: ${baseSize + 2}px; font-weight: 900; text-transform: uppercase;">BẾP: ${tableName}</h3>
                    <div style="font-size: ${baseSize}px; margin-top: 4px; font-weight: bold;">
                        Q: ${order.queueNumber} - ID: ${order.id.slice(-4)}
                    </div>
                </div>
                
                <div style="margin-bottom: 12px;">
                    <h2 style="font-size: ${baseSize + 6}px; font-weight: 900; margin: 0; text-transform: uppercase; line-height: 1.1;">
                        ${cartItem.item?.name} ${sizeLabel ? `(${sizeLabel})` : ''} x${cartItem.count}
                    </h2>
                </div>
                
                <div style="font-size: ${baseSize}px; border-left: 3px solid #000; padding-left: 8px; margin-bottom: 12px;">
                    ${recipeDetails.map(d => `<div style="margin-bottom: 2px;">${d}</div>`).join('')}
                </div>
                
                <div style="border-top: 1px dashed #000; padding-top: 8px; font-size: ${baseSize}px;">
                    <div style="font-weight: bold;">Đường: ${cartItem.sugar || 'Bình thường'}</div>
                    <div style="font-weight: bold;">Đá: ${cartItem.ice || 'Bình thường'}</div>
                    ${cartItem.addons?.length > 0 ? `
                        <div style="margin-top: 4px;">
                            <b>Topping:</b> ${cartItem.addons.map(a => typeof a === 'string' ? a : a.label).join(', ')}
                        </div>
                    ` : ''}
                    ${cartItem.note || order.note ? `
                        <div style="margin-top: 6px; font-style: italic; font-weight: bold; border: 1px solid #000; padding: 4px;">
                            LƯU Ý: ${cartItem.note || order.note}
                        </div>
                    ` : ''}
                </div>
                
                <div style="margin-top: 15px; text-align: center; font-size: ${baseSize - 4}px; opacity: 0.8;">
                    ${new Date(order.timestamp).toLocaleTimeString('vi-VN')}
                </div>
            </div>
        `;
    };
    const [windowWidth, setWindowWidth] = useState(window.innerWidth);
    const [inventory, setInventory] = useState([]);
    const [menuMap, setMenuMap] = useState({});
    const [priorityOrderIds, setPriorityOrderIds] = useState(new Set());

    useEffect(() => {
        const handleResize = () => setWindowWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        localStorage.setItem('kitchenGridColumns', orderGridColumns.toString());
    }, [orderGridColumns]);

    const [settings, setSettings] = useState({});
    const [printingStates, setPrintingStates] = useState({}); // Tracking print status for each item

    const fetchData = async () => {
        try {
            const [ordersRes, tablesRes, settingsRes, inventoryRes, menuRes] = await Promise.allSettled([
                fetch(`${SERVER_URL}/api/orders`),
                fetch(`${SERVER_URL}/api/tables`),
                fetch(`${SERVER_URL}/api/settings`),
                fetch(`${SERVER_URL}/api/inventory`),
                fetch(`${SERVER_URL}/api/menu`)
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
            if (inventoryRes.status === 'fulfilled' && inventoryRes.value.ok) {
                setInventory(await inventoryRes.value.json());
            }
            if (menuRes.status === 'fulfilled' && menuRes.value.ok) {
                const data = await menuRes.value.json();
                const map = {};
                data.forEach(m => map[m.id] = m);
                setMenuMap(map);
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

    const togglePriority = (orderId) => {
        setPriorityOrderIds(prev => {
            const next = new Set(prev);
            if (next.has(orderId)) next.delete(orderId);
            else next.add(orderId);
            return next;
        });
    };

    const getRecipeDetails = (cartItem) => {
        // Ưu tiên dùng dữ liệu full từ menuMap để có đầy đủ cấu trúc size/recipe/multiplier
        let item = menuMap[cartItem.item?.id];
        
        // Fallback: Nếu không tìm thấy bằng ID (do ID migrate hoặc ID local), tìm theo tên
        if (!item && cartItem.item?.name) {
            item = Object.values(menuMap).find(m => m.name === cartItem.item.name);
        }
        
        // Nếu vẫn không thấy, dùng snapshot từ chính cartItem
        if (!item) item = cartItem.item;
        if (!item || !inventory || inventory.length === 0) return [];

        const details = [];
        const sizeLabel = typeof cartItem.size === 'string' ? cartItem.size : cartItem.size?.label;
        
        let currentMultiplier = cartItem.size?.multiplier || 1;
        let matchedSizeObj = null;

        // Ưu tiên size object trong menuMap (nếu có) để lấy multiplier chuẩn nhất
        if (sizeLabel && item.sizes && Array.isArray(item.sizes)) {
            matchedSizeObj = item.sizes.find(s => s.label === sizeLabel);
            if (matchedSizeObj && matchedSizeObj.multiplier) {
                currentMultiplier = matchedSizeObj.multiplier;
            }
        }

        // 1. Phép tính cho Công thức tính chung (Base Recipe) có nhân hệ số HS (nếu có Size M/L/XL v.v.)
        // Khớp hoàn toàn với logic backend (server.cjs -> handleInventoryForOrder)
        if (item.recipe && Array.isArray(item.recipe)) {
            item.recipe.forEach(r => {
                const inv = inventory.find(i => i.id === r.ingredientId);
                const totalQty = Math.ceil(r.quantity * currentMultiplier);
                if (inv && totalQty > 0) details.push(`- ${totalQty} ${inv.unit || ''} ${inv.name}`);
            });
        }
        
        // 2. Phép tính cho Size Modifiers (Công thức lõi gắn riêng vào Size M/L/XL)
        if (matchedSizeObj && matchedSizeObj.recipe && Array.isArray(matchedSizeObj.recipe)) {
            matchedSizeObj.recipe.forEach(r => {
                const inv = inventory.find(i => i.id === r.ingredientId);
                if (inv) details.push(`- ${r.quantity} ${inv.unit || ''} ${inv.name}`);
            });
        }
        
        // 3. Add-ons (Theo bảng định nghĩa trong menu item)
        if (cartItem.addons && Array.isArray(cartItem.addons)) {
            cartItem.addons.forEach(a => {
                const aLabel = typeof a === 'string' ? a : a.label;
                const mAddon = item.addons?.find(ma => ma.label === aLabel);
                
                if (mAddon && mAddon.recipe && Array.isArray(mAddon.recipe)) {
                    mAddon.recipe.forEach(r => {
                        const inv = inventory.find(i => i.id === r.ingredientId);
                        if (inv) details.push(`- (Thêm ${aLabel}): ${r.quantity} ${inv.unit || ''} ${inv.name}`);
                    });
                } else {
                    details.push(`- Kèm: ${aLabel}`);
                }
            });
        }

        return details;
    };

    const printKitchenItem = async (order, cartItem, idx) => {
        if (!window.require) {
            alert("Tính năng in chỉ khả dụng trên ứng dụng máy tính.");
            return;
        }
        const itemKey = `${order.id}-${idx}`;
        setPrintingStates(prev => ({...prev, [itemKey]: true}));
        
        try {
            const { ipcRenderer } = window.require('electron');
            const details = getRecipeDetails(cartItem);
            
            const html = generateKitchenTicketHTML(order, cartItem, details, settings);
            
            // Đảm bảo có fallback cho printerName và paperSize
            const printerName = settings?.kitchenPrinterName || null;
            const paperSize = settings?.kitchenPaperSize || 'K80';
            
            console.log(`[Kitchen] Printing item ${itemKey} to ${printerName || 'default'} (${paperSize})`);
            
            const result = await ipcRenderer.invoke('print-html', html, printerName, paperSize);
            if (!result || !result.success) {
                console.error('Print failed:', result?.error);
                alert(`Lỗi in: ${result?.error || 'Không xác định'}`);
            }
        } catch(e) { 
            console.error('Lỗi in bếp:', e); 
            alert(`Lỗi thực thi in: ${e.message}`);
        } finally {
            setPrintingStates(prev => ({...prev, [itemKey]: false}));
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
                                    className="px-3 py-2 flex items-center justify-center transition-all bg-brand-50 border border-brand-600 rounded-none shadow-sm hover:bg-brand-100 active:scale-95"
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
                                    
                                    <div className="flex flex-col px-5 pt-5 pb-3 border-b border-gray-100">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className={`text-xl font-black bg-brand-600 text-white w-12 h-12 flex items-center justify-center shadow ${isOldest ? 'animate-pulse' : ''}`}>
                                                    {order.queueNumber}
                                                </div>
                                                {tableNameToDisplay && (
                                                    <div className={`text-sm font-black text-white w-12 h-12 flex flex-col items-center justify-center shadow border uppercase tracking-tighter shrink-0 rounded-none ${isTagNumber ? 'bg-[#000] border-gray-800' : 'bg-[#C68E5E] border-[#A67B5B]'}`}>
                                                        <span className={`leading-none pt-1 ${isTagNumber && order.tagNumber.length < 3 ? 'text-lg' : ''}`}>{tableNameToDisplay}</span>
                                                        {tableAreaToDisplay && <span className="text-[6px] font-black opacity-90 mt-1 tracking-widest truncate w-full text-center px-0.5">{tableAreaToDisplay}</span>}
                                                    </div>
                                                )}
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <p className="font-black text-base text-gray-900 truncate">{order.customerName}</p>
                                                    </div>
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        {isOldest && <span className="text-[10px] font-black bg-brand-600 text-white px-2 py-0.5 uppercase mb-1">ĐƠN CŨ NHẤT</span>}
                                                        {!order.isPaid && <span className="text-[10px] font-black bg-red-500 text-white px-2 py-0.5 rounded-none shadow-sm uppercase mb-1 animate-pulse">CHƯA TT</span>}
                                                        <p className="text-[10px] text-brand-500 font-black uppercase tracking-widest">ID: {order.id}</p>
                                                        <span className="text-gray-300">·</span>
                                                        <p className="text-xs text-gray-400 font-bold">{new Date(order.timestamp).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' })}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        {!isOldest && (
                                            <button 
                                                onClick={() => togglePriority(order.id)}
                                                className={`mt-3 w-full py-2 font-bold text-xs flex items-center justify-center gap-1.5 rounded-none border transition-colors ${priorityOrderIds.has(order.id) ? 'bg-amber-100 text-amber-700 border-amber-300 shadow-sm' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'}`}
                                            >
                                                <BookOpen size={14} /> 
                                                {priorityOrderIds.has(order.id) ? 'ĐANG HIỂN THỊ CÔNG THỨC' : 'XEM CÔNG THỨC'}
                                            </button>
                                        )}
                                    </div>

                                    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2 pointer-events-auto">
                                        {(order.cartItems || []).map((c, idx) => {
                                            const showRecipe = isOldest || priorityOrderIds.has(order.id);
                                            const details = getRecipeDetails(c);
                                            
                                            return (
                                                <div key={idx} className="flex flex-col border-b border-gray-100 pb-3 mb-3 last:border-0 last:pb-0 last:mb-0">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="flex-1 min-w-0">
                                                            <span className="font-bold text-base text-gray-800">{idx + 1}. {c.item?.name || 'Món'}</span>
                                                            <div className="flex flex-wrap gap-2 mt-1.5 pl-4">
                                                                <span className="text-[11px] px-2 py-0.5 font-black bg-gray-100 text-gray-700 border border-gray-200">SIZE: {c.size?.label || 'S'}</span>
                                                                {c.sugar && <span className="text-[11px] px-2 py-0.5 font-black bg-amber-50 text-amber-700 border border-amber-200">ĐƯỜNG: {c.sugar}</span>}
                                                                {c.ice && <span className="text-[11px] px-2 py-0.5 font-black bg-brand-50 text-brand-700 border border-brand-200">ĐÁ: {c.ice}</span>}
                                                                {c.addons?.length > 0 && <span className="text-[11px] px-2 py-0.5 font-black bg-brand-50 text-brand-700 border border-brand-200">+{c.addons.length} THÊM</span>}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-3 flex-shrink-0 mt-2">
                                                            <span className="font-black text-xl text-gray-900">x{c.count}</span>
                                                        </div>
                                                    </div>
                                                    
                                                    {showRecipe && (
                                                        <div className="mt-2 pl-4 pr-2 py-2 bg-slate-50 border border-slate-100 rounded-none">
                                                            <div className="text-[11px] text-gray-600 font-bold mb-1 uppercase tracking-wider">THÀNH PHẦN:</div>
                                                            {details.length > 0 ? details.map((d, dIdx) => (
                                                                <div key={dIdx} className="text-xs font-medium text-gray-700 leading-tight mb-0.5">{d}</div>
                                                            )) : <div className="text-xs italic text-gray-400">Không có công thức</div>}
                                                            
                                                            <div className="mt-2 text-right">
                                                                    <button 
                                                                        onClick={() => printKitchenItem(order, c, idx)}
                                                                        disabled={printingStates[`${order.id}-${idx}`]}
                                                                        className={`inline-flex items-center gap-1.5 text-[10px] font-black text-white px-3 py-1.5 rounded-none uppercase transition-colors ${printingStates[`${order.id}-${idx}`] ? 'bg-slate-400 cursor-not-allowed' : 'bg-slate-800 hover:bg-black'}`}
                                                                    >
                                                                        <Printer size={12} className={printingStates[`${order.id}-${idx}`] ? 'animate-pulse' : ''} /> 
                                                                        {printingStates[`${order.id}-${idx}`] ? 'ĐANG IN...' : 'IN TEM'}
                                                                    </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                        {order.note && <p className="text-sm italic font-medium text-amber-700 bg-amber-50 px-3 py-2 mt-2 rounded-none">Note: "{order.note}"</p>}
                                    </div>

                                    <div className="px-5 pb-5 pt-3 border-t border-gray-100">
                                        <button onClick={() => completeOrder(order.id)}
                                            className="w-full bg-brand-500 text-white py-5 font-black text-xl flex items-center justify-center gap-2 hover:bg-[#2EB350] transition-all shadow-md rounded-none uppercase">
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
