import Foundation
import Network

/// Range-capable loopback media endpoint. Unpredictable tokens address only
/// completed recordings registered by MacCaptureService, never arbitrary paths.
final class MacRecordingPreviewServer {
    private let queue = DispatchQueue(label: "com.femonster.mac.recording.preview")
    private var listener: NWListener?
    private var files: [String: URL] = [:]
    private var connections: [ObjectIdentifier: NWConnection] = [:]
    private var waitingHeaders = Set<ObjectIdentifier>()
    private var ready: [(Result<UInt16, Error>) -> Void] = []
    private var port: UInt16?

    func register(file: URL, token: String) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            queue.async {
                self.files[token] = file
                self.ensureListener { result in
                    continuation.resume(with: result.map { URL(string: "http://127.0.0.1:\($0)/\(token).mp4")! })
                }
            }
        }
    }

    func stop() {
        queue.async {
            self.listener?.cancel(); self.listener = nil; self.port = nil
            for connection in self.connections.values { connection.cancel() }
            self.connections.removeAll(); self.files.removeAll()
            self.waitingHeaders.removeAll()
            let callbacks = self.ready; self.ready.removeAll()
            callbacks.forEach { $0(.failure(CancellationError())) }
        }
    }

    private func ensureListener(_ completion: @escaping (Result<UInt16, Error>) -> Void) {
        if let port { completion(.success(port)); return }
        ready.append(completion)
        guard listener == nil else { return }
        do {
            let parameters = NWParameters.tcp
            parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: .any)
            let listener = try NWListener(using: parameters)
            self.listener = listener
            listener.stateUpdateHandler = { [weak self, weak listener] state in
                guard let self, self.listener === listener else { return }
                switch state {
                case .ready:
                    guard let port = listener?.port?.rawValue else { return }
                    self.port = port
                    let callbacks = self.ready; self.ready.removeAll()
                    callbacks.forEach { $0(.success(port)) }
                case .failed(let error):
                    let callbacks = self.ready; self.ready.removeAll()
                    callbacks.forEach { $0(.failure(error)) }
                    listener?.cancel(); self.listener = nil
                default: break
                }
            }
            listener.newConnectionHandler = { [weak self] connection in self?.accept(connection) }
            listener.start(queue: queue)
        } catch {
            let callbacks = ready; ready.removeAll()
            callbacks.forEach { $0(.failure(error)) }
        }
    }

    private func accept(_ connection: NWConnection) {
        let id = ObjectIdentifier(connection)
        // A WebView needs only a handful of media connections. Cap idle sockets.
        guard connections.count < 12 else { connection.cancel(); return }
        connections[id] = connection
        waitingHeaders.insert(id)
        connection.stateUpdateHandler = { [weak self, weak connection] state in
            guard let self, let connection else { return }
            if case .failed = state { self.connections.removeValue(forKey: id); self.waitingHeaders.remove(id); connection.cancel() }
            if case .cancelled = state { self.connections.removeValue(forKey: id); self.waitingHeaders.remove(id) }
        }
        connection.start(queue: queue)
        queue.asyncAfter(deadline: .now() + 5) { [weak self, weak connection] in
            guard let self, let connection, self.waitingHeaders.remove(id) != nil else { return }
            self.connections.removeValue(forKey: id); connection.cancel()
        }
        receiveHeader(connection, accumulated: Data())
    }

    private func receiveHeader(_ connection: NWConnection, accumulated: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 8192 - accumulated.count) { [weak self] data, _, complete, error in
            guard let self else { connection.cancel(); return }
            var buffer = accumulated
            if let data { buffer.append(data) }
            if buffer.range(of: Data("\r\n\r\n".utf8)) != nil {
                self.serve(connection, header: String(decoding: buffer, as: UTF8.self)); return
            }
            guard !complete, error == nil, buffer.count < 8192 else { connection.cancel(); return }
            self.receiveHeader(connection, accumulated: buffer)
        }
    }

    private func serve(_ connection: NWConnection, header: String) {
        let lines = header.components(separatedBy: "\r\n")
        let fields = (lines.first ?? "").split(separator: " ")
        guard fields.count == 3, fields[0] == "GET" || fields[0] == "HEAD",
              let requestURL = URL(string: String(fields[1]), relativeTo: URL(string: "http://127.0.0.1/")),
              requestURL.path.hasSuffix(".mp4") else { sendError(connection, status: "400 Bad Request"); return }
        let token = String(requestURL.path.dropFirst().dropLast(4))
        guard token.count == 36, token.range(of: "^[a-f0-9-]+$", options: .regularExpression) != nil,
              let file = files[token],
              let size = (try? FileManager.default.attributesOfItem(atPath: file.path)[.size] as? NSNumber)?.uint64Value,
              let handle = try? FileHandle(forReadingFrom: file) else { sendError(connection, status: "404 Not Found"); return }
        var lower: UInt64 = 0, upper = size > 0 ? size - 1 : 0
        let rangeHeader = lines.first { $0.lowercased().hasPrefix("range:") }
        if let rangeHeader {
            let value = rangeHeader.dropFirst(6).trimmingCharacters(in: .whitespaces)
            guard value.hasPrefix("bytes="), !value.contains(",") else { try? handle.close(); sendError(connection, status: "416 Range Not Satisfiable"); return }
            let values = value.dropFirst(6).split(separator: "-", omittingEmptySubsequences: false)
            guard values.count == 2 else { try? handle.close(); sendError(connection, status: "416 Range Not Satisfiable"); return }
            if values[0].isEmpty, let suffix = UInt64(values[1]), suffix > 0 { lower = size > suffix ? size - suffix : 0 }
            else if let start = UInt64(values[0]) {
                lower = start
                if !values[1].isEmpty {
                    guard let end = UInt64(values[1]) else { try? handle.close(); sendError(connection, status: "416 Range Not Satisfiable"); return }
                    upper = min(upper, end)
                }
            } else { try? handle.close(); sendError(connection, status: "416 Range Not Satisfiable"); return }
            guard lower < size, lower <= upper else { try? handle.close(); sendError(connection, status: "416 Range Not Satisfiable"); return }
        }
        let length = size > 0 ? upper - lower + 1 : 0
        let status = rangeHeader == nil ? "200 OK" : "206 Partial Content"
        let contentRange = rangeHeader == nil ? "" : "Content-Range: bytes \(lower)-\(upper)/\(size)\r\n"
        let response = "HTTP/1.1 \(status)\r\nContent-Type: video/mp4\r\nContent-Length: \(length)\r\nAccept-Ranges: bytes\r\nCache-Control: no-store\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\(contentRange)\r\n"
        waitingHeaders.remove(ObjectIdentifier(connection))
        do { try handle.seek(toOffset: lower) } catch { try? handle.close(); connection.cancel(); return }
        connection.send(content: Data(response.utf8), completion: .contentProcessed { [weak self] error in
            guard let self, error == nil else { try? handle.close(); connection.cancel(); return }
            if fields[0] == "HEAD" { try? handle.close(); connection.cancel() }
            else { self.sendFile(connection, handle: handle, remaining: length) }
        })
    }

    private func sendFile(_ connection: NWConnection, handle: FileHandle, remaining: UInt64) {
        guard remaining > 0 else { try? handle.close(); connection.cancel(); return }
        do {
            guard let bytes = try handle.read(upToCount: Int(min(remaining, 256 * 1024))), !bytes.isEmpty else {
                try? handle.close(); connection.cancel(); return
            }
            // Read the next chunk only after Network.framework consumes this one.
            connection.send(content: bytes, completion: .contentProcessed { [weak self] error in
                guard let self, error == nil else { try? handle.close(); connection.cancel(); return }
                self.sendFile(connection, handle: handle, remaining: remaining - UInt64(bytes.count))
            })
        } catch { try? handle.close(); connection.cancel() }
    }

    private func sendError(_ connection: NWConnection, status: String) {
        connection.send(content: Data("HTTP/1.1 \(status)\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".utf8),
            completion: .contentProcessed { _ in connection.cancel() })
    }
}
