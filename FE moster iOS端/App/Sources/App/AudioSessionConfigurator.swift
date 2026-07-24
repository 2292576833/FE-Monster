import AVFoundation

enum AudioSessionConfigurator {
    static func configure() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(
                .playback,
                mode: .default,
                options: [.allowAirPlay, .allowBluetoothA2DP]
            )
            try session.setActive(true)
        } catch {
            // WKWebView can still play in the foreground if activation is unavailable.
        }
    }
}

