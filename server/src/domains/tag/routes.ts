/**
 * 태그·장르 사전 관리 (FR-TAG-02, FR-TAG-05).
 * 태그를 항목에 붙이고 떼는 건 백로그 쪽이고(`service.ts`의 `changeTag`·`replaceGenres`),
 * 여기는 **사전 자체**를 고친다. 둘 다 물리 삭제다 (§7.4).
 */
import { Hono } from "hono";
import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { db, type Tx } from "../../db/client";
import { backlogEntry, backlogEntryGenre, genre, tag } from "../../db/schema";
import { readBody, violations, DEFAULT_MSG } from "../../http/body";
import { pathId } from "../../http/params";
import { Conflict, InvalidInput, NotFound } from "../../common/errors";
import { normalize } from "../../common/text";
import { nowKst } from "../../common/clock";
import { opt, zLong, zText } from "../../common/schemas";

export const routes = new Hono();

const NameRequest = z.object({ name: opt(zText) });

/**
 * 이름: 비면 안 되고 50자 이하.
 * ⚠️ Hibernate Validator의 `@NotBlank`는 `trim()`(U+0020 이하)이 아니라 `Character.isWhitespace` 기준이라
 * 전각 공백(U+3000)만 있어도 걸린다. 그래서 `normalize`로 본다
 */
function checkName(r: z.output<typeof NameRequest>) {
  violations()
    .when(normalize(r.name) === null, "name", DEFAULT_MSG.notBlank)
    .size("name", r.name, 0, 50, DEFAULT_MSG.size(0, 50))
    .throwIfAny();
}

/**
 * 팔레트에 있는 이름만 받는다. 목록은 화면도 같은 것을 쓴다 —
 * 한쪽만 늘리면 저장은 되는데 안 보이는 색이 생긴다
 */
export const PALETTE = [
  "rose", "coral", "amber", "sand", "olive", "sage", "mint", "teal",
  "sky", "denim", "lavender", "plum", "mauve", "clay",
] as const;

// ───────────── 태그 ─────────────

async function findTag(d: Tx, tagId: number) {
  const [row] = await d.select().from(tag).where(eq(tag.id, tagId));
  if (!row) throw new NotFound(`태그를 찾을 수 없습니다. id=${tagId}`);
  return row;
}

/** 순서 바꾸기 (v1.1) — `/{tagId}`보다 앞에 건다 */
const ReorderRequest = z.object({ tagIds: z.array(zLong.nullable()).nullish().transform((v) => v ?? null) });

routes.put("/api/me/tags/order", async (c) => {
  const r = await readBody(c, ReorderRequest);
  violations().notNull("tagIds", r.tagIds, DEFAULT_MSG.notNull).throwIfAny();
  const tagIds = r.tagIds!;
  await db().transaction(async (tx) => {
    const mine = await tx.select().from(tag).orderBy(asc(tag.sortOrder), asc(tag.name));
    const byId = new Map(mine.map((t) => [t.id, t]));

    // 받은 id 순서대로 0부터 다시 매긴다. 없는 태그가 섞이면 거절한다 — 조용히 넘어가면 순서가 어긋난다
    const target = new Map<number, number>();
    let order = 0;
    for (const id of tagIds) {
      const t = id === null ? undefined : byId.get(id);
      if (!t) throw new InvalidInput(`내 태그가 아니거나 이미 없는 태그입니다: ${id}`);
      byId.delete(t.id);
      target.set(t.id, order++);
    }
    // 목록에 없던 것들은 원래 순서를 지키며 뒤로
    for (const left of mine) if (byId.has(left.id)) target.set(left.id, order++);

    // 값이 바뀐 태그만 UPDATE한다 (`updated_at`이 안 움직여야 한다)
    for (const t of mine) {
      const next = target.get(t.id)!;
      if (t.sortOrder !== next) {
        await tx.update(tag).set({ sortOrder: next, updatedAt: nowKst() }).where(eq(tag.id, t.id));
      }
    }
  });
  return c.body(null, 200);
});

/** 색 바꾸기 (v1.2). 팔레트 이름이거나 null(색 없음) */
const ColorRequest = z.object({ color: opt(zText) });

routes.put("/api/me/tags/:tagId/color", async (c) => {
  const tagId = pathId(c, "tagId");
  const r = await readBody(c, ColorRequest);
  await db().transaction(async (tx) => {
    const t = await findTag(tx, tagId);
    const color = normalize(r.color);
    if (color !== null && !(PALETTE as readonly string[]).includes(color)) {
      throw new InvalidInput(`고를 수 없는 색입니다: ${color}`);
    }
    if (t.color !== color) {
      await tx.update(tag).set({ color, updatedAt: nowKst() }).where(eq(tag.id, tagId));
    }
  });
  return c.body(null, 200);
});

routes.put("/api/me/tags/:tagId", async (c) => {
  const tagId = pathId(c, "tagId");
  const r = await readBody(c, NameRequest);
  checkName(r);
  await db().transaction(async (tx) => {
    const t = await findTag(tx, tagId);
    const name = normalize(r.name);
    if (name === null) throw new InvalidInput("태그 이름은 비울 수 없습니다");
    // 같은 이름이 이미 있으면 예외 — 병합하지 않는다. 중복 검사를 변경보다 먼저
    const [other] = await tx.select({ id: tag.id }).from(tag).where(eq(tag.name, name));
    if (other && other.id !== tagId) throw new Conflict(`이미 있는 태그 이름입니다: ${name}`);
    if (t.name !== name) {
      await tx.update(tag).set({ name, updatedAt: nowKst() }).where(eq(tag.id, tagId));
    }
  });
  return c.body(null, 200);
});

routes.delete("/api/me/tags/:tagId", async (c) => {
  const tagId = pathId(c, "tagId");
  await db().transaction(async (tx) => {
    await findTag(tx, tagId);
    // FK가 backlog_entry에 직접 있으므로 붙어 있는 항목부터 뗀다. 소프트 삭제된 항목도 함께 —
    // 남겨두면 FK가 살아 있어 태그를 못 지운다. 벌크라 updatedAt을 직접 쓴다
    await tx.update(backlogEntry).set({ tagId: null, updatedAt: nowKst() }).where(eq(backlogEntry.tagId, tagId));
    await tx.delete(tag).where(eq(tag.id, tagId));
  });
  return c.body(null, 204);
});

// ───────────── 장르 ─────────────

async function findGenre(d: Tx, genreId: number) {
  const [row] = await d.select().from(genre).where(eq(genre.id, genreId));
  if (!row) throw new NotFound(`장르를 찾을 수 없습니다. id=${genreId}`);
  return row;
}

routes.put("/api/me/genres/:genreId", async (c) => {
  const genreId = pathId(c, "genreId");
  const r = await readBody(c, NameRequest);
  checkName(r);
  await db().transaction(async (tx) => {
    const g = await findGenre(tx, genreId);
    const name = normalize(r.name);
    if (name === null) throw new InvalidInput("장르 이름은 비울 수 없습니다");
    const [other] = await tx.select({ id: genre.id }).from(genre).where(eq(genre.name, name));
    if (other && other.id !== genreId) throw new Conflict(`이미 있는 장르 이름입니다: ${name}`);
    if (g.name !== name) {
      await tx.update(genre).set({ name, updatedAt: nowKst() }).where(eq(genre.id, genreId));
    }
  });
  return c.body(null, 200);
});

/** 삭제하면 그 장르를 쓰던 항목은 마스터 장르로 폴백된다 — 연결까지 함께 지운다 */
routes.delete("/api/me/genres/:genreId", async (c) => {
  const genreId = pathId(c, "genreId");
  await db().transaction(async (tx) => {
    await findGenre(tx, genreId);
    await tx.delete(backlogEntryGenre).where(eq(backlogEntryGenre.genreId, genreId));
    await tx.delete(genre).where(eq(genre.id, genreId));
  });
  return c.body(null, 204);
});
