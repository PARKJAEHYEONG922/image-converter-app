import React, { useState, useRef, useCallback } from 'react';

interface ColorTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (palette: string[]) => void;
  currentPalette: string[] | null;
}

/**
 * Extract dominant colors from an image using k-means-like quantization
 */
const extractPalette = (imageUrl: string, colorCount = 8): Promise<string[]> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const size = 64; // downscale for speed
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;

      // Collect all pixels as [r, g, b]
      const pixels: number[][] = [];
      for (let i = 0; i < data.length; i += 4) {
        pixels.push([data[i], data[i + 1], data[i + 2]]);
      }

      // Simple k-means clustering
      const colors = kMeans(pixels, colorCount, 10);

      // Sort by luminance (dark to light)
      colors.sort((a, b) => {
        const lumA = 0.299 * a[0] + 0.587 * a[1] + 0.114 * a[2];
        const lumB = 0.299 * b[0] + 0.587 * b[1] + 0.114 * b[2];
        return lumA - lumB;
      });

      const hexColors = colors.map(
        ([r, g, b]) => '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')
      );

      resolve(hexColors);
    };
    img.onerror = () => resolve([]);
    img.src = imageUrl;
  });
};

function kMeans(pixels: number[][], k: number, iterations: number): number[][] {
  // Initialize centroids randomly
  const centroids: number[][] = [];
  const step = Math.floor(pixels.length / k);
  for (let i = 0; i < k; i++) {
    centroids.push([...pixels[i * step]]);
  }

  for (let iter = 0; iter < iterations; iter++) {
    // Assign pixels to nearest centroid
    const clusters: number[][][] = Array.from({ length: k }, () => []);

    for (const pixel of pixels) {
      let minDist = Infinity;
      let closest = 0;
      for (let c = 0; c < k; c++) {
        const dist =
          (pixel[0] - centroids[c][0]) ** 2 +
          (pixel[1] - centroids[c][1]) ** 2 +
          (pixel[2] - centroids[c][2]) ** 2;
        if (dist < minDist) {
          minDist = dist;
          closest = c;
        }
      }
      clusters[closest].push(pixel);
    }

    // Update centroids
    for (let c = 0; c < k; c++) {
      if (clusters[c].length === 0) continue;
      centroids[c] = [0, 0, 0];
      for (const pixel of clusters[c]) {
        centroids[c][0] += pixel[0];
        centroids[c][1] += pixel[1];
        centroids[c][2] += pixel[2];
      }
      centroids[c][0] /= clusters[c].length;
      centroids[c][1] /= clusters[c].length;
      centroids[c][2] /= clusters[c].length;
    }
  }

  // Filter out very similar colors (distance < 30)
  const filtered: number[][] = [centroids[0]];
  for (let i = 1; i < centroids.length; i++) {
    let tooClose = false;
    for (const existing of filtered) {
      const dist = Math.sqrt(
        (centroids[i][0] - existing[0]) ** 2 +
        (centroids[i][1] - existing[1]) ** 2 +
        (centroids[i][2] - existing[2]) ** 2
      );
      if (dist < 30) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) filtered.push(centroids[i]);
  }

  return filtered;
}

const ColorTransferModal: React.FC<ColorTransferModalProps> = ({
  isOpen,
  onClose,
  onApply,
  currentPalette
}) => {
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [palette, setPalette] = useState<string[] | null>(currentPalette);
  const [extracting, setExtracting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const url = reader.result as string;
      setReferenceImage(url);
      setExtracting(true);
      const colors = await extractPalette(url, 8);
      setPalette(colors);
      setExtracting(false);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleApply = () => {
    if (palette && palette.length > 0) {
      onApply(palette);
      onClose();
    }
  };

  const handleRemove = () => {
    onApply([]);
    setPalette(null);
    setReferenceImage(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div
        className="bg-white rounded-xl w-[440px] max-h-[85vh] overflow-hidden shadow-2xl border border-gray-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Color Transfer</h2>
            <p className="text-xs text-gray-400 mt-0.5">참조 이미지에서 색감 팔레트를 추출합니다</p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            ✕
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Reference image + palette preview */}
          {referenceImage && (
            <div className="flex items-start gap-4">
              <div className="w-24 h-24 rounded-lg overflow-hidden border border-gray-200 shrink-0">
                <img src={referenceImage} alt="참조" className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-400 mb-2">추출된 팔레트</p>
                {extracting ? (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    분석 중...
                  </div>
                ) : palette && palette.length > 0 ? (
                  <>
                    <div className="flex h-8 rounded-lg overflow-hidden border border-gray-200">
                      {palette.map((color, i) => (
                        <div
                          key={i}
                          className="flex-1 relative group"
                          style={{ backgroundColor: color }}
                        >
                          <span className="absolute inset-0 flex items-center justify-center text-[8px] font-mono opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 text-white">
                            {color}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1.5">{palette.length}개 색상 추출됨</p>
                  </>
                ) : null}
              </div>
            </div>
          )}

          {/* Upload area */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-gray-300 hover:bg-gray-50 transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-xs font-medium text-gray-600">
                {referenceImage ? '다른 이미지로 변경' : '참조 이미지 업로드'}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">클릭하여 이미지를 선택하세요</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
          </div>

          {/* Info */}
          <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
            <p className="text-xs text-gray-500 leading-relaxed">
              참조 이미지의 주요 색상을 추출하여 이미지 생성 시 프롬프트에 자동으로 반영합니다.
              원하는 분위기의 사진, 영화 장면, 일러스트 등을 업로드해보세요.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 flex items-center justify-between">
          <button
            onClick={handleRemove}
            disabled={!palette && !currentPalette}
            className="px-3 py-1.5 text-xs text-red-500 bg-red-50 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-40"
          >
            해제
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleApply}
              disabled={!palette || palette.length === 0}
              className="px-4 py-1.5 text-sm text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-40"
            >
              적용
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ColorTransferModal;
