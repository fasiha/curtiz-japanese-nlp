# 2.0
We have 
```
### @ 僕の花の色 @ ぼくのはなのいろ
- @fill 僕[の]花
- @fill 花[の]色
- @ 僕 @ ぼく    @pos pronoun
- @ 花 @ はな    @pos noun-common-general
- @ 色 @ いろ    @pos noun-common-general
```
and
```
### @ このおはなしを話す @ このおはなしをはなす
- @fill を
- @ 話 @ はなし    @pos noun-common-verbal_suru @omit はなし
- @ 話す @ はなす    @pos verb-general
```
Header-`@` has same notation as bullet-`@`. Adverbs like `@omit` and `@pos` are introduced to allow for "flashcards" to be tested with fill-in-the-blank.

# 1.0.3
We have
```
### @ 僕の花の色 @ ぼくのはなのいろ
- @fill 僕[の]花
- @fill 花[の]色
- @flash 僕 @ ぼく
- @flash 花 @ はな
- @flash 色 @ いろ
```