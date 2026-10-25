"""Draws docs/diagrams/architecture.svg: how one Play runs, and where each
control sits. Plain SVG, no dependencies; colors are the app's (Theme.swift).

    python3 -I docs/diagrams/architecture.py   # writes architecture.svg next to it
"""
from pathlib import Path
from xml.sax.saxutils import escape

W, H = 1580, 920
PAPER, CARD, LINE = "#F5F3EE", "#FFFFFF", "#D9D5CC"
INK, SOFT, MUTED = "#14161A", "#4A4F59", "#8A8F99"
IDLE, WATCHING, DECIDING, AWAITING, DONE = "#8E96A3", "#3D7BFF", "#FFB224", "#FF6A3D", "#2BD07F"
GHOST, GHOST_TEXT = "#B49CFF", "#6A4FD0"
CONTROL = "#C8283A"
SANS = "-apple-system, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif"
MONO = "'SF Mono', ui-monospace, Menlo, monospace"

out: list[str] = []


def text(x, y, s, size=12.5, color=SOFT, weight=400, anchor="start", mono=False, spacing=0, rotate=None):
    extra = f' letter-spacing="{spacing}"' if spacing else ""
    if rotate is not None:
        extra += f' transform="rotate({rotate} {x} {y})"'
    out.append(
        f'<text x="{x}" y="{y}" font-family="{MONO if mono else SANS}" font-size="{size}" '
        f'font-weight="{weight}" fill="{color}" text-anchor="{anchor}"{extra}>{escape(s)}</text>'
    )


def box(x, y, w, h, fill=CARD, stroke=LINE, rx=14, dash=None, width=1):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    out.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="{width}"{d}/>')


def card(x, y, w, h, overline, title, lines=(), **kw):
    box(x, y, w, h, **kw)
    text(x + 18, y + 22, overline, size=10.5, color=MUTED, weight=600, spacing=1.2)
    text(x + 18, y + 44, title, size=15, color=INK, weight=650)
    for i, line in enumerate(lines):
        text(x + 18, y + 66 + i * 20, line)


def arrow(points, label=None, at=None, step=None, color=SOFT):
    pts = " ".join(f"{px},{py}" for px, py in points)
    out.append(f'<polyline points="{pts}" fill="none" stroke="{color}" stroke-width="1.5" marker-end="url(#arrow)"/>')
    if label or step:
        lx, ly = at
        if step:
            badge(lx, ly - 4, step)
            lx += 24
        if label:
            text(lx, ly + 4, label, size=12, color=INK, weight=500)


def badge(x, y, n):
    out.append(f'<circle cx="{x + 9}" cy="{y}" r="9" fill="{WATCHING}"/>')
    text(x + 9, y + 4, str(n), size=11, color="#FFFFFF", weight=700, anchor="middle")


def tag(x, y, label, kind):
    """A small pill: GHOST (simulated) or CONTROL (enforced in code)."""
    w = 8 + len(label) * 6.6
    if kind == "ghost":
        out.append(f'<rect x="{x}" y="{y - 12}" width="{w}" height="17" rx="8.5" fill="none" stroke="{GHOST}" stroke-width="1.3" stroke-dasharray="3 2"/>')
        text(x + w / 2, y + 1, label, size=10, color=GHOST_TEXT, weight=700, anchor="middle", mono=True)
    else:
        out.append(f'<rect x="{x}" y="{y - 12}" width="{w}" height="17" rx="4" fill="#FFFFFF" stroke="{CONTROL}" stroke-width="1.3"/>')
        text(x + w / 2, y + 1, label, size=10, color=CONTROL, weight=700, anchor="middle", mono=True)
    return x + w


# ------------------------------------------------------------------ frame
out.append(f'<rect width="{W}" height="{H}" fill="{PAPER}"/>')
text(60, 54, "Baseland: how one Play runs", size=26, color=INK, weight=700)
text(60, 84, "Plain code watches the market. Claude is asked once, when the trigger fires, and returns a decision, never an order. "
     "The engine checks the Leash and the person holding the phone approves.", size=14, color=SOFT)

# ------------------------------------------------------------- left: clients
card(60, 130, 320, 340, "IPHONE · SWIFTUI", "Baseland app", ["Deck · Plays · Rig · Replay"])
text(78, 226, "Live Activity", size=11, color=MUTED, weight=600)
out.append(f'<rect x="78" y="236" width="284" height="40" rx="20" fill="#0E0F12"/>')
out.append(f'<circle cx="102" cy="256" r="9" fill="none" stroke="{GHOST}" stroke-width="1.5" stroke-dasharray="2.5 2"/>')
out.append(f'<circle cx="102" cy="256" r="5" fill="{AWAITING}"/>')
text(120, 261, "ETH", size=14, color="#FFFFFF", weight=700, mono=True)
text(344, 261, "$2.00?", size=14, color=AWAITING, weight=700, mono=True, anchor="end")
text(78, 296, "Dynamic Island · lock screen", size=11.5, color=MUTED)
text(78, 330, "App Intents", size=13, color=INK, weight=650)
text(78, 350, "Approve · Skip · Pause, from the Island", size=12)
end = tag(78, 392, "CONTROL", "control")
text(end + 8, 393, "kill switch: app · Control Center · Siri", size=11.5)
end = tag(78, 432, "GHOST", "ghost")
text(end + 8, 433, "on every simulated Play, row and Island", size=11.5)

card(60, 500, 320, 150, "ANY MCP HARNESS", "Claude Code + Baseland MCP", ["draft · replay · arm · pause · kill"])
end = tag(78, 602, "CONTROL", "control")
text(end + 8, 603, "harness token: Ghost only,", size=11.5)
text(end + 8, 619, "can never approve", size=11.5)
text(78, 640, "No token: a private anonymous Ghost account", size=11, color=MUTED)

card(60, 680, 320, 156, "SUPABASE", "Postgres · Realtime · Auth",
     ["plays · tape · rig · deck · harness tokens",
      "credentials: encrypted, engine only",
      "Auth: anonymous users, getClaims",
      "pg_cron pings /health every 5 min"])

# ----------------------------------------------------------- centre: engine
box(530, 130, 560, 690, fill="#EFECE5", stroke="#C9C4B8", rx=18)
text(550, 152, "ENGINE · RENDER", size=10.5, color=MUTED, weight=600, spacing=1.2)
text(550, 174, "Node 22 + Fastify", size=15, color=INK, weight=650)
text(1070, 174, "all state in Supabase; rehydrates on boot", size=11.5, color=MUTED, anchor="end")

box(550, 190, 520, 66)
text(568, 214, "API", size=13, color=INK, weight=650)
text(568, 236, "Supabase JWT (getClaims), or a bl_ harness token: default deny", size=12)

box(550, 276, 520, 80)
text(568, 298, "Play runtime", size=13, color=INK, weight=650)
text(1052, 298, "every step written to the Tape", size=11.5, color=MUTED, anchor="end")
states = [("armed", IDLE), ("watching", WATCHING), ("deciding", DECIDING), ("awaiting", AWAITING), ("executing", INK), ("done", DONE)]
pw, gap = 74, (484 - 6 * 74) / 5
for i, (name, color) in enumerate(states):
    px = 568 + i * (pw + gap)
    out.append(f'<rect x="{px}" y="{314}" width="{pw}" height="26" rx="13" fill="#FFFFFF" stroke="{color}" stroke-width="1.5"/>')
    out.append(f'<circle cx="{px + 11}" cy="327" r="3.5" fill="{color}"/>')
    text(px + 19, 331, name, size=10, color=INK, mono=True)
    if i < len(states) - 1:
        text(px + pw + gap / 2, 331, "›", size=13, color=MUTED, anchor="middle")

box(550, 376, 520, 60)
text(568, 400, "Watchers", size=13, color=INK, weight=650)
text(568, 421, "price triggers in plain code; no AI in the loop", size=12)

box(550, 466, 520, 100)
text(568, 490, "Brain · Claude Sonnet 5.5 (swappable in the Rig)", size=13, color=INK, weight=650)
text(568, 512, "decides once, when the trigger fires; rules fallback", size=12)
text(568, 532, "returns act · skip · wait as JSON", size=12)
end = tag(568, 554, "CONTROL", "control")
text(end + 8, 555, "holds no order-placing tools", size=11.5)

box(550, 596, 520, 60)
text(568, 620, "Leash", size=13, color=INK, weight=650)
text(568, 641, "limits → orders preview → orders create (client_order_id)", size=12)
tag(980, 620, "CONTROL", "control")

box(550, 686, 250, 74, stroke=GHOST, dash="5 3", width=1.5)
text(568, 710, "Ghost gateway", size=13, color=INK, weight=650)
tag(700, 709, "GHOST", "ghost")
text(568, 732, "simulated fills at the live price", size=12)
text(568, 750, "default for every Play", size=11.5, color=MUTED)

box(820, 686, 250, 74)
text(838, 710, "Coinbase gateway", size=13, color=INK, weight=650)
text(838, 732, "coinbase CLI · the user's own key", size=12)
end = tag(838, 751, "CONTROL", "control")
text(end + 8, 752, "live trading off", size=11.5)

text(550, 798, "Also: Drafter + Deck (Haiku 5.5) · Replay on public candles (always simulated)", size=11.5, color=MUTED)

# internal flow
arrow([(810, 256), (810, 274)])
arrow([(810, 356), (810, 374)])
arrow([(810, 436), (810, 464)], label="trigger fires", at=(822, 450), step=3)
arrow([(810, 566), (810, 594)], label="decision only", at=(822, 580))
arrow([(810, 656), (810, 671), (675, 671), (675, 684)])
arrow([(810, 671), (945, 671), (945, 684)])

# ------------------------------------------------------- right: external
card(1190, 370, 350, 70, "COINBASE · PUBLIC", "Ticker WebSocket + candles")
card(1190, 460, 350, 70, "ANTHROPIC", "Claude API")
text(1522, 504, "Sonnet 5.5 · Haiku 5.5", size=11.5, color=MUTED, anchor="end")
card(1190, 550, 350, 92, "COINBASE · x402", "Evidence catalog (USDC on Base)")
end = tag(1208, 624, "SIMULATED", "ghost")
text(end + 8, 625, "at real prices until funded", size=11.5)
card(1190, 676, 350, 94, "COINBASE · ADVANCED TRADE", "orders preview / create")
text(1208, 740, "one dedicated portfolio per key", size=12)
text(1208, 758, "exits ride on the order", size=11.5, color=MUTED)

arrow([(1190, 406), (1072, 406)], label="ticks", at=(1096, 398), step=2)
arrow([(1070, 494), (1188, 494)], label="decide", at=(1092, 486))
arrow([(1070, 552), (1080, 552), (1080, 596), (1188, 596)], label="buy evidence", at=(1086, 588))
arrow([(1070, 723), (1188, 723)], label="order", at=(1096, 715), step=6)

# ------------------------------------------------- left lanes: clients ⇄ engine
arrow([(380, 206), (548, 206)], label="arm a Play", at=(392, 198), step=1)
arrow([(380, 566), (500, 566), (500, 226), (548, 226)], label="arm", at=(388, 558), step=1)
arrow([(380, 342), (470, 342), (470, 246), (548, 246)], label="Approve", at=(386, 334), step=5)
arrow([(530, 760), (382, 760)], label="writes Plays + Tape", at=(392, 752))
# Realtime back to the phone, in the left margin
arrow([(60, 724), (32, 724), (32, 256), (76, 256)])
text(24, 490, "Realtime → Live Activity:  4 asks “Your call?”   7 shows the fill", size=12, color=INK, weight=500, anchor="middle", rotate=-90)

# ------------------------------------------------------------- legend
lx, ly = 530, 860
badge(lx, ly, "1")
text(lx + 26, ly + 4, "to 7: one Play, from arming to the fill", size=12)
end = tag(lx + 290, ly + 4, "GHOST", "ghost")
text(end + 8, ly + 5, "simulated, no real money", size=12)
end = tag(lx + 530, ly + 4, "CONTROL", "control")
text(end + 8, ly + 5, "enforced in code, not by the model", size=12)
text(530, 894, "Status 2026-10-25: LIVE_TRADING_ENABLED=false, so every Play is Ghost; x402 evidence is simulated at real catalog prices.",
     size=11.5, color=MUTED)

svg = (
    f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" '
    f'aria-label="Baseland architecture: the iPhone app or Claude Code arms a Play on the engine; plain-code watchers on '
    f'Coinbase ticks fire the trigger; Claude returns a decision only; the user approves from the Dynamic Island; '
    f'the Leash previews and places the order through the Ghost or Coinbase gateway; Supabase Realtime updates the phone.">'
    f'<title>Baseland: how one Play runs</title>'
    f'<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
    f'<path d="M0,0 L10,5 L0,10 z" fill="{SOFT}"/></marker></defs>'
    + "\n".join(out)
    + "</svg>\n"
)
Path(__file__).with_name("architecture.svg").write_text(svg)
