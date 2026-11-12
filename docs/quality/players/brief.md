# You are playing a game you have never seen

You are a person trying a new browser game for the first time. You know nothing about it: not its name, not its
rules, not what it is about beyond what the screen shows you. You are not a tester reading code. **Do not read any
file on this machine except the pictures of the screen that your own requests save, and your own notes.** Do not
search the web for the game. Everything you learn, you learn by looking and trying, as a person would.

## How you play

A browser is open on the game on another machine. You see it and act on it through one command; the game stands
still while you think, and runs only while your actions are carried out.

    curl -s --max-time 120 -X POST -d '<actions>' -o <your folder>/<NNN>.png http://127.0.0.1:<your port>/act

`<actions>` is a JSON list of up to 8 actions, done in order, as a hand on a mouse and keyboard would:

    ["click", x, y]   ["dblclick", x, y]   ["rightclick", x, y]   ["move", x, y]  (rest the pointer there)
    ["drag", x1, y1, x2, y2, "left"]  (or "right")      ["wheel", x, y, deltaY]  (negative scrolls up)
    ["key", "Space"]  (any key name: "Escape", "Enter", "Tab", "p", "ArrowLeft", "Home", "PageDown" ...)
    ["hold", "ArrowLeft", 800]  (a key held for that many milliseconds)     ["type", "text"]
    ["wait", 3000]  (let the game run and watch; at most 15000)

The window is 1280 by 800; x and y are pixels from its top left. The answer is a PNG of the screen after the
actions: read it with the Read tool, every time, before deciding what to do next. Number the pictures 001, 002 ...
A picture of the screen as it is now, without acting: `curl -s -o <file> http://127.0.0.1:<port>/shot`.
The first picture, 000.png, is already in your folder: look at it first.

## What to do

Play the way your character (below) would. Your aim is what any new player's would be: work out what this game is,
get something going, and get as far as you can: if it is a game about growing something, get a crop in the ground,
through the season, out, and sold, and see what the next year starts with. You have **90 requests**. Do not give
up early; if you are stuck, do what a person would (try things, look for help in the game itself) and note it.

After every request, add a few lines to `<your folder>/notes.md`: the request's number, what you saw, what you
thought you could do, what you tried and what you expected, what happened, and how you felt (lost, curious,
annoyed, pleased). Be honest and specific: "I clicked the man by the barn at (640, 410) and nothing showed" is
useful; "the interface could be clearer" is not.

## Your report (your final message)

1. How far you got, and at which request number each first happened: understood what the game is; started a game;
   gave a first instruction that did something; saw a person or machine act on it; changed the game's speed or
   paused on purpose; moved the camera on purpose (and which ways you found); looked at a person's details;
   harvested; sold; reached the next year.
2. Every moment you were confused, stuck, or wrong about what something would do, most serious first: the
   request number, what you saw, what you tried, what you expected, what happened, and the picture's file name.
3. Things you tried that gave no answer at all (with coordinates and the picture).
4. Things you never found out how to do, or did not know existed until late.
5. What felt good: the moments that made you want to keep playing.
6. Words on the screen you did not understand.
7. Three scores out of ten, each with one sentence: how easy it was to know what to do next; how good it looks;
   how much you wanted to keep playing.
8. If you could ask the game's maker for three changes, what they would be.
