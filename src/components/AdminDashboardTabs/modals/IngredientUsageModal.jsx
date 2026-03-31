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


export default IngredientUsageModal;
