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
const tarekomu = {
    "id": "999000004",
    "kanji": [{ "common": false, "text": "垂れ込む", "tags": [] }],
    "kana": [{ "common": false, "text": "たれこむ", "tags": [], "appliesToKanji": ["*"] }],
    "sense": [{
            "partOfSpeech": ["v1", "vi"],
            "appliesToKanji": ["*"],
            "appliesToKana": ["*"],
            "related": [["垂れ込める"]],
            "antonym": [],
            "field": [],
            "dialect": [],
            "misc": ["col"],
            "info": ["Custom Curtiz definition. Colloquial/vernacular form of 垂れ込める"],
            "languageSource": [],
            "gloss": [{ "lang": "eng", "type": null, "text": "to hang low (over; of clouds, fog, etc.)" }]
        }]
};
const hyururi = {
    "id": "999000005",
    "kanji": [],
    "kana": [
        { "common": false, "text": "ヒュルリヒュルリ", "tags": [], "appliesToKanji": ["*"] },
        { "common": false, "text": "ひゅるりひゅるり", "tags": [], "appliesToKanji": ["*"] }
    ],
    "sense": [{
            "partOfSpeech": ["n", "adj-f", "adv-to"],
            "appliesToKanji": ["*"],
            "appliesToKana": ["*"],
            "related": [["ヒューヒュー"]],
            "antonym": [],
            "field": [],
            "dialect": [],
            "misc": ["on-mim"],
            "info": ["Custom Curtiz definition. Softening of ヒューヒュー"],
            "languageSource": [],
            "gloss": [
                { "lang": "eng", "type": null, "text": "soft whistling or sound of the wind" },
            ]
        }]
};
// Add the above to this dictionary so we can do some sanity checking
const CUSTOM_DICTIONARY = {
    "ということ": toIuKoto,
    "に行く": niIku,
    "に来る": niKuru,
    "垂れ込む": tarekomu,
    "hyururi": hyururi
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
    if ('たれこむ'.startsWith(text)) {
        return [CUSTOM_DICTIONARY['垂れ込む']];
    }
    if ('ひゅるりひゅるり'.startsWith(text)) {
        return [CUSTOM_DICTIONARY.hyururi];
    }
    return [];
}
exports.readingBeginning = readingBeginning;
