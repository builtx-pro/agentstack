#!/usr/bin/env bash
set -euo pipefail
umask 077
# Run from the deployment root. The destination must be private and outside Git.
destination="${1:?Usage: bash tools/ops/backup.sh /private/new-backup-directory}"
if [[ -e "$destination" ]]; then
  printf 'Refusing to overwrite an existing backup directory\n' >&2
  exit 1
fi
mkdir -p -- "$destination"
trap 'printf "Backup incomplete; preserve this directory for diagnosis: %s\n" "$destination" >&2' ERR
docker compose exec -T database pg_dump -U postgres --format=custom --no-owner --no-acl agentstack > "$destination/database.dump"
docker compose exec -T app tar -C /data/files -czf - . > "$destination/files.tar.gz"
if [[ -f .env ]]; then cp .env "$destination/deployment.env"; fi
git rev-parse HEAD > "$destination/revision.txt"
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
printf 'Backup complete: %s\nStore an encrypted off-host copy; this backup contains private data and credentials.\n' "$destination"
