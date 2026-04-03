import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { X, Printer, CheckCircle2, QrCode, Banknote, Smartphone } from 'lucide-react';
import { SERVER_URL } from '../../api.js';


// ── VietQR builder ──────────────────────────────────────────────────────────
const buildVietQrUrl = ({ settings, amount, queueNumber }) => {
    if (settings?.customQrUrl) return settings.customQrUrl;
    const { bankId, accountNo, accountName } = settings || {};
    if (!bankId || !accountNo) return null;
    const template = 'compact2';
    const amountParam = amount > 0 ? `amount=${Math.round(amount * 1000)}` : '';
    const infoParam = queueNumber ? `addInfo=Don+${queueNumber}` : '';
    const nameParam = accountName ? `accountName=${encodeURIComponent(accountName)}` : '';
    const params = [amountParam, infoParam, nameParam].filter(Boolean).join('&');
    return `https://img.vietqr.io/image/${bankId}-${accountNo}-${template}.png${params ? '?' + params : ''}`;
};

// ── Helpers để quyết định tab mặc định ─────────────────────────────────────
const hasVietQr = (settings) =>
    !!(settings?.customQrUrl || (settings?.bankId && settings?.accountNo));

// MoMo: chỉ hiển thị khi có ảnh QR tĩnh đã upload
const hasMomo = (settings) =>
    !!(settings?.momoEnabled && settings?.momoQrImageUrl);

const getMomoImgSrc = (settings) => {
    const url = settings?.momoQrImageUrl || '';
    if (!url) return null;
    if (url.startsWith('http') || url.startsWith('blob') || url.startsWith('data')) return url;
    return `${SERVER_URL}/${url}`;
};

// ── Component ───────────────────────────────────────────────────────────────
const QuickPaymentModal = ({
    order,
    onClose,
    onConfirmPayment,
    onCompleteOrder,
    formatVND,
    settings,
    generateReceiptHTML,
    showToast,
}) => {
    const [shouldPrint, setShouldPrint] = useState(true);
    const [confirming, setConfirming] = useState(false);
    const [paymentAutoConfirmed, setPaymentAutoConfirmed] = useState(false);

    const amount = order?.price || order?.preTaxTotal || order?.orderData?.preTaxTotal || 0;
    const queueNumber = order?.queueNumber;
    const cartItems = order?.orderData?.cartItems || order?.cartItems || [];

    const vietQrUrl = buildVietQrUrl({ settings, amount, queueNumber });
    const momoImgSrc = getMomoImgSrc(settings);


    const showVietQr = hasVietQr(settings);
    const showMomo = hasMomo(settings);
    const hasBoth = showVietQr && showMomo;

    // Tab mặc định: nếu momoPreferred → MoMo, nếu không → VietQR
    const defaultTab = (settings?.momoPreferred && showMomo) ? 'momo' : 'vietqr';
    const [activeTab, setActiveTab] = useState(defaultTab);

    // Cập nhật tab mặc định khi settings thay đổi
    useEffect(() => {
        setActiveTab((settings?.momoPreferred && showMomo) ? 'momo' : 'vietqr');
    }, [settings?.momoPreferred, showMomo]);

    // Brand color
    const BRAND = 'var(--brand-600)';
    const MOMO_COLOR = '#A50064';

    // SSE listener: lắng nghe PAYMENT_CONFIRMED từ server khi webhook xác nhận
    useEffect(() => {
        if (!settings?.sePayEnabled && !settings?.mbbankEnabled) return; // Chỉ listen khi có bật webhook
        const evtSource = new EventSource(`${SERVER_URL}/api/events`);
        const handlePaymentConfirmed = (e) => {
            try {
                const data = JSON.parse(e.data);
                if (data.orderId === order?.id) {
                    setPaymentAutoConfirmed(true);
                    // Auto-close sau 2.5 giây
                    setTimeout(() => {
                        onConfirmPayment(order.id).catch(() => {});
                        onClose();
                    }, 2500);
                }
            } catch {}
        };
        evtSource.addEventListener('PAYMENT_CONFIRMED', handlePaymentConfirmed);
        return () => {
            evtSource.removeEventListener('PAYMENT_CONFIRMED', handlePaymentConfirmed);
            evtSource.close();
        };
    }, [order?.id, settings?.sePayEnabled, settings?.mbbankEnabled, onConfirmPayment, onClose]);

    useEffect(() => {
        const handler = (e) => {
            if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
        };
        window.addEventListener('keydown', handler, true);
        return () => window.removeEventListener('keydown', handler, true);
    }, [onClose]);

    const handleConfirm = useCallback(async () => {
        if (confirming) return;
        setConfirming(true);
        try {
            await onConfirmPayment(order.id);

            if (shouldPrint && window.require) {
                try {
                    const { ipcRenderer } = window.require('electron');
                    const selectedPrinter = localStorage.getItem('selectedPrinter') || '';
                    const htmlContent = generateReceiptHTML(order, cartItems, settings, true);
                    await ipcRenderer.invoke('print-html', htmlContent, selectedPrinter, settings?.receiptPaperSize);
                } catch {
                    showToast('In hóa đơn thất bại', 'warning');
                }
            }

            onClose();
        } catch {
            showToast('Có lỗi xảy ra, thử lại!', 'error');
            setConfirming(false);
        }
    }, [confirming, order, cartItems, shouldPrint, onConfirmPayment, generateReceiptHTML, settings, showToast, onClose]);

    useEffect(() => {
        const handler = (e) => {
            if (e.key === 'Enter' && !confirming) { e.preventDefault(); e.stopPropagation(); handleConfirm(); }
        };
        window.addEventListener('keydown', handler, true);
        return () => window.removeEventListener('keydown', handler, true);
    }, [handleConfirm, confirming]);

    if (!order) return null;

    // Quyết định tab nào được hiển thị
    const currentQrType = hasBoth ? activeTab : (showMomo ? 'momo' : 'vietqr');

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1000] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', padding: '16px' }}
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.94, opacity: 0, y: 16 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.94, opacity: 0, y: 16 }}
                transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                className="bg-white w-full overflow-hidden flex flex-col relative"
                style={{ borderRadius: 'var(--radius-modal)', boxShadow: '0 24px 60px rgba(0,0,0,0.3)', maxWidth: '520px', maxHeight: '92vh' }}
                onClick={e => e.stopPropagation()}
            >
                {/* ── Auto-confirm overlay (hiện khi webhook nhận tiền) ── */}
                {paymentAutoConfirmed && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 rounded-[var(--radius-modal)]"
                        style={{ background: 'rgba(16, 185, 129, 0.97)' }}
                    >
                        <motion.div
                            animate={{ scale: [1, 1.15, 1] }}
                            transition={{ repeat: 2, duration: 0.4 }}
                        >
                            <CheckCircle2 size={72} color="#fff" strokeWidth={2.5} />
                        </motion.div>
                        <p style={{ fontSize: '22px', fontWeight: 900, color: '#fff', textAlign: 'center' }}>
                            Đã nhận tiền! ✓
                        </p>
                        <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.85)', fontWeight: 700 }}>
                            Xác nhận tự động qua webhook
                        </p>
                        <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>
                            Đang đóng...
                        </p>
                    </motion.div>
                )}

                {/* ── Header ── */}
                <div className="flex items-center justify-between shrink-0"
                    style={{ backgroundColor: BRAND, padding: '16px 20px' }}>
                    <div>
                        <p style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.7)' }}>
                            Xác nhận Thu Tiền
                        </p>
                        <p style={{ fontSize: '20px', fontWeight: 900, color: '#fff', marginTop: '2px' }}>Đơn #{queueNumber}</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.7)' }}>
                            Tổng thu
                        </p>
                        <p style={{ fontSize: '20px', fontWeight: 900, color: '#fff', marginTop: '2px' }}>{formatVND(amount)}</p>
                    </div>
                    <button onClick={onClose}
                        style={{ width: '32px', height: '32px', borderRadius: 'var(--radius-btn)', color: 'rgba(255,255,255,0.7)', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: '16px', flexShrink: 0 }}>
                        <X size={16} />
                    </button>
                </div>

                {/* ── Body ── */}
                <div className="flex-1 flex flex-col sm:flex-row overflow-hidden" style={{ minHeight: 0 }}>

                    {/* Danh sách món (luôn show, scroll được) */}
                    <div className="flex flex-col overflow-y-auto sm:border-r sm:border-slate-100"
                        style={{ flex: '1 1 0', padding: '12px 16px' }}>
                        <p style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#94A3B8', marginBottom: '10px' }}>
                            Danh sách món
                        </p>

                        {cartItems.length === 0 ? (
                            <p style={{ color: '#CBD5E1', fontSize: '12px', fontStyle: 'italic', textAlign: 'center', padding: '16px 0' }}>Không có món</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                                {cartItems.map((ci, i) => {
                                    const name = ci.item?.name || ci.name || '?';
                                    const count = ci.count || 1;
                                    const price = ci.totalPrice || ci.price || 0;
                                    const size = ci.size ? (typeof ci.size === 'string' ? ci.size : ci.size?.label) : null;
                                    const addons = (ci.addons || []).map(a => typeof a === 'string' ? a : a.label).filter(Boolean);
                                    const displayName = size ? `${name} (${size})` : name;
                                    const sub = [ci.sugar, ci.ice, ...addons].filter(Boolean).join(' · ');
                                    return (
                                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                            <span style={{ width: '20px', height: '20px', borderRadius: 'var(--radius-badge)', backgroundColor: BRAND, color: '#fff', fontSize: '10px', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}>
                                                {i + 1}
                                            </span>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <p style={{ fontSize: '13px', fontWeight: 900, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {displayName} <span style={{ color: BRAND, marginLeft: '4px' }}>x {count}</span>
                                                </p>
                                                {sub && <p style={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</p>}
                                            </div>
                                            <p style={{ fontSize: '12px', fontWeight: 900, color: '#1E293B', flexShrink: 0 }}>
                                                {formatVND(price * count)}
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Tổng */}
                        <div style={{ marginTop: 'auto', paddingTop: '10px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <p style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#64748B' }}>Tổng cộng</p>
                            <p style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A' }}>{formatVND(amount)}</p>
                        </div>

                        {/* QR compact — chỉ hiện trên mobile (sm:hidden) */}
                        {(vietQrUrl || momoImgSrc) && (
                            <div className="sm:hidden" style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #F1F5F9', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                                {hasBoth && (
                                    <div style={{ display: 'flex', width: '100%', maxWidth: '220px', borderRadius: 'var(--radius-btn)', overflow: 'hidden', border: '1.5px solid #E2E8F0' }}>
                                        <button onClick={() => setActiveTab('vietqr')} style={{ flex: 1, padding: '5px 4px', fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', border: 'none', cursor: 'pointer', background: activeTab === 'vietqr' ? BRAND : '#F8FAFC', color: activeTab === 'vietqr' ? '#fff' : '#94A3B8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
                                            <Banknote size={10} /> VietQR
                                        </button>
                                        <button onClick={() => setActiveTab('momo')} style={{ flex: 1, padding: '5px 4px', fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', border: 'none', borderLeft: '1.5px solid #E2E8F0', cursor: 'pointer', background: activeTab === 'momo' ? MOMO_COLOR : '#F8FAFC', color: activeTab === 'momo' ? '#fff' : '#94A3B8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
                                            <Smartphone size={10} /> MoMo
                                        </button>
                                    </div>
                                )}
                                {currentQrType === 'vietqr' && vietQrUrl && (
                                    <img src={vietQrUrl} alt="QR" style={{ width: '130px', height: '130px', objectFit: 'contain', borderRadius: 'var(--radius-card)', border: '2px solid #E2E8F0' }} />
                                )}
                                {currentQrType === 'momo' && momoImgSrc && (
                                    <img src={momoImgSrc} alt="QR MoMo" style={{ width: '130px', height: '130px', objectFit: 'contain', borderRadius: 'var(--radius-card)', border: '2px solid #F0D0E8' }} />
                                )}
                            </div>
                        )}
                    </div>

                    {/* Cột phải: QR — ẩn trên mobile (sm:hidden → sm:flex) */}
                    <div className="hidden sm:flex flex-col items-center gap-2" style={{ width: '180px', flexShrink: 0, padding: '12px' }}>

                        {/* Tab Switcher — chỉ hiện khi có cả hai */}
                        {hasBoth && (
                            <div style={{ display: 'flex', width: '100%', borderRadius: 'var(--radius-btn)', overflow: 'hidden', border: '1.5px solid #E2E8F0', flexShrink: 0 }}>
                                <button
                                    onClick={() => setActiveTab('vietqr')}
                                    style={{
                                        flex: 1, padding: '6px 4px', fontSize: '9px', fontWeight: 900,
                                        textTransform: 'uppercase', letterSpacing: '0.06em', border: 'none',
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px',
                                        background: activeTab === 'vietqr' ? BRAND : '#F8FAFC',
                                        color: activeTab === 'vietqr' ? '#fff' : '#94A3B8',
                                        transition: 'all 0.15s',
                                    }}
                                >
                                    <Banknote size={10} /> VietQR
                                </button>
                                <button
                                    onClick={() => setActiveTab('momo')}
                                    style={{
                                        flex: 1, padding: '6px 4px', fontSize: '9px', fontWeight: 900,
                                        textTransform: 'uppercase', letterSpacing: '0.06em', border: 'none',
                                        borderLeft: '1.5px solid #E2E8F0', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px',
                                        background: activeTab === 'momo' ? MOMO_COLOR : '#F8FAFC',
                                        color: activeTab === 'momo' ? '#fff' : '#94A3B8',
                                        transition: 'all 0.15s',
                                    }}
                                >
                                    <Smartphone size={10} /> MoMo
                                </button>
                            </div>
                        )}

                        {/* Label nếu chỉ có 1 loại */}
                        {!hasBoth && (
                            <p style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#94A3B8' }}>
                                {showMomo ? '📱 Quét MoMo' : 'Quét để CK'}
                            </p>
                        )}

                        {/* QR Box */}
                        <div style={{
                            width: '100%', aspectRatio: '1',
                            borderRadius: 'var(--radius-card)', overflow: 'hidden',
                            background: '#F9FAFB',
                            border: `2px solid ${currentQrType === 'momo' ? '#F0D0E8' : '#E2E8F0'}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: '6px',
                            transition: 'border-color 0.2s',
                        }}>
                            {/* VietQR */}
                            {currentQrType === 'vietqr' && (
                                vietQrUrl ? (
                                    <img src={vietQrUrl} alt={`VietQR đơn #${queueNumber}`}
                                        style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                                ) : (
                                    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', textAlign: 'center' }}>
                                        <QrCode size={36} style={{ color: '#CBD5E1' }} />
                                        <p style={{ fontSize: '9px', fontWeight: 700, color: '#94A3B8' }}>Chưa cấu hình ngân hàng</p>
                                    </div>
                                )
                            )}

                            {/* MoMo QR — dùng ảnh tĩnh upload từ app MoMo */}
                            {currentQrType === 'momo' && (
                                momoImgSrc ? (
                                    <img
                                        src={momoImgSrc}
                                        alt="QR MoMo"
                                        style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                                    />
                                ) : (
                                    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', textAlign: 'center' }}>
                                        <Smartphone size={36} style={{ color: '#CBD5E1' }} />
                                        <p style={{ fontSize: '9px', fontWeight: 700, color: '#94A3B8' }}>Upload QR từ app MoMo<br/>trong mục Cài đặt</p>
                                    </div>
                                )
                            )}
                        </div>

                        {/* Info dưới QR */}
                        {currentQrType === 'vietqr' && (settings?.bankId || settings?.accountNo) && (
                            <p style={{ fontSize: '9px', fontWeight: 700, color: '#94A3B8', textAlign: 'center' }}>
                                {settings.bankId} · {settings.accountNo}
                            </p>
                        )}
                        {currentQrType === 'momo' && settings?.momoPhone && (
                            <p style={{ fontSize: '9px', fontWeight: 700, color: MOMO_COLOR, textAlign: 'center' }}>
                                📱 {settings.momoPhone}
                            </p>
                        )}
                    </div>
                </div>

                {/* ── Footer ── */}
                <div style={{ borderTop: '1px solid #F1F5F9', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
                    {/* In bill */}
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', minHeight: '40px', padding: '8px 12px', borderRadius: 'var(--radius-card)', border: '1.5px solid #E2E8F0', cursor: 'pointer' }}>
                        <input type="checkbox" checked={shouldPrint} onChange={e => setShouldPrint(e.target.checked)}
                            style={{ width: '16px', height: '16px', accentColor: BRAND, flexShrink: 0 }} />
                        <Printer size={13} style={{ color: '#94A3B8', flexShrink: 0 }} />
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>In hóa đơn sau khi xác nhận</span>
                    </label>

                    {/* Buttons */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.8fr', gap: '8px' }}>
                        <button onClick={onClose}
                            style={{ minHeight: '48px', borderRadius: 'var(--radius-btn)', border: '1.5px solid #E2E8F0', background: '#fff', fontSize: '12px', fontWeight: 900, color: '#64748B', cursor: 'pointer' }}>
                            [ESC] Hủy
                        </button>
                        <button onClick={handleConfirm} disabled={confirming}
                            style={{ minHeight: '48px', borderRadius: 'var(--radius-btn)', backgroundColor: confirming ? '#9CA3AF' : BRAND, border: 'none', fontSize: '13px', fontWeight: 900, color: '#ffffff', cursor: confirming ? 'not-allowed' : 'pointer', opacity: confirming ? 0.75 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                            {confirming
                                ? <span>Đang xử lý...</span>
                                : <><CheckCircle2 size={15} color="#fff" /> [ENTER] Đã nhận tiền</>
                            }
                        </button>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
};

export default QuickPaymentModal;
