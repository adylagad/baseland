"""Trims the home screen a simulator clip ends on (the app is closed when a
UI test finishes) by finding where the final frame's picture began. Use it
only on clips that end on the home screen.

    python3 -I scripts/trim-home-tail.py in.mp4 out.mp4 [keep seconds of it]
"""
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageChops

src, out = sys.argv[1], sys.argv[2]
keep = float(sys.argv[3]) if len(sys.argv) > 3 else 0.0
dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", src],
                           capture_output=True, text=True, check=True).stdout)
window = min(20.0, dur)
with tempfile.TemporaryDirectory() as tmp:
    subprocess.run(["ffmpeg", "-loglevel", "error", "-i", src, "-vf", f"select=gte(t\\,{dur - window}),fps=10,scale=120:-2",
                    "-vsync", "vfr", f"{tmp}/%04d.png"], check=True)
    frames = sorted(Path(tmp).glob("*.png"))
    last = Image.open(frames[-1]).convert("L")
    pixels = last.size[0] * last.size[1]

    def mean_diff(f):
        h = ImageChops.difference(Image.open(f).convert("L"), last).histogram()
        return sum(v * n for v, n in enumerate(h)) / pixels

    # The app's light screens differ from the wallpaper by far more than the
    # home-screen transition frames do; walk back past both.
    first_same = len(frames) - 1
    for i in range(len(frames) - 1, -1, -1):
        if mean_diff(frames[i]) > 40:
            break
        first_same = i
cut_at = dur - window + first_same / 10 - 0.3 + keep
# A teardown lasts a second or two; a longer "tail" is the app's own last
# screen (light like the last frame), so leave the clip alone.
if dur - cut_at > 5:
    cut_at = dur
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-t", f"{cut_at:.2f}", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                "-crf", "18", "-movflags", "+faststart", out], check=True)
print(f"{out}: {cut_at:.1f} s (the last {dur - cut_at:.1f} s were the final screen)")
