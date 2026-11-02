'use strict';
// Barra do programa: a lateral com as contas, a barra de baixo e a faixa em cima de cada conta. Os detalhes de uma
// conta e os painéis abrem nas janelinhas (sobre.js), porque as páginas do jogo cobrem o que esta página desenha.

const abrirConta = (id) => {
  const el = document.querySelector(`[data-cartao="${CSS.escape(id)}"]`);
  const r = el ? el.getBoundingClientRect() : { right: 0, top: 0 };
  window.p0.abrir({ tipo: 'conta', id, x: r.right, y: r.top });
};
const abrirPainel = (painel) => window.p0.abrir({ tipo: 'painel', painel });

// Contas que precisam de atenção: caíram, travaram, não abriram ou passaram do limite de memória.
const problemas = () => E.contas.filter((c) => c.ligada && (alerta(c.id) || ['caiu', 'travada', 'erro'].includes(c.estado)));

// ---------- lateral ----------

function desenharLado() {
  $('#lado').classList.toggle('recolhida', !E.visual.lateral);
  $('#seta').textContent = E.visual.lateral ? '«' : '»';
  const aberta = E.aberto && E.aberto.tipo === 'conta' ? E.aberto.id : null;
  $('#lista').innerHTML = E.contas.map((c) => {
    const e = estadoDe(c, alerta(c.id));
    const classes = ['cartao', aberta === c.id ? 'aberta' : '', !c.ligada ? 'desligada' : c.naTela ? '' : 'fora'].join(' ');
    return `<button class="${classes}" data-cartao="${esc(c.id)}" title="${esc(c.nome)}: ${esc(e.texto)}. Clique para ver tudo desta conta.">
      ${ini(c, e.bola)}<span class="nome some">${esc(c.nome)}</span>
      <span class="linha2 some"><span class="${e.classe}">${esc(e.texto)}</span>${c.ligada ? ' · ' + ram(uso(c.id)) : ''}</span>
    </button>`;
  }).join('');
}

// ---------- barra de baixo ----------

function desenharBaixo() {
  const L = E.layout;
  const p = problemas();
  const at = E.alertas && E.alertas.total;
  const s = $('#saude');
  s.className = 'saude' + (p.length || at ? ' ruim' : '');
  s.dataset.ir = p.length ? p[0].id : at ? 'medicoes' : '';
  s.innerHTML = '<i></i>' + (p.length === 1 ? '1 conta precisa de atenção' : p.length ? `${p.length} contas precisam de atenção`
    : at ? 'Memória do programa passou do limite' : 'Tudo certo');
  s.title = p.length ? `Clique para ver a ${p[0].nome}` : at ? 'Clique para ver as medições' : 'Nenhuma conta caiu nem passou do limite';

  document.querySelectorAll('[data-modo]').forEach((b) => b.classList.toggle('ativo', b.dataset.modo === L.modo));
  $('#colunas').hidden = L.modo !== 'grade';
  $('#colunas').value = String(L.colunas);
  $('#layout').innerHTML = E.layouts.map((l) => `<option value="${esc(l.id)}"${l.id === L.id ? ' selected' : ''}>Layout: ${esc(l.nome)}</option>`).join('');

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
  $('#faixas').textContent = 'Faixas: ' + (E.visual.faixas ? 'à vista' : 'escondidas');
  $('#cheia').textContent = E.cheia ? 'Sair da tela cheia' : 'Tela cheia';
}

// ---------- faixa em cima de cada conta ----------

function desenharCelulas() {
  document.body.classList.toggle('sem-faixas', !E.visual.faixas);
  const porId = new Map(E.contas.map((c) => [c.id, c]));
  $('#celulas').innerHTML = E.celulas.map((cel) => {
    const c = porId.get(cel.id);
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
        ${ini(c, 'sem', 'mini')}<b>${esc(c.nome)}</b>${meio}
        <span class="espaco"></span>
        <button data-conta="${esc(c.id)}" data-faz="recarregar" title="Recarrega só esta conta (F5 dentro dela faz o mesmo)">Recarregar</button>
        <button data-conta="${esc(c.id)}" data-faz="esconder" title="Tira da tela; o jogo continua aberto e conectado">Tirar</button>
      </div>
      ${caiu ? `<div class="caido"><div>
        <h3>A página da ${esc(c.nome)} caiu</h3>
        <p>O Chrome fechou a página (falta de memória ou erro).<br>O HuntDesk não tenta sozinho: você decide quando voltar.</p>
        <button class="forte" data-conta="${esc(c.id)}" data-faz="recarregar">Recarregar agora</button>
      </div></div>` : ''}
    </div>`;
  }).join('');
  // A posição vai pelo JavaScript: a regra de segurança da página não aceita estilo escrito dentro do HTML.
  for (const cel of E.celulas) {
    const el = document.querySelector(`[data-celula="${CSS.escape(cel.id)}"]`);
    if (el) Object.assign(el.style, { left: cel.x + 'px', top: cel.y + 'px', width: cel.width + 'px', height: cel.height + 'px' });
  }
  $('#vazio').hidden = E.celulas.length > 0;
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
  const b = ev.target.closest('button');
  if (!b || !E) return;
  if (b.dataset.cartao) return abrirConta(b.dataset.cartao);
  if (b.dataset.abrir) return abrirPainel(b.dataset.abrir);
  if (b.dataset.modo) return acao('layout:modo', { modo: b.dataset.modo });
  if (b.dataset.dispensar) return acao('guarda:dispensar', { id: b.dataset.dispensar });
  if (b.dataset.conta) {
    if (b.dataset.faz === 'recarregar') return acao('conta:recarregar', { id: b.dataset.conta });
    if (b.dataset.faz === 'esconder') return acao('conta:esconder', { id: b.dataset.conta });
  }
  if (b.id === 'saude') {
    const ir = b.dataset.ir;
    if (ir === 'medicoes') return abrirPainel('medicoes');
    if (ir) return abrirConta(ir);
    return;
  }
  if (b.id === 'recolher') return acao('visual:lateral');
  if (b.id === 'faixas') return acao('visual:faixas');
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

document.addEventListener('change', (ev) => {
  const el = ev.target;
  if (el.id === 'layout') return acao('layout:escolher', { id: el.value });
  if (el.id === 'colunas') return acao('layout:colunas', { colunas: Number(el.value) });
});

// O espaço das contas muda quando a lateral recolhe ou a janela muda de tamanho; as contas acompanham.
new ResizeObserver(() => {
  const r = $('#area').getBoundingClientRect();
  window.p0.area({ x: r.left, y: r.top, width: r.width, height: r.height });
}).observe($('#area'));
