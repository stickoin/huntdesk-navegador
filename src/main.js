'use strict';
// HuntDesk Navegador — P1: várias contas do jogo, cada uma com o login separado, em grade ou em abas, com layouts
// salvos; mede memória e CPU de cada conta (herdado do P0).
// Regra 1 do projeto: o programa só organiza as janelas e mede. Nunca clica, digita ou entra em nada dentro do
// jogo — toda ação sai de um botão ou atalho apertado pelo jogador.

const path = require('node:path');
const { app, BrowserWindow, WebContentsView, Menu, Notification, ipcMain, nativeTheme, session, shell } = require('electron');
const { Medidor, apagarPastaAntiga } = require('./medidor');
const { Guarda } = require('./guarda');
const { Atualizador } = require('./atualizador');
const config = require('./config');

const ARGS = process.argv.slice(1);
const CENARIO = (ARGS.find((a) => a.startsWith('--autoteste')) || '').replace(/^--autoteste-?/, '') || 'telas';
const AUTOTESTE = ARGS.some((a) => a.startsWith('--autoteste'));
const TESTE = AUTOTESTE || ARGS.includes('--teste');
const PAGINA_TESTE = path.join(__dirname, 'teste', 'pagina-teste.html');
const FAIXA = 24; // faixa com o nome e os botões em cima de cada conta (o jogador pode esconder)
const VAO = 4; // espaço entre as contas
const PAINEIS = ['medicoes', 'contas', 'layouts', 'config'];

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
let area = null; // espaço das contas (entre a lateral e a barra de baixo), informado pela própria barra
let foco = null; // última conta clicada: o F5 recarrega só ela
let celulas = [];
let sobre = null; // camada das janelinhas (detalhes da conta e painéis), posta por cima das contas
let sobreAberto = null; // o que está aberto nela: { tipo: 'conta', id, x, y } | { tipo: 'painel', painel } | null
const series = new Map(); // id da conta → últimas 30 medições [MB, % processador], para os gráficos da janelinha
const historicos = new Map(); // id da conta → últimos eventos [quando, nota], para o histórico da janelinha

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
    webPreferences: {
      partition: particao, contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: c.freio,
      ...(QUADROS ? { preload: path.join(__dirname, 'quadros.js'), additionalArguments: ['--huntdesk-quadros=' + QUADROS] } : {}),
    },
  });
  view.setBackgroundColor('#0a0c11');
  const v = { view, estado: 'carregando', presa: false, desde: Date.now() };
  vivas.set(c.id, v);
  const wc = view.webContents;
  wc.setAudioMuted(!!c.mudo);
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
  const antes = v.estado;
  v.estado = estado;
  medidor.evento(id, 'estado: ' + estado + (nota ? ' (' + nota + ')' : ''));
  // A página que caiu sai da frente para aparecer o aviso com "Recarregar agora"; volta quando recarregar.
  if (antes === 'caiu' || estado === 'caiu') arrumar();
  else enviarEstado();
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
  // Auto: quase quadrado; com o monitor em pé, mais linhas que colunas.
  const lado = Math.ceil(Math.sqrt(n));
  const cols = colunas > 0 ? Math.min(colunas, n) : largura >= altura ? lado : Math.ceil(n / lado);
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
  // Até a barra informar o espaço, conta com a lateral (200 px aberta, 56 recolhida) e a barra de baixo (36 px).
  const lat = cfg.visual.lateral ? 200 : 56;
  const a = area || { x: lat, y: 0, width: largura - lat, height: altura - 36 };
  const ids = naTela();
  const caixas = grade(ids.length, Math.max(0, a.width - 2 * VAO), Math.max(0, a.height - 2 * VAO), layoutAtual().colunas);
  celulas = ids.map((id, i) => ({ id, ...caixas[i], x: caixas[i].x + a.x + VAO, y: caixas[i].y + a.y + VAO }));
  const faixa = cfg.visual.faixas ? FAIXA : 0;
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
  // Conta que entrou na tela fica por cima de tudo; a janelinha aberta volta para cima dela.
  if (sobreAberto) {
    win.contentView.addChildView(sobre);
    sobre.setBounds({ x: 0, y: 0, width: largura, height: altura });
  }
  enviarEstado();
}

// ---------- janelinhas ----------

// As páginas do jogo ficam por cima de tudo o que a barra desenha; por isso os detalhes da conta e os painéis abrem
// numa camada própria, transparente, posta acima das contas só enquanto estão abertos.
function abrirSobre(dados) {
  sobreAberto = dados;
  sobre.webContents.send('abrir', dados);
  arrumar();
  sobre.webContents.focus();
}

function fecharSobre() {
  if (!sobreAberto) return;
  sobreAberto = null;
  sobre.webContents.send('abrir', null);
  win.contentView.removeChildView(sobre);
  win.webContents.focus();
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
  } else if (tecla === 'f11') {
    e.preventDefault();
    acao('janela:cheia');
  } else if (ctrl && tecla === 'b') {
    // Ctrl+B recolhe ou abre a lateral, mesmo com o teclado dentro do jogo.
    e.preventDefault();
    acao('visual:lateral');
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
  historicos.delete(id);
  if (sobreAberto && sobreAberto.id === id) fecharSobre();
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
  'conta:som': ({ id, ligado }) => {
    const c = conta(id);
    if (!c) return;
    c.mudo = !ligado;
    const v = vivas.get(id);
    if (v) v.view.webContents.setAudioMuted(c.mudo);
  },
  'visual:lateral': () => { cfg.visual.lateral = !cfg.visual.lateral; },
  'visual:faixas': () => { cfg.visual.faixas = !cfg.visual.faixas; },
  'janela:cheia': () => win.setFullScreen(!win.isFullScreen()),
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

// ---------- barra e janelinhas ----------

function enviarEstado() {
  if (!win || win.isDestroyed()) return;
  const estado = {
    teste: TESTE,
    arquivo: medidor.arquivo,
    inicio: medidor.inicio,
    contas: cfg.contas.map((c) => {
      const v = vivas.get(c.id);
      return { id: c.id, nome: c.nome, url: c.url, freio: c.freio, mudo: !!c.mudo, ligada: !!v, estado: v ? v.estado : 'desligada',
        naTela: !!(v && v.presa), desde: v ? v.desde : null };
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
    visual: cfg.visual,
    cheia: win.isFullScreen(),
    aberto: sobreAberto,
    series: Object.fromEntries(series),
    historico: Object.fromEntries(historicos),
  };
  win.webContents.send('estado', estado);
  if (sobre) sobre.webContents.send('estado', estado);
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
  sobre = new WebContentsView({ webPreferences: { preload: path.join(__dirname, 'ui', 'preload.js'), contextIsolation: true, sandbox: true } });
  sobre.setBackgroundColor('#00000000'); // transparente: o jogo aparece escurecido atrás da janelinha
  sobre.webContents.loadFile(path.join(__dirname, 'ui', 'sobre.html'));
  sobre.webContents.on('did-finish-load', enviarEstado);
  sobre.webContents.on('before-input-event', (e, input) => atalho(e, input, null));
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
  // Abrir as contas ao iniciar é escolha do jogador (Configurações); senão, cada uma espera ele apertar Ligar.
  if (cfg.abrirAoIniciar) cfg.contas.filter((c) => c.ligada).forEach(ligarConta);
  arrumar();
  win.on('resize', () => { arrumar(); guardarJanela(); });
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
    require('./autoteste').rodar(CENARIO, { acao, medidor, janela: win, abrir: abrirSobre, fechar: fecharSobre,
      estado: () => ({ cfg, celulas, vivas, alertas: guarda.resumo(), sobre }), sair: () => app.quit() });
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
  const n = (v) => Math.round(Number(v)) || 0;
  if (d.tipo === 'conta' && conta(d.id)) abrirSobre({ tipo: 'conta', id: d.id, x: n(d.x), y: n(d.y) });
  else if (d.tipo === 'painel' && PAINEIS.includes(d.painel)) abrirSobre({ tipo: 'painel', painel: d.painel });
});
ipcMain.on('fechar', (e) => { if (daBarra(e)) fecharSobre(); });
// Menu ▴ da barra de baixo: o menu do próprio Windows, que aparece por cima das contas.
ipcMain.on('menu', (e) => {
  if (!daBarra(e)) return;
  const item = (label, painel) => ({ label, click: () => abrirSobre({ tipo: 'painel', painel }) });
  Menu.buildFromTemplate([item('Medições', 'medicoes'), item('Contas', 'contas'), item('Layouts', 'layouts'), item('Configurações', 'config'),
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
    if (medidor) medidor.parar();
    if (cfg) config.gravarAgora(cfg);
    // Grava cookies e login no disco antes de fechar, para nenhuma conta pedir login de novo.
    if (cfg) cfg.contas.forEach((c) => session.fromPartition('persist:' + c.id).flushStorageData());
  });
  app.on('window-all-closed', () => app.quit());
}
