#!/usr/bin/env bash
# Fresh Debian/Ubuntu VPS installer. The source revision is mandatory and immutable.
set -Eeuo pipefail
umask 077
REPOSITORY=https://github.com/builtx-pro/agentstack.git
DOMAIN='' EMAIL='' ADMIN_NAME='Workspace owner' INSTALL_DIR=/opt/agentstack REVISION='' SERVER_IP='' CHECK=0
usage() {
  cat <<'USAGE'
AgentStack fresh VPS installation
  --revision FULL_40_CHARACTER_COMMIT  Required, same revision as this installer
  --domain review.example.com         DNS name pointing at this VPS (prompted if omitted)
  --email owner@example.com           Initial owner email (prompted if omitted)
  --name "Workspace owner"            Initial display name
  --directory /opt/agentstack         New dedicated installation directory
  --server-ip ADDRESS                 Public address when this VPS is behind NAT
  --check                             Validate inputs/path only; no writes or installation
  --help                              Show this help
Requires a clean supported Ubuntu/Debian VPS and root (or run through sudo).
No existing reverse proxy, database or installation is replaced.
USAGE
}
fail() { printf 'AgentStack: %s\n' "$*" >&2; exit 1; }
while (($#)); do
  case "$1" in
    --check) CHECK=1; shift;;
    --help|-h) usage; exit 0;;
    --revision|--domain|--email|--name|--directory|--server-ip)
      (($#>=2)) || fail "Missing value for $1"
      [[ "$2" != --* ]] || fail "Missing value for $1"
      case "$1" in --revision) REVISION=$2;; --domain) DOMAIN=$2;; --email) EMAIL=$2;; --name) ADMIN_NAME=$2;; --directory) INSTALL_DIR=$2;; --server-ip) SERVER_IP=$2;; esac
      shift 2;;
    *) fail "Unknown option: $1";;
  esac
done
prompt() { local answer; [[ -r /dev/tty ]] || fail "Supply --$1 for noninteractive installation"; read -r -p "$2: " answer </dev/tty; printf '%s' "$answer"; }
[[ -n "$DOMAIN" ]] || DOMAIN=$(prompt domain 'Domain, for example review.example.com')
[[ -n "$EMAIL" ]] || EMAIL=$(prompt email 'Owner email')
[[ "$REVISION" =~ ^[0-9a-f]{40}$ ]] || fail 'Use --revision with a full lowercase 40-character Git commit, not a mutable branch/tag.'
[[ ${#DOMAIN} -le 253 && "$DOMAIN" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$ && "$DOMAIN" != *..* ]] || fail 'Domain must be a lowercase public DNS name, without protocol, wildcard or path.'
IFS=. read -ra labels <<<"$DOMAIN"
for label in "${labels[@]}"; do [[ ${#label} -le 63 && "$label" != -* && "$label" != *- ]] || fail 'Invalid domain label'; done
[[ "$EMAIL" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}$ && ${#EMAIL} -le 254 ]] || fail 'Invalid owner email'
[[ -n "$ADMIN_NAME" && ${#ADMIN_NAME} -le 100 && "$ADMIN_NAME" != *[$'\r\n\t\\\"\x27\x60$']* ]] || fail 'Invalid display name'
[[ "$INSTALL_DIR" =~ ^/[A-Za-z0-9._/-]+$ && "$INSTALL_DIR" != / && "$INSTALL_DIR" != *'/../'* && "$INSTALL_DIR" != */.. && "$INSTALL_DIR" != *'/./'* && "$INSTALL_DIR" != */. && "$INSTALL_DIR" != */ ]] || fail 'Use an absolute dedicated directory without spaces or dot components'
[[ -z "$SERVER_IP" || "$SERVER_IP" =~ ^[0-9a-fA-F:.]+$ ]] || fail 'Invalid server IP'
path=$INSTALL_DIR
while [[ "$path" != / ]]; do [[ ! -L "$path" ]] || fail "Symbolic links are not allowed in installation paths: $path"; path=${path%/*}; [[ -n "$path" ]] || path=/; done
if [[ -e "$INSTALL_DIR" ]]; then
  [[ -d "$INSTALL_DIR" && -f "$INSTALL_DIR/.agentstack-installer" && ! -L "$INSTALL_DIR/.agentstack-installer" ]] || fail 'Directory already exists and is not owned by this installer. Choose a new directory.'
  [[ $(cat "$INSTALL_DIR/.agentstack-installer") == agentstack-vps-v1 ]] || fail 'Unknown installation marker'
  for state in domain email revision; do
    file="$INSTALL_DIR/.install-$state"
    [[ -f "$file" && ! -L "$file" ]] || fail "Missing or unsafe installer state: $state"
    case "$state" in domain) expected=$DOMAIN;; email) expected=$EMAIL;; revision) expected=$REVISION;; esac
    [[ $(cat "$file") == "$expected" ]] || fail "Existing installation $state differs. Use the original arguments to resume; use the upgrade guide for changes."
  done
fi
if ((CHECK)); then printf 'Inputs and installation path validated; no changes made.\n'; exit 0; fi
[[ $(uname -s) == Linux ]] || fail 'This installer runs only on supported Linux VPS hosts.'
((EUID==0)) || fail 'Run this installer with sudo or as root.'
# System-owned os-release, never a project-provided shell file.
# shellcheck source=/dev/null
. /etc/os-release
case "${ID:-}:${VERSION_ID:-}" in ubuntu:22.04|ubuntu:24.04|ubuntu:26.04|debian:12|debian:13) ;; *) fail 'Supported systems: Ubuntu 22.04/24.04/26.04 and Debian 12/13.';; esac
command -v systemctl >/dev/null || fail 'A systemd-based VPS is required.'
command -v flock >/dev/null || fail 'Install util-linux (flock) before running the installer.'
[[ $(stat -c %u "$(dirname "$INSTALL_DIR")") == 0 ]] || fail 'Installation parent must be owned by root.'
if [[ -e "$INSTALL_DIR" ]]; then [[ $(stat -c %u "$INSTALL_DIR") == 0 ]] || fail 'Installation directory must be owned by root.'; fi
for port in 80 443 4311; do
  if command -v ss >/dev/null && [[ -n $(ss -H -lnt "sport = :$port") ]]; then
    service=caddy; [[ "$port" == 4311 ]] && service=app
    container=''
    if [[ -f "$INSTALL_DIR/.agentstack-installer" ]] && command -v docker >/dev/null; then
      container=$(docker ps -q --filter label=com.docker.compose.project=agentstack --filter "label=com.docker.compose.service=$service" --filter "label=com.docker.compose.project.working_dir=$INSTALL_DIR/source" 2>/dev/null || true)
    fi
    [[ -n "$container" ]] || fail "Port $port is occupied. Existing services were not changed; use the manual reverse-proxy installation guide."
  fi
done
if [[ ! -e "$INSTALL_DIR" ]]; then
  mkdir -m 0700 "$INSTALL_DIR"
  printf '%s\n' "$DOMAIN" > "$INSTALL_DIR/.install-domain"
  printf '%s\n' "$EMAIL" > "$INSTALL_DIR/.install-email"
  printf '%s\n' "$REVISION" > "$INSTALL_DIR/.install-revision"
  printf 'agentstack-vps-v1\n' > "$INSTALL_DIR/.agentstack-installer"
fi
[[ ! -L "$INSTALL_DIR/.install-lock" ]] || fail 'Unsafe installation lock'
exec 9>"$INSTALL_DIR/.install-lock"
flock -n 9 || fail 'Another installation is running in this directory.'
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y --no-install-recommends ca-certificates curl gnupg git python3 iproute2 util-linux
python3 - "$DOMAIN" "$SERVER_IP" <<'PY'
import ipaddress,json,socket,subprocess,sys
name,explicit=sys.argv[1:]
try:
    expected={str(ipaddress.ip_address(a['local'])) for link in json.loads(subprocess.check_output(['ip','-j','address','show'])) for a in link.get('addr_info',[]) if a.get('scope')=='global'}
    if explicit:
        address = ipaddress.ip_address(explicit)
        if not address.is_global: raise ValueError('--server-ip must be a public address')
        expected.add(str(address))
    actual={str(ipaddress.ip_address(item[4][0])) for item in socket.getaddrinfo(name,443,type=socket.SOCK_STREAM)}
    if not actual or any(not ipaddress.ip_address(a).is_global for a in actual) or not actual.issubset(expected):
        raise ValueError('DNS A/AAAA must point directly to this VPS. Fix all records or provide --server-ip for NAT; disable a DNS proxy during setup.')
except (OSError,ValueError) as e: sys.exit('AgentStack DNS preflight: '+str(e))
print('DNS points to the expected server address(es).')
PY
if ! command -v docker >/dev/null || { [[ -f "$INSTALL_DIR/.docker-apt-owned" ]] && ! docker compose version >/dev/null 2>&1; }; then
  for package in docker.io docker-compose docker-compose-v2 docker-doc docker-buildx podman-docker containerd runc; do
    if dpkg-query -W -f='${Status}' "$package" 2>/dev/null | grep -q 'install ok installed'; then fail "Conflicting package $package is installed. Nothing was removed. Follow Docker's migration instructions first."; fi
  done
  install -m 0755 -d /etc/apt/keyrings
  [[ ! -L "$INSTALL_DIR/.docker-apt-owned" ]] || fail 'Unsafe Docker repository marker'
  if [[ ! -f "$INSTALL_DIR/.docker-apt-owned" ]]; then
    [[ ! -e /etc/apt/keyrings/docker.asc && ! -e /etc/apt/sources.list.d/docker.sources && ! -e /etc/apt/sources.list.d/docker.list ]] || fail 'An existing Docker apt configuration needs operator review; it was not overwritten.'
  fi
  for file in /etc/apt/keyrings/docker.asc /etc/apt/sources.list.d/docker.sources; do [[ ! -L "$file" ]] || fail "Unsafe apt path: $file"; done
  key=$(mktemp); trap 'rm -f "$key"' EXIT
  curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 "https://download.docker.com/linux/$ID/gpg" -o "$key"
  fingerprint=$(gpg --batch --show-keys --with-colons "$key" | awk -F: '$1=="fpr" {print $10;exit}')
  [[ "$fingerprint" == 9DC858229FC7DD38854AE2D88D81803C0EBFCD88 ]] || fail 'Docker repository signing-key fingerprint did not match.'
  if [[ -f /etc/apt/keyrings/docker.asc ]]; then cmp -s "$key" /etc/apt/keyrings/docker.asc || fail 'Docker key changed after an interrupted install; operator review required.'; fi
  printf 'official-docker-repository\n' > "$INSTALL_DIR/.docker-apt-owned"
  install -m 0644 "$key" /etc/apt/keyrings/docker.asc; rm -f "$key"; trap - EXIT
  repository_file=$(mktemp)
  printf 'Types: deb\nURIs: https://download.docker.com/linux/%s\nSuites: %s\nComponents: stable\nArchitectures: %s\nSigned-By: /etc/apt/keyrings/docker.asc\n' "$ID" "$VERSION_CODENAME" "$(dpkg --print-architecture)" > "$repository_file"
  if [[ -f /etc/apt/sources.list.d/docker.sources ]]; then cmp -s "$repository_file" /etc/apt/sources.list.d/docker.sources || fail 'Docker apt sources changed after interruption; they were preserved.'; fi
  install -m 0644 "$repository_file" /etc/apt/sources.list.d/docker.sources
  rm -f "$repository_file"
  chmod 0644 /etc/apt/sources.list.d/docker.sources
  apt-get update -qq
  apt-get install -y --no-install-recommends docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
fi
if [[ -f "$INSTALL_DIR/.docker-apt-owned" ]]; then systemctl enable --now docker; fi
docker info >/dev/null || fail 'Docker is installed but its daemon is unavailable. No existing daemon configuration was changed.'
docker compose version >/dev/null || fail 'Docker Compose plugin is required.'
[[ ! -L "$INSTALL_DIR/.docker-project-owned" ]] || fail 'Unsafe Docker project marker'
if [[ ! -f "$INSTALL_DIR/.docker-project-owned" ]]; then
  [[ -z $(docker ps -aq --filter label=com.docker.compose.project=agentstack) && -z $(docker volume ls -q --filter label=com.docker.compose.project=agentstack) && -z $(docker network ls -q --filter label=com.docker.compose.project=agentstack) ]] || fail 'Docker resources for project agentstack already exist. They were preserved; use the existing deployment upgrade guide.'
  printf 'agentstack\n' > "$INSTALL_DIR/.docker-project-owned"
fi
# Recheck after prerequisites, including Docker published ports without a listening proxy.
for port in 80 443 4311; do
  if [[ -n $(ss -H -lnt "sport = :$port") || -n $(docker ps -q --filter "publish=$port") ]]; then
    service=caddy; [[ "$port" == 4311 ]] && service=app
    owned=$(docker ps -q --filter label=com.docker.compose.project=agentstack --filter "label=com.docker.compose.service=$service" --filter "label=com.docker.compose.project.working_dir=$INSTALL_DIR/source")
    [[ -f "$INSTALL_DIR/.agentstack-installer" && -n "$owned" ]] || fail "Port $port is occupied; nothing was stopped."
  fi
done
SOURCE="$INSTALL_DIR/source"
[[ ! -L "$SOURCE" ]] || fail 'Source checkout must not be a symbolic link.'
if [[ ! -d "$SOURCE/.git" ]]; then
  [[ ! -e "$SOURCE" ]] || fail 'Incomplete unknown source directory: inspect it before retrying.'
  git init --quiet "$SOURCE"
  git -C "$SOURCE" remote add origin "$REPOSITORY"
fi
if [[ -z $(git -C "$SOURCE" remote) ]]; then git -C "$SOURCE" remote add origin "$REPOSITORY"; fi
[[ $(git -C "$SOURCE" remote get-url origin) == "$REPOSITORY" ]] || fail 'Unexpected source repository'
[[ -z $(git -C "$SOURCE" status --porcelain) ]] || fail 'Source checkout has local changes; they were preserved.'
git -C "$SOURCE" fetch --quiet --depth 1 origin "$REVISION"
[[ $(git -C "$SOURCE" rev-parse FETCH_HEAD) == "$REVISION" ]] || fail 'Fetched source differs from requested immutable revision'
git -C "$SOURCE" checkout --quiet --detach "$REVISION"
printf 'Installing verified source commit %s\n' "$REVISION"
for file in .env .data .data/bootstrap-password .install-complete; do [[ ! -L "$INSTALL_DIR/$file" ]] || fail "Unsafe symbolic link: $file"; done
if [[ ! -f "$INSTALL_DIR/.env" ]]; then
  [[ ! -e "$INSTALL_DIR/.data/bootstrap-password" ]] || fail 'Partial credentials require manual reconciliation; no secrets were replaced.'
  docker run --rm --user 0:0 --mount "type=bind,src=$INSTALL_DIR,dst=/install" --mount "type=bind,src=$SOURCE/tools/setup,dst=/setup,readonly" --workdir /install node:22-bookworm-slim node /setup/init-env.mjs --email "$EMAIL" --name "$ADMIN_NAME" --origin "https://$DOMAIN"
fi
python3 "$SOURCE/tools/setup/configure-vps.py" "$INSTALL_DIR" "$DOMAIN" "$EMAIL"
compose() { docker compose --project-directory "$SOURCE" --env-file "$INSTALL_DIR/.env" -p agentstack -f "$SOURCE/compose.yaml" -f "$SOURCE/infra/compose.vps.yaml" "$@"; }
PROXY_STARTED=0
finish() {
  code=$?
  if ((code!=0)); then
    if ((PROXY_STARTED)) && [[ ! -f "$INSTALL_DIR/.install-complete" ]]; then compose stop caddy >/dev/null 2>&1 || true; fi
    printf '\nInstallation stopped. Data and credentials are preserved in %s. Correct the reported issue and rerun the SAME command to resume. No database rollback or volume deletion was performed.\n' "$INSTALL_DIR" >&2
  fi
}
trap finish EXIT
compose config --quiet
compose build app
compose up -d database migrate app
for _attempt in $(seq 1 90); do if curl --fail --silent --max-time 3 http://127.0.0.1:4311/api/v1/ready >/dev/null; then break; fi; sleep 2; done
curl --fail --silent --max-time 5 http://127.0.0.1:4311/api/v1/ready >/dev/null || fail 'Application readiness failed. Inspect compose logs for app/migrate.'
gateway=$(docker network inspect agentstack_internal --format '{{(index .IPAM.Config 0).Gateway}}')
python3 "$SOURCE/tools/setup/configure-vps.py" "$INSTALL_DIR" "$DOMAIN" "$EMAIL" "$gateway"
compose up -d --no-deps app
if [[ ! -f "$INSTALL_DIR/.install-complete" ]]; then
  [[ -f "$INSTALL_DIR/.data/bootstrap-password" ]] || fail 'Bootstrap password is missing. Recover it privately; it was not regenerated.'
  # Git checkout inherits umask 077. This public source file is bind-mounted into
  # the bootstrap container, whose USER node must be able to read it. Secrets stay 0600.
  # shellcheck source=tools/setup/bootstrap-permissions.sh
  source "$SOURCE/tools/setup/bootstrap-permissions.sh"
  prepare_bootstrap_helper "$SOURCE/tools/setup/bootstrap-vps.mjs"
  compose run --rm -T --no-deps --volume "$SOURCE/tools/setup/bootstrap-vps.mjs:/app/tools/setup/bootstrap-vps.mjs:ro" bootstrap node --import tsx /app/tools/setup/bootstrap-vps.mjs < "$INSTALL_DIR/.data/bootstrap-password"
fi
compose up -d --no-deps caddy
PROXY_STARTED=1
for _attempt in $(seq 1 90); do if curl --fail --silent --max-time 5 "https://$DOMAIN/api/v1/ready" >/dev/null; then break; fi; sleep 2; done
curl --fail --silent --show-error --max-time 10 "https://$DOMAIN/api/v1/ready" >/dev/null || fail 'HTTPS verification failed. Check DNS, public TCP80/443, and Caddy logs. Existing firewall rules were not changed.'
printf '%s\n' "$REVISION" > "$INSTALL_DIR/.install-complete"
printf '\nAgentStack is ready at https://%s\nSign in as %s. Initial password: %s/.data/bootstrap-password (not printed).\nStore it privately, change it in Account, then remove the bootstrap password file.\nOpen the welcome guide to create/import your first project and connect an agent.\n' "$DOMAIN" "$EMAIL" "$INSTALL_DIR"
