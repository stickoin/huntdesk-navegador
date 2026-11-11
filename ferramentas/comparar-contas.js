'use strict';
// Compara o teste A/B: por conta, média de cada hora (memória da tela, privada, heap do jogo) e quanto subiu por hora.
// Uso: node ferramentas/comparar-contas.js arquivo.csv [minutos_ignorados_no_comeco=15]
const fs = require('node:fs');
const arq = process.argv[2];
const pular = Number(process.argv[3] || 15);
const linhas = fs.readFileSync(arq, 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/);
const cab = linhas.shift().split(',');
const rows = linhas.map((l) => Object.fromEntries(cab.map((k, i) => [k, l.split(',')[i] || ''])))
  .filter((r) => /^conta\d$/.test(r.linha) && r.ram_mb);
const incl = (p) => { const n = p.length; let sx = 0, sy = 0, sxx = 0, sxy = 0; for (const [x, y] of p) { sx += x; sy += y; sxx += x * x; sxy += x * y; } const d = n * sxx - sx * sx; return d ? (n * sxy - sx * sy) / d : null; };
const media = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;
const contas = [...new Set(rows.map((r) => r.linha))].sort();
for (const campo of ['ram_mb', 'privada_mb', 'heap_js_mb']) {
  console.log(`\n${campo}  (média por hora; última coluna = subida por hora depois dos ${pular} min iniciais)`);
  const horas = Math.ceil(Math.max(...rows.map((r) => +r.minuto)) / 60);
  console.log('conta   ' + Array.from({ length: horas }, (_, h) => `h${h + 1}`.padStart(7)).join('') + '   MB/h   %visível');
  for (const c of contas) {
    const rc = rows.filter((r) => r.linha === c);
    const cols = Array.from({ length: horas }, (_, h) => media(rc.filter((r) => +r.minuto >= h * 60 && +r.minuto < (h + 1) * 60).map((r) => +r[campo])));
    const p = rc.filter((r) => +r.minuto >= pular && r[campo]).map((r) => [+r.minuto / 60, +r[campo]]);
    const vis = rc.filter((r) => r.visivel === 'sim').length / rc.length * 100;
    console.log(c.padEnd(8) + cols.map((x) => (isNaN(x) ? '-' : x.toFixed(0)).padStart(7)).join('') + (incl(p)?.toFixed(1) ?? '-').padStart(7) + vis.toFixed(0).padStart(9));
  }
}
