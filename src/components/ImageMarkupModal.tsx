import React, { useState, useRef, useEffect } from 'react';
import * as fabric from 'fabric';

interface ImageMarkupModalProps {
  isOpen: boolean;
  imageUrl: string;
  originalImageUrl?: string;
  onClose: () => void;
  onSave: (markedImageDataUrl: string) => void;
}

type DrawTool = 'select' | 'pen' | 'circle' | 'rect' | 'arrow' | 'text' | 'eraser' | 'crop';

const TOOLS: { id: DrawTool; icon: string; label: string }[] = [
  { id: 'select', icon: '▹', label: '선택' },
  { id: 'pen', icon: '✎', label: '펜' },
  { id: 'circle', icon: '○', label: '원' },
  { id: 'rect', icon: '□', label: '사각형' },
  { id: 'arrow', icon: '→', label: '화살표' },
  { id: 'text', icon: 'T', label: '텍스트' },
  { id: 'eraser', icon: '◎', label: '지우개' },
];

const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#000000', '#ffffff'];
const WIDTHS = [2, 4, 6, 8];

const ImageMarkupModal: React.FC<ImageMarkupModalProps> = ({ isOpen, imageUrl, originalImageUrl, onClose, onSave }) => {
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fcRef = useRef<fabric.Canvas | null>(null);
  const [tool, setTool] = useState<DrawTool>('select');
  const [color, setColor] = useState('#ef4444');
  const [lineWidth, setLineWidth] = useState(3);
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 600 });
  const scaleRef = useRef(1);
  const originalImgRef = useRef<HTMLImageElement | null>(null);
  const isShapeDrawing = useRef(false);
  const shapeStartRef = useRef<{ x: number; y: number } | null>(null);
  const tempObjRef = useRef<fabric.FabricObject | null>(null);
  const colorRef = useRef(color);
  const lineWidthRef = useRef(lineWidth);
  const toolRef = useRef(tool);
  const eraserPoints = useRef<{ x: number; y: number }[]>([]);
  const [cropRect, setCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [cropRatio, setCropRatio] = useState<number | null>(null); // null = free, number = w/h
  const cropRatioRef = useRef<number | null>(null);
  cropRatioRef.current = cropRatio;
  const cropStartRef = useRef<{ x: number; y: number } | null>(null);
  const isCropDragging = useRef(false);
  const cropAction = useRef<'none' | 'move' | 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se'>('none');
  const cropMoveOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const cropRectRef = useRef(cropRect);
  cropRectRef.current = cropRect;
  colorRef.current = color;
  lineWidthRef.current = lineWidth;
  toolRef.current = tool;

  const buildEraserCursor = (size: number) => {
    const r = Math.max(size / 2, 8);
    const d = r * 2 + 4;
    const center = d / 2;
    const cvs = document.createElement('canvas');
    cvs.width = d;
    cvs.height = d;
    const ctx = cvs.getContext('2d');
    if (!ctx) return 'crosshair';
    // Outer circle
    ctx.beginPath();
    ctx.arc(center, center, r, 0, Math.PI * 2);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    // Center dot
    ctx.beginPath();
    ctx.arc(center, center, 2, 0, Math.PI * 2);
    ctx.fillStyle = '#555';
    ctx.fill();
    return `url(${cvs.toDataURL()}) ${center} ${center}, crosshair`;
  };

  // Initialize
  useEffect(() => {
    if (!isOpen || !imageUrl) return;

    // Reset tool to select so UI and canvas are in sync
    setTool('select');
    toolRef.current = 'select';
    setCropRect(null);

    // Load the current image (may include previous markings)
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const maxW = Math.min(1200, window.innerWidth - 100);
      const maxH = Math.min(800, window.innerHeight - 200);
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);
      scaleRef.current = scale;

      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      setCanvasSize({ w, h });

      // If we have an original, load it separately for save/reset
      const origSrc = originalImageUrl || imageUrl;
      const origImg = new Image();
      origImg.crossOrigin = 'anonymous';
      origImg.onload = () => {
        originalImgRef.current = origImg;
      };
      origImg.src = origSrc;

      requestAnimationFrame(() => {
        // Draw current image (with previous markings) as background
        const bgCanvas = bgCanvasRef.current;
        if (bgCanvas) {
          bgCanvas.width = w;
          bgCanvas.height = h;
          const bgCtx = bgCanvas.getContext('2d');
          if (bgCtx) {
            bgCtx.drawImage(img, 0, 0, w, h);
          }
        }

        if (!canvasElRef.current) return;

        // Dispose previous
        if (fcRef.current) {
          fcRef.current.dispose();
          fcRef.current = null;
        }

        // Fabric canvas with transparent background (drawing layer only)
        const fc = new fabric.Canvas(canvasElRef.current, {
          width: w,
          height: h,
          selection: false,
          backgroundColor: 'transparent',
        });
        fcRef.current = fc;

        // Start in select mode
        fc.isDrawingMode = false;
        fc.selection = true;

        // Shape drawing events
        fc.on('mouse:down', onMouseDown);
        fc.on('mouse:move', onMouseMove);
        fc.on('mouse:up', onMouseUp);
      });
    };
    img.src = imageUrl;

    return () => {
      if (fcRef.current) {
        fcRef.current.dispose();
        fcRef.current = null;
      }
    };
  }, [isOpen, imageUrl]);

  // ---- Eraser helpers ----
  const eraseAtPoint = (fc: fabric.Canvas, x: number, y: number) => {
    const lowerEl = fc.getElement();
    const ctx = lowerEl.getContext('2d');
    if (!ctx) return;
    const r = lineWidthRef.current * 2;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  const commitEraserPath = (fc: fabric.Canvas) => {
    const points = eraserPoints.current;
    if (points.length < 2) { eraserPoints.current = []; return; }

    // Build SVG path string
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L ${points[i].x} ${points[i].y}`;
    }

    const path = new fabric.Path(d, {
      fill: 'transparent',
      stroke: 'black',
      strokeWidth: lineWidthRef.current * 4,
      strokeLineCap: 'round',
      strokeLineJoin: 'round',
      globalCompositeOperation: 'destination-out',
      selectable: false,
      evented: false,
    });
    fc.add(path);
    fc.renderAll();
    eraserPoints.current = [];
  };

  // ---- Shape drawing handlers ----
  const onMouseDown = (opt: any) => {
    const fc = fcRef.current;
    if (!fc) return;
    const t = toolRef.current;

    if (t === 'eraser') {
      isShapeDrawing.current = true;
      const pointer = fc.getScenePoint(opt.e);
      eraserPoints.current = [{ x: pointer.x, y: pointer.y }];
      eraseAtPoint(fc, pointer.x, pointer.y);
      return;
    }

    if (t === 'pen' || t === 'select') return;

    const pointer = fc.getScenePoint(opt.e);
    shapeStartRef.current = { x: pointer.x, y: pointer.y };
    isShapeDrawing.current = true;

    const c = colorRef.current;
    const lw = lineWidthRef.current;

    if (t === 'text') {
      const text = new fabric.IText('', {
        left: pointer.x,
        top: pointer.y,
        fontSize: Math.max(18, lw * 4),
        fill: c,
        fontFamily: 'sans-serif',
        selectable: true,
        evented: true,
      });
      fc.add(text);
      fc.setActiveObject(text);
      text.enterEditing();
      isShapeDrawing.current = false;
      // Switch to select mode so text can be moved right away after typing
      switchTool('select');
      // Re-enter editing since switchTool may have disrupted it
      fc.setActiveObject(text);
      text.enterEditing();
      return;
    }

    let obj: fabric.FabricObject | null = null;

    if (t === 'circle') {
      obj = new fabric.Ellipse({
        left: pointer.x,
        top: pointer.y,
        rx: 0,
        ry: 0,
        fill: 'transparent',
        stroke: c,
        strokeWidth: lw,
        originX: 'center',
        originY: 'center',
        selectable: false,
        evented: false,
      });
    } else if (t === 'rect') {
      obj = new fabric.Rect({
        left: pointer.x,
        top: pointer.y,
        width: 0,
        height: 0,
        fill: 'transparent',
        stroke: c,
        strokeWidth: lw,
        selectable: false,
        evented: false,
      });
    } else if (t === 'arrow') {
      obj = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
        stroke: c,
        strokeWidth: lw,
        strokeLineCap: 'round',
        selectable: false,
        evented: false,
      });
    }

    if (obj) {
      tempObjRef.current = obj;
      fc.add(obj);
      fc.renderAll();
    }
  };

  const onMouseMove = (opt: any) => {
    const fc = fcRef.current;
    if (!fc || !isShapeDrawing.current) return;
    const t = toolRef.current;

    if (t === 'eraser') {
      const pointer = fc.getScenePoint(opt.e);
      eraserPoints.current.push({ x: pointer.x, y: pointer.y });
      eraseAtPoint(fc, pointer.x, pointer.y);
      return;
    }

    if (!shapeStartRef.current || !tempObjRef.current) return;
    if (t === 'pen' || t === 'select' || t === 'text') return;

    const pointer = fc.getScenePoint(opt.e);
    const start = shapeStartRef.current;

    if (t === 'circle') {
      const ellipse = tempObjRef.current as fabric.Ellipse;
      const cx = (start.x + pointer.x) / 2;
      const cy = (start.y + pointer.y) / 2;
      ellipse.set({
        left: cx,
        top: cy,
        rx: Math.abs(pointer.x - start.x) / 2,
        ry: Math.abs(pointer.y - start.y) / 2,
      });
      ellipse.setCoords();
    } else if (t === 'rect') {
      const rect = tempObjRef.current as fabric.Rect;
      rect.set({
        left: Math.min(start.x, pointer.x),
        top: Math.min(start.y, pointer.y),
        width: Math.abs(pointer.x - start.x),
        height: Math.abs(pointer.y - start.y),
      });
      rect.setCoords();
    } else if (t === 'arrow') {
      const line = tempObjRef.current as fabric.Line;
      line.set({ x2: pointer.x, y2: pointer.y });
      line.setCoords();
    }

    fc.renderAll();
  };

  const onMouseUp = (_opt: any) => {
    const fc = fcRef.current;
    if (!fc) return;
    const t = toolRef.current;

    if (t === 'eraser') {
      // Save eraser stroke as a permanent destination-out path
      commitEraserPath(fc);
      isShapeDrawing.current = false;
      return;
    }

    if (t === 'arrow' && tempObjRef.current && shapeStartRef.current) {
      const line = tempObjRef.current as fabric.Line;
      const x1 = line.x1!, y1 = line.y1!, x2 = line.x2!, y2 = line.y2!;
      const len = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

      if (len > 5) {
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const headLen = Math.max(10, lineWidthRef.current * 3);
        const head = new fabric.Polygon([
          { x: x2, y: y2 },
          { x: x2 - headLen * Math.cos(angle - Math.PI / 6), y: y2 - headLen * Math.sin(angle - Math.PI / 6) },
          { x: x2 - headLen * Math.cos(angle + Math.PI / 6), y: y2 - headLen * Math.sin(angle + Math.PI / 6) },
        ], {
          fill: colorRef.current,
          stroke: colorRef.current,
          strokeWidth: 1,
          selectable: false,
          evented: false,
        });
        fc.add(head);
      }
    }

    let drawnObj: fabric.FabricObject | null = null;
    let tooSmall = false;

    if (tempObjRef.current) {
      const obj = tempObjRef.current;
      if (t === 'circle') {
        const e = obj as fabric.Ellipse;
        if ((e.rx ?? 0) < 3 && (e.ry ?? 0) < 3) { fc.remove(obj); tooSmall = true; }
        else drawnObj = obj;
      } else if (t === 'rect') {
        const r = obj as fabric.Rect;
        if ((r.width ?? 0) < 3 && (r.height ?? 0) < 3) { fc.remove(obj); tooSmall = true; }
        else drawnObj = obj;
      } else if (t === 'arrow') {
        drawnObj = obj;
      }
    }

    fc.forEachObject(obj => obj.setCoords());
    isShapeDrawing.current = false;
    shapeStartRef.current = null;
    tempObjRef.current = null;
    fc.renderAll();

    // Auto-switch to select mode after drawing circle/rect/arrow
    if ((t === 'circle' || t === 'rect' || t === 'arrow') && drawnObj && !tooSmall) {
      switchTool('select');
      drawnObj.set({ selectable: true, evented: true });
      drawnObj.setCoords();
      fc.setActiveObject(drawnObj);
      fc.renderAll();
    }
  };

  // ---- Tool switching ----
  const switchTool = (newTool: DrawTool) => {
    setTool(newTool);
    toolRef.current = newTool;
    const fc = fcRef.current;
    if (!fc) return;

    fc.isDrawingMode = false;
    fc.selection = false;
    fc.defaultCursor = 'default';
    fc.hoverCursor = 'default';
    fc.moveCursor = 'default';
    fc.freeDrawingCursor = 'crosshair';
    // Force reset upper canvas cursor
    const upper = (fc as any).upperCanvasEl || (fc as any).wrapperEl?.querySelector('.upper-canvas');
    if (upper) upper.style.cursor = 'default';
    fc.forEachObject(obj => {
      obj.set({ selectable: false, evented: false });
    });

    if (newTool === 'select') {
      fc.selection = true;
      fc.forEachObject(obj => {
        // Don't make eraser paths selectable
        if ((obj as any).globalCompositeOperation === 'destination-out') return;
        obj.set({ selectable: true, evented: true });
      });
    } else if (newTool === 'pen') {
      fc.isDrawingMode = true;
      const brush = new fabric.PencilBrush(fc);
      brush.color = colorRef.current;
      brush.width = lineWidthRef.current;
      fc.freeDrawingBrush = brush;
    } else if (newTool === 'eraser') {
      fc.isDrawingMode = false;
      fc.selection = false;
      fc.defaultCursor = buildEraserCursor(lineWidthRef.current * 4);
      fc.hoverCursor = buildEraserCursor(lineWidthRef.current * 4);
    } else if (newTool === 'crop') {
      fc.isDrawingMode = false;
      fc.selection = false;
      fc.defaultCursor = 'crosshair';
      fc.hoverCursor = 'crosshair';
      setCropRect(null);
    }
  };

  // Update brush color/width live + apply to selected objects
  useEffect(() => {
    const fc = fcRef.current;
    if (!fc) return;
    if (tool === 'pen' && fc.freeDrawingBrush) {
      fc.freeDrawingBrush.color = color;
      fc.freeDrawingBrush.width = lineWidth;
    } else if (tool === 'eraser') {
      fc.defaultCursor = buildEraserCursor(lineWidth * 4);
      fc.hoverCursor = buildEraserCursor(lineWidth * 4);
    }
    // Apply color/size to selected objects
    const active = fc.getActiveObject();
    if (active) {
      if (active.type === 'i-text') {
        (active as fabric.IText).set({ fill: color, fontSize: Math.max(18, lineWidth * 4) });
      } else {
        active.set({ stroke: color, strokeWidth: lineWidth });
      }
      fc.renderAll();
    }
  }, [color, lineWidth, tool]);

  // ---- Actions ----
  const handleUndo = () => {
    const fc = fcRef.current;
    if (!fc) return;
    const objects = fc.getObjects();
    if (objects.length === 0) return;
    fc.remove(objects[objects.length - 1]);
    fc.renderAll();
  };

  const handleDeleteSelected = () => {
    const fc = fcRef.current;
    if (!fc) return;
    const active = fc.getActiveObjects();
    active.forEach(obj => fc.remove(obj));
    fc.discardActiveObject();
    fc.renderAll();
  };

  // Flip / Rotate helpers — transform the background image + clear fabric drawings
  const transformBgImage = (transform: 'flipH' | 'flipV' | 'rotateCW' | 'rotateCCW') => {
    const origImg = originalImgRef.current;
    const bgCanvas = bgCanvasRef.current;
    if (!origImg || !bgCanvas) return;

    // Create temp canvas with current bg content
    const src = document.createElement('canvas');
    src.width = bgCanvas.width;
    src.height = bgCanvas.height;
    const srcCtx = src.getContext('2d')!;
    srcCtx.drawImage(bgCanvas, 0, 0);

    const isRotate = transform === 'rotateCW' || transform === 'rotateCCW';

    if (isRotate) {
      // Swap dimensions
      const newW = bgCanvas.height;
      const newH = bgCanvas.width;
      bgCanvas.width = newW;
      bgCanvas.height = newH;

      // Update canvas size state
      setCanvasSize({ w: newW, h: newH });

      // Update original image ref (rotate the stored original too)
      const origCanvas = document.createElement('canvas');
      origCanvas.width = origImg.height;
      origCanvas.height = origImg.width;
      const origCtx = origCanvas.getContext('2d')!;
      origCtx.save();
      if (transform === 'rotateCW') {
        origCtx.translate(origCanvas.width, 0);
        origCtx.rotate(Math.PI / 2);
      } else {
        origCtx.translate(0, origCanvas.height);
        origCtx.rotate(-Math.PI / 2);
      }
      origCtx.drawImage(origImg, 0, 0);
      origCtx.restore();
      const newOrigImg = new Image();
      newOrigImg.crossOrigin = 'anonymous';
      newOrigImg.onload = () => { originalImgRef.current = newOrigImg; };
      newOrigImg.src = origCanvas.toDataURL();
    } else {
      // Flip — keep same dimensions, update original
      const origCanvas = document.createElement('canvas');
      origCanvas.width = origImg.width;
      origCanvas.height = origImg.height;
      const origCtx = origCanvas.getContext('2d')!;
      origCtx.save();
      if (transform === 'flipH') {
        origCtx.translate(origImg.width, 0);
        origCtx.scale(-1, 1);
      } else {
        origCtx.translate(0, origImg.height);
        origCtx.scale(1, -1);
      }
      origCtx.drawImage(origImg, 0, 0);
      origCtx.restore();
      const newOrigImg = new Image();
      newOrigImg.crossOrigin = 'anonymous';
      newOrigImg.onload = () => { originalImgRef.current = newOrigImg; };
      newOrigImg.src = origCanvas.toDataURL();
    }

    // Draw transformed bg
    const bgCtx = bgCanvas.getContext('2d')!;
    bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
    bgCtx.save();
    if (transform === 'flipH') {
      bgCtx.translate(bgCanvas.width, 0);
      bgCtx.scale(-1, 1);
      bgCtx.drawImage(src, 0, 0);
    } else if (transform === 'flipV') {
      bgCtx.translate(0, bgCanvas.height);
      bgCtx.scale(1, -1);
      bgCtx.drawImage(src, 0, 0);
    } else if (transform === 'rotateCW') {
      bgCtx.translate(bgCanvas.width, 0);
      bgCtx.rotate(Math.PI / 2);
      bgCtx.drawImage(src, 0, 0);
    } else {
      bgCtx.translate(0, bgCanvas.height);
      bgCtx.rotate(-Math.PI / 2);
      bgCtx.drawImage(src, 0, 0);
    }
    bgCtx.restore();

    // Clear fabric drawings (they won't match after transform)
    const fc = fcRef.current;
    if (fc) {
      fc.getObjects().slice().forEach(obj => fc.remove(obj));
      fc.discardActiveObject();
      if (isRotate) {
        fc.setDimensions({ width: bgCanvas.width, height: bgCanvas.height });
      }
      fc.renderAll();
    }
  };

  const handleReset = () => {
    const fc = fcRef.current;
    if (!fc) return;
    fc.getObjects().slice().forEach(obj => fc.remove(obj));
    fc.discardActiveObject();
    fc.renderAll();
    // Restore background to original image
    const origImg = originalImgRef.current;
    const bgCanvas = bgCanvasRef.current;
    if (origImg && bgCanvas) {
      const bgCtx = bgCanvas.getContext('2d');
      if (bgCtx) {
        bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
        bgCtx.drawImage(origImg, 0, 0, bgCanvas.width, bgCanvas.height);
      }
    }
  };

  // Crop mouse handlers
  const HANDLE_SIZE = 8; // px from edge to detect handle drag

  const getCropHitZone = (x: number, y: number, cr: { x: number; y: number; w: number; h: number }) => {
    const { x: cx, y: cy, w: cw, h: ch } = cr;
    const H = HANDLE_SIZE;
    const inX = x >= cx - H && x <= cx + cw + H;
    const inY = y >= cy - H && y <= cy + ch + H;
    if (!inX || !inY) return 'outside';

    const onN = Math.abs(y - cy) <= H;
    const onS = Math.abs(y - (cy + ch)) <= H;
    const onW = Math.abs(x - cx) <= H;
    const onE = Math.abs(x - (cx + cw)) <= H;

    if (onN && onW) return 'nw';
    if (onN && onE) return 'ne';
    if (onS && onW) return 'sw';
    if (onS && onE) return 'se';
    if (onN) return 'n';
    if (onS) return 's';
    if (onW) return 'w';
    if (onE) return 'e';
    if (x >= cx && x <= cx + cw && y >= cy && y <= cy + ch) return 'move';
    return 'outside';
  };

  const handleCropMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (tool !== 'crop') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if interacting with existing crop
    if (cropRect && cropRect.w > 5 && cropRect.h > 5) {
      const zone = getCropHitZone(x, y, cropRect);
      if (zone !== 'outside') {
        cropAction.current = zone as any;
        cropMoveOffset.current = { x: x - cropRect.x, y: y - cropRect.y };
        return;
      }
    }

    // Otherwise start a new crop selection
    cropStartRef.current = { x, y };
    isCropDragging.current = true;
    cropAction.current = 'none';
    setCropRect({ x, y, w: 0, h: 0 });
  };

  const handleCropMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (tool !== 'crop') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const curX = Math.max(0, Math.min(e.clientX - rect.left, canvasSize.w));
    const curY = Math.max(0, Math.min(e.clientY - rect.top, canvasSize.h));
    const cr = cropRectRef.current;
    const action = cropAction.current;

    const ratio = cropRatioRef.current;

    // Resize or move existing crop
    if (action !== 'none' && cr) {
      let { x: nx, y: ny, w: nw, h: nh } = cr;

      if (action === 'move') {
        nx = Math.max(0, Math.min(curX - cropMoveOffset.current.x, canvasSize.w - nw));
        ny = Math.max(0, Math.min(curY - cropMoveOffset.current.y, canvasSize.h - nh));
      } else {
        // Resize edges
        if (action.includes('n')) {
          const bottom = ny + nh;
          ny = Math.min(curY, bottom - 10);
          nh = bottom - ny;
        }
        if (action.includes('s')) {
          nh = Math.max(10, curY - ny);
        }
        if (action.includes('w')) {
          const right = nx + nw;
          nx = Math.min(curX, right - 10);
          nw = right - nx;
        }
        if (action.includes('e')) {
          nw = Math.max(10, curX - nx);
        }
        // Enforce ratio on resize
        if (ratio) {
          if (action === 'n' || action === 's') {
            nw = nh * ratio;
          } else {
            nh = nw / ratio;
          }
        }
        // Clamp to canvas
        if (nx < 0) { nw += nx; nx = 0; }
        if (ny < 0) { nh += ny; ny = 0; }
        if (nx + nw > canvasSize.w) nw = canvasSize.w - nx;
        if (ny + nh > canvasSize.h) nh = canvasSize.h - ny;
      }

      setCropRect({ x: nx, y: ny, w: nw, h: nh });
      return;
    }

    // Drawing new crop
    if (!isCropDragging.current || !cropStartRef.current) return;
    const start = cropStartRef.current;
    let w = Math.abs(curX - start.x);
    let h = Math.abs(curY - start.y);
    if (ratio) {
      // Constrain by the larger dimension
      const hFromW = w / ratio;
      const wFromH = h * ratio;
      if (hFromW <= h) { h = hFromW; } else { w = wFromH; }
    }
    const x = curX >= start.x ? start.x : start.x - w;
    const y = curY >= start.y ? start.y : start.y - h;
    setCropRect({ x, y, w, h });
  };

  const handleCropMouseUp = () => {
    isCropDragging.current = false;
    cropAction.current = 'none';
    cropStartRef.current = null;
  };

  const applyCrop = () => {
    if (!cropRect || cropRect.w < 10 || cropRect.h < 10) return;
    const origImg = originalImgRef.current;
    const fc = fcRef.current;
    if (!origImg || !fc) return;

    const scale = 1 / scaleRef.current;

    // Crop coordinates in original image space
    const sx = cropRect.x * scale;
    const sy = cropRect.y * scale;
    const sw = cropRect.w * scale;
    const sh = cropRect.h * scale;

    // Compose: original image + drawing layer, then crop
    const outCanvas = document.createElement('canvas');
    outCanvas.width = sw;
    outCanvas.height = sh;
    const ctx = outCanvas.getContext('2d');
    if (!ctx) return;

    // Draw original image cropped
    ctx.drawImage(origImg, sx, sy, sw, sh, 0, 0, sw, sh);

    // Draw fabric layer cropped
    fc.discardActiveObject();
    fc.renderAll();
    const fabricEl = fc.getElement();
    ctx.drawImage(fabricEl, cropRect.x, cropRect.y, cropRect.w, cropRect.h, 0, 0, sw, sh);

    setCropRect(null);
    onSave(outCanvas.toDataURL('image/png'));
  };

  const cancelCrop = () => {
    setCropRect(null);
  };

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      const fc = fcRef.current;
      if (!fc) return;
      const active = fc.getActiveObject();
      if (active && active.type === 'i-text' && (active as fabric.IText).isEditing) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        handleDeleteSelected();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  const handleSave = () => {
    const fc = fcRef.current;
    const origImg = originalImgRef.current;
    if (!fc || !origImg) return;

    fc.discardActiveObject();
    fc.renderAll();

    // Compose: original image + drawing layer at original resolution
    const outCanvas = document.createElement('canvas');
    outCanvas.width = origImg.width;
    outCanvas.height = origImg.height;
    const ctx = outCanvas.getContext('2d');
    if (!ctx) return;

    // 1. Draw original image
    ctx.drawImage(origImg, 0, 0);

    // 2. Draw Fabric layer (transparent bg, drawings only) scaled up
    const fabricEl = fc.getElement();
    const scale = 1 / scaleRef.current;
    ctx.save();
    ctx.scale(scale, scale);
    ctx.drawImage(fabricEl, 0, 0);
    ctx.restore();

    onSave(outCanvas.toDataURL('image/png'));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div
        className="bg-white rounded-xl shadow-2xl max-w-[95vw] max-h-[95vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Toolbar */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200">
          <div className="flex items-center gap-1.5">
            {/* Drawing tools */}
            <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
              {TOOLS.map(t => (
                <button
                  key={t.id}
                  onClick={() => switchTool(t.id)}
                  className={`flex flex-col items-center w-9 py-1 rounded-md transition-all ${
                    tool === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                  title={t.label}
                >
                  <span className="text-sm leading-none">{t.icon}</span>
                  <span className="text-[9px] leading-none mt-0.5">{t.label}</span>
                </button>
              ))}
            </div>

            <div className="h-8 w-px bg-gray-200" />

            {/* Colors */}
            <div className="flex items-center gap-1">
              {COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-5 h-5 rounded-full border-2 transition-all ${
                    color === c ? 'border-gray-800 scale-125' : 'border-gray-300'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>

            <div className="h-8 w-px bg-gray-200" />

            {/* Widths */}
            <div className="flex items-center gap-0.5">
              {WIDTHS.map(w => (
                <button
                  key={w}
                  onClick={() => setLineWidth(w)}
                  className={`flex items-center justify-center w-6 h-6 rounded transition-all ${
                    lineWidth === w ? 'bg-gray-200' : 'hover:bg-gray-100'
                  }`}
                >
                  <div className="rounded-full bg-gray-700" style={{ width: w + 1, height: w + 1 }} />
                </button>
              ))}
            </div>

            <div className="h-8 w-px bg-gray-200" />

            {/* Actions */}
            <button onClick={handleUndo} className="flex flex-col items-center w-9 py-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md" title="Ctrl+Z">
              <span className="text-sm leading-none">↩</span>
              <span className="text-[9px] leading-none mt-0.5">되돌리기</span>
            </button>
            <button onClick={handleDeleteSelected} className="flex flex-col items-center w-9 py-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md" title="Delete">
              <span className="text-sm leading-none">✕</span>
              <span className="text-[9px] leading-none mt-0.5">삭제</span>
            </button>
            <button onClick={handleReset} className="flex flex-col items-center w-9 py-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md">
              <span className="text-sm leading-none">↺</span>
              <span className="text-[9px] leading-none mt-0.5">초기화</span>
            </button>

            <div className="h-8 w-px bg-gray-200" />

            {/* Crop */}
            <button
              onClick={() => switchTool('crop')}
              className={`flex flex-col items-center w-9 py-1 rounded-md transition-all ${
                tool === 'crop' ? 'bg-purple-100 text-purple-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
              title="자르기"
            >
              <span className="text-sm leading-none">✂</span>
              <span className="text-[9px] leading-none mt-0.5">자르기</span>
            </button>

            <div className="h-8 w-px bg-gray-200" />

            {/* Flip / Rotate */}
            <button onClick={() => transformBgImage('flipH')} className="flex flex-col items-center w-9 py-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md" title="좌우 반전">
              <span className="text-sm leading-none">⇔</span>
              <span className="text-[9px] leading-none mt-0.5">좌우</span>
            </button>
            <button onClick={() => transformBgImage('flipV')} className="flex flex-col items-center w-9 py-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md" title="상하 반전">
              <span className="text-sm leading-none">⇕</span>
              <span className="text-[9px] leading-none mt-0.5">상하</span>
            </button>
            <button onClick={() => transformBgImage('rotateCW')} className="flex flex-col items-center w-9 py-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md" title="시계 방향 회전">
              <span className="text-sm leading-none">↻</span>
              <span className="text-[9px] leading-none mt-0.5">회전</span>
            </button>
          </div>

          <button onClick={onClose} className="p-1.5 ml-2 text-gray-400 hover:text-gray-600 rounded">
            ✕
          </button>
        </div>

        {/* Canvas area: background image + transparent Fabric overlay */}
        <div
          ref={containerRef}
          className="flex-1 overflow-auto p-4 flex items-center justify-center bg-gray-50"
        >
          <div
            className="rounded-lg shadow-lg overflow-hidden border border-gray-200 relative"
            style={{ width: canvasSize.w, height: canvasSize.h }}
            onMouseDown={handleCropMouseDown}
            onMouseMove={handleCropMouseMove}
            onMouseUp={handleCropMouseUp}
            onMouseLeave={handleCropMouseUp}
          >
            {/* Background image layer (untouched by eraser) */}
            <canvas
              ref={bgCanvasRef}
              className="absolute inset-0"
              style={{ width: canvasSize.w, height: canvasSize.h }}
            />
            {/* Fabric drawing layer (transparent, eraser only affects this) */}
            <canvas ref={canvasElRef} className="absolute inset-0" style={{ pointerEvents: tool === 'crop' ? 'none' : 'auto' }} />
            {/* Crop overlay */}
            {tool === 'crop' && cropRect && cropRect.w > 0 && cropRect.h > 0 && (
              <>
                {/* Dim area outside crop */}
                <div className="absolute inset-0 pointer-events-none" style={{ background: 'rgba(0,0,0,0.5)', clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${cropRect.x}px ${cropRect.y}px, ${cropRect.x}px ${cropRect.y + cropRect.h}px, ${cropRect.x + cropRect.w}px ${cropRect.y + cropRect.h}px, ${cropRect.x + cropRect.w}px ${cropRect.y}px, ${cropRect.x}px ${cropRect.y}px)` }} />
                {/* Crop border + handles */}
                <div
                  className="absolute border-2 border-white pointer-events-none"
                  style={{ left: cropRect.x, top: cropRect.y, width: cropRect.w, height: cropRect.h, boxShadow: '0 0 0 1px rgba(0,0,0,0.3)' }}
                >
                  {/* Corner handles */}
                  <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border border-gray-400 cursor-nw-resize pointer-events-auto" />
                  <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border border-gray-400 cursor-ne-resize pointer-events-auto" />
                  <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border border-gray-400 cursor-sw-resize pointer-events-auto" />
                  <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border border-gray-400 cursor-se-resize pointer-events-auto" />
                  {/* Edge handles */}
                  <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-6 h-2 bg-white/80 border border-gray-400 rounded-sm cursor-n-resize pointer-events-auto" />
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-6 h-2 bg-white/80 border border-gray-400 rounded-sm cursor-s-resize pointer-events-auto" />
                  <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-6 bg-white/80 border border-gray-400 rounded-sm cursor-w-resize pointer-events-auto" />
                  <div className="absolute top-1/2 -right-1 -translate-y-1/2 w-2 h-6 bg-white/80 border border-gray-400 rounded-sm cursor-e-resize pointer-events-auto" />
                  {/* Size indicator */}
                  <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap">
                    {Math.round(cropRect.w / scaleRef.current)} × {Math.round(cropRect.h / scaleRef.current)}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
          {tool === 'crop' ? (
            <>
              <div className="flex items-center gap-2">
                <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                  {([
                    { label: '자유', value: null },
                    { label: '1:1', value: 1 },
                    { label: '4:3', value: 4/3 },
                    { label: '3:4', value: 3/4 },
                    { label: '16:9', value: 16/9 },
                    { label: '9:16', value: 9/16 },
                  ] as { label: string; value: number | null }[]).map(r => (
                    <button
                      key={r.label}
                      onClick={() => {
                        setCropRatio(r.value);
                        if (r.value !== null) {
                          // Auto-create crop rect centered on canvas with the selected ratio
                          const cw = canvasSize.w;
                          const ch = canvasSize.h;
                          let rw: number, rh: number;
                          if (r.value >= cw / ch) {
                            rw = cw * 0.8;
                            rh = rw / r.value;
                          } else {
                            rh = ch * 0.8;
                            rw = rh * r.value;
                          }
                          setCropRect({ x: (cw - rw) / 2, y: (ch - rh) / 2, w: rw, h: rh });
                        } else {
                          setCropRect(null);
                        }
                      }}
                      className={`px-2 py-1 text-[10px] rounded-md transition-all ${
                        cropRatio === r.value ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                {cropRect && cropRect.w > 10 && cropRect.h > 10 && (
                  <span className="text-[10px] text-gray-400">
                    {Math.round(cropRect.w / scaleRef.current)} × {Math.round(cropRect.h / scaleRef.current)}px
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                {cropRect && cropRect.w > 10 && cropRect.h > 10 ? (
                  <>
                    <button
                      onClick={cancelCrop}
                      className="px-4 py-1.5 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg"
                    >
                      취소
                    </button>
                    <button
                      onClick={applyCrop}
                      className="px-4 py-1.5 text-sm text-white bg-purple-600 hover:bg-purple-700 rounded-lg"
                    >
                      ✂ 자르기 적용
                    </button>
                  </>
                ) : (
                  <button
                    onClick={onClose}
                    className="px-4 py-1.5 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg"
                  >
                    취소
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-gray-400">
                그림판처럼 자유롭게 그리세요 · 선택 모드에서 도형 이동/크기조절 · Ctrl+Z 되돌리기 · Delete 삭제
              </p>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-1.5 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg"
                >
                  취소
                </button>
                <button
                  onClick={handleSave}
                  className="px-4 py-1.5 text-sm text-white bg-gray-800 hover:bg-gray-900 rounded-lg"
                >
                  적용
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImageMarkupModal;
