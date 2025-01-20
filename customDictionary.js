"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const jmdict_simplified_node_1 = require("jmdict-simplified-node");
const basicDefinition = {
    appliesToKanji: ['*'],
    appliesToKana: ['*'],
    related: [],
    antonym: [],
    field: [],
    dialect: [],
    languageSource: [],
};
const toIuKoto = {
    id: "999000001",
    kanji: [],
    kana: [{ appliesToKanji: ['*'], common: true, text: 'ということ', tags: [] }],
    sense: [{
            ...basicDefinition,
            partOfSpeech: ["exp"],
            misc: ["id"],
            info: ["Custom Curtiz definition. See Bunpro, MaggieSensei, JLPTSensei, etc."],
            gloss: [{ type: jmdict_simplified_node_1.GlossType.explanation, lang: 'eng', text: 'nominalizes a phrase into a noun' }]
        }]
};
const niIku = {
    id: "999000002",
    kanji: [{ text: 'に行く', common: false, tags: [] }],
    kana: [{ appliesToKanji: ['*'], common: true, text: 'にいく', tags: [] }],
    sense: [{
            ...basicDefinition,
            partOfSpeech: ["gramm"],
            misc: [],
            info: ["Custom Curtiz definition. See Bunpro and JLPTSensei."],
            gloss: [{ type: jmdict_simplified_node_1.GlossType.explanation, lang: 'eng', text: 'to go to ~ (do something)' }]
        }]
};
const niKuru = {
    id: "999000003",
    kanji: [{ text: 'に来る', common: false, tags: [] }],
    kana: [{ appliesToKanji: ['*'], common: true, text: 'にくる', tags: [] }],
    sense: [{
            ...basicDefinition,
            partOfSpeech: ["gramm"],
            misc: [],
            info: ["Custom Curtiz definition. See Kanshudo."],
            gloss: [{ type: jmdict_simplified_node_1.GlossType.explanation, lang: 'eng', text: 'to come to ~ (do something)' }]
        }]
};
const CUSTOM_DICTIONARY = {
    "ということ": toIuKoto,
    "に行く": niIku,
    "に来る": niKuru,
};
if (new Set(Object.values(CUSTOM_DICTIONARY).map(o => o.id)).size !== Object.keys(CUSTOM_DICTIONARY).length) {
    throw new Error('repeated keys found in custom dictionary?');
}
function readingBeginning(_, text, __ = null) {
    if ('ということ'.startsWith(text)) {
        return [CUSTOM_DICTIONARY['ということ']];
    }
    if ('にいく'.startsWith(text)) {
        return [CUSTOM_DICTIONARY['に行く']];
    }
    if ('にくる'.startsWith(text)) {
        return [CUSTOM_DICTIONARY['に来る']];
    }
    return [];
}
exports.readingBeginning = readingBeginning;
