const curtiz = require('../index');
const test = require('tape');

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
  t.is(parsed.length, 3);
  t.is(parsed[0], '# @ 豚さん @ ぶたさん');
  t.ok(parsed[1].startsWith(`- @furigana `));
  t.ok(parsed[2].startsWith(`- @ 豚 @ ぶた`));
  t.ok(parsed[2].includes('@furigana {豚}^{ぶた}'));
  t.end();
});

test('pleaseParse, smart fill-in-the-blank', async t => {
  const block = `# @ 私の花の色
- @pleaseParse`.split('\n');
  const parsed = await curtiz.parseHeaderBlock(block);
  // t.comment(parsed.join('\n'));
  t.ok(parsed.some(s => s.startsWith('- @fill 私[の]花')));
  t.ok(parsed.some(s => s.startsWith('- @fill 花[の]色')));
  t.end();
});

test('pleaseParse, add flashcards for kana words', async t => {
  const block = `# @ わたしのはなはよい
- @pleaseParse`.split('\n');
  const parsed = await curtiz.parseHeaderBlock(block);
  // t.comment(parsed.join('\n'));
  t.ok(parsed.some(s => s.startsWith('- @ 私 @ わたし')));
  t.ok(parsed.some(s => s.includes(' @ はな'))); // Mecab Unidic parses this as 端 (edge?)
  t.ok(parsed.some(s => s.startsWith('- @ 良い @ よい')));
  t.end();
});