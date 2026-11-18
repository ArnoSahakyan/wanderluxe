interface User {
  user_id: number;
  full_name: string;
  email: string;
  phone_number?: string | null;
  /** returned by GET /auth/me (same value as phone_number) */
  phone?: string | null;
  role: string;
  /** One of the shared demo accounts (read-only admin / limited customer). */
  demo?: boolean;
}

export interface AuthState {
  user: User | null;
  /** In memory only; never persisted. */
  accessToken: string | null;
  isAuthenticated: boolean;
  login: (payload: { user: User; token: string | null }) => void;
  setAccessToken: (token: string) => void;
  setUser: (user: User) => void;
  /** Clears the local session only. Use `signOut()` to end the server session too. */
  logout: () => void;
}
