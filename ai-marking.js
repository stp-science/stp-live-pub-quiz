import { app } from './firebase.js';
import { getAI, getGenerativeModel, GoogleAIBackend, Schema } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-ai.js';

const ai = getAI(app, { backend: new GoogleAIBackend() });

const responseSchema = Schema.object({
  properties: {
    judgements: Schema.array({
      items: Schema.object({
        properties: {
          id: Schema.string(),
          verdict: Schema.enumString({ enum: ['correct', 'incorrect', 'review'] }),
          reason: Schema.string()
        }
      })
    })
  }
});

const model = getGenerativeModel(ai, {
  model: 'gemini-3.8-flash',
  generationConfig: {
    responseMimeType: 'application/json',
    responseSchema,
    temperature: 0
  }
});

export async function judgeQuizAnswers(items = []) {
  if (!items.length) return new Map();
  const payload = items.map(x => ({
    id: x.id,
    question: x.question,
    expectedAnswers: x.expectedAnswers,
    studentAnswer: x.studentAnswer
  }));
  const prompt = 'Mark every item exactly once. Return correct only when the student answer is clearly equivalent to an expected answer. Return incorrect when clearly different. Return review when meaning is plausible but uncertain. ITEMS:\n' + JSON.stringify(payload);
  let result;
  try {
    result = await model.generateContent(prompt);
  } catch (e) {
    const code = e?.code || e?.name || 'AI_ERROR';
    const message = e?.message || String(e);
    throw new Error(code + ': ' + message);
  }
  let parsed;
  try {
    parsed = JSON.parse(result.response.text());
  } catch (e) {
    throw new Error('AI_RESPONSE_PARSE: ' + (e?.message || String(e)));
  }
  const out = new Map();
  for (const j of parsed?.judgements || []) {
    if (j?.id && ['correct','incorrect','review'].includes(j.verdict)) out.set(j.id, j);
  }
  return out;
}
