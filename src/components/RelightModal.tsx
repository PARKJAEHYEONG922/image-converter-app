import React, { useState, useRef, useCallback, useEffect } from 'react';

interface RelightModalProps {
  isOpen: boolean;
  imageUrl: string;
  onClose: () => void;
  onApply: (prompt: string) => void;
  isProcessing: boolean;
}

type LightPreset = 'top' | 'front' | 'right' | 'left' | 'back' | 'bottom';
type LightHardness = 'soft' | 'hard';

const PRESETS: { id: LightPreset; label: string; angle: number; elevation: number; intensity: number }[] = [
  { id: 'top', label: 'Top', angle: 0, elevation: 80, intensity: 0.15 },
  { id: 'front', label: 'Front', angle: 0, elevation: 30, intensity: 0.7 },
  { id: 'right', label: 'Right', angle: 90, elevation: 30, intensity: 0.7 },
  { id: 'left', label: 'Left', angle: -90, elevation: 30, intensity: 0.7 },
  { id: 'back', label: 'Back', angle: 180, elevation: 30, intensity: 0.7 },
  { id: 'bottom', label: 'Bottom', angle: 0, elevation: -60, intensity: 0.15 },
];

// Color Picker Board component
const ColorPickerBoard: React.FC<{
  color: string;
  onChange: (color: string) => void;
  hexToRgba: (hex: string, alpha: number) => string;
}> = ({ color, onChange, hexToRgba }) => {
  const boardRef = useRef<HTMLCanvasElement>(null);
  const hueRef = useRef<HTMLCanvasElement>(null);
  const [hue, setHue] = useState(0);
  const [isDraggingBoard, setIsDraggingBoard] = useState(false);
  const [isDraggingHue, setIsDraggingHue] = useState(false);
  const [saturation, setSaturation] = useState(0);
  const [brightness, setBrightness] = useState(100);

  // Draw the SB board
  useEffect(() => {
    const canvas = boardRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const w = canvas.width;
    const h = canvas.height;

    // Base hue color
    const hueColor = `hsl(${hue}, 100%, 50%)`;

    // White to hue gradient (horizontal)
    const gradH = ctx.createLinearGradient(0, 0, w, 0);
    gradH.addColorStop(0, '#ffffff');
    gradH.addColorStop(1, hueColor);
    ctx.fillStyle = gradH;
    ctx.fillRect(0, 0, w, h);

    // Transparent to black gradient (vertical)
    const gradV = ctx.createLinearGradient(0, 0, 0, h);
    gradV.addColorStop(0, 'rgba(0,0,0,0)');
    gradV.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = gradV;
    ctx.fillRect(0, 0, w, h);
  }, [hue]);

  // Draw the hue strip
  useEffect(() => {
    const canvas = hueRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const w = canvas.width;
    const h = canvas.height;
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    for (let i = 0; i <= 6; i++) {
      grad.addColorStop(i / 6, `hsl(${i * 60}, 100%, 50%)`);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }, []);

  const hsvToHex = (h: number, s: number, v: number) => {
    s /= 100; v /= 100;
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  };

  const pickFromBoard = useCallback((clientX: number, clientY: number) => {
    const canvas = boardRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    const s = Math.round(x * 100);
    const b = Math.round((1 - y) * 100);
    setSaturation(s);
    setBrightness(b);
    onChange(hsvToHex(hue, s, b));
  }, [hue, onChange]);

  const pickFromHue = useCallback((clientX: number) => {
    const canvas = hueRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const h = Math.round(x * 360);
    setHue(h);
    onChange(hsvToHex(h, saturation, brightness));
  }, [saturation, brightness, onChange]);

  useEffect(() => {
    if (!isDraggingBoard && !isDraggingHue) return;
    const handleMove = (e: MouseEvent) => {
      if (isDraggingBoard) pickFromBoard(e.clientX, e.clientY);
      if (isDraggingHue) pickFromHue(e.clientX);
    };
    const handleUp = () => { setIsDraggingBoard(false); setIsDraggingHue(false); };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp); };
  }, [isDraggingBoard, isDraggingHue, pickFromBoard, pickFromHue]);

  // Indicator positions
  const boardX = saturation;
  const boardY = 100 - brightness;

  return (
    <div className="space-y-1.5">
      {/* SB Board */}
      <div className="relative">
        <canvas
          ref={boardRef}
          width={200}
          height={90}
          className="w-full h-[90px] rounded-md cursor-crosshair"
          onMouseDown={(e) => { setIsDraggingBoard(true); pickFromBoard(e.clientX, e.clientY); }}
        />
        {/* Picker indicator */}
        <div
          className="absolute w-3.5 h-3.5 rounded-full border-2 border-white pointer-events-none"
          style={{
            left: `calc(${boardX}% - 7px)`,
            top: `calc(${boardY}% - 7px)`,
            boxShadow: '0 0 3px rgba(0,0,0,0.5)',
            background: color
          }}
        />
      </div>
      {/* Hue strip */}
      <div className="relative flex items-center gap-2">
        <div
          className="w-4 h-4 rounded-full border border-gray-300 shrink-0"
          style={{ backgroundColor: color, boxShadow: `0 0 6px ${hexToRgba(color, 0.5)}` }}
        />
        <div className="relative flex-1">
          <canvas
            ref={hueRef}
            width={200}
            height={12}
            className="w-full h-3 rounded-full cursor-pointer"
            onMouseDown={(e) => { setIsDraggingHue(true); pickFromHue(e.clientX); }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-2.5 h-4 rounded-sm border-2 border-white pointer-events-none"
            style={{ left: `calc(${(hue / 360) * 100}% - 5px)`, boxShadow: '0 0 3px rgba(0,0,0,0.4)' }}
          />
        </div>
      </div>
    </div>
  );
};

const RelightModal: React.FC<RelightModalProps> = ({
  isOpen,
  imageUrl,
  onClose,
  onApply,
  isProcessing
}) => {
  // angle: 0=front, 90=right, -90=left, 180=back (degrees around Y axis)
  // elevation: 0=level, 90=top, -90=bottom
  const [lightAngle, setLightAngle] = useState(0);
  const [lightElevation, setLightElevation] = useState(30);
  const [lightIntensity, setLightIntensity] = useState(0.7); // 0=far/weak, 1=close/strong
  const [lightColor, setLightColor] = useState('#ffffff');
  const [hardness, setHardness] = useState<LightHardness>('soft');
  const [activePreset, setActivePreset] = useState<LightPreset | null>('front');
  const [isDragging, setIsDragging] = useState(false);
  const orbitRef = useRef<HTMLDivElement>(null);

  // Convert angle/intensity to a position on the circular control
  // intensity: 1=close (near edge), 0=far (near center)
  const getIndicatorPosition = useCallback(() => {
    const radius = 115;
    const rad = (lightAngle * Math.PI) / 180;
    const distRatio = 0.3 + lightIntensity * 0.7; // min 0.3 so it doesn't sit on image
    const x = Math.sin(rad) * radius * distRatio;
    const y = -Math.cos(rad) * radius * distRatio;
    return { x, y };
  }, [lightAngle, lightIntensity]);

  // Convert mouse position on the orbit circle to angle/elevation
  const updateLightFromPosition = useCallback((clientX: number, clientY: number) => {
    if (!orbitRef.current) return;
    const rect = orbitRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const radius = rect.width / 2;

    const dist = Math.sqrt(dx * dx + dy * dy);
    const clampedDist = Math.min(dist, radius);
    const intensity = clampedDist / radius; // far from center = high intensity (close light)

    const angle = (Math.atan2(dx, -dy) * 180) / Math.PI;

    setLightAngle(Math.round(angle));
    setLightIntensity(Math.round(intensity * 100) / 100);
    setActivePreset(null);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    updateLightFromPosition(e.clientX, e.clientY);
  }, [updateLightFromPosition]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      updateLightFromPosition(e.clientX, e.clientY);
    };
    const handleMouseUp = () => setIsDragging(false);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, updateLightFromPosition]);

  const selectPreset = (preset: LightPreset) => {
    const p = PRESETS.find(pr => pr.id === preset)!;
    setLightAngle(p.angle);
    setLightElevation(p.elevation);
    setLightIntensity(p.intensity);
    setActivePreset(preset);
  };

  const buildPrompt = () => {
    let direction = '';
    if (lightElevation > 60) {
      direction = 'from directly above (top-down)';
    } else if (lightElevation < -30) {
      direction = 'from below (bottom-up, under-lighting)';
    } else {
      const absAngle = Math.abs(lightAngle);
      if (absAngle < 30) direction = 'from the front';
      else if (absAngle < 75) direction = lightAngle > 0 ? 'from the front-right' : 'from the front-left';
      else if (absAngle < 120) direction = lightAngle > 0 ? 'from the right side' : 'from the left side';
      else if (absAngle < 160) direction = lightAngle > 0 ? 'from the back-right' : 'from the back-left';
      else direction = 'from behind (backlighting, rim light)';

      if (lightElevation > 40) direction += ', elevated at a high angle';
      else if (lightElevation > 15) direction += ', at a slightly elevated angle';
      else direction += ', at eye level';
    }

    const hardnessDesc = hardness === 'soft'
      ? 'Use soft, diffused lighting with gentle shadows and smooth gradients.'
      : 'Use hard, directional lighting with sharp, defined shadows and high contrast.';

    const intensityDesc = lightIntensity > 0.75 ? 'The light is very close and intense.'
      : lightIntensity > 0.45 ? 'The light is at a moderate distance with medium intensity.'
      : 'The light is distant and subtle, creating gentle illumination.';

    // Describe the light color based on hex
    const r = parseInt(lightColor.slice(1, 3), 16);
    const g = parseInt(lightColor.slice(3, 5), 16);
    const b = parseInt(lightColor.slice(5, 7), 16);
    const isWhite = r > 240 && g > 240 && b > 240;
    const colorDesc = isWhite ? '' :
      `The light has a colored tint (${lightColor}), casting that color tone on the subject.`;

    return `Relight this image with the main light source coming ${direction}. ${hardnessDesc} ${intensityDesc} ${colorDesc} Maintain the original subject, composition, and details. Only change the lighting.`;
  };

  const handleApply = () => {
    onApply(buildPrompt());
  };

  // Convert hex to rgba
  const hexToRgba = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  };

  // Compute the light cone gradient for visual feedback
  const getLightGradient = () => {
    const pos = getIndicatorPosition();
    const cx = 50 + (pos.x / 115) * 35;
    const cy = 50 + (pos.y / 115) * 35;
    const a1 = 0.3 + lightIntensity * 0.4;
    const a2 = 0.1 + lightIntensity * 0.15;
    return `radial-gradient(ellipse at ${cx}% ${cy}%, ${hexToRgba(lightColor, a1)} 0%, ${hexToRgba(lightColor, a2)} 30%, transparent 65%)`;
  };

  if (!isOpen) return null;

  const indicatorPos = getIndicatorPosition();

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div
        className="bg-white rounded-xl w-[400px] overflow-hidden shadow-2xl border border-gray-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Relight</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Quick select */}
          <div>
            <p className="text-[10px] text-gray-400 mb-2">Quick select</p>
            <div className="grid grid-cols-3 gap-1.5">
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => selectPreset(preset.id)}
                  className={`py-1.5 rounded-lg text-xs font-medium transition-all border ${
                    activePreset === preset.id
                      ? 'bg-gray-800 text-white border-gray-800'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Orbit control */}
          <div className="flex justify-center">
            <div
              ref={orbitRef}
              className="relative w-[260px] h-[260px] rounded-full cursor-crosshair select-none"
              style={{ background: 'radial-gradient(circle, #1a1a2e 40%, #0d0d1a 100%)' }}
              onMouseDown={handleMouseDown}
            >
              {/* Guide rings */}
              <div className="absolute inset-[30px] rounded-full border border-white/10" />
              <div className="absolute inset-[60px] rounded-full border border-white/8" />

              {/* Light beam cone (SVG) */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="-130 -130 260 260">
                {/* Wide light cone */}
                {(() => {
                  const ix = indicatorPos.x;
                  const iy = indicatorPos.y;
                  const dist = Math.sqrt(ix * ix + iy * iy) || 1;
                  const coneWidth = 25 + lightIntensity * 15;
                  const px = -iy / dist * coneWidth;
                  const py = ix / dist * coneWidth;
                  const opacity = 0.15 + lightIntensity * 0.2;
                  return (
                    <polygon
                      points={`${ix},${iy} ${px},${py} ${-px},${-py}`}
                      fill={hexToRgba(lightColor, opacity)}
                    />
                  );
                })()}
                {/* Outer glow cone */}
                {(() => {
                  const ix = indicatorPos.x;
                  const iy = indicatorPos.y;
                  const dist = Math.sqrt(ix * ix + iy * iy) || 1;
                  const coneWidth = 40 + lightIntensity * 20;
                  const px = -iy / dist * coneWidth;
                  const py = ix / dist * coneWidth;
                  return (
                    <polygon
                      points={`${ix},${iy} ${px},${py} ${-px},${-py}`}
                      fill={hexToRgba(lightColor, 0.06)}
                    />
                  );
                })()}
              </svg>

              {/* Center image */}
              <div className="absolute inset-[75px] rounded-lg overflow-hidden shadow-lg border border-white/20">
                <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" />
                {/* Light overlay on image */}
                <div
                  className="absolute inset-0 pointer-events-none transition-all duration-200"
                  style={{ background: getLightGradient() }}
                />
              </div>

              {/* Light indicator */}
              <div
                className="absolute w-8 h-8 rounded-full flex items-center justify-center transition-all duration-100 pointer-events-none"
                style={{
                  left: `calc(50% + ${indicatorPos.x}px - 16px)`,
                  top: `calc(50% + ${indicatorPos.y}px - 16px)`,
                  background: `radial-gradient(circle, ${lightColor} 30%, ${hexToRgba(lightColor, 0.7)} 100%)`,
                  boxShadow: `0 0 24px ${hexToRgba(lightColor, 0.8)}, 0 0 48px ${hexToRgba(lightColor, 0.4)}, 0 2px 8px rgba(0,0,0,0.3)`
                }}
              >
                <span className="text-[10px]" style={{ filter: lightColor === '#ffffff' || lightColor === '#ffdd00' ? 'none' : 'brightness(3)' }}>☀</span>
              </div>

              {/* Direction labels */}
              <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[9px] text-white/30">Top</span>
              <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] text-white/30">Bottom</span>
              <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[9px] text-white/30">Left</span>
              <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] text-white/30">Right</span>
            </div>
          </div>

          {/* Light settings + Color in one row */}
          <div className="flex gap-3">
            <div className="flex-1">
              <p className="text-[10px] text-gray-400 mb-2">Light settings</p>
              <div className="flex gap-1.5 bg-gray-100 rounded-lg p-1">
                {(['soft', 'hard'] as LightHardness[]).map((h) => (
                  <button
                    key={h}
                    onClick={() => setHardness(h)}
                    className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${
                      hardness === h
                        ? 'bg-gray-800 text-white shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {h === 'soft' ? 'Soft' : 'Hard'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1">
              <p className="text-[10px] text-gray-400 mb-2">Light color</p>
              <ColorPickerBoard color={lightColor} onChange={setLightColor} hexToRgba={hexToRgba} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-200 flex justify-between">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleApply}
            disabled={isProcessing}
            className="px-5 py-1.5 text-sm text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
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
  );
};

export default RelightModal;
