package com.bubot.market.coin;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ReconnectPolicyTest {

    @Test
    void 실패해도_다음_재연결을_예약할_수_있다() {
        // 2026-09-04 장애의 핵심: 예전 코드는 실패 후 플래그가 남아 두 번째 예약이 영원히 거부됐다.
        ReconnectPolicy p = new ReconnectPolicy(3_000, 60_000);
        assertEquals(3_000, p.begin());
        assertEquals(-1, p.begin(), "진행 중에는 중복 예약 불가");
        p.fail();
        assertFalse(p.isPending());
        assertEquals(6_000, p.begin(), "실패 후에도 다시 예약되고, 두 번째라 대기가 2배");
    }

    @Test
    void 대기_시간은_두_배씩_늘고_상한에서_멈춘다() {
        ReconnectPolicy p = new ReconnectPolicy(3_000, 60_000);
        long[] expected = {3_000, 6_000, 12_000, 24_000, 48_000, 60_000, 60_000};
        for (long e : expected) {
            assertEquals(e, p.begin());
            p.fail();
        }
        assertEquals(7, p.attempts());
    }

    @Test
    void 성공하면_횟수가_초기화된다() {
        ReconnectPolicy p = new ReconnectPolicy(3_000, 60_000);
        p.begin(); p.fail();
        p.begin(); p.fail();
        p.begin();
        p.success();
        assertFalse(p.isPending());
        assertEquals(0, p.attempts());
        assertEquals(3_000, p.begin(), "성공 뒤 첫 재연결은 다시 기본 대기");
    }

    @Test
    void 잘못된_설정은_거부한다() {
        assertThrows(IllegalArgumentException.class, () -> new ReconnectPolicy(0, 1_000));
        assertThrows(IllegalArgumentException.class, () -> new ReconnectPolicy(5_000, 1_000));
        assertTrue(new ReconnectPolicy(1_000, 1_000).begin() == 1_000);
    }
}
