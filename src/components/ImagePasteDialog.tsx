import React, { useState } from 'react';

interface ImagePasteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImagePaste: (imageUrl: string | File) => void;
}

const ImagePasteDialog: React.FC<ImagePasteDialogProps> = ({ isOpen, onClose, onImagePaste }) => {
  const [url, setUrl] = useState('');

  const handleConfirm = () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;

    // URL 형식 검사
    if (trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://')) {
      onImagePaste(trimmedUrl);
      setUrl('');
      onClose();
    } else {
      alert('유효한 이미지 URL을 입력해주세요.');
    }
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLInputElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    // 클립보드에서 이미지 데이터 찾기
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        e.preventDefault(); // 기본 붙여넣기 동작 방지
        const blob = item.getAsFile();
        if (blob) {
          const file = new File([blob], `clipboard-image-${Date.now()}.png`, { type: blob.type });
          onImagePaste(file);
          setUrl('');
          onClose();
        }
        return;
      }
    }
    // 이미지가 없으면 기본 텍스트 붙여넣기 (URL)
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[1002]">
      <div className="bg-white rounded-xl p-8 max-w-[600px] w-[90%]">
        <h3 className="text-xl font-bold mb-4 text-gray-800">
          📋 이미지 붙여넣기
        </h3>
        <p className="text-sm text-gray-500 mb-6">
          💡 <strong>두 가지 방법으로 사용 가능:</strong><br/>
          1️⃣ 스크린샷 캡처 후 Ctrl+V로 붙여넣기<br/>
          2️⃣ 이미지 우클릭 → "이미지 주소 복사" → Ctrl+V로 URL 붙여넣기
        </p>

        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/image.jpg 또는 Ctrl+V로 이미지 붙여넣기"
          autoFocus
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              handleConfirm();
            }
          }}
          onPaste={handlePaste}
          className="w-full px-4 py-3 text-sm border-2 border-gray-200 rounded-lg mb-6 outline-none transition-colors duration-200 focus:border-purple-500"
        />

        <div className="flex gap-3 justify-end">
          <button
            onClick={() => {
              setUrl('');
              onClose();
            }}
            className="px-5 py-2.5 bg-gray-500 text-white border-none rounded-lg text-sm font-semibold cursor-pointer transition-colors duration-200 hover:bg-gray-600"
          >
            취소
          </button>
          <button
            onClick={handleConfirm}
            className="px-5 py-2.5 bg-purple-500 text-white border-none rounded-lg text-sm font-semibold cursor-pointer transition-colors duration-200 hover:bg-purple-600"
          >
            ✅ 확인
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImagePasteDialog;