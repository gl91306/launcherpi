const { app, BrowserWindow } = require('electron')
const path = require('path')
const { localStorage, sessionStorage } = require('electron-browser-storage');

function createWindow () {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    frame: false,
    icon: __dirname + '/icon.png',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  })

  win.loadFile('login.html')
  win.webContents.openDevTools();

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url === 'https://login.live.com/oauth20_authorize.srf?client_id=000000004C12AE6F&response_type=code&redirect_uri=https://login.live.com/oauth20_desktop.srf&scope=XboxLive.signin%20offline_access&state=NOT_NEEDED') {
      console.log('cringe')
      return {
        action: 'allow',
        width: 800,
        height: 600,
        frame: false,
        icon: __dirname + '/icon.png',
        webPreferences: {
          preload: path.join(__dirname, 'preload.js'),
          nodeIntegration: true,
          contextIsolation: false,
          nodeIntegrationInSubFrames: true,
        }
      }
    } else {
      return { action: 'allow' }
    }
  })

}

function quitapp() {
  console.log("amogus")
  app.quit()
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
