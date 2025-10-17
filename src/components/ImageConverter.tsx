import React, { useState, useCallback, useEffect, useRef } from 'react';
import Button from './Button';
import ImagePasteDialog from './ImagePasteDialog';
import SaveSuccessDialog from './SaveSuccessDialog';
import { generateImage } from '../services/gemini';
import ReactCrop, { Crop, PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

type ImageMode = 'text-to-image' | 'edit-image' | 'multi-image-composition' | 'style-transfer';
type AspectRatio = 'original' | '1:1' | '3:4' | '4:3' | '9:16' | '16:9' | '21:9';

interface ModeState {
  selectedImages: File[];
  imagePreviews: string[];
  prompt: string;
  aspectRatio: AspectRatio;
  transformedImages: string[];
  imageHistory: string[];
}

interface ImageConverterProps {
  onSettingsOpen?: () => void;
}

const ImageConverter: React.FC<ImageConverterProps> = ({ onSettingsOpen }) => {
  const [mode, setMode] = useState<ImageMode>('text-to-image');

  const [modeStates, setModeStates] = useState<Record<ImageMode, ModeState>>({
    'text-to-image': {
      selectedImages: [],
      imagePreviews: [],
      prompt: '',
      aspectRatio: '1:1',
      transformedImages: [],
      imageHistory: []
    },
    'edit-image': {
      selectedImages: [],
      imagePreviews: [],
      prompt: '',
      aspectRatio: 'original',
      transformedImages: [],
      imageHistory: []
    },
    'multi-image-composition': {
      selectedImages: [],
      imagePreviews: [],
      prompt: '',
      aspectRatio: 'original',
      transformedImages: [],
      imageHistory: []
    },
    'style-transfer': {
      selectedImages: [],
      imagePreviews: [],
      prompt: '',
      aspectRatio: 'original',
      transformedImages: [],
      imageHistory: []
    }
  });

  const currentState = modeStates[mode];
  const [selectedImages, setSelectedImages] = useState<File[]>(currentState.selectedImages);
  const [imagePreviews, setImagePreviews] = useState<string[]>(currentState.imagePreviews);
  const [prompt, setPrompt] = useState(currentState.prompt);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(currentState.aspectRatio);
  const [transformedImages, setTransformedImages] = useState<string[]>(currentState.transformedImages);
  const [imageHistory, setImageHistory] = useState<string[]>(currentState.imageHistory);
  const [imageStyle, setImageStyle] = useState<'photographic' | 'illustration' | 'minimalist' | 'natural'>('photographic');

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

  // Save dialog state
  const [saveDialogState, setSaveDialogState] = useState<{
    isOpen: boolean;
    filePath: string | null;
  }>({
    isOpen: false,
    filePath: null
  });

  // Crop states
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const getMaxImages = () => {
    switch (mode) {
      case 'text-to-image':
        return 0;
      case 'edit-image':
        return 1;
      case 'style-transfer':
        return 2;
      case 'multi-image-composition':
        return 3;
      default:
        return 1;
    }
  };

  const handleImageSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const maxImages = getMaxImages();

    if (maxImages === 0) return;

    const remainingSlots = maxImages - selectedImages.length;

    if (remainingSlots <= 0) {
      setError(`최대 ${maxImages}개까지만 선택 가능합니다.`);
      return;
    }

    const newFiles = files.slice(0, remainingSlots);
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

    event.target.value = '';
  }, [selectedImages, mode]);

  const handleRemoveImage = useCallback((index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Handle image paste from dialog
  const handleImageFromDialog = useCallback(async (imageData: string | File) => {
    const maxImages = getMaxImages();

    if (maxImages === 0) return;

    const remainingSlots = maxImages - selectedImages.length;
    if (remainingSlots <= 0) {
      setError(`최대 ${maxImages}개까지만 선택 가능합니다.`);
      return;
    }

    if (imageData instanceof File) {
      // Handle File object from clipboard paste
      setSelectedImages(prev => [...prev, imageData]);

      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreviews(prev => [...prev, e.target?.result as string]);
      };
      reader.readAsDataURL(imageData);

      setError(null);
    } else if (typeof imageData === 'string') {
      // Handle URL string using Electron API to avoid CORS
      try {
        // Use Electron API to download the image
        const base64Data = await window.electronAPI.downloadImage(imageData);

        // Convert base64 to blob
        const base64Response = await fetch(base64Data);
        const blob = await base64Response.blob();
        const file = new File([blob], `url-image-${Date.now()}.png`, { type: blob.type });

        setSelectedImages(prev => [...prev, file]);
        setImagePreviews(prev => [...prev, base64Data]);
        setError(null);
      } catch (err) {
        console.error('URL 이미지 가져오기 실패:', err);
        setError('이미지 URL에서 이미지를 가져올 수 없습니다. 일부 사이트는 외부 접근을 제한합니다.');
      }
    }
  }, [selectedImages, mode]);

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

    if (mode === 'style-transfer' && selectedImages.length !== 2) {
      setError('스타일 전송은 정확히 2개의 이미지가 필요합니다.');
      return;
    }

    if (mode === 'multi-image-composition' && selectedImages.length < 2) {
      setError('다중 이미지 합성은 최소 2개 이상의 이미지가 필요합니다.');
      return;
    }

    if (!prompt.trim()) {
      setError('프롬프트를 입력해주세요.');
      return;
    }

    setIsTransforming(true);
    setError(null);

    try {
      let imageUrl: string;

      if (mode === 'text-to-image') {
        imageUrl = await generateImage(prompt, { aspectRatio, style: imageStyle });
      } else {
        let fullPrompt = prompt;

        if (mode === 'edit-image') {
          fullPrompt = `Edit this image: ${prompt}`;
        } else if (mode === 'multi-image-composition') {
          fullPrompt = `Create a new image by combining the elements from the provided images. ${prompt}`;
        } else if (mode === 'style-transfer') {
          fullPrompt = `Apply style transfer: ${prompt}`;
        }

        if (aspectRatio === 'original') {
          fullPrompt += '. Do not change the input aspect ratio.';
        }

        const imageOptions: any = {};
        if (aspectRatio !== 'original') {
          imageOptions.aspectRatio = aspectRatio;
        } else {
          imageOptions.aspectRatio = null;
        }

        if (mode === 'multi-image-composition') {
          const imageDataUrls = await Promise.all(
            selectedImages.map(file => fileToDataUrl(file))
          );
          imageOptions.referenceImages = imageDataUrls;
        } else {
          const referenceImage = await fileToDataUrl(selectedImages[0]);
          imageOptions.referenceImage = referenceImage;
        }

        imageUrl = await generateImage(fullPrompt, imageOptions);
      }

      if (imageUrl) {
        if (transformedImages.length > 0) {
          setImageHistory(prev => [...transformedImages, ...prev]);
        }
        setTransformedImages([imageUrl]);
      } else {
        setError('이미지 생성/변환에 실패했습니다.');
      }
    } catch (err) {
      console.error('이미지 처리 오류:', err);
      setError(err instanceof Error ? err.message : '이미지 처리 중 오류가 발생했습니다.');
    } finally {
      setIsTransforming(false);
    }
  }, [mode, selectedImages, prompt, aspectRatio, transformedImages, imageStyle]);

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
    setImageModal({
      isOpen: false,
      imageUrl: '',
      isCropping: false
    });
    setCrop(undefined);
    setCompletedCrop(null);
  }, []);

  const selectImageFromGallery = useCallback((imageUrl: string) => {
    if (transformedImages.length > 0) {
      setImageHistory(prev => [...transformedImages, ...prev]);
    }
    setTransformedImages([imageUrl]);
    setImageHistory(prev => prev.filter(url => url !== imageUrl));
    setImageModal(prev => ({ ...prev, imageUrl, isCropping: false }));
    setCrop(undefined);
    setCompletedCrop(null);
  }, [transformedImages]);

  const handleReset = useCallback(() => {
    setSelectedImages([]);
    setImagePreviews([]);
    setPrompt('');
    setTransformedImages([]);
    setError(null);
  }, []);

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
      setImageHistory(prev => [...transformedImages, ...prev]);
    }
    setTransformedImages([croppedImageUrl]);
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
          transformedImages,
          imageHistory
        }
      }));
    };

    return savePreviousModeState;
  }, [mode, selectedImages, imagePreviews, prompt, aspectRatio, transformedImages, imageHistory]);

  useEffect(() => {
    const newState = modeStates[mode];
    setSelectedImages(newState.selectedImages);
    setImagePreviews(newState.imagePreviews);
    setPrompt(newState.prompt);
    setAspectRatio(newState.aspectRatio);
    setTransformedImages(newState.transformedImages);
    setImageHistory(newState.imageHistory);
    setError(null);
  }, [mode]);

  const getModeDescription = () => {
    switch (mode) {
      case 'text-to-image':
        return '텍스트 설명으로 새로운 이미지를 생성합니다';
      case 'edit-image':
        return '기존 이미지를 편집합니다 (배경 변경, 객체 추가/제거 등)';
      case 'multi-image-composition':
        return '여러 이미지의 요소들을 합쳐 새로운 장면을 만듭니다';
      case 'style-transfer':
        return '1번 이미지의 스타일을 2번 이미지에 적용합니다';
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
          '사람 제거',
          '배경 흐리게',
          '색상을 따뜻하게'
        ];
      case 'multi-image-composition':
        return [
          '1번 이미지의 사람을 2번 이미지의 배경에 배치',
          '1번 이미지의 고양이를 2번 이미지의 소파 위에',
          '1번 이미지의 드레스를 2번 이미지의 모델이 입게',
          '1번 이미지의 자동차를 2번 이미지의 도로에'
        ];
      case 'style-transfer':
        return [
          '1번 이미지의 수채화 스타일로 2번 이미지를 그려줘',
          '1번 이미지의 따뜻한 색감을 2번 이미지에 적용',
          '1번 이미지의 패턴을 2번 이미지 옷에 입혀줘',
          '1번 이미지의 화풍으로 2번 이미지를 변환'
        ];
      default:
        return [];
    }
  };

  const maxImages = getMaxImages();

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-gradient-to-r from-purple-500 via-purple-600 to-pink-600 text-white p-6 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-4xl">🎨</span>
            <div>
              <h1 className="text-3xl font-bold">AI 이미지 변환</h1>
              <p className="text-white/90 text-sm mt-1">Gemini로 이미지 생성, 편집, 합성, 스타일 전송</p>
            </div>
          </div>
          {onSettingsOpen && (
            <button
              onClick={onSettingsOpen}
              className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors duration-200 flex items-center gap-2 backdrop-blur-sm"
            >
              <span>⚙️</span>
              <span>API 설정</span>
            </button>
          )}
        </div>

        <div className="flex gap-2 mb-3">
          {[
            { id: 'text-to-image' as ImageMode, icon: '✍️', label: '텍스트→이미지' },
            { id: 'edit-image' as ImageMode, icon: '✏️', label: '이미지 편집' },
            { id: 'multi-image-composition' as ImageMode, icon: '🖼️', label: '다중 합성' },
            { id: 'style-transfer' as ImageMode, icon: '🎭', label: '스타일 전송' }
          ].map((modeOption) => (
            <button
              key={modeOption.id}
              onClick={() => setMode(modeOption.id)}
              className={`px-6 py-2.5 rounded-xl font-medium transition-all ${
                mode === modeOption.id
                  ? 'bg-white text-purple-600 shadow-lg'
                  : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              {modeOption.icon} {modeOption.label}
            </button>
          ))}
        </div>

        <div className="bg-white/10 rounded-lg px-4 py-2 text-white/90 text-sm">
          {getModeDescription()}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            {mode !== 'text-to-image' && (
              <div className="bg-white rounded-2xl shadow-lg p-4 border border-gray-200">
                <h2 className="text-base font-semibold text-gray-800 mb-2 flex items-center space-x-2">
                  <span>📤</span>
                  <span>이미지 업로드 {maxImages > 0 && `(${selectedImages.length}/${maxImages})`}</span>
                </h2>

                <div className="space-y-3">
                  <input
                    type="file"
                    accept="image/*"
                    multiple={maxImages > 1}
                    onChange={handleImageSelect}
                    className="hidden"
                    id="image-upload"
                  />
                  <div className="flex gap-2">
                    <label
                      htmlFor="image-upload"
                      className="flex-1 flex items-center justify-center h-16 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-all duration-200"
                    >
                      <div className="flex items-center space-x-2">
                        <span className="text-2xl">🖼️</span>
                        <span className="text-gray-600 font-medium text-sm">클릭하여 이미지 선택</span>
                      </div>
                    </label>
                    <button
                      onClick={() => setPasteDialogOpen(true)}
                      className="px-4 h-16 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 hover:bg-gray-100 transition-all duration-200 flex items-center gap-2"
                    >
                      <span className="text-2xl">📋</span>
                      <span className="text-gray-600 font-medium text-sm">붙여넣기</span>
                    </button>
                  </div>

                  {imagePreviews.length > 0 && (
                    <div className={`grid ${imagePreviews.length === 1 ? 'grid-cols-1' : imagePreviews.length === 2 ? 'grid-cols-2' : 'grid-cols-3'} gap-2`}>
                      {imagePreviews.map((preview, index) => (
                        <div key={index} className="relative group">
                          <img
                            src={preview}
                            alt={`Preview ${index + 1}`}
                            className={`w-full ${imagePreviews.length === 1 ? 'h-48' : 'h-32'} object-cover rounded-lg border-2 border-gray-200`}
                          />
                          <button
                            onClick={() => handleRemoveImage(index)}
                            className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                          >
                            ✕
                          </button>
                          {mode === 'style-transfer' && (
                            <div className="absolute bottom-1 left-1 bg-black bg-opacity-70 text-white text-xs px-2 py-1 rounded">
                              {index === 0 ? '스타일' : '콘텐츠'}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="bg-white rounded-2xl shadow-lg p-5 border border-gray-200">
              <h2 className="text-lg font-semibold text-gray-800 mb-3 flex items-center space-x-2">
                <span>✨</span>
                <span>프롬프트</span>
              </h2>

              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={getModeDescription()}
                className="w-full h-28 px-4 py-3 border-2 border-gray-200 rounded-xl resize-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition-all duration-200 text-sm"
              />

              <div className="mt-3 space-y-2">
                <p className="text-xs text-gray-600 font-semibold">💡 프롬프트 예시:</p>
                <div className="flex flex-wrap gap-1.5">
                  {getPromptExamples().slice(0, 4).map((example) => (
                    <button
                      key={example}
                      onClick={() => setPrompt(example)}
                      className="px-2.5 py-1 bg-purple-50 text-purple-700 text-xs rounded-lg hover:bg-purple-100 transition-colors duration-200"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-xs text-gray-600 font-semibold mb-2">📐 비율 선택:</p>
                <div className="grid grid-cols-7 gap-1.5">
                  {mode !== 'text-to-image' && (
                    <button
                      onClick={() => setAspectRatio('original')}
                      className={`py-1.5 px-2 rounded-md text-xs font-medium border-2 transition-all duration-200 ${
                        aspectRatio === 'original'
                          ? 'border-purple-500 bg-purple-50 text-purple-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-purple-300'
                      }`}
                    >
                      원본
                    </button>
                  )}
                  {(['1:1', '3:4', '4:3', '9:16', '16:9', '21:9'] as AspectRatio[]).map((ratio) => (
                    <button
                      key={ratio}
                      onClick={() => setAspectRatio(ratio)}
                      className={`py-1.5 px-2 rounded-md text-xs font-medium border-2 transition-all duration-200 ${
                        aspectRatio === ratio
                          ? 'border-purple-500 bg-purple-50 text-purple-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-purple-300'
                      }`}
                    >
                      {ratio}
                    </button>
                  ))}
                </div>
              </div>

              {/* 스타일 선택 UI - 텍스트→이미지 모드에서만 표시 */}
              {mode === 'text-to-image' && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <p className="text-xs text-gray-600 font-semibold mb-2">🎨 스타일 선택:</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setImageStyle('photographic')}
                      className={`py-2 px-3 rounded-lg text-xs font-medium border-2 transition-all duration-200 flex items-center gap-2 ${
                        imageStyle === 'photographic'
                          ? 'border-purple-500 bg-purple-50 text-purple-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-purple-300'
                      }`}
                    >
                      <span>📸</span>
                      <span>사실적 사진</span>
                    </button>
                    <button
                      onClick={() => setImageStyle('illustration')}
                      className={`py-2 px-3 rounded-lg text-xs font-medium border-2 transition-all duration-200 flex items-center gap-2 ${
                        imageStyle === 'illustration'
                          ? 'border-purple-500 bg-purple-50 text-purple-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-purple-300'
                      }`}
                    >
                      <span>🖌️</span>
                      <span>일러스트레이션</span>
                    </button>
                    <button
                      onClick={() => setImageStyle('minimalist')}
                      className={`py-2 px-3 rounded-lg text-xs font-medium border-2 transition-all duration-200 flex items-center gap-2 ${
                        imageStyle === 'minimalist'
                          ? 'border-purple-500 bg-purple-50 text-purple-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-purple-300'
                      }`}
                    >
                      <span>⚪</span>
                      <span>미니멀리스트</span>
                    </button>
                    <button
                      onClick={() => setImageStyle('natural')}
                      className={`py-2 px-3 rounded-lg text-xs font-medium border-2 transition-all duration-200 flex items-center gap-2 ${
                        imageStyle === 'natural'
                          ? 'border-purple-500 bg-purple-50 text-purple-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-purple-300'
                      }`}
                    >
                      <span>🌿</span>
                      <span>자연스럽고 캐주얼</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex space-x-4">
              <Button
                onClick={handleTransform}
                disabled={!prompt.trim() || isTransforming}
                loading={isTransforming}
                variant="primary"
                className="flex-1 py-3 text-base"
              >
                {isTransforming ? '처리 중...' : '🎨 생성/변환'}
              </Button>
              <Button
                onClick={handleReset}
                disabled={isTransforming}
                variant="secondary"
                className="px-6 py-3 text-base"
              >
                🔄 초기화
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-lg p-5 border border-gray-200 h-full flex flex-col">
              <h2 className="text-lg font-semibold text-gray-800 mb-3 flex items-center space-x-2">
                <span>🖼️</span>
                <span>결과</span>
                {isTransforming && (
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-purple-200 border-t-purple-600 ml-2"></div>
                )}
              </h2>

              <div className="flex-1 flex flex-col">
                {error && (
                  <div className="p-3 bg-red-50 border-2 border-red-200 rounded-xl">
                    <div className="flex items-start space-x-2">
                      <span className="text-xl">❌</span>
                      <div>
                        <h3 className="font-semibold text-red-800 mb-0.5 text-sm">오류 발생</h3>
                        <p className="text-xs text-red-700">{error}</p>
                      </div>
                    </div>
                  </div>
                )}

                {transformedImages.length === 0 && !error && (
                  <div className="flex flex-col items-center justify-center flex-1 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300">
                    <span className="text-5xl mb-3">✨</span>
                    <p className="text-gray-600 font-medium text-sm">결과가 여기에 표시됩니다</p>
                  </div>
                )}

                {transformedImages.map((image, index) => (
                  <div key={index} className="space-y-3 flex flex-col items-center">
                    <div
                      className="relative cursor-pointer group max-w-full max-h-[500px] flex items-center justify-center"
                      onClick={() => openImageModal(image)}
                    >
                      <img
                        src={image}
                        alt={`Result ${index + 1}`}
                        className="max-w-full max-h-[500px] object-contain rounded-xl shadow-lg"
                      />
                      <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-xl">
                        <div className="text-white text-center">
                          <div className="text-4xl mb-2">🔍</div>
                          <div className="text-sm font-medium">자세히 보기</div>
                        </div>
                      </div>
                    </div>

                    <div className="text-xs text-gray-600 text-center">
                      💾 갤러리: {imageHistory.length + 1}개
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Image Paste Dialog */}
      <ImagePasteDialog
        isOpen={pasteDialogOpen}
        onClose={() => setPasteDialogOpen(false)}
        onImagePaste={handleImageFromDialog}
      />

      {/* Save Success Dialog */}
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
                      // 현재 이미지를 transformedImages와 imageHistory에서 제거
                      const currentImageUrl = imageModal.imageUrl;

                      // transformedImages에서 제거
                      const newTransformedImages = transformedImages.filter(img => img !== currentImageUrl);
                      setTransformedImages(newTransformedImages);

                      // imageHistory에서 제거
                      const newImageHistory = imageHistory.filter(img => img !== currentImageUrl);
                      setImageHistory(newImageHistory);

                      // 다른 이미지가 있으면 첫 번째 이미지로 전환, 없으면 모달 닫기
                      if (newTransformedImages.length > 0) {
                        setImageModal({ isOpen: true, imageUrl: newTransformedImages[0], isCropping: false });
                      } else if (newImageHistory.length > 0) {
                        setImageModal({ isOpen: true, imageUrl: newImageHistory[0], isCropping: false });
                        setTransformedImages([newImageHistory[0]]);
                        setImageHistory(newImageHistory.slice(1));
                      } else {
                        closeImageModal();
                      }
                    }}
                    className="bg-red-600 text-white border-none rounded-lg px-4 py-2 text-sm font-medium cursor-pointer transition-colors duration-200 hover:bg-red-700"
                  >
                    🗑️ 이 이미지 삭제
                  </button>
                </>
              )}
            </div>

            {!imageModal.isCropping && (() => {
              const allImages = [imageModal.imageUrl, ...imageHistory.filter(url => url !== imageModal.imageUrl)];

              return allImages.length > 1 && (
                <div className="bg-black bg-opacity-75 rounded-lg p-4 max-w-screen-xl mt-4">
                  <div className="text-white text-sm mb-3 text-center">
                    📸 이미지 갤러리 ({allImages.length}개)
                  </div>
                  <div className="flex gap-2 overflow-x-auto justify-center pb-1">
                    {allImages.map((imageUrl, index) => (
                      <div
                        key={index}
                        className={`relative flex-shrink-0 cursor-pointer rounded-lg overflow-hidden border-2 transition-all duration-200 ${
                          imageUrl === imageModal.imageUrl
                            ? 'border-blue-500 scale-105 shadow-md'
                            : 'border-gray-500 scale-100 hover:border-gray-400'
                        }`}
                        onClick={() => selectImageFromGallery(imageUrl)}
                      >
                        <img
                          src={imageUrl}
                          alt={`버전 ${index + 1}`}
                          className="w-24 h-24 object-cover"
                        />
                        {imageUrl === imageModal.imageUrl && (
                          <div className="absolute inset-0 bg-blue-500 bg-opacity-20 flex items-center justify-center">
                            <div className="bg-blue-500 text-white text-xs px-2 py-1 rounded">
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