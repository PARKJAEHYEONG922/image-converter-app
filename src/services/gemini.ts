import { GoogleGenerativeAI } from '@google/generative-ai';
import type { GeminiModel, OutputResolution } from '../types/global';

let genAI: GoogleGenerativeAI | null = null;
let currentModel: GeminiModel = 'gemini-2.5-flash-image';
let currentResolution: OutputResolution = '1k';

export const initializeGemini = (apiKey: string) => {
  genAI = new GoogleGenerativeAI(apiKey);
};

export const setGeminiModel = (model: GeminiModel) => {
  currentModel = model;
  console.log(`🔄 Gemini 모델 변경: ${model}`);
};

export const setOutputResolution = (resolution: OutputResolution) => {
  currentResolution = resolution;
  console.log(`📐 출력 해상도 변경: ${resolution}`);
};

export const getCurrentModel = (): GeminiModel => {
  return currentModel;
};

export const getCurrentResolution = (): OutputResolution => {
  return currentResolution;
};

export const generateImage = async (
  prompt: string,
  options?: {
    aspectRatio?: string | null;
    referenceImage?: string;
    referenceImages?: string[];
    overrideResolution?: string;
    overrideModel?: string;
  }
): Promise<string> => {
  if (!genAI) {
    throw new Error('Gemini API가 초기화되지 않았습니다. API 키를 설정해주세요.');
  }

  const maxRetries = 2;
  const useModel = options?.overrideModel || currentModel;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🟡 ${useModel} 이미지 생성 시작 (${attempt}/${maxRetries})`);

      // 프롬프트 향상
      let enhancedPrompt = prompt;

      // 참고 이미지가 있는 경우 로그만 출력
      if (options?.referenceImage || options?.referenceImages) {
        console.log('📸 참고 이미지 기반 재가공 모드');
      }

      // API 요청 body parts 구성
      const parts: any[] = [];

      // 다중 참고 이미지가 있으면 모두 추가
      if (options?.referenceImages && options.referenceImages.length > 0) {
        console.log(`🖼️ 다중 이미지 합성 모드 - ${options.referenceImages.length}개 이미지`);

        for (let i = 0; i < options.referenceImages.length; i++) {
          const imageUrl = options.referenceImages[i];
          const base64Match = imageUrl.match(/^data:image\/([^;]+);base64,(.+)$/);
          if (base64Match) {
            const mimeType = `image/${base64Match[1]}`;
            const base64Data = base64Match[2];
            parts.push({
              inlineData: {
                mimeType: mimeType,
                data: base64Data
              }
            });
            console.log(`📸 이미지 ${i + 1}/${options.referenceImages.length} 추가됨 (${mimeType})`);
          } else {
            console.error(`❌ 이미지 ${i + 1} 형식 오류`);
          }
        }
      }
      // 단일 참고 이미지가 있으면 추가
      else if (options?.referenceImage) {
        console.log('🔍 단일 참고 이미지 모드');
        const base64Match = options.referenceImage.match(/^data:image\/([^;]+);base64,(.+)$/);
        if (base64Match) {
          const mimeType = `image/${base64Match[1]}`;
          const base64Data = base64Match[2];
          parts.push({
            inlineData: {
              mimeType: mimeType,
              data: base64Data
            }
          });
          console.log(`📸 참고 이미지 추가됨 (${mimeType})`);
        } else {
          console.error('❌ 참고 이미지 형식 오류');
        }
      } else {
        console.log('ℹ️ 참고 이미지 없음 - 새로 생성');
      }

      // 텍스트 프롬프트 추가 (이미지 뒤에)
      parts.push({
        text: enhancedPrompt
      });

      // generationConfig 구성 — TEXT+IMAGE 모두 요청해야 이미지가 반환됨
      const generationConfig: any = {
        responseModalities: ['TEXT', 'IMAGE']
      };

      // imageConfig 구성
      const imageConfig: any = {};

      // aspectRatio 옵션이 있으면 추가
      if (options?.aspectRatio && options.aspectRatio !== 'original') {
        imageConfig.aspectRatio = options.aspectRatio;
        console.log(`📐 Aspect Ratio 설정: ${options.aspectRatio}`);
      }

      // 해상도 설정: 3.1 Flash 및 Pro 모델 지원
      const supportsImageSize = useModel === 'gemini-3.1-flash-image-preview' || useModel === 'gemini-3-pro-image-preview';
      if (supportsImageSize) {
        const sizeMap: Record<string, string> = { '0.5k': '0.5K', '1k': '1K', '2k': '2K', '4k': '4K' };
        if (options?.overrideResolution) {
          imageConfig.imageSize = options.overrideResolution;
          console.log(`🖼️ 출력 해상도 오버라이드: ${imageConfig.imageSize}`);
        } else if (currentResolution !== '1k') {
          imageConfig.imageSize = sizeMap[currentResolution];
          console.log(`🖼️ 출력 해상도 설정: ${imageConfig.imageSize}`);
        }
      }

      // imageConfig가 비어있지 않으면 generationConfig에 추가
      if (Object.keys(imageConfig).length > 0) {
        generationConfig.imageConfig = imageConfig;
      }

      const requestBody: any = {
        contents: [{
          parts: parts
        }],
        generationConfig
      };

      const apiKey = (genAI as any).apiKey;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${useModel}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        }
      );
      clearTimeout(timeout);

      console.log(`📊 Gemini 응답 상태: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Gemini 오류 응답 (${attempt}/${maxRetries}):`, errorText);

        if (attempt === maxRetries) {
          throw new Error(`Gemini Image API 오류: ${response.status} ${response.statusText}`);
        }

        // 재시도 전 잠시 대기
        await new Promise(resolve => setTimeout(resolve, 500 * attempt));
        continue;
      }

      const data = await response.json();
      console.log(`✅ Gemini 응답 수신 완료`);

      // Gemini 응답에서 이미지 데이터 추출
      const responseParts = data.candidates?.[0]?.content?.parts;
      let imageData: string | null = null;
      let imageMimeType = 'image/jpeg';

      if (responseParts && Array.isArray(responseParts)) {
        for (const part of responseParts) {
          if (part.inlineData && part.inlineData.data) {
            imageData = part.inlineData.data;
            imageMimeType = part.inlineData.mimeType || 'image/jpeg';
            break;
          }
        }
      }

      if (imageData) {
        console.log(`✅ Gemini 이미지 데이터 추출 성공 (${imageMimeType})`);
        return `data:${imageMimeType};base64,${imageData}`;
      } else {
        console.error('Gemini 응답에서 이미지 데이터를 찾을 수 없음');

        if (attempt === maxRetries) {
          throw new Error('Gemini에서 이미지 데이터를 추출할 수 없습니다.');
        }

        // 재시도 전 잠시 대기
        await new Promise(resolve => setTimeout(resolve, 500 * attempt));
        continue;
      }

    } catch (error) {
      console.error(`Gemini 이미지 생성 오류 (${attempt}/${maxRetries}):`, error);

      if (attempt === maxRetries) {
        // 최종 실패 시 placeholder 이미지 반환
        console.log('⚠️ Fallback: placeholder 이미지 반환');
        return generatePlaceholderImage(prompt);
      }

      // 재시도 전 잠시 대기
      await new Promise(resolve => setTimeout(resolve, 500 * attempt));
    }
  }

  throw new Error('Gemini 이미지 생성에 실패했습니다.');
};

// Placeholder image generator for demo
const generatePlaceholderImage = (prompt: string): string => {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    // Gradient background
    const gradient = ctx.createLinearGradient(0, 0, 512, 512);
    gradient.addColorStop(0, '#667eea');
    gradient.addColorStop(1, '#764ba2');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 512, 512);

    // Text
    ctx.fillStyle = 'white';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Split prompt into lines
    const words = prompt.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    words.forEach(word => {
      if ((currentLine + ' ' + word).length > 30) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = currentLine ? currentLine + ' ' + word : word;
      }
    });
    if (currentLine) lines.push(currentLine);

    // Draw lines
    const lineHeight = 30;
    const startY = 256 - (lines.length * lineHeight) / 2;
    lines.forEach((line, index) => {
      ctx.fillText(line, 256, startY + index * lineHeight);
    });

    // Add "Generated Image" text
    ctx.font = 'italic 16px Arial';
    ctx.fillText('(Generated Image)', 256, 450);
  }

  return canvas.toDataURL('image/png');
};