import React from 'react';
import clsx from 'clsx';

interface SkeletonProps {
  className?: string;
  rounded?: boolean;
  shimmer?: boolean;
}

const Skeleton: React.FC<SkeletonProps> = ({ className = '', rounded = true, shimmer = true }) => {
  return (
    <div
      className={clsx(
        shimmer ? 'skeleton-shimmer' : 'animate-pulse bg-neutral-800/80',
        rounded ? 'rounded-lg' : '',
        className,
      )}
    />
  );
};

export default Skeleton;
