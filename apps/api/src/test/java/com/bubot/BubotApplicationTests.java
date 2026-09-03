package com.bubot;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * DB·환경변수 없이 도는 컨텍스트 테스트. test 프로필(H2 in-memory, 더미 키, 외부 WebSocket 차단)로 뜬다.
 * trading 프로필이 없으므로 Beta 모드와 같은 bean 구성이다.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class BubotApplicationTests {

	@Autowired
	private MockMvc mvc;

	@Test
	void contextLoads() {
	}

	@Test
	void authMeRequiresToken() throws Exception {
		mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
	}

	@Test
	void tradingProfileBeansAreAbsentInBetaMode() throws Exception {
		// @Profile("trading") 컨트롤러는 등록되지 않으므로 permitAll 경로가 404여야 한다
		mvc.perform(get("/api/internal/worker/status")).andExpect(status().isNotFound());
	}
}
