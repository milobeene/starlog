package com.milobeene.starlog.system.service;

import com.milobeene.starlog.common.exception.ExternalApiException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

import java.util.List;

/**
 * Google Cloud Translation v2를 부른다 (2026-08-28).
 *
 * ## v3가 아니라 v2인 이유
 *
 * v3(Advanced)는 서비스 계정과 프로젝트 번호가 필요하다. v2는 **API 키 하나**면 되고,
 * 이 앱은 "각자 자기 인프라의 주인"이라 사용자가 키 하나만 넣으면 끝나야 한다.
 * 번역 품질은 같은 모델(NMT)을 쓴다.
 *
 * ## 본문으로 보낸다
 *
 * 소개문이 3,000자를 넘길 수 있는데 쿼리 문자열로 보내면 URL 길이 제한에 걸린다.
 * 키만 쿼리에 남기고 `q`는 폼 본문으로 보낸다 — 구글이 둘 다 받는다
 */
@Slf4j
@Service
public class TranslationClient {

    private static final String URL = "https://translation.googleapis.com/language/translate/v2";

    private final RestClient client = RestClient.create();

    /**
     * @param texts 원문 조각들. **글자 수는 부르는 쪽이 이미 셌다** — 여기서 다시 세면
     *              한도 검사와 실제 호출이 서로 다른 숫자를 볼 수 있다
     * @return 같은 순서의 한국어 번역
     */
    public List<String> toKorean(String apiKey, List<String> texts) {
        MultiValueMap<String, String> body = new LinkedMultiValueMap<>();
        /*
         * ⚠️ **`q`를 여러 개 보낸다.** v2는 조각을 여러 개 받아 **같은 순서로** 돌려준다.
         * 소개문과 스토리라인을 하나로 이어 붙였다면 구분자를 넣고 다시 쪼개야 하는데,
         * 번역기가 그 구분자를 번역하거나 옮겨버리면 **경계가 어긋난다**
         */
        texts.forEach(text -> body.add("q", text));
        body.add("target", "ko");
        /*
         * `format=text`가 중요하다. 기본값이 `html`이라 원문의 `<`, `&` 같은 글자가
         * **이스케이프된 채로 돌아온다** — `&#39;`가 화면에 그대로 보인다
         */
        body.add("format", "text");
        /*
         * `source`를 안 준다. IGDB 소개문이 늘 영어인 건 아니고(일본 게임에 일본어가 섞인다),
         * 안 주면 구글이 알아서 판정한다. **판정에 추가 요금이 붙지 않는다**
         */

        try {
            Response found = client.post()
                    .uri(URL + "?key={key}", apiKey)
                    .body(body)
                    .retrieve()
                    .body(Response.class);

            List<Translation> translations = found == null || found.data() == null
                    ? List.of() : found.data().translations();
            /*
             * ⚠️ **개수가 맞아야 한다.** 순서로 짝을 짓는데 하나라도 빠지면 스토리라인 번역이
             * 소개문 자리에 들어간다 — 화면에는 멀쩡해 보이면서 내용이 뒤바뀐다
             */
            if (translations.size() != texts.size()) {
                throw new ExternalApiException(ExternalApiException.Service.TRANSLATE,
                        "번역 결과의 개수가 맞지 않습니다");
            }
            return translations.stream().map(Translation::translatedText).toList();

        } catch (org.springframework.web.client.HttpClientErrorException e) {
            /*
             * 구글이 거절한 것도 **글자를 세었을 수 있다** — 부르는 쪽이 실패로 기록하도록
             * 예외를 그대로 올린다. 여기서 삼키면 사용량이 실제보다 적게 남는다
             */
            log.warn("번역 실패 — {}", e.getStatusCode().value());
            throw new ExternalApiException(ExternalApiException.Service.TRANSLATE, switch (e.getStatusCode().value()) {
                case 400 -> "번역 요청이 올바르지 않습니다";
                case 403 -> "이 키로는 번역 API를 부를 수 없습니다";
                case 429 -> "구글의 할당량을 넘었습니다. 콘솔에서 하루 한도를 확인해 주세요";
                default -> "구글이 %d로 응답했습니다".formatted(e.getStatusCode().value());
            });
        }
    }

    record Response(Data data) {}
    record Data(List<Translation> translations) {}
    record Translation(String translatedText, String detectedSourceLanguage) {}
}
