package com.bubot.common.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import com.bubot.common.security.JwtAuthenticationFilter;
import com.bubot.common.security.JwtProvider;

import java.util.Arrays;
import java.util.List;

/** ============================================================
 * [클래스 읽기] Spring Security 전역 설정.
 *
 * - CSRF 비활성화 (SPA + JWT 방식)
 * - JWT 인증 필터 등록 → Authorization 헤더의 토큰으로 인증 컨텍스트 구성
 * - 인증 API, 모바일 정적 리소스, WebSocket handshake 외에는 JWT 인증 필요
 * - BCryptPasswordEncoder 빈 제공 (비밀번호 해시)
 * - 프론트엔드(Vite) 개발 서버용 CORS 허용
 * ============================================================ */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private final JwtProvider jwtProvider;
    private final String allowedOrigins;

    public SecurityConfig(
            JwtProvider jwtProvider,
            @Value("${app.cors.allowed-origins:http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174}") String allowedOrigins) {
        this.jwtProvider = jwtProvider;
        this.allowedOrigins = allowedOrigins;
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .cors(cors -> cors.configurationSource(corsConfigurationSource())) // CORS 활성화
            .csrf(csrf -> csrf.disable()) // 기존 POST/PUT 방어 비활성화
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(
                    "/",
                    "/index.html",
                    "/error",
                    "/favicon.ico",
                    "/api/auth/**",
                    "/mobile/**",
                    "/web/**",
                    // 마켓/차트 읽기(시세·캔들·로고 — 거래소 프록시, 유저정보 없음) 공개 → 비로그인도 조회.
                    // 계정/주문(/coin/buy·/coin/wallet 등)·자산·전략·관심·커뮤니티 글쓰기는 인증 유지.
                    "/coin/api/**",
                    "/ws-coin",
                    "/ws-stock",
                    "/api/bot-ws/**",
                    // 봇 자격증명 내부 API — JWT 대신 컨트롤러의 X-Internal-Token으로 보호
                    "/api/internal/**"
                ).permitAll()
                // 봇(trader) 프록시는 ADMIN 전용 — JWT의 role이 ADMIN일 때만 허용
                .requestMatchers("/api/bot/**").hasRole("ADMIN")
                // 그 외 백엔드 API/레거시 경로는 로그인 JWT 필요
                .anyRequest().authenticated()
            )
            // JWT 필터를 표준 인증 필터 앞에 배치 → 토큰이 있으면 인증 컨텍스트 구성
            .addFilterBefore(new JwtAuthenticationFilter(jwtProvider),
                    UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    /** 비밀번호 해시/검증용 인코더 (BCrypt) */
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        List<String> origins = Arrays.stream(allowedOrigins.split(","))
                .map(String::trim)
                .filter(origin -> !origin.isBlank())
                .toList();
        configuration.setAllowedOriginPatterns(origins);
        configuration.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(Arrays.asList("*"));
        configuration.setAllowCredentials(true); // 쿠키/세션 전송 허용

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration); // 모든 경로에 적용
        return source;
    }
}
