/**
 * Base URL of the REST API.
 * Always same-origin "/api" in practice, so the httpOnly session cookie is first-party:
 * - development: proxied by Vite to the local Express server
 * - Vercel:      forwarded to the Render API by the rewrite in frontend/vercel.json
 * VITE_BACK_BASE_URL is the variable name used by older deployments.
 */
export const BACK_URL: string =
  import.meta.env.VITE_API_URL || import.meta.env.VITE_BACK_BASE_URL || '/api';
