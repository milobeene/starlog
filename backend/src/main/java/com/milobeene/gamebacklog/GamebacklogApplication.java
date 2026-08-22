package com.milobeene.gamebacklog;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

// @Scheduled를 실제로 돌게 하는 스위치. 없으면 애노테이션만 있고 아무 일도 안 일어난다
@EnableScheduling
@SpringBootApplication
public class GamebacklogApplication {

	public static void main(String[] args) {
		SpringApplication.run(GamebacklogApplication.class, args);
	}

}
