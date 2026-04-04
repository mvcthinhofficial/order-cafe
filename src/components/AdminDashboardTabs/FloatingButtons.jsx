import React, { useRef, useEffect } from 'react';
import { UserRound, QrCode, ShoppingBag } from 'lucide-react';
import { isInputActive, isDoubleTap } from '../../utils/ShortcutUtils.js';
import { SERVER_URL } from '../../api';

const FloatingDoubleEnterButton = ({ onDoubleEnter }) => {
    const lastEnterRef = useRef(0);
    useEffect(() => {
        const handler = (e) => {
            if (isInputActive()) return;
            if (e.key === 'Enter' || e.key === 'NumpadEnter') {
                if (isDoubleTap(lastEnterRef.current, 400)) {
                    onDoubleEnter();
                    lastEnterRef.current = 0;
                } else {
                    lastEnterRef.current = Date.now();
                }
            }
        };
        window.addEventListener('keydown', handler, { capture: true });
        return () => window.removeEventListener('keydown', handler, { capture: true });
    }, [onDoubleEnter]);
    return null;
};

const FloatingButtons = ({
    showOrderPanel, expandedItemId, activeTab, showAuditModal,
    setShowOrderPanel, settings, setSettings
}) => {
    if (showOrderPanel || expandedItemId || ['reports', 'settings', 'inventory', 'staff', 'customers', 'promotions'].includes(activeTab) || showAuditModal) return null;

    const toggleStaffQr = async () => {
        try {
            const res = await fetch(`${SERVER_URL}/api/settings/toggle-staff-kiosk-qr`, { method: 'POST' });
            const data = await res.json();
            if (data.success) setSettings(prev => ({ ...prev, showStaffQrOnKiosk: data.showStaffQrOnKiosk }));
        } catch (e) { console.error('Toggle Staff QR error', e); }
    };

    const toggleKioskQr = async () => {
        try {
            const newStatus = !settings.showQrOnKiosk;
            await fetch(`${SERVER_URL}/api/settings/toggle-kiosk-qr`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
            });
            await fetch(`${SERVER_URL}/api/settings/qr-protection`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('authToken')}` },
                body: JSON.stringify({ enabled: newStatus })
            });
            setSettings(prev => ({ ...prev, showQrOnKiosk: newStatus, qrProtectionEnabled: newStatus }));
        } catch (e) { console.error('Toggle QR error', e); }
    };

    return (
        // Mobile: bottom-4 right-3, icon nhỏ hơn; Desktop: bottom-8 right-8, icon to
        <div className="fixed z-[900] flex items-center gap-2 sm:gap-3"
            style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)', right: '12px' }}
        >
            <FloatingDoubleEnterButton onDoubleEnter={() => setShowOrderPanel(true)} />

            {/* Các nút phụ: ẩn trên mobile để nhường chỗ */}
            <button onClick={toggleStaffQr} title="Bật/Tắt Kiosk Chấm Công"
                className={`
                    hidden sm:flex
                    p-3 sm:p-5 shadow-2xl items-center justify-center
                    hover:scale-105 active:scale-95 transition-all outline-none ring-4
                    ${settings.showStaffQrOnKiosk
                        ? 'bg-brand-600 text-white ring-brand-500/20'
                        : 'bg-white text-brand-600 border border-brand-100 ring-gray-100'
                    }
                `}
                style={{ borderRadius: '16px' }}
            >
                <UserRound size={28} />
            </button>

            <button onClick={toggleKioskQr} title="Bật/Tắt mã QR Web ORDER"
                className={`
                    hidden sm:flex
                    p-3 sm:p-5 shadow-2xl items-center justify-center
                    hover:scale-105 active:scale-95 transition-all outline-none ring-4
                    ${settings.showQrOnKiosk
                        ? 'bg-brand-500 text-white ring-brand-500/20'
                        : 'bg-white text-brand-600 border border-brand-100 ring-gray-100'
                    }
                `}
                style={{ borderRadius: '16px' }}
            >
                <QrCode size={28} />
            </button>

            {/* ORDER Button: hiện trên tất cả, thu nhỏ trên mobile */}
            <button onClick={() => setShowOrderPanel(true)}
                className="group relative bg-brand-600 text-white shadow-2xl flex items-center gap-2 sm:gap-3 font-black hover:scale-105 active:scale-95 transition-all outline-none ring-4 ring-brand-500/20"
                style={{
                    padding: '14px 16px',
                    borderRadius: '16px',
                    fontSize: '16px'
                }}
            >
                <ShoppingBag size={24} className="sm:w-9 sm:h-9" />
                {/* Text ORDER: hiện trên tablet+ */}
                <span className="hidden sm:inline text-2xl">ORDER</span>
                <div className="absolute top-0 -translate-y-1/2 right-0 hidden sm:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity translate-x-1/2">
                    <span style={{ fontSize: 12, padding: '4px 6px', background: '#FFD60A', color: '#000', borderRadius: 6, fontWeight: 900, boxShadow: '0 4px 12px rgba(0,0,0,0.3)', fontFamily: 'monospace' }}>↵</span>
                    <span style={{ fontSize: 12, padding: '4px 6px', background: '#FFD60A', color: '#000', borderRadius: 6, fontWeight: 900, boxShadow: '0 4px 12px rgba(0,0,0,0.3)', fontFamily: 'monospace' }}>↵</span>
                </div>
            </button>
        </div>
    );
};

export default FloatingButtons;
