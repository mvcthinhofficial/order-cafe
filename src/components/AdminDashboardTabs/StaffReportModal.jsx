import React, { useState, useEffect } from 'react';
import { formatTime, formatDate, formatDateTime } from '../../utils/timeUtils';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    X, Clock, Star, Edit2, Save, RotateCcw, AlertTriangle, 
    ListOrdered, ChevronUp, ChevronDown, Trash2 
} from 'lucide-react';
import { SERVER_URL } from '../../api';

const isInputFocused = () => {
    const el = document.activeElement;
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.contentEditable === 'true');
};

const formatVND = (price) => {
    const num = parseFloat(price);
    if (isNaN(num)) return '0 ₫';
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num * 1000);
};

// ── Shift History Modal ──
const ShiftHistoryModal = ({ shift, onClose, onRestore }) => {
    if (!shift || !shift.editHistory) return null;

    return (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white max-w-2xl w-full shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[80vh]" style={{ borderRadius: 'var(--radius-modal)' }}>
                <div className="p-6 border-b border-gray-100 bg-brand-50 flex justify-between items-center">
                    <h3 className="text-xl font-black text-brand-800 uppercase tracking-widest">LỊCH SỬ CHỈNH SỬA CA LÀM</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
                </div>
                <div className="p-6 overflow-y-auto space-y-4">
                    {shift.editHistory.map((record, idx) => (
                        <div key={idx} className="border-l-4 border-brand-500 bg-gray-50 p-4 space-y-2 relative group" style={{ borderRadius: '0 10px 10px 0' }}>
                            <div className="flex justify-between items-start">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Lần chỉnh sửa #{shift.editHistory.length - idx}</span>
                                <span className="text-[10px] font-bold text-gray-500 bg-white px-2 py-1 shadow-sm border border-gray-100">{formatDateTime(record.editedAt)}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-4 text-xs">
                                <div className="space-y-1">
                                    <p className="text-gray-400 font-bold uppercase tracking-tighter">TRƯỚC KHI SỬA</p>
                                    <p className="font-bold text-red-500">{formatTime(record.previousClockIn)} - {formatTime(record.previousClockOut)}</p>
                                    <p className="text-gray-600 font-black">({record.previousHours?.toFixed(2)} giờ)</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-gray-400 font-bold uppercase tracking-tighter">SAU KHI SỬA</p>
                                    <p className="font-bold text-green-600">{formatTime(record.newClockIn)} - {formatTime(record.newClockOut)}</p>
                                    <p className="text-gray-600 font-black">({record.newHours?.toFixed(2)} giờ)</p>
                                </div>
                            </div>
                            <div className="pt-2 border-t border-gray-200 mt-2 flex justify-between items-center">
                                <p className="text-[11px] font-medium text-gray-500 italic">Người sửa: <span className="font-black text-gray-700">{record.editedBy || 'Quản lý'}</span></p>
                                <button
                                    onClick={() => onRestore(shift.id, record)}
                                    className="px-4 py-2 bg-brand-600 text-white font-black text-[10px] uppercase tracking-widest hover:bg-brand-700 transition-all flex items-center gap-2 shadow-md active:scale-95"
                                    style={{ borderRadius: 'var(--radius-badge)', minHeight: '36px' }}
                                >
                                    <RotateCcw size={14} /> PHỤC HỒI BẢN NÀY
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </motion.div>
        </div>
    );
};

// ── Interactive Shift Block ──
const InteractiveShiftBlock = ({ shift, sched, staffList, isHighlighted, onFocus, onBlur, onDragUpdate, onQuickEdit, displayStartMin, displayDur, onHighlightUpdate, isPersonalReport }) => {
    const clockInDate = new Date(shift.clockIn);
    const clockOutDate = shift.clockOut ? new Date(shift.clockOut) : new Date();

    const startMin = clockInDate.getHours() * 60 + clockInDate.getMinutes();
    const endMin = clockOutDate.getHours() * 60 + clockOutDate.getMinutes() + (clockOutDate.getDate() !== clockInDate.getDate() ? 24 * 60 : 0);

    const left = ((startMin - displayStartMin) / displayDur) * 100;
    const width = ((endMin - startMin) / displayDur) * 100;

    const [isDragging, setIsDragging] = useState(null); // 'start', 'end'
    const blockRef = React.useRef(null);

    const handleDragStart = (e, type) => {
        e.stopPropagation();
        setIsDragging(type);
    };

    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e) => {
            if (!blockRef.current) return;
            const track = blockRef.current.parentElement;
            const rect = track.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const percent = (x / rect.width) * 100;
            const totalMins = (percent / 100) * displayDur + displayStartMin;

            // Snap to 15 mins
            const snappedMins = Math.round(totalMins / 15) * 15;

            const newInDate = new Date(clockInDate);
            const newOutDate = new Date(clockOutDate);

            if (isDragging === 'start') {
                newInDate.setHours(Math.floor(snappedMins / 60), snappedMins % 60, 0, 0);
            } else {
                newOutDate.setHours(Math.floor(snappedMins / 60), snappedMins % 60, 0, 0);
                if (newOutDate <= newInDate) newOutDate.setDate(newOutDate.getDate() + 1);
            }

            if (onDragUpdate) onDragUpdate(shift.id, newInDate, newOutDate);
        };

        const handleMouseUp = () => setIsDragging(null);

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, shift, displayStartMin, displayDur, onDragUpdate]);

    const staffMember = staffList?.find(s => s.id === shift.staffId);
    if (left + width < 0 || left > 100) return null;

    return (
        <div
            ref={blockRef}
            className={`absolute top-1 bottom-1 flex items-center shadow-lg transition-transform duration-200 cursor-pointer overflow-visible z-20 group/block ${isHighlighted ? 'z-50 ring-4 ring-yellow-400 ring-offset-2' : ''} ${!shift.clockOut ? 'animate-pulse' : ''}`}
            style={{
                left: `${Math.max(0, left)}%`,
                width: `${Math.min(100 - left, width)}%`,
                backgroundColor: !shift.clockOut ? '#34C759' : isPersonalReport ? 'var(--brand-500)' : 'var(--color-brand, #007AFF)',
                minWidth: '4px'
            }}
            onMouseEnter={() => {
                const rect = blockRef.current?.getBoundingClientRect();
                if (rect) onHighlightUpdate(rect);
                onFocus(shift.id, rect);
            }}
            onClick={(e) => {
                e.stopPropagation();
                const rect = blockRef.current?.getBoundingClientRect();
                if (rect) onHighlightUpdate(rect);
                onFocus(shift.id, rect);
            }}
        >
            {/* Grab handles for re-timing */}
            {shift.clockOut && (
                <>
                    <div
                        className="absolute -left-1.5 top-0 bottom-0 w-3 cursor-ew-resize hover:bg-white/20 z-30 flex items-center justify-center group-hover/block:opacity-100 opacity-0 transition-opacity"
                        onMouseDown={(e) => handleDragStart(e, 'start')}
                    >
                        <div className="w-1 h-4 bg-white/60 rounded-full" />
                    </div>
                    <div
                        className="absolute -right-1.5 top-0 bottom-0 w-3 cursor-ew-resize hover:bg-white/20 z-30 flex items-center justify-center group-hover/block:opacity-100 opacity-0 transition-opacity"
                        onMouseDown={(e) => handleDragStart(e, 'end')}
                    >
                        <div className="w-1 h-4 bg-white/60 rounded-full" />
                    </div>
                </>
            )}

            <div className="px-2 w-full truncate text-[9px] font-black text-white pointer-events-none drop-shadow-sm uppercase tracking-tighter">
                {shift.clockOut ? `${shift.actualHours?.toFixed(1)}H` : 'ĐANG LÀM'}
                <span className="ml-1 opacity-70">
                    {clockInDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} 
                    - {shift.clockOut ? clockOutDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '...'}
                </span>
            </div>
        </div>
    );
};

// ── Staff Report Modal Component ──
const StaffReportModal = ({ member, staff, shifts, setShifts, schedules, onClose }) => {
    const [period, setPeriod] = useState('7days'); // '7days', 'month', 'custom', 'all'
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const [editingShiftId, setEditingShiftId] = useState(null);
    const [historyShiftId, setHistoryShiftId] = useState(null);
    const [editTempStartTime, setEditTempStartTime] = useState('');
    const [editTempEndTime, setEditTempEndTime] = useState('');
    const [highlightedShiftId, setHighlightedShiftId] = useState(null);
    const [popupData, setPopupData] = useState(null);

    const safeShifts = Array.isArray(shifts) ? shifts : [];

    useEffect(() => {
        const handleEsc = (e) => {
            if ((e.key === 'Escape' || (e.key === 'Backspace' && !isInputFocused()))) onClose();
        };
        window.addEventListener('keydown', handleEsc, { capture: true });
        return () => window.removeEventListener('keydown', handleEsc, { capture: true });
    }, [onClose]);

    // Filter shifts for this member (include ongoing actively running shifts)
    let memberShifts = safeShifts.filter(s => s.staffId === member.id && (s.actualHours > 0 || !s.clockOut));

    const now = new Date();
    memberShifts = memberShifts.map(s => {
        if (!s.clockOut) {
            const tempMins = (now.getTime() - new Date(s.clockIn).getTime()) / 60000;
            return { ...s, actualHours: tempMins / 60, isOngoing: true };
        }
        return s;
    });

    if (period === '7days') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        memberShifts = memberShifts.filter(s => new Date(s.clockIn) >= weekAgo);
    } else if (period === 'month') {
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        memberShifts = memberShifts.filter(s => new Date(s.clockIn) >= monthAgo);
    } else if (period === 'custom' && customStartDate && customEndDate) {
        const start = new Date(customStartDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(customEndDate);
        end.setHours(23, 59, 59, 999);
        memberShifts = memberShifts.filter(s => {
            const shiftDate = new Date(s.clockIn);
            return shiftDate >= start && shiftDate <= end;
        });
    }

    memberShifts.sort((a, b) => new Date(b.clockIn) - new Date(a.clockIn));

    const shiftsByDate = {};
    const totalHoursPeriod = memberShifts.reduce((sum, s) => sum + (s.actualHours || 0), 0);

    memberShifts.forEach(shift => {
        const d = new Date(shift.clockIn);
        const dateKey = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!shiftsByDate[dateKey]) {
            shiftsByDate[dateKey] = { dateObj: d, shifts: [], total: 0 };
        }
        shiftsByDate[dateKey].shifts.push(shift);
        shiftsByDate[dateKey].total += shift.actualHours || 0;
    });

    const sortedDates = Object.entries(shiftsByDate).sort((a, b) => a[1].dateObj - b[1].dateObj);

    const filterStartTime = localStorage.getItem('cafe-op-start') || '06:00';
    const filterEndTime = localStorage.getItem('cafe-op-end') || '22:00';
    const timeStrToMin = (timeStr) => {
        if (!timeStr) return 0;
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + (m || 0);
    };

    let baseStartMin = timeStrToMin(filterStartTime);
    let baseEndMin = timeStrToMin(filterEndTime);
    let displayStartMin = Math.max(0, baseStartMin - 60);
    let displayEndMin = Math.min(24 * 60, baseEndMin + 60);
    if (displayEndMin <= displayStartMin) displayEndMin = displayStartMin + 60;
    const displayDur = displayEndMin - displayStartMin;

    const firstTickH = Math.floor(displayStartMin / 60);
    const lastTickH = Math.ceil(displayEndMin / 60);
    const timelineHours = [];
    for (let h = firstTickH; h <= lastTickH; h += 2) {
        timelineHours.push(h);
    }

    const hourlyRate = parseFloat(member.hourlyRate) || 0;
    const totalSalary = totalHoursPeriod * hourlyRate;

    const handleUpdateShift = async (shiftId) => {
        try {
            const shiftToEdit = memberShifts.find(s => s.id === shiftId);
            if (!shiftToEdit || !shiftToEdit.clockIn || !shiftToEdit.clockOut) return;

            const clockInDate = new Date(shiftToEdit.clockIn);
            const clockOutDate = new Date(shiftToEdit.clockIn);

            const [startHour, startMinute] = editTempStartTime.split(':').map(Number);
            const [endHour, endMinute] = editTempEndTime.split(':').map(Number);

            if (isNaN(startHour) || isNaN(startMinute) || isNaN(endHour) || isNaN(endMinute)) {
                alert('Thời gian không hợp lệ');
                return;
            }

            clockInDate.setHours(startHour, startMinute, 0, 0);
            clockOutDate.setHours(endHour, endMinute, 0, 0);

            if (clockOutDate <= clockInDate) {
                clockOutDate.setDate(clockOutDate.getDate() + 1);
            }

            const durationMs = clockOutDate.getTime() - clockInDate.getTime();
            const newHours = durationMs / (1000 * 60 * 60);

            if (newHours <= 0) {
                alert('Thời gian kết thúc phải sau thời gian bắt đầu (sau khi tính qua ngày).');
                return;
            }

            const updatedData = {
                clockIn: clockInDate.toISOString(),
                clockOut: clockOutDate.toISOString(),
                actualHours: newHours
            };

            const res = await fetch(`${SERVER_URL}/api/shifts/${shiftId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedData)
            });
            const data = await res.json();
            if (data.success) {
                if (typeof setShifts === 'function') {
                    setShifts(prev => prev.map(s => s.id === shiftId ? { ...s, ...updatedData, totalPay: Math.round(newHours * (s.hourlyRate || 0)) } : s));
                }
                setEditingShiftId(null);
            } else {
                alert('Lỗi khi cập nhật ca làm.');
            }
        } catch (error) {
            console.error('Failed to update shift', error);
            alert('Không thể kết nối máy chủ.');
        }
    };

    const handleDragUpdateShift = async (shiftId, newInDate, newOutDate) => {
        try {
            const shiftToEdit = memberShifts.find(s => s.id === shiftId);
            if (!shiftToEdit) return;

            const durationMs = newOutDate.getTime() - newInDate.getTime();
            const newHours = durationMs / (1000 * 60 * 60);

            if (newHours <= 0) {
                alert('Thời gian kết thúc phải sau thời gian bắt đầu (sau khi tính qua ngày).');
                return;
            }

            const updatedData = {
                clockIn: newInDate.toISOString(),
                clockOut: newOutDate.toISOString(),
                actualHours: newHours
            };

            const res = await fetch(`${SERVER_URL}/api/shifts/${shiftId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedData)
            });
            const data = await res.json();
            if (data.success) {
                if (typeof setShifts === 'function') {
                    setShifts(prev => prev.map(s => s.id === shiftId ? { ...s, ...updatedData, totalPay: Math.round(newHours * (s.hourlyRate || 0)) } : s));
                }
            } else {
                alert('Lỗi khi cập nhật ca làm.');
            }
        } catch (error) {
            console.error('Failed to drag update shift', error);
            alert('Không thể kết nối máy chủ.');
        }
    };

    const handleRestoreShift = async (shiftId, record) => {
        if (!confirm('Bạn có chắc chắn muốn phục hồi ca làm việc về phiên bản này?')) return;

        try {
            const shiftToEdit = memberShifts.find(s => s.id === shiftId);
            if (!shiftToEdit) return;

            const updatedData = {
                clockIn: record.previousClockIn,
                clockOut: record.previousClockOut,
                actualHours: record.previousHours
            };

            const res = await fetch(`${SERVER_URL}/api/shifts/${shiftId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedData)
            });
            const data = await res.json();
            if (data.success) {
                if (typeof setShifts === 'function') {
                    setShifts(prev => prev.map(s => s.id === shiftId ? data.shift : s));
                }
                setHistoryShiftId(null);
            } else {
                alert('Lỗi khi phục hồi ca làm.');
            }
        } catch (error) {
            console.error('Failed to restore shift', error);
            alert('Không thể kết nối máy chủ.');
        }
    };

    return (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-6 bg-gray-100/90">
            {historyShiftId && (
                <ShiftHistoryModal
                    shift={memberShifts.find(s => s.id === historyShiftId)}
                    onClose={() => setHistoryShiftId(null)}
                    onRestore={handleRestoreShift}
                />
            )}
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="bg-white w-full max-w-5xl max-h-[95vh] flex flex-col shadow-2xl overflow-hidden border border-gray-200" style={{ borderRadius: 'var(--radius-modal)' }}>
                <div className="border-b border-gray-100 bg-gray-50 flex justify-between items-start gap-2 z-10 flex-shrink-0" style={{ padding: 'clamp(10px, 3vw, 20px) clamp(12px, 3vw, 24px)' }}>
                    <div className="flex items-center gap-2 md:gap-4 min-w-0">
                        <div className="w-9 h-9 md:w-12 md:h-12 shrink-0 bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center font-black text-sm md:text-xl text-white shadow-inner" style={{ borderRadius: 'var(--radius-card)' }}>
                            {member.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-sm md:text-2xl font-black text-gray-900 uppercase tracking-wide md:tracking-widest leading-tight">
                                <span className="md:hidden">BÁO CÁO: {member.name}</span>
                                <span className="hidden md:inline">BÁO CÁO GIờ LÀM: {member.name}</span>
                            </h3>
                            <p className="text-[10px] md:text-sm text-gray-500 font-medium mt-0.5 flex flex-wrap gap-x-2">
                                <span>VAI TRÒ: <span className="text-brand-600 font-bold uppercase">{member.role}</span></span>
                                <span className="md:before:content-['|'] md:before:mx-1 md:before:text-gray-300">TỔNG GIờ LÀM: <span className="text-brand-600 font-black">{totalHoursPeriod.toFixed(1)}H</span></span>
                                {hourlyRate > 0 && <span className="text-green-700 font-black md:before:content-['|'] md:before:mx-1 md:before:text-gray-300">MỨC LƯƠNG: {formatVND(hourlyRate)}/h | TỔNG LƯƠNG: {formatVND(totalSalary)}</span>}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 text-gray-500 transition-all shrink-0" style={{ borderRadius: 'var(--radius-badge)', minHeight: '44px', minWidth: '44px' }}><X size={20} /></button>
                </div>

                <div className="flex-1 overflow-y-auto w-full space-y-3 bg-gray-50/50 flex flex-col" style={{ padding: 'clamp(10px, 3vw, 20px) clamp(12px, 3vw, 24px)' }}>
                    <div className="flex flex-wrap gap-1.5 md:gap-3 items-center">
                        <div className="flex gap-1 md:gap-2">
                            <button onClick={() => setPeriod('7days')} style={{ borderRadius: 'var(--radius-badge)', minHeight: '44px' }} className={`px-3 md:px-6 py-1.5 md:py-3 font-black text-[10px] md:text-sm tracking-widest border transition-all uppercase ${period === '7days' ? 'bg-brand-50 text-brand-600 border-brand-200 shadow-md' : 'text-gray-400 border-gray-100 hover:bg-gray-50 bg-white'}`}>7 NGÀY</button>
                            <button onClick={() => setPeriod('month')} style={{ borderRadius: 'var(--radius-badge)', minHeight: '44px' }} className={`px-3 md:px-6 py-1.5 md:py-3 font-black text-[10px] md:text-sm tracking-widest border transition-all uppercase ${period === 'month' ? 'bg-brand-50 text-brand-600 border-brand-200 shadow-md' : 'text-gray-400 border-gray-100 hover:bg-gray-50 bg-white'}`}>30 NGÀY</button>
                            <button onClick={() => setPeriod('custom')} style={{ borderRadius: 'var(--radius-badge)', minHeight: '44px' }} className={`px-3 md:px-6 py-1.5 md:py-3 font-black text-[10px] md:text-sm tracking-widest border transition-all uppercase ${period === 'custom' ? 'bg-brand-50 text-brand-600 border-brand-200 shadow-md' : 'text-gray-400 border-gray-100 hover:bg-gray-50 bg-white'}`}>TÙY CHỌN</button>
                            <button onClick={() => setPeriod('all')} style={{ borderRadius: 'var(--radius-badge)', minHeight: '44px' }} className={`px-3 md:px-6 py-1.5 md:py-3 font-black text-[10px] md:text-sm tracking-widest border transition-all uppercase ${period === 'all' ? 'bg-brand-50 text-brand-600 border-brand-200 shadow-md' : 'text-gray-400 border-gray-100 hover:bg-gray-50 bg-white'}`}>TẤT CẢ</button>
                        </div>
                        {period === 'custom' && (
                            <div className="flex items-center gap-2 bg-white px-3 py-1.5 border border-gray-200 text-sm" style={{ borderRadius: 'var(--radius-badge)' }}>
                                <span className="font-bold text-gray-400">Từ</span>
                                <input type="date" className="outline-none font-bold text-gray-700" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} />
                                <span className="font-bold text-gray-400 ml-2">Đến</span>
                                <input type="date" className="outline-none font-bold text-gray-700" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} />
                            </div>
                        )}
                    </div>

                    <div className="bg-white border border-gray-200 shadow-sm overflow-hidden flex flex-col w-full" style={{ borderRadius: 'var(--radius-card)' }}>
                        <div className="bg-gray-50 px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                            <Clock size={16} className="text-brand-500" />
                            <h4 className="font-black text-sm text-gray-800 tracking-wider uppercase">BIỂU ĐỒ THỜI GIAN ({Math.round(displayDur / 60)}H)</h4>
                        </div>
                        <div className="overflow-x-auto w-full" style={{ padding: '16px 20px' }}>
                            <div className="min-w-[700px] w-full">
                                <div className="flex ml-20 mb-2 relative h-4 text-[10px] font-black text-gray-400">
                                    {timelineHours.map((h) => (
                                        <div key={h} className="absolute -translate-x-1/2 flex flex-col items-center" style={{ left: `${((h * 60 - displayStartMin) / displayDur) * 100}%` }}>
                                            <span>{h}h</span>
                                            <div className="w-px h-2 bg-gray-200 mt-1" />
                                        </div>
                                    ))}
                                </div>
                                <div className="space-y-3 relative pb-4">
                                    <div className="absolute inset-y-0 left-20 right-0 pointer-events-none">
                                        {timelineHours.map((h) => (
                                            <div key={h} className="absolute top-0 bottom-0 w-px bg-gray-100" style={{ left: `${((h * 60 - displayStartMin) / displayDur) * 100}%` }} />
                                        ))}
                                    </div>
                                    {sortedDates.map(([dateKey, data]) => (
                                        <div key={dateKey} className="flex items-center gap-4 relative z-10 hover:bg-gray-50/50 transition-colors w-full" style={{ borderRadius: 'var(--radius-badge)', padding: '4px 8px' }}>
                                            <div className="w-16 flex-shrink-0 text-right">
                                                <span className="text-xs font-black text-gray-700">{dateKey}</span>
                                                <p className="text-[9px] text-gray-400 font-bold">{data.total.toFixed(1)}h</p>
                                            </div>
                                            <div
                                                className="flex-1 h-12 bg-gray-100/50 relative ring-1 ring-inset ring-gray-200 w-full min-w-0 overflow-hidden"
                                                style={{ borderRadius: 'var(--radius-badge)', margin: '0 4px' }}
                                                onClick={() => setHighlightedShiftId(null)}
                                            >
                                                {data.shifts.map((shift) => {
                                                    const sched = schedules?.find(sc => sc.id === shift.scheduleId);
                                                    const isHighlighted = shift.id === highlightedShiftId;
                                                    const performQuickEdit = () => {
                                                        setEditingShiftId(shift.id);
                                                        setEditTempStartTime(formatTime(shift.clockIn));
                                                        if (shift.clockOut) setEditTempEndTime(formatTime(shift.clockOut));
                                                        setHighlightedShiftId(null);
                                                        setTimeout(() => {
                                                            const el = document.getElementById(`shift-row-${shift.id}`);
                                                            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                        }, 50);
                                                    };
                                                    return (
                                                        <InteractiveShiftBlock
                                                            key={shift.id}
                                                            shift={shift}
                                                            sched={sched}
                                                            staffList={staff}
                                                            displayStartMin={displayStartMin}
                                                            displayDur={displayDur}
                                                            isHighlighted={isHighlighted}
                                                            isPersonalReport={true}
                                                            onFocus={(sid) => setHighlightedShiftId(sid)}
                                                            onHighlightUpdate={(rect) => {
                                                                setPopupData({
                                                                    shift,
                                                                    rect,
                                                                    onQuickEdit: performQuickEdit,
                                                                    onBlur: () => { setHighlightedShiftId(null); setPopupData(null); }
                                                                });
                                                            }}
                                                            onBlur={() => { setHighlightedShiftId(null); setPopupData(null); }}
                                                            onDragUpdate={handleDragUpdateShift}
                                                            onQuickEdit={performQuickEdit}
                                                        />
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                    {sortedDates.length === 0 && (
                                        <div className="text-center py-8 text-gray-400 font-bold text-sm italic border-2 border-dashed border-gray-100 ml-20 bg-white" style={{ borderRadius: 'var(--radius-badge)' }}>Không có ca làm việc nào trong khoảng thời gian này.</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white border border-gray-200 shadow-sm overflow-hidden flex-1 flex flex-col min-h-[300px] w-full" style={{ borderRadius: 'var(--radius-card)' }}>
                        <div className="bg-gray-50 px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <ListOrdered size={16} className="text-brand-500" />
                                <h4 className="font-black text-sm text-gray-800 tracking-wider uppercase">NHẬT KÝ VÀO/RA CA CHI TIẾT</h4>
                            </div>
                            <span className="text-[10px] font-black text-gray-400 tracking-widest bg-white border border-gray-200 px-4 py-1.5 uppercase" style={{ borderRadius: 'var(--radius-modal)' }}>{memberShifts.length} lượt</span>
                        </div>
                        <div className="overflow-x-auto w-full">
                            <table className="w-full text-left bg-white" style={{ minWidth: '420px' }}>
                                <thead>
                                    <tr className="border-b border-gray-200 bg-gray-50/30">
                                        <th style={{ padding: '8px 12px' }} className="text-[9px] md:text-[10px] font-bold text-gray-400 tracking-widest w-[22%] uppercase">ngày</th>
                                        <th style={{ padding: '8px 12px' }} className="text-[9px] md:text-[10px] font-bold text-gray-400 tracking-widest w-[22%] uppercase">vào ca</th>
                                        <th style={{ padding: '8px 12px' }} className="text-[9px] md:text-[10px] font-bold text-gray-400 tracking-widest w-[22%] uppercase">kết thúc</th>
                                        <th style={{ padding: '8px 10px' }} className="text-[9px] md:text-[10px] font-bold text-brand-600 tracking-widest text-right w-[17%] uppercase">giờ làm</th>
                                        <th style={{ padding: '8px 12px' }} className="text-[9px] md:text-[10px] font-bold text-gray-400 tracking-widest text-center w-[17%] uppercase">thao tác</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {memberShifts.map(s => {
                                        const date = new Date(s.clockIn);
                                        const isEditing = editingShiftId === s.id;
                                        const isRowHighlighted = highlightedShiftId === s.id;
                                        return (
                                            <tr
                                                key={s.id}
                                                id={`shift-row-${s.id}`}
                                                onClick={() => setHighlightedShiftId(s.id)}
                                                className={`transition-colors w-full cursor-pointer ${isEditing ? 'bg-brand-50/30' : isRowHighlighted ? 'bg-yellow-50 shadow-inner' : 'hover:bg-gray-50/50'}`}
                                            >
                                                <td style={{ padding: '14px 20px' }}>
                                                    <div className="flex flex-col items-start gap-1">
                                                        <span className={`${isRowHighlighted ? 'font-black text-yellow-700' : 'font-medium text-gray-700'}`}>{date.toLocaleDateString('vi-VN')}</span>
                                                        {s.status === 'LATE' && <span className="text-[9px] font-medium text-red-500 bg-red-50 px-2 py-0.5 border border-red-100 flex items-center gap-1 w-fit shadow-sm uppercase tracking-tighter" style={{ borderRadius: 'var(--radius-badge)' }}><AlertTriangle size={10} /> đi trễ</span>}
                                                        {s.status === 'UNSCHEDULED' && <span className="text-[9px] font-medium text-amber-500 bg-amber-50 px-2 py-0.5 border border-amber-100 flex items-center gap-1 w-fit shadow-sm uppercase tracking-tighter" style={{ borderRadius: 'var(--radius-badge)' }}><AlertTriangle size={10} /> sai ca</span>}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '8px 12px' }} className="font-medium text-green-600 bg-green-50/20 text-[11px]">
                                                    {isEditing ? (
                                                        <input
                                                            type="time"
                                                            className="w-full bg-white border border-green-300 p-1 text-center font-bold text-green-700 outline-none" style={{ borderRadius: 'var(--radius-badge)' }}
                                                            value={editTempStartTime}
                                                            onChange={e => setEditTempStartTime(e.target.value)}
                                                            autoFocus
                                                        />
                                                    ) : (
                                                        date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                                                    )}
                                                </td>
                                                <td style={{ padding: '8px 12px' }} className="font-medium text-amber-600 bg-amber-50/20 text-[11px]">
                                                    {isEditing ? (
                                                        <input
                                                            type="time"
                                                            className="w-full bg-white border border-amber-300 p-1 text-center font-bold text-amber-700 outline-none" style={{ borderRadius: 'var(--radius-badge)' }}
                                                            value={editTempEndTime}
                                                            onChange={e => setEditTempEndTime(e.target.value)}
                                                        />
                                                    ) : (
                                                        s.clockOut ? formatTime(s.clockOut) : 'Đang làm...'
                                                    )}
                                                </td>
                                                <td style={{ padding: '8px 10px' }} className="text-right bg-brand-50/20 font-bold text-brand-600 text-[11px]">
                                                    {s.actualHours?.toFixed(2) || '0.00'}h
                                                </td>
                                                <td style={{ padding: '14px 20px' }} className="text-center">
                                                    {isEditing ? (
                                                        <div className="flex items-center justify-center gap-2">
                                                            <button onClick={() => handleUpdateShift(s.id)} className="p-1.5 bg-brand-500 text-white" style={{ borderRadius: 'var(--radius-badge)', minHeight: '36px', minWidth: '36px' }}><Save size={16} /></button>
                                                            <button onClick={() => setEditingShiftId(null)} className="p-1.5 bg-gray-200 text-gray-700" style={{ borderRadius: 'var(--radius-badge)', minHeight: '36px', minWidth: '36px' }}><X size={16} /></button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center justify-center gap-2">
                                                            <button
                                                                disabled={!s.clockOut}
                                                                onClick={() => {
                                                                    setEditingShiftId(s.id);
                                                                    setEditTempStartTime(formatTime(s.clockIn));
                                                                    setEditTempEndTime(formatTime(s.clockOut));
                                                                }}
                                                                className={`p-1.5 ${!s.clockOut ? 'text-gray-300' : 'text-gray-400 hover:text-brand-600'}`}
                                                            >
                                                                <Edit2 size={16} />
                                                            </button>
                                                            {s.editHistory && s.editHistory.length > 0 && (
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); setHistoryShiftId(s.id); }}
                                                                    className="p-1.5 text-brand-500"
                                                                >
                                                                    <RotateCcw size={16} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </motion.div>

            {popupData && popupData.shift.id === highlightedShiftId && (
                <div
                    className="fixed z-[1000] bg-white shadow-2xl min-w-[240px] flex flex-col gap-2"
                    style={{
                        borderRadius: 'var(--radius-card)',
                        padding: '16px',
                        left: `${popupData.rect.left + popupData.rect.width / 2}px`,
                        top: `${popupData.rect.top - 12}px`,
                        transform: 'translate(-50%, -100%)'
                    }}
                >
                    <div className="absolute top-[99%] left-1/2 -translate-x-1/2 w-0 h-0 border-x-[12px] border-x-transparent border-t-[12px] border-t-white" />
                    <div className="text-xs font-black text-gray-800 text-center border-b border-gray-100 pb-2 uppercase tracking-wider">Chi Tiết Ca Làm</div>
                    <div className="flex justify-between items-center text-xs mt-1 uppercase">
                        <span className="text-gray-500 font-bold">GIỜ VÀO:</span>
                        <span className="font-bold text-green-600 bg-green-50 px-2 py-0.5">{formatTime(popupData.shift.clockIn)}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs uppercase">
                        <span className="text-gray-500 font-bold">GIỜ RA:</span>
                        <span className="font-bold text-amber-600 bg-amber-50 px-2 py-0.5">{popupData.shift.clockOut ? formatTime(popupData.shift.clockOut) : 'ĐANG LÀM'}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs border-t border-dashed border-gray-200 pt-2 mt-1 uppercase">
                        <span className="text-gray-500 font-bold tracking-wider text-[10px]">THỜI LƯỢNG:</span>
                        <span className="font-bold text-brand-600 text-base">{popupData.shift.actualHours?.toFixed(2)}H</span>
                    </div>
                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
                        <button onClick={popupData.onQuickEdit} className="flex-1 py-3 bg-brand-50 text-brand-600 text-[10px] font-black uppercase" style={{ borderRadius: 'var(--radius-badge)', minHeight: '40px' }}>SỬA NHANH</button>
                        <button onClick={popupData.onBlur} className="flex-1 py-3 bg-gray-100 text-gray-600 text-[10px] font-black uppercase" style={{ borderRadius: 'var(--radius-badge)', minHeight: '40px' }}>ĐÓNG</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StaffReportModal;
