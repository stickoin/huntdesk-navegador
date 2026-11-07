'use strict';
// Preload da vista do app do HuntDesk, nunca das contas do jogo: a única coisa que o site pode pedir ao programa é ligar
// a leitura com um código de uso único. O programa confere de novo quem pediu e responde só ok ou o motivo do erro.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('huntdeskNavegador', {
  ligarLeitura: (codigo) => ipcRenderer.invoke('app:ligar-leitura', String(codigo)),
});
