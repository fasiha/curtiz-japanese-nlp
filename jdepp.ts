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

export async function addJdepp<Morpheme>(raw: string, morphemes: Morpheme[]): Promise<Morpheme[][]> {
  let jdeppRaw = await invokeJdepp(raw);
  let jdeppSplit = parseJdepp('', jdeppRaw);
  let bunsetsus: Morpheme[][] = [];
  {
    let added = 0;
    for (let bunsetsu of jdeppSplit) {
      // -1 because each `bunsetsu` array here will contain a header before the morphemes
      bunsetsus.push(morphemes.slice(added, added + bunsetsu.length - 1));
      added += bunsetsu.length - 1;
    }
  }
  return bunsetsus;
}
