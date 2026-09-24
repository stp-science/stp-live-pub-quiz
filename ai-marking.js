import { app, getFreshAppCheckToken } from './firebase.js?v=20260924-ai-debug3';
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

const modelNames = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];

function makeModel(modelName) {
  return getGenerativeModel(ai, {
    model: modelName,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema,
      temperature: 0
    }
  });
}

function isRetryableModelError(e) {
  const msg=(e?.message||String(e)).toLowerCase();
  return msg.includes('[500]') ||
    msg.includes('[503]') ||
    msg.includes('high demand') ||
    msg.includes('unavailable') ||
    msg.includes('resource exhausted');
}

export async function judgeQuizAnswers(items = []) {
  if (!items.length) return new Map();

  try {
    await getFreshAppCheckToken();
  } catch (e) {
    throw new Error('APPCHECK_FAILED: ' + (e?.message || String(e)));
  }
  const payload = items.map(x => ({
    id: x.id,
    question: x.question,
    expectedAnswers: x.expectedAnswers,
    studentAnswer: x.studentAnswer
  }));
  const prompt = 'Mark every item exactly once. Return correct only when the student answer is clearly equivalent to an expected answer. Return incorrect when clearly different. Return review when meaning is plausible but uncertain. ITEMS:\n' + JSON.stringify(payload);
  let result=null;
  let lastError=null;
  for(const modelName of modelNames){
    try{
      result=await makeModel(modelName).generateContent(prompt);
      break;
    }catch(e){
      lastError=e;
      if(!isRetryableModelError(e))break;
    }
  }
  if(!result){
    const e=lastError;
    const code=e?.code||e?.name||'AI_ERROR';
    const message=e?.message||String(e);
    throw new Error('GEMINI_FAILED '+code+': '+message);
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
