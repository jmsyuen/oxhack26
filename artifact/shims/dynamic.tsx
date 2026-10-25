import { lazy, Suspense, type ComponentType, type ReactNode } from "react";

/** Stand-in for next/dynamic in the single-file build. */
export default function dynamic<P extends object>(loader: () => Promise<{ default: ComponentType<P> }>, opts?: { loading?: () => ReactNode; ssr?: boolean }) {
  const L = lazy(loader);
  return function Dyn(props: P) {
    return <Suspense fallback={opts?.loading ? opts.loading() : null}><L {...props} /></Suspense>;
  };
}
