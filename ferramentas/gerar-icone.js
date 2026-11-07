'use strict';
// Gera o ícone do programa (src/ui/icone.png) e os ladrilhos da loja (build/appx/) a partir do desenho abaixo: um
// aventureiro com uma tocha na entrada de uma caverna, feito ponto a ponto. Cada ponto vira um quadrado inteiro, para
// continuar 8 bits em qualquer tamanho. Para rodar: npx electron ferramentas/gerar-icone.js

const fs = require('node:fs');
const path = require('node:path');
const { app, nativeImage } = require('electron');

const COR = {
  B: '#8b7340', k: '#1a160d', g: '#e2b65c', o: '#7a5426', r: '#f05454', x: '#0a0c11', s: '#c3cad8', S: '#7d8698',
  q: '#a39c8a', c: '#7a7466', C: '#57524a', v: '#e8562a', f: '#ff9f2e', F: '#ffd65c', e: '#f0c08a',
};
const DESENHO = [
  '..BBBBBBBBBBBB..',
  '.BkkkkkkkkkkkkB.',
  'BkkkkcqqqcckkkkB',
  'BkkkcqqccccCkkkB',
  'BkkcqrxxxvccckkB',
  'BkcqrrxxxfxccckB',
  'BkqcsssxfFfxcckB',
  'BkccsxexfFfxCckB',
  'BkcrsssxxoxxcckB',
  'BkcrSSSseoxxcckB',
  'BkCrgggxxoxxcCkB',
  'BkrrSxSxxxxxcckB',
  'BkccSxSxxxxxcckB',
  'BkCCCCCCCCCCCCkB',
  '.BkkkkkkkkkkkkB.',
  '..BBBBBBBBBBBB..',
];
const FUNDO = '#10141c'; // fundo dos ladrilhos, em volta do ícone

// [arquivo, largura, altura, pontos por ponto do desenho]. O Square44 corta 2 px de cada lado, para encher o quadrado.
const SAIDAS = [
  ['src/ui/icone.png', 512, 512, 32, null],
  ['build/appx/LargeTile.png', 310, 310, 19, FUNDO],
  ['build/appx/Square150x150Logo.png', 150, 150, 9, FUNDO],
  ['build/appx/Wide310x150Logo.png', 310, 150, 9, FUNDO],
  ['build/appx/SmallTile.png', 71, 71, 4, FUNDO],
  ['build/appx/StoreLogo.png', 50, 50, 3, FUNDO],
  ['build/appx/Square44x44Logo.png', 44, 44, 3, FUNDO],
];

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

function pintar(largura, altura, escala, fundo) {
  const buf = Buffer.alloc(largura * altura * 4); // o Electron recebe azul, verde, vermelho e transparência
  const ponto = (x, y, h) => {
    if (x < 0 || y < 0 || x >= largura || y >= altura) return;
    const [r, g, b] = rgb(h);
    buf.set([b, g, r, 255], (y * largura + x) * 4);
  };
  if (fundo) for (let y = 0; y < altura; y++) for (let x = 0; x < largura; x++) ponto(x, y, fundo);
  const dx = Math.floor((largura - 16 * escala) / 2);
  const dy = Math.floor((altura - 16 * escala) / 2);
  DESENHO.forEach((linha, l) => [...linha].forEach((c, i) => {
    if (c === '.') return;
    for (let y = 0; y < escala; y++) for (let x = 0; x < escala; x++) ponto(dx + i * escala + x, dy + l * escala + y, COR[c]);
  }));
  return nativeImage.createFromBitmap(buf, { width: largura, height: altura }).toPNG();
}

app.setPath('userData', path.join(app.getPath('temp'), 'gerar-icone-' + Date.now()));
app.whenReady().then(() => {
  for (const [arquivo, largura, altura, escala, fundo] of SAIDAS) {
    fs.writeFileSync(path.join(__dirname, '..', arquivo), pintar(largura, altura, escala, fundo));
    console.log('gerado:', arquivo, `${largura}x${altura}`);
  }
  app.quit();
});
