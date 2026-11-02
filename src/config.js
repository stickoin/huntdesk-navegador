'use strict';
// Contas, layouts e o tamanho da janela, guardados em config.json na pasta de dados do programa
// (%APPDATA%\HuntDesk Navegador P0). Os logins não ficam aqui: cada conta tem o próprio cofre do Chrome.

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

const JOGO_PADRAO = 'https://huntera.com.br/game';
const MODOS = ['grade', 'abas'];
const MAX_COLUNAS = 6;

function arquivo() { return path.join(app.getPath('userData'), 'config.json'); }

// Limite da guarda que vem de fábrica, conforme o modo. Medido com o Huntera: no normal cada conta fica em 800–1.300 MB
// e às vezes cresce até 2,8 GB; no econômico fica em 450–600 MB, com picos de ~770 MB jogando com a janela grande.
const LIMITE_NORMAL = 2048;
const LIMITE_ECONOMICO = 1024;

function padrao() {
  return {
    versao: 2,
    proximaConta: 3,
    proximoLayout: 2,
    contas: [
      { id: 'conta1', nome: 'Conta 1', url: JOGO_PADRAO, freio: true, ligada: true },
      { id: 'conta2', nome: 'Conta 2', url: JOGO_PADRAO, freio: true, ligada: true },
    ],
    layouts: [{ id: 'layout1', nome: 'Principal', modo: 'grade', colunas: 0, contas: ['conta1', 'conta2'], aba: 'conta1' }],
    layoutAtual: 'layout1',
    janela: null,
    // Guarda de memória: o que fazer quando uma conta passa do limite.
    guarda: { limiteMb: LIMITE_NORMAL, acao: 'avisar', avisoTotalMb: 0, notificacoes: true },
    abrirAoIniciar: true, // false = as contas esperam o jogador apertar Ligar
    economico: false, // modo do Chrome para computador fraco: menos memória, imagem um pouco mais simples
    visual: { lateral: true, faixas: true }, // lateral aberta (false = só as siglas) e faixa em cima de cada conta
  };
}

const ACOES_GUARDA = ['avisar', 'recarregar'];
const LIMITE_MIN = 200;
const LIMITE_MAX = 32768;

// Valor inválido fica com o da reserva: o padrão ao ler o arquivo, ou o valor de antes quando o jogador muda um campo.
function limparGuarda(g, reserva) {
  const p = reserva || padrao().guarda;
  if (!g || typeof g !== 'object') return p;
  const mbOk = (n) => Number.isInteger(n) && n >= LIMITE_MIN && n <= LIMITE_MAX;
  return {
    limiteMb: mbOk(g.limiteMb) ? g.limiteMb : p.limiteMb,
    acao: ACOES_GUARDA.includes(g.acao) ? g.acao : p.acao,
    avisoTotalMb: g.avisoTotalMb === 0 || mbOk(g.avisoTotalMb) ? g.avisoTotalMb : p.avisoTotalMb,
    notificacoes: g.notificacoes !== false,
  };
}

// Ao trocar de modo, o limite que estava no de fábrica do modo antigo passa para o do novo; um escolhido pelo jogador fica.
function limiteDoModo(limiteMb, economico) {
  const antigo = economico ? LIMITE_NORMAL : LIMITE_ECONOMICO;
  return limiteMb === antigo ? (economico ? LIMITE_ECONOMICO : LIMITE_NORMAL) : limiteMb;
}

function enderecoValido(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch (e) {
    return false;
  }
}

function nomeValido(nome, reserva) {
  const n = typeof nome === 'string' ? nome.trim().slice(0, 40) : '';
  return n || reserva;
}

function numeroDoId(id, prefixo) {
  const m = new RegExp('^' + prefixo + '(\\d+)$').exec(id);
  return m ? Number(m[1]) : 0;
}

// Confere o que veio do arquivo: nada quebrado ou estranho entra no programa.
function limpar(bruto) {
  const cfg = padrao();
  const vistos = new Set();
  cfg.contas = (Array.isArray(bruto.contas) ? bruto.contas : []).filter((c) => {
    if (!c || typeof c.id !== 'string' || !numeroDoId(c.id, 'conta') || vistos.has(c.id)) return false;
    vistos.add(c.id);
    return true;
  }).map((c) => ({
    id: c.id,
    nome: nomeValido(c.nome, c.id),
    url: enderecoValido(c.url) ? c.url : JOGO_PADRAO,
    freio: c.freio !== false,
    ligada: c.ligada !== false,
    mudo: c.mudo === true, // som desligado só nesta conta
  }));
  const ids = new Set(cfg.contas.map((c) => c.id));
  const layoutsVistos = new Set();
  cfg.layouts = (Array.isArray(bruto.layouts) ? bruto.layouts : []).filter((l) => {
    if (!l || typeof l.id !== 'string' || !numeroDoId(l.id, 'layout') || layoutsVistos.has(l.id)) return false;
    layoutsVistos.add(l.id);
    return true;
  }).map((l) => {
    const contas = [...new Set(Array.isArray(l.contas) ? l.contas : [])].filter((id) => ids.has(id));
    return {
      id: l.id,
      nome: nomeValido(l.nome, 'Layout'),
      modo: MODOS.includes(l.modo) ? l.modo : 'grade',
      colunas: Number.isInteger(l.colunas) && l.colunas >= 0 && l.colunas <= MAX_COLUNAS ? l.colunas : 0,
      contas,
      aba: contas.includes(l.aba) ? l.aba : contas[0] || null,
    };
  });
  if (!cfg.layouts.length) cfg.layouts = [{ id: 'layout1', nome: 'Principal', modo: 'grade', colunas: 0, contas: [...ids], aba: [...ids][0] || null }];
  cfg.layoutAtual = cfg.layouts.some((l) => l.id === bruto.layoutAtual) ? bruto.layoutAtual : cfg.layouts[0].id;
  cfg.proximaConta = Math.max(Number(bruto.proximaConta) || 0, ...cfg.contas.map((c) => numeroDoId(c.id, 'conta') + 1), 1);
  cfg.proximoLayout = Math.max(Number(bruto.proximoLayout) || 0, ...cfg.layouts.map((l) => numeroDoId(l.id, 'layout') + 1), 1);
  cfg.guarda = limparGuarda(bruto.guarda);
  // Até a versão 1 o limite de fábrica era 3.072 MB; quem nunca mexeu nele passa para o de agora.
  if (!(bruto.versao >= 2) && cfg.guarda.limiteMb === 3072) cfg.guarda.limiteMb = LIMITE_NORMAL;
  cfg.abrirAoIniciar = bruto.abrirAoIniciar !== false;
  cfg.economico = bruto.economico === true;
  const v = bruto.visual || {};
  cfg.visual = { lateral: v.lateral !== false, faixas: v.faixas !== false };
  const j = bruto.janela;
  if (j && [j.width, j.height].every((n) => Number.isInteger(n) && n >= 400)) {
    cfg.janela = { width: j.width, height: j.height, x: Number.isInteger(j.x) ? j.x : undefined, y: Number.isInteger(j.y) ? j.y : undefined, maximizada: !!j.maximizada };
  }
  return cfg;
}

function carregar() {
  try {
    return limpar(JSON.parse(fs.readFileSync(arquivo(), 'utf8')));
  } catch (e) {
    if (e.code !== 'ENOENT') {
      // Arquivo estragado: guarda uma cópia para não perder nada e começa do padrão.
      try { fs.renameSync(arquivo(), arquivo() + '.estragado-' + Date.now()); } catch (e2) { /* sem cópia */ }
    }
    return padrao();
  }
}

let timer = null;
function gravarAgora(cfg) {
  clearTimeout(timer);
  const f = arquivo();
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f + '.tmp', JSON.stringify(cfg, null, 2));
  fs.renameSync(f + '.tmp', f); // troca de uma vez: um desligamento no meio nunca deixa o arquivo pela metade
}
function salvar(cfg) {
  clearTimeout(timer);
  timer = setTimeout(() => gravarAgora(cfg), 300);
}

module.exports = { carregar, salvar, gravarAgora, enderecoValido, nomeValido, limparGuarda, limiteDoModo, JOGO_PADRAO, MODOS, MAX_COLUNAS, LIMITE_MIN, LIMITE_MAX };
