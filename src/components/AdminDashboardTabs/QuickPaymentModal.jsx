import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { X, Printer, CheckCircle2, QrCode } from 'lucide-react';

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

    const amount = order?.price || order?.preTaxTotal || order?.orderData?.preTaxTotal || 0;
    const queueNumber = order?.queueNumber;
    const cartItems = order?.orderData?.cartItems || order?.cartItems || [];
    const qrUrl = buildVietQrUrl({ settings, amount, queueNumber });

    // Brand color — dùng đúng CSS token của dự án (xem index.css)
    const BRAND = 'var(--brand-600)';

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
            // Bước 1: Xác nhận đã thu tiền → order.isPaid = true
            await onConfirmPayment(order.id);

            // Bước 2: In bill nếu cần
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

            // Bước 3: Đóng modal — nhân viên tự hoàn tất đơn sau khi pha xong
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
                className="bg-white w-full overflow-hidden flex flex-col"
                style={{ borderRadius: 'var(--radius-modal)', boxShadow: '0 24px 60px rgba(0,0,0,0.3)', maxWidth: '520px', maxHeight: '92vh' }}
                onClick={e => e.stopPropagation()}
            >
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
                <div className="flex-1 flex overflow-hidden" style={{ minHeight: 0 }}>

                    {/* Cột trái: Danh sách món */}
                    <div className="flex flex-col overflow-y-auto"
                        style={{ flex: '1 1 0', padding: '16px', borderRight: '1px solid #F1F5F9' }}>
                        <p style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#94A3B8', marginBottom: '12px' }}>
                            Danh sách món
                        </p>

                        {cartItems.length === 0 ? (
                            <p style={{ color: '#CBD5E1', fontSize: '12px', fontStyle: 'italic', textAlign: 'center', padding: '24px 0' }}>Không có món</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {cartItems.map((ci, i) => {
                                    const name = ci.item?.name || ci.name || '?';
                                    const count = ci.count || 1;
                                    const price = ci.totalPrice || ci.price || 0;
                                    const size = ci.size ? (typeof ci.size === 'string' ? ci.size : ci.size?.label) : null;
                                    const addons = (ci.addons || []).map(a => typeof a === 'string' ? a : a.label).filter(Boolean);
                                    const sub = [size, ci.sugar, ci.ice, ...addons].filter(Boolean).join(' · ');
                                    return (
                                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                            <span style={{ width: '20px', height: '20px', borderRadius: 'var(--radius-badge)', backgroundColor: BRAND, color: '#fff', fontSize: '10px', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}>
                                                {count}
                                            </span>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <p style={{ fontSize: '13px', fontWeight: 900, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</p>
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
                        <div style={{ marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <p style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#64748B' }}>Tổng cộng</p>
                            <p style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A' }}>{formatVND(amount)}</p>
                        </div>
                    </div>

                    {/* Cột phải: QR */}
                    <div style={{ width: '176px', flexShrink: 0, padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <p style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#94A3B8', marginBottom: '10px' }}>
                            Quét để CK
                        </p>
                        <div style={{ width: '100%', aspectRatio: '1', borderRadius: 'var(--radius-card)', overflow: 'hidden', background: '#F9FAFB', border: '1.5px solid #E2E8F0' }}>
                            {qrUrl ? (
                                <img src={qrUrl} alt={`QR đơn #${queueNumber}`}
                                    style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                            ) : (
                                <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '16px', textAlign: 'center' }}>
                                    <QrCode size={40} style={{ color: '#CBD5E1' }} />
                                    <p style={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8' }}>Chưa cấu hình ngân hàng</p>
                                </div>
                            )}
                        </div>
                        {(settings?.bankId || settings?.accountNo) && (
                            <p style={{ fontSize: '9px', fontWeight: 700, color: '#94A3B8', textAlign: 'center', marginTop: '8px' }}>
                                {settings.bankId} · {settings.accountNo}
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
