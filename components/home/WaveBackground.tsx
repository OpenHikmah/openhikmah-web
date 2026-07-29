"use client";

import { useEffect, useRef } from "react";

const SIZE = 4;
const GAP = 5;
const STEP = SIZE + GAP;
const SPEED = 0.08;
const SPEED_MOD = 0.5;
const BAND_WIDTH = 0.12;
const MAX_HEIGHT = 5;
const PEAK_ALPHA = 0.15;

export function WaveBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let W: number, H: number, COLS: number, ROWS: number;
    let animId: number;
    const start = performance.now();

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      W = window.innerWidth;
      H = window.innerHeight;
      canvas!.width = W * dpr;
      canvas!.height = H * dpr;
      canvas!.style.width = W + "px";
      canvas!.style.height = H + "px";
      ctx!.scale(dpr, dpr);
      COLS = Math.ceil(W / STEP) + 2;
      ROWS = Math.ceil(H / STEP) + 2;
    }

    const style = getComputedStyle(canvas!);
    const bgColor = style.getPropertyValue("--color-bg").trim();

    function hexToRgb(hex: string) {
      const v = parseInt(hex.slice(1), 16);
      if (isNaN(v)) return [10, 15, 26];
      return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
    }
    const [br, bg, bb] = hexToRgb(bgColor);

    function draw(t: number) {
      ctx!.fillStyle = bgColor;
      ctx!.fillRect(0, 0, W, H);

      const diagLen = COLS + ROWS;
      const raw = t * SPEED;
      const center = (raw - (SPEED_MOD / (2 * Math.PI)) * Math.sin(2 * Math.PI * raw)) % 1;

      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          const d = (col + row) / diagLen;
          let dist = d - center;
          if (dist > 0.5) dist -= 1;
          if (dist < -0.5) dist += 1;

          const strength = Math.exp(-(dist * dist) / (BAND_WIDTH * BAND_WIDTH));
          if (strength < 0.01) continue;

          const s2 = strength * strength;
          const alpha = s2 * PEAK_ALPHA;
          const offset = strength * MAX_HEIGHT;
          const warm = strength * 15;

          const x = col * STEP - GAP;
          const y = row * STEP - GAP - offset;

          ctx!.fillStyle = `rgba(${(210 + warm) | 0}, ${(225 + warm * 0.5) | 0}, 245, ${alpha})`;
          ctx!.fillRect(x, y, SIZE, SIZE);
        }
      }

      const grad = ctx!.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.65);
      grad.addColorStop(0, `rgba(${br},${bg},${bb},0)`);
      grad.addColorStop(0.6, `rgba(${br},${bg},${bb},0)`);
      grad.addColorStop(1, `rgba(${br},${bg},${bb},0.6)`);
      ctx!.fillStyle = grad;
      ctx!.fillRect(0, 0, W, H);
    }

    function loop() {
      if (!prefersReduced) draw((performance.now() - start) / 1000);
      animId = requestAnimationFrame(loop);
    }

    resize();
    window.addEventListener("resize", resize);
    loop();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-0 pointer-events-none"
      aria-hidden="true"
    />
  );
}
