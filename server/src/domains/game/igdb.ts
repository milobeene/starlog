/**
 * IGDB — 자바 `game/client` (`IgdbProperties`·`IgdbTokenProvider`·`HttpIgdbClient`).
 *
 * 바깥 세계의 형태(APIcalypse 본문, snake_case, Unix 타임스탬프, 초 단위 시간)를 여기 가둔다.
 * 밖으로 나가는 건 `CatalogGameSummary`·`CatalogGameDetail`뿐이다.
 *
 *   1. GET이 아니라 **POST** — 쿼리가 본문(APIcalypse)에 들어간다
 *   2. Client-ID + Bearer 토큰. 토큰은 Twitch에서 받고(64일), **401이면 한 번만** 재발급해 다시 시도한다
 *   3. 초당 4회·동시 8건 제한 → 전역 게이트 (간격 260ms + 자리 6개, 800ms 못 잡으면 429)
 */
import { ExternalApi, NotFound, TooManyRequests } from "../../common/errors";
import { scale2 } from "../../common/money";
import { igdbCredentials, igdbCredentialsPresent, recordApiCall, type IgdbCredentials } from "../system/service";
import { isJavaBlank, javaStrip } from "../../common/text";

// ───────────── 설정 (자바 `IgdbProperties` 기본값) ─────────────

export const IGDB = {
  baseUrl: "https://api.igdb.com/v4",
  tokenUrl: "https://id.twitch.tv/oauth2/token",
  /** 자바는 연결 3초 + 읽기 5초였다. fetch엔 둘의 구분이 없어 합으로 끊는다 */
  timeoutMs: 8_000,
  searchLimit: 20,
  /** 만료 이 시간 전부터 미리 갱신 (1일) */
  tokenRenewMarginMs: 24 * 60 * 60 * 1000,
  /** 호출 간 최소 간격. 260ms면 약 3.8회/초 */
  minCallIntervalMs: 260,
  /** 자리를 기다릴 최대 시간. 넘으면 기다리지 않고 429 */
  maxGateWaitMs: 800,
  /** 동시에 열어둘 요청 수 (IGDB 한도 8에서 여유를 두고) */
  maxConcurrent: 6,
} as const;

// ───────────── 포트 DTO ─────────────

export interface CatalogGameSummary { externalId: string; name: string | null; releasedOn: string | null; coverImageId: string | null }

export interface CatalogGameDetail {
  externalId: string;
  name: string | null;
  developers: string[];
  publishers: string[];
  genres: string[];
  releasedOn: string | null;
  coverImageId: string | null;
  bannerImageId: string | null;
  summary: string | null;
  storyline: string | null;
  /** 0~100, scale 2 문자열 (BigDecimal) */
  igdbRating: string | null;
  igdbRatingCount: number | null;
  releasePlatforms: string[];
  mainStoryHours: number | null;
  mainExtraHours: number | null;
  completionistHours: number | null;
  timeToBeatSamples: number | null;
}

// ───────────── HTTP 공통 ─────────────

/** 자바 `RestClientException` 자리 — 4xx·5xx·연결 실패·해석 실패가 전부 이리로 */
export class RestFailure extends Error {
  constructor(readonly status: number | null, message: string, override readonly cause?: unknown) { super(message); }
}

/** 응답 본문 JSON. 빈 본문은 null (자바 `body(type)`도 null) */
export async function restCall(url: string, init: RequestInit, timeoutMs: number | null): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: timeoutMs === null ? undefined : AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    throw new RestFailure(null, "I/O error", e);
  }
  if (res.status >= 400) {
    await res.body?.cancel().catch(() => {});
    throw new RestFailure(res.status, `HTTP ${res.status}`);
  }
  let text: string;
  try { text = await res.text(); } catch (e) { throw new RestFailure(null, "I/O error", e); }
  if (text.trim() === "") return null;
  try { return JSON.parse(text); } catch (e) { throw new RestFailure(null, "응답 해석 실패", e); }
}

// ───────────── 토큰 (자바 `IgdbTokenProvider`) ─────────────

interface CachedToken { value: string; expiresAt: number }
let cached: CachedToken | null = null;
/** 자바 `synchronized issue()` — 동시에 만료를 발견해도 발급은 한 번 */
let issuing: Promise<string> | null = null;

const usable = (t: CachedToken | null, now = Date.now()) => t !== null && now < t.expiresAt - IGDB.tokenRenewMarginMs;

/** 지금 유효한 자격증명. DB가 먼저, 없으면 부팅 설정 — 앱에서 바꾸면 재시작 없이 먹는다 */
export const credentials = (): Promise<IgdbCredentials> => igdbCredentials();

/** 유효한 토큰. 없거나 만료가 임박하면 새로 받는다 */
export async function token(): Promise<string> {
  if (usable(cached)) return cached!.value;
  return issue();
}

/** 401을 받았을 때. 캐시를 버리고 무조건 새로 받는다 */
export async function forceRefresh(): Promise<string> {
  console.log("IGDB 토큰을 강제로 재발급합니다 (401 응답)");
  cached = null;
  return issue();
}

function issue(): Promise<string> {
  // 줄을 선 사이 다른 요청이 이미 받아뒀을 수 있다 (자바의 double-checked)
  const run = async (): Promise<string> => {
    if (usable(cached)) return cached!.value;
    const c = await credentials();
    if (!igdbCredentialsPresent(c)) {
      throw new ExternalApi("GAME_CATALOG", "IGDB 자격증명이 없습니다 (app.igdb.client-id / client-secret)");
    }
    let body: unknown;
    try {
      body = await restCall(tokenUrl(c.clientId!, c.clientSecret!), { method: "POST" }, IGDB.timeoutMs);
    } catch (e) {
      console.error("Twitch 토큰 발급 실패", e);
      throw new ExternalApi("GAME_CATALOG", "게임 정보 서비스 인증에 실패했습니다");
    }
    const r = body as { access_token?: unknown; expires_in?: unknown } | null;
    if (r === null || r.access_token === null || r.access_token === undefined) {
      throw new ExternalApi("GAME_CATALOG", "Twitch 토큰 응답이 비어 있습니다");
    }
    const expiresIn = Number(r.expires_in ?? 0);
    cached = { value: String(r.access_token), expiresAt: Date.now() + expiresIn * 1000 };
    console.log(`IGDB 토큰 발급 완료 — ${Math.floor(expiresIn / 86400)}일 뒤 만료`);
    return cached.value;
  };
  const p = (issuing ?? Promise.resolve("")).catch(() => "").then(run);
  issuing = p;
  return p.finally(() => { if (issuing === p) issuing = null; });
}

/** 자바는 값을 URI 템플릿에 그대로 넣었다(인코딩은 URL에 못 들어가는 글자만) — 같은 결과가 나오게 */
export function tokenUrl(clientId: string, clientSecret: string): string {
  return `${IGDB.tokenUrl}?client_id=${encodeURI(clientId)}&client_secret=${encodeURI(clientSecret)}&grant_type=client_credentials`;
}

// ───────────── 전역 게이트 (자바 `Semaphore(6, fair)` + 간격 잠금) ─────────────

let permits: number = IGDB.maxConcurrent;
const waiters: { grant: () => void }[] = [];
let lastCallAt = 0;
let intervalChain: Promise<void> = Promise.resolve();

/** 공정 모드 — 먼저 온 요청이 먼저 자리를 잡는다. `maxWaitMs` 안에 못 잡으면 false */
function tryAcquire(maxWaitMs: number): Promise<boolean> {
  if (permits > 0 && waiters.length === 0) { permits--; return Promise.resolve(true); }
  if (maxWaitMs <= 0) return Promise.resolve(false);
  return new Promise((resolve) => {
    const w = { grant: () => { clearTimeout(t); resolve(true); } };
    const t = setTimeout(() => { const i = waiters.indexOf(w); if (i >= 0) waiters.splice(i, 1); resolve(false); }, maxWaitMs);
    waiters.push(w);
  });
}

/** 자리를 돌려준다. **성공하든 실패하든 반드시** — 안 돌려주면 자리가 영구히 줄어 결국 전부 429가 된다 */
function releaseGate() {
  const next = waiters.shift();
  if (next) next.grant();
  else permits++;
}

/**
 * 세마포어(동시성)와 간격(처리율)은 다른 것을 막는다 — 둘 다 필요하다.
 * 간격 대기는 자리를 **잡은 채로** 한다. 놓고 기다리면 그 사이 다른 요청이 같은 순간에 나간다
 */
async function throttle(): Promise<void> {
  const acquired = await tryAcquire(IGDB.maxGateWaitMs);
  if (!acquired) throw new TooManyRequests("CATALOG_BUSY", "지금 여러 분이 동시에 검색 중입니다. 바로 다시 시도해 주세요");
  if (IGDB.minCallIntervalMs <= 0) return;
  const turn = intervalChain.then(async () => {
    const wait = lastCallAt + IGDB.minCallIntervalMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCallAt = Date.now();
  });
  intervalChain = turn;
  await turn;
}

// ───────────── 호출 (자바 `HttpIgdbClient.post`·`send`) ─────────────

class Unauthorized extends Error {}

/** 토큰 부착·401 재시도·게이트·예외 변환이 여기 모인다. 재발급 토큰도 거부되면 502로 접는다 */
async function post(endpoint: string, query: string, what: string): Promise<unknown> {
  try {
    return await send(endpoint, query, await token());
  } catch (e) {
    if (!(e instanceof Unauthorized)) throw e;
    console.warn(`IGDB 401 — 토큰을 재발급하고 한 번만 다시 시도합니다. ${what}`);
    try {
      return await send(endpoint, query, await forceRefresh());
    } catch (retry) {
      if (!(retry instanceof Unauthorized)) throw retry;
      console.error(`IGDB 재발급 토큰도 거부됨 — 자격증명을 확인해야 한다. ${what}`);
      throw new ExternalApi("GAME_CATALOG", "게임 정보 서비스 인증에 실패했습니다");
    }
  }
}

/**
 * 한 번 나가는 호출. **기록은 여기서** — 401 뒤 재시도도 실제로 한 번 더 나갔으므로 센다.
 * 성공·실패를 안 가린다 (IGDB 입장에선 401도 이미 받은 요청이다). 게이트에서 막히면 기록도 없다
 */
async function send(endpoint: string, query: string, bearer: string): Promise<unknown> {
  await throttle();   // 자리를 못 잡으면 여기서 429 — 아래 finally까지 오지 않는다
  let succeeded = false;
  try {
    const c = await credentials();
    const body = await restCall(`${IGDB.baseUrl}/${endpoint}`, {
      method: "POST",
      headers: { "Client-ID": c.clientId ?? "", Authorization: `Bearer ${bearer}`, Accept: "application/json", "Content-Type": "text/plain" },
      body: query,
    }, IGDB.timeoutMs);
    // 자바는 `List<...>`로 역직렬화했다 — 배열이 아니면 그 단계에서 실패(→ 502, 실패로 기록)
    if (body !== null && !Array.isArray(body)) throw new RestFailure(null, "응답 해석 실패");
    succeeded = true;
    return body;
  } catch (e) {
    if (e instanceof RestFailure && e.status === 401) throw new Unauthorized();
    if (e instanceof RestFailure) {
      // 타임아웃·연결 실패·429·5xx·해석 실패가 전부 여기로 (FR-SYS-04)
      console.error(`IGDB 호출 실패 — endpoint=${endpoint}`, e.cause ?? e.message);
      throw new ExternalApi("GAME_CATALOG", "게임 정보를 가져오지 못했습니다");
    }
    throw e;
  } finally {
    await recordApiCall("IGDB", endpoint, succeeded);
    releaseGate();
  }
}

// ───────────── 검색·상세 ─────────────

/**
 * 허용 game_type — Main Game(0)·Bundle(3)·Standalone Expansion(4)·Remake(8)·Remaster(9)·Expanded(10)·Port(11).
 * `version_parent = null`만으론 모드(5)가 못 걸러진다 (실측 `hollow knight` 1위가 모드였다)
 */
const ALLOWED_GAME_TYPES = "(0,3,4,8,9,10,11)";

type Node = Record<string, unknown> | null | undefined;
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const arr = (v: unknown): Node[] | null => (Array.isArray(v) ? (v as Node[]) : null);

/** 이름으로 검색. 상한은 서버가 정한다 */
export async function igdbSearch(keyword: string): Promise<CatalogGameSummary[]> {
  const query = `search "${escape(keyword)}";\nfields name, first_release_date, cover.image_id;\nwhere version_parent = null & game_type = ${ALLOWED_GAME_TYPES};\nlimit ${IGDB.searchLimit};`;
  const nodes = await post("games", query, `search q=${keyword}`);
  if (nodes === null) return [];
  return (nodes as Node[]).map((n) => ({
    externalId: String(n?.id ?? null),
    name: str(n?.name),
    releasedOn: toLocalDate(num(n?.first_release_date)),
    coverImageId: imageId(n?.cover as Node),
  }));
}

/**
 * 게임 상세. 담기 직전 딱 한 번. **multiquery**로 games와 game_time_to_beats를 한 요청에 묶는다.
 * 없는 id는 빈 배열로 온다 — 404로 바꾼다 (502로 올리면 원인이 가려진다)
 */
export async function igdbFindById(externalId: string): Promise<CatalogGameDetail> {
  const id = parseId(externalId);
  const query = `query games "game" {
  fields name, first_release_date, cover.image_id,
         artworks.image_id, summary, storyline,
         rating, rating_count, platforms.abbreviation, platforms.name,
         involved_companies.company.name,
         involved_companies.developer,
         involved_companies.publisher,
         genres.name;
  where id = ${id};
};
query game_time_to_beats "timeToBeat" {
  fields hastily, normally, completely, count;
  where game_id = ${id};
};`;
  const blocks = await post("multiquery", query, `detail id=${externalId}`);
  const g = firstOf(blocks, "game");
  if (!g) throw new NotFound(`게임을 찾을 수 없습니다. externalId=${externalId}`);
  const ttb = firstOf(blocks, "timeToBeat");
  const artworks = arr(g.artworks);
  return {
    externalId: String(g.id ?? null),
    name: str(g.name),
    developers: companyNames(g, "developer"),
    publishers: companyNames(g, "publisher"),
    genres: names(arr(g.genres)),
    releasedOn: toLocalDate(num(g.first_release_date)),
    coverImageId: imageId(g.cover as Node),
    // 배너는 첫 번째 아트워크. IGDB가 대표를 지정해주지 않아 순서를 믿는다
    bannerImageId: artworks && artworks.length > 0 ? imageId(artworks[0]) : null,
    summary: str(g.summary),
    storyline: str(g.storyline),
    igdbRating: toRating(num(g.rating)),
    igdbRatingCount: num(g.rating_count),
    releasePlatforms: platformNames(arr(g.platforms)),
    mainStoryHours: toHours(num(ttb?.hastily)),
    mainExtraHours: toHours(num(ttb?.normally)),
    completionistHours: toHours(num(ttb?.completely)),
    timeToBeatSamples: ttb ? num(ttb.count) : null,
  };
}

function imageId(n: Node): string | null {
  return n ? str(n.image_id) : null;
}

/** first_release_date는 이미 전 플랫폼 최솟값이다. UTC 날짜로 */
function toLocalDate(unixSeconds: number | null): string | null {
  if (unixSeconds === null) return null;
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

/**
 * 초 → 시간. 0 이하는 자료 없음. ⚠️ 자바는 `Math.round(seconds / 3600f)` — **float** 나눗셈이다.
 * 경계값에서 double과 반올림이 갈릴 수 있어 `fround`로 같은 정밀도를 만든다
 */
function toHours(seconds: number | null): number | null {
  if (seconds === null || seconds <= 0) return null;
  const f = Math.fround(Math.fround(seconds) / 3600);
  return Math.floor(f + 0.5);
}

/** 0 이하·없음은 null. 자바 `BigDecimal.valueOf(double)`은 `Double.toString` — JS의 가장 짧은 표기와 같다 */
function toRating(rating: number | null): string | null {
  if (rating === null || rating <= 0) return null;
  return scale2(String(rating));
}

function companyNames(g: NonNullable<Node>, role: "developer" | "publisher"): string[] {
  const list = arr(g.involved_companies);
  if (!list) return [];
  return list.filter((c) => c?.[role] === true)
    .map((c) => c?.company as Node)
    .filter((c): c is NonNullable<Node> => c !== null && c !== undefined)
    .map((c) => str(c.name))
    .filter((n): n is string => n !== null);
}

/** abbreviation이 없는(비었으면 공백만이어도) 플랫폼은 name으로 */
function platformNames(nodes: Node[] | null): string[] {
  if (!nodes) return [];
  return nodes.map((p) => {
    const ab = str(p?.abbreviation);
    return ab !== null && !isJavaBlank(ab) ? ab : str(p?.name);
  }).filter((n): n is string => n !== null);
}

function names(nodes: Node[] | null): string[] {
  if (!nodes) return [];
  return nodes.map((n) => str(n?.name)).filter((n): n is string => n !== null);
}

function firstOf(blocks: unknown, name: string): NonNullable<Node> | null {
  if (!Array.isArray(blocks)) return null;
  for (const b of blocks as Node[]) {
    if (b?.name !== name) continue;
    const r = arr(b.result);
    if (r && r.length > 0) return (r[0] ?? null) as NonNullable<Node> | null;
  }
  return null;
}

/** 자바 `Long.parseLong(strip)`. APIcalypse 본문에 끼워 넣으니 숫자 확인이 곧 인젝션 방어다 */
function parseId(externalId: string): bigint {
  const s = javaStrip(externalId);
  if (/^[+-]?\d+$/.test(s)) {
    const n = BigInt(s);
    if (n >= -(2n ** 63n) && n <= 2n ** 63n - 1n) return n;
  }
  throw new NotFound(`게임 id 형식이 올바르지 않습니다. externalId=${externalId}`);
}

/** `search "..."` 안에 들어가므로 따옴표·역슬래시를 막는다 */
function escape(keyword: string): string {
  return keyword.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
