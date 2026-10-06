import AppKit
import Foundation

// Runs without opening any windows or touching a user's saved pet positions.
@main
@MainActor
struct DesktopGeometryCheck {
    static func main() {
        let area = NSRect(x: -1920, y: 0, width: 1920, height: 1080)
        let offscreen = NSRect(x: -2600, y: -500, width: 300, height: 340)
        let clamped = DesktopGeometry.clamp(offscreen, to: area)
        precondition(clamped.origin == NSPoint(x: -1920, y: 0))
        let lowerRight = DesktopGeometry.clamp(NSRect(x: 2000, y: 2000, width: 300, height: 340), to: area)
        precondition(lowerRight.origin == NSPoint(x: -300, y: 740))

        // During a cross-display drag, a visible handle remains recoverable.
        let drag = DesktopGeometry.clamp(offscreen, to: area, visible: 56)
        precondition(drag.maxX == area.minX + 56)
        precondition(drag.maxY == area.minY + 56)
        let oversized = DesktopGeometry.clamp(NSRect(x: 40, y: 60, width: 2200, height: 1200), to: area)
        precondition(oversized.origin == area.origin)

        let mainURL = URL(string: "http://127.0.0.1:51234/?client=embedded&feature=lyrics#playback")!
        let pet = URLComponents(url: desktopClientURL(mainURL, client: "desktop-pet"), resolvingAgainstBaseURL: false)!
        precondition(pet.host == "127.0.0.1" && pet.port == 51234)
        precondition(pet.queryItems?.filter { $0.name == "client" }.map(\.value) == ["desktop-pet"])
        precondition(pet.queryItems?.contains(URLQueryItem(name: "feature", value: "lyrics")) == true)
        let lyrics = URLComponents(url: desktopClientURL(mainURL, client: "desktop-lyrics", path: "/desktop-lyrics.html"), resolvingAgainstBaseURL: false)!
        precondition(lyrics.path == "/desktop-lyrics.html" && lyrics.port == 51234)

        let json = desktopJSON(["state": ["text": "透明歌词", "progress": 0.25]])
        let decoded = try! JSONSerialization.jsonObject(with: Data(json.utf8)) as! [String: Any]
        precondition((decoded["state"] as? [String: Any])?["text"] as? String == "透明歌词")
        precondition(desktopJSON(["invalid": Double.nan]) == "{}")
        print("Native macOS desktop geometry and URL checks passed.")
    }
}
