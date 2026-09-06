"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ApiError, apiRequest } from "./api";
import type { AuthResult, SessionUser } from "./types";

const STORAGE_KEY = "health-platform.session";

interface StoredSession {
  token: string;
  user: SessionUser;
}

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  status: AuthStatus;
  token: string | null;
  user: SessionUser | null;
  login: (email: string, password: string, role: "PATIENT" | "DOCTOR" | "INDIVIDUAL_USER") => Promise<void>;
  register: (email: string, password: string, role: "PATIENT" | "DOCTOR" | "INDIVIDUAL_USER") => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Session storage rather than local storage: the token disappears when the tab
 * closes, which limits the window in which a shared machine exposes someone's
 * health record. An httpOnly cookie would be stronger still, but the API is
 * bearer-token based and the websocket handshake needs the raw token, so it
 * has to be readable by the client.
 */
function readStoredSession(): StoredSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as StoredSession).token === "string" &&
      (parsed as StoredSession).user
    ) {
      return parsed as StoredSession;
    }
  } catch {
    // Corrupted entry — treat as logged out rather than crashing on boot.
  }

  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StoredSession | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  // Hydrate after mount. Reading storage during render would break SSR and
  // produce a hydration mismatch.
  useEffect(() => {
    const stored = readStoredSession();
    setSession(stored);
    setStatus(stored ? "authenticated" : "unauthenticated");
  }, []);

  const persist = useCallback((result: AuthResult) => {
    const next: StoredSession = { token: result.access_token, user: result.user };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    
    // Set cookies for middleware
    document.cookie = `auth_token=${result.access_token}; path=/; samesite=strict`;
    document.cookie = `user_role=${result.user.role}; path=/; samesite=strict`;
    
    setSession(next);
    setStatus("authenticated");
  }, []);

  const login = useCallback(
    async (email: string, password: string, role: "PATIENT" | "DOCTOR" | "INDIVIDUAL_USER") => {
      const result = await apiRequest<AuthResult>("/auth/login", {
        method: "POST",
        body: { email, password, role },
      });
      persist(result);
    },
    [persist],
  );

  const register = useCallback(
    async (email: string, password: string, role: "PATIENT" | "DOCTOR" | "INDIVIDUAL_USER") => {
      const result = await apiRequest<AuthResult>("/auth/register", {
        method: "POST",
        body: { email, password, role },
      });
      persist(result);
    },
    [persist],
  );

  const logout = useCallback(() => {
    window.sessionStorage.removeItem(STORAGE_KEY);
    
    // Clear cookies
    document.cookie = "auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;";
    document.cookie = "user_role=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;";
    
    setSession(null);
    setStatus("unauthenticated");
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      token: session?.token ?? null,
      user: session?.user ?? null,
      login,
      register,
      logout,
    }),
    [status, session, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return context;
}

/**
 * Wraps an API call so a rejected token logs the user out instead of leaving
 * the dashboard stuck showing errors it can never recover from.
 */
export function useApi() {
  const { token, logout } = useAuth();

  return useCallback(
    async <T,>(
      path: string,
      options: {
        method?: "GET" | "POST" | "PATCH" | "DELETE";
        body?: unknown;
        signal?: AbortSignal;
      } = {},
    ): Promise<T> => {
      try {
        return await apiRequest<T>(path, { ...options, token });
      } catch (error) {
        if (error instanceof ApiError && error.isAuthError) {
          logout();
        }
        throw error;
      }
    },
    [token, logout],
  );
}
