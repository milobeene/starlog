package com.milobeene.gamebacklog.auth.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 발송 수단을 **설정값 하나로** 가른다.
 *
 * 키가 있으면 Resend, 없으면 콘솔 출력. 프로필로 가르지 않는 이유 —
 * 자격증명이 없는 CI·로컬에서도 그대로 떠야 하고, 반대로 dev에서 실제 발송을
 * 시험해 보고 싶을 때도 프로필을 바꾸지 않고 키만 꽂으면 된다
 */
@Slf4j
@Configuration
@EnableConfigurationProperties(MailProperties.class)
public class MailConfig {

    @Bean
    public AuthMailSender authMailSender(MailProperties properties) {
        if (properties.configured()) {
            log.info("인증 메일: Resend로 발송합니다 (from={})", properties.from());
            return new ResendAuthMailSender(properties);
        }

        log.warn("인증 메일: 자격증명이 없어 콘솔에만 출력합니다 (app.mail.api-key)");
        return new LoggingAuthMailSender();
    }
}
