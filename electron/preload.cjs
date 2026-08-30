const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('posHardware', {
  isDesktopPOS: true,
  printThermalReceipt: (htmlContent, printerName) => ipcRenderer.invoke('print-thermal-receipt', { htmlContent, printerName }),
  openCashDrawer: () => ipcRenderer.invoke('open-cash-drawer')
});