'use strict';
// Preload da janela da extensão do HuntDesk (a mesma tela do ícone da extensão no Chrome). O Electron não tem o
// chrome.permissions, e sem ele o botão Conectar da conta na nuvem trava. Aqui ele diz "sim": no Chrome é a pergunta
// "permitir acesso a este site?", e o próprio clique do jogador em Conectar já é essa resposta.
// O Chrome do Electron 44 tem dois nomes para as funções da extensão, chrome e browser (objetos separados), e a
// extensão usa browser primeiro: os dois ganham o permissions.
const { contextBridge } = require('electron');

contextBridge.executeInMainWorld({
  func: () => {
    const permissions = { request: () => Promise.resolve(true), contains: () => Promise.resolve(true) };
    for (const api of [globalThis.browser, globalThis.chrome]) {
      if (api && !api.permissions) api.permissions = permissions;
    }
  },
});
