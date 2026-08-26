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
    return () => cancelAnimationFrame(frame);
  }, []);

  return <canvas ref={canvasRef} aria-hidden className={className} />;
}
