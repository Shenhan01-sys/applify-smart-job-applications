import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import type { User, Session } from "@supabase/supabase-js";
import { mockUser, mockSession } from "@/mocks/mockData";
import { keepUserIfUnchanged } from "@/lib/stableUser";

const isMockMode = () => import.meta.env.VITE_MOCK_MODE === "true";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => isMockMode() ? (mockUser as unknown as User) : null);
  const [session, setSession] = useState<Session | null>(() => isMockMode() ? (mockSession as unknown as Session) : null);
  const [loading, setLoading] = useState(!isMockMode());

  useEffect(() => {
    if (isMockMode()) {
      setLoading(false);
      console.log('[Auth] Mock mode active — auto-logged in as demo user');
      return;
    }

    let active = true;
    const initSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!active) return;
        setSession(session);
        setUser((prev) => keepUserIfUnchanged(prev, session?.user ?? null));

        if (session?.user) {
          console.log('[Auth] Session recovered for user:', session.user.email);
        }
      } catch (err) {
        console.warn('[Auth] Session initialization failed:', err instanceof Error ? err.message : 'unknown');
        if (active) {
          setSession(null);
          setUser(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    initSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      // Event berulang (TOKEN_REFRESHED, SIGNED_IN saat tab difokuskan) untuk akun yang sama tidak mengganti
      // objek user, supaya halaman tidak memuat ulang data dan menghapus isian form yang belum disimpan.
      setUser((prev) => keepUserIfUnchanged(prev, session?.user ?? null));
      setLoading(false);

      if (event === 'SIGNED_IN' && window.location.hash.includes('access_token=')) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    if (isMockMode()) {
      setUser(null);
      setSession(null);
      return;
    }
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
