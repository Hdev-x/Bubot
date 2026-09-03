package com.tj.app;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

/** ============================================================
 * [클래스 읽기] Spring Boot 애플리케이션의 진입점(Entry Point).
 *
 * @SpringBootApplication → 아래 세 가지를 한 번에 처리하는 합성 어노테이션:
 *   - @SpringBootConfiguration : 이 클래스를 설정 클래스로 등록
 *   - @EnableAutoConfiguration : classpath를 보고 필요한 Bean을 자동으로 설정
 *   - @ComponentScan           : 이 패키지(com.tj.app) 하위의 모든 @Component,
 *                                @Controller, @Service, @Repository를 Bean으로 등록
 * ============================================================ */
@SpringBootApplication
@EnableScheduling
public class TpmApplication {

	/** ============================================================
	 * 프로그램 시작점. JVM이 가장 먼저 이 메서드를 호출한다.
	 * SpringApplication.run() → Spring 컨테이너를 초기화하고 내장 Tomcat을 실행한다.
	 * ============================================================ */
	public static void main(String[] args) {
		SpringApplication.run(TpmApplication.class, args);
	}

}
