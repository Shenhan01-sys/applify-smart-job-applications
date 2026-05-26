import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth-callback")({
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
    // Give Supabase a moment to process the OAuth hash
    const timer = setTimeout(async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          console.error("[AuthCallback] Session error:", error);
          navigate({ to: "/login" });
          return;
        }
        if (session?.user) {
          console.log("[AuthCallback] Session found for:", session.user.email);
          // Clean hash from URL
          window.history.replaceState(null, "", window.location.pathname);
          navigate({ to: "/dashboard" });
        } else {
          console.warn("[AuthCallback] No session found, redirecting to login");
          navigate({ to: "/login" });
        }
      } catch (err) {
        console.error("[AuthCallback] Error:", err);
        navigate({ to: "/login" });
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <Loader2 className="h-10 w-10 animate-spin text-[#0367FC]" />
      <div className="text-center">
        <p className="text-sm font-medium">Sedang masuk...</p>
        <p className="text-xs text-muted-foreground mt-1">Tunggu sebentar</p>
      </div>
    </div>
  );
}

export default AuthCallbackPage;
