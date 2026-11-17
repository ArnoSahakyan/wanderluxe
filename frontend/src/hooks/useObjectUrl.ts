import { useEffect, useState } from 'react';

/** Blob URL for a local File preview, revoked automatically when the file changes or on unmount. */
export const useObjectUrl = (file: File | Blob | null | undefined): string | undefined => {
  const [url, setUrl] = useState<string>();

  // Creating/revoking a blob URL is an external side effect, so it belongs in an effect
  // (creating it during render would leak URLs under StrictMode's double render).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!file) {
      setUrl(undefined);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  /* eslint-enable react-hooks/set-state-in-effect */

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
