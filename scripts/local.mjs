import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
const root = fileURLToPath(new URL('../', import.meta.url));
function run(command, args) {
  const r = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
run(process.execPath, ['scripts/configure.mjs', '--local']);
if (
  process.argv.includes('--production-build') ||
  !existsSync(new URL('../frontend/dist/index.html', import.meta.url))
)
  run('npm', ['run', 'build']);
const child = spawn(process.execPath, ['--import', 'tsx', 'backend/src/index.ts'], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    DB_MODE: 'embedded',
    NODE_ENV: 'development',
    PORT: '8080',
    HOST: '127.0.0.1',
    APP_ORIGIN: 'http://localhost:8080',
  },
});
console.log('Relic Studios: http://localhost:8080 · PostgreSQL embarcado para uso local.');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 0));
