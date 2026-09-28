# ArenaStrike

FPS tático multiplayer que roda direto no navegador. Sem instalar nada, sem conta, sem servidor: cria a sala, manda o link e joga.

**Jogar agora:** https://italoeduardo.github.io/arenastrike/

## Como jogar com os amigos

1. Abra o jogo, coloque seu nick e clique em **Criar sala online**.
2. Copie o link da sala e mande pra galera.
3. Quem abrir o link cai direto na tela de entrar — é só clicar em **Entrar**.

Dá pra encher a sala com bots (Fácil / Normal / Difícil) e treinar sozinho no modo offline.

Partida em estilo deathmatch: vence quem chegar primeiro em **30 abates** ou quem tiver mais abates quando os **10 minutos** acabarem.

## Controles

| Tecla | Ação |
|---|---|
| WASD | mover |
| Mouse | mirar / atirar |
| Botão direito | mira da sniper |
| Espaço | pular |
| Ctrl / C | agachar (mais precisão) |
| Shift | andar em silêncio |
| R | recarregar |
| 1 / 2 / 3 | arma principal / pistola / faca |
| Scroll | trocar de arma |
| B | escolher arma principal |
| Tab | placar |
| Esc | pausa (sensibilidade, volume, campo de visão) |

## Armas

| Arma | Tipo | Destaque |
|---|---|---|
| AR-7 | Rifle | Headshot de 1 tiro, recuo forte e padrão fixo |
| Viper SMG | Submetralhadora | Cadência alta, boa precisão em movimento |
| Longbow | Sniper | Mata com 1 tiro no corpo, só é precisa com a luneta |
| Breacher | Escopeta | 9 chumbos, devastadora de perto |
| P-9 | Pistola | Semi-automática, sempre disponível |
| Faca | Corpo a corpo | Dano dobrado pelas costas |

Atirar correndo ou pulando abre a mira (como no CS). Parar e agachar deixa o tiro preciso.

## Como funciona por dentro

- **3D:** [Three.js](https://threejs.org/) com WebGL. Mapa, texturas e sons são todos gerados por código — não tem nenhum asset de terceiros.
- **Multiplayer:** WebRTC peer-to-peer via [PeerJS](https://peerjs.com/). O navegador de quem cria a sala faz o papel de servidor (vida, dano, placar, bots, respawn) e os outros se conectam direto nele. O servidor público do PeerJS só apresenta os jogadores um ao outro.
- **Hospedagem:** GitHub Pages, arquivos estáticos. Custo zero.
- **Bots:** navegação por A* num grafo do mapa, tempo de reação, erro de mira que diminui com o tempo, rajadas controladas e strafe entre os tiros. Eles escutam tiros e vão investigar.

### Limitações conhecidas

- Se o host sair, a partida acaba pra todo mundo.
- Algumas redes (corporativas, 4G de certas operadoras) bloqueiam conexão direta entre navegadores. Se não conseguir entrar numa sala, tente outra rede.
- Precisa de teclado e mouse; não funciona no celular.

## Rodar localmente

Qualquer servidor de arquivos estáticos serve (módulos ES não funcionam abrindo o `index.html` direto):

```bash
python -m http.server 8000
```

Depois abra http://localhost:8000. Adicionando `?debug` na URL, o estado do jogo fica acessível no console (`game`, `player`, `weapons`).

## Estrutura

```
index.html        menus e HUD
css/style.css     visual
js/main.js        loop do jogo, entrada, HUD, mensagens
js/authority.js   lógica do host: vida, dano, placar, respawn, partida
js/network.js     conexão PeerJS (host e cliente)
js/player.js      física de movimento (compartilhada com os bots)
js/weapons.js     armas, recuo, dispersão, modelos em primeira pessoa
js/bots.js        IA e navegação dos bots
js/avatar.js      modelos dos outros jogadores e hitboxes
js/map.js         geometria do mapa, texturas e spawns
js/effects.js     traçantes, marcas de tiro, sangue
js/audio.js       sons sintetizados com Web Audio
```

## Licença

MIT — veja [LICENSE](LICENSE).
