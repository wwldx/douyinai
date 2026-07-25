---
name: fridge-dinner-visual-search
description: Turn a target-dish image or description, a fridge image or confirmed inventory, and explicit time or effort constraints into an executable meal decision. Use for Douyin Feed or camera visual-search scenarios where a user wants to know whether a dish can be cooked now, what is missing, how a simulated purchase changes the plan, or what single action to take when cooking gets stuck.
---

# Fridge Dinner Visual Search

Connect content discovery to a real cooking decision. Start from what the user sees and wants, verify what is actually available, then return the smallest useful action loop instead of stopping at object recognition.

## Required Inputs

Collect these inputs before planning:

- `target`: a target-dish image, selected video frame, user-cropped region from a paused frame, dish name, or spoken/text request.
- `inventory`: a fridge image or a user-confirmed list of available ingredients.
- `context`: meal slot, available cooking time, cooking level, energy level, preferences, and avoidances explicitly provided by the user.
- `itemStates` (optional): user-confirmed statuses such as opened, confirmed label date approaching, or unknown. Absence means no urgency claim.
- `uncertainItems` (optional): regions or packages that the fridge image did not identify reliably. Use them only to request a focused reshoot or user confirmation.
- `shoppingDecision` (optional): the specific items a user selected in the simulated shopping preview. These items may be added to a simulated inventory for replanning, but never treated as a real order.
- `rescueContext` (optional, after planning): current cooking image, confirmed dish name, original steps, user-confirmed current step, servings, issue category, symptom, spoken/text description, and an optional second-round follow-up.

If either visual input is unavailable, continue with text or confirmed inventory. Never invent a hidden ingredient, freshness state, allergy, or health constraint.

## Workflow

1. Understand the request.
   - Extract the dish or desired taste, intended meal time, time budget, and explicit constraints.
   - Ask one focused follow-up only when the target or a decision-critical constraint is genuinely ambiguous.

2. Understand the visuals.
   - When a paused frame contains several objects, let the user draw a rectangle and crop locally before recognition. Treat this as user-provided focus, not automatic detection or segmentation.
   - For the target dish, identify the likely dish name, core taste, key ingredients, tools, time, difficulty, and uncertainty. Always let the user confirm or edit the dish name.
   - For the fridge, separate visible ingredients, clear non-food objects, uncertain packages, and warnings. Never pass a clear non-food object into planning.
   - Keep visual confidence and evidence separate from facts confirmed by the user.

3. Confirm inventory and resolve one uncertainty at a time.
   - Let the user add, remove, or correct recognized ingredients before planning.
   - Require user confirmation for freshness, expiration, leftovers, raw meat, and obscured containers.
   - If one fridge region or package is uncertain, request a focused reshoot of only that region. Merge newly confirmed ingredients into the current inventory instead of restarting the journey.
   - Preserve unresolved items as unresolved. A failed reshoot must not delete the previous confirmed inventory.

4. Determine target-dish material coverage.
   - Compare the complete set of known defining ingredients with user-confirmed inventory. Do not ask the user to select one visual ingredient for a separate substitution step.
   - Return exactly one coverage state: `enough` when all known defining ingredients match, `missing` when specific defining ingredients are absent, or `unresolved` when the recipe or visual evidence is insufficient.
   - Never convert `unresolved` into “materials are enough” or a fabricated shopping list. Ask for the smallest useful confirmation or focused reshoot.

5. Prioritize user-confirmed item states when requested.
   - Use only explicit user confirmations; never infer expiry, freshness, or safety from the photo.
   - Separate this meal, the next two meals, and needs-confirmation items through deterministic rules.
   - Pass only confirmed priority ingredients into planning. Unknown items must not enter the priority list.
   - If status ranking is unavailable, continue the normal planning route without blocking the user.

6. Decide and call tools.
   - Compare required ingredients with confirmed inventory, time, skill, and explicit constraints.
   - Treat current confirmed facts as higher priority than any historical case.
   - Retrieval is optional and must never block planning. For the current competition configuration, keep retrieval off: on the same 19-case terra planning set, `off` and `positive` both passed 19/19 while `contrast` passed 18/19, so no quality gain was established.
   - Use search, recognition, comparison, shopping, or transaction tools only when they directly help the current decision. Label simulated cards and data as demonstrations.

7. Generate an actionable result.
   - Choose exactly one primary action: cook now, cook a simplified version, shop then cook, prepare for tomorrow, or use a ready-meal fallback.
   - Return concise steps, confirmed available ingredients, critical missing ingredients, items to confirm at home, optional upgrades, substitutions, time fit, skill fit, and safety warnings.
   - Show commerce only for a specific missing item or tool gap. Do not turn the dish name itself, an accompanying staple, or an optional premixed seasoning packet into a mandatory purchase when a viable basic-seasoning version exists.

8. Replan after a simulated purchase when requested.
   - Add only the items explicitly selected by the user to a clearly labeled simulated inventory.
   - Call planning again with the target dish, user constraints, and simulated inventory. Do not merely change the shopping-card copy or claim a real order occurred.
   - Show which items were added and how the coverage state, primary action, or steps changed.

9. Judge satisfaction.
   - Check whether the result answers what the user wanted, fits the confirmed time and ability, and avoids unsupported claims.
   - Accept explicit feedback such as `accept_meal`, `too_complex`, `too_many_missing`, `low_cleanup`, or `lighter_taste`, and turn negative feedback into a concrete constraint for the next plan.
   - If not satisfied, ask for missing information or switch to a safer route.

10. Rescue the current cooking step when requested.
    - Separate issues into visible state, user-reported taste, seasoning adjustment, or unknown next step.
    - Use the image only for visible viscosity, shape, separation, scorch marks, color, liquid level, and approximate stage. Taste and smell must come from the user.
    - In round one, return one immediate action and a concrete observation checkpoint. Ask for confirmation instead of guessing when evidence is insufficient.
    - Allow at most one second-round reshoot. Compare the new image with the prior checkpoint; if the user reports no improvement, do not repeat the previous action. Change one variable or stop and ask for new facts.
    - Stop after round two. Never create an unbounded visual trial-and-error loop, infer exact grams, or claim image-based safe doneness.

11. Create an optional life-log draft after cooking.
    - Accept a finished-dish image and a dish name confirmed by the user.
    - Generate editable title options, cover text, a short voiceover, future shot suggestions, tags, and a confirmation warning.
    - Describe only visible evidence and user-confirmed context. Never invent taste, nutrition, cooking time, preparation footage, publication status, views, or feedback.
    - Do not publish automatically. The user must review and edit the draft before using it elsewhere.

## Output Contract

Return structured JSON matching `references/contracts.md`. Keep user-facing language direct and non-technical. Do not expose model names, providers, confidence scores, raw JSON, internal prompts, cache paths, or administrator controls in the consumer experience.

## Competition Demo Observability

- Give every Agent request a request ID and preserve route, status, source, model, stage timing, token usage, and the allowlisted structured input/output needed for controlled competition debugging.
- Keep the internal operations page outside the consumer navigation and protect its data API with an administrator token.
- A run-record write failure must be fail-open and must not block recognition, planning, replanning, or rescue.
- Never store API keys, administrator tokens, authorization headers, raw photos, or raw audio in run records.
- If a fixed demo cache is used, label its source internally and show a truthful stable-plan message to the user. Never present it as a real-time model result.

## Safety Rules

- Never determine whether food is safe, fresh, expired, or fully cooked from an image alone.
- Never infer allergies, diseases, or medical dietary rules.
- Warn new cooks away from deep frying, complex knife work, and unsafe raw-meat handling.
- Do not claim a complete target dish when a defining ingredient is missing.
- Do not use meat color, “no pink,” clear juices, or photo appearance as proof of doneness or safety.
- Preserve a text-input path and a deterministic cached demo path when voice, network, or model services fail.

## Quality Check

Before returning, verify:

- the trigger is a credible Feed or camera scenario;
- any rectangle crop is described as user-provided focus rather than automatic localization;
- image, video, or speech materially reduces expression cost;
- the plan uses confirmed visual evidence rather than generic chat;
- material coverage is explicitly `enough`, `missing`, or `unresolved`;
- an uncertain package leads to confirmation or a focused reshoot, not a guessed ingredient;
- a simulated purchase actually triggers replanning and is never described as a real order;
- the result reaches an action and a satisfaction check;
- any Douyin commerce or publishing entry is tied to the user journey;
- uncertainty and simulated capabilities are clearly labeled;
- historical cases are labeled by source and never presented as current facts or real-user evidence;
- a life-log draft is visibly editable, fact-bounded, and never presented as already published;
- a cooking rescue separates visible evidence from user-reported taste and stops after at most two rounds.
