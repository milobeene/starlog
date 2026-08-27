package com.milobeene.starlog.system.service;

import com.milobeene.starlog.game.client.IgdbProperties;
import com.milobeene.starlog.system.domain.AppSetting;
import com.milobeene.starlog.system.repository.AppSettingRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.Map;

/**
 * 앱 설정 읽고 쓰기 (2026-08-28).
 *
 * ## 캐시를 안 둔다
 *
 * IGDB 호출마다 한 줄 조회가 붙지만, 그 호출은 **어차피 네트워크를 타는 260ms짜리**다.
 * 캐시를 두면 "설정을 바꿨는데 안 먹는다"를 만들 위험이 생기고, 그게 이 기능의 존재 이유
 * (앱 안에서 바꾸면 즉시 먹는다)를 정면으로 깬다
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AppSettingService {

    public static final String IGDB_CLIENT_ID = "igdb.clientId";
    public static final String IGDB_CLIENT_SECRET = "igdb.clientSecret";

    private final AppSettingRepository repository;
    /** 부팅 설정. DB에 아무것도 없을 때의 폴백이다 — `bootRun` 개발 경로가 그대로 산다 */
    private final IgdbProperties bootProperties;

    public Map<String, String> all() {
        Map<String, String> values = new HashMap<>();
        repository.findAll().forEach(s -> values.put(s.getKey(), s.getValue()));
        return values;
    }

    /**
     * IGDB 자격증명.
     *
     * **DB가 먼저, 없으면 부팅 설정.** 순서가 이래야 앱에서 바꾼 값이 이긴다 —
     * 반대로 두면 `application-local.yml`에 키가 있는 개발 환경에서 앱 설정이 무시된다
     */
    public IgdbCredentials igdb() {
        Map<String, String> values = all();
        String id = blankToNull(values.get(IGDB_CLIENT_ID));
        String secret = blankToNull(values.get(IGDB_CLIENT_SECRET));

        if (id == null || secret == null) {
            return new IgdbCredentials(bootProperties.clientId(), bootProperties.clientSecret());
        }
        return new IgdbCredentials(id, secret);
    }

    public record IgdbCredentials(String clientId, String clientSecret) {
        public boolean isPresent() {
            return clientId != null && !clientId.isBlank()
                    && clientSecret != null && !clientSecret.isBlank();
        }
    }

    /**
     * 값을 넣거나 바꾼다.
     *
     * ⚠️ `save()`가 아니라 **찾아서 바꾸거나 새로 넣는다** — `BaseRepository`에 `save()`가
     * 없는 이유가 그것이다(준영속 엔티티에 merge가 돌면 설계 원칙 5와 충돌한다)
     */
    @Transactional
    public void put(String key, String value) {
        repository.findById(key)
                .ifPresentOrElse(
                        setting -> setting.update(value),
                        () -> repository.persist(AppSetting.of(key, value)));
    }

    private static String blankToNull(String value) {
        return (value == null || value.isBlank()) ? null : value;
    }
}
