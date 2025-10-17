import React, { useState, useEffect } from 'react';
import Button from './Button';
import { initializeGemini } from '../services/gemini';

interface ApiSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

interface TestStatus {
  testing: boolean;
  success: boolean;
  message: string;
}

const ApiSettings: React.FC<ApiSettingsProps> = ({ isOpen, onClose }) => {
  const [apiKey, setApiKey] = useState('');
  const [savedApiKey, setSavedApiKey] = useState('');
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
    } catch (error) {
      console.error('설정 로드 실패:', error);
    }
  };

  const testAndApplyApiKey = async () => {
    if (!apiKey.trim()) {
      setTestStatus({
        testing: false,
        success: false,
        message: 'API 키를 입력해주세요.'
      });
      return;
    }

    setTestStatus({
      testing: true,
      success: false,
      message: 'Gemini API를 테스트하는 중...'
    });

    try {
      // API 키 테스트
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey.trim()}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.ok) {
        // 테스트 성공 시 저장
        await window.electronAPI.saveApiSettings({
          geminiApiKey: apiKey.trim()
        });

        // Gemini 초기화
        initializeGemini(apiKey.trim());
        setSavedApiKey(apiKey.trim());

        setTestStatus({
          testing: false,
          success: true,
          message: '✅ API 키가 성공적으로 적용되었습니다.'
        });

        // 3초 후 메시지 숨기기
        setTimeout(() => {
          setTestStatus(prev => ({ ...prev, message: '' }));
        }, 3000);
      } else {
        const errorData = await response.json().catch(() => ({}));
        setTestStatus({
          testing: false,
          success: false,
          message: `❌ API 키 확인 필요: ${errorData.error?.message || `HTTP ${response.status}`}`
        });
      }
    } catch (error) {
      setTestStatus({
        testing: false,
        success: false,
        message: '❌ 연결 실패: 네트워크 오류가 발생했습니다.'
      });
    }
  };

  const deleteApiKey = async () => {
    try {
      await window.electronAPI.saveApiSettings({
        geminiApiKey: ''
      });
      setApiKey('');
      setSavedApiKey('');
      setTestStatus({
        testing: false,
        success: true,
        message: 'API 키가 삭제되었습니다.'
      });
      setTimeout(() => {
        setTestStatus(prev => ({ ...prev, message: '' }));
      }, 3000);
    } catch (error) {
      setTestStatus({
        testing: false,
        success: false,
        message: 'API 키 삭제에 실패했습니다.'
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl w-[800px] max-h-[90vh] overflow-hidden border border-gray-700 shadow-2xl">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-8 py-6">
          <h2 className="text-2xl font-bold text-white">이미지 AI 설정</h2>
          <p className="text-purple-100 mt-1">Gemini API를 설정하여 이미지 생성 기능을 활성화하세요</p>
        </div>

        <div className="p-8 overflow-y-auto max-h-[calc(90vh-200px)]">
          {/* Current Settings Display */}
          <div className="p-5 bg-gradient-to-br from-purple-900/30 to-pink-900/30 border border-purple-700 rounded-2xl mb-6">
            <h4 className="font-semibold text-sm text-purple-300 mb-3 flex items-center space-x-2">
              <span>⚙️</span>
              <span>현재 적용된 설정</span>
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-gray-400 block mb-1">제공자</span>
                <span className="font-semibold text-purple-300">GEMINI</span>
              </div>
              <div>
                <span className="text-gray-400 block mb-1">모델</span>
                <span className="font-semibold text-purple-300">Gemini 2.5 Flash Image</span>
              </div>
              <div>
                <span className="text-gray-400 block mb-1">API 키</span>
                <div className={`flex items-center space-x-1 font-semibold ${
                  savedApiKey ? 'text-emerald-400' : 'text-red-400'
                }`}>
                  <span>{savedApiKey ? '🔑' : '🔒'}</span>
                  <span>{savedApiKey ? '설정됨' : '미설정'}</span>
                </div>
              </div>
              <div>
                <span className="text-gray-400 block mb-1">연결 상태</span>
                <div className={`flex items-center space-x-1 font-semibold ${
                  testStatus.testing
                    ? 'text-blue-400'
                    : testStatus.success || savedApiKey
                    ? 'text-emerald-400'
                    : testStatus.message && !testStatus.success
                    ? 'text-red-400'
                    : 'text-gray-500'
                }`}>
                  <span>
                    {testStatus.testing
                      ? '🔄'
                      : testStatus.success || savedApiKey
                      ? '✅'
                      : testStatus.message && !testStatus.success
                      ? '❌'
                      : '⚪'}
                  </span>
                  <span>
                    {testStatus.testing
                      ? '테스트 중...'
                      : testStatus.success || savedApiKey
                      ? '연결됨'
                      : testStatus.message && !testStatus.success
                      ? '연결 실패'
                      : '미확인'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Gemini API Settings */}
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-xl p-6 border border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                    <span className="text-white text-lg font-bold">G</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">Google Gemini</h3>
                    <p className="text-sm text-gray-400">이미지 생성 및 편집</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    API Key
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="w-full px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                      placeholder="AIza..."
                    />
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    onClick={deleteApiKey}
                    disabled={testStatus.testing || !apiKey}
                    variant="danger"
                    size="sm"
                    className="inline-flex items-center space-x-2"
                  >
                    <span>🗑️</span>
                    <span>삭제</span>
                  </Button>

                  <Button
                    onClick={testAndApplyApiKey}
                    disabled={!apiKey || testStatus.testing}
                    loading={testStatus.testing}
                    variant={testStatus.success ? "success" : "primary"}
                    size="sm"
                    className="flex-1 inline-flex items-center justify-center space-x-2"
                  >
                    {!testStatus.testing && (
                      <span>{testStatus.success ? '✅' : '🧪'}</span>
                    )}
                    <span>
                      {testStatus.testing
                        ? '테스트 중...'
                        : testStatus.success
                        ? '적용 완료'
                        : '테스트 및 적용'}
                    </span>
                  </Button>
                </div>

                {/* Test Result Message */}
                {testStatus.message && (
                  <div className={`p-4 rounded-xl border-2 ${
                    testStatus.success
                      ? 'bg-green-900/20 border-green-500/30 text-green-400'
                      : testStatus.testing
                      ? 'bg-blue-900/20 border-blue-500/30 text-blue-400'
                      : 'bg-red-900/20 border-red-500/30 text-red-400'
                  }`}>
                    <p className="text-sm font-medium m-0">
                      {testStatus.message}
                    </p>
                  </div>
                )}

                {/* Cost Info */}
                <div className="bg-green-900/20 border border-green-500/30 rounded-xl p-4 mt-4">
                  <div className="text-sm text-green-400 space-y-1">
                    <div className="font-semibold mb-2 flex items-center space-x-2">
                      <span>🍌</span>
                      <span>Nano Banana (Gemini 2.5 Flash Image) 정보</span>
                    </div>
                    <div><strong>• 가격:</strong> $0.039/이미지 (1290 토큰)</div>
                    <div><strong>• 모델:</strong> Gemini 2.5 Flash Image</div>
                    <div><strong>• 별명:</strong> Nano Banana 🍌</div>
                    <div><strong>✨ 특징:</strong> 캐릭터 일관성, 다중 이미지 합성, 자연어 변환</div>
                    <div><strong>📐 비율:</strong> 10가지 지원 (1:1, 3:2, 2:3, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9)</div>
                    <div><strong>🏆 평가:</strong> LMArena 세계 1위 이미지 편집 모델</div>
                  </div>
                </div>
              </div>
            </div>

            {/* API Key Guide */}
            <div className="bg-gray-800/30 rounded-xl p-1">
              <button
                onClick={() => setIsGuideOpen(!isGuideOpen)}
                className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-gray-700/30 rounded-lg transition-colors"
              >
                <span className="font-medium text-gray-300 flex items-center space-x-2">
                  <span>📝</span>
                  <span>Gemini API 키 발급 방법</span>
                </span>
                <svg
                  className={`w-5 h-5 text-gray-400 transition-transform ${isGuideOpen ? 'rotate-90' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>

              {isGuideOpen && (
                <div className="px-5 pb-5 space-y-3">
                  <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg mb-3">
                    <div className="text-blue-400 text-sm space-y-1">
                      <div className="font-semibold flex items-center space-x-2">
                        <span>🎁</span>
                        <span>무료 사용 혜택</span>
                      </div>
                      <div className="space-y-1.5">
                        <div className="font-semibold text-blue-300">옵션 1: Google AI Studio 무료 티어</div>
                        <div>• <strong>무료 사용량:</strong> 250 요청/일 (Gemini 2.5 Flash)</div>
                        <div>• <strong>초과 시:</strong> 자동 과금 ($0.039/이미지)</div>
                        <div>• <strong>별도 설정 불필요</strong></div>

                        <div className="font-semibold text-blue-300 mt-2">옵션 2: GCP $300 크레딧 활용 (추천)</div>
                        <div>• <strong>신규 가입 시:</strong> $300 무료 크레딧 (90일)</div>
                        <div>• <strong>Google AI Studio와 연동 가능!</strong></div>
                        <div>• <strong>설정 방법:</strong> AI Studio → Set up Billing → GCP 계정 연결</div>
                        <div>• <strong>혜택:</strong> $300 크레딧으로 약 7,600장 생성 가능</div>

                        <div className="mt-2 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded">
                          <div className="text-yellow-400 text-xs">
                            💡 <strong>팁:</strong> GCP 신규 가입 후 AI Studio와 연결하면 $300 크레딧 사용 가능!
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <ol className="list-decimal list-inside space-y-2 ml-2 text-sm text-gray-400">
                    <li>
                      <a
                        href="https://aistudio.google.com/app/apikey"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 underline"
                        onClick={(e) => {
                          e.preventDefault();
                          window.electronAPI.openExternal('https://aistudio.google.com/app/apikey');
                        }}
                      >
                        Google AI Studio
                      </a>
                      {' '}접속
                    </li>
                    <li>Google 계정으로 로그인</li>
                    <li>"Create API Key" 버튼 클릭</li>
                    <li>새 프로젝트 생성 또는 기존 프로젝트 선택</li>
                    <li>생성된 API 키 복사</li>
                    <li>위 입력란에 붙여넣기</li>
                    <li>"테스트 및 적용" 버튼 클릭</li>
                  </ol>

                  <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                    <p className="text-yellow-400 text-xs">
                      ⚠️ API 키는 안전하게 보관하고 공개하지 마세요
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-4 bg-gray-900/50 border-t border-gray-700 flex justify-end">
          <Button
            onClick={onClose}
            variant="ghost"
            size="md"
          >
            닫기
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ApiSettings;