import React from 'react';

interface SaveSuccessDialogProps {
  isOpen: boolean;
  filePath: string | null;
  onClose: () => void;
  onShowInFolder?: () => void;
}

const SaveSuccessDialog: React.FC<SaveSuccessDialogProps> = ({
  isOpen,
  filePath,
  onClose,
  onShowInFolder
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[2000] backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl transform transition-all duration-300 scale-100 max-w-md w-[90%]">
        {/* Success animation container */}
        <div className="pt-6 pb-4 px-6">
          <div className="w-20 h-20 mx-auto bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center shadow-lg animate-bounce">
            <span className="text-white text-3xl">✓</span>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 pb-4 text-center">
          <h3 className="text-xl font-bold text-gray-800 mb-2">
            저장 완료!
          </h3>
          <p className="text-gray-600 text-sm mb-1">
            이미지가 성공적으로 저장되었습니다
          </p>
          {filePath && (
            <p className="text-xs text-gray-500 break-all px-4 py-2 bg-gray-50 rounded-lg mt-3">
              {filePath}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex gap-3">
          {onShowInFolder && (
            <button
              onClick={() => {
                onShowInFolder();
                onClose();
              }}
              className="flex-1 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-medium rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all duration-200 shadow-md hover:shadow-lg flex items-center justify-center gap-2"
            >
              <span>📁</span>
              <span>폴더 열기</span>
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-all duration-200"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};

export default SaveSuccessDialog;