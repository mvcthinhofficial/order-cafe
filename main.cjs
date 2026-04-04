const { app, BrowserWindow, ipcMain, dialog, utilityProcess } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// CRITICAL FIX FOR MACOS 2S LAG:
// macOS Electron tries to discover Proxy Settings (WPAD) for 127.0.0.1 requests from file://,
// which causes an exact 2000ms delay before falling back to direct connection.
app.commandLine.appendSwitch('proxy-bypass-list', '127.0.0.1,localhost,::1');
app.commandLine.appendSwitch('no-proxy-server');

// Configure logging
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

let mainWindow;
let kioskWindow;
let serverProcess;

const CONFIG_FILE = path.join(app.getPath('userData'), 'app-config.json');

function getStoredDataPath() {
    // Dev mode: LUÔN dùng thư mục data/ trong project, KHÔNG đọc config file
    // Lý do: packaged app ghi path vào app-config.json → nếu dev mode đọc config
    // sẽ bị redirect sang userData database (rỗng/khác) → 500 errors
    if (!app.isPackaged) {
        const devDataPath = path.join(__dirname, 'data');
        if (!fs.existsSync(devDataPath)) fs.mkdirSync(devDataPath, { recursive: true });
        return devDataPath;
    }

    // 1. Production: Đọc từ config file (nguồn duy nhất đáng tin cậy xuyên suốt các lần update)
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
            if (config.dataPath && fs.existsSync(config.dataPath)) {
                return config.dataPath;
            }
            console.log(`[MAIN] app-config.json tồn tại nhưng path không còn valid: ${config.dataPath}`);
        }
    } catch (e) {
        console.error("[MAIN] Error reading config file:", e);
    }

    // 2. Fallback: userData là nơi an toàn (không bị xóa khi cài app mới)
    const resolvedPath = path.join(app.getPath('userData'), 'data');

    // 3. Persist path để lần update sau dùng cùng path
    try {
        const configDir = path.dirname(CONFIG_FILE);
        if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(CONFIG_FILE, JSON.stringify({ dataPath: resolvedPath }, null, 2));
        console.log(`[MAIN] Đã lưu data path vào app-config.json: ${resolvedPath}`);
    } catch (e) {
        console.warn('[MAIN] Không thể lưu app-config.json:', e.message);
    }

    return resolvedPath;
}


function startBackend() {
    const dataPath = getStoredDataPath();
    console.log(`[MAIN] Using DATA_PATH: ${dataPath}`);

    if (!fs.existsSync(dataPath)) {
        fs.mkdirSync(dataPath, { recursive: true });
    }

    const isDev = !app.isPackaged;
    const serverScript = path.join(__dirname, 'server.cjs');
    const env = { ...process.env, DATA_PATH: dataPath };

    if (isDev) {
        // Dev mode: spawn với system node, hỗ trợ hot reload
        serverProcess = spawn('node', [serverScript], {
            stdio: ['ignore', 'pipe', 'pipe'],
            env
        });
        serverProcess.stdout?.on('data', (d) => process.stdout.write(`[SERVER] ${d}`));
        serverProcess.stderr?.on('data', (d) => process.stderr.write(`[SERVER ERR] ${d}`));
        serverProcess.on('error', (err) => console.error('[MAIN] Server process error:', err.message));
        serverProcess.on('exit', (code, signal) => console.log(`[MAIN] Server exited. Code: ${code}, Signal: ${signal}`));
    } else {
        // Production: utilityProcess.fork() — Electron official API (v20+)
        // Ưu điểm vượt trội so với các phương pháp khác:
        //   • Chạy trong process riêng (không block Electron UI event loop)
        //   • Có đầy đủ Electron Node.js support + đọc .asar đúng cách
        //   • Native modules (better-sqlite3) load từ .asar.unpacked ổn định
        //   • Không cần ELECTRON_RUN_AS_NODE=1 hack
        //   • Không gây lag khi SQLite query chạy (synchronous nhưng process riêng)
        serverProcess = utilityProcess.fork(serverScript, [], { env });

        // CRITICAL BUG FIX (macOS Lag): Must drain stdout/stderr when stdio is 'pipe' (default).
        // If we write to process.stdout.write on macOS DMG, it uses os_log synchronously and freezes the Main UI Thread!
        // So we must drain it silently to nothing.
        serverProcess.stdout?.on('data', () => {});
        serverProcess.stderr?.on('data', () => {});

        serverProcess.on('exit', (code) => {
            console.log(`[MAIN] Server utility process exited. Code: ${code}`);
            if (code !== 0 && code !== null && mainWindow) {
                dialog.showErrorBox(
                    'Máy chủ nội bộ đã dừng',
                    `Server đã thoát bất ngờ (code: ${code}).
Khởi động lại ứng dụng để tiếp tục.`
                );
            }
        });
    }
}


// IPC Handlers for Data Path Selection
ipcMain.handle('select-data-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory', 'createDirectory'],
        title: 'Chọn thư mục lưu trữ dữ liệu (Database)',
        buttonLabel: 'Chọn thư mục này'
    });

    if (!result.canceled && result.filePaths.length > 0) {
        const newPath = result.filePaths[0];
        // Save to config
        const config = { dataPath: newPath };
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 4));
        console.log(`[MAIN] New data path saved: ${newPath}`);
        return { success: true, path: newPath };
    }
    return { success: false };
});

ipcMain.handle('get-current-data-path', () => {
    return getStoredDataPath();
});

// IPC Handler for listing printers
ipcMain.handle('get-printers', async (event) => {
    try {
        const printers = await event.sender.getPrintersAsync();
        return { success: true, printers };
    } catch (err) {
        console.error("[MAIN] Error getting printers:", err);
        return { success: false, error: err.message };
    }
});

// IPC Handler for Receipt Printing
let printWindow = null;
ipcMain.handle('print-html', async (event, html, printerName, paperSize) => {
    return new Promise((resolve) => {
        // Tạo/dùng lại print window, nhưng đảm bảo không show
        if (!printWindow || printWindow.isDestroyed()) {
            printWindow = new BrowserWindow({
                show: false,
                width: 800,
                height: 600,
                webPreferences: {
                    nodeIntegration: true,
                    contextIsolation: false
                }
            });
            printWindow.on('closed', () => { printWindow = null; });
        }

        const fullHtml = `
            <!DOCTYPE html>
            <html>
                <head>
                    <meta charset="utf-8">
                    <style>
                        @page { margin: 0; size: auto; }
                        * { box-sizing: border-box; }
                        body { margin: 0; padding: 0; background: white; }
                    </style>
                </head>
                <body>
                    ${html}
                </body>
            </html>
        `;

        printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fullHtml)}`);

        printWindow.webContents.once('did-finish-load', () => {
            // Xác định kích thước giấy dựa trên paperSize (K58 = 58mm, K80/default = 80mm)
            // Chromium dùng đơn vị micron (1mm = 1000 micron)
            const isK58 = paperSize === 'K58';
            const paperWidthMicron = isK58 ? 58000 : 80000;  // 58mm hoặc 80mm
            const paperHeightMicron = 2000000;                // Chiều cao lớn (cuộn giấy vô tận)
            const printOptions = {
                silent: true,
                printBackground: true,
                margins: { marginType: 'none' },
                pageSize: {
                    width: paperWidthMicron,
                    height: paperHeightMicron
                }
            };

            if (printerName) {
                printOptions.deviceName = printerName;
            }

            printWindow.webContents.print(printOptions, (success, errorType) => {
                if (!success) {
                    console.error("[MAIN] Print failed:", errorType);
                } else {
                    console.log(`[MAIN] Print success using printer: ${printerName || 'default'}, paper: ${paperSize || 'K80'}`);
                }
                resolve({ success, error: errorType });
            });
        });
    });
});

function createMainWindow() {
    const isDev = !app.isPackaged;
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        title: 'Order Cafe - NHÂN VIÊN (Admin POS)',
        icon: path.join(__dirname, 'public', 'logo.png')
    });

    const url = isDev 
        ? 'http://localhost:5173/#/admin' 
        : `file://${path.join(__dirname, 'dist/index.html')}#/admin`;

    mainWindow.loadURL(url);

    // Prevent navigation to external sites
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        console.log(`[MAIN] Request to open URL: ${url}`);
        // If it's the kiosk URL, handle internally
        if (url.includes('#/kiosk')) {
            createKioskWindow();
            return { action: 'deny' };
        }
        return { action: 'allow' };
    });


    mainWindow.on('closed', () => {
        console.log('[MAIN] Main window closed');
        mainWindow = null;
        if (kioskWindow) kioskWindow.close();
    });
}

function toggleKioskWindow() {
    console.log('[MAIN] Toggling Kiosk window. Current status: ' + (kioskWindow ? 'OPEN' : 'CLOSED'));
    if (kioskWindow) {
        console.log('[MAIN] Closing existing Kiosk window.');
        kioskWindow.close();
        kioskWindow = null;
        return;
    }

    console.log('[MAIN] Creating new Kiosk window.');
    const isDev = !app.isPackaged;
    kioskWindow = new BrowserWindow({
        width: 1024,
        height: 768,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        title: 'Order Cafe - KHÁCH HÀNG (Kiosk)',
        icon: path.join(__dirname, 'public', 'logo.png')
    });

    const kioskUrl = isDev 
        ? 'http://localhost:5173/#/kiosk' 
        : `file://${path.join(__dirname, 'dist/index.html')}#/kiosk`;

    kioskWindow.loadURL(kioskUrl);
    kioskWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

    kioskWindow.on('closed', () => {
        console.log('[MAIN] Kiosk window closed trigger.');
        kioskWindow = null;
    });
}

function createKioskWindow() {
    console.log('[MAIN] createKioskWindow() called.');
    if (kioskWindow) {
        console.log('[MAIN] Kiosk window already exists, focusing.');
        kioskWindow.focus();
        return;
    }
    toggleKioskWindow();
}

// IPC signal to toggle kiosk
ipcMain.on('toggle-kiosk', () => {
    console.log('[IPC] Received toggle-kiosk signal');
    toggleKioskWindow();
});

ipcMain.on('open-kiosk', () => {
    console.log('[IPC] Received open-kiosk signal');
    createKioskWindow();
});

ipcMain.on('close-kiosk', () => {
    console.log('[IPC] Received close-kiosk signal');
    if (kioskWindow) {
        kioskWindow.close();
        kioskWindow = null;
    }
});

app.on('ready', () => {
    startBackend();
    
    // utilityProcess.fork() là async như spawn → cần đủ thời gian server khởi động
    const startupDelay = app.isPackaged ? 2000 : 2000;
    setTimeout(() => {
        createMainWindow();
        if (app.isPackaged) {
            if (process.platform === 'linux') {
                // Linux AppImage: hỗ trợ auto-update nhưng phải chạy đúng từ file AppImage
                // Nếu không phải AppImage (snap/deb/rpm run truyền thống) thì bỏ qua
                const isRunningFromAppImage = !!process.env.APPIMAGE;
                if (isRunningFromAppImage) {
                    autoUpdater.autoDownload = true;
                    autoUpdater.checkForUpdatesAndNotify().catch(err => {
                        console.error('[UPDATE] Linux auto-update check failed:', err.message);
                    });
                } else {
                    console.log('[UPDATE] Linux: không chạy từ AppImage — bỏ qua auto-update.');
                }
            } else {
                autoUpdater.autoDownload = false; // Mac/Win: chỉ kiểm tra, không tự download
                autoUpdater.checkForUpdates().catch(err => {
                    console.error('[UPDATE] Update check failed:', err.message);
                });
            }
        }
    }, startupDelay);
});

// AutoUpdater events
autoUpdater.on('update-available', () => {
    console.log('[UPDATE] Update available.');
    if (mainWindow) {
        mainWindow.webContents.send('update-available');
    }
});

autoUpdater.on('download-progress', (progressObj) => {
    let log_message = "Download speed: " + progressObj.bytesPerSecond;
    log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
    log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
    console.log('[UPDATE] ' + log_message);
    
    if (mainWindow) {
        mainWindow.webContents.send('update-progress', progressObj);
    }
});

autoUpdater.on('update-downloaded', () => {
    console.log('[UPDATE] Update downloaded; will install on quit.');
    if (mainWindow) {
        mainWindow.webContents.send('update-downloaded');
    }
    dialog.showMessageBox({
        type: 'info',
        title: 'Cập nhật sẵn sàng',
        message: 'Bản cập nhật mới đã được tải về. Bạn có muốn khởi động lại app để cài đặt ngay không?',
        buttons: ['Cập nhật ngay', 'Để sau']
    }).then((result) => {
        if (result.response === 0) autoUpdater.quitAndInstall();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createMainWindow();
    }
});

app.on('will-quit', () => {
    // Dev mode: kill spawned server process
    if (serverProcess) {
        serverProcess.kill();
    }
    // Production mode: Express server dừng tự động khi main process thoát
});