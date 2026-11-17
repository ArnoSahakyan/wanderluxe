interface User {
  user_id: number;
  full_name: string;
  email: string;
  phone_number?: string | null;
  /** returned by GET /auth/me (same value as phone_number) */
  phone?: string | null;
  role: string;
}

export interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  login: (payload: { user: User; token: string | null; refreshToken: string | null }) => void;
  setAccessToken: (token: string) => void;
  logout: () => void;
}
