/**
 * 회차·취득이 붙이는 선택지 조회 — platform 도메인의 `findOne` 다섯 개(삭제된 것도 돌려준다).
 * 그 기기로 했던 과거 회차를 고칠 수 있어야 하기 때문이다
 */
import type { PlatformAccountRow } from "../platform/service";
export {
  deviceFindOne as findDevice,
  platformFindOne as findPlatform,
  accountFindOne as findAccount,
  emulatorFindOne as findEmulator,
  inputMethodFindOne as findInputMethod,
} from "../platform/service";

/**
 * 계정이 그 소속(플랫폼 또는 에뮬레이터)의 것인지. **종류와 id를 함께** 본다 —
 * 테이블이 달라 플랫폼 3과 에뮬레이터 3이 둘 다 있을 수 있다 (고친 버그 14, `docs/v2-plan.md`).
 * 플랫폼이 오면 플랫폼으로만 본다 (부르는 쪽이 둘 다 오면 에뮬을 버린다)
 */
export function belongsTo(account: PlatformAccountRow, platformId: number | null, emulatorId: number | null) {
  if (platformId !== null) return account.platformId === platformId;
  if (emulatorId !== null) return account.emulatorId === emulatorId;
  return account.platformId === null && account.emulatorId === null;
}
