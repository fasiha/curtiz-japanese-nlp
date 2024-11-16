import {GlossType, Word} from "jmdict-simplified-node";

const basicDefinition = {
  appliesToKanji: ['*'],
  appliesToKana: ['*'],
  related: [],
  antonym: [],
  field: [],
  dialect: [],
  languageSource: [],
}

export function readingBeginning(_: null, text: string, __ = null): Word[] {
  console.log('text', text)
  if ('ということ'.startsWith(text)) {
    console.log('HIT!')
    return [{
      id: "999000001",
      kanji: [],
      kana: [{appliesToKanji: ['*'], common: true, text: 'ということ', tags: []}],
      sense: [{
        ...basicDefinition,
        partOfSpeech: ["exp"], // expression
        misc: ["id"],          // idiom
        info: ["see Bunpro, MaggieSensei, JLPTSensei, etc."],
        gloss: [{type: GlossType.explanation, lang: 'eng', text: 'nominalizes a phrase into a noun'}]
      }]
    }]
  }
  return [];
}