'use strict';
// Extensão do HuntDesk dentro das contas: a mesma que o jogador usaria no Chrome, baixada da Chrome Web Store (a
// versão já aprovada lá) e ligada no cofre de cada conta. Ela só lê o jogo e manda para o app do HuntDesk (servidor do
// PC ou conta na nuvem); nada daqui fala com o jogo. As extensões de terceiros, que o jogador escolhe (decisão do
// dono, 10/11), ficam em extensoes.js e usam o mesmo caminho para baixar da loja.
//
// O Electron não instala pela loja nem abre o arquivo da loja (.crx), então este módulo baixa o .crx, confere a
// assinatura (tem de ser a da extensão pedida) e abre o zip numa pasta por versão. Versão nova baixada vale na
// próxima vez que o programa abrir: trocar com o jogo aberto pararia o envio até um F5.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { app, net, WebContentsView } = require('electron');
const { limparLigacao } = require('./config');

const ID = 'faeiljaidolgnnaodgddllcnjepaknmb'; // HuntDesk — Huntera na Chrome Web Store
const INTERVALO = 6 * 60 * 60000; // procura versão nova a cada 6 h
const ESPERA_PRIMEIRA = 10000; // na 1ª vez, o jogo espera a extensão baixar no máximo 10 s
// O que a janela do HuntDesk copia de uma conta para as outras: para onde enviar e a ligação com a conta na nuvem.
const LIGACAO = ['pc', 'pcOrigin', 'cloud'];

const pastaBase = () => path.join(app.getPath('userData'), 'extensoes');

// ---------- arquivo da loja (.crx) ----------

// Lê os campos "de tamanho variável" de uma mensagem protobuf (o formato do cabeçalho do .crx).
function campos(buf) {
  const out = [];
  let i = 0;
  const varint = () => {
    let n = 0, mult = 1, b;
    do { b = buf[i++]; n += (b & 0x7f) * mult; mult *= 128; } while (b & 0x80);
    return n;
  };
  while (i < buf.length) {
    const chave = varint(), num = Math.floor(chave / 8), tipo = chave % 8;
    if (tipo === 0) varint();
    else if (tipo === 2) { const n = varint(); out.push([num, buf.subarray(i, i + n)]); i += n; }
    else if (tipo === 5) i += 4;
    else if (tipo === 1) i += 8;
    else throw new Error('cabeçalho do .crx estranho');
  }
  return out;
}

const idDaChave = (chave) => crypto.createHash('sha256').update(chave).digest('hex').slice(0, 32)
  .replace(/./g, (h) => String.fromCharCode(97 + parseInt(h, 16)));

// Confere o .crx (formato 3) e devolve o zip de dentro e a chave pública da extensão.
function abrirCrx(crx, idEsperado) {
  if (crx.toString('latin1', 0, 4) !== 'Cr24' || crx.readUInt32LE(4) !== 3) throw new Error('não é um .crx da loja');
  const tamCab = crx.readUInt32LE(8);
  const cab = crx.subarray(12, 12 + tamCab), zip = crx.subarray(12 + tamCab);
  const c = campos(cab);
  const assinado = (c.find(([n]) => n === 10000) || [])[1];
  const crxId = assinado && (campos(assinado).find(([n]) => n === 1) || [])[1];
  if (!crxId || crxId.length !== 16) throw new Error('.crx sem identificação');
  // Assinaturas com a chave do desenvolvedor; a que bate com o ID tem de ser a da extensão pedida e conferir com o
  // conteúdo.
  const dados = Buffer.concat([Buffer.from('CRX3 SignedData\x00', 'latin1'), Buffer.alloc(4), assinado, zip]);
  dados.writeUInt32LE(assinado.length, 16);
  for (const [n, prova] of c) {
    if (n !== 2) continue;
    const p = campos(prova);
    const chave = (p.find(([k]) => k === 1) || [])[1], assinatura = (p.find(([k]) => k === 2) || [])[1];
    if (!chave || !assinatura || idDaChave(chave) !== idEsperado) continue;
    if (!crypto.createHash('sha256').update(chave).digest().subarray(0, 16).equals(crxId)) continue;
    const pub = crypto.createPublicKey({ key: chave, format: 'der', type: 'spki' });
    if (!crypto.verify('sha256', dados, pub, assinatura)) throw new Error('assinatura do .crx não confere');
    return { zip, chave };
  }
  throw new Error('o .crx não é da extensão pedida');
}

// Abre o zip (sem zip64, que uma extensão pequena não usa) dentro de destino, sem deixar nada sair dela.
function abrirZip(zip, destino) {
  let fim = zip.length - 22;
  while (fim >= 0 && zip.readUInt32LE(fim) !== 0x06054b50) fim--;
  if (fim < 0) throw new Error('zip sem índice');
  const total = zip.readUInt16LE(fim + 10);
  let p = zip.readUInt32LE(fim + 16);
  for (let k = 0; k < total; k++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error('índice do zip estragado');
    const metodo = zip.readUInt16LE(p + 10), tam = zip.readUInt32LE(p + 20);
    const nN = zip.readUInt16LE(p + 28), nE = zip.readUInt16LE(p + 30), nC = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const nome = zip.toString('utf8', p + 46, p + 46 + nN);
    p += 46 + nN + nE + nC;
    const alvo = path.resolve(destino, nome);
    if (!alvo.startsWith(path.resolve(destino) + path.sep)) throw new Error('caminho estranho no zip: ' + nome);
    if (nome.endsWith('/')) { fs.mkdirSync(alvo, { recursive: true }); continue; }
    const ini = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const bruto = zip.subarray(ini, ini + tam);
    const conteudo = metodo === 0 ? bruto : metodo === 8 ? zlib.inflateRawSync(bruto) : null;
    if (!conteudo) throw new Error('compressão desconhecida no zip');
    fs.mkdirSync(path.dirname(alvo), { recursive: true });
    fs.writeFileSync(alvo, conteudo);
  }
}

async function baixar(id) {
  const url = 'https://clients2.google.com/service/update2/crx?response=redirect&acceptformat=crx3' +
    '&prodversion=' + process.versions.chrome + '&x=' + encodeURIComponent('id=' + id + '&uc');
  const r = await net.fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('loja respondeu ' + r.status);
  return Buffer.from(await r.arrayBuffer());
}

// Baixa a extensão da Chrome Web Store, confere a assinatura e abre numa pasta nova dentro de base. A chave no manifest
// faz o Electron dar à extensão o mesmo ID da loja em qualquer pasta: assim o que ela guarda continua na versão nova.
async function baixarDaLoja(id, base) {
  const { zip, chave } = abrirCrx(await baixar(id), id);
  const tmp = path.join(base, 'baixando-' + id + '-' + Date.now());
  fs.rmSync(tmp, { recursive: true, force: true });
  abrirZip(zip, tmp);
  // A pasta _metadata é da loja (conferência dos arquivos); com ela o Electron recusa abrir a extensão de uma pasta.
  fs.rmSync(path.join(tmp, '_metadata'), { recursive: true, force: true });
  const mf = JSON.parse(fs.readFileSync(path.join(tmp, 'manifest.json'), 'utf8'));
  const versao = String(mf.version || '').replace(/[^\d.]/g, '');
  if (!versao) { fs.rmSync(tmp, { recursive: true, force: true }); throw new Error('manifest sem versão'); }
  mf.key = chave.toString('base64');
  fs.writeFileSync(path.join(tmp, 'manifest.json'), JSON.stringify(mf, null, 2));
  return { tmp, versao, mf };
}

// ---------- a extensão nas contas ----------

class Extensao {
  // evento(nota): anota na planilha de medições
  constructor({ evento }) {
    this.evento = evento;
    this.pasta = null; // pasta da versão que as contas carregam
    this.versao = null;
    this.baixando = null;
    try {
      const atual = JSON.parse(fs.readFileSync(path.join(pastaBase(), 'atual.json'), 'utf8'));
      const pasta = path.join(pastaBase(), path.basename(String(atual.pasta)));
      if (fs.existsSync(path.join(pasta, 'manifest.json'))) { this.pasta = pasta; this.versao = atual.versao; }
    } catch (e) { /* 1ª vez: ainda não baixou */ }
  }

  comecar() {
    this.procurar();
    this.timer = setInterval(() => this.procurar(), INTERVALO);
  }

  parar() { clearInterval(this.timer); }

  // Baixa a versão da loja; sendo nova, abre numa pasta própria e passa a ser a das contas que ligarem daqui em diante
  // (as já abertas continuam com a delas até o programa abrir de novo).
  procurar() {
    if (this.baixando) return this.baixando;
    this.baixando = (async () => {
      try {
        fs.mkdirSync(pastaBase(), { recursive: true });
        const { tmp, versao } = await baixarDaLoja(ID, pastaBase());
        if (versao === this.versao) { fs.rmSync(tmp, { recursive: true, force: true }); return; }
        const pasta = path.join(pastaBase(), 'huntdesk-' + versao);
        fs.rmSync(pasta, { recursive: true, force: true });
        fs.renameSync(tmp, pasta);
        fs.writeFileSync(path.join(pastaBase(), 'atual.json'), JSON.stringify({ versao, pasta: path.basename(pasta) }));
        const antiga = this.pasta;
        this.pasta = pasta;
        this.versao = versao;
        this.evento(`extensão do HuntDesk ${versao} baixada da loja` + (antiga ? '; vale ao abrir o programa de novo' : ''));
        if (antiga) this.apagarAntigas(pasta, antiga);
      } catch (e) {
        this.evento('extensão do HuntDesk: não deu para baixar (' + e.message + ')');
      } finally {
        this.baixando = null;
      }
    })();
    return this.baixando;
  }

  // Deixa só a versão nova e a que está em uso agora.
  apagarAntigas(...ficam) {
    try {
      for (const nome of fs.readdirSync(pastaBase())) {
        const p = path.join(pastaBase(), nome);
        if (nome !== 'atual.json' && nome !== 'terceiros' && !ficam.includes(p)) fs.rmSync(p, { recursive: true, force: true });
      }
    } catch (e) { /* fica para a próxima */ }
  }

  // Liga a extensão no cofre da conta (uma vez por abertura do programa) e copia a ligação com o HuntDesk. Na 1ª vez
  // espera o download, até 10 s; sem internet, a conta abre sem ela.
  async naConta(ses, ligacao) {
    if (!this.pasta) await Promise.race([this.procurar(), new Promise((r) => setTimeout(r, ESPERA_PRIMEIRA))]);
    if (!this.pasta) return false;
    try {
      if (!ses.extensions.getExtension(ID)) await ses.extensions.loadExtension(this.pasta);
      if (ligacao) await this.gravar(ses, ligacao);
      return true;
    } catch (e) {
      this.evento('extensão do HuntDesk: não ligou (' + e.message + ')');
      return false;
    }
  }

  // A extensão guarda as escolhas no cofre de cada conta; para gravar lá é preciso uma página dela aberta naquele
  // cofre. Abre a própria janela da extensão escondida, grava e fecha.
  async gravar(ses, ligacao) {
    const v = new WebContentsView({ webPreferences: { session: ses, sandbox: true, contextIsolation: true } });
    try {
      await v.webContents.loadURL(`chrome-extension://${ID}/popup.html`);
      const dados = Object.fromEntries(LIGACAO.filter((k) => k in ligacao).map((k) => [k, ligacao[k]]));
      await v.webContents.executeJavaScript(`chrome.storage.local.set(${JSON.stringify(dados)}).then(() => true)`);
    } finally {
      v.webContents.close();
    }
  }

  // Lê a ligação de uma janela da extensão aberta (a do HuntDesk que o jogador usa).
  static async ler(wc) {
    const d = await wc.executeJavaScript(`chrome.storage.local.get(${JSON.stringify(LIGACAO)})`);
    return limparLigacao(d);
  }
}

module.exports = { Extensao, ID, baixarDaLoja, idDaChave };
