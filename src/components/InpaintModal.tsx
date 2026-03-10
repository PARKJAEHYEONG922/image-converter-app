import React, { useState, useRef, useCallback, useEffect } from 'react';

interface InpaintModalProps {
  isOpen: boolean;
  imageUrl: string;
  onClose: () => void;
  isProcessing: boolean;
  onApply: (prompt: string, originalDataUrl: string, maskedDataUrl: string, referenceImage?: string) => void;
}

const InpaintModal: React.FC<InpaintModalProps> = ({
  isOpen,
  imageUrl,
  onClose,
  isProcessing,
  onApply
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tool, setTool] = useState<'brush' | 'eraser'>('brush');
  const [brushSize, setBrushSize] = useState(44);
  const [isDrawing, setIsDrawing] = useState(false);
  const [description, setDescription] = useState('');
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [, setCanvasReady] = useState(false);
  const [history, setHistory] = useState<ImageData[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Initialize canvas with source image
  useEffect(() => {
    if (!isOpen || !imageUrl) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = canvasRef.current;
      const maskCanvas = maskCanvasRef.current;
      if (!canvas || !maskCanvas) return;

      // Fit image to container while maintaining aspect ratio
      const maxW = 460;
      const maxH = 500;
      let w = img.width;
      let h = img.height;
      const scale = Math.min(maxW / w, maxH / h, 1);
      w = Math.round(w * scale);
      h = Math.round(h * scale);

      canvas.width = w;
      canvas.height = h;
      maskCanvas.width = w;
      maskCanvas.height = h;

      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);

      // Clear mask
      const maskCtx = maskCanvas.getContext('2d')!;
      maskCtx.clearRect(0, 0, w, h);

      // Save initial state
      const initialState = maskCtx.getImageData(0, 0, w, h);
      setHistory([initialState]);
      setHistoryIndex(0);
      setCanvasReady(true);
    };
    img.src = imageUrl;

    return () => {
      setCanvasReady(false);
      setHistory([]);
      setHistoryIndex(-1);
      setDescription('');
      setReferenceImage(null);
      setTool('brush');
    };
  }, [isOpen, imageUrl]);

  const saveToHistory = useCallback(() => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    const maskCtx = maskCanvas.getContext('2d')!;
    const state = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(state);
      return newHistory;
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    const maskCtx = maskCanvas.getContext('2d')!;
    maskCtx.putImageData(history[newIndex], 0, 0);
    setHistoryIndex(newIndex);
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const newIndex = historyIndex + 1;
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    const maskCtx = maskCanvas.getContext('2d')!;
    maskCtx.putImageData(history[newIndex], 0, 0);
    setHistoryIndex(newIndex);
  }, [history, historyIndex]);

  const clearMask = useCallback(() => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    const maskCtx = maskCanvas.getContext('2d')!;
    maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    saveToHistory();
  }, [saveToHistory]);

  const getCanvasPos = (e: React.MouseEvent) => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return { x: 0, y: 0 };
    const rect = maskCanvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (maskCanvas.width / rect.width),
      y: (e.clientY - rect.top) * (maskCanvas.height / rect.height)
    };
  };

  const draw = useCallback((x: number, y: number) => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    const maskCtx = maskCanvas.getContext('2d')!;

    if (tool === 'eraser') {
      maskCtx.globalCompositeOperation = 'destination-out';
      maskCtx.beginPath();
      maskCtx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
      maskCtx.fill();
      maskCtx.globalCompositeOperation = 'source-over';
    } else {
      // Yellow-green highlighter with transparency
      maskCtx.fillStyle = 'rgba(180, 220, 0, 0.45)';
      maskCtx.beginPath();
      maskCtx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
      maskCtx.fill();
    }
  }, [tool, brushSize]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDrawing(true);
    const pos = getCanvasPos(e);
    draw(pos.x, pos.y);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing) return;
    const pos = getCanvasPos(e);
    draw(pos.x, pos.y);
  };

  const handleMouseUp = () => {
    if (isDrawing) {
      setIsDrawing(false);
      saveToHistory();
    }
  };

  const handleReferenceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setReferenceImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleApply = () => {
    const canvas = canvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!canvas || !maskCanvas) return;

    // Original image (clean)
    const originalDataUrl = canvas.toDataURL('image/png');

    // Create black & white mask: black = keep, white = edit area
    const bwMaskCanvas = document.createElement('canvas');
    bwMaskCanvas.width = maskCanvas.width;
    bwMaskCanvas.height = maskCanvas.height;
    const bwCtx = bwMaskCanvas.getContext('2d')!;

    // Fill with black (keep area)
    bwCtx.fillStyle = '#000000';
    bwCtx.fillRect(0, 0, bwMaskCanvas.width, bwMaskCanvas.height);

    // Read the mask canvas pixels and convert painted areas to white
    const maskCtx = maskCanvas.getContext('2d')!;
    const maskData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
    const bwData = bwCtx.getImageData(0, 0, bwMaskCanvas.width, bwMaskCanvas.height);

    for (let i = 0; i < maskData.data.length; i += 4) {
      // If alpha > 0 (any painted area), make it white
      if (maskData.data[i + 3] > 10) {
        bwData.data[i] = 255;     // R
        bwData.data[i + 1] = 255; // G
        bwData.data[i + 2] = 255; // B
        bwData.data[i + 3] = 255; // A
      }
    }
    bwCtx.putImageData(bwData, 0, 0);
    const maskedDataUrl = bwMaskCanvas.toDataURL('image/png');

    onApply(description, originalDataUrl, maskedDataUrl, referenceImage || undefined);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div
        className="bg-white rounded-xl w-[540px] max-h-[90vh] overflow-hidden shadow-2xl border border-gray-200 flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <span className="text-sm">✎</span>
            <h2 className="text-sm font-semibold text-gray-900">Inpaint</h2>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">✕</button>
        </div>

        {/* Toolbar */}
        <div className="px-5 py-2.5 border-b border-gray-100 flex items-center gap-3">
          {/* Tools */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setTool('brush')}
              className={`p-1.5 rounded-md transition-colors ${tool === 'brush' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
              title="브러시"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
            <button
              onClick={() => setTool('eraser')}
              className={`p-1.5 rounded-md transition-colors ${tool === 'eraser' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
              title="지우개"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5M14.5 3.5l6 6-9.5 9.5H5.5l-2-2 11-13.5z" />
              </svg>
            </button>
          </div>

          {/* Undo/Redo */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={undo}
              disabled={historyIndex <= 0}
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded disabled:opacity-30"
              title="실행 취소"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
              </svg>
            </button>
            <button
              onClick={redo}
              disabled={historyIndex >= history.length - 1}
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded disabled:opacity-30"
              title="다시 실행"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a5 5 0 00-5 5v2M21 10l-4-4M21 10l-4 4" />
              </svg>
            </button>
          </div>

          {/* Clear */}
          <button
            onClick={clearMask}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded"
            title="전체 지우기"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>

          <div className="w-px h-5 bg-gray-200" />

          {/* Brush Size */}
          <div className="flex items-center gap-2 flex-1">
            <span className="text-[10px] text-gray-400 whitespace-nowrap">Brush Size</span>
            <input
              type="range"
              min={5}
              max={100}
              value={brushSize}
              onChange={e => setBrushSize(Number(e.target.value))}
              className="flex-1 h-1 accent-gray-700"
            />
            <span className="text-[10px] text-gray-500 w-7 text-right">{brushSize}%</span>
          </div>
        </div>

        {/* Canvas Area */}
        <div className="flex-1 overflow-auto p-4">
          <div
            ref={containerRef}
            className="relative mx-auto bg-gray-100 rounded-lg overflow-hidden"
            style={{ width: 'fit-content' }}
          >
            <canvas ref={canvasRef} className="block" />
            <canvas
              ref={maskCanvasRef}
              className="absolute top-0 left-0 w-full h-full"
              style={{ cursor: tool === 'brush'
                ? `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${Math.max(8, brushSize * 0.5)}' height='${Math.max(8, brushSize * 0.5)}' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='10' fill='none' stroke='%23b4dc00' stroke-width='2'/%3E%3C/svg%3E") ${Math.max(4, brushSize * 0.25)} ${Math.max(4, brushSize * 0.25)}, crosshair`
                : `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${Math.max(8, brushSize * 0.5)}' height='${Math.max(8, brushSize * 0.5)}' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='10' fill='none' stroke='%23999' stroke-width='2'/%3E%3C/svg%3E") ${Math.max(4, brushSize * 0.25)} ${Math.max(4, brushSize * 0.25)}, crosshair`
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            />
          </div>
        </div>

        {/* Reference Image + Description */}
        <div className="px-5 py-3 border-t border-gray-100 space-y-3">
          {/* Reference image upload */}
          <div className="flex items-start gap-3">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center cursor-pointer hover:border-gray-300 hover:bg-gray-50 transition-colors shrink-0 overflow-hidden"
            >
              {referenceImage ? (
                <img src={referenceImage} alt="참조" className="w-full h-full object-cover" />
              ) : (
                <div className="text-center">
                  <svg className="w-5 h-5 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-[8px] text-gray-400 mt-0.5">참조</p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleReferenceUpload}
                className="hidden"
              />
            </div>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Paint over area to edit and describe your changes"
              className="flex-1 h-20 px-3 py-2 text-xs border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-gray-300 text-gray-700 placeholder-gray-400"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleApply}
            disabled={isProcessing}
            className="px-4 py-1.5 text-sm text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-40 flex items-center gap-1.5"
          >
            {isProcessing ? (
              <>
                <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                처리 중...
              </>
            ) : '적용'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default InpaintModal;
