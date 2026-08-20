package com.milobeene.gamebacklog.common.config;

import com.milobeene.gamebacklog.member.domain.Member;
import com.milobeene.gamebacklog.platform.domain.Device;
import com.milobeene.gamebacklog.platform.domain.Emulator;
import com.milobeene.gamebacklog.platform.domain.Platform;
import jakarta.persistence.EntityManager;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@Profile("!test")   // 테스트는 자기 데이터를 직접 만든다. 매 컨텍스트마다 마스터 INSERT가 나갈 이유가 없다
@RequiredArgsConstructor
public class DataInitializer implements ApplicationRunner {

    private final InitService initService;   // ← 자기 자신이 아닌 별도 빈을 주입

    @Override
    public void run(ApplicationArguments args) {
        initService.initMasters();
        initService.initTestMember();
    }

    @Component
    @Profile("!test")
    @RequiredArgsConstructor
    static class InitService {

        private final EntityManager em;

        @Transactional
        public void initMasters() {
            if (em.createQuery("select count(p) from Platform p", Long.class)
                    .getSingleResult() > 0) {
                return;   // 이미 있으면 건너뜀
            }

            List.of("Steam", "Nintendo", "Epic Games")
                    .forEach(name -> em.persist(Platform.of(name)));

            List.of("Windows PC", "MacBook Air M1", "iPhone 14",
                            "Nintendo 3DS XL", "Nintendo Switch", "Nintendo Switch Lite")
                    .forEach(name -> em.persist(Device.of(name)));

            List.of("Ryujinx", "Eden", "Azahar", "Delta")
                    .forEach(name -> em.persist(Emulator.of(name)));
        }

        @Transactional
        public void initTestMember() {
            if (em.createQuery("select count(m) from Member m", Long.class)
                    .getSingleResult() > 0) {
                return;
            }
            em.persist(Member.signUpWithEmail("milo.beene@gmail.com", "1111", "Milo Beene"));
        }
    }
}
