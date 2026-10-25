import XCTest

/// A paced walkthrough of every feature, for screen recording. Skipped unless
/// TEST_RUNNER_DEMO=1. Ghost only, against the deployed engine.
final class DemoRecordingTests: XCTestCase {
    func testDemoWalkthrough() throws {
        try XCTSkipUnless(ProcessInfo.processInfo.environment["DEMO"] == "1", "set TEST_RUNNER_DEMO=1 to record the demo")
        continueAfterFailure = true
        let app = XCUIApplication()
        app.launchArguments = ["-reset-session"]
        app.launch()

        // Onboarding → Ghost → the Deck written from live prices.
        sleep(2)
        app.buttons["Start in Ghost"].tap()
        let card = app.otherElements["deckCard"].firstMatch
        _ = card.waitForExistence(timeout: 90)
        sleep(2)

        // Chips: tap one, change it.
        let chip = card.buttons["chip"].firstMatch
        if chip.waitForExistence(timeout: 3) {
            chip.tap()
            sleep(2)
            if app.buttons["Done"].waitForExistence(timeout: 3) { app.buttons["Done"].tap() }
            sleep(2)
        }

        // Replay the card against real prices.
        card.press(forDuration: 0.8)
        if app.buttons["Replay against real prices"].waitForExistence(timeout: 3) {
            app.buttons["Replay against real prices"].tap()
            sleep(4)
            if app.buttons["7 days"].waitForExistence(timeout: 3) { app.buttons["7 days"].tap() }
            sleep(4)
            app.swipeDown(velocity: .fast)
            sleep(1)
        }

        // Say a Play, swipe right to arm it.
        let composer = app.textFields["composer"].firstMatch
        if composer.waitForExistence(timeout: 5) {
            composer.tap()
            composer.typeText("buy 2 dollars of eth now\n")
            _ = app.staticTexts["Your words"].firstMatch.waitForExistence(timeout: 60)
            sleep(2)
            app.otherElements["deckCard"].firstMatch.swipeRight(velocity: .fast)
            sleep(2)
        }

        // Plays: the agent decides, then asks.
        app.tabBars.buttons["Plays"].tap()
        _ = app.staticTexts["Your call"].firstMatch.waitForExistence(timeout: 60)
        sleep(2)

        // The Dynamic Island: expand and approve.
        XCUIDevice.shared.press(.home)
        sleep(2)
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        springboard.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.03)).press(forDuration: 1.2)
        sleep(2)
        let approve = springboard.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Approve'")).firstMatch
        if approve.waitForExistence(timeout: 5) { approve.tap() }
        sleep(4)

        // Back in: the Play and its Tape.
        app.activate()
        sleep(1)
        let row = app.staticTexts["Buy ETH now"].firstMatch
        if row.waitForExistence(timeout: 10) { row.tap() }
        sleep(2)
        app.swipeUp(velocity: .slow)
        sleep(2)
        app.navigationBars.buttons.firstMatch.tap()
        sleep(1)

        // The Rig.
        app.tabBars.buttons["Rig"].tap()
        sleep(3)
        app.swipeUp(velocity: .slow)
        sleep(2)
        app.swipeUp(velocity: .slow)
        sleep(2)
        app.swipeUp(velocity: .slow)
        sleep(3)
    }
}
