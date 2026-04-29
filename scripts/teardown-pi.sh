#!/usr/bin/env bash
# Removes everything this project installed on this Pi.
# Idempotent — safe to run multiple times.
#
# Usage (from the laptop):
#   ssh -i ~/.ssh/id_pi pi@<pi-ip> "bash ~/landslide-warning/scripts/teardown-pi.sh"
#
# What this REMOVES on the Pi:
#   - landslide-api, landslide-mqtt, cloudflared systemd services
#   - Docker compose stack (containers + named volume = wipes Postgres data)
#   - Project Docker images (timescaledb, mosquitto, hello-world)
#   - Docker Engine itself (apt + /var/lib/docker)
#   - cloudflared package + ~/.cloudflared
#   - Repo clone at ~/landslide-warning (including the venv)
#   - tmux apt package
#   - Laptop SSH key entry from ~/.ssh/authorized_keys (matched by comment "claude-on-laptop-to-pi")
#
# What this LEAVES alone:
#   - git, python3-venv, python3-dev, build-essential (commonly pre-installed)
#   - Anything outside the project (other apt packages, /home/pi/<other stuff>, etc.)
#   - Vercel project (delete manually from vercel.com/dashboard)
#   - Discord webhook (delete manually from channel settings if you don't want it accepting POSTs)
#
# set -u for unset-var safety. NOT -e: we want to continue past failures from
# already-removed items so re-runs are idempotent.
set -u

echo "=== Stopping + disabling systemd services ==="
sudo systemctl disable --now landslide-api landslide-mqtt cloudflared 2>/dev/null || true
sudo rm -f /etc/systemd/system/landslide-api.service /etc/systemd/system/landslide-mqtt.service /etc/systemd/system/cloudflared.service
sudo systemctl daemon-reload

echo "=== Killing tmux sessions (sim01, sim02) ==="
tmux kill-session -t sim01 2>/dev/null || true
tmux kill-session -t sim02 2>/dev/null || true

echo "=== Tearing down Docker stack (containers + volumes) ==="
if [ -d "$HOME/landslide-warning" ]; then
  cd "$HOME/landslide-warning" && docker compose down -v 2>/dev/null || true
fi

echo "=== Removing project Docker images ==="
docker image rm -f timescale/timescaledb:latest-pg15 eclipse-mosquitto:latest hello-world:latest 2>/dev/null || true

echo "=== Removing cloudflared binary, config, and tunnel ==="
sudo cloudflared service uninstall 2>/dev/null || true
sudo apt purge -y cloudflared 2>/dev/null || true
rm -rf "$HOME/.cloudflared"
sudo rm -f /var/log/cloudflared.log

echo "=== Removing repo + venv ==="
rm -rf "$HOME/landslide-warning"

echo "=== Removing Docker engine ==="
sudo apt purge -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin 2>/dev/null || true
sudo rm -f /etc/apt/sources.list.d/docker.list /etc/apt/keyrings/docker.asc
sudo apt autoremove -y
sudo rm -rf /var/lib/docker /var/lib/containerd /etc/docker

echo "=== Removing tmux apt package ==="
sudo apt purge -y tmux 2>/dev/null || true
sudo apt autoremove -y

echo "=== Removing laptop SSH key from authorized_keys ==="
sed -i '/claude-on-laptop-to-pi/d' "$HOME/.ssh/authorized_keys" 2>/dev/null || true

echo
echo "=== Done. Verifying teardown ==="
echo "--- Listening ports (should be empty for our ports): ---"
sudo ss -tlnp 2>/dev/null | awk '/:(1883|5432|5433|8000|80|443)\s/' || echo "[ok] no project ports listening"
echo "--- Docker (should be 'command not found'): ---"
which docker >/dev/null 2>&1 && echo "[warn] docker still present at $(which docker)" || echo "[ok] docker removed"
echo "--- Repo dir: ---"
[ ! -d "$HOME/landslide-warning" ] && echo "[ok] ~/landslide-warning removed" || echo "[warn] still present"
echo "--- cloudflared: ---"
which cloudflared >/dev/null 2>&1 && echo "[warn] cloudflared still present" || echo "[ok] cloudflared removed"
echo "--- Systemd units: ---"
systemctl list-unit-files 2>/dev/null | grep -E '^(landslide-|cloudflared)' && echo "[warn] units still present" || echo "[ok] no project units"
echo
echo "Teardown complete. Manual follow-ups:"
echo "  1. Delete Vercel project: https://vercel.com/dashboard"
echo "  2. Delete Discord webhook from channel settings (optional)"
echo "  3. On laptop: rm ~/.ssh/id_pi ~/.ssh/id_pi.pub  (optional)"
echo "  4. On laptop: ssh-keygen -R <pi-ip>             (forget host key)"
