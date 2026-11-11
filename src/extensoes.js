'use strict';
// Extensões de terceiros, escolhidas pelo jogador (decisão do dono, 10/11): pelo link da Chrome Web Store (baixa,
// confere a assinatura e atualiza sozinha) ou de uma pasta. Cada uma liga só nas contas que o jogador marcar, nunca no
// app do HuntDesk nem na barra do programa. O programa não sugere nem oferece extensão nenhuma.
//
// Antes de instalar, o jogador vê o que a extensão pede, em português, e o aviso: ela pode ler tudo nas contas onde
// estiver ligada, inclusive o login, e uma extensão que joga sozinha vai contra as regras dos jogos (regra 1: o
// programa nunca joga). O aviso não impede: quem decide é o jogador.
//
// Os arquivos ficam em <dados>/extensoes/terceiros/<id>-<versão>. A lista (id, nome, versão, origem e contas) fica
// no config.json, em cfg.extensoes.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { app } = require('electron');
const { baixarDaLoja, idDaChave, ID: ID_HUNTDESK } = require('./extensao');

const ID_VALIDO = /^[a-p]{32}$/;
const base = () => path.join(app.getPath('userData'), 'extensoes', 'terceiros');
const pastaDe = (item) => path.join(base(), item.id + '-' + item.versao);

// O id da extensão a partir do link da Chrome Web Store (chromewebstore.google.com/detail/nome/ID, o endereço antigo
// chrome.google.com/webstore/detail/... ou o ID sozinho).
function idDoLink(texto) {
  const t = String(texto || '').trim();
  if (ID_VALIDO.test(t)) return t;
  let u;
  try { u = new URL(t); } catch (e) { return null; }
  if (!['chromewebstore.google.com', 'chrome.google.com'].includes(u.hostname)) return null;
  const id = u.pathname.split('/').find((parte) => ID_VALIDO.test(parte));
  return id || null;
}

// Nome e descrição podem vir como __MSG_nome__, traduzidos na pasta _locales (português primeiro).
function traduzir(dir, mf, texto) {
  const m = /^__MSG_(.+)__$/.exec(String(texto || ''));
  if (!m) return String(texto || '');
  for (const lingua of ['pt_BR', 'pt_PT', 'pt', mf.default_locale, 'en']) {
    if (!lingua) continue;
    try {
      const msgs = JSON.parse(fs.readFileSync(path.join(dir, '_locales', lingua, 'messages.json'), 'utf8'));
      const chave = Object.keys(msgs).find((k) => k.toLowerCase() === m[1].toLowerCase());
      if (chave && msgs[chave].message) return msgs[chave].message;
    } catch (e) { /* tenta a próxima língua */ }
  }
  return m[1];
}

// ---------- o que a extensão pede, em português ----------

// Recursos que o Electron não tem ou que, no teste de 10/11, não fizeram efeito.
const NAO_TEM = {
  declarativeNetRequest: 'o bloqueio de anúncios e de endereços dela não funciona aqui',
  declarativeNetRequestWithHostAccess: 'o bloqueio de anúncios e de endereços dela não funciona aqui',
  userScripts: 'scripts de usuário (como os do Tampermonkey) não rodam aqui',
  contextMenus: 'o menu do botão direito dela não aparece',
  notifications: 'os avisos dela no Windows não aparecem',
  downloads: 'baixar arquivos por ela não funciona',
  cookies: 'ler cookies não funciona',
  webNavigation: 'acompanhar a navegação não funciona',
  sidePanel: 'o painel lateral dela não existe aqui',
  fontSettings: 'mudar as letras do navegador não funciona',
  bookmarks: 'favoritos não existem aqui',
  history: 'histórico não existe aqui',
  identity: 'entrar com a conta do Google por ela não funciona',
  tts: 'leitura em voz alta não funciona',
};

const PEDE = {
  webRequest: 'Vê e pode mudar ou bloquear o que as contas pedem à internet.',
  scripting: 'Pode pôr código dela nas páginas.',
  tabs: 'Vê o endereço e o título das páginas.',
  activeTab: 'Mexe na página aberta quando você usa a extensão.',
  clipboardRead: 'Lê o que você copia (Ctrl+C).',
  clipboardWrite: 'Pode escrever no que você cola (Ctrl+V).',
  nativeMessaging: 'Conversa com programas instalados no seu PC.',
  debugger: 'Controla as páginas como uma ferramenta de desenvolvedor.',
  proxy: 'Pode desviar a internet das contas por outro servidor.',
  management: 'Vê as outras extensões instaladas.',
};

const TUDO = /^(<all_urls>|\*:\/\/\*\/\*|https?:\/\/\*\/\*)$/;

// Frases para a tela de instalação: o que ela pede e o que provavelmente não funciona aqui.
function resumo(mf) {
  const permissoes = [...(mf.permissions || []), ...(mf.optional_permissions || [])].filter((p) => typeof p === 'string');
  const sites = [...(mf.host_permissions || []), ...permissoes.filter((p) => p.includes('/') || p === '<all_urls>'),
    ...(mf.content_scripts || []).flatMap((c) => c.matches || [])].filter((p) => typeof p === 'string');
  const pede = [];
  if (sites.some((s) => TUDO.test(s))) pede.push('Lê e muda tudo nas páginas das contas onde ligar, inclusive o que você digita e o login.');
  else if (sites.length) {
    const nomes = [...new Set(sites.map((s) => s.replace(/^[^:]*:\/\//, '').replace(/\/.*$/, '')).filter(Boolean))];
    pede.push('Lê e muda as páginas de: ' + nomes.slice(0, 6).join(', ') + (nomes.length > 6 ? ' e outras' : '') + '.');
  }
  for (const p of permissoes) if (PEDE[p] && !pede.includes(PEDE[p])) pede.push(PEDE[p]);
  const naoFunciona = [...new Set(permissoes.filter((p) => NAO_TEM[p]).map((p) => NAO_TEM[p]))];
  if (mf.action && mf.action.default_popup && !(mf.content_scripts || []).length) naoFunciona.push('a telinha dela pode depender de abas como as do Chrome, que não existem aqui');
  return { pede, naoFunciona };
}

// Tela que a extensão oferece ao jogador: a do ícone (popup) ou a de opções.
function telinha(mf) {
  return (mf.action && mf.action.default_popup) || (mf.browser_action && mf.browser_action.default_popup)
    || (mf.options_ui && mf.options_ui.page) || mf.options_page || null;
}

function lerManifest(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
}

// ---------- instalar, ligar, remover ----------

class Extensoes {
  // evento(nota): anota na planilha de medições
  constructor({ evento }) {
    this.evento = evento;
  }

  // Baixa (loja) ou copia (pasta) para uma pasta provisória e devolve o que a tela de instalação mostra. Nada fica
  // instalado até o jogador confirmar (confirmar) ou desistir (descartar).
  async preparar({ link, pasta }) {
    fs.mkdirSync(base(), { recursive: true });
    let tmp, mf, origem;
    if (link != null) {
      const id = idDoLink(link);
      if (!id) throw new Error('isso não parece um link da Chrome Web Store');
      if (id === ID_HUNTDESK) throw new Error('a extensão do HuntDesk já vem no navegador (Menu ▴ → Extensão HuntDesk…)');
      ({ tmp, mf } = await baixarDaLoja(id, base()));
      origem = 'loja';
    } else {
      const dir = path.resolve(String(pasta || ''));
      if (!fs.existsSync(path.join(dir, 'manifest.json'))) throw new Error('a pasta não tem o arquivo manifest.json de uma extensão');
      tmp = path.join(base(), 'copiando-' + Date.now());
      fs.cpSync(dir, tmp, { recursive: true, filter: (f) => path.basename(f) !== '_metadata' });
      mf = lerManifest(tmp);
      // Sem chave, o Electron daria um ID pela pasta; uma chave própria deixa o ID fixo, como o da loja.
      if (!mf.key) {
        const { publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
        mf.key = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
        fs.writeFileSync(path.join(tmp, 'manifest.json'), JSON.stringify(mf, null, 2));
      }
      origem = 'pasta';
    }
    const id = idDaChave(Buffer.from(mf.key, 'base64'));
    const versao = String(mf.version || '').replace(/[^\d.]/g, '') || '0';
    return {
      tmp, id, origem, versao,
      nome: traduzir(tmp, mf, mf.name).slice(0, 80) || id,
      descricao: traduzir(tmp, mf, mf.description).slice(0, 300),
      ...resumo(mf),
    };
  }

  descartar(prep) {
    if (prep && prep.tmp) fs.rmSync(prep.tmp, { recursive: true, force: true });
  }

  // Passa a pasta provisória para o lugar dela e devolve o item da lista (cfg.extensoes), ainda sem nenhuma conta.
  confirmar(prep) {
    const item = { id: prep.id, nome: prep.nome, versao: prep.versao, origem: prep.origem, contas: [] };
    fs.rmSync(pastaDe(item), { recursive: true, force: true });
    fs.renameSync(prep.tmp, pastaDe(item));
    this.evento(`extensão de terceiros instalada: ${item.nome} ${item.versao} (${item.origem})`);
    return item;
  }

  // Liga no cofre de uma conta (uma vez por abertura do programa). Sem a pasta (apagada à mão), só anota.
  async naConta(ses, item) {
    try {
      if (!ses.extensions.getExtension(item.id)) await ses.extensions.loadExtension(pastaDe(item));
      return true;
    } catch (e) {
      this.evento(`extensão ${item.nome}: não ligou (${e.message})`);
      return false;
    }
  }

  // Tira do cofre da conta. O que ela já pôs numa página aberta só sai com um F5 naquela conta.
  tirarDaConta(ses, id) {
    if (ses.extensions.getExtension(id)) ses.extensions.removeExtension(id);
  }

  // Remove de vez: tira das contas, apaga o que ela guardou em cada uma e os arquivos.
  async apagar(item, sessoes) {
    for (const ses of sessoes) {
      this.tirarDaConta(ses, item.id);
      await ses.clearStorageData({ origin: 'chrome-extension://' + item.id }).catch(() => {});
    }
    for (const nome of fs.existsSync(base()) ? fs.readdirSync(base()) : []) {
      if (nome.startsWith(item.id + '-')) fs.rmSync(path.join(base(), nome), { recursive: true, force: true });
    }
    this.evento(`extensão de terceiros removida: ${item.nome}`);
  }

  // As da loja: baixa e, se a versão mudou, a nova vale na próxima abertura do programa. Devolve os itens que mudaram.
  async atualizar(lista) {
    const mudaram = [];
    for (const item of lista.filter((x) => x.origem === 'loja')) {
      try {
        const { tmp, versao } = await baixarDaLoja(item.id, base());
        if (versao === item.versao) { fs.rmSync(tmp, { recursive: true, force: true }); continue; }
        const novo = { ...item, versao };
        fs.rmSync(pastaDe(novo), { recursive: true, force: true });
        fs.renameSync(tmp, pastaDe(novo));
        mudaram.push(novo);
        this.evento(`extensão ${item.nome} ${versao} baixada; vale ao abrir o programa de novo`);
      } catch (e) {
        this.evento(`extensão ${item.nome}: não deu para procurar versão nova (${e.message})`);
      }
    }
    return mudaram;
  }

  // Apaga as pastas que nenhum item da lista usa (versões antigas e instalações que ficaram pela metade).
  limpar(lista) {
    const usadas = new Set(lista.map((x) => x.id + '-' + x.versao));
    for (const nome of fs.existsSync(base()) ? fs.readdirSync(base()) : []) {
      if (!usadas.has(nome)) fs.rmSync(path.join(base(), nome), { recursive: true, force: true });
    }
  }

  telinha(item) {
    try { return telinha(lerManifest(pastaDe(item))); } catch (e) { return null; }
  }
}

module.exports = { Extensoes, idDoLink, resumo, ID_VALIDO };
