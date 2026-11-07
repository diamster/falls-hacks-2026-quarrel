import { randomBytes, createHash } from 'node:crypto';
import { chmodSync, lstatSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// This helper never connects to Supabase or Gemini. Only a hash leaves the env file.
try {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--sql-out' || !args[1])) {
    throw new Error('Usage: npm run judge:setup -- [--sql-out /path/to/registration.sql]');
  }
  const envPath = resolve('.env.local');
  const sqlPath = args.length ? resolve(args[1]) : null;
  if (sqlPath === envPath) throw new Error('The SQL output must not replace .env.local.');
  let previous = '';
  try {
    if (!lstatSync(envPath).isFile()) throw new Error('.env.local must be a regular file, not a symlink.');
    previous = readFileSync(envPath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const assignment = /^[\t ]*(?:export[\t ]+)?JUDGE_SERVER_SECRET[\t ]*=[^\r\n]*/gm;
  const matches = [...previous.matchAll(assignment)];
  if (matches.length > 1) throw new Error('Remove duplicate JUDGE_SERVER_SECRET assignments before setup.');
  let secret = matches[0]?.[0].split('=').slice(1).join('=').trim() ?? '';
  if ((secret.startsWith('"') && secret.endsWith('"')) || (secret.startsWith("'") && secret.endsWith("'"))) secret = secret.slice(1, -1);
  if (secret && !/^[A-Za-z0-9_-]{32,256}$/.test(secret)) {
    throw new Error('JUDGE_SERVER_SECRET must be 32–256 letters, digits, underscores or hyphens. Keep a valid existing secret, or clear the value to generate one.');
  }
  const generated = !secret;
  if (generated) secret = randomBytes(32).toString('hex');
  const newline = previous.includes('\r\n') ? '\r\n' : '\n';
  const next = !generated ? previous : matches.length
    ? previous.replace(assignment, `JUDGE_SERVER_SECRET=${secret}`)
    : `${previous}${previous && !previous.endsWith('\n') ? newline : ''}JUDGE_SERVER_SECRET=${secret}${newline}`;
  if (generated) {
    const temporary = `${envPath}.${randomBytes(8).toString('hex')}.tmp`;
    try {
      writeFileSync(temporary, next, { mode: 0o600, flag: 'wx' });
      renameSync(temporary, envPath);
    } finally {
      rmSync(temporary, { force: true });
    }
  }
  chmodSync(envPath, 0o600);
  const hash = createHash('sha256').update(secret, 'utf8').digest('hex');
  const sql = `-- Apply only to the intended quarrel project after both Stage 4 migrations.\n-- This registers a SHA-256 hash, not the raw server capability.\n-- Existing different capabilities are never rotated by this setup.\ndo $judge_setup$\nbegin\n  if not exists (select 1 from quarrel_private.judge_settings where singleton = true) then\n    raise exception 'Stage 4 judge settings are missing; review and apply the migrations first.';\n  end if;\n  update quarrel_private.judge_settings\n    set key_hash = decode('${hash}', 'hex')\n    where singleton = true\n      and (key_hash is null or key_hash = decode('${hash}', 'hex'));\n  if not found then\n    raise exception 'Judge already configured with a different capability; reuse the existing server configuration or perform an explicit rotation.';\n  end if;\nend;\n$judge_setup$;\n`;
  if (sqlPath) {
    // Exclusive creation avoids overwriting an unrelated file or following a symlink.
    writeFileSync(sqlPath, sql, { mode: 0o600, flag: 'wx' });
    console.log(`Server capability ${generated ? 'created' : 'reused'} in .env.local (0600). Hash registration SQL saved to ${sqlPath}. No database changes made.`);
  } else {
    console.log(`Server capability ${generated ? 'created' : 'reused'} in .env.local (0600). Review and run the following SQL in the intended Supabase project. No database changes made.\n\n${sql}`);
  }
} catch (error) {
  // Environment contents and secret values are never included in diagnostics.
  console.error(error.code ? `Judge setup failed (${error.code}). Check the input and output files.` : error.message);
  process.exitCode = 1;
}
