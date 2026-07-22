import React from 'react';

interface NftArtworkProps {
  src: string;
  alt?: string;
  className?: string;
  imageClassName?: string;
  eager?: boolean;
}

/**
 * NFT-превью без обрезки: размытый фон заполняет баннер, а оригинал
 * всегда остаётся целиком видимым независимо от пропорций изображения.
 */
export default function NftArtwork({
  src,
  alt = '',
  className = '',
  imageClassName = '',
  eager = false,
}: NftArtworkProps) {
  return (
    <div className={`relative isolate overflow-hidden bg-[#080c11] ${className}`}>
      <img
        src={src}
        alt=""
        aria-hidden="true"
        className="absolute inset-[-8%] h-[116%] w-[116%] scale-110 object-cover opacity-25 blur-xl saturate-75"
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        referrerPolicy="no-referrer"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-transparent to-black/20" aria-hidden="true" />
      <img
        src={src}
        alt={alt}
        className={`relative z-10 h-full w-full object-contain p-1.5 ${imageClassName}`}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        referrerPolicy="no-referrer"
      />
    </div>
  );
}
