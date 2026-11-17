/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public base URL of the API. Never put secrets in VITE_* variables — they ship to the browser. */
  readonly VITE_API_URL?: string;
  /** @deprecated use VITE_API_URL */
  readonly VITE_BACK_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
