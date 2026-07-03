const { execSync } = require('child_process');

const tools = ['ffmpeg', 'yt-dlp', 'python3', 'node', 'npm'];

console.log('=== System Probe ===\n');

for (const tool of tools) {
  try {
    const path = execSync(`which ${tool} 2>/dev/null`).toString().trim();
    let version = '';
    try {
      version = execSync(`${tool} --version 2>&1`).toString().split('\n')[0].trim();
    } catch {}
    console.log(`✅ ${tool}: ${path} — ${version}`);
  } catch {
    console.log(`❌ ${tool}: NOT FOUND`);
  }
}

console.log('\n=== Node Version ===');
console.log(process.version);

console.log('\n=== PATH ===');
console.log(process.env.PATH);
