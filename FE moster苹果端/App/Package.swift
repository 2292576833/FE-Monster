// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "FEMonsterMac",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(name: "FEMonsterMac", targets: ["FEMonsterMac"])
    ],
    targets: [
        .executableTarget(
            name: "FEMonsterMac",
            path: "Sources/FEMonsterMac",
            // Compile the explicit @main entry in main.swift as a declaration,
            // so AppKit starts synchronously on the main actor.
            swiftSettings: [.unsafeFlags(["-parse-as-library"])]
        )
    ]
)
