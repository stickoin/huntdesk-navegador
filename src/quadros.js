'use strict';
// Experimento de quadros: só com --quadros=N, rodando pelo projeto (o dono liberou só como experimento em 01/11).
// É a única parte do programa que põe código na página do jogo, e ela só segura o ritmo do desenho: o pedido de "desenhe
// o próximo quadro" (requestAnimationFrame) é atendido no máximo N vezes por segundo. Não clica, não digita e não muda
// nada do jogo — com a janela escondida o jogo já roda a 0 quadros e continua caçando.
const { contextBridge } = require('electron');

const arg = process.argv.find((a) => a.startsWith('--huntdesk-quadros='));
const maximo = Number(arg && arg.split('=')[1]);
if (maximo > 0) contextBridge.executeInMainWorld({ func: limitar, args: [maximo] });

// Roda no mundo do jogo, antes do código dele. Junta os pedidos de quadro e só os atende quando já passou 1/N de segundo.
function limitar(maximo) {
  const pedir = window.requestAnimationFrame.bind(window);
  const intervalo = 1000 / maximo;
  const fila = new Map();
  let numero = 0;
  let pedido = false;
  let ultimo = 0;
  function quadro(t) {
    pedido = false;
    if (t - ultimo < intervalo - 1) { pedido = true; pedir(quadro); return; } // 1 ms de folga para a batida do monitor
    ultimo = t;
    const agora = [...fila.values()];
    fila.clear();
    for (const cb of agora) {
      try { cb(t); } catch (e) { setTimeout(() => { throw e; }); } // erro do jogo aparece como apareceria sem o limite
    }
    document.dispatchEvent(new CustomEvent('huntdesk-quadro')); // para o medidor contar os quadros que o jogo desenhou
  }
  window.requestAnimationFrame = function requestAnimationFrame(cb) {
    fila.set(++numero, cb);
    if (!pedido) { pedido = true; pedir(quadro); }
    return numero;
  };
  window.cancelAnimationFrame = function cancelAnimationFrame(n) { fila.delete(n); };
}
