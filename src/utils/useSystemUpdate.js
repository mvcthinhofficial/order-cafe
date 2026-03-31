import { useState, useEffect } from 'react';
import { SERVER_URL } from '../api';
import { isNewerVersion } from './dashboardUtils';

export const useSystemUpdate = (setActiveTab) => {
    const [systemVersion, setSystemVersion] = useState('1.0.0');
    const [latestVersion, setLatestVersion] = useState(null);
    const [latestDescription, setLatestDescription] = useState('');
    const [showReleaseNotes, setShowReleaseNotes] = useState(false);
    const [latestAssets, setLatestAssets] = useState([]);
    const [updateUrl, setUpdateUrl] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);
    const [showUpdateBanner, setShowUpdateBanner] = useState(true);
    const [desktopUpdateProgress, setDesktopUpdateProgress] = useState(null);
    const [isDesktopDownloading, setIsDesktopDownloading] = useState(false);

    useEffect(() => {
        fetch(`${SERVER_URL}/api/system/version`)
            .then(res => res.json())
            .then(data => setSystemVersion(data.version || '1.0.0'))
            .catch(e => console.error("Error fetching local version:", e));

        const githubUser = 'mvcthinhofficial';
        const githubRepo = 'order-cafe';
        fetch(`https://api.github.com/repos/${githubUser}/${githubRepo}/releases/latest`)
            .then(res => res.json())
            .then(data => {
                const ver = data.tag_name ? data.tag_name.replace('v', '') : null;
                if (ver) {
                    setLatestVersion(ver);
                    setLatestDescription(data.body || '');
                    setLatestAssets(data.assets || []);
                    setUpdateUrl(`https://github.com/${githubUser}/${githubRepo}/releases/download/v${ver}/order-cafe-v${ver}.tar.gz`);
                }
            })
            .catch(e => console.warn("Could not fetch latest release from GitHub API."));

        const isDesktop = !!(window.process && window.process.versions && window.process.versions.electron);
        if (isDesktop && window.require) {
            try {
                const { ipcRenderer } = window.require('electron');
                ipcRenderer.on('update-available', () => setIsDesktopDownloading(true));
                ipcRenderer.on('update-progress', (event, progressObj) => {
                    setIsDesktopDownloading(true);
                    setDesktopUpdateProgress(progressObj);
                });
                ipcRenderer.on('update-downloaded', () => {
                    setIsDesktopDownloading(false);
                    setDesktopUpdateProgress(null);
                });
                return () => {
                    ipcRenderer.removeAllListeners('update-available');
                    ipcRenderer.removeAllListeners('update-progress');
                    ipcRenderer.removeAllListeners('update-downloaded');
                };
            } catch (err) {
                console.warn("Could not attach electron update listeners.");
            }
        }
    }, []);

    const handleSystemUpdate = async () => {
        const isMac = window.process?.platform === 'darwin';
        const isWindows = window.process?.platform === 'win32';
        const isElectron = !!(window.process && window.process.versions && window.process.versions.electron);

        if (isElectron && (isMac || isWindows)) {
            setActiveTab('settings');
            setTimeout(() => {
                const element = document.getElementById('setting-system-update');
                if (element) element.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
            return;
        }

        if (!updateUrl) return alert("Không tìm thấy link tải bản cập nhật (Source code).");
        if (!window.confirm(`Bạn có chắc muốn nâng cấp MÁY CHỦ (Linux) từ v${systemVersion} lên v${latestVersion}?\nServer sẽ tự động khởi động sau khi tải và giải nén xong.`)) return;

        setIsUpdating(true);
        try {
            const res = await fetch(`${SERVER_URL}/api/system/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('authToken')}` },
                body: JSON.stringify({ downloadUrl: updateUrl })
            });
            const data = await res.json();
            if (data.success) {
                alert(data.message + "\nHệ thống sẽ tự động tải lại sau ít phút khi máy chủ khởi động xong.");
                setShowUpdateBanner(false);
                setTimeout(() => window.location.reload(), 15000);
            } else {
                alert("Lỗi: " + data.message);
                setIsUpdating(false);
            }
        } catch (e) {
            alert(`Lỗi kết nối: ${e.message}`);
            setIsUpdating(false);
        }
    };

    return {
        systemVersion, latestVersion, latestDescription, showReleaseNotes, setShowReleaseNotes,
        latestAssets, updateUrl, isUpdating, showUpdateBanner, setShowUpdateBanner,
        desktopUpdateProgress, isDesktopDownloading, handleSystemUpdate
    };
};
