import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, Calendar, Loader2, Coffee, RefreshCw } from 'lucide-react';
import { SERVER_URL } from '../../api';

/* ─── Helpers ─────────────────────────────────────────────────── */
const authHdr = () => ({ Authorization: `Bearer ${localStorage.getItem('authToken')}` });

/** Lấy ngày Monday của tuần chứa `date` (theo giờ VN) */
const getMonday = (date) => {
    const d = new Date(date);
    // Tính theo giờ local
    const day = d.getDay(); // 0=CN, 1=T2...6=T7
    const diff = (day === 0) ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
};

/** Format ngày theo dạng YYYY-MM-DD (local) */
const toDateStr = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

/** Format ngày ngắn gọn: "02/04" */
const fmtShortDate = (date) =>
    `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;

/** Format giờ từ price (nghìn đồng → VND) */
const fmtVND = (v) =>
    new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Math.round(v * 1000)) + 'đ';

/** Format giờ kiểu 7:30 */
const fmtHourMin = (isoStr) => {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    // UTC+7
    const h = (d.getUTCHours() + 7) % 24;
    const m = d.getUTCMinutes();
    return `${h}:${String(m).padStart(2, '0')}`;
};

/* ─── Màu sắc cho block ─────────────────────────────────────────── */
const getBlockColor = (orderCount, maxInWeek) => {
    if (orderCount === 0) return null;
    const intensity = maxInWeek > 0 ? orderCount / maxInWeek : 0;
    if (intensity <= 0.25) return { bg: '#DBEAFE', border: '#93C5FD', text: '#1D4ED8' }; // xanh nhạt
    if (intensity <= 0.5)  return { bg: '#60A5FA', border: '#2563EB', text: '#fff' };    // xanh vừa
    if (intensity <= 0.75) return { bg: '#2563EB', border: '#1D4ED8', text: '#fff' };    // xanh đậm
    return { bg: '#1E40AF', border: '#1E3A8A', text: '#fff' };                            // xanh rất đậm
};

/* ─── Màu heatmap toàn quán ─────────────────────────────────────── */
const getHeatColor = (count, maxCount) => {
    if (!count || !maxCount) return { bg: '#F1F5F9', text: '#94A3B8' };
    const ratio = count / maxCount;
    if (ratio <= 0.2)  return { bg: '#EFF6FF', text: '#93C5FD' };
    if (ratio <= 0.4)  return { bg: '#DBEAFE', text: '#2563EB' };
    if (ratio <= 0.6)  return { bg: '#60A5FA', text: '#1D4ED8' };
    if (ratio <= 0.8)  return { bg: '#2563EB', text: '#fff' };
    return { bg: '#DC2626', text: '#fff' }; // cực cao điểm = đỏ
};

/* ─── Tooltip Component ─────────────────────────────────────────── */
const OrderTooltip = ({ tooltip, onClose }) => {
    if (!tooltip) return null;
    const { x, y, cellOrders, dayLabel, hourLabel } = tooltip;

    // Tính vị trí an toàn
    const tooltipWidth = 240;
    const tooltipHeight = Math.min(220, 80 + cellOrders.length * 56);
    const safeX = Math.min(x, window.innerWidth - tooltipWidth - 12);
    const safeY = y + tooltipHeight + 20 > window.innerHeight
        ? y - tooltipHeight - 8
        : y + 8;

    return (
        <div
            style={{
                position: 'fixed',
                left: safeX,
                top: safeY,
                zIndex: 9999,
                width: tooltipWidth,
                background: '#1E293B',
                borderRadius: 12,
                boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
                overflow: 'hidden',
                pointerEvents: 'none',
            }}
        >
            {/* Header */}
            <div style={{
                background: 'rgba(255,255,255,0.08)',
                padding: '8px 12px',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
            }}>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 900, color: '#60A5FA', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {dayLabel} · {hourLabel}
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 10, color: '#94A3B8', fontWeight: 600 }}>
                    {cellOrders.length} đơn hàng
                </p>
            </div>
            {/* Orders list */}
            <div style={{ padding: '8px 12px', maxHeight: 160, overflowY: 'auto' }}>
                {cellOrders.map((o, idx) => (
                    <div key={o.orderId} style={{
                        paddingBottom: idx < cellOrders.length - 1 ? 8 : 0,
                        marginBottom: idx < cellOrders.length - 1 ? 8 : 0,
                        borderBottom: idx < cellOrders.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                            <span style={{ fontSize: 10, color: '#94A3B8' }}>{fmtHourMin(o.timestamp)}</span>
                            <span style={{ fontSize: 12, fontWeight: 900, color: '#34D399' }}>{fmtVND(o.price)}</span>
                        </div>
                        {o.items.slice(0, 3).map((item, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                                <Coffee size={10} color="#60A5FA" style={{ flexShrink: 0 }} />
                                <span style={{ fontSize: 11, color: '#E2E8F0', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {item.name}{item.size ? ` (${item.size})` : ''} {item.count > 1 ? `×${item.count}` : ''}
                                </span>
                            </div>
                        ))}
                        {o.items.length > 3 && (
                            <p style={{ margin: '2px 0 0', fontSize: 10, color: '#64748B' }}>+{o.items.length - 3} món khác...</p>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

/* ─── Main Component ─────────────────────────────────────────────── */
const CustomerDrinkingCalendar = ({ customerId, customer }) => {
    // ── State — tuân thủ thứ tự: tất cả useState trước computed values ──
    const [weekStart, setWeekStart]   = useState(() => {
        const refDate = (customer && customer.lastVisit) ? new Date(customer.lastVisit) : new Date();
        return getMonday(refDate);
    });
    const [orders, setOrders]         = useState([]);
    const [heatmap, setHeatmap]       = useState({});
    const [hourTotal, setHourTotal]   = useState({});
    const [storeHours, setStoreHours] = useState(() => {
        const startStr = localStorage.getItem('cafe-op-start') || '06:00';
        const endStr = localStorage.getItem('cafe-op-end') || '22:00';
        return {
            start: parseInt(startStr.split(':')[0], 10),
            end: parseInt(endStr.split(':')[0], 10)
        };
    });
    const [loading, setLoading]       = useState(false);
    const [heatLoading, setHeatLoading] = useState(false);
    const [tooltip, setTooltip]       = useState(null);

    const containerRef = useRef(null);

    // ── Computed values (sau khi có state) ──
    const weekStartStr = toDateStr(weekStart);

    // Ngày của từng cột T2→CN
    const weekDays = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        return d;
    });

    // Nhãn ngày thứ
    const DAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

    // Dải giờ hiển thị
    const HOURS = Array.from(
        { length: storeHours.end - storeHours.start },
        (_, i) => storeHours.start + i
    );

    // Build cellMap: key "dayOfWeek-hour" → [...orders]
    const cellMap = {};
    orders.forEach(o => {
        if (o.dayOfWeek == null || o.hour == null) return;
        const key = `${o.dayOfWeek}-${o.hour}`;
        if (!cellMap[key]) cellMap[key] = [];
        cellMap[key].push(o);
    });

    // Tính maxOrderCount trong 1 ô để normalize màu
    const maxInWeek = Math.max(1, ...Object.values(cellMap).map(arr => arr.length));

    // Tính max cho hourTotal heatmap
    const maxHourTotal = Math.max(1, ...Object.values(hourTotal).map(v => v));

    // ── Fetch ──
    const fetchOrders = useCallback(async () => {
        if (!customerId) return;
        setLoading(true);
        try {
            const r = await fetch(
                `${SERVER_URL}/api/loyalty/admin/customers/${customerId}/weekly-orders?weekStart=${weekStartStr}`,
                { headers: authHdr() }
            );
            const d = await r.json();
            if (d.success) setOrders(d.orders || []);
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, [customerId, weekStartStr]);

    const fetchHeatmap = useCallback(async () => {
        setHeatLoading(true);
        try {
            const r = await fetch(
                `${SERVER_URL}/api/loyalty/admin/store-heatmap?weekStart=${weekStartStr}`,
                { headers: authHdr() }
            );
            const d = await r.json();
            if (d.success) {
                setHeatmap(d.heatmap || {});
                setHourTotal(d.hourTotal || {});
            }
        } catch { /* silent */ }
        finally { setHeatLoading(false); }
    }, [weekStartStr]);

    useEffect(() => {
        fetchOrders();
        fetchHeatmap();
    }, [fetchOrders, fetchHeatmap]);

    // Khi customer thay đổi, nhảy đến tuần chứa lần truy cập cuối (nếu có)
    useEffect(() => {
        if (!customer) return;
        const refDate = customer.lastVisit ? new Date(customer.lastVisit) : new Date();
        setWeekStart(getMonday(refDate));
    }, [customerId, customer?.lastVisit]);

    // ── Điều hướng tuần ──
    const goToPrevWeek = () => {
        setWeekStart(prev => {
            const d = new Date(prev);
            d.setDate(d.getDate() - 7);
            return d;
        });
        setTooltip(null);
    };

    const goToNextWeek = () => {
        setWeekStart(prev => {
            const d = new Date(prev);
            d.setDate(d.getDate() + 7);
            return d;
        });
        setTooltip(null);
    };

    const goToCurrentWeek = () => {
        setWeekStart(getMonday(new Date()));
        setTooltip(null);
    };

    const isCurrentWeek = toDateStr(getMonday(new Date())) === weekStartStr;

    // ── Hover cell ──
    const handleCellMouseEnter = (e, cellOrders, dayIdx, hour) => {
        if (!cellOrders || cellOrders.length === 0) return;
        const rect = e.currentTarget.getBoundingClientRect();
        setTooltip({
            x: rect.left,
            y: rect.bottom,
            cellOrders,
            dayLabel: DAY_LABELS[dayIdx - 1],
            hourLabel: `${hour}:00 – ${hour + 1}:00`,
        });
    };

    const handleCellMouseLeave = () => {
        setTooltip(null);
    };

    // Sự kiện scroll đóng tooltip
    useEffect(() => {
        const handleScroll = () => setTooltip(null);
        window.addEventListener('scroll', handleScroll, true);
        return () => window.removeEventListener('scroll', handleScroll, true);
    }, []);

    /* ── Render ── */
    const weekEndDay = new Date(weekStart);
    weekEndDay.setDate(weekEndDay.getDate() + 6);

    return (
        <div
            ref={containerRef}
            style={{ padding: '16px 16px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}
        >
            {/* ── Header điều hướng tuần ── */}
            <div style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: 'var(--radius-card)',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
            }}>
                <button
                    onClick={goToPrevWeek}
                    style={{
                        width: 32, height: 32, borderRadius: '50%',
                        border: '1px solid #E2E8F0', background: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', color: '#374151',
                        transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#EFF6FF'}
                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                >
                    <ChevronLeft size={16} />
                </button>

                <div style={{ textAlign: 'center', flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 900, color: '#111827', lineHeight: 1.2 }}>
                        {fmtShortDate(weekStart)} – {fmtShortDate(weekEndDay)}/{weekEndDay.getFullYear()}
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: 10, color: '#9CA3AF', fontWeight: 600 }}>
                        {orders.length} đơn
                        {!isCurrentWeek && (
                            <button
                                onClick={goToCurrentWeek}
                                style={{
                                    marginLeft: 8, fontSize: 10, fontWeight: 800, color: 'var(--color-brand)',
                                    background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline',
                                }}
                            >
                                Tuần này
                            </button>
                        )}
                    </p>
                </div>

                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {(loading || heatLoading) && (
                        <Loader2 size={14} className="animate-spin" style={{ color: 'var(--color-brand)' }} />
                    )}
                    <button
                        onClick={() => { fetchOrders(); fetchHeatmap(); }}
                        title="Tải lại"
                        style={{
                            width: 28, height: 28, borderRadius: '50%',
                            border: '1px solid #E2E8F0', background: '#fff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', color: '#6B7280',
                        }}
                    >
                        <RefreshCw size={12} />
                    </button>
                    <button
                        onClick={goToNextWeek}
                        style={{
                            width: 32, height: 32, borderRadius: '50%',
                            border: '1px solid #E2E8F0', background: '#fff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', color: '#374151',
                            transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#EFF6FF'}
                        onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>

            {/* ── Calendar Grid — Apple Calendar Style ── */}
            <div style={{
                border: '1px solid #E2E8F0',
                borderRadius: 'var(--radius-card)',
                overflow: 'hidden',
                background: '#fff',
            }}>
                {/* Sticky Header Row: Giờ + T2→CN */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: '40px repeat(7, 1fr)',
                    background: '#F8FAFC',
                    borderBottom: '1px solid #E2E8F0',
                }}>
                    {/* Ô góc trái trên */}
                    <div style={{
                        padding: '8px 4px',
                        borderRight: '1px solid #E2E8F0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}>
                        <Calendar size={12} color="#9CA3AF" />
                    </div>
                    {/* Header ngày T2→CN */}
                    {weekDays.map((day, idx) => {
                        const isToday = toDateStr(day) === toDateStr(new Date());
                        return (
                            <div key={idx} style={{
                                padding: '6px 4px',
                                textAlign: 'center',
                                borderRight: idx < 6 ? '1px solid #E2E8F0' : 'none',
                            }}>
                                <p style={{
                                    margin: 0, fontSize: 10, fontWeight: 900,
                                    color: isToday ? 'var(--color-brand)' : '#6B7280',
                                    textTransform: 'uppercase', letterSpacing: '0.04em',
                                }}>
                                    {DAY_LABELS[idx]}
                                </p>
                                <p style={{
                                    margin: '1px 0 0', fontSize: 11, fontWeight: 800,
                                    color: isToday ? 'var(--color-brand)' : '#374151',
                                }}>
                                    {fmtShortDate(day)}
                                </p>
                                {isToday && (
                                    <div style={{
                                        width: 4, height: 4, borderRadius: '50%',
                                        background: 'var(--color-brand)',
                                        margin: '2px auto 0',
                                    }} />
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Rows theo giờ */}
                {HOURS.length === 0 ? (
                    <div style={{ padding: 20, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>
                        Không có khung giờ nào được cấu hình
                    </div>
                ) : (
                    HOURS.map((hour) => (
                        <div
                            key={hour}
                            style={{
                                display: 'grid',
                                gridTemplateColumns: '40px repeat(7, 1fr)',
                                borderBottom: hour < storeHours.end - 1 ? '1px solid #F1F5F9' : 'none',
                                minHeight: 48,
                            }}
                        >
                            {/* Label giờ */}
                            <div style={{
                                borderRight: '1px solid #E2E8F0',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '4px 2px',
                                background: '#FAFAFA',
                                flexShrink: 0,
                            }}>
                                <span style={{
                                    fontSize: 10, fontWeight: 800, color: '#9CA3AF',
                                    writingMode: 'horizontal-tb',
                                }}>
                                    {hour}h
                                </span>
                            </div>

                            {/* Cells cho mỗi ngày */}
                            {Array.from({ length: 7 }, (_, dayIdx) => {
                                const dayOfWeek = dayIdx + 1; // 1=T2...7=CN
                                const cellKey = `${dayOfWeek}-${hour}`;
                                const cellOrders = cellMap[cellKey] || [];
                                const count = cellOrders.length;
                                const colors = getBlockColor(count, maxInWeek);

                                // Heatmap toàn quán cho ô này
                                const storeCount = heatmap[cellKey] || 0;

                                return (
                                    <div
                                        key={dayIdx}
                                        style={{
                                            borderRight: dayIdx < 6 ? '1px solid #F1F5F9' : 'none',
                                            position: 'relative',
                                            minHeight: 48,
                                            padding: 3,
                                            cursor: count > 0 ? 'pointer' : 'default',
                                        }}
                                        onMouseEnter={count > 0
                                            ? (e) => handleCellMouseEnter(e, cellOrders, dayOfWeek, hour)
                                            : undefined
                                        }
                                        onMouseLeave={count > 0 ? handleCellMouseLeave : undefined}
                                    >
                                        {/* Block màu của khách này */}
                                        {count > 0 && colors && (
                                            <div style={{
                                                width: '100%',
                                                minHeight: 34,
                                                borderRadius: 6,
                                                background: colors.bg,
                                                border: `1.5px solid ${colors.border}`,
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                padding: '3px 2px',
                                                gap: 1,
                                                transition: 'transform 0.1s, box-shadow 0.1s',
                                            }}
                                                onMouseEnter={e => {
                                                    e.currentTarget.style.transform = 'scale(1.04)';
                                                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(37,99,235,0.25)';
                                                    e.currentTarget.style.zIndex = '2';
                                                }}
                                                onMouseLeave={e => {
                                                    e.currentTarget.style.transform = 'scale(1)';
                                                    e.currentTarget.style.boxShadow = 'none';
                                                    e.currentTarget.style.zIndex = '1';
                                                }}
                                            >
                                                <Coffee size={12} color={colors.text} />
                                                {count > 1 && (
                                                    <span style={{
                                                        fontSize: 9, fontWeight: 900, color: colors.text,
                                                        background: 'rgba(255,255,255,0.25)',
                                                        borderRadius: 99, paddingInline: 4,
                                                        lineHeight: '14px',
                                                    }}>
                                                        ×{count}
                                                    </span>
                                                )}
                                            </div>
                                        )}

                                        {/* Heatmap toàn quán — dải xanh nhạt phía dưới (nếu có đơn trong quán nhưng khách không ghé) */}
                                        {storeCount > 0 && count === 0 && (
                                            <div style={{
                                                position: 'absolute',
                                                bottom: 3,
                                                left: 3,
                                                right: 3,
                                                height: 4,
                                                borderRadius: 2,
                                                background: '#BFDBFE',
                                                opacity: Math.min(1, storeCount / (maxHourTotal || 1) + 0.2),
                                            }} />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ))
                )}
            </div>

            {/* ── Legend ── */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 14, height: 14, borderRadius: 3, background: '#DBEAFE', border: '1.5px solid #93C5FD' }} />
                    <span style={{ fontSize: 10, color: '#6B7280', fontWeight: 600 }}>1 đơn</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 14, height: 14, borderRadius: 3, background: '#2563EB', border: '1.5px solid #1D4ED8' }} />
                    <span style={{ fontSize: 10, color: '#6B7280', fontWeight: 600 }}>Nhiều đơn</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 14, height: 4, borderRadius: 2, background: '#BFDBFE' }} />
                    <span style={{ fontSize: 10, color: '#6B7280', fontWeight: 600 }}>Quán có đơn (khách không ghé)</span>
                </div>
                <span style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 600, marginLeft: 'auto' }}>
                    Hover vào block → xem chi tiết đơn
                </span>
            </div>



            {/* Tooltip overlay */}
            <OrderTooltip tooltip={tooltip} />
        </div>
    );
};

export default CustomerDrinkingCalendar;
