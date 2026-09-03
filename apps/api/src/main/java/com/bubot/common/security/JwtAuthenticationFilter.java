package com.bubot.common.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

/** ============================================================
 * [클래스 읽기] 모든 요청마다 1번 실행되는 JWT 인증 필터.
 *
 * [실행 흐름]
 * 1. Authorization: Bearer <token> 헤더에서 토큰 추출
 * 2. JwtProvider로 서명·만료 검증 → username, role 획득
 * 3. SecurityContext에 인증 정보 저장 (권한: ROLE_USER / ROLE_ADMIN)
 *    → 이후 @PreAuthorize, .hasRole() 등에서 사용
 * 토큰이 없거나 유효하지 않으면 그냥 통과(익명 처리). 차단은 SecurityConfig가 담당.
 * ============================================================ */
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtProvider jwtProvider;

    public JwtAuthenticationFilter(JwtProvider jwtProvider) {
        this.jwtProvider = jwtProvider;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {

        String token = resolveToken(request);
        if (token != null) {
            try {
                String username = jwtProvider.validateAndGetSubject(token);
                String role = jwtProvider.getRole(token); // USER / ADMIN
                var authority = new SimpleGrantedAuthority("ROLE_" + (role == null ? "USER" : role));
                var authentication = new UsernamePasswordAuthenticationToken(
                        username, null, List.of(authority));
                SecurityContextHolder.getContext().setAuthentication(authentication);
            } catch (Exception e) {
                // 유효하지 않은 토큰 → 인증 미설정(익명). 보호 경로는 SecurityConfig에서 차단됨
                SecurityContextHolder.clearContext();
            }
        }
        chain.doFilter(request, response);
    }

    /** Authorization 헤더(Bearer)에서 토큰만 추출 */
    private String resolveToken(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            return header.substring(7);
        }
        return null;
    }
}
