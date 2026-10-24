/**
 * 회차 (FR-PT-01~07) — 자바 `PlaythroughService` + `Playthrough` 엔티티의 불변식.
 */
import { eq } from "drizzle-orm";
import type { Db } from "../../db/client";
import { playthrough } from "../../db/schema";
import { Conflict, InvalidInput, NotFound } from "../../common/errors";
import { nowKst } from "../../common/clock";
import { normalize } from "../../common/text";
import { acquisitionCount, deriveState, findOwnedForUpdate, playthroughsOf, saveEntryIfChanged, type EntryRow, type PlaythroughRow, type PlaythroughStatus } from "./shared";
import { belongsTo, findAccount, findDevice, findEmulator, findInputMethod, findPlatform } from "./refs";
import { saveIfChanged } from "../../db/changes";

export interface PlaythroughCommand {
  startedOn: string | null;
  finishedOn: string | null;
  status: PlaythroughStatus | null;
  deviceId: number | null;
  platformId: number | null;
  platformAccountId: number | null;
  emulatorId: number | null;
  inputMethodId: number | null;
  label: string | null;
}

/** `Playthrough.apply` — 혼자 판단 가능한 규칙(BR-PT-01·04, 종료일과 상태의 짝) */
function apply(cmd: PlaythroughCommand) {
  const { startedOn, finishedOn, status } = cmd;
  if (startedOn === null) throw new InvalidInput("시작일은 필수입니다");
  if (status === null) throw new InvalidInput("회차 상태는 필수입니다");
  // 당일 완료도 유효 (isBefore)
  if (finishedOn !== null && finishedOn < startedOn) {
    throw new InvalidInput(`종료일은 시작일 이후여야 합니다: ${startedOn} ~ ${finishedOn}`);
  }
  if (status === "PLAYING" && finishedOn !== null) {
    throw new InvalidInput("PLAYING 회차에는 종료일을 둘 수 없습니다. 멈춘 날을 적으려면 PAUSED로 두세요");
  }
  if ((status === "DROPPED" || status === "COMPLETED") && finishedOn === null) {
    throw new InvalidInput(`종료된(${status}) 회차에는 종료일이 필요합니다`);
  }
  return { startedOn, finishedOn, status, label: normalize(cmd.label) };
}

type Span = Pick<PlaythroughRow, "sequenceNo" | "startedOn" | "finishedOn"> & { id: number | null };
const MAX_DATE = "￿";      // LocalDate.MAX — 진행 중 회차는 시작일부터 무한대까지 점유한다
const until = (p: Span) => p.finishedOn ?? MAX_DATE;

/** BR-PT-02 기간 겹침 (닫힌 구간 — 하루라도 닿으면 겹침) */
const overlaps = (a: Span, b: Span) => !(a.startedOn > until(b)) && !(b.startedOn > until(a));

/** 형제를 봐야 하는 검증 둘. 판정 기준은 상태가 아니라 **종료일**이다 */
function validateAgainstSiblings(target: Span, siblings: Span[]) {
  for (const s of siblings) {
    if (target.id !== null && target.id === s.id) continue;
    if (target.finishedOn === null && s.finishedOn === null) {
      throw new Conflict(`진행 중인 회차가 이미 있습니다. ${s.sequenceNo}회차에 종료일을 적어 닫아주세요`);
    }
    if (overlaps(target, s)) throw new Conflict(`회차 기간이 ${s.sequenceNo}회차와 겹칩니다`);
  }
}

/**
 * 참조 조회 — 넷 다 남의 것을 못 붙인다. 순서도 자바와 같다 (기기 → 플랫폼 → 계정 → 에뮬 → 입력).
 * 플랫폼과 에뮬이 둘 다 오면 **에뮬을 버린다** (예외 아님 — 옛 데이터를 고치는 중간 상태라서)
 */
async function resolveReferences(d: Db, ownerId: number, cmd: PlaythroughCommand) {
  const dev = cmd.deviceId === null ? null : await findDevice(d, ownerId, cmd.deviceId);
  const plat = cmd.platformId === null ? null : await findPlatform(d, ownerId, cmd.platformId);
  const account = cmd.platformAccountId === null ? null : await findAccount(d, ownerId, cmd.platformAccountId);
  const emu = cmd.emulatorId === null ? null : await findEmulator(d, ownerId, cmd.emulatorId);
  const input = cmd.inputMethodId === null ? null : await findInputMethod(d, ownerId, cmd.inputMethodId);

  const effective = plat !== null ? null : emu;
  // 소속을 아예 안 골랐으면 통과 — V11 이전에는 계정만 있는 회차가 정상이었다
  if (account !== null && (plat !== null || effective !== null)
      && !belongsTo(account, plat?.id ?? null, effective?.id ?? null)) {
    throw new InvalidInput("계정이 고른 소속의 것이 아닙니다");
  }
  return {
    deviceId: dev?.id ?? null,
    platformId: plat?.id ?? null,
    platformAccountId: account?.id ?? null,
    emulatorId: effective?.id ?? null,
    inputMethodId: input?.id ?? null,
  };
}

async function syncEntry(d: Db, entry: EntryRow, pts: PlaythroughRow[]) {
  const derived = deriveState(pts, (await acquisitionCount(d, entry.id)) > 0);
  await saveEntryIfChanged(d, entry, derived);
}

/** 번호는 최대값 + 1 — 구멍은 메우지 않는다. 최신 판정은 날짜가 한다 */
export async function addPlaythrough(d: Db, memberId: number, entryId: number, cmd: PlaythroughCommand): Promise<number> {
  const entry = await findOwnedForUpdate(d, memberId, entryId);
  const siblings = await playthroughsOf(d, entryId);
  const sequenceNo = siblings.reduce((m, p) => Math.max(m, p.sequenceNo), 0) + 1;

  const v = apply(cmd);
  validateAgainstSiblings({ id: null, sequenceNo, ...v }, siblings);
  const refs = await resolveReferences(d, entry.memberId, cmd);

  const now = nowKst();
  const [row] = await d.insert(playthrough)
    .values({ backlogEntryId: entryId, sequenceNo, ...v, ...refs, createdAt: now, updatedAt: now })
    .returning();
  await syncEntry(d, entry, [...siblings, row!]);
  return row!.id;
}

async function findOwnedPlaythrough(d: Db, memberId: number, playthroughId: number) {
  const [pt] = await d.select().from(playthrough).where(eq(playthrough.id, playthroughId));
  if (!pt) throw new NotFound(`회차를 찾을 수 없습니다. id=${playthroughId}`);
  // 부모의 소유권을 본다. 수정도 형제 검증을 타므로 add와 같은 잠금
  const entry = await findOwnedForUpdate(d, memberId, pt.backlogEntryId);
  return { pt, entry };
}

export async function updatePlaythrough(d: Db, memberId: number, playthroughId: number, cmd: PlaythroughCommand) {
  const { pt, entry } = await findOwnedPlaythrough(d, memberId, playthroughId);
  const v = apply(cmd);
  const siblings = await playthroughsOf(d, entry.id);
  validateAgainstSiblings({ id: pt.id, sequenceNo: pt.sequenceNo, ...v }, siblings);
  const refs = await resolveReferences(d, entry.memberId, cmd);

  const after = { ...v, ...refs };
  await saveIfChanged(d, pt, after, (patch) => d.update(playthrough).set(patch).where(eq(playthrough.id, pt.id)));
  await syncEntry(d, entry, siblings.map((s) => (s.id === pt.id ? { ...s, ...after } : s)));
}

/** 물리 삭제. 항목이 이 회차를 가리키고 있을 수 있어 **항목부터** 고친다 (하이버네이트도 UPDATE가 DELETE보다 먼저) */
export async function deletePlaythrough(d: Db, memberId: number, playthroughId: number) {
  const { pt, entry } = await findOwnedPlaythrough(d, memberId, playthroughId);
  const rest = (await playthroughsOf(d, entry.id)).filter((s) => s.id !== pt.id);
  await syncEntry(d, entry, rest);
  await d.delete(playthrough).where(eq(playthrough.id, pt.id));
}
