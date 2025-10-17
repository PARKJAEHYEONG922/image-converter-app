# 🎨 Image Converter - AI 이미지 변환 앱

Gemini AI를 활용한 독립형 이미지 생성/편집 Electron 애플리케이션입니다.

## 주요 기능

### 🎨 4가지 이미지 처리 모드
1. **텍스트→이미지** - 텍스트 설명만으로 새로운 이미지 생성
2. **이미지 편집** - 기존 이미지를 AI로 편집 (배경 변경, 객체 추가/제거)
3. **다중 합성** - 여러 이미지의 요소를 합쳐 새로운 장면 생성
4. **스타일 전송** - 한 이미지의 스타일을 다른 이미지에 적용

### ✨ 특징
- 독립형 데스크톱 애플리케이션
- 다양한 비율 선택 (1:1, 3:4, 4:3, 9:16, 16:9, 21:9)
- 이미지 히스토리 갤러리
- 모드별 상태 저장
- 간편한 API 키 설정

## 설치 및 실행

### 사전 요구사항
- Node.js 18.0.0 이상
- npm 또는 yarn
- Gemini API 키 ([Google AI Studio](https://aistudio.google.com/app/apikey)에서 발급)

### 설치
```bash
# 프로젝트 폴더로 이동
cd c:/image-converter-app

# 의존성 설치
npm install
```

### 개발 모드 실행
```bash
npm run dev
```

### 빌드
```bash
# 프로덕션 빌드
npm run build

# Windows 실행 파일 생성
npm run dist:win
```

## 사용 방법

1. **API 설정**
   - 앱 실행 후 우측 상단 "⚙️ API 설정" 클릭
   - Gemini API 키 입력 및 저장

2. **이미지 처리**
   - 원하는 모드 선택 (텍스트→이미지, 이미지 편집, 다중 합성, 스타일 전송)
   - 필요한 경우 이미지 업로드
   - 프롬프트 입력
   - 비율 선택
   - "🎨 생성/변환" 버튼 클릭

3. **결과 저장**
   - 생성된 이미지 클릭으로 확대 보기
   - "💾 저장" 버튼으로 로컬에 저장

## 프로젝트 구조
```
image-converter-app/
├── src/
│   ├── main/           # Electron 메인 프로세스
│   ├── components/     # React 컴포넌트
│   ├── services/       # API 서비스
│   └── types/          # TypeScript 타입 정의
├── public/             # 정적 리소스
└── dist/               # 빌드 출력
```

## 기술 스택
- **Frontend**: React 18, TypeScript
- **Desktop**: Electron 29
- **Build**: Vite
- **AI**: Google Gemini API
- **Styling**: Tailwind CSS

## 라이선스
MIT

## 문의
이슈나 문의사항은 GitHub Issues를 이용해주세요.