'use strict';
// Barra do programa: a lateral com as pastas e as telas, a barra de baixo e a faixa em cima de cada conta. O menuzinho
// de uma tela ou pasta e os painéis abrem nas janelinhas (sobre.js), porque as páginas do jogo cobrem o que esta página
// desenha.

const contaDe = (id) => E.contas.find((c) => c.id === id);

// Menuzinho da tela ou da pasta, ao lado da linha clicada.
function abrirMenu(el, dados) {
  const r = el ? el.getBoundingClientRect() : { right: 0, top: 0 };
  window.p0.abrir({ ...dados, x: r.right, y: r.top });
}
const abrirPainel = (painel) => window.p0.abrir({ tipo: 'painel', painel });
let esperandoPasta = 0; // "+ Nova pasta": quantas pastas havia, para abrir o menuzinho da nova quando ela chegar
let arrastando = null; // { tipo: 'tela' | 'pasta', id } enquanto o jogador arrasta uma linha da lateral
let ultimoClique = {}; // { tela, quando }: o clique de antes, para reconhecer dois cliques seguidos

// Contas que precisam de atenção: caíram, travaram, não abriram ou passaram do limite de memória.
const problemas = () => E.contas.filter((c) => c.ligada && (alerta(c.id) || ['caiu', 'travada', 'erro'].includes(c.estado)));

// ---------- lateral: pastas e telas ----------

// O que a linha da tela diz embaixo dos nomes: o site (para o jogador saber onde digita a senha) e como ela está.
function textoTela(cs) {
  const sites = [...new Set(cs.map((c) => c.site).filter(Boolean))];
  const site = sites.length > 1 ? `${sites.length} sites` : esc(sites[0] || '');
  const ligadas = cs.filter((c) => c.ligada);
  const como = ligadas.some((c) => c.estado === 'caiu') ? '<span class="ruim">uma conta caiu</span>'
    : ligadas.some((c) => alerta(c.id)) ? '<span class="ruim">passou do limite</span>'
      : !ligadas.length ? 'desligada' : gb(ligadas.reduce((s, c) => s + (uso(c.id).ram || 0), 0));
  return site ? `${site} · ${como}` : como;
}

function desenharLado() {
  if (arrastando) return; // redesenhar no meio do arrasto o cancelaria; o próximo estado redesenha
  $('#lado').classList.toggle('recolhida', !E.visual.lateral);
  $('#seta').textContent = E.visual.lateral ? '«' : '»';
  const ab = E.aberto || {};
  $('#app-card').classList.toggle('atual', E.app);
  // Com o app do HuntDesk na janela, nenhuma tela fica marcada.
  const atual = E.app ? {} : E.atual;
  $('#lista').innerHTML = E.pastas.map((p) => {
    const n = p.telas.reduce((s, t) => s + t.contas.length, 0);
    const todas = atual.pasta === p.id && atual.tela === 'todas';
    const telas = p.aberta ? p.telas.map((t) => {
      const cs = t.contas.map(contaDe).filter(Boolean);
      const classes = ['tela', atual.tela === t.id ? 'atual' : '', ab.tela === t.id ? 'menu' : ''].join(' ');
      return `<div class="${classes}" role="button" tabindex="0" draggable="true" data-tela="${esc(t.id)}" data-pasta-da-tela="${esc(p.id)}"
          title="Clique para ver ${cs.length > 1 ? 'estas contas lado a lado' : 'esta conta'}. Dois cliques: trocar o nome. Arraste para mudar de lugar.
Botão direito ou ⋯: as contas desta tela, a cor delas, juntar e separar.">
        <span class="siglas">${cs.map((c) => ini(c, estadoDe(c, alerta(c.id)).bola)).join('')}</span>
        <span class="nomes some">${cs.map((c) => esc(c.nome)).join(' + ')}</span>
        <span class="dir some"><button class="tres" data-menu-tela="${esc(t.id)}" title="Opções desta tela">⋯</button></span>
        <span class="linha2 some">${textoTela(cs)}</span>
      </div>`;
    }).join('') + `<button class="nova some" data-conta-nova="${esc(p.id)}" title="Mais uma conta deste jogo, ou de outro jogo pelo endereço">+ Adicionar conta</button>` : '';
    return `<div class="pasta${todas ? ' atual' : ''}${ab.pasta === p.id ? ' menu' : ''}" role="button" tabindex="0" draggable="true" data-pasta="${esc(p.id)}"
        title="Clique: as ${n} contas desta pasta juntas na tela. Arraste para mudar de lugar. Botão direito ou ⋯: nome e opções.">
        <span class="seta-pasta" data-abrir-pasta="${esc(p.id)}" title="Abrir ou fechar a pasta">${p.aberta ? '▾' : '▸'}</span>
        <span class="nome-pasta some">${esc(p.nome)} <span class="n">· ${n}</span></span>
        <button class="tres some" data-menu-pasta="${esc(p.id)}" title="Opções da pasta">⋯</button>
      </div>${telas}`;
  }).join('');
  // Pasta nova chegou: o menuzinho dela abre com o nome para trocar.
  if (esperandoPasta && E.pastas.length > esperandoPasta) {
    esperandoPasta = 0;
    const p = E.pastas[E.pastas.length - 1];
    abrirMenu(document.querySelector(`[data-pasta="${CSS.escape(p.id)}"]`), { tipo: 'pasta', pasta: p.id, nova: true });
  }
}

// ---------- barra de baixo ----------

function desenharBaixo() {
  const p = problemas();
  const at = E.alertas && E.alertas.total;
  const s = $('#saude');
  s.className = 'saude' + (p.length || at ? ' ruim' : '');
  s.dataset.ir = p.length ? p[0].id : at ? 'memoria' : '';
  s.innerHTML = '<i></i>' + (p.length === 1 ? '1 conta precisa de atenção' : p.length ? `${p.length} contas precisam de atenção`
    : at ? 'Memória do programa passou do limite' : 'Tudo certo');
  s.title = p.length ? `Clique para ver a ${p[0].nome}` : at ? 'Clique para ver a memória de cada conta' : 'Nenhuma conta caiu nem passou do limite';

  const eco = E.economico.agora;
  $('#economia').textContent = 'Economia: ' + (eco ? 'ligada' : 'desligada');
  $('#economia').classList.toggle('ligado', eco);
  $('#economia').dataset.ligar = eco ? '' : '1';
  const t = E.amostra && E.amostra.total;
  $('#total').textContent = t ? 'Memória ' + gb(t.ram) : 'medindo…';
  $('#total').title = t ? `Programa todo: ${fmt(t.ram, 0, ' MB')} · processador ${fmt(t.cpu, 1, '%')}${t.cresce != null ? ' · cresce ' + fmt(t.cresce, 1, ' MB/min') : ''}` : '';

  const nova = E.atualizacao && E.atualizacao.fase === 'pronta';
  $('#reiniciar').hidden = !nova;
  if (nova) {
    $('#reiniciar').textContent = `Versão ${E.atualizacao.versao} pronta: reiniciar`;
    $('#reiniciar').title = 'A versão nova já foi baixada e entra quando você fechar o programa';
  }
  $('#cheia').textContent = E.cheia ? 'Sair da tela cheia' : 'Tela cheia';
}

// ---------- faixa em cima de cada conta ----------

function desenharCelulas() {
  document.body.classList.toggle('sem-faixas', !E.faixas); // a faixa só aparece com mais de uma conta na tela
  $('#celulas').innerHTML = E.celulas.map((cel) => {
    const c = contaDe(cel.id);
    if (!c) return '';
    const a = alerta(c.id);
    const caiu = c.estado === 'caiu';
    const meio = a
      ? `<span class="aviso ${a.recarregada ? 'atencao' : 'ruim'}" title="${esc(textoAlerta(a))}">${esc(textoAlerta(a))}</span>
         <button data-dispensar="${esc(c.id)}" class="vermelho" title="Tira o aviso">Dispensar</button>`
      : `<span class="estado ${c.estado}">${ESTADOS[c.estado] || esc(c.estado)}</span>`;
    const classes = ['celula', E.foco === c.id ? 'foco' : '', a ? (a.recarregada ? 'recarregada' : 'com-alerta') : '', caiu ? 'caiu' : ''].join(' ');
    return `<div class="${classes}" data-celula="${esc(c.id)}">
      <div class="faixa">
        ${ini(c, 'sem', 'mini')}<b>${esc(c.nome)}</b><span class="site">${esc(c.site)}</span>${meio}
        <span class="espaco"></span>
        <button data-conta="${esc(c.id)}" data-faz="recarregar" title="Recarrega só esta conta (F5 dentro dela faz o mesmo)">Recarregar</button>
      </div>
      ${caiu ? `<div class="caido"><div>
        <h3>A página da ${esc(c.nome)} caiu</h3>
        <p>${esc(motivoQueda(c.queda))}<br>O HuntDesk não tenta sozinho: você decide quando voltar.</p>
        <button class="forte" data-conta="${esc(c.id)}" data-faz="recarregar">Recarregar agora</button>
      </div></div>` : ''}
    </div>`;
  }).join('');
  // A posição vai pelo JavaScript: a regra de segurança da página não aceita estilo escrito dentro do HTML.
  for (const cel of E.celulas) {
    const el = document.querySelector(`[data-celula="${CSS.escape(cel.id)}"]`);
    if (el) Object.assign(el.style, { left: cel.x + 'px', top: cel.y + 'px', width: cel.width + 'px', height: cel.height + 'px' });
  }
  $('#vazio').hidden = E.celulas.length > 0 || E.app;
}

function desenhar() {
  if (!E) return;
  desenharLado();
  desenharBaixo();
  desenharCelulas();
}

window.p0.aoEstado((estado) => { E = estado; desenhar(); });

// ---------- cliques ----------

document.addEventListener('click', (ev) => {
  const b = ev.target.closest('button, [data-abrir-pasta], [data-tela], [data-pasta], [data-app]');
  if (!b || !E) return;
  if (b.hasAttribute('data-app')) return acao('app:mostrar');
  if (b.dataset.menuTela) return abrirMenu(b.closest('[data-tela]'), { tipo: 'tela', tela: b.dataset.menuTela });
  if (b.dataset.menuPasta) return abrirMenu(b.closest('[data-pasta]'), { tipo: 'pasta', pasta: b.dataset.menuPasta });
  if (b.dataset.abrirPasta) return acao('pasta:abrir', { id: b.dataset.abrirPasta });
  if (b.dataset.contaNova) return abrirMenu(b, { tipo: 'conta-nova', pasta: b.dataset.contaNova });
  if (b.dataset.tela) {
    // Dois cliques seguidos na mesma tela: abre o menuzinho com o nome da conta pronto para trocar. Conta pelo tempo,
    // porque o 1º clique troca a tela e redesenha a lateral (o duplo clique do navegador se perderia).
    const agora = Date.now();
    if (ultimoClique.tela === b.dataset.tela && agora - ultimoClique.quando < 450) {
      ultimoClique = {};
      return abrirMenu(document.querySelector(`[data-tela="${CSS.escape(b.dataset.tela)}"]`), { tipo: 'tela', tela: b.dataset.tela, renomear: true });
    }
    ultimoClique = { tela: b.dataset.tela, quando: agora };
    return acao('tela:ver', { pasta: b.dataset.pastaDaTela, tela: b.dataset.tela });
  }
  if (b.dataset.pasta) return acao('tela:ver', { pasta: b.dataset.pasta, tela: 'todas' });
  if (b.dataset.abrir) return abrirPainel(b.dataset.abrir);
  if (b.dataset.dispensar) return acao('guarda:dispensar', { id: b.dataset.dispensar });
  if (b.dataset.conta && b.dataset.faz === 'recarregar') return acao('conta:recarregar', { id: b.dataset.conta });
  if (b.id === 'saude') {
    const ir = b.dataset.ir;
    if (ir === 'memoria') return abrirPainel('memoria');
    if (ir) return acao('conta:mostrar', { id: ir });
    return;
  }
  if (b.id === 'nova-pasta') { esperandoPasta = E.pastas.length; return acao('pasta:nova', {}); }
  if (b.id === 'recolher') return acao('visual:lateral');
  if (b.id === 'cheia') return acao('janela:cheia');
  if (b.id === 'abrir-menu') return window.p0.menu();
  if (b.id === 'economia') {
    const ligar = !!b.dataset.ligar;
    const texto = ligar ? 'Ligar a economia de memória? A imagem do jogo fica um pouco mais simples.' : 'Desligar a economia de memória? Cada conta volta a gastar mais.';
    if (confirm(`${texto}

O HuntDesk vai fechar e abrir de novo; as contas recarregam e os logins ficam guardados.`)) return acao('config:economico', { ligado: ligar });
    return;
  }
  if (b.id === 'reiniciar' && confirm('Fechar o HuntDesk e abrir a versão nova? As contas abertas vão recarregar.')) return acao('app:reiniciar');
});

// Botão direito na tela ou na pasta também abre o menuzinho; Enter ou espaço fazem o mesmo que o clique.
document.addEventListener('contextmenu', (ev) => {
  const t = ev.target.closest('[data-tela], [data-pasta]');
  if (!t || !E) return;
  ev.preventDefault();
  if (t.dataset.tela) abrirMenu(t, { tipo: 'tela', tela: t.dataset.tela });
  else abrirMenu(t, { tipo: 'pasta', pasta: t.dataset.pasta });
});
document.addEventListener('keydown', (ev) => {
  const t = ev.target.closest && ev.target.closest('[data-tela], [data-pasta], [data-app]');
  if (!t || !E || ev.target !== t || (ev.key !== 'Enter' && ev.key !== ' ')) return;
  ev.preventDefault();
  t.click();
});

// ---------- arrastar para mudar de lugar ----------
// A tela vai para antes ou depois de outra tela (de qualquer pasta), ou para o começo de uma pasta, soltando no nome
// dela. A pasta vai para antes ou depois de outra pasta.

// Onde a linha arrastada cairia: { el, antes: id | null, pasta } ou null.
function alvoDoArrasto(ev) {
  const el = ev.target.closest && ev.target.closest('[data-tela], [data-pasta]');
  if (!el || !arrastando) return null;
  const r = el.getBoundingClientRect();
  const depois = ev.clientY > r.top + r.height / 2;
  if (arrastando.tipo === 'pasta') {
    if (!el.dataset.pasta) return null;
    const i = E.pastas.findIndex((p) => p.id === el.dataset.pasta);
    const prox = depois ? E.pastas[i + 1] : E.pastas[i];
    return { el, depois, antes: prox ? prox.id : null };
  }
  if (el.dataset.pasta) {
    // Em cima do nome da pasta: vai para o começo dela.
    const p = E.pastas.find((x) => x.id === el.dataset.pasta);
    return { el, depois: true, pasta: p.id, antes: p.telas[0] ? p.telas[0].id : null };
  }
  const p = E.pastas.find((x) => x.id === el.dataset.pastaDaTela);
  const i = p.telas.findIndex((t) => t.id === el.dataset.tela);
  const prox = depois ? p.telas[i + 1] : p.telas[i];
  return { el, depois, pasta: p.id, antes: prox ? prox.id : null };
}
const limparMarcas = () => document.querySelectorAll('.cai-antes, .cai-depois, .arrastando').forEach((e) => e.classList.remove('cai-antes', 'cai-depois', 'arrastando'));

document.addEventListener('dragstart', (ev) => {
  const el = ev.target.closest && ev.target.closest('[data-tela], [data-pasta]');
  if (!el || !E) return;
  arrastando = el.dataset.tela ? { tipo: 'tela', id: el.dataset.tela } : { tipo: 'pasta', id: el.dataset.pasta };
  ev.dataTransfer.effectAllowed = 'move';
  ev.dataTransfer.setData('text/plain', arrastando.id);
  el.classList.add('arrastando');
});
document.addEventListener('dragover', (ev) => {
  const a = alvoDoArrasto(ev);
  document.querySelectorAll('.cai-antes, .cai-depois').forEach((e) => e.classList.remove('cai-antes', 'cai-depois'));
  if (!a) return;
  ev.preventDefault(); // deixa soltar aqui
  a.el.classList.add(a.depois ? 'cai-depois' : 'cai-antes');
});
document.addEventListener('drop', (ev) => {
  const a = alvoDoArrasto(ev);
  const quem = arrastando;
  arrastando = null;
  limparMarcas();
  if (!a || !quem) return desenhar();
  ev.preventDefault();
  if (quem.tipo === 'pasta') acao('pasta:posicionar', { id: quem.id, antes: a.antes });
  else acao('tela:posicionar', { tela: quem.id, pasta: a.pasta, antes: a.antes });
});
document.addEventListener('dragend', () => { if (arrastando) { arrastando = null; limparMarcas(); desenhar(); } });

// O espaço das contas muda quando a lateral recolhe ou a janela muda de tamanho; as contas acompanham.
new ResizeObserver(() => {
  const r = $('#area').getBoundingClientRect();
  window.p0.area({ x: r.left, y: r.top, width: r.width, height: r.height });
}).observe($('#area'));
