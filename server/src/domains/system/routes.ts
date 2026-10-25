/**
 * 시스템 화면 (`/api/system`, `/api/system/settings`).
 *
 * 인가가 없다 — 한 설치 = 한 사람이라 막을 상대가 없다. 로컬이든 클라우드든 내 사용량은 내가 본다.
 */
import { Hono } from "hono";
import { z } from "zod";
import { DEFAULT_MSG, readBody, violations } from "../../http/body";
import { zText } from "../../common/schemas";
import { InvalidInput } from "../../common/errors";
import { fileStorage } from "../../common/storage";
import { allSettings, GUARD_MONTHLY_CHARS, grouped, igdbCredentials, parseJavaLong, putSettings, SETTING, systemStatus, translateApiKey, translationUsage } from "./service";
import { testIgdb, testTranslate } from "./testers";
import { isJavaBlank, javaStrip } from "../../common/text";

const optStr = zText.nullish().transform((v) => v ?? null);

/** 저장 요청은 `@NotNull` 검증을 탄다 (`violations`). 테스트 요청은 빈 값도 받아 안내 문구로 답한다 */
const IgdbRequest = z.object({ clientId: optStr, clientSecret: optStr });
const TranslateKeyRequest = z.object({ apiKey: optStr });
const DailyLimitRequest = z.object({ dailyChars: optStr });

/** 앞뒤 공백 제거. null은 앞에서 검증으로 걸러진다 */
const strip = (v: string | null): string => javaStrip(v!);

const MASK = "••••";

/** 짧은 값은 끝 4자리만으로도 거의 다 드러나서 통째로 가린다. 빈 값은 빈 값 그대로 — "없음"과 "가림"이 구분돼야 한다 */
export function maskSecret(v: string | null): string | null {
  if (v === null || isJavaBlank(v)) return v;
  const t = javaStrip(v);
  return t.length > 8 ? MASK + t.slice(-4) : MASK;
}

/** 가린 값을 손대지 않고 되돌려 보냈으면 저장된 원문을 쓴다 — 가린 글자가 키로 저장되면 안 된다 */
function keepIfMasked(given: string, current: string | null): string {
  return current !== null && !isJavaBlank(current) && javaStrip(given) === maskSecret(current) ? current : given;
}

export const routes = new Hono();

routes.get("/api/system", async (c) => c.json(await systemStatus()));

/**
 * 스토리지가 **실제로 되는지** — `/api/system`의 `configured`는 값이 채워졌나라 비밀번호를 틀려도 true였다
 */
routes.get("/api/system/storage/check", async (c) => {
  const failure = await fileStorage().checkAccess();
  return c.json({ ok: failure === null, message: failure ?? "버킷에 접근했습니다" });
});

/**
 * 비밀 값은 **가려서** 준다 (`••••` + 끝 4자리). 이 응답은 사용량 탭처럼 "키가 있나"만 보는 데서도 읽혀서,
 * 원문이 실릴 이유가 없다 (보안 점검 2026-10-25). 원문은 눈 버튼이 `POST …/reveal`로 따로 받는다
 */
routes.get("/api/system/settings", async (c) => {
  const igdb = await igdbCredentials();
  const stored = (await allSettings()).has(SETTING.IGDB_CLIENT_ID);
  const used = await translationUsage();
  const translateKey = await translateApiKey();
  return c.json({
    igdbClientId: igdb.clientId,
    igdbClientSecret: maskSecret(igdb.clientSecret),
    hasIgdbClientSecret: !isJavaBlank(igdb.clientSecret),
    fromBootConfig: !stored,
    translateApiKey: maskSecret(translateKey),
    hasTranslateApiKey: !isJavaBlank(translateKey),
    translation: used,
  });
});

/**
 * 원문 — 키 칸의 초기값과 눈 버튼용. **오타 확인이 진짜 문제**라 사용자는 여전히 보고 고칠 수 있어야 한다 (결정 63).
 * POST인 이유: GET은 `t=` 쿼리 토큰으로도 열리는 자리라(미디어용) 주소 한 줄로 비밀이 읽히지 않게
 */
routes.post("/api/system/settings/reveal", async (c) => {
  const igdb = await igdbCredentials();
  return c.json({ igdbClientId: igdb.clientId, igdbClientSecret: igdb.clientSecret, translateApiKey: await translateApiKey() });
});

/**
 * 둘을 **한 트랜잭션으로** 저장한다 — 따로 커밋하면 ID만 바뀐 채 남을 수 있다.
 * null은 저장 전에 400 (고친 버그 7, `docs/v2-plan.md`)
 */
routes.put("/api/system/settings/igdb", async (c) => {
  const r = await readBody(c, IgdbRequest);
  violations()
    .notNull("clientId", r.clientId, DEFAULT_MSG.notNull)
    .notNull("clientSecret", r.clientSecret, DEFAULT_MSG.notNull)
    .throwIfAny();
  const secret = keepIfMasked(strip(r.clientSecret), (await igdbCredentials()).clientSecret);
  await putSettings({ [SETTING.IGDB_CLIENT_ID]: strip(r.clientId), [SETTING.IGDB_CLIENT_SECRET]: secret });
  return c.body(null, 200);
});

/** 하루 할당량. 빈 값이면 **지운다**("설정 안 함"도 유효한 상태다) */
routes.put("/api/system/settings/translate/daily-limit", async (c) => {
  const r = await readBody(c, DailyLimitRequest);
  const raw = r.dailyChars === null ? "" : strip(r.dailyChars);
  if (raw === "") {
    await putSettings({ [SETTING.TRANSLATE_DAILY_CHARS]: "" });
    return c.body(null, 200);
  }
  const value = parseJavaLong(raw);
  if (value === null) throw new InvalidInput("하루 할당량은 숫자여야 합니다");
  // 음수면 게이지가 뒤집히고, 월 한도보다 큰 하루 한도는 하루에 다 쓸 수 있다는 뜻이 되어 앞뒤가 안 맞는다
  if (value <= 0) throw new InvalidInput("하루 할당량은 0보다 커야 합니다");
  if (value > GUARD_MONTHLY_CHARS) throw new InvalidInput(`하루 할당량은 월 한도(${grouped(GUARD_MONTHLY_CHARS)}자)를 넘을 수 없습니다`);
  await putSettings({ [SETTING.TRANSLATE_DAILY_CHARS]: String(value) });
  return c.body(null, 200);
});

/** 번역 키 저장. 테스트 버튼 대신 아래 `languages` 확인을 쓴다 (번역은 시험도 돈이다) */
routes.put("/api/system/settings/translate", async (c) => {
  const r = await readBody(c, TranslateKeyRequest);
  violations().notNull("apiKey", r.apiKey, DEFAULT_MSG.notNull).throwIfAny();
  await putSettings({ [SETTING.TRANSLATE_API_KEY]: keepIfMasked(strip(r.apiKey), await translateApiKey()) });
  return c.body(null, 200);
});

routes.post("/api/system/settings/translate/test", async (c) => {
  const r = await readBody(c, TranslateKeyRequest);
  return c.json(await testTranslate(r.apiKey === null ? null : keepIfMasked(r.apiKey, await translateApiKey())));
});

routes.post("/api/system/settings/igdb/test", async (c) => {
  const r = await readBody(c, IgdbRequest);
  const secret = r.clientSecret === null ? null : keepIfMasked(r.clientSecret, (await igdbCredentials()).clientSecret);
  return c.json(await testIgdb(r.clientId, secret));
});

