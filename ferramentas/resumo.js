'use strict';
// Resumo das medições do P0: para cada conta e cada fase (na tela / escondida, freio ligado / desligado),
// quanto a memória cresceu por minuto. Uso: npm run resumo            (a medição mais recente)
//                                           npm run resumo -- todos   (todas as medições da pasta)
//                                           npm run resumo -- arquivo.csv

const fs = require('node:fs');
const path = require('node:path');

const PASTA = path.join(__dirname, '..', 'medicoes');
const MIN_PONTOS = 6; // menos de 1 minuto de medição não dá número confiável

function lerCsv(arquivo) {
  const linhas = fs.readFileSync(arquivo, 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/);
  const cab = linhas.shift().split(',');
  return linhas.map((l) => {
    const campos = l.split(','); // o medidor só põe vírgula dentro da nota dos eventos, que o resumo não usa
    return Object.fromEntries(cab.map((k, i) => [k, campos[i] || '']));
  });
}

function inclinacao(pontos) {
  const n = pontos.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const [x, y] of pontos) { sx += x; sy += y; sxx += x * x; sxy += x * y; }
  const d = n * sxx - sx * sx;
  return d === 0 ? null : (n * sxy - sx * sy) / d;
}

function fase(r) {
  if (!r.visivel) return r.estado === 'janela minimizada' ? 'janela minimizada' : 'geral';
  const tela = r.visivel === 'sim' ? 'na tela' : 'escondida';
  const chrome = r.visibilidade === 'hidden' ? 'parada' : 'rodando';
  return `${tela}, freio ${r.freio === 'sim' ? 'ligado' : 'desligado'} (página ${chrome})`;
}

const media = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const f = (x, c = 1) => (x == null || !isFinite(x) ? '—' : x.toFixed(c).replace('.', ','));

function resumir(arquivo) {
  const linhas = lerCsv(arquivo).filter((r) => r.linha !== 'evento' && r.ram_mb !== '');
  const trechos = [];
  const aberto = new Map();
  for (const r of linhas) {
    const chave = fase(r);
    let t = aberto.get(r.linha);
    if (!t || t.fase !== chave) {
      t = { linha: r.linha, fase: chave, pontos: [], cpu: [], fps: [] };
      aberto.set(r.linha, t);
      trechos.push(t);
    }
    t.pontos.push([parseFloat(r.minuto), parseFloat(r.ram_mb)]);
    if (r.cpu_pct !== '') t.cpu.push(parseFloat(r.cpu_pct));
    if (r.fps !== '') t.fps.push(parseFloat(r.fps));
  }
  const saida = [`## ${path.basename(arquivo)}`, '',
    '| Quem | Fase | Minutos | RAM no começo → no fim | Cresce (MB/min) | CPU média | Quadros/s |', '|---|---|---|---|---|---|---|'];
  for (const t of trechos) {
    if (t.pontos.length < MIN_PONTOS) continue;
    const ini = t.pontos[0], fim = t.pontos[t.pontos.length - 1];
    saida.push(`| ${t.linha} | ${t.fase} | ${f(fim[0] - ini[0], 0)} | ${f(ini[1], 0)} → ${f(fim[1], 0)} MB | ${f(inclinacao(t.pontos))} | ${f(media(t.cpu))}% | ${f(media(t.fps), 0)} |`);
  }
  return saida.join('\n');
}

const arg = process.argv[2];
let arquivos;
if (arg === 'todos') arquivos = fs.readdirSync(PASTA).filter((n) => n.endsWith('.csv')).map((n) => path.join(PASTA, n));
else if (arg) arquivos = [path.resolve(arg)];
else {
  const todos = fs.readdirSync(PASTA).filter((n) => n.endsWith('.csv')).map((n) => path.join(PASTA, n));
  arquivos = todos.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs).slice(0, 1);
}
if (!arquivos.length) { console.log('Nenhuma medição em', PASTA); process.exit(0); }
const texto = '# Resumo das medições do P0\n\n' + arquivos.sort().map(resumir).join('\n\n') + '\n';
const destino = path.join(PASTA, 'resumo.md');
fs.writeFileSync(destino, texto);
console.log(texto);
console.log('Gravado em', destino);
