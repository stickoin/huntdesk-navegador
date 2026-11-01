'use strict';
// Ponte entre a barra de cima e o programa: só passa os botões, a altura da barra e os números, nada mais.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('p0', {
  acao: (tipo, dados) => ipcRenderer.send('acao', tipo, dados),
  altura: (px) => ipcRenderer.send('altura-topo', px),
  abrirMedicoes: () => ipcRenderer.send('abrir-medicoes'),
  abrirDados: () => ipcRenderer.send('abrir-dados'),
  aoEstado: (fn) => ipcRenderer.on('estado', (e, estado) => fn(estado)),
});
