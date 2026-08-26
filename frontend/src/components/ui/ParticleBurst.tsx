"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

const COUNT = 190;
/** 화면 좌표는 +y가 아래다 — 90°가 정확히 아래, 거기서 ±SPREAD만큼 벌어진 부채꼴 */
const SPREAD = 74;
const COLORS = ["#ffffff", "#FFE9C0", "#F7D6A0", "#E8975A", "#9BAAB8"];

/** #rrggbb → rgba(). 그라데이션 끝점을 투명하게 만들려면 알파를 붙여야 한다 */
function rgba(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * 광원 스프라이트를 **미리 한 장 구워둔다.**
 *
 * 파티클마다 매 프레임 createRadialGradient를 부르면 초당 1만 번이 넘는다.
 * 한 번 그려두고 drawImage로 찍으면 그 전부가 텍스처 복사 한 번이다.
 *
 * 가운데는 흰색이다 — 색을 그대로 두면 뭉툭한 점이 되고, 심지를 희게 빼야 빛으로 보인다
 */
function makeGlow(color: string) {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.16, rgba(color, 0.95));
  grad.addColorStop(0.42, rgba(color, 0.3));
  grad.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

type Particle = {
  dx: number;
  dy: number;
  /** 멈출 거리 — 방향을 따라 화면 테두리에 닿는 길이 */
  dist: number;
  size: number;
  life: number;
  age: number;
  glow: HTMLCanvasElement;
};

/**
 * 한 번 터지고 사라지는 파티클. **반드시 body로 포탈한다** —
 * 헤더 안에 두면 mix-blend-difference에 말려 색이 뒤집힌다.
 *
 * 물리를 적분하지 않고 **거리를 ease-out으로 훑는다.** 속도와 마찰로 굴리면
 * "화면 끝에서 멈춘다"를 맞추려고 마찰 계수를 손으로 더듬어야 한다.
 * 도착점을 먼저 정하고 그 사이를 감속 곡선으로 채우면 끝이 정확히 테두리다
 */
export default function ParticleBurst({
  x,
  y,
  onDone,
}: {
  x: number;
  y: number;
  onDone: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // onDone을 아래 effect의 의존성에 넣으면 부모가 다시 그릴 때마다 폭발이 처음부터 다시 시작된다.
  // 최신 함수는 ref로 따로 흘려보낸다 (렌더 중에는 ref를 건드리면 안 되므로 effect에서)
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    /** 원점에서 (dx,dy) 방향으로 화면 테두리에 닿기까지의 거리 */
    const toEdge = (dx: number, dy: number) => {
      const tx = dx > 0 ? (w - x) / dx : dx < 0 ? -x / dx : Infinity;
      const ty = dy > 0 ? (h - y) / dy : dy < 0 ? -y / dy : Infinity;
      return Math.min(tx, ty);
    };

    const glows = new Map(COLORS.map((color) => [color, makeGlow(color)]));

    const particles: Particle[] = Array.from({ length: COUNT }, () => {
      const angle = ((90 + (Math.random() * 2 - 1) * SPREAD) * Math.PI) / 180;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const color = COLORS[(Math.random() * COLORS.length) | 0];
      return {
        dx,
        dy,
        dist: toEdge(dx, dy) * (0.8 + Math.random() * 0.25),
        size: 10 + Math.random() * 26,
        life: 1.0 + Math.random() * 0.8,
        age: 0,
        glow: glows.get(color)!,
      };
    });

    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      // 탭이 백그라운드에 있다 돌아오면 dt가 몇 초로 뛴다 — 그대로 쓰면 한 프레임에 끝나버린다
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      ctx.clearRect(0, 0, w, h);
      // 겹치는 곳이 밝아진다 — 터지는 순간의 중심부가 하얗게 뭉치는 게 이것 때문이다
      ctx.globalCompositeOperation = "lighter";

      let alive = 0;
      for (const p of particles) {
        p.age += dt;
        if (p.age >= p.life) continue;
        alive++;

        const t = p.age / p.life;
        // ease-out quartic — t=0의 속도가 4×거리/수명이라 튀어나가듯 시작하고
        // 수명이 다하기 전에 사실상 멈춘다 ("사라지기 직전에 정지")
        const eased = 1 - (1 - t) ** 4;
        const px = x + p.dx * p.dist * eased;
        const py = y + p.dy * p.dist * eased;

        // 수명 절반까지는 최대 밝기로 버티다 뒤늦게 꺼진다 — 멈춤이 먼저, 소멸이 나중이다
        const k = 1 - t;
        ctx.globalAlpha = Math.min(1, k / 0.5) ** 1.5;

        const size = p.size * (0.55 + k * 0.45);
        ctx.drawImage(p.glow, px - size / 2, py - size / 2, size, size);
      }

      if (alive > 0) raf = requestAnimationFrame(frame);
      else doneRef.current();
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [x, y]);

  return createPortal(
    <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 z-[100]" />,
    document.body,
  );
}
