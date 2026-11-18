import { ImgHTMLAttributes, useState } from 'react';
import { PhotoIcon } from '@heroicons/react/24/outline';

type SmartImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  /** Classes for the placeholder shown when the image is missing or fails to load. */
  fallbackClassName?: string;
  /** Tried when `src` fails to load (e.g. the full image behind a missing card copy). */
  fallbackSrc?: string | null;
};

/**
 * <img> that lazy-loads and degrades to a neutral placeholder instead of the
 * browser's broken-image icon when the source is missing or 404s. With
 * `fallbackSrc` it first tries that image.
 */
export const SmartImage = ({
  src,
  alt = '',
  className,
  fallbackClassName,
  fallbackSrc,
  ...rest
}: SmartImageProps) => {
  const [failed, setFailed] = useState<string[]>([]);
  const current = [src, fallbackSrc].find((candidate) => candidate && !failed.includes(candidate));

  if (!current) {
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
      src={current}
      alt={alt}
      loading='lazy'
      decoding='async'
      className={className}
      onError={() => setFailed((list) => [...list, current])}
      {...rest}
    />
  );
};
