"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Network, MessageSquareText, X } from "lucide-react";
import { Card, Button } from "@/components/ui";

const TOUR_KEY = "open-hikmah-tour-seen";

const STEPS = [
  {
    icon: Search,
    title: "Search a verse to begin",
    body: "Press ⌘K (or tap Search) and look up any verse by reference, keyword, or meaning.",
  },
  {
    icon: Network,
    title: "Expand its connections",
    body: "Use a verse's expand control to surface related verses — by shared root, theme, or contrast.",
  },
  {
    icon: MessageSquareText,
    title: "Read why they connect",
    body: "Click any link between two verses to see the grounded reason in the side panel.",
  },
];

/**
 * A one-time, skippable intro shown on a visitor's first canvas visit. Sits in the
 * corner so the canvas stays visible behind it; dismissal (or finishing) is
 * remembered in localStorage. Honors prefers-reduced-motion via the global rule.
 */
export function CanvasTour() {
  // Render nothing until we've confirmed (client-side) the tour is unseen — avoids
  // a hydration mismatch and a flash for returning users.
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try {
      if (!localStorage.getItem(TOUR_KEY)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setShow(true);
      }
    } catch {
      // No storage access — skip the tour rather than risk showing it every load.
    }
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(TOUR_KEY, "1");
    } catch {
      // Ignore — worst case the tour reappears next visit.
    }
    setShow(false);
  };

  // Move focus to the primary action when the tour appears, and let Escape dismiss.
  useEffect(() => {
    if (!show) return;
    primaryRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [show]);

  if (!show) return null;

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <div className="pointer-events-none absolute bottom-20 left-1/2 z-50 w-[min(360px,calc(100vw-2rem))] -translate-x-1/2 md:bottom-6 md:left-6 md:translate-x-0">
      <Card
        variant="floating"
        role="dialog"
        aria-labelledby="canvas-tour-title"
        aria-describedby="canvas-tour-body"
        className="pointer-events-auto animate-[fadeIn_200ms_ease-out] p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-gold">
            <Icon className="h-4 w-4" />
            <span className="text-[11px] font-mono uppercase tracking-[0.16em] text-text-muted">
              Getting started · {step + 1}/{STEPS.length}
            </span>
          </div>
          <button
            onClick={dismiss}
            aria-label="Dismiss tour"
            className="-mr-1 -mt-1 cursor-pointer rounded p-1 text-text-muted transition-colors hover:text-text-secondary"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <p id="canvas-tour-title" className="mt-3 text-sm font-medium text-text-primary">
          {current.title}
        </p>
        <p id="canvas-tour-body" className="mt-1.5 text-xs leading-relaxed text-text-secondary">
          {current.body}
        </p>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-1.5 rounded-full transition-colors ${
                  i === step ? "bg-gold" : "bg-border"
                }`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {!isLast && (
              <Button variant="ghost" size="sm" onClick={dismiss}>
                Skip
              </Button>
            )}
            <Button
              ref={primaryRef}
              variant="primary"
              size="sm"
              onClick={() => (isLast ? dismiss() : setStep((s) => s + 1))}
            >
              {isLast ? "Got it" : "Next"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
