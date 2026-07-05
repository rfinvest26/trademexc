import React, { useRef } from 'react';
import { FileText, Upload, X } from 'lucide-react';
import { Haptic } from '../../utils/haptics';

interface ProofUploadCardProps {
  file: File | null;
  accept: string;
  emptyTitle: React.ReactNode;
  emptyDescription?: React.ReactNode;
  selectedTitle: React.ReactNode;
  selectedDescription?: React.ReactNode;
  onFileSelect: (file: File) => boolean | void;
  onFileClear: () => void;
  className?: string;
}

const ProofUploadCard: React.FC<ProofUploadCardProps> = ({
  file,
  accept,
  emptyTitle,
  emptyDescription,
  selectedTitle,
  selectedDescription,
  onFileSelect,
  onFileClear,
  className = '',
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = () => {
    Haptic.light();
    inputRef.current?.click();
  };

  const clearPicker = () => {
    Haptic.light();
    onFileClear();
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  return (
    <div className={className}>
      {React.createElement('input', {
        type: 'file',
        ref: inputRef,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
          const nextFile = e.target.files?.[0];
          if (!nextFile) return;
          const accepted = onFileSelect(nextFile);
          if (accepted === false && inputRef.current) {
            inputRef.current.value = '';
          }
        },
        className: 'hidden',
        accept,
      })}

      {!file ? (
        <button
          type="button"
          onClick={openPicker}
          className="w-full h-44 rounded-xl border border-dashed border-border bg-surface flex flex-col items-center justify-center transition-all duration-200 active:scale-[0.99] hover:bg-surfaceElevated hover:shadow-lg cursor-pointer"
        >
          <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3 bg-surfaceElevated">
            <Upload size={20} className="text-textSecondary" />
          </div>
          <span className="text-sm font-medium text-textPrimary">{emptyTitle}</span>
          {emptyDescription ? (
            <span className="text-xs text-textMuted mt-1">{emptyDescription}</span>
          ) : null}
        </button>
      ) : (
        <div className="w-full h-44 rounded-xl bg-surfaceElevated flex flex-col items-center justify-center relative">
          <button
            type="button"
            onClick={clearPicker}
            className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center bg-background/80 backdrop-blur-sm text-textSecondary hover:bg-surfaceElevated transition-all duration-200 cursor-pointer"
            aria-label="Удалить файл"
          >
            <X size={14} />
          </button>
          <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3 bg-neon/10 border border-neon/20">
            <FileText size={22} className="text-neon" />
          </div>
          <span className="text-sm font-semibold text-textPrimary mb-1">{selectedTitle}</span>
          <span className="text-xs text-textMuted max-w-[220px] truncate px-4">
            {selectedDescription || file.name}
          </span>
        </div>
      )}
    </div>
  );
};

export default ProofUploadCard;
