import React, { useState, useEffect } from 'react';
import { SERVER_URL } from '../api';
import { QRCodeCanvas } from 'qrcode.react';
import { Sparkles, QrCode } from 'lucide-react';

const CustomerQrKiosk = () => {
    const [qrInfo, setQrInfo] = useState({ orderUrl: '', token: '' });
    const [settings, setSettings] = useState({});

    const fetchQrInfo = async () => {
        try {
            const res = await fetch(`${SERVER_URL}/api/qr-info`);
            const data = await res.json();
            if (data.success) {
                setQrInfo(data);
            }
        } catch (err) { }
    };

    useEffect(() => {
        fetchQrInfo();
        const interval = setInterval(fetchQrInfo, 1000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const res = await fetch(`${SERVER_URL}/api/settings`);
                if (res.ok) {
                    const data = await res.json();
                    setSettings(data);
                }
            } catch (err) { }
        };
        fetchSettings();
    }, []);

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #FAF9F6 0%, #F5F0E8 100%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '12px',
            fontFamily: "Inter, sans-serif"
        }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <div style={{
                    width: 48, height: 48, borderRadius: 16,
                    background: 'linear-gradient(135deg, #10B981, #059669)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 12px', boxShadow: '0 10px 30px rgba(16, 185, 129, 0.3)'
                }}>
                    <QrCode size={24} color="#FFF" />
                </div>
                <h1 style={{ fontSize: 24, fontWeight: 900, color: '#1C1C1E', marginBottom: 4 }}>{settings.shopName || 'TH-POS'}</h1>
                <p style={{ color: '#6B7280', fontWeight: 500, fontSize: 13 }}>Vui lòng quét mã QR bên dưới bằng điện thoại</p>
            </div>

            <div style={{
                background: '#FFF', borderRadius: 32, padding: 30, textAlign: 'center',
                maxWidth: 450, width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,0.08)'
            }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(16,185,129,0.1)', color: '#059669', padding: '10px 16px', borderRadius: 99, marginBottom: 20 }}>
                    <Sparkles size={16} />
                    <span style={{ fontWeight: 900, fontSize: 12, textTransform: 'uppercase', letterSpacing: '1px' }}>QUÉT ĐỂ LẤY MENU ĐẶT MÓN</span>
                </div>

                <div style={{ background: '#FFF', padding: '12px', borderRadius: 20, border: '6px solid #F9FAFB', display: 'inline-flex', marginBottom: 16, boxShadow: '0 10px 30px rgba(0,0,0,0.04)' }}>
                    {qrInfo.orderUrl ? (
                         <QRCodeCanvas
                            key={qrInfo.token}
                            value={qrInfo.orderUrl}
                            size={260}
                            level="H"
                            includeMargin={false}
                        />
                    ) : (
                        <div style={{ width: 260, height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F3F4F6', borderRadius: 12 }}>
                            <p style={{ color: '#9CA3AF', fontWeight: 'bold' }}>Đang tải mã...</p>
                        </div>
                    )}
                </div>

                <div style={{ background: '#F9FAFB', padding: '12px 24px', borderRadius: 16, display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
                    <p style={{ color: '#9CA3AF', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px' }}>MÃ PHIÊN LÀM VIỆC</p>
                    <p style={{ color: '#1C1C1E', fontSize: 28, fontWeight: 900, letterSpacing: '3px' }}>{qrInfo.token || '---'}</p>
                </div>

                <p style={{ marginTop: 20, color: '#6B7280', fontWeight: 600, fontSize: 13, lineHeight: 1.5 }}>
                    Mã xoay vòng liên tục & hợp lệ cho (01) lượt đặt hàng mới tại quán. Tự làm mới sau 60s.
                </p>
            </div>
        </div>
    );
};

export default CustomerQrKiosk;
