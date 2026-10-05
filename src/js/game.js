// game.js
// Estado y reglas. Depende de globals de maze.js: MAZE, TUNNEL_ROW,
// PACMAN_START, GHOST_STARTS, CLYDE_CORNER.

const DIRS = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};
const OPPOSITE = { left: 'right', right: 'left', up: 'down', down: 'up' };

const PACMAN_SPEED = 0.125; // 1/8 celda/frame -> alinea cada 8 frames
const GHOST_SPEED = 0.1;    // 1/10 celda/frame

// Modo asustado (spec 02): duracion, aviso de fin, velocidades y puntos.
const FRIGHTENED_FRAMES = 360; // ~6 s a 60 fps
const FRIGHTENED_FLASH = 120;  // ultimos ~2 s parpadeando (lo usa render.js)
const FRIGHTENED_SPEED = 0.05; // 1/20 celda/frame: la mitad que GHOST_SPEED
const EATEN_SPEED = 0.2;        // 1/5 celda/frame: el doble volviendo a la guarida
const GHOST_POINTS = [ 200, 400, 800, 1600 ]; // cadena por pellet activo

// Geometria de la guarida (spec 01): interior filas 13-15 x columnas 11-16,
// puerta en (13-14, 12), celda de salida (13-14, 11).
const PEN = {
  x0: 11,     // col izquierda del interior
  x1: 16,     // col derecha del interior
  doorY: 12,  // fila de la puerta
  y1: 15,     // fila inferior del interior
  doorX: 13,  // columna por la que se sale
  exitY: 11,  // fila de la celda de salida
};

// Crea una partida nueva. Copia MAZE (pristino) a game.grid para poder comer
// dots sin destruir el original, y reiniciar.
function createGame() {
  const grid = MAZE.map( ( row ) => row.slice() );
  // La celda de inicio de Pacman arranca sin dot.
  grid[ PACMAN_START.y ][ PACMAN_START.x ] = 0;

  // Dots (2) y power pellets (4) cuentan ambos: ganar exige comerlos.
  let dots = 0;
  for ( const row of grid ) for ( const v of row ) if ( v === 2 || v === 4 ) dots++;

  return {
    state: 'start',
    score: 0,
    lives: 3,
    dotsRemaining: dots,
    grid,
    // Modo asustado (spec 02): frames restantes (0 = inactivo) y cuantos
    // fantasmas lleva comidos PacMan con el pellet activo.
    frightenedTimer: 0,
    ghostChain: 0,
    pacman: {
      x: PACMAN_START.x,
      y: PACMAN_START.y,
      dir: 'left',
      nextDir: null,
      speed: PACMAN_SPEED,
    },
    ghosts: GHOST_STARTS.map( ( g ) => ( {
      x: g.x,
      y: g.y,
      dir: 'up',
      speed: GHOST_SPEED,
      kind: g.kind,
      // Modo (spec 02): 'normal' | 'frightened' (huye, comible) | 'eaten' (ojos).
      mode: 'normal',
      // Salida escalonada: retardo original y cuenta atras (0 = libre).
      releaseDelay: g.releaseDelay,
      pendingRelease: g.releaseDelay,
    } ) ),
  };
}

function aligned( v ) {
  return Math.abs( v - Math.round( v ) ) < 1e-3;
}

// Una celda es muro para el actor dado?
//   pacman: bloqueado por pared (1) y puerta (3)
//   ghost:  bloqueado solo por pared (1)
function isWall( grid, x, y, actor ) {
  if ( y < 0 || y >= grid.length ) return true;
  if ( x < 0 || x >= grid[ 0 ].length ) return true;
  const v = grid[ y ][ x ];
  if ( v === 1 ) return true;
  if ( v === 3 && actor === 'pacman' ) return true;
  return false;
}

// Puede el actor avanzar desde (x,y) en la direccion dir?
function canMove( grid, x, y, dir, actor ) {
  const d = DIRS[ dir ];
  if ( !d ) return false;
  const tx = x + d.x;
  const ty = y + d.y;
  // Tunel: salir por un borde en la fila del tunel siempre es valido.
  if ( ty === TUNNEL_ROW && ( tx < 0 || tx >= grid[ 0 ].length ) ) return true;
  return !isWall( grid, tx, ty, actor );
}

function wrapTunnel( a, width ) {
  if ( Math.round( a.y ) === TUNNEL_ROW ) {
    if ( a.x < 0 ) a.x += width;
    else if ( a.x >= width ) a.x -= width;
  }
}

function movePacman( game ) {
  const p = game.pacman;
  const grid = game.grid;
  const width = grid[ 0 ].length;

  if ( aligned( p.x ) && aligned( p.y ) ) {
    p.x = Math.round( p.x );
    p.y = Math.round( p.y );

    // Aplicar giro pendiente si es posible.
    if ( p.nextDir && canMove( grid, p.x, p.y, p.nextDir, 'pacman' ) ) {
      p.dir = p.nextDir;
      p.nextDir = null;
    }
    // Comer dot (+10) o power pellet (+50); ambos cuentan para ganar.
    const cell = grid[ p.y ][ p.x ];
    if ( cell === 2 || cell === 4 ) {
      grid[ p.y ][ p.x ] = 0;
      game.score += cell === 2 ? 10 : 50;
      game.dotsRemaining--;
      // El pellet activa el modo asustado (reinicia timer y cadena).
      if ( cell === 4 ) startFrightened( game );
    }
    // Si no puede seguir, se detiene en la celda.
    if ( !canMove( grid, p.x, p.y, p.dir, 'pacman' ) ) return;
  }

  const d = DIRS[ p.dir ];
  p.x += d.x * p.speed;
  p.y += d.y * p.speed;
  wrapTunnel( p, width );
}

// Objetivo de cada kind: punto de referencia para comparar distancias,
// no una celda que deba ser transitable (pinky/inky pueden apuntar fuera
// del laberinto o a un muro).
function ghostTarget( game, g ) {
  const p = game.pacman;
  const px = Math.round( p.x );
  const py = Math.round( p.y );
  const ahead = DIRS[ p.dir ] || { x: 0, y: 0 }; // donde mira PacMan

  // Comido (spec 02): vuelve con greedy hacia (13,14), el interior de la
  // guarida; la celda puerta (3) ya es transitable para fantasmas.
  if ( g.mode === 'eaten' ) {
    return { x: 13, y: 14 };
  }

  // Asustado (spec 02): el objetivo es PacMan, pero decideGhost invierte el
  // greedy (MAXIMIZA la distancia), con lo que huye en cada cruce.
  if ( g.mode === 'frightened' ) {
    return { x: px, y: py };
  }

  if ( g.kind === 'blinky' ) {
    // Agresivo: directamente la celda de PacMan.
    return { x: px, y: py };
  }
  if ( g.kind === 'pinky' ) {
    // Emboscador: 4 celdas delante de PacMan, segun donde mira.
    return { x: px + ahead.x * 4, y: py + ahead.y * 4 };
  }
  if ( g.kind === 'inky' ) {
    // Flanqueador: reflejo de blinky respecto al punto 2 celdas delante
    // de PacMan (target = 2 * adelante2 - blinky).
    const blinky = game.ghosts.find( ( b ) => b.kind === 'blinky' );
    const ax = px + ahead.x * 2;
    const ay = py + ahead.y * 2;
    if ( !blinky ) return { x: ax, y: ay };
    return { x: 2 * ax - Math.round( blinky.x ), y: 2 * ay - Math.round( blinky.y ) };
  }
  // clyde, timido: a mas de 8 celdas (Manhattan) persigue como blinky;
  // a 8 o menos se retira a su esquina inferior-izquierda.
  const dist = Math.abs( Math.round( g.x ) - px ) + Math.abs( Math.round( g.y ) - py );
  if ( dist > 8 ) return { x: px, y: py };
  return { x: CLYDE_CORNER.x, y: CLYDE_CORNER.y };
}

function decideGhost( game, g ) {
  const grid = game.grid;

  const options = Object.keys( DIRS ).filter(
    ( dir ) => dir !== OPPOSITE[ g.dir ] && canMove( grid, g.x, g.y, dir, 'ghost' )
  );
  // Sin salida (callejon): permitir el giro de 180.
  const choices = options.length ? options : [ '' + OPPOSITE[ g.dir ] ];

  // Greedy por distancia Manhattan al objetivo propio del kind. Asustado
  // (spec 02): mismo greedy invertido -> MAXIMIZA la distancia (huida).
  const target = ghostTarget( game, g );
  const flee = g.mode === 'frightened';
  let best = choices[ 0 ];
  let bestDist = flee ? -1 : Infinity;
  for ( const dir of choices ) {
    const d = DIRS[ dir ];
    const nx = g.x + d.x;
    const ny = g.y + d.y;
    const dist = Math.abs( nx - target.x ) + Math.abs( ny - target.y );
    if ( flee ? dist > bestDist : dist < bestDist ) {
      bestDist = dist;
      best = dir;
    }
  }
  g.dir = best;
}

// Esta dentro de la guarida (interior o puerta)? Por geometria: cualquier
// fantasma ahi sigue la rutina de la guarida, nunca decideGhost.
function inPen( g ) {
  return g.x >= PEN.x0 && g.x <= PEN.x1 && g.y >= PEN.doorY && g.y <= PEN.y1;
}

// Espera escalonada: cuenta atras de pendingRelease y, mientras tanto,
// oscilacion en el sitio (+/-0.2 celdas, solo visual).
function waitInPen( g ) {
  g.pendingRelease--;
  if ( g.pendingRelease <= 0 ) {
    // Fin de la espera: recolocarse en su celda y salir por la puerta.
    g.x = Math.round( g.x );
    g.y = Math.round( g.y );
    g.dir = 'up';
    return;
  }
  g.y = Math.round( g.y ) + 0.2 * Math.sin( g.pendingRelease * 0.1 );
}

// Rutina de salida: alinearse a la columna de la puerta y subir por ella
// hasta la celda de salida. Movimiento guionizado: no consulta muros.
function exitPen( g ) {
  if ( g.x < PEN.doorX ) {
    g.x = Math.min( g.x + g.speed, PEN.doorX );
    g.dir = 'right';
  } else if ( g.x > PEN.doorX ) {
    g.x = Math.max( g.x - g.speed, PEN.doorX );
    g.dir = 'left';
  } else {
    g.dir = 'up';
    g.y = Math.max( g.y - g.speed, PEN.exitY );
  }
}

// Velocidad efectiva del fantasma segun su modo (spec 02). Se aplica SOLO
// al alinear en una celda: cambiarla a mitad de celda romperia la reticula
// 1/n, aligned() dejaria de dispararse y el greedy se atascaria.
function ghostSpeed( g ) {
  if ( g.mode === 'frightened' ) return FRIGHTENED_SPEED;
  if ( g.mode === 'eaten' ) return EATEN_SPEED;
  return GHOST_SPEED;
}

// Activa el modo asustado (spec 02): reinicia timer y cadena, asusta a los
// fantasmas libres (soltados y fuera de la guarida) y les da la vuelta.
// Los que siguen dentro no se asustan (salen normales) y los 'eaten' no se
// re-asustan.
function startFrightened( game ) {
  game.frightenedTimer = FRIGHTENED_FRAMES;
  game.ghostChain = 0;
  for ( const g of game.ghosts ) {
    if ( g.pendingRelease > 0 || inPen( g ) || g.mode === 'eaten' ) continue;
    g.mode = 'frightened';
    g.dir = OPPOSITE[ g.dir ]; // vuelta inmediata al activarse
  }
}

// Revive al comido que llego a la guarida (spec 02): vuelve a 'normal'
// aunque el modo asustado siga activo. Dentro el movimiento es guionizado
// con topes (min/max), asi que aqui si se puede fijar la velocidad sin
// esperar una alineacion; sale con exitPen sin cambios.
function reviveGhost( g ) {
  g.mode = 'normal';
  g.speed = GHOST_SPEED;
  g.dir = 'up';
}

function moveGhost( game, g ) {
  // Guarida: primero la espera escalonada, luego la salida por la puerta.
  if ( g.pendingRelease > 0 ) {
    waitInPen( g );
    return;
  }
  if ( inPen( g ) ) {
    // Comido que llego a la guarida: revive dentro y sale (spec 02).
    if ( g.mode === 'eaten' ) reviveGhost( g );
    exitPen( g );
    return;
  }

  const grid = game.grid;
  const width = grid[ 0 ].length;

  if ( aligned( g.x ) && aligned( g.y ) ) {
    g.x = Math.round( g.x );
    g.y = Math.round( g.y );
    // Velocidad por modo, solo al alinear (ver ghostSpeed).
    g.speed = ghostSpeed( g );
    decideGhost( game, g );
    if ( !canMove( grid, g.x, g.y, g.dir, 'ghost' ) ) return;
  }

  const d = DIRS[ g.dir ];
  g.x += d.x * g.speed;
  g.y += d.y * g.speed;
  wrapTunnel( g, width );
}

function resetPositions( game ) {
  const p = game.pacman;
  p.x = PACMAN_START.x;
  p.y = PACMAN_START.y;
  p.dir = 'left';
  p.nextDir = null;
  game.ghosts.forEach( ( g, i ) => {
    g.x = GHOST_STARTS[ i ].x;
    g.y = GHOST_STARTS[ i ].y;
    g.dir = 'up';
    // Rearmar la salida escalonada al perder una vida.
    g.pendingRelease = g.releaseDelay;
  } );
}

function collides( a, b ) {
  return Math.abs( a.x - b.x ) < 0.5 && Math.abs( a.y - b.y ) < 0.5;
}

function update( game ) {
  movePacman( game );
  game.ghosts.forEach( ( g ) => moveGhost( game, g ) );

  // Cuenta atras del modo asustado: al agotarse, los asustados vuelven a
  // 'normal' (la velocidad se reajusta en la siguiente alineacion).
  if ( game.frightenedTimer > 0 ) {
    game.frightenedTimer--;
    if ( game.frightenedTimer === 0 ) {
      game.ghosts.forEach( ( g ) => {
        if ( g.mode === 'frightened' ) g.mode = 'normal';
      } );
    }
  }

  // Colision segun modo (spec 02): asustado -> comido; ojos -> sin efecto;
  // normal -> vida perdida como hasta ahora.
  for ( const g of game.ghosts ) {
    if ( !collides( game.pacman, g ) ) continue;
    if ( g.mode === 'eaten' ) continue; // ojos: ni puntuan ni matan
    if ( g.mode === 'frightened' ) {
      game.score += GHOST_POINTS[ game.ghostChain ];
      game.ghostChain++;
      g.mode = 'eaten';
      continue; // puede haber mas asustados en contacto este frame
    }
    game.lives--;
    if ( game.lives <= 0 ) {
      game.state = 'lost';
      return;
    }
    resetPositions( game );
    break;
  }

  if ( game.dotsRemaining <= 0 ) game.state = 'won';
}

window.createGame = createGame;
window.update = update;
window.DIRS = DIRS;
