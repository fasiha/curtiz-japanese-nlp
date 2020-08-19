import {Furigana} from "jmdict-furigana-node";
import {Word} from "jmdict-simplified-node/interfaces";

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
