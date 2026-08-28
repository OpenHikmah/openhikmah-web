"use client";

import { useEffect, useRef } from "react";
import { useCanvasStore } from "@/store/canvas";
import { useAuthStore } from "@/store/auth";
import { useSocialStore } from "@/store/social";
import { postActivity, flushQueue, type ActivityInput } from "@/lib/social/post-activity";

export function useActivityTracker() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const applyActivityResult = useSocialStore((s) => s.applyActivityResult);

  // Seeded from the store's current counts (not 0) so a canvas that's already
  // populated by the time this hook first mounts — e.g. "Open on canvas" from
  // a story page added verses before navigating here — isn't mistaken for a
  // pile of brand-new additions on the very first render.
  const prevNodeCount = useRef(useCanvasStore.getState().nodes.length);
  const prevEdgeCount = useRef(useCanvasStore.getState().edges.length);
  const prevRestoreToken = useRef(useCanvasStore.getState().restoreToken);

  // Adds detected before the auth token finishes restoring — replayed once it
  // arrives. Without this the first add of a session (very often the only one)
  // silently earns no streak credit.
  const pending = useRef<ActivityInput[]>([]);

  const nodeCount = useCanvasStore((s) => s.nodes.length);
  const edgeCount = useCanvasStore((s) => s.edges.length);
  const nodes = useCanvasStore((s) => s.nodes);
  const restoreToken = useCanvasStore((s) => s.restoreToken);

  useEffect(() => {
    const deliver = (input: ActivityInput) => {
      void postActivity(accessToken!, input).then((result) => {
        if (result) applyActivityResult(result);
      });
    };

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
    prevNodeCount.current = nodeCount;
    prevEdgeCount.current = edgeCount;

    if (nodeAdded || edgeAdded) {
      const input: ActivityInput = nodeAdded
        ? {
            type: "verse_added",
            verseRef: (nodes[nodes.length - 1]?.data as { ref?: string })?.ref ?? null,
          }
        : { type: "connection_made" };

      if (accessToken) deliver(input);
      else pending.current.push(input);
      return;
    }

    // No new activity this tick — if the token just arrived, replay whatever was
    // buffered while it was missing and drain any earlier failed POSTs.
    if (accessToken) {
      const buffered = pending.current;
      pending.current = [];
      buffered.forEach(deliver);
      void flushQueue(accessToken);
    }
  }, [nodeCount, edgeCount, restoreToken, accessToken, nodes, applyActivityResult]);
}
