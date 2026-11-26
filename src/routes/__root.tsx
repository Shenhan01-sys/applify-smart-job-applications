import { Outlet, createRootRoute } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { DefaultNotFoundComponent } from "@/components/RouterFallbacks";

export const Route = createRootRoute({
  // The Toaster must be mounted once: without it every toast.success/toast.error in the app is invisible
  // (approve/reject results, save errors).
  component: () => (
    <>
      <Outlet />
      <Toaster richColors position="top-right" />
    </>
  ),
  // BS-09: gunakan fallback 404 bersama dari RouterFallbacks agar tidak ada komponen duplikat.
  notFoundComponent: DefaultNotFoundComponent,
});
