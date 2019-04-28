import * as jdepp from './jdepp';
import {kata2hira} from './kana';
import {goodMorphemePredicate, invokeMecab, maybeMorphemesToMorphemes, Morpheme, parseMecab} from './mecabUnidic';
import {enumerate, filterRight, flatten, hasKanji, partitionBy, takeWhile} from './utils';

export async function parse(sentence: string): Promise<{morphemes: Morpheme[]; bunsetsus: Morpheme[][];}> {
  let rawMecab = await invokeMecab(sentence);
  let morphemes = maybeMorphemesToMorphemes(parseMecab(sentence, rawMecab)[0].filter(o => !!o));
  let bunsetsus = await addJdepp(rawMecab, morphemes);
  return {morphemes, bunsetsus};
}

export async function addJdepp(raw: string, morphemes: Morpheme[]): Promise<Morpheme[][]> {
  let jdeppRaw = await jdepp.invokeJdepp(raw);
  let jdeppSplit = jdepp.parseJdepp('', jdeppRaw);
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

const bunsetsuToString = (morphemes: Morpheme[]) => morphemes.map(m => m.literal).join('');

export function splitAtHeaders(text: string): string[][] {
  const headerRe = /^#+\s+.+$/;
  return partitionBy(text.split('\n'), s => headerRe.test(s));
}

export async function parseAllHeaderBlocks(blocks: string[][], concurrentLimit: number = 8) {
  let ret: string[][] = [];
  let promises: Promise<string[]>[] = [];
  for (let o of blocks) {
    if (promises.length >= concurrentLimit) {
      const thisRet = await Promise.all(promises);
      for (const o of thisRet) { ret.push(o); }
      promises = [];
    }
    promises.push(parseHeaderBlock(o));
  }
  if (promises.length > 0) {
    const thisRet = await Promise.all(promises);
    for (const o of thisRet) { ret.push(o); }
  }
  return ret;
}

const PLEASE_PARSE_BLOCK = '- @pleaseParse';

export async function parseHeaderBlock(block: string[]): Promise<string[]> {
  const atHeaderRe = /^#+\s+@\s+/;
  const match = block[0].match(atHeaderRe);
  if (match) {
    const line = block[0].slice(match[0].length);
    // process line and block.
    const hasResponse = line.includes('@');
    const hasPleaseParse =
        takeWhile(block.slice(1), s => s.startsWith('- @')).some(s => s.startsWith(PLEASE_PARSE_BLOCK));
    if (!hasResponse || hasPleaseParse) {
      const parsed = await parse(line);
      if (hasPleaseParse) {
        // add @flash lines
        const flashBullets = parsed.morphemes.filter(m => hasKanji(m.literal))
                                 .map(m => `- @flash ${m.lemma} @ ${kata2hira(m.lemmaReading)}`);
        block.splice(1, 0, ...flashBullets);

        // add @fill lines
        block.splice(1, 0, ...identifyFillInBlanks(parsed.bunsetsus));

        // remove @pleaseParse
        block = block.filter(s => !s.startsWith(PLEASE_PARSE_BLOCK));
      }
      if (!hasResponse) {
        const parsedReading =
            flatten(parsed.bunsetsus)
                .filter(m => m.partOfSpeech[0] !== 'supplementary_symbol')
                .map(m => hasKanji(m.literal) ? kata2hira(m.literal === m.lemma ? m.lemmaReading : m.pronunciation)
                                              : m.literal)
                .join('');
        block[0] = block[0] + ' @ ' + parsedReading;
      }
    }
  }
  return block;
}
/**
 * Ensure needle is found in haystack only once
 * @param haystack big string
 * @param needle little string
 */
function appearsExactlyOnce(haystack: string, needle: string): boolean {
  let hit: number;
  return (hit = haystack.indexOf(needle)) >= 0 && (hit = haystack.indexOf(needle, hit + 1)) < 0;
}
/**
 * Given three consecuties substrings (the arguments), return either
 * - `${left2}[${cloze}]${right2}` where `left2` and `right2` are as short as possible (and of equal length, if
 *    possible) so the this return string (minus the brackets) is unique in the full string, or
 * - `${cloze}` if `left2 === right2 === ''` (i.e., the above but without the brackets).
 * @param left left string, possibly empty
 * @param cloze middle string
 * @param right right string, possible empty
 * @throws in the unlikely event that such a return string cannot be build (I cannot think of an example though)
 */
function generateContextClozed(left: string, cloze: string, right: string): string {
  const sentence = left + cloze + right;
  let leftContext = '';
  let rightContext = '';
  let contextLength = 0;
  while (!appearsExactlyOnce(sentence, leftContext + cloze + rightContext)) {
    contextLength++;
    if (contextLength >= left.length && contextLength >= right.length) {
      throw new Error('Ran out of context to build unique cloze');
    }
    leftContext = left.slice(-contextLength);
    rightContext = right.slice(0, contextLength);
  }
  if (leftContext === '' && rightContext === '') { return cloze; }
  return `${leftContext}[${cloze}]${rightContext}`;
}

function identifyFillInBlanks(bunsetsus: Morpheme[][]) {
  // Find clozes: particles and conjugated verb/adjective phrases
  let literalClozes: Map<string, Morpheme[]> = new Map([]);
  const particlePredicate = (p: Morpheme) => p.partOfSpeech[0].startsWith('particle') && p.partOfSpeech.length > 1 &&
                                             !p.partOfSpeech[1].startsWith('phrase_final');
  for (let [bidx, bunsetsu] of enumerate(bunsetsus)) {
    let first = bunsetsu[0];
    if (!first) { continue; }
    const pos0 = first.partOfSpeech[0];
    if (bunsetsu.length > 1 && (pos0.startsWith('verb') || pos0.endsWith('_verb') || pos0.startsWith('adject'))) {
      let ignoreRight = filterRight(bunsetsu, m => !goodMorphemePredicate(m));
      let goodBunsetsu = ignoreRight.length === 0 ? bunsetsu : bunsetsu.slice(0, -ignoreRight.length);
      let cloze = bunsetsuToString(goodBunsetsu);
      let left = bunsetsus.slice(0, bidx).map(bunsetsuToString).join('');
      let right = bunsetsuToString(ignoreRight) + bunsetsus.slice(bidx + 1).map(bunsetsuToString).join('');
      literalClozes.set(generateContextClozed(left, cloze, right), goodBunsetsu);
    } else {
      // only add particles if they're NOT inside conjugated phrases
      for (let [pidx, particle] of enumerate(bunsetsu)) {
        if (particlePredicate(particle)) {
          let left =
              bunsetsus.slice(0, bidx).map(bunsetsuToString).join('') + bunsetsuToString(bunsetsu.slice(0, pidx));
          let right =
              bunsetsuToString(bunsetsu.slice(pidx + 1)) + bunsetsus.slice(bidx + 1).map(bunsetsuToString).join('');
          literalClozes.set(generateContextClozed(left, particle.literal, right), [particle]);
        }
      }
    }
  }
  let existingClozes: Set<string> = new Set([]);
  let bullets: string[] = [];
  for (let [cloze, bunsetsu] of literalClozes) {
    if (!existingClozes.has(cloze)) {
      let acceptable = [cloze];
      if (hasKanji(bunsetsuToString(bunsetsu))) {
        acceptable.push(kata2hira(bunsetsu.map(m => m.pronunciation).join('')))
      }
      bullets.push('- @fill ' + acceptable.join(' @ '));
    }
  }
  return bullets;
}

const USAGE = `USAGE:
$ node [this-script.js] [markdown.md]
will print a parsed version of the input Markdown.`;
if (require.main === module) {
  const promisify = require('util').promisify;
  const readFile = promisify(require('fs').readFile);
  (async function() {
    if (process.argv.length < 3) {
      console.log(USAGE);
      process.exit(1);
      return;
    }
    // Read Markdown and split at header (`# blabla`)
    const filename = process.argv[2];
    let blocks = splitAtHeaders(await readFile(filename, 'utf8'));
    // Parse headers
    let content = await parseAllHeaderBlocks(blocks);
    // Print result
    console.log(content.map(v => v.join('\n')).join('\n'));
  })();
}