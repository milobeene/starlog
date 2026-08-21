package com.milobeene.gamebacklog.common.web;

import com.milobeene.gamebacklog.common.exception.InvalidInputException;
import org.springframework.core.MethodParameter;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

/**
 * @LoginMember 파라미터에 실제 값을 채워 넣는다.
 *
 * 스프링이 개입하는 지점 — 컨트롤러 메서드를 호출하기 직전, 스프링은 파라미터를
 * 하나씩 훑으며 "이걸 처리할 수 있는 리졸버"를 찾는다(supportsParameter).
 * 찾으면 그 리졸버의 resolveArgument() 반환값이 그대로 인자로 들어간다.
 * @RequestBody·@PathVariable도 전부 같은 방식으로 동작하는 리졸버들이다.
 *
 * **Phase 3 이전 임시.** 헤더를 그냥 믿는다. 인증이 아예 없는 단계라 어쩔 수 없고,
 * 그래서 이 클래스는 통째로 갈아끼울 것을 전제로 짰다
 */
@Component
public class LoginMemberArgumentResolver implements HandlerMethodArgumentResolver {

    private static final String HEADER = "X-Member-Id";

    /**
     * 타입까지 같이 보는 이유 — 애노테이션만 검사하면 String 파라미터에 잘못 붙였을 때
     * ClassCastException이 런타임에 터진다. 여기서 거르면 아예 매칭이 안 돼 원인이 드러난다
     */
    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return parameter.hasParameterAnnotation(LoginMember.class)
                && Long.class.equals(parameter.getParameterType());
    }

    @Override
    public Object resolveArgument(MethodParameter parameter,
                                  ModelAndViewContainer mavContainer,
                                  NativeWebRequest webRequest,
                                  WebDataBinderFactory binderFactory) {

        String raw = webRequest.getHeader(HEADER);
        if (raw == null || raw.isBlank()) {
            throw new InvalidInputException(HEADER + " 헤더가 필요합니다");
        }

        try {
            return Long.valueOf(raw.strip());
        } catch (NumberFormatException e) {
            // 표준 예외를 우리 타입으로 바꿔 단다. 그래야 GlobalExceptionHandler가 400으로 답한다
            throw new InvalidInputException(HEADER + " 값이 숫자가 아닙니다: " + raw, e);
        }
    }
}
