import test from 'tape';

import {setupJmdictFurigana} from '../annotate';
import {lemmaVsLiteral} from '../lemmaVsLiteral';

const jmdictFuriganaPromise = setupJmdictFurigana(process.env['JMDICT_FURIGANA']);

test('lemmaVsLiteral', async t => {
  const jmdictFurigana = await jmdictFuriganaPromise;

  t.equal(lemmaVsLiteral(
              {literal: '抑え', literalReading: 'おさえ', lemmaReading: 'おさえる', lemma: '押さえる', jmdictFurigana}),
          '抑える')
  t.equal(
      lemmaVsLiteral({literal: '刺さ', literalReading: 'ささ', lemmaReading: 'さす', lemma: '差す', jmdictFurigana}),
      '刺す')

  t.end();
})
