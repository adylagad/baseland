import XCTest

/// The submission video, one clip per test, paced for a viewer. Driven by
/// scripts/recording/ (see its README), which starts and stops the simulator
/// recording around the recorded tests; scripts/cut-clip.py cuts the waits
/// marked here. Skipped unless TEST_RUNNER_RECORD=1. Runs against the
/// deployed engine.
///
/// Order: clip1 (Ghost tour) → pairHarness (off camera) → clip2 (Claude Code's
/// Play arrives) → key connected and stopEarlierPlays (off camera) → clip3
/// (real crypto). clip4 (a real x402 purchase, then Skip) is optional.
final class FinalRecordingTests: XCTestCase {
    private var app: XCUIApplication!
    private var springboard: XCUIApplication { XCUIApplication(bundleIdentifier: "com.apple.springboard") }

    override func setUpWithError() throws {
        try XCTSkipUnless(ProcessInfo.processInfo.environment["RECORD"] == "1", "set TEST_RUNNER_RECORD=1 (scripts/record-final.sh)")
        continueAfterFailure = false
        app = XCUIApplication()
    }

    // MARK: Clip 1 — Ghost: the Deck, a Play from words, the Island, the Tape, the Rig

    func testClip1GhostTour() throws {
        app.launchArguments = ["-reset-session"]
        app.launch()
        mark("start")
        pause(4)
        app.buttons["Start in Ghost"].tap()

        // The Deck is written from live prices (Claude, ~15 s): cut the wait.
        let card = app.otherElements["deckCard"].firstMatch
        cut { _ = card.waitForExistence(timeout: 120) }
        pause(4)

        // A chip is a fill-in-the-blank: tap one.
        let chip = card.buttons["chip"].firstMatch
        if chip.waitForExistence(timeout: 3) {
            chip.tap()
            pause(3)
            if app.buttons["Done"].waitForExistence(timeout: 3) { app.buttons["Done"].tap() }
            pause(2)
        }

        // Replay the card on real past prices.
        card.press(forDuration: 0.8)
        if app.buttons["Replay against real prices"].waitForExistence(timeout: 3) {
            app.buttons["Replay against real prices"].tap()
            pause(5)
            if app.buttons["7 days"].waitForExistence(timeout: 3) { app.buttons["7 days"].tap() }
            pause(5)
            app.swipeDown(velocity: .fast)
            pause(1)
        }

        // Say a Play (typed here; the mic needs a person), then swipe to arm.
        let composer = app.textFields["composer"].firstMatch
        XCTAssertTrue(composer.waitForExistence(timeout: 5))
        composer.tap()
        composer.typeText("buy 2 dollars of eth now\n")
        cut { _ = app.staticTexts["Your words"].firstMatch.waitForExistence(timeout: 60) }
        pause(3)
        app.otherElements["deckCard"].firstMatch.swipeRight(velocity: .slow)
        pause(3)

        // The agent decides once, then asks.
        app.tabBars.buttons["Plays"].tap()
        pause(2)
        cut { _ = app.staticTexts["Your call"].firstMatch.waitForExistence(timeout: 90) }
        pause(3)

        // Approve from the Dynamic Island.
        XCUIDevice.shared.press(.home)
        pause(3)
        expandIsland(containing: "ETH")
        pause(2)
        let approve = springboard.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Approve'")).firstMatch
        XCTAssertTrue(approve.waitForExistence(timeout: 5), "no Approve in the Island")
        approve.tap()
        pause(4)

        // The Tape: everything the agent saw, decided and did, labelled GHOST.
        app.activate()
        _ = app.wait(for: .runningForeground, timeout: 10)
        pause(1)
        let row = app.staticTexts["Buy ETH now"].firstMatch
        if row.waitForExistence(timeout: 10) { row.tap() }
        pause(3)
        app.swipeUp(velocity: .slow)
        pause(3)
        app.swipeUp(velocity: .slow)
        pause(3)
        app.navigationBars.buttons.firstMatch.tap()
        pause(1)

        // The Rig: Brain, Senses, Instincts, Hands, Leash.
        tab("Rig")
        pause(3)
        for _ in 0..<4 {
            app.swipeUp(velocity: .slow)
            pause(2)
        }
        mark("end")
    }

    // MARK: Off camera — pair Claude Code with this phone

    func testPairHarness() throws {
        app.launch()
        tab("Rig")
        let link = app.buttons["Claude Code"].firstMatch
        for _ in 0..<10 where !(link.exists && link.isHittable) { app.swipeUp(velocity: .slow) }
        link.tap()
        // First time "Connect Claude Code"; after that "Make a new token" (revokes the old one).
        let connect = app.buttons["Connect Claude Code"]
        (connect.waitForExistence(timeout: 10) ? connect : app.buttons["Make a new token"]).tap()
        let copy = app.buttons["Copy command"].firstMatch
        XCTAssertTrue(copy.waitForExistence(timeout: 30), "no token was minted")
        copy.tap()
        mark("copied")
        sleep(4) // the driver reads the clipboard now, before the Mac's can sync over it
        app.navigationBars.buttons.firstMatch.tap()
        for _ in 0..<10 { app.swipeDown(velocity: .fast) }
        tab("Deck")
    }

    // MARK: Clip 2 — a Play made in Claude Code lands on the phone

    func testClip2ClaudeCodeArrives() throws {
        app.launch()
        tab("Plays")
        let ghostRows = { self.app.staticTexts.matching(NSPredicate(format: "label == 'Simulated'")).count }
        let before = ghostRows()
        mark("start")
        // Claude Code drafts, replays and arms: the terminal half of the clip,
        // played side by side, so this wait is not cut. The app stays open:
        // iOS starts a Live Activity only from the foreground.
        waitFor(flag: "clip2-armed", timeout: 300)
        for _ in 0..<20 where ghostRows() <= before { sleep(1) }
        XCTAssertGreaterThan(ghostRows(), before, "the MCP's Play didn't appear")
        pause(4)
        // On the Island.
        XCUIDevice.shared.press(.home)
        pause(5)
        expandIsland(containing: "ETH")
        pause(4)
        // Hold until Claude Code has finished its answer on the left.
        waitFor(flag: "clip2-done", timeout: 180)
        pause(2)
        mark("end")
    }

    // MARK: Off camera — connect the Coinbase key (from the simulator clipboard)

    func testConnectKey() throws {
        // The path (not the key) comes from the driver; the app reads the file.
        let path = try XCTUnwrap(ProcessInfo.processInfo.environment["KEY_FILE"], "set TEST_RUNNER_KEY_FILE")
        app.launchArguments = ["-connect-key-file", path]
        app.launch()
        tab("Deck")
        sleep(8)
        app.buttons["Settings"].tap()
        let portfolio = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS 'Portfolio'")).firstMatch
        XCTAssertTrue(portfolio.waitForExistence(timeout: 60), "the key wasn't accepted")
        app.buttons["Done"].tap()
        // Stop the Ghost Plays from earlier clips, so the live Play is the one
        // in the Dynamic Island.
        tab("Plays")
        let stop = app.buttons["Stop all"]
        if stop.waitForExistence(timeout: 5), stop.isEnabled {
            stop.tap()
            let confirm = app.buttons["Stop all Plays"]
            if confirm.waitForExistence(timeout: 5) { confirm.tap() }
            sleep(4)
        }
        tab("Deck")
    }

    /// Off camera: stop the Ghost Plays from earlier clips, so the live Play
    /// is the one in the Dynamic Island.
    func testStopEarlierPlays() throws {
        app.launch()
        tab("Plays")
        let stop = app.buttons["Stop all"]
        if stop.waitForExistence(timeout: 10), stop.isEnabled {
            stop.tap()
            let confirm = app.buttons["Stop all Plays"]
            if confirm.waitForExistence(timeout: 5) { confirm.tap() }
            sleep(4)
        }
        tab("Deck")
    }

    // MARK: Clip 3 — real crypto: x402 evidence, Island approval, a real fill

    func testClip3LiveCrypto() throws {
        let approveForReal = ProcessInfo.processInfo.environment["LIVE_APPROVE"] == "1"
        app.launch()
        tab("Deck")
        mark("start")
        pause(2)

        // Connected: a dedicated portfolio, live trading on.
        app.buttons["Settings"].tap()
        pause(4)
        app.buttons["Done"].tap()
        pause(1)

        // Say it, then arm it LIVE (confirmed; never a swipe).
        let composer = app.textFields["composer"].firstMatch
        XCTAssertTrue(composer.waitForExistence(timeout: 5))
        composer.tap()
        composer.typeText("buy 3 dollars of eth now, check smart money flows first, take profit at 3%, stop at 3%\n")
        cut { _ = app.staticTexts["Your words"].firstMatch.waitForExistence(timeout: 60) }
        pause(4)
        let live = app.buttons["armLiveButton"]
        XCTAssertTrue(live.waitForExistence(timeout: 10), "no LIVE button: key not connected or live trading off")
        live.tap()
        pause(3)
        let confirm = app.buttons["Arm LIVE"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 5))
        confirm.tap()
        pause(3)

        // The agent decides once: it may buy evidence over x402, then asks.
        tab("Plays")
        pause(3)
        cut { _ = app.staticTexts["Your call"].firstMatch.waitForExistence(timeout: 120) }
        pause(2)
        openFirstAwaitingPlay()
        pause(4)
        app.swipeUp(velocity: .slow)
        pause(5)
        app.swipeDown(velocity: .slow)
        pause(1)

        // Approve from the Dynamic Island.
        XCUIDevice.shared.press(.home)
        pause(3)
        expandIsland(containing: "ETH")
        pause(3)
        let button = springboard.buttons.matching(NSPredicate(format: approveForReal ? "label BEGINSWITH 'Approve'" : "label BEGINSWITH 'Skip'")).firstMatch
        XCTAssertTrue(button.waitForExistence(timeout: 5), "no Approve/Skip in the Island")
        button.tap()
        cut(seconds: approveForReal ? 12 : 4)
        pause(3)

        // Back in: the order, the fill and the receipts on the Tape.
        app.activate()
        _ = app.wait(for: .runningForeground, timeout: 10)
        pause(3)
        app.swipeUp(velocity: .slow)
        pause(4)
        app.swipeUp(velocity: .slow)
        pause(4)
        app.navigationBars.buttons.firstMatch.tap()
        pause(1)

        // The account: the real portfolio after the trade.
        tab("Rig")
        pause(1)
        let account = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS 'Coinbase portfolio'")).firstMatch
        for _ in 0..<10 where !(account.exists && account.isHittable) { app.swipeUp(velocity: .slow) }
        pause(6)
        mark("end")
    }

    // MARK: Clip 4 — a real x402 payment for evidence, then Skip (no trade)

    func testClip4X402Evidence() throws {
        app.launch()
        tab("Deck")
        mark("start")
        pause(2)
        let composer = app.textFields["composer"].firstMatch
        XCTAssertTrue(composer.waitForExistence(timeout: 5))
        composer.tap()
        composer.typeText("buy 3 dollars of eth now, check smart money flows first\n")
        cut { _ = app.staticTexts["Your words"].firstMatch.waitForExistence(timeout: 60) }
        pause(3)
        let live = app.buttons["armLiveButton"]
        XCTAssertTrue(live.waitForExistence(timeout: 10), "no LIVE button")
        live.tap()
        pause(2)
        app.buttons["Arm LIVE"].tap()
        pause(2)
        tab("Plays")
        pause(2)
        cut { _ = app.staticTexts["Your call"].firstMatch.waitForExistence(timeout: 120) }
        openFirstAwaitingPlay()
        pause(3)
        // The Tape: the agent's x402 receipt, real USDC, no GHOST label.
        app.swipeUp(velocity: .slow)
        pause(6)
        app.swipeDown(velocity: .slow)
        pause(2)
        // Already bought once today: skip this one. No order is placed.
        let skip = app.buttons["Skip"].firstMatch
        XCTAssertTrue(skip.waitForExistence(timeout: 5))
        skip.tap()
        pause(4)
        mark("end")
    }

    // MARK: Helpers

    private func openFirstAwaitingPlay() {
        let yourCall = app.staticTexts["Your call"].firstMatch
        if yourCall.waitForExistence(timeout: 5) { yourCall.tap() }
    }

    private func expandIsland(containing text: String) {
        let island = springboard.otherElements.matching(NSPredicate(format: "label CONTAINS %@", text)).firstMatch
        if island.waitForExistence(timeout: 5) {
            island.press(forDuration: 1.2)
        } else {
            springboard.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.03)).press(forDuration: 1.2)
        }
    }

    /// A tap right after activate() can be dropped (docs/code-traps.md): retry until selected.
    private func tab(_ name: String) {
        let button = app.tabBars.buttons[name]
        XCTAssertTrue(button.waitForExistence(timeout: 20))
        for _ in 0..<5 where !button.isSelected {
            button.tap()
            sleep(1)
        }
    }

    private func pause(_ seconds: UInt32) { sleep(seconds) }

    /// Marks a stretch for the editing script to cut (a wait nobody needs to watch).
    private func cut(_ body: () -> Void) {
        mark("cut-start")
        body()
        mark("cut-end")
    }

    private func cut(seconds: UInt32) {
        mark("cut-start")
        sleep(seconds)
        mark("cut-end")
    }

    /// Waits for a file the driver writes (e.g. when Claude Code has armed the Play).
    private func waitFor(flag: String, timeout: TimeInterval) {
        let path = (ProcessInfo.processInfo.environment["SHOTS_DIR"] ?? NSTemporaryDirectory()) + "/" + flag
        let deadline = Date().addingTimeInterval(timeout)
        while !FileManager.default.fileExists(atPath: path) && Date() < deadline { sleep(1) }
    }

    /// Appends "<label> <unix seconds>" to $SHOTS_DIR/marks.txt.
    private func mark(_ label: String) {
        guard let dir = ProcessInfo.processInfo.environment["SHOTS_DIR"] else { return }
        let line = "\(name) \(label) \(Date().timeIntervalSince1970)\n"
        let url = URL(fileURLWithPath: dir).appendingPathComponent("marks.txt")
        if let h = try? FileHandle(forWritingTo: url) {
            h.seekToEndOfFile()
            h.write(Data(line.utf8))
            try? h.close()
        } else {
            try? line.write(to: url, atomically: true, encoding: .utf8)
        }
    }
}
