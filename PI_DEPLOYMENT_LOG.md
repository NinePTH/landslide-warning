# Pi Deployment Log

Living record of the Raspberry Pi deployment for this project. Updated as the deployment proceeds.

> **Status:** live (Phases A→C complete) · last updated 2026-04-30

---

## Pi facts

| | |
|---|---|
| Model | Raspberry Pi 4 Model B Rev 1.4 |
| RAM | 4 GB |
| OS | Raspbian GNU/Linux 11 (bullseye) |
| Architecture | `aarch64` (64-bit) |
| Disk | 29 GB SD card · 19 GB free at start |
| Hostname | `raspberrypi` (default) |
| User | `pi` |
| LAN IP | DHCP, **changes often** — get current with `hostname -I` on the Pi or check the router. Observed history: `.106 → .24 → .221 → .56 → .80`. No static lease reserved (TODO if reliability matters). |
| Pre-installed by senior | Raspbian + WiFi only — no Postgres, Mosquitto, Docker, cloudflared, or any of our stack |
| Pre-installed Python | `python3` 3.9.2 (system) |

## Access setup

- **SSH key auth** from laptop to Pi:
  - Laptop private key: `~/.ssh/id_pi` (ed25519, no passphrase)
  - Laptop public key: `~/.ssh/id_pi.pub`, comment `claude-on-laptop-to-pi`
  - Installed on Pi at `~/.ssh/authorized_keys`
  - Connect: `ssh -i ~/.ssh/id_pi pi@10.173.252.80`
- **Passwordless sudo** for the `pi` user via `/etc/sudoers.d/010_pi-nopasswd` containing `pi ALL=(ALL) NOPASSWD:ALL`.

## What got installed on the Pi

### Apt packages (added)
| Package | Notes |
|---|---|
| `git` | Was at `2.30.2-1+deb11u2`, upgraded to `1+deb11u5` as part of the install. |
| `python3-venv` | For the Python venv used by FastAPI + MQTT subscriber. |
| `python3-dev` | Headers — needed by some pip wheels. |
| `build-essential` | gcc + make — needed by some pip wheels. |
| `tmux` | For running `simulate.py` detached. |

> **Skipped:** the full `apt upgrade -y` system update (439 outdated packages). Reasoning in the plan: our stack runs in containers / a venv and doesn't depend on host package versions, so upgrading would be ~20 min for zero benefit and a larger return-state delta.

### Docker Engine
- Installed via the official Docker apt repo (NOT via `get.docker.com` — see Quirks below).
- Apt source: `/etc/apt/sources.list.d/docker.list` → `https://download.docker.com/linux/raspbian bullseye stable`
- GPG keyring: `/etc/apt/keyrings/docker.asc`
- Packages installed: `docker-ce`, `docker-ce-cli`, `containerd.io`, `docker-buildx-plugin`, `docker-compose-plugin`.
- Engine version: **28.5.2**, build `ecc6942`.
- Compose plugin version: `5.0.2-1~raspbian.11~bullseye` (gives `docker compose` v2 subcommand).
- `pi` user added to `docker` group → can run docker without sudo.
- Systemd: `docker.service` and `containerd.service` enabled at boot.

### Repo + project files
- Cloned `https://github.com/NinePTH/landslide-warning.git` to `~/landslide-warning`.
- `.env` created from `.env.example`, current values:
  - `DATABASE_URL=postgresql://landslide:landslide@localhost:5432/landslide_db`
  - `MQTT_BROKER=localhost`, `MQTT_PORT=1883`, `MQTT_TOPIC=landslide/sensors`
  - `DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/<redacted>` — set in Phase C
  - `API_URL=https://<current trycloudflare URL>` — set in Phase B; **changes every ~24h**, see Tunnel URL recovery procedure below
  - `CORS_ORIGINS=http://localhost:3000,https://landslide-warning.vercel.app` — Vercel domain added in Phase C
  - `STATION_01_SLOPE_ANGLE=35.0`, `STATION_01_PROXIMITY_TO_WATER=0.5`
  - `STATION_02_SLOPE_ANGLE`, `STATION_02_PROXIMITY_TO_WATER` set per second-station setup
- `docker-compose.yml` edited **on the Pi only** (NOT committed):
  - Postgres port mapping `5433:5432` → `5432:5432` (so `DATABASE_URL=...@localhost:5432/...` works without modification)
  - `restart: unless-stopped` added to both `postgres` and `mosquitto` services (so they auto-recover after Pi reboot or container crash)

### Docker images pulled
- `eclipse-mosquitto:latest` (20.3 MB) — Mosquitto 2.1.2
- `timescale/timescaledb:latest-pg15` (~250 MB) — TimescaleDB on Postgres 15
- `hello-world:latest` (4.1 KB) — used once to verify Docker works; can be removed.

### Running containers
| Name | Image | Ports | Volume |
|---|---|---|---|
| `landslide-warning-postgres-1` | `timescale/timescaledb:latest-pg15` | `5432:5432` | `landslide-warning_pgdata` (named volume) |
| `landslide-warning-mosquitto-1` | `eclipse-mosquitto:latest` | `1883:1883` | bind mount `./mosquitto.conf` |

### Python venv
- Path: `~/landslide-warning/api/.venv`
- Created by `python3 -m venv .venv`
- Deps from `api/requirements.txt`, with the **pandas/numpy pin applied** (see Quirks below) — `pip install "numpy<2" "pandas==1.5.3"` before `pip install -r requirements.txt`.
- ML model trained on Pi via `python train_model.py` → output `~/landslide-warning/api/ml/model.pkl` (~65 KB, dated 2026-04-29).

## Cloudflare Tunnel

- **Mode:** *quick tunnel* (no domain needed). cloudflared runs `tunnel --url http://localhost:8000` and Cloudflare assigns a random `*.trycloudflare.com` subdomain. URL changes every time `cloudflared` restarts; the systemd service is configured to auto-restart and stay up.
- **Public URL (current):** `https://hitting-commander-aqua-bureau.trycloudflare.com`
  *(if cloudflared restarts you'll get a new URL — read it from `/var/log/cloudflared.log`)*
- **systemd:** `/etc/systemd/system/cloudflared.service`, runs as `pi`, log at `/var/log/cloudflared.log`.
- **Architecture note:** since the Pi userspace is `armhf`, we install `cloudflared-linux-armhf.deb`, NOT `cloudflared-linux-arm64.deb` (arm64 won't run on a 32-bit userspace).

```bash
# Get the current URL whenever you need it
grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /var/log/cloudflared.log | head -1
# After a cloudflared restart, this URL changes — update API_URL in .env + Vercel env var.
```

### Systemd service files

All three units live in `/etc/systemd/system/` and are owned by root.

**`landslide-api.service`** — FastAPI on uvicorn, port 8000:
```ini
[Unit]
Description=Landslide Warning System - FastAPI
After=docker.service network.target
Requires=docker.service

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/landslide-warning/api
EnvironmentFile=/home/pi/landslide-warning/.env
ExecStart=/home/pi/landslide-warning/api/.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

**`landslide-mqtt.service`** — MQTT subscriber that writes to Postgres:
```ini
[Unit]
Description=Landslide Warning System - MQTT Subscriber
After=docker.service network.target landslide-api.service
Requires=docker.service

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/landslide-warning/api
EnvironmentFile=/home/pi/landslide-warning/.env
ExecStart=/home/pi/landslide-warning/api/.venv/bin/python mqtt_subscriber.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

**`cloudflared.service`** — quick tunnel to localhost:8000:
```ini
[Unit]
Description=Cloudflare Tunnel - quick mode for landslide-api
After=network-online.target landslide-api.service
Wants=network-online.target

[Service]
Type=simple
User=pi
ExecStart=/usr/bin/cloudflared tunnel --url http://localhost:8000 --logfile /var/log/cloudflared.log --loglevel info
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

## What got installed off the Pi

- **Laptop SSH key pair** (`~/.ssh/id_pi*`) — see Access setup above.
- **Vercel project** at `https://landslide-warning.vercel.app`. Root dir `dashboard`. Single env var: `NEXT_PUBLIC_API_URL=<current trycloudflare URL>` — **must be updated every ~24h** when the tunnel URL changes (see procedure below). Build command and framework auto-detected as Next.js.
- **Discord webhook** configured in `.env` as `DISCORD_WEBHOOK_URL`. Posts rich-embed alerts when `POST /alert` is called. Channel/server: see Discord settings (URL itself is a secret, not in this log or the repo).

## ⚠ Tunnel URL recovery procedure (you WILL need this every ~24h)

**Problem:** This deployment uses a Cloudflare *quick tunnel* (`cloudflared tunnel --url http://localhost:8000`), not a named tunnel. Quick tunnels are explicitly **"no uptime guarantee"** per Cloudflare's own log message. In practice **the URL dies after roughly 24 hours**, even if `cloudflared` keeps running. The cloudflared process gets stuck retrying against the dead URL forever — `systemctl is-active cloudflared` says `active` but the public URL returns NXDOMAIN.

**Symptom:** `nslookup <your-trycloudflare-url> 8.8.8.8` returns "Non-existent domain". Vercel dashboard loads but shows no data. Pi-local `curl http://localhost:8000/stations` still works fine.

**Fix (~5 min including Vercel build):**

1. SSH to Pi: `ssh -i ~/.ssh/id_pi pi@<pi-ip>` (run `hostname -I` if you don't know the IP).
2. Restart cloudflared and grab the new URL:
   ```bash
   sudo systemctl restart cloudflared
   sleep 10
   sudo grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /var/log/cloudflared.log | tail -1
   ```
3. Update `.env` on the Pi with the new URL:
   ```bash
   sed -i 's|^API_URL=.*|API_URL=<new-url>|' ~/landslide-warning/.env
   sudo systemctl restart landslide-api
   ```
4. Vercel dashboard → `landslide-warning` project → **Settings → Environment Variables** → edit `NEXT_PUBLIC_API_URL` to the new URL.
5. Vercel **Deployments** tab → `⋮` on the latest deployment → **Redeploy** (uncheck "Use existing Build Cache" — `NEXT_PUBLIC_*` vars are baked at build time).
6. Wait ~1 min for the build to finish, then refresh `https://landslide-warning.vercel.app`.

**Permanent fix (deferred):** swap the quick tunnel for a *named* tunnel + your own thinc-registered domain (Phase E in the original deployment plan). One-time DNS setup, no more daily recovery. ~30-60 min of work + DNS propagation.

## Quirks hit during deployment

### `get.docker.com` bailed twice on an unrelated openjdk-11 mirror timeout
The official one-liner (`curl -fsSL https://get.docker.com | sudo sh`) ran `apt-get update` internally, which tried to fetch openjdk-11 `.deb` files from `mirrors.gbnetwork.com` (IP `103.72.163.170`), which timed out. The script treated this as fatal and exited before installing Docker. Retry hit the same mirror — not transient.

**Fix:** bypassed the convenience script and added Docker's apt repo manually, then ran `apt update` *only against* `sources.list.d/docker.list`:
```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/raspbian/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/raspbian bullseye stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update -o Dir::Etc::sourcelist="sources.list.d/docker.list" -o Dir::Etc::sourceparts="-" -o APT::Get::List-Cleanup="0"
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```
This worked first try.

### Docker Hub IPv6 initial timeout
First `docker run --rm hello-world` timed out fetching `registry-1.docker.io` (resolved to IPv6 only). Retry seconds later succeeded. Likely a flaky IPv6 path on the Pi's network. If this becomes a recurring problem, force IPv4 with:
```bash
echo '{"resolved-protocols":["ipv4"]}' | sudo tee /etc/docker/daemon.json
sudo systemctl restart docker
```
*(not needed yet — leaving for reference)*

### Internet disconnected mid-pull
User's home internet briefly dropped during the docker compose pull. The retry resumed cleanly because Docker resumes layer downloads from where they stopped.

### Pi DHCP IP changed mid-deployment
Pi's IP went `192.168.2.106` → `192.168.2.24` → `192.168.2.221` over the course of setup as the DHCP lease was renegotiated (likely after WiFi reconnects). SSH key auth + the `accept-new` host-key strategy meant we could just swap IPs without further setup. For the long term consider reserving a static lease for the Pi's MAC at the router, or using mDNS `raspberrypi.local`.

### Pre-existing dashboard hydration warning (cosmetic)
On first dashboard load, React logs a hydration mismatch from `dashboard/src/components/TopographicBackdrop.tsx:47`. The decorative SVG polylines have `points` strings that differ slightly between server- and client-side renders — almost certainly float-precision drift in the wave-math (`Math.cos/sin` results that round differently in different JS runtimes), not a `Math.random()` issue. The page renders fine; the warning is purely cosmetic. Fix when convenient: move the polyline-points generation into a `useEffect` so it only runs client-side, or hardcode the points after one render.

### 32-bit Python userspace on a 64-bit kernel — pandas wheel mismatch
This Pi runs **Raspbian 11 with a 64-bit kernel (`uname -m` = `aarch64`) but a 32-bit (`armhf`) userspace** — confirmed by `dpkg --print-architecture` returning `armhf` and `python3 -c "import platform; print(platform.architecture())"` returning `('32bit', 'ELF')`. This is the classic Raspbian-on-Pi-4 setup; the *64-bit* Raspberry Pi OS Lite would have given us aarch64 userspace and avoided this.

**Symptom:** `pip install -r requirements.txt` failed on `pandas` with `metadata-generation-failed`. Latest pandas (2.x+) only ships wheels for `manylinux_*_x86_64`, `manylinux_*_aarch64`, and a few others — **not** `linux_armv7l` (which is what 32-bit ARM Python looks for). Pip tried to compile from source, which needs Cython + Meson + a working numpy and didn't get past metadata generation.

**Fix:** pin pandas to the last release with armhf wheels for Python 3.9, and pin numpy to <2 to stay compatible with pandas 1.x:
```bash
pip install "numpy<2" "pandas==1.5.3"
pip install -r requirements.txt   # leaves pandas + numpy alone (pip's default upgrade strategy is "only-if-needed")
```

This is a **Pi-only constraint**, not a repo-level one — the dev laptops and CI will keep using whatever pandas resolves on their (64-bit) platform. If we later need this pinning in the repo, the right shape is environment markers:
```
pandas>=2.0; platform_machine!="armv7l"
pandas==1.5.3; platform_machine=="armv7l"
numpy<2;     platform_machine=="armv7l"
```

## Daily-ops cheat sheet

```bash
# SSH in (from the laptop)
ssh -i ~/.ssh/id_pi pi@10.173.252.80

# Container status + logs
cd ~/landslide-warning
docker compose ps
docker compose logs -f postgres
docker compose logs -f mosquitto
docker compose restart           # restart both services
docker compose down              # stop containers (data preserved in volume)
docker compose up -d             # bring them back

# Systemd services for the app (added in Phase A7-9)
sudo systemctl status landslide-api landslide-mqtt
sudo journalctl -u landslide-api -f
sudo journalctl -u landslide-mqtt -f
sudo systemctl restart landslide-api

# Simulator (added in Phase A8-9)
tmux ls                              # list running sims
tmux attach -t sim01                 # attach (detach: Ctrl-b then d)
tmux kill-session -t sim01           # stop sim
# Restart sim:
tmux new -d -s sim01 'cd ~/landslide-warning/api && source .venv/bin/activate && python simulate.py station_01'

# After pulling new code from GitHub
cd ~/landslide-warning
git pull
source api/.venv/bin/activate
pip install -r api/requirements.txt   # if requirements changed
python api/train_model.py             # if model needs retraining
sudo systemctl restart landslide-api landslide-mqtt
```

## Cleanup / teardown

When the Pi has to be returned to the senior, run:
```bash
ssh -i ~/.ssh/id_pi pi@10.173.252.80 "bash ~/landslide-warning/scripts/teardown-pi.sh"
```
(Script details in `scripts/teardown-pi.sh`. Will be added to the repo as part of this deployment.)

The script removes: systemd services, Docker stack + volumes + images, Docker engine, cloudflared, the repo clone, the SSH key entry from `~/.ssh/authorized_keys`, and the `tmux` apt package. It deliberately leaves: `git`, `python3-venv`, `python3-dev`, `build-essential` (commonly pre-installed, senior may rely on them).

What teardown does **not** automatically clean up (manual steps):
- Vercel project (delete from `vercel.com/dashboard`)
- Discord webhook (delete from channel settings if you don't want it accepting POSTs)
- Cloudflare tunnel record (`cloudflared tunnel delete` should handle, double-check at `dash.cloudflare.com` → Zero Trust → Tunnels)
- Laptop's `~/.ssh/id_pi*` and the host-key entry in `~/.ssh/known_hosts`

---

## Phase progress

- [x] Phase A2-3 — apt + Docker install
- [x] Phase A4-6 — repo, Docker stack up, Python venv, ML model
- [x] Phase A7-9 — manual smoke test, systemd, simulator
- [x] Phase A10 — LAN dashboard smoke test
- [x] Phase B — Cloudflare Tunnel (quick mode — see ⚠ recovery procedure)
- [x] Phase C — Discord webhook, Vercel deploy, e2e smoke test
- [ ] Phase D — NodeMCU flash *(deferred until hardware arrives)*
- [ ] Phase E — Swap to named tunnel + thinc domain *(deferred — would eliminate the daily URL-recovery dance)*
- [ ] Phase F — Teardown *(only when returning the Pi — script at `scripts/teardown-pi.sh`)*

## E2E smoke test — last passing run

**2026-05-01** (after IP change to .80 + tunnel URL recovery):
```
GET  /stations               → [{"station_id":"station_01"}]
GET  /predict?station_id=... → {"risk_level":"high", "rainfall":118.7, ...}  (simulator was in storm phase)
POST /alert                  → {"ok":true,"detail":"Alert sent.","discord_status":204}
```
Vercel dashboard at `https://landslide-warning.vercel.app` rendered live data after the redeploy with the new tunnel URL.
