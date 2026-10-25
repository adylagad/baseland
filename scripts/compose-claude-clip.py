"""Clip 2 of the submission video: the Claude Code terminal (an asciinema
recording rendered with agg) beside the simulator recording, in sync.

    python3 -I scripts/compose-claude-clip.py <dir> out.mp4 [skip seconds]

<dir> holds clip2.cast, clip2-phone.mp4, clip2-term-start, clip2-phone-start
clip2-term-end (unix seconds) and marks.txt from FinalRecordingTests.testClip2ClaudeCodeArrives.
The first [skip] seconds of the terminal (Claude Code's folder-trust prompt)
are left out.
"""
import subprocess
import sys
from pathlib import Path

d, out = Path(sys.argv[1]), sys.argv[2]
skip = float(sys.argv[3]) if len(sys.argv) > 3 else 4.0
term_start = float((d / "clip2-term-start").read_text())
# When Claude Code's turn ended (its answer is on screen); after that it exits.
term_end = float((d / "clip2-term-end").read_text())
phone_start = float((d / "clip2-phone-start").read_text())
end = next(float(l.split()[-1]) for l in open(d / "marks.txt") if "testClip2ClaudeCodeArrives" in l and " end " in l)

t0 = term_start + skip
duration = end - t0
gif = d / "clip2.gif"
# Real time: no idle compression, or the two halves drift apart.
subprocess.run(["agg", "--idle-time-limit", "600", "--font-size", "22", "--theme", "monokai", str(d / "clip2.cast"), str(gif)], check=True)

W, H = 1920, 1080
graph = (
    f"color=c=0x14161A:s={W}x{H}:r=30:d={duration:.3f}[bg];"
    f"[0:v]fps=30,trim=start={skip:.3f}:end={term_end - term_start + 1:.3f},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=600,"
    f"scale=1240:-2:flags=lanczos[term];"
    f"[1:v]fps=30,trim=start={t0 - phone_start:.3f},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=600,"
    f"scale=-2:1000:flags=lanczos[phone];"
    f"[bg][term]overlay=x=40:y=(H-h)/2:shortest=0[a];"
    f"[a][phone]overlay=x=W-w-60:y=40,trim=duration={duration:.3f}[out]"
)
subprocess.run(
    ["ffmpeg", "-y", "-loglevel", "error", "-i", str(gif), "-i", str(d / "clip2-phone.mp4"), "-filter_complex", graph,
     "-map", "[out]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-movflags", "+faststart", out],
    check=True,
)
print(f"{out}: {duration:.1f} s")
