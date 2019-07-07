#!/usr/bin/env node
import {addJdepp} from './jdepp';
import {kata2hira} from './kana';
import {goodMorphemePredicate, invokeMecab, maybeMorphemesToMorphemes, Morpheme, parseMecab} from './mecabUnidic';
import {enumerate, filterRight, flatten, hasKanji, partitionBy, takeWhile} from './utils';

async function parse(sentence: string): Promise<{morphemes: Morpheme[]; bunsetsus: Morpheme[][];}> {
  let rawMecab = await invokeMecab(sentence);
  let morphemes = maybeMorphemesToMorphemes(parseMecab(sentence, rawMecab)[0].filter(o => !!o));
  let bunsetsus = await addJdepp(rawMecab, morphemes);
  return {morphemes, bunsetsus};
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

const flashableMorpheme = (m: Morpheme) => {
  const pos = m.partOfSpeech.join('-');
  if (hasKanji(m.literal) && !pos.endsWith('numeral')) { return true; }
  if (pos.endsWith('numeral')) { return false; }
  if (pos.startsWith('verb-general') || pos.startsWith('noun') || pos.startsWith('pronoun') ||
      pos.startsWith('adjective') || pos.startsWith('adverb')) {
    return true;
  }
  return false;
};
export async function parseHeaderBlock(block: string[]): Promise<string[]> {
  const atHeaderRe = /^#+\s+@\s+/;
  const match = block[0].match(atHeaderRe);
  if (match) {
    const line = block[0].slice(match[0].length);
    let [prompt, response] = line.split('@').map(s => s.trim());

    // process line and block.
    const hasResponse = !!response;
    const hasPleaseParse =
        takeWhile(block.slice(1), s => s.startsWith('- @')).some(s => s.startsWith(PLEASE_PARSE_BLOCK));
    if (!hasResponse || hasPleaseParse) {
      const parsed = await parse(line);
      if (!hasResponse) {
        response = kata2hira(flatten(parsed.bunsetsus)
                                 .filter(m => m.partOfSpeech[0] !== 'supplementary_symbol')
                                 .map(m => hasKanji(m.literal)
                                               ? kata2hira(m.literal === m.lemma ? m.lemmaReading : m.pronunciation)
                                               : m.literal)
                                 .join(''));
        block[0] = block[0] + ' @ ' + response;
      }
      if (hasPleaseParse) {
        // add @flash lines
        let flashBullets: string[] = [];
        for (let [midx, morpheme] of enumerate(parsed.morphemes)) {
          if (flashableMorpheme(morpheme)) {
            const mprompt = (morpheme.partOfSpeech[1] === 'proper') ? morpheme.literal : morpheme.lemma;
            const mresponse = (morpheme.partOfSpeech[1] === 'proper') ? kata2hira(morpheme.pronunciation)
                                                                      : kata2hira(morpheme.lemmaReading);

            const left = parsed.morphemes.slice(0, midx).map(m => m.literal).join('');
            const right = parsed.morphemes.slice(midx + 1).map(m => m.literal).join('');
            let cloze = generateContextClozed(left, morpheme.literal, right);
            let final = '';
            if (mprompt === morpheme.literal && appearsExactlyOnce(prompt, morpheme.literal)) {
              final = `- @ ${mprompt} @ ${mresponse}    @pos ${morpheme.partOfSpeech.join('-')}`;
            } else {
              final = `- @ ${mprompt} @ ${mresponse}    @pos ${morpheme.partOfSpeech.join('-')} @omit ${cloze}`;
            }
            flashBullets.push(final);
          }
        }
        block.splice(1, 0, ...flashBullets);

        // add @fill lines
        block.splice(1, 0, ...identifyFillInBlanks(parsed.bunsetsus));

        // remove @pleaseParse
        block = block.filter(s => !s.startsWith(PLEASE_PARSE_BLOCK));
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
    let searchForParticles = true;
    if (bunsetsu.length > 1 && (pos0.startsWith('verb') || pos0.endsWith('_verb') || pos0.startsWith('adject'))) {
      let ignoreRight = filterRight(bunsetsu, m => !goodMorphemePredicate(m));
      let goodBunsetsu = ignoreRight.length === 0 ? bunsetsu : bunsetsu.slice(0, -ignoreRight.length);
      if (goodBunsetsu.length > 1) {
        searchForParticles = false;
        let cloze = bunsetsuToString(goodBunsetsu);
        let left = bunsetsus.slice(0, bidx).map(bunsetsuToString).join('');
        let right = bunsetsuToString(ignoreRight) + bunsetsus.slice(bidx + 1).map(bunsetsuToString).join('');
        literalClozes.set(generateContextClozed(left, cloze, right), goodBunsetsu);
      }
    }
    // only add particles if they're NOT inside conjugated phrases
    if (searchForParticles) {
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

const USAGE = `USAGE 1:
$ node [this-script.js] [markdown.md]

USAGE 2:
$ cat [markdown.md] | node [this-script.js]

Both will print a parsed version of the input.`;
if (require.main === module) {
  const promisify = require('util').promisify;
  const readFile = promisify(require('fs').readFile);
  const getStdin = require('get-stdin');
  (async function() {
    const text = process.argv[2] ? await readFile(process.argv[2], 'utf8') : ((await getStdin()) || USAGE);
    // Split Markdown at header (`# blabla`)
    let blocks = splitAtHeaders(text);
    // Parse headers
    let content = await parseAllHeaderBlocks(blocks);
    // Print result
    console.log(content.map(v => v.join('\n')).join('\n'));
  })();
}