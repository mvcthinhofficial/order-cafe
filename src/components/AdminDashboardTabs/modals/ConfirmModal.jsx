import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Trash2, Info } from 'lucide-react';

/**
 * ConfirmModal — Thay thế native confirm() với UI phù hợp design system
 * 
 * Props:
 *   isOpen       : boolean
 *   onConfirm    : () => void
 *   onCancel     : () => void
 *   title        : string
 *   message      : string
 *   confirmLabel : string   (default: 'Xác nhận')
 *   cancelLabel  : string   (default: 'Hủy')
 *   variant      : 'danger' | 'warning' | 'info'  (default: 'warning')
 */
const ConfirmModal = ({
    isOpen,
    onConfirm,
    onCancel,
    title = 'Xác nhận',
    message = 'Bạn có chắc muốn thực hiện hành động này?',
    confirmLabel = 'Xác nhận',
    cancelLabel = 'Hủy',
    variant = 'warning',
}) => {
    useEffect(() => {
        if (!isOpen) return;
        const handleEsc = (e) => { if (e.key === 'Escape') onCancel(); };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isOpen, onCancel]);

    const variantConfig = {
        danger: {
            icon: <Trash2 size={22} />,
            iconBg: 'bg-red-50',
            iconColor: 'text-red-500',
            confirmClass: 'bg-red-500 hover:bg-red-600 text-white shadow-red-200',
        },
        warning: {
            icon: <AlertTriangle size={22} />,
            iconBg: 'bg-amber-50',
            iconColor: 'text-amber-500',
            confirmClass: 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-200',
        },
        info: {
            icon: <Info size={22} />,
            iconBg: 'bg-brand-50',
            iconColor: 'text-brand-600',
            confirmClass: 'bg-brand-600 hover:bg-brand-700 text-white shadow-brand-200',
        },
    };

    const cfg = variantConfig[variant] || variantConfig.warning;

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[700] flex items-center justify-center p-6">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={onCancel}
                    />
                    <motion.div
                        initial={{ scale: 0.92, opacity: 0, y: 8 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.92, opacity: 0, y: 8 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                        className="bg-white w-full max-w-sm shadow-2xl relative z-10 font-main overflow-hidden"
                        style={{ borderRadius: 'var(--radius-modal, 20px)' }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Body */}
                        <div className="px-7 pt-7 pb-6 text-center">
                            {/* Icon */}
                            <div className={`w-12 h-12 ${cfg.iconBg} flex items-center justify-center mx-auto mb-4`} style={{ borderRadius: 'var(--radius-btn)' }}>
                                <span className={cfg.iconColor}>{cfg.icon}</span>
                            </div>
                            <h3 className="text-base font-black text-gray-900 mb-2 tracking-tight">{title}</h3>
                            <p className="text-sm text-gray-500 leading-relaxed">{message}</p>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3 px-6 pb-6">
                            <button
                                onClick={onCancel}
                                className="flex-1 py-3 font-black text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all uppercase tracking-widest"
                                style={{ borderRadius: 'var(--radius-btn)' }}
                            >
                                {cancelLabel}
                            </button>
                            <button
                                onClick={onConfirm}
                                className={`flex-1 py-3 font-black text-sm shadow-lg hover:scale-[1.02] active:scale-95 transition-all uppercase tracking-widest ${cfg.confirmClass}`}
                                style={{ borderRadius: 'var(--radius-btn)' }}
                            >
                                {confirmLabel}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default ConfirmModal;
