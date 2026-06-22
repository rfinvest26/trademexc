import React, { useEffect, useRef, useState } from 'react';
import { Scan, X } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { Html5Qrcode } from 'html5-qrcode';
import { Haptic } from '../utils/haptics';
import { useLanguage } from '../context/LanguageContext';
import BottomSheetFooter from '../components/BottomSheetFooter';

interface QRScannerPageProps {
  onBack: () => void;
  onScan?: (data: string) => void;
}

const QRScannerPage: React.FC<QRScannerPageProps> = ({ onBack, onScan }) => {
  const { t } = useLanguage();
  const [status, setStatus] = useState<'idle' | 'scanning' | 'success' | 'error'>('idle');
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const stoppingRef = useRef(false);
  const containerId = 'qr-reader';

  const handleQrResult = async (text: string) => {
    Haptic.medium();
    setLastResult(text);
    setStatus('success');
    onScan?.(text);
  };

  const startScanning = async () => {
    setErrorMsg(null);

    setStatus('scanning');
    try {
      // ensure previous instance is stopped
      await stopScanning(true);
      const html5QrCode = new Html5Qrcode(containerId);
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        async (decodedText) => {
          // prevent duplicate callbacks
          if (stoppingRef.current) return;
          stoppingRef.current = true;
          await stopScanning(true);
          stoppingRef.current = false;
          await handleQrResult(decodedText);
        },
        () => {}
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('camera_open_failed');
      setErrorMsg(msg);
      setStatus('error');
      scannerRef.current = null;
    }
  };

  const stopScanning = async (keepResult?: boolean) => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        // best-effort release camera
        try { await scannerRef.current.clear(); } catch {}
      } catch {}
      scannerRef.current = null;
    }
    if (!keepResult) {
      setStatus('idle');
      setLastResult(null);
    }
  };

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  return (
    <div className="flex flex-col h-full bg-background animate-fade-in">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Scan size={20} className="text-neon" />
            {t('qr_scanner_title')}
          </span>
        }
        onBack={() => { stopScanning(); onBack(); }}
      />
      <div className="flex-1 flex flex-col items-center justify-center px-4 pt-4 pb-6">
        {status === 'idle' && (
          <div className="text-center">
            <div className="w-24 h-24 rounded-3xl bg-card/35 flex items-center justify-center mx-auto mb-6">
              <Scan size={48} className="text-neon" />
            </div>
            <p className="text-neutral-400 text-sm mb-6 max-w-xs">
              {t('qr_scanner_hint')}
            </p>
            <button
              onClick={() => { Haptic.tap(); startScanning(); }}
              className="w-full max-w-xs py-4 bg-neon text-black font-bold rounded-2xl active:scale-95 transition-transform"
            >
              {t('qr_open_camera')}
            </button>
          </div>
        )}

        {status === 'scanning' && (
          <div className="w-full max-w-sm flex-1 flex flex-col">
            <div className="relative flex-1 min-h-[320px] rounded-3xl overflow-hidden bg-black">
              <div id={containerId} className="absolute inset-0" />
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-0 bg-black/20" />
                <div className="absolute left-1/2 top-1/2 w-[260px] h-[260px] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-neon/35" />
              </div>
            </div>
            <div className="mt-auto w-full">
              <button
                onClick={() => { Haptic.tap(); stopScanning(); }}
                className="w-full py-3 bg-card/35 text-white font-semibold rounded-2xl flex items-center justify-center gap-2"
              >
                <X size={20} />
                {t('qr_stop')}
              </button>
            </div>
          </div>
        )}

        {status === 'success' && (
          <div className="w-full max-w-sm flex-1 flex flex-col">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-card/35 flex items-center justify-center mx-auto mb-4">
                <Scan size={32} className="text-neon" />
              </div>
              <p className="text-neon font-semibold mb-2">{t('qr_recognized')}</p>
              <div className="bg-card/25 rounded-2xl p-3 mb-4 break-all text-left text-xs text-neutral-300 font-mono max-h-24 overflow-y-auto">
                {lastResult}
              </div>
            </div>
            <div className="mt-auto w-full">
              <BottomSheetFooter
                onCancel={() => {
                  Haptic.tap();
                  setStatus('idle');
                  setLastResult(null);
                }}
                onConfirm={() => {
                  Haptic.tap();
                  onBack();
                }}
                cancelLabel={t('qr_scan_again')}
                confirmLabel={t('done')}
              />
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center max-w-xs">
            <p className="text-red-400 text-sm mb-4">{errorMsg}</p>
            <p className="text-neutral-500 text-xs mb-6">{t('qr_allow_camera')}</p>
            <button
              onClick={() => { Haptic.tap(); setStatus('idle'); setErrorMsg(null); }}
              className="w-full py-3 bg-neon text-black font-bold rounded-2xl"
            >
              {t('try_again')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default QRScannerPage;
