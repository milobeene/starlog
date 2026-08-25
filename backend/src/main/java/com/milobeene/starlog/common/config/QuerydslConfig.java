package com.milobeene.starlog.common.config;

import com.querydsl.jpa.impl.JPAQueryFactory;
import jakarta.persistence.EntityManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * QueryDSL 진입점 (L-1).
 *
 * JPAQueryFactory는 EntityManager를 감싸는 얇은 객체다. 싱글턴 빈으로 둬도 안전한 이유 —
 * 주입되는 EntityManager가 실제로는 **프록시**라, 호출 시점의 트랜잭션에 묶인
 * 진짜 EntityManager로 넘겨준다. 스레드마다 다른 영속성 컨텍스트를 쓰게 된다
 */
@Configuration
public class QuerydslConfig {

    @Bean
    public JPAQueryFactory jpaQueryFactory(EntityManager em) {
        return new JPAQueryFactory(em);
    }
}
