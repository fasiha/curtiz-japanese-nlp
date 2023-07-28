# curtiz-japanese-nlp — WIP ☣️☢️🧪🧫🧬⚗️☢️☣️

This is a TypeScript/JavaScript library for Node.js (not browser) that weaves together a *Japanese language learner*-oriented Japanese NLP (natural language processing) pipeline using the following technologies:
- [MeCab](https://github.com/taku910/mecab), the Japanese morphological parser and part-of-speech tagger;
- [J.DepP](https://www.tkl.iis.u-tokyo.ac.jp/~ynaga/jdepp/), the bunsetsu chunker and dependency parser that consumes MeCab output;
- [JMdict](https://www.edrdg.org/jmdict/j_jmdict.html), the free open-source Japanese-to-many-languages dictionary;
- [JMdict-Simplified](https://github.com/fasiha/jmdict-simplified), JMdict in JSON;
- [JMdict-Furigana](https://github.com/Doublevil/JmdictFurigana), mapping JMdict entries to accurate furigana (like <ruby>食<rt>た</rt></ruby>べ<ruby>物<rt>もの</rt></ruby>);
- [Kanjidic2](http://www.edrdg.org/wiki/index.php/KANJIDIC_Project), a database of kanji (漢字, i.e., Chinese characters) and their components, affiliated with JMdict;
- [Kamiya-Codec](https://github.com/fasiha/kamiya-codec), which conjugates and deconjugates Japanese verbs and adjectives based on Taeko Kamiya's textbooks;
- in the same vein, this library wraps Naoko Chino's *All about particles: a handbook of Japanese function words*'s taxonomy of particles.

In practical terms, this library will take a sentence like this:

> **へましたらリーダーに切られるだけ**

and give you the following:
- furigana like へましたらリーダーに<ruby>切<rt>き</rt></ruby>られるだけ;
- morpheme and bunsetsu boundaries (note that the input didn't contain any spaces, so these are inferred):
  - へま し たら │ リーダー に │ 切ら れる だけ (spaces are morpheme boundaries, `|` bunsetsu boundaryes)
- as well as bunsetsu dependencies, allowing you to reconstruct something like this:
```
へましたら━━┓
リーダーに━━┫
　　切られるだけ
```
- a list of conjugated verbs and adjectives, in this case:
  - したら = <ruby>為<rt>す</rt></ruby>る + `Tara` form,
  - 切られる = <ruby>切<rt>き</rt></ruby>る + `ReruRareru` + `Dictionary` form, and
  - (much less usefully), れる = れる + `Dictionary` form;
- a list of particles,
  - に, and
  - だけ, both accompanied by all possible usage patterns in Naoko Chino's book,
- a long list of dictionary "hits" (like search engine "hits"), broken down by the starting morpheme and ending morpheme, so:
  - へま
    - 「へま」 blunder/bungle/gaffe
    - 「へまをやる」 to commit a blunder
  - したら
    - 下 「した」 below/down/under/younger (e.g. daughter); bottom; beneath/underneath; etc.
    - 舌 「した」 tongue; tongue-like object/clapper (of a bell)/talon (of a lock)
    - 簧 「した」 reed (of a musical instrument)
    - etc.
  - し
    - 為る 「する」 to do/to carry out/to perform; to cause to become/to make (into)/to turn (into); to serve as/to act as/to work as; etc.
    - 成る・為る 「なる」 to become/to get/to grow/to turn/to reach/to attain; to result in/to turn out/to end up/to prove (to be); to consist of/to be composed of/to be made up of; etc.
    - 刷る・摺る 「する」 to print; to color or pattern fabric using a wooden mold
    - 掏る 「する・スる」 to pickpocket/to steal
    - etc.
  - たら
    - 多 「た」 multi-
    - 誰 「だれ・だあれ・たれ・た」 who
    - 田 「た」 rice field
    - 他 「た」 other (esp. people and abstract matters)
    - etc.
  - リーダー
    - 「リーダー・リーダ」 leader; reader/reading book; reader (i.e. someone who reads); etc.
    - リーダー格 「リーダーかく」 leader/leading figure
    - リーダー制 「リーダーせい」 leadership organization/leadership organisation
    - etc.
  - に切ら
    - 煮切る 「にきる」 to boil down sake, mirin, etc. to reduce the alcohol content
  - に
    - 「に」 at (place, time)/in/on/during; to (direction, state)/toward/into; for (purpose); etc.
    - 荷 「に」 load/baggage/cargo/freight/goods; burden/responsibility 
    - 似 「に」 looking like (someone)/taking after (either of one's parents)
    - etc.
  - 切ら
  - れる
  - だけ
- kanji and their breakdowns per Kanjidic2, in this case just that 切 is pronounced 「セツ・サイ・き.る・-き.る・き.り・-き.り・-ぎ.り・き.れる・-き.れる・き.れ・-き.れ・-ぎ.れ」, meaning "cut; cutoff; be sharp", used in names きつ・きり・ぎり, and is made up of
  - 七 「シチ・なな・なな.つ・なの」 "seven" (names: し・しっ・な・ひち)
  - 刀 「トウ・かたな・そり」 "sword; saber; knife" (names: き・ち・と・わき)

All of the above information is returned as a JavaScript object or in JSON (if accessed by the built-in web server).

As you can tell from the above, Curtiz gives you a *lot* of information that *might* be related to your text but might not be. There are two reasons for this:
1. Japanese is a highly homophonous language when it comes to sounds, and its writing system allows for considerable ambiguity. Nonetheless, you can imagine a better version of Curtiz that is much smarter about discarding useless information: for example, all the dictionary entries for `たら` aren't sensible because they're either for `た`, which brings us to
2. Curtiz would much rather provide you with (a lot of) useless information than risk omitting data that is useful to the *learner*.

## Setup
First, make sure you have [Git](https://git-scm.com) and [Node.js](https://nodejs.org) installed (any recent version is fine).

Then install MeCab, Unidic, and J.DepP. MeCab and Unidic are easy to install on macOS via [Homebrew](https://brew.sh/), but [J.DepP](https://www.tkl.iis.u-tokyo.ac.jp/~ynaga/jdepp/) is a "normal" old-school Unix C++ build (`./configure --with-mecab-dict=UNI && make`…; `./configure --help` is useful and explains what `with-mecab-dict` is doing) and if you've never built such a project before, do your best to follow the instructions and open an issue if you need help.

Then, download the followed required files (TODO: automatically download these!):
1. `jmdict-eng-*.json` from [JMdict-Simplified](https://github.com/scriptin/jmdict-simplified)
2. `JmdictFurigana.json` from [JMdict-Furigana](https://github.com/Doublevil/JmdictFurigana)
3. `kanjidic2.xml.gz` from [Kanjidic](http://www.edrdg.org/wiki/index.php/KANJIDIC_Project)

### You already have a Node.js project
If you already have your own Node.js project, install Curtiz as a dependency:
```
npm i https://github.com/fasiha/curtiz-japanese-nlp
```
Drop the three dependency files above into your project and skip to the ["API"](#api) section below.

### If you aren't a Node.js user
If you plan to interact with Curtiz just through a JSON web server, the easiest thing to do is to just set up a mini-Node.js package that'll spin up the server:
1. `mkdir CURTIZ` to make a new directory, name it `CURTIZ` but please change this
2. `cd CURTIZ` to enter the new directory
3. Put the three dependency files into this directory
4. `npm init -y` will initialize an empty Node.js package
5. `npm i https://github.com/fasiha/curtiz-japanese-nlp` will install Curtiz as a dependency
6. `npx curtiz-annotate-server` will start the webserver on http://127.0.0.1:8133 (you can pick another port, for example 8888, via `PORT=8888 npx curtiz-annotate-server`)
7. (N.B. If you have multiple copies/versions of `jmdict-simplified`, you can specify the one to use with an environment variable `JMDICT_SIMPLIFIED_JSON=./jmdict-eng-3.5.0.json npx curtiz-annotate-server`. Environment variables stack so you can provide both this and the port: `PORT=8888 JMDICT_SIMPLIFIED_JSON=./jmdict-eng-3.5.0.json npx curtiz-annotate-server`)

The first time you run this, it will take several seconds while it builds a Leveldb cache of JMdict.

Now you're ready to hit a REST endpoint. The following will ask `curl` to POST a Japanese sentence in a specific JSON structure to the appropriate endpoint, and save the result to `curtiz.json`:
```
curl --data '{"sentence": "へましたらリーダーに切られるだけ"}' \
  -X POST \
  -H "Content-Type: application/json" \
  -o curtiz.json \
  http://127.0.0.1:8133/api/v1/sentence
```

As described below, I need to formally describe the structure of this data. In the meantime, please check the [tests](./tests) and the [TypeScript interfaces](./interfaces.ts), especially the `v1ResSentenceAnalyzed` type, to see what data is where.

## API
In your Node project, create a new file (either TypeScript `demo.ts` or ESM `demo.mjs`). Put the following code into it to import and exercise the package:
```ts
// TypeScript or ESM (e.g., `demo.ts` or `demo.mjs`)
import * as curtiz from 'curtiz-japanese-nlp';
curtiz.handleSentence('それは昨日のことちゃった').then(result => console.dir(result, {depth: null}));
```
> (If you're using TypeScript, (1) make sure you compile this, e.g., `npx tsc -p .` and run the resulting `demo.js`. Also (2), you may need your `tsconfig.json` to `"target": "es2019"` or later.)
>
> Make sure you have the three dependency files above in your project head (JMdict-Furigana, JMdict-Simplified, and Kanjidic). The first time you run this, Curtiz will spend several seconds building a Leveldb cache for JMdict and will log its progress.
>
> Note that because Leveldb is not multithreaded, you can't run this if you're also running the web server above 😒. If you see an error like `Error [OpenError]: IO error: lock jmdict-simplified/LOCK: Resource temporarily unavailable`, this is Leveldb complaining that some other process has a lock on the database. I should fix this…

This will print out a *lot* of text, but it will show you everything that Curtiz has done with the sentence.

More details forthcoming but please check the [tests](./tests) and the [TypeScript interfaces](./interfaces.ts), especially the `v1ResSentenceAnalyzed` type, to see what data is where.

## Useful helpers

### MecabUnidic
Often it can be very helpful to inspect the output of MeCab-Unidic to understand what this module is doing. This library incldues a thin wrapper that translates Unidic parts-of-speech, conjugations, inflections, etc., into English (via tables [1](https://gist.github.com/masayu-a/e3eee0637c07d4019ec9), [2](https://gist.github.com/masayu-a/3e11168f9330e2d83a68), [3](https://gist.github.com/masayu-a/b3ce862336e47736e84f), published by GitHub user @masayu-a citing the work of Dr Irena Srdanovic), and exposes a command-line interface: simply pipe multi-line input into `mecabUnidic.js`, for example `cat text | ./mecabUnidic.js` or equivalently `cat text | node mecabUnidic.js`. A simple example on the command-line:
```shell
cat <<EOF | ./mecabUnidic.js
「ほら、
あれが小学校だよ。」
EOF
```
This will print out the following Markdown table:

| Literal | Pron.    | Lemma Read. | Lemma | PoS                               | Infl. Type   | Infl.              |
| ------- | -------- | ----------- | ----- | --------------------------------- | ------------ | ------------------ |
| ほら    | ホラ     | ホラ        | ほら  | interjection-general              |              |                    |
| 、      |          |             | 、    | supplementary_symbol-comma        |              |                    |
|         |          |             |       |                                   |              |                    |
| あれ    | アレ     | アレ        | 彼れ  | pronoun                           |              |                    |
| が      | ガ       | ガ          | が    | particle-case                     |              |                    |
| 小      | ショー   | ショウ      | 小    | prefix                            |              |                    |
| 学校    | ガッコー | ガッコウ    | 学校  | noun-common-general               |              |                    |
| だ      | ダ       | ダ          | だ    | auxiliary_verb                    | auxiliary-da | conclusive-general |
| よ      | ヨ       | ヨ          | よ    | particle-phrase_final             |              |                    |
| 。      |          |             | 。    | supplementary_symbol-period       |              |                    |
| 」      |          |             | 」    | supplementary_symbol-bracket_open |              |                    |
|         |          |             |       |                                   |              |                    |
