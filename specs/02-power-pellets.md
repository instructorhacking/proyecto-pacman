# SPEC 02 — Power pellets y modo asustado

> **Estado:** Draft
> **Depende de:** SPEC 01 (fantasmas con kinds y salida escalonada)
> **Fecha:** 2026-10-05
> **Objetivo:** Añadir 4 power pellets que, al comerlos, asustan ~6 s a los
> fantasmas (azules, más lentos, huidizos y comibles por 200/400/800/1600 pts),
> que regresan a la guarida como ojos para revivir.

## Scope

**In:**

- 4 power pellets en las posiciones clásicas `(1,3)`, `(26,3)`, `(1,23)`,
  `(26,23)`, sustituyendo el dot existente: nuevo valor de celda `4`,
  carácter `'o'` en `MAZE_STR` (`src/js/maze.js`).
- Comer pellet: `+50` pts, cuenta para `dotsRemaining` (ganar exige comerlos)
  y activa el modo asustado global ~6 s (360 frames).
- Fantasma asustado (`mode: 'frightened'`): azul, velocidad `1/20`, huye de
  PacMan (greedy invertido), se da la vuelta al activarse y es comible;
  parpadea azul/blanco los últimos ~2 s.
- Fantasma comido (`mode: 'eaten'`): solo ojos, puntos `200/400/800/1600`
  encadenados por pellet, vuelve a la guarida al doble de velocidad y revive
  dentro para salir con `exitPen` sin cambios.
- Colisión según modo: asustado → comido · ojos → sin efecto · normal → vida
  perdida como hoy.
- `resetPositions` cancela el modo asustado (timer y cadena a 0, todos a
  `'normal'`).
- Render (`src/js/render.js`): pellet grande parpadeante, fantasma azul con
  parpadeo final, ojos solos para el eaten.
- No se toca `src/js/main.js` ni `src/index.html` (sin archivos nuevos).

**Out of scope (para futuros specs):**

- Freeze-frame clásico al comer un fantasma (~1 s de pausa).
- Alternancia global scatter/chase.
- Cambio de velocidad de PacMan con el modo; velocidades variables (Elroy).
- Frutas, niveles, marcadores, sonidos.

## Data model

```js
// src/js/maze.js — MAZE_STR: los dots de (1,3), (26,3), (1,23) y (26,23)
// pasan a 'o'. Celdas: 0 vacío · 1 pared · 2 dot · 3 puerta · 4 power pellet
// parseTile: 'o' -> 4
```

```js
// src/js/game.js
const FRIGHTENED_FRAMES = 360;  // ~6 s a 60 fps
const FRIGHTENED_FLASH = 120;   // últimos ~2 s parpadeando
const FRIGHTENED_SPEED = 0.05;  // 1/20: la mitad que GHOST_SPEED
const EATEN_SPEED = 0.2;        // 1/5: el doble volviendo a la guarida
const GHOST_POINTS = [ 200, 400, 800, 1600 ];
```

```js
// game añade:
{
  frightenedTimer: 0,  // frames restantes del modo asustado (0 = inactivo)
  ghostChain: 0,       // fantasmas comidos con el pellet activo
}
// cada fantasma añade:
{
  mode: 'normal',      // 'normal' | 'frightened' | 'eaten'
}
```

- Solo los fantasmas libres (ya soltados y fuera de la guarida) se asustan;
  los de dentro siguen su rutina y salen normales.
- Un fantasma revivido pasa a `'normal'` aunque el timer siga activo; los
  `'eaten'` no se re-asustan.
- Comer un pellet con el modo activo reinicia timer y cadena.
- El cambio de velocidad por modo se aplica al alinearse en la siguiente
  celda, nunca a mitad de celda: velocidades `1/n` y cambios solo en los
  puntos de alineación conservan la retícula del greedy.
- El `'eaten'` vuelve con greedy hacia `(13, 14)` (interior de la guarida);
  la celda puerta (3) ya es transitable para fantasmas.
- El asustado decide en cada cruce la dirección válida que MAXIMIZA la
  distancia Manhattan a PacMan (greedy actual invertido), con la misma
  no-reversa salvo callejón.

## Plan de implementación

1. `src/js/maze.js` + `src/js/game.js`: `'o'` → 4 en `parseTile` y los 4 dots
   sustituidos; `createGame` cuenta `v === 2 || v === 4` y `movePacman` come
   la celda 4 (`+50`). Prueba: el juego sigue ganable y comer una 'o' suma 50.
2. `src/js/render.js`: la celda 4 se dibuja como pellet grande (r≈7 px)
   parpadeante. Prueba: se ven 4 pellets grandes que parpadean.
3. `src/js/game.js`: modo asustado — timer y cadena en `game`, `mode` en los
   fantasmas; comer pellet asusta a los libres y les da la vuelta; huida en
   `decideGhost`; velocidades por modo al alinear. Prueba: al comer el
   pellet, los libres se alejan de PacMan (siguen matando hasta el paso 5).
4. `src/js/render.js`: fantasma asustado azul (`#2121de`) con parpadeo
   azul/blanco final; `'eaten'` como ojos solos. Prueba: azules al comer el
   pellet y parpadeo cerca de acabarse el tiempo.
5. `src/js/game.js`: `update` bifurca la colisión según `mode` (asustado →
   comido con `GHOST_POINTS`/`ghostChain` · ojos → sin efecto · normal →
   vida como hoy); regreso del `'eaten'` a la guarida y revivir dentro.
   Prueba: se pueden comer fantasmas y vuelven como ojos para revivir.
6. `src/js/game.js`: `resetPositions` cancela el modo asustado y rearma
   `mode` a `'normal'`. Prueba: perder una vida con el modo activo no deja
   fantasmas azules tras el reinicio.

## Criterios de aceptación

- [ ] `src/index.html` carga en el navegador (file://) sin errores en consola.
- [ ] Se ven 4 pellets grandes parpadeantes en (1,3), (26,3), (1,23), (26,23)
      y desaparecen al comerlos.
- [ ] Comer un pellet suma 50 y los fantasmas libres se dan la vuelta y se
      alejan de PacMan, más despacio que antes.
- [ ] Tocar un fantasma azul lo come: +200 el primero y +400/+800/+1600 los
      siguientes con el mismo pellet; la cadena vuelve a 200 con otro pellet.
- [ ] El fantasma comido se ve como solo ojos, vuelve a la guarida, revive y
      vuelve a salir por la puerta.
- [ ] Tocar un fantasma en modo ojos no quita vida ni puntúa.
- [ ] Comer un segundo pellet con el modo activo reinicia el tiempo y la
      cadena.
- [ ] En los últimos ~2 s los fantasmas azules parpadean y, al terminar,
      vuelven a su color y a matar.
- [ ] Perder una vida con el modo activo lo cancela: tras el reinicio no hay
      fantasmas azules.
- [ ] Ganar exige comer también los 4 pellets (`dotsRemaining` los cuenta);
      perder (0 vidas) funciona igual que ahora.

## Decisiones

- **Sí:** posiciones clásicas, 6 s con parpadeo, huida determinista, puntos
  clásicos con cadena y ojos que regresan. Confirmadas en la definición.
- **Sí:** los pellets cuentan para ganar. Clásico: las dots totales incluyen
  los 4 energizantes; si no contaran, se ganaría dejándolos.
- **No:** pellets decorativos que no cuentan para la victoria.
- **Sí:** reversa de dirección al activarse el modo. Señal inmediata y
  gratuita de que el pellet surtió efecto.
- **Sí:** solo los libres se asustan y el revivido vuelve normal aunque siga
  el timer. Evita re-escalar el modo sobre la rutina scriptada de la guarida
  y las cadenas infinitas sobre un mismo fantasma.
- **Sí:** velocidades 1/20 (asustado) y 1/5 (ojos), aplicadas solo al
  alinear. Conservan la retícula de alineación del greedy; cambiar a mitad
  de celda rompe `aligned()` y congela la decisión.
- **No:** freeze-frame de ~1 s al comer fantasma (clásico). Exige un estado
  de pausa parcial; merece spec propio si llega.
- **No:** cambio de velocidad de PacMan con el modo ni velocidades variables
  (Elroy). Cada uno va en su propio spec.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Cambiar velocidad a mitad de celda rompe la alineación y el greedy deja de decidir (fantasma atascado) | Cambios de velocidad solo en puntos de alineación; velocidades 1/n. |
| El `'eaten'` vuelve con greedy (sin pathfinding) y puede rodear de más en algún cruce | Coherente con el greedy actual; objetivo (13,14) visible y alcanzable; reajustar si se ve mal. |
| 6 s puede sentirse largo o corto | `FRIGHTENED_FRAMES` es una única constante; reajuste tras probar. |
| Timer en frames: rAF ≠ 60 fps en todos los monitores | Igual que SPEC 01: tiempos aproximados por diseño. |

## Qué **no** está en este spec

- Freeze-frames al comer un fantasma.
- Scatter/chase global.
- Velocidades variables o cambio de velocidad de PacMan.
- Frutas, niveles o marcadores nuevos.

Cada uno de esos, si llega, va en su propio spec.
