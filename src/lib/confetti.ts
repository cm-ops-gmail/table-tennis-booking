/**
 * Tiny zero-dependency confetti burst. Spawns short-lived DOM shreds that
 * fall with a CSS keyframe, then cleans up. Honors prefers-reduced-motion.
 */
const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--success)",
];

export function burstConfetti(opts: { count?: number; originX?: number; originY?: number } = {}) {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  const count = opts.count ?? 90;
  const originX = opts.originX ?? window.innerWidth / 2;
  const originY = opts.originY ?? window.innerHeight * 0.32;

  const layer = document.createElement("div");
  layer.style.cssText =
    "position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden";
  document.body.appendChild(layer);

  for (let i = 0; i < count; i++) {
    const bit = document.createElement("div");
    const size = 6 + Math.random() * 7;
    const round = Math.random() > 0.5;
    const dx = (Math.random() - 0.5) * 620;
    const dr = `${(Math.random() - 0.5) * 1080}deg`;
    const dur = 1500 + Math.random() * 1400;
    const delay = Math.random() * 160;
    bit.style.cssText = `
      position:absolute; left:${originX}px; top:${originY}px;
      width:${size}px; height:${round ? size : size * 0.4}px;
      background:${COLORS[i % COLORS.length]};
      border-radius:${round ? "50%" : "1px"};
      opacity:1;
      --dx:${dx}px; --dr:${dr};
      animation: tt-confetti-fall ${dur}ms cubic-bezier(0.2,0.6,0.35,1) ${delay}ms forwards;
      will-change: transform, opacity;
    `;
    layer.appendChild(bit);
  }

  window.setTimeout(() => layer.remove(), 3200);
}
