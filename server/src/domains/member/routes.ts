/**
 * 내 정보 — 자바 `MeController` (`/api/me`). 프로필·선택지·내보내기·가져오기·덮어쓰기.
 *
 * 가져오기·덮어쓰기 본문은 `readBodyExact`로 읽는다 — Jackson처럼 숫자를 원문 글자 그대로 받아야
 * 평점·금액 오류 메시지가 자바와 같다 (`150.0`은 `150.0`).
 * `@Valid`가 없다 → Bean Validation 단계가 없고, 모양이 틀린 것만 400 "요청 본문을 읽을 수 없습니다".
 */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../http/env";
import { db } from "../../db/client";
import { DEFAULT_MSG, readBody, readBodyExact, violations } from "../../http/body";
import { opt, zText } from "../../common/schemas";
import { todayKst } from "../../common/clock";
import { MemberDump } from "./dump";
import { findMe, findOptions, updateProfile } from "./query";
import { backupFileName, exportData } from "./export";
import { importInto, replace } from "./import";

const ProfileUpdateRequest = z.object({
  nickname: opt(zText),
  memo: opt(zText),
  backgroundColors: opt(zText),
});

/** 빈 문자열을 허용한다 — 화면이 "기본값으로"를 누르면 빈 값이 온다 */
const PALETTE_PATTERN = /|(#[0-9a-fA-F]{6})(,#[0-9a-fA-F]{6}){4}/;

export const routes = new Hono<AppEnv>();

/** 프로필 / 설정 (화면 4) */
routes.get("/api/me", async (c) => c.json(await findMe(db(), c.get("memberId"))));

/**
 * 파일로 떨어지게 `Content-Disposition`을 붙인다 — 브라우저에서 그냥 열리면 몇 MB짜리 JSON이 화면을 채운다.
 * 자격증명은 안 담긴다 (이 파일은 동기화 폴더에 놓일 물건이다)
 */
routes.get("/api/me/export", async (c) => {
  const data = await exportData(db(), c.get("memberId"));
  c.header("Content-Disposition", `attachment; filename="${backupFileName(todayKst())}"`);
  return c.json(data);
});

/** **빈 계정에만 들어간다** — 병합은 409. 복원은 갈아끼우는 것이지 합치는 것이 아니다 */
routes.post("/api/me/import", async (c) => {
  const memberId = c.get("memberId");
  const data = await readBodyExact(c, MemberDump);
  return c.json(await db().transaction((tx) => importInto(tx, memberId, data)));
});

/**
 * **덮어쓰기** — 지금 데이터를 지우고 넣는다. ⚠️ 되돌릴 수 없다.
 * `/import`와 경로를 가른 이유: 쿼리 파라미터 하나로 갈라두면 실수로 붙는 순간 데이터가 사라진다
 */
routes.post("/api/me/replace", async (c) => {
  const memberId = c.get("memberId");
  const data = await readBodyExact(c, MemberDump);
  return c.json(await db().transaction((tx) => replace(tx, memberId, data)));
});

/** 편집 폼 선택지 (화면 2·4 공용) */
routes.get("/api/me/options", async (c) => c.json(await findOptions(db(), c.get("memberId"))));

routes.put("/api/me/profile", async (c) => {
  const memberId = c.get("memberId");
  const r = await readBody(c, ProfileUpdateRequest);
  violations()
    .notBlank("nickname", r.nickname, DEFAULT_MSG.notBlank)
    .size("nickname", r.nickname, 0, 30, DEFAULT_MSG.size(0, 30))
    .size("memo", r.memo, 0, 2000, DEFAULT_MSG.size(0, 2000))
    .pattern("backgroundColors", r.backgroundColors, PALETTE_PATTERN, "배경 색은 #rrggbb 다섯 개를 쉼표로 이어 주세요")
    .throwIfAny();
  await db().transaction((tx) => updateProfile(tx, memberId, r.nickname, r.memo, r.backgroundColors));
  return c.body(null, 200);
});
