import React, { useState, useEffect } from 'react';
import { formatTime, formatDate, formatDateTime } from '../../utils/timeUtils';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Plus, Star, Clock, Award, QrCode, Play, Square, LineChart, 
    Edit2, Trash2, Shield, Lock, Info, Save, X, AlertTriangle, Key, KeyRound,
    ShoppingBag, LayoutGrid, Package, Users, BarChart3
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { SERVER_URL } from '../../api';
import SchedulesView from '../SchedulesView'; // Đường dẫn tương đối từ components/AdminDashboardTabs/

const isInputFocused = () => {
    const el = document.activeElement;
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.contentEditable === 'true');
};

const formatVND = (price) => {
    const num = parseFloat(price);
    if (isNaN(num)) return '0 ₫';
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num * 1000);
};

const getVNDateStr = (date = new Date()) => {
    const vnTime = new Date(date);
    return vnTime.toISOString().split('T')[0];
};

// ── Disciplinary Modal ──
const DisciplinaryModal = ({ member, logs, onSaveLog, onDeleteLog, onClose, hasPermission }) => {
    const [draftLog, setDraftLog] = useState({ date: getVNDateStr(), reason: '', pointsImpact: -5, type: 'RED_FLAG' });
    const employeeLogs = logs.filter(l => l.employeeId === member.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="bg-white p-6 shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col border border-gray-200">
                <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-2">
                    <h3 className="font-black text-gray-900 uppercase tracking-widest text-sm text-center flex-1">Nhật ký điểm & Kỷ luật: {member.name}</h3>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 text-gray-400"><X size={20} /></button>
                </div>

                <div className="mb-4 bg-gray-50 p-3 border border-gray-200">
                    <h4 className="text-[10px] font-black uppercase text-brand-600 mb-2">Thêm ghi nhận mới</h4>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                        <input type="date" className="p-2 border border-gray-200 text-sm w-full outline-none focus:border-brand-500" value={draftLog.date} onChange={e => setDraftLog({ ...draftLog, date: e.target.value })} />
                        <div className="flex items-center gap-1 bg-white border border-gray-200 px-2">
                            <span className="text-[10px] font-bold text-gray-500 whitespace-nowrap uppercase">Trừ điểm</span>
                            <input type="number" className="outline-none bg-transparent w-full !text-red-500 font-black text-right pr-1" value={Math.abs(draftLog.pointsImpact)} onChange={e => setDraftLog({ ...draftLog, pointsImpact: -(Math.abs(parseFloat(e.target.value)) || 0) })} />
                        </div>
                    </div>
                    <input type="text" placeholder="Lý do (VD: Đi trễ 15p, Phục vụ sai sót...)" className="p-2 border border-gray-200 text-sm w-full mb-2 outline-none focus:border-brand-500" value={draftLog.reason} onChange={e => setDraftLog({ ...draftLog, reason: e.target.value })} />
                    <button
                        onClick={() => {
                            if (!draftLog.reason) return alert('Vui lòng nhập lý do');
                            onSaveLog({ ...draftLog, employeeId: member.id });
                            setDraftLog({ ...draftLog, reason: '' });
                        }}
                        className="w-full bg-brand-600 hover:bg-brand-700 text-white font-black py-2.5 shadow-sm text-xs transition-colors rounded-none"
                    >LƯU GHI NHẬN</button>
                </div>

                <div className="flex-1 overflow-y-auto w-full pr-1">
                    <h4 className="text-[10px] font-black uppercase text-gray-400 mb-2">Lịch sử ({employeeLogs.length})</h4>
                    <div className="space-y-2">
                        {employeeLogs.map(log => (
                            <div key={log.id} className="bg-white border border-rose-100 p-2.5 shadow-sm flex items-start gap-3 relative group">
                                <div className="bg-rose-50 text-rose-600 px-2 py-1 font-black text-sm min-w-[36px] text-center border border-rose-100">
                                    {log.pointsImpact}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[11px] text-gray-400 font-bold uppercase">{formatDate(log.date || log.createdAt)}</p>
                                    <p className="text-sm font-bold text-gray-800 break-words mt-0.5">{log.reason}</p>
                                </div>
                                {hasPermission('staff', 'edit') && (
                                    <button onClick={() => { if (confirm('Xóa kỷ luật này và hoàn lại điểm?')) onDeleteLog(log.id); }} className="p-1.5 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-all opacity-0 group-hover:opacity-100 rounded-none shadow-sm"><Trash2 size={16} /></button>
                                )}
                            </div>
                        ))}
                        {employeeLogs.length === 0 && <p className="text-xs text-gray-400 italic text-center py-4 bg-gray-50 border border-dashed border-gray-200">Chưa có ghi nhận nào.</p>}
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

// ── Staff Modal ──
const StaffModal = ({ member, onSave, onClose, roles = [] }) => {
    const [draft, setDraft] = useState(member || { name: '', role: 'STAFF', roleId: '', password: '', diligencePoints: 100 });
    const [showPass, setShowPass] = useState(false);

    useEffect(() => {
        const handleEsc = (e) => {
            if ((e.key === 'Escape' || (e.key === 'Backspace' && !isInputFocused()))) onClose();
        };
        window.addEventListener('keydown', handleEsc, { capture: true });
        return () => window.removeEventListener('keydown', handleEsc, { capture: true });
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="bg-white p-8 shadow-2xl max-w-md w-full relative z-10 border border-gray-100">
                <h3 className="font-black text-gray-900 uppercase tracking-[4px] text-sm text-center mb-6">Thông tin tài khoản</h3>
                <div className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Họ và tên nhân viên</label>
                        <input autoFocus placeholder="VD: Nguyễn Văn A" className="w-full p-3 border border-gray-200 outline-none focus:border-brand-500 font-bold"
                            value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Vai trò (Phân quyền)</label>
                        <select className="w-full p-3 border border-gray-200 outline-none focus:border-brand-500 font-bold"
                            value={draft.roleId || ''} onChange={e => setDraft({ ...draft, roleId: e.target.value })}>
                            <option value="">-- Chọn vai trò --</option>
                            {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Mật khẩu (4-6 số)</label>
                        <div className="relative">
                            <input type={showPass ? "text" : "password"} placeholder="VD: 1234" className="w-full p-3 border border-gray-200 outline-none focus:border-brand-500 font-bold tracking-widest"
                                value={draft.password} onChange={e => setDraft({ ...draft, password: e.target.value })} />
                            <button onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
                                {showPass ? <KeyRound size={20} /> : <Key size={20} />}
                            </button>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Lương/giờ (k)</label>
                            <input type="number" placeholder="k/giờ" className="w-full p-3 border border-gray-200 outline-none focus:border-brand-500 font-bold"
                                value={draft.hourlyRate || ''} onChange={e => setDraft({ ...draft, hourlyRate: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Điểm siêng năng</label>
                            <input type="number" className="w-full p-3 border border-gray-200 outline-none focus:border-brand-500 font-bold text-green-600"
                                value={draft.diligencePoints ?? 100} onChange={e => setDraft({ ...draft, diligencePoints: parseInt(e.target.value) || 0 })} />
                        </div>
                    </div>
                </div>
                <div className="flex gap-3 pt-8">
                    <button onClick={onClose} className="flex-1 py-4 border border-gray-100 font-black text-[10px] uppercase tracking-[3px] hover:bg-gray-50 transition-colors">Hủy</button>
                    <button 
                        onClick={async () => {
                            await onSave(draft);
                            onClose();
                        }} 
                        className="flex-1 py-4 bg-brand-600 text-white font-black text-[10px] uppercase tracking-[3px] hover:bg-brand-700 shadow-xl shadow-brand-500/20 transition-all"
                    >Lưu tài khoản</button>
                </div>
            </motion.div>
        </div>
    );
};

// ── Role Modal ──
const RoleModal = ({ role, onSave, onClose }) => {
    const [draft, setDraft] = useState(role || {
        name: '',
        permissions: {
            orders: 'view',
            menu: 'view',
            inventory: 'view',
            staff: 'view',
            reports: 'view'
        }
    });

    useEffect(() => {
        const handleEsc = (e) => {
            if ((e.key === 'Escape' || (e.key === 'Backspace' && !isInputFocused()))) onClose();
        };
        window.addEventListener('keydown', handleEsc, { capture: true });
        return () => window.removeEventListener('keydown', handleEsc, { capture: true });
    }, [onClose]);

    const PERM_LEVELS = [
        { id: 'none', label: 'Khoá', color: 'text-gray-400 border-gray-100' },
        { id: 'view', label: 'Xem', color: 'text-blue-600 border-blue-100 bg-blue-50' },
        { id: 'edit', label: 'Sửa', color: 'text-green-600 border-green-100 bg-green-50' },
    ];

    const togglePerm = (module) => {
        const current = draft.permissions[module] || 'none';
        const next = current === 'none' ? 'view' : current === 'view' ? 'edit' : 'none';
        setDraft({
            ...draft,
            permissions: { ...draft.permissions, [module]: next }
        });
    };

    return (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="bg-white p-8 shadow-2xl max-w-md w-full relative z-10 border border-gray-100">
                <h3 className="font-black text-gray-900 uppercase tracking-[4px] text-sm text-center mb-8">Thiết lập vai trò mới</h3>
                <div className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Tên vai trò</label>
                        <input autoFocus placeholder="VD: Thu ngân, Pha chế..." className="w-full p-4 border border-gray-200 outline-none focus:border-brand-500 font-black uppercase text-sm tracking-widest"
                            value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
                    </div>

                    <div className="space-y-4">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Phân quyền chi tiết</label>
                        <div className="divide-y divide-gray-50 border border-gray-50">
                            {[
                                { id: 'orders', label: 'Quản lý Đơn hàng', icon: ShoppingBag },
                                { id: 'menu', label: 'Danh mục Thực đơn', icon: LayoutGrid },
                                { id: 'inventory', label: 'Kho & Nguyên liệu', icon: Package },
                                { id: 'staff', label: 'Nhân sự & Chấm công', icon: Users },
                                { id: 'reports', label: 'Báo cáo doanh số', icon: BarChart3 },
                            ].map(mod => {
                                const level = draft.permissions[mod.id] || 'none';
                                const levelData = PERM_LEVELS.find(l => l.id === level);
                                return (
                                    <div key={mod.id} onClick={() => togglePerm(mod.id)} className="flex items-center justify-between p-4 hover:bg-gray-50 cursor-pointer transition-colors group">
                                        <div className="flex items-center gap-3">
                                            <mod.icon size={18} className="text-gray-400 group-hover:text-brand-600 transition-colors" />
                                            <span className="text-xs font-black text-gray-700 uppercase tracking-tight">{mod.label}</span>
                                        </div>
                                        <div className={`px-4 py-1 border font-black text-[10px] uppercase tracking-tighter transition-all ${levelData.color}`}>
                                            {levelData.label}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
                <div className="flex gap-3 pt-8">
                    <button onClick={onClose} className="flex-1 py-4 border border-gray-100 font-black text-[10px] uppercase tracking-[3px] hover:bg-gray-50 transition-colors">Hủy</button>
                    <button 
                        onClick={async () => {
                            await onSave(draft);
                            onClose();
                        }} 
                        className="flex-1 py-4 bg-brand-600 text-white font-black text-[10px] uppercase tracking-[3px] hover:bg-brand-700 shadow-xl shadow-brand-500/20 transition-all"
                    >Lưu vai trò</button>
                </div>
            </motion.div>
        </div>
    );
};

const StaffTab = ({ 
    staff, roles, shifts, schedules, disciplinaryLogs, setDisciplinaryLogs, cfStatus, lanIP, lanHostname, settings, 
    hasPermission, handleClockIn, handleClockOut, handleSaveStaff, handleDeleteStaff,
    handleSaveRole, handleDeleteRole, handleSaveDisciplinaryLog, handleDeleteDisciplinaryLog,
    fetchData, setShowStaffReport, setShifts
}) => {
    const [staffSubTab, setStaffSubTab] = useState('list');
    const [attendanceToken, setAttendanceToken] = useState('');
    const [editStaff, setEditStaff] = useState(null);
    const [editRole, setEditRole] = useState(null);
    const [showDisciplinaryModalFor, setShowDisciplinaryModalFor] = useState(null);

    // Logic fetch token xoay mỗi 8s
    useEffect(() => {
        const fetchAttendanceToken = async () => {
            try {
                const res = await fetch(`${SERVER_URL}/api/attendance/token`);
                const data = await res.json();
                if (data.success) {
                    setAttendanceToken(prev => prev === data.token ? prev : data.token);
                }
            } catch (err) {
                console.error("Token fetch error", err);
            }
        };
        fetchAttendanceToken();
        const t = setInterval(fetchAttendanceToken, 8000);
        return () => clearInterval(t);
    }, []);



    const getStaffStats = (staffId) => {
        const memberShifts = (shifts || []).filter(s => s.staffId === staffId && s.clockOut);
        const totalHours = memberShifts.reduce((sum, s) => sum + (s.actualHours || 0), 0);
        return {
            totalHours: totalHours.toFixed(1),
            avgRating: '5.0', // Mock hoặc fetch từ API nếu có
            ratingCount: 0
        };
    };

    return (
        <motion.section key="staff" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} className="space-y-6" style={{ paddingLeft: '32px', paddingRight: '32px' }}>
            <div className="flex justify-between items-center px-1">
                <div>
                    <h3 className="text-lg font-black text-gray-900 uppercase tracking-widest">QUẢN LÝ NHÂN SỰ</h3>
                    <p className="text-[9px] text-gray-400 font-bold mt-1 uppercase tracking-widest">{staff.length} thành viên · hệ thống lịch biểu</p>
                </div>
                <div className="flex gap-3">
                    {staffSubTab === 'list' && hasPermission('staff', 'edit') && (
                        <button onClick={() => setEditStaff({})} className="bg-gray-900 text-white px-8 py-4 font-black flex items-center gap-2 shadow-lg hover:shadow-xl transition-all text-xs rounded-none hover:-translate-y-0.5 uppercase tracking-widest">
                            <Plus size={16} /> THÊM TÀI KHOẢN
                        </button>
                    )}
                </div>
            </div>

            <div className="flex justify-start items-center mt-4">
                <div className="flex bg-gray-100/50 p-1 rounded-none gap-1 border border-gray-200/50">
                    <button onClick={() => setStaffSubTab('list')} className={`px-8 py-3 font-black text-xs transition-all rounded-none uppercase tracking-widest ${staffSubTab === 'list' ? 'bg-white text-brand-600 shadow-md border border-gray-200/50' : 'text-gray-400 hover:text-gray-600'}`}>DANH SÁCH NHÂN SỰ</button>
                    <button onClick={() => setStaffSubTab('schedules')} className={`px-8 py-3 font-black text-xs transition-all rounded-none uppercase tracking-widest ${staffSubTab === 'schedules' ? 'bg-white text-brand-600 shadow-md border border-gray-200/50' : 'text-gray-400 hover:text-gray-600'}`}>BIỂU ĐỒ PHÂN CA (GANTT)</button>
                    <button onClick={() => setStaffSubTab('roles')} className={`px-8 py-3 font-black text-xs transition-all rounded-none uppercase tracking-widest ${staffSubTab === 'roles' ? 'bg-white text-brand-600 shadow-md border border-gray-200/50' : 'text-gray-400 hover:text-gray-600'}`}>PHÂN QUYỀN & VAI TRÒ</button>
                </div>
            </div>

            {staffSubTab === 'list' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
                    {staff.map(member => (
                        <div key={member.id} className={`bg-white p-5 border transition-all relative group flex flex-col gap-4 shadow-sm hover:shadow-xl ${shifts.find(s => s.staffId === member.id && !s.clockOut) ? 'border-green-500 ring-4 ring-green-50' : 'border-gray-100'}`}>
                            <div className="flex items-center gap-4">
                                <div className="w-14 h-14  bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center font-black text-xl text-white shadow-inner shadow-white/20">
                                    {member.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="text-[9px] text-brand-500 font-black tracking-[2px] mb-0.5 uppercase">{roles.find(r => r.id === member.roleId)?.name || member.role}</p>
                                            <h4 className="font-black text-gray-900 text-lg truncate uppercase tracking-tight">{member.name}</h4>
                                        </div>
                                        {shifts.find(s => s.staffId === member.id && !s.clockOut) && (
                                            <span className="px-3 py-1 bg-green-100 text-green-700 text-[9px] font-black animate-pulse rounded-none uppercase tracking-widest leading-none">đang làm</span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-2 bg-gray-50/50 p-3 border border-gray-100/50 rounded-sm">
                                <div className="flex flex-col items-center justify-center bg-white py-2 shadow-sm border border-gray-50">
                                    <p className="text-[9px] font-black uppercase text-gray-400 mb-1 flex items-center gap-1"><Star size={10} className="text-amber-400 fill-amber-400" /> Đánh giá</p>
                                    <p className="font-black text-gray-900 leading-none mt-0.5">{getStaffStats(member.id).avgRating} <span className="text-xs text-gray-400">({getStaffStats(member.id).ratingCount})</span></p>
                                </div>
                                <div className="flex flex-col items-center justify-center bg-white py-2 shadow-sm border border-gray-50" title={`Hạn mức ngày: ${member.dailyLimit || 8}h - Tháng: ${member.monthlyLimit || 200}h`}>
                                    <p className="text-[9px] font-black uppercase text-gray-400 mb-1 flex items-center gap-1"><Clock size={10} /> Giờ làm</p>
                                    <div className="flex items-baseline gap-1 mt-0.5">
                                        <p className="font-black text-gray-900 leading-none">{getStaffStats(member.id).totalHours}h</p>
                                        <p className="text-[9px] text-gray-400 font-bold">/ {member.monthlyLimit || 200}h</p>
                                    </div>
                                </div>
                                <div onClick={() => setShowDisciplinaryModalFor(member)} className="flex flex-col items-center justify-center bg-white py-2 shadow-sm border border-gray-50 cursor-pointer hover:bg-brand-50 transition-colors group/cc" title="Nhấn để xem/thêm ghi nhận kỷ luật">
                                    <p className="text-[9px] font-black uppercase text-brand-600 mb-1 flex items-center gap-1 group-hover/cc:text-brand-700"><Award size={10} /> Điểm CC</p>
                                    <p className={`font-black leading-none mt-0.5 ${(member.diligencePoints || 100) < 50 ? 'text-red-500' : 'text-green-600'}`}>{member.diligencePoints ?? 100}</p>
                                </div>
                            </div>

                            <div className="p-4 bg-white border-2 border-dashed border-gray-100 flex flex-col items-center gap-3">
                                <div className="relative group p-2 bg-white border border-gray-50 shadow-inner">
                                    {attendanceToken ? (
                                        <QRCodeCanvas
                                            value={(() => {
                                                if (settings.cfEnabled) {
                                                    if ((!settings.tunnelType || settings.tunnelType === 'auto') && cfStatus?.url) {
                                                        return `${cfStatus.url}/?action=attendance&staffId=${member.id}&token=${attendanceToken}`;
                                                    } else if (settings.tunnelType === 'manual' && settings.cfDomain) {
                                                        return `https://${settings.cfDomain}/?action=attendance&staffId=${member.id}&token=${attendanceToken}`;
                                                    }
                                                }
                                                return `http://${lanHostname || lanIP}:5173/?action=attendance&staffId=${member.id}&token=${attendanceToken}`;
                                            })()}
                                            size={140}
                                            level="H"
                                            includeMargin={false}
                                        />
                                    ) : (
                                        <div className="w-[140px] h-[140px] bg-gray-50 animate-pulse flex items-center justify-center">
                                            <Clock size={32} className="text-gray-200" />
                                        </div>
                                    )}
                                </div>
                                <div className="text-center">
                                    <p className="text-[11px] font-black text-brand-600 uppercase tracking-widest flex items-center justify-center gap-2">
                                        <QrCode size={14} /> MÃ CHẤM CÔNG AN TOÀN
                                    </p>
                                    <p className="text-[9px] text-gray-400 font-bold uppercase mt-0.5">Mã tự động xoay mỗi 8s</p>
                                </div>
                            </div>

                            <div className="flex gap-2">
                                {hasPermission('staff', 'edit') ? (
                                    <>
                                        {!shifts.find(s => s.staffId === member.id && !s.clockOut) ? (
                                            <button onClick={() => handleClockIn(member.id)} className="flex-1 bg-brand-50 hover:bg-brand-100 text-brand-600 py-6 font-black text-sm flex justify-center items-center gap-2 transition-colors"><Play size={18} fill="currentColor" /> VÀO CA</button>
                                        ) : (
                                            <button onClick={() => handleClockOut(member.id)} className="flex-1 bg-amber-50 hover:bg-amber-100 text-amber-600 py-6 font-black text-sm flex justify-center items-center gap-2 transition-colors"><Square size={18} fill="currentColor" /> KẾT THÚC</button>
                                        )}
                                    </>
                                ) : (
                                    <div className="flex-1 bg-gray-50 text-gray-400 py-6 font-black text-xs flex justify-center items-center gap-2 uppercase tracking-widest border border-gray-100 italic">
                                        <Lock size={14} /> Chỉ Quản lý
                                    </div>
                                )}
                                <button onClick={() => setShowStaffReport(member)} className="w-14 bg-brand-50 hover:bg-brand-100 text-brand-600 flex items-center justify-center transition-colors" title="Báo cáo"><LineChart size={18} /></button>
                                {hasPermission('staff', 'edit') && (
                                    <>
                                        <button onClick={() => setEditStaff(member)} className="w-14 bg-gray-50 hover:bg-gray-100 text-gray-600 flex items-center justify-center transition-colors"><Edit2 size={18} /></button>
                                        <button onClick={() => handleDeleteStaff(member.id)} className="w-14 bg-red-50 hover:bg-red-100 text-red-600 flex items-center justify-center transition-colors"><Trash2 size={18} /></button>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {staffSubTab === 'roles' && (
                <>
                    <div className="bg-white border border-gray-100 shadow-sm overflow-hidden mt-4">
                        <div className="p-6 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
                            <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                <Shield size={16} className="text-brand-600" /> DANH SÁCH CHI TIẾT VAI TRÒ & QUYỀN HẠN
                            </h4>
                            <button onClick={() => setEditRole({})} className="bg-brand-600 text-white px-4 py-2 font-black text-[10px] uppercase tracking-widest hover:bg-brand-700 transition-all flex items-center gap-2">
                                <Plus size={14} /> THÊM VAI TRÒ MỚI
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-white">
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Vai trò</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Đơn hàng</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Thực đơn</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Kho hàng</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Nhân sự</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Báo cáo</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 text-right">Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    <tr className="hover:bg-gray-50/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="font-black text-gray-900 text-sm uppercase tracking-tight">ADMIN</div>
                                            <div className="text-[9px] text-brand-600 font-bold uppercase mt-0.5 tracking-tighter">(Tất cả quyền)</div>
                                        </td>
                                        <td colSpan="5" className="px-6 py-4 text-center italic text-gray-400 text-[10px] uppercase font-bold tracking-widest">Toàn quyền hệ thống - Không thể chỉnh sửa</td>
                                        <td className="px-6 py-4 text-right">
                                            <Lock size={16} className="text-gray-200 inline-block" />
                                        </td>
                                    </tr>
                                    {roles.map(r => (
                                        <tr key={r.id} className="hover:bg-gray-50/50 transition-colors group">
                                            <td className="px-6 py-4">
                                                <div className="font-black text-gray-800 text-sm uppercase tracking-tight">{r.name}</div>
                                            </td>
                                            {['orders', 'menu', 'inventory', 'staff', 'reports'].map(m => (
                                                <td key={m} className="px-6 py-4">
                                                    <span className={`px-2 py-1 text-[9px] font-black uppercase tracking-tighter ${r.permissions?.[m] === 'edit' ? 'bg-green-50 text-green-600 border border-green-100' : r.permissions?.[m] === 'view' ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'bg-gray-50 text-gray-400 border border-gray-100'}`}>
                                                        {r.permissions?.[m] === 'edit' ? 'Sửa' : r.permissions?.[m] === 'view' ? 'Xem' : 'Khoá'}
                                                    </span>
                                                </td>
                                            ))}
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => setEditRole(r)} className="p-2 text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-all"><Edit2 size={16} /></button>
                                                    <button onClick={() => handleDeleteRole(r.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all"><Trash2 size={16} /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* --- GÁN VAI TRÒ CHO NHÂN VIÊN --- */}
                    <div className="bg-white border border-gray-100 shadow-sm overflow-hidden mt-8">
                        <div className="p-6 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
                            <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                <Users size={16} className="text-brand-600" /> DANH SÁCH TÀI KHOẢN TỔNG QUÁT & GÁN VAI TRÒ
                            </h4>
                            <div className="text-[10px] bg-brand-50 text-brand-600 px-3 py-1 font-black uppercase tracking-widest">
                               {staff.length} NHÂN VIÊN
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-white">
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 w-1/4">Nhân viên</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">ID / Username</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Vai trò hiện tại</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 text-right">Thao tác nhanh</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {staff.sort((a,b) => a.name.localeCompare(b.name)).map(member => (
                                        <tr key={member.id} className="hover:bg-gray-50/50 transition-colors group">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-none bg-brand-100 flex items-center justify-center font-black text-[10px] text-brand-600">
                                                        {member.name.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase()}
                                                    </div>
                                                    <div className="font-black text-gray-800 text-sm uppercase tracking-tight">{member.name}</div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-[10px] font-mono font-bold text-gray-400">{member.id}</span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <select 
                                                    value={member.roleId || ''} 
                                                    onChange={async (e) => {
                                                        const newRoleId = e.target.value;
                                                        await handleSaveStaff({ ...member, roleId: newRoleId });
                                                    }}
                                                    className="bg-gray-50 border border-gray-100 px-3 py-2 font-black text-[10px] uppercase tracking-tighter outline-none focus:border-brand-500 focus:bg-white transition-all w-full max-w-[200px]"
                                                >
                                                    <option value="">-- CHỌN VAI TRÒ --</option>
                                                    {roles.map(r => (
                                                        <option key={r.id} value={r.id}>{r.name.toUpperCase()}</option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button 
                                                        onClick={() => setEditStaff(member)}
                                                        className="p-2 text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-all inline-flex items-center gap-2 font-black text-[9px] uppercase tracking-widest"
                                                    >
                                                        <Edit2 size={14} /> CHI TIẾT
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {staff.length === 0 && (
                                        <tr>
                                            <td colSpan="4" className="px-6 py-8 text-center text-gray-400 text-xs italic uppercase">Chưa có nhân viên nào trong danh sách.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {staffSubTab === 'schedules' && (
                <div className="-mx-8">
                    <SchedulesView
                        staff={staff}
                        roles={roles}
                        schedules={schedules}
                        setSchedules={() => {}} // Hoặc truyền setSchedules nếu cần đồng bộ ngược
                        shifts={shifts}
                        refreshData={fetchData}
                    />
                </div>
            )}

            {/* Modals con */}
            <AnimatePresence>
                {editStaff && (
                    <StaffModal
                        member={editStaff.id ? editStaff : null}
                        roles={roles}
                        onSave={handleSaveStaff}
                        onClose={() => setEditStaff(null)}
                    />
                )}
                {editRole && (
                    <RoleModal
                        role={editRole.id ? editRole : null}
                        onSave={handleSaveRole}
                        onClose={() => setEditRole(null)}
                    />
                )}
                {showDisciplinaryModalFor && (
                   <DisciplinaryModal
                        member={showDisciplinaryModalFor}
                        logs={disciplinaryLogs}
                        onSaveLog={async (log) => {
                            await handleSaveDisciplinaryLog(log);
                            // AdminDashboard's handleSaveDisciplinaryLog handles fetchData
                        }}
                        onDeleteLog={async (id) => {
                            await handleDeleteDisciplinaryLog(id);
                            // AdminDashboard's handleDeleteDisciplinaryLog handles fetchData
                        }}
                        onClose={() => setShowDisciplinaryModalFor(null)}
                        hasPermission={hasPermission}
                    />
                )}
            </AnimatePresence>
        </motion.section>
    );
};

export default StaffTab;
