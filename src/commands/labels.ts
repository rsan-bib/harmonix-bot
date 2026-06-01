import type { LoopMode } from '../types';

// Fuente única de las etiquetas de loop, para que /queue y /loop no se desincronicen.

// Tag corto para el estado de loop dentro de /queue.
export const LOOP_TAG: Record<LoopMode, string> = {
  off: '',
  track: '\n\n🔂 **Loop: tema actual**',
  queue: '\n\n🔁 **Loop: cola completa**',
};

// Descripción larga para la respuesta de /loop.
export const LOOP_DESCRIPTION: Record<LoopMode, string> = {
  off: '➡️ Loop **desactivado**. La cola avanza normal.',
  track: '🔂 Loop **del tema actual**. Se repite hasta que cambies el modo (o uses `/skip`).',
  queue: '🔁 Loop **de la cola completa**. Al terminar vuelve a empezar.',
};
