import * as t from 'io-ts';
import {Furigana} from "jmdict-furigana-node";
import {Word} from "jmdict-simplified-node/interfaces";

import {SimpleCharacter} from './kanjidic';

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

export interface ScoreHit {
  wordId: Word['id'];
  score: number;
  search: string;
  summary?: string;
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
  cloze: ContextCloze;
  lemmas: Furigana[][];
}
export interface FillInTheBlanks {
  particles: Map<string, ContextCloze>;
  conjugatedPhrases: Map<string, ConjugatedPhrase>;
}
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
}
export type SearchMapped<T> = {
  node: string,
  nodeMapped: T,
  children: SearchMapped<T>[],
};
