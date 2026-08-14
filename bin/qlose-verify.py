#!/usr/bin/env python3
"""QLOSE theme verification harness.

Checks that the local dev server renders each page with the markup contract
its section is supposed to produce. Run with the dev server up.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

BASE = os.environ.get("QLOSE_BASE", "http://127.0.0.1:9292")
CHECKS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "checks.json")

# `shopify theme dev` uploads changed files asynchronously, so a check run
# straight after an edit can hit the previous revision and report a false
# failure. Retry failures for a while before believing them.
RETRY_SECONDS = int(os.environ.get("QLOSE_RETRY_SECONDS", "40"))
RETRY_INTERVAL = 2.0


def fetch(path):
    req = urllib.request.Request(BASE + path, headers={"User-Agent": "qlose-verify"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:
        return 0, "{}: {}".format(type(e).__name__, e)


def run(check):
    status, body = fetch(check["path"])
    failures = []
    if status != 200:
        failures.append("HTTP {}".format(status))
        if status == 0:
            failures.append(body[:200])
        return failures
    for needle in check.get("contains", []):
        if needle not in body:
            failures.append("missing: {!r}".format(needle))
    for needle in check.get("absent", []):
        if needle in body:
            failures.append("unexpected: {!r}".format(needle))
    return failures


def main():
    with open(CHECKS, encoding="utf-8") as fh:
        checks = json.load(fh)
    only = sys.argv[1] if len(sys.argv) > 1 else None
    # --now skips the sync grace period; use it when you expect a failure,
    # such as the red step of a task.
    patient = "--now" not in sys.argv
    selected = [c for c in checks if not only or only in (c["name"], "--now")]

    failed = 0
    for check in selected:
        deadline = time.time() + (RETRY_SECONDS if patient else 0)
        while True:
            failures = run(check)
            if not failures or time.time() >= deadline:
                break
            time.sleep(RETRY_INTERVAL)
        if failures:
            failed += 1
            print("FAIL  {}  ({})".format(check["name"], check["path"]))
            for f in failures:
                print("        " + f)
        else:
            print("ok    {}  ({})".format(check["name"], check["path"]))
    if failed:
        print("\n{} check(s) failed".format(failed))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
