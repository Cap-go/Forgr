package app.capgo.httpstream;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.ByteBuffer;
import java.nio.CharBuffer;
import java.nio.charset.CharsetDecoder;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Streams an HTTP response body to JavaScript as it arrives. Used for the
 * ChatGPT Responses API (Server-Sent Events): the WebView's fetch is blocked
 * by CORS and CapacitorHttp only returns once the whole body is received.
 */
@CapacitorPlugin(name = "HttpStream")
public class HttpStreamPlugin extends Plugin {

    private final ExecutorService executor = Executors.newCachedThreadPool();
    private final Map<String, HttpURLConnection> connections = new ConcurrentHashMap<>();

    @PluginMethod
    public void start(PluginCall call) {
        String id = call.getString("id");
        String urlString = call.getString("url");
        if (id == null || urlString == null || !urlString.startsWith("https://")) {
            call.reject("start needs an id and an https url");
            return;
        }
        String method = call.getString("method", "GET");
        int timeout = call.getInt("timeout", 300);
        JSObject headers = call.getObject("headers", new JSObject());
        String body = call.getString("body");
        call.resolve();
        executor.execute(() -> run(id, urlString, method, timeout, headers, body));
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        String id = call.getString("id");
        HttpURLConnection connection = id == null ? null : connections.remove(id);
        if (connection != null) connection.disconnect();
        call.resolve();
    }

    private void run(String id, String urlString, String method, int timeout, JSObject headers, String body) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(urlString).openConnection();
            connections.put(id, connection);
            connection.setRequestMethod(method);
            connection.setConnectTimeout(timeout * 1000);
            connection.setReadTimeout(timeout * 1000);
            connection.setUseCaches(false);
            Iterator<String> keys = headers.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                String value = headers.getString(key);
                if (value != null) connection.setRequestProperty(key, value);
            }
            if (body != null) {
                connection.setDoOutput(true);
                try (OutputStream out = connection.getOutputStream()) {
                    out.write(body.getBytes(StandardCharsets.UTF_8));
                }
            }
            int status = connection.getResponseCode();
            JSObject responseHeaders = new JSObject();
            for (Map.Entry<String, List<String>> entry : connection.getHeaderFields().entrySet()) {
                if (entry.getKey() != null && !entry.getValue().isEmpty()) {
                    responseHeaders.put(entry.getKey().toLowerCase(), entry.getValue().get(0));
                }
            }
            JSObject response = new JSObject();
            response.put("id", id);
            response.put("status", status);
            response.put("headers", responseHeaders);
            notifyListeners("response", response);

            InputStream in = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            if (in != null) {
                // The decoder keeps a partial UTF-8 character for the next chunk.
                CharsetDecoder decoder = StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPLACE)
                    .onUnmappableCharacter(CodingErrorAction.REPLACE);
                ByteBuffer bytes = ByteBuffer.allocate(16384);
                CharBuffer chars = CharBuffer.allocate(16384);
                byte[] buffer = new byte[8192];
                try (InputStream stream = in) {
                    int read;
                    while ((read = stream.read(buffer)) != -1) {
                        bytes.put(buffer, 0, read);
                        bytes.flip();
                        decoder.decode(bytes, chars, false);
                        bytes.compact();
                        chars.flip();
                        if (chars.hasRemaining()) emitChunk(id, chars.toString());
                        chars.clear();
                    }
                }
            }
            connections.remove(id);
            JSObject end = new JSObject();
            end.put("id", id);
            notifyListeners("end", end);
        } catch (Exception error) {
            boolean cancelled = !connections.containsKey(id);
            connections.remove(id);
            JSObject event = new JSObject();
            event.put("id", id);
            event.put("message", cancelled ? "cancelled" : String.valueOf(error.getMessage()));
            notifyListeners("error", event);
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private void emitChunk(String id, String text) {
        JSObject chunk = new JSObject();
        chunk.put("id", id);
        chunk.put("data", text);
        notifyListeners("chunk", chunk);
    }
}
