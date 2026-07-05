import React, { useState, useRef, useEffect } from 'react';
import { FileText, Camera, Check, ShieldCheck, User, Image, ChevronRight } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { Haptic } from '../utils/haptics';
import { useUser } from '../context/UserContext';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';
import { logAction } from '../lib/appLog';
import { createSupportMessages, ensureSupportThread, touchSupportThread } from '../lib/services/supportService';
import Modal from '../components/Modal';
import { uploadPublicFile } from '../lib/services/storageService';
import AppInput from '../components/AppInput';

type KycStep = 'DOC_TYPE' | 'NAME' | 'DOC_PHOTO' | 'SELFIE' | 'SUCCESS';

const STEPS_ORDER: KycStep[] = ['DOC_TYPE', 'NAME', 'DOC_PHOTO', 'SELFIE', 'SUCCESS'];

const DOC_TYPES = [
  { id: 'passport', labelKey: 'kyc_passport', descKey: 'kyc_passport_desc' },
  { id: 'driver', labelKey: 'kyc_driver', descKey: 'kyc_driver_desc' },
  { id: 'id', labelKey: 'kyc_id', descKey: 'kyc_id_desc' },
];

const SUPPORT_ATTACHMENTS_BUCKET = 'support-attachments';

async function uploadKycAttachment(userId: string, kind: 'document' | 'selfie', file: File): Promise<string | null> {
  const ext =
    file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : file.type === 'image/gif' ? 'gif' : 'jpg';
  const path = `kyc/${userId}/${kind}_${crypto.randomUUID()}.${ext}`;
  try {
    return await uploadPublicFile(SUPPORT_ATTACHMENTS_BUCKET, path, file);
  } catch (error) {
    console.warn('[KYC] Storage upload failed:', error);
    return null;
  }
}

interface KycPageProps {
  onBack: () => void;
}

const KycPage: React.FC<KycPageProps> = ({ onBack }) => {
  const { user } = useUser();
  const toast = useToast();
  const { t } = useLanguage();
  const [step, setStep] = useState<KycStep>('DOC_TYPE');
  const [docType, setDocType] = useState<string>('');
  const [fullName, setFullName] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submittedOk, setSubmittedOk] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [selfiePreviewUrl, setSelfiePreviewUrl] = useState<string | null>(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    if (!selfieFile) {
      if (selfiePreviewUrl) {
        URL.revokeObjectURL(selfiePreviewUrl);
        setSelfiePreviewUrl(null);
      }
      return;
    }
    const url = URL.createObjectURL(selfieFile);
    setSelfiePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selfieFile]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraOn(true);
    } catch (e) {
      toast.show(t('kyc_camera_error'), 'error');
    }
  };

  const captureSelfie = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      toast.show(t('kyc_enable_camera'), 'error');
      return;
    }
    Haptic.medium();
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], 'selfie.jpg', { type: 'image/jpeg' });
        setSelfieFile(file);
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setCameraOn(false);
      },
      'image/jpeg',
      0.9
    );
  };

  const retakeSelfie = () => {
    setSelfieFile(null);
    setSelfiePreviewUrl(null);
    startCamera();
  };

  const handleSubmit = async () => {
    if (!docFile || !selfieFile) return;
    if (!user) {
      toast.show(t('support_toast_guest_required'), 'error');
      return;
    }
    setSubmitting(true);
    const docItem = DOC_TYPES.find((d) => d.id === docType);
    const docLabel = docItem ? t(docItem.labelKey) : docType;
    try {
      const displayName = (user.full_name || user.username || user.email || `ID ${user.user_id}`).toString().trim();

      // 1) Ensure support thread exists
      const threadId = await ensureSupportThread({
        userId: user.user_id,
        email: user.email ?? null,
        displayName,
        referrerId: user.referrer_id ?? null,
        source: 'web',
      });
      if (!threadId) throw new Error('Thread create failed');

      // 2) Upload files
      const userIdStr = String(user.user_id);
      const [docUrl, selfieUrl] = await Promise.all([
        uploadKycAttachment(userIdStr, 'document', docFile),
        uploadKycAttachment(userIdStr, 'selfie', selfieFile),
      ]);

      // 3) Post messages into support chat
      const text =
        '🛡 ЗАЯВКА НА ВЕРИФИКАЦИЮ\n\n' +
        `👤 Пользователь: ${fullName || '—'}\n` +
        `📄 Документ: ${docLabel}\n` +
        `🆔 ID: ${user.user_id}\n` +
        `📅 ${new Date().toLocaleString('ru-RU')}\n`;

      await createSupportMessages([
        {
          threadId,
          userId: user.user_id,
          author: 'user',
          text,
          source: 'web',
        },
        {
          threadId,
          userId: user.user_id,
          author: 'user',
          text: '📄 Документ',
          source: 'web',
          imageUrl: docUrl,
        },
        {
          threadId,
          userId: user.user_id,
          author: 'user',
          text: '🤳 Селфи',
          source: 'web',
          imageUrl: selfieUrl,
        },
      ]);

      await touchSupportThread(threadId, 'KYC submission');

      setSubmittedOk(true);
      setStep('SUCCESS');
      toast.show(t('kyc_sent_ok'), 'success');
      logAction('kyc_submit', { userId: user.user_id, payload: { doc_type: docType } }).catch(() => {});
    } catch (e) {
      console.warn('[KYC] submit failed', e);
      toast.show(t('kyc_send_error'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const stepIndex = STEPS_ORDER.indexOf(step);
  const showProgress = step !== 'SUCCESS' && stepIndex >= 0;
  const progressPercent = showProgress ? ((stepIndex + 1) / (STEPS_ORDER.length - 1)) * 100 : 0;

  return (
    <div className="flex flex-col h-full bg-background animate-fade-in">
      <PageHeader
        title={t('verification')}
        onBack={onBack}
        right={
          step !== 'SUCCESS' ? (
            <button
              type="button"
              onClick={() => {
                Haptic.light();
                setShowExitConfirm(true);
              }}
              className="text-xs text-textMuted hover:text-textPrimary"
            >
              {t('cancel')}
            </button>
          ) : null
        }
      />
      <div className="flex-1 overflow-y-auto p-4">
        {showProgress && (
          <div className="max-w-md mx-auto mb-6">
            <div className="flex justify-between text-xs text-textMuted mb-1.5">
              <span>{t('kyc_step', { n: String(stepIndex + 1), total: String(STEPS_ORDER.length - 1) })}</span>
            </div>
            <div className="h-1.5 bg-surface rounded-full overflow-hidden">
              <div className="h-full bg-neon rounded-full transition-all duration-300" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
        )}

        <div className="max-w-md mx-auto">
        {step === 'DOC_TYPE' && (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <h2 className="text-xl font-bold text-textPrimary mb-1">{t('kyc_doc_type')}</h2>
              <p className="text-textMuted text-sm">{t('kyc_doc_type_desc')}</p>
            </div>
            <div className="space-y-3">
              {DOC_TYPES.map((d) => (
                <button
                  key={d.id}
                  onClick={() => { Haptic.light(); setDocType(d.id); setStep('NAME'); }}
                  className="w-full bg-card app-border rounded-xl p-4 flex items-center gap-4 hover:border-neon/60 hover:bg-surfaceElevated transition-all active:scale-[0.98] text-left group"
                >
                  <div className="w-12 h-12 rounded-xl bg-[#0a0d14] app-border flex items-center justify-center flex-shrink-0 group-hover:border-neon">
                    <FileText size={22} className="text-neon" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="block font-semibold text-textPrimary">{t(d.labelKey)}</span>
                    <span className="block text-xs text-textMuted mt-0.5">{t(d.descKey)}</span>
                  </div>
                  <ChevronRight size={18} className="text-textMuted flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 'NAME' && (
          <div className="space-y-6">
            <div className="text-center mb-2">
              <h2 className="text-xl font-bold text-textPrimary mb-1">{t('kyc_name_title')}</h2>
              <p className="text-textMuted text-sm">{t('kyc_name_desc')}</p>
            </div>
            <div className="bg-card app-border rounded-xl p-4">
              <label className="flex items-center gap-2 text-xs text-textMuted uppercase font-bold mb-2">
                <User size={14} />
                {t('kyc_fullname')}
              </label>
              <AppInput
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={t('kyc_fullname_placeholder')}
              />
            </div>
            <button
              onClick={() => { Haptic.light(); setStep('DOC_PHOTO'); }}
              disabled={!fullName.trim()}
              className="app-button-primary w-full"
            >
              {t('next')} <ChevronRight size={18} />
            </button>
          </div>
        )}

        {step === 'DOC_PHOTO' && (
          <div className="space-y-6">
            <div className="text-center mb-2">
              <h2 className="text-xl font-bold text-textPrimary mb-1">{t('kyc_doc_photo_title')}</h2>
              <p className="text-textMuted text-sm">{t('kyc_doc_photo_desc')}</p>
            </div>
            <label className="block bg-card border border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-neon/60 hover:bg-surfaceElevated active:scale-[0.99] transition-all">
              {React.createElement('input', {
                type: 'file',
                accept: 'image/*',
                className: 'hidden',
                onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                  const f = e.target.files?.[0];
                  if (f) { Haptic.light(); setDocFile(f); setStep('SELFIE'); }
                },
              })}
              {docFile ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center">
                    <Check size={28} className="text-up" />
                  </div>
                  <span className="text-up font-medium">{t('kyc_doc_uploaded')}</span>
                  <span className="text-textMuted text-xs">{t('kyc_doc_replace')}</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-14 h-14 rounded-full bg-[#0a0d14] app-border flex items-center justify-center">
                    <Image size={28} className="text-textMuted" />
                  </div>
                  <span className="text-textPrimary font-medium">{t('kyc_upload_photo')}</span>
                  <span className="text-textMuted text-sm">{t('kyc_or_photo')}</span>
                </div>
              )}
            </label>
          </div>
        )}

        {step === 'SELFIE' && (
          <div className="flex flex-col items-center">
            <div className="text-center mb-6 w-full">
              <h2 className="text-xl font-bold text-textPrimary mb-1">{t('kyc_selfie_title')}</h2>
              <p className="text-textMuted text-sm">{t('kyc_selfie_desc')}</p>
            </div>

            {/* Превью снимка или видео с камеры */}
            <div className="relative w-full rounded-xl overflow-hidden bg-black app-border aspect-[3/4] max-h-[360px] flex items-center justify-center">
              {selfieFile && selfiePreviewUrl ? (
                <img
                  src={selfiePreviewUrl}
                  alt={t('kyc_selfie_alt')}
                  className="w-full h-full object-cover"
                />
              ) : (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              )}
              {!cameraOn && !selfieFile && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-card/95 text-textMuted">
                  <Camera size={48} className="mb-3 opacity-60" />
                  <span className="text-sm">{t('kyc_camera_off')}</span>
                </div>
              )}
            </div>

            {/* Кнопки по состоянию */}
            <div className="w-full mt-6 space-y-3">
              {!selfieFile && !cameraOn && (
                <button
                  type="button"
                  onClick={startCamera}
                  className="app-button-primary w-full"
                >
                  <Camera size={22} /> {t('kyc_turn_on_camera')}
                </button>
              )}
              {cameraOn && !selfieFile && (
                <button
                  type="button"
                  onClick={captureSelfie}
                  className="app-button-primary w-full"
                >
                  <Camera size={22} /> {t('kyc_take_photo')}
                </button>
              )}
              {selfieFile && (
                <>
                  <p className="text-center text-up text-sm mb-1">✓ {t('kyc_photo_ready')}</p>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="app-button-primary w-full"
                  >
                    {submitting ? (
                      t('kyc_submitting')
                    ) : (
                      <>
                        <Check size={22} /> {t('kyc_submit')}
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={retakeSelfie}
                    className="app-button-secondary w-full"
                  >
                    {t('kyc_retake')}
                    </button>
                  </>
              )}

            </div>
          </div>
        )}

        {step === 'SUCCESS' && (
          <div className="bg-card app-border rounded-xl p-8 text-center">
            <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-5">
              <ShieldCheck size={40} className="text-up" />
            </div>
            {submittedOk ? (
              <>
                <h2 className="text-xl font-bold text-textPrimary mb-2">{t('kyc_success_title')}</h2>
                <p className="text-textMuted text-sm mb-6">{t('kyc_success_desc')}</p>
                <button onClick={() => { Haptic.tap(); onBack(); }} className="app-button-primary w-full">
                  {t('kyc_to_profile')}
                </button>
              </>
            ) : (
              <>
                <h2 className="text-xl font-bold text-textPrimary mb-2">{t('kyc_docs_ready_title')}</h2>
                <p className="text-textMuted text-sm mb-6">{t('kyc_docs_ready_desc')}</p>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="app-button-primary w-full"
                >
                  {submitting ? t('kyc_submitting') : t('kyc_submit_btn')}
                </button>
                <button onClick={() => { setSelfieFile(null); setStep('SELFIE'); startCamera(); }} className="mt-3 text-textMuted text-sm">
                  {t('kyc_retake')}
                </button>
              </>
            )}
          </div>
        )}
        </div>
      </div>

      <Modal
        open={showExitConfirm}
        onClose={() => setShowExitConfirm(false)}
        title={t('kyc_exit_title') ?? 'Выйти из верификации?'}
        closeOnBackdrop
      >
        <p className="text-sm text-textSecondary mb-4">
          {t('kyc_exit_text') ?? 'Прогресс может быть утерян. Вы действительно хотите выйти из процесса верификации?'}
        </p>
        <div className="flex gap-3 mt-2">
          <button
            type="button"
            onClick={() => setShowExitConfirm(false)}
            className="flex-1 py-2.5 rounded-full app-border bg-surfaceElevated text-textSecondary text-sm font-medium active:scale-95 transition-all"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={() => {
              Haptic.tap();
              setShowExitConfirm(false);
              onBack();
            }}
            className="flex-1 py-2.5 rounded-full bg-down text-white text-sm font-bold active:scale-95 transition-all"
          >
            {t('exit') ?? 'Выйти'}
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default KycPage;
