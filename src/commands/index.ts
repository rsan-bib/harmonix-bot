import type { Command } from '../types';

import { play } from './play';
import { radio } from './radio';
import { skip } from './skip';
import { stop } from './stop';
import { queue } from './queue';
import { nowplaying } from './nowplaying';
import { help } from './help';
import { pause } from './pause';
import { resume } from './resume';
import { volume } from './volume';
import { loop } from './loop';
import { shuffle } from './shuffle';
import { remove } from './remove';
import { clear } from './clear';

// Orden de declaración = orden en que aparecen en Discord.
export const commands: Command[] = [
  play,
  radio,
  pause,
  resume,
  skip,
  volume,
  loop,
  stop,
  queue,
  nowplaying,
  shuffle,
  remove,
  clear,
  help,
];

// Lookup por nombre para el dispatch en bot.ts.
export const commandMap = new Map<string, Command>(
  commands.map((c) => [c.data.name, c])
);
