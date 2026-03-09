import React, { useState, useCallback, useRef } from 'react';
import { removeBackground } from '@imgly/background-removal';
import Button from './Button';

const BackgroundRemoval: React.FC = () => {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processImage = useCallback(async (imageDataUrl: string) => {
    setIsProcessing(true);
    setProgress(0);
    setProgressMessage('배경 제거 중...');
    setResultImage(null);

    try {
      const response = await fetch(imageDataUrl);
      const blob = await response.blob();

      const result = await removeBackground(blob, {
        progress: (key: string, current: number, total: number) => {
          const pct = total > 0 ? Math.round((current / total) * 100) : 0;
          setProgress(pct);
          if (key.includes('download') || key.includes('fetch')) {
            setProgressMessage('AI 모델 다운로드 중...');
          } else if (key.includes('compute') || key.includes('process')) {
            setProgressMessage('배경 제거 중...');
          }
        },
      });

      const resultUrl = URL.createObjectURL(result);
      setResultImage(resultUrl);
    } catch (error) {
      console.error('Background removal failed:', error);
      alert('배경 제거에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setIsProcessing(false);
      setProgress(100);
      setProgressMessage('');
    }
  }, []);

  const handleFileSelect = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setOriginalImage(dataUrl);
      setResultImage(null);
      processImage(dataUrl);
    };
    reader.readAsDataURL(file);
  }, [processImage]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleClickUpload = () => {
    fileInputRef.current?.click();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleSave = async () => {
    if (!resultImage) return;
    try {
      const response = await fetch(resultImage);
      const blob = await response.blob();
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const baseName = fileName.replace(/\.[^.]+$/, '');
        const result = await window.electronAPI.saveImage(
          `data:image/png;base64,${base64}`,
          `${baseName}_nobg.png`
        );
        if (result) {
          alert('저장되었습니다!');
        }
      };
      reader.readAsDataURL(blob);
    } catch (error) {
      console.error('Save failed:', error);
    }
  };

  const handleReset = () => {
    setOriginalImage(null);
    setResultImage(null);
    setProgress(0);
    setFileName('');
    if (resultImage) URL.revokeObjectURL(resultImage);
  };

  const handleCopyToClipboard = async () => {
    if (!resultImage) return;
    try {
      const response = await fetch(resultImage);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
      alert('클립보드에 복사되었습니다!');
    } catch {
      alert('복사에 실패했습니다.');
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-100 overflow-auto p-6">
      {!originalImage ? (
        <div className="flex-1 flex items-center justify-center">
          <div
            onClick={handleClickUpload}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`w-full max-w-lg cursor-pointer rounded-2xl border-2 border-dashed p-12 text-center transition-all
              ${isDragOver
                ? 'border-indigo-400 bg-indigo-50 scale-[1.02]'
                : 'border-gray-300 bg-white hover:border-indigo-300 hover:bg-gray-50'
              }`}
          >
            <div className="mx-auto w-16 h-16 mb-4 rounded-full bg-indigo-50 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <p className="text-gray-700 font-medium mb-1">이미지를 드래그하거나 클릭하여 업로드</p>
            <p className="text-sm text-gray-400">PNG, JPG, WEBP 지원</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleInputChange}
            className="hidden"
          />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleReset}>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
              </svg>
              다시 선택
            </Button>
            {resultImage && (
              <>
                <Button variant="primary" size="sm" onClick={handleSave}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  PNG 저장
                </Button>
                <Button variant="outline" size="sm" onClick={handleCopyToClipboard}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </svg>
                  복사
                </Button>
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                <span className="text-sm font-medium text-gray-600">원본</span>
              </div>
              <div className="flex items-center justify-center p-6">
                <img src={originalImage} alt="Original" className="max-w-full max-h-[60vh] object-contain rounded-lg" />
              </div>
            </div>

            <div className="flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                <span className="text-sm font-medium text-gray-600">배경 제거</span>
              </div>
              <div className="flex items-center justify-center p-6"
                style={{
                  backgroundImage: resultImage ? `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20'%3E%3Crect width='10' height='10' fill='%23f0f0f0'/%3E%3Crect x='10' y='10' width='10' height='10' fill='%23f0f0f0'/%3E%3Crect x='10' width='10' height='10' fill='%23fafafa'/%3E%3Crect y='10' width='10' height='10' fill='%23fafafa'/%3E%3C/svg%3E")` : undefined,
                }}
              >
                {isProcessing ? (
                  <div className="flex flex-col items-center gap-3 py-20">
                    <div className="w-48 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="text-sm text-gray-500">{progressMessage || '처리 중...'}</p>
                  </div>
                ) : resultImage ? (
                  <img src={resultImage} alt="Background removed" className="max-w-full max-h-[60vh] object-contain rounded-lg" />
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BackgroundRemoval;
