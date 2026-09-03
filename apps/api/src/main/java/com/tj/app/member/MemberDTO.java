package com.tj.app.member;

import java.util.List;

import lombok.Getter;
import lombok.Setter;
import lombok.ToString;

/** ============================================================
 * [클래스 읽기] 회원 데이터를 담는 DTO(Data Transfer Object).
 *
 * Controller ↔ Service ↔ Mapper 사이에서 회원 정보를 전달할 때 사용한다.
 * 폼 데이터(회원가입/로그인)를 받을 때도 이 객체로 바인딩된다.
 *
 * @Getter  → 모든 필드에 getXxx() 메서드를 자동 생성 (Lombok)
 * @Setter  → 모든 필드에 setXxx() 메서드를 자동 생성 (Lombok)
 * @ToString → 객체를 로그로 출력할 때 필드 값이 보이도록 toString() 자동 생성
 * ============================================================ */

@Getter
@Setter
@ToString
public class MemberDTO {
	private String username; // 로그인 ID (PK)
	private String name;     // 실명
	private String password; // 비밀번호 (평문 저장 중 — 실제 서비스에서는 암호화 필요)
	private Long cash;       // 주식 거래용 예수금 (단위: 원)
	private String email;

	/** ============================================================
	 * 회원이 가진 권한 목록. MemberMapper.xml의 resultMap에서
	 * ROLE 테이블과 LEFT JOIN해 collection으로 채워진다.
	 * 예) [RoleDTO(roleNo=2, roleName=ROLE_USER)]
	 * ============================================================ */
	private List<RoleDTO> roles;
}
