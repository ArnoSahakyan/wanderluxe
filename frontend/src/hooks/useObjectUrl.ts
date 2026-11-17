import { useEffect, useState } from 'react';

/** Blob URL for a local File preview, revoked automatically when the file changes or on unmount. */
export const useObjectUrl = (file: File | Blob | null | undefined): string | undefined => {
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    if (!file) {
      setUrl(undefined);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return url;
};

/** Revokes a previous blob: preview URL whenever it is replaced, and on unmount. */
export const useRevokeOnChange = (url: string | null | undefined) => {
  useEffect(
    () => () => {
      if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
    },
    [url],
  );
};
