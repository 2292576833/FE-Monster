import SwiftUI

struct RootView: View {
    @EnvironmentObject private var gateway: NodeGatewayController

    var body: some View {
        ZStack {
            Color(red: 11 / 255, green: 15 / 255, blue: 21 / 255)
                .ignoresSafeArea()

            switch gateway.state {
            case .ready:
                FEMonsterWebView(gateway: gateway)
                    .ignoresSafeArea(.container, edges: .all)
            case .failed(let message):
                GatewayFailureView(message: message) {
                    Task {
                        await gateway.retryReadinessCheck()
                    }
                }
            case .idle, .starting:
                GatewayLaunchView()
            }
        }
        .statusBarHidden(true)
        .task {
            await gateway.startIfNeeded()
        }
    }
}

private struct GatewayLaunchView: View {
    var body: some View {
        VStack(spacing: 16) {
            Text("FE moster")
                .font(.system(size: 31, weight: .black, design: .rounded))
                .foregroundStyle(.white)

            ProgressView()
                .tint(.white)

            Text("正在启动本机音乐服务")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(.white.opacity(0.62))
        }
        .accessibilityElement(children: .combine)
    }
}

private struct GatewayFailureView: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 18) {
            Text("本机音乐服务未就绪")
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(.white)

            Text(message)
                .font(.system(size: 13, weight: .medium))
                .multilineTextAlignment(.center)
                .foregroundStyle(.white.opacity(0.64))
                .padding(.horizontal, 30)

            Button("重新连接", action: retry)
                .buttonStyle(DesktopGlassButtonStyle())
        }
    }
}

private struct DesktopGlassButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 15, weight: .bold))
            .foregroundStyle(.white)
            .frame(minWidth: 132, minHeight: 48)
            .background {
                ZStack {
                    Color.black.opacity(0.74)
                    LinearGradient(
                        colors: [
                            .white.opacity(0.075),
                            .white.opacity(0.018)
                        ],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                    RadialGradient(
                        colors: [
                            .white.opacity(0.11),
                            .clear
                        ],
                        center: UnitPoint(x: 0.18, y: 0),
                        startRadius: 0,
                        endRadius: 82
                    )
                }
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            .overlay {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(Color(red: 229 / 255, green: 247 / 255, blue: 1).opacity(0.18))
            }
            .shadow(color: .black.opacity(0.38), radius: 15, y: 14)
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .opacity(configuration.isPressed ? 0.88 : 1)
            .animation(.easeOut(duration: 0.14), value: configuration.isPressed)
    }
}
