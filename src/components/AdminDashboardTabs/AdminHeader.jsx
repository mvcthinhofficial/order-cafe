import React from 'react';
import { Settings, LogOut } from 'lucide-react';
import {
    ClipboardList, Table, Package, BarChart3, Users, Gift
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { SERVER_URL } from '../../api';
import StoreClock from './StoreClock';

const AdminHeader = ({
    settings, activeTab, handleTabChange,
    isDirty, userRole, userName, userRoleName,
    hasPermission
}) => {
    const navigate = useNavigate();
    return (
        <header className="admin-header w-full border-b border-gray-100 bg-white flex-shrink-0 z-50 relative">
                    <div className="w-full px-2 lg:px-4 xl:px-8 mx-auto flex justify-between items-center gap-4 xl:gap-8">
                        <div className="flex items-center gap-2 xl:gap-4">
                            <div className="bg-gray-900 p-3 shadow-xl" style={{ borderRadius: '10px' }}>
                                <Settings className="text-white" size={24} />
                            </div>
                            <div>
                                <h1 className="text-xl font-black tracking-tighter text-gray-900 leading-none">TH <span className="text-brand-600">POS</span></h1>
                                <StoreClock storeTimezoneOffset={settings.storeTimezoneOffset} />
                            </div>
                        </div>

                        <div className="flex items-center gap-2 xl:gap-10 flex-1 min-w-0 justify-end">
                            {/* Tab nav - Much larger for touch */}
                            <nav className="flex gap-1 xl:gap-2 bg-gray-100/50 p-1 md:p-1.5 xl:p-2 overflow-x-auto custom-scrollbar min-w-0">
                                {[
                                    hasPermission('orders', 'view') && { id: 'orders', icon: ClipboardList, label: 'Đơn hàng' },
                                    !settings.isTakeaway && (hasPermission('orders', 'view') || hasPermission('menu', 'view') || hasPermission('inventory', 'view')) && { id: 'tables', icon: Table, label: 'Phòng bàn' },
                                    hasPermission('menu', 'view') && { id: 'menu', icon: Package, label: 'Thực đơn' },
                                    hasPermission('menu', 'view') && settings.enablePromotions && { id: 'promotions', icon: Gift, label: 'Khuyến mãi' },
                                    hasPermission('inventory', 'view') && { id: 'inventory', icon: Package, label: 'Kho hàng' },
                                    hasPermission('staff', 'view') && { id: 'staff', icon: Users, label: 'Nhân sự' },
                                    hasPermission('reports', 'view') && { id: 'reports', icon: BarChart3, label: 'Báo cáo' },
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
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-1">{userRoleName || (userRole === 'ADMIN' ? 'Quản Lý' : 'Nhân Viên')}</p>
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
                                        localStorage.removeItem('userRoleName');
                                        localStorage.removeItem('userPermissions');
                                        navigate('/login');
                                    }}
                                    title="Đăng xuất"
                                    className="w-10 h-10 bg-red-50 text-red-600 flex items-center justify-center hover:bg-red-100 hover:text-red-700 transition-colors" style={{ borderRadius: '8px' }}
                                >
                                    <LogOut size={18} />
                                </button>
                            </div>
                        </div>
                    </div>
        </header>
    );
};

export default AdminHeader;
