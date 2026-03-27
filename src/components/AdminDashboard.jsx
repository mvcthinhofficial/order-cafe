import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, Clock, Star, Play, Square } from 'lucide-react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { SERVER_URL, getImageUrl } from '../api';
import {
    ClipboardList, CheckCircle, Share2, ClipboardCheck,
    Settings, BarChart3, Package, XCircle, Plus, Edit2, Trash2,
    Save, X, Info, DollarSign, ShoppingCart, MessageSquare,
    ChevronDown, ChevronUp, AlertTriangle, LayoutGrid, List,
    ShoppingBag, Minus, CheckCircle2, Search, Users, Table, FileUp, Pencil, QrCode, Wifi, Sparkles, Printer,
    ArrowDownLeft, ArrowUpRight, Database, Shield, Copy, Keyboard, Eye, EyeOff, Zap, LineChart, ListOrdered,
    ArrowUp, ArrowDown, RotateCcw, LogOut, UserRound, Key, BookOpen, KeyRound, ExternalLink, History, Camera, ArrowRightLeft, ArrowRight, Upload, Download, RefreshCw, TrendingDown, TrendingUp, Calculator, Gift, PieChart, GripVertical, Lock, Merge, Rocket, Award
} from 'lucide-react';
import { ShortcutProvider, useShortcut, isInputFocused } from './ShortcutManager';
import VisualFlashOverlay from './VisualFlashOverlay';
import SchedulesView from './SchedulesView';
import { calculateCartWithPromotions } from '../utils/promotionEngine';
import { generateTheme, applyTheme } from '../utils/themeEngine';
import { QRCodeCanvas } from 'qrcode.react';
import './AdminDashboard.css';
export const getSortedCategories = (menu, settings) => {
    const uniqueCats = [...new Set(menu.filter(m => !m.isDeleted).map(i => i.category))];
    const order = settings?.menuCategories || [];
    return uniqueCats.sort((a, b) => {
        const idxA = order.indexOf(a);
        const idxB = order.indexOf(b);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.localeCompare(b);
    });
};

const formatVND = (price) => {
    const num = parseFloat(price);
    if (isNaN(num)) return '0 ₫';
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num * 1000);
};

// Helper for semver comparison (v1.0.1 > v1.0.0)
const isNewerVersion = (latest, current) => {
    if (!latest || !current) return false;
    const parse = v => v.toString().replace(/^v/, '').split('.').map(num => parseInt(num) || 0);
    const [lMajor, lMinor, lPatch] = parse(latest);
    const [cMajor, cMinor, cPatch] = parse(current);

    if (lMajor > cMajor) return true;
    if (lMajor < cMajor) return false;

    if (lMinor > cMinor) return true;
    if (lMinor < cMinor) return false;

    return lPatch > cPatch;
};

// Helper for Vietnam Time (GMT+7)
const getVNTime = (date = new Date()) => new Date(date.getTime() + 7 * 3600 * 1000);
const getVNDateStr = (date = new Date()) => getVNTime(date).toISOString().split('T')[0];

const getLogOrderId = (log) => {
    if (!log) return '';
    const idStr = (log.orderId || log.id || '').toString();

    // Nếu đã đúng định dạng 10 số TTTTDDMMYY (chuẩn mới)
    if (/^\d{10}$/.test(idStr)) {
        return idStr;
    }

    // Nếu có queueNumber (đã gán từ server hoặc POS)
    if (log.queueNumber && log.timestamp) {
        const d = new Date(log.timestamp);
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yy = String(d.getFullYear()).slice(-2);
        const tttt = String(log.queueNumber).padStart(4, '0');
        return `${tttt}${dd}${mm}${yy}`;
    }

    return '---';
};

const BIN_MAP = {
    '970436': 'VCB', '970422': 'MB', '970407': 'TCB', '970415': 'VietinBank',
    '970418': 'BIDV', '970416': 'ACB', '970423': 'TPBank', '970432': 'VPBank',
    '970441': 'VIB', '970405': 'Agribank', '970429': 'SCB', '970448': 'OCB',
    '970437': 'HDBank', '970428': 'NamABank', '970454': 'VietCapitalBank',
    '970403': 'Sacombank'
};

const parseVietQR = (content) => {
    if (!content || !content.startsWith('000201')) return null;
    try {
        const fields = {};
        let idx = 0;
        while (idx < content.length) {
            const id = content.slice(idx, idx + 2);
            const len = parseInt(content.slice(idx + 2, idx + 4));
            const val = content.slice(idx + 4, idx + 4 + len);
            fields[id] = val;
            idx += 4 + len;
        }
        if (fields['38']) {
            const subContent = fields['38'];
            const subFields = {};
            let sIdx = 0;
            while (sIdx < subContent.length) {
                const sId = subContent.slice(sIdx, sIdx + 2);
                const sLen = parseInt(subContent.slice(sIdx + 2, sIdx + 4));
                const sVal = subContent.slice(sIdx + 4, sIdx + 4 + sLen);
                subFields[sId] = sVal;
                sIdx += 4 + sLen;
            }
            if (subFields['01']) {
                const pspContent = subFields['01'];
                const pspFields = {};
                let pIdx = 0;
                while (pIdx < pspContent.length) {
                    const pId = pspContent.slice(pIdx, pIdx + 2);
                    const pLen = parseInt(pspContent.slice(pIdx + 2, pIdx + 4));
                    const pVal = pspContent.slice(pIdx + 4, pIdx + 4 + pLen);
                    pspFields[pId] = pVal;
                    pIdx += 4 + pLen;
                }
                return {
                    bankId: BIN_MAP[pspFields['00']] || pspFields['00'],
                    accountNo: pspFields['01'],
                    accountName: fields['59'] || ''
                };
            }
        }
    } catch (e) {
        console.error("Lỗi phân tích VietQR:", e);
    }
    return null;
};

// ── Confirm unsaved dialog ──
const ConfirmDialog = ({ onSave, onDiscard, onCancel }) => {
    useEffect(() => {
        const handleEsc = (e) => {
            if ((e.key === 'Escape' || (e.key === 'Backspace' && !isInputFocused()))) onCancel();
        };
        window.addEventListener('keydown', handleEsc, { capture: true });
        return () => window.removeEventListener('keydown', handleEsc, { capture: true });
    }, [onCancel]);

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="bg-white  w-full max-w-md shadow-2xl relative z-10 p-8 text-center">
                <div className="bg-amber-50 w-14 h-14  flex items-center justify-center mx-auto mb-4">
                    <AlertTriangle size={26} className="text-amber-500" />
                </div>
                <h3 className="text-lg font-black text-gray-900 mb-2">Chưa lưu thay đổi</h3>
                <p className="text-sm text-gray-400 mb-7">Bạn có muốn lưu trước khi chuyển tab không?</p>
                <div className="flex gap-3">
                    <button onClick={onCancel} className="admin-btn-secondary h-[80px]">Ở lại</button>
                    <button onClick={onDiscard} className="flex-1 bg-red-50 text-red-500 py-5  font-black text-base hover:bg-red-100 transition-all">Bỏ</button>
                    <button onClick={onSave} className="admin-btn-primary h-[80px]">Lưu & đi</button>
                </div>
            </motion.div>
        </div>
    );
};

// ── Table Modal ──
const TableModal = ({ table, onSave, onClose, onDelete }) => {
    const [draft, setDraft] = useState(table || { name: '', area: 'Trong nhà', status: 'Available' });

    useEffect(() => {
        const handleEsc = (e) => {
            if ((e.key === 'Escape' || (e.key === 'Backspace' && !isInputFocused()))) onClose();
        };
        window.addEventListener('keydown', handleEsc, { capture: true });
        return () => window.removeEventListener('keydown', handleEsc, { capture: true });
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="admin-modal-container">
                <h3 className="font-black text-gray-900 uppercase tracking-widest text-sm text-center">Thông tin bàn</h3>
                <div className="space-y-6">
                    <div className="space-y-2">
                        <label className="admin-label">Tên bàn (Số bàn)</label>
                        <input autoFocus placeholder="VD: Bàn 01" className="admin-input"
                            value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                        <label className="admin-label">Khu vực / Tầng</label>
                        <input list="area-options" placeholder="VD: Sảnh lớn, Cổng sau..." className="admin-input"
                            value={draft.area} onChange={e => setDraft({ ...draft, area: e.target.value })} />
                        <datalist id="area-options">
                            <option value="Trong nhà" />
                            <option value="Sân vườn" />
                            <option value="Tầng 1" />
                            <option value="Tầng 2" />
                            <option value="Ban công" />
                        </datalist>
                    </div>
                </div>
                <div className="flex gap-3 pt-5 w-full">
                    {onDelete && draft.id && localStorage.getItem('userRole') === 'ADMIN' && (
                        <button onClick={() => onDelete(draft.id)} className="admin-btn-secondary flex-1 !bg-red-50 !text-red-500 !border-red-200 hover:!bg-red-100 uppercase tracking-widest text-xs">XÓA BÀN</button>
                    )}
                    <button onClick={onClose} className="admin-btn-secondary flex-1 uppercase tracking-widest text-xs">HỦY</button>
                    <button onClick={() => onSave(draft)} className="admin-btn-primary flex-1 uppercase tracking-widest text-xs">LƯU BÀN</button>
                </div>
            </motion.div>
        </div>
    );
};

// ── Table Action Modal ──
const TableActionModal = ({ table, onClose, onOrder, onUpdateStatus, onChangeTable }) => {
    useEffect(() => {
        const handleEsc = (e) => {
            if ((e.key === 'Escape' || (e.key === 'Backspace' && !isInputFocused()))) onClose();
        };
        window.addEventListener('keydown', handleEsc, { capture: true });
        return () => window.removeEventListener('keydown', handleEsc, { capture: true });
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} className="bg-white rounded-none w-full max-w-sm overflow-hidden shadow-2xl relative z-10 p-2">
                <div className="p-8 text-center border-b border-gray-50 bg-gray-50/50 rounded-none">
                    <div className={`w-20 h-20 flex items-center justify-center font-black text-2xl mx-auto mb-4 shadow-xl ${(table.computedStatus || table.status) === 'Occupied' ? 'bg-orange-100 text-orange-600' : (table.computedStatus || table.status) === 'Reserved' ? 'bg-brand-100 text-brand-600' : 'bg-gray-100 text-gray-400'}`}>
                        {table.name}
                    </div>
                    <h3 className="font-black text-gray-900 uppercase tracking-[4px] text-xs mb-1">{table.area}</h3>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{(table.computedStatus || table.status) === 'Occupied' ? 'ĐANG PHỤC VỤ' : (table.computedStatus || table.status) === 'Reserved' ? 'ĐÃ ĐẶT TRƯỚC' : 'BÀN TRỐNG'}</p>
                </div>
                <div className="p-6 space-y-3">
                    {table.activeOrder ? (
                        <div className="text-left border border-orange-200 rounded-none overflow-hidden shadow-sm bg-white">
                            <div className="bg-orange-50 px-4 py-2 border-b border-orange-200 flex justify-between items-center">
                                <span className="font-black text-orange-800 text-[10px] uppercase tracking-widest">CHI TIẾT ORDER</span>
                                <span className="font-bold text-orange-600 text-[10px]">{new Date(table.activeOrder.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <div className="p-4 space-y-3 max-h-[40vh] overflow-y-auto custom-scrollbar">
                                {(table.activeOrder.cartItems || []).map((c, idx) => (
                                    <div key={idx} className="flex flex-col text-sm border-b border-dashed border-gray-100 pb-3 last:border-0 last:pb-0">
                                        <div className="flex justify-between items-start">
                                            <div className="font-bold text-gray-800 pr-2 leading-tight">
                                                <span className="text-orange-600 mr-1.5 text-base">{c.count}x</span>{c.item?.name || c.name || 'Món'}
                                            </div>
                                            <div className="font-black text-gray-900 shrink-0">
                                                {formatVND(c.totalPrice * c.count)}
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-1 mt-1 pl-6">
                                            <span className="text-[10px] bg-gray-100 px-1.5 py-0.5 font-bold text-gray-600 rounded-none">S: {c.size?.label || 'S'}</span>
                                            {c.sugar && <span className="text-[10px] bg-amber-50 px-1.5 py-0.5 font-bold text-amber-700 rounded-none">Đường: {c.sugar}</span>}
                                            {c.ice && <span className="text-[10px] bg-brand-50 px-1.5 py-0.5 font-bold text-brand-700 rounded-none">Đá: {c.ice}</span>}
                                        </div>
                                        {c.note && <div className="text-xs font-medium italic text-gray-500 pl-6 mt-1 flex items-start gap-1"><span className="text-gray-400">Ghi chú:</span> <span className="text-red-500 break-words flex-1">"{c.note}"</span></div>}
                                    </div>
                                ))}
                            </div>
                            <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
                                <span className="text-[10px] text-gray-500 font-bold uppercase">Tổng cộng</span>
                                <span className="font-black text-base text-[#C68E5E]">{formatVND(table.activeOrder.price)}</span>
                            </div>
                            <button onClick={() => onOrder(table.activeOrder)} className="w-full py-4 bg-orange-500 text-white font-black text-sm uppercase tracking-widest hover:bg-orange-600 flex items-center justify-center gap-2 transition-all">
                                SỬA ĐƠN / THÊM MÓN <Edit2 size={18} />
                            </button>
                        </div>
                    ) : (
                        <button onClick={() => onOrder()} className="w-full flex items-center justify-between p-6 bg-brand-600 text-white rounded-none font-black text-base shadow-xl shadow-[#007AFF]/20 active:scale-95 transition-all uppercase tracking-widest">
                            TẠO ĐƠN MỚI <Plus size={24} />
                        </button>
                    )}
                    <div className="grid grid-cols-2 gap-5">
                        {table.activeOrder ? (
                            <>
                                <button onClick={() => onChangeTable(table.activeOrder)} className="p-5 bg-brand-50 text-brand-600 rounded-none font-black text-sm uppercase tracking-widest hover:bg-brand-100 active:scale-95 transition-all flex flex-col items-center justify-center gap-2">
                                    <ArrowRightLeft size={24} /> ĐỔI BÀN
                                </button>
                                <button onClick={() => onUpdateStatus('Available')} className="p-5 bg-gray-50 text-gray-400 rounded-none font-black text-sm uppercase tracking-widest hover:bg-gray-100 hover:text-gray-500 active:scale-95 transition-all flex flex-col items-center justify-center gap-2">
                                    <CheckCircle size={24} /> TRỐNG
                                </button>
                            </>
                        ) : (
                            <>
                                <button onClick={() => onUpdateStatus('Available')} className="p-5 bg-gray-50 text-gray-500 rounded-none font-black text-sm uppercase tracking-widest hover:bg-gray-100 active:scale-95 transition-all flex flex-col items-center justify-center gap-2">
                                    <CheckCircle size={24} /> TRỐNG
                                </button>
                                <button onClick={() => onUpdateStatus('Reserved')} className="p-5 bg-brand-50 text-brand-600 rounded-none font-black text-sm uppercase tracking-widest hover:bg-brand-100 active:scale-95 transition-all flex flex-col items-center justify-center gap-2">
                                    <Calendar size={24} /> ĐẶT TRƯỚC
                                </button>
                            </>
                        )}
                    </div>
                    <button onClick={onClose} className="w-full p-4 text-gray-300 font-black text-[10px] uppercase tracking-[5px] hover:text-gray-500 transition-all mt-2">ĐÓNG</button>
                </div>
            </motion.div>
        </div>
    );
};

// ── Fixed Costs & BEP Section ──
const FixedCostsSection = ({ costs, onUpdate, menu, inventoryStats, report, bepMode, setBepMode, shifts = [], staff = [], reportPeriod = 'month', expenses = [] }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [draft, setDraft] = useState(costs);
    const [selectedItem, setSelectedItem] = useState(null);

    // Helpers cho Benchmarks
    const getProgressBarColor = (key, percent) => {
        if (!percent) return 'bg-gray-200';
        switch (key) {
            case 'rent': return percent <= 8 ? 'bg-green-500' : percent <= 10 ? 'bg-amber-400' : 'bg-red-500';
            case 'salaries': return percent <= 20 ? 'bg-green-500' : percent <= 25 ? 'bg-amber-400' : 'bg-red-500';
            case 'electricity': return percent <= 2.2 ? 'bg-green-500' : percent <= 3 ? 'bg-amber-400' : 'bg-red-500';
            case 'water': return percent <= 0.5 ? 'bg-green-500' : percent <= 1 ? 'bg-amber-400' : 'bg-red-500';
            default: return 'bg-brand-400';
        }
    };

    const getStandardText = (key) => {
        switch (key) {
            case 'rent': return '< 8%';
            case 'salaries': return '< 20%';
            case 'electricity': return '~ 2.2%';
            case 'water': return '~ 0.5%';
            default: return '';
        }
    };

    // Calculate dynamic staff salaries based on 30 days window
    const calculateSalaries30Days = () => {
        const now = getVNTime();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const periodShifts = (shifts || []).filter(s => {
            if (!s.clockOut || !s.totalPay) return false;
            const date = new Date(s.clockIn);
            return date >= thirtyDaysAgo;
        });

        return periodShifts.reduce((sum, s) => {
            return sum + (s.totalPay || 0) * 1000;
        }, 0);
    };

    const getRevenueStats30 = () => {
        if (!report?.logs) return { projected30: 0, activeDays: 0, actualTotal: 0 };
        const now = getVNTime();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const validLogs = report.logs.filter(log => new Date(log.timestamp) >= thirtyDaysAgo && log.type === 'COMPLETED');
        if (validLogs.length === 0) return { projected30: 0, activeDays: 0, actualTotal: 0 };

        let totalRevenue = 0;
        const uniqueDays = new Set();

        validLogs.forEach(log => {
            const preTaxVal = log.orderData?.preTaxTotal || parseFloat(log.price) || 0;
            totalRevenue += preTaxVal;
            const dateStr = new Date(log.timestamp).toLocaleDateString();
            uniqueDays.add(dateStr);
        });

        const activeDays = uniqueDays.size;
        const projected30 = (totalRevenue / activeDays) * 30;

        return { projected30, activeDays, actualTotal: totalRevenue };
    };

    const dynamicSalaries30 = calculateSalaries30Days();
    const { projected30: actualRevenue30, activeDays: activeRevenueDays } = getRevenueStats30();

    // Tính Trung bình mỗi tháng (Tổng chi phí / Số tháng có phát sinh)
    const calculateAveragePerMonth = (filterFn) => {
        const filtered = (expenses || []).filter(e => e.date && filterFn(e));
        if (filtered.length === 0) return 0;
        const total = filtered.reduce((sum, e) => sum + Number(e.amount), 0);
        const uniqueMonths = new Set(filtered.map(e => {
            const d = new Date(e.date);
            return `${d.getFullYear()}-${d.getMonth()}`;
        })).size;
        return total / Math.max(1, uniqueMonths);
    };

    // Mặt bằng, Điện, Nước, Khác: Trung bình mỗi tháng (nhân 1000 để ra VNĐ thực, làm tròn đơn vị nghìn)
    const dynamicRent30 = Math.round(calculateAveragePerMonth(e => e.category === 'Mặt bằng (Cố định)')) * 1000;
    const dynamicElectricity30 = Math.round(calculateAveragePerMonth(e => e.category === 'Điện, Nước & Internet' && e.name?.toLowerCase().includes('điện'))) * 1000;
    const dynamicWater30 = Math.round(calculateAveragePerMonth(e => e.category === 'Điện, Nước & Internet' && e.name?.toLowerCase().includes('nước'))) * 1000;
    const dynamicOther30 = Math.round(calculateAveragePerMonth(e => e.category === 'Khác')) * 1000;

    // Máy móc & Đầu tư: Tính khấu hao 1 năm (Tổng đầu tư / 12 tháng)
    const dynamicMachines30 = Math.round((expenses || [])
        .filter(e => e.category === 'Đầu tư & Máy móc')
        .reduce((sum, e) => sum + Number(e.amount), 0) / 12) * 1000;

    const effectiveSalaries = isEditing
        ? (draft.useDynamicSalaries ? dynamicSalaries30 : (parseFloat(draft.salaries) * 1000 || 0))
        : (costs.useDynamicSalaries ? dynamicSalaries30 : (parseFloat(costs.salaries) * 1000 || 0));

    const effectiveRent = isEditing
        ? (draft.useDynamicRent ? dynamicRent30 : (parseFloat(draft.rent) * 1000 || 0))
        : (costs.useDynamicRent ? dynamicRent30 : (parseFloat(costs.rent) * 1000 || 0));

    const effectiveMachines = isEditing
        ? (draft.useDynamicMachines ? dynamicMachines30 : (parseFloat(draft.machines) * 1000 || 0))
        : (costs.useDynamicMachines ? dynamicMachines30 : (parseFloat(costs.machines) * 1000 || 0));

    const effectiveElectricity = isEditing
        ? (draft.useDynamicElectricity ? dynamicElectricity30 : (parseFloat(draft.electricity) * 1000 || 0))
        : (costs.useDynamicElectricity ? dynamicElectricity30 : (parseFloat(costs.electricity) * 1000 || 0));

    const effectiveWater = isEditing
        ? (draft.useDynamicWater ? dynamicWater30 : (parseFloat(draft.water) * 1000 || 0))
        : (costs.useDynamicWater ? dynamicWater30 : (parseFloat(costs.water) * 1000 || 0));

    const effectiveOther = isEditing
        ? (draft.useDynamicOther ? dynamicOther30 : (parseFloat(draft.other) * 1000 || 0))
        : (costs.useDynamicOther ? dynamicOther30 : (parseFloat(costs.other) * 1000 || 0));

    const effectiveRevenue = isEditing
        ? (draft.useDynamicRevenue ? actualRevenue30 : (parseFloat(draft.targetRevenue) || 0))
        : (costs.useDynamicRevenue ? actualRevenue30 : (parseFloat(costs.targetRevenue) || 0));

    const totalFixed = effectiveRent + effectiveMachines + effectiveElectricity + effectiveWater + effectiveSalaries + effectiveOther;

    // Tính toán số liệu 30 ngày cho BEP
    const calculateStats30Days = () => {
        if (!report?.logs) return { avgPrice: 0, avgCost: 0 };
        const now = getVNTime();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const logs30 = report.logs.filter(log => {
            const logDate = new Date(log.timestamp);
            return logDate >= thirtyDaysAgo && log.type === 'COMPLETED';
        });

        let totalItemsCount = 0;
        let totalRevenue = 0;
        const uniqueDays = new Set();

        logs30.forEach(log => {
            const preTaxVal = log.orderData?.preTaxTotal || parseFloat(log.price) || 0;
            totalRevenue += preTaxVal;
            uniqueDays.add(new Date(log.timestamp).toLocaleDateString());

            // Parse itemName: "Sữa Đá x2, Đen Đá x1"
            const items = (log.itemName || '').split(',');
            items.forEach(itemStr => {
                const match = itemStr.match(/x(\d+)/);
                if (match) {
                    totalItemsCount += parseInt(match[1]);
                } else if (itemStr.trim()) {
                    totalItemsCount += 1;
                }
            });
        });

        const openDays = uniqueDays.size || 1;
        // Dự đoán số món bán trong 30 ngày (nếu quán mở chưa đủ 30 ngày)
        const projectedMonthlyItems = (totalItemsCount / openDays) * 30;

        const avgPrice = totalItemsCount > 0 ? totalRevenue / totalItemsCount : 0;

        // Tính Cost trung bình của toàn menu
        let totalMenuCost = 0;
        let validItemCount = 0;
        menu.forEach(item => {
            const baseRecipeCost = (item.recipe || []).reduce((sum, r) => {
                const inv = (inventoryStats || []).find(s => s.id === r.ingredientId);
                return sum + (inv ? (inv.avgCost || 0) * r.quantity : 0);
            }, 0);
            const firstSize = item.sizes?.[0];
            const multiplier = firstSize?.multiplier || 1.0;
            const sizeSpecificCost = (firstSize?.recipe || []).reduce((sum, r) => {
                const inv = (inventoryStats || []).find(s => s.id === r.ingredientId);
                return sum + (inv ? (inv.avgCost || 0) * r.quantity : 0);
            }, 0);
            const itemCost = (baseRecipeCost * multiplier) + sizeSpecificCost;
            if (itemCost > 0) {
                totalMenuCost += itemCost;
                validItemCount++;
            }
        });

        const avgCost = validItemCount > 0 ? totalMenuCost / validItemCount : 0;

        return { avgPrice, avgCost, projectedMonthlyItems };
    };

    const stats30Days = calculateStats30Days();

    const getActualCOGS30 = () => {
        if (!report?.logs) return { totalCOGS: 0, hasData: false, rawCOGS: 0, actualRevenueFromValidOrders: 0 };
        const now = getVNTime();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const logs30 = report.logs.filter(log => {
            const logDate = new Date(log.timestamp);
            return logDate >= thirtyDaysAgo && log.type === 'COMPLETED';
        });

        if (logs30.length === 0) return { totalCOGS: 0, hasData: false, rawCOGS: 0, actualRevenueFromValidOrders: 0 };

        let totalCOGS = 0;
        let validOrdersWithData = 0;
        let actualRevenueFromValidOrders = 0;
        let uniqueDays = new Set();

        logs30.forEach(log => {
            if (log.orderData && log.orderData.cartItems) {
                validOrdersWithData++;
                actualRevenueFromValidOrders += (parseFloat(log.price) || 0);
                uniqueDays.add(new Date(log.timestamp).toLocaleDateString());

                log.orderData.cartItems.forEach(cartItem => {
                    const menuItem = menu.find(m => m.id === cartItem.item?.id || m.name === cartItem.item?.name);
                    if (!menuItem) return;

                    let sizeMultiplier = 1;
                    let selectedSizeLabel = null;
                    if (cartItem.size) {
                        selectedSizeLabel = typeof cartItem.size === 'string' ? cartItem.size : (cartItem.size.label || cartItem.size.name);
                        const menuSize = menuItem.sizes?.find(s => s.label === selectedSizeLabel);
                        if (menuSize && menuSize.multiplier) sizeMultiplier = parseFloat(menuSize.multiplier);
                    }

                    let baseCost = 0;
                    if (menuItem.recipe) {
                        baseCost = menuItem.recipe.reduce((sum, r) => {
                            const inv = (inventoryStats || []).find(s => s.id === r.ingredientId);
                            return sum + (inv ? (inv.avgCost || 0) * r.quantity : 0);
                        }, 0);
                    }

                    let sizeCost = 0;
                    if (selectedSizeLabel) {
                        const menuSize = menuItem.sizes?.find(s => s.label === selectedSizeLabel);
                        if (menuSize && menuSize.recipe) {
                            sizeCost = menuSize.recipe.reduce((sum, r) => {
                                const inv = (inventoryStats || []).find(s => s.id === r.ingredientId);
                                return sum + (inv ? (inv.avgCost || 0) * r.quantity : 0);
                            }, 0);
                        }
                    }

                    let addonCost = 0;
                    if (cartItem.addons && Array.isArray(cartItem.addons)) {
                        cartItem.addons.forEach(addonItem => {
                            const addonLabel = typeof addonItem === 'string' ? addonItem : addonItem.label;
                            const menuAddon = menuItem.addons?.find(a => a.label === addonLabel);
                            if (menuAddon && menuAddon.recipe) {
                                addonCost += menuAddon.recipe.reduce((sum, r) => {
                                    const inv = (inventoryStats || []).find(s => s.id === r.ingredientId);
                                    return sum + (inv ? (inv.avgCost || 0) * r.quantity : 0);
                                }, 0);
                            }
                        });
                    }

                    totalCOGS += ((baseCost * sizeMultiplier) + sizeCost + addonCost) * cartItem.count;
                });
            }
        });

        const activeDays = uniqueDays.size;
        const projectedCOGS30 = activeDays > 0 ? (totalCOGS / activeDays) * 30 : 0;

        return {
            totalCOGS: projectedCOGS30,
            hasData: validOrdersWithData > 0,
            actualRevenueFromValidOrders,
            rawCOGS: totalCOGS
        };
    };

    const calculateBEP = () => {
        let sellingPrice = 0;
        let totalCost = 0;

        if (bepMode === 'average') {
            sellingPrice = stats30Days.avgPrice;
            totalCost = stats30Days.avgCost;
        } else {
            if (!selectedItem) return null;
            const item = menu.find(i => i.id === selectedItem);
            if (!item) return null;

            const baseRecipeCost = (item.recipe || []).reduce((sum, r) => {
                const inv = (inventoryStats || []).find(s => s.id === r.ingredientId);
                return sum + (inv ? (inv.avgCost || 0) * r.quantity : 0);
            }, 0);

            const firstSize = item.sizes?.[0];
            const multiplier = firstSize?.multiplier || 1.0;
            const sizeSpecificCost = (firstSize?.recipe || []).reduce((sum, r) => {
                const inv = (inventoryStats || []).find(s => s.id === r.ingredientId);
                return sum + (inv ? (inv.avgCost || 0) * r.quantity : 0);
            }, 0);

            totalCost = (baseRecipeCost * multiplier) + sizeSpecificCost;
            sellingPrice = (parseFloat(item.price) || 0) + (firstSize?.priceAdjust || 0);
        }

        const margin = sellingPrice - totalCost;
        const monthlyQty = margin > 0 ? Math.ceil((totalFixed / 1000) / margin) : Infinity;
        const dailyQty = margin > 0 ? Math.ceil(monthlyQty / 30) : Infinity;

        return { margin, monthlyQty, dailyQty, sellingPrice, totalCost };
    };

    const bep = calculateBEP();

    return (
        <div className="bg-white border border-gray-100 shadow-sm overflow-hidden mt-8">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-900 text-white">
                <div className="flex items-center gap-2">
                    <DollarSign size={18} className="text-amber-400" />
                    <h3 className="font-bold uppercase tracking-wider text-sm">Phân tích Chi phí & Điểm hòa vốn</h3>
                </div>
                {!isEditing ? (
                    <button onClick={() => { setDraft({ ...costs }); setIsEditing(true); }} className="text-[10px] font-medium uppercase tracking-widest bg-white/10 hover:bg-white/20 px-3 py-1.5 ">Điều chỉnh chi phí</button>
                ) : (
                    <div className="flex gap-2">
                        <button onClick={() => setIsEditing(false)} className="text-[10px] font-bold uppercase tracking-widest bg-red-500/20 hover:bg-red-500/40 px-3 py-1.5 ">Hủy</button>
                        <button onClick={() => { onUpdate(draft); setIsEditing(false); }} className="text-[10px] font-bold uppercase tracking-widest bg-green-500/20 hover:bg-green-500/40 px-3 py-1.5 ">Lưu</button>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 divide-x divide-gray-100">
                {/* Fixed Costs Input/Display */}
                <div className="p-6 space-y-4">
                    {/* Revenue Section */}
                    <div className="bg-brand-50/50 border border-brand-100 p-4 relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full bg-brand-500"></div>
                        <div className="flex justify-between items-center mb-2">
                            <h4 className="text-[10px] font-bold text-brand-800 uppercase tracking-widest">Doanh thu dự phóng (x1000đ)</h4>
                            {isEditing && (
                                <div className="flex items-center gap-1.5 text-[9px] cursor-pointer group" onClick={() => setDraft({ ...draft, useDynamicRevenue: !draft.useDynamicRevenue })}>
                                    <input type="checkbox" checked={draft.useDynamicRevenue || false} readOnly className="w-2.5 h-2.5 rounded-none sm shadow-sm" />
                                    <span className={draft.useDynamicRevenue ? 'text-brand-600 underline' : 'group-hover:text-brand-600 text-brand-400'}>Lấy thực tế 30 ngày qua</span>
                                </div>
                            )}
                        </div>
                        {isEditing ? (
                            <input
                                type="number"
                                disabled={draft.useDynamicRevenue}
                                className={`w-full bg-white border border-brand-200 p-2 font-bold text-lg text-brand-900 outline-none focus:border-brand-500 ${draft.useDynamicRevenue ? 'opacity-50 italic cursor-not-allowed' : ''}`}
                                value={draft.useDynamicRevenue ? actualRevenue30 : (draft.targetRevenue || '')}
                                onChange={e => setDraft({ ...draft, targetRevenue: e.target.value })}
                                placeholder="Nhập doanh thu (VD: 150000 = 150 triệu)"
                            />
                        ) : (
                            <div className="flex flex-col">
                                <span className="font-bold text-2xl text-brand-600 flex items-baseline gap-2">
                                    {formatVND(effectiveRevenue)}
                                    {costs.useDynamicRevenue && <span className="text-[9px] font-medium text-brand-400 uppercase tracking-widest">(Nội suy từ {activeRevenueDays} ngày bán)</span>}
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="flex justify-between items-center mb-4 mt-6">
                        <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Dự toán chi phí cố định (Tháng)</h4>
                        {[costs.useDynamicRent, costs.useDynamicMachines, costs.useDynamicElectricity, costs.useDynamicWater, costs.useDynamicSalaries, costs.useDynamicOther].some(Boolean) && (
                            <span className="text-[9px] bg-green-50 text-green-600 px-2 py-0.5 font-bold uppercase tracking-tighter ring-1 ring-green-100">Đồng bộ Tự động (TB Tháng & Khấu hao)</span>
                        )}
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                        {[
                            { key: 'rent', label: (isEditing ? draft.useDynamicRent : costs.useDynamicRent) ? 'Mặt bằng (TB Tháng)' : 'Mặt bằng', icon: '🏠', value: effectiveRent, showToggle: true, dynamicValue: dynamicRent30, booleanKey: 'useDynamicRent', toggleLabel: 'TB Tháng' },
                            { key: 'machines', label: (isEditing ? draft.useDynamicMachines : costs.useDynamicMachines) ? 'Khấu hao Máy (1 Năm)' : 'Thuê Máy/Khấu Hao', icon: '⚙️', value: effectiveMachines, showToggle: true, dynamicValue: dynamicMachines30, booleanKey: 'useDynamicMachines', toggleLabel: 'Khấu hao (1 Năm)' },
                            { key: 'electricity', label: (isEditing ? draft.useDynamicElectricity : costs.useDynamicElectricity) ? 'Tiền điện (TB Tháng)' : 'Tiền điện', icon: '⚡', value: effectiveElectricity, showToggle: true, dynamicValue: dynamicElectricity30, booleanKey: 'useDynamicElectricity', toggleLabel: 'TB Tháng' },
                            { key: 'water', label: (isEditing ? draft.useDynamicWater : costs.useDynamicWater) ? 'Tiền nước (TB Tháng)' : 'Tiền nước', icon: '💧', value: effectiveWater, showToggle: true, dynamicValue: dynamicWater30, booleanKey: 'useDynamicWater', toggleLabel: 'TB Tháng' },
                            { key: 'salaries', label: (isEditing ? draft.useDynamicSalaries : costs.useDynamicSalaries) ? 'Lương 30 ngày qua' : 'Lương dự tính', icon: '👥', value: effectiveSalaries, showToggle: true, dynamicValue: dynamicSalaries30, booleanKey: 'useDynamicSalaries', toggleLabel: 'Lương 30 ngày' },
                            { key: 'other', label: (isEditing ? draft.useDynamicOther : costs.useDynamicOther) ? 'Khác (TB Tháng)' : 'Khác', icon: '📦', value: effectiveOther, showToggle: true, dynamicValue: dynamicOther30, booleanKey: 'useDynamicOther', toggleLabel: 'TB Tháng' },
                        ].map(item => {
                            const realValue = item.value / 1000;
                            const percent = effectiveRevenue > 0 ? (realValue / effectiveRevenue) * 100 : 0;
                            const standardTxt = getStandardText(item.key);

                            return (
                                <div key={item.key} className="space-y-1">
                                    <label className="text-[9px] font-bold text-gray-400 uppercase flex items-center justify-between gap-1">
                                        <div className="flex items-center gap-1"><span>{item.icon}</span> {item.label}</div>
                                        {item.showToggle && isEditing && (
                                            <div className="flex items-center gap-1.5 text-[8px] cursor-pointer group" onClick={() => setDraft({ ...draft, [item.booleanKey]: !draft[item.booleanKey] })}>
                                                <input type="checkbox" checked={draft[item.booleanKey]} readOnly className="w-2.5 h-2.5 rounded-none sm shadow-sm" />
                                                <span className={draft[item.booleanKey] ? 'text-brand-500 underline' : 'group-hover:text-gray-600'}>{item.toggleLabel}</span>
                                            </div>
                                        )}
                                    </label>
                                    {isEditing ? (
                                        <input
                                            type="number"
                                            disabled={draft[item.booleanKey]}
                                            className={`w-full bg-gray-50 border border-gray-100 p-2 font-bold text-sm outline-none focus:border-amber-400 ${draft[item.booleanKey] ? 'opacity-50 italic text-brand-500' : ''}`}
                                            value={draft[item.booleanKey] ? (item.dynamicValue / 1000) : draft[item.key]}
                                            onChange={e => setDraft({ ...draft, [item.key]: e.target.value })}
                                        />
                                    ) : (
                                        <>
                                            <div className={`font-bold text-sm p-2 border border-transparent flex justify-between items-center ${(isEditing ? draft[item.booleanKey] : costs[item.booleanKey]) ? 'text-brand-600 bg-brand-50/50' : 'text-gray-700 bg-gray-50/50'}`}>
                                                <span>{formatVND(realValue)}</span>
                                                {effectiveRevenue > 0 && <span className="text-[10px] text-gray-400 font-bold">{percent.toFixed(1)}%</span>}
                                            </div>
                                            {effectiveRevenue > 0 && (
                                                <div className="w-full bg-gray-100 h-1 mt-1 overflow-hidden transition-all">
                                                    <div className={`h-full ${getProgressBarColor(item.key, percent)}`} style={{ width: `${Math.min(percent, 100)}%` }}></div>
                                                </div>
                                            )}
                                            {standardTxt && (
                                                <p className="text-[8px] font-bold text-gray-400 text-right mt-0.5 tracking-wider">Chuẩn: <span className="text-gray-500">{standardTxt}</span></p>
                                            )}
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    <div className="pt-4 border-t border-gray-50 mt-4 flex justify-between items-end">
                        <div>
                            <span className="font-bold text-xs text-gray-900 uppercase tracking-widest block">Tổng chi cố định</span>
                            {!isEditing && effectiveRevenue > 0 && (
                                <span className="text-[10px] font-bold text-gray-400 block mt-1">
                                    Chiếm <strong className="text-gray-600">{((totalFixed / 1000) / effectiveRevenue * 100).toFixed(1)}%</strong> doanh thu
                                </span>
                            )}
                        </div>
                        <span className="text-xl font-bold text-red-600">{formatVND(totalFixed / 1000)}</span>
                    </div>
                </div>

                {/* BEP Calculator */}
                <div className="p-6 bg-gray-50/30">
                    <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">Máy tính điểm hòa vốn</h4>
                    <div className="space-y-4">
                        {/* Mode Switcher */}
                        <div className="flex bg-white border border-gray-100 p-1 rounded-none shadow-sm">
                            <button
                                onClick={() => setBepMode('item')}
                                className={`flex-1 py-1.5 text-[9px] font-bold uppercase tracking-widest transition-all rounded-none ${bepMode === 'item' ? 'bg-gray-900 text-white' : 'text-gray-400 hover:text-gray-600'}`}
                            >
                                Theo món
                            </button>
                            <button
                                onClick={() => setBepMode('average')}
                                className={`flex-1 py-1.5 text-[9px] font-bold uppercase tracking-widest transition-all rounded-none ${bepMode === 'average' ? 'bg-gray-900 text-white' : 'text-gray-400 hover:text-gray-600'}`}
                            >
                                TB 30 ngày
                            </button>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-gray-400 uppercase italic">
                                {bepMode === 'item' ? 'Chọn món để phân tích:' : 'Giá bán trung bình (30 ngày):'}
                            </label>
                            {bepMode === 'item' ? (
                                <select
                                    className="w-full bg-white border border-gray-200 p-3 font-bold text-sm outline-none shadow-sm focus:border-brand-600"
                                    value={selectedItem || ''}
                                    onChange={e => setSelectedItem(e.target.value)}
                                >
                                    <option value="">-- Chọn một món từ Menu --</option>
                                    {menu.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                                </select>
                            ) : (
                                <div className="w-full bg-white border border-gray-200 p-3 font-bold text-sm shadow-sm flex justify-between items-center">
                                    <span className="text-brand-600">{formatVND(stats30Days.avgPrice)}</span>
                                    <span className="text-[9px] bg-brand-50 text-brand-600 px-2 py-0.5 rounded-none uppercase">Dựa trên lịch sử thực tế</span>
                                </div>
                            )}
                        </div>

                        {bep && (
                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3 pt-2">
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="bg-white p-3 border border-gray-100 shadow-sm relative overflow-hidden">
                                        <div className={`absolute left-0 top-0 bottom-0 w-1 ${(bep.totalCost / bep.sellingPrice * 100) > 35 ? 'bg-red-500' : (bep.totalCost / bep.sellingPrice * 100) >= 32 ? 'bg-amber-400' : 'bg-green-500'}`}></div>
                                        <p className="text-[9px] text-gray-400 font-bold uppercase pl-2">{bepMode === 'item' ? 'Giá vốn (Cost)' : 'Giá vốn TB'}</p>
                                        <div className="flex items-baseline gap-2 pl-2">
                                            <p className="font-bold text-gray-700">{formatVND(bep.totalCost)}</p>
                                            <span className={`text-[10px] font-bold ${bep.sellingPrice > 0 && (bep.totalCost / bep.sellingPrice * 100) > 35 ? 'text-red-500' : 'text-gray-400'}`}>
                                                ({bep.sellingPrice > 0 ? (bep.totalCost / bep.sellingPrice * 100).toFixed(1) : 0}%)
                                            </span>
                                        </div>
                                    </div>
                                    <div className="bg-white p-3 border border-gray-100 shadow-sm">
                                        <p className="text-[9px] text-gray-400 font-bold uppercase">Lợi nhuận gộp/ly</p>
                                        <p className="font-bold text-green-600">{formatVND(bep.margin)}</p>
                                    </div>
                                </div>

                                <div className="bg-amber-50 p-5 border border-amber-100 text-center space-y-2">
                                    <p className="text-[10px] font-bold text-amber-700 uppercase tracking-[0.2em]">Để hòa vốn, bạn cần bán được:</p>
                                    <div className="flex justify-center items-baseline gap-2">
                                        <span className="text-4xl font-bold text-amber-600">
                                            {bep.monthlyQty === Infinity ? '---' : bep.monthlyQty}
                                        </span>
                                        <span className="text-xs font-bold text-amber-700 uppercase">ly / tháng</span>
                                    </div>
                                    <p className="text-[10px] font-bold text-amber-500 uppercase">
                                        ≈ {bep.dailyQty === Infinity ? '---' : bep.dailyQty} ly mỗi ngày
                                    </p>
                                </div>

                                <p className="text-[9px] text-gray-400 font-bold italic text-center">
                                    * {bepMode === 'item'
                                        ? 'Tính toán dựa trên Size đầu tiên của sản phẩm và chi phí cố định.'
                                        : 'Dựa trên trung bình giá bán thực tế và chi phí nguyên liệu trung bình menu.'}
                                </p>
                            </motion.div>
                        )}

                        {bepMode === 'item' && !selectedItem && (
                            <div className="h-[200px] flex flex-col items-center justify-center text-gray-300 opacity-40">
                                <BarChart3 size={48} className="mb-2" />
                                <p className="text-[10px] font-bold uppercase tracking-widest">Vui lòng chọn món</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Net Profit Projection */}
                {!isEditing && Object.keys(costs).length > 0 && (
                    <div className="col-span-full border-t border-gray-100 bg-gray-900 text-white p-6 relative overflow-hidden">
                        <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-amber-400/10 to-transparent"></div>
                        <h4 className="text-[10px] font-bold text-amber-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <TrendingUp size={14} className="text-amber-400" />
                            Dự phóng lợi nhuận ròng
                        </h4>

                        {(() => {
                            // Net profit = Revenue - Fixed Cost - Est COGS (35%)
                            const realFixedCost = totalFixed / 1000;
                            const estCOGS = effectiveRevenue * 0.35; // Standard 35% COGS assumption
                            const netProfit = effectiveRevenue - realFixedCost - estCOGS;
                            const netMargin = effectiveRevenue > 0 ? (netProfit / effectiveRevenue) * 100 : 0;

                            const actualCOGSData = getActualCOGS30();
                            const actualCOGSPercentage = actualCOGSData.actualRevenueFromValidOrders > 0 ? (actualCOGSData.rawCOGS / actualCOGSData.actualRevenueFromValidOrders) * 100 : 0;

                            const actualCOGS = actualCOGSData.hasData ? (effectiveRevenue * (actualCOGSPercentage / 100)) : 0;

                            const actualNetProfit = effectiveRevenue - realFixedCost - actualCOGS;
                            const actualNetMargin = effectiveRevenue > 0 ? (actualNetProfit / effectiveRevenue) * 100 : 0;

                            const displayNetProfit = actualCOGSData.hasData ? actualNetProfit : netProfit;
                            const displayNetMargin = actualCOGSData.hasData ? actualNetMargin : netMargin;

                            let evaluation = { color: 'text-gray-400', txt: 'Chưa đủ dữ liệu' };
                            if (effectiveRevenue > 0) {
                                if (displayNetMargin >= 18) evaluation = { color: 'text-green-400', txt: 'RẤT TỐT' };
                                else if (displayNetMargin >= 10) evaluation = { color: 'text-brand-400', txt: 'HỢP LÝ' };
                                else if (displayNetMargin > 0) evaluation = { color: 'text-orange-400', txt: 'LÃI MỎNG' };
                                else evaluation = { color: 'text-red-400', txt: 'ĐANG LỖ' };
                            }

                            return (
                                <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-6 relative z-10 w-full">
                                    <div className="flex-1 space-y-4">
                                        <p className="text-[11px] text-gray-400 max-w-sm italic leading-relaxed">
                                            Mô phỏng dựa trên mốc chuẩn (Giá vốn ~35%), so sánh cạnh chi phí thực tế trích xuất từ định mức kho trong 30 ngày qua.
                                        </p>
                                        <div className="flex flex-wrap gap-4 pt-2">
                                            {/* Standard COGS column */}
                                            <div className="bg-white/5 p-4 pr-8 min-w-[260px] border-l-2 border-gray-600">
                                                <span className="text-[11px] font-bold text-gray-400 block uppercase mb-3 tracking-wider">Cột Lãi (Chuẩn Ngành 35%)</span>
                                                <div className="space-y-2">
                                                    <div className="flex justify-between items-center text-sm">
                                                        <span className="text-gray-500 uppercase font-bold text-[10px] tracking-wider">Giá Vốn (35%)</span>
                                                        <span className="font-medium text-gray-300">-{formatVND(estCOGS)}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-sm">
                                                        <span className="text-gray-500 uppercase font-bold text-[10px] tracking-wider">Cố định</span>
                                                        <span className="font-medium text-red-300/80">-{formatVND(realFixedCost)}</span>
                                                    </div>
                                                    <div className="border-t border-gray-700/50 pt-2 mt-2 flex justify-between items-center">
                                                        <span className="text-gray-500 uppercase font-bold text-[10px] tracking-wider">Tỷ suất sinh lời</span>
                                                        <span className={`font-bold text-sm ${netMargin >= 18 ? 'text-green-400' : 'text-amber-400'}`}>{netMargin.toFixed(1)}%</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Actual COGS column */}
                                            {actualCOGSData.hasData && (
                                                <div className="bg-white/5 shadow-[inset_0_0_20px_rgba(255,193,7,0.05)] border-l-2 border-amber-500 p-4 pr-8 min-w-[260px]">
                                                    <span className="text-[11px] font-bold text-amber-500 block uppercase mb-3 flex items-center gap-1.5 tracking-wider">Cột Lãi (Thực Tế 30 Ngày)</span>
                                                    <div className="space-y-2">
                                                        <div className="flex justify-between items-center text-sm gap-4">
                                                            <span className="text-gray-500 uppercase font-bold text-[10px] tracking-wider">Giá Vốn ({actualCOGSPercentage.toFixed(1)}%)</span>
                                                            <span className={`font-medium ${actualCOGSPercentage > 35 ? 'text-red-400' : 'text-brand-400'}`}>-{formatVND(actualCOGS)}</span>
                                                        </div>
                                                        <div className="flex justify-between items-center text-sm gap-4">
                                                            <span className="text-gray-500 uppercase font-bold text-[10px] tracking-wider">Cố định</span>
                                                            <span className="font-medium text-red-300/80">-{formatVND(realFixedCost)}</span>
                                                        </div>
                                                        <div className="border-t border-gray-700/50 pt-2 mt-2 flex justify-between items-center text-sm gap-4">
                                                            <span className="text-gray-500 uppercase font-bold text-[10px] tracking-wider">Tỷ suất thực <ArrowRight size={12} className="inline text-gray-600 ml-1" /></span>
                                                            <span className={`font-bold uppercase tracking-widest text-sm ${actualNetMargin >= 18 ? 'text-green-400' : 'text-amber-400'}`}>{actualNetMargin.toFixed(1)}%</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* The giant net profit number on the right */}
                                    <div className="text-left xl:text-right border-t border-gray-800 pt-4 xl:border-0 xl:pt-0 shrink-0 self-end">
                                        <p className="text-[10px] font-bold tracking-widest uppercase text-gray-400 mb-1">
                                            {actualCOGSData.hasData ? 'Lãi Ròng (Thực tế)' : 'Lãi Ròng Ước Tính'}
                                            <span className={`${evaluation.color} ml-2 font-bold uppercase px-2 py-0.5 bg-white/5`}>{evaluation.txt}</span>
                                        </p>
                                        <div className="flex items-baseline xl:justify-end gap-3 mt-2">
                                            <span className={`text-4xl font-bold ${displayNetProfit > 0 ? 'text-green-400' : 'text-red-500'}`}>
                                                {formatVND(displayNetProfit)}
                                            </span>
                                            {effectiveRevenue > 0 && (
                                                <span className={`text-sm font-bold ${displayNetMargin >= 18 ? 'text-green-400' : 'text-amber-400'} px-2 py-1 bg-white/5 rounded-none flex flex-col items-center`}>
                                                    {displayNetMargin.toFixed(1)}%
                                                    <span className="text-[8px] text-gray-500 uppercase mt-0.5 tracking-tighter">Mục tiêu 18%</span>
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                )}
            </div>
        </div>
    );
};

// ── Inventory Modal ──
const InventoryModal = ({ item, onSave, onClose }) => {
    const [draft, setDraft] = useState(item || { name: '', stock: 0, minStock: 0, unit: 'g' });

    useEffect(() => {
        const handleEsc = (e) => {
            if ((e.key === 'Escape' || (e.key === 'Backspace' && !isInputFocused()))) onClose();
        };
        window.addEventListener('keydown', handleEsc, { capture: true });
        return () => window.removeEventListener('keydown', handleEsc, { capture: true });
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="admin-modal-container">
                <h3 className="font-black text-gray-900 uppercase tracking-widest text-sm text-center">Nguyên liệu kho</h3>
                <div className="space-y-4">
                    <input autoFocus placeholder="Tên nguyên liệu" className="admin-input"
                        value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
                    <div className="grid grid-cols-2 gap-4">
                        <input type="number" disabled={!!item?.id} placeholder="Số lượng" className={`admin-input ${item?.id ? 'opacity-60 cursor-not-allowed bg-gray-50' : ''}`}
                            value={draft.stock} onChange={e => setDraft({ ...draft, stock: parseFloat(e.target.value) || 0 })} />
                        <input placeholder="Đơn vị (g, ml...)" className="admin-input"
                            value={draft.unit} onChange={e => setDraft({ ...draft, unit: e.target.value })} />
                    </div>
                    <label className="admin-label">Mức cảnh báo (Min)</label>
                    <input autoFocus={!!item?.id} type="number" className="admin-input"
                        value={draft.minStock} onChange={e => setDraft({ ...draft, minStock: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="flex gap-4 pt-4">
                    <button onClick={onClose} className="admin-btn-secondary">HỦY</button>
                    <button onClick={() => onSave(draft)} className="admin-btn-primary">LƯU KHO</button>
                </div>
            </motion.div>
        </div>
    );
};

// ── Import Modal ──
const ExpenseModal = ({ expense, expenses, onSave, onClose }) => {
    const [category, setCategory] = useState(expense?.category || 'Đầu tư & Máy móc');
    const [name, setName] = useState(expense?.name || '');
    const [showSuggestions, setShowSuggestions] = useState(false);

    const handleCategoryChange = (e) => {
        const newCat = e.target.value;
        setCategory(newCat);
        setName('');
    };

    const isFixed = false; // Cho phép điền tự do tất cả các mục

    let baseSuggestions = [];
    if (category === 'Điện, Nước & Internet') {
        baseSuggestions = ['Tiền Điện', 'Tiền Nước', 'Tiền Internet', 'Phí quản lý / Rác', 'Khác (bảo trì điện nước)'];
    } else if (category === 'Mặt bằng (Cố định)') {
        baseSuggestions = ['Tiền mặt bằng', 'Chi phí ban quản lý', 'Bảo vệ / Gửi xe'];
    } else if (category === 'Lương, thưởng ngoài') {
        baseSuggestions = ['Lương Quản lý', 'Lương Nhân viên', 'Thưởng / Phụ cấp'];
    }

    const suggestions = Array.from(new Set([
        ...baseSuggestions,
        ...(expenses ? expenses.filter(e => e.category === category).map(e => e.name) : [])
    ])).filter(n => n.toLowerCase().includes(name.toLowerCase()) && n !== name);

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4 animate-in fade-in duration-200">
            <div className="bg-white shadow-2xl w-[450px] relative flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-gray-50/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-brand-100 text-brand-600 rounded-none">
                            <DollarSign size={20} className="stroke-[3px]" />
                        </div>
                        <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">{expense ? 'Sửa Phiếu Chi' : 'Ghi Phiếu Chi'}</h3>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-2 transition-colors rounded-none">
                        <X size={20} strokeWidth={3} />
                    </button>
                </div>
                <div className="p-6 overflow-y-auto custom-scrollbar flex-1 overflow-visible">
                    <form id="expense-form" onSubmit={(e) => {
                        e.preventDefault();
                        const formData = new FormData(e.target);
                        onSave({
                            id: expense?.id,
                            name: name,
                            amount: parseFloat(formData.get('amount')),
                            date: formData.get('date'),
                            category: category,
                            note: formData.get('note')
                        });
                    }} className="space-y-4">
                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Phân mục (Category)</label>
                            <select name="category" value={category} onChange={handleCategoryChange} className="w-full border-2 border-transparent bg-gray-50 p-3 focus:bg-white focus:border-brand-600 outline-none font-bold text-gray-900 transition-all">
                                <option value="Đầu tư & Máy móc">🎨 Chi phí Đầu tư (CapEx: Decor, Máy móc...)</option>
                                <option value="Khác">💸 Khác (Lặt vặt, Marketing...)</option>
                                <option disabled>──────────</option>
                                <option value="Mặt bằng (Cố định)">🏠 Mặt bằng & Vận hành (Cố định)</option>
                                <option value="Điện, Nước & Internet">⚡ Điện, Nước & Internet (Utilities)</option>
                                <option value="Lương, thưởng ngoài">👷 Lương bổng ngoài lề</option>
                            </select>
                        </div>
                        <div className="relative">
                            <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Nội dung chi</label>
                            <input
                                name="name"
                                value={name}
                                onChange={e => {
                                    setName(e.target.value);
                                    setShowSuggestions(true);
                                }}
                                onFocus={() => setShowSuggestions(true)}
                                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                                disabled={isFixed}
                                required
                                placeholder={isFixed ? '' : 'Chọn hoặc gõ nội dung chi...'}
                                className={`w-full border-2 border-transparent p-3 outline-none font-bold transition-all ${isFixed ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-gray-50 text-gray-900 focus:bg-white focus:border-brand-600'}`}
                            />
                            {!isFixed && showSuggestions && suggestions.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 shadow-2xl max-h-48 overflow-y-auto z-[60] rounded-none">
                                    {suggestions.map((s, i) => (
                                        <div
                                            key={i}
                                            className="p-3 hover:bg-brand-50 cursor-pointer text-sm font-bold text-gray-700 border-b border-gray-50 last:border-none flex items-center justify-between group"
                                            onMouseDown={(e) => { e.preventDefault(); setName(s); setShowSuggestions(false); }}
                                        >
                                            <span>{s}</span>
                                            <span className="text-[10px] text-brand-600 uppercase font-black opacity-0 group-hover:opacity-100 tracking-widest">Chọn</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Số tiền (VNĐ)</label>
                                <input type="number" name="amount" defaultValue={expense?.amount} required min="0" className="w-full border-2 border-transparent bg-gray-50 p-3 focus:bg-white focus:border-brand-600 outline-none font-bold text-gray-900 transition-all font-mono" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Ngày chi</label>
                                <input type="date" name="date" defaultValue={expense?.date || getVNDateStr()} required className="w-full border-2 border-transparent bg-gray-50 p-3 focus:bg-white focus:border-brand-600 outline-none font-bold text-gray-900 transition-all" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Ghi chú thêm</label>
                            <textarea name="note" defaultValue={expense?.note} rows="2" placeholder="Chi tiết nếu cần..." className="w-full border-2 border-transparent bg-gray-50 p-3 focus:bg-white focus:border-brand-600 outline-none text-sm text-gray-900 transition-all" />
                        </div>
                    </form>
                </div>
                <div className="p-5 border-t border-gray-100 bg-gray-50 flex gap-3 mt-auto">
                    <button type="button" onClick={onClose} className="flex-1 px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-widest hover:bg-gray-200 transition-colors">
                        HỦY
                    </button>
                    <button type="submit" form="expense-form" className="flex-[2] bg-brand-600 text-white px-4 py-3 text-xs font-black uppercase tracking-widest shadow-lg shadow-brand-500/30 hover:bg-brand-600 hover:shadow-brand-500/50 transition-all">
                        {expense ? 'CẬP NHẬT' : 'GHI PHIẾU CHI'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const ImportModal = ({ inventory, inventoryStats = [], onSave, onClose }) => {
    const safeInventory = Array.isArray(inventory) ? inventory : [];

    useEffect(() => {
        const handleEsc = (e) => {
            if ((e.key === 'Escape' || (e.key === 'Backspace' && !isInputFocused()))) onClose();
        };
        window.addEventListener('keydown', handleEsc, { capture: true });
        return () => window.removeEventListener('keydown', handleEsc, { capture: true });
    }, [onClose]);

    const [draft, setDraft] = useState({
        name: '',
        unit: 'g',
        importUnit: 'hộp',
        quantity: 0,
        volumePerUnit: 0,
        costPerUnit: 0
    });

    const calculateTotalAdded = () => {
        return (parseFloat(draft.quantity) || 0) * (parseFloat(draft.volumePerUnit) || 0);
    };

    const calculateTotalCost = () => {
        return (parseFloat(draft.quantity) || 0) * (parseFloat(draft.costPerUnit) || 0);
    };

    const handleNameChange = (val) => {
        const found = safeInventory.find(i => i.name.toLowerCase().trim() === val.toLowerCase().trim());
        if (found) {
            setDraft({ ...draft, name: val, unit: found.unit });
        } else {
            setDraft({ ...draft, name: val });
        }
    };

    return (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-6 sm:p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="admin-modal-container max-w-lg w-full max-h-[90vh] overflow-y-auto">
                <h3 className="font-black text-gray-900 uppercase tracking-widest text-sm text-center mb-6">Lập phiếu nhập kho</h3>

                <div className="space-y-5">
                    {/* Hàng 1: Tên S/P và Đơn vị */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="admin-label flex items-center gap-1">Tên nguyên liệu <span className="text-red-500">*</span></label>
                            <input type="text" list="inventory-names" placeholder="VD: Sữa đặc" className="admin-input"
                                value={draft.name} onChange={e => handleNameChange(e.target.value)} />
                            <datalist id="inventory-names">
                                {safeInventory.map(inv => <option key={inv.id || Math.random()} value={inv.name} />)}
                            </datalist>
                            {/* Display avgCost if known */}
                            {(() => {
                                const found = safeInventory.find(i => i.name.toLowerCase().trim() === draft.name.toLowerCase().trim());
                                const stat = found ? inventoryStats.find(s => s.id === found.id) : null;
                                if (stat && stat.avgCost > 0) {
                                    return (
                                        <p className="text-[10px] text-brand-600 font-bold italic mt-1 flex items-center gap-1">
                                            <TrendingUp size={10} /> Giá TB kho: {formatVND(stat.avgCost)}/{draft.unit}
                                        </p>
                                    );
                                }
                                return null;
                            })()}
                        </div>
                        <div className="space-y-2">
                            <label className="admin-label">Đơn vị lưu kho</label>
                            <input type="text" placeholder="VD: g, ml" className="admin-input"
                                value={draft.unit} onChange={e => setDraft({ ...draft, unit: e.target.value })} />
                        </div>
                    </div>

                    <hr className="border-gray-100" />

                    {/* Hàng 2: Nhập số lượng và quy cách */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="admin-label">Số lượng nhập</label>
                            <input type="number" placeholder="0" className="admin-input text-brand-600 font-bold"
                                value={draft.quantity === 0 ? '' : draft.quantity}
                                onChange={e => setDraft({ ...draft, quantity: parseFloat(e.target.value) || 0 })} />
                        </div>
                        <div className="space-y-2">
                            <label className="admin-label">Quy cách nhập</label>
                            <input type="text" placeholder="VD: hộp, thùng" className="admin-input"
                                value={draft.importUnit}
                                onChange={e => setDraft({ ...draft, importUnit: e.target.value })} />
                        </div>
                    </div>

                    {/* Hàng 3: Dung lượng và Giá */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="admin-label">Dung lượng / {draft.importUnit || 'Đơn vị'}</label>
                            <div className="relative">
                                <input type="number" placeholder="0" className="admin-input pr-10"
                                    value={draft.volumePerUnit === 0 ? '' : draft.volumePerUnit}
                                    onChange={e => setDraft({ ...draft, volumePerUnit: parseFloat(e.target.value) || 0 })} />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">{draft.unit}</span>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="admin-label">Giá mua / {draft.importUnit || 'Đơn vị'}</label>
                            <div className="relative">
                                <input type="number" placeholder="0" className="admin-input pr-10"
                                    value={draft.costPerUnit === 0 ? '' : draft.costPerUnit}
                                    onChange={e => setDraft({ ...draft, costPerUnit: parseFloat(e.target.value) || 0 })} />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">nghìn ₫</span>
                            </div>
                        </div>
                    </div>

                    {/* Tổng kết phiếu nhập */}
                    {draft.quantity > 0 && (
                        <div className="bg-brand-50/50 p-4 border border-brand-100 rounded-none mt-4 text-center">
                            <p className="text-xs text-gray-500 font-bold uppercase mb-2">Tổng kết phiếu nhập</p>
                            <div className="flex justify-around items-center">
                                <div>
                                    <p className="text-[10px] text-gray-400 uppercase tracking-widest">Tồn kho được cộng</p>
                                    <p className="text-xl font-black text-brand-600">+{calculateTotalAdded()} <span className="text-sm">{draft.unit}</span></p>
                                </div>
                                <div className="w-px h-8 bg-brand-200"></div>
                                <div>
                                    <p className="text-[10px] text-gray-400 uppercase tracking-widest">Tổng tiền phải trả</p>
                                    <p className="text-xl font-black text-red-500">{formatVND(calculateTotalCost())}</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex gap-4 pt-6">
                    <button onClick={onClose} className="admin-btn-secondary flex-1">HỦY</button>
                    <button
                        onClick={() => {
                            if (!draft.name || !draft.quantity || !draft.volumePerUnit) {
                                alert('Vui lòng nhập Tên nguyên liệu, Số lượng nhập và Dung lượng quy đổi');
                                return;
                            }
                            onSave(draft);
                        }}
                        className="admin-btn-primary flex-1">
                        LƯU NHẬP KHO
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

// ── Recipe Guide Modal ──
const RecipeGuideModal = ({ menu, inventory, inventoryStats = [], onClose, initialSearchTerm = '' }) => {
    const safeMenu = Array.isArray(menu) ? menu : [];
    const safeInventory = Array.isArray(inventory) ? inventory : [];
    const [selectedItem, setSelectedItem] = useState(null);
    const [searchTerm, setSearchTerm] = useState(initialSearchTerm);

    useEffect(() => {
        const handleEsc = (e) => {
            if ((e.key === 'Escape' || (e.key === 'Backspace' && !isInputFocused()))) onClose();
        };
        window.addEventListener('keydown', handleEsc, { capture: true });
        return () => window.removeEventListener('keydown', handleEsc, { capture: true });
    }, [onClose]);

    const filteredMenu = safeMenu.filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase()));
    return (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-6 bg-gray-100">
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="bg-white w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden rounded-none border border-gray-200">
                <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center z-10">
                    <div>
                        <h3 className="text-xl font-black text-gray-900 uppercase tracking-widest">Danh sách công thức pha chế</h3>
                        <p className="text-xs text-gray-400 font-bold mt-1">Dành cho nhân viên học theo</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-none text-gray-500 transition-all"><X size={24} /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-gray-50/50">
                    {filteredMenu.filter(m => m.recipe?.length > 0 || m.addons?.some(a => a.recipe?.length > 0) || m.sizes?.some(s => s.recipe?.length > 0) || m.recipeInstructions).map(item => (
                        <div key={item.id} className="bg-white border border-gray-200 shadow-sm p-6 rounded-none break-inside-avoid">
                            <div className="flex items-center gap-4 mb-4 border-b border-gray-100 pb-3">
                                {item.image ? <img src={getImageUrl(item.image)} className="w-12 h-12 object-cover rounded-none" alt="" /> : <div className="w-12 h-12 bg-gray-100 rounded-none" />}
                                <div>
                                    <h4 className="text-lg font-black text-brand-600">{item.name}</h4>
                                    <span className="text-[10px] font-black uppercase text-gray-400 border px-2 py-0.5 rounded-none tracking-widest">{item.category}</span>
                                </div>
                            </div>
                            {(() => {
                                const hasSizes = item.sizes && item.sizes.some(s => s.multiplier || (s.recipe && s.recipe.length > 0));
                                return (
                                    <div className={`grid grid-cols-1 ${hasSizes ? 'md:grid-cols-2' : ''} gap-6 items-start`}>
                                        {/* Cột 1: Công thức gốc & Add-ons */}
                                        <div className="space-y-6 flex-1">
                                            {/* Main Recipe */}
                                            {item.recipe && item.recipe.length > 0 && (
                                                <div className="space-y-2">
                                                    <p className="text-xs font-black uppercase tracking-widest text-brand-600 bg-brand-50 px-3 py-1.5 inline-block rounded-none">Công thức gốc</p>
                                                    <ul className="space-y-2 mt-2">
                                                        {item.recipe.map((r, i) => {
                                                            const inv = inventory.find(inv => inv.id === r.ingredientId);
                                                            const stat = inv ? inventoryStats.find(s => s.id === inv.id) : null;
                                                            const costStr = stat && stat.avgCost ? `(~${formatVND(stat.avgCost * r.quantity)})` : '';
                                                            return (
                                                                <li key={i} className="flex justify-between items-center text-sm border-b border-dashed border-gray-200 pb-1">
                                                                    <span className="font-bold text-gray-700">{inv?.name || 'Không rõ'} <span className="text-[10px] text-gray-400 font-normal">{costStr}</span></span>
                                                                    <span className="font-black text-brand-600">{r.quantity} {inv?.unit}</span>
                                                                </li>
                                                            );
                                                        })}
                                                    </ul>
                                                </div>
                                            )}

                                            {/* Addon Recipes */}
                                            {item.addons && item.addons.some(a => a.recipe && a.recipe.length > 0) && (
                                                <div className="space-y-2">
                                                    <p className="text-xs font-black uppercase tracking-widest text-brand-600 bg-brand-50 px-3 py-1.5 inline-block rounded-none">Tùy chọn thêm (Add-ons)</p>
                                                    <div className="space-y-4 mt-2">
                                                        {item.addons.filter(a => a.recipe && a.recipe.length > 0).map((a, i) => (
                                                            <div key={i} className="bg-brand-50/20 p-3 rounded-none border border-brand-50">
                                                                <p className="font-black text-sm text-gray-800 mb-2">+ {a.label}</p>
                                                                <ul className="space-y-1">
                                                                    {(a.recipe || []).map((r, j) => {
                                                                        const inv = inventory.find(inv => inv.id === r.ingredientId);
                                                                        const stat = inv ? inventoryStats.find(st => st.id === inv.id) : null;
                                                                        const costStr = stat && stat.avgCost ? `(~${formatVND(stat.avgCost * r.quantity)})` : '';
                                                                        return (
                                                                            <li key={`addon-${j}`} className="flex justify-between items-center text-xs border-b border-dashed border-brand-100 pb-1">
                                                                                <span className="font-bold text-gray-600">{inv?.name || 'Không rõ'} <span className="text-[9px] font-normal opacity-70">{costStr}</span></span>
                                                                                <span className="font-black text-brand-600 text-[11px]">{r.quantity} {inv?.unit}</span>
                                                                            </li>
                                                                        );
                                                                    })}
                                                                </ul>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Cột 2: Phân theo Size (Chỉ render nếu có) */}
                                        {hasSizes && (
                                            <div className="space-y-6 flex-1">
                                                <div className="space-y-2">
                                                    <p className="text-xs font-black uppercase tracking-widest text-brand-600 bg-brand-50 px-3 py-1.5 inline-block rounded-none">Phân theo Size</p>
                                                    <div className="space-y-4 mt-2">
                                                        {item.sizes.filter(s => s.multiplier || (s.recipe && s.recipe.length > 0)).map((s, i) => (
                                                            <div key={i} className="bg-brand-50/20 p-3 rounded-none border border-brand-50">
                                                                <p className="font-black text-sm text-gray-800 mb-2">Size {s.label} {s.multiplier && s.multiplier !== 1 ? `(HS x${s.multiplier})` : ''}</p>
                                                                <ul className="space-y-1">
                                                                    {s.multiplier && (item.recipe || []).map((r, j) => {
                                                                        const inv = inventory.find(inv => inv.id === r.ingredientId);
                                                                        const totalQty = Math.ceil(r.quantity * s.multiplier);
                                                                        const stat = inv ? inventoryStats.find(st => st.id === inv.id) : null;
                                                                        const costStr = stat && stat.avgCost ? `(~${formatVND(stat.avgCost * totalQty)})` : '';
                                                                        return (
                                                                            <li key={`base-${j}`} className="flex justify-between items-center text-xs border-b border-dashed border-brand-100 pb-1 italic opacity-80">
                                                                                <span className="font-bold text-gray-600">{inv?.name || 'Không rõ'} <span className="text-[9px] font-normal">{costStr}</span></span>
                                                                                <span className="font-black text-brand-600 text-[11px]">{totalQty} {inv?.unit}</span>
                                                                            </li>
                                                                        );
                                                                    })}
                                                                    {(s.recipe || []).map((r, j) => {
                                                                        const inv = inventory.find(inv => inv.id === r.ingredientId);
                                                                        const stat = inv ? inventoryStats.find(st => st.id === inv.id) : null;
                                                                        const costStr = stat && stat.avgCost ? `(~${formatVND(stat.avgCost * r.quantity)})` : '';
                                                                        return (
                                                                            <li key={`size-${j}`} className="flex justify-between items-center text-xs border-b border-dashed border-brand-100 pb-1">
                                                                                <span className="font-bold text-gray-600">{inv?.name || 'Không rõ'} <span className="text-[9px] font-normal opacity-70">{costStr}</span></span>
                                                                                <span className="font-black text-brand-600 text-[11px]">{r.quantity} {inv?.unit}</span>
                                                                            </li>
                                                                        );
                                                                    })}
                                                                </ul>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                            {/* Chế biến / Cách làm */}
                            {item.recipeInstructions && (
                                <div className="mt-6 pt-6 border-t border-gray-100">
                                    <p className="text-[11px] font-black uppercase tracking-widest text-brand-600 bg-brand-50 px-3 py-1.5 inline-block rounded-none mb-3">SỔ TAY CÁCH LÀM</p>
                                    <div className="text-[13px] font-bold text-gray-700 whitespace-pre-wrap leading-relaxed bg-gray-50 p-4 rounded-none border border-gray-200">
                                        {item.recipeInstructions}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                    {menu.filter(m => m.recipe?.length > 0 || m.addons?.some(a => a.recipe?.length > 0) || m.sizes?.some(s => s.recipe?.length > 0) || m.recipeInstructions).length === 0 && (
                        <div className="text-center py-20 text-gray-400 font-bold">Chưa có công thức nào được thiết lập. Vui lòng thêm định lượng ở phần chỉnh sửa món.</div>
                    )}
                </div>
            </motion.div>
        </div>
    );
};

// ── Shift Edit History Modal ──
const ShiftHistoryModal = ({ shift, onClose, onRestore }) => {
    useEffect(() => {
        const handleEsc = (e) => {
            if ((e.key === 'Escape' || (e.key === 'Backspace' && !isInputFocused()))) onClose();
        };
        window.addEventListener('keydown', handleEsc, { capture: true });
        return () => window.removeEventListener('keydown', handleEsc, { capture: true });
    }, [onClose]);

    if (!shift || !shift.editHistory || shift.editHistory.length === 0) return null;

    return (
        <div className="fixed inset-0 z-[700] flex items-center justify-center p-6">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="bg-white w-full max-w-lg shadow-2xl relative z-10 flex flex-col rounded-none overflow-hidden">
                <div className="bg-gray-900 text-white px-6 py-4 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <RotateCcw size={20} className="text-brand-400" />
                        <h3 className="font-black text-lg">Lịch sử sửa ca</h3>
                    </div>
                    <button onClick={onClose} className="hover:text-red-400 transition-colors"><X size={24} /></button>
                </div>
                <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
                    {shift.editHistory.slice().reverse().map((record, index) => {
                        const editTime = new Date(record.editedAt);
                        const oldIn = new Date(record.previousClockIn);
                        const oldOut = record.previousClockOut ? new Date(record.previousClockOut) : null;

                        return (
                            <div key={index} className="bg-gray-50 border border-gray-100 p-4 rounded-none shadow-sm">
                                <p className="text-xs font-bold text-gray-500 mb-2 flex items-center justify-between border-b pb-2">
                                    <span>Thời điểm sửa (System):</span>
                                    <span className="text-brand-600 bg-brand-50 px-2 py-0.5 rounded-none">{editTime.toLocaleString('vi-VN')}</span>
                                </p>
                                <div className="text-sm font-semibold text-gray-700 flex justify-between items-center bg-white p-2 rounded-none border border-dashed border-gray-200">
                                    <div>
                                        <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Dữ liệu CŨ (Bị Ghi Đè)</p>
                                        <p>Vào: <span className="text-green-600">{oldIn.toLocaleString('vi-VN')}</span></p>
                                        <p>Ra: <span className="text-amber-600">{oldOut ? oldOut.toLocaleString('vi-VN') : 'Đang làm'}</span></p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Tổng giờ CŨ</p>
                                        <span className="font-black text-lg text-red-500">{record.previousHours?.toFixed(2) || '0.00'}h</span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => onRestore(shift.id, record)}
                                    className="w-full mt-3 py-2 bg-brand-50 text-brand-600 hover:bg-brand-600 hover:text-white font-bold rounded-none flex justify-center items-center gap-2 transition-colors border border-brand-100 uppercase tracking-widest text-xs"
                                >
                                    <RotateCcw size={14} />
                                    Phục hồi về bản này
                                </button>
                            </div>
                        );
                    })}
                </div>
            </motion.div>
        </div>
    );
};

// ── Interactive Shift Block (iPad Drag & Drop) ──
const InteractiveShiftBlock = ({ shift, sched, staffList, isHighlighted, onFocus, onBlur, onDragUpdate, onQuickEdit, displayStartMin, displayDur, onHighlightUpdate, isPersonalReport }) => {
    const [dragOffsets, setDragOffsets] = useState({ start: 0, end: 0 }); // minutes
    const [isDragging, setIsDragging] = useState(false);
    const blockRef = useRef(null);

    let activeIn = new Date(shift.clockIn);
    let activeOut = shift.clockOut ? new Date(shift.clockOut) : new Date(); // Support ongoing shift

    if (dragOffsets.start !== 0) activeIn.setMinutes(activeIn.getMinutes() + dragOffsets.start);
    if (dragOffsets.end !== 0) activeOut.setMinutes(activeOut.getMinutes() + dragOffsets.end);

    const timeToPercent = (dateObj) => {
        const totalMinutes = dateObj.getHours() * 60 + dateObj.getMinutes();
        return Math.max(0, Math.min(100, ((totalMinutes - displayStartMin) / displayDur) * 100));
    };

    let pStart = timeToPercent(activeIn);
    let pEnd = timeToPercent(activeOut);

    // Cross-midnight shifts mapped on the timeline
    if (activeOut.getDate() !== new Date(shift.clockIn).getDate()) {
        const totalMinutesOut = 24 * 60 + activeOut.getHours() * 60 + activeOut.getMinutes();
        pEnd = Math.max(0, Math.min(100, ((totalMinutesOut - displayStartMin) / displayDur) * 100));
    }

    const dynamicWidth = Math.max(0.5, pEnd - pStart);
    const bgColor = sched?.color || '#b45309';

    const handleDragEnd = async () => {
        setIsDragging(false);
        if (dragOffsets.start === 0 && dragOffsets.end === 0) return;
        await onDragUpdate(shift.id, activeIn, activeOut || activeIn);
        setDragOffsets({ start: 0, end: 0 });
    };

    const handleDrag = (e, info, type) => {
        setIsDragging(true);
        const track = e.target.closest('.ring-inset');
        if (!track) return;
        const trackWidth = track.getBoundingClientRect().width;
        if (!trackWidth) return;

        const minutesPerPx = displayDur / trackWidth;
        const dragMins = info.offset.x * minutesPerPx;

        // Snap 15 phút
        const snappedMins = Math.round(dragMins / 15) * 15;

        if (type === 'start') {
            setDragOffsets(prev => ({ ...prev, start: snappedMins }));
        } else {
            setDragOffsets(prev => ({ ...prev, end: snappedMins }));
        }
    };

    const touchStyles = { touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' };

    const displayInTime = activeIn.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    const displayOutTime = activeOut ? activeOut.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '...';
    const computedHours = activeOut ? ((activeOut.getTime() - activeIn.getTime()) / (1000 * 60 * 60)) : shift.actualHours;

    // Pass position to popup external renderer
    useEffect(() => {
        if (isHighlighted && blockRef.current) {
            const rect = blockRef.current.getBoundingClientRect();
            onHighlightUpdate?.(rect);
        }
    }, [isHighlighted, pStart, dynamicWidth, isDragging, onHighlightUpdate]);

    const staffIds = sched?.staffIds || (sched?.staffId ? [sched.staffId] : []);
    const staffNames = staffIds.map(id => staffList?.find(st => st.id === id)?.name).filter(Boolean);

    return (
        <React.Fragment>
            <div
                ref={blockRef}
                onClick={(e) => {
                    e.stopPropagation();
                    if (!isDragging) {
                        const rect = e.currentTarget.getBoundingClientRect();
                        isHighlighted ? onBlur() : onFocus(shift.id, rect);
                    }
                }}
                className={`absolute top-[4px] bottom-[4px] rounded-none opacity-90 transition-all flex flex-col items-start overflow-hidden py-1 px-2 cursor-pointer border border-black/10 z-${isHighlighted ? '30' : '10'} ${isHighlighted ? 'ring-2 ring-gray-900 ring-offset-1 shadow-lg opacity-100 scale-y-105' : 'hover:opacity-100 group/block'} overflow-hidden shadow-sm`}
                style={{ left: `${pStart}%`, width: `${dynamicWidth}%`, backgroundColor: bgColor, ...touchStyles }}
            >
                {dynamicWidth > 15 ? (
                    <div className="flex flex-col gap-1.5 pointer-events-none w-full mt-0.5">
                        <span className="text-white font-black text-[12px] leading-none whitespace-nowrap drop-shadow-sm truncate tracking-tight">
                            {displayInTime} - {displayOutTime}
                        </span>
                        {!isPersonalReport && staffNames.length > 0 && (
                            <div className="flex flex-wrap gap-1 items-start w-full">
                                {staffNames.map((n, i) => (
                                    <span key={i} className="inline-flex items-center gap-0.5 bg-black/20 border border-white/20 text-white px-2 py-0.5 rounded-none text-[11px] font-black tracking-wide shadow-sm backdrop-blur-sm lowercase">
                                        {n}
                                        <X size={10} className="opacity-70 ml-0.5" />
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <span className={`text-[9px] font-black pointer-events-none m-auto text-white/90 whitespace-nowrap transition-opacity drop-shadow-md ${isHighlighted ? 'opacity-100' : 'opacity-0 group-hover/block:opacity-100'}`}>{computedHours?.toFixed(1) || 0}h</span>
                )}

                {isHighlighted && activeOut && (
                    <>
                        <motion.div
                            drag="x"
                            dragMomentum={false}
                            onDrag={(e, info) => handleDrag(e, info, 'start')}
                            onDragEnd={handleDragEnd}
                            className="absolute -left-4 top-1/2 -translate-y-1/2 w-8 h-10 bg-white border-2 border-gray-400 rounded-none shadow-lg flex items-center justify-center cursor-ew-resize z-40 opacity-95"
                            style={touchStyles}
                            onClick={e => e.stopPropagation()}
                            title="kéo giãn giờ vào"
                        >
                            <div className="flex gap-[2px]">
                                <div className="w-[2px] h-4 bg-gray-400 rounded-none" />
                                <div className="w-[2px] h-4 bg-gray-400 rounded-none" />
                            </div>
                        </motion.div>

                        <motion.div
                            drag="x"
                            dragMomentum={false}
                            onDrag={(e, info) => handleDrag(e, info, 'end')}
                            onDragEnd={handleDragEnd}
                            className="absolute -right-4 top-1/2 -translate-y-1/2 w-8 h-10 bg-white border-2 border-gray-400 rounded-none shadow-lg flex items-center justify-center cursor-ew-resize z-40 opacity-95"
                            style={touchStyles}
                            onClick={e => e.stopPropagation()}
                            title="kéo giãn giờ ra"
                        >
                            <div className="flex gap-[2px]">
                                <div className="w-[2px] h-4 bg-gray-400 rounded-none" />
                                <div className="w-[2px] h-4 bg-gray-400 rounded-none" />
                            </div>
                        </motion.div>
                    </>
                )}
            </div>
        </React.Fragment>
    );
};

// ── Staff Report Modal (Gantt-style Timeline) ──
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

    // Apply temporary actualHours mock for ongoing shifts so timeline maps correctly
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

    // Sort shifts chronologically (newest first for the log table)
    memberShifts.sort((a, b) => new Date(b.clockIn) - new Date(a.clockIn));

    // Group shifts by local Date string for the Timeline
    const shiftsByDate = {};
    const totalHoursPeriod = memberShifts.reduce((sum, s) => sum + (s.actualHours || 0), 0);

    memberShifts.forEach(shift => {
        const d = new Date(shift.clockIn);
        // Format as DD/MM
        const dateKey = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!shiftsByDate[dateKey]) {
            shiftsByDate[dateKey] = { dateObj: d, shifts: [], total: 0 };
        }
        shiftsByDate[dateKey].shifts.push(shift);
        shiftsByDate[dateKey].total += shift.actualHours || 0;
    });

    // Sort dates from oldest to newest for the timeline view
    const sortedDates = Object.entries(shiftsByDate).sort((a, b) => a[1].dateObj - b[1].dateObj);

    // Timeline Scale Limits Calculation (±1h from operational hours)
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
    if (displayEndMin <= displayStartMin) displayEndMin = displayStartMin + 60; // Fallback
    const displayDur = displayEndMin - displayStartMin;

    const firstTickH = Math.floor(displayStartMin / 60);
    const lastTickH = Math.ceil(displayEndMin / 60);
    const timelineHours = [];
    for (let h = firstTickH; h <= lastTickH; h += 2) {
        timelineHours.push(h); // every 2 hours
    }

    const hourlyRate = parseFloat(member.hourlyRate) || 0;
    const totalSalary = totalHoursPeriod * hourlyRate;

    const handleUpdateShift = async (shiftId) => {
        try {
            const shiftToEdit = memberShifts.find(s => s.id === shiftId);
            if (!shiftToEdit || !shiftToEdit.clockIn || !shiftToEdit.clockOut) return;

            // Extract the original dates. Force clockOutDate to originate from clockInDate 
            // so we don't accidentally preserve multi-day errors (e.g. 126 hours span).
            const clockInDate = new Date(shiftToEdit.clockIn);
            const clockOutDate = new Date(shiftToEdit.clockIn);

            // Parse new times
            const [startHour, startMinute] = editTempStartTime.split(':').map(Number);
            const [endHour, endMinute] = editTempEndTime.split(':').map(Number);

            if (isNaN(startHour) || isNaN(startMinute) || isNaN(endHour) || isNaN(endMinute)) {
                alert('Thời gian không hợp lệ');
                return;
            }

            // Apply new times to the existing Date objects to preserve the exact year/month/day
            clockInDate.setHours(startHour, startMinute, 0, 0);
            clockOutDate.setHours(endHour, endMinute, 0, 0);

            // If end time is earlier than start time, assume it crosses midnight
            if (clockOutDate <= clockInDate) {
                clockOutDate.setDate(clockOutDate.getDate() + 1);
            }

            // Calculate new duration in hours
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
                    setShifts(prev => prev.map(s => s.id === shiftId ? { ...s, ...updatedData, totalPay: Math.round(newHours * s.hourlyRate) } : s));
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
                    // Cập nhật lại list shifts dựa vào shift trả từ server (có update data và editHistory)
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
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="bg-white w-full max-w-5xl max-h-[95vh] flex flex-col shadow-2xl overflow-hidden rounded-none border border-gray-200">
                <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center z-10 flex-shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12  bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center font-black text-xl text-white shadow-inner rounded-none">
                            {member.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                        </div>
                        <div>
                            <h3 className="text-2xl font-black text-gray-900 uppercase tracking-widest">BÁO CÁO GIỜ LÀM: {member.name}</h3>
                            <p className="text-sm text-gray-500 font-medium mt-1">
                                VAI TRÒ: <span className="text-brand-600 font-bold uppercase">{member.role}</span> | TỔNG GIỜ LÀM: <span className="text-brand-600 font-black">{totalHoursPeriod.toFixed(1)}H</span>
                                {hourlyRate > 0 && <span className="ml-2 border-l border-gray-300 pl-2"> | mức lương: {formatVND(hourlyRate)}/h | <span className="text-green-600 font-black tracking-wider bg-green-100 px-3 py-1 rounded-none ml-1 uppercase shadow-sm">TỔNG LƯƠNG: {formatVND(totalSalary)}</span></span>}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-none text-gray-500 transition-all"><X size={24} /></button>
                </div>

                <div className="flex-1 overflow-y-auto w-full p-2 sm:p-6 space-y-4 sm:space-y-8 bg-gray-50/50 flex flex-col">
                    {/* Filters */}
                    <div className="flex flex-wrap gap-3 items-center">
                        <div className="flex gap-2">
                            <button onClick={() => setPeriod('7days')} className={`px-8 py-4 font-black text-sm tracking-widest border transition-all rounded-none uppercase ${period === '7days' ? 'bg-brand-50 text-brand-600 border-brand-200 shadow-md' : 'text-gray-400 border-gray-100 hover:bg-gray-50 bg-white'}`}>7 NGÀY</button>
                            <button onClick={() => setPeriod('month')} className={`px-8 py-4 font-black text-sm tracking-widest border transition-all rounded-none uppercase ${period === 'month' ? 'bg-brand-50 text-brand-600 border-brand-200 shadow-md' : 'text-gray-400 border-gray-100 hover:bg-gray-50 bg-white'}`}>30 NGÀY</button>
                            <button onClick={() => setPeriod('custom')} className={`px-8 py-4 font-black text-sm tracking-widest border transition-all rounded-none uppercase ${period === 'custom' ? 'bg-brand-50 text-brand-600 border-brand-200 shadow-md' : 'text-gray-400 border-gray-100 hover:bg-gray-50 bg-white'}`}>TÙY CHỌN</button>
                            <button onClick={() => setPeriod('all')} className={`px-8 py-4 font-black text-sm tracking-widest border transition-all rounded-none uppercase ${period === 'all' ? 'bg-brand-50 text-brand-600 border-brand-200 shadow-md' : 'text-gray-400 border-gray-100 hover:bg-gray-50 bg-white'}`}>TẤT CẢ</button>
                        </div>
                        {period === 'custom' && (
                            <div className="flex items-center gap-2 bg-white px-3 py-1.5 border border-gray-200 rounded-none text-sm">
                                <span className="font-bold text-gray-400">Từ</span>
                                <input type="date" className="outline-none font-bold text-gray-700" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} />
                                <span className="font-bold text-gray-400 ml-2">Đến</span>
                                <input type="date" className="outline-none font-bold text-gray-700" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} />
                            </div>
                        )}
                    </div>

                    {/* Timeline Gantt Chart */}
                    <div className="bg-white border border-gray-200 shadow-sm rounded-none overflow-hidden flex flex-col w-full">
                        <div className="bg-gray-50 px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                            <Clock size={16} className="text-brand-500" />
                            <h4 className="font-black text-sm text-gray-800 tracking-wider uppercase">BIỂU ĐỒ THỜI GIAN ({Math.round(displayDur / 60)}H)</h4>
                        </div>

                        <div className="p-4 overflow-x-auto w-full">
                            <div className="min-w-[700px] w-full">
                                {/* Timeline Header (Dynamic axes) */}
                                <div className="flex ml-20 mb-2 relative h-4 text-[10px] font-black text-gray-400">
                                    {timelineHours.map((h) => (
                                        <div key={h} className="absolute -translate-x-1/2 flex flex-col items-center" style={{ left: `${((h * 60 - displayStartMin) / displayDur) * 100}%` }}>
                                            <span>{h}h</span>
                                            <div className="w-px h-2 bg-gray-200 mt-1" />
                                        </div>
                                    ))}
                                </div>

                                {/* Timeline Body */}
                                <div className="space-y-3 relative pb-4">
                                    {/* Vertical grid lines */}
                                    <div className="absolute inset-y-0 left-20 right-0 pointer-events-none">
                                        {timelineHours.map((h) => (
                                            <div key={h} className="absolute top-0 bottom-0 w-px bg-gray-100" style={{ left: `${((h * 60 - displayStartMin) / displayDur) * 100}%` }} />
                                        ))}
                                    </div>

                                    {sortedDates.map(([dateKey, data]) => (
                                        <div key={dateKey} className="flex items-center gap-4 relative z-10 group hover:bg-gray-50/50 p-1 rounded-none transition-colors w-full">
                                            {/* Date Label */}
                                            <div className="w-16 flex-shrink-0 text-right">
                                                <span className="text-xs font-black text-gray-700">{dateKey}</span>
                                                <p className="text-[9px] text-gray-400 font-bold">{data.total.toFixed(1)}h</p>
                                            </div>

                                            {/* Timeline Track */}
                                            <div
                                                className="flex-1 h-12 bg-gray-100/50 rounded-none relative ring-1 ring-inset ring-gray-200 w-full min-w-0"
                                                onClick={() => setHighlightedShiftId(null)}
                                            >
                                                {/* Shift Render Block */}
                                                {data.shifts.map((shift) => {
                                                    const sched = schedules.find(sc => sc.id === shift.scheduleId);
                                                    const isHighlighted = shift.id === highlightedShiftId;

                                                    const performQuickEdit = () => {
                                                        setEditingShiftId(shift.id);
                                                        setEditTempStartTime(new Date(shift.clockIn).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }));
                                                        if (shift.clockOut) setEditTempEndTime(new Date(shift.clockOut).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }));
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
                                                            onFocus={(sid, rect) => {
                                                                setHighlightedShiftId(sid);
                                                            }}
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
                                        <div className="text-center py-8 text-gray-400 font-bold text-sm italic border-2 border-dashed border-gray-100 rounded-none ml-20 bg-white">Không có ca làm việc nào trong khoảng thời gian này.</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Detailed Logs Table */}
                    <div className="bg-white border border-gray-200 shadow-sm rounded-none overflow-hidden flex-1 flex flex-col min-h-[300px] w-full">
                        <div className="bg-gray-50 px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <ListOrdered size={16} className="text-brand-500" />
                                <h4 className="font-black text-sm text-gray-800 tracking-wider uppercase">NHẬT KÝ VÀO/RA CA CHI TIẾT</h4>
                            </div>
                            <span className="text-[10px] font-black text-gray-400 tracking-widest bg-white border border-gray-200 px-4 py-1.5 rounded-none uppercase">{memberShifts.length} lượt</span>
                        </div>
                        <div className="overflow-y-auto max-h-[400px] w-full">
                            <table className="w-full text-left bg-white table-fixed">
                                <thead className="sticky top-0 bg-white/95 backdrop-blur z-10 w-full table-fixed">
                                    <tr className="border-b border-gray-200 bg-gray-50/30">
                                        <th className="px-6 py-5 text-[10px] font-bold text-gray-400 tracking-widest w-[20%] uppercase">ngày</th>
                                        <th className="px-6 py-5 text-[10px] font-bold text-gray-400 tracking-widest w-[20%] uppercase">vào ca</th>
                                        <th className="px-6 py-5 text-[10px] font-bold text-gray-400 tracking-widest w-[20%] uppercase">kết thúc</th>
                                        <th className="px-4 py-5 text-[10px] font-bold text-brand-600 tracking-widest text-right w-[20%] uppercase">giờ làm</th>
                                        <th className="px-6 py-5 text-[10px] font-bold text-gray-400 tracking-widest text-center w-[20%] uppercase">thao tác</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 table-fixed w-full">
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
                                                <td className={`px-6 py-4 w-[25%]`}>
                                                    <div className="flex flex-col items-start gap-1">
                                                        <span className={`${isRowHighlighted ? 'font-black text-yellow-700' : 'font-medium text-gray-700'}`}>{date.toLocaleDateString('vi-VN')}</span>
                                                        {s.status === 'LATE' && <span className="text-[9px] font-medium text-red-500 bg-red-50 px-2 py-0.5 border border-red-100 flex items-center gap-1 w-fit rounded-none shadow-sm uppercase tracking-tighter" title="vào ca trễ hơn 10 phút"><AlertTriangle size={10} /> đi trễ</span>}
                                                        {s.status === 'UNSCHEDULED' && <span className="text-[9px] font-medium text-amber-500 bg-amber-50 px-2 py-0.5 border border-amber-100 flex items-center gap-1 w-fit rounded-none shadow-sm uppercase tracking-tighter" title="không có lịch hoặc sai ca"><AlertTriangle size={10} /> sai ca</span>}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 font-medium text-green-600 bg-green-50/20 w-[20%] flex items-center h-full">
                                                    {isEditing ? (
                                                        <input
                                                            type="time"
                                                            className="w-full bg-white border border-green-300 rounded-none p-1 text-center font-bold text-green-700 outline-none shadow-sm focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-all"
                                                            value={editTempStartTime}
                                                            onChange={e => setEditTempStartTime(e.target.value)}
                                                            autoFocus
                                                        />
                                                    ) : (
                                                        date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 font-medium text-amber-600 bg-amber-50/20 w-[20%]">
                                                    {isEditing ? (
                                                        <input
                                                            type="time"
                                                            className="w-full bg-white border border-amber-300 rounded-none p-1 text-center font-bold text-amber-700 outline-none shadow-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                                                            value={editTempEndTime}
                                                            onChange={e => setEditTempEndTime(e.target.value)}
                                                        />
                                                    ) : (
                                                        s.clockOut ? new Date(s.clockOut).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Đang làm...'
                                                    )}
                                                </td>
                                                <td className="px-4 py-4 text-right bg-brand-50/20 w-[20%]">
                                                    <span className="font-bold text-brand-600">{s.actualHours?.toFixed(2) || '0.00'}h</span>
                                                </td>
                                                <td className="px-6 py-4 text-center w-[20%]">
                                                    {isEditing ? (
                                                        <div className="flex items-center justify-center gap-2">
                                                            <button onClick={() => handleUpdateShift(s.id)} className="p-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-none shadow-sm transition-colors" title="Lưu lại">
                                                                <Save size={16} />
                                                            </button>
                                                            <button onClick={() => setEditingShiftId(null)} className="p-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-none transition-colors" title="Hủy bỏ">
                                                                <X size={16} />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center justify-center gap-2">
                                                            <button
                                                                disabled={!s.clockOut}
                                                                onClick={() => {
                                                                    setEditingShiftId(s.id);
                                                                    setEditTempStartTime(new Date(s.clockIn).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }));
                                                                    setEditTempEndTime(new Date(s.clockOut).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }));
                                                                }}
                                                                className={`p-1.5 rounded-none transition-colors ${!s.clockOut ? 'text-gray-300 cursor-not-allowed' : 'text-gray-400 hover:text-brand-600 hover:bg-brand-50'}`}
                                                                title="Sửa giờ làm"
                                                            >
                                                                <Edit2 size={16} />
                                                            </button>
                                                            {s.editHistory && s.editHistory.length > 0 && (
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); setHistoryShiftId(s.id); }}
                                                                    className="p-1.5 rounded-none transition-colors text-brand-500 hover:text-white hover:bg-brand-500 bg-brand-50 shadow-sm"
                                                                    title="Xem lịch sử chỉnh sửa"
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
                                    {memberShifts.length === 0 && (
                                        <tr>
                                            <td colSpan="5" className="px-6 py-12 text-center text-gray-400 font-bold italic uppercase tracking-widest">CHƯA CÓ DỮ LIỆU CHẤM CÔNG TRONG KỲ NÀY.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Global Doremon-style Tooltip Popover */}
            {popupData && popupData.shift.id === highlightedShiftId && (
                <div
                    className="fixed z-[1000] bg-white shadow-[0_10px_40px_rgba(0,0,0,0.15)] ring-1 ring-black/5 p-4 min-w-[240px] flex flex-col gap-2 rounded-none pointer-events-auto transition-transform duration-200 ease-out"
                    style={{
                        left: `${popupData.rect.left + popupData.rect.width / 2}px`,
                        top: `${popupData.rect.top - 12}px`,
                        transform: 'translate(-50%, -100%)'
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Tail arrow pointer */}
                    <div className="absolute top-[99%] left-1/2 -translate-x-1/2 w-0 h-0 border-x-[12px] border-x-transparent border-t-[12px] border-t-white z-10" />
                    <div className="absolute top-[100%] left-1/2 -translate-x-1/2 w-0 h-0 border-x-[13px] border-x-transparent border-t-[13px] border-t-black/10 z-0 drop-shadow-sm" />

                    <div className="text-xs font-black text-gray-800 text-center border-b border-gray-100 pb-2 uppercase tracking-wider">Chi Tiết Ca Làm</div>
                    <div className="text-[10px] text-center text-gray-500 bg-gray-50 border border-dashed border-gray-200 mb-1 p-1.5 rounded-none italic font-medium">Kéo 2 tay cầm ở trên để chỉnh giờ (±15 phút)</div>
                    <div className="flex justify-between items-center text-xs mt-1 uppercase">
                        <span className="text-gray-500 font-bold">GIỜ VÀO:</span>
                        <span className="font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-none">{new Date(popupData.shift.clockIn).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs uppercase">
                        <span className="text-gray-500 font-bold">GIỜ RA:</span>
                        <span className="font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-none">{popupData.shift.clockOut ? new Date(popupData.shift.clockOut).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : 'ĐANG LÀM'}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs border-t border-dashed border-gray-200 pt-2 mt-1 uppercase">
                        <span className="text-gray-500 font-bold tracking-wider text-[10px]">THỜI LƯỢNG:</span>
                        <span className="font-bold text-brand-600 text-base">{popupData.shift.actualHours?.toFixed(2) || '0.00'}H</span>
                    </div>

                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
                        <button
                            onClick={(e) => { e.stopPropagation(); popupData.onQuickEdit(); }}
                            className="flex-1 py-3 bg-brand-50 text-brand-600 hover:bg-brand-500 hover:text-white transition-colors text-[10px] font-black uppercase tracking-wider rounded-none flex items-center justify-center gap-1 shadow-md border border-brand-100"
                        >
                            <Edit2 size={12} /> SỬA NHANH
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); popupData.onBlur(); }}
                            className="flex-1 py-3 bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors text-[10px] font-black uppercase tracking-wider rounded-none flex items-center justify-center gap-1 shadow-md"
                        >
                            <X size={12} /> ĐÓNG
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

// ── Disciplinary Modal ──
const DisciplinaryModal = ({ member, logs, onSaveLog, onDeleteLog, onClose }) => {
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
                        <input type="date" className="admin-input flex-1 !p-2 !text-sm" value={draftLog.date} onChange={e => setDraftLog({ ...draftLog, date: e.target.value })} />
                        <div className="flex items-center gap-1 bg-white border border-gray-200 px-2">
                            <span className="text-[10px] font-bold text-gray-500 whitespace-nowrap uppercase">Trừ điểm</span>
                            <input type="number" className="outline-none bg-transparent w-full !text-red-500 font-black text-right pr-1" value={Math.abs(draftLog.pointsImpact)} onChange={e => setDraftLog({ ...draftLog, pointsImpact: -(Math.abs(parseFloat(e.target.value)) || 0) })} />
                        </div>
                    </div>
                    <input type="text" placeholder="Lý do (VD: Đi trễ 15p, Phục vụ sai sót...)" className="admin-input w-full mb-2 !p-2 !text-sm" value={draftLog.reason} onChange={e => setDraftLog({ ...draftLog, reason: e.target.value })} />
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
                                    <p className="text-[11px] text-gray-400 font-bold uppercase">{new Date(log.date || log.createdAt).toLocaleDateString('vi-VN')}</p>
                                    <p className="text-sm font-bold text-gray-800 break-words mt-0.5">{log.reason}</p>
                                </div>
                                <button onClick={() => { if (confirm('Xóa kỷ luật này và hoàn lại điểm?')) onDeleteLog(log.id); }} className="p-1.5 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-all opacity-0 group-hover:opacity-100 rounded-none shadow-sm"><Trash2 size={16} /></button>
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
const StaffModal = ({ member, onSave, onClose }) => {
    const [draft, setDraft] = useState(member?.id ? { ...member, newPin: '' } : { name: '', role: 'Nhân viên', phone: '', hourlyRate: 25, newPin: '', dailyLimit: 8, monthlyLimit: 200, diligencePoints: 100 });
    return (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="admin-modal-container max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden !p-0">
                <div className="flex-shrink-0 bg-white z-10 border-b border-gray-100 py-4 px-6 rounded-t-[32px]">
                    <h3 className="font-black text-gray-900 uppercase tracking-widest text-sm text-center m-0">Thông tin nhân viên</h3>
                </div>
                <div className="flex-1 overflow-y-auto space-y-4 p-6">
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase">Họ và tên</label>
                        <input autoFocus placeholder="Họ và tên" className="admin-input"
                            value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
                    </div>
                    {member?.id && (
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-red-500 uppercase flex items-center gap-1"><KeyRound size={12} /> Mã Khôi Phục (Dùng khi quên PIN)</label>
                            <div className="flex gap-2">
                                <input readOnly className="admin-input bg-red-50 text-red-700 font-mono tracking-widest uppercase flex-1" value={draft.recoveryCode || 'Chưa cập nhật'} />
                                <button onClick={() => { navigator.clipboard.writeText(draft.recoveryCode); alert('Đã sao chép: ' + draft.recoveryCode); }} className="bg-red-500 text-white px-3 py-2 rounded-none shadow-sm hover:bg-red-600 font-bold text-xs"><Copy size={14} /></button>
                            </div>
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-gray-400 uppercase">Vai trò</label>
                            <select className="admin-input"
                                value={draft.role} onChange={e => setDraft({ ...draft, role: e.target.value })}>
                                <option value="Quản lý">Quản lý</option>
                                <option value="Nhân viên">Nhân viên</option>
                                <option value="Pha chế">Pha chế</option>
                                <option value="Phục vụ">Phục vụ</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-gray-400 uppercase">Lương theo giờ</label>
                            <div className="flex items-center gap-2">
                                <input type="number" placeholder="VD: 25" className="admin-input"
                                    value={draft.hourlyRate} onChange={e => setDraft({ ...draft, hourlyRate: parseFloat(e.target.value) || 0 })} />
                                <span className="font-black text-gray-400 text-xs">k/h</span>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3 bg-brand-50/20 border border-brand-100 p-3 shadow-inner">
                        <label className="text-[10px] font-black text-brand-600 uppercase flex items-center gap-1"><Award size={14} /> Thiết lập Điểm & Lịch Làm</label>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-gray-500">Giờ chuẩn/Ngày</label>
                                <input type="number" className="admin-input !bg-white"
                                    value={draft.dailyLimit || 8} onChange={e => setDraft({ ...draft, dailyLimit: parseFloat(e.target.value) || 0 })} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-gray-500">Giờ tối đa/Tháng</label>
                                <input type="number" className="admin-input !bg-white"
                                    value={draft.monthlyLimit || 200} onChange={e => setDraft({ ...draft, monthlyLimit: parseFloat(e.target.value) || 0 })} />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-gray-500 flex items-center gap-1">Điểm chuyên cần (Default 100)</label>
                            <input type="number" className="admin-input !bg-white !text-green-600 !font-black"
                                value={draft.diligencePoints || 100} onChange={e => setDraft({ ...draft, diligencePoints: parseFloat(e.target.value) || 0 })} />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase">Mã PIN Đăng Nhập</label>
                        <input placeholder={member?.id ? "Để trống nếu không muốn đổi PIN" : "Nhập mã PIN 6 số"} className="admin-input"
                            value={draft.newPin || ''} onChange={e => setDraft({ ...draft, newPin: e.target.value.replace(/[^0-9]/g, '') })} maxLength={6} />
                        <p className="text-[9px] text-gray-400 italic mt-1 font-bold">Mã PIN dùng để nhận diện nhân viên trên máy POS và chấm công.</p>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase">Số điện thoại</label>
                        <input placeholder="Số điện thoại" className="admin-input"
                            value={draft.phone} onChange={e => setDraft({ ...draft, phone: e.target.value })} />
                    </div>
                </div>
                <div className="flex-shrink-0 flex gap-4 bg-white border-t border-gray-100 p-5 mt-auto relative z-10 rounded-b-[32px]">
                    <button onClick={onClose} className="admin-btn-secondary flex-1">HỦY</button>
                    <button onClick={() => {
                        if (!member?.id && (!draft.newPin || draft.newPin.length < 4)) {
                            alert('Vui lòng tạo mã PIN đăng nhập (ít nhất 4 số).');
                            return;
                        }
                        onSave(draft);
                    }} className="admin-btn-primary flex-1">LƯU NHÂN VIÊN</button>
                </div>
            </motion.div>
        </div>
    );
};

const DEFAULT_SUGAR = ['100%', '50%', '0%'];
const DEFAULT_ICE = ['Bình thường', 'Ít đá', 'Không đá'];

// ── Inline edit panel (with sizes + addons) ──
const InlineEditPanel = ({ item, inventory, inventoryStats = [], onSave, onCancel, onDraftChange, settings, stats30Days, totalFixed }) => {
    const [draft, setDraft] = useState({
        ...item,
        sizes: (item.sizes || [{ label: 'Nhỏ', volume: '200ml', priceAdjust: 0 }]).map(s => ({
            ...s,
            recipe: s.recipe || [],
            multiplier: s.multiplier ?? 1.0
        })),
        addons: item.addons || [],
        recipe: item.recipe || [],
        recipeInstructions: item.recipeInstructions || '',
        sugarOptions: item.sugarOptions ?? [...DEFAULT_SUGAR],
        iceOptions: item.iceOptions ?? [...DEFAULT_ICE],
    });

    const [isUploadingImage, setIsUploadingImage] = useState(false);
    const [showCostExplanation, setShowCostExplanation] = useState(false);

    useEffect(() => {
        if (onDraftChange) onDraftChange(draft);
    }, [draft, onDraftChange]);

    const updateSize = (idx, field, val) => {
        const next = [...draft.sizes];
        next[idx] = { ...next[idx], [field]: (field === 'priceAdjust' || field === 'multiplier') ? parseFloat(val) || 0 : val };
        setDraft({ ...draft, sizes: next });
    };
    const addSize = () => setDraft({ ...draft, sizes: [...draft.sizes, { label: '', volume: '', priceAdjust: 0, multiplier: 1.0, recipe: [] }] });
    const removeSize = (idx) => setDraft({ ...draft, sizes: draft.sizes.filter((_, i) => i !== idx) });

    const updateSizeRecipe = (idx, recipeIdx, field, val) => {
        const next = [...draft.sizes];
        const nextRecipe = [...(next[idx].recipe || [])];
        nextRecipe[recipeIdx] = { ...nextRecipe[recipeIdx], [field]: field === 'quantity' ? parseFloat(val) || 0 : val };
        next[idx] = { ...next[idx], recipe: nextRecipe };
        setDraft({ ...draft, sizes: next });
    };
    const addSizeRecipe = (idx) => {
        const next = [...draft.sizes];
        next[idx] = { ...next[idx], recipe: [...(next[idx].recipe || []), { ingredientId: '', quantity: 0 }] };
        setDraft({ ...draft, sizes: next });
    };
    const removeSizeRecipe = (idx, recipeIdx) => {
        const next = [...draft.sizes];
        next[idx] = { ...next[idx], recipe: (next[idx].recipe || []).filter((_, i) => i !== recipeIdx) };
        setDraft({ ...draft, sizes: next });
    };

    const updateAddon = (idx, field, val) => {
        const next = [...draft.addons];
        next[idx] = { ...next[idx], [field]: field === 'price' ? parseFloat(val) || 0 : val };
        setDraft({ ...draft, addons: next });
    };
    const generateAddonHotkey = (addons) => {
        if (!addons || addons.length === 0) return '1';
        const codes = addons.map(a => parseInt(a.addonCode || '0', 10)).filter(n => !isNaN(n));
        if (codes.length === 0) return '1';
        return (Math.max(...codes) + 1).toString();
    };

    const addAddon = () => {
        const newAddonCode = generateAddonHotkey(draft.addons);
        setDraft({ ...draft, addons: [...(draft.addons || []), { addonCode: newAddonCode, label: '', price: 0, recipe: [] }] });
    };
    const removeAddon = (idx) => setDraft({ ...draft, addons: draft.addons.filter((_, i) => i !== idx) });
    const moveAddon = (idx, direction) => {
        const targetIdx = idx + direction;
        if (targetIdx < 0 || targetIdx >= draft.addons.length) return;
        const next = [...draft.addons];
        const temp = next[idx];
        next[idx] = next[targetIdx];
        next[targetIdx] = temp;
        setDraft({ ...draft, addons: next });
    };

    const updateAddonRecipe = (idx, recipeIdx, field, val) => {
        const next = [...draft.addons];
        const nextRecipe = [...(next[idx].recipe || [])];
        nextRecipe[recipeIdx] = { ...nextRecipe[recipeIdx], [field]: field === 'quantity' ? parseInt(val, 10) || 0 : val };
        next[idx] = { ...next[idx], recipe: nextRecipe };
        setDraft({ ...draft, addons: next });
    };
    const addAddonRecipe = (idx) => {
        const next = [...draft.addons];
        next[idx] = { ...next[idx], recipe: [...(next[idx].recipe || []), { ingredientId: '', quantity: 0 }] };
        setDraft({ ...draft, addons: next });
    };
    const removeAddonRecipe = (idx, recipeIdx) => {
        const next = [...draft.addons];
        next[idx] = { ...next[idx], recipe: (next[idx].recipe || []).filter((_, i) => i !== recipeIdx) };
        setDraft({ ...draft, addons: next });
    };

    const updateRecipe = (idx, field, val) => {
        const next = [...draft.recipe];
        next[idx] = { ...next[idx], [field]: field === 'quantity' ? parseInt(val, 10) || 0 : val };
        setDraft({ ...draft, recipe: next });
    };
    const addRecipe = () => setDraft({ ...draft, recipe: [...draft.recipe, { ingredientId: '', quantity: 0 }] });
    const removeRecipe = (idx) => setDraft({ ...draft, recipe: draft.recipe.filter((_, i) => i !== idx) });

    const baseRecipeCost = (draft.recipe || []).reduce((sum, r) => {
        const stats = Array.isArray(inventoryStats) ? inventoryStats : [];
        const inv = stats.find(s => s.id === r.ingredientId);
        return sum + (inv ? (inv.avgCost || 0) * r.quantity : 0);
    }, 0);

    return (
        <>
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="bg-[#F9F8F6] border-t border-gray-100 p-4 space-y-4">
                    {/* Name + Price */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="admin-label">Tên món</label>
                            <input className="admin-input-small !text-lg !font-black !tracking-tight text-gray-900"
                                value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                            <label className="admin-label">Giá bán (nghìn ₫)</label>
                            <input className="admin-input-small !text-[#C68E5E] !font-black !text-lg"
                                type="number" value={draft.price} onChange={e => setDraft({ ...draft, price: e.target.value })} />
                        </div>
                    </div>


                    {/* Category */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="admin-label">Danh mục</label>
                            <select className="admin-input-small appearance-none !font-bold"
                                value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })}>
                                {(settings?.menuCategories || ['TRUYỀN THỐNG', 'PHA MÁY', 'Trà', 'Khác']).map(c => <option key={c} value={c}>{c}</option>)}
                                {(!settings?.menuCategories?.includes(draft.category) && draft.category) && <option value={draft.category}>{draft.category}</option>}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="admin-label">URL Hình ảnh (Nhập Link hoặc Tải Lên)</label>
                            <div className="flex gap-2 items-center">
                                <input className="admin-input-small flex-1 !text-brand-600 !font-semibold !text-sm"
                                    placeholder="http://..."
                                    value={draft.image || ''} onChange={e => setDraft({ ...draft, image: e.target.value })} />

                                <label className={`cursor-pointer bg-white px-3 py-2 border border-brand-200 text-brand-600 hover:bg-brand-50 transition-colors uppercase tracking-widest text-[10px] font-black rounded-none flex items-center gap-1 flex-shrink-0 ${isUploadingImage ? 'opacity-50 pointer-events-none' : ''}`}>
                                    {isUploadingImage ? <RefreshCw className="animate-spin" size={14} /> : <Upload size={14} />}
                                    {isUploadingImage ? 'ĐANG TẢI...' : 'TẢI TỪ MÁY TÍNH'}
                                    <input type="file" accept="image/*" className="hidden"
                                        onChange={async (e) => {
                                            const file = e.target.files[0];
                                            if (!file) return;
                                            setIsUploadingImage(true);
                                            const formData = new FormData();
                                            formData.append('image', file);
                                            try {
                                                const res = await fetch(`${SERVER_URL}/api/upload-image`, {
                                                    method: 'POST',
                                                    body: formData
                                                });
                                                const data = await res.json();
                                                if (res.ok) {
                                                    setDraft({ ...draft, image: data.url });
                                                } else {
                                                    alert(data.error || 'Lỗi khi tải ảnh lên');
                                                }
                                            } catch (err) {
                                                alert('Không thể kết nối với máy chủ.');
                                            }
                                            setIsUploadingImage(false);
                                        }}
                                    />
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* Description */}
                    <div className="space-y-1">
                        <label className="admin-label">Mô tả món</label>
                        <textarea className="admin-input-small !font-medium !text-gray-700 min-h-[80px]"
                            value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} />
                    </div>

                    {/* Sizes */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between bg-gray-600 p-2 px-3 rounded-none shadow-sm">
                            <label className="admin-label !mb-0 !text-white !text-[14px]">Kích thước / Dung tích</label>
                            <button onClick={addSize} className="text-[11px] font-bold text-gray-700 bg-white px-3 py-1.5 hover:bg-gray-50 transition-all flex items-center gap-1 shadow-sm rounded-none">
                                <Plus size={14} /> Thêm size
                            </button>
                        </div>
                        {draft.sizes.map((s, idx) => (
                            <div key={idx} className="bg-white border border-gray-200 p-3 shadow-sm flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                    <input placeholder="VD: M" className="w-12 flex-shrink-0 border-b-2 border-gray-100 font-black text-[15px] text-center outline-none bg-transparent focus:border-brand-600 transition-all"
                                        value={s.label} onChange={e => updateSize(idx, 'label', e.target.value)} />
                                    <input placeholder="Thể tích (350ml)" className="flex-1 min-w-[60px] border-b-2 border-gray-100 text-[15px] font-bold outline-none bg-transparent focus:border-brand-600 transition-all"
                                        value={s.volume} onChange={e => updateSize(idx, 'volume', e.target.value)} />
                                    <div className="flex items-center gap-1 flex-shrink-0 bg-brand-50/50 px-2 py-1 border border-brand-100">
                                        <span className="text-[9px] text-brand-500 font-extrabold uppercase">Hệ số</span>
                                        <input placeholder="1.0" className="w-10 font-black text-brand-600 text-center outline-none bg-transparent text-sm"
                                            type="number" step="0.1" value={s.multiplier || 1.0} onChange={e => updateSize(idx, 'multiplier', e.target.value)} />
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0 bg-orange-50/50 px-2 py-1 border border-orange-100">
                                        <span className="text-[10px] text-orange-500 font-black">±</span>
                                        <input placeholder="0" className="w-10 font-black text-orange-600 text-center outline-none bg-transparent text-sm"
                                            type="number" value={s.priceAdjust} onChange={e => updateSize(idx, 'priceAdjust', e.target.value)} />
                                        <span className="text-[10px] text-orange-500 font-black">k</span>
                                    </div>
                                    <button onClick={() => removeSize(idx)} className="flex-shrink-0 p-1.5 bg-red-50 text-red-500 hover:bg-red-100 transition-all shadow-sm">
                                        <X size={16} />
                                    </button>
                                </div>

                                {/* Cost/Profit analysis for this size */}
                                {(() => {
                                    const sizeMultiplier = s.multiplier || 1.0;
                                    const sizeSpecificCost = (s.recipe || []).reduce((sum, r) => {
                                        const stats = Array.isArray(inventoryStats) ? inventoryStats : [];
                                        const inv = stats.find(i => i.id === r.ingredientId);
                                        return sum + (inv ? (inv.avgCost || 0) * r.quantity : 0);
                                    }, 0);
                                    const totalCostForSize = (baseRecipeCost * sizeMultiplier) + sizeSpecificCost;
                                    const sellingPrice = (parseFloat(draft.price) || 0) + (s.priceAdjust || 0);
                                    const profit = sellingPrice - totalCostForSize;
                                    const profitMargin = sellingPrice > 0 ? Math.round((profit / sellingPrice) * 100) : 0;

                                    const projectedItems = stats30Days?.projectedMonthlyItems || 1;
                                    const fixedCostPerCup = projectedItems > 0 ? (totalFixed / 1000) / projectedItems : 0;
                                    const suggestedMinPrice = totalCostForSize + fixedCostPerCup;

                                    return (
                                        <div className="mt-2 space-y-2">
                                            <div className="grid grid-cols-3 gap-2 bg-gray-50/50 p-2 rounded-none border border-gray-100 items-start">
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter leading-snug">Giá NVL Cốt</span>
                                                    <span className="text-[12px] font-normal text-gray-900 mt-0.5">{formatVND(totalCostForSize)}</span>
                                                </div>
                                                <div onClick={() => setShowCostExplanation(true)} className="flex flex-col border-l border-amber-200 pl-2 cursor-pointer hover:bg-amber-50/80 bg-amber-50/30 transition-colors -my-2 py-2" title="Nhấn để xem giải thích chi tiết về Phí Cố Định">
                                                    <span className="flex items-center gap-1 text-[10px] text-amber-700 font-black uppercase tracking-tighter leading-snug">
                                                        *Phí Cố Định/Ly <Info size={10} className="text-amber-500" />
                                                    </span>
                                                    <span className="text-[12px] font-black text-amber-600 mt-0.5">{formatVND(fixedCostPerCup)}</span>
                                                </div>
                                                <div className="flex flex-col border-l border-brand-200 pl-2 bg-brand-50/50 -m-2 p-2" title="Mức giá tối thiểu để thu hồi vốn NVL + Lỗ hổng chi phí cố định">
                                                    <span className="text-[10px] text-brand-700 font-black uppercase tracking-tighter leading-snug cursor-help">*Giá Lập Đáy</span>
                                                    <span className="text-[12px] font-black text-brand-600 mt-0.5">&gt; {formatVND(Math.ceil(suggestedMinPrice))}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between px-1 bg-white border border-gray-100 p-2">
                                                <span className="text-[11px] text-gray-500 uppercase font-bold tracking-widest">Lợi nhuận gộp Size này: {sellingPrice > suggestedMinPrice ? '✅ LÃI TỐT' : (profit > 0 ? '⚠️ CHỈ ĐỦ VỐN NVL' : '❌ LỖ (ÂM VỐN)')}</span>
                                                <span className={`text-[12px] font-black ${profitMargin >= 65 ? 'text-green-600' : profitMargin >= 40 ? 'text-amber-500' : 'text-red-500'}`}>
                                                    {formatVND(profit)} ({profitMargin}%)
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* Size Recipe section */}
                                <div className="pl-4 border-l-2 border-dashed border-gray-200 space-y-2 mt-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] uppercase font-bold tracking-widest text-brand-700 bg-brand-100/50 px-2 py-1 rounded-none">Định lượng đi kèm Size</span>
                                        <button onClick={() => addSizeRecipe(idx)} className="text-[10px] font-bold text-brand-600 hover:text-brand-800 transition-all flex items-center gap-1 hover:bg-brand-100 px-2 py-1 rounded-none">
                                            <Plus size={14} /> THÊM
                                        </button>
                                    </div>
                                    {(s.recipe || []).map((r, recipeIdx) => (
                                        <div key={recipeIdx} className="flex items-center gap-2 bg-brand-50/30 p-2 border border-brand-50 text-sm">
                                            <select className="flex-1 bg-transparent font-normal outline-none text-gray-700 max-w-[150px] sm:max-w-none"
                                                value={r.ingredientId} onChange={e => updateSizeRecipe(idx, recipeIdx, 'ingredientId', e.target.value)}>
                                                <option value="">-- Chọn NL --</option>
                                                {inventory.map(inv => {
                                                    const stat = Array.isArray(inventoryStats) ? inventoryStats.find(s => s.id === inv.id) : null;
                                                    const avgCost = stat?.avgCost || inv.importPrice || 0;
                                                    const costStr = avgCost ? ` - ${formatVND(avgCost)}/${inv.unit}` : '';
                                                    return <option key={inv.id} value={inv.id}>{inv.name}{costStr}</option>;
                                                })}
                                            </select>
                                            <input className="w-16 bg-transparent font-normal text-brand-600 text-center outline-none border-b border-brand-100"
                                                type="number" step="1" value={r.quantity} onChange={e => updateSizeRecipe(idx, recipeIdx, 'quantity', e.target.value)} />
                                            <span className="text-xs text-brand-500 font-normal w-6">{inventory.find(inv => inv.id === r.ingredientId)?.unit}</span>
                                            <button onClick={() => removeSizeRecipe(idx, recipeIdx)} className="text-gray-300 hover:text-red-500"><X size={14} /></button>
                                        </div>
                                    ))}
                                    {(!s.recipe || s.recipe.length === 0) && (
                                        <p className="text-xs text-gray-500 italic">Không có nguyên liệu đi kèm</p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Add-ons */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between bg-gray-600 p-2 px-3 rounded-none shadow-sm">
                            <label className="admin-label !mb-0 !text-white !text-[14px]">Tùy chọn thêm (Add-ons)</label>
                            <button onClick={addAddon} className="text-[11px] font-bold text-gray-700 bg-white px-3 py-1.5 hover:bg-gray-50 transition-all flex items-center gap-1 shadow-sm rounded-none">
                                <Plus size={14} /> Thêm option
                            </button>
                        </div>
                        {draft.addons.map((a, idx) => (
                            <div key={idx} className="bg-white border border-gray-200 p-3 shadow-sm flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                    {/* Shortcut Addon */}
                                    <div className="flex-shrink-0 flex items-center gap-1 bg-yellow-50 px-2 py-1 border border-yellow-200 shadow-sm" title="Mã phím tắt Addon">
                                        <span className="text-[10px] font-normal text-yellow-600">⌨️</span>
                                        <input placeholder="Mã" className="w-5 text-center text-sm font-normal outline-none bg-transparent text-yellow-700"
                                            value={a.addonCode || ''} onChange={e => updateAddon(idx, 'addonCode', e.target.value)} />
                                    </div>
                                    <input placeholder="Tên tùy chọn" className="flex-1 min-w-[80px] border-b-2 border-gray-100 text-[15px] font-normal outline-none bg-transparent focus:border-brand-600 transition-all"
                                        value={a.label} onChange={e => updateAddon(idx, 'label', e.target.value)} />
                                    <div className="flex items-center gap-1 flex-shrink-0 bg-green-50/50 px-2 py-1 border border-green-100">
                                        <span className="text-[10px] text-green-500 font-normal">+</span>
                                        <input placeholder="0" className="w-10 font-normal text-green-600 text-center outline-none bg-transparent text-sm"
                                            type="number" value={a.price} onChange={e => updateAddon(idx, 'price', e.target.value)} />
                                        <span className="text-[10px] text-green-500 font-normal">k</span>
                                    </div>
                                    <div className="flex-shrink-0 flex items-center shadow-sm">
                                        <button disabled={idx === 0} onClick={() => moveAddon(idx, -1)} className="p-1.5 bg-gray-50 text-gray-400 hover:text-brand-500 hover:bg-brand-50 transition-all rounded-none border-r border-gray-100 disabled:opacity-30" title="Chuyển lên">
                                            <ArrowUp size={16} />
                                        </button>
                                        <button disabled={idx === draft.addons.length - 1} onClick={() => moveAddon(idx, 1)} className="p-1.5 bg-gray-50 text-gray-400 hover:text-brand-500 hover:bg-brand-50 transition-all border-r border-gray-100 disabled:opacity-30" title="Chuyển xuống">
                                            <ArrowDown size={16} />
                                        </button>
                                        <button onClick={() => removeAddon(idx)} className="p-1.5 bg-red-50 text-red-500 hover:bg-red-100 transition-all rounded-none" title="Xóa tùy chọn">
                                            <X size={16} />
                                        </button>
                                    </div>
                                </div>

                                {/* Addon Recipe section */}
                                <div className="pl-3 border-l-2 border-dashed border-gray-200 space-y-2 mt-1">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] uppercase font-bold tracking-widest text-brand-700 bg-brand-100/50 px-2 py-1 rounded-none">Định lượng đi kèm Add-on</span>
                                        <button onClick={() => addAddonRecipe(idx)} className="text-[10px] font-bold text-brand-700 hover:text-brand-800 transition-all flex items-center gap-1 hover:bg-brand-100 px-2 py-1 rounded-none">
                                            <Plus size={14} /> THÊM
                                        </button>
                                    </div>
                                    {(a.recipe || []).map((r, recipeIdx) => (
                                        <div key={recipeIdx} className="flex items-center gap-2 bg-brand-50/30 p-1.5 border border-brand-50 text-sm">
                                            <select className="flex-1 bg-transparent font-normal outline-none text-gray-700 max-w-[150px] sm:max-w-none text-[13px]"
                                                value={r.ingredientId} onChange={e => updateAddonRecipe(idx, recipeIdx, 'ingredientId', e.target.value)}>
                                                <option value="">-- Chọn NL --</option>
                                                {inventory.map(inv => {
                                                    const stat = Array.isArray(inventoryStats) ? inventoryStats.find(s => s.id === inv.id) : null;
                                                    const avgCost = stat?.avgCost || inv.importPrice || 0;
                                                    const costStr = avgCost ? ` - ${formatVND(avgCost)}/${inv.unit}` : '';
                                                    return <option key={inv.id} value={inv.id}>{inv.name}{costStr}</option>;
                                                })}
                                            </select>
                                            <input className="w-12 bg-transparent font-normal text-brand-600 text-center outline-none border-b border-brand-100 text-[13px]"
                                                type="number" step="1" value={r.quantity} onChange={e => updateAddonRecipe(idx, recipeIdx, 'quantity', e.target.value)} />
                                            <span className="text-[11px] text-brand-500 font-normal w-6">{inventory.find(inv => inv.id === r.ingredientId)?.unit}</span>
                                            {(() => {
                                                const stat = Array.isArray(inventoryStats) ? inventoryStats.find(s => s.id === r.ingredientId) : null;
                                                const invVal = inventory.find(i => i.id === r.ingredientId);
                                                const avgCost = stat?.avgCost || invVal?.importPrice || 0;
                                                const cost = avgCost * parseFloat(r.quantity || 0);
                                                return cost > 0 ? (
                                                    <span className="text-[11px] font-normal text-gray-500 tracking-tighter ml-auto pr-2">
                                                        ~ {formatVND(cost)}
                                                    </span>
                                                ) : <div className="ml-auto" />;
                                            })()}
                                            <button onClick={() => removeAddonRecipe(idx, recipeIdx)} className="text-gray-300 hover:text-red-500"><X size={14} /></button>
                                        </div>
                                    ))}
                                    {(!a.recipe || a.recipe.length === 0) && (
                                        <p className="text-xs text-gray-500 italic">Không có nguyên liệu đi kèm</p>
                                    )}

                                    {/* Cost/Profit analysis for Addon */}
                                    {(() => {
                                        const addonCost = (a.recipe || []).reduce((sum, r) => {
                                            const stats = Array.isArray(inventoryStats) ? inventoryStats : [];
                                            const stat = stats.find(i => i.id === r.ingredientId);
                                            const invItem = inventory.find(i => i.id === r.ingredientId);
                                            const avgCost = stat?.avgCost || invItem?.importPrice || 0;
                                            return sum + (avgCost * parseFloat(r.quantity || 0));
                                        }, 0);
                                        const addonSellingPrice = parseFloat(a.price || 0);
                                        const profit = addonSellingPrice - addonCost;
                                        const profitMargin = addonSellingPrice > 0 ? Math.round((profit / addonSellingPrice) * 100) : 0;

                                        if (addonCost === 0 && addonSellingPrice === 0) return null;

                                        return (
                                            <div className="flex justify-between items-center bg-gray-50/50 px-2 py-1.5 rounded-none border border-gray-100 mt-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[13px] text-gray-500 font-bold uppercase tracking-tighter">VỐN:</span>
                                                    <span className="text-[11px] font-normal text-gray-600">{formatVND(addonCost)}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[13px] text-gray-500 font-bold uppercase tracking-tighter">LÃI:</span>
                                                    <span className="text-[11px] font-normal text-gray-500 whitespace-nowrap">
                                                        <span className={`${profitMargin >= 65 ? 'text-green-600' : profitMargin >= 40 ? 'text-amber-500' : 'text-red-500'}`}>{formatVND(profit)}</span> ({profitMargin}%)
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                        ))}
                        {draft.addons.length === 0 && (
                            <p className="text-[11px] text-gray-400 font-bold text-center py-3 bg-gray-50 border-2 border-dashed border-gray-100">Chưa có tùy chọn nào</p>
                        )}
                    </div>

                    {/* Recipe Setup */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between bg-gray-600 p-2 px-3 rounded-none shadow-sm">
                            <label className="admin-label !mb-0 !text-white !text-[14px]">Định lượng nguyên liệu (Recipes)</label>
                            <button onClick={addRecipe} className="text-[11px] font-bold text-gray-700 bg-white px-3 py-1.5 hover:bg-gray-50 transition-all flex items-center gap-1 shadow-sm rounded-none">
                                <Plus size={14} /> Thêm định lượng
                            </button>
                        </div>
                        {draft.recipe.map((r, idx) => (
                            <div key={idx} className="bg-white border border-gray-200 p-3 flex flex-wrap items-center gap-2 shadow-sm">
                                <select className="flex-1 border-b-2 border-gray-100 text-[14px] font-normal outline-none bg-transparent focus:border-brand-600 transition-all min-w-[150px]"
                                    value={r.ingredientId} onChange={e => updateRecipe(idx, 'ingredientId', e.target.value)}>
                                    <option value="">-- Chọn nguyên liệu --</option>
                                    {inventory.map(inv => {
                                        const stat = Array.isArray(inventoryStats) ? inventoryStats.find(s => s.id === inv.id) : null;
                                        const avgCost = stat?.avgCost || inv.importPrice || 0;
                                        const costStr = avgCost ? ` - ${formatVND(avgCost)}/${inv.unit}` : '';
                                        return <option key={inv.id} value={inv.id}>{inv.name}{costStr}</option>;
                                    })}
                                </select>
                                <div className="flex items-center gap-1 flex-shrink-0 bg-brand-50/50 px-2 py-1 border border-brand-100">
                                    <input placeholder="Số lượng" className="w-12 font-normal text-brand-600 text-center outline-none bg-transparent text-sm"
                                        type="number" step="1" value={r.quantity} onChange={e => updateRecipe(idx, 'quantity', e.target.value)} />
                                    <span className="text-[11px] text-brand-500 font-normal">
                                        {inventory.find(inv => inv.id === r.ingredientId)?.unit || ''}
                                    </span>
                                </div>
                                <button onClick={() => removeRecipe(idx)} className="p-2 text-gray-300 hover:text-red-500 transition-all">
                                    <X size={20} />
                                </button>
                            </div>
                        ))}
                        {draft.recipe.length === 0 && (
                            <p className="text-xs text-gray-300 font-bold text-center py-4 bg-gray-50  border-2 border-dashed border-gray-100">Chưa thiết lập định lượng</p>
                        )}
                    </div>

                    {/* Preparation Instructions */}
                    <div className="space-y-1">
                        <label className="admin-label">Cách làm / Hướng dẫn chế biến (Tùy chọn)</label>
                        <textarea
                            className="admin-input-small !font-medium !text-gray-700 min-h-[100px]"
                            placeholder="VD: B1: Cho 30ml cốt cafe vào ly..."
                            value={draft.recipeInstructions}
                            onChange={e => setDraft({ ...draft, recipeInstructions: e.target.value })}
                        />
                    </div>

                    {/* Sugar & Ice Options Grid (Minimalist) */}
                    <div className="mt-4 pt-4 border-t border-gray-100">
                        <div className="grid grid-cols-2 gap-8">
                            {/* Sugar Options */}
                            <div>
                                <h4 className="font-black text-gray-900 text-[13px] tracking-wider uppercase mb-3 text-center border-b pb-2">Đường</h4>
                                <div className="flex flex-col gap-2">
                                    {DEFAULT_SUGAR.map(val => {
                                        const active = draft.sugarOptions.includes(val);
                                        const sortedOpts = draft.sugarOptions.slice().sort((a, b) => DEFAULT_SUGAR.indexOf(a) - DEFAULT_SUGAR.indexOf(b));
                                        const isDefault = draft.defaultSugar ? (draft.defaultSugar === val) : (sortedOpts[0] === val);
                                        return (
                                            <div key={val} className="flex items-center justify-between group px-2 py-1.5 hover:bg-gray-50 rounded-none transition-colors">
                                                <label className="flex items-center gap-3 cursor-pointer">
                                                    <input 
                                                        type="checkbox"
                                                        checked={active}
                                                        onChange={(e) => {
                                                            setDraft(d => {
                                                                const newOpts = e.target.checked ? [...d.sugarOptions, val] : d.sugarOptions.filter(v => v !== val);
                                                                return { ...d, sugarOptions: newOpts, defaultSugar: (!e.target.checked && newOpts.length === 1) ? newOpts[0] : (d.defaultSugar === val && e.target.checked ? (newOpts[newOpts.length - 1] || null) : d.defaultSugar) };
                                                            });
                                                        }}
                                                        className="w-4 h-4 text-amber-500 rounded border-gray-300 focus:ring-amber-500 cursor-pointer"
                                                    />
                                                    <span className={`text-[13px] ${active ? 'font-black text-gray-900' : 'font-medium text-gray-500'}`}>{val}</span>
                                                </label>
                                                
                                                {active && (
                                                    <input 
                                                        type="radio"
                                                        name={`defaultSugar_${item?.id || 'new'}`}
                                                        checked={isDefault}
                                                        onChange={() => setDraft(d => ({ ...d, defaultSugar: val }))}
                                                        className="w-3.5 h-3.5 text-amber-600 border-gray-300 focus:ring-amber-500 cursor-pointer opacity-50 group-hover:opacity-100 transition-opacity"
                                                        title="Chọn mức mặc định"
                                                    />
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Ice Options */}
                            <div>
                                <h4 className="font-black text-gray-900 text-[13px] tracking-wider uppercase mb-3 text-center border-b pb-2">Đá</h4>
                                <div className="flex flex-col gap-2">
                                    {DEFAULT_ICE.map(val => {
                                        const active = draft.iceOptions.includes(val);
                                        const sortedOpts = draft.iceOptions.slice().sort((a, b) => DEFAULT_ICE.indexOf(a) - DEFAULT_ICE.indexOf(b));
                                        const isDefault = draft.defaultIce ? (draft.defaultIce === val) : (sortedOpts[0] === val);
                                        return (
                                            <div key={val} className="flex items-center justify-between group px-2 py-1.5 hover:bg-gray-50 rounded-none transition-colors">
                                                <label className="flex items-center gap-3 cursor-pointer">
                                                    <input 
                                                        type="checkbox"
                                                        checked={active}
                                                        onChange={(e) => {
                                                            setDraft(d => {
                                                                const newOpts = e.target.checked ? [...d.iceOptions, val] : d.iceOptions.filter(v => v !== val);
                                                                return { ...d, iceOptions: newOpts, defaultIce: (!e.target.checked && newOpts.length === 1) ? newOpts[0] : (d.defaultIce === val && e.target.checked ? (newOpts[newOpts.length - 1] || null) : d.defaultIce) };
                                                            });
                                                        }}
                                                        className="w-4 h-4 text-brand-500 rounded border-gray-300 focus:ring-brand-500 cursor-pointer"
                                                    />
                                                    <span className={`text-[13px] ${active ? 'font-black text-gray-900' : 'font-medium text-gray-500'}`}>{val}</span>
                                                </label>
                                                
                                                {active && (
                                                    <input 
                                                        type="radio"
                                                        name={`defaultIce_${item?.id || 'new'}`}
                                                        checked={isDefault}
                                                        onChange={() => setDraft(d => ({ ...d, defaultIce: val }))}
                                                        className="w-3.5 h-3.5 text-brand-600 border-gray-300 focus:ring-brand-500 cursor-pointer opacity-50 group-hover:opacity-100 transition-opacity"
                                                        title="Chọn mức mặc định"
                                                    />
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                        
                        {/* Legend / Note */}
                        <div className="mt-5 pt-3 border-t border-gray-50 flex items-center justify-center gap-8 text-[11px] text-gray-500 font-medium italic">
                            <div className="flex items-center gap-2">
                                <span className="w-3.5 h-3.5 border-2 border-gray-400 rounded-sm inline-block" />
                                Chọn mức hiển thị
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-3.5 h-3.5 border-2 border-gray-400 rounded-full inline-block flex items-center justify-center"><div className="w-1.5 h-1.5 bg-gray-400 rounded-full"></div></span>
                                Chọn mức mặc định
                            </div>
                        </div>
                    </div>

                {/* Actions */}
                    <div className="flex gap-4 pt-4">
                        <button onClick={onCancel} className="admin-btn-secondary">Hủy</button>
                        <button
                            disabled={!draft.name || draft.submitting}
                            onClick={async () => {
                                setDraft(d => ({ ...d, submitting: true }));
                                await onSave(draft);
                                setDraft(d => ({ ...d, submitting: false }));
                            }}
                            className={`admin-btn-primary ${(!draft.name || draft.submitting) ? 'opacity-50 cursor-not-allowed' : ''}`}>
                            {draft.submitting ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white  animate-spin" />
                            ) : (
                                <Save size={20} />
                            )}
                            {draft.submitting ? ' Đang lưu...' : ' Lưu thay đổi'}
                        </button>
                    </div>
                </div>
            </motion.div >

            {/* Cost Explanation Modal */}
            {showCostExplanation && createPortal(
                <div className="fixed inset-0 z-[99999] bg-slate-900/60 backdrop-blur-sm flex justify-center items-center p-4">
                    <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                        className="bg-white p-6 max-w-sm w-full shadow-2xl space-y-5 rounded-none border-t-4 border-amber-500 relative">
                        <button onClick={() => setShowCostExplanation(false)} className="absolute top-4 right-4 text-gray-400 hover:text-red-500 transition-colors">
                            <X size={20} />
                        </button>
                        <div className="space-y-1 pr-6">
                            <h3 className="text-lg font-black text-gray-900 flex items-center gap-2 uppercase tracking-tight">
                                <Info size={20} className="text-amber-500" /> Giải thích Phí Cố Định
                            </h3>
                            <p className="text-[13px] font-medium text-gray-500 leading-relaxed">
                                Tại sao mỗi ly nước lại phải cõng thêm một khoản phí vô hình?
                            </p>
                        </div>

                        <div className="bg-amber-50 border border-amber-200 p-4 space-y-2 text-[13px] text-amber-900 shadow-inner">
                            <p className="leading-relaxed">
                                Ngoài tiền Nguyên Vật Liệu (NVL), quán của bạn mỗi tháng đều phải chi trả các khoản phí <strong>không thay đổi</strong> dù bán được ít hay nhiều:
                            </p>
                            <ul className="list-disc pl-4 font-bold space-y-1 text-amber-800 tracking-tight">
                                <li>Mặt bằng & Khấu hao thiết bị</li>
                                <li>Tiền Điện, Tiền Nước</li>
                                <li>Lương nhân sự cứng</li>
                                <li>Wifi, Rác, Phần mềm...</li>
                            </ul>
                        </div>

                        <div className="bg-gray-50 border border-gray-100 p-4 space-y-3 shadow-sm">
                            <p className="text-[11px] text-gray-500 font-black uppercase tracking-widest">Cách hệ thống phân bổ:</p>
                            <div className="flex justify-between items-center bg-white p-2.5 border border-gray-100 shadow-sm">
                                <span className="text-xs font-bold text-gray-600">A. Tổng CF Cố định (tháng)</span>
                                <span className="text-sm font-black text-amber-600">{formatVND(totalFixed / 1000)}</span>
                            </div>
                            <div className="flex justify-between items-center bg-white p-2.5 border border-gray-100 shadow-sm mt-1.5">
                                <span className="text-xs font-bold text-gray-600">B. Lượng ly bán dự phóng</span>
                                <span className="text-sm font-black text-brand-600">~{Math.round(stats30Days?.projectedMonthlyItems || 1)} ly/tháng</span>
                            </div>
                            <div className="border-t-2 border-dashed border-gray-200 pt-3 mt-1 flex justify-between items-center">
                                <span className="text-xs font-black text-gray-800 uppercase tracking-tighter">Phí gánh / 1 ly (A ÷ B)</span>
                                <span className="text-lg font-black text-red-500">{formatVND((stats30Days?.projectedMonthlyItems || 1) > 0 ? (totalFixed / 1000) / (stats30Days?.projectedMonthlyItems || 1) : 0)}</span>
                            </div>
                        </div>

                        <div className="bg-brand-50 text-brand-800 p-3 text-[13px] font-medium border-l-4 border-brand-500 leading-relaxed shadow-sm">
                            Chỉ khi bạn bán <strong>CAO HƠN Giá Lập Đáy</strong> thì quán mới thực sự sinh lời sau khi trừ cả vốn NVL lẫn các phí duy trì!
                        </div>

                        <button onClick={() => setShowCostExplanation(false)}
                            className="w-full bg-slate-900 text-white font-black uppercase tracking-widest py-3.5 text-xs hover:bg-brand-600 active:scale-95 transition-all shadow-md">
                            Đã Hiểu Cách Tính
                        </button>
                    </motion.div>
                </div>,
                document.body
            )}
        </>
    );
};

// ── Staff Order Panel ──
// ── Staff Order Panel (POS) ──
// --- Hook Bắt phím Enter đúp (Tận dụng để gọi Checkout Nhanh) ---
const ShortcutDoubleEnter = ({ onDoubleEnter }) => {
    const lastEnterRef = useRef(0);

    useEffect(() => {
        const handleKeyDown = (e) => {
            const tag = document.activeElement?.tagName?.toLowerCase() || '';
            const isEditable = document.activeElement?.isContentEditable;
            // Không trigger đúp khi người dùng đang ở trong ô text hoặc input form
            if (['input', 'textarea', 'select'].includes(tag) || isEditable) return;

            if (e.key === 'Enter' || e.key === 'NumpadEnter') {
                const now = Date.now();
                if (now - lastEnterRef.current < 400) {
                    // Double Enter detected!
                    onDoubleEnter();
                    lastEnterRef.current = 0; // Reset
                } else {
                    lastEnterRef.current = now;
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown, { capture: true });
        return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
    }, [onDoubleEnter]);

    return null;
};

// ── Internal: Component POS thật, được bọc bởi ShortcutProvider bên dưới ──
const StaffOrderPanelInner = ({ menu, tables, promotions = [], initialTableId, initialOrder, onClose, settings, onRegisterShortcutAdd }) => {
    const [cart, setCart] = useState(initialOrder?.cartItems || []);
    const [promoCodeInput, setPromoCodeInput] = useState(initialOrder?.appliedPromoCode || '');
    const [selectedItem, setSelectedItem] = useState(null);
    const [selectedTableId, setSelectedTableId] = useState(initialOrder?.tableId || initialTableId || null);
    const [showCheckout, setShowCheckout] = useState(false);
    const [receivedAmount, setReceivedAmount] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('Chuyển khoản');
    const [selectedSize, setSelectedSize] = useState(null);
    const [selectedAddons, setSelectedAddons] = useState([]);
    const [selectedSugar, setSelectedSugar] = useState('100%');
    const [selectedIce, setSelectedIce] = useState('Bình thường');
    const [itemNote, setItemNote] = useState('');
    const [customerName, setCustomerName] = useState(initialOrder?.customerName || '');
    const [orderNote, setOrderNote] = useState(initialOrder?.note || '');
    const [orderSource, setOrderSource] = useState(initialOrder?.orderSource || 'INSTORE');
    const [tagNumber, setTagNumber] = useState(initialOrder?.tagNumber || '');
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [activeCategory, setActiveCategory] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortOption, setSortOption] = useState('shortcut'); // Thêm state sắp xếp
    const [editingCartItemId, setEditingCartItemId] = useState(null);
    const [gridColumns, setGridColumns] = useState(() => parseInt(localStorage.getItem('posGridColumns')) || 4);

    useEffect(() => {
        localStorage.setItem('posGridColumns', gridColumns.toString());
    }, [gridColumns]);

    const getVietQR = (amount, orderRef = '') => {
        const BANK_ID = settings.bankId || 'MB';
        const ACCOUNT_NO = settings.accountNo || '0123456789';
        const ACCOUNT_NAME = settings.accountName || 'TH-POS';
        const amountVND = Math.round(amount * 1000);
        const memo = orderRef ? `DH ${orderRef}` : (settings.shopName || 'TH-POS');
        const desc = encodeURIComponent('Thanh toan ' + memo);
        return `https://img.vietqr.io/image/${BANK_ID}-${ACCOUNT_NO}-compact2.png?amount=${amountVND}&addInfo=${desc}&accountName=${encodeURIComponent(ACCOUNT_NAME)}`;
    };

    // Auto push QR to Kiosk when Checkout Modal opens and default method is 'Chuyển khoản'
    useEffect(() => {
        if (showCheckout && cart.length > 0 && paymentMethod === 'Chuyển khoản' && settings.autoPushPaymentQr !== false) {
            const currentTotal = cart.reduce((s, c) => s + (c.totalPrice * c.count), 0);
            fetch(`${SERVER_URL}/api/pos/checkout/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: currentTotal,
                    orderId: initialOrder ? initialOrder.id : `${String(_idCounter).padStart(4, '0')}${String(getVNTime().getUTCDate()).padStart(2, '0')}${String(getVNTime().getUTCMonth() + 1).padStart(2, '0')}${String(getVNTime().getUTCFullYear()).slice(-2)}`
                })
            }).catch(e => console.error("Kiosk start checkout error", e));
        }
    }, [showCheckout]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Phím tắt cho Checkout Modal: Esc = Quay lại | Enter = Xác nhận & In bill ──
    useEffect(() => {
        if (!showCheckout) return;

        const handleCheckoutKey = async (e) => {
            // Không kích hoạt khi đang gõ trong ô input (ví dụ: nhập số tiền mặt)
            const tag = document.activeElement?.tagName?.toLowerCase() || '';
            if (['input', 'textarea', 'select'].includes(tag)) return;

            if ((e.key === 'Escape' || (e.key === 'Backspace' && !isInputFocused()))) {
                e.preventDefault();
                // Giống nút QUAY LẠI
                if (paymentMethod === 'Chuyển khoản' || paymentMethod === 'Momo') {
                    await fetch(`${SERVER_URL}/api/pos/checkout/stop`, { method: 'POST' });
                }
                setShowCheckout(false);
            } else if (e.key === 'Enter' || e.key === 'NumpadEnter') {
                e.preventDefault();
                if (submitting || success) return;
                // Giống nút XÁC NHẬN & IN BILL
                if (paymentMethod !== 'Chuyển khoản') {
                    await fetch(`${SERVER_URL}/api/pos/checkout/stop`, { method: 'POST' });
                }
                submitOrder();
                setShowCheckout(false);
            }
        };

        window.addEventListener('keydown', handleCheckoutKey, { capture: true });
        return () => window.removeEventListener('keydown', handleCheckoutKey, { capture: true });
    }, [showCheckout, paymentMethod, submitting, success]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Phím tắt POS chung (Esc để hủy, '+' để chuyển nguồn đơn) ──
    useEffect(() => {
        const handlePosKey = (e) => {
            if (showCheckout) return;

            // Không bắt phím tắt nếu đang gõ text (vd tìm kiếm)
            const tag = document.activeElement?.tagName?.toLowerCase() || '';
            const isInput = ['input', 'textarea', 'select'].includes(tag);

            if ((e.key === 'Escape' || (e.key === 'Backspace' && !isInputFocused()))) {
                if (isInput) return;
                e.preventDefault();
                if (selectedItem) {
                    setSelectedItem(null);
                } else {
                    onClose();
                }
            } else if ((e.key === '+' || e.code === 'NumpadAdd') && !isInput) {
                if (settings?.enableDeliveryApps !== false) {
                    e.preventDefault();
                    setOrderSource(prev => {
                        if (prev === 'INSTORE') return 'GRAB';
                        if (prev === 'GRAB') return 'SHOPEE';
                        return 'INSTORE';
                    });
                }
            }
        };
        window.addEventListener('keydown', handlePosKey, { capture: true });
        return () => window.removeEventListener('keydown', handlePosKey, { capture: true });
    }, [showCheckout, selectedItem, onClose, settings?.enableDeliveryApps]);

    const sortedCategories = getSortedCategories(menu, settings);
    const categories = ['All', ...sortedCategories];

    const normalizeString = (str) => {
        return str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().replace(/\s+/g, '') : '';
    };

    const isSubsequence = (search, text) => {
        if (!search) return true;
        let i = 0, j = 0;
        while (i < search.length && j < text.length) {
            if (search[i] === text[j]) i++;
            j++;
        }
        return i === search.length;
    };

    const normalizedQuery = normalizeString(searchQuery);

    // Logic lọc và sắp xếp
    const filtered = menu
        .filter(i => {
            if (activeCategory !== 'All' && i.category !== activeCategory) return false;
            if (!searchQuery) return true;

            // 1. Phù hợp chuỗi gốc chính xác
            if (i.name.toLowerCase().includes(searchQuery.toLowerCase())) return true;

            // 2. Phù hợp mã phím tắt
            if (i.shortcutCode && i.shortcutCode.toString().toLowerCase().includes(searchQuery.toLowerCase())) return true;

            // 3. Phù hợp chuỗi viết tắt / không dấu (Fuzzy match subsequence)
            // Ví dụ: "cfm" chứa trong "cafemuoi" -> match!
            const normalizedName = normalizeString(i.name);
            return isSubsequence(normalizedQuery, normalizedName);
        })
        .sort((a, b) => {
            if (sortOption === 'name') {
                return a.name.localeCompare(b.name);
            } else if (sortOption === 'category') {
                return a.category.localeCompare(b.category) || a.name.localeCompare(b.name);
            } else {
                // Default: sort by shortcutCode numerically if numeric, otherwise alphabetically
                const aCode = Number(a.shortcutCode);
                const bCode = Number(b.shortcutCode);

                // Cả hai ng đều là số nguyên thì sort theo số
                if (!isNaN(aCode) && !isNaN(bCode)) return aCode - bCode;
                // Có string thì dạt string xuống dưới hoặc sort chữ cái
                return (a.shortcutCode || '').localeCompare(b.shortcutCode || '');
            }
        });

    const openItem = (item, editItem = null) => {
        setSelectedItem(item);
        if (editItem) {
            setEditingCartItemId(editItem.id);
            setSelectedSize(editItem.size);
            setSelectedAddons(editItem.addons || []);
            setSelectedSugar(editItem.sugar);
            setSelectedIce(editItem.ice);
            setItemNote(editItem.note || '');
        } else {
            setEditingCartItemId(null);
            setSelectedSize(item.sizes?.[0] || null);
            setSelectedAddons([]);
            const sugars = (item.sugarOptions?.length ? item.sugarOptions : DEFAULT_SUGAR).slice().sort((a, b) => DEFAULT_SUGAR.indexOf(a) - DEFAULT_SUGAR.indexOf(b));
            const ices = (item.iceOptions?.length ? item.iceOptions : DEFAULT_ICE).slice().sort((a, b) => DEFAULT_ICE.indexOf(a) - DEFAULT_ICE.indexOf(b));
            setSelectedSugar(item.defaultSugar || sugars[0]);
            setSelectedIce(item.defaultIce || ices[0]);
            setItemNote('');
        }
    };

    const toggleAddon = (addon) => {
        setSelectedAddons(prev => prev.find(a => a.label === addon.label)
            ? prev.filter(a => a.label !== addon.label)
            : [...prev, addon]);
    };

    const addToCart = () => {
        const threshold = selectedItem.availablePortions;
        if (threshold !== null && threshold !== undefined) {
            const currentCountInCart = cart.filter(c => c.item.id === selectedItem.id && c.id !== editingCartItemId).reduce((sum, c) => sum + c.count, 0);
            if (currentCountInCart + 1 > threshold) {
                alert(`Số lượng khả dụng của món này chỉ còn ${threshold} phần!`);
                return;
            }
        }

        const totalPrice = parseFloat(selectedItem.price) + (selectedSize?.priceAdjust || 0) + selectedAddons.reduce((s, a) => s + a.price, 0);

        if (editingCartItemId !== null) {
            setCart(cart.map(c => c.id === editingCartItemId ? {
                ...c,
                size: selectedSize,
                addons: [...selectedAddons],
                sugar: selectedSugar,
                ice: selectedIce,
                note: itemNote,
                totalPrice: totalPrice
            } : c));
        } else {
            const cartItem = {
                id: Date.now() + Math.random(),
                item: selectedItem,
                size: selectedSize,
                addons: [...selectedAddons],
                sugar: selectedSugar,
                ice: selectedIce,
                count: 1,
                note: itemNote,
                totalPrice: totalPrice
            };
            setCart([...cart, cartItem]);
        }
        setSelectedItem(null);
        setEditingCartItemId(null);
    };

    // ── Hàm nhận sự kiện từ Shortcut (gõ phím tắt xác nhận bằng Enter) ──
    const handleShortcutAdd = useCallback((mainItem, toppings, shortcutSize, shortcutSugar, shortcutIce, shortcutQuantity = 1) => {
        if (!mainItem) return;
        if (mainItem.isSoldOut) {
            alert('Món này đã hết hàng!');
            return;
        }

        const threshold = mainItem.availablePortions;
        if (threshold !== null && threshold !== undefined) {
            const currentCountInCart = cart.filter(c => c.item.id === mainItem.id).reduce((sum, c) => sum + c.count, 0);
            let qtyToAdd = shortcutQuantity || 1;
            if (currentCountInCart + qtyToAdd > threshold) {
                alert(`Số lượng khả dụng của món này chỉ còn ${threshold} phần!`);
                return;
            }
        }

        const size = shortcutSize || mainItem.sizes?.[0] || null;
        const sugars = (mainItem.sugarOptions?.length ? mainItem.sugarOptions : DEFAULT_SUGAR).slice().sort((a, b) => DEFAULT_SUGAR.indexOf(a) - DEFAULT_SUGAR.indexOf(b));
        const ices = (mainItem.iceOptions?.length ? mainItem.iceOptions : DEFAULT_ICE).slice().sort((a, b) => DEFAULT_ICE.indexOf(a) - DEFAULT_ICE.indexOf(b));
        const sugar = shortcutSugar || mainItem.defaultSugar || sugars[0] || '100%';
        const ice = shortcutIce || mainItem.defaultIce || ices[0] || 'Bình thường';
        const basePrice = parseFloat(mainItem.price) || 0;
        const sizePrice = size?.priceAdjust || 0;

        // toppings nhận từ ShortcutManager lúc này mang object tương thích với addon thật
        const mappedAddons = toppings.map(t => ({
            label: t.label || t.name,
            price: parseFloat(t.price) || 0,
            addonCode: t.addonCode || t.shortcutCode
        }));

        const toppingPrice = mappedAddons.reduce((s, t) => s + t.price, 0);

        const cartItem = {
            id: Date.now() + Math.random(),
            item: mainItem,
            size,
            addons: mappedAddons,
            sugar,
            ice,
            count: shortcutQuantity || 1,
            note: '',
            totalPrice: basePrice + sizePrice + toppingPrice,
        };
        setCart(prev => [...prev, cartItem]);
    }, []);

    // ── Đăng ký callback với wrapper ShortcutProvider ──
    // Mỗi khi handleShortcutAdd thay đổi (sau setState mới), cập nhật ref bên ngoài
    useEffect(() => {
        if (typeof onRegisterShortcutAdd === 'function') {
            onRegisterShortcutAdd(handleShortcutAdd);
        }
    }, [handleShortcutAdd, onRegisterShortcutAdd]);

    const removeFromCart = (id) => setCart(cart.filter(c => c.id !== id));


    const [selectedPromoId, setSelectedPromoId] = useState(null);

    const calculateCart = () => {
        let effectiveCart = cart;
        const feePercent = settings?.deliveryAppsConfigs?.[orderSource]?.fee || 0;

        if (orderSource !== 'INSTORE' && feePercent > 0 && feePercent < 100) {
            const multiplier = 1 / (1 - (feePercent / 100)); // Lựa chọn 1: Tính lên để bù phí sàn
            effectiveCart = cart.map(c => {
                const clonedItem = JSON.parse(JSON.stringify(c));
                // Hệ thống lưu giá theo đơn vị nghìn đồng (VD: 19 = 19.000đ)
                // Do đó để làm tròn lên hàng nghìn, ta chỉ cần Math.ceil(price * multiplier)
                const applyMarkup = (price) => Math.ceil(price * multiplier);

                if (clonedItem.item && clonedItem.item.price) clonedItem.item.price = applyMarkup(clonedItem.item.price);
                if (clonedItem.size && clonedItem.size.priceAdjust) clonedItem.size.priceAdjust = applyMarkup(clonedItem.size.priceAdjust);
                if (clonedItem.addons) {
                    clonedItem.addons.forEach(a => {
                        if (a.price) a.price = applyMarkup(a.price);
                    });
                }

                const baseP = parseFloat(clonedItem.item?.price) || 0;
                const sizeP = parseFloat(clonedItem.size?.priceAdjust) || 0;
                const addonP = (clonedItem.addons || []).reduce((s, a) => s + (parseFloat(a.price) || 0), 0);
                clonedItem.totalPrice = baseP + sizeP + addonP;
                clonedItem.originalPrice = clonedItem.totalPrice; // Cập nhật lại giá gốc sau markup

                return clonedItem;
            });
        }

        const promoResult = calculateCartWithPromotions(effectiveCart, promotions, promoCodeInput, menu, selectedPromoId, settings.enablePromotions);

        let taxAmount = 0;
        let finalTotal = promoResult.totalOrderPrice;
        const rate = parseFloat(settings?.taxRate) || 0;
        const preTaxTotal = promoResult.totalOrderPrice;

        if (settings?.taxMode === 'EXCLUSIVE' && rate > 0) {
            taxAmount = Math.round(preTaxTotal * (rate / 100));
            finalTotal = preTaxTotal + taxAmount;
        } else if ((settings?.taxMode === 'INCLUSIVE' || settings?.taxMode === 'DIRECT_INCLUSIVE') && rate > 0) {
            taxAmount = Math.round(preTaxTotal - (preTaxTotal / (1 + rate / 100)));
            finalTotal = preTaxTotal;
        }

        return {
            ...promoResult,
            totalOrderPrice: finalTotal,
            preTaxTotal,
            taxAmount,
            taxRate: rate,
            taxMode: settings?.taxMode || 'NONE'
        };
    };

    const { totalOrderPrice, preTaxTotal, taxAmount, taxRate, taxMode, baseTotal, discount, validPromo, availablePromotions, processedCart } = calculateCart();

    const getOrderId = () => {
        const now = new Date();
        const dd = String(now.getDate()).padStart(2, '0');
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const yy = String(now.getFullYear()).slice(-2);
        // _idCounter hiện tại đang là số thứ tự trong ngày
        return `${String(_idCounter).padStart(4, '0')}${dd}${mm}${yy}`;
    };

    const submitOrder = async () => {
        if (cart.length === 0) return;
        setSubmitting(true);
        try {
            const deviceId = localStorage.getItem('deviceId') || 'staff-pos';
            const isUpdate = !!initialOrder;
            const newId = isUpdate ? initialOrder.id : null;

            const { totalOrderPrice, preTaxTotal, taxAmount, taxRate, taxMode, baseTotal, discount, validPromo, processedCart } = calculateCart();

            const finalCart = [...processedCart];

            let partnerFee = 0;
            if (orderSource !== 'INSTORE') {
                const feePercent = settings?.deliveryAppsConfigs?.[orderSource]?.fee || 0;
                partnerFee = totalOrderPrice * (feePercent / 100);
            }

            const orderData = {
                id: newId,
                itemName: finalCart.map(c => `${c.item.name} (${c.size?.label || 'Mặc định'}) x${c.count}`).join(', '),
                customerName: customerName || (isUpdate ? initialOrder.customerName : ''),
                note: orderNote,
                price: totalOrderPrice,
                preTaxTotal: preTaxTotal,
                taxAmount: taxAmount,
                taxRate: taxRate,
                taxMode: taxMode,
                basePrice: baseTotal,
                discount: discount,
                orderSource: orderSource,
                partnerFee: partnerFee,
                appliedPromoCode: validPromo ? (validPromo.code || validPromo.name) : null,
                status: isUpdate ? initialOrder.status : (settings.requirePrepayment === false ? 'PENDING' : 'AWAITING_PAYMENT'), // Respect shop settings
                isPaid: isUpdate ? initialOrder.isPaid : false,
                timestamp: isUpdate ? initialOrder.timestamp : getVNTime().toISOString(),
                cartItems: finalCart,
                tableId: settings?.isTakeaway ? null : selectedTableId,
                tableName: settings?.isTakeaway ? '' : (tables.find(t => t.id === selectedTableId)?.name || ''),
                tagNumber: settings?.isTakeaway ? tagNumber : '',
                deviceId: deviceId,
                isPOS: true
            };

            const endpoint = isUpdate ? `${SERVER_URL}/api/orders/${initialOrder.id}` : `${SERVER_URL}/api/order`;
            const method = isUpdate ? 'PUT' : 'POST';

            const res = await fetch(endpoint, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(orderData)
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                if (errData.error === 'INSUFFICIENT_INVENTORY') {
                    alert(errData.message);
                } else {
                    showToast('Có lỗi xảy ra khi lưu đơn!', 'error');
                }
                setSubmitting(false);
                return;
            }

            if (res.ok && !isUpdate) {
                const data = await res.json();
                if (data.order) {
                    if (data.order.queueNumber) {
                        _idCounter = data.order.queueNumber + 1;
                    }

                    // If transfer payment, sync the actual assigned orderId with Kiosk QR
                    if (paymentMethod === 'Chuyển khoản' && settings.autoPushPaymentQr !== false) {
                        await fetch(`${SERVER_URL}/api/pos/checkout/start`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                amount: totalOrderPrice,
                                orderId: data.order.id
                            })
                        });
                    }

                    // In hóa đơn
                    const printReceiptEnabled = localStorage.getItem('printReceiptEnabled') === 'true';
                    const selectedPrinter = localStorage.getItem('selectedPrinter');
                    if (printReceiptEnabled && window.require) {
                        const { ipcRenderer } = window.require('electron');
                        try {
                            const combinedOrderData = {
                                ...data.order,
                                tagNumber: orderData.tagNumber,
                                tableName: orderData.tableName,
                                customerName: orderData.customerName,
                                customerPhone: orderData.customerPhone,
                                price: totalOrderPrice,
                                paymentMethod: paymentMethod,
                                timestamp: Date.now()
                            };
                            const htmlContent = generateReceiptHTML(combinedOrderData, finalCart, settings, false);
                            ipcRenderer.invoke('print-html', htmlContent, selectedPrinter, settings?.receiptPaperSize).catch(console.error);
                        } catch (err) {
                            console.error('Lỗi in hóa đơn:', err);
                        }
                    }
                }
            }

            if (res.ok && selectedTableId) {
                fetch(`${SERVER_URL}/api/tables/status`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: selectedTableId, status: 'Occupied', currentOrderId: orderData.id })
                }).catch(console.error);
            }

            if (res.ok) {
                setSuccess(true);
                // Refetch menu ngay để cập nhật SL nguyên liệu (availablePortions)
                try {
                    const mRes = await fetch(`${SERVER_URL}/api/menu`);
                    if (mRes.ok) setMenu(await mRes.json());
                } catch (e) { /* ignore */ }
                setTimeout(() => {
                    setCart([]);
                    setCustomerName('');
                    setTagNumber('');
                    setOrderSource('INSTORE');
                    setSuccess(false);
                    onClose();
                }, 100);
            }
        } catch (err) { console.error(err); }
        setSubmitting(false);
    };

    const changeDue = Math.max(0, parseFloat(receivedAmount || 0) - totalOrderPrice);

    const categoryStyles = {
        'TRUYỀN THỐNG': 'bg-amber-600',
        'PHA MÁY': 'bg-zinc-900',
        'Trà': 'bg-brand-600',
        'Khác': 'bg-orange-600',
        'All': 'bg-brand-600'
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[500] bg-gray-100 flex flex-col font-main overflow-hidden">
            {/* VisualFlashOverlay: chỉ hiển thị khi flashConfirmationEnabled */}
            {settings?.flashConfirmationEnabled !== false && <VisualFlashOverlay />}
            {/* Header POS */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center shadow-sm z-10">
                <div className="flex items-center gap-4">
                    <button onClick={onClose} className="p-2 hover:bg-gray-100  transition-all">
                        <X size={24} />
                    </button>
                    <h2 className="text-xl font-black tracking-tight uppercase">BÁN HÀNG (POS)</h2>
                </div>
                <div className="flex items-center gap-3">
                    <div className="text-right">
                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Nhân viên trực</p>
                        <p className="font-black text-sm text-gray-900">Admin</p>
                    </div>
                    <div className="w-10 h-10  bg-gray-100 border border-gray-200 flex items-center justify-center font-black text-brand-600">AD</div>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Center / Left Column: Item Grid (70%) */}
                <div className="flex-1 flex flex-col bg-[#F8F4EF] overflow-hidden">
                    {/* Search & Tabs Top Bar */}
                    <div className="bg-white border-b border-gray-100 flex flex-col shadow-sm z-10">
                        <div className="p-4 flex gap-2 w-full border-b border-gray-50">
                            <div className="relative flex-1">
                                <Search className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                    placeholder="Tìm món nhanh..."
                                    className="w-full h-full bg-gray-50 border border-gray-200 py-4 pl-4 pr-14 font-black text-gray-800 outline-none focus:ring-4 focus:ring-[#007AFF]/10 transition-all" />
                            </div>
                            <select
                                value={sortOption}
                                onChange={(e) => setSortOption(e.target.value)}
                                className="bg-gray-50 border border-gray-200 px-4 py-4 font-black text-sm text-gray-800 outline-none focus:ring-4 focus:ring-[#007AFF]/10 transition-all cursor-pointer w-48 shrink-0"
                            >
                                <option value="shortcut">Theo phím tắt</option>
                                <option value="category">Theo danh mục</option>
                                <option value="name">Theo tên (A-Z)</option>
                            </select>

                            {/* Grid View Switcher */}
                            <div className="flex gap-2 shrink-0">
                                <button
                                    title={`Đang hiển thị ${gridColumns} cột (Click để đổi)`}
                                    onClick={() => setGridColumns(prev => prev === 6 ? 3 : prev + 1)}
                                    className="px-4 py-3 flex items-center justify-center transition-all bg-white border border-brand-600 shadow-sm bg-brand-50/50 hover:bg-brand-100/50 active:scale-95"
                                >
                                    <div className="flex gap-1 items-center">
                                        {Array.from({ length: gridColumns }).map((_, i) => (
                                            <div key={i} className="w-1.5 h-5 rounded-none bg-brand-600" />
                                        ))}
                                    </div>
                                </button>
                            </div>
                        </div>

                        {/* Horizontal Categories Tabs */}
                        <div className="px-4 py-3 flex items-center gap-2 overflow-x-auto hide-scrollbar">
                            {categories.map(cat => (
                                <button key={cat} onClick={() => setActiveCategory(cat)}
                                    className={`flex-shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-none font-black text-[13px] tracking-wider transition-all border ${activeCategory === cat ? (categoryStyles[cat] || 'bg-gray-900 border-transparent') + ' text-white shadow-md' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50 active:scale-95'}`}>
                                    <div className={`w-2 h-2 rounded-none flex-shrink-0 ${activeCategory === cat ? 'bg-white' : (categoryStyles[cat] || 'bg-gray-400')}`} />
                                    <span>{cat === 'All' ? 'TẤT CẢ' : cat}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="pos-item-grid" style={{ gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))` }}>
                        {filtered.map(item => (
                            <div key={item.id} onClick={() => {
                                if (item.isSoldOut) {
                                    if (item.missingIngredients && item.missingIngredients.length > 0) {
                                        alert(`Món này đang bị khóa do THIẾU NGUYÊN LIỆU:\n- ${item.missingIngredients.join('\n- ')}\n\nVui lòng Nhập kho để tự động mở bán lại!`);
                                    } else {
                                        alert('Món này đã hết hàng!');
                                    }
                                    return;
                                }
                                openItem(item);
                            }}
                                className={`pos-item-card group relative ${item.isSoldOut ? 'grayscale cursor-not-allowed' : 'cursor-pointer'}`} role="button" tabIndex="0">
                                {item.image && (
                                    <img src={getImageUrl(item.image)} className={`w-full h-full object-cover transition-transform duration-500 ${!item.isSoldOut ? 'group-hover:scale-105' : ''}`} alt="" />
                                )}
                                {item.isSoldOut && (
                                    <div className="absolute inset-0 bg-black/10 z-30 flex flex-col items-center justify-center">
                                        <span className="bg-red-600/90 text-white shadow-xl font-black px-4 py-2 rounded-none text-sm uppercase tracking-widest border border-red-800 whitespace-nowrap">HẾT MÓN</span>
                                    </div>
                                )}
                                {/* ── Price Badge (Top Right) ── */}
                                <div className="absolute top-2 right-2 z-20 flex flex-col items-end gap-1">
                                    <span style={{
                                        background: '#1A1A1A',
                                        color: '#FFD60A',
                                        fontFamily: 'monospace',
                                        fontSize: 14,
                                        fontWeight: 900,
                                        padding: '3px 8px',
                                        borderRadius: 6,
                                        lineHeight: 1.4,
                                        letterSpacing: '0.05em',
                                        boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                                        display: 'block',
                                    }}>{Math.round(parseFloat(item.price))}K</span>
                                    {!item.isSoldOut && item.availablePortions !== null && item.availablePortions !== undefined && item.availablePortions <= (settings?.warningThreshold !== undefined ? settings.warningThreshold : 2) && item.availablePortions > 0 && (
                                        <span style={{
                                            background: '#EF4444',
                                            color: '#FFF',
                                            fontFamily: 'monospace',
                                            fontSize: 11,
                                            fontWeight: 900,
                                            padding: '2px 6px',
                                            borderRadius: 4,
                                            lineHeight: 1.2,
                                            boxShadow: '0 2px 4px rgba(239, 68, 68, 0.4)',
                                        }}>SL:{item.availablePortions}</span>
                                    )}
                                </div>
                                <div className="absolute top-2 left-2 z-10">
                                    <span className={`${categoryStyles[item.category] || 'bg-black/60'} backdrop-blur-md text-white text-[10px] font-black px-3 py-2 uppercase tracking-widest shadow-lg block`}>{item.category}</span>
                                </div>

                                {/* ── Toppings Overlay (When Shortcuts are Enabled) ── */}
                                {settings?.showHotkeys && item.addons && item.addons.length > 0 && (
                                    <div className="absolute bottom-10 left-2 z-10 flex flex-col gap-1 max-w-[85%]">
                                        {item.addons.map((addon, aIdx) => (
                                            <div key={aIdx} className="bg-black/70 backdrop-blur-md rounded-none px-1.5 py-1 flex items-center gap-1.5 shadow-sm border border-white/10">
                                                <span className="text-[#FFD60A] font-black text-[10px] bg-black/50 px-1 rounded-none leading-none py-0.5">{addon.addonCode || '1'}</span>
                                                <span className="text-white text-[9px] font-bold uppercase truncate leading-none pt-0.5">{addon.label}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <div className="absolute bottom-0 left-0 right-0 py-3 px-3 bg-white/80 backdrop-blur-sm flex justify-center items-center gap-2 z-10">
                                    <p className="font-black text-[13px] text-gray-900 truncate uppercase text-center w-full">
                                        {item.name}
                                        {settings?.showHotkeys && item.shortcutCode && (
                                            <span className="text-gray-500 whitespace-nowrap ml-1">- {item.shortcutCode}</span>
                                        )}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right Column: Cart / Order (30%) */}
                <div className="w-[30%] bg-white border-l border-gray-200 flex flex-col shadow-[-10px_0_30px_rgba(0,0,0,0.02)] flex-shrink-0">
                    <div className="p-6 border-b border-gray-100 bg-gray-50/30">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-black text-base text-gray-900 flex items-center gap-2">
                                <ShoppingBag size={20} className="text-brand-600" /> GIỎ HÀNG
                            </h3>
                            <button onClick={() => setCart([])} className="text-xs font-black text-red-500 hover:bg-red-50 px-3 py-1.5  transition-all">XÓA TẤT CẢ</button>
                        </div>
                        <div className="space-y-3">
                            {/* Table Location Select inside Cart */}
                            {!settings?.isTakeaway ? (
                                <select value={selectedTableId || ''} onChange={e => setSelectedTableId(e.target.value || null)}
                                    className="w-full bg-white border border-gray-200 px-4 py-3 text-sm font-black text-brand-600 outline-none focus:border-brand-600 focus:ring-4 focus:ring-[#007AFF]/5 transition-all shadow-sm cursor-pointer">
                                    <option value="">🛵 Khách mang đi</option>
                                    {tables.map(t => (
                                        <option key={t.id} value={t.id}>🍽️ {t.area} - {t.name} ({t.status})</option>
                                    ))}
                                </select>
                            ) : (
                                <div className="relative">
                                    <input value={tagNumber} onChange={e => setTagNumber(e.target.value)}
                                        placeholder="Tag Number / Thẻ Bàn..."
                                        className="w-full bg-white border border-gray-200 px-4 py-3 text-sm font-bold text-brand-500 outline-none focus:border-brand-500 focus:ring-4 focus:ring-[#F5A623]/10 transition-all shadow-sm" />
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                                        <span className="text-[10px] font-black text-brand-500 bg-orange-50 px-3 py-1 uppercase tracking-tighter">Tag</span>
                                    </div>
                                </div>
                            )}

                            <div className="relative">
                                <input value={customerName} onChange={e => setCustomerName(e.target.value)}
                                    placeholder="Tên khách hàng (Tùy chọn)..."
                                    className="w-full bg-white border border-gray-200 px-4 py-3 text-sm font-bold outline-none focus:border-brand-600 focus:ring-4 focus:ring-[#007AFF]/5 transition-all shadow-sm" />
                                {!customerName && (
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                                        <span className="text-[10px] font-black text-brand-600 bg-brand-50 px-3 py-1 uppercase tracking-tighter">Auto ID</span>
                                    </div>
                                )}
                            </div>

                            {/* --- CHỌN ĐỐI TÁC GIAO HÀNG (NẾU BẬT) --- */}
                            {settings?.enableDeliveryApps !== false && (
                                <div className="flex bg-gray-50 p-1 border border-gray-100 gap-1 mt-3 rounded-none">
                                    {['INSTORE', 'GRAB', 'SHOPEE'].map(src => {
                                        const isSelected = orderSource === src;
                                        let activeClass = 'bg-white text-brand-600 border border-brand-600/30 shadow-sm';
                                        if (src === 'GRAB') activeClass = 'bg-[#00B14F] text-white font-black shadow-md border-transparent';
                                        if (src === 'SHOPEE') activeClass = 'bg-[#EE4D2D] text-white font-black shadow-md border-transparent';

                                        return (
                                            <button
                                                key={src}
                                                onClick={() => setOrderSource(src)}
                                                className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider transition-all rounded-none ${isSelected ? activeClass : 'text-gray-400 hover:bg-gray-200 border border-transparent'}`}
                                            >
                                                {src === 'INSTORE' ? 'Tại Quán' : src === 'GRAB' ? 'Grab' : 'Shopee'}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-5 space-y-4">
                        {processedCart.map((c, idx) => (
                            <div key={c.id || idx} className="relative border-b border-gray-100 last:border-0 border-x-0 shrink-0">
                                {!c.isGift && (
                                    <div className="absolute inset-y-0 right-0 w-24 bg-red-500 flex items-center justify-end px-5">
                                        <Trash2 size={20} className="text-white" />
                                    </div>
                                )}
                                <motion.div
                                    drag={c.isGift ? false : "x"}
                                    dragConstraints={{ left: -80, right: 0 }}
                                    dragDirectionLock
                                    dragElastic={0.05}
                                    onDragEnd={(e, info) => {
                                        if (!c.isGift && info.offset.x < -60) {
                                            removeFromCart(c.id);
                                        }
                                    }}
                                    className={`bg-gray-50 p-4 relative group ${c.isGift ? 'border-green-300 bg-green-50/30' : ''} w-full`}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex-1 min-w-0">
                                            <p className="font-black text-sm text-gray-900 truncate flex items-center gap-1.5">
                                                {c.isGift && <Gift size={12} className="text-green-500" />}
                                                {c.isGift ? '(KM) ' : ''}{c.item?.name || 'Món'}
                                            </p>
                                            <div className="flex flex-wrap gap-1 mt-1.5">
                                                <span onClick={() => !c.isGift && openItem(c.item, c)} className="text-[9px] font-black bg-white border border-gray-200 px-2 py-0.5 text-gray-500 uppercase cursor-pointer hover:border-brand-600 hover:text-brand-600 transition-all">{c.size?.label}</span>
                                                {c.sugar && (
                                                    <span onClick={() => !c.isGift && openItem(c.item, c)} className="text-[9px] font-black bg-amber-50 border border-amber-100 px-2 py-0.5 text-amber-600 cursor-pointer hover:bg-amber-100 transition-all">
                                                        Đường: {c.sugar}
                                                    </span>
                                                )}
                                                {c.ice && (
                                                    <span onClick={() => !c.isGift && openItem(c.item, c)} className="text-[9px] font-black bg-brand-50 border border-brand-100 px-2 py-0.5 text-brand-600 cursor-pointer hover:bg-brand-100 transition-all">
                                                        Đá: {c.ice}
                                                    </span>
                                                )}
                                                {c.addons && c.addons.map(a => (
                                                    <span key={a.label} onClick={() => !c.isGift && openItem(c.item, c)} className="text-[9px] font-black bg-green-50 border border-green-100 px-2 py-0.5 text-green-600 cursor-pointer hover:bg-green-100 transition-all">
                                                        +{a.label}
                                                    </span>
                                                ))}
                                            </div>
                                            {c.note && <p className="text-[10px] text-gray-400 mt-1.5 italic font-medium truncate">"{c.note}"</p>}
                                        </div>
                                        <div className="text-right ml-3 flex-shrink-0">
                                            {c.isGift ? (
                                                <div className="flex flex-col items-center gap-1">
                                                    <p className="font-black text-[10px] text-gray-400 line-through">{formatVND(c.originalPrice * c.count)}</p>
                                                    <p className="font-black text-sm text-green-600 mt-0.5">0 đ</p>
                                                    <p className="font-black text-[12px] text-gray-900 text-center w-full bg-white px-2 border border-gray-200 pb-0.5 select-none">x{c.count}</p>
                                                    <button
                                                        onClick={() => {
                                                            if (c.originalCartItemId) {
                                                                // Quà tặng tự động sinh ra từ giỏ hàng → trừ đi số lượng của item gốc
                                                                setCart(cart.map(x => x.id === c.originalCartItemId ? { ...x, count: x.count - c.count } : x).filter(x => x.count > 0));
                                                            } else {
                                                                // Quà tặng thủ công (có sẵn isGift: true)
                                                                removeFromCart(c.id);
                                                            }
                                                        }}
                                                        className="w-full mt-0.5 flex items-center justify-center gap-1 text-[9px] font-black text-red-400 hover:text-red-600 hover:bg-red-50 border border-red-100 px-2 py-1 transition-all"
                                                        title="Xóa quà tặng"
                                                    >
                                                        <X size={10} /> Xóa quà
                                                    </button>
                                                </div>
                                            ) : (
                                                <>
                                                    <p className="font-black text-sm text-gray-900">{formatVND(c.totalPrice * c.count)}</p>
                                                    <div className="flex items-center gap-2 mt-2 bg-white border border-gray-200 p-0.5 shadow-sm">
                                                        <button onClick={() => {
                                                            if (c.count > 1) setCart(cart.map(x => x.id === c.id ? { ...x, count: x.count - 1 } : x));
                                                            else removeFromCart(c.id);
                                                        }} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-red-500 transition-all"><Minus size={12} /></button>
                                                        <span className="font-black text-sm w-4 text-center">{c.count}</span>
                                                        <button onClick={() => setCart(cart.map(x => x.id === c.id ? { ...x, count: x.count + 1 } : x))}
                                                            className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-brand-600 transition-all"><Plus size={12} /></button>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            </div>
                        ))}
                        {cart.length === 0 && (
                            <div className="h-full flex flex-col items-center justify-center text-center opacity-30 grayscale p-12">
                                <ShoppingBag size={80} className="mb-4 text-gray-300" />
                                <p className="font-black text-sm text-gray-400">GIỎ HÀNG ĐANG TRỐNG</p>
                            </div>
                        )}
                    </div>

                    <div className="p-6 border-t border-gray-200 bg-white space-y-3">
                        <div>
                            <input
                                type="text"
                                placeholder="Nhập ghi chú đơn hàng (nếu có)"
                                value={orderNote}
                                onChange={e => setOrderNote(e.target.value)}
                                className="w-full px-4 py-2 bg-gray-50 border border-gray-200 focus:border-brand-600 rounded-none font-bold text-gray-900 outline-none text-sm mb-3"
                            />
                            <input
                                type="text"
                                placeholder="Nhập mã khuyến mãi (nếu có)"
                                value={promoCodeInput}
                                onChange={e => {
                                    setPromoCodeInput(e.target.value.toUpperCase());
                                    setSelectedPromoId(null); // Reset selection
                                }}
                                className="w-full px-4 py-2 bg-gray-50 border border-gray-200 focus:border-brand-600 rounded-none font-bold text-gray-900 outline-none uppercase text-sm placeholder:normal-case placeholder:font-normal"
                            />
                            {promoCodeInput && availablePromotions.length === 0 && <p className="text-xs font-bold text-red-500 mt-1 pl-1">Mã không hợp lệ hoặc chưa đủ điều kiện</p>}
                            {validPromo && validPromo.type === 'PROMO_CODE' && !promoCodeInput && (
                                <p className="text-xs font-bold text-green-500 mt-1 pl-1">✓ Mã tự động áp dụng: {validPromo.code}</p>
                            )}

                            {/* Danh sách các KM có sẵn */}
                            {availablePromotions.length > 0 && (
                                <div className="mt-3 flex flex-col gap-2">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Chọn 1 Khuyến Mãi:</p>
                                    {availablePromotions.map(ap => {
                                        // The activePromo is validPromo.id, since we set validPromo = activePromoResult.promo
                                        const isSelected = validPromo?.id === ap.promo.id;
                                        return (
                                            <label key={ap.promo.id} className={`flex items-start gap-2 p-2 rounded-none border cursor-pointer transition-all ${isSelected ? 'border-brand-600 bg-brand-50/30' : 'border-gray-200 hover:bg-gray-50'}`}>
                                                <input
                                                    type="radio"
                                                    name="selected_promo"
                                                    checked={isSelected}
                                                    onChange={() => setSelectedPromoId(ap.promo.id)}
                                                    className="mt-0.5 accent-[#007AFF]"
                                                />
                                                <div className="flex-1">
                                                    <p className={`text-xs font-black ${isSelected ? 'text-brand-600' : 'text-gray-700'}`}>{ap.promo.name}</p>
                                                    {ap.messages && ap.messages.map((m, i) => (
                                                        <p key={i} className={`text-[10px] italic mt-0.5 ${isSelected ? 'text-brand-600' : 'text-gray-500'}`}>- {m}</p>
                                                    ))}
                                                </div>
                                            </label>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        <div className="flex justify-between items-center text-gray-400 font-black text-[10px] uppercase tracking-[2px] pt-2">
                            <span>Tạm tính</span>
                            <span>{formatVND(baseTotal)}</span>
                        </div>
                        {discount > 0 && (
                            <div className="flex justify-between items-center text-brand-600 font-black text-[10px] uppercase tracking-[2px]">
                                <span>Khuyến mãi</span>
                                <span>-{formatVND(discount)}</span>
                            </div>
                        )}
                        {(() => {
                            const { giftMessages, suggestedGifts } = calculateCart();
                            return (
                                <>
                                    {giftMessages && giftMessages.length > 0 && (
                                        <div className="border-t border-dashed border-green-200 mt-2 pt-2">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-green-600 font-black text-[10px] uppercase tracking-[1px] flex items-center gap-1"><Gift size={12} /> QUÀ TẶNG KÈM:</span>
                                            </div>
                                            <div className="space-y-1">
                                                {giftMessages.map((msg, gIdx) => (
                                                    <div key={gIdx} className="flex flex-col bg-green-50 px-2 py-1.5 rounded-none text-left">
                                                        <span className="text-[10px] font-bold italic text-green-700 mt-0.5 break-words"><span className="text-green-500 mr-1">🎁</span> {msg}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {suggestedGifts && suggestedGifts.length > 0 && (
                                        <p className="text-xs text-orange-500 font-bold mt-2">
                                            * Thêm thủ công {suggestedGifts.length} phần quà tặng miễn phí cho khách vào giỏ hàng.
                                        </p>
                                    )}
                                </>
                            );
                        })()}
                        {(taxMode !== 'NONE') && taxAmount > 0 && (
                            <div className="flex justify-between items-center text-gray-500 font-bold text-xs mt-2 border-t border-gray-100 pt-2">
                                <span>Tạm tính (Sau KM):</span>
                                <span>{formatVND(preTaxTotal)}</span>
                            </div>
                        )}
                        {(taxMode !== 'NONE') && taxAmount > 0 && (
                            <div className="flex justify-between items-center text-teal-600 font-bold text-xs">
                                <span>Thuế GTGT ({taxRate}%):</span>
                                <span>{formatVND(taxAmount)}</span>
                            </div>
                        )}
                        <div className={`flex justify-between items-center ${(taxMode !== 'NONE') && taxAmount > 0 ? 'mt-1' : 'border-t border-gray-100 pt-2 mt-2'}`}>
                            <span className="text-base font-black text-gray-900">Tổng thanh toán</span>
                            <span className="text-2xl font-black text-brand-600 tracking-tighter">{formatVND(totalOrderPrice)}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3 pt-3">
                            <button onClick={() => {
                                if (initialOrder?.id) {
                                    const reason = window.prompt('Hành động này sẽ XÓA ĐƠN HÀNG hiện tại và lưu vào lịch sử hủy.\n\nVui lòng nhập lý do hủy đơn:', 'Khách đổi ý');
                                    if (reason !== null) {
                                        fetch(`${SERVER_URL}/api/orders/cancel/${initialOrder.id}`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ reason: reason || 'Khách đổi ý' })
                                        }).then(() => {
                                            setCart([]);
                                            onClose();
                                        }).catch(err => {
                                            console.error(err);
                                            onClose();
                                        });
                                    }
                                } else {
                                    if (window.confirm('Có chắc muốn hủy giỏ hàng hiện tại không?')) {
                                        setCart([]);
                                        onClose();
                                    }
                                }
                            }} className="admin-btn-secondary !text-gray-400 rounded-none">HỦY ĐƠN</button>
                            <button onClick={() => setShowCheckout(true)} disabled={submitting || cart.length === 0}
                                className="admin-btn-primary group relative">
                                THANH TOÁN
                                {/* Gợi ý hotkey */}
                                <div className="absolute top-1/2 -translate-y-1/2 right-4 flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                                    <span style={{ fontSize: 10, padding: '2px 4px', background: 'rgba(255,255,255,0.2)', borderRadius: 4, fontFamily: 'monospace' }}>↵</span>
                                    <span style={{ fontSize: 10, padding: '2px 4px', background: 'rgba(255,255,255,0.2)', borderRadius: 4, fontFamily: 'monospace' }}>↵</span>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Hook Bắt sự kiện Lắng nghe gõ đúp Enter */}
            <ShortcutDoubleEnter
                onDoubleEnter={() => {
                    if (cart.length > 0 && !showCheckout && !selectedItem) {
                        setShowCheckout(true);
                    }
                }}
            />

            {/* Checkout Modal */}
            <AnimatePresence>
                {showCheckout && (
                    <div className="fixed inset-0 z-[700] flex items-center justify-center p-6">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setShowCheckout(false)} className="absolute inset-0 bg-black/60 backdrop-blur-md" />
                        <motion.div initial={{ y: 50, opacity: 0, scale: 0.95 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 50, opacity: 0, scale: 0.95 }}
                            className="admin-modal-container !max-w-lg flex flex-col">
                            <div className="p-10 space-y-8">
                                <div className="text-center mb-4">
                                    <p className="text-sm text-gray-400 font-black uppercase tracking-[4px] mb-4">Tổng thanh toán</p>
                                    <h3 className="font-black text-brand-600 leading-none tracking-tighter" style={{ fontSize: '100px' }}>{formatVND(totalOrderPrice)}</h3>
                                    {(taxMode !== 'NONE') && taxAmount > 0 && (
                                        <p className="mt-4 text-sm font-bold text-gray-500">
                                            (Đã gồm {formatVND(taxAmount)} Thuế GTGT)
                                        </p>
                                    )}
                                </div>

                                <div className="space-y-4">
                                    <p className="text-xs font-black text-gray-900 uppercase tracking-widest">Phương thức thanh toán</p>
                                    <div className="grid grid-cols-2 gap-4">
                                        {['Tiền mặt', 'Chuyển khoản'].map(m => (
                                            <button key={m} onClick={async () => {
                                                setPaymentMethod(m);
                                                if (m === 'Chuyển khoản') {
                                                    await fetch(`${SERVER_URL}/api/pos/checkout/start`, {
                                                        method: 'POST',
                                                        headers: { 'Content-Type': 'application/json' },
                                                        body: JSON.stringify({
                                                            amount: totalOrderPrice,
                                                            orderId: initialOrder ? initialOrder.id : getOrderId()
                                                        })
                                                    });
                                                } else {
                                                    await fetch(`${SERVER_URL}/api/pos/checkout/stop`, { method: 'POST' });
                                                }
                                            }}
                                                className={`py-5  font-black text-base transition-all border-2 ${paymentMethod === m ? 'border-brand-600 bg-brand-600/5 text-brand-600 shadow-lg shadow-[#007AFF]/10' : 'border-gray-100 text-gray-400 hover:border-gray-200'}`}>
                                                {m}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {(paymentMethod === 'Chuyển khoản' || paymentMethod === 'Momo') && (
                                    <div className="bg-gray-50 p-6  border border-gray-100 flex flex-col items-center gap-4">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Quét mã thanh toán {paymentMethod}</p>
                                        <div className="w-48 h-48 bg-white p-2  border border-gray-200 overflow-hidden shadow-sm">
                                            {settings.preferDynamicQr !== false || !settings.customQrUrl ? (
                                                <img src={getVietQR(totalOrderPrice, initialOrder ? initialOrder.id : getOrderId())} className="w-full h-full border-none" alt="VietQR" />
                                            ) : (
                                                <img src={settings.customQrUrl} className="w-full h-full object-contain" alt="Payment QR" />
                                            )}
                                        </div>
                                        <div className="text-center">
                                            <p className="text-xs font-black text-gray-800 uppercase tracking-tight mb-1">Thanh toán chuyển khoản</p>
                                            <p className="text-xs font-black text-gray-800">{settings.preferDynamicQr !== false ? `${settings.bankId} · ${settings.accountNo}` : settings.shopName}</p>
                                            <p className="text-[10px] font-bold text-gray-400 mt-0.5 uppercase">{settings.accountName}</p>
                                        </div>
                                    </div>
                                )}

                                {paymentMethod === 'Tiền mặt' && (
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center">
                                            <p className="text-xs font-black text-gray-900 uppercase tracking-widest">Khách đưa</p>
                                            <p className="text-xs font-black text-green-600 uppercase tracking-widest">Tiền thối: {formatVND(changeDue)}</p>
                                        </div>
                                        <div className="relative">
                                            <input type="number" value={receivedAmount} onChange={e => setReceivedAmount(e.target.value)}
                                                placeholder="Nhập số tiền khách đưa..."
                                                className="w-full bg-gray-50 border border-transparent  px-6 py-5 text-2xl font-black outline-none focus:bg-white focus:border-brand-600 focus:ring-4 focus:ring-[#007AFF]/5 transition-all shadow-inner" />
                                            <span className="absolute right-6 top-1/2 -translate-y-1/2 font-black text-gray-300">k</span>
                                        </div>
                                        <div className="grid grid-cols-4 gap-3">
                                            {[20, 50, 100, 200, 500].map(amt => (
                                                <button key={amt} onClick={() => setReceivedAmount(amt)}
                                                    className="py-4  bg-gray-100 text-sm font-black hover:bg-gray-200 transition-all">{amt}k</button>
                                            ))}
                                            <button onClick={() => setReceivedAmount(totalOrderPrice)}
                                                className="col-span-2 py-4  bg-brand-600/10 text-brand-600 text-sm font-black hover:bg-brand-600/20 transition-all">ĐỦ TIỀN</button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="p-8 border-t border-gray-100 bg-gray-50 flex gap-4">
                                <button onClick={async () => {
                                    if (paymentMethod === 'Chuyển khoản' || paymentMethod === 'Momo') {
                                        await fetch(`${SERVER_URL}/api/pos/checkout/stop`, { method: 'POST' });
                                    }
                                    setShowCheckout(false);
                                }} className="admin-btn-secondary relative group">
                                    QUAY LẠI
                                    <span style={{ fontSize: 10, padding: '2px 5px', background: 'rgba(0,0,0,0.08)', borderRadius: 4, fontFamily: 'monospace', marginLeft: 8, letterSpacing: '0.04em' }} className="opacity-60 group-hover:opacity-100 transition-opacity">Esc</span>
                                </button>
                                <button onClick={async () => {
                                    if (paymentMethod !== 'Chuyển khoản') {
                                        fetch(`${SERVER_URL}/api/pos/checkout/stop`, { method: 'POST' }).catch(console.error);
                                    }
                                    submitOrder();
                                    setShowCheckout(false);
                                }} disabled={submitting}
                                    className={`admin-btn-primary relative group ${success ? '!bg-green-500' : ''}`}>
                                    {success ? <CheckCircle2 size={28} /> : (
                                        <>
                                            XÁC NHẬN & IN BILL
                                            <span style={{ fontSize: 10, padding: '2px 5px', background: 'rgba(255,255,255,0.2)', borderRadius: 4, fontFamily: 'monospace', marginLeft: 8, letterSpacing: '0.04em' }} className="opacity-60 group-hover:opacity-100 transition-opacity">↵ Enter</span>
                                        </>
                                    )}
                                </button>
                            </div>

                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Customization Modal */}
            <AnimatePresence>
                {selectedItem && (
                    <div className="fixed inset-0 z-[600] flex items-center justify-center p-6">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setSelectedItem(null)} className="absolute inset-0 bg-black/60 backdrop-blur-md" />
                        <motion.div initial={{ y: 50, opacity: 0, scale: 0.95 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 50, opacity: 0, scale: 0.95 }}
                            className="admin-modal-wide">

                            {/* Item Info Header */}
                            <div className="relative h-48 bg-gray-100">
                                {selectedItem.image && <img src={getImageUrl(selectedItem.image)} className="w-full h-full object-cover" alt="" />}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-end p-8">
                                    <div className="flex-1">
                                        <p className="text-[10px] text-brand-600 font-black uppercase tracking-[3px] mb-1">Tùy chỉnh món</p>
                                        <h3 className="text-3xl font-black text-white">{selectedItem.name}</h3>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-2xl font-black text-[#C68E5E]">
                                            {formatVND(parseFloat(selectedItem.price) + (selectedSize?.priceAdjust || 0) + selectedAddons.reduce((s, a) => s + a.price, 0))}
                                        </p>
                                    </div>
                                </div>
                                <button onClick={() => setSelectedItem(null)} className="absolute top-6 right-6 p-2 bg-black/20 backdrop-blur-md text-white hover:bg-black/40 transition-all group">
                                    <X size={20} />
                                    <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-[10px] font-mono bg-black/80 text-white px-2 py-0.5 rounded-none opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">Esc</span>
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-10 space-y-10">
                                {/* Sizes */}
                                {selectedItem.sizes?.length > 0 && (
                                    <div className="space-y-4">
                                        <p className="admin-label flex items-center gap-2">
                                            <div className="w-1.5 h-1.5  bg-brand-600" /> KÍCH THƯỚC
                                        </p>
                                        <div className="flex flex-wrap gap-3">
                                            {selectedItem.sizes.map(s => (
                                                <button key={s.label} onClick={() => setSelectedSize(s)}
                                                    className={`px-8 py-5  border-2 font-black transition-all flex flex-col items-center min-w-[120px] ${selectedSize?.label === s.label ? 'border-brand-600 bg-brand-600/5 text-brand-600 shadow-lg shadow-[#007AFF]/10' : 'border-gray-100 text-gray-400 bg-gray-50 hover:border-gray-200'}`}>
                                                    <span className="text-lg">{s.label}</span>
                                                    <span className="text-[10px] mt-1 opacity-60 tracking-widest">{s.volume}</span>
                                                    {s.priceAdjust !== 0 && <span className="text-[11px] mt-1 font-black">{s.priceAdjust > 0 ? `+${s.priceAdjust}k` : `${s.priceAdjust}k`}</span>}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Sugar & Ice row */}
                                <div className="grid grid-cols-2 gap-10">
                                    <div className="space-y-4">
                                        <p className="admin-label flex items-center gap-2">
                                            <div className="w-1.5 h-1.5  bg-amber-400" /> MỨC ĐƯỜNG
                                        </p>
                                        {(() => {
                                            const opts = (selectedItem.sugarOptions?.length ? selectedItem.sugarOptions : DEFAULT_SUGAR).slice().sort((a, b) => DEFAULT_SUGAR.indexOf(a) - DEFAULT_SUGAR.indexOf(b));
                                            if (opts.length === 0) return <p className="text-xs text-gray-300 italic">Món này không chỉnh đường</p>;
                                            return (
                                                <div className="grid grid-cols-2 gap-3">
                                                    {opts.map(lvl => (
                                                        <button key={lvl} onClick={() => setSelectedSugar(lvl)}
                                                            className={`py-5  font-black text-base transition-all ${selectedSugar === lvl ? 'bg-amber-400 text-white shadow-lg' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}>
                                                            {lvl}
                                                        </button>
                                                    ))}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                    <div className="space-y-4">
                                        <p className="admin-label flex items-center gap-2">
                                            <div className="w-1.5 h-1.5  bg-brand-400" /> MỨC ĐÁ
                                        </p>
                                        {(() => {
                                            const opts = (selectedItem.iceOptions?.length ? selectedItem.iceOptions : DEFAULT_ICE).slice().sort((a, b) => DEFAULT_ICE.indexOf(a) - DEFAULT_ICE.indexOf(b));
                                            if (opts.length === 0) return <p className="text-xs text-gray-300 italic">Món này không chỉnh đá</p>;
                                            return (
                                                <div className="grid grid-cols-2 gap-3">
                                                    {opts.map(lvl => (
                                                        <button key={lvl} onClick={() => setSelectedIce(lvl)}
                                                            className={`py-5  font-black text-base transition-all ${selectedIce === lvl ? 'bg-brand-500 text-white shadow-lg' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}>
                                                            {lvl}
                                                        </button>
                                                    ))}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>

                                {/* Addons */}
                                {selectedItem.addons?.length > 0 && (
                                    <div className="space-y-4">
                                        <p className="admin-label flex items-center gap-2">
                                            <div className="w-1.5 h-1.5  bg-brand-600" /> TÙY CHỌN THÊM
                                        </p>
                                        <div className="flex flex-wrap gap-4">
                                            {selectedItem.addons.map(a => {
                                                const isSelected = selectedAddons.find(sa => sa.label === a.label);
                                                return (
                                                    <button key={a.label} onClick={() => toggleAddon(a)}
                                                        className={`relative px-8 py-5 border-2 font-black text-base transition-all flex items-center gap-4 ${isSelected ? 'border-green-500 bg-green-50 text-green-700 shadow-lg shadow-green-500/10' : 'border-gray-50 text-gray-400 bg-gray-50 hover:border-gray-100 opacity-60'}`}>
                                                        {settings?.showHotkeys && a.addonCode && (
                                                            <div className="absolute -top-3 -right-3 z-20">
                                                                <span style={{
                                                                    background: '#1A1A1A',
                                                                    color: '#FFD60A',
                                                                    fontFamily: 'monospace',
                                                                    fontSize: 12,
                                                                    fontWeight: 900,
                                                                    padding: '4px 8px',
                                                                    borderRadius: 6,
                                                                    lineHeight: 1.4,
                                                                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                                                                    display: 'block',
                                                                }}>{a.addonCode}</span>
                                                            </div>
                                                        )}
                                                        <div className={`w-6 h-6 border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-green-500 border-green-500' : 'border-gray-300'}`}>
                                                            {isSelected && <CheckCircle2 size={14} className="text-white" />}
                                                        </div>
                                                        {a.label} {a.price > 0 && <span className="text-orange-500/80">+{a.price}k</span>}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Note */}
                                <div className="space-y-4">
                                    <p className="admin-label flex items-center gap-2">
                                        <div className="w-1.5 h-1.5  bg-brand-600" /> GHI CHÚ RIÊNG
                                    </p>
                                    <input value={itemNote} onChange={e => setItemNote(e.target.value)} placeholder="VD: Không lấy đường, nhiều đá..."
                                        className="w-full bg-gray-50 border border-transparent  px-6 py-5 text-lg font-bold outline-none focus:bg-white focus:border-brand-600 focus:ring-4 focus:ring-[#007AFF]/5 transition-all shadow-inner" />
                                </div>
                            </div>

                            <div className="p-8 border-t border-gray-100 bg-gray-50 flex gap-4">
                                <button onClick={() => { setSelectedItem(null); setEditingCartItemId(null); }} className="admin-btn-secondary">HỦY</button>
                                <button onClick={addToCart} className="admin-btn-primary">
                                    {editingCartItemId !== null ? <CheckCircle2 size={20} /> : <Plus size={20} />}
                                    {editingCartItemId !== null ? 'CẬP NHẬT MÓN' : 'THÊM VÀO GIỎ'}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

/**
 * StaffOrderPanel — Wrapper công khai.
 * Bọc StaffOrderPanelInner trong ShortcutProvider để hệ thống phím tắt
 * có thể giao tiếp với giỏ hàng thông qua ref callback (tránh stale closure).
 */
const StaffOrderPanel = (props) => {
    // Dùng ref để ShortcutProvider luôn gọi phiên bản hàm mới nhất
    const addRef = useRef(null);

    const handleAdd = useCallback((mainItem, toppings, size, sugar, ice, shortcutQuantity) => {
        if (addRef.current) addRef.current(mainItem, toppings, size, sugar, ice, shortcutQuantity);
    }, []);

    return (
        <ShortcutProvider
            menu={props.menu}
            onAdd={handleAdd}
            isEnabled={props.settings?.flashConfirmationEnabled !== false}
        >
            <StaffOrderPanelInner
                {...props}
                // Truyền setter để inner component đăng ký callback của nó
                onRegisterShortcutAdd={(fn) => { addRef.current = fn; }}
            />
        </ShortcutProvider>
    );
};

// ── Receipt Builder Component ──
/**
 * @component ReceiptBuilder
 * Cho phép kéo thả bố cục hóa đơn và sửa trực tiếp thông tin (Shop Name, Address, Wifi...)
 */
const ReceiptBuilder = ({ value, onChange, settings, setSettings }) => {
    const [editingId, setEditingId] = useState(null);
    // defaults
    const fallbackConfig = [
        { id: 'shopName', label: 'Tên quán', enabled: true },
        { id: 'address', label: 'Địa chỉ quán', enabled: true },
        { id: 'receiptTitle', label: 'Tiêu đề (PHIẾU THANH TOÁN)', enabled: true },
        { id: 'orderInfo', label: 'Thông tin đơn (Mã, Thời gian)', enabled: true },
        { id: 'customerInfo', label: 'Mã khách hàng ✱', enabled: true },
        { id: 'itemsList', label: 'Danh Sách Món', enabled: true, locked: true },
        { id: 'financials', label: 'Tổng tiền & Chiết khấu', enabled: true },
        { id: 'wifi', label: 'Mật khẩu Wifi', enabled: true },
        { id: 'qrCode', label: 'Mã QR Thanh Toán ✱', enabled: true },
        { id: 'footer', label: 'Lời cảm ơn', enabled: true }
    ];

    const config = value && value.length > 0 ? value : fallbackConfig;

    const moveUp = (index) => {
        if (index <= 0) return;
        if (config[index].locked || config[index - 1].locked) return;
        const newConfig = [...config];
        [newConfig[index - 1], newConfig[index]] = [newConfig[index], newConfig[index - 1]];
        onChange(newConfig);
    };

    const moveDown = (index) => {
        if (index >= config.length - 1) return;
        if (config[index].locked || config[index + 1].locked) return;
        const newConfig = [...config];
        [newConfig[index], newConfig[index + 1]] = [newConfig[index + 1], newConfig[index]];
        onChange(newConfig);
    };

    // Live Preview Mock Data
    const tMode = settings.taxMode || "NONE";
    const tRate = settings.taxRate || 8;
    const mockSubTotal = 68000;
    let mTax = 0, mTotal = mockSubTotal, mPreTax = mockSubTotal;

    if (tMode === 'EXCLUSIVE') {
        mTax = Math.round(mockSubTotal * (tRate / 100));
        mTotal = mockSubTotal + mTax;
    } else if (tMode === 'INCLUSIVE' || tMode === 'DIRECT_INCLUSIVE') {
        mTax = Math.round(mockSubTotal - (mockSubTotal / (1 + (tRate / 100))));
        mPreTax = mockSubTotal - mTax;
    }

    const mockOrder = {
        id: '1234',
        queueNumber: 99,
        tagNumber: 'TAG-12',
        tableName: 'Bàn A1',
        customerName: 'Khách VIP',
        customerPhone: '0901234567',
        price: mTotal,
        preTaxTotal: mPreTax,
        taxAmount: mTax,
        taxMode: tMode,
        taxRate: tRate,
        paymentMethod: 'Chuyển khoản',
        timestamp: Date.now()
    };

    const mockCart = [
        { count: 1, item: { name: 'CAFE SỮA' }, size: { label: 'M' }, sugar: 'Ngọt ít', ice: 'Nhiều đá', totalPrice: 20000 },
        { count: 2, item: { name: 'CAFE ĐÁ' }, size: { label: 'L' }, addons: [{ label: 'Thêm cafe' }], totalPrice: 24000, note: 'Ít đường' }
    ];

    const mockSettings = {
        ...settings,
        receiptConfig: config
    };

    let previewHTML = '';
    if (typeof generateReceiptHTML === 'function') {
        previewHTML = generateReceiptHTML(mockOrder, mockCart, mockSettings, false);
    }

    return (
        <div className="mt-6 border-t border-gray-100 pt-6">
            <h4 className="text-[10px] font-black uppercase text-gray-900 mb-4">Bố cục hóa đơn in</h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                {/* Cột trái: Drag & Drop Config */}
                <div className="space-y-4">
                    {/* Tùy chỉnh font chữ & Khoảng cách */}
                    <div className="bg-white border border-gray-100 p-4 shadow-sm mb-4">
                        <h5 className="text-[10px] font-black uppercase text-gray-900 mb-3 border-b pb-2">Kích thước & Khoảng cách</h5>
                        <div className="space-y-4">
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="text-[10px] font-black text-gray-500 uppercase">Cỡ chữ cơ bản</label>
                                    <span className="text-xs font-bold text-brand-600 px-1">{settings.receiptFontSize || 12}px</span>
                                </div>
                                <input 
                                    type="range" min="8" max="16" step="1" 
                                    value={settings.receiptFontSize || 12} 
                                    onChange={e => setSettings({...settings, receiptFontSize: parseInt(e.target.value)})}
                                    className="w-full accent-brand-500 cursor-pointer"
                                />
                                <div className="text-[9px] text-gray-400 mt-1 flex justify-between"><span>Nhỏ (Tiết kiệm)</span><span>Lớn (Dễ đọc)</span></div>
                            </div>
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="text-[10px] font-black text-gray-500 uppercase">Khoảng cách dòng</label>
                                    <span className="text-xs font-bold text-brand-600 px-1">{settings.receiptLineGap || 1.4}</span>
                                </div>
                                <input 
                                    type="range" min="0.8" max="2.0" step="0.1" 
                                    value={settings.receiptLineGap || 1.4} 
                                    onChange={e => setSettings({...settings, receiptLineGap: parseFloat(e.target.value)})}
                                    className="w-full accent-brand-500 cursor-pointer"
                                />
                                <div className="text-[9px] text-gray-400 mt-1 flex justify-between"><span>Khít</span><span>Thưa</span></div>
                            </div>
                        </div>
                    </div>

                    <p className="text-[10px] font-black uppercase text-gray-500 mb-2">Sắp xếp Bố cục (Kéo & Thả)</p>
                    <div className="bg-gray-50/50 border border-gray-100 p-4 space-y-2">
                        {config.map((item, index) => (
                            <div
                                key={item.id}
                                className={`flex items-center justify-between p-3 bg-white border shadow-sm transition-all ${item.locked ? 'border-amber-200 bg-amber-50/30' : `border-gray-200 ${editingId === item.id ? 'shadow-inner border-brand-400' : 'hover:border-brand-400'}`}`}
                            >
                                <div className="w-full">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            {/* Reorder Buttons */}
                                            {!item.locked ? (
                                                <div className="flex flex-col gap-0.5">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); moveUp(index); }}
                                                        disabled={index === 0 || config[index - 1]?.locked}
                                                        className="p-1 text-gray-400 hover:text-brand-500 disabled:opacity-20 transition-colors"
                                                    >
                                                        <ChevronUp size={14} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); moveDown(index); }}
                                                        disabled={index === config.length - 1 || config[index + 1]?.locked}
                                                        className="p-1 text-gray-400 hover:text-brand-500 disabled:opacity-20 transition-colors"
                                                    >
                                                        <ChevronDown size={14} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="p-1 text-amber-400">
                                                    <Lock size={14} />
                                                </div>
                                            )}

                                            <div
                                                className="flex items-center gap-2 cursor-pointer group"
                                                onClick={() => {
                                                    if (['shopName', 'address', 'receiptTitle', 'wifi', 'qrCode', 'footer'].includes(item.id)) {
                                                        setEditingId(editingId === item.id ? null : item.id);
                                                    }
                                                }}
                                            >
                                                <span className={`text-[11px] font-black tracking-wide uppercase ${item.locked ? 'text-amber-700' : 'text-gray-700'} group-hover:text-brand-600 transition-colors`}>
                                                    {item.label}
                                                    {['shopName', 'address', 'receiptTitle', 'wifi', 'qrCode', 'footer'].includes(item.id) && (
                                                        <span className="ml-2 opacity-0 group-hover:opacity-100 text-[9px] text-brand-400 font-normal normal-case italic">(Bấm để sửa)</span>
                                                    )}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            {item.locked ? (
                                                <span className="text-[9px] font-black text-amber-600 uppercase px-2 py-1 bg-amber-100/50 rounded-none tracking-widest">Cố định</span>
                                            ) : (
                                                <button
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        const newConfig = [...config];
                                                        newConfig[index].enabled = !newConfig[index].enabled;
                                                        onChange(newConfig);
                                                    }}
                                                    className={`w-10 h-6 flex items-center p-1 transition-colors ${item.enabled ? 'bg-green-500 justify-end' : 'bg-gray-300 justify-start'}`}
                                                >
                                                    <motion.div layout className="w-4 h-4 bg-white shadow-sm" />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Inline Editing Form */}
                                    {editingId === item.id && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            className="mt-3 pt-3 border-t border-gray-100 space-y-3 pb-2"
                                        >
                                            {item.id === 'shopName' && (
                                                <div className="grid grid-cols-1 gap-2">
                                                    <div>
                                                        <label className="text-[9px] font-black text-gray-400 uppercase">Tên quán</label>
                                                        <input
                                                            type="text"
                                                            value={settings.shopName || ''}
                                                            onChange={(e) => setSettings({ ...settings, shopName: e.target.value })}
                                                            onClick={(e) => e.stopPropagation()}
                                                            onMouseDown={(e) => e.stopPropagation()}
                                                            onKeyDown={(e) => e.stopPropagation()}
                                                            onKeyUp={(e) => e.stopPropagation()}
                                                            onKeyPress={(e) => e.stopPropagation()}
                                                            onFocus={(e) => e.target.select()}
                                                            className="w-full text-xs p-2 border border-gray-200 focus:border-brand-500 outline-none"
                                                            placeholder="THE COFFEE HOUSE"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[9px] font-black text-gray-400 uppercase">Slogan</label>
                                                        <input
                                                            type="text"
                                                            value={settings.shopSlogan || ''}
                                                            onChange={(e) => setSettings({ ...settings, shopSlogan: e.target.value })}
                                                            onClick={(e) => e.stopPropagation()}
                                                            onMouseDown={(e) => e.stopPropagation()}
                                                            onKeyDown={(e) => e.stopPropagation()}
                                                            onKeyUp={(e) => e.stopPropagation()}
                                                            onKeyPress={(e) => e.stopPropagation()}
                                                            onFocus={(e) => e.target.select()}
                                                            className="w-full text-xs p-2 border border-gray-200 focus:border-brand-500 outline-none"
                                                            placeholder="Cafe trước - tỉnh sau."
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                            {item.id === 'address' && (
                                                <div className="grid grid-cols-1 gap-2">
                                                    <div>
                                                        <label className="text-[9px] font-black text-gray-400 uppercase">Mã số thuế</label>
                                                        <input
                                                            type="text"
                                                            value={settings.taxId || ''}
                                                            onChange={(e) => setSettings({ ...settings, taxId: e.target.value })}
                                                            onClick={(e) => e.stopPropagation()}
                                                            onMouseDown={(e) => e.stopPropagation()}
                                                            onKeyDown={(e) => e.stopPropagation()}
                                                            onKeyUp={(e) => e.stopPropagation()}
                                                            onKeyPress={(e) => e.stopPropagation()}
                                                            onFocus={(e) => e.target.select()}
                                                            className="w-full text-xs p-2 border border-gray-200 focus:border-brand-500 outline-none"
                                                            placeholder="079092015466"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[9px] font-black text-gray-400 uppercase">Địa chỉ</label>
                                                        <input
                                                            type="text"
                                                            value={settings.shopAddress || ''}
                                                            onChange={(e) => setSettings({ ...settings, shopAddress: e.target.value })}
                                                            onClick={(e) => e.stopPropagation()}
                                                            onMouseDown={(e) => e.stopPropagation()}
                                                            onKeyDown={(e) => e.stopPropagation()}
                                                            onKeyUp={(e) => e.stopPropagation()}
                                                            onKeyPress={(e) => e.stopPropagation()}
                                                            onFocus={(e) => e.target.select()}
                                                            className="w-full text-xs p-2 border border-gray-200 focus:border-brand-500 outline-none"
                                                            placeholder="69 đường 2/9, P. Hòa Cường, Đà Nẵng"
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                            {item.id === 'receiptTitle' && (
                                                <div>
                                                    <label className="text-[9px] font-black text-gray-400 uppercase">Tiêu đề hóa đơn</label>
                                                    <input
                                                        type="text"
                                                        value={settings.receiptTitle || ''}
                                                        onChange={(e) => setSettings({ ...settings, receiptTitle: e.target.value })}
                                                        onClick={(e) => e.stopPropagation()}
                                                        onMouseDown={(e) => e.stopPropagation()}
                                                        onKeyDown={(e) => e.stopPropagation()}
                                                        onKeyUp={(e) => e.stopPropagation()}
                                                        onKeyPress={(e) => e.stopPropagation()}
                                                        onFocus={(e) => e.target.select()}
                                                        className="w-full text-xs p-2 border border-gray-200 focus:border-brand-500 outline-none"
                                                        placeholder="PHIẾU THANH TOÁN (Mặc định)"
                                                    />
                                                </div>
                                            )}
                                            {item.id === 'wifi' && (
                                                <div>
                                                    <label className="text-[9px] font-black text-gray-400 uppercase">Mật khẩu Wifi</label>
                                                    <input
                                                        type="text"
                                                        value={settings.wifiPass || ''}
                                                        onChange={(e) => setSettings({ ...settings, wifiPass: e.target.value })}
                                                        onClick={(e) => e.stopPropagation()}
                                                        onMouseDown={(e) => e.stopPropagation()}
                                                        onKeyDown={(e) => e.stopPropagation()}
                                                        onKeyUp={(e) => e.stopPropagation()}
                                                        onKeyPress={(e) => e.stopPropagation()}
                                                        onFocus={(e) => e.target.select()}
                                                        className="w-full text-xs p-2 border border-gray-200 focus:border-brand-500 outline-none"
                                                        placeholder="Wifi-12345"
                                                    />
                                                </div>
                                            )}
                                            {item.id === 'qrCode' && (
                                                <div className="grid grid-cols-1 gap-2">
                                                    <div>
                                                        <label className="text-[9px] font-black text-gray-400 uppercase">Ngân hàng (VietQR)</label>
                                                        <input
                                                            type="text"
                                                            value={settings.bankId || ''}
                                                            onChange={(e) => setSettings({ ...settings, bankId: e.target.value })}
                                                            onClick={(e) => e.stopPropagation()}
                                                            onMouseDown={(e) => e.stopPropagation()}
                                                            onKeyDown={(e) => e.stopPropagation()}
                                                            onKeyUp={(e) => e.stopPropagation()}
                                                            onKeyPress={(e) => e.stopPropagation()}
                                                            onFocus={(e) => e.target.select()}
                                                            className="w-full text-xs p-2 border border-gray-200 focus:border-brand-500 outline-none"
                                                            placeholder="VD: VCB, MB, ICB..."
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[9px] font-black text-gray-400 uppercase">Số tài khoản</label>
                                                        <input
                                                            type="text"
                                                            value={settings.accountNo || ''}
                                                            onChange={(e) => setSettings({ ...settings, accountNo: e.target.value })}
                                                            onClick={(e) => e.stopPropagation()}
                                                            onMouseDown={(e) => e.stopPropagation()}
                                                            onKeyDown={(e) => e.stopPropagation()}
                                                            onKeyUp={(e) => e.stopPropagation()}
                                                            onKeyPress={(e) => e.stopPropagation()}
                                                            onFocus={(e) => e.target.select()}
                                                            className="w-full text-xs p-2 border border-gray-200 focus:border-brand-500 outline-none"
                                                            placeholder="0001xxxxxxxx"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[9px] font-black text-gray-400 uppercase">Chủ tài khoản</label>
                                                        <input
                                                            type="text"
                                                            value={settings.accountName || ''}
                                                            onChange={(e) => setSettings({ ...settings, accountName: e.target.value })}
                                                            onClick={(e) => e.stopPropagation()}
                                                            onMouseDown={(e) => e.stopPropagation()}
                                                            onKeyDown={(e) => e.stopPropagation()}
                                                            onKeyUp={(e) => e.stopPropagation()}
                                                            onKeyPress={(e) => e.stopPropagation()}
                                                            onFocus={(e) => e.target.select()}
                                                            className="w-full text-xs p-2 border border-gray-200 focus:border-brand-500 outline-none"
                                                            placeholder="HO TEN CHU TAI KHOAN"
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                            {item.id === 'footer' && (
                                                <div>
                                                    <label className="text-[9px] font-black text-gray-400 uppercase">Lời cảm ơn</label>
                                                    <textarea
                                                        rows={2}
                                                        value={settings.receiptFooter || ''}
                                                        onChange={(e) => setSettings({ ...settings, receiptFooter: e.target.value })}
                                                        onClick={(e) => e.stopPropagation()}
                                                        onMouseDown={(e) => e.stopPropagation()}
                                                        onKeyDown={(e) => e.stopPropagation()}
                                                        onKeyUp={(e) => e.stopPropagation()}
                                                        onKeyPress={(e) => e.stopPropagation()}
                                                        onFocus={(e) => e.target.select()}
                                                        className="w-full text-xs p-2 border border-gray-200 focus:border-brand-500 outline-none resize-none"
                                                        placeholder="Xin cảm ơn & Hẹn gặp lại!"
                                                    />
                                                </div>
                                            )}
                                            <div className="flex justify-end">
                                                <button
                                                    onClick={() => setEditingId(null)}
                                                    className="px-4 py-1.5 bg-brand-500 text-white text-[9px] font-black uppercase shadow-sm hover:bg-brand-600 transition-all"
                                                >
                                                    Xong
                                                </button>
                                            </div>
                                        </motion.div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                    <p className="text-[10px] text-gray-400 italic font-medium leading-relaxed mt-4">
                        * Kéo biểu tượng <GripVertical size={12} className="inline" /> lên/xuống để đổi thứ tự in. Bấm (<span className="w-3 h-2 inline-block bg-green-500 mx-1"></span>) để Tắt/Bật các mục tương ứng trên hóa đơn giấy.<br />
                        * Các mục có dấu ✱ có thể chỉ hiện phần trắng tùy thuộc vào phương thức thanh toán hoặc thông tin đơn hàng cụ thể.
                    </p>
                </div>

                {/* Cột phải: Live Preview */}
                <div className="space-y-4">
                    <p className="text-[10px] font-black uppercase text-gray-500 mb-2">Live Preview (Bản xem trước)</p>
                    <div className="bg-gray-200 p-6 flex justify-center items-start min-h-[500px] border border-gray-300 shadow-inner overflow-hidden relative">
                        <div
                            className="bg-white p-4 shadow-xl border border-gray-100 overflow-hidden"
                            style={{ width: '300px' }}
                            dangerouslySetInnerHTML={{ __html: previewHTML }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

// ── Shared Receipt Generator ──
export function generateReceiptHTML(orderData, cartItems, settings, isReprint = false) {
    const formatVNDReceipt = (val) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val || 0).replace('₫', '').trim();

    const isK58 = settings?.receiptPaperSize === 'K58';
    // Sử dụng chiều rộng pixel chuẩn cho máy in nhiệt (K80 ~ 80mm ~ 300px, K58 ~ 58mm ~ 200px)
    const paperWidth = isK58 ? '200px' : '302px';
    
    // Tùy chỉnh Font và Khảng cách
    const baseSize = parseInt(settings?.receiptFontSize || (isK58 ? 10 : 12));
    const lh = parseFloat(settings?.receiptLineGap || 1.4);

    const FZ_TINY = `${baseSize}px`;
    const FZ_SMALL = `${baseSize}px`;
    const FZ_BASE = `${baseSize}px`;
    const FZ_SUBTITLE = `${baseSize}px`;
    const FZ_TITLE = `${baseSize}px`;

    const paperPadding = isK58 ? 'padding: 0 2px;' : 'padding: 0 5px;';
    const mgGroup = `${Math.max(1, Math.round(lh * 3))}px 0`; // Khoảng cách giữa các khối
    const mgItem = `${Math.max(0, Math.round(lh * 1.5))}px 0`; // Khoảng cách dòng trong khối

    const fallbackConfig = [
        { id: 'shopName', enabled: true },
        { id: 'address', enabled: true },
        { id: 'receiptTitle', enabled: true },
        { id: 'orderInfo', enabled: true },
        { id: 'customerInfo', enabled: true },
        { id: 'itemsList', enabled: true },
        { id: 'financials', enabled: true },
        { id: 'wifi', enabled: true },
        { id: 'qrCode', enabled: true },
        { id: 'footer', enabled: true }
    ];

    const config = settings?.receiptConfig || fallbackConfig;

    let htmlFragments = [];
    
    // Thu thập Footer Text và QR Code (chia 2 cột)
    const combinedFooter = {
        qrCodeURL: '',
        textInfo: '',
        hasAny: false
    };

    // Pre-calculate sums
    const totalQty = (cartItems || []).reduce((sum, c) => sum + (c.count || 1), 0);
    const totalAmount = orderData.price || orderData.totalPrice || 0;
    const paymentMethod = orderData.paymentMethod || 'TIỀN MẶT';
    const preTaxTotal = orderData.preTaxTotal || totalAmount;
    const taxAmount = orderData.taxAmount || 0;
    const taxRate = orderData.taxRate || 0;
    const taxMode = orderData.taxMode || 'NONE';

    // Items building
    const itemsContent = (cartItems || []).map((c, i) => {
        const specs = [
            c.size?.label && c.size.label !== 'Mặc định' ? c.size.label : '',
            c.sugar ? c.sugar : '',
            c.ice ? c.ice : '',
            c.addons?.length > 0 ? `+${c.addons.map(a => a.label).join(', ')}` : '',
            c.note ? `GC: ${c.note}` : ''
        ].filter(Boolean).join(' | ');

        return `
        <tr style="vertical-align: top; border-bottom: 0.5px dotted #aaa;">
            <td style="padding: 2px 0; width: 16px; text-align: left;">${i + 1}</td>
            <td style="padding: 2px 2px; font-weight: bold; line-height: 1.1; text-align: left; word-wrap: break-word; overflow-wrap: break-word;">
                ${c.isGift ? '(KM) ' : ''}${c.item?.name || c.name || 'Món'}
                ${specs ? `<div style="font-weight: normal; font-size: ${FZ_TINY}; margin-top: 1px; color: #444;">${specs}</div>` : ''}
            </td>
            <td style="text-align: center; padding: 2px 0; font-weight: bold; width: 20px;">${c.count}</td>
            ${!isK58 ? `<td style="text-align: right; padding: 2px 0; width: 55px;">${c.isGift ? '0' : formatVNDReceipt(c.originalPrice || c.totalPrice || c.price)}</td>` : ''}
            <td style="text-align: right; padding: 2px 0; font-weight: bold; width: ${isK58 ? '50px' : '65px'};">${c.isGift ? '0' : formatVNDReceipt((c.totalPrice || c.price) * c.count)}</td>
        </tr>
        `;
    }).join('') || (orderData.itemName ? `<tr><td colspan="5" style="padding: 3px 0; text-align: left; font-weight:bold;">${orderData.itemName}</td></tr>` : '');

    config.forEach(block => {
        if (!block.enabled) return;

        switch (block.id) {
            case 'shopName':
                htmlFragments.push(`<div style="margin: 0 0 2px 0; font-size: ${FZ_TITLE}; font-weight: 900; text-transform: uppercase; font-family: 'Arial Black', Impact, sans-serif;">${settings?.shopName || 'THE COFFEE HOUSE'}</div>`);
                if (settings?.shopSlogan) {
                    htmlFragments.push(`<div style="margin: 0 0 4px 0; font-size: ${FZ_SMALL}; font-style: italic;">${settings.shopSlogan}</div>`);
                }
                break;
            case 'address':
                if (settings?.taxId || settings?.shopAddress) {
                    const addrDetails = [
                        settings.taxId ? `MST: ${settings.taxId}` : '',
                        settings.shopAddress ? `ĐC: ${settings.shopAddress}` : ''
                    ].filter(Boolean).join(' - ');
                    htmlFragments.push(`
                        <div style="font-size: ${FZ_TINY}; margin: ${mgItem}; line-height: 1.2; text-align: center;">
                            ${addrDetails}
                        </div>
                    `);
                }
                break;
            case 'receiptTitle':
                const docTitle = settings?.receiptTitle || ((taxMode !== 'NONE') ? 'HÓA ĐƠN GIÁ TRỊ GIA TĂNG' : 'HÓA ĐƠN BÁN HÀNG');
                htmlFragments.push(`
                     <div style="font-size: ${FZ_SUBTITLE}; font-weight: bold; margin: ${mgGroup}; text-transform: uppercase; text-align: center; border-bottom: 2px solid black; padding-bottom: 2px; display: inline-block; width: 100%;">
                        ${docTitle}
                    </div>
                `);
                break;
            case 'orderInfo':
                const theTime = new Date(orderData.timestamp || Date.now());
                const timeStr = `${String(theTime.getDate()).padStart(2, '0')}.${String(theTime.getMonth() + 1).padStart(2, '0')}.${String(theTime.getFullYear()).slice(-2)} ${String(theTime.getHours()).padStart(2, '0')}:${String(theTime.getMinutes()).padStart(2, '0')}`;

                htmlFragments.push(`
                    <table style="width: 100%; border-collapse: collapse; font-size: ${FZ_TINY}; margin: ${mgGroup}; text-align: left;">
                        <tr>
                            <td style="padding: 1px 0;">Ngày: ${timeStr}</td>
                            <td style="padding: 1px 0; text-align: right;">SP: <b>${String(orderData.queueNumber || '').padStart(4, '0')}</b></td>
                        </tr>
                        <tr>
                            <td style="padding: 1px 0;">TN: ${localStorage.getItem('adminName') || 'Admin'}</td>
                            <td style="padding: 1px 0; text-align: right;">
                                ${orderData.tagNumber ? `BÀN: <b>${String(orderData.tagNumber).replace(/^TAG-?/i, '').trim()}</b>` : ''}
                                ${(!settings?.isTakeaway && orderData.tableName) ? `BÀN: <b>${orderData.tableName}</b>` : ''}
                            </td>
                        </tr>
                        ${(orderData.customerName || orderData.customerPhone) ? `<tr><td colspan="2" style="padding: 1px 0;">Khách: <b>${orderData.customerName || ''} ${orderData.customerPhone || ''}</b></td></tr>` : ''}
                    </table>
                `);
                break;
            case 'itemsList':
                htmlFragments.push(`
                    <div style="border-top: 1px dashed black; margin: ${mgGroup}; border-bottom: 1px solid black;"></div>
                    <table style="width: 100%; text-align: left; border-collapse: collapse; font-size: ${FZ_SMALL}; margin: ${mgGroup}; table-layout: fixed;">
                        <thead>
                            <tr style="border-bottom: 1px solid #000;">
                                <th style="padding: 2px 0; width: 16px; text-align: left;">TT</th>
                                <th style="padding: 2px 2px; text-align: left;">Tên món</th>
                                <th style="text-align: center; padding: 2px 0; width: 20px;">SL</th>
                                ${!isK58 ? `<th style="text-align: right; padding: 2px 0; width: 55px;">Đ.Giá</th>` : ''}
                                <th style="text-align: right; padding: 2px 0; width: ${isK58 ? '50px' : '65px'};">T.Tiền</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsContent}
                        </tbody>
                        <tfoot>
                            <tr style="border-top: 1.5px solid #000; font-size: ${FZ_BASE};">
                                <td colspan="2" style="padding: 4px 2px; text-align: left; font-weight: bold; text-transform: uppercase;">Tổng:</td>
                                <td style="text-align: center; padding: 4px 0; font-weight: bold;">${totalQty}</td>
                                ${!isK58 ? `<td></td>` : ''}
                                <td style="text-align: right; padding: 4px 0; font-weight: bold;">${formatVNDReceipt((taxMode !== 'NONE') ? preTaxTotal : totalAmount)}</td>
                            </tr>
                        </tfoot>
                    </table>
                `);
                break;
            case 'financials':
                htmlFragments.push(`
                    <div style="border-top: 1px dashed black; margin: ${mgGroup};"></div>
                    <table style="width: 100%; border-collapse: collapse; font-size: ${FZ_BASE}; font-weight: bold; margin: ${mgGroup};">
                        ${(taxMode !== 'NONE') && taxAmount > 0 ? `
                        <tr style="font-weight: normal; font-size: ${FZ_TINY}; border-bottom: 1px dashed #ccc;">
                            <td style="text-align: left; padding: 2px 0;">Thuế GTGT (${taxRate}%):</td>
                            <td style="text-align: right; padding: 2px 0;">${formatVNDReceipt(taxAmount)}</td>
                        </tr>` : ''}
                        <tr>
                            <td style="text-align: left; padding: 4px 0; text-transform: uppercase;">THANH TOÁN:</td>
                            <td style="text-align: right; padding: 4px 0; font-size: ${FZ_TITLE};">${formatVNDReceipt(totalAmount)}</td>
                        </tr>
                    </table>
                `);
                break;
            case 'qrCode':
                const qrUrl = settings?.bankId && settings?.accountNo
                    ? `https://img.vietqr.io/image/${settings.bankId}-${settings.accountNo}-compact2.png?amount=${Math.round(totalAmount)}&addInfo=${encodeURIComponent('DH ' + orderData.id)}&accountName=${encodeURIComponent(settings.accountName || '')}`
                    : '';
                if (qrUrl) {
                    combinedFooter.qrCodeURL = qrUrl;
                    combinedFooter.hasAny = true;
                }
                break;
            case 'wifi':
                if (settings?.wifiPass) {
                    combinedFooter.textInfo = `
                        <div style="margin-bottom: 4px; text-align: center; border: 1px solid #777; padding: 2px; display: inline-block; width: 100%; box-sizing: border-box;">
                            <span style="font-size: ${FZ_TINY}; font-weight: bold;">WIFI: ${settings.wifiPass}</span>
                        </div>
                    ` + combinedFooter.textInfo;
                    combinedFooter.hasAny = true;
                }
                break;
            case 'footer':
                const customFooter = settings?.receiptFooter || 'Xin cảm ơn & Hẹn gặp lại!';
                combinedFooter.textInfo += `
                    <div style="font-size: ${FZ_TINY}; text-align: center; line-height: 1.2;">
                        ${(taxMode === 'INCLUSIVE' || taxMode === 'DIRECT_INCLUSIVE') ? `Bao gồm VAT ${taxRate}%.<br/>` : ''}
                        ${taxMode === 'EXCLUSIVE' ? `Chưa bao gồm VAT ${taxRate}%.<br/>` : ''}
                        Hóa đơn xuất tự động.<br/>
                        <div style="font-weight: bold; font-size: ${FZ_SMALL}; margin-top: 3px; border-top: 1px solid #000; padding-top: 3px; display: inline-block; width: 80%;">${customFooter.replace(/\n/g, '<br/>')}</div>
                    </div>
                `;
                combinedFooter.hasAny = true;
                break;
            default:
                break;
        }
    });

    if (combinedFooter.hasAny) {
        htmlFragments.push(`
            <div style="border-top: 1px dashed black; margin: ${mgGroup};"></div>
            <table style="width: 100%; border-collapse: collapse; margin: ${mgGroup};">
                <tr>
                    ${combinedFooter.qrCodeURL ? `
                        <td style="width: ${isK58 ? '45%' : '40%'}; vertical-align: middle; text-align: center; padding-right: 4px;">
                            <img src="${combinedFooter.qrCodeURL}" style="width: 100%; max-width: 90px; height: auto; border: 1px solid #ccc; padding: 2px; display: inline-block;"/>
                            <div style="font-size: ${FZ_TINY}; margin-top: 1px; color: #444;">Quét để thanh toán</div>
                        </td>
                    ` : ''}
                    ${combinedFooter.textInfo ? `
                        <td style="width: ${combinedFooter.qrCodeURL ? (isK58 ? '55%' : '60%') : '100%'}; vertical-align: middle; text-align: center; padding-left: ${combinedFooter.qrCodeURL ? '4px' : '0'};">
                            ${combinedFooter.textInfo}
                        </td>
                    ` : ''}
                </tr>
            </table>
        `);
    }

    return `
        <div style="font-family: Arial, Helvetica, sans-serif; width: ${paperWidth}; margin: 0 auto; color: black; line-height: ${lh}; text-align: center; box-sizing: border-box; ${paperPadding}">
            ${htmlFragments.join('')}
            <div style="height: 30px;"></div>
        </div>
    `;
}

// ── Main AdminDashboard ──
let _idCounter = 1;

const SettingSection = ({ title, icon, color, children, defaultExpanded = false, headerRight, id }) => {
    const [expanded, setExpanded] = useState(defaultExpanded);
    const colorClasses = {
        amber: "text-amber-500",
        purple: "text-brand-600",
        pink: "text-pink-500",
        indigo: "text-brand-600",
        orange: "text-orange-500",
        red: "text-red-500",
        blue: "text-brand-600",
    };

    return (
        <div id={id} className="bg-white border border-gray-100 overflow-hidden shadow-sm">
            <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between p-4 bg-white hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                    <div className={`${colorClasses[color] || "text-gray-400"} p-1`}>{icon}</div>
                    <div className="flex items-center gap-2">
                        <span className="font-bold text-xs uppercase text-slate-800 tracking-widest">{title}</span>
                        {headerRight}
                    </div>
                </div>
                <div className="text-gray-400">{expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</div>
            </button>
            <AnimatePresence>
                {expanded && (
                    <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                        <div className="p-4 border-t border-gray-50 bg-white">
                            {children}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

const CustomSwitch = ({ isOn, onToggle, activeColor = "#00DA50" }) => (
    <label className="switch" style={{ '--switch-checked-bg': activeColor }} onClick={(e) => { e.stopPropagation(); e.preventDefault(); onToggle(!isOn); }}>
        <input type="checkbox" checked={isOn} readOnly />
        <div className="slider">
            <div className="circle">
                <svg className="cross" xmlSpace="preserve" style={{ enableBackground: "new 0 0 512 512" }} viewBox="0 0 365.696 365.696" height="6" width="6" xmlnsXlink="http://www.w3.org/1999/xlink" version="1.1" xmlns="http://www.w3.org/2000/svg">
                    <g><path fill="currentColor" d="M243.188 182.86 356.32 69.726c12.5-12.5 12.5-32.766 0-45.247L341.238 9.398c-12.504-12.503-32.77-12.503-45.25 0L182.86 122.528 69.727 9.374c-12.5-12.5-32.766-12.5-45.247 0L9.375 24.457c-12.5 12.504-12.5 32.77 0 45.25l113.152 113.152L9.398 295.99c-12.503 12.503-12.503 32.769 0 45.25L24.48 356.32c12.5 12.5 32.766 12.5 45.247 0l113.132-113.132L295.99 356.32c12.503 12.5 32.769 12.5 45.25 0l15.081-15.082c12.5-12.504 12.5-32.77 0-45.25zm0 0"></path></g>
                </svg>
                <svg className="checkmark" xmlSpace="preserve" style={{ enableBackground: "new 0 0 512 512" }} viewBox="0 0 24 24" height="10" width="10" xmlnsXlink="http://www.w3.org/1999/xlink" version="1.1" xmlns="http://www.w3.org/2000/svg">
                    <g><path fill="currentColor" d="M9.707 19.121a.997.997 0 0 1-1.414 0l-5.646-5.647a1.5 1.5 0 0 1 0-2.121l.707-.707a1.5 1.5 0 0 1 2.121 0L9 14.171l9.525-9.525a1.5 1.5 0 0 1 2.121 0l.707.707a1.5 1.5 0 0 1 0 2.121z"></path></g>
                </svg>
            </div>
        </div>
    </label>
);

const ToggleOption = ({ label, subLabel, isOn, onToggle, activeColor = "blue" }) => {
    const activeColors = {
        blue: "#007AFF",
        green: "#34C759",
        red: "#FF3B30",
    };

    return (
        <div className="flex items-center justify-between group cursor-pointer" onClick={onToggle}>
            <div>
                <p className="font-black text-gray-900 text-[11px] uppercase tracking-tight">{label}</p>
                <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">{subLabel}</p>
            </div>
            <CustomSwitch isOn={isOn} onToggle={onToggle} activeColor={activeColors[activeColor] || activeColors.blue} />
        </div>
    );
};

const CategoryManagerModal = ({ settings, setSettings, menu, setMenu, onRefreshMenu, onClose }) => {
    const [cats, setCats] = useState(settings.menuCategories || ['TRUYỀN THỐNG', 'PHA MÁY', 'Trà', 'Khác']);
    const [editingIdx, setEditingIdx] = useState(null);
    const [editVal, setEditVal] = useState('');
    const [newCat, setNewCat] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const handleSaveSettings = async (newCats) => {
        const newSettings = { ...settings, menuCategories: newCats, categoryOrder: newCats };
        await fetch(`${SERVER_URL}/api/settings`, {
            method: 'POST',
            body: JSON.stringify(newSettings),
            headers: { 'Content-Type': 'application/json' }
        });
        setSettings(newSettings);
        setCats(newCats);

        if (setMenu) {
            setMenu(currentMenu => {
                const trackers = {};
                const fullNewMenu = currentMenu.map(item => {
                    if (item.isDeleted) return item;
                    const idx = newCats.indexOf(item.category);
                    const prefix = idx !== -1 ? String(idx + 1) : Math.max(9, newCats.length + 1).toString();
                    if (!trackers[item.category]) trackers[item.category] = 1;
                    return { ...item, shortcutCode: `${prefix}${trackers[item.category]++}` };
                });

                fetch(`${SERVER_URL}/api/menu/reorder`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(fullNewMenu)
                }).catch(console.error);

                return fullNewMenu;
            });
        }
    };

    const handleRename = async (idx) => {
        if (!editVal || editVal.trim() === '' || editVal === cats[idx]) { setEditingIdx(null); return; }
        const oldName = cats[idx];
        const newName = editVal.trim();
        setIsSaving(true);

        const itemsToUpdate = menu.filter(m => m.category === oldName);
        for (const item of itemsToUpdate) {
            await fetch(`${SERVER_URL}/api/menu`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...item, category: newName })
            });
        }

        const next = [...cats];
        next[idx] = newName;

        // Tránh lỗi Reorder ghi đè dữ liệu cũ: Cấp nhật trước Menu state thì mới chạy handleSaveSettings
        if (setMenu) {
            setMenu(currentMenu => currentMenu.map(m => m.category === oldName ? { ...m, category: newName } : m));
        }

        // Cần chút độ trễ nhỏ để React hook cập nhật kịp (tuỳ không bắt buộc nhưng cho chắc ăn)
        await new Promise(r => setTimeout(r, 50));
        await handleSaveSettings(next);

        setEditingIdx(null);
        if (itemsToUpdate.length > 0) {
            setTimeout(onRefreshMenu, 200); // Trigger refresh data at very end
        }
        setIsSaving(false);
    };

    const handleDelete = async (idx) => {
        const catToDelete = cats[idx];
        if (!window.confirm(`Bạn có chắc muốn xóa danh mục "${catToDelete}"? Các món bên trong sẽ bị chuyển thành "Không Phân Loại" nếu bạn lưu lại.`)) return;
        setIsSaving(true);

        const itemsToUpdate = menu.filter(m => m.category === catToDelete);
        for (const item of itemsToUpdate) {
            await fetch(`${SERVER_URL}/api/menu`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...item, category: 'Không Phân Loại' })
            });
        }

        const next = cats.filter((_, i) => i !== idx);

        if (setMenu) {
            setMenu(currentMenu => currentMenu.map(m => m.category === catToDelete ? { ...m, category: 'Không Phân Loại' } : m));
        }

        await new Promise(r => setTimeout(r, 50));
        await handleSaveSettings(next);

        if (itemsToUpdate.length > 0) {
            setTimeout(onRefreshMenu, 200);
        }
        setIsSaving(false);
    };

    const handleAdd = async () => {
        if (!newCat.trim()) return;
        setIsSaving(true);
        const next = [...cats, newCat.trim()];
        await handleSaveSettings(next);
        setNewCat('');
        setIsSaving(false);
    };

    const moveCat = async (idx, dir) => {
        const next = [...cats];
        const temp = next[idx];
        next[idx] = next[idx + dir];
        next[idx + dir] = temp;
        setIsSaving(true);
        await handleSaveSettings(next);
        setIsSaving(false);
    };

    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <h3 className="text-lg font-black text-gray-900 uppercase tracking-widest">QUẢN LÝ DANH MỤC</h3>
                    <button onClick={onClose} disabled={isSaving} className="p-2 hover:bg-gray-200 rounded-none text-gray-500 disabled:opacity-50"><X size={20} /></button>
                </div>
                <div className="p-6 overflow-y-auto flex-1 bg-gray-50/30">
                    <div className="flex gap-2 mb-6">
                        <input className="admin-input flex-1 !text-sm" placeholder="Tên danh mục mới..." value={newCat} onChange={e => setNewCat(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()} disabled={isSaving} />
                        <button onClick={handleAdd} disabled={isSaving || !newCat.trim()} className="admin-btn-primary !px-4 whitespace-nowrap !text-xs disabled:opacity-50"><Plus size={16} /> THÊM</button>
                    </div>
                    <div className="space-y-2">
                        {cats.map((c, i) => (
                            <div key={i} className="flex items-center justify-between p-3 bg-white border border-gray-200 shadow-sm group">
                                {editingIdx === i ? (
                                    <div className="flex-1 flex gap-2">
                                        <input autoFocus className="admin-input-small flex-1 !py-1 !px-2" value={editVal} onChange={e => setEditVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleRename(i)} />
                                        <button onClick={() => handleRename(i)} className="bg-green-500 text-white px-3 py-1 text-xs font-bold rounded-none shadow-sm hover:bg-green-600"><CheckCircle2 size={14} /></button>
                                        <button onClick={() => setEditingIdx(null)} className="bg-gray-200 text-gray-600 px-3 py-1 text-xs font-bold rounded-none hover:bg-gray-300"><X size={14} /></button>
                                    </div>
                                ) : (
                                    <>
                                        <span className="font-bold text-gray-800 flex-1">{c}</span>
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button disabled={isSaving || i === 0} onClick={() => moveCat(i, -1)} className="p-1.5 text-gray-400 hover:text-brand-500 hover:bg-brand-50 rounded-none"><ArrowUp size={16} /></button>
                                            <button disabled={isSaving || i === cats.length - 1} onClick={() => moveCat(i, 1)} className="p-1.5 text-gray-400 hover:text-brand-500 hover:bg-brand-50 rounded-none"><ArrowDown size={16} /></button>
                                            <div className="w-px h-4 bg-gray-200 mx-1"></div>
                                            <button disabled={isSaving} onClick={() => { setEditingIdx(i); setEditVal(c); }} className="p-1.5 text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded-none"><Edit2 size={16} /></button>
                                            <button disabled={isSaving} onClick={() => handleDelete(i)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-none"><Trash2 size={16} /></button>
                                        </div>
                                    </>
                                )}
                            </div>
                        ))}
                        {cats.length === 0 && <p className="text-center text-gray-400 font-medium py-4 text-sm">Chưa có danh mục nào.</p>}
                    </div>
                </div>
            </motion.div>
        </div>
    );
};
const InventoryAuditModal = ({ isOpen, onClose, inventory, onSave }) => {
    const [auditData, setAuditData] = useState([]);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen && inventory) {
            setAuditData(inventory.map(item => ({
                ingredientId: item.id,
                ingredientName: item.name,
                systemStock: item.stock || 0,
                unit: item.unit,
                actualStock: item.stock || 0,
                reason: 'Không rõ'
            })));
        }
    }, [isOpen, inventory]);

    if (!isOpen) return null;

    const handleChange = (index, field, value) => {
        const newData = [...auditData];
        newData[index][field] = value;
        setAuditData(newData);
    };

    const handleSave = async () => {
        const changedItems = auditData.filter(item => parseFloat(item.actualStock) !== parseFloat(item.systemStock));
        if (changedItems.length === 0) {
            alert('Không có nguyên liệu nào bị thay đổi so với tồn kho máy.');
            onClose();
            return;
        }

        if (!window.confirm(`Xác nhận ghi đè Tồn Kho Thực Tế cho ${changedItems.length} nguyên liệu?`)) return;

        setSubmitting(true);
        try {
            const res = await fetch(`${SERVER_URL}/api/inventory/audit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(changedItems.map(item => ({
                    ingredientId: item.ingredientId,
                    actualStock: parseFloat(item.actualStock),
                    reason: item.reason
                })))
            });
            if (res.ok) {
                onSave();
                onClose();
            } else {
                alert('Có lỗi xảy ra khi lưu phiếu kiểm kho');
            }
        } catch (e) {
            console.error(e);
            alert('Không thể kết nối máy chủ');
        }
        setSubmitting(false);
    };

    return (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white w-full max-w-5xl h-[85vh] rounded-none flex flex-col shadow-2xl relative z-10 overflow-hidden font-main">
                {/* Header */}
                <div className="bg-brand-600 text-white px-8 py-6 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <CheckCircle size={28} />
                        <div>
                            <h2 className="text-2xl font-black uppercase tracking-tight">Kiểm Khê Thực Tế</h2>
                            <p className="text-brand-100 text-[10px] uppercase tracking-[0.2em] font-black mt-1">Cập nhật số dư kho chính xác</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="hover:bg-brand-700 p-2 rounded-none transition-colors"><X size={24} /></button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-auto bg-gray-50 p-8">
                    <div className="bg-white rounded-none shadow-sm border border-gray-100 overflow-hidden">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 text-[10px] uppercase font-bold tracking-[0.2em] text-[#9ca3af]">
                                <tr>
                                    <th className="px-6 py-4 text-left">Nguyên liệu</th>
                                    <th className="px-6 py-4 text-left">Tồn Máy</th>
                                    <th className="px-6 py-4 text-left">Tồn Thực Tế (Đếm)</th>
                                    <th className="px-6 py-4 text-left">Chênh Lệch</th>
                                    <th className="px-6 py-4 text-left">Lý do Hao hụt/Dư</th>
                                </tr>
                            </thead>
                            <tbody>
                                {auditData.map((item, index) => {
                                    const diff = parseFloat(item.actualStock || 0) - item.systemStock;
                                    const diffColor = diff < 0 ? 'text-red-500 bg-red-50/50' : diff > 0 ? 'text-brand-600 bg-brand-50/50' : 'text-gray-300';
                                    const diffSign = diff > 0 ? '+' : '';
                                    return (
                                        <tr key={item.ingredientId} className="border-t border-gray-50 hover:bg-gray-50/50 transition-colors">
                                            <td className="px-6 py-5 font-bold text-[15px]">{item.ingredientName}</td>
                                            <td className="px-6 py-5 text-left font-mono text-gray-500 font-medium">{item.systemStock} <span className="text-[10px] text-gray-400">{item.unit}</span></td>
                                            <td className="px-6 py-5 text-left">
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="number"
                                                        value={item.actualStock}
                                                        onChange={(e) => handleChange(index, 'actualStock', e.target.value)}
                                                        className={`w-28 border-2 ${parseFloat(item.actualStock) !== item.systemStock ? 'border-brand-500 bg-brand-50/30' : 'border-gray-200'} rounded-none px-4 py-2.5 text-center font-mono font-black text-lg focus:border-brand-500 focus:ring-4 focus:ring-brand-500/20 outline-none transition-all`}
                                                        onClick={(e) => e.target.select()}
                                                    />
                                                    <span className="text-[10px] text-gray-400 font-bold uppercase">{item.unit}</span>
                                                </div>
                                            </td>
                                            <td className={`px-6 py-5 text-left font-mono font-bold text-lg ${diffColor}`}>
                                                {diff === 0 ? '-' : `${diffSign}${diff.toFixed(2)}`}
                                            </td>
                                            <td className="px-6 py-5 text-left">
                                                {diff !== 0 && (
                                                    <select
                                                        value={item.reason}
                                                        onChange={(e) => handleChange(index, 'reason', e.target.value)}
                                                        className="w-full border-2 border-gray-100 bg-gray-50 rounded-none px-4 py-3 text-sm font-medium text-gray-700 focus:border-brand-500 focus:bg-white outline-none cursor-pointer transition-colors"
                                                    >
                                                        <option>Không rõ</option>
                                                        <option>Hao hụt tự nhiên</option>
                                                        <option>Đổ vỡ / Hư hỏng</option>
                                                        <option>Sai định lượng lúc pha</option>
                                                        <option>Kiểm kê sai lần trước</option>
                                                        <option>Hàng Tặng / Hủy</option>
                                                    </select>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Footer */}
                <div className="bg-white px-8 py-6 border-t border-gray-100 flex justify-between items-center">
                    <div className="bg-amber-50 rounded-none p-3 w-1/2 flex items-center gap-3">
                        <AlertTriangle size={20} className="text-amber-500 flex-shrink-0" />
                        <p className="text-[10px] text-amber-800 font-black uppercase tracking-widest leading-relaxed">
                            Lưu ý: Mọi số liệu Tồn Máy tính sẽ bị thay thế thành Tồn Đếm Thực Tế.
                        </p>
                    </div>
                    <div className="flex gap-4">
                        <button onClick={onClose} className="px-8 py-4 text-gray-500 font-black text-[11px] uppercase tracking-[0.2em] hover:bg-gray-100 rounded-none transition-all">Hủy</button>
                        <button onClick={handleSave} disabled={submitting} className="bg-brand-600 text-white px-10 py-4 rounded-none font-black text-xs uppercase tracking-[0.2em] shadow-lg shadow-brand-500/30 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2">
                            {submitting ? 'ĐANG LƯU...' : <><CheckCircle size={18} strokeWidth={3} /> XÁC NHẬN CHỐT</>}
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};


const IngredientUsageModal = ({ item, onClose }) => {
    const [timeWindow, setTimeWindow] = useState('14_days'); // '7_days', '14_days', '30_days', 'custom'
    const [customStart, setCustomStart] = useState(() => {
        const d = getVNTime(); d.setDate(d.getUTCDate() - 14); return d.toISOString().split('T')[0];
    });
    const [customEnd, setCustomEnd] = useState(() => getVNDateStr());

    // 1. Calculate Average Daily Usage
    const usageObj = item.usageHistory || {};
    const dates = Object.keys(usageObj).sort();

    let avgDaily = 0;
    let daysRemainingText = 'Chưa có dữ liệu';
    let chartData = [];
    let monthlyStats = {};

    let startDate = new Date();
    let endDate = new Date();

    if (timeWindow === '7_days') {
        startDate.setDate(endDate.getDate() - 6);
    } else if (timeWindow === '14_days') {
        startDate.setDate(endDate.getDate() - 13);
    } else if (timeWindow === '30_days') {
        startDate.setDate(endDate.getDate() - 29);
    } else if (timeWindow === 'custom') {
        startDate = new Date(customStart);
        endDate = new Date(customEnd);
    }
    // Ensure startDate is start of day, endDate is end of day
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    if (dates.length > 0) {
        // Lấy dữ liệu cho chart
        const firstDateObj = new Date(dates[0]);
        // Tính TB (dựa trên số lượng ngày thực tế từ lần ps đầu tiên, để đưa ra con số tổng quan đúng nhất)
        const totalUsed = Object.values(usageObj).reduce((a, b) => a + b, 0);
        const totalDaysDiff = Math.max(1, Math.ceil((new Date().getTime() - firstDateObj.getTime()) / (1000 * 60 * 60 * 24)));
        avgDaily = totalUsed / totalDaysDiff;

        if (avgDaily > 0) {
            const daysLeft = Math.floor(item.stock / avgDaily);
            daysRemainingText = `Khoảng ${daysLeft} ngày`;
        } else {
            daysRemainingText = 'Rất lâu';
        }

        // Tạo mảng dữ liệu chart tuỳ chỉnh
        const diffDaysWindow = Math.max(0, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
        // Limit to 100 days maximum for rendering performance
        const renderDays = Math.min(diffDaysWindow, 100);

        for (let i = renderDays; i >= 0; i--) {
            const d = new Date(endDate);
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            chartData.push({
                date: dateStr,
                label: `${d.getDate()}/${d.getMonth() + 1}`,
                value: usageObj[dateStr] || 0
            });
        }

        // Monthly stats
        dates.forEach(d => {
            const monthObj = d.substring(0, 7); // YYYY-MM
            monthlyStats[monthObj] = (monthlyStats[monthObj] || 0) + usageObj[d];
        });
    }

    const actualMaxChartVal = Math.max(...chartData.map(d => d.value), 0);
    // Tăng trần biểu đồ lên 25% để phần đỉnh cột cao nhất có chỗ hiển thị tooltip mà ko bị cắt
    const maxChartVal = Math.max(actualMaxChartVal * 1.25, 1);

    const nonZeroVals = chartData.filter(d => d.value > 0).map(d => d.value);
    const minChartVal = nonZeroVals.length > 0 ? Math.min(...nonZeroVals) : 0;

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <motion.div initial={{ y: 50, opacity: 0, scale: 0.95 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 50, opacity: 0, scale: 0.95 }}
                className="bg-white shadow-2xl flex flex-col w-full max-w-4xl relative z-10 max-h-[95vh]">

                {/* Header */}
                <div className="bg-gray-900 p-6 sm:p-8 flex justify-between items-start relative overflow-hidden shrink-0">
                    <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at top right, #fff 0%, transparent 50%)' }} />
                    <div className="relative z-10">
                        <div className="flex items-center gap-3 mb-2">
                            <span className="p-2 sm:p-3 bg-white/10 text-white flex items-center justify-center">
                                <BarChart3 size={24} />
                            </span>
                            <h2 className="text-3xl font-black text-white tracking-tight">{item.name}</h2>
                        </div>
                        <p className="text-gray-400 text-sm font-black uppercase tracking-widest flex items-center gap-2">
                            Báo cáo mức độ sử dụng <ArrowUpRight size={14} className="text-brand-400" />
                        </p>
                    </div>
                    <button onClick={onClose} className="p-3 bg-white/5 hover:bg-red-500 text-white rounded-none transition-colors relative z-10">
                        <X size={24} />
                    </button>
                </div>

                <div className="p-6 sm:p-8 overflow-y-auto flex-1 bg-gray-50/50">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        <div className="bg-white px-8 py-6 border border-gray-100 shadow-sm border-l-4 border-l-blue-500 flex flex-col justify-center">
                            <p className="text-xs uppercase font-black tracking-[0.2em] text-gray-400 mb-2">Tồn kho hiện tại</p>
                            <p className="text-3xl font-black text-brand-600">{item.stock} <span className="text-base font-bold text-gray-400">{item.unit}</span></p>
                        </div>
                        <div className="bg-white px-8 py-6 border border-gray-100 shadow-sm border-l-4 border-l-amber-500 flex flex-col justify-center">
                            <p className="text-xs uppercase font-black tracking-[0.2em] text-gray-400 mb-2">Sử dụng trung bình / ngày</p>
                            <p className="text-3xl font-black text-amber-600">{(avgDaily).toFixed(1)} <span className="text-base font-bold text-gray-400">{item.unit}</span></p>
                        </div>
                        <div className="md:col-span-2 bg-white px-8 py-6 border border-gray-100 shadow-sm border-l-4 border-l-brand-500 flex items-center justify-between">
                            <div>
                                <p className="text-xs uppercase font-black tracking-[0.2em] text-gray-400 mb-2">Dự báo cạn kho (Tốc độ hiện tại)</p>
                                <p className="text-3xl font-black text-brand-600">{daysRemainingText}</p>
                            </div>
                            <div className="w-16 h-16 bg-brand-50 text-brand-500 rounded-none flex items-center justify-center shrink-0">
                                <Clock size={32} />
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 mt-8">
                        <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
                            <LineChart size={18} className="text-brand-500" /> Biểu đồ tiêu thụ
                        </h3>
                        <div className="flex flex-wrap gap-3 items-center">
                            <select value={timeWindow} onChange={e => setTimeWindow(e.target.value)} className="bg-white border border-gray-200 text-xs font-bold px-4 py-2.5 outline-none focus:border-brand-500 uppercase tracking-widest cursor-pointer hover:bg-gray-50">
                                <option value="7_days">7 Ngày qua</option>
                                <option value="14_days">14 Ngày qua</option>
                                <option value="30_days">30 Ngày qua</option>
                                <option value="custom">Tùy chọn</option>
                            </select>
                            {timeWindow === 'custom' && (
                                <div className="flex gap-2 items-center text-gray-600 font-medium">
                                    <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="bg-white border border-gray-200 text-xs px-3 py-2.5 outline-none focus:border-brand-500 cursor-text" />
                                    <span className="font-bold px-1">-</span>
                                    <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="bg-white border border-gray-200 text-xs px-3 py-2.5 outline-none focus:border-brand-500 cursor-text" />
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="bg-white px-6 md:px-8 py-8 border border-gray-100 shadow-sm mb-8 w-full">
                        {chartData.length > 0 ? (
                            <div className="h-[280px] flex items-end justify-start gap-4 overflow-x-auto hide-scrollbar scroll-smooth pt-16 pb-12">
                                {chartData.map((d, idx) => {
                                    const heightPct = (d.value / maxChartVal) * 100;
                                    return (
                                        <div key={idx} className="flex-shrink-0 flex flex-col items-center justify-end h-full group w-[30px]">
                                            <div className="relative w-[15px] flex flex-col justify-end cursor-crosshair" style={{ height: `calc(${Math.max(heightPct, 1)}% - 20px)` }}>
                                                {/* Tooltip pinned to top of the bar container */}
                                                <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[12px] font-black px-3 py-1.5 rounded-none opacity-0 group-hover:opacity-100 group-hover:bottom-[calc(100%+8px)] transition-all duration-300 ease-out pointer-events-none whitespace-nowrap z-50 shadow-lg">
                                                    {d.value} <span className="font-medium text-gray-300 ml-1">{item.unit}</span>
                                                    <div className="absolute -bottom-[5px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-gray-900"></div>
                                                </div>

                                                {/* Bar */}
                                                <div className="w-full h-full rounded-none bg-brand-600 transition-all duration-300 group-hover:bg-brand-400 group-hover:shadow-[0_0_8px_rgba(0,122,255,0.6)]" />
                                            </div>
                                            <span className="text-[10px] font-bold text-gray-400 mt-4 -rotate-45 origin-top-left whitespace-nowrap inline-block translate-y-3 translate-x-1">{d.label}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="h-[280px] flex items-center justify-center text-sm font-bold text-gray-400 italic">
                                Chưa có dữ liệu tiêu thụ.
                            </div>
                        )}
                        <div className="mt-4 flex justify-between items-center bg-gray-50 border border-gray-100 px-6 py-4 text-sm font-bold text-gray-600">
                            <span>MỨC THẤP NHẤT <span className="text-xs font-normal italic">(Có xuất kho)</span>: <span className="text-gray-900 ml-1">{minChartVal.toFixed(1)} {item.unit}</span></span>
                            <span>MỨC CAO NHẤT: <span className="text-brand-600 ml-1">{actualMaxChartVal.toFixed(1)} {item.unit}</span></span>
                        </div>
                    </div>

                    {Object.keys(monthlyStats).length > 0 && (
                        <div className="mt-8">
                            <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <History size={18} className="text-orange-500" /> Tổng hợp theo tháng
                            </h3>
                            <div className="bg-white border border-gray-100 shadow-sm overflow-hidden">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-gray-50 border-b border-gray-200">
                                            <th className="px-6 py-4 text-sm font-black text-gray-500 uppercase tracking-[0.1em]">Tháng thống kê</th>
                                            <th className="px-6 py-4 text-sm font-black text-gray-500 uppercase text-right tracking-[0.1em]">Tổng lượng tiêu thụ</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {Object.keys(monthlyStats).sort().reverse().map(m => (
                                            <tr key={m} className="hover:bg-brand-50/50 transition-colors">
                                                <td className="px-6 py-5 text-sm font-black text-gray-900">{m}</td>
                                                <td className="px-6 py-5 text-base font-black text-[#C68E5E] text-right">{monthlyStats[m].toFixed(1)} <span className="text-xs font-bold text-gray-400 ml-1">{item.unit}</span></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
    );
};

// --- CSV Data Handlers for bulk loops ---
const generateCSV = (rows) => {
    return rows.map(row =>
        row.map(cell => {
            const str = String(cell === undefined || cell === null ? '' : cell);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        }).join(',')
    ).join('\n');
};

const parseCSV = (text) => {
    const result = [];
    let insideQuote = false;
    let currentEntry = [];
    let currentString = '';
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (insideQuote) {
            if (char === '"') {
                if (text[i + 1] === '"') {
                    currentString += '"';
                    i++;
                } else insideQuote = false;
            } else currentString += char;
        } else {
            if (char === '"') insideQuote = true;
            else if (char === ',') {
                currentEntry.push(currentString);
                currentString = '';
            } else if (char === '\n' || char === '\r') {
                currentEntry.push(currentString);
                currentString = '';
                if (currentEntry.join('').trim() !== '') result.push(currentEntry);
                currentEntry = [];
                if (char === '\r' && text[i + 1] === '\n') i++;
            } else currentString += char;
        }
    }
    if (currentString !== '' || text[text.length - 1] === ',') currentEntry.push(currentString);
    if (currentEntry.length > 0 && currentEntry.join('').trim() !== '') result.push(currentEntry);
    return result;
};

const AdminDashboard = () => {
    const isDesktop = () => {
        const userAgent = navigator.userAgent.toLowerCase();
        const isMobile = /iphone|ipad|ipod|android|blackberry|windows phone/g.test(userAgent);
        const isIPadPro = userAgent.includes('macintosh') && navigator.maxTouchPoints > 1;
        return !isMobile && !isIPadPro;
    };

    // Factory Reset State
    const [showFactoryResetModal, setShowFactoryResetModal] = useState(false);
    const [factoryResetStep, setFactoryResetStep] = useState(1);
    const [factoryResetInput, setFactoryResetInput] = useState('');
    const [isFactoryResetting, setIsFactoryResetting] = useState(false);

    // --- AUTO UPDATE STATE ---
    const [systemVersion, setSystemVersion] = useState('1.0.0');
    const [latestVersion, setLatestVersion] = useState(null);
    const [latestAssets, setLatestAssets] = useState([]);
    const [updateUrl, setUpdateUrl] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);
    const [showUpdateBanner, setShowUpdateBanner] = useState(true);
    const [desktopUpdateProgress, setDesktopUpdateProgress] = useState(null); // { percent, bytesPerSecond, transferred, total }
    const [isDesktopDownloading, setIsDesktopDownloading] = useState(false);

    useEffect(() => {
        // 1. Fetch local version from our backend
        fetch(`${SERVER_URL}/api/system/version`)
            .then(res => res.json())
            .then(data => setSystemVersion(data.version || '1.0.0'))
            .catch(e => console.error("Error fetching local version:", e));

        // 2. Fetch latest version and assets from GitHub API
        const githubUser = 'mvcthinhofficial';
        const githubRepo = 'order-cafe';
        const apiRecentUrl = `https://api.github.com/repos/${githubUser}/${githubRepo}/releases/latest`;

        fetch(apiRecentUrl)
            .then(res => res.json())
            .then(data => {
                const ver = data.tag_name ? data.tag_name.replace('v', '') : null;
                if (ver) {
                    setLatestVersion(ver);
                    setLatestAssets(data.assets || []);
                    // Construct fallback download URL for the .tar.gz (Linux)
                    setUpdateUrl(`https://github.com/${githubUser}/${githubRepo}/releases/download/v${ver}/order-cafe-v${ver}.tar.gz`);
                }
            })
            .catch(e => console.warn("Could not fetch latest release from GitHub API."));

        // 3. Desktop specific update listeners
        const isDesktop = !!(window.process && window.process.versions && window.process.versions.electron);
        if (isDesktop && window.require) {
            try {
                const { ipcRenderer } = window.require('electron');

                ipcRenderer.on('update-available', () => {
                    setIsDesktopDownloading(true);
                });

                ipcRenderer.on('update-progress', (event, progressObj) => {
                    setIsDesktopDownloading(true);
                    setDesktopUpdateProgress(progressObj);
                });

                ipcRenderer.on('update-downloaded', () => {
                    setIsDesktopDownloading(false);
                    setDesktopUpdateProgress(null);
                });

                return () => {
                    ipcRenderer.removeAllListeners('update-available');
                    ipcRenderer.removeAllListeners('update-progress');
                    ipcRenderer.removeAllListeners('update-downloaded');
                };
            } catch (err) {
                console.warn("Could not attach electron update listeners.");
            }
        }
    }, []);

    const handleSystemUpdate = async () => {
        const isMac = window.process?.platform === 'darwin';
        const isWindows = window.process?.platform === 'win32';

        if (isDesktop && (isMac || isWindows)) {
            setActiveTab('settings');
            setTimeout(() => {
                const element = document.getElementById('setting-system-update');
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }, 100);
            return;
        }

        if (!updateUrl) return alert("Không tìm thấy link tải bản cập nhật (Source code).");
        if (!window.confirm(`Bạn có chắc lọc muốn nâng cấp MÁY CHỦ (Linux) từ v${systemVersion} lên v${latestVersion}?\nServer sẽ tự động khởi động sau khi tải và giải nén xong.`)) return;

        setIsUpdating(true);
        try {
            const res = await fetch(`${SERVER_URL}/api/system/update`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ downloadUrl: updateUrl })
            });
            const data = await res.json();
            if (data.success) {
                alert(data.message);
                setShowUpdateBanner(false);
            } else {
                alert("Lỗi: " + data.message);
                setIsUpdating(false);
            }
        } catch (e) {
            alert("Lỗi kết nối khi gửi yêu cầu cập nhật.");
            setIsUpdating(false);
        }
    };

    const [confirmZeroOrder, setConfirmZeroOrder] = useState(null);
    const navigate = useNavigate();
    const userRole = localStorage.getItem('userRole') || 'STAFF';
    const userName = localStorage.getItem('userName') || '';
    const [activeTab, setActiveTab] = useState('orders'); // orders, tables, menu, inventory, staff, reports, settings
    const [masterLedgerLimit, setMasterLedgerLimit] = useState(50);
    const [auditLimit, setAuditLimit] = useState(50);

    useEffect(() => {
        setMasterLedgerLimit(50);
        setAuditLimit(50);
    }, [activeTab]);
    const [settings, setSettings] = useState({
        shopName: 'TH-POS',
        shopSlogan: 'Cần là có ngay.',
        bankId: 'TCB',
        accountNo: '1919729292',
        accountName: 'TH-POS',
        customQrUrl: null,
        isTakeaway: false,
        requirePrepayment: true,
        cfToken: '',
        cfDomain: '',
        // ── Module phím tắt ──
        flashConfirmationEnabled: true,  // Hiệu ứng loé xác nhận khi gõ mã
        showHotkeys: false,              // Chế độ học tập: hiển thị badge mã trên thẻ món
        menuCategories: ['TRUYỀN THỐNG', 'PHA MÁY', 'Trà', 'Khác'],
    });

    // Change Admin Password State
    const [passwordData, setPasswordData] = useState({
        oldPassword: '',
        newPassword: '',
        confirmPassword: ''
    });
    const [passwordMessage, setPasswordMessage] = useState({ text: '', type: '' });
    const [isKioskOpen, setIsKioskOpen] = useState(false);
    const [showCategoryManager, setShowCategoryManager] = useState(false);
    const [orders, setOrders] = useState([]);
    const [orderGridColumns, setOrderGridColumns] = useState(() => parseInt(localStorage.getItem('orderGridColumns')) || 5);
    const [priorityMode, setPriorityMode] = useState(() => localStorage.getItem('priorityMode') === 'true' || localStorage.getItem('priorityMode') === null);
    useEffect(() => {
        localStorage.setItem('priorityMode', priorityMode.toString());
    }, [priorityMode]);
    useEffect(() => {
        localStorage.setItem('orderGridColumns', orderGridColumns.toString());
    }, [orderGridColumns]);
    const [showCompletedOrders, setShowCompletedOrders] = useState(false);
    const showCompletedOrdersRef = useRef(false);
    const [showDebtOrders, setShowDebtOrders] = useState(false);
    const showDebtOrdersRef = useRef(false);
    const [payDebtOrderId, setPayDebtOrderId] = useState(null);
    const [viewReceiptOrder, setViewReceiptOrder] = useState(null);
    const [historyDate, setHistoryDate] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    const historyDateRef = useRef(historyDate);
    const [historySortOrder, setHistorySortOrder] = useState('desc');
    const [activeQrOrderId, setActiveQrOrderId] = useState(null);
    const [menu, setMenu] = useState([]);
    const [promotions, setPromotions] = useState([]);
    const [tables, setTables] = useState([]);
    const [inventory, setInventory] = useState([]);
    const [expenses, setExpenses] = useState([]);
    const [editExpense, setEditExpense] = useState(null);
    const [staff, setStaff] = useState([]);
    const [staffSubTab, setStaffSubTab] = useState('list');
    const [attendanceToken, setAttendanceToken] = useState('');
    const [schedules, setSchedules] = useState([]);
    const [disciplinaryLogs, setDisciplinaryLogs] = useState([]);
    const [showDisciplinaryModalFor, setShowDisciplinaryModalFor] = useState(null);
    const [shifts, setShifts] = useState([]);
    const [ratings, setRatings] = useState([]);
    const [report, setReport] = useState({ totalSales: 0, successfulOrders: 0, cancelledOrders: 0, logs: [] });
    const [copiedId, setCopiedId] = useState(null);
    const [expandedItemId, setExpandedItemId] = useState(null);
    const [pendingTab, setPendingTab] = useState(null);
    const [reportPeriod, setReportPeriod] = useState('today');
    const [taxReportPeriod, setTaxReportPeriod] = useState('MONTH'); // 'MONTH', 'QUARTER', 'YEAR'
    const [customStartDate, setCustomStartDate] = useState(() => getVNDateStr());
    const [customEndDate, setCustomEndDate] = useState(() => getVNDateStr());
    const [editImport, setEditImport] = useState(null);
    const [showRecipeGuide, setShowRecipeGuide] = useState(false);
    const [recipeGuideSearch, setRecipeGuideSearch] = useState('');
    const [showMenuTrash, setShowMenuTrash] = useState(false);

    // Tính toán số liệu thống kê chung cho Component cha (Đặc biệt để truyền xuống InlineEditPanel)
    const { stats30Days, totalFixed } = useMemo(() => {
        const _calcStats = () => {
            if (!report?.logs) return { projectedMonthlyItems: 0 };
            const now = new Date();
            const thirtyAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            const logs30 = report.logs.filter(log => new Date(log.timestamp) >= thirtyAgo && log.type === 'COMPLETED');
            let itemsCount = 0;
            const uniqDays = new Set();
            logs30.forEach(log => {
                uniqDays.add(new Date(log.timestamp).toLocaleDateString());
                const items = (log.itemName || '').split(',');
                items.forEach(itemStr => {
                    const match = itemStr.match(/x(\d+)/);
                    if (match) itemsCount += parseInt(match[1]);
                    else if (itemStr.trim()) itemsCount += 1;
                });
            });
            const openDays = uniqDays.size || 1;
            return { projectedMonthlyItems: (itemsCount / openDays) * 30 };
        };

        const _calcFixed = () => {
            const costs = report?.fixedCosts || {};
            const avgMonth = (filterFn) => {
                const exps = (expenses || []).filter(e => e.date && filterFn(e));
                if (exps.length === 0) return 0;
                const total = exps.reduce((sum, e) => sum + Number(e.amount), 0);
                const uniqueMonths = new Set(exps.map(e => {
                    const d = new Date(e.date);
                    return `${d.getFullYear()}-${d.getMonth()}`;
                })).size;
                return total / Math.max(1, uniqueMonths);
            };

            const dynRent = Math.round(avgMonth(e => e.category === 'Mặt bằng (Cố định)')) * 1000;
            const dynElec = Math.round(avgMonth(e => e.category === 'Điện, Nước & Internet' && e.name?.toLowerCase().includes('điện'))) * 1000;
            const dynWater = Math.round(avgMonth(e => e.category === 'Điện, Nước & Internet' && e.name?.toLowerCase().includes('nước'))) * 1000;
            const dynOther = Math.round(avgMonth(e => e.category === 'Khác')) * 1000;
            const dynMach = Math.round((expenses || []).filter(e => e.category === 'Đầu tư & Máy móc').reduce((sum, e) => sum + Number(e.amount), 0) / 12) * 1000;

            const thirtyAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            const dynSalaries = (shifts || []).filter(s => s.clockOut && s.totalPay && new Date(s.clockIn) >= thirtyAgo).reduce((sum, s) => sum + (s.totalPay || 0) * 1000, 0);

            const effRent = costs.useDynamicRent ? dynRent : (parseFloat(costs.rent) * 1000 || 0);
            const effMach = costs.useDynamicMachines ? dynMach : (parseFloat(costs.machines) * 1000 || 0);
            const effElec = costs.useDynamicElectricity ? dynElec : (parseFloat(costs.electricity) * 1000 || 0);
            const effWater = costs.useDynamicWater ? dynWater : (parseFloat(costs.water) * 1000 || 0);
            const effOther = costs.useDynamicOther ? dynOther : (parseFloat(costs.other) * 1000 || 0);
            const effSalaries = costs.useDynamicSalaries ? dynSalaries : (parseFloat(costs.salaries) * 1000 || 0);

            return effRent + effMach + effElec + effWater + effOther + effSalaries;
        };

        return { stats30Days: _calcStats(), totalFixed: _calcFixed() };
    }, [report, expenses, shifts]);
    const [showImportTrash, setShowImportTrash] = useState(false);
    const [deleteInventoryModal, setDeleteInventoryModal] = useState(null);
    const [selectedMergeItems, setSelectedMergeItems] = useState([]);
    const [showMergeModal, setShowMergeModal] = useState(false);
    const [deleteMenuModal, setDeleteMenuModal] = useState(null);
    const [editPromo, setEditPromo] = useState(null);

    const savePromotion = async (promo) => {
        try {
            const method = promo.id ? 'PUT' : 'POST';
            const url = promo.id ? `${SERVER_URL}/api/promotions/${promo.id}` : `${SERVER_URL}/api/promotions`;
            const res = await fetch(url, {
                method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(promo)
            });
            if (res.ok) {
                const refreshed = await fetch(`${SERVER_URL}/api/promotions`);
                setPromotions(await refreshed.json());
                setEditPromo(null);
            }
        } catch (e) { alert('Lỗi: ' + e.message); }
    };

    const deletePromotion = async (id) => {
        try {
            const res = await fetch(`${SERVER_URL}/api/promotions/${id}`, { method: 'DELETE' });
            if (res.ok) {
                setPromotions(prev => prev.filter(p => p.id !== id));
            }
        } catch (e) { }
    };

    const saveExpense = async (expense) => {
        try {
            const res = await fetch(`${SERVER_URL}/api/expenses`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(expense)
            });
            if (res.ok) {
                const refreshed = await fetch(`${SERVER_URL}/api/expenses`);
                setExpenses(await refreshed.json());
                setEditExpense(null);
                return true;
            }
            return false;
        } catch (e) { alert('Lỗi: ' + e.message); return false; }
    };

    const deleteExpense = async (id) => {
        if (!confirm('Bạn có chắc muốn xóa khoản chi này?')) return;
        try {
            const res = await fetch(`${SERVER_URL}/api/expenses/${id}`, { method: 'DELETE' });
            if (res.ok) {
                setExpenses(prev => prev.filter(e => e.id !== id));
            }
        } catch (e) { }
    };

    const [imports, setImports] = useState([]);
    const [inventoryStats, setInventoryStats] = useState([]);
    const [inventoryAudits, setInventoryAudits] = useState([]);
    const [auditFilterIngredient, setAuditFilterIngredient] = useState('all');
    const [auditFilterPeriod, setAuditFilterPeriod] = useState('all');
    const [auditStartDate, setAuditStartDate] = useState(() => getVNDateStr());
    const [auditEndDate, setAuditEndDate] = useState(() => getVNDateStr());
    const [auditReportTab, setAuditReportTab] = useState('history'); // history, manual 
    const [showAuditModal, setShowAuditModal] = useState(false);

    // Bán Thành Phẩm Production State
    const [showProductionModal, setShowProductionModal] = useState(false);
    const [productionInputs, setProductionInputs] = useState([{ id: '', qty: '' }]);
    const [productionOutputItem, setProductionOutputItem] = useState(''); // Stores the Name or ID
    const [productionOutputUnit, setProductionOutputUnit] = useState('');
    const [productionOutputQty, setProductionOutputQty] = useState('');
    const [inventorySubTab, setInventorySubTab] = useState('import'); // 'import' | 'raw'
    const [inventoryPeriod, setInventoryPeriod] = useState('month'); // today, week, month, all
    const [inventoryReportMode, setInventoryReportMode] = useState('standard'); // standard, calendar
    const [selectedMonth, setSelectedMonth] = useState(getVNTime().getUTCMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(getVNTime().getUTCFullYear());
    const [selectedQuarter, setSelectedQuarter] = useState(Math.floor(getVNTime().getUTCMonth() / 3) + 1);
    const [calType, setCalType] = useState('month'); // month, quarter, year
    const [lanIP, setLanIP] = useState('localhost');
    const [lanHostname, setLanHostname] = useState('');
    const [showCfGuide, setShowCfGuide] = useState(false);
    const [cfStatus, setCfStatus] = useState({ active: false, log: '' });
    const [qrToken, setQrToken] = useState(null);
    const [draggingId, setDraggingId] = useState(null);
    const [editingIngId, setEditingIngId] = useState(null);
    const [editingIngName, setEditingIngName] = useState('');
    const [currentDataPath, setCurrentDataPath] = useState('');
    const [bepMode, setBepMode] = useState('item'); // 'item' | 'average'
    const [orderShortcutBuffer, setOrderShortcutBuffer] = useState('');
    const fetchQrToken = async () => {
        try {
            const res = await fetch(`${SERVER_URL}/api/qr-info`);
            const data = await res.json();
            if (data.success) {
                setQrToken(data.token);
                // Also sync kiosk visibility state
                setSettings(prev => ({ ...prev, showQrOnKiosk: data.showQrOnKiosk, showStaffQrOnKiosk: data.showStaffQrOnKiosk }));
            }
        } catch (error) {
            console.error('Failed to fetch QR token:', error);
        }
    };

    const filteredAuditsList = React.useMemo(() => {
        const now = new Date();
        now.setHours(23, 59, 59, 999);
        let startOfPeriod = new Date(0);
        let endOfPeriod = now;

        if (auditFilterPeriod === 'today') {
            startOfPeriod = new Date();
            startOfPeriod.setHours(0, 0, 0, 0);
        } else if (auditFilterPeriod === '7days') {
            startOfPeriod = new Date();
            startOfPeriod.setDate(now.getDate() - 7);
            startOfPeriod.setHours(0, 0, 0, 0);
        } else if (auditFilterPeriod === '30days') {
            startOfPeriod = new Date();
            startOfPeriod.setDate(now.getDate() - 30);
            startOfPeriod.setHours(0, 0, 0, 0);
        } else if (auditFilterPeriod === 'thisMonth') {
            startOfPeriod = new Date(now.getFullYear(), now.getMonth(), 1);
        } else if (auditFilterPeriod === 'lastMonth') {
            startOfPeriod = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            endOfPeriod = new Date(now.getFullYear(), now.getMonth(), 0);
            endOfPeriod.setHours(23, 59, 59, 999);
        } else if (auditFilterPeriod === 'custom') {
            startOfPeriod = new Date(auditStartDate);
            startOfPeriod.setHours(0, 0, 0, 0);
            endOfPeriod = new Date(auditEndDate);
            endOfPeriod.setHours(23, 59, 59, 999);
        }

        return inventoryAudits.filter(a => {
            if (auditFilterIngredient !== 'all') {
                if (a.type === 'PRODUCTION' || a.type === 'ORDER') {
                    const filterName = inventory.find(i => i.id === auditFilterIngredient)?.name || auditFilterIngredient;
                    const matchesOutput = a.output && a.output.name === filterName;
                    const matchesInput = a.inputs && a.inputs.some(i => i.name === filterName || i.id === auditFilterIngredient);
                    if (!matchesOutput && !matchesInput) return false;
                } else {
                    if (a.ingredientId !== auditFilterIngredient) return false;
                }
            }
            if (auditFilterPeriod === 'all') return true;
            const t = new Date(a.timestamp).getTime();
            return t >= startOfPeriod.getTime() && t <= endOfPeriod.getTime();
        });
    }, [inventoryAudits, auditFilterIngredient, auditFilterPeriod, auditStartDate, auditEndDate, inventory]);

    const historicalStockLevels = React.useMemo(() => {
        if (auditFilterIngredient === 'all') return [];

        const ingredientObj = inventory.find(i => i.id === auditFilterIngredient);
        const startStock = ingredientObj ? parseFloat(ingredientObj.stock || 0) : 0;

        const flattened = [];
        inventoryAudits.forEach(audit => {
            if (audit.type === 'PRODUCTION') {
                if (audit.output && (audit.output.id === auditFilterIngredient || audit.output.name === ingredientObj?.name)) {
                    flattened.push({ ...audit, displayDifference: parseFloat(audit.output.qty || 0) });
                }
                if (Array.isArray(audit.inputs)) {
                    audit.inputs.forEach(inp => {
                        const invInp = inventory.find(i => i.name === inp.name || i.id === inp.id);
                        if (invInp?.id === auditFilterIngredient || inp.id === auditFilterIngredient) {
                            flattened.push({ ...audit, displayDifference: -parseFloat(inp.qty || 0) });
                        }
                    });
                }
            } else if (audit.type === 'ORDER') {
                if (Array.isArray(audit.inputs)) {
                    audit.inputs.forEach(inp => {
                        const invInp = inventory.find(i => i.name === inp.name || i.id === inp.id);
                        if (invInp?.id === auditFilterIngredient || inp.id === auditFilterIngredient) {
                            flattened.push({ ...audit, displayDifference: -parseFloat(inp.qty || 0) });
                        }
                    });
                }
            } else {
                if (audit.ingredientId === auditFilterIngredient) {
                    flattened.push({ ...audit, displayDifference: audit.difference || 0 });
                }
            }
        });

        flattened.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        let currentStock = startStock;
        const result = flattened.map(audit => {
            const stockAfter = currentStock;
            currentStock = currentStock - audit.displayDifference;
            return { ...audit, stockAfter };
        });

        return result;
    }, [inventoryAudits, auditFilterIngredient, inventory]);

    const flattenedAuditsList = React.useMemo(() => {
        const flattened = [];
        filteredAuditsList.forEach(audit => {
            if (audit.type === 'PRODUCTION') {
                flattened.push({
                    ...audit,
                    isUnrolledOutput: true,
                    rowId: `${audit.id}-out`,
                    displayIngredientId: audit.output?.id || audit.output?.name,
                    displayIngredientName: audit.output?.name,
                    displayDifference: parseFloat(audit.output?.qty || 0),
                    displayUnit: audit.output?.unit || inventory.find(i => i.name === audit.output?.name)?.unit || '',
                    displayCost: audit.calculatedCost || 0,
                    displayReason: `Nhập kho từ chế biến (NV: ${audit.userName})`,
                    isOrderLink: false
                });
                if (Array.isArray(audit.inputs)) {
                    audit.inputs.forEach((inp, idx) => {
                        const invInp = inventory.find(i => i.name === inp.name || i.id === inp.id);
                        flattened.push({
                            ...audit,
                            isUnrolledInput: true,
                            rowId: `${audit.id}-inp-${idx}`,
                            displayIngredientId: invInp?.id || inp.id,
                            displayIngredientName: inp.name,
                            displayDifference: -parseFloat(inp.qty || 0),
                            displayUnit: invInp?.unit || '',
                            displayCost: -parseFloat(inp.qty || 0) * parseFloat(inventoryStats.find(s => s.id === (invInp?.id || inp.id))?.avgCost || invInp?.avgCost || invInp?.importPrice || 0),
                            displayReason: `Nung/pha chế tạo mẻ ${audit.output?.name}`,
                            isOrderLink: false
                        });
                    });
                }
            } else if (audit.type === 'ORDER' || audit.type === 'ORDER_REFUND') {
                const isRefund = audit.type === 'ORDER_REFUND';
                if (Array.isArray(audit.inputs)) {
                    audit.inputs.forEach((inp, idx) => {
                        const invInp = inventory.find(i => i.name === inp.name || i.id === inp.id);
                        const qtyDiff = isRefund ? parseFloat(inp.qty || 0) : -parseFloat(inp.qty || 0);
                        flattened.push({
                            ...audit,
                            rowId: `${audit.id}-inp-${idx}`,
                            displayIngredientId: invInp?.id || inp.id,
                            displayIngredientName: inp.name,
                            displayDifference: qtyDiff,
                            displayUnit: inp.unit || invInp?.unit || '',
                            displayCost: inp.costDifference || (qtyDiff * parseFloat(inventoryStats.find(s => s.id === (invInp?.id || inp.id))?.avgCost || invInp?.avgCost || invInp?.importPrice || 0)),
                            displayReason: isRefund ? `Hoàn hóa đơn #${audit.queueNumber}` : `Trừ hóa đơn #${audit.queueNumber}`,
                            isOrderLink: true,
                            linkedOrderId: audit.orderId
                        });
                    });
                }
            } else {
                flattened.push({
                    ...audit,
                    rowId: audit.id,
                    displayIngredientId: audit.ingredientId,
                    displayIngredientName: audit.ingredientName,
                    displayDifference: audit.difference || 0,
                    displayUnit: audit.unit || '',
                    displayCost: audit.costDifference || ((audit.difference || 0) * parseFloat(inventoryStats.find(s => s.id === audit.ingredientId)?.avgCost || inventory.find(i => i.id === audit.ingredientId)?.avgCost || inventory.find(i => i.id === audit.ingredientId)?.importPrice || 0)),
                    displayReason: audit.reason || 'Kiểm kho thủ công',
                    isOrderLink: false
                });
            }
        });

        return flattened.filter(a => {
            if (auditFilterIngredient === 'all') return true;
            return a.displayIngredientId === auditFilterIngredient;
        });
    }, [filteredAuditsList, auditFilterIngredient, inventory]);

    // Mobile Redirect Protection
    useEffect(() => {
        const isMobileDevice = () => {
            return /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        };
        if (isMobileDevice()) {
            navigate('/order');
        }
    }, [navigate]);

    // Poll for QR changes
    useEffect(() => {
        if (settings.qrProtectionEnabled) {
            fetchQrToken();
            const interval = setInterval(fetchQrToken, 2000);
            return () => clearInterval(interval);
        }
    }, [settings.qrProtectionEnabled]);

    // Fetch Current Data Path from Electron
    useEffect(() => {
        const fetchPath = async () => {
            if (window.require) {
                const { ipcRenderer } = window.require('electron');
                const path = await ipcRenderer.invoke('get-current-data-path');
                setCurrentDataPath(path);
            }
        };
        fetchPath();
    }, []);

    const handleChangeDataPath = async () => {
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            const result = await ipcRenderer.invoke('select-data-directory');
            if (result.success) {
                setCurrentDataPath(result.path);
                showToast('Đã đổi thư mục dữ liệu! Vui lòng khởi động lại ứng dụng để áp dụng.', 'success');
            }
        }
    };


    const getFilteredLogs = () => {
        if (!report?.logs) return [];
        const now = new Date();
        const dateFiltered = report.logs.filter(log => {
            // SỬA LỖI: Lọc theo giờ TẠO ĐƠN (để đơn tạo hôm qua không lọt vào hôm nay dù hoàn thành vào sáng nay)
            const orderTimestampStr = log.orderData?.timestamp || log.timestamp;
            const logDate = new Date(orderTimestampStr);
            
            if (reportPeriod === 'today') {
                // So sánh theo giờ Việt Nam (UTC+7) để tránh lỗi timezone
                // Timestamp trong DB là UTC, browser ở +7 cần offset khi compare ngày
                const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
                const logVNDay = new Date(logDate.getTime() + VN_OFFSET_MS).toISOString().split('T')[0];
                const nowVNDay = new Date(now.getTime() + VN_OFFSET_MS).toISOString().split('T')[0];
                return logVNDay === nowVNDay;
            }
            if (reportPeriod === 'week') {
                const weekAgo = new Date(now);
                weekAgo.setDate(now.getDate() - 7);
                return logDate >= weekAgo;
            }
            if (reportPeriod === 'month') {
                return logDate.getMonth() === now.getMonth() && logDate.getFullYear() === now.getFullYear();
            }
            if (reportPeriod === 'quarter') {
                const currentQuarter = Math.floor(now.getMonth() / 3);
                const logQuarter = Math.floor(logDate.getMonth() / 3);
                return currentQuarter === logQuarter && logDate.getFullYear() === now.getFullYear();
            }
            if (reportPeriod === 'custom') {
                const start = new Date(customStartDate);
                start.setHours(0, 0, 0, 0);
                const end = new Date(customEndDate);
                end.setHours(23, 59, 59, 999);
                return logDate >= start && logDate <= end;
            }
            return true;
        });

        // Loại bỏ trùng lặp (ví dụ: 1 đơn có thể có COMPLETED, DEBT_MARKED, DEBT_PAID)
        // Chỉ giữ lại trạng thái lưu log cuối cùng của mỗi ID đơn hàng
        const uniqueLogsMap = new Map();

        dateFiltered.forEach(log => {
            const orderKey = log.orderId || log.id || log.orderData?.id;
            if (orderKey) {
                // Map liên tục bị ghi đè bởi log sinh ra sau cùng (mới nhất)
                uniqueLogsMap.set(orderKey, log);
            } else {
                // Fallback cho các log quá cũ không truy xuất được ID
                uniqueLogsMap.set(Date.now() + Math.random(), log);
            }
        });

        return Array.from(uniqueLogsMap.values());
    };

    const filteredLogs = getFilteredLogs();
    const stats = {
        sales: filteredLogs.reduce((s, l) => {
            const isRevenueLog = l.type === 'COMPLETED' || l.type === 'DEBT_MARKED' || l.type === 'DEBT_PAID';
            return s + (isRevenueLog ? (l.orderData?.preTaxTotal || parseFloat(l.price) || 0) : 0);
        }, 0),
        debt: filteredLogs.reduce((s, l) => s + (l.type === 'DEBT_MARKED' ? (parseFloat(l.price) || l.orderData?.price || 0) : 0), 0),
        success: filteredLogs.filter(l => l.type === 'COMPLETED' || l.type === 'DEBT_MARKED' || l.type === 'DEBT_PAID').length,
        cancelled: filteredLogs.filter(l => l.type === 'CANCELLED').length
    };

    const inventoryStatsMap = React.useMemo(() => new Map((inventoryStats || []).map(inv => [inv.id, inv])), [inventoryStats]);
    const menuMap = React.useMemo(() => new Map((menu || []).map(m => [m.id, m])), [menu]);

    const memoizedPromotionReport = React.useMemo(() => {
        const completedOrders = filteredLogs.filter(l => l.type === 'COMPLETED' && l.orderData && l.orderData.appliedPromoCode).slice().reverse();

        if (completedOrders.length === 0) {
            return (
                <tbody className="divide-y divide-gray-50 uppercase text-xs">
                    <tr>
                        <td colSpan="7" className="p-6 text-center text-gray-400 italic text-[11px] normal-case">Chưa có dữ liệu khuyến mãi trong thời gian này.</td>
                    </tr>
                </tbody>
            );
        }

        let totalGross = 0;
        let totalRevenue = 0;
        let totalDiscount = 0; // Total accumulated for 'Mức giảm' column 
        let totalDiscountRawCash = 0; // Total accumulated over pure cash discount for footer total
        let totalGiftCostAgg = 0;

        const rows = completedOrders.map(log => {
            const pCode = log.orderData.appliedPromoCode || '';
            const revenue = parseFloat(log.price) || 0;
            let discount = parseFloat(log.orderData.discount) || 0;

            let giftCost = 0;
            let giftRetailValue = 0;

            (log.orderData.cartItems || []).forEach(item => {
                const isFreeItem = item.isGift || parseFloat(item.totalPrice) === 0 || parseFloat(item.originalPrice) === 0;
                if (isFreeItem && item.item) {
                    giftRetailValue += (parseFloat(item.item.price) || 0) * item.count;

                    const recipe = item.item.recipe || [];
                    recipe.forEach(r => {
                        const inv = inventoryStatsMap.get(r.ingredientId);
                        if (inv) {
                            giftCost += (inv.avgCost || 0) * r.quantity * item.count;
                        }
                    });
                }
            });

            // Nếu là đơn cũ (Khôi phục) và chưa ghi nhận Mức giảm, ta bổ sung giá trị ly 0đ vào Mức giảm
            if (pCode.toUpperCase().includes('KHÔI PHỤC') && discount === 0 && giftRetailValue > 0) {
                discount = giftRetailValue;
            }

            // Chi phí cơ hội (Opportunity Cost) = Lợi nhuận đáng lẽ thu được (Mức giảm - Chi phí quà)
            const oppCost = discount - giftCost;
            // Tỉ lệ chi phí bỏ ra so với Doanh thu
            const ratio = revenue > 0 ? ((giftCost / revenue) * 100).toFixed(1) : 0;

            const grossVal = parseFloat(log.orderData?.price || log.price) || 0;
            const preTaxVal = log.orderData?.preTaxTotal || grossVal;

            totalGross += grossVal;
            totalRevenue += preTaxVal;
            totalDiscount += discount;
            totalGiftCostAgg += giftCost;

            return (
                <tr
                    key={log.orderId}
                    onClick={() => setSelectedLog(log)}
                    className="hover:bg-gray-100 transition-colors cursor-pointer"
                >
                    <td className="p-3 text-gray-500 font-medium">{new Date(log.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} <span className="text-[9px] block text-gray-400">{new Date(log.timestamp).toLocaleDateString('vi-VN')}</span></td>
                    <td className="p-3 font-bold text-brand-500 uppercase tracking-widest">{log.orderId.slice(0, 4)}...</td>
                    <td className="p-3 font-bold text-brand-700">{pCode}</td>
                    <td className="p-3 text-right font-black text-brand-600">{formatVND(revenue)}</td>
                    <td className="p-3 text-right font-bold text-amber-600">{formatVND(discount)}</td>
                    <td className="p-3 text-right font-bold text-amber-700">{formatVND(giftCost)}</td>
                    <td className="p-3 text-right">
                        <div className="font-black text-gray-900">{ratio}%</div>
                        <div className="text-[10px] font-bold text-gray-500 mt-0.5">MẤT: {formatVND(oppCost)}</div>
                    </td>
                </tr>
            );
        });

        // Tỉ lệ tổng quát và Tổng Chi phí cơ hội đánh đổi
        const totalOppCost = totalDiscount - totalGiftCostAgg;
        const overallRatio = totalRevenue > 0 ? ((totalGiftCostAgg / totalRevenue) * 100).toFixed(1) : 0;

        return (
            <>
                <tbody className="divide-y divide-gray-50 uppercase text-xs">
                    {rows}
                </tbody>
                <tfoot className="bg-brand-50/50 font-black text-xs uppercase border-t border-brand-200">
                    <tr>
                        <td colSpan="3" className="p-4 text-right text-brand-800">TỔNG CỘNG ({completedOrders.length} ĐƠN):</td>
                        <td className="p-4 text-right text-brand-600">{formatVND(totalRevenue)}</td>
                        <td className="p-4 text-right text-amber-600">{formatVND(totalDiscount)}</td>
                        <td className="p-4 text-right text-amber-700">{formatVND(totalGiftCostAgg)}</td>
                        <td className="p-4 text-right">
                            <div className="text-gray-900">{overallRatio}%</div>
                            <div className="text-[10px] text-gray-600 mt-1">ĐÁNH ĐỔI CPCH: {formatVND(totalOppCost)}</div>
                        </td>
                    </tr>
                </tfoot>
            </>
        );
    }, [filteredLogs, inventoryStatsMap, settings]);

    const memoizedDeliveryPartnerReport = React.useMemo(() => {
        const appOrders = filteredLogs.filter(l => l.type === 'COMPLETED' && l.orderData && (l.orderData.orderSource === 'GRAB' || l.orderData.orderSource === 'SHOPEE')).slice().reverse();

        if (appOrders.length === 0) {
            return (
                <tbody className="divide-y divide-gray-50 uppercase text-xs">
                    <tr>
                        <td colSpan="8" className="p-6 text-center text-gray-400 italic text-[11px] normal-case">Chưa có đơn hàng trên nền tảng trong thời gian này.</td>
                    </tr>
                </tbody>
            );
        }

        let totalGross = 0;
        let totalFee = 0;
        let totalNet = 0;
        let totalCOGS = 0;
        let totalProfit = 0;

        const rows = appOrders.map(log => {
            const source = log.orderData.orderSource;
            const gross = parseFloat(log.orderData.price) || 0;
            const fee = parseFloat(log.orderData.partnerFee) || 0;
            const tax = parseFloat(log.orderData.taxAmount) || 0;
            const net = (log.orderData.preTaxTotal || (gross - tax)) - fee;

            let cogs = 0;
            (log.orderData.cartItems || []).forEach(item => {
                if (item.item) {
                    const recipe = item.item.recipe || [];
                    recipe.forEach(r => {
                        const inv = inventoryStatsMap.get(r.ingredientId);
                        if (inv) {
                            cogs += (inv.avgCost || 0) * r.quantity * item.count;
                        }
                    });
                }
            });

            const profit = net - cogs;
            const marginRatio = net > 0 ? ((profit / net) * 100).toFixed(1) : 0;

            totalGross += gross;
            totalFee += fee;
            totalNet += net;
            totalCOGS += cogs;
            totalProfit += profit;

            return (
                <tr
                    key={log.orderId}
                    onClick={() => setSelectedLog(log)}
                    className="hover:bg-gray-100 transition-colors cursor-pointer"
                >
                    <td className="p-3 text-gray-500 font-medium">{new Date(log.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} <span className="text-[9px] block text-gray-400">{new Date(log.timestamp).toLocaleDateString('vi-VN')}</span></td>
                    <td className="p-3 font-bold text-brand-500 uppercase tracking-widest">{log.orderId.slice(0, 4)}...</td>
                    <td className={`p-3 font-bold ${source === 'GRAB' ? 'text-[#00B14F]' : 'text-[#EE4D2D]'}`}>{source}</td>
                    <td className="p-3 text-right font-medium text-gray-600">{formatVND(gross)}</td>
                    <td className="p-3 text-right font-medium text-red-500">-{formatVND(fee)}</td>
                    <td className="p-3 text-right font-bold text-brand-600">{formatVND(net)}</td>
                    <td className="p-3 text-right font-bold text-amber-700">{formatVND(cogs)}</td>
                    <td className="p-3 text-right">
                        <div className={`font-black ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatVND(profit)}</div>
                        <div className="text-[10px] font-bold text-gray-400 mt-0.5">Biên: {marginRatio}%</div>
                    </td>
                </tr>
            );
        });

        const overallMargin = totalNet > 0 ? ((totalProfit / totalNet) * 100).toFixed(1) : 0;

        return (
            <>
                <tbody className="divide-y divide-gray-50 uppercase text-xs">
                    {rows}
                </tbody>
                <tfoot className="bg-orange-50/50 font-black text-xs uppercase border-t border-orange-200">
                    <tr>
                        <td colSpan="3" className="p-4 text-left text-orange-800">TỔNG CỘNG ({appOrders.length} ĐƠN):</td>
                        <td className="p-4 text-left text-gray-600">{formatVND(totalGross)}</td>
                        <td className="p-4 text-left text-red-500">-{formatVND(totalFee)}</td>
                        <td className="p-4 text-left text-brand-600">{formatVND(totalNet)}</td>
                        <td className="p-4 text-left text-amber-700">{formatVND(totalCOGS)}</td>
                        <td className="p-4 text-left">
                            <div className={`${totalProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatVND(totalProfit)}</div>
                            <div className="text-[10px] text-gray-600 mt-1">BIÊN LN: {overallMargin}%</div>
                        </td>
                    </tr>
                </tfoot>
            </>
        );
    }, [filteredLogs, inventoryStatsMap]);

    const memoizedMasterLedgerRows = React.useMemo(() => {
        // Gộp log đã hoàn thành + đơn đang mở (chưa vào log) vào cùng 1 danh sách
        const logOrderIds = new Set(filteredLogs.map(l => String(l.orderId || l.id || l.orderData?.id)));
        const activeOrderEntries = (orders || []).filter(o => {
            // Chỉ lấy đơn đang mở trong ngày lọc và chưa có log
            if (o.status === 'COMPLETED' || o.status === 'CANCELLED') return false;
            const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
            const oVNDay = new Date(new Date(o.timestamp).getTime() + VN_OFFSET_MS).toISOString().split('T')[0];
            const now = new Date();
            const nowVNDay = new Date(now.getTime() + VN_OFFSET_MS).toISOString().split('T')[0];
            const isToday = oVNDay === nowVNDay;
            if (reportPeriod === 'today' && !isToday) return false;
            return !logOrderIds.has(String(o.id));
        }).map(o => ({
            type: 'ACTIVE',
            orderId: o.id,
            queueNumber: o.queueNumber,
            customerName: o.customerName,
            price: o.price,
            timestamp: o.timestamp, // dùng timestamp tạo đơn để sort
            orderData: o
        }));

        // Gộp và sắp xếp theo giờ TẠO ĐƠN (tăng dần) để số thứ tự luôn từ thấp → cao
        const allEntries = [...filteredLogs, ...activeOrderEntries].sort((a, b) => {
            const tA = new Date(a.orderData?.timestamp || a.timestamp || 0).getTime();
            const tB = new Date(b.orderData?.timestamp || b.timestamp || 0).getTime();
            return tB - tA; // Đơn mới nhất lên trên
        });

        const rows = allEntries.slice(0, masterLedgerLimit).map((log, idx) => {
            const isCancelled = log.type === 'CANCELLED';
            const isDebtMarked = log.type === 'DEBT_MARKED';
            const isDebtPaid = log.type === 'DEBT_PAID';
            const isActive = log.type === 'ACTIVE';
            const o = log.orderData || {};

            // Timing
            const timeStart = o.timestamp ? new Date(o.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '--:--';
            const timeEnd = log.timestamp ? new Date(log.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '--:--';

            // Calculate Stay Time
            const durationMs = (log.timestamp && o.timestamp) ? (new Date(log.timestamp).getTime() - new Date(o.timestamp).getTime()) : 0;
            const minutes = Math.max(0, Math.floor(durationMs / 60000));
            const hours = Math.floor(minutes / 60);
            const remainingMins = minutes % 60;
            const stayTimeStr = hours > 0 ? `${hours}h${remainingMins > 0 ? ` ${remainingMins}p` : ''}` : `${minutes}p`;

            // Source
            const source = o.orderSource || 'INSTORE';
            const sourceLabel = source === 'INSTORE' ? 'TẠI QUÁN' : source;

            // Financials
            let preTax = 0;
            let taxValue = 0;
            let gross = 0;
            let discount = 0;
            let fee = 0;
            let net = 0;
            let cogs = 0;
            let profit = 0;

            if (!isCancelled) {
                gross = o.price || o.basePrice || 0;
                preTax = o.preTaxTotal || gross;
                taxValue = o.taxAmount || 0;
                discount = o.discount || 0;
                fee = o.partnerFee || 0;
                net = preTax - discount - fee;

                if (o.cartItems && Array.isArray(o.cartItems)) {
                    o.cartItems.forEach(cartItem => {
                        const menuItem = menuMap.get(cartItem.item?.id) || cartItem.item;
                        if (!menuItem) return;

                        let sizeMultiplier = 1;
                        if (cartItem.size) {
                            const sLabel = typeof cartItem.size === 'string' ? cartItem.size : (cartItem.size.label || cartItem.size.name);
                            const mSize = menuItem.sizes?.find(s => s.label === sLabel);
                            if (mSize && mSize.multiplier) sizeMultiplier = parseFloat(mSize.multiplier);
                        }

                        if (menuItem.recipe) {
                            menuItem.recipe.forEach(r => {
                                const inv = inventoryStatsMap.get(r.ingredientId);
                                if (inv && inv.avgCost) cogs += inv.avgCost * r.quantity * sizeMultiplier * cartItem.count;
                            });
                        }

                        if (cartItem.size) {
                            const sLabel = typeof cartItem.size === 'string' ? cartItem.size : (cartItem.size.label || cartItem.size.name);
                            const mSize = menuItem.sizes?.find(s => s.label === sLabel);
                            if (mSize && mSize.recipe) {
                                mSize.recipe.forEach(r => {
                                    const inv = inventoryStatsMap.get(r.ingredientId);
                                    if (inv && inv.avgCost) cogs += inv.avgCost * r.quantity * cartItem.count;
                                });
                            }
                        }

                        if (cartItem.addons) {
                            cartItem.addons.forEach(aItem => {
                                const aLabel = typeof aItem === 'string' ? aItem : aItem.label;
                                const mAddon = menuItem.addons?.find(a => a.label === aLabel);
                                if (mAddon && mAddon.recipe) {
                                    mAddon.recipe.forEach(r => {
                                        const inv = inventoryStatsMap.get(r.ingredientId);
                                        if (inv && inv.avgCost) cogs += inv.avgCost * r.quantity * cartItem.count;
                                    });
                                }
                            });
                        }
                    });
                }
                profit = net - cogs;
            }

            let billDetail = log.itemName || '';
            if (o.cartItems && Array.isArray(o.cartItems)) {
                billDetail = o.cartItems.map(c => {
                    const sizeLabel = c.size ? (typeof c.size === 'string' ? c.size : (c.size.label || c.size.name)) : '';
                    const sizeStr = sizeLabel ? ` (${sizeLabel})` : '';
                    return `${c.item?.name || 'Món'}${sizeStr} x${c.count}`;
                }).join(', ');
            }

            const orderIdDisplay = getLogOrderId(log);
            const orderIdShort = orderIdDisplay.length > 4 ? orderIdDisplay.slice(0, 4) + '...' : orderIdDisplay;

            return (
                <tr key={idx}
                    onClick={() => setSelectedLog(log)}
                    className={`cursor-pointer transition-colors border-l-4 border-l-transparent hover:border-l-[#007AFF] ${isCancelled ? 'bg-red-50/50 hover:bg-red-50' : isActive ? 'bg-amber-50/30 hover:bg-amber-50' : 'hover:bg-brand-50/30'}`}
                >
                    <td className="px-5 py-3 font-medium text-brand-500 tracking-widest">{orderIdShort}</td>
                    <td className="px-5 py-3 text-gray-500 font-medium whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                            <div className="text-[11px] font-medium text-gray-800 flex items-center gap-1.5" title="Giờ lập bill">
                                <span className="text-[9px] text-gray-400 uppercase tracking-widest w-6">IN:</span>
                                <span>{timeStart}</span>
                            </div>
                            <div className="text-[11px] font-medium text-gray-600 flex items-center gap-1.5" title="Giờ hoàn tất">
                                <span className="text-[9px] text-gray-400 uppercase tracking-widest w-6">OUT:</span>
                                <span className="text-brand-600">{timeEnd}</span>
                                {(!settings?.requirePrepayment && !isCancelled && source === 'INSTORE') && (
                                    <>
                                        <span className="text-gray-300">-</span>
                                        <span className="text-brand-600">{stayTimeStr}</span>
                                    </>
                                )}
                            </div>
                        </div>
                    </td>
                    <td className="px-5 py-3 text-gray-700 max-w-[300px] truncate" title={billDetail}>{billDetail}</td>
                    <td className={`px-5 py-3 font-medium ${source === 'GRAB' ? 'text-[#00B14F]' : source === 'SHOPEE' ? 'text-[#EE4D2D]' : 'text-gray-600'}`}>{sourceLabel}</td>

                    <td className={`px-5 py-3 text-right font-bold ${isCancelled ? 'text-gray-400' : 'text-gray-800'}`}>{isCancelled ? '-' : formatVND(gross)}</td>
                    <td className={`px-5 py-3 text-right font-medium ${isCancelled ? 'text-gray-400' : 'text-teal-600'}`}>{isCancelled ? '-' : formatVND(taxValue)}</td>
                    <td className={`px-5 py-3 text-right font-medium ${isCancelled ? 'text-gray-400' : 'text-amber-500'}`}>
                        {isCancelled ? '-' : (discount > 0 || fee > 0) ? `-${formatVND(discount + fee)}` : '0 ₫'}
                        {(!isCancelled && (discount > 0 || fee > 0)) && (
                            <div className="text-[9px] text-gray-400 font-normal mt-0.5 whitespace-nowrap">
                                {discount > 0 ? `KM: ${formatVND(discount)}` : ''}
                                {discount > 0 && fee > 0 ? ' | ' : ''}
                                {fee > 0 ? `Sàn: ${formatVND(fee)}` : ''}
                            </div>
                        )}
                    </td>
                    <td className={`px-5 py-3 text-right font-medium ${isCancelled ? 'text-gray-400' : 'text-brand-600'}`}>{isCancelled ? '-' : formatVND(net)}</td>
                    <td className={`px-5 py-3 text-right font-medium ${isCancelled ? 'text-gray-400' : 'text-amber-700'}`}>{isCancelled ? '-' : formatVND(cogs)}</td>
                    <td className={`px-5 py-3 text-right font-bold ${isCancelled ? 'text-gray-400' : profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {isCancelled ? '-' : formatVND(profit)}
                    </td>

                    <td className="px-5 py-3 text-[10px] font-medium">
                        {isCancelled ? (
                            <span className="text-red-500 uppercase">Hủy: {log.reason || 'N/A'}</span>
                        ) : isDebtMarked ? (
                            <span className="text-purple-600 flex items-center gap-1 uppercase"><BookOpen size={10} /> Ghi nợ</span>
                        ) : isDebtPaid ? (
                            <span className="text-blue-600 flex items-center gap-1 uppercase"><CheckCircle size={10} /> Thu nợ</span>
                        ) : isActive ? (
                            o.status === 'AWAITING_PAYMENT' ? (
                                <span className="text-orange-500 flex items-center gap-1 uppercase"><Clock size={10} /> Chờ thanh toán</span>
                            ) : o.isPaid ? (
                                <span className="text-blue-500 flex items-center gap-1 uppercase"><CheckCircle size={10} /> Đã thu tiền</span>
                            ) : (
                                <span className="text-amber-500 flex items-center gap-1 uppercase"><Clock size={10} /> Đang làm</span>
                            )
                        ) : (
                            <span className="text-green-600 flex items-center gap-1 uppercase"><CheckCircle size={10} /> Hoàn thành</span>
                        )}
                    </td>
                </tr>
            );
        });

        if (allEntries.length === 0) {
            rows.push(
                <tr key="empty">
                    <td colSpan="10" className="p-12 text-center grayscale opacity-20">
                        <div className="flex justify-center mb-2"><Info size={32} /></div>
                        <p className="font-bold uppercase text-xs">Chưa có hóa đơn nào</p>
                    </td>
                </tr>
            );
        } else if (allEntries.length > masterLedgerLimit) {
            rows.push(
                <tr key="limitAlert">
                    <td colSpan="10" className="p-4 text-center text-[11px] font-bold text-gray-400 bg-gray-50 mt-2 border-t">
                        * Đang hiển thị {masterLedgerLimit} hóa đơn. Tự động tải thêm khi cuộn xuống hoặc bấm <button className="font-black text-brand-600 underline mx-1 hover:text-brand-800" onClick={() => setMasterLedgerLimit(prev => prev + 100)}>TẢI THÊM</button>
                    </td>
                </tr>
            );
        }

        return rows;
    }, [filteredLogs, orders, menuMap, inventoryStatsMap, settings, masterLedgerLimit, reportPeriod]);

    const memoizedDisplayAudits = React.useMemo(() => {
        return auditReportTab === 'history'
            ? flattenedAuditsList.filter(a => a.type === 'PRODUCTION' || a.type === 'ORDER' || a.type === 'ORDER_REFUND')
            : flattenedAuditsList.filter(a => a.type !== 'PRODUCTION' && a.type !== 'ORDER' && a.type !== 'ORDER_REFUND');
    }, [auditReportTab, flattenedAuditsList]);

    const memoizedAuditRows = React.useMemo(() => {
        const rows = memoizedDisplayAudits.slice().reverse().slice(0, auditLimit).map(audit => (
            <tr key={audit.rowId} className="hover:bg-amber-50/40 transition-colors">
                <td className="px-6 py-4 text-[12px] text-gray-600 tracking-tight">
                    {new Date(audit.timestamp).toLocaleDateString('vi-VN')} <br />
                    <span className="text-[11px] text-gray-400">{new Date(audit.timestamp).toLocaleTimeString('vi-VN')}</span>
                </td>

                <td className="px-6 py-4 text-[12px] text-gray-800">
                    <div className="flex items-center gap-2 group">
                        {audit.isUnrolledOutput
                            ? <span className="text-brand-700">🛒 {audit.displayIngredientName}</span>
                            : audit.isUnrolledInput
                                ? <span className="text-red-700">🔥 {audit.displayIngredientName}</span>
                                : audit.displayIngredientName}

                        {auditFilterIngredient === 'all' && (
                            <button
                                onClick={() => setAuditFilterIngredient(audit.displayIngredientId)}
                                className="text-amber-500 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 p-1 rounded-none transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                                title={`Xem biểu đồ hao hụt của ${audit.displayIngredientName}`}
                            >
                                <LineChart size={14} strokeWidth={2.5} />
                            </button>
                        )}
                    </div>
                </td>

                <td className={`px-6 py-4 text-[12px] ${audit.displayDifference < 0 ? 'text-red-600' : audit.displayDifference > 0 ? 'text-brand-600' : 'text-gray-400'}`}>
                    {audit.displayDifference > 0 ? '+' : ''}{audit.displayDifference !== 0 ? audit.displayDifference.toFixed(2) : '-'} <span className="text-[10px] text-gray-400 ml-1 uppercase">{audit.displayUnit}</span>
                </td>

                <td className={`px-6 pr-10 py-4 text-[12px] font-normal tracking-tight ${audit.displayCost < 0 ? 'text-red-600' : audit.displayCost > 0 ? 'text-brand-600' : 'text-gray-400'}`}>
                    {audit.isUnrolledOutput ? (
                        <>
                            {audit.displayCost > 0 ? '+' : ''}{formatVND(audit.displayCost || 0)}
                        </>
                    ) : (
                        <>
                            {audit.displayCost !== 0 ? `${audit.displayCost > 0 ? '+' : '-'}${formatVND(Math.abs(audit.displayCost))}` : '-'}
                        </>
                    )}
                </td>

                <td className="px-6 pl-10 py-4 text-[12px] text-gray-600 border-l border-gray-100/50 font-normal">
                    {audit.isOrderLink ? (
                        <button
                            className="cursor-pointer text-brand-600 hover:text-brand-800 transition-colors hover:underline flex items-center gap-1.5 font-normal text-[12px] not-italic text-left"
                            onClick={async () => {
                                let foundLog = report?.logs?.find(o => o.orderId === audit.linkedOrderId);

                                if (!foundLog) {
                                    let rawOrder = orders.find(o => o.id === audit.linkedOrderId);
                                    if (!rawOrder) {
                                        try {
                                            const res = await fetch(`${SERVER_URL}/api/orders/${audit.linkedOrderId}`);
                                            if (res.ok) {
                                                rawOrder = await res.json();
                                            }
                                        } catch (e) {
                                            console.error("Lỗi fetch đơn hàng cũ", e);
                                        }
                                    }

                                    if (rawOrder) {
                                        foundLog = {
                                            type: rawOrder.status === 'CANCELLED' ? 'CANCELLED' : 'COMPLETED',
                                            orderId: rawOrder.id,
                                            queueNumber: rawOrder.queueNumber,
                                            itemName: rawOrder.itemName,
                                            customerName: rawOrder.customerName,
                                            price: rawOrder.price,
                                            timestamp: rawOrder.timestamp,
                                            orderData: rawOrder
                                        };
                                    }
                                }

                                if (foundLog) {
                                    setSelectedLog(foundLog);
                                } else {
                                    showToast('Không tìm thấy dữ liệu nguyên bản của hóa đơn này. Có thể đã cũ.', 'error');
                                }
                            }}
                        >
                            <ShoppingCart size={13} /> {audit.displayReason}
                        </button>
                    ) : (
                        audit.displayReason
                    )}
                </td>
            </tr>
        ));

        if (memoizedDisplayAudits.length > auditLimit) {
            rows.push(
                <tr key="limitAlert">
                    <td colSpan="5" className="p-4 text-center text-[10px] uppercase font-bold text-gray-400 bg-gray-50/50">
                        * Đang hiển thị {auditLimit} kết quả. Tự động tải thêm khi cuộn hoặc bấm <button className="font-black text-brand-600 underline mx-1 hover:text-brand-800" onClick={() => setAuditLimit(prev => prev + 100)}>TẢI THÊM</button>
                    </td>
                </tr>
            );
        }
        return rows;
    }, [memoizedDisplayAudits, auditFilterIngredient, auditReportTab, report, orders, inventoryStats, inventory, menu, auditLimit]);

    const allCompletedLogs = React.useMemo(() => {
        if (!report || !Array.isArray(report.logs)) return [];
        return report.logs.filter(l => l.type === 'COMPLETED');
    }, [report]);

    const groupedTaxData = React.useMemo(() => {
        const data = {};
        allCompletedLogs.forEach(log => {
            const date = new Date(log.timestamp);
            let periodKey = '';
            let displayLabel = '';

            const y = date.getFullYear();
            const m = date.getMonth() + 1;

            if (taxReportPeriod === 'MONTH') {
                periodKey = `${y}-${String(m).padStart(2, '0')}`;
                displayLabel = `Tháng ${String(m).padStart(2, '0')}/${y}`;
            } else if (taxReportPeriod === 'QUARTER') {
                const q = Math.ceil(m / 3);
                periodKey = `${y}-Q${q}`;
                displayLabel = `Quý ${q}/${y}`;
            } else {
                periodKey = `${y}`;
                displayLabel = `Năm ${y}`;
            }

            if (!data[periodKey]) {
                data[periodKey] = { label: displayLabel, grossRevenue: 0, taxAmount: 0, netRevenue: 0, orderCount: 0 };
            }

            const o = log.orderData || {};
            const gross = o.price || o.basePrice || parseFloat(log.price) || 0;
            const taxValue = o.taxAmount || 0;
            const preTax = o.preTaxTotal || (gross - taxValue);

            data[periodKey].grossRevenue += gross;
            data[periodKey].taxAmount += taxValue;
            data[periodKey].netRevenue += preTax;
            data[periodKey].orderCount += 1;
        });
        return data;
    }, [allCompletedLogs, taxReportPeriod]);

    const exportTaxToCSV = () => {
        const headers = [
            'Ky Ke Toan (Thang/Quy/Nam)',
            'Ngay Gio Giao Dich',
            'Ma Hoa Don',
            'Nen Tang',
            'Chi Tiet Mon (Item Name)',
            'Doanh Thu Thuan (Chua Thue)',
            'Tien Thue GTGT',
            'Tong Thanh Toan (Co Thue)'
        ];

        const rows = [];
        let totalPreTax = 0;
        let totalTax = 0;
        let totalGross = 0;

        allCompletedLogs.forEach(log => {
            const date = new Date(log.timestamp);
            let periodKey = '';
            const y = date.getFullYear();
            const m = date.getMonth() + 1;

            if (taxReportPeriod === 'MONTH') {
                periodKey = `Tháng ${String(m).padStart(2, '0')}/${y}`;
            } else if (taxReportPeriod === 'QUARTER') {
                const q = Math.ceil(m / 3);
                periodKey = `Quý ${q}/${y}`;
            } else {
                periodKey = `Năm ${y}`;
            }

            // In our system, completed logs store itemName (string) and price. orderData might not be fully persisted to save space.
            const o = log.orderData || {};
            const gross = o.price || o.basePrice || parseFloat(log.price) || 0;
            const taxValue = o.taxAmount || 0;
            const preTax = o.preTaxTotal || (gross - taxValue);

            const rawItemName = (log.itemName || o.itemName || 'Unknown').replace(/,/g, ' -').replace(/\n/g, ' ');

            rows.push([
                `"${periodKey}"`,
                `"${date.toLocaleString('vi-VN')}"`,
                `"HD-${log.orderId || log.id || 'N/A'}"`,
                `"${o.platform || log.source || 'INSTORE'}"`,
                `"${rawItemName}"`,
                Math.round(preTax) * 1000 || 0,
                Math.round(taxValue) * 1000 || 0,
                Math.round(gross) * 1000 || 0
            ]);

            totalPreTax += preTax;
            totalTax += taxValue;
            totalGross += gross;
        });

        rows.push([
            '""', '""', '""', '""', '"TỔNG CỘNG"',
            Math.round(totalPreTax) * 1000,
            Math.round(totalTax) * 1000,
            Math.round(totalGross) * 1000
        ]);

        const content = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob(["\uFEFF" + content], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `Bang_Ke_Hoa_Don_Thue_${taxReportPeriod}_${getVNDateStr().replace(/-/g, '-')}.csv`);
        link.click();
    };

    const memoizedMonthlyTaxReport = React.useMemo(() => {
        const sortedKeys = Object.keys(groupedTaxData).sort().reverse();

        if (sortedKeys.length === 0) {
            return (
                <tbody className="divide-y divide-gray-50 uppercase text-xs">
                    <tr><td colSpan="5" className="p-6 text-center text-gray-400 italic text-[11px] normal-case">Chưa có dữ liệu thuế.</td></tr>
                </tbody>
            );
        }

        let totalGross = 0; let totalTax = 0; let totalNet = 0;

        const rows = sortedKeys.map(key => {
            const data = groupedTaxData[key];
            totalGross += data.grossRevenue; totalTax += data.taxAmount; totalNet += data.netRevenue;
            return (
                <tr key={key} className="hover:bg-gray-100 transition-colors">
                    <td className="p-3 font-bold text-gray-900">{data.label}</td>
                    <td className="p-3 text-right font-medium text-gray-600">{data.orderCount}</td>
                    <td className="p-3 text-right font-medium text-gray-600">{formatVND(data.grossRevenue)}</td>
                    <td className="p-3 text-right font-bold text-brand-600">{formatVND(data.netRevenue)}</td>
                    <td className="p-3 text-right font-bold text-red-600">{formatVND(data.taxAmount)}</td>
                </tr>
            );
        });

        return (
            <>
                <tbody className="divide-y divide-gray-50 uppercase text-xs">
                    {rows}
                </tbody>
                <tfoot className="bg-red-50/50 font-black text-xs uppercase border-t border-red-200">
                    <tr>
                        <td colSpan="2" className="p-4 text-left text-red-800">TỔNG CỘNG:</td>
                        <td className="p-4 text-right text-gray-600">{formatVND(totalGross)}</td>
                        <td className="p-4 text-right text-brand-600">{formatVND(totalNet)}</td>
                        <td className="p-4 text-right text-red-600">{formatVND(totalTax)}</td>
                    </tr>
                </tfoot>
            </>
        );
    }, [groupedTaxData]);

    const exportToCSV = () => {
        const headers = [
            'STT (Mã đơn)', 'Giờ nhận', 'Giờ hoàn thành', 'Chi Tiết Món (Bill)', 'Nền Tảng',
            'Tổng Tiền Khách Trả', 'Trích Thuế', 'Khuyến Mãi/Phí Sàn', 'Doanh Thu Thuần (Thực Nhận)', 'Chi Phí (COGS)', 'Lợi Nhuận Gộp', 'Ghi Chú'
        ];

        const rows = filteredLogs.slice().reverse().map(l => {
            const isCancelled = l.type === 'CANCELLED';
            const o = l.orderData || {};

            const stt = getLogOrderId(l);
            const timeStart = o.timestamp ? new Date(o.timestamp).toLocaleString('vi-VN') : '';
            const timeEnd = l.timestamp ? new Date(l.timestamp).toLocaleString('vi-VN') : '';

            let billDetail = l.itemName || '';
            if (o.cartItems && Array.isArray(o.cartItems)) {
                billDetail = o.cartItems.map(c => {
                    const sizeLabel = c.size ? (typeof c.size === 'string' ? c.size : (c.size.label || c.size.name)) : '';
                    const sizeStr = sizeLabel ? ` (${sizeLabel})` : '';
                    return `${c.item?.name || 'Món'}${sizeStr} x${c.count}`;
                }).join(', ');
            }

            const source = o.orderSource === 'INSTORE' || !o.orderSource ? 'Quán' : o.orderSource;

            let preTax = 0;
            let taxValue = 0;
            let gross = 0;
            let discount = 0;
            let fee = 0;
            let net = 0;
            let cogs = 0;
            let profit = 0;

            if (!isCancelled) {
                gross = o.price || o.basePrice || parseFloat(l.price) || 0;
                preTax = o.preTaxTotal || gross;
                taxValue = o.taxAmount || 0;
                discount = o.discount || 0;
                fee = o.partnerFee || 0;
                net = preTax - discount - fee; // Thực nhận dựa trên doanh thu chưa tính phần thuế phải đóng

                if (o.cartItems && Array.isArray(o.cartItems)) {
                    o.cartItems.forEach(cartItem => {
                        const menuItem = menuMap.get(cartItem.item?.id) || cartItem.item;
                        if (!menuItem) return;

                        let sizeMultiplier = 1;
                        if (cartItem.size) {
                            const sLabel = typeof cartItem.size === 'string' ? cartItem.size : (cartItem.size.label || cartItem.size.name);
                            const mSize = menuItem.sizes?.find(s => s.label === sLabel);
                            if (mSize && mSize.multiplier) sizeMultiplier = parseFloat(mSize.multiplier);
                        }

                        if (menuItem.recipe) {
                            menuItem.recipe.forEach(r => {
                                const inv = inventoryStatsMap.get(r.ingredientId);
                                if (inv && inv.avgCost) cogs += inv.avgCost * r.quantity * sizeMultiplier * cartItem.count;
                            });
                        }

                        if (cartItem.size) {
                            const sLabel = typeof cartItem.size === 'string' ? cartItem.size : (cartItem.size.label || cartItem.size.name);
                            const mSize = menuItem.sizes?.find(s => s.label === sLabel);
                            if (mSize && mSize.recipe) {
                                mSize.recipe.forEach(r => {
                                    const inv = inventoryStatsMap.get(r.ingredientId);
                                    if (inv && inv.avgCost) cogs += inv.avgCost * r.quantity * cartItem.count;
                                });
                            }
                        }

                        if (cartItem.addons) {
                            cartItem.addons.forEach(aItem => {
                                const aLabel = typeof aItem === 'string' ? aItem : aItem.label;
                                const mAddon = menuItem.addons?.find(a => a.label === aLabel);
                                if (mAddon && mAddon.recipe) {
                                    mAddon.recipe.forEach(r => {
                                        const inv = inventoryStatsMap.get(r.ingredientId);
                                        if (inv && inv.avgCost) cogs += inv.avgCost * r.quantity * cartItem.count;
                                    });
                                }
                            });
                        }
                    });
                }
                profit = net - cogs;
            }

            const note = isCancelled ? `Hủy: ${l.reason || ''}` : '';

            const sanitize = (text) => `"${String(text).replace(/"/g, '""')}"`;

            return [
                sanitize(stt),
                sanitize(timeStart),
                sanitize(timeEnd),
                sanitize(billDetail),
                sanitize(source),
                isCancelled ? 0 : (gross * 1000),
                isCancelled ? 0 : (taxValue * 1000),
                isCancelled ? 0 : ((discount + fee) * 1000),
                isCancelled ? 0 : (net * 1000),
                isCancelled ? 0 : (cogs * 1000),
                isCancelled ? 0 : (profit * 1000),
                sanitize(note)
            ];
        });

        const content = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob(["\uFEFF" + content], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        const filenameStr = reportPeriod === 'custom' ? `tu_${customStartDate}_den_${customEndDate}` : reportPeriod;
        link.setAttribute('download', `Master_Ledger_${filenameStr}_${getVNDateStr().replace(/-/g, '-')}.csv`);
        link.click();
    };
    const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
    const [selectedLog, setSelectedLog] = useState(null); // For detailed report view
    const [showOrderPanel, setShowOrderPanel] = useState(false);
    const [selectedTableId, setSelectedTableId] = useState(null);
    const [actionTable, setActionTable] = useState(null);
    const [changeTableOrder, setChangeTableOrder] = useState(null);
    const [editInventory, setEditInventory] = useState(null);
    const [viewingIngredientStats, setViewingIngredientStats] = useState(null);
    const [editStaff, setEditStaff] = useState(null);
    const [showStaffReport, setShowStaffReport] = useState(null);
    const [editTable, setEditTable] = useState(null);
    const [toasts, setToasts] = useState([]);
    const [editingOrderId, setEditingOrderId] = useState(null); // Keep this for inline UI if needed
    const [editOrder, setEditOrder] = useState(null); // Full order object for StaffOrderPanel
    const [cancelOrderId, setCancelOrderId] = useState(null); // For cancel modal
    const [cancelReason, setCancelReason] = useState(''); // Cancel reason text
    const [fixedCosts, setFixedCosts] = useState({ rent: 0, machines: 0, electricity: 0, water: 0, salaries: 0, other: 0, useDynamicSalaries: false });
    const inlineDraftRef = useRef(null);

    // Printer Settings
    const [printers, setPrinters] = useState([]);
    const [selectedPrinter, setSelectedPrinter] = useState(() => localStorage.getItem('selectedPrinter') || '');
    const [printReceiptEnabled, setPrintReceiptEnabled] = useState(() => localStorage.getItem('printReceiptEnabled') === 'true');

    useEffect(() => {
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            ipcRenderer.invoke('get-printers').then(res => {
                if (res.success) setPrinters(res.printers);
            }).catch(console.error);
        }
    }, [activeTab]);

    const savePrinterSettings = (printer, enabled) => {
        setSelectedPrinter(printer);
        setPrintReceiptEnabled(enabled);
        localStorage.setItem('selectedPrinter', printer);
        localStorage.setItem('printReceiptEnabled', enabled.toString());
    };

    // Settings accordion state
    const [expandedSetting, setExpandedSetting] = useState('payment');

    useEffect(() => {
        let timer;
        const checkStatus = async () => {
            try {
                const res = await fetch(`${SERVER_URL}/api/tunnel-status`);
                if (res.ok) {
                    const data = await res.json();
                    setCfStatus(data);
                }
            } catch (e) {
                // Fail silently
            }
        };
        checkStatus();
        timer = setInterval(checkStatus, 3000); // Poll every 3 seconds
        return () => clearInterval(timer);
    }, []);

    // ── Numpad 00 Global Shortcut for Quick Payment Confirmation ──
    const lastZeroPress = useRef(0);
    useEffect(() => {
        const handleGlobalKeyDown = (e) => {
            // Prevent normal shortcuts if zero confirmation modal is open
            if (confirmZeroOrder) {
                if ((e.key === 'Escape' || (e.key === 'Backspace' && !isInputFocused()))) {
                    setConfirmZeroOrder(null);
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    confirmPayment(confirmZeroOrder.id);
                    setConfirmZeroOrder(null);
                }
                return; // Stop processing other keys
            }

            // Only active in "orders" tab and when no modals/inputs are open
            if (activeTab !== 'orders') return;
            if (showOrderPanel || expandedItemId || cancelOrderId) return;

            // Allow event to drop if focus is inside an input/textarea
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;

            if (e.key === '0') {
                const now = Date.now();
                if (now - lastZeroPress.current < 500) {
                    // Double tap detected
                    lastZeroPress.current = 0; // reset

                    // Find the oldest unpaid order (the one that's flashing blue)
                    const minQueue = orders.length > 0 ? Math.min(...orders.map(o => o.queueNumber)) : null;
                    let targetOrder = null;

                    if (minQueue !== null) {
                        targetOrder = orders.find(o => o.queueNumber === minQueue && !o.isPaid);
                    }
                    if (!targetOrder) {
                        targetOrder = orders.find(o => !o.isPaid);
                    }

                    if (targetOrder) {
                        setConfirmZeroOrder(targetOrder);
                    } else {
                        showToast('Không có đơn hàng chờ thanh toán!', 'error');
                    }
                } else {
                    lastZeroPress.current = now;
                }
            }
        };

        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [activeTab, showOrderPanel, expandedItemId, cancelOrderId, orders, confirmZeroOrder]);


    const showToast = (message, type = 'success') => {
        const id = (_idCounter++).toString();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
    };

    const isDirty = expandedItemId !== null;

    // ── Polling: CHỈ cập nhật orders + report (dữ liệu cần thời gian thực) ──
    const fetchOrders = async () => {
        try {
            const endpoint = showCompletedOrdersRef.current ? `/api/orders?history=true&date=${historyDateRef.current}` : (showDebtOrdersRef.current ? '/api/orders?debt=true' : '/api/orders');
            const [oR, rR, sR] = await Promise.all([
                fetch(`${SERVER_URL}${endpoint}`),
                fetch(`${SERVER_URL}/api/report`),
                fetch(`${SERVER_URL}/api/pos/checkout/status`)
            ]);

            const nextOrders = await oR.json();
            setOrders(prev => JSON.stringify(prev) === JSON.stringify(nextOrders) ? prev : nextOrders);

            const rData = await rR.json();
            setReport(prev => JSON.stringify(prev) === JSON.stringify(rData) ? prev : rData);
            if (rData.fixedCosts) setFixedCosts(prev => JSON.stringify(prev) === JSON.stringify(rData.fixedCosts) ? prev : rData.fixedCosts);
            // Đồng bộ counter từ server để getOrderId() chính xác
            if (rData.nextQueueNumber) _idCounter = rData.nextQueueNumber;

            // Sync active QR state across displays
            const statusData = await sR.json();
            setActiveQrOrderId(prev => prev === statusData.activeOrderId ? prev : statusData.activeOrderId);
        } catch (err) { /* silent */ }
    };

    // ── On-demand: Tải menu + tables + inventory + staff (KHÔNG tự động lặp) ──
    const fetchStaticData = async () => {
        try {
            const [mR, tR, iR, sR, impR, statR, auditR, promoR, expR, schedR, discR] = await Promise.all([
                fetch(`${SERVER_URL}/api/menu?all=true`),
                fetch(`${SERVER_URL}/api/tables`),
                fetch(`${SERVER_URL}/api/inventory`),
                fetch(`${SERVER_URL}/api/staff`),
                fetch(`${SERVER_URL}/api/imports`),
                fetch(`${SERVER_URL}/api/inventory/stats`),
                fetch(`${SERVER_URL}/api/inventory/audits`),
                fetch(`${SERVER_URL}/api/promotions`),
                fetch(`${SERVER_URL}/api/expenses`),
                fetch(`${SERVER_URL}/api/schedules`),
                fetch(`${SERVER_URL}/api/disciplinary`)
            ]);
            setMenu(await mR.json());
            setTables(await tR.json());
            setInventory(await iR.json());
            setStaff(await sR.json());
            setImports(await impR.json());
            setInventoryStats(await statR.json());
            setInventoryAudits(await auditR.json());
            setPromotions(await promoR.json());
            setExpenses(await expR.json());
            setSchedules(await schedR.json());
            setDisciplinaryLogs(await discR.json());
        } catch (err) { console.error(err); }
    };

    const fetchInventoryRange = async (start, end) => {
        try {
            const res = await fetch(`${SERVER_URL}/api/inventory/stats/range?start=${start}&end=${end}`);
            setInventoryStats(await res.json());
        } catch (err) { console.error(err); }
    };

    // Alias for backward compatibility where fetchData was called elsewhere
    const fetchShiftsAndRatings = async () => {
        try {
            const [sRes, rRes, stRes, dRes] = await Promise.all([
                fetch(`${SERVER_URL}/api/shifts`),
                fetch(`${SERVER_URL}/api/ratings`),
                fetch(`${SERVER_URL}/api/staff`),
                fetch(`${SERVER_URL}/api/disciplinary`)
            ]);
            const nextShifts = await sRes.json();
            const nextRatings = await rRes.json();
            const nextStaff = await stRes.json();
            const nextDlogs = await dRes.json();

            setShifts(prev => JSON.stringify(prev) === JSON.stringify(nextShifts) ? prev : nextShifts);
            setRatings(prev => JSON.stringify(prev) === JSON.stringify(nextRatings) ? prev : nextRatings);
            setStaff(prev => JSON.stringify(prev) === JSON.stringify(nextStaff) ? prev : nextStaff);
            setDisciplinaryLogs(prev => JSON.stringify(prev) === JSON.stringify(nextDlogs) ? prev : nextDlogs);
        } catch (err) { }
    };
    const fetchSettings = async () => {
        try {
            const res = await fetch(`${SERVER_URL}/api/settings`);
            const data = await res.json();
            if (!data.menuCategories) {
                data.menuCategories = ['TRUYỀN THỐNG', 'PHA MÁY', 'Trà', 'Khác'];
            }
            setSettings(data);
        } catch (err) { }
    };
    const fetchLanIP = async () => {
        try {
            const r = await fetch(`${SERVER_URL}/api/lan-info`);
            const data = await r.json();
            setLanIP(data.ip);
            if (data.hostname) setLanHostname(data.hostname);
        } catch (e) { }
    };
    useEffect(() => {
        const fetchAttendanceToken = async () => {
            try {
                const res = await fetch(`${SERVER_URL}/api/attendance/token`);
                const data = await res.json();
                if (data.success) {
                    setAttendanceToken(prev => prev === data.token ? prev : data.token);
                }
            } catch (err) { }
        };
        fetchAttendanceToken();
        const t = setInterval(fetchAttendanceToken, 8000);
        return () => clearInterval(t);
    }, []);

    const fetchData = async () => { await fetchOrders(); await fetchStaticData(); await fetchShiftsAndRatings(); await fetchSettings(); await fetchLanIP(); };


    useEffect(() => {
        // Load everything once on mount
        fetchData();
        // Poll orders, shifts, and menu every 5 seconds for real-time sync
        const t = setInterval(async () => {
            fetchOrders();
            fetchShiftsAndRatings();
            // Lấy riêng menu định kỳ để cập nhật SL thực tế giống Kiosk
            try {
                const res = await fetch(`${SERVER_URL}/api/menu?all=true`);
                if (res.ok) {
                    const data = await res.json();
                    setMenu(prev => JSON.stringify(prev) === JSON.stringify(data) ? prev : data);
                }
            } catch (e) { /* ignore */ }
        }, 5000);
        return () => clearInterval(t);
    }, []);

    useEffect(() => {
        if (activeTab === 'inventory' && inventoryReportMode === 'calendar') {
            let start, end;
            if (calType === 'month') {
                start = `${selectedYear}-${selectedMonth.toString().padStart(2, '0')}-01`;
                const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
                end = `${selectedYear}-${selectedMonth.toString().padStart(2, '0')}-${lastDay}`;
            } else if (calType === 'quarter') {
                const qStartMonth = (selectedQuarter - 1) * 3 + 1;
                const qEndMonth = selectedQuarter * 3;
                start = `${selectedYear}-${qStartMonth.toString().padStart(2, '0')}-01`;
                const lastDay = new Date(selectedYear, qEndMonth, 0).getDate();
                end = `${selectedYear}-${qEndMonth.toString().padStart(2, '0')}-${lastDay}`;
            } else if (calType === 'year') {
                start = `${selectedYear}-01-01`;
                end = `${selectedYear}-12-31`;
            }
            if (start && end) fetchInventoryRange(start, end);
        } else if (activeTab === 'inventory' && inventoryReportMode === 'standard') {
            fetchStaticData();
        }
    }, [activeTab, inventoryReportMode, calType, selectedMonth, selectedQuarter, selectedYear]);

    const handleTabChange = (id) => {
        if (id === activeTab) return;
        if (isDirty) { setPendingTab(id); return; }
        setActiveTab(id);
        if (id === 'inventory') {
            fetchStaticData();
        }
    };

    const handleMarkDebt = async (id) => {
        try {
            const response = await fetch(`${SERVER_URL}/api/orders/debt/mark/${id}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
            });
            if (response.ok) {
                showToast('Đã ghi nợ đơn hàng', 'success');
                fetchOrders();
            } else {
                showToast('Lỗi khi ghi nợ', 'error');
            }
        } catch (err) {
            showToast('Lỗi kết nối khi ghi nợ', 'error');
        }
    };

    const handlePayDebt = (id) => {
        setPayDebtOrderId(id);
    };

    const confirmPayDebt = async (id, isKioskQr = false) => {
        if (isKioskQr) {
            if (settings.autoPushPaymentQr === false) {
                showToast('Vui lòng bật tính năng QR TT tự động ở góc trên!', 'error');
                return;
            }
            try {
                await fetch(`${SERVER_URL}/api/kiosk/show-qr/${id}`, { method: 'POST' });
                showToast('Đã yêu cầu Kiosk hiển thị QR', 'success');
                setPayDebtOrderId(null);
            } catch (err) {
                showToast('Lỗi kết nối', 'error');
            }
            return;
        }
        try {
            const response = await fetch(`${SERVER_URL}/api/orders/debt/pay/${id}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
            });
            const data = await response.json();
            if (response.ok && data.success) {
                showToast('Đã thanh toán nợ (Tiền Mặt)', 'success');
                setPayDebtOrderId(null);
                const r = await fetch(`${SERVER_URL}/api/orders?debt=true`);
                const updatedOrders = await r.json();
                if (updatedOrders.length === 0) {
                    showDebtOrdersRef.current = false;
                    setShowDebtOrders(false);
                    showCompletedOrdersRef.current = false;
                    setShowCompletedOrders(false);
                }
                fetchOrders();
                fetchStaticData(); // Cập nhật lại Báo cáo (Sổ kế toán)
            } else {
                showToast(data.message || 'Lỗi thanh toán nợ', 'error');
            }
        } catch (err) {
            showToast('Lỗi mạng', 'error');
        }
    };

    const completeOrder = async (id) => {
        await fetch(`${SERVER_URL}/api/orders/complete/${id}`, { method: 'POST' });
        setEditingOrderId(null);
        showToast('Đơn hàng đã hoàn tất!');
        fetchOrders();
        fetchStaticData(); // Refresh inventory immediately
    };
    const cancelOrder = async (id, reason) => {
        await fetch(`${SERVER_URL}/api/orders/cancel/${id}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reason || 'Khách đổi ý' })
        });
        showToast('Đã hủy đơn!');
        setCancelOrderId(null);
        setCancelReason('');
        fetchOrders();
    };
    const confirmPayment = async (id) => {
        await fetch(`${SERVER_URL}/api/orders/confirm-payment/${id}`, { method: 'POST' });
        showToast('Đã xác nhận thanh toán!');
        fetchOrders();
    };

    const updateFixedCosts = async (costs) => {
        try {
            const res = await fetch(`${SERVER_URL}/api/report/fixed-costs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(costs)
            });
            if (res.ok) {
                const data = await res.json();
                setFixedCosts(data.fixedCosts);
                showToast('Đã cập nhật chi phí cố định!');
            }
        } catch (err) {
            showToast('Lỗi khi cập nhật chi phí!', 'error');
        }
    };
    // Sửa đơn hàng — cập nhật cartItems qua API
    const updateOrder = async (orderId, updatedCartItems) => {
        try {
            const res = await fetch(`${SERVER_URL}/api/orders/${orderId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cartItems: updatedCartItems })
            });
            if (res.ok) {
                fetchOrders();
            } else {
                showToast('Lỗi khi sửa đơn!', 'error');
            }
        } catch (err) {
            showToast('Lỗi kết nối server!', 'error');
        }
    };
    // Helper: Map danh mục sang số prefix
    const getCategoryPrefix = (categoryName, customOrder = null) => {
        const orderToUse = customOrder || settings.menuCategories || settings.categoryOrder || [];
        if (orderToUse.length === 0) {
            const categoryPrefixMap = {
                'PHA MÁY': '1', 'TRUYỀN THỐNG': '2', 'CÀ PHÊ GÓI': '3',
                'TRÀ': '4', 'ĐÁ XAY': '5', 'BÁNH': '6', 'TRÁNG MIỆNG': '7',
                'KHÁC': '8', 'TOPPING': '9'
            };
            return categoryPrefixMap[categoryName] || '8';
        }
        const idx = orderToUse.indexOf(categoryName);
        if (idx !== -1) return (idx + 1).toString();
        return Math.max(9, orderToUse.length + 1).toString();
    };

    // Helper: Sinh shortcutCode auto
    const generateHotkey = (categoryName, currentItemsInDb, customOrder = null) => {
        const prefix = getCategoryPrefix(categoryName, customOrder);
        const existingCodes = currentItemsInDb
            .map(i => i.shortcutCode)
            .filter(code => code && typeof code === 'string' && code.startsWith(prefix));

        if (existingCodes.length === 0) return `${prefix}1`;
        const maxCode = Math.max(...existingCodes.map(code => parseInt(code, 10)));
        return (maxCode + 1).toString();
    };

    const saveMenuItem = async (item) => {
        try {
            // Auto re-assign shortcutCode if it doesn't match the category prefix
            const expectedPrefix = getCategoryPrefix(item.category);
            let finalItem = { ...item };

            if (!finalItem.shortcutCode || !finalItem.shortcutCode.startsWith(expectedPrefix)) {
                // If missing or prefix is wrong (e.g. user changed category), regenerate it mapping to the new one
                finalItem.shortcutCode = generateHotkey(item.category, menu);
            }

            const res = await fetch(`${SERVER_URL}/api/menu`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(finalItem)
            });
            if (res.ok) {
                showToast('Lưu thành công!');
                setExpandedItemId(null);
                // Stay on menu tab — just refresh menu data
                const freshMenu = await (await fetch(`${SERVER_URL}/api/menu?all=true`)).json();
                setMenu(freshMenu);
                // Do NOT switch tabs
            } else {
                showToast('Lỗi khi lưu!', 'error');
            }
        } catch (err) {
            showToast('Lỗi kết nối server!', 'error');
        }
    };
    // Use a ref outside the component scope if possible, or ensure it's stable
    const reorderTimerRef = useRef(null);

    const lastSwapRef = useRef(0);
    const hasDraggedRef = useRef(false);
    const handle2DReorder = (draggedItem, info, categoryItems, category) => {
        hasDraggedRef.current = true;
        const now = Date.now();
        if (now - lastSwapRef.current < 300) return; // Theo yêu cầu: 0.3s

        const x = info.point.x;
        const y = info.point.y;

        // Thay vì dùng elementFromPoint làm đứt sự kiện drag, ta quyét toàn bộ phần tử reorder
        // và kiểm tra xem tọa độ chuột (x,y) đang nằm gọn trong box của phần tử nào.
        const nodes = Array.from(document.querySelectorAll('[data-reorder-id]'));
        let targetId = null;
        let targetNode = null;

        for (const node of nodes) {
            const rect = node.getBoundingClientRect();
            // Optional: Chừa một chút margin ở giữa để không đè nhảy quá nhạy
            const marginX = rect.width * 0.2;
            const marginY = rect.height * 0.2;

            if (x >= rect.left + marginX && x <= rect.right - marginX &&
                y >= rect.top + marginY && y <= rect.bottom - marginY) {
                targetId = node.getAttribute('data-reorder-id');
                targetNode = node;
                break;
            }
        }

        if (!targetId || targetId === draggedItem.id) return;

        if (targetId && targetId !== draggedItem.id) {
            setMenu(prevMenu => {
                const oldIdx = prevMenu.findIndex(i => i.id === draggedItem.id);
                const newIdx = prevMenu.findIndex(i => i.id === targetId);

                if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return prevMenu;
                if (prevMenu[oldIdx].category !== prevMenu[newIdx].category) return prevMenu;

                lastSwapRef.current = now;
                const newMenu = [...prevMenu];
                const [movedItem] = newMenu.splice(oldIdx, 1);
                newMenu.splice(newIdx, 0, movedItem);
                return newMenu;
            });
        }
    };

    const handleReorderMenu = (newItemsForCategory, category) => {
        if (reorderTimerRef.current) {
            clearTimeout(reorderTimerRef.current);
        }

        reorderTimerRef.current = setTimeout(async () => {
            try {
                const prefix = getCategoryPrefix(category);

                // Cập nhật lại list và gán phím tắt tự động theo thứ tự mới (Bỏ qua Thùng rác)
                setMenu(currentMenu => {
                    let catIdxTracker = 1;
                    const prefix = getCategoryPrefix(category);

                    const fullNewMenu = currentMenu.map(item => {
                        if (item.category === category && !item.isDeleted) {
                            return { ...item, shortcutCode: `${prefix}${catIdxTracker++}` };
                        }
                        return item;
                    });

                    // Send to server in background
                    fetch(`${SERVER_URL}/api/menu/reorder`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(fullNewMenu)
                    }).catch(console.error);

                    return fullNewMenu;
                });
                console.log("[BACKEND-SAVE] Menu reorder and shortcuts saved (ignoring Trash).");
            } catch (err) {
                console.error("Lỗi khi lưu thứ tự:", err);
            }
        }, 800);
    };

    const handleMoveVertical = (item, direction, category) => {
        setMenu(prevMenu => {
            const currentIdx = prevMenu.findIndex(i => i.id === item.id);
            if (currentIdx === -1) return prevMenu;

            const siblings = prevMenu.filter(i => i.category === category);
            const siblingIndex = siblings.findIndex(i => i.id === item.id);
            if (siblingIndex === -1) return prevMenu;

            const targetSiblingIndex = siblingIndex + direction;
            if (targetSiblingIndex < 0 || targetSiblingIndex >= siblings.length) return prevMenu;

            const targetSibling = siblings[targetSiblingIndex];
            const targetGlobalIdx = prevMenu.findIndex(i => i.id === targetSibling.id);

            const newMenu = [...prevMenu];
            // Swap
            const temp = newMenu[currentIdx];
            newMenu[currentIdx] = newMenu[targetGlobalIdx];
            newMenu[targetGlobalIdx] = temp;

            return newMenu;
        });

        // Trigger sync to db + recalculate shortcuts
        handleReorderMenu([], category);
    };

    const moveCategory = async (catIndex, direction) => {
        const sortedCats = getSortedCategories(menu, settings);
        if (catIndex < 0 || catIndex >= sortedCats.length) return;
        const targetIndex = catIndex + direction;
        if (targetIndex < 0 || targetIndex >= sortedCats.length) return;

        const newOrder = [...sortedCats];
        const temp = newOrder[catIndex];
        newOrder[catIndex] = newOrder[targetIndex];
        newOrder[targetIndex] = temp;

        const newSettings = { ...settings, menuCategories: newOrder, categoryOrder: newOrder };
        setSettings(newSettings);

        try {
            await fetch(`${SERVER_URL}/api/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newSettings)
            });

            setMenu(currentMenu => {
                const trackers = {};
                const fullNewMenu = currentMenu.map(item => {
                    if (item.isDeleted) return item;
                    const idx = newOrder.indexOf(item.category);
                    const prefix = idx !== -1 ? String(idx + 1) : '9';
                    if (!trackers[item.category]) trackers[item.category] = 1;
                    return { ...item, shortcutCode: `${prefix}${trackers[item.category]++}` };
                });

                fetch(`${SERVER_URL}/api/menu/reorder`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(fullNewMenu)
                }).catch(console.error);

                return fullNewMenu;
            });
            showToast('Đã lưu thứ tự danh mục và cập nhật phím tắt');
        } catch (err) {
            console.error(err);
            showToast('Lỗi lưu thứ tự', 'error');
        }
    };

    const handleRenameIngredient = async (ingredientId, newName) => {
        if (!newName.trim()) {
            setEditingIngId(null);
            return;
        }
        try {
            const res = await fetch(`${SERVER_URL}/api/inventory/${ingredientId}/name`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName.trim() })
            });
            if (res.ok) {
                // Update local states
                setInventory(prev => prev.map(inv => inv.id === ingredientId ? { ...inv, name: newName.trim() } : inv));
                setEditingIngId(null);
                fetchData(); // Refresh all data to sync history view
            }
        } catch (e) {
            console.error("Lỗi rename ingredient:", e);
            setEditingIngId(null);
        }
    };

    const handleDeleteImport = async (importId) => {
        if (!window.confirm("Đưa phiếu nhập kho này vào Thùng rác? (Số lượng tồn kho sẽ bị trừ đi tương ứng)")) return;
        try {
            const res = await fetch(`${SERVER_URL}/api/imports/${importId}`, { method: 'DELETE' });
            if (res.ok) {
                showToast("Đã đưa vào thùng rác!");
                fetchData();
            } else {
                showToast("Lỗi khi xóa phiếu nhập!", "error");
            }
        } catch (e) {
            console.error(e);
            showToast("Lỗi kết nối server!", "error");
        }
    };

    const handleReorderInventory = async (newInv) => {
        setInventory(newInv);
        try {
            await fetch(`${SERVER_URL}/api/inventory/reorder`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ inventory: newInv })
            });
        } catch (e) {
            console.error("Lỗi reorder inventory:", e);
        }
    };

    const moveIngredientUp = (index) => {
        if (index === 0) return;
        const newInv = [...inventory];
        [newInv[index - 1], newInv[index]] = [newInv[index], newInv[index - 1]];
        handleReorderInventory(newInv);
    };

    const moveIngredientDown = (index) => {
        if (index === inventory.length - 1) return;
        const newInv = [...inventory];
        [newInv[index + 1], newInv[index]] = [newInv[index], newInv[index + 1]];
        handleReorderInventory(newInv);
    };
    const deleteMenuItem = async (id) => {
        setDeleteMenuModal(id);
    };

    const confirmDeleteMenuItem = async () => {
        if (!deleteMenuModal) return;
        const id = deleteMenuModal;
        setDeleteMenuModal(null);
        try {
            const res = await fetch(`${SERVER_URL}/api/menu/${id}`, { method: 'DELETE' });
            if (res.ok) {
                if (expandedItemId === id) setExpandedItemId(null);
                showToast(showMenuTrash ? 'Đã xóa vĩnh viễn!' : 'Đã chuyển vào Thùng rác!');

                setMenu(prev => showMenuTrash
                    ? prev.filter(m => m.id !== id)
                    : prev.map(m => m.id === id ? { ...m, isDeleted: true } : m)
                );
            } else {
                showToast('Lỗi khi xóa!', 'error');
            }
        } catch (err) {
            showToast('Lỗi kết nối server!', 'error');
        }
    };

    const restoreMenuItem = async (id) => {
        try {
            const res = await fetch(`${SERVER_URL}/api/menu/${id}/restore`, { method: 'POST' });
            if (res.ok) {
                showToast('Đã khôi phục món!');
                setMenu(prev => prev.map(m => m.id === id ? { ...m, isDeleted: false } : m));
            } else {
                showToast('Lỗi khi khôi phục!', 'error');
            }
        } catch (err) {
            showToast('Lỗi kết nối server!', 'error');
        }
    };
    const duplicateMenuItem = async (item) => {
        try {
            const newItem = {
                ...item,
                id: Date.now().toString(),
                name: `${item.name} (Bản sao)`,
                shortcutCode: generateHotkey(item.category || settings?.menuCategories?.[0] || 'TRUYỀN THỐNG', menu)
            };
            delete newItem.shortcut; // Xóa phím tắt legacy nếu có

            const res = await fetch(`${SERVER_URL}/api/menu`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newItem)
            });
            if (res.ok) {
                showToast('Đã nhân bản món!');
                fetchData();
            } else {
                showToast('Lỗi khi nhân bản!', 'error');
            }
        } catch (err) {
            showToast('Lỗi kết nối server!', 'error');
        }
    };
    const copyNFCLink = async (id) => {
        if (settings.cfEnabled) {
            let url = '';
            if ((!settings.tunnelType || settings.tunnelType === 'auto') && cfStatus?.url) {
                url = `${cfStatus.url}/?action=item&itemId=${id}`;
            } else if (settings.tunnelType === 'manual' && settings.cfDomain) {
                url = `https://${settings.cfDomain}/?action=item&itemId=${id}`;
            }

            if (url) {
                navigator.clipboard.writeText(url);
                setCopiedId(id);
                showToast(`✅ Link món (Cloudflare): ${url}`, 'success');
                setTimeout(() => setCopiedId(null), 2000);
                return;
            }
        }
        let currentIP = lanIP;
        try {
            const r = await fetch(`${SERVER_URL}/api/lan-info`);
            const data = await r.json();
            currentIP = data.ip;
        } catch (e) { /* use current state lanIP */ }
        const url = `http://${currentIP}:5173/?action=item&itemId=${id}`;
        navigator.clipboard.writeText(url);
        setCopiedId(id);
        showToast(`✅ Link món: ${url}`, 'success');
        setTimeout(() => setCopiedId(null), 2000);
    };

    // Copy general order link (homepage)
    const copyOrderLink = async () => {
        let currentUrl = '';
        if (settings.cfEnabled) {
            if ((!settings.tunnelType || settings.tunnelType === 'auto') && cfStatus?.url) {
                currentUrl = `${cfStatus.url}/`;
            } else if (settings.tunnelType === 'manual' && settings.cfDomain) {
                currentUrl = `https://${settings.cfDomain}/`;
            }
        }

        if (!currentUrl) {
            let targetIP = lanIP;
            try {
                const r = await fetch(`${SERVER_URL}/api/lan-info`);
                const data = await r.json();
                targetIP = data.ip;
                setLanIP(targetIP);
            } catch (e) { }
            currentUrl = `http://${targetIP}:5173/`;
        }

        if (settings.qrProtectionEnabled && qrToken) {
            currentUrl += `?token=${qrToken}#/`;
        }

        navigator.clipboard.writeText(currentUrl);
        showToast(`✅ Link order: ${currentUrl}`, 'success');
    };
    const toggleExpand = (id) => setExpandedItemId(prev => prev === id ? null : id);

    const saveImport = async (importData) => {
        try {
            const res = await fetch(`${SERVER_URL}/api/imports`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(importData)
            });
            if (res.ok) {
                showToast('Đã lưu phiếu nhập kho!');
            } else {
                showToast('Lỗi khi lưu phiếu nhập!', 'error');
            }
            setEditImport(null);
            fetchData();
        } catch (err) {
            showToast('Lỗi kết nối server!', 'error');
        }
    };

    const saveInventory = async (item) => {
        const res = await fetch(`${SERVER_URL}/api/inventory/save`, {

            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item)
        });
        if (res.ok) {
            showToast('Đã lưu nguyên liệu!');
        } else {
            showToast('Lỗi khi lưu nguyên liệu!', 'error');
        }
        setEditInventory(null);
        fetchData();
    };

    const handleDownloadInventoryTemplate = () => {
        const headers = [
            "Tên nguyên liệu (*)",
            "Đơn vị lưu kho gốc của NL",
            "Số lượng hộp/bao nhập kì này",
            "Tên Quy cách nhập (Ví dụ: hộp, block)",
            "Dung lượng lõi / 1 quy cách quy đổi ra đơn vị gốc",
            "Giá mua / 1 quy cách (LƯU Ý: Nhập theo nghìn đồng - Ví dụ: mua 25.000đ thì nhập 25)"
        ];
        // Tạo 3 dòng mẫu
        const rows = [
            ["Cà phê rang mộc", "g", "2", "bao", "1000", "150"],
            ["Sữa đặc Ngôi Sao", "g", "1", "thùng", "15200", "850"],
            ["Trà Oolong", "g", "5", "gói", "500", "75"]
        ];
        const csvContent = generateCSV([headers, ...rows]);
        const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `MAU_NHAP_KHO_HANG_LOAT_${new Date().toLocaleDateString('vi-VN').replace(/\//g, '-')}.csv`;
        link.click();
    };

    const handleImportInventoryCSV = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            const text = event.target.result;
            const rows = parseCSV(text);
            if (rows.length < 2) {
                showToast('File CSV không hợp lệ hoặc không có dữ liệu.', 'error');
                return; // 
            }

            const dataRows = rows.slice(1);
            const bulkItems = dataRows.map(row => {
                return {
                    name: row[0]?.trim(),
                    unit: row[1]?.trim() || 'g',
                    quantity: row[2]?.trim() || '0',
                    importUnit: row[3]?.trim() || 'hộp',
                    volumePerUnit: row[4]?.trim() || '1',
                    costPerUnit: row[5]?.trim() || '0'
                };
            }).filter(item => item.name); // Bắt buộc phải có tên

            if (bulkItems.length === 0) {
                showToast('Không tìm thấy phiếu nhập hợp lệ trong file (Thiếu tên nguyên liệu).', 'error');
                return;
            }

            try {
                const res = await fetch(`${SERVER_URL}/api/imports/bulk`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(bulkItems)
                });
                const result = await res.json();
                if (result.success) {
                    showToast(result.message || 'Import thành công từ file CSV!');
                    fetchData();
                } else {
                    showToast(result.message || 'Có lỗi xảy ra khi Import dữ liệu!', 'error');
                }
            } catch (err) {
                console.error(err);
                showToast('Lỗi kết nối máy chủ lưu bulk import!', 'error');
            }
            e.target.value = null; // reset 
        };
        reader.readAsText(file);
    };

    const saveStaff = async (member) => {
        const id = member.id || Date.now().toString();
        await fetch(`${SERVER_URL}/api/staff/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...member, id })
        });
        setEditStaff(null);
        fetchData();
    };

    const saveDisciplinaryLog = async (log) => {
        const res = await fetch(`${SERVER_URL}/api/disciplinary`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(log)
        });
        if (res.ok) {
            const data = await res.json();
            setDisciplinaryLogs([...disciplinaryLogs, data.log]);
            fetchData(); // to get updated diligence points
        }
    };

    const deleteDisciplinaryLog = async (id) => {
        const res = await fetch(`${SERVER_URL}/api/disciplinary/${id}`, { method: 'DELETE' });
        if (res.ok) {
            setDisciplinaryLogs(prev => prev.filter(l => l.id !== id));
            fetchData();
        }
    };

    const saveTable = async (tableData) => {
        const id = tableData.id || `t${Date.now()}`;
        await fetch(`${SERVER_URL}/api/tables/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...tableData, id })
        });
        setEditTable(null);
        fetchData();
    };

    const deleteTable = async (id) => {
        if (!confirm('Xóa bàn này khỏi sơ đồ?')) return;
        await fetch(`${SERVER_URL}/api/tables/${id}`, { method: 'DELETE' });
        setActionTable(null);
        fetchData();
    };

    const deleteInventory = async (id) => {
        // Double confirmation for unlinked items handled by Custom Modal
        setDeleteInventoryModal(id);
    };

    const handleClockIn = async (staffId) => {
        const activeShift = shifts.find(s => s.staffId === staffId && !s.clockOut);
        if (activeShift) return;
        try {
            const res = await fetch(`${SERVER_URL}/api/attendance/clockin`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ staffId, token: 'ADMIN_BYPASS' })
            });
            if (!res.ok) {
                const data = await res.json();
                alert(data.message || 'Lỗi chấm công');
            }
            fetchShiftsAndRatings();
        } catch (err) { }
    };
    const handleClockOut = async (staffId) => {
        const activeShift = shifts.find(s => s.staffId === staffId && !s.clockOut);
        if (!activeShift) return;
        try {
            const res = await fetch(`${SERVER_URL}/api/attendance/clockout`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ staffId, token: 'ADMIN_BYPASS' })
            });
            if (!res.ok) {
                const data = await res.json();
                alert(data.message || 'Lỗi kết thúc ca');
            }
            fetchShiftsAndRatings();
        } catch (err) { }
    };
    const getStaffStats = (staffId) => {
        const staffRatings = ratings.filter(r => r.staffId === staffId);
        const avgRating = staffRatings.length ? staffRatings.reduce((s, r) => s + r.stars, 0) / staffRatings.length : 0;
        const staffShifts = shifts.filter(s => s.staffId === staffId && s.actualHours);
        const totalHours = staffShifts.reduce((s, r) => s + r.actualHours, 0);
        return { avgRating: avgRating.toFixed(1), ratingCount: staffRatings.length, totalHours: totalHours.toFixed(1) };
    };

    const deleteStaff = async (id) => {
        if (!confirm('Xóa nhân viên này?')) return;
        await fetch(`${SERVER_URL}/api/staff/${id}`, { method: 'DELETE' });
        fetchData();
    };

    const updateTableStatus = async (id, status) => {
        await fetch(`${SERVER_URL}/api/tables/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, status })
        });
        setActionTable(null);
        fetchData();
    };

    // Thêm món mới = tự sinh shortcutCode -> lưu ngay lên server rồi mở editor
    const handleAddNew = async () => {
        const defaultCategory = settings?.menuCategories?.[0] || 'TRUYỀN THỐNG';
        const newShortcutCode = generateHotkey(defaultCategory, menu);

        const newItem = {
            id: `new-${Date.now().toString()}`,
            name: 'Món mới',
            price: '25',
            category: defaultCategory,
            image: '',
            description: '',
            volume: '200ml',
            rating: '5.0',
            sizes: [{ label: 'S', volume: '200ml', priceAdjust: 0 }],
            addons: [],
            shortcutCode: newShortcutCode
        };
        try {
            const res = await fetch(`${SERVER_URL}/api/menu`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newItem)
            });
            if (res.ok) {
                const data = await res.json();
                const savedItem = data.item; // Server returns item with permanent ID
                // Refresh menu from server to get the saved item
                const freshMenu = await (await fetch(`${SERVER_URL}/api/menu?all=true`)).json();
                setMenu(freshMenu);
                setExpandedItemId(savedItem.id);
                showToast(`Đã tạo món mới (Mã: ${newShortcutCode}) — hãy chỉnh sửa thông tin!`);
            }
        } catch (err) {
            showToast('Lỗi kết nối server!', 'error');
        }
    };

    const handleImportJSON = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const items = JSON.parse(event.target.result);
                const res = await fetch(`${SERVER_URL}/api/menu/bulk`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(items)
                });
                if (res.ok) {
                    alert('Nhập dữ liệu thành công!');
                    fetchData();
                }
            } catch (err) {
                alert('Lỗi khi đọc file JSON: ' + err.message);
            }
        };
        reader.readAsText(file);
    };

    const handleChangePassword = async () => {
        const { oldPassword, newPassword, confirmPassword } = passwordData;
        if (!oldPassword || !newPassword || !confirmPassword) {
            setPasswordMessage({ text: 'Vui lòng nhập đầy đủ thông tin.', type: 'error' });
            return;
        }
        if (newPassword !== confirmPassword) {
            setPasswordMessage({ text: 'Mật khẩu mới không khớp.', type: 'error' });
            return;
        }
        if (newPassword.length < 6) {
            setPasswordMessage({ text: 'Mật khẩu mới phải từ 6 ký tự trở lên.', type: 'error' });
            return;
        }

        try {
            const token = localStorage.getItem('authToken'); // Use authToken for admin
            const res = await fetch(`${SERVER_URL}/api/auth/change-admin-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ oldPassword, newPassword })
            });
            const data = await res.json();
            if (data.success) {
                setPasswordMessage({ text: data.message, type: 'success' });
                setPasswordData({ oldPassword: '', newPassword: '', confirmPassword: '' });
                setTimeout(() => setPasswordMessage({ text: '', type: '' }), 3000);
            } else {
                setPasswordMessage({ text: data.message, type: 'error' });
            }
        } catch (e) {
            setPasswordMessage({ text: 'Lỗi kết nối đến máy chủ.', type: 'error' });
        }
    };

    // Group menu by category
    const categories = getSortedCategories(menu, settings);

    // --- Order Completion Shortcut Logic ---
    useEffect(() => {
        if (activeTab !== 'orders' || showOrderPanel) {
            if (orderShortcutBuffer !== '') setOrderShortcutBuffer('');
            return;
        }

        const handleKeyDown = (e) => {
            // Ignore if user is typing in an input field
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)) return;

            if (e.key === 'Enter') {
                if (orderShortcutBuffer.length > 0) {
                    const qNum = parseInt(orderShortcutBuffer, 10);
                    const matchingOrders = orders.filter(o => o.queueNumber === qNum);

                    if (matchingOrders.length > 0) {
                        // Find orders that are eligible for completion (matching the condition in the UI button)
                        const activeOrders = matchingOrders.filter(o =>
                            (o.status === 'PENDING' && (o.isPaid || settings.requirePrepayment === false)) ||
                            (o.isPaid && o.status !== 'COMPLETED')
                        );

                        if (activeOrders.length > 0) {
                            // If multiple, complete the oldest one first
                            activeOrders.sort((a, b) => a.timestamp - b.timestamp);
                            completeOrder(activeOrders[0].id);
                        } else {
                            showToast(`Đơn #${qNum} chưa thể hoàn tất (Chưa thanh toán / Đã hoàn tất)`, 'warning');
                        }
                    } else {
                        showToast(`Không tìm thấy đơn #${qNum}`, 'error');
                    }
                    setOrderShortcutBuffer('');
                }
            } else if ((e.key === 'Escape' || (e.key === 'Backspace' && !isInputFocused()))) {
                setOrderShortcutBuffer('');
            } else if (/^[0-9]$/.test(e.key)) {
                setOrderShortcutBuffer(prev => {
                    if (prev === '' && e.key === '0') return prev;
                    return prev + e.key;
                });
            } else if (e.key === 'Backspace') {
                setOrderShortcutBuffer(prev => prev.slice(0, -1));
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeTab, orderShortcutBuffer, orders, settings.requirePrepayment]);

    return (
        <div className="w-full h-screen bg-[#F2F2F7] overflow-hidden flex flex-col">
            {/* --- AUTO UPDATE BANNER --- */}
            <AnimatePresence>
                {latestVersion && isNewerVersion(latestVersion, systemVersion) && showUpdateBanner && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="bg-brand-600 text-white px-6 py-3 flex items-center justify-between shadow-lg z-[1001]"
                    >
                        <div className="flex items-center gap-3">
                            <div className="bg-white/20 p-2 rounded-none animate-pulse">
                                <RefreshCw size={20} className={isUpdating ? 'animate-spin' : ''} />
                            </div>
                            <div>
                                <p className="text-sm font-black uppercase tracking-widest">Phát hiện bản cập nhật mới: v{latestVersion}</p>
                                <p className="text-[10px] opacity-80 font-bold uppercase">Bạn đang sử dụng phiên bản v{systemVersion}. Hãy cập nhật để trải nghiệm tính năng mới nhất.</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            {/* Link tải trực tiếp cho Mac/Windows hoặc nút cập nhật cho Linux */}
                            {(() => {
                                const platform = window.process?.platform;
                                const isMac = platform === 'darwin';
                                const isWin = platform === 'win32';
                                const isLinux = platform === 'linux';
                                const isElectron = !!(window.process?.versions?.electron);

                                if (isElectron && (isMac || isWin)) {
                                    // Tìm asset phù hợp theo OS
                                    const asset = latestAssets.find(a => {
                                        if (isMac) return a.name.toLowerCase().endsWith('.dmg');
                                        if (isWin) return a.name.toLowerCase().endsWith('.exe');
                                        return false;
                                    });
                                    if (asset) {
                                        return (
                                            <a
                                                href={asset.browser_download_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="px-5 py-2 bg-white text-brand-600 font-black text-xs uppercase tracking-widest hover:bg-brand-50 transition-all shadow-sm flex items-center gap-2 whitespace-nowrap"
                                            >
                                                <Download size={14} />
                                                TẢI {isMac ? '.DMG' : '.EXE'} NGAY
                                            </a>
                                        );
                                    }
                                    // Không có asset: link github releases
                                    return (
                                        <a
                                            href={`https://github.com/mvcthinhofficial/order-cafe/releases/tag/v${latestVersion}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="px-5 py-2 bg-white text-brand-600 font-black text-xs uppercase tracking-widest hover:bg-brand-50 transition-all shadow-sm flex items-center gap-2 whitespace-nowrap"
                                        >
                                            <ExternalLink size={14} />
                                            TẢI BẢN CẬP NHẬT
                                        </a>
                                    );
                                }
                                // Linux hoặc web: nút cập nhật tự động
                                return (
                                    <button
                                        onClick={handleSystemUpdate}
                                        disabled={isUpdating}
                                        className={`px-6 py-2 bg-white text-brand-600 font-black text-xs uppercase tracking-widest hover:bg-brand-50 transition-all shadow-sm flex items-center gap-2 ${isUpdating ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        {isUpdating ? 'ĐANG CẬP NHẬT...' : 'CẬP NHẬT NGAY'}
                                    </button>
                                );
                            })()}
                            <button onClick={() => setShowUpdateBanner(false)} className="opacity-60 hover:opacity-100 transition-opacity">
                                <X size={20} />
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="w-full mx-auto h-full bg-[#F2F2F7] relative flex flex-col">
                {/* Unsaved dialog */}
                <AnimatePresence>
                    {pendingTab && (
                        <ConfirmDialog
                            onCancel={() => setPendingTab(null)}
                            onDiscard={() => { setExpandedItemId(null); setActiveTab(pendingTab); setPendingTab(null); fetchData(); }}
                            onSave={async () => {
                                if (inlineDraftRef.current) {
                                    await saveMenuItem(inlineDraftRef.current);
                                }
                                setActiveTab(pendingTab);
                                setPendingTab(null);
                            }}
                        />
                    )}

                    {/* FACTORY RESET MODAL */}
                    {showFactoryResetModal && (
                        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white max-w-md w-full shadow-2xl rounded-none overflow-hidden">
                                <div className="bg-red-600 text-white p-5 text-center relative">
                                    <div className="absolute top-0 right-0 p-3">
                                        <button onClick={() => { setShowFactoryResetModal(false); setFactoryResetStep(1); setFactoryResetInput(''); }} className="text-white/80 hover:text-white transition-colors">
                                            <X size={20} />
                                        </button>
                                    </div>
                                    <div className="mx-auto bg-red-500 rounded-none w-14 h-14 flex items-center justify-center mb-3">
                                        <AlertTriangle size={30} className="text-white" />
                                    </div>
                                    <h2 className="text-xl font-black uppercase tracking-widest">CẢNH BÁO QUAN TRỌNG</h2>
                                </div>
                                <div className="p-6">
                                    <p className="text-sm font-semibold text-gray-800 text-center mb-4 leading-relaxed bg-red-50 p-3 rounded-none border border-red-100">
                                        Thao tác này sẽ xoá sạch toàn bộ Báo cáo, Đơn hàng, Nhập/Kiểm kho và Chấm công hiện có trên màn hình. Mọi tồn kho trở về 0. (Menu và thông tin nhân viên vẫn giữ nguyên).
                                    </p>

                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-[11px] font-black uppercase text-gray-500">
                                                {factoryResetStep === 1
                                                    ? 'Bước 1: Gõ lệnh đồng ý xóa'
                                                    : 'Bước 2: Hiệu Lệnh Cuối Cùng'}
                                            </label>
                                            <div className="bg-gray-100 p-3 rounded-none text-center border border-gray-200">
                                                <span className="font-mono font-bold text-red-600 select-all underline decoration-red-300 underline-offset-4">
                                                    {factoryResetStep === 1 ? 'DONG Y XOA' : 'CHUC MUNG KHAI TRUONG'}
                                                </span>
                                            </div>
                                            <input
                                                autoFocus
                                                type="text"
                                                value={factoryResetInput}
                                                onChange={(e) => setFactoryResetInput(e.target.value.toUpperCase())}
                                                placeholder="Gõ chính xác dòng chữ trên vào đây..."
                                                className="w-full text-center tracking-widest font-bold uppercase py-3 px-4 bg-white border border-gray-300 focus:border-red-500 focus:ring-2 focus:ring-red-200 rounded-none outline-none transition-all placeholder:normal-case placeholder:font-normal placeholder:tracking-normal"
                                            />
                                        </div>

                                        <div className="pt-2">
                                            <button
                                                disabled={
                                                    isFactoryResetting ||
                                                    (factoryResetStep === 1 && factoryResetInput !== 'DONG Y XOA') ||
                                                    (factoryResetStep === 2 && factoryResetInput !== 'CHUC MUNG KHAI TRUONG')
                                                }
                                                onClick={async () => {
                                                    if (factoryResetStep === 1) {
                                                        setFactoryResetStep(2);
                                                        setFactoryResetInput('');
                                                    } else if (factoryResetStep === 2) {
                                                        setIsFactoryResetting(true);
                                                        try {
                                                            const res = await fetch(`${SERVER_URL}/api/settings/factory-reset`, {
                                                                method: 'POST',
                                                                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
                                                            });
                                                            const data = await res.json();
                                                            if (data.success && data.folderName) {
                                                                alert(`Quán mới đã được tạo thành công! Toàn bộ dữ liệu cũ đã được sao lưu an toàn tại thư mục: data/backups/${data.folderName}`);
                                                                window.location.reload();
                                                            } else {
                                                                alert('Lỗi: ' + (data.error || 'Server không phản hồi.'));
                                                            }
                                                        } catch (error) {
                                                            alert('Lỗi kết nối đến máy chủ.');
                                                        } finally {
                                                            setIsFactoryResetting(false);
                                                        }
                                                    }
                                                }}
                                                className={`w-full py-4 rounded-none font-black uppercase tracking-widest transition-all flex justify-center items-center gap-2 ${(factoryResetStep === 1 && factoryResetInput === 'DONG Y XOA') || (factoryResetStep === 2 && factoryResetInput === 'CHUC MUNG KHAI TRUONG')
                                                        ? 'bg-red-600 text-white shadow-xl shadow-red-500/30 hover:bg-red-700'
                                                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                                    }`}
                                            >
                                                {isFactoryResetting ? <RefreshCw size={18} className="animate-spin" /> : <Shield size={18} />}
                                                {factoryResetStep === 1 ? 'XÁC NHẬN BƯỚC 1' : 'CHÍNH THỨC KHAI TRƯƠNG'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    )}
                    {actionTable && (
                        <TableActionModal
                            table={actionTable}
                            onClose={() => setActionTable(null)}
                            onOrder={(existingOrder) => {
                                setSelectedTableId(actionTable.id);
                                if (existingOrder) { setEditOrder(existingOrder); }
                                setShowOrderPanel(true);
                                setActionTable(null);
                            }}
                            onChangeTable={(order) => {
                                setChangeTableOrder(order);
                                setActionTable(null);
                            }}
                            onUpdateStatus={(status) => { updateTableStatus(actionTable.id, status); setActionTable(null); }}
                        />
                    )}
                    {changeTableOrder && (
                        <div className="fixed inset-0 z-[600] flex items-center justify-center p-6">
                            <div onClick={() => setChangeTableOrder(null)} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
                            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} className="bg-white rounded-none w-full max-w-4xl overflow-hidden shadow-2xl relative z-10 p-6 flex flex-col max-h-[90vh]">
                                <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
                                    <div>
                                        <h2 className="text-xl font-black uppercase tracking-widest text-brand-600 flex items-center gap-2">
                                            <ArrowRightLeft size={24} /> CHUYỂN BÀN
                                        </h2>
                                        <p className="font-bold text-gray-500 mt-1">Đơn hàng <span className="text-brand-600 bg-brand-50 px-2 py-0.5 rounded-none">#{changeTableOrder.queueNumber}</span> đang phục vụ tại bàn <span className="text-orange-600 bg-orange-50 px-2 py-0.5 rounded-none"> {tables.find(t => t.id === changeTableOrder.tableId)?.name || ''} </span></p>
                                    </div>
                                    <button onClick={() => setChangeTableOrder(null)} className="p-3 bg-gray-50 hover:bg-gray-100 text-gray-500 rounded-none transition-all"><X size={20} /></button>
                                </div>
                                <div className="flex-1 overflow-y-auto px-1 custom-scrollbar">
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 pb-4">
                                        {tables.map(t => {
                                            if (t.id === changeTableOrder.tableId) return null;
                                            const tOrder = orders.find(o => o.tableId === t.id && o.status !== 'COMPLETED' && o.status !== 'CANCELLED');
                                            const isOccupied = !!tOrder;

                                            return (
                                                <button key={t.id} onClick={async () => {
                                                    if (isOccupied) {
                                                        alert('Bàn này đang có khách, không thể gộp bàn tự động!');
                                                        return;
                                                    }
                                                    // Handle change table
                                                    try {
                                                        const res = await fetch(`${SERVER_URL}/api/orders/${changeTableOrder.id}`, {
                                                            method: 'PUT',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify({ ...changeTableOrder, tableId: t.id })
                                                        });
                                                        if (res.ok) {
                                                            fetchData();
                                                            setChangeTableOrder(null);
                                                        }
                                                    } catch (err) {
                                                        console.error('Lỗi khi chuyển bàn:', err);
                                                    }
                                                }} className={`aspect-square flex flex-col items-center justify-center p-2 border-2 transition-all relative overflow-hidden group ${isOccupied ? 'border-orange-200 bg-orange-50 opacity-50 cursor-not-allowed' : 'border-gray-100 bg-white hover:border-brand-600 hover:shadow-xl'}`}>
                                                    <div className={`absolute inset-0 opacity-5 pointer-events-none ${isOccupied ? 'bg-orange-500' : 'bg-gray-200 group-hover:bg-brand-600'}`} />
                                                    <span className={`w-14 h-14 flex items-center justify-center font-black text-2xl shadow-inner mb-2 ${isOccupied ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-600 group-hover:bg-brand-100 group-hover:text-brand-600'}`}>{t.name}</span>
                                                    <span className="font-black text-[10px] text-gray-500 uppercase tracking-widest">{t.area}</span>
                                                    {isOccupied && <span className="text-[9px] font-black text-orange-500 uppercase mt-1 tracking-widest">Đang dùng</span>}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    )}
                    {editInventory && (
                        <InventoryModal
                            item={editInventory.id ? editInventory : null}
                            onSave={saveInventory}
                            onClose={() => setEditInventory(null)}
                        />
                    )}
                    {viewingIngredientStats && (
                        <IngredientUsageModal
                            item={viewingIngredientStats}
                            onClose={() => setViewingIngredientStats(null)}
                        />
                    )}
                    {editStaff && (
                        <StaffModal
                            member={editStaff.id ? editStaff : null}
                            onSave={saveStaff}
                            onClose={() => setEditStaff(null)}
                        />
                    )}
                    {showDisciplinaryModalFor && (
                        <DisciplinaryModal
                            member={showDisciplinaryModalFor}
                            logs={disciplinaryLogs}
                            onSaveLog={saveDisciplinaryLog}
                            onDeleteLog={deleteDisciplinaryLog}
                            onClose={() => setShowDisciplinaryModalFor(null)}
                        />
                    )}
                    {editTable && (
                        <TableModal
                            table={editTable.id ? editTable : null}
                            onSave={saveTable}
                            onClose={() => setEditTable(null)}
                            onDelete={(id) => { deleteTable(id); setEditTable(null); }}
                        />
                    )}
                    {editImport && (
                        <ImportModal
                            inventory={inventory}
                            onSave={saveImport}
                            onClose={() => setEditImport(null)}
                        />
                    )}
                    {editExpense !== null && (
                        <ExpenseModal
                            expense={editExpense.id ? editExpense : null}
                            expenses={expenses}
                            onSave={saveExpense}
                            onClose={() => setEditExpense(null)}
                        />
                    )}
                    {showRecipeGuide && (
                        <RecipeGuideModal
                            menu={menu.filter(m => !m.isDeleted)}
                            inventory={inventory}
                            initialSearchTerm={recipeGuideSearch}
                            onClose={() => {
                                setShowRecipeGuide(false);
                                setRecipeGuideSearch('');
                            }}
                        />
                    )}
                    {editPromo && (
                        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 sm:p-6 bg-black/40 backdrop-blur-sm">
                            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} className="bg-white rounded-none w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl relative">
                                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 flex-shrink-0">
                                    <h2 className="text-xl font-black text-gray-800 uppercase tracking-widest flex items-center gap-2"><Gift size={24} className="text-brand-600" /> {editPromo.id ? 'Sửa Khuyến Mãi' : 'Tạo Khuyến Mãi'}</h2>
                                    <button onClick={() => setEditPromo(null)} className="p-2 hover:bg-gray-200 text-gray-500 rounded-none transition-colors"><X size={20} /></button>
                                </div>
                                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="col-span-1 md:col-span-2">
                                            <label className="block text-xs font-black tracking-widest text-brand-600 mb-2 uppercase">Loại Chương Trình</label>
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                                {[
                                                    { id: 'PROMO_CODE', label: 'Mã Giảm Giá', desc: 'Khách nhập mã' },
                                                    { id: 'ORDER_DISCOUNT', label: 'Giảm Theo Đơn', desc: 'Đơn >= X → Giảm tự động' },
                                                    { id: 'DISCOUNT_ON_CATEGORY', label: 'Giảm Theo Danh Mục', desc: 'Giảm % / tiền theo loại' },
                                                    { id: 'COMBO_GIFT', label: 'Tặng Quà Theo Đơn', desc: 'Đơn >= X → Tặng món' },
                                                    { id: 'HAPPY_HOUR', label: 'Khung Giờ Vàng', desc: 'Giảm / tặng theo giờ' },
                                                    { id: 'BUY_X_GET_Y', label: 'Mua X Tặng Y', desc: 'Mua đủ số lượng → Tặng' },
                                                ].map(t => (
                                                    <button key={t.id} onClick={() => setEditPromo({ ...editPromo, type: t.id })} className={`p-3 text-left border-2 rounded-none transition-all ${editPromo.type === t.id ? 'border-brand-600 bg-brand-50 text-brand-600 shadow-sm' : 'border-gray-100 text-gray-500 hover:border-gray-300'}`}>
                                                        <p className="text-sm font-bold">{t.label}</p>
                                                        <p className={`text-[10px] mt-0.5 ${editPromo.type === t.id ? 'text-brand-400' : 'text-gray-400'}`}>{t.desc}</p>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="col-span-1 md:col-span-2">
                                            <label className="block text-xs font-black tracking-widest text-gray-500 mb-2 uppercase">Tên Chương Trình (VD: Khai trương giảm 10%)</label>
                                            <input type="text" value={editPromo.name || ''} onChange={(e) => setEditPromo({ ...editPromo, name: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent focus:border-brand-600 focus:bg-white rounded-none font-bold text-gray-900 outline-none transition-all" placeholder="Nhập tên dễ nhớ..." />
                                        </div>
                                        <div className="col-span-1">
                                            <label className="block text-xs font-black tracking-widest text-gray-500 mb-2 uppercase">Từ Ngày (Bắt Đầu)</label>
                                            <input type="date" value={editPromo.startDate || ''} onChange={(e) => setEditPromo({ ...editPromo, startDate: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent focus:border-brand-600 focus:bg-white rounded-none font-bold text-gray-900 outline-none transition-all" />
                                        </div>
                                        <div className="col-span-1">
                                            <label className="block text-xs font-black tracking-widest text-gray-500 mb-2 uppercase">Đến Ngày (Kết Thúc)</label>
                                            <input type="date" value={editPromo.endDate || ''} onChange={(e) => setEditPromo({ ...editPromo, endDate: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent focus:border-brand-600 focus:bg-white rounded-none font-bold text-gray-900 outline-none transition-all" />
                                        </div>

                                        {editPromo.type === 'PROMO_CODE' && (
                                            <>
                                                <div>
                                                    <label className="block text-xs font-black tracking-widest text-gray-500 mb-2 uppercase">Mã (Cần Viết Liền)</label>
                                                    <input type="text" value={editPromo.code || ''} onChange={(e) => setEditPromo({ ...editPromo, code: e.target.value.toUpperCase().replace(/\s/g, '') })} className="w-full px-4 py-3 bg-brand-50 border-2 border-brand-200 focus:border-brand-600 rounded-none font-black text-brand-700 tracking-wider outline-none transition-all uppercase placeholder:font-bold placeholder:text-brand-300" placeholder="VD: SALE10" />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-black tracking-widest text-gray-500 mb-2 uppercase">Hình Thức Giảm</label>
                                                    <div className="flex bg-gray-100 rounded-none p-1">
                                                        <button onClick={() => setEditPromo({ ...editPromo, discountType: 'PERCENT' })} className={`flex-1 py-2 font-bold text-sm rounded-none transition-all ${editPromo.discountType !== 'AMOUNT' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>% GIÁ TRỊ</button>
                                                        <button onClick={() => setEditPromo({ ...editPromo, discountType: 'AMOUNT' })} className={`flex-1 py-2 font-bold text-sm rounded-none transition-all ${editPromo.discountType === 'AMOUNT' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>TRỪ TIỀN</button>
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-black tracking-widest text-gray-500 mb-2 uppercase">Mức Giảm {editPromo.discountType === 'AMOUNT' ? '(VNĐ)' : '(%)'}</label>
                                                    <input type="number" min="0" value={editPromo.discountValue || 0} onChange={(e) => setEditPromo({ ...editPromo, discountValue: Number(e.target.value) })} className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent focus:border-brand-600 rounded-none font-bold text-gray-900 outline-none" />
                                                </div>
                                                {editPromo.discountType !== 'AMOUNT' && (
                                                    <div>
                                                        <label className="block text-xs font-black tracking-widest text-gray-500 mb-2 uppercase">Giảm Tối Đa (Ngàn Đồng)</label>
                                                        <input type="number" min="0" value={editPromo.maxDiscount || 0} onChange={(e) => setEditPromo({ ...editPromo, maxDiscount: Number(e.target.value) })} className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent focus:border-brand-600 rounded-none font-bold text-gray-900 outline-none" placeholder="0 = Không giới hạn" />
                                                    </div>
                                                )}
                                                <div className="pt-2 border-t border-gray-100 mt-2">
                                                    <label className="flex items-center gap-2 cursor-pointer mb-2">
                                                        <input type="checkbox" checked={editPromo.ignoreGlobalDisable || false} onChange={e => setEditPromo({ ...editPromo, ignoreGlobalDisable: e.target.checked })} className="w-4 h-4 text-brand-600 cursor-pointer" />
                                                        <span className="text-xs font-black tracking-widest text-brand-600 uppercase mt-0.5">Luôn Hoạt Động (Bỏ qua tắt Khuyến Mãi)</span>
                                                    </label>
                                                    <p className="text-[10px] text-gray-400 font-bold mb-4 ml-6">Mã này vẫn dùng được ngay cả khi đã tắt tính năng Khuyến Mãi chung.</p>

                                                    <label className="block text-xs font-black tracking-widest text-gray-500 mb-2 uppercase">Giới Hạn Dùng / Ngày (Lượt)</label>
                                                    <input type="number" min="0" value={editPromo.dailyLimit || ''} onChange={(e) => setEditPromo({ ...editPromo, dailyLimit: e.target.value === '' ? '' : Number(e.target.value) })} className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent focus:border-brand-600 rounded-none font-bold text-gray-900 outline-none" placeholder="Để trống = Không giới hạn" />
                                                </div>
                                            </>
                                        )}

                                        {editPromo.type === 'HAPPY_HOUR' && (
                                            <>
                                                <div>
                                                    <label className="block text-xs font-black tracking-widest text-gray-500 mb-2 uppercase">Giờ Bắt Đầu</label>
                                                    <input type="time" value={(editPromo.validHours || [])[0] || '08:00'} onChange={(e) => setEditPromo({ ...editPromo, validHours: [e.target.value, (editPromo.validHours || [])[1] || '10:00'] })} className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-none font-bold" />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-black tracking-widest text-gray-500 mb-2 uppercase">Giờ Kết Thúc</label>
                                                    <input type="time" value={(editPromo.validHours || [])[1] || '10:00'} onChange={(e) => setEditPromo({ ...editPromo, validHours: [(editPromo.validHours || [])[0] || '08:00', e.target.value] })} className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-none font-bold" />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-black tracking-widest text-gray-500 mb-2 uppercase">Hình Thức Ưu Đãi</label>
                                                    <div className="flex bg-gray-100 rounded-none p-1">
                                                        <button onClick={() => setEditPromo({ ...editPromo, discountType: 'PERCENT' })} className={`flex-1 py-2 font-bold text-sm rounded-none transition-all ${editPromo.discountType !== 'AMOUNT' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>% GIÁ TRỊ</button>
                                                        <button onClick={() => setEditPromo({ ...editPromo, discountType: 'AMOUNT' })} className={`flex-1 py-2 font-bold text-sm rounded-none transition-all ${editPromo.discountType === 'AMOUNT' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>TIỀN MẶT</button>
                                                        <button onClick={() => setEditPromo({ ...editPromo, discountType: 'GIFT' })} className={`flex-1 py-2 font-bold text-sm rounded-none transition-all ${editPromo.discountType === 'GIFT' ? 'bg-white shadow text-green-700' : 'text-gray-500'}`}>TẶNG QUÀ</button>
                                                    </div>
                                                </div>
                                                {editPromo.discountType !== 'GIFT' && (
                                                    <div>
                                                        <label className="block text-xs font-black tracking-widest text-gray-500 mb-2 uppercase">Mức Giảm {editPromo.discountType === 'AMOUNT' ? '(Ngàn Đồng)' : '(%)'}</label>
                                                        <input type="number" min="0" value={editPromo.discountValue || 0} onChange={(e) => setEditPromo({ ...editPromo, discountValue: Number(e.target.value) })} className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent focus:border-brand-600 rounded-none font-bold text-gray-900 outline-none" />
                                                    </div>
                                                )}
                                                {editPromo.discountType === 'GIFT' && (
                                                    <div>
                                                        <label className="block text-xs font-black tracking-widest text-green-600 mb-2 uppercase">Số Phần Quà Tặng</label>
                                                        <input type="number" min="1" value={editPromo.giftQuantity || 1} onChange={(e) => setEditPromo({ ...editPromo, giftQuantity: Number(e.target.value) })} className="w-full px-4 py-3 bg-green-50 text-green-700 rounded-none font-bold outline-none border border-green-200" />
                                                    </div>
                                                )}
                                            </>
                                        )}

                                        {editPromo.type === 'BUY_X_GET_Y' && (
                                            <>
                                                <div>
                                                    <label className="block text-xs font-black tracking-widest text-gray-500 mb-2 uppercase">Mua [X] Sản Phẩm</label>
                                                    <input type="number" min="1" value={editPromo.requiredQuantity || 1} onChange={(e) => setEditPromo({ ...editPromo, requiredQuantity: Number(e.target.value) })} className="w-full px-4 py-3 bg-gray-50 rounded-none font-bold outline-none" />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-black tracking-widest text-green-600 mb-2 uppercase">Tặng [Y] Phần Quà</label>
                                                    <input type="number" min="1" value={editPromo.giftQuantity || 1} onChange={(e) => setEditPromo({ ...editPromo, giftQuantity: Number(e.target.value) })} className="w-full px-4 py-3 bg-green-50 text-green-700 rounded-none font-bold outline-none border border-green-200" />
                                                </div>
                                            </>
                                        )}

                                        {/* ORDER_DISCOUNT: Giảm thẳng hóa đơn khi đạt ngưỡng */}
                                        {editPromo.type === 'ORDER_DISCOUNT' && (
                                            <>
                                                <div>
                                                    <label className="block text-xs font-black tracking-widest text-gray-500 mb-2 uppercase">Hình Thức Giảm</label>
                                                    <div className="flex bg-gray-100 rounded-none p-1">
                                                        <button onClick={() => setEditPromo({ ...editPromo, discountType: 'PERCENT' })} className={`flex-1 py-2 font-bold text-sm rounded-none transition-all ${editPromo.discountType !== 'AMOUNT' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>% GIÁ TRỊ</button>
                                                        <button onClick={() => setEditPromo({ ...editPromo, discountType: 'AMOUNT' })} className={`flex-1 py-2 font-bold text-sm rounded-none transition-all ${editPromo.discountType === 'AMOUNT' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>TRỪ TIỀN</button>
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-black tracking-widest text-gray-500 mb-2 uppercase">Mức Giảm {editPromo.discountType === 'AMOUNT' ? '(Ngàn Đồng)' : '(%)'}</label>
                                                    <input type="number" min="0" value={editPromo.discountValue || 0} onChange={(e) => setEditPromo({ ...editPromo, discountValue: Number(e.target.value) })} className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent focus:border-brand-600 rounded-none font-bold text-gray-900 outline-none" />
                                                </div>
                                                {editPromo.discountType !== 'AMOUNT' && (
                                                    <div>
                                                        <label className="block text-xs font-black tracking-widest text-gray-500 mb-2 uppercase">Giảm Tối Đa (Ngàn Đồng, 0 = không giới hạn)</label>
                                                        <input type="number" min="0" value={editPromo.maxDiscount || 0} onChange={(e) => setEditPromo({ ...editPromo, maxDiscount: Number(e.target.value) })} className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent focus:border-brand-600 rounded-none font-bold text-gray-900 outline-none" />
                                                    </div>
                                                )}
                                            </>
                                        )}

                                        {/* DISCOUNT_ON_CATEGORY: Giảm theo danh mục */}
                                        {editPromo.type === 'DISCOUNT_ON_CATEGORY' && (
                                            <>
                                                <div className="col-span-1 md:col-span-2">
                                                    <label className="block text-xs font-black tracking-widest text-orange-600 mb-2 uppercase">Chọn Danh Mục Áp Dụng</label>
                                                    <div className="flex flex-wrap gap-2">
                                                        {[...new Set(menu.filter(m => !m.isDeleted).map(m => m.category).filter(Boolean))].map(cat => (
                                                            <button key={cat} onClick={() => setEditPromo({ ...editPromo, targetCategory: cat })}
                                                                className={`px-3 py-2 text-xs font-bold rounded-none border transition-all ${editPromo.targetCategory === cat ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-600 border-gray-200 hover:border-orange-300'}`}>
                                                                {cat}
                                                            </button>
                                                        ))}
                                                    </div>
                                                    {editPromo.targetCategory && <p className="text-xs text-orange-500 mt-2 font-bold">Đang chọn: {editPromo.targetCategory}</p>}
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-black tracking-widest text-gray-500 mb-2 uppercase">Hình Thức Giảm</label>
                                                    <div className="flex bg-gray-100 rounded-none p-1">
                                                        <button onClick={() => setEditPromo({ ...editPromo, discountType: 'PERCENT' })} className={`flex-1 py-2 font-bold text-sm rounded-none transition-all ${editPromo.discountType !== 'AMOUNT' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>% GIÁ TRỊ</button>
                                                        <button onClick={() => setEditPromo({ ...editPromo, discountType: 'AMOUNT' })} className={`flex-1 py-2 font-bold text-sm rounded-none transition-all ${editPromo.discountType === 'AMOUNT' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>TRỪ TIỀN</button>
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-black tracking-widest text-gray-500 mb-2 uppercase">Mức Giảm {editPromo.discountType === 'AMOUNT' ? '(Ngàn Đồng)' : '(%)'}</label>
                                                    <input type="number" min="0" value={editPromo.discountValue || 0} onChange={(e) => setEditPromo({ ...editPromo, discountValue: Number(e.target.value) })} className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent focus:border-brand-600 rounded-none font-bold text-gray-900 outline-none" />
                                                </div>
                                                {editPromo.discountType !== 'AMOUNT' && (
                                                    <div>
                                                        <label className="block text-xs font-black tracking-widest text-gray-500 mb-2 uppercase">Giảm Tối Đa (Ngàn Đồng, 0 = không giới hạn)</label>
                                                        <input type="number" min="0" value={editPromo.maxDiscount || 0} onChange={(e) => setEditPromo({ ...editPromo, maxDiscount: Number(e.target.value) })} className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent focus:border-brand-600 rounded-none font-bold text-gray-900 outline-none" />
                                                    </div>
                                                )}
                                            </>
                                        )}

                                        {/* Hóa đơn tối thiểu - ẩn cho DISCOUNT_ON_CATEGORY */}
                                        {editPromo.type !== 'DISCOUNT_ON_CATEGORY' && (
                                            <div>
                                                <label className="block text-xs font-black tracking-widest text-gray-500 mb-2 uppercase">Hóa Đơn Tối Thiểu (Ngàn Đồng)</label>
                                                <input type="number" min="0" value={editPromo.minOrderValue || 0} onChange={(e) => setEditPromo({ ...editPromo, minOrderValue: Number(e.target.value) })} className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent focus:border-brand-600 rounded-none font-bold text-gray-900 outline-none" />
                                            </div>
                                        )}

                                        <div className="col-span-1 md:col-span-2 mt-4 space-y-4">
                                            {/* Chọn món quà tặng */}
                                            {(editPromo.type === 'COMBO_GIFT' || (editPromo.type === 'HAPPY_HOUR' && editPromo.discountType === 'GIFT') || editPromo.type === 'BUY_X_GET_Y') && (
                                                <div className="p-4 bg-green-50 border border-green-100 rounded-none">
                                                    <label className="block text-xs font-black tracking-widest text-green-700 mb-3 uppercase flex items-center gap-2"><Gift size={16} /> Chọn Món Được Tặng (0đ)</label>
                                                    <div className="flex flex-wrap gap-2">
                                                        {menu.filter(m => !m.isDeleted).map(m => (
                                                            <button key={`g-${m.id}`} onClick={() => {
                                                                const gifts = editPromo.giftItems || [];
                                                                setEditPromo({ ...editPromo, giftItems: gifts.includes(m.id) ? gifts.filter(g => g !== m.id) : [...gifts, m.id] });
                                                            }} className={`px-3 py-1.5 text-xs font-bold rounded-none transition-all border ${(editPromo.giftItems || []).includes(m.id) ? 'bg-green-600 text-white border-green-600 shadow' : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
                                                                }`}>
                                                                {m.name}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Chọn món áp dụng KM (áp dụng cho một số loại) */}
                                            {(editPromo.type === 'PROMO_CODE' || editPromo.type === 'BUY_X_GET_Y' || editPromo.type === 'HAPPY_HOUR') && (
                                                <div className="p-4 bg-brand-50 border border-brand-100 rounded-none">
                                                    <label className="block text-xs font-black tracking-widest text-brand-700 mb-1 uppercase flex items-center gap-2">
                                                        <CheckCircle size={16} />
                                                        {editPromo.type === 'BUY_X_GET_Y' ? 'Món Bắt Buộc Phải Mua (để được tặng)' : 'Áp Dụng Cho Món'}
                                                    </label>
                                                    <p className="text-[10px] text-brand-500 mb-3">
                                                        {editPromo.type === 'BUY_X_GET_Y'
                                                            ? 'Chọn cụ thể món nào khách phải mua. Để trống = tất cả món đều tính.'
                                                            : 'Chọn món được áp dụng KM. Để trống = toàn menu.'}
                                                    </p>
                                                    {/* Toggle TẤT CẢ MENU */}
                                                    <button
                                                        onClick={() => setEditPromo({
                                                            ...editPromo, applicableItems:
                                                                (editPromo.applicableItems || []).includes('ALL') ? [] : ['ALL']
                                                        })}
                                                        className={`mr-2 mb-2 px-3 py-1.5 text-xs font-bold rounded-none transition-all border ${(editPromo.applicableItems || []).includes('ALL')
                                                            ? 'bg-brand-600 text-white border-brand-600 shadow'
                                                            : 'bg-white text-gray-400 border-gray-200 hover:border-brand-300'
                                                            }`}
                                                    >
                                                        {(editPromo.applicableItems || []).includes('ALL') ? '✓ TẤT CẢ MENU (nhấn để chọn riêng)' : 'TẤT CẢ MENU'}
                                                    </button>

                                                    {/* Danh sách món cụ thể — chỉ hiện khi không chọn ALL */}
                                                    {!(editPromo.applicableItems || []).includes('ALL') && (
                                                        <div className="flex flex-wrap gap-2 pt-3 border-t border-brand-200/50">
                                                            {menu.filter(m => !m.isDeleted).map(m => (
                                                                <button key={`a-${m.id}`} onClick={() => {
                                                                    const items = (editPromo.applicableItems || []).filter(i => i !== 'ALL');
                                                                    setEditPromo({ ...editPromo, applicableItems: items.includes(m.id) ? items.filter(g => g !== m.id) : [...items, m.id] });
                                                                }} className={`px-3 py-1.5 text-xs font-bold rounded-none transition-all border ${(editPromo.applicableItems || []).includes(m.id) ? 'bg-brand-600 text-white border-brand-600 shadow' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'
                                                                    }`}>
                                                                    {m.name}
                                                                </button>
                                                            ))}
                                                            {((editPromo.applicableItems || []).filter(i => i !== 'ALL')).length > 0 && (
                                                                <p className="w-full text-[10px] text-brand-600 font-bold mt-1">
                                                                    ✓ Đã chọn {(editPromo.applicableItems || []).filter(i => i !== 'ALL').length} món
                                                                </p>
                                                            )}
                                                            {((editPromo.applicableItems || []).filter(i => i !== 'ALL')).length === 0 && (
                                                                <p className="w-full text-[10px] text-gray-400 italic mt-1">
                                                                    * Chưa chọn → tính tất cả món (tương đương TẤT CẢ MENU)
                                                                </p>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="p-6 border-t border-gray-100 flex justify-end gap-3 bg-gray-50 align-end flex-shrink-0">
                                    <button onClick={() => setEditPromo(null)} className="px-5 py-2.5 font-bold text-gray-500 hover:bg-gray-200 rounded-none transition-all">Hủy</button>
                                    <button onClick={() => {
                                        if (!editPromo.name) return alert('Vui lòng nhập tên CTKM');
                                        if (editPromo.type === 'DISCOUNT_ON_CATEGORY' && !editPromo.targetCategory) return alert('Vui lòng chọn danh mục áp dụng');
                                        savePromotion(editPromo);
                                    }} className="bg-brand-600 text-white px-6 py-2.5 rounded-none font-bold shadow-lg shadow-[#007AFF]/30 flex items-center gap-2 hover:bg-brand-600 transition-all">
                                        <Save size={18} /> LƯU
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                <AnimatePresence>
                    {showOrderPanel && <StaffOrderPanel
                        menu={menu.filter(m => !m.isDeleted)}
                        tables={tables}
                        promotions={promotions}
                        initialTableId={selectedTableId}
                        initialOrder={editOrder}
                        settings={settings}
                        onClose={() => {
                            setShowOrderPanel(false);
                            setSelectedTableId(null);
                            setEditOrder(null);
                            fetchOrders();
                            setActiveTab('orders');
                        }}
                    />}
                </AnimatePresence>

                {/* Header */}
                <header className="admin-header w-full border-b border-gray-100 bg-white flex-shrink-0 z-50 relative">
                    <div className="w-full px-2 lg:px-4 xl:px-8 mx-auto flex justify-between items-center gap-4 xl:gap-8">
                        <div className="flex items-center gap-2 xl:gap-4">
                            <div className="bg-gray-900 p-3  shadow-xl">
                                <Settings className="text-white" size={24} />
                            </div>
                            <div>
                                <h1 className="text-xl font-black tracking-tighter text-gray-900">TH <span className="text-brand-600">POS</span></h1>
                                <p className="admin-label !ml-0 !mb-0 !opacity-60 leading-none mt-1">Hệ thống quản lý</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 xl:gap-10 flex-1 min-w-0 justify-end">
                            {/* Tab nav - Much larger for touch */}
                            <nav className="flex gap-1 xl:gap-2 bg-gray-100/50 p-1 md:p-1.5 xl:p-2 overflow-x-auto custom-scrollbar min-w-0">
                                {[
                                    { id: 'orders', icon: ClipboardList, label: 'Đơn hàng' },
                                    !settings.isTakeaway && { id: 'tables', icon: Table, label: 'Phòng bàn' },
                                    userRole === 'ADMIN' && { id: 'menu', icon: Package, label: 'Thực đơn' },
                                    userRole === 'ADMIN' && settings.enablePromotions && { id: 'promotions', icon: Gift, label: 'Khuyến mãi' },
                                    userRole === 'ADMIN' && { id: 'inventory', icon: Package, label: 'Kho hàng' },
                                    userRole === 'ADMIN' && { id: 'staff', icon: Users, label: 'Nhân sự' },
                                    userRole === 'ADMIN' && { id: 'reports', icon: BarChart3, label: 'Báo cáo' },
                                    userRole === 'ADMIN' && { id: 'settings', icon: Settings, label: 'Cài đặt' }

                                ].filter(Boolean).map(tab => (
                                    <button key={tab.id} onClick={() => handleTabChange(tab.id)}
                                        className={`admin-tab-btn ${activeTab === tab.id ? 'active !bg-white !shadow-xl !ring-1 !ring-black/5 !scale-[1.02] !text-gray-900' : 'hover:text-gray-900 hover:bg-white/50'}`}>
                                        <tab.icon size={20} className={activeTab === tab.id ? 'text-brand-600' : 'text-gray-400'} />
                                        <span>{tab.label}</span>
                                        {(tab.id === 'menu' && isDirty) && <span className="w-2.5 h-2.5  bg-amber-400 animate-pulse" />}
                                    </button>
                                ))}
                            </nav>

                            {/* User Info & Logout */}
                            <div className="flex items-center gap-2 xl:gap-4 border-l border-gray-200 pl-4 xl:pl-6 flex-shrink-0 whitespace-nowrap">
                                <div className="text-right hidden sm:block">
                                    <p className="text-sm font-bold text-gray-900 leading-none">{userName}</p>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-1">{userRole === 'ADMIN' ? 'Quản Lý' : 'Nhân Viên'}</p>
                                </div>
                                <button
                                    onClick={async () => {
                                        try {
                                            await fetch(`${SERVER_URL}/api/auth/logout`, {
                                                method: 'POST',
                                                headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
                                            });
                                        } catch (e) { }
                                        localStorage.removeItem('authToken');
                                        localStorage.removeItem('userRole');
                                        localStorage.removeItem('userName');
                                        navigate('/login');
                                    }}
                                    title="Đăng xuất"
                                    className="w-10 h-10 rounded-none bg-red-50 text-red-600 flex items-center justify-center hover:bg-red-100 hover:text-red-700 transition-colors"
                                >
                                    <LogOut size={18} />
                                </button>
                            </div>
                        </div>
                    </div>
                </header>

                <main className="w-full mx-auto py-6 pb-36 flex-1 overflow-x-hidden overflow-y-auto">
                    <AnimatePresence mode="wait">

                        {/* ── ORDERS ── */}
                        {activeTab === 'orders' && (
                            <motion.section key="orders" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}>

                                <div className="px-8 mb-5 flex flex-wrap justify-between items-center gap-y-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <button
                                            onClick={() => {
                                                showCompletedOrdersRef.current = !showCompletedOrdersRef.current;
                                                showDebtOrdersRef.current = false;
                                                setShowCompletedOrders(showCompletedOrdersRef.current);
                                                setShowDebtOrders(false);
                                                fetchOrders();
                                            }}
                                            className={`px-4 py-1.5 rounded-none font-black text-sm flex items-center gap-2 transition-all shadow-sm border ${showCompletedOrders ? 'bg-brand-50 text-brand-700 border-brand-200 hover:bg-brand-100' : 'bg-white text-gray-800 hover:bg-gray-50 border-gray-200'
                                                }`}
                                        >
                                            <History size={16} />
                                            {showCompletedOrders ? 'ĐƠN ĐANG LÀM' : 'ĐƠN ĐÃ BÁN'}
                                        </button>
                                        {(orders.some(o => o.isDebt) || showDebtOrders || report?.hasDebt) && (
                                            <button
                                                onClick={() => {
                                                    showDebtOrdersRef.current = !showDebtOrdersRef.current;
                                                    showCompletedOrdersRef.current = false;
                                                    setShowDebtOrders(showDebtOrdersRef.current);
                                                    setShowCompletedOrders(false);
                                                    fetchOrders();
                                                }}
                                                className={`px-4 py-1.5 rounded-none font-black text-sm flex items-center gap-2 transition-all shadow-sm border ${showDebtOrders ? 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100' : 'bg-white text-gray-800 hover:bg-gray-50 border-gray-200'
                                                    }`}
                                            >
                                                <BookOpen size={16} />
                                                {showDebtOrders ? 'ĐƠN ĐANG LÀM' : 'GHI NỢ'}
                                            </button>
                                        )}
                                        <div className="flex flex-wrap items-center gap-2 lg:gap-3 lg:ml-2">
                                            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-none border border-gray-200 shadow-sm" title="Ưu tiên làm rõ đơn cũ nhất, mờ dần các đơn mới hơn">
                                                <span className="text-sm font-bold text-gray-700 flex items-center gap-2">
                                                    <Star size={16} className={priorityMode ? 'text-amber-500 fill-amber-500' : 'text-gray-400'} /> Ưu tiên
                                                </span>
                                                <CustomSwitch
                                                    isOn={priorityMode}
                                                    onToggle={() => setPriorityMode(!priorityMode)}
                                                    activeColor="#F59E0B"
                                                />
                                            </div>
                                            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-none border border-gray-200 shadow-sm" title="Tuỳ chọn Thanh toán Trước (Khách trả tiền ngay) hoặc Thanh toán Sau (Làm nước trước, thu tiền sau)">
                                                <span className="text-sm font-bold text-gray-700 flex items-center gap-2">
                                                    <DollarSign size={16} /> Thanh toán: {settings.requirePrepayment === false ? 'SAU' : 'TRƯỚC'}
                                                </span>
                                                <CustomSwitch
                                                    isOn={settings.requirePrepayment !== false}
                                                    onToggle={async () => {
                                                        const newVal = settings.requirePrepayment === false ? true : false;
                                                        const newSettings = { ...settings, requirePrepayment: newVal };
                                                        try {
                                                            const res = await fetch(`${SERVER_URL}/api/settings`, {
                                                                method: 'POST',
                                                                headers: { 'Content-Type': 'application/json' },
                                                                body: JSON.stringify(newSettings)
                                                            });
                                                            if (res.ok) setSettings(newSettings);
                                                        } catch (e) {
                                                            console.error(e);
                                                        }
                                                    }}
                                                    activeColor="#34C759"
                                                />
                                            </div>
                                            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-none border border-gray-200 shadow-sm" title="Tự động mở mã QR Thanh toán trên Kiosk khi chọn Chuyển khoản tại POS">
                                                <span className="text-sm font-bold text-gray-700 flex items-center gap-2">
                                                    <QrCode size={16} /> QR TT tự động
                                                </span>
                                                <CustomSwitch
                                                    isOn={settings.autoPushPaymentQr !== false}
                                                    onToggle={async () => {
                                                        const newVal = !settings.autoPushPaymentQr;
                                                        const newSettings = { ...settings, autoPushPaymentQr: newVal };
                                                        try {
                                                            const res = await fetch(`${SERVER_URL}/api/settings`, {
                                                                method: 'POST',
                                                                headers: { 'Content-Type': 'application/json' },
                                                                body: JSON.stringify(newSettings)
                                                            });
                                                            if (res.ok) setSettings(newSettings);
                                                        } catch (e) {
                                                            console.error(e);
                                                        }
                                                    }}
                                                    activeColor="#34C759"
                                                />
                                            </div>

                                            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-none border border-gray-200 shadow-sm" title="Bật/Tắt giao diện Kiosk trên máy chủ (Dùng cho 2 màn hình)">
                                                <span className="text-sm font-bold text-gray-700 flex items-center gap-2">
                                                    <LayoutGrid size={16} /> Mở Kiosk
                                                </span>
                                                <CustomSwitch
                                                    isOn={isKioskOpen}
                                                    onToggle={() => {
                                                        const newState = !isKioskOpen;
                                                        setIsKioskOpen(newState);
                                                        try {
                                                            const { ipcRenderer } = window.require('electron');
                                                            ipcRenderer.send('toggle-kiosk');
                                                        } catch (e) {
                                                            console.log('Not in Electron or IPC error');
                                                        }
                                                    }}
                                                    activeColor="#007AFF"
                                                />
                                            </div>
                                        </div>
                                        {showCompletedOrders && (
                                            <div className="flex items-center gap-2 lg:ml-2 mt-2 md:mt-0">
                                                <input
                                                    type="date"
                                                    value={historyDate}
                                                    onChange={(e) => {
                                                        setHistoryDate(e.target.value);
                                                        historyDateRef.current = e.target.value;
                                                        fetchOrders();
                                                    }}
                                                    className="px-3 py-2 border border-gray-200 rounded-none text-sm font-bold text-gray-700 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-[#007AFF]/50"
                                                />
                                                <button
                                                    onClick={() => setHistorySortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                                                    className="px-3 py-2 border border-gray-200 rounded-none text-sm font-bold text-gray-700 bg-white shadow-sm flex items-center gap-2 hover:bg-gray-50"
                                                    title="Sắp xếp thời gian"
                                                >
                                                    {historySortOrder === 'desc' ? <ArrowDown size={18} /> : <ArrowUp size={18} />}
                                                    {historySortOrder === 'desc' ? 'Mới nhất' : 'Cũ nhất'}
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <div className="hidden lg:flex gap-1.5 shrink-0">
                                            <button
                                                title={`Đang hiển thị ${orderGridColumns} cột (Click để đổi)`}
                                                onClick={() => setOrderGridColumns(prev => prev === 7 ? 3 : prev + 1)}
                                                className="px-3 py-2 flex items-center justify-center transition-all bg-brand-50 border border-brand-600 rounded-none shadow-sm hover:bg-brand-100 active:scale-95"
                                            >
                                                <div className="flex gap-1 items-center">
                                                    {Array.from({ length: orderGridColumns }).map((_, i) => (
                                                        <div key={i} className="w-1.5 h-4 rounded-none bg-brand-600" />
                                                    ))}
                                                </div>
                                            </button>
                                        </div>

                                    </div>
                                </div>

                                <div className="flex gap-4 xl:gap-6 items-start w-full overflow-x-auto pb-6 custom-scrollbar snap-x">
                                    {(() => {
                                        let displayOrders = [...orders];
                                        if (showCompletedOrders) {
                                            displayOrders.sort((a, b) => {
                                                const timeA = new Date(a.timestamp).getTime();
                                                const timeB = new Date(b.timestamp).getTime();
                                                return historySortOrder === 'desc' ? timeB - timeA : timeA - timeB;
                                            });
                                        }
                                        const minQueue = displayOrders.length > 0 && !showCompletedOrders ? Math.min(...displayOrders.map(o => o.queueNumber)) : null;

                                        const activeOrders = displayOrders.filter(o => !showCompletedOrders && o.status !== 'COMPLETED' && o.status !== 'CANCELLED');
                                        const sortedActiveObj = {};
                                        [...activeOrders].sort((a, b) => a.queueNumber - b.queueNumber).forEach((o, i) => {
                                            sortedActiveObj[o.id] = i;
                                        });

                                        const columns = Array.from({ length: Math.max(1, orderGridColumns) }, () => []);
                                        displayOrders.forEach((order, index) => columns[index % orderGridColumns].push(order));

                                        return columns.map((colOrders, colIndex) => (
                                            <div key={colIndex} className="flex-1 flex flex-col gap-4 xl:gap-6 min-w-[280px] xl:min-w-0 snap-center">
                                                {colOrders.map(order => {
                                                    const isPending = order.status === 'PENDING';
                                                    const isAwaiting = order.status === 'AWAITING_PAYMENT';
                                                    const isPaid = order.isPaid;
                                                    const isUnpaid = !isPaid;
                                                    const isEditing = editingOrderId === order.id;
                                                    const isOldest = minQueue !== null && order.queueNumber === minQueue;
                                                    const isTagNumber = !!order.tagNumber;
                                                    const tableNameToDisplay = order.tagNumber || order.tableName || tables.find(t => t.id === order.tableId)?.name;
                                                    const tableAreaToDisplay = order.tagNumber ? 'TAG BÀN' : tables.find(t => t.id === order.tableId)?.area;

                                                    const orderIndex = sortedActiveObj[order.id];
                                                    let dimClass = '';
                                                    if (priorityMode && orderIndex !== undefined && orderIndex > 0 && !isEditing) {
                                                        if (orderIndex === 1) dimClass = 'opacity-[0.95] grayscale-[15%]';
                                                        else if (orderIndex === 2) dimClass = 'opacity-[0.90] grayscale-[25%]';
                                                        else if (orderIndex === 3) dimClass = 'opacity-[0.85] grayscale-[35%]';
                                                        else if (orderIndex === 4) dimClass = 'opacity-[0.80] grayscale-[40%]';
                                                        else dimClass = 'opacity-[0.75] grayscale-[50%]';
                                                        dimClass += ' hover:opacity-100 hover:grayscale-0 bg-slate-50';
                                                    } else if (!isOldest) {
                                                        dimClass = 'bg-white shadow-sm';
                                                    }

                                                    return (
                                                        <div key={order.id}
                                                            className={`break-inside-avoid mb-6 transition-all flex flex-col border ${isOldest && priorityMode ? 'bg-white shadow-2xl ring-4 ring-[#007AFF]/40 border-brand-600' : (isOldest ? 'bg-white shadow-sm ring-2 ring-[#007AFF]/20 border-brand-600' : '')
                                                                } ${dimClass} ${isEditing ? 'border-brand-600/40 shadow-xl ring-2 ring-[#007AFF]/10 !opacity-100 !bg-white' :
                                                                    isUnpaid ? 'border-amber-200 ring-1 ring-amber-100' :
                                                                        (isPending || isPaid) ? 'border-gray-200 hover:shadow-md' : 'border-gray-100'
                                                                }`}>
                                                            {/* Header */}
                                                            <div className="flex flex-wrap items-start justify-between gap-3 px-4 xl:px-5 pt-4 xl:pt-5 pb-3 border-b border-gray-100 bg-white/50">
                                                                <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto flex-1">
                                                                    <div className={`text-xl font-black bg-brand-600 text-white w-12 h-12 flex items-center justify-center shadow ${isOldest ? 'animate-pulse' : ''}`}>
                                                                        {order.queueNumber}
                                                                    </div>
                                                                    {tableNameToDisplay && (
                                                                        <div className={`text-sm font-black text-white w-12 h-12 flex flex-col items-center justify-center shadow border uppercase tracking-tighter shrink-0 rounded-none ${isTagNumber ? 'bg-[#000] border-gray-800' : 'bg-[#C68E5E] border-[#A67B5B]'}`}>
                                                                            <span className={`leading-none pt-1 ${isTagNumber && order.tagNumber.length < 3 ? 'text-lg' : ''}`}>{tableNameToDisplay}</span>
                                                                            {tableAreaToDisplay && <span className="text-[6px] font-black opacity-90 mt-1 tracking-widest truncate w-full text-center px-0.5">{tableAreaToDisplay}</span>}
                                                                        </div>
                                                                    )}
                                                                    <div className="min-w-0">
                                                                        <div className="flex items-center gap-2">
                                                                            <p className="font-black text-base text-gray-900 truncate">{order.customerName}</p>
                                                                        </div>
                                                                        <div className="flex items-center gap-2">
                                                                            {isOldest && <span className="text-[10px] font-black bg-brand-600 text-white px-2 py-0.5 uppercase mb-1">ĐƠN CŨ NHẤT</span>}
                                                                            <p className="text-[10px] text-brand-500 font-black uppercase tracking-widest">ID: {order.id}</p>
                                                                            <span className="text-gray-300">·</span>
                                                                            <p className="text-xs text-gray-400 font-bold">{new Date(order.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</p>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className="flex flex-wrap justify-end items-center gap-2 w-full sm:w-auto">
                                                                    {isUnpaid && !order.isDebt && <span className="text-[10px] xl:text-xs font-black bg-amber-100 text-amber-700 px-3 py-1.5 shrink-0">CHỜ THANH TOÁN</span>}
                                                                    {isPaid && <span className="text-xs font-black bg-green-100 text-green-700 px-3 py-1.5 ">ĐÃ THANH TOÁN</span>}
                                                                    {order.isDebt && <span className="text-xs font-black bg-purple-100 text-purple-700 px-3 py-1.5 ">ĐANG GHI NỢ</span>}
                                                                    {order.status === 'COMPLETED' && !order.isPaid && !order.isDebt && (
                                                                        <button
                                                                            onClick={() => handleMarkDebt(order.id)}
                                                                            className="p-1 px-2 text-[10px] font-bold bg-gray-100 text-gray-400 hover:bg-purple-100 hover:text-purple-600 transition-all rounded-none"
                                                                            title="Ghi nợ đơn hàng này"
                                                                        >
                                                                            GHI NỢ
                                                                        </button>
                                                                    )}
                                                                    {(isPending || isAwaiting || isPaid) && (
                                                                        <button
                                                                            onClick={() => { setCancelOrderId(order.id); setCancelReason(''); }}
                                                                            className="p-2 text-gray-300 hover:bg-red-50 hover:text-red-500 transition-all"
                                                                            title="Hủy đơn hàng"
                                                                        >
                                                                            <X size={16} />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* Items list */}
                                                            <div className="flex-1 overflow-y-auto px-4 xl:px-5 py-4 space-y-2 max-h-[60vh] custom-scrollbar">
                                                                {(order.cartItems || []).map((c, idx) => (
                                                                    <div key={idx} className="flex flex-wrap items-start justify-between gap-2 xl:gap-3 border-b border-gray-100 pb-3 mb-3 last:border-0 last:pb-0 last:mb-0">
                                                                        <div className="flex-1 min-w-[150px]">
                                                                            <span className={`${showCompletedOrders ? 'font-normal text-[15px]' : 'font-bold text-base'} text-gray-800`}>
                                                                                {idx + 1}. {c.item?.name || 'Món'}
                                                                                {c.isGift && <span className="ml-2 text-[10px] bg-brand-100 text-brand-700 font-black px-1.5 py-0.5 uppercase tracking-wider border border-brand-200">(QUÀ KM)</span>}
                                                                            </span>
                                                                            <div className="flex flex-wrap gap-2 mt-1.5 pl-4">
                                                                                {c.size?.label && <span className={`${showCompletedOrders ? 'text-[12px] px-2 py-0.5 font-medium' : 'text-sm px-3 py-1 font-black'} bg-gray-100 text-gray-700 border border-gray-200`}>SIZE: {c.size.label}</span>}
                                                                                {!c.size?.label && <span className={`${showCompletedOrders ? 'text-[12px] px-2 py-0.5 font-medium' : 'text-sm px-3 py-1 font-black'} bg-gray-100 text-gray-700 border border-gray-200`}>SIZE: Mặc định</span>}
                                                                                {c.sugar && <span className={`${showCompletedOrders ? 'text-[12px] px-2 py-0.5 font-medium' : 'text-sm px-3 py-1 font-black'} bg-amber-50 text-amber-700 border border-amber-200`}>ĐƯỜNG: {c.sugar}</span>}
                                                                                {c.ice && <span className={`${showCompletedOrders ? 'text-[12px] px-2 py-0.5 font-medium' : 'text-sm px-3 py-1 font-black'} bg-brand-50 text-brand-700 border border-brand-200`}>ĐÁ: {c.ice}</span>}
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex items-center justify-end gap-2 xl:gap-3 w-full sm:w-auto shrink-0 mt-2 sm:mt-0">
                                                                            {isEditing && (
                                                                                <button onClick={() => {
                                                                                    const updated = [...order.cartItems];
                                                                                    if (updated[idx].count > 1) {
                                                                                        updated[idx] = { ...updated[idx], count: updated[idx].count - 1 };
                                                                                    } else {
                                                                                        updated.splice(idx, 1);
                                                                                    }
                                                                                    updateOrder(order.id, updated);
                                                                                }} className="w-7 h-7 flex items-center justify-center bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-all rounded-none"><Minus size={12} /></button>
                                                                            )}
                                                                            <span className={`${showCompletedOrders ? 'font-medium text-[15px]' : 'font-black text-base'} text-gray-700`}>x{c.count}</span>
                                                                            {isEditing && (
                                                                                <button onClick={() => {
                                                                                    const updated = [...order.cartItems];
                                                                                    updated[idx] = { ...updated[idx], count: updated[idx].count + 1 };
                                                                                    updateOrder(order.id, updated);
                                                                                }} className="w-7 h-7 flex items-center justify-center bg-brand-600/10 text-brand-600 hover:bg-brand-600 hover:text-white transition-all rounded-none"><Plus size={12} /></button>
                                                                            )}
                                                                            <span className={`${showCompletedOrders ? 'font-medium text-[15px]' : 'font-black text-base'} text-[#C68E5E] min-w-[80px] text-right`}>{formatVND(c.totalPrice * c.count)}</span>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                                {order.note && <p className="text-sm italic text-amber-600 bg-amber-50 px-3 py-2 mt-2 ">"{order.note}"</p>}
                                                                {order.appliedPromoCode && (
                                                                    <div className="flex items-center gap-1 mt-2">
                                                                        <span className="text-[10px] bg-brand-100 text-brand-700 font-black px-2 py-1 uppercase tracking-wider flex items-center gap-1">
                                                                            <Gift size={10} /> KM: {order.appliedPromoCode}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Footer */}
                                                            <div className="px-5 pb-5 pt-3 border-t border-gray-100 space-y-3">
                                                                <div className="flex justify-between items-center">
                                                                    <span className="text-sm text-gray-400 font-bold uppercase">Tổng tiền</span>
                                                                    <span className="font-black text-xl text-[#C68E5E]">{formatVND(order.price)}</span>
                                                                </div>
                                                                {isUnpaid && !order.isDebt && (
                                                                    <div className={`grid gap-2 ${isPending && settings.requirePrepayment === false ? 'grid-cols-2' : 'grid-cols-3'}`}>
                                                                        <button onClick={() => { setEditOrder(order); setShowOrderPanel(true); }}
                                                                            className="bg-gray-100 text-gray-700 py-3 font-black text-xs flex items-center justify-center gap-1 transition-all border border-gray-200 hover:bg-gray-200 rounded-none">
                                                                            <Pencil size={16} /> SỬA
                                                                        </button>
                                                                        <button
                                                                            onClick={async () => {
                                                                                try {
                                                                                    if (activeQrOrderId === order.id) {
                                                                                        await fetch(`${SERVER_URL}/api/pos/checkout/stop`, { method: 'POST' });
                                                                                        setActiveQrOrderId(null);
                                                                                    } else {
                                                                                        await fetch(`${SERVER_URL}/api/pos/checkout/start`, {
                                                                                            method: 'POST',
                                                                                            headers: { 'Content-Type': 'application/json' },
                                                                                            body: JSON.stringify({ amount: order.price, orderId: order.id })
                                                                                        });
                                                                                        setActiveQrOrderId(order.id);
                                                                                    }
                                                                                } catch (err) {
                                                                                    console.error(err);
                                                                                }
                                                                            }}
                                                                            className={`py-3 font-black text-xs flex items-center justify-center gap-1 transition-all border rounded-none ${activeQrOrderId === order.id ? 'bg-brand-100 text-brand-700 border-brand-200' : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border-gray-200'}`}>
                                                                            <QrCode size={16} /> {activeQrOrderId === order.id ? 'TẮT QR' : 'MỞ QR'}
                                                                        </button>
                                                                        {!(isPending && settings.requirePrepayment === false) && (
                                                                            <button onClick={() => confirmPayment(order.id)} className="bg-brand-500 hover:bg-[#2EB350] text-white py-4 px-2 font-black text-xs uppercase tracking-widest flex items-center justify-center gap-1 transition-all shadow-lg shadow-green-500/20 active:scale-[0.98] rounded-none">
                                                                                <CheckCircle2 size={16} /> ĐÃ NHẬN TIỀN
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                )}
                                                                {order.isDebt && (
                                                                    <div className="mt-2">
                                                                        <button onClick={() => handlePayDebt(order.id)} className="w-full bg-purple-600 hover:bg-purple-700 text-white py-4 px-2 font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-lg rounded-none">
                                                                            <BookOpen size={18} /> THANH TOÁN NỢ
                                                                        </button>
                                                                    </div>
                                                                )}
                                                                {order.paymentReceipt && (
                                                                    <button onClick={() => setViewReceiptOrder(order)} className="w-full mt-2 bg-brand-50 hover:bg-brand-100 text-brand-700 py-3 font-black text-xs uppercase flex items-center justify-center gap-2 transition-all border border-brand-200 rounded-none">
                                                                        <Camera size={16} /> Xem Ủy Nhiệm Chi
                                                                    </button>
                                                                )}
                                                                {isPending && settings.requirePrepayment === false && isUnpaid ? (
                                                                    <div className="grid grid-cols-2 gap-2 mt-2">
                                                                        <button onClick={() => completeOrder(order.id)}
                                                                            className="bg-brand-600 text-white py-4 font-black text-sm flex items-center justify-center gap-1 hover:bg-[#0066DD] transition-all shadow-md rounded-none uppercase tracking-widest">
                                                                            <CheckCircle size={16} /> HOÀN TẤT
                                                                        </button>
                                                                        <button onClick={() => confirmPayment(order.id)}
                                                                            className="bg-brand-500 text-white py-4 font-black text-sm flex items-center justify-center gap-1 hover:bg-[#2EB350] transition-all shadow-md rounded-none uppercase tracking-widest">
                                                                            <CheckCircle2 size={16} /> ĐÃ NHẬN TIỀN
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    ((isPending && (isPaid || settings.requirePrepayment === false)) || (isPaid && order.status !== 'COMPLETED')) && (
                                                                        <div className="mt-2">
                                                                            <button onClick={() => completeOrder(order.id)}
                                                                                className="w-full bg-brand-600 text-white py-4 font-black text-lg flex items-center justify-center gap-2 hover:bg-[#0066DD] transition-all shadow-md rounded-none">
                                                                                <CheckCircle size={20} /> HOÀN TẤT
                                                                            </button>
                                                                        </div>
                                                                    )
                                                                )}
                                                                {showCompletedOrders && order.status === 'COMPLETED' && (
                                                                    <div className="mt-2 text-center">
                                                                        <button
                                                                            onClick={async () => {
                                                                                const selectedPrinter = localStorage.getItem('selectedPrinter');
                                                                                if (!window.require) {
                                                                                    showToast('Tính năng in chỉ có trên ứng dụng máy tính', 'error');
                                                                                    return;
                                                                                }
                                                                                if (!selectedPrinter) {
                                                                                    showToast('Chưa chọn máy in mặc định trong cài đặt', 'error');
                                                                                    return;
                                                                                }
                                                                                const { ipcRenderer } = window.require('electron');
                                                                                try {
                                                                                    const cartForPrint = order.cartItems || [];
                                                                                    const htmlContent = generateReceiptHTML(order, cartForPrint, settings, true);
                                                                                    await ipcRenderer.invoke('print-html', htmlContent, selectedPrinter, settings?.receiptPaperSize);
                                                                                    showToast('Đã gửi lệnh in lại bill', 'success');
                                                                                } catch (err) {
                                                                                    console.error('Lỗi in hóa đơn:', err);
                                                                                }
                                                                            }}
                                                                            className="w-full bg-brand-50 text-brand-700 py-3 font-black text-sm flex items-center justify-center gap-2 hover:bg-brand-100 transition-all border border-brand-200 mt-2 rounded-none">
                                                                            <Printer size={16} /> IN LẠI BILL
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ));
                                    })()}
                                    {orders.length === 0 && (
                                        <div className="w-full text-center py-28 bg-white border-2 border-dashed border-gray-200 rounded-none">
                                            <ClipboardCheck className="mx-auto mb-4 text-gray-200" size={56} strokeWidth={1} />
                                            <p className="text-gray-400 font-black uppercase tracking-widest text-sm">Hệ thống đang trống</p>
                                        </div>
                                    )}
                                </div>
                            </motion.section>
                        )}

                        {activeTab === 'menu' && (
                            <motion.section key="menu" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} className="space-y-6" style={{ paddingLeft: '32px', paddingRight: '32px' }}>
                                {/* Toolbar */}
                                <div className="flex flex-col xl:flex-row justify-between xl:items-center gap-4">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className="text-xl font-black text-gray-900">Thực đơn</h3>
                                            <div className="flex bg-gray-100 p-1 rounded-none">
                                                <button
                                                    onClick={() => setShowMenuTrash(false)}
                                                    className={`px-3 py-1 text-sm font-bold transition-all rounded-none ${!showMenuTrash ? 'bg-white shadow text-brand-600' : 'text-gray-500 hover:text-gray-700'}`}
                                                >
                                                    ĐANG BÁN
                                                </button>
                                                {userRole === 'ADMIN' && (
                                                    <button
                                                        onClick={() => setShowMenuTrash(true)}
                                                        className={`px-3 py-1 text-sm font-bold transition-all rounded-none ${showMenuTrash ? 'bg-white shadow text-red-500' : 'text-gray-500 hover:text-red-400'}`}
                                                    >
                                                        THÙNG RÁC
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <p className="text-xs text-gray-400 font-bold mt-0.5">
                                            {menu.length} món tổng hệ thống | Đang hiển thị: {showMenuTrash ? 'Thùng rác' : 'Menu chính'}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap flex-1 items-center gap-2">
                                        {/* View toggle */}
                                        <div className="flex bg-gray-100 p-1  gap-1">
                                            <button onClick={() => setViewMode('grid')} className={`p-2  transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-brand-600' : 'text-gray-400 hover:text-gray-600'}`}>
                                                <LayoutGrid size={16} />
                                            </button>
                                            <button onClick={() => setViewMode('list')} className={`p-2  transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-brand-600' : 'text-gray-400 hover:text-gray-600'}`}>
                                                <List size={16} />
                                            </button>
                                        </div>
                                        {userRole === 'ADMIN' && (
                                            <>
                                                <button onClick={handleAddNew} className="bg-brand-600 text-white px-5 py-2.5 font-black flex items-center gap-2 shadow-md hover:bg-[#0066DD] hover:scale-105 transition-all text-sm rounded-none">
                                                    <Plus size={16} /> THÊM MÓN
                                                </button>
                                                <button onClick={() => { setRecipeGuideSearch(''); setShowRecipeGuide(true); }} className="bg-white text-gray-800 border border-gray-300 px-4 py-2.5 font-black flex items-center gap-2 hover:bg-gray-50 transition-all text-sm rounded-none shadow-sm">
                                                    <ClipboardList size={16} /> XEM CÔNG THỨC
                                                </button>
                                                <button onClick={() => setShowCategoryManager(true)} className="bg-white text-gray-800 border border-gray-300 px-4 py-2.5 font-black flex items-center gap-2 hover:bg-gray-50 transition-all text-sm rounded-none shadow-sm">
                                                    <List size={16} /> QUẢN LÝ DANH MỤC
                                                </button>
                                                <label className="bg-white text-gray-800 border border-gray-300 px-4 py-2.5 font-black flex items-center gap-2 hover:bg-gray-50 transition-all text-sm cursor-pointer rounded-none shadow-sm">
                                                    <FileUp size={16} /> NHẬP DỮ LIỆU
                                                    <input type="file" className="hidden" accept=".json" onChange={handleImportJSON} />
                                                </label>
                                                <div className="flex items-center gap-2 border border-gray-300 px-3 py-1 bg-white ml-2 shadow-sm rounded-none" title="Cảnh báo số lượng món (tất cả các món)">
                                                    <span className="text-sm font-black text-gray-700 uppercase">CẢNH BÁO:</span>
                                                    <input
                                                        type="number"
                                                        className="w-12 text-center text-red-600 font-black outline-none bg-transparent"
                                                        value={settings?.warningThreshold !== undefined ? settings.warningThreshold : 2}
                                                        onChange={(e) => {
                                                            const newThreshold = parseInt(e.target.value, 10);
                                                            if (!isNaN(newThreshold)) {
                                                                const newSettings = { ...settings, warningThreshold: newThreshold };
                                                                setSettings(newSettings);
                                                                fetch(`${SERVER_URL}/api/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newSettings) });
                                                            }
                                                        }}
                                                    />
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Items grouped by category */}
                                {categories.map((cat, catIdx) => {
                                    const items = menu.filter(i => i.category === cat && (showMenuTrash ? i.isDeleted : !i.isDeleted));
                                    if (items.length === 0) return null;
                                    return (
                                        <div key={cat}>
                                            {/* Category header — dải màu nền + border-bottom đậm */}
                                            <div className="flex items-center gap-3 mb-4 px-4 py-3 bg-gray-300 border-l-4 border-l-[#007AFF] rounded-none shadow-sm">
                                                <h4 className="text-sm font-black uppercase tracking-[0.15em] text-gray-500">{cat}</h4>

                                                {/* UP/DOWN buttons if userRole === 'ADMIN' */}
                                                {userRole === 'ADMIN' && !showMenuTrash && (
                                                    <div className="flex items-center gap-1 ml-2">
                                                        <button
                                                            onClick={() => moveCategory(catIdx, -1)}
                                                            disabled={catIdx === 0}
                                                            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-none disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                                                            title="Chuyển lên"
                                                        >
                                                            <ArrowUp size={16} />
                                                        </button>
                                                        <button
                                                            onClick={() => moveCategory(catIdx, 1)}
                                                            disabled={catIdx === categories.length - 1}
                                                            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-none disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                                                            title="Chuyển xuống"
                                                        >
                                                            <ArrowDown size={16} />
                                                        </button>
                                                    </div>
                                                )}

                                                <div className="flex-1" />
                                                <span className="text-[10px] text-gray-800 font-bold bg-white px-2.5 py-1 rounded-none">{items.length} món</span>
                                            </div>

                                            <div
                                                className={viewMode === 'grid'
                                                    ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4 items-start'
                                                    : 'flex flex-col gap-2'
                                                }
                                            >
                                                {items.map((item, idx) => (
                                                    <motion.div
                                                        key={item.id}
                                                        layout
                                                        drag={!expandedItemId}
                                                        dragListener={!expandedItemId}
                                                        dragSnapToOrigin={true}
                                                        dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
                                                        dragElastic={1}
                                                        onDragStart={() => {
                                                            hasDraggedRef.current = false;
                                                            setDraggingId(item.id);
                                                        }}
                                                        onDragEnd={() => {
                                                            setDraggingId(null);
                                                            if (hasDraggedRef.current) {
                                                                handleReorderMenu(items, cat);
                                                                hasDraggedRef.current = false;
                                                            }
                                                        }}
                                                        onDrag={(e, info) => handle2DReorder(item, info, items, cat)}
                                                        data-reorder-id={item.id}
                                                        style={{
                                                            width: viewMode === 'list' ? '100%' : undefined,
                                                            zIndex: draggingId === item.id ? 100 : 1,
                                                            alignSelf: 'start',
                                                            touchAction: expandedItemId ? 'auto' : 'none',
                                                            WebkitTouchCallout: 'none'
                                                        }}
                                                        whileDrag={{
                                                            scale: 1.1,
                                                            zIndex: 200,
                                                            boxShadow: "0 30px 60px -12px rgba(0,0,0,0.3)"
                                                        }}
                                                        whileTap={{ cursor: 'grabbing' }}
                                                        transition={{
                                                            layout: { type: "spring", stiffness: 500, damping: 30, mass: 1 }
                                                        }}
                                                        className={`bg-white border overflow-hidden group ${!expandedItemId ? 'cursor-grab active:cursor-grabbing' : ''} ${expandedItemId === item.id ? 'border-brand-600/30 shadow-xl ring-1 ring-brand-600/10' : 'border-gray-100 shadow-sm hover:shadow-lg'}`}
                                                    >
                                                        {/* Item row — padding gọn hơn, hình ảnh tỉ lệ 1:1 */}
                                                        <div className={`flex items-stretch gap-4 p-4 select-none ${viewMode === 'list' ? 'py-3' : ''}`}>
                                                            <div className={`relative overflow-hidden flex-shrink-0 bg-gray-100 shadow-inner aspect-square ${viewMode === 'list' ? 'w-14' : 'w-24'}`}>
                                                                {item.image && <img src={getImageUrl(item.image)} className="w-full h-full object-cover" alt="" />}
                                                            </div>
                                                            <div className="flex-1 min-w-0 flex flex-col justify-start py-1">
                                                                <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest mb-0.5 opacity-50">{item.category}</p>
                                                                {/* Tên món — 1.1rem, bold */}
                                                                <h4 className="font-black text-gray-900 tracking-tight leading-snug" style={{ fontSize: '1.1rem' }}>{item.name}</h4>
                                                                {/* Giá — tương phản tốt */}
                                                                <p className="text-sm font-black text-[#C68E5E] mt-0.5">{formatVND(item.price)}</p>

                                                                {/* Action icons — Ẩn trên máy tính, hiện trên iPad, canh phải dưới cùng */}
                                                                <div className="flex gap-1.5 flex-wrap justify-end mt-auto pt-3 xl:opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                                                    {/* Conditional Action Buttons based on Trash mode */}
                                                                    {showMenuTrash ? (
                                                                        <>
                                                                            {userRole === 'ADMIN' && (
                                                                                <>
                                                                                    <button onClick={(e) => { e.stopPropagation(); restoreMenuItem(item.id); }} className="p-2 xl:p-3.5 bg-brand-50 text-brand-600 hover:bg-brand-100 border border-transparent transition-all font-bold text-[10px] xl:text-xs" title="Khôi phục món">
                                                                                        KHÔI PHỤC
                                                                                    </button>
                                                                                    <button onClick={(e) => { e.stopPropagation(); deleteMenuItem(item.id); }} className="p-2 xl:p-3.5 bg-red-50 text-red-500 hover:bg-red-100 border border-transparent transition-all" title="Xóa vĩnh viễn">
                                                                                        <Trash2 size={16} className="xl:w-[18px] xl:h-[18px]" />
                                                                                    </button>
                                                                                </>
                                                                            )}
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <button onClick={(e) => { e.stopPropagation(); handleMoveVertical(item, -1, cat); }} className="p-2 xl:p-3.5 bg-gray-100 text-gray-500 hover:bg-gray-200 border border-transparent transition-all" title="Chuyển lên">
                                                                                <ArrowUp size={16} className="xl:w-[18px] xl:h-[18px]" />
                                                                            </button>
                                                                            <button onClick={(e) => { e.stopPropagation(); handleMoveVertical(item, 1, cat); }} className="p-2 xl:p-3.5 bg-gray-100 text-gray-500 hover:bg-gray-200 border border-transparent transition-all" title="Chuyển xuống">
                                                                                <ArrowDown size={16} className="xl:w-[18px] xl:h-[18px]" />
                                                                            </button>
                                                                            <button onClick={(e) => { e.stopPropagation(); setRecipeGuideSearch(item.name); setShowRecipeGuide(true); }} className="p-2 xl:p-3.5 bg-brand-50 text-brand-600 hover:bg-brand-100 border border-transparent transition-all" title="Xem công thức">
                                                                                <BookOpen size={16} className="xl:w-[18px] xl:h-[18px]" />
                                                                            </button>
                                                                            <button onClick={(e) => { e.stopPropagation(); duplicateMenuItem(item); }} className="p-2 xl:p-3.5 bg-gray-100 text-gray-500 hover:bg-gray-200 border border-transparent transition-all" title="Nhân bản món">
                                                                                <Copy size={16} className="xl:w-[18px] xl:h-[18px]" />
                                                                            </button>
                                                                            {userRole === 'ADMIN' && (
                                                                                <button
                                                                                    onClick={(e) => { e.stopPropagation(); toggleExpand(item.id); }}
                                                                                    className={`p-2 xl:p-3.5 transition-all border ${expandedItemId === item.id ? 'bg-gray-900 text-white border-gray-900' : 'bg-gray-200 text-gray-600 border-transparent hover:bg-gray-300'}`}
                                                                                    title="Chỉnh sửa món"
                                                                                >
                                                                                    <Pencil size={16} className="xl:w-[18px] xl:h-[18px]" />
                                                                                </button>
                                                                            )}
                                                                            {userRole === 'ADMIN' && (
                                                                                <button onClick={(e) => { e.stopPropagation(); deleteMenuItem(item.id); }} className="p-2 xl:p-3.5 bg-red-50 text-red-500 hover:bg-red-100 border border-transparent transition-all" title="Xóa món">
                                                                                    <Trash2 size={16} className="xl:w-[18px] xl:h-[18px]" />
                                                                                </button>
                                                                            )}
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Inline editor */}
                                                        <AnimatePresence>
                                                            {expandedItemId === item.id && (
                                                                <InlineEditPanel
                                                                    item={item}
                                                                    inventory={inventory}
                                                                    inventoryStats={inventoryStats}
                                                                    settings={settings}
                                                                    stats30Days={stats30Days}
                                                                    totalFixed={totalFixed}
                                                                    onSave={saveMenuItem}
                                                                    onCancel={() => {
                                                                        setExpandedItemId(null);
                                                                    }}
                                                                    onDraftChange={(d) => {
                                                                        inlineDraftRef.current = d;
                                                                    }}
                                                                />
                                                            )}
                                                        </AnimatePresence>
                                                    </motion.div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </motion.section>
                        )}

                        {activeTab === 'tables' && (
                            <motion.section key="tables" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} className="space-y-6" style={{ paddingLeft: '32px', paddingRight: '32px' }}>
                                <div className="flex justify-between items-center px-1">
                                    <div>
                                        <h3 className="text-xl font-black text-gray-900">Sơ đồ bàn</h3>
                                        <p className="text-xs text-gray-400 font-bold mt-0.5">{tables.length} vị trí · Phân theo khu vực</p>
                                    </div>
                                    <div className="flex gap-3">
                                        <div className="flex items-center gap-4 bg-white px-5 py-2.5  border border-gray-100 shadow-sm text-[10px] font-black uppercase tracking-widest text-gray-400">
                                            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5  bg-gray-200" /> Trống</div>
                                            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5  bg-orange-400" /> Đang dùng</div>
                                            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5  bg-brand-500" /> Đã đặt</div>
                                        </div>
                                        <button onClick={() => setEditTable({})} className="bg-gray-900 text-white px-8 py-4  font-black flex items-center gap-2 shadow-xl hover:scale-105 transition-all text-sm uppercase tracking-widest">
                                            <Plus size={18} /> THÊM BÀN
                                        </button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 xl:grid-cols-8 gap-5">
                                    {tables.map(table => {
                                        const activeOrder = orders.find(o => o.tableId === table.id && o.status !== 'COMPLETED' && o.status !== 'CANCELLED');
                                        const computedStatus = activeOrder ? 'Occupied' : table.status;

                                        if (computedStatus === 'Occupied' && activeOrder) {
                                            const isUnpaid = !activeOrder.isPaid;
                                            const isPaid = activeOrder.isPaid;
                                            const isPending = activeOrder.status === 'PENDING';

                                            return (
                                                <button key={table.id}
                                                    onClick={() => setActionTable({ ...table, computedStatus, activeOrder })}
                                                    className="bg-white p-3 border-2 border-orange-400 shadow-xl ring-2 ring-orange-50 hover:border-brand-600 transition-all aspect-square min-h-[140px] flex flex-col justify-between overflow-hidden group relative text-left">
                                                    <div className="absolute inset-0 opacity-5 pointer-events-none bg-orange-500" />
                                                    {/* Header */}
                                                    <div className="flex justify-between items-start w-full relative z-10">
                                                        <div className="flex flex-col">
                                                            <div className="flex items-center gap-1.5">
                                                                <div className="w-10 h-10 flex items-center justify-center font-black text-lg shadow-inner bg-orange-500 text-white rounded-none">
                                                                    {table.name}
                                                                </div>
                                                                <button onClick={(e) => { e.stopPropagation(); setEditTable(table); }} className="p-1.5 text-orange-400 hover:bg-orange-100 hover:text-orange-600 rounded-none transition-all outline-none opacity-50 hover:opacity-100">
                                                                    <Settings size={16} />
                                                                </button>
                                                            </div>
                                                            <span className="font-extrabold text-[9px] text-gray-500 uppercase tracking-widest mt-1.5">{table.area}</span>
                                                        </div>
                                                        <div className="flex flex-col items-end">
                                                            <span className="text-[10px] bg-orange-100 text-orange-600 px-2 py-0.5 font-black uppercase tracking-widest rounded-none shadow-sm">
                                                                #{activeOrder.queueNumber}
                                                            </span>
                                                            <span className="text-[9px] font-bold text-gray-400 mt-0.5">
                                                                {new Date(activeOrder.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    {/* Order Line Items Truncated */}
                                                    <div className="flex-1 w-full my-2 overflow-hidden flex flex-col justify-center relative z-10 gap-1.5">
                                                        {(activeOrder.cartItems || []).slice(0, 3).map((c, idx) => (
                                                            <div key={idx} className="flex flex-col border-b border-orange-50/50 pb-1 last:border-0 last:pb-0">
                                                                <div className="font-bold text-[10px] text-gray-800 leading-tight truncate">
                                                                    <span className="text-orange-600 mr-1">{c.count}x</span>{c.isGift ? '(KM) ' : ''}{c.item?.name || c.name || 'Món'}
                                                                </div>
                                                                <div className="flex flex-wrap gap-1 mt-0.5 pl-3">
                                                                    <span className="text-[8px] bg-gray-100 px-1 py-0.5 font-bold text-gray-600 rounded-none">S: {c.size?.label || 'Mặc định'}</span>
                                                                    {c.sugar && <span className="text-[8px] bg-amber-50 px-1 py-0.5 font-bold text-amber-700 border border-amber-100/50 rounded-none">Đường: {c.sugar}</span>}
                                                                    {c.ice && <span className="text-[8px] bg-brand-50 px-1 py-0.5 font-bold text-brand-700 border border-brand-100/50 rounded-none">Đá: {c.ice}</span>}
                                                                </div>
                                                                {c.note && <div className="text-[8px] italic text-gray-400 pl-3 mt-0.5 truncate shrink-0">"{c.note}"</div>}
                                                            </div>
                                                        ))}
                                                        {(activeOrder.cartItems || []).length > 3 && (
                                                            <div className="text-[9px] italic text-gray-400 font-bold mt-0.5">
                                                                +{(activeOrder.cartItems || []).length - 3} món khác...
                                                            </div>
                                                        )}
                                                    </div>
                                                    {/* Footer Price */}
                                                    <div className="w-full pt-1.5 border-t border-orange-100 flex justify-between items-center relative z-10 mt-auto">
                                                        <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">TỔNG</span>
                                                        <span className="font-black text-xs text-[#C68E5E]">{formatVND(activeOrder.price)}</span>
                                                    </div>
                                                </button>
                                            );
                                        }

                                        return (
                                            <button key={table.id}
                                                onClick={() => setActionTable({ ...table, computedStatus, activeOrder })}
                                                className={`bg-white border-2 border-transparent hover:border-brand-600 hover:shadow-xl transition-all relative overflow-hidden group flex flex-col items-center justify-center gap-2 aspect-square p-6`}>
                                                <div className={`absolute inset-0 opacity-5 pointer-events-none ${computedStatus === 'Occupied' ? 'bg-orange-500' : computedStatus === 'Reserved' ? 'bg-brand-500' : 'bg-gray-200'}`} />
                                                <button onClick={(e) => { e.stopPropagation(); setEditTable(table); }} className="absolute top-2 right-2 p-1.5 text-gray-300 hover:text-gray-600 hover:bg-gray-100 rounded-none transition-all opacity-0 group-hover:opacity-100 outline-none">
                                                    <Settings size={14} />
                                                </button>
                                                <div className={`w-14 h-14 flex items-center justify-center font-black text-lg shadow-inner ${computedStatus === 'Reserved' ? 'bg-brand-100 text-brand-600' : 'bg-gray-100 text-gray-400'}`}>
                                                    {table.name}
                                                </div>
                                                <div>
                                                    <p className="font-extrabold text-xs text-gray-900 uppercase tracking-tighter">{table.area}</p>
                                                    <p className={`text-[9px] font-black uppercase tracking-widest mt-0.5 ${computedStatus === 'Reserved' ? 'text-brand-500' : 'text-gray-300'}`}>
                                                        {computedStatus === 'Reserved' ? 'ĐÃ ĐẶT' : 'TRỐNG'}
                                                    </p>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </motion.section>
                        )}

                        {activeTab === 'promotions' && settings.enablePromotions && (
                            <motion.section key="promotions" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} className="space-y-6" style={{ paddingLeft: '32px', paddingRight: '32px' }}>
                                {/* Toolbar */}
                                <div className="flex justify-between items-center">
                                    <h3 className="text-xl font-black text-gray-900 flex items-center gap-2"><Gift className="text-brand-600" /> Quản Lý Khuyến Mãi</h3>
                                    <button onClick={() => setEditPromo({ type: 'PROMO_CODE', discountType: 'PERCENT', discountValue: 0, minOrderValue: 0, isActive: true, applicableItems: ['ALL'] })} className="bg-brand-600 text-white px-4 py-2 rounded-none border-b-4 border-brand-700 font-bold active:translate-y-1 active:border-b-0 hover:bg-brand-600 transition-all flex items-center gap-2">
                                        <Plus size={18} /> THÊM MỚI
                                    </button>
                                </div>

                                {promotions.length === 0 ? (
                                    <div className="py-20 flex flex-col items-center justify-center text-gray-400">
                                        <Gift size={64} className="mb-4 opacity-50 text-gray-300" />
                                        <h3 className="text-xl font-bold text-gray-500 mb-2">Chưa có khuyến mãi nào!</h3>
                                        <p className="text-sm">Bấm THÊM MỚI để tạo chương trình giảm giá đầu tiên.</p>
                                    </div>
                                ) : (
                                    <div className="flex flex-wrap gap-5 px-1">
                                        {promotions.map(p => (
                                            <div key={p.id} className="bg-white rounded-none shadow-md border border-gray-100 flex flex-col hover:shadow-lg transition-all group overflow-hidden w-48 shrink-0">
                                                {/* Header */}
                                                <div className="flex w-full items-center justify-between px-[8px] pt-[8px] pb-1 shrink-0">
                                                    <div className="flex gap-[6px] pl-1">
                                                        <span className="bg-brand-500 inline-block w-[10px] h-[10px] rounded-none"></span>
                                                        <span className="bg-brand-500 inline-block w-[10px] h-[10px] rounded-none"></span>
                                                        <span className="bg-pink-500 inline-block w-[10px] h-[10px] rounded-none"></span>
                                                    </div>
                                                    <div className="scale-90 origin-right">
                                                        <CustomSwitch isOn={p.isActive} onToggle={() => savePromotion({ ...p, isActive: !p.isActive })} />
                                                    </div>
                                                </div>

                                                {/* Content */}
                                                <div className="px-[12px] pb-[12px] pt-1 flex flex-col justify-between flex-1">
                                                    <div className="pb-2">
                                                        <div className="mb-2">
                                                            <span className="text-[9px] font-black px-1.5 py-0.5 bg-brand-50 text-brand-600 rounded-none uppercase tracking-wider">{p.type === 'PROMO_CODE' ? 'MÃ GIẢM GIÁ' : p.type === 'COMBO_GIFT' ? 'TẶNG QUÀ ĐƠN' : p.type === 'HAPPY_HOUR' ? 'GIỜ VÀNG' : 'MUA X TẶNG Y'}</span>
                                                        </div>
                                                        <h4 className="font-black text-gray-900 mb-1 leading-tight text-sm line-clamp-2" title={p.name}>{p.name}</h4>

                                                        {p.code && <p className="text-[10px] font-black text-brand-600 mt-1.5 mb-1 bg-brand-50 px-2 py-1 w-max rounded-none border border-brand-200 leading-none">MÃ: {p.code}</p>}
                                                        {p.ignoreGlobalDisable && <p className="text-[9px] font-black text-white mt-1 mb-1 bg-red-500 px-2 py-1 w-max rounded-none leading-none tracking-wider shadow-sm">LUÔN HOẠT ĐỘNG</p>}
                                                        {p.dailyLimit > 0 && <p className="text-[9px] font-bold text-gray-600 mt-1 mb-1 bg-gray-100 px-2 py-1 w-max rounded-none border border-gray-200 leading-none">Dùng hôm nay: {(p.usageHistory && p.usageHistory[getVNDateStr()]) || 0}/{p.dailyLimit}</p>}
                                                        {p.type === 'PROMO_CODE' && <p className="text-[11px] text-gray-600 mt-1">Giảm: <span className="font-bold text-gray-900">{p.discountType === 'PERCENT' ? `${p.discountValue}%` : `${p.discountValue}k`}</span> {p.maxDiscount > 0 && `(Max: ${p.maxDiscount}k)`}</p>}
                                                        {p.minOrderValue > 0 && <p className="text-[11px] text-gray-600 mt-0.5">Đơn TT: <span className="font-bold text-gray-900">{p.minOrderValue}k</span></p>}
                                                        {(p.giftItems || []).length > 0 && <p className="text-[11px] text-green-600 mt-0.5 font-bold">+ Tặng {p.giftItems.length} món</p>}
                                                    </div>
                                                    <div className="mt-2 pt-2 border-t border-gray-50 flex items-center justify-between gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                                        <button onClick={() => setEditPromo(p)} className="text-brand-600 bg-brand-50 font-bold px-2 py-1.5 text-[9px] tracking-widest uppercase hover:bg-brand-600 hover:text-white rounded-none transition-colors flex-1 text-center">SỬA</button>
                                                        <button onClick={() => { if (window.confirm('Xóa CTKM này?')) deletePromotion(p.id) }} className="text-red-500 bg-red-50 font-bold px-2 py-1.5 text-[9px] tracking-widest uppercase hover:bg-red-500 hover:text-white rounded-none transition-colors flex-1 text-center">XÓA</button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </motion.section>
                        )}

                        {activeTab === 'inventory' && (
                            <motion.section key="inventory" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} className="space-y-6" style={{ paddingLeft: '32px', paddingRight: '32px' }}>
                                {/* Toolbar */}
                                <div className="flex justify-between items-center gap-2 border-b border-gray-200 pb-4">
                                    <div>
                                        <h3 className="text-xl font-black text-gray-900">Chi phí & Kho</h3>
                                        <div className="flex gap-6 mt-4 items-center">
                                            <button onClick={() => setInventorySubTab('import')} className={`font-black text-sm pb-2 border-b-2 transition-all ${inventorySubTab === 'import' ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                                                LỊCH SỬ NHẬP KHO
                                            </button>
                                            <button onClick={() => setInventorySubTab('raw')} className={`font-black text-sm pb-2 border-b-2 transition-all ${inventorySubTab === 'raw' ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                                                NGUYÊN LIỆU ({inventory.length})
                                            </button>
                                            <button onClick={() => setInventorySubTab('fixed')} className={`font-black text-sm pb-2 border-b-2 transition-all ${inventorySubTab === 'fixed' ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                                                ĐẦU TƯ & CHI PHÍ
                                            </button>
                                            {inventorySubTab === 'import' && (
                                                <button
                                                    onClick={() => setShowImportTrash(!showImportTrash)}
                                                    className={`text-[10px] uppercase font-black px-3 py-1 mb-2 ml-2 rounded-none transition-all ${showImportTrash ? 'bg-red-50 text-red-500 shadow-sm' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'}`}
                                                >
                                                    {showImportTrash ? 'ĐANG HIỂN THỊ THÙNG RÁC' : 'THÙNG RÁC'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {/* Report Mode Switcher */}
                                        <div className="flex bg-gray-100 p-1 rounded-none">
                                            <button onClick={() => setInventoryReportMode('standard')}
                                                className={`px-4 py-1.5 rounded-none text-[10px] font-black uppercase tracking-widest transition-all ${inventoryReportMode === 'standard' ? 'bg-white text-brand-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
                                                Mặc định
                                            </button>
                                            <button onClick={() => setInventoryReportMode('calendar')}
                                                className={`px-4 py-1.5 rounded-none text-[10px] font-black uppercase tracking-widest transition-all ${inventoryReportMode === 'calendar' ? 'bg-white text-brand-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
                                                Theo Lịch
                                            </button>
                                        </div>

                                        {inventoryReportMode === 'standard' ? (
                                            <div className="flex bg-gray-100 p-1 rounded-none">
                                                {[
                                                    { id: 'today', label: 'Hôm nay' },
                                                    { id: 'week', label: '7 ngày' },
                                                    { id: 'month', label: '30 ngày' },
                                                    { id: 'all', label: 'Tất cả' }
                                                ].map(p => (
                                                    <button key={p.id} onClick={() => setInventoryPeriod(p.id)}
                                                        className={`px-4 py-1.5 rounded-none text-[10px] font-black uppercase tracking-widest transition-all ${inventoryPeriod === p.id ? 'bg-white text-brand-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
                                                        {p.label}
                                                    </button>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-none">
                                                <select value={calType} onChange={e => setCalType(e.target.value)} className="bg-transparent text-[10px] font-black uppercase outline-none px-2 text-gray-600">
                                                    <option value="month">Tháng</option>
                                                    <option value="quarter">Quý</option>
                                                    <option value="year">Năm</option>
                                                </select>
                                                <div className="w-[1px] h-4 bg-gray-200" />
                                                {calType === 'month' && (
                                                    <select value={selectedMonth} onChange={e => setSelectedMonth(parseInt(e.target.value))} className="bg-transparent text-[10px] font-black outline-none px-2 text-brand-600">
                                                        {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                                            <option key={m} value={m}>Tháng {m}</option>
                                                        ))}
                                                    </select>
                                                )}
                                                {calType === 'quarter' && (
                                                    <select value={selectedQuarter} onChange={e => setSelectedQuarter(parseInt(e.target.value))} className="bg-transparent text-[10px] font-black outline-none px-2 text-brand-600">
                                                        {[1, 2, 3, 4].map(q => <option key={q} value={q}>Quý {q}</option>)}
                                                    </select>
                                                )}
                                                <select value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))} className="bg-transparent text-[10px] font-black outline-none px-2 text-brand-600">
                                                    {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                                                </select>
                                            </div>
                                        )}

                                        <div className="flex gap-2">
                                            <button onClick={() => {
                                                const headers = ["Nguyên liệu", "Tồn kho", "Đơn vị", "Đã dùng", "Giá trị tiêu thụ", "Tổng nhập"];
                                                const body = inventoryStats.map(s => {
                                                    const usedQty = inventoryReportMode === 'calendar' ? s.usageQty : (inventoryPeriod === 'today' ? s.use1 : inventoryPeriod === 'week' ? s.use7 : s.use30);
                                                    const usedCost = inventoryReportMode === 'calendar' ? s.usageCost : (inventoryPeriod === 'today' ? s.cost1 : inventoryPeriod === 'week' ? s.cost7 : s.cost30);
                                                    const impCost = inventoryReportMode === 'calendar' ? s.importCost : (inventoryPeriod === 'today' ? s.imp1 : inventoryPeriod === 'week' ? s.imp7 : s.imp30);
                                                    return [s.name, s.stock, s.unit, usedQty, usedCost * 1000, impCost * 1000].join(",");
                                                });
                                                const csv = [headers.join(","), ...body].join("\n");
                                                const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
                                                const url = URL.createObjectURL(blob);
                                                const link = document.createElement("a");
                                                link.href = url;
                                                link.download = `Bao-cao-kho-${inventoryPeriod}-${new Date().toLocaleDateString()}.csv`;
                                                link.click();
                                            }} className="bg-white text-gray-600 border border-gray-200 px-4 py-2.5 font-black text-[10px] uppercase rounded-none hover:bg-gray-50 transition-all flex items-center gap-2">
                                                <FileUp size={14} /> XUẤT CSV
                                            </button>
                                            {inventorySubTab === 'fixed' ? (
                                                <button onClick={() => setEditExpense({})} className="bg-brand-600 text-white px-5 py-2.5 font-black flex items-center gap-2 shadow-lg hover:shadow-[#007AFF]/20 hover:scale-105 transition-all text-sm uppercase tracking-widest rounded-none">
                                                    <Plus size={16} /> GHI PHIẾU CHI
                                                </button>
                                            ) : (
                                                <button onClick={() => setEditImport({})} className="bg-brand-600 text-white px-5 py-2.5 font-black flex items-center gap-2 shadow-lg hover:shadow-[#007AFF]/20 hover:scale-105 transition-all text-sm uppercase tracking-widest rounded-none">
                                                    <Plus size={16} /> LẬP PHIẾU NHẬP
                                                </button>
                                            )}
                                            <button onClick={() => {
                                                setProductionOutputItem('');
                                                setProductionOutputUnit('');
                                                setProductionOutputQty('');
                                                setProductionInputs([{ id: '', qty: '' }]);
                                                setShowProductionModal(true);
                                            }} className="bg-orange-500 text-white px-5 py-2.5 font-black flex items-center gap-2 shadow-lg hover:shadow-orange-500/20 hover:scale-105 transition-all text-sm uppercase tracking-widest rounded-none hidden sm:flex">
                                                <RefreshCw size={16} /> CHẾ BIẾN BTP
                                            </button>
                                            <button onClick={() => setShowAuditModal(true)} className="bg-brand-600 text-white px-5 py-2.5 font-black flex items-center gap-2 shadow-lg hover:shadow-brand-600/20 hover:scale-105 transition-all text-sm uppercase tracking-widest rounded-none">
                                                <CheckCircle size={16} /> KIỂM KHO
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Inventory Summary Cards */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    {[
                                        {
                                            label: 'Tổng tiền nhập kho',
                                            icon: <ArrowDownLeft size={20} />,
                                            color: 'red',
                                            value: inventoryStats.reduce((sum, s) => {
                                                const val = inventoryReportMode === 'calendar' ? (s.importCost || 0) : (inventoryPeriod === 'today' ? s.imp1 : inventoryPeriod === 'week' ? s.imp7 : inventoryPeriod === 'month' ? s.imp30 : s.impAll);
                                                return sum + val;
                                            }, 0)
                                        },
                                        {
                                            label: 'Chi phí NL đã dùng',
                                            icon: <ArrowUpRight size={20} />,
                                            color: 'amber',
                                            value: inventoryStats.reduce((sum, s) => {
                                                const val = inventoryReportMode === 'calendar' ? (s.usageCost || 0) : (inventoryPeriod === 'today' ? s.cost1 : inventoryPeriod === 'week' ? s.cost7 : inventoryPeriod === 'month' ? s.cost30 : s.costAll);
                                                return sum + val;
                                            }, 0)
                                        },
                                        {
                                            label: 'Giá trị tồn kho hiện tại',
                                            icon: <Database size={20} />,
                                            color: 'blue',
                                            value: inventoryStats.reduce((sum, s) => sum + (s.stock * s.avgCost), 0)
                                        }
                                    ].map((card, i) => (
                                        <div key={i} className="bg-white p-6 border border-gray-100 shadow-sm flex items-center justify-between group hover:shadow-md transition-all">
                                            <div className="space-y-1">
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{card.label}</p>
                                                <p className={`text-2xl font-black text-${card.color}-600`}>{formatVND(card.value)}</p>
                                            </div>
                                            <div className={`p-4 bg-${card.color}-50 text-${card.color}-600 rounded-none transform group-hover:scale-110 transition-transform`}>
                                                {card.icon}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {inventorySubTab === 'import' && (
                                    <div className="space-y-4">
                                        {/* Mass Import / Export Dashboard Box */}
                                        <div className="flex justify-between items-center bg-brand-50/50 p-6 border border-brand-100 shadow-sm rounded-none col-span-full">
                                            <div className="flex flex-col">
                                                <h4 className="font-black text-sm text-brand-600 uppercase tracking-widest flex items-center gap-2">
                                                    <FileUp size={16} /> Quản lý Phiếu Nhập Hàng Loạt bằng CSV
                                                </h4>
                                                <p className="text-xs text-brand-900/60 font-medium mt-1">Sử dụng định dạng file bảng tính .CSV (mở bằng Microsoft Excel) để thêm mới nhiều Phiếu Nhập cùng lúc.</p>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <button onClick={handleDownloadInventoryTemplate} className="bg-white text-brand-600 border-2 border-brand-600 px-6 py-3 font-black text-[11px] uppercase tracking-widest hover:bg-brand-50 transition-all flex items-center gap-2">
                                                    <Download size={16} /> MẪU NHẬP KHO HÀNG LOẠT
                                                </button>
                                                <label className="bg-brand-600 border-2 border-brand-600 text-white px-6 py-3 font-black text-[11px] uppercase tracking-widest hover:bg-[#0066DD] transition-all flex items-center gap-2 cursor-pointer shadow-md">
                                                    <Upload size={16} /> IMPORT HÀNG LOẠT
                                                    <input type="file" accept=".csv" className="hidden" onChange={handleImportInventoryCSV} />
                                                </label>
                                            </div>
                                        </div>

                                        <div className="bg-white  border border-gray-100 shadow-sm overflow-hidden rounded-none">
                                            <table className="w-full text-left">
                                                <thead>
                                                    <tr className="bg-gray-200 border-b border-gray-300">
                                                        <th className="px-5 py-4 text-[14px] font-bold text-gray-700 uppercase tracking-widest">Thời gian</th>
                                                        <th className="px-5 py-4 text-[14px] font-bold text-gray-700 uppercase tracking-widest">Nguyên liệu</th>
                                                        <th className="px-5 py-4 text-[14px] font-bold text-brand-600 uppercase tracking-widest text-right">Quy cách</th>
                                                        <th className="px-5 py-4 text-[14px] font-bold text-brand-600 uppercase tracking-widest text-right">Đã cộng kho</th>
                                                        <th className="px-5 py-4 text-[14px] font-bold text-red-500 uppercase tracking-widest text-right">Tổng chi phí</th>
                                                        <th className="px-5 py-4 text-[14px] font-bold text-[#C68E5E] uppercase tracking-widest text-right">Giá / Quy cách</th>
                                                        <th className="w-12"></th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-50">
                                                    {[...imports].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                                                        .filter(item => showImportTrash ? item.isDeleted : !item.isDeleted)
                                                        .filter(item => {
                                                            const date = new Date(item.timestamp);
                                                            if (inventoryReportMode === 'standard') {
                                                                const now = new Date();
                                                                if (inventoryPeriod === 'today') return date.toDateString() === now.toDateString();
                                                                if (inventoryPeriod === 'week') {
                                                                    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                                                                    return date >= weekAgo;
                                                                }
                                                                if (inventoryPeriod === 'month') {
                                                                    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                                                                    return date >= monthAgo;
                                                                }
                                                                return true;
                                                            } else {
                                                                // Calendar mode filtering
                                                                const reportYear = date.getFullYear();
                                                                const reportMonth = date.getMonth() + 1;
                                                                if (calType === 'month') {
                                                                    return reportYear === selectedYear && reportMonth === selectedMonth;
                                                                } else if (calType === 'quarter') {
                                                                    const quarter = Math.floor((reportMonth - 1) / 3) + 1;
                                                                    return reportYear === selectedYear && quarter === selectedQuarter;
                                                                } else if (calType === 'year') {
                                                                    return reportYear === selectedYear;
                                                                }
                                                                return true;
                                                            }
                                                        })
                                                        .map(item => {
                                                            const isLegacy = !item.ingredientName;
                                                            const invName = isLegacy ? (inventory.find(i => i.id === item.ingredientId)?.name || 'Không rõ') : item.ingredientName;
                                                            const invUnit = isLegacy ? (inventory.find(i => i.id === item.ingredientId)?.unit || '') : item.baseUnit;

                                                            return (
                                                                <tr key={item.id} className={`hover:bg-gray-50/50 transition-colors ${item.isDeleted ? 'opacity-60 bg-gray-50' : ''}`}>
                                                                    <td className="px-5 py-4 font-normal text-[12px] text-gray-500 whitespace-nowrap">{new Date(item.timestamp).toLocaleString('vi-VN')}</td>
                                                                    <td className="px-5 py-4 font-normal text-[12px] text-gray-900">
                                                                        {editingIngId === item.ingredientId ? (
                                                                            <div className="flex items-center gap-2">
                                                                                <input
                                                                                    autoFocus
                                                                                    type="text"
                                                                                    value={editingIngName}
                                                                                    onChange={(e) => setEditingIngName(e.target.value)}
                                                                                    onKeyDown={(e) => {
                                                                                        if (e.key === 'Enter') handleRenameIngredient(item.ingredientId, editingIngName);
                                                                                        if ((e.key === 'Escape' || (e.key === 'Backspace' && !isInputFocused()))) setEditingIngId(null);
                                                                                    }}
                                                                                    className="border-2 border-brand-600 px-3 py-1 text-sm outline-none w-full font-normal"
                                                                                />
                                                                                <button
                                                                                    onClick={() => handleRenameIngredient(item.ingredientId, editingIngName)}
                                                                                    className="bg-brand-600 hover:bg-[#0066DD] text-white p-1 rounded-none"
                                                                                >
                                                                                    <CheckCircle2 size={16} />
                                                                                </button>
                                                                            </div>
                                                                        ) : (
                                                                            <div className="flex flex-col">
                                                                                <div className="group/name flex items-center gap-2">
                                                                                    <span className="font-bold tracking-tight text-[12px]">{invName}</span>
                                                                                    <button
                                                                                        onClick={() => {
                                                                                            setEditingIngId(item.ingredientId);
                                                                                            setEditingIngName(invName);
                                                                                        }}
                                                                                        className="opacity-0 group-hover/name:opacity-100 p-1 text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-all rounded-none"
                                                                                    >
                                                                                        <Pencil size={14} />
                                                                                    </button>
                                                                                </div>
                                                                                {(() => {
                                                                                    const stat = inventoryStats.find(s => s.id === item.ingredientId);
                                                                                    if (stat && stat.avgCost > 0) {
                                                                                        return (
                                                                                            <span className="text-[10px] text-gray-400 font-normal mt-0.5 max-w-[150px] truncate block" title={`TB: ${formatVND(stat.avgCost)}/${invUnit}`}>
                                                                                                Giá TB: {formatVND(stat.avgCost)}/{invUnit}
                                                                                            </span>
                                                                                        );
                                                                                    }
                                                                                    return null;
                                                                                })()}
                                                                            </div>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-5 py-4 text-right font-normal text-[12px] text-gray-600">
                                                                        {isLegacy ? '-' : `${item.quantity} ${item.importUnit} (x${item.volumePerUnit}${item.baseUnit})`}
                                                                    </td>
                                                                    <td className="px-5 py-4 text-right font-normal text-[12px] text-brand-600 bg-brand-50/20">
                                                                        +{isLegacy ? item.quantity : item.addedStock} <span className="text-[12px] font-normal text-brand-400">{invUnit}</span>
                                                                    </td>
                                                                    <td className="px-5 py-4 text-right font-normal text-[12px] text-red-500">
                                                                        -{formatVND(isLegacy ? item.cost : item.totalCost)}
                                                                    </td>
                                                                    <td className="px-5 py-4 text-right font-normal text-[12px] text-[#C68E5E] bg-orange-50/20">
                                                                        {isLegacy ? (item.quantity > 0 ? formatVND(item.cost / item.quantity) : '-') : formatVND(item.costPerUnit)}
                                                                        <span className="text-[12px] text-gray-400"> / {isLegacy ? invUnit : item.importUnit}</span>
                                                                    </td>
                                                                    <td className="px-2 py-4 text-right">
                                                                        {!item.isDeleted && (
                                                                            <button onClick={() => handleDeleteImport(item.id)} className="text-gray-300 hover:text-red-500 p-2 transition-colors rounded-none hover:bg-red-50" title="Đưa vào thùng rác">
                                                                                <Trash2 size={16} />
                                                                            </button>
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            )
                                                        })}
                                                    {imports.filter(item => {
                                                        const date = new Date(item.timestamp);
                                                        if (inventoryReportMode === 'standard') {
                                                            const now = new Date();
                                                            if (inventoryPeriod === 'today') return date.toDateString() === now.toDateString();
                                                            if (inventoryPeriod === 'week') { const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); return date >= weekAgo; }
                                                            if (inventoryPeriod === 'month') { const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); return date >= monthAgo; }
                                                            if (inventoryPeriod === 'all') return true;
                                                            return true;
                                                        } else {
                                                            const reportYear = date.getFullYear();
                                                            const reportMonth = date.getMonth() + 1;
                                                            if (calType === 'month') return reportYear === selectedYear && reportMonth === selectedMonth;
                                                            if (calType === 'quarter') { const quarter = Math.floor((reportMonth - 1) / 3) + 1; return reportYear === selectedYear && quarter === selectedQuarter; }
                                                            if (calType === 'year') return reportYear === selectedYear;
                                                            return true;
                                                        }
                                                    }).length === 0 && (
                                                            <tr>
                                                                <td colSpan="6" className="px-8 py-20 text-center text-gray-300 font-bold text-sm border-dashed border-2 m-4 border-gray-100 italic">
                                                                    {inventoryPeriod === 'today' ? 'Hôm nay chưa có lượt nhập kho nào.' :
                                                                        inventoryPeriod === 'week' ? 'Trong 7 ngày qua chưa có lượt nhập kho nào.' :
                                                                            inventoryPeriod === 'month' ? 'Trong 30 ngày qua chưa có lượt nhập kho nào.' :
                                                                                'Chưa có lịch sử nhập kho.'}
                                                                    <br />Bấm "LẬP PHIẾU NHẬP" để bắt đầu.
                                                                </td>
                                                            </tr>
                                                        )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {inventorySubTab === 'raw' && (
                                    <div className="space-y-4 relative">
                                        {/* Hiển thị thanh công cụ Gộp nguyên liệu nếu chọn nhiều */}
                                        {selectedMergeItems.length >= 2 && (
                                            <div className="bg-brand-50 border border-brand-200 p-4 sticky top-0 z-10 shadow-sm flex items-center justify-between">
                                                <div className="flex items-center gap-3 text-brand-800">
                                                    <div className="bg-brand-600 text-white w-6 h-6 rounded-none flex items-center justify-center font-bold text-sm shadow">
                                                        {selectedMergeItems.length}
                                                    </div>
                                                    <span className="font-semibold text-sm">Đang chọn {selectedMergeItems.length} nguyên liệu để gộp</span>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <button
                                                        onClick={() => setSelectedMergeItems([])}
                                                        className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-700 transition"
                                                    >
                                                        HỦY BỎ
                                                    </button>
                                                    <button
                                                        onClick={() => setShowMergeModal(true)}
                                                        className="px-6 py-2 bg-brand-600 hover:bg-brand-700 text-white text-[11px] font-black shadow transition flex items-center gap-2 uppercase tracking-widest border-2 border-brand-600"
                                                    >
                                                        <Merge size={16} /> Bấm Gộp Liên Kết
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                        <div className="bg-white border border-gray-100 shadow-sm overflow-hidden rounded-none">
                                            <table className="w-full text-left">
                                                <thead>
                                                    <tr className="bg-gray-200 border-b border-gray-300">
                                                        <th className="px-5 py-5 w-12 text-center text-[14px] font-bold text-gray-700 uppercase tracking-widest">
                                                        </th>
                                                        <th className="px-8 py-5 text-[14px] font-bold text-gray-700 uppercase tracking-widest text-left w-16">Thứ tự</th>
                                                        <th className="px-8 py-5 text-[14px] font-bold text-gray-700 uppercase tracking-widest text-left">Nguyên liệu</th>
                                                        <th className="px-8 py-5 text-[14px] font-bold text-[#C68E5E] uppercase tracking-widest text-right">Giá nhập TB</th>
                                                        <th className="px-8 py-5 text-[14px] font-bold text-gray-700 uppercase tracking-widest text-right">Cảnh báo</th>
                                                        <th className="px-8 py-5 text-[14px] font-bold text-gray-700 uppercase tracking-widest text-right">Tồn hiện tại</th>
                                                        <th className="px-8 py-5 text-[14px] font-bold text-green-600 uppercase tracking-widest text-right">Số lượng đã dùng</th>
                                                        <th className="px-8 py-5 text-[14px] font-bold text-amber-600 uppercase tracking-widest text-right">Giá trị tiêu thụ</th>
                                                        <th className="px-8 py-5 text-[14px] font-bold text-gray-700 uppercase tracking-widest text-right">Thao tác</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-50">
                                                    {(() => {
                                                        // Built a mapping of the latest production recipes dynamically for traceability
                                                        const latestProductionMap = {};
                                                        inventoryAudits.forEach(a => {
                                                            if (a.type === 'PRODUCTION' && a.output) {
                                                                if (a.output.id) latestProductionMap[a.output.id] = a;
                                                                if (a.output.name) latestProductionMap[a.output.name] = a;
                                                            }
                                                        });

                                                        return inventory.map((item, idx) => {
                                                            const stat = inventoryStats.find(s => s.id === item.id) || { use1: 0, use7: 0, use30: 0, cost1: 0, cost7: 0, cost30: 0, avgCost: 0, usageQty: 0, usageCost: 0 };
                                                            const usedQty = inventoryReportMode === 'calendar' ? stat.usageQty : (inventoryPeriod === 'today' ? stat.use1 : inventoryPeriod === 'week' ? stat.use7 : stat.use30);
                                                            const usedCost = inventoryReportMode === 'calendar' ? stat.usageCost : (inventoryPeriod === 'today' ? stat.cost1 : inventoryPeriod === 'week' ? stat.cost7 : stat.cost30);

                                                            // 1. Check if the inventory item is being used by any active menu item
                                                            let usedInMenuName = null;
                                                            for (const menuItem of menu.filter(m => !m.isDeleted)) {
                                                                if (menuItem.recipe?.some(r => r.ingredientId === item.id) ||
                                                                    menuItem.sizes?.some(s => s.recipe?.some(r => r.ingredientId === item.id)) ||
                                                                    menuItem.addons?.some(a => a.recipe?.some(r => r.ingredientId === item.id))) {
                                                                    usedInMenuName = menuItem.name;
                                                                    break;
                                                                }
                                                            }

                                                            return (
                                                                <tr key={item.id} className={`hover:bg-gray-50/50 transition-colors ${selectedMergeItems.includes(item.id) ? 'bg-brand-50/40' : ''}`}>
                                                                    <td className="px-5 py-6 text-center">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={selectedMergeItems.includes(item.id)}
                                                                            onChange={(e) => {
                                                                                if (e.target.checked) {
                                                                                    setSelectedMergeItems(prev => [...prev, item.id]);
                                                                                } else {
                                                                                    setSelectedMergeItems(prev => prev.filter(id => id !== item.id));
                                                                                }
                                                                            }}
                                                                            className="w-4 h-4 text-brand-600 bg-white border-gray-300 rounded-none focus:ring-brand-500 cursor-pointer"
                                                                        />
                                                                    </td>
                                                                    <td className="px-8 py-6">
                                                                        <div className="flex flex-col gap-1 items-center">
                                                                            <button
                                                                                onClick={() => moveIngredientUp(idx)}
                                                                                disabled={idx === 0}
                                                                                className={`p-1 hover:text-accent transition-colors ${idx === 0 ? 'opacity-20 cursor-not-allowed' : 'text-gray-300'}`}
                                                                            >
                                                                                <ChevronUp size={16} strokeWidth={3} />
                                                                            </button>
                                                                            <button
                                                                                onClick={() => moveIngredientDown(idx)}
                                                                                disabled={idx === inventory.length - 1}
                                                                                className={`p-1 hover:text-accent transition-colors ${idx === inventory.length - 1 ? 'opacity-20 cursor-not-allowed' : 'text-gray-300'}`}
                                                                            >
                                                                                <ChevronDown size={16} strokeWidth={3} />
                                                                            </button>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-8 py-6">
                                                                        <div className="flex items-center gap-2 group/ingredient">
                                                                            <p className="font-bold text-gray-900 text-[12px] tracking-tight">{item.name}</p>
                                                                            {(() => {
                                                                                const prodRecipe = latestProductionMap[item.id] || latestProductionMap[item.name];
                                                                                if (prodRecipe) {
                                                                                    return (
                                                                                        <div className="relative group/tooltip flex items-center">
                                                                                            <button
                                                                                                onClick={() => {
                                                                                                    setProductionOutputItem(prodRecipe.output?.name || item.name);
                                                                                                    setProductionOutputUnit(prodRecipe.output?.unit || item.unit);
                                                                                                    setProductionOutputQty(prodRecipe.output?.qty || '');
                                                                                                    setProductionInputs(prodRecipe.inputs?.length > 0 ? prodRecipe.inputs.map(i => {
                                                                                                        const matchedInv = inventory.find(inv => (i.id && inv.id === i.id) || (i.name && inv.name.toLowerCase() === i.name.toLowerCase()));
                                                                                                        return { id: matchedInv ? matchedInv.id : '', qty: i.qty };
                                                                                                    }) : [{ id: '', qty: '' }]);
                                                                                                    setShowProductionModal(true);
                                                                                                }}
                                                                                                className="text-brand-500 cursor-pointer opacity-40 hover:opacity-100 hover:text-brand-600 hover:bg-brand-50 p-1.5 -ml-1.5 rounded-none transition-all group-hover/ingredient:opacity-100"
                                                                                                title="Làm lại mẻ này"
                                                                                            >
                                                                                                <RefreshCw size={14} strokeWidth={2.5} />
                                                                                            </button>
                                                                                            {/* Tooltip Popup */}
                                                                                            <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 hidden group-hover/tooltip:block bg-gray-900 text-white text-[12px] font-medium px-4 py-3 whitespace-nowrap z-50 shadow-xl border-l-4 border-brand-500 pointer-events-none rounded-none w-max">
                                                                                                <p className="text-brand-300 text-[9px] uppercase font-black tracking-widest mb-1.5 opacity-80">Bán thành phẩm chế biến</p>
                                                                                                <div className="flex items-center font-mono">
                                                                                                    {prodRecipe.inputs?.length > 0 ? prodRecipe.inputs.map(i => `${i.qty}${inventory.find(inv => inv.id === i.id || inv.name === i.name)?.unit || ''} ${i.name}`).join(' + ') : '---'}
                                                                                                    <ArrowRightLeft size={12} className="text-amber-400 mx-3 opacity-60" />
                                                                                                    <span className="text-brand-300 font-black">{prodRecipe.output?.qty}{prodRecipe.output?.unit || item.unit} {prodRecipe.output?.name}</span>
                                                                                                </div>
                                                                                            </div>
                                                                                        </div>
                                                                                    );
                                                                                }
                                                                                return null;
                                                                            })()}
                                                                        </div>
                                                                        <p className="text-[10px] text-gray-400 font-normal uppercase tracking-tighter mt-1 bg-gray-100 inline-block px-2 py-0.5 rounded-none">Đơn vị: {item.unit}</p>
                                                                    </td>
                                                                    <td className="px-8 py-6 text-right font-normal text-[12px] text-[#C68E5E] bg-orange-50/20">
                                                                        {formatVND(stat.avgCost)} <span className="text-[10px] opacity-60">/{item.unit}</span>
                                                                    </td>
                                                                    <td className="px-8 py-6 text-right font-normal text-[12px] text-gray-500 bg-gray-50/50">{item.minStock}</td>
                                                                    <td className="px-8 py-6 text-right">
                                                                        <div className="flex flex-col items-end">
                                                                            <span className={`inline-block px-4 py-1.5 font-normal text-[12px] rounded-none ${item.stock <= item.minStock ? 'bg-red-50 text-red-600 border border-red-200 shadow-sm shadow-red-100' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                                                                                {item.stock} <span className="text-[10px] opacity-70">{item.unit}</span>
                                                                            </span>
                                                                            {item.stock <= item.minStock && (
                                                                                <span className="text-[9px] font-normal text-red-500 uppercase mt-2 tracking-widest px-2 py-0.5 bg-red-50 rounded-none animate-pulse">CẦN NHẬP KHO</span>
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-8 py-6 text-right font-normal text-[12px] text-green-600 bg-green-50/20">{usedQty || 0} {item.unit}</td>
                                                                    <td className="px-8 py-6 text-right font-normal text-[12px] text-amber-600 bg-amber-50/20">{formatVND(usedCost)}</td>
                                                                    <td className="px-8 py-6 text-right">
                                                                        <div className="flex justify-end gap-2">
                                                                            <button onClick={() => setViewingIngredientStats(item)} className="icon-btn-edit !text-brand-600 !bg-brand-50 hover:!bg-brand-600 hover:!text-white" title="Thống kê tiêu thụ"><BarChart3 size={16} /></button>
                                                                            <button onClick={() => setEditInventory(item)} className="icon-btn-edit"><Edit2 size={16} /></button>
                                                                            <button
                                                                                onClick={() => deleteInventory(item.id)}
                                                                                disabled={!!usedInMenuName}
                                                                                title={usedInMenuName ? `Chưa thể xóa. Các món đang dùng: ${usedInMenuName}` : 'Xóa nguyên liệu này'}
                                                                                className={`icon-btn-delete ${usedInMenuName ? 'opacity-30 cursor-not-allowed hover:bg-transparent hover:text-red-500 saturate-0' : ''}`}
                                                                            >
                                                                                <Trash2 size={16} />
                                                                            </button>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            )
                                                        })
                                                    })()}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {inventorySubTab === 'fixed' && (
                                    <div className="bg-white border border-gray-100 shadow-sm overflow-hidden rounded-none flex">
                                        {/* Right Side: List Full Width */}
                                        <div className="flex-1 overflow-x-auto flex flex-col">
                                            {/* Tổng chi phí Banner */}
                                            <div className="bg-rose-50 border-b border-rose-100 p-6 flex justify-between items-center">
                                                <div>
                                                    <p className="text-[10px] font-black uppercase text-rose-500 mb-1 tracking-widest">Tổng Tích Lũy Các Khoản Chi Phí</p>
                                                    <p className="text-3xl font-black text-rose-700 tracking-tighter">
                                                        {formatVND(expenses.reduce((sum, e) => sum + Number(e.amount), 0))}
                                                    </p>
                                                </div>
                                                <div className="p-4 bg-white/60 rounded-none text-rose-500">
                                                    <DollarSign size={24} strokeWidth={3} />
                                                </div>
                                            </div>

                                            <table className="w-full text-left">
                                                <thead>
                                                    <tr className="bg-gray-100 border-b border-gray-200">
                                                        <th className="px-6 py-4 text-[12px] font-black text-gray-500 uppercase tracking-widest text-left w-32">Ngày</th>
                                                        <th className="px-6 py-4 text-[12px] font-black text-gray-500 uppercase tracking-widest text-left">Nội dung chi</th>
                                                        <th className="px-6 py-4 text-[12px] font-black text-gray-500 uppercase tracking-widest text-left">Phân loại</th>
                                                        <th className="px-6 py-4 text-[12px] font-black text-rose-600 uppercase tracking-widest text-right">Số tiền</th>
                                                        <th className="px-6 py-4 text-[12px] font-black text-gray-500 uppercase tracking-widest text-right w-24">Thao tác</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100">
                                                    {expenses.sort((a, b) => new Date(b.date) - new Date(a.date)).map((exp) => (
                                                        <tr key={exp.id} className="hover:bg-brand-50/30 transition-colors group">
                                                            <td className="px-6 py-4 text-sm font-medium text-gray-500">{new Date(exp.date).toLocaleDateString('vi-VN')}</td>
                                                            <td className="px-6 py-4">
                                                                <p className="text-sm font-bold text-gray-900">{exp.name}</p>
                                                                {exp.note && <p className="text-xs text-gray-400 mt-1">{exp.note}</p>}
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <span className="inline-block px-2.5 py-1 bg-gray-100 text-gray-600 text-[10px] font-black uppercase tracking-wider">{exp.category}</span>
                                                            </td>
                                                            <td className="px-6 py-4 text-right font-bold text-rose-600">{formatVND(exp.amount)}</td>
                                                            <td className="px-6 py-4 text-right">
                                                                <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    <button onClick={() => setEditExpense(exp)} className="icon-btn-edit text-brand-500 hover:bg-brand-50"><Edit2 size={16} /></button>
                                                                    <button onClick={() => deleteExpense(exp.id)} className="icon-btn-delete text-red-500 hover:bg-red-50"><Trash2 size={16} /></button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    {expenses.length === 0 && (
                                                        <tr>
                                                            <td colSpan="5" className="px-8 py-20 text-center text-gray-400 font-bold text-sm italic">
                                                                Chưa có khoản chi nào được ghi nhận.
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </motion.section>
                        )}

                        {activeTab === 'staff' && (
                            <motion.section key="staff" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} className="space-y-6" style={{ paddingLeft: '32px', paddingRight: '32px' }}>

                                <div className="flex justify-between items-center px-1">
                                    <div>
                                        <h3 className="text-lg font-black text-gray-900 uppercase tracking-widest">QUẢN LÝ NHÂN SỰ</h3>
                                        <p className="text-[9px] text-gray-400 font-bold mt-1 uppercase tracking-widest">{staff.length} thành viên · hệ thống lịch biểu</p>
                                    </div>
                                    <div className="flex gap-3">
                                        {staffSubTab === 'list' && (
                                            <button onClick={() => setEditStaff({})} className="bg-gray-900 text-white px-8 py-4 font-black flex items-center gap-2 shadow-lg hover:shadow-xl transition-all text-xs rounded-none hover:-translate-y-0.5 uppercase tracking-widest">
                                                <Plus size={16} /> THÊM TÀI KHOẢN
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="flex justify-start items-center mt-4">
                                    <div className="flex bg-gray-100/50 p-1 rounded-none gap-1 border border-gray-200/50">
                                        <button
                                            onClick={() => setStaffSubTab('list')}
                                            className={`px-8 py-3 font-black text-xs transition-all rounded-none uppercase tracking-widest ${staffSubTab === 'list' ? 'bg-white text-brand-600 shadow-md border border-gray-200/50' : 'text-gray-400 hover:text-gray-600'}`}
                                        >
                                            DANH SÁCH NHÂN SỰ
                                        </button>
                                        <button
                                            onClick={() => setStaffSubTab('schedules')}
                                            className={`px-8 py-3 font-black text-xs transition-all rounded-none uppercase tracking-widest ${staffSubTab === 'schedules' ? 'bg-white text-brand-600 shadow-md border border-gray-200/50' : 'text-gray-400 hover:text-gray-600'}`}
                                        >
                                            BIỂU ĐỒ PHÂN CA (GANTT)
                                        </button>
                                    </div>
                                </div>

                                {staffSubTab === 'list' && (
                                    <>
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
                                                                    <p className="text-[9px] text-brand-500 font-black tracking-[2px] mb-0.5 uppercase">{member.role}</p>
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

                                                    {/* Rotating Attendance QR */}
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

                                                            <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 transition-colors pointer-events-none" />
                                                        </div>

                                                        <div className="text-center">
                                                            <p className="text-[11px] font-black text-brand-600 uppercase tracking-widest flex items-center justify-center gap-2">
                                                                <QrCode size={14} /> MÃ CHẤM CÔNG AN TOÀN
                                                            </p>
                                                            <p className="text-[9px] text-gray-400 font-bold uppercase mt-0.5">Mã tự động xoay mỗi 60s</p>
                                                        </div>
                                                    </div>

                                                    <div className="flex gap-2">
                                                        {!shifts.find(s => s.staffId === member.id && !s.clockOut) ? (
                                                            <button onClick={() => handleClockIn(member.id)} className="flex-1 bg-brand-50 hover:bg-brand-100 text-brand-600 py-6 font-black text-sm flex justify-center items-center gap-2 transition-colors"><Play size={18} fill="currentColor" /> VÀO CA</button>
                                                        ) : (
                                                            <button onClick={() => handleClockOut(member.id)} className="flex-1 bg-amber-50 hover:bg-amber-100 text-amber-600 py-6 font-black text-sm flex justify-center items-center gap-2 transition-colors"><Square size={18} fill="currentColor" /> KẾT THÚC</button>
                                                        )}
                                                        <button onClick={() => setShowStaffReport(member)} className="w-14 bg-brand-50 hover:bg-brand-100 text-brand-600 flex items-center justify-center transition-colors" title="Báo cáo"><LineChart size={18} /></button>
                                                        <button onClick={() => setEditStaff(member)} className="w-14 bg-gray-50 hover:bg-gray-100 text-gray-600 flex items-center justify-center transition-colors"><Edit2 size={18} /></button>
                                                        <button onClick={() => deleteStaff(member.id)} className="w-14 bg-red-50 hover:bg-red-100 text-red-600 flex items-center justify-center transition-colors"><Trash2 size={18} /></button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                                {staffSubTab === 'schedules' && (
                                    <div className="-mx-8">
                                        <SchedulesView
                                            staff={staff}
                                            schedules={schedules}
                                            setSchedules={setSchedules}
                                            shifts={shifts}
                                            refreshData={fetchData}
                                        />
                                    </div>
                                )}
                            </motion.section>
                        )}

                        {activeTab === 'reports' && (
                            <motion.section key="reports" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-[10px]" style={{ paddingLeft: '32px', paddingRight: '32px' }}>
                                {/* Revenue Stats */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-[10px]">
                                    {[
                                        { label: 'Doanh thu (Kỳ này)', value: formatVND(stats.sales), icon: DollarSign, color: "var(--brand-600)" },
                                        { label: 'Công Nợ', value: formatVND(stats.debt), icon: BookOpen, color: "#8b5cf6" },
                                        { label: 'Đơn thành công', value: stats.success, icon: ShoppingCart, color: '#34C759' },
                                        { label: 'Đơn đã hủy', value: stats.cancelled, icon: XCircle, color: '#FF3B30' },
                                    ].map(card => (
                                        <div key={card.label} className="bg-white p-6 border border-gray-100 shadow-sm relative overflow-hidden">
                                            <div className="absolute top-0 right-0 opacity-[0.05] pointer-events-none"><card.icon size={100} /></div>
                                            <p className="text-[9px] text-gray-400 font-black uppercase tracking-[0.15em] mb-1.5 flex items-center gap-1.5">
                                                <span className="w-1.5 h-1.5 inline-block" style={{ backgroundColor: card.color }} />
                                                {card.label}
                                            </p>
                                            <p className="text-2xl font-black text-gray-900 break-all leading-tight">{card.value}</p>
                                        </div>
                                    ))}
                                </div>

                                {/* Filter Bar */}
                                <div className="flex justify-between items-center flex-wrap gap-2 bg-white p-2 border border-gray-100 shadow-sm">
                                    <div className="flex flex-wrap items-center gap-1">
                                        {[
                                            { id: 'today', label: 'Hôm nay' },
                                            { id: 'week', label: '7 ngày' },
                                            { id: 'month', label: 'Tháng này' },
                                            { id: 'quarter', label: 'Quý này' },
                                            { id: 'all', label: 'Tất cả' },
                                            { id: 'custom', label: 'Tuỳ chỉnh' }
                                        ].map(p => (
                                            <button key={p.id} onClick={() => setReportPeriod(p.id)}
                                                className={`px-4 md:px-6 py-2 lg:py-3 font-black text-xs uppercase tracking-widest transition-all ${reportPeriod === p.id ? 'bg-gray-900 text-white shadow-lg' : 'text-gray-400 hover:bg-gray-50'}`}>
                                                {p.label}
                                            </button>
                                        ))}
                                        {reportPeriod === 'custom' && (
                                            <div className="flex items-center gap-2 ml-2">
                                                <input type="date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} className="px-3 py-1.5 border border-gray-200 text-sm font-bold text-gray-700 bg-gray-50 rounded-none shadow-sm focus:outline-none focus:ring-1 focus:ring-gray-900" />
                                                <span className="text-gray-400 font-bold">-</span>
                                                <input type="date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} className="px-3 py-1.5 border border-gray-200 text-sm font-bold text-gray-700 bg-gray-50 rounded-none shadow-sm focus:outline-none focus:ring-1 focus:ring-gray-900" />
                                            </div>
                                        )}
                                    </div>
                                    <button onClick={exportToCSV} className="flex items-center gap-2 bg-brand-50 text-brand-600 px-6 py-2 lg:py-3 font-black text-xs uppercase tracking-widest hover:bg-brand-100 transition-all border border-brand-100">
                                        <FileUp size={16} /> XUẤT CSV
                                    </button>
                                </div>

                                {/* Promotion ROI Report */}
                                {settings?.enablePromotions && (
                                    <div className="bg-white border border-slate-100 shadow-sm overflow-hidden rounded-none">
                                        <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-50 gap-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-none bg-brand-50 flex items-center justify-center text-brand-600">
                                                    <Gift size={16} />
                                                </div>
                                                <h3 className="font-bold text-sm text-slate-800">Hiệu quả Khuyến Mãi (ROI)</h3>
                                            </div>
                                        </div>
                                        <div className="p-0 overflow-x-auto">
                                            <table className="w-full text-left border-collapse">
                                                <thead>
                                                    <tr className="bg-gray-50 border-b border-gray-100">
                                                        <th className="p-3 text-[10px] uppercase font-black tracking-widest text-gray-400">Thời gian</th>
                                                        <th className="p-3 text-[10px] uppercase font-black tracking-widest text-gray-400">Mã đơn</th>
                                                        <th className="p-3 text-[10px] uppercase font-black tracking-widest text-gray-400">Chương trình</th>
                                                        <th className="p-3 text-[10px] uppercase font-black tracking-widest text-gray-400 text-right">Doanh thu</th>
                                                        <th className="p-3 text-[10px] uppercase font-black tracking-widest text-gray-400 text-right">Mức giảm</th>
                                                        <th className="p-3 text-[10px] uppercase font-black tracking-widest text-gray-400 text-right">Giá trị quà tặng</th>
                                                        <th className="p-3 text-[10px] uppercase font-black tracking-widest text-gray-400 text-right">Tỉ lệ CP / CP Cơ hội</th>
                                                    </tr>
                                                </thead>
                                                {memoizedPromotionReport}
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {/* Delivery Partner ROI Report */}
                                {settings?.enableDeliveryApps !== false && (
                                    <div className="bg-white border border-slate-100 shadow-sm overflow-hidden rounded-none">
                                        <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-50 gap-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-none bg-brand-50 flex items-center justify-center text-brand-600">
                                                    <Package size={16} />
                                                </div>
                                                <h3 className="font-bold text-sm text-slate-800">Hiệu quả Giao Hàng (BETA)</h3>
                                            </div>
                                        </div>
                                        <div className="p-0 overflow-x-auto">
                                            <table className="w-full text-left border-collapse">
                                                <thead>
                                                    <tr className="bg-gray-50 border-b border-gray-100">
                                                        <th className="p-3 text-[10px] uppercase font-black tracking-widest text-gray-400">Thời gian</th>
                                                        <th className="p-3 text-[10px] uppercase font-black tracking-widest text-gray-400">Mã đơn</th>
                                                        <th className="p-3 text-[10px] uppercase font-black tracking-widest text-gray-400">Nền Tảng</th>
                                                        <th className="p-3 text-[10px] uppercase font-black tracking-widest text-gray-400 text-right">Doanh thu (Gross)</th>
                                                        <th className="p-3 text-[10px] uppercase font-black tracking-widest text-gray-400 text-right">Phí sàn (-)</th>
                                                        <th className="p-3 text-[10px] uppercase font-black tracking-widest text-gray-400 text-right">Thực nhận (Net)</th>
                                                        <th className="p-3 text-[10px] uppercase font-black tracking-widest text-gray-400 text-right">Giá vốn (COGS)</th>
                                                        <th className="p-3 text-[10px] uppercase font-black tracking-widest text-gray-400 text-right">LỢI NHUẬN GỘP</th>
                                                    </tr>
                                                </thead>
                                                {memoizedDeliveryPartnerReport}
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {/* Monthly Tax Report */}
                                <div className="bg-white border border-slate-100 shadow-sm overflow-hidden rounded-none mt-4">
                                    <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-none bg-red-50 flex items-center justify-center text-red-600">
                                                <PieChart size={16} />
                                            </div>
                                            <h3 className="font-bold text-sm text-slate-800">Báo Cáo Thuế</h3>
                                            <div className="ml-4 flex gap-1 bg-gray-100 p-1 rounded-sm">
                                                <button onClick={() => setTaxReportPeriod('MONTH')} className={`px-4 py-1.5 text-[10px] font-bold uppercase transition-all ${taxReportPeriod === 'MONTH' ? 'bg-white shadow-sm text-brand-600 rounded-sm' : 'text-gray-500 hover:text-gray-700'}`}>Tháng</button>
                                                <button onClick={() => setTaxReportPeriod('QUARTER')} className={`px-4 py-1.5 text-[10px] font-bold uppercase transition-all ${taxReportPeriod === 'QUARTER' ? 'bg-white shadow-sm text-brand-600 rounded-sm' : 'text-gray-500 hover:text-gray-700'}`}>Quý</button>
                                                <button onClick={() => setTaxReportPeriod('YEAR')} className={`px-4 py-1.5 text-[10px] font-bold uppercase transition-all ${taxReportPeriod === 'YEAR' ? 'bg-white shadow-sm text-brand-600 rounded-sm' : 'text-gray-500 hover:text-gray-700'}`}>Năm</button>
                                            </div>
                                        </div>
                                        <button onClick={exportTaxToCSV} className="flex items-center gap-2 bg-red-50 text-red-600 px-4 py-1.5 font-black text-[10px] uppercase tracking-widest hover:bg-red-100 transition-all border border-red-100">
                                            <FileUp size={14} /> XUẤT CSV THUẾ
                                        </button>
                                    </div>
                                    <div className="p-0 overflow-x-auto">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="bg-gray-50 border-b border-gray-100">
                                                    <th className="p-3 text-[10px] uppercase font-black tracking-widest text-gray-400">Kỳ Tính Thuế</th>
                                                    <th className="p-3 text-[10px] uppercase font-black tracking-widest text-gray-400 text-right">Số lượng đơn</th>
                                                    <th className="p-3 text-[10px] uppercase font-black tracking-widest text-gray-400 text-right">Tổng Doanh Thu (Có Thuế)</th>
                                                    <th className="p-3 text-[10px] uppercase font-black tracking-widest text-gray-400 text-right">Doanh Thu Thuần</th>
                                                    <th className="p-3 text-[10px] uppercase font-black tracking-widest text-red-600 text-right">Thuế Phải Nộp</th>
                                                </tr>
                                            </thead>
                                            {memoizedMonthlyTaxReport}
                                        </table>
                                    </div>
                                </div>

                                {/* Master Ledger - Sổ Nhật Ký Hóa Đơn Chi Tiết */}
                                <div className="bg-white border border-slate-100 shadow-sm overflow-hidden rounded-none mt-4">
                                    <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-none bg-brand-50 flex items-center justify-center text-brand-600">
                                                <ClipboardList size={16} />
                                            </div>
                                            <h3 className="font-bold text-sm text-slate-800">Sổ Hóa Đơn Chi Tiết (Master Ledger)</h3>
                                        </div>
                                        <span className="text-[10px] font-bold text-brand-600 tracking-wider bg-brand-50 rounded-none px-3 py-1">Real-time</span>
                                    </div>
                                    <div className="p-0 overflow-auto max-h-[600px] custom-scrollbar" onScroll={(e) => {
                                        if (e.target.scrollHeight - e.target.scrollTop - e.target.clientHeight < 150) {
                                            setMasterLedgerLimit(prev => prev < filteredLogs.length ? prev + 50 : prev);
                                        }
                                    }}>
                                        <table className="w-full text-left border-collapse whitespace-nowrap min-w-[1600px]">
                                            <thead className="sticky top-0 bg-gray-50 z-10 shadow-sm">
                                                <tr className="border-b border-gray-100">
                                                    <th className="px-5 py-4 text-[10px] uppercase font-bold tracking-widest text-gray-400 text-left min-w-[110px]">STT (Mã Đơn)</th>
                                                    <th className="px-5 py-4 text-[10px] uppercase font-bold tracking-widest text-gray-400 text-left min-w-[120px]">Thời Gian</th>
                                                    <th className="px-5 py-4 text-[10px] uppercase font-bold tracking-widest text-gray-400 text-left min-w-[250px]">Chi Tiết Món (Bill)</th>
                                                    <th className="px-5 py-4 text-[10px] uppercase font-bold tracking-widest text-gray-400 text-left min-w-[120px]">Nền Tảng</th>
                                                    <th className="px-5 py-4 text-[10px] uppercase font-bold tracking-widest text-gray-400 text-right min-w-[180px]">Tổng Tiền (Khách Trả)</th>
                                                    <th className="px-5 py-4 text-[10px] uppercase font-bold tracking-widest text-gray-400 text-right min-w-[130px]">Trích Thuế</th>
                                                    <th className="px-5 py-4 text-[10px] uppercase font-bold tracking-widest text-gray-400 text-right min-w-[190px]">Khuyến Mãi/Phí Sàn</th>
                                                    <th className="px-5 py-4 text-[10px] uppercase font-bold tracking-widest text-gray-400 text-right min-w-[180px]">Doanh Thu Thuần</th>
                                                    <th className="px-5 py-4 text-[10px] uppercase font-bold tracking-widest text-gray-400 text-right min-w-[150px]">Chi Phí (COGS)</th>
                                                    <th className="px-5 py-4 text-[10px] uppercase font-bold tracking-widest text-gray-400 text-right min-w-[150px]">Lợi Nhuận Gộp</th>
                                                    <th className="px-5 py-4 text-[10px] uppercase font-bold tracking-widest text-gray-400 text-left min-w-[150px]">Ghi Chú</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50 uppercase text-xs">
                                                {memoizedMasterLedgerRows}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Inventory Audits Report Table */}
                                <div className="bg-white border border-slate-100 shadow-sm overflow-hidden rounded-none mt-4">
                                    <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-50 gap-4">
                                        <div className="flex items-center gap-6 pb-2 border-b-2 border-slate-200 w-full md:w-auto">
                                            <button
                                                onClick={() => setAuditReportTab('history')}
                                                className={`pb-2 font-bold flex items-center gap-2 text-[13px] transition-colors border-b-2 -mb-[2px] ${auditReportTab === 'history' ? 'text-brand-700 border-brand-500' : 'text-slate-400 border-transparent hover:text-brand-600'}`}
                                            >
                                                Lịch Sử Hao Hụt Máy Pha
                                            </button>
                                            <button
                                                onClick={() => setAuditReportTab('manual')}
                                                className={`pb-2 font-bold flex items-center gap-2 text-[13px] transition-colors border-b-2 -mb-[2px] ${auditReportTab === 'manual' ? 'text-brand-700 border-brand-500' : 'text-slate-400 border-transparent hover:text-brand-600'}`}
                                            >
                                                Lịch Sử Kiểm Kê Kho
                                            </button>
                                        </div>

                                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mt-4">
                                            <div className="flex items-center gap-2">
                                                <AlertTriangle size={15} className="text-amber-500" />
                                                <h3 className="font-black uppercase tracking-wider text-[13px] text-amber-900">
                                                    {auditReportTab === 'history' ? 'Báo Cáo Biến Động Hàng Ngày' : 'Báo Cáo Kiểm Kê Hệ Thống'}
                                                </h3>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                {inventoryAudits.length > 0 && (
                                                    <select
                                                        className="text-xs font-bold border-gray-200 rounded-none px-2 py-1 shadow-sm focus:ring-amber-500 focus:border-amber-500"
                                                        value={auditFilterIngredient}
                                                        onChange={(e) => setAuditFilterIngredient(e.target.value)}
                                                    >
                                                        <option value="all">Tất cả Nguyên liệu</option>
                                                        {[...new Map([
                                                            ...inventory.map(i => [i.id, i.name]),
                                                            ...inventoryAudits.filter(a => a.ingredientId && a.ingredientName).map(a => [a.ingredientId, a.ingredientName])
                                                        ]).entries()].map(([id, name]) => (
                                                            <option key={id} value={id}>{name}</option>
                                                        ))}
                                                    </select>
                                                )}
                                                <div className="flex items-center gap-2">
                                                    <select
                                                        className="text-xs font-bold border-gray-200 rounded-none px-2 py-1 shadow-sm focus:ring-amber-500 focus:border-amber-500 text-amber-900 bg-amber-50"
                                                        value={auditFilterPeriod}
                                                        onChange={(e) => setAuditFilterPeriod(e.target.value)}
                                                    >
                                                        <option value="all">Toàn thời gian</option>
                                                        <option value="today">Hôm nay</option>
                                                        <option value="7days">7 ngày qua</option>
                                                        <option value="30days">30 ngày qua</option>
                                                        <option value="thisMonth">Tháng này</option>
                                                        <option value="lastMonth">Tháng trước</option>
                                                        <option value="custom">Tùy chọn...</option>
                                                    </select>

                                                    {auditFilterPeriod === 'custom' && (
                                                        <div className="flex items-center gap-1">
                                                            <input
                                                                type="date"
                                                                className="text-xs font-bold border-gray-200 rounded-none px-2 py-1 shadow-sm focus:ring-amber-500 focus:border-amber-500 text-amber-900"
                                                                value={auditStartDate}
                                                                onChange={e => setAuditStartDate(e.target.value)}
                                                            />
                                                            <span className="text-gray-400 font-bold">-</span>
                                                            <input
                                                                type="date"
                                                                className="text-xs font-bold border-gray-200 rounded-none px-2 py-1 shadow-sm focus:ring-amber-500 focus:border-amber-500 text-amber-900"
                                                                value={auditEndDate}
                                                                onChange={e => setAuditEndDate(e.target.value)}
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Mảng dữ liệu riêng cho mỗi Tab */}
                                    {(() => {

                                        return (
                                            <>
                                                {/* Custom Trend Chart - API: Lịch sử History */}
                                                {auditReportTab === 'history' && auditFilterIngredient !== 'all' && (() => {
                                                    const aggregatedMap = {};
                                                    let displayUnit = '';
                                                    const ingredientObj = inventory.find(i => i.id === auditFilterIngredient) || {};

                                                    const now = new Date();
                                                    now.setHours(23, 59, 59, 999);
                                                    let startOfPeriod = new Date(0);
                                                    let endOfPeriod = now;

                                                    if (auditFilterPeriod === 'today') {
                                                        startOfPeriod = new Date();
                                                        startOfPeriod.setHours(0, 0, 0, 0);
                                                    } else if (auditFilterPeriod === '7days') {
                                                        startOfPeriod = new Date();
                                                        startOfPeriod.setDate(now.getDate() - 7);
                                                        startOfPeriod.setHours(0, 0, 0, 0);
                                                    } else if (auditFilterPeriod === '30days') {
                                                        startOfPeriod = new Date();
                                                        startOfPeriod.setDate(now.getDate() - 30);
                                                        startOfPeriod.setHours(0, 0, 0, 0);
                                                    } else if (auditFilterPeriod === 'thisMonth') {
                                                        startOfPeriod = new Date(now.getFullYear(), now.getMonth(), 1);
                                                    } else if (auditFilterPeriod === 'lastMonth') {
                                                        startOfPeriod = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                                                        endOfPeriod = new Date(now.getFullYear(), now.getMonth(), 0);
                                                        endOfPeriod.setHours(23, 59, 59, 999);
                                                    } else if (auditFilterPeriod === 'custom') {
                                                        startOfPeriod = new Date(auditStartDate);
                                                        startOfPeriod.setHours(0, 0, 0, 0);
                                                        endOfPeriod = new Date(auditEndDate);
                                                        endOfPeriod.setHours(23, 59, 59, 999);
                                                    }

                                                    historicalStockLevels.forEach(audit => {
                                                        const t = new Date(audit.timestamp).getTime();
                                                        if (auditFilterPeriod !== 'all' && (t < startOfPeriod.getTime() || t > endOfPeriod.getTime())) return;

                                                        const date = new Date(audit.timestamp);
                                                        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

                                                        // Since historicalStockLevels is Newest->Oldest, the FIRST audit we encounter for a dateStr IS the newest (End of Day).
                                                        if (!aggregatedMap[dateStr]) {
                                                            aggregatedMap[dateStr] = { stockAfter: audit.stockAfter, sumDifference: 0 };
                                                        }
                                                        aggregatedMap[dateStr].sumDifference += audit.displayDifference || 0;
                                                        if (audit.unit) displayUnit = audit.unit;
                                                    });

                                                    displayUnit = displayUnit || ingredientObj.unit || '';

                                                    const chartData = Object.keys(aggregatedMap).sort().map(dateStr => ({
                                                        dateStr,
                                                        timestamp: new Date(dateStr).getTime(),
                                                        stockAfter: parseFloat(aggregatedMap[dateStr].stockAfter.toFixed(3)),
                                                        sumDifference: parseFloat(aggregatedMap[dateStr].sumDifference.toFixed(3)),
                                                        displayUnit
                                                    }));

                                                    if (chartData.length < 1) return null;

                                                    const w = 800;
                                                    const h = 200;
                                                    const pad = 40;

                                                    const maxStockRender = Math.max(...chartData.map(d => d.stockAfter), ingredientObj.stock || 1) * 1.2;
                                                    const safeRange = maxStockRender <= 0 ? 1 : maxStockRender;

                                                    const getX = (index) => chartData.length === 1 ? w / 2 : pad + (index * ((w - pad * 2) / (chartData.length - 1)));
                                                    const getY = (val) => h - pad - ((val / safeRange) * (h - pad * 2));

                                                    const y0 = getY(0);

                                                    return (
                                                        <div className="w-full bg-slate-50 border-b border-gray-100 p-8 flex flex-col items-center">
                                                            <h4 className="text-[11px] font-black uppercase tracking-widest text-amber-700/60 mb-10 flex items-center gap-2">
                                                                <BarChart3 size={16} /> TỒN KHO LŨY KẾ THEO NGÀY
                                                            </h4>
                                                            <div className="w-full max-w-4xl overflow-x-auto pb-6 scrollbar-thin">
                                                                <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto min-w-[600px] overflow-visible">
                                                                    {/* Y=0 Line */}
                                                                    <line x1={pad} y1={y0} x2={w - pad} y2={y0} stroke="#d1d5db" strokeWidth="2" strokeDasharray="5 5" />

                                                                    {/* Data Bars */}
                                                                    {chartData.map((d, i) => {
                                                                        const x = getX(i);
                                                                        const y = getY(d.stockAfter);
                                                                        const color = '#3b82f6';
                                                                        const barHeight = Math.max(2, Math.abs(y0 - y));
                                                                        const barY = Math.min(y0, y);

                                                                        return (
                                                                            <g key={d.dateStr || i} className="group cursor-pointer">
                                                                                <rect x={x - 12} y={barY} width="24" height={barHeight} fill={color} className="drop-shadow-sm transition-all group-hover:opacity-80" rx="3" />

                                                                                {/* Lable tồn kho (trên cột) */}
                                                                                <text x={x} y={barY - 8} textAnchor="middle" fontSize="12" fill={color} fontWeight="900" style={{ textShadow: '0 1px 2px rgba(255,255,255,0.8)' }}>
                                                                                    {Math.abs(d.stockAfter) < 0.001 ? 0 : d.stockAfter} <tspan fontSize="8" fill="#9ca3af">{d.displayUnit}</tspan>
                                                                                </text>

                                                                                {/* Hover hiện biến động */}
                                                                                <g className="opacity-0 group-hover:opacity-100 transition-opacity">
                                                                                    <rect x={x - 30} y={barY + barHeight / 2 - 12} width="60" height="24" fill="#1f2937" rx="4" />
                                                                                    <text x={x} y={barY + barHeight / 2 + 4} textAnchor="middle" fontSize="11" fill={d.sumDifference > 0 ? '#10b981' : d.sumDifference < 0 ? '#ef4444' : '#fff'} fontWeight="bold">
                                                                                        {d.sumDifference > 0 ? '+' : ''}{d.sumDifference}
                                                                                    </text>
                                                                                </g>

                                                                                <text x={x} y={h - 10} textAnchor="middle" fontSize="10" fill="#9ca3af" fontWeight="900" className="opacity-80">
                                                                                    {new Date(d.timestamp).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
                                                                                </text>
                                                                            </g>
                                                                        );
                                                                    })}
                                                                </svg>
                                                            </div>
                                                        </div>
                                                    );
                                                })()}

                                                <div className="overflow-auto max-h-[400px] custom-scrollbar" onScroll={(e) => {
                                                    if (e.target.scrollHeight - e.target.scrollTop - e.target.clientHeight < 150) {
                                                        setAuditLimit(prev => prev < memoizedDisplayAudits.length ? prev + 50 : prev);
                                                    }
                                                }}>
                                                    <table className="w-full text-left whitespace-nowrap">
                                                        <thead className="bg-slate-50 sticky top-0 z-10 text-[10px] ring-1 ring-gray-100 uppercase font-bold text-gray-500 tracking-[0.2em]">
                                                            <tr>
                                                                <th className="px-6 py-4 text-left">Thời gian</th>
                                                                <th className="px-6 py-4 text-left">Nguyên liệu</th>
                                                                <th className="px-6 min-w-[110px] py-4 text-left">Chênh lệch</th>
                                                                <th className="px-6 min-w-[130px] pr-10 py-4 text-left">Trị giá Thiệt hại</th>
                                                                <th className="px-6 min-w-[140px] pl-10 py-4 text-left">Lý do</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-gray-100">
                                                            {memoizedDisplayAudits.length === 0 ? (
                                                                <tr>
                                                                    <td colSpan={5} className="py-16 text-center">
                                                                        <div className="flex flex-col items-center justify-center text-gray-300">
                                                                            <CheckCircle size={32} className="mb-3 opacity-50" />
                                                                            <p className="font-black uppercase tracking-widest text-xs">Chưa có dữ liệu {auditReportTab === 'history' ? 'biến động' : 'kiểm kho'} nào</p>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            ) : (
                                                                memoizedAuditRows
                                                            )}
                                                        </tbody>
                                                    </table>
                                                </div>

                                                {/* Damage Evaluation Summary */}
                                                {auditReportTab === 'manual' && memoizedDisplayAudits.length > 0 && (() => {
                                                    const totalLoss = memoizedDisplayAudits.filter(a => a.displayCost < 0).reduce((sum, a) => sum + Math.abs(a.displayCost), 0);
                                                    const totalSurplus = memoizedDisplayAudits.filter(a => a.displayCost > 0).reduce((sum, a) => sum + a.displayCost, 0);
                                                    const netBalance = totalSurplus - totalLoss;

                                                    // Evaluate the loss
                                                    let evalText = "Mức hao hụt THẤP. Tình trạng quản lý kho nguyên liệu đang được duy trì rất tốt!";
                                                    let evalColor = "text-brand-700 bg-brand-50 border-brand-200";
                                                    let icon = <CheckCircle size={20} className="text-brand-500" />;

                                                    // Use absolute numbers for evaluation. Values are in thousands (e.g. 1000 means 1,000,000 VND).
                                                    if (totalLoss > 1000) {
                                                        evalText = "Mức hao hụt CAO. Vượt mức an toàn. Cần tiến hành rà soát định lượng pha chế, kiểm tra tình trạng hàng hủy/hỏng hoặc giám sát kỹ hơn nhân sự vận hành.";
                                                        evalColor = "text-red-700 bg-red-50 border-red-200";
                                                        icon = <AlertTriangle size={20} className="text-red-500" />;
                                                    } else if (totalLoss > 300) {
                                                        evalText = "Mức hao hụt TRUNG BÌNH. Ở mức có thể chấp nhận nhưng cần tiếp tục theo dõi sát sao ở các kỳ kiểm định kho sau.";
                                                        evalColor = "text-amber-700 bg-amber-50 border-amber-200";
                                                        icon = <Info size={20} className="text-amber-500" />;
                                                    }

                                                    return (
                                                        <div className="p-6 bg-slate-50 border-t border-gray-200 flex flex-col xl:flex-row gap-6 items-center justify-between">
                                                            <div className="flex flex-wrap gap-6 md:gap-8 items-center w-full xl:w-auto">
                                                                <div>
                                                                    <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-1 flex items-center gap-1.5"><TrendingDown size={14} className="text-red-400" /> Tổng Thâm hụt (Lỗ)</p>
                                                                    <p className="text-2xl font-black text-red-600 font-mono tracking-tighter">{formatVND(totalLoss)}</p>
                                                                </div>
                                                                <div className="hidden md:block w-px h-10 bg-gray-200"></div>
                                                                <div>
                                                                    <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-1 flex items-center gap-1.5"><TrendingUp size={14} className="text-brand-400" /> Tổng Dư thừa</p>
                                                                    <p className="text-2xl font-black text-brand-600 font-mono tracking-tighter">{formatVND(totalSurplus)}</p>
                                                                </div>
                                                                <div className="hidden md:block w-px h-10 bg-gray-200"></div>
                                                                <div className={`p-3 rounded-none border bg-white shadow-sm ${netBalance < 0 ? 'border-red-200' : netBalance > 0 ? 'border-brand-200' : 'border-gray-200'}`}>
                                                                    <p className="text-[10px] font-black uppercase text-gray-500 tracking-widest mb-1 flex items-center gap-1.5">
                                                                        <Calculator size={14} className="text-brand-500" /> KIỂM KÊ RÒNG (BÙ TRỪ)
                                                                    </p>
                                                                    <p className={`text-2xl font-black font-mono tracking-tighter ${netBalance < 0 ? 'text-red-600' : netBalance > 0 ? 'text-brand-600' : 'text-gray-600'}`}>
                                                                        {netBalance > 0 ? '+' : ''}{formatVND(netBalance)}
                                                                    </p>
                                                                </div>
                                                            </div>

                                                            <div className={`w-full lg:max-w-md p-4 border rounded-none flex items-start gap-3 shadow-sm ${evalColor}`}>
                                                                <div className="mt-0.5">{icon}</div>
                                                                <div>
                                                                    <h4 className="font-black text-[11px] uppercase tracking-wider mb-1">Hệ thống Đánh giá:</h4>
                                                                    <p className="text-[12px] font-medium leading-relaxed opacity-90">{evalText}</p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })()}
                                            </>
                                        );
                                    })()}
                                </div>

                                <FixedCostsSection
                                    costs={fixedCosts}
                                    onUpdate={updateFixedCosts}
                                    menu={menu}
                                    inventoryStats={inventoryStats}
                                    shifts={shifts}
                                    staff={staff}
                                    reportPeriod={reportPeriod}
                                    report={report}
                                    bepMode={bepMode}
                                    setBepMode={setBepMode}
                                    expenses={expenses}
                                />
                            </motion.section>
                        )}

                        {activeTab === 'settings' && (
                            <motion.div key="settings-wrapper" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full flex justify-center" style={{ paddingLeft: '32px', paddingRight: '32px' }}>
                                <section className="w-full max-w-3xl space-y-6 pb-32">
                                    <div className="bg-white p-6 border border-gray-100 shadow-xl space-y-6 rounded-none">
                                        <div className="flex items-center gap-3 border-b border-gray-50 pb-4">
                                            <div className="bg-brand-600 p-2 text-white"><Settings size={20} /></div>
                                            <h2 className="text-lg font-black text-gray-900 uppercase tracking-tight">Cài đặt & Kết nối</h2>
                                        </div>

                                        <div className="grid grid-cols-1 gap-4">
                                            {/* 1. Giao diện & Màu sắc Theme */}
                                            <SettingSection title="1. Giao diện & Màu sắc (Theme)" icon={<Sparkles size={16} />} color="blue" defaultExpanded={true}>
                                                <div className="space-y-4">
                                                    <div className="flex flex-col gap-2">
                                                        <label className="text-[10px] font-black uppercase text-gray-400">Thay đổi màu chủ đạo (Brand Color)</label>
                                                        <div className="flex items-center gap-4">
                                                            <input
                                                                type="color"
                                                                value={settings.themeColor || '#059669'}
                                                                onChange={async (e) => {
                                                                    const newColor = e.target.value;
                                                                    const palette = generateTheme(newColor);
                                                                    applyTheme(palette);
                                                                    const newSettings = { ...settings, themeColor: newColor };
                                                                    setSettings(newSettings);
                                                                }}
                                                                onBlur={async () => {
                                                                    try {
                                                                        await fetch(`${SERVER_URL}/api/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
                                                                    } catch (err) { console.error('Failed to save theme', err); }
                                                                }}
                                                                className="w-12 h-12 rounded-none cursor-pointer border-0 p-0"
                                                            />
                                                            <div className="flex-1 text-sm font-medium text-gray-600">
                                                                Hệ thống sẽ tự động tính toán 11 sắc độ từ màu bạn chọn để đảm bảo độ tương phản (chữ dễ đọc trên nền sáng/tối) và làm mới toàn bộ nút bấm, viền, icon trên App.
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </SettingSection>

                                            {/* 2. Shop & Bank */}
                                            <SettingSection title="2. Cửa hàng & Thanh toán" icon={<Sparkles size={16} />} color="amber">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    <div className="space-y-1">
                                                        <label className="text-[9px] font-black uppercase text-gray-400">Tên quán</label>
                                                        <input type="text" value={settings.shopName || ''} onChange={e => setSettings({ ...settings, shopName: e.target.value })} className="admin-input !text-sm !py-2" />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-[9px] font-black uppercase text-gray-400">Địa chỉ quán</label>
                                                        <input type="text" value={settings.shopAddress || ''} onChange={e => setSettings({ ...settings, shopAddress: e.target.value })} className="admin-input !text-sm !py-2" placeholder="VD: 123 Đường Nam Kỳ Khởi Nghĩa, Quận 1..." />
                                                    </div>
                                                    <div className="space-y-1 mt-2">
                                                        <label className="text-[9px] font-black uppercase text-gray-400">Ngân hàng</label>
                                                        <input type="text" value={settings.bankId || ''} onChange={e => setSettings({ ...settings, bankId: e.target.value })} className="admin-input !text-sm !py-2" />
                                                    </div>
                                                    <div className="space-y-1 mt-2">
                                                        <label className="text-[9px] font-black uppercase text-gray-400">Số tài khoản</label>
                                                        <input type="text" value={settings.accountNo || ''} onChange={e => setSettings({ ...settings, accountNo: e.target.value })} className="admin-input !text-sm !py-2" />
                                                    </div>
                                                    <div className="md:col-span-2 space-y-1">
                                                        <label className="text-[9px] font-black uppercase text-gray-400">Chủ tài khoản</label>
                                                        <input type="text" value={settings.accountName || ''} onChange={e => setSettings({ ...settings, accountName: e.target.value })} className="admin-input !text-sm !py-2" />
                                                    </div>
                                                </div>
                                            </SettingSection>

                                            {/* 2. Luồng phục vụ */}
                                            <SettingSection title="2. Luồng phục vụ" icon={<ShoppingCart size={16} />} color="purple">
                                                <div className="space-y-4">
                                                    <ToggleOption label="Chương trình Khuyến Mãi" subLabel="Bật tính năng thẻ Khuyến mãi và áp dụng mã giảm giá"
                                                        activeColor="blue" isOn={settings.enablePromotions !== false} onToggle={async () => {
                                                            const newSettings = { ...settings, enablePromotions: settings.enablePromotions === false ? true : false };
                                                            setSettings(newSettings);
                                                            // Call server to persist settings immediately 
                                                            try {
                                                                await fetch(`${SERVER_URL}/api/settings`, {
                                                                    method: 'POST',
                                                                    headers: { 'Content-Type': 'application/json' },
                                                                    body: JSON.stringify(newSettings)
                                                                });
                                                            } catch (err) { console.error('Failed to save promo setting', err); }
                                                        }} />
                                                    <ToggleOption label="Thanh toán trước" subLabel="Khách phải trả tiền trước khi nhân viên làm món"
                                                        isOn={settings.requirePrepayment !== false} onToggle={() => setSettings({ ...settings, requirePrepayment: !settings.requirePrepayment })} />
                                                    <ToggleOption label="Chỉ bán mang đi" subLabel="Ẩn hiển thị phòng bàn trên menu"
                                                        activeColor="green" isOn={settings.isTakeaway} onToggle={() => setSettings({ ...settings, isTakeaway: !settings.isTakeaway })} />
                                                </div>
                                            </SettingSection>


                                            {/* 3. Quảng cáo món mới */}
                                            <SettingSection title="3. Quảng cáo món mới" icon={<Sparkles size={16} />} color="indigo">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    <div className="space-y-1">
                                                        <label className="text-[9px] font-black uppercase text-gray-400">Ảnh món mới (URL)</label>
                                                        <input type="text" value={settings.featuredPromoImage || ''} onChange={e => setSettings({ ...settings, featuredPromoImage: e.target.value })} className="admin-input !text-[11px] !py-2" placeholder="https://..." />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-[9px] font-black uppercase text-gray-400">Tiêu đề</label>
                                                        <input type="text" value={settings.featuredPromoTitle || ''} onChange={e => setSettings({ ...settings, featuredPromoTitle: e.target.value })} className="admin-input !text-[11px] !py-2" />
                                                    </div>
                                                    <div className="md:col-span-2 space-y-1">
                                                        <label className="text-[9px] font-black uppercase text-gray-400">Nút bấm (CTA)</label>
                                                        <input type="text" value={settings.featuredPromoCTA || ''} onChange={e => setSettings({ ...settings, featuredPromoCTA: e.target.value })} className="admin-input !text-[11px] !py-2" />
                                                    </div>
                                                </div>
                                            </SettingSection>

                                            {/* 4. Đối Tác Giao Hàng (BETA) */}
                                            <SettingSection title="4. Đối Tác Giao Hàng (BETA)" icon={<Package size={16} />} color="orange">
                                                <div className="space-y-4">
                                                    <ToggleOption
                                                        label="Kích hoạt Quản lý Đơn Giao Hàng"
                                                        subLabel="Cho phép chọn nguồn đơn (Grab, Shopee) và tính toán doanh thu mỏng sau phí sàn."
                                                        activeColor="orange"
                                                        isOn={settings.enableDeliveryApps !== false}
                                                        onToggle={async () => {
                                                            const newSettings = { ...settings, enableDeliveryApps: settings.enableDeliveryApps === false ? true : false };
                                                            setSettings(newSettings);
                                                            try {
                                                                await fetch(`${SERVER_URL}/api/settings`, {
                                                                    method: 'POST',
                                                                    headers: { 'Content-Type': 'application/json' },
                                                                    body: JSON.stringify(newSettings)
                                                                });
                                                            } catch (err) { console.error('Failed to save settings', err); }
                                                        }}
                                                    />
                                                    {settings.enableDeliveryApps !== false && (
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                                                            <div className="bg-gray-50 border border-gray-100 p-4 space-y-2">
                                                                <label className="text-[10px] font-black uppercase text-gray-400 flex items-center gap-2">
                                                                    <div className="w-2 h-2 rounded-none bg-green-500"></div> Phí GrabFood (%)
                                                                </label>
                                                                <input
                                                                    type="number" step="0.01"
                                                                    value={settings.deliveryAppsConfigs?.GRAB?.fee || 18.18}
                                                                    onChange={async (e) => {
                                                                        const val = parseFloat(e.target.value) || 0;
                                                                        const newConfigs = {
                                                                            ...(settings.deliveryAppsConfigs || {}),
                                                                            GRAB: { ...(settings.deliveryAppsConfigs?.GRAB || {}), fee: val }
                                                                        };
                                                                        const newSettings = { ...settings, deliveryAppsConfigs: newConfigs };
                                                                        setSettings(newSettings);
                                                                    }}
                                                                    onBlur={async () => {
                                                                        try {
                                                                            await fetch(`${SERVER_URL}/api/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
                                                                        } catch (e) { }
                                                                    }}
                                                                    className="admin-input !text-sm !py-2 font-black text-green-700"
                                                                />
                                                            </div>
                                                            <div className="bg-gray-50 border border-gray-100 p-4 space-y-2">
                                                                <label className="text-[10px] font-black uppercase text-gray-400 flex items-center gap-2">
                                                                    <div className="w-2 h-2 rounded-none bg-orange-500"></div> Phí ShopeeFood (%)
                                                                </label>
                                                                <input
                                                                    type="number" step="0.01"
                                                                    value={settings.deliveryAppsConfigs?.SHOPEE?.fee || 20.0}
                                                                    onChange={async (e) => {
                                                                        const val = parseFloat(e.target.value) || 0;
                                                                        const newConfigs = {
                                                                            ...(settings.deliveryAppsConfigs || {}),
                                                                            SHOPEE: { ...(settings.deliveryAppsConfigs?.SHOPEE || {}), fee: val }
                                                                        };
                                                                        const newSettings = { ...settings, deliveryAppsConfigs: newConfigs };
                                                                        setSettings(newSettings);
                                                                    }}
                                                                    onBlur={async () => {
                                                                        try {
                                                                            await fetch(`${SERVER_URL}/api/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
                                                                        } catch (e) { }
                                                                    }}
                                                                    className="admin-input !text-sm !py-2 font-black text-orange-700"
                                                                />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </SettingSection>

                                            {/* 5. Cấu hình Thuế VAT */}
                                            <SettingSection title="5. Dự kiến Doanh Thu Năm (Luật Thuế 2026)" icon={<Calculator size={16} />} color="teal">
                                                <div className="space-y-4">
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                        <button
                                                            onClick={async () => {
                                                                const newSet = { ...settings, annualRevenueTier: 'UNDER_500M', taxMode: 'NONE', taxRate: 0 };
                                                                setSettings(newSet);
                                                                try { await fetch(`${SERVER_URL}/api/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newSet) }); } catch (e) { }
                                                            }}
                                                            className={`p-4 border text-left bg-white transition-all ${settings.annualRevenueTier === 'UNDER_500M' ? 'border-teal-500 ring-1 ring-teal-500 shadow-sm relative z-10' : 'border-gray-200 hover:border-gray-300'}`}
                                                        >
                                                            <div className="font-black text-[13px] text-gray-900 mb-1">Dưới 500 triệu/năm</div>
                                                            <div className="text-[10px] text-gray-500 uppercase tracking-widest font-black mb-1 text-teal-600">Áp dụng: Miễn thuế</div>
                                                            <div className="text-[10px] text-gray-400">0% VAT. Hóa đơn không in Thuế (HĐBH).</div>
                                                        </button>

                                                        <button
                                                            onClick={async () => {
                                                                const newSet = { ...settings, annualRevenueTier: '500M_TO_3B', taxMode: 'DIRECT_INCLUSIVE', taxRate: 3 };
                                                                setSettings(newSet);
                                                                try { await fetch(`${SERVER_URL}/api/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newSet) }); } catch (e) { }
                                                            }}
                                                            className={`p-4 border text-left bg-white transition-all ${settings.annualRevenueTier === '500M_TO_3B' ? 'border-teal-500 ring-1 ring-teal-500 shadow-sm relative z-10' : 'border-gray-200 hover:border-gray-300'}`}
                                                        >
                                                            <div className="font-black text-[13px] text-gray-900 mb-1">500 Triệu - 3 Tỷ</div>
                                                            <div className="text-[10px] text-gray-500 uppercase tracking-widest font-black mb-1 text-teal-600">Áp dụng: Trực tiếp</div>
                                                            <div className="text-[10px] text-gray-400">3% VAT. Ẩn VAT trên HĐBH, tự động trích ngầm vào hệ thống báo cáo Excel.</div>
                                                        </button>

                                                        <button
                                                            onClick={async () => {
                                                                const newSet = { ...settings, annualRevenueTier: 'OVER_3B', taxMode: settings.deductionTaxMode || 'INCLUSIVE', taxRate: settings.deductionTaxRate || 10 };
                                                                setSettings(newSet);
                                                                try { await fetch(`${SERVER_URL}/api/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newSet) }); } catch (e) { }
                                                            }}
                                                            className={`p-4 border text-left bg-white transition-all ${settings.annualRevenueTier === 'OVER_3B' ? 'border-teal-500 ring-1 ring-teal-500 shadow-sm relative z-10' : 'border-gray-200 hover:border-gray-300'}`}
                                                        >
                                                            <div className="font-black text-[13px] text-gray-900 mb-1">Hơn 3 Tỷ / DN</div>
                                                            <div className="text-[10px] text-gray-500 uppercase tracking-widest font-black mb-1 text-teal-600">Áp dụng: Khấu trừ</div>
                                                            <div className="text-[10px] text-gray-400">HĐ GTGT. Cấu hình linh hoạt Gộp (Inclusive) hoặc Tách (Exclusive).</div>
                                                        </button>
                                                    </div>

                                                    {settings.annualRevenueTier === 'OVER_3B' && (
                                                        <div className="mt-4 p-4 border border-teal-100 bg-teal-50 border-t border-l-4 border-l-teal-500 border-r-0 border-b-0 space-y-4">
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                <div className="space-y-1">
                                                                    <label className="text-[9px] font-black uppercase text-gray-500">Hình thức Hóa Đơn</label>
                                                                    <select
                                                                        value={settings.deductionTaxMode || 'INCLUSIVE'}
                                                                        onChange={async (e) => {
                                                                            const val = e.target.value;
                                                                            const newSet = { ...settings, deductionTaxMode: val, taxMode: val };
                                                                            setSettings(newSet);
                                                                            try { await fetch(`${SERVER_URL}/api/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newSet) }); } catch (e) { }
                                                                        }}
                                                                        className="admin-input !text-sm !py-2 w-full bg-white text-teal-800"
                                                                    >
                                                                        <option value="INCLUSIVE">Thuế Gộp (Inclusive) - Giá đã gồm VAT</option>
                                                                        <option value="EXCLUSIVE">Thuế Tách (Exclusive) - Cộng VAT vào Bill</option>
                                                                    </select>
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <label className="text-[9px] font-black uppercase text-gray-500">Thuế suất VAT (%)</label>
                                                                    <select
                                                                        value={settings.deductionTaxRate || 8}
                                                                        onChange={async (e) => {
                                                                            const val = parseFloat(e.target.value);
                                                                            const newSet = { ...settings, deductionTaxRate: val, taxRate: val };
                                                                            setSettings(newSet);
                                                                            try { await fetch(`${SERVER_URL}/api/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newSet) }); } catch (e) { }
                                                                        }}
                                                                        className="admin-input !text-sm !py-2 w-full bg-white text-teal-800"
                                                                    >
                                                                        <option value="8">8%</option>
                                                                        <option value="10">10%</option>
                                                                    </select>
                                                                </div>
                                                            </div>
                                                            <p className="text-xs text-gray-500 italic">
                                                                Hóa đơn Khấu trừ luôn bóc tách rõ Dòng Thuế và Giá Tạm tính khi in cho Khách hàng.
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            </SettingSection>

                                            {/* 6. Phím tắt bán hàng */}
                                            <SettingSection title="6. Phím tắt bán hàng (Hotkey POS)" icon={<Keyboard size={16} />} color="indigo">
                                                <div className="space-y-4">
                                                    <ToggleOption
                                                        label="Bật xác nhận bằng hình ảnh"
                                                        subLabel="Hiển thị ảnh món khi gõ mã phím tắt"
                                                        isOn={settings.flashConfirmationEnabled !== false}
                                                        onToggle={() => setSettings({ ...settings, flashConfirmationEnabled: !settings.flashConfirmationEnabled })}
                                                        activeColor="blue"
                                                    />
                                                    <ToggleOption
                                                        label="Chế độ học tập (Hiện mã)"
                                                        subLabel="Hiển thị mã số trên thẻ món trong màn hình bán hàng"
                                                        isOn={!!settings.showHotkeys}
                                                        onToggle={() => setSettings({ ...settings, showHotkeys: !settings.showHotkeys })}
                                                        activeColor="green"
                                                    />
                                                    <div className="bg-gray-50 p-4 border border-gray-100 space-y-2">
                                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Bảng mã phím tắt</p>
                                                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                                                            {menu.filter(m => m.shortcutCode).map(m => (
                                                                <div key={m.id} className="flex items-center gap-2">
                                                                    <span style={{ background: '#1A1A1A', color: '#FFD60A', fontFamily: 'monospace', padding: '1px 6px', borderRadius: 4, fontSize: 12, fontWeight: 900 }}>{m.shortcutCode}</span>
                                                                    <span className="text-gray-600 font-bold truncate">{m.name}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            </SettingSection>

                                            {/* 5. Bảo mật & Link Order */}
                                            <SettingSection title="5. Bảo mật & Link Order" icon={<Shield size={16} />} color="red">
                                                <div className="space-y-4">
                                                    <ToggleOption label="Chặn khách ở xa" subLabel="Mã QR tự động đổi để chỉ khách tại quán mới đặt được"
                                                        isOn={settings.qrProtectionEnabled} activeColor="red"
                                                        onToggle={async () => {
                                                            const newVal = !settings.qrProtectionEnabled;
                                                            setSettings({ ...settings, qrProtectionEnabled: newVal });
                                                            try {
                                                                await fetch(`${SERVER_URL}/api/settings/qr-protection`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: newVal }) });
                                                                if (newVal) fetchQrToken(); else setQrToken(null);
                                                            } catch (e) { }
                                                        }} />
                                                    <div className="bg-gray-50 p-3 border border-gray-100 flex items-center gap-4">
                                                        <div className="flex-1 min-w-0">
                                                            <p className="font-black text-gray-900 text-[10px] uppercase">Link đặt món {settings.cfEnabled ? '(HTTPS)' : '(Nội bộ)'}</p>
                                                            <div className="mt-1 text-[9px] font-mono text-gray-400 break-all select-all">
                                                                {(() => {
                                                                    const backendPort = SERVER_URL.split(':').pop().replace(/[^0-9]/g, '') || '5173';
                                                                    let baseUrl = `http://${lanIP}:${backendPort}/`;
                                                                    if (settings.cfEnabled) {
                                                                        if ((!settings.tunnelType || settings.tunnelType === 'auto') && cfStatus?.url) {
                                                                            baseUrl = `${cfStatus.url}/`;
                                                                        } else if (settings.tunnelType === 'manual' && settings.cfDomain) {
                                                                            baseUrl = `https://${settings.cfDomain}/`;
                                                                        }
                                                                    }
                                                                    if (settings.qrProtectionEnabled && qrToken) baseUrl += `?token=${qrToken}#/`;
                                                                    return baseUrl;
                                                                })()}
                                                            </div>
                                                        </div>
                                                        <button onClick={copyOrderLink} className="bg-brand-500 text-white p-2 hover:bg-brand-600"><Copy size={14} /></button>
                                                    </div>
                                                </div>
                                            </SettingSection>

                                            {/* 6. Đổi mật khẩu Admin */}
                                            <SettingSection title="6. Đổi mật khẩu Admin" icon={<Key size={16} />} color="red">
                                                <div className="space-y-4">
                                                    <div className="space-y-1">
                                                        <label className="text-[9px] font-black uppercase text-gray-400">Mật khẩu cũ</label>
                                                        <input type="password" value={passwordData.oldPassword} onChange={e => setPasswordData({ ...passwordData, oldPassword: e.target.value })} className="admin-input !text-sm !py-2" />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-[9px] font-black uppercase text-gray-400">Mật khẩu mới</label>
                                                        <input type="password" value={passwordData.newPassword} onChange={e => setPasswordData({ ...passwordData, newPassword: e.target.value })} className="admin-input !text-sm !py-2" />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-[9px] font-black uppercase text-gray-400">Xác nhận mật khẩu mới</label>
                                                        <input type="password" value={passwordData.confirmPassword} onChange={e => setPasswordData({ ...passwordData, confirmPassword: e.target.value })} className="admin-input !text-sm !py-2" />
                                                    </div>
                                                    {passwordMessage.text && (
                                                        <div className={`text-xs font-bold p-2 ${passwordMessage.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                                            {passwordMessage.text}
                                                        </div>
                                                    )}
                                                    <button onClick={handleChangePassword} className="w-full bg-red-500 text-white py-3 font-black text-sm uppercase tracking-widest hover:bg-red-600 transition-all shadow-lg shadow-red-500/10">
                                                        ĐỔI MẬT KHẨU
                                                    </button>
                                                </div>
                                            </SettingSection>

                                            {/* 9. Mã khôi phục hệ thống */}
                                            <SettingSection title="9. Mã khôi phục khẩn cấp (Quên mật khẩu)" icon={<KeyRound size={16} />} color="red">
                                                <div className="space-y-4">
                                                    <div className="bg-red-50 border border-red-100 p-4 rounded-none space-y-3">
                                                        <p className="text-[10px] font-black text-red-600 uppercase tracking-widest text-center">Mã Đăng Nhập Dành Cho Quản Lý</p>
                                                        <div className="flex bg-white rounded-none border border-red-200 overflow-hidden">
                                                            <div className="flex-1 py-3 text-center text-lg font-mono font-bold text-red-700 tracking-[0.2em]">{settings.adminRecoveryCode || 'Đang tải...'}</div>
                                                            <button onClick={() => { navigator.clipboard.writeText(settings.adminRecoveryCode); showToast('Đã chép mã khôi phục!', 'success'); }} className="bg-red-500 hover:bg-red-600 text-white px-4 flex items-center justify-center transition-colors">
                                                                <Copy size={18} />
                                                            </button>
                                                        </div>
                                                        <p className="text-[10px] font-medium text-red-500 text-center uppercase tracking-wide">*(Hãy lưu mã này vào điện thoại hoặc ghi ra giấy)*</p>
                                                    </div>
                                                    <div className="text-[11px] text-gray-600 leading-relaxed font-medium bg-gray-50 p-3 border border-gray-100 rounded-none">
                                                        <p>Khi bạn quên Mật khẩu đăng nhập Quản lý, hãy nhấn nút <b>"Quên Tên đăng nhập / Mật khẩu"</b> ngoài màn hình đăng nhập và nhập chính xác mã này.</p>
                                                        <p className="mt-2 text-[10px] text-gray-400"><i>*Mã của các nhân viên có thể xem trực tiếp trong tab "Nhân sự" khi Sửa thông tin.</i></p>
                                                    </div>
                                                </div>
                                            </SettingSection>

                                            {/* 10. Cloudflare Tunnel */}
                                            <SettingSection
                                                title="10. Cloudflare Tunnel (HTTPS)"
                                                icon={<Share2 size={16} />}
                                                color="blue"
                                                headerRight={
                                                    settings.cfEnabled && (
                                                        <div
                                                            className={`w-2.5 h-2.5 rounded-none shadow-sm ml-2 ${cfStatus?.active ? 'bg-green-500 animate-pulse' : 'bg-orange-400'}`}
                                                            title={cfStatus?.active ? 'Trực tuyến' : 'Đang khởi tạo...'}
                                                        />
                                                    )
                                                }
                                            >
                                                <div className="p-4 space-y-4">
                                                    <ToggleOption label="Kết nối HTTPS" subLabel="Bật để truy cập từ xa, tắt để chỉ dùng mạng nội bộ"
                                                        isOn={settings.cfEnabled} onToggle={() => {
                                                            setSettings({ ...settings, cfEnabled: !settings.cfEnabled });
                                                            showToast('Cần LƯU CÀI ĐẶT để thay đổi có hiệu lực!', 'info');
                                                        }} />

                                                    {settings.cfEnabled && (
                                                        <div className="space-y-4 pt-3 border-t border-gray-50">
                                                            <div className="space-y-2">
                                                                <label className="text-[10px] font-black text-gray-900 uppercase">Hình thức kết nối</label>
                                                                <div className="grid grid-cols-2 gap-2">
                                                                    <button
                                                                        onClick={() => setSettings({ ...settings, tunnelType: 'auto' })}
                                                                        className={`p-3 text-[10px] font-black uppercase text-center border transition-all ${(!settings.tunnelType || settings.tunnelType === 'auto') ? 'bg-brand-50 border-brand-500 text-brand-700' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}
                                                                    >
                                                                        Tạo tự động
                                                                    </button>
                                                                    <button
                                                                        onClick={() => setSettings({ ...settings, tunnelType: 'manual' })}
                                                                        className={`p-3 text-[10px] font-black uppercase text-center border transition-all ${settings.tunnelType === 'manual' ? 'bg-brand-50 border-brand-500 text-brand-700' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}
                                                                    >
                                                                        Dùng cấu hình
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            {(!settings.tunnelType || settings.tunnelType === 'auto') ? (
                                                                <div className="space-y-3">
                                                                    {cfStatus?.active && cfStatus?.url ? (
                                                                        <div className="bg-green-50/50 p-3 border border-green-100 flex items-center justify-between gap-3 text-[10px] font-black">
                                                                            <div className="flex items-center gap-2 overflow-hidden">
                                                                                <span className="text-green-700 uppercase shrink-0">Trực tuyến:</span>
                                                                                <span className="font-mono text-brand-600 truncate lowercase" title={cfStatus.url}>{cfStatus.url.replace('https://', '')}</span>
                                                                            </div>
                                                                            <div className="flex items-center gap-2 shrink-0">
                                                                                <button onClick={() => { navigator.clipboard.writeText(cfStatus.url); showToast('Đã copy Link', 'success'); }} className="text-gray-400 hover:text-brand-500 transition-colors"><Copy size={16} /></button>
                                                                                <a href={cfStatus.url} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-brand-500 transition-colors"><ExternalLink size={16} /></a>
                                                                            </div>
                                                                        </div>
                                                                    ) : (
                                                                        <div className="bg-brand-50 p-3 border border-brand-100 text-[10px] text-brand-700 font-medium">
                                                                            <p>Tên miền ngẫu nhiên được tự động mở bằng công nghệ Cloudflare Quick Tunnels.</p>
                                                                            <p className="mt-1 opacity-70">Lưu ý: Link này sẽ thay đổi mỗi khi bạn khởi động lại App.</p>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                <div className="space-y-3">
                                                                    <div className="space-y-1">
                                                                        <label className="text-[9px] font-black text-gray-400 uppercase">Tunnel Token</label>
                                                                        <input type="password" value={settings.cfToken} onChange={e => setSettings({ ...settings, cfToken: e.target.value })} className="admin-input !text-xs !py-2" placeholder="Dán mã token từ Cloudflare..." />
                                                                    </div>
                                                                    <div className="space-y-1">
                                                                        <label className="text-[9px] font-black text-gray-400 uppercase">Tên miền (Domain)</label>
                                                                        <input type="text" value={settings.cfDomain} onChange={e => setSettings({ ...settings, cfDomain: e.target.value })} className="admin-input !text-xs !py-2" placeholder="VD: cafe.cua-toi.vn" />
                                                                    </div>
                                                                    <button onClick={() => setShowCfGuide(!showCfGuide)} className="text-[9px] font-black text-brand-500 uppercase flex items-center gap-1">💡 Hướng dẫn cài đặt {showCfGuide ? <ChevronUp size={10} /> : <ChevronDown size={10} />}</button>
                                                                    <AnimatePresence>
                                                                        {showCfGuide && (
                                                                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden bg-brand-50/50 p-3 text-[9px] text-brand-700 leading-relaxed space-y-2 border-l-2 border-brand-200">
                                                                                <p>1. Vào <b>dash.cloudflare.com</b> → <b>Zero Trust</b> → <b>Tunnels</b>.</p>
                                                                                <p>2. Tạo Tunnel mới, copy mã <b>Token</b> dán vào ô trên.</p>
                                                                                <p>3. Trong mục <b>Public Hostname</b>: Trỏ tên miền về <b>localhost:5173</b>.</p>
                                                                                <p className="font-bold underline italic">* Sau khi Cài đặt, bạn cần Lưu lại để áp dụng.</p>
                                                                            </motion.div>
                                                                        )}
                                                                    </AnimatePresence>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </SettingSection>

                                            {/* 11. Quản lý thư mục dữ liệu */}
                                            <SettingSection title="11. Quản lý thư mục dữ liệu" icon={<Database size={16} />} color="blue">
                                                <div className="p-4 space-y-3">
                                                    <div className="space-y-1">
                                                        <label className="text-[9px] font-black uppercase text-gray-400">Đường dẫn hiện tại</label>
                                                        <div className="flex items-center gap-2 bg-white px-3 py-2 border border-brand-100">
                                                            <span className="text-[10px] font-mono text-gray-500 flex-1 truncate select-all">{currentDataPath || 'Đang tải...'}</span>
                                                            <button onClick={() => { navigator.clipboard.writeText(currentDataPath); showToast('Đã sao chép!', 'success'); }} className="text-gray-400 hover:text-brand-500"><Copy size={12} /></button>
                                                        </div>
                                                    </div>
                                                    <button onClick={handleChangeDataPath} className="w-full bg-brand-500 text-white py-2 text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all">THAY ĐỔI THƯ MỤC DỮ LIỆU</button>
                                                </div>
                                            </SettingSection>

                                            {/* 12. Tùy chọn máy in (In hóa đơn) */}
                                            <SettingSection title="12. Tùy chọn máy in (In hóa đơn)" icon={<Printer size={16} />} color="purple">
                                                <div className="p-4 space-y-4">
                                                    <ToggleOption label="Tự động in hóa đơn" subLabel="In biên lai bằng máy in nhiệt khi hoàn tất thanh toán"
                                                        isOn={printReceiptEnabled} onToggle={() => savePrinterSettings(selectedPrinter, !printReceiptEnabled)} />
                                                    {printReceiptEnabled && (
                                                        <div className="space-y-3 pt-3 border-t border-gray-50">
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                <div className="space-y-1">
                                                                    <label className="text-[10px] font-black uppercase text-gray-400">Máy in & cổng xuất</label>
                                                                    <div className="flex gap-2 items-center">
                                                                        <select
                                                                            value={selectedPrinter}
                                                                            onChange={(e) => savePrinterSettings(e.target.value, printReceiptEnabled)}
                                                                            className="admin-input !text-xs !py-3 bg-gray-50 cursor-pointer w-full"
                                                                        >
                                                                            <option value="">-- Máy in đã thiết lập mặc định --</option>
                                                                            {printers.map((p, idx) => (
                                                                                <option key={idx} value={p.name}>{p.name} {p.isDefault ? '(Mặc định)' : ''}</option>
                                                                            ))}
                                                                        </select>
                                                                    </div>
                                                                    {printers.length === 0 && (
                                                                        <p className="text-[9px] text-orange-500 italic flex items-center gap-1 mt-1">
                                                                            <AlertTriangle size={10} /> Đang tải hoặc không tìm thấy máy in nào.
                                                                        </p>
                                                                    )}
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <label className="text-[10px] font-black uppercase text-gray-400">Khổ giấy an toàn (Safe Zone)</label>
                                                                    <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                                                                        <select
                                                                            value={settings.receiptPaperSize || 'K80'}
                                                                            onChange={async (e) => {
                                                                                const newVal = e.target.value;
                                                                                const newSettings = { ...settings, receiptPaperSize: newVal };
                                                                                setSettings(newSettings);
                                                                                try {
                                                                                    await fetch(`${SERVER_URL}/api/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newSettings) });
                                                                                } catch (err) { }
                                                                            }}
                                                                            className="admin-input !text-xs !py-3 bg-gray-50 cursor-pointer w-full sm:flex-1"
                                                                        >
                                                                            <option value="K80">K80 (80mm) - Máy thu ngân lớn</option>
                                                                            <option value="K58">K58 (58mm) - Máy in mini, mPOS cầm tay</option>
                                                                        </select>
                                                                        <button
                                                                            onClick={async () => {
                                                                                if (!window.require) return alert('Chỉ hỗ trợ trên nền tảng Desktop!');
                                                                                try {
                                                                                    const tMode = settings.taxMode || "NONE";
                                                                                    const tRate = settings.taxRate || 8;
                                                                                    const mockSubTotal = 50000;
                                                                                    let mTax = 0, mTotal = mockSubTotal, mPreTax = mockSubTotal;

                                                                                    if (tMode === 'EXCLUSIVE') {
                                                                                        mTax = Math.round(mockSubTotal * (tRate / 100));
                                                                                        mTotal = mockSubTotal + mTax;
                                                                                    } else if (tMode === 'INCLUSIVE' || tMode === 'DIRECT_INCLUSIVE') {
                                                                                        mTax = Math.round(mockSubTotal - (mockSubTotal / (1 + (tRate / 100))));
                                                                                        mPreTax = mockSubTotal - mTax;
                                                                                    }

                                                                                    const mockOrder = {
                                                                                        id: "TEST-VAT",
                                                                                        price: mTotal,
                                                                                        preTaxTotal: mPreTax,
                                                                                        taxAmount: mTax,
                                                                                        taxMode: tMode,
                                                                                        taxRate: tRate,
                                                                                        queueNumber: 99,
                                                                                        timestamp: Date.now()
                                                                                    };
                                                                                    const mockCart = [
                                                                                        { item: { name: "Món A (Test)" }, count: 1, price: 30000, totalPrice: 30000 },
                                                                                        { item: { name: "Món B (Test)" }, count: 1, price: 20000, totalPrice: 20000 }
                                                                                    ];
                                                                                    const html = generateReceiptHTML(mockOrder, mockCart, settings, false);
                                                                                    await window.require('electron').ipcRenderer.invoke('print-html', html, selectedPrinter, settings?.receiptPaperSize);
                                                                                } catch (err) { alert('Lỗi: ' + err.message); }
                                                                            }}
                                                                            className="px-6 py-3 w-full sm:w-auto bg-brand-500 text-white text-[11px] font-black uppercase rounded-none shadow-sm hover:bg-brand-600 active:scale-95 transition-all outline-none flex items-center justify-center whitespace-nowrap"
                                                                        >
                                                                            In Test ({settings.receiptPaperSize === 'K58' ? 'K58' : 'K80'})
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <ReceiptBuilder
                                                                settings={settings}
                                                                setSettings={setSettings}
                                                                value={settings.receiptConfig}
                                                                onChange={(newConfig) => setSettings({ ...settings, receiptConfig: newConfig })}
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            </SettingSection>

                                            {/* 13. Kết nối thiết bị ngoại vi */}
                                            <SettingSection title="13. Kết nối thiết bị (iPad/iPhone)" icon={<Wifi size={16} />} color="indigo">
                                                <div className="p-6 space-y-8">
                                                    <div className="flex flex-col items-center text-center space-y-4">
                                                        <div className="p-4 bg-white border-2 border-dashed border-brand-200 rounded-none shadow-sm">
                                                            <QRCodeCanvas
                                                                value={`${window.location.protocol === 'file:' ? 'http:' : window.location.protocol}//${lanIP}:${window.location.port || '5173'}/?action=admin`}
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <p className="font-black text-xs uppercase tracking-widest text-gray-900">MÁY TÍNH TIỀN (POS)</p>
                                                            <p className="text-[10px] text-gray-400 font-bold italic truncate max-w-[220px]">
                                                                {`${window.location.protocol === 'file:' ? 'http:' : window.location.protocol}//${lanIP}:${window.location.port || '5173'}/?action=admin`}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div className="h-px bg-gray-100 w-full" />

                                                    <div className="flex flex-col items-center text-center space-y-4">
                                                        <div className="p-4 bg-white border-2 border-dashed border-pink-200 rounded-none shadow-sm">
                                                            <QRCodeCanvas
                                                                value={`${window.location.protocol === 'file:' ? 'http:' : window.location.protocol}//${lanIP}:${window.location.port || '5173'}/?action=kiosk`}
                                                                size={220}
                                                                level="H"
                                                                includeMargin={true}
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <p className="font-black text-xs uppercase tracking-widest text-gray-900">MÀN HÌNH KIOSK</p>
                                                            <p className="text-[10px] text-gray-400 font-bold italic truncate max-w-[220px]">
                                                                {`${window.location.protocol === 'file:' ? 'http:' : window.location.protocol}//${lanIP}:${window.location.port || '5173'}/?action=kiosk`}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div className="bg-amber-50 p-4 border border-amber-100 flex gap-3">
                                                        <Info size={16} className="text-amber-500 shrink-0" />
                                                        <p className="text-[10px] text-amber-700 font-bold leading-relaxed">
                                                            LƯU Ý: Đảm bảo thiết bị (iPad/iPhone) và máy chủ đang kết nối cùng một mạng Wi-Fi.
                                                        </p>
                                                    </div>
                                                </div>
                                            </SettingSection>

                                            {/* 14. CẬP NHẬT HỆ THỐNG */}
                                            {userRole === 'ADMIN' && (
                                                <SettingSection id="setting-system-update" title="14. Cập nhật hệ thống" icon={<RefreshCw size={16} />} color="brand" defaultExpanded={!!(latestVersion && isNewerVersion(latestVersion, systemVersion))}>
                                                    <div className="p-6 space-y-4">
                                                        <div className="flex justify-between items-center bg-gray-50 p-4 border border-gray-100">
                                                            <div className="space-y-1">
                                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Phiên bản hiện tại</p>
                                                                <p className="text-xl font-black text-gray-900">v{systemVersion}</p>
                                                            </div>
                                                            <div className="text-right space-y-1">
                                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Phiên bản mới nhất</p>
                                                                <p className={`text-xl font-black ${latestVersion && isNewerVersion(latestVersion, systemVersion) ? 'text-green-600' : 'text-gray-400'}`}>
                                                                    {latestVersion ? `v${latestVersion}` : 'Đang kiểm tra...'}
                                                                </p>
                                                            </div>
                                                        </div>

                                                        {latestVersion && isNewerVersion(latestVersion, systemVersion) ? (
                                                            <div className="bg-green-50 border border-green-100 p-4">
                                                                <div className="space-y-4">
                                                                    <p className="text-xs font-bold text-green-700 leading-relaxed">
                                                                        {!!(window.process && window.process.versions && window.process.versions.electron) ? (
                                                                            <>Phát hiện phiên bản mới v{latestVersion} cho Máy tính!</>
                                                                        ) : (
                                                                            <>Có phiên bản mới v{latestVersion} cho Máy chủ (Linux)! Hệ thống sẽ tự động tải mã nguồn từ GitHub, giải nén và khởi động lại dịch vụ PM2.</>
                                                                        )}
                                                                    </p>

                                                                    {isDesktopDownloading && desktopUpdateProgress && (
                                                                        <div className="space-y-4 py-2">
                                                                            <div className="space-y-2">
                                                                                <div className="flex justify-between items-end mb-1">
                                                                                    <span className="text-[10px] font-black text-green-600 uppercase">Đang tải bản cập nhật...</span>
                                                                                    <span className="text-sm font-black text-green-700">{Math.round(desktopUpdateProgress.percent)}%</span>
                                                                                </div>
                                                                                <div className="w-full h-3 bg-green-100 rounded-none overflow-hidden border border-green-200">
                                                                                    <div
                                                                                        className="h-full bg-green-500 transition-all duration-300 ease-out"
                                                                                        style={{ width: `${desktopUpdateProgress.percent}%` }}
                                                                                    />
                                                                                </div>
                                                                                <div className="flex justify-between text-[9px] font-bold text-green-600/70 uppercase">
                                                                                    <span>Tốc độ: {(desktopUpdateProgress.bytesPerSecond / (1024 * 1024)).toFixed(2)} MB/s</span>
                                                                                    <span>{Math.round(desktopUpdateProgress.transferred / (1024 * 1024))}MB / {Math.round(desktopUpdateProgress.total / (1024 * 1024))}MB</span>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    <div className="pt-2 border-t border-green-100">
                                                                        <p className="text-[9px] text-green-600 font-bold mb-2 uppercase italic">Tải trực tiếp bộ cài cho máy tính của bạn:</p>
                                                                        <div className="flex flex-col gap-2">
                                                                            {(() => {
                                                                                const platform = window.process?.platform;
                                                                                const isMac = platform === 'darwin';
                                                                                const isWin = platform === 'win32';

                                                                                const asset = latestAssets.find(a => {
                                                                                    if (isMac) return a.name.toLowerCase().endsWith('.dmg');
                                                                                    if (isWin) return a.name.toLowerCase().endsWith('.exe');
                                                                                    return false;
                                                                                });

                                                                                if (asset) {
                                                                                    return (
                                                                                        <a
                                                                                            href={asset.browser_download_url}
                                                                                            className="flex items-center justify-center gap-2 py-4 bg-green-500 text-white text-xs font-black uppercase hover:bg-green-600 transition-all shadow-md group"
                                                                                        >
                                                                                            <Download size={16} className="group-hover:translate-y-0.5 transition-transform" />
                                                                                            TẢI VỀ BẢN CHO {isMac ? 'MAC (.DMG)' : 'WINDOWS (.EXE)'} NGAY
                                                                                        </a>
                                                                                    );
                                                                                }

                                                                                return (
                                                                                    <a
                                                                                        href="https://github.com/mvcthinhofficial/order-cafe/releases/latest"
                                                                                        target="_blank"
                                                                                        rel="noopener noreferrer"
                                                                                        className="flex items-center justify-center gap-1.5 py-3 border-2 border-green-500 bg-white text-xs font-black text-green-700 uppercase hover:bg-green-50 transition-all shadow-sm"
                                                                                    >
                                                                                        <ExternalLink size={14} /> MỞ TRANG TẢI BẢN CẬP NHẬT (GITHUB)
                                                                                    </a>
                                                                                );
                                                                            })()}
                                                                            <p className="text-[9px] text-green-500 font-bold text-center mt-1 italic opacity-80">* Tự động nhận diện thiết bị: {window.process?.platform === 'darwin' ? 'MacOS' : (window.process?.platform === 'win32' ? 'Windows' : 'Khác')}</p>
                                                                        </div>
                                                                    </div>

                                                                    {!!(window.process && window.process.versions && window.process.versions.electron) && !isDesktopDownloading && (
                                                                        <p className="text-[10px] text-green-600 font-bold italic mt-2">
                                                                            {window.process?.platform === 'linux'
                                                                                ? '* Hệ thống sẽ tự động tải về và thông báo khi sẵn sàng.'
                                                                                : '* Vui lòng tải file cài đặt bên trên để nâng cấp thủ công.'}
                                                                        </p>
                                                                    )}

                                                                    <button
                                                                        onClick={handleSystemUpdate}
                                                                        disabled={isUpdating || isDesktopDownloading}
                                                                        className={`w-full py-4 bg-green-600 text-white font-black text-sm uppercase tracking-widest hover:bg-green-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-green-600/20 ${(isUpdating || isDesktopDownloading) ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                                    >
                                                                        {isUpdating || isDesktopDownloading ? <RefreshCw size={18} className="animate-spin" /> : <Download size={18} />}
                                                                        {isUpdating ? 'ĐANG CẬP NHẬT...' : (isDesktopDownloading ? 'ĐANG TẢI VỀ...' : (!!(window.process && window.process.versions && window.process.versions.electron) ? 'KIỂM TRA LẠI' : 'NÂNG CẤP MÁY CHỦ (LINUX)'))}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="bg-blue-50 border border-blue-100 p-4 flex items-center gap-3">
                                                                <CheckCircle size={20} className="text-blue-500" />
                                                                <p className="text-xs font-bold text-blue-700">
                                                                    Hệ thống của bạn đang ở phiên bản mới nhất.
                                                                </p>
                                                            </div>
                                                        )}

                                                        <div className="pt-2 border-t border-gray-100">
                                                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-2 text-center">Nguồn cập nhật: GitHub (mvcthinhofficial/order-cafe)</p>
                                                        </div>
                                                    </div>
                                                </SettingSection>
                                            )}

                                            {/* 15. KHAI TRƯƠNG QUÁN MỚI (FACTORY RESET) - Danger Zone */}
                                            {userRole === 'ADMIN' && (
                                                <SettingSection title="15. Khu vực đặc cấp (Danger Zone)" icon={<AlertTriangle size={16} />} color="red">
                                                    <div className="p-4 space-y-3 bg-red-50/50">
                                                        <div className="flex items-start gap-3">
                                                            <div className="bg-red-100 p-2 rounded-none text-red-600 mt-1">
                                                                <Rocket size={20} />
                                                            </div>
                                                            <div className="flex-1">
                                                                <h4 className="font-bold text-red-700 text-sm">BẮT ĐẦU QUÁN MỚI (Factory Reset)</h4>
                                                                <p className="text-xs text-red-600/80 mt-1 leading-relaxed">Tính năng này sẽ xóa sạch Lịch sử đơn hàng, Báo cáo Doanh thu, Chấm công nhân sự và Tồn kho nguyên liệu để hệ thống trở về ban đầu giống như một cửa hàng trống. (Menu thức uống, Định lượng món và Danh sách nhân sự sẽ được giữ nguyên). Trước khi xóa, toàn bộ dữ liệu cũ sẽ được lưu trữ an toàn vào thư mục "backups" nằm bên trong thư mục "data" trên máy chủ.</p>
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={() => setShowFactoryResetModal(true)}
                                                            className={`w-full py-3 text-xs font-black uppercase tracking-widest transition-all rounded-none mt-2 flex items-center justify-center gap-2 bg-red-600 text-white hover:bg-red-700 hover:shadow-lg hover:shadow-red-500/20`}
                                                        >
                                                            <Rocket size={14} /> HIỆU LỆNH KHAI TRƯƠNG
                                                        </button>
                                                    </div>
                                                </SettingSection>
                                            )}

                                            <div className="pt-4">
                                                <button onClick={async () => {
                                                    try {
                                                        const res = await fetch(`${SERVER_URL}/api/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
                                                        if (res.ok) { await fetchSettings(); showToast('Đã lưu thành công!', 'success'); }
                                                    } catch (err) { showToast('Lỗi khi lưu!', 'error'); }
                                                }} className="w-full bg-brand-500 text-white py-4 font-black text-sm uppercase tracking-widest hover:bg-[#2EB350] transition-all shadow-lg shadow-green-500/10 flex items-center justify-center gap-2">
                                                    <Save size={18} /> LƯU CÀI ĐẶT
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </section>
                            </motion.div>
                        )}
                    </AnimatePresence >
                </main >

                {/* Cancel Order Modal */}
                <AnimatePresence>
                    {cancelOrderId && (
                        <div className="fixed inset-0 z-[1200] flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                                className="bg-white w-full max-w-sm rounded-none overflow-hidden shadow-2xl"
                            >
                                <div className="p-8">
                                    <div className="w-14 h-14 bg-red-50  flex items-center justify-center mx-auto mb-5">
                                        <XCircle size={28} className="text-red-500" />
                                    </div>
                                    <h3 className="text-lg font-black text-gray-900 text-center mb-1">HỦY ĐƠN HÀNG</h3>
                                    <p className="text-xs text-gray-400 font-bold text-center uppercase tracking-widest mb-6">Đơn sẽ được lưu vào báo cáo</p>
                                    <div className="space-y-3">
                                        <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Lý do hủy (không bắt buộc)</p>
                                        <div className="flex gap-2 flex-wrap">
                                            {['Khách đổi ý', 'Hết nguyên liệu', 'Khách không đến', 'Lỗi order'].map(r => (
                                                <button key={r} onClick={() => setCancelReason(r)}
                                                    className={`px-3 py-1.5  text-xs font-black transition-all border ${cancelReason === r ? 'bg-gray-900 text-white border-gray-900' : 'bg-gray-50 text-gray-500 border-gray-100 hover:border-gray-300'}`}>
                                                    {r}
                                                </button>
                                            ))}
                                        </div>
                                        <input
                                            type="text"
                                            value={cancelReason}
                                            onChange={e => setCancelReason(e.target.value)}
                                            placeholder="Hoặc nhập lý do..."
                                            className="w-full bg-gray-50 border border-gray-100  px-5 py-4 text-sm font-bold text-gray-800 outline-none focus:ring-2 focus:ring-red-200 focus:border-red-200 transition-all"
                                        />
                                    </div>
                                </div>
                                <div className="p-6 pt-0 flex gap-3">
                                    <button onClick={() => { setCancelOrderId(null); setCancelReason(''); }}
                                        className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-none font-bold text-sm uppercase tracking-wider hover:bg-slate-200 active:scale-95 transition-all">
                                        QUAY LẠI
                                    </button>
                                    <button onClick={() => cancelOrder(cancelOrderId, cancelReason || 'Khách đổi ý')}
                                        className="flex-1 py-4 bg-red-500 text-white rounded-none font-bold text-sm uppercase tracking-wider hover:bg-red-600 active:scale-95 transition-all shadow-lg shadow-red-500/20">
                                        XÁC NHẬN HỦY
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Order Details Modal (for Reports) */}
                <AnimatePresence>
                    {selectedLog && (() => {
                        const modalOrderData = selectedLog.orderData || {};
                        const mCreateTime = modalOrderData.timestamp ? new Date(modalOrderData.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '--:--';
                        const mCompleteTime = (selectedLog.type === 'COMPLETED' && selectedLog.timestamp) ? new Date(selectedLog.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '--:--';

                        // Stay Time Math
                        const durationMs = (selectedLog.timestamp && modalOrderData.timestamp) ? (new Date(selectedLog.timestamp).getTime() - new Date(modalOrderData.timestamp).getTime()) : 0;
                        const mMins = Math.max(0, Math.floor(durationMs / 60000));
                        const mHours = Math.floor(mMins / 60);
                        const mRemMins = mMins % 60;
                        const mStayTimeStr = mHours > 0 ? `${mHours}h${mRemMins > 0 ? ` ${mRemMins}p` : ''}` : `${mMins}p`;
                        const mShowStay = (!settings?.requirePrepayment && selectedLog.type === 'COMPLETED' && (modalOrderData.orderSource || 'INSTORE') === 'INSTORE');

                        return (
                            <div className="fixed inset-0 z-[1100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                                    className="bg-white w-full max-w-lg rounded-none overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
                                >
                                    <div className="p-8 border-b border-gray-100 flex justify-between items-start bg-gray-50/50">
                                        <div>
                                            <h3 className="text-xl font-bold text-gray-900 leading-tight mb-1">CHI TIẾT ĐƠN HÀNG</h3>
                                            <div className="text-[11px] text-gray-500 font-medium uppercase tracking-widest flex items-center gap-2 mb-1.5">
                                                <span>Mã: {getLogOrderId(selectedLog)}</span>
                                                <span className="text-gray-300">•</span>
                                                <span>{new Date(selectedLog.timestamp).toLocaleDateString('vi-VN')}</span>
                                            </div>
                                            <div className="text-[11px] font-medium text-gray-600 flex items-center gap-2">
                                                <span className="text-gray-400 uppercase tracking-widest">In:</span> <span className="text-gray-900 text-sm">{mCreateTime}</span>
                                                <span className="text-gray-400 uppercase tracking-widest ml-1">Out:</span> <span className="text-brand-600 text-sm">{mCompleteTime}</span>
                                                {mShowStay && (
                                                    <>
                                                        <span className="text-gray-300 mx-1">-</span>
                                                        <span className="text-brand-600 text-sm">{mStayTimeStr}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        <button onClick={() => setSelectedLog(null)} className="p-3 bg-white rounded-none transition-all shadow-sm border border-gray-100 hover:bg-gray-50 active:scale-95">
                                            <X size={24} className="text-gray-500" />
                                        </button>
                                    </div>

                                    <div className="flex-1 overflow-y-auto p-8 space-y-6">
                                        {/* Status Badge */}
                                        <div className="flex justify-center">
                                            {(() => {
                                                const isCanceledLog = selectedLog.type === 'CANCELLED';
                                                const isCurrentlyDebt = modalOrderData.isDebt;
                                                const isActuallyPaid = modalOrderData.isPaid && !modalOrderData.isDebt;

                                                if (isCanceledLog) {
                                                    return <span className="px-6 py-2 bg-red-100 text-red-700 font-bold text-xs uppercase tracking-[0.1em]">Đã hủy</span>;
                                                }
                                                if (isCurrentlyDebt) {
                                                    return <span className="px-6 py-2 bg-purple-100 text-purple-700 font-bold text-xs uppercase tracking-[0.1em]">Đang Nợ</span>;
                                                }
                                                if (isActuallyPaid || selectedLog.type === 'COMPLETED' || selectedLog.type === 'DEBT_PAID') {
                                                    return <span className="px-6 py-2 bg-green-100 text-green-700 font-bold text-xs uppercase tracking-[0.1em]">Đã hoàn tất</span>;
                                                }
                                                return <span className="px-6 py-2 bg-gray-100 text-gray-700 font-bold text-xs uppercase tracking-[0.1em]">{selectedLog.type}</span>;
                                            })()}
                                        </div>

                                        {/* Items */}
                                        <div className="space-y-4">
                                            <p className="text-[10px] font-bold uppercase text-gray-400 tracking-widest px-1">Danh sách món</p>
                                            <div className="bg-slate-50 p-6 space-y-4 rounded-none border border-slate-100">
                                                {selectedLog.orderData?.cartItems ? (
                                                    selectedLog.orderData.cartItems.map((c, i) => {
                                                        const details = [];
                                                        if (c.size || c.item?.sizes?.length > 0) details.push(`Size ${c.size?.label || 'S'}`);
                                                        if (c.sugar) details.push(`Đường ${c.sugar}`);
                                                        if (c.ice) details.push(`Đá ${c.ice === 'Bình thường' ? 'Bth' : c.ice}`);
                                                        if (c.addons && c.addons.length > 0) {
                                                            c.addons.forEach(a => details.push(`+ ${a.label}`));
                                                        }
                                                        const detailsStr = details.join(', ');

                                                        return (
                                                            <div key={i} className="flex flex-col border-b border-gray-200/50 pb-3 mb-3 last:border-0 last:pb-0 last:mb-0">
                                                                <div className="flex justify-between items-start">
                                                                    <p className="font-medium text-gray-900 text-base">
                                                                        {i + 1} - {c.item?.name} <span className="text-gray-500 text-sm ml-1 font-medium">x{c.count}</span>
                                                                    </p>
                                                                    {!detailsStr && (
                                                                        <p className="font-bold text-sm text-gray-900 whitespace-nowrap">{formatVND(c.totalPrice * c.count)}</p>
                                                                    )}
                                                                </div>
                                                                {detailsStr && (
                                                                    <div className="flex justify-between items-start mt-0.5">
                                                                        <p className="text-sm text-gray-500 flex-1 pr-4 leading-snug">{detailsStr}</p>
                                                                        <p className="font-bold text-sm text-gray-900 whitespace-nowrap">{formatVND(c.totalPrice * c.count)}</p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })
                                                ) : (
                                                    <div className="space-y-4">
                                                        {selectedLog.itemName?.split(', ').map((itemStr, idx) => (
                                                            <div key={idx} className="flex justify-between items-start border-b border-gray-200/50 pb-4 last:border-0 last:pb-0">
                                                                <p className="font-medium text-gray-800 text-base">{itemStr}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Summary */}
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="bg-slate-50 p-5 rounded-none border border-slate-100">
                                                <p className="text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-1">Khách hàng</p>
                                                <p className="font-bold text-sm text-slate-800 truncate">{selectedLog.customerName || 'N/A'}</p>
                                            </div>
                                            <div className="bg-brand-50 p-5 rounded-none border border-brand-100 text-right">
                                                <p className="text-[10px] font-bold uppercase text-gray-400 tracking-widest mb-1">Tổng cộng</p>
                                                <p className="font-black text-xl text-brand-600">
                                                    {formatVND((selectedLog.orderData?.cartItems || []).reduce((ac, c) => ac + (parseFloat(c.totalPrice) * c.count), 0) - (parseFloat(selectedLog.orderData?.discount) || 0))}
                                                </p>
                                            </div>
                                        </div>

                                        {selectedLog.type === 'CANCELLED' && selectedLog.reason && (
                                            <div className="bg-red-50 p-5 rounded-none border border-red-100">
                                                <p className="text-[10px] font-bold uppercase text-red-500 tracking-widest mb-1">Lý do hủy</p>
                                                <p className="font-medium text-sm text-red-700 italic">"{selectedLog.reason}"</p>
                                            </div>
                                        )}
                                    </div>

                                    <div className="p-8 border-t border-slate-100 bg-white flex gap-4">
                                        <button onClick={() => setSelectedLog(null)} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-none font-bold text-sm uppercase tracking-widest hover:bg-slate-200 active:scale-95 transition-all">
                                            ĐÓNG CHI TIẾT
                                        </button>
                                        {selectedLog.type === 'COMPLETED' && window.require && (
                                            <button
                                                onClick={() => {
                                                    const selectedPrinter = localStorage.getItem('selectedPrinter');
                                                    if (!selectedPrinter) {
                                                        showToast('Chưa chọn máy in mặc định trong cài đặt', 'error');
                                                        return;
                                                    }
                                                    const { ipcRenderer } = window.require('electron');
                                                    try {
                                                        const cartForPrint = selectedLog.orderData?.cartItems || [];
                                                        const logOrderData = {
                                                            id: getLogOrderId(selectedLog),
                                                            queueNumber: selectedLog.queueNumber,
                                                            tagNumber: selectedLog.orderData?.tagNumber,
                                                            tableName: selectedLog.orderData?.tableName,
                                                            customerName: selectedLog.orderData?.customerName,
                                                            customerPhone: selectedLog.orderData?.customerPhone,
                                                            price: (selectedLog.orderData?.cartItems || []).reduce((ac, c) => ac + (parseFloat(c.totalPrice || c.price) * c.count), 0) - (parseFloat(selectedLog.orderData?.discount) || 0),
                                                            paymentMethod: selectedLog.orderData?.paymentMethod,
                                                            timestamp: selectedLog.timestamp
                                                        };
                                                        const htmlContent = generateReceiptHTML(logOrderData, cartForPrint, settings, true);
                                                        ipcRenderer.invoke('print-html', htmlContent, selectedPrinter, settings?.receiptPaperSize).catch(console.error);
                                                    } catch (err) {
                                                        console.error('Lỗi in hóa đơn:', err);
                                                    }
                                                }}
                                                className="flex-1 py-4 bg-brand-100 text-brand-700 rounded-none font-bold text-sm uppercase tracking-widest hover:bg-brand-200 active:scale-95 transition-all flex items-center justify-center gap-2"
                                            >
                                                <Printer size={18} /> IN LẠI BILL
                                            </button>
                                        )}
                                        {modalOrderData.isDebt && (
                                            <button
                                                onClick={() => {
                                                    setSelectedLog(null);
                                                    handlePayDebt(modalOrderData.id); // Gọi pop-up thu nợ
                                                }}
                                                className="flex-1 py-4 bg-purple-600 text-white rounded-none font-bold text-sm uppercase tracking-widest hover:bg-purple-700 active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-500/30"
                                            >
                                                <DollarSign size={18} /> THU NỢ ĐƠN NÀY
                                            </button>
                                        )}
                                    </div>
                                </motion.div>
                            </div>
                        )
                    })()}
                </AnimatePresence>


                {/* Staff Report Modal */}
                {showStaffReport && (
                    <StaffReportModal
                        member={showStaffReport}
                        staff={staff}
                        shifts={shifts}
                        setShifts={setShifts}
                        schedules={schedules}
                        onClose={() => setShowStaffReport(null)}
                    />
                )}

                {/* Quick Payment Confirmation Modal */}
                <AnimatePresence>
                    {confirmZeroOrder && (
                        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-6">
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setConfirmZeroOrder(null)} />
                            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white p-8 rounded-none shadow-2xl z-10 w-full max-w-md text-center border-4 border-brand-500">
                                <div className="w-20 h-20 bg-green-100 rounded-none flex items-center justify-center mx-auto mb-6 shadow-inner text-green-600">
                                    <CheckCircle2 size={40} />
                                </div>
                                <h2 className="text-2xl font-black text-gray-900 mb-2 uppercase">Thu Tiền Đơn Số {confirmZeroOrder.queueNumber}?</h2>
                                <p className="text-gray-500 font-bold mb-8">Xác nhận nhận <span className="text-[#C68E5E] text-xl font-black">{formatVND(confirmZeroOrder.price)}</span> từ khách <span className="text-gray-900 font-black">{confirmZeroOrder.customerName}</span>?</p>

                                <div className="flex gap-4">
                                    <button onClick={() => setConfirmZeroOrder(null)} className="flex-1 py-4 bg-gray-100 text-gray-600 font-black rounded-none hover:bg-gray-200 uppercase tracking-widest text-sm transition-all focus:outline-none focus:ring-4 focus:ring-gray-200">
                                        [ESC] THOÁT
                                    </button>
                                    <button onClick={() => {
                                        confirmPayment(confirmZeroOrder.id);
                                        setConfirmZeroOrder(null);
                                    }} className="flex-1 py-4 bg-brand-500 text-white font-black rounded-none hover:bg-[#2EB350] shadow-lg shadow-green-500/20 uppercase tracking-widest text-sm transition-all focus:outline-none focus:ring-4 focus:ring-green-300">
                                        [ENTER] XÁC NHẬN
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Toast System */}
                < div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[1000] flex flex-col gap-3" >
                    <AnimatePresence>
                        {toasts.map(t => (
                            <motion.div key={t.id} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                                className={`px-6 py-3  font-black text-sm shadow-2xl flex items-center gap-3 border ${t.type === 'error' ? 'bg-red-500 text-white border-red-600' : 'bg-gray-900 text-white border-black'}`}>
                                {t.type === 'error' ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} className="text-green-400" />}
                                {t.message}
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div >
                {/* Floating POS ORDER Button & QR Button */}
                {!showOrderPanel && !expandedItemId && activeTab !== 'reports' && activeTab !== 'settings' && activeTab !== 'inventory' && !showAuditModal && (
                    <div className="fixed bottom-8 right-8 z-[900] flex items-center gap-3">
                        <ShortcutDoubleEnter onDoubleEnter={() => setShowOrderPanel(true)} />

                        <button
                            onClick={async () => {
                                try {
                                    const res = await fetch(`${SERVER_URL}/api/settings/toggle-staff-kiosk-qr`, { method: 'POST' });
                                    const data = await res.json();
                                    if (data.success) {
                                        setSettings(prev => ({
                                            ...prev,
                                            showStaffQrOnKiosk: data.showStaffQrOnKiosk
                                        }));
                                    }
                                } catch (e) {
                                    console.error("Toggle Staff QR error", e);
                                }
                            }}
                            className={`p-5 shadow-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all outline-none ring-4 ${settings.showStaffQrOnKiosk ? 'bg-brand-600 text-white ring-[#007AFF]/20' : 'bg-white text-brand-600 border border-brand-100 ring-gray-100'}`}
                            title="Bật/Tắt Kiosk Chấm Công"
                        >
                            <UserRound size={36} />
                        </button>

                        <button
                            onClick={async () => {
                                try {
                                    const newStatus = !settings.showQrOnKiosk;
                                    // 1. Toggle QR display on Kiosk
                                    await fetch(`${SERVER_URL}/api/settings/toggle-kiosk-qr`, {
                                        method: 'POST',
                                        headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
                                    });
                                    // 2. Sync Protection state with Display state (If QR is ON, Protection must be ON)
                                    await fetch(`${SERVER_URL}/api/settings/qr-protection`, {
                                        method: 'POST',
                                        headers: {
                                            'Content-Type': 'application/json',
                                            'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                                        },
                                        body: JSON.stringify({ enabled: newStatus })
                                    });

                                    setSettings(prev => ({
                                        ...prev,
                                        showQrOnKiosk: newStatus,
                                        qrProtectionEnabled: newStatus
                                    }));
                                } catch (e) {
                                    console.error("Toggle QR error", e);
                                }
                            }}
                            className={`p-5 shadow-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all outline-none ring-4 ${settings.showQrOnKiosk ? 'bg-brand-500 text-white ring-brand-500/20' : 'bg-white text-brand-600 border border-brand-100 ring-gray-100'}`}
                            title="Bật/Tắt mã QR Web ORDER (Hiển thị mã QR lên Kiosk để Khách tự quét bằng Điện Thoại và tự Order)"
                        >
                            <QrCode size={36} />
                        </button>

                        <button
                            onClick={() => setShowOrderPanel(true)}
                            className="group relative bg-brand-600 text-white px-8 py-5 shadow-2xl flex items-center gap-3 font-black text-2xl hover:scale-105 active:scale-95 transition-all outline-none ring-4 ring-[#007AFF]/20"
                        >
                            <ShoppingBag size={36} />
                            ORDER
                            {/* Gợi ý hotkey */}
                            <div className="absolute top-0 -translate-y-1/2 right-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity translate-x-1/2">
                                <span style={{ fontSize: 12, padding: '4px 6px', background: '#FFD60A', color: '#000', borderRadius: 6, fontWeight: 900, boxShadow: '0 4px 12px rgba(0,0,0,0.3)', fontFamily: 'monospace' }}>↵</span>
                                <span style={{ fontSize: 12, padding: '4px 6px', background: '#FFD60A', color: '#000', borderRadius: 6, fontWeight: 900, boxShadow: '0 4px 12px rgba(0,0,0,0.3)', fontFamily: 'monospace' }}>↵</span>
                            </div>
                        </button>
                    </div>
                )}
                {/* Bán Thành Phẩm Production Modal */}
                {showProductionModal && (
                    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[100] overflow-y-auto">
                        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white max-w-2xl w-full shadow-2xl rounded-none my-8 relative">
                            <button onClick={() => setShowProductionModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-900 transition-colors z-10"><X size={24} /></button>
                            <div className="p-6 border-b border-gray-100 bg-orange-50">
                                <div className="flex items-center gap-3 text-orange-600 mb-2">
                                    <RefreshCw size={28} />
                                    <h3 className="text-2xl font-black uppercase tracking-widest">Chế Biến Bán Thành Phẩm</h3>
                                </div>
                                <p className="text-sm font-bold text-gray-500">Chuyển hóa Nguyên liệu thô (Trừ kho) thành Bán thành phẩm mới (Cộng kho).</p>
                            </div>

                            <div className="p-6 space-y-6">
                                {/* Nguyên Liệu Thô Đầu Vào */}
                                <div className="p-4 bg-gray-50 border border-gray-200">
                                    <h4 className="font-black text-sm uppercase text-gray-700 mb-3 flex items-center gap-2"><ArrowDown size={16} className="text-red-500" /> NGUYÊN LIỆU THÔ HAO HỤT (- Trừ Kho)</h4>

                                    {productionInputs.map((input, idx) => {
                                        const selectedInv = inventory.find(i => i.id === input.id);
                                        return (
                                            <div key={idx} className="flex flex-col mb-3">
                                                <div className="flex gap-2">
                                                    <select
                                                        value={input.id}
                                                        onChange={(e) => {
                                                            const newInputs = [...productionInputs];
                                                            newInputs[idx].id = e.target.value;
                                                            setProductionInputs(newInputs);
                                                        }}
                                                        className={`flex-1 p-3 border-2 outline-none font-bold text-sm bg-white ${selectedInv && parseFloat(input.qty) > selectedInv.stock ? 'border-red-400 focus:border-red-500 text-red-700' : 'border-gray-200 focus:border-orange-500'}`}
                                                    >
                                                        <option value="">-- Chọn Nguyên Liệu Thô --</option>
                                                        {inventory.map(inv => (
                                                            <option key={inv.id} value={inv.id}>{inv.name} (Tồn hiện tại: {inv.stock} {inv.unit})</option>
                                                        ))}
                                                    </select>
                                                    <div className="relative w-32">
                                                        <input
                                                            type="number"
                                                            min="0" step="0.1"
                                                            placeholder="Khối lượng"
                                                            value={input.qty}
                                                            onChange={(e) => {
                                                                const newInputs = [...productionInputs];
                                                                newInputs[idx].qty = e.target.value;
                                                                setProductionInputs(newInputs);
                                                            }}
                                                            className={`w-full p-3 pr-10 border-2 outline-none font-bold text-sm text-center ${selectedInv && parseFloat(input.qty) > selectedInv.stock ? 'border-red-400 focus:border-red-500 text-red-700 bg-red-50' : 'border-gray-200 focus:border-orange-500'}`}
                                                        />
                                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold pointer-events-none text-gray-400">
                                                            {selectedInv ? selectedInv.unit : ''}
                                                        </span>
                                                    </div>
                                                    {productionInputs.length > 1 && (
                                                        <button onClick={() => setProductionInputs(productionInputs.filter((_, i) => i !== idx))} className="px-4 bg-red-100 text-red-600 hover:bg-red-200 transition-colors font-black"><Trash2 size={16} /></button>
                                                    )}
                                                </div>
                                                {selectedInv && parseFloat(input.qty) > selectedInv.stock && (
                                                    <p className="text-xs font-black text-red-500 mt-1 pl-1 flex items-center gap-1">
                                                        ⚠️ Vượt quá số lượng tồn kho hiện tại ({selectedInv.stock} {selectedInv.unit})
                                                    </p>
                                                )}
                                            </div>
                                        );
                                    })}
                                    <button
                                        onClick={() => setProductionInputs([...productionInputs, { id: '', qty: '' }])}
                                        className="text-orange-600 font-bold text-sm flex items-center gap-1 hover:text-orange-700 uppercase"
                                    >
                                        <Plus size={14} /> Thêm Nguyên Liệu Thô Khác
                                    </button>

                                    {/* Báo giá vốn tạm tính */}
                                    <div className="mt-4 pt-3 border-t border-gray-200 flex justify-between items-center text-sm">
                                        <span className="font-bold text-gray-500">Tổng Giá Vốn Tạm Tính (COGS):</span>
                                        <span className="font-black text-red-600">
                                            {formatVND(productionInputs.reduce((sum, input) => {
                                                const stat = inventoryStats.find(s => s.id === input.id);
                                                // Nếu không có trung bình trong inventoryStats, rớt về importPrice của inventory
                                                const costPrice = stat?.avgCost || inventory.find(i => i.id === input.id)?.importPrice || 0;
                                                return sum + (costPrice * (parseFloat(input.qty) || 0));
                                            }, 0))}
                                        </span>
                                    </div>
                                </div>

                                {/* Bán Thành Phẩm Đầu Ra */}
                                <div className="p-4 bg-orange-50/50 border border-orange-200">
                                    <h4 className="font-black text-sm uppercase text-orange-700 mb-3 flex items-center gap-2"><ArrowUp size={16} className="text-brand-500" /> BÁN THÀNH PHẨM THU ĐƯỢC (+ Cộng Kho)</h4>
                                    <div className="flex gap-2">
                                        <div className="flex-[2] relative">
                                            <input
                                                type="text"
                                                list="production-outputs"
                                                placeholder="VD: Cốt Cafe Phin (Tên mới hoặc chọn sẵn)"
                                                value={productionOutputItem}
                                                onChange={(e) => {
                                                    setProductionOutputItem(e.target.value);
                                                    const existing = inventory.find(i => i.name.toLowerCase() === e.target.value.toLowerCase() || i.id === e.target.value);
                                                    if (existing) setProductionOutputUnit(existing.unit);
                                                    else setProductionOutputUnit('');
                                                }}
                                                className="w-full p-3 border-2 border-orange-200 outline-none focus:border-orange-500 font-bold text-sm bg-white text-orange-900"
                                            />
                                            <datalist id="production-outputs">
                                                {inventory.map(inv => (
                                                    <option key={inv.id} value={inv.name}>{inv.stock} {inv.unit} hiện hành</option>
                                                ))}
                                            </datalist>
                                        </div>

                                        {(() => {
                                            const existing = inventory.find(i => i.name.toLowerCase() === productionOutputItem.toLowerCase() || i.id === productionOutputItem);
                                            return !existing ? (
                                                <input
                                                    type="text"
                                                    placeholder="Đơn vị (ml, g, ly...)"
                                                    value={productionOutputUnit}
                                                    onChange={(e) => setProductionOutputUnit(e.target.value)}
                                                    className="flex-1 p-3 border-2 border-orange-200 outline-none focus:border-orange-500 font-bold text-sm bg-white text-orange-900"
                                                />
                                            ) : null;
                                        })()}

                                        <div className="relative w-40">
                                            <input
                                                type="number"
                                                min="0" step="0.1"
                                                placeholder="Sản lượng"
                                                value={productionOutputQty}
                                                onChange={(e) => setProductionOutputQty(e.target.value)}
                                                className="w-full p-3 pr-10 border-2 border-orange-200 outline-none focus:border-orange-500 font-black text-orange-900 text-lg text-center bg-white"
                                            />
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-black text-orange-400 pointer-events-none">
                                                {inventory.find(i => i.name.toLowerCase() === productionOutputItem.toLowerCase() || i.id === productionOutputItem)?.unit || productionOutputUnit || ''}
                                            </span>
                                        </div>
                                    </div>
                                    {/* Đoán giá vốn mẻ và đơn vị */}
                                    {productionOutputQty > 0 && productionOutputItem && (() => {
                                        const outputUnitDisplay = inventory.find(i => i.name.toLowerCase() === productionOutputItem.toLowerCase() || i.id === productionOutputItem)?.unit || productionOutputUnit || 'đơn vị';
                                        const batchCost = productionInputs.reduce((sum, input) => {
                                            const stat = inventoryStats.find(s => s.id === input.id);
                                            const costPrice = stat?.avgCost || inventory.find(i => i.id === input.id)?.importPrice || 0;
                                            return sum + (costPrice * (parseFloat(input.qty) || 0));
                                        }, 0);
                                        return (
                                            <div className="mt-3 text-sm font-bold text-brand-800 flex flex-col gap-1 bg-brand-100/50 p-3 border border-brand-200">
                                                <div className="flex justify-between items-center bg-white p-2 rounded-none border border-brand-100 shadow-sm">
                                                    <span>Tổng giá trị dồn sang {productionOutputQty} {outputUnitDisplay}:</span>
                                                    <span className="font-black text-lg text-red-600">{formatVND(batchCost)}</span>
                                                </div>
                                                <div className="flex justify-between items-center px-2 pt-1 text-brand-600">
                                                    <span className="text-xs">Giá vốn trung bình chia ra 1 {outputUnitDisplay}:</span>
                                                    <span className="font-bold">{formatVND(batchCost / parseFloat(productionOutputQty))}</span>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>

                            <div className="p-6 bg-gray-50 flex gap-3 border-t border-gray-100">
                                <button
                                    onClick={() => setShowProductionModal(false)}
                                    className="flex-1 py-4 bg-white border-2 border-gray-200 text-gray-500 font-black hover:bg-gray-50 transition-colors uppercase tracking-widest text-sm"
                                >
                                    HỦY BỎ
                                </button>
                                <button
                                    onClick={async () => {
                                        // Validation logic
                                        // Validation logic
                                        const validInputs = productionInputs.filter(i => i.id && parseFloat(i.qty) > 0);
                                        if (validInputs.length === 0) return alert("Vui lòng chọn ít nhất 1 nguyên liệu thô bị trừ đi!");

                                        const outOfStockInputs = validInputs.filter(i => {
                                            const inv = inventory.find(invItem => invItem.id === i.id);
                                            return inv && parseFloat(i.qty) > inv.stock;
                                        });
                                        if (outOfStockInputs.length > 0) {
                                            const names = outOfStockInputs.map(i => inventory.find(inv => inv.id === i.id)?.name).join(', ');
                                            return alert(`Không đủ tồn kho để chuyển hoá nguyên liệu: ${names}. Cần kiểm tra lại định lượng!`);
                                        }

                                        if (!productionOutputItem) return alert("Vui lòng gõ Tên Bán thành phẩm nhắm đến!");
                                        const isNew = !inventory.find(i => i.name.toLowerCase() === productionOutputItem.toLowerCase() || i.id === productionOutputItem);
                                        if (isNew && !productionOutputUnit) return alert("Vui lòng bổ sung Đơn vị tính (VD: ml, phần...) cho món mới này!");
                                        if (parseFloat(productionOutputQty) <= 0 || !productionOutputQty) return alert("Vui lòng nhập số lượng Bán thành phẩm thu được hợp lệ!");

                                        if (!window.confirm("Hãy kiểm tra kỹ đơn vị tính và số lượng. Dòng tiền Giá trị Tồn Kho sẽ được điều chuyển mà không sinh ra Phiếu Nhập.\nBạn chắc chắn chứ?")) return;

                                        try {
                                            const res = await fetch(`${SERVER_URL}/api/inventory/produce`, {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({
                                                    inputs: validInputs.map(i => {
                                                        const stat = inventoryStats.find(s => s.id === i.id);
                                                        const costPrice = stat?.avgCost || inventory.find(inv => inv.id === i.id)?.importPrice || 0;
                                                        return { id: i.id, qty: parseFloat(i.qty), unitCost: costPrice };
                                                    }),
                                                    outputItemName: productionOutputItem,
                                                    outputUnit: productionOutputUnit,
                                                    outputQty: parseFloat(productionOutputQty),
                                                    userName: localStorage.getItem('adminToken') ? 'Admin' : 'Staff'
                                                })
                                            });
                                            const data = await res.json();
                                            if (res.ok && data.success) {
                                                showToast('Đã San Chiết Thành Công!', 'success');
                                                fetchData();
                                                setShowProductionModal(false);
                                                setProductionInputs([{ id: '', qty: '' }]);
                                                setProductionOutputItem('');
                                                setProductionOutputQty('');
                                                setProductionOutputUnit('');
                                            } else {
                                                alert(data.message || "Lỗi khi chế biến");
                                            }
                                        } catch (e) {
                                            alert("Lỗi kết nối máy chủ");
                                        }
                                    }}
                                    className="flex-1 py-4 bg-orange-600 text-white font-black hover:bg-orange-700 transition-colors uppercase tracking-widest shadow-lg shadow-orange-600/30 text-sm flex items-center justify-center gap-2"
                                >
                                    <RefreshCw size={18} /> THỰC THI CHẾ BIẾN
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* Inventory Audit Modal */}
                <InventoryAuditModal
                    isOpen={showAuditModal}
                    onClose={() => setShowAuditModal(false)}
                    inventory={inventory}
                    onSave={() => {
                        fetchData();
                        showToast('Đã chốt phiếu Kiểm Kho thành công!', 'success');
                        setAuditReportTab('manual');
                        setTimeout(() => {
                            document.getElementById('inventory-audit-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }, 100);
                    }}
                />
                {/* Delete Inventory Modal */}
                {deleteInventoryModal && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[1100]">
                        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white max-w-sm w-full rounded-none shadow-2xl overflow-hidden shadow-red-500/20">
                            <div className="p-6 text-center bg-red-50/30">
                                <div className="w-16 h-16 bg-red-50 rounded-none flex items-center justify-center mx-auto mb-4 text-red-500">
                                    <Trash2 size={32} />
                                </div>
                                <h3 className="text-xl font-black text-gray-900 uppercase tracking-widest">Xác nhận xóa</h3>
                                <p className="text-sm font-bold text-gray-500 mt-2">Nguyên liệu sẽ bị xóa hoàn toàn khỏi kho!</p>
                            </div>
                            <div className="p-6 space-y-4">
                                <p className="text-sm text-gray-600 mb-2">Vui lòng nhập <span className="font-black text-red-600">XOA</span> để xác nhận:</p>
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder="Nhập XOA..."
                                    className="w-full text-center p-4 bg-slate-50 border border-slate-200 rounded-none outline-none focus:border-red-500 focus:bg-white font-black text-xl tracking-[5px] uppercase placeholder:font-normal placeholder:text-gray-300 placeholder:tracking-normal transition-colors"
                                    onKeyDown={async (e) => {
                                        if (e.key === 'Enter' && e.target.value === 'XOA') {
                                            setDeleteInventoryModal(null);
                                            await fetch(`${SERVER_URL}/api/inventory/${deleteInventoryModal}`, { method: 'DELETE' });
                                            fetchData();
                                        } else if ((e.key === 'Escape' || (e.key === 'Backspace' && !isInputFocused()))) {
                                            setDeleteInventoryModal(null);
                                        }
                                    }}
                                />
                                <div className="grid grid-cols-2 gap-3 mt-6 pt-4 border-t border-slate-100">
                                    <button onClick={() => setDeleteInventoryModal(null)} className="p-4 bg-slate-100 text-slate-600 font-bold text-sm rounded-none hover:bg-slate-200 uppercase tracking-widest active:scale-95 transition-all">HỦY</button>
                                    <button
                                        onClick={async (e) => {
                                            const inputVal = e.target.parentElement.previousElementSibling.value;
                                            if (inputVal === 'XOA') {
                                                setDeleteInventoryModal(null);
                                                await fetch(`${SERVER_URL}/api/inventory/${deleteInventoryModal}`, { method: 'DELETE' });
                                                fetchData();
                                            } else {
                                                alert("Vui lòng gõ XOA vào ô chuẩn xác (viết hoa).");
                                            }
                                        }}
                                        className="p-4 bg-red-500 text-white font-bold text-sm rounded-none hover:bg-red-600 uppercase tracking-widest active:scale-95 transition-all shadow-lg shadow-red-500/30">
                                        XÓA NGAY
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* Delete Menu Modal */}
                {deleteMenuModal && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[1100]">
                        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white max-w-sm w-full rounded-none shadow-2xl overflow-hidden shadow-red-500/20">
                            <div className="p-6 text-center bg-red-50/30">
                                <div className="w-16 h-16 bg-red-50 rounded-none flex items-center justify-center mx-auto mb-4 text-red-500">
                                    <Trash2 size={32} />
                                </div>
                                <h3 className="text-xl font-black text-gray-900 uppercase tracking-widest">{showMenuTrash ? 'Xóa Vĩnh Viễn Menu' : 'Đưa Vào Thùng Rác'}</h3>
                                <p className="text-sm font-bold text-gray-500 mt-2">
                                    {showMenuTrash ? 'Hành động này không thể hoàn tác!' : 'Bạn có thể khôi phục lại món này bất kỳ lúc nào.'}
                                </p>
                            </div>
                            <div className="p-6 flex gap-3 border-t border-slate-100">
                                <button onClick={() => setDeleteMenuModal(null)} className="flex-1 px-4 py-4 bg-slate-100 text-slate-600 rounded-none font-bold hover:bg-slate-200 transition-all active:scale-95 text-sm uppercase tracking-widest">Hủy</button>
                                <button onClick={confirmDeleteMenuItem} className="flex-1 px-4 py-4 bg-red-500 text-white rounded-none font-bold hover:bg-red-600 transition-all active:scale-95 shadow-lg shadow-red-500/20 text-sm uppercase tracking-widest">Đồng Ý</button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* View Receipt Modal */}
                <AnimatePresence>
                    {viewReceiptOrder && (
                        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
                            <motion.div initial={{ y: 50, opacity: 0, scale: 0.95 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 50, opacity: 0, scale: 0.95 }}
                                className="relative bg-slate-50 rounded-none p-6 shadow-2xl max-w-lg w-full z-10 border border-slate-200">
                                <button onClick={() => setViewReceiptOrder(null)} className="absolute top-4 right-4 p-2 bg-white text-gray-500 hover:bg-gray-50 transition-all rounded-none z-20 shadow-sm border border-slate-100 active:scale-95">
                                    <X size={20} />
                                </button>
                                <h3 className="text-xl font-black text-gray-900 mb-4 px-2 tracking-tight">Ủy nhiệm chi - #{viewReceiptOrder.queueNumber}</h3>
                                <div className="bg-white rounded-none overflow-hidden flex items-center justify-center p-4 border border-slate-100 shadow-sm">
                                    <img src={`${SERVER_URL}/data/receipts/${viewReceiptOrder.paymentReceipt}`} alt="Receipt" className="max-w-full max-h-[65vh] object-contain rounded-none" />
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Debt Payment Mode Selection Modal */}
                <AnimatePresence>
                    {payDebtOrderId && (
                        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
                            <motion.div initial={{ y: 50, opacity: 0, scale: 0.95 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 50, opacity: 0, scale: 0.95 }}
                                className="bg-white rounded-none p-8 min-w-[360px] max-w-sm shadow-2xl relative z-10 text-center">
                                <div className="mx-auto w-16 h-16 bg-purple-100 rounded-none flex items-center justify-center mb-4 text-purple-600">
                                    <BookOpen size={32} />
                                </div>
                                <h3 className="text-xl font-black text-gray-900 mb-2 uppercase tracking-wide">Thanh Toán Nợ</h3>
                                <p className="text-sm text-gray-500 mb-6 px-4">Khách thanh toán nợ bằng tiền mặt hay quét QR trên Kiosk?</p>

                                <div className="space-y-3">
                                    <button
                                        onClick={() => confirmPayDebt(payDebtOrderId, false)}
                                        className="w-full flex items-center justify-center gap-3 bg-green-50 hover:bg-green-100 text-green-700 font-black px-4 py-4 rounded-none transition-all"
                                    >
                                        <DollarSign size={20} />
                                        TIỀN MẶT (HOÀN TẤT NỢ)
                                    </button>
                                    <button
                                        onClick={() => confirmPayDebt(payDebtOrderId, true)}
                                        className={`w-full flex items-center justify-center gap-3 font-black px-4 py-4 rounded-none shadow-lg transition-all ${settings.autoPushPaymentQr !== false ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-70'}`}
                                    >
                                        <QrCode size={20} />
                                        HIỆN QR TRÊN KIOSK {settings.autoPushPaymentQr === false && <span className="text-[10px] ml-1 uppercase">(Đang Tắt)</span>}
                                    </button>
                                </div>

                                <button
                                    onClick={() => setPayDebtOrderId(null)}
                                    className="mt-6 text-gray-400 hover:text-gray-600 font-bold text-sm tracking-wider uppercase transition-colors"
                                >
                                    ĐÓNG QUAY LẠI
                                </button>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Category Manager Modal */}
                {showCategoryManager && (
                    <CategoryManagerModal
                        settings={settings}
                        setSettings={setSettings}
                        menu={menu}
                        setMenu={setMenu}
                        onRefreshMenu={fetchStaticData}
                        onClose={() => setShowCategoryManager(false)}
                    />
                )}

                {/* Merge Inventory Modal */}
                {showMergeModal && (
                    <MergeInventoryModal
                        selectedItems={selectedMergeItems}
                        inventory={inventory}
                        menu={menu}
                        onClose={() => setShowMergeModal(false)}
                        onSuccess={(msg) => {
                            showToast(msg, 'success');
                            setShowMergeModal(false);
                            setSelectedMergeItems([]);
                            fetchStaticData();
                        }}
                    />
                )}
            </div>
        </div>
    );
};

/* MergeInventoryModal Component */
const MergeInventoryModal = ({ selectedItems, inventory, menu, onClose, onSuccess }) => {
    const [targetId, setTargetId] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const mergeObjects = selectedItems.map(id => {
        const item = inventory.find(i => i.id === id);
        if (!item) return null;

        let usedInMenuName = null;
        for (const menuItem of menu.filter(m => !m.isDeleted)) {
            if (menuItem.recipe?.some(r => r.ingredientId === item.id) ||
                menuItem.sizes?.some(s => s.recipe?.some(r => r.ingredientId === item.id)) ||
                menuItem.addons?.some(a => a.recipe?.some(r => r.ingredientId === item.id))) {
                usedInMenuName = menuItem.name;
                break;
            }
        }

        return { ...item, usedInMenuName };
    }).filter(Boolean);

    const totalStock = mergeObjects.reduce((acc, curr) => acc + (curr.stock || 0), 0);

    useEffect(() => {
        if (mergeObjects.length > 0 && !targetId) {
            setTargetId(mergeObjects[0].id);
        }
    }, [mergeObjects, targetId]);

    const handleMerge = async () => {
        if (!targetId || isSubmitting) return;
        setIsSubmitting(true);
        try {
            const res = await fetch(`${SERVER_URL}/api/inventory/merge`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetId, sourceIds: selectedItems })
            });
            const data = await res.json();
            if (data.success) {
                onSuccess(data.message);
            } else {
                alert(data.message || 'Lỗi khi gộp.');
            }
        } catch (error) {
            alert('Lỗi kết nối tới Server');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white max-w-2xl w-full shadow-2xl rounded-none flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between p-6 bg-brand-600 text-white">
                    <div className="flex items-center gap-3">
                        <Merge size={24} />
                        <h2 className="text-lg font-black uppercase tracking-widest">Gộp {selectedItems.length} Nguyên Liệu Trùng Lặp</h2>
                    </div>
                    <button onClick={onClose} className="hover:bg-brand-700 p-2 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto bg-gray-50 flex-1">
                    <div className="mb-6 bg-brand-50 border border-brand-100 p-4 text-sm text-brand-900 leading-relaxed font-medium">
                        Bạn đang chuẩn bị gộp <strong className="text-brand-600">{selectedItems.length} nguyên liệu</strong> lại thành một.
                        Số tồn kho của tất cả sẽ được <strong>cộng dồn</strong>. Lịch sử tiêu thụ, lịch sử nhập hàng và các công thức món ăn đang sử dụng các nguyên liệu lỗi này cũng sẽ được tự động đổi sang nguyên liệu chuẩn!
                    </div>

                    <h3 className="font-bold text-gray-800 mb-4 px-1 flex items-center gap-2">
                        <CheckCircle2 className="text-green-500" size={18} /> Vui lòng chọn 1 TÊN CHUẨN ĐÍCH để giữ lại:
                    </h3>

                    <div className="space-y-3">
                        {mergeObjects.map(item => (
                            <label key={item.id} className={`flex items-start gap-4 p-4 border-2 cursor-pointer transition-all ${targetId === item.id ? 'border-brand-600 bg-brand-50/50 shadow-sm' : 'border-gray-200 bg-white hover:border-brand-300'}`}>
                                <div className="mt-0.5">
                                    <input
                                        type="radio"
                                        name="targetIngredient"
                                        checked={targetId === item.id}
                                        onChange={() => setTargetId(item.id)}
                                        className="w-5 h-5 text-brand-600 border-gray-300 focus:ring-brand-500"
                                    />
                                </div>
                                <div className="flex-1">
                                    <div className="font-bold text-gray-900 text-[15px]">{item.name}</div>
                                    <div className="text-[11px] font-semibold text-gray-500 tracking-wide mt-1 flex flex-wrap gap-x-4 gap-y-1 items-center">
                                        <span>Tồn kho cộng dồn/chuyển: <b className="text-[#C68E5E] text-[12px]">{item.stock} {item.unit}</b></span>
                                        <span className={`px-2 py-0.5 rounded-none border ${item.usedInMenuName ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-gray-200 bg-gray-50 text-gray-400'}`}>
                                            - {item.usedInMenuName ? `Nguyên liệu đang liên kết món: ${item.usedInMenuName}` : 'Chưa liên kết món'}
                                        </span>
                                    </div>
                                </div>
                            </label>
                        ))}
                    </div>

                    <div className="mt-8 pt-6 border-t border-gray-200 flex items-center justify-between">
                        <div className="text-gray-600 font-medium">Tổng tồn kho sau khi gộp:</div>
                        <div className="text-right flex items-baseline gap-2">
                            <span className="text-3xl font-black text-[#C68E5E]">{parseFloat(totalStock.toFixed(3))}</span>
                            <span className="text-gray-500 font-bold">{mergeObjects[0]?.unit || 'g'}</span>
                        </div>
                    </div>
                </div>

                <div className="p-6 bg-white border-t border-gray-100 flex gap-4">
                    <button onClick={onClose} disabled={isSubmitting} className="flex-1 px-4 py-4 bg-gray-100 text-gray-700 font-bold hover:bg-gray-200 transition-colors uppercase tracking-widest text-sm text-[12px]">Hủy Bỏ</button>
                    <button onClick={handleMerge} disabled={isSubmitting || !targetId} className="flex-1 px-4 py-4 bg-brand-600 text-white font-black hover:bg-brand-700 shadow-lg border border-brand-600 transition-all uppercase tracking-widest text-[12px] flex items-center justify-center gap-2 disabled:opacity-50">
                        {isSubmitting ? <RefreshCw className="animate-spin" size={18} /> : <Merge size={18} />} XÁC NHẬN GỘP LIÊN KẾT
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

export default AdminDashboard;