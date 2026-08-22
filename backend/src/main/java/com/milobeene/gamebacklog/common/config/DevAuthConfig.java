package com.milobeene.gamebacklog.common.config;

import com.milobeene.gamebacklog.auth.web.DevHeaderAuthenticationFilter;
import com.milobeene.gamebacklog.member.repository.MemberRepository;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

/**
 * dev·test에서만 존재하는 이행 장치. prod 프로필에는 이 빈들이 아예 만들어지지 않는다.
 */
@Configuration
@Profile({"dev", "test"})
public class DevAuthConfig {

    @Bean
    public DevHeaderAuthenticationFilter devHeaderAuthenticationFilter(MemberRepository memberRepository) {
        return new DevHeaderAuthenticationFilter(memberRepository);
    }

    /**
     * 부트는 컨테이너에 있는 Filter 타입 빈을 **서블릿 필터로 자동 등록**한다.
     * 그러면 시큐리티 체인 밖에서 한 번 더 돌고, 그 뒤 SecurityContextHolderFilter가
     * 컨텍스트를 덮어써서 효과가 사라진다. 자동 등록을 꺼서 시큐리티 체인 안에서만 돌게 한다.
     */
    @Bean
    public FilterRegistrationBean<DevHeaderAuthenticationFilter> devHeaderFilterRegistration(
            DevHeaderAuthenticationFilter filter) {
        FilterRegistrationBean<DevHeaderAuthenticationFilter> registration =
                new FilterRegistrationBean<>(filter);
        registration.setEnabled(false);
        return registration;
    }
}
