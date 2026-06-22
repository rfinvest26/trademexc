import React from 'react';
import { User } from 'lucide-react';

interface UserAvatarProps {
  name?: string | null;
  photoUrl?: string | null;
  className?: string;
  imageClassName?: string;
  fallbackClassName?: string;
  iconClassName?: string;
  iconSize?: number;
  alt?: string;
}

const UserAvatar: React.FC<UserAvatarProps> = ({
  name,
  photoUrl,
  className = 'h-8 w-8',
  imageClassName = '',
  fallbackClassName = '',
  iconClassName = 'text-textSecondary',
  iconSize = 14,
  alt = '',
}) => {
  const initial = (name || '').trim().charAt(0).toUpperCase() || '?';
  const imageClasses = `${className} rounded-full object-cover bg-white/5 ring-1 ring-white/10 shrink-0 ${imageClassName}`.trim();
  const fallbackClasses = `${className} rounded-full bg-white/5 ring-1 ring-white/10 shrink-0 flex items-center justify-center font-semibold text-textPrimary ${fallbackClassName}`.trim();

  if (photoUrl) {
    return <img src={photoUrl} alt={alt} referrerPolicy="no-referrer" className={imageClasses} />;
  }

  return (
    <div className={fallbackClasses}>
      {initial === '?' ? <User size={iconSize} className={iconClassName} /> : initial}
    </div>
  );
};

export default UserAvatar;
