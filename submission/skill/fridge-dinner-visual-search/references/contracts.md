# Contracts

## Optional User-Cropped Target Region

When a paused frame contains multiple objects, the client may crop a rectangle selected by the user and submit the cropped image as `target`. The rectangle is a user interaction, not a model-produced bounding box. Preserve the original image so the user can restore it, and always let the user confirm or edit the inferred dish name.

This focus interaction does not ask the user to select one ingredient for a separate substitution card. The current consumer flow compares the complete target dish with confirmed inventory.

## Fridge Vision Output

```json
{
  "items": [
    {
      "name": "string",
      "category": "蔬菜 | 蛋奶 | 主食 | 蛋白质 | 速食 | 饮料 | 调味 | 其他",
      "quantityEstimate": "string",
      "confidence": 0.0,
      "state": "visible state, not a freshness guarantee",
      "notes": "visual location or evidence"
    }
  ],
  "uncertainItems": [
    { "description": "string", "reason": "string" }
  ],
  "warnings": ["string"]
}
```

Before planning, remove clear non-food objects and require the user to confirm the retained `items`. Never convert an `uncertainItems` entry into an ingredient merely because its package shape looks familiar.

## Focused Fridge Reshoot and Merge

A focused reshoot is a client-side state transition, not a second full journey:

```json
{
  "target": {
    "description": "white bag in the lower crisper",
    "reason": "contents and label are not visible"
  },
  "instruction": "Reshoot only the lower crisper and keep the package label in frame.",
  "incomingVision": {
    "items": [{ "name": "green pepper" }],
    "uncertainItems": [],
    "warnings": []
  },
  "mergeResult": {
    "addedNames": ["green pepper"],
    "resolvedTarget": true
  }
}
```

Merge rules:

- sanitize the incoming vision result before merging;
- merge newly confirmed ingredients by normalized name;
- preserve all previously confirmed inventory;
- remove the targeted uncertainty only when the focused reshoot confirms a new ingredient;
- preserve other unresolved items;
- if recognition fails or confirms nothing, keep the prior inventory and uncertainty state unchanged.

## Optional Confirmed Item State Input

Status ranking is optional and deterministic. Only user-confirmed values may be supplied:

```json
{
  "itemStates": [
    { "name": "tofu", "status": "opened" },
    { "name": "milk", "status": "label_soon" },
    { "name": "leftover container", "status": "unknown" }
  ]
}
```

Supported statuses are `no_reminder`, `recently_bought`, `opened`, `label_soon`, `opened_label_soon`, and `unknown`. The output separates `tonightPriority` (consumer copy: this meal), `soonPriority`, `needsConfirmation`, and `plannerPriorities`. These groups are priorities, not freshness, expiry, or safe-to-eat conclusions.

## Optional Retrieved Case Input

Retrieval is optional and must never block planning. Each case passed to the planner uses this compact form:

```json
{
  "caseId": "case-001",
  "similarity": 0.82,
  "role": "positive | negative",
  "sharedEvidence": ["same time budget", "same critical missing ingredient"],
  "decision": "shop_then_cook",
  "evidence": ["critical protein is missing"],
  "lesson": "Do not claim the complete dish when its defining ingredient is absent."
}
```

Current confirmed facts always override historical cases. A case source must be explicit and must not be described as real-user data unless it actually came from explicit feedback. Retrieval remains off in the current competition build because the full 19-case terra comparison produced `off=19/19`, `positive=19/19`, and `contrast=18/19`.

## Consumer-Normalized Target Dish Planning Output

The strict model response is normalized by deterministic client checks before display. `coverageStatus` and `needsConfirmationItems` are consumer-side extensions derived from known recipe requirements, confirmed inventory, and unresolved visual evidence.

```json
{
  "targetDish": {
    "name": "string",
    "intentTime": "tonight | tomorrow | this_week | unknown",
    "coreTaste": "string",
    "estimatedTime": "string",
    "difficulty": "string"
  },
  "verdict": {
    "title": "string",
    "summary": "string",
    "primaryAction": "cook_now | cook_simplified | shop_then_cook | prep_for_tomorrow | delivery_or_ready_meal"
  },
  "inventoryMatch": {
    "availableItems": ["confirmed inventory item"],
    "missingCritical": ["specific defining ingredient"],
    "missingOptional": ["optional ingredient"],
    "substitutions": [
      { "from": "string", "to": "string", "result": "explicit technique or taste change" }
    ],
    "coverageStatus": "enough | missing | unresolved",
    "needsConfirmationItems": ["uncertain package or recipe requirement"]
  },
  "shoppingPlan": {
    "mustBuy": [
      { "item": "specific defining ingredient", "reason": "why the complete dish needs it" }
    ],
    "confirmAtHome": ["basic seasoning to check before buying"],
    "optionalUpgrades": ["non-critical upgrade"]
  },
  "executionPlan": {
    "recommendedVersion": "string",
    "steps": ["3-6 executable steps"],
    "difficultyWarnings": ["at least one warning or boundary"],
    "prepForTomorrow": "string"
  },
  "userFit": {
    "skillNote": "string",
    "timeNote": "string",
    "profileNotes": ["explicit evidence used for this result"]
  },
  "commerceCards": [
    {
      "type": "douyin_mall | local_life | cookware | none",
      "title": "string",
      "item": "a specific missing item",
      "reason": "string",
      "cta": "string"
    }
  ],
  "talkTrack": "one concise spoken summary"
}
```

Coverage rules:

- `enough`: every known defining ingredient has a match in user-confirmed inventory;
- `missing`: one or more specific defining ingredients are absent;
- `unresolved`: the target recipe requirements or visual evidence are insufficient to decide;
- only `missing` may create a mandatory shopping list;
- accompanying staples and optional premixed seasoning packets are not defining ingredients when a viable basic-seasoning version exists.

## Optional Simulated Purchase and Replanning

The user may choose specific `mustBuy` items for a preview. The request carries an explicit simulation marker:

```json
{
  "targetDish": {
    "text": "I want to cook braised chicken tonight",
    "shoppingDecision": {
      "mode": "simulate_after_purchase",
      "acceptedItems": ["chicken thigh", "shiitake mushroom"]
    }
  },
  "inventory": [
    { "name": "potato", "state": "user confirmed" },
    { "name": "chicken thigh", "state": "user selected simulated purchase" },
    { "name": "shiitake mushroom", "state": "user selected simulated purchase" }
  ]
}
```

Call planning again with the simulated inventory. Wrap the displayed result with:

```json
{
  "shoppingPreview": {
    "acceptedItems": ["chicken thigh", "shiitake mushroom"],
    "simulated": true
  },
  "plan": "new normalized target-dish plan"
}
```

Never describe the preview as a real order, payment, delivery, or inventory fact outside the current simulation.

## Satisfaction Decision

Mark the result unsatisfied and ask a follow-up when any condition holds:

- the target dish is unknown and no reliable image analysis is available;
- a defining ingredient is obscured or unconfirmed;
- available time cannot support the proposed cooking method;
- the plan conflicts with an explicit avoidance or cooking-skill boundary;
- food safety depends on freshness, expiration, thawing, or doneness that the user has not confirmed.

Supported explicit feedback events:

- `accept_meal`
- `too_complex`
- `too_many_missing`
- `low_cleanup`
- `lighter_taste`

## Optional Dish Rescue Input and Output

Use this branch only after a plan exists and the user is already cooking. The issue category is one of `state`, `taste`, `seasoning`, or `next_step`. Taste and smell are user-reported facts, never image predictions.

```json
{
  "input": {
    "currentImage": "image data or camera input",
    "category": "state | taste | seasoning | next_step",
    "symptom": "user-selected issue",
    "description": "spoken or typed observation",
    "dishContext": {
      "dishName": "confirmed dish name",
      "servings": "confirmed servings",
      "currentStep": "user-confirmed or unknown",
      "steps": ["original recipe steps"]
    },
    "followUp": {
      "round": 2,
      "outcome": "recheck | not_improved",
      "previousHeadline": "round-one conclusion",
      "previousAction": "round-one action",
      "previousCheck": "round-one observation checkpoint"
    }
  },
  "output": {
    "headline": "one immediate direction",
    "visualObservations": ["visible evidence only"],
    "assessment": {
      "category": "state | taste | seasoning | next_step",
      "likelyIssue": "bounded assessment",
      "confidence": "low | medium | high",
      "needsConfirmation": true
    },
    "actions": [
      {
        "title": "action title",
        "instruction": "one conservative action",
        "check": "what the user should observe next"
      }
    ],
    "nextStep": "single next step",
    "askUser": "focused follow-up or empty string",
    "boundaryReminder": "what the image cannot prove"
  }
}
```

Round rules:

- round one returns one primary action and one observation checkpoint;
- only one round-two reshoot is allowed;
- round two compares the new image with `previousCheck`;
- `not_improved` must not repeat `previousAction`;
- after round two, stop continuous trial and error and ask the user for new facts when the issue remains unresolved;
- never infer taste, smell, precise dosage, expiry, freshness, or meat/egg doneness from the image.

## Optional Life Log Draft Output

This output is only for a user-reviewed draft after a finished-dish image is provided. Suggested shots describe future shots to capture, not footage that already exists.

```json
{
  "dishName": "string",
  "confidence": 0.0,
  "visualSummary": "visible evidence only",
  "titleOptions": ["1-3 editable titles"],
  "coverText": "short editable cover copy",
  "voiceoverDraft": "short editable narration",
  "suggestedShots": [
    { "shot": "future shot to capture", "onScreenText": "suggested overlay" }
  ],
  "tags": ["#tag"],
  "warnings": ["confirm facts and edit before publishing"]
}
```

The draft must not claim taste, nutrition, actual cooking duration, existing preparation footage, publication, views, likes, or user feedback unless the user explicitly provides those facts.

## Competition Agent Run Record

The internal operations page may read an allowlisted run record shaped like:

```json
{
  "schemaVersion": 1,
  "requestId": "client-and-server-shared diagnostic id",
  "sessionId": "anonymous session id or null",
  "appVersion": "release-version",
  "route": "/api/plan-target-dish",
  "method": "POST",
  "status": 200,
  "outcome": "success",
  "source": "model",
  "agent": "targetDishPlannerAgent",
  "model": "gpt-5.6-terra",
  "durationMs": 18330,
  "trace": {},
  "usage": {},
  "inputSummary": {},
  "outputSummary": {},
  "captureMode": "structured | metadata-only",
  "content": "optional allowlisted structured input/output"
}
```

`source` must use the truthful route-specific value, for example `model`, `model-timeout-cache`, `model-error-cache`, `structured-local-retrieval`, `confirmed-inventory-rules`, `model-timeout`, or `request-error`. Never include raw image data, raw audio, API keys, administrator tokens, authorization headers, or other credentials. Run-record storage is fail-open: a write failure must not block the consumer journey.
