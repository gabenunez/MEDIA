"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Loader2 } from "lucide-react";
import { MediaIcon } from "@/components/media-icon";
import { api } from "@/lib/api";
import { invalidateApiCache } from "@/lib/api-cache";
import { resolvePostLoginHref } from "@/lib/auth-html-gate";
import { stripBasePath, withBasePath } from "@/lib/base-path";
import { routes } from "@/lib/routes";
import {
  androidTvShellSupportsLogout,
  notifyAndroidLogout,
} from "@/lib/android-bridge";
import { isTvClient } from "@/lib/tv-mode-detect";
import { markTvBootContentReady } from "@/lib/tv-boot-ready";
import {
  focusFirstContentItem,
  focusFirstHomeVideoItem,
  focusLoginGateItem,
  focusPrimaryContentItem,
} from "@/lib/tv-focus";
import { tvFocusRingClassName } from "@/components/tv/tv-focus-link";
import { TvSpatialNav } from "@/components/tv/tv-spatial-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type AuthState = {
  loading: boolean;
  required: boolean;
  authenticated: boolean;
  refresh: () => Promise<void>;
  login: (password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [required, setRequired] = useState(false);
  const [authenticated, setAuthenticated] = useState(true);
  const wasLockedRef = useRef(false);

  const refresh = useCallback(async () => {
    const status = await api.getAuthStatus();
    setRequired(status.required);
    setAuthenticated(status.authenticated);
  }, []);

  useEffect(() => {
    refresh()
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [refresh]);

  const login = useCallback(async (password: string) => {
    await api.login(password);
  }, []);

  const logout = useCallback(async () => {
    invalidateApiCache();
    try {
      await api.logout();
    } catch (err) {
      console.error(err);
    }

    if (isTvClient() && androidTvShellSupportsLogout()) {
      notifyAndroidLogout();
      return;
    }

    notifyAndroidLogout();
    const home = `${window.location.origin}${withBasePath(routes.home())}`;
    window.location.replace(isTvClient() ? `${home}?tv=1` : home);
  }, []);

  const locked = required && !authenticated;
  // Keep the library out of the tree until auth is resolved and unlocked.
  // Rendering it under the gate (or visibility:hidden) is what leaked posters
  // before login — and hiding it with CSS is what previously broke TV images.
  const allowContent = !loading && !locked;

  // After unlock, LoginGate unmounts and the browser drops focus on the first
  // tabbable (sidebar Home). Put focus back on the main content for TV.
  useEffect(() => {
    if (loading) return;
    const justUnlocked = wasLockedRef.current && !locked;
    wasLockedRef.current = locked;
    if (!justUnlocked || !isTvClient()) return;

    const frame = window.requestAnimationFrame(() => {
      if (!focusFirstHomeVideoItem()) {
        focusPrimaryContentItem();
        if (!document.activeElement?.hasAttribute("data-tv-item")) {
          focusFirstContentItem();
        }
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loading, locked]);

  return (
    <AuthContext.Provider
      value={{ loading, required, authenticated, refresh, login, logout }}
    >
      {allowContent ? children : null}
      {loading ? <AuthSplash /> : null}
      {!loading && locked ? <LoginGate onLogin={login} /> : null}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

function AuthSplash() {
  return (
    <div
      className="fixed inset-0 z-[200] bg-background"
      role="status"
      aria-label="Loading"
    />
  );
}

function LoginGate({
  onLogin,
}: {
  onLogin: (password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const onTv = isTvClient();

  useLayoutEffect(() => {
    // Reveal the TV shell only once the opaque gate is mounted — never while
    // library rows are still in the document.
    if (onTv) markTvBootContentReady();
  }, [onTv]);

  useEffect(() => {
    const focusPassword = () => {
      const field = passwordRef.current;
      if (!field) return;
      if (onTv) {
        focusLoginGateItem();
      } else {
        field.focus();
      }
    };
    focusPassword();
    const frame = window.requestAnimationFrame(focusPassword);
    const timeout = window.setTimeout(focusPassword, 120);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [onTv]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!password.trim()) {
      passwordRef.current?.focus();
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onLogin(password);
      setPassword("");
      window.location.replace(
        withBasePath(
          resolvePostLoginHref({
            pathname: stripBasePath(window.location.pathname),
            search: window.location.search,
            isTv: onTv,
          }),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      passwordRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  };

  const gate = (
    <div
      className={cn(
        "fixed inset-0 z-[200] flex items-center justify-center bg-background px-4",
        onTv && "tv-ui",
      )}
      data-tv-login-gate={onTv ? "" : undefined}
    >
      <div className="tv-login-card rounded-2xl border border-border/80 bg-card shadow-2xl">
        <div className="mb-8 flex items-center gap-4">
          <MediaIcon className="h-16 w-16" />
          <div>
            <h1 className="text-4xl font-black tracking-tight">MEDIA!</h1>
            <p className="mt-1 text-lg text-muted-foreground">
              Enter your password to continue
            </p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-5"
          {...(onTv
            ? { "data-tv-row": "", "data-tv-vertical": "" }
            : {})}
        >
          <Input
            ref={passwordRef}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            autoComplete="current-password"
            enterKeyHint="done"
            {...(onTv
              ? {
                  "data-tv-item": "",
                  tabIndex: 0,
                  className: cn(tvFocusRingClassName, "h-16 text-xl"),
                }
              : {})}
          />
          {error && <p className="text-base text-red-400">{error}</p>}
          <Button
            type="submit"
            className={cn("w-full", onTv && cn(tvFocusRingClassName, "h-16 text-xl"))}
            disabled={submitting || !password.trim()}
            {...(onTv
              ? {
                  "data-tv-item": "",
                  tabIndex: 0,
                }
              : {})}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Unlock"
            )}
          </Button>
        </form>
      </div>
    </div>
  );

  // TvShell (and its spatial nav) is unmounted until unlock — keep D-pad
  // handling on the overlay so a logged-out TV can still type and submit.
  return onTv ? <TvSpatialNav>{gate}</TvSpatialNav> : gate;
}
