import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion'; // eslint-disable-line no-unused-vars
import {
    Search, User, Award, Plus, DollarSign, Loader2,
    TrendingUp, Phone, X, CheckCircle, Star,
    UserPlus, RefreshCw, Edit2, BarChart2, Clock, Gift, AlertTriangle, Send, CalendarDays
} from 'lucide-react';
import { SERVER_URL } from '../../api';
import CustomerDrinkingCalendar from './CustomerDrinkingCalendar';

/* ─── Helpers ─────────────────────────────────────────────────── */
const formatVND = (v) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(v || 0);

const formatDate = (s) => {
    if (!s) return '—';
    return new Date(s).toLocaleString('vi-VN', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
};

/* Tier definitions */
const TIER = {
    'Bạc':       { icon: '🥈', next: 'Vàng',      nextAt: 5_000_000,  barColor: '#9CA3AF', badgeBg: '#F3F4F6', badgeFg: '#374151', badgeBorder: '#D1D5DB' },
    'Vàng':      { icon: '🥇', next: 'Kim Cương',  nextAt: 15_000_000, barColor: '#F59E0B', badgeBg: '#FFFBEB', badgeFg: '#92400E', badgeBorder: '#FCD34D' },
    'Kim Cương': { icon: '💎', next: null,          nextAt: null,       barColor: '#8B5CF6', badgeBg: '#F5F3FF', badgeFg: '#5B21B6', badgeBorder: '#C4B5FD' },
};
const TIER_BASE = { 'Bạc': 0, 'Vàng': 5_000_000, 'Kim Cương': 15_000_000 };

const getTier = (name) => TIER[name] || TIER['Bạc'];

const getProgress = (c) => {
    const t = getTier(c.tier);
    if (!t.nextAt) return { percent: 100, remaining: 0, label: null };
    const base  = TIER_BASE[c.tier] || 0;
    const range = t.nextAt - base;
    const done  = Math.max(0, (c.totalSpent || 0) - base);
    return {
        percent:   Math.min(100, Math.round((done / range) * 100)),
        remaining: Math.max(0, t.nextAt - (c.totalSpent || 0)),
        label:     t.next,
    };
};

const authHdr = () => ({ Authorization: `Bearer ${localStorage.getItem('authToken')}` });
const jsonHdrs = () => ({ 'Content-Type': 'application/json', ...authHdr() });

/* ─── Sub-components ──────────────────────────────────────────── */
// eslint-disable-next-line no-unused-vars
const StatCard = ({ icon: Icon, label, value, color, bg }) => (
    <div style={{
        background: bg,
        borderRadius: 'var(--radius-card)',
        padding: '14px 16px',
        display: 'flex', alignItems: 'center', gap: 10,
        minWidth: 0,
    }}>
        <div style={{
            width: 36, height: 36, borderRadius: 'var(--radius-badge)',
            background: 'rgba(255,255,255,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
        }}>
            <Icon size={18} style={{ color }} />
        </div>
        <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 10, fontWeight: 900, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', lineHeight: 1 }}>{label}</p>
            <p style={{ fontSize: 15, fontWeight: 900, color, marginTop: 3, lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</p>
        </div>
    </div>
);

const TierBadge = ({ tier }) => {
    const t = getTier(tier);
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '3px 8px',
            borderRadius: 'var(--radius-badge)',
            border: `1px solid ${t.badgeBorder}`,
            background: t.badgeBg,
            color: t.badgeFg,
            fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em',
            whiteSpace: 'nowrap',
        }}>
            {t.icon} {tier}
        </span>
    );
};

/* ─── Main ────────────────────────────────────────────────────── */
const CustomersTab = ({ promotions = [], onOpenCreateVoucher, hasPermission }) => {
    const [customers, setCustomers]   = useState([]);
    const [loading, setLoading]       = useState(true);
    const [search, setSearch]         = useState('');
    const [selected, setSelected]     = useState(null);
    const [logs, setLogs]             = useState([]);
    const [logsLoading, setLogsLoading] = useState(false);

    /* Register modal */
    const [showReg, setShowReg]       = useState(false);
    const [regPhone, setRegPhone]     = useState('');
    const [regName, setRegName]       = useState('');
    const [regLoading, setRegLoading] = useState(false);
    const [regErr, setRegErr]         = useState('');

    /* Adjust modal */
    const [showAdj, setShowAdj]       = useState(false);
    const [adjPts, setAdjPts]         = useState('');
    const [adjReason, setAdjReason]   = useState('');

    /* Edit Name inline */
    const [isEditingName, setIsEditingName] = useState(false);
    const [editNameValue, setEditNameValue] = useState('');

    /* Detail sub-tab: 'overview' | 'analytics' */
    const [detailTab, setDetailTab] = useState('overview');

    /* Analytics */
    const [analysis, setAnalysis]       = useState(null);
    const [analysisLoading, setAnalysisLoading] = useState(false);

    /* Voucher */
    const [voucherDiscount, setVoucherDiscount] = useState(20);
    const [voucherResult, setVoucherResult]     = useState(null);
    const [voucherLoading, setVoucherLoading]   = useState(false);

    /* Add Phone to partial customer */
    const [isAddingPhone, setIsAddingPhone] = useState(false);
    const [addPhoneValue, setAddPhoneValue] = useState('');
    const [addPhoneLoading, setAddPhoneLoading] = useState(false);
    const [addPhoneErr, setAddPhoneErr]     = useState('');

    /* ── Fetch ── */
    const fetchCustomers = useCallback(async () => {
        setLoading(true);
        try {
            const r = await fetch(`${SERVER_URL}/api/loyalty/admin/customers`, { headers: authHdr() });
            const d = await r.json();
            if (d.success) setCustomers(d.customers || []);
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, []);

    const fetchLogs = useCallback(async (id) => {
        setLogsLoading(true); setLogs([]);
        try {
            const r = await fetch(`${SERVER_URL}/api/loyalty/admin/customers/${id}/logs`, { headers: authHdr() });
            const d = await r.json();
            if (d.success) setLogs(d.logs || []);
        } catch { /* silent */ }
        finally { setLogsLoading(false); }
    }, []);

    const fetchAnalysis = useCallback(async (id) => {
        setAnalysisLoading(true); setAnalysis(null);
        try {
            // Tìm customer hiện tại
            const cust = customers.find(c => c.id === id) || selected;
            // Nếu là name-only (chưa có SĐT) → resync data từ đơn hàng trước
            if (cust && !cust.phone) {
                await fetch(`${SERVER_URL}/api/loyalty/admin/resync-name-only`, {
                    method: 'POST', headers: jsonHdrs(),
                }).catch(() => {}); // silent — không block nếu lỗi
                // Reload list để cập nhật visits/totalSpent trên UI
                fetchCustomers();
            }
            const r = await fetch(`${SERVER_URL}/api/loyalty/admin/customers/${id}/analysis`, { headers: authHdr() });
            const d = await r.json();
            if (d.success) setAnalysis(d.analysis);
        } catch { /* silent */ }
        finally { setAnalysisLoading(false); }
    }, [customers, selected, fetchCustomers]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { fetchCustomers(); }, [fetchCustomers]);


    const selectCustomer = (c) => {
        setSelected(c);
        setDetailTab('overview');
        setVoucherResult(null);
        setAnalysis(null);
        fetchLogs(c.id);
    };

    /* ── Register ── */
    const handleRegister = async () => {
        if (!regName.trim()) { setRegErr('Vui lòng nhập Tên khách.'); return; }
        setRegLoading(true); setRegErr('');
        try {
            const r = await fetch(`${SERVER_URL}/api/loyalty/admin/register`, {
                method: 'POST', headers: jsonHdrs(),
                body: JSON.stringify({ phone: regPhone.trim(), name: regName.trim() }),
            });
            const d = await r.json();
            if (d.success) {
                setShowReg(false); setRegPhone(''); setRegName('');
                await fetchCustomers();
                selectCustomer(d.customer);
            } else { setRegErr(d.message || 'Đã xảy ra lỗi.'); }
        } catch { setRegErr('Lỗi kết nối máy chủ.'); }
        finally { setRegLoading(false); }
    };

    /* ── Add Phone to partial customer ── */
    const handleAddPhone = async () => {
        if (!addPhoneValue.trim() || !selected) return;
        setAddPhoneLoading(true); setAddPhoneErr('');
        try {
            const r = await fetch(`${SERVER_URL}/api/loyalty/admin/customers/${selected.id}/phone`, {
                method: 'PATCH', headers: jsonHdrs(),
                body: JSON.stringify({ phone: addPhoneValue.trim() }),
            });
            const d = await r.json();
            if (d.success) {
                const updated = { ...selected, phone: addPhoneValue.trim() };
                setSelected(updated);
                setCustomers(prev => prev.map(c => c.id === selected.id ? updated : c));
                setIsAddingPhone(false); setAddPhoneValue('');
            } else { setAddPhoneErr(d.message || 'Lỗi'); }
        } catch { setAddPhoneErr('Lỗi kết nối'); }
        finally { setAddPhoneLoading(false); }
    };
    const handleAdjust = async () => {
        const pts = parseInt(adjPts, 10);
        if (!selected || isNaN(pts) || !adjReason.trim()) return;
        try {
            const r = await fetch(`${SERVER_URL}/api/loyalty/admin/customers/${selected.id}/adjust-points`, {
                method: 'POST', headers: jsonHdrs(),
                body: JSON.stringify({ points: pts, reason: adjReason.trim() }),
            });
            const d = await r.json();
            if (d.success) {
                setShowAdj(false); setAdjPts(''); setAdjReason('');
                fetchCustomers();
                fetchLogs(selected.id);
            } else { alert('Lỗi: ' + (d.message || d.error)); }
        } catch { alert('Lỗi kết nối máy chủ.'); }
    };

    const filtered = customers.filter(c =>
        (c.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.phone || '').includes(search)
    );

    /* ── Stats ── */
    const totalRevenue = customers.reduce((s, c) => s + (c.totalSpent || 0), 0);
    const countDiamond = customers.filter(c => c.tier === 'Kim Cương').length;
    const countGold    = customers.filter(c => c.tier === 'Vàng').length;

    /* ═══════════════ RENDER ══════════════════════════════════════ */
    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#F9FAFB', overflow: 'hidden' }}>

            {/* ── Sticky Header ── */}
            <div style={{
                background: '#fff',
                borderBottom: '1px solid #F3F4F6',
                padding: '20px 20px 16px',
                flexShrink: 0,
            }}>
                {/* Title row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                    <div>
                        <h2 style={{
                            margin: 0, fontSize: 20, fontWeight: 900, color: '#111827',
                            letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 8,
                        }}>
                            <User size={20} style={{ color: 'var(--color-brand)' }} />
                            Khách Hàng Thân Thiết
                            <span style={{
                                background: 'var(--color-brand-10, #EFF6FF)',
                                color: 'var(--color-brand)',
                                fontSize: 11, fontWeight: 900,
                                padding: '2px 7px',
                                borderRadius: 'var(--radius-badge)',
                            }}>{customers.length}</span>
                        </h2>
                        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9CA3AF', fontWeight: 600 }}>
                            Tích điểm · Phân hạng thành viên · 10.000đ = 1 Điểm
                        </p>
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        {/* Search */}
                        <div style={{ position: 'relative' }}>
                            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', pointerEvents: 'none' }} />
                            <input
                                type="text"
                                placeholder="Tên hoặc SĐT..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                style={{
                                    paddingLeft: 30, paddingRight: 12, paddingTop: 0, paddingBottom: 0,
                                    height: 40,
                                    border: '1.5px solid #E5E7EB',
                                    borderRadius: 'var(--radius-input)',
                                    fontSize: 13, fontWeight: 600, color: '#1F2937',
                                    outline: 'none', background: '#F9FAFB',
                                    width: 180,
                                    transition: 'border-color 0.15s',
                                }}
                                onFocus={e => e.target.style.borderColor = 'var(--color-brand)'}
                                onBlur={e => e.target.style.borderColor = '#E5E7EB'}
                            />
                        </div>

                        {/* Refresh */}
                        <button
                            onClick={fetchCustomers}
                            title="Tải lại"
                            className="bg-white border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-all flex items-center justify-center shadow-sm"
                            style={{ minHeight: '36px', width: '36px', borderRadius: 'var(--radius-btn)' }}
                        >
                            <RefreshCw size={15} />
                        </button>

                        {/* Add Member */}
                        <button
                            onClick={() => { setRegErr(''); setShowReg(true); }}
                            className="bg-brand-600 text-white border border-brand-700 font-black flex items-center gap-1.5 shadow-sm hover:shadow-md hover:bg-brand-700 transition-all uppercase text-xs tracking-widest"
                            style={{ minHeight: '36px', borderRadius: 'var(--radius-btn)', padding: '0 14px' }}
                        >
                            <UserPlus size={15} />
                            <span className="hidden sm:inline">Thêm Thành Viên</span>
                        </button>
                    </div>
                </div>

                {/* Stats Row */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                    gap: 10,
                }}>
                    <StatCard icon={User}      label="Tổng thành viên" value={customers.length}     color="#3B82F6" bg="#EFF6FF" />
                    <StatCard icon={Award}     label="💎 Kim Cương"    value={countDiamond}          color="#7C3AED" bg="#F5F3FF" />
                    <StatCard icon={Star}      label="🥇 Hạng Vàng"    value={countGold}             color="#D97706" bg="#FFFBEB" />
                    <StatCard icon={DollarSign} label="Tổng chi tiêu"  value={formatVND(totalRevenue)} color="#059669" bg="#ECFDF5" />
                </div>
            </div>

            {/* ── Body ── */}
            <div className="flex flex-col md:flex-row flex-1 overflow-hidden min-h-0 w-full">

                {/* Left — list */}
                <div className={`flex flex-col overflow-hidden w-full ${selected ? 'md:w-1/2 hidden md:flex' : ''}`} style={{
                    borderRight: selected ? '1px solid #F3F4F6' : 'none',
                    minWidth: 0,
                }}>
                    {loading ? (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Loader2 size={30} className="animate-spin" style={{ color: 'var(--color-brand)' }} />
                        </div>
                    ) : filtered.length === 0 ? (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, textAlign: 'center' }}>
                            <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                                <UserPlus size={28} style={{ color: '#9CA3AF' }} />
                            </div>
                            <p style={{ fontSize: 16, fontWeight: 900, color: '#374151', margin: '0 0 6px' }}>
                                {search ? 'Không tìm thấy kết quả' : 'Chưa có thành viên nào'}
                            </p>
                            {!search && (
                                <>
                                    <p style={{ fontSize: 13, color: '#9CA3AF', margin: '0 0 16px', lineHeight: 1.5, maxWidth: 320 }}>
                                        Thành viên được tạo khi khách nhập SĐT tại Kiosk / Mobile, hoặc Admin đăng ký thủ công.
                                    </p>
                                    <button
                                        onClick={() => setShowReg(true)}
                                        className="bg-brand-600 text-white border border-brand-700 font-black flex items-center gap-2 shadow-sm hover:shadow-md hover:bg-brand-700 transition-all uppercase text-xs tracking-widest"
                                        style={{ minHeight: '44px', borderRadius: 'var(--radius-btn)', padding: '0 20px' }}
                                    >
                                        <UserPlus size={16} /> Đăng ký thành viên đầu tiên
                                    </button>
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="custom-scrollbar" style={{ overflow: 'auto', flex: 1 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 10, boxShadow: '0 1px 0 #F3F4F6' }}>
                                        {['Thành Viên', 'Hạng', 'Điểm', 'Chi Tiêu', 'Ghé Thăm'].map((col, i) => (
                                            <th key={col} style={{
                                                padding: '10px 12px',
                                                textAlign: i >= 3 ? 'right' : 'left',
                                                fontSize: 10, fontWeight: 900,
                                                color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em',
                                                borderBottom: '1px solid #F3F4F6',
                                                paddingLeft: i === 0 ? 20 : 12,
                                                paddingRight: i === 4 ? 20 : 12,
                                                ...(i === 3 || i === 4 ? { display: 'table-cell' } : {}),
                                            }}>{col}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map(c => {
                                        const t    = getTier(c.tier);
                                        const prog = getProgress(c);
                                        const isSelected = selected?.id === c.id;
                                        return (
                                            <tr
                                                key={c.id}
                                                onClick={() => selectCustomer(c)}
                                                style={{
                                                    cursor: 'pointer',
                                                    background: isSelected ? 'var(--color-brand-5, #EFF6FF)' : 'transparent',
                                                    borderBottom: '1px solid #F9FAFB',
                                                    transition: 'background 0.1s',
                                                }}
                                                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#F9FAFB'; }}
                                                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                                            >
                                                {/* Name + phone */}
                                                <td style={{ padding: '12px 12px 12px 20px', verticalAlign: 'middle' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                        <div style={{
                                                            width: 36, height: 36, borderRadius: '50%',
                                                            background: t.badgeBg,
                                                            border: `1.5px solid ${t.badgeBorder}`,
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            fontWeight: 900, fontSize: 14, color: t.badgeFg,
                                                            flexShrink: 0,
                                                        }}>
                                                            {(c.name || '?').charAt(0).toUpperCase()}
                                                        </div>
                                                        <div style={{ minWidth: 0 }}>
                                                            <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#111827', lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</p>
                                                            <p style={{ margin: '3px 0 0', fontSize: 11, color: '#6B7280', fontFamily: 'monospace', letterSpacing: '0.05em' }}>
                                                                {(c.phone || '').replace(/(\d{4})(\d{3})(\d{3})/, '$1 $2 $3')}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Tier + progress */}
                                                <td style={{ padding: '12px', verticalAlign: 'middle' }}>
                                                    <TierBadge tier={c.tier} />
                                                    {prog.percent < 100 && (
                                                        <div style={{ marginTop: 5, width: 60, height: 3, background: '#E5E7EB', borderRadius: 99 }}>
                                                            <div style={{ width: `${prog.percent}%`, height: '100%', background: t.barColor, borderRadius: 99, transition: 'width 0.4s' }} />
                                                        </div>
                                                    )}
                                                </td>

                                                {/* Points */}
                                                <td style={{ padding: '12px', verticalAlign: 'middle' }}>
                                                    <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--color-brand)' }}>
                                                        {(c.points || 0).toLocaleString('vi-VN')}
                                                    </span>
                                                    <span style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 700, marginLeft: 2 }}>pts</span>
                                                </td>

                                                {/* Spent */}
                                                <td style={{ padding: '12px', textAlign: 'right', verticalAlign: 'middle' }}>
                                                    <span style={{ fontSize: 13, fontWeight: 800, color: '#374151' }}>{formatVND(c.totalSpent)}</span>
                                                </td>

                                                {/* Visits (tổng + tuần này) */}
                                                <td style={{ padding: '12px 20px 12px 12px', textAlign: 'right', verticalAlign: 'middle' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                                                        <span style={{ fontSize: 13, fontWeight: 700, color: '#6B7280' }}>{c.visits || 0} lần</span>
                                                        {(c.visitsThisWeek || 0) > 0 && (
                                                            <span style={{
                                                                fontSize: 10, fontWeight: 900,
                                                                background: c.visitsThisWeek >= 3 ? '#FEF2F2' : '#F0FDF4',
                                                                color: c.visitsThisWeek >= 3 ? '#DC2626' : '#16A34A',
                                                                borderRadius: 99, padding: '1px 6px',
                                                                display: 'inline-flex', alignItems: 'center', gap: 2,
                                                            }}>
                                                                {c.visitsThisWeek >= 3 ? '🔥' : '❤️'} {c.visitsThisWeek}x tuần
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Right — detail panel */}
                <AnimatePresence>
                    {selected && (() => {
                        const t    = getTier(selected.tier);
                        const prog = getProgress(selected);
                        return (
                            <motion.div
                                key={selected.id}
                                initial={{ opacity: 0, x: 24 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 24 }}
                                transition={{ duration: 0.18 }}
                                className="custom-scrollbar w-full md:w-1/2 flex-shrink-0 bg-white md:border-l border-[#F3F4F6] flex flex-col overflow-auto"
                                style={{}}
                            >
                                {/* Profile block */}
                                <div style={{
                                    background: t.badgeBg,
                                    borderBottom: `1px solid ${t.badgeBorder}`,
                                    padding: '24px 20px 20px',
                                    textAlign: 'center',
                                    position: 'relative',
                                }}>
                                    <button
                                        onClick={() => setSelected(null)}
                                        style={{
                                            position: 'absolute', top: 12, right: 12,
                                            width: 28, height: 28, borderRadius: '50%',
                                            background: 'rgba(255,255,255,0.8)',
                                            border: 'none', cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            color: '#9CA3AF',
                                        }}
                                    >
                                        <X size={14} />
                                    </button>
                                    <div style={{
                                        width: 60, height: 60, borderRadius: '50%',
                                        background: t.badgeBg,
                                        border: `2px solid ${t.badgeBorder}`,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontWeight: 900, fontSize: 22, color: t.badgeFg,
                                        margin: '0 auto 12px',
                                    }}>
                                        {(selected.name || '?').charAt(0).toUpperCase()}
                                    </div>
                                    {isEditingName ? (
                                        <div style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'center' }}>
                                            <input 
                                                autoFocus
                                                value={editNameValue}
                                                onChange={e => setEditNameValue(e.target.value)}
                                                onKeyDown={async e => { 
                                                    if(e.key === 'Escape') setIsEditingName(false);
                                                    if(e.key === 'Enter') {
                                                        const newVal = editNameValue.trim();
                                                        if(!newVal) return;
                                                        const r = await fetch(`${SERVER_URL}/api/loyalty/admin/customers/${selected.id}`, {
                                                            method: 'PUT', headers: jsonHdrs(), body: JSON.stringify({ name: newVal })
                                                        });
                                                        const d = await r.json();
                                                        if(d.success) {
                                                            setSelected({ ...selected, name: newVal });
                                                            setCustomers(prev => prev.map(c => c.id === selected.id ? { ...c, name: newVal } : c));
                                                            setIsEditingName(false);
                                                        }
                                                    }
                                                }}
                                                style={{ padding: '2px 8px', border: '1px solid #D1D5DB', borderRadius: 6, textAlign: 'center', fontSize: 16, width: 140, fontWeight: 'bold' }}
                                            />
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }} onClick={() => { setEditNameValue(selected.name); setIsEditingName(true); }}>
                                            <p style={{ margin: 0, fontSize: 17, fontWeight: 900, color: '#111827' }}>{selected.name}</p>
                                            <Edit2 size={12} className="text-gray-400 hover:text-brand-600" />
                                        </div>
                                    )}
                                    {/* Phone — or prompt to add */}
                                    {selected.phone ? (
                                        <p style={{ margin: '4px 0 10px', fontSize: 12, color: '#6B7280', fontFamily: 'monospace', letterSpacing: '0.05em' }}>
                                            {(selected.phone).replace(/(\d{4})(\d{3})(\d{3})/, '$1 $2 $3')}
                                        </p>
                                    ) : isAddingPhone ? (
                                        <div style={{ display: 'flex', gap: 4, alignItems: 'center', margin: '4px 0 10px', padding: '0 12px' }}>
                                            <input
                                                autoFocus type="tel"
                                                value={addPhoneValue}
                                                onChange={e => setAddPhoneValue(e.target.value.replace(/\D/g, '').slice(0, 11))}
                                                onKeyDown={e => { if(e.key === 'Enter') handleAddPhone(); if(e.key === 'Escape') setIsAddingPhone(false); }}
                                                placeholder="0909..."
                                                style={{ flex: 1, border: '1px solid #DDD', borderRadius: 6, padding: '4px 8px', fontSize: 13, fontFamily: 'monospace', outline: 'none' }}
                                            />
                                            <button onClick={handleAddPhone} disabled={addPhoneLoading || addPhoneValue.length < 9}
                                                style={{ background: 'var(--color-brand)', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 8px', fontSize: 11, fontWeight: 900, cursor: 'pointer' }}>
                                                {addPhoneLoading ? '...' : 'Lưu'}
                                            </button>
                                            <button onClick={() => setIsAddingPhone(false)} style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: 12 }}>✕</button>
                                        </div>
                                    ) : (
                                        <div style={{ margin: '4px 0 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                            <span style={{ fontSize: 10, fontWeight: 900, background: '#FEF3C7', color: '#92400E', borderRadius: 99, padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 3 }}>
                                                <Phone size={9} /> Chưa có SĐT
                                            </span>
                                            <button onClick={() => { setAddPhoneValue(''); setAddPhoneErr(''); setIsAddingPhone(true); }}
                                                style={{ fontSize: 10, fontWeight: 900, color: 'var(--color-brand)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                                                + Thêm SĐT
                                            </button>
                                        </div>
                                    )}
                                    {addPhoneErr && <p style={{ color: '#DC2626', fontSize: 10, margin: '-6px 0 6px', textAlign: 'center' }}>{addPhoneErr}</p>}
                                    <TierBadge tier={selected.tier} />
                                    <p style={{ margin: '10px 0 0', fontSize: 11, color: '#9CA3AF' }}>Tham gia: {formatDate(selected.joinedAt)}</p>
                                </div>

                                {/* Sub-tab navigation */}
                                <div style={{ display: 'flex', borderBottom: '1px solid #F3F4F6', background: '#FAFAFA' }}>
                                    {[
                                        { id: 'overview',  label: 'Tổng Quan',   icon: <User size={12}/> },
                                        { id: 'analytics', label: 'Phân Tích',   icon: <BarChart2 size={12}/> },
                                        { id: 'calendar',  label: 'Lịch Uống',   icon: <CalendarDays size={12}/> },
                                    ].map(tab => (
                                        <button
                                            key={tab.id}
                                            onClick={() => {
                                                setDetailTab(tab.id);
                                                if (tab.id === 'analytics' && !analysis) fetchAnalysis(selected.id);
                                            }}
                                            style={{
                                                flex: 1, padding: '10px 4px',
                                                fontSize: 10, fontWeight: 800,
                                                border: 'none', cursor: 'pointer',
                                                background: detailTab === tab.id ? '#fff' : 'transparent',
                                                borderBottom: detailTab === tab.id ? '2px solid var(--color-brand)' : '2px solid transparent',
                                                color: detailTab === tab.id ? 'var(--color-brand)' : '#9CA3AF',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
                                                transition: 'all 0.15s',
                                            }}
                                        >
                                            {tab.icon} {tab.label}
                                        </button>
                                    ))}
                                </div>

                                {/* ── Content theo sub-tab ── */}
                                {detailTab === 'overview' && (
                                <>
                                {/* Metrics */}
                                <div style={{ padding: '16px 20px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {[
                                        { label: 'Điểm Tích Luỹ', value: `${(selected.points || 0).toLocaleString('vi-VN')} pts`, color: 'var(--color-brand)', bg: '#EFF6FF' },
                                        { label: 'Tổng Chi Tiêu',  value: formatVND(selected.totalSpent),  color: '#059669', bg: '#ECFDF5' },
                                        { label: 'Tổng Lần Ghé',     value: `${selected.visits || 0} lần`, color: '#374151', bg: '#F9FAFB' },
                                        ...(selected.visitsThisWeek > 0 ? [{ label: '🔥 Tuần Này', value: `${selected.visitsThisWeek} lần`, color: selected.visitsThisWeek >= 3 ? '#DC2626' : '#16A34A', bg: selected.visitsThisWeek >= 3 ? '#FEF2F2' : '#F0FDF4' }] : []),
                                    ].map(m => (
                                        <div key={m.label} style={{
                                            background: m.bg,
                                            borderRadius: 'var(--radius-card)',
                                            padding: '10px 14px',
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        }}>
                                            <span style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{m.label}</span>
                                            <span style={{ fontSize: 14, fontWeight: 900, color: m.color }}>{m.value}</span>
                                        </div>
                                    ))}

                                    {/* Progress to next tier */}
                                    {prog.label ? (
                                        <div style={{
                                            background: '#F9FAFB', borderRadius: 'var(--radius-card)',
                                            padding: '12px 14px', border: '1px solid #F3F4F6',
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                                <span style={{ fontSize: 10, fontWeight: 900, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Tiến độ thăng hạng</span>
                                                <span style={{ fontSize: 10, fontWeight: 700, color: '#6B7280' }}>{prog.percent}%</span>
                                            </div>
                                            <div style={{ height: 6, background: '#E5E7EB', borderRadius: 99, overflow: 'hidden', marginBottom: 6 }}>
                                                <motion.div
                                                    initial={{ width: 0 }} animate={{ width: `${prog.percent}%` }}
                                                    transition={{ duration: 0.5, delay: 0.1 }}
                                                    style={{ height: '100%', background: t.barColor, borderRadius: 99 }}
                                                />
                                            </div>
                                            <p style={{ margin: 0, fontSize: 11, color: '#6B7280' }}>
                                                Cần thêm <strong style={{ color: '#374151' }}>{formatVND(prog.remaining)}</strong> → {getTier(prog.label).icon} {prog.label}
                                            </p>
                                        </div>
                                    ) : (
                                        <div style={{
                                            background: '#F5F3FF', borderRadius: 'var(--radius-card)',
                                            padding: '10px 14px', textAlign: 'center', border: '1px solid #DDD6FE',
                                        }}>
                                            <span style={{ fontSize: 12, fontWeight: 800, color: '#7C3AED' }}>💎 Đã đạt hạng cao nhất!</span>
                                        </div>
                                    )}

                                    {/* Action buttons */}
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button
                                            onClick={() => { setAdjPts(''); setAdjReason(''); setShowAdj(true); }}
                                            className="bg-brand-600 text-white border border-brand-700 font-black flex items-center justify-center gap-1.5 shadow-sm hover:shadow-md hover:bg-brand-700 transition-all uppercase text-xs tracking-widest"
                                            style={{ flex: 1, minHeight: '44px', borderRadius: 'var(--radius-btn)', padding: '0 12px' }}
                                        >
                                            <TrendingUp size={14} /> Điều chỉnh điểm
                                        </button>
                                        <button
                                            onClick={() => fetchLogs(selected.id)}
                                            title="Làm mới lịch sử"
                                            className="bg-white border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-all flex items-center justify-center shadow-sm"
                                            style={{ minHeight: '44px', width: '44px', borderRadius: 'var(--radius-btn)' }}
                                        >
                                            <RefreshCw size={14} />
                                        </button>
                                    </div>
                                </div>

                                {/* Log history */}
                                <div style={{ padding: '16px 20px 20px' }}>
                                    <p style={{ margin: '0 0 10px', fontSize: 10, fontWeight: 900, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Lịch Sử Điểm</p>
                                    {logsLoading ? (
                                        <div style={{ textAlign: 'center', padding: '16px 0' }}>
                                            <Loader2 size={20} className="animate-spin" style={{ color: 'var(--color-brand)' }} />
                                        </div>
                                    ) : logs.length === 0 ? (
                                        <p style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 12, padding: '12px 0' }}>Chưa có giao dịch nào.</p>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            {logs.map(log => (
                                                <div key={log.id} style={{
                                                    display: 'flex', alignItems: 'flex-start', gap: 10,
                                                    padding: '10px 12px',
                                                    background: '#F9FAFB',
                                                    borderRadius: 'var(--radius-card)',
                                                    border: '1px solid #F3F4F6',
                                                }}>
                                                    <div style={{
                                                        width: 24, height: 24, borderRadius: '50%',
                                                        background: log.pointsChanged >= 0 ? '#ECFDF5' : '#FEF2F2',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        flexShrink: 0,
                                                        color: log.pointsChanged >= 0 ? '#059669' : '#DC2626',
                                                        fontSize: 14, fontWeight: 900,
                                                    }}>
                                                        {log.pointsChanged >= 0 ? '+' : '−'}
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#374151', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.note || '—'}</p>
                                                        <p style={{ margin: '3px 0 0', fontSize: 10, color: '#9CA3AF' }}>{formatDate(log.timestamp)}</p>
                                                    </div>
                                                    <span style={{
                                                        fontSize: 13, fontWeight: 900,
                                                        color: log.pointsChanged >= 0 ? '#059669' : '#DC2626',
                                                        flexShrink: 0,
                                                    }}>
                                                        {log.pointsChanged >= 0 ? '+' : ''}{log.pointsChanged}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                </>
                                )} {/* end overview sub-tab */}

                                {/* ─── ANALYTICS SUB-TAB ─── */}
                                {detailTab === 'analytics' && (
                                <div style={{ padding: '16px 20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                                    {analysisLoading && (
                                        <div style={{ textAlign: 'center', padding: '32px 0' }}>
                                            <Loader2 size={24} className="animate-spin" style={{ color: 'var(--color-brand)', margin: '0 auto' }} />
                                            <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 8 }}>Đang phân tích dữ liệu...</p>
                                        </div>
                                    )}

                                    {!analysisLoading && analysis && analysis.totalOrders === 0 && (
                                        <div style={{ textAlign: 'center', padding: '32px 20px', color: '#9CA3AF' }}>
                                            <BarChart2 size={32} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                                            <p style={{ fontSize: 13, fontWeight: 700 }}>Chưa có dữ liệu giao dịch</p>
                                            <p style={{ fontSize: 11, marginTop: 4 }}>Khách cần hoàn thành ít nhất 1 đơn hàng</p>
                                        </div>
                                    )}

                                    {!analysisLoading && analysis && analysis.totalOrders > 0 && (<>
                                        {/* Churn risk banner */}
                                        {analysis.churnRisk === 'high' && (
                                            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 'var(--radius-card)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <AlertTriangle size={16} style={{ color: '#DC2626', flexShrink: 0 }} />
                                                <div>
                                                    <p style={{ margin: 0, fontSize: 12, fontWeight: 900, color: '#DC2626' }}>⚠️ Nguy cơ mất khách cao!</p>
                                                    <p style={{ margin: '2px 0 0', fontSize: 11, color: '#6B7280' }}>Đã {analysis.daysSinceLastVisit} ngày chưa ghé — nên gửi voucher ngay</p>
                                                </div>
                                            </div>
                                        )}
                                        {analysis.churnRisk === 'medium' && (
                                            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 'var(--radius-card)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <AlertTriangle size={16} style={{ color: '#D97706', flexShrink: 0 }} />
                                                <div>
                                                    <p style={{ margin: 0, fontSize: 12, fontWeight: 900, color: '#D97706' }}>🟡 Cần chăm sóc</p>
                                                    <p style={{ margin: '2px 0 0', fontSize: 11, color: '#6B7280' }}>Đã {analysis.daysSinceLastVisit} ngày chưa ghé</p>
                                                </div>
                                            </div>
                                        )}

                                        {/* Key numbers */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                            {[
                                                { label: '🔥 Tuần Này', value: `${analysis.visitsThisWeek || 0} lần`, color: analysis.visitsThisWeek >= 3 ? '#FEF2F2' : analysis.visitsThisWeek > 0 ? '#F0FDF4' : '#F9FAFB', txt: analysis.visitsThisWeek >= 3 ? '#DC2626' : analysis.visitsThisWeek > 0 ? '#166534' : '#9CA3AF' },
                                                { label: '📅 Tháng Này', value: `${analysis.visitsThisMonth || 0} lần`, color: '#EFF6FF', txt: '#1D4ED8' },
                                                { label: '🧾 Tổng Ghé', value: `${analysis.totalOrders} lần`, color: '#F9FAFB', txt: '#374151' },
                                                { label: '🥤 Ly / Lượt', value: analysis.avgItemsPerVisit, color: '#F0FDF4', txt: '#166534' },
                                            ].map(s => (
                                                <div key={s.label} style={{ background: s.color, borderRadius: 'var(--radius-card)', padding: '10px', textAlign: 'center' }}>
                                                    <div style={{ fontSize: 18, fontWeight: 900, color: s.txt, lineHeight: 1.2 }}>{s.value}</div>
                                                    <div style={{ fontSize: 10, color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', marginTop: 2 }}>{s.label}</div>
                                                </div>
                                            ))}

                                        </div>

                                        {/* Top món yêu thích */}
                                        {analysis.topItems.length > 0 && (
                                            <div>
                                                <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 900, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <Star size={10} /> Món Hay Gọi
                                                </p>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                    {analysis.topItems.map((item, i) => {
                                                        const maxCount = analysis.topItems[0].count;
                                                        const pct = Math.round((item.count / maxCount) * 100);
                                                        return (
                                                            <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                <span style={{ fontSize: 11, fontWeight: 900, color: i === 0 ? '#F59E0B' : '#9CA3AF', width: 16, textAlign: 'center' }}>{i === 0 ? '👑' : `${i+1}`}</span>
                                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                                                                    <div style={{ height: 4, background: '#F3F4F6', borderRadius: 99, marginTop: 3, overflow: 'hidden' }}>
                                                                        <div style={{ width: `${pct}%`, height: '100%', background: i === 0 ? '#F59E0B' : 'var(--color-brand)', borderRadius: 99, transition: 'width 0.5s' }} />
                                                                    </div>
                                                                </div>
                                                                <span style={{ fontSize: 11, fontWeight: 900, color: '#6B7280', flexShrink: 0 }}>×{item.count}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {/* Khung giờ hay ghé */}
                                        {analysis.peakHours.length > 0 && (
                                            <div>
                                                <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 900, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <Clock size={10} /> Giờ Hay Ghé
                                                </p>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                                    {analysis.peakHours.slice(0, 3).map((h, i) => (
                                                        <span key={h.bucket} style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: 4,
                                                            background: i === 0 ? 'var(--color-brand)' : '#F3F4F6',
                                                            color: i === 0 ? '#fff' : '#374151',
                                                            borderRadius: 'var(--radius-badge)', padding: '4px 10px',
                                                            fontSize: 11, fontWeight: 800,
                                                        }}>
                                                            {h.bucket} <span style={{ opacity: 0.7 }}>({h.count} lần)</span>
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Danh sách Voucher đang hoạt động */}
                                        {(() => {
                                            const activeVouchers = (promotions || []).filter(p =>
                                                p.isActive && p.type === 'PROMO_CODE' && p.specificPhone
                                                && p.specificPhone === selected.phone
                                                && p.endDate && new Date(`${p.endDate}T23:59:59`).getTime() >= Date.now()
                                            );
                                            if (activeVouchers.length === 0) return null;
                                            return (
                                                <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 'var(--radius-card)', padding: '14px', marginBottom: 2 }}>
                                                    <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 900, color: '#92400E', display: 'flex', alignItems: 'center', gap: 5 }}>
                                                        🎫 Voucher Đang Hoạt Động ({activeVouchers.length})
                                                    </p>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                        {activeVouchers.map(v => (
                                                            <div key={v.id} style={{ background: '#fff', border: '1px dashed #F59E0B', borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                                <div>
                                                                    <p style={{ margin: 0, fontSize: 14, fontWeight: 900, color: '#7C3AED', letterSpacing: '0.1em', fontFamily: 'monospace' }}>{v.code}</p>
                                                                    <p style={{ margin: '2px 0 0', fontSize: 10, color: '#9CA3AF' }}>
                                                                        Giảm {v.discountValue}{v.discountType === 'PERCENT' ? '%' : 'k'} · HSD: {v.endDate}
                                                                    </p>
                                                                </div>
                                                                <button
                                                                    title="Vô hiệu hoá voucher"
                                                                    onClick={async () => {
                                                                        const tok = localStorage.getItem('adminToken') || sessionStorage.getItem('adminToken');
                                                                        await fetch(`${SERVER_URL}/api/promotions/${v.id}`, {
                                                                            method: 'PUT',
                                                                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
                                                                            body: JSON.stringify({ ...v, isActive: false })
                                                                        });
                                                                        setVoucherResult({ code: v.code, discountValue: v.discountValue, expiresAt: v.endDate, phone: v.specificPhone, name: selected.name, _deactivated: true });
                                                                        // Force refresh promotions if possible  (vuln: needs page reload or SSE)
                                                                        window.dispatchEvent(new CustomEvent('voucher-deactivated'));
                                                                    }}
                                                                    style={{ background: '#FEE2E2', color: '#DC2626', border: 'none', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 10, fontWeight: 900 }}
                                                                >
                                                                    Hủy
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                        {/* Gửi Voucher */}
                                        {hasPermission && hasPermission('MANAGE_PROMOTIONS') && (
                                            <div style={{ background: '#F8F5FF', border: '1px solid #DDD6FE', borderRadius: 'var(--radius-card)', padding: '14px' }}>
                                                <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 900, color: '#7C3AED', display: 'flex', alignItems: 'center', gap: 5 }}>
                                                    <Gift size={12} /> Gửi Voucher Tri Ân
                                                </p>
                                                {voucherResult ? (
                                                    <div style={{ background: '#fff', border: `1.5px dashed ${voucherResult._deactivated ? '#DC2626' : '#7C3AED'}`, borderRadius: 8, padding: '12px', textAlign: 'center' }}>
                                                        <CheckCircle size={22} style={{ color: voucherResult._deactivated ? '#DC2626' : '#7C3AED', margin: '0 auto 6px' }} />
                                                        <p style={{ margin: 0, fontSize: 13, fontWeight: 900, color: '#111827' }}>{voucherResult._deactivated ? 'Đã Vô Hiệu Hoá Voucher!' : 'Mã Voucher Đã Tạo!'}</p>
                                                        {!voucherResult._deactivated && <>
                                                            <p style={{ margin: '6px 0 2px', fontSize: 22, fontWeight: 900, letterSpacing: '0.15em', color: '#7C3AED', fontFamily: 'monospace' }}>{voucherResult.code}</p>
                                                            <p style={{ margin: 0, fontSize: 11, color: '#6B7280' }}>Giảm {voucherResult.discountValue}% · HSD: {voucherResult.expiresAt}</p>
                                                            <p style={{ margin: '8px 0 0', fontSize: 11, color: '#9CA3AF', fontStyle: 'italic' }}>→ Gửi mã này qua Zalo cho {voucherResult.phone}</p>
                                                        </>}
                                                        <button onClick={() => setVoucherResult(null)} style={{ marginTop: 10, fontSize: 11, color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>{voucherResult._deactivated ? 'Đóng' : 'Tạo mã khác'}</button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => {
                                                            if (onOpenCreateVoucher) onOpenCreateVoucher(selected);
                                                        }}
                                                        style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, background: '#7C3AED', color: '#fff', border: 'none', borderRadius: 'var(--radius-btn)', padding: '0 14px', minHeight: 44, fontWeight: 900, fontSize: 13, cursor: 'pointer' }}
                                                    >
                                                        <Gift size={14} /> Chuyển sang Giao diện Tạo Voucher
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </>)}
                                </div>
                                )} {/* end analytics sub-tab */}

                                {/* ─── CALENDAR / DRINKING SCHEDULE SUB-TAB ─── */}
                                {detailTab === 'calendar' && (
                                    <CustomerDrinkingCalendar
                                        customerId={selected.id}
                                        customer={selected}
                                    />
                                )}

                            </motion.div>

                        );
                    })()}
                </AnimatePresence>
            </div>

            {/* ══ REGISTER MODAL ══════════════════════════════════════════ */}
            <AnimatePresence>
                {showReg && (
                    <div style={{
                        position: 'fixed', inset: 0, zIndex: 500,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(0,0,0,0.5)',
                        backdropFilter: 'blur(4px)',
                        padding: 20,
                    }}>
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            style={{
                                background: '#fff',
                                borderRadius: 'var(--radius-modal)',
                                padding: 28,
                                width: '100%', maxWidth: 400,
                                boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
                            }}
                        >
                            {/* Modal header */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                                <div style={{
                                    width: 44, height: 44, borderRadius: 'var(--radius-card)',
                                    background: '#EFF6FF',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <UserPlus size={20} style={{ color: 'var(--color-brand)' }} />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: 17, fontWeight: 900, color: '#111827' }}>Đăng Ký Thành Viên</h3>
                                    <p style={{ margin: 0, fontSize: 12, color: '#9CA3AF', fontWeight: 600 }}>Admin thêm thủ công</p>
                                </div>
                                <button onClick={() => setShowReg(false)} style={{
                                    marginLeft: 'auto', width: 32, height: 32, borderRadius: '50%',
                                    border: 'none', background: '#F3F4F6', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B7280',
                                }}>
                                    <X size={16} />
                                </button>
                            </div>

                            {regErr && (
                                <div style={{
                                    background: '#FEF2F2', border: '1px solid #FECACA',
                                    borderRadius: 'var(--radius-card)',
                                    padding: '10px 14px', marginBottom: 16,
                                    fontSize: 13, fontWeight: 700, color: '#DC2626',
                                }}>
                                    {regErr}
                                </div>
                            )}

                            {/* Fields */}
                            {[
                                { label: <><Phone size={10} style={{ marginRight: 4 }} />Số Điện Thoại</>, value: regPhone, set: setRegPhone, placeholder: '0912 345 678', type: 'tel' },
                                { label: <><User size={10} style={{ marginRight: 4 }} />Tên Khách Hàng</>, value: regName, set: setRegName, placeholder: 'Nguyễn Văn A', type: 'text', onKey: handleRegister },
                            ].map((f, i) => (
                                <div key={i} style={{ marginBottom: 14 }}>
                                    <label style={{
                                        display: 'flex', alignItems: 'center',
                                        fontSize: 10, fontWeight: 900, color: '#6B7280',
                                        textTransform: 'uppercase', letterSpacing: '0.08em',
                                        marginBottom: 6,
                                    }}>{f.label}</label>
                                    <input
                                        type={f.type}
                                        value={f.value}
                                        onChange={e => f.set(e.target.value)}
                                        placeholder={f.placeholder}
                                        onKeyDown={e => f.onKey && e.key === 'Enter' && f.onKey()}
                                        style={{
                                            width: '100%', minHeight: 44,
                                            padding: '0 14px',
                                            borderRadius: 'var(--radius-input)',
                                            border: '1.5px solid #E5E7EB',
                                            fontSize: 14, fontWeight: 700, color: '#111827',
                                            background: '#F9FAFB', outline: 'none',
                                            boxSizing: 'border-box',
                                        }}
                                        onFocus={e => e.target.style.borderColor = 'var(--color-brand)'}
                                        onBlur={e => e.target.style.borderColor = '#E5E7EB'}
                                    />
                                </div>
                            ))}

                            {/* Buttons */}
                            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                                <button
                                    onClick={() => setShowReg(false)}
                                    className="bg-white border border-gray-200 text-gray-600 font-black hover:bg-gray-50 transition-all uppercase text-xs tracking-widest"
                                    style={{ flex: 1, minHeight: '44px', borderRadius: 'var(--radius-btn)' }}
                                >Huỷ</button>
                                <button
                                    onClick={handleRegister}
                                    disabled={regLoading}
                                    className={`font-black flex items-center justify-center gap-2 transition-all uppercase text-xs tracking-widest ${regLoading ? 'bg-gray-300 text-gray-400 cursor-not-allowed border border-gray-300' : 'bg-brand-600 text-white border border-brand-700 shadow-sm hover:shadow-md hover:bg-brand-700 cursor-pointer'}`}
                                    style={{ flex: 1, minHeight: '44px', borderRadius: 'var(--radius-btn)' }}
                                >
                                    {regLoading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                                    Đăng Ký
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ══ ADJUST POINTS MODAL ══════════════════════════════════════ */}
            <AnimatePresence>
                {showAdj && selected && (
                    <div style={{
                        position: 'fixed', inset: 0, zIndex: 500,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(0,0,0,0.5)',
                        backdropFilter: 'blur(4px)',
                        padding: 20,
                    }}>
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            style={{
                                background: '#fff',
                                borderRadius: 'var(--radius-modal)',
                                padding: 28,
                                width: '100%', maxWidth: 380,
                                boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                                <div style={{
                                    width: 44, height: 44, borderRadius: 'var(--radius-card)',
                                    background: '#FFFBEB',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <TrendingUp size={20} style={{ color: '#D97706' }} />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: 17, fontWeight: 900, color: '#111827' }}>Điều Chỉnh Điểm</h3>
                                    <p style={{ margin: 0, fontSize: 12, color: '#9CA3AF', fontWeight: 600 }}>
                                        {selected.name} · {(selected.points || 0)} pts hiện tại
                                    </p>
                                </div>
                                <button onClick={() => setShowAdj(false)} style={{
                                    marginLeft: 'auto', width: 32, height: 32, borderRadius: '50%',
                                    border: 'none', background: '#F3F4F6', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B7280',
                                }}>
                                    <X size={16} />
                                </button>
                            </div>

                            <label style={{ display: 'block', fontSize: 10, fontWeight: 900, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                                Số Điểm Thay Đổi (+/−)
                            </label>
                            <input
                                type="number"
                                value={adjPts}
                                onChange={e => setAdjPts(e.target.value)}
                                placeholder="+100 hoặc -50"
                                style={{
                                    width: '100%', minHeight: 52,
                                    padding: '0 14px',
                                    borderRadius: 'var(--radius-input)',
                                    border: '1.5px solid #E5E7EB',
                                    fontSize: 22, fontWeight: 900, color: '#111827',
                                    background: '#F9FAFB', outline: 'none',
                                    textAlign: 'center', marginBottom: 14, boxSizing: 'border-box',
                                }}
                                onFocus={e => e.target.style.borderColor = 'var(--color-brand)'}
                                onBlur={e => e.target.style.borderColor = '#E5E7EB'}
                            />

                            <label style={{ display: 'block', fontSize: 10, fontWeight: 900, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                                Lý Do
                            </label>
                            <input
                                type="text"
                                value={adjReason}
                                onChange={e => setAdjReason(e.target.value)}
                                placeholder="Minigame, đền bù đơn hàng..."
                                onKeyDown={e => e.key === 'Enter' && handleAdjust()}
                                style={{
                                    width: '100%', minHeight: 44,
                                    padding: '0 14px',
                                    borderRadius: 'var(--radius-input)',
                                    border: '1.5px solid #E5E7EB',
                                    fontSize: 14, fontWeight: 600, color: '#111827',
                                    background: '#F9FAFB', outline: 'none',
                                    marginBottom: 20, boxSizing: 'border-box',
                                }}
                                onFocus={e => e.target.style.borderColor = 'var(--color-brand)'}
                                onBlur={e => e.target.style.borderColor = '#E5E7EB'}
                            />

                            <div style={{ display: 'flex', gap: 10 }}>
                                <button
                                    onClick={() => setShowAdj(false)}
                                    className="bg-white border border-gray-200 text-gray-600 font-black hover:bg-gray-50 transition-all uppercase text-xs tracking-widest"
                                    style={{ flex: 1, minHeight: '44px', borderRadius: 'var(--radius-btn)' }}
                                >Huỷ</button>
                                <button
                                    onClick={handleAdjust}
                                    disabled={!adjPts || !adjReason.trim()}
                                    className={`font-black flex items-center justify-center gap-2 transition-all uppercase text-xs tracking-widest ${(!adjPts || !adjReason.trim()) ? 'bg-gray-300 text-gray-400 cursor-not-allowed border border-gray-300' : 'bg-amber-500 text-white border border-amber-600 shadow-sm hover:shadow-md hover:bg-amber-600 cursor-pointer'}`}
                                    style={{ flex: 1, minHeight: '44px', borderRadius: 'var(--radius-btn)' }}
                                >
                                    <CheckCircle size={16} /> Xác Nhận
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default CustomersTab;
