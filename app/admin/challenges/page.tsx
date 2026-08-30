"use client";

import { useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { AdminToggle } from "@/components/admin/AdminToggle";
import { ChallengesModeration } from "@/components/admin/ChallengesModeration";
import { ChallengeSuggestionsManager } from "@/components/admin/ChallengeSuggestionsManager";

type Section = "moderation" | "suggestions";

const SECTIONS = [
  { value: "moderation", label: "Moderation" },
  { value: "suggestions", label: "Suggestions" },
] as const satisfies readonly { value: Section; label: string }[];

export default function AdminChallengesPage() {
  const [section, setSection] = useState<Section>("moderation");

  return (
    <>
      <AdminPageHeader
        title="Challenges"
        subtitle="Moderate and resolve 1v1 challenges, and curate the suggestions users start from."
        actions={
          <AdminToggle options={SECTIONS} value={section} onChange={setSection} label="Section" />
        }
      />
      <div className="p-7">
        {section === "moderation" ? <ChallengesModeration /> : <ChallengeSuggestionsManager />}
      </div>
    </>
  );
}
