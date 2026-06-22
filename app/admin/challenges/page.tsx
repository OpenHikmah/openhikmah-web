"use client";

import { useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { ChallengesModeration } from "@/components/admin/ChallengesModeration";
import { ChallengeSuggestionsManager } from "@/components/admin/ChallengeSuggestionsManager";
import { cn } from "@/lib/utils";

type Section = "moderation" | "suggestions";

export default function AdminChallengesPage() {
  const [section, setSection] = useState<Section>("moderation");

  return (
    <>
      <AdminPageHeader
        title="Challenges"
        subtitle="Moderate and resolve 1v1 challenges, and curate the suggestions users start from."
        actions={
          <div className="flex items-center gap-1">
            {(["moderation", "suggestions"] as Section[]).map((s) => (
              <button
                key={s}
                onClick={() => setSection(s)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm capitalize transition-colors",
                  section === s
                    ? "bg-gold/10 font-medium text-gold"
                    : "text-text-secondary hover:bg-white/5 hover:text-text-primary"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        }
      />
      <div className="p-7">
        {section === "moderation" ? <ChallengesModeration /> : <ChallengeSuggestionsManager />}
      </div>
    </>
  );
}
