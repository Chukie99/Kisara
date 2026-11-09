export const HOOK_DIRECTION = [
  'Use a FRONTAL, specific hook: confront one familiar belief, uncomfortable tradeoff or contradiction the intended viewer recognizes. Put the concrete friction in the first spoken sentence, not after a greeting or topic introduction. Prefer a short pointed statement or pointed question, followed by the unresolved consequence. Direct does not mean insulting the viewer, shouting or inventing an accusation.',
  'Separate the click promise from the spoken opening. The TITLE makes a specific, honest unanswered promise; the OPENING immediately shows the situation behind it and develops the same question instead of repeating the title verbatim. The actual video must deliver that answer. Avoid generic curiosity words, misleading certainty, unearned secrets, unsupported numbers, fake urgency or a promised financial outcome. Vary the hook construction across candidates; do not turn every title into the same question template.',
  'For Indonesian everyday finance, an illustrative tone example is "Gaji naik. Kenapa tanggal tua tetap bikin panik?" Only use that situation if it belongs to the approved topic. Write naturally in the selected language and established narrator voice. Do not copy the example into unrelated stories.'
].join(' ')

export const CTA_DIRECTION = [
  'After resolving the opening promise, end with EXACTLY ONE brief, spoken, topic-specific comment invitation. Put it in the final narration itself, not only in a production note or description. Invite viewers to choose between two defensible priorities, challenge a tradeoff in the example, or share one recognizable lived experience and why. Make replying easy without asking for private financial details.',
  'The CTA should create an interesting difference of perspective, not manufacture a fight or repeat the answered factual question. It must grow from what the viewer just watched, not a generic "what do you think?", "comment below", "like, share and subscribe", keyword spam, reward, guilt or a test of intelligence. Ask for one response, not several tasks. Roughly one short sentence; leave no new claim or promised answer for the comments.',
  'Use this closing invitation only once at the actual end of the COMPLETE video, never at the end of each scene, outline section or generation batch. Treat a supplied creator CTA as the starting direction and adapt it to the final content. Keep the question natural for the genre; do not spoil an ending before its payoff or add several closing summaries. Never promise that a wording will guarantee comments or clicks.'
].join(' ')

/** One editorial contract for outlines, scripts, revisions and shot planning. */
export const ENGAGEMENT_DIRECTION = [
  HOOK_DIRECTION,
  CTA_DIRECTION,
  'Build attention through understandable progress, never invented facts or artificial suspense. Start in the concrete problem, consequential action or supported contrast within the opening sentence (roughly 5–10 seconds). No topic announcement, agenda, generic question or repeated introduction.',
  'A routine biography is not a hook: avoid openings equivalent to Kenzo usually buys coffee or Today we will discuss savings. When the approved brief permits an illustrated simulation, show the decision immediately: he draws back the payment at the counter, because the same money is needed for his stated goal. Use only the goal and amounts already approved. For other genres use their actual disturbance, not this coffee example.',
  'Give an early partial answer or meaningful discovery within roughly the first 20–30 seconds for Long, or the opening quarter for Short. Then deepen it with a new obstacle, condition, choice or consequence. Do not withhold the basic explanation merely to keep viewers waiting.',
  'Use one continuing situation as the thread. In approved fiction, follow a character with a specific goal, choices, setbacks and consequences; pay off a planted detail at the end. In factual explainers, follow the approved example or real process from its starting state through a transaction, comparison or changed understanding. An illustrative character is not a source, a real case study or permission to invent financial outcomes or dialogue.',
  'Each passage must change what the viewer knows, expects or sees happen. Cut repeated claims, paraphrased recaps and examples that perform the same explanatory job. A later callback must add a consequence or new insight. Keep essential qualifications where relevant, without repeating the same disclaimer in every passage.',
  'Use contrasting situations, concrete stakes and reactions justified by the brief. Do not imitate another creator\'s story, stock twists, promised wealth, guaranteed returns or manufactured danger. Preserve the audience, genre, approved facts and ending.',
  'Resolve the opening question through the demonstrated events or reasoning. Finish with one brief payoff or practical takeaway followed by the single final comment invitation, not several closing summaries. Estimate duration from necessary development; never stretch an outline to fill minutes.'
].join(' ')

export const SCENE_DIRECTION = [
  'Design a sequence of connected scenes, not presentation slides. Choose each shot for its new action, discovery, comparison or consequence. Show a subject interacting with the relevant physical object in a plausible location; do not repeatedly seat a worried presenter at the same desk or beside a floating screen.',
  'Plan variety across the entire sequence: an establishing view when needed for orientation, a close detail for a discovery, an interaction for a choice, and a reaction or result. Change distance and angle with a reason. Do not randomize locations or invent cast changes just for variety; a continuous action must preserve its space, props and wardrobe.',
  'Do not use a whole run of holding an object, reading a document, writing calculations, staring at a screen and closing a notebook as a substitute for development. In an approved everyday example, show the choice where it happens, the concrete change it causes, a comparison using the same objects, and the resulting decision. A close detail is useful when it reveals something new; another generic desk shot is not.',
  'Use expressive posture and facial reactions supported by the scene, not the same worried face throughout. Backgrounds should make the action legible and follow the same reference illustration style as the main character and extras, with a clear focal hierarchy. Never copy the main character\'s face onto NPCs.',
  'A visual metaphor is optional: use a simple, clearly illustrative physical relationship only when it clarifies the actual mechanism. Never replace a factual explanation with an invented chart, investment result or magical money scene. Important exact numbers belong in editable overlays, not AI-painted illegible text.',
  'For image-to-video, stage the first frame BEFORE the intended action: the hand near the coin, not a coin already deposited. Describe one visible start-to-finish action, an appropriate reaction and a stable ending. Keep it feasible within one short shot. Preserve existing identities, props and setting; no montage, new objects or camera-only animation. A shot must work as an understandable still as well.'
].join(' ')

/** Give the hook and closing one shot each, rather than equal shares of a long script. */
export function storyBeatSlots(count: number, beatCount: number): { id: number; beat: number }[] {
  if (!Number.isInteger(count) || !Number.isInteger(beatCount) || beatCount < 3 || count < beatCount)
    throw new Error('Jumlah adegan dan bagian cerita belum cocok.')
  const middle = count - 2
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    beat: i === 0 ? 0 : i === count - 1 ? beatCount - 1 : 1 + Math.floor((i - 1) * (beatCount - 2) / middle)
  }))
}
