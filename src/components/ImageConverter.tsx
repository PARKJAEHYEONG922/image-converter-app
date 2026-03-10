import React, { useState, useCallback, useEffect, useRef } from 'react';
import Button from './Button';
import ImagePasteDialog from './ImagePasteDialog';
import ImageMarkupModal from './ImageMarkupModal';
import SaveSuccessDialog from './SaveSuccessDialog';
import ColorTransferModal from './ColorTransferModal';
import RelightModal from './RelightModal';
import InpaintModal from './InpaintModal';
import AnglesModal from './AnglesModal';
import BackgroundRemoval from './BackgroundRemoval';
import { generateImage, getCurrentModel, setGeminiModel, getCurrentResolution, setOutputResolution } from '../services/gemini';
import ReactCrop, { Crop, PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

type ImageMode = 'text-to-image' | 'edit-image' | 'background-removal';
type AspectRatio = '1:1' | '2:3' | '3:2' | '3:4' | '4:3' | '4:5' | '5:4' | '9:16' | '16:9' | '21:9' | '1:4' | '4:1' | '1:8' | '8:1';

interface ModeState {
  selectedImages: File[];
  imagePreviews: string[];
  prompt: string;
  aspectRatio: AspectRatio;
  imageCount: number;
  transformedImages: string[];
  imageHistory: string[][];
}

interface ImageConverterProps {
  onSettingsOpen?: () => void;
}

const ImageConverter: React.FC<ImageConverterProps> = ({ onSettingsOpen }) => {
  const [mode, setMode] = useState<ImageMode>('text-to-image');
  const [activeModel, setActiveModel] = useState(getCurrentModel());
  const [activeResolution, setActiveResolution] = useState(getCurrentResolution());

  const [modeStates, setModeStates] = useState<Record<ImageMode, ModeState>>({
    'text-to-image': {
      selectedImages: [],
      imagePreviews: [],
      prompt: '',
      aspectRatio: '1:1',
      imageCount: 1,
      transformedImages: [],
      imageHistory: []
    },
    'edit-image': {
      selectedImages: [],
      imagePreviews: [],
      prompt: '',
      aspectRatio: '1:1',
      imageCount: 1,
      transformedImages: [],
      imageHistory: []
    },
    'background-removal': {
      selectedImages: [],
      imagePreviews: [],
      prompt: '',
      aspectRatio: '1:1',
      imageCount: 1,
      transformedImages: [],
      imageHistory: []
    }
  });

  const currentState = modeStates[mode];
  const [selectedImages, setSelectedImages] = useState<File[]>(currentState.selectedImages);
  const [imagePreviews, setImagePreviews] = useState<string[]>(currentState.imagePreviews);
  const [prompt, setPrompt] = useState(currentState.prompt);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(currentState.aspectRatio);
  const [imageCount, setImageCount] = useState(currentState.imageCount);
  const [transformedImages, setTransformedImages] = useState<string[]>(currentState.transformedImages);
  const [imageHistory, setImageHistory] = useState<string[][]>(currentState.imageHistory);
  const [selectedResultIndex, setSelectedResultIndex] = useState(0);

  const [isRatioOpen, setIsRatioOpen] = useState(false);
  const [colorPalette, setColorPalette] = useState<string[] | null>(null);
  const [colorTransferOpen, setColorTransferOpen] = useState(false);
  const [relightOpen, setRelightOpen] = useState(false);
  const [inpaintOpen, setInpaintOpen] = useState(false);
  const [anglesOpen, setAnglesOpen] = useState(false);
  const [isTransforming, setIsTransforming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [imageModal, setImageModal] = useState<{
    isOpen: boolean;
    imageUrl: string;
    isCropping?: boolean;
  }>({
    isOpen: false,
    imageUrl: '',
    isCropping: false
  });

  // Paste dialog state
  const [pasteDialogOpen, setPasteDialogOpen] = useState(false);
  const [imagesExpanded, setImagesExpanded] = useState(false);
  const [markupModal, setMarkupModal] = useState<{ isOpen: boolean; index: number; imageUrl: string }>({
    isOpen: false, index: -1, imageUrl: ''
  });
  const originalImagesRef = useRef<Map<number, string>>(new Map());

  // Save dialog state
  const [saveDialogState, setSaveDialogState] = useState<{
    isOpen: boolean;
    filePath: string | null;
  }>({
    isOpen: false,
    filePath: null
  });

  // Drag reorder state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = (index: number) => {
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    // Reorder images and previews
    const newImages = [...selectedImages];
    const newPreviews = [...imagePreviews];
    const [movedImage] = newImages.splice(dragIndex, 1);
    const [movedPreview] = newPreviews.splice(dragIndex, 1);
    newImages.splice(index, 0, movedImage);
    newPreviews.splice(index, 0, movedPreview);
    setSelectedImages(newImages);
    setImagePreviews(newPreviews);
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  // Crop states
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const getMaxImages = () => {
    if (mode === 'text-to-image') return 0;
    const model = getCurrentModel();
    // 3.1 Flash: 최대 14장, 2.5 Flash: 최대 3장 (공식 문서 기준)
    return model === 'gemini-3.1-flash-image-preview' ? 14 : 3;
  };

  const addImageFiles = useCallback((files: File[]) => {
    const maxImages = getMaxImages();
    if (maxImages === 0 || files.length === 0) return;

    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    // 슬롯이 꽉 찬 경우: FIFO 교체
    if (selectedImages.length >= maxImages) {
      const newFiles = imageFiles.slice(0, imageFiles.length);
      const removeCount = Math.min(newFiles.length, selectedImages.length);
      const remainingImages = selectedImages.slice(removeCount);
      const remainingPreviews = imagePreviews.slice(removeCount);

      setSelectedImages([...remainingImages, ...newFiles].slice(0, maxImages));

      const newPreviews: string[] = [];
      let loadedCount = 0;

      newFiles.forEach((file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          newPreviews.push(e.target?.result as string);
          loadedCount++;
          if (loadedCount === newFiles.length) {
            setImagePreviews([...remainingPreviews, ...newPreviews].slice(0, maxImages));
          }
        };
        reader.readAsDataURL(file);
      });
      setError(null);
      return;
    }

    // 슬롯에 여유 있는 경우: 추가 모드
    const remainingSlots = maxImages - selectedImages.length;
    const newFiles = imageFiles.slice(0, remainingSlots);
    const updatedFiles = [...selectedImages, ...newFiles];

    setSelectedImages(updatedFiles);
    setError(null);

    newFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreviews(prev => [...prev, e.target?.result as string]);
      };
      reader.readAsDataURL(file);
    });
  }, [selectedImages, imagePreviews, mode]);

  const handleImageSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    addImageFiles(files);
    event.target.value = '';
  }, [addImageFiles]);

  // 드래그앤드롭 상태
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    addImageFiles(files);
  }, [addImageFiles]);

  const handleFileDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleFileDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleRemoveImage = useCallback((index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
    // Clean up original image reference
    originalImagesRef.current.delete(index);
    // Re-index remaining originals
    const newMap = new Map<number, string>();
    originalImagesRef.current.forEach((url, key) => {
      if (key > index) newMap.set(key - 1, url);
      else newMap.set(key, url);
    });
    originalImagesRef.current = newMap;
  }, []);

  // Handle image paste from dialog
  const handleImageFromDialog = useCallback(async (imageData: string | File) => {
    const maxImages = getMaxImages();

    if (maxImages === 0) return;

    const isFull = selectedImages.length >= maxImages;

    // 이미지 추가/교체 헬퍼 함수
    const addOrReplaceImage = (file: File, preview: string) => {
      if (isFull) {
        // FIFO: 첫 번째 제거 후 추가
        setSelectedImages(prev => [...prev.slice(1), file]);
        setImagePreviews(prev => [...prev.slice(1), preview]);
      } else {
        setSelectedImages(prev => [...prev, file]);
        setImagePreviews(prev => [...prev, preview]);
      }
      setError(null);
    };

    if (imageData instanceof File) {
      // Handle File object from clipboard paste
      const reader = new FileReader();
      reader.onload = (e) => {
        addOrReplaceImage(imageData, e.target?.result as string);
      };
      reader.readAsDataURL(imageData);
    } else if (typeof imageData === 'string') {
      // Handle URL string using Electron API to avoid CORS
      try {
        // Use Electron API to download the image
        const base64Data = await window.electronAPI.downloadImage(imageData);

        // Convert base64 to blob
        const base64Response = await fetch(base64Data);
        const blob = await base64Response.blob();
        const file = new File([blob], `url-image-${Date.now()}.png`, { type: blob.type });

        addOrReplaceImage(file, base64Data);
      } catch (err) {
        console.error('URL 이미지 가져오기 실패:', err);
        setError('이미지 URL에서 이미지를 가져올 수 없습니다. 일부 사이트는 외부 접근을 제한합니다.');
      }
    }
  }, [selectedImages, imagePreviews, mode]);

  const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleTransform = useCallback(async () => {
    if (mode !== 'text-to-image' && selectedImages.length === 0) {
      setError('이미지를 선택해주세요.');
      return;
    }

    if (!prompt.trim()) {
      setError('프롬프트를 입력해주세요.');
      return;
    }

    setIsTransforming(true);
    setError(null);

    try {
      // Build options once
      const imageOptions: any = { aspectRatio };
      if (mode !== 'text-to-image') {
        if (selectedImages.length > 1) {
          const imageDataUrls = await Promise.all(
            selectedImages.map(file => fileToDataUrl(file))
          );
          imageOptions.referenceImages = imageDataUrls;
        } else {
          imageOptions.referenceImage = await fileToDataUrl(selectedImages[0]);
        }
      }

      // Build final prompt with color palette if set
      let finalPrompt = prompt;
      if (colorPalette && colorPalette.length > 0) {
        finalPrompt += `\n\nApply the following color palette/mood to this image: ${colorPalette.join(', ')}. Use these colors as the dominant tones and color grading for the output.`;
      }

      // Send N parallel requests
      let lastError: any = null;
      const promises = Array.from({ length: imageCount }, () =>
        generateImage(finalPrompt, { ...imageOptions }).catch((err) => {
          console.error('개별 이미지 생성 실패:', err);
          lastError = err;
          return null;
        })
      );
      const results = await Promise.all(promises);
      const successImages = results.filter((url): url is string => url !== null && url !== '');

      if (successImages.length > 0) {
        if (transformedImages.length > 0) {
          setImageHistory(prev => [transformedImages, ...prev]);
        }
        setTransformedImages(successImages);
        setSelectedResultIndex(0);
      } else if (lastError) {
        throw lastError;
      } else {
        setError('이미지 생성/변환에 실패했습니다.');
      }
    } catch (err) {
      console.error('이미지 처리 오류:', err);
      setError(err instanceof Error ? err.message : '이미지 처리 중 오류가 발생했습니다.');
    } finally {
      setIsTransforming(false);
    }
  }, [mode, selectedImages, prompt, aspectRatio, imageCount, transformedImages, colorPalette]);

  const openImageModal = useCallback((imageUrl: string) => {
    setImageModal({
      isOpen: true,
      imageUrl,
      isCropping: false
    });
    setCrop(undefined);
    setCompletedCrop(null);
  }, []);

  const closeImageModal = useCallback(() => {
    // Sync: if the currently viewed image is in a history set, swap it into transformedImages
    const viewedUrl = imageModal.imageUrl;
    if (viewedUrl && !transformedImages.includes(viewedUrl)) {
      // Find which history set has this image
      const setIdx = imageHistory.findIndex(set => set.includes(viewedUrl));
      if (setIdx >= 0) {
        const historySet = imageHistory[setIdx];
        const newHistory = [...imageHistory];
        newHistory.splice(setIdx, 1);
        if (transformedImages.length > 0) {
          newHistory.unshift(transformedImages);
        }
        setImageHistory(newHistory);
        setTransformedImages(historySet);
        setSelectedResultIndex(historySet.indexOf(viewedUrl));
      }
    } else if (viewedUrl && transformedImages.includes(viewedUrl)) {
      setSelectedResultIndex(transformedImages.indexOf(viewedUrl));
    }

    setImageModal({
      isOpen: false,
      imageUrl: '',
      isCropping: false
    });
    setCrop(undefined);
    setCompletedCrop(null);
  }, [imageModal.imageUrl, transformedImages, imageHistory]);

  const handleReset = useCallback(() => {
    setSelectedImages([]);
    setImagePreviews([]);
    setPrompt('');
    setTransformedImages([]);
    setError(null);
  }, []);

  // 이미지 회전/반전 처리 함수
  const transformResultImage = useCallback((type: 'flipH' | 'flipV' | 'rotateCW') => {
    const src = imageModal.imageUrl;
    if (!src) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const isRotate = type === 'rotateCW';
      const canvas = document.createElement('canvas');
      canvas.width = isRotate ? img.height : img.width;
      canvas.height = isRotate ? img.width : img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.save();
      if (type === 'flipH') {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      } else if (type === 'flipV') {
        ctx.translate(0, canvas.height);
        ctx.scale(1, -1);
      } else {
        ctx.translate(canvas.width, 0);
        ctx.rotate(Math.PI / 2);
      }
      ctx.drawImage(img, 0, 0);
      ctx.restore();
      const newUrl = canvas.toDataURL('image/png');
      // Replace in transformed images
      setTransformedImages(prev => prev.map(u => u === src ? newUrl : u));
      setImageHistory(prev => prev.map(set => set.map(u => u === src ? newUrl : u)));
      setImageModal(prev => ({ ...prev, imageUrl: newUrl }));
    };
    img.src = src;
  }, [imageModal.imageUrl]);

  // 크롭 완료 처리 함수
  const handleCompleteCrop = useCallback(() => {
    if (!completedCrop || !imgRef.current) {
      return;
    }

    const image = imgRef.current;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      return;
    }

    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    canvas.width = completedCrop.width * scaleX;
    canvas.height = completedCrop.height * scaleY;

    ctx.drawImage(
      image,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      canvas.width,
      canvas.height
    );

    const croppedImageUrl = canvas.toDataURL('image/png');

    // 크롭된 이미지를 새로운 결과로 추가
    if (transformedImages.length > 0) {
      setImageHistory(prev => [transformedImages, ...prev]);
    }
    setTransformedImages([croppedImageUrl]);
    setSelectedResultIndex(0);
    setImageModal(prev => ({ ...prev, imageUrl: croppedImageUrl, isCropping: false }));
    setCrop(undefined);
    setCompletedCrop(null);
  }, [completedCrop, transformedImages]);

  useEffect(() => {
    const savePreviousModeState = () => {
      setModeStates(prev => ({
        ...prev,
        [mode]: {
          selectedImages,
          imagePreviews,
          prompt,
          aspectRatio,
          imageCount,
          transformedImages,
          imageHistory
        }
      }));
    };

    return savePreviousModeState;
  }, [mode, selectedImages, imagePreviews, prompt, aspectRatio, imageCount, transformedImages, imageHistory]);

  useEffect(() => {
    const newState = modeStates[mode];
    setSelectedImages(newState.selectedImages);
    setImagePreviews(newState.imagePreviews);
    setPrompt(newState.prompt);
    setAspectRatio(newState.aspectRatio);
    setImageCount(newState.imageCount);
    setTransformedImages(newState.transformedImages);
    setImageHistory(newState.imageHistory);
    setError(null);
  }, [mode]);

  const getModeDescription = () => {
    switch (mode) {
      case 'text-to-image':
        return '텍스트 설명으로 새로운 이미지를 생성합니다';
      case 'edit-image':
        return '이미지 편집, 합성, 스타일 전송 등 자유롭게 활용하세요';
      case 'background-removal':
        return 'AI로 배경을 자동으로 제거합니다';
      default:
        return '';
    }
  };

  const getPromptExamples = () => {
    switch (mode) {
      case 'text-to-image':
        return [
          '우주에서 떠다니는 고양이',
          '산 위에 있는 현대적인 집',
          '미래 도시의 야경',
          '수채화 스타일의 숲'
        ];
      case 'edit-image':
        return [
          '배경을 우주로 변경',
          '이 이미지를 수채화 스타일로 변환',
          '1번 이미지의 사람을 2번 이미지의 배경에 배치',
          '사람 제거하고 배경만 남겨줘'
        ];
      case 'background-removal':
        return [];
      default:
        return [];
    }
  };

  const maxImages = getMaxImages();

  return (
    <div className="flex flex-col h-full bg-gray-100">
      <div className="bg-white border-b border-gray-200 px-6 py-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {[
                { id: 'text-to-image' as ImageMode, label: '✨ 생성' },
                { id: 'edit-image' as ImageMode, label: '✏️ 편집' },
                { id: 'background-removal' as ImageMode, label: '✂️ 누끼' }
              ].map((modeOption) => (
                <button
                  key={modeOption.id}
                  onClick={() => setMode(modeOption.id)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                    mode === modeOption.id
                      ? 'bg-white text-blue-700 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {modeOption.label}
                </button>
              ))}
            </div>
            <span className="text-xs text-gray-400">{getModeDescription()}</span>
          </div>
          <div className="flex items-center gap-2">
            {/* 모델 스위치 */}
            <div className="flex items-center gap-1.5 bg-gray-100 rounded-lg p-1">
              <button
                onClick={async () => {
                  setGeminiModel('gemini-2.5-flash-image');
                  setActiveModel('gemini-2.5-flash-image');
                  const settings = await window.electronAPI.getApiSettings();
                  window.electronAPI.saveApiSettings({ ...settings, geminiModel: 'gemini-2.5-flash-image' });
                }}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  activeModel === 'gemini-2.5-flash-image'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                2.5 Flash
              </button>
              <button
                onClick={async () => {
                  setGeminiModel('gemini-3.1-flash-image-preview');
                  setActiveModel('gemini-3.1-flash-image-preview');
                  const settings = await window.electronAPI.getApiSettings();
                  window.electronAPI.saveApiSettings({ ...settings, geminiModel: 'gemini-3.1-flash-image-preview' });
                }}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  activeModel === 'gemini-3.1-flash-image-preview'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                3.1 Flash
              </button>
            </div>
            {activeModel === 'gemini-3.1-flash-image-preview' && (
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                {(['0.5k', '1k', '2k', '4k'] as const).map((res) => (
                  <button
                    key={res}
                    onClick={async () => {
                      setOutputResolution(res);
                      setActiveResolution(res);
                      const settings = await window.electronAPI.getApiSettings();
                      window.electronAPI.saveApiSettings({ ...settings, outputResolution: res });
                    }}
                    className={`px-2 py-1 rounded-md text-xs font-medium transition-all ${
                      activeResolution === res
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {res}
                  </button>
                ))}
              </div>
            )}
            {onSettingsOpen && (
              <button
                onClick={onSettingsOpen}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {mode === 'background-removal' ? (
        <BackgroundRemoval />
      ) : (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-full">
          <div className="space-y-4">
            {mode !== 'text-to-image' && (
              <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-gray-800">📤 이미지 업로드 {maxImages > 0 && <span className="text-gray-400 font-normal">({selectedImages.length}/{maxImages})</span>}</h2>
                </div>

                <div className="space-y-3">
                  <input
                    type="file"
                    accept="image/*"
                    multiple={maxImages > 1}
                    onChange={handleImageSelect}
                    className="hidden"
                    id="image-upload"
                  />
                  <label
                    htmlFor="image-upload"
                    onDrop={handleFileDrop}
                    onDragOver={handleFileDragOver}
                    onDragLeave={handleFileDragLeave}
                    className={`flex items-center justify-center h-16 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                      isDragOver
                        ? 'border-blue-400 bg-blue-50'
                        : 'border-gray-300 hover:bg-gray-50 hover:border-gray-400'
                    }`}
                  >
                    <span className={`text-sm ${isDragOver ? 'text-blue-500 font-medium' : 'text-gray-400'}`}>
                      {isDragOver ? '여기에 놓으세요' : '여기로 드래그하거나 클릭하여 이미지 선택'}
                    </span>
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    <button
                      onClick={() => setPasteDialogOpen(true)}
                      className="h-10 border border-dashed border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center"
                    >
                      <span className="text-gray-500 text-xs">📋 클립보드에서 붙여넣기</span>
                    </button>
                  </div>

                  {imagePreviews.length > 0 && (() => {
                    const cols = imagePreviews.length === 1 ? 1 : imagePreviews.length === 2 ? 2 : imagePreviews.length <= 4 ? 3 : 4;
                    const colsClass = cols === 1 ? 'grid-cols-1' : cols === 2 ? 'grid-cols-2' : cols === 3 ? 'grid-cols-3' : 'grid-cols-4';
                    const hasMore = imagePreviews.length > cols;
                    const visiblePreviews = (!imagesExpanded && hasMore) ? imagePreviews.slice(0, cols) : imagePreviews;

                    return (
                      <div>
                        <div className={`grid ${colsClass} gap-2`}>
                          {visiblePreviews.map((preview, index) => (
                            <div
                              key={index}
                              draggable={imagePreviews.length > 1}
                              onDragStart={() => handleDragStart(index)}
                              onDragOver={(e) => handleDragOver(e, index)}
                              onDrop={() => handleDrop(index)}
                              onDragEnd={handleDragEnd}
                              className={`relative group bg-gray-50 rounded-lg border overflow-hidden flex items-center justify-center transition-all duration-200 ${
                                dragOverIndex === index ? 'border-gray-900 bg-gray-100 scale-105' :
                                dragIndex === index ? 'opacity-50 border-gray-300' :
                                'border-gray-200'
                              } ${imagePreviews.length > 1 ? 'cursor-grab active:cursor-grabbing' : ''}`}
                              style={{ maxHeight: imagePreviews.length === 1 ? '200px' : '120px' }}
                            >
                              <img
                                src={preview}
                                alt={`Preview ${index + 1}`}
                                className="max-w-full max-h-full object-contain pointer-events-none"
                              />
                              <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    // Save original image on first edit
                                    if (!originalImagesRef.current.has(index)) {
                                      originalImagesRef.current.set(index, preview);
                                    }
                                    setMarkupModal({ isOpen: true, index, imageUrl: preview });
                                  }}
                                  className="bg-gray-800/80 hover:bg-gray-900 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs backdrop-blur-sm"
                                  title="마킹 편집"
                                >
                                  ✎
                                </button>
                                <button
                                  onClick={() => handleRemoveImage(index)}
                                  className="bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs"
                                >
                                  ✕
                                </button>
                              </div>
                              <div className="absolute top-1 left-1 bg-gray-800 text-white text-xs font-medium w-5 h-5 rounded-full flex items-center justify-center">
                                {index + 1}
                              </div>
                              {imagePreviews.length > 1 && (
                                <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-gray-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                                  드래그로 순서 변경
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        {hasMore && (
                          <button
                            onClick={() => setImagesExpanded(!imagesExpanded)}
                            className="w-full mt-2 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors flex items-center justify-center gap-1"
                          >
                            {imagesExpanded ? '▲ 접기' : `▼ ${imagePreviews.length - cols}장 더 보기`}
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-800 mb-2">💬 프롬프트</h2>

              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={getModeDescription()}
                className="w-full h-24 px-3 py-2 border border-gray-200 rounded-lg resize-none focus:border-gray-400 focus:ring-1 focus:ring-gray-200 transition-all text-sm"
              />

              <div className="mt-2 flex flex-wrap gap-1">
                {getPromptExamples().slice(0, 4).map((example) => (
                  <button
                    key={example}
                    onClick={() => setPrompt(example)}
                    className="px-2.5 py-1 bg-blue-50 text-blue-600 text-xs rounded-md hover:bg-blue-100 transition-colors"
                  >
                    {example}
                  </button>
                ))}
              </div>

              <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2">
                <div className="relative">
                  <button
                    onClick={() => setIsRatioOpen(!isRatioOpen)}
                    className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors"
                  >
                    <span className="text-gray-400">비율</span>
                    {(() => {
                      const [w, h] = aspectRatio.split(':').map(Number);
                      const isWide = w > h;
                      const isSquare = w === h;
                      const rw = isSquare ? 10 : isWide ? 14 : 8;
                      const rh = isSquare ? 10 : isWide ? 8 : 14;
                      const rx = (18 - rw) / 2;
                      const ry = (18 - rh) / 2;
                      return (
                        <svg className="w-4 h-4 text-gray-500" viewBox="0 0 18 18" fill="none" stroke="currentColor">
                          <rect x={rx} y={ry} width={rw} height={rh} rx={1.5} strokeWidth={1.5} />
                        </svg>
                      );
                    })()}
                    <span>{aspectRatio}</span>
                    <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {isRatioOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setIsRatioOpen(false)} />
                      <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 min-w-[140px] max-h-[280px] overflow-y-auto">
                        <div className="px-3 py-1.5 text-xs text-gray-400 font-medium">Aspect ratio</div>
                        {(getCurrentModel() === 'gemini-3.1-flash-image-preview'
                          ? ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9', '1:4', '4:1', '1:8', '8:1'] as AspectRatio[]
                          : ['1:1', '3:4', '4:3', '9:16', '16:9', '21:9'] as AspectRatio[]
                        ).map((ratio) => {
                          const [w, h] = ratio.split(':').map(Number);
                          const isWide = w > h;
                          const isSquare = w === h;
                          const rw = isSquare ? 10 : isWide ? 14 : 8;
                          const rh = isSquare ? 10 : isWide ? 8 : 14;
                          const rx = (18 - rw) / 2;
                          const ry = (18 - rh) / 2;
                          const isSelected = aspectRatio === ratio;
                          return (
                            <button
                              key={ratio}
                              onClick={() => { setAspectRatio(ratio); setIsRatioOpen(false); }}
                              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors ${
                                isSelected ? 'bg-gray-100 font-semibold text-gray-900' : 'text-gray-600 hover:bg-gray-50'
                              }`}
                            >
                              <svg className="w-4 h-4 text-gray-500 shrink-0" viewBox="0 0 18 18" fill="none" stroke="currentColor">
                                <rect x={rx} y={ry} width={rw} height={rh} rx={1.5} strokeWidth={1.5} />
                              </svg>
                              <span className="flex-1 text-left">{ratio}</span>
                              {isSelected && (
                                <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>

                <div className="h-4 w-px bg-gray-200" />

                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-400">매수</span>
                  <div className="flex items-center bg-gray-100 rounded-lg">
                    <button
                      onClick={() => setImageCount(Math.max(1, imageCount - 1))}
                      disabled={imageCount <= 1}
                      className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-30 transition-colors"
                    >
                      −
                    </button>
                    <span className="text-xs font-medium text-gray-700 min-w-[28px] text-center">{imageCount}/4</span>
                    <button
                      onClick={() => setImageCount(Math.min(4, imageCount + 1))}
                      disabled={imageCount >= 4}
                      className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-30 transition-colors"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="h-4 w-px bg-gray-200" />

                <button
                  onClick={() => setColorTransferOpen(true)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    colorPalette && colorPalette.length > 0
                      ? 'bg-gray-800 text-white'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {colorPalette && colorPalette.length > 0 ? (
                    <>
                      <div className="flex -space-x-0.5">
                        {colorPalette.slice(0, 4).map((c, i) => (
                          <div key={i} className="w-2.5 h-2.5 rounded-full border border-white/50" style={{ backgroundColor: c }} />
                        ))}
                      </div>
                      <span>색감</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                      </svg>
                      <span>색감</span>
                    </>
                  )}
                </button>
              </div>

            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleTransform}
                disabled={!prompt.trim() || isTransforming}
                loading={isTransforming}
                variant="primary"
                className="flex-1 py-2.5 text-sm"
              >
                {isTransforming ? '⏳ 처리 중...' : '🎨 생성하기'}
              </Button>
              <Button
                onClick={handleReset}
                disabled={isTransforming}
                variant="secondary"
                className="px-5 py-2.5 text-sm"
              >
                🔄 초기화
              </Button>
            </div>
          </div>

          <div className="flex flex-col">
            <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm flex flex-col min-h-[400px] sticky top-0">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-gray-800">결과</h2>
                  {transformedImages.length > 1 && (
                    <span className="text-xs text-gray-400">{selectedResultIndex + 1}/{transformedImages.length}장</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {imageHistory.length > 0 && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          // Load previous generation set
                          const prevSet = imageHistory[0];
                          const newHistory = imageHistory.slice(1);
                          if (transformedImages.length > 0) {
                            newHistory.push(transformedImages);
                          }
                          setImageHistory(newHistory);
                          setTransformedImages(prevSet);
                          setSelectedResultIndex(0);
                        }}
                        className="px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-100 rounded"
                        title="이전 생성 결과"
                      >
                        ◀ 이전
                      </button>
                      <span className="text-xs text-gray-400">히스토리 {imageHistory.length}개</span>
                      <button
                        onClick={() => {
                          // Load next (last) generation set from history
                          const nextSet = imageHistory[imageHistory.length - 1];
                          const newHistory = imageHistory.slice(0, -1);
                          if (transformedImages.length > 0) {
                            newHistory.unshift(transformedImages);
                          }
                          setImageHistory(newHistory);
                          setTransformedImages(nextSet);
                          setSelectedResultIndex(0);
                        }}
                        className="px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-100 rounded"
                        title="다음 생성 결과"
                      >
                        다음 ▶
                      </button>
                    </div>
                  )}
                  {isTransforming && (
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-200 border-t-gray-600"></div>
                  )}
                </div>
              </div>

              <div className="flex-1 flex flex-col">
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-xs text-red-700">{error}</p>
                  </div>
                )}

                {transformedImages.length === 0 && !error && (
                  <div className="flex flex-col items-center justify-center flex-1 bg-gray-50 rounded-lg border border-dashed border-gray-200 py-16">
                    <span className="text-4xl mb-2">🎨</span>
                    <p className="text-gray-400 text-sm">프롬프트를 입력하고 생성해보세요</p>
                  </div>
                )}

                {transformedImages.length > 0 && (
                  <div className="flex gap-3">
                    {/* Thumbnails (only show when multiple images) */}
                    {transformedImages.length > 1 && (
                      <div className="flex flex-col gap-2 flex-shrink-0">
                        {transformedImages.map((image, index) => (
                          <div
                            key={index}
                            onClick={() => setSelectedResultIndex(index)}
                            className={`relative w-16 h-16 rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${
                              selectedResultIndex === index
                                ? 'border-gray-800 shadow-md scale-105'
                                : 'border-gray-200 hover:border-gray-400'
                            }`}
                          >
                            <img
                              src={image}
                              alt={`Result ${index + 1}`}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] text-center py-0.5">
                              {index + 1}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Main preview */}
                    <div className="flex-1 flex flex-col">
                      <div
                        className="relative cursor-pointer group max-w-full max-h-[500px] flex items-center justify-center"
                        onClick={() => openImageModal(transformedImages[selectedResultIndex])}
                      >
                        <img
                          src={transformedImages[selectedResultIndex]}
                          alt={`Result ${selectedResultIndex + 1}`}
                          className="max-w-full max-h-[500px] object-contain rounded-lg"
                        />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
                          <span className="text-white text-sm">클릭하여 확대</span>
                        </div>
                      </div>

                      {/* Post-processing actions */}
                      <div className="mt-3 flex justify-center">
                        <div className="inline-flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                          {([
                            { id: 'upscale', icon: '↗', label: 'Upscale' },
                            { id: 'enhance', icon: '✦', label: 'Enhance', prompt: 'ONLY modify the skin texture in this image — do NOT change anything else. The composition, pose, face shape, expression, hair, clothing, background, lighting, and colors must remain EXACTLY identical pixel-for-pixel. ONLY apply these changes to skin areas: add realistic skin pores, fine lines, subtle wrinkles, and natural micro-imperfections. Replace the smooth/airbrushed/plastic AI look on skin with authentic photographic skin texture. Add natural skin details like tiny moles, subtle redness variation, and visible pore structure. Every non-skin element must be completely untouched.' },
                            { id: 'relight', icon: '☀', label: 'Relight' },
                            { id: 'inpaint', icon: '✎', label: 'Inpaint' },
                            { id: 'angles', icon: '📐', label: 'Angles' },
                          ] as { id: string; icon: string; label: string; prompt?: string }[]).map((action) => (
                            <button
                              key={action.id}
                              disabled={isTransforming}
                              onClick={async () => {
                                // Relight opens modal
                                if (action.id === 'relight') {
                                  setRelightOpen(true);
                                  return;
                                }
                                // Inpaint opens modal
                                if (action.id === 'inpaint') {
                                  setInpaintOpen(true);
                                  return;
                                }
                                // Angles opens modal
                                if (action.id === 'angles') {
                                  setAnglesOpen(true);
                                  return;
                                }
                                setIsTransforming(true);
                                setError(null);
                                try {
                                  const currentImage = transformedImages[selectedResultIndex];
                                  let result: string;
                                  if (action.id === 'upscale') {
                                    result = await generateImage(
                                      'Reproduce this exact image with maximum fidelity. Keep every detail, color, composition, and style identical.',
                                      { aspectRatio, referenceImage: currentImage, overrideResolution: '4K', overrideModel: 'gemini-3.1-flash-image-preview' }
                                    );
                                  } else {
                                    result = await generateImage(action.prompt!, {
                                      aspectRatio,
                                      referenceImage: currentImage
                                    });
                                  }
                                  if (result) {
                                    setImageHistory(prev => [transformedImages, ...prev]);
                                    setTransformedImages([result]);
                                    setSelectedResultIndex(0);
                                  }
                                } catch (err) {
                                  console.error('후처리 오류:', err);
                                  setError(err instanceof Error ? err.message : '후처리 중 오류가 발생했습니다.');
                                } finally {
                                  setIsTransforming(false);
                                }
                              }}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium text-gray-600 hover:bg-white hover:shadow-sm transition-all disabled:opacity-40"
                            >
                              <span className="text-sm">{action.icon}</span>
                              {action.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Save button below result card */}
            {transformedImages.length > 0 && (
              <div className="flex justify-center mt-2">
                <button
                  onClick={async () => {
                    try {
                      const filename = `gemini-${mode}-${Date.now()}.png`;
                      const filePath = await window.electronAPI.saveImage(
                        transformedImages[selectedResultIndex], filename
                      );
                      if (filePath) {
                        setSaveDialogState({ isOpen: true, filePath });
                      }
                    } catch {
                      alert('이미지 저장 중 오류가 발생했습니다.');
                    }
                  }}
                  className="px-6 py-1.5 text-xs text-gray-500 hover:text-gray-700 bg-white hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors shadow-sm"
                >
                  저장
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {/* Image Markup Modal */}
      <ImageMarkupModal
        isOpen={markupModal.isOpen}
        imageUrl={markupModal.imageUrl}
        originalImageUrl={originalImagesRef.current.get(markupModal.index)}
        onClose={() => setMarkupModal({ isOpen: false, index: -1, imageUrl: '' })}
        onSave={(markedDataUrl) => {
          const idx = markupModal.index;
          // Update preview
          setImagePreviews(prev => prev.map((p, i) => i === idx ? markedDataUrl : p));
          // Update file (convert dataUrl to File)
          fetch(markedDataUrl).then(r => r.blob()).then(blob => {
            const file = new File([blob], `marked-${Date.now()}.png`, { type: 'image/png' });
            setSelectedImages(prev => prev.map((f, i) => i === idx ? file : f));
          });
          setMarkupModal({ isOpen: false, index: -1, imageUrl: '' });
        }}
      />

      {/* Image Paste Dialog */}
      <ImagePasteDialog
        isOpen={pasteDialogOpen}
        onClose={() => setPasteDialogOpen(false)}
        onImagePaste={handleImageFromDialog}
      />

      {/* Save Success Dialog */}
      <RelightModal
        isOpen={relightOpen}
        imageUrl={transformedImages[selectedResultIndex] || ''}
        onClose={() => setRelightOpen(false)}
        isProcessing={isTransforming}
        onApply={async (relightPrompt) => {
          setIsTransforming(true);
          setError(null);
          try {
            const currentImage = transformedImages[selectedResultIndex];
            const result = await generateImage(relightPrompt, {
              aspectRatio,
              referenceImage: currentImage
            });
            if (result) {
              setImageHistory(prev => [transformedImages, ...prev]);
              setTransformedImages([result]);
              setSelectedResultIndex(0);
            }
            setRelightOpen(false);
          } catch (err) {
            console.error('Relight 오류:', err);
            setError(err instanceof Error ? err.message : 'Relight 처리 중 오류가 발생했습니다.');
          } finally {
            setIsTransforming(false);
          }
        }}
      />

      <InpaintModal
        isOpen={inpaintOpen}
        imageUrl={transformedImages[selectedResultIndex] || ''}
        onClose={() => setInpaintOpen(false)}
        isProcessing={isTransforming}
        onApply={async (inpaintPrompt, originalDataUrl, maskedDataUrl, refImage) => {
          setIsTransforming(true);
          setError(null);
          try {
            // Image 1: clean original, Image 2: same image with yellow-green mask overlay, Image 3: reference (optional)
            const referenceImages = [originalDataUrl, maskedDataUrl];
            if (refImage) referenceImages.push(refImage);
            const userPrompt = inpaintPrompt.trim()
              ? inpaintPrompt
              : (refImage
                ? 'Replace the highlighted area with what is shown in the reference image, naturally blending it into the scene.'
                : 'Naturally remove or clean up the highlighted area, filling it seamlessly with the surrounding context.');
            const fullPrompt = `The first image is the original photo. The second image is a black-and-white mask where WHITE areas indicate the regions to edit and BLACK areas must remain unchanged. ${userPrompt}. ONLY modify the white masked regions. Keep all black masked areas exactly as they are in the original.${refImage ? ' The third image is a reference — use it as visual guidance for what to place in the masked area.' : ''}`;
            const result = await generateImage(fullPrompt, {
              aspectRatio,
              referenceImages
            });
            if (result) {
              setImageHistory(prev => [transformedImages, ...prev]);
              setTransformedImages([result]);
              setSelectedResultIndex(0);
            }
            setInpaintOpen(false);
          } catch (err) {
            console.error('Inpaint 오류:', err);
            setError(err instanceof Error ? err.message : 'Inpaint 처리 중 오류가 발생했습니다.');
          } finally {
            setIsTransforming(false);
          }
        }}
      />

      <AnglesModal
        isOpen={anglesOpen}
        imageUrl={transformedImages[selectedResultIndex] || ''}
        onClose={() => setAnglesOpen(false)}
        isProcessing={isTransforming}
        onApply={async (anglesPrompt) => {
          setIsTransforming(true);
          setError(null);
          try {
            const currentImage = transformedImages[selectedResultIndex];
            const result = await generateImage(anglesPrompt, {
              aspectRatio,
              referenceImage: currentImage
            });
            if (result) {
              setImageHistory(prev => [transformedImages, ...prev]);
              setTransformedImages([result]);
              setSelectedResultIndex(0);
            }
            setAnglesOpen(false);
          } catch (err) {
            console.error('Angles 오류:', err);
            setError(err instanceof Error ? err.message : 'Angles 처리 중 오류가 발생했습니다.');
          } finally {
            setIsTransforming(false);
          }
        }}
      />

      <ColorTransferModal
        isOpen={colorTransferOpen}
        onClose={() => setColorTransferOpen(false)}
        onApply={(palette) => setColorPalette(palette.length > 0 ? palette : null)}
        currentPalette={colorPalette}
      />

      <SaveSuccessDialog
        isOpen={saveDialogState.isOpen}
        filePath={saveDialogState.filePath}
        onClose={() => setSaveDialogState({ isOpen: false, filePath: null })}
        onShowInFolder={async () => {
          if (saveDialogState.filePath) {
            await window.electronAPI.showItemInFolder(saveDialogState.filePath);
          }
        }}
      />

      {imageModal.isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-90 flex flex-col items-center justify-center z-[1000] p-5"
          onClick={imageModal.isCropping ? undefined : closeImageModal}
        >
          <div
            className="max-w-[90vw] max-h-[90vh] relative flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative mb-5 flex justify-center items-center min-h-[60vh]">
              {imageModal.isCropping ? (
                <ReactCrop
                  crop={crop}
                  onChange={(c) => setCrop(c)}
                  onComplete={(c) => setCompletedCrop(c)}
                  className="max-w-[80vw] max-h-[70vh]"
                >
                  <img
                    ref={imgRef}
                    src={imageModal.imageUrl}
                    alt="크롭할 이미지"
                    className="max-w-full max-h-[70vh] object-contain"
                  />
                </ReactCrop>
              ) : (
                <img
                  src={imageModal.imageUrl}
                  alt="이미지 자세히 보기"
                  className="max-w-[80vw] max-h-[70vh] object-contain rounded-lg block"
                />
              )}
            </div>

            <button
              onClick={closeImageModal}
              className="absolute top-2.5 right-2.5 bg-black bg-opacity-70 text-white border-none rounded-full w-10 h-10 text-xl cursor-pointer z-10 hover:bg-opacity-90 transition-opacity"
            >
              ✕
            </button>

            <div className="flex gap-3 justify-center mt-4 z-10">
              {imageModal.isCropping ? (
                <>
                  <button
                    onClick={handleCompleteCrop}
                    className="bg-green-600 text-white border-none rounded-lg px-4 py-2 text-sm font-medium cursor-pointer transition-colors duration-200 hover:bg-green-700"
                    disabled={!completedCrop}
                  >
                    ✂️ 자르기 완료
                  </button>
                  <button
                    onClick={() => {
                      setImageModal(prev => ({ ...prev, isCropping: false }));
                      setCrop(undefined);
                      setCompletedCrop(null);
                    }}
                    className="bg-gray-600 text-white border-none rounded-lg px-4 py-2 text-sm font-medium cursor-pointer transition-colors duration-200 hover:bg-gray-700"
                  >
                    취소
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setImageModal(prev => ({ ...prev, isCropping: true }))}
                    className="bg-purple-600 text-white border-none rounded-lg px-4 py-2 text-sm font-medium cursor-pointer transition-colors duration-200 hover:bg-purple-700"
                  >
                    ✂️ 자르기
                  </button>
                  <button
                    onClick={() => transformResultImage('flipH')}
                    className="bg-gray-600 text-white border-none rounded-lg px-4 py-2 text-sm font-medium cursor-pointer transition-colors duration-200 hover:bg-gray-700"
                  >
                    ⇔ 좌우
                  </button>
                  <button
                    onClick={() => transformResultImage('flipV')}
                    className="bg-gray-600 text-white border-none rounded-lg px-4 py-2 text-sm font-medium cursor-pointer transition-colors duration-200 hover:bg-gray-700"
                  >
                    ⇕ 상하
                  </button>
                  <button
                    onClick={() => transformResultImage('rotateCW')}
                    className="bg-gray-600 text-white border-none rounded-lg px-4 py-2 text-sm font-medium cursor-pointer transition-colors duration-200 hover:bg-gray-700"
                  >
                    ↻ 회전
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        const filename = `gemini-${mode}-${Date.now()}.png`;
                        const filePath = await window.electronAPI.saveImage(imageModal.imageUrl, filename);

                        if (filePath) {
                          // Show save success dialog
                          setSaveDialogState({
                            isOpen: true,
                            filePath: filePath
                          });
                        }
                      } catch (error) {
                        // 저장 실패 알림 - 간단한 alert 사용
                        alert('이미지 저장 중 오류가 발생했습니다.');
                        console.error('이미지 저장 실패:', error);
                      }
                    }}
                    className="bg-blue-600 text-white border-none rounded-lg px-4 py-2 text-sm font-medium cursor-pointer transition-colors duration-200 hover:bg-blue-700"
                  >
                    💾 저장
                  </button>
                  <button
                    onClick={() => {
                      const currentImageUrl = imageModal.imageUrl;

                      // Remove from current set
                      const newTransformedImages = transformedImages.filter(img => img !== currentImageUrl);
                      setTransformedImages(newTransformedImages);

                      // Remove from history sets (filter out empty sets)
                      const newImageHistory = imageHistory
                        .map(set => set.filter(img => img !== currentImageUrl))
                        .filter(set => set.length > 0);
                      setImageHistory(newImageHistory);

                      if (newTransformedImages.length > 0) {
                        setSelectedResultIndex(0);
                        setImageModal({ isOpen: true, imageUrl: newTransformedImages[0], isCropping: false });
                      } else if (newImageHistory.length > 0) {
                        const nextSet = newImageHistory[0];
                        setTransformedImages(nextSet);
                        setImageHistory(newImageHistory.slice(1));
                        setSelectedResultIndex(0);
                        setImageModal({ isOpen: true, imageUrl: nextSet[0], isCropping: false });
                      } else {
                        closeImageModal();
                      }
                    }}
                    className="bg-red-600 text-white border-none rounded-lg px-4 py-2 text-sm font-medium cursor-pointer transition-colors duration-200 hover:bg-red-700"
                  >
                    이 이미지 삭제
                  </button>
                </>
              )}
            </div>

            {!imageModal.isCropping && (() => {
              const allImages = [...transformedImages, ...imageHistory.flat()];

              return allImages.length > 1 && (
                <div className="bg-black bg-opacity-75 rounded-lg p-3 mt-4 w-full max-w-[85vw]">
                  <div className="text-white text-sm mb-2 text-center">
                    이미지 갤러리 ({allImages.length}개)
                  </div>
                  <div
                    className="flex gap-2 overflow-x-auto pb-2 px-1"
                    style={{ scrollbarWidth: 'thin', scrollbarColor: '#666 #333' }}
                  >
                    {allImages.map((imageUrl, index) => (
                      <div
                        key={index}
                        className={`relative flex-shrink-0 cursor-pointer rounded-lg overflow-hidden border-2 transition-all duration-200 ${
                          imageUrl === imageModal.imageUrl
                            ? 'border-gray-100 scale-105 shadow-md'
                            : 'border-gray-500 scale-100 hover:border-gray-400'
                        }`}
                        onClick={() => {
                          // Just switch the displayed image, don't rearrange
                          setImageModal(prev => ({ ...prev, imageUrl }));
                        }}
                      >
                        <img
                          src={imageUrl}
                          alt={`버전 ${index + 1}`}
                          className="w-16 h-16 object-cover"
                        />
                        {imageUrl === imageModal.imageUrl && (
                          <div className="absolute inset-0 bg-white bg-opacity-20 flex items-center justify-center">
                            <div className="bg-gray-800 text-white text-[10px] px-1.5 py-0.5 rounded">
                              현재
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageConverter;