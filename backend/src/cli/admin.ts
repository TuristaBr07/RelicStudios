import { createInterface } from 'node:readline/promises';
import { readFileSync } from 'node:fs';
import { readConfig } from '../config/env.js';
import { openDatabase, migrate } from '../lib/db.js';
import { createAdmin } from '../modules/auth.js';
function arg(name: string) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
async function hidden(prompt: string): Promise<string> {
  if (!process.stdin.isTTY) throw new Error('Use um terminal interativo ou --password-stdin.');
  process.stdout.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  let value = '';
  return new Promise((resolve, reject) => {
    const done = () => {
      process.stdin.off('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
    };
    const onData = (chunk: Buffer) => {
      for (const char of chunk.toString('utf8')) {
        if (char === '\r' || char === '\n') {
          done();
          resolve(value);
          return;
        }
        if (char === '\u0003') {
          done();
          reject(new Error('Cancelado.'));
          return;
        }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else if (char >= ' ') value += char;
      }
    };
    process.stdin.on('data', onData);
  });
}
let db: Awaited<ReturnType<typeof openDatabase>> | undefined;
try {
  const c = readConfig();
  // Docker uses runtime permissions for user bootstrap; migrations run separately.
  db = await openDatabase(c, c.DB_MODE === 'embedded');
  if (c.DB_MODE === 'embedded') await migrate(db);
  let name = arg('--name'),
    email = arg('--email');
  if (!name || !email) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    name ??= await rl.question('Nome do administrador: ');
    email ??= await rl.question('E-mail: ');
    rl.close();
  }
  let password: string;
  if (process.argv.includes('--password-stdin'))
    password = readFileSync(0, 'utf8').replace(/\r?\n$/, '');
  else {
    password = await hidden('Senha (mínimo 12 caracteres, entrada oculta): ');
    const confirmation = await hidden('Confirme a senha: ');
    if (password !== confirmation) throw new Error('As senhas não coincidem.');
  }
  await createAdmin(db, name, email, password);
  password = '';
  console.log('Administrador criado. Acesse a interface com o e-mail e a senha que você definiu.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Falha ao criar administrador.');
  process.exitCode = 1;
} finally {
  await db?.close();
}
