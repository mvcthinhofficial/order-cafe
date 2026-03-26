import React, { useState, useEffect } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { SERVER_URL } from '../api';
import { Clock, QrCode, ArrowLeft, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const StaffQrKiosk = ({ isEmbedded = false }) => {
    const navigate = useNavigate();
    const [staffList, setStaffList] = useState([]);
    const [attendanceToken, setAttendanceToken] = useState('');
    const [lanIP, setLanIP] = useState('');
    const [lanHostname, setLanHostname] = useState('');
    const [settings, setSettings] = useState({});
    const [cfStatus, setCfStatus] = useState({ active: false, url: '' });

    useEffect(() => {
        // Fetch base info
        const fetchInitialData = async () => {
            try {
                const [staffRes, lanRes, settingsRes] = await Promise.all([
                    fetch(`${SERVER_URL}/api/staff/public`),
                    fetch(`${SERVER_URL}/api/lan-info`),
                    fetch(`${SERVER_URL}/api/settings`)
                ]);

                if (staffRes.ok) setStaffList(await staffRes.json());
                
                if (lanRes.ok) {
                    const lanData = await lanRes.json();
                    setLanIP(lanData.ip);
                    setLanHostname(lanData.hostname);
                }

                if (settingsRes.ok) {
                    setSettings(await settingsRes.json());
                }
            } catch (err) {
                console.error("Lỗi tải dữ liệu Kênh Chấm công", err);
            }
        };

        fetchInitialData();
    }, []);

    // Rotating Token Fetcher (Mỗi 8s đồng bộ với backend)
    useEffect(() => {
        const fetchAttendanceToken = async () => {
            try {
                const res = await fetch(`${SERVER_URL}/api/attendance/token`);
                const data = await res.json();
                if (data.success) {
                    setAttendanceToken(data.token);
                }
            } catch (err) {
                console.error("Lỗi lấy Token điểm danh", err);
            }
        };

        fetchAttendanceToken(); // Fetch ngay lập tức
        const t = setInterval(fetchAttendanceToken, 8000);
        return () => clearInterval(t);
    }, []);

    // Tunnel Status Poller
    useEffect(() => {
        let timer;
        const checkStatus = async () => {
            try {
                const res = await fetch(`${SERVER_URL}/api/tunnel-status`);
                if (res.ok) {
                    setCfStatus(await res.json());
                }
            } catch (e) {
                // Fail silently
            }
        };
        checkStatus();
        timer = setInterval(checkStatus, 3000); // Poll every 3 seconds
        return () => clearInterval(timer);
    }, []);

    return (
        <div className={`${isEmbedded ? 'w-full h-full' : 'min-h-screen'} bg-gray-50 flex flex-col items-center py-10 px-4 overflow-y-auto`}>
            <div className={`w-full max-w-4xl flex items-center ${isEmbedded ? 'justify-end' : 'justify-between'} mb-8`}>
                {!isEmbedded && (
                    <button 
                        onClick={() => navigate('/login')}
                        className="flex items-center gap-2 text-gray-500 hover:text-gray-900 font-bold transition-colors bg-white px-4 py-2 rounded-2xl shadow-sm border border-gray-100"
                    >
                        <ArrowLeft size={18} /> Quay lại
                    </button>
                )}
                <div className="text-right">
                    <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tight flex items-center gap-2 justify-end">
                        <QrCode className="text-brand-600" />
                        Kiosk Chấm Công
                    </h1>
                    <p className="text-sm text-gray-400 font-bold mt-1">Sử dụng điện thoại để quét mã bên dưới</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-4xl">
                {staffList.map(member => (
                    <div key={member.id} className="bg-white rounded-[24px] p-6 shadow-xl border border-gray-100 flex flex-col items-center gap-4 hover:border-brand-600/30 transition-colors">
                        <div className="text-center w-full pb-4 border-b border-gray-100">
                            <h2 className="text-xl font-black text-gray-900 truncate">{member.name}</h2>
                            <p className="text-[10px] font-black text-brand-600 uppercase tracking-widest mt-1">{member.role}</p>
                        </div>
                        
                        <div className="relative group p-3 bg-white border-2 border-dashed border-gray-200 rounded-2xl w-[180px] h-[180px] flex items-center justify-center overflow-hidden">
                            {attendanceToken ? (
                                <QRCodeCanvas
                                    value={(() => {
                                        if (settings.cfEnabled) {
                                            if ((!settings.tunnelType || settings.tunnelType === 'auto') && cfStatus?.url) {
                                                return `${cfStatus.url}/#/attendance?staffId=${member.id}&token=${attendanceToken}`;
                                            } else if (settings.tunnelType === 'manual' && settings.cfDomain) {
                                                return `https://${settings.cfDomain}/#/attendance?staffId=${member.id}&token=${attendanceToken}`;
                                            }
                                        }
                                        return `http://${lanHostname || lanIP}:3001/#/attendance?staffId=${member.id}&token=${attendanceToken}`;
                                    })()}
                                    size={160}
                                    level="H"
                                    includeMargin={false}
                                />
                            ) : (
                                <div className="w-full h-full bg-gray-50 flex flex-col items-center justify-center animate-pulse">
                                    <Clock size={32} className="text-gray-300 mb-2" />
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Đang tải mã...</span>
                                </div>
                            )}

                            {/* Scan effect */}
                            <div className="absolute inset-x-0 top-0 h-1 bg-brand-600/20 shadow-[0_0_15px_rgba(0,122,255,0.5)] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none translate-y-[-100%] animate-[scan_2s_ease-in-out_infinite]" />
                        </div>

                        <div className="flex items-center gap-1.5 text-gray-400 bg-gray-50 px-3 py-1.5 rounded-2xl w-full justify-center">
                            <RefreshCw size={12} className={attendanceToken ? "animate-[spin_4s_linear_infinite]" : ""} />
                            <span className="text-[10px] font-bold uppercase tracking-wider">Mã xoay tự động 60s/lần</span>
                        </div>
                    </div>
                ))}
            </div>

            {staffList.length === 0 && (
                <div className="bg-white p-12 rounded-[32px] shadow-sm border border-gray-100 text-center flex flex-col items-center max-w-md w-full">
                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4 text-gray-400">
                        <QrCode size={32} />
                    </div>
                    <h3 className="text-lg font-black text-gray-900 mb-1">Chưa có dữ liệu nhân sự</h3>
                    <p className="text-sm text-gray-500 font-medium">Hệ thống hiện tại chưa ghi nhận nhân viên nào để tạo mã chấm công.</p>
                </div>
            )}
            
            <style jsx="true">{`
                @keyframes scan {
                    0% { transform: translateY(-100%); }
                    100% { transform: translateY(180px); }
                }
            `}</style>
        </div>
    );
};

export default StaffQrKiosk;
