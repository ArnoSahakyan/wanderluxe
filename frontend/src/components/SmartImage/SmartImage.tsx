import { ImgHTMLAttributes, useState } from 'react';
import { PhotoIcon } from '@heroicons/react/24/outline';

type SmartImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  /** Classes for the placeholder shown when the image is missing or fails to load. */
  fallbackClassName?: string;
};

/**
 * <img> that lazy-loads and degrades to a neutral placeholder instead of the
 * browser's broken-image icon when the source is missing or 404s.
 */
export const SmartImage = ({
  src,
  alt = '',
  className,
  fallbackClassName,
  ...rest
}: SmartImageProps) => {
  const [failedSrc, setFailedSrc] = useState<string | undefined>();

  if (!src || failedSrc === src) {
    return (
      <div
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
        className={`flex items-center justify-center bg-gray-200 dark:bg-gray-700 ${fallbackClassName ?? className ?? ''}`}
      >
        <PhotoIcon className='size-10 text-gray-400 dark:text-gray-500' aria-hidden='true' />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading='lazy'
      decoding='async'
      className={className}
      onError={() => setFailedSrc(src)}
      {...rest}
    />
  );
};
