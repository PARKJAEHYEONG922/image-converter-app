import React, { useState, useEffect } from 'react';
import Button from './Button';
import { initializeGemini, setGeminiModel, setOutputResolution as setGeminiResolution } from '../services/gemini';
import type { GeminiModel, GeminiModelInfo, OutputResolution } from '../types/global';

interface ApiSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

interface TestStatus {
  testing: boolean;
  success: boolean;
  message: string;
}

const GEMINI_MODELS: GeminiModelInfo[] = [
  {
    id: 'gemini-2.5-flash-image',
    name: 'Gemini 2.5 Flash Image',
    description: '안정 버전 - 빠르고 효율적인 이미지 생성',
    tier: 'flash'
  },
  {
    id: 'gemini-3.1-flash-image-preview',
    name: 'Gemini 3.1 Flash Image',
    description: '최신 모델 - 고효율, 확장된 비율 지원, 고급 이미지 생성',
    tier: 'flash'
  }
];

const ApiSettings: React.FC<ApiSettingsProps> = ({ isOpen, onClose }) => {
  const [apiKey, setApiKey] = useState('');
  const [savedApiKey, setSavedApiKey] = useState('');
  const [selectedModel, setSelectedModel] = useState<GeminiModel>('gemini-2.5-flash-image');
  const [outputResolution, setOutputResolution] = useState<OutputResolution>('1k');
  const [testStatus, setTestStatus] = useState<TestStatus>({
    testing: false,
    success: false,
    message: ''
  });
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    try {
      const settings = await window.electronAPI.getApiSettings();
      if (settings.geminiApiKey) {
        setApiKey(settings.geminiApiKey);
        setSavedApiKey(settings.geminiApiKey);
        initializeGemini(settings.geminiApiKey);
      }
      if (settings.geminiModel) {
        setSelectedModel(settings.geminiModel);
        setGeminiModel(settings.geminiModel);
      }
      if (settings.outputResolution) {
        setOutputResolution(settings.outputResolution);
        setGeminiResolution(settings.outputResolution);
      }

    } catch (error) {
      console.error('설정 로드 실패:', error);
    }
  };

  const testAndApplyApiKey = async () => {
    if (!apiKey.trim()) {
      setTestStatus({ testing: false, success: false, message: 'API 키를 입력해주세요.' });
      return;
    }

    setTestStatus({ testing: true, success: false, message: 'API 테스트 중...' });

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey.trim()}`,
        { method: 'GET', headers: { 'Content-Type': 'application/json' } }
      );

      if (response.ok) {
        await window.electronAPI.saveApiSettings({
          geminiApiKey: apiKey.trim(),
          geminiModel: selectedModel,
          outputResolution: outputResolution,
        });
        initializeGemini(apiKey.trim());
        setGeminiModel(selectedModel);
        setGeminiResolution(outputResolution);
        setSavedApiKey(apiKey.trim());
        setTestStatus({ testing: false, success: true, message: 'API 키가 적용되었습니다.' });
        setTimeout(() => setTestStatus(prev => ({ ...prev, message: '' })), 3000);
      } else {
        const errorData = await response.json().catch(() => ({}));
        setTestStatus({
          testing: false, success: false,
          message: `API 키 확인 필요: ${errorData.error?.message || `HTTP ${response.status}`}`
        });
      }
    } catch {
      setTestStatus({ testing: false, success: false, message: '네트워크 오류가 발생했습니다.' });
    }
  };

  const deleteApiKey = async () => {
    try {
      await window.electronAPI.saveApiSettings({ geminiApiKey: '' });
      setApiKey('');
      setSavedApiKey('');
      setTestStatus({ testing: false, success: true, message: 'API 키가 삭제되었습니다.' });
      setTimeout(() => setTestStatus(prev => ({ ...prev, message: '' })), 3000);
    } catch {
      setTestStatus({ testing: false, success: false, message: 'API 키 삭제에 실패했습니다.' });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div
        className="bg-white rounded-xl w-[520px] max-h-[85vh] overflow-hidden shadow-2xl border border-gray-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-900">API 설정</h2>
            <p className="text-xs text-gray-400 mt-0.5">Gemini API 키와 모델을 설정합니다</p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            ✕
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(85vh-130px)] space-y-5">
          {/* Status bar */}
          <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-gray-400">상태</span>
              <span className={`font-medium ${savedApiKey ? 'text-green-600' : 'text-gray-400'}`}>
                {savedApiKey ? '연결됨' : '미설정'}
              </span>
            </div>
            <div className="h-3 w-px bg-gray-200" />
            <div className="flex items-center gap-1.5">
              <span className="text-gray-400">모델</span>
              <span className="font-medium text-gray-700">
                {selectedModel === 'gemini-3.1-flash-image-preview' ? '3.1 Flash' : '2.5 Flash'}
              </span>
            </div>
            {selectedModel === 'gemini-3.1-flash-image-preview' && (
              <>
                <div className="h-3 w-px bg-gray-200" />
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-400">해상도</span>
                  <span className="font-medium text-gray-700">{outputResolution}</span>
                </div>
              </>
            )}
          </div>

          {/* API Key */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-gray-400 focus:ring-1 focus:ring-gray-200 transition-all"
              placeholder="AIza..."
            />
          </div>

          {/* Model */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">모델</label>
            <div className="flex gap-2">
              {GEMINI_MODELS.map((model) => (
                <button
                  key={model.id}
                  onClick={() => setSelectedModel(model.id)}
                  className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all border ${
                    selectedModel === model.id
                      ? 'bg-gray-800 text-white border-gray-800'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {model.id === 'gemini-3.1-flash-image-preview' ? '3.1 Flash' : '2.5 Flash'}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              {GEMINI_MODELS.find(m => m.id === selectedModel)?.description}
            </p>
          </div>

          {/* Resolution (3.1 Flash only) */}
          {selectedModel === 'gemini-3.1-flash-image-preview' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">출력 해상도</label>
              <div className="flex gap-1.5">
                {(['0.5k', '1k', '2k', '4k'] as OutputResolution[]).map((res) => (
                  <button
                    key={res}
                    onClick={() => setOutputResolution(res)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                      outputResolution === res
                        ? 'bg-gray-800 text-white border-gray-800'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {res}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">해상도가 높을수록 생성 시간이 증가합니다</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={deleteApiKey}
              disabled={testStatus.testing || !apiKey}
              className="px-3 py-2 text-xs text-red-500 bg-red-50 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-40"
            >
              삭제
            </button>
            <Button
              onClick={testAndApplyApiKey}
              disabled={!apiKey || testStatus.testing}
              loading={testStatus.testing}
              variant={testStatus.success ? "success" : "primary"}
              size="sm"
              className="flex-1"
            >
              {testStatus.testing ? '테스트 중...' : testStatus.success ? '적용 완료' : '테스트 및 적용'}
            </Button>
          </div>

          {/* Status message */}
          {testStatus.message && (
            <div className={`p-3 rounded-lg text-xs font-medium ${
              testStatus.success
                ? 'bg-green-50 text-green-700 border border-green-200'
                : testStatus.testing
                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {testStatus.message}
            </div>
          )}

          {/* Cost Info */}
          <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
            <p className="text-xs font-medium text-gray-600 mb-1.5">비용 정보</p>
            <div className="text-xs text-gray-500 space-y-0.5">
              <div>이미지 1장당 약 $0.039 (1290 토큰)</div>
              <div>GCP 신규 가입 시 $300 크레딧 = 약 7,600장 생성 가능</div>
            </div>
          </div>

          {/* Guide */}
          <div className="border border-gray-100 rounded-lg">
            <button
              onClick={() => setIsGuideOpen(!isGuideOpen)}
              className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 rounded-lg transition-colors"
            >
              <span className="text-xs font-medium text-gray-600">API 키 발급 방법</span>
              <svg
                className={`w-4 h-4 text-gray-400 transition-transform ${isGuideOpen ? 'rotate-90' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {isGuideOpen && (
              <div className="px-4 pb-4 space-y-3">
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <p className="text-xs font-medium text-blue-700 mb-1">GCP $300 무료 크레딧 (추천)</p>
                  <div className="text-xs text-blue-600 space-y-0.5">
                    <div>신규 가입 시 $300 크레딧 (90일)</div>
                    <div>
                      <a
                        href="#"
                        className="underline hover:text-blue-800"
                        onClick={(e) => { e.preventDefault(); window.electronAPI.openExternal('https://cloud.google.com/free'); }}
                      >
                        GCP 가입
                      </a>
                      {' '}후 AI Studio에서 Billing 연결
                    </div>
                  </div>
                </div>

                <ol className="list-decimal list-inside space-y-1.5 text-xs text-gray-500">
                  <li>
                    <a
                      href="#"
                      className="text-blue-500 hover:text-blue-700 underline"
                      onClick={(e) => { e.preventDefault(); window.electronAPI.openExternal('https://aistudio.google.com/app/apikey'); }}
                    >
                      Google AI Studio
                    </a>
                    {' '}접속
                  </li>
                  <li>Google 계정으로 로그인</li>
                  <li>"Create API Key" 클릭</li>
                  <li>생성된 API 키 복사 후 위에 붙여넣기</li>
                  <li>"테스트 및 적용" 클릭</li>
                </ol>

                <div className="p-2 bg-yellow-50 rounded-lg border border-yellow-100">
                  <p className="text-xs text-yellow-700">API 키는 안전하게 보관하고 공개하지 마세요</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};

export default ApiSettings;
