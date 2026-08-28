# Crit 5 reflection

**What was the breakthrough that moved the work forward?**

The breakthrough was realising that most bugs worth fixing after the first
playable build were legibility bugs, not rules bugs — and the clearest
evidence came from finishing a game, not from reading the code. After playing
a full 12-lot HOUSE game to the end, I noticed the four artists' final values
felt too uniform, that I couldn't tell at a glance which artist the current
lot belonged to, and that I couldn't read an NPC's claim timing in time to
react — none of which a passing test suite for an already-correct rules
engine had any way to catch. That one completed game drove both the
outcome-based market model and `buildPublicView()`, a function that
structurally omits hidden data rather than relying on me to remember to hide
it at every call site. Separately, a hands-on bug in AUCTIONEER mode
reinforced the same lesson from the other direction: hand-card buttons were
destroyed and rebuilt every animation frame, so a real click could land on a
button that no longer existed. I only found that by clicking through a game,
not by reading the render loop — though since the bug itself stopped that
mode from progressing, it's evidence for interaction testing, not a second
finished game.

**What did this work change about who I want to be as a software developer?**

I want to trust what a person does with the running thing over what I can
convince myself of by reading the source. A test suite told me the rules were
right; only playing the game, repeatedly, told me it wasn't understandable
yet. I want to keep building the habit of playing my own work like a stranger
would before I trust it.
