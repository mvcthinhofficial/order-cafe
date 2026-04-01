import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import MobileMenu from './components/MobileMenu';
import BillView from './components/BillView';
import AdminDashboard from './components/AdminDashboard';
import CustomerKiosk from './components/CustomerKiosk';
import Portal from './components/Portal';
import Login from './components/Login';

import AttendanceView from './components/AttendanceView';
import StaffQrKiosk from './components/StaffQrKiosk';
import KitchenDashboard from './components/KitchenDashboard';
import CustomerQrKiosk from './components/CustomerQrKiosk';
import { SERVER_URL } from './api';
import { generateTheme, applyTheme, applyRadiusPreset, applySpacingPreset } from './utils/themeEngine';

const PrivateRoute = ({ children }) => {
  const token = localStorage.getItem('authToken');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

// LanOnlyRoute: Chỉ cho phép truy cập từ LAN/Localhost (ngoại trừ ADMIN)
const LanOnlyRoute = ({ children }) => {
  const hostname = window.location.hostname;
  const userRole = localStorage.getItem('userRole');
  
  // Kiểm tra xem có phải IP LAN/Localhost không
  const isLan = 
    hostname === 'localhost' || 
    hostname === '127.0.0.1' || 
    hostname.startsWith('192.168.') || 
    hostname.startsWith('10.') || 
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
    window.location.protocol === 'file:';

  const isAdmin = userRole === 'ADMIN';

  // Nếu KHÔNG phải LAN và CŨNG KHÔNG phải ADMIN thì chặn
  if (!isLan && !isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#F9F8F6] p-4 text-center">
        <h1 className="text-3xl font-bold text-red-600 mb-4">Kết Nối Bị Từ Chối</h1>
        <p className="text-gray-700 max-w-md text-lg">
          Màn hình này chỉ có thể được truy cập thông qua mạng nội bộ (LAN) của quán. 
          Vui lòng kết nối đúng mạng WiFi để sử dụng.
        </p>
      </div>
    );
  }

  return children;
};

function App() {
  const [customerName, setCustomerName] = useState(localStorage.getItem('customerName') || '');
  const [order, setOrder] = useState(JSON.parse(localStorage.getItem('currentOrder')) || null);
  const [settings, setSettings] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('authToken'));

  // 0. Theo dõi trạng thái đăng nhập thời gian thực
  useEffect(() => {
    const checkAuth = () => {
      setIsAuthenticated(!!localStorage.getItem('authToken'));
    };
    window.addEventListener('storage', checkAuth);
    // Tạo interval ngắn để check local thay đổi (vì storage event chỉ bắn giữa các tab khác nhau)
    const interval = setInterval(checkAuth, 1000);
    return () => {
      window.removeEventListener('storage', checkAuth);
      clearInterval(interval);
    };
  }, []);

  // Initialize Client ID
  if (!localStorage.getItem('clientId')) {
    localStorage.setItem('clientId', 'client_' + Math.random().toString(36).substring(2, 15));
  }

  // 1. Tự động nhận diện Token từ URL
  const checkUrlToken = () => {
    try {
      const urlParams = new URLSearchParams(window.location.search || window.location.hash.split('?')[1] || '');
      const tokenInUrl = urlParams.get('token');

      if (tokenInUrl) {
        const lastToken = localStorage.getItem('qrToken');
        if (tokenInUrl !== lastToken) {
          console.log(`[QUÉT-QR] Phát hiện Token mới: ${tokenInUrl}`);
          localStorage.setItem('qrToken', tokenInUrl);
          // Kích hoạt reload MobileMenu nếu cần thông qua sự kiện local (MobileMenu.jsx sẽ lắng nghe)
          window.dispatchEvent(new Event('storage'));
        }
      }
    } catch (e) { console.error("[QUÉT-QR] Lỗi nhận diện URL:", e); }
  };

  checkUrlToken();

  // 2. Gửi tín hiệu xoay mã QR khi người dùng bắt đầu tương tác
  useEffect(() => {
    const signalRotate = async () => {
      const token = localStorage.getItem('qrToken');
      const lastSignaled = localStorage.getItem('last_signaled_token');

      if (token && token !== lastSignaled) {
        console.log(`[TÍN-HIỆU] Đang gửi tín hiệu xoay QR cho token: ${token}`);
        try {
          const res = await fetch(`${SERVER_URL}/api/qr-token/accessed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: token.toUpperCase() })
          });
          if (res.ok) {
            console.log(`[TÍN-HIỆU] Server xác nhận: Mã QR trên Kiosk đã xoay.`);
            localStorage.setItem('last_signaled_token', token);
            // Gỡ bỏ bộ lắng nghe sau khi gửi thành công
            window.removeEventListener('mousedown', signalRotate);
            window.removeEventListener('touchstart', signalRotate);
          }
        } catch (e) {
          console.error("[TÍN-HIỆU] Lỗi gửi tín hiệu:", e);
        }
      }
    };

    // Lắng nghe click hoặc chạm bất kỳ đâu trên màn hình
    window.addEventListener('mousedown', signalRotate);
    window.addEventListener('touchstart', signalRotate);

    return () => {
      window.removeEventListener('mousedown', signalRotate);
      window.removeEventListener('touchstart', signalRotate);
    };
  }, []);

  // 3. Wake Lock - Keep screen on for mobile devices
  useEffect(() => {
    let wakeLock = null;

    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen');
          console.log('[WAKE-LOCK] Màn hình sẽ luôn sáng.');
        }
      } catch (err) {
        console.error(`${err.name}, ${err.message}`);
      }
    };

    requestWakeLock();

    const handleVisibilityChange = () => {
      if (wakeLock !== null && document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLock !== null) {
        wakeLock.release().then(() => {
          wakeLock = null;
        });
      }
    };
  }, []);

  useEffect(() => {
    if (customerName) localStorage.setItem('customerName', customerName);
  }, [customerName]);

  useEffect(() => {
    if (order) {
      localStorage.setItem('currentOrder', JSON.stringify(order));
    } else {
      localStorage.removeItem('currentOrder');
    }
  }, [order]);

  // 4. Lấy cấu hình hệ thống
  useEffect(() => {
    fetch(`${SERVER_URL}/api/settings`)
      .then(res => res.json())
      .then(data => {
        setSettings(data);
        if (data.themeColor) {
           const palette = generateTheme(data.themeColor);
           applyTheme(palette, data);
        }
        // Phase 2: Apply radius preset nếu chủ quán đã chọn
        if (data.radiusPreset) {
          applyRadiusPreset(data.radiusPreset);
        }
        if (data.spacingPreset) {
          applySpacingPreset(data.spacingPreset);
        } else {
          applySpacingPreset('normal'); // fallback
        }
      })
      .catch(e => console.error("Fetch settings error", e));
  }, []);

  return (
    <div className="w-full min-h-screen bg-[#F9F8F6] text-gray-900">
      <Routes>
        <Route path="/" element={
           isAuthenticated ? (
             <LanOnlyRoute>
               <Portal />
             </LanOnlyRoute>
           ) : (
             <Login />
           )
        } />
        <Route path="/login" element={<Login />} />
        <Route path="/staff-qr" element={<LanOnlyRoute><StaffQrKiosk /></LanOnlyRoute>} />
        
        {/* Protected Routes */}
        <Route path="/admin" element={
          <PrivateRoute>
            <LanOnlyRoute>
              <AdminDashboard />
            </LanOnlyRoute>
          </PrivateRoute>
        } />
        {/* Public API Routes that use tokens */}
        <Route path="/attendance" element={<AttendanceView />} />
        
        <Route path="/kiosk" element={<LanOnlyRoute><CustomerKiosk /></LanOnlyRoute>} />
        <Route path="/kitchen" element={<LanOnlyRoute><KitchenDashboard /></LanOnlyRoute>} />
        <Route path="/customer-qr" element={<LanOnlyRoute><CustomerQrKiosk /></LanOnlyRoute>} />

        {/* Các route của giao diện MobileMenu/Order */}
        <Route path="/order" element={
          <div className="max-container">
            <div className="main-content">
              <MobileMenu settings={settings} />
            </div>
          </div>
        } />
        <Route path="/item/:itemId" element={
          <div className="max-container">
            <div className="main-content">
              <MobileMenu settings={settings} />
            </div>
          </div>
        } />
        <Route path="/bill" element={
            <div className="max-container">
              <div className="main-content">
                <BillView order={order} settings={settings} />
              </div>
            </div>
        } />

        <Route path="*" element={
          <div className="max-container">
            <div className="main-content">
              <MobileMenu settings={settings} />
            </div>
          </div>
        } />
      </Routes>
    </div>
  );
}

export default App;
