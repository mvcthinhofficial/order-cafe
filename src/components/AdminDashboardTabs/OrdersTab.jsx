import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
    History, BookOpen, Star, DollarSign, QrCode, LayoutGrid, 
    ArrowDown, ArrowUp, ClipboardList, X, Minus, Plus, 
    Pencil, CheckCircle2, CheckCircle, Printer, Camera, ClipboardCheck,
    Keyboard, Gift
} from 'lucide-react';
import { isInputFocused } from '../../utils/ShortcutUtils.js';

const CustomSwitch = ({ isOn, onToggle, activeColor = "#00DA50" }) => (
    <div
        onClick={onToggle}
        className="w-12 h-6 flex items-center p-1 cursor-pointer transition-colors duration-300"
        style={{ backgroundColor: isOn ? activeColor : '#E5E7EB' }}
    >
        <motion.div
            layout
            className="w-4 h-4 bg-white shadow-sm"
            animate={{ x: isOn ? 24 : 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
        />
    </div>
);

const OrdersTab = ({
    orders,
    tables,
    settings,
    setSettings,
    showCompletedOrders,
    setShowCompletedOrders,
    showDebtOrders,
    setShowDebtOrders,
    priorityMode,
    setPriorityMode,
    historyDate,
    setHistoryDate,
    historySortOrder,
    setHistorySortOrder,
    orderGridColumns,
    setOrderGridColumns,
    isLoadingMoreOrders,
    hasMoreOrders,
    ordersSentinelRef,
    activeQrOrderId,
    setActiveQrOrderId,
    editingOrderId,
    report,
    
    // Parent Handlers
    fetchOrders,
    handleMarkDebt,
    setCancelOrderId,
    setCancelReason,
    updateOrder,
    confirmPayment,
    handlePayDebt,
    setViewReceiptOrder,
    completeOrder,
    setEditOrder,
    setShowOrderPanel,
    showToast,
    formatVND,
    generateReceiptHTML,
    hasPermission,
    SERVER_URL,
    showCompletedOrdersRef,
    showDebtOrdersRef,
    historyDateRef,
    showOrderPanel
}) => {
    const [orderShortcutBuffer, setOrderShortcutBuffer] = useState('');

    // --- Order Completion Shortcut Logic ---
    useEffect(() => {
        if (showOrderPanel) {
            if (orderShortcutBuffer !== '') setOrderShortcutBuffer('');
            return;
        }

        const handleKeyDown = (e) => {
            // Ignore if user is typing in an input field
            if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(e.target?.tagName)) return;

            if (e.key === 'Enter') {
                if (orderShortcutBuffer.length > 0) {
                    const qNum = parseInt(orderShortcutBuffer, 10);
                    const matchingOrders = orders.filter(o => o.queueNumber === qNum);

                    if (matchingOrders.length > 0) {
                        // Find orders that are eligible for completion
                        const activeOrders = matchingOrders.filter(o =>
                            (o.status === 'PENDING' && (o.isPaid || settings.requirePrepayment === false)) ||
                            (o.isPaid && o.status !== 'COMPLETED')
                        );

                        if (activeOrders.length > 0) {
                            // If multiple, complete the oldest one first
                            activeOrders.sort((a, b) => a.timestamp - b.timestamp);
                            completeOrder(activeOrders[0].id);
                        } else {
                            showToast(`Đơn #${qNum} chưa thể hoàn tất (Chưa thanh toán / Đã hoàn tất)`, 'warning');
                        }
                    } else {
                        showToast(`Không tìm thấy đơn #${qNum}`, 'error');
                    }
                    setOrderShortcutBuffer('');
                }
            } else if (e.key === 'Escape' || (e.key === 'Backspace' && !isInputFocused())) {
                setOrderShortcutBuffer('');
            } else if (/^[0-9]$/.test(e.key)) {
                setOrderShortcutBuffer(prev => {
                    if (prev === '' && e.key === '0') return prev;
                    return prev + e.key;
                });
            } else if (e.key === 'Backspace') {
                setOrderShortcutBuffer(prev => prev.slice(0, -1));
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [orderShortcutBuffer, orders, settings.requirePrepayment, showOrderPanel]);
    return (
        <motion.section key="orders" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}>

            <div className="px-8 mb-5 flex flex-wrap justify-between items-center gap-y-3">
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        onClick={() => {
                            const nextVal = !showCompletedOrders;
                            showCompletedOrdersRef.current = nextVal;
                            showDebtOrdersRef.current = false;
                            setShowCompletedOrders(nextVal);
                            setShowDebtOrders(false);
                            fetchOrders(true); // Reset to page 1
                        }}
                        className={`px-4 py-1.5 rounded-none font-black text-sm flex items-center gap-2 transition-all shadow-sm border ${showCompletedOrders ? 'bg-brand-50 text-brand-700 border-brand-200 hover:bg-brand-100' : 'bg-white text-gray-800 hover:bg-gray-50 border-gray-200'
                            }`}
                    >
                        <History size={16} />
                        {showCompletedOrders ? 'ĐƠN ĐANG LÀM' : 'ĐƠN ĐÃ BÁN'}
                    </button>
                    {(orders.some(o => o.isDebt) || showDebtOrders || report?.hasDebt) && (
                        <button
                            onClick={() => {
                                const nextVal = !showDebtOrders;
                                showDebtOrdersRef.current = nextVal;
                                showCompletedOrdersRef.current = false;
                                setShowDebtOrders(nextVal);
                                setShowCompletedOrders(false);
                                fetchOrders(true); // Reset to page 1
                            }}
                            className={`px-4 py-1.5 rounded-none font-black text-sm flex items-center gap-2 transition-all shadow-sm border ${showDebtOrders ? 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100' : 'bg-white text-gray-800 hover:bg-gray-50 border-gray-200'
                                }`}
                        >
                            <BookOpen size={16} />
                            {showDebtOrders ? 'ĐƠN ĐANG LÀM' : 'GHI NỢ'}
                        </button>
                    )}
                    <div className="flex flex-wrap items-center gap-2 lg:gap-3 lg:ml-2">
                        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-none border border-gray-200 shadow-sm" title="Ưu tiên làm rõ đơn cũ nhất, mờ dần các đơn mới hơn">
                            <span className="text-sm font-bold text-gray-700 flex items-center gap-2">
                                <Star size={16} className={priorityMode ? 'text-amber-500 fill-amber-500' : 'text-gray-400'} /> Ưu tiên
                            </span>
                            <CustomSwitch
                                isOn={priorityMode}
                                onToggle={() => setPriorityMode(!priorityMode)}
                                activeColor="#F59E0B"
                            />
                        </div>
                        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-none border border-gray-200 shadow-sm" title="Tuỳ chọn Thanh toán Trước (Khách trả tiền ngay) hoặc Thanh toán Sau (Làm nước trước, thu tiền sau)">
                            <span className="text-sm font-bold text-gray-700 flex items-center gap-2">
                                <DollarSign size={16} /> Thanh toán: {settings.requirePrepayment === false ? 'SAU' : 'TRƯỚC'}
                            </span>
                            <CustomSwitch
                                isOn={settings.requirePrepayment !== false}
                                onToggle={async () => {
                                    if (!hasPermission('orders', 'edit')) {
                                        showToast('Bạn không có quyền thay đổi cài đặt này', 'error');
                                        return;
                                    }
                                    const newVal = settings.requirePrepayment === false ? true : false;
                                    const newSettings = { ...settings, requirePrepayment: newVal };
                                    try {
                                        const res = await fetch(`${SERVER_URL}/api/settings`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify(newSettings)
                                        });
                                        if (res.ok) setSettings(newSettings);
                                    } catch (e) {
                                        console.error(e);
                                    }
                                }}
                                activeColor="#34C759"
                            />
                        </div>
                        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-none border border-gray-200 shadow-sm" title="Tự động mở mã QR Thanh toán trên Kiosk khi chọn Chuyển khoản tại POS">
                            <span className="text-sm font-bold text-gray-700 flex items-center gap-2">
                                <QrCode size={16} /> QR TT tự động
                            </span>
                            <CustomSwitch
                                isOn={settings.autoPushPaymentQr !== false}
                                onToggle={async () => {
                                    const newVal = !settings.autoPushPaymentQr;
                                    const newSettings = { ...settings, autoPushPaymentQr: newVal };
                                    try {
                                        const res = await fetch(`${SERVER_URL}/api/settings`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify(newSettings)
                                        });
                                        if (res.ok) setSettings(newSettings);
                                    } catch (e) {
                                        console.error(e);
                                    }
                                }}
                                activeColor="#34C759"
                            />
                        </div>

                        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-none border border-gray-200 shadow-sm" title="Bật/Tắt giao diện Kiosk trên máy chủ (Dùng cho 2 màn hình)">
                            <span className="text-sm font-bold text-gray-700 flex items-center gap-2">
                                <LayoutGrid size={16} /> Mở Kiosk
                            </span>
                            <CustomSwitch
                                isOn={settings.isKioskOpen}
                                onToggle={() => {
                                    const newState = !settings.isKioskOpen;
                                    const newSettings = { ...settings, isKioskOpen: newState };
                                    setSettings(newSettings);
                                    try {
                                        const { ipcRenderer } = window.require('electron');
                                        ipcRenderer.send('toggle-kiosk');
                                    } catch (e) {
                                        console.log('Not in Electron or IPC error');
                                    }
                                }}
                                activeColor="#007AFF"
                            />
                        </div>
                    </div>
                    {showCompletedOrders && (
                        <div className="flex items-center gap-2 lg:ml-2 mt-2 md:mt-0">
                            <input
                                type="date"
                                value={historyDate}
                                onChange={(e) => {
                                    const nextDate = e.target.value;
                                    setHistoryDate(nextDate);
                                    historyDateRef.current = nextDate;
                                    fetchOrders(true); // Reset for new date
                                }}
                                className="px-3 py-2 border border-gray-200 rounded-none text-sm font-bold text-gray-700 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-[#007AFF]/50"
                            />
                            <button
                                onClick={() => setHistorySortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                                className="px-3 py-2 border border-gray-200 rounded-none text-sm font-bold text-gray-700 bg-white shadow-sm flex items-center gap-2 hover:bg-gray-50"
                                title="Sắp xếp thời gian"
                            >
                                {historySortOrder === 'desc' ? <ArrowDown size={18} /> : <ArrowUp size={18} />}
                                {historySortOrder === 'desc' ? 'Mới nhất' : 'Cũ nhất'}
                            </button>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    <div className="hidden lg:flex gap-1.5 shrink-0">
                        <button
                            title={`Đang hiển thị ${orderGridColumns} cột (Click để đổi)`}
                            onClick={() => setOrderGridColumns(prev => prev === 7 ? 3 : prev + 1)}
                            className="px-3 py-2 flex items-center justify-center transition-all bg-brand-50 border border-brand-600 rounded-none shadow-sm hover:bg-brand-100 active:scale-95"
                        >
                            <div className="flex gap-1 items-center">
                                {Array.from({ length: orderGridColumns }).map((_, i) => (
                                    <div key={i} className="w-1.5 h-4 rounded-none bg-brand-600" />
                                ))}
                            </div>
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex gap-4 xl:gap-6 items-start w-full overflow-x-auto pb-6 custom-scrollbar snap-x">
                {(() => {
                    let displayOrders = [...orders];
                    if (showCompletedOrders) {
                        displayOrders.sort((a, b) => {
                            const timeA = new Date(a.timestamp).getTime();
                            const timeB = new Date(b.timestamp).getTime();
                            return historySortOrder === 'desc' ? timeB - timeA : timeA - timeB;
                        });
                    }
                    const minQueue = displayOrders.length > 0 && !showCompletedOrders ? Math.min(...displayOrders.map(o => o.queueNumber)) : null;

                    const activeOrders = displayOrders.filter(o => !showCompletedOrders && o.status !== 'COMPLETED' && o.status !== 'CANCELLED');
                    const sortedActiveObj = {};
                    [...activeOrders].sort((a, b) => a.queueNumber - b.queueNumber).forEach((o, i) => {
                        sortedActiveObj[o.id] = i;
                    });

                    const columns = Array.from({ length: Math.max(1, orderGridColumns) }, () => []);
                    displayOrders.forEach((order, index) => columns[index % orderGridColumns].push(order));

                    return [...columns.map((colOrders, colIndex) => (
                        <div key={colIndex} className="flex-1 flex flex-col gap-4 xl:gap-6 min-w-[280px] xl:min-w-0 snap-center">
                            {colOrders.map(order => {
                                const isPending = order.status === 'PENDING';
                                const isAwaiting = order.status === 'AWAITING_PAYMENT';
                                const isPaid = order.isPaid;
                                const isUnpaid = !isPaid;
                                const isEditing = editingOrderId === order.id;
                                const isOldest = minQueue !== null && order.queueNumber === minQueue;
                                const isTagNumber = !!order.tagNumber;
                                const tableNameToDisplay = order.tagNumber || order.tableName || tables.find(t => t.id === order.tableId)?.name;
                                const tableAreaToDisplay = order.tagNumber ? 'TAG BÀN' : tables.find(t => t.id === order.tableId)?.area;

                                const orderIndex = sortedActiveObj[order.id];
                                let dimClass = '';
                                if (priorityMode && orderIndex !== undefined && orderIndex > 0 && !isEditing) {
                                    if (orderIndex === 1) dimClass = 'opacity-[0.95] grayscale-[15%]';
                                    else if (orderIndex === 2) dimClass = 'opacity-[0.90] grayscale-[25%]';
                                    else if (orderIndex === 3) dimClass = 'opacity-[0.85] grayscale-[35%]';
                                    else if (orderIndex === 4) dimClass = 'opacity-[0.80] grayscale-[40%]';
                                    else dimClass = 'opacity-[0.75] grayscale-[50%]';
                                    dimClass += ' hover:opacity-100 hover:grayscale-0 bg-slate-50';
                                } else if (!isOldest) {
                                    dimClass = 'bg-white shadow-sm';
                                }

                                return (
                                    <div key={order.id}
                                        className={`break-inside-avoid mb-6 transition-all flex flex-col border ${isOldest && priorityMode ? 'bg-white shadow-2xl ring-4 ring-[#007AFF]/40 border-brand-600' : (isOldest ? 'bg-white shadow-sm ring-2 ring-[#007AFF]/20 border-brand-600' : '')
                                            } ${dimClass} ${isEditing ? 'border-brand-600/40 shadow-xl ring-2 ring-[#007AFF]/10 !opacity-100 !bg-white' :
                                                isUnpaid ? 'border-amber-200 ring-1 ring-amber-100' :
                                                    (isPending || isPaid) ? 'border-gray-200 hover:shadow-md' : 'border-gray-100'
                                            }`}>
                                        {/* Header */}
                                        <div className="flex flex-wrap items-start justify-between gap-3 px-4 xl:px-5 pt-4 xl:pt-5 pb-3 border-b border-gray-100 bg-white/50">
                                            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto flex-1">
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
                                                    <div className="flex items-center gap-2">
                                                        {isOldest && <span className="text-[10px] font-black bg-brand-600 text-white px-2 py-0.5 uppercase mb-1">ĐƠN CŨ NHẤT</span>}
                                                        <p className="text-[10px] text-brand-500 font-black uppercase tracking-widest">ID: {order.id}</p>
                                                        <span className="text-gray-300">·</span>
                                                        <p className="text-xs text-gray-400 font-bold">{new Date(order.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</p>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap justify-end items-center gap-2 w-full sm:w-auto">
                                                {isUnpaid && !order.isDebt && <span className="text-[10px] xl:text-xs font-black bg-amber-100 text-amber-700 px-3 py-1.5 shrink-0">CHỜ THANH TOÁN</span>}
                                                {isPaid && <span className="text-xs font-black bg-green-100 text-green-700 px-3 py-1.5 ">ĐÃ THANH TOÁN</span>}
                                                {order.isDebt && <span className="text-xs font-black bg-purple-100 text-purple-700 px-3 py-1.5 ">ĐANG GHI NỢ</span>}
                                                {order.status === 'COMPLETED' && !order.isPaid && !order.isDebt && hasPermission('orders', 'edit') && (
                                                    <button
                                                        onClick={() => handleMarkDebt(order.id)}
                                                        className="p-1 px-2 text-[10px] font-bold bg-gray-100 text-gray-400 hover:bg-purple-100 hover:text-purple-600 transition-all rounded-none"
                                                        title="Ghi nợ đơn hàng này"
                                                    >
                                                        GHI NỢ
                                                    </button>
                                                )}
                                                {(isPending || isAwaiting || isPaid) && hasPermission('orders', 'edit') && (
                                                    <button
                                                        onClick={() => { setCancelOrderId(order.id); setCancelReason(''); }}
                                                        className="p-2 text-gray-300 hover:bg-red-50 hover:text-red-500 transition-all"
                                                        title="Hủy đơn hàng"
                                                    >
                                                        <X size={16} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Items list */}
                                        <div className="flex-1 overflow-y-auto px-4 xl:px-5 py-4 space-y-2 max-h-[60vh] custom-scrollbar">
                                            {(order.cartItems || []).map((c, idx) => (
                                                <div key={idx} className="flex flex-wrap items-start justify-between gap-2 xl:gap-3 border-b border-gray-100 pb-3 mb-3 last:border-0 last:pb-0 last:mb-0">
                                                    <div className="flex-1 min-w-[150px]">
                                                        <span className={`${showCompletedOrders ? 'font-normal text-[15px]' : 'font-bold text-base'} text-gray-800`}>
                                                            {idx + 1}. {c.item?.name || 'Món'}
                                                            {c.isGift && <span className="ml-2 text-[10px] bg-brand-100 text-brand-700 font-black px-1.5 py-0.5 uppercase tracking-wider border border-brand-200">(QUÀ KM)</span>}
                                                        </span>
                                                        <div className="flex flex-wrap gap-2 mt-1.5 pl-4">
                                                            {c.size?.label && <span className={`${showCompletedOrders ? 'text-[12px] px-2 py-0.5 font-medium' : 'text-sm px-3 py-1 font-black'} bg-gray-100 text-gray-700 border border-gray-200`}>SIZE: {c.size.label}</span>}
                                                            {!c.size?.label && <span className={`${showCompletedOrders ? 'text-[12px] px-2 py-0.5 font-medium' : 'text-sm px-3 py-1 font-black'} bg-gray-100 text-gray-700 border border-gray-200`}>SIZE: Mặc định</span>}
                                                            {c.sugar && <span className={`${showCompletedOrders ? 'text-[12px] px-2 py-0.5 font-medium' : 'text-sm px-3 py-1 font-black'} bg-amber-50 text-amber-700 border border-amber-200`}>ĐƯỜNG: {c.sugar}</span>}
                                                            {c.ice && <span className={`${showCompletedOrders ? 'text-[12px] px-2 py-0.5 font-medium' : 'text-sm px-3 py-1 font-black'} bg-brand-50 text-brand-700 border border-brand-200`}>ĐÁ: {c.ice}</span>}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center justify-end gap-2 xl:gap-3 w-full sm:w-auto shrink-0 mt-2 sm:mt-0">
                                                        {isEditing && (
                                                            <button onClick={() => {
                                                                const updated = [...order.cartItems];
                                                                if (updated[idx].count > 1) {
                                                                    updated[idx] = { ...updated[idx], count: updated[idx].count - 1 };
                                                                } else {
                                                                    updated.splice(idx, 1);
                                                                }
                                                                updateOrder(order.id, updated);
                                                            }} className="w-7 h-7 flex items-center justify-center bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-all rounded-none"><Minus size={12} /></button>
                                                        )}
                                                        <span className={`${showCompletedOrders ? 'font-medium text-[15px]' : 'font-black text-base'} text-gray-700`}>x{c.count}</span>
                                                        {isEditing && (
                                                            <button onClick={() => {
                                                                const updated = [...order.cartItems];
                                                                updated[idx] = { ...updated[idx], count: updated[idx].count + 1 };
                                                                updateOrder(order.id, updated);
                                                            }} className="w-7 h-7 flex items-center justify-center bg-brand-600/10 text-brand-600 hover:bg-brand-600 hover:text-white transition-all rounded-none"><Plus size={12} /></button>
                                                        )}
                                                        <span className={`${showCompletedOrders ? 'font-medium text-[15px]' : 'font-black text-base'} text-[#C68E5E] min-w-[80px] text-right`}>{formatVND(c.totalPrice * c.count)}</span>
                                                    </div>
                                                </div>
                                            ))}
                                            {order.note && <p className="text-sm italic text-amber-600 bg-amber-50 px-3 py-2 mt-2 ">"{order.note}"</p>}
                                            {order.appliedPromoCode && (
                                                <div className="flex items-center gap-1 mt-2">
                                                    <span className="text-[10px] bg-brand-100 text-brand-700 font-black px-2 py-1 uppercase tracking-wider flex items-center gap-1">
                                                        <Gift size={10} /> KM: {order.appliedPromoCode}
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Footer */}
                                        <div className="px-5 pb-5 pt-3 border-t border-gray-100 space-y-3">
                                            <div className="flex justify-between items-center">
                                                <span className="text-sm text-gray-400 font-bold uppercase">Tổng tiền</span>
                                                <span className="font-black text-xl text-[#C68E5E]">{formatVND(order.price)}</span>
                                            </div>
                                            {isUnpaid && !order.isDebt && (
                                                <div className={`grid gap-2 ${isPending && settings.requirePrepayment === false ? 'grid-cols-2' : 'grid-cols-3'}`}>
                                                    {hasPermission('orders', 'edit') && (
                                                        <button onClick={() => { setEditOrder(order); setShowOrderPanel(true); }}
                                                            className="bg-gray-100 text-gray-700 py-3 font-black text-xs flex items-center justify-center gap-1 transition-all border border-gray-200 hover:bg-gray-200 rounded-none">
                                                            <Pencil size={16} /> SỬA
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={async () => {
                                                            try {
                                                                if (activeQrOrderId === order.id) {
                                                                    await fetch(`${SERVER_URL}/api/pos/checkout/stop`, { method: 'POST', headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` } });
                                                                    setActiveQrOrderId(null);
                                                                } else {
                                                                    await fetch(`${SERVER_URL}/api/pos/checkout/start`, {
                                                                        method: 'POST',
                                                                        headers: { 
                                                                            'Content-Type': 'application/json',
                                                                            'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                                                                        },
                                                                        body: JSON.stringify({ amount: order.price, orderId: order.id })
                                                                    });
                                                                    setActiveQrOrderId(order.id);
                                                                }
                                                            } catch (err) {
                                                                console.error(err);
                                                            }
                                                        }}
                                                        className={`py-3 font-black text-xs flex items-center justify-center gap-1 transition-all border rounded-none ${activeQrOrderId === order.id ? 'bg-brand-100 text-brand-700 border-brand-200' : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border-gray-200'}`}>
                                                        <QrCode size={16} /> {activeQrOrderId === order.id ? 'TẮT QR' : 'MỞ QR'}
                                                    </button>
                                                    {!(isPending && settings.requirePrepayment === false) && hasPermission('orders', 'edit') && (
                                                        <button onClick={() => confirmPayment(order.id)} className="bg-brand-500 hover:bg-[#2EB350] text-white py-4 px-2 font-black text-xs uppercase tracking-widest flex items-center justify-center gap-1 transition-all shadow-lg shadow-green-500/20 active:scale-[0.98] rounded-none">
                                                            <CheckCircle2 size={16} /> ĐÃ NHẬN TIỀN
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                            {order.isDebt && hasPermission('orders', 'edit') && (
                                                <div className="mt-2">
                                                    <button onClick={() => handlePayDebt(order.id)} className="w-full bg-purple-600 hover:bg-purple-700 text-white py-4 px-2 font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-lg rounded-none">
                                                        <BookOpen size={18} /> THANH TOÁN NỢ
                                                    </button>
                                                </div>
                                            )}
                                            {order.paymentReceipt && (
                                                <button onClick={() => setViewReceiptOrder(order)} className="w-full mt-2 bg-brand-50 hover:bg-brand-100 text-brand-700 py-3 font-black text-xs uppercase flex items-center justify-center gap-2 transition-all border border-brand-200 rounded-none">
                                                    <Camera size={16} /> Xem Ủy Nhiệm Chi
                                                </button>
                                            )}
                                            {isPending && settings.requirePrepayment === false && isUnpaid ? (
                                                <div className="grid grid-cols-2 gap-2 mt-2">
                                                    <button onClick={() => completeOrder(order.id)}
                                                        className="bg-brand-600 text-white py-4 font-black text-sm flex items-center justify-center gap-1 hover:bg-[#0066DD] transition-all shadow-md rounded-none uppercase tracking-widest">
                                                        <CheckCircle size={16} /> HOÀN TẤT
                                                    </button>
                                                    <button onClick={() => confirmPayment(order.id)}
                                                        className="bg-brand-500 text-white py-4 font-black text-sm flex items-center justify-center gap-1 hover:bg-[#2EB350] transition-all shadow-md rounded-none uppercase tracking-widest">
                                                        {hasPermission('orders', 'edit') ? <CheckCircle2 size={16} /> : <div className="w-4" />}
                                                        {hasPermission('orders', 'edit') ? 'ĐÃ NHẬN TIỀN' : ''}
                                                    </button>
                                                </div>
                                            ) : (
                                                ((isPending && (isPaid || settings.requirePrepayment === false)) || (isPaid && order.status !== 'COMPLETED')) && (
                                                    <div className="mt-2">
                                                        <button onClick={() => completeOrder(order.id)}
                                                            className="w-full bg-brand-600 text-white py-4 font-black text-lg flex items-center justify-center gap-2 hover:bg-[#0066DD] transition-all shadow-md rounded-none">
                                                            <CheckCircle size={20} /> HOÀN TẤT
                                                        </button>
                                                    </div>
                                                )
                                            )}
                                            {showCompletedOrders && order.status === 'COMPLETED' && (
                                                <div className="mt-2 text-center">
                                                    <button
                                                        onClick={async () => {
                                                            const selectedPrinter = localStorage.getItem('selectedPrinter');
                                                            if (!window.require) {
                                                                showToast('Tính năng in chỉ có trên ứng dụng máy tính', 'error');
                                                                return;
                                                            }
                                                            if (!selectedPrinter) {
                                                                showToast('Chưa chọn máy in mặc định trong cài đặt', 'error');
                                                                return;
                                                            }
                                                            const { ipcRenderer } = window.require('electron');
                                                            try {
                                                                const cartForPrint = order.cartItems || [];
                                                                const htmlContent = generateReceiptHTML(order, cartForPrint, settings, true);
                                                                await ipcRenderer.invoke('print-html', htmlContent, selectedPrinter, settings?.receiptPaperSize);
                                                                showToast('Đã gửi lệnh in lại bill', 'success');
                                                            } catch (err) {
                                                                console.error('Lỗi in hóa đơn:', err);
                                                            }
                                                        }}
                                                        className="w-full bg-brand-50 text-brand-700 py-3 font-black text-sm flex items-center justify-center gap-2 hover:bg-brand-100 transition-all border border-brand-200 mt-2 rounded-none">
                                                        <Printer size={16} /> IN LẠI BILL
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                            {/* SENTINEL CHO ORDER HISTORY */}
                            {colIndex === columns.length - 1 && (
                                <div ref={ordersSentinelRef} className="h-20 flex items-center justify-center w-full">
                                    {isLoadingMoreOrders && <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>}
                                    {!hasMoreOrders && orders.length > 20 && <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">ĐÃ TẢI HẾT LỊCH SỬ</p>}
                                </div>
                            )}
                        </div>
                    ))];
                })()}
                {orders.length === 0 && (
                    <div className="w-full text-center py-28 bg-white border-2 border-dashed border-gray-200 rounded-none">
                        <ClipboardCheck className="mx-auto mb-4 text-gray-200" size={56} strokeWidth={1} />
                        <p className="text-gray-400 font-black uppercase tracking-widest text-sm">Hệ thống đang trống</p>
                    </div>
                )}
            </div>

            {/* Visual Shortcut Buffer Indicator */}
            {orderShortcutBuffer && (
                <motion.div
                    initial={{ y: 50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="fixed bottom-32 left-1/2 -translate-x-1/2 bg-black/80 text-white px-8 py-4 flex items-center gap-4 shadow-2xl z-[500] border border-white/10"
                >
                    <div className="bg-brand-600 p-2">
                        <Keyboard size={24} />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Hoàn tất đơn số</span>
                        <span className="text-4xl font-black tracking-tighter">#{orderShortcutBuffer}</span>
                    </div>
                    <div className="ml-4 flex flex-col items-end gap-1">
                        <span className="text-[10px] font-bold bg-white/20 px-2 py-0.5">ENTER: XÁC NHẬN</span>
                        <span className="text-[10px] font-bold bg-white/20 px-2 py-0.5">ESC: HỦY</span>
                    </div>
                </motion.div>
            )}
        </motion.section>
    );
};

export default OrdersTab;
