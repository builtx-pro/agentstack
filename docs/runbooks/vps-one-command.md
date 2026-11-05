# One-command VPS installation

Use this path for a **new, dedicated** Ubuntu 22.04/24.04/26.04 or Debian 12/13 VPS with systemd. Existing servers with a reverse proxy or AgentStack deployment use the [manual installation and upgrade guide](installation.md).

## Before starting

1. Create a DNS A record for your chosen hostname pointing at this VPS. If you publish AAAA, it must also point here. Disable a DNS proxy during installation. The installer checks every resolved address; it cannot change your registrar account.
2. Allow inbound TCP 80 and 443 in your provider firewall. Keep SSH accessible. The installer does not replace firewall rules or stop existing services.
3. Have root/sudo access and an owner email. Node.js is **not** required on the host. Docker Engine/Compose are installed from Docker's official signed apt repository if absent; conflicting Docker packages are reported rather than removed.
4. Use the exact full commit from an AgentStack release. The release's copyable command pins both the downloaded installer and source checkout to that commit. Do not substitute `main` for a production installation.

## Run once

Replace `FULL_40_CHARACTER_COMMIT_FROM_RELEASE` below with the release commit; then run this one shell command from a root shell (or prefix it with `sudo` when logged in as a sudo-enabled user):

```sh
bash -c 'set -e; [ "$(id -u)" -eq 0 ] || { echo "Run as root or prefix this command with sudo" >&2; exit 1; }; if ! command -v curl >/dev/null || [ ! -s /etc/ssl/certs/ca-certificates.crt ]; then apt-get update -qq; DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends curl ca-certificates; fi; revision=FULL_40_CHARACTER_COMMIT_FROM_RELEASE; script=$(mktemp); trap "rm -f \"$script\"" EXIT; curl --fail --silent --show-error --location --proto =https --tlsv1.2 "https://raw.githubusercontent.com/builtx-pro/agentstack/$revision/tools/setup/install-vps.sh" -o "$script"; bash "$script" --revision "$revision"'
```

The bootstrap command installs `curl` and CA certificates through apt when missing, so a minimal supported VPS does not need a preinstalled downloader or `sudo` for a root login. The installer prompts for the domain and first administrator's email through `/dev/tty`. For unattended invocation, add to the final `bash "$script"` invocation `--domain review.example.com --email owner@example.com --name "Workspace owner"`. On a VPS behind NAT, also pass `--server-ip YOUR_PUBLIC_IP`; DNS must match that address. The default directory is `/opt/agentstack`; use `--directory /opt/agentstack-review` for another new directory. One installer-managed deployment uses the Compose project name `agentstack`.

For review before execution, download the same pinned script to a file, inspect it, then run it with these arguments. `bash tools/setup/install-vps.sh --check --revision COMMIT --domain DOMAIN --email EMAIL` validates inputs and directory ownership markers without installing packages, contacting DNS or writing files.

## What happens

- Checks supported OS, root ownership, safe paths, existing installation identity and occupied ports.
- Validates DNS, installs prerequisites and verifies Docker's apt signing-key fingerprint. Existing daemon configuration and conflicting packages are not replaced.
- Fetches the requested commit from the official repository and verifies its exact SHA. Source lives under `/opt/agentstack/source`; protected configuration lives outside the checkout.
- Generates unique credentials through the containerized setup helper; the host needs no Node.js. `.env` and the bootstrap password have mode `0600`.
- Builds the app, starts private PostgreSQL, runs migrations and waits for application readiness.
- Creates the first administrator. If a previous run completed this step, retry preserves that account and its password.
- Starts Caddy with persistent certificate storage. It serves HTTPS and renews certificates automatically. Only the app's loopback port and Caddy's public HTTP/HTTPS listeners are used; PostgreSQL has no published port.
- Configures the app to trust the exact Docker gateway used by the host-network Caddy proxy. Caddy overwrites forwarded address/protocol/host headers from the actual connection.
- Verifies the public HTTPS readiness endpoint before recording installation completion.

The initial password is in `/opt/agentstack/.data/bootstrap-password`; it is never printed by the installer. Store it in your password manager, sign in, change it in your account and remove the bootstrap password file. Use the welcome guide to create or import a project, invite teammates and connect your existing coding agent. No agent/provider account is created automatically.

## Interrupted installation

Rerun the **same pinned command and arguments**. Installer markers bind the directory to the original domain, email and revision. Credentials, database and certificate volumes are retained. Local source edits and operator-edited Caddy configuration cause a stop instead of being overwritten.

A failed initial HTTPS verification stops only the newly started installer-owned Caddy service; the local application and database remain available for diagnosis. Correct DNS/firewall or the reported issue and rerun. Existing completed installations are not stopped by this recovery behavior. A partial credentials write that cannot be safely reconciled is reported explicitly; credentials are never regenerated over a live database.

No automatic database restore, volume deletion, `docker system prune`, firewall reset or takeover of occupied services occurs.

## Operations

From the server, define a helper for this installation:

```sh
agentstack_compose() {
  docker compose --project-directory /opt/agentstack/source \
    --env-file /opt/agentstack/.env -p agentstack \
    -f /opt/agentstack/source/compose.yaml \
    -f /opt/agentstack/source/infra/compose.vps.yaml "$@"
}
agentstack_compose ps
agentstack_compose logs --tail 100 app caddy migrate
```

Keep database backups, immutable file storage, Caddy certificate volumes and the protected `.env` together. Encryption keys in `.env` are required for repository credentials and account security. Never rotate or discard them as part of an ordinary update. Follow [backup and restore](backup-restore.md) and verify restoration before relying on backups.

The fresh installer refuses a different revision in an existing directory. An upgrade requires a fresh database/configuration backup, a reviewed schema-compatible release and an explicit deployment procedure. Never run `down -v` or restore an old database over new feedback. A failed application upgrade needs a schema-compatible previous image or a forward fix; preserving database writes takes precedence over an automatic downgrade.

## Verification boundaries

The implementation is checked with subprocess input/path tests, atomic configuration/retry tests, Docker Compose validation, Caddy configuration validation and an isolated PostgreSQL bootstrap/retry rehearsal. A container is not a systemd VPS. Real apt installation, public DNS propagation and ACME issuance must be verified on the target supported VPS; success is reported only after its HTTPS readiness check passes.

References: [Docker Ubuntu installation](https://docs.docker.com/engine/install/ubuntu/), [Docker Debian installation](https://docs.docker.com/engine/install/debian/), [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https).
