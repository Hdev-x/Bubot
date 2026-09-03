package com.bubot;

import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.servlet.support.SpringBootServletInitializer;

/** ============================================================
 * [클래스 읽기] 외부 Tomcat(WAR 배포)에서 Spring Boot를 실행하기 위한 초기화 클래스.
 *
 * Spring Boot는 기본적으로 내장 Tomcat으로 실행(JAR)되지만,
 * 외부 WAS(Web Application Server)에 WAR로 배포할 때는
 * 이 클래스가 SpringBootServletInitializer를 상속해 진입점 역할을 한다.
 *
 * 개발 환경에서 내장 Tomcat으로 실행할 때는 BubotApplication.main()이 진입점이고,
 * 이 클래스는 WAR 배포 시에만 활성화된다.
 * ============================================================ */
public class ServletInitializer extends SpringBootServletInitializer {

	/** ============================================================
	 * WAR 배포 시 Spring 컨테이너를 구성하는 메서드.
	 * application.sources(BubotApplication.class) →
	 * BubotApplication을 설정 소스로 지정해 @SpringBootApplication 기반으로 실행한다.
	 * ============================================================ */
	@Override
	protected SpringApplicationBuilder configure(SpringApplicationBuilder application) {
		return application.sources(BubotApplication.class);
	}

}
