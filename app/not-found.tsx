import Link from "next/link";
import { Compass, Home } from "lucide-react";

// Branded 404. Server Component (no props), rendered inside the root layout so it
// inherits the navy background and fonts.
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-bg px-6 text-center">
      <Compass className="mb-5 h-10 w-10 text-gold" />
      <h1 className="text-2xl font-semibold text-text-primary">Page not found</h1>
      <p className="mt-2 max-w-sm text-sm text-text-secondary">
        This path doesn&rsquo;t lead anywhere. The verse, name, or page you&rsquo;re looking for
        may have moved.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm text-text-secondary transition-colors hover:border-gold-muted hover:text-gold"
      >
        <Home className="h-3.5 w-3.5" />
        Return home
      </Link>
    </div>
  );
}
