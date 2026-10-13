import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const path = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(path)) {
  console.log('Configuração existente preservada.');
  process.exit(0);
}
const local = process.argv.includes('--local');
const secret = () => randomBytes(32).toString('hex');
writeFileSync(
  path,
  `# Configuração local. Não versionar nem compartilhar este arquivo.\nDB_MODE=${local ? 'embedded' : 'postgres'}\nPGHOST=127.0.0.1\nPGPORT=5432\nPGDATABASE=relic_studios\nPGUSER=relic_runtime\nPGPASSWORD=${secret()}\nADMIN_DATABASE_USER=relic_app\nADMIN_DATABASE_PASSWORD=${secret()}\nSESSION_SECRET=${secret()}\nAPP_ORIGIN=http://localhost:8080\nCOOKIE_SECURE=false\nHOST=127.0.0.1\nPORT=${local ? '8080' : '3000'}\nNODE_ENV=development\nEMBEDDED_PATH=.local/database\n`,
  { mode: 0o600, flag: 'wx' },
);
console.log('Configuração criada com segredos aleatórios. Nenhuma conta de usuário foi criada.');
