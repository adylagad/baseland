import BaselandKit
import SwiftUI

/// Connect Claude Code (the Baseland MCP) to this account, so Plays it
/// creates appear here and on the Island. The engine lets the token create
/// Ghost Plays and stop them, never approve or go live.
struct HarnessView: View {
    @Environment(AppModel.self) private var model
    @State private var link: HarnessLink?
    @State private var minted: String?
    @State private var copied = false
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        Form {
            Section {
                if let link {
                    LabeledContent("Status", value: link.connected ? "Connected" : "Not connected")
                    if link.connected, let used = link.lastUsedAt {
                        LabeledContent("Last used", value: used.formatted(.relative(presentation: .named)))
                    } else if link.connected {
                        LabeledContent("Last used", value: "Not yet")
                    }
                } else if error == nil {
                    ProgressView()
                }
            } footer: {
                Text("Claude Code can then draft, replay, arm and stop Plays for you. They are always GHOST, and only you approve them, here or on the Island.")
            }

            if let minted {
                Section {
                    // Masked on screen so it never lands in a screenshot or
                    // a screen recording; Copy and Share carry the real one.
                    Text(command(masked(minted)))
                        .font(Theme.money(12))
                        .accessibilityIdentifier("harness.command")
                    Button {
                        UIPasteboard.general.string = command(minted)
                        copied = true
                    } label: {
                        Label(copied ? "Copied" : "Copy command", systemImage: copied ? "checkmark" : "doc.on.doc")
                    }
                    ShareLink(item: command(minted)) { Label("Send to your Mac", systemImage: "square.and.arrow.up") }
                } header: {
                    Text("Run this in the Baseland repo")
                } footer: {
                    Text("Shown once. It holds a token that acts for this account; treat it like a password. Making a new one revokes this one.")
                }
            }

            Section {
                Button(link?.connected == true ? "Make a new token" : "Connect Claude Code") { Task { await mint() } }
                    .disabled(busy)
                if link?.connected == true {
                    Button("Disconnect", role: .destructive) { Task { await disconnect() } }.disabled(busy)
                }
            }

            if let error {
                Section { Text(error).foregroundStyle(Theme.Stage.stopped) }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.paper)
        .navigationTitle("Claude Code")
        .task { await load() }
    }

    private func command(_ token: String) -> String { "pnpm connect-claude \(token)" }

    private func masked(_ token: String) -> String { "bl_" + String(repeating: "•", count: 8) + token.suffix(4) }

    private func load() async {
        do { link = try await model.api.harness() } catch { self.error = error.localizedDescription }
    }

    private func mint() async {
        busy = true
        defer { busy = false }
        do {
            let fresh = try await model.api.mintHarnessToken()
            minted = fresh.token
            copied = false
            link = fresh
            error = nil
        } catch { self.error = error.localizedDescription }
    }

    private func disconnect() async {
        busy = true
        defer { busy = false }
        do {
            link = try await model.api.disconnectHarness()
            minted = nil
        } catch { self.error = error.localizedDescription }
    }
}
