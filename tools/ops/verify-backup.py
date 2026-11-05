#!/usr/bin/env python3
"""Verify recovery files, matching protected encryption configuration and safe archives."""
import base64
import hashlib
import json
from pathlib import Path,PurePosixPath
import re
import stat
import sys
import tarfile


def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()


def config_hashes(path):
    path=Path(path)
    info=path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_nlink!=1 or info.st_mode & 0o077:
        raise ValueError('Deployment configuration must be a private regular file (mode 0600, no links)')
    values={}
    for line in path.read_text().splitlines():
        if not line or line.startswith('#') or '=' not in line:continue
        name,value=line.split('=',1)
        if name in values:raise ValueError('Duplicate deployment configuration key')
        values[name]=value.strip().strip("'\"")
    result={}
    for name in ['REPOSITORY_ENCRYPTION_KEY','ACCOUNT_ENCRYPTION_KEY']:
        value=values.get(name,'')
        if not value:
            if name=='REPOSITORY_ENCRYPTION_KEY':raise ValueError('Matching REPOSITORY_ENCRYPTION_KEY is required in deployment.env')
            continue
        try:decoded=base64.b64decode(value,validate=True)
        except ValueError:raise ValueError('Invalid encryption-key configuration') from None
        if len(decoded)!=32 or base64.b64encode(decoded).decode()!=value:
            raise ValueError('Invalid encryption-key configuration')
        result[name]=hashlib.sha256(value.encode()).hexdigest()
    return result


def verify(root):
    root=Path(root)
    if root.is_symlink() or not root.is_dir():raise ValueError('Backup root must be a real directory')
    manifest=root/'checksums.json'
    if manifest.is_symlink() or not manifest.is_file():raise ValueError('Unsafe checksum manifest')
    checksums=json.loads(manifest.read_text())
    if not isinstance(checksums,dict):raise ValueError('Invalid checksum manifest')
    for required in ('database.dump','files.tar.gz','revision.txt','deployment.env'):
        if required not in checksums:raise ValueError('Required backup file absent: '+required)
    for name,expected in checksums.items():
        p=Path(name)
        if p.name!=name or p.is_absolute() or not isinstance(expected,str) or not re.fullmatch('[0-9a-f]{64}',expected):raise ValueError('Unsafe checksum entry')
        file=root/p
        if file.is_symlink() or not file.is_file() or digest(file)!=expected:raise ValueError('Checksum mismatch: '+name)
    config_hashes(root/'deployment.env')
    with tarfile.open(root/'files.tar.gz','r:gz') as archive:
        for member in archive:
            path=PurePosixPath(member.name)
            if path.is_absolute() or '..' in path.parts or member.issym() or member.islnk() or not (member.isfile() or member.isdir()):
                raise ValueError('Unsafe archive member')


if __name__=='__main__':
    try:
        if len(sys.argv)>=3 and sys.argv[1]=='--config-only':
            actual=config_hashes(sys.argv[2])
            if len(sys.argv)>3:
                if len(sys.argv)!=5 or sys.argv[3]!='--runtime-hashes':raise ValueError('Invalid configuration check arguments')
                if actual!=json.loads(sys.argv[4]):raise ValueError('Deployment encryption configuration differs from the running app; backup stopped')
        elif len(sys.argv)==2:
            verify(sys.argv[1])
            print('Checksums, protected encryption configuration and archive paths verified. No data extracted.')
        else:raise ValueError('Usage: verify-backup.py /private/backup')
    except (ValueError,OSError,tarfile.TarError) as error:
        sys.exit('Backup verification failed: '+str(error))
