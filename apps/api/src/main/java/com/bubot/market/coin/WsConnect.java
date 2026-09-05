package com.bubot.market.coin;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.nio.ByteBuffer;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * 거래소 WebSocket 연결 헬퍼 — buildAsync().join() 대신 상한 시간을 두고 기다린다.
 * 예전 코드는 join()이라 연결이 응답 없이 걸리면 재연결 스레드가 영원히 멈춰 "재연결 중" 상태가 고착됐다.
 *
 * 타임아웃 뒤 늦게 열리는 소켓(유령 소켓) 처리: CompletableFuture.cancel() 뒤에는 thenAccept 콜백이
 * 실행되지 않으므로(취소된 future는 정상 완료되지 않는다) 소켓을 잡을 수 없다. 대신 listener를 한 겹 감싸
 * "포기" 표시를 두고, 포기된 뒤 도착하는 onOpen은 소켓을 즉시 abort하고 어떤 이벤트도 서비스에 넘기지 않는다.
 */
final class WsConnect {

    static final long TIMEOUT_SECONDS = 15;

    private WsConnect() {}

    static WebSocket open(HttpClient client, URI uri, WebSocket.Listener listener) throws Exception {
        GuardedListener guarded = new GuardedListener(listener);
        CompletableFuture<WebSocket> future = client.newWebSocketBuilder().buildAsync(uri, guarded);
        try {
            return future.get(TIMEOUT_SECONDS, TimeUnit.SECONDS);
        } catch (TimeoutException e) {
            guarded.abandon();
            future.cancel(true);
            throw new IOException("연결 " + TIMEOUT_SECONDS + "초 타임아웃: " + uri.getHost());
        } catch (ExecutionException e) {
            Throwable cause = e.getCause();
            throw cause instanceof Exception ex ? ex : e;
        }
    }

    /** 포기(abandon)된 뒤 도착하는 이벤트를 차단하는 listener 래퍼. 정상 경로에서는 그대로 위임한다. */
    static final class GuardedListener implements WebSocket.Listener {
        private final WebSocket.Listener delegate;
        private final AtomicBoolean abandoned = new AtomicBoolean(false);

        GuardedListener(WebSocket.Listener delegate) {
            this.delegate = delegate;
        }

        void abandon() {
            abandoned.set(true);
        }

        boolean isAbandoned() {
            return abandoned.get();
        }

        @Override
        public void onOpen(WebSocket webSocket) {
            if (abandoned.get()) {
                try { webSocket.abort(); } catch (Exception ignore) { /* 이미 닫힘 */ }
                return;
            }
            delegate.onOpen(webSocket);
        }

        @Override
        public CompletionStage<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
            if (abandoned.get()) return null;
            return delegate.onText(webSocket, data, last);
        }

        @Override
        public CompletionStage<?> onBinary(WebSocket webSocket, ByteBuffer data, boolean last) {
            if (abandoned.get()) return null;
            return delegate.onBinary(webSocket, data, last);
        }

        @Override
        public CompletionStage<?> onPing(WebSocket webSocket, ByteBuffer message) {
            if (abandoned.get()) return null;
            return delegate.onPing(webSocket, message);
        }

        @Override
        public CompletionStage<?> onPong(WebSocket webSocket, ByteBuffer message) {
            if (abandoned.get()) return null;
            return delegate.onPong(webSocket, message);
        }

        @Override
        public CompletionStage<?> onClose(WebSocket webSocket, int statusCode, String reason) {
            if (abandoned.get()) return null;
            return delegate.onClose(webSocket, statusCode, reason);
        }

        @Override
        public void onError(WebSocket webSocket, Throwable error) {
            if (abandoned.get()) return;
            delegate.onError(webSocket, error);
        }
    }
}
