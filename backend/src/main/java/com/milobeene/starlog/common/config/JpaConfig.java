package com.milobeene.starlog.common.config;

import com.milobeene.starlog.common.repository.BaseRepositoryImpl;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

@Configuration
@EnableJpaAuditing //AuditingEntityListener를 작동하게 하는 스위치
@EnableJpaRepositories(
        // 이 애노테이션을 직접 달면 부트의 자동 설정이 꺼진다.
        // basePackages 기본값은 이 클래스가 있는 패키지(common.config)라서 반드시 적어야 한다
        basePackages = "com.milobeene.starlog",
        repositoryBaseClass = BaseRepositoryImpl.class)
public class JpaConfig {

}
