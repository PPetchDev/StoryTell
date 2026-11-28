Status: ready-for-agent

# GLM 5.3 Flash Uncensored as a play model

## Problem

The user wants to play on GLM 5.3 Flash Uncensored, which NanoGPT's subscription includes. Settings offers only GLM-5.3 and DeepSeek V4 Pro.

## Facts (measured 2026-11-28 on NanoGPT, made-up text)

- NanoGPT id `z-ai/glm-5.3-flash-uncensored`. It is included in the subscription at a 1x multiplier, and its pay-as-you-go list price is $0.20 in and $0.80 out per million tokens.
- Five of its six providers are eligible for Zero Data Retention. A call with `provider: { zdr: true }` answered.
- It always thinks. `reasoning_effort: none` is refused with 400 `reasoning_required`. At `minimal` it answered with 0 reasoning tokens in about 2 s.
- It takes `temperature`, `min_p`, `top_p` and `repetition_penalty`, and it honours `stop`.
- Neither OpenRouter nor Venice serves it.
- **Eval (19 turn scenes, 5 samples each, on NanoGPT, against GLM-5.3):**
  - In 7 samples it wrote quoted novel prose with no `@Name:` speech line; GLM-5.3 did this in 1.
  - It wrote Thai in 1 sample of the English scene.
  - One answer ran out on reasoning.
  - It did better on "does not ask again", 5/5 against 3/5.
  - It gave fewer empty answers, 1 against 3.
- **Eval as the background model (Judge and Memory, 8 scenes × 5):** 39/40, the same as DeepSeek V4 Flash. The background model stays DeepSeek V4 Flash.

## Decisions

- **A third play model.** Its app name is `glm-5.3-flash-uncensored` and Settings shows it as "GLM-5.3 Flash Uncensored". It is offered after the other two, and the default stays GLM-5.3.
- **Settings:**
  - It offers all four samplers. No maker suggestion is published.
  - The price shown is NanoGPT's list price.
  - The price line says that it runs on NanoGPT's subscription only.
- **Only on NanoGPT.** The model is marked as served by NanoGPT alone.
  - On any other host in the text chain (OpenRouter, Venice), the play call goes as GLM-5.3, with GLM-5.3's own Sampling. The AI Message records `glm-5.3`, so the Drift notice shows the change.
  - The free host answers with its own model, as it does for every model.
- **Reasoning:** it is sent at `minimal`, as GLM-5.3 is.
- **No busy fallback of its own.** A busy NanoGPT already moves on to the next host, where GLM-5.3 answers.
- The NanoGPT subscription is for one person, as before. Nothing here changes who may use NanoGPT.

## Testing

- **Gateway contract:**
  - With the model chosen, a turn on NanoGPT sends `z-ai/glm-5.3-flash-uncensored` with ZDR and `reasoning_effort: minimal`, and records model `glm-5.3-flash-uncensored` on host `nanogpt`.
  - When NanoGPT is busy and OpenRouter follows, OpenRouter gets `z-ai/glm-5.3` with GLM-5.3's Sampling, and the result names `glm-5.3`.
  - A chain of OpenRouter alone sends GLM-5.3.
- **Settings:** the options list the model third, with its four samplers and an `onlyOn` of `nanogpt`, and `PUT /api/settings` takes it.

## Out of scope

- Changing the background model.
- Getting the model to write `@Name:` lines more often by changing the prompt.
