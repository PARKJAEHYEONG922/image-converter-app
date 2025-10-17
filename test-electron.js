console.log('Testing electron import...');
try {
  const electron = require('electron');
  console.log('Electron object:', electron);
  console.log('app:', electron.app);
  console.log('BrowserWindow:', electron.BrowserWindow);
} catch (error) {
  console.error('Error loading electron:', error.message);
}