#!/usr/bin/env python3
import os
import sys
import getpass
import paramiko

HOST = 'zenith.hostmybot.net'
PORT = 2022
USERNAME = 'enderliker01.90acdbd2'
LOCAL_DIR = os.path.dirname(os.path.abspath(__file__))
REMOTE_DIR = ''

EXCLUDE = {
    'node_modules', 'dist', '.env', 'bin', '.git',
    '__pycache__', '.gitignore'
}

EXCLUDE_EXT = {'.log', '.pyc'}

def should_skip(path):
    parts = path.replace('\\', '/').split('/')
    for part in parts:
        if part in EXCLUDE:
            return True
        _, ext = os.path.splitext(part)
        if ext in EXCLUDE_EXT:
            return True
    return False

def ensure_remote_dir(sftp, remote_path):
    parts = remote_path.replace('\\', '/').split('/')
    current = ''
    for part in parts:
        if not part:
            continue
        current = current + '/' + part
        try:
            sftp.stat(current)
        except FileNotFoundError:
            sftp.mkdir(current)

def upload(sftp, local_root, remote_root):
    uploaded = 0
    skipped = 0
    for dirpath, dirnames, filenames in os.walk(local_root):
        rel_dir = os.path.relpath(dirpath, local_root)
        if should_skip(rel_dir):
            dirnames.clear()
            continue

        dirnames[:] = [d for d in dirnames if not should_skip(d)]

        remote_dir = REMOTE_DIR if rel_dir == '.' else f"{REMOTE_DIR}/{rel_dir.replace(os.sep, '/')}".lstrip('/')
        ensure_remote_dir(sftp, remote_dir)

        for filename in filenames:
            rel_file = os.path.join(rel_dir, filename) if rel_dir != '.' else filename
            if should_skip(rel_file):
                skipped += 1
                continue
            local_path = os.path.join(dirpath, filename)
            remote_path = f"{remote_dir}/{filename}"
            print(f"  uploading {rel_file} ...", end=' ', flush=True)
            sftp.put(local_path, remote_path)
            uploaded += 1
            print('done')

    return uploaded, skipped

def main():
    password = getpass.getpass(f'Password for {USERNAME}@{HOST}: ')

    print(f'\nConnecting to {HOST}:{PORT}...')
    transport = paramiko.Transport((HOST, PORT))
    transport.connect(username=USERNAME, password=password)
    sftp = paramiko.SFTPClient.from_transport(transport)

    print(f'Connected. Uploading to {REMOTE_DIR}...\n')
    uploaded, skipped = upload(sftp, LOCAL_DIR, REMOTE_DIR)

    sftp.close()
    transport.close()
    print(f'\nDone! {uploaded} files uploaded, {skipped} skipped.')

if __name__ == '__main__':
    main()
