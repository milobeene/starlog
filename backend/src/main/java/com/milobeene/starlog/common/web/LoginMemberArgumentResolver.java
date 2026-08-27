package com.milobeene.starlog.common.web;

import com.milobeene.starlog.member.service.OwnerService;
import lombok.RequiredArgsConstructor;
import org.springframework.core.MethodParameter;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

/**
 * `@LoginMember` 파라미터에 실제 값을 채워 넣는다.
 *
 * 스프링이 개입하는 지점 — 컨트롤러 메서드를 호출하기 직전, 스프링은 파라미터를
 * 하나씩 훑으며 "이걸 처리할 수 있는 리졸버"를 찾는다(supportsParameter).
 * 찾으면 그 리졸버의 resolveArgument() 반환값이 그대로 인자로 들어간다.
 *
 * ## v1.0에서 여기가 인증을 대신한다
 *
 * **이 파일 하나가 이음매다.** `@LoginMember Long memberId`를 쓰는 컨트롤러가 18개인데
 * 값은 전부 여기를 지난다. 그래서 로그인을 통째로 걷어내면서도 **컨트롤러 시그니처가
 * 한 줄도 안 바뀌었다.** 애초에 그러려고 리졸버로 감쌌다
 * (I-3에서 헤더인증 → 시큐리티로 갈아탈 때도 마찬가지였다).
 *
 * ## 왜 헤더 경로가 아직 남아 있나 — 인증이 아니라 **테스트 지원 장치**다
 *
 * 컨트롤러 테스트 16파일 208줄이 `X-Member-Id`로 **특정 회원인 척**하며 돈다.
 * 특히 "남의 항목은 못 본다"를 지키는 소유권 테스트들이 그렇다.
 * 무조건 주인 id를 돌려주면 그 테스트가 전부 무의미해지고,
 * 쿼리에서 `member.id.eq(memberId)`를 빠뜨리는 실수를 잡아 주던 그물이 사라진다.
 *
 * **그래서 dev·test 프로필에서만 헤더를 본다.** 실사용(local-app) 빌드에는
 * 이 빈이 아예 안 올라가므로 주인 경로 하나뿐이다.
 */
@Component
@RequiredArgsConstructor
public class LoginMemberArgumentResolver implements HandlerMethodArgumentResolver {

    /** 테스트가 "누구인 척"할 때 쓰는 헤더. dev·test에서만 읽힌다 */
    public static final String TEST_MEMBER_HEADER = "X-Member-Id";

    private final OwnerService ownerService;
    private final MemberIdOverride override;

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
        Long overridden = override.from(webRequest);
        return overridden != null ? overridden : ownerService.ownerId();
    }
}
