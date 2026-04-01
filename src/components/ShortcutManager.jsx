
import React, {
    useState,
    useEffect,
    useCallback,
    useRef,
    createContext,
    useContext
} from 'react';
import {
    BUFFER_TIMEOUT_MS,
    FLASH_DURATION_MS,
    ERROR_FLASH_MS,
    isInputActive,
    findMainItem,
    findAddon,
    getNextSize,
    parseSugar,
    parseIce,
    parseQuantity,
    mapNumpadKey
} from '../utils/ShortcutUtils.js';

// ─── Context để chia sẻ trạng thái overlay với các component con ───
export const ShortcutContext = createContext(null);

// ─── Hook tiện ích để truy cập context ───────────────────────
export const useShortcut = () => useContext(ShortcutContext);

/**
 * ShortcutProvider — Component bọc chứa toàn bộ logic phím tắt.
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
    const [escResetKey, setEscResetKey] = useState(0); // Tăng mỗi khi ESC reset shortcut → signal UI

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
        setCurrentQuantity(1);
        currentQuantityRef.current = 1;
        setOverlayState('hidden');
    }, [clearFlashTimer, updateBuffer, updateMainItem, updateToppings]);

    // ─── Kiểm tra shortcut có đang active không (dùng refs → luôn up-to-date, không stale) ───
    const isShortcutActive = useCallback(() => {
        return !!(mainItemRef.current || bufferRef.current);
    }, []);

    // ─── Kích hoạt Flash Overlay (có animation) ───────────────
    const triggerFlash = useCallback((autoDismiss = true) => {
        clearFlashTimer();
        setFlashKey(k => k + 1);
        setOverlayState('flash');

        if (autoDismiss) {
            flashTimerRef.current = setTimeout(() => {
                setOverlayState('hidden');
                flashTimerRef.current = null;
            }, FLASH_DURATION_MS);
        }
    }, [clearFlashTimer]);

    // ─── Kích hoạt Flash lỗi ────────────
    const triggerError = useCallback(() => {
        clearFlashTimer();
        setFlashKey(k => k + 1);
        setOverlayState('error');
        flashTimerRef.current = setTimeout(() => {
            setOverlayState('hidden');
            resetAll();
        }, ERROR_FLASH_MS);
    }, [clearFlashTimer, resetAll]);

    // ─── Xử lý Modifiers (Size, Đá, Đường, Số lượng) ─────────
    const processModifier = useCallback((code) => {
        if (!mainItemRef.current) return false;

        let handled = false;
        if (code === '.') {
            const nextSz = getNextSize(mainItemRef.current, currentSizeRef.current);
            currentSizeRef.current = nextSz;
            setCurrentSize(nextSz);
            handled = true;
        } else if (code.startsWith('-')) {
            const sug = parseSugar(code, mainItemRef.current);
            if (sug) {
                currentSugarRef.current = sug;
                setCurrentSugar(sug);
                handled = true;
            }
        } else if (code.startsWith('/')) {
            const ice = parseIce(code, mainItemRef.current);
            if (ice) {
                currentIceRef.current = ice;
                setCurrentIce(ice);
                handled = true;
            }
        } else if (code.startsWith('*')) {
            const qty = parseQuantity(code);
            if (qty) {
                currentQuantityRef.current = qty;
                setCurrentQuantity(qty);
                handled = true;
            }
        }

        if (handled) {
            triggerFlash(true);
            return true;
        } else {
            triggerError();
            return false;
        }
    }, [triggerFlash, triggerError]);

    // ─── Xử lý mã hợp lệ (Món chính & Addon) ──────────────────
    const processCode = useCallback((code) => {
        if (code.startsWith('-') || code.startsWith('/') || code === '.' || code.startsWith('*')) {
            processModifier(code);
            return;
        }

        if (mainItemRef.current) {
            const matchedAddon = findAddon(code, mainItemRef.current);
            if (matchedAddon) {
                const existingIdx = toppingsRef.current.findIndex(a => a.shortcutCode === matchedAddon.addonCode);
                if (existingIdx !== -1) {
                    updateToppings(toppingsRef.current.filter((_, idx) => idx !== existingIdx));
                } else {
                    updateToppings([...toppingsRef.current, {
                        ...matchedAddon,
                        id: `${matchedAddon.label}-${Date.now()}`,
                        name: matchedAddon.label,
                        shortcutCode: matchedAddon.addonCode,
                        image: null
                    }]);
                }
                triggerFlash(true);
                return;
            }

            const matchedNewMain = findMainItem(code, menu);
            if (matchedNewMain) {
                updateMainItem(matchedNewMain);
                updateToppings([]);
                triggerFlash(true);
                return;
            }
            triggerError();
            return;
        }

        const matchedMain = findMainItem(code, menu);
        if (matchedMain) {
            updateMainItem(matchedMain);
            updateToppings([]);
            triggerFlash(true);
        } else {
            triggerError();
        }
    }, [menu, processModifier, triggerFlash, triggerError, updateMainItem, updateToppings]);

    // ─── MAIN Keydown Handler ─────────────────────────────────
    const handleKeyDown = useCallback((e) => {
        if (!isEnabledRef.current || isInputActive()) return;

        const key = e.key;

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

        if (key === 'Escape' || key === 'Backspace') {
            if (mainItemRef.current || bufferRef.current) {
                e.preventDefault();
                e.stopPropagation(); // Chặn StaffOrderPanel.handlePosKey khỏi đóng order ngay lập tức
                setEscResetKey(k => k + 1); // Signal cho UI hiển thị thông báo
                resetAll();
            }
            return;
        }

        const mappedKey = mapNumpadKey(key);
        const isValidOperator = ['-', '/', '.', '*', ','].includes(mappedKey);
        const isDigit = mappedKey >= '0' && mappedKey <= '9';

        if (!isDigit && !isValidOperator) return;

        e.preventDefault();

        if (mappedKey === '.') {
            if (mainItemRef.current) processModifier('.');
            if (bufferTimerRef.current) clearTimeout(bufferTimerRef.current);
            updateBuffer('');
            return;
        }

        let newBuffer = bufferRef.current + mappedKey;
        if (['-', '/', '*'].includes(mappedKey)) {
            newBuffer = mappedKey;
        }
        updateBuffer(newBuffer);

        if (bufferTimerRef.current) clearTimeout(bufferTimerRef.current);

        let processNow = false;
        if (mainItemRef.current) {
            if (['-', '/', '*'].includes(newBuffer[0])) {
                if (newBuffer.length >= 2) processNow = true;
            } else {
                const isExactAddon = (mainItemRef.current.addons || []).some(a => a.addonCode === newBuffer);
                if (isExactAddon || newBuffer.length >= 2) processNow = true;
            }
        } else {
            if (!['-', '/', '*'].includes(newBuffer[0]) && newBuffer.length >= 2) {
                processNow = true;
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
    }, [onAdd, resetAll, updateBuffer, processCode, processModifier]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown, { capture: true });
        return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
    }, [handleKeyDown]);

    useEffect(() => {
        return () => {
            if (bufferTimerRef.current) clearTimeout(bufferTimerRef.current);
            if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
        };
    }, []);

    const contextValue = {
        buffer,
        mainItem,
        toppings,
        currentSize,
        currentSugar,
        currentIce,
        currentQuantity,
        overlayState,
        flashKey,
        escResetKey,
        isShortcutActive, // Hàm đọc từ ref, luôn trả giá trị hiện tại mà không cần đưa vào deps
        dismissOverlay: resetAll,
    };

    return (
        <ShortcutContext.Provider value={contextValue}>
            {children}
        </ShortcutContext.Provider>
    );
};
