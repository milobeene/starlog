/**
 * 연결 테스트 — 자바 `IgdbConnectionTester`·`TranslationConnectionTester`.
 *
 * **저장하지 않은 값으로 시험한다.** 저장부터 하면 틀린 키가 들어간 뒤에야 알게 되고 그 사이 검색이 다 502다.
 * 둘 다 호출 기록(`api_call_log`)을 남기지 않는다 — 자바도 안 남겼다.
 */
import { IGDB, RestFailure, restCall, tokenUrl } from "../game/igdb";
import { isJavaBlank, javaStrip } from "./service";

export interface IgdbTestResult { ok: boolean; tokenIssued: boolean; searchWorks: boolean; message: string }


/**
 * 단계를 나눠 준다 — "실패했습니다" 한 줄이면 키가 틀린 건지 인터넷이 없는 건지 알 수 없다.
 *   1. 토큰 발급 (Twitch) — 키가 맞나
 *   2. 검색 한 번 (IGDB) — 실제로 도나
 * 자바는 부트 기본 RestClient라 타임아웃이 없었다 — 여기도 두지 않는다
 */
export async function testIgdb(clientId: string | null, clientSecret: string | null): Promise<IgdbTestResult> {
  if (isJavaBlank(clientId) || isJavaBlank(clientSecret)) {
    return { ok: false, tokenIssued: false, searchWorks: false, message: "클라이언트 ID와 시크릿을 모두 입력해 주세요" };
  }
  const id = javaStrip(clientId!), secret = javaStrip(clientSecret!);

  let token: unknown;
  try {
    const r = await restCall(tokenUrl(id, secret), { method: "POST", headers: { Accept: "application/json" } }, null) as Record<string, unknown> | null;
    token = r === null ? null : r.access_token ?? null;
  } catch (e) {
    if (!(e instanceof RestFailure)) throw e;
    console.log("IGDB 토큰 발급 실패 — 테스트", e.message);
    return { ok: false, tokenIssued: false, searchWorks: false, message: "키가 거부되었습니다. 클라이언트 ID와 시크릿을 확인해 주세요" };
  }
  // 자바 `(String) response.get("access_token")` — 문자열이 아니면 ClassCastException(500)이었다
  if (token !== null && typeof token !== "string") throw new Error("access_token이 문자열이 아니다");
  if (token === null) return { ok: false, tokenIssued: false, searchWorks: false, message: "토큰을 받지 못했습니다" };

  try {
    const body = await restCall(`${IGDB.baseUrl}/games`, {
      method: "POST",
      headers: { "Client-ID": id, Authorization: `Bearer ${token}`, "Content-Type": "text/plain", Accept: "application/json" },
      body: "fields name; limit 1;",
    }, null);
    if (body !== null && !Array.isArray(body)) throw new RestFailure(null, "응답 해석 실패");
  } catch (e) {
    if (!(e instanceof RestFailure)) throw e;
    console.log("IGDB 검색 실패 — 테스트", e.message);
    return { ok: false, tokenIssued: true, searchWorks: false, message: "키는 맞지만 게임 검색이 되지 않습니다. 잠시 후 다시 시도해 주세요" };
  }
  return { ok: true, tokenIssued: true, searchWorks: true, message: "연결에 성공했습니다" };
}

const LANGUAGES_URL = "https://translation.googleapis.com/language/translate/v2/languages";

/**
 * 번역 키 확인 — **글자를 한 자도 안 쓴다.** `languages`는 보낼 글자가 없고 할당량도 따로다.
 * 번역은 시험 삼아 한 번 부르는 것도 돈이라, 무엇으로 시험하느냐가 설계의 일부다
 */
export async function testTranslate(apiKey: string | null): Promise<{ ok: boolean; message: string }> {
  if (isJavaBlank(apiKey)) return { ok: false, message: "키를 입력해 주세요" };
  try {
    const res = await fetch(`${LANGUAGES_URL}?key=${encodeURIComponent(apiKey!)}&target=ko`, { headers: { Accept: "application/json" } });
    if (res.status >= 400 && res.status < 500) {
      // 구글 문구를 그대로 옮기지 않는다 — 무엇을 고쳐야 하는지 안 알려준다. 실제로 겪는 셋을 갈라준다
      console.warn(`번역 키 확인 실패 — ${res.status}`);
      const message = ({
        400: "키 형식이 올바르지 않습니다",
        403: "이 키로는 번역 API를 부를 수 없습니다. 키 제한에 Cloud Translation API가 들어 있는지, 프로젝트에 API가 사용 설정됐는지 확인해 주세요",
        429: "할당량을 넘었습니다. 구글 콘솔에서 하루 한도를 확인해 주세요",
      } as Record<number, string>)[res.status] ?? `구글이 ${res.status}로 응답했습니다`;
      return { ok: false, message };
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const body = text.trim() === "" ? null : JSON.parse(text) as { data?: { languages?: unknown[] | null } | null } | null;
    const n = body?.data?.languages?.length ?? 0;
    if (n === 0) return { ok: false, message: "응답이 비어 있습니다. 키를 다시 확인해 주세요" };
    return { ok: true, message: `확인했습니다 (지원 언어 ${n}개)` };
  } catch (e) {
    console.warn("번역 키 확인 실패", e);
    return { ok: false, message: "구글에 연결하지 못했습니다. 인터넷을 확인해 주세요" };
  }
}
