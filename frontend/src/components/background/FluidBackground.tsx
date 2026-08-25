"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * 서비스의 아이덴티티 — 유체 흐름 + 필름 그레인. 전역에 한 장만 깔린다.
 *
 * uAppState 하나로 두 얼굴을 만든다:
 *   0.0 = 입구 페이지 — 원색, 무지개 순회, 빠름
 *   1.0 = 앱 내부     — 어둡고 탈채도, 느림 (본문이 읽혀야 하므로)
 *
 * 라우트가 바뀌면 목표값만 갈아끼우고 렌더 루프가 프레임마다 5%씩 따라간다.
 * 즉시 전환하면 화면이 번쩍인다
 */
export default function FluidBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const targetRef = useRef(0);
  const pathname = usePathname();

  // 렌더 루프는 한 번만 뜬다. 라우트 변화는 ref로만 전달한다 —
  // 의존성에 넣으면 페이지를 옮길 때마다 WebGL 컨텍스트를 새로 만든다.
  // ref 쓰기를 렌더 본문이 아니라 effect에 두는 이유: 렌더는 부수효과가 없어야 한다
  useEffect(() => {
    targetRef.current = pathname === "/" ? 0 : 1;
  }, [pathname]);

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

    let current = targetRef.current;
    let frame = 0;

    const render = (now: number) => {
      const seconds = now * 0.001;

      // devicePixelRatio를 곱하지 않는다 — 전체 화면 노이즈라 픽셀 수가 성능을 바로 먹는다
      if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        gl.viewport(0, 0, canvas.width, canvas.height);
      }

      current += (targetRef.current - current) * 0.05;

      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.vertexAttribPointer(aVertexPosition, 2, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(aVertexPosition);

      gl.uniform1f(uTime, seconds);
      gl.uniform2f(uResolution, canvas.width, canvas.height);
      gl.uniform1f(uAppState, current);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      frame = requestAnimationFrame(render);
    };

    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 h-screen w-screen"
    />
  );
}

const VERTEX_SHADER = `
attribute vec4 aVertexPosition;
varying vec2 vUv;
void main() {
    gl_Position = aVertexPosition;
    vUv = aVertexPosition.xy * 0.5 + 0.5;
}
`;

const FRAGMENT_SHADER = `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform vec2 uResolution;
uniform float uAppState;

vec3 colorA = vec3(0.91, 0.36, 0.02);
vec3 colorB = vec3(0.91, 0.77, 0.42);
vec3 colorC = vec3(0.66, 0.85, 0.86);
vec3 colorD = vec3(0.16, 0.62, 0.56);
vec3 colorE = vec3(0.11, 0.21, 0.34);

vec3 hsl2rgb(vec3 c) {
    vec3 rgb = clamp(abs(mod(c.x*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0, 0.0, 1.0);
    return c.z + c.y * (rgb-0.5)*(1.0-abs(2.0*c.z-1.0));
}

float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy) );
    vec2 x0 = v -   i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m ;
    m = m*m ;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
}

void main() {
    vec2 st = gl_FragCoord.xy / uResolution.xy;
    st.x *= uResolution.x / uResolution.y;

    float speed = mix(0.1, 0.03, uAppState);
    float t = uTime * speed;

    float n1 = snoise(st * 1.5 + t);
    float n2 = snoise(st * 2.0 - t * 1.5 + n1);
    vec2 warpedSt = st + vec2(n1, n2) * 0.5;

    float d1 = length(warpedSt - vec2(0.2, 0.8));
    float d2 = length(warpedSt - vec2(0.8, 0.2));
    float d3 = length(warpedSt - vec2(0.5, 0.5));

    vec3 baseColor = mix(colorA, colorB, smoothstep(0.0, 1.2, d1));
    baseColor = mix(baseColor, colorC, smoothstep(0.2, 1.5, d3));
    baseColor = mix(baseColor, colorE, smoothstep(0.4, 2.0, d2));

    float cyanPop = snoise(st * 3.0 + t * 0.5);
    baseColor = mix(baseColor, colorD, smoothstep(0.5, 1.0, cyanPop) * 0.4);

    float hue = fract(t * 0.08 + n1 * 0.15 + d3 * 0.1);
    vec3 rainbow = hsl2rgb(vec3(hue, 0.45, 0.65));
    vec3 color = mix(baseColor, rainbow, 0.6 + n2 * 0.3);

    // 블러는 안 건다 — 셰이더가 이미 뭉개진 그라디언트다. 밝기만 눌러 본문을 살린다
    vec3 darkAppColor = baseColor * 0.34;
    float lum = dot(darkAppColor, vec3(0.299, 0.587, 0.114));
    darkAppColor = mix(darkAppColor, vec3(lum), 0.25);

    vec3 finalColor = mix(color, darkAppColor, uAppState);

    /*
     * 그레인도 색과 **같은 비율로** 어두워져야 한다.
     * 절대량을 고정하면 앱 화면(baseColor × 0.25)에서 상대적으로 4배 거칠어진다 —
     * 같은 값인데 눈에는 다른 질감으로 보인다
     */
    /*
     * 색이 어두워진 만큼(×0.25) 그대로 줄이면 앱 화면에서 그레인이 거의 안 보인다.
     * 절대 고정(0.06)은 반대로 4배 거칠어 보였다 — 둘 사이로 잡은 값이다
     */
    float grain = random(gl_FragCoord.xy * 0.05 + floor(uTime * 15.0) * 0.001);
    finalColor += (grain - 0.5) * mix(0.06, 0.042, uAppState);

    gl_FragColor = vec4(finalColor, 1.0);
}
`;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("shader compile:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function buildProgram(gl: WebGLRenderingContext) {
  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  if (!vs || !fs) return null;

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("program link:", gl.getProgramInfoLog(program));
    return null;
  }
  return program;
}
