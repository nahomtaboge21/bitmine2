#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
#  Kangaroo UI — Linux deploy script
#  Usage:  bash setup.sh
# ─────────────────────────────────────────────────────────────────────────────

GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()    { echo -e "${CYAN}[setup]${NC} $*"; }
success() { echo -e "${GREEN}[ok]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[warn]${NC}  $*"; }
error()   { echo -e "${RED}[error]${NC} $*"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo -e "${CYAN}╔══════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   🦘  Kangaroo UI — Linux Setup      ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════╝${NC}"
echo ""

# ── 1. Node.js ───────────────────────────────────────────────────────────────
info "Checking Node.js..."
NODE_OK=false
if command -v node &>/dev/null; then
  NODE_VER=$(node -e "process.exit(+process.versions.node.split('.')[0] < 18)" 2>/dev/null && echo ok || echo old)
  if [[ "$NODE_VER" == "ok" ]]; then
    success "Node.js $(node -v) found"
    NODE_OK=true
  else
    warn "Node.js $(node -v) is too old (need ≥18)"
  fi
fi

if [[ "$NODE_OK" == "false" ]]; then
  info "Installing Node.js 20 LTS..."
  if command -v apt-get &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - &>/dev/null
    sudo apt-get install -y nodejs &>/dev/null
  elif command -v dnf &>/dev/null; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash - &>/dev/null
    sudo dnf install -y nodejs &>/dev/null
  elif command -v yum &>/dev/null; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash - &>/dev/null
    sudo yum install -y nodejs &>/dev/null
  else
    error "Cannot detect package manager. Install Node.js 20 manually: https://nodejs.org"
  fi
  success "Node.js $(node -v) installed"
fi

# ── 2. Build tools for native modules (optional but helpful) ─────────────────
if command -v apt-get &>/dev/null && ! dpkg -l build-essential &>/dev/null 2>&1; then
  info "Installing build-essential..."
  sudo apt-get install -y build-essential &>/dev/null || warn "build-essential install skipped"
fi

# ── 3. npm install ────────────────────────────────────────────────────────────
info "Installing frontend dependencies..."
npm install --prefer-offline 2>&1 | grep -E "added|warn|error" || true
success "Frontend dependencies ready"

info "Installing backend dependency (ws)..."
npm install ws --save 2>&1 | grep -E "added|warn|error" || true
success "Backend dependencies ready"

# ── 4. Build frontend ─────────────────────────────────────────────────────────
info "Building frontend..."
npm run build
success "Frontend built → dist/"

# ── 5. Kangaroo binary check ──────────────────────────────────────────────────
KANG_DIR="$SCRIPT_DIR/Kangaroo-master"
KANG_BIN="$KANG_DIR/Kangaroo"

if [[ -f "$KANG_BIN" ]]; then
  success "Kangaroo binary found at Kangaroo-master/Kangaroo"
else
  warn "Kangaroo binary not found at Kangaroo-master/Kangaroo"
  warn "You must compile it first (CUDA + make). Once built, copy the binary to:"
  warn "  $KANG_BIN"
  warn "The UI will still start — configure the binary path in the UI settings."
fi

# ── 6. PM2 ────────────────────────────────────────────────────────────────────
info "Checking PM2 process manager..."
if ! command -v pm2 &>/dev/null; then
  info "Installing PM2 globally..."
  sudo npm install -g pm2 &>/dev/null
  success "PM2 installed"
else
  success "PM2 $(pm2 -v) found"
fi

# ── 7. Start / restart with PM2 ──────────────────────────────────────────────
info "Starting Kangaroo UI with PM2..."
pm2 delete kangaroo-ui 2>/dev/null || true
pm2 start "$SCRIPT_DIR/server.cjs" \
  --name kangaroo-ui \
  --env production \
  -- 2>&1 | tail -3

# ── 8. PM2 startup (survive reboots) ─────────────────────────────────────────
info "Configuring PM2 startup on boot..."
pm2 save --force 2>/dev/null
STARTUP_CMD=$(pm2 startup 2>/dev/null | grep "sudo env" || true)
if [[ -n "$STARTUP_CMD" ]]; then
  eval "$STARTUP_CMD" &>/dev/null || warn "Could not install PM2 startup hook (run manually: pm2 startup)"
fi

# ── 9. Open firewall port 8080 (if ufw is active) ────────────────────────────
if command -v ufw &>/dev/null && sudo ufw status 2>/dev/null | grep -q "active"; then
  info "Opening port 8080 in UFW firewall..."
  sudo ufw allow 8080/tcp &>/dev/null
  success "Port 8080 opened"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "your-server-ip")
PORT=${PORT:-8080}

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   ✅  Kangaroo UI is running!            ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║${NC}   URL:  http://${IP}:${PORT}            "
echo -e "${GREEN}║${NC}                                          "
echo -e "${GREEN}║${NC}   pm2 logs kangaroo-ui   — view logs    "
echo -e "${GREEN}║${NC}   pm2 restart kangaroo-ui — restart      "
echo -e "${GREEN}║${NC}   pm2 stop kangaroo-ui   — stop          "
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
