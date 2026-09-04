package com.bubot.market.coin;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * 거래소 WebSocket 연결 헬퍼 — buildAsync().join() 대신 상한 시간을 두고 기다린다.
 * 예전 코드는 join()이라 연결이 응답 없이 걸리면 재연결 스레드가 영원히 멈춰 "재연결 중" 상태가 고착됐다.
 */
final class WsConnect {

    static final long TIMEOUT_SECONDS = 15;

    private WsConnect() {}

    static WebSocket open(HttpClient client, URI uri, WebSocket.Listener listener) throws Exception {
        CompletableFuture<WebSocket> future = client.newWebSocketBuilder().buildAsync(uri, listener);
        try {
            return future.get(TIMEOUT_SECONDS, TimeUnit.SECONDS);
        } catch (TimeoutException e) {
            future.cancel(true);
            throw new IOException("연결 " + TIMEOUT_SECONDS + "초 타임아웃: " + uri.getHost());
        } catch (ExecutionException e) {
            Throwable cause = e.getCause();
            throw cause instanceof Exception ex ? ex : e;
        }
    }
}
