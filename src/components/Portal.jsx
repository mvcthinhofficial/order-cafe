import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Monitor, QrCode, ChefHat, Coffee } from 'lucide-react';

const Portal = () => {
    const navigate = useNavigate();

    React.useEffect(() => {
        const searchHasParam = (key) => {
            const params = new URLSearchParams(window.location.search);
            return params.has(key) ? params.get(key) : null;
        };
        const hashHasParam = (key) => {
             const hashQuery = window.location.hash.split('?')[1] || '';
             const params = new URLSearchParams(hashQuery);
             return params.has(key) ? params.get(key) : null;
        };
        
        const action = searchHasParam('action') || hashHasParam('action');
        const token = searchHasParam('token') || hashHasParam('token');
        const staffId = searchHasParam('staffId') || hashHasParam('staffId');
        const itemId = searchHasParam('itemId') || hashHasParam('itemId');

        if (action === 'admin') { navigate('/admin'); return; }
        if (action === 'kiosk') { navigate('/kiosk'); return; }
        if (action === 'kitchen') { navigate('/kitchen'); return; }
        if (action === 'customer-qr') { navigate('/customer-qr'); return; }
        if (action === 'attendance') {
            navigate(`/attendance?staffId=${staffId}&token=${token}`);
            return;
        }

        if (token || itemId || action === 'order') {
            let targetParams = new URLSearchParams();
            if (token) targetParams.append('token', token);
            if (itemId) targetParams.append('itemId', itemId);
            navigate('/order?' + targetParams.toString());
            return;
        }

        const isMobileDevice = () => {
            return /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        };

        const isLocalHost = () => {
            const host = window.location.hostname;
            return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.startsWith('192.168.') || host.startsWith('10.') || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host);
        };

        // [BUG FIX] Chỉ điều hướng khách hàng CHƯA ĐĂNG NHẬP sang trang Order 
        // Nếu đã có authToken (Nhân viên/Quản lý), họ được phép ở lại Portal để làm việc
        const authToken = localStorage.getItem('authToken');
        if (!authToken && isMobileDevice() && !isLocalHost() && window.location.pathname !== '/order') {
            navigate('/order');
        }
    }, [navigate]);

    const portalOptions = [
        {
            id: 'admin',
            title: 'Bán hàng (POS)',
            desc: 'Dành cho nhân viên phục vụ & quản lý',
            icon: <ShieldCheck size={32} />,
            color: "var(--brand-600)",
            path: '/admin'
        },
        {
            id: 'kiosk',
            title: 'Màn hình Kiosk',
            desc: 'Màn hình tự phục vụ đặt tại quầy',
            icon: <Monitor size={32} />,
            color: '#059669',
            path: '/kiosk'
        },
        {
            id: 'customer-qr',
            title: 'QR Xoay Đặt Món',
            desc: 'Màn hình hiển thị mã QR cho khách quét lấy Menu',
            icon: <QrCode size={32} />,
            color: '#2563EB',
            path: '/customer-qr'
        },
        {
            id: 'kitchen',
            title: 'Bếp / Pha chế',
            desc: 'Màn hình nhận đơn Ưu Tiên cho khu vực chuẩn bị',
            icon: <ChefHat size={32} />,
            color: '#D946EF',
            path: '/kitchen'
        }
    ];

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #FAF9F6 0%, #F5F0E8 100%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            fontFamily: "Inter, sans-serif"
        }}>
            <div style={{ textAlign: 'center', marginBottom: 40 }}>
                <div style={{
                    width: 64, height: 64, borderRadius: 20,
                    background: 'linear-gradient(135deg, #F5A623, #D97706)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 16px', boxShadow: '0 10px 30px rgba(217, 119, 6, 0.3)'
                }}>
                    <Coffee size={32} color="#FFF" />
                </div>
                <h1 style={{ fontSize: 28, fontWeight: 900, color: '#1C1C1E', marginBottom: 8 }}>TH-POS Portal</h1>
                <p style={{ color: '#6B7280', fontWeight: 500 }}>Vui lòng chọn chế độ hoạt động</p>
            </div>

            <div style={{
                display: 'grid', gridTemplateColumns: '1fr', gap: 16,
                width: '100%', maxWidth: 400
            }}>
                {portalOptions.map((opt) => (
                    <button
                        key={opt.id}
                        onClick={() => navigate(opt.path)}
                        style={{
                            background: '#FFF', padding: '24px', borderRadius: 24,
                            border: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', gap: 20,
                            textAlign: 'left', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
                            width: '100%'
                        }}
                    >
                        <div style={{
                            width: 60, height: 60, borderRadius: 16,
                            background: `${opt.color}15`, color: opt.color,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                        }}>
                            {opt.icon}
                        </div>
                        <div>
                            <h3 style={{ fontSize: 18, fontWeight: 800, color: '#1C1C1E', marginBottom: 2 }}>{opt.title}</h3>
                            <p style={{ fontSize: 13, color: '#9CA3AF', fontWeight: 500, lineHeight: 1.4 }}>{opt.desc}</p>
                        </div>
                    </button>
                ))}
            </div>

            <p style={{ marginTop: 40, color: '#9CA3AF', fontSize: 12, fontWeight: 600, letterSpacing: '1px' }}>
                VERSION 2.0 • SYNCED
            </p>
        </div>
    );
};

export default Portal;
