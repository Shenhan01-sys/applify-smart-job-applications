import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bell, CheckCheck } from "lucide-react";
import { automationApi } from "@/services/automationApi";
import { useAuth } from "@/contexts/AuthContext";
import { isMockMode } from "@/lib/appConfig";
import {
  applyReadLocally,
  formatUnreadBadge,
  safeNotificationHref,
  type InAppNotification,
  type InAppNotificationsResponse,
} from "@/lib/inAppNotifications";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

const POLL_INTERVAL_MS = 45_000;

export function InAppNotificationsBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<InAppNotificationsResponse>({ items: [], unreadCount: 0 });

  const refresh = useCallback(async () => {
    if (!user?.id && !isMockMode()) return;
    try {
      const res = await automationApi.getInAppNotifications(20);
      setState(res);
    } catch {
      // Best-effort: lonceng tidak boleh mengganggu navigasi bila server sedang tidak terjangkau.
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id && !isMockMode()) {
      setState({ items: [], unreadCount: 0 });
      return;
    }
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [user?.id, refresh]);

  const handleOpen = (next: boolean) => {
    setOpen(next);
    if (next) void refresh();
  };

  const handleMarkAllRead = async () => {
    setLoading(true);
    try {
      await automationApi.markInAppNotificationsRead({ all: true });
      setState((prev) => applyReadLocally(prev, { all: true }));
    } catch {
      // Abaikan diam-diam; user tetap dapat melihat daftar.
    } finally {
      setLoading(false);
    }
  };

  const handleItemClick = async (item: InAppNotification) => {
    if (!item.read_at) {
      setState((prev) => applyReadLocally(prev, { ids: [item.id] }));
      void automationApi.markInAppNotificationsRead({ ids: [item.id] }).catch(() => {});
    }
    const target = safeNotificationHref(item.href);
    setOpen(false);
    if (target) {
      navigate({ to: target as any });
    }
  };

  const badge = formatUnreadBadge(state.unreadCount);

  return (
    <>
      <button
        type="button"
        onClick={() => handleOpen(true)}
        data-testid="in-app-notifications-bell"
        aria-label={badge ? `Notifikasi (${badge} belum dibaca)` : "Notifikasi"}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-black/[8%] bg-white/80 text-foreground hover:bg-black/[4%] transition"
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {badge && (
          <span
            data-testid="in-app-notifications-badge"
            className="absolute -right-1 -top-1 inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-bold leading-none text-white"
          >
            {badge}
          </span>
        )}
      </button>

      <Sheet open={open} onOpenChange={handleOpen}>
        <SheetContent side="right" className="w-80 sm:w-96 max-w-[92%] overflow-y-auto bg-[#F4F1E8] p-5">
          <SheetHeader className="pr-8 text-left">
            <SheetTitle className="font-display font-extrabold">Notifikasi</SheetTitle>
            <SheetDescription>Pembaruan status lamaran dan pengingat tindak lanjut.</SheetDescription>
          </SheetHeader>

          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {state.unreadCount > 0 ? `${state.unreadCount} belum dibaca` : "Semua sudah dibaca"}
            </span>
            {state.unreadCount > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={loading}
                onClick={handleMarkAllRead}
                data-testid="in-app-notifications-mark-all"
                className="min-h-11 gap-1.5 text-xs"
              >
                <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Tandai semua dibaca
              </Button>
            )}
          </div>

          <div className="mt-3 space-y-2" data-testid="in-app-notifications-list">
            {state.items.length === 0 ? (
              <div className="rounded-xl border border-black/[8%] bg-white/70 p-4 text-sm text-muted-foreground">
                Belum ada notifikasi baru. Pembaruan status lamaran akan muncul di sini.
              </div>
            ) : (
              state.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void handleItemClick(item)}
                  className={`w-full min-h-11 rounded-xl border p-3 text-left transition ${
                    item.read_at
                      ? "border-black/[6%] bg-white/60 text-muted-foreground hover:bg-white"
                      : "border-primary/30 bg-white text-foreground shadow-xs hover:bg-primary/5"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold leading-snug">{item.title}</p>
                    {!item.read_at && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Belum dibaca" />
                    )}
                  </div>
                  <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">{item.body}</p>
                </button>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
