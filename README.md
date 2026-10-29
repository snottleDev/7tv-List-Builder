# 7TV Cast Builder

A list builder for [Crooked Dice's 7TV](https://crooked-dice.co.uk/) casts. Pick Stars, Co-Stars, Extras, Vehicles and Units and it tracks ratings, affiliation, genres and unit limits for you.

**Live:** https://snottledev.github.io/7tv-List-Builder/

## What it does

- **Ratings** with group prices (e.g. "2, or 5 for 3 models") applied across your whole cast.
- **Affiliation** (Core p.21): a heroic cast takes heroic or neutral models, a villainous cast takes villainous or neutral, and a neutral cast needs neutral Stars and Co-Stars but can take any Extras.
- **Genres** (Core p.25, 29): your cast's genres are all the genres of its Stars and Co-Stars put together. Extras and Vehicles outside those genres are allowed but flagged.
- **Units** (Core p.37): add a whole unit (leader plus member counts, capped at each unit's maximums), or add models one by one. The checks panel tells you when loose models could act as a unit.
- **Genre cards** (Core p.200): shows which of the chosen genre card's effects your cast can use.
- **Sharing**: "Copy share link" puts the whole cast in the URL. "Save" keeps casts in your browser.
- **Cards**: tap any profile to see the front of its card. The back shows the names of star qualities and special effects only, without their rules.

## Data

Profile data lives in `data/*.json`, one file per book, listed in `data/sources.json`. When books overlap, the earlier one in that list wins, so the Core Rulebook comes first.

Supplements can add genres in two ways:

```jsonc
"genreRules":   [{ "when": ["Fantasy"], "add": ["Sword & Sorcery"] }],  // anything with Fantasy also counts as Sword & Sorcery
"profileGenres": [{ "id": "core-knight", "genres": ["Epic"] }]          // per-profile additions
```

`core.json` was extracted from the 7TV Core Rulebook (Central Casting, pp.208–275). Where the summary tables (pp.30–36) and the cards disagree, the card is used:

- Sharpshooter and Witch are neutral on their cards but villainous in the table.
- Motorbike is Action / Adventure / Sci-Fi on its card but Adventure / Fantasy / Sci-Fi in the table.

This is an unofficial fan tool and is not affiliated with Crooked Dice. 7TV is © Crooked Dice Game Design Studio.
