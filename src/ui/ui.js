'use strict';
// Barra de cima e faixas das contas: mostra os números, troca layouts e manda os cliques dos botões ao programa.

const ESTADOS = { ok: 'rodando', carregando: 'carregando…', travada: 'sem resposta', caiu: 'caiu', erro: 'erro ao abrir', desligada: 'desligada' };
const $ = (sel) => document.querySelector(sel);
let E = null; // último estado recebido do programa
let painel = null; // 'medicoes' | 'contas' | 'layouts' | null
let assinaturaPainel = '';

const acao = (tipo, dados) => window.p0.acao(tipo, dados);

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
function fmt(x, casas = 0, unidade = '') {
  if (x == null || !isFinite(x)) return '—';
  return x.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }) + unidade;
}
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

// ---------- barra de cima ----------

function desenharTopo() {
  const L = E.layout;
  $('#layout').innerHTML = E.layouts.map((l) => `<option value="${esc(l.id)}"${l.id === L.id ? ' selected' : ''}>${esc(l.nome)}</option>`).join('');
  document.querySelectorAll('[data-modo]').forEach((b) => b.classList.toggle('ativo', b.dataset.modo === L.modo));
  $('#colunas').value = String(L.colunas);
  $('#rotulo-colunas').hidden = L.modo !== 'grade';

  const noLayout = new Set(L.contas);
  $('#chips').innerHTML = E.contas.map((c) => {
    const u = uso(c.id);
    const classes = ['chip', c.estado, c.naTela ? 'na-tela' : '', noLayout.has(c.id) ? 'no-layout' : '', alerta(c.id) ? 'alerta' : ''].join(' ');
    const dica = !c.ligada ? 'Desligada — clique para ligar e mostrar'
      : L.modo === 'abas' ? 'Clique para ver esta conta'
        : noLayout.has(c.id) ? 'Na tela — clique para esconder (o jogo continua rodando)' : 'Escondida — clique para mostrar';
    return `<button class="${classes}" data-chip="${esc(c.id)}" title="${esc(dica)}"><span class="ponto"></span>${esc(c.nome)}<span class="nota">${c.ligada ? fmt(u.ram, 0, ' MB') : ''}</span></button>`;
  }).join('');

  const t = E.amostra && E.amostra.total;
  $('#total').innerHTML = t ? `Total ${fmt(t.ram, 0, ' MB')} · CPU ${fmt(t.cpu, 1, '%')} · ${cresce(t.cresce)}` : 'medindo…';
  const at = E.alertas && E.alertas.total;
  $('#alerta-total').hidden = !at;
  if (at) {
    $('#alerta-total').innerHTML = `O programa todo passou do limite total: ${fmt(at.ram, 0)} de ${fmt(at.limite, 0, ' MB')} às ${hora(at.quando)}.
      Veja em Medições qual conta cresce mais. <button data-dispensar="total">Dispensar</button>`;
  }
  $('#versao').textContent = E.sobre.versao;
  const nova = E.atualizacao && E.atualizacao.fase === 'pronta';
  $('#faixa-versao').hidden = !nova;
  if (nova) {
    $('#faixa-versao').innerHTML = `A versão ${esc(E.atualizacao.versao)} do HuntDesk já foi baixada e entra quando você fechar o programa.
      <button id="reiniciar">Reiniciar agora</button>`;
  }
  document.querySelectorAll('[data-painel]').forEach((b) => b.classList.toggle('ativo', b.dataset.painel === painel));
}

// ---------- faixa em cima de cada conta ----------

function desenharCelulas() {
  const porId = new Map(E.contas.map((c) => [c.id, c]));
  $('#celulas').innerHTML = E.celulas.map((cel) => {
    const c = porId.get(cel.id);
    if (!c) return '';
    const u = uso(c.id);
    const a = alerta(c.id);
    const meio = a
      ? `<span class="aviso${a.recarregada ? ' recarregada' : ''}" title="${esc(textoAlerta(a))}">${esc(textoAlerta(a))}</span>
         <button data-dispensar="${esc(c.id)}" title="Tira o aviso">Dispensar</button>`
      : `${cresce(u.cresce)}<span class="nota">CPU ${fmt(u.cpu, 1, '%')}</span>`;
    return `<div class="celula${E.foco === c.id ? ' foco' : ''}${a ? ' com-alerta' : ''}" data-celula="${esc(c.id)}">
      <div class="cabecalho">
        <b>${esc(c.nome)}</b><span class="estado ${c.estado}">${ESTADOS[c.estado] || esc(c.estado)}</span>
        ${ram(u)}${meio}
        <span class="espaco"></span>
        <button data-conta="${esc(c.id)}" data-faz="freio" class="${c.freio ? 'ligado' : ''}" title="Com o freio, a conta escondida roda devagar e gasta menos">Freio: ${c.freio ? 'ligado' : 'desligado'}</button>
        <button data-conta="${esc(c.id)}" data-faz="recarregar" title="Recarrega só esta conta (F5 dentro dela faz o mesmo)">Recarregar</button>
        <button data-conta="${esc(c.id)}" data-faz="esconder" title="Tira da tela; o jogo continua aberto e conectado">Esconder</button>
      </div>
      <div class="corpo nota">${c.estado === 'caiu' ? 'A página caiu. Aperte Recarregar.' : ESTADOS[c.estado] || ''}</div>
    </div>`;
  }).join('');
  // A posição vai pelo JavaScript: a regra de segurança da página não aceita estilo escrito dentro do HTML.
  for (const cel of E.celulas) {
    const el = document.querySelector(`[data-celula="${CSS.escape(cel.id)}"]`);
    if (el) Object.assign(el.style, { left: cel.x + 'px', top: cel.y + 'px', width: cel.width + 'px', height: cel.height + 'px' });
  }
  $('#vazio').hidden = E.celulas.length > 0;
}

// ---------- painéis ----------

function painelMedicoes() {
  const linhas = E.contas.map((c) => {
    const u = uso(c.id);
    const vis = u.visibilidade === 'hidden' ? 'escondida' : u.visibilidade === 'visible' ? 'visível' : '—';
    return `<tr><td>${esc(c.nome)}</td><td class="estado ${c.estado}">${ESTADOS[c.estado] || esc(c.estado)}</td><td>${c.naTela ? 'sim' : 'não'}</td>
      <td>${c.freio ? 'ligado' : 'desligado'}</td><td>${c.ligada ? fmt(u.ram, 0, ' MB') : '—'}</td><td>${c.ligada ? cresce(u.cresce) : '—'}</td>
      <td>${fmt(u.cpu, 1, '%')}</td><td>${fmt(u.fps, 0)}</td><td>${fmt(u.relogios, 1)}</td><td>${fmt(u.heap, 0, ' MB')}</td><td>${vis}</td></tr>`;
  });
  const a = E.amostra || {};
  for (const [nome, u, dica] of [['Programa', a.programa, 'a janela e os ajudantes do Chrome'], ['Placa de vídeo', a.video, 'o desenho de todas as contas'], ['Total', a.total, 'compare com o Gerenciador de Tarefas']]) {
    linhas.push(`<tr class="soma"><td title="${esc(dica)}">${nome}</td><td></td><td></td><td></td><td>${fmt(u && u.ram, 0, ' MB')}</td><td>${u ? cresce(u.cresce) : '—'}</td><td>${fmt(u && u.cpu, 1, '%')}</td><td></td><td></td><td></td><td></td></tr>`);
  }
  return `<table>
    <thead><tr><th>Conta</th><th>Estado</th><th>Na tela</th><th>Freio</th><th>RAM</th><th>Cresce</th><th>CPU</th>
      <th title="Vezes por segundo que o jogo se desenha">Quadros/s</th><th title="Ritmo dos relógios do jogo: 10/s normal, 1/s freado">Relógios/s</th>
      <th title="Memória do código do jogo">JavaScript</th><th title="Como o Chrome vê a página">Chrome</th></tr></thead>
    <tbody>${linhas.join('')}</tbody></table>
    <div class="linha-botoes"><button id="abrir-medicoes">Abrir pasta das medições</button>
      <span class="nota">Medindo há ${fmt((Date.now() - E.inicio) / 60000, 0)} min; grava a cada 10 s${E.teste ? ' · modo teste (sem o jogo)' : ''}.</span></div>`;
}

function painelContas() {
  const linhas = E.contas.map((c) => `<div class="linha-form" data-linha="${esc(c.id)}">
      <input data-campo="nome" value="${esc(c.nome)}" maxlength="40" aria-label="Nome da conta">
      <input data-campo="url" value="${esc(c.url)}" aria-label="Endereço do jogo" class="largo">
      <button data-faz="${c.ligada ? 'desligar' : 'ligar'}" title="${c.ligada ? 'Fecha a página e libera a memória; o login fica guardado' : 'Abre a página de novo'}">${c.ligada ? 'Desligar' : 'Ligar'}</button>
      <button data-faz="remover" class="perigo" title="Apaga a conta e o login guardado dela">Remover</button>
    </div>`).join('');
  return `${linhas || '<p class="nota">Nenhuma conta.</p>'}
    <div class="linha-form nova">
      <input id="nova-nome" placeholder="Nome da conta nova" maxlength="40">
      <input id="nova-url" class="largo" placeholder="${esc(E.padrao)}">
      <button id="nova-adicionar">Adicionar conta</button>
    </div>
    <p class="nota">Cada conta tem o login separado e guardado no seu PC; você entra nela pelo próprio site do jogo.
      Confira o limite de contas do jogo antes de abrir muitas.</p>`;
}

function painelLayouts() {
  const linhas = E.layouts.map((l) => `<div class="linha-form" data-layout="${esc(l.id)}">
      <input data-campo="nome-layout" value="${esc(l.nome)}" maxlength="40" aria-label="Nome do layout">
      ${l.id === E.layout.id ? '<span class="nota">em uso</span>' : '<button data-faz="usar">Usar</button>'}
      ${E.layouts.length > 1 ? '<button data-faz="apagar-layout" class="perigo">Apagar</button>' : ''}
    </div>`).join('');
  return `${linhas}
    <div class="linha-form nova">
      <input id="novo-layout" placeholder="Nome do layout novo" maxlength="40">
      <button id="criar-layout">Salvar a tela de agora como layout novo</button>
    </div>
    <p class="nota">O layout guarda quais contas aparecem, grade ou abas e as colunas. Mudanças no layout em uso são
      salvas sozinhas.</p>`;
}

function painelConfig() {
  const g = E.guarda;
  return `<div class="config">
    <h3>Guarda de memória</h3>
    <label class="linha-form">Limite por conta
      <input type="number" data-guarda="limiteMb" value="${g.limiteMb}" min="${g.min}" max="${g.max}" step="128"> MB
      <span class="nota">perto do limite (80%) o número fica amarelo; acima, vermelho</span></label>
    <div class="linha-form">Quando uma conta passar do limite:</div>
    <label class="opcao"><input type="radio" name="acao" value="avisar"${g.acao === 'avisar' ? ' checked' : ''}>
      <span><b>Avisar e esperar meu clique</b> — a faixa da conta fica vermelha e você aperta Recarregar quando quiser.</span></label>
    <label class="opcao"><input type="radio" name="acao" value="recarregar"${g.acao === 'recarregar' ? ' checked' : ''}>
      <span><b>Recarregar sozinho</b> — recarrega só a página daquela conta (no máximo uma vez a cada 10 min). O programa
      nunca entra na conta nem volta à hunt: se o jogo pedir login, espera você.</span></label>
    <label class="linha-form">Limite do programa todo
      <input type="number" data-guarda="avisoTotalMb" value="${g.avisoTotalMb}" min="0" max="${g.max}" step="512"> MB
      <span class="nota">0 = sem limite; aqui ele só avisa</span></label>
    <label class="opcao"><input type="checkbox" data-guarda="notificacoes"${g.notificacoes ? ' checked' : ''}>
      <span>Avisar também no Windows (útil com o programa minimizado)</span></label>
    <h3>Economia de memória</h3>
    <p>${E.economico.agora ? '<b>Ligada.</b> Cada conta gasta uns 450–600 MB.' : '<b>Desligada.</b> Cada conta gasta uns 800–1.300 MB.'}
      <span class="nota">Ligada, o programa usa o modo do Chrome para computador fraco: a imagem do jogo fica um pouco
      mais simples e cada conta gasta bem menos memória.</span></p>
    <div class="linha-botoes"><button id="economico" data-ligar="${E.economico.agora ? '' : '1'}">${E.economico.agora ? 'Desligar economia de memória' : 'Ligar economia de memória'}</button>
      <span class="nota">o programa fecha e abre de novo para trocar${E.economico.escolhido !== E.economico.agora ? ' · aberto pela linha de comando com outro modo' : ''}</span></div>
    <h3>Ao abrir o programa</h3>
    <label class="opcao"><input type="checkbox" id="abrir-ao-iniciar"${E.abrirAoIniciar ? ' checked' : ''}>
      <span>Abrir as contas sozinho, como um navegador reabrindo as abas. Desmarcado, cada conta espera você clicar nela.</span></label>
    <h3>Sobre</h3>
    <p>HuntDesk versão <b>${esc(E.sobre.versao)}</b> <span class="nota">(motor do Chrome ${esc(E.sobre.chrome)})</span></p>
    <p class="nota">Logins, configurações e medições ficam em ${esc(E.sobre.pasta)}. Desinstalar o programa não apaga essa pasta.</p>
    <div class="linha-botoes"><button id="abrir-dados">Abrir pasta dos dados</button></div>
  </div>`;
}

function desenharPainel() {
  const el = $('#painel');
  el.hidden = !painel;
  if (!painel) { assinaturaPainel = ''; el.innerHTML = ''; return; }
  // Os painéis com campos de texto só são redesenhados quando algo muda de verdade e ninguém está digitando neles.
  const dados = {
    contas: () => E.contas.map((c) => [c.id, c.nome, c.url, c.ligada]),
    layouts: () => [E.layouts, E.layout.id],
    config: () => [E.guarda, E.abrirAoIniciar, E.economico, E.sobre],
  };
  const assinatura = painel === 'medicoes' ? 'medicoes' + Math.random() : painel + JSON.stringify(dados[painel]());
  if (assinatura === assinaturaPainel) return;
  if (painel !== 'medicoes' && el.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
  assinaturaPainel = assinatura;
  el.innerHTML = { medicoes: painelMedicoes, contas: painelContas, layouts: painelLayouts, config: painelConfig }[painel]();
}

function desenhar() {
  if (!E) return;
  desenharTopo();
  desenharCelulas();
  desenharPainel();
}

window.p0.aoEstado((estado) => { E = estado; desenhar(); });

// ---------- cliques ----------

document.addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (!b || !E) return;
  if (b.dataset.modo) return acao('layout:modo', { modo: b.dataset.modo });
  if (b.dataset.dispensar) return acao('guarda:dispensar', { id: b.dataset.dispensar });
  if (b.dataset.painel) { painel = painel === b.dataset.painel ? null : b.dataset.painel; assinaturaPainel = ''; return desenhar(); }
  if (b.dataset.chip) {
    const c = E.contas.find((x) => x.id === b.dataset.chip);
    if (!c) return;
    if (!c.ligada || E.layout.modo === 'abas') return acao('conta:mostrar', { id: c.id });
    return acao(E.layout.contas.includes(c.id) ? 'conta:esconder' : 'conta:mostrar', { id: c.id });
  }
  if (b.dataset.conta) {
    const c = E.contas.find((x) => x.id === b.dataset.conta);
    if (!c) return;
    if (b.dataset.faz === 'freio') return acao('conta:freio', { id: c.id, ligado: !c.freio });
    if (b.dataset.faz === 'recarregar') return acao('conta:recarregar', { id: c.id });
    if (b.dataset.faz === 'esconder') return acao('conta:esconder', { id: c.id });
  }
  const linha = b.closest('[data-linha]');
  if (linha) {
    const id = linha.dataset.linha;
    const c = E.contas.find((x) => x.id === id);
    if (b.dataset.faz === 'ligar') return acao('conta:ligar', { id });
    if (b.dataset.faz === 'desligar') return acao('conta:desligar', { id });
    if (b.dataset.faz === 'remover' && c && confirm(`Remover "${c.nome}"? O login guardado dela é apagado deste PC (a conta no jogo não é afetada).`)) {
      return acao('conta:remover', { id });
    }
  }
  const lay = b.closest('[data-layout]');
  if (lay) {
    if (b.dataset.faz === 'usar') return acao('layout:escolher', { id: lay.dataset.layout });
    if (b.dataset.faz === 'apagar-layout' && confirm('Apagar este layout? As contas não são afetadas.')) return acao('layout:apagar', { id: lay.dataset.layout });
  }
  if (b.id === 'abrir-medicoes') return window.p0.abrirMedicoes();
  if (b.id === 'abrir-dados') return window.p0.abrirDados();
  if (b.id === 'economico') {
    const ligar = !!b.dataset.ligar;
    const texto = ligar ? 'Ligar a economia de memória? A imagem do jogo fica um pouco mais simples.' : 'Desligar a economia de memória? Cada conta volta a gastar mais.';
    if (confirm(`${texto}

O HuntDesk vai fechar e abrir de novo; as contas recarregam e os logins ficam guardados.`)) return acao('config:economico', { ligado: ligar });
    return;
  }
  if (b.id === 'reiniciar' && confirm('Fechar o HuntDesk e abrir a versão nova? As contas abertas vão recarregar.')) return acao('app:reiniciar');
  if (b.id === 'nova-adicionar') {
    const url = $('#nova-url').value.trim();
    acao('conta:adicionar', { nome: $('#nova-nome').value, url: url || E.padrao });
    $('#nova-nome').value = '';
    $('#nova-url').value = '';
    return;
  }
  if (b.id === 'criar-layout') {
    acao('layout:novo', { nome: $('#novo-layout').value });
    $('#novo-layout').value = '';
  }
});

// Campos de nome e endereço: valem quando você sai do campo ou aperta Enter.
document.addEventListener('change', (ev) => {
  const el = ev.target;
  if (el.id === 'layout') return acao('layout:escolher', { id: el.value });
  if (el.id === 'colunas') return acao('layout:colunas', { colunas: Number(el.value) });
  if (el.id === 'abrir-ao-iniciar') return acao('config:abrir-ao-iniciar', { ligado: el.checked });
  if (el.name === 'acao') return acao('guarda:config', { acao: el.value });
  if (el.dataset.guarda === 'notificacoes') return acao('guarda:config', { notificacoes: el.checked });
  if (el.dataset.guarda) {
    // Número fora da faixa é ignorado pelo programa; o campo volta ao valor guardado.
    const n = Math.round(Number(el.value));
    assinaturaPainel = '';
    return acao('guarda:config', { [el.dataset.guarda]: n });
  }
  const linha = el.closest('[data-linha]');
  if (linha && el.dataset.campo === 'nome') return acao('conta:renomear', { id: linha.dataset.linha, nome: el.value });
  if (linha && el.dataset.campo === 'url') return acao('conta:endereco', { id: linha.dataset.linha, url: el.value.trim() });
  const lay = el.closest('[data-layout]');
  if (lay && el.dataset.campo === 'nome-layout') return acao('layout:renomear', { id: lay.dataset.layout, nome: el.value });
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && ev.target.tagName === 'INPUT') ev.target.blur();
});

// A barra muda de altura quando um painel abre ou fecha; as contas descem ou sobem junto.
new ResizeObserver(() => window.p0.altura($('#topo').offsetHeight)).observe($('#topo'));
