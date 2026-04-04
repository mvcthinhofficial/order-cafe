import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion'; // eslint-disable-line no-unused-vars
import {
    Award, Star, Diamond, Flame, Gift, Clock, Phone,
    ChevronRight, Delete, TrendingUp, RotateCcw, CheckCircle,
    Coffee, Crown, Zap
} from 'lucide-react';
import { SERVER_URL } from '../api';

/* ─── Constants ──────────────────────────────────────────── */
const TIER_CONFIG = {
    'Bạc': {
        label: 'Bạc', emoji: '🥈', next: 'Vàng',
        color: '#9CA3AF', bg: '#F9FAFB', border: '#E5E7EB',
        gradient: 'linear-gradient(135deg, #9CA3AF, #D1D5DB)',
        nextThreshold: 5000000, icon: Star,
    },
    'Vàng': {
        label: 'Vàng', emoji: '🥇', next: 'Kim Cương',
        color: '#D97706', bg: '#FFFBEB', border: '#FDE68A',
        gradient: 'linear-gradient(135deg, #F59E0B, #D97706)',
        nextThreshold: 15000000, icon: Award,
    },
    'Kim Cương': {
        label: 'Kim Cương', emoji: '💎', next: null,
        color: '#6366F1', bg: '#EEF2FF', border: '#C7D2FE',
        gradient: 'linear-gradient(135deg, #818CF8, #4F46E5)',
        nextThreshold: null, icon: Diamond,
    },
};

const TIER_THRESHOLDS = { 'Bạc': 0, 'Vàng': 5000000, 'Kim Cương': 15000000 };

const REWARDS = [
    { id: 'r1', points: 10, title: 'Ly nhỏ miễn phí', desc: 'Bất kỳ món size S', icon: '☕', color: '#059669' },
    { id: 'r2', points: 20, title: 'Giảm 20% đơn hàng', desc: 'Áp dụng 1 order', icon: '🏷️', color: '#2563EB' },
    { id: 'r3', points: 50, title: 'Ly Medium miễn phí', desc: 'Bất kỳ món size M', icon: '🎁', color: '#7C3AED' },
    { id: 'r4', points: 100, title: 'Ly Large + topping', desc: 'Size L + 1 topping tự chọn', icon: '👑', color: '#DC2626' },
];

/* ─── Sub-components ─────────────────────────────────────── */
const NumPad = ({ value, onChange, onSearch, loading }) => {
    const nums = ['1','2','3','4','5','6','7','8','9','','0','del'];
    return (
        <div>
            <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16
            }}>
                {nums.map((n, i) => n === '' ? (
                    <div key={i} />
                ) : n === 'del' ? (
                    <button key={i}
                        onClick={() => onChange(value.slice(0, -1))}
                        style={{
                            height: 54, borderRadius: 'var(--radius-btn)',
                            background: '#FEF2F2', border: '1.5px solid #FECACA',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer',
                        }}
                    ><Delete size={20} color="#DC2626" /></button>
                ) : (
                    <button key={i}
                        onClick={() => value.length < 11 && onChange(value + n)}
                        style={{
                            height: 54, borderRadius: 'var(--radius-btn)',
                            background: '#F9FAFB', border: '1.5px solid #E5E7EB',
                            fontSize: 22, fontWeight: 800, cursor: 'pointer',
                            transition: 'background 0.12s',
                        }}
                        onMouseDown={e => e.currentTarget.style.background = '#EEF2FF'}
                        onMouseUp={e => e.currentTarget.style.background = '#F9FAFB'}
                        onMouseLeave={e => e.currentTarget.style.background = '#F9FAFB'}
                    >{n}</button>
                ))}
            </div>
            <button
                onClick={onSearch}
                disabled={loading || value.length < 9}
                className={`w-full font-black flex items-center justify-center gap-2 transition-all uppercase text-xs tracking-widest ${(loading || value.length < 9) ? 'bg-gray-200 text-gray-400 cursor-not-allowed border border-gray-200' : 'bg-brand-600 text-white border border-brand-700 shadow-sm hover:shadow-md hover:bg-brand-700 cursor-pointer'}`}
                style={{ minHeight: 50, borderRadius: 'var(--radius-btn)' }}
            >
                {loading ? <RotateCcw size={16} className="animate-spin" /> : <Phone size={16} />}
                {loading ? 'Đang tra cứu...' : 'Xem điểm của tôi'}
            </button>
        </div>
    );
};

const TierProgressBar = ({ customer }) => {
    const cfg = TIER_CONFIG[customer.tier] || TIER_CONFIG['Bạc'];
    const prevThreshold = TIER_THRESHOLDS[customer.tier] || 0;
    const nextThreshold = cfg.nextThreshold;
    const spent = customer.totalSpent || 0;

    let pct = 100;
    let remaining = 0;
    if (nextThreshold) {
        pct = Math.min(100, ((spent - prevThreshold) / (nextThreshold - prevThreshold)) * 100);
        remaining = Math.max(0, nextThreshold - spent);
    }

    const fmtVND = (v) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Math.round(v * 1000)) + 'đ';

    return (
        <div style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {nextThreshold ? `Còn ${fmtVND(remaining)} → Hạng ${cfg.next}` : 'Hạng cao nhất 🎉'}
                </span>
                <span style={{ fontSize: 12, fontWeight: 800, color: cfg.color }}>{Math.round(pct)}%</span>
            </div>
            <div style={{ height: 10, background: '#F3F4F6', borderRadius: 999, overflow: 'hidden' }}>
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
                    style={{ height: '100%', background: cfg.gradient, borderRadius: 999 }}
                />
            </div>
        </div>
    );
};

/* ─── Main Page ─────────────────────────────────────────── */
export default function LoyaltyPage() {
    const [phone, setPhone] = useState('');
    const [profile, setProfile] = useState(null);
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [settings, setSettings] = useState(null);
    const [activeTab, setActiveTab] = useState('overview'); // overview | history | rewards

    useEffect(() => {
        fetch(`${SERVER_URL}/api/settings`).then(r => r.json()).then(setSettings).catch(() => {});
    }, []);

    const handleSearch = async () => {
        if (!phone || phone.length < 9) { setError('Vui lòng nhập đúng SĐT.'); return; }
        setLoading(true); setError('');
        try {
            const res = await fetch(`${SERVER_URL}/api/loyalty/customer/${phone}`);
            const data = await res.json();
            if (data.success && data.customer) {
                setProfile(data.customer);
                // Fetch logs
                const logRes = await fetch(`${SERVER_URL}/api/loyalty/customer/${phone}/logs`);
                const logData = await logRes.json();
                if (logData.success) setLogs(logData.logs || []);
            } else {
                setError('Không tìm thấy SĐT này. Hãy đăng ký thành viên tại quán!');
            }
        } catch {
            setError('Lỗi kết nối. Vui lòng thử lại.');
        } finally { setLoading(false); }
    };

    const reset = () => { setProfile(null); setPhone(''); setError(''); setLogs([]); setActiveTab('overview'); };

    const cfg = profile ? (TIER_CONFIG[profile.tier] || TIER_CONFIG['Bạc']) : null;
    const shopName = settings?.shopName || 'Thành Viên';

    const fmtVND = (v) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Math.round(v * 1000)) + 'đ';
    const fmtDate = (iso) => {
        if (!iso) return '—';
        const d = new Date(iso);
        return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div style={{
            minHeight: '100vh', background: 'linear-gradient(160deg, #EEF2FF 0%, #FFF8F0 50%, #F0FDF4 100%)',
            fontFamily: 'var(--font-main, Inter, sans-serif)',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '24px 16px 48px',
        }}>
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ textAlign: 'center', marginBottom: 32, maxWidth: 480, width: '100%' }}
            >
                <div style={{
                    width: 64, height: 64, background: 'linear-gradient(135deg, #6366F1, #818CF8)',
                    borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 16px', boxShadow: '0 8px 32px rgba(99,102,241,0.3)',
                }}>
                    <Crown size={30} color="#fff" />
                </div>
                <h1 style={{ fontSize: 26, fontWeight: 900, color: '#111827', margin: 0, letterSpacing: '-0.02em' }}>
                    Thẻ Thành Viên
                </h1>
                <p style={{ color: '#6B7280', fontSize: 14, margin: '6px 0 0', fontWeight: 600 }}>
                    {shopName} · Tích điểm · Thăng hạng · Ưu đãi
                </p>
            </motion.div>

            <div style={{ width: '100%', maxWidth: 480 }}>
                <AnimatePresence mode="wait">
                    {!profile ? (
                        /* ── Lookup Form ── */
                        <motion.div
                            key="lookup"
                            initial={{ opacity: 0, scale: 0.97 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.97 }}
                            style={{
                                background: '#fff',
                                borderRadius: 'var(--radius-card, 16px)',
                                padding: 28,
                                boxShadow: '0 4px 32px rgba(0,0,0,0.08)',
                            }}
                        >
                            <p style={{ fontSize: 14, fontWeight: 700, color: '#374151', marginBottom: 16 }}>
                                Nhập số điện thoại để xem điểm
                            </p>

                            {/* Phone display */}
                            <div style={{
                                background: '#F9FAFB', border: '2px solid',
                                borderColor: phone.length >= 9 ? '#6366F1' : '#E5E7EB',
                                borderRadius: 'var(--radius-input, 10px)',
                                padding: '14px 20px', marginBottom: 16,
                                textAlign: 'center', transition: 'border-color 0.2s',
                            }}>
                                <span style={{ fontSize: 28, fontWeight: 900, letterSpacing: '0.08em', color: '#111827', fontFamily: 'monospace' }}>
                                    {phone ? phone.replace(/(\d{4})(\d{3})(\d{3,4})/, '$1 $2 $3') : '_ _ _ _  _ _ _  _ _ _'}
                                </span>
                            </div>

                            <NumPad value={phone} onChange={setPhone} onSearch={handleSearch} loading={loading} />

                            <AnimatePresence>
                                {error && (
                                    <motion.p
                                        initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                        style={{ color: '#DC2626', fontSize: 13, fontWeight: 700, marginTop: 12, textAlign: 'center' }}
                                    >{error}</motion.p>
                                )}
                            </AnimatePresence>

                            {/* Info note */}
                            <div style={{
                                marginTop: 20, padding: '12px 16px',
                                background: '#EEF2FF', borderRadius: 'var(--radius-btn)',
                                fontSize: 12, color: '#4338CA', fontWeight: 600, textAlign: 'center'
                            }}>
                                💡 Chưa có tài khoản? Nhập SĐT tại Kiosk hoặc nhờ nhân viên đăng ký
                            </div>
                        </motion.div>
                    ) : (
                        /* ── Profile Dashboard ── */
                        <motion.div
                            key="profile"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                        >
                            {/* Hero Card */}
                            <div style={{
                                background: cfg.gradient,
                                borderRadius: 'var(--radius-card, 16px)',
                                padding: '28px 24px',
                                marginBottom: 16,
                                boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
                                position: 'relative', overflow: 'hidden',
                            }}>
                                {/* Decorative circles */}
                                <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
                                <div style={{ position: 'absolute', bottom: -20, right: 20, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.07)' }} />

                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', position: 'relative' }}>
                                    <div>
                                        <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
                                            Thẻ thành viên
                                        </p>
                                        <h2 style={{ color: '#fff', fontSize: 24, fontWeight: 900, margin: '4px 0 2px', letterSpacing: '-0.02em' }}>
                                            {profile.name}
                                        </h2>
                                        <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, margin: 0 }}>
                                            {profile.phone}
                                        </p>
                                    </div>
                                    <div style={{
                                        background: 'rgba(255,255,255,0.2)',
                                        borderRadius: '14px', padding: '10px 16px',
                                        textAlign: 'center', backdropFilter: 'blur(10px)',
                                    }}>
                                        <p style={{ color: '#fff', fontSize: 26, fontWeight: 900, margin: 0, lineHeight: 1 }}>
                                            {profile.points}
                                        </p>
                                        <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', margin: '3px 0 0' }}>
                                            Điểm
                                        </p>
                                    </div>
                                </div>

                                {/* Tier badge */}
                                <div style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                    background: 'rgba(255,255,255,0.25)', borderRadius: 999,
                                    padding: '5px 14px', marginTop: 16,
                                }}>
                                    <span style={{ fontSize: 14 }}>{cfg.emoji}</span>
                                    <span style={{ color: '#fff', fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                        Hạng {profile.tier}
                                    </span>
                                </div>

                                <TierProgressBar customer={profile} />
                            </div>

                            {/* Stats Row */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
                                {[
                                    { label: 'Số lần ghé', value: profile.visits || 0, icon: Coffee, color: '#2563EB', bg: '#EFF6FF' },
                                    { label: 'Tổng chi tiêu', value: fmtVND(profile.totalSpent || 0), icon: TrendingUp, color: '#059669', bg: '#F0FDF4', small: true },
                                    { label: 'Streak 🔥', value: `${profile.streak || 0} ngày`, icon: Flame, color: '#D97706', bg: '#FFFBEB' },
                                ].map((s, i) => (
                                    <div key={i} style={{
                                        background: s.bg, borderRadius: 'var(--radius-card)',
                                        padding: '14px 12px', textAlign: 'center',
                                    }}>
                                        <s.icon size={18} color={s.color} style={{ marginBottom: 6 }} />
                                        <p style={{ fontSize: s.small ? 12 : 20, fontWeight: 900, color: s.color, margin: 0, lineHeight: 1 }}>
                                            {s.value}
                                        </p>
                                        <p style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 700, textTransform: 'uppercase', margin: '4px 0 0', letterSpacing: '0.04em' }}>
                                            {s.label}
                                        </p>
                                    </div>
                                ))}
                            </div>

                            {/* Tabs */}
                            <div style={{
                                display: 'flex', background: '#F3F4F6', borderRadius: 'var(--radius-btn)', padding: 4,
                                marginBottom: 16, gap: 4,
                            }}>
                                {[
                                    { id: 'overview', label: 'Tổng quan' },
                                    { id: 'history', label: 'Lịch sử' },
                                    { id: 'rewards', label: 'Đổi điểm' },
                                ].map(tab => (
                                    <button key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        style={{
                                            flex: 1, height: 36, borderRadius: 'calc(var(--radius-btn) - 4px)',
                                            border: 'none', fontWeight: 800, fontSize: 12, cursor: 'pointer',
                                            transition: 'all 0.2s',
                                            background: activeTab === tab.id ? '#fff' : 'transparent',
                                            color: activeTab === tab.id ? '#111827' : '#6B7280',
                                            boxShadow: activeTab === tab.id ? '0 1px 6px rgba(0,0,0,0.1)' : 'none',
                                        }}
                                    >{tab.label}</button>
                                ))}
                            </div>

                            <AnimatePresence mode="wait">
                                {/* Overview Tab */}
                                {activeTab === 'overview' && (
                                    <motion.div key="overview"
                                        initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
                                        style={{ background: '#fff', borderRadius: 'var(--radius-card)', padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}
                                    >
                                        <h3 style={{ fontSize: 13, fontWeight: 900, color: '#374151', margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                            Thông tin tài khoản
                                        </h3>
                                        {[
                                            { label: 'Tham gia', value: fmtDate(profile.joinedAt) },
                                            { label: 'Ghé gần nhất', value: fmtDate(profile.lastVisit) },
                                            { label: 'SĐT', value: profile.phone },
                                            { label: 'Hạng thành viên', value: `${cfg.emoji} ${profile.tier}` },
                                        ].map((row, i) => (
                                            <div key={i} style={{
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                padding: '10px 0', borderBottom: i < 3 ? '1px solid #F9FAFB' : 'none',
                                            }}>
                                                <span style={{ fontSize: 13, color: '#9CA3AF', fontWeight: 600 }}>{row.label}</span>
                                                <span style={{ fontSize: 13, color: '#111827', fontWeight: 800 }}>{row.value}</span>
                                            </div>
                                        ))}

                                        {/* Next reward hint */}
                                        {profile.points < 10 && (
                                            <div style={{
                                                marginTop: 16, padding: '12px 16px',
                                                background: '#F0FDF4', borderRadius: 'var(--radius-btn)',
                                                display: 'flex', alignItems: 'center', gap: 10,
                                            }}>
                                                <Zap size={18} color="#059669" />
                                                <span style={{ fontSize: 13, color: '#059669', fontWeight: 700 }}>
                                                    Còn {10 - profile.points} điểm nữa → đổi được ly miễn phí!
                                                </span>
                                            </div>
                                        )}
                                    </motion.div>
                                )}

                                {/* History Tab */}
                                {activeTab === 'history' && (
                                    <motion.div key="history"
                                        initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
                                        style={{ background: '#fff', borderRadius: 'var(--radius-card)', padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}
                                    >
                                        <h3 style={{ fontSize: 13, fontWeight: 900, color: '#374151', margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                            Lịch sử điểm
                                        </h3>
                                        {logs.length === 0 ? (
                                            <p style={{ color: '#9CA3AF', fontSize: 13, fontWeight: 600, textAlign: 'center', padding: '20px 0' }}>
                                                Chưa có giao dịch nào
                                            </p>
                                        ) : logs.map((log, i) => (
                                            <div key={i} style={{
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                padding: '12px 0', borderBottom: i < logs.length - 1 ? '1px solid #F9FAFB' : 'none',
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    <div style={{
                                                        width: 36, height: 36, borderRadius: 'var(--radius-badge)',
                                                        background: log.pointsChanged > 0 ? '#F0FDF4' : '#FEF2F2',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                                    }}>
                                                        {log.pointsChanged > 0
                                                            ? <TrendingUp size={16} color="#059669" />
                                                            : <Gift size={16} color="#DC2626" />
                                                        }
                                                    </div>
                                                    <div>
                                                        <p style={{ fontSize: 13, fontWeight: 800, color: '#111827', margin: 0 }}>{log.note || 'Giao dịch điểm'}</p>
                                                        <p style={{ fontSize: 11, color: '#9CA3AF', margin: '2px 0 0' }}>{fmtDate(log.timestamp)}</p>
                                                    </div>
                                                </div>
                                                <span style={{
                                                    fontSize: 15, fontWeight: 900,
                                                    color: log.pointsChanged > 0 ? '#059669' : '#DC2626',
                                                }}>
                                                    {log.pointsChanged > 0 ? '+' : ''}{log.pointsChanged} pts
                                                </span>
                                            </div>
                                        ))}
                                    </motion.div>
                                )}

                                {/* Rewards Tab */}
                                {activeTab === 'rewards' && (
                                    <motion.div key="rewards"
                                        initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
                                        style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
                                    >
                                        <div style={{
                                            background: '#EEF2FF', borderRadius: 'var(--radius-btn)', padding: '12px 16px',
                                            fontSize: 13, color: '#4338CA', fontWeight: 700, textAlign: 'center',
                                        }}>
                                            💬 Đổi điểm bằng cách nhờ nhân viên tại quán
                                        </div>
                                        {REWARDS.map(r => {
                                            const canRedeem = profile.points >= r.points;
                                            return (
                                                <div key={r.id} style={{
                                                    background: '#fff', borderRadius: 'var(--radius-card)',
                                                    padding: '16px 20px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                                                    display: 'flex', alignItems: 'center', gap: 14,
                                                    opacity: canRedeem ? 1 : 0.55,
                                                    border: `2px solid ${canRedeem ? r.color + '30' : '#F3F4F6'}`,
                                                    transition: 'all 0.2s',
                                                }}>
                                                    <div style={{ fontSize: 32, flexShrink: 0 }}>{r.icon}</div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <p style={{ fontSize: 15, fontWeight: 900, color: '#111827', margin: 0 }}>{r.title}</p>
                                                        <p style={{ fontSize: 12, color: '#9CA3AF', margin: '2px 0 0', fontWeight: 600 }}>{r.desc}</p>
                                                    </div>
                                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                        <div style={{
                                                            background: canRedeem ? r.color : '#F3F4F6',
                                                            color: canRedeem ? '#fff' : '#9CA3AF',
                                                            borderRadius: 999, padding: '4px 12px',
                                                            fontSize: 12, fontWeight: 900,
                                                        }}>
                                                            {r.points} pts
                                                        </div>
                                                        {canRedeem && (
                                                            <p style={{ fontSize: 10, color: '#059669', fontWeight: 800, margin: '4px 0 0' }}>
                                                                ✓ Đủ điểm
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Back button */}
                            <button
                                onClick={reset}
                                className="bg-white border border-gray-200 text-gray-600 font-black hover:bg-gray-50 transition-all uppercase text-xs tracking-widest w-full flex items-center justify-center gap-2"
                                style={{ minHeight: 44, borderRadius: 'var(--radius-btn)', marginTop: 16 }}
                            >
                                <RotateCcw size={14} /> Tra cứu SĐT khác
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Footer */}
            <p style={{ marginTop: 32, color: '#D1D5DB', fontSize: 11, fontWeight: 600, textAlign: 'center' }}>
                {shopName} · Hệ thống THPOS · 10.000đ = 1 điểm
            </p>
        </div>
    );
}
