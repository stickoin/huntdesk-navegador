# HuntDesk — navegador para jogos idle

Um navegador feito para quem joga jogos idle e de navegador com várias contas ao mesmo tempo.

- **Várias contas abertas juntas**, cada uma com o login separado e guardado, como se cada uma estivesse num
  navegador diferente.
- **Pastas e telas na lateral:** junte as contas em pastas (por exemplo, uma por jogo). Cada tela mostra de 1 a 4
  contas lado a lado; o clique troca de tela (Ctrl+1, Ctrl+2…, Ctrl+Tab) e as outras contas continuam rodando.
  Arraste as telas e as pastas para mudar a ordem e escolha uma cor para cada conta.
- **Outros jogos de navegador:** em **+ Adicionar conta**, cole o endereço do jogo (com https). Cada site ganha uma
  pasta própria. Downloads ficam bloqueados nas contas.
- **Extensão do HuntDesk** já ligada nas contas do jogo que o HuntDesk acompanha, baixada da loja do Chrome. Conectar
  uma vez vale para todas essas contas. Nas contas de outros jogos ela fica desligada. O **app do HuntDesk** abre dentro
  do navegador.
- **Outras extensões do Chrome:** em **Menu ▴ → Extensões…**, cole o link da extensão na loja do Chrome ou escolha
  uma pasta. Antes de instalar aparece o que ela pede. Cada extensão fica ligada só nas contas que você marcar.
- **Cópia das configurações:** em **Menu ▴ → Configurações → Cópia**, exporte pastas, telas, contas e opções num arquivo e importe em
  outro PC. Os logins vão só se você marcar, trancados com uma senha sua.
- **Nome das contas:** dois cliques na conta, na lateral, ou o menuzinho da conta, para renomear.
- **Configurações numa janela só:** **Menu ▴ → Configurações** tem as seções Geral, Contas, Memória, Extensões, Cópia
  e Sobre.
- **Controle de memória:** mostra quanto cada conta gasta de memória e de processador (em **Menu ▴ → Configurações →
  Memória**). Se uma conta passar do limite
  que você escolheu, o programa **avisa** ou **recarrega só aquela página**, conforme a sua escolha.
- **Freio:** conta escondida ou fora da tela gasta menos.

## O que ele nunca faz

**O HuntDesk nunca joga por você.** Ele não clica, não digita, não repete comandos nas janelas, não entra sozinho, não
compra, não vende e não entra em hunt. Ele só organiza as janelas e lê os números de memória e de processador. Quem
joga é você.

## Instalar

Baixe o `HuntDesk-Instalador-<versão>.exe` em [Releases](../../releases) e abra. A instalação não pede administrador.
Ela cria atalhos na área de trabalho e no Iniciar.

Enquanto o programa não tiver assinatura digital, o Windows pode mostrar "O Windows protegeu o computador". Clique em
**Mais informações** e depois em **Executar assim mesmo**.

O programa avisa quando sai uma versão nova. Ela é baixada sozinha e instalada quando você fecha o programa, ou na hora,
se você apertar **Reiniciar agora**.

## Seus dados

- Logins e configurações ficam só no seu computador, em `%APPDATA%\HuntDesk Navegador`. As medições de memória
  aparecem na tela, mas não são gravadas em arquivo. Se a página de uma conta cair, o programa anota nessa pasta só a
  data, o número da conta, o motivo e a memória daquele momento (arquivo `quedas.log`, com as últimas 50 quedas).
- Desinstalar o programa **não apaga** essa pasta. Em **Menu ▴ → Configurações → Sobre** há um botão para abri-la.
- O programa se conecta à internet só para:
  - ver se há versão nova, na página de versões do projeto no GitHub;
  - baixar a extensão do HuntDesk e as outras extensões que você instalou pela loja do Chrome, ao abrir e a cada 6
    horas;
  - abrir o app do HuntDesk e buscar a chave de ligação com a sua conta, se o site pedir e você aceitar. A chave fica
    cifrada no seu computador.
- A extensão do HuntDesk lê os dados do jogo que o HuntDesk acompanha e só os manda para o app do HuntDesk (no seu PC ou na sua conta
  HuntDesk) depois que você a conecta, em **Menu ▴ → Extensão HuntDesk…**.

## Para quem quer mexer no código

É preciso ter o Node.js instalado.

```bash
npm install
npm start                  # abre o programa
npm run autoteste          # confere as telas com uma página de teste (não abre o jogo)
npm run autoteste:guarda   # confere a guarda de memória
npm run autoteste:alivio   # confere o "aliviar memória"
npm run instalador         # gera o instalador em dist/
npm run conferir           # roda todos os testes, gera o instalador e testa o programa empacotado
```

Só rodando pelo projeto as medições são gravadas, em `medicoes/` (o programa instalado não grava nenhuma). Para resumir as medições, rode `npm run resumo`.

## Licença

MIT (veja o arquivo [LICENSE](LICENSE)): qualquer pessoa pode usar, copiar e modificar o código, inclusive em
outros programas, desde que mantenha o aviso de autoria e da licença. O programa vem sem garantia.
