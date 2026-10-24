/**
 * 시스템 화면 (`/api/system`, `/api/system/settings`).
 *
 * 인가가 없다 — 한 설치 = 한 사람이라 막을 상대가 없다. 로컬이든 클라우드든 내 사용량은 내가 본다.
 */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../http/env";
import { readBody } from "../../http/body";
import { zText } from "../../common/schemas";
import { InvalidInput } from "../../common/errors";
import { fileStorage } from "../../common/storage";
import { allSettings, GUARD_MONTHLY_CHARS, grouped, igdbCredentials, parseJavaLong, putSetting, SETTING, systemStatus, translateApiKey, translationUsage } from "./service";
import { testIgdb, testTranslate } from "./testers";
import { javaStrip } from "../../common/text";

const optStr = zText.nullish().transform((v) => v ?? null);

/** ⚠️ 필수 검증이 없다 — null이면 아래 `strip()`에서 500 (알려진 버그 7, `docs/v2-plan.md`) */
const IgdbRequest = z.object({ clientId: optStr, clientSecret: optStr });
const TranslateKeyRequest = z.object({ apiKey: optStr });
const DailyLimitRequest = z.object({ dailyChars: optStr });

/** 앞뒤 공백 제거. null이면 평범한 예외(→ 500, 전역 핸들러가 모르는 예외) */
function strip(v: string | null): string {
  if (v === null) throw new TypeError("Cannot invoke \"String.strip()\" because value is null");
  return javaStrip(v);
}

export const routes = new Hono<AppEnv>();

routes.get("/api/system", async (c) => c.json(await systemStatus()));

/**
 * 스토리지가 **실제로 되는지** — `/api/system`의 `configured`는 값이 채워졌나라 비밀번호를 틀려도 true였다
 */
routes.get("/api/system/storage/check", async (c) => {
  const failure = await fileStorage().checkAccess();
  return c.json({ ok: failure === null, message: failure ?? "버킷에 접근했습니다" });
});

routes.get("/api/system/settings", async (c) => {
  const igdb = await igdbCredentials();
  const stored = (await allSettings()).has(SETTING.IGDB_CLIENT_ID);
  const used = await translationUsage();
  return c.json({
    igdbClientId: igdb.clientId,
    igdbClientSecret: igdb.clientSecret,   // 시크릿을 그대로 준다 — 혼자 쓰는 앱이고, 진짜 문제는 오타 확인이다
    fromBootConfig: !stored,
    translateApiKey: await translateApiKey(),
    translation: used,
  });
});

/** ⚠️ 하나씩 따로 커밋된다 — 시크릿이 null이면 ID는 이미 저장된 뒤 500이다 (알려진 버그 7, `docs/v2-plan.md`) */
routes.put("/api/system/settings/igdb", async (c) => {
  const r = await readBody(c, IgdbRequest);
  await putSetting(SETTING.IGDB_CLIENT_ID, strip(r.clientId));
  await putSetting(SETTING.IGDB_CLIENT_SECRET, strip(r.clientSecret));
  return c.body(null, 200);
});

/** 하루 할당량. 빈 값이면 **지운다**("설정 안 함"도 유효한 상태다) */
routes.put("/api/system/settings/translate/daily-limit", async (c) => {
  const r = await readBody(c, DailyLimitRequest);
  const raw = r.dailyChars === null ? "" : strip(r.dailyChars);
  if (raw === "") {
    await putSetting(SETTING.TRANSLATE_DAILY_CHARS, "");
    return c.body(null, 200);
  }
  const value = parseJavaLong(raw);
  if (value === null) throw new InvalidInput("하루 할당량은 숫자여야 합니다");
  // 음수면 게이지가 뒤집히고, 월 한도보다 큰 하루 한도는 하루에 다 쓸 수 있다는 뜻이 되어 앞뒤가 안 맞는다
  if (value <= 0) throw new InvalidInput("하루 할당량은 0보다 커야 합니다");
  if (value > GUARD_MONTHLY_CHARS) throw new InvalidInput(`하루 할당량은 월 한도(${grouped(GUARD_MONTHLY_CHARS)}자)를 넘을 수 없습니다`);
  await putSetting(SETTING.TRANSLATE_DAILY_CHARS, String(value));
  return c.body(null, 200);
});

/** 번역 키 저장. 테스트 버튼 대신 아래 `languages` 확인을 쓴다 (번역은 시험도 돈이다) */
routes.put("/api/system/settings/translate", async (c) => {
  const r = await readBody(c, TranslateKeyRequest);
  await putSetting(SETTING.TRANSLATE_API_KEY, strip(r.apiKey));
  return c.body(null, 200);
});

routes.post("/api/system/settings/translate/test", async (c) => {
  const r = await readBody(c, TranslateKeyRequest);
  return c.json(await testTranslate(r.apiKey));
});

routes.post("/api/system/settings/igdb/test", async (c) => {
  const r = await readBody(c, IgdbRequest);
  return c.json(await testIgdb(r.clientId, r.clientSecret));
});

