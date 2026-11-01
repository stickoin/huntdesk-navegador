'use strict';
// Autoteste (só com a página de teste, nunca com o jogo, e numa pasta de dados temporária): aperta os botões numa
// sequência fixa e confere o resultado.
//   npm run autoteste          → telas: grade, abas, layouts, desligar e remover
//   npm run autoteste:guarda   → guarda de memória: aviso, "uma vez por subida" e recarga sozinha

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

const espera = (seg) => new Promise((r) => setTimeout(r, seg * 1000));

// Espera até a condição valer (conferindo a cada segundo) ou o prazo acabar.
async function ate(cond, prazoSeg) {
  for (let i = 0; i < prazoSeg; i++) {
    if (cond()) return true;
    await espera(1);
  }
  return cond();
}

async function telas({ acao, medidor, estado, conferir }) {
  const naTela = () => estado().celulas.map((c) => c.id).join(',');
  await espera(15);
  acao('conta:adicionar', { nome: 'Conta 3' });
  await espera(10);
  conferir('três contas em grade', naTela() === 'conta1,conta2,conta3', naTela());
  acao('conta:esconder', { id: 'conta2' });
  await espera(9);
  conferir('conta 2 escondida sai da tela', naTela() === 'conta1,conta3', naTela());
  const u = medidor.ultima && medidor.ultima.contas.conta2;
  conferir('Chrome trata a escondida como escondida', u && u.visibilidade === 'hidden', u && u.visibilidade);
  acao('layout:modo', { modo: 'abas' });
  conferir('abas mostram uma conta só', naTela() === 'conta1', naTela());
  acao('layout:aba', { id: 'conta3' });
  conferir('trocar de aba', naTela() === 'conta3', naTela());
  await espera(5);
  acao('layout:novo', { nome: 'Teste' });
  acao('layout:modo', { modo: 'grade' });
  acao('layout:colunas', { colunas: 3 });
  acao('conta:mostrar', { id: 'conta2' });
  const c = estado().celulas;
  conferir('layout novo com 3 colunas', estado().cfg.layouts.length === 2 && c.length === 3 && c[2].y === c[0].y, naTela());
  await espera(10);
  acao('conta:desligar', { id: 'conta3' });
  conferir('desligar fecha a página', !estado().vivas.has('conta3') && naTela() === 'conta1,conta2', naTela());
  acao('layout:escolher', { id: 'layout1' });
  conferir('voltar ao layout 1 religa a conta 3', estado().vivas.has('conta3'), naTela());
  await espera(5);
  acao('conta:remover', { id: 'conta3' });
  conferir('remover tira de tudo', estado().cfg.contas.length === 2 && estado().cfg.layouts.every((l) => !l.contas.includes('conta3')));
  await espera(2);
  let gravado = null;
  try { gravado = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'config.json'), 'utf8')); } catch (e) { /* conferido abaixo */ }
  conferir('config.json gravado', gravado && gravado.layouts.length === 2 && gravado.contas.length === 2);
  // Economia de memória: no autoteste só muda a configuração, sem reiniciar.
  const cfg = () => estado().cfg;
  conferir('começa sem economia e com limite de 2.048 MB', !cfg().economico && cfg().guarda.limiteMb === 2048, String(cfg().guarda.limiteMb));
  acao('config:economico', { ligado: true });
  conferir('ligar a economia baixa o limite de fábrica', cfg().economico && cfg().guarda.limiteMb === 1024, String(cfg().guarda.limiteMb));
  acao('guarda:config', { limiteMb: 700 });
  acao('config:economico', { ligado: false });
  conferir('limite escolhido pelo jogador fica', !cfg().economico && cfg().guarda.limiteMb === 700, String(cfg().guarda.limiteMb));
}

// Foto só da barra e das faixas do programa (as páginas das contas não aparecem nela), para conferir o visual.
async function foto(janela, nome) {
  // Janela coberta por outras não se redesenha; traz para a frente sem tirar o teclado de quem está usando o PC.
  janela.showInactive();
  janela.moveTop();
  await espera(1.5);
  const img = await janela.webContents.capturePage();
  const f = path.join(app.getPath('temp'), `huntdesk-autoteste-${nome}.png`);
  fs.writeFileSync(f, img.toPNG());
  console.log('autoteste: foto', f);
}

async function guarda({ acao, estado, conferir, janela }) {
  // A página de teste guarda ~3 MB por segundo de memória; o limite baixo faz a guarda agir logo. Sem freio, o relógio
  // dela corre normal mesmo com a janela escondida.
  acao('conta:freio', { id: 'conta1', ligado: false });
  acao('conta:freio', { id: 'conta2', ligado: false });
  acao('guarda:config', { limiteMb: 230, acao: 'avisar', notificacoes: false });
  acao('guarda:config', { limiteMb: 5 });
  conferir('limite fora da faixa é ignorado', estado().cfg.guarda.limiteMb === 230, String(estado().cfg.guarda.limiteMb));
  const alertas = () => estado().alertas.contas;
  conferir('aviso quando passa do limite', await ate(() => alertas().conta1 && alertas().conta2, 120), JSON.stringify(alertas()));
  conferir('no modo avisar, não recarrega', alertas().conta1 && !alertas().conta1.recarregada);
  await espera(1);
  await foto(janela, 'aviso');
  await janela.webContents.executeJavaScript("document.querySelector('[data-painel=config]').click()");
  await espera(1);
  await foto(janela, 'configuracoes');
  await janela.webContents.executeJavaScript("document.querySelector('[data-painel=config]').click()");
  acao('guarda:config', { acao: 'recarregar' });
  acao('guarda:dispensar', { id: 'conta1' });
  acao('guarda:dispensar', { id: 'conta2' });
  acao('conta:recarregar', { id: 'conta1' });
  conferir('dispensar tira o aviso', !alertas().conta1 && !alertas().conta2);
  // A conta 2 continua acima do limite: a guarda age uma vez por subida, então não pode avisar de novo.
  const repetiu = await ate(() => alertas().conta2, 25);
  conferir('não repete o aviso enquanto a memória não baixa', !repetiu);
  // A conta 1 foi recarregada pelo jogador, a memória baixou e volta a subir: agora a guarda recarrega sozinha.
  const recarregou = await ate(() => alertas().conta1 && alertas().conta1.recarregada, 150);
  conferir('recarga sozinha quando escolhida', recarregou, JSON.stringify(alertas().conta1 || null));
  conferir('config.json com a guarda', estado().cfg.guarda.acao === 'recarregar');
}

// Aliviar: o Chrome da conta 1 recebe o aviso de "sem memória" sem recarregar a página.
async function alivio({ acao, estado, medidor, conferir }) {
  await espera(20);
  const antes = estado().vivas.get('conta1').view.webContents.getURL();
  acao('conta:aliviar', { id: 'conta1' });
  await espera(3);
  const csv = require('node:fs').readFileSync(medidor.arquivo, 'utf8');
  conferir('aliviar foi feito', /conta1,aliviada pelo jogador/.test(csv), (csv.match(/conta1,alivi.*$/m) || [''])[0]);
  const depois = csv.slice(csv.indexOf('conta1,aliviada'));
  conferir('aliviar não recarrega a página', !/conta1,estado: carregando/.test(depois));
  conferir('a página continua a mesma', estado().vivas.get('conta1').view.webContents.getURL() === antes);
}

function rodar(cenario, ctx) {
  const resultados = [];
  const conferir = (nome, ok, detalhe) => {
    resultados.push(!!ok);
    console.log(`autoteste: ${ok ? 'ok    ' : 'FALHOU'} ${nome}${detalhe ? ' — ' + detalhe : ''}`);
  };
  const fn = { telas, guarda, alivio }[cenario];
  if (!fn) { console.log('autoteste: cenário desconhecido:', cenario); return ctx.sair(); }
  console.log(`autoteste: cenário "${cenario}"`);
  fn({ ...ctx, conferir })
    .catch((e) => conferir('sem erro no autoteste', false, e.stack))
    .finally(() => {
      const falhas = resultados.filter((ok) => !ok).length;
      console.log(`autoteste: fim — ${resultados.length - falhas} ok, ${falhas} falharam. Medições em ${ctx.medidor.arquivo}`);
      ctx.sair();
    });
}

module.exports = { rodar };
