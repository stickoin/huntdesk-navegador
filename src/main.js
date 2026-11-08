'use strict';
// HuntDesk Navegador — P1: várias contas do jogo, cada uma com o login separado, organizadas em pastas e telas (cada
// tela com 1 a 4 contas lado a lado); mede memória e CPU de cada conta (herdado do P0).
// Regra 1 do projeto: o programa só organiza as janelas e mede. Nunca clica, digita ou entra em nada dentro do
// jogo — toda ação sai de um botão ou atalho apertado pelo jogador.

const path = require('node:path');
const { app, BrowserWindow, WebContentsView, Menu, Notification, dialog, ipcMain, nativeTheme, net, session, shell } = require('electron');
const { Medidor, apagarPastaAntiga } = require('./medidor');
const quedas = require('./quedas');
const { Guarda } = require('./guarda');
const { Atualizador } = require('./atualizador');
const { Extensao, ID: ID_EXTENSAO } = require('./extensao');
const { LigarLeitura } = require('./ligacao');
const config = require('./config');

const ARGS = process.argv.slice(1);
const CENARIO = (ARGS.find((a) => a.startsWith('--autoteste')) || '').replace(/^--autoteste-?/, '') || 'telas';
const AUTOTESTE = ARGS.some((a) => a.startsWith('--autoteste'));
const TESTE = AUTOTESTE || ARGS.includes('--teste');
const PAGINA_TESTE = path.join(__dirname, 'teste', 'pagina-teste.html');
const FAIXA = 24; // faixa com o nome e os botões em cima de cada conta (só com mais de uma conta na tela)
const VAO = 4; // espaço entre as contas
const PAINEIS = ['medicoes', 'contas', 'config'];

// O Electron põe o nome do programa no que toda página mostra aos sites; o site do jogo não precisa ver (decisão do
// dono, 07/11). Tem de ser aqui, no valor geral: a janela que o jogo abre (a de login, por exemplo) não usa o do cofre da
// conta. O "Electron" fica: o programa não finge ser um Chrome comum. A vista do app acrescenta a marca dela (MARCA_APP).
app.userAgentFallback = app.userAgentFallback.replace(/ ?HuntDesk\/\S+/, '');
// O Chrome arredonda a memória do JavaScript que a página informa; com esta opção vem o número exato.
app.commandLine.appendSwitch('enable-precise-memory-info');
if (AUTOTESTE) app.setPath('userData', path.join(app.getPath('temp'), 'huntdesk-navegador-autoteste-' + Date.now()));
// Logins e configuração ficam em %APPDATA%\HuntDesk Navegador (o nome do programa é só "HuntDesk", mas essa pasta é
// separada da do HuntDesk).
else app.setPath('userData', path.join(app.getPath('appData'), 'HuntDesk Navegador'));

// Experimento (só pela linha de comando): --experimento-alivio alivia as contas 1 e 2 a cada 5 min e deixa a 3 e a 4
// como comparação; --economico liga o modo econômico mesmo desligado nas Configurações; --diagnostico anota o que cada
// página tem (ver diagnosticar).
const EXPERIMENTO_ALIVIO = ARGS.includes('--experimento-alivio');
// Experimento: --quadros=30 faz o jogo desenhar no máximo 30 quadros por segundo (ver quadros.js). A opção do Chrome
// limit-fps não serve: no Electron ela não limita as páginas.
const QUADROS = Number((ARGS.find((a) => a.startsWith('--quadros=')) || '').split('=')[1]) || 0;

let cfg = config.carregar(); // contas, pastas e telas (config.json)
// Modo econômico: o modo do Chrome para computador fraco (menos memória, imagem um pouco mais simples). Só vale ao abrir o
// programa, por isso trocar nas Configurações reinicia.
const ECONOMICO = cfg.economico || ARGS.includes('--economico');
if (ECONOMICO) app.commandLine.appendSwitch('enable-low-end-device-mode');
const vivas = new Map(); // id da conta → { view, estado, presa, site }; presa = está na janela agora
const sessoesVigiadas = new Set(); // cofres de conta que já bloqueiam downloads (uma vez por abertura do programa)
let win = null;
let medidor = null;
let guarda = null;
let atualizador = null;
let extensao = null; // extensão do HuntDesk nas contas (fora dos testes)
let janelaHuntDesk = null;
let janelaBoasVindas = null;
let appVista = null; // o site do app do HuntDesk, dentro da janela (ver vistaDoApp)
let mostrandoApp = false; // true = o app do HuntDesk está na janela, no lugar das contas
const APP_HUNTDESK = 'https://app.huntdesk.com.br/';
// Marca no user agent só da vista do app, para o site saber que está dentro do navegador (e trocar os primeiros passos,
// que mandam instalar a extensão). É só um aviso de cortesia: qualquer um pode imitar, então não vale como prova de nada.
const MARCA_APP = 'HuntDeskNavegador/' + app.getVersion();
let origemApp = new URL(APP_HUNTDESK).origin; // de onde o site pode pedir para ligar a leitura (o autoteste troca por um local)
let ligacao = null; // conexão em um passo (ver ligacao.js)
const respostasTeste = { perguntas: [], aceitar: false }; // no autoteste, a pergunta ao jogador é respondida daqui
const avisosAbertos = new Set(); // notificações do Windows na tela (sem referência, o Windows as perde)
let area = null; // espaço das contas (entre a lateral e a barra de baixo), informado pela própria barra
let foco = null; // última conta clicada: o F5 recarrega só ela
let celulas = [];
let sobre = null; // janelinha da conta e janela dos painéis: uma janela pequena, sem moldura, presa à principal
// O que está aberto nela: { tipo: 'tela', tela, x, y } | { tipo: 'pasta', pasta, x, y, nova } | { tipo: 'painel', painel } | null
let sobreAberto = null;
let sobreFechado = { qual: null, quando: 0 }; // o clique que fecha a janelinha não pode abrir a mesma de novo
let alturaSobre = 0; // altura que a janelinha pediu, conforme o que ela mostra
let timerSobre = null;
let abertoEm = 0;
let saindo = false;
const series = new Map(); // id da conta → últimas 30 medições [MB, % processador], para os gráficos da janelinha
const historicos = new Map(); // id da conta → últimos eventos [quando, nota], para o histórico da janelinha

const conta = (id) => cfg.contas.find((c) => c.id === id);
const pastaDe = (id) => cfg.pastas.find((p) => p.id === id);
function acharTela(id) {
  for (const p of cfg.pastas) { const t = p.telas.find((x) => x.id === id); if (t) return { p, t }; }
  return null;
}
function telaDaConta(id) {
  for (const p of cfg.pastas) { const t = p.telas.find((x) => x.contas.includes(id)); if (t) return { p, t }; }
  return null;
}
// Todas as telas, na ordem da lateral (Ctrl+1…9 e Ctrl+Tab).
const ordemTelas = () => cfg.pastas.flatMap((p) => p.telas.map((t) => ({ pasta: p.id, tela: t.id })));

function permitir(wc, permissao, responder) {
  // O jogo não precisa de câmera, microfone, localização nem notificações.
  responder(permissao === 'clipboard-sanitized-write' || permissao === 'fullscreen');
}

// ---------- contas ----------

function ligarConta(c) {
  if (vivas.has(c.id)) return;
  const particao = 'persist:' + c.id; // "persist:" = cookies e login guardados entre aberturas, um cofre por conta
  const ses = session.fromPartition(particao);
  ses.setPermissionRequestHandler(permitir);
  // Os jogos não precisam baixar arquivos: nas contas não sai download nenhum, nem de uma página falsa.
  if (!sessoesVigiadas.has(particao)) {
    sessoesVigiadas.add(particao);
    ses.on('will-download', (e, item) => { e.preventDefault(); medidor.evento(c.id, 'download bloqueado: ' + (config.siteDe(item.getURL()) || 'página')); });
  }
  const view = new WebContentsView({
    webPreferences: {
      partition: particao, contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: c.freio,
      ...(QUADROS ? { preload: path.join(__dirname, 'quadros.js'), additionalArguments: ['--huntdesk-quadros=' + QUADROS] } : {}),
    },
  });
  view.setBackgroundColor('#0a0c11');
  // site: onde a conta está agora (aparece na lateral, na faixa e no menuzinho, para o jogador saber onde digita a senha)
  const v = { view, estado: 'carregando', presa: false, desde: Date.now(), site: config.siteDe(c.url) };
  vivas.set(c.id, v);
  const wc = view.webContents;
  wc.setAudioMuted(!!c.mudo);
  wc.setWindowOpenHandler(({ url }) => {
    // Janela que o jogo pede (login, termos) abre com a mesma conta; o Chrome só deixa abrir com um clique do jogador.
    if (/^https?:/i.test(url)) return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true } };
    return { action: 'deny' };
  });
  // Essa janela não tem barra de endereço: o site vai no título dela.
  wc.on('did-create-window', (j) => {
    const titulo = () => { if (!j.isDestroyed()) j.setTitle(`${config.siteDe(j.webContents.getURL()) || 'janela do jogo'} · ${j.webContents.getTitle()}`); };
    j.on('page-title-updated', (e) => { e.preventDefault(); titulo(); });
    j.webContents.on('did-navigate', titulo);
  });
  wc.on('did-navigate', (e, url) => {
    const site = config.siteDe(url);
    if (site && site !== v.site) { v.site = site; enviarEstado(); }
  });
  wc.on('did-start-loading', () => mudarEstado(c.id, 'carregando'));
  wc.on('did-finish-load', () => { mudarEstado(c.id, 'ok'); medidor.prepararPagina(wc); });
  wc.on('did-fail-load', (e, codigo, descricao, url, principal) => { if (principal && codigo !== -3) mudarEstado(c.id, 'erro', descricao); });
  wc.on('unresponsive', () => mudarEstado(c.id, 'travada'));
  wc.on('responsive', () => mudarEstado(c.id, 'ok'));
  wc.on('render-process-gone', (e, d) => {
    v.queda = d.reason;
    mudarEstado(c.id, 'caiu', d.reason);
    // Ao fechar o programa ou desligar a conta a página também acaba, mas isso não é queda.
    if (saindo || vivas.get(c.id) !== v) return;
    const uso = medidor.ultima && medidor.ultima.contas[c.id];
    quedas.anotar({ conta: c.id, motivo: d.reason, codigo: d.exitCode, ram: uso && uso.ram, economico: ECONOMICO });
  });
  wc.on('focus', () => { if (foco !== c.id) { foco = c.id; enviarEstado(); } });
  wc.on('before-input-event', (e, input) => atalho(e, input, c.id));
  // No teste da guarda a página gasta memória mesmo escondida (a janela do teste pode abrir atrás de outras).
  if (TESTE) wc.loadFile(PAGINA_TESTE, { query: { conta: c.nome, vazar: CENARIO === 'guarda' ? 'sempre' : 'desenho' } });
  // A extensão do HuntDesk liga antes do jogo abrir: o leitor dela precisa estar na página desde o começo. Ela só lê o
  // Huntera, então as contas de outros jogos abrem sem ela.
  else if (config.ehHuntera(c.url)) extensao.naConta(ses, cfg.huntdesk).then(() => { if (!wc.isDestroyed()) wc.loadURL(c.url); });
  else wc.loadURL(c.url);
  medidor.evento(c.id, 'ligada');
}

function desligarConta(id) {
  const v = vivas.get(id);
  if (!v) return;
  guarda.esquecer(id);
  if (v.presa) win.contentView.removeChildView(v.view);
  vivas.delete(id);
  v.view.webContents.close(); // fecha a página e devolve a memória ao Windows
  medidor.evento(id, 'desligada');
}

function mudarEstado(id, estado, nota) {
  const v = vivas.get(id);
  if (!v || v.estado === estado) return;
  const antes = v.estado;
  v.estado = estado;
  medidor.evento(id, 'estado: ' + estado + (nota ? ' (' + nota + ')' : ''));
  // A página que caiu sai da frente para aparecer o aviso com "Recarregar agora"; volta quando recarregar.
  if (antes === 'caiu' || estado === 'caiu') arrumar();
  else enviarEstado();
}

// ---------- arrumação na janela ----------

// As contas da tela escolhida, ou da pasta inteira ('todas').
function contasDoAtual() {
  const p = pastaDe(cfg.atual.pasta);
  if (!p) return [];
  if (cfg.atual.tela === 'todas') return p.telas.flatMap((t) => t.contas);
  const t = p.telas.find((x) => x.id === cfg.atual.tela);
  return t ? t.contas : [];
}
// Quem aparece agora: as contas ligadas da tela escolhida (nenhuma com o app do HuntDesk na janela).
const naTela = () => (mostrandoApp ? [] : contasDoAtual().filter((id) => vivas.has(id)));

// Troca a tela (e sai do app do HuntDesk); conta desligada que ela mostra liga.
function ver(pasta, tela) {
  mostrandoApp = false;
  cfg.atual = { pasta, tela };
  for (const id of contasDoAtual()) { const c = conta(id); if (c && !vivas.has(id)) { c.ligada = true; ligarConta(c); } }
}
// Depois de tirar telas ou pastas: se a escolhida sumiu, fica a primeira tela da pasta (ou a pasta inteira).
function corrigirAtual() {
  const p = pastaDe(cfg.atual.pasta) || cfg.pastas[0];
  const existe = cfg.atual.tela === 'todas' || p.telas.some((t) => t.id === cfg.atual.tela);
  cfg.atual = { pasta: p.id, tela: existe && p.id === cfg.atual.pasta ? cfg.atual.tela : p.telas[0] ? p.telas[0].id : 'todas' };
}

function grade(n, largura, altura) {
  if (!n) return [];
  // Quase quadrado; com o monitor em pé, mais linhas que colunas.
  const lado = Math.ceil(Math.sqrt(n));
  const cols = largura >= altura ? lado : Math.ceil(n / lado);
  const linhas = Math.ceil(n / cols);
  const cw = (largura - VAO * (cols - 1)) / cols;
  const ch = (altura - VAO * (linhas - 1)) / linhas;
  return Array.from({ length: n }, (_, i) => {
    const col = i % cols;
    const lin = Math.floor(i / cols);
    return { x: Math.round(col * (cw + VAO)), y: Math.round(lin * (ch + VAO)), width: Math.round(cw), height: Math.round(ch) };
  });
}

// Tirar uma conta da janela não a fecha: o jogo continua aberto e conectado. O Chrome passa a tratá-la como
// aba escondida e, com o freio ligado, diminui o ritmo dela.
function arrumar() {
  if (!win) return;
  const [largura, altura] = win.getContentSize();
  // Até a barra informar o espaço, conta com a lateral (220 px aberta, 64 recolhida) e a barra de baixo (36 px).
  const lat = cfg.visual.lateral ? 220 : 64;
  const a = area || { x: lat, y: 0, width: largura - lat, height: altura - 36 };
  const ids = naTela();
  const caixas = grade(ids.length, Math.max(0, a.width - 2 * VAO), Math.max(0, a.height - 2 * VAO));
  celulas = ids.map((id, i) => ({ id, ...caixas[i], x: caixas[i].x + a.x + VAO, y: caixas[i].y + a.y + VAO }));
  // Com uma conta só, a lateral já diz qual é: o jogo usa o quadro inteiro. Com várias, a faixa diz qual é qual.
  const faixa = celulas.length > 1 ? FAIXA : 0;
  const ficam = new Set(ids);
  for (const [id, v] of vivas) {
    if (v.presa && !ficam.has(id)) {
      win.contentView.removeChildView(v.view);
      v.presa = false;
      medidor.evento(id, 'fora da tela');
    }
  }
  for (const cel of celulas) {
    const v = vivas.get(cel.id);
    if (!v.presa) {
      win.contentView.addChildView(v.view);
      v.presa = true;
      medidor.evento(cel.id, 'na tela');
    }
    // 1 px para dentro de cada lado: a borda da conta (vermelha com aviso) aparece em volta do jogo.
    v.view.setBounds({ x: cel.x + 1, y: cel.y + 1 + faixa, width: Math.max(0, cel.width - 2), height: Math.max(0, cel.height - 2 - faixa) });
    v.view.setVisible(v.estado !== 'caiu');
  }
  // O app do HuntDesk ocupa o espaço todo das contas; fora dele, sai da janela e continua aberto.
  if (mostrandoApp) {
    const vista = vistaDoApp();
    if (!win.contentView.children.includes(vista)) win.contentView.addChildView(vista);
    vista.setBounds({ x: a.x, y: a.y, width: Math.max(0, a.width), height: Math.max(0, a.height) });
  } else if (appVista && win.contentView.children.includes(appVista)) {
    win.contentView.removeChildView(appVista);
  }
  enviarEstado();
}

// ---------- janelinhas ----------

// As páginas do jogo ficam por cima de tudo o que a barra desenha; por isso a janelinha da conta e os painéis abrem
// numa janela pequena própria, presa à principal (sempre por cima dela). Nada escurece atrás: o jogo continua à vista.
// Fecha com Esc, ✕ ou um clique em qualquer lugar da janela principal.
const qualSobre = (d) => (!d ? null : d.tipo === 'conta-nova' ? 'nova:' + d.pasta : d.tela || d.pasta || d.painel);

function abrirSobre(dados) {
  sobreAberto = dados;
  abertoEm = Date.now();
  alturaSobre = 0;
  sobre.webContents.send('abrir', dados);
  enviarEstado();
  // Aparece quando a janelinha disser a altura do que vai mostrar (ou logo depois, se demorar).
  clearTimeout(timerSobre);
  timerSobre = setTimeout(posicionarSobre, 400);
}

function posicionarSobre() {
  clearTimeout(timerSobre);
  if (!sobreAberto || !win || sobre.isDestroyed()) return;
  const c = win.getContentBounds();
  const a = area || { x: 0, y: 0, width: c.width, height: c.height };
  const menu = sobreAberto.tipo !== 'painel';
  const largura = Math.min(menu ? 300 : sobreAberto.painel === 'medicoes' ? 980 : 620, c.width - 20);
  const altura = Math.min(alturaSobre || 400, c.height - 20);
  // O menuzinho da tela ou da pasta abre ao lado da linha clicada; os painéis, no meio do espaço das contas. Nunca
  // saem da janela.
  let x = menu ? sobreAberto.x + 6 : a.x + (a.width - largura) / 2;
  let y = menu ? sobreAberto.y - 6 : a.y + (a.height - altura) / 2;
  x = Math.max(10, Math.min(x, c.width - largura - 10));
  y = Math.max(10, Math.min(y, c.height - altura - 10));
  sobre.setBounds({ x: Math.round(c.x + x), y: Math.round(c.y + y), width: Math.round(largura), height: Math.round(altura) });
  // No autoteste não tira o teclado de quem está usando o PC.
  if (!sobre.isVisible()) { if (TESTE) sobre.showInactive(); else sobre.show(); }
}

function fecharSobre() {
  clearTimeout(timerSobre);
  if (!sobreAberto) return;
  sobreFechado = { qual: qualSobre(sobreAberto), quando: Date.now() };
  sobreAberto = null;
  if (sobre && !sobre.isDestroyed()) {
    sobre.webContents.send('abrir', null);
    sobre.hide();
  }
  enviarEstado();
}

// ---------- atalhos ----------

function atalho(e, input, id) {
  if (input.type !== 'keyDown') return;
  const ctrl = input.control || input.meta;
  const tecla = input.key.toLowerCase();
  if (tecla === 'f5' || (ctrl && tecla === 'r')) {
    // F5 recarrega só a conta em que você está, nunca todas (dentro do app do HuntDesk, recarrega o app).
    e.preventDefault();
    const alvo = id || foco;
    if (alvo === 'app') appVista.webContents.reload();
    else if (alvo) acao('conta:recarregar', { id: alvo });
  } else if (ctrl && /^[1-9]$/.test(tecla)) {
    // Ctrl+1, Ctrl+2…: vai para a tela daquele número na lateral.
    const alvo = ordemTelas()[Number(tecla) - 1];
    if (alvo) { e.preventDefault(); acao('tela:ver', alvo); }
  } else if (ctrl && tecla === 'tab') {
    // Ctrl+Tab passa para a próxima tela; Ctrl+Shift+Tab, para a anterior (como as abas do Chrome).
    e.preventDefault();
    proximaTela(input.shift ? -1 : 1);
  } else if (tecla === 'f11') {
    e.preventDefault();
    acao('janela:cheia');
  } else if (ctrl && tecla === 'b') {
    // Ctrl+B recolhe ou abre a lateral, mesmo com o teclado dentro do jogo.
    e.preventDefault();
    acao('visual:lateral');
  }
}

// Põe o item na posição i da lista (i < 0 = no fim).
const posicionar = (lista, item, i) => { if (i < 0) lista.push(item); else lista.splice(i, 0, item); };

function proximaTela(passo) {
  const todas = ordemTelas();
  if (!todas.length) return;
  const i = todas.findIndex((t) => t.pasta === cfg.atual.pasta && t.tela === cfg.atual.tela);
  acao('tela:ver', i < 0 ? todas[0] : todas[(i + passo + todas.length) % todas.length]);
}

// ---------- ações (sempre de um botão ou atalho do jogador) ----------

// A conta nova ganha uma tela só dela e já aparece. O jogo é o do endereço (só https; sem endereço, o Huntera). Fica na
// pasta escolhida (ou na que está na janela), a não ser que essa pasta seja de outro jogo: aí vai para a pasta daquele
// site, que nasce com o nome dele se ainda não existir.
function novaConta({ nome, url, pasta }) {
  if (url && !config.enderecoSeguro(url)) return;
  const id = 'conta' + cfg.proximaConta++;
  const c = { id, nome: config.nomeValido(nome, 'Conta ' + id.slice(5)), url: url || config.JOGO_PADRAO, freio: true, ligada: true };
  const site = config.siteDe(c.url);
  const sitesDa = (q) => new Set(q.telas.flatMap((t) => t.contas).map((x) => config.siteDe(conta(x).url)));
  let p = pastaDe(pasta) || pastaDe(cfg.atual.pasta) || cfg.pastas[0];
  if (sitesDa(p).size && !sitesDa(p).has(site)) {
    p = cfg.pastas.find((q) => { const s = sitesDa(q); return s.size === 1 && s.has(site); });
    if (!p) {
      p = { id: 'pasta' + cfg.proximaPasta++, nome: config.nomeValido(site, 'Pasta nova'), aberta: true, telas: [] };
      cfg.pastas.push(p);
    }
  }
  cfg.contas.push(c);
  const t = { id: 'tela' + cfg.proximaTela++, contas: [id] };
  p.telas.push(t);
  p.aberta = true;
  ligarConta(c);
  ver(p.id, t.id);
}

function removerConta(id) {
  desligarConta(id);
  cfg.contas = cfg.contas.filter((c) => c.id !== id);
  for (const p of cfg.pastas) {
    for (const t of p.telas) t.contas = t.contas.filter((x) => x !== id);
    p.telas = p.telas.filter((t) => t.contas.length);
  }
  corrigirAtual();
  if (foco === id) foco = null;
  historicos.delete(id);
  // Apaga o login e os dados guardados desta conta; o número dela nunca é reaproveitado.
  const ses = session.fromPartition('persist:' + id);
  ses.clearStorageData().then(() => ses.clearCache()).catch(() => {});
  medidor.evento(id, 'removida');
}

// Aliviar: avisa o Chrome daquela conta que o computador está sem memória, como o Windows faz quando a memória
// acaba. O Chrome joga fora o que pode refazer depois (imagens já abertas, caches, lixo do JavaScript), sem recarregar
// a página. Não mexe no jogo: é o mesmo canal que as ferramentas de desenvolvedor usam, e só para isso.
async function aliviar(id, quem) {
  const v = vivas.get(id);
  if (!v) return;
  const dbg = v.view.webContents.debugger;
  try {
    if (!dbg.isAttached()) dbg.attach('1.3');
    await dbg.sendCommand('Memory.simulatePressureNotification', { level: 'critical' });
    await dbg.sendCommand('HeapProfiler.collectGarbage');
    medidor.evento(id, 'aliviada ' + quem);
  } catch (e) {
    medidor.evento(id, 'aliviar falhou: ' + e.message);
  } finally {
    try { if (dbg.isAttached()) dbg.detach(); } catch (e) { /* já saiu */ }
  }
}

// Janela do HuntDesk: a tela da extensão (a que o Chrome abre pelo ícone dela), com a captura da conta escolhida, o
// servidor do PC e a conta na nuvem. O que o jogador muda ali vale para todas as contas: o navegador copia para elas.
async function abrirHuntDesk() {
  if (janelaHuntDesk) { janelaHuntDesk.focus(); return; }
  // Uma conta do Huntera ligada: a da tela em que o jogador está, se der.
  const id = [foco, ...naTela(), ...vivas.keys()].find((x) => x && vivas.has(x) && config.ehHuntera(conta(x).url));
  const aviso = (detail) => dialog.showMessageBox(win, { type: 'info', title: 'HuntDesk', message: 'App do HuntDesk', detail });
  if (!id) return aviso('Ligue uma conta do Huntera primeiro: a janela do HuntDesk mostra o que a conta está lendo.');
  const ses = session.fromPartition('persist:' + id);
  if (!(await extensao.naConta(ses, null))) return aviso('A extensão do HuntDesk ainda não foi baixada. Confira a internet e tente de novo daqui a pouco.');
  const j = janelaHuntDesk = new BrowserWindow({
    parent: win, width: 360, height: 600, resizable: false, minimizable: false, maximizable: false, autoHideMenuBar: true,
    title: 'HuntDesk · ' + conta(id).nome + ' (vale para todas as contas)', icon: path.join(__dirname, 'ui', 'icone-huntdesk.png'),
    backgroundColor: '#0a0c11',
    webPreferences: { session: ses, preload: path.join(__dirname, 'extensao-janela.js'), sandbox: true, contextIsolation: true },
  });
  j.on('page-title-updated', (e) => e.preventDefault()); // fica o título com o nome da conta
  j.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // Confere o que a extensão guardou e, se mudou, grava e copia para as outras contas ligadas.
  const conferir = async () => {
    if (j.isDestroyed()) return;
    let l;
    try { l = await Extensao.ler(j.webContents); } catch (e) { return; }
    if (j.isDestroyed() || !l || JSON.stringify(l) === JSON.stringify(cfg.huntdesk)) return;
    cfg.huntdesk = l;
    config.salvar(cfg);
    for (const outra of vivas.keys()) {
      if (outra !== id && config.ehHuntera(conta(outra).url)) extensao.gravar(session.fromPartition('persist:' + outra), l).catch((e) => medidor.evento(outra, 'ligação com o HuntDesk não copiada: ' + e.message));
    }
    medidor.evento('programa', `ligação com o HuntDesk mudou (PC ${l.pc ? 'sim' : 'não'}, nuvem ${l.cloud ? 'sim' : 'não'}); copiada para as contas`);
  };
  const timer = setInterval(conferir, 1500);
  let fechando = false;
  j.on('close', (e) => {
    if (fechando) return;
    e.preventDefault(); // uma última conferida antes de fechar
    fechando = true;
    conferir().finally(() => { if (!j.isDestroyed()) j.destroy(); });
  });
  j.on('closed', () => { clearInterval(timer); janelaHuntDesk = null; });
  j.loadURL(`chrome-extension://${ID_EXTENSAO}/popup.html`);
}

// App do HuntDesk (o site) dentro da janela, no lugar das contas: o cartão "HuntDesk" da lateral troca a tela para ele
// e o clique numa tela volta ao jogo. O login dele fica num cofre próprio, separado das contas do jogo. Só abre páginas
// do huntdesk.com.br; link para outro site vai para o navegador padrão do Windows. Depois de aberto, fica aberto (fora
// da tela, como uma conta), para não pedir login nem recarregar a cada troca.
function vistaDoApp() {
  if (appVista) return appVista;
  const particao = 'persist:app-huntdesk';
  const ses = session.fromPartition(particao);
  ses.setPermissionRequestHandler(permitir);
  // No cofre do app, nunca no das contas: assim vale também para o que o site roda em segundo plano, e o jogo não a vê.
  if (!ses.getUserAgent().includes(MARCA_APP)) ses.setUserAgent(ses.getUserAgent() + ' ' + MARCA_APP);
  appVista = new WebContentsView({ webPreferences: { partition: particao, sandbox: true, contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, 'app-ponte.js') } });
  appVista.setBackgroundColor('#0a0c11');
  const wc = appVista.webContents;
  const doHuntDesk = (url) => { try { const u = new URL(url); return u.protocol === 'https:' && /(^|\.)huntdesk\.com\.br$/.test(u.hostname); } catch (e) { return false; } };
  const fora = (url) => { if (!TESTE && /^https?:/i.test(url)) shell.openExternal(url); };
  wc.setWindowOpenHandler(({ url }) => {
    if (doHuntDesk(url)) wc.loadURL(url); else fora(url);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (e, url) => { if (!doHuntDesk(url)) { e.preventDefault(); fora(url); } });
  // O redirecionamento feito pelo servidor não passa pelo will-navigate.
  wc.on('will-redirect', (e) => { if (e.isMainFrame && !doHuntDesk(e.url)) { e.preventDefault(); fora(e.url); } });
  wc.on('before-input-event', (e, input) => atalho(e, input, 'app'));
  wc.on('focus', fecharSobre);
  // Nos testes não há internet: abre a página de teste no lugar do site.
  if (TESTE) wc.loadFile(PAGINA_TESTE, { query: { conta: 'App do HuntDesk' } });
  else wc.loadURL(APP_HUNTDESK);
  medidor.evento('programa', 'app do HuntDesk aberto');
  return appVista;
}

// A pergunta da conexão em um passo. O botão escolhido de início é "Agora não": o Enter de quem acabou de digitar a
// senha no site não pode aceitar sem querer.
async function perguntarLigacao({ email, antes }) {
  if (TESTE) { respostasTeste.perguntas.push({ email, antes }); return respostasTeste.aceitar; }
  const r = await dialog.showMessageBox(win, {
    type: 'question', title: 'HuntDesk', buttons: ['Ligar', 'Agora não'], defaultId: 1, cancelId: 1, noLink: true,
    message: antes ? `Trocar a leitura das suas contas de ${antes} para ${email}?` : `Ligar a leitura das suas contas à conta ${email}?`,
    detail: 'O que for lido do jogo nas contas deste navegador (XP, lucro, bosses e progresso) vai para essa conta do HuntDesk. Para desligar: Menu ▴ → Extensão HuntDesk…',
  });
  return r.response === 0;
}

// Grava a ligação nova e copia para as contas ligadas; as que ligarem depois recebem ao ligar.
function aplicarLigacao(cloud) {
  if (janelaHuntDesk) janelaHuntDesk.destroy(); // a conferida dela leria a ligação antiga e desfaria esta
  cfg.huntdesk = config.limparLigacao({ ...(cfg.huntdesk || {}), cloud });
  config.salvar(cfg);
  if (!extensao) return;
  for (const id of vivas.keys()) {
    if (config.ehHuntera(conta(id).url)) extensao.gravar(session.fromPartition('persist:' + id), cfg.huntdesk).catch((e) => medidor.evento(id, 'ligação com o HuntDesk não copiada: ' + e.message));
  }
}

// Boas-vindas de quem abre o programa pela primeira vez: o que ele faz e para que serve o app do HuntDesk. Conta como
// vista assim que aparece, mesmo se o programa for fechado com ela aberta: não aparece de novo.
function abrirBoasVindas() {
  if (janelaBoasVindas) return;
  const j = janelaBoasVindas = new BrowserWindow({
    parent: win, modal: true, show: false, width: 500, height: 296, useContentSize: true, resizable: false, minimizable: false,
    maximizable: false, fullscreenable: false, title: 'Boas-vindas ao HuntDesk', icon: path.join(__dirname, 'ui', 'icone.png'),
    backgroundColor: '#10141c',
    webPreferences: { preload: path.join(__dirname, 'ui', 'preload.js'), contextIsolation: true, sandbox: true },
  });
  j.once('ready-to-show', () => j.show());
  j.on('closed', () => { janelaBoasVindas = null; });
  j.loadFile(path.join(__dirname, 'ui', 'boas-vindas.html'));
  cfg.boasVindas = false;
  config.salvar(cfg);
}

// Diagnóstico (só pela linha de comando, --diagnostico): a cada 5 min anota o que cada página tem — áreas de desenho e
// seus tamanhos, imagens, elementos — e a memória de cada processo da conta. Só lê, no mundo isolado do medidor.
const LER_PAGINA = `(() => {
  const tam = {};
  for (const c of document.querySelectorAll('canvas')) { const k = c.width + 'x' + c.height; tam[k] = (tam[k] || 0) + 1; }
  let px = 0; for (const i of document.images) px += i.naturalWidth * i.naturalHeight;
  return { canvas: Object.entries(tam).map(([k, n]) => n + '× ' + k).join(', '), imagens: document.images.length,
    mpx: Math.round(px / 1e6), elementos: document.getElementsByTagName('*').length, iframes: document.querySelectorAll('iframe').length };
})()`;
async function diagnosticar(id) {
  const v = vivas.get(id);
  if (!v) return;
  const wc = v.view.webContents;
  try {
    const p = await wc.executeJavaScriptInIsolatedWorld(4242, [{ code: LER_PAGINA }]);
    const pids = new Set();
    for (const f of wc.mainFrame.framesInSubtree) pids.add(f.osProcessId);
    const procs = app.getAppMetrics().filter((m) => pids.has(m.pid))
      .map((m) => `${m.type} ${Math.round((m.memory.privateBytes || 0) / 1024)} MB`).join(' + ');
    medidor.evento(id, `diag: canvas [${p.canvas}] imagens ${p.imagens} (${p.mpx} Mpx) elementos ${p.elementos} iframes ${p.iframes}; processos ${procs}`);
  } catch (e) {
    medidor.evento(id, 'diag falhou: ' + e.message);
  }
}

const ACOES = {
  // Põe a conta na janela: liga, se estiver desligada, e vai para a tela dela (se ainda não estiver à vista).
  'conta:mostrar': ({ id }) => {
    const c = conta(id);
    const a = telaDaConta(id);
    if (!c || !a) return;
    if (!vivas.has(id)) { c.ligada = true; ligarConta(c); }
    if (mostrandoApp || !contasDoAtual().includes(id)) ver(a.p.id, a.t.id);
  },
  // Cartão "HuntDesk" da lateral (e o item do Menu ▴): o app do HuntDesk no lugar das contas.
  'app:mostrar': () => { mostrandoApp = true; },
  'tela:ver': ({ pasta, tela }) => {
    const p = pastaDe(pasta);
    if (p && (tela === 'todas' || p.telas.some((t) => t.id === tela))) ver(p.id, tela);
  },
  // Junta duas telas da mesma pasta numa só (as contas lado a lado), com no máximo 4 contas. A tela juntada fica no
  // lugar da que estava mais para cima na lateral.
  'tela:juntar': ({ tela, com }) => {
    const a = acharTela(tela);
    const b = acharTela(com);
    if (!a || !b || a.t === b.t || a.p !== b.p || a.t.contas.length + b.t.contas.length > config.MAX_POR_TELA) return;
    const lugar = Math.min(a.p.telas.indexOf(a.t), a.p.telas.indexOf(b.t));
    a.t.contas.push(...b.t.contas);
    a.p.telas = a.p.telas.filter((t) => t !== a.t && t !== b.t);
    a.p.telas.splice(lugar, 0, a.t);
    ver(a.p.id, a.t.id);
  },
  // Arrastar na lateral: a tela vai para antes da tela `antes` (null = fim) na pasta `pasta`, que pode ser outra.
  'tela:posicionar': ({ tela, pasta, antes }) => {
    const a = acharTela(tela);
    const q = pastaDe(pasta);
    if (!a || !q || antes === tela) return;
    a.p.telas = a.p.telas.filter((t) => t !== a.t);
    posicionar(q.telas, a.t, q.telas.findIndex((t) => t.id === antes));
    q.aberta = true;
    if (cfg.atual.tela === tela) cfg.atual.pasta = q.id; // a tela na janela continua na janela
    corrigirAtual();
  },
  'pasta:posicionar': ({ id, antes }) => {
    const p = pastaDe(id);
    if (!p || antes === id) return;
    cfg.pastas = cfg.pastas.filter((x) => x !== p);
    posicionar(cfg.pastas, p, cfg.pastas.findIndex((x) => x.id === antes));
  },
  'conta:cor': ({ id, cor }) => {
    const c = conta(id);
    if (c && Number.isInteger(cor) && cor >= 0 && cor < config.CORES) c.cor = cor;
  },
  // Cada conta da tela volta para uma tela só dela, no mesmo lugar da lateral; a primeira fica com a tela de antes.
  'tela:separar': ({ tela }) => {
    const a = acharTela(tela);
    if (!a || a.t.contas.length < 2) return;
    const novas = a.t.contas.map((id, i) => ({ id: i ? 'tela' + cfg.proximaTela++ : a.t.id, contas: [id] }));
    a.p.telas.splice(a.p.telas.indexOf(a.t), 1, ...novas);
  },
  'tela:mover': ({ tela, para }) => {
    const a = acharTela(tela);
    const q = pastaDe(para);
    if (!a || !q || a.p === q) return;
    a.p.telas = a.p.telas.filter((t) => t !== a.t);
    q.telas.push(a.t);
    q.aberta = true;
    corrigirAtual();
  },
  'pasta:nova': ({ nome }) => {
    const id = 'pasta' + cfg.proximaPasta++;
    cfg.pastas.push({ id, nome: config.nomeValido(nome, 'Pasta nova'), aberta: true, telas: [] });
  },
  'pasta:renomear': ({ id, nome }) => { const p = pastaDe(id); if (p) p.nome = config.nomeValido(nome, p.nome); },
  'pasta:abrir': ({ id }) => { const p = pastaDe(id); if (p) p.aberta = !p.aberta; },
  // Só pasta vazia, e nunca a última.
  'pasta:apagar': ({ id }) => {
    const p = pastaDe(id);
    if (!p || p.telas.length || cfg.pastas.length <= 1) return;
    cfg.pastas = cfg.pastas.filter((x) => x !== p);
    corrigirAtual();
  },
  'conta:freio': ({ id, ligado }) => {
    const c = conta(id);
    if (!c) return;
    c.freio = !!ligado;
    const v = vivas.get(id);
    if (v) v.view.webContents.setBackgroundThrottling(c.freio);
    medidor.evento(id, c.freio ? 'freio ligado' : 'freio desligado');
  },
  'conta:recarregar': ({ id }) => {
    const v = vivas.get(id);
    if (!v) return;
    medidor.evento(id, 'recarregada pelo jogador');
    guarda.esquecer(id);
    v.view.webContents.reload();
  },
  'conta:som': ({ id, ligado }) => {
    const c = conta(id);
    if (!c) return;
    c.mudo = !ligado;
    const v = vivas.get(id);
    if (v) v.view.webContents.setAudioMuted(c.mudo);
  },
  'visual:lateral': () => { cfg.visual.lateral = !cfg.visual.lateral; },
  'janela:cheia': () => win.setFullScreen(!win.isFullScreen()),
  'conta:aliviar': ({ id }) => aliviar(id, 'pelo jogador'),
  'app:reiniciar': () => atualizador.reiniciar(),
  'conta:ligar': ({ id }) => { const c = conta(id); if (c) { c.ligada = true; ligarConta(c); } },
  'conta:desligar': ({ id }) => { const c = conta(id); if (c) { c.ligada = false; desligarConta(id); } },
  'conta:adicionar': (dados) => novaConta(dados),
  'conta:renomear': ({ id, nome }) => { const c = conta(id); if (c) c.nome = config.nomeValido(nome, c.nome); },
  'conta:endereco': ({ id, url }) => {
    const c = conta(id);
    if (!c || !config.enderecoSeguro(url) || c.url === url) return;
    const eraHuntera = config.ehHuntera(c.url);
    c.url = url;
    const v = vivas.get(id);
    if (!v) return;
    v.site = config.siteDe(url);
    if (TESTE) return;
    // A extensão do HuntDesk entra ou sai junto com o Huntera.
    const wc = v.view.webContents;
    const ses = session.fromPartition('persist:' + id);
    if (config.ehHuntera(url) && !eraHuntera) return extensao.naConta(ses, cfg.huntdesk).then(() => { if (!wc.isDestroyed()) wc.loadURL(url); });
    if (!config.ehHuntera(url) && ses.extensions.getExtension(ID_EXTENSAO)) ses.extensions.removeExtension(ID_EXTENSAO);
    wc.loadURL(url);
  },
  'conta:remover': ({ id }) => { if (conta(id)) removerConta(id); },
  'guarda:config': (dados) => {
    cfg.guarda = config.limparGuarda({ ...cfg.guarda, ...dados }, cfg.guarda);
    medidor.evento('guarda', `limite ${cfg.guarda.limiteMb} MB, ${cfg.guarda.acao === 'recarregar' ? 'recarrega sozinha' : 'só avisa'}, total ${cfg.guarda.avisoTotalMb || 'sem limite'}`);
  },
  'guarda:dispensar': ({ id }) => guarda.dispensar(id),
  'config:abrir-ao-iniciar': ({ ligado }) => { cfg.abrirAoIniciar = !!ligado; },
  'config:economico': ({ ligado }) => {
    if (cfg.economico === !!ligado && ECONOMICO === !!ligado) return;
    if (cfg.economico !== !!ligado) cfg.guarda.limiteMb = config.limiteDoModo(cfg.guarda.limiteMb, !!ligado);
    cfg.economico = !!ligado;
    medidor.evento('programa', `modo econômico ${cfg.economico ? 'ligado' : 'desligado'} pelo jogador; reiniciando`);
    if (TESTE) return; // no autoteste só muda a configuração
    // Reabre sem o --economico da linha de comando, para valer o que o jogador escolheu.
    app.relaunch({ args: process.argv.slice(1).filter((a) => a !== '--economico') });
    app.quit();
  },
};

function acao(tipo, dados) {
  const fn = ACOES[tipo];
  if (!fn) return;
  fn(dados || {});
  config.salvar(cfg);
  arrumar();
}

// ---------- barra e janelinhas ----------

function enviarEstado() {
  if (!win || win.isDestroyed()) return;
  const estado = {
    teste: TESTE,
    arquivo: medidor.arquivo,
    inicio: medidor.inicio,
    contas: cfg.contas.map((c) => {
      const v = vivas.get(c.id);
      return { id: c.id, nome: c.nome, url: c.url, freio: c.freio, mudo: !!c.mudo, cor: c.cor, ligada: !!v, estado: v ? v.estado : 'desligada',
        naTela: !!(v && v.presa), desde: v ? v.desde : null, queda: v ? v.queda : null, site: v ? v.site : config.siteDe(c.url) };
    }),
    pastas: cfg.pastas,
    atual: cfg.atual,
    maxPorTela: config.MAX_POR_TELA,
    celulas,
    foco,
    padrao: config.JOGO_PADRAO,
    amostra: medidor.ultima,
    guarda: { ...cfg.guarda, min: config.LIMITE_MIN, max: config.LIMITE_MAX },
    sobre: { versao: app.getVersion(), chrome: process.versions.chrome, pasta: app.getPath('userData') },
    atualizacao: atualizador ? atualizador.estado : null,
    alertas: guarda.resumo(),
    abrirAoIniciar: cfg.abrirAoIniciar,
    economico: { escolhido: cfg.economico, agora: ECONOMICO },
    visual: cfg.visual,
    faixas: celulas.length > 1,
    app: mostrandoApp,
    cheia: win.isFullScreen(),
    aberto: sobreAberto,
    series: Object.fromEntries(series),
    historico: Object.fromEntries(historicos),
  };
  win.webContents.send('estado', estado);
  if (sobre && !sobre.isDestroyed()) sobre.webContents.send('estado', estado);
}

// Últimos 5 min (30 medições) de memória e processador de cada conta ligada.
function guardarSerie(amostra) {
  for (const id of series.keys()) if (!amostra.contas[id]) series.delete(id);
  for (const [id, u] of Object.entries(amostra.contas)) {
    const s = series.get(id) || [];
    s.push([Math.round(u.ram || 0), Math.round((u.cpu || 0) * 10) / 10]);
    if (s.length > 30) s.shift();
    series.set(id, s);
  }
}

// Aviso do Windows; clicar nele traz o programa para a frente com a conta na tela.
function notificar(titulo, texto, id) {
  if (!cfg.guarda.notificacoes || !Notification.isSupported()) return;
  const n = new Notification({ title: titulo, body: texto });
  avisosAbertos.add(n);
  const soltar = () => avisosAbertos.delete(n);
  n.on('close', soltar);
  n.on('click', () => {
    soltar();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    if (id && conta(id)) acao('conta:mostrar', { id });
  });
  n.show();
}

function guardarJanela() {
  if (!win || win.isDestroyed()) return;
  const b = win.getNormalBounds(); // o tamanho de antes de maximizar, para voltar a ele
  cfg.janela = { width: b.width, height: b.height, x: b.x, y: b.y, maximizada: win.isMaximized() };
  config.salvar(cfg);
}

function criarJanela() {
  config.abrirChave(cfg);
  Menu.setApplicationMenu(null); // sem o menu padrão: o Ctrl+R dele recarregaria a barra, não a conta
  nativeTheme.themeSource = 'dark'; // Menu ▴ e moldura da janela escuros, como o resto
  const j = cfg.janela || { width: 1600, height: 900 };
  win = new BrowserWindow({
    width: j.width, height: j.height, x: j.x, y: j.y, minWidth: 900, minHeight: 500,
    title: 'HuntDesk' + (TESTE ? ' (teste)' : ''),
    icon: path.join(__dirname, 'ui', 'icone.png'),
    backgroundColor: '#0a0c11',
    webPreferences: { preload: path.join(__dirname, 'ui', 'preload.js'), contextIsolation: true, sandbox: true },
  });
  if (j.maximizada) win.maximize();
  win.loadFile(path.join(__dirname, 'ui', 'index.html'));
  sobre = new BrowserWindow({
    parent: win, show: false, frame: false, resizable: false, minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, width: 270, height: 400, backgroundColor: '#10141c',
    webPreferences: { preload: path.join(__dirname, 'ui', 'preload.js'), contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  sobre.loadFile(path.join(__dirname, 'ui', 'sobre.html'));
  sobre.webContents.on('did-finish-load', enviarEstado);
  sobre.webContents.on('before-input-event', (e, input) => atalho(e, input, null));
  // O da tela e o da pasta são menuzinhos: somem quando o jogador vai para outro lugar. Os painéis ficam até fechar
  // (podem pedir confirmação, que tira o foco deles).
  sobre.on('blur', () => { if (sobreAberto && sobreAberto.tipo !== 'painel') fecharSobre(); });
  sobre.on('close', (e) => { if (!saindo) { e.preventDefault(); fecharSobre(); } }); // Alt+F4 só esconde
  win.on('close', () => { saindo = true; });
  // Clique na janela principal (barra ou jogo) fecha a janelinha; logo depois de abrir não (o Menu ▴ do Windows, ao
  // fechar, devolve o foco à principal).
  win.on('focus', () => { if (Date.now() - abertoEm > 400) fecharSobre(); });
  for (const ev of ['move', 'minimize', 'enter-full-screen', 'leave-full-screen']) win.on(ev, fecharSobre);
  if (app.isPackaged) apagarPastaAntiga(path.join(app.getPath('userData'), 'medicoes')); // a que a 0.2.0 deixava
  medidor = new Medidor({
    fonte: () => cfg.contas.map((c) => {
      const v = vivas.get(c.id);
      return { id: c.id, freio: c.freio, visivel: !!(v && v.presa), estado: v ? v.estado : 'desligada', wc: v ? v.view.webContents : null };
    }),
    janela: win,
    // As planilhas de medição são só para quem desenvolve: rodando do projeto (npm start) ficam em medicoes/. Instalado,
    // o programa só mede para a tela e a guarda, sem gravar nada no computador de quem joga.
    pasta: app.isPackaged ? null : path.join(app.getAppPath(), 'medicoes'),
    teste: TESTE,
    aoAmostrar: (amostra) => {
      guarda.vigiar(amostra, cfg.contas.map((c) => ({ id: c.id, nome: c.nome, viva: vivas.has(c.id) })));
      guardarSerie(amostra);
      enviarEstado();
    },
  });
  // Cada evento de conta também vai para o histórico curto da janelinha (o completo fica na planilha, rodando do projeto).
  const anotar = medidor.evento.bind(medidor);
  medidor.evento = (quem, nota) => {
    anotar(quem, nota);
    if (!/^conta\d+$/.test(quem) || /^(na tela|fora da tela|estado: (ok|carregando))$/.test(nota)) return;
    const h = historicos.get(quem) || [];
    h.push([Date.now(), nota]);
    if (h.length > 20) h.shift();
    historicos.set(quem, h);
  };
  guarda = new Guarda({
    config: () => cfg,
    recarregar: (id) => { const v = vivas.get(id); if (v) v.view.webContents.reload(); },
    notificar,
    evento: (id, nota) => medidor.evento(id, nota),
  });
  ligacao = new LigarLeitura({ origem: () => origemApp, atual: () => (cfg.huntdesk && cfg.huntdesk.cloud) || null, perguntar: perguntarLigacao,
    aplicar: aplicarLigacao, buscar: (...a) => net.fetch(...a), evento: (nota) => medidor.evento('programa', nota) });
  // Nos testes as contas abrem a página de teste, sem extensão e sem internet.
  if (!TESTE) { extensao = new Extensao({ evento: (nota) => medidor.evento('programa', nota) }); extensao.comecar(); }
  // Abrir as contas ao iniciar é escolha do jogador (Configurações); senão, cada uma espera ele apertar Ligar.
  if (cfg.abrirAoIniciar) cfg.contas.filter((c) => c.ligada).forEach(ligarConta);
  arrumar();
  // Nos outros autotestes a pasta de dados é sempre nova: sem isto, as boas-vindas abririam por cima de todos.
  if (cfg.boasVindas && (!TESTE || CENARIO === 'boasvindas')) win.webContents.once('did-finish-load', abrirBoasVindas);
  win.on('resize', () => { fecharSobre(); arrumar(); guardarJanela(); });
  win.on('enter-full-screen', enviarEstado);
  win.on('leave-full-screen', enviarEstado);
  win.on('move', guardarJanela);
  win.on('minimize', () => medidor.evento('janela', 'minimizada'));
  win.on('restore', () => medidor.evento('janela', 'restaurada'));
  win.webContents.on('did-finish-load', enviarEstado);
  win.webContents.on('before-input-event', (e, input) => atalho(e, input, null));
  atualizador = new Atualizador({ ativo: !TESTE, aoMudar: enviarEstado, evento: (nota) => medidor.evento('programa', nota) });
  atualizador.comecar();
  medidor.comecar();
  medidor.evento('programa', `modo econômico ${ECONOMICO ? 'ligado' : 'desligado'}; quadros ${QUADROS ? 'limitados a ' + QUADROS + '/s' : 'sem limite'}`);
  if (ARGS.includes('--diagnostico')) { const d = () => cfg.contas.forEach((c) => diagnosticar(c.id)); setTimeout(d, 60000); setInterval(d, 5 * 60000); }
  if (EXPERIMENTO_ALIVIO) setInterval(() => ['conta1', 'conta2'].forEach((id) => aliviar(id, 'pelo experimento')), 5 * 60000);
  if (AUTOTESTE) {
    require('./autoteste').rodar(CENARIO, { acao, medidor, janela: win, abrir: abrirSobre, fechar: fecharSobre, abrirBoasVindas, marcaApp: MARCA_APP,
      respostasTeste, origemDoApp: (o) => { origemApp = o; },
      estado: () => ({ cfg, celulas, vivas, alertas: guarda.resumo(), sobre, app: appVista, mostrandoApp, boasVindas: janelaBoasVindas }), sair: () => app.quit() });
  }
}

// Só a barra e as janelinhas podem pedir ações; as páginas do jogo não falam com o programa.
const daBarra = (e) => win && (e.sender === win.webContents || (sobre && e.sender === sobre.webContents));
ipcMain.on('acao', (e, tipo, dados) => { if (daBarra(e)) acao(tipo, dados); });
ipcMain.on('area', (e, r) => {
  if (!win || e.sender !== win.webContents || !r) return;
  const [x, y, width, height] = [r.x, r.y, r.width, r.height].map((n) => Math.round(Number(n)));
  if (![x, y, width, height].every((n) => n >= 0 && n < 20000)) return;
  if (area && area.x === x && area.y === y && area.width === width && area.height === height) return;
  area = { x, y, width, height };
  arrumar();
});
ipcMain.on('abrir', (e, d) => {
  if (!daBarra(e) || !d) return;
  // O ⋯ da conta com a janelinha dela aberta: o clique já a fechou (foco na principal) e não abre de novo.
  if (qualSobre(d) === sobreFechado.qual && Date.now() - sobreFechado.quando < 400) return;
  const n = (v) => Math.round(Number(v)) || 0;
  if (d.tipo === 'tela' && acharTela(d.tela)) abrirSobre({ tipo: 'tela', tela: d.tela, x: n(d.x), y: n(d.y) });
  else if (d.tipo === 'pasta' && pastaDe(d.pasta)) abrirSobre({ tipo: 'pasta', pasta: d.pasta, x: n(d.x), y: n(d.y), nova: d.nova === true });
  else if (d.tipo === 'conta-nova' && pastaDe(d.pasta)) abrirSobre({ tipo: 'conta-nova', pasta: d.pasta, x: n(d.x), y: n(d.y) });
  else if (d.tipo === 'painel' && PAINEIS.includes(d.painel)) abrirSobre({ tipo: 'painel', painel: d.painel });
});
ipcMain.on('fechar', (e) => { if (daBarra(e)) fecharSobre(); });
// O site do app pede para ligar a leitura. Só vale da página principal da vista do app, no endereço do app e com ela na
// tela: confere aqui de novo, porque nada que venha da página é confiável por si só.
ipcMain.handle('app:ligar-leitura', (e, codigo) => {
  let deOnde = null;
  try { deOnde = new URL(e.senderFrame.url).origin; } catch (err) { /* sem endereço: recusa abaixo */ }
  if (!appVista || e.sender !== appVista.webContents || e.senderFrame !== e.sender.mainFrame || deOnde !== origemApp) return { ok: false, erro: 'origem' };
  if (!mostrandoApp) return { ok: false, erro: 'fora da tela' };
  return ligacao.ligar(codigo);
});
// Os dois botões das boas-vindas; "Conhecer o app" abre o app dentro do navegador.
ipcMain.on('boas-vindas', (e, escolha) => {
  if (!janelaBoasVindas || e.sender !== janelaBoasVindas.webContents) return;
  janelaBoasVindas.close();
  if (escolha === 'app') acao('app:mostrar');
});
// A janelinha diz a altura do que mostra; a janela dela acompanha (sem passar do tamanho da principal).
ipcMain.on('tamanho', (e, t) => {
  if (!sobre || e.sender !== sobre.webContents || !sobreAberto || !t) return;
  const altura = Math.round(Number(t.altura));
  if (!(altura > 0 && altura < 20000)) return;
  alturaSobre = altura;
  posicionarSobre();
});
// Menu ▴ da barra de baixo: o menu do próprio Windows, que aparece por cima das contas.
ipcMain.on('menu', (e) => {
  if (!daBarra(e)) return;
  const item = (label, painel) => ({ label, click: () => abrirSobre({ tipo: 'painel', painel }) });
  Menu.buildFromTemplate([item('Medições', 'medicoes'), item('Contas', 'contas'), item('Configurações', 'config'),
    { type: 'separator' }, { label: 'Abrir o app do HuntDesk', click: () => acao('app:mostrar') },
    { label: 'Extensão HuntDesk…', enabled: !!extensao, click: abrirHuntDesk },
    { type: 'separator' }, { label: 'HuntDesk ' + app.getVersion(), enabled: false }]).popup({ window: win });
});
ipcMain.on('abrir-medicoes', (e) => { if (daBarra(e) && medidor.arquivo) shell.openPath(medidor.pasta); });
ipcMain.on('abrir-dados', (e) => { if (daBarra(e)) shell.openPath(app.getPath('userData')); });

if (!app.requestSingleInstanceLock()) {
  app.quit(); // duas cópias abertas disputariam o mesmo cofre de login
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.setAppUserModelId('br.com.huntdesk.navegador'); // o Windows mostra os avisos com o nome do programa
  app.whenReady().then(criarJanela);
  app.on('before-quit', () => {
    saindo = true;
    if (medidor) medidor.parar();
    if (extensao) extensao.parar();
    if (cfg) config.gravarAgora(cfg);
    // Grava cookies e login no disco antes de fechar, para nenhuma conta pedir login de novo.
    if (cfg) cfg.contas.forEach((c) => session.fromPartition('persist:' + c.id).flushStorageData());
    if (appVista) session.fromPartition('persist:app-huntdesk').flushStorageData(); // o login do app do HuntDesk
  });
  app.on('window-all-closed', () => app.quit());
}
