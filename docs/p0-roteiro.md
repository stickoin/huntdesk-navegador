# P0 — roteiro do teste de memória (~2 h)

**Pergunta que o teste responde:** com o motor do Chrome, duas contas do Huntera lado a lado vazam memória como no
Zen (~150 MB/min)? E esconder a conta e ligar o "freio" (o que diminui o ritmo da tela escondida) resolve?

## Antes de começar

- **Durante o P0, o HuntDesk não recebe os dados dessas contas** (o P0 ainda não lê o jogo). As hunts dessas ~1,5 h
  não vão aparecer nas Sessões do HuntDesk.
- Feche o Zen inteiro (para não pesar o PC e não misturar as medições).
- Não precisa deixar o PC parado, mas **não minimize nem cubra a janela do P0** nas fases em que as contas devem estar
  na tela. O Windows avisa o Chrome quando uma janela fica coberta, e ele passa a tratá-la como escondida. Se tiver dois
  monitores, deixe o P0 num deles.

## Passo a passo

1. **Abra:** dois cliques em `iniciar.bat` (na pasta do projeto). Na primeira vez ele instala o motor, o que pode levar
   um minuto.
2. **Entre nas duas contas** pelo próprio site do jogo, uma de cada lado. Você digita a senha; o programa não vê nem
   guarda. O login fica guardado para as próximas vezes, como num navegador comum.
3. **Coloque as duas para caçar** do seu jeito.
4. **Fase A — 30 min:** as duas na tela, freio ligado (o padrão).
5. **Fase B — 30 min:** aperte **Esconder** na faixa de cima da Conta 2. Deixe o freio ligado. (A Conta 1 passa a
   ocupar a janela inteira; tudo bem.)
6. **Fase C — 30 min:** abra **Medições** (botão no canto de cima, à direita) e veja a Conta 2 lá. Para desligar o freio
   dela com ela escondida: clique no botão **Conta 2** da barra de cima (ela volta à tela), aperte **Freio: ligado** para
   virar **desligado** e aperte **Esconder** de novo.
7. Clique no botão **Conta 2** da barra de cima para ela voltar e confira: **o personagem continuou caçando enquanto
   estava escondido?** O XP e o loot subiram? A hunt parou ou desconectou? Anote (é tão importante quanto a memória).
8. Feche o P0.
9. **Fase D — 30 min (comparação):** abra o Zen só com as duas contas, as duas visíveis (lado a lado), do jeito que você
   jogava. Dois cliques em `medir-zen.bat`. Depois de 30 min, feche a janela preta do medidor.
10. **Me avise no chat.** Eu leio as planilhas da pasta `medicoes` e monto o resumo (MB por minuto em cada fase).

## O que a barra mostra

Desde o P1, os números ficam na faixa em cima de cada conta e no painel **Medições** (a tabela completa, inclusive das
contas escondidas).

- **MB:** a memória que a conta está usando agora.
- **cresce X MB/min:** a velocidade com que a memória sobe, calculada nos últimos 5 min. Verde até 5, amarelo até 20,
  vermelho acima de 20.
- **quadros/s:** quantas vezes por segundo o jogo se desenha (0 = parado de desenhar).
- **relógios:** o ritmo dos relógios internos do jogo (10/s = normal; 1/s = freado).
- **JavaScript:** a parte da memória usada pelo código do jogo. Se só esta subir, o vazamento está no código do jogo;
  se a "Placa de vídeo" subir, está no desenho.
- **Programa / Placa de vídeo / Total:** o próprio navegador, o desenho das duas contas juntas e a soma de tudo
  (compare o Total com o Gerenciador de Tarefas).

## Se algo der errado

- **A conta "caiu" ou ficou "sem resposta":** aperte **Recarregar** naquela conta e anote a hora. Isso também é
  resultado.
- **O PC ficou pesado:** feche o P0. A medição até ali já ficou gravada.
- **O login não abre** (botão que não responde, janela que não aparece): me diga em que tela parou.

## Para quem for mexer no código

- `npm start` abre o P0 com o jogo; `npm run teste` abre com uma página de teste que imita um vazamento;
  `npm run autoteste` aperta os botões sozinho **só na página de teste** e fecha em 2 min.
- `npm run resumo` gera `medicoes/resumo.md` com a medição mais recente (`npm run resumo -- todos` para todas).
- As medições ficam em `medicoes/` (fora do git). Os logins ficam em `%APPDATA%\HuntDesk Navegador P0`.
