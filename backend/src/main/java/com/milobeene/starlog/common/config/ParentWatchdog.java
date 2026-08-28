package com.milobeene.starlog.common.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.ApplicationContext;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.io.IOException;

/**
 * 부모(일렉트론)가 죽으면 **스스로 곱게 내려간다** (2026-08-28).
 *
 * ## 왜 필요한가
 *
 * 일렉트론이 비정상으로 죽으면(강제 종료·크래시) **자바는 살아남는다.** 직접 확인했다 —
 * 부모를 SIGKILL하니 자바의 부모가 1번(launchd)으로 바뀐 채 계속 돌았다.
 *
 * 남아 있는 것 자체는 견딜 만하다. H2가 파일 잠금을 쥐고 있어 다음 실행은 `DB_IN_USE`로
 * 깨끗하게 막히고, MVStore는 크래시에도 견디게 만들어져 있다.
 *
 * **문제는 백업이다.** 일렉트론의 `stopBackend()`는 **자기가 띄운 백엔드만** 안다.
 * 고아가 파일을 쥐고 있는 줄 모르고 `autoBackup`이 그냥 복사하면, 쓰는 중인 파일을 뜬
 * **찢어진 백업**이 남는다. 그걸 되돌리면 손상된 세이브파일이 되고, 사람 눈에는
 * "백업까지 깨져 있다"로 보인다.
 *
 * ## 어떻게 아나 — stdin이 닫히는 것으로 안다
 *
 * 부모가 `stdio`의 첫 칸을 파이프로 열어두면, **부모가 죽는 순간 그 파이프의 쓰는 쪽이
 * 닫혀서** 우리 `read()`가 -1(EOF)을 돌려준다. 신호도, 폴링도, 부모 PID 추적도 필요 없다 —
 * 운영체제가 알려주는 셈이다.
 *
 * ⚠️ **일렉트론이 띄울 때만 켠다** (`--starlog.parent-watch=true`). `bootRun`으로 띄우면
 * stdin이 터미널이라, 개발자가 Ctrl+D를 누르는 순간 서버가 꺼지는 황당한 일이 난다.
 */
@Slf4j
@Component
@ConditionalOnProperty("starlog.parent-watch")
public class ParentWatchdog {

    private final ApplicationContext context;

    public ParentWatchdog(ApplicationContext context) {
        this.context = context;
    }

    /**
     * 다 뜬 뒤에 감시를 시작한다.
     *
     * 기동 중에 시작하면 **부팅이 끝나기도 전에 종료를 부를 수** 있고, 그때는 닫을 것이
     * 반쯤만 만들어져 있다
     */
    @EventListener(ApplicationReadyEvent.class)
    public void watch() {
        Thread thread = new Thread(this::readUntilEof, "parent-watchdog");
        /*
         * 데몬으로 둔다 — 이 스레드가 살아 있다고 JVM이 안 끝나면 안 된다.
         * 우리가 종료를 부르는 쪽이지, 종료를 막는 쪽이 아니다
         */
        thread.setDaemon(true);
        thread.start();
    }

    private void readUntilEof() {
        try {
            /*
             * 부모가 살아 있는 동안은 여기서 조용히 막혀 있다. 아무것도 안 읽고 아무것도 안 쓴다 —
             * 우리가 보는 건 "이 파이프가 닫혔는가" 하나뿐이다
             */
            while (System.in.read() >= 0) {
                // 부모가 뭔가 보냈다. 지금은 쓸 데가 없지만 EOF가 아니므로 계속 기다린다
            }
        } catch (IOException e) {
            log.debug("부모와의 통로가 끊겼습니다", e);
        }

        log.info("부모 프로세스가 사라졌습니다 — 스스로 종료합니다");
        /*
         * `System.exit`이 아니라 컨텍스트를 닫는다. 그래야 스프링의 종료 절차가 돌아
         * **커넥션 풀이 닫히고 H2가 자기 파일을 제대로 마무리한다.** 그게 이 클래스의 목적이다.
         *
         * 별도 스레드에서 부르는 것도 의도한 것이다 — 종료 훅 안에서 종료를 부르면 맞물린다
         */
        int code = org.springframework.boot.SpringApplication.exit(context, () -> 0);
        System.exit(code);
    }
}
