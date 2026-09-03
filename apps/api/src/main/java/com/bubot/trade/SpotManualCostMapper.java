package com.bubot.trade;

import org.apache.ibatis.annotations.*;

import java.util.List;

/**
 * spot_manual_cost CRUD (어노테이션 방식).
 * 현물 매수평균가를 거래소에서 못 받아올 때 사용자가 직접 입력한 값 저장소.
 */
@Mapper
public interface SpotManualCostMapper {

    @Select("""
        SELECT coin, avg_cost AS avgCost
        FROM spot_manual_cost
        WHERE member_id = #{memberId} AND exchange = #{exchange}
    """)
    List<SpotManualCostDTO> selectByMember(@Param("memberId") String memberId,
                                           @Param("exchange") String exchange);

    @Insert("""
        INSERT INTO spot_manual_cost (member_id, exchange, coin, avg_cost)
        VALUES (#{memberId}, #{exchange}, #{coin}, #{avgCost})
        ON CONFLICT (member_id, exchange, coin)
        DO UPDATE SET avg_cost = EXCLUDED.avg_cost, updated_at = NOW()
    """)
    int upsert(@Param("memberId") String memberId, @Param("exchange") String exchange,
               @Param("coin") String coin, @Param("avgCost") double avgCost);

    @Delete("""
        DELETE FROM spot_manual_cost
        WHERE member_id = #{memberId} AND exchange = #{exchange} AND coin = #{coin}
    """)
    int delete(@Param("memberId") String memberId, @Param("exchange") String exchange,
               @Param("coin") String coin);
}
