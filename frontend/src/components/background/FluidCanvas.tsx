"use client";

import { useEffect, useRef } from "react";
import { buildProgram } from "@/lib/fluidShader";
import { hexToRgb } from "@/lib/palette";

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
  useEffect(() => {
    colorsRef.current = colors;
    targetRef.current = targetAppState;
    splitRef.current = split;
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
     * **컨텍스트를 잃으면 preventDefault를 해야 복구 이벤트가 온다.**
     * 명세상 preventDefault를 안 부르면 브라우저가 `webglcontextrestored`를 아예 안 보낸다.
     * 전역 배경은 루트 레이아웃에 있어 리마운트가 없으므로, 여기서 못 살리면
     * **새로고침 전까지 영영 안 돌아온다**
     */
    const onLost = (event: Event) => {
        event.preventDefault();
        cancelAnimationFrame(frame);
    };
    const onRestored = () => {
        frame = requestAnimationFrame(render);
    };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);

    const render = (now: number) => {
      const seconds = now * 0.001;

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
      frame = requestAnimationFrame(render);
    };

    frame = requestAnimationFrame(render);

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
      cancelAnimationFrame(frame);
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
