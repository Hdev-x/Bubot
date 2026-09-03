package com.bubot.common.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

/** ============================================================
 * [클래스 읽기] JWT 토큰 발급/검증 유틸.
 *
 * - generateToken(): username/role을 담은 서명된 JWT 문자열 생성
 * - validateAndGetSubject(): 서명·만료 검증 후 username(subject) 반환
 * - getRole(): 토큰의 role 클레임 반환
 *
 * 비밀키와 만료시간은 application.properties(app.jwt.*)에서 주입.
 * ============================================================ */
@Component
public class JwtProvider {

    private final SecretKey key;
    private final long expirationMs;

    public JwtProvider(
            @Value("${app.jwt.secret}") String secret,
            @Value("${app.jwt.expiration-ms}") long expirationMs) {
        // HS256 서명을 위한 비밀키 생성 (최소 32바이트 필요)
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expirationMs = expirationMs;
    }

    /** username과 role(USER/ADMIN)을 담은 JWT 발급 */
    public String generateToken(String username, String role) {
        Date now = new Date();
        Date expiry = new Date(now.getTime() + expirationMs);
        return Jwts.builder()
                .subject(username)        // sub = 로그인 ID(email)
                .claim("role", role)      // role = USER / ADMIN
                .issuedAt(now)
                .expiration(expiry)
                .signWith(key)
                .compact();
    }

    /** 서명·만료를 검증하고 username(subject) 반환. 실패 시 예외 발생 */
    public String validateAndGetSubject(String token) {
        return parse(token).getSubject();
    }

    /** 토큰의 role 클레임 반환 */
    public String getRole(String token) {
        Object role = parse(token).get("role");
        return role != null ? role.toString() : null;
    }

    private Claims parse(String token) {
        return Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}
