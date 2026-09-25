import assert from "node:assert/strict";
import { FEEDBACK_HOLD_MS, FEEDBACK_SKIP_AFTER_MS, feedbackHoldMs, feedbackSkipAfterMs } from "../.tmp-feedback-timing/feedback-timing.js";

// acerto passa depressa; o erro segura a resposta certa por mais tempo
assert.equal(feedbackHoldMs(true, false), FEEDBACK_HOLD_MS.correct);
assert.equal(feedbackHoldMs(true, true), FEEDBACK_HOLD_MS.correct);
assert.equal(feedbackHoldMs(false, false), FEEDBACK_HOLD_MS.wrongOptions);
assert.equal(feedbackHoldMs(false, true), FEEDBACK_HOLD_MS.wrongTyped);

// o erro fica mais tempo que o acerto, e o modo de escrita mais que o de alternativas (é preciso comparar a grafia)
assert.ok(FEEDBACK_HOLD_MS.wrongOptions >= 2 * FEEDBACK_HOLD_MS.correct);
assert.ok(FEEDBACK_HOLD_MS.wrongTyped > FEEDBACK_HOLD_MS.wrongOptions);
// sem exagero: nenhum retorno passa de 3 s
assert.ok(FEEDBACK_HOLD_MS.wrongTyped <= 3000);

// dá para pular, mas só depois de um instante e nunca depois de o retorno já ter acabado
assert.equal(feedbackSkipAfterMs(true), FEEDBACK_SKIP_AFTER_MS.correct);
assert.equal(feedbackSkipAfterMs(false), FEEDBACK_SKIP_AFTER_MS.wrong);
assert.ok(FEEDBACK_SKIP_AFTER_MS.correct < FEEDBACK_HOLD_MS.correct);
assert.ok(FEEDBACK_SKIP_AFTER_MS.wrong < FEEDBACK_HOLD_MS.wrongOptions);
assert.ok(FEEDBACK_SKIP_AFTER_MS.wrong >= 600, "toque acidental logo após responder não pode pular o erro");

console.log("feedback-timing: ok");
