import React, { useState, useRef, useCallback, useEffect } from 'react';

interface AnglesModalProps {
  isOpen: boolean;
  imageUrl: string;
  onClose: () => void;
  isProcessing: boolean;
  onApply: (prompt: string) => void;
}

const AnglesModal: React.FC<AnglesModalProps> = ({
  isOpen,
  imageUrl,
  onClose,
  isProcessing,
  onApply
}) => {
  const [rotation, setRotation] = useState(0); // -180 to 180
  const [tilt, setTilt] = useState(0); // -90 to 90
  const [zoom, setZoom] = useState(0); // -50 to 50
  const [isDragging, setIsDragging] = useState(false);
  const sphereRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  const updateFromMouse = useCallback((clientX: number, clientY: number) => {
    const sphere = sphereRef.current;
    if (!sphere) return;
    const rect = sphere.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const maxR = rect.width / 2;

    // Mouse edge = 90° (visible hemisphere). Slider goes to 180° for behind.
    const newRotation = Math.round((dx / maxR) * 90);
    const newTilt = Math.round((dy / maxR) * -90);
    setRotation(Math.max(-90, Math.min(90, newRotation)));
    setTilt(Math.max(-90, Math.min(90, newTilt)));
  }, []);

  const handleSphereMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    isDraggingRef.current = true;
    updateFromMouse(e.clientX, e.clientY);
  };

  // Global mouse events for smooth dragging even outside sphere
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      updateFromMouse(e.clientX, e.clientY);
    };
    const handleGlobalMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        setIsDragging(false);
      }
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [updateFromMouse]);

  const buildPrompt = useCallback(() => {
    if (rotation === 0 && tilt === 0 && zoom === 0) return '';

    const absRot = Math.abs(rotation);
    const absTilt = Math.abs(tilt);
    const dir = rotation > 0 ? 'right' : 'left';

    // 수평 각도별 사진 용어 + 자연어
    const getHorizontalTerm = (): string => {
      if (absRot === 0) return '';
      if (absRot <= 15) return `slightly from the ${dir}, subtle off-center composition`;
      if (absRot <= 30) return `three-quarter view from the ${dir}, shot at about ${absRot}°`;
      if (absRot <= 60) return `strong three-quarter angle from the ${dir}, like a ${absRot}° side shot`;
      if (absRot <= 80) return `near-profile shot from the ${dir} side, almost a side perspective`;
      if (absRot <= 90) return `full profile view, shot directly from the ${dir} side`;
      return '';
    };

    // 수직 각도별 사진 용어 + 자연어
    const getVerticalTerm = (): string => {
      if (absTilt === 0) return '';
      if (tilt > 0) {
        // 위에서 아래로
        if (absTilt <= 15) return 'slightly elevated angle, camera tilted just a bit downward';
        if (absTilt <= 30) return 'moderate high-angle shot looking down';
        if (absTilt <= 50) return 'steep high-angle shot, strongly looking down at the subject';
        if (absTilt <= 70) return 'extreme high-angle, near top-down perspective';
        return "bird's-eye view, looking almost straight down from above";
      } else {
        // 아래에서 위로
        if (absTilt <= 15) return 'subtle low-angle shot, camera slightly below eye level';
        if (absTilt <= 30) return 'low-angle shot looking upward, classic heroic perspective';
        if (absTilt <= 50) return 'steep low-angle, strongly looking up at the subject';
        if (absTilt <= 70) return "extreme low-angle, worm's-eye perspective";
        return "worm's-eye view, looking almost straight up from below";
      }
    };

    // 줌/거리 용어
    const getZoomTerm = (): string => {
      if (zoom === 0) return '';
      if (zoom > 50) return 'extreme close-up, macro-like framing';
      if (zoom > 20) return 'close-up shot, tight framing';
      if (zoom > 0) return 'slightly closer than normal';
      if (zoom < -50) return 'wide shot, showing full environment';
      if (zoom < -20) return 'medium-wide shot, more background visible';
      return 'slightly further back than normal';
    };

    const parts: string[] = [];

    const horizTerm = getHorizontalTerm();
    const vertTerm = getVerticalTerm();
    const zoomTerm = getZoomTerm();

    // 메인 디스크립션 조합
    if (horizTerm && vertTerm) {
      parts.push(`Rephotograph this image as if taken from a ${horizTerm}, combined with a ${vertTerm}.`);
    } else if (horizTerm) {
      parts.push(`Rephotograph this image as if taken from a ${horizTerm}.`);
    } else if (vertTerm) {
      parts.push(`Rephotograph this image as if taken from a ${vertTerm}.`);
    }

    if (zoomTerm) {
      parts.push(`Framing: ${zoomTerm}.`);
    }

    // 간결한 핵심 규칙
    parts.push('The subject must remain in the exact same pose and position — do not move, tilt, or rotate the subject. Only the camera viewpoint changes. Preserve the same lighting, background, and atmosphere.');

    return parts.join(' ');
  }, [rotation, tilt, zoom]);

  const handleApply = () => {
    const prompt = buildPrompt();
    if (!prompt) return;
    onApply(prompt);
  };

  const handleReset = () => {
    setRotation(0);
    setTilt(0);
    setZoom(0);
  };

  // Camera indicator position on sphere
  // For sphere display: clamp to visible hemisphere, beyond 90° stays at edge
  const sphereR = 105;
  const clampedRot = Math.max(-90, Math.min(90, rotation));
  const clampedTilt = Math.max(-90, Math.min(90, tilt));
  const camX = Math.sin((clampedRot / 90) * (Math.PI / 2)) * sphereR * Math.cos((clampedTilt / 90) * (Math.PI / 2));
  const camY = -Math.sin((clampedTilt / 90) * (Math.PI / 2)) * sphereR;

  // Camera rotation to face center (lens pointing toward subject)
  const camAngleDeg = Math.atan2(-camY, -camX) * (180 / Math.PI) + 90;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-xl w-[400px] overflow-hidden shadow-2xl border border-gray-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Angles</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Sphere area */}
        <div className="px-5 pt-4 pb-2">
          <p className="text-[10px] text-gray-400 text-center mb-3">드래그하여 카메라 각도 조절</p>

          <div className="flex justify-center">
            <div
              ref={sphereRef}
              className="relative w-[240px] h-[240px] rounded-full cursor-grab active:cursor-grabbing"
              style={{
                background: 'radial-gradient(circle at 40% 35%, rgba(230,235,245,0.8) 0%, rgba(200,210,230,0.6) 60%, rgba(180,190,210,0.4) 100%)',
                border: '1px solid rgba(180,190,210,0.5)',
                boxShadow: 'inset 0 0 40px rgba(0,0,0,0.05), 0 2px 12px rgba(0,0,0,0.08)'
              }}
              onMouseDown={handleSphereMouseDown}
            >
              {/* Grid lines on sphere */}
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 240 240">
                {[-60, -30, 0, 30, 60].map(lat => {
                  const r = Math.cos((lat / 90) * (Math.PI / 2)) * 110;
                  const y = 120 - Math.sin((lat / 90) * (Math.PI / 2)) * 110;
                  return (
                    <ellipse key={`h${lat}`} cx={120} cy={y} rx={r} ry={r * 0.15}
                      fill="none" stroke="rgba(150,160,190,0.25)" strokeWidth={0.5} />
                  );
                })}
                {[0, 45, 90, 135].map(lon => (
                  <ellipse key={`v${lon}`} cx={120} cy={120} rx={Math.sin((lon / 180) * Math.PI) * 110} ry={110}
                    fill="none" stroke="rgba(150,160,190,0.25)" strokeWidth={0.5} />
                ))}
              </svg>

              {/* Center image */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
                <div className="w-16 h-16 rounded-lg overflow-hidden border border-gray-300 shadow-md pointer-events-none">
                  <img src={imageUrl} alt="preview" className="w-full h-full object-cover" draggable={false} onDragStart={e => e.preventDefault()} />
                </div>
              </div>

              {/* Line from center to camera */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 240 240">
                <line x1={120} y1={120} x2={120 + camX} y2={120 + camY}
                  stroke="rgba(100,120,200,0.35)" strokeWidth="1" strokeDasharray="4 3" />
              </svg>

              {/* Camera indicator - top-down view, rotates to face center */}
              <div
                className="absolute flex items-center justify-center pointer-events-none"
                style={{
                  width: '32px',
                  height: '32px',
                  left: `${120 + camX - 16}px`,
                  top: `${120 + camY - 16}px`,
                  transform: `rotate(${camAngleDeg}deg)`,
                  transition: isDragging ? 'none' : 'all 0.15s ease',
                  filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.2))'
                }}
              >
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                  <rect x="8" y="10" width="16" height="14" rx="2.5" fill="rgba(60,80,160,0.8)" stroke="rgba(80,100,180,0.9)" strokeWidth="1.2" />
                  <rect x="12" y="5" width="8" height="7" rx="1.5" fill="rgba(70,90,170,0.8)" stroke="rgba(80,100,180,0.9)" strokeWidth="1.2" />
                  <circle cx="16" cy="8" r="2.5" fill="rgba(120,160,255,0.5)" stroke="rgba(100,130,220,0.9)" strokeWidth="1" />
                  <circle cx="16" cy="8" r="1" fill="rgba(180,210,255,0.8)" />
                  <rect x="9" y="21" width="4" height="3" rx="1" fill="rgba(50,70,140,0.6)" stroke="rgba(80,100,180,0.6)" strokeWidth="0.8" />
                  <rect x="13" y="18" width="6" height="3" rx="1" fill="rgba(55,75,150,0.6)" stroke="rgba(80,100,180,0.5)" strokeWidth="0.6" />
                </svg>
              </div>

              {/* Direction labels */}
              <span className="absolute top-2 left-1/2 -translate-x-1/2 text-[9px] text-gray-400 font-medium">위</span>
              <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[9px] text-gray-400 font-medium">아래</span>
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] text-gray-400 font-medium">좌</span>
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-gray-400 font-medium">우</span>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="px-5 py-3 space-y-2">
          {/* Rotation */}
          <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2">
            <span className="text-xs text-gray-500 w-16">Rotation</span>
            <input
              type="range" min={-180} max={180} value={rotation}
              onChange={e => setRotation(Number(e.target.value))}
              className="flex-1 h-1 accent-indigo-500"
            />
            <span className="text-xs text-gray-700 w-10 text-right font-medium">{rotation}°</span>
          </div>

          {/* Tilt */}
          <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2">
            <span className="text-xs text-gray-500 w-16">Tilt</span>
            <input
              type="range" min={-90} max={90} value={tilt}
              onChange={e => setTilt(Number(e.target.value))}
              className="flex-1 h-1 accent-indigo-500"
            />
            <span className="text-xs text-gray-700 w-10 text-right font-medium">{tilt}°</span>
          </div>

          {/* Zoom */}
          <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2">
            <span className="text-xs text-gray-500 w-16">Zoom</span>
            <input
              type="range" min={-50} max={50} value={zoom}
              onChange={e => setZoom(Number(e.target.value))}
              className="flex-1 h-1 accent-indigo-500"
            />
            <span className="text-xs text-gray-700 w-10 text-right font-medium">{zoom}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-between">
          <button
            onClick={handleReset}
            className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            초기화
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
              disabled={isProcessing || (rotation === 0 && tilt === 0 && zoom === 0)}
              className="px-4 py-1.5 text-sm text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors disabled:opacity-40 flex items-center gap-1.5"
            >
              {isProcessing ? (
                <>
                  <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  처리 중...
                </>
              ) : '적용'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnglesModal;
