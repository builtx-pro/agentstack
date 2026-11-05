#!/usr/bin/env bash
set -euo pipefail
umask 077
usage() { printf 'Usage: backup.sh /private/new-directory [--installation /opt/agentstack | --source /checkout --env-file /private/.env] [--project-name agentstack] [--compose-file /path/compose.yaml ...]\n' >&2; exit 1; }
[[ $# -ge 1 ]] || usage
destination=$1; shift
source_dir=$PWD env_file='' installation='' project=agentstack
compose_files=()
while (($#)); do
  [[ $# -ge 2 ]] || usage
  case "$1" in
    --installation) installation=$2;;
    --source) source_dir=$2;;
    --env-file) env_file=$2;;
    --project-name) project=$2;;
    --compose-file) compose_files+=("$2");;
    *) usage;;
  esac
  shift 2
done
if [[ -n "$installation" ]]; then
  [[ -z "$env_file" && ${#compose_files[@]} == 0 ]] || usage
  [[ -f "$installation/.agentstack-installer" && ! -L "$installation/.agentstack-installer" && $(cat "$installation/.agentstack-installer") == agentstack-vps-v1 ]] || { printf 'Unknown VPS installation marker\n' >&2; exit 1; }
  source_dir="$installation/source"; env_file="$installation/.env"
  compose_files=("$source_dir/compose.yaml" "$source_dir/infra/compose.vps.yaml")
fi
[[ -n "$env_file" ]] || env_file="$source_dir/.env"
((${#compose_files[@]})) || compose_files=("$source_dir/compose.yaml")
[[ "$project" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || usage
[[ "$destination" == /* && ! -e "$destination" && ! -L "$destination" ]] || { printf 'Use a new absolute backup directory; existing backups are never overwritten\n' >&2; exit 1; }
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# Config is mandatory and its key must match the running app, not merely an old cwd.env.
python3 "$script_dir/verify-backup.py" --config-only "$env_file"
compose_args=(--project-directory "$source_dir" --env-file "$env_file" -p "$project")
for file in "${compose_files[@]}"; do
  [[ -f "$file" && ! -L "$file" ]] || { printf 'Missing or unsafe Compose file\n' >&2; exit 1; }
  compose_args+=(-f "$file")
done
compose() { docker compose "${compose_args[@]}" "$@"; }
compose config --quiet
runtime_hashes=$(compose exec -T app node -e 'const c=require("node:crypto");console.log(JSON.stringify(Object.fromEntries(["REPOSITORY_ENCRYPTION_KEY","ACCOUNT_ENCRYPTION_KEY"].filter(k=>process.env[k]).map(k=>[k,c.createHash("sha256").update(process.env[k]).digest("hex")]))))')
python3 "$script_dir/verify-backup.py" --config-only "$env_file" --runtime-hashes "$runtime_hashes"
revision=$(git -C "$source_dir" rev-parse HEAD)
python3 - "$destination" "$source_dir" <<'PY'
import os,sys
from pathlib import Path
path=Path(sys.argv[1]);source=Path(sys.argv[2]).resolve()
for part in [path,*path.parents]:
    if part.is_symlink():raise SystemExit('Backup paths cannot contain symbolic links')
resolved=path.resolve()
if resolved==source or source in resolved.parents:raise SystemExit('Backup destination must be outside the source checkout')
path.mkdir(mode=0o700,parents=True,exist_ok=False)
os.chmod(path,0o700)
PY
trap 'printf "Backup incomplete; preserve this directory for diagnosis: %s\n" "$destination" >&2' ERR
# Snapshot the verified configuration before dumping. Recheck the live key after archiving.
install -m 0600 "$env_file" "$destination/deployment.env"
for index in "${!compose_files[@]}"; do install -m 0600 "${compose_files[$index]}" "$destination/compose-$index.yaml"; done
if [[ -n "$installation" ]]; then
  [[ -f "$installation/Caddyfile" && ! -L "$installation/Caddyfile" ]] || { printf 'Installer Caddyfile missing or unsafe\n' >&2; exit 1; }
  install -m 0600 "$installation/Caddyfile" "$destination/Caddyfile"
fi
compose exec -T database pg_dump -U postgres --format=custom --no-owner --no-acl agentstack > "$destination/database.dump"
compose exec -T app tar -C /data/files -czf - . > "$destination/files.tar.gz"
printf '%s\n' "$revision" > "$destination/revision.txt"
runtime_hashes=$(compose exec -T app node -e 'const c=require("node:crypto");console.log(JSON.stringify(Object.fromEntries(["REPOSITORY_ENCRYPTION_KEY","ACCOUNT_ENCRYPTION_KEY"].filter(k=>process.env[k]).map(k=>[k,c.createHash("sha256").update(process.env[k]).digest("hex")]))))')
python3 "$script_dir/verify-backup.py" --config-only "$destination/deployment.env" --runtime-hashes "$runtime_hashes"
python3 - "$destination" <<'PY'
import hashlib,json,sys
from pathlib import Path
root=Path(sys.argv[1])
def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()
items={p.name:digest(p) for p in root.iterdir() if p.is_file()}
(root/'checksums.json').write_text(json.dumps(items,indent=2)+'\n')
PY
python3 "$script_dir/verify-backup.py" "$destination"
printf 'Backup complete: %s\nStore an encrypted off-host copy; it contains private data and the matching encryption configuration.\n' "$destination"
