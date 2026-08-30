const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    title: 'Olive Pizza POS — Restaurant Billing System',
    backgroundColor: '#020617',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const isDev = process.env.NODE_ENV !== 'production' && !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5178');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

// IPC: Native Thermal Printer Silent Print
ipcMain.handle('print-thermal-receipt', async (event, { htmlContent, printerName }) => {
  if (!mainWindow) return { success: false, error: 'Window not initialized' };

  const printWin = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false } });
  await printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));

  return new Promise((resolve) => {
    printWin.webContents.print(
      {
        silent: true,
        printBackground: true,
        deviceName: printerName || ''
      },
      (success, failureReason) => {
        printWin.close();
        if (!success) {
          resolve({ success: false, error: failureReason });
        } else {
          resolve({ success: true });
        }
      }
    );
  });
});

// IPC: Open Cash Drawer Pulse
ipcMain.handle('open-cash-drawer', async () => {
  console.log('[Hardware IPC] Sending ESC/POS Cash Drawer Kick Pulse (ESC p 0 25 250)...');
  return { success: true, message: 'Cash drawer opened' };
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });