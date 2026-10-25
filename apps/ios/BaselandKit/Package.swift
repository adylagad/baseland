// swift-tools-version: 6.2
import PackageDescription

// Shared between the app and the widget extension: the Live Activity's
// attributes, the Play stage model, design tokens, and the Island views (so
// the app can render the exact Island UI in its preview gallery).
let package = Package(
    name: "BaselandKit",
    platforms: [.iOS(.v26)],
    products: [.library(name: "BaselandKit", targets: ["BaselandKit"])],
    targets: [
        .target(name: "BaselandKit"),
        .testTarget(name: "BaselandKitTests", dependencies: ["BaselandKit"]),
    ]
)
