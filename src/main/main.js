const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const https = require('https');
const http = require('http');

// 하드웨어 가속 비활성화 (캐시 오류 방지)
app.disableHardwareAcceleration();

let mainWindow = null;
const isDev = process.argv.includes('--dev');

function createMenu() {
  const template = [
    {
      label: 'Help',
      submenu: [
        {
          label: 'About AI Image Converter',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About AI Image Converter',
              message: 'AI Image Converter',
              detail: 'Version: 1.0.1\n\nAI-powered image conversion and generation tool.\n\n© 2025 AI Image Converter',
              buttons: ['OK']
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      devTools: isDev // DevTools only enabled in development mode
    },
    icon: path.join(__dirname, '../../public/icon.png')
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    // Disable DevTools shortcuts in production
    mainWindow.webContents.on('before-input-event', (event, input) => {
      // Disable F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C
      if (input.key === 'F12' ||
          (input.control && input.shift && (input.key === 'I' || input.key === 'J' || input.key === 'C'))) {
        event.preventDefault();
      }
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createMenu();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// File operations
ipcMain.handle('select-image', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    const buffer = await fs.readFile(filePath);
    const base64 = buffer.toString('base64');
    const ext = path.extname(filePath).slice(1);
    return {
      path: filePath,
      data: `data:image/${ext};base64,${base64}`,
      name: path.basename(filePath)
    };
  }
  return null;
});

ipcMain.handle('save-image', async (_, imageData, filename) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: filename,
    filters: [
      { name: 'PNG Image', extensions: ['png'] },
      { name: 'JPEG Image', extensions: ['jpg', 'jpeg'] },
      { name: 'WebP Image', extensions: ['webp'] }
    ]
  });

  if (!result.canceled && result.filePath) {
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    await fs.writeFile(result.filePath, buffer);
    return result.filePath;
  }
  return null;
});

ipcMain.handle('show-item-in-folder', async (_, filePath) => {
  shell.showItemInFolder(filePath);
});

// API Settings
ipcMain.handle('get-api-settings', async () => {
  try {
    const settingsPath = path.join(app.getPath('userData'), 'settings.json');
    const data = await fs.readFile(settingsPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return {
      geminiApiKey: ''
    };
  }
});

ipcMain.handle('save-api-settings', async (_, settings) => {
  const settingsPath = path.join(app.getPath('userData'), 'settings.json');
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
  return true;
});

// Open external URLs
ipcMain.handle('open-external', async (_, url) => {
  await shell.openExternal(url);
  return true;
});

// Download image from URL
ipcMain.handle('download-image', async (_, imageUrl) => {
  return new Promise((resolve, reject) => {
    const protocol = imageUrl.startsWith('https') ? https : http;

    protocol.get(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'image/*',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': imageUrl.split('/').slice(0, 3).join('/')
      }
    }, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // Follow redirects
        const redirectUrl = response.headers.location;
        const redirectProtocol = redirectUrl.startsWith('https') ? https : http;
        redirectProtocol.get(redirectUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'image/*'
          }
        }, (redirectResponse) => {
          handleResponse(redirectResponse);
        }).on('error', reject);
      } else {
        handleResponse(response);
      }

      function handleResponse(res) {
        if (res.statusCode !== 200) {
          reject(new Error(`Failed to download image: ${res.statusCode}`));
          return;
        }

        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const base64 = buffer.toString('base64');
          const contentType = res.headers['content-type'] || 'image/png';
          resolve(`data:${contentType};base64,${base64}`);
        });
        res.on('error', reject);
      }
    }).on('error', reject);
  });
});