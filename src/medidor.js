'use strict';
// Medidor do P0: a cada 10 s anota memória e CPU de cada conta, do programa e da placa de vídeo numa planilha (CSV).
// Também lê, sem mexer no jogo, quantos quadros por segundo a página desenha e se o Chrome a considera escondida.

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

const INTERVALO = 10000;
const JANELA_CRESCIMENTO = 30; // amostras usadas no "cresce X MB/min" (30 × 10 s = 5 min)
const MUNDO = 4242; // "mundo isolado": o script de medição roda separado do código do jogo e não o enxerga

// Conta quadros desenhados e "batidas de relógio" (um timer de 100 ms: 10 por segundo quando a página roda solta).
// Com o experimento de quadros (quadros.js), conta também os quadros que o jogo desenhou de fato.
const INSTALAR = `(() => {
  if (window.__p0) return true;
  const s = window.__p0 = { quadros: 0, batidas: 0, jogo: 0, limitado: false, desde: performance.now() };
  document.addEventListener('huntdesk-quadro', () => { s.jogo++; s.limitado = true; });
  const quadro = () => { s.quadros++; requestAnimationFrame(quadro); };
  requestAnimationFrame(quadro);
  setInterval(() => { s.batidas++; }, 100);
  return true;
})()`;
const LER = `(() => {
  const s = window.__p0;
  if (!s) return null;
  const agora = performance.now();
  const seg = Math.max(0.001, (agora - s.desde) / 1000);
  const r = { fps: s.quadros / seg, relogios: s.batidas / seg, visibilidade: document.visibilityState,
    heap: performance.memory ? performance.memory.usedJSHeapSize : null, jogo: s.limitado ? s.jogo / seg : null };
  s.quadros = 0; s.batidas = 0; s.jogo = 0; s.desde = agora;
  return r;
})()`;

const COLUNAS = ['data_hora', 'minuto', 'linha', 'visivel', 'freio', 'visibilidade', 'fps', 'relogios_por_s',
  'ram_mb', 'privada_mb', 'cpu_pct', 'heap_js_mb', 'estado', 'nota', 'fps_jogo'];

function comPrazo(promessa, ms) {
  return Promise.race([promessa.catch(() => null), new Promise((r) => setTimeout(() => r(null), ms))]);
}

function mb(kb) { return kb == null ? null : Math.round(kb / 1024 * 10) / 10; }
function num(x, casas = 1) { return x == null || !isFinite(x) ? '' : x.toFixed(casas); }
function celula(v) {
  const s = v == null ? '' : String(v);
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function horaLocal(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// Apaga a pasta de medições que o programa instalado criava até a versão 0.2.0. Só toca nos arquivos "p0-….csv" que o
// próprio medidor criou; a pasta só some se ficar vazia.
function apagarPastaAntiga(pasta) {
  let nomes = [];
  try { nomes = fs.readdirSync(pasta).filter((n) => /^p0-\d{4}-\d{2}-\d{2}_\d{4}.*\.csv$/.test(n)); } catch (e) { return; }
  for (const n of nomes) {
    try { fs.unlinkSync(path.join(pasta, n)); } catch (e) { /* aberta no Excel: fica para a próxima */ }
  }
  try { fs.rmdirSync(pasta); } catch (e) { /* sobrou algo que não é do medidor */ }
}

// Inclinação da reta que melhor passa pelos pontos (minuto, MB): quanto a memória sobe por minuto.
function inclinacao(pontos) {
  if (pontos.length < 6) return null;
  const n = pontos.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const [x, y] of pontos) { sx += x; sy += y; sxx += x * x; sxy += x * y; }
  const d = n * sxx - sx * sx;
  return d === 0 ? null : (n * sxy - sx * sy) / d;
}

class Medidor {
  // fonte(): lista das contas agora, cada uma { id, freio, visivel, estado, wc } (wc = null se desligada).
  // pasta: onde gravar a planilha; null = não grava arquivo nenhum (programa instalado), só mede para a tela e a guarda.
  constructor({ fonte, janela, pasta, teste, aoAmostrar }) {
    this.fonte = fonte;
    this.janela = janela;
    this.pasta = pasta;
    this.aoAmostrar = aoAmostrar;
    this.inicio = Date.now();
    this.historico = new Map();
    this.ultima = null;
    this.arquivo = null;
    if (pasta) {
      fs.mkdirSync(pasta, { recursive: true });
      const nome = horaLocal(new Date()).replace(/[: ]/g, (c) => (c === ' ' ? '_' : '')).slice(0, 15);
      this.arquivo = path.join(pasta, `p0-${nome}${teste ? '-teste' : ''}.csv`);
      fs.writeFileSync(this.arquivo, '﻿' + COLUNAS.join(',') + '\n'); // o "﻿" faz o Excel ler os acentos
    }
    this.ocupado = false;
  }

  comecar() {
    app.getAppMetrics(); // a primeira leitura de CPU só zera o contador
    this.timer = setInterval(() => this.amostrar(), INTERVALO);
  }

  parar() { clearInterval(this.timer); }

  prepararPagina(wc) {
    if (!wc || wc.isDestroyed()) return;
    comPrazo(wc.executeJavaScriptInIsolatedWorld(MUNDO, [{ code: INSTALAR }]), 3000);
  }

  minuto() { return (Date.now() - this.inicio) / 60000; }

  escrever(campos) {
    if (!this.arquivo) return;
    const linha = COLUNAS.map((k) => celula(campos[k])).join(',') + '\n';
    fs.appendFile(this.arquivo, linha, () => {});
  }

  evento(quem, nota) {
    this.escrever({ data_hora: horaLocal(new Date()), minuto: num(this.minuto(), 2), linha: 'evento', estado: quem, nota });
  }

  crescimento(chave, ram) {
    const h = this.historico.get(chave) || [];
    h.push([this.minuto(), ram]);
    if (h.length > JANELA_CRESCIMENTO) h.shift();
    this.historico.set(chave, h);
    return inclinacao(h);
  }

  async amostrar() {
    if (this.ocupado) return; // uma leitura lenta não pode empilhar outra
    this.ocupado = true;
    try {
      const metricas = app.getAppMetrics();
      const porPid = new Map(metricas.map((m) => [m.pid, m]));
      const usados = new Set();
      const somar = (pids) => {
        const t = { ram: 0, privada: 0, cpu: 0 };
        for (const pid of pids) {
          const m = porPid.get(pid);
          if (!m || usados.has(pid)) continue;
          usados.add(pid);
          t.ram += m.memory.workingSetSize || 0;
          t.privada += m.memory.privateBytes || 0;
          t.cpu += m.cpu.percentCPUUsage || 0;
        }
        return { ram: mb(t.ram), privada: mb(t.privada), cpu: t.cpu };
      };

      const quando = horaLocal(new Date());
      const minuto = num(this.minuto(), 2);
      const amostra = { minuto: this.minuto(), contas: {}, programa: null, video: null, total: null };

      const vivas = new Set();
      for (const c of this.fonte()) {
        const wc = c.wc && !c.wc.isDestroyed() ? c.wc : null;
        if (!wc) {
          this.escrever({ data_hora: quando, minuto, linha: c.id, visivel: 'nao', freio: c.freio ? 'sim' : 'nao', estado: 'desligada' });
          continue;
        }
        vivas.add(c.id);
        const pids = [wc.getOSProcessId()];
        // Partes da página vindas de outros sites rodam em processos próprios; contam para a mesma conta.
        try { for (const f of wc.mainFrame.framesInSubtree) pids.push(f.osProcessId); } catch (e) { /* página trocando */ }
        const uso = somar(pids);
        const pagina = await comPrazo(wc.executeJavaScriptInIsolatedWorld(MUNDO, [{ code: LER }]), 3000);
        if (pagina === null && c.estado === 'ok') this.prepararPagina(wc);
        const cresce = this.crescimento(c.id, uso.ram);
        amostra.contas[c.id] = { ...uso, cresce, fps: pagina && pagina.fps, fpsJogo: pagina && pagina.jogo, relogios: pagina && pagina.relogios,
          visibilidade: pagina && pagina.visibilidade, heap: pagina && pagina.heap != null ? pagina.heap / 1048576 : null };
        this.escrever({ data_hora: quando, minuto, linha: c.id, visivel: c.visivel ? 'sim' : 'nao', freio: c.freio ? 'sim' : 'nao',
          visibilidade: pagina ? pagina.visibilidade : '', fps: pagina ? num(pagina.fps) : '', relogios_por_s: pagina ? num(pagina.relogios) : '',
          ram_mb: num(uso.ram), privada_mb: num(uso.privada), cpu_pct: num(uso.cpu), heap_js_mb: amostra.contas[c.id].heap == null ? '' : num(amostra.contas[c.id].heap),
          estado: c.estado, fps_jogo: pagina && pagina.jogo != null ? num(pagina.jogo) : '' });
      }
      // Conta desligada ou removida: o "cresce X MB/min" dela recomeça do zero quando voltar.
      for (const chave of this.historico.keys()) if (/^conta/.test(chave) && !vivas.has(chave)) this.historico.delete(chave);

      // Placa de vídeo: um processo só para as duas contas (o desenho do jogo passa por ele).
      const video = somar(metricas.filter((m) => m.type === 'GPU').map((m) => m.pid));
      // Programa: a janela principal, a barra de medição e os processos auxiliares do Chrome.
      const programa = somar(metricas.map((m) => m.pid));
      const total = { ram: 0, privada: 0, cpu: 0 };
      for (const m of metricas) { total.ram += m.memory.workingSetSize || 0; total.privada += m.memory.privateBytes || 0; total.cpu += m.cpu.percentCPUUsage || 0; }
      const tot = { ram: mb(total.ram), privada: mb(total.privada), cpu: total.cpu };
      for (const [chave, uso] of [['video', video], ['programa', programa], ['total', tot]]) {
        amostra[chave] = { ...uso, cresce: this.crescimento(chave, uso.ram) };
        this.escrever({ data_hora: quando, minuto, linha: chave, ram_mb: num(uso.ram), privada_mb: num(uso.privada), cpu_pct: num(uso.cpu),
          estado: chave === 'total' && this.janela.isMinimized() ? 'janela minimizada' : '' });
      }
      this.ultima = amostra;
      this.aoAmostrar(amostra);
    } finally {
      this.ocupado = false;
    }
  }
}

module.exports = { Medidor, inclinacao, apagarPastaAntiga, horaLocal };
