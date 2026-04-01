/**
 * VisualFlashOverlay.jsx
 * ─────────────────────────────────────────────────────────────
 * Hiển thị xác nhận hình ảnh (Visual Flash Confirmation) khi
 * nhân viên gõ mã phím tắt.
 * ─────────────────────────────────────────────────────────────
 */

import React from 'react';
import { useShortcut } from './ShortcutManager';
import { getImageUrl } from '../api';
import './VisualFlashOverlay.css';

// ─── Hằng số màu sắc ─────────────────────────────────────────
const ACCENT_COLOR = 'var(--color-brand, #007AFF)';
const TOPPING_COLOR = '#34C759';
const ERROR_COLOR = '#FF3B30';

// ─── Style helper: thẻ ảnh món ───────────────────────────────
const ItemCardStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
};

// ─── Component ảnh món ───────────────────────────────────────
const ItemImg = ({ src, size = 120 }) => (
    <div style={{
        width: size,
        height: size,
        borderRadius: 16,
        overflow: 'hidden',
        background: '#F0F0F0',
        flexShrink: 0,
        boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
    }}>
        {src
            ? <img src={getImageUrl(src)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <div style={{ width: '100%', height: '100%', background: '#E5E7EB' }} />
        }
    </div>
);

// ─── Main Component ───────────────────────────────────────────
const VisualFlashOverlay = () => {
    const ctx = useShortcut();

    // Không render gì khi ẩn
    if (!ctx || ctx.overlayState === 'hidden') return null;
    if (!ctx.mainItem && ctx.overlayState !== 'error') return null;

    const { mainItem, toppings, overlayState, flashKey, dismissOverlay } = ctx;
    const isError = overlayState === 'error';
    const hasTopping = toppings && toppings.length > 0;

    // ── Xác định class animation theo trạng thái ──────────────
    const animClass = isError ? 'sc-shake-anim' : 'sc-flash-enter';

    return (
        <>
            {/* ── Backdrop mờ nhẹ, click để đóng ── */}
            <div
                onClick={dismissOverlay}
                style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 9998,
                    background: 'rgba(0,0,0,0.25)',
                    WebkitBackdropFilter: 'blur(2px)',
                    backdropFilter: 'blur(2px)',
                }}
            />

            {/* ── Overlay Card chính ── */}
            <div
                key={flashKey}
                className={animClass}
                style={{
                    position: 'fixed',
                    top: '50%',
                    left: '50%',
                    zIndex: 9999,
                    transform: 'translate(-50%, -50%)',
                    background: 'rgba(255,255,255,0.95)',
                    WebkitBackdropFilter: 'blur(24px)',
                    backdropFilter: 'blur(24px)',
                    borderRadius: 24,
                    padding: '32px 40px',
                    minWidth: 280,
                    maxWidth: 480,
                    boxShadow: isError
                        ? `0 0 0 3px ${ERROR_COLOR}, 0 24px 60px rgba(0,0,0,0.25)`
                        : `0 0 0 3px ${ACCENT_COLOR}22, 0 24px 60px rgba(0,0,0,0.25)`,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 16,
                    willChange: 'transform, opacity',
                }}
            >
                {/* ── Nội dung LỖI ── */}
                {isError && (
                    <>
                        <div style={{
                            width: 72,
                            height: 72,
                            borderRadius: '50%',
                            background: `${ERROR_COLOR}18`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 36,
                        }}>✗</div>
                        <p style={{
                            fontSize: 15,
                            fontWeight: 900,
                            color: ERROR_COLOR,
                            textTransform: 'uppercase',
                            letterSpacing: '0.15em',
                            margin: 0,
                        }}>Mã không hợp lệ</p>
                    </>
                )}

                {/* ── Nội dung THƯỜNG (Món + Topping) ── */}
                {!isError && mainItem && (
                    <>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 16,
                            flexWrap: 'wrap',
                            justifyContent: 'center',
                        }}>
                            {/* ── Thẻ Món Chính ── */}
                            <div style={ItemCardStyle}>
                                <ItemImg src={mainItem.image} size={120} />
                                <div style={{ textAlign: 'center' }}>
                                    <p style={{
                                        margin: 0,
                                        fontSize: 13,
                                        fontWeight: 900,
                                        color: ACCENT_COLOR,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.1em',
                                        marginBottom: 2,
                                    }}>
                                        #{mainItem.shortcutCode}
                                    </p>
                                    <p style={{
                                        margin: 0,
                                        fontSize: 20,
                                        fontWeight: 900,
                                        color: '#1A1A1A',
                                        maxWidth: 160,
                                        textAlign: 'center',
                                    }}>
                                        {mainItem.name}
                                    </p>
                                    <p style={{
                                        margin: '4px 0 0',
                                        fontSize: 12,
                                        color: '#999',
                                        fontWeight: 700,
                                    }}>
                                        {parseFloat(mainItem.price)}k
                                    </p>
                                </div>
                            </div>

                            {/* ── Dấu + và Topping (nếu có) ── */}
                            {hasTopping && toppings.map((topping, idx) => (
                                <React.Fragment key={topping.id + idx}>
                                    <div className="sc-pulse-plus" style={{
                                        fontSize: 32,
                                        fontWeight: 900,
                                        color: TOPPING_COLOR,
                                        lineHeight: 1,
                                        flexShrink: 0,
                                    }}>+</div>
                                    <div style={ItemCardStyle}>
                                        <div style={{
                                            width: 88,
                                            height: 88,
                                            borderRadius: 12,
                                            overflow: 'hidden',
                                            background: '#F0FDF4',
                                            flexShrink: 0,
                                            boxShadow: `0 0 0 2px ${TOPPING_COLOR}60, 0 4px 12px rgba(0,0,0,0.12)`,
                                            animation: idx === toppings.length - 1 ? 'sc-pulse-border 0.6s ease-out' : 'none',
                                        }}>
                                            {topping.image
                                                ? <img src={getImageUrl(topping.image)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>☕</div>
                                            }
                                        </div>
                                        <div style={{ textAlign: 'center' }}>
                                            <p style={{
                                                margin: 0,
                                                fontSize: 11,
                                                fontWeight: 900,
                                                color: TOPPING_COLOR,
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.08em',
                                            }}>#{topping.shortcutCode}</p>
                                            <p style={{
                                                margin: '2px 0 0',
                                                fontSize: 14,
                                                fontWeight: 900,
                                                color: '#1A1A1A',
                                                maxWidth: 120,
                                            }}>{topping.name}</p>
                                        </div>
                                    </div>
                                </React.Fragment>
                            ))}
                        </div>

                        {/* ── Chips Modifiers ── */}
                        <div style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            justifyContent: 'center',
                            gap: 12,
                            alignItems: 'center',
                            marginTop: 12,
                            padding: '10px 16px',
                            background: '#F3F4F6',
                            borderRadius: 16,
                            border: '1px solid #E5E7EB',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontSize: 13, fontWeight: 800, color: '#6B7280' }}>SIZE:</span>
                                <span style={{ 
                                    fontSize: 14, fontWeight: 900, color: ACCENT_COLOR, 
                                    padding: '2px 8px', background: `${ACCENT_COLOR}15`, borderRadius: 6 
                                }}>
                                    {ctx.currentSize?.label || 'M'}
                                </span>
                            </div>
                            <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#D1D5DB' }} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontSize: 13, fontWeight: 800, color: '#6B7280' }}>ĐƯỜNG:</span>
                                <span style={{ 
                                    fontSize: 14, fontWeight: 900, color: '#F59E0B', 
                                    padding: '2px 8px', background: '#FEF3C7', borderRadius: 6 
                                }}>
                                    {ctx.currentSugar || '100%'}
                                </span>
                            </div>
                            <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#D1D5DB' }} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontSize: 13, fontWeight: 800, color: '#6B7280' }}>ĐÁ:</span>
                                <span style={{ 
                                    fontSize: 14, fontWeight: 900, color: '#06B6D4', 
                                    padding: '2px 8px', background: '#CFFAFE', borderRadius: 6 
                                }}>
                                    {ctx.currentIce || 'Bình thường'}
                                </span>
                            </div>
                            {ctx.currentQuantity > 1 && (
                                <>
                                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#D1D5DB' }} />
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span style={{ fontSize: 13, fontWeight: 800, color: '#6B7280' }}>SL:</span>
                                        <span style={{ 
                                            fontSize: 14, fontWeight: 900, color: '#EF4444', 
                                            padding: '2px 8px', background: '#FEE2E2', borderRadius: 6 
                                        }}>
                                            x{ctx.currentQuantity}
                                        </span>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* ── Hướng dẫn nhanh ── */}
                        <div style={{
                            marginTop: 4,
                            display: 'flex',
                            gap: 12,
                            alignItems: 'center',
                        }}>
                            <kbd style={{
                                padding: '4px 10px',
                                background: '#1A1A1A',
                                color: '#FFF',
                                borderRadius: 8,
                                fontSize: 11,
                                fontWeight: 900,
                                letterSpacing: '0.05em',
                                fontFamily: 'monospace',
                            }}>ENTER</kbd>
                            <span style={{ fontSize: 12, color: '#666', fontWeight: 700 }}>
                                Thêm vào giỏ  •
                            </span>
                            <kbd style={{
                                padding: '4px 10px',
                                background: '#E5E5EA',
                                color: '#555',
                                borderRadius: 8,
                                fontSize: 11,
                                fontWeight: 900,
                                fontFamily: 'monospace',
                            }}>ESC</kbd>
                            <span style={{ fontSize: 12, color: '#666', fontWeight: 700 }}>Hủy</span>
                        </div>
                    </>
                )}
            </div>
        </>
    );
};

export default VisualFlashOverlay;
