import {hasKanji, kata2hira} from 'curtiz-utils';
import {Furigana, JmdictFurigana} from 'jmdict-furigana-node';

import {cartesianProduct} from './combinatorics';
import {longestCommonPrefix} from './utils';

/*

Sometimes MeCab/Unidic is a pain: it'll give a lemma that uses totally different kanji/okurigana, for example for
"抑えられる":

| Literal | Pron.  | Lemma Read. | Lemma    |
| ------- | ------ | ----------- | -------- |
| 抑え     | おさえ  | おさえる      | 押さえる  |
| られる   | ラレル   | ラレル       | られる    |

For "抑える" (pronounced "osaeru"), Unidic will say the lemma is 押さえる (also "osaeru"), but with totally different
kanji: 抑 ("osa") vs 押 ("o").

Another example, for "刺される":

| Literal | Pron. | Lemma Read. | Lemma       |
| ------- | ----- | ----------- | ----------- |
| 刺さ     | ささ   | さす        | 差す         | (actually it's `差す-他動詞` but we split on `-`)
| れる     | レル   | レル        | れる         |

This is a simpler example: only the kanji is different, 刺 (input) vs 差 (proposed lemma).

This function attempts to "fix" such lemmas by
1. finding the prefix overlap between the literal reading ("Pron." column) vs the lemma reading,
2. then find the lemma's substring that matches that prefix using JmdictFurigana, and
3. replaces that prefix in the lemma with the literal's substring that matches the prefix.

In other words, for the first example:
1. it identifies おさえ as the common prefix
2. "おさえ" = "押さえ" in the lemma, while
3. "おさえ" = "抑え" in the literal.
4. Therefore, the "fixed" lemma is "抑える".

The goal of this miserable exercise is to find a lemma that can be used to deconjugate literal text. The Kamiya-Codec
library can only parse the raw text "抑えられる" if it's given "抑える" as the lemma.
*/

interface Args {
  literal: string;
  literalReading: string;
  lemmaReading: string;
  lemma: string;
  jmdictFurigana: JmdictFurigana;
}

const kanjiToKanas: Map<string, Set<string>> = new Map();

/**
 * Given
 * @returns Another lemma that might match the literal better
 */
export function lemmaVsLiteral({literal, literalReading, lemmaReading, lemma, jmdictFurigana}: Args): undefined|string {
  literal = kata2hira(literal);
  literalReading = kata2hira(literalReading);
  lemmaReading = kata2hira(lemmaReading);
  lemma = kata2hira(lemma);

  let lemmaFuriganaEntries = jmdictFurigana.textToEntry.get(lemma);
  if (!lemmaFuriganaEntries) {
    // only reconstruct the furigana using ALL kanji-to-kana mappings JmdictFurigana knows about if
    // the exact lemma can't be found (this is rare)
    const furigana = literalAndReadingToFurigana(lemma, lemmaReading, jmdictFurigana)
    if (furigana) { lemmaFuriganaEntries = [{furigana, text: lemma, reading: lemmaReading}]; }
  }
  if (!lemmaFuriganaEntries) { return }

  const readingsPrefix = literalReading.slice(0, longestCommonPrefix(literalReading, lemmaReading));
  if (readingsPrefix === '') { return; }

  // we know that readings overlap in the beginning, at least a little, and we have furigana for the lemma
  for (const entry of lemmaFuriganaEntries) {
    const rebuiltLemma = furiganaToStringUntilReading(entry.furigana, readingsPrefix);

    const rebuiltLiteralFurigana = literalAndReadingToFurigana(literal, literalReading, jmdictFurigana);
    if (!rebuiltLiteralFurigana) { continue; }
    const rebuiltLiteral = furiganaToStringUntilReading(rebuiltLiteralFurigana, readingsPrefix);

    if (rebuiltLemma && rebuiltLiteral) { return rebuiltLiteral + lemma.slice(rebuiltLemma.length); }
  }
}

/**
 * Given an array of Furigana (string or ruby/rt), and a potentially shorter target reading,
 * return the substring of the literal (with kanji) and reading (without kanji) that matches
 * the target.
 * @returns
 */
function furiganaToStringUntilReading(furigana: Furigana[], targetReading: string): string|undefined {
  // replace multi-kana strings in the Furigana array with single characters
  furigana = furigana.flatMap<Furigana>((f) => typeof f === 'string' ? f.split('') : f)

  let currentReading = '';
  let currentText = '';
  for (const f of furigana) {
    if (typeof f === 'string') {
      currentReading = currentReading + f;
      currentText = currentText + kata2hira(f);
    } else {
      currentReading = currentReading + kata2hira(f.rt);
      currentText = currentText + f.ruby;
    }

    // flaw 2: assume the overlap never ends "mid-kanji"
    if (currentReading === targetReading) {
      // found it
      return currentText

    } else if (currentReading.length >= targetReading.length) {
      // didn't find anything
      return undefined
    }
  }
}

function literalAndReadingToFurigana(literal: string, reading: string, jmdictFurigana: JmdictFurigana): Furigana[]|
    undefined {
  setup(jmdictFurigana);
  const readingInHiragana = kata2hira(reading);

  const literalKanjis =
      Array.from(Array(literal.length), (_, n) => ({n, kanji: literal[n]})).filter(({kanji}) => hasKanji(kanji))
  // flaw 1: it's possible that this is a 2 or 3-unit kanji whose individual pieces won't be in jmdictfurigana

  const possibleReadings = literalKanjis.map(({kanji}) => Array.from(kanjiToKanas.get(kanji) ?? []));
  for (const group of cartesianProduct(...possibleReadings)) {
    // replace kanji in `literal` with proposed hiragana
    const proposed = literal.split('')
    for (let [idx, thisReading] of group.entries()) { proposed.splice(literalKanjis[idx].n, 1, thisReading); }

    // here's the proposed way to read the literal
    const proposedReading = proposed.join('');

    if (kata2hira(proposedReading) === readingInHiragana) {
      // found it!
      const furiganas: Furigana[] = proposed;
      for (let [idx, thisReading] of group.entries()) {
        furiganas[literalKanjis[idx].n] = { ruby: literalKanjis[idx].kanji, rt: thisReading }
      }
      return furiganas;
    }
  }
  return undefined;
}

function setup(jmdictFurigana: JmdictFurigana) {
  if (kanjiToKanas.size > 0) return;
  for (const es of jmdictFurigana.textToEntry.values()) {
    for (const e of es) {
      for (const f of e.furigana) {
        if (typeof f === 'object') {
          if (kanjiToKanas.has(f.ruby)) {
            kanjiToKanas.get(f.ruby)?.add(f.rt)
          } else {
            kanjiToKanas.set(f.ruby, new Set([f.rt]))
          }
        }
      }
    }
  }
}
