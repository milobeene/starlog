package com.milobeene.starlog.common.quota;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/** 다른 Properties들과 같은 방식 — 쓰는 곳 옆에서 등록한다 (IgdbClientConfig·StorageConfig와 동일) */
@Configuration
@EnableConfigurationProperties(QuotaProperties.class)
public class QuotaConfig {
}
