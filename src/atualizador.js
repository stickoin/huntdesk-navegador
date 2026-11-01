'use strict';
// Atualização automática do .exe pelo GitHub (Releases). Baixa a versão nova sem atrapalhar e instala quando o jogador
// fechar o programa, ou na hora, se ele apertar "Reiniciar agora". Nunca reinicia sozinho: pode ter conta caçando.
// Não roda rodando do projeto (npm start), nos testes nem na versão da loja (lá quem atualiza é a própria loja).

const { app } = require('electron');

const INTERVALO = 6 * 60 * 60000; // procura de novo a cada 6 h

class Atualizador {
  // aoMudar(): avisa a barra que o estado mudou; evento(nota): anota na planilha de medições
  constructor({ ativo, aoMudar, evento }) {
    this.aoMudar = aoMudar;
    this.evento = evento;
    this.estado = { fase: 'parado' }; // parado | procurando | baixando | pronta | erro
    this.ativo = ativo && app.isPackaged && !process.windowsStore;
    if (!this.ativo) return;
    const { autoUpdater } = require('electron-updater');
    this.au = autoUpdater;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('checking-for-update', () => this.mudar({ fase: 'procurando' }));
    autoUpdater.on('update-not-available', () => this.mudar({ fase: 'parado' }));
    autoUpdater.on('download-progress', (p) => this.mudar({ fase: 'baixando', pct: Math.round(p.percent || 0) }));
    autoUpdater.on('update-downloaded', (i) => {
      this.mudar({ fase: 'pronta', versao: i.version });
      this.evento(`versão ${i.version} baixada; instala ao fechar`);
    });
    // Sem internet ou sem versão publicada ainda: não incomoda o jogador, só anota.
    autoUpdater.on('error', (e) => {
      this.mudar({ fase: 'erro' });
      this.evento('atualização: ' + String(e && e.message || e).split('\n')[0].slice(0, 120));
    });
  }

  comecar() {
    if (!this.ativo) return;
    const procurar = () => this.au.checkForUpdates().catch(() => { /* já tratado no 'error' */ });
    setTimeout(procurar, 30000); // deixa as contas abrirem primeiro
    setInterval(procurar, INTERVALO);
  }

  // Só quando o jogador aperta o botão.
  reiniciar() {
    if (this.ativo && this.estado.fase === 'pronta') this.au.quitAndInstall(true, true);
  }

  mudar(estado) {
    this.estado = estado;
    this.aoMudar();
  }
}

module.exports = { Atualizador };
