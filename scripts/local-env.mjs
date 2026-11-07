import { execFileSync } from 'node:child_process';
import { writeFileSync, existsSync } from 'node:fs';
if (existsSync('.env.local')) {
  console.error('.env.local already exists; keep it or remove it explicitly before generating local settings.');
  process.exit(1);
}
const settings = JSON.parse(execFileSync('node_modules/.bin/supabase', ['status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
if (!settings.API_URL || !(settings.PUBLISHABLE_KEY || settings.ANON_KEY)) throw new Error('Local Supabase is not ready.');
writeFileSync('.env.local', `SUPABASE_URL=${settings.API_URL}\nSUPABASE_PUBLISHABLE_KEY=${settings.PUBLISHABLE_KEY || settings.ANON_KEY}\n`, { mode: 0o600, flag: 'wx' });
console.log('Local .env.local created with the API URL and publishable key. No service-role key is used.');
