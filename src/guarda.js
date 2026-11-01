'use strict';
// Guarda de memória: a cada medição confere se alguma conta passou do limite escolhido pelo jogador.
// Conforme a escolha dele nas Configurações, avisa (na faixa da conta e no Windows) ou recarrega só a página.
// Depois de recarregar, nunca entra na conta, clica ou volta à hunt: se o jogo pedir login, espera o jogador.

const SEGUIDAS = 2; // duas medições seguidas acima do limite (20 s): um pico rápido não conta
const ESPERA_RECARGA = 10 * 60000; // recarga sozinha no máximo uma vez a cada 10 min por conta

const mb = (x) => Math.round(x).toLocaleString('pt-BR');

class Guarda {
  // config(): o config atual; recarregar(id): recarrega a página; notificar(titulo, texto, id); evento(id, nota)
  constructor({ config, recarregar, notificar, evento }) {
    Object.assign(this, { config, recarregar, notificar, evento });
    this.acima = new Map(); // id → medições seguidas acima do limite
    this.ultimaRecarga = new Map(); // id → quando a guarda recarregou pela última vez
    this.alertas = new Map(); // id → { quando, ram, limite, recarregada, motivo }
    this.alertaTotal = null;
    this.totalAcima = false;
  }

  // contas: [{ id, nome, viva }]
  vigiar(amostra, contas) {
    const g = this.config().guarda;
    for (const c of contas) {
      const u = amostra.contas[c.id];
      if (!c.viva || !u || u.ram == null || u.ram < g.limiteMb) { this.acima.delete(c.id); continue; }
      const n = (this.acima.get(c.id) || 0) + 1;
      this.acima.set(c.id, n);
      if (n !== SEGUIDAS) continue; // age uma vez por subida; volta a agir quando a memória baixar e subir de novo
      const agora = Date.now();
      const podeRecarregar = g.acao === 'recarregar' && agora - (this.ultimaRecarga.get(c.id) || 0) >= ESPERA_RECARGA;
      if (podeRecarregar) {
        this.ultimaRecarga.set(c.id, agora);
        this.alertas.set(c.id, { quando: agora, ram: u.ram, limite: g.limiteMb, recarregada: true });
        this.evento(c.id, `guarda: passou de ${g.limiteMb} MB (${Math.round(u.ram)} MB); recarregada sozinha`);
        this.recarregar(c.id);
        this.notificar(`${c.nome} foi recarregada`,
          `Passou do limite de ${mb(g.limiteMb)} MB (estava com ${mb(u.ram)} MB). Só a página foi recarregada; se o jogo pedir login, entre você mesmo.`, c.id);
      } else {
        const motivo = g.acao === 'recarregar' ? 'a recarga sozinha espera 10 min entre uma e outra' : '';
        this.alertas.set(c.id, { quando: agora, ram: u.ram, limite: g.limiteMb, recarregada: false, motivo });
        this.evento(c.id, `guarda: passou de ${g.limiteMb} MB (${Math.round(u.ram)} MB); aviso`);
        this.notificar(`${c.nome} passou do limite de memória`,
          `Está com ${mb(u.ram)} MB (limite ${mb(g.limiteMb)} MB). Abra o HuntDesk e aperte Recarregar nessa conta.${motivo ? ' (' + motivo + ')' : ''}`, c.id);
      }
    }

    // Limite do total: só avisa. A memória da placa de vídeo é dividida entre as contas, então o programa não sabe
    // qual delas recarregar.
    const t = amostra.total;
    if (g.avisoTotalMb && t && t.ram >= g.avisoTotalMb) {
      if (!this.totalAcima) {
        this.totalAcima = true;
        this.alertaTotal = { quando: Date.now(), ram: t.ram, limite: g.avisoTotalMb };
        this.evento('total', `guarda: total passou de ${g.avisoTotalMb} MB (${Math.round(t.ram)} MB); aviso`);
        this.notificar('O HuntDesk passou do limite total de memória',
          `Está com ${mb(t.ram)} MB no total (limite ${mb(g.avisoTotalMb)} MB). Veja em Medições qual conta está crescendo mais.`, null);
      }
    } else if (t) {
      this.totalAcima = false;
    }
  }

  dispensar(id) {
    if (id === 'total') this.alertaTotal = null;
    else this.alertas.delete(id);
  }

  // Conta recarregada pelo jogador, desligada ou removida: começa do zero.
  esquecer(id) {
    this.alertas.delete(id);
    this.acima.delete(id);
  }

  resumo() {
    return { contas: Object.fromEntries(this.alertas), total: this.alertaTotal };
  }
}

module.exports = { Guarda };
