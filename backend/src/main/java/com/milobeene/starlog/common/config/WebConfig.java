package com.milobeene.starlog.common.config;

import com.milobeene.starlog.common.web.LoginMemberArgumentResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.List;

/**
 * WebMvcConfigurer는 스프링 MVC 기본 설정을 **덮어쓰지 않고 얹는** 확장 지점이다.
 * @EnableWebMvc를 붙이면 부트의 자동 설정이 통째로 꺼지므로 붙이지 않는다.
 *
 * 등록 순서 — 내가 추가한 리졸버는 애노테이션 기반 기본 리졸버들 뒤,
 * 마지막 폴백(애노테이션 없는 단순 타입을 쿼리 파라미터로 보는 것) 앞에 들어간다.
 * 그래서 `@LoginMember Long memberId`가 `?memberId=` 로 새지 않는다
 */
@Configuration
@RequiredArgsConstructor
public class WebConfig implements WebMvcConfigurer {

    private final LoginMemberArgumentResolver loginMemberArgumentResolver;

    @Override
    public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
        resolvers.add(loginMemberArgumentResolver);
    }
}
