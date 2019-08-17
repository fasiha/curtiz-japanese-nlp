const curtiz = require('../index');
const test = require('tape');
const p = x => console.dir(x, {depth: null});
test('reading generation', async t => {
  const block = `# @ 豚さん`.split('\n');
  const parsed = await curtiz.parseHeaderBlock(block);
  t.is(parsed.length, 2);
  t.is(parsed[0], '# @ 豚さん @ ぶたさん');
  t.ok(parsed[1].startsWith('- @furigana '));
  t.end();
});

test('pleaseParse, make flashcard', async t => {
  const block = `# @ 豚さん
- @pleaseParse`.split('\n');
  const parsed = await curtiz.parseHeaderBlock(block);
  t.ok(parsed.every(s => !s.includes('pleaseParse')));
  t.is(parsed.length, 3 + 2);
  t.is(parsed[0], '# @ 豚 @ ぶた');
  t.is(parsed[1], '- @furigana {豚}^{ぶた}');
  t.is(parsed[2], '# @ 豚さん @ ぶたさん');
  t.ok(parsed[3].startsWith(`- @furigana `));
  t.ok(parsed[4].startsWith(`- @ 豚 @ ぶた`));
  t.end();
});

test('pleaseParse, smart fill-in-the-blank', async t => {
  const block = `# @ 私の花の色
- @pleaseParse`.split('\n');
  const parsed = await curtiz.parseHeaderBlock(block);
  t.ok(parsed.some(s => s.startsWith('- @fill 私[の]花')));
  t.ok(parsed.some(s => s.startsWith('- @fill 花[の]色')));
  t.end();
});

test('pleaseParse, add flashcards for kana words', async t => {
  const block = `# @ わたしのはなはよい
- @pleaseParse`.split('\n');
  const parsed = await curtiz.parseHeaderBlock(block);
  t.ok(parsed.some(s => s.startsWith('- @ 私 @ わたし')));
  t.ok(parsed.some(s => s.includes(' @ はな'))); // Mecab Unidic parses this as 端 (edge?)
  t.ok(parsed.some(s => s.startsWith('- @ 良い @ よい')));
  t.end();
});

test('reusing earlier definitions', async t => {
  const text = `## @ 湯婆婆 @ ゆばあば
- @furigana {湯}^{ゆ}{婆}^{ばあ}{婆}^{ば}
## @ 釜爺
## @ 湯婆婆の息子
- @pleaseParse`;
  const blocks = curtiz.splitAtHeaders(text);
  const parsed = await curtiz.parseAllHeaderBlocks(blocks);
  // console.log(parsed);
  t.equal(parsed.length, 3);
  t.equal(parsed[0].length, 2);
  t.equal(parsed[1].length, 2);
  t.equal(parsed[2].length, 2 + 5);

  t.ok(parsed[1][0].includes('かまじい'));
  t.ok(parsed[1][1].includes('@furigana'));
  t.ok(parsed[1][1].includes('{釜}^{かま}{爺}^{じい}'));

  t.ok(parsed[2][0].includes('# @ 息子 @ むすこ'));
  t.ok(parsed[2][1].includes('@furigana'));
  t.ok(parsed[2][1].includes('{息子}^{むすこ}'));

  t.ok(parsed[2][2].includes('ゆばあばのむすこ'));
  t.ok(parsed[2][3].includes('{湯}^{ゆ}{婆}^{ばあ}{婆}^{ば}'));
  t.ok(parsed[2].some(s => s.includes('湯婆婆 @ ゆばあば')));

  t.end();
})