/**
 * 태그·장르 서비스 중 **백로그가 부르는 부분**.
 * (사전 관리 — 이름·색·순서·삭제 — 는 `routes.ts`)
 *
 * 백로그 도메인을 import하지 않으려고 항목 확인을 여기 로컬로 둔다.
 */
import { asc, eq, getTableColumns, inArray, isNull } from "drizzle-orm";
import type { Db } from "../../db/client";
import { backlogEntry, backlogEntryGenre, genre, tag } from "../../db/schema";
import { Conflict, NotFound } from "../../common/errors";
import { nowKst } from "../../common/clock";
import { normalize } from "../../common/text";

export type TagRow = typeof tag.$inferSelect;
export type GenreRow = typeof genre.$inferSelect;

/** 살아있는 항목만 */
async function findAliveEntry(d: Db, entryId: number) {
  const [entry] = await d.select().from(backlogEntry).where(eq(backlogEntry.id, entryId));
  if (!entry) throw new NotFound(`백로그 항목을 찾을 수 없습니다. id=${entryId}`);
  if (entry.deletedAt !== null) throw new Conflict(`삭제된 항목입니다. id=${entryId}`);
  return entry;
}

/** find-or-create의 find 쪽. uk_tag_name과 짝이다 */
export async function findTagByName(d: Db, name: string) {
  const [row] = await d.select().from(tag).where(eq(tag.name, name));
  return row;
}

export async function findGenreByName(d: Db, name: string) {
  const [row] = await d.select().from(genre).where(eq(genre.name, name));
  return row;
}

async function tagFindOrCreate(d: Db, name: string): Promise<TagRow> {
  const found = await findTagByName(d, name);
  if (found) return found;
  const now = nowKst();
  // sortOrder 기본값은 0 — 새 태그는 맨 앞에 같은 값으로 들어가고 이름으로 tie-break된다
  const [row] = await d.insert(tag)
    .values({ name, sortOrder: 0, color: null, createdAt: now, updatedAt: now })
    .returning();
  return row!;
}

async function genreFindOrCreate(d: Db, name: string): Promise<GenreRow> {
  const found = await findGenreByName(d, name);
  if (found) return found;
  const now = nowKst();
  const [row] = await d.insert(genre).values({ name, createdAt: now, updatedAt: now }).returning();
  return row!;
}

/**
 * 항목의 태그 교체 (FR-TAG-01). **항목당 하나다** — null·빈 문자열이면 뗀다.
 * 목록에 없는 이름은 여기서 만들어진다. 뗄 때 사전 행은 안 지운다 (조회에서 걸러진다 — §6.7 v1.5)
 */
export async function changeTag(d: Db, entryId: number, name: string | null | undefined) {
  const entry = await findAliveEntry(d, entryId);
  const normalized = normalize(name);
  const next = normalized === null ? null : await tagFindOrCreate(d, normalized);
  // 값이 실제로 바뀐 때만 UPDATE한다 (기존 변경 감지와 같다 — `updated_at`이 안 움직여야 한다)
  if ((next?.id ?? null) !== entry.tagId) {
    await d.update(backlogEntry).set({ tagId: next?.id ?? null, updatedAt: nowKst() }).where(eq(backlogEntry.id, entryId));
  }
}

/** 이 항목에 붙은 태그 이름. 없으면 null */
export async function findTagName(d: Db, entryId: number): Promise<string | null> {
  const entry = await findAliveEntry(d, entryId);
  if (entry.tagId === null) return null;
  const [t] = await d.select({ name: tag.name }).from(tag).where(eq(tag.id, entry.tagId));
  return t?.name ?? null;
}

/** 태그 사전 (자동완성·필터 옵션). 아무 (살아있는) 항목에도 안 붙은 태그는 안 나온다 — 정렬은 sortOrder → 이름 */
export async function findTagDictionary(d: Db): Promise<TagRow[]> {
  return d.selectDistinct(getTableColumns(tag)).from(tag)
    .innerJoin(backlogEntry, eq(backlogEntry.tagId, tag.id))
    .where(isNull(backlogEntry.deletedAt))
    .orderBy(asc(tag.sortOrder), asc(tag.name));
}

/** 장르 사전. 아무 (살아있는) 항목에도 안 붙은 장르는 안 나온다 */
export async function findGenreDictionary(d: Db): Promise<GenreRow[]> {
  return d.selectDistinct(getTableColumns(genre)).from(genre)
    .innerJoin(backlogEntryGenre, eq(backlogEntryGenre.genreId, genre.id))
    .innerJoin(backlogEntry, eq(backlogEntry.id, backlogEntryGenre.backlogEntryId))
    .where(isNull(backlogEntry.deletedAt))
    .orderBy(asc(genre.name));
}

/** 항목의 개인 장르 전체 교체 (FR-TAG-05). 뗄 때는 연결만 지운다 — 사전 행은 조회에서 거른다 */
export async function replaceGenres(d: Db, entryId: number, names: readonly (string | null)[] | null) {
  await findAliveEntry(d, entryId);
  // 입력 순서를 유지하면서 중복을 제거한다
  const wanted = [...new Set((names ?? []).map(normalize).filter((n): n is string => n !== null))];

  const existing = await d.select({ linkId: backlogEntryGenre.id, name: genre.name })
    .from(backlogEntryGenre)
    .innerJoin(genre, eq(genre.id, backlogEntryGenre.genreId))
    .where(eq(backlogEntryGenre.backlogEntryId, entryId))
    .orderBy(asc(backlogEntryGenre.id));

  const drop = existing.filter((l) => !wanted.includes(l.name)).map((l) => l.linkId);
  const current = new Set(existing.map((l) => l.name));

  // INSERT를 DELETE보다 먼저 보낸다 (기존 Hibernate 액션 큐 순서)
  for (const name of wanted.filter((n) => !current.has(n))) {
    const g = await genreFindOrCreate(d, name);
    const now = nowKst();
    await d.insert(backlogEntryGenre).values({ backlogEntryId: entryId, genreId: g.id, createdAt: now, updatedAt: now });
  }
  if (drop.length) await d.delete(backlogEntryGenre).where(inArray(backlogEntryGenre.id, drop));
}
