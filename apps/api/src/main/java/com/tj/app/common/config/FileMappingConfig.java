package com.tj.app.common.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** ============================================================
 * [클래스 읽기] 업로드 파일을 URL로 접근할 수 있도록 매핑하는 설정 클래스.
 *
 * @Configuration → Spring이 이 클래스를 설정 Bean으로 인식한다.
 * WebMvcConfigurer → Spring MVC의 기본 설정을 커스터마이징할 수 있는 인터페이스.
 *
 * 역할: 서버 디스크에 저장된 파일을 브라우저에서 URL로 접근 가능하게 연결한다.
 * 예) 디스크 경로 /files/profile/abc.png → 브라우저 URL /files/profile/abc.png
 *
 * application.properties:
 *   app.upload.url  = /files/**          (브라우저에서 접근할 URL 패턴)
 *   app.upload.path = file:///실제경로/   (서버 디스크의 실제 파일 위치)
 * ============================================================ */
@Configuration
public class FileMappingConfig implements WebMvcConfigurer {

	// [실행 흐름] application.properties의 app.upload.url 값을 주입
	@Value("${app.upload.url}")
	private String url;

	// [실행 흐름] application.properties의 app.upload.path 값을 주입
	@Value("${app.upload.path}")
	private String path;

	/** ============================================================
	 * URL 패턴과 실제 파일 경로를 Spring MVC 리소스 핸들러에 등록한다.
	 * 브라우저가 url 패턴으로 요청하면 → path 경로에서 파일을 찾아 응답한다.
	 * ============================================================ */
	@Override
	public void addResourceHandlers(ResourceHandlerRegistry registry) {
		registry.addResourceHandler(url)       // 브라우저 URL 패턴
				.addResourceLocations(path);   // 실제 파일이 있는 서버 경로
	}

	@Override
	public void addViewControllers(ViewControllerRegistry registry) {
		// [실행 흐름] 루트 접속 시 직접 만든 static/index.html 프론트엔드 라우터로 포워딩
		registry.addViewController("/").setViewName("forward:/index.html");
		registry.addViewController("/mobile").setViewName("forward:/mobile/index.html");
		registry.addViewController("/mobile/").setViewName("forward:/mobile/index.html");
		// 데스크톱 웹 콘솔 (static/web/index.html). 모바일과 동일 방식으로 SPA 진입점 포워딩.
		registry.addViewController("/web").setViewName("forward:/web/index.html");
		registry.addViewController("/web/").setViewName("forward:/web/index.html");
	}
}
