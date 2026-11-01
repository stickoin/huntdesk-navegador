'use strict';
// HuntDesk Navegador — P1: várias contas do jogo, cada uma com o login separado, em grade ou em abas, com layouts
// salvos; mede memória e CPU de cada conta (herdado do P0).
// Regra 1 do projeto: o programa só organiza as janelas e mede. Nunca clica, digita ou entra em nada dentro do
// jogo — toda ação sai de um botão ou atalho apertado pelo jogador.

const path = require('node:path');
const { app, BrowserWindow, WebContentsView, Menu, Notification, ipcMain, session, shell } = require('electron');
const { Medidor } = require('./medidor');
const { Guarda } = require('./guarda');
const { Atualizador } = require('./atualizador');
const config = require('./config');

const ARGS = process.argv.slice(1);
const CENARIO = (ARGS.find((a) => a.startsWith('--autoteste')) || '').replace(/^--autoteste-?/, '') || 'telas';
const AUTOTESTE = ARGS.some((a) => a.startsWith('--autoteste'));
const TESTE = AUTOTESTE || ARGS.includes('--teste');
const PAGINA_TESTE = path.join(__dirname, 'teste', 'pagina-teste.html');
const CABECALHO = 28; // faixa com o nome e os botões em cima de cada conta
const VAO = 4; // espaço entre as contas

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

let cfg = config.carregar(); // contas e layouts (config.json)
// Modo econômico: o modo do Chrome para computador fraco (menos memória, imagem um pouco mais simples). Só vale ao abrir o
// programa, por isso trocar nas Configurações reinicia.
const ECONOMICO = cfg.economico || ARGS.includes('--economico');
if (ECONOMICO) app.commandLine.appendSwitch('enable-low-end-device-mode');
const vivas = new Map(); // id da conta → { view, estado, presa }; presa = está na janela agora
let win = null;
let medidor = null;
let guarda = null;
let atualizador = null;
const avisosAbertos = new Set(); // notificações do Windows na tela (sem referência, o Windows as perde)
let topo = 48; // altura da barra de cima, informada pela própria barra
let foco = null; // última conta clicada: o F5 recarrega só ela
let celulas = [];

const conta = (id) => cfg.contas.find((c) => c.id === id);
const layoutAtual = () => cfg.layouts.find((l) => l.id === cfg.layoutAtual) || cfg.layouts[0];

function permitir(wc, permissao, responder) {
  // O jogo não precisa de câmera, microfone, localização nem notificações.
  responder(permissao === 'clipboard-sanitized-write' || permissao === 'fullscreen');
}

// ---------- contas ----------

function ligarConta(c) {
  if (vivas.has(c.id)) return;
  const particao = 'persist:' + c.id; // "persist:" = cookies e login guardados entre aberturas, um cofre por conta
  session.fromPartition(particao).setPermissionRequestHandler(permitir);
  const view = new WebContentsView({
    webPreferences: { partition: particao, contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: c.freio },
  });
  view.setBackgroundColor('#101318');
  const v = { view, estado: 'carregando', presa: false };
  vivas.set(c.id, v);
  const wc = view.webContents;
  wc.setWindowOpenHandler(({ url }) => {
    // Janela que o jogo pede (login, termos) abre com a mesma conta; o Chrome só deixa abrir com um clique do jogador.
    if (/^https?:/i.test(url)) return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true } };
    return { action: 'deny' };
  });
  wc.on('did-start-loading', () => mudarEstado(c.id, 'carregando'));
  wc.on('did-finish-load', () => { mudarEstado(c.id, 'ok'); medidor.prepararPagina(wc); });
  wc.on('did-fail-load', (e, codigo, descricao, url, principal) => { if (principal && codigo !== -3) mudarEstado(c.id, 'erro', descricao); });
  wc.on('unresponsive', () => mudarEstado(c.id, 'travada'));
  wc.on('responsive', () => mudarEstado(c.id, 'ok'));
  wc.on('render-process-gone', (e, d) => mudarEstado(c.id, 'caiu', d.reason));
  wc.on('focus', () => { if (foco !== c.id) { foco = c.id; enviarEstado(); } });
  wc.on('before-input-event', (e, input) => atalho(e, input, c.id));
  // No teste da guarda a página gasta memória mesmo escondida (a janela do teste pode abrir atrás de outras).
  if (TESTE) wc.loadFile(PAGINA_TESTE, { query: { conta: c.nome, vazar: CENARIO === 'guarda' ? 'sempre' : 'desenho' } });
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
  v.estado = estado;
  medidor.evento(id, 'estado: ' + estado + (nota ? ' (' + nota + ')' : ''));
  enviarEstado();
}

// ---------- arrumação na janela ----------

// Quem aparece agora: na grade, todas as contas do layout; nas abas, só a aba escolhida.
function naTela() {
  const L = layoutAtual();
  const ids = L.contas.filter((id) => vivas.has(id));
  if (L.modo !== 'abas') return ids;
  const aba = ids.includes(L.aba) ? L.aba : ids[0];
  return aba ? [aba] : [];
}

function grade(n, largura, altura, colunas) {
  if (!n) return [];
  const cols = colunas > 0 ? Math.min(colunas, n) : Math.ceil(Math.sqrt(n));
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
  const ids = naTela();
  const caixas = grade(ids.length, largura, Math.max(0, altura - topo), layoutAtual().colunas);
  celulas = ids.map((id, i) => ({ id, ...caixas[i], y: caixas[i].y + topo }));
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
    v.view.setBounds({ x: cel.x, y: cel.y + CABECALHO, width: cel.width, height: Math.max(0, cel.height - CABECALHO) });
  }
  enviarEstado();
}

// ---------- atalhos ----------

function atalho(e, input, id) {
  if (input.type !== 'keyDown') return;
  const ctrl = input.control || input.meta;
  const tecla = input.key.toLowerCase();
  if (tecla === 'f5' || (ctrl && tecla === 'r')) {
    // F5 recarrega só a conta em que você está, nunca todas.
    e.preventDefault();
    const alvo = id || foco;
    if (alvo) acao('conta:recarregar', { id: alvo });
  } else if (ctrl && /^[1-9]$/.test(tecla)) {
    // Ctrl+1, Ctrl+2…: troca de aba (no modo abas).
    const L = layoutAtual();
    const alvo = L.contas[Number(tecla) - 1];
    if (L.modo === 'abas' && alvo) { e.preventDefault(); acao('layout:aba', { id: alvo }); }
  }
}

// ---------- ações (sempre de um botão ou atalho do jogador) ----------

function novaConta({ nome, url }) {
  const id = 'conta' + cfg.proximaConta++;
  const c = { id, nome: config.nomeValido(nome, 'Conta ' + id.slice(5)), url: config.enderecoValido(url) ? url : config.JOGO_PADRAO, freio: true, ligada: true };
  cfg.contas.push(c);
  const L = layoutAtual();
  L.contas.push(id);
  if (L.modo === 'abas') L.aba = id;
  ligarConta(c);
}

function removerConta(id) {
  desligarConta(id);
  cfg.contas = cfg.contas.filter((c) => c.id !== id);
  for (const L of cfg.layouts) {
    L.contas = L.contas.filter((x) => x !== id);
    if (L.aba === id) L.aba = L.contas[0] || null;
  }
  if (foco === id) foco = null;
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
  'conta:mostrar': ({ id }) => {
    const c = conta(id);
    if (!c) return;
    const L = layoutAtual();
    if (!L.contas.includes(id)) L.contas.push(id);
    if (L.modo === 'abas') L.aba = id;
    if (!vivas.has(id)) { c.ligada = true; ligarConta(c); }
  },
  'conta:esconder': ({ id }) => {
    const L = layoutAtual();
    L.contas = L.contas.filter((x) => x !== id);
    if (L.aba === id) L.aba = L.contas[0] || null;
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
  'conta:aliviar': ({ id }) => aliviar(id, 'pelo jogador'),
  'app:reiniciar': () => atualizador.reiniciar(),
  'conta:ligar': ({ id }) => { const c = conta(id); if (c) { c.ligada = true; ligarConta(c); } },
  'conta:desligar': ({ id }) => { const c = conta(id); if (c) { c.ligada = false; desligarConta(id); } },
  'conta:adicionar': (dados) => novaConta(dados),
  'conta:renomear': ({ id, nome }) => { const c = conta(id); if (c) c.nome = config.nomeValido(nome, c.nome); },
  'conta:endereco': ({ id, url }) => {
    const c = conta(id);
    if (!c || !config.enderecoValido(url) || c.url === url) return;
    c.url = url;
    const v = vivas.get(id);
    if (v && !TESTE) v.view.webContents.loadURL(url);
  },
  'conta:remover': ({ id }) => { if (conta(id)) removerConta(id); },
  'layout:modo': ({ modo }) => { if (config.MODOS.includes(modo)) layoutAtual().modo = modo; },
  'layout:colunas': ({ colunas }) => {
    const n = Number(colunas);
    if (Number.isInteger(n) && n >= 0 && n <= config.MAX_COLUNAS) layoutAtual().colunas = n;
  },
  'layout:aba': ({ id }) => ACOES['conta:mostrar']({ id }),
  'layout:escolher': ({ id }) => {
    if (!cfg.layouts.some((l) => l.id === id)) return;
    cfg.layoutAtual = id;
    // Conta que o layout mostra e estava desligada volta a ligar.
    for (const cid of layoutAtual().contas) { const c = conta(cid); if (c && !vivas.has(cid)) { c.ligada = true; ligarConta(c); } }
  },
  'layout:novo': ({ nome }) => {
    // O layout novo começa como cópia da tela de agora.
    const L = layoutAtual();
    const novo = { ...L, id: 'layout' + cfg.proximoLayout++, nome: config.nomeValido(nome, 'Layout ' + (cfg.layouts.length + 1)), contas: [...L.contas] };
    cfg.layouts.push(novo);
    cfg.layoutAtual = novo.id;
  },
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
  'layout:renomear':({ id, nome }) => { const L = cfg.layouts.find((l) => l.id === id); if (L) L.nome = config.nomeValido(nome, L.nome); },
  'layout:apagar': ({ id }) => {
    if (cfg.layouts.length <= 1) return;
    cfg.layouts = cfg.layouts.filter((l) => l.id !== id);
    if (cfg.layoutAtual === id) cfg.layoutAtual = cfg.layouts[0].id;
  },
};

function acao(tipo, dados) {
  const fn = ACOES[tipo];
  if (!fn) return;
  fn(dados || {});
  config.salvar(cfg);
  arrumar();
}

// ---------- barra de cima ----------

function enviarEstado() {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('estado', {
    teste: TESTE,
    arquivo: medidor.arquivo,
    inicio: medidor.inicio,
    contas: cfg.contas.map((c) => {
      const v = vivas.get(c.id);
      return { id: c.id, nome: c.nome, url: c.url, freio: c.freio, ligada: !!v, estado: v ? v.estado : 'desligada', naTela: !!(v && v.presa) };
    }),
    layouts: cfg.layouts.map(({ id, nome }) => ({ id, nome })),
    layout: layoutAtual(),
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
  });
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
  Menu.setApplicationMenu(null); // sem o menu padrão: o Ctrl+R dele recarregaria a barra, não a conta
  const j = cfg.janela || { width: 1600, height: 900 };
  win = new BrowserWindow({
    width: j.width, height: j.height, x: j.x, y: j.y, minWidth: 900, minHeight: 500,
    title: 'HuntDesk' + (TESTE ? ' (teste)' : ''),
    icon: path.join(__dirname, 'ui', 'icone.png'),
    backgroundColor: '#14161b',
    webPreferences: { preload: path.join(__dirname, 'ui', 'preload.js'), contextIsolation: true, sandbox: true },
  });
  if (j.maximizada) win.maximize();
  win.loadFile(path.join(__dirname, 'ui', 'index.html'));
  medidor = new Medidor({
    fonte: () => cfg.contas.map((c) => {
      const v = vivas.get(c.id);
      return { id: c.id, freio: c.freio, visivel: !!(v && v.presa), estado: v ? v.estado : 'desligada', wc: v ? v.view.webContents : null };
    }),
    janela: win,
    // Instalado, o programa não pode gravar na própria pasta: as medições vão para a pasta de dados e ficam só as
    // mais recentes. Rodando do projeto (npm start), ficam todas em medicoes/.
    pasta: app.isPackaged ? path.join(app.getPath('userData'), 'medicoes') : path.join(app.getAppPath(), 'medicoes'),
    manter: app.isPackaged ? 30 : 0,
    teste: TESTE,
    aoAmostrar: (amostra) => {
      guarda.vigiar(amostra, cfg.contas.map((c) => ({ id: c.id, nome: c.nome, viva: vivas.has(c.id) })));
      enviarEstado();
    },
  });
  guarda = new Guarda({
    config: () => cfg,
    recarregar: (id) => { const v = vivas.get(id); if (v) v.view.webContents.reload(); },
    notificar,
    evento: (id, nota) => medidor.evento(id, nota),
  });
  // Abrir as contas ao iniciar é escolha do jogador (Configurações); senão, cada uma espera ele apertar Ligar.
  if (cfg.abrirAoIniciar) cfg.contas.filter((c) => c.ligada).forEach(ligarConta);
  arrumar();
  win.on('resize', () => { arrumar(); guardarJanela(); });
  win.on('move', guardarJanela);
  win.on('minimize', () => medidor.evento('janela', 'minimizada'));
  win.on('restore', () => medidor.evento('janela', 'restaurada'));
  win.webContents.on('did-finish-load', enviarEstado);
  win.webContents.on('before-input-event', (e, input) => atalho(e, input, null));
  atualizador = new Atualizador({ ativo: !TESTE, aoMudar: enviarEstado, evento: (nota) => medidor.evento('programa', nota) });
  atualizador.comecar();
  medidor.comecar();
  medidor.evento('programa', `modo econômico ${ECONOMICO ? 'ligado' : 'desligado'}`);
  if (ARGS.includes('--diagnostico')) { const d = () => cfg.contas.forEach((c) => diagnosticar(c.id)); setTimeout(d, 60000); setInterval(d, 5 * 60000); }
  if (EXPERIMENTO_ALIVIO) setInterval(() => ['conta1', 'conta2'].forEach((id) => aliviar(id, 'pelo experimento')), 5 * 60000);
  if (AUTOTESTE) require('./autoteste').rodar(CENARIO, { acao, medidor, janela: win, estado: () => ({ cfg, celulas, vivas, alertas: guarda.resumo() }), sair: () => app.quit() });
}

// Só a barra de cima pode pedir ações; as páginas do jogo não falam com o programa.
const daBarra = (e) => win && e.sender === win.webContents;
ipcMain.on('acao', (e, tipo, dados) => { if (daBarra(e)) acao(tipo, dados); });
ipcMain.on('altura-topo', (e, altura) => {
  const h = Math.round(Number(altura));
  if (daBarra(e) && h > 0 && h < 2000 && h !== topo) { topo = h; arrumar(); }
});
ipcMain.on('abrir-medicoes', (e) => { if (daBarra(e)) shell.openPath(medidor.pasta); });
ipcMain.on('abrir-dados', (e) => { if (daBarra(e)) shell.openPath(app.getPath('userData')); });

if (!app.requestSingleInstanceLock()) {
  app.quit(); // duas cópias abertas disputariam o mesmo cofre de login
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.setAppUserModelId('br.com.huntdesk.navegador'); // o Windows mostra os avisos com o nome do programa
  app.whenReady().then(criarJanela);
  app.on('before-quit', () => {
    if (medidor) medidor.parar();
    if (cfg) config.gravarAgora(cfg);
    // Grava cookies e login no disco antes de fechar, para nenhuma conta pedir login de novo.
    if (cfg) cfg.contas.forEach((c) => session.fromPartition('persist:' + c.id).flushStorageData());
  });
  app.on('window-all-closed', () => app.quit());
}
