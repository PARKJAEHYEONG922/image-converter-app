export interface ElectronAPI {
  selectImage: () => Promise<{ path: string; data: string; name: string } | null>;
  saveImage: (imageData: string, filename: string) => Promise<string | null>;
  showItemInFolder: (filePath: string) => Promise<void>;
  getApiSettings: () => Promise<ApiSettings>;
  saveApiSettings: (settings: ApiSettings) => Promise<boolean>;
  generateImage: (prompt: string, options?: ImageOptions) => Promise<string>;
  openExternal: (url: string) => Promise<boolean>;
  downloadImage: (imageUrl: string) => Promise<string>;
}

export interface ApiSettings {
  geminiApiKey: string;
}

export interface ImageOptions {
  aspectRatio?: string | null;
  referenceImage?: string;
  referenceImages?: string[];
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}