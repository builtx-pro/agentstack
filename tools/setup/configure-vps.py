#!/usr/bin/env python3
"""Validate and atomically update only installer-owned VPS routing configuration."""
import ipaddress
import os
from pathlib import Path
import re
import stat
import sys
import tempfile


def regular(path):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
        raise ValueError(f'Expected a regular non-linked file: {path.name}')
    if info.st_uid != os.geteuid():
        raise ValueError(f'File must belong to the installer user: {path.name}')
    return info


def atomic(path, value, mode=0o600):
    if path.exists() or path.is_symlink():
        regular(path)
    fd, temp = tempfile.mkstemp(prefix='.'+path.name+'.', dir=path.parent)
    try:
        os.fchmod(fd, mode)
        with os.fdopen(fd, 'w') as handle:
            handle.write(value)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def configure(directory, domain, email, gateway=None):
    root = Path(directory).absolute()
    for path in [root, *root.parents]:
        if path.is_symlink():
            raise ValueError('Installation paths cannot contain symbolic links')
    if not re.fullmatch(r'[a-z0-9][a-z0-9.-]*\.[a-z]{2,63}', domain) or '..' in domain:
        raise ValueError('Invalid domain')
    if not re.fullmatch(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}', email):
        raise ValueError('Invalid email')
    if any(c in str(root) for c in '\n\r"\'\\$'):
        raise ValueError('Unsafe directory')
    marker = root / '.agentstack-installer'
    regular(marker)
    if marker.read_text().strip() != 'agentstack-vps-v1':
        raise ValueError('Unknown installation marker')
    env = root / '.env'
    regular(env)
    content = env.read_text()
    lines = content.splitlines()
    values = dict(line.split('=', 1) for line in lines if line and not line.startswith('#') and '=' in line)
    if values.get('APP_ORIGIN') != f'https://{domain}' or values.get('ADMIN_EMAIL', '').strip("'\"") != email:
        raise ValueError('Existing origin/email differs; configuration was not changed')
    if len(values) != len([line for line in lines if line and not line.startswith('#') and '=' in line]):
        raise ValueError('Duplicate environment keys require operator review')
    changes = {'AGENTSTACK_INSTALL_DIR': str(root), 'AGENTSTACK_DOMAIN': domain, 'ACME_EMAIL': email}
    if gateway:
        address = ipaddress.ip_address(gateway)
        if address.version != 4 or not address.is_private or address.is_unspecified:
            raise ValueError('Expected one private IPv4 Docker gateway, not a subnet')
        changes['TRUST_PROXY'] = str(address)
    for key, value in changes.items():
        lines = [line for line in lines if not line.startswith(key+'=')]
        lines.append(key+'='+value)
    config = root / 'Caddyfile'
    # Variables are substituted by Caddy from Compose env; values above are strictly validated.
    expected = '''{
    admin off
    email {$ACME_EMAIL}
}
{$AGENTSTACK_DOMAIN} {
    encode zstd gzip
    reverse_proxy 127.0.0.1:4311 {
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
        header_up X-Forwarded-Host {host}
    }
    header Strict-Transport-Security "max-age=31536000"
}
'''
    if config.exists() or config.is_symlink():
        regular(config)
    if config.exists() and config.read_text() != expected:
        raise ValueError('Caddyfile was edited; refusing to overwrite it')
    atomic(env, '\n'.join(lines)+'\n')
    atomic(config, expected, 0o644)


if __name__ == '__main__':
    try:
        configure(*sys.argv[1:])
    except (ValueError, OSError, TypeError) as error:
        sys.exit('AgentStack routing configuration: '+str(error))
