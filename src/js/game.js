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

  // Greedy por distancia Manhattan al objetivo propio del kind.
  const target = ghostTarget( game, g );
  let best = choices[ 0 ];
  let bestDist = Infinity;
  for ( const dir of choices ) {
    const d = DIRS[ dir ];
    const nx = g.x + d.x;
    const ny = g.y + d.y;
    const dist = Math.abs( nx - target.x ) + Math.abs( ny - target.y );
    if ( dist < bestDist ) {
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

function moveGhost( game, g ) {
  // Guarida: primero la espera escalonada, luego la salida por la puerta.
  if ( g.pendingRelease > 0 ) {
    waitInPen( g );
    return;
  }
  if ( inPen( g ) ) {
    exitPen( g );
    return;
  }

  const grid = game.grid;
  const width = grid[ 0 ].length;

  if ( aligned( g.x ) && aligned( g.y ) ) {
    g.x = Math.round( g.x );
    g.y = Math.round( g.y );
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

  for ( const g of game.ghosts ) {
    if ( collides( game.pacman, g ) ) {
      game.lives--;
      if ( game.lives <= 0 ) {
        game.state = 'lost';
        return;
      }
      resetPositions( game );
      break;
    }
  }

  if ( game.dotsRemaining <= 0 ) game.state = 'won';
}

window.createGame = createGame;
window.update = update;
window.DIRS = DIRS;
