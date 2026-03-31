const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// Configure logging
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

let mainWindow;
let kioskWindow;
let serverProcess;

const CONFIG_FILE = path.join(app.getPath('userData'), 'app-config.json');

function getStoredDataPath() {
    // 1. Đọc từ config file (nguồn duy nhất đáng tin cậy xuyên suốt các lần update)
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
            if (config.dataPath && fs.existsSync(config.dataPath)) {
                return config.dataPath;
            }
            // Config tồn tại nhưng path không còn valid → cần resolve lại bên dưới
            console.log(`[MAIN] app-config.json tồn tại nhưng path không còn valid: ${config.dataPath}`);
        }
    } catch (e) {
        console.error("[MAIN] Error reading config file:", e);
    }

    // 2. Fallback: Resolve path mặc định
    // LƯU Ý: path.join(__dirname, 'data') sẽ THAY ĐỔI mỗi lần cài .dmg mới
    // vì __dirname trỏ vào bên trong .app bundle. KHÔNG nên dùng làm nguồn lưu data dài hạn.
    // {userData} là nơi an toàn duy nhất (không bị xóa khi cài app mới).
    const localData = path.join(__dirname, 'data');
    const resolvedPath = fs.existsSync(localData)
        ? localData
        : path.join(app.getPath('userData'), 'data');

    // 3. QUAN TRỌNG: Luôn persist path đã resolve để lần cập nhật sau đây → cùng path
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

    // Ensure data directory exists
    if (!fs.existsSync(dataPath)) {
        fs.mkdirSync(dataPath, { recursive: true });
    }

    const isDev = !app.isPackaged;
    const nodePath = isDev ? 'node' : process.execPath;
    const serverScript = path.join(__dirname, 'server.cjs');

    const env = { 
        ...process.env, 
        DATA_PATH: dataPath 
    };
    
    if (!isDev) {
        env.ELECTRON_RUN_AS_NODE = '1';
    }

    serverProcess = spawn(nodePath, [serverScript], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: env
    });

    serverProcess.stdout.on('data', (data) => {
        process.stdout.write(`[SERVER] ${data}`);
    });

    serverProcess.stderr.on('data', (data) => {
        process.stderr.write(`[SERVER ERR] ${data}`);
    });
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

    if (isDev) {
        mainWindow.webContents.openDevTools();
    }

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
    
    // Slight delay to ensure backend is starting up or as common practice
    setTimeout(() => {
        createMainWindow();
        if (app.isPackaged) {
            if (process.platform === 'linux') {
                autoUpdater.autoDownload = true;
                autoUpdater.checkForUpdatesAndNotify();
            } else {
                autoUpdater.autoDownload = false; // Disable for Mac/Win
                autoUpdater.checkForUpdates();    // Only check
            }
        }
    }, 1500);
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
    if (serverProcess) {
        serverProcess.kill();
    }
});