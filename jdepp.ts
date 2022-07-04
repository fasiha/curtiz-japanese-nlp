import {partitionBy} from 'curtiz-utils';
const spawn = require('child_process').spawn;
export function invokeJdepp(line: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let spawned = spawn('jdepp');
    spawned.stdin.write(line);
    spawned.stdin.write('\n'); // necessary, otherwise MeCab says `input-buffer overflow.`
    spawned.stdin.end();
    let arr: string[] = [];
    spawned.stdout.on('data', (data: Buffer) => arr.push(data.toString('utf8')));
    spawned.on('close', (code: number) => {
      if (code !== 0) { reject(code); }
      resolve(arr.join(''));
    });
  });
}
export function parseJdepp(original: string, result: string) {
  const pieces = result.trim().split('\n').filter(s => !(s.startsWith('#') || s.startsWith('EOS')));
  return partitionBy(pieces, v => v.startsWith('*'));
}

export interface Bunsetsu<Morpheme> {
  morphemes: Morpheme[];
  idx: number;
  parent: number;
}

export async function addJdepp<Morpheme>(raw: string, morphemes: Morpheme[]): Promise<Bunsetsu<Morpheme>[]> {
  const jdeppRaw = await invokeJdepp(raw);
  const jdeppSplit = parseJdepp('', jdeppRaw);
  const bunsetsus: Bunsetsu<Morpheme>[] = [];
  {
    let added = 0;
    for (let bunsetsu of jdeppSplit) {
      // -1 because each `bunsetsu` array here will contain a header before the morphemes
      const thisMorphemes = morphemes.slice(added, added + bunsetsu.length - 1);
      const match = bunsetsu[0].match(/^\*\s+(?<child>[0-9]+)\s+(?<parent>[-0-9]+)D/);
      if (!match?.groups) { throw new Error('problem parsing Jdepp output') }
      const {child, parent} = match.groups;
      bunsetsus.push({morphemes: thisMorphemes, idx: +child, parent: +parent});
      added += bunsetsu.length - 1;
    }
  }
  return bunsetsus;
}
