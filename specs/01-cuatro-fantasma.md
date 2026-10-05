# SPEC 01 — Cuatro fantasmas con conductas propias

> **Estado:** Approved
> **Depende de:** ninguna
> **Fecha:** 2026-10-05
> **Objetivo:** Tener 4 fantasmas simultáneos en partida (blinky, pinky, inky, clyde),
> cada uno con su propia estrategia de persecución — blinky agresiva — y salida
> escalonada de la guarida.

## Scope

**In:**

- 4 fantasmas simultáneos con `kind` propio en `GHOST_STARTS` (`src/js/maze.js`):
  - `blinky` (agresivo): persigue directamente la celda de PacMan.
  - `pinky` (emboscador): apunta a 4 celdas delante de PacMan, según dónde mira.
  - `inky` (flanqueador): apunta al reflejo de blinky respecto al punto 2 celdas
    delante de PacMan (`target = 2·adelante2 − blinky`).
  - `clyde` (tímido): persigue como blinky a más de 8 celdas (Manhattan); a 8 o
    menos, se dirige a su esquina inferior-izquierda `(1, 29)`.
- Salida escalonada de la guarida: blinky empieza fuera; pinky, inky y clyde
  esperan dentro y salen por la puerta tras 180/360/540 frames (~3/6/9 s).
- Mientras esperan, oscilan en el sitio (±0.2 celdas, solo visual).
- Renombrado de kinds: se eliminan `'hunter'` y `'random'`.
- `resetPositions` rearma posiciones y temporizadores al perder una vida.
- Reordenar `GHOST_COLORS` en `src/js/render.js` para que cada kind tenga su
  color clásico (blinky rojo, pinky rosa, inky cyan, clyde naranja).

**Out of scope (para futuros specs):**

- Power-pellets y modo asustado (el laberinto no tiene energizantes).
- Alternancia global scatter/chase.
- Diferencias de velocidad entre fantasmas (p. ej. «Cruise Elroy»).
- Frutas, niveles adicionales, marcadores.

## Data model

```js
// src/js/maze.js
const GHOST_STARTS = [
  { x: 13, y: 11, kind: 'blinky', releaseDelay: 0 },   // fuera, sobre la puerta
  { x: 13, y: 14, kind: 'pinky', releaseDelay: 180 },  // dentro, ~3 s
  { x: 12, y: 14, kind: 'inky',  releaseDelay: 360 },  // dentro, ~6 s
  { x: 15, y: 14, kind: 'clyde', releaseDelay: 540 },  // dentro, ~9 s
];
const CLYDE_CORNER = { x: 1, y: 29 }; // esquina inf-izq, celda transitable
```

```js
// src/js/game.js — cada fantasma en game.ghosts
{
  x: 13, y: 14,
  dir: 'up',
  speed: GHOST_SPEED,    // 0.1, igual para todos
  kind: 'pinky',
  releaseDelay: 180,     // original, para rearmar en resetPositions
  pendingRelease: 180,  // cuenta atrás en frames; 0 = libre
}
```

- Los objetivos son puntos de referencia para comparar distancias, no celdas
  que deban ser transitables (pinky/inky pueden apuntar fuera del laberinto).
- `inky` localiza a blinky con `game.ghosts.find( ( g ) => g.kind === 'blinky' )`.
- Guarida por geometría: interior filas 13-15 × columnas 11-16; puerta en
  `(13-14, 12)`; celda de salida `(13-14, 11)`.

## Plan de implementación

1. `src/js/maze.js`: ampliar `GHOST_STARTS` a las 4 entradas y añadir
   `CLYDE_CORNER`. Prueba: el juego carga y se ven 4 fantasmas (los kinds
   nuevos caen en la rama aleatoria de `decideGhost` hasta el paso 2).
2. `src/js/game.js`: sustituir las ramas `hunter`/`random` de `decideGhost`
   por el objetivo por kind, manteniendo la no-reversa actual (180 solo en
   callejón). Prueba: cada fantasma converge de forma distinta.
3. `src/js/game.js`: salida escalonada — cuenta atrás `pendingRelease`,
   oscilación en el sitio mientras espera y rutina de salida (alinearse a la
   columna de la puerta y subir por ella). Prueba: solo blinky persigue al
   inicio; los demás salen ~3/6/9 s.
4. `src/js/render.js`: reordenar `GHOST_COLORS` a
   `['#ff0000', '#ffb8ff', '#00ffff', '#ffb852']`. Prueba: pinky rosa e inky
   cyan (hoy estarían intercambiados).
5. `src/js/game.js`: rearmar en `resetPositions` posiciones y
   `pendingRelease`. Prueba: al perder una vida el escalonado se repite;
   consola limpia; ganar y perder siguen igual.

## Criterios de aceptación

- [ ] `src/index.html` carga en el navegador (file://) sin errores en consola.
- [ ] Se ven 4 fantasmas con su color clásico: blinky rojo, pinky rosa, inky
      cyan, clyde naranja.
- [ ] Al iniciar, solo blinky está fuera de la guarida; pinky, inky y clyde
      salen por la puerta aproximadamente a 3 s, 6 s y 9 s.
- [ ] blinky reduce distancia con PacMan en pasillos abiertos (agresivo).
- [ ] pinky corta el paso hacia donde mira PacMan, no hacia su posición actual.
- [ ] inky toma rumbos distintos a blinky (su objetivo depende de blinky).
- [ ] clyde se retira a `(1, 29)` al estar a ≤8 celdas de PacMan y vuelve a
      perseguir al alejarse.
- [ ] Ningún fantasma da media vuelta salvo callejón sin salida.
- [ ] El contacto quita una vida y reinicia posiciones y temporizadores.
- [ ] Ganar (todos los dots) y perder (0 vidas) funcionan igual que ahora.

## Decisiones

- **Sí:** conductas clásicas del arcade. Probadas, con contraste claro entre
  fantasmas y cubren el requisito del agresivo.
- **No:** conductas simplificadas propias. Menos contraste y sin interacción
  inky-blinky.
- **Sí:** kinds `'blinky' | 'pinky' | 'inky' | 'clyde'`. Evocan la conducta y
  casan con los colores clásicos ya presentes.
- **No:** kinds descriptivos o conservar `'hunter'`. Mezclan criterios.
- **Sí:** salida escalonada por retardos fijos (180/360/540 frames). Ritmo
  clásico sin lógica por dots comidos.
- **No:** liberación por contador de dots del arcade. Más lógica para el mismo
  resultado visible.
- **Sí:** velocidad uniforme `GHOST_SPEED`. La personalidad está en el objetivo.
- **Sí:** greedy por distancia Manhattan en cada cruce, como el `hunter`
  actual. Sin pathfinding: suficiente y coherente con lo existente.
- **No:** replicar el bug original de pinky (desbordamiento arriba-izquierda).
  Objetivo limpio: 4 celdas en la dirección de la mirada.
- **No:** scatter global, modo asustado y velocidades distintas. Fuera de
  alcance; cada uno merece su propio spec.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Retardos en frames varían con el Hz del monitor (rAF ≠ 60 fps en todos) | El juego ya asume ~60 fps (velocidades por frame); los tiempos son aproximados por diseño. |
| pinky/inky apuntan a celdas fuera del laberinto o a muros | El objetivo es solo un punto de referencia para comparar distancias, no una celda a alcanzar. |
| 4 fantasmas pueden endurecer mucho la partida | La salida escalonada lo mitiga; los retardos se reajustan tras probar. |

## Qué **no** está en este spec

- Power-pellets y modo asustado.
- Alternancia global scatter/chase.
- Diferencias de velocidad entre fantasmas.
- Frutas, niveles o marcadores nuevos.

Cada uno de esos, si llega, va en su propio spec.
