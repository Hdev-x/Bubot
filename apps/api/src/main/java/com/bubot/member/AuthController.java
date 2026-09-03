package com.bubot.member;

import com.bubot.common.security.JwtProvider;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.Map;

/** ============================================================
 * [클래스 읽기] JWT 기반 인증 REST 컨트롤러 (React 앱 전용).
 *
 * - POST /api/auth/login : username/password 검증 → JWT 발급
 * - GET  /api/auth/me    : 현재 토큰의 사용자 정보 반환 (앱 로딩 시 토큰 유효성 확인)
 *
 * 기존 JSP 세션 로그인(MemberController)과 별개로 동작한다.
 * ============================================================ */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final MemberService memberService;
    private final PasswordEncoder passwordEncoder;
    private final JwtProvider jwtProvider;

    public AuthController(MemberService memberService, PasswordEncoder passwordEncoder, JwtProvider jwtProvider) {
        this.memberService = memberService;
        this.passwordEncoder = passwordEncoder;
        this.jwtProvider = jwtProvider;
    }

    /** 로그인: 자격 검증 후 JWT 토큰과 사용자 정보 반환 */
    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody MemberDTO loginReq) throws Exception {
        MemberDTO member = memberService.read(loginReq); // username으로 조회 (+권한)

        // 사용자 없음 또는 비밀번호 불일치 → 401
        if (member == null || member.getPassword() == null
                || !passwordEncoder.matches(loginReq.getPassword(), member.getPassword())) {
            return ResponseEntity.status(401).body(Map.of("message", "아이디 또는 비밀번호가 올바르지 않습니다."));
        }

        String role = extractRole(member); // USER / ADMIN
        String token = jwtProvider.generateToken(member.getUsername(), role);

        Map<String, Object> body = new HashMap<>();
        body.put("token", token);
        body.put("username", member.getUsername());
        body.put("name", member.getName());
        body.put("role", role);
        return ResponseEntity.ok(body);
    }

    /** 자체 회원가입: 이메일(=로그인 ID)/비밀번호로 회원 생성 후 자동 로그인(JWT 발급). create()가 비번 BCrypt 해시+지갑 생성. */
    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody MemberDTO req) throws Exception {
        if (req.getUsername() == null || req.getUsername().isBlank()
                || req.getPassword() == null || req.getPassword().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("message", "이메일과 비밀번호를 입력하세요."));
        }
        if (memberService.read(req) != null) {
            return ResponseEntity.status(409).body(Map.of("message", "이미 사용 중인 이메일입니다."));
        }
        if (req.getName() == null || req.getName().isBlank()) {
            req.setName(req.getUsername());
        }
        try {
            memberService.create(req); // 비밀번호 BCrypt 해시 + 코인 지갑 생성, role=USER/status=ACTIVE
        } catch (Exception e) {
            return ResponseEntity.status(400).body(Map.of("message", "회원가입에 실패했습니다."));
        }
        String token = jwtProvider.generateToken(req.getUsername(), "USER");
        Map<String, Object> body = new HashMap<>();
        body.put("token", token);
        body.put("username", req.getUsername());
        body.put("name", req.getName());
        body.put("role", "USER");
        return ResponseEntity.ok(body);
    }

    /** 현재 토큰의 사용자 정보 반환 (JwtAuthenticationFilter가 인증 컨텍스트를 채워둠) */
    @GetMapping("/me")
    public ResponseEntity<?> me(Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated()) {
            return ResponseEntity.status(401).body(Map.of("message", "인증되지 않았습니다."));
        }
        String username = authentication.getName();
        String role = authentication.getAuthorities().stream().findFirst()
                .map(a -> a.getAuthority().replace("ROLE_", ""))
                .orElse("USER");
        Map<String, Object> body = new HashMap<>();
        body.put("username", username);
        body.put("role", role);
        return ResponseEntity.ok(body);
    }

    /** roles 리스트에서 권한명(USER/ADMIN) 추출. 없으면 USER */
    private String extractRole(MemberDTO member) {
        if (member.getRoles() != null && !member.getRoles().isEmpty()) {
            String roleName = member.getRoles().get(0).getRoleName();
            if (roleName != null) {
                return roleName.replace("ROLE_", "").toUpperCase();
            }
        }
        return "USER";
    }
}
