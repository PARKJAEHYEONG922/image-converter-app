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
  geminiModel?: GeminiModel;
  outputResolution?: OutputResolution;
}

export type OutputResolution = '1k' | '2k' | '4k';

export type GeminiModel =
  | 'gemini-2.5-flash-image'           // Gemini 2.5 Flash Image (안정 버전)
  | 'gemini-2.5-flash-image-preview'   // Gemini 2.5 Flash Image (프리뷰)
  | 'gemini-3-pro-image-preview';      // Gemini 3.0 Pro Image (최신)

export interface GeminiModelInfo {
  id: GeminiModel;
  name: string;
  description: string;
  tier: 'flash' | 'pro';
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