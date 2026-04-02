import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    History, BookOpen, Star, DollarSign, QrCode, LayoutGrid, 
    ArrowDown, ArrowUp, ClipboardList, X, Minus, Plus, 
    Pencil, CheckCircle2, CheckCircle, Printer, Camera, ClipboardCheck,
    Keyboard, Gift, Clock
} from 'lucide-react';
import { isInputFocused } from '../../utils/ShortcutUtils.js';
import QuickPaymentModal from './QuickPaymentModal.jsx';

const CustomSwitch = ({ isOn, onToggle, activeColor = "#00DA50" }) => (
    <div
        onClick={onToggle}
        className="w-12 h-6 flex items-center p-1 cursor-pointer transition-colors duration-300"
        style={{ backgroundColor: isOn ? activeColor : '#E5E7EB', borderRadius: '9999px' }}
    >
        <motion.div
            layout
            className="w-4 h-4 bg-bg-surface shadow-sm"
            animate={{ x: isOn ? 24 : 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            style={{ borderRadius: '9999px' }}
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
    showOrderPanel,
}) => {
    const [orderShortcutBuffer, setOrderShortcutBuffer] = useState('');
    const [showPaymentModal, setShowPaymentModal] = useState(null); // order object | null
    const [isMobile, setIsMobile] = useState(window.innerWidth < 640);

    // Force 2 cột trên mobile
    useEffect(() => {
        const handleResize = () => {
            const mobile = window.innerWidth < 640;
            setIsMobile(mobile);
            if (mobile && orderGridColumns !== 2) {
                setOrderGridColumns(2);
            }
        };
        handleResize(); // run on mount
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [orderGridColumns, setOrderGridColumns]);

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
                        // Sắp xếp theo thờ gian tạo
                        const sorted = [...matchingOrders].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
                        const target = sorted[0];

                        if (target.status === 'COMPLETED') {
                            if (!target.isPaid && !target.isDebt) {
                                // Bếp đã xong nhưng chưa thu tiền → mở ngay QR/payment modal
                                setShowPaymentModal(target);
                            } else {
                                // Đã hoàn tất VÀ đã thanh toán/ghi nợ
                                showToast(`Đơn #${qNum} đã hoàn tất trước đó`, 'warning');
                            }
                        } else if (target.isPaid) {
                            // Đã thanh toán → hoàn tất ngay
                            completeOrder(target.id);
                        } else if (settings.requirePrepayment === false) {
                            // Chế độ Thanh toán SAU → hoàn tất kèm yêu cầu thu tiền
                            setShowPaymentModal(target);
                        } else {
                            // Chưa thanh toán → bắt buộc hiện modal thu tiền
                            setShowPaymentModal(target);
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
    }, [orderShortcutBuffer, orders, settings.requirePrepayment, showOrderPanel, showPaymentModal]);
    return (
        <motion.section key="orders" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} style={{ marginTop: '20px' }}>

            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar flex-nowrap" style={{ padding: '0 clamp(8px, 3vw, 24px)', marginBottom: '16px' }}>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                        onClick={() => {
                            const nextVal = !showCompletedOrders;
                            showCompletedOrdersRef.current = nextVal;
                            showDebtOrdersRef.current = false;
                            setShowCompletedOrders(nextVal);
                            setShowDebtOrders(false);
                            fetchOrders(true);
                        }}
                        className={`font-black text-[10px] sm:text-sm flex items-center gap-1.5 transition-all shadow-sm border whitespace-nowrap flex-shrink-0 ${showCompletedOrders ? 'bg-brand-50 text-brand-700 border-brand-200 hover:bg-brand-100' : 'bg-bg-surface text-gray-800 hover:bg-gray-50 border-gray-200'}`}
                        style={{ padding: '5px 10px', borderRadius: 'var(--radius-card)' }}
                    >
                        <History size={14} />
                        <span className="hidden xs:inline">{showCompletedOrders ? 'ĐƠN ĐANG LÀM' : 'ĐÃ BÁN'}</span>
                    </button>
                    {(orders.some(o => o.isDebt) || showDebtOrders || report?.hasDebt) && (
                        <button
                                onClick={() => {
                                    const nextVal = !showDebtOrders;
                                    showDebtOrdersRef.current = nextVal;
                                    showCompletedOrdersRef.current = false;
                                    setShowDebtOrders(nextVal);
                                    setShowCompletedOrders(false);
                                    fetchOrders(true);
                                }}
                                className={`font-black text-[10px] sm:text-sm flex items-center gap-1 transition-all shadow-sm border whitespace-nowrap flex-shrink-0 ${showDebtOrders ? 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100' : 'bg-bg-surface text-gray-800 hover:bg-gray-50 border-gray-200'}`}
                                style={{ padding: '5px 8px', borderRadius: 'var(--radius-card)' }}
                            >
                                <BookOpen size={13} />
                                <span className="hidden xs:inline">{showDebtOrders ? 'ĐANG LÀM' : 'NỢ'}</span>
                            </button>
                    )}
                </div>
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar flex-shrink-0">
                    {/* Toggle pills: compact, icon-only on mobile */}
                    <div className="flex items-center gap-1 bg-white border border-gray-100 shadow-sm cursor-pointer flex-shrink-0" onClick={() => setPriorityMode(!priorityMode)} title="Ưu tiên làm rõ đơn cũ nhất" style={{ padding: '4px 8px', borderRadius: '999px' }}>
                        <Star size={13} className={priorityMode ? 'text-amber-500 fill-amber-500' : 'text-slate-400'} />
                        <span className="hidden md:inline text-[10px] font-black text-slate-700">ƯU TIÊN</span>
                        <button className={`relative flex-shrink-0 rounded-full transition-colors duration-300 focus:outline-none ${priorityMode ? 'bg-amber-500' : 'bg-slate-200'}`} style={{ width: 28, height: 16 }}>
                            <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow-sm transform transition-transform duration-300 ${priorityMode ? 'translate-x-[12px]' : 'translate-x-0'}`} />
                        </button>
                    </div>
                    <div className="flex items-center gap-1 bg-white border border-gray-100 shadow-sm cursor-pointer flex-shrink-0" title="Thanh toán Trước/Sau" style={{ padding: '4px 8px', borderRadius: '999px' }} onClick={async () => {
                        if (!hasPermission('orders', 'edit')) { showToast('Bạn không có quyền thay đổi cài đặt này', 'error'); return; }
                        const newVal = settings.requirePrepayment === false ? true : false;
                        const newSettings = { ...settings, requirePrepayment: newVal };
                        try { const res = await fetch(`${SERVER_URL}/api/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newSettings) }); if (res.ok) setSettings(newSettings); } catch (e) { console.error(e); }
                    }}>
                        <DollarSign size={13} className="text-slate-500" />
                        <span className="text-[10px] font-black text-slate-700">{settings.requirePrepayment === false ? 'SAU' : 'TRƯỚC'}</span>
                        <button className={`relative flex-shrink-0 rounded-full transition-colors duration-300 focus:outline-none ${settings.requirePrepayment !== false ? 'bg-green-500' : 'bg-slate-200'}`} style={{ width: 28, height: 16 }}>
                            <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow-sm transform transition-transform duration-300 ${settings.requirePrepayment !== false ? 'translate-x-[12px]' : 'translate-x-0'}`} />
                        </button>
                    </div>
                    <div className="flex items-center gap-1 bg-white border border-gray-100 shadow-sm cursor-pointer flex-shrink-0" title="QR TT tự động" style={{ padding: '4px 8px', borderRadius: '999px' }} onClick={async () => {
                        const newVal = !settings.autoPushPaymentQr;
                        const newSettings = { ...settings, autoPushPaymentQr: newVal };
                        try { const res = await fetch(`${SERVER_URL}/api/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newSettings) }); if (res.ok) setSettings(newSettings); } catch (e) { console.error(e); }
                    }}>
                        <QrCode size={13} className="text-slate-500" />
                        <span className="hidden md:inline text-[10px] font-black text-slate-700">QR TT</span>
                        <button className={`relative flex-shrink-0 rounded-full transition-colors duration-300 focus:outline-none ${settings.autoPushPaymentQr !== false ? 'bg-green-500' : 'bg-slate-200'}`} style={{ width: 28, height: 16 }}>
                            <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow-sm transform transition-transform duration-300 ${settings.autoPushPaymentQr !== false ? 'translate-x-[12px]' : 'translate-x-0'}`} />
                        </button>
                    </div>
                    <div className="flex items-center gap-1 bg-white border border-gray-100 shadow-sm cursor-pointer flex-shrink-0" title="Mở/Tắt Kiosk" style={{ padding: '4px 8px', borderRadius: '999px' }} onClick={() => {
                        const newState = !settings.isKioskOpen;
                        const newSettings = { ...settings, isKioskOpen: newState };
                        setSettings(newSettings);
                        try { const { ipcRenderer } = window.require('electron'); if (newState) { ipcRenderer.send('open-kiosk'); } else { ipcRenderer.send('close-kiosk'); } } catch (e) { }
                    }}>
                        <LayoutGrid size={13} className="text-slate-500" />
                        <span className="hidden md:inline text-[10px] font-black text-slate-700">KIOSK</span>
                        <button className={`relative flex-shrink-0 rounded-full transition-colors duration-300 focus:outline-none ${settings.isKioskOpen ? 'bg-blue-500' : 'bg-slate-200'}`} style={{ width: 28, height: 16 }}>
                            <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow-sm transform transition-transform duration-300 ${settings.isKioskOpen ? 'translate-x-[12px]' : 'translate-x-0'}`} />
                        </button>
                    </div>
                </div>
                {showCompletedOrders && (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        <input
                            type="date"
                            value={historyDate}
                            onChange={(e) => {
                                const nextDate = e.target.value;
                                setHistoryDate(nextDate);
                                historyDateRef.current = nextDate;
                                fetchOrders(true);
                            }}
                            className="px-2 py-1 border border-gray-200 text-[10px] font-bold text-gray-700 bg-bg-surface shadow-sm focus:outline-none focus:ring-1 focus:ring-brand-500/50"
                        />
                        <button
                            onClick={() => setHistorySortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                            className="p-1.5 border border-gray-200 text-gray-700 bg-bg-surface shadow-sm flex items-center hover:bg-gray-50"
                            title="Sắp xếp thời gian"
                        >
                            {historySortOrder === 'desc' ? <ArrowDown size={14} /> : <ArrowUp size={14} />}
                        </button>
                    </div>
                )}
                
                <div className="hidden sm:flex items-center gap-1.5 shrink-0 ml-auto border-l border-gray-200 pl-3">
                    <button
                        title={`Đang hiển thị ${orderGridColumns} cột (Click để đổi)`}
                        onClick={() => setOrderGridColumns(prev => prev === 7 ? 3 : prev + 1)}
                        className="flex items-center justify-center transition-all bg-brand-50 border border-brand-600 shadow-sm hover:bg-brand-100 active:scale-95"
                        style={{ padding: '6px 12px', borderRadius: '16px' }}
                    >
                        <div className="flex items-center" style={{ gap: '4px' }}>
                            {Array.from({ length: orderGridColumns }).map((_, i) => (
                                <div key={i} className="bg-brand-600" style={{ width: '4px', height: '16px', borderRadius: '1px' }} />
                            ))}
                        </div>
                    </button>
                </div>
            </div>

            <div className={`w-full ${orders.length > 0 ? 'flex gap-3 sm:gap-5 xl:gap-7 items-start overflow-x-auto custom-scrollbar snap-x' : ''}`} style={{ padding: '8px clamp(8px, 2vw, 24px) 40px' }}>
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
                        <div key={colIndex} className="flex-1 flex flex-col gap-3 sm:gap-4 xl:gap-6 min-w-[140px] sm:min-w-[200px] md:min-w-[240px] xl:min-w-0 snap-center">
                            {colOrders.map(order => {
                                const isPending = order.status === 'PENDING';
                                const isAwaiting = order.status === 'AWAITING_PAYMENT';
                                const isPaid = order.isPaid;
                                const isUnpaid = !isPaid;
                                const isEditing = editingOrderId === order.id;
                                const isOldest = minQueue !== null && order.queueNumber === minQueue;
                                const isTagNumber = !!order.tagNumber;
                                const isCompact = orderGridColumns >= 5 || window.innerWidth <= 1024 || isMobile;
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
                                    dimClass += ' hover:opacity-100 hover:grayscale-0 bg-bg-surface';
                                } else if (!isOldest) {
                                    dimClass = 'bg-bg-surface shadow-md';
                                }

                                return (
                                    <div key={order.id}
                                        className={`break-inside-avoid mb-6 transition-all flex flex-col border overflow-hidden ${isOldest && priorityMode ? 'bg-bg-surface shadow-2xl ring-4 ring-brand-600/40 border-brand-600' : (isOldest ? 'bg-bg-surface shadow-lg ring-2 ring-brand-600/20 border-brand-600' : '')
                                            } ${dimClass} ${isEditing ? 'border-brand-600/40 shadow-xl ring-2 ring-brand-600/10 !opacity-100 !bg-bg-surface' :
                                                isUnpaid ? 'border-amber-200 ring-1 ring-amber-100' :
                                                    (isPending || isPaid) ? 'border-gray-200 hover:shadow-xl' : 'border-gray-100'
                                            }`}
                                        style={{ borderRadius: 'var(--radius-card)', containerType: 'inline-size' }}>
                                        {/* Header */}
                                        <div className="flex flex-wrap items-start justify-between border-b border-gray-100 bg-slate-50 relative" style={{ padding: isCompact ? '10px' : '24px', paddingRight: '56px', gap: isCompact ? '6px' : '16px' }}>
                                            {/* Pinned Time at Top Center */}
                                            <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-white text-gray-500 text-[10px] font-black px-2.5 py-0.5 border-x border-b border-gray-100 shadow-sm flex items-center gap-1" style={{ borderBottomLeftRadius: '6px', borderBottomRightRadius: '6px', zIndex: 10 }}>
                                                <Clock size={10}/>
                                                {new Date(order.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                            {/* Pinned Action Buttons */}
                                            <div className="absolute flex items-center justify-end" style={{ top: isCompact ? '12px' : '16px', right: isCompact ? '12px' : '14px' }}>
                                                {/* Status Icon */}
                                                <div className="flex items-center justify-center mr-1" style={{ width: '32px', height: '32px' }}>
                                                    {isPaid ? (
                                                        <CheckCircle2 size={18} className="text-green-500" title="Đã thanh toán" />
                                                    ) : isUnpaid && !order.isDebt ? (
                                                        <Clock size={18} className="text-amber-500" title="Chờ thanh toán" />
                                                    ) : order.isDebt ? (
                                                        <BookOpen size={18} className="text-purple-500" title="Đang ghi nợ" />
                                                    ) : null}
                                                </div>
{(isPending || isAwaiting || (isPaid && order.status !== 'COMPLETED')) && hasPermission('orders', 'edit') && (
    <button
        onClick={() => { setEditOrder(order); setShowOrderPanel(true); }}
        className="flex items-center justify-center text-gray-400 hover:bg-brand-50 hover:text-brand-600 transition-all"
        title="Sửa đơn hàng"
        style={{ width: '32px', height: '32px', borderRadius: 'var(--radius-btn)' }}
    >
        <Pencil size={18} />
    </button>
)}

{isPending && hasPermission('orders', 'delete') && (
    <button
        onClick={() => { setCancelOrderId(order.id); setCancelReason(''); }}
        className="flex items-center justify-center text-gray-300 hover:bg-red-50 hover:text-red-500 transition-all"
        title="Hủy đơn hàng"
        style={{ width: '32px', height: '32px', borderRadius: 'var(--radius-btn)' }}
    >
        <X size={20} />
    </button>
)}

                                            </div>


                                            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto flex-1">
                                                <div className={`font-black bg-brand-600 text-white flex items-center justify-center shadow-md rounded-xl ${isOldest ? 'animate-pulse' : ''}`} style={{ fontSize: 'clamp(16px, 8cqi, 24px)', width: 'clamp(40px, 15cqi, 56px)', height: 'clamp(40px, 15cqi, 56px)' }}>
                                                    {order.queueNumber}
                                                </div>
                                                {tableNameToDisplay && (
                                                    <div className={`text-sm font-black text-white w-12 h-12 flex flex-col items-center justify-center shadow-md border uppercase tracking-tighter shrink-0 rounded-xl ${isTagNumber ? 'bg-gray-800 border-gray-700' : 'bg-[#C68E5E] border-[#A67B5B]'}`}>
                                                        <span className="leading-none pt-1" style={{ fontSize: 'clamp(12px, 5cqi, 18px)' }}>{tableNameToDisplay}</span>
                                                        {tableAreaToDisplay && <span className="font-black opacity-90 mt-1 tracking-widest truncate w-full text-center px-0.5" style={{ fontSize: 'clamp(8px, 3cqi, 10px)' }}>{tableAreaToDisplay}</span>}
                                                    </div>
                                                )}
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <p className="font-black text-gray-900 truncate" style={{ fontSize: 'clamp(14px, 5cqi, 20px)' }}>{order.customerName}</p>
                                                    </div>
                                                    {isOldest && (
                                                        <span
                                                            className="text-[10px] font-black bg-brand-600 text-white uppercase tracking-wider whitespace-nowrap inline-block"
                                                            style={{ padding: '3px 10px', borderRadius: '9999px', marginBottom: '4px' }}
                                                        >
                                                            ★ ĐƠN CŨ NHẤT
                                                        </span>
                                                    )}
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-[10px] text-brand-500 font-black uppercase tracking-widest">ID: {order.id}</p>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto mt-1 sm:mt-0">
                                                {/* Status badges */}
                                                
                                                
                                                
                                                {order.status === 'COMPLETED' && !order.isPaid && !order.isDebt && hasPermission('orders', 'edit') && (
                                                    <button
                                                        onClick={() => handleMarkDebt(order.id)}
                                                        className="p-1 px-3 text-[10px] font-bold bg-gray-50 text-gray-500 hover:bg-purple-100 hover:text-purple-600 transition-all border border-gray-200"
                                                        style={{ borderRadius: 'var(--radius-badge)' }}
                                                        title="Ghi nợ đơn hàng này"
                                                    >
                                                        GHI NỢ
                                                    </button>
                                                )}



                                            </div>
                                        </div>

                                        {/* Items list */}
                                        <div className="flex-1 overflow-y-auto custom-scrollbar" style={{ padding: isMobile ? '10px 12px' : 'var(--spacing-card-body)', maxHeight: isMobile ? '50vh' : '60vh' }}>
                                            {(order.cartItems || []).map((c, idx) => {
                                                const optionsArr = [];
                                                if (c.size?.label) optionsArr.push(`Size: ${c.size.label}`);
                                                else optionsArr.push('Size: Mặc định');
                                                if (c.sugar) optionsArr.push(`Đường: ${c.sugar}`);
                                                if (c.ice) optionsArr.push(`Đá: ${c.ice}`);
                                                const optionText = optionsArr.join(' • ');

                                                return (
                                                <div key={idx} className="flex flex-col border-b border-gray-100 last:border-0 last:mb-0" style={{ paddingBottom: isMobile ? '8px' : '20px', marginBottom: isMobile ? '8px' : '20px' }}>
                                                    <div className="flex justify-between items-start gap-2">
                                                        <div className="flex-1 min-w-0 pr-1">
                                                            <span className={`${showCompletedOrders ? 'font-bold' : 'font-black'} text-gray-900 block leading-tight truncate whitespace-normal`} style={{ fontSize: isMobile ? '10px' : (showCompletedOrders ? '15px' : '18px') }}>
                                                                {idx + 1}. {c.item?.name || 'Món'}
                                                                {c.isGift && <Gift size={isMobile ? 12 : 16} strokeWidth={2.5} className="inline-block ml-1 mb-0.5 text-brand-500" title="Quà Tặng Mãi" />}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center justify-end gap-1.5 shrink-0 pt-0.5">
                                                            {isEditing && (
                                                                <button onClick={() => {
                                                                    const updated = [...order.cartItems];
                                                                    if (updated[idx].count > 1) {
                                                                        updated[idx] = { ...updated[idx], count: updated[idx].count - 1 };
                                                                    } else {
                                                                        updated.splice(idx, 1);
                                                                    }
                                                                    updateOrder(order.id, updated);
                                                                }} className="flex items-center justify-center bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-all rounded-full shadow-sm" style={{ width: isMobile ? '24px' : '32px', height: isMobile ? '24px' : '32px' }}><Minus size={isMobile ? 10 : 14} /></button>
                                                            )}
                                                            <span className="font-black text-gray-700" style={{ fontSize: isMobile ? '10px' : (showCompletedOrders ? '16px' : '18px') }}>x{c.count}</span>
                                                            {isEditing && (
                                                                <button onClick={() => {
                                                                    const updated = [...order.cartItems];
                                                                    updated[idx] = { ...updated[idx], count: updated[idx].count + 1 };
                                                                    updateOrder(order.id, updated);
                                                                }} className="flex items-center justify-center bg-brand-50 text-brand-600 hover:bg-brand-600 hover:text-white transition-all rounded-full shadow-sm" style={{ width: isMobile ? '24px' : '32px', height: isMobile ? '24px' : '32px' }}><Plus size={isMobile ? 10 : 14} /></button>
                                                            )}
                                                            <span className="font-black text-[#C68E5E] text-right tracking-tight" style={{ fontSize: isMobile ? '10px' : (showCompletedOrders ? '16px' : '18px'), minWidth: isMobile ? '45px' : '80px' }}>{formatVND(c.totalPrice * c.count)}</span>
                                                        </div>
                                                    </div>
                                                    {optionText && (
                                                        <div className="font-bold text-gray-500 mt-1 leading-snug w-full" style={{ fontSize: isMobile ? '8px' : '13px', paddingLeft: isMobile ? '10px' : '20px' }}>
                                                            <span>{optionText}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            )})}
                                            {order.note && <p className="text-sm italic font-medium text-amber-700 bg-amber-50 px-3 py-2 mt-2">"{order.note}"</p>}
                                            {order.appliedPromoCode && (
                                                <div className="flex items-center gap-1 mt-2">
                                                    <span className="text-[11px] bg-brand-50 text-brand-600 font-bold px-2.5 py-1 uppercase flex items-center gap-1.5">
                                                        <Gift size={12} /> KM: {order.appliedPromoCode}
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Footer */}
                                        <div className="border-t border-gray-100" style={{ padding: isMobile ? '8px 12px' : 'var(--spacing-card-footer)' }}>
                                            <div className="flex justify-between items-center" style={{ marginBottom: isMobile ? '6px' : '8px' }}>
                                                <div className="flex items-center gap-1.5">
                                                {isUnpaid && !order.isDebt && (
                                                    <button
                                                        onClick={async () => {
                                                            try {
                                                                if (activeQrOrderId === order.id) {
                                                                    await fetch(`${SERVER_URL}/api/pos/checkout/stop`, { method: 'POST', headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` } });
                                                                    setActiveQrOrderId(null);
                                                                } else {
                                                                    await fetch(`${SERVER_URL}/api/pos/checkout/start`, {
                                                                        method: 'POST',
                                                                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('authToken')}` },
                                                                        body: JSON.stringify({ amount: order.price, orderId: order.id })
                                                                    });
                                                                    setActiveQrOrderId(order.id);
                                                                }
                                                            } catch (err) { console.error(err); }
                                                        }}
                                                        className={`font-bold text-[9px] sm:text-[10px] flex items-center justify-center gap-1 transition-all outline-none shadow-sm hover:shadow ${activeQrOrderId === order.id ? 'bg-brand-50 text-brand-700 border border-brand-200' : 'bg-bg-surface text-gray-700 hover:bg-gray-50 border border-gray-200'}`}
                                                        style={{ minHeight: isMobile ? '22px' : '26px', padding: isMobile ? '1px 6px' : '2px 8px', borderRadius: 'var(--radius-badge)' }}
                                                    >
                                                        <QrCode size={isMobile ? 11 : 13} /> {activeQrOrderId === order.id ? 'Tắt' : 'QR'}
                                                    </button>
                                                )}
                                                <span className="font-bold text-gray-400 uppercase" style={{ fontSize: isMobile ? '9px' : '12px' }}>Tổng</span>
                                                </div>
                                                <span className="font-black text-[#C68E5E]" style={{ fontSize: isMobile ? '15px' : '20px' }}>{formatVND(order.price)}</span>
                                            </div>
                                            {/* Scenario A: Trả trước — chỉ show ĐÃ NHẬN TIỀN */}
                                            {isUnpaid && !order.isDebt && !(isPending && settings.requirePrepayment === false) && hasPermission('orders', 'edit') && (
                                                <button onClick={() => confirmPayment(order.id)}
                                                    className="w-full bg-brand-600 hover:bg-brand-700 outline-none text-white font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-md hover:shadow-lg active:scale-[0.98] border border-transparent"
                                                    style={{ fontSize: isMobile ? '11px' : '14px', minHeight: isMobile ? '34px' : '40px', borderRadius: 'var(--radius-btn)' }}>
                                                    <CheckCircle2 size={isMobile ? 14 : 17} /> ĐÃ NHẬN TIỀN
                                                </button>
                                            )}
                                            {order.isDebt && hasPermission('orders', 'edit') && (
                                                <button onClick={() => handlePayDebt(order.id)}
                                                    className="w-full bg-purple-600 hover:bg-purple-700 text-white font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all shadow-md outline-none border border-transparent"
                                                    style={{ fontSize: isMobile ? '11px' : '14px', minHeight: isMobile ? '34px' : '40px', borderRadius: 'var(--radius-btn)' }}>
                                                    <BookOpen size={isMobile ? 14 : 17} /> THANH TOÁN NỢ
                                                </button>
                                            )}
                                            {order.paymentReceipt && (
                                                <button onClick={() => setViewReceiptOrder(order)}
                                                    className="w-full bg-bg-surface hover:bg-brand-50 text-brand-700 font-bold flex items-center justify-center gap-1.5 transition-all border border-brand-200 shadow-sm outline-none"
                                                    style={{ fontSize: isMobile ? '11px' : '14px', minHeight: isMobile ? '32px' : '40px', borderRadius: 'var(--radius-btn)' }}>
                                                    <Camera size={isMobile ? 13 : 16} /> Xem UNC
                                                </button>
                                            )}

                                            {/* Scenario B: Trả sau — show HOÀN TẤT + ĐÃ NHẬN TIỀN */}
                                            {isPending && settings.requirePrepayment === false && isUnpaid ? (
                                                <div className="grid grid-cols-2 gap-2" style={{ marginTop: '4px' }}>
                                                    <button onClick={() => completeOrder(order.id)}
                                                        className="bg-brand-600 text-white font-black flex items-center justify-center gap-1 hover:bg-brand-700 transition-all shadow-sm uppercase tracking-widest outline-none border border-transparent" style={{ fontSize: isMobile ? '10px' : 'clamp(11px, 3.5cqi, 14px)', minHeight: isMobile ? '32px' : (isCompact ? '36px' : '44px'), borderRadius: 'var(--radius-btn)' }}>
                                                        <CheckCircle size={isMobile ? 13 : 17} /> HOÀN TẤT
                                                    </button>
                                                    <button onClick={() => confirmPayment(order.id)}
                                                        className="bg-brand-50 text-brand-700 border border-brand-200 font-black flex items-center justify-center gap-1 hover:bg-brand-100 transition-all shadow-sm uppercase tracking-widest outline-none" style={{ fontSize: isMobile ? '10px' : 'clamp(11px, 3.5cqi, 14px)', minHeight: isMobile ? '32px' : (isCompact ? '36px' : '44px'), borderRadius: 'var(--radius-btn)' }}>
                                                        {hasPermission('orders', 'edit') ? <CheckCircle2 size={isMobile ? 13 : 17} /> : <div className="w-4" />}
                                                        {hasPermission('orders', 'edit') ? 'ĐÃ NHẬN' : ''}
                                                    </button>
                                                </div>
                                            ) : (
                                                ((isPending && (isPaid || settings.requirePrepayment === false)) || (isPaid && order.status !== 'COMPLETED')) && (
                                                    <div style={{ marginTop: '4px' }}>
                                                        <button onClick={() => completeOrder(order.id)}
                                                            className="w-full bg-brand-600 text-white font-black uppercase tracking-wider flex items-center justify-center gap-1.5 hover:bg-brand-700 active:scale-[0.98] transition-all shadow-md shadow-brand-500/20 outline-none border border-transparent"
                                                            style={{ fontSize: isMobile ? '11px' : '15px', minHeight: isMobile ? '34px' : '44px', borderRadius: 'var(--radius-btn)' }}>
                                                            <CheckCircle size={isMobile ? 14 : 18} /> HOÀN TẤT ĐƠN
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
                                                        className="w-full bg-bg-surface text-gray-600 font-bold text-sm flex items-center justify-center gap-2 hover:bg-gray-50 transition-all border border-gray-200 shadow-sm mt-3 outline-none"
                                                        style={{ minHeight: '44px' }}>
                                                        <Printer size={18} /> In lại Bill
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
                    <div className="w-full flex-shrink-0 flex flex-col justify-center items-center py-28 bg-bg-surface border-2 border-dashed border-gray-200" style={{ borderRadius: 'var(--radius-card, 16px)' }}>
                        <ClipboardCheck className="mb-4 text-gray-200" size={56} strokeWidth={1} />
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
                    <div className="bg-brand-600" style={{ padding: '8px' }}>
                        <Keyboard size={24} />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Hoàn tất đơn số</span>
                        <span className="text-4xl font-black tracking-tighter">#{orderShortcutBuffer}</span>
                    </div>
                    <div className="ml-4 flex flex-col items-end gap-1">
                        <span className="text-[10px] font-bold bg-bg-surface/20 px-2 py-0.5">ENTER: XÁC NHẬN</span>
                        <span className="text-[10px] font-bold bg-bg-surface/20 px-2 py-0.5">ESC: HỦY</span>
                    </div>
                </motion.div>
            )}
            {/* Quick Payment Modal */}
            <AnimatePresence>
                {showPaymentModal && (
                    <QuickPaymentModal
                        order={showPaymentModal}
                        onClose={() => setShowPaymentModal(null)}
                        onConfirmPayment={async (id) => { await confirmPayment(id); }}
                        onCompleteOrder={async (id) => { await completeOrder(id); }}
                        formatVND={formatVND}
                        settings={settings}
                        generateReceiptHTML={generateReceiptHTML}
                        SERVER_URL={SERVER_URL}
                        showToast={showToast}
                    />
                )}
            </AnimatePresence>
        </motion.section>
    );
};

export default OrdersTab;
