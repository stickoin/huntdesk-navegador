'use strict';
// Boas-vindas da primeira abertura: só os dois botões.
document.querySelector('#fechar').addEventListener('click', () => window.p0.boasVindas('fechar'));
document.querySelector('#conhecer').addEventListener('click', () => window.p0.boasVindas('app'));
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') window.p0.boasVindas('fechar'); });
