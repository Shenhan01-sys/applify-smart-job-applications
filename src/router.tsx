import { createRouter } from "@tanstack/react-router";
import { DefaultErrorComponent, DefaultNotFoundComponent } from "./components/RouterFallbacks";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const router = createRouter({
    routeTree,
    context: {},
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: DefaultErrorComponent,
    defaultNotFoundComponent: DefaultNotFoundComponent,
  });

  return router;
};
