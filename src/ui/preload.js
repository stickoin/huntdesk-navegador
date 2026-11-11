'use strict';
// Ponte entre a barra (e as janelinhas) e o programa: só passa os botões, o espaço das contas e os números, nada mais.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('p0', {
  acao: (tipo, dados) => ipcRenderer.send('acao', tipo, dados),
  area: (r) => ipcRenderer.send('area', r),
  abrir: (dados) => ipcRenderer.send('abrir', dados),
  fechar: () => ipcRenderer.send('fechar'),
  tamanho: (t) => ipcRenderer.send('tamanho', t),
  menu: () => ipcRenderer.send('menu'),
  abrirMedicoes: () => ipcRenderer.send('abrir-medicoes'),
  abrirDados: () => ipcRenderer.send('abrir-dados'),
  copia: (tipo, dados) => ipcRenderer.invoke('copia', tipo, dados), // exportar e importar as configurações (copia.js)
  extensoes: (tipo, dados) => ipcRenderer.invoke('extensoes', tipo, dados), // extensões de terceiros (extensoes.js)
  boasVindas: (escolha) => ipcRenderer.send('boas-vindas', escolha),
  aoEstado: (fn) => ipcRenderer.on('estado', (e, estado) => fn(estado)),
  aoAbrir: (fn) => ipcRenderer.on('abrir', (e, dados) => fn(dados)),
});
