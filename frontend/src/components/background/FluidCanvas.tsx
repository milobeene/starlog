"use client";

import { useEffect, useRef } from "react";
import { buildProgram } from "@/lib/fluidShader";
import { hexToRgb } from "@/lib/palette";
import { isActive, subscribeActivity } from "./activity";

/*
 * 속도 보간의 시간 상수(초). 지수 감쇠라 목표에 점근한다 —
 * 느려질 때는 천천히(1.2s: 약 3.5s 만에 5% 아래, 약 7s 만에 0.3% 아래라 멈춘 것과 같다),
 * 다시 흐를 때는 빠르게(0.35s) 따라붙어야 손에 반응하는 느낌이 난다
 */
const TAU_DOWN = 1.2;
const TAU_UP = 0.35;
/** 이 아래면 눈에 안 보이는 속도라 완전히 세우고 루프를 쉰다 */
const STILL_BELOW = 0.003;
/** 이 속도 아래면 프레임을 줄인다 */
const SLOW_BELOW = 0.25;
const SLOW_FRAME_MS = 45;

/**
 * 셰이더를 돌리는 캔버스 한 장. **전역 배경과 설정 미리보기가 이걸 공유한다.**
 *
 * 색과 목표 상태는 **ref로 흘린다.** 의존성에 넣으면 색을 한 칸 바꿀 때마다
 * WebGL 컨텍스트를 새로 만들게 되는데, 컨텍스트 생성은 브라우저가 개수를 세는 비싼 자원이라
 * 색 선택기를 몇 번 문지르면 앞의 것들이 강제로 잃어버려진다(context lost).
 */
export default function FluidCanvas({
  colors,
  targetAppState,
  split = -1,
  className = "",
}: {
  /** `#rrggbb` 다섯 개 */
  colors: string[];
  /** 0 = 입구, 1 = 앱 내부. 매 프레임 5%씩 이 값을 따라간다 */
  targetAppState: number;
  /** 0 이상이면 그 x 지점(0~1)부터 오른쪽이 앱 색감이다. 미리보기 전용 */
  split?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colorsRef = useRef(colors);
  const targetRef = useRef(targetAppState);
  const splitRef = useRef(split);

  // ref 쓰기를 렌더 본문이 아니라 effect에 두는 이유: 렌더는 부수효과가 없어야 한다
  /** 멈춰 있는 루프를 깨우는 손잡이 — 아래 effect가 채운다 */
  const wakeRef = useRef<() => void>(() => {});

  useEffect(() => {
    colorsRef.current = colors;
    targetRef.current = targetAppState;
    splitRef.current = split;
    // 멈춘 상태에서 색·목표가 바뀌어도 한 프레임은 새로 그려야 한다
    wakeRef.current();
  }, [colors, targetAppState, split]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl");
    if (!gl) return;

    const program = buildProgram(gl);
    if (!program) return;

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([1, 1, -1, 1, 1, -1, -1, -1]),
      gl.STATIC_DRAW,
    );

    const aVertexPosition = gl.getAttribLocation(program, "aVertexPosition");
    const uTime = gl.getUniformLocation(program, "uTime");
    const uResolution = gl.getUniformLocation(program, "uResolution");
    const uAppState = gl.getUniformLocation(program, "uAppState");
    const uSplit = gl.getUniformLocation(program, "uSplit");
    const colorSlots = ["colorA", "colorB", "colorC", "colorD", "colorE"].map((name) =>
      gl.getUniformLocation(program, name),
    );

    let current = targetRef.current;
    let frame = 0;
    /*
     * 셰이더에 주는 시간은 벽시계가 아니라 **내가 누적한 시간**이다. 속도를 줄이면 시간이
     * 천천히 흐르므로 무늬가 튀지 않고 그대로 느려진다 (벽시계에 곱하면 값이 점프한다).
     * 시작값을 벽시계로 맞춰 두는 건 전역 배경과 미리보기가 비슷한 무늬로 시작하게 하려는 것
     */
    let shaderSeconds = performance.now() * 0.001;
    let speed = 1;
    let lastFrame = 0;
    let running = false;
    let lost = false;

    /*
     * **컨텍스트를 잃으면 preventDefault를 해야 복구 이벤트가 온다.**
     * 명세상 preventDefault를 안 부르면 브라우저가 `webglcontextrestored`를 아예 안 보낸다.
     * 전역 배경은 루트 레이아웃에 있어 리마운트가 없으므로, 여기서 못 살리면
     * **새로고침 전까지 영영 안 돌아온다**
     */
    const onLost = (event: Event) => {
      event.preventDefault();
      cancelAnimationFrame(frame);
      running = false;
      lost = true;
    };
    const onRestored = () => {
      lost = false;
      wake();
    };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);

    const render = (now: number) => {
      /*
       * 느려진 동안은 20fps로 충분하다 — 움직임이 5배 이상 느려서 프레임 사이 변화가 작다.
       * lastFrame을 안 건드리고 돌아가므로 다음에 그릴 때 dt에 건너뛴 시간이 그대로 실린다
       */
      if (speed < SLOW_BELOW && lastFrame !== 0 && now - lastFrame < SLOW_FRAME_MS) {
        frame = requestAnimationFrame(render);
        return;
      }

      // 첫 프레임(또는 쉬다 깬 첫 프레임)은 dt를 0으로 — 쉰 시간이 한꺼번에 흐르면 점프한다.
      // 탭이 느려졌다 돌아온 경우도 0.1초에서 자른다
      const dt = lastFrame === 0 ? 0 : Math.min((now - lastFrame) / 1000, 0.1);
      lastFrame = now;

      const active = isActive(now);
      speed += ((active ? 1 : 0) - speed) * (1 - Math.exp(-dt / (active ? TAU_UP : TAU_DOWN)));
      const still = !active && speed < STILL_BELOW;
      if (still) speed = 0;
      shaderSeconds += dt * speed;
      const seconds = shaderSeconds;

      /*
       * devicePixelRatio를 곱하지 않는다 — 전체 화면 노이즈라 픽셀 수가 성능을 바로 먹는다.
       * clientWidth를 보는 이유: 미리보기는 창 크기가 아니라 제 박스 크기를 따라야 한다
       */
      const width = canvas.clientWidth || window.innerWidth;
      const height = canvas.clientHeight || window.innerHeight;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }

      current += (targetRef.current - current) * 0.05;
      const settled = Math.abs(targetRef.current - current) < 0.001;
      if (settled) current = targetRef.current;

      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.vertexAttribPointer(aVertexPosition, 2, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(aVertexPosition);

      gl.uniform1f(uTime, seconds);
      gl.uniform2f(uResolution, width, height);
      gl.uniform1f(uAppState, current);
      gl.uniform1f(uSplit, splitRef.current);

      const palette = colorsRef.current;
      colorSlots.forEach((slot, index) => {
        const [r, g, b] = hexToRgb(palette[index]);
        gl.uniform3f(slot, r, g, b);
      });

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // 멈췄고 라우트 전환 보간도 끝났으면 쉰다 — 마지막 프레임은 위에서 그렸다.
      // 입력·색 변경·창 크기 변경이 wake()로 깨운다
      if (still && settled) {
        running = false;
        lastFrame = 0;
        return;
      }
      frame = requestAnimationFrame(render);
    };

    function wake() {
      if (running || lost) return;
      running = true;
      frame = requestAnimationFrame(render);
    }
    wakeRef.current = wake;
    const unsubscribe = subscribeActivity(wake);
    wake();

    /*
     * **자원을 반드시 놓는다.** 캔버스가 DOM에서 빠져도 브라우저의 활성 컨텍스트 목록에는
     * GC가 걷어갈 때까지 남는다. 크롬은 한도(16개)를 넘으면 **가장 오래된 것을 강제로 잃게** 하는데,
     * 여기서 가장 오래된 건 루트 레이아웃의 전역 배경이다.
     *
     * 즉 설정 → 프로필 다이얼로그를 열고 닫기만 반복하면 (미리보기가 매번 새 컨텍스트를 만든다)
     * **배경이 죽는다.** 리뷰에서 16회째에 실제로 재현됐다.
     *
     * `loseContext()`가 핵심 — GC를 안 기다리고 즉시 목록에서 뺀다.
     * 리스너를 먼저 떼야 한다: loseContext가 위 onLost를 깨운다
     */
    return () => {
      unsubscribe();
      wakeRef.current = () => {};
      cancelAnimationFrame(frame);
      running = false;
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      gl.deleteBuffer(positionBuffer);
      gl.deleteProgram(program);

      /*
       * ⚠️ loseContext는 **진짜 언마운트일 때만** 부른다.
       *
       * StrictMode(dev)는 마운트 → 정리 → 마운트를 연달아 돌리는데,
       * 같은 캔버스의 getContext는 **같은 컨텍스트를 돌려준다**(위 주석과 같은 사실).
       * 여기서 무조건 죽이면 두 번째 마운트가 죽은 컨텍스트를 받아
       * `compileShader`가 통째로 실패한다 — 로그도 null로 나와 원인이 안 보이고
       * 화면에는 배경만 검게 뜬다. 실제로 그렇게 한 번 깨뜨렸다.
       *
       * 정리 시점에는 캔버스가 아직 DOM에 붙어 있어 재마운트인지 구분할 수 없다.
       * 그래서 한 틱 미뤄 확인한다 — 그때도 문서에 남아 있으면 재마운트다
       */
      setTimeout(() => {
        if (!canvas.isConnected) {
          gl.getExtension("WEBGL_lose_context")?.loseContext();
        }
      }, 0);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className={className} />;
}
