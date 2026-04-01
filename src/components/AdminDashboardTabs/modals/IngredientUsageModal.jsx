import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, TrendingUp, TrendingDown, Package, ArrowUpRight, BarChart3, Clock, History, LineChart } from 'lucide-react';
import { SERVER_URL } from '../../../api';
import { formatVND } from '../../../utils/dashboardUtils';
import { getVNDateStr } from '../../../utils/dashboardUtils';

const IngredientUsageModal = ({ item, onClose }) => {
    const [timeWindow, setTimeWindow] = useState('14_days'); // '7_days', '14_days', '30_days', 'custom'
    const [customStart, setCustomStart] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 14);
        return getVNDateStr(d);
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
            const dateStr = getVNDateStr(d);
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
    // Không cần tăng trần vì SVG đã có topY padding
    const maxChartVal = Math.max(actualMaxChartVal, 1);

    const nonZeroVals = chartData.filter(d => d.value > 0).map(d => d.value);
    const minChartVal = nonZeroVals.length > 0 ? Math.min(...nonZeroVals) : 0;

    // Line Chart Metrics
    const svgW = Math.max(chartData.length * 56, 700);
    const svgH = 260;
    const baseY = 210; // Đẩy mức 0 lên cao để tránh text đáy
    const topY = 32;   // Padding trên để hiển thị số lớn nhất
    const rangeY = baseY - topY;

    const points = chartData.map((d, i) => {
        const x = (i + 0.5) * (svgW / chartData.length);
        const y = baseY - (d.value / maxChartVal) * rangeY;
        return { x, y, value: d.value, label: d.label };
    });

    const polylinePoints = points.map(p => `${p.x},${p.y}`).join(' ');
    const polygonPoints = points.length > 0 ? `${points[0].x},${baseY} ${polylinePoints} ${points[points.length-1].x},${baseY}` : '';

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <motion.div initial={{ y: 50, opacity: 0, scale: 0.95 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 50, opacity: 0, scale: 0.95 }}
                className="bg-white shadow-2xl flex flex-col w-full max-w-4xl relative z-10 max-h-[95vh]" style={{ borderRadius: 'var(--radius-modal)', overflow: 'hidden' }}>

                {/* Header */}
                <div className="bg-gray-900 sm:flex justify-between items-start relative overflow-hidden shrink-0" style={{ padding: '32px' }}>
                    <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at top right, #fff 0%, transparent 50%)' }} />
                    <div className="relative z-10">
                        <div className="flex items-center gap-3 mb-2">
                            <span className="p-3 bg-white/10 text-white flex items-center justify-center" style={{ borderRadius: 'var(--radius-btn)' }}>
                                <BarChart3 size={24} />
                            </span>
                            <h2 className="text-3xl font-black text-white tracking-tight">{item.name}</h2>
                        </div>
                        <p className="text-brand-400 text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2">
                            Báo cáo mức độ sử dụng <ArrowUpRight size={12} />
                        </p>
                    </div>
                    <button onClick={onClose} className="p-3 bg-white/5 hover:bg-red-500 text-white transition-colors relative z-10" style={{ borderRadius: 'var(--radius-btn)' }}>
                        <X size={24} />
                    </button>
                </div>

                <div className="sm:overflow-y-auto flex-1 bg-gray-50/50" style={{ padding: '32px' }}>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                        <div className="bg-brand-50/50 border border-brand-100/50 shadow-sm flex flex-col justify-center relative overflow-hidden group" style={{ padding: '24px', borderRadius: 'var(--radius-card)' }}>
                            <Package size={80} className="absolute -right-4 -bottom-4 text-brand-500 opacity-[0.05] group-hover:scale-110 transition-transform duration-500" />
                            <p className="text-[10px] uppercase font-black tracking-[0.15em] text-brand-600/60 mb-2 relative z-10">Tồn kho hiện tại</p>
                            <p className="text-3xl font-black text-brand-600 relative z-10 flex items-baseline gap-1.5">{item.stock} <span className="text-sm font-bold text-brand-600/50">{item.unit}</span></p>
                        </div>
                        <div className="bg-amber-50/50 border border-amber-100/50 shadow-sm flex flex-col justify-center relative overflow-hidden group" style={{ padding: '24px', borderRadius: 'var(--radius-card)' }}>
                            <TrendingDown size={80} className="absolute -right-4 -bottom-4 text-amber-500 opacity-[0.05] group-hover:scale-110 transition-transform duration-500" />
                            <p className="text-[10px] uppercase font-black tracking-[0.15em] text-amber-600/60 mb-2 relative z-10">Sử dụng trung bình / ngày</p>
                            <p className="text-3xl font-black text-amber-600 relative z-10 flex items-baseline gap-1.5">{(avgDaily).toFixed(1)} <span className="text-sm font-bold text-amber-600/50">{item.unit}</span></p>
                        </div>
                        <div className="bg-blue-50/50 border border-blue-100/50 shadow-sm flex flex-col justify-center relative overflow-hidden group" style={{ padding: '24px', borderRadius: 'var(--radius-card)' }}>
                            <Clock size={80} className="absolute -right-4 -bottom-4 text-blue-500 opacity-[0.05] group-hover:scale-110 transition-transform duration-500" />
                            <p className="text-[10px] uppercase font-black tracking-[0.15em] text-blue-600/60 mb-2 relative z-10">Dự báo cạn kho (Tốc độ này)</p>
                            <p className="text-3xl font-black text-blue-600 relative z-10">{daysRemainingText}</p>
                        </div>
                    </div>

                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 mt-8">
                        <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
                            <LineChart size={18} className="text-brand-500" /> Biểu đồ tiêu thụ
                        </h3>
                        <div className="flex flex-wrap gap-3 items-center">
                            <select value={timeWindow} onChange={e => setTimeWindow(e.target.value)} className="bg-white border border-gray-200 text-xs font-bold outline-none focus:border-brand-500 uppercase tracking-widest cursor-pointer hover:bg-gray-50" style={{ padding: '10px 16px', borderRadius: 'var(--radius-btn)' }}>
                                <option value="7_days">7 Ngày qua</option>
                                <option value="14_days">14 Ngày qua</option>
                                <option value="30_days">30 Ngày qua</option>
                                <option value="custom">Tùy chọn</option>
                            </select>
                            {timeWindow === 'custom' && (
                                <div className="flex gap-2 items-center text-gray-600 font-medium">
                                    <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="bg-white border border-gray-200 text-xs px-3 py-2.5 outline-none focus:border-brand-500 cursor-text" style={{ borderRadius: 'var(--radius-badge)' }} />
                                    <span className="font-bold px-1">-</span>
                                    <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="bg-white border border-gray-200 text-xs px-3 py-2.5 outline-none focus:border-brand-500 cursor-text" style={{ borderRadius: 'var(--radius-badge)' }} />
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="bg-white md:border border-gray-100 shadow-sm mb-8 w-full" style={{ padding: '32px', borderRadius: 'var(--radius-card)' }}>
                        {chartData.length > 0 ? (
                            <div className="overflow-x-auto scroll-smooth [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none'] w-full mb-6">
                                <svg width={svgW} height={svgH} className="block overflow-visible relative mx-auto font-sans">
                                    <defs>
                                        <linearGradient id="brandGradient" x1="0" x2="0" y1="0" y2="1">
                                            <stop offset="0%" stopColor="var(--color-brand)" stopOpacity="0.3"/>
                                            <stop offset="100%" stopColor="var(--color-brand)" stopOpacity="0"/>
                                        </linearGradient>
                                    </defs>

                                    {/* Grid Lines */}
                                    <line x1="0" y1={baseY} x2={svgW} y2={baseY} stroke="#e5e7eb" strokeWidth="2" strokeDasharray="4 4" />
                                    <line x1="0" y1={topY} x2={svgW} y2={topY} stroke="#f3f4f6" strokeWidth="1" strokeDasharray="4 4" />

                                    {/* Fill Area */}
                                    {polygonPoints && <polygon points={polygonPoints} fill="url(#brandGradient)" />}

                                    {/* Line */}
                                    {polylinePoints && <polyline points={polylinePoints} fill="none" stroke="var(--color-brand)" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" />}

                                    {/* Data Points & Interaction */}
                                    {points.map((p, i) => (
                                        <g key={i} className="group cursor-crosshair relative">
                                            {/* Hover zone */}
                                            <rect x={p.x - 20} y={0} width="40" height={svgH} fill="transparent" />

                                            {/* Helper Line */}
                                            <line x1={p.x} y1={p.y+8} x2={p.x} y2={baseY} stroke="var(--color-brand)" strokeWidth="1" strokeDasharray="3 3" opacity="0" className="group-hover:opacity-40 transition-opacity pointer-events-none" />

                                            {/* Point Dot */}
                                            <circle cx={p.x} cy={p.y} r="5" fill="white" stroke="var(--color-brand)" strokeWidth="3" className="transition-all duration-200 group-hover:r-[7px]" />
                                            
                                            {/* Value Label */}
                                            <text x={p.x} y={p.y - 14} textAnchor="middle" fontSize="12" fontWeight="900" fill="#111827" className={`pointer-events-none transition-opacity ${p.value === 0 ? 'opacity-40 group-hover:opacity-100' : 'opacity-90'}`}>
                                                {p.value}
                                            </text>

                                            {/* Date Label */}
                                            <text x={p.x} y={baseY + 28} textAnchor="middle" fontSize="11" fontWeight="800" fill="#9ca3af" className="pointer-events-none group-hover:fill-gray-600 transition-colors">
                                                {p.label}
                                            </text>
                                        </g>
                                    ))}
                                </svg>
                            </div>
                        ) : (
                            <div className="h-[280px] flex items-center justify-center text-sm font-bold text-gray-400 italic">
                                Chưa có dữ liệu tiêu thụ.
                            </div>
                        )}
                        <div className="mt-4 flex justify-between items-center bg-gray-50 border border-gray-100 text-sm font-bold text-gray-600" style={{ padding: '20px', borderRadius: 'var(--radius-btn)' }}>
                            <span className="text-[10px] uppercase font-black tracking-widest text-gray-500">Mức Thấp Nhất <span className="font-medium italic opacity-60 normal-case">(Có xuất)</span>: <span className="text-gray-900 border-b border-gray-200 ml-1 pb-0.5">{minChartVal.toFixed(1)} {item.unit}</span></span>
                            <span className="text-[10px] uppercase font-black tracking-widest text-gray-500">Mức Cao Nhất: <span className="text-brand-600 border-b border-brand-200 ml-1 pb-0.5">{actualMaxChartVal.toFixed(1)} {item.unit}</span></span>
                        </div>
                    </div>

                    {Object.keys(monthlyStats).length > 0 && (
                        <div className="mt-8">
                            <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                <History size={16} /> Tổng hợp theo tháng
                            </h3>
                            <div className="bg-white border border-gray-100 shadow-sm overflow-hidden" style={{ borderRadius: 'var(--radius-card)' }}>
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-gray-50/50 border-b border-gray-100">
                                            <th className="text-[10px] font-black text-gray-400 uppercase tracking-widest" style={{ padding: '16px 24px' }}>Tháng thống kê</th>
                                            <th className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-right" style={{ padding: '16px 24px' }}>Tổng lượng tiêu thụ</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {Object.keys(monthlyStats).sort().reverse().map(m => (
                                            <tr key={m} className="hover:bg-brand-50/30 transition-colors">
                                                <td className="text-sm font-bold text-gray-700" style={{ padding: '16px 24px' }}>{m}</td>
                                                <td className="text-right flex items-baseline justify-end gap-1.5 font-mono font-black text-gray-900 text-base" style={{ padding: '16px 24px' }}>{monthlyStats[m].toFixed(1)} <span className="text-xs font-bold text-gray-400 font-sans">{item.unit}</span></td>
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


export default IngredientUsageModal;
