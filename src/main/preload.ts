import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  selectImage: () => ipcRenderer.invoke('select-image'),
  saveImage: (imageData: string, filename: string) =>
    ipcRenderer.invoke('save-image', imageData, filename),
  showItemInFolder: (filePath: string) =>
    ipcRenderer.invoke('show-item-in-folder', filePath),
  getApiSettings: () => ipcRenderer.invoke('get-api-settings'),
  saveApiSettings: (settings: any) => ipcRenderer.invoke('save-api-settings', settings),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  downloadImage: (imageUrl: string) => ipcRenderer.invoke('download-image', imageUrl)
});

export type ElectronAPI = {
  selectImage: () => Promise<{ path: string; data: string; name: string } | null>;
  saveImage: (imageData: string, filename: string) => Promise<string | null>;
  showItemInFolder: (filePath: string) => Promise<void>;
  getApiSettings: () => Promise<any>;
  saveApiSettings: (settings: any) => Promise<boolean>;
};