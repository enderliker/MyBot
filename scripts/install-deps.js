const { execSync } = require('child_process');
const { existsSync, mkdirSync, chmodSync } = require('fs');
const { join } = require('path');
const https = require('https');
const fs = require('fs');

const binDir = join(__dirname, '..', 'bin');
const ytdlpPath = join(binDir, 'yt-dlp');
const ytdlpUrl = 'https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/yt-dlp';

function isAlreadyInstalled() {
  try {
    execSync('yt-dlp --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const request = (targetUrl) => {
      https.get(targetUrl, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          request(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Failed to download: HTTP ${res.statusCode}`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => {
          file.close(resolve);
        });
      }).on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
    };
    request(url);
  });
}

async function main() {
  if (isAlreadyInstalled()) {
    console.log('yt-dlp is already installed on the system, skipping download.');
    return;
  }

  if (!existsSync(binDir)) {
    mkdirSync(binDir, { recursive: true });
  }

  console.log('Downloading latest yt-dlp nightly binary...');
  try {
    if (existsSync(ytdlpPath)) {
      try {
        fs.unlinkSync(ytdlpPath);
      } catch {}
    }
    await downloadFile(ytdlpUrl, ytdlpPath);
    chmodSync(ytdlpPath, 0o755);
    console.log(`yt-dlp updated successfully at ${ytdlpPath}`);
  } catch (err) {
    console.error('Failed to download yt-dlp:', err.message);
    if (!existsSync(ytdlpPath)) {
      process.exit(1);
    }
  }
}

main();
