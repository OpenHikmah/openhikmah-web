"use client";

export function AuthLoadingSkeleton() {
  return (
    <main className="mx-auto w-full max-w-[1180px] flex-1 px-6 py-10 md:px-12">
      {/* Greeting */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-3 w-28 animate-pulse rounded bg-surface" />
          <div className="h-8 w-64 animate-pulse rounded bg-surface" />
        </div>
        <div className="h-8 w-32 animate-pulse rounded-full bg-surface" />
      </div>

      {/* Cards */}
      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-[100px] animate-pulse rounded-xl border border-border bg-surface"
          />
        ))}
      </div>

      {/* Journeys */}
      <div className="mt-10">
        <div className="mb-4 h-4 w-28 animate-pulse rounded bg-surface" />
        <div className="flex flex-wrap gap-2.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-9 w-20 animate-pulse rounded-md border border-border bg-surface"
            />
          ))}
        </div>
      </div>
    </main>
  );
}
