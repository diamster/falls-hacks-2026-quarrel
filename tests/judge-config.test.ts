import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const script = resolve('scripts/judge-config.mjs');
const directories: string[] = [];
function fixture(contents?: string) {
  const cwd = mkdtempSync(join(tmpdir(), 'quarrel-judge-config-'));
  directories.push(cwd);
  if (contents !== undefined) writeFileSync(join(cwd, '.env.local'), contents);
  return { cwd, file: join(cwd, '.env.local'), run: (...args: string[]) => spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' }) };
}
afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe('server capability setup', () => {
  it('preserves configuration, generates 256 random bits, emits only its hash, and safely reuses it', () => {
    const original = '# Preserve this comment\r\nSUPABASE_URL=https://example.test\r\nGEMINI_API_KEY=synthetic-provider-key\r\n';
    const f = fixture(original);
    const first = f.run();
    expect(first.status).toBe(0);
    const saved = readFileSync(f.file, 'utf8');
    expect(saved.startsWith(original)).toBe(true);
    const secret = saved.match(/JUDGE_SERVER_SECRET=([a-f0-9]{64})/)![1];
    expect(saved.endsWith(`${secret}\r\n`)).toBe(true);
    expect(statSync(f.file).mode & 0o777).toBe(0o600);
    expect(first.stdout).toContain(createHash('sha256').update(secret).digest('hex'));
    expect(first.stdout + first.stderr).not.toContain(secret);
    expect(first.stdout + first.stderr).not.toContain('synthetic-provider-key');
    const second = f.run();
    expect(second.status).toBe(0);
    expect(second.stdout).toContain('reused');
    expect(readFileSync(f.file, 'utf8')).toBe(saved);
  });

  it('works without an existing env file and writes private hash SQL for CI', () => {
    const f = fixture();
    const sqlFile = join(f.cwd, 'registration.sql');
    const result = f.run('--sql-out', sqlFile);
    expect(result.status).toBe(0);
    const secret = readFileSync(f.file, 'utf8').trim().split('=')[1];
    const sql = readFileSync(sqlFile, 'utf8');
    expect(sql).toContain(`decode('${createHash('sha256').update(secret).digest('hex')}', 'hex')`);
    expect(sql).toContain('quarrel_private.judge_settings');
    expect(sql).toContain(`and (key_hash is null or key_hash = decode('${createHash('sha256').update(secret).digest('hex')}', 'hex'))`);
    expect(sql).toContain('Judge already configured with a different capability');
    expect(sql).toContain('end;\n$judge_setup$;');
    expect(sql).toContain('if not found');
    expect(sql).not.toContain(secret);
    expect(statSync(sqlFile).mode & 0o777).toBe(0o600);
    expect(result.stdout).not.toContain(secret);
    expect(result.stdout).toContain('No database changes made');
  });

  it.each(['JUDGE_SERVER_SECRET=\n', 'export JUDGE_SERVER_SECRET=""\n', "JUDGE_SERVER_SECRET=''\n"])(
    'replaces a blank assignment without duplicating it: %s', original => {
      const f = fixture(original); expect(f.run().status).toBe(0);
      expect(readFileSync(f.file, 'utf8')).toMatch(/^JUDGE_SERVER_SECRET=[a-f0-9]{64}\n$/);
    });

  it('retains a valid quoted capability and appends missing newline safely', () => {
    const f = fixture(`export JUDGE_SERVER_SECRET="${'x'.repeat(32)}"\nGEMINI_MODEL=gemini-3.6-flash`);
    const saved = readFileSync(f.file, 'utf8');
    expect(f.run().status).toBe(0);
    expect(readFileSync(f.file, 'utf8')).toBe(saved);
    const other = fixture('GEMINI_MODEL=gemini-3.6-flash');
    expect(other.run().status).toBe(0);
    expect(readFileSync(other.file, 'utf8')).toMatch(/flash\nJUDGE_SERVER_SECRET=/);
  });

  it.each(['JUDGE_SERVER_SECRET=short\n', `JUDGE_SERVER_SECRET=${'a'.repeat(64)}\nJUDGE_SERVER_SECRET=\n`])(
    'rejects ambiguous or invalid existing configuration without changing it', original => {
      const f = fixture(original); const result = f.run();
      expect(result.status).toBe(1);
      expect(readFileSync(f.file, 'utf8')).toBe(original);
      expect(result.stdout + result.stderr).not.toContain('a'.repeat(64));
    });

  it('rejects unsafe output arguments and refuses overwriting SQL or following env symlinks', () => {
    const f = fixture('GEMINI_API_KEY=synthetic-key\n');
    expect(f.run('--unknown').status).toBe(1);
    expect(f.run('--sql-out', '.env.local').status).toBe(1);
    expect(readFileSync(f.file, 'utf8')).toBe('GEMINI_API_KEY=synthetic-key\n');
    const sql = join(f.cwd, 'exists.sql'); writeFileSync(sql, 'unchanged');
    expect(f.run('--sql-out', sql).status).toBe(1);
    expect(readFileSync(sql, 'utf8')).toBe('unchanged');
    const linked = fixture(); symlinkSync(f.file, linked.file);
    expect(linked.run().status).toBe(1);
  });
});
