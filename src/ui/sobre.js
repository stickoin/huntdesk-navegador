'use strict';
// Janelinhas por cima das contas: o menuzinho de uma tela ou de uma pasta (o ⋯ ou o botão direito na lateral) e os
// painéis do Menu (Medições, Contas, Configurações). Ficam numa janela pequena própria, presa à principal, que o
// programa mostra só enquanto uma delas está aberta e põe no lugar certo.

let aberto = null; // { tipo: 'tela', tela } | { tipo: 'pasta', pasta, nova } | { tipo: 'painel', painel } | null
let assinaturaPainel = '';
let graficosAbertos = false; // "Gráficos e histórico" aberto continua aberto quando os números atualizam
let removendo = null; // conta com o "Remover" já clicado uma vez: o segundo clique remove (sem caixa de confirmação,
// que tiraria o foco e fecharia o menuzinho)
let alturaAvisada = 0;

// A janela tem a altura do que mostra: avisa o programa quando ela muda.
function avisarTamanho() {
  const el = aberto && (aberto.tipo === 'painel' ? $('#janela-painel') : $('#janela-menu'));
  if (!el || el.hidden) return;
  const altura = el.scrollHeight + 2; // + a borda
  if (altura === alturaAvisada) return;
  alturaAvisada = altura;
  window.p0.tamanho({ altura });
}

function fechar() {
  aberto = null;
  desenhar();
  window.p0.fechar();
}

const duracao = (ms) => {
  const min = Math.floor(ms / 60000);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
};

// Linha do gráfico dos últimos 5 minutos. `minimo` evita que um vaivém pequeno pareça uma montanha.
function grafico(pontos, classe, minimo) {
  if (pontos.length < 2) return '<div class="grafico nota">medindo…</div>';
  const menor = Math.min(...pontos);
  const faixa = Math.max(Math.max(...pontos) - menor, minimo);
  const p = pontos.map((y, i) => `${((i * 270) / (pontos.length - 1)).toFixed(1)},${(29 - ((y - menor) / faixa) * 26).toFixed(1)}`).join(' ');
  return `<svg class="grafico ${classe}" viewBox="0 0 270 32" preserveAspectRatio="none"><polyline points="${p}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}

// O que vai para o histórico da janelinha, em palavras do jogador (o completo fica na planilha das medições).
const HISTORICO = [
  [/^ligada$/, () => 'Ligada'],
  [/^desligada$/, () => 'Desligada'],
  [/^recarregada pelo jogador$/, () => 'Você recarregou'],
  [/^estado: caiu(?: \((.+)\))?/, (m) => 'A página caiu. ' + motivoQueda(m[1])],
  [/^estado: travada/, () => 'Ficou sem responder'],
  [/^estado: erro/, () => 'Erro ao abrir a página'],
  [/^guarda: passou de (\d+) MB \((\d+) MB\); recarregada sozinha/, (m) => `Passou do limite (${fmt(+m[2])} de ${fmt(+m[1], 0, ' MB')}) e foi recarregada sozinha`],
  [/^guarda: passou de (\d+) MB \((\d+) MB\); aviso/, (m) => `Passou do limite: ${fmt(+m[2])} de ${fmt(+m[1], 0, ' MB')}`],
  [/^freio (ligado|desligado)$/, (m) => 'Freio ' + m[1]],
  [/^aliviada/, () => 'Aliviada'],
];
function historico(id) {
  const linhas = [];
  for (const [quando, nota] of [...((E.historico && E.historico[id]) || [])].reverse()) {
    const regra = HISTORICO.find(([re]) => re.test(nota));
    if (regra) linhas.push(`<li><span class="h">${hora(quando)}</span>${esc(regra[1](regra[0].exec(nota)))}</li>`);
    if (linhas.length === 5) break;
  }
  return linhas.length ? `<ul class="historico">${linhas.join('')}</ul>` : '<p class="nota">Nada ainda.</p>';
}

// ---------- menuzinho da tela (as contas dela) e da pasta ----------

const contaDe = (id) => E.contas.find((c) => c.id === id);
const nomesDa = (t) => t.contas.map((id) => (contaDe(id) || {}).nome).join(' + ');
function acharTela(id) {
  for (const p of E.pastas) { const t = p.telas.find((x) => x.id === id); if (t) return { p, t }; }
  return null;
}

// Uma linha por conta da tela: estado, memória, aviso e os botões dela.
function linhaConta(c) {
  const a = alerta(c.id);
  const e = estadoDe(c, a);
  return `<div class="linha-conta" data-conta="${esc(c.id)}">
    ${ini(c, e.bola)}<span class="t"><b>${esc(c.nome)}</b>
      <span class="nota"><span class="${e.classe}">${esc(e.texto)}</span>${c.ligada ? ' · ' + ram(uso(c.id)) + (c.desde ? ' · ligada há ' + duracao(Date.now() - c.desde) : '') : ''}</span></span>
    ${a ? `<div class="aviso-caixa ${a.recarregada ? 'atencao' : 'ruim'}">${esc(textoAlerta(a))} <button data-faz="dispensar">Dispensar</button></div>` : ''}
    <span class="botoes">${c.ligada ? `
      <button data-faz="recarregar" title="Recarrega só esta conta (F5 dentro dela faz o mesmo)">Recarregar</button>
      <button data-faz="som" class="${c.mudo ? '' : 'ligado'}" title="Liga ou desliga o som só desta conta">Som: ${c.mudo ? 'desligado' : 'ligado'}</button>
      <button data-faz="freio" class="${c.freio ? 'ligado' : ''}" title="Com o freio, a conta fora da tela roda devagar e gasta menos">Freio: ${c.freio ? 'ligado' : 'desligado'}</button>
      <button data-faz="desligar" title="Fecha a página e devolve a memória; o login fica guardado">Desligar</button>`
      : '<button class="forte" data-faz="ligar" title="Abre a página de novo; o login continua guardado">Ligar</button>'}
      ${removendo === c.id
        ? '<button class="perigo confirmar" data-faz="remover" title="A conta no jogo não é afetada">Clique de novo para remover (apaga o login guardado neste PC)</button>'
        : '<button class="perigo" data-faz="remover" title="Tira a conta do navegador e apaga o login guardado dela neste PC">Remover</button>'}</span>
    <span class="cores" title="Cor desta conta na lateral e na faixa">${Array.from({ length: CORES }, (_, i) =>
      `<button class="amostra cor${i}${cor(c) === 'cor' + i ? ' escolhida' : ''}" data-cor="${i}" aria-label="Cor ${i + 1}"></button>`).join('')}</span>
  </div>`;
}

function desenharTela(p, t) {
  const cs = t.contas.map(contaDe).filter(Boolean);
  const outras = p.telas.filter((o) => o.id !== t.id);
  const max = E.maxPorTela;
  const graficos = cs.map((c) => {
    const u = uso(c.id);
    const serie = (E.series && E.series[c.id]) || [];
    return `<h4>${esc(c.nome)}</h4>${c.ligada ? `<div class="medida"><span class="nota">Memória, últimos 5 minutos</span><b>${ram(u)} ${cresce(u.cresce)}</b></div>
      ${grafico(serie.map((s) => s[0]), 'ouro', 50)}
      <div class="medida"><span class="nota">Processador</span><b>${fmt(u.cpu, 1, '%')}</b></div>
      ${grafico(serie.map((s) => s[1]), 'azul', 10)}` : ''}
      ${historico(c.id)}`;
  }).join('');
  $('#janela-menu').innerHTML = `<div class="cab-janela"><span class="siglas">${cs.map((c) => ini(c, 'sem')).join('')}</span>
      <span class="t"><b>${esc(nomesDa(t))}</b><span class="nota">${cs.length === 1 ? 'tela com 1 conta' : cs.length + ' contas lado a lado'} · pasta ${esc(p.nome)}</span></span>
      <button class="x" data-fechar title="Fechar (Esc)">✕</button></div>
    ${cs.map(linhaConta).join('')}
    ${outras.length && cs.length < max ? `<h4>Juntar com… (lado a lado nesta tela)</h4><div class="opcoes">${outras.map((o) =>
      `<button data-juntar="${esc(o.id)}"${cs.length + o.contas.length > max ? ` disabled title="No máximo ${max} contas por tela"` : ''}>${esc(nomesDa(o))}</button>`).join('')}</div>` : ''}
    ${cs.length > 1 ? '<h4>Separar</h4><div class="opcoes"><button data-faz="separar">Cada conta numa tela só dela</button></div>' : ''}
    ${E.pastas.length > 1 ? `<h4>Mover para a pasta</h4><div class="opcoes lado">${E.pastas.filter((q) => q.id !== p.id).map((q) =>
      `<button data-mover="${esc(q.id)}">${esc(q.nome)}</button>`).join('')}</div>` : ''}
    <details${graficosAbertos ? ' open' : ''}><summary>Gráficos e histórico</summary>${graficos}</details>`;
}

function desenharPasta(p) {
  const n = p.telas.reduce((s, t) => s + t.contas.length, 0);
  $('#janela-menu').innerHTML = `<div class="cab-janela"><span class="t"><b>Pasta</b><span class="nota">${n === 1 ? '1 conta' : n + ' contas'} em ${p.telas.length === 1 ? '1 tela' : p.telas.length + ' telas'}</span></span>
      <button class="x" data-fechar title="Fechar (Esc)">✕</button></div>
    <label class="linha-form">Nome <input id="nome-pasta" value="${esc(p.nome)}" maxlength="40" aria-label="Nome da pasta"></label>
    <div class="opcoes">
      <button data-faz="ver-todas"${n ? '' : ' disabled'}>Ver as contas da pasta juntas</button>
      <button data-faz="conta-nova">+ Conta nova nesta pasta</button>
      ${!p.telas.length && E.pastas.length > 1 ? '<button data-faz="apagar-pasta" class="perigo">Apagar a pasta (está vazia)</button>' : ''}
    </div>
    <p class="nota">Para levar contas para outra pasta, use "Mover para a pasta" no ⋯ de cada tela.</p>`;
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
  const at = E.alertas && E.alertas.total;
  return `${at ? `<div class="aviso-caixa ruim">O programa todo passou do limite total: ${fmt(at.ram, 0)} de ${fmt(at.limite, 0, ' MB')} às ${hora(at.quando)}.
      Veja abaixo qual conta cresce mais. <button data-dispensar="total">Dispensar</button></div>` : ''}
    <table>
    <thead><tr><th>Conta</th><th>Estado</th><th>Na tela</th><th>Freio</th><th>RAM</th><th>Cresce</th><th>CPU</th>
      <th title="Vezes por segundo que o jogo se desenha">Quadros/s</th><th title="Ritmo dos relógios do jogo: 10/s normal, 1/s freado">Relógios/s</th>
      <th title="Memória do código do jogo">JavaScript</th><th title="Como o Chrome vê a página">Chrome</th></tr></thead>
    <tbody>${linhas.join('')}</tbody></table>
    <div class="linha-botoes">${E.arquivo ? '<button id="abrir-medicoes">Abrir pasta das medições</button>' : ''}
      <span class="nota">Medindo há ${fmt((Date.now() - E.inicio) / 60000, 0)} min; ${E.arquivo ? 'grava a cada 10 s' : 'atualiza a cada 10 s, sem gravar nada no computador'}${E.teste ? ' · modo teste (sem o jogo)' : ''}.</span></div>`;
}

function painelContas() {
  const linhas = E.contas.map((c) => `<div class="linha-form" data-linha="${esc(c.id)}">
      ${ini(c, 'sem')}
      <input data-campo="nome" value="${esc(c.nome)}" maxlength="40" aria-label="Nome da conta">
      <input data-campo="url" value="${esc(c.url)}" aria-label="Endereço do jogo" class="largo">
      <button data-faz="${c.ligada ? 'desligar' : 'ligar'}" title="${c.ligada ? 'Fecha a página e libera a memória; o login fica guardado' : 'Abre a página de novo'}">${c.ligada ? 'Desligar' : 'Ligar'}</button>
      <button data-faz="remover" class="perigo" title="Apaga a conta e o login guardado dela">Remover</button>
    </div>`).join('');
  return `${linhas || '<p class="nota">Nenhuma conta.</p>'}
    <div class="linha-form nova">
      <input id="nova-nome" placeholder="Nome da conta nova" maxlength="40">
      <input id="nova-url" class="largo" placeholder="${esc(E.padrao)}">
      <button id="nova-adicionar" class="forte">+ Adicionar conta</button>
    </div>
    <p class="nota">Cada conta tem o login separado e guardado no seu PC; você entra nela pelo próprio site do jogo.
      Confira o limite de contas do jogo antes de abrir muitas.</p>`;
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
      <span><b>Avisar e esperar meu clique</b> — a conta fica marcada em vermelho e você aperta Recarregar quando quiser.</span></label>
    <label class="opcao"><input type="radio" name="acao" value="recarregar"${g.acao === 'recarregar' ? ' checked' : ''}>
      <span><b>Recarregar sozinho</b> — recarrega só a página daquela conta (no máximo uma vez a cada 10 min). O programa
      nunca entra na conta nem volta à hunt: se o jogo pedir login, espera você.</span></label>
    <label class="linha-form">Limite do programa todo
      <input type="number" data-guarda="avisoTotalMb" value="${g.avisoTotalMb}" min="0" max="${g.max}" step="512"> MB
      <span class="nota">0 = sem limite; aqui ele só avisa</span></label>
    <label class="opcao"><input type="checkbox" data-guarda="notificacoes"${g.notificacoes ? ' checked' : ''}>
      <span>Avisar também no Windows (útil com o programa minimizado)</span></label>
    <p class="nota">A economia de memória (${E.economico.agora ? 'ligada' : 'desligada'}) troca pelo botão <b>Economia</b> na barra de baixo.</p>
    <h3>Ao abrir o programa</h3>
    <label class="opcao"><input type="checkbox" id="abrir-ao-iniciar"${E.abrirAoIniciar ? ' checked' : ''}>
      <span>Abrir as contas sozinho, como um navegador reabrindo as abas. Desmarcado, cada conta espera você clicar nela.</span></label>
    <h3>Sobre</h3>
    <p>HuntDesk versão <b>${esc(E.sobre.versao)}</b> <span class="nota">(motor do Chrome ${esc(E.sobre.chrome)})</span></p>
    <p class="nota">Logins, configurações e um registro curto das quedas de página ficam em ${esc(E.sobre.pasta)}. Desinstalar o programa não apaga essa pasta.</p>
    <div class="linha-botoes"><button id="abrir-dados">Abrir pasta dos dados</button></div>
  </div>`;
}

const PAINEIS = {
  medicoes: ['Medições', painelMedicoes],
  contas: ['Contas', painelContas],
  config: ['Configurações', painelConfig],
};

function desenharPainel() {
  const el = $('#janela-painel');
  const [titulo, fn] = PAINEIS[aberto.painel];
  // Os painéis com campos de texto só são redesenhados quando algo muda de verdade e ninguém está digitando neles.
  const dados = {
    contas: () => E.contas.map((c) => [c.id, c.nome, c.url, c.ligada]),
    config: () => [E.guarda, E.abrirAoIniciar, E.economico, E.sobre],
  };
  const assinatura = aberto.painel === 'medicoes' ? 'medicoes' + Math.random() : aberto.painel + JSON.stringify(dados[aberto.painel]());
  if (assinatura === assinaturaPainel) return;
  if (aberto.painel !== 'medicoes' && el.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
  assinaturaPainel = assinatura;
  el.classList.toggle('largo', aberto.painel === 'medicoes');
  el.innerHTML = `<div class="cab-janela"><h2>${titulo}</h2><button class="x" data-fechar title="Fechar (Esc)">✕</button></div>${fn()}`;
}

function desenhar() {
  const tela = aberto && aberto.tipo === 'tela' && E ? acharTela(aberto.tela) : null;
  const pasta = aberto && aberto.tipo === 'pasta' && E ? E.pastas.find((p) => p.id === aberto.pasta) : null;
  // Tela ou pasta que deixou de existir (juntada, removida, apagada): a janelinha fecha.
  if (aberto && E && ((aberto.tipo === 'tela' && !tela) || (aberto.tipo === 'pasta' && !pasta))) return fechar();
  const menu = $('#janela-menu');
  menu.hidden = !(tela || pasta);
  $('#janela-painel').hidden = !(aberto && aberto.tipo === 'painel' && E);
  // Ninguém digitando no nome da pasta: aí pode redesenhar.
  const digitando = menu.contains(document.activeElement) && document.activeElement.tagName === 'INPUT';
  if (tela) desenharTela(tela.p, tela.t);
  else if (pasta && !digitando) desenharPasta(pasta);
  else if (aberto && aberto.tipo === 'painel' && E) desenharPainel();
  avisarTamanho();
}

window.p0.aoAbrir((dados) => {
  aberto = dados;
  removendo = null;
  assinaturaPainel = '';
  alturaAvisada = 0;
  desenhar();
  // Pasta que acabou de ser criada: o nome já fica escolhido para trocar.
  if (dados && dados.tipo === 'pasta' && dados.nova && $('#nome-pasta')) { $('#nome-pasta').focus(); $('#nome-pasta').select(); }
});
window.addEventListener('resize', avisarTamanho);
// Abrir ou fechar "Gráficos e histórico" muda a altura (o evento não sobe pela página: escuta na descida).
document.addEventListener('toggle', (ev) => {
  if (ev.target.closest && ev.target.closest('#janela-menu')) graficosAbertos = ev.target.open;
  avisarTamanho();
}, true);
window.p0.aoEstado((estado) => { E = estado; desenhar(); });

// ---------- cliques ----------

document.addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (!b || !E) return;
  if (b.hasAttribute('data-fechar')) return fechar();
  if (b.dataset.dispensar) return acao('guarda:dispensar', { id: b.dataset.dispensar });
  if (b.closest('#janela-menu')) {
    const f = b.dataset.faz;
    const linhaConta = b.closest('[data-conta]');
    if (linhaConta) {
      const c = contaDe(linhaConta.dataset.conta);
      if (!c) return;
      if (f === 'remover') {
        if (removendo !== c.id) { removendo = c.id; return desenhar(); }
        removendo = null;
        return acao('conta:remover', { id: c.id });
      }
      removendo = null;
      if (b.dataset.cor) return acao('conta:cor', { id: c.id, cor: Number(b.dataset.cor) });
      if (f === 'recarregar') return acao('conta:recarregar', { id: c.id });
      if (f === 'som') return acao('conta:som', { id: c.id, ligado: c.mudo });
      if (f === 'freio') return acao('conta:freio', { id: c.id, ligado: !c.freio });
      if (f === 'desligar') return acao('conta:desligar', { id: c.id });
      if (f === 'ligar') return acao('conta:mostrar', { id: c.id });
      if (f === 'dispensar') return acao('guarda:dispensar', { id: c.id });
      return;
    }
    if (aberto.tipo === 'tela') {
      if (b.dataset.juntar) return acao('tela:juntar', { tela: aberto.tela, com: b.dataset.juntar });
      // Separar e mover mudam a lateral: o menuzinho, ao lado da linha de antes, fecha.
      if (f === 'separar') { acao('tela:separar', { tela: aberto.tela }); return fechar(); }
      if (b.dataset.mover) { acao('tela:mover', { tela: aberto.tela, para: b.dataset.mover }); return fechar(); }
      return;
    }
    const pasta = aberto.pasta;
    if (f === 'ver-todas') { acao('tela:ver', { pasta, tela: 'todas' }); return fechar(); }
    if (f === 'conta-nova') { acao('conta:adicionar', { pasta, url: E.padrao }); return fechar(); }
    if (f === 'apagar-pasta') { acao('pasta:apagar', { id: pasta }); return fechar(); }
    return;
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
  if (b.id === 'abrir-medicoes') return window.p0.abrirMedicoes();
  if (b.id === 'abrir-dados') return window.p0.abrirDados();
  if (b.id === 'nova-adicionar') {
    const url = $('#nova-url').value.trim();
    acao('conta:adicionar', { nome: $('#nova-nome').value, url: url || E.padrao });
    $('#nova-nome').value = '';
    $('#nova-url').value = '';
  }
});

// Campos de nome e endereço: valem quando você sai do campo ou aperta Enter.
document.addEventListener('change', (ev) => {
  const el = ev.target;
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
  if (el.id === 'nome-pasta' && aberto && aberto.tipo === 'pasta') return acao('pasta:renomear', { id: aberto.pasta, nome: el.value });
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && aberto) return fechar();
  if (ev.key === 'Enter' && ev.target.tagName === 'INPUT') ev.target.blur();
});
