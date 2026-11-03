# Text LLMs that allow adult fiction for adult users

Type: research
Status: resolved
Blocked by: none
Part of: [Map: Storytell AI MVP](../map.md)

## Question

Which text LLMs/providers (hosted APIs, aggregators such as OpenRouter, or self-hostable open-weight models) permit explicit adult fiction for an adult user under their own published usage policies, and how do they compare on English roleplay quality, multi-character handling, context length, streaming support, and price — specifically whether a single heavy user fits a $10–30/month budget? Cite each provider's actual policy text.

## Answer

Findings: branch `research/text-llm-for-adult-roleplay`, file `docs/research/text-llm-for-adult-roleplay.md` (commit 73733a8).

- Ruled out by their own policies: OpenAI (Model Spec 2026-10-29 still says it "should not generate erotica"; "grown-up mode" only being explored), Google Gemini, and the first-party APIs of DeepSeek and Z.ai (ban "sexually explicit") and Together AI (bans "pornography").
- First-party permissive: xAI/Grok (bans only sexualizing real people and minors) and Mistral (guardrails are opt-in).
- Open weights: DeepSeek V4 (MIT), GLM-5.3 and Kimi K3 use MIT-style licences conditioned only on lawful use, so they can run on third-party hosts. DeepInfra's terms checked out. Through OpenRouter, pin the host with `provider.only`, since both the model's and the serving provider's terms apply.
- Cost (assumed heavy use: 150 turns/day, 32k context, 500 output tokens): comfortably in the $10–30 budget — DeepSeek V4 Flash (~$5–13), Mistral Small 4 (~$7–23). Slightly over even with caching — Mistral Large 4, GLM-5.3 (~$33–36). Best writers Kimi K3 and Grok 4.7 are far over (~$130–440).
- Shortlist (no decision): 1) DeepSeek V4 Pro/Flash on a pinned third-party host, 2) GLM-5.3 on a third-party host, 3) Mistral Large 4 / Small 4 first-party. Fallbacks: Grok, or Featherless flat $25/month (32K context only; terms limit use to human-typed chat).
- Caveats: policy-only — whether each model actually writes such content must be tested in the turn prototype. Quality evidence is soft (EQ-Bench is LLM-judged; no multi-Character roleplay benchmark). Fireworks terms unreadable (PDF), Parasail and MiniMax unchecked. Venice's terms contradict themselves, so it's left off the shortlist.
