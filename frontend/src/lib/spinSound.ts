"use client";

/**
 * 헤더 심볼 장난감의 소리 (2026-08-29).
 *
 * ## 파일이 없다
 *
 * 전부 Web Audio로 그때그때 만든다. **회전 속도에 주파수를 실시간으로 물려야 해서**
 * 녹음 파일로는 애초에 안 된다 — 빨라지면 올라가고 느려지면 내려가는 소리다.
 * 덤으로 앱 용량이 0바이트 늘어난다.
 *
 * ## 왜 톱니파인가
 *
 * 사인파는 배음이 없어 "삐-" 하는 신호음이 된다. 자동차가 지나갈 때의 느낌은
 * 배음이 겹쳐 나오는 소리라 톱니파가 맞다. 대신 그대로 두면 귀에 거슬려서
 * 로우패스를 걸고 **속도에 따라 필터를 연다** — 느릴 땐 먹먹하고 빠를 땐 트인다.
 *
 * ## AudioContext는 첫 클릭 때 만든다
 *
 * 브라우저의 자동재생 정책 때문이다. 사용자 제스처 없이 만들면 `suspended`로 태어나
 * 첫 소리가 안 난다.
 */

/*
 * ⚠️ **최고점을 낮게 잡는다** (2026-08-29, 사용자 피드백).
 *
 * 처음엔 900Hz까지 올렸는데 날카로워서 장난감이 아니라 경고음으로 들렸다.
 * 320Hz면 사람 목소리 아래라 배경에 깔린다 — 회전이 빨라지는 느낌은
 * 절대 음높이가 아니라 **올라간다는 사실**에서 오므로 범위를 좁혀도 살아 있다.
 */
const MIN_HZ = 50;
const MAX_HZ = 320;
/** 최고 음량. 헤더의 장난감이라 존재감이 크면 안 된다 */
const PEAK_GAIN = 0.028;

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  // 탭을 옮겼다 오면 suspended로 있을 수 있다
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

type Spin = { osc: OscillatorNode; filter: BiquadFilterNode; gain: GainNode };
let spin: Spin | null = null;

/** 회전 시작. 이미 돌고 있으면 아무 일도 안 한다 */
export function startSpin() {
  const c = audio();
  if (!c || spin) return;

  const osc = c.createOscillator();
  /*
   * 톱니 → **삼각파**로 바꿨다 (2026-08-29). 톱니는 배음이 1/n으로 천천히 줄어 거칠고,
   * 삼각은 1/n²으로 빨리 줄어 부드럽다. 그래도 사인처럼 밋밋하지는 않아
   * "돌아가는 것"의 질감은 남는다
   */
  osc.type = "triangle";
  osc.frequency.value = MIN_HZ;

  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 260;
  // Q를 1 아래로 둔다 — 올리면 차단 주파수 근처가 솟아 '삐' 하는 봉우리가 생긴다
  filter.Q.value = 0.6;

  const gain = c.createGain();
  gain.gain.value = 0;

  osc.connect(filter).connect(gain).connect(c.destination);
  osc.start();
  spin = { osc, filter, gain };
}

/**
 * 지금 각속도를 알려준다 (deg/s). 화면이 매 프레임 부른다.
 *
 * ⚠️ **`setValueAtTime`이 아니라 짧은 램프**를 쓴다. 프레임마다 값을 툭툭 놓으면
 * 파형이 끊겨 지직거린다 — 사람 귀에는 그게 "고장난 소리"로 들린다
 */
export function setSpinSpeed(degPerSec: number, maxDegPerSec: number) {
  if (!spin || !ctx) return;
  const t = ctx.currentTime;
  const ratio = Math.max(0, Math.min(1, degPerSec / maxDegPerSec));

  // 주파수는 지수로 올린다 — 사람 귀는 비율로 듣는다(옥타브). 선형이면 저음에서만 확 변한다
  const hz = MIN_HZ * (MAX_HZ / MIN_HZ) ** ratio;
  // 램프를 0.03 → 0.06초로 늘렸다. 짧으면 프레임마다 값이 튀어 '지글'거린다
  spin.osc.frequency.linearRampToValueAtTime(hz, t + 0.06);
  spin.filter.frequency.linearRampToValueAtTime(240 + ratio * 900, t + 0.06);
  // 아주 느릴 땐 아예 안 들리게 — 멈추기 직전의 웅웅거림이 지저분하다
  spin.gain.gain.linearRampToValueAtTime(PEAK_GAIN * ratio ** 1.4, t + 0.06);
}

/** 회전 끝. 남은 소리를 짧게 재우고 정리한다 */
export function stopSpin() {
  if (!spin || !ctx) return;
  const { osc, gain } = spin;
  spin = null;
  const t = ctx.currentTime;
  gain.gain.cancelScheduledValues(t);
  gain.gain.setValueAtTime(gain.gain.value, t);
  gain.gain.linearRampToValueAtTime(0, t + 0.08);
  osc.stop(t + 0.12);
}

/**
 * 터질 때 — 폭죽.
 *
 * 세 겹이다. 하나만 쓰면 폭죽이 안 된다:
 *   ① 팡    저역 사인이 90 → 35Hz로 떨어진다. 가슴에 오는 부분
 *   ② 치이익 화이트노이즈를 밴드패스로 훑어 내린다. 흩어지는 부분
 *   ③ 반짝임 짧은 고음 여러 개를 흩뿌린다. 축포의 "기분 좋음"은 여기서 나온다
 */
export function playBurst() {
  const c = audio();
  if (!c) return;
  const t = c.currentTime;

  // ① 팡
  const thump = c.createOscillator();
  thump.type = "sine";
  thump.frequency.setValueAtTime(90, t);
  thump.frequency.exponentialRampToValueAtTime(35, t + 0.25);
  const thumpGain = c.createGain();
  thumpGain.gain.setValueAtTime(0.32, t);
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  thump.connect(thumpGain).connect(c.destination);
  thump.start(t);
  thump.stop(t + 0.32);

  // ② 치이익 — 1초짜리 노이즈 버퍼를 만들어 밴드패스를 쓸어내린다
  const frames = Math.floor(c.sampleRate * 0.9);
  const buffer = c.createBuffer(1, frames, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  const noise = c.createBufferSource();
  noise.buffer = buffer;
  const band = c.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = 1.2;
  band.frequency.setValueAtTime(2600, t + 0.02);
  band.frequency.exponentialRampToValueAtTime(220, t + 0.8);
  const noiseGain = c.createGain();
  noiseGain.gain.setValueAtTime(0, t);
  noiseGain.gain.linearRampToValueAtTime(0.16, t + 0.03);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
  noise.connect(band).connect(noiseGain).connect(c.destination);
  noise.start(t);

  // ③ 반짝임
  const sparks = 9;
  for (let i = 0; i < sparks; i++) {
    const at = t + 0.04 + Math.random() * 0.38;
    const osc = c.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(1100 + Math.random() * 1900, at);
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.05, at + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
    osc.connect(gain).connect(c.destination);
    osc.start(at);
    osc.stop(at + 0.1);
  }
}
