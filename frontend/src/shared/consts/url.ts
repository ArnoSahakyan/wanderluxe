/**
 * Base URL of the REST API.
 * - development: "/api", proxied by Vite to the local Express server (no CORS needed)
 * - production:  absolute URL, e.g. https://api.example.com/api
 * VITE_BACK_BASE_URL is the variable name used by older deployments.
 */
export const BACK_URL: string =
  import.meta.env.VITE_API_URL || import.meta.env.VITE_BACK_BASE_URL || '/api';
