import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, CardContent, cx } from "../components/ui";
import { burstConfetti } from "../lib/confetti";

/* ------------------------------------------------------------------ *
 * A small 2.5-D table-tennis game: perspective table, net, a ball with
 * gravity that bounces on the table, real rallies, standard scoring
 * (first to 11, win by 2, serve switches every 2 points).
 * ------------------------------------------------------------------ */

const CW = 780;
const CH = 520;

// world units (metres-ish). z runs away from the camera.
const HW = 1.525 / 2 + 0.9; // half table width + a little run-off
const TABLE_HW = 0.7625 + 0.3;
const NEAR_Z = 0.5;
const FAR_Z = 5.6;
const NET_Z = (NEAR_Z + FAR_Z) / 2;
const NET_H = 0.32;
const BALL_R = 0.1;
const G = 9.5;

const CAM_BACK = 2.4;
const CAM_H = 1.9;
const PITCH = 0.36; // radians, camera tilted down toward the table
const FOCAL = 449;
const CX = CW / 2;
const CY = -118;
const SIN_P = Math.sin(PITCH);
const COS_P = Math.cos(PITCH);

type Diff = "easy" | "normal" | "hard";
const AI: Record<Diff, { speed: number; reachX: number; reachY: number; err: number; react: number }> = {
  easy: { speed: 2.6, reachX: 0.5, reachY: 0.46, err: 0.9, react: NET_Z + 1.6 },
  normal: { speed: 3.7, reachX: 0.42, reachY: 0.4, err: 0.5, react: NET_Z + 0.4 },
  hard: { speed: 5.0, reachX: 0.4, reachY: 0.38, err: 0.2, react: NET_Z - 0.6 },
};

interface V3 {
  x: number;
  y: number;
  z: number;
}
interface Game {
  ball: V3;
  vel: V3;
  pPad: V3; // player paddle (near)
  aPad: V3; // ai paddle (far)
  live: boolean;
  lastHit: "you" | "cpu" | null;
  hitterSide: "near" | "far" | null;
  bounces: number;
  landedOther: boolean;
  canHit: boolean; // player may strike the incoming ball
  aiCanHit: boolean;
}

function css(name: string, fallback = "#888") {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** pinhole projection with a downward camera pitch; returns screen point + px scale */
function project(x: number, y: number, z: number) {
  const ry = y - CAM_H;
  const rz = z + CAM_BACK;
  const cy = ry * COS_P - rz * SIN_P;
  const cz = Math.max(0.2, ry * SIN_P + rz * COS_P);
  const s = FOCAL / cz;
  return { x: CX + x * s, y: CY - cy * s, s };
}

/** velocity to travel from `p` to land (y=0) at (tx,tz) after time T under gravity */
function solveArc(p: V3, tx: number, tz: number, T: number): V3 {
  return {
    x: (tx - p.x) / T,
    z: (tz - p.z) / T,
    y: (0 - p.y) / T + 0.5 * G * T,
  };
}

const other = (w: "you" | "cpu") => (w === "you" ? "cpu" : "you");

export default function Play() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState<number | null>(null);
  const diffRef = useRef<Diff>("normal");
  const rafRef = useRef(0);
  const serverRef = useRef<"you" | "cpu">("you");

  const g = useRef<Game>({
    ball: { x: 0, y: 0.2, z: NEAR_Z },
    vel: { x: 0, y: 0, z: 0 },
    pPad: { x: 0, y: 0.55, z: NEAR_Z + 0.15 },
    aPad: { x: 0, y: 0.55, z: FAR_Z - 0.15 },
    live: false,
    lastHit: null,
    hitterSide: null,
    bounces: 0,
    landedOther: false,
    canHit: false,
    aiCanHit: false,
  });

  const [diff, setDiff] = useState<Diff>("normal");
  const [score, setScore] = useState({ you: 0, cpu: 0 });
  const [phase, setPhase] = useState<"idle" | "serve" | "rally" | "point" | "over">("idle");
  const [msg, setMsg] = useState("");
  const [winner, setWinner] = useState<"you" | "cpu" | null>(null);

  useEffect(() => {
    diffRef.current = diff;
  }, [diff]);

  const scoreRef = useRef(score);
  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  const doServe = useCallback((server: "you" | "cpu") => {
    const st = g.current;
    const nearSide = server === "you";
    st.ball = { x: nearSide ? -0.2 : 0.2, y: 0.75, z: nearSide ? NEAR_Z + 0.05 : FAR_Z - 0.05 };
    // arc into the receiver's half
    const tz = nearSide ? NET_Z + (FAR_Z - NET_Z) * 0.55 : NET_Z - (NET_Z - NEAR_Z) * 0.55;
    const tx = (Math.random() * 2 - 1) * TABLE_HW * 0.6;
    st.vel = solveArc(st.ball, tx, tz, 0.62);
    st.live = true;
    st.lastHit = server;
    st.hitterSide = nearSide ? "near" : "far";
    st.bounces = 0;
    st.landedOther = false;
    st.canHit = false;
    st.aiCanHit = false;
    setPhase("rally");
    setMsg("");
  }, []);

  const startMatch = useCallback(() => {
    setScore({ you: 0, cpu: 0 });
    setWinner(null);
    serverRef.current = Math.random() > 0.5 ? "you" : "cpu";
    setPhase("serve");
    setMsg(`${serverRef.current === "you" ? "Your" : "CPU"} serve`);
    setTimeout(() => doServe(serverRef.current), 800);
  }, [doServe]);

  const endPoint = useCallback(
    (won: "you" | "cpu", why: string) => {
      const st = g.current;
      st.live = false;
      setPhase("point");
      setMsg(why);
      const ns = {
        you: scoreRef.current.you + (won === "you" ? 1 : 0),
        cpu: scoreRef.current.cpu + (won === "cpu" ? 1 : 0),
      };
      setScore(ns);
      const done = (ns.you >= 11 || ns.cpu >= 11) && Math.abs(ns.you - ns.cpu) >= 2;
      if (done) {
        setWinner(won);
        setPhase("over");
        if (won === "you") burstConfetti({ count: 140 });
        return;
      }
      const total = ns.you + ns.cpu;
      // serve switches every 2 points (every 1 at deuce)
      const swap = ns.you >= 10 && ns.cpu >= 10 ? true : total % 2 === 0;
      if (swap) serverRef.current = other(serverRef.current);
      setTimeout(() => {
        setPhase("serve");
        setMsg(`${serverRef.current === "you" ? "Your" : "CPU"} serve`);
        setTimeout(() => doServe(serverRef.current), 700);
      }, 900);
    },
    [doServe]
  );

  /* pointer / touch control of the near paddle */
  useEffect(() => {
    const cvs = canvasRef.current!;
    const move = (cx: number, cy: number) => {
      const r = cvs.getBoundingClientRect();
      const nx = (cx - r.left) / r.width; // 0..1
      const ny = (cy - r.top) / r.height;
      g.current.pPad.x = (nx - 0.5) * 2 * (TABLE_HW + 0.35);
      g.current.pPad.y = 0.28 + (1 - Math.min(1, Math.max(0, ny))) * 1.05;
    };
    const mm = (e: MouseEvent) => move(e.clientX, e.clientY);
    const tm = (e: TouchEvent) => {
      if (e.touches[0]) {
        move(e.touches[0].clientX, e.touches[0].clientY);
        e.preventDefault();
      }
    };
    cvs.addEventListener("mousemove", mm);
    cvs.addEventListener("touchmove", tm, { passive: false });
    return () => {
      cvs.removeEventListener("mousemove", mm);
      cvs.removeEventListener("touchmove", tm);
    };
  }, []);

  /* main loop */
  useEffect(() => {
    const cvs = canvasRef.current!;
    const ctx = cvs.getContext("2d")!;
    // The table now renders much larger (up to ~90vw/82vw), so give the
    // backing store extra headroom on high-density screens to stay crisp.
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    cvs.width = CW * dpr;
    cvs.height = CH * dpr;
    ctx.scale(dpr, dpr);
    let last = performance.now();

    const step = (dt: number) => {
      const st = g.current;
      const A = AI[diffRef.current];

      if (st.live) {
        st.vel.y -= G * dt;
        st.ball.x += st.vel.x * dt;
        st.ball.y += st.vel.y * dt;
        st.ball.z += st.vel.z * dt;

        // table bounce
        if (st.ball.y <= BALL_R && st.vel.y < 0) {
          const onTable =
            Math.abs(st.ball.x) <= TABLE_HW + 0.02 && st.ball.z >= NEAR_Z && st.ball.z <= FAR_Z;
          if (onTable) {
            st.ball.y = BALL_R;
            st.vel.y = -st.vel.y * 0.72;
            st.vel.x *= 0.985;
            st.vel.z *= 0.99;
            st.bounces += 1;
            const side: "near" | "far" = st.ball.z < NET_Z ? "near" : "far";
            if (st.bounces === 1) st.landedOther = side !== st.hitterSide;
            if (st.bounces >= 2) {
              endPoint(st.landedOther ? st.lastHit! : other(st.lastHit!), st.landedOther ? "Point!" : "Double bounce");
              return;
            }
            // after a valid crossing, the receiver may now strike
            if (st.bounces === 1 && st.landedOther) {
              if (side === "near") st.canHit = true;
              else st.aiCanHit = true;
            }
          } else {
            // hit the floor beside/under the table -> dead
            endPoint(st.landedOther ? st.lastHit! : other(st.lastHit!), st.landedOther ? "Point!" : "Out");
            return;
          }
        }

        // net
        if (
          Math.abs(st.ball.z - NET_Z) < 0.08 &&
          st.ball.y < NET_H + BALL_R &&
          Math.abs(st.ball.x) < TABLE_HW + 0.1
        ) {
          st.live = false;
          st.vel.x *= 0.2;
          st.vel.z *= -0.2;
          endPoint(other(st.lastHit!), "Into the net");
          return;
        }

        // past a baseline in the air -> out (or a winner if it had landed)
        if (st.ball.z < NEAR_Z - 1.1 || st.ball.z > FAR_Z + 1.1) {
          endPoint(st.landedOther ? st.lastHit! : other(st.lastHit!), st.landedOther ? "Point!" : "Long");
          return;
        }

        /* ---- player strike ---- */
        // Hit box roughly matches the drawn blade (a little forgiving, not
        // the old ~9x-oversized zone that "hit" balls flying past the bat).
        if (
          st.canHit &&
          st.vel.z < 0 &&
          st.ball.z < st.pPad.z + 0.38 &&
          st.ball.z > st.pPad.z - 0.42 &&
          Math.abs(st.ball.x - st.pPad.x) < 0.34 &&
          Math.abs(st.ball.y - st.pPad.y) < 0.34
        ) {
          const tz = NET_Z + (FAR_Z - NET_Z) * (0.35 + Math.random() * 0.5);
          const tx = Math.max(-TABLE_HW * 0.9, Math.min(TABLE_HW * 0.9, st.pPad.x * 0.55 + (Math.random() * 0.5 - 0.25)));
          const T = 0.52 + Math.random() * 0.08;
          st.vel = solveArc(st.ball, tx, tz, T);
          // guarantee net clearance
          const tHalf = (NET_Z - st.ball.z) / st.vel.z;
          const yAtNet = st.ball.y + st.vel.y * tHalf - 0.5 * G * tHalf * tHalf;
          if (yAtNet < NET_H + 0.12) st.vel.y += (NET_H + 0.2 - yAtNet) / Math.max(0.15, tHalf);
          st.lastHit = "you";
          st.hitterSide = "near";
          st.bounces = 0;
          st.landedOther = false;
          st.canHit = false;
          st.aiCanHit = false;
        }

        /* ---- AI ---- */
        // track toward predicted x once the ball is coming back
        if (st.vel.z > 0 && st.ball.z > A.react) {
          const tToPlane = (st.aPad.z - st.ball.z) / Math.max(0.1, st.vel.z);
          const predX = st.ball.x + st.vel.x * tToPlane + (Math.random() * 2 - 1) * A.err * 0.15;
          const dx = predX - st.aPad.x;
          st.aPad.x += Math.sign(dx) * Math.min(Math.abs(dx), A.speed * dt);
          const dy = Math.max(0.3, Math.min(1.3, st.ball.y)) - st.aPad.y;
          st.aPad.y += Math.sign(dy) * Math.min(Math.abs(dy), A.speed * dt);
        } else {
          const dx = 0 - st.aPad.x;
          st.aPad.x += Math.sign(dx) * Math.min(Math.abs(dx), A.speed * 0.5 * dt);
        }
        st.aPad.x = Math.max(-TABLE_HW - 0.35, Math.min(TABLE_HW + 0.35, st.aPad.x));

        if (
          st.aiCanHit &&
          st.vel.z > 0 &&
          st.ball.z > st.aPad.z - 0.6 &&
          st.ball.z < st.aPad.z + 0.55 &&
          Math.abs(st.ball.x - st.aPad.x) < A.reachX &&
          Math.abs(st.ball.y - st.aPad.y) < A.reachY
        ) {
          const tz = NEAR_Z + (NET_Z - NEAR_Z) * (0.25 + Math.random() * 0.55);
          const tx = Math.max(
            -TABLE_HW * 0.92,
            Math.min(TABLE_HW * 0.92, -st.aPad.x * 0.3 + (Math.random() * 2 - 1) * A.err)
          );
          const T = 0.5 + Math.random() * 0.08;
          st.vel = solveArc(st.ball, tx, tz, T);
          const tHalf = (st.ball.z - NET_Z) / -st.vel.z;
          const yAtNet = st.ball.y + st.vel.y * tHalf - 0.5 * G * tHalf * tHalf;
          if (yAtNet < NET_H + 0.12) st.vel.y += (NET_H + 0.2 - yAtNet) / Math.max(0.15, tHalf);
          st.lastHit = "cpu";
          st.hitterSide = "far";
          st.bounces = 0;
          st.landedOther = false;
          st.canHit = false;
          st.aiCanHit = false;
        }
      }
    };

    const draw = () => {
      const cardCol = css("--card", "#fff");
      const line = css("--foreground", "#111");
      const you = css("--success", "#16a34a");
      const cpu = css("--info", "#2563eb");
      const muted = css("--muted-foreground", "#888");

      ctx.clearRect(0, 0, CW, CH);
      // backdrop
      const bg = ctx.createLinearGradient(0, 0, 0, CH);
      bg.addColorStop(0, cardCol);
      bg.addColorStop(1, css("--secondary", cardCol));
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, CW, CH);

      const st = g.current;
      const poly = (pts: { x: number; y: number }[], fill: string, alpha = 1) => {
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.closePath();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.globalAlpha = 1;
      };

      // --- table top ---
      const c1 = project(-TABLE_HW, 0, NEAR_Z);
      const c2 = project(TABLE_HW, 0, NEAR_Z);
      const c3 = project(TABLE_HW, 0, FAR_Z);
      const c4 = project(-TABLE_HW, 0, FAR_Z);

      // legs (drawn first, behind the top)
      const APRON = 0.42;
      const legAt = (lx: number, lz: number) => {
        const t = project(lx, 0, lz);
        const bpt = project(lx, -1.35, lz);
        ctx.strokeStyle = "rgba(80,90,110,0.5)";
        ctx.lineWidth = Math.max(2, 0.06 * t.s);
        ctx.beginPath();
        ctx.moveTo(t.x, t.y);
        ctx.lineTo(bpt.x, bpt.y);
        ctx.stroke();
      };
      legAt(-TABLE_HW + 0.15, FAR_Z - 0.15);
      legAt(TABLE_HW - 0.15, FAR_Z - 0.15);
      legAt(-TABLE_HW + 0.15, NEAR_Z + 0.15);
      legAt(TABLE_HW - 0.15, NEAR_Z + 0.15);

      // apron (side + front thickness of the table)
      const a1 = project(-TABLE_HW, -APRON, NEAR_Z);
      const a2 = project(TABLE_HW, -APRON, NEAR_Z);
      const a4 = project(-TABLE_HW, -APRON, FAR_Z);
      poly([c1, c2, a2, a1], "#1e3a5f");
      poly([c1, a1, a4, c4], "#16304e");

      // top surface
      poly([c1, c2, c3, c4], cpu, 0.9);
      poly([c1, c2, c3, c4], "#dbeafe", 0.28);
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(c1.x, c1.y);
      ctx.lineTo(c2.x, c2.y);
      ctx.lineTo(c3.x, c3.y);
      ctx.lineTo(c4.x, c4.y);
      ctx.closePath();
      ctx.stroke();

      // centre line
      const paint = (a: V3, b: V3) => {
        const pa = project(a.x, 0, a.z);
        const pb = project(b.x, 0, b.z);
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      };
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6;
      paint({ x: 0, y: 0, z: NEAR_Z }, { x: 0, y: 0, z: FAR_Z });
      ctx.globalAlpha = 1;
      void paint;

      // --- ball shadow ---
      const sh = project(st.ball.x, 0, st.ball.z);
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.beginPath();
      ctx.ellipse(sh.x, sh.y, Math.max(3, BALL_R * sh.s * 1.1), Math.max(1.5, BALL_R * sh.s * 0.5), 0, 0, 7);
      ctx.fill();

      // --- net ---
      const npL = project(-TABLE_HW - 0.05, 0, NET_Z);
      const npLt = project(-TABLE_HW - 0.05, NET_H, NET_Z);
      const npR = project(TABLE_HW + 0.05, 0, NET_Z);
      const npRt = project(TABLE_HW + 0.05, NET_H, NET_Z);
      ctx.fillStyle = "rgba(120,130,150,0.22)";
      ctx.beginPath();
      ctx.moveTo(npL.x, npL.y);
      ctx.lineTo(npLt.x, npLt.y);
      ctx.lineTo(npRt.x, npRt.y);
      ctx.lineTo(npR.x, npR.y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(120,130,150,0.5)";
      ctx.lineWidth = 1;
      for (let i = 0; i <= 10; i++) {
        const x = -TABLE_HW - 0.05 + ((2 * (TABLE_HW + 0.05)) * i) / 10;
        const a = project(x, 0, NET_Z);
        const b = project(x, NET_H, NET_Z);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(npLt.x, npLt.y);
      ctx.lineTo(npRt.x, npRt.y);
      ctx.stroke();

      // --- paddles ---
      const pad = (p: V3, col: string) => {
        const c = project(p.x, p.y, p.z);
        // Blade drawn close to the actual hit box so a "hit" always looks
        // like contact.
        const w = Math.min(32, Math.max(6, 0.15 * c.s));
        const h = w * 1.25;
        // handle
        ctx.strokeStyle = "rgba(90,70,55,0.9)";
        ctx.lineWidth = Math.max(2, w * 0.32);
        ctx.beginPath();
        ctx.moveTo(c.x, c.y + h * 0.7);
        ctx.lineTo(c.x, c.y + h * 1.5);
        ctx.stroke();
        // blade
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, w, h, 0, 0, 7);
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.28)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      };
      // draw far paddle first (painter's order)
      pad(st.aPad, cpu);

      // --- ball ---
      const b = project(st.ball.x, st.ball.y, st.ball.z);
      const br = Math.min(16, Math.max(3, BALL_R * b.s));
      const grad = ctx.createRadialGradient(b.x - br * 0.3, b.y - br * 0.3, br * 0.2, b.x, b.y, br);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(1, "#e2e2e2");
      ctx.fillStyle = grad;
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(b.x, b.y, br, 0, 7);
      ctx.fill();
      ctx.stroke();

      pad(st.pPad, you);
      void muted;
    };

    const loop = (now: number) => {
      let dtMs = now - last;
      last = now;
      dtMs = Math.min(48, dtMs);
      // fixed sub-steps for stable physics
      const steps = 3;
      for (let i = 0; i < steps; i++) step(dtMs / 1000 / steps);
      draw();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [endPoint]);

  // Size the table itself: as wide as the layout allows (~90vw on phones,
  // ~82vw on desktop), but never so tall that the page has to scroll — the
  // table's own height (width / 1.5) plus everything else on the page must
  // fit inside the actual window. Measured fresh on every resize, so it's
  // correct regardless of how much chrome surrounds it.
  useLayoutEffect(() => {
    function fit() {
      const box = boxRef.current;
      if (!box || !box.parentElement) return;
      const vw = window.innerWidth;
      const isDesktop = vw >= 640;
      const desired = isDesktop ? Math.min(vw * 0.82, 1400) : vw * 0.97;

      // Never ask for more than the parent card actually has to give — a
      // flex row centers items that fit, but pins ones that don't to its
      // start edge, so an over-wide box here would spill out one side
      // instead of overflowing evenly. Measuring the real content width
      // keeps this correct regardless of card padding on any breakpoint.
      const parent = box.parentElement;
      const parentStyle = getComputedStyle(parent);
      const parentContentWidth =
        parent.clientWidth - parseFloat(parentStyle.paddingLeft || "0") - parseFloat(parentStyle.paddingRight || "0");
      const widthCap = Math.min(desired, parentContentWidth);

      // Phones have plenty of headroom below the table and scroll fine, so
      // only desktop needs the height check that keeps the page unscrolled.
      if (!isDesktop) {
        setBoxWidth(Math.round(widthCap));
        return;
      }

      const boxHeight = box.getBoundingClientRect().height;
      const chromeHeight = document.documentElement.scrollHeight - boxHeight;
      const availableHeight = window.innerHeight - chromeHeight - 8;
      const heightCap = availableHeight * (CW / CH);

      setBoxWidth(Math.round(Math.max(240, Math.min(widthCap, heightCap))));
    }
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const showOverlay = phase !== "rally";

  return (
    // Break out of the shell's max-w-6xl / px-4 so the table can genuinely
    // fill ~90% of the viewport on phones and ~80% on desktop, per request —
    // a game screen benefits from using the whole window, unlike the reading
    // -width pages around it.
    <div className="relative left-1/2 w-screen -translate-x-1/2 px-1.5 sm:px-6">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <span>🏓</span> Table Tennis · vs Computer
          </h1>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-muted-foreground sm:inline">Difficulty</span>
            {(["easy", "normal", "hard"] as Diff[]).map((d) => (
              <button
                key={d}
                onClick={() => setDiff(d)}
                className={cx(
                  "tt-press rounded-md border px-3 py-1 text-xs font-medium capitalize transition-colors",
                  diff === d ? "border-primary bg-primary text-primary-foreground" : "border-input hover:bg-accent"
                )}
              >
                {d}
              </button>
            ))}
            <Link
              to="/"
              className="ml-1 rounded-md border border-input px-3 py-1.5 text-sm font-medium no-underline transition-colors hover:bg-accent"
            >
              ← Back
            </Link>
          </div>
        </div>

        <Card>
          <CardContent className="flex flex-col items-center gap-3 px-3 pt-4 sm:px-5">
            <div className="flex w-full items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm bg-[color:var(--success)]" />
                <span className="font-medium">You</span>
                <span className="text-2xl font-bold tabular-nums">{score.you}</span>
              </div>
              <span className="text-xs text-muted-foreground">first to 11 · win by 2</span>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold tabular-nums">{score.cpu}</span>
                <span className="font-medium">CPU</span>
                <span className="h-3 w-3 rounded-sm bg-[color:var(--info)]" />
              </div>
            </div>

            <div
              ref={boxRef}
              className="relative mx-auto w-full"
              style={boxWidth ? { width: boxWidth } : undefined}
            >
              <canvas
                ref={canvasRef}
                width={CW}
                height={CH}
                className="w-full touch-none rounded-xl border border-border"
                style={{ aspectRatio: `${CW} / ${CH}`, cursor: phase === "rally" ? "none" : "default" }}
              />
              {showOverlay && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl bg-background/70 backdrop-blur-sm">
                  {phase === "over" ? (
                    <div className="tt-pop text-center">
                      <div className="text-5xl">{winner === "you" ? "🏆" : "🤖"}</div>
                      <div className="mt-1 text-lg font-semibold">
                        {winner === "you" ? "Game — you win!" : "Game — CPU wins"}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {score.you}–{score.cpu}
                      </div>
                    </div>
                  ) : phase === "idle" ? (
                    <div className="max-w-xs text-center">
                      <div className="text-3xl">🏓</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        Move the mouse (or drag your finger) to slide your paddle left–right and
                        lift it up–down. Let the ball bounce on your half, then swing it back over
                        the net. Just for fun — nothing is saved.
                      </div>
                    </div>
                  ) : (
                    <div className="tt-pop text-base font-semibold">{msg || "…"}</div>
                  )}
                  {(phase === "idle" || phase === "over") && (
                    <Button size="lg" onClick={startMatch}>
                      {phase === "over" ? "Play again" : "Start game"} 🏓
                    </Button>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
