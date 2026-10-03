import AppIntents
import UIKit

/// Opens today's composer from Siri or the Shortcuts app, optionally with a
/// rating. It only opens the app at the dayli:// composer link that the
/// Flutter router handles, so sign-in, username setup, and rating checks stay
/// in one place. It never posts: the person still chooses who can see the
/// dayli and taps Post. See docs/dayli/native-composer-entry-points.md.
@available(iOS 16.0, *)
struct OpenTodaysComposerIntent: AppIntent {
  static let title: LocalizedStringResource = "Open today's dayli"
  static let description = IntentDescription(
    "Opens today's composer in Dayli. Nothing is posted until you choose who can see it and tap Post."
  )

  /// The person must unlock the device before the intent runs.
  static let authenticationPolicy: IntentAuthenticationPolicy =
    .requiresLocalDeviceAuthentication

  /// Deprecated from iOS 26 in favour of `supportedModes`, which needs
  /// iOS 26. The app supports iOS 16.
  static let openAppWhenRun = true

  @Parameter(
    title: "Rating",
    description: "How your day was, from 1 to 10. Optional.",
    inclusiveRange: (1, 10)
  )
  var rating: Int?

  @MainActor
  func perform() async throws -> some IntentResult {
    var link = URLComponents()
    link.scheme = "dayli"
    link.host = "app"
    link.path = "/post"
    if let rating {
      // Flutter checks the rating again and ignores it if it isn't 1-10.
      link.queryItems = [URLQueryItem(name: "rating", value: String(rating))]
    }
    if let url = link.url {
      await UIApplication.shared.open(url)
    }
    return .result()
  }
}

@available(iOS 16.0, *)
struct DayliShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: OpenTodaysComposerIntent(),
      phrases: [
        "Open today's dayli in \(.applicationName)",
        "Write today's dayli in \(.applicationName)",
      ]
    )
  }
}
