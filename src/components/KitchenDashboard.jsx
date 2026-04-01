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
    const [printingStates, setPrintingStates] = useState({});

    const fetchData = async () => {
        try {
            const [ordersRes, tablesRes, settingsRes, inventoryRes, menuRes] = await Promise.allSettled([
                fetch(`${SERVER_URL}/api/orders`),
                fetch(`${SERVER_URL}/api/tables`),
                fetch(`${SERVER_URL}/api/settings`),
                fetch(`${SERVER_URL}/api/inventory`),
                fetch(`${SERVER_URL}/api/menu`)
            ]);
            
            if (ordersRes.status === 'fulfilled' && ordersRes.value.ok) setOrders(await ordersRes.value.json());
            if (tablesRes.status === 'fulfilled' && tablesRes.value.ok) setTables(await tablesRes.value.json());
            if (settingsRes.status === 'fulfilled' && settingsRes.value.ok) setSettings(await settingsRes.value.json());
            if (inventoryRes.status === 'fulfilled' && inventoryRes.value.ok) setInventory(await inventoryRes.value.json());
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
        let item = menuMap[cartItem.item?.id];
        if (!item && cartItem.item?.name) {
            item = Object.values(menuMap).find(m => m.name === cartItem.item.name);
        }
        if (!item) item = cartItem.item;
        if (!item || !inventory || inventory.length === 0) return [];

        const details = [];
        const sizeLabel = typeof cartItem.size === 'string' ? cartItem.size : cartItem.size?.label;
        
        let currentMultiplier = cartItem.size?.multiplier || 1;
        let matchedSizeObj = null;

        if (sizeLabel && item.sizes && Array.isArray(item.sizes)) {
            matchedSizeObj = item.sizes.find(s => s.label === sizeLabel);
            if (matchedSizeObj && matchedSizeObj.multiplier) {
                currentMultiplier = matchedSizeObj.multiplier;
            }
        }

        if (item.recipe && Array.isArray(item.recipe)) {
            item.recipe.forEach(r => {
                const inv = inventory.find(i => i.id === r.ingredientId);
                const totalQty = Math.ceil(r.quantity * currentMultiplier);
                if (inv && totalQty > 0) details.push(`- ${totalQty} ${inv.unit || ''} ${inv.name}`);
            });
        }
        
        if (matchedSizeObj && matchedSizeObj.recipe && Array.isArray(matchedSizeObj.recipe)) {
            matchedSizeObj.recipe.forEach(r => {
                const inv = inventory.find(i => i.id === r.ingredientId);
                if (inv) details.push(`- ${r.quantity} ${inv.unit || ''} ${inv.name}`);
            });
        }
        
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
        const itemKey = `${order.id}-${idx}`;
        setPrintingStates(prev => ({...prev, [itemKey]: true}));
        
        try {
            const details = getRecipeDetails(cartItem);
            const html = generateKitchenTicketHTML(order, cartItem, details, settings);
            const printerName = settings?.kitchenPrinterName || null;
            const paperSize = settings?.kitchenPaperSize || 'K80';
            
            if (window.require) {
                const { ipcRenderer } = window.require('electron');
                const result = await ipcRenderer.invoke('print-html', html, printerName, paperSize);
                if (!result || !result.success) {
                    alert(`Lỗi in: ${result?.error || 'Không xác định'}`);
                }
            } else {
                const res = await fetch(`${SERVER_URL}/api/print/kitchen`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ html, printerName, paperSize })
                });
                if (!res.ok) throw new Error(await res.text());
                const resJson = await res.json();
                if (!resJson.success) throw new Error(resJson.error);
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
        <div className="w-full h-screen overflow-x-hidden overflow-y-auto" style={{ background: '#F2F2F7' }}>
            <div className="w-full mx-auto min-h-full relative" style={{ paddingBottom: '48px', background: '#F2F2F7' }}>
                {/* Header */}
                <header className="w-full border-b border-gray-100 bg-white shadow-sm sticky top-0 z-50" style={{ padding: '14px 24px' }}>
                    <div className="flex justify-between items-center">
                        <h1 className="text-xl font-black tracking-tighter text-gray-900">
                            BẾP / PHA CHẾ <span className="text-brand-600">ƯU TIÊN</span>
                        </h1>
                        <div className="flex items-center gap-3">
                            <div className="hidden lg:flex gap-1.5 shrink-0">
                                <button
                                    title={`Đang hiển thị ${orderGridColumns} cột (Click để đổi)`}
                                    onClick={() => setOrderGridColumns(prev => prev === 7 ? 3 : prev + 1)}
                                    className="flex items-center justify-center transition-all bg-brand-50 border border-brand-600 shadow-sm hover:bg-brand-100 active:scale-95"
                                    style={{ borderRadius: 'var(--radius-badge)', padding: '8px 12px' }}
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

                {/* Main grid */}
                <main style={{ padding: '24px 20px' }}>
                    <div
                        className="grid gap-5 grid-flow-row-dense"
                        style={{ gridTemplateColumns: `repeat(${windowWidth < 768 ? 1 : orderGridColumns}, minmax(0, 1fr))` }}
                    >
                        {sortedActive.map(order => {
                            const isOldest = minQueue !== null && order.queueNumber === minQueue;
                            const isTagNumber = !!order.tagNumber;
                            const tableNameToDisplay = order.tagNumber || order.tableName || tables.find(t => t.id === order.tableId)?.name;
                            const tableAreaToDisplay = order.tagNumber ? 'TAG BÀN' : tables.find(t => t.id === order.tableId)?.area;
                            
                            const orderIndex = sortedActiveObj[order.id];
                            let dimStyle = {};
                            let cardBg = 'white';
                            if (orderIndex !== undefined && orderIndex > 0) {
                                const opacity = Math.max(0.75, 1 - orderIndex * 0.05);
                                dimStyle = { opacity, filter: `grayscale(${Math.min(orderIndex * 10, 50)}%)` };
                                cardBg = '#f8fafc';
                            }

                            return (
                                <div
                                    key={order.id}
                                    className={`transition-all flex flex-col border hover:shadow-md ${isOldest ? 'ring-4 ring-brand-600/40 z-20 scale-[1.01] shadow-2xl' : ''}`}
                                    style={{
                                        background: cardBg,
                                        borderColor: isOldest ? 'var(--color-brand-600)' : '#e5e7eb',
                                        borderRadius: 'var(--radius-card)',
                                        ...dimStyle
                                    }}
                                >
                                    {/* Card Header */}
                                    <div
                                        className="flex flex-col border-b border-gray-100"
                                        style={{ padding: '16px 20px 14px' }}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                {/* Queue number badge */}
                                                <div
                                                    className={`text-xl font-black text-white flex items-center justify-center shadow ${isOldest ? 'animate-pulse' : ''}`}
                                                    style={{
                                                        width: '48px', height: '48px',
                                                        background: 'var(--color-brand-600)',
                                                        borderRadius: 'var(--radius-badge)'
                                                    }}
                                                >
                                                    {order.queueNumber}
                                                </div>

                                                {/* Table name badge */}
                                                {tableNameToDisplay && (
                                                    <div
                                                        className="text-sm font-black text-white flex flex-col items-center justify-center shadow border uppercase tracking-tighter shrink-0"
                                                        style={{
                                                            width: '48px', height: '48px',
                                                            background: isTagNumber ? '#111' : '#C68E5E',
                                                            borderColor: isTagNumber ? '#333' : '#A67B5B',
                                                            borderRadius: 'var(--radius-badge)'
                                                        }}
                                                    >
                                                        <span className={`leading-none pt-1 ${isTagNumber && order.tagNumber.length < 3 ? 'text-lg' : ''}`}>
                                                            {tableNameToDisplay}
                                                        </span>
                                                        {tableAreaToDisplay && (
                                                            <span className="text-[6px] font-black opacity-90 mt-1 tracking-widest truncate w-full text-center px-0.5">
                                                                {tableAreaToDisplay}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Order meta */}
                                                <div className="min-w-0">
                                                    <p className="font-black text-base text-gray-900 truncate">{order.customerName}</p>
                                                    <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: '4px' }}>
                                                        {isOldest && (
                                                            <span
                                                                className="text-[10px] font-black text-white uppercase"
                                                                style={{ background: 'var(--color-brand-600)', borderRadius: 'var(--radius-badge)', padding: '2px 7px', marginBottom: '2px' }}
                                                            >
                                                                ĐƠN CŨ NHẤT
                                                            </span>
                                                        )}
                                                        {!order.isPaid && (
                                                            <span
                                                                className="text-[10px] font-black text-white uppercase animate-pulse"
                                                                style={{ background: '#ef4444', borderRadius: 'var(--radius-badge)', padding: '2px 7px', marginBottom: '2px' }}
                                                            >
                                                                CHƯA TT
                                                            </span>
                                                        )}
                                                        <p className="text-[10px] text-brand-500 font-black uppercase tracking-widest">ID: {order.id}</p>
                                                        <span className="text-gray-300">·</span>
                                                        <p className="text-xs text-gray-400 font-bold">
                                                            {new Date(order.timestamp).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' })}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Toggle Recipe button */}
                                        {!isOldest && (
                                            <button
                                                onClick={() => togglePriority(order.id)}
                                                className={`w-full font-bold text-xs flex items-center justify-center gap-1.5 border transition-colors ${priorityOrderIds.has(order.id) ? 'bg-amber-100 text-amber-700 border-amber-300 shadow-sm' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'}`}
                                                style={{ borderRadius: 'var(--radius-badge)', padding: '8px 12px', marginTop: '12px' }}
                                            >
                                                <BookOpen size={14} />
                                                {priorityOrderIds.has(order.id) ? 'ĐANG HIỂN THỊ CÔNG THỨC' : 'XEM CÔNG THỨC'}
                                            </button>
                                        )}
                                    </div>

                                    {/* Card Body — item list */}
                                    <div className="flex-1 overflow-y-auto pointer-events-auto" style={{ padding: '16px 20px' }}>
                                        <div className="flex flex-col" style={{ gap: '12px' }}>
                                            {(order.cartItems || []).map((c, idx) => {
                                                const showRecipe = isOldest || priorityOrderIds.has(order.id);
                                                const details = getRecipeDetails(c);
                                                
                                                return (
                                                    <div
                                                        key={idx}
                                                        className="border-b border-gray-100 last:border-0"
                                                        style={{ paddingBottom: idx < (order.cartItems?.length - 1) ? '12px' : '0' }}
                                                    >
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="flex-1 min-w-0">
                                                                <span className="font-bold text-base text-gray-800">
                                                                    {idx + 1}. {c.item?.name || 'Món'}
                                                                </span>
                                                                <div className="flex flex-wrap" style={{ gap: '6px', marginTop: '6px', paddingLeft: '16px' }}>
                                                                    <span
                                                                        className="text-[11px] font-black bg-gray-100 text-gray-700 border border-gray-200"
                                                                        style={{ borderRadius: 'var(--radius-badge)', padding: '2px 8px' }}
                                                                    >
                                                                        SIZE: {c.size?.label || 'S'}
                                                                    </span>
                                                                    {c.sugar && (
                                                                        <span
                                                                            className="text-[11px] font-black bg-amber-50 text-amber-700 border border-amber-200"
                                                                            style={{ borderRadius: 'var(--radius-badge)', padding: '2px 8px' }}
                                                                        >
                                                                            ĐƯỜNG: {c.sugar}
                                                                        </span>
                                                                    )}
                                                                    {c.ice && (
                                                                        <span
                                                                            className="text-[11px] font-black bg-blue-50 text-blue-700 border border-blue-200"
                                                                            style={{ borderRadius: 'var(--radius-badge)', padding: '2px 8px' }}
                                                                        >
                                                                            ĐÁ: {c.ice}
                                                                        </span>
                                                                    )}
                                                                    {c.addons?.length > 0 && (
                                                                        <span
                                                                            className="text-[11px] font-black bg-brand-50 text-brand-700 border border-brand-200"
                                                                            style={{ borderRadius: 'var(--radius-badge)', padding: '2px 8px' }}
                                                                        >
                                                                            +{c.addons.length} THÊM
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <span className="font-black text-xl text-gray-900 shrink-0 mt-1">x{c.count}</span>
                                                        </div>
                                                        
                                                        {/* Recipe section */}
                                                        {showRecipe && (
                                                            <div
                                                                className="bg-slate-50 border border-slate-100"
                                                                style={{ borderRadius: 'var(--radius-badge)', padding: '10px 14px', marginTop: '8px' }}
                                                            >
                                                                <div className="text-[11px] text-gray-600 font-bold uppercase tracking-wider" style={{ marginBottom: '6px' }}>
                                                                    THÀNH PHẦN:
                                                                </div>
                                                                {details.length > 0
                                                                    ? details.map((d, dIdx) => (
                                                                        <div key={dIdx} className="text-xs font-medium text-gray-700 leading-tight" style={{ marginBottom: '2px' }}>
                                                                            {d}
                                                                        </div>
                                                                    ))
                                                                    : <div className="text-xs italic text-gray-400">Không có công thức</div>
                                                                }
                                                                <div className="text-right" style={{ marginTop: '8px' }}>
                                                                    <button
                                                                        onClick={() => printKitchenItem(order, c, idx)}
                                                                        disabled={printingStates[`${order.id}-${idx}`]}
                                                                        className={`inline-flex items-center gap-1.5 text-[10px] font-black text-white uppercase transition-colors ${printingStates[`${order.id}-${idx}`] ? 'bg-slate-400 cursor-not-allowed' : 'bg-slate-800 hover:bg-black'}`}
                                                                        style={{ borderRadius: 'var(--radius-badge)', padding: '6px 12px' }}
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
                                        </div>

                                        {order.note && (
                                            <p
                                                className="text-sm italic font-medium text-amber-700 bg-amber-50"
                                                style={{ borderRadius: 'var(--radius-badge)', padding: '10px 14px', marginTop: '10px' }}
                                            >
                                                Note: "{order.note}"
                                            </p>
                                        )}
                                    </div>

                                    {/* Card Footer — complete button */}
                                    <div className="border-t border-gray-100" style={{ padding: '14px 20px 18px' }}>
                                        <button
                                            onClick={() => completeOrder(order.id)}
                                            className="w-full text-white font-black text-xl flex items-center justify-center gap-2 hover:bg-green-600 transition-all shadow-md uppercase"
                                            style={{
                                                background: 'var(--color-brand-500, #22c55e)',
                                                borderRadius: 'var(--radius-btn)',
                                                padding: '16px 20px',
                                                minHeight: '56px'
                                            }}
                                        >
                                            <CheckCircle size={24} /> HOÀN THÀNH MÓN
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {sortedActive.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-20 opacity-50">
                            <CheckCircle size={64} className="text-gray-400" style={{ marginBottom: '16px' }} />
                            <p className="text-2xl font-black text-gray-500">HIỆN KHÔNG CÓ ĐƠN HÀNG</p>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
};

export default KitchenDashboard;
