"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
let hiragana = "ぁあぃいぅうぇえぉおかがきぎくぐけげこごさざしじすずせぜそぞただちぢっつづてでとどなに" +
    "ぬねのはばぱひびぴふぶぷへべぺほぼまみむめもゃやゅゆょよらりるれろゎわゐゑをんゔゕゖ";
let katakana = "ァアィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニ" +
    "ヌネノハバパヒビピフブプヘベペホボマミムメモャヤュユョヨラリルレロヮワヰヱヲンヴヵヶ";
if (hiragana.length !== katakana.length) {
    throw new Error('Kana strings not same length?');
}
exports.kata2hiraMap = new Map([]);
exports.hira2kataMap = new Map([]);
hiragana.split('').forEach((h, i) => {
    exports.kata2hiraMap.set(katakana[i], h);
    exports.hira2kataMap.set(h, katakana[i]);
});
function kata2hira(s) { return s.split('').map(c => exports.kata2hiraMap.get(c) || c).join(''); }
exports.kata2hira = kata2hira;
function hira2kata(s) { return s.split('').map(c => exports.hira2kataMap.get(c) || c).join(''); }
exports.hira2kata = hira2kata;
/*
There are other ways of doing this. In Unicode, katakana is 96 codepoints above hiragana. So
`String.fromCharCode(hiragana.charCodeAt(0) + 96)` will produce katakana. In speed tests though, the above Map-based
approach had the least variability in runtime (200 to 800 microseconds), while arithmetic-based approaches used 100 to
1500 microseconds.
*/
