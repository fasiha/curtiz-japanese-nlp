// Based on Naoko Chino's *All About Particles* (Kodansha)

import {readFileSync} from 'fs';

const idxChinoParticles: [number, string[]][] =
    readFileSync('chino-all-about-particles.txt', 'utf8').trim().split('\n').map((s, i) => [i + 1, s.split('・')]);

export function lookup(raw: string) {
  const ret: typeof idxChinoParticles = [];
  if (raw.length === 0) { return ret; }
  for (const [idx, list] of idxChinoParticles) {
    if (list.some(chino => chino.includes(raw))) { ret.push([idx, list]); }
  }
  return ret;
}