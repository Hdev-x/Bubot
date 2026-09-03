package com.tj.app.trade.paper;

import org.apache.ibatis.annotations.*;

import java.util.List;

/** 모의투자 가상계좌·포지션 CRUD (PostgreSQL, 어노테이션 방식). */
@Mapper
public interface PaperMapper {

    @Select("SELECT member_id AS memberId, balance, peak_equity AS peakEquity FROM paper_accounts WHERE member_id = #{memberId}")
    PaperAccountDTO selectAccount(String memberId);

    /** 실현 에쿼티(잔고+잠긴 증거금) 고점 갱신 — 청산 등 에쿼티 변동 후 호출 */
    @Update("""
        UPDATE paper_accounts a
        SET peak_equity = GREATEST(a.peak_equity,
            a.balance + COALESCE((SELECT SUM(p.margin) FROM paper_positions p WHERE p.member_id = a.member_id), 0))
        WHERE a.member_id = #{memberId}
    """)
    int bumpPeakEquity(String memberId);

    @Insert("INSERT INTO paper_accounts (member_id, balance) VALUES (#{memberId}, #{balance}) ON CONFLICT (member_id) DO NOTHING")
    int insertAccount(@Param("memberId") String memberId, @Param("balance") double balance);

    /** 잔고 증감(원자적) — 주문 시 -증거금, 청산 시 +증거금+손익 */
    @Update("UPDATE paper_accounts SET balance = balance + #{delta}, updated_at = NOW() WHERE member_id = #{memberId}")
    int addBalance(@Param("memberId") String memberId, @Param("delta") double delta);

    /** 잔고 절대값 설정 — 초기화용 */
    @Update("UPDATE paper_accounts SET balance = #{balance}, updated_at = NOW() WHERE member_id = #{memberId}")
    int setBalance(@Param("memberId") String memberId, @Param("balance") double balance);

    @Select("""
        SELECT id, symbol, direction, entry_price AS entryPrice, size, leverage, margin,
               TO_CHAR(opened_at, 'YYYY-MM-DD HH24:MI') AS openedAt
        FROM paper_positions WHERE member_id = #{memberId} ORDER BY id
    """)
    List<PaperPositionDTO> selectPositions(String memberId);

    @Select("""
        SELECT id, symbol, direction, entry_price AS entryPrice, size, leverage, margin
        FROM paper_positions WHERE id = #{id} AND member_id = #{memberId}
    """)
    PaperPositionDTO selectPosition(@Param("id") Integer id, @Param("memberId") String memberId);

    @Insert("""
        INSERT INTO paper_positions (member_id, symbol, direction, entry_price, size, leverage, margin)
        VALUES (#{memberId}, #{symbol}, #{direction}, #{entryPrice}, #{size}, #{leverage}, #{margin})
    """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insertPosition(PaperPositionDTO dto);

    @Delete("DELETE FROM paper_positions WHERE id = #{id} AND member_id = #{memberId}")
    int deletePosition(@Param("id") Integer id, @Param("memberId") String memberId);

    /** 부분 청산 — 잔여 비율만큼 size/margin 축소 (fractionRemaining = 1 - 청산비율) */
    @Update("""
        UPDATE paper_positions
        SET size = size * #{fractionRemaining}, margin = margin * #{fractionRemaining}
        WHERE id = #{id} AND member_id = #{memberId}
    """)
    int reducePosition(@Param("id") Integer id, @Param("memberId") String memberId,
                       @Param("fractionRemaining") double fractionRemaining);

    @Delete("DELETE FROM paper_positions WHERE member_id = #{memberId}")
    int deleteAllPositions(String memberId);

    // ── 지정가 미체결 주문 ──
    @Insert("""
        INSERT INTO paper_orders (member_id, symbol, direction, limit_price, size, leverage, margin)
        VALUES (#{memberId}, #{symbol}, #{direction}, #{limitPrice}, #{size}, #{leverage}, #{margin})
    """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insertOrder(PaperOrderDTO dto);

    /** 회원의 미체결 주문(표시용) */
    @Select("""
        SELECT id, symbol, direction, limit_price AS limitPrice, size, leverage, margin, status,
               TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI') AS createdAt
        FROM paper_orders WHERE member_id = #{memberId} AND status = 'pending' ORDER BY id DESC
    """)
    List<PaperOrderDTO> selectOrders(String memberId);

    /** 전체 미체결(체결 루프용 — member_id 포함) */
    @Select("""
        SELECT id, member_id AS memberId, symbol, direction, limit_price AS limitPrice, size, leverage, margin, status
        FROM paper_orders WHERE status = 'pending' ORDER BY id
    """)
    List<PaperOrderDTO> selectAllPending();

    @Select("""
        SELECT id, member_id AS memberId, symbol, direction, limit_price AS limitPrice, size, leverage, margin, status
        FROM paper_orders WHERE id = #{id} AND member_id = #{memberId} AND status = 'pending'
    """)
    PaperOrderDTO selectPendingOrder(@Param("id") Integer id, @Param("memberId") String memberId);

    /** 체결 마킹 — pending → filled (이미 바뀐 행은 0 반환=다른 루프가 선점) */
    @Update("UPDATE paper_orders SET status = 'filled' WHERE id = #{id} AND status = 'pending'")
    int markFilled(@Param("id") Integer id);

    @Update("UPDATE paper_orders SET status = 'canceled' WHERE id = #{id} AND member_id = #{memberId} AND status = 'pending'")
    int cancelOrder(@Param("id") Integer id, @Param("memberId") String memberId);

    @Delete("DELETE FROM paper_orders WHERE member_id = #{memberId}")
    int deleteAllOrders(String memberId);
}
