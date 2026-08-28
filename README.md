# STARLOG

게임 백로그 관리 데스크탑 앱. **로그인이 없고, DB·스토리지·API 키를 내가 고른다.**

세이브파일 하나가 곧 내 기록 전부다 — 로컬 파일(H2)로 두든, 내 PostgreSQL에 올리든
둘 사이를 오갈 수 있다.

<img src="desktop/build/icon.png" width="88" alt="STARLOG">

---

## 설치

[Releases](https://github.com/milobeene/starlog/releases)에서 받는다.
**자바를 따로 깔 필요는 없다** — 런타임이 앱 안에 들어 있다.

| | 파일 |
|---|---|
| macOS (애플 실리콘) | `STARLOG-<버전>-arm64.dmg` |
| Windows (x64) | `STARLOG-Setup-<버전>.exe` |

### ⚠️ 처음 열 때 경고가 뜬다

**서명하지 않았기 때문이다.** 개인 습작이라 애플 개발자 프로그램(연 $99)과
윈도우 코드서명 인증서(연 20만원대, 하드웨어 토큰 필수)를 쓰지 않는다.
악성 코드라서가 아니라 **"애플/MS가 이 개발자를 모른다"**는 뜻이다.

**macOS** — `'STARLOG'을(를) 열지 않음`

1. 그 창에서 **[완료]** (⚠️ [휴지통으로 이동] 아님)
2. 앱을 `/응용 프로그램`으로 옮긴다
3. **시스템 설정 → 개인정보 보호 및 보안** → 아래로 스크롤 → **[확인 없이 열기]**

터미널이 편하면 한 줄로 끝난다:

```bash
xattr -dr com.apple.quarantine /Applications/STARLOG.app
```

**Windows** — `Windows에서 PC를 보호했습니다`

**[추가 정보] → [실행]**

두 경고 모두 **버전을 새로 받을 때마다** 다시 나온다. 받아온 파일에 격리 표시가
새로 붙기 때문이다.

---

## 쓰는 법

앱을 열면 **입구 화면**이 먼저 뜬다. 여기서 어디에 기록할지 고른다.

- **로컬 모드** — 세이브파일 하나(`.mv.db`)에 전부 들어간다. 아무 준비도 필요 없다
- **클라우드 모드** — 내 PostgreSQL(Neon 등)과 S3 호환 스토리지에 연결한다

게임 정보는 [IGDB](https://www.igdb.com/), 소개문 번역은
[Google Cloud Translation](https://cloud.google.com/translate)을 쓴다.
**키는 각자 발급받아 앱 안 `시스템 → 연결`에 넣는다.** 안 넣어도 앱은 돌아간다 —
검색과 번역만 안 될 뿐이다.

백업은 세이브파일을 열 때마다 자동으로(내용이 바뀌었을 때만), 그리고 입구 화면에서
수동으로 만든다. **30개 / 100MB**까지 보관한다.

---

## 직접 빌드하기

```bash
./tools/build-jre.sh        # 번들 JRE (Temurin 21). 처음 한 번은 내려받는다
./tools/build-desktop.sh    # 프론트 정적 빌드 → 백엔드 jar
cd desktop && npm install && npm start
```

배포물을 만들려면:

```bash
cd desktop && npx electron-builder --mac    # 또는 --win
```

⚠️ **JRE는 OS별이다.** 맥에서 윈도우용을 만들 수 없다 — 각 OS에서 빌드하거나
GitHub Actions에 맡긴다.

### 스택

Spring Boot 4.1 / Java 21 / H2·PostgreSQL / Next.js 16 / Electron

설계 문서는 [`docs/`](docs/)에 있다. `docs/v1.0-architecture.md`가 기준점이다.

---

## 라이선스

[MIT](LICENSE). 번들된 Eclipse Temurin은 GPLv2 with Classpath Exception을 따른다.
