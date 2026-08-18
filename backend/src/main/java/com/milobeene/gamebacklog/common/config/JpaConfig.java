package com.milobeene.gamebacklog.common.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;

@Configuration
@EnableJpaAuditing //AuditingEntityListener를 작동하게 하는 스위치
public class JpaConfig {

}
