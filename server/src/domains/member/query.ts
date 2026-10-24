/**
 * 화면 4(프로필·설정)와 편집 폼 선택지.
 *
 * 여러 도메인을 가로질러 읽는다 (API 설계서 §0의 "화면 단위 조회 전용 서비스").
 * 선택지 다섯 종은 platform 도메인의 `findSelectable`을 그대로 쓴다 — 정렬까지 그쪽이 맞춰 뒀다.
 */
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../../db/client";
import { member, subscription } from "../../db/schema";
import { InvalidInput } from "../../common/errors";
import { normalize } from "../../common/text";
import {
  accountFindSelectable, deviceFindSelectable, deviceOptionLabel, emulatorFindSelectable,
  inputMethodFindSelectable, platformFindSelectable,
} from "../platform/service";
import { findGenreDictionary, findTagDictionary } from "../tag/service";
import { saveIfChanged } from "../../db/changes";
import { moneyJson } from "../../common/json";
import { findProfile, type ProfileRow } from "./profile";

/** 구독은 물리 삭제라 소프트 삭제 조건이 없다. 같은 시작일끼리는 2차 정렬이 없다 (기존 응답 순서 그대로) */
export function subscriptionsOf(d: Db) {
  return d.select().from(subscription).orderBy(desc(subscription.startedOn));
}

/** **null이면 빈 목록이 아니라 null** — "기본값을 따른다"와 "다섯 칸이 비었다"는 다른 뜻이다 */
export const colorsOf = (colors: string | null) => (colors === null ? null : javaSplit(colors, ","));

/** 끝의 빈 조각을 버리는 split — 기존 응답과 같은 모양 */
function javaSplit(s: string, sep: string): string[] {
  const parts = s.split(sep);
  while (parts.length > 1 && parts[parts.length - 1] === "") parts.pop();
  return parts.length === 1 && parts[0] === "" && s !== "" ? [] : parts;
}

/** 저장된 프리셋. 없으면 빈 목록 — 색 다섯 칸과 달리 "안 고름"을 따로 뜻하지 않는다 */
export function presetsOf(json: string | null): BackgroundPreset[] {
  if (json === null) return [];
  try {
    return JSON.parse(json) as BackgroundPreset[];
  } catch {
    // 이 칸은 아래 검증을 거친 값만 들어간다. 깨졌으면 프로필 전체를 죽이지 않고 비운 셈 친다
    console.warn("배경 프리셋 JSON이 깨졌습니다 — 빈 목록으로 읽습니다");
    return [];
  }
}

/**
 * `GET /api/me`. 로그인 시절의 칸(memberId·email·googleLinked·hasPassword·role)은 V14와 함께 뺐다 —
 * 화면이 하나도 안 읽었다
 */
export async function findMe(d: Db) {
  const m = await findProfile(d);
  const ref = (r: { id: number; name: string } | null) => (r === null ? null : { id: r.id, name: r.name });
  return {
    profile: {
      nickname: m.nickname,
      memo: m.memo,
      backgroundColors: colorsOf(m.backgroundColors),
      backgroundPresets: presetsOf(m.backgroundPresets),
    },
    platforms: (await platformFindSelectable(d)).map((p) => ({ platformId: p.id, name: p.name })),
    // 소속은 둘 중 하나만 채워진다 — 편집 화면이 토글의 초기값을 여기서 정한다
    platformAccounts: (await accountFindSelectable(d)).map((a) => ({
      accountId: a.id, label: a.accountLabel, platform: ref(a.platform), emulator: ref(a.emulator),
    })),
    devices: (await deviceFindSelectable(d)).map((x) => ({
      deviceId: x.id, deviceType: x.deviceType, label: x.label, memo: x.memo,
    })),
    emulators: (await emulatorFindSelectable(d)).map((e) => ({ emulatorId: e.id, name: e.name, memo: e.memo })),
    inputMethods: (await inputMethodFindSelectable(d)).map((i) => ({ inputMethodId: i.id, name: i.name })),
    subscriptions: (await subscriptionsOf(d)).map((s) => ({
      subscriptionId: s.id,
      serviceName: s.serviceName,
      startedOn: s.startedOn,
      endedOn: s.endedOn,
      fee: moneyJson(s.feeAmount, s.feeCurrency),
      billingCycle: s.billingCycle,
      active: s.endedOn === null,
    })),
  };
}

/**
 * `GET /api/me/options`. 태그·장르 사전은 살아있는 항목에 붙은 것만 (§6.7 자동 소멸)
 */
export async function findOptions(d: Db) {
  return {
    platforms: (await platformFindSelectable(d)).map((p) => ({ id: p.id, name: p.name })),
    // 기기만 이름을 합성한다 — 라벨("거실 스위치")만으로는 어떤 기종인지 모른다
    devices: (await deviceFindSelectable(d)).map((x) => ({ id: x.id, name: deviceOptionLabel(x) })),
    emulators: (await emulatorFindSelectable(d)).map((e) => ({ id: e.id, name: e.name })),
    inputMethods: (await inputMethodFindSelectable(d)).map((i) => ({ id: i.id, name: i.name })),
    platformAccounts: (await accountFindSelectable(d)).map((a) => ({
      id: a.id,
      name: a.accountLabel,
      platformId: a.platform?.id ?? null,
      platformName: a.platform?.name ?? null,
      emulatorId: a.emulator?.id ?? null,
      emulatorName: a.emulator?.name ?? null,
    })),
    subscriptions: (await subscriptionsOf(d)).map((s) => ({ id: s.id, name: s.serviceName })),
    tagDictionary: (await findTagDictionary(d)).map((t) => t.name),
    genreDictionary: (await findGenreDictionary(d)).map((g) => g.name),
  };
}

// ───────────── 프로필 ─────────────

/** `#RRGGBB` ×5, 쉼표 구분. 대소문자는 받아서 대문자로 통일한다 */
export const PALETTE = /^(#[0-9a-fA-F]{6})(,#[0-9a-fA-F]{6}){4}$/;

/** 라우트의 패턴 검사와 별개로 한 번 더 검증한다 — 가져오기도 이 경로를 탄다 (이 값은 그대로 셰이더 uniform이 된다) */
export function profileValues(nickname: string | null, memo: string | null, colors: string | null) {
  const n = normalize(nickname);
  if (n === null) throw new InvalidInput("닉네임은 비울 수 없습니다");
  const memoValue = normalize(memo);
  const c = normalize(colors);
  if (c !== null && !PALETTE.test(c)) throw new InvalidInput("배경 색은 #rrggbb 다섯 개를 쉼표로 이어 주세요");
  return { nickname: n, memo: memoValue, backgroundColors: c === null ? null : c.toUpperCase() };
}

// ───────────── 배경 프리셋 ─────────────

export const MAX_PRESETS = 12;
const HEX = /^#[0-9a-fA-F]{6}$/;
const INVALID_PRESETS = "배경 프리셋 형식이 올바르지 않습니다";

/** 이름은 앞뒤 공백을 걷고 1~30자, 색은 `#rrggbb` 다섯 개(대문자로 통일). 셰이더 uniform이 되는 값이라 서버가 다시 본다 */
const BackgroundPresets = z.array(z.object({
  name: z.string({ error: INVALID_PRESETS }).transform((v) => normalize(v))
    .refine((v): v is string => v !== null && v.length <= 30, "프리셋 이름은 1~30자여야 합니다"),
  colors: z.array(z.string({ error: INVALID_PRESETS }).regex(HEX, "프리셋 색은 #rrggbb 다섯 개여야 합니다"), { error: INVALID_PRESETS })
    .length(5, "프리셋 색은 #rrggbb 다섯 개여야 합니다")
    .transform((cs) => cs.map((x) => x.toUpperCase())),
}, { error: INVALID_PRESETS }), { error: INVALID_PRESETS }).max(MAX_PRESETS, `배경 프리셋은 ${MAX_PRESETS}개까지입니다`);

export type BackgroundPreset = z.output<typeof BackgroundPresets>[number];

/** 저장할 칸 값. 빈 목록은 null("없음") */
export function presetsValue(raw: unknown): string | null {
  const r = BackgroundPresets.safeParse(raw);
  if (!r.success) throw new InvalidInput(r.error.issues[0]?.message ?? INVALID_PRESETS);
  return r.data.length ? JSON.stringify(r.data) : null;
}

type ProfilePatch = ReturnType<typeof profileValues> & { backgroundPresets?: string | null };

/** 값이 실제로 바뀐 때만 UPDATE (변경 감지 — 같은 값이면 `updated_at`도 그대로) */
export async function saveProfile(d: Db, m: ProfileRow, v: ProfilePatch) {
  await saveIfChanged(d, m, v, (patch) => d.update(member).set(patch).where(eq(member.id, m.id)));
}

/**
 * 닉네임·메모·색은 통째로 갈아 넣는다(기존 동작). **프리셋은 왔을 때만** — 닉네임 편집 같은
 * 다른 화면이 프리셋을 모른 채 저장해도 지워지지 않게. 비우려면 빈 목록을 보낸다
 */
export async function updateProfile(d: Db, nickname: string | null, memo: string | null, colors: string | null,
                                    presets: unknown) {
  const v: ProfilePatch = profileValues(nickname, memo, colors);
  if (presets !== undefined && presets !== null) v.backgroundPresets = presetsValue(presets);
  await saveProfile(d, await findProfile(d), v);
}
