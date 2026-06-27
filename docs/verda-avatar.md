# HabtamuAI Comparison Advisor

## Purpose

HabtamuAI is the AI advisor shown in the two-area comparison flow. It does not
score or decide. The backend scoring engine returns comparison data, and HabtamuAI
renders the explanation, tradeoffs, risk flags, and field-validation prompts in
a polished speech cloud.

## Source Asset

The visual avatar is based on the portable SVG/CSS widget in:

```text
verda-avatar.html
```

Because the production frontend is a React/TanStack app and the HTML file is at
repo root, the relevant SVG and state CSS were extracted into:

```text
ai4goodhackathonmfmtree/src/components/mfm/AIComparisonAdvisor.tsx
```

This avoids iframe sizing/loading issues and keeps the avatar available in the
static S3/CloudFront build. If the asset is later moved into `public/`, an iframe
wrapper can be added, but the React component should remain as the fallback.

## States

The component supports these states:

- `idle`: waiting for two areas
- `thinking`: analysing area tradeoffs
- `comparing`: comparing carbon, cost, risk, and readiness
- `speaking`: showing the generated explanation
- `warning`: highlighting risk flags
- `recommendation`: showing the recommended validation target

The compare tab transitions through these states when both selected areas have
backend `areaId` values. If backend comparison fails, HabtamuAI shows a deterministic
local fallback comparison.

## Typewriter Speech

The main speech cloud uses:

```text
ai4goodhackathonmfmtree/src/components/mfm/TypewriterText.tsx
```

`TypewriterText` reveals the narrative character by character, resets when the
text changes, calls `onComplete`, supports click/skip to reveal the full text,
and respects `prefers-reduced-motion`.

The visible HabtamuAI card is intentionally narrative-first. Structured values are
kept behind the collapsible `Show evidence details` control so the main
experience feels like HabtamuAI speaking, not a raw JSON field renderer.

## Response Mapping

`POST /compare-areas` returns a narrative plus structured fields:

- `recommendedAreaId`
- `recommendedAreaName`
- `confidence`
- `narrativeSummary`
- `keyTradeoffs`
- `riskFlags`
- `llmExplanation`
- `fieldValidationQuestions`
- `decisionBasis`

The frontend chooses the main speech text in this order:

1. `narrativeSummary`
2. `llmExplanation`
3. frontend-generated fallback paragraph from structured fields

The frontend maps the rest of the response as follows:

- recommendation: explicit `recommendedAreaId`, otherwise higher priority score
- key tradeoffs: explicit `keyTradeoffs`, otherwise derived from score deltas
- risk flags: explicit `riskFlags`, backend score flags, or cell risk flags
- confidence: explicit value, otherwise derived from score gap
- field questions: explicit questions, otherwise default onsite-validation checks

## Read-Aloud Voice

The speech cloud includes a `Read aloud` button. The frontend first calls:

```text
POST /voice
```

The backend Lambda reads the ElevenLabs API key from AWS Secrets Manager and
generates MP3 audio with the configured `ELEVENLABS_VOICE_NAME`, currently
`Eric`. The API key is never bundled into the frontend.

If `/voice` fails or the backend is unavailable, the component falls back to
browser `speechSynthesis` where supported. Local development can use
`ELEVENLABS_API_KEY`, but deployed environments should use
`ELEVENLABS_SECRET_NAME`.

## Future Work

- Add a compact floating HabtamuAI mode for the map screen.
- Replace CSS animation with Rive/Lottie only if the demo needs richer motion.
- Add accessibility review for reduced motion and screen-reader copy.
