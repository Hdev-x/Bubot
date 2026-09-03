package com.tj.app.backtest;

import org.apache.ibatis.annotations.*;

import java.util.List;

/**
 * backtest_runs CRUD (어노테이션 방식).
 * config/symbols/report 컬럼은 JSONB라 INSERT 시 ::jsonb 캐스팅이 필요하다.
 */
@Mapper
public interface BacktestRunMapper {

    @Select("""
        SELECT id, name, config, symbols,
               TO_CHAR(range_start, 'YYYY-MM-DD') AS rangeStart,
               TO_CHAR(range_end, 'YYYY-MM-DD') AS rangeEnd,
               report, config_hash AS configHash,
               TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI') AS createdAt
        FROM backtest_runs
        WHERE member_id = #{memberId}
        ORDER BY created_at DESC
        LIMIT #{limit}
    """)
    List<BacktestRunDTO> selectByMemberId(@Param("memberId") String memberId, @Param("limit") int limit);

    @Insert("""
        INSERT INTO backtest_runs (member_id, name, config, symbols, range_start, range_end, report, config_hash)
        VALUES (#{memberId}, #{name}, CAST(#{config} AS JSONB), CAST(#{symbols} AS JSONB),
                TO_TIMESTAMP(#{rangeStart}, 'YYYY-MM-DD'), TO_TIMESTAMP(#{rangeEnd}, 'YYYY-MM-DD'),
                CAST(#{report} AS JSONB), #{configHash})
    """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(BacktestRunDTO dto);

    @Delete("""
        DELETE FROM backtest_runs WHERE id = #{id} AND member_id = #{memberId}
    """)
    int deleteByIdAndMemberId(@Param("id") Integer id, @Param("memberId") String memberId);

    /** 같은 설정 해시의 실행 횟수 — 목록에서 "동일 설정 N회" 표시용 */
    @Select("""
        SELECT config_hash AS configHash, COUNT(*) AS cnt
        FROM backtest_runs
        WHERE member_id = #{memberId}
        GROUP BY config_hash
    """)
    @MapKey("configHash")
    java.util.Map<String, java.util.Map<String, Object>> countByHash(@Param("memberId") String memberId);
}
