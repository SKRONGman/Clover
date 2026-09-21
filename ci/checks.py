#!/usr/bin/env python3
"""
ci/checks.py - Clover's safety net. One command, four checks:

    python ci/checks.py

  1. file sizes   Claude pushes files inline and a file near 25 KB can arrive cut
                  off - and a cut-off file still commits. Hand-edited files must
                  stay under the limit so that can't happen quietly.
  2. stale words  wording the page must never say again.
  3. python       ci/test_refresh.py - feeds down, carry-forward, grading, sim tables.
  4. the page     ci/smoke.js - boots the real page code in Node against data built
                  by the real refresh code, and checks the page's % = Python's %.

Runs on every push (.github/workflows/ci.yml only calls this file, so the checks
can change without touching the workflow). Exit code 1 = something is wrong.
"""
import io
import os
import sys
import shutil
import tempfile
import subprocess
import contextlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FAIL_BYTES = 24800      # the largest file ever pushed intact was 24,767 bytes
WARN_BYTES = 20000      # house rule: keep hand-edited files under 20 KB
HAND_EDITED = (".py", ".js", ".html", ".md", ".yml", ".css", ".txt")
MACHINE_WRITTEN = {"ratings.js"}            # refresh.py writes it; nobody pushes it by hand

# Words the page must not say. The number is how many are on the page today and
# may only go DOWN. Row 2 (the truth pass) takes every one of these to 0.
PAGE_FILES = ("index.html", "preview1.js", "preview2.js", "preview3.js")
STALE_WORDS = {"ESPN BET": 1, "Slips tab": 2, "See the Card": 1, "Not on my app": 2,
               "not on your app": 2, "The Card": 2, "run refresh.py": 2, "every other Thursday": 0}


def tracked_files():
    out = []
    for base, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in (".git", "__pycache__", "node_modules")]
        out += [os.path.join(base, f) for f in files]
    return out


def check_sizes():
    bad = []
    for p in tracked_files():
        name = os.path.relpath(p, ROOT)
        if not name.endswith(HAND_EDITED) or name in MACHINE_WRITTEN:
            continue
        n = os.path.getsize(p)
        if n >= FAIL_BYTES:
            bad.append(f"{name} is {n:,} bytes (limit {FAIL_BYTES:,}) - split it")
        elif n >= WARN_BYTES:
            print(f"  warn  {name} is {n:,} bytes - over the 20 KB house rule, split it next time it changes")
    return bad


def check_words():
    text = "".join(open(os.path.join(ROOT, f), encoding="utf-8").read() for f in PAGE_FILES)
    bad = []
    for word, allowed in STALE_WORDS.items():
        n = text.count(word)
        if n > allowed:
            bad.append(f'"{word}" appears {n}x on the page (allowed {allowed})')
        elif n < allowed:
            print(f'  note  "{word}" is down to {n} - lower its number in ci/checks.py')
    return bad


def check_python():
    r = subprocess.run([sys.executable, os.path.join(ROOT, "ci", "test_refresh.py")], capture_output=True, text=True)
    print(r.stdout, end="")
    return [] if r.returncode == 0 else ["python tests failed" + (": " + r.stderr.strip()[-400:] if r.stderr.strip() else "")]


def check_page():
    if not shutil.which("node"):
        return ["node is not installed - the page smoke test cannot run"]
    sys.path[:0] = [ROOT, os.path.join(ROOT, "ci")]
    import test_refresh
    bad = []
    for mode in ("ok", "quota"):                    # a healthy refresh, and one with the college feed down
        tmp, here = tempfile.mkdtemp(), os.getcwd()
        try:
            os.chdir(tmp)
            with contextlib.redirect_stdout(io.StringIO()):
                test_refresh.run(cfbd_mode=mode)
        finally:
            os.chdir(here)
        r = subprocess.run(["node", os.path.join(ROOT, "ci", "smoke.js"), ROOT, os.path.join(tmp, "ratings.js")],
                           capture_output=True, text=True)
        print(r.stdout, end="")
        if r.returncode:
            bad.append(f"page smoke test failed (feeds: {mode}) {r.stderr.strip()[-300:]}")
        shutil.rmtree(tmp, ignore_errors=True)
    live = os.path.join(ROOT, "ratings.js")         # and the data file that is actually live right now
    if os.path.exists(live):
        r = subprocess.run(["node", os.path.join(ROOT, "ci", "smoke.js"), ROOT, live, "--live"], capture_output=True, text=True)
        print(r.stdout, end="")
        if r.returncode:
            bad.append("page smoke test failed on the LIVE ratings.js")
    return bad


def main():
    problems = []
    for title, fn in (("file sizes", check_sizes), ("stale words", check_words),
                      ("python", check_python), ("the page", check_page)):
        print(f"{title}:")
        found = fn()
        if not found and title in ("file sizes", "stale words"):
            print("  ok")
        problems += found
    if problems:
        print("\nCHECKS FAILED:")
        for p in problems:
            print("  - " + p)
        return 1
    print("\nAll checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
