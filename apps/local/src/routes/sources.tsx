import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

// `/sources` is a parent layout route only — `/sources/$namespace` and
// `/sources/add/$pluginKey` live under it. The bare `/sources` URL has
// no UI of its own, so we redirect to `/source-manager` before the
// layout renders. Doing this in `beforeLoad` (rather than a render-time
// `useEffect`) avoids the empty-Outlet flash.
export const Route = createFileRoute("/sources")({
  beforeLoad: ({ location }) => {
    if (location.pathname === "/sources" || location.pathname === "/sources/") {
      // oxlint-disable-next-line executor/no-try-catch-or-throw -- boundary: TanStack Router signals route interruption via `throw redirect(...)`; this is the framework's documented redirect API and the throw never crosses an Effect boundary.
      throw redirect({ to: "/source-manager", replace: true });
    }
  },
  component: SourcesLayout,
});

function SourcesLayout() {
  return <Outlet />;
}
