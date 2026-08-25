# STARLOG 디자인 시스템

**앞으로 만드는 모든 화면은 이 문서를 따른다.** 새 색·새 여백을 즉흥으로 만들지 않는다.
토큰 원본은 `frontend/src/app/globals.css`.

---

## 1. 근간 — 유체 배경

이 서비스의 아이덴티티다. WebGL 셰이더 한 장이 **전역에 깔리고 라우트가 바뀌어도 유지된다**
(`components/background/FluidBackground.tsx`, 루트 레이아웃에 1회만 마운트).

`uAppState` 하나로 두 얼굴을 만든다. 라우트가 바뀌면 목표값만 갈아끼우고
렌더 루프가 프레임마다 5%씩 따라간다 — 즉시 전환하면 화면이 번쩍인다.

| | 입구 `/` | 앱 내부 |
|---|---|---|
| `uAppState` | 0.0 | 1.0 |
| 색 | 원색 + 무지개 순회 | `× 0.34` 어둡게 + 25% 탈채도 |
| 속도 | 0.1 | 0.03 |
| 그레인 | 0.06 | 0.042 |

> **그레인 세기는 튜닝값이다.** 절대 고정(0.06)은 어두운 앱 화면에서 4배 거칠어 보이고,
> 색과 같은 비율(×0.25)로 줄이면 거의 안 보인다. 0.042는 그 사이에서 맞춘 값이다.
> 셰이더의 나머지는 확정된 값이니 손대지 말 것.
> 채도·무지개 순회는 사용자가 보류해둔 항목이라 논의 후에만 바꾼다.

**모든 면은 반투명이다.** 배경이 비쳐야 하므로 불투명 배경을 깔지 않는다.

> ⚠️ **엘리먼트 리셋은 반드시 `@layer base` 안에 둔다.**
> 레이어 밖의 CSS는 캐스케이드 레이어 규칙상 **모든 레이어를 이긴다** —
> `button { background: none }` 하나가 `bg-white` 같은 유틸리티를 전부 무력화한다.
> 실제로 뷰 전환 버튼의 활성 표시가 이것 때문에 안 먹었다.

## 2. 색

바탕은 `#050505` 하나뿐이고, 나머지는 전부 **흰색의 알파**다.

```
선     rgba(255,255,255,0.15)   .border-line / .border-b-line / .divide-y-line …
선(약) rgba(255,255,255,0.08)   유리 판넬 테두리
면     bg-white/5   bg-white/10   bg-black/20   bg-black/40
글자   text-white  /90  /80  /70  /60  /50  /40  /30  /25  /20
```

**유리 판넬** — 사이드바·드롭다운 전용. 남발하지 않는다.
```css
.glass-panel { background: rgba(10,10,10,0.4); backdrop-filter: blur(24px);
               border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 4px 30px rgba(0,0,0,0.5); }
```

**포인트 색은 셋뿐이다.**
- 평점 `text-yellow-500`
- 위험(삭제·로그아웃) `text-red-400`
- 오버라이드 표시 `text-amber-400/70`

### 상태 배지 6종 (유일하게 채운 색)

```
badge-wishlist  #475569   badge-backlog  #7e22ce   badge-playing   #15803d
badge-paused    #a16207   badge-dropped  #b91c1c   badge-completed #1d4ed8
```
`<StatusBadge status size="sm|md" />`로만 쓴다. 라벨은 **영문 대문자**.

## 3. 타이포

| | 폰트 | 쓰는 곳 |
|---|---|---|
| 표시 | **Syncopate 700** (`font-display font-bold`) | 워드마크 STARLOG **전용** |
| 본문 | **Inter 300/400/500/600** | 나머지 전부 |

> Syncopate은 700 하나만 받아온다 — `font-bold` 없이 쓰면 폴백으로 샌다.
> 본문에 쓰면 한글이 통째로 폴백된다.

```
페이지 제목   text-3xl md:text-4xl font-semibold tracking-tight
섹션 제목     text-2xl font-medium tracking-tight text-white/90
큰 숫자       text-6xl font-light tracking-tighter
꼬리표        text-[10px] tracking-[0.2em] uppercase text-white/40   → [ LIBRARY ]
표 머리       text-xs uppercase tracking-wider text-white/40
본문          text-sm
잔글씨        text-xs / text-[11px]
```

**UI 라벨은 영문, 데이터는 원래 언어.** 메뉴·버튼·섹션 제목이 영문이고
게임 이름·태그·장르는 한국어 그대로 나온다.

## 4. 모양

```
라운드   rounded (4px) · rounded-md (6px) · rounded-lg (8px) · rounded-xl (12px) · rounded-full
여백     페이지 px-8~px-10 · 카드/판넬 p-6 · 타일 p-10
그리드   grid-cols-2 md:3 lg:4 xl:5 2xl:6, gap-x-6 gap-y-10
커버     aspect-[3/4] rounded-xl  ← IGDB 커버 실측 비율. 어기면 전부 늘어난다
폴더     aspect-square rounded-2xl
```

**그림자는 유리 판넬에만.** 카드는 테두리로만 구분한다.

**호버는 틀이 아니라 안쪽만 움직인다.** 틀이 커지면 그리드가 술렁이고, `overflow-hidden`이
위쪽을 잘라 사라진 것처럼 보인다.

| | |
|---|---|
| 커버 | 이미지 `scale-[1.06]` + 광택 띠가 한 번 지나감 + 안쪽 `ring-white/25` |
| 폴더 | 배경 블러 `scale-[1.45]` + 어둠 완화 + 라벨이 2px 떠오름 |

바깥 테두리·크기는 **절대 안 건드린다.**

## 5. 공통 컴포넌트

`components/ui/` — 새 화면은 여기 있는 것부터 찾아 쓴다.

| | |
|---|---|
| `StatusBadge` | 상태 배지 6종 |
| `Chip` | 태그·장르 칩. `rounded` = 알약형, `onRemove` = × 버튼 |
| `GameCover` | 커버 2단 폴백 + 로드 실패 시 플레이스홀더 |
| `GameCard` | 라이브러리 그리드 카드 |
| `PosterCard` | 대시보드 가로 목록 한 칸 |
| `Pagination` | 0-베이스 페이지, 많으면 `…`으로 접음 |
| `PageHeading` | `[ EYEBROW ]` + 제목 + 부제 |
| `SectionHeader` | 섹션 제목 + `More →` |
| `SearchInput` · `Dropdown` | 검색창 · 드롭다운(바깥클릭·Esc 처리 포함) |
| `StarIcon` | 속이 빈 별 + 둥근 끝. **모든 평점 표시에 쓴다** — `★` 글자는 폰트마다 크기가 달라 안 쓴다 |
| `Combobox` | **입력 + 자동완성.** 목록은 **body로 포털**한다 — 안 그러면 모달 안에서 잘린다 |
| `AuthCard` | 로그인 전 화면 공통 껍데기 (`GoogleButton` 포함) |
| `SettingsSection` | 설정 섹션 하나 |

> ⚠️ **커스텀 `.divide-y-line`·`.border-*-line`은 레이어 밖이라 Tailwind 반응형 유틸리티를 이긴다.**
> `divide-y-line lg:divide-y-0`처럼 쓰면 큰 화면에서도 테두리가 안 사라진다.
> 방향이 바뀌는 자리에는 **진짜 유틸리티**(`divide-y divide-white/15 lg:divide-x lg:divide-y-0`)를 쓸 것.

> ⚠️ **사전(태그·장르) 수정은 `facets`를 쓴다.** `/api/me/options`는 이름만 줘서
> id가 없다 — 그것만 보고 "수정 불가"로 판단했다가 FR-TAG-02(MUST)를 빠뜨린 적이 있다.
> facets가 `{ id, name, count }`를 주고, count는 "N개 항목에 함께 반영" 안내에 그대로 쓴다.
| `ChipInput` | 태그·장르처럼 문자열 여러 개. Combobox + 칩 |
| `Modal` · `ConfirmDialog` | 다이얼로그 껍데기 · 되돌리기 어려운 동작 확인 |
| `Field` · `Button` · `EditButton` | 편집 폼 공용 |
| `MarkdownTextarea` | 메모 입력. Enter로 목록 이어쓰기, Tab으로 들여쓰기 |
| `SectionIcon` | 소제목 왼쪽 무채색 아이콘. **메뉴·뒤로가기에는 안 붙인다** |
| `Timeline` | 상세의 날짜 5점. 값 없는 점은 빼고 **날짜순**으로 놓는다 |
| `EmptyState` · `ErrorNotice` · `Skeleton` | 빈 / 에러 / 로딩 |

`components/library/`·`components/dashboard/`는 화면 전용이다.

### 폼 입력 스타일은 상수로만 쓴다

`components/ui/Field.tsx`에 셋이 있다. **직접 클래스를 적지 말 것** — 세 파일에 흩어져 있던 걸 모았다.

| | |
|---|---|
| `FIELD_INPUT` | 기본 입력 |
| `FIELD_SELECT` | `+ [&>option]:bg-neutral-900` — OS가 그리는 팝업이라 어두운 배경을 직접 줘야 한다 |
| `FIELD_DATE` | `+ num + 달력 아이콘 invert` — 아이콘이 기본 검정이라 안 보인다 |

### 자동완성 (Combobox)

사전이 있는 값은 **직접 치는 것과 고르는 것을 둘 다** 지원한다. 태그·장르·개발사처럼
사용자가 만든 어휘는 오타 하나로 다른 값이 되기 때문이다.

| 모드 | 쓰는 곳 | 동작 |
|---|---|---|
| `freeText` | 개발사·장르 검색 | 사전에 없는 값도 그대로 쓴다. 타이핑이 곧 값 |
| 선택 전용 | 기기·플랫폼 | 목록에 있는 것만. 표시는 이름, 값은 id |

**자동완성에는 사전에 있는 값만 올린다.** 개발사·유통사는 `overriddenDevelopers`/
`overriddenPublishers`(내가 적은 것), 태그·장르는 `/api/me/options`의 사전.
사전에 없는 값도 **직접 쳐서 쓸 수 있고**, 서버는 마스터 값까지 뒤지므로
IGDB가 준 이름으로도 검색·필터가 된다. **`<datalist>`는 쓰지 않는다** — 스타일이 안 먹어
어두운 테마에서 흰 팝업이 튀어나온다.

## 6. 화면마다 세 얼굴

| | |
|---|---|
| **로딩** | `Skeleton` — Neon이 5분 유휴면 잠들어 첫 요청이 몇 초 걸린다. 장식이 아니다 |
| **비었을 때** | `EmptyState` — 라이브러리 2종(담은 것 없음 / 조건 불일치)은 문구가 달라야 한다 |
| **에러** | `ErrorNotice` — 401·SESSION_EXPIRED는 로그인 유도로 갈린다 |

**폼 에러는 `errorMessage(caught, fallback)`을 쓴다.** `ApiError`만 message를 꺼내면
클라이언트 검증 문구("새 비밀번호가 서로 다릅니다")가 폴백에 뭉개진다.

### 상세 화면 순서 (설계서 §2.9 고정)

```
헤더(상태 → 제목 → 별점·장르)  ·  요약 스탯 4칸
좌:  About → Timeline → 회차 → 구매 → My Notes(제일 아래)
우:  Game Information → How Long To Beat → Tags → 액션
```

> **폴더 박스는 대표 커버 한 장을 확대·블러해서 배경으로 쓴다.** 여러 장을 겹쳐 펼치는 건
> 산수가 안 맞았다 — 정사각 박스에서 커버(3:4)가 높이를 다 채우면 폭의 64%를 먹는다.
> 커버가 없으면(Untagged) 무채색 그래디언트로 떨어진다.

**Timeline은 프론트가 계산한다** (API 설계서 §1.3). 서버는 원자료만 준다:
담음 `createdAt` · 취득 `min(acquiredOn)` · 첫 플레이 `min(startedOn)` ·
첫 완주 `min(finishedOn where COMPLETED)` · 마지막 `max(coalesce(finishedOn, startedOn))`.
**순서는 고정이 아니라 날짜순**이고, 값이 없는 점은 아예 안 그린다.

**커버 바꾸기는 커버 위 호버 연필**이다 — 액션 목록에 버튼을 더하면 길어진다.

평점 별은 자리마다 색이 다르다 — **내 평점은 노랑, 남의 평점(IGDB)·라벨 옆은 무채색**.

### 편집 진입점

| 자리 | 연다 |
|---|---|
| 커버 우상단 호버 연필 | 커버 업로드·삭제 |
| 헤더 장르 칩 옆 연필 | 개인 장르 (마스터를 덮어쓴다) |
| Game Information 연필 | 오버라이드 — **마스터 원본이 placeholder로 뜬다** |
| My Notes 연필 | 평점·플레이 시간·메모 |
| Tags 연필 | 태그 |
| 회차·구매 표의 **행 클릭** | 해당 기록 수정 · 섹션 제목 옆 버튼으로 추가 |

**개인 장르는 오버라이드 폼에 합쳐져 있다.** 저장이 두 번 나가지만(경로가 다르다)
쓰는 사람에게는 "게임 정보를 고치는 일" 하나다.

**Timeline은 점이 모자라도 섹션을 남긴다** — 비면 "아직 이어 그릴 기록이 없어"로 바꾼다.

**플레이 시간은 `현재 + 추가` 두 칸이고, 합치는 건 저장할 때뿐이다.**
포커스가 빠질 때 합치면 고치는 중에 값이 튀어 이미 넣은 숫자를 못 고친다.

**저장 뒤에는 상세를 다시 읽는다.** 회차를 고치면 서버가 항목 상태와 `lastPlaythrough`를
재계산하므로(§7.2) 화면 값만 갈아끼우면 배지가 안 따라온다.

**장르 다이얼로그에는 `resolved.genres`가 아니라 `detail.genres`(개인 장르 원본)를 넘긴다.**
resolved는 마스터 폴백이 섞여 있어 그대로 저장하면 마스터 값이 개인 사전으로 복사된다.

**How Long To Beat는 별도 섹션이다** — IGDB의 남들 평균이지 내 기록이 아니다.
Game Information에 섞으면 "내 출시일 / 남의 시간"이 한 표에 붙어 뜻이 흐려진다.

## 6.5 말투

**사용자에게 보이는 모든 글은 존댓말 서비스 톤이다.** 은행 창구 안내문에 가깝다.

```
✅  등록된 회차 기록이 없습니다
✅  비워 두시면 원본 정보로 돌아갑니다
✅  저장하지 못했습니다. 잠시 후 다시 시도해 주세요.
❌  회차 기록이 없어 / 비우면 마스터 값으로 돌아가 / 저장에 실패했어
```

CLAUDE.md의 반말은 **나와 대화할 때**의 말투다. 코드 주석도 반말이 맞고,
화면에 나가는 문구만 존댓말이다.

## 7. 표시 규칙

**숫자에는 전부 `.num`을 붙인다** — 통계·평점·금액·날짜·카운트·페이지 번호.
`tabular-nums`로 자릿수 폭이 고정돼 값이 바뀌어도 자리가 안 흔들린다.
모노 폰트로 갈아끼울 때 `--font-num` 한 줄만 바꾸면 전 화면에 적용된다.

```
평점    0.0~100.0, 소수 1자리. formatRating() 필수 (String(83.0) === "83")
금액    통화를 합치지 않는다. formatMoney()
날짜    YYYY-MM-DD, 종료일 null이면 "진행 중"
카드    평점·마지막 플레이 줄은 값이 없어도 자리를 차지한다 (그리드 행이 흔들린다)
```

## 8. 레이아웃 규칙

- **헤더는 `fixed` + 배경 없음.** 본문이 그 아래로 흐른다 — 상세 배너가 헤더 뒤를 덮으려면 필수
- **라이브러리 메인에는 경계선이 없다.** 사이드바(유리 판넬)만 면을 가진다
- **상세 배너는 뷰포트 폭을 통째로 덮는다.** `fixed` + `-z-10`으로 헤더·사이드바 뒤를 지난다.
  라이브러리 레이아웃이 `overflow-hidden`이라 음수 마진으로는 못 뚫는다.
  fixed가 스크롤에 못박히는 건 `onScroll`에서 `translateY(-scrollTop)`으로 푼다 —
  걷히는 게 아니라 **위로 밀려 올라가 사라진다**
- **상세 헤더 순서는 상태 → 제목 → (별점·장르)**, 커버 아래쪽에 바닥을 맞춘다
- **개인 장르를 따로 표시하지 않는다.** 마스터를 *덮어쓰는* 값이라 `resolved.genres` 하나면 된다.
  나란히 두면 덮어쓰기가 아닌 것처럼 읽힌다 (필터도 같은 이유로 이름 기준이다)
- **`(app)` 구역은 비로그인이면 `/login?next=…`으로 보낸다.** 껍데기만 남은 화면보다 낫다.
  판정 중에도 아무것도 안 그린다 — 빈 목록이 스쳤다 사라지면 어수선하다.
  **이건 UX일 뿐이고 방어선은 서버의 401/403이다**
- **body는 `overflow: hidden`.** 스크롤은 각 화면의 컨테이너가 가진다
- ⚠️ **스크롤 컨테이너에 `pt-16`(헤더 높이)을 주지 않는다.** 헤더 아래에서 스크롤 영역이
  시작하면 올라간 콘텐츠가 그 경계에서 **잘려** 답답해 보인다. 컨테이너는 전체 높이를 쓰고
  안쪽 콘텐츠에 패딩을 줘야 투명한 헤더 뒤로 지나간다
- **`type="number"`를 쓰지 않는다.** 브라우저가 붙이는 위/아래 스피너를 어두운 테마에
  맞출 방법이 없다. `inputMode="numeric"`으로 모바일 키패드만 챙긴다
