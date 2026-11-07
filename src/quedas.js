'use strict';
// Registro das quedas de página (quedas.log, na pasta de dados): o único arquivo de diagnóstico do programa instalado,
// aprovado pelo dono em 07/11 porque sem ele o motivo de uma queda some ao fechar o programa. As medições de memória
// continuam sem arquivo. Uma linha por queda, sem nome da conta, endereço ou dado do jogo; nada é enviado.

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const { horaLocal } = require('./medidor');

const MAXIMO = 50; // só as últimas quedas: o arquivo nunca cresce

function anotar({ conta, motivo, codigo, ram, economico }) {
  const linha = [
    horaLocal(new Date()),
    conta,
    motivo,
    `saída ${codigo}`,
    ram == null ? 'memória desconhecida' : `${Math.round(ram)} MB`,
    `versão ${app.getVersion()}`,
    `economia ${economico ? 'ligada' : 'desligada'}`,
  ].join(' | ');
  try {
    const arquivo = path.join(app.getPath('userData'), 'quedas.log');
    let antes = [];
    try { antes = fs.readFileSync(arquivo, 'utf8').split('\n').filter(Boolean); } catch (e) { /* primeira queda */ }
    fs.writeFileSync(arquivo, [...antes.slice(-(MAXIMO - 1)), linha].join('\n') + '\n');
  } catch (e) { /* sem registro, mas a tela continua avisando */ }
}

module.exports = { anotar };
