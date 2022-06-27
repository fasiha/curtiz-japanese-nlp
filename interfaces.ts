import * as t from 'io-ts';
import {Furigana} from "jmdict-furigana-node";
import {Word} from "jmdict-simplified-node/interfaces";
import {AdjDeconjugated, Deconjugated, DeconjugatedAuxiliary} from 'kamiya-codec';

import {SimpleCharacter} from './kanjidic';
import {Morpheme} from './mecabUnidic';

export {Furigana, Ruby} from "jmdict-furigana-node";
export {
  Gloss,
  Kana,
  Kanji,
  Sense,
  Source,
  Word,
  Xref,
} from "jmdict-simplified-node/interfaces";
export {Morpheme} from './mecabUnidic';

export interface ScoreHit {
  wordId: Word['id'];
  score: number;
  search: string;
  summary?: string;
  word?: Word;
}
export interface ScoreHits {
  startIdx: number;
  results: {
    endIdx: number,
    run: string|ContextCloze,
    results: ScoreHit[],
  }[];
}
export interface ConjugatedPhrase {
  startIdx: number;
  endIdx: number;
  cloze: ContextCloze;
  lemmas: Furigana[][];
  morphemes: Morpheme[];
  deconj: AdjDeconjugated[]|(DeconjugatedAuxiliary|Deconjugated)[];
}
export interface Particle {
  cloze: ContextCloze;
  startIdx: number;
  endIdx: number;
  morphemes: Morpheme[];
}
export interface FillInTheBlanks {
  particles: Map<string, Particle>;
  conjugatedPhrases: Map<string, ConjugatedPhrase>;
}
type MapValuesToRecordValues<M> = {
  [k in keyof M]: Record<string, M[k] extends Map<string, infer X>? X : never>
};
export type FillInTheBlanksExport = MapValuesToRecordValues<FillInTheBlanks>;
/* the above is equivalent to:
interface FillInTheBlanksExport_equiv {
  particles: Record<string, ContextCloze>;
  conjugatedPhrases: Record<string, ConjugatedPhrase>;
}
Needed because Maps don't JSON-serialize and and I don't want to replace Map with Record in library code
*/
export interface ContextCloze {
  left: string;
  cloze: string;
  right: string;
}
export interface AnalysisResult {
  furigana?: Furigana[][];
  particlesConjphrases: FillInTheBlanks;
  dictionaryHits: ScoreHits[];
}

export const TFurigana = t.array(t.union([t.string, t.type({ruby: t.string, rt: t.string})]));
export const PartialOverrides = t.partial({overrides: t.record(t.string, TFurigana)});
export const v1ReqSentence = t.intersection([t.type({sentence: t.string}), PartialOverrides]);
export const v1ReqSentences = t.intersection([t.type({sentences: t.array(t.string)}), PartialOverrides]);
export type v1ResSentence = string|v1ResSentenceAnalyzed;
export interface v1ResSentenceAnalyzed {
  furigana: Furigana[][];
  hits: ScoreHits[];
  kanjidic: Record<string, SimpleCharacter&{dependencies: SearchMapped<SimpleCharacter|null>[]}>;
  clozes?: FillInTheBlanksExport;
  tags?: Record<string, string>;
}

export type SearchMapped<T> = {
  node: string,
  nodeMapped: T,
  children: SearchMapped<T>[],
};
