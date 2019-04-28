let hiragana = "ぁあぃいぅうぇえぉおかがきぎくぐけげこごさざしじすずせぜそぞただちぢっつづてでとどなに" +
               "ぬねのはばぱひびぴふぶぷへべぺほぼまみむめもゃやゅゆょよらりるれろゎわゐゑをんゔゕゖ";
let katakana = "ァアィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニ" +
               "ヌネノハバパヒビピフブプヘベペホボマミムメモャヤュユョヨラリルレロヮワヰヱヲンヴヵヶ";

if (hiragana.length !== katakana.length) { throw new Error('Kana strings not same length?'); }

let kata2hiraMap: Map<string, string> = new Map([]);
let hira2kataMap: Map<string, string> = new Map([]);
hiragana.split('').forEach((h, i) => {
  kata2hiraMap.set(katakana[i], h);
  hira2kataMap.set(h, katakana[i])
});

export function kata2hira(s: string) { return s.split('').map(c => kata2hiraMap.get(c) || c).join(''); }
export function hira2kata(s: string) { return s.split('').map(c => hira2kataMap.get(c) || c).join(''); }

/*
There are other ways of doing this. In Unicode, katakana is 96 codepoints above hiragana. So
`String.fromCharCode(hiragana.charCodeAt(0) + 96)` will produce katakana. In speed tests though, the above Map-based
approach had the least variability in runtime (200 to 800 microseconds), while arithmetic-based approaches used 100 to
1500 microseconds.
*/
