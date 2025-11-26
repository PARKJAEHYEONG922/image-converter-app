const { app, BrowserWindow, ipcMain, dialog, shell, Menu, net } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const https = require('https');
const http = require('http');

// 하드웨어 가속 비활성화 (캐시 오류 방지)
app.disableHardwareAcceleration();

// GPU 캐시 완전 비활성화 (권한 오류 방지)
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('disk-cache-size', '0');

// 캐시 경로 설정 (권한 오류 방지)
app.setPath('userData', path.join(app.getPath('appData'), 'image-converter-app'));

let mainWindow = null;
const isDev = process.argv.includes('--dev');

function createMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    // macOS용 App 메뉴
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { label: 'About AI Image Converter', role: 'about' },
        { type: 'separator' },
        { label: 'Hide AI Image Converter', role: 'hide' },
        { label: 'Hide Others', role: 'hideOthers' },
        { label: 'Show All', role: 'unhide' },
        { type: 'separator' },
        { label: 'Quit', role: 'quit' }
      ]
    }] : []),
    // View 메뉴 (새로고침)
    {
      label: 'View',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { label: 'Force Reload', accelerator: 'CmdOrCtrl+Shift+R', role: 'forceReload' }
      ]
    },
    // Edit 메뉴 (복사/붙여넣기 지원)
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { label: 'Select All', accelerator: 'CmdOrCtrl+A', role: 'selectAll' }
      ]
    },
    // Help 메뉴
    {
      label: 'Help',
      submenu: [
        ...(!isMac ? [{
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
        }] : [])
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
      devTools: isDev, // DevTools only enabled in development mode
      webSecurity: true,
      allowRunningInsecureContent: false
    },
    icon: path.join(__dirname, '../../public/icon.png')
  });

  // Allow external API calls
  mainWindow.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
    callback({ requestHeaders: { ...details.requestHeaders } });
  });

  // 프로덕션에서만 DevTools 단축키 비활성화
  if (!isDev) {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      const key = input.key.toLowerCase();
      if (input.key === 'F12' ||
          (input.control && input.shift && ['i', 'j', 'c'].includes(key))) {
        event.preventDefault();
      }
    });
  }

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
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

// Download image from URL (Electron net 모듈 사용 - 더 나은 호환성)
ipcMain.handle('download-image', async (_, imageUrl) => {
  return new Promise((resolve, reject) => {
    // Electron net 모듈 사용 (Chromium 네트워크 스택, 더 나은 호환성)
    const request = net.request({
      url: imageUrl,
      method: 'GET'
    });

    // 브라우저처럼 헤더 설정
    request.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    request.setHeader('Accept', 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8');
    request.setHeader('Accept-Language', 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7');
    request.setHeader('Accept-Encoding', 'gzip, deflate, br');
    request.setHeader('Sec-Fetch-Dest', 'image');
    request.setHeader('Sec-Fetch-Mode', 'no-cors');
    request.setHeader('Sec-Fetch-Site', 'cross-site');

    const chunks = [];
    let contentType = 'image/png';

    request.on('response', (response) => {
      // 리다이렉트는 net 모듈이 자동 처리
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download image: ${response.statusCode}`));
        return;
      }

      contentType = response.headers['content-type'] || 'image/png';
      if (Array.isArray(contentType)) {
        contentType = contentType[0];
      }

      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const base64 = buffer.toString('base64');
        resolve(`data:${contentType};base64,${base64}`);
      });
      response.on('error', reject);
    });

    request.on('error', (error) => {
      // net 모듈 실패 시 기존 방식으로 fallback
      console.log('net 모듈 실패, http/https로 재시도:', error.message);

      const protocol = imageUrl.startsWith('https') ? https : http;
      protocol.get(imageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/*',
          'Referer': imageUrl
        }
      }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const redirectUrl = res.headers.location;
          const redirectProtocol = redirectUrl.startsWith('https') ? https : http;
          redirectProtocol.get(redirectUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'image/*'
            }
          }, (redirectRes) => handleFallbackResponse(redirectRes, resolve, reject))
            .on('error', reject);
        } else {
          handleFallbackResponse(res, resolve, reject);
        }
      }).on('error', reject);
    });

    request.end();
  });
});

function handleFallbackResponse(res, resolve, reject) {
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