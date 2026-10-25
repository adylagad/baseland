"""Cuts the waits out of a simulator recording, using the markers a
FinalRecordingTests test wrote ("<test> start|cut-start|cut-end|end <unix s>").

    python3 -I scripts/cut-clip.py raw.mp4 <recording start unix s> marks.txt <test name> out.mp4 [scale]

Keeps start → end minus every cut-start → cut-end stretch (a short tail of
each wait stays, so the change on screen is seen), at a constant 30 fps:
simulator recordings have a variable frame rate. Their timestamps also run
slow against the wall clock (about 3-5% over two minutes): [scale] is video
seconds per wall second, measured from an anchor such as the recording's
real length over the wall time it ran.
"""
import subprocess
import sys

raw, rec_start, marks_file, test, out = sys.argv[1], float(sys.argv[2]), sys.argv[3], sys.argv[4], sys.argv[5]
scale = float(sys.argv[6]) if len(sys.argv) > 6 else 1.0
TAIL = 1.0  # seconds of each wait kept before the cut-end moment

marks = []
for line in open(marks_file):
    parts = line.split()
    if len(parts) >= 3 and test in parts[1]:
        marks.append((parts[-2], (float(parts[-1]) - rec_start) * scale))

start = next(t for k, t in marks if k == "start")
end = next(t for k, t in marks if k == "end") - 0.3
keep, cursor = [], start
for (k, t), (k2, t2) in zip(marks, marks[1:]):
    if k == "cut-start" and k2 == "cut-end":
        keep.append((cursor, t))
        cursor = max(t, t2 - TAIL)
keep.append((cursor, end))
keep = [(max(0.0, a), b) for a, b in keep if b - a > 0.2]

chains = "".join(
    f"[0:v]fps=30,trim=start={a:.3f}:end={b:.3f},setpts=PTS-STARTPTS[v{i}];" for i, (a, b) in enumerate(keep)
)
concat = "".join(f"[v{i}]" for i in range(len(keep))) + f"concat=n={len(keep)}:v=1:a=0[out]"
subprocess.run(
    ["ffmpeg", "-y", "-loglevel", "error", "-i", raw, "-filter_complex", chains + concat, "-map", "[out]",
     "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-movflags", "+faststart", out],
    check=True,
)
total = sum(b - a for a, b in keep)
print(f"{out}: kept {len(keep)} segments, {total:.1f} s")
