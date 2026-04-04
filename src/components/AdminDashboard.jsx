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
import { ShortcutProvider, useShortcut } from './ShortcutManager';
import { isInputActive, isInputFocused, getNextOrderSource, isDoubleTap } from '../utils/ShortcutUtils.js';
import VisualFlashOverlay from './VisualFlashOverlay';

import { calculateCartWithPromotions } from '../utils/promotionEngine';
import { generateTheme, applyTheme } from '../utils/themeEngine';
import { calculateLiveOrderTax, calculateSimulatedTax, getSavedTaxData } from '../utils/taxUtils';
import { QRCodeCanvas } from 'qrcode.react';
import './AdminDashboard.css';
import ReportsTab from './AdminDashboardTabs/ReportsTab';
import OrdersTab from './AdminDashboardTabs/OrdersTab';
import MenuTab from './AdminDashboardTabs/MenuTab';
import InventoryTab from './AdminDashboardTabs/InventoryTab';
import StaffTab from './AdminDashboardTabs/StaffTab';
import StaffReportModal from './AdminDashboardTabs/StaffReportModal';
import SettingsTab from './AdminDashboardTabs/SettingsTab';
import { StaffOrderPanel, ReceiptBuilder, KitchenTicketBuilder } from './AdminDashboardTabs/StaffOrderPanel';
import { InlineEditPanel } from './AdminDashboardTabs/InlineEditPanel';
import { generateReceiptHTML } from '../utils/printHelpers';
import { formatVND, isNewerVersion, getLogOrderId, getVNTime, getVNDateStr, BIN_MAP, parseVietQR } from '../utils/dashboardUtils';
import TableModal from './AdminDashboardTabs/modals/TableModal';
import TableActionModal from './AdminDashboardTabs/modals/TableActionModal';
import InventoryModal from './AdminDashboardTabs/modals/InventoryModal';
import ExpenseModal from './AdminDashboardTabs/modals/ExpenseModal';
import ImportModal from './AdminDashboardTabs/modals/ImportModal';
import RecipeGuideModal from './AdminDashboardTabs/modals/RecipeGuideModal';
import CategoryManagerModal from './AdminDashboardTabs/modals/CategoryManagerModal';
import InventoryAuditModal from './AdminDashboardTabs/modals/InventoryAuditModal';
import IngredientUsageModal from './AdminDashboardTabs/modals/IngredientUsageModal';
import MergeInventoryModal from './AdminDashboardTabs/modals/MergeInventoryModal';
import AutoPoModal from './AdminDashboardTabs/modals/AutoPoModal';
import FloatingButtons from './AdminDashboardTabs/FloatingButtons';
import EditPromoModal from './AdminDashboardTabs/modals/EditPromoModal';
import StoreClock from './AdminDashboardTabs/StoreClock';
import AdminHeader from './AdminDashboardTabs/AdminHeader';
import FactoryResetModal from './AdminDashboardTabs/modals/FactoryResetModal';
import { useKeyboardShortcuts } from '../utils/useKeyboardShortcuts';
import { useSystemUpdate } from '../utils/useSystemUpdate';
import { useBackupRestore } from '../utils/useBackupRestore';
import TablesTab from './AdminDashboardTabs/TablesTab';
import PromotionsTab from './AdminDashboardTabs/PromotionsTab';
import CancelOrderModal from './AdminDashboardTabs/modals/CancelOrderModal';
import OrderDetailModal from './AdminDashboardTabs/modals/OrderDetailModal';
import ProductionModal from './AdminDashboardTabs/modals/ProductionModal';
import QuickPaymentModal from './AdminDashboardTabs/QuickPaymentModal';
import CustomersTab from './AdminDashboardTabs/CustomersTab';

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
                className="bg-white w-full max-w-md shadow-2xl relative z-10 p-8 text-center">
                <div className="bg-amber-50 w-14 h-14 flex items-center justify-center mx-auto mb-4">
                    <AlertTriangle size={26} className="text-amber-500" />
                </div>
                <h3 className="text-lg font-black text-gray-900 mb-2">Chưa lưu thay đổi</h3>
                <p className="text-sm text-gray-400 mb-7">Bạn có muốn lưu trước khi chuyển tab không?</p>
                <div className="flex gap-3">
                    <button onClick={onCancel} className="admin-btn-secondary h-[80px]">Ở lại</button>
                    <button onClick={onDiscard} className="flex-1 bg-red-50 text-red-500 py-5 font-black text-base hover:bg-red-100 transition-all">Bỏ</button>
                    <button onClick={onSave} className="admin-btn-primary h-[80px]">Lưu & đi</button>
                </div>
            </motion.div>
        </div>
    );
};

// ── Table Modal ──
// ── Table Action Modal ──
// ── Fixed Costs & BEP Section ──
// ── Inventory Modal ──
// ── Import Modal ──
// ── Recipe Guide Modal ──
// --- Hook Bắt phím Enter đúp (Tận dụng để gọi Checkout Nhanh) ---
const ShortcutDoubleEnter = ({ onDoubleEnter }) => {
    const lastEnterRef = useRef(0);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (isInputActive()) return;

            if (e.key === 'Enter' || e.key === 'NumpadEnter') {
                if (isDoubleTap(lastEnterRef.current, 400)) {
                    onDoubleEnter();
                    lastEnterRef.current = 0;
                } else {
                    lastEnterRef.current = Date.now();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown, { capture: true });
        return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
    }, [onDoubleEnter]);

    return null;
};

// ── Main AdminDashboard ──
let _idCounter = 1;

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

    // --- ACTIVE TAB STATE (phải khai báo trước useSystemUpdate) ---
    const isInitialMount = useRef(true);
    const [activeTab, setActiveTab] = useState('orders'); // orders, tables, menu, inventory, staff, reports, settings
    const [toasts, setToasts] = useState([]);

    const showToast = (message, type = 'success') => {
        const id = (_idCounter++).toString();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
    };

    // --- AUTO UPDATE (via hook) ---
    const {
        systemVersion, latestVersion, latestDescription, showReleaseNotes, setShowReleaseNotes,
        latestAssets, updateUrl, isUpdating, showUpdateBanner, setShowUpdateBanner,
        desktopUpdateProgress, isDesktopDownloading, handleSystemUpdate
    } = useSystemUpdate(setActiveTab);

    const [confirmZeroOrder, setConfirmZeroOrder] = useState(null);
    const navigate = useNavigate();
    const [userRole, setUserRole] = useState(localStorage.getItem('userRole') || 'STAFF');
    const [userName, setUserName] = useState(localStorage.getItem('userName') || '');
    const [userRoleName, setUserRoleName] = useState(localStorage.getItem('userRoleName') || '');
    const [userPermissions, setUserPermissions] = useState(() => {
        try {
            const p = localStorage.getItem('userPermissions');
            return p ? JSON.parse(p) : {};
        } catch (e) {
            return {};
        }
    });

    const hasPermission = (module, action = 'view') => {
        if (userRole === 'ADMIN') return true;
        const perms = userPermissions[module];
        if (!perms || perms === 'none') return false;
        if (action === 'edit') return perms === 'edit';
        return perms === 'view' || perms === 'edit';
    };

    const [calculationMode, setCalculationMode] = useState('SAVED'); // SAVED (Actual), AUTO (Simulation)
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
        confirmPassword: '',
        newUsername: ''
    });
    const [passwordMessage, setPasswordMessage] = useState({ text: '', type: '' });
    const [newRecoveryCode, setNewRecoveryCode] = useState(null);
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
    // settingsRef — để SSE closure luôn đọc settings mới nhất (tránh stale closure, deps=[])
    const settingsRef = useRef({});
    const [payDebtOrderId, setPayDebtOrderId] = useState(null);
    const [viewReceiptOrder, setViewReceiptOrder] = useState(null);
    const [historyDate, setHistoryDate] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    const historyDateRef = useRef(historyDate);
    const [historySortOrder, setHistorySortOrder] = useState('desc');
    const ordersSentinelRef = useRef(null);

    const [activeQrOrderId, setActiveQrOrderId] = useState(null);
    const [menu, setMenu] = useState([]);
    const [promotions, setPromotions] = useState([]);
    const [tables, setTables] = useState([]);
    const [inventory, setInventory] = useState([]);
    const [expenses, setExpenses] = useState([]);
    const [editExpense, setEditExpense] = useState(null);
    const [staff, setStaff] = useState([]);
    const [roles, setRoles] = useState([]);

    const [schedules, setSchedules] = useState([]);
    const [disciplinaryLogs, setDisciplinaryLogs] = useState([]);

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

    // --- LAZY LOADING / PAGINATION STATE ---
    const [hasMoreOrders, setHasMoreOrders] = useState(true);
    const [ordersPage, setOrdersPage] = useState(1);
    const [isLoadingMoreOrders, setIsLoadingMoreOrders] = useState(false);

    const [hasMoreImports, setHasMoreImports] = useState(true);
    const [importsPage, setImportsPage] = useState(1);
    const [isLoadingMoreImports, setIsLoadingMoreImports] = useState(false);

    // --- BACKUP & RESTORE (via hook) ---
    const { backups, isBackingUp, isRestoring, fetchBackups, handleCreateBackup, handleRestoreBackup } = useBackupRestore({ activeTab, userRole, showToast });

    // Tính toán số liệu thống kê chung cho Component cha (Đặc biệt để truyền xuống InlineEditPanel)
    // [REPORT COMPUTATIONS - to be extracted]

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

    // --- INVENTORY REPORT / CALENDAR FILTER STATE ---
    const [inventoryReportMode, setInventoryReportMode] = useState('standard'); // 'standard' | 'calendar'
    const [calType, setCalType] = useState('month'); // 'month' | 'quarter' | 'year'
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [selectedQuarter, setSelectedQuarter] = useState(Math.ceil((new Date().getMonth() + 1) / 3));
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

    const [showStaffReport, setShowStaffReport] = useState(null);
    const [editTable, setEditTable] = useState(null);
    const [editingOrderId, setEditingOrderId] = useState(null); // Keep this for inline UI if needed
    const [editOrder, setEditOrder] = useState(null); // Full order object for StaffOrderPanel
    const [cancelOrderId, setCancelOrderId] = useState(null); // For cancel modal
    const [cancelReason, setCancelReason] = useState(''); // Cancel reason text
    const [fixedCosts, setFixedCosts] = useState({ rent: 0, machines: 0, electricity: 0, water: 0, salaries: 0, other: 0, useDynamicSalaries: false });
    const inlineDraftRef = useRef(null);

    // --- PROMOTIONS ---
    const [editPromo, setEditPromo] = useState(null);

    // --- INVENTORY STATE ---
    const [imports, setImports] = useState([]);
    const [inventoryStats, setInventoryStats] = useState([]);
    const [inventoryAudits, setInventoryAudits] = useState([]);
    const [inventorySubTab, setInventorySubTab] = useState('import');
    const [inventoryPeriod, setInventoryPeriod] = useState('month');
    const [showImportTrash, setShowImportTrash] = useState(false);
    const [selectedMergeItems, setSelectedMergeItems] = useState([]);
    const [showMergeModal, setShowMergeModal] = useState(false);
    const [showAutoPoModal, setShowAutoPoModal] = useState(false);
    const [editingIngId, setEditingIngId] = useState(null);
    const [editingIngName, setEditingIngName] = useState('');
    const [draggingId, setDraggingId] = useState(null);
    const [deleteInventoryModal, setDeleteInventoryModal] = useState(null);
    const [bepMode, setBepMode] = useState('item');

    // --- INVENTORY AUDIT MODAL ---
    const [showAuditModal, setShowAuditModal] = useState(false);
    const [auditFilterIngredient, setAuditFilterIngredient] = useState('all');
    const [auditFilterPeriod, setAuditFilterPeriod] = useState('all');
    const [auditStartDate, setAuditStartDate] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); });
    const [auditEndDate, setAuditEndDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [auditReportTab, setAuditReportTab] = useState('history');

    // --- PRODUCTION MODAL ---
    const [showProductionModal, setShowProductionModal] = useState(false);
    const [productionInputs, setProductionInputs] = useState([{ id: '', qty: '' }]);
    const [productionOutputItem, setProductionOutputItem] = useState('');
    const [productionOutputUnit, setProductionOutputUnit] = useState('');
    const [productionOutputQty, setProductionOutputQty] = useState('');

    // --- MENU ---
    const [deleteMenuModal, setDeleteMenuModal] = useState(null);

    // --- STAFF ---
    const [editStaff, setEditStaff] = useState(null);
    const [editRole, setEditRole] = useState(null);
    const [staffSubTab, setStaffSubTab] = useState('list');
    const [attendanceToken, setAttendanceToken] = useState('');
    const [showDisciplinaryModalFor, setShowDisciplinaryModalFor] = useState(null);

    // --- SETTINGS / NETWORK ---
    const [cfStatus, setCfStatus] = useState({ active: false, log: '' });
    const [qrToken, setQrToken] = useState(null);
    const [showCfGuide, setShowCfGuide] = useState(false);
    const [lanIP, setLanIP] = useState('localhost');
    const [lanHostname, setLanHostname] = useState('');

    // Printer Settings
    const [printers, setPrinters] = useState([]);
    const [selectedPrinter, setSelectedPrinter] = useState(() => localStorage.getItem('selectedPrinter') || '');
    const [printReceiptEnabled, setPrintReceiptEnabled] = useState(() => localStorage.getItem('printReceiptEnabled') === 'true');

    useEffect(() => {
        if (window.require) {
            // Chỉ cần get-printers khi vào tab settings, không cần gọi mỗi lần đổi tab
            if (activeTab === 'settings') {
                const { ipcRenderer } = window.require('electron');
                ipcRenderer.invoke('get-printers').then(res => {
                    if (res.success) setPrinters(res.printers);
                }).catch(console.error);
            }
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
        if (activeTab !== 'settings') return; // Chỉ poll khi đang ở tab Settings — giảm 95%+ request thừa khi dùng tab đơn hàng/menu/kho
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
    }, [activeTab]);

    // ── Numpad 00 Global Shortcut ──
    // ESC/Enter được QuickPaymentModal tự xử lý, hook chỉ cần phát hiện phím 00
    useKeyboardShortcuts({
        activeTab, showOrderPanel, expandedItemId, cancelOrderId, orders,
        confirmZeroOrder, setConfirmZeroOrder, showToast, isDoubleTap
    });


    // ===== RESTORED FUNCTIONS & COMPUTEDS =====

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

    const inventoryStatsMapping = React.useMemo(() => {
        const map = {};
        inventoryStats.forEach(s => { map[s.id] = s; });
        return map;
    }, [inventoryStats]);

    const inventorySummary = React.useMemo(() => {
        let totalImport = 0;
        let totalUsage = 0;
        let totalStockValue = 0;
        inventoryStats.forEach(s => {
            const isRange = inventoryReportMode === 'calendar' || inventoryPeriod === 'custom';
            const impVal = isRange ? (s.importCost || 0) : (inventoryPeriod === 'today' ? s.imp1 : inventoryPeriod === 'week' ? s.imp7 : inventoryPeriod === 'month' ? s.imp30 : inventoryPeriod === 'quarter' ? s.impQuarter : inventoryPeriod === 'year' ? s.impYear : s.impAll);
            const useVal = isRange ? (s.usageCost || 0) : (inventoryPeriod === 'today' ? s.cost1 : inventoryPeriod === 'week' ? s.cost7 : inventoryPeriod === 'month' ? s.cost30 : inventoryPeriod === 'quarter' ? s.costQuarter : inventoryPeriod === 'year' ? s.costYear : s.costAll);
            totalImport += (impVal || 0);
            totalUsage += (useVal || 0);
            totalStockValue += (s.stock * (s.avgCost || 0));
        });
        return { totalImport, totalUsage, totalStockValue };
    }, [inventoryStats, inventoryReportMode, inventoryPeriod]);

    const memoizedProductionMap = React.useMemo(() => {
        const map = {};
        inventoryAudits.forEach(a => {
            if (a.type === 'PRODUCTION' && a.output) {
                if (a.output.id) map[a.output.id] = a;
                if (a.output.name) map[a.output.name] = a;
            }
        });
        return map;
    }, [inventoryAudits]);

    const menuIngredientsInUse = React.useMemo(() => {
        const inUse = {};
        const activeMenu = menu.filter(m => !m.isDeleted);
        activeMenu.forEach(menuItem => {
            const checkRecipe = (recipe) => {
                if (Array.isArray(recipe)) {
                    recipe.forEach(r => { if (r.ingredientId) inUse[r.ingredientId] = menuItem.name; });
                }
            };
            checkRecipe(menuItem.recipe);
            if (Array.isArray(menuItem.sizes)) menuItem.sizes.forEach(s => checkRecipe(s.recipe));
            if (Array.isArray(menuItem.addons)) menuItem.addons.forEach(a => checkRecipe(a.recipe));
        });
        return inUse;
    }, [menu]);

    // Tính toán số liệu 30 ngày cho BEP
    // useMemo: chỉ tính lại khi report.logs, menu hoặc inventoryStats thực sự thay đổi
    // Tránh chạy O(N×M) loop mỗi render (N=logs, M=menu×inventory)
    const stats30Days = React.useMemo(() => {
        if (!report?.logs) return { avgPrice: 0, avgCost: 0, projectedMonthlyItems: 0 };
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

        // Tối ưu: Tạo Map từ inventoryStats trước để lookup O(1) thay vì .find() O(N) trong loop
        const invMap = new Map((inventoryStats || []).map(s => [s.id, s]));

        // Tính Cost trung bình của toàn menu
        let totalMenuCost = 0;
        let validItemCount = 0;
        menu.forEach(item => {
            const baseRecipeCost = (item.recipe || []).reduce((sum, r) => {
                const inv = invMap.get(r.ingredientId);
                return sum + (inv ? (inv.avgCost || 0) * r.quantity : 0);
            }, 0);
            const firstSize = item.sizes?.[0];
            const multiplier = firstSize?.multiplier || 1.0;
            const sizeSpecificCost = (firstSize?.recipe || []).reduce((sum, r) => {
                const inv = invMap.get(r.ingredientId);
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
    }, [report?.logs, menu, inventoryStats]); // eslint-disable-line react-hooks/exhaustive-deps

    // Sử dụng số liệu từ cài đặt chuẩn cho việc tính toán tổng chi phí cố định (bỏ qua các chi phí linh động đã được tách riêng)
    const totalFixed = (parseFloat(fixedCosts.rent) * 1000 || 0) + 
                       (parseFloat(fixedCosts.machines) * 1000 || 0) + 
                       (parseFloat(fixedCosts.electricity) * 1000 || 0) + 
                       (parseFloat(fixedCosts.water) * 1000 || 0) + 
                       (parseFloat(fixedCosts.salaries) * 1000 || 0) + 
                       (parseFloat(fixedCosts.other) * 1000 || 0);

    const saveP = savePromotion;
    const deleteP = deletePromotion;
    // ===== END RESTORED =====

    // ── Intersection Observer for Lazy Loading ──
    useEffect(() => {
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                if (activeTab === 'orders' && showCompletedOrdersRef.current) {
                    fetchMoreOrders();
                }
            }
        }, { threshold: 0.1 });

        if (ordersSentinelRef.current) observer.observe(ordersSentinelRef.current);
        return () => observer.disconnect();
    }, [activeTab, ordersPage, hasMoreOrders]); // Tối ưu: bỏ dependency isLoading để tránh re-bind liên tục

    const isDirty = expandedItemId !== null;

    // ── Polling: CHỈ cập nhật orders + report (dữ liệu cần thời gian thực) ──
    const fetchOrders = async (resetPagination = false) => {
        try {
            const isHistoryMode = showCompletedOrdersRef.current;
            const isDebtMode = showDebtOrdersRef.current;
            const isActiveMode = !isHistoryMode && !isDebtMode;

            // Nếu đang xem lịch sử/nợ và chỉ là polling định kỳ (không phải reset)
            // thì KHÔNG tải lại danh sách đơn hàng để tránh nhảy trang (jitter)
            let fetchOrdersUrl = null;
            if (isActiveMode || resetPagination) {
                fetchOrdersUrl = isHistoryMode ?
                    `/api/orders?history=true&date=${historyDateRef.current}&page=1&limit=20` :
                    (isDebtMode ? '/api/orders?debt=true' : '/api/orders');
            }

            const [oR, rR, sR, rolesR] = await Promise.all([
                fetchOrdersUrl ? fetch(`${SERVER_URL}${fetchOrdersUrl}`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` } }) : Promise.resolve(null),
                fetch(`${SERVER_URL}/api/report`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` } }),
                fetch(`${SERVER_URL}/api/pos/checkout/status`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` } }),
                fetch(`${SERVER_URL}/api/roles`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` } })
            ]);

            if (oR) {
                const nextOrders = await oR.json();
                setOrders(prev => {
                    if (resetPagination) return nextOrders;
                    // So sánh signature nhẹ: "id:status:isPaid" thay vì JSON.stringify toàn bộ
                    // Giảm từ ~50-100KB string xuống còn ~200 chars, nhanh hơn ~100x
                    if (prev.length === nextOrders.length) {
                        const prevSig = prev.map(o => `${o.id}:${o.status}:${o.isPaid}`).join('|');
                        const nextSig = nextOrders.map(o => `${o.id}:${o.status}:${o.isPaid}`).join('|');
                        if (prevSig === nextSig) return prev;
                    }
                    return nextOrders;
                });

                if (isHistoryMode && resetPagination) {
                    setOrdersPage(1);
                    setHasMoreOrders(nextOrders.length === 20);
                }
            }

            const rData = await rR.json();
            // So sánh report qua các field ĐÚNG từ server
            // Server trả về: totalSales, successfulOrders, cancelledOrders, logs
            // (KHÔNG phải totalRevenue, totalOrders, totalCancelled — bug cũ)
            setReport(prev => {
                if (prev?.totalSales === rData.totalSales &&
                    prev?.successfulOrders === rData.successfulOrders &&
                    prev?.cancelledOrders === rData.cancelledOrders &&
                    (prev?.logs?.length ?? 0) === (rData.logs?.length ?? 0)) return prev;
                return rData;
            });
            // fixedCosts là object phẳng ít field — so sánh trực tiếp từng field
            if (rData.fixedCosts) setFixedCosts(prev => {
                const fc = rData.fixedCosts;
                if (prev.rent === fc.rent && prev.salaries === fc.salaries &&
                    prev.electricity === fc.electricity && prev.water === fc.water &&
                    prev.machines === fc.machines && prev.other === fc.other) return prev;
                return fc;
            });
            if (rData.nextQueueNumber) _idCounter = rData.nextQueueNumber;

            const statusData = await sR.json();
            setActiveQrOrderId(prev => prev === statusData.activeOrderId ? prev : statusData.activeOrderId);

            const rolesData = await rolesR.json();
            // roles: so sánh length trước (thay đổi thường xuyên nhất), rồi mới so ID
            setRoles(prev => {
                if (prev.length !== rolesData.length) return rolesData;
                const prevIds = prev.map(r => r.id).join(',');
                const nextIds = rolesData.map(r => r.id).join(',');
                return prevIds === nextIds ? prev : rolesData;
            });
        } catch (err) { /* silent */ }
    };

    const fetchMoreOrders = async () => {
        if (isLoadingMoreOrders || !hasMoreOrders || !showCompletedOrdersRef.current) return;
        setIsLoadingMoreOrders(true);
        try {
            const nextPage = ordersPage + 1;
            const endpoint = `/api/orders?history=true&date=${historyDateRef.current}&page=${nextPage}&limit=20`;
            const res = await fetch(`${SERVER_URL}${endpoint}`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` } });
            const data = await res.json();
            if (data.length < 20) setHasMoreOrders(false);
            if (data.length > 0) {
                setOrders(prev => [...prev, ...data]);
                setOrdersPage(nextPage);
            } else {
                setHasMoreOrders(false);
            }
        } catch (err) { console.error(err); }
        finally { setIsLoadingMoreOrders(false); }
    };

    // ── On-demand: Tải menu + tables + inventory + staff (KHÔNG tự động lặp) ──
    const fetchStaticData = async (trashOverride = null) => {
        // AUTH GUARD: không fetch nếu chưa đăng nhập (tránh 401 spam)
        const token = localStorage.getItem('authToken');
        if (!token) return;

        // Capture tab hiện tại để detect stale response
        const tabAtStart = activeTabRef.current;

        try {
            const headers = { 'Authorization': `Bearer ${token}` };

            // Optimization: Lazy Loading - Only fetch data relevant to the active tab
            if (activeTab === 'orders' || activeTab === 'menu' || activeTab === 'tables' || activeTab === 'reports') {
                const [mR, tR, promoR, iR, statR] = await Promise.all([
                    fetch(`${SERVER_URL}/api/menu?all=true`, { headers }),
                    fetch(`${SERVER_URL}/api/tables`, { headers }),
                    fetch(`${SERVER_URL}/api/promotions`, { headers }),
                    fetch(`${SERVER_URL}/api/inventory`, { headers }),
                    fetch(`${SERVER_URL}/api/inventory/stats`, { headers })
                ]);
                // ⛔ Bảo vệ item chưa lưu: không overwrite khi đang có _isUnsaved item
                const freshMenuData = await mR.json();
                // Stale check: nếu user đã chuyển tab trong khi await → bỏ qua kết quả
                if (activeTabRef.current !== tabAtStart) return;
                setMenu(prev => prev.some(item => item._isUnsaved) ? prev : freshMenuData);
                setTables(await tR.json());
                setPromotions(await promoR.json());
                setInventory(await iR.json());
                setInventoryStats(await statR.json());
            }

            if (tabAtStart === 'reports') {
                const [auditR, expR, sR] = await Promise.all([
                    fetch(`${SERVER_URL}/api/inventory/audits`, { headers }),
                    fetch(`${SERVER_URL}/api/expenses`, { headers }),
                    fetch(`${SERVER_URL}/api/staff`, { headers })
                ]);
                if (activeTabRef.current !== tabAtStart) return;
                setInventoryAudits(await auditR.json());
                setExpenses(await expR.json());
                setStaff(await sR.json());
            }

            if (tabAtStart === 'inventory') {
                const currentTrash = trashOverride !== null ? trashOverride : showImportTrash;
                const statUrl = inventoryPeriod === 'custom' ? `${SERVER_URL}/api/inventory/stats/range?start=${customStartDate}&end=${customEndDate}` : `${SERVER_URL}/api/inventory/stats`;
                const [iR, impR, statR, auditR, expR] = await Promise.all([
                    fetch(`${SERVER_URL}/api/inventory`, { headers }),
                    fetch(`${SERVER_URL}/api/imports?page=1&limit=20&showTrash=${currentTrash}&period=${inventoryPeriod}&start=${customStartDate}&end=${customEndDate}`, { headers }),
                    fetch(statUrl, { headers }),
                    fetch(`${SERVER_URL}/api/inventory/audits`, { headers }),
                    fetch(`${SERVER_URL}/api/expenses`, { headers })
                ]);
                if (activeTabRef.current !== tabAtStart) return;
                setInventory(await iR.json());
                const firstImports = await impR.json();
                setImports(firstImports);
                setImportsPage(1);
                setHasMoreImports(firstImports.length === 20);
                setInventoryStats(await statR.json());
                setInventoryAudits(await auditR.json());
                setExpenses(await expR.json());
            }

            if (tabAtStart === 'staff') {
                const [sR, schedR, discR] = await Promise.all([
                    fetch(`${SERVER_URL}/api/staff`, { headers }),
                    fetch(`${SERVER_URL}/api/schedules`, { headers }),
                    fetch(`${SERVER_URL}/api/disciplinary`, { headers })
                ]);
                if (activeTabRef.current !== tabAtStart) return;
                setStaff(await sR.json());
                setSchedules(await schedR.json());
                setDisciplinaryLogs(await discR.json());
            }

            // Roles đã được fetch trong fetchOrders() riêng, không cần fetch lại ở đây

        } catch (err) { console.error('fetchStaticData error:', err); }
    };

    // HÀM LÀM MỚI NHẬP KHO CỰC NHANH (Chỉ tải imports, không tải toàn bộ static data)

    const fetchInventoryRange = async (start, end) => {
        try {
            const res = await fetch(`${SERVER_URL}/api/inventory/stats/range?start=${start}&end=${end}`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` } });
            setInventoryStats(await res.json());
        } catch (err) { console.error(err); }
    };

    // Alias for backward compatibility where fetchData was called elsewhere
    const fetchShiftsAndRatings = async () => {
        try {
            const [sRes, rRes, stRes, dRes] = await Promise.all([
                fetch(`${SERVER_URL}/api/shifts`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` } }),
                fetch(`${SERVER_URL}/api/ratings`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` } }),
                fetch(`${SERVER_URL}/api/staff`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` } }),
                fetch(`${SERVER_URL}/api/disciplinary`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` } })
            ]);
            const nextShifts = await sRes.json();
            const nextRatings = await rRes.json();
            const nextStaff = await stRes.json();
            const nextDlogs = await dRes.json();

            // So sánh nhẹ (length + ID) thay vì JSON.stringify toàn bộ mảng
            // Tránh serialize ~100KB data mỗi 15 giây báckup interval
            setShifts(prev => {
                if (prev.length !== nextShifts.length) return nextShifts;
                if (prev[0]?.id !== nextShifts[0]?.id || prev[prev.length-1]?.id !== nextShifts[nextShifts.length-1]?.id) return nextShifts;
                return prev;
            });
            setRatings(prev => {
                if (prev.length !== nextRatings.length) return nextRatings;
                if (prev[0]?.id !== nextRatings[0]?.id) return nextRatings;
                return prev;
            });
            setStaff(prev => {
                if (prev.length !== nextStaff.length) return nextStaff;
                const prevSig = prev.map(s => s.id).join(',');
                const nextSig = nextStaff.map(s => s.id).join(',');
                return prevSig === nextSig ? prev : nextStaff;
            });
            setDisciplinaryLogs(prev => {
                if (prev.length !== nextDlogs.length) return nextDlogs;
                if (prev[0]?.id !== nextDlogs[0]?.id) return nextDlogs;
                return prev;
            });
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
            settingsRef.current = data; // sync ref để SSE closure đọc được settings mới nhất
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

    // fetchData: chạy song song (Promise.all) thay vì tuần tự (await) — giảm thời gian tế ~70%
    const fetchData = async () => {
        await Promise.all([
            fetchOrders(),
            fetchStaticData(),
            fetchShiftsAndRatings(),
            fetchSettings(),
            fetchLanIP()
        ]);
    };

    // Ref để lưu activeTab hiện tại trong interval mà không tạo lại interval
    const activeTabRef = useRef(activeTab);
    useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

    // ── SSE Hybrid: Real-time push + Backup polling ──
    // SSE: Server push khi có đơn mới (~150ms) thay vì polling 5 giây
    // Backup 60s: Safety net khi SSE miss event (network flicker, server restart)
    useEffect(() => {
        isInitialMount.current = false;
        // Load data đầu tiên khi mount
        fetchData();

        let debounceTimer = null;
        let es = null;
        let backupTimer = null;


        const handleOrderChanged = () => {
            // Debounce: gom burst từ nhiều kiosk order cùng lúc (window 150ms)
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                // LUÔN fetch orders khi SSE nhận được ORDER_CHANGED, bất kể tab nào
                // Đảm bảo orders state luôn fresh (cần cho Reports tab khi click audit entry)
                // Chỉ skip nếu đang xem lịch sử/nợ để tránh scroll jump
                if (!showCompletedOrdersRef.current && !showDebtOrdersRef.current) {
                    fetchOrders();
                }
            }, 150);
        };

        const connectSSE = () => {
            if (es) { es.close(); es = null; }
            try {
                es = new EventSource(`${SERVER_URL}/api/events`);

                es.addEventListener('CONNECTED', () => {
                    console.log('[SSE] Connected to server push.');
                });

                es.addEventListener('ORDER_CHANGED', handleOrderChanged);

                // Lắng nghe xác nhận thanh toán tự động (SePay / MoMo)
                es.addEventListener('PAYMENT_CONFIRMED', (e) => {
                    try {
                        const data = JSON.parse(e.data);
                        setOrders(prev => prev.map(o =>
                            o.id === data.orderId ? { ...o, isPaid: true } : o
                        ));
                        const sourceLabel = data.source === 'sepay' ? 'SePay'
                            : data.source === 'momo' ? 'MoMo'
                            : data.source === 'mbbank' ? 'MB Bank' : 'Auto';
                        showToast(`✅ Đơn #${data.queueNumber} đã nhận tiền qua ${sourceLabel}`, 'success');

                        // TTS — đọc settingsRef để luôn có giá trị mới nhất
                        const curSettings = settingsRef.current;
                        console.log('[TTS] PAYMENT_CONFIRMED:', data, '| paymentTTS:', curSettings?.paymentTTS);
                        if (curSettings?.paymentTTS !== false && window.speechSynthesis) {
                            try {
                                window.speechSynthesis.cancel();
                                // data.amount = order.price (đơn vị NGHÌN đồng, VD: 35 = 35.000đ)
                                const amountK = Math.round(data.amount || 0);
                                const amountText = amountK > 0 ? `, ${amountK} nghìn đồng` : '';
                                const text = `Đã nhận tiền, đơn số ${data.queueNumber}${amountText}`;
                                console.log('[TTS] Phát:', text);
                                const utt = new window.SpeechSynthesisUtterance(text);
                                utt.lang = 'vi-VN';
                                utt.rate = 0.95;
                                utt.pitch = 1.05;
                                utt.volume = 1;
                                utt.onerror = (ev) => console.warn('[TTS] utterance error:', ev.error);
                                utt.onstart = () => console.log('[TTS] Bắt đầu phát');
                                utt.onend   = () => console.log('[TTS] Phát xong');
                                const voices = window.speechSynthesis.getVoices();
                                const viVoice = voices.find(v => v.lang === 'vi-VN')
                                             || voices.find(v => v.lang.startsWith('vi'));
                                if (viVoice) { utt.voice = viVoice; console.log('[TTS] Dùng giọng:', viVoice.name); }
                                window.speechSynthesis.speak(utt);
                            } catch (ttsErr) { console.warn('[TTS] Lỗi:', ttsErr); }
                        } else {
                            console.log('[TTS] Không phát —',
                                !window.speechSynthesis ? 'speechSynthesis không có' : 'bị tắt trong cài đặt');
                        }
                    } catch { /* ignore parse error */ }
                });

                es.onerror = () => {
                    // Browser tự reconnect với exponential backoff — không cần tự xử lý
                };
            } catch (e) {
                console.warn('[SSE] EventSource not supported, falling back to polling.');
            }
        };

        connectSSE();

        // Backup interval 60s: Đảm bảo sync dù SSE miss event
        backupTimer = setInterval(async () => {
            // Fetch orders bất kể tab nào (đảm bảo orders state luôn fresh)
            // Skip nếu đang xem lịch sử/nợ để tránh reset scroll
            if (!showCompletedOrdersRef.current && !showDebtOrdersRef.current) {
                fetchOrders();
            }
            fetchShiftsAndRatings();
            // Cập nhật SL thực tế của menu (availablePortions)
            // Giữ so sánh để tránh setMenu vô ích khi menu không đổi
            try {
                const res = await fetch(`${SERVER_URL}/api/menu?all=true`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` } });
                if (res.ok) {
                    const data = await res.json();
                    setMenu(prev => {
                        // ⛔ Bảo vệ item chưa lưu: nếu đang có món mới tạm (_isUnsaved),
                        // KHÔNG overwrite menu từ server — tránh mất dữ liệu đang edit
                        if (prev.some(item => item._isUnsaved)) return prev;
                        // So sánh nhẹ: length + id món đầu/cuối + availablePortions món đầu
                        if (prev.length === data.length &&
                            prev[0]?.id === data[0]?.id &&
                            prev[0]?.availablePortions === data[0]?.availablePortions) return prev;
                        return data;
                    });
                }
            } catch (e) { /* ignore */ }
            // Poll for print jobs from remote kitchen (Electron only)
            if (window.require) {
                try {
                    const printQRes = await fetch(`${SERVER_URL}/api/print/queue`);
                    if (printQRes.ok) {
                        const jobs = await printQRes.json();
                        if (jobs && jobs.length > 0) {
                            const { ipcRenderer } = window.require('electron');
                            for (const job of jobs) {
                                try {
                                    await ipcRenderer.invoke('print-html', job.html, job.printerName, job.paperSize);
                                    await fetch(`${SERVER_URL}/api/print/queue/${job.id}`, { method: 'POST' });
                                } catch(e) { console.error('Auto print failed:', e); }
                            }
                        }
                    }
                } catch(e) {}
            }
        }, 15_000); // 15s backup — nếu SSE fail, orders vẫn sync trong vòng 15s

        return () => {
            if (es) es.close();
            clearTimeout(debounceTimer);
            clearInterval(backupTimer);
        };
    }, []); // [] — chỉ tạo 1 lần khi mount

    // ══════════════════════════════════════════════════════════════════
    // FETCH TRIGGER — CHỈ 1 EFFECT DUY NHẤT cho tab + inventory settings
    //
    // Vấn đề cũ (2.0.29): có 2 effect riêng cùng deps activeTab:
    //   Effect 1: [activeTab] → fetchStaticData()
    //   Effect 2: [activeTab, inventoryReportMode, ...] → fetchStaticData()
    // → Cả 2 fire đồng thời khi switch tab → 10 concurrent requests → lag!
    //
    // Fix (2.0.30): Gộp vào 1 effect duy nhất, xử lý mọi case trong đó.
    // Effect inventoryPeriod tách riêng vì phụ thuộc state khác nhau.
    // ══════════════════════════════════════════════════════════════════
    useEffect(() => {
        if (!isInitialMount.current && activeTab === 'inventory') {
            fetchData();
        }
    }, [inventoryPeriod, customStartDate, customEndDate]);

    useEffect(() => {
        if (activeTab === 'orders') {
            fetchOrders();
            return;
        }
        // Inventory với calendar mode: fetch range thay vì static data
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
            return;
        }
        // Tất cả tab còn lại (bao gồm inventory+standard): 1 lần fetchStaticData duy nhất
        fetchStaticData();
    }, [activeTab, inventoryReportMode, calType, selectedMonth, selectedQuarter, selectedYear]);

    const handleTabChange = (id) => {
        if (id === activeTab) return;
        if (isDirty) { setPendingTab(id); return; }
        setActiveTab(id);
        // fetchStaticData() sẽ tự động gọi qua useEffect([activeTab]) phaìi dưới
        // Không gọi thêm ở đây để tránh double-fetch
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
                setReport(prev => ({ ...prev, fixedCosts: data.fixedCosts }));
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

            // Xóa flag nội bộ trước khi gửi lên server
            const wasUnsaved = finalItem._isUnsaved;
            delete finalItem._isUnsaved;

            if (!finalItem.shortcutCode || !finalItem.shortcutCode.startsWith(expectedPrefix)) {
                // If missing or prefix is wrong (e.g. user changed category), regenerate it mapping to the new one
                finalItem.shortcutCode = generateHotkey(item.category, menu);
            }

            const res = await fetch(`${SERVER_URL}/api/menu`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(finalItem)
            });
            if (res.ok) {
                showToast(wasUnsaved ? 'Đã tạo và lưu món mới!' : 'Lưu thành công!');
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

    // Logic menu reorder moved to MenuTab.jsx

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

    const saveStaff = async (member) => {
        const id = member.id || Date.now().toString();
        await fetch(`${SERVER_URL}/api/staff/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...member, id })
        });
        fetchData();
    };

    const saveDisciplinaryLog = async (log) => {
        const res = await fetch(`${SERVER_URL}/api/disciplinary`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(log)
        });
        if (res.ok) {
            fetchData(); // to get updated diligence points
        }
    };

    const deleteDisciplinaryLog = async (id) => {
        const res = await fetch(`${SERVER_URL}/api/disciplinary/${id}`, { method: 'DELETE' });
        if (res.ok) {
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

    const saveRole = async (roleData) => {
        try {
            await fetch(`${SERVER_URL}/api/roles`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: JSON.stringify(roleData)
            });
            fetchData();
        } catch (err) {
            console.error('Lỗi khi lưu vai trò:', err);
        }
    };

    const deleteRole = async (roleId) => {
        if (!window.confirm('Bạn có chắc chắn muốn xóa vai trò này?')) return;
        try {
            await fetch(`${SERVER_URL}/api/roles/${roleId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
            });
            fetchData();
        } catch (err) {
            console.error('Lỗi khi xóa vai trò:', err);
        }
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

    const handleChangePassword = async () => {
        const { oldPassword, newPassword, confirmPassword, newUsername } = passwordData;
        const submitUsername = newUsername || settings.adminUsername || 'admin';

        if (!oldPassword || !newPassword || !confirmPassword || !submitUsername) {
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
        if (submitUsername.length < 3) {
            setPasswordMessage({ text: 'Tên đăng nhập mới phải từ 3 ký tự trở lên.', type: 'error' });
            return;
        }

        try {
            const token = localStorage.getItem('authToken'); // Use authToken for admin
            const res = await fetch(`${SERVER_URL}/api/auth/admin/credentials`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ oldPassword, newPassword, newUsername: submitUsername })
            });
            const data = await res.json();
            if (data.success) {
                setPasswordMessage({ text: data.message, type: 'success' });
                setPasswordData({ oldPassword: '', newPassword: '', confirmPassword: '', newUsername: '' });
                if (data.recoveryCode) {
                    setSettings(prev => ({ ...prev, adminRecoveryCode: data.recoveryCode, adminUsername: submitUsername }));
                    setNewRecoveryCode(data.recoveryCode);
                }
                setTimeout(() => { setPasswordMessage({ text: '', type: '' }); }, 5000);
            } else {
                setPasswordMessage({ text: data.message, type: 'error' });
            }
        } catch (e) {
            setPasswordMessage({ text: 'Lỗi kết nối đến máy chủ.', type: 'error' });
        }
    };

    // Group menu by category
    const categories = getSortedCategories(menu, settings);

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
                            <div className="bg-white/20 animate-pulse" style={{ padding: '8px',  borderRadius: 'var(--radius-badge)' }}>
                                <RefreshCw size={20} className={isUpdating ? 'animate-spin' : ''} />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <p className="text-sm font-black uppercase tracking-widest">Phát hiện bản cập nhật mới: v{latestVersion}</p>
                                    {latestDescription && (
                                        <button
                                            onClick={() => setShowReleaseNotes(!showReleaseNotes)}
                                            className="text-[9px] bg-white/20 px-2 py-0.5 font-black hover:bg-white/30 transition-colors uppercase tracking-widest cursor-pointer border border-white/10" style={{ borderRadius: 'var(--radius-badge)' }}
                                        >
                                            {showReleaseNotes ? 'THU GỌN' : 'XEM CHI TIẾT'}
                                        </button>
                                    )}
                                </div>
                                <p className="text-[10px] opacity-80 font-bold uppercase">Bạn đang sử dụng phiên bản v{systemVersion}. Hãy cập nhật để trải nghiệm tính năng mới nhất.</p>
                                {showReleaseNotes && latestDescription && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        className="mt-3 p-4 bg-black/20 border-l-4 border-white/40 text-[12px] font-bold leading-relaxed max-h-[300px] overflow-y-auto"
                                    >
                                        <div style={{ whiteSpace: 'pre-line' }} className="font-main uppercase tracking-tight text-white/90">
                                            {latestDescription}
                                        </div>
                                    </motion.div>
                                )}
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
                                const arch = window.process?.arch;

                                if (isElectron && (isMac || isWin)) {
                                    // Tìm asset phù hợp theo OS và Kiến trúc vi xử lý
                                    const asset = latestAssets.find(a => {
                                        const name = a.name.toLowerCase();
                                        if (isMac) {
                                            if (arch === 'arm64') {
                                                return name.includes('arm64') && name.endsWith('.dmg');
                                            } else {
                                                return !name.includes('arm64') && name.endsWith('.dmg');
                                            }
                                        }
                                        if (isWin) return name.endsWith('.exe');
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

                    {newRecoveryCode && (
                        <div className="fixed inset-0 z-[600] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white w-full max-w-md overflow-hidden shadow-2xl relative z-10 flex flex-col" style={{ borderRadius: 'var(--radius-modal)' }}>
                                <div className="bg-red-600 p-6 text-center">
                                    <div className="w-16 h-16 bg-white/20 flex items-center justify-center mx-auto mb-4" style={{ borderRadius: '50%' }}>
                                        <KeyRound size={32} className="text-white" />
                                    </div>
                                    <h2 className="text-xl font-black uppercase tracking-widest text-white mb-2">QUAY CHỤP LẠI MÃ NÀY!</h2>
                                    <p className="text-white/80 text-sm font-medium leading-relaxed">Vì bạn vừa thay đổi thông tin quản lý, hệ thống đã tạo MÃ KHÔI PHỤC MỚI. Mã cũ không còn tác dụng!!</p>
                                </div>
                                <div className="p-6 bg-gray-50 flex flex-col items-center">
                                    <div className="bg-white px-6 py-4 border-2 border-red-500 border-dashed mb-6 flex items-center gap-4" style={{ borderRadius: '12px' }}>
                                        <span className="text-3xl font-mono font-black text-red-600 tracking-[0.2em]">{newRecoveryCode}</span>
                                        <button onClick={() => { navigator.clipboard.writeText(newRecoveryCode); showToast('Đã copy!', 'success') }} className="p-2 bg-red-100 text-red-600 hover:bg-red-200 transition-colors" style={{ borderRadius: '8px' }}>
                                            <Copy size={20} />
                                        </button>
                                    </div>
                                    <button onClick={() => setNewRecoveryCode(null)} className="w-full bg-gray-900 text-white font-black text-sm uppercase py-4 hover:bg-black transition-colors" style={{ borderRadius: 'var(--radius-btn)' }}>
                                        TÔI ĐÃ LƯU MÃ NÀY
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}

                    {/* FACTORY RESET MODAL */}
                <FactoryResetModal
                    showFactoryResetModal={showFactoryResetModal}
                    setShowFactoryResetModal={setShowFactoryResetModal}
                    showToast={showToast}
                    backups={backups}
                />
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
                            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} className="bg-white w-full max-w-4xl overflow-hidden shadow-2xl relative z-10 p-6 flex flex-col max-h-[90vh]" style={{ borderRadius: 'var(--radius-modal)' }}>
                                <div className="flex justify-between items-center mb-6 border-b border-gray-100" style={{ paddingBottom: '16px' }}>
                                    <div>
                                        <h2 className="text-xl font-black uppercase tracking-widest text-brand-600 flex items-center gap-2">
                                            <ArrowRightLeft size={24} /> CHUYỂN BÀN
                                        </h2>
                                        <p className="font-bold text-gray-500 mt-1">Đơn hàng <span className="text-brand-600 bg-brand-50 px-2 py-0.5" style={{ borderRadius: 'var(--radius-badge)' }}>#{changeTableOrder.queueNumber}</span> đang phục vụ tại bàn <span className="text-orange-600 bg-orange-50 px-2 py-0.5" style={{ borderRadius: 'var(--radius-badge)' }}> {tables.find(t => t.id === changeTableOrder.tableId)?.name || ''} </span></p>
                                    </div>
                                    <button onClick={() => setChangeTableOrder(null)} className="p-3 bg-gray-50 hover:bg-gray-100 text-gray-500 transition-all" style={{ borderRadius: 'var(--radius-badge)' }}><X size={20} /></button>
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

                    {editTable && (
                        <TableModal
                            table={editTable.id ? editTable : null}
                            onSave={saveTable}
                            onClose={() => setEditTable(null)}
                            onDelete={(id) => { deleteTable(id); setEditTable(null); }}
                            userRole={userRole}
                        />
                    )}
                    {editImport && (
                        <ImportModal
                            inventory={inventory}
                            inventoryStats={inventoryStats}
                            initialData={editImport.name ? editImport : null}
                            memoizedProductionMap={memoizedProductionMap}
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
                    <EditPromoModal
                        editPromo={editPromo} setEditPromo={setEditPromo}
                        menu={menu} settings={settings}
                        saveP={saveP}
                    />
                </AnimatePresence>

                <AnimatePresence>
                    {showOrderPanel && <StaffOrderPanel
                        inventory={inventory}
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
                        idCounter={_idCounter}
                        setIdCounter={(val) => { _idCounter = val; }}
                        showToast={showToast}
                        formatVND={formatVND}
                        getVNTime={getVNTime}
                        setMenu={setMenu}
                    />}
                </AnimatePresence>

                {/* Header */}
                <AdminHeader
                    settings={settings} activeTab={activeTab} handleTabChange={handleTabChange}
                    isDirty={isDirty} userRole={userRole} userName={userName} userRoleName={userRoleName}
                    hasPermission={hasPermission}
                    systemVersion={systemVersion}
                    latestVersion={latestVersion}
                    hasUpdate={latestVersion && isNewerVersion(latestVersion, systemVersion)}
                />

                <main className="w-full mx-auto py-4 sm:py-6 pb-36 flex-1 overflow-x-hidden overflow-y-auto" style={{ paddingLeft: 'clamp(6px, 2vw, 24px)', paddingRight: 'clamp(6px, 2vw, 24px)' }}>

                <>

                        {/* ── ORDERS ── */}
                        {activeTab === 'orders' && (
                            <div key="orders" className="tab-panel">
                            <OrdersTab
                                orders={orders}
                                showCompletedOrders={showCompletedOrders}
                                showDebtOrders={showDebtOrders}
                                priorityMode={priorityMode}
                                settings={settings}
                                historyDate={historyDate}
                                historySortOrder={historySortOrder}
                                orderGridColumns={orderGridColumns}
                                activeQrOrderId={activeQrOrderId}
                                tables={tables}
                                editingOrderId={editingOrderId}
                                showCompletedOrdersRef={showCompletedOrdersRef}
                                showDebtOrdersRef={showDebtOrdersRef}
                                historyDateRef={historyDateRef}
                                ordersSentinelRef={ordersSentinelRef}
                                isLoadingMoreOrders={isLoadingMoreOrders}
                                hasMoreOrders={hasMoreOrders}
                                setOrders={setOrders}
                                setShowCompletedOrders={setShowCompletedOrders}
                                setShowDebtOrders={setShowDebtOrders}
                                setPriorityMode={setPriorityMode}
                                setSettings={setSettings}
                                setHistoryDate={setHistoryDate}
                                setHistorySortOrder={setHistorySortOrder}
                                setOrderGridColumns={setOrderGridColumns}
                                setActiveQrOrderId={setActiveQrOrderId}
                                setEditOrder={setEditOrder}
                                setShowOrderPanel={setShowOrderPanel}
                                setSelectedTableId={setSelectedTableId}
                                setCancelOrderId={setCancelOrderId}
                                setCancelReason={setCancelReason}
                                handleMarkDebt={handleMarkDebt}
                                handlePayDebt={handlePayDebt}
                                setViewReceiptOrder={setViewReceiptOrder}
                                completeOrder={completeOrder}
                                confirmPayment={confirmPayment}
                                fetchOrders={fetchOrders}
                                hasPermission={hasPermission}
                                formatVND={formatVND}
                                generateReceiptHTML={generateReceiptHTML}
                                SERVER_URL={SERVER_URL}
                                showToast={showToast}
                                updateOrder={updateOrder}
                                report={report}
                                showOrderPanel={showOrderPanel}
                            />
                            </div>
                        )}

                        {activeTab === 'menu' && (
                            <div key="menu" className="tab-panel">
                            <MenuTab 
                                menu={menu}
                                showMenuTrash={showMenuTrash}
                                setShowMenuTrash={setShowMenuTrash}
                                hasPermission={hasPermission}
                                viewMode={viewMode}
                                setViewMode={setViewMode}
                                setRecipeGuideSearch={setRecipeGuideSearch}
                                setShowRecipeGuide={setShowRecipeGuide}
                                setShowCategoryManager={setShowCategoryManager}
                                settings={settings}
                                setSettings={setSettings}
                                SERVER_URL={SERVER_URL}
                                categories={categories}
                                expandedItemId={expandedItemId}
                                setDraggingId={setDraggingId}
                                draggingId={draggingId}
                                getImageUrl={getImageUrl}
                                formatVND={formatVND}
                                userRole={userRole}
                                restoreMenuItem={restoreMenuItem}
                                deleteMenuItem={deleteMenuItem}
                                inventory={inventory}
                                inventoryStats={inventoryStats}
                                stats30Days={stats30Days}
                                totalFixed={totalFixed}
                                fixedCosts={fixedCosts}
                                saveMenuItem={saveMenuItem}
                                setExpandedItemId={setExpandedItemId}
                                inlineDraftRef={inlineDraftRef}
                                InlineEditPanel={InlineEditPanel}
                                // Migrated logic props
                                setMenu={setMenu}
                                fetchData={fetchData}
                                showToast={showToast}
                            />
                            </div>
                        )}

                        {activeTab === 'tables' && (
                        <div key="tables" className="tab-panel">
                        <TablesTab
                        tables={tables} orders={orders} settings={settings}
                        setActionTable={setActionTable} setEditTable={setEditTable}
                        />
                        </div>
                        )}

                        {activeTab === 'promotions' && settings.enablePromotions && (
                        <div key="promotions" className="tab-panel">
                        <PromotionsTab
                        promotions={promotions} menu={menu} settings={settings}
                        hasPermission={hasPermission} setEditPromo={setEditPromo}
                        deleteP={deleteP} saveP={saveP}
                        />
                        </div>
                        )}

                        {activeTab === 'inventory' && (
                            <div key="inventory" className="tab-panel">
                            <InventoryTab
                                inventory={inventory}
                                inventoryStats={inventoryStats}
                                inventoryAudits={inventoryAudits}
                                imports={imports}
                                expenses={expenses}
                                inventorySummary={inventorySummary}
                                inventoryStatsMapping={inventoryStatsMapping}
                                menuIngredientsInUse={menuIngredientsInUse}
                                memoizedProductionMap={memoizedProductionMap}
                                inventorySubTab={inventorySubTab}
                                inventoryReportMode={inventoryReportMode}
                                inventoryPeriod={inventoryPeriod}
                                customStartDate={customStartDate}
                                setCustomStartDate={setCustomStartDate}
                                customEndDate={customEndDate}
                                setCustomEndDate={setCustomEndDate}
                                calType={calType}
                                selectedMonth={selectedMonth}
                                selectedQuarter={selectedQuarter}
                                selectedYear={selectedYear}
                                showImportTrash={showImportTrash}
                                selectedMergeItems={selectedMergeItems}
                                editingIngId={editingIngId}
                                editingIngName={editingIngName}
                                isLoadingMoreImports={isLoadingMoreImports}
                                hasMoreImports={hasMoreImports}
                                setIsLoadingMoreImports={setIsLoadingMoreImports}
                                userRole={userRole}
                                cfStatus={cfStatus}
                                settings={settings}
                                setInventorySubTab={setInventorySubTab}
                                setInventoryReportMode={setInventoryReportMode}
                                setInventoryPeriod={setInventoryPeriod}
                                setCalType={setCalType}
                                setSelectedMonth={setSelectedMonth}
                                setSelectedQuarter={setSelectedQuarter}
                                setSelectedYear={setSelectedYear}
                                setShowImportTrash={setShowImportTrash}
                                setSelectedMergeItems={setSelectedMergeItems}
                                setEditingIngId={setEditingIngId}
                                setEditingIngName={setEditingIngName}
                                setEditExpense={setEditExpense}
                                setEditImport={setEditImport}
                                setShowProductionModal={setShowProductionModal}
                                setShowAuditModal={setShowAuditModal}
                                setShowMergeModal={setShowMergeModal}
                                setShowAutoPoModal={setShowAutoPoModal}
                                setViewingIngredientStats={setViewingIngredientStats}
                                setEditInventory={setEditInventory}
                                setProductionOutputItem={setProductionOutputItem}
                                setProductionOutputUnit={setProductionOutputUnit}
                                setProductionOutputQty={setProductionOutputQty}
                                setProductionInputs={setProductionInputs}
                                setInventory={setInventory}
                                setExpenses={setExpenses}
                                setImports={setImports}
                                setImportsPage={setImportsPage}
                                setHasMoreImports={setHasMoreImports}
                                formatVND={formatVND}
                                hasPermission={hasPermission}
                                showToast={showToast}
                                fetchData={fetchData}
                                SERVER_URL={SERVER_URL}
                                isInputFocused={isInputFocused}
                                generateCSV={generateCSV}
                                parseCSV={parseCSV}
                            />
                            </div>
                        )}

                        {activeTab === 'staff' && (
                            <div key="staff" className="tab-panel">
                            <StaffTab
                                staff={staff}
                                roles={roles}
                                shifts={shifts}
                                schedules={schedules}
                                cfStatus={cfStatus}
                                lanIP={lanIP}
                                lanHostname={lanHostname}
                                settings={settings}
                                userRole={userRole}
                                hasPermission={hasPermission}
                                handleClockIn={handleClockIn}
                                handleClockOut={handleClockOut}
                                handleSaveStaff={saveStaff}
                                handleDeleteStaff={deleteStaff}
                                handleSaveRole={saveRole}
                                handleDeleteRole={deleteRole}
                                handleSaveDisciplinaryLog={saveDisciplinaryLog}
                                handleDeleteDisciplinaryLog={deleteDisciplinaryLog}
                                disciplinaryLogs={disciplinaryLogs}
                                setDisciplinaryLogs={setDisciplinaryLogs}
                                fetchData={fetchData}
                                setShowStaffReport={setShowStaffReport}
                                setShifts={setShifts}
                            />
                            </div>
                        )}

                        {activeTab === 'customers' && (
                            <CustomersTab
                                promotions={promotions}
                                onOpenCreateVoucher={(customer) => {
                                    if (!hasPermission('MANAGE_PROMOTIONS')) {
                                        alert("Vượt quá quyền, vui lòng liên hệ quản lý");
                                        return;
                                    }
                                    const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
                                    const ts = new Date();
                                    ts.setDate(ts.getDate() + 14); // default 14 days
                                    const expiresAt = ts.toISOString().split('T')[0];

                                    setActiveTab('promotions');
                                    setEditPromo({
                                        id: null,
                                        type: 'PROMO_CODE',
                                        name: `Tặng ${customer.name}`,
                                        code: `TRI${randomCode}`,
                                        discountType: 'PERCENT',
                                        discountValue: 20,
                                        specificPhone: customer.phone,
                                        singleUse: true,
                                        ignoreGlobalDisable: true,
                                        startDate: new Date().toISOString().split('T')[0],
                                        endDate: expiresAt,
                                        applicableItems: ['ALL']
                                    });
                                }}
                            />
                        )}
                        {activeTab === 'reports' && (
                            <div key="reports" className="tab-panel">
                            <ReportsTab
                                report={report}
                                orders={orders}
                                inventory={inventory}
                                inventoryAudits={inventoryAudits}
                                inventoryStats={inventoryStats}
                                historicalStockLevels={historicalStockLevels}
                                expenses={expenses}
                                staff={staff}
                                shifts={shifts}
                                menu={menu}
                                settings={settings}
                                hasPermission={hasPermission}
                                updateFixedCosts={updateFixedCosts}
                                SERVER_URL={SERVER_URL}
                                showToast={showToast}
                                setSelectedLog={setSelectedLog}
                                calculationMode={calculationMode}
                                setCalculationMode={setCalculationMode}
                            />
                            </div>
                        )}
                        {activeTab === 'settings' && (
                            <div key="settings" className="tab-panel">
                            <SettingsTab
                                inventory={inventory}
                                settings={settings} setSettings={setSettings} menu={menu}
                                userRole={userRole} showToast={showToast}
                                fetchSettings={fetchSettings} fetchQrToken={fetchQrToken}
                                qrToken={qrToken} setQrToken={setQrToken}
                                passwordData={passwordData} setPasswordData={setPasswordData}
                                passwordMessage={passwordMessage} handleChangePassword={handleChangePassword}
                                lanIP={lanIP} cfStatus={cfStatus}
                                showCfGuide={showCfGuide} setShowCfGuide={setShowCfGuide}
                                printers={printers}
                                latestVersion={latestVersion} systemVersion={systemVersion}
                                latestDescription={latestDescription} latestAssets={latestAssets}
                                isUpdating={isUpdating} handleSystemUpdate={handleSystemUpdate}
                                isDesktopDownloading={isDesktopDownloading} desktopUpdateProgress={desktopUpdateProgress}
                                backups={backups} fetchBackups={fetchBackups}
                                handleCreateBackup={handleCreateBackup} handleRestoreBackup={handleRestoreBackup}
                                isBackingUp={isBackingUp} isRestoring={isRestoring}
                                setShowFactoryResetModal={setShowFactoryResetModal}
                            />
                            </div>
                        )}
                    </>
                </main >

                {/* Cancel Order Modal */}
                <AnimatePresence>
                    <CancelOrderModal
                    cancelOrderId={cancelOrderId}
                    cancelOrder={cancelOrder}
                    setCancelOrderId={setCancelOrderId}
                    />
                </AnimatePresence>

                {/* Order Details Modal (for Reports) */}
                <AnimatePresence>
                    <OrderDetailModal
                    selectedLog={selectedLog}
                    setSelectedLog={setSelectedLog}
                    settings={settings}
                    showToast={showToast}
                    calculationMode={calculationMode}
                    calculateSimulatedTax={calculateSimulatedTax}
                    handlePayDebt={handlePayDebt}
                    />
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

                {/* Quick Payment Confirmation Modal — dùng chung giao diện với STT Đơn + Enter */}
                <AnimatePresence>
                    {confirmZeroOrder && (
                        <QuickPaymentModal
                            order={confirmZeroOrder}
                            onClose={() => setConfirmZeroOrder(null)}
                            onConfirmPayment={async (id) => { await confirmPayment(id); }}
                            onCompleteOrder={async (id) => { await completeOrder(id); }}
                            formatVND={formatVND}
                            settings={settings}
                            generateReceiptHTML={generateReceiptHTML}
                            SERVER_URL={SERVER_URL}
                            showToast={showToast}
                        />
                    )}
                </AnimatePresence>

                {/* Toast System */}
                < div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[1000] flex flex-col gap-3" >
                    <AnimatePresence>
                        {toasts.map(t => (
                            <motion.div key={t.id} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                                className={`px-6 py-3 font-black text-sm shadow-2xl flex items-center gap-3 border ${t.type === 'error' ? 'bg-red-500 text-white border-red-600' : 'bg-gray-900 text-white border-black'}`} style={{ borderRadius: 'var(--radius-btn)' }}>
                                {t.type === 'error' ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} className="text-green-400" />}
                                {t.message}
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div >
                <FloatingButtons
                    showOrderPanel={showOrderPanel} expandedItemId={expandedItemId}
                    activeTab={activeTab} showAuditModal={showAuditModal}
                    setShowOrderPanel={setShowOrderPanel} settings={settings}
                    setSettings={setSettings} qrToken={qrToken}
                />
                
                {/* Auto PO Modal */}
                {showAutoPoModal && (
                    <AutoPoModal 
                        SERVER_URL={SERVER_URL} 
                        showToast={showToast} 
                        formatVND={formatVND}
                        memoizedProductionMap={memoizedProductionMap}
                        onRefreshImports={fetchData} 
                        onClose={() => setShowAutoPoModal(false)} 
                    />
                )}

                {/* Bán Thành Phẩm Production Modal */}
                <ProductionModal
                showProductionModal={showProductionModal}
                setShowProductionModal={setShowProductionModal}
                inventory={inventory}
                productionInputs={productionInputs} setProductionInputs={setProductionInputs}
                productionOutputItem={productionOutputItem} setProductionOutputItem={setProductionOutputItem}
                productionOutputQty={productionOutputQty} setProductionOutputQty={setProductionOutputQty}
                productionOutputUnit={productionOutputUnit} setProductionOutputUnit={setProductionOutputUnit}
                showToast={showToast}
                inventoryStats={inventoryStats}
                fetchData={fetchData}
                />

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
                        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white max-w-sm w-full shadow-2xl overflow-hidden shadow-red-500/20" style={{ borderRadius: 'var(--radius-modal)' }}>
                            <div className="text-center bg-red-50/30" style={{ padding: '24px' }}>
                                <div className="w-16 h-16 bg-red-50 flex items-center justify-center mx-auto mb-4 text-red-500" style={{ borderRadius: "50%" }}>
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
                                    className="w-full text-center p-4 bg-slate-50 border border-slate-200 outline-none focus:border-red-500 focus:bg-white font-black text-xl tracking-[5px] uppercase placeholder:font-normal placeholder:text-gray-300 placeholder:tracking-normal transition-colors" style={{ borderRadius: 'var(--radius-btn)' }}
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
                                <div className="grid grid-cols-2 gap-3 mt-6 border-t border-slate-100" style={{ paddingTop: '16px' }}>
                                    <button onClick={() => setDeleteInventoryModal(null)} className="p-4 bg-slate-100 text-slate-600 font-bold text-sm hover:bg-slate-200 uppercase tracking-widest active:scale-95 transition-all" style={{ borderRadius: 'var(--radius-btn)' }}>HỦY</button>
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
                                        className="p-4 bg-red-500 text-white font-bold text-sm hover:bg-red-600 uppercase tracking-widest active:scale-95 transition-all shadow-lg shadow-red-500/30" style={{ borderRadius: 'var(--radius-btn)' }}>
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
                        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white max-w-sm w-full shadow-2xl overflow-hidden shadow-red-500/20" style={{ borderRadius: 'var(--radius-modal)' }}>
                            <div className="text-center bg-red-50/30" style={{ padding: '24px' }}>
                                <div className="w-16 h-16 bg-red-50 flex items-center justify-center mx-auto mb-4 text-red-500" style={{ borderRadius: "50%" }}>
                                    <Trash2 size={32} />
                                </div>
                                <h3 className="text-xl font-black text-gray-900 uppercase tracking-widest">{showMenuTrash ? 'Xóa Vĩnh Viễn Menu' : 'Đưa Vào Thùng Rác'}</h3>
                                <p className="text-sm font-bold text-gray-500 mt-2">
                                    {showMenuTrash ? 'Hành động này không thể hoàn tác!' : 'Bạn có thể khôi phục lại món này bất kỳ lúc nào.'}
                                </p>
                            </div>
                            <div className="flex gap-3 border-t border-slate-100" style={{ padding: '24px' }}>
                                <button onClick={() => setDeleteMenuModal(null)} className="flex-1 px-4 py-4 bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 transition-all active:scale-95 text-sm uppercase tracking-widest" style={{ borderRadius: 'var(--radius-btn)' }}>Hủy</button>
                                <button onClick={confirmDeleteMenuItem} className="flex-1 px-4 py-4 bg-red-500 text-white font-bold hover:bg-red-600 transition-all active:scale-95 shadow-lg shadow-red-500/20 text-sm uppercase tracking-widest" style={{ borderRadius: 'var(--radius-btn)' }}>Đồng Ý</button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* View Receipt Modal */}
                <AnimatePresence>
                    {viewReceiptOrder && (
                        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
                            <motion.div initial={{ y: 50, opacity: 0, scale: 0.95 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 50, opacity: 0, scale: 0.95 }}
                                className="relative bg-slate-50 p-6 shadow-2xl max-w-lg w-full z-10 border border-slate-200" style={{ borderRadius: 'var(--radius-modal)' }}>
                                <button onClick={() => setViewReceiptOrder(null)} className="absolute top-4 right-4 p-2 bg-white text-gray-500 hover:bg-gray-50 transition-all z-20 shadow-sm border border-slate-100 active:scale-95" style={{ borderRadius: 'var(--radius-badge)' }}>
                                    <X size={20} />
                                </button>
                                <h3 className="text-xl font-black text-gray-900 mb-4 px-2 tracking-tight">Ủy nhiệm chi - #{viewReceiptOrder.queueNumber}</h3>
                                <div className="bg-white overflow-hidden flex items-center justify-center border border-slate-100 shadow-sm" style={{ padding: '16px',  borderRadius: 'var(--radius-card)' }}>
                                    <img src={`${SERVER_URL}/data/receipts/${viewReceiptOrder.paymentReceipt}`} alt="Receipt" className="max-w-full max-h-[65vh] object-contain" style={{ borderRadius: 'var(--radius-badge)' }} />
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
                                className="bg-white p-8 min-w-[360px] max-w-sm shadow-2xl relative z-10 text-center" style={{ borderRadius: 'var(--radius-modal)' }}>
                                <div className="mx-auto w-16 h-16 bg-purple-100 flex items-center justify-center mb-4 text-purple-600" style={{ borderRadius: "50%" }}>
                                    <BookOpen size={32} />
                                </div>
                                <h3 className="text-xl font-black text-gray-900 mb-2 uppercase tracking-wide">Thanh Toán Nợ</h3>
                                <p className="text-sm text-gray-500 mb-6 px-4">Khách thanh toán nợ bằng tiền mặt hay quét QR trên Kiosk?</p>

                                <div className="space-y-3">
                                    <button
                                        onClick={() => confirmPayDebt(payDebtOrderId, false)}
                                        className="w-full flex items-center justify-center gap-3 bg-green-50 hover:bg-green-100 text-green-700 font-black px-4 py-4 transition-all" style={{ borderRadius: 'var(--radius-btn)' }}
                                    >
                                        <DollarSign size={20} />
                                        TIỀN MẶT (HOÀN TẤT NỢ)
                                    </button>
                                    <button
                                        onClick={() => confirmPayDebt(payDebtOrderId, true)}
                                        className={`w-full flex items-center justify-center gap-3 font-black px-4 py-4 shadow-lg transition-all ${settings.autoPushPaymentQr !== false ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-70'}`} style={{ borderRadius: 'var(--radius-btn)' }}
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
export default AdminDashboard;