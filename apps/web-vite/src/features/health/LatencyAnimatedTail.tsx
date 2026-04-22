// Human: Recharts overlay that animates the newest latency sample as a glowing tail without fighting axis rescale jitter.
// Agent: USES useXAxisScale useYAxisScale; useLayoutEffect RAF animation; READS lastPoint slot value; CONFIG durationMs colors.

import { useLayoutEffect, useRef, useState } from "react";
import { useXAxisScale, useYAxisScale } from "recharts";

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

export type LatencyTailPoint = { slot: number; value: number };

/**
 * End-cap for a latency line, rendered inside a Recharts cartesian chart.
 * Animates in pixel space when the latest sample’s slot or value changes;
 * snaps when only scales change (e.g. Y-axis easing) to avoid jitter.
 */
export function LatencyAnimatedTail({
  lastPoint,
  durationMs = 400,
  pulseStroke = "#a5b4fc",
  dotFill = "#4f46e5",
  dotShadow = "drop-shadow(0 0 6px rgba(99,102,241,0.55))",
}: {
  lastPoint: LatencyTailPoint | undefined;
  durationMs?: number;
  /** Outer pulse ring stroke */
  pulseStroke?: string;
  /** Main dot fill */
  dotFill?: string;
  /** CSS filter on main dot */
  dotShadow?: string;
}) {
  const xScale = useXAxisScale(0);
  const yScale = useYAxisScale(0);

  const [renderPos, setRenderPos] = useState<{ x: number; y: number } | null>(null);
  const displayRef = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef(0);
  const prevDatumKeyRef = useRef<string>("");

  const tx =
    lastPoint != null && xScale != null ? xScale(lastPoint.slot) : undefined;
  const ty =
    lastPoint != null && yScale != null ? yScale(lastPoint.value) : undefined;

  const datumKey =
    lastPoint != null && Number.isFinite(lastPoint.value)
      ? `${lastPoint.slot}:${lastPoint.value}`
      : "";

  useLayoutEffect(() => {
    if (tx == null || ty == null || !Number.isFinite(tx) || !Number.isFinite(ty)) {
      return;
    }

    const scaleOnly = prevDatumKeyRef.current === datumKey && prevDatumKeyRef.current !== "";
    prevDatumKeyRef.current = datumKey;

    cancelAnimationFrame(rafRef.current);

    if (scaleOnly) {
      displayRef.current = { x: tx, y: ty };
      setRenderPos({ x: tx, y: ty });
      return;
    }

    const start = displayRef.current ?? { x: tx, y: ty };

    if (Math.hypot(tx - start.x, ty - start.y) < 0.75) {
      displayRef.current = { x: tx, y: ty };
      setRenderPos({ x: tx, y: ty });
      return;
    }

    const t0 = performance.now();

    const tick = (now: number) => {
      const u = Math.min(1, (now - t0) / durationMs);
      const e = easeOutCubic(u);
      const x = start.x + (tx - start.x) * e;
      const y = start.y + (ty - start.y) * e;
      displayRef.current = { x, y };
      setRenderPos({ x, y });
      if (u < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        displayRef.current = { x: tx, y: ty };
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [tx, ty, datumKey, durationMs]);

  if (
    renderPos == null ||
    !Number.isFinite(renderPos.x) ||
    !Number.isFinite(renderPos.y)
  ) {
    return null;
  }

  const { x, y } = renderPos;
  const strokeRing = "stroke-white dark:stroke-neutral-950";

  return (
    <g className="recharts-layer" style={{ pointerEvents: "none" }}>
      <circle cx={x} cy={y} r={6} fill="none" stroke={pulseStroke} strokeWidth={1.25} opacity={0.55}>
        <animate attributeName="r" values="5;16;5" dur="2.4s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.55;0;0.55" dur="2.4s" repeatCount="indefinite" />
      </circle>
      <circle
        cx={x}
        cy={y}
        r={5.5}
        fill={dotFill}
        strokeWidth={2}
        className={strokeRing}
        style={{ filter: dotShadow }}
      />
    </g>
  );
}
