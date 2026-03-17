#!/bin/bash

# Linux development environment setup for CloudWrkz
# Installs: git, curl, wget, nano, sudo, btop, libatomic1, postgresql-client, pnpm, nvm

set -e

# Color codes for better console output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

info() {
    echo -e "${CYAN}ℹ${NC}  $1"
}

success() {
    echo -e "${GREEN}✓${NC}  $1"
}

warning() {
    echo -e "${YELLOW}⚠${NC}  $1"
}

error() {
    echo -e "${RED}✗${NC}  $1"
}

section() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  $1${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

step() {
    echo -e "${CYAN}[STEP]${NC} $1"
}

# Detect Linux distribution
detect_distro() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        echo "$ID"
    elif [ -f /etc/redhat-release ]; then
        echo "rhel"
    else
        echo "unknown"
    fi
}

# Install system packages (sudo first, then git, curl, wget, nano, btop, libatomic1, postgresql-client)
install_system_packages() {
    section "Installing system packages"
    local distro
    distro=$(detect_distro)
    # Use sudo if available, else assume root (e.g. minimal container)
    local priv
    priv=""
    [ "$(id -u)" -ne 0 ] && command -v sudo &>/dev/null && priv="sudo"

    step "Detected distribution: $distro"

    case "$distro" in
        ubuntu|debian|pop)
            step "Running apt-get update..."
            $priv apt-get update -qq
            step "Installing sudo first..."
            $priv apt-get install -y sudo
            step "Installing git, curl, wget, nano, libatomic1, postgresql-client..."
            sudo apt-get install -y git curl wget nano libatomic1 postgresql-client
            step "Installing btop (may require universe on Ubuntu)..."
            sudo apt-get install -y btop 2>/dev/null || {
                warning "btop not in default repos; trying universe..."
                sudo add-apt-repository -y universe 2>/dev/null || true
                sudo apt-get update -qq
                sudo apt-get install -y btop 2>/dev/null || warning "btop not installed. Install manually if needed."
            }
            ;;
        fedora|rhel|centos|rocky|almalinux)
            step "Installing sudo first..."
            if command -v dnf &>/dev/null; then
                $priv dnf install -y sudo
                step "Installing remaining packages with dnf..."
                sudo dnf install -y git curl wget nano btop libatomic postgresql
            else
                $priv yum install -y sudo
                step "Installing remaining packages with yum..."
                sudo yum install -y git curl wget nano btop libatomic postgresql
            fi
            ;;
        alpine)
            step "Installing sudo first..."
            $priv apk add --no-cache sudo
            step "Installing remaining packages with apk..."
            sudo apk add --no-cache git curl wget nano btop libatomic1 postgresql-client
            ;;
        arch|manjaro)
            step "Installing sudo first..."
            $priv pacman -Sy --noconfirm sudo
            step "Installing remaining packages with pacman..."
            sudo pacman -Sy --noconfirm git curl wget nano btop libatomic postgresql
            ;;
        opensuse*|suse)
            step "Installing sudo first..."
            $priv zypper install -y sudo
            step "Installing remaining packages with zypper..."
            sudo zypper install -y git curl wget nano btop libatomic1 postgresql-client
            ;;
        *)
            error "Unsupported distribution: $distro"
            echo "Please install manually: sudo, then git curl wget nano btop libatomic1 postgresql-client"
            exit 1
            ;;
    esac
    success "System packages installed."
}

# Install pnpm (https://pnpm.io/installation)
install_pnpm() {
    section "Installing pnpm"
    if command -v pnpm &>/dev/null; then
        success "pnpm is already installed: $(pnpm --version)"
        return 0
    fi
    step "Running pnpm install script..."
    curl -fsSL https://get.pnpm.io/install.sh | sh -
    if [ -f "$HOME/.local/share/pnpm/pnpm" ] || command -v pnpm &>/dev/null; then
        success "pnpm installed. Restart your shell or run: source \$HOME/.bashrc (or .zshrc)"
    else
        # Ensure PATH is set for current session
        export PNPM_HOME="${PNPM_HOME:-$HOME/.local/share/pnpm}"
        export PATH="$PNPM_HOME:$PATH"
        success "pnpm installed."
    fi
}

# Install nvm (https://github.com/nvm-sh/nvm#installing-and-updating)
install_nvm() {
    section "Installing nvm (Node Version Manager)"
    if [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
        success "nvm is already installed."
        return 0
    fi
    step "Running nvm install script (v0.40.4)..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash
    success "nvm installed. Restart your shell or run: source \$HOME/.bashrc (or .zshrc)"
}

# Main
main() {
    echo -e "${BOLD}CloudWrkz – Linux dependency setup${NC}"
    install_system_packages
    install_pnpm
    install_nvm
    section "Done"
    echo "Next steps:"
    echo "  1. Restart your terminal or run: source \$HOME/.bashrc  # or source ~/.zshrc"
    echo "  2. Run: nvm install node   # or nvm install --lts"
    echo "  3. Run: pnpm install        # in the project directory"
    success "Setup complete."
}

main "$@"
