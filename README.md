# curtiz-japanese-nlp — WIP ☣️☢️🧪🧫🧬⚗️☢️☣️

> N.B. All references to “Curtiz” are to version 2 of the Curtiz format (using `@` symbols), and not version 1 (using `◊` lozenges).

## Curtiz version 2 soft-specification
The Curtiz Markdown format for defining Japanese flashcards uses Markdown headers, e.g., the following header:

### @ 私 @ わたし
which is `### @ 私 @ わたし` in the original Markdown, as flashcards. That is, a flashcard-header has `#` symbols, whitespace, `@` symbol, whitespace, and then arbitrary text, separated by one or more ` @ ` separators. (`@` was chosen because it is easy to type on mobile and real keyboards, in Japanese and English.) The first text is treated as the prompt: that’s what the flashcard app will show. Text after the prompt are taken as acceptable answers.

So the following header accepts three answers for the same prompt:

### @ 私 @ わたし @ わたくし @ あたし
Next, any bullets immediately following the at-header that are themselves followed by `@` are treated as Curtiz-specific metadata.

Example:

### @ 僕の花の色 @ ぼくのはなのいろ
- @fill 僕[の]花
- @fill 花[の]色
- @ 僕 @ ぼく    @pos pronoun
- @ 花 @ はな    @pos noun-common-general
- @ 色 @ いろ    @pos noun-common-general

This example demonstrates both sub-quizzes that are currently supported:
- `@fill` allows for a fill-in-the-blank (perhaps where the prompt is shown, minus the text to be filled in), and
- `@` indicates a flashcard just like the `@`-headers: `prompt @ response`. These are amenable to plain flashcards on their own as well as fill-in-the-blank in the sentence. If the sub-prompt (in this bullet) cannot be found or uniquely determined in the header's prompt, then an `@omit` adverb can be optionally used to indicate the portion of the header prompt to be hidden. The optional `@pos` adverb contains the part-of-speech (as determined by MeCab), and facilitates disambiguiation of flashcards.

Both these optional adverbs are demonstrated below.

### @ このおはなしを話す @ このおはなしをはなす
- @fill を
- @ 話 @ はなし    @pos noun-common-verbal_suru @omit はなし
- @ 話す @ はなす    @pos verb-general

**Translations** are also available, on a per-block or per-bullet level. For example:

### @ 私が来た @ わたしがきた
- @translation @en I am here. @fr Je suis ici.
- @ 私 @ わたし @ わたくし @ あたし @t-en I @t-fr je @t-de Ich

When the `@translation` adverb is on its own bullet, it applies to the sentence. The language of the translation must be specified (in the above case, for the bullet-translation, English and French). Because of the format, the translation shouldn’t use `@`-symbols.

The short-hand adverb for translation can also be placed on the header line, and it can be used for sub-quizzes. The short-hand combines the language into the adverb, i.e., `@t-en` for the English translation, `@t-de` for the German, etc. The language markers `en`, `fr`, etc., are currently informal and not enforced.

*N.B.* Translations aren’t created by this library, but since this is serving as a soft-spec for the Curtiz format, I describe them here.

## This module's features

This module uses [MeCab](https://github.com/taku910/mecab/) with the [UniDic](https://osdn.net/projects/unidic/) dictionary, and [J.DepP](http://www.tkl.iis.u-tokyo.ac.jp/~ynaga/jdepp/) bunsetsu chunker to add readings, `@fill`-in-the-blank quizzes, and `@` flashcards into a Curtiz Markdown file.

> Make sure you have these three applications installed before attempting to use this!

It will add a reading to the header if none exists.

It will add sub-quizzes (`@fill` and `@`) if there is a special bullet under the header: `- @pleaseParse`.

## Usage
This package provides:
1. a command-line utility that will consume an input file or standard input, and spit out the Markdown file annotated with readings and sub-quizzes; and
2. a JavaScript library to do this programmatically.

### Command-line utility
The command-line utility can be invoked on a file or can consume standard input. Make sure you have [Node.js](https://nodejs.org) installed, then in your terminal (Terminal.app in macOS, Command Prompt in Windows, xterm in Linux, etc.), run either of the following:

```
$ npx curtiz-japanese-nlp README.md
```
and replace `README.md` with the path to your Markdown file, or
```
$ cat README.md | npx curtiz-japanese-nlp
```

### Library API
Install this package into your JavaScript/TypeScript package via
```
$ npm install curtiz-japanese-nlp
```
Then in your JavaScript code, you may:
```js
const curtiz = require('curtiz-japanese-nlp'); 
```
In TypeScript or with ES5 modules, you may:
```js
import * as curtiz from 'curtiz-japanese-nlp';
```

The following functions will then be available under the `curtiz` namespace.

#### `async function parseHeaderBlock(block: string[]): Promise<string[]>`
A `block` is an array of strings, one line per element, with the first line assumed to contain a Markdown header block (something starting with one or more `#` hash symbols).

`parseHeaderBlock` returns a [promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise) of an array of strings, which will contain annotated Markdown.

This is the core function provided by this library.

The remaining functions below are helper utility functions.

#### `function splitAtHeaders(text: string): string[][]`
This is intended to split the contents of a file (a single string `text`) into an array of blocks (each block being an array of strings itself, each string being a line of Markdown).

#### `async function parseAllHeaderBlocks(blocks: string[][], concurrentLimit: number = 8)`
This is intended to annotate an array of blocks (`blocks`), each block being an array of strings and each string being a line of Markdown.

The `concurrentLimit` argument allows you to limit the number of concurrent system calls to `mecab` and `jdepp` that are being made.

A promise for an array of blocks is returned.

You can use both these helper functions along with the primary function as follows, assuming you are inside an `async` function:
```js
let annotated = await curtiz.parseAllHeaderBlocks(curtiz.splitAtHeaders(fs.readFileSync('README.md', 'utf8')));
console.log(annotated.map(s => s.join('\n')).join('\n'));
```
The first line slurps the contents of `README.md` and splits it into blocks at Markdown header boundaries, then annotates them all.

The second line logs the entire annotated Markdown.

## Useful helpers
### Awk
If you have a file containing just lines of text and you want to parse them all, this [Awk](https://developer.ibm.com/tutorials/l-awk1/) script can pre-process them to a format amenable for this tool:
```shell
cat text | awk '{if (NF>0) {print "## @ " $0 " @ \n- @pleaseParse"} else {print $0}}' | node index.js
```
