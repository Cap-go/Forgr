import Foundation
import Capacitor

/// Streams an HTTP response body to JavaScript as it arrives. Used for the
/// ChatGPT Responses API (Server-Sent Events): the WebView's fetch is blocked
/// by CORS and CapacitorHttp only returns once the whole body is received.
@objc(HttpStreamPlugin)
public class HttpStreamPlugin: CAPPlugin, CAPBridgedPlugin, URLSessionDataDelegate {
    public let identifier = "HttpStreamPlugin"
    public let jsName = "HttpStream"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
    ]

    private lazy var session: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 300
        config.timeoutIntervalForResource = 1800
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        return URLSession(configuration: config, delegate: self, delegateQueue: nil)
    }()
    private var tasks: [Int: String] = [:]
    /// Bytes of an incomplete UTF-8 sequence carried to the next chunk.
    private var pending: [Int: Data] = [:]
    private let lock = NSLock()

    @objc func start(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let urlString = call.getString("url"), let url = URL(string: urlString),
              url.scheme == "https" else {
            call.reject("start needs an id and an https url")
            return
        }
        var request = URLRequest(url: url)
        request.httpMethod = call.getString("method") ?? "GET"
        request.timeoutInterval = TimeInterval(call.getInt("timeout") ?? 300)
        for (key, value) in call.getObject("headers") ?? [:] {
            if let value = value as? String { request.setValue(value, forHTTPHeaderField: key) }
        }
        if let body = call.getString("body") { request.httpBody = body.data(using: .utf8) }
        let task = session.dataTask(with: request)
        lock.lock()
        tasks[task.taskIdentifier] = id
        lock.unlock()
        task.resume()
        call.resolve()
    }

    @objc func cancel(_ call: CAPPluginCall) {
        let id = call.getString("id")
        session.getAllTasks { all in
            self.lock.lock()
            let match = all.filter { self.tasks[$0.taskIdentifier] == id }
            self.lock.unlock()
            match.forEach { $0.cancel() }
            call.resolve()
        }
    }

    private func streamId(_ task: URLSessionTask) -> String? {
        lock.lock()
        defer { lock.unlock() }
        return tasks[task.taskIdentifier]
    }

    public func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
                           completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        if let id = streamId(dataTask), let http = response as? HTTPURLResponse {
            var headers: [String: String] = [:]
            for (key, value) in http.allHeaderFields {
                headers[String(describing: key).lowercased()] = String(describing: value)
            }
            notifyListeners("response", data: ["id": id, "status": http.statusCode, "headers": headers])
        }
        completionHandler(.allow)
    }

    public func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard let id = streamId(dataTask) else { return }
        lock.lock()
        var bytes = (pending[dataTask.taskIdentifier] ?? Data()) + data
        // Keep a trailing partial UTF-8 character for the next chunk.
        var carry = Data()
        while !bytes.isEmpty, String(data: bytes, encoding: .utf8) == nil, carry.count < 4 {
            carry.insert(bytes.removeLast(), at: 0)
        }
        pending[dataTask.taskIdentifier] = carry
        lock.unlock()
        if let text = String(data: bytes, encoding: .utf8), !text.isEmpty {
            notifyListeners("chunk", data: ["id": id, "data": text])
        }
    }

    public func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard let id = streamId(task) else { return }
        lock.lock()
        tasks.removeValue(forKey: task.taskIdentifier)
        pending.removeValue(forKey: task.taskIdentifier)
        lock.unlock()
        if let error = error {
            notifyListeners("error", data: ["id": id, "message": error.localizedDescription])
        } else {
            notifyListeners("end", data: ["id": id])
        }
    }
}
