import type {
  Acquisition,
  BacklogCard,
  BacklogDetail,
  EntryStatus,
  FacetCount,
  GameSearchResult,
  MeResponse,
  Playthrough,
  SidebarEntry,
  StatusCount,
} from "./types";

/**
 * 하드코딩 목데이터. API 호출은 아직 없다.
 * 화면이 꽉 찬 상태로 보이도록 회차·취득이 여러 건인 항목을 섞어뒀다.
 */

type Seed = {
  entryId: number;
  name: string;
  masterName?: string;
  status: EntryStatus;
  rating?: number;
  playTimeHours?: number;
  memo?: string;
  developers?: string[];
  publishers?: string[];
  releasedOn?: string;
  price?: number;
  /** RAWG playtime — 이용자 평균 플레이 시간 */
  avgPlaytime?: number;
  /** 정가를 내가 덮어쓴 경우에만 true. 그 외에는 마스터 정가를 그대로 쓴다 */
  priceOverridden?: boolean;
  source?: "RAWG" | "MANUAL";
  tags?: string[];
  genres?: string[];
  masterGenres?: string[];
  playthroughs?: Playthrough[];
  acquisitions?: Acquisition[];
};

const DEV = { id: 1, name: "Nintendo Switch" };
const PC = { id: 2, name: "Windows PC" };
const PS5 = { id: 3, name: "PlayStation 5" };

const STEAM_MAIN = {
  accountId: 1,
  label: "본계정",
  platform: { id: 10, name: "Steam" },
};
const NINTENDO_ACC = {
  accountId: 3,
  label: "메인",
  platform: { id: 12, name: "Nintendo" },
};

function pt(
  playthroughId: number,
  sequenceNo: number,
  startedOn: string,
  finishedOn: string | null,
  status: Playthrough["status"],
  device: Playthrough["device"],
  extra: Partial<Playthrough> = {},
): Playthrough {
  return {
    playthroughId,
    sequenceNo,
    startedOn,
    finishedOn,
    status,
    label: null,
    device,
    emulator: null,
    platformAccount: null,
    inputMethod: null,
    ...extra,
  };
}

function acq(
  acquisitionId: number,
  method: Acquisition["method"],
  extra: Partial<Acquisition> = {},
): Acquisition {
  return {
    acquisitionId,
    method,
    platform: null,
    platformAccount: null,
    subscription: null,
    price: null,
    acquiredOn: null,
    label: null,
    ...extra,
  };
}

const SEEDS: Seed[] = [
  {
    entryId: 1,
    name: "젤다의 전설 브레스 오브 더 와일드",
    avgPlaytime: 51,
    masterName: "The Legend of Zelda: Breath of the Wild",
    status: "COMPLETED",
    rating: 99,
    playTimeHours: 125,
    memo: "처음 하일리아 평원에 나섰을 때의 그 감각. 오픈월드의 기준이 바뀌었다.",
    developers: ["Nintendo EPD"],
    publishers: ["Nintendo"],
    releasedOn: "2017-03-03",
    price: 64800,
    priceOverridden: true,
    tags: ["명작", "액션"],
    genres: ["오픈월드", "어드벤처"],
    masterGenres: ["Action", "Adventure"],
    playthroughs: [
      pt(101, 1, "2017-03-03", "2017-04-20", "COMPLETED", DEV, {
        inputMethod: "NINTENDO",
        platformAccount: NINTENDO_ACC,
      }),
      pt(102, 2, "2022-01-01", null, "PLAYING", DEV, {
        label: "마스터 모드",
        inputMethod: "NINTENDO",
      }),
    ],
    acquisitions: [
      acq(201, "PURCHASED", {
        platform: { id: 12, name: "Nintendo" },
        platformAccount: NINTENDO_ACC,
        price: { amount: 64800, currency: "KRW" },
        acquiredOn: "2017-03-03",
      }),
    ],
  },
  {
    entryId: 2,
    name: "하데스",
    avgPlaytime: 22,
    masterName: "Hades",
    status: "PLAYING",
    rating: 93,
    playTimeHours: 62,
    memo: "죽어도 이야기가 앞으로 간다는 구조가 반칙이다.",
    developers: ["Supergiant Games"],
    publishers: ["Supergiant Games"],
    releasedOn: "2020-09-17",
    price: 24000,
    tags: ["명작", "로그라이크"],
    genres: ["로그라이크", "액션"],
    masterGenres: ["Action", "Indie"],
    playthroughs: [
      pt(103, 1, "2021-05-02", "2021-08-14", "COMPLETED", PC, {
        inputMethod: "XINPUT",
        platformAccount: STEAM_MAIN,
      }),
      pt(104, 3, "2026-07-01", null, "PLAYING", PC, {
        label: "열의 서약 20",
        inputMethod: "XINPUT",
      }),
    ],
    acquisitions: [
      acq(202, "PURCHASED", {
        platform: { id: 10, name: "Steam" },
        platformAccount: STEAM_MAIN,
        price: { amount: 24000, currency: "KRW" },
        acquiredOn: "2021-04-28",
      }),
      acq(203, "GIFT", { label: "친구 선물 (닌텐도판)", acquiredOn: "2021-12-24" }),
    ],
  },
  {
    entryId: 3,
    name: "엘든 링",
    avgPlaytime: 60,
    masterName: "Elden Ring",
    status: "PAUSED",
    rating: 97,
    playTimeHours: 88,
    developers: ["FromSoftware"],
    publishers: ["Bandai Namco"],
    releasedOn: "2022-02-25",
    price: 64800,
    tags: ["명작", "액션"],
    genres: ["소울라이크", "오픈월드"],
    masterGenres: ["Action", "RPG"],
    playthroughs: [
      pt(105, 1, "2022-02-25", null, "PAUSED", PC, {
        inputMethod: "XINPUT",
        platformAccount: STEAM_MAIN,
      }),
    ],
    acquisitions: [
      acq(204, "PURCHASED", {
        platform: { id: 10, name: "Steam" },
        platformAccount: STEAM_MAIN,
        price: { amount: 64800, currency: "KRW" },
        acquiredOn: "2022-02-25",
      }),
    ],
  },
  {
    entryId: 4,
    name: "페르소나 5 로열",
    avgPlaytime: 96,
    masterName: "Persona 5 Royal",
    status: "COMPLETED",
    rating: 86,
    playTimeHours: 110,
    developers: ["Atlus"],
    publishers: ["Sega"],
    releasedOn: "2019-10-31",
    price: 69800,
    tags: ["RPG"],
    genres: ["JRPG"],
    masterGenres: ["RPG"],
    playthroughs: [
      pt(106, 1, "2023-01-02", "2023-03-30", "COMPLETED", PS5, {
        inputMethod: "PLAYSTATION",
      }),
    ],
    acquisitions: [
      acq(205, "PURCHASED", {
        platform: { id: 11, name: "PlayStation Store" },
        price: { amount: 69800, currency: "KRW" },
        acquiredOn: "2022-12-30",
      }),
    ],
  },
  {
    entryId: 5,
    name: "포켓몬스터 스칼렛",
    masterName: "Pokémon Scarlet",
    status: "DROPPED",
    rating: 58,
    playTimeHours: 22,
    memo: "프레임이 발목을 잡았다.",
    developers: ["Game Freak"],
    publishers: ["Nintendo"],
    releasedOn: "2022-11-18",
    tags: ["RPG"],
    genres: ["JRPG"],
    masterGenres: ["RPG"],
    playthroughs: [
      pt(107, 1, "2022-11-18", "2022-12-10", "DROPPED", DEV, {
        inputMethod: "NINTENDO",
      }),
    ],
    acquisitions: [
      acq(206, "PURCHASED", {
        platform: { id: 12, name: "Nintendo" },
        price: { amount: 64800, currency: "KRW" },
        acquiredOn: "2022-11-18",
      }),
    ],
  },
  {
    entryId: 6,
    name: "링 피트 어드벤처",
    masterName: "Ring Fit Adventure",
    status: "PLAYING",
    rating: 83,
    playTimeHours: 40,
    developers: ["Nintendo"],
    publishers: ["Nintendo"],
    releasedOn: "2019-10-18",
    price: 89800,
    priceOverridden: true,
    source: "MANUAL",
    tags: ["운동"],
    genres: ["피트니스", "기능성"],
    masterGenres: ["Sports"],
    playthroughs: [
      pt(108, 2, "2026-05-27", null, "PLAYING", DEV, { inputMethod: "NINTENDO" }),
    ],
    acquisitions: [
      acq(207, "PURCHASED", {
        platform: { id: 12, name: "Nintendo" },
        price: { amount: 89800, currency: "KRW" },
        acquiredOn: "2020-01-05",
      }),
    ],
  },
  {
    entryId: 7,
    name: "할로우 나이트",
    avgPlaytime: 27,
    masterName: "Hollow Knight",
    status: "COMPLETED",
    rating: 95,
    playTimeHours: 54,
    developers: ["Team Cherry"],
    publishers: ["Team Cherry"],
    releasedOn: "2017-02-24",
    tags: ["명작", "메트로배니아"],
    genres: ["메트로배니아"],
    masterGenres: ["Action", "Indie"],
    playthroughs: [
      pt(109, 1, "2019-06-01", "2019-07-20", "COMPLETED", PC, {
        inputMethod: "XINPUT",
        platformAccount: STEAM_MAIN,
      }),
    ],
    acquisitions: [
      acq(208, "PURCHASED", {
        platform: { id: 10, name: "Steam" },
        platformAccount: STEAM_MAIN,
        price: { amount: 15500, currency: "KRW" },
        acquiredOn: "2019-05-30",
      }),
    ],
  },
  {
    entryId: 8,
    name: "슬레이 더 스파이어",
    avgPlaytime: 25,
    masterName: "Slay the Spire",
    status: "PLAYING",
    rating: 91,
    playTimeHours: 210,
    developers: ["Mega Crit"],
    publishers: ["Mega Crit"],
    releasedOn: "2019-01-23",
    tags: ["로그라이크"],
    genres: ["덱빌딩", "로그라이크"],
    masterGenres: ["Card", "Indie"],
    playthroughs: [
      pt(110, 1, "2020-03-11", null, "PLAYING", PC, {
        inputMethod: "KEYBOARD_MOUSE",
        platformAccount: STEAM_MAIN,
      }),
    ],
    acquisitions: [
      acq(209, "PURCHASED", {
        platform: { id: 10, name: "Steam" },
        platformAccount: STEAM_MAIN,
        price: { amount: 18000, currency: "KRW" },
        acquiredOn: "2020-03-10",
      }),
    ],
  },
  {
    entryId: 9,
    name: "발더스 게이트 3",
    avgPlaytime: 73,
    masterName: "Baldur's Gate 3",
    status: "BACKLOG",
    developers: ["Larian Studios"],
    publishers: ["Larian Studios"],
    releasedOn: "2023-08-03",
    price: 66800,
    tags: ["RPG", "명작"],
    genres: ["CRPG"],
    masterGenres: ["RPG"],
    acquisitions: [
      acq(210, "PURCHASED", {
        platform: { id: 10, name: "Steam" },
        platformAccount: STEAM_MAIN,
        price: { amount: 66800, currency: "KRW" },
        acquiredOn: "2024-11-29",
      }),
    ],
  },
  {
    entryId: 10,
    name: "스타듀 밸리",
    avgPlaytime: 47,
    masterName: "Stardew Valley",
    status: "PAUSED",
    rating: 88,
    playTimeHours: 76,
    developers: ["ConcernedApe"],
    publishers: ["ConcernedApe"],
    releasedOn: "2016-02-26",
    tags: ["힐링"],
    genres: ["시뮬레이션"],
    masterGenres: ["Simulation", "Indie"],
    playthroughs: [
      pt(111, 1, "2021-01-02", "2021-04-01", "COMPLETED", PC, {
        inputMethod: "KEYBOARD_MOUSE",
      }),
      pt(112, 2, "2024-02-14", null, "PAUSED", DEV, { inputMethod: "NINTENDO" }),
    ],
    acquisitions: [
      acq(211, "PURCHASED", {
        platform: { id: 10, name: "Steam" },
        price: { amount: 16500, currency: "KRW" },
        acquiredOn: "2020-12-24",
      }),
    ],
  },
  {
    entryId: 11,
    name: "세키로",
    avgPlaytime: 32,
    masterName: "Sekiro: Shadows Die Twice",
    status: "DROPPED",
    rating: 90,
    playTimeHours: 18,
    developers: ["FromSoftware"],
    publishers: ["Activision"],
    releasedOn: "2019-03-22",
    tags: ["액션"],
    genres: ["소울라이크"],
    masterGenres: ["Action"],
    playthroughs: [
      pt(113, 1, "2023-05-01", "2023-05-20", "DROPPED", PC, {
        inputMethod: "XINPUT",
      }),
    ],
    acquisitions: [acq(212, "SUBSCRIPTION", { subscription: { subscriptionId: 1, serviceName: "Xbox Game Pass" }, acquiredOn: "2023-05-01" })],
  },
  {
    entryId: 12,
    name: "디스코 엘리시움",
    masterName: "Disco Elysium",
    status: "BACKLOG",
    developers: ["ZA/UM"],
    publishers: ["ZA/UM"],
    releasedOn: "2019-10-15",
    tags: ["RPG", "명작"],
    genres: ["CRPG"],
    masterGenres: ["RPG", "Indie"],
    acquisitions: [
      acq(213, "FREE", { platform: { id: 13, name: "Epic Games" }, acquiredOn: "2022-06-16" }),
    ],
  },
  {
    entryId: 13,
    name: "몬스터 헌터 와일즈",
    masterName: "Monster Hunter Wilds",
    status: "WISHLIST",
    developers: ["Capcom"],
    publishers: ["Capcom"],
    releasedOn: "2025-02-28",
    price: 74800,
    tags: ["액션"],
    genres: ["헌팅액션"],
    masterGenres: ["Action"],
    acquisitions: [acq(214, "NOT_OWNED")],
  },
  {
    entryId: 14,
    name: "실크송",
    masterName: "Hollow Knight: Silksong",
    status: "WISHLIST",
    developers: ["Team Cherry"],
    publishers: ["Team Cherry"],
    tags: ["메트로배니아"],
    genres: ["메트로배니아"],
    masterGenres: ["Action", "Indie"],
    acquisitions: [acq(215, "NOT_OWNED")],
  },
  {
    entryId: 15,
    name: "저니",
    avgPlaytime: 3,
    masterName: "Journey",
    status: "COMPLETED",
    rating: 92,
    playTimeHours: 3,
    developers: ["thatgamecompany"],
    publishers: ["Sony Interactive Entertainment"],
    releasedOn: "2012-03-13",
    tags: ["힐링", "명작"],
    genres: ["어드벤처"],
    masterGenres: ["Adventure", "Indie"],
    playthroughs: [
      pt(114, 1, "2020-08-15", "2020-08-15", "COMPLETED", PC, {
        inputMethod: "XINPUT",
      }),
    ],
    acquisitions: [
      acq(216, "PURCHASED", {
        platform: { id: 13, name: "Epic Games" },
        price: { amount: 16500, currency: "KRW" },
        acquiredOn: "2020-08-14",
      }),
    ],
  },
  {
    entryId: 16,
    name: "피트 온 파이어",
    masterName: "Fitness Boxing 2",
    status: "PAUSED",
    rating: 70,
    playTimeHours: 26,
    developers: ["Imagineer"],
    publishers: ["Imagineer"],
    releasedOn: "2020-12-03",
    source: "MANUAL",
    tags: ["운동"],
    genres: ["피트니스"],
    masterGenres: ["Sports"],
    playthroughs: [
      pt(115, 1, "2024-01-02", null, "PAUSED", DEV, { inputMethod: "NINTENDO" }),
    ],
    acquisitions: [
      acq(217, "PURCHASED", {
        platform: { id: 12, name: "Nintendo" },
        price: { amount: 54800, currency: "KRW" },
        acquiredOn: "2024-01-01",
      }),
    ],
  },
  {
    entryId: 17,
    name: "테트리스 이펙트",
    masterName: "Tetris Effect: Connected",
    status: "BACKLOG",
    developers: ["Monstars"],
    publishers: ["Enhance"],
    releasedOn: "2018-11-09",
    genres: ["퍼즐"],
    masterGenres: ["Puzzle"],
    acquisitions: [
      acq(218, "SUBSCRIPTION", {
        subscription: { subscriptionId: 1, serviceName: "Xbox Game Pass" },
        acquiredOn: "2026-01-05",
      }),
    ],
  },
  {
    entryId: 18,
    name: "아우터 와일즈",
    masterName: "Outer Wilds",
    status: "BACKLOG",
    developers: ["Mobius Digital"],
    publishers: ["Annapurna Interactive"],
    releasedOn: "2019-05-28",
    genres: ["어드벤처"],
    masterGenres: ["Adventure", "Indie"],
  },
];

function toDetail(seed: Seed): BacklogDetail & { tags: string[] } {
  const developers = seed.developers ?? [];
  const publishers = seed.publishers ?? [];
  const genres = seed.genres ?? [];
  const masterGenres = seed.masterGenres ?? [];
  const overrideName = seed.masterName && seed.masterName !== seed.name ? seed.name : null;
  const listPrice = seed.price != null ? { amount: seed.price, currency: "KRW" as const } : null;
  const priceOverride = seed.priceOverridden ? listPrice : null;

  return {
    entryId: seed.entryId,
    status: seed.status,
    coverUrl: null,
    resolved: {
      name: seed.name,
      developers,
      publishers,
      releasedOn: seed.releasedOn ?? null,
      listPrice,
      genres: genres.length > 0 ? genres : masterGenres,
    },
    master: {
      gameId: 1000 + seed.entryId,
      name: seed.masterName ?? seed.name,
      developers,
      publishers,
      releasedOn: seed.releasedOn ?? null,
      listPrice: seed.priceOverridden ? null : listPrice,
      genres: masterGenres,
      source: seed.source ?? "RAWG",
      averagePlaytimeHours: seed.avgPlaytime ?? null,
    },
    overrides: {
      name: overrideName,
      developers: [],
      publishers: [],
      releasedOn: null,
      listPrice: priceOverride,
    },
    personalRecord: {
      rating: seed.rating ?? null,
      playTimeHours: seed.playTimeHours ?? null,
      memo: seed.memo ?? null,
    },
    tags: seed.tags ?? [],
    genres,
    playthroughs: seed.playthroughs ?? [],
    acquisitions: seed.acquisitions ?? [],
  };
}

export const MOCK_DETAILS: (BacklogDetail & { tags: string[] })[] = SEEDS.map(toDetail);

export function findDetail(entryId: number) {
  return MOCK_DETAILS.find((d) => d.entryId === entryId) ?? MOCK_DETAILS[0];
}

/** 최신 회차 = COALESCE(종료일, 시작일) 최대 (§7.6) */
function lastPlaythrough(detail: BacklogDetail) {
  const sorted = [...detail.playthroughs].sort((a, b) =>
    (a.finishedOn ?? a.startedOn).localeCompare(b.finishedOn ?? b.startedOn),
  );
  const last = sorted.at(-1);
  if (!last) return null;
  return {
    sequenceNo: last.sequenceNo,
    startedOn: last.startedOn,
    finishedOn: last.finishedOn,
    deviceName: last.device?.name ?? null,
    emulatorName: last.emulator?.name ?? null,
  };
}

export const MOCK_CARDS: BacklogCard[] = MOCK_DETAILS.map((d) => ({
  entryId: d.entryId,
  coverUrl: d.coverUrl,
  displayName: d.resolved.name,
  genres: d.resolved.genres,
  rating: d.personalRecord.rating,
  status: d.status,
  lastPlaythrough: lastPlaythrough(d),
}));

/** 사이드바 그룹 — 태그 없는 항목은 UI상 특수 그룹으로 모은다 (DB에 태그를 만들지 않는다) */
export const UNTAGGED = "태그 없음";

export const MOCK_SIDEBAR: SidebarEntry[] = MOCK_DETAILS.map((d) => ({
  entryId: d.entryId,
  displayName: d.resolved.name,
  tags: d.tags,
}));

export type SidebarGroup = { tag: string; entries: SidebarEntry[] };

/** 멀티태그 항목은 여러 그룹에 중복으로 들어간다. 그룹 안은 이름 오름차순 고정 */
export function groupByTag(entries: SidebarEntry[]): SidebarGroup[] {
  const map = new Map<string, SidebarEntry[]>();
  for (const entry of entries) {
    const keys = entry.tags.length > 0 ? entry.tags : [UNTAGGED];
    for (const key of keys) {
      const bucket = map.get(key);
      if (bucket) bucket.push(entry);
      else map.set(key, [entry]);
    }
  }
  const named = [...map.entries()]
    .filter(([tag]) => tag !== UNTAGGED)
    .sort((a, b) => a[0].localeCompare(b[0], "ko"));
  const untagged = map.get(UNTAGGED);
  if (untagged) named.push([UNTAGGED, untagged]);

  return named.map(([tag, list]) => ({
    tag,
    entries: [...list].sort((a, b) => a.displayName.localeCompare(b.displayName, "ko")),
  }));
}

export const MOCK_TAG_FACETS: FacetCount[] = groupByTag(MOCK_SIDEBAR)
  .filter((g) => g.tag !== UNTAGGED)
  .map((g, i) => ({ id: i + 1, name: g.tag, count: g.entries.length }));

const STATUS_ORDER: EntryStatus[] = [
  "WISHLIST",
  "BACKLOG",
  "PLAYING",
  "PAUSED",
  "DROPPED",
  "COMPLETED",
];

export const MOCK_STATUS_COUNTS: StatusCount[] = STATUS_ORDER.map((status) => ({
  status,
  count: MOCK_CARDS.filter((c) => c.status === status).length,
}));

export function statusCount(status: EntryStatus) {
  return MOCK_STATUS_COUNTS.find((s) => s.status === status)?.count ?? 0;
}

export const MOCK_TOTAL = MOCK_CARDS.length;

/** 최근 플레이순 상위 (sort=lastPlayed) */
export const MOCK_RECENT: BacklogCard[] = [...MOCK_CARDS]
  .filter((c) => c.lastPlaythrough)
  .sort((a, b) => {
    const key = (c: BacklogCard) =>
      c.lastPlaythrough!.finishedOn ?? c.lastPlaythrough!.startedOn;
    return key(b).localeCompare(key(a));
  })
  .slice(0, 5);

export const MOCK_ME: MeResponse = {
  profile: {
    memberId: 1,
    email: "milo.beene@gmail.com",
    nickname: "밀로",
    memo: "쌓아두기만 하는 게 취미. 이제는 좀 줄여보려고요.",
  },
  platformAccounts: [
    { accountId: 1, label: "본계정", platform: { id: 10, name: "Steam" } },
    { accountId: 2, label: "부계정", platform: { id: 10, name: "Steam" } },
    { accountId: 3, label: "메인", platform: { id: 12, name: "Nintendo" } },
  ],
  devices: [
    { memberDeviceId: 1, label: "거실용", memo: "TV 독 연결", device: { id: 1, name: "Nintendo Switch" } },
    { memberDeviceId: 2, label: "메인 PC", memo: null, device: { id: 2, name: "Windows PC" } },
    { memberDeviceId: 3, label: "안방", memo: null, device: { id: 3, name: "PlayStation 5" } },
  ],
  subscriptions: [
    {
      subscriptionId: 1,
      serviceName: "Xbox Game Pass",
      startedOn: "2026-01-01",
      endedOn: null,
      fee: { amount: 11900, currency: "KRW" },
      billingCycle: "MONTHLY",
      active: true,
    },
    {
      subscriptionId: 2,
      serviceName: "Nintendo Switch Online",
      startedOn: "2025-03-01",
      endedOn: "2026-03-01",
      fee: { amount: 19900, currency: "KRW" },
      billingCycle: "YEARLY",
      active: false,
    },
  ],
};

export const MOCK_GENRE_DICTIONARY = [
  "오픈월드",
  "로그라이크",
  "메트로배니아",
  "JRPG",
  "CRPG",
  "피트니스",
];

/**
 * 담기 3분기(성공 / 이미 담음 / 되살리기)를 껍데기에서도 보여주려고 붙인 시연용 필드.
 * 실제 응답에는 없다 — 서버가 POST /api/backlog 의 상태코드로 알려준다.
 */
export type MockAddOutcome = "created" | "duplicated" | "revivable";

export const MOCK_SEARCH_RESULTS: (GameSearchResult & { outcome: MockAddOutcome })[] = [
  { gameId: 2001, name: "The Legend of Zelda: Tears of the Kingdom", releasedOn: "2023-05-12", source: "RAWG", outcome: "created" },
  { gameId: 2002, name: "Hades II", releasedOn: "2024-05-06", source: "RAWG", outcome: "created" },
  { gameId: 2003, name: "Ring Fit Adventure", releasedOn: "2019-10-18", source: "MANUAL", outcome: "duplicated" },
  { gameId: 2004, name: "Celeste", releasedOn: "2018-01-25", source: "RAWG", outcome: "revivable" },
  { gameId: 2005, name: "Outer Wilds", releasedOn: "2019-05-28", source: "RAWG", outcome: "duplicated" },
];

/** GET /api/me/options — 편집 폼 선택지. 기기·플랫폼은 마스터 전체 (BR-PT-05) */
export const MOCK_OPTIONS = {
  platforms: [
    { id: 10, name: "Steam" },
    { id: 11, name: "PlayStation Store" },
    { id: 12, name: "Nintendo" },
    { id: 13, name: "Epic Games" },
    { id: 14, name: "GOG" },
  ],
  devices: [
    { id: 1, name: "Nintendo Switch" },
    { id: 2, name: "Windows PC" },
    { id: 3, name: "PlayStation 5" },
    { id: 4, name: "Steam Deck" },
    { id: 5, name: "Xbox Series X" },
  ],
  emulators: [
    { id: 1, name: "Ryujinx" },
    { id: 2, name: "RetroArch" },
  ],
  platformAccounts: MOCK_ME.platformAccounts,
  subscriptions: MOCK_ME.subscriptions,
  tagDictionary: ["명작", "액션", "RPG", "로그라이크", "메트로배니아", "운동", "힐링"],
  genreDictionary: MOCK_GENRE_DICTIONARY,
};

/** 소프트 삭제된 플랫폼 계정 라벨. 같은 이름으로 다시 등록하면 되살리기 확인이 뜬다 (§6.5) */
export const MOCK_DELETED_ACCOUNT_LABELS = ["예전 부계정"];

/** 개인 장르 사전 + 사용 수. 어느 항목에도 안 붙은 것은 목록에서 빠진다 (자동 소멸) */
export const MOCK_GENRE_FACETS: FacetCount[] = (() => {
  const counts = new Map<string, number>();
  for (const detail of MOCK_DETAILS) {
    for (const genre of detail.genres) {
      counts.set(genre, (counts.get(genre) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "ko"))
    .map(([name, count], index) => ({ id: index + 1, name, count }));
})();
