/**
 * 태그·장르 서비스 중 **백로그가 부르는 부분** — 자바 `TagService`·`GenreService`.
 * (사전 관리 — 이름·색·순서·삭제 — 는 `routes.ts`)
 *
 * 자바는 `BacklogEntryFinder`를 썼는데, 백로그 도메인을 import하지 않으려고 항목 확인을 여기 로컬로 둔다.
 */
import { and, asc, eq, getTableColumns, inArray, isNull } from "drizzle-orm";
import type { Db } from "../../db/client";
import { backlogEntry, backlogEntryGenre, genre, tag } from "../../db/schema";
import { Conflict, NotFound } from "../../common/errors";
import { nowKst } from "../../common/clock";
import { normalize } from "../../common/text";

export type TagRow = typeof tag.$inferSelect;
export type GenreRow = typeof genre.$inferSelect;

/** `BacklogEntryFinder.findOwned` — 살아있는 내 항목만. 남의 것도 404 (NFR-S7) */
async function findOwnedEntry(d: Db, memberId: number, entryId: number) {
  const [entry] = await d.select().from(backlogEntry).where(eq(backlogEntry.id, entryId));
  if (!entry || entry.memberId !== memberId) throw new NotFound(`백로그 항목을 찾을 수 없습니다. id=${entryId}`);
  if (entry.deletedAt !== null) throw new Conflict(`삭제된 항목입니다. id=${entryId}`);
  return entry;
}

/** find-or-create의 find 쪽. uk_tag_member_name과 짝이다 */
export async function findTagByName(d: Db, memberId: number, name: string) {
  const [row] = await d.select().from(tag).where(and(eq(tag.memberId, memberId), eq(tag.name, name)));
  return row;
}

export async function findGenreByName(d: Db, memberId: number, name: string) {
  const [row] = await d.select().from(genre).where(and(eq(genre.memberId, memberId), eq(genre.name, name)));
  return row;
}

async function tagFindOrCreate(d: Db, memberId: number, name: string): Promise<TagRow> {
  const found = await findTagByName(d, memberId, name);
  if (found) return found;
  const now = nowKst();
  // sortOrder는 자바 엔티티의 int 기본값 0 — 새 태그는 맨 앞에 같은 값으로 들어가고 이름으로 tie-break된다
  const [row] = await d.insert(tag)
    .values({ memberId, name, sortOrder: 0, color: null, createdAt: now, updatedAt: now })
    .returning();
  return row!;
}

async function genreFindOrCreate(d: Db, memberId: number, name: string): Promise<GenreRow> {
  const found = await findGenreByName(d, memberId, name);
  if (found) return found;
  const now = nowKst();
  const [row] = await d.insert(genre).values({ memberId, name, createdAt: now, updatedAt: now }).returning();
  return row!;
}

/**
 * 항목의 태그 교체 (FR-TAG-01). **항목당 하나다** — null·빈 문자열이면 뗀다.
 * 목록에 없는 이름은 여기서 만들어진다. 뗄 때 사전 행은 안 지운다 (조회에서 걸러진다 — §6.7 v1.5)
 */
export async function changeTag(d: Db, memberId: number, entryId: number, name: string | null | undefined) {
  const entry = await findOwnedEntry(d, memberId, entryId);
  const normalized = normalize(name);
  const next = normalized === null ? null : await tagFindOrCreate(d, entry.memberId, normalized);
  // 하이버네이트는 값이 실제로 바뀐 때만 UPDATE한다
  if ((next?.id ?? null) !== entry.tagId) {
    await d.update(backlogEntry).set({ tagId: next?.id ?? null, updatedAt: nowKst() }).where(eq(backlogEntry.id, entryId));
  }
}

/** 이 항목에 붙은 태그 이름. 없으면 null */
export async function findTagName(d: Db, memberId: number, entryId: number): Promise<string | null> {
  const entry = await findOwnedEntry(d, memberId, entryId);
  if (entry.tagId === null) return null;
  const [t] = await d.select({ name: tag.name }).from(tag).where(eq(tag.id, entry.tagId));
  return t?.name ?? null;
}

/** 태그 사전 (자동완성·필터 옵션). 아무 (살아있는) 항목에도 안 붙은 태그는 안 나온다 — 정렬은 sortOrder → 이름 */
export async function findTagDictionary(d: Db, memberId: number): Promise<TagRow[]> {
  return d.selectDistinct(getTableColumns(tag)).from(tag)
    .innerJoin(backlogEntry, eq(backlogEntry.tagId, tag.id))
    .where(and(eq(tag.memberId, memberId), isNull(backlogEntry.deletedAt)))
    .orderBy(asc(tag.sortOrder), asc(tag.name));
}

/** 장르 사전. 아무 (살아있는) 항목에도 안 붙은 장르는 안 나온다 */
export async function findGenreDictionary(d: Db, memberId: number): Promise<GenreRow[]> {
  return d.selectDistinct(getTableColumns(genre)).from(genre)
    .innerJoin(backlogEntryGenre, eq(backlogEntryGenre.genreId, genre.id))
    .innerJoin(backlogEntry, eq(backlogEntry.id, backlogEntryGenre.backlogEntryId))
    .where(and(eq(genre.memberId, memberId), isNull(backlogEntry.deletedAt)))
    .orderBy(asc(genre.name));
}

/** 항목의 개인 장르 전체 교체 (FR-TAG-05). 뗄 때는 연결만 지운다 — 사전 행은 조회에서 거른다 */
export async function replaceGenres(d: Db, memberId: number, entryId: number, names: readonly (string | null)[] | null) {
  const entry = await findOwnedEntry(d, memberId, entryId);
  // 입력 순서를 유지하면서 중복을 제거한다 (LinkedHashSet)
  const wanted = [...new Set((names ?? []).map(normalize).filter((n): n is string => n !== null))];

  const existing = await d.select({ linkId: backlogEntryGenre.id, name: genre.name })
    .from(backlogEntryGenre)
    .innerJoin(genre, eq(genre.id, backlogEntryGenre.genreId))
    .where(eq(backlogEntryGenre.backlogEntryId, entryId))
    .orderBy(asc(backlogEntryGenre.id));

  const drop = existing.filter((l) => !wanted.includes(l.name)).map((l) => l.linkId);
  const current = new Set(existing.map((l) => l.name));

  // 하이버네이트 액션 큐 순서 — INSERT가 DELETE보다 먼저 나간다
  for (const name of wanted.filter((n) => !current.has(n))) {
    const g = await genreFindOrCreate(d, entry.memberId, name);
    const now = nowKst();
    await d.insert(backlogEntryGenre).values({ backlogEntryId: entryId, genreId: g.id, createdAt: now, updatedAt: now });
  }
  if (drop.length) await d.delete(backlogEntryGenre).where(inArray(backlogEntryGenre.id, drop));
}
