'use strict';
// Contas, pastas e telas e o tamanho da janela, guardados em config.json na pasta de dados do programa
// (%APPDATA%\HuntDesk Navegador). Os logins não ficam aqui: cada conta tem o próprio cofre do Chrome.

const fs = require('node:fs');
const path = require('node:path');
const { app, safeStorage } = require('electron');

const JOGO_PADRAO = 'https://huntera.com.br/game';
const MAX_POR_TELA = 4; // contas lado a lado numa tela
const CORES = 8; // cores que o jogador pode escolher para cada conta (0 a 7)

function arquivo() { return path.join(app.getPath('userData'), 'config.json'); }

// Limite da guarda que vem de fábrica, conforme o modo. Medido com o Huntera: no normal cada conta fica em 800–1.300 MB
// e às vezes cresce até 2,8 GB; no econômico fica em 450–600 MB, com picos de ~770 MB jogando com a janela grande.
const LIMITE_NORMAL = 2048;
const LIMITE_ECONOMICO = 1024;

function padrao() {
  return {
    versao: 3,
    proximaConta: 3,
    proximaPasta: 2,
    proximaTela: 2,
    contas: [
      { id: 'conta1', nome: 'Conta 1', url: JOGO_PADRAO, freio: true, ligada: true },
      { id: 'conta2', nome: 'Conta 2', url: JOGO_PADRAO, freio: true, ligada: true },
    ],
    // Pastas (uma por jogo, por exemplo) com as telas; cada tela mostra de 1 a 4 contas lado a lado e cada conta fica
    // em uma tela só. `atual` é o que está na janela: uma tela, ou 'todas' = a pasta inteira.
    pastas: [{ id: 'pasta1', nome: 'Minhas contas', aberta: true, telas: [{ id: 'tela1', contas: ['conta1', 'conta2'] }] }],
    atual: { pasta: 'pasta1', tela: 'tela1' },
    janela: null,
    // Guarda de memória: o que fazer quando uma conta passa do limite.
    guarda: { limiteMb: LIMITE_NORMAL, acao: 'avisar', avisoTotalMb: 0, notificacoes: true },
    abrirAoIniciar: true, // false = as contas esperam o jogador apertar Ligar
    economico: false, // modo do Chrome para computador fraco: menos memória, imagem um pouco mais simples
    visual: { lateral: true }, // lateral aberta (false = só as siglas)
    huntdesk: null, // ligação com o app do HuntDesk (ver limparLigacao); null = o jogador ainda não abriu a janela dele
    boasVindas: true, // true = falta mostrar a tela de boas-vindas (só quem abre o programa pela primeira vez)
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

// Ligação com o app do HuntDesk (o que a extensão guarda: servidor do PC e conta na nuvem), copiada para todas as
// contas. O que vem da extensão é conferido antes de ir para cá e para as outras contas.
function limparLigacao(d) {
  if (!d || typeof d !== 'object') return null;
  const origem = (o) => { try { const u = new URL(String(o)); return /^https?:$/.test(u.protocol) ? u.origin : null; } catch (e) { return null; } };
  const c = d.cloud;
  return {
    pc: d.pc === true,
    pcOrigin: origem(d.pcOrigin) || 'http://localhost:8766',
    cloud: c && typeof c === 'object' && origem(c.origin) && (typeof c.key === 'string' || typeof c.chaveCifrada === 'string')
      ? { origin: origem(c.origin), ...(typeof c.key === 'string' ? { key: c.key.slice(0, 500) } : { chaveCifrada: c.chaveCifrada.slice(0, 4000) }),
        id: c.id == null ? null : String(c.id).slice(0, 100), email: typeof c.email === 'string' ? c.email.slice(0, 200) : null }
      : null,
  };
}

// No config.json a chave da conta na nuvem fica cifrada pelo Windows (só este usuário neste PC abre). A cifra só existe
// depois de o programa ficar pronto, e o arquivo é lido antes: por isso abrirChave é um passo à parte. Sem conseguir
// abrir (pasta copiada de outro PC), a ligação cai e o jogador conecta de novo.
function abrirChave(cfg) {
  const c = cfg.huntdesk && cfg.huntdesk.cloud;
  if (!c || !c.chaveCifrada) return;
  try {
    const key = safeStorage.decryptString(Buffer.from(c.chaveCifrada, 'base64'));
    cfg.huntdesk = limparLigacao({ ...cfg.huntdesk, cloud: { origin: c.origin, key, id: c.id, email: c.email } });
  } catch (e) {
    cfg.huntdesk = { ...cfg.huntdesk, cloud: null };
  }
}

function paraDisco(cfg) {
  const c = cfg.huntdesk && cfg.huntdesk.cloud;
  if (!c || !c.key) return cfg;
  try {
    if (!safeStorage.isEncryptionAvailable()) return cfg;
    const { key, ...resto } = c;
    return { ...cfg, huntdesk: { ...cfg.huntdesk, cloud: { ...resto, chaveCifrada: safeStorage.encryptString(key).toString('base64') } } };
  } catch (e) {
    return cfg; // sem a cifra do Windows, grava como a extensão guarda: melhor do que perder a ligação
  }
}

function enderecoValido(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch (e) {
    return false;
  }
}

// Endereço de conta nova ou trocada pelo jogador: só https (sem ele, a senha do jogo viaja sem proteção).
function enderecoSeguro(url) {
  try { return new URL(url).protocol === 'https:'; } catch (e) { return false; }
}

// O site de um endereço, sem o "www.": é o que aparece na lateral e dá nome à pasta de um jogo novo.
function siteDe(url) {
  try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u.hostname.replace(/^www\./, '') : ''; } catch (e) { return ''; }
}

// A extensão do HuntDesk só lê o Huntera: só as contas dele a carregam.
const ehHuntera = (url) => /(^|\.)huntera\.com\.br$/.test(siteDe(url));

function nomeValido(nome, reserva) {
  const n = typeof nome === 'string' ? nome.trim().slice(0, 40) : '';
  return n || reserva;
}

function numeroDoId(id, prefixo) {
  const m = new RegExp('^' + prefixo + '(\\d+)$').exec(id);
  return m ? Number(m[1]) : 0;
}

// Pastas e telas: cada conta fica em exatamente uma tela, com no máximo 4 por tela. Conta que sobrar (de um arquivo da
// versão de antes, com os layouts, ou estragado) ganha uma tela só dela na primeira pasta.
function limparPastas(cfg, bruto) {
  const ids = new Set(cfg.contas.map((c) => c.id));
  const usadas = new Set();
  const pastasVistas = new Set();
  const telasVistas = new Set();
  const novoId = (prefixo, vistos) => { let n = 1; while (vistos.has(prefixo + n)) n++; vistos.add(prefixo + n); return prefixo + n; };
  cfg.pastas = [];
  for (const p of Array.isArray(bruto.pastas) ? bruto.pastas : []) {
    if (!p || typeof p.id !== 'string' || !numeroDoId(p.id, 'pasta') || pastasVistas.has(p.id)) continue;
    pastasVistas.add(p.id);
    const telas = [];
    for (const t of Array.isArray(p.telas) ? p.telas : []) {
      if (!t || typeof t.id !== 'string' || !numeroDoId(t.id, 'tela') || telasVistas.has(t.id)) continue;
      telasVistas.add(t.id);
      const contas = [];
      for (const id of Array.isArray(t.contas) ? t.contas : []) {
        if (!ids.has(id) || usadas.has(id) || contas.length >= MAX_POR_TELA) continue;
        usadas.add(id);
        contas.push(id);
      }
      if (contas.length) telas.push({ id: t.id, contas });
    }
    cfg.pastas.push({ id: p.id, nome: nomeValido(p.nome, 'Pasta'), aberta: p.aberta !== false, telas });
  }
  if (!cfg.pastas.length) cfg.pastas.push({ id: novoId('pasta', pastasVistas), nome: 'Minhas contas', aberta: true, telas: [] });
  const sobra = cfg.contas.filter((c) => !usadas.has(c.id));
  for (const c of sobra) cfg.pastas[0].telas.push({ id: novoId('tela', telasVistas), contas: [c.id] });
  const a = bruto.atual || {};
  const pa = cfg.pastas.find((p) => p.id === a.pasta);
  if (pa && (a.tela === 'todas' || pa.telas.some((t) => t.id === a.tela))) cfg.atual = { pasta: pa.id, tela: a.tela };
  // Vindo da versão de antes (sem pastas), a pasta inteira fica na tela, como a grade de antes.
  else if (!Array.isArray(bruto.pastas) || !cfg.pastas[0].telas.length) cfg.atual = { pasta: cfg.pastas[0].id, tela: 'todas' };
  else cfg.atual = { pasta: cfg.pastas[0].id, tela: cfg.pastas[0].telas[0].id };
  const maior = (prefixo, lista) => Math.max(0, ...lista.map((x) => numeroDoId(x, prefixo)));
  cfg.proximaPasta = Math.max(Number(bruto.proximaPasta) || 0, maior('pasta', [...pastasVistas]) + 1, 1);
  cfg.proximaTela = Math.max(Number(bruto.proximaTela) || 0, maior('tela', [...telasVistas]) + 1, 1);
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
    cor: Number.isInteger(c.cor) && c.cor >= 0 && c.cor < CORES ? c.cor : null, // null = a cor do número da conta
  }));
  cfg.proximaConta = Math.max(Number(bruto.proximaConta) || 0, ...cfg.contas.map((c) => numeroDoId(c.id, 'conta') + 1), 1);
  limparPastas(cfg, bruto);
  cfg.guarda = limparGuarda(bruto.guarda);
  // Até a versão 1 o limite de fábrica era 3.072 MB; quem nunca mexeu nele passa para o de agora.
  if (!(bruto.versao >= 2) && cfg.guarda.limiteMb === 3072) cfg.guarda.limiteMb = LIMITE_NORMAL;
  // Arquivo sem esse campo é de quem já usava o programa antes das boas-vindas: não precisa delas.
  cfg.boasVindas = bruto.boasVindas === true;
  cfg.abrirAoIniciar = bruto.abrirAoIniciar !== false;
  cfg.economico = bruto.economico === true;
  const v = bruto.visual || {};
  cfg.visual = { lateral: v.lateral !== false };
  cfg.huntdesk = bruto.huntdesk ? limparLigacao(bruto.huntdesk) : null;
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
      return { ...padrao(), boasVindas: false }; // quem tinha arquivo, mesmo estragado, já usava o programa
    }
    return padrao();
  }
}

let timer = null;
function gravarAgora(cfg) {
  clearTimeout(timer);
  const f = arquivo();
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f + '.tmp', JSON.stringify(paraDisco(cfg), null, 2));
  fs.renameSync(f + '.tmp', f); // troca de uma vez: um desligamento no meio nunca deixa o arquivo pela metade
}
function salvar(cfg) {
  clearTimeout(timer);
  timer = setTimeout(() => gravarAgora(cfg), 300);
}

module.exports = { carregar, salvar, gravarAgora, enderecoValido, enderecoSeguro, siteDe, ehHuntera, nomeValido, limparGuarda, limparLigacao, abrirChave, limiteDoModo, JOGO_PADRAO, MAX_POR_TELA, CORES, LIMITE_MIN, LIMITE_MAX };
