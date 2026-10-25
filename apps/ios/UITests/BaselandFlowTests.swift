import XCTest

/// Drives the real app against the deployed engine (Ghost only): onboarding,
/// the Deck, a chip edit, saying a Play, arming it, the Dynamic Island,
/// approving, and the Tape. Saves a screenshot at each step to $SHOTS_DIR.
final class BaselandFlowTests: XCTestCase {
    private var app: XCUIApplication!

    override func setUp() {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = ["-reset-session"]
        if let localEngine = ProcessInfo.processInfo.environment["ENGINE_URL"]
            ?? ProcessInfo.processInfo.environment["TEST_RUNNER_ENGINE_URL"] {
            app.launchArguments += ["-BaselandEngineURL", localEngine]
            NSLog("UI test engine override: %@", localEngine)
        }
        app.launch()
    }

    override func tearDown() {
        app?.terminate()
        super.tearDown()
    }

    func testGhostPlayFromWordsToIslandToTape() throws {
        // 1. Onboarding → Ghost.
        app.buttons["Start in Ghost"].tap()

        // 2. The Deck is written from live prices (Claude; can take ~20 s).
        let card = app.otherElements["deckCard"].firstMatch
        XCTAssertTrue(card.waitForExistence(timeout: 90), "no Deck card appeared")
        shot("02-deck")

        // 3. Edit a chip on the top card.
        let chip = card.buttons["chip"].firstMatch
        if chip.waitForExistence(timeout: 5) {
            chip.tap()
            XCTAssertTrue(app.buttons["Done"].waitForExistence(timeout: 5))
            shot("03-chip-editor")
            app.buttons["Done"].tap()
            sleep(3)
            shot("04-after-chip-edit")
        }

        // 4. Say a Play (typed here; the mic needs a person).
        let composer = app.textFields["composer"].firstMatch
        XCTAssertTrue(composer.waitForExistence(timeout: 5))
        composer.tap()
        composer.typeText("buy 3 dollars of eth now\n")
        let drafted = app.staticTexts["Your words"].firstMatch
        XCTAssertTrue(drafted.waitForExistence(timeout: 60), "the sentence didn't become a Play")
        shot("05-drafted")

        // 5. Swipe right to arm it in Ghost.
        app.otherElements["deckCard"].firstMatch.swipeRight(velocity: .fast)
        sleep(2)
        shot("06-armed")

        // 6. The agent decides in the background; then the Play waits for us.
        app.tabBars.buttons["Plays"].tap()
        let awaitingRow = app.staticTexts["Your call"].firstMatch
        _ = awaitingRow.waitForExistence(timeout: 60)
        shot("07-plays")

        // 7. Leave the app: the Play is in the Dynamic Island.
        XCUIDevice.shared.press(.home)
        sleep(3)
        shot("08-island")

        // 8. Back in, open the Play and approve it.
        app.activate()
        let row = app.staticTexts["Buy ETH now"].firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 10))
        row.tap()
        let approve = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Approve'")).firstMatch
        if approve.waitForExistence(timeout: 30) {
            shot("09-detail-awaiting")
            approve.tap()
            _ = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Bought'")).firstMatch.waitForExistence(timeout: 30)
        }
        sleep(2)
        shot("10-detail-after")
        app.swipeUp()
        shot("11-tape")
    }

    func testLocalEngineSmoke() throws {
        try XCTSkipUnless(ProcessInfo.processInfo.environment["ENGINE_URL"] != nil
            || ProcessInfo.processInfo.environment["TEST_RUNNER_ENGINE_URL"] != nil,
            "Set TEST_RUNNER_ENGINE_URL for the local engine smoke test")
        app.buttons["Start in Ghost"].tap()
        XCTAssertTrue(app.otherElements["deckCard"].firstMatch.waitForExistence(timeout: 45), "local engine did not deal a Deck")
    }

    private func shot(_ name: String) {
        let png = XCUIScreen.main.screenshot().pngRepresentation
        let attachment = XCTAttachment(data: png, uniformTypeIdentifier: "public.png")
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
        if let dir = ProcessInfo.processInfo.environment["SHOTS_DIR"] {
            try? png.write(to: URL(fileURLWithPath: dir).appendingPathComponent("\(name).png"))
        }
    }
}

/// Approve a Play from the Dynamic Island itself, through SpringBoard.
final class IslandApprovalTests: XCTestCase {
    func testApproveFromTheDynamicIsland() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-reset-session"]
        app.launch()
        app.buttons["Start in Ghost"].tap()

        let composer = app.textFields["composer"].firstMatch
        XCTAssertTrue(composer.waitForExistence(timeout: 30))
        composer.tap()
        composer.typeText("buy 2 dollars of eth now\n")
        XCTAssertTrue(app.staticTexts["Your words"].firstMatch.waitForExistence(timeout: 60))
        app.buttons["armButton"].tap()

        app.tabBars.buttons["Plays"].tap()
        XCTAssertTrue(app.staticTexts["Your call"].firstMatch.waitForExistence(timeout: 60), "the agent never asked")

        XCUIDevice.shared.press(.home)
        sleep(2)
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        if let dir = ProcessInfo.processInfo.environment["SHOTS_DIR"] {
            try? springboard.debugDescription.write(toFile: dir + "/springboard-tree.txt", atomically: true, encoding: .utf8)
        }
        shot("20-island-compact")

        // Long-press the Island to expand it, then tap Approve.
        let island = springboard.otherElements.matching(NSPredicate(format: "label CONTAINS 'ETH'")).firstMatch
        if island.waitForExistence(timeout: 5) {
            island.press(forDuration: 1.2)
        } else {
            springboard.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.03)).press(forDuration: 1.2)
        }
        sleep(1)
        if let dir = ProcessInfo.processInfo.environment["SHOTS_DIR"] {
            try? springboard.debugDescription.write(toFile: dir + "/springboard-expanded.txt", atomically: true, encoding: .utf8)
        }
        shot("21-island-expanded")
        let approve = springboard.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Approve'")).firstMatch
        XCTAssertTrue(approve.waitForExistence(timeout: 5), "no Approve button in the expanded Island")
        approve.tap()
        sleep(6)
        shot("22-after-island-approve")

        app.activate()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Bought'")).firstMatch.waitForExistence(timeout: 30), "the Island approval didn't fill")
        shot("23-app-after-island-approve")
    }

    private func shot(_ name: String) {
        let png = XCUIScreen.main.screenshot().pngRepresentation
        let a = XCTAttachment(data: png, uniformTypeIdentifier: "public.png")
        a.name = name
        a.lifetime = .keepAlways
        add(a)
        if let dir = ProcessInfo.processInfo.environment["SHOTS_DIR"] {
            try? png.write(to: URL(fileURLWithPath: dir).appendingPathComponent("\(name).png"))
        }
    }
}

/// iPhones without a Dynamic Island show Live Activities on the lock screen.
/// Approve from there, with the phone locked.
final class LockScreenApprovalTests: XCTestCase {
    func testApproveFromTheLockScreen() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-reset-session"]
        app.launch()
        app.buttons["Start in Ghost"].tap()

        let composer = app.textFields["composer"].firstMatch
        XCTAssertTrue(composer.waitForExistence(timeout: 30))
        composer.tap()
        composer.typeText("buy 2 dollars of eth now\n")
        XCTAssertTrue(app.staticTexts["Your words"].firstMatch.waitForExistence(timeout: 60))
        app.buttons["armButton"].tap()
        app.tabBars.buttons["Plays"].tap()
        XCTAssertTrue(app.staticTexts["Your call"].firstMatch.waitForExistence(timeout: 60), "the agent never asked")

        // Lock, then wake to the lock screen.
        XCUIDevice.shared.perform(NSSelectorFromString("pressLockButton"))
        sleep(2)
        XCUIDevice.shared.perform(NSSelectorFromString("pressLockButton"))
        sleep(3)
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        if let dir = ProcessInfo.processInfo.environment["SHOTS_DIR"] {
            try? springboard.debugDescription.write(toFile: dir + "/lockscreen-tree.txt", atomically: true, encoding: .utf8)
        }
        shot("30-lock-screen")

        let approve = springboard.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Approve'")).firstMatch
        XCTAssertTrue(approve.waitForExistence(timeout: 10), "no Approve button on the lock screen")
        approve.tap()
        sleep(6)
        shot("31-lock-screen-after-approve")

        // Unlock and confirm in the app.
        XCUIDevice.shared.press(.home)
        sleep(2)
        app.activate()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Bought'")).firstMatch.waitForExistence(timeout: 30), "the lock-screen approval didn't fill")
        shot("32-app-after-lock-approve")
    }

    private func shot(_ name: String) {
        let png = XCUIScreen.main.screenshot().pngRepresentation
        let a = XCTAttachment(data: png, uniformTypeIdentifier: "public.png")
        a.name = name
        a.lifetime = .keepAlways
        add(a)
        if let dir = ProcessInfo.processInfo.environment["SHOTS_DIR"] {
            try? png.write(to: URL(fileURLWithPath: dir).appendingPathComponent("\(name).png"))
        }
    }
}

/// Connect Claude Code: mint a harness token, copy the command, then wait for
/// a Play created through the Baseland MCP to arrive. The run needs a driver
/// outside the test: it reads the command with `xcrun simctl pbpaste` and has
/// the MCP create a Ghost Play titled "From Claude Code". Run it with
/// `scripts/harness-e2e.sh`, which sets TEST_RUNNER_HARNESS=1.
final class HarnessTests: XCTestCase {
    func testPlayFromClaudeCodeAppears() throws {
        try XCTSkipUnless(ProcessInfo.processInfo.environment["HARNESS"] == "1", "needs the MCP driver: scripts/harness-e2e.sh")
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-reset-session"]
        app.launch()
        app.buttons["Start in Ghost"].tap()

        app.tabBars.buttons["Rig"].tap()
        XCTAssertTrue(app.navigationBars["The Rig"].waitForExistence(timeout: 20))
        let link = app.buttons["Claude Code"].firstMatch
        for _ in 0..<10 where !(link.exists && link.isHittable) { app.swipeUp(velocity: .slow) }
        link.tap()
        app.buttons["Connect Claude Code"].tap()
        let copy = app.buttons["Copy command"].firstMatch
        XCTAssertTrue(copy.waitForExistence(timeout: 30), "no token was minted")
        copy.tap()
        shot("50-harness-connected")

        // The driver now creates the Play through the MCP.
        app.tabBars.buttons["Plays"].tap()
        let row = app.staticTexts["From Claude Code"].firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 240), "the MCP's Play never appeared")
        _ = app.staticTexts["Your call"].firstMatch.waitForExistence(timeout: 60)
        shot("51-plays-with-mcp-play")

        XCUIDevice.shared.press(.home)
        sleep(3)
        shot("52-island-mcp-play")

        // Back in: open the Claude Code screen again (the Rig tab usually kept
        // it; it reloads when it reappears). It now shows the token was used.
        app.activate()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 10))
        // A tap right after activate() can be dropped: retry until selected.
        let rigTab = app.tabBars.buttons["Rig"]
        for _ in 0..<5 where !rigTab.isSelected {
            rigTab.tap()
            sleep(1)
        }
        if !app.navigationBars["Claude Code"].waitForExistence(timeout: 5) {
            for _ in 0..<10 where !(link.exists && link.isHittable) { app.swipeUp(velocity: .slow) }
            link.tap()
        }
        // A LabeledContent row reads as one element ("Status, Connected").
        let contains = { (s: String) in app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", s)).firstMatch }
        XCTAssertTrue(contains("Last used").waitForExistence(timeout: 20))
        sleep(2)
        shot("53-harness-last-used")
        XCTAssertTrue(contains("Connected").exists)
        XCTAssertFalse(contains("Not yet").exists, "the token's use wasn't recorded")
    }

    private func shot(_ name: String) {
        let png = XCUIScreen.main.screenshot().pngRepresentation
        let a = XCTAttachment(data: png, uniformTypeIdentifier: "public.png")
        a.name = name
        a.lifetime = .keepAlways
        add(a)
        if let dir = ProcessInfo.processInfo.environment["SHOTS_DIR"] {
            try? png.write(to: URL(fileURLWithPath: dir).appendingPathComponent("\(name).png"))
        }
    }
}

/// The Rig: change the Brain and a Sense, replay a card against real prices.
final class RigTests: XCTestCase {
    func testRigEditsAndReplay() throws {
        continueAfterFailure = false
        // TEST_RUNNER_APPEARANCE=dark runs the same test on the dark surface
        // (simctl's appearance setting doesn't reach the test run).
        if ProcessInfo.processInfo.environment["APPEARANCE"] == "dark" { XCUIDevice.shared.appearance = .dark }
        defer { XCUIDevice.shared.appearance = .light }
        let app = XCUIApplication()
        app.launchArguments = ["-reset-session"]
        app.launch()
        app.buttons["Start in Ghost"].tap()
        XCTAssertTrue(app.otherElements["deckCard"].firstMatch.waitForExistence(timeout: 90), "no Deck")

        // Replay the top card from its context menu.
        app.otherElements["deckCard"].firstMatch.press(forDuration: 1.0)
        let replay = app.buttons["Replay against real prices"].firstMatch
        XCTAssertTrue(replay.waitForExistence(timeout: 5))
        replay.tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'Replay · real prices'")).firstMatch.waitForExistence(timeout: 10))
        sleep(5)
        shot("40-replay-24h")
        app.buttons["7 days"].tap()
        sleep(5)
        shot("41-replay-7d")
        app.swipeDown(velocity: .fast)
        sleep(1)

        // The Rig.
        app.tabBars.buttons["Rig"].tap()
        XCTAssertTrue(app.navigationBars["The Rig"].waitForExistence(timeout: 10))
        sleep(2)
        shot("42-rig-top")
        app.buttons.matching(NSPredicate(format: "label CONTAINS 'Haiku 5.5'")).firstMatch.tap()
        sleep(2)
        let nansen = app.switches.matching(NSPredicate(format: "label CONTAINS 'Nansen smart-money flows'")).firstMatch
        // The Form loads rows lazily: scroll until the switch exists.
        for _ in 0..<6 where !(nansen.exists && nansen.isHittable) { app.swipeUp(velocity: .slow) }
        XCTAssertTrue(nansen.waitForExistence(timeout: 5))
        // Tap the switch itself; the row's centre is its label, which doesn't toggle.
        nansen.coordinate(withNormalizedOffset: CGVector(dx: 0.94, dy: 0.5)).tap()
        sleep(2)
        XCTAssertEqual(nansen.value as? String, "0", "the Sense didn't switch off")
        shot("43-rig-senses")
        app.swipeUp()
        app.swipeUp()
        sleep(1)
        shot("44-rig-hands-leash")
        app.swipeUp()
        app.swipeUp()
        sleep(1)
        shot("45-rig-account")

        // Persisted: relaunch reads the Rig back from the engine.
        app.terminate()
        app.launchArguments = []
        app.launch()
        app.tabBars.buttons["Rig"].tap()
        XCTAssertTrue(app.navigationBars["The Rig"].waitForExistence(timeout: 20))
        let haiku = app.buttons.matching(NSPredicate(format: "label CONTAINS 'Haiku 5.5'")).firstMatch
        XCTAssertTrue(haiku.waitForExistence(timeout: 10))
        XCTAssertTrue(haiku.isSelected, "the Brain choice didn't persist")
        let nansenAgain = app.switches.matching(NSPredicate(format: "label CONTAINS 'Nansen smart-money flows'")).firstMatch
        for _ in 0..<6 where !(nansenAgain.exists && nansenAgain.isHittable) { app.swipeUp(velocity: .slow) }
        XCTAssertTrue(nansenAgain.waitForExistence(timeout: 5))
        XCTAssertEqual(nansenAgain.value as? String, "0", "the Sense change didn't persist")
        shot("46-rig-after-relaunch")
    }

    private func shot(_ name: String) {
        let png = XCUIScreen.main.screenshot().pngRepresentation
        let a = XCTAttachment(data: png, uniformTypeIdentifier: "public.png")
        a.name = name
        a.lifetime = .keepAlways
        add(a)
        if let dir = ProcessInfo.processInfo.environment["SHOTS_DIR"] {
            try? png.write(to: URL(fileURLWithPath: dir).appendingPathComponent("\(name).png"))
        }
    }
}
