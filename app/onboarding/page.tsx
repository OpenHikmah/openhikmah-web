"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { useSocialStore } from "@/store/social";
import { BookOpen, Loader2 } from "lucide-react";
import { Card, Input } from "@/components/ui";
import { cn } from "@/lib/utils";

export default function OnboardingPage() {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const { setProfile } = useSocialStore();

  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!accessToken) router.replace("/");
  }, [accessToken, router]);

  if (!accessToken) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = username.trim();
    if (!trimmed) return;

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/social/me", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ username: trimmed }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Could not save username. Try another one.");
        return;
      }

      setProfile({ userId: data.id, username: data.username });
      router.replace("/");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-4">
      <Card className="w-full max-w-sm space-y-6 p-8">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-surface-overlay">
            <BookOpen className="h-5 w-5 text-gold" />
          </div>
          <div className="space-y-1 text-center">
            <h1 className="text-base font-medium text-text-primary">Choose a username</h1>
            <p className="text-xs text-text-muted">
              This is how friends will find you on the leaderboard.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Input
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setError(null);
              }}
              placeholder="e.g. ahmed_hikmah"
              maxLength={20}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              className={cn(error && "border-error")}
            />
            <p className="text-xs text-text-muted">
              3–20 characters: letters, numbers, underscores only
            </p>
            {error && <p className="text-xs text-error">{error}</p>}
          </div>

          <button
            type="submit"
            disabled={saving || username.trim().length < 3}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded bg-teal py-2 text-sm font-medium text-text-primary transition-[filter] duration-[120ms] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {saving ? "Saving…" : "Get started"}
          </button>
        </form>
      </Card>
    </div>
  );
}
