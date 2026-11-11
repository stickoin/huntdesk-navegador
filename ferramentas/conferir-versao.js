'use strict';
// Confere uma versão antes de lançar: roda todos os autotestes pelo projeto, gera o instalador e roda os autotestes de
// novo no programa empacotado (dist/win-unpacked). Teste que falha é repetido uma vez (alguns dependem da janela estar
// visível). Não envia nada para lugar nenhum.
// Uso: npm run conferir                  (tudo)
//      npm run conferir -- --sem-instalador   (só os testes pelo projeto)

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const versao = require(path.join(RAIZ, 'package.json')).version;
const semInstalador = process.argv.includes('--sem-instalador');
const EXE = path.join(RAIZ, 'dist', 'win-unpacked', 'HuntDesk.exe');
const ELECTRON = require(path.join(RAIZ, 'node_modules', 'electron')); // caminho do electron.exe do projeto

const QUADROS = ['--disable-features=CalculateNativeWinOcclusion'];
const TESTES = [
  { nome: 'telas', args: ['--autoteste'] },
  { nome: 'guarda de memória', args: ['--autoteste-guarda'] },
  // Instalado, o programa não grava a planilha de medições que este teste lê: só roda pelo projeto.
  { nome: 'aliviar memória', args: ['--autoteste-alivio'], soProjeto: true },
  { nome: 'boas-vindas', args: ['--autoteste-boasvindas'] },
  { nome: 'conexão', args: ['--autoteste-conexao'] },
  { nome: 'cópia das configurações', args: ['--autoteste-copia'] },
  // A extensão de teste fica dentro do app.asar no empacotado, e o Chrome não carrega extensão de lá (o jogador escolhe
  // uma pasta de verdade): só roda pelo projeto.
  { nome: 'outras extensões', args: ['--autoteste-extensoes'], soProjeto: true },
  { nome: 'quadros', args: ['--autoteste-quadros', ...QUADROS] },
  { nome: 'quadros a 30', args: ['--autoteste-quadros', '--quadros=30', ...QUADROS] },
];

function rodar(programa, args) {
  // Sem windowsHide: com a janela escondida pelo Windows, o teste da cópia falha (visto em 11/11).
  const r = spawnSync(programa, args, { cwd: RAIZ, encoding: 'utf8', timeout: 10 * 60 * 1000 });
  const linhas = `${r.stdout || ''}\n${r.stderr || ''}`.split(/\r?\n/).filter((l) => l.startsWith('autoteste:'));
  const fim = linhas.map((l) => l.match(/fim — (\d+) ok, (\d+) falharam/)).find(Boolean);
  const falhas = linhas.filter((l) => l.startsWith('autoteste: FALHOU')).map((l) => l.replace('autoteste: FALHOU ', ''));
  return { ok: fim ? Number(fim[1]) : 0, falharam: fim ? Number(fim[2]) : 1, terminou: !!fim, falhas };
}

function rodada(onde, programa, extra) {
  const resumo = [];
  for (const t of TESTES) {
    if (onde === 'empacotado' && t.soProjeto) { resumo.push({ onde, nome: t.nome, pulado: true }); continue; }
    let r = rodar(programa, [...extra, ...t.args]);
    let repetido = false;
    if (!r.terminou || r.falharam) { repetido = true; r = rodar(programa, [...extra, ...t.args]); }
    const passou = r.terminou && !r.falharam;
    console.log(`${passou ? 'ok    ' : 'FALHOU'} ${onde} — ${t.nome}: ${r.ok} ok, ${r.falharam} falharam${repetido ? ' (repetido)' : ''}`);
    if (!r.terminou) console.log('         o teste não chegou ao fim');
    for (const f of r.falhas) console.log(`         ${f.slice(0, 300)}`);
    resumo.push({ onde, nome: t.nome, passou });
  }
  return resumo;
}

console.log(`Conferindo a versão ${versao}\n`);
const resumo = rodada('projeto', ELECTRON, ['.']);

if (!semInstalador) {
  console.log('\nGerando o instalador…');
  const b = spawnSync('npm run instalador', { cwd: RAIZ, encoding: 'utf8', shell: true, windowsHide: true });
  const instalador = path.join(RAIZ, 'dist', `HuntDesk-Instalador-${versao}.exe`);
  const yml = fs.existsSync(path.join(RAIZ, 'dist', 'latest.yml')) ? fs.readFileSync(path.join(RAIZ, 'dist', 'latest.yml'), 'utf8') : '';
  const certo = b.status === 0 && fs.existsSync(instalador) && yml.includes(`version: ${versao}`);
  console.log(`${certo ? 'ok    ' : 'FALHOU'} instalador — ${certo ? path.relative(RAIZ, instalador) : (b.stderr || b.stdout || '').slice(-1500)}`);
  resumo.push({ onde: 'instalador', nome: 'instalador e latest.yml', passou: certo });
  if (certo) resumo.push(...rodada('empacotado', EXE, []));
}

const ruins = resumo.filter((r) => !r.pulado && !r.passou);
console.log(`\n${ruins.length ? `FALTA RESOLVER: ${ruins.map((r) => `${r.onde} — ${r.nome}`).join('; ')}` : `TUDO CERTO para a versão ${versao}.`}`);
process.exitCode = ruins.length ? 1 : 0;
