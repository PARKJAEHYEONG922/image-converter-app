# 빌드 및 배포 가이드

## 🚀 자동 빌드 (GitHub Actions)

이 프로젝트는 GitHub Actions를 사용하여 Windows와 macOS용 설치 파일을 자동으로 빌드합니다.

### 방법 1: 태그 푸시로 릴리즈 생성

```bash
# 1. 버전 태그 생성
git tag v1.0.1

# 2. 태그 푸시
git push origin v1.0.1
```

**자동으로 실행됩니다:**
- ✅ Windows용 `.exe` 파일 빌드
- ✅ macOS용 `.dmg` 파일 빌드 (Intel + Apple Silicon)
- ✅ GitHub Release 자동 생성
- ✅ 설치 파일 자동 업로드

### 방법 2: 수동 실행

1. GitHub 저장소 → **Actions** 탭
2. **Build and Release** 워크플로우 선택
3. **Run workflow** 버튼 클릭
4. 빌드 완료 후 **Artifacts**에서 다운로드

## 💻 로컬 빌드

### Windows용 빌드
```bash
npm run dist:win
```
→ `release/` 폴더에 `.exe` 파일 생성

### macOS용 빌드 (macOS에서만 가능)
```bash
npm run dist:mac
```
→ `release/` 폴더에 `.dmg` 파일 생성

## 📦 빌드 결과물

### Windows
- **파일명**: `AI Image Converter Setup 1.0.1.exe`
- **타입**: NSIS 설치 프로그램
- **지원**: Windows 10/11

### macOS
- **파일명**: `AI Image Converter-1.0.1.dmg`
- **타입**: DMG 디스크 이미지
- **지원**: macOS 10.13+ (Intel + Apple Silicon)

## ⚠️ macOS 설치 시 주의사항

코드 서명이 없는 경우:
1. DMG 파일 다운로드
2. "신뢰할 수 없는 개발자" 경고 표시
3. **해결 방법**:
   - **방법 1**: 우클릭 → "열기"
   - **방법 2**: 시스템 환경설정 → 보안 및 개인정보 보호 → "확인 없이 열기"

## 🔐 코드 서명 (선택사항)

### macOS 코드 서명 설정

1. Apple Developer 계정 필요
2. GitHub 저장소 Settings → Secrets에 추가:
   - `MAC_CERT`: 개발자 인증서 (base64 인코딩)
   - `MAC_CERT_PASSWORD`: 인증서 비밀번호
   - `APPLE_ID`: Apple ID 이메일
   - `APPLE_APP_PASSWORD`: 앱 전용 암호

3. `.github/workflows/build.yml`에서 주석 해제:
```yaml
env:
  CSC_LINK: ${{ secrets.MAC_CERT }}
  CSC_KEY_PASSWORD: ${{ secrets.MAC_CERT_PASSWORD }}
  APPLE_ID: ${{ secrets.APPLE_ID }}
  APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_PASSWORD }}
```

## 📝 버전 업데이트

1. `package.json`에서 버전 변경:
```json
{
  "version": "1.0.2"
}
```

2. 커밋 및 태그:
```bash
git add package.json
git commit -m "Bump version to 1.0.2"
git tag v1.0.2
git push origin master
git push origin v1.0.2
```

3. GitHub Actions가 자동으로 빌드 및 릴리즈 생성

## 🛠️ 문제 해결

### 빌드 실패 시
1. GitHub Actions 로그 확인
2. 로컬에서 빌드 테스트: `npm run build`
3. node_modules 재설치: `rm -rf node_modules && npm install`

### macOS에서 "손상된 앱" 오류
```bash
# 터미널에서 실행
sudo xattr -r -d com.apple.quarantine "/Applications/AI Image Converter.app"
```
