'use strict';
// Cópia das configurações num arquivo (.huntdesk), para levar a outro PC ou guardar de reserva: pastas, telas, contas
// (nome, cor, endereço) e as opções das Configurações. Os logins só vão se o jogador pedir, trancados com uma senha que
// ele escolhe: no PC o Chrome tranca cada login com a chave do Windows deste usuário, e por isso copiar a pasta dos
// dados não leva login nenhum. Aqui o próprio programa tira os logins de cada cofre, tranca com a senha (AES-256-GCM,
// chave tirada da senha pelo scrypt) e, no outro PC, destranca e devolve. Nada disso aparece na tela.
// Importar sempre SOMA ao que já existe: conta importada ganha um número novo (nunca pega o cofre de outra conta), e
// conta igual (mesmo nome e mesmo site na pasta de mesmo nome) não se repete.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const config = require('./config');

const TIPO = 'huntdesk-navegador-copia';
const VERSAO = 1;
const EXTENSAO = 'huntdesk';
const SENHA_MIN = 8;
const ARQUIVO_MAX = 200 * 1024 * 1024; // arquivo maior que isso não é uma cópia nossa
const DADOS_POR_CONTA_MAX = 30 * 1024 * 1024; // além disso, só os cookies e o Local Storage daquela conta
// O que o site guarda no PC além dos cookies: Local Storage e IndexedDB (sem cifra do Windows; vão como arquivos).
const PASTAS_LOGIN = ['Local Storage', 'IndexedDB'];
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

class ErroCopia extends Error {
  constructor(codigo) { super(codigo); this.codigo = codigo; }
}

const chaveNome = (s) => String(s || '').trim().toLowerCase();

// ---------- montar e conferir ----------

function montar(cfg, versaoPrograma) {
  const conta = (id) => cfg.contas.find((c) => c.id === id);
  return {
    tipo: TIPO,
    versao: VERSAO,
    programa: versaoPrograma,
    criadoEm: new Date().toISOString(),
    pastas: cfg.pastas.map((p) => ({
      nome: p.nome,
      aberta: p.aberta,
      telas: p.telas.map((t) => t.contas.map(conta).filter(Boolean).map((c) => ({
        ref: c.id, nome: c.nome, url: c.url, cor: c.cor == null ? null : c.cor, freio: c.freio, ligada: c.ligada, mudo: !!c.mudo,
      }))),
    })),
    opcoes: {
      guarda: { limiteMb: cfg.guarda.limiteMb, acao: cfg.guarda.acao, avisoTotalMb: cfg.guarda.avisoTotalMb, notificacoes: cfg.guarda.notificacoes },
      abrirAoIniciar: cfg.abrirAoIniciar,
      economico: cfg.economico,
      lateral: cfg.visual.lateral,
    },
    logins: null,
    // Extensões de terceiros: só a lista, sem os arquivos. As contas vão pela `ref` (o id daqui). No outro PC elas
    // chegam como "falta instalar", e o jogador instala pela tela de sempre, com o aviso.
    extensoes: (cfg.extensoes || []).map((x) => ({ id: x.id, nome: x.nome, origem: x.origem, contas: [...x.contas] })),
  };
}

// Confere o arquivo escolhido: nada quebrado ou estranho entra no programa.
function ler(texto) {
  let bruto;
  try { bruto = JSON.parse(texto); } catch (e) { throw new ErroCopia('arquivo'); }
  if (!bruto || bruto.tipo !== TIPO || !Array.isArray(bruto.pastas)) throw new ErroCopia('arquivo');
  if (!(bruto.versao >= 1 && bruto.versao <= VERSAO)) throw new ErroCopia('versao');
  const refs = new Set();
  let total = 0;
  const pastas = [];
  for (const p of bruto.pastas.slice(0, 200)) {
    if (!p || !Array.isArray(p.telas)) continue;
    const telas = [];
    for (const t of p.telas.slice(0, 500)) {
      const contas = [];
      for (const c of Array.isArray(t) ? t : []) {
        if (!c || typeof c !== 'object' || total >= 300) continue;
        const ref = typeof c.ref === 'string' && c.ref.length <= 40 && !refs.has(c.ref) ? c.ref : null;
        if (ref) refs.add(ref);
        total++;
        contas.push({
          ref,
          nome: config.nomeValido(c.nome, 'Conta'),
          url: config.enderecoValido(c.url) ? c.url : config.JOGO_PADRAO,
          cor: Number.isInteger(c.cor) && c.cor >= 0 && c.cor < config.CORES ? c.cor : null,
          freio: c.freio !== false,
          ligada: c.ligada !== false,
          mudo: c.mudo === true,
        });
      }
      // Tela com mais contas do que cabem vira mais de uma.
      for (let i = 0; i < contas.length; i += config.MAX_POR_TELA) telas.push(contas.slice(i, i + config.MAX_POR_TELA));
    }
    pastas.push({ nome: config.nomeValido(p.nome, 'Pasta'), aberta: p.aberta !== false, telas });
  }
  const o = bruto.opcoes && typeof bruto.opcoes === 'object' ? bruto.opcoes : null;
  const l = bruto.logins;
  const logins = l && typeof l === 'object' && ['sal', 'iv', 'tag', 'dados'].every((k) => typeof l[k] === 'string') ? l : null;
  const extensoes = (Array.isArray(bruto.extensoes) ? bruto.extensoes : []).filter((x) => x && typeof x === 'object').slice(0, 50)
    .map((x) => ({ id: x.id, nome: x.nome, origem: x.origem, contas: (Array.isArray(x.contas) ? x.contas : []).filter((r) => typeof r === 'string' && r.length <= 40) }));
  return { pastas, opcoes: o, logins, contas: total, extensoes };
}

// ---------- senha ----------

function chaveDa(senha, sal) { return crypto.scryptSync(String(senha), sal, 32, SCRYPT); }

function trancar(dados, senha) {
  const sal = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const cifra = crypto.createCipheriv('aes-256-gcm', chaveDa(senha, sal), iv);
  const fechado = Buffer.concat([cifra.update(zlib.gzipSync(JSON.stringify(dados))), cifra.final()]);
  return { cifra: 'aes-256-gcm', kdf: 'scrypt', sal: sal.toString('base64'), iv: iv.toString('base64'), tag: cifra.getAuthTag().toString('base64'), dados: fechado.toString('base64') };
}

function destrancar(l, senha) {
  try {
    const decifra = crypto.createDecipheriv('aes-256-gcm', chaveDa(senha, Buffer.from(l.sal, 'base64')), Buffer.from(l.iv, 'base64'));
    decifra.setAuthTag(Buffer.from(l.tag, 'base64'));
    const aberto = Buffer.concat([decifra.update(Buffer.from(l.dados, 'base64')), decifra.final()]);
    const d = JSON.parse(zlib.gunzipSync(aberto).toString('utf8'));
    return d && typeof d === 'object' && d.contas && typeof d.contas === 'object' ? d : { contas: {} };
  } catch (e) {
    throw new ErroCopia('senha'); // senha errada ou arquivo mexido: o cadeado não abre
  }
}

// ---------- logins de um cofre ----------

function arquivosDe(raiz) {
  const lista = [];
  const andar = (dir, rel) => {
    let itens = [];
    try { itens = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const it of itens) {
      const r = rel ? rel + '/' + it.name : it.name;
      if (it.isDirectory()) andar(path.join(dir, it.name), r);
      // LOCK fica preso pelo Chrome e LOG é só o diário dele: não fazem falta.
      else if (it.isFile() && !/^(LOCK|LOG|LOG\.old)$/.test(it.name)) lista.push(r);
    }
  };
  andar(raiz, '');
  return lista;
}

// Tira os logins de uma conta: cookies pelo próprio Chrome (já abertos com a chave do Windows) e os arquivos do que o
// site guarda.
async function tirarLogins(ses, pastaDoCofre) {
  try { ses.flushStorageData(); } catch (e) { /* segue com o que já está no disco */ }
  await new Promise((r) => setTimeout(r, 300));
  const cookies = (await ses.cookies.get({})).map((k) => ({
    name: k.name, value: k.value, domain: k.domain, hostOnly: k.hostOnly, path: k.path, secure: k.secure, httpOnly: k.httpOnly,
    sameSite: k.sameSite, expirationDate: k.expirationDate,
  }));
  const arquivos = [];
  let tamanho = 0;
  for (const pasta of PASTAS_LOGIN) {
    for (const rel of arquivosDe(path.join(pastaDoCofre, pasta))) {
      let dados;
      try { dados = fs.readFileSync(path.join(pastaDoCofre, pasta, ...rel.split('/'))); } catch (e) { continue; }
      tamanho += dados.length;
      // IndexedDB grande demais (um jogo que guarda imagens, por exemplo) fica: o login costuma estar nos cookies.
      if (tamanho > DADOS_POR_CONTA_MAX && pasta !== 'Local Storage') continue;
      arquivos.push({ caminho: pasta + '/' + rel, dados: dados.toString('base64') });
    }
  }
  return { cookies, arquivos };
}

// Caminho dentro do cofre que veio do arquivo: só nas pastas de login, sem subir de pasta.
function caminhoSeguro(pastaDoCofre, caminho) {
  if (typeof caminho !== 'string' || caminho.length > 400) return null;
  const partes = caminho.split('/');
  if (!PASTAS_LOGIN.includes(partes[0]) || partes.length < 2 || partes.some((x) => !x || x === '.' || x === '..' || /[\\:*?"<>|]/.test(x))) return null;
  const final = path.resolve(pastaDoCofre, ...partes);
  return final.startsWith(path.resolve(pastaDoCofre) + path.sep) ? final : null;
}

// Devolve os logins a uma conta nova (cofre ainda sem uso): primeiro os arquivos, depois os cookies.
async function devolverLogins(ses, pastaDoCofre, pacote) {
  if (!pacote || typeof pacote !== 'object') return 0;
  for (const a of Array.isArray(pacote.arquivos) ? pacote.arquivos : []) {
    const destino = a && typeof a.dados === 'string' && caminhoSeguro(pastaDoCofre, a.caminho);
    if (!destino) continue;
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, Buffer.from(a.dados, 'base64'));
  }
  let postos = 0;
  for (const k of Array.isArray(pacote.cookies) ? pacote.cookies : []) {
    if (!k || typeof k.name !== 'string' || typeof k.value !== 'string' || typeof k.domain !== 'string') continue;
    const host = k.domain.replace(/^\./, '');
    const caminho = typeof k.path === 'string' && k.path.startsWith('/') ? k.path : '/';
    const c = { url: (k.secure ? 'https://' : 'http://') + host + caminho, name: k.name, value: k.value, path: caminho, secure: !!k.secure, httpOnly: !!k.httpOnly };
    if (!k.hostOnly) c.domain = k.domain;
    if (['unspecified', 'no_restriction', 'lax', 'strict'].includes(k.sameSite)) c.sameSite = k.sameSite;
    if (typeof k.expirationDate === 'number') c.expirationDate = k.expirationDate;
    try { await ses.cookies.set(c); postos++; } catch (e) { /* cookie que o Chrome não aceita fica de fora */ }
  }
  try { await ses.cookies.flushStore(); } catch (e) { /* grava ao fechar */ }
  return postos;
}

// ---------- somar ao que já existe ----------

// Põe as pastas, telas e contas da cópia no cfg e aplica as opções. Devolve as contas novas (com a ref do arquivo, para
// os logins) e quantas já existiam.
function somar(cfg, copia) {
  const conta = (id) => cfg.contas.find((c) => c.id === id);
  const novas = [];
  let iguais = 0;
  for (const p of copia.pastas) {
    let destino = cfg.pastas.find((q) => chaveNome(q.nome) === chaveNome(p.nome));
    const existentes = new Set((destino ? destino.telas.flatMap((t) => t.contas) : []).map(conta).filter(Boolean)
      .map((c) => chaveNome(c.nome) + '|' + config.siteDe(c.url)));
    for (const t of p.telas) {
      const ids = [];
      for (const c of t) {
        const chave = chaveNome(c.nome) + '|' + config.siteDe(c.url);
        if (existentes.has(chave)) { iguais++; continue; }
        existentes.add(chave);
        const id = 'conta' + cfg.proximaConta++;
        cfg.contas.push({ id, nome: c.nome, url: c.url, freio: c.freio, ligada: c.ligada, mudo: c.mudo, cor: c.cor });
        novas.push({ id, ref: c.ref });
        ids.push(id);
      }
      if (!ids.length) continue;
      if (!destino) {
        destino = { id: 'pasta' + cfg.proximaPasta++, nome: p.nome, aberta: p.aberta, telas: [] };
        cfg.pastas.push(destino);
      }
      destino.telas.push({ id: 'tela' + cfg.proximaTela++, contas: ids });
    }
  }
  // Extensões: as contas novas trocam a ref do arquivo pelo id daqui. A que já está instalada ganha essas contas; a que
  // não está entra como "falta instalar".
  const idDe = new Map(novas.filter((n) => n.ref).map((n) => [n.ref, n.id]));
  let extensoesFaltando = 0;
  for (const x of config.limparExtensoes((copia.extensoes || []).map((e) => ({ ...e, contas: e.contas.map((r) => idDe.get(r)) })),
    new Set(cfg.contas.map((c) => c.id)))) {
    const aqui = cfg.extensoes.find((e) => e.id === x.id);
    if (aqui) { aqui.contas = [...new Set([...aqui.contas, ...x.contas])]; continue; }
    cfg.extensoes.push({ ...x, versao: '0', pendente: true });
    extensoesFaltando++;
  }
  const o = copia.opcoes;
  let economico = null;
  if (o) {
    cfg.guarda = config.limparGuarda({ ...cfg.guarda, ...(o.guarda || {}) }, cfg.guarda);
    if (typeof o.abrirAoIniciar === 'boolean') cfg.abrirAoIniciar = o.abrirAoIniciar;
    if (typeof o.lateral === 'boolean') cfg.visual.lateral = o.lateral;
    if (typeof o.economico === 'boolean' && o.economico !== cfg.economico) economico = o.economico;
  }
  return { novas, iguais, economico, extensoesFaltando };
}

module.exports = { montar, ler, trancar, destrancar, tirarLogins, devolverLogins, somar, caminhoSeguro, ErroCopia, EXTENSAO, SENHA_MIN };
