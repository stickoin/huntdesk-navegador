'use strict';
// Autoteste (só com a página de teste, nunca com o jogo, e numa pasta de dados temporária): aperta os botões numa
// sequência fixa e confere o resultado.
//   npm run autoteste          → telas: pastas e telas, juntar, separar, desligar, remover e a janelinha
//   npm run autoteste:guarda   → guarda de memória: aviso, "uma vez por subida" e recarga sozinha
//   npm run autoteste:boasvindas → boas-vindas: aparece na primeira abertura e nunca mais
//   npm run autoteste:conexao  → conexão em um passo, com um servidor falso aqui no PC: quem pode pedir, a pergunta e a chave
//   npm run autoteste:copia    → cópia das configurações: exportar com e sem logins, senha, importar somando
//   npm run autoteste:extensoes → extensões de terceiros (uma feita aqui, sem nada de fora): aviso, contas, remover

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { app, BrowserWindow, session } = require('electron');
const config = require('./config');
const { caminhoSeguro } = require('./copia');

const espera = (seg) => new Promise((r) => setTimeout(r, seg * 1000));

// Espera até a condição valer (conferindo a cada segundo) ou o prazo acabar.
async function ate(cond, prazoSeg) {
  for (let i = 0; i < prazoSeg; i++) {
    if (cond()) return true;
    await espera(1);
  }
  return cond();
}

async function telas({ acao, medidor, estado, conferir, janela, abrir, fechar, marcaApp }) {
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
  const linha2 = () => janela.webContents.executeJavaScript(`(() => { const l = document.querySelector('#app-linha2');
    return { texto: l.textContent, cabe: l.scrollWidth <= l.clientWidth }; })()`);
  const frase = await linha2();
  conferir('a frase do cartão do app cabe nele', frase.texto === 'suas hunts, lucro e bosses' && frase.cabe, JSON.stringify(frase));
  // Marca no user agent: um servidorzinho local anota o que cada página manda, como o site do app veria.
  const vistos = {};
  const dicas = {}; // o outro cartão de visita do Chrome, com as marcas do navegador
  const srv = http.createServer((req, res) => { vistos[req.url.slice(1)] = req.headers['user-agent']; dicas[req.url.slice(1)] = req.headers['sec-ch-ua'] || ''; res.end(); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const ver = async (wc, nome) => {
    await wc.executeJavaScript(`fetch('http://127.0.0.1:${srv.address().port}/${nome}', { mode: 'no-cors' }).catch(() => {})`);
    return { pagina: await wc.executeJavaScript('navigator.userAgent'), pedido: vistos[nome] || '' };
  };
  const temMarca = (u) => u.pagina.includes('HuntDeskNavegador') || u.pedido.includes('HuntDeskNavegador');
  const uaApp = await ver(estado().app.webContents, 'app');
  conferir('a marca aparece na vista do app, na página e nos pedidos', uaApp.pagina.endsWith(' ' + marcaApp) && uaApp.pedido.endsWith(' ' + marcaApp), JSON.stringify(uaApp));
  conferir('a marca fica no cofre do app', session.fromPartition('persist:app-huntdesk').getUserAgent().endsWith(' ' + marcaApp));
  const uasContas = await Promise.all([...estado().vivas].map(([id, v]) => ver(v.view.webContents, id)));
  conferir('nenhuma conta do jogo tem a marca', uasContas.length === 2 && uasContas.every((u) => u.pedido && !temMarca(u)), uasContas[0].pedido);
  conferir('nem o cofre das contas', ['conta1', 'conta2'].every((id) => !session.fromPartition('persist:' + id).getUserAgent().includes('HuntDeskNavegador')));
  // O nome do programa também não aparece para o site do jogo, e o Electron fica: não finge ser um Chrome comum.
  const semNome = (u) => !u.includes('HuntDesk') && u.includes('Electron/');
  conferir('as contas do jogo não mostram o nome do programa', uasContas.every((u) => semNome(u.pagina) && semNome(u.pedido)), uasContas[0].pagina);
  conferir('nem nas outras marcas do Chrome', ['conta1', 'conta2'].every((id) => !dicas[id].includes('HuntDesk')), dicas.conta1);
  const c1 = estado().vivas.get('conta1').view.webContents;
  await c1.executeJavaScript(`void window.open('http://127.0.0.1:${srv.address().port}/janela')`, true);
  const abriuJanela = await ate(() => vistos.janela, 5);
  conferir('nem a janela que o jogo abre (a de login, por exemplo)', abriuJanela && semNome(vistos.janela), vistos.janela);
  for (const w of BrowserWindow.getAllWindows()) if (w.webContents.getURL().endsWith('/janela')) w.destroy();
  conferir('nem a barra do programa', !janela.webContents.getUserAgent().includes('HuntDeskNavegador'));
  await clicar(`[data-tela="${telaDe('conta1')}"]`);
  conferir('clicar numa tela volta ao jogo e o app continua aberto', await ate(() => !estado().mostrandoApp && naTela() === 'conta1'
    && !filhos().includes(estado().app) && !estado().app.webContents.isDestroyed(), 5), naTela());
  // Conta aberta depois do app também fica sem a marca.
  acao('conta:adicionar', { nome: 'Depois do app' });
  const depois = estado().cfg.contas[estado().cfg.contas.length - 1].id;
  await ate(() => estado().vivas.get(depois).estado === 'ok', 10);
  const uaDepois = await ver(estado().vivas.get(depois).view.webContents, depois);
  conferir('conta aberta depois do app também não tem a marca', uaDepois.pedido && !temMarca(uaDepois), uaDepois.pedido);
  conferir('nem o nome do programa', semNome(uaDepois.pagina) && semNome(uaDepois.pedido));
  srv.close();
  acao('conta:remover', { id: depois });
  acao('tela:ver', { pasta: 'pasta1', tela: telaDe('conta1') });
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
  conferir('a queda guarda o motivo', !!v1().queda, v1().queda);
  const quedas = fs.readFileSync(path.join(app.getPath('userData'), 'quedas.log'), 'utf8');
  conferir('registro da queda sem nome nem endereço', /\| conta1 \|/.test(quedas) && !/Conta 1|https?:|pagina-teste/.test(quedas), quedas.trim());
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

  // Outros jogos: o jogo da conta nova é o do endereço (só https); conta de outro site vai para a pasta daquele site.
  conferir('Huntera é reconhecido pelo endereço, e um site parecido não', config.ehHuntera('https://huntera.com.br/game')
    && config.ehHuntera('https://www.huntera.com.br/') && !config.ehHuntera('https://huntera.com.br.exemplo.com/') && !config.ehHuntera('https://exemplo.com/huntera.com.br'));
  const nContas = () => estado().cfg.contas.length;
  acao('conta:adicionar', { pasta: 'pasta1', url: 'http://jogo-exemplo.com/game' });
  conferir('endereço sem https não vira conta', nContas() === 1);
  // Pelo "+ Adicionar conta" da lateral, colando o endereço na janelinha, como o jogador faz.
  await clicar('[data-conta-nova="pasta1"]');
  conferir('"+ Adicionar conta" abre a janelinha do endereço', await ate(() => sobre().isVisible(), 5));
  await foto(janela, 'conta-nova', sobre().webContents);
  const colar = (url) => sobre().webContents.executeJavaScript(`document.querySelector('#url-jogo').value = ${JSON.stringify(url)}; document.querySelector('[data-faz=adicionar-url]').click()`);
  await colar('jogo-exemplo.com');
  await espera(1);
  conferir('endereço sem https:// na janelinha mostra o erro e não cria conta', nContas() === 1
    && /https/.test(await sobre().webContents.executeJavaScript("(document.querySelector('#janela-menu .ruim') || {}).textContent || ''")));
  await foto(janela, 'conta-nova-erro', sobre().webContents);
  await colar('https://www.jogo-exemplo.com/game');
  const pastaDoSite = () => pastas().find((p) => p.nome === 'jogo-exemplo.com');
  conferir('outro jogo vai para uma pasta com o nome do site', await ate(() => nContas() === 2 && pastaDoSite() && pastaDoSite().telas.length === 1, 5),
    pastas().map((p) => p.nome).join(', '));
  const nova = estado().cfg.contas[1];
  conferir('a conta nova já aparece na tela', naTela() === nova.id, naTela());
  const lateral = await janela.webContents.executeJavaScript("[...document.querySelectorAll('.linha2')].map((e) => e.textContent).join(' | ')");
  conferir('a lateral mostra o site de cada conta', lateral.includes('jogo-exemplo.com'), lateral);
  acao('conta:adicionar', { pasta: 'pasta1', url: 'https://jogo-exemplo.com/entrar' });
  conferir('outra conta do mesmo site vai para a mesma pasta', nContas() === 3 && pastaDoSite().telas.length === 2, linhas());
  await clicar(`[data-conta-nova="${pastaDoSite().id}"]`);
  await ate(() => sobre().isVisible(), 5);
  await sobre().webContents.executeJavaScript("document.querySelector('[data-faz=mesmo-jogo]').click()");
  conferir('"Mais uma conta deste jogo" usa o site da pasta', await ate(() => nContas() === 4 && pastaDoSite().telas.length === 3, 5), linhas());
  // Downloads nas contas: bloqueados (o jogo não precisa, e uma página falsa poderia empurrar um arquivo). Confere pelo
  // aviso que o programa anota, porque instalado ele não grava a planilha das medições.
  let bloqueado = false;
  const anotar = medidor.evento;
  medidor.evento = (quem, nota) => { if (/^download bloqueado/.test(nota)) bloqueado = true; return anotar.call(medidor, quem, nota); };
  estado().vivas.get(nova.id).view.webContents.downloadURL('data:text/plain,oi');
  conferir('download nas contas é bloqueado', await ate(() => bloqueado, 5));
  medidor.evento = anotar;

  // Nome da conta nova contado dentro da pasta (o id continua no contador geral, por causa do cofre do login).
  const nomesDaPasta = () => pastaDoSite().telas.flatMap((t) => t.contas).map((id) => estado().cfg.contas.find((c) => c.id === id).nome).join(', ');
  conferir('a conta nova é numerada dentro da pasta dela', nomesDaPasta() === 'Conta 1, Conta 2, Conta 3' && nova.id === 'conta5', `${nomesDaPasta()} (${nova.id})`);
  // Dois cliques na tela da lateral: o menuzinho abre com o nome pronto para trocar.
  fechar();
  const telaNova = telaDe(nova.id);
  await janela.webContents.executeJavaScript(`(() => { const sel = '[data-tela="${telaNova}"]'; document.querySelector(sel).click(); document.querySelector(sel).click(); })()`);
  conferir('dois cliques na tela abrem o nome da conta para trocar', await ate(() => sobre().isVisible(), 5)
    && await sobre().webContents.executeJavaScript("document.activeElement.classList.contains('nome-conta')"));
  await sobre().webContents.executeJavaScript("(() => { const i = document.activeElement; i.value = 'Treino'; i.dispatchEvent(new Event('change', { bubbles: true })); })()");
  conferir('o nome novo fica guardado', await ate(() => estado().cfg.contas.find((c) => c.id === nova.id).nome === 'Treino', 5));
  const sigla = await janela.webContents.executeJavaScript(`document.querySelector('[data-tela="${telaNova}"] .ini').textContent`);
  conferir('a sigla acompanha o nome', sigla === 'TR', sigla);
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

// Boas-vindas: na pasta de dados nova deste teste, é a primeira abertura.
async function boasvindas({ estado, conferir, janela, abrirBoasVindas }) {
  const bv = () => estado().boasVindas;
  conferir('aparece na primeira abertura', await ate(() => bv() && bv().isVisible(), 10));
  conferir('presa à janela principal, que espera ela fechar', bv().getParentWindow() === janela && bv().isModal() && !janela.isEnabled());
  await espera(1);
  const clicar = (id) => { bv().webContents.executeJavaScript(`document.querySelector('#${id}').click()`).catch(() => {}); };
  const texto = await bv().webContents.executeJavaScript('document.body.innerText');
  conferir('fala das contas e do app', ['organiza', 'XP por hora', 'lucro', 'bosses', 'progresso'].every((t) => texto.includes(t)), texto.replace(/\s+/g, ' '));
  const cabe = await bv().webContents.executeJavaScript('document.documentElement.scrollHeight <= window.innerHeight');
  conferir('tudo cabe na janela, sem rolar', cabe);
  await foto(janela, 'boas-vindas', bv().webContents);
  // Conta como vista assim que aparece: mesmo fechando o programa com ela aberta, não volta.
  conferir('já fica anotada como vista', !config.carregar().boasVindas);
  clicar('fechar');
  conferir('o botão Fechar fecha e devolve a janela principal', await ate(() => !bv(), 5) && janela.isEnabled());
  conferir('fechar não abre o app', !estado().mostrandoApp);
  await espera(1);
  const arquivo = path.join(app.getPath('userData'), 'config.json');
  conferir('na próxima abertura não aparece de novo', fs.existsSync(arquivo) && config.carregar().boasVindas === false);
  fs.writeFileSync(arquivo, JSON.stringify({ versao: 3, contas: [{ id: 'conta1', nome: 'Minha conta' }] }));
  conferir('quem já usava o programa não vê', config.carregar().boasVindas === false);
  fs.writeFileSync(arquivo, '{ estragado');
  conferir('quem tinha configuração estragada não vê', config.carregar().boasVindas === false);
  fs.rmSync(arquivo, { force: true });
  conferir('sem configuração nenhuma, é a primeira vez', config.carregar().boasVindas === true);
  // O outro botão (a tela é aberta de novo só neste teste).
  abrirBoasVindas();
  await ate(() => bv() && bv().isVisible(), 10);
  await espera(1);
  clicar('conhecer');
  conferir('Conhecer o app fecha e abre o app no lugar das contas', await ate(() => !bv() && estado().mostrandoApp && estado().app, 5));
}

// Conexão em um passo: nada sai para a internet. O servidor falso faz o papel do app.huntdesk.com.br.
async function conexao({ acao, estado, conferir, janela, respostasTeste, origemDoApp }) {
  const pedidos = [];
  const srv = http.createServer((req, res) => {
    let corpo = '';
    req.on('data', (d) => { corpo += d; });
    req.on('end', () => {
      if (req.url === '/redir') { res.writeHead(302, { Location: 'https://example.com/' }); return res.end(); }
      if (req.url === '/pagina') { res.setHeader('Content-Type', 'text/html'); return res.end('<!doctype html><iframe id="q" srcdoc="<p>quadro</p>"></iframe>'); }
      pedidos.push({ metodo: req.method, url: req.url, chave: req.headers['x-tm-key'] });
      if (req.url === '/api/pair') {
        const code = JSON.parse(corpo).code;
        if (code === 'ERRA-DO00') { res.statusCode = 403; return res.end('{"ok":false}'); }
        const email = code.startsWith('BBBB') ? 'b@teste' : 'a@teste';
        return res.end(JSON.stringify({ ok: true, key: 'chave-secreta-' + code, id: 'id-' + code, account: { email } }));
      }
      res.end('{"ok":true}');
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const origem = 'http://127.0.0.1:' + srv.address().port;
  origemDoApp(origem);
  await espera(5);
  acao('app:mostrar');
  const wc = () => estado().app.webContents;
  const ligar = (codigo) => wc().executeJavaScript(`window.huntdeskNavegador.ligarLeitura(${JSON.stringify(codigo)})`);
  const pares = () => pedidos.filter((p) => p.url === '/api/pair').length;
  const apagados = () => pedidos.filter((p) => p.metodo === 'DELETE').map((p) => p.chave);
  const nuvem = () => estado().cfg.huntdesk && estado().cfg.huntdesk.cloud;

  // Quem pode pedir
  await ate(() => !wc().isLoading(), 10);
  conferir('de um endereço que não é o do app, não pede ao servidor', (await ligar('AAAA-1111')).erro === 'origem' && pares() === 0);
  await wc().loadURL(origem + '/pagina');
  const naConta = await estado().vivas.get('conta1').view.webContents.executeJavaScript('typeof window.huntdeskNavegador');
  conferir('as contas do jogo não têm a função', naConta === 'undefined', naConta);
  conferir('a barra do programa também não', (await janela.webContents.executeJavaScript('typeof window.huntdeskNavegador')) === 'undefined');
  const quadro = await wc().executeJavaScript("document.querySelector('#q').contentWindow.huntdeskNavegador === undefined");
  conferir('um quadro dentro da página também não', quadro);
  const r0 = await ligar('nada disso');
  conferir('código fora do formato nem vai ao servidor', r0.erro === 'codigo' && pares() === 0, JSON.stringify(r0));
  const rErro = await ligar('ERRA-DO00');
  conferir('código recusado pelo servidor volta como erro', rErro.erro === 'codigo' && !nuvem(), JSON.stringify(rErro));
  acao('tela:ver', { pasta: 'pasta1', tela: 'tela1' });
  conferir('com o app fora da tela, não pergunta nada', (await ligar('AAAA-1111')).erro === 'fora da tela' && respostasTeste.perguntas.length === 0);
  acao('app:mostrar');

  // A primeira vez pergunta, e a chave não volta para a página
  respostasTeste.aceitar = true;
  const r1 = await ligar('aaaa-1111');
  conferir('a primeira vez pergunta, com o e-mail da conta', respostasTeste.perguntas.length === 1 && respostasTeste.perguntas[0].email === 'a@teste' && respostasTeste.perguntas[0].antes === null, JSON.stringify(respostasTeste.perguntas));
  conferir('a página recebe só ok e o e-mail, sem a chave', r1.ok && r1.email === 'a@teste' && Object.keys(r1).join() === 'ok,email' && !JSON.stringify(r1).includes('chave-secreta'), JSON.stringify(r1));
  conferir('o programa guarda a chave', nuvem() && nuvem().key === 'chave-secreta-AAAA-1111' && nuvem().origin === origem);
  conferir('nem a barra recebe a chave', !('huntdesk' in (await janela.webContents.executeJavaScript('E'))));

  // No arquivo a chave fica cifrada, e abre de novo
  await espera(1);
  const bruto = fs.readFileSync(path.join(app.getPath('userData'), 'config.json'), 'utf8');
  conferir('no config.json a chave fica cifrada', !bruto.includes('chave-secreta') && bruto.includes('chaveCifrada'));
  const relido = config.carregar();
  config.abrirChave(relido);
  conferir('e abre de novo ao ler o arquivo', relido.huntdesk.cloud.key === 'chave-secreta-AAAA-1111' && relido.huntdesk.cloud.email === 'a@teste');

  // Mesma conta: não pergunta e troca a chave
  const r2 = await ligar('AAAA-2222');
  conferir('a mesma conta não pergunta de novo', r2.ok && respostasTeste.perguntas.length === 1, JSON.stringify(r2));
  conferir('e apaga a chave antiga no servidor', await ate(() => apagados().includes('chave-secreta-AAAA-1111'), 3) && nuvem().key === 'chave-secreta-AAAA-2222', JSON.stringify(apagados()));

  // Outra conta: pergunta; com o não, nada muda e a chave nova é apagada
  respostasTeste.aceitar = false;
  const r3 = await ligar('BBBB-1111');
  conferir('outra conta pergunta, dizendo qual é a de agora', respostasTeste.perguntas[1] && respostasTeste.perguntas[1].email === 'b@teste' && respostasTeste.perguntas[1].antes === 'a@teste', JSON.stringify(respostasTeste.perguntas[1]));
  conferir('Agora não mantém a ligação de antes', r3.erro === 'recusado' && nuvem().key === 'chave-secreta-AAAA-2222', JSON.stringify(r3));
  conferir('e apaga a chave que foi recusada', await ate(() => apagados().includes('chave-secreta-BBBB-1111'), 3), JSON.stringify(apagados()));
  const antes = pares();
  conferir('depois do não, o site não insiste até abrir o programa de novo', (await ligar('BBBB-2222')).erro === 'recusado' && pares() === antes && respostasTeste.perguntas.length === 2);

  // Redirecionamento para fora do site
  await wc().loadURL(origem + '/redir').catch(() => {});
  conferir('redirecionamento para outro site é barrado', !wc().getURL().includes('example.com'), wc().getURL());
  srv.close();
}

// Aliviar: o Chrome da conta 1 recebe o aviso de "sem memória" sem recarregar a página.
// Cópia das configurações. O "login" é de teste: um cookie e um Local Storage postos aqui na conta 1.
async function copia({ acao, estado, conferir, janela, abrir, fechar, respostasTeste, copia: fazer }) {
  const dados = app.getPath('userData');
  const arq = (nome) => path.join(dados, nome + '.huntdesk');
  const cfg = () => estado().cfg;
  const telaDe = (id) => cfg().pastas.flatMap((p) => p.telas).find((t) => t.contas.includes(id)).id;
  const pronta = (id) => estado().vivas.has(id) && estado().vivas.get(id).estado === 'ok';
  await ate(() => pronta('conta1'), 20);
  await session.fromPartition('persist:conta1').cookies.set({ url: 'https://jogo-exemplo.com/', name: 'sessao', value: 'valor-de-teste-123',
    httpOnly: true, secure: true, expirationDate: Math.round(Date.now() / 1000) + 86400 });
  await estado().vivas.get('conta1').view.webContents.executeJavaScript("localStorage.setItem('lembrar', 'guardado-no-site')");
  acao('conta:cor', { id: 'conta1', cor: 3 });
  acao('guarda:config', { limiteMb: 3000 });
  const EXT = 'abcdefghijklmnopabcdefghijklmnop';
  cfg().extensoes.push({ id: EXT, nome: 'Extensão da cópia', versao: '1.0', origem: 'loja', contas: ['conta1'], pendente: true });

  respostasTeste.arquivoCopia = arq('sem');
  let r = await fazer('exportar', {});
  const sem = fs.readFileSync(arq('sem'), 'utf8');
  conferir('exportar sem logins grava pastas, contas e opções', r.ok && r.contas === 2 && sem.includes('"Conta 1"') && sem.includes('3000')
    && JSON.parse(sem).logins === null, JSON.stringify(r));
  conferir('sem logins, nada do login vai no arquivo', !sem.includes('valor-de-teste') && !sem.includes('guardado-no-site'));
  const extNoArquivo = JSON.parse(sem).extensoes;
  conferir('a lista de extensões vai no arquivo, sem as pastas', extNoArquivo.length === 1 && extNoArquivo[0].contas[0] === 'conta1'
    && !sem.includes('extensoes\\terceiros') && !('versao' in extNoArquivo[0]), JSON.stringify(extNoArquivo));
  r = await fazer('exportar', { senha: 'curta' });
  conferir('senha curta é recusada', r.erro === 'senha-curta', JSON.stringify(r));
  respostasTeste.arquivoCopia = arq('com');
  r = await fazer('exportar', { senha: 'senha-do-teste' });
  const com = fs.readFileSync(arq('com'), 'utf8');
  conferir('com logins, eles vão trancados (nada legível no arquivo)', r.ok && r.logins && JSON.parse(com).logins
    && !com.includes('valor-de-teste') && !com.includes('guardado-no-site'), JSON.stringify(r));

  // A conta 1 some (com o login) e o limite muda: importar traz de volta.
  acao('conta:remover', { id: 'conta1' });
  acao('guarda:config', { limiteMb: 2048 });
  await espera(1);
  r = await fazer('escolher', {});
  conferir('escolher o arquivo mostra o que ele tem', r.ok && r.pastas === 1 && r.contas === 2 && r.logins, JSON.stringify(r));
  r = await fazer('importar', { senha: 'senha-errada' });
  conferir('senha errada não importa nada', r.erro === 'senha' && cfg().contas.length === 1, JSON.stringify(r));
  r = await fazer('importar', { senha: 'senha-do-teste' });
  const nova = cfg().contas.find((c) => c.nome === 'Conta 1');
  conferir('importar soma só o que falta, com número novo', r.ok && r.novas === 1 && r.iguais === 1 && r.comLogin === 1 && nova
    && nova.id === 'conta3' && nova.cor === 3, JSON.stringify(r));
  conferir('as opções do arquivo passam a valer', cfg().guarda.limiteMb === 3000, String(cfg().guarda.limiteMb));
  const extVolta = cfg().extensoes.find((x) => x.id === EXT);
  conferir('a extensão volta presa à conta importada, ainda por instalar', extVolta && extVolta.pendente && extVolta.contas.join() === 'conta3'
    && r.extensoesFaltando === 0, JSON.stringify(extVolta));
  const ck = await session.fromPartition('persist:conta3').cookies.get({ name: 'sessao' });
  conferir('o login (cookie) volta na conta importada', ck.length === 1 && ck[0].value === 'valor-de-teste-123' && ck[0].httpOnly);
  acao('tela:ver', { pasta: cfg().atual.pasta, tela: telaDe('conta3') });
  await ate(() => pronta('conta3'), 15);
  const guardado = await estado().vivas.get('conta3').view.webContents.executeJavaScript("localStorage.getItem('lembrar')");
  conferir('o que o site guardou no PC (Local Storage) volta junto', guardado === 'guardado-no-site', String(guardado));

  respostasTeste.arquivoCopia = arq('sem');
  await fazer('escolher', {});
  r = await fazer('importar', {});
  conferir('importar de novo não repete contas', r.ok && r.novas === 0 && r.iguais === 2 && cfg().contas.length === 2, JSON.stringify(r));
  fs.writeFileSync(arq('estranho'), '{"oi": 1}');
  respostasTeste.arquivoCopia = arq('estranho');
  r = await fazer('escolher', {});
  conferir('arquivo que não é cópia é recusado', r.erro === 'arquivo', JSON.stringify(r));
  const cofre = path.join(dados, 'Partitions', 'conta9');
  conferir('login do arquivo só entra nas pastas de login do cofre', !caminhoSeguro(cofre, 'Local Storage/../../config.json')
    && !caminhoSeguro(cofre, 'Network/Cookies') && !caminhoSeguro(cofre, 'C:/x') && !!caminhoSeguro(cofre, 'Local Storage/leveldb/000003.log'));

  // Pela janela de Configurações, como o jogador faz.
  abrir({ tipo: 'painel', painel: 'config' });
  await ate(() => estado().sobre.isVisible(), 5);
  const sw = estado().sobre.webContents;
  respostasTeste.arquivoCopia = arq('pela-tela');
  await sw.executeJavaScript("document.querySelector('#copia-exportar').click()");
  await ate(() => fs.existsSync(arq('pela-tela')), 5);
  await espera(0.5);
  const aviso = await sw.executeJavaScript("document.querySelector('#copia-aviso').textContent");
  conferir('o botão Exportar guarda o arquivo e avisa', fs.existsSync(arq('pela-tela')) && /Cópia guardada/.test(aviso), aviso);
  await sw.executeJavaScript("document.querySelector('#copia-levar').click()");
  await sw.executeJavaScript("document.querySelector('#copia-senha').value = 'senha-do-teste'; document.querySelector('#copia-senha2').value = 'outra-senha'; document.querySelector('#copia-exportar').click()");
  await espera(0.5);
  const diferentes = await sw.executeJavaScript("document.querySelector('#copia-aviso').textContent");
  conferir('senhas diferentes são avisadas na hora', /não são iguais/.test(diferentes), diferentes);
  await foto(janela, 'copia-exportar', sw);
  respostasTeste.arquivoCopia = arq('com');
  await sw.executeJavaScript("document.querySelector('#copia-importar').click()");
  await espera(1);
  conferir('o botão Importar mostra o que vem e pede a senha', await sw.executeJavaScript("!!document.querySelector('#copia-confirmar') && !!document.querySelector('#copia-senha-abrir')"));
  await foto(janela, 'copia-importar', sw);
  await sw.executeJavaScript("document.querySelector('#copia-sem-logins').click()");
  await espera(1);
  const fim = await sw.executeJavaScript("document.querySelector('#copia-aviso').textContent");
  conferir('importar sem os logins pela tela funciona', /Nada novo/.test(fim), fim);
  fechar();
}

// Extensões de terceiros, com a extensão de teste da pasta src/teste/extensao-teste (feita aqui; só marca a página).
async function extensoes({ acao, estado, conferir, janela, abrir, fechar, respostasTeste, extensoes: fazer }) {
  const cfg = () => estado().cfg;
  const pronta = (id) => estado().vivas.has(id) && estado().vivas.get(id).estado === 'ok';
  await ate(() => pronta('conta1') && pronta('conta2'), 20);
  const srv = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<p>pagina</p>'); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const pagina = 'http://127.0.0.1:' + srv.address().port + '/';
  const marcada = async (wc) => { await wc.loadURL(pagina); await espera(0.5); return wc.executeJavaScript('document.documentElement.dataset.extensaoTeste || ""'); };
  const contaWc = (id) => estado().vivas.get(id).view.webContents;
  const tem = (part, id) => !!session.fromPartition(part).extensions.getExtension(id);

  let r = await fazer('preparar', { link: 'https://exemplo.com/nada' });
  conferir('link que não é da loja é recusado', r.erro && /link da Chrome Web Store/.test(r.texto), JSON.stringify(r));
  r = await fazer('preparar', { link: 'https://chromewebstore.google.com/detail/huntdesk/faeiljaidolgnnaodgddllcnjepaknmb' });
  conferir('a do HuntDesk não entra como de terceiros', r.erro && /já vem/.test(r.texto), JSON.stringify(r));
  respostasTeste.pastaExtensao = path.join(__dirname, 'teste', 'extensao-teste');
  r = await fazer('pasta', {});
  conferir('antes de instalar, mostra o que ela pede e o que não funciona aqui', r.ok && r.nome === 'Extensão de teste do HuntDesk'
    && r.pede.some((f) => /inclusive o que você digita e o login/.test(f)) && r.naoFunciona.some((f) => /botão direito/.test(f)), JSON.stringify(r));
  r = await fazer('instalar', {});
  conferir('sem o "Entendi", não instala', r.erro === 'entendi' && !cfg().extensoes.length);
  r = await fazer('instalar', { entendi: true });
  const id = r.id;
  conferir('com o "Entendi", instala sem ligar em conta nenhuma', r.ok && cfg().extensoes.length === 1 && !cfg().extensoes[0].contas.length
    && !tem('persist:conta1', id) && !tem('persist:conta2', id), JSON.stringify(r));

  // Pela tela, como o jogador faz: marca a conta 1 no painel.
  // O app do HuntDesk aberto uma vez (o cofre dele tem de continuar sem extensão); depois volta às contas.
  acao('app:mostrar');
  await ate(() => estado().app, 5);
  acao('tela:ver', { pasta: 'pasta1', tela: 'todas' });
  abrir({ tipo: 'painel', painel: 'extensoes' });
  await ate(() => estado().sobre.isVisible(), 5);
  await espera(1);
  const sw = estado().sobre.webContents;
  await sw.executeJavaScript(`document.querySelector('[data-ext="${id}"] [data-ext-conta="conta1"]').click()`);
  await ate(() => cfg().extensoes[0].contas.join() === 'conta1', 5);
  conferir('marcar a conta no painel liga só nela', tem('persist:conta1', id) && !tem('persist:conta2', id), cfg().extensoes[0].contas.join());
  conferir('nunca no app do HuntDesk', !session.fromPartition('persist:app-huntdesk').extensions.getAllExtensions().length);
  conferir('a página da conta 1 recebe a extensão', (await marcada(contaWc('conta1'))) === 'ligada');
  conferir('a da conta 2 não', (await marcada(contaWc('conta2'))) === '');
  let textoPainel = '';
  const painelCerto = async () => {
    textoPainel = await sw.executeJavaScript("document.querySelector('#janela-painel').innerText");
    return /Extensão de teste do HuntDesk/.test(textoPainel) && /Conta 1/.test(textoPainel) && /F5/.test(textoPainel) && estado().sobre.isVisible();
  };
  let mostra = false;
  for (let i = 0; i < 5 && !(mostra = await painelCerto()); i++) await espera(1);
  conferir('o painel mostra a extensão, as contas e o aviso de recarregar', mostra, textoPainel.replace(/\s+/g, ' ').slice(-250));
  await foto(janela, 'extensoes', sw);
  // A tela dela abre numa conta onde está ligada.
  const antes = BrowserWindow.getAllWindows().length;
  r = await fazer('telinha', { id });
  await espera(1);
  const telinha = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().startsWith(`chrome-extension://${id}/`));
  conferir('abrir a tela dela', r.ok && telinha && BrowserWindow.getAllWindows().length === antes + 1, JSON.stringify(r));
  if (telinha) telinha.destroy();
  // Fechar a tela dela devolve o foco à janela principal, que fecha a janelinha (como qualquer clique fora): abre de novo.
  await espera(0.5);
  abrir({ tipo: 'painel', painel: 'extensoes' });
  await ate(() => estado().sobre.isVisible(), 5);
  await espera(1);
  // "todas desta pasta", depois desmarcar a conta 1
  await sw.executeJavaScript(`document.querySelector('[data-ext="${id}"] [data-ext-todas]').click()`);
  conferir('"todas desta pasta" liga nas duas', await ate(() => tem('persist:conta2', id) && cfg().extensoes[0].contas.length === 2, 5));
  r = await fazer('contas', { id, contas: ['conta2'] });
  conferir('desmarcar tira da conta e pede F5', r.ok && r.recarregar === 1 && !tem('persist:conta1', id) && tem('persist:conta2', id), JSON.stringify(r));
  // Conta nova não ganha a extensão sozinha; conta religada ganha de novo a que estava marcada.
  acao('conta:adicionar', { nome: 'Nova' });
  const nova = cfg().contas[cfg().contas.length - 1].id;
  await ate(() => pronta(nova), 10);
  conferir('conta nova não ganha extensão sozinha', !tem('persist:' + nova, id));
  acao('conta:remover', { id: nova });
  // Remover de vez
  await sw.executeJavaScript(`document.querySelector('[data-ext="${id}"] [data-ext-faz="remover"]').click()`);
  await espera(0.5);
  conferir('o primeiro clique em Remover só pede confirmação', cfg().extensoes.length === 1);
  await sw.executeJavaScript(`document.querySelector('[data-ext="${id}"] [data-ext-faz="remover"]').click()`);
  const pasta = path.join(app.getPath('userData'), 'extensoes', 'terceiros');
  // O Windows só apaga a pasta de vez quando o Chrome solta os arquivos dela; ao abrir o programa, o que sobrou é limpo.
  conferir('o segundo remove: sai das contas e os arquivos somem', await ate(() => !cfg().extensoes.length, 5) && !tem('persist:conta2', id)
    && await ate(() => !fs.readdirSync(pasta).length, 10), fs.readdirSync(pasta).join());
  // Instalar pela tela, como o jogador faz: escolhe a pasta, lê o aviso, marca "Entendi" e instala.
  await sw.executeJavaScript("document.querySelector('#ext-pasta').click()");
  await espera(1);
  const instalarAntes = await sw.executeJavaScript("(() => { const b = document.querySelector('#ext-instalar'); return b ? b.disabled : null; })()");
  const telaInstalar = await sw.executeJavaScript("document.querySelector('#janela-painel').innerText");
  conferir('a tela de instalação mostra o aviso e só deixa instalar com o "Entendi"', instalarAntes === true && /podem dar banimento/.test(telaInstalar)
    && /inclusive o login/.test(telaInstalar), telaInstalar.replace(/\s+/g, ' ').slice(0, 160));
  await foto(janela, 'extensoes-instalar', sw);
  await sw.executeJavaScript("document.querySelector('#ext-entendi').click(); document.querySelector('#ext-instalar').click()");
  conferir('com o "Entendi", o botão Instalar instala', await ate(() => cfg().extensoes.length === 1, 5));
  fechar();
  srv.close();
}

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
  const fn = { telas, guarda, alivio, quadros, boasvindas, conexao, copia, extensoes }[cenario];
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
