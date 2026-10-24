/**
 * 화면 4(프로필·설정)와 편집 폼 선택지.
 *
 * 여러 도메인을 가로질러 읽는다 (API 설계서 §0의 "화면 단위 조회 전용 서비스").
 * 선택지 다섯 종은 platform 도메인의 `findSelectable`을 그대로 쓴다 — 정렬까지 그쪽이 맞춰 뒀다.
 */
import { desc, eq } from "drizzle-orm";
import type { Db } from "../../db/client";
import { member, subscription } from "../../db/schema";
import { InvalidInput, NotFound } from "../../common/errors";
import { isJavaBlank, normalize } from "../../common/text";
import {
  accountFindSelectable, deviceFindSelectable, deviceOptionLabel, emulatorFindSelectable,
  inputMethodFindSelectable, platformFindSelectable,
} from "../platform/service";
import { findGenreDictionary, findTagDictionary } from "../tag/service";
import { saveIfChanged } from "../../db/changes";
import { moneyJson } from "../../common/json";

export type MemberRow = typeof member.$inferSelect;

export async function findMember(d: Db, memberId: number): Promise<MemberRow> {
  const [row] = await d.select().from(member).where(eq(member.id, memberId));
  if (!row) throw new NotFound(`회원을 찾을 수 없습니다. id=${memberId}`);
  return row;
}

/** 구독은 물리 삭제라 소프트 삭제 조건이 없다. 같은 시작일끼리는 2차 정렬이 없다 (기존 응답 순서 그대로) */
export function subscriptionsOf(d: Db, memberId: number) {
  return d.select().from(subscription).where(eq(subscription.memberId, memberId)).orderBy(desc(subscription.startedOn));
}

/** **null이면 빈 목록이 아니라 null** — "기본값을 따른다"와 "다섯 칸이 비었다"는 다른 뜻이다 */
export const colorsOf = (colors: string | null) => (colors === null ? null : javaSplit(colors, ","));

/** 끝의 빈 조각을 버리는 split — 기존 응답과 같은 모양 */
function javaSplit(s: string, sep: string): string[] {
  const parts = s.split(sep);
  while (parts.length > 1 && parts[parts.length - 1] === "") parts.pop();
  return parts.length === 1 && parts[0] === "" && s !== "" ? [] : parts;
}

/** `GET /api/me` */
export async function findMe(d: Db, memberId: number) {
  const m = await findMember(d, memberId);
  const ref = (r: { id: number; name: string } | null) => (r === null ? null : { id: r.id, name: r.name });
  return {
    profile: {
      memberId: m.id,
      email: m.email,
      nickname: m.nickname,
      memo: m.memo,
      googleLinked: m.googleSubject !== null,
      hasPassword: !isJavaBlank(m.password),
      // 화면이 관리자 메뉴를 보일지 정하는 데만 쓴다 — 방어선이 아니다
      role: m.role,
      backgroundColors: colorsOf(m.backgroundColors),
    },
    platforms: (await platformFindSelectable(d, memberId)).map((p) => ({ platformId: p.id, name: p.name })),
    // 소속은 둘 중 하나만 채워진다 — 편집 화면이 토글의 초기값을 여기서 정한다
    platformAccounts: (await accountFindSelectable(d, memberId)).map((a) => ({
      accountId: a.id, label: a.accountLabel, platform: ref(a.platform), emulator: ref(a.emulator),
    })),
    devices: (await deviceFindSelectable(d, memberId)).map((x) => ({
      deviceId: x.id, deviceType: x.deviceType, label: x.label, memo: x.memo,
    })),
    emulators: (await emulatorFindSelectable(d, memberId)).map((e) => ({ emulatorId: e.id, name: e.name, memo: e.memo })),
    inputMethods: (await inputMethodFindSelectable(d, memberId)).map((i) => ({ inputMethodId: i.id, name: i.name })),
    subscriptions: (await subscriptionsOf(d, memberId)).map((s) => ({
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
 * `GET /api/me/options`. **회원을 확인하지 않는다** (없는 회원이면 404가 아니라 빈 목록).
 * 태그·장르 사전은 살아있는 항목에 붙은 것만 (§6.7 자동 소멸)
 */
export async function findOptions(d: Db, memberId: number) {
  return {
    platforms: (await platformFindSelectable(d, memberId)).map((p) => ({ id: p.id, name: p.name })),
    // 기기만 이름을 합성한다 — 라벨("거실 스위치")만으로는 어떤 기종인지 모른다
    devices: (await deviceFindSelectable(d, memberId)).map((x) => ({ id: x.id, name: deviceOptionLabel(x) })),
    emulators: (await emulatorFindSelectable(d, memberId)).map((e) => ({ id: e.id, name: e.name })),
    inputMethods: (await inputMethodFindSelectable(d, memberId)).map((i) => ({ id: i.id, name: i.name })),
    platformAccounts: (await accountFindSelectable(d, memberId)).map((a) => ({
      id: a.id,
      name: a.accountLabel,
      platformId: a.platform?.id ?? null,
      platformName: a.platform?.name ?? null,
      emulatorId: a.emulator?.id ?? null,
      emulatorName: a.emulator?.name ?? null,
    })),
    subscriptions: (await subscriptionsOf(d, memberId)).map((s) => ({ id: s.id, name: s.serviceName })),
    tagDictionary: (await findTagDictionary(d, memberId)).map((t) => t.name),
    genreDictionary: (await findGenreDictionary(d, memberId)).map((g) => g.name),
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

/** 값이 실제로 바뀐 때만 UPDATE (변경 감지 — 같은 값이면 `updated_at`도 그대로) */
export async function saveProfile(d: Db, m: MemberRow, v: ReturnType<typeof profileValues>) {
  await saveIfChanged(d, m, v, (patch) => d.update(member).set(patch).where(eq(member.id, m.id)));
}

export async function updateProfile(d: Db, memberId: number, nickname: string | null, memo: string | null, colors: string | null) {
  const m = await findMember(d, memberId);
  await saveProfile(d, m, profileValues(nickname, memo, colors));
}
