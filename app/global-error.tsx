"use client";

import { useEffect } from "react";
import "./globals.css";

// Last-resort boundary for errors thrown in the root layout itself. It replaces
// the whole document and renders its own <html>/<body>, so it must import the
// global stylesheet itself (the root layout — and its `import "./globals.css"` —
// is bypassed). Fonts (injected via the layout) won't load, but the navy/gold
// tokens will, so it stays on-brand instead of unstyled black-on-white.
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-bg px-6 text-center text-text-primary antialiased">
        <h1 className="text-2xl font-semibold text-gold">Something went wrong</h1>
        <p className="max-w-md text-sm text-text-secondary">
          The application hit an unexpected error. Please try again.
        </p>
        <button
          onClick={() => unstable_retry()}
          className="mt-3 rounded-md bg-gold px-4 py-2 text-sm font-medium text-ink transition-opacity hover:opacity-90"
        >
          Try again
        </button>
      </body>
    </html>
  );
}
