# Textos do navegador para o site e para a loja

O dono dispensou a revisão em 02/11. A parte da loja vai para o Microsoft Store. A página do site é do projeto do HuntDesk: este arquivo serve para levar o texto para lá
quando chegar a hora.

---

## 1. Página do navegador no site huntdesk.com.br

**Título:** HuntDesk Navegador: suas contas lado a lado, sem pesar o PC

**Chamada:** Jogue com várias contas ao mesmo tempo, cada uma com o login separado, e veja quanto cada uma gasta.
Quem joga é você: o navegador só organiza.

**O que ele faz**
- **Várias contas juntas.** Cada conta tem o próprio login guardado, sem janela anônima e sem perfil separado.
- **Pastas e telas.** Junte as contas em pastas (uma por jogo, por exemplo). Cada tela mostra de 1 a 4 contas lado a
  lado, e um clique troca de tela. Arraste para mudar a ordem e dê uma cor a cada conta.
- **Outros jogos de navegador.** Cole o endereço do jogo e a conta abre numa pasta própria daquele site.
- **Extensão e app do HuntDesk.** A extensão do HuntDesk já vem ligada nas contas do jogo que o HuntDesk acompanha, e o
  app do HuntDesk abre dentro do navegador.
- **Memória sob controle.** Cada conta mostra quanto usa de memória e de processador. Você escolhe o limite. Se uma
  conta passar dele, o navegador avisa ou recarrega só aquela página, conforme a sua escolha.
- **Mais leve.** Nos nossos testes com 4 contas caçando no Huntera durante 2 horas, ele ficou em até 7,9 GB, enquanto
  um navegador comum passou de 11 GB em poucos minutos. *(Revisar este número antes de publicar; é de um teste só.)*

**O que ele nunca faz**
Não clica, não digita, não repete comandos nas janelas, não entra sozinho, não compra, não vende e não entra em hunt.
Nada de robô: ele só organiza as janelas e lê números.

**Botões:** Baixar para Windows · Pegar na Microsoft Store *(quando estiver lá)*

**Perguntas**
- *É grátis?* Sim. *(A parte paga ainda vai ser definida junto com o HuntDesk premium.)*
- *Pode dar banimento?* O navegador não joga por você nem mexe no jogo. Mesmo assim, siga as regras de cada jogo sobre
  quantas contas podem ficar abertas.
- *Meus logins vão para algum lugar?* Não. Ficam só no seu computador.
- *Funciona no celular?* Por enquanto só no Windows.

---

## 2. Microsoft Store

**Nome:** HuntDesk

**Descrição curta (até 100 caracteres na loja):**
Várias contas de jogos idle lado a lado, com login separado e controle de memória.

**Descrição:**
O HuntDesk é um navegador para quem joga jogos idle e de navegador com várias contas. Abra quantas contas quiser, cada
uma com o seu login guardado. Junte as contas em pastas e monte telas com até 4 contas lado a lado; um clique troca
de tela, e você arrasta para mudar a ordem. Funciona com outros jogos de navegador: cole o endereço do jogo e cada site
ganha uma pasta própria. A extensão do HuntDesk já vem ligada nas contas do jogo que o HuntDesk acompanha, e o app do
HuntDesk abre dentro do navegador.

Cada conta mostra quanto usa de memória e de processador. Você escolhe um limite. Se uma conta passar dele, o
HuntDesk avisa ou recarrega só aquela página, do jeito que você preferir. Contas escondidas gastam menos.

O HuntDesk nunca joga por você: não clica, não digita e não repete comandos. Ele só organiza as janelas.

**Recursos (lista da loja):**
- Várias contas com login separado
- Pastas e telas com até 4 contas lado a lado
- Extensão e app do HuntDesk dentro do navegador
- Memória e processador de cada conta
- Aviso ou recarga quando passa do limite
- Freio para contas escondidas

**Novidades da versão 0.5.0:** agora dá para abrir contas de outros jogos de navegador. Em "+ Adicionar conta", cole o
endereço do jogo, e cada site ganha uma pasta própria. Downloads ficam bloqueados nas contas.

**Novidades da versão 0.4.0:** ícone novo, boas-vindas na primeira abertura e, quando a página de uma conta cai, a tela
mostra o motivo. Os sites dos jogos deixam de ver o nome HuntDesk nas contas.

**Palavras-chave:** jogos idle, várias contas, multi conta, navegador para jogos, jogos de navegador

*(Sem nomes de jogos na loja: os jogos não são do dono, e a loja costuma recusar marcas de outros. Combinado em 03/11.)*

**Política de privacidade:** a loja exige um endereço. Por enquanto, a página `PRIVACIDADE.md` do GitHub
(https://github.com/stickoin/huntdesk-navegador/blob/main/PRIVACIDADE.md), com o texto abaixo. Mais tarde pode ir para
uma seção "Navegador" em huntdesk.com.br/privacidade.

---

## 3. Privacidade do navegador (para a página de privacidade)

- O navegador guarda no seu computador os logins das contas e as suas configurações. Nada disso é enviado para nós.
- As medições de memória aparecem só na tela, enquanto o programa está aberto; nenhuma é gravada em arquivo.
- Se a página de uma conta cair, o navegador anota no seu computador um registro curto (`quedas.log`, com as últimas 50
  quedas): data e hora, número da conta, motivo, memória naquele momento, versão do programa e se a economia de memória
  estava ligada. Não tem nome de conta, endereço nem dados do jogo, e não é enviado para nós.
- Para saber se há versão nova, o navegador consulta a página de versões do projeto no GitHub. A versão da loja é
  atualizada pela própria Microsoft.
- Os sites dos jogos que você abre têm as próprias regras de privacidade.
- Nas contas do jogo que o HuntDesk acompanha fica ligada a extensão do HuntDesk, baixada da loja do Chrome ao abrir o
  navegador e a cada 6 horas. Nas contas de outros jogos ela fica desligada e nada é lido. Ela lê os dados do jogo e só
  os envia para o app do HuntDesk (no seu PC ou na sua conta HuntDesk) depois que você a
  conecta. O que a sua conta HuntDesk guarda segue a política de privacidade do HuntDesk.
- Quando o site do app do HuntDesk pede para ligar a leitura a uma conta, o navegador pergunta antes. Se você aceitar,
  ele busca no HuntDesk a chave dessa ligação e a guarda cifrada no seu computador. Essa chave só envia as leituras.
- O app do HuntDesk fica sabendo que está aberto dentro do navegador e qual é a versão dele. Os sites dos jogos não
  recebem essa marca.
