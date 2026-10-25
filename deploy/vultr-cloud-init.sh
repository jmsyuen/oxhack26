#!/bin/bash
# CHOKEPOINT: one-paste Vultr deployment.
#
# 1. Vultr dashboard -> Deploy -> Cloud Compute, Ubuntu 24.04, 2 GB RAM or more (1 GB works; swap is added).
# 2. Under "Additional features", tick Cloud-Init User-Data and paste this whole file.
# 3. Fill in the values below (keys may stay blank and be added later), then Deploy.
#    Fill them in only in the Vultr form: never commit a copy of this file with keys in it.
# 4. After about 8 minutes the app is live at https://<your-ip-with-dashes>.sslip.io, e.g. https://45-76-1-2.sslip.io
#    (also http://<ip>). The URL is written to /root/CHOKEPOINT_URL.txt.
# Every push to the branch below is picked up and redeployed within about 2 minutes.

REPO="https://github.com/jmsyuen/oxhack26.git"
BRANCH="main"
GITHUB_TOKEN=""          # only needed if the repo is private (fine-grained token, read-only contents)
CUSTOM_DOMAIN=""         # optional, e.g. chokepoint.example.com (point its A record at the server first)
GEMINI_API_KEY=""
ELEVENLABS_API_KEY=""
FRED_API_KEY=""

# ---------------------------------------------------------------------------------------------
set -euo pipefail
exec > >(tee -a /var/log/chokepoint-setup.log) 2>&1
export DEBIAN_FRONTEND=noninteractive
APP=/opt/chokepoint
echo "== CHOKEPOINT setup started $(date -u)"

# next build needs ~1.5 GB of memory: add swap on small plans
if [ "$(free -m | awk '/Mem:/ {print $2}')" -lt 3000 ] && [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "== packages: Node.js 20, git, Caddy (automatic HTTPS)"
apt-get update -q
apt-get install -y -q curl git ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y -q nodejs
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
apt-get update -q && apt-get install -y -q caddy

if command -v ufw >/dev/null 2>&1; then
  ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable
fi

echo "== code"
id chokepoint >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin chokepoint
URL="$REPO"
if [ -n "$GITHUB_TOKEN" ]; then URL="${REPO/https:\/\//https://x-access-token:${GITHUB_TOKEN}@}"; fi
[ -d "$APP/.git" ] || git clone --quiet --branch "$BRANCH" "$URL" "$APP"
cat > "$APP/.env.local" <<EOF
GEMINI_API_KEY=$GEMINI_API_KEY
GEMINI_MODEL=gemini-2.5-flash
ELEVENLABS_API_KEY=$ELEVENLABS_API_KEY
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM
ELEVENLABS_MODEL_ID=eleven_flash_v2_5
FRED_API_KEY=$FRED_API_KEY
EOF
chmod 600 "$APP/.env.local"
chown -R chokepoint:chokepoint "$APP"

echo "== build (2-5 minutes)"
sudo -u chokepoint -H bash -c "cd '$APP' && npm ci --no-audit --no-fund && npm run build"

echo "== services"
cat > /etc/systemd/system/chokepoint.service <<EOF
[Unit]
Description=CHOKEPOINT (Next.js)
After=network.target

[Service]
User=chokepoint
WorkingDirectory=$APP
Environment=NODE_ENV=production
ExecStart=$APP/node_modules/.bin/next start -H 127.0.0.1 -p 3000
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
cat > /etc/systemd/system/chokepoint-update.service <<EOF
[Unit]
Description=Redeploy CHOKEPOINT when the GitHub branch changes

[Service]
Type=oneshot
ExecStart=/bin/bash $APP/deploy/update.sh
EOF
cat > /etc/systemd/system/chokepoint-update.timer <<EOF
[Unit]
Description=Check GitHub for new CHOKEPOINT commits every 2 minutes

[Timer]
OnBootSec=3min
OnUnitActiveSec=2min

[Install]
WantedBy=timers.target
EOF

IP=$(curl -fsS --max-time 3 http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null \
  || curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null \
  || hostname -I | awk '{print $1}')
DOMAIN="${CUSTOM_DOMAIN:-$(echo "$IP" | tr . -).sslip.io}"
cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
    encode gzip
    reverse_proxy 127.0.0.1:3000
}

http:// {
    reverse_proxy 127.0.0.1:3000
}
EOF

systemctl daemon-reload
systemctl enable --now chokepoint.service chokepoint-update.timer
systemctl restart caddy
echo "CHOKEPOINT is live at https://$DOMAIN  (also http://$IP)" | tee /root/CHOKEPOINT_URL.txt
echo "== done $(date -u)"
