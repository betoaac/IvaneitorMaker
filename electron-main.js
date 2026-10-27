const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
    // 1. Configuración de la ventana
    const win = new BrowserWindow({
        width: 1280,
        height: 850,
        title: "PokéCard Maker Pro",
        // icon: path.join(__dirname, 'tu_icono.ico'), // Descomenta si tienes un icono
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true
        }
    });

    // 2. Quitar la barra de menú estándar (Archivo, Editar...)
    win.setMenuBarVisibility(false);

    // 3. Cargar tu HTML
    win.loadFile(path.join(__dirname, 'site', 'index.html'));
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', event => event.preventDefault());
}

// Iniciar la app cuando esté lista
app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

// Cerrar la app cuando todas las ventanas se cierren (Windows/Linux)
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
