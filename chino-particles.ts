// Based on Naoko Chino's *All About Particles* (Kodansha)

import {readFileSync} from 'fs';
import path from "path";

const idxChinoParticles: [number, string[]][] =
    readFileSync(path.join(__dirname, 'chino-all-about-particles.txt'), 'utf8')
        .trim()
        .split('\n')
        .map((s, i) => [i + 1, s.split('・')]);

export function lookup(raw: string) {
  const ret: typeof idxChinoParticles = [];
  if (raw.length === 0) { return ret; }

  const rawAlternative = raw === 'ん' ? 'の' : '';
  for (const [idx, list] of idxChinoParticles) {
    if (list.some(chino => chino.includes(raw) || (rawAlternative && chino.includes(rawAlternative)))) {
      ret.push([idx, list]);
    }
  }

  const scoreMatch = ([_, v]: typeof idxChinoParticles[0]) => {
    const hits = v.filter(s => s.includes(raw) || (rawAlternative && s.includes(rawAlternative)))
                     .map(s => Math.abs(s.length - raw.length));
    return [Math.min(...hits), hits.length, v.length];
    // Exact matches come first (minimize superfluous characters).
    // Then total number of matches
    // Finally total number of particles in this group
  };
  ret.sort((a, b) => {
    const a2 = scoreMatch(a);
    const b2 = scoreMatch(b);
    return (a2[0] - b2[0]) || (a2[1] - b2[1]) || (a2[2] - b2[2]);
  })
  return ret;
}