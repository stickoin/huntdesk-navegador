'use strict';
// Conexão em um passo: o site do app, com o jogador já na conta, entrega um código de uso único e o próprio programa o
// troca pela chave no servidor. A chave nunca passa pela página do app nem pela do jogo: vai do servidor para o programa
// e dele para a extensão de cada conta. Essa chave só envia leituras; não lê nem muda os dados da conta.
// O programa pergunta antes de ligar a uma conta nova, numa janela dele, que a página não consegue clicar: uma falha no
// site não pode mandar as leituras para a conta de outra pessoa sem o jogador ver.

const CODIGO = /^[A-Z0-9]{4}-?[A-Z0-9]{4}$/;

class LigarLeitura {
  // origem(): endereço do app; atual(): a ligação de agora ({ origin, key, id, email } ou null);
  // perguntar({ email, antes }): true = o jogador aceitou; aplicar(ligacao): grava e copia para as contas;
  // buscar: net.fetch; evento(nota): anota na planilha (nunca a chave)
  constructor({ origem, atual, perguntar, aplicar, buscar, evento }) {
    Object.assign(this, { origem, atual, perguntar, aplicar, buscar, evento });
    this.ocupado = false;
    this.recusou = false; // disse "agora não": o site não pergunta de novo até o programa abrir outra vez
  }

  // A resposta vai para a página: só ok, o motivo do erro e o e-mail, nunca a chave.
  async ligar(codigo) {
    const code = String(codigo == null ? '' : codigo).trim().toUpperCase();
    if (!CODIGO.test(code)) return { ok: false, erro: 'codigo' };
    if (this.ocupado) return { ok: false, erro: 'ocupado' };
    if (this.recusou) return { ok: false, erro: 'recusado' };
    this.ocupado = true;
    try {
      const nova = await this.parear(code);
      if (nova.erro) return { ok: false, erro: nova.erro };
      const antes = this.atual();
      const mesma = antes && antes.origin === nova.origin && antes.email === nova.email;
      if (!mesma && !(await this.perguntar({ email: nova.email, antes: antes ? antes.email : null }))) {
        this.recusou = true;
        this.revogar(nova);
        this.evento('ligação em um passo: o jogador não aceitou');
        return { ok: false, erro: 'recusado' };
      }
      this.aplicar(nova);
      if (antes) this.revogar(antes); // a chave de antes não fica sobrando na lista de aparelhos da conta
      this.evento('ligação em um passo feita');
      return { ok: true, email: nova.email };
    } finally {
      this.ocupado = false;
    }
  }

  async parear(code) {
    const origin = this.origem();
    let r, b;
    try {
      r = await this.buscar(origin + '/api/pair', {
        method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, name: 'Navegador HuntDesk · Windows' }),
      });
      b = await r.json();
    } catch (e) {
      return { erro: 'rede' };
    }
    if (!r.ok) return { erro: r.status === 403 ? 'codigo' : 'servidor' };
    const nova = { origin, key: b && b.key, id: b && b.id, email: b && b.account && b.account.email };
    if (typeof nova.key !== 'string' || !nova.key) return { erro: 'servidor' };
    if (typeof nova.email !== 'string' || !nova.email) { this.revogar(nova); return { erro: 'servidor' }; } // sem saber a conta, não liga
    return nova;
  }

  revogar(c) {
    this.buscar(`${c.origin}/api/devices?id=${encodeURIComponent(c.id)}`, { method: 'DELETE', credentials: 'omit', headers: { 'X-TM-Key': c.key } })
      .catch(() => this.evento('ligação em um passo: não deu para apagar a chave antiga no servidor'));
  }
}

module.exports = { LigarLeitura };
