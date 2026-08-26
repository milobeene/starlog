"""
프론트 타입 ↔ 백엔드 실제 응답 대조.

프론트에는 테스트가 없어서 DTO가 바뀌어도 조용히 어긋난다. 실제로 네 번 겪었다 —
카드의 coverImageId 누락, options의 Ref(id,name)를 platformId로 읽음,
검색 결과의 gameId가 null인데 그것만 보냄, 상세 DTO 전면 개편 미반영.

**정적 비교(자바 record 파싱)가 아니라 실제 JSON을 받아서** 키를 맞춘다 —
Jackson 직렬화·중첩·@JsonInclude까지 그대로 드러나기 때문이다.

사용법:
    1) 백엔드를 dev 프로필로 띄운다 (X-Member-Id 헤더 인증이 필요하다)
    2) python3 tools/contract-check.py

새 엔드포인트를 만들면 아래 ENDPOINTS에 한 줄 추가한다.
관리자 경로는 ADMIN 계정이 없으면 403이라 건너뛴다 — 그건 DTO를 눈으로 대조할 것
"""
import json, re, subprocess, sys, pathlib

# 포트를 인자로 바꿀 수 있다 — 이미 백엔드가 8080에 떠 있을 때 새 코드를 다른 포트에 띄워 대조한다
BASE = f"http://localhost:{sys.argv[1] if len(sys.argv) > 1 else '8080'}"
# 저장소 루트 기준 상대 경로. 절대 경로를 박아두면 폴더명이 바뀌는 순간 조용히 깨진다
TYPES = pathlib.Path(__file__).resolve().parent.parent / "frontend/src/lib/types.ts"

# 응답 경로 → 프론트 인터페이스. 배열은 [] 로 파고든다
ENDPOINTS = [
    ("/api/me",                    "MeResponse",       ""),
    ("/api/me/options",            "OptionsResponse",  ""),
    ("/api/backlog?size=1",        "PageResponse",     ""),
    ("/api/backlog?size=1",        "BacklogCard",      "items[]"),
    ("/api/backlog/facets",        "FacetsResponse",   ""),
    ("/api/backlog/names",         "BacklogName",      "[]"),
    ("/api/backlog/companies",     "CompanyDictionary",""),
    ("/api/backlog/2",             "BacklogDetail",    ""),
    ("/api/backlog/2",             "ResolvedInfo",     "resolved"),
    ("/api/backlog/2",             "CoverInfo",        "resolved.cover"),
    ("/api/backlog/2",             "MasterInfo",       "master"),
    ("/api/backlog/2",             "OverrideInfo",     "overrides"),
    ("/api/backlog/2",             "PersonalRecord",   "personalRecord"),
    ("/api/backlog/2",             "Playthrough",      "playthroughs[]"),
    ("/api/backlog/2",             "Acquisition",      "acquisitions[]"),
    ("/api/games?q=celeste",       "GameSearchResult", "[]"),
    ("/api/stats/genres",          "GenreDistribution","[]"),
    ("/api/stats/playtime",        "PlaytimeStats",    ""),
    ("/api/stats/spending/monthly","MonthlySpending",  ""),
    ("/api/admin/members?size=1",  "PageResponse",     ""),
    ("/api/admin/members?size=1",  "AdminMember",      "items[]"),
    ("/api/admin/audit-logs?size=1","AuditLog",        "items[]"),
    ("/api/me/quota",              "QuotaStatus",      "[]"),
    ("/api/backlog/deleted",       "DeletedEntry",     "[]"),
    ("/api/admin/system",          "SystemStatus",     ""),
]

def parse_interfaces(text):
    """interface 이름 → 필드명 집합. 중첩 { } 는 깊이로 건너뛴다"""
    out = {}
    for m in re.finditer(r"export interface (\w+)(?:<[^>]*>)?(?:\s+extends\s+[\w<>]+)?\s*\{", text):
        name, i, depth, fields = m.group(1), m.end(), 1, set()
        buf = ""
        while i < len(text) and depth > 0:
            c = text[i]
            if c == "{": depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0: break
            if depth == 1: buf += c
            i += 1
        for line in buf.splitlines():
            line = re.sub(r"/\*.*?\*/", "", line).strip()
            fm = re.match(r"^(\w+)\??\s*:", line)
            if fm: fields.add(fm.group(1))
        out[name] = fields
    return out

def fetch(path):
    raw = subprocess.run(
        ["curl", "-s", f"{BASE}{path}", "-H", "X-Member-Id: 1"],
        capture_output=True, text=True).stdout
    try: return json.loads(raw)
    except Exception: return None

def dig(data, path):
    for part in [p for p in path.split(".") if p]:
        if part.endswith("[]"):
            key = part[:-2]
            if key: data = data.get(key) if isinstance(data, dict) else None
            if not isinstance(data, list) or not data: return None
            data = data[0]
        else:
            if not isinstance(data, dict): return None
            data = data.get(part)
    return data

ifaces = parse_interfaces(TYPES.read_text())
problems, checked, skipped = [], 0, []

for path, iface, sub in ENDPOINTS:
    if iface not in ifaces:
        problems.append((iface, path, "타입 없음", f"types.ts에 {iface} 인터페이스가 없다"))
        continue
    body = fetch(path)
    if body is None:
        skipped.append((iface, path, "응답 없음/파싱 실패")); continue
    if isinstance(body, dict) and set(body.keys()) <= {"code", "message", "targetId", "reviveUrl"}:
        skipped.append((iface, path, f"에러 응답: {body.get('code')}")); continue
    node = dig(body, sub)
    if not isinstance(node, dict):
        skipped.append((iface, path + (f" [{sub}]" if sub else ""), "데이터 없음(빈 배열 등)")); continue

    actual, declared = set(node.keys()), ifaces[iface]
    checked += 1
    for k in sorted(actual - declared):
        problems.append((iface, path, "타입에 없음", f"서버가 주는데 프론트가 모름: {k}"))
    for k in sorted(declared - actual):
        problems.append((iface, path, "응답에 없음", f"프론트가 기대하는데 서버가 안 줌: {k}"))

print(f"검사 {checked}건\n")
if skipped:
    print("── 건너뜀 (데이터가 없어 확인 불가) ──")
    for i, p, why in skipped: print(f"  {i:20} {p}  — {why}")
    print()
if problems:
    print("── 불일치 ──")
    for iface, path, kind, msg in problems:
        print(f"  [{kind}] {iface}\n      {msg}\n      ← {path}")
else:
    print("불일치 없음")
