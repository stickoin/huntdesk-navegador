'use strict';
// Partes usadas pela barra (ui.js) e pelas janelinhas (sobre.js): números, siglas e o estado de cada conta.

const ESTADOS = { ok: 'rodando', carregando: 'carregando…', travada: 'sem resposta', caiu: 'caiu', erro: 'erro ao abrir', desligada: 'desligada' };
// O que cada motivo de queda quer dizer (os nomes vêm do Chrome).
const QUEDAS = {
  oom: 'A página ficou sem memória.',
  'memory-eviction': 'O Chrome fechou a página para liberar memória.',
  crashed: 'A página deu um erro interno do Chrome.',
  'abnormal-exit': 'A página fechou de repente, por um erro.',
  killed: 'Algo de fora fechou a página (o Windows ou outro programa).',
  'clean-exit': 'A página se fechou sozinha, sem erro.',
  'launch-failed': 'O Chrome não conseguiu abrir a página.',
  'integrity-failure': 'O Windows bloqueou a página numa verificação de segurança.',
};
const motivoQueda = (m) => QUEDAS[m] || 'O Chrome fechou a página sem dizer o motivo.';
const CORES = 8; // classes .cor0 a .cor7 no estilo.css; o jogador escolhe uma para cada conta
const $ = (sel) => document.querySelector(sel);
let E = null; // último estado recebido do programa

const acao = (tipo, dados) => window.p0.acao(tipo, dados);

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
function fmt(x, casas = 0, unidade = '') {
  if (x == null || !isFinite(x)) return '—';
  return x.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }) + unidade;
}
// 1.024 MB ou mais aparece em GB.
const gb = (mb) => (mb == null ? '—' : mb >= 1024 ? fmt(mb / 1024, 1, ' GB') : fmt(mb, 0, ' MB'));
function cresce(x) {
  if (x == null) return '<span class="nota">medindo…</span>';
  const classe = x > 20 ? 'ruim' : x > 5 ? 'atencao' : 'bom';
  return `<span class="${classe}" title="Quanto a memória sobe por minuto (últimos 5 min)">${x >= 0 ? '+' : ''}${fmt(x, 1)} MB/min</span>`;
}
const uso = (id) => (E && E.amostra && E.amostra.contas[id]) || {};
const alerta = (id) => E && E.alertas && E.alertas.contas[id];
const hora = (ms) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

// Memória perto do limite (80%) fica amarela; acima, vermelha.
function ram(u) {
  const lim = E.guarda.limiteMb;
  const classe = u.ram == null ? '' : u.ram >= lim ? 'ruim' : u.ram >= lim * 0.8 ? 'atencao' : '';
  return `<span class="${classe}" title="Limite por conta: ${fmt(lim, 0, ' MB')} (Configurações)">${fmt(u.ram, 0, ' MB')}</span>`;
}

function textoAlerta(a) {
  if (a.recarregada) return `Recarregada sozinha às ${hora(a.quando)}: passou de ${fmt(a.limite, 0, ' MB')} (${fmt(a.ram, 0, ' MB')})`;
  return `Passou do limite: ${fmt(a.ram, 0)} de ${fmt(a.limite, 0, ' MB')} às ${hora(a.quando)}${a.motivo ? ' — ' + a.motivo : ''}`;
}

// "Conta 1" vira C1; um nome sem número fica com as duas primeiras letras.
function sigla(nome) {
  const n = String(nome).trim();
  return (/\d/.test(n) ? n[0] + n.replace(/\D/g, '').slice(0, 2) : n.slice(0, 2)).toUpperCase();
}
// A cor escolhida pelo jogador; sem escolha, a do número da conta (conta1 → cor0, conta2 → cor1…, voltando a cada 6).
const cor = (c) => 'cor' + (Number.isInteger(c.cor) ? c.cor : ((Number(String(c.id).replace(/\D/g, '')) || 1) - 1) % 6);
// Sigla colorida; `bola` é a bolinha do estado ('' verde, atencao, ruim, off, sem = nenhuma).
const ini = (c, bola = '', extra = '') => `<span class="ini ${cor(c)} ${bola} ${extra}">${esc(sigla(c.nome))}</span>`;

// O que o cartão e a janelinha dizem da conta.
function estadoDe(c, a) {
  if (!c.ligada) return { texto: 'desligada', classe: '', bola: 'off' };
  if (c.estado === 'caiu') return { texto: 'caiu', classe: 'ruim', bola: 'ruim' };
  if (a) return a.recarregada ? { texto: 'recarregada sozinha', classe: 'atencao', bola: 'atencao' } : { texto: 'passou do limite', classe: 'ruim', bola: 'ruim' };
  if (c.estado !== 'ok') return { texto: ESTADOS[c.estado] || c.estado, classe: 'atencao', bola: 'atencao' };
  return c.naTela ? { texto: 'na tela', classe: 'bom', bola: '' } : { texto: 'fora da tela', classe: '', bola: '' };
}
