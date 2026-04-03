import React, { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    LayoutGrid, List, Plus, ClipboardList, FileUp, 
    ArrowUp, ArrowDown, BookOpen, Copy, Pencil, Trash2 
} from 'lucide-react';
import '../AdminDashboard.css';

const MenuTab = ({
    // State & Variables
    menu,
    showMenuTrash,
    viewMode,
    settings,
    categories,
    expandedItemId,
    draggingId,
    userRole,
    inventory,
    inventoryStats,
    stats30Days,
    totalFixed,
    fixedCosts,
    
    // Parent Setters & Helpers
    setMenu,
    setSettings,
    setExpandedItemId,
    setDraggingId,
    fetchData,
    showToast,
    getImageUrl,
    formatVND,
    SERVER_URL,

    // Props still required from parent
    setShowMenuTrash,
    hasPermission,
    setViewMode,
    setRecipeGuideSearch,
    setShowRecipeGuide,
    setShowCategoryManager,
    saveMenuItem,
    restoreMenuItem,
    deleteMenuItem,
    
    // Refs
    inlineDraftRef,
    
    // Components
    InlineEditPanel
}) => {
    // === Local Refs for Menu Reordering ===
    const reorderTimerRef = useRef(null);
    const lastSwapRef = useRef(0);
    const hasDraggedRef = useRef(false);

    // === Helper Functions ===
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

    const generateHotkey = (categoryName, currentItemsInDb, customOrder = null) => {
        const prefix = getCategoryPrefix(categoryName, customOrder);
        const existingCodes = currentItemsInDb
            .map(i => i.shortcutCode)
            .filter(code => code && typeof code === 'string' && code.startsWith(prefix));

        if (existingCodes.length === 0) return `${prefix}1`;
        const maxCode = Math.max(...existingCodes.map(code => parseInt(code, 10)));
        return (maxCode + 1).toString();
    };

    // === Migrated Logic Functions ===
    const toggleExpand = (id) => setExpandedItemId(prev => prev === id ? null : id);

    const handleReorderMenu = (newItemsForCategory, category) => {
        if (reorderTimerRef.current) {
            clearTimeout(reorderTimerRef.current);
        }
        reorderTimerRef.current = setTimeout(async () => {
            try {
                setMenu(currentMenu => {
                    let catIdxTracker = 1;
                    const prefix = getCategoryPrefix(category);

                    const fullNewMenu = currentMenu.map(item => {
                        if (item.category === category && !item.isDeleted) {
                            return { ...item, shortcutCode: `${prefix}${catIdxTracker++}` };
                        }
                        return item;
                    });

                    fetch(`${SERVER_URL}/api/menu/reorder`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(fullNewMenu)
                    }).catch(console.error);

                    return fullNewMenu;
                });
            } catch (err) {
                console.error("Lỗi khi lưu thứ tự:", err);
            }
        }, 800);
    };

    const handle2DReorder = (draggedItem, info, categoryItems, category) => {
        hasDraggedRef.current = true;
        const now = Date.now();
        if (now - lastSwapRef.current < 300) return;

        const x = info.point.x;
        const y = info.point.y;

        const nodes = Array.from(document.querySelectorAll('[data-reorder-id]'));
        let targetId = null;

        for (const node of nodes) {
            const rect = node.getBoundingClientRect();
            const marginX = rect.width * 0.2;
            const marginY = rect.height * 0.2;

            if (x >= rect.left + marginX && x <= rect.right - marginX &&
                y >= rect.top + marginY && y <= rect.bottom - marginY) {
                targetId = node.getAttribute('data-reorder-id');
                break;
            }
        }

        if (!targetId || targetId === draggedItem.id) return;

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
            const temp = newMenu[currentIdx];
            newMenu[currentIdx] = newMenu[targetGlobalIdx];
            newMenu[targetGlobalIdx] = temp;

            return newMenu;
        });
        handleReorderMenu([], category);
    };

    const moveCategory = async (catIndex, direction) => {
        const sortedCats = categories;
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

    const duplicateMenuItem = async (item) => {
        try {
            const newItem = {
                ...item,
                id: Date.now().toString(),
                name: `${item.name} (Bản sao)`,
                shortcutCode: generateHotkey(item.category || settings?.menuCategories?.[0] || 'TRUYỀN THỐNG', menu)
            };
            delete newItem.shortcut;

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
                    showToast('Nhập dữ liệu thành công!');
                    fetchData();
                } else {
                    showToast('Lỗi khi nhập dữ liệu!', 'error');
                }
            } catch (err) {
                showToast('Lỗi khi đọc file!', 'error');
            }
        };
        reader.readAsText(file);
    };

    const handleAddNew = () => {
        const defaultCategory = settings?.menuCategories?.[0] || 'TRUYỀN THỐNG';
        const newShortcutCode = generateHotkey(defaultCategory, menu);

        // Chỉ thêm vào local state — KHÔNG gọi API
        // Item sẽ được lưu vào DB khi user bấm "Lưu" trong InlineEditPanel
        const tempId = `new-${Date.now().toString()}`;
        const newItem = {
            id: tempId,
            name: 'Món mới',
            price: '25',
            category: defaultCategory,
            image: '',
            description: '',
            volume: '200ml',
            rating: '5.0',
            sizes: [{ label: 'S', volume: '200ml', priceAdjust: 0 }],
            addons: [],
            shortcutCode: newShortcutCode,
            _isUnsaved: true, // flag: chỉ tồn tại trong local state
        };

        setMenu(prev => [...prev, newItem]);
        setExpandedItemId(tempId);
        showToast(`Món mới tạo tạm — chỉnh sửa rồi bấm LƯU để hoàn tất!`);
    };

    return (
        <motion.section key="menu" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} className="space-y-3" style={{ marginTop: '20px' }}>
            {/* Toolbar */}
            <div className="flex flex-col xl:flex-row justify-between xl:items-start gap-3">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-base sm:text-xl font-black text-gray-900">Thực đơn</h3>
                        <div className="flex bg-gray-100 p-0.5 sm:p-1" style={{ borderRadius: 'var(--radius-btn)' }}>
                            <button
                                onClick={() => setShowMenuTrash(false)}
                                className={`px-2 sm:px-3 py-0.5 sm:py-1 text-xs font-bold transition-all ${!showMenuTrash ? 'bg-white shadow text-brand-600' : 'text-gray-500 hover:text-gray-700'}`}
                                style={{ borderRadius: 'var(--radius-badge)' }}
                            >
                                ĐANG BÁN
                            </button>
                            {hasPermission('menu', 'view') && (
                                <button
                                    onClick={() => setShowMenuTrash(!showMenuTrash)}
                                    className={`px-2 sm:px-3 py-0.5 sm:py-1 text-xs font-bold transition-all ${showMenuTrash ? 'bg-white shadow text-red-500' : 'text-gray-500 hover:text-red-400'}`}
                                    style={{ borderRadius: 'var(--radius-badge)' }}
                                >
                                    {showMenuTrash ? 'DS CHÍNH' : 'THÙNG RÁC'}
                                </button>
                            )}
                        </div>
                    </div>
                    <p className="text-xs text-gray-400 font-bold mt-0.5">
                        {menu.length} món | {showMenuTrash ? 'Thùng rác' : 'Menu chính'}
                    </p>
                </div>
                <div className="flex flex-wrap flex-1 items-center gap-1.5 sm:gap-2">
                    {/* View toggle */}
                    <div className="flex bg-gray-100 p-0.5 sm:p-1 gap-0.5 sm:gap-1" style={{ borderRadius: 'var(--radius-btn)' }}>
                        <button onClick={() => setViewMode('grid')} className={`p-1.5 sm:p-2 transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-brand-600' : 'text-gray-400 hover:text-gray-600'}`} style={{ borderRadius: 'var(--radius-badge)' }}>
                            <LayoutGrid size={14} />
                        </button>
                        <button onClick={() => setViewMode('list')} className={`p-1.5 sm:p-2 transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-brand-600' : 'text-gray-400 hover:text-gray-600'}`} style={{ borderRadius: 'var(--radius-badge)' }}>
                            <List size={14} />
                        </button>
                    </div>
                    {hasPermission('menu', 'edit') && (
                        <button onClick={handleAddNew} className="bg-brand-600 text-white font-black flex items-center gap-1.5 shadow-md hover:bg-[#0066DD] hover:scale-105 transition-all text-xs" style={{ minHeight: '34px', borderRadius: 'var(--radius-badge)', padding: '0 12px' }}>
                            <Plus size={14} /> <span className="hidden md:inline">THÊM MÓN</span><span className="md:hidden">+</span>
                        </button>
                    )}
                    {hasPermission('menu', 'view') && (
                        <>
                            <button onClick={() => { setRecipeGuideSearch(''); setShowRecipeGuide(true); }} className="bg-white text-gray-800 border border-gray-300 font-black flex items-center gap-1.5 hover:bg-gray-50 transition-all text-xs shadow-sm" style={{ minHeight: '34px', borderRadius: 'var(--radius-badge)', padding: '0 10px' }}>
                                <ClipboardList size={14} /> <span className="hidden md:inline">XEM CÔNG THỨC</span><span className="md:hidden">CT</span>
                            </button>
                        </>
                    )}
                    {hasPermission('menu', 'edit') && (
                        <>
                            <button onClick={() => setShowCategoryManager(true)} className="bg-white text-gray-800 border border-gray-300 font-black flex items-center gap-1.5 hover:bg-gray-50 transition-all text-xs shadow-sm" style={{ minHeight: '34px', borderRadius: 'var(--radius-badge)', padding: '0 10px' }}>
                                <List size={14} /> <span className="hidden md:inline">QUẢN LÝ DANH MỤC</span><span className="md:hidden">DM</span>
                            </button>
                            <label className="bg-white text-gray-800 border border-gray-300 font-black flex items-center gap-1.5 hover:bg-gray-50 transition-all text-xs cursor-pointer shadow-sm" style={{ minHeight: '34px', borderRadius: 'var(--radius-badge)', padding: '0 10px' }}>
                                <FileUp size={14} /> <span className="hidden md:inline">NHẬP DỮ LIỆU</span><span className="md:hidden">NHẬP</span>
                                <input type="file" className="hidden" accept=".json" onChange={handleImportJSON} />
                            </label>
                            <div className="flex items-center gap-1.5 border border-gray-300 px-2 bg-white shadow-sm" style={{ minHeight: '32px', borderRadius: 'var(--radius-badge)' }} title="Cảnh báo số lượng món">
                                <span className="text-[10px] md:text-xs font-black text-gray-700 uppercase">CB:</span>
                                <input
                                    type="number"
                                    className="w-10 text-center text-red-600 font-black outline-none bg-transparent text-xs"
                                    value={settings?.warningThreshold !== undefined ? settings.warningThreshold : 2}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === '') { setSettings({ ...settings, warningThreshold: '' }); return; }
                                        const newThreshold = parseInt(val, 10);
                                        if (!isNaN(newThreshold)) setSettings({ ...settings, warningThreshold: newThreshold });
                                    }}
                                    onBlur={() => { fetch(`${SERVER_URL}/api/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) }); }}
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
                    <div key={cat} style={{ marginBottom: '32px' }}>
                        {/* Category header — dải màu nền + border-bottom đậm */}
                        <div className="flex items-center gap-3 pr-5 py-2.5 bg-gray-200" style={{ borderRadius: 'var(--radius-btn)', boxShadow: 'inset 6px 0 0 var(--color-brand, #007AFF)', paddingLeft: '28px', marginBottom: '16px' }}>
                            <h4 className="text-sm font-black uppercase tracking-[0.15em] text-gray-500">{cat}</h4>

                            {/* UP/DOWN buttons if userRole === 'ADMIN' */}
                            {hasPermission('menu', 'edit') && !showMenuTrash && (
                                <div className="flex items-center gap-1 ml-2">
                                    <button
                                        onClick={() => moveCategory(catIdx, -1)}
                                        disabled={catIdx === 0}
                                        className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                                        style={{ borderRadius: 'var(--radius-badge)' }}
                                        title="Chuyển lên"
                                    >
                                        <ArrowUp size={16} />
                                    </button>
                                    <button
                                        onClick={() => moveCategory(catIdx, 1)}
                                        disabled={catIdx === categories.length - 1}
                                        className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                                        style={{ borderRadius: 'var(--radius-badge)' }}
                                        title="Chuyển xuống"
                                    >
                                        <ArrowDown size={16} />
                                    </button>
                                </div>
                            )}

                            <div className="flex-1" />
                            <span className="text-[10px] text-gray-700 font-bold bg-white px-2.5 py-1" style={{ borderRadius: 'var(--radius-badge)' }}>{items.length} món</span>
                        </div>

                        <div
                            className={viewMode === 'grid'
                                ? 'grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-2 sm:gap-4 items-start'
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
                                        WebkitTouchCallout: 'none',
                                        borderRadius: 'var(--radius-card)'
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
                                    {/* Item row */}
                                    <div className={`flex items-stretch gap-2 sm:gap-4 p-2 sm:p-4 select-none ${viewMode === 'list' ? 'py-2 sm:py-3' : ''}`}>
                                        <div className={`relative overflow-hidden flex-shrink-0 bg-gray-100 shadow-inner aspect-square ${viewMode === 'list' ? 'w-10 sm:w-14' : 'w-14 sm:w-24'}`} style={{ borderRadius: 'var(--radius-badge)' }}>
                                            {item.image && <img src={getImageUrl(item.image)} className="w-full h-full object-cover" alt="" />}
                                        </div>
                                        <div className="flex-1 min-w-0 flex flex-col justify-start py-0.5 sm:py-1">
                                            <p className="text-[8px] sm:text-[9px] text-gray-400 font-black uppercase tracking-widest mb-0 opacity-50">{item.category}</p>
                                            <h4 className="font-black text-gray-900 tracking-tight leading-snug" style={{ fontSize: 'clamp(0.75rem, 3vw, 1.1rem)' }}>{item.name}</h4>
                                            <p className="font-black text-[#C68E5E]" style={{ fontSize: 'clamp(0.65rem, 2.5vw, 0.875rem)', marginTop: 1 }}>{formatVND(item.price)}</p>

                                            {/* Action icons — Luôn hiện trên thiết bị cảm ứng (iPad), chỉ ẩn/hiện lúc hover đối với máy tính có chuột */}
                                            <div className="flex gap-1 flex-wrap justify-end mt-auto pt-1 sm:pt-3 opacity-100 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                                {/* Conditional Action Buttons based on Trash mode */}
                                                {showMenuTrash ? (
                                                    <>
                                                        {userRole === 'ADMIN' && (
                                                            <>
                                                                <button onClick={(e) => { e.stopPropagation(); restoreMenuItem(item.id); }} className="p-2 xl:p-3 bg-brand-50 text-brand-600 hover:bg-brand-100 border border-transparent transition-all font-bold text-[10px] xl:text-xs" style={{ borderRadius: 'var(--radius-badge)' }} title="Khôi phục món">
                                                                    KHÔI PHỤC
                                                                </button>
                                                                <button onClick={(e) => { e.stopPropagation(); deleteMenuItem(item.id); }} className="p-2 xl:p-3 bg-red-50 text-red-500 hover:bg-red-100 border border-transparent transition-all" style={{ borderRadius: 'var(--radius-badge)' }} title="Xóa vĩnh viễn">
                                                                    <Trash2 size={16} className="xl:w-[18px] xl:h-[18px]" />
                                                                </button>
                                                            </>
                                                        )}
                                                    </>
                                                ) : (
                                                    <>
                                                        <button onClick={(e) => { e.stopPropagation(); handleMoveVertical(item, -1, cat); }} className="p-2 xl:p-3 bg-gray-100 text-gray-500 hover:bg-gray-200 border border-transparent transition-all" style={{ borderRadius: 'var(--radius-badge)' }} title="Chuyển lên">
                                                            <ArrowUp size={16} className="xl:w-[18px] xl:h-[18px]" />
                                                        </button>
                                                        <button onClick={(e) => { e.stopPropagation(); handleMoveVertical(item, 1, cat); }} className="p-2 xl:p-3 bg-gray-100 text-gray-500 hover:bg-gray-200 border border-transparent transition-all" style={{ borderRadius: 'var(--radius-badge)' }} title="Chuyển xuống">
                                                            <ArrowDown size={16} className="xl:w-[18px] xl:h-[18px]" />
                                                        </button>
                                                        <button onClick={(e) => { e.stopPropagation(); setRecipeGuideSearch(item.name); setShowRecipeGuide(true); }} className="p-2 xl:p-3 bg-brand-50 text-brand-600 hover:bg-brand-100 border border-transparent transition-all" style={{ borderRadius: 'var(--radius-badge)' }} title="Xem công thức">
                                                            <BookOpen size={16} className="xl:w-[18px] xl:h-[18px]" />
                                                        </button>
                                                        <button onClick={(e) => { e.stopPropagation(); duplicateMenuItem(item); }} className="p-2 xl:p-3 bg-gray-100 text-gray-500 hover:bg-gray-200 border border-transparent transition-all" style={{ borderRadius: 'var(--radius-badge)' }} title="Nhân bản món">
                                                            <Copy size={16} className="xl:w-[18px] h-[18px]" />
                                                        </button>
                                                        {hasPermission('menu', 'edit') && (
                                                            <>
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); toggleExpand(item.id); }}
                                                                    className={`p-2 xl:p-3 transition-all border ${expandedItemId === item.id ? 'bg-gray-900 text-white border-gray-900' : 'bg-gray-200 text-gray-600 border-transparent hover:bg-gray-300'}`}
                                                                    style={{ borderRadius: 'var(--radius-badge)' }}
                                                                    title="Chỉnh sửa món"
                                                                >
                                                                    <Pencil size={16} className="xl:w-[18px] xl:h-[18px]" />
                                                                </button>
                                                                <button onClick={(e) => { e.stopPropagation(); deleteMenuItem(item.id); }} className="p-2 xl:p-3 bg-red-50 text-red-500 hover:bg-red-100 border border-transparent transition-all" style={{ borderRadius: 'var(--radius-badge)' }} title="Xóa món">
                                                                    <Trash2 size={16} className="xl:w-[18px] xl:h-[18px]" />
                                                                </button>
                                                            </>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Inline editor — now renders as floating portal */}
                                    {expandedItemId === item.id && (
                                        <InlineEditPanel
                                            item={item}
                                            inventory={inventory}
                                            inventoryStats={inventoryStats}
                                            settings={settings}
                                            stats30Days={stats30Days}
                                            totalFixed={totalFixed}
                                            fixedCosts={fixedCosts}
                                            onSave={saveMenuItem}
                                            onCancel={() => {
                                                // Nếu là món chưa lưu (_isUnsaved) → xóa khỏi local state
                                                if (item._isUnsaved) {
                                                    setMenu(prev => prev.filter(m => m.id !== item.id));
                                                }
                                                setExpandedItemId(null);
                                            }}
                                            onDraftChange={(d) => {
                                                inlineDraftRef.current = d;
                                            }}
                                        />
                                    )}
                                </motion.div>
                            ))}
                        </div>
                    </div>
                );
            })}
        </motion.section>
    );
};

export default MenuTab;
