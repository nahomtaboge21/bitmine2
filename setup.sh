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
echo -e "${CYAN}║   Kangaroo UI — Linux Setup           ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════╝${NC}"
echo ""

# ── 1. Node.js ───────────────────────────────────────────────────────────────
info "Checking Node.js..."
NODE_OK=false
if command -v node &>/dev/null; then
  NODE_MAJOR=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
  if [[ "$NODE_MAJOR" -ge 18 ]]; then
    success "Node.js $(node -v) found"
    NODE_OK=true
  else
    warn "Node.js $(node -v) is too old (need >=18)"
  fi
fi

if [[ "$NODE_OK" == "false" ]]; then
  info "Installing Node.js 20 LTS..."
  if command -v apt-get &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
  elif command -v dnf &>/dev/null; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
    sudo dnf install -y nodejs
  elif command -v yum &>/dev/null; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
    sudo yum install -y nodejs
  else
    error "Cannot detect package manager. Install Node.js 20 manually: https://nodejs.org"
  fi
  success "Node.js $(node -v) installed"
fi

# ── 2. Build tools ────────────────────────────────────────────────────────────
if command -v apt-get &>/dev/null && ! dpkg -l build-essential &>/dev/null 2>&1; then
  info "Installing build-essential..."
  sudo apt-get install -y build-essential || warn "build-essential install skipped"
fi

# ── 3. npm install ────────────────────────────────────────────────────────────
info "Installing frontend dependencies..."
npm install --prefer-offline 2>&1 | grep -E "added|warn|error" || true
success "Frontend dependencies ready"

# ── 4. Build frontend ─────────────────────────────────────────────────────────
info "Building frontend..."
npm run build
success "Frontend built -> dist/"

# ── 5. Create log directory ───────────────────────────────────────────────────
mkdir -p "$SCRIPT_DIR/logs"

# ── 6. Kangaroo binary check ──────────────────────────────────────────────────
KANG_DIR="$SCRIPT_DIR/Kangaroo-master"
KANG_BIN="$KANG_DIR/kangaroo"

if [[ -f "$KANG_BIN" ]]; then
  success "Kangaroo binary found at Kangaroo-master/kangaroo"
elif [[ -f "$KANG_DIR/Makefile" ]] && command -v g++ &>/dev/null; then
  info "Compiling Kangaroo binary (CPU-only)..."
  (cd "$KANG_DIR" && make clean 2>/dev/null || true && make -j"$(nproc)") \
    && success "Kangaroo compiled at Kangaroo-master/kangaroo" \
    || warn "Compilation failed — see output above. The UI will still start."
else
  warn "Kangaroo binary not found at Kangaroo-master/kangaroo"
  warn "To build with GPU support: cd Kangaroo-master && make gpu=1 ccap=<compute_capability>"
  warn "To build CPU-only:         cd Kangaroo-master && make"
  warn "The UI will still start — configure the binary path in the UI settings."
fi

# ── 7. PM2 ────────────────────────────────────────────────────────────────────
info "Checking PM2 process manager..."
if ! command -v pm2 &>/dev/null; then
  info "Installing PM2 globally..."
  sudo npm install -g pm2
  success "PM2 installed"
else
  success "PM2 $(pm2 -v) found"
fi

# ── 8. Start / restart with PM2 ──────────────────────────────────────────────
info "Starting Kangaroo UI with PM2..."
pm2 delete kangaroo-ui 2>/dev/null || true
pm2 start "$SCRIPT_DIR/ecosystem.config.cjs" --env production
pm2 save --force

# ── 9. PM2 startup (survive reboots) ─────────────────────────────────────────
info "Configuring PM2 startup on boot..."
STARTUP_OUT=$(pm2 startup 2>&1 || true)
# pm2 startup prints the command to run on the last line starting with "sudo"
STARTUP_CMD=$(echo "$STARTUP_OUT" | grep -E "^\s*sudo" | tail -1 || true)
if [[ -n "$STARTUP_CMD" ]]; then
  eval "$STARTUP_CMD" && success "PM2 startup hook installed" \
    || warn "Could not install PM2 startup hook automatically. Run manually: pm2 startup"
else
  warn "PM2 startup: could not extract command. Run manually: pm2 startup"
fi

# ── 10. Firewall ──────────────────────────────────────────────────────────────
PORT=${PORT:-8080}

if command -v ufw &>/dev/null && sudo ufw status 2>/dev/null | grep -q "^Status: active"; then
  info "Opening port $PORT in UFW..."
  sudo ufw allow "$PORT"/tcp
  success "UFW: port $PORT opened"
elif command -v firewall-cmd &>/dev/null && sudo firewall-cmd --state 2>/dev/null | grep -q "running"; then
  info "Opening port $PORT in firewalld..."
  sudo firewall-cmd --permanent --add-port="$PORT"/tcp
  sudo firewall-cmd --reload
  success "firewalld: port $PORT opened"
elif command -v iptables &>/dev/null; then
  if ! sudo iptables -C INPUT -p tcp --dport "$PORT" -j ACCEPT 2>/dev/null; then
    info "Opening port $PORT in iptables..."
    sudo iptables -I INPUT -p tcp --dport "$PORT" -j ACCEPT
    # Persist if iptables-save is available
    if command -v iptables-save &>/dev/null; then
      sudo iptables-save | sudo tee /etc/iptables/rules.v4 &>/dev/null || true
    fi
    success "iptables: port $PORT opened"
  else
    success "iptables: port $PORT already open"
  fi
fi

# ── Done ──────────────────────────────────────────────────────────────────────
IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "your-server-ip")

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Kangaroo UI is running!                ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║${NC}   URL:  http://${IP}:${PORT}"
echo -e "${GREEN}║${NC}"
echo -e "${GREEN}║${NC}   Logs:    pm2 logs kangaroo-ui"
echo -e "${GREEN}║${NC}   Restart: pm2 restart kangaroo-ui"
echo -e "${GREEN}║${NC}   Stop:    pm2 stop kangaroo-ui"
echo -e "${GREEN}║${NC}   Status:  pm2 status"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
