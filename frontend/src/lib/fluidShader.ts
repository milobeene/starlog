/**
 * 유체 배경 셰이더 — **전역 배경과 설정 미리보기가 같은 소스를 쓴다.**
 *
 * 미리보기를 CSS 그라디언트로 흉내 내면 저장한 뒤 다른 그림이 나온다.
 * 같은 셰이더를 두 캔버스에 돌리는 게 유일하게 정직한 방법이다.
 *
 * 색 다섯 개는 uniform으로 들어온다 (예전엔 GLSL 상수라 바꿀 수 없었다).
 */

export const VERTEX_SHADER = `
attribute vec4 aVertexPosition;
varying vec2 vUv;
void main() {
    gl_Position = aVertexPosition;
    vUv = aVertexPosition.xy * 0.5 + 0.5;
}
`;

export const FRAGMENT_SHADER = `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform vec2 uResolution;
uniform float uAppState;
/*
 * 미리보기 전용 — 0 이상이면 그 x 지점(0~1)부터 오른쪽을 **앱 내부 색감**으로 그린다.
 * 음수면 화면 전체가 uAppState를 따른다 (실제 배경).
 *
 * **색만 가른다. 흐름 속도는 안 가른다** — 속도까지 갈랐다면 두 반쪽의 무늬가
 * 서로 다른 시각을 흘러 가운데에 이음매가 생긴다
 */
uniform float uSplit;

/*
 * 팔레트 — **한강 노을** (2026-08-26). 사진 한 장에서 뽑았다.
 *
 * 원본의 역할 구조를 그대로 쓴다: 기조 → 밝은 대비 → 옅은 색 → 중간 강조 → 어두운 바닥.
 * 사진의 구성이 마침 이 구조와 맞았다 — 앰버가 화면을 덮고, 회청색 구름이 유일한 차가움이고,
 * 잔디가 중간을 받치고, 실루엣이 바닥을 잡는다.
 *
 *   HEX       색상   채도  명도  지각밝기   역할
 *   #E8975A    26°   76%   63%   168     A 노을 앰버 — 지배색
 *   #F7D6A0    37°   84%   80%   218     B 해 근처의 밝은 하늘
 *   #9BAAB8   209°   17%   66%   167     C 회청색 구름 — 유일한 차가움
 *   #7A9448    81°   35%   43%   132     D 잔디 초록
 *   #1E262B   203°   18%   14%    36     E 다리·물 실루엣
 *
 *   A와 C는 HSL 명도가 63%/66%로 비슷한데 지각 밝기도 168/167로 나란하다 —
 *   색상만 반대편(26° vs 209°)이라 **밝기 차이 없이 색으로만 갈리는** 대비가 된다
 *
 * ── 검토했다 안 쓴 안 (되돌릴 때 참고)
 *   ③ 숲과 노을   #1E6349 #D98E5E #C4DCC0 #35876A #0B1A14
 *   ① 이끼와 황동 #216B53 #C9A961 #9FCDBB #2E8F79 #0C1F1A
 *   ② 심해       #1A5F4A #7FB8C4 #A6D5D2 #1F7A73 #06171A
 *   한 톤 초록    #689E5F #65C556 #57EF40 #5A7056 #293827
 *                색상 111~114°로 고정. 무지개를 초록에 가둬야 성립하는데 그러면 화면이 죽는다
 *   에메랄드     #216B53 #D4C486 #AFDECD #2D9E87 #0F2822
 *   원본        #E85B05 #E8C46B #A8D8DB #289E8E #1C3556
 */
// 상수가 아니라 uniform이다 — 회원이 고른 색이 여기로 들어온다.
// 기본값(한강 노을)은 lib/palette.ts의 DEFAULT_PALETTE에 있다
uniform vec3 colorA;
uniform vec3 colorB;
uniform vec3 colorC;
uniform vec3 colorD;
uniform vec3 colorE;

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

    /*
     * 흐름 속도. 입구 0.1, 앱 내부는 더 느리다 — 본문이 읽혀야 하므로.
     * 0.03(3.3배 느림)은 앱 안에서 배경이 거의 멈춰 보였다. 0.067이면 1.5배만 느리다
     */
    float speed = mix(0.1, 0.067, uAppState);
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

    // 흐름(speed)은 위에서 uAppState를 그대로 썼다. 여기서부터가 갈리는 지점이다
    float appColor = uSplit < 0.0 ? uAppState : step(uSplit, vUv.x);

    vec3 finalColor = mix(color, darkAppColor, appColor);

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
    finalColor += (grain - 0.5) * mix(0.06, 0.042, appColor);

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

export function buildProgram(gl: WebGLRenderingContext) {
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
