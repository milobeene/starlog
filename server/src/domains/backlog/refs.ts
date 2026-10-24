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
 * `PlatformAccount.belongsTo` 그대로.
 *
 * ⚠️ 자바 버그를 옮겼다 — 소속 id(플랫폼 **또는** 에뮬레이터)를 물어본 id와 숫자로만 비교한다.
 * 플랫폼 3과 에뮬레이터 3은 다른 것인데 같다고 본다. 테이블이 달라 id가 겹칠 수 있다
 */
export function belongsTo(account: PlatformAccountRow, platformId: number | null, emulatorId: number | null) {
  const ownerId = account.platformId ?? account.emulatorId;
  const askedId = platformId ?? emulatorId ?? null;
  return ownerId === askedId;
}
