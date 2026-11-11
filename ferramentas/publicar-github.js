'use strict';
// Manda o código para o GitHub sem as anotações internas. O histórico daqui (main) continua completo e privado; o
// GitHub recebe só "fotos" do código, guardadas no ramo local "publico". Uso: npm run github
//                                                                            npm run github -- "o que mudou"
//                                                                            npm run github -- --sem-enviar (só prepara)

const { execFileSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const RAIZ = path.join(__dirname, '..');
// decisão do dono em 01/11; .claude (o comando /publicar e as configurações do Claude) desde 09/11; android (protótipo
// do app de celular, pela metade) desde 11/11, até o dono decidir
const FICA_AQUI = ['docs/chats', 'docs/pesquisa-mercado-2026-10.md', '.claude', 'android'];
const RAMO = 'refs/heads/publico';
// E-mail que o GitHub dá para cada conta, para o e-mail pessoal não aparecer no código público.
const AUTOR = { GIT_AUTHOR_NAME: 'Mauricio', GIT_AUTHOR_EMAIL: '230467463+stickoin@users.noreply.github.com' };

const git = (args, env) => execFileSync('git', args, { cwd: RAIZ, encoding: 'utf8', env: { ...process.env, ...env } }).trim();
const existe = (ref) => { try { return git(['rev-parse', '--verify', '-q', ref]); } catch { return ''; } };

const args = process.argv.slice(2);
const semEnviar = args.includes('--sem-enviar');
const anterior = existe(RAMO);
const mensagem = args.find((a) => !a.startsWith('--')) || (anterior ? 'Atualização do código' : 'Primeira versão pública do HuntDesk Navegador');

// Monta a foto num índice à parte, para não mexer no que está aberto na pasta.
const indice = path.join(os.tmpdir(), `huntdesk-publicar-${Date.now()}.index`);
let arvore;
try {
  git(['read-tree', 'main'], { GIT_INDEX_FILE: indice });
  git(['rm', '--cached', '-r', '-q', '--ignore-unmatch', '--', ...FICA_AQUI], { GIT_INDEX_FILE: indice });
  arvore = git(['write-tree'], { GIT_INDEX_FILE: indice });
} finally {
  fs.rmSync(indice, { force: true });
}

if (anterior && git(['rev-parse', `${anterior}^{tree}`]) === arvore) {
  console.log('Nada mudou desde o último envio.');
} else {
  const versao = git(['rev-parse', '--short', 'main']);
  const pai = anterior ? ['-p', anterior] : [];
  const foto = git(['commit-tree', arvore, ...pai, '-m', `${mensagem}\n\n(main ${versao})`],
    { ...AUTOR, GIT_COMMITTER_NAME: AUTOR.GIT_AUTHOR_NAME, GIT_COMMITTER_EMAIL: AUTOR.GIT_AUTHOR_EMAIL });
  git(['update-ref', RAMO, foto]);
  console.log(`Foto pronta: ${foto.slice(0, 7)} (código de main ${versao}, sem ${FICA_AQUI.join(' e ')}).`);
}

if (!semEnviar) {
  // Usa o acesso do programa do GitHub (gh) já conectado neste PC, em vez de abrir uma janela de login.
  execFileSync('git', ['-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential',
    'push', 'origin', `${RAMO}:refs/heads/main`], { cwd: RAIZ, stdio: 'inherit', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  console.log('Enviado para o GitHub.');
}
