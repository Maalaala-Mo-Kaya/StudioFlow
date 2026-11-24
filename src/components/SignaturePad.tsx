import React, { useRef, useState, useEffect, useCallback } from 'react';
import { RotateCcw, Check } from 'lucide-react';

interface SignaturePadProps {
  onChange?: (blob: Blob | null, dataUrl?: string | null) => void;
  onSave?: (blob: Blob, dataUrl?: string) => void;
  onClear?: () => void;
  height?: number;
}

export const SignaturePad: React.FC<SignaturePadProps> = ({
  onChange,
  onSave,
  onClear,
  height = 180,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rectWidth = container.clientWidth || 320;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);

    canvas.width = rectWidth * ratio;
    canvas.height = height * ratio;
    ctx.scale(ratio, ratio);

    ctx.strokeStyle = '#0A0A0A';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, [height]);

  useEffect(() => {
    setupCanvas();
    const handleResize = () => {
      if (!hasSignature) {
        setupCanvas();
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [setupCanvas, hasSignature]);

  const getCoordinates = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();

    if ('touches' in e) {
      if (e.touches.length === 0) return null;
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const startDrawing = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    // The canvas uses touch-action: none, so passive touch events need no cancellation.
    if (!('touches' in e)) e.preventDefault();
    const coords = getCoordinates(e);
    if (!coords) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
    setIsDrawing(true);
  };

  const draw = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    if (!('touches' in e)) e.preventDefault();
    if (!isDrawing) return;
    const coords = getCoordinates(e);
    if (!coords) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
    if (!hasSignature) setHasSignature(true);
  };

  const exportBlob = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    canvas.toBlob((blob) => {
      if (blob) {
        onSave?.(blob, dataUrl);
        onChange?.(blob, dataUrl);
      }
    }, 'image/png');
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    exportBlob();
  };

  const clearCanvas = () => {
    setupCanvas();
    setHasSignature(false);
    onClear?.();
    onChange?.(null, null);
  };

  return (
    <div className="w-full" ref={containerRef}>
      <div
        className={`theme-paper relative bg-white overflow-hidden transition-colors border ${
          isDrawing
            ? 'border-gold ring-1 ring-gold'
            : hasSignature
            ? 'border-line'
            : 'border-neutral-400 hover:border-line'
        }`}
      >
        <span className="absolute top-2 left-2 w-2.5 h-2.5 border-t border-l border-neutral-400 pointer-events-none" />
        <span className="absolute top-2 right-2 w-2.5 h-2.5 border-t border-r border-neutral-400 pointer-events-none" />
        <span className="absolute bottom-2 left-2 w-2.5 h-2.5 border-b border-l border-neutral-400 pointer-events-none" />
        <span className="absolute bottom-2 right-2 w-2.5 h-2.5 border-b border-r border-neutral-400 pointer-events-none" />

        <div className="absolute inset-x-6 bottom-8 border-b border-neutral-300 pointer-events-none flex justify-between items-end pb-1">
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-neutral-400">
            SIGN X
          </span>
          <span className="text-[9px] font-mono uppercase tracking-widest text-neutral-400">
            CLIENT AUTHORIZATION
          </span>
        </div>

        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: `${height}px`, touchAction: 'none' }}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          aria-label="Digital Signature Pad"
          className="cursor-crosshair w-full block relative z-10"
        />

        {!hasSignature && !isDrawing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-neutral-400 px-4 text-center">
            <span className="text-xs font-mono uppercase tracking-widest text-neutral-500">
              [ Draw Signature Here ]
            </span>
          </div>
        )}
      </div>

      <div className="flex justify-between items-center mt-2">
        <div className="text-[11px] font-mono">
          {hasSignature ? (
            <span className="inline-flex items-center gap-1.5 font-bold text-ink bg-gold-wash border border-gold px-2.5 py-0.5 uppercase tracking-wider">
              <Check className="w-3 h-3 text-gold-soft" /> Recorded
            </span>
          ) : (
            <span className="text-neutral-500 uppercase tracking-wider">
              Awaiting signature input
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={clearCanvas}
          className="btn-tactile text-[11px] font-mono font-bold uppercase tracking-wider text-ink hover:text-on-gold bg-panel hover:bg-gold border border-neutral-400 hover:border-line flex items-center gap-1.5 px-3 py-1 cursor-pointer"
        >
          <RotateCcw className="w-3 h-3" /> Reset Pad
        </button>
      </div>
    </div>
  );
};
