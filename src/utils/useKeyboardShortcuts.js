import { useRef, useEffect } from 'react';

/**
 * Hook xử lý keyboard shortcuts cho AdminDashboard.
 * onConfirmPayment là một React ref ({ current: fn }) để tránh TDZ và stale closure.
 */
export const useKeyboardShortcuts = ({
    activeTab, showOrderPanel, expandedItemId, cancelOrderId, orders,
    confirmZeroOrder, setConfirmZeroOrder, showToast, onConfirmPayment, isInputFocused, isDoubleTap
}) => {
    const lastZeroPress = useRef(0);

    useEffect(() => {
        const handleGlobalKeyDown = (e) => {
            if (confirmZeroOrder) {
                if (e.key === 'Escape' || (e.key === 'Backspace' && !isInputFocused())) {
                    setConfirmZeroOrder(null);
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    // onConfirmPayment là ref object { current: fn }
                    if (onConfirmPayment?.current) {
                        onConfirmPayment.current(confirmZeroOrder.id);
                    }
                    setConfirmZeroOrder(null);
                }
                return;
            }
            if (activeTab !== 'orders') return;
            if (showOrderPanel || expandedItemId || cancelOrderId) return;
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;

            if (e.key === '0') {
                if (isDoubleTap(lastZeroPress.current, 500)) {
                    lastZeroPress.current = 0;
                    const minQueue = orders.length > 0 ? Math.min(...orders.map(o => o.queueNumber)) : null;
                    let targetOrder = minQueue !== null ? orders.find(o => o.queueNumber === minQueue && !o.isPaid) : null;
                    if (!targetOrder) targetOrder = orders.find(o => !o.isPaid);
                    if (targetOrder) setConfirmZeroOrder(targetOrder);
                    else showToast('Không có đơn hàng chờ thanh toán!', 'error');
                } else {
                    lastZeroPress.current = Date.now();
                }
            }
        };

        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [activeTab, showOrderPanel, expandedItemId, cancelOrderId, orders, confirmZeroOrder]);
};
