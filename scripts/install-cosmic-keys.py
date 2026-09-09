#!/usr/bin/python3
"""Install the narrowly scoped keyboard helper; run with pkexec or sudo."""
import os
from pathlib import Path
import pwd
import shutil
import subprocess
import sys

if os.geteuid() != 0:
    sys.exit("Administrator authentication is required to install the keyboard helper.")
uid_text = os.environ.get("PKEXEC_UID") or os.environ.get("SUDO_UID")
if not uid_text or not uid_text.isdecimal() or int(uid_text) == 0:
    sys.exit("Run this installer from your normal desktop account using pkexec or sudo.")
uid = int(uid_text)
pwd.getpwuid(uid)
root = Path(__file__).resolve().parent.parent
binary = root / "resources/bin/cosmic-right-ctrl"
if not binary.is_file() or binary.read_bytes()[:4] != b"\x7fELF":
    sys.exit("Build the helper first: npm run compile:cosmic-keys")

def install(destination, content, mode):
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.is_symlink():
        sys.exit(f"Refusing to replace a symbolic link: {destination}")
    if destination.exists() and destination.read_bytes() != content:
        shutil.copy2(destination, str(destination) + ".previous")
    temporary = destination.with_name(destination.name + ".new")
    with temporary.open("xb") as stream:
        stream.write(content)
    os.chmod(temporary, mode)
    os.chown(temporary, 0, 0)
    os.replace(temporary, destination)

install(Path("/usr/local/libexec/cosmic-wispr/right-ctrl"), binary.read_bytes(), 0o755)
for name in ["cosmic-wispr-keys.socket", "cosmic-wispr-keys@.service"]:
    content = (root / "resources/systemd" / name).read_text().replace("@UID@", str(uid)).encode()
    install(Path("/etc/systemd/system") / name, content, 0o644)
subprocess.run(["systemctl", "daemon-reload"], check=True)
subprocess.run(["systemctl", "enable", "--now", "cosmic-wispr-keys.socket"], check=True)
print("Right Ctrl helper installed. Cosmic Wispr can connect without further authentication.")
