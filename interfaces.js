"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const t = __importStar(require("io-ts"));
exports.TFurigana = t.array(t.union([t.string, t.type({ ruby: t.string, rt: t.string })]));
exports.PartialOverrides = t.partial({ nBest: t.number, overrides: t.record(t.string, exports.TFurigana) });
exports.v1ReqSentence = t.intersection([t.type({ sentence: t.string }), exports.PartialOverrides]);
exports.v1ReqSentences = t.intersection([t.type({ sentences: t.array(t.string) }), exports.PartialOverrides]);
