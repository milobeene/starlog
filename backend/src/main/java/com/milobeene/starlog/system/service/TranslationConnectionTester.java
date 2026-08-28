package com.milobeene.starlog.system.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

/**
 * 번역 키가 살아 있는지 본다 — **글자를 한 자도 안 쓰고** (2026-08-28).
 *
 * ## 왜 `languages`를 부르나
 *
 * 값이 매겨지는 건 **번역하려고 보낸 글자**다. `languages`(지원 언어 목록)는 보낼 글자가
 * 아예 없고, 할당량도 따로 있다 — 사용자가 콘솔에서 본 목록에
 * `v2 and v3 requests for the list of supported languages per minute: 300`이 별도로 있었다.
 *
 * **이게 중요한 이유** — IGDB나 스토리지는 테스트가 공짜지만, 번역은 잘못 만들면
 * **버튼 한 번이 곧 돈**이다. "ko로 번역해보기"로 시험했다면 누를 때마다 글자를 태웠을 것이다.
 *
 * ## 무엇을 알아내나
 *
 * 키가 유효한지, 그 키로 이 API를 부를 수 있는지(제한이 맞게 걸렸는지) 둘 다 걸린다.
 * 키를 Translation API로 제한해두면 다른 API 키를 잘못 넣었을 때 여기서 403이 난다
 */
@Slf4j
@Service
public class TranslationConnectionTester {

    private static final String LANGUAGES_URL =
            "https://translation.googleapis.com/language/translate/v2/languages";

    private final RestClient client = RestClient.create();

    /**
     * @param apiKey 저장하지 않은 값으로 시험한다 — 저장부터 하면 틀린 키가 들어간 뒤에야 안다
     */
    public Result test(String apiKey) {
        if (apiKey == null || apiKey.isBlank()) {
            return new Result(false, "키를 입력해 주세요");
        }

        try {
            /*
             * `target=ko`를 주면 언어 이름까지 한국어로 돌려준다. 굳이 안 줘도 되지만,
             * 주면 **응답이 실제로 우리가 원하는 언어를 아는지**까지 한 번에 확인된다
             */
            LanguagesResponse body = client.get()
                    .uri(LANGUAGES_URL + "?key={key}&target=ko", apiKey)
                    .retrieve()
                    .body(LanguagesResponse.class);

            int count = body == null || body.data() == null || body.data().languages() == null
                    ? 0 : body.data().languages().size();
            if (count == 0) {
                return new Result(false, "응답이 비어 있습니다. 키를 다시 확인해 주세요");
            }
            return new Result(true, "확인했습니다 (지원 언어 %d개)".formatted(count));

        } catch (org.springframework.web.client.HttpClientErrorException e) {
            /*
             * 구글의 메시지를 **그대로 옮기지 않는다.** "API key not valid. Please pass a valid
             * API key."는 맞는 말이지만 무엇을 고쳐야 하는지는 안 알려준다.
             * 대신 실제로 겪는 세 가지를 갈라준다
             */
            int status = e.getStatusCode().value();
            log.warn("번역 키 확인 실패 — {}", status);
            return new Result(false, switch (status) {
                case 400 -> "키 형식이 올바르지 않습니다";
                case 403 -> "이 키로는 번역 API를 부를 수 없습니다. "
                        + "키 제한에 Cloud Translation API가 들어 있는지, "
                        + "프로젝트에 API가 사용 설정됐는지 확인해 주세요";
                case 429 -> "할당량을 넘었습니다. 구글 콘솔에서 하루 한도를 확인해 주세요";
                default -> "구글이 %d로 응답했습니다".formatted(status);
            });
        } catch (Exception e) {
            log.warn("번역 키 확인 실패", e);
            return new Result(false, "구글에 연결하지 못했습니다. 인터넷을 확인해 주세요");
        }
    }

    public record Result(boolean ok, String message) {}

    /* 응답에서 우리가 쓰는 부분만 받는다 — 나머지는 잭슨이 무시한다 */
    record LanguagesResponse(Data data) {
        record Data(java.util.List<Language> languages) {}
        record Language(String language, String name) {}
    }
}
