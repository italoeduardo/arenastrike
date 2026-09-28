# ArenaStrike

FPS tático multiplayer que roda direto no navegador. Sem instalar nada, sem conta, sem servidor: cria a sala, manda o link e joga.

**Jogar agora:** https://italoeduardo.github.io/arenastrike/

## Modos

### Competitivo (bomba)
Terroristas contra Contra-Terroristas no mapa **Oásis**, com dois bombsites (A e B).

- **TR** planta a bomba em um dos bombsites; **CT** defende e desarma.
- Rounds de 1:55, bomba com 40s, desarme de 10s (5s com kit).
- Melhor de 16 rounds: vence quem ganhar 9. Os times trocam de lado depois do round 8.
- Economia: $800 no início, $3250 por vitória ($3500 ganhando por bomba/desarme), bônus de derrota crescente ($1400 → $3400), dinheiro por abate de acordo com a arma, +$300 por plantar ou desarmar.
- Tempo de compra no início do round, só dentro da sua base.
- Morreu? Assiste os companheiros até o próximo round. Arma e bomba caem no chão.
- Salas online começam com 90s de aquecimento (o host pode pular pelo Esc).

### Mata-mata
Todo mundo contra todo mundo, respawn em 3s, munição infinita. Vence quem fizer 30 abates ou liderar quando os 10 minutos acabarem. Mapas Arena ou Oásis.

## Como jogar com os amigos

1. Coloque seu nick, escolha o modo e clique em **Criar sala online**.
2. Copie o link da sala e mande pra galera.
3. Quem abrir o link cai direto na tela de entrar — é só clicar em **Entrar**.

Os bots completam os times (até 5x5) e saem sozinhos quando um amigo entra no lugar.

## Controles

| Tecla | Ação |
|---|---|
| WASD | mover |
| Mouse | mirar / atirar |
| Botão direito | mira das snipers |
| Espaço | pular |
| Ctrl / C | agachar (mais precisão) |
| Shift | andar em silêncio |
| R | recarregar |
| 1 / 2 / 3 / 4 / 5 | principal / pistola / faca / granadas / bomba |
| Q | última arma |
| B | menu de compra |
| E | desarmar a bomba / pegar arma do chão |
| G | largar arma ou bomba |
| Tab | placar |
| Esc | pausa (sensibilidade, volume, campo de visão) |

Pra plantar: aperte **5** dentro do bombsite e segure o clique.

## Arsenal

| Tipo | Armas |
|---|---|
| Pistolas | G-9 (TR), Guardian-S (CT), Compact-25, Hand Cannon |
| Submetralhadoras | Viper (TR), Hornet (CT), Buzzsaw |
| Pesadas | Breacher (escopeta) |
| Rifles | Raider (TR), Falcon (CT), AR-7 (TR), Sentinel M4 (CT) |
| Snipers | Scout, Longbow |
| Granadas | HE, Flash, Fumaça |
| Equipamento | Colete, Colete + Capacete, Kit de desarme (CT) |

Cada arma tem padrão de recuo, dispersão andando/pulando, perfuração de colete e recompensa por abate próprios. Headshot de AR-7 mata com um tiro mesmo com capacete; sem capacete, qualquer headshot de pistola já mata.

## Como funciona por dentro

- **3D:** [Three.js](https://threejs.org/) com WebGL. Mapas, personagens, texturas e sons são todos gerados por código — nenhum asset de terceiros.
- **Multiplayer:** WebRTC peer-to-peer via [PeerJS](https://peerjs.com/). O navegador de quem cria a sala faz o papel de servidor (vida, dano, colete, economia, bomba, rounds, bots, granadas) e os outros se conectam direto nele. O servidor público do PeerJS só apresenta os jogadores um ao outro.
- **Hospedagem:** GitHub Pages, arquivos estáticos. Custo zero.
- **Bots:** navegação por A* no mapa, tempo de reação, erro de mira, rajadas controladas, strafe. No competitivo eles compram conforme o dinheiro, o TR leva a bomba e planta, o CT segura os bombsites e vai desarmar. Ficam cegos com flash e não enxergam através de fumaça.

### Limitações conhecidas

- Se o host sair, a partida acaba pra todo mundo.
- Algumas redes (corporativas, 4G de certas operadoras) bloqueiam conexão direta entre navegadores. Se não conseguir entrar numa sala, tente outra rede.
- Precisa de teclado e mouse; não funciona no celular.
- Se o navegador bloquear a trava do mouse, o jogo entra em "mouse livre" (dá pra jogar, e ele tenta travar de novo a cada clique).

## Rodar localmente

Qualquer servidor de arquivos estáticos serve (módulos ES não funcionam abrindo o `index.html` direto):

```bash
python -m http.server 8000
```

Depois abra http://localhost:8000. Com `?debug` na URL, o estado do jogo fica acessível no console (`game`, `player`, `weapons`, `world`).

## Estrutura

```
index.html          menus e HUD
css/style.css       visual
js/main.js          loop do jogo, entrada, HUD, compra, espectador, mensagens
js/authority.js     lógica do host: dano, colete, granadas, bots, mata-mata
js/competitive.js   modo bomba: rounds, economia, compra, bomba, troca de lado
js/network.js       conexão PeerJS (host e cliente)
js/player.js        física de movimento (compartilhada com os bots)
js/weapons.js       catálogo de armas, recuo, dispersão, modelos em primeira pessoa
js/grenades.js      física e efeitos das granadas
js/bots.js          IA e navegação dos bots
js/avatar.js        modelos TR/CT, animação de morte, armas no chão
js/map.js           mapas, texturas e zonas (spawn, compra, bombsites)
js/radar.js         radar
js/effects.js       traçantes, marcas de tiro, sangue
js/audio.js         sons sintetizados com Web Audio
```

## Licença

MIT — veja [LICENSE](LICENSE).
