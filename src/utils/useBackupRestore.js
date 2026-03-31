import { useState, useEffect } from 'react';
import { SERVER_URL } from '../api';

export const useBackupRestore = ({ activeTab, userRole, showToast }) => {
    const [backups, setBackups] = useState([]);
    const [isBackingUp, setIsBackingUp] = useState(false);
    const [isRestoring, setIsRestoring] = useState(false);

    const fetchBackups = async () => {
        try {
            const res = await fetch(`${SERVER_URL}/api/admin/backups`);
            if (res.ok) {
                const contentType = res.headers.get("content-type");
                if (contentType && contentType.includes("application/json")) {
                    const data = await res.json();
                    setBackups(data);
                }
            }
        } catch (e) {
            console.error("Lỗi lấy danh sách backup:", e);
        }
    };

    const handleCreateBackup = async () => {
        setIsBackingUp(true);
        try {
            const res = await fetch(`${SERVER_URL}/api/admin/backups`, { method: 'POST' });
            if (res.ok) {
                showToast('Đã sao lưu dữ liệu thành công!', 'success');
                fetchBackups();
            } else {
                let errorMsg = 'Lỗi khi sao lưu dữ liệu!';
                try { const data = await res.json(); if (data.error) errorMsg = data.error; } catch (e) { }
                showToast(errorMsg, 'error');
            }
        } catch (e) {
            showToast('Lỗi kết nối máy chủ!', 'error');
        } finally {
            setIsBackingUp(false);
        }
    };

    const handleRestoreBackup = async (folderName) => {
        if (!window.confirm(`CẢNH BÁO:\n\nBạn đang chuẩn bị khôi phục dữ liệu từ bản lưu: ${folderName}.\nHành động này sẽ GHI ĐÈ TOÀN BỘ dữ liệu hiện tại.\n\nBạn chắc chắn chứ?`)) return;
        setIsRestoring(true);
        try {
            const res = await fetch(`${SERVER_URL}/api/admin/backups/${folderName}/restore`, { method: 'POST' });
            if (res.ok) {
                showToast('Khôi phục thành công! Đang tải lại dữ liệu...', 'success');
                setTimeout(() => window.location.reload(), 2000);
            } else {
                const data = await res.json();
                showToast(data.error || 'Lỗi khi khôi phục dữ liệu!', 'error');
                setIsRestoring(false);
            }
        } catch (e) {
            showToast('Lỗi kết nối máy chủ!', 'error');
            setIsRestoring(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'settings' && userRole === 'ADMIN') {
            fetchBackups();
        }
    }, [activeTab, userRole]);

    return { backups, isBackingUp, isRestoring, fetchBackups, handleCreateBackup, handleRestoreBackup };
};
