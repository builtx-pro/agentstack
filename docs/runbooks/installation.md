# Installation

AgentStack uses one application container and PostgreSQL. The database has no published host port. The running application uses a restricted database role; migration/bootstrap credentials are provided only to one-shot operator containers.

## Local installation

Requirements: Git, Node.js 22.22+ for the setup helper, Docker with Compose.

```sh
git clone https://github.com/builtx-pro/agentstack.git
cd agentstack
node tools/setup/init-env.mjs --email you@example.com
docker compose up -d --build
cat .data/bootstrap-password | docker compose run --rm -T bootstrap
```

Open http://localhost:4311 and sign in using your email and the password in `.data/bootstrap-password`. The generated password is unique to your installation. Keep it in a password manager and remove the bootstrap file after onboarding.

Do not commit `.env`, `.data`, exports or backups. There are no default shared credentials.

## VPS

For a new dedicated Ubuntu/Debian host, use the [one-command VPS installer](vps-one-command.md). It sets up Docker, the first administrator, an exact trusted proxy address and Caddy HTTPS without requiring host Node.js. The manual route below remains available for existing reverse proxies and custom infrastructure.

Generate configuration with `--origin https://review.example.com`. Keep the application bound to loopback and put a TLS reverse proxy in front of it. See `infra/Caddyfile.example`. Configure DNS and allow inbound TLS on the proxy, not PostgreSQL. Origin must exactly match the URL reviewers use.

When using a reverse proxy, set `TRUST_PROXY` in `.env` to the exact immediate proxy address seen by the app. With a host proxy and Docker port publishing this is commonly the Compose network gateway, not `127.0.0.1`. Inspect it with `docker network inspect agentstack_internal` and verify the peer address in application request logs. For example `TRUST_PROXY=172.23.0.1` is appropriate only if that is your actual gateway. Compose forwards this setting to the app. Recreate the app container after changing it.

The proxy must replace forwarded client-address headers with values it derives from the connection. Never use `true`, `/0` or an unnecessarily broad trusted subnet. Keeping the app port bound to loopback prevents remote clients from bypassing the proxy. Without the explicit trusted-proxy setting, requests still work but login rate limits are grouped under the proxy's address.

A customer subdomain is optional routing convenience. Access always requires project membership and server-side authorization; a hostname does not isolate data by itself.

## Daily use

Create a project, add users/members, then import a synthetic example or your own catalog. Use expiring project-scoped agent tokens for CLI/MCP. Never give a coding agent the database owner password just to read feedback.

## Status

This guide is part of the implementation contract. The release report must record successful fresh install, backup/restore and upgrade checks before a production release is declared ready.

## Private repository credentials

New setup files include `REPOSITORY_ENCRYPTION_KEY`, a unique canonical base64 encoding of 32 random bytes. For an existing installation, run `node tools/setup/ensure-repository-key.mjs /private/path/to/.env` on the deployment host. It adds a key only when missing, preserves an existing valid key, refuses symbolic links and never prints the value. Recreate the application container after changing configuration. Public repository connections do not require a stored token.

Keep this key with the protected deployment configuration and database backups. Private provider credentials are encrypted with it. Do not regenerate it during ordinary upgrades: changing or losing it requires re-entering each private repository credential. Do not copy the key or provider tokens into Git, logs, screenshots or client configuration.
