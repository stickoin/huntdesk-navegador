'use strict';
// Autoteste (só com a página de teste, nunca com o jogo, e numa pasta de dados temporária): aperta os botões numa
// sequência fixa e confere o resultado.
//   npm run autoteste          → telas: pastas e telas, juntar, separar, desligar, remover e a janelinha
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

async function telas({ acao, medidor, estado, conferir, janela, abrir, fechar }) {
  const naTela = () => estado().celulas.map((c) => c.id).join(',');
  const pastas = () => estado().cfg.pastas;
  const telaDe = (id) => pastas().flatMap((p) => p.telas).find((t) => t.contas.includes(id)).id;
  const linhas = () => pastas().map((p) => p.telas.map((t) => t.contas.join('+')).join(' / ')).join(' | ');
  await espera(15);
  conferir('começa com as duas contas numa tela', naTela() === 'conta1,conta2', naTela());
  acao('conta:adicionar', { nome: 'Conta 3' });
  await espera(10);
  conferir('conta nova ganha uma tela só dela e aparece', naTela() === 'conta3' && linhas() === 'conta1+conta2 / conta3', linhas());
  const u = medidor.ultima && medidor.ultima.contas.conta2;
  conferir('Chrome trata a conta fora da tela como escondida', u && u.visibilidade === 'hidden', u && u.visibilidade);
  acao('tela:ver', { pasta: 'pasta1', tela: 'todas' });
  conferir('a pasta mostra todas as contas juntas', naTela() === 'conta1,conta2,conta3', naTela());
  acao('tela:separar', { tela: telaDe('conta1') });
  conferir('separar deixa cada conta numa tela', linhas() === 'conta1 / conta2 / conta3', linhas());
  acao('tela:juntar', { tela: telaDe('conta1'), com: telaDe('conta3') });
  conferir('juntar põe as duas lado a lado e mostra', naTela() === 'conta1,conta3' && linhas() === 'conta1+conta3 / conta2', linhas());
  acao('tela:ver', { pasta: 'pasta1', tela: telaDe('conta2') });
  conferir('trocar de tela', naTela() === 'conta2', naTela());
  acao('pasta:nova', { nome: 'Outro jogo' });
  acao('tela:separar', { tela: telaDe('conta3') });
  acao('tela:mover', { tela: telaDe('conta3'), para: 'pasta2' });
  conferir('pasta nova e mover a tela para ela', pastas().length === 2 && linhas() === 'conta1 / conta2 | conta3', linhas());
  await espera(5);
  acao('conta:desligar', { id: 'conta3' });
  conferir('desligar fecha a página', !estado().vivas.has('conta3') && naTela() === 'conta2', naTela());
  acao('tela:ver', { pasta: 'pasta2', tela: telaDe('conta3') });
  conferir('ver a tela religa a conta desligada', estado().vivas.has('conta3') && naTela() === 'conta3', naTela());
  await espera(5);
  acao('pasta:apagar', { id: 'pasta2' });
  conferir('pasta com contas não é apagada', pastas().length === 2);
  acao('conta:remover', { id: 'conta3' });
  conferir('remover tira de tudo', estado().cfg.contas.length === 2 && linhas() === 'conta1 / conta2 | ' && estado().cfg.atual.pasta === 'pasta2', linhas());
  acao('pasta:apagar', { id: 'pasta2' });
  conferir('pasta vazia é apagada', pastas().length === 1 && estado().cfg.atual.pasta === 'pasta1', JSON.stringify(estado().cfg.atual));
  // Arrastar na lateral: a tela da conta 2 vai para cima; juntar fica no lugar da de cima.
  acao('tela:posicionar', { tela: telaDe('conta2'), pasta: 'pasta1', antes: telaDe('conta1') });
  conferir('arrastar muda a tela de lugar', linhas() === 'conta2 / conta1', linhas());
  acao('tela:juntar', { tela: telaDe('conta1'), com: telaDe('conta2') });
  conferir('juntar fica no lugar da tela de cima', linhas() === 'conta1+conta2' && pastas()[0].telas[0].id === telaDe('conta1'), linhas());
  acao('pasta:nova', { nome: 'Segunda' });
  const segunda = pastas()[1].id;
  acao('pasta:posicionar', { id: segunda, antes: 'pasta1' });
  conferir('arrastar muda a pasta de lugar', pastas()[0].id === segunda, pastas().map((p) => p.nome).join(', '));
  acao('pasta:apagar', { id: segunda });
  acao('conta:cor', { id: 'conta1', cor: 6 });
  acao('conta:cor', { id: 'conta1', cor: 99 });
  conferir('escolher a cor da conta (e ignorar cor que não existe)', estado().cfg.contas[0].cor === 6, String(estado().cfg.contas[0].cor));
  await espera(2);
  let gravado = null;
  try { gravado = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'config.json'), 'utf8')); } catch (e) { /* conferido abaixo */ }
  conferir('config.json gravado', gravado && gravado.pastas.length === 1 && gravado.pastas[0].telas.length === 1 && gravado.contas.length === 2);
  // Economia de memória: no autoteste só muda a configuração, sem reiniciar.
  const cfg = () => estado().cfg;
  conferir('começa sem economia e com limite de 2.048 MB', !cfg().economico && cfg().guarda.limiteMb === 2048, String(cfg().guarda.limiteMb));
  acao('config:economico', { ligado: true });
  conferir('ligar a economia baixa o limite de fábrica', cfg().economico && cfg().guarda.limiteMb === 1024, String(cfg().guarda.limiteMb));
  acao('guarda:config', { limiteMb: 700 });
  acao('config:economico', { ligado: false });
  conferir('limite escolhido pelo jogador fica', !cfg().economico && cfg().guarda.limiteMb === 700, String(cfg().guarda.limiteMb));

  // Som, faixa, cliques na lateral, menuzinho por cima das contas e conta que caiu (as duas contas na mesma tela).
  conferir('as duas juntas de novo', naTela() === 'conta1,conta2', naTela());
  // Janela coberta por outras não se redesenha (e a lateral não avisa o espaço novo): traz para a frente.
  janela.showInactive();
  janela.moveTop();
  await espera(1);
  const v1 = () => estado().vivas.get('conta1');
  acao('conta:som', { id: 'conta1', ligado: false });
  conferir('som desligado só nesta conta', v1().view.webContents.isAudioMuted() && !estado().vivas.get('conta2').view.webContents.isAudioMuted());
  acao('conta:som', { id: 'conta1', ligado: true });
  conferir('som volta', !v1().view.webContents.isAudioMuted());
  const cel1 = () => estado().celulas.find((c) => c.id === 'conta1');
  conferir('com duas contas na tela o jogo fica abaixo da faixa', v1().view.getBounds().y === cel1().y + 25, `${v1().view.getBounds().y} / ${cel1().y}`);
  const largura = cel1().width;
  janela.showInactive();
  janela.moveTop();
  acao('visual:lateral');
  conferir('lateral recolhida deixa as contas mais largas', await ate(() => cel1().width > largura, 5), `${largura} → ${cel1().width}`);
  acao('visual:lateral');
  await ate(() => cel1().width === largura, 5);
  // Cliques na lateral, como o jogador faz.
  const clicar = (sel) => janela.webContents.executeJavaScript(`document.querySelector('${sel}').click()`);
  acao('tela:separar', { tela: telaDe('conta1') });
  await clicar(`[data-tela="${telaDe('conta2')}"]`);
  conferir('clicar na tela mostra as contas dela', await ate(() => naTela() === 'conta2', 5), naTela());
  conferir('com uma conta só a faixa some', estado().vivas.get('conta2').view.getBounds().y === estado().celulas[0].y + 1);
  await foto(janela, 'sem-faixas');
  janela.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab', modifiers: ['control'] });
  conferir('Ctrl+Tab passa para a próxima tela', await ate(() => naTela() === 'conta1', 5), naTela());
  await clicar('[data-pasta="pasta1"]');
  conferir('clicar na pasta mostra todas juntas', await ate(() => naTela() === 'conta1,conta2', 5), naTela());
  // Arrastar a tela da conta 2 para cima da tela da conta 1, como o jogador faz com o mouse.
  await janela.webContents.executeJavaScript(`(() => {
    const de = document.querySelector('[data-tela="${telaDe('conta2')}"]'), para = document.querySelector('[data-tela="${telaDe('conta1')}"]');
    const dt = new DataTransfer(), y = para.getBoundingClientRect().top + 3;
    de.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    para.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientY: y }));
    para.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientY: y }));
    de.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
  })()`);
  conferir('arrastar com o mouse leva a tela para cima', await ate(() => linhas() === 'conta2 / conta1', 5), linhas());
  acao('tela:posicionar', { tela: telaDe('conta2'), pasta: 'pasta1', antes: null });
  // Cartão "HuntDesk": o app abre dentro da janela, no lugar das contas; o clique numa tela volta ao jogo.
  const filhos = () => janela.contentView.children;
  await clicar('[data-app]');
  conferir('o cartão HuntDesk põe o app no lugar das contas', await ate(() => estado().mostrandoApp && naTela() === '' && filhos().includes(estado().app), 5), naTela());
  const ba = estado().app.getBounds();
  conferir('o app ocupa o espaço das contas', ba.x >= 200 && ba.width > 600 && ba.height > 300, JSON.stringify(ba));
  await foto(janela, 'app');
  await clicar(`[data-tela="${telaDe('conta1')}"]`);
  conferir('clicar numa tela volta ao jogo e o app continua aberto', await ate(() => !estado().mostrandoApp && naTela() === 'conta1'
    && !filhos().includes(estado().app) && !estado().app.webContents.isDestroyed(), 5), naTela());
  acao('tela:juntar', { tela: telaDe('conta1'), com: telaDe('conta2') });
  // Menuzinho: o ⋯ da tela abre uma janela pequena presa à principal, por cima das contas.
  const sobre = () => estado().sobre;
  await clicar(`[data-menu-tela="${telaDe('conta1')}"]`);
  conferir('o ⋯ abre o menuzinho por cima das contas', await ate(() => sobre().isVisible(), 5) && sobre().getParentWindow() === janela);
  const b = sobre().getBounds(), cj = janela.getContentBounds();
  conferir('o menuzinho fica dentro da janela', b.x >= cj.x && b.y >= cj.y && b.x + b.width <= cj.x + cj.width && b.y + b.height <= cj.y + cj.height, JSON.stringify(b));
  sobre().webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
  conferir('Esc fecha o menuzinho', await ate(() => !sobre().isVisible(), 5));
  abrir({ tipo: 'tela', tela: telaDe('conta1'), x: 220, y: 60 });
  await ate(() => sobre().isVisible(), 5);
  await foto(janela, 'grade');
  await foto(janela, 'janelinha', sobre().webContents);
  acao('conta:som', { id: 'conta2', ligado: true });
  conferir('menuzinho continua aberto depois de mexer nas contas', sobre().isVisible());
  fechar();
  abrir({ tipo: 'pasta', pasta: 'pasta1', x: 220, y: 40 });
  await ate(() => sobre().isVisible(), 5);
  await foto(janela, 'pasta', sobre().webContents);
  fechar();
  abrir({ tipo: 'painel', painel: 'medicoes' });
  await ate(() => sobre().isVisible(), 5);
  await foto(janela, 'medicoes', sobre().webContents);
  fechar();
  conferir('fechar esconde a janelinha', !sobre().isVisible());
  v1().view.webContents.forcefullyCrashRenderer();
  conferir('conta que caiu sai da frente', await ate(() => v1().estado === 'caiu', 10) && !v1().view.getVisible(), v1().estado);
  await foto(janela, 'caiu');
  acao('conta:recarregar', { id: 'conta1' });
  conferir('recarregar traz a conta de volta', await ate(() => v1().estado === 'ok', 20) && v1().view.getVisible(), v1().estado);
  // Remover pelo menuzinho da tela: o primeiro clique só pede confirmação, o segundo remove.
  abrir({ tipo: 'tela', tela: telaDe('conta1'), x: 220, y: 60 });
  await ate(() => sobre().isVisible(), 5);
  const remover = () => sobre().webContents.executeJavaScript("document.querySelector('[data-conta=conta2] [data-faz=remover]').click()");
  await remover();
  await espera(1);
  conferir('o primeiro clique em Remover só pede confirmação', estado().cfg.contas.length === 2);
  await remover();
  conferir('o segundo clique remove a conta', await ate(() => estado().cfg.contas.length === 1 && naTela() === 'conta1', 5), naTela());
  fechar();
}

// Foto da barra e das faixas do programa (as páginas das contas não aparecem nela), ou da janelinha
// (wc = estado().sobre.webContents), para conferir o visual.
async function foto(janela, nome, wc = janela.webContents) {
  // Janela coberta por outras não se redesenha; traz para a frente sem tirar o teclado de quem está usando o PC.
  janela.showInactive();
  janela.moveTop();
  await espera(1.5);
  const img = await wc.capturePage();
  const f = path.join(app.getPath('temp'), `huntdesk-autoteste-${nome}.png`);
  fs.writeFileSync(f, img.toPNG());
  console.log('autoteste: foto', f);
}

async function guarda({ acao, estado, conferir, janela, abrir, fechar }) {
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
  abrir({ tipo: 'painel', painel: 'config' });
  await espera(1.5);
  await foto(janela, 'configuracoes', estado().sobre.webContents);
  fechar();
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

// Quadros: com a janela na frente, anota quantos quadros por segundo cada conta desenha (rodar com e sem --quadros=30:
// npm run autoteste:quadros).
async function quadros({ medidor, conferir, janela }) {
  // Pequena e por cima de tudo, num canto: coberta por outra janela, o Chrome a trata como escondida e não desenha.
  janela.setBounds({ x: 0, y: 0, width: 900, height: 500 });
  janela.setAlwaysOnTop(true);
  janela.showInactive();
  await espera(25);
  const contas = Object.entries((medidor.ultima && medidor.ultima.contas) || {});
  const n = (x) => (x == null ? '-' : x.toFixed(0));
  const fps = contas.map(([id, u]) => `${id}: tela ${n(u.fps)}, jogo ${n(u.fpsJogo)}`).join('; ');
  conferir('quadros por segundo medidos', contas.some(([, u]) => u.fps > 0), fps);
  const limite = Number((process.argv.find((a) => a.startsWith('--quadros=')) || '').split('=')[1]) || 0;
  if (limite) conferir(`jogo desenha perto de ${limite} por segundo`, contas.every(([, u]) => u.fpsJogo > limite * 0.8 && u.fpsJogo <= limite * 1.05), fps);
  else conferir('sem o experimento nada é limitado', contas.every(([, u]) => u.fpsJogo == null), fps);
}

function rodar(cenario, ctx) {
  const resultados = [];
  const conferir = (nome, ok, detalhe) => {
    resultados.push(!!ok);
    console.log(`autoteste: ${ok ? 'ok    ' : 'FALHOU'} ${nome}${detalhe ? ' — ' + detalhe : ''}`);
  };
  const fn = { telas, guarda, alivio, quadros }[cenario];
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
