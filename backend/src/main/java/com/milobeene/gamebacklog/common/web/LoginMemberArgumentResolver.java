package com.milobeene.gamebacklog.common.web;

import com.milobeene.gamebacklog.auth.security.MemberPrincipal;
import org.springframework.core.MethodParameter;
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
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
 *
 * **I-3에서 교체됨.** 헤더를 직접 읽던 것을 SecurityContext에서 꺼내는 것으로 바꿨다.
 * 컨트롤러 시그니처(`@LoginMember Long memberId`)는 하나도 바뀌지 않았다 — 이걸 노리고
 * 애초에 리졸버로 감쌌다.
 */
@Component
public class LoginMemberArgumentResolver implements HandlerMethodArgumentResolver {

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

        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();

        // 로그인 안 한 요청도 여기까지 오긴 한다 — 익명 사용자로 채워져 있기 때문이다(I-1에서 관찰).
        // 그래서 "null이냐"가 아니라 "우리 principal이냐"를 봐야 한다
        if (authentication == null || !(authentication.getPrincipal() instanceof MemberPrincipal principal)) {
            // AuthenticationException 계열이라 ExceptionTranslationFilter가 잡아
            // EntryPoint(401 JSON)로 넘긴다. @RestControllerAdvice가 아니라 필터가 처리한다
            throw new AuthenticationCredentialsNotFoundException("로그인이 필요합니다");
        }

        return principal.getMemberId();
    }
}
