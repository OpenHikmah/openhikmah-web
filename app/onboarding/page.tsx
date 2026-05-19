"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { useSocialStore } from "@/store/social";
import { BookOpen, Loader2 } from "lucide-react";

export default function OnboardingPage() {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const { setProfile } = useSocialStore();

  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!accessToken) {
    router.replace("/");
    return null;
  }

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
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: "var(--color-bg)" }}
    >
      <div
        className="w-full max-w-sm rounded-lg border p-8 space-y-6"
        style={{
          background: "var(--color-surface)",
          borderColor: "var(--color-border)",
        }}
      >
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-10 h-10 rounded-md flex items-center justify-center"
            style={{ background: "var(--color-surface-overlay)" }}
          >
            <BookOpen className="w-5 h-5" style={{ color: "var(--color-gold)" }} />
          </div>
          <div className="text-center space-y-1">
            <h1
              className="text-base font-medium"
              style={{ color: "var(--color-text-primary)" }}
            >
              Choose a username
            </h1>
            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              This is how friends will find you on the leaderboard.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <input
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
              className="w-full px-3 py-2 rounded border text-sm bg-transparent outline-none transition-colors"
              style={{
                borderColor: error ? "var(--color-error, #ef4444)" : "var(--color-border)",
                color: "var(--color-text-primary)",
              }}
              onFocus={(e) =>
                (e.currentTarget.style.borderColor = "var(--color-teal)")
              }
              onBlur={(e) =>
                (e.currentTarget.style.borderColor = error
                  ? "var(--color-error, #ef4444)"
                  : "var(--color-border)")
              }
            />
            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              3–20 characters: letters, numbers, underscores only
            </p>
            {error && (
              <p className="text-xs" style={{ color: "var(--color-error, #ef4444)" }}>
                {error}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={saving || username.trim().length < 3}
            className="w-full flex items-center justify-center gap-2 py-2 rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            style={{
              background: "var(--color-teal)",
              color: "#ffffff",
            }}
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : null}
            {saving ? "Saving…" : "Get started"}
          </button>
        </form>
      </div>
    </div>
  );
}
