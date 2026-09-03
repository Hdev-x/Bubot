package com.bubot.member;

import lombok.Getter;
import lombok.Setter;
import lombok.ToString;

/** ============================================================
 * [클래스 읽기] 회원 권한(Role) 데이터를 담는 DTO.
 *
 * MemberDTO.roles 리스트에 담겨 함께 전달된다.
 * DB의 ROLE 테이블과 매핑되며, MemberMapper.xml의 collection 태그가
 * 이 객체를 생성해 MemberDTO 안에 채워 넣는다.
 * 예) roleName = "ROLE_USER", "ROLE_ADMIN"
 * ============================================================ */
@Getter
@Setter
@ToString
public class RoleDTO {
	private Long roleNo;
	private String roleName; // 권한명. 예) ROLE_USER, ROLE_ADMIN
}
