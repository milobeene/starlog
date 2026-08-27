package com.milobeene.starlog;

import com.milobeene.starlog.common.diagnostic.StartupDiagnostic;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

// @Scheduled를 실제로 돌게 하는 스위치. 없으면 애노테이션만 있고 아무 일도 안 일어난다
@EnableScheduling
@SpringBootApplication
public class StarlogApplication {

	public static void main(String[] args) {
		/*
		 * 스프링보다 먼저 DB를 본다 (v1.0 5단계).
		 *
		 * `--starlog.diagnose=true`일 때만 돈다 — 일렉트론이 띄울 때다.
		 * 여기서 죽으면 `STARLOG_DIAGNOSTIC: <코드>` 한 줄을 남기므로,
		 * 일렉트론이 그걸 읽어 한글 안내를 띄운다. 스프링이 조립되기 전이라
		 * "비번이 틀린 건지 호스트가 없는 건지"가 SQLState로 그대로 나온다
		 */
		StartupDiagnostic.runOrExit(args);

		SpringApplication.run(StarlogApplication.class, args);
	}

}
