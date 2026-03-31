import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Settings, Sparkles, Clock, ShoppingCart, Package, Calculator, Keyboard,
    Shield, Key, KeyRound, Share2, Database, Printer, Wifi, RefreshCw,
    AlertTriangle, Save, Lock, Copy, ExternalLink, ChevronDown, ChevronUp,
    Info, Download, CheckCircle, Rocket
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { SERVER_URL } from '../../api';
import { generateTheme, applyTheme } from '../../utils/themeEngine';
import { isNewerVersion } from '../../utils/dashboardUtils';
import { ReceiptBuilder, KitchenTicketBuilder } from './StaffOrderPanel';
import { generateReceiptHTML, generateKitchenTicketHTML } from '../../utils/printHelpers';

// --- Sub-components ---
const SettingSection = ({ title, icon, color, children, defaultExpanded = false, headerRight, id }) => {
    const [expanded, setExpanded] = useState(defaultExpanded);
    const colorClasses = {
        amber: "text-amber-500", purple: "text-brand-600", pink: "text-pink-500",
        indigo: "text-brand-600", orange: "text-orange-500", red: "text-red-500",
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
                        <div className="p-4 border-t border-gray-50 bg-white">{children}</div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export const CustomSwitch = ({ isOn, onToggle, activeColor = "#00DA50" }) => (
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

export const ToggleOption = ({ label, subLabel, isOn, onToggle, activeColor = "blue" }) => {
    const activeColors = { blue: "#007AFF", green: "#34C759", red: "#FF3B30", orange: "#FF9500" };
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


const SettingsTab = ({
    inventory,
    settings, setSettings, menu, userRole, showToast,
    fetchSettings, fetchQrToken, qrToken, setQrToken,
    passwordData, setPasswordData, passwordMessage, handleChangePassword,
    lanIP, cfStatus, showCfGuide, setShowCfGuide, copyOrderLink,
    printers,
    latestVersion, systemVersion, latestDescription, latestAssets,
    isUpdating, handleSystemUpdate, isDesktopDownloading, desktopUpdateProgress,
    backups, fetchBackups, handleCreateBackup, handleRestoreBackup,
    isBackingUp, isRestoring, setShowFactoryResetModal
}) => {
    return (
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

                                            {/* 1.5. Cài đặt Múi giờ */}
                                            <SettingSection title="1.5. Cài đặt Múi giờ (Store Timezone)" icon={<Clock size={16} />} color="emerald">
                                                <div className="space-y-4">
                                                    <div className="flex flex-col gap-2 bg-emerald-50 border border-emerald-100 p-4">
                                                        <label className="text-[10px] font-black uppercase text-emerald-800 tracking-widest">Lựa chọn Múi giờ hiển thị & Lập lịch</label>
                                                        <select
                                                            value={settings.storeTimezoneOffset == null ? 'AUTO' : settings.storeTimezoneOffset}
                                                            onChange={async (e) => {
                                                                const val = e.target.value === 'AUTO' ? null : parseInt(e.target.value);
                                                                const newSettings = { ...settings, storeTimezoneOffset: val };
                                                                setSettings(newSettings);
                                                                try {
                                                                    await fetch(`${SERVER_URL}/api/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newSettings) });
                                                                } catch (err) { console.error('Failed to save timezone', err); }
                                                            }}
                                                            className="admin-input !text-sm !py-2 w-full font-bold bg-white text-emerald-900 border-emerald-200 cursor-pointer outline-none"
                                                        >
                                                            <option value="AUTO">Tự động (Theo giờ máy chủ Server)</option>
                                                            <option value="-420">GMT+7 (Việt Nam, Thái Lan)</option>
                                                            <option value="-480">GMT+8 (Singapore, Phillippines)</option>
                                                            <option value="-540">GMT+9 (Hàn Quốc, Nhật Bản)</option>
                                                            <option value="-600">GMT+10 (Sydney)</option>
                                                            <option value="-660">GMT+11 (New Caledonia)</option>
                                                            <option value="0">GMT+0 (London, Giờ Quốc tế)</option>
                                                            <option value="420">GMT-7 (Los Angeles)</option>
                                                            <option value="300">GMT-5 (New York)</option>
                                                        </select>
                                                        <p className="text-[10px] text-emerald-700 italic font-medium mt-1">Lưu ý: Mã Đơn Hàng (ID) và Lịch Reset ngày phụ thuộc chặt chẽ vào cấu hình này.</p>
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
                                            <SettingSection title="3. Luồng phục vụ" icon={<ShoppingCart size={16} />} color="purple">
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
                                            <SettingSection title="4. Quảng cáo & Khuyến mãi" icon={<Sparkles size={16} />} color="indigo">
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
                                            <SettingSection title="5. Đối tác Giao hàng (Apps)" icon={<Package size={16} />} color="orange">
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
                                            <SettingSection title="6. Doanh thu dự kiến & Thuế (2026)" icon={<Calculator size={16} />} color="teal">
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
                                            <SettingSection title="7. Phím tắt bán hàng (Hotkey POS)" icon={<Keyboard size={16} />} color="indigo">
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
                                            <SettingSection title="8. Bảo mật & Link Order" icon={<Shield size={16} />} color="red">
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
                                            <SettingSection title="9. Đổi mật khẩu Quản lý" icon={<Key size={16} />} color="red">
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
                                            <SettingSection title="10. Mã khôi phục khẩn cấp (Quên mật khẩu)" icon={<KeyRound size={16} />} color="red">
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
                                                title="11. Cloudflare Tunnel (HTTPS)"
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



                                            {/* 13. Cấu hình Máy in & Hóa đơn */}
                                            <SettingSection title="13. Cấu hình Máy in & Hóa đơn" icon={<Printer size={16} />} color="green">
                                                <div className="space-y-6">
                                                    {/* --- PHẦN A: HÓA ĐƠN THANH TOÁN --- */}
                                                    <div className="p-4 bg-slate-50 border-b border-gray-100 italic text-[10px] font-bold text-slate-500 uppercase tracking-widest flex justify-between items-center">
                                                        <span>A. Cấu hình Hóa đơn (Bill)</span>
                                                        {window.require && (
                                                            <button 
                                                                onClick={async () => {
                                                                    try {
                                                                        const sampleItems = (menu || []).filter(m => !m.isDeleted).slice(0, 2);
                                                                        const mockCart = sampleItems.length > 0 ? sampleItems.map((m, idx) => ({
                                                                            count: idx + 1,
                                                                            item: m,
                                                                            size: m.sizes?.[0] || { label: 'M' },
                                                                            sugar: m.sugarOptions?.[0] || 'Ngọt ít',
                                                                            ice: m.iceOptions?.[0] || 'Nhiều đá',
                                                                            addons: idx === 1 && m.addons?.length > 0 ? [m.addons[0]] : [],
                                                                            totalPrice: (m.price + (m.sizes?.[0]?.priceAdjust || 0)) + (idx === 1 && m.addons?.length > 0 ? (m.addons[0].price||0) : 0),
                                                                            note: idx === 1 ? 'Ít đường' : ''
                                                                        })) : [
                                                                            { count: 1, item: { name: 'CAFE SỮA' }, size: { label: 'M' }, sugar: 'Ngọt ít', ice: 'Nhiều đá', totalPrice: 20000 },
                                                                            { count: 2, item: { name: 'CAFE ĐÁ' }, size: { label: 'L' }, addons: [{ label: 'Thêm cafe' }], totalPrice: 24000, note: 'Ít đường' }
                                                                        ];
                                                                        const mockSubTotal = mockCart.reduce((total, c) => total + (c.totalPrice * (c.count || 1)), 0);
                                                                        const tMode = settings.taxMode || "NONE";
                                                                        const tRate = settings.taxRate || 8;
                                                                        let mTax = 0, mTotal = mockSubTotal;
                                                                        if (tMode === 'EXCLUSIVE') mTax = Math.round(mockSubTotal * (tRate / 100));
                                                                        mTotal = mockSubTotal + (tMode === 'EXCLUSIVE' ? mTax : 0);
                                                                        
                                                                        const mockOrder = {
                                                                            id: '1234', queueNumber: 99, tagNumber: 'TAG-12', tableName: 'Bàn A1',
                                                                            customerName: 'Khách VIP', customerPhone: '0901234567',
                                                                            price: mTotal, taxAmount: mTax, taxMode: tMode, taxRate: tRate,
                                                                            paymentMethod: 'Chuyển khoản', timestamp: Date.now()
                                                                        };
                                                                        const html = generateReceiptHTML(mockOrder, mockCart, settings, false);
                                                                        await window.require('electron').ipcRenderer.invoke('print-html', html, settings.printerName, settings.receiptPaperSize);
                                                                    } catch (err) { alert('Lỗi in thử: ' + err.message); }
                                                                }}
                                                                className="flex items-center gap-2 bg-brand-500 text-white px-3 py-1 hover:bg-brand-600 transition-all text-[9px] font-black"
                                                            >
                                                                <Printer size={12} /> IN THỬ BILL
                                                            </button>
                                                        )}
                                                    </div>
                                                    <div className="p-4">
                                                        <ReceiptBuilder
                                                            settings={settings}
                                                            setSettings={setSettings}
                                                            menu={menu}
                                                            value={settings.receiptConfig}
                                                            onChange={(newConfig) => setSettings({ ...settings, receiptConfig: newConfig })}
                                                        />
                                                    </div>

                                                    {/* --- DIVIDER --- */}
                                                    <div className="h-px bg-gray-200" />

                                                    {/* --- PHẦN B: IN BẾP --- */}
                                                    <div className="p-4 bg-slate-50 border-b border-gray-100 italic text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                                        B. Cấu hình In Bếp (Pha chế)
                                                    </div>
                                                    <div className="p-4 space-y-4">
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            <div className="space-y-1">
                                                                <label className="text-[10px] font-black uppercase text-gray-400">Máy in Bếp (Pha chế)</label>
                                                                <select
                                                                    value={settings.kitchenPrinterName || ''}
                                                                    onChange={async (e) => {
                                                                        const newVal = e.target.value;
                                                                        const newSettings = { ...settings, kitchenPrinterName: newVal };
                                                                        setSettings(newSettings);
                                                                        try {
                                                                            await fetch(`${SERVER_URL}/api/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newSettings) });
                                                                        } catch (err) { }
                                                                    }}
                                                                    className="admin-input !text-xs !py-3 bg-gray-50 cursor-pointer w-full"
                                                                >
                                                                    <option value="">-- Dùng máy in mặc định hệ thống --</option>
                                                                    {printers.map((p, idx) => (
                                                                        <option key={idx} value={p.name}>{p.name} {p.isDefault ? '(Mặc định)' : ''}</option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                            <div className="space-y-1">
                                                                <label className="text-[10px] font-black uppercase text-gray-400">Khổ giấy Bếp</label>
                                                                <div className="flex gap-2 items-center">
                                                                    <select
                                                                        value={settings.kitchenPaperSize || 'K80'}
                                                                        onChange={async (e) => {
                                                                            const newVal = e.target.value;
                                                                            const newSettings = { ...settings, kitchenPaperSize: newVal };
                                                                            setSettings(newSettings);
                                                                            try {
                                                                                await fetch(`${SERVER_URL}/api/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newSettings) });
                                                                            } catch (err) { }
                                                                        }}
                                                                        className="admin-input !text-xs !py-3 bg-gray-50 cursor-pointer w-full"
                                                                    >
                                                                        <option value="K80">K80 (80mm)</option>
                                                                        <option value="K58">K58 (58mm)</option>
                                                                    </select>
                                                                    <button
                                                                        onClick={async () => {
                                                                            if (!window.require) return alert('Chỉ hỗ trợ trên nền tảng Desktop!');
                                                                            try {
                                                                                const sampleItem = (menu || []).filter(m => !m.isDeleted && m.recipe && m.recipe.length > 0)[0] || (menu || []).filter(m => !m.isDeleted)[0];
                                                                                const mockOrder = { id: 'TEST-KITCHEN', queueNumber: 99, tagNumber: 'TEST', timestamp: Date.now() };
                                                                                const mockItem = sampleItem ? {
                                                                                    count: 2,
                                                                                    item: sampleItem,
                                                                                    size: sampleItem.sizes?.[0] || { label: 'L' },
                                                                                    sugar: sampleItem.sugarOptions?.[0] || '50% Đường',
                                                                                    ice: sampleItem.iceOptions?.[0] || 'Ít đá',
                                                                                    addons: sampleItem.addons?.slice(0, 2) || [],
                                                                                    note: 'Giao nhanh giúp em'
                                                                                } : { count: 1, item: { name: 'MÓN TEST BẾP' }, size: { label: 'L' }, sugar: 'Đường 50%', ice: 'Đá 50%' };
                                                                                
                                                                                let mockRecipe = ['100ml Thành phần A', '1 Ly 500ml'];
                                                                                if (sampleItem && sampleItem.recipe && sampleItem.recipe.length > 0) {
                                                                                    mockRecipe = sampleItem.recipe.map(r => {
                                                                                        const inv = (inventory || []).find(i => i.id === r.ingredientId);
                                                                                        return `- ${r.quantity} ${inv?.unit || ''} ${inv?.name || 'Nguyên liệu'}`;
                                                                                    });
                                                                                }
                                                                                const html = generateKitchenTicketHTML(mockOrder, mockItem, mockRecipe, settings);
                                                                                await window.require('electron').ipcRenderer.invoke('print-html', html, settings.kitchenPrinterName, settings.kitchenPaperSize);
                                                                            } catch (err) { alert('Lỗi test in bếp: ' + err.message); }
                                                                        }}
                                                                        className="bg-brand-500 text-white p-3 hover:bg-brand-600 transition-all outline-none"
                                                                        title="In thử đơn bếp"
                                                                    >
                                                                        <Printer size={16} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <KitchenTicketBuilder
                                                            inventory={inventory}
                                                            settings={settings}
                                                            setSettings={setSettings}
                                                            menu={menu}
                                                        />
                                                    </div>
                                                </div>
                                            </SettingSection>
                                            {/* 13. Kết nối thiết bị ngoại vi */}
                                            <SettingSection title="14. Kết nối thiết bị (iPad/iPhone)" icon={<Wifi size={16} />} color="indigo">
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
                                                <SettingSection id="setting-system-update" title="15. Cập nhật hệ thống" icon={<RefreshCw size={16} />} color="brand" defaultExpanded={!!(latestVersion && isNewerVersion(latestVersion, systemVersion))}>
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

                                                                    {latestDescription && (
                                                                        <div className="mt-2 p-4 bg-green-100/50 border-l-4 border-green-500/30 text-[11px] font-bold leading-relaxed max-h-[200px] overflow-y-auto">
                                                                            <p className="text-[9px] uppercase tracking-widest text-green-700 mb-2 font-black">Nội dung cập nhật:</p>
                                                                            <div style={{ whiteSpace: 'pre-line' }} className="text-green-800/80">
                                                                                {latestDescription}
                                                                            </div>
                                                                        </div>
                                                                    )}

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

                                            {/* 15. SAO LƯU & KHÔI PHỤC DỮ LIỆU */}
                                            {userRole === 'ADMIN' && (
                                                <SettingSection title="16. Quản lý Sao lưu & Khôi phục" icon={<Database size={16} />} color="blue">
                                                    <div className="p-4 space-y-4">
                                                        <div className="flex items-center justify-between gap-4 bg-blue-50/50 p-4 border border-blue-100/50">
                                                            <div className="flex-1">
                                                                <h4 className="font-bold text-blue-900 text-sm uppercase tracking-tight">SAO LƯU DỮ LIỆU HIỆN TẠI</h4>
                                                                <p className="text-[11px] text-blue-600 font-medium mt-1 uppercase tracking-widest italic">Nên thực hiện trước khi có thay đổi lớn hoặc cuối ngày</p>
                                                            </div>
                                                            <button
                                                                disabled={isBackingUp}
                                                                onClick={handleCreateBackup}
                                                                className={`px-6 py-3 bg-blue-600 text-white font-black text-xs uppercase tracking-widest hover:bg-blue-700 transition-all flex items-center gap-2 shadow-lg shadow-blue-600/20 ${isBackingUp ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                            >
                                                                {isBackingUp ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                                                                {isBackingUp ? 'ĐANG LƯU...' : 'SAO LƯU NGAY'}
                                                            </button>
                                                        </div>

                                                        <div className="space-y-2">
                                                            <div className="flex items-center justify-between px-1">
                                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-[2px]">DANH SÁCH BẢN SAO LƯU ({backups.length})</p>
                                                                <button onClick={fetchBackups} className="text-[10px] font-bold text-blue-500 hover:underline flex items-center gap-1">
                                                                    <RefreshCw size={10} /> TẢI LẠI
                                                                </button>
                                                            </div>

                                                            <div className="max-h-[300px] overflow-y-auto border border-gray-100 bg-white custom-scrollbar">
                                                                {backups.length === 0 ? (
                                                                    <div className="p-10 text-center text-gray-300 italic text-xs font-bold uppercase tracking-widest">
                                                                        Chưa có bản sao lưu nào
                                                                    </div>
                                                                ) : (
                                                                    <table className="w-full text-left border-collapse">
                                                                        <thead className="sticky top-0 bg-gray-50 z-10">
                                                                            <tr className="border-b border-gray-100">
                                                                                <th className="px-4 py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">Thời gian</th>
                                                                                <th className="px-4 py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">Loại</th>
                                                                                <th className="px-4 py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Thao tác</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody className="divide-y divide-gray-50">
                                                                            {backups.map((b, idx) => (
                                                                                <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                                                                                    <td className="px-4 py-3">
                                                                                        <p className="text-xs font-bold text-gray-700">{new Date(b.createdAt).toLocaleString('vi-VN')}</p>
                                                                                        <p className="text-[10px] text-gray-400 font-medium truncate max-w-[150px]">{b.name}</p>
                                                                                    </td>
                                                                                    <td className="px-4 py-3">
                                                                                        <span className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${b.type === 'Thủ công' ? 'bg-blue-100 text-blue-600' :
                                                                                            b.type === 'Khai trương' ? 'bg-orange-100 text-orange-600' :
                                                                                                b.type === 'Trước khôi phục' ? 'bg-purple-100 text-purple-600' :
                                                                                                    'bg-gray-100 text-gray-500'
                                                                                            }`}>
                                                                                            {b.type}
                                                                                        </span>
                                                                                    </td>
                                                                                    <td className="px-4 py-3 text-right flex justify-end gap-2">
                                                                                        <button
                                                                                            disabled={isRestoring}
                                                                                            onClick={async () => {
                                                                                                if (window.confirm('Bạn có chắc muốn xóa bản sao lưu này? Hành động này không thể hoàn tác!')) {
                                                                                                    try {
                                                                                                        const res = await fetch(`${SERVER_URL}/api/admin/backups/${b.name}`, { 
                                                                                                            method: 'DELETE',
                                                                                                            headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
                                                                                                        });
                                                                                                        if(res.ok) {
                                                                                                            if (typeof fetchBackups === 'function') fetchBackups();
                                                                                                            showToast('Đã xóa bản sao lưu', 'success');
                                                                                                        } else {
                                                                                                            showToast('Lỗi xóa sao lưu', 'error');
                                                                                                        }
                                                                                                    } catch(e) { showToast('Lỗi xóa sao lưu: ' + e.message, 'error'); }
                                                                                                }
                                                                                            }}
                                                                                            className="px-3 py-1.5 bg-red-100 text-red-600 font-black text-[10px] uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all disabled:opacity-50"
                                                                                        >
                                                                                            XÓA
                                                                                        </button>
                                                                                        <button
                                                                                            disabled={isRestoring}
                                                                                            onClick={() => handleRestoreBackup(b.name)}
                                                                                            className={`px-3 py-1.5 bg-gray-900 text-white font-black text-[10px] uppercase tracking-widest hover:bg-brand-600 transition-all ${isRestoring ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                                                        >
                                                                                            {isRestoring ? 'ĐANG KHÔI PHỤC...' : 'KHÔI PHỤC'}
                                                                                        </button>
                                                                                    </td>
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                )}
                                                            </div>
                                                        </div>

                                                        <div className="bg-amber-50 border-l-4 border-amber-400 p-3">
                                                            <div className="flex gap-3">
                                                                <Info size={16} className="text-amber-600 shrink-0" />
                                                                <p className="text-[11px] text-amber-700 font-medium leading-relaxed uppercase tracking-tight">
                                                                    <span className="font-black">LƯU Ý:</span> Khôi phục dữ liệu sẽ làm mới cửa sổ trình duyệt. Hãy đảm bảo không có đơn hàng nào đang dang dở.
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </SettingSection>
                                            )}

                                            {/* 16. KHAI TRƯƠNG QUÁN MỚI (FACTORY RESET) - Danger Zone */}
                                            {userRole === 'ADMIN' && (
                                                <SettingSection title="17. Thiết lập Hệ thống (Danger Zone)" icon={<AlertTriangle size={16} />} color="red">
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
                                                {userRole === 'ADMIN' ? (
                                                    <button onClick={async () => {
                                                        try {
                                                            const res = await fetch(`${SERVER_URL}/api/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
                                                            if (res.ok) { await fetchSettings(); showToast('Đã lưu thành công!', 'success'); }
                                                        } catch (err) { showToast('Lỗi khi lưu!', 'error'); }
                                                    }} className="w-full bg-brand-500 text-white py-4 font-black text-sm uppercase tracking-widest hover:bg-[#2EB350] transition-all shadow-lg shadow-green-500/10 flex items-center justify-center gap-2">
                                                        <Save size={18} /> LƯU CÀI ĐẶT
                                                    </button>
                                                ) : (
                                                    <div className="w-full bg-gray-50 text-gray-400 py-4 font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 border border-dashed border-gray-200 cursor-not-allowed italic">
                                                        <Lock size={18} /> CHỈ ADMIN MỚI CÓ QUYỀN THAY ĐỔI CÀI ĐẶT GỐC
                                                    </div>
                                                )}
                                            </div>
                    </div>
                </div>

            </section>
        </motion.div>
    );
};

export default SettingsTab;
