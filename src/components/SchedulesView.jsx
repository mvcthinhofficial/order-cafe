import React, { useState, useMemo, useEffect, useRef } from 'react';
import { SERVER_URL } from '../api';
import { Calendar as CalendarIcon, Clock, Users, ArrowLeft, ArrowRight, Save, LayoutGrid, List, AlertTriangle, X, Anchor } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const getVNTime = (date = new Date()) => new Date(date.getTime() + 7 * 3600 * 1000);
const getVNDateStr = (date = new Date()) => getVNTime(date).toISOString().split('T')[0];

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

const SchedulesView = ({ staff, schedules, setSchedules, shifts, refreshData }) => {
    const [viewMode, setViewMode] = useState('day'); 
    const [currentDate, setCurrentDate] = useState(new Date());
    const gridRef = useRef(null);
    const [filterStartTime, setFilterStartTime] = useState(() => localStorage.getItem('cafe-op-start') || '06:00');
    const [filterEndTime, setFilterEndTime] = useState(() => localStorage.getItem('cafe-op-end') || '22:00');
    const [selectedStaffId, setSelectedStaffId] = useState(null);
    const [expandedShiftIds, setExpandedShiftIds] = useState([]); 

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

    const dayDateString = getVNDateStr(currentDate);
    const todaySchedules = schedules.filter(s => s.date === dayDateString);

    const handlePrev = () => { const d = new Date(currentDate); d.setDate(d.getDate() - (viewMode === 'week' ? 7 : 1)); setCurrentDate(d); };
    const handleNext = () => { const d = new Date(currentDate); d.setDate(d.getDate() + (viewMode === 'week' ? 7 : 1)); setCurrentDate(d); };
    
    const fixedTemplates = useMemo(() => {
        const templates = [];
        const seenTpl = new Set();
        schedules.filter(s => s.isFixed && s.templateId).forEach(s => {
            if (!seenTpl.has(s.templateId)) {
                seenTpl.add(s.templateId);
                templates.push(s);
            }
        });
        return templates;
    }, [schedules]);

    const syncScheduleToDB = async (sched) => {
        try {
            let list = [sched];
            if (sched.isFixed && sched.templateId) {
                const others = (schedules || []).filter(s => s.templateId === sched.templateId && s.id !== sched.id);
                const updatedOthers = others.map(o => ({
                    ...o,
                    startTime: sched.startTime,
                    endTime: sched.endTime,
                    isFixed: true,
                    templateId: sched.templateId,
                    rowIdx: sched.rowIdx
                }));
                list = [sched, ...updatedOthers];
                const now = new Date();
                const startDate = new Date(now); startDate.setDate(startDate.getDate() - 15);
                const endDate = new Date(now); endDate.setDate(endDate.getDate() + 45);
                for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                    const ds = getVNDateStr(d);
                    const exists = list.some(s => s.date === ds && s.templateId === sched.templateId) || 
                                 schedules.some(s => s.date === ds && s.templateId === sched.templateId);
                    if (!exists) {
                        list.push({
                            id: `shift-auto-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                            date: ds,
                            startTime: sched.startTime,
                            endTime: sched.endTime,
                            rowIdx: sched.rowIdx,
                            isFixed: true,
                            templateId: sched.templateId,
                            staffIds: [],
                            color: sched.color
                        });
                    }
                }
            } else if (!sched.isFixed && (sched.templateId || sched.id)) {
                const tplId = sched.templateId;
                if (tplId) {
                    const others = (schedules || []).filter(s => s.templateId === tplId && s.id !== sched.id);
                    const toDeleteIds = [];
                    const toUpdate = [];
                    [sched, ...others].forEach(s => {
                        if (s.staffIds && s.staffIds.length > 0) {
                            toUpdate.push({ ...s, isFixed: false, templateId: null });
                        } else {
                            toDeleteIds.push(s.id);
                        }
                    });
                    list = toUpdate;
                    for (const id of toDeleteIds) {
                        await fetch(`${SERVER_URL}/api/schedules/${id}`, { method: 'DELETE' }).catch(() => {});
                    }
                }
            }
            if (list.length > 0) {
                await fetch(`${SERVER_URL}/api/schedules`, {
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' }, 
                    body: JSON.stringify(list)
                });
            }
            refreshData();
        } catch(e) { console.error('Lỗi sync ca', e); }
    };

    const deleteSchedule = async (id) => {
        if(!confirm('Xóa ca này?')) return;
        try {
            const res = await fetch(`${SERVER_URL}/api/schedules/${id}`, { method: 'DELETE' });
            if(res.ok) { setSchedules(prev => prev.filter(s => s.id !== id)); refreshData(); }
        } catch(e) { console.error(e); }
    };

    const [dragState, setDragState] = useState({ active: false, mode: null, rowIdx: null, id: null, startMin: 0, currentMin: 0, initialStartMin: 0, initialEndMin: 0, resizeEdge: null });

    const handleInputStartGrid = (e, rowIdx) => {
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
                id: dragState.id || undefined,
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
                }
            } else {
                newSched.staffIds = [];
            }

            setDragState({ active: false, mode: null, rowIdx: null, id: null, startMin: 0, currentMin: 0 });
            if (!newSched.id) {
                setSchedules(prev => [ { ...newSched, id: `temp-${Date.now()}` }, ...prev]);
            } else {
                setSchedules(prev => prev.map(s => s.id === newSched.id ? { ...s, ...newSched } : s));
            }
            await syncScheduleToDB(newSched);
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

    const handleStaffDragStart = (e, stId) => { e.dataTransfer.setData('staffId', stId); };
    const handleStaffTap = (stId) => { setSelectedStaffId(prev => prev === stId ? null : stId); };

    const handleShiftTapToAssign = async (schedId) => {
        if (!selectedStaffId) return;
        const sched = schedules.find(s => s.id === schedId);
        if (sched) {
            const currentIds = sched.staffIds || [];
            if (!currentIds.includes(selectedStaffId)) {
                const updated = { ...sched, staffIds: [...currentIds, selectedStaffId] };
                setSchedules(prev => prev.map(s => s.id === updated.id ? updated : s));
                await syncScheduleToDB(updated);
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
                setSchedules(prev => prev.map(s => s.id === updated.id ? updated : s));
                await syncScheduleToDB(updated);
            }
        }
    };

    const removeStaffFromShift = async (sched, stId) => {
        const currentIds = sched.staffIds || [];
        const updated = { ...sched, staffIds: currentIds.filter(id => id !== stId) };
        setSchedules(prev => prev.map(s => s.id === updated.id ? updated : s));
        await syncScheduleToDB(updated);
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

        return (
            <div 
                key={sched.id} 
                className={`absolute top-1.5 bottom-1.5 rounded-none shadow-sm group z-30 transition-shadow pointer-events-auto
                            ${dragState.id === sched.id ? 'opacity-80 z-40 ring-4 ring-black/20' : 'hover:shadow-lg hover:z-40'}
                            ${selectedStaffId ? 'cursor-cell ring-2 ring-brand-500 ring-offset-1 animate-pulse' : ''}
                            ${isOvertime ? 'border-2 border-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.8)]' : ''}`}
                onMouseDown={(e) => selectedStaffId ? (e.stopPropagation(), handleShiftTapToAssign(sched.id)) : handleInputStartBar(e, sched, null)}
                onTouchStart={(e) => selectedStaffId ? (e.stopPropagation(), e.preventDefault(), handleShiftTapToAssign(sched.id)) : handleInputStartBar(e, sched, null)}
                onDragOver={handleStaffDragOver}
                onDrop={(e) => handleStaffDrop(e, sched.id)}
                style={{ left, width, backgroundColor: sched.color }}
            >
                <div className="absolute -left-3 top-0 bottom-0 w-6 cursor-ew-resize hover:bg-black/20 flex flex-col items-center justify-center z-[60] bg-transparent opacity-0 group-hover:opacity-100"
                     onMouseDown={(e) => handleInputStartBar(e, sched, 'left')}
                     onTouchStart={(e) => handleInputStartBar(e, sched, 'left')}>
                     <div className="w-1 h-4 bg-white/90 border border-black/20 rounded-none"></div>
                </div>
                <div className="h-full px-3 py-2 flex flex-col justify-between overflow-hidden pointer-events-none opacity-95">
                    <div className="flex justify-between items-start w-full">
                        <span className="text-[14px] font-black text-white truncate tracking-tight uppercase">{minToTimeStr(sM)} - {minToTimeStr(eM)}</span>
                        {isOvertime && <AlertTriangle size={14} className="text-red-200" />}
                    </div>
                    {staffList.length > 0 ? (
                        <div className="flex flex-wrap justify-end gap-1 mt-auto pointer-events-auto">
                            {staffList.map(st => (
                                <span key={st.id} className="text-[11px] font-black text-white bg-black/20 border border-white/20 px-2 py-0.5 rounded-none flex items-center gap-1">
                                    {st.name}
                                    <X size={12} className="text-white/80 hover:text-red-400 cursor-pointer" onMouseDown={(e) => { e.stopPropagation(); removeStaffFromShift(sched, st.id); }}/>
                               </span>
                            ))}
                        </div>
                    ) : <span className="text-[10px] font-bold text-white/60 italic uppercase truncate mt-auto text-right">Trống</span>}
                </div>
                <div className="absolute -right-3 top-0 bottom-0 w-6 cursor-ew-resize hover:bg-black/20 flex flex-col items-center justify-center z-[60] bg-transparent opacity-0 group-hover:opacity-100"
                     onMouseDown={(e) => handleInputStartBar(e, sched, 'right')}
                     onTouchStart={(e) => handleInputStartBar(e, sched, 'right')}>
                     <div className="w-1 h-4 bg-white/90 border border-black/20 rounded-none"></div>
                </div>
                <button 
                        onClick={(e) => { e.stopPropagation(); deleteSchedule(sched.id); }} 
                        className="absolute -top-2 -right-2 bg-red-100 text-red-500 hover:bg-red-500 hover:text-white border border-red-200 rounded-none shadow-md z-[60] opacity-0 group-hover:opacity-100 p-0.5"
                >
                    <X size={12} strokeWidth={3}/>
                </button>
            </div>
        );
    };

    return (
        <motion.section 
            initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} 
            className="h-[calc(100vh-140px)] flex flex-col pt-0 pb-0" 
        >
            <div className="flex items-center justify-between px-6 py-2 bg-white z-10 sticky top-0 border-b border-gray-100 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="flex bg-gray-100 p-1 rounded-none border border-gray-100">
                        <button onClick={() => setViewMode('day')} className={`px-6 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'day' ? 'bg-white shadow-sm text-gray-900 border border-gray-100' : 'text-gray-400 hover:text-gray-900'}`}>Ngày (24H)</button>
                        <button onClick={() => setViewMode('week')} className={`px-6 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'week' ? 'bg-white shadow-sm text-gray-900 border border-gray-100' : 'text-gray-400 hover:text-gray-900'}`}>Tuần</button>
                    </div>
                </div>
                <div className="flex items-center bg-gray-50 rounded-none border border-gray-100 h-[38px]">
                    <button onClick={handlePrev} className="px-3 h-full hover:bg-white text-gray-400 hover:text-gray-900 transition-colors border-r border-gray-100 flex items-center justify-center"><ArrowLeft size={16}/></button>
                    <div className="px-6 font-black text-[11px] text-gray-900 uppercase tracking-widest min-w-[180px] text-center">
                        {viewMode === 'week' ? `Tuần ${weekDays[0].getDate()}/${weekDays[0].getMonth()+1} - ${weekDays[6].getDate()}/${weekDays[6].getMonth()+1}` : currentDate.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' })}
                    </div>
                    <button onClick={handleNext} className="px-3 h-full hover:bg-white text-gray-400 hover:text-gray-900 transition-colors border-l border-gray-100 flex items-center justify-center"><ArrowRight size={16}/></button>
                </div>
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
                                                 ${selectedStaffId === st.id ? 'border-brand-500 ring-2 ring-brand-100 scale-[1.02] shadow-lg' : 'border-gray-100'}`}>
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
                                <div className="w-14 shrink-0 border-r border-gray-100 bg-gray-50/50" />
                                <div className="flex-1 relative">
                                    {timelineTicks.map(min => (
                                        <div key={min} className="absolute top-0 bottom-0 border-l border-gray-100 flex flex-col justify-end pb-2" style={{ left: minToPercent(min) }}>
                                            {min % 60 === 0 && <span className="text-[10px] font-black text-gray-400 absolute bottom-3 -left-3 uppercase tracking-tighter">{Math.floor(min/60)}H</span>}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="relative flex-1 bg-white overflow-hidden">
                                <div className="absolute inset-0 left-14 pointer-events-none z-0">
                                    {timelineTicks.map(min => (
                                        <div key={min} className={`absolute top-0 bottom-0 border-l ${min%60===0 ? 'border-gray-200' : 'border-gray-100 border-dashed'} opacity-40`} style={{ left: minToPercent(min) }} />
                                    ))}
                                </div>

                                {Array.from({length: Math.max(12, (todaySchedules.length > 0 ? Math.max(...todaySchedules.map(s => s.rowIdx ?? 0)) : 0) + 4)}).map((_, rowIdx) => {
                                    const rowScheds = todaySchedules.filter(s => (s.rowIdx || 0) === rowIdx);
                                    const rowGhosts = fixedTemplates.filter(ft => ft.rowIdx === rowIdx && !rowScheds.some(rs => rs.startTime === ft.startTime && rs.endTime === ft.endTime));
                                    const allRowShifts = [...rowScheds, ...rowGhosts];
                                    const isAnyFixed = allRowShifts.some(s => s.isFixed);

                                    return (
                                        <div key={rowIdx} className="h-16 relative border-b border-gray-100 group">
                                            <div className="absolute top-0 bottom-0 left-0 w-14 bg-gray-50/30 border-r border-gray-100 flex flex-col items-center justify-center z-40 sticky left-0">
                                                <input type="checkbox" className="w-4 h-4 rounded-none border-gray-300 text-brand-600 focus:ring-0 cursor-pointer accent-brand-600"
                                                       checked={isAnyFixed} 
                                                       onChange={() => {
                                                            const willFixed = !isAnyFixed;
                                                            if (allRowShifts.length === 0 && willFixed) {
                                                                const tplId = `tpl-row-${rowIdx}-${Date.now()}`;
                                                                syncScheduleToDB({ id: `shift-${Date.now()}`, date: dayDateString, startTime: '08:00', endTime: '12:00', rowIdx, isFixed: true, templateId: tplId, staffIds: [], name: `Ca ${rowIdx+1}`, color: COLORS[rowIdx % COLORS.length] });
                                                            } else {
                                                                allRowShifts.forEach(sh => {
                                                                    const tplId = sh.templateId || `tpl-row-${rowIdx}-${Date.now()}`;
                                                                    syncScheduleToDB({ ...sh, isFixed: willFixed, templateId: willFixed ? tplId : null });
                                                                });
                                                            }
                                                       }} />
                                                <span className="text-[9px] font-black text-gray-400 mt-1 uppercase tracking-widest">C{rowIdx+1}</span>
                                            </div>

                                            <div data-type="grid-row" className="absolute inset-y-0 left-14 right-0 cursor-crosshair hover:bg-gray-50/50 z-20"
                                                 onMouseDown={(e) => handleInputStartGrid(e, rowIdx)} onTouchStart={(e) => handleInputStartGrid(e, rowIdx)} />
                                            
                                            <div className="absolute inset-y-0 left-14 right-0 pointer-events-none z-30">
                                                {rowGhosts.map(ghost => (
                                                    <div key={ghost.id} className="absolute top-2 bottom-2 border border-dashed border-gray-300 bg-gray-50/50 opacity-50 flex flex-col justify-center px-3 pointer-events-auto cursor-pointer"
                                                         onClick={(e) => { e.stopPropagation(); syncScheduleToDB({ ...ghost, date: dayDateString, id: `shift-${Date.now()}`, isFixed: true, staffIds: [] }); }}
                                                         style={{ left: minToPercent(timeStrToMin(ghost.startTime)), width: minDurationToPercent(timeStrToMin(ghost.startTime), timeStrToMin(ghost.endTime)) }}>
                                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest truncate">{ghost.name} (CỐ ĐỊNH)</span>
                                                        <span className="text-[9px] font-bold text-gray-400">{ghost.startTime} - {ghost.endTime}</span>
                                                    </div>
                                                ))}
                                                {rowScheds.map(sched => renderBar(sched))}
                                                {dragState.active && dragState.mode === 'create' && dragState.rowIdx === rowIdx && renderGhostBar()}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {viewMode === 'week' && (
                        <div className="w-full h-full flex flex-col p-6 bg-[#fafafa]">
                            <div className="grid grid-cols-7 gap-4">
                                {weekDays.map(d => {
                                    const ds = getVNDateStr(d);
                                    const isToday = ds === getVNDateStr();
                                    const dayScheds = schedules.filter(s => s.date === ds).sort((a,b) => timeStrToMin(a.startTime) - timeStrToMin(b.startTime));
                                    return (
                                        <div key={ds} className={`flex flex-col min-h-[600px] border ${isToday ? 'border-brand-500 bg-brand-50/5' : 'border-gray-100 bg-white'}`}>
                                            <div className="p-4 text-center border-b border-gray-50">
                                                <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${isToday ? 'text-brand-600' : 'text-gray-400'}`}>{d.toLocaleDateString('vi-VN', {weekday: 'long'})}</p>
                                                <p className={`text-3xl font-black ${isToday ? 'text-brand-600' : 'text-gray-900'}`}>{d.getDate()}</p>
                                            </div>
                                            <div className="flex-1 p-2 space-y-3 overflow-y-auto">
                                                {dayScheds.map(sh => (
                                                    <div key={sh.id} onClick={() => { setViewMode('day'); setCurrentDate(d); }} className="border border-gray-100 bg-white shadow-sm hover:shadow-md transition-all cursor-pointer overflow-hidden rounded-none">
                                                        <div className="h-1" style={{ backgroundColor: sh.color }}></div>
                                                        <div className="p-2 space-y-1">
                                                            <div className="flex justify-between items-start">
                                                                <span className="text-[10px] font-black text-gray-900 uppercase truncate">{sh.name}</span>
                                                                <span className="text-[9px] font-bold text-gray-400 bg-gray-50 px-1 py-0.5">{sh.startTime} - {sh.endTime}</span>
                                                            </div>
                                                            <div className="flex flex-wrap gap-1">
                                                                {(sh.staffIds || []).length > 0 ? sh.staffIds.map(id => (
                                                                    <span key={id} className="text-[9px] font-black text-brand-600 uppercase bg-brand-50 px-1.5 py-0.5 border border-brand-100">{staff.find(st => st.id === id)?.name}</span>
                                                                )) : <span className="text-[9px] font-black text-gray-300 uppercase italic">Trống</span>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </motion.section>
    );
};

export default SchedulesView;
