import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import type { User, Session } from "@supabase/supabase-js";
import { mockUser, mockSession } from "@/mocks/mockData";

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

    const handleOAuthCallback = async () => {
      const hash = window.location.hash;
      const isOAuthReturn = hash && hash.includes('access_token=');
      if (isOAuthReturn) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      if (session?.user) {
        console.log('[Auth] Session recovered for user:', session.user.email);
        // If we just came back from OAuth and landed on root, redirect to dashboard
        if (isOAuthReturn && window.location.pathname === '/') {
          window.location.replace('/dashboard');
        }
      }
    };

    handleOAuthCallback();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      if (event === 'SIGNED_IN' && window.location.hash.includes('access_token=')) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    });

    return () => subscription.unsubscribe();
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
