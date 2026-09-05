package com.bubot.market.coin;

import org.junit.jupiter.api.Test;

import java.net.http.WebSocket;
import java.nio.ByteBuffer;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

class WsConnectTest {

    /** 서비스 listener 대역 — 몇 번 호출됐는지만 센다. */
    private static final class CountingListener implements WebSocket.Listener {
        final AtomicInteger opens = new AtomicInteger();
        final AtomicInteger texts = new AtomicInteger();
        final AtomicInteger closes = new AtomicInteger();
        final AtomicInteger errors = new AtomicInteger();
        @Override public void onOpen(WebSocket ws) { opens.incrementAndGet(); }
        @Override public CompletionStage<?> onText(WebSocket ws, CharSequence d, boolean last) { texts.incrementAndGet(); return null; }
        @Override public CompletionStage<?> onClose(WebSocket ws, int code, String reason) { closes.incrementAndGet(); return null; }
        @Override public void onError(WebSocket ws, Throwable t) { errors.incrementAndGet(); }
    }

    @Test
    void 정상_경로에서는_모든_이벤트를_그대로_위임한다() {
        CountingListener inner = new CountingListener();
        WsConnect.GuardedListener g = new WsConnect.GuardedListener(inner);
        WebSocket ws = mock(WebSocket.class);
        g.onOpen(ws);
        g.onText(ws, "x", true);
        g.onPing(ws, ByteBuffer.allocate(0));
        g.onClose(ws, 1000, "bye");
        g.onError(ws, new RuntimeException("e"));
        assertEquals(1, inner.opens.get());
        assertEquals(1, inner.texts.get());
        assertEquals(1, inner.closes.get());
        assertEquals(1, inner.errors.get());
        verify(ws, never()).abort();
    }

    @Test
    void 타임아웃으로_포기한_뒤_늦게_열린_유령_소켓은_abort하고_서비스에_넘기지_않는다() {
        // 리뷰 2차 P1: 예전 코드는 future.cancel() 뒤 thenAccept(abort)를 걸었는데 취소된 future는 그 콜백을 실행하지 않는다.
        CountingListener inner = new CountingListener();
        WsConnect.GuardedListener g = new WsConnect.GuardedListener(inner);
        g.abandon();
        WebSocket ghost = mock(WebSocket.class);
        g.onOpen(ghost);
        g.onText(ghost, "late", true);
        g.onClose(ghost, 1006, "");
        g.onError(ghost, new RuntimeException("late"));
        verify(ghost).abort();
        assertTrue(g.isAbandoned());
        assertEquals(0, inner.opens.get() + inner.texts.get() + inner.closes.get() + inner.errors.get(),
                "같은 서비스 listener가 두 소켓의 이벤트를 받지 않는다");
    }
}
