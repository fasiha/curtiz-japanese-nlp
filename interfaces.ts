import * as t from 'io-ts';
import {Furigana} from "jmdict-furigana-node";
import {Word} from "jmdict-simplified-node/interfaces";
import {AdjDeconjugated, Deconjugated} from 'kamiya-codec';

import {Bunsetsu} from './jdepp';
import {SimpleCharacter} from './kanjidic';
import {Morpheme} from './mecabUnidic';

export type{Furigana, Ruby} from "jmdict-furigana-node";
export type{
  Gloss,
  Kana,
  Kanji,
  Sense,
  Source,
  Word,
  Xref,
} from "jmdict-simplified-node/interfaces";
export type{Morpheme} from './mecabUnidic';

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
  deconj: AdjDeconjugated[]|Deconjugated[];
}
export interface Particle {
  cloze: ContextCloze;
  startIdx: number;
  endIdx: number;
  morphemes: Morpheme[];
  chino: [number, string[]][];
}
export interface FillInTheBlanks {
  particles: Particle[];
  conjugatedPhrases: ConjugatedPhrase[];
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
export const PartialOverrides = t.partial({nBest: t.number, overrides: t.record(t.string, TFurigana)});
export const v1ReqSentence = t.intersection([t.type({sentence: t.string}), PartialOverrides]);
export const v1ReqSentences = t.intersection([t.type({sentences: t.array(t.string)}), PartialOverrides]);
export type v1ResSentence = string|v1ResSentenceAnalyzed;
export interface v1ResSentenceAnalyzed {
  furigana: Furigana[][];
  hits: ScoreHits[];
  kanjidic: Record<string, SimpleCharacter&{dependencies: SearchMapped<SimpleCharacter|null>[]}>;
  clozes?: FillInTheBlanks;
  tags?: Record<string, string>;
  bunsetsus: Bunsetsu<Morpheme>[];
}
export type v1ResSentenceNbest = v1ResSentence[];

export type SearchMapped<T> = {
  node: string,
  nodeMapped: T,
  children: SearchMapped<T>[],
};
