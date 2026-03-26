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
    const [expandedShiftIds, setExpandedShiftIds] = useState([]); // Track which shifts are expanded in Week View

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

    // Auto-clamp existing schedules when operational hours change
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
                
                // Clamp
                if (sm < safeStartMin) sm = safeStartMin;
                if (em > safeEndMin) em = safeEndMin;
                
                // Ensure min 30m duration if pushed too hard
                if (em - sm < 30) em = sm + 30;
                if (em > 1440) { em = 1440; sm = em - 30; }

                return { ...s, startTime: minToTimeStr(sm), endTime: minToTimeStr(em) };
            });
            
            // Batch update via helper logic (simulated by calling sync if necessary, but we do it directly for performance)
            fetch(`${SERVER_URL}/api/schedules`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated)
            }).then(() => refreshData());
        }
    }, [filterStartTime, filterEndTime]); // Only trigger when shop hours change

    // Helpers cho Date
    const getStartOfWeek = (d) => {
        const date = new Date(d);
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(date.setDate(diff));
    };

    const weekDays = useMemo(() => Array.from({ length: 7 }).map((_, i) => {
        const d = new Date(getStartOfWeek(currentDate)); d.setDate(d.getDate() + i); return d;
    }), [currentDate]);

    const dayDateString = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
    const todaySchedules = schedules.filter(s => s.date === dayDateString);

    const handlePrev = () => { const d = new Date(currentDate); d.setDate(d.getDate() - (viewMode === 'week' ? 7 : 1)); setCurrentDate(d); };
    const handleNext = () => { const d = new Date(currentDate); d.setDate(d.getDate() + (viewMode === 'week' ? 7 : 1)); setCurrentDate(d); };
    
    // Fixed Shift Templates (Universal models for recurring shifts)
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

    // API Sync with Global Fixed Sync support
    const syncScheduleToDB = async (sched) => {
        try {
            let list = [sched];
            
            // If it's a fixed shift, sync changes to all other days with same templateId
            if (sched.isFixed && sched.templateId) {
                // 1. Sync existing matches in loaded state
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

                // 2. Global Propagation: Create for +/- 30 days if not exists
                // This satisfies the "tạo sẵn" (pre-populate) requirement
                const now = new Date();
                const startDate = new Date(now); startDate.setDate(startDate.getDate() - 7);
                const endDate = new Date(now); endDate.setDate(endDate.getDate() + 45); // Limit for performance
                
                for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                    const ds = getVNDateStr(d);
                    // Check if a shift with this templateId already exists for this date
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
                            staffIds: [] // No staff assigned as requested
                        });
                    }
                }
            } else if (!sched.isFixed && sched.templateId) {
                // Untoggled: Remove fixed status globally or delete auto-generated ones
                const others = (schedules || []).filter(s => s.templateId === sched.templateId && s.id !== sched.id);
                const toUpdate = [];
                const toDeleteIds = [];

                [sched, ...others].forEach(s => {
                    if (s.staffIds && s.staffIds.length > 0) {
                        // Keep the shift but remove fixed status
                        toUpdate.push({ ...s, isFixed: false, templateId: null });
                    } else {
                        // Delete if it has no staff (likely auto-generated)
                        toDeleteIds.push(s.id);
                    }
                });

                list = toUpdate;
                // Execute deletions sequentially or via individual calls
                for (const id of toDeleteIds) {
                    await fetch(`${SERVER_URL}/api/schedules/${id}`, { method: 'DELETE' }).catch(err => console.warn('Delete failed', id, err));
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
        } catch(e) { 
            console.error('Lỗi lưu ca', e); 
        }
    };

    const deleteSchedule = async (id) => {
        if(!confirm('Xóa ca này?')) return;
        try {
            const res = await fetch(`${SERVER_URL}/api/schedules/${id}`, { method: 'DELETE' });
            if(res.ok) { setSchedules(prev => prev.filter(s => s.id !== id)); refreshData(); }
        } catch(e) { console.error(e); }
    };

    // --- TIMELINE DRAG LOGIC ---
    const [dragState, setDragState] = useState({ active: false, mode: null, rowIdx: null, id: null, startMin: 0, currentMin: 0, initialStartMin: 0, initialEndMin: 0, resizeEdge: null });

    const handleInputStartGrid = (e, rowIdx) => {
        if(e.type === 'mousedown' && e.button !== 0) return;
        if(e.target.dataset.type !== 'grid-row') return;
        const isTouch = e.type.startsWith('touch');
        if (isTouch && e.touches.length > 1) return; // Allow 2-finger scroll
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
        if (isTouch && e.touches.length > 1) return; // Allow 2-finger scroll
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
                    // CANCELLATION LOGIC: If second finger detected, kill the drag state immediately
                    // so the "ghost" shift disappears and native scroll takes over.
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
            
            // Calc final bounds
            if (dragState.mode === 'create') {
                const s1 = Math.min(dragState.startMin, dragState.currentMin);
                const s2 = Math.max(dragState.startMin, dragState.currentMin);
                sMin = globalSnapMin(s1);
                eMin = globalSnapMin(s2);
                
                // Safety Buffer Clamp
                sMin = Math.max(safeStartMin, sMin);
                eMin = Math.min(safeEndMin, eMin);

                if (eMin - sMin < 30) {
                    // Logic: Ignore very small "clicks" or "flicks" on touch devices
                    // to prevent accidental shift creation during scrolling.
                    if (Math.abs(dragState.currentMin - dragState.startMin) < 10) {
                        setDragState({ active: false, mode: null, rowIdx: null, id: null, startMin: 0, currentMin: 0 });
                        return;
                    }
                    eMin = sMin + 30; // min 30 min duration
                }
            } else if (dragState.mode === 'move') {
                const deltaMin = Math.round((dragState.currentMin - dragState.startMin) / 15) * 15;
                sMin = dragState.initialStartMin + deltaMin;
                dur = dragState.initialEndMin - dragState.initialStartMin;
                
                // Safety Buffer Clamp (keeping duration)
                if (sMin < safeStartMin) sMin = safeStartMin;
                if (sMin + dur > safeEndMin) sMin = safeEndMin - dur;
                
                eMin = sMin + dur;
            } else if (dragState.mode === 'resize') {
                const deltaMin = Math.round((dragState.currentMin - dragState.startMin) / 15) * 15;
                if (dragState.resizeEdge === 'left') {
                    sMin = dragState.initialStartMin + deltaMin;
                    eMin = dragState.initialEndMin;
                    
                    // Safety Buffer Clamp
                    sMin = Math.max(safeStartMin, sMin);

                    if(sMin > eMin - 30) sMin = eMin - 30;
                } else {
                    sMin = dragState.initialStartMin;
                    eMin = dragState.initialEndMin + deltaMin;
                    
                    // Safety Buffer Clamp
                    eMin = Math.min(safeEndMin, eMin);

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

            // Maintain existing staff assignments if moving/resizing
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
            
            // Optimistic Update UI
            if (!newSched.id) {
                setSchedules(prev => [...prev, { ...newSched, id: `temp-${Date.now()}` }]);
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

    // --- STAFF DRAG & TAP-TO-ASSIGN ---
    const handleStaffDragStart = (e, stId) => { e.dataTransfer.setData('staffId', stId); };
    
    // Logic gán qua Tap (iPad)
    const handleStaffTap = (stId) => {
        setSelectedStaffId(prev => prev === stId ? null : stId);
    };

    const handleShiftTapToAssign = async (schedId) => {
        if (!selectedStaffId) return;
        const sched = schedules.find(s => s.id === schedId);
        if (sched) {
            const currentIds = sched.staffIds || (sched.staffId ? [sched.staffId] : []);
            if (!currentIds.includes(selectedStaffId)) {
                const updated = { ...sched, staffIds: [...currentIds, selectedStaffId] };
                delete updated.staffId;
                delete updated.employeeId;
                setSchedules(prev => prev.map(s => s.id === updated.id ? updated : s));
                await syncScheduleToDB(updated);
            }
        }
        setSelectedStaffId(null); // Reset
    };

    // Logic kéo thả truyền thống (PC)
    const handleStaffDrop = async (e, schedId) => {
        e.preventDefault();
        const stId = e.dataTransfer.getData('staffId');
        if (!stId) return;
        const sched = schedules.find(s => s.id === schedId);
        if (sched) {
            const currentIds = sched.staffIds || (sched.staffId ? [sched.staffId] : []);
            if (!currentIds.includes(stId)) {
                const updated = { ...sched, staffIds: [...currentIds, stId] };
                delete updated.staffId;
                delete updated.employeeId;
                setSchedules(prev => prev.map(s => s.id === updated.id ? updated : s));
                await syncScheduleToDB(updated);
            }
        }
    };
    const removeStaffFromShift = async (sched, stId) => {
        const currentIds = sched.staffIds || (sched.staffId ? [sched.staffId] : []);
        const updated = { ...sched, staffIds: currentIds.filter(id => id !== stId) };
        delete updated.staffId;
        delete updated.employeeId;
        setSchedules(prev => prev.map(s => s.id === updated.id ? updated : s));
        await syncScheduleToDB(updated);
    };
    const handleStaffDragOver = (e) => e.preventDefault();

    // Visual Render Helpers
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
            <div className="absolute top-1 bottom-1 bg-brand-500/50 border-2 border-dashed border-brand-500 rounded-sm pointer-events-none z-50 flex items-center justify-center" style={{ left, width }}>
                <span className="bg-black/70 text-white text-[10px] font-black px-2 py-0.5 rounded shadow-lg">
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
                if(dragState.resizeEdge === 'left') { sM = dragState.initialStartMin + deltaMin; if(sM > eM - 30) sM = eM - 30; if(sM<0) sM=0; }
                else { eM = dragState.initialEndMin + deltaMin; if(eM < sM + 30) eM = sM + 30; if(eM>1440) eM=1440; }
            }
        }

        const left = minToPercent(sM);
        const width = minDurationToPercent(sM, eM);
        const currentStaffIds = sched.staffIds || (sched.staffId ? [sched.staffId] : []);
        const assignedStaffList = currentStaffIds.map(id => staff.find(st => st.id === id)).filter(Boolean);
        
        let isOvertime = false;
        assignedStaffList.forEach(st => {
            const stSchedules = todaySchedules.filter(s => {
                const sIds = s.staffIds || (s.staffId ? [s.staffId] : []);
                return sIds.includes(st.id);
            });
            const totalMin = stSchedules.reduce((acc, s) => acc + (timeStrToMin(s.endTime) - timeStrToMin(s.startTime)), 0);
            if (totalMin > (st.dailyLimit || 8) * 60) isOvertime = true; // hard requirement
        });

        return (
            <div 
                key={sched.id} 
                className={`absolute top-1.5 bottom-1.5 rounded-sm shadow-sm group z-30 transition-shadow pointer-events-auto
                            ${dragState.id === sched.id ? 'opacity-80 z-40 ring-4 ring-black/20' : 'hover:shadow-lg hover:z-40'}
                            ${selectedStaffId ? 'cursor-cell ring-2 ring-brand-500 ring-offset-1 animate-pulse' : ''}
                            ${isOvertime ? 'border-2 border-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.8)]' : ''}`}
                onMouseDown={(e) => {
                    if (selectedStaffId) {
                        e.stopPropagation();
                        handleShiftTapToAssign(sched.id);
                    } else {
                        handleInputStartBar(e, sched, null);
                    }
                }}
                onTouchStart={(e) => {
                    if (selectedStaffId) {
                        e.stopPropagation();
                        e.preventDefault(); // Tránh fire tiếp MouseEvent
                        handleShiftTapToAssign(sched.id);
                    } else {
                        handleInputStartBar(e, sched, null);
                    }
                }}
                onDragOver={handleStaffDragOver}
                onDrop={(e) => handleStaffDrop(e, sched.id)}
                style={{ left, width, backgroundColor: sched.color }}
            >
                {/* Left Resizer (iPad optimized) */}
                <div className="absolute -left-3 top-0 bottom-0 w-6 cursor-ew-resize hover:bg-black/20 flex flex-col items-center justify-center z-[60] bg-transparent opacity-80 hover:opacity-100 transition-opacity block"
                     onMouseDown={(e) => handleInputStartBar(e, sched, 'left')}
                     onTouchStart={(e) => handleInputStartBar(e, sched, 'left')}
                >
                     <div className="w-1 h-4 bg-white/90 border border-black/20 rounded-full drop-shadow"></div>
                </div>
                
                {/* Content */}
                <div className="h-full px-3 py-2 flex flex-col justify-between overflow-hidden pointer-events-none opacity-95 backdrop-blur-sm">
                    <div className="flex justify-between items-start w-full">
                        <span className="text-[15px] font-black text-white drop-shadow-md truncate tracking-tight leading-none">{minToTimeStr(sM)} - {minToTimeStr(eM)}</span>
                        {isOvertime && <AlertTriangle size={16} className="text-red-200" />}
                    </div>
                    {assignedStaffList.length > 0 ? (
                        <div className="flex flex-wrap justify-end gap-2 mt-auto pointer-events-auto w-full">
                            {assignedStaffList.map(st => (
                                <span key={st.id} className="text-[14px] font-black text-white bg-black/25 border border-white/30 shadow-none px-3 py-1.5 rounded-none flex items-center gap-1.5 drop-shadow-sm select-none transition-transform hover:scale-105"
                                      onMouseDown={(e) => { e.stopPropagation(); removeStaffFromShift(sched, st.id); }}
                                      onTouchStart={(e) => { e.stopPropagation(); removeStaffFromShift(sched, st.id); }}
                                    onClick={(e) => { e.stopPropagation(); removeStaffFromShift(sched, st.id); }}
                                >
                                    {st.name}
                                    <X size={15} strokeWidth={3} className="text-white/80 hover:text-red-400 ml-1 cursor-pointer" />
                               </span>
                            ))}
                        </div>
                    ) : (
                        <span className="text-[12px] font-bold text-white/60 italic uppercase truncate mt-auto text-right pointer-events-none drop-shadow-sm">Trống</span>
                    )}
                </div>

                {/* Right Resizer (iPad optimized) */}
                <div className="absolute -right-3 top-0 bottom-0 w-6 cursor-ew-resize hover:bg-black/20 flex flex-col items-center justify-center z-[60] bg-transparent opacity-80 hover:opacity-100 transition-opacity block"
                     onMouseDown={(e) => handleInputStartBar(e, sched, 'right')}
                     onTouchStart={(e) => handleInputStartBar(e, sched, 'right')}
                >
                     <div className="w-1 h-4 bg-white/90 border border-black/20 rounded-full drop-shadow"></div>
                </div>
                
                {/* Delete Btn - Always visible on iPad to avoid hover limit */}
                <button 
                        onMouseDown={(e) => e.stopPropagation()} 
                        onTouchStart={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); deleteSchedule(sched.id); }} 
                        className="absolute -top-3 -right-3 bg-red-100 text-red-500 hover:bg-red-500 hover:text-white border border-red-200 rounded-none shadow-md z-[60] cursor-pointer opacity-90 hover:opacity-100 transition-opacity flex items-center justify-center"
                        style={{ width: '22px', height: '22px' }}
                >
                    <X size={14} strokeWidth={3}/>
                </button>
            </div>
        );
    };

    return (
        <motion.section 
            initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} 
            className="h-[calc(100vh-140px)] flex flex-col pt-0 pb-0" 
        >
            {/* Toolbars */}
            <div className="flex items-center justify-between px-6 py-2.5 bg-white z-10 sticky top-0 border-b border-gray-100 shrink-0">
                <div className="flex items-center gap-2">
                    <div className="flex bg-gray-100 p-1 rounded-none border border-gray-200/50 shadow-inner">
                        <button onClick={() => setViewMode('day')} className={`px-5 py-2 text-[11px] font-black uppercase tracking-widest transition-all ${viewMode === 'day' ? 'bg-white shadow-sm pointer-events-none text-gray-900 rounded-none border border-gray-200/50 scale-100' : 'text-gray-400 hover:text-gray-900 hover:bg-gray-200/50 scale-95'}`}>Ngày (24H)</button>
                        <button onClick={() => setViewMode('week')} className={`px-5 py-2 text-[11px] font-black uppercase tracking-widest transition-all ${viewMode === 'week' ? 'bg-white shadow-sm pointer-events-none text-gray-900 rounded-none border border-gray-200/50 scale-100' : 'text-gray-400 hover:text-gray-900 hover:bg-gray-200/50 scale-95'}`}>Tổng Tuần</button>
                    </div>

                    {viewMode === 'day' && (
                        <div className="flex items-center gap-2 bg-gray-50/50 border border-gray-100 rounded px-3 py-1.5 h-[34px]">
                            <Clock size={12} className="text-gray-400"/>
                            <input type="time" value={filterStartTime} onChange={e => setFilterStartTime(e.target.value)} className="text-[10px] font-black text-gray-900 bg-transparent outline-none w-14 uppercase tracking-widest" title="Bắt đầu" />
                            <span className="text-gray-300">-</span>
                            <input type="time" value={filterEndTime} onChange={e => setFilterEndTime(e.target.value)} className="text-[10px] font-black text-gray-900 bg-transparent outline-none w-14 uppercase tracking-widest" title="Kết thúc" />
                        </div>
                    )}
                </div>

                {/* Date nav */}
                <div className="flex items-center bg-gray-50/50 rounded border border-gray-100 h-[34px]">
                    <button onClick={handlePrev} className="px-3 h-full hover:bg-white text-gray-400 hover:text-gray-900 transition-colors border-r border-gray-100 flex items-center justify-center rounded-l"><ArrowLeft size={14}/></button>
                    <div className="px-5 font-black text-[10px] text-gray-900 uppercase tracking-widest min-w-[150px] text-center">
                        {viewMode === 'week' ? `Tuần ${weekDays[0].getDate()}/${weekDays[0].getMonth()+1}` : currentDate.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                    </div>
                    <button onClick={handleNext} className="px-3 h-full hover:bg-white text-gray-400 hover:text-gray-900 transition-colors border-l border-gray-100 flex items-center justify-center rounded-r"><ArrowRight size={14}/></button>
                </div>
            </div>

            {/* Main Workspace */}
            <div className="flex-1 flex overflow-hidden">
                
                {/* Available Staff Sidebar */}
                <div className="w-[260px] bg-white border-r border-gray-100 flex flex-col z-20 pb-8 overflow-y-auto shrink-0 shadow-[2px_0_10px_rgba(0,0,0,0.02)]">
                    <div className="px-5 py-4 border-b border-gray-100 bg-white sticky top-0 z-10 flex flex-col gap-1.5">
                        <p className="font-black text-xs uppercase text-gray-900 tracking-widest flex items-center gap-2"><Users size={14} className="text-gray-400"/> Phân Bổ Nhân Sự</p>
                        <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest leading-relaxed">
                            Quét trên lưới trống để tạo ca
                            <br/>iPad: Bấm tên nhân sự → Bấm vào ca.
                            <br/>PC: Kéo thả nhân sự vào ca.
                        </p>
                    </div>
                    <div className="p-4 space-y-3">
                        {staff.map(st => {
                            // Cảnh báo nếu đã quá limit
                            const stSchedules = todaySchedules.filter(s => {
                                const sIds = s.staffIds || (s.staffId ? [s.staffId] : []);
                                return sIds.includes(st.id);
                            });
                            const totalMin = stSchedules.reduce((acc, s) => acc + (timeStrToMin(s.endTime) - timeStrToMin(s.startTime)), 0);
                            const limitMin = (st.dailyLimit || 8)*60;
                            const isMaxed = totalMin >= limitMin;
                            
                            // Lọc các màu sắc ca làm duy nhất
                            const shiftColors = [...new Set(stSchedules.map(s => s.color))];

                            return (
                                <div key={st.id} 
                                     draggable 
                                     onDragStart={(e) => handleStaffDragStart(e, st.id)}
                                     onClick={() => handleStaffTap(st.id)}
                                     className={`bg-white rounded border cursor-grab hover:shadow-md transition-all flex active:cursor-grabbing overflow-hidden shadow-sm touch-manipulation
                                                 ${selectedStaffId === st.id ? 'border-brand-500 ring-4 ring-brand-100 scale-[1.02] shadow-brand-500/20 z-10 relative' : 'border-gray-100 hover:border-brand-400'}`}>
                                    <div className="w-1.5 flex flex-col shrink-0">
                                        {shiftColors.length > 0 ? shiftColors.map((color, idx) => (
                                            <div key={idx} className="flex-1" style={{ backgroundColor: color }}></div>
                                        )) : <div className="flex-1 bg-gray-100"></div>}
                                    </div>
                                    <div className="flex-1 p-3 flex flex-col justify-center">
                                        <div className="flex items-center justify-between mb-0.5">
                                            <span className="font-black text-xs text-gray-900 uppercase tracking-widest truncate mr-2">{st.name}</span>
                                            {isMaxed && <span className="text-[8px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded-sm font-black tracking-widest shadow-sm">FULL</span>}
                                        </div>
                                        <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest truncate">{st.role} • XẾP: {Math.round(totalMin/60*10)/10}H / {limitMin/60}H</span>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Timeline Grid Space */}
                <div className="flex-1 overflow-auto bg-[#f8fafc] relative hide-scroll-indicator" ref={gridRef}>
                    {viewMode === 'day' && (
                        <div className="w-full min-w-[800px] flex flex-col min-h-full">
                            {/* X-Axis Header */}
                            <div className="h-10 border-b border-gray-100 flex sticky top-0 z-40 bg-white/95 backdrop-blur shadow-sm shrink-0">
                                <div className="w-12 shrink-0 border-r border-gray-100 bg-gray-50/30" />
                                <div className="flex-1 relative">
                                    {timelineTicks.map(min => {
                                        const hrs = Math.floor(min / 60);
                                        const mins = min % 60;
                                        const left = minToPercent(min);
                                        return (
                                            <div key={min} className="absolute top-0 bottom-0 border-l border-gray-100 flex flex-col justify-end pb-1" style={{ left }}>
                                                {mins === 0 && <span className="text-[10px] font-black text-gray-500 absolute bottom-2 -left-[14px] z-10 bg-white/50 px-1 leading-none break-keep w-8 text-center">{hrs}H</span>}
                                                {mins !== 0 && <span className="text-[8px] font-bold text-gray-300 absolute bottom-0 -left-2 z-10 transform scale-75">{mins}</span>}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Y-Axis Rows (Ca 1, Ca 2...) */}
                            <div className="relative flex-1 bg-[#fcfcfc] overflow-hidden">
                                {/* Grid Canvas Background */}
                                <div className="absolute inset-0 left-12 pointer-events-none z-0">
                                    {timelineTicks.map(min => {
                                        const left = minToPercent(min);
                                        return <div key={min} className={`absolute top-0 bottom-0 border-l ${min%60===0 ? 'border-gray-200' : 'border-gray-100 border-dashed'} opacity-50`} style={{ left }} />
                                    })}
                                </div>

                                {/* Dynamic Rows */}
                                {Array.from({length: Math.max(10, (todaySchedules.length > 0 ? Math.max(...todaySchedules.map(s => s.rowIdx ?? -1)) : -1) + 3)}).map((_, rowIdx) => {
                                    const rowScheds = todaySchedules.filter(s => (s.rowIdx || 0) === rowIdx);
                                    
                                    // Ghost Shifts for Fixed Templates that are NOT yet populated for today
                                    const rowGhosts = fixedTemplates.filter(ft => (ft.rowIdx || 0) === rowIdx && !rowScheds.some(rs => rs.startTime === ft.startTime && rs.endTime === ft.endTime));

                                    const isOccupied = rowScheds.length > 0;
                                    const hasVisibleShift = rowScheds.some(s => timeStrToMin(s.endTime) > displayStartMin && timeStrToMin(s.startTime) < displayEndMin);

                                    return (
                                        <div key={rowIdx} className="h-16 relative border-b border-gray-100 group">
                                            <div className="absolute top-0 bottom-0 left-0 w-12 bg-gray-50/50 border-r border-gray-100 flex flex-col items-center justify-center z-40 transition-colors group-hover:bg-brand-50/40 shadow-[1px_0_3px_rgba(0,0,0,0.01)] sticky left-0">
                                                <input 
                                                    type="checkbox"
                                                    className="w-4 h-4 rounded-none border-gray-300 text-amber-500 focus:ring-0 cursor-pointer accent-amber-500"
                                                    checked={!!(rowScheds.find(s => s.isFixed) || rowGhosts.length > 0)}
                                                    onChange={() => {
                                                         const target = rowScheds[0] || rowGhosts[0];
                                                         if (!target) return;
                                                         const isTargetFixed = !!(rowScheds.find(s => s.isFixed) || rowGhosts.length > 0);
                                                         const willFixed = !isTargetFixed;
                                                         
                                                         // CRITICAL: Look for an EXISTING templateId for this ROW elsewhere in the schedules
                                                         const existingTplId = (schedules || []).find(s => s.rowIdx === rowIdx && s.isFixed && s.templateId)?.templateId;
                                                         const tplId = target.templateId || existingTplId || `tpl-row-${rowIdx}-${Date.now()}`;
                                                         
                                                         syncScheduleToDB({ 
                                                             ...target, 
                                                             id: target.id || `shift-${Date.now()}`,
                                                             date: dayDateString, 
                                                             isFixed: willFixed, 
                                                             templateId: willFixed ? tplId : undefined 
                                                         });
                                                     }}
                                                    title="Cố định dòng này (Mọi thay đổi sẽ đồng bộ sang các ngày khác)"
                                                />
                                                <span className="text-[9px] font-black text-gray-400 tracking-widest mt-1">C{rowIdx+1}</span>
                                            </div>

                                            {/* Interactive Catch Area */}
                                            {!isOccupied && rowGhosts.length === 0 && (
                                                <div data-type="grid-row" className="absolute inset-y-0 left-12 right-0 cursor-crosshair hover:bg-brand-50/30 transition-colors z-20"
                                                     onMouseDown={(e) => handleInputStartGrid(e, rowIdx)}
                                                     onTouchStart={(e) => handleInputStartGrid(e, rowIdx)} />
                                            )}

                                            {/* Off-screen Warning Badge */}
                                            {isOccupied && !hasVisibleShift && (
                                                <div className="absolute inset-y-0 left-14 flex items-center z-10 opacity-50 pointer-events-none">
                                                    <span className="text-[10px] font-bold text-red-500 italic bg-red-50/80 px-2 py-0.5 rounded border border-red-100">
                                                        🔒 Có ca nằm ngoài khung giờ
                                                    </span>
                                                </div>
                                            )}
                                            
                                            {/* Render Schedules and Ghost Templates on this row */}
                                            <div className="absolute inset-y-0 left-12 right-0 pointer-events-none z-30">
                                                {/* Ghosts first */}
                                                {rowGhosts.map(ghost => {
                                                    const sM = timeStrToMin(ghost.startTime);
                                                    const eM = timeStrToMin(ghost.endTime);
                                                    const left = minToPercent(sM);
                                                    const width = minDurationToPercent(sM, eM);
                                                    return (
                                                        <div 
                                                            key={`ghost-${ghost.id}`}
                                                            className="absolute top-1.5 bottom-1.5 border-2 border-dashed border-gray-300 bg-gray-100/20 rounded-none opacity-40 hover:opacity-100 transition-all cursor-copy flex flex-col justify-center px-3 z-10 pointer-events-auto"
                                                            style={{ left, width }}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                // Use the same templateId to stay in sync!
                                                                syncScheduleToDB({ ...ghost, date: dayDateString, id: undefined, staffIds: [], isFixed: true, templateId: ghost.templateId });
                                                            }}
                                                        >
                                                            <div className="flex items-center gap-1">
                                                                <Anchor size={10} className="text-amber-500"/>
                                                                <span className="text-[10px] font-black text-gray-500 uppercase truncate">{ghost.name}</span>
                                                            </div>
                                                            <span className="text-[9px] font-bold text-gray-400">{ghost.startTime} - {ghost.endTime}</span>
                                                            <div className="absolute inset-0 bg-white/40 -z-10"></div>
                                                        </div>
                                                    );
                                                })}
                                                {rowScheds.map(sched => renderBar(sched))}
                                            </div>

                                            {/* Render Drag Creation Ghost */}
                                            {dragState.active && dragState.mode === 'create' && dragState.rowIdx === rowIdx && (
                                                <div className="absolute inset-y-0 left-12 right-0 pointer-events-none z-50">
                                                    {renderGhostBar()}
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {viewMode === 'week' && (() => {
                        const getDurationHours = (start, end) => {
                            if (!start || !end) return 4;
                            const [h1, m1] = start.split(':').map(Number);
                            const [h2, m2] = end.split(':').map(Number);
                            let d = (h2 + m2/60) - (h1 + m1/60);
                            if (d < 0) d += 24;
                            return d;
                        };
                        return (
                            <div className="w-full h-full flex flex-col p-4 bg-[#f8f9fa]">
                                <div className="grid grid-cols-7 gap-6">
                                    {weekDays.map(d => {
                                        const dateStr = getVNDateStr(d);
                                        const isToday = dateStr === getVNDateStr();
                                        const groupedShifts = schedules
                                            .filter(s => s.date === dateStr)
                                            .sort((a, b) => timeStrToMin(a.startTime) - timeStrToMin(b.startTime));
                                        
                                        return (
                                            <div key={dateStr} className={`flex flex-col min-h-[500px] overflow-visible transition-all duration-300 rounded-none ${isToday ? 'border-[1px] border-brand-500/30 bg-brand-50/10 relative pt-1' : 'bg-transparent border-[1px] border-transparent pt-1'}`}>
                                                <div className="p-3 text-center pb-2 mb-2 relative">
                                                    {isToday && <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-brand-500 text-white text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-none shadow-sm">Hôm Nay</div>}
                                                    <p className={`text-[9px] font-bold uppercase tracking-[0.15em] mb-1 mt-3 ${isToday ? 'text-brand-600' : 'text-gray-400'}`}>
                                                        {d.toLocaleDateString('vi-VN', {weekday: 'long'})}
                                                    </p>
                                                    <h3 className={`font-serif text-[32px] ${isToday ? 'text-brand-600' : 'text-gray-900'} leading-none tracking-tight`}>
                                                        {d.getDate()}
                                                    </h3>
                                                    {isToday && <div className="w-10 h-1.5 bg-brand-500 mx-auto mt-3 rounded-none opacity-0"></div>}
                                                </div>
                                                
                                                <div className="flex-1 flex flex-col gap-4 overflow-y-auto px-2 py-2">
                                                    {groupedShifts.map(sh => {
                                                        const ids = sh.staffIds || (sh.staffId ? [sh.staffId] : []);
                                                        const isExpanded = expandedShiftIds.includes(sh.id);
                                                        const staffList = ids.map(id => staff.find(st => st.id === id)).filter(Boolean);
                                                        const isTrong = staffList.length === 0;
                                                        
                                                        // minHeight based on staff count
                                                        let minHeight = 80;
                                                        if (staffList.length === 2) minHeight = 110;
                                                        if (staffList.length >= 3) minHeight = 140;
                                                        if (isTrong) minHeight = 60;
                                                        if (isExpanded) minHeight = Math.max(minHeight, staffList.length * 32 + 50);

                                                        const isHighlighted = selectedStaffId && ids.includes(selectedStaffId);
                                                        const isDimmed = selectedStaffId && !ids.includes(selectedStaffId);
                                                        
                                                        const toggleExpand = (e) => {
                                                            e.stopPropagation();
                                                            setExpandedShiftIds(prev => 
                                                                prev.includes(sh.id) ? prev.filter(id => id !== sh.id) : [...prev, sh.id]
                                                            );
                                                        };

                                                        return (
                                                            <div key={sh.id} 
                                                                 onClick={() => handleShiftTapToAssign(sh.id)}
                                                                 className={`rounded-none transition-all duration-300 cursor-pointer flex flex-col overflow-hidden border border-black/5 bg-white
                                                                            ${isHighlighted ? 'ring-4 ring-brand-500/80 z-50 scale-[1.01] shadow-2xl brightness-110 !opacity-100' : ''}
                                                                            ${isDimmed ? 'opacity-15 grayscale-[0.9] scale-[0.98]' : 'opacity-100'}
                                                                            ${!selectedStaffId ? 'hover:-translate-y-1 hover:shadow-lg' : ''}`}
                                                                 style={{ minHeight: `${minHeight}px` }}>
                                                                {/* Header: Color Band with Name and Time */}
                                                                <div className="px-2 py-1 flex justify-between items-center shrink-0 border-b border-black/5" style={{ backgroundColor: sh.color || '#f97316' }}>
                                                                    <span className="text-[10px] font-black text-white uppercase tracking-tight leading-none drop-shadow-sm truncate">{sh.name}</span>
                                                                    <span className="text-[9px] font-bold text-white bg-black/10 px-1.5 py-0.5 rounded-sm whitespace-nowrap shrink-0 ml-1">{sh.startTime} - {sh.endTime}</span>
                                                                </div>
                                                                
                                                                {/* Card Body: Staff List */}
                                                                <div className="p-2 py-2.5 flex flex-col flex-1 bg-gray-50/20 justify-center">
                                                                    <div className="flex flex-col gap-1.5 items-center justify-center">
                                                                        {isTrong ? (
                                                                            <span className="text-[12px] font-black uppercase italic opacity-20 text-gray-400">TRỐNG</span>
                                                                        ) : (
                                                                            <>
                                                                                {(isExpanded ? staffList : staffList.slice(0, 3)).map((st, idx) => (
                                                                                    <div key={st.id} className="w-full flex justify-center">
                                                                                        <span className="text-[12px] font-black uppercase tracking-tight text-center px-2 py-0.5 border border-black/5 bg-white shadow-sm" style={{ color: sh.color || '#f97316' }}>
                                                                                            {st.name}
                                                                                        </span>
                                                                                    </div>
                                                                                ))}
                                                                                {staffList.length > 3 && !isExpanded && (
                                                                                    <button 
                                                                                        onClick={toggleExpand}
                                                                                        className="mt-1 text-[9px] font-black uppercase tracking-widest text-brand-600 bg-brand-50 px-2 py-1 border border-brand-100 animate-pulse"
                                                                                    >
                                                                                        + {staffList.length - 3} Nhân Viên
                                                                                    </button>
                                                                                )}
                                                                                {isExpanded && staffList.length > 3 && (
                                                                                    <button 
                                                                                        onClick={toggleExpand}
                                                                                        className="mt-1 text-[9px] font-black uppercase tracking-widest text-gray-400 bg-gray-100 px-2 py-1 border border-gray-200"
                                                                                    >
                                                                                        Thu Gọn
                                                                                    </button>
                                                                                )}
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                    {groupedShifts.length === 0 && (
                                                        <div className="flex flex-col items-center justify-center flex-1 h-32 opacity-40">
                                                            <div className="w-12 h-1 bg-gray-200 rounded-full mb-4"></div>
                                                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Trống lịch</p>
                                                        </div>
                                                    )}
                                                </div>
                                                
                                                <div className="pt-4 pb-2 mt-auto">
                                                    <button onClick={() => { setViewMode('day'); setCurrentDate(d); }} 
                                                            className="w-full py-3 rounded-none border border-gray-300 text-gray-500 hover:border-brand-500 hover:text-brand-600 hover:bg-white transition-all text-[11px] font-bold uppercase tracking-[0.15em] bg-transparent">
                                                        Xem chi tiết (24H)
                                                    </button>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        );
                    })()}
                </div>
            </div>
        </motion.section>
    );
};

export default SchedulesView;

