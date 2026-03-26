/**
 * ShortcutManager.jsx
 * ─────────────────────────────────────────────────────────────
 * "Ghost Hotkey" module cho hệ thống POS.
 *
 * Cơ chế hoạt động:
 *  1. Lắng nghe keydown TOÀN CỤC trên window.
 *  2. Tích lũy các phím số vào buffer. Nếu không có phím nào
 *     thêm vào trong 1.5s, xóa buffer.
 *  3. Khi buffer khớp với 2 hoặc 3 chữ số, tra cứu trong menu:
 *     - Không phải mã 9x: Đây là món CHÍNH → hiển thị overlay.
 *     - Mã 9x: Đây là TOPPING → cộng dồn vào overlay hiện tại.
 *  4. Phím Enter → Đẩy tất cả vào giỏ hàng thật sự, reset.
 *  5. Phím Escape → Hủy bỏ, clear buffer & overlay.
 *
 * Tính năng chống xung đột:
 *  - Kiểm tra xem focus đang ở input/textarea không trước khi xử lý.
 *  - Dùng e.stopPropagation & e.preventDefault chỉ khi cần thiết.
 * ─────────────────────────────────────────────────────────────
 */

import React, {
    useState,
    useEffect,
    useCallback,
    useRef,
    createContext,
    useContext
} from 'react';

// ─── Context để chia sẻ trạng thái overlay với các component con ───
export const ShortcutContext = createContext(null);

// ─── Hook tiện ích để truy cập context ───────────────────────
export const useShortcut = () => useContext(ShortcutContext);

// ─── Hằng số thời gian ───────────────────────────────────────
const BUFFER_TIMEOUT_MS = 1500; // Xóa buffer sau n giây không gõ
const FLASH_DURATION_MS = 700;  // Overlay tự ẩn sau n giây
const ERROR_FLASH_MS = 500;     // Overlay lỗi ẩn sau n giây

/**
 * isInputFocused — Kiểm tra xem người dùng đang gõ vào input thật không.
 * Nếu đang focus trong input/textarea/select, tắt hotkey để tránh xung đột.
 */
export const isInputFocused = () => {
    const tag = document.activeElement?.tagName?.toLowerCase() || '';
    const isEditable = document.activeElement?.isContentEditable;
    return ['input', 'textarea', 'select'].includes(tag) || isEditable;
};

/**
 * ShortcutProvider — Component bọc chứa toàn bộ logic phím tắt.
 *
 * Props:
 *   menu        – Danh sách menu (mảng items có key shortcutCode)
 *   onAdd       – Callback gọi khi item được confirm: onAdd(item, addons[])
 *   isEnabled   – Bật/tắt toàn bộ tính năng từ bên ngoài
 *   children    – Các component con
 */
export const ShortcutProvider = ({ menu = [], onAdd, isEnabled = true, children }) => {
    // ── State ────────────────────────────────────────────────
    const [buffer, setBuffer] = useState('');          // Chuỗi số đang gõ
    const [mainItem, setMainItem] = useState(null);    // Món chính đang chờ xác nhận
    const [toppings, setToppings] = useState([]);      // Danh sách topping đã chọn
    
    // --- Modifiers State ---
    const [currentSize, setCurrentSize] = useState(null);
    const [currentSugar, setCurrentSugar] = useState(null);
    const [currentIce, setCurrentIce] = useState(null);
    const [currentQuantity, setCurrentQuantity] = useState(1);

    const [overlayState, setOverlayState] = useState('hidden'); // 'hidden' | 'flash' | 'error'
    const [flashKey, setFlashKey] = useState(0);       // Key để re-trigger CSS animation

    // ── Refs (để không capture stale state trong event listener) ──
    const bufferRef = useRef('');
    const mainItemRef = useRef(null);
    const toppingsRef = useRef([]);
    
    const currentSizeRef = useRef(null);
    const currentSugarRef = useRef(null);
    const currentIceRef = useRef(null);
    const currentQuantityRef = useRef(1);

    const bufferTimerRef = useRef(null);
    const flashTimerRef = useRef(null);
    const isEnabledRef = useRef(isEnabled);

    // Đồng bộ ref với props
    useEffect(() => { isEnabledRef.current = isEnabled; }, [isEnabled]);

    // ─── Hàm preload ảnh (tránh lag khi overlay hiện) ────────
    useEffect(() => {
        if (!menu?.length) return;
        menu.forEach(item => {
            if (item.image) {
                const img = new Image();
                img.src = item.image;
            }
        });
    }, [menu]);

    // ─── Hàm helper: Cập nhật buffer (cả state và ref) ───────
    const updateBuffer = useCallback((val) => {
        bufferRef.current = val;
        setBuffer(val);
    }, []);

    // ─── Hàm helper: Cập nhật mainItem ───────────────────────
    const updateMainItem = useCallback((item) => {
        mainItemRef.current = item;
        setMainItem(item);
        
        if (item) {
            const DEFAULT_SUGAR = ['100%', '50%', '0%'];
            const DEFAULT_ICE = ['Bình thường', 'Ít đá', 'Không đá'];
            const sortedSugars = (item.sugarOptions?.length ? item.sugarOptions : DEFAULT_SUGAR).slice().sort((a,b) => DEFAULT_SUGAR.indexOf(a) - DEFAULT_SUGAR.indexOf(b));
            const sortedIces = (item.iceOptions?.length ? item.iceOptions : DEFAULT_ICE).slice().sort((a,b) => DEFAULT_ICE.indexOf(a) - DEFAULT_ICE.indexOf(b));

            // Cập nhật: Ưu tiên defaultSugar/Ice cày cứng từ Admin > tuỳ chọn bảng đầu > Dành phần cũ '100% / Bình thường' cho Cứu cánh
            const defSize = item.sizes?.find(s => s.default) || item.sizes?.[0] || null;
            const defSugar = item.defaultSugar || sortedSugars[0] || '100%';
            const defIce = item.defaultIce || sortedIces[0] || 'Bình thường';
            
            currentSizeRef.current = defSize;
            setCurrentSize(defSize);
            currentSugarRef.current = defSugar;
            setCurrentSugar(defSugar);
            currentIceRef.current = defIce;
            setCurrentIce(defIce);
            currentQuantityRef.current = 1;
            setCurrentQuantity(1);
        } else {
            currentSizeRef.current = null;
            setCurrentSize(null);
            currentSugarRef.current = null;
            setCurrentSugar(null);
            currentIceRef.current = null;
            setCurrentIce(null);
            currentQuantityRef.current = 1;
            setCurrentQuantity(1);
        }
    }, []);

    // ─── Hàm helper: Cập nhật toppings ───────────────────────
    const updateToppings = useCallback((list) => {
        toppingsRef.current = list;
        setToppings(list);
    }, []);

    // ─── Helpers: Cập nhật Modifiers ─────────────────────────
    const updateSize = useCallback((sz) => { currentSizeRef.current = sz; setCurrentSize(sz); }, []);
    const updateSugar = useCallback((sg) => { currentSugarRef.current = sg; setCurrentSugar(sg); }, []);
    const updateIce = useCallback((ic) => { currentIceRef.current = ic; setCurrentIce(ic); }, []);
    const updateQuantity = useCallback((qty) => { currentQuantityRef.current = qty; setCurrentQuantity(qty); }, []);

    // ─── Xóa flash timer cũ để tránh race condition ──────────
    const clearFlashTimer = useCallback(() => {
        if (flashTimerRef.current) {
            clearTimeout(flashTimerRef.current);
            flashTimerRef.current = null;
        }
    }, []);

    // ─── Reset toàn bộ trạng thái shortcut ───────────────────
    const resetAll = useCallback(() => {
        clearFlashTimer();
        if (bufferTimerRef.current) clearTimeout(bufferTimerRef.current);
        updateBuffer('');
        updateMainItem(null);
        updateToppings([]);
        updateQuantity(1);
        setOverlayState('hidden');
    }, [clearFlashTimer, updateBuffer, updateMainItem, updateToppings, updateQuantity]);

    // ─── Kích hoạt Flash Overlay (có animation) ───────────────
    const triggerFlash = useCallback((autoDismiss = true) => {
        clearFlashTimer();
        // Tăng flashKey để force re-render CSS animation mỗi lần topping mới
        setFlashKey(k => k + 1);
        setOverlayState('flash');

        if (autoDismiss) {
            flashTimerRef.current = setTimeout(() => {
                // Chỉ ẩn overlay — KHÔNG xóa mainItem/toppings.
                // Người dùng vẫn có thể tiếp tục gõ topping code.
                setOverlayState('hidden');
                flashTimerRef.current = null;
            }, FLASH_DURATION_MS);
        }
    }, [clearFlashTimer]);

    // ─── Kích hoạt Flash lỗi (mã không tìm thấy) ────────────
    const triggerError = useCallback(() => {
        clearFlashTimer();
        setFlashKey(k => k + 1);
        setOverlayState('error');
        flashTimerRef.current = setTimeout(() => {
            setOverlayState('hidden');
            resetAll();
        }, ERROR_FLASH_MS);
    }, [clearFlashTimer, resetAll]);
    // ─── Kích hoạt Flash lỗi (mã không tìm thấy) ────────────
    // ─── Xử lý Modifiers (Logic cho Size, Đá, Đường) ─────────
    const processModifier = useCallback((code) => {
        if (!mainItemRef.current) return false;

        if (code === '.') {
            // Toggle Size
            const sizes = mainItemRef.current.sizes || [];
            if (sizes.length > 0) {
                const currentIdx = sizes.findIndex(s => s.label === currentSizeRef.current?.label);
                const nextIdx = (currentIdx + 1) % sizes.length;
                updateSize(sizes[nextIdx]);
                triggerFlash(true);
            }
            return true;
        }
        
        if (code.startsWith('-') && code.length >= 2) {
            // Sugar
            const t = code[1]; // Số hạng sau dấu trừ
            const opts = mainItemRef.current.sugarOptions || [];
            let val = null;
            if (t === '0') val = opts.find(o => o.includes('0'));
            else if (t === '5') val = opts.find(o => o.includes('50'));
            else if (t === '1') val = opts.find(o => o.includes('100') || o.includes('Bình thường'));
            
            if (val) {
                updateSugar(val);
                triggerFlash(true);
            } else {
                triggerError(); // Ko support option nầy
            }
            return true;
        }

        if (code.startsWith('/') && code.length >= 2) {
            // Ice
            const t = code[1]; // Số hạng sau dấu /
            const opts = mainItemRef.current.iceOptions || [];
            let val = null;
            if (t === '0') val = opts.find(o => o.toLowerCase().includes('không') || o.includes('0'));
            else if (t === '5') val = opts.find(o => o.toLowerCase().includes('ít') || o.includes('50'));
            else if (t === '1') val = opts.find(o => o.toLowerCase().includes('bình thường') || o.includes('100'));
            
            if (val) {
                updateIce(val);
                triggerFlash(true);
            } else {
                triggerError();
            }
            return true;
        }
        
        if (code.startsWith('*') && code.length >= 2) {
            // Quantity multiplier
            const qtyStr = code.substring(1);
            if (!isNaN(qtyStr)) {
                const qty = parseInt(qtyStr, 10);
                if (qty > 0 && qty <= 99) {
                    updateQuantity(qty);
                    triggerFlash(true);
                } else {
                    triggerError();
                }
            } else {
                triggerError();
            }
            return true;
        }

        return false;
    }, [updateSize, updateSugar, updateIce, updateQuantity, triggerFlash, triggerError]);

    // ─── Xử lý mã hợp lệ (Món chính & Addon) ──────────────────
    const processCode = useCallback((code) => {
        // Ưu tiên check xem có phải Modifier không (Size, Ice, Sugar)
        if (code.startsWith('-') || code.startsWith('/') || code === '.' || code.startsWith('*')) {
            processModifier(code);
            return;
        }
        // STATE 1: Đã có món chính, đang chờ Addon
        if (mainItemRef.current) {
            // Kiểm tra xem mã có khớp với addon nào của món hiện tại không
            const matchedAddon = (mainItemRef.current.addons || []).find(a => a.addonCode === code);
            
            if (matchedAddon) {
                // Update Addon (Toggle mode: click twice to remove)
                const existingIdx = toppingsRef.current.findIndex(a => a.shortcutCode === matchedAddon.addonCode);
                
                if (existingIdx !== -1) {
                    // Xoá Addon nếu gõ phím tắt lần thứ 2 cho addon đó
                    const newToppings = toppingsRef.current.filter((_, idx) => idx !== existingIdx);
                    updateToppings(newToppings);
                } else {
                    // Thêm Addon
                    const newToppings = [...toppingsRef.current, {
                        ...matchedAddon,
                        id: `${matchedAddon.label}-${Date.now()}`,
                        name: matchedAddon.label, // Tương thích với overlay
                        shortcutCode: matchedAddon.addonCode,
                        image: null
                    }];
                    updateToppings(newToppings);
                }
                triggerFlash(true);
                return;
            }

            // Nếu không khớp Addon của món này, thử xem có phải là 1 MÓN CHÍNH MỚI không (Failsafe)
            const matchedNewMain = menu.find(item => item.shortcutCode === code);
            if (matchedNewMain) {
                // Người dùng đổi ý lúc đang sửa món -> discard món cũ, lấy món mới
                updateMainItem(matchedNewMain);
                updateToppings([]);
                triggerFlash(true);
                return;
            }

            // Không khớp addon nào, cũng không phải món mới -> báo lỗi
            triggerError();
            return;
        }

        // STATE 0: Đang chờ món chính
        const matchedMain = menu.find(item => item.shortcutCode === code);
        if (matchedMain) {
            updateMainItem(matchedMain);
            updateToppings([]); // Khởi tạo mảng addons (toppings) rỗng cho món mới
            triggerFlash(true);
        } else {
            triggerError();
        }
    }, [menu, updateMainItem, updateToppings, triggerFlash, triggerError]);

    // ─── MAIN Keydown Handler ─────────────────────────────────
    const handleKeyDown = useCallback((e) => {
        // Không xử lý nếu tính năng bị tắt hoặc đang gõ input thật
        if (!isEnabledRef.current || isInputFocused()) return;

        const key = e.key;

        // ── Phím Enter: Xác nhận và đẩy vào giỏ hàng ────────
        if (key === 'Enter' || key === 'NumpadEnter') {
            if (mainItemRef.current) {
                e.preventDefault();
                e.stopPropagation();
                if (typeof onAdd === 'function') {
                    onAdd(mainItemRef.current, toppingsRef.current, currentSizeRef.current, currentSugarRef.current, currentIceRef.current, currentQuantityRef.current);
                }
            }
            resetAll();
            return;
        }

        // ── Phím Escape: Hủy ─────────────────────────────────
        if (key === 'Escape' || key === 'Backspace') {
            if (mainItemRef.current || bufferRef.current) {
                e.preventDefault();
                resetAll();
            }
            return;
        }

        const isValidOperator = key === '-' || key === 'NumpadSubtract' 
                             || key === '/' || key === 'NumpadDivide'
                             || key === '.' || key === 'NumpadDecimal' || key === ','
                             || key === '*' || key === 'NumpadMultiply';
                             
        const isDigit = key >= '0' && key <= '9';
        
        let mappedKey = key;
        if (key === 'NumpadSubtract') mappedKey = '-';
        if (key === 'NumpadDivide') mappedKey = '/';
        if (key === 'NumpadDecimal' || key === ',') mappedKey = '.';
        if (key === 'NumpadMultiply') mappedKey = '*';

        if (!isDigit && !isValidOperator) return;

        e.preventDefault(); // Ngăn hành vi vuốt/scroll iPad

        // ── Nếu xử lý ngay Size (.) ──
        if (mappedKey === '.') {
            if (mainItemRef.current) {
                processModifier('.');
            }
            if (bufferTimerRef.current) clearTimeout(bufferTimerRef.current);
            updateBuffer(''); // Immediately clear buffer to allow rapid toggling
            return;
        }

        let newBuffer = bufferRef.current + mappedKey;
        
        // Validation: Cấm nối '-''/''*' vào rải rác. Nó chỉ được đứng đầu khi đang ở state 1
        if (['-', '/', '*'].includes(mappedKey)) {
            newBuffer = mappedKey; // Reset buffer và lấy toán tử làm Prefix
        }
        updateBuffer(newBuffer);

        if (bufferTimerRef.current) clearTimeout(bufferTimerRef.current);

        let processNow = false;

        if (mainItemRef.current) {
            // Kiểm tra theo Toán tử âm dương `-`, `/`, `*`
            if (['-', '/', '*'].includes(newBuffer[0])) {
                if (newBuffer.length >= 2) {
                    processNow = true;
                }
            } else {
                // STATE 1: Kiểm tra xem buffer có khớp đúng với 1 mã Addon của món này không
                const isExactAddon = (mainItemRef.current.addons || []).some(a => a.addonCode === newBuffer);
                if (isExactAddon) {
                    processNow = true; // Bắt 1 nhịp nếu user trùng số. User muốn số thứ 2 phải type nhanh hơn setTimeOut
                } else if (newBuffer.length >= 2) {
                    processNow = true;
                }
            }
        } else {
            // STATE 0: Mã món chính setup thường là 2 số trở lên
            if (!['-', '/', '*'].includes(newBuffer[0])) { // Ở State 0 cấm Modifier
                if (newBuffer.length >= 2) {
                    processNow = true;
                }
            }
        }

        if (processNow) {
            processCode(newBuffer);
            updateBuffer('');
        } else {
            bufferTimerRef.current = setTimeout(() => {
                const finalBuffer = bufferRef.current;
                if (finalBuffer) {
                    processCode(finalBuffer);
                    updateBuffer('');
                }
            }, BUFFER_TIMEOUT_MS);
        }
    }, [onAdd, resetAll, updateBuffer, processCode]);

    // ─── Gắn/tháo event listener khi component mount/unmount ─
    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown, { capture: true });
        return () => {
            window.removeEventListener('keydown', handleKeyDown, { capture: true });
        };
    }, [handleKeyDown]);

    // ─── Dọn dẹp khi unmount ─────────────────────────────────
    useEffect(() => {
        return () => {
            if (bufferTimerRef.current) clearTimeout(bufferTimerRef.current);
            if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
        };
    }, []);

    // ─── Context value cung cấp cho UI ───────────────────────
    const contextValue = {
        buffer,
        mainItem,
        toppings,
        currentSize,
        currentSugar,
        currentIce,
        currentQuantity,
        overlayState,   // 'hidden' | 'flash' | 'error'
        flashKey,       // Force re-animate khi key thay đổi
        dismissOverlay: resetAll,
    };

    return (
        <ShortcutContext.Provider value={contextValue}>
            {children}
        </ShortcutContext.Provider>
    );
};
