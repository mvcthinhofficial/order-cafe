import React, { useState, useMemo, useEffect, useRef } from 'react';
import { formatTime, formatDate, formatDateTime, getDateStr } from '../utils/timeUtils';
import { SERVER_URL } from '../api';
import { Calendar as CalendarIcon, Clock, Users, ArrowLeft, ArrowRight, Save, LayoutGrid, List, AlertTriangle, X, Eraser, ChevronDown, Trash2, BarChart3 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f43f5e', '#6366f1', '#64748b', '#06b6d4'];

const globalSnapMin = (min) => Math.max(0, Math.min(1440 - 15, Math.round(min / 15) * 15)); // snap to 15m, max 23:45 
const minToTimeStr = (m) => {
    let hrs = Math.floor(m / 60);
    let mins = m % 60;
    if (hrs > 23) { hrs = 23; mins = 59; }
    return `${String(hrs).padStart(2,'0')}:${String(mins).padStart(2,'0')}`;
};
const timeStrToMin = (str) => {
    if(!str) return 0;
    const [h,m] = str.split(':').map(Number);
    return h*60 + m;
};
const formatVND = (price) => {
    const num = parseFloat(price);
    if (isNaN(num)) return '0 ₫';
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num * 1000) + 'đ';
};

const SchedulesView = ({ staff, roles, schedules, setSchedules: _setSchedules, shifts, refreshData }) => {
    // [SANITY CHECK] Wrapper để lọc trùng ID hoặc trùng (templateId + date)
    const setSchedules = (list) => {
        if (typeof list === 'function') {
            _setSchedules(prev => {
                const updated = list(prev);
                return sanitize(updated);
            });
        } else {
            _setSchedules(sanitize(list));
        }
    };

    const sanitize = (list) => {
        const seen = new Set();
        return list.filter(item => {
            if (seen.has(item.id)) return false;
            seen.add(item.id);
            if (item.templateId) {
                const key = `${item.templateId}-${item.date}`;
                if (seen.has(key)) return false;
                seen.add(key);
            }
            return true;
        });
    };

    const [viewMode, setViewMode] = useState('day'); 
    const [currentDate, setCurrentDate] = useState(new Date());
    const gridRef = useRef(null);
    const [filterStartTime, setFilterStartTime] = useState(() => localStorage.getItem('cafe-op-start') || '06:00');
    const [filterEndTime, setFilterEndTime] = useState(() => localStorage.getItem('cafe-op-end') || '22:00');
    const [selectedStaffId, setSelectedStaffId] = useState(null);
    const [expandedShiftIds, setExpandedShiftIds] = useState([]); 
    const [isCleanupModalOpen, setIsCleanupModalOpen] = useState(false);
    useEffect(() => {
        localStorage.setItem('cafe-op-start', filterStartTime);
        localStorage.setItem('cafe-op-end', filterEndTime);
    }, [filterStartTime, filterEndTime]);

    const opStartMin = filterStartTime ? timeStrToMin(filterStartTime) : 0;
    const opEndMin = filterEndTime ? timeStrToMin(filterEndTime) : 1440;

    const displayStartMin = Math.max(0, opStartMin - 60);
    const displayEndMin = Math.min(1440, opEndMin + 60);

    const displayDur = displayEndMin - displayStartMin;
    const minToPercent = (startM) => `${Math.max(0, Math.min(100, ((startM - displayStartMin) / displayDur) * 100))}%`;
    const minDurationToPercent = (sM, eM) => `${Math.max(0, Math.min(100, ((eM - sM) / displayDur) * 100))}%`;

    const timelineTicks = [];
    const firstTick = Math.ceil(displayStartMin / 30) * 30;
    const lastTick = Math.floor(displayEndMin / 30) * 30;
    for (let m = firstTick; m <= lastTick; m += 30) { timelineTicks.push(m); }

    const safeStartMin = displayStartMin;
    const safeEndMin = displayEndMin;

    useEffect(() => {
        const outOfBounds = schedules.filter(s => {
            const sm = timeStrToMin(s.startTime);
            const em = timeStrToMin(s.endTime);
            return sm < safeStartMin || em > safeEndMin;
        });

        if (outOfBounds.length > 0) {
            const updated = outOfBounds.map(s => {
                let sm = timeStrToMin(s.startTime);
                let em = timeStrToMin(s.endTime);
                if (sm < safeStartMin) sm = safeStartMin;
                if (em > safeEndMin) em = safeEndMin;
                if (em - sm < 30) em = sm + 30;
                if (em > 1440) { em = 1440; sm = em - 30; }
                return { ...s, startTime: minToTimeStr(sm), endTime: minToTimeStr(em) };
            });
            fetch(`${SERVER_URL}/api/schedules`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated)
            }).then(() => refreshData());
        }
    }, [filterStartTime, filterEndTime]);

    const getStartOfWeek = (d) => {
        const date = new Date(d);
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(date.setDate(diff));
    };

    const weekDays = useMemo(() => Array.from({ length: 7 }).map((_, i) => {
        const d = new Date(getStartOfWeek(currentDate)); d.setDate(d.getDate() + i); return d;
    }), [currentDate]);

    const todayStr = getDateStr(); // GMT+7 chuẩn mốc "Hôm nay"
    const dayDateString = getDateStr(currentDate);
    const isPastDay = dayDateString < todayStr; // Kiểm tra nếu ngày đang xem là quá khứ

    const endOfMonthObj = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    const endOfMonthStr = getDateStr(endOfMonthObj); // Ngày cuối cùng của tháng đang xem
    const todaySchedules = schedules.filter(s => s.date === dayDateString);

    const handleSelectiveCleanup = async (type) => {
        let start, end, onlyEmpty = false, label = "";
        
        if (type === 'empty') {
            start = todayStr;
            end = '2030-12-31'; // Dọn dẹp tương lai xa
            onlyEmpty = true;
            label = "XÓA CA TRỐNG (TƯƠNG LAI)";
        } else if (type === 'day') {
            start = dayDateString;
            end = dayDateString;
            label = `XÓA TOÀN BỘ CA NGÀY ${dayDateString}`;
        } else if (type === 'week') {
            const s = getDateStr(weekDays[0]);
            const e = getDateStr(weekDays[6]);
            start = s;
            end = e;
            label = `XÓA TOÀN BỘ CA TUẦN (${s} -> ${e})`;
        } else if (type === 'month') {
            const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
            const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
            start = getDateStr(firstDay);
            end = getDateStr(lastDay);
            label = `XÓA TOÀN BỘ CA THÁNG ${currentDate.getMonth() + 1}/${currentDate.getFullYear()}`;
        }

        // BẢO VỆ QUÁ KHỨ: Luôn bắt đầu từ MIN(Calculated, Today)
        if (start < todayStr) start = todayStr;
        
        if (start > end) {
            alert("Không có dữ liệu hợp lệ để dọn dẹp (Dữ liệu quá khứ được bảo vệ).");
            return;
        }

        if (!confirm(`HỆ THỐNG DỌN DẸP:\n\nBạn muốn thực hiện: ${label}?\n\nLưu ý: Chỉ áp dụng từ hôm nay (${todayStr}) trở đi. Bạn có chắc chắn không?`)) return;

        try {
            const res = await fetch(`${SERVER_URL}/api/schedules-cleanup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ startDate: start, endDate: end, onlyEmpty })
            });
            const data = await res.json();
            if (data.success) {
                refreshData();
                setIsCleanupModalOpen(false);
            }
        } catch (e) { alert('Lỗi khi dọn dẹp dữ liệu'); }
    };


    const handlePrev = () => { const d = new Date(currentDate); d.setDate(d.getDate() - (viewMode === 'week' ? 7 : 1)); setCurrentDate(d); };
    const handleNext = () => { const d = new Date(currentDate); d.setDate(d.getDate() + (viewMode === 'week' ? 7 : 1)); setCurrentDate(d); };
    
    // === FIX 5: Dọn data cũ: Merge các row có nhiều hơn 1 ca thành 1 ca dài duy nhất ===
    useEffect(() => {
        const grouped = {};
        schedules.forEach(s => {
            const key = `${s.date}-${s.rowIdx ?? 0}`;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(s);
        });
        const toDelete = [];
        const toUpdate = [];
        Object.values(grouped).forEach(group => {
            if (group.length > 1) {
                const sorted = group.sort((a, b) => timeStrToMin(a.startTime) - timeStrToMin(b.startTime));
                const merged = { ...sorted[0] };
                merged.startTime = sorted[0].startTime;
                merged.endTime = sorted.reduce((max, s) => timeStrToMin(s.endTime) > timeStrToMin(max) ? s.endTime : max, sorted[0].endTime);
                merged.staffIds = [...new Set(sorted.flatMap(s => s.staffIds || []))];
                toUpdate.push(merged);
                sorted.slice(1).forEach(s => toDelete.push(s.id));
            }
        });
        if (toUpdate.length > 0 || toDelete.length > 0) {
            const doClean = async () => {
                if (toUpdate.length > 0) {
                    await fetch(`${SERVER_URL}/api/schedules`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(toUpdate) });
                }
                for (const id of toDelete) {
                    await fetch(`${SERVER_URL}/api/schedules/${id}`, { method: 'DELETE' }).catch(() => {});
                }
                refreshData();
            };
            doClean();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Chỉ chạy 1 lần khi mount để dọn data cũ

    // --- LOGIC TỔNG HỢP THÁNG (MONTHLY CONTEXT) ---
    const monthlyStats = useMemo(() => {
        const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const lastDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
        const startStr = getDateStr(firstDayOfMonth);
        const endStr = getDateStr(lastDayOfMonth);

        // Lọc tất cả ca trong tháng này từ Database (đã có sẵn trong prop schedules)
        const monthSchedules = (schedules || []).filter(s => s.date >= startStr && s.date <= endStr);
        
        const stats = {};
        (staff || []).forEach(st => {
            const roleObj = (roles || []).find(r => r.id === st.roleId);
            stats[st.id] = {
                id: st.id,
                name: st.name,
                role: roleObj?.name || 'Nhân viên',
                hourlyRate: parseFloat(st.hourlyRate) || 0,
                monthlyLimit: parseFloat(st.monthlyLimit) || 200,
                pastHours: 0,
                futureHours: 0,
                pastSalary: 0,
                futureSalary: 0,
                totalHours: 0
            };
        });

        monthSchedules.forEach(s => {
            const sM = timeStrToMin(s.startTime);
            const eM = timeStrToMin(s.endTime);
            const hours = (eM - sM) / 60;
            const isPast = s.date < todayStr;
            
            (s.staffIds || []).forEach(sid => {
                if (stats[sid]) {
                    if (isPast) {
                        stats[sid].pastHours += hours;
                        stats[sid].pastSalary += hours * stats[sid].hourlyRate;
                    } else {
                        stats[sid].futureHours += hours;
                        stats[sid].futureSalary += hours * stats[sid].hourlyRate;
                    }
                    stats[sid].totalHours += hours;
                }
            });
        });

        return Object.values(stats);
    }, [schedules, staff, currentDate, roles, todayStr]);



    const syncScheduleToDB = async (sched, sourceList = schedules, isStructural = false) => {
        try {
            // === PHỤC HỒI ĐỒNG BỘ: FORWARD OVERWRITE (DATA THẬT) ===
            const targetDate = sched.date;
            const tplId = sched.templateId;
            const limitDate = endOfMonthStr; 

            // Chỉ rải ca (Forward Sync) nếu có sự thay đổi về Cấu trúc (Giờ, Trạng thái Cố định)
            if (isStructural && sched.isFixed && tplId) {
                // 1. [QUÉT SẠCH TƯƠNG LAI]
                const toDelete = (sourceList || []).filter(s => s.templateId === tplId && s.date >= targetDate && s.date <= limitDate);
                if (toDelete.length > 0) {
                    await Promise.all(toDelete.map(d => fetch(`${SERVER_URL}/api/schedules/${d.id}`, { method: 'DELETE' })));
                }

                // 2. [GHI ĐÈ DATA THẬT] - Sinh chuỗi bản ghi thực sự
                const newList = [];
                let idx = 0;
                const startDate = new Date(targetDate);
                const endDate = new Date(limitDate);

                for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const ds = getDateStr(d);
                    // BẢO TOÀN NHÂN VIÊN: Tìm xem ngày này đã có bản ghi nào chưa để giữ lại staffIds
                    const existing = (sourceList || []).find(s => s.templateId === tplId && s.date === ds);
                    
                    newList.push({
                        id: (ds === targetDate) ? sched.id : (existing?.id || `sc-${Date.now()}-${idx++}-${Math.random().toString(36).substr(2, 5)}`),
                        date: ds,
                        startTime: sched.startTime,
                        endTime: sched.endTime,
                        rowIdx: sched.rowIdx,
                        isFixed: true,
                        templateId: tplId,
                        staffIds: (ds === targetDate) ? (sched.staffIds || []) : (existing?.staffIds || []),
                        color: sched.color,
                        name: sched.name
                    });
                }

                await fetch(`${SERVER_URL}/api/schedules`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newList)
                });

            } else if (isStructural && !sched.isFixed && tplId) {
                // TẮT CỐ ĐỊNH: Xóa sạch từ Day T -> Forward
                const toDelete = (sourceList || []).filter(s => s.templateId === tplId && s.date >= targetDate && s.date <= limitDate);
                await Promise.all(toDelete.map(d => fetch(`${SERVER_URL}/api/schedules/${d.id}`, { method: 'DELETE' })));
            } else {
                // CẬP NHẬT ĐƠN LẺ: (Gồm thêm nhân viên, đổi màu, hoặc ca không cố định)
                // Backend sẽ tự xử lý Siêu gộp theo (templateId/rowIdx + date)
                await fetch(`${SERVER_URL}/api/schedules`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify([sched])
                });
            }
            
            refreshData();
        } catch(e) { console.error('Lỗi sync ca', e); }
    };

    const deleteSchedule = async (id, force = false) => {
        const sched = schedules.find(s => s.id === id);
        if (!sched) return;

        const hasStaff = (sched.staffIds || []).length > 0;
        
        if (!force && hasStaff) {
            if(!confirm('Ca này đã có nhân viên. Bạn có chắc chắn muốn xóa?')) return;
        }

        try {
            // === PHỤC HỒI XÓA DÂY CHUYỀN ===
            const tplId = sched.templateId;
            const targetDate = sched.date;

            let toDeleteIds = [id];
            if (tplId) {
                const forwardSchedules = schedules.filter(s => s.templateId === tplId && s.date >= targetDate && s.date <= endOfMonthStr);
                toDeleteIds = forwardSchedules.map(s => s.id);
            }

            await Promise.all(toDeleteIds.map(delId => fetch(`${SERVER_URL}/api/schedules/${delId}`, { method: 'DELETE' })));
            refreshData(); 
        } catch(e) { console.error('Lỗi khi xóa ca:', e); }

    };

    const [dragState, setDragState] = useState({ active: false, mode: null, rowIdx: null, id: null, startMin: 0, currentMin: 0, initialStartMin: 0, initialEndMin: 0, resizeEdge: null });
    const [selectedShiftId, setSelectedShiftId] = useState(null);

    const handleInputStartGrid = (e, rowIdx) => {
        if (isPastDay) return; // KHÓA QUÁ KHỨ
        if(e.type === 'mousedown' && e.button !== 0) return;
        if(e.target.dataset.type !== 'grid-row') return;

        const isTouch = e.type.startsWith('touch');
        const clientX = isTouch ? e.touches[0].clientX : e.clientX;
        const rect = gridRef.current.getBoundingClientRect();
        const activeWidth = Math.max(1, rect.width - 32);
        const mouseX = clientX - rect.left - 32;
        const clickedMin = (mouseX / activeWidth) * displayDur + displayStartMin;
        setDragState({ active: true, mode: 'create', rowIdx, id: null, startMin: clickedMin, currentMin: clickedMin, initialStartMin: 0, initialEndMin: 0, resizeEdge: null });
    };

    const handleInputStartBar = (e, sched, edge) => {
        if (isPastDay) return; // KHÓA QUÁ KHỨ
        e.stopPropagation();
        if(e.type === 'mousedown' && e.button !== 0) return;

        const isTouch = e.type.startsWith('touch');
        const clientX = isTouch ? e.touches[0].clientX : e.clientX;
        const rect = gridRef.current.getBoundingClientRect();
        const activeWidth = Math.max(1, rect.width - 32);
        const mouseX = clientX - rect.left - 32;
        const clickedMin = (mouseX / activeWidth) * displayDur + displayStartMin;
        setDragState({ 
            active: true, mode: edge ? 'resize' : 'move', rowIdx: sched.rowIdx || 0, id: sched.id, 
            startMin: clickedMin, currentMin: clickedMin, 
            initialStartMin: timeStrToMin(sched.startTime), initialEndMin: timeStrToMin(sched.endTime), resizeEdge: edge 
        });
    };

    useEffect(() => {
        if (!dragState.active) return;
        const handleMouseMove = (e) => {
            if(!gridRef.current) return;
            if (e.type === 'touchmove') {
                if (e.touches.length > 1) {
                    setDragState({ active: false, mode: null, id: null, rowIdx: null, startMin: 0, currentMin: 0 });
                    return;
                }
                if (e.cancelable) e.preventDefault(); 
            }
            const isTouch = e.type.startsWith('touch');
            const clientX = isTouch ? e.touches[0].clientX : e.clientX;
            const rect = gridRef.current.getBoundingClientRect();
            const activeWidth = Math.max(1, rect.width - 32);
            let mouseX = clientX - rect.left - 32;
            mouseX = Math.max(0, Math.min(mouseX, activeWidth));
            const currentMin = (mouseX / activeWidth) * displayDur + displayStartMin;
            setDragState(prev => ({ ...prev, currentMin: currentMin }));
        };

        const handleMouseUp = async () => {
            let sMin, eMin, dur;
            if (dragState.mode === 'create') {
                const s1 = Math.min(dragState.startMin, dragState.currentMin);
                const s2 = Math.max(dragState.startMin, dragState.currentMin);
                sMin = globalSnapMin(s1);
                eMin = globalSnapMin(s2);
                sMin = Math.max(safeStartMin, sMin);
                eMin = Math.min(safeEndMin, eMin);
                if (eMin - sMin < 30) {
                    if (Math.abs(dragState.currentMin - dragState.startMin) < 10) {
                        setDragState({ active: false, mode: null, rowIdx: null, id: null, startMin: 0, currentMin: 0 });
                        return;
                    }
                    eMin = sMin + 30;
                }
            } else if (dragState.mode === 'move') {
                const deltaMin = Math.round((dragState.currentMin - dragState.startMin) / 15) * 15;
                sMin = dragState.initialStartMin + deltaMin;
                dur = dragState.initialEndMin - dragState.initialStartMin;
                if (sMin < safeStartMin) sMin = safeStartMin;
                if (sMin + dur > safeEndMin) sMin = safeEndMin - dur;
                eMin = sMin + dur;
            } else if (dragState.mode === 'resize') {
                const deltaMin = Math.round((dragState.currentMin - dragState.startMin) / 15) * 15;
                if (dragState.resizeEdge === 'left') {
                    sMin = Math.max(safeStartMin, dragState.initialStartMin + deltaMin);
                    eMin = dragState.initialEndMin;
                    if(sMin > eMin - 30) sMin = eMin - 30;
                } else {
                    sMin = dragState.initialStartMin;
                    eMin = Math.min(safeEndMin, dragState.initialEndMin + deltaMin);
                    if(eMin < sMin + 30) eMin = sMin + 30;
                }
            }

            const newSched = {
                id: dragState.id || `temp-${Date.now()}`,
                name: `Ca ${dragState.rowIdx + 1}`,
                date: dayDateString,
                startTime: minToTimeStr(sMin),
                endTime: minToTimeStr(eMin),
                rowIdx: dragState.rowIdx,
                color: COLORS[dragState.rowIdx % COLORS.length],
            };

            if (dragState.id) {
                const existing = schedules.find(s => s.id === dragState.id);
                if (existing) {
                    newSched.staffIds = existing.staffIds || (existing.staffId ? [existing.staffId] : []);
                    newSched.name = existing.name;
                    newSched.color = existing.color;
                    newSched.isFixed = existing.isFixed;
                    newSched.templateId = existing.templateId;
                }
            } else {
                newSched.staffIds = [];
            }

            setDragState({ active: false, mode: null, rowIdx: null, id: null, startMin: 0, currentMin: 0 });

            // === SIÊU GỘP "MỘT HÀNG - MỘT THỰC THỂ" ===
            const rowExisting = schedules.filter(s => s.date === dayDateString && (s.rowIdx ?? 0) === dragState.rowIdx && s.id !== newSched.id);
            
            // Tìm tất cả ca trên hàng để gộp (bao gồm cả ca vừa thao tác)
            const allInRow = [...rowExisting, newSched];
            const fixedInfo = allInRow.find(s => s.isFixed && s.templateId);
            const mergedStart = Math.min(...allInRow.map(s => timeStrToMin(s.startTime)));
            const mergedEnd = Math.max(...allInRow.map(s => timeStrToMin(s.endTime)));
            const mergedStaffIds = [...new Set(allInRow.flatMap(s => s.staffIds || []))];
            
            // Giữ lại 1 ID duy nhất (Ưu tiên ID thật, sau đó là ID của ca đang thao tác)
            const representative = rowExisting.find(s => !s.id?.toString().startsWith('temp-')) || newSched;
            const mergedSched = { 
                ...representative, 
                startTime: minToTimeStr(mergedStart), 
                endTime: minToTimeStr(mergedEnd), 
                staffIds: mergedStaffIds,
                isFixed: !!fixedInfo,
                templateId: fixedInfo?.templateId || representative.templateId,
                date: dayDateString,
                rowIdx: dragState.rowIdx,
                name: representative.name || `Ca ${dragState.rowIdx + 1}`,
                color: representative.color || COLORS[dragState.rowIdx % COLORS.length]
            };
            
            // Xóa sạch dấu vết các ca khác trên hàng trong state
            const idsToDeleteFromState = allInRow.map(s => s.id).filter(id => id !== mergedSched.id);
            
            const nextSchedules = schedules.map(s => s.id === mergedSched.id ? mergedSched : s)
                .filter(s => !idsToDeleteFromState.includes(s.id));

            // Nếu là ca hoàn toàn mới chưa có trong state gốc
            const finalSchedules = nextSchedules.find(s => s.id === mergedSched.id) 
                ? nextSchedules 
                : [mergedSched, ...nextSchedules];

            setSchedules(finalSchedules);
            
            // Sync merged bản ghi duy nhất lên DB (isStructural = true vì thay đổi thời gian)
            await syncScheduleToDB(mergedSched, finalSchedules, true);

            // Gửi lệnh xóa các bản ghi "mảnh vụn" khác trên server (nếu có id thật)
            for (const s of allInRow) {
                if (s.id && s.id !== mergedSched.id && !s.id.toString().startsWith('temp-')) {
                    await fetch(`${SERVER_URL}/api/schedules/${s.id}`, { method: 'DELETE' }).catch(() => {});
                }
            }
            refreshData();
            return;
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        window.addEventListener('touchmove', handleMouseMove, { passive: false });
        window.addEventListener('touchend', handleMouseUp);
        window.addEventListener('touchcancel', handleMouseUp);
        return () => { 
            window.removeEventListener('mousemove', handleMouseMove); 
            window.removeEventListener('mouseup', handleMouseUp); 
            window.removeEventListener('touchmove', handleMouseMove);
            window.removeEventListener('touchend', handleMouseUp);
            window.removeEventListener('touchcancel', handleMouseUp);
        };
    }, [dragState, dayDateString, schedules]);

    // === Keyboard shortcut cho phím DELETE / BACKSPACE ===
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                // Đảm bảo không đang focus vào input nào đó
                if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
                
                if (selectedShiftId) {
                    deleteSchedule(selectedShiftId);
                }
            }
            if (e.key === 'Escape') setSelectedShiftId(null);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedShiftId, schedules]);

    const handleStaffDragStart = (e, stId) => { e.dataTransfer.setData('staffId', stId); };
    const handleStaffTap = (stId) => { setSelectedStaffId(prev => prev === stId ? null : stId); };

    const handleShiftTapToAssign = async (schedId) => {
        if (!selectedStaffId) return;
        const sched = schedules.find(s => s.id === schedId);
        if (sched) {
            const currentIds = sched.staffIds || [];
            if (!currentIds.includes(selectedStaffId)) {
                const updated = { ...sched, staffIds: [...currentIds, selectedStaffId] };
                const nextSchedules = schedules.map(s => s.id === updated.id ? updated : s);
                setSchedules(nextSchedules);
                await syncScheduleToDB(updated, nextSchedules);
            }
        }
        setSelectedStaffId(null);
    };

    const handleStaffDrop = async (e, schedId) => {
        e.preventDefault();
        const stId = e.dataTransfer.getData('staffId');
        if (!stId) return;
        const sched = schedules.find(s => s.id === schedId);
        if (sched) {
            const currentIds = sched.staffIds || [];
            if (!currentIds.includes(stId)) {
                const updated = { ...sched, staffIds: [...currentIds, stId] };
                const nextSchedules = schedules.map(s => s.id === updated.id ? updated : s);
                setSchedules(nextSchedules);
                await syncScheduleToDB(updated, nextSchedules);
            }
        }
    };

    const removeStaffFromShift = async (sched, stId) => {
        const currentIds = sched.staffIds || [];
        const updated = { ...sched, staffIds: currentIds.filter(id => id !== stId) };
        const nextSchedules = schedules.map(s => s.id === updated.id ? updated : s);
        setSchedules(nextSchedules);
        await syncScheduleToDB(updated, nextSchedules);
    };

    const handleStaffDragOver = (e) => e.preventDefault();

    const renderGhostBar = () => {
        if (!dragState.active || dragState.mode !== 'create') return null;
        const m1 = Math.min(dragState.startMin, dragState.currentMin);
        const m2 = Math.max(dragState.startMin, dragState.currentMin);
        let sM = globalSnapMin(m1);
        let eM = globalSnapMin(m2);
        if (eM - sM < 30) eM = sM + 30;
        const left = minToPercent(sM);
        const width = minDurationToPercent(sM, eM);
        return (
            <div className="absolute top-1 bottom-1 bg-brand-500/50 border-2 border-dashed border-brand-500 rounded-none pointer-events-none z-50 flex items-center justify-center font-black uppercase tracking-widest" style={{ left, width }}>
                <span className="bg-black/70 text-white text-[10px] px-2 py-1 shadow-lg">
                    {minToTimeStr(sM)} - {minToTimeStr(eM)}
                </span>
            </div>
        );
    };

    const renderBar = (sched) => {
        let sM = timeStrToMin(sched.startTime);
        let eM = timeStrToMin(sched.endTime);
        if (dragState.active && dragState.id === sched.id) {
            const deltaMin = Math.round((dragState.currentMin - dragState.startMin)/15)*15;
            if (dragState.mode === 'move') {
                sM = dragState.initialStartMin + deltaMin;
                eM = dragState.initialEndMin + deltaMin;
                if(sM<0) { eM-=sM; sM=0; }
                if(eM>1440) { sM-=(eM-1440); eM=1440; }
            } else if (dragState.mode === 'resize') {
                if(dragState.resizeEdge === 'left') { sM = Math.max(0, dragState.initialStartMin + deltaMin); if(sM > eM - 30) sM = eM - 30; }
                else { eM = Math.min(1440, dragState.initialEndMin + deltaMin); if(eM < sM + 30) eM = sM + 30; }
            }
        }
        const left = minToPercent(sM);
        const width = minDurationToPercent(sM, eM);
        const staffList = (sched.staffIds || []).map(id => staff.find(st => st.id === id)).filter(Boolean);
        
        let isOvertime = false;
        staffList.forEach(st => {
            const stSchedules = todaySchedules.filter(s => (s.staffIds || []).includes(st.id));
            const totalMin = stSchedules.reduce((acc, s) => acc + (timeStrToMin(s.endTime) - timeStrToMin(s.startTime)), 0);
            if (totalMin > (st.dailyLimit || 8) * 60) isOvertime = true;
        });

        const isSelected = selectedShiftId === sched.id;
        const isStaffSelected = selectedStaffId && (sched.staffIds || []).includes(selectedStaffId);

        return (
            <div 
                key={sched.id} 
                className={`absolute top-1.5 bottom-1.5 rounded-none shadow-sm group z-30 transition-all duration-300 pointer-events-auto
                            ${dragState.id === sched.id ? 'opacity-80 z-40 ring-4 ring-black/20' : 'hover:shadow-lg hover:z-40'}
                            ${isSelected ? 'ring-2 ring-brand-500 ring-offset-1 z-[60] shadow-xl' : ''}
                            ${isStaffSelected ? 'scale-y-[1.15] z-[55] ring-4 ring-white shadow-2xl brightness-125 border-b-4 border-b-brand-500' : ''}
                            ${selectedStaffId && !isStaffSelected ? 'cursor-cell ring-2 ring-brand-400 ring-offset-1 animate-pulse opacity-90' : ''}
                            ${isOvertime ? 'border-2 border-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.8)]' : ''}`}
                onMouseDown={(e) => {
                    e.stopPropagation();
                    if (selectedStaffId) {
                        handleShiftTapToAssign(sched.id);
                    } else {
                        setSelectedShiftId(sched.id);
                        handleInputStartBar(e, sched, null);
                    }
                }}
                onTouchStart={(e) => {
                    e.stopPropagation();
                    if (selectedStaffId) {
                        e.preventDefault();
                        handleShiftTapToAssign(sched.id);
                    } else {
                        setSelectedShiftId(sched.id);
                        handleInputStartBar(e, sched, null);
                    }
                }}
                onDragOver={handleStaffDragOver}
                onDrop={(e) => handleStaffDrop(e, sched.id)}
                style={{ 
                    left, 
                    width, 
                    backgroundColor: sched.color,
                    boxShadow: isStaffSelected ? '0 10px 30px -10px rgba(59,130,246,0.6)' : 'none'
                }}
            >
                <div className="absolute -left-3 top-0 bottom-0 w-6 cursor-ew-resize hover:bg-black/20 flex flex-col items-center justify-center z-[60] bg-transparent opacity-0 group-hover:opacity-100"
                     onMouseDown={(e) => handleInputStartBar(e, sched, 'left')}
                     onTouchStart={(e) => handleInputStartBar(e, sched, 'left')}>
                     <div className="w-1 h-4 bg-white/90 border border-black/20 rounded-none"></div>
                </div>
                <div className="h-full px-1 py-1 flex flex-col items-center justify-center overflow-hidden pointer-events-none opacity-90 w-full relative">
                    {/* Header: Ca name and Time */}
                    <div className="absolute top-1 left-2 right-2 flex justify-between items-center pointer-events-none">
                        <span className="text-[9px] font-black text-white/80 uppercase tracking-widest truncate max-w-[40%]">
                            {sched.name || `CA ${sched.rowIdx + 1}`}
                        </span>
                        <span className="text-[9px] font-black text-white/60 uppercase tracking-tight">
                            {minToTimeStr(sM)} - {minToTimeStr(eM)}
                        </span>
                    </div>

                    {/* Main content: Staff names */}
                    <div className="mt-2.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 pointer-events-auto px-2 w-full overflow-hidden">
                        {staffList.length > 0 ? staffList.map((st, idx) => (
                            <div key={st.id} className="flex items-center group/st active:scale-95 transition-transform">
                                <span className={`text-[11px] font-black text-white uppercase tracking-tighter drop-shadow-sm ${isStaffSelected && st.id === selectedStaffId ? 'bg-white/20 px-1 border border-white/30' : ''}`}>
                                    {st.name}{idx < staffList.length - 1 ? ',' : ''}
                                </span>
                                <button className="opacity-0 group-hover/st:opacity-100 ml-1 bg-black/10 hover:bg-red-500/80 p-0.5 transition-all shrink-0"
                                     onMouseDown={(e) => { e.stopPropagation(); removeStaffFromShift(sched, st.id); }}>
                                     <X size={10} className="text-white"/>
                                </button>
                            </div>
                        )) : (
                            <span className="text-[10px] font-black text-white/30 italic uppercase tracking-widest">Trống</span>
                        )}
                    </div>
                </div>
                <div className="absolute -right-3 top-0 bottom-0 w-6 cursor-ew-resize hover:bg-black/20 flex flex-col items-center justify-center z-[60] bg-transparent opacity-0 group-hover:opacity-100"
                     onMouseDown={(e) => handleInputStartBar(e, sched, 'right')}
                     onTouchStart={(e) => handleInputStartBar(e, sched, 'right')}>
                     <div className="w-1 h-4 bg-white/90 border border-black/20 rounded-none"></div>
                </div>
                {!isPastDay && (
                    <button 
                            onClick={(e) => { e.stopPropagation(); deleteSchedule(sched.id); }} 
                            className="absolute -top-2 -right-2 bg-red-100 text-red-500 hover:bg-red-500 hover:text-white border border-red-200 rounded-none shadow-md z-[60] opacity-0 group-hover:opacity-100 p-0.5"
                    >
                        <X size={12} strokeWidth={3}/>
                    </button>
                )}
            </div>
        );
    };

    return (
        <motion.section 
            initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} 
            className="h-[calc(100vh-140px)] flex flex-col pt-0 pb-0" 
        >
            {/* === FIX 2: OPEN / CLOSE time inputs trong toolbar === */}
            <div className="flex items-center justify-between px-6 py-2 bg-white z-10 sticky top-0 border-b border-gray-100 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="flex bg-gray-100 p-1 rounded-none border border-gray-100">
                        <button onClick={() => setViewMode('day')} className={`px-6 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'day' ? 'bg-white shadow-sm text-gray-900 border border-gray-100' : 'text-gray-400 hover:text-gray-900'}`}>Ngày (24H)</button>
                        <button onClick={() => setViewMode('week')} className={`px-6 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'week' ? 'bg-white shadow-sm text-gray-900 border border-gray-100' : 'text-gray-400 hover:text-gray-900'}`}>Tuần</button>
                    </div>
                    {/* OPEN/CLOSE time selectors */}
                    <div className="flex items-center gap-2 border border-gray-200 bg-gray-50 px-3 py-1.5">
                        <Clock size={12} className="text-brand-500 shrink-0" />
                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Mở cửa</span>
                        <input 
                            type="time" 
                            value={filterStartTime}
                            onChange={e => setFilterStartTime(e.target.value)}
                            className="text-[11px] font-black text-gray-900 bg-transparent border-none outline-none w-[70px] cursor-pointer"
                        />
                        <span className="text-[9px] font-black text-gray-300">—</span>
                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Đóng cửa</span>
                        <input 
                            type="time" 
                            value={filterEndTime}
                            onChange={e => setFilterEndTime(e.target.value)}
                            className="text-[11px] font-black text-gray-900 bg-transparent border-none outline-none w-[70px] cursor-pointer"
                        />
                    </div>
                </div>
                <div className="flex items-center bg-gray-50 rounded-none border border-gray-100 h-[38px]">
                    <button onClick={handlePrev} className="px-3 h-full hover:bg-white text-gray-400 hover:text-gray-900 transition-colors border-r border-gray-100 flex items-center justify-center"><ArrowLeft size={16}/></button>
                    <div className="px-6 font-black text-[11px] text-gray-900 uppercase tracking-widest min-w-[180px] text-center">
                        {viewMode === 'week' ? `Tuần ${weekDays[0].getDate()}/${weekDays[0].getMonth()+1} - ${weekDays[6].getDate()}/${weekDays[6].getMonth()+1}` : currentDate.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' })}
                    </div>
                    <button onClick={handleNext} className="px-3 h-full hover:bg-white text-gray-400 hover:text-gray-900 transition-colors border-l border-gray-100 flex items-center justify-center"><ArrowRight size={16}/></button>
                </div>
                {/* NÚT MỞ BỘ CÔNG CỤ DỌN DẸP THÔNG MINH */}
                <button 
                    onClick={() => setIsCleanupModalOpen(true)}
                    className={`bg-red-50 text-red-600 border border-red-100 px-4 py-2 font-black text-[10px] uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all shadow-sm flex items-center gap-2 h-[38px] ${isCleanupModalOpen ? 'ring-2 ring-red-500 ring-offset-2' : ''}`}
                >
                    <Eraser size={14} /> DỌN DẸP
                </button>
            </div>


            <div className="flex-1 flex overflow-hidden">
                <div className="w-[280px] bg-white border-r border-gray-100 flex flex-col pb-8 overflow-y-auto shrink-0">
                    <div className="px-6 py-5 border-b border-gray-50 bg-white sticky top-0 z-10">
                        <p className="font-black text-[11px] uppercase text-gray-900 tracking-[0.2em] flex items-center gap-2 mb-1"><Users size={14} className="text-brand-500"/> Nhân Viên Sẵn Có</p>
                        <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest leading-loose">Kéo thả hoặc bấm để phân bổ</p>
                    </div>
                    <div className="p-4 space-y-2">
                        {staff.map(st => {
                            const stSchedules = todaySchedules.filter(s => (s.staffIds || []).includes(st.id));
                            const totalMin = stSchedules.reduce((acc, s) => acc + (timeStrToMin(s.endTime) - timeStrToMin(s.startTime)), 0);
                            const limitMin = (st.dailyLimit || 8)*60;
                            const isMaxed = totalMin >= limitMin;
                            const colors = [...new Set(stSchedules.map(s => s.color))];

                            return (
                                <div key={st.id} draggable onDragStart={(e) => handleStaffDragStart(e, st.id)} onClick={() => handleStaffTap(st.id)}
                                     className={`bg-white border cursor-grab hover:shadow-md transition-all flex active:cursor-grabbing overflow-hidden rounded-none
                                                 ${selectedStaffId === st.id ? 'bg-brand-50 border-brand-500 scale-[1.02] shadow-lg ring-1 ring-brand-500/20' : 'border-gray-100'}`}>
                                    <div className="w-1.5 flex flex-col shrink-0">
                                        {colors.length > 0 ? colors.map((c, i) => <div key={i} className="flex-1" style={{ backgroundColor: c }}></div>) : <div className="flex-1 bg-gray-100"></div>}
                                    </div>
                                    <div className="flex-1 p-3 flex flex-col justify-center overflow-hidden">
                                        <div className="flex items-center justify-between mb-0.5">
                                            <span className="font-black text-xs text-gray-900 uppercase tracking-widest truncate">{st.name}</span>
                                            {isMaxed && <span className="text-[8px] bg-red-100 text-red-600 px-1.5 py-0.5 font-black uppercase tracking-widest">FULL</span>}
                                        </div>
                                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest truncate">{st.role} • {Math.round(totalMin/60*10)/10}H / {limitMin/60}H</span>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>

                <div className="flex-1 overflow-auto bg-[#fafafa] relative" ref={gridRef}>
                    {viewMode === 'day' && (
                        <div className="w-full min-w-[900px] flex flex-col min-h-full">
                            <div className="h-12 border-b border-gray-200 flex sticky top-0 z-40 bg-white/95 backdrop-blur shrink-0">
                                <div className="w-20 shrink-0 border-r border-gray-100 bg-gray-50/50" />
                                <div className="flex-1 relative">
                                    {timelineTicks.map(min => (
                                        <div key={min} className="absolute top-0 bottom-0 border-l border-gray-100 flex flex-col justify-end pb-2" style={{ left: minToPercent(min) }}>
                                            {min % 60 === 0 && <span className="text-[10px] font-black text-gray-400 absolute bottom-3 -left-3 uppercase tracking-tighter">{Math.floor(min/60)}H</span>}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="relative flex-1 bg-white overflow-hidden">
                                <div className="absolute inset-0 left-20 pointer-events-none z-0">
                                    {timelineTicks.map(min =>
                                        <div key={min} className={`absolute top-0 bottom-0 border-l ${min%60===0 ? 'border-gray-200' : 'border-gray-100 border-dashed'} opacity-40`} style={{ left: minToPercent(min) }} />
                                    )}
                                </div>

                                {Array.from({length: Math.max(12, (todaySchedules.length > 0 ? Math.max(...todaySchedules.map(s => s.rowIdx ?? 0)) : 0) + 4)}).map((_, rowIdx) => {
                                    const rowScheds = todaySchedules.filter(s => (s.rowIdx || 0) === rowIdx);
                                    // Ghost Box đã bị khai tử - rowGhosts luôn trống
                                    const rowGhosts = [];
                                    const isAnyFixed = rowScheds.some(s => s.isFixed);


                                    // templateId đang dùng (từ schedule thật hoặc ghost)
                                    const existingFixed = rowScheds.find(s => s.isFixed && s.templateId) || rowGhosts[0] || null;

                                    return (
                                        <div key={rowIdx} className="h-16 relative border-b border-gray-100 group">
                                            {/* PHỤC HỒI CHECKBOX CỐ ĐỊNH (KHÔNG GHOST) */}
                                            <div className="absolute top-0 bottom-0 left-0 w-20 bg-gray-50/30 border-r border-gray-100 flex flex-col items-center justify-center z-40 sticky left-0 gap-0.5">
                                                <label className={`flex flex-col items-center gap-0.5 cursor-pointer group/cb ${isPastDay ? 'opacity-20 pointer-events-none' : ''}`}>
                                                    <input type="checkbox" className="w-3.5 h-3.5 rounded-none border-gray-300 text-brand-600 focus:ring-0 cursor-pointer accent-brand-600"
                                                       checked={isAnyFixed}
                                                       disabled={isPastDay}
                                                        onChange={async () => {
                                                             if (isPastDay) return;
                                                             const willFixed = !isAnyFixed;
                                                             const existingF = rowScheds.find(s => s.isFixed && s.templateId);

                                                             if (willFixed) {
                                                                 if (rowScheds.length === 0) {
                                                                     const tplId = `tpl-row-${rowIdx}-${Date.now()}`;
                                                                     const newSc = { id: `shift-${Date.now()}`, date: dayDateString, startTime: "08:00", endTime: "12:00", rowIdx, isFixed: true, templateId: tplId, staffIds: [], name: `Ca ${rowIdx+1}`, color: COLORS[rowIdx % COLORS.length] };
                                                                     const nS = [...schedules, newSc];
                                                                     setSchedules(nS);
                                                                     await syncScheduleToDB(newSc, nS, true);
                                                                 } else {
                                                                     const tplId = existingF?.templateId || `tpl-row-${rowIdx}-${Date.now()}`;
                                                                     for (const sh of rowScheds) {
                                                                         await syncScheduleToDB({ ...sh, isFixed: true, templateId: tplId }, schedules, true);
                                                                     }
                                                                 }
                                                             } else {
                                                                 const tplId = existingF?.templateId;
                                                                 if (tplId) {
                                                                     const refSched = rowScheds.find(s => s.templateId === tplId) || existingF;
                                                                     await syncScheduleToDB({ ...refSched, isFixed: false, templateId: tplId }, schedules, true);
                                                                 } else {
                                                                     for (const sh of rowScheds) {
                                                                         await syncScheduleToDB({ ...sh, isFixed: false }, schedules, true);
                                                                     }
                                                                 }
                                                             }
                                                             refreshData();
                                                        }} />
                                                    <span className="text-[8px] font-black text-center leading-tight uppercase tracking-widest group/cb-hover:text-brand-600 transition-colors" style={{ color: isAnyFixed ? '#3b82f6' : '#9ca3af' }}>CỐ<br/>ĐỊNH</span>
                                                </label>
                                                <span className="text-[8px] font-bold text-gray-300 mt-0.5 uppercase tracking-widest">C{rowIdx+1}</span>
                                            </div>

                                            <div data-type="grid-row" className="absolute inset-y-0 left-20 right-0 cursor-crosshair hover:bg-gray-50/50 z-20"
                                                 onMouseDown={(e) => handleInputStartGrid(e, rowIdx)} onTouchStart={(e) => handleInputStartGrid(e, rowIdx)} />
                                            
                                            <div className="absolute inset-y-0 left-20 right-0 pointer-events-none z-30">
                                                {/* Ghost Box đã bị khai tử hoàn toàn */}
                                                {rowScheds.map(sched => renderBar(sched))}
                                                {dragState.active && dragState.mode === 'create' && dragState.rowIdx === rowIdx && renderGhostBar()}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {viewMode === 'week' && (
                        <div className="w-full h-full flex flex-col p-6 bg-[#fafafa]">
                            <div className="grid grid-cols-7 gap-4">
                                {weekDays.map(d => {
                                    const ds = getDateStr(d);
                                    const isToday = ds === getDateStr();
                                    const dayScheds = schedules.filter(s => s.date === ds).sort((a,b) => timeStrToMin(a.startTime) - timeStrToMin(b.startTime));
                                    return (
                                        <div key={ds} className={`flex flex-col min-h-[600px] border transition-all duration-500 ${isToday ? 'border-brand-500/30 bg-brand-50/5 ring-1 ring-brand-500/10' : 'border-gray-100 bg-white'}`}>
                                            <div className="p-3 text-center border-b border-gray-50 flex flex-col items-center justify-center min-h-[100px] leading-tight group/day">
                                                {isToday && (
                                                    <div className="mb-2 bg-brand-500 text-white text-[9px] font-black px-3 py-1 uppercase tracking-widest shadow-md animate-pulse">
                                                        HÔM NAY
                                                    </div>
                                                )}
                                                <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${isToday ? 'text-brand-600' : 'text-gray-400'}`}>{d.toLocaleDateString('vi-VN', {weekday: 'long'})}</p>
                                                <div className={`inline-flex items-center justify-center w-10 h-10 rounded-none transition-all ${isToday ? 'bg-brand-500 text-white shadow-xl' : 'text-gray-900 group-hover/day:bg-gray-50'}`}>
                                                    <span className="text-2xl font-black">{d.getDate()}</span>
                                                </div>
                                            </div>
                                            <div className="flex-1 p-2 space-y-3 overflow-y-auto">
                                                {dayScheds.map(sh => {
                                                    const nSt = (sh.staffIds || []).length;
                                                    const isStaffSelected = selectedStaffId && (sh.staffIds || []).includes(selectedStaffId);
                                                    const isDimmed = selectedStaffId && !isStaffSelected;
                                                    const isExpanded = expandedShiftIds.includes(sh.id);
                                                    
                                                    const visibleStaff = isExpanded ? (sh.staffIds || []) : (sh.staffIds || []).slice(0, 3);
                                                    
                                                    return (
                                                        <div key={sh.id} onClick={(e) => { 
                                                                if (e.target.closest('.no-jump')) return;
                                                                setViewMode('day'); setCurrentDate(d); 
                                                             }} 
                                                             className={`bg-white shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer overflow-hidden rounded-none flex flex-col border
                                                                         ${isStaffSelected ? 'ring-2 ring-brand-500 scale-[1.05] z-30 shadow-2xl border-transparent brightness-110 border-b-4 border-b-brand-500' : 'border-gray-100'}
                                                                         ${isDimmed ? 'opacity-50 grayscale-[0.5] z-0' : 'z-10'}`}
                                                             style={{ 
                                                                 boxShadow: isStaffSelected ? '0 10px 30px -10px rgba(59,130,246,0.5)' : 'none'
                                                             }}>
                                                            <div className="py-1.5 px-3 flex justify-between items-center shrink-0 shadow-sm" style={{ backgroundColor: isDimmed ? '#f3f4f6' : sh.color }}>
                                                                <span className={`text-[10px] font-black uppercase truncate tracking-widest ${isDimmed ? 'text-gray-400' : 'text-white'}`}>{sh.name}</span>
                                                                <span className={`text-[9px] font-bold bg-black/10 px-1.5 py-0.5 rounded-sm ${isDimmed ? 'text-gray-400' : 'text-white/90'}`}>{sh.startTime} - {sh.endTime}</span>
                                                            </div>
                                                            <div className={`flex-1 p-3 flex flex-col items-center justify-center gap-2 ${
                                                                nSt === 0 ? 'min-h-[48px]' : 
                                                                nSt === 1 ? 'min-h-[64px]' : 
                                                                nSt === 2 ? 'min-h-[80px]' : 'min-h-[96px]'
                                                            }`}>
                                                                <div className="flex flex-col items-center justify-center gap-1.5 py-1">
                                                                    {visibleStaff.length > 0 ? visibleStaff.map(id => (
                                                                        <span key={id} className={`text-[11px] font-black uppercase tracking-tighter ${isDimmed ? 'text-gray-400' : 'text-brand-600'} ${isStaffSelected && id === selectedStaffId ? 'bg-brand-50 px-2' : ''}`}>{staff.find(st => st.id === id)?.name}</span>
                                                                    )) : <span className={`text-[10px] font-black uppercase italic opacity-60 ${isDimmed ? 'text-gray-400' : 'text-gray-300'}`}>Trống</span>}
                                                                    
                                                                    {nSt > 3 && !isExpanded && (
                                                                        <button 
                                                                            onClick={(e) => { e.stopPropagation(); toggleShiftExpand(sh.id); }}
                                                                            className="no-jump text-[9px] font-black text-gray-400 hover:text-brand-500 flex items-center gap-1 mt-1 transition-colors"
                                                                        >
                                                                            + {nSt - 3} NHÂN VIÊN
                                                                        </button>
                                                                    )}
                                                                    {isExpanded && (
                                                                        <button 
                                                                            onClick={(e) => { e.stopPropagation(); toggleShiftExpand(sh.id); }}
                                                                            className="no-jump text-[9px] font-black text-brand-400 hover:text-gray-600 mt-1 transition-colors underline decoration-dotted"
                                                                        >
                                                                            THU GỌN
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            <div className="p-3 border-t border-gray-50 bg-gray-50/20 group/day relative">
                                                <button 
                                                    onClick={() => { setCurrentDate(d); setViewMode('day'); }}
                                                    className="w-full py-2.5 bg-white border border-gray-200 text-gray-500 hover:text-brand-600 hover:border-brand-500 hover:bg-brand-50 transition-all text-[10px] font-black uppercase tracking-[0.2em] shadow-sm flex items-center justify-center gap-2"
                                                >
                                                    XEM CHI TIẾT (24H)
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* BẢNG TỔNG HỢP LƯƠNG & CÔNG SUẤT THÁNG (MONTHLY CONTEXT) */}
            <div className="px-6 py-8 bg-gray-50/50 border-t border-gray-100">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-600 flex items-center justify-center text-white shadow-lg">
                            <BarChart3 size={20} />
                        </div>
                        <div>
                            <h3 className="font-black text-gray-900 uppercase tracking-widest leading-none">Dự toán lương & Cân đối ca làm</h3>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Dữ liệu tháng {currentDate.getMonth() + 1}/{currentDate.getFullYear()}</p>
                        </div>
                    </div>
                    <div className="flex gap-4">
                        <div className="bg-white px-4 py-2 border border-gray-100 shadow-sm flex flex-col items-center min-w-[120px]">
                            <span className="text-[9px] font-black text-gray-400 uppercase">Tổng quỹ lương tháng</span>
                            <span className="text-sm font-black text-indigo-600">
                                {formatVND(monthlyStats.reduce((sum, s) => sum + s.pastSalary + s.futureSalary, 0))}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="bg-white border border-gray-100 shadow-xl overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100">
                                <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">Nhân viên</th>
                                <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">Vai trò</th>
                                <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">Lương đã làm</th>
                                <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">Lương dự kiến</th>
                                <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">Tổng giờ</th>
                                <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">Chênh lệch / Công suất</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {monthlyStats.map(st => {
                                const diff = st.totalHours - st.monthlyLimit;
                                const progress = Math.min(100, (st.totalHours / st.monthlyLimit) * 100);
                                const isOver = st.totalHours > st.monthlyLimit;
                                const isIdeal = progress >= 70 && progress <= 100;
                                
                                return (
                                    <tr key={st.id} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="font-black text-gray-900 text-sm uppercase tracking-tight">{st.name}</div>
                                            <div className="text-[9px] font-bold text-gray-400 uppercase mt-0.5 tracking-tighter">Định mức: {st.monthlyLimit}h/tháng</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="px-2 py-1 bg-gray-100 text-[9px] font-black text-gray-500 uppercase tracking-tighter">
                                                {st.role}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 font-bold text-gray-700 text-sm">
                                            {formatVND(st.pastSalary)}
                                        </td>
                                        <td className="px-6 py-4 font-black text-indigo-600 text-sm">
                                            {formatVND(st.futureSalary)}
                                        </td>
                                        <td className="px-6 py-4 flex flex-col">
                                            <span className="font-black text-gray-900 text-sm">{st.totalHours.toFixed(1)}h</span>
                                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">
                                                {st.pastHours.toFixed(1)}h cũ + {st.futureHours.toFixed(1)}h mới
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-2">
                                                <div className="flex justify-between items-end mb-1">
                                                    <span className={`text-[10px] font-black uppercase tracking-tighter ${diff > 0 ? 'text-red-500' : 'text-amber-500'}`}>
                                                        {diff >= 0 ? `Dư ${diff.toFixed(1)}h` : `Thiếu ${Math.abs(diff).toFixed(1)}h`}
                                                    </span>
                                                    <span className={`text-[10px] font-black tracking-tighter ${isIdeal ? 'text-green-600' : isOver ? 'text-red-600' : 'text-amber-600'}`}>
                                                        {progress.toFixed(0)}%
                                                    </span>
                                                </div>
                                                <div className="w-full h-2 bg-gray-100 shadow-inner overflow-hidden">
                                                    <motion.div 
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${progress}%` }}
                                                        className={`h-full transition-colors ${
                                                            isIdeal ? 'bg-green-500' : isOver ? 'bg-red-500' : 'bg-amber-500'
                                                        }`}
                                                    />
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {monthlyStats.length === 0 && (
                                <tr>
                                    <td colSpan="6" className="px-6 py-12 text-center italic text-gray-400 text-sm uppercase font-bold tracking-widest">
                                        Chưa có dữ liệu nhân sự trong tháng này.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* CỬA SỔ DỌN DẸP THÔNG MINH (MODAL) */}
            <AnimatePresence>
                {isCleanupModalOpen && (
                    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6">
                        <motion.div 
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setIsCleanupModalOpen(false)}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        />
                        
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="relative w-full max-w-xl bg-white shadow-2xl overflow-hidden rounded-none flex flex-col"
                        >
                            <div className="bg-red-600 p-6 flex items-center justify-between text-white">
                                <div className="flex items-center gap-3">
                                    <Eraser size={24} />
                                    <div>
                                        <h3 className="font-black text-lg uppercase tracking-widest leading-none">Dọn Dẹp Gantt</h3>
                                        <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest mt-1">Smart Cleanup Toolkit v2.0</p>
                                    </div>
                                </div>
                                <button onClick={() => setIsCleanupModalOpen(false)} className="hover:rotate-90 transition-transform">
                                    <X size={24} />
                                </button>
                            </div>

                            <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <CleanupOptionCard 
                                    icon={<List size={20}/>} color="blue"
                                    title="Xóa Ca TRỐNG" desc="Chỉ xóa ca chưa có nhân viên (Hôm nay -> Tương lai)"
                                    onClick={() => handleSelectiveCleanup('empty')}
                                />
                                <CleanupOptionCard 
                                    icon={<CalendarIcon size={20}/>} color="orange"
                                    title="Xóa Theo NGÀY" desc={`Xóa tất cả ca: ${dayDateString}`}
                                    onClick={() => handleSelectiveCleanup('day')}
                                />
                                <CleanupOptionCard 
                                    icon={<LayoutGrid size={20}/>} color="purple"
                                    title="Xóa Theo TUẦN" desc="Xóa toàn bộ ca của tuần đang xem"
                                    onClick={() => handleSelectiveCleanup('week')}
                                />
                                <CleanupOptionCard 
                                    icon={<Trash2 size={20}/>} color="red"
                                    title="Xóa Theo THÁNG" desc={`Xóa toàn bộ ca tháng ${currentDate.getMonth()+1}/${currentDate.getFullYear()}`}
                                    onClick={() => handleSelectiveCleanup('month')}
                                />
                            </div>

                            <div className="px-8 pb-8 flex flex-col items-center">
                                <div className="w-full h-px bg-gray-100 mb-6"></div>
                                <div className="flex items-center gap-2 text-red-500 mb-6">
                                    <AlertTriangle size={14} />
                                    <span className="text-[10px] font-black uppercase tracking-widest">
                                        Lịch sử quá khứ từ hôm qua trở về trước vẫn được bảo vệ
                                    </span>
                                </div>
                                <button 
                                    onClick={() => setIsCleanupModalOpen(false)}
                                    className="w-full py-4 border-2 border-gray-100 font-black text-xs uppercase tracking-[0.2em] text-gray-400 hover:bg-gray-50 transition-all"
                                >
                                    Đóng cửa sổ
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </motion.section>
    );
};

// COMPONENT CON CHO OPTION
const CleanupOptionCard = ({ icon, title, desc, onClick, color }) => {
    const colorClasses = {
        blue: "bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white",
        orange: "bg-orange-50 text-orange-600 hover:bg-orange-600 hover:text-white",
        purple: "bg-purple-50 text-purple-600 hover:bg-purple-600 hover:text-white",
        red: "bg-red-50 text-red-600 hover:bg-red-600 hover:text-white"
    };

    return (
        <button 
            onClick={onClick}
            className="flex flex-col p-5 bg-white border border-gray-100 hover:border-transparent hover:shadow-xl transition-all text-left outline-none group"
        >
            <div className={`w-12 h-12 flex items-center justify-center mb-4 transition-colors ${colorClasses[color]}`}>
                {icon}
            </div>
            <h4 className="font-black text-xs text-gray-900 uppercase tracking-widest mb-1 group-hover:text-red-600 transition-colors">
                {title}
            </h4>
            <p className="text-[9px] font-bold text-gray-400 leading-relaxed uppercase tracking-tighter opacity-80">
                {desc}
            </p>
        </button>
    );
};

export default SchedulesView;
