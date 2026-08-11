"use client";

import { useEffect, useRef } from "react";
import { useCanvasStore } from "@/store/canvas";
import { useAuthStore } from "@/store/auth";
import { useSocialStore } from "@/store/social";

export function useActivityTracker() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const { bumpStreak } = useSocialStore();

  // Seeded from the store's current counts (not 0) so a canvas that's already
  // populated by the time this hook first mounts — e.g. "Open on canvas" from
  // a story page added verses before navigating here — isn't mistaken for a
  // pile of brand-new additions on the very first render.
  const prevNodeCount = useRef(useCanvasStore.getState().nodes.length);
  const prevEdgeCount = useRef(useCanvasStore.getState().edges.length);
  const prevRestoreToken = useRef(useCanvasStore.getState().restoreToken);

  const nodeCount = useCanvasStore((s) => s.nodes.length);
  const edgeCount = useCanvasStore((s) => s.edges.length);
  const nodes = useCanvasStore((s) => s.nodes);
  const restoreToken = useCanvasStore((s) => s.restoreToken);

  useEffect(() => {
    if (!accessToken) {
      prevNodeCount.current = nodeCount;
      prevEdgeCount.current = edgeCount;
      prevRestoreToken.current = restoreToken;
      return;
    }

    // A bulk restore (localStorage reload, share link, workspace load) bumps
    // restoreToken atomically with the node/edge counts — treat it as a new
    // baseline, not activity, so loading a page never credits the streak.
    const restored = restoreToken !== prevRestoreToken.current;
    prevRestoreToken.current = restoreToken;
    if (restored) {
      prevNodeCount.current = nodeCount;
      prevEdgeCount.current = edgeCount;
      return;
    }

    const nodeAdded = nodeCount > prevNodeCount.current;
    const edgeAdded = edgeCount > prevEdgeCount.current;

    if (!nodeAdded && !edgeAdded) {
      prevNodeCount.current = nodeCount;
      prevEdgeCount.current = edgeCount;
      return;
    }

    // Determine activity type and verse ref
    let activityType: string;
    let verseRef: string | undefined;

    if (nodeAdded) {
      activityType = "verse_added";
      // Get the most recently added node's ref
      const lastNode = nodes[nodes.length - 1];
      verseRef = (lastNode?.data as { ref?: string })?.ref;
    } else {
      activityType = "connection_made";
    }

    prevNodeCount.current = nodeCount;
    prevEdgeCount.current = edgeCount;

    // Fire and forget — activity tracking is non-blocking
    fetch("/api/social/activity", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ type: activityType, verse_ref: verseRef }),
    })
      .then((res) => {
        if (!res.ok) return;
        return res.json();
      })
      .then((data) => {
        if (data?.streak !== undefined) {
          bumpStreak(data.streak, data.longestStreak);
        }
      })
      .catch(() => {
        // Non-blocking — ignore errors
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeCount, edgeCount, restoreToken]);
  // ^ watches counts only — re-fetching accessToken/bumpStreak on every render would re-fire
}
