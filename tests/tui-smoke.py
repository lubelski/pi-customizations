"""Exercise the shipped CLI bundle, not just unbundled component exports.

No credentials or model calls: isolated HOME/config/cwd, offline, MCP disabled.
Requires a POSIX host and Python 3 (available on the Linux/macOS CI runners).
"""
import errno
import fcntl
import json
import os
from pathlib import Path
import pty
import re
import select
import shutil
import signal
import struct
import subprocess
import tempfile
import termios
import time

REPO = Path(__file__).resolve().parents[1]
PI = Path(os.environ.get("PI_PACKAGE_ROOT", REPO / "node_modules/@earendil-works/pi-coding-agent")).resolve()
CLI = PI / "dist/bundle/cli.js"
ANSI = re.compile(rb"\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)")


def smoke(mode, theme):
    with tempfile.TemporaryDirectory(prefix="pi-ui-ci-") as temporary:
        home = Path(temporary)
        agent = home / "agent"
        project = home / "project"
        project.mkdir()
        agent.mkdir()
        # Match the documented installed layout, without reading the user's config.
        for directory in ("extensions", "lib", "themes"):
            shutil.copytree(REPO / directory, agent / directory)
        (agent / "settings.json").write_text(json.dumps({
            "theme": theme, "tuiMode": mode, "quietStartup": True,
            "showHardwareCursor": True, "lastChangelogVersion": "1.0.4",
        }))
        env = {key: os.environ[key] for key in ("PATH", "TMPDIR", "SYSTEMROOT") if key in os.environ}
        env.update(HOME=str(home), PI_CODING_AGENT_DIR=str(agent), PI_OFFLINE="1",
                   PI_SKIP_VERSION_CHECK="1", PI_TELEMETRY="0", TERM="xterm-256color",
                   COLORTERM="truecolor", PI_IMAGE_PROTOCOL="none")
        master, slave = pty.openpty()
        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 32, 120, 0, 0))
        process = subprocess.Popen(
            [shutil.which("node"), str(CLI), "--offline", "--no-mcp", "--no-session",
             "--no-skills", "--no-prompt-templates", "--no-context-files", "--no-approve"],
            stdin=slave, stdout=slave, stderr=slave, cwd=project, env=env, start_new_session=True,
        )
        os.close(slave)
        output = bytearray()

        def read_output(timeout=0.1):
            if select.select([master], [], [], timeout)[0]:
                try:
                    output.extend(os.read(master, 65536))
                except OSError as error:
                    if error.errno != errno.EIO:
                        raise

        def expect(text, start=0, timeout=20):
            deadline = time.monotonic() + timeout
            while time.monotonic() < deadline:
                read_output()
                if text.encode() in ANSI.sub(b"", bytes(output[start:])):
                    return
                if process.poll() is not None:
                    raise AssertionError(f"Pi exited ({process.returncode}) waiting for {text!r}")
            raise AssertionError(f"Timed out waiting for {text!r}")

        try:
            expect("EXT:")  # Proves our editor/footer were instantiated and rendered.
            expect("native-cursor")
            expect("assistant-bg")
            expect("half-bleed")
            expect("recessed-tools")
            for _ in range(2):
                start = len(output)
                os.write(master, b"/reload\r")
                expect("Reloaded keybindings", start)
                expect("EXT:", start)
            # Trigger autocomplete and render at narrow and wide sizes.
            start = len(output)
            os.write(master, b"/ren")
            expect("rename", start)
            os.write(master, b"\x1b")
            time.sleep(0.15)
            os.write(master, b"\x15")  # Clear unfinished input without submitting it.
            for columns in (40, 160):
                fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack("HHHH", 32, columns, 0, 0))
                os.kill(process.pid, signal.SIGWINCH)
                until = time.monotonic() + 0.3
                while time.monotonic() < until:
                    read_output()
                assert process.poll() is None, "Pi crashed during resize"
            os.write(master, b"\x04")
            deadline = time.monotonic() + 10
            while process.poll() is None and time.monotonic() < deadline:
                read_output()
            assert process.poll() == 0, f"Unclean exit: {process.poll()}"
            read_output(0)
            plain = ANSI.sub(b"", bytes(output)).decode(errors="replace")
            for error in ("Failed to load extension", "[Extension issues]", "TypeError:", "ReferenceError:", "Unknown theme color"):
                assert error not in plain, error
            assert not re.search(r'Extension ".*?" error:', plain), "Extension handler failed"
            crashes = agent / "crashes.json"
            assert not crashes.exists() or not json.loads(crashes.read_text()), "Pi recorded a crash"
        except BaseException:
            artifacts = REPO / "test-artifacts"
            artifacts.mkdir(exist_ok=True)
            path = artifacts / f"{mode}-{theme}.log"
            path.write_bytes(output)
            print(f"FAIL {mode}/{theme}; terminal output: {path}", flush=True)
            print(ANSI.sub(b"", bytes(output[-5000:])).decode(errors="replace"), flush=True)
            raise
        finally:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
            os.close(master)
        print(f"PASS bundled CLI: {mode}/{theme} (startup, reload x2, autocomplete, resize, exit)", flush=True)


if __name__ == "__main__":
    for mode in ("fullscreen", "regular"):
        for theme in ("turquoise", "dark", "light"):
            smoke(mode, theme)
