#!/usr/bin/env python3
"""Verify backup checksums and reject unsafe archive entries without extracting data."""
import hashlib
import json
from pathlib import Path,PurePosixPath
import sys
import tarfile

def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()

root=Path(sys.argv[1]).resolve()
checksums=json.loads((root/'checksums.json').read_text())
for required in ('database.dump','files.tar.gz','revision.txt'):
    if required not in checksums:raise SystemExit('Required backup file absent: '+required)
for name,expected in checksums.items():
    p=Path(name)
    if p.name != name or p.is_absolute():raise SystemExit('Unsafe checksum path')
    file=root/p
    if file.is_symlink() or digest(file)!=expected:raise SystemExit('Checksum mismatch: '+name)
with tarfile.open(root/'files.tar.gz','r:gz') as archive:
    for member in archive:
        path=PurePosixPath(member.name)
        if path.is_absolute() or '..' in path.parts or member.issym() or member.islnk() or not (member.isfile() or member.isdir()):
            raise SystemExit('Unsafe archive member')
print('Checksums and archive paths verified. No data extracted.')
