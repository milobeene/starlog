"use client";

import { useEffect, useRef, useState } from "react";
import ParticleBurst from "@/components/ui/ParticleBurst";

/**
 * 초당 아홉 바퀴. 이쯤이면 별 모양이 뭉개져 빛나는 원반으로 보이는데, 그게 노린 것이다 —
 * 형태가 사라져야 "최고 속도에 닿았다"가 눈에 보이고, 손을 뗄 때가 됐다는 신호가 된다
 */
const MAX_SPEED = 3240; // deg/s
const RAMP_MS = 2000;

type Mode = "idle" | "charging" | "settling";

/**
 * 헤더 가운데 심볼 — 장식이자 장난감이다. 링크가 아니다(나가는 출구는 왼쪽 워드마크).
 *
 * **꾹 누르면 2초에 걸쳐 최고 속도까지 오른다.** 최고 속도에서 손을 떼면 아래로 파티클이 터진다.
 *
 * **역회전은 없다.** 손을 떼면 늘 같은 방향으로 더 돌아서 각이 설 때(360의 배수) 멈춘다.
 * 되감기면 태엽 장난감처럼 보여서 회전의 관성이 사라진다.
 *
 * 각도는 React 상태가 아니라 ref다 — 60fps로 setState를 하면 헤더 전체가 매 프레임 다시 그려진다.
 * 값은 ref에 두고 DOM의 transform만 직접 쓴다
 */
export default function HeaderSymbol() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [burst, setBurst] = useState<{ id: number; x: number; y: number } | null>(null);

  const st = useRef({
    mode: "idle" as Mode,
    angle: 0,
    speed: 0,
    last: 0,
    start: 0,
    from: 0,
    to: 0,
    dur: 0,
    raf: 0,
  });

  useEffect(() => () => cancelAnimationFrame(st.current.raf), []);


  // 위 안전망이 항상 최신 release를 부르게 한다 (effect는 마운트 때 한 번만 붙는다)
  const releaseRef = useRef(() => {});

  const draw = () => {
    if (svgRef.current) svgRef.current.style.transform = `rotate(${st.current.angle}deg)`;
  };

  const frame = (now: number) => {
    const s = st.current;
    const dt = Math.min((now - s.last) / 1000, 0.05);
    s.last = now;

    if (s.mode === "charging") {
      /*
       * smoothstep — 시작도 끝도 완만하다. 선형으로 올리면 누르는 순간 툭 튀고,
       * 2초째에 가속이 뚝 끊겨 최고 속도에 부딪히는 게 보인다
       */
      const p = Math.min(1, (now - s.start) / RAMP_MS);
      s.speed = MAX_SPEED * p * p * (3 - 2 * p);
      s.angle += s.speed * dt;
      draw();
      s.raf = requestAnimationFrame(frame);
      return;
    }

    if (s.mode === "settling") {
      const p = Math.min(1, (now - s.start) / s.dur);
      s.angle = s.from + (s.to - s.from) * (1 - (1 - p) ** 3);
      draw();
      if (p < 1) {
        s.raf = requestAnimationFrame(frame);
        return;
      }
      s.mode = "idle";
      s.speed = 0;
      s.angle = 0; // to는 항상 360의 배수라 화면은 그대로다. 각도가 무한히 커지는 것만 막는다
      draw();
    }
  };

  const press = (event: React.PointerEvent<SVGSVGElement>) => {
    /*
     * 포인터를 잡아둔다 — 안 그러면 누른 채 심볼 밖으로 나갔을 때 떼는 걸 못 받아 영영 돈다.
     * 실패해도 회전은 시작돼야 한다 (활성 포인터가 없으면 던진다)
     */
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* 잡기에 실패하면 그냥 이 요소 위에서 떼야 멈춘다 */
    }

    const s = st.current;
    cancelAnimationFrame(s.raf);
    s.mode = "charging";
    s.speed = 0;
    s.last = s.start = performance.now();
    s.raf = requestAnimationFrame(frame);
  };

  const release = () => {
    const s = st.current;
    if (s.mode !== "charging") return;

    /*
     * 최고 속도에 닿았을 때만 터진다. 살짝 눌렀다 떼면 조용히 제자리로 돌아갈 뿐이다.
     *
     * 시간이 아니라 **속도**로 잰다. 시간으로 재면 2.000초가 칼날이 되는데,
     * smoothstep이라 1.8초쯤이면 이미 최고속도와 눈으로 구분이 안 된다 —
     * 다 찼다고 보고 뗐는데 아무 일도 안 일어나는 구멍이 생긴다
     */
    if (s.speed >= MAX_SPEED * 0.98) {
      const rect = svgRef.current?.getBoundingClientRect();
      if (rect) {
        setBurst({
          id: performance.now(),
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        });
      }
    }

    /*
     * 남은 거리가 짧으면 한 바퀴를 더 준다 — 감속할 자리가 없으면 급정거로 보인다.
     *
     * ease-out cubic의 t=0 속도는 3×거리/시간이다. 시간을 그 식으로 되돌려 잡으면
     * 손을 뗀 순간의 속도가 끊김 없이 이어진다 (clamp는 아주 느리게 뗐을 때의 보호막)
     */
    const v0 = Math.max(s.speed, 240);
    let to = Math.ceil(s.angle / 360) * 360;
    // 0.22초어치. 이보다 짧게 잡았더니 최고속도에서 감속이 0.36초 만에 끝나
    // 감속이 아니라 그냥 계속 도는 것으로 보였다 — 초당 아홉 바퀴에서는 그만큼 남겨야 읽힌다
    while (to - s.angle < v0 * 0.22) to += 360;

    s.from = s.angle;
    s.to = to;
    // 위 한계를 너무 낮게 잡으면 손을 뗀 순간 오히려 **빨라진다** — 감속보다 그게 더 튄다
    s.dur = Math.min(1200, Math.max(300, (3 * (to - s.angle) * 1000) / v0));
    s.last = s.start = performance.now();
    s.mode = "settling";
    cancelAnimationFrame(s.raf);
    s.raf = requestAnimationFrame(frame);
  };

  // release는 매 렌더 새로 만들어진다. 최신 것을 ref로 흘려보내야 아래 안전망이 헌 걸 안 붙든다
  useEffect(() => {
    releaseRef.current = release;
  });

  /*
   * 안전망. 포인터 캡처가 어떤 이유로든 풀리면 뗀 걸 못 받아 **영영 도는** 상태가 된다.
   * 창 전체에서 한 번 더 듣는다 — 이미 멈춘 뒤에 와도 release가 알아서 무시한다
   */
  useEffect(() => {
    const stop = () => releaseRef.current();
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, []);

  return (
    <>
      {/*
        shapeRendering=geometricPrecision — 브라우저가 속도보다 **정밀도**를 택하게 한다.
        기본값(auto)은 작은 도형에서 픽셀 격자에 맞추려다 곡선을 계단으로 만든다.
        mix-blend-mode가 이 요소를 별도 합성 레이어로 올리는 것도 겹쳐 더 도드라진다
      */}
      <svg
        ref={svgRef}
        viewBox="0 0 100 100"
        aria-hidden
        shapeRendering="geometricPrecision"
        onPointerDown={press}
        onPointerUp={release}
        onPointerCancel={release}
        // touch-none — 모바일에서 꾹 누른 채 손이 밀려도 페이지가 스크롤되지 않는다
        className="pointer-events-auto mx-4 h-8 w-8 shrink-0 cursor-grab touch-none select-none text-white active:cursor-grabbing"
        fill="currentColor"
        style={{ transformOrigin: "50% 50%", willChange: "transform" }}
      >
        <path
          fillRule="evenodd"
          d="M50 3 Q60.5 39.5 97 50 Q60.5 60.5 50 97 Q39.5 60.5 3 50 Q39.5 39.5 50 3 Z M50 33 Q55 45 67 50 Q55 55 50 67 Q45 55 33 50 Q45 45 50 33 Z"
        />
      </svg>

      {/* key로 갈아끼운다 — 연달아 터뜨리면 이전 폭발을 이어받는 게 아니라 새로 시작해야 한다 */}
      {burst && (
        <ParticleBurst
          key={burst.id}
          x={burst.x}
          y={burst.y}
          onDone={() => setBurst(null)}
        />
      )}
    </>
  );
}
