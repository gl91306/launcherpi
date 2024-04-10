const { app, BrowserWindow, BrowserView, globalShortcut } = require("electron");
const windowStateKeeper = require("electron-window-state");
const { setupTitlebar, attachTitlebarToWindow } = require("./titlebar/main");
const fs = require("fs");
const path = require("path");
const os = require("os");
require('v8-compile-cache');

// Paths:
const homedir = os.homedir();
var minecraftpath = path.join(homedir, ".minecraft");

// Ensure .minecraft dir exists:
if (!fs.existsSync(minecraftpath)) {
  fs.mkdirSync(minecraftpath, { recursive: true });
};

// setup the titlebar main process:
setupTitlebar();

// Disable reload and F5:
/*app.on('browser-window-focus', function () {
  globalShortcut.register("CommandOrControl+R", () => {
    //console.log("CommandOrControl+R is pressed: Shortcut Disabled");
  });
  globalShortcut.register("F5", () => {
    //console.log("F5 is pressed: Shortcut Disabled");
  });
});*/

/*app.on('browser-window-blur', function () {
  globalShortcut.unregister('CommandOrControl+R');
  globalShortcut.unregister('F5');
});*/

// create main window
function createWindow() {
  const mainWindowState = windowStateKeeper({
    defaultWidth: 800,
    defaultHeight: 600,
    fullScreen: false,
    maximize: true,
  });
  const mainWindow = (global.mainWindow = new BrowserWindow({
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width,
    height: mainWindowState.height,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    show: false,
    icon: path.join(__dirname, '..', 'renderer', 'images', 'icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: true,
      preload: path.join(__dirname, '..', 'renderer', 'preload.js'),
    }
  }));
  mainWindowState.manage(mainWindow);
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'titlebar.html'));
  mainWindow.hide();
  const PageView = (global.PageView = new BrowserView({
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
  }));
  mainWindow.setBrowserView(PageView);
  PageView.webContents.loadFile(path.join(__dirname, '..', 'renderer', 'login.html'));
  PageView.setBounds({
    x: 0,
    y: 30,
    width: mainWindow.getBounds().width,
    height: mainWindow.getBounds().height - 30,
  });
  mainWindow.on("resize", () => {
    PageView.setBounds({
      x: 0,
      y: 30,
      width: mainWindow.getBounds().width,
      height: mainWindow.getBounds().height - 30,
    });
  });
  PageView.webContents.openDevTools();
  //mainWindow.webContents.openDevTools();
  /*const win = new BrowserWindow({
    width: 800,
    height: 600,
    frame: false,
    show: false,
    icon: path.join(__dirname, '..', 'renderer', 'images', 'icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.join(__dirname, '..', 'renderer', 'preload.js')
    }
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'login.html'));
  win.webContents.openDevTools();*/

  require('@electron/remote/main').initialize();
  require('@electron/remote/main').enable(mainWindow.webContents);
  require('@electron/remote/main').enable(PageView.webContents);

  attachTitlebarToWindow(mainWindow);

  PageView.webContents.on('did-finish-load', () => {
    mainWindow.show();
  });
};

app.whenReady().then(() => {
  createWindow();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  };
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  };
});