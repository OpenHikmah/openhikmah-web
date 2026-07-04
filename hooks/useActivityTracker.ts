"use client";

import { useEffect, useRef } from "react";
import { useCanvasStore } from "@/store/canvas";
import { useAuthStore } from "@/store/auth";
import { useSocialStore } from "@/store/social";

export function useActivityTracker() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const { bumpStreak } = useSocialStore();

  const prevNodeCount = useRef(0);
  const prevEdgeCount = useRef(0);

  const nodeCount = useCanvasStore((s) => s.nodes.length);
  const edgeCount = useCanvasStore((s) => s.edges.length);
  const nodes = useCanvasStore((s) => s.nodes);

  useEffect(() => {
    if (!accessToken) {
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
  }, [nodeCount, edgeCount]);
  // ^ watches counts only — re-fetching accessToken/bumpStreak on every render would re-fire
}
