'use strict';
// Janelinhas por cima das contas: o menuzinho de uma tela ou de uma pasta (o ⋯ ou o botão direito na lateral) e a
// janela de Configurações (Menu ▴), com as seções Geral, Contas, Memória, Extensões, Cópia e Sobre. Ficam numa janela
// pequena própria, presa à principal, que o programa mostra só enquanto uma delas está aberta e põe no lugar certo.

let aberto = null; // { tipo: 'tela', tela } | { tipo: 'pasta', pasta, nova } | { tipo: 'painel', painel: seção } | null
let assinaturaPainel = ''; // o que a seção aberta mostra agora ('' = desenhar de novo)
let navDesenhada = '';
let secaoDesenhada = '';
// O que está aberto dentro da janela de Configurações (volta ao começo cada vez que ela abre).
let cfgUI = { saiba: new Set(), detalhes: false, editando: null, nova: false, urlNova: '', erroNova: '' };
const ALTURA_CONFIG = 580; // a janela de Configurações tem tamanho fixo: a lateral fica parada e a seção rola
let graficosAbertos = false; // "Gráficos e histórico" aberto continua aberto quando os números atualizam
let erroUrl = ''; // o que está errado no endereço colado em "Adicionar conta"
let urlDigitada = ''; // o endereço colado, para não sumir quando a janelinha mostra o erro
let removendo = null; // conta com o "Remover" já clicado uma vez: o segundo clique remove (sem caixa de confirmação,
// que tiraria o foco e fecharia o menuzinho)
let alturaAvisada = 0;
// Cópia das configurações (seção Cópia): o que o jogador marcou, o último aviso e o arquivo escolhido para
// importar (o que o programa respondeu ao conferir). As senhas ficam só nos campos e nunca são redesenhadas.
let copiaUI = { levar: false, aviso: '', ruim: false, importando: null, ocupado: false };

// A janela tem a altura do que mostra: avisa o programa quando ela muda.
function avisarTamanho() {
  const el = aberto && (aberto.tipo === 'painel' ? $('#janela-painel') : $('#janela-menu'));
  if (!el || el.hidden) return;
  const altura = aberto.tipo === 'painel' ? ALTURA_CONFIG : el.scrollHeight + 2; // + a borda
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
    ${ini(c, e.bola)}<span class="t"><input class="nome-conta" data-renomear="${esc(c.id)}" value="${esc(c.nome)}" maxlength="40"
        aria-label="Nome da conta" title="Clique para trocar o nome; Enter guarda">
      <span class="nota"><span class="site">${esc(c.site)}</span> · <span class="${e.classe}">${esc(e.texto)}</span>${c.ligada ? ' · ' + ram(uso(c.id)) + (c.desde ? ' · ligada há ' + duracao(Date.now() - c.desde) : '') : ''}</span></span>
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
      <button data-faz="conta-nova">+ Adicionar conta nesta pasta</button>
      ${!p.telas.length && E.pastas.length > 1 ? '<button data-faz="apagar-pasta" class="perigo">Apagar a pasta (está vazia)</button>' : ''}
    </div>
    <p class="nota">Para levar contas para outra pasta, use "Mover para a pasta" no ⋯ de cada tela.</p>`;
}

// Adicionar conta: mais uma do jogo da pasta, num clique, ou outro jogo pelo endereço (só https).
const urlDaPasta = (p) => (p.telas.flatMap((t) => t.contas).map(contaDe).find(Boolean) || {}).url;
function desenharContaNova(p) {
  const url = urlDaPasta(p);
  $('#janela-menu').innerHTML = `<div class="cab-janela"><span class="t"><b>Adicionar conta</b><span class="nota">pasta ${esc(p.nome)}</span></span>
      <button class="x" data-fechar title="Fechar (Esc)">✕</button></div>
    ${url ? `<div class="opcoes"><button data-faz="mesmo-jogo">Mais uma conta deste jogo <span class="nota">${esc(siteDe(url))}</span></button></div>
      <h4>Outro jogo</h4>` : '<h4>Endereço do jogo</h4>'}
    <div class="linha-form"><input id="url-jogo" value="${esc(urlDigitada)}" placeholder="https://site-do-jogo.com" aria-label="Endereço do jogo"></div>
    <div class="linha-botoes"><button class="forte" data-faz="adicionar-url">Adicionar</button></div>
    ${erroUrl ? `<p class="ruim">${esc(erroUrl)}</p>` : ''}
    <p class="nota">Cole o endereço da página do jogo. A conta nova abre com o login separado e cai na pasta daquele site.
      Quem entra no jogo é sempre você. Só as contas do Huntera mandam dados para o app do HuntDesk.</p>`;
}

// Confere o endereço colado; devolve o motivo do erro, ou '' se estiver certo.
function problemaDoEndereco(url) {
  let u;
  try { u = new URL(url); } catch (e) { return 'Esse endereço não parece certo. Copie da barra do navegador, começando com https://'; }
  if (u.protocol !== 'https:') return 'Só endereços com https://: sem ele, a senha do jogo viaja sem proteção.';
  return '';
}

// ---------- janela de Configurações: peças ----------

// Chave de ligar e desligar.
const chave = (ligada, attrs, rotulo) => `<button class="chave${ligada ? ' on' : ''}" role="switch" aria-checked="${!!ligada}" aria-label="${esc(rotulo)}" ${attrs}></button>`;
const saibaMais = (id) => `<button class="saiba" data-saiba="${id}">${cfgUI.saiba.has(id) ? 'menos' : 'saiba mais'}</button>`;
// Uma opção: nome, frase curta, o controle à direita e a explicação longa atrás do "saiba mais".
function opcao(nome, curto, controle, longo, id) {
  return `<div class="linha"><div class="txt"><b>${nome}</b><small>${curto}${longo ? ' ' + saibaMais(id) : ''}</small></div>${controle}</div>
    ${longo && cfgUI.saiba.has(id) ? `<p class="longo">${longo}</p>` : ''}`;
}
const grupo = (titulo, dentro) => `<div class="grupo"><h3>${titulo}</h3>${dentro}</div>`;

// ---------- seções ----------

function secaoGeral() {
  return grupo('Ao abrir o programa', opcao('Abrir as contas sozinho', 'Como um navegador reabrindo as abas.',
      chave(E.abrirAoIniciar, 'data-chave="abrir-ao-iniciar"', 'Abrir as contas sozinho'),
      'Desligado, cada conta espera você clicar nela. O programa nunca entra em conta nenhuma: quem faz o login é sempre você.', 'abrir'))
    + grupo('Desempenho', opcao('Modo economia', 'Menos memória, imagem um pouco mais simples.',
      chave(E.economico.agora, 'data-chave="economia"', 'Modo economia'),
      'Para computador com pouca memória. Ao trocar, o HuntDesk fecha e abre de novo; as contas recarregam e os logins ficam guardados. É o mesmo botão <b>Economia</b> da barra de baixo.', 'economia'))
    + grupo('Avisos', opcao('Avisar também no Windows', 'Útil com o programa minimizado.',
      chave(E.guarda.notificacoes, 'data-chave="notificacoes"', 'Avisar também no Windows'),
      'Quando uma conta passa do limite de memória (ou é recarregada por isso), aparece um aviso do Windows no canto da tela, além da marca na conta.', 'avisos'));
}

function secaoContas() {
  const linha = (c) => {
    const edita = cfgUI.editando === c.id;
    return `<div class="linha" data-linha="${esc(c.id)}">${ini(c, 'sem')}<div class="txt"><b>${esc(c.nome)}</b><small>${esc(c.site)}</small></div>
        <small class="nota">${c.ligada ? 'ligada' : 'desligada'}</small>
        ${chave(c.ligada, `data-faz="${c.ligada ? 'desligar' : 'ligar'}" title="${c.ligada ? 'Desligar fecha a página e libera a memória; o login fica guardado' : 'Ligar abre a página de novo'}"`, c.nome + ' ligada')}
        <button data-faz="editar">${edita ? 'Pronto' : 'Editar'}</button></div>
      ${edita ? `<div class="abre" data-linha="${esc(c.id)}">
        <input data-campo="nome" value="${esc(c.nome)}" maxlength="40" aria-label="Nome da conta" title="Nome da conta; Enter guarda">
        <input data-campo="url" value="${esc(c.url)}" aria-label="Endereço do jogo" class="largo" title="Endereço do jogo; Enter guarda">
        ${removendo === c.id
          ? '<button data-faz="remover" class="perigo confirmar">Clique de novo para remover (apaga o login guardado neste PC)</button>'
          : '<button data-faz="remover" class="perigo" title="Tira a conta do navegador e apaga o login guardado dela neste PC">Remover conta</button>'}</div>` : ''}`;
  };
  const pastas = E.pastas.map((p) => {
    const cs = p.telas.flatMap((t) => t.contas).map(contaDe).filter(Boolean);
    return cs.length ? grupo(esc(p.nome), cs.map(linha).join('')) : '';
  }).join('');
  return `${pastas || '<p class="nota">Nenhuma conta ainda.</p>'}
    <div class="botoes"><button id="nova-conta" class="forte">+ Adicionar conta</button>
      <span class="nota">Qualquer jogo de navegador serve. ${saibaMais('contas')}</span></div>
    ${cfgUI.nova ? `<div class="abre"><input id="nova-url" class="largo" value="${esc(cfgUI.urlNova)}" placeholder="${esc(E.padrao)}" aria-label="Endereço do jogo">
      <button id="nova-adicionar" class="forte">Adicionar</button></div>${cfgUI.erroNova ? `<p class="ruim">${esc(cfgUI.erroNova)}</p>` : ''}` : ''}
    ${cfgUI.saiba.has('contas') ? `<p class="longo">Cole o endereço da página do jogo, começando com https://. A conta nova cai na pasta
      daquele site, com o login separado. Desligar uma conta fecha a página e libera a memória; o login fica guardado. Remover apaga a
      conta e o login dela deste PC (a conta no jogo não é afetada). Confira o limite de contas do jogo antes de abrir muitas.</p>` : ''}`;
}

// A tabela completa das medições (os números que a barra de cada conta resume).
function tabelaMedicoes() {
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
  return `<div class="tabela"><table>
    <thead><tr><th>Conta</th><th>Estado</th><th>Na tela</th><th>Freio</th><th>RAM</th><th>Cresce</th><th>CPU</th>
      <th title="Vezes por segundo que o jogo se desenha">Quadros/s</th><th title="Ritmo dos relógios do jogo: 10/s normal, 1/s freado">Relógios/s</th>
      <th title="Memória do código do jogo">JavaScript</th><th title="Como o Chrome vê a página">Chrome</th></tr></thead>
    <tbody>${linhas.join('')}</tbody></table></div>
    <div class="botoes">${E.arquivo ? '<button id="abrir-medicoes">Abrir pasta das medições</button>' : ''}
      <span class="nota">${E.arquivo ? 'Grava a cada 10 s' : 'Atualiza a cada 10 s, sem gravar nada no computador'}${E.teste ? ' · modo teste (sem o jogo)' : ''}.</span></div>`;
}

// Uma barra por conta: verde, amarela perto do limite (80%) e vermelha acima dele. O risco marca o limite.
function barraDaConta(c) {
  const lim = E.guarda.limiteMb;
  const u = uso(c.id);
  const a = alerta(c.id);
  let cls = 'bom';
  let selo = 'tudo certo';
  if (!c.ligada) [cls, selo] = ['off', 'desligada'];
  else if (c.estado === 'caiu') [cls, selo] = ['ruim', 'caiu'];
  else if (a && a.recarregada) [cls, selo] = ['atencao', 'recarregada'];
  else if (a || (u.ram != null && u.ram >= lim)) [cls, selo] = ['ruim', 'passou'];
  else if (u.ram == null) [cls, selo] = ['off', 'medindo…'];
  else if (u.ram >= lim * 0.8) [cls, selo] = ['atencao', 'perto'];
  // A barra inteira vale 125% do limite; a largura é posta depois de desenhar (a página não aceita estilo escrito no HTML).
  const largura = c.ligada && u.ram != null ? Math.min(100, Math.round((u.ram / (lim * 1.25)) * 100)) : 0;
  return `<div class="mem" data-mem="${esc(c.id)}" title="${a ? esc(textoAlerta(a)) : ''}">${ini(c, 'sem')}<span class="nome">${esc(c.nome)}</span>
    <div class="trilho"><i class="${cls}" data-largura="${largura}"></i><u></u></div>
    <span class="mb">${c.ligada ? fmt(u.ram, 0, ' MB') : '—'}</span><span class="selo ${cls}">${selo}</span></div>`;
}

function secaoMemoria() {
  const g = E.guarda;
  const at = E.alertas && E.alertas.total;
  const t = E.amostra && E.amostra.total;
  const avisos = E.contas.filter((c) => alerta(c.id)).map((c) => `<div class="aviso-caixa ${alerta(c.id).recarregada ? 'atencao' : 'ruim'}"><b>${esc(c.nome)}:</b>
    ${esc(textoAlerta(alerta(c.id)))} <button data-dispensar="${esc(c.id)}">Dispensar</button></div>`).join('');
  return `${at ? `<div class="aviso-caixa ruim">O programa todo passou do limite total: ${fmt(at.ram, 0)} de ${fmt(at.limite, 0, ' MB')} às ${hora(at.quando)}.
      Veja abaixo qual conta usa mais. <button data-dispensar="total">Dispensar</button></div>` : ''}${avisos}
    ${grupo('Agora', `${E.contas.map(barraDaConta).join('') || '<p class="nota">Nenhuma conta ainda.</p>'}
      <div class="legenda"><span><i class="bom"></i>tudo certo</span><span><i class="atencao"></i>perto do limite</span>
        <span><i class="ruim"></i>passou do limite</span><span><u></u>limite por conta (${fmt(g.limiteMb, 0, ' MB')})</span></div>
      <div class="botoes"><span class="nota cresce">Programa todo: <b>${t ? gb(t.ram) : 'medindo…'}</b> · medindo há ${fmt((Date.now() - E.inicio) / 60000, 0)} min</span>
        <button id="detalhes-memoria">${cfgUI.detalhes ? 'Esconder detalhes' : 'Detalhes'}</button></div>
      ${cfgUI.detalhes ? tabelaMedicoes() : ''}`)}
    ${grupo('Guarda de memória', opcao('Limite por conta', 'Perto dele (80%) a conta fica amarela; acima, vermelha.',
        `<input type="number" class="num" data-guarda="limiteMb" value="${g.limiteMb}" min="${g.min}" max="${g.max}" step="128" aria-label="Limite por conta, em MB"><span class="nota">MB</span>`)
      + opcao('Quando uma conta passar do limite', 'O programa nunca entra na conta nem volta à hunt.',
        `<div class="escolha"><button data-guarda-acao="avisar" class="${g.acao === 'avisar' ? 'aqui' : ''}">Só avisar</button><button data-guarda-acao="recarregar" class="${g.acao === 'recarregar' ? 'aqui' : ''}">Recarregar sozinho</button></div>`,
        '<b>Só avisar:</b> a conta fica marcada em vermelho e você aperta Recarregar quando quiser. <b>Recarregar sozinho:</b> recarrega só a página daquela conta, no máximo uma vez a cada 10 min. Se o jogo pedir login depois disso, o programa espera você.', 'limite')
      + opcao('Limite do programa todo', '0 = sem limite. Aqui ele só avisa.',
        `<input type="number" class="num" data-guarda="avisoTotalMb" value="${g.avisoTotalMb}" min="0" max="${g.max}" step="512" aria-label="Limite do programa todo, em MB"><span class="nota">MB</span>`))}`;
}

function secaoSobre() {
  return grupo('Programa', `<div class="linha"><div class="txt"><b>HuntDesk versão ${esc(E.sobre.versao)}</b><small>motor do Chrome ${esc(E.sobre.chrome)}</small></div></div>`)
    + grupo('Seus dados', opcao('Pasta dos dados', 'Logins, configurações e um registro curto das quedas de página.',
      '<button id="abrir-dados">Abrir pasta</button>', `Fica em ${esc(E.sobre.pasta)}. Desinstalar o programa não apaga essa pasta.`, 'dados'));
}

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

function secaoCopia() {
  const u = copiaUI;
  const aviso = `<p id="copia-aviso" class="${u.ruim ? 'ruim' : 'nota'}"${u.aviso ? '' : ' hidden'}>${esc(u.aviso)}</p>`;
  const i = u.importando;
  if (i) {
    return `<div class="caixa-copia">
      <p><b>${esc(i.arquivo)}</b>: ${plural(i.pastas, 'pasta', 'pastas')} e ${plural(i.contas, 'conta', 'contas')}. Elas são somadas às
        suas (conta igual não se repete) e as opções passam a ser as do arquivo.</p>
      ${i.logins ? `<p>Este arquivo traz os logins. Digite a senha escolhida quando ele foi exportado:</p>
      <div class="abre"><input type="password" id="copia-senha-abrir" placeholder="Senha da cópia" autocomplete="off"></div>` : ''}
      <div class="botoes">${i.logins
        ? '<button id="copia-confirmar" class="forte">Importar com os logins</button><button id="copia-sem-logins">Importar sem os logins</button>'
        : '<button id="copia-confirmar" class="forte">Importar</button>'}<button id="copia-cancelar">Cancelar</button></div>
      ${aviso}
    </div>`;
  }
  return grupo('Exportar', `${opcao('Levar também os logins', 'Trancados com uma senha que você escolhe.',
        chave(u.levar, 'id="copia-levar"', 'Levar também os logins'),
        'Sem os logins, no outro PC é só entrar de novo em cada conta. Alguns sites, como o login pelo Google, podem pedir para entrar de novo mesmo levando os logins.', 'logins')}
      ${u.levar ? `<div id="copia-senhas"><p class="aviso-caixa atencao">Quem tiver o arquivo <b>e</b> a senha entra nas suas contas: guarde os dois com cuidado.
          Se esquecer a senha, os logins do arquivo não abrem mais (o resto dá para importar).</p>
        <div class="abre"><input type="password" id="copia-senha" placeholder="Senha (mínimo 8)" autocomplete="new-password">
          <input type="password" id="copia-senha2" placeholder="Repita a senha" autocomplete="new-password"></div></div>` : ''}
      <div class="botoes"><button id="copia-exportar" class="forte">Exportar…</button>
        <span class="nota">Guarda as pastas, as telas, as contas (nome, cor e endereço) e as opções num arquivo.</span></div>`)
    + grupo('Importar', `<div class="linha"><div class="txt"><b>Trazer de um arquivo</b><small>Soma ao que já existe: nada é apagado e conta igual não se repete.</small></div>
        <button id="copia-importar">Importar…</button></div>`)
    + aviso;
}

const ERROS_COPIA = {
  'senha-curta': 'A senha precisa ter pelo menos 8 letras ou números.',
  arquivo: 'Este arquivo não é uma cópia do HuntDesk (ou está estragado).',
  versao: 'Esta cópia foi feita por uma versão mais nova do HuntDesk. Atualize o programa e tente de novo.',
  senha: 'Senha errada. Confira e tente de novo, ou importe sem os logins.',
};
const erroCopia = (r) => ERROS_COPIA[r.erro] || 'Não deu certo. Tente de novo; se continuar, avise no chat.';

// Muda o aviso (e, se pedir, redesenha o painel; senão só o texto, para não apagar o que está nos campos).
function avisoCopia(texto, ruim, redesenhar) {
  copiaUI.aviso = texto;
  copiaUI.ruim = !!ruim;
  // O painel não se redesenha com o cursor num campo: sai dele antes (as senhas digitadas não ficam).
  if (redesenhar) { if (document.activeElement) document.activeElement.blur(); assinaturaPainel = ''; desenhar(); return; }
  const el = $('#copia-aviso');
  if (el) { el.textContent = texto; el.className = ruim ? 'ruim' : 'nota'; el.hidden = !texto; }
  avisarTamanho();
}

async function pedirCopia(tipo, dados, esperando) {
  const botoes = (desligar) => document.querySelectorAll('button[id^="copia-"]').forEach((el) => { el.disabled = desligar; });
  copiaUI.ocupado = true;
  botoes(true);
  if (esperando) avisoCopia(esperando, false);
  let r;
  try { r = await window.p0.copia(tipo, dados); } catch (e) { r = { erro: 'falha' }; }
  copiaUI.ocupado = false;
  botoes(false);
  return r || { erro: 'falha' };
}

async function cliqueCopia(id) {
  if (copiaUI.ocupado) return;
  if (id === 'copia-levar') {
    copiaUI.levar = !copiaUI.levar;
    avisoCopia('', false, true);
    if (copiaUI.levar && $('#copia-senha')) $('#copia-senha').focus();
    return;
  }
  if (id === 'copia-exportar') {
    const senha = copiaUI.levar ? $('#copia-senha').value : '';
    if (copiaUI.levar && senha.length < 8) return avisoCopia(ERROS_COPIA['senha-curta'], true);
    if (copiaUI.levar && senha !== $('#copia-senha2').value) return avisoCopia('As duas senhas não são iguais.', true);
    const r = await pedirCopia('exportar', { senha }, copiaUI.levar ? 'Juntando os logins…' : '');
    if (r.cancelado) return avisoCopia('', false);
    if (r.erro) return avisoCopia(erroCopia(r), true);
    copiaUI.levar = false;
    return avisoCopia(`Cópia guardada: ${r.arquivo} (${plural(r.contas, 'conta', 'contas')}, ${r.logins ? 'com' : 'sem'} os logins).`, false, true);
  }
  if (id === 'copia-importar') {
    const r = await pedirCopia('escolher', {});
    if (r.cancelado) return avisoCopia('', false);
    if (r.erro) return avisoCopia(erroCopia(r), true);
    copiaUI.importando = r;
    avisoCopia('', false, true);
    if ($('#copia-senha-abrir')) $('#copia-senha-abrir').focus();
    return;
  }
  if (id === 'copia-cancelar') {
    copiaUI.importando = null;
    window.p0.copia('cancelar', {});
    return avisoCopia('', false, true);
  }
  if (id === 'copia-confirmar' || id === 'copia-sem-logins') {
    const campo = $('#copia-senha-abrir');
    const senha = id === 'copia-confirmar' && campo ? campo.value : '';
    if (id === 'copia-confirmar' && campo && !senha) return avisoCopia('Digite a senha da cópia (ou importe sem os logins).', true);
    const r = await pedirCopia('importar', { senha }, senha ? 'Abrindo os logins…' : '');
    if (r.erro === 'senha') { if (campo) { campo.value = ''; campo.focus(); } return avisoCopia(erroCopia(r), true); }
    copiaUI.importando = null;
    if (r.erro) return avisoCopia(erroCopia(r), true, true);
    let texto = r.novas
      ? `Vieram ${plural(r.novas, 'conta', 'contas')}${r.iguais ? ` (${plural(r.iguais, 'já estava', 'já estavam')} aqui)` : ''}${r.comLogin ? `, ${r.comLogin} já com o login` : ''}. Elas estão na lateral: clique numa tela para abrir.`
      : 'Nada novo: as contas do arquivo já estavam aqui. As opções do arquivo passaram a valer.';
    if (r.reabre) texto += ' O programa vai reabrir para usar o modo de economia do arquivo.';
    if (r.extensoesFaltando) texto += ` ${plural(r.extensoesFaltando, 'extensão veio', 'extensões vieram')} na lista e falta instalar: veja a seção Extensões.`;
    return avisoCopia(texto, false, true);
  }
}

// ---------- extensões de terceiros ----------

const extUI = { prep: null, aviso: '', ruim: false, ocupado: false, removendo: null };
const ORIGEM = { loja: 'da Chrome Web Store', pasta: 'de uma pasta' };

function secaoExtensoes() {
  const p = extUI.prep;
  const aviso = `<p id="ext-aviso" class="${extUI.ruim ? 'ruim' : 'nota'}"${extUI.aviso ? '' : ' hidden'}>${esc(extUI.aviso)}</p>`;
  if (p) {
    const lista = (frases) => `<ul class="ext-frases">${frases.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`;
    return `<div class="caixa-copia">
      <p><b>${esc(p.nome)}</b> <span class="nota">versão ${esc(p.versao)} · ${ORIGEM[p.origem]}</span></p>
      ${p.descricao ? `<p class="nota">${esc(p.descricao)}</p>` : ''}
      <h4>O que ela pede</h4>${p.pede.length ? lista(p.pede) : '<p class="nota">Nada além de guardar as próprias escolhas.</p>'}
      ${p.naoFunciona.length ? `<h4>Provavelmente não funciona aqui</h4>${lista(p.naoFunciona)}` : ''}
      <p class="aviso-caixa atencao">Uma extensão de terceiros pode ler tudo nas contas onde estiver ligada, inclusive o login.
        Extensões que jogam sozinhas (bot, macro, clique automático) vão contra as regras dos jogos e podem dar banimento.
        O HuntDesk não joga por você: a escolha é sua.</p>
      <label class="opcao"><input type="checkbox" id="ext-entendi"><span>Entendi</span></label>
      <div class="botoes"><button id="ext-instalar" class="forte" disabled>Instalar</button><button id="ext-cancelar">Cancelar</button></div>
      ${aviso}
    </div>`;
  }
  const itens = (E.extensoes || []).map((x) => {
    const contas = E.pastas.map((pa) => {
      const cs = pa.telas.flatMap((t) => t.contas).map(contaDe).filter(Boolean);
      if (!cs.length) return '';
      return `<div class="fichas"><span class="de">${esc(pa.nome)}:</span>
        ${cs.map((c) => { const on = x.contas.includes(c.id); return `<button class="ficha${on ? ' on' : ''}" data-ext-conta="${esc(c.id)}" aria-pressed="${on}">${esc(c.nome)}</button>`; }).join('')}
        <button class="todas" data-ext-todas="${esc(pa.id)}" title="Liga esta extensão em todas as contas desta pasta">todas desta pasta</button></div>`;
    }).join('');
    return `<div class="ext-item" data-ext="${esc(x.id)}">
      <div class="topo"><div class="txt"><b>${esc(x.nome)}</b><small>${x.pendente ? '' : 'versão ' + esc(x.versao) + ' · '}de terceiros · ${ORIGEM[x.origem]}${
        x.pendente ? '<span class="atencao"> · veio da cópia das configurações e falta instalar neste PC</span>' : ''}</small></div>
        ${x.pendente ? `<button data-ext-faz="instalar" class="forte">${x.origem === 'loja' ? 'Instalar da loja' : 'Escolher a pasta…'}</button>` : ''}
        ${x.telinha ? '<button data-ext-faz="telinha" title="A tela que no Chrome abre pelo ícone dela">Abrir a tela dela</button>' : ''}
        ${extUI.removendo === x.id ? '' : '<button data-ext-faz="remover" class="perigo">Remover</button>'}</div>
      ${extUI.removendo === x.id ? '<div class="botoes"><button data-ext-faz="remover" class="perigo confirmar">Clique de novo para remover (apaga o que ela guardou nas contas)</button></div>' : ''}
      ${contas || '<p class="nota">Nenhuma conta ainda.</p>'}
      <p class="nota">Liga só nas contas em dourado. Clique numa conta para ligar ou desligar.</p>
    </div>`;
  }).join('');
  const h = E.leitura || {};
  return grupo('Do HuntDesk', `<div class="linha"><div class="txt"><b>Extensão HuntDesk</b><small>Lê a sua hunt no Huntera e manda para o app do HuntDesk.
        ${h.ligada ? '<span class="bom">Ligada ao app.</span>' : 'Ainda não ligada ao app.'}</small></div>
      <button id="abrir-huntdesk"${h.disponivel ? '' : ' disabled'} title="A janela da extensão, onde você liga ou desliga a leitura">Abrir</button></div>`)
    + grupo('De terceiros', `<div class="abre"><input id="ext-link" class="largo" placeholder="Cole o link da extensão na Chrome Web Store">
        <button id="ext-buscar" class="forte">Buscar na loja</button><button id="ext-pasta">Escolher pasta…</button></div>
      <p class="aviso-caixa atencao">Uma extensão de terceiros pode ler tudo nas contas onde estiver ligada, inclusive o login. ${saibaMais('ext')}</p>
      ${cfgUI.saiba.has('ext') ? `<p class="longo">Cada extensão liga só nas contas que você marcar, nunca no app do HuntDesk. Extensões que jogam
        sozinhas (bot, macro, clique automático) vão contra as regras dos jogos e podem dar banimento. O HuntDesk não joga por você: a escolha é sua.</p>` : ''}
      ${aviso}
      ${itens || '<p class="nota">Nenhuma extensão de terceiros instalada.</p>'}`);
}

function avisoExt(texto, ruim) {
  extUI.aviso = texto;
  extUI.ruim = !!ruim;
  if (document.activeElement) document.activeElement.blur();
  assinaturaPainel = '';
  navDesenhada = ''; // pedirExt desliga todos os botões da janela, os da lateral também: desenha de novo
  desenhar();
}

async function pedirExt(tipo, dados, esperando) {
  if (extUI.ocupado) return null;
  extUI.ocupado = true;
  document.querySelectorAll('#janela-painel button').forEach((el) => { el.disabled = true; });
  if (esperando) { const el = $('#ext-aviso'); if (el) { el.textContent = esperando; el.className = 'nota'; el.hidden = false; avisarTamanho(); } }
  let r;
  try { r = await window.p0.extensoes(tipo, dados); } catch (e) { r = { erro: 'falha' }; }
  extUI.ocupado = false;
  return r || { erro: 'falha' };
}

const erroExt = (r) => (r.erro === 'sem-conta' ? 'Ligue antes uma das contas marcadas: a tela dela abre numa conta onde ela está ligada.'
  : r.erro === 'sem-telinha' ? 'Esta extensão não tem uma tela para abrir.'
  : 'Não deu certo' + (r.texto ? ': ' + r.texto : '.'));

async function cliqueExt(b) {
  if (b.id === 'ext-buscar' || b.id === 'ext-pasta' || b.dataset.extFaz === 'instalar') {
    const item = b.closest('[data-ext]');
    const x = item && (E.extensoes || []).find((e) => e.id === item.dataset.ext);
    const pasta = b.id === 'ext-pasta' || (x && x.origem === 'pasta');
    const link = x ? x.id : ($('#ext-link') || {}).value || '';
    if (!pasta && !link.trim()) return avisoExt('Cole o link da extensão na Chrome Web Store.', true);
    const r = await pedirExt(pasta ? 'pasta' : 'preparar', { link, para: x ? x.id : null }, pasta ? '' : 'Baixando da loja e conferindo a assinatura…');
    if (!r) return;
    if (r.cancelado) return avisoExt('', false);
    if (r.erro) return avisoExt(erroExt(r), true);
    extUI.prep = r;
    return avisoExt('', false);
  }
  if (b.id === 'ext-cancelar') { extUI.prep = null; window.p0.extensoes('cancelar', {}); return avisoExt('', false); }
  if (b.id === 'ext-instalar') {
    const r = await pedirExt('instalar', { entendi: !!($('#ext-entendi') && $('#ext-entendi').checked) });
    if (!r) return;
    if (r.erro) return avisoExt(r.erro === 'entendi' ? 'Marque "Entendi" para instalar.' : erroExt(r), true);
    extUI.prep = null;
    return avisoExt(`${r.nome} instalada. Marque abaixo as contas onde ela deve ligar.`, false);
  }
  const item = b.closest('[data-ext]');
  if (!item) return;
  const id = item.dataset.ext;
  if (b.dataset.extConta) {
    b.classList.toggle('on');
    return trocarContasExt(id, [...item.querySelectorAll('[data-ext-conta].on')].map((c) => c.dataset.extConta));
  }
  if (b.dataset.extTodas) {
    const pa = E.pastas.find((p) => p.id === b.dataset.extTodas);
    const x = (E.extensoes || []).find((e) => e.id === id);
    if (!pa || !x) return;
    return trocarContasExt(id, [...new Set([...x.contas, ...pa.telas.flatMap((t) => t.contas)])]);
  }
  if (b.dataset.extFaz === 'telinha') {
    const r = await pedirExt('telinha', { id });
    if (!r) return;
    return avisoExt(r.erro ? erroExt(r) : '', !!r.erro);
  }
  if (b.dataset.extFaz === 'remover') {
    if (extUI.removendo !== id) { extUI.removendo = id; return avisoExt('', false); }
    extUI.removendo = null;
    const r = await pedirExt('remover', { id });
    if (!r) return;
    return avisoExt(r.erro ? erroExt(r) : 'Extensão removida. Nas contas abertas, o que ela já tinha posto na página sai com F5.', !!r.erro);
  }
}

async function trocarContasExt(id, contas) {
  const r = await pedirExt('contas', { id, contas });
  if (!r) return;
  if (r.erro) return avisoExt(erroExt(r), true);
  avisoExt(r.recarregar ? 'Pronto. Nas contas abertas, vale depois de recarregar a conta (F5).' : '', false);
}

// ---------- janela de Configurações ----------

const ICONES = {
  geral: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  contas: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5.5a3 3 0 0 1 0 5M17.5 14.5c2 .8 3.5 2.9 3.5 5.5"/>',
  memoria: '<rect x="4" y="7" width="16" height="10" rx="2"/><path d="M8 7V4M12 7V4M16 7V4M8 20v-3M12 20v-3M16 20v-3"/>',
  extensoes: '<path d="M10 4h4v3a2 2 0 1 0 4 0h2v5h-2a2 2 0 1 0 0 4h2v4H4v-5h2a2 2 0 1 0 0-4H4V7h6z"/>',
  copia: '<path d="M12 4v10M8 10l4 4 4-4M5 18h14"/>',
  sobre: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8v.2"/>',
};
// id → [nome na lateral, frase de cima, quem desenha]
const SECOES = {
  geral: ['Geral', 'Como o programa se comporta.', secaoGeral],
  contas: ['Contas', 'Cada conta tem o login separado, guardado só no seu PC.', secaoContas],
  memoria: ['Memória', 'Quanto cada conta está usando agora.', secaoMemoria],
  extensoes: ['Extensões', 'A do HuntDesk e as que você escolher instalar.', secaoExtensoes],
  copia: ['Cópia', 'Leve as suas pastas, telas, contas e opções para outro PC, ou guarde de reserva.', secaoCopia],
  sobre: ['Sobre', 'A versão do programa e onde ficam os seus dados.', secaoSobre],
};

function desenharPainel() {
  const el = $('#janela-painel');
  if (!SECOES[aberto.painel]) aberto.painel = 'geral';
  if (!el.querySelector('.cfg-corpo')) {
    el.innerHTML = '<div class="cab-janela"><h2>Configurações</h2><button class="x" data-fechar title="Fechar (Esc)">✕</button></div><nav class="cfg-nav"></nav><div class="cfg-corpo"></div>';
    navDesenhada = '';
    assinaturaPainel = '';
  }
  // A bolinha vermelha na seção Memória: alguma conta (ou o programa todo) passou do limite.
  const atencao = !!(E.alertas && (E.alertas.total || E.contas.some((c) => alerta(c.id))));
  const nav = Object.entries(SECOES).map(([id, [nome]]) => `<button data-secao="${id}" class="${id === aberto.painel ? 'aqui' : ''}"><svg viewBox="0 0 24 24">${ICONES[id]}</svg>${nome}${
    id === 'memoria' && atencao ? '<i class="ponto" title="Uma conta passou do limite"></i>' : ''}</button>`).join('');
  if (nav !== navDesenhada) { el.querySelector('.cfg-nav').innerHTML = nav; navDesenhada = nav; }
  const [titulo, sub, fn] = SECOES[aberto.painel];
  const corpo = `<h1>${titulo}</h1><p class="sub">${sub}</p>${fn()}`;
  const mesma = secaoDesenhada === aberto.painel;
  if (mesma && corpo === assinaturaPainel) return;
  // Com alguém digitando num campo da seção, ela não é redesenhada (o que foi digitado sumiria).
  const caixa = el.querySelector('.cfg-corpo');
  if (mesma && assinaturaPainel && caixa.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
  const rolagem = mesma ? caixa.scrollTop : 0;
  assinaturaPainel = corpo;
  secaoDesenhada = aberto.painel;
  caixa.innerHTML = corpo;
  caixa.querySelectorAll('[data-largura]').forEach((i) => { i.style.width = i.dataset.largura + '%'; });
  caixa.scrollTop = rolagem;
}

function desenhar() {
  const tela = aberto && aberto.tipo === 'tela' && E ? acharTela(aberto.tela) : null;
  const daPasta = aberto && (aberto.tipo === 'pasta' || aberto.tipo === 'conta-nova');
  const pasta = daPasta && E ? E.pastas.find((p) => p.id === aberto.pasta) : null;
  // Tela ou pasta que deixou de existir (juntada, removida, apagada): a janelinha fecha.
  if (aberto && E && ((aberto.tipo === 'tela' && !tela) || (daPasta && !pasta))) return fechar();
  const menu = $('#janela-menu');
  menu.hidden = !(tela || pasta);
  $('#janela-painel').hidden = !(aberto && aberto.tipo === 'painel' && E);
  // Ninguém digitando no nome da pasta ou no endereço: aí pode redesenhar.
  const digitando = menu.contains(document.activeElement) && document.activeElement.tagName === 'INPUT';
  if (tela && !digitando) desenharTela(tela.p, tela.t);
  else if (pasta && aberto.tipo === 'conta-nova' && !digitando) desenharContaNova(pasta);
  else if (pasta && aberto.tipo === 'pasta' && !digitando) desenharPasta(pasta);
  else if (aberto && aberto.tipo === 'painel' && E) desenharPainel();
  avisarTamanho();
}

window.p0.aoAbrir((dados) => {
  aberto = dados;
  removendo = null;
  erroUrl = '';
  urlDigitada = '';
  assinaturaPainel = '';
  alturaAvisada = 0;
  cfgUI = { saiba: new Set(), detalhes: false, editando: null, nova: false, urlNova: '', erroNova: '' };
  desenhar();
  // Pasta que acabou de ser criada: o nome já fica escolhido para trocar.
  if (dados && dados.tipo === 'pasta' && dados.nova && $('#nome-pasta')) { $('#nome-pasta').focus(); $('#nome-pasta').select(); }
  if (dados && dados.tipo === 'conta-nova' && $('#url-jogo')) $('#url-jogo').focus();
  // Duplo clique na tela da lateral: o nome da (primeira) conta já fica escolhido para trocar.
  const nome = dados && dados.tipo === 'tela' && dados.renomear && document.querySelector('.nome-conta');
  if (nome) { nome.focus(); nome.select(); }
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
  if (b.id && b.id.startsWith('copia-')) return cliqueCopia(b.id);
  if ((b.id && b.id.startsWith('ext-')) || b.dataset.extFaz || b.dataset.extTodas || b.dataset.extConta) return cliqueExt(b);
  if (b.dataset.dispensar) return acao('guarda:dispensar', { id: b.dataset.dispensar });
  if (b.closest('#janela-painel')) return cliqueConfig(b);
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
    if (f === 'conta-nova') return window.p0.abrir({ tipo: 'conta-nova', pasta, x: aberto.x, y: aberto.y });
    if (f === 'mesmo-jogo') {
      const p = E.pastas.find((q) => q.id === pasta);
      acao('conta:adicionar', { pasta, url: (p && urlDaPasta(p)) || E.padrao });
      return fechar();
    }
    if (f === 'adicionar-url') {
      urlDigitada = $('#url-jogo').value.trim();
      erroUrl = problemaDoEndereco(urlDigitada);
      if (erroUrl) {
        // Desenha já, mesmo com o campo ainda escolhido (o desenhar() de sempre espera o jogador parar de digitar).
        desenharContaNova(E.pastas.find((q) => q.id === pasta));
        avisarTamanho();
        return $('#url-jogo').focus();
      }
      acao('conta:adicionar', { pasta, url: urlDigitada });
      return fechar();
    }
    if (f === 'apagar-pasta') { acao('pasta:apagar', { id: pasta }); return fechar(); }
    return;
  }
});

// Redesenha a seção aberta agora (uma chave, um "saiba mais" ou um botão mudou o que ela mostra).
function redesenharConfig() {
  assinaturaPainel = '';
  desenhar();
}

function cliqueConfig(b) {
  if (b.dataset.secao) { aberto.painel = b.dataset.secao; removendo = null; return desenhar(); }
  if (b.dataset.saiba) {
    if (!cfgUI.saiba.delete(b.dataset.saiba)) cfgUI.saiba.add(b.dataset.saiba);
    return redesenharConfig();
  }
  const ch = b.dataset.chave;
  if (ch === 'abrir-ao-iniciar') return acao('config:abrir-ao-iniciar', { ligado: !E.abrirAoIniciar });
  if (ch === 'notificacoes') return acao('guarda:config', { notificacoes: !E.guarda.notificacoes });
  if (ch === 'economia') {
    const ligar = !E.economico.agora;
    const texto = ligar ? 'Ligar a economia de memória? A imagem do jogo fica um pouco mais simples.' : 'Desligar a economia de memória? Cada conta volta a gastar mais.';
    if (confirm(`${texto}\n\nO HuntDesk vai fechar e abrir de novo; as contas recarregam e os logins ficam guardados.`)) acao('config:economico', { ligado: ligar });
    return;
  }
  if (b.dataset.guardaAcao) return acao('guarda:config', { acao: b.dataset.guardaAcao });
  if (b.id === 'detalhes-memoria') { cfgUI.detalhes = !cfgUI.detalhes; return redesenharConfig(); }
  if (b.id === 'abrir-medicoes') return window.p0.abrirMedicoes();
  if (b.id === 'abrir-dados') return window.p0.abrirDados();
  if (b.id === 'abrir-huntdesk') return window.p0.abrirHuntDesk();
  if (b.id === 'nova-conta') { cfgUI.nova = !cfgUI.nova; cfgUI.erroNova = ''; redesenharConfig(); if ($('#nova-url')) $('#nova-url').focus(); return; }
  if (b.id === 'nova-adicionar') {
    cfgUI.urlNova = $('#nova-url').value.trim();
    cfgUI.erroNova = cfgUI.urlNova ? problemaDoEndereco(cfgUI.urlNova) : '';
    if (!cfgUI.erroNova) {
      acao('conta:adicionar', { url: cfgUI.urlNova || E.padrao });
      cfgUI.nova = false;
      cfgUI.urlNova = '';
    }
    return redesenharConfig();
  }
  const linha = b.closest('[data-linha]');
  if (linha) {
    const id = linha.dataset.linha;
    const f = b.dataset.faz;
    if (f === 'remover') {
      if (removendo !== id) { removendo = id; return redesenharConfig(); }
      removendo = null;
      cfgUI.editando = null;
      return acao('conta:remover', { id });
    }
    removendo = null;
    if (f === 'ligar') return acao('conta:ligar', { id });
    if (f === 'desligar') return acao('conta:desligar', { id });
    if (f === 'editar') { cfgUI.editando = cfgUI.editando === id ? null : id; return redesenharConfig(); }
  }
}

// Campos de nome e endereço: valem quando você sai do campo ou aperta Enter.
document.addEventListener('change', (ev) => {
  const el = ev.target;
  if (el.id === 'ext-entendi') { $('#ext-instalar').disabled = !el.checked; return; }
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
  if (el.dataset.renomear) return acao('conta:renomear', { id: el.dataset.renomear, nome: el.value });
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && aberto) return fechar();
  if (ev.key === 'Enter' && ev.target.id === 'copia-senha-abrir') return $('#copia-confirmar').click();
  if (ev.key === 'Enter' && ev.target.id === 'ext-link') return $('#ext-buscar').click();
  if (ev.key === 'Enter' && ev.target.id === 'nova-url') return $('#nova-adicionar').click();
  if (ev.key === 'Enter' && ev.target.id === 'url-jogo') return document.querySelector('[data-faz="adicionar-url"]').click();
  if (ev.key === 'Enter' && ev.target.tagName === 'INPUT') ev.target.blur();
});
