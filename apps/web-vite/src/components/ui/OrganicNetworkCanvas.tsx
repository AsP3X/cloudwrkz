import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils/cn";
import { usePrefersReducedMotion } from "@/lib/hooks/usePrefersReducedMotion";

type Variant = "default" | "content";

type Node = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number;
  ty: number;
  steerAt: number;
  pulse: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  a: number;
};

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

/** Ease-out cubic: slow near full opacity so the graph settles gently. */
function spawnFadeEase(nowMs: number, startMs: number, durationMs: number): number {
  const t = Math.min(1, Math.max(0, (nowMs - startMs) / durationMs));
  return 1 - (1 - t) ** 3;
}

const SPAWN_FADE_MS = 1400;

function fillRadialOrb(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rCore: number,
  rHalo: number,
  centerA: number,
  midA: number,
  pulse: number,
  fadeMul: number,
) {
  const fm = Math.max(0, Math.min(1, fadeMul));
  const g = ctx.createRadialGradient(x, y, 0, x, y, rHalo);
  const boost = 0.38 * pulse;
  g.addColorStop(0, `rgba(255,255,255,${Math.min(1, (0.62 + boost) * fm)})`);
  g.addColorStop(0.2, `rgba(228,240,255,${(centerA + boost) * fm})`);
  g.addColorStop(0.5, `rgba(165,205,255,${(midA + boost * 0.55) * fm})`);
  g.addColorStop(1, "rgba(8,14,28,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, rHalo, 0, Math.PI * 2);
  ctx.fill();
}

function dist2(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function buildCellGrid(nodes: Node[], cellSize: number, w: number, h: number): Map<string, number[]> {
  const grid = new Map<string, number[]>();
  for (let i = 0; i < nodes.length; i++) {
    const nx = Math.min(w - 1e-4, Math.max(0, nodes[i].x));
    const ny = Math.min(h - 1e-4, Math.max(0, nodes[i].y));
    const cx = Math.floor(nx / cellSize);
    const cy = Math.floor(ny / cellSize);
    const k = `${cx},${cy}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k)!.push(i);
  }
  return grid;
}

function nearestIndices(
  i: number,
  nodes: Node[],
  grid: Map<string, number[]>,
  cellSize: number,
  connectR: number,
  w: number,
  h: number,
  maxN: number,
): number[] {
  const cellX = Math.floor(Math.min(w - 1e-4, Math.max(0, nodes[i].x)) / cellSize);
  const cellY = Math.floor(Math.min(h - 1e-4, Math.max(0, nodes[i].y)) / cellSize);
  const cand: { j: number; d2: number }[] = [];
  const r2 = connectR * connectR;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const arr = grid.get(`${cellX + dx},${cellY + dy}`);
      if (!arr) continue;
      for (const j of arr) {
        if (j === i) continue;
        const d2 = dist2(nodes[i].x, nodes[i].y, nodes[j].x, nodes[j].y);
        if (d2 < r2 && d2 > 1) cand.push({ j, d2 });
      }
    }
  }
  cand.sort((a, b) => a.d2 - b.d2);
  const out: number[] = [];
  for (const c of cand) {
    if (out.length >= maxN) break;
    if (!out.includes(c.j)) out.push(c.j);
  }
  return out;
}

type OrganicNetworkCanvasProps = {
  variant: Variant;
  className?: string;
};

/**
 * Dark atmospheric “living graph”: drifting nodes, dynamic edges, soft particles.
 * Softness is from drawing (glows, rounded strokes) — not CSS `filter: blur` on the canvas, which
 * tends to erase thin strokes. The frosted overlay uses backdrop-blur for extra diffusion.
 */
export function OrganicNetworkCanvas({ variant, className }: OrganicNetworkCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = usePrefersReducedMotion();

  const isContent = variant === "content";
  const nodeCount = isContent ? 200 : 260;
  const particleCount = isContent ? 160 : 220;

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    let w = 1;
    let h = 1;
    let dpr = 1;
    let connectR = 1;
    let cellSize = 40;
    let lastCanvasCssW = 0;
    let lastCanvasCssH = 0;
    const nodes: Node[] = [];
    const particles: Particle[] = [];
    /** Set whenever entities are (re)filled — animated draws fade in from this time. */
    let sceneFadeStartMs = 0;

    function fillEntities() {
      nodes.length = 0;
      particles.length = 0;
      sceneFadeStartMs = performance.now();
      const t0 = sceneFadeStartMs;
      for (let i = 0; i < nodeCount; i++) {
        nodes.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: rand(-0.08, 0.08),
          vy: rand(-0.08, 0.08),
          tx: rand(-0.22, 0.22),
          ty: rand(-0.22, 0.22),
          steerAt: t0 + rand(0, 5000),
          pulse: 0,
        });
      }
      for (let i = 0; i < particleCount; i++) {
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: rand(-0.045, 0.045),
          vy: rand(-0.045, 0.045),
          r: rand(0.35, 1.2),
          a: rand(0.08, 0.3),
        });
      }
    }

    function measure() {
      const r = wrap.getBoundingClientRect();
      const nw = Math.max(1, r.width);
      const nh = Math.max(1, r.height);
      const ndpr = Math.min(window.devicePixelRatio || 1, 2);
      const nextBufW = Math.floor(nw * ndpr);
      const nextBufH = Math.floor(nh * ndpr);
      /** Assigning canvas width/height resets the 2D context — skip when unchanged to avoid flicker / RO loops. */
      const sizeUnchanged =
        Math.abs(nw - lastCanvasCssW) < 0.5 &&
        Math.abs(nh - lastCanvasCssH) < 0.5 &&
        ndpr === dpr &&
        canvas.width === nextBufW &&
        canvas.height === nextBufH;
      w = nw;
      h = nh;
      dpr = ndpr;
      connectR = Math.min(w, h) * (isContent ? 0.1 : 0.12);
      cellSize = Math.max(connectR * 0.55, 36);
      if (sizeUnchanged) return;
      lastCanvasCssW = nw;
      lastCanvasCssH = nh;
      canvas.width = nextBufW;
      canvas.height = nextBufH;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /** Deep field (About-style); dots/lines bumped so they stay visible on this base. */
    const bgFill = "rgb(1, 2, 7)";

    function drawStaticFrame() {
      ctx.fillStyle = bgFill;
      ctx.fillRect(0, 0, w, h);
      const grid0 = buildCellGrid(nodes, cellSize, w, h);
      const drawn = new Set<string>();
      for (let i = 0; i < nodes.length; i++) {
        const nei = nearestIndices(i, nodes, grid0, cellSize, connectR, w, h, 4);
        for (const j of nei) {
          const a = Math.min(i, j);
          const b = Math.max(i, j);
          const k = `${a},${b}`;
          if (drawn.has(k)) continue;
          drawn.add(k);
          const d = Math.sqrt(dist2(nodes[a].x, nodes[a].y, nodes[b].x, nodes[b].y));
          const edgeT = 1 - d / connectR;
          if (edgeT <= 0) continue;
          const alpha = edgeT * (isContent ? 0.24 : 0.27);
          const lw = 1 + edgeT * 0.55;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(nodes[a].x, nodes[a].y);
          ctx.lineTo(nodes[b].x, nodes[b].y);
          ctx.strokeStyle = `rgba(125,178,248,${alpha * 0.28})`;
          ctx.lineWidth = lw * 5;
          ctx.stroke();
          ctx.strokeStyle = `rgba(198,222,255,${alpha})`;
          ctx.lineWidth = lw;
          ctx.stroke();
        }
      }
      for (const p of particles) {
        fillRadialOrb(ctx, p.x, p.y, p.r * 0.35, p.r * 4.2, p.a * 1.02, p.a * 0.28, 0, 1);
      }
      for (const n of nodes) {
        fillRadialOrb(ctx, n.x, n.y, 1.45, isContent ? 10.5 : 11.5, 0.7, 0.17, 0, 1);
      }
    }

    let raf = 0;
    let bootRaf = 0;
    let last = performance.now();
    let pulseAcc = 0;

    function step(frameTime: number) {
      const dt = Math.min(48, frameTime - last);
      last = frameTime;

      const tSec = frameTime * 0.001;
      const fadeIn = spawnFadeEase(frameTime, sceneFadeStartMs, SPAWN_FADE_MS);

      for (const n of nodes) {
        if (frameTime >= n.steerAt) {
          n.tx = rand(-0.22, 0.22);
          n.ty = rand(-0.22, 0.22);
          n.steerAt = frameTime + rand(2000, 6500);
        }
        const steer = 0.0042 * (dt / 16);
        n.vx += (n.tx - n.vx) * steer;
        n.vy += (n.ty - n.vy) * steer;
        n.x += n.vx * (dt / 16) * 1.12;
        n.y += n.vy * (dt / 16) * 1.12;
        /** Toroidal wrap — no teleport across the viewport (that read as spawn/despawn). */
        if (n.x < 0) n.x += w;
        else if (n.x > w) n.x -= w;
        if (n.y < 0) n.y += h;
        else if (n.y > h) n.y -= h;
        if (n.pulse > 0) n.pulse = Math.max(0, n.pulse - 0.00125 * (dt / 16));
      }

      pulseAcc += dt;
      if (pulseAcc > 850) {
        pulseAcc = 0;
        const burst = 2 + Math.floor(Math.random() * 3);
        for (let b = 0; b < burst; b++) {
          const idx = Math.floor(Math.random() * nodes.length);
          nodes[idx].pulse = Math.min(1, nodes[idx].pulse + rand(0.42, 0.95));
        }
      }

      for (const p of particles) {
        p.x += p.vx * (dt / 16) * 1.05;
        p.y += p.vy * (dt / 16) * 1.05;
        if (p.x < 0) p.x += w;
        else if (p.x > w) p.x -= w;
        if (p.y < 0) p.y += h;
        else if (p.y > h) p.y -= h;
        if (Math.random() < 0.00075 * dt) {
          p.vx = rand(-0.065, 0.065);
          p.vy = rand(-0.065, 0.065);
        }
      }

      ctx.fillStyle = bgFill;
      ctx.fillRect(0, 0, w, h);

      const grid = buildCellGrid(nodes, cellSize, w, h);
      const drawn = new Set<string>();
      /** Keep a floor so edges do not fully “blink out” (felt like dots dying). */
      const breathe = 0.76 + 0.24 * Math.sin(tSec * 0.33);

      for (let i = 0; i < nodes.length; i++) {
        const nei = nearestIndices(i, nodes, grid, cellSize, connectR, w, h, 4);
        for (const j of nei) {
          const a = Math.min(i, j);
          const b = Math.max(i, j);
          const key = `${a},${b}`;
          if (drawn.has(key)) continue;
          drawn.add(key);
          const d = Math.sqrt(dist2(nodes[a].x, nodes[a].y, nodes[b].x, nodes[b].y));
          const u = 1 - d / connectR;
          if (u <= 0) continue;
          const wave = 0.8 + 0.2 * Math.sin(tSec * 0.52 + (a + b) * 0.07);
          const alpha = u * (isContent ? 0.27 : 0.31) * breathe * wave * fadeIn;
          const lw = 1.08 + u * 0.58;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(nodes[a].x, nodes[a].y);
          ctx.lineTo(nodes[b].x, nodes[b].y);
          ctx.strokeStyle = `rgba(120,175,245,${alpha * 0.3})`;
          ctx.lineWidth = lw * 4.5;
          ctx.stroke();
          ctx.strokeStyle = `rgba(205,228,255,${alpha})`;
          ctx.lineWidth = lw;
          ctx.stroke();
        }
      }

      for (const p of particles) {
        const tw = 0.84 + 0.16 * Math.sin(tSec * 0.76 + p.x * 0.008);
        const pa = p.a * tw * (isContent ? 1.18 : 1.22);
        fillRadialOrb(ctx, p.x, p.y, p.r * 0.35, p.r * 4.2, pa * 1.02, pa * 0.28, 0, fadeIn);
      }

      for (const n of nodes) {
        const g = n.pulse;
        const rHalo = (isContent ? 10.5 : 11.5) + g * 10;
        fillRadialOrb(ctx, n.x, n.y, 1.25 + g * 1.65, rHalo, 0.66 + g * 0.34, 0.15 + g * 0.22, g, fadeIn);
      }

      raf = requestAnimationFrame(step);
    }

    function layoutAndMaybeStart() {
      measure();
      if (w < 32 || h < 32) {
        bootRaf = requestAnimationFrame(layoutAndMaybeStart);
        return;
      }
      cancelAnimationFrame(bootRaf);
      bootRaf = 0;
      cancelAnimationFrame(raf);
      raf = 0;
      fillEntities();
      if (reduced) {
        drawStaticFrame();
      } else {
        last = performance.now();
        raf = requestAnimationFrame(step);
      }
    }

    function ensureRunningAfterResize() {
      measure();
      if (w < 32 || h < 32) return;
      if (nodes.length === 0) {
        cancelAnimationFrame(bootRaf);
        bootRaf = 0;
        cancelAnimationFrame(raf);
        raf = 0;
        fillEntities();
        if (reduced) drawStaticFrame();
        else {
          last = performance.now();
          raf = requestAnimationFrame(step);
        }
        return;
      }
      if (reduced) drawStaticFrame();
    }

    const ro = new ResizeObserver(() => {
      ensureRunningAfterResize();
    });

    ro.observe(wrap);
    layoutAndMaybeStart();

    return () => {
      cancelAnimationFrame(bootRaf);
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [reduced, isContent, nodeCount, particleCount]);

  return (
    <div
      ref={wrapRef}
      className={cn("pointer-events-none absolute inset-0 z-[1] overflow-hidden", className)}
      aria-hidden
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block h-full w-full"
        style={{ opacity: 1 }}
      />
    </div>
  );
}
