import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SERVER_URL } from '../api';
import { KeyRound, UserRound, ArrowLeft, ArrowRight, X, ChevronRight, Lock } from 'lucide-react';

const Login = () => {
  const [activeTab, setActiveTab] = useState('staff'); // 'staff' or 'admin'
  const [staffList, setStaffList] = useState([]);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [pin, setPin] = useState('');
  
  const [adminUser, setAdminUser] = useState('');
  const [adminPass, setAdminPass] = useState('');
  
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [recoveryStep, setRecoveryStep] = useState(1);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryLoading, setRecoveryLoading] = useState(false);

  const [error, setError] = useState('');
  const [settings, setSettings] = useState({ shopName: 'TH-POS' });
  const [isRemote, setIsRemote] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // 1. Kiểm tra trạng thái kết nối (Local vs Remote)
    fetch(`${SERVER_URL}/api/auth/check-connection`)
      .then(res => res.json())
      .then(data => {
        setIsRemote(data.isRemote);
        // Nếu truy cập từ xa, mặc định tab Admin
        if (data.isRemote) setActiveTab('admin');
      })
      .catch(err => console.error("Check connection error", err));

    // 2. Lấy cấu hình hệ thống
    fetch(`${SERVER_URL}/api/settings`)
      .then(res => res.json())
      .then(data => setSettings(data || { shopName: 'TH-POS' }))
      .catch(err => console.error(err));
      
    fetch(`${SERVER_URL}/api/staff/public`)
      .then(res => res.json())
      .then(data => setStaffList(data || []))
      .catch(err => console.error(err));
  }, []);

  const handleNumpad = (num) => {
    if (pin.length < 6) {
      setPin(prev => prev + num);
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
  };

  const handleStaffLogin = async () => {
    if (pin.length !== 6) {
      setError('Vui lòng nhập đủ 6 số PIN');
      return;
    }
    setError('');
    try {
      const res = await fetch(`${SERVER_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'staff', staffId: selectedStaff.id, pin })
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('userRole', data.role);
        localStorage.setItem('userName', data.name);
        if (data.roleName) localStorage.setItem('userRoleName', data.roleName);
        if (data.permissions) localStorage.setItem('userPermissions', JSON.stringify(data.permissions));
        navigate('/');
      } else {
        setError(data.message || 'Mã PIN không đúng');
        setPin('');
      }
    } catch (err) {
      setError('Lỗi kết nối máy chủ');
    }
  };

  // auto login when pin reaches 6 digits
  useEffect(() => {
    if (pin.length === 6) {
      handleStaffLogin();
    }
  }, [pin, selectedStaff]); // Add selectedStaff just in case the PIN was typed fast before state set

  // Add keyboard support for PIN
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Only process keys if we are on the staff PIN input screen
      if (activeTab === 'staff' && selectedStaff) {
        if (/^[0-9]$/.test(e.key)) {
          handleNumpad(e.key);
        } else if (e.key === 'Backspace') {
          handleDelete();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, selectedStaff, pin]); // Re-attach when dependencies change

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch(`${SERVER_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'admin', username: adminUser, password: adminPass })
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('userRole', 'ADMIN');
        localStorage.setItem('userName', 'Quản lý');
        if (data.roleName) localStorage.setItem('userRoleName', data.roleName);
        if (data.permissions) localStorage.setItem('userPermissions', JSON.stringify(data.permissions));
        navigate('/');
      } else {
        setError(data.message || 'Tài khoản hoặc mật khẩu không đúng');
      }
    } catch (err) {
      setError('Lỗi kết nối máy chủ');
    }
  };

  const handleSubmitRecoveryCode = async (e) => {
    e.preventDefault();
    setError('');
    setRecoveryLoading(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/auth/login-recovery-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: recoveryCode })
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('userRole', data.role);
        localStorage.setItem('userName', data.name);
        if (data.roleName) localStorage.setItem('userRoleName', data.roleName);
        if (data.permissions) localStorage.setItem('userPermissions', JSON.stringify(data.permissions));
        alert('Đăng nhập bằng mã khôi phục thành công! Vui lòng thay đổi lại mật khẩu / mã PIN mới khi vào Cài đặt để đảm bảo bảo mật.');
        navigate('/');
      } else {
        setError(data.message || 'Mã khôi phục không đúng');
      }
    } catch (err) {
      setError('Lỗi kết nối máy chủ');
    } finally {
      setRecoveryLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center p-4" style={{ background: 'var(--color-brand-50)' }}>
      <div className="max-w-md w-full bg-white shadow-xl overflow-hidden" style={{ borderRadius: '20px' }}>
        {/* Header */}
        <div className="text-white text-center relative overflow-hidden" style={{ background: 'var(--color-brand-800)', padding: '28px 24px 24px' }}>
          {isRemote && (
            <div className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-0.5 bg-red-600/30 border border-red-500/30 backdrop-blur-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></div>
                <span className="text-[9px] font-black uppercase tracking-widest text-red-100 italic">Remote Mode</span>
            </div>
          )}
          <h1 className="text-2xl font-bold uppercase tracking-wider">{settings.shopName.toUpperCase() || 'TH-POS'}</h1>
          <p className="text-gray-300 mt-1">Hệ thống quản lý nội bộ</p>
        </div>

        {/* Tabs */}
        {!showForgotPassword && !isRemote && (
          <div className="flex border-b">
            <button
              className={`flex-1 py-4 text-center font-medium transition-colors ${activeTab === 'staff' ? 'text-[color:var(--color-brand-800)] border-b-2 border-[color:var(--color-brand-800)]' : 'text-gray-500 hover:text-gray-700'}`}
              onClick={() => { setActiveTab('staff'); setSelectedStaff(null); setPin(''); setError(''); }}
            >
              Nhân viên
            </button>
            <button
              className={`flex-1 py-4 text-center font-medium transition-colors ${activeTab === 'admin' ? 'text-[#4E342E] border-b-2 border-[#4E342E]' : 'text-gray-500 hover:text-gray-700'}`}
              onClick={() => { setActiveTab('admin'); setError(''); }}
            >
              Quản lý
            </button>
          </div>
        )}

        {showForgotPassword ? (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300" style={{ padding: '28px 28px 24px' }}>
            <div className="w-full flex justify-start mb-4">
              <button 
                onClick={() => { setShowForgotPassword(false); setRecoveryCode(''); setError(''); }}
                className="flex items-center text-gray-500 hover:text-gray-900 transition-colors font-semibold px-2 py-1 -ml-2" style={{ borderRadius: "6px" }}
              >
                <ArrowLeft size={20} className="mr-1" />
                Quay lại
              </button>
            </div>
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-red-50 flex items-center justify-center mx-auto mb-3 text-red-500" style={{ borderRadius: '50%' }}>
                <KeyRound size={28} />
              </div>
              <h2 className="text-xl font-bold">Khôi Phục Khẩn Cấp</h2>
              <p className="text-gray-500 mt-1 text-sm">
                Vui lòng nhập Mã khôi phục hệ thống để đăng nhập tạm thời.
              </p>
            </div>
            
            {error && (
              <div className="mb-4 bg-red-50 text-red-600 p-3 text-sm text-center font-medium" style={{ borderRadius: '8px' }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmitRecoveryCode} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mã khôi phục (Ví dụ: ADMIN-1A2B)</label>
                <input
                  type="text"
                  value={recoveryCode || ''}
                  onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
                  required
                  className="w-full px-4 py-3 border border-gray-300 focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-all font-mono tracking-widest text-center text-lg uppercase" style={{ borderRadius: '10px' }}
                  placeholder="xxxx-xxxx"
                  disabled={recoveryLoading}
                />
              </div>
              <button
                type="submit"
                disabled={recoveryLoading || !recoveryCode || recoveryCode.length < 5}
                className="w-full bg-brand-600 disabled:opacity-70 hover:bg-brand-600 text-white font-medium py-3.5 transition-colors mt-6 flex justify-center items-center gap-2 shadow-lg shadow-brand-500/20" style={{ borderRadius: '10px' }}
              >
                {recoveryLoading ? 'Đang kiểm tra...' : 'Xác nhận Đăng nhập'}
              </button>
            </form>
          </div>
        ) : (
        <div style={{ padding: '24px 28px 28px' }}>
          {error && (
            <div className="mb-4 bg-red-50 text-red-600 p-3 text-sm text-center font-medium" style={{ borderRadius: '8px' }}>
              {error}
            </div>
          )}

          {activeTab === 'staff' && (
            <div>
              {!selectedStaff ? (
                <div>
                  <h2 className="text-lg font-semibold mb-4 text-center">Chọn tài khoản của bạn</h2>
                  <div className="flex flex-col custom-scrollbar" style={{ gap: '10px', maxHeight: '300px', overflowY: 'auto', paddingRight: '4px' }}>
                    {staffList.map(s => (
                      <button
                        key={s.id}
                        onClick={() => setSelectedStaff(s)}
                        className="w-full text-left p-4 border border-gray-200 hover:border-[color:var(--color-brand-800)] hover:bg-[color:var(--color-brand-50)] transition-colors flex items-center justify-between group" style={{ borderRadius: '10px' }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gray-100 flex items-center justify-center text-gray-500 group-hover:bg-[color:var(--color-brand-800)] group-hover:text-white transition-colors" style={{ borderRadius: '8px' }}>
                            <UserRound size={20} />
                          </div>
                          <div>
                            <div className="font-medium text-gray-900">{s.name}</div>
                            <div className="text-sm text-gray-500">{s.role}</div>
                          </div>
                        </div>
                        <ChevronRight size={20} className="text-gray-400 group-hover:text-[color:var(--color-brand-800)]" />
                      </button>
                    ))}
                    {staffList.length === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        Chưa có nhân viên nào trên hệ thống
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="w-full flex justify-start mb-2 mt-2">
                    <button 
                      onClick={() => { setSelectedStaff(null); setPin(''); setError(''); }}
                      className="flex items-center text-gray-500 hover:text-gray-900 transition-colors font-semibold px-2 py-1 -ml-2" style={{ borderRadius: "6px" }}
                    >
                      <ArrowLeft size={20} className="mr-1" />
                      Quay lại
                    </button>
                  </div>
                  
                  <div className="w-full flex flex-col items-center mb-8">
                    <div className="w-16 h-16 bg-[#e8e4db] flex items-center justify-center mb-4 shadow-sm border border-[#4E342E]/10" style={{ borderRadius: '50%' }}>
                      <Lock size={28} className="text-[#4E342E]" />
                    </div>
                    <h2 className="text-2xl font-black text-[#1d1d1f]">Nhập mã PIN</h2>
                    <p className="text-gray-500 mt-2 font-medium">Chào {selectedStaff.name}, vui lòng nhập PIN 6 số</p>
                  </div>

                  {/* PIN Display */}
                  <div className="flex justify-center w-full gap-3 mb-8">
                    {[0, 1, 2, 3, 4, 5].map(i => (
                      <div 
                        key={i} 
                        className={`w-12 h-14 border border-gray-200 flex items-center justify-center text-2xl font-bold transition-all ${pin.length > i ? 'text-[#1d1d1f] bg-white' : 'bg-transparent'}`}
                      >
                        {pin.length > i ? '•' : ''}
                      </div>
                    ))}
                  </div>

                  {/* Numpad */}
                  <div className="w-full flex justify-center pb-6">
                    <div className="grid grid-cols-3 gap-x-6 gap-y-4 w-[280px] justify-items-center">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                        <button
                          key={num}
                          onClick={() => handleNumpad(num.toString())}
                          className="h-[72px] w-[72px] bg-[#f9f9f9] hover:bg-gray-100 text-2xl font-black text-[#1d1d1f] shadow-sm transition-colors active:scale-95 flex items-center justify-center" style={{ borderRadius: "14px" }}
                        >
                          {num}
                        </button>
                      ))}
                      <div className="h-[72px] w-[72px]"></div>
                      <button
                        onClick={() => handleNumpad('0')}
                        className="h-[72px] w-[72px] bg-[#f9f9f9] hover:bg-gray-100 text-2xl font-black text-[#1d1d1f] shadow-sm transition-colors active:scale-95 flex items-center justify-center" style={{ borderRadius: "14px" }}
                      >
                        0
                      </button>
                      <button
                        onClick={handleDelete}
                        className="h-[72px] w-[72px] bg-[#f9f9f9] hover:bg-gray-100 flex items-center justify-center text-[#1d1d1f] shadow-sm transition-colors active:scale-95" style={{ borderRadius: "14px" }}
                      >
                        <X size={24} />
                      </button>
                    </div>
                  </div>
                  
                  {!isRemote && (
                    <div className="flex justify-center mt-2 pb-4">
                      <button
                        type="button"
                        onClick={() => { setShowForgotPassword(true); setError(''); }}
                        className="text-sm text-brand-600 hover:text-brand-800 font-medium transition-colors"
                      >
                        Quên mã PIN?
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'admin' && (
            <div className="animate-in fade-in slide-in-from-left-4 duration-300">
              <div className="text-center mb-8 mt-4">
                <div className="w-16 h-16 flex items-center justify-center mx-auto mb-3" style={{ borderRadius: '50%', background: 'var(--color-brand-50)' }}>
                  <KeyRound size={28} style={{ color: 'var(--color-brand-800)' }} />
                </div>
                <h2 className="text-xl font-bold">Quản Trị Viên</h2>
                <p className="text-gray-500 mt-1">Đăng nhập bằng tài khoản Administrator</p>
              </div>

              <form onSubmit={handleAdminLogin} className="flex flex-col" style={{ gap: '16px' }}>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tên đăng nhập</label>
                  <input
                    type="text"
                    value={adminUser}
                    onChange={(e) => setAdminUser(e.target.value)}
                    className="w-full border border-gray-300 focus:ring-2 focus:ring-[color:var(--color-brand-600)] focus:border-transparent outline-none transition-all" style={{ borderRadius: '10px', padding: '14px 16px' }}
                    placeholder="Nhập tên đăng nhập"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mật khẩu</label>
                  <input
                    type="password"
                    value={adminPass}
                    onChange={(e) => setAdminPass(e.target.value)}
                    className="w-full border border-gray-300 focus:ring-2 focus:ring-[#4E342E] focus:border-transparent outline-none transition-all" style={{ borderRadius: '10px', padding: '14px 16px' }}
                    placeholder="Nhập mật khẩu"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full text-white font-medium transition-colors flex justify-center items-center gap-2" style={{ background: 'var(--color-brand-800)', borderRadius: 'var(--radius-btn)', padding: '14px 20px', marginTop: '8px' }}
                >
                  Đăng nhập <ArrowRight size={18} />
                </button>

                {!isRemote && (
                  <div className="flex justify-center" style={{ marginTop: '20px' }}>
                    <button
                      type="button"
                      onClick={() => { setShowForgotPassword(true); setError(''); }}
                      className="text-sm text-brand-600 hover:text-brand-800 font-medium transition-colors"
                    >
                      Quên Tên đăng nhập / Mật khẩu?
                    </button>
                  </div>
                )}
              </form>
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
};

export default Login;
