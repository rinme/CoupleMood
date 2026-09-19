import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { X, Camera, AlertCircle } from 'lucide-react';
import { useTranslation } from '../i18n/index.js';

interface CameraScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (code: string) => void;
}

export const CameraScannerModal: React.FC<CameraScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
}) => {
  const { t } = useTranslation();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<any>(null);

  const stopCamera = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((track) => track.stop());
      } catch (err) {
        console.warn('Error stopping camera tracks:', err);
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsScanning(false);
  };

  const parseOtpCode = (scannedText: string): string | null => {
    const trimmed = scannedText.trim();

    // 1. Direct 6-digit code
    if (/^\d{6}$/.test(trimmed)) {
      return trimmed;
    }

    // 2. URL parameter match via regex /link?code=(\d{6}) or /code=(\d{6})
    const match = trimmed.match(/[?&]code=(\d{6})(?:[&#]|$)/);
    if (match && match[1]) {
      return match[1];
    }

    // 3. Fallback try parsing as URL
    try {
      const url = new URL(trimmed);
      const codeParam = url.searchParams.get('code');
      if (codeParam && /^\d{6}$/.test(codeParam)) {
        return codeParam;
      }
    } catch {
      // not a standard url
    }

    return null;
  };

  const startScanning = () => {
    if (scanIntervalRef.current) return;

    scanIntervalRef.current = setInterval(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) return;

      const videoWidth = video.videoWidth || 320;
      const videoHeight = video.videoHeight || 240;

      if (canvas.width !== videoWidth) canvas.width = videoWidth;
      if (canvas.height !== videoHeight) canvas.height = videoHeight;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, videoWidth, videoHeight);
      const imageData = ctx.getImageData(0, 0, videoWidth, videoHeight);

      if (imageData && typeof jsQR === 'function') {
        const qrCode = jsQR(imageData.data, imageData.width, imageData.height);
        if (qrCode && qrCode.data) {
          const extractedCode = parseOtpCode(qrCode.data);
          if (extractedCode) {
            stopCamera();
            onScanSuccess(extractedCode);
            onClose();
          }
        }
      }
    }, 200);
  };

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setErrorMessage(null);
      return;
    }

    let isCancelled = false;

    const initCamera = async () => {
      setErrorMessage(null);
      setIsScanning(true);

      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== 'function'
      ) {
        setErrorMessage(t.deviceLink.cameraPermError);
        setIsScanning(false);
        return;
      }

      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' },
          });
        } catch {
          // Fallback to any video device
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
          });
        }

        if (isCancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          try {
            videoRef.current.srcObject = stream;
          } catch {
            // happy-dom / mock environment compatibility
          }
          videoRef.current.setAttribute('playsinline', 'true');
          videoRef.current.play?.().catch(() => {});
        }

        startScanning();
      } catch (err) {
        if (!isCancelled) {
          console.warn('Camera access failed:', err);
          setErrorMessage(t.deviceLink.cameraPermError);
          setIsScanning(false);
        }
      }
    };

    initCamera();

    return () => {
      isCancelled = true;
      stopCamera();
    };
  }, [isOpen, t]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#FAF7F2] border border-[#E8E2D9] rounded-3xl p-6 max-w-sm w-full shadow-cozy-lg relative overflow-hidden">
        {/* Close Button */}
        <button
          type="button"
          onClick={() => {
            stopCamera();
            onClose();
          }}
          aria-label={t.deviceLink.closeCamera}
          className="absolute top-4 right-4 text-[#8C827A] hover:text-[#2D2825] p-1.5 rounded-full hover:bg-black/5 active:scale-90 transition-all z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Title */}
        <div className="text-center mb-4">
          <div className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-rose-50 text-rose-600 mb-2 border border-rose-200/70 shadow-cozy-xs">
            <Camera className="w-5 h-5" />
          </div>
          <h3 className="text-lg font-bold text-[#2D2825]">
            {t.deviceLink.cameraTitle}
          </h3>
          <p className="text-xs text-[#8C827A] mt-1">
            {t.deviceLink.scanHelp}
          </p>
        </div>

        {/* Camera Permission / Access Error */}
        {errorMessage ? (
          <div className="py-6 px-4 bg-rose-50 border border-rose-200 rounded-2xl text-center space-y-3 animate-fade-in">
            <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
            <p className="text-xs text-rose-800 leading-relaxed font-medium text-pretty">
              {errorMessage}
            </p>
            <button
              type="button"
              onClick={() => {
                stopCamera();
                onClose();
              }}
              className="mt-2 py-2 px-4 rounded-xl bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 font-semibold text-xs shadow-cozy-xs active:scale-95 transition-all"
            >
              {t.common.close}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Viewfinder Video Area */}
            <div className="relative w-full aspect-square bg-black rounded-2xl overflow-hidden shadow-inner flex items-center justify-center border border-[#E8E2D9]">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                playsInline
                muted
                autoPlay
              />

              {/* Viewfinder Overlay Targeting Frame */}
              <div className="absolute inset-8 border-2 border-dashed border-white/80 rounded-xl pointer-events-none flex items-center justify-center">
                <div className="w-full h-0.5 bg-rose-400/80 shadow-[0_0_8px_rgba(244,63,94,0.8)] animate-pulse" />
              </div>

              {/* Status Pill */}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-[11px] font-medium text-white/90">
                {isScanning ? t.common.loading : ''}
              </div>
            </div>

            {/* Hidden Canvas for Frame Processing */}
            <canvas ref={canvasRef} className="hidden" />

            {/* Close Camera Button */}
            <button
              type="button"
              onClick={() => {
                stopCamera();
                onClose();
              }}
              className="w-full py-2.5 px-4 bg-white hover:bg-white/80 border border-[#E8E2D9] text-[#2D2825] font-semibold text-xs rounded-xl shadow-cozy-xs flex items-center justify-center space-x-1.5 active:scale-[0.98] transition-all"
            >
              {t.deviceLink.closeCamera}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
