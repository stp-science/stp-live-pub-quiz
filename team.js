import {
  auth, db, signInAnonymously, onAuthStateChanged, doc, getDoc, setDoc,
  collection, query, where, onSnapshot, serverTimestamp
} from './firebase.js';
import { $, $$, escapeHtml, slugifyCode, formatScore, msToClock } from './core.js';

const state={user:null,quiz:null,rounds:[],team:null,subs:[],claims:[],unsubs:[],leaderUnsub:null,timer:null};
function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.remove('hidden');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.add('hidden'),2200)}
function cleanup(){state.unsubs.forEach(fn=>fn?.());state.unsubs=[];state.leaderUnsub?.();state.leaderUnsub=null}
function currentRound(){return state.rounds.find(r=>r.id===state.quiz?.currentRoundId)||null}
function currentSub(){const r=currentRound();return r?state.subs.find(s=>s.roundId===r.id):null}
function currentClaim(){const r=currentRound();return r?state.claims.find(c=>c.roundId===r.id):null}
function draftKey(){const r=currentRound();return r&&state.quiz?`stpDraft:${state.quiz.id}:${r.id}`:''}

const paramCode=new URLSearchParams(location.search).get('code'); if(paramCode) $('#codeInput').value=slugifyCode(paramCode);
$('#codeInput').oninput=e=>e.target.value=slugifyCode(e.target.value);

onAuthStateChanged(auth,async user=>{
  if(!user){try{await signInAnonymously(auth)}catch(e){$('#loading').innerHTML=`<h2>Could not connect</h2><p>${escapeHtml(e.message)}</p>`}return}
  state.user=user;$('#loading').classList.add('hidden');
  const saved=localStorage.getItem('stpTeamQuiz');
  if(saved){const teamSnap=await getDoc(doc(db,'quizzes',saved,'teams',user.uid));if(teamSnap.exists()){await enterQuiz(saved);return}}
  $('#joinPanel').classList.remove('hidden');
});

$('#joinBtn').onclick=async()=>{
  const code=slugifyCode($('#codeInput').value), name=$('#teamNameInput').value.trim();$('#joinError').textContent='';
  if(code.length<4)return $('#joinError').textContent='Enter the quiz code.';
  if(name.length<2)return $('#joinError').textContent='Enter a team name.';
  try{
    const joinSnap=await getDoc(doc(db,'joinCodes',code));if(!joinSnap.exists()||!joinSnap.data().active)throw new Error('That quiz code is not active.');
    const id=joinSnap.data().quizId, quizSnap=await getDoc(doc(db,'quizzes',id));if(!quizSnap.exists())throw new Error('Quiz not found.');if(!quizSnap.data().joinOpen)throw new Error('Joining is closed for this quiz.');
    await setDoc(doc(db,'quizzes',id,'teams',state.user.uid),{uid:state.user.uid,name,totalScore:0,manualAdjustment:0,jokerUsedRoundId:null,joinedAt:serverTimestamp()});
    localStorage.setItem('stpTeamQuiz',id);await enterQuiz(id);
  }catch(e){$('#joinError').textContent=e.message}
};

async function enterQuiz(id){
  cleanup();$('#joinPanel').classList.add('hidden');$('#quizPanel').classList.remove('hidden');
  state.unsubs.push(onSnapshot(doc(db,'quizzes',id),snap=>{if(!snap.exists())return;state.quiz={id:snap.id,...snap.data()};render()}));
  state.unsubs.push(onSnapshot(collection(db,'quizzes',id,'rounds'),snap=>{state.rounds=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.order-b.order);render()}));
  state.unsubs.push(onSnapshot(doc(db,'quizzes',id,'teams',state.user.uid),snap=>{if(!snap.exists()){localStorage.removeItem('stpTeamQuiz');location.reload();return}state.team={id:snap.id,...snap.data()};render()}));
  state.unsubs.push(onSnapshot(query(collection(db,'quizzes',id,'submissions'),where('teamUid','==',state.user.uid)),snap=>{state.subs=snap.docs.map(d=>({id:d.id,...d.data()}));render()}));
  state.unsubs.push(onSnapshot(query(collection(db,'quizzes',id,'jokerClaims'),where('teamUid','==',state.user.uid)),snap=>{state.claims=snap.docs.map(d=>({id:d.id,...d.data()}));render()}));
}

function render(){
  if(!state.quiz||!state.team)return;
  $('#teamHeader').innerHTML=`<div class="actions" style="justify-content:space-between"><div><div class="muted tiny">TEAM</div><h2 style="margin-bottom:4px">${escapeHtml(state.team.name)}</h2><div class="muted">${escapeHtml(state.quiz.title||'Live quiz')}</div></div><div style="text-align:right"><div class="muted tiny">YOUR SCORE</div><div class="score">${formatScore(state.team.totalScore||0)}</div></div></div>`;
  renderRound();renderLeaderboardGate();startTimerLoop();
}

function renderRound(){
  const r=currentRound(), box=$('#roundArea');
  if(!r){box.innerHTML=`<h2>Waiting for the host</h2><p class="muted">You’re in. The first round will appear here when it is selected.</p>`;return}
  const sub=currentSub(), claim=currentClaim();
  let body=`<div class="muted tiny">ROUND ${(r.order??0)+1}</div><h1 class="team-round-title">${r.icon||'🎲'} ${escapeHtml(r.title)}</h1><p>${escapeHtml(r.instructions||'Listen to the host for the questions.')}</p>`;
  if(r.status==='ready'){
    body+=`<div class="pill status-ready">Get ready — answers are not open yet.</div>`;
    if(r.jokerAllowed!==false&&!state.team.jokerUsedRoundId){body+=claim?`<div class="submit-banner" style="margin-top:14px">🃏 Joker played for this round. Your round score will be doubled.</div>`:`<button id="jokerBtn" class="btn primary big" style="margin-top:14px">🃏 Play joker on this round</button><p class="muted tiny" style="margin-top:8px">Once the host opens the round, you can’t add the joker.</p>`}
  } else if(r.status==='open'){
    body+=`<div class="pill status-open">Answers are OPEN</div>${answerSheetHtml(r,sub)}${sub?'<div class="submit-banner" style="margin-top:12px">✓ Submitted. You can still update answers until the host locks the round.</div>':''}`;
  } else {
    body+=`<div class="locked-banner">🔒 Answers are locked.</div>`;
    if(sub){body+=`<div style="margin-top:14px"><strong>Your submitted answers</strong>${submittedAnswersHtml(r,sub)}</div>`}else body+=`<p class="muted" style="margin-top:14px">No answer sheet was submitted for this round.</p>`;
    if(sub?.marked)body+=`<div class="card" style="margin-top:14px"><div class="muted tiny">ROUND SCORE</div><div class="quiz-code">${formatScore(sub.score||0)}</div>${sub.jokerMultiplier===2?'<div class="pill">🃏 Joker doubled this score</div>':''}</div>`;
  }
  if(state.quiz.timerEndsAt&&['ready','open'].includes(r.status)) body+=`<div class="divider"></div><div class="muted tiny">TIMER</div><div id="teamTimer" class="timer">--:--</div>`;
  box.innerHTML=body;
  $('#jokerBtn')?.addEventListener('click',playJoker);
  $('#submitBtn')?.addEventListener('click',submitAnswers);
  $$('[data-answer]',box).forEach(el=>el.addEventListener('input',saveDraft));
}

function answerSheetHtml(r,sub){
  const saved=loadDraft(), answers=sub?.answers||saved||[];
  return `<div class="answer-grid" style="margin-top:18px">${(r.inputs||[]).map((inp,i)=>inputHtml(inp,i,answers[i])).join('')}</div><button id="submitBtn" class="btn good big" style="margin-top:16px">${sub?'Update answers':'Submit round'}</button>`;
}
function inputHtml(inp,i,value){
  const label=escapeHtml(inp.label||`Question ${i+1}`),mode=inp.mode||'text';
  if(mode==='split')return `<div class="answer-row"><strong>${label}</strong><div class="grid two" style="margin-top:8px">${(inp.partLabels||['Part 1','Part 2']).map((p,j)=>`<div class="field"><label>${escapeHtml(p)}</label><input class="big-input" data-answer="${i}" data-part="${j}" value="${escapeHtml(Array.isArray(value)?(value[j]||''):'')}"></div>`).join('')}</div></div>`;
  if(mode==='choice')return `<div class="answer-row"><div class="field"><label>${label}</label><select class="big-input" data-answer="${i}"><option value="">Choose…</option>${(inp.choices||[]).map(c=>`<option value="${escapeHtml(c)}" ${String(value||'')===String(c)?'selected':''}>${escapeHtml(c)}</option>`).join('')}</select></div></div>`;
  const type=['number','closest'].includes(mode)?'number':'text';return `<div class="answer-row"><div class="field"><label>${label}</label><input class="big-input" type="${type}" step="${type==='number'?'any':''}" data-answer="${i}" value="${escapeHtml(value??'')}" placeholder="${escapeHtml(inp.placeholder||'Answer')}"></div></div>`;
}
function collectAnswers(){
  const r=currentRound(), out=new Array(r.inputs?.length||0).fill('');
  (r.inputs||[]).forEach((inp,i)=>{if(inp.mode==='split'){out[i]=(inp.partLabels||[]).map((_,j)=>$(`[data-answer="${i}"][data-part="${j}"]`)?.value.trim()||'')}else out[i]=$(`[data-answer="${i}"]`)?.value.trim()||''});return out;
}
function saveDraft(){try{localStorage.setItem(draftKey(),JSON.stringify(collectAnswers()))}catch{}}
function loadDraft(){try{return JSON.parse(localStorage.getItem(draftKey())||'null')}catch{return null}}
async function submitAnswers(){
  const r=currentRound();
  if(!r||r.status!=='open')return toast('The round is locked.');
  const answers=collectAnswers(),id=`${state.user.uid}_${r.id}`;
  const btn=$('#submitBtn');
  if(btn){btn.disabled=true;btn.textContent='Submitting…';}
  try{
    await setDoc(
      doc(db,'quizzes',state.quiz.id,'submissions',id),
      {teamUid:state.user.uid,roundId:r.id,answers,marked:false,submittedAt:serverTimestamp()},
      {merge:true}
    );
    localStorage.removeItem(draftKey());
    toast('Round submitted');
  }catch(e){
    console.error('Submission failed',e);
    toast('Submission failed: '+(e?.message||e));
  }finally{
    if(btn){btn.disabled=false;btn.textContent=currentSub()?'Update answers':'Submit round';}
  }
}
async function playJoker(){
  const r=currentRound();if(!r||r.status!=='ready'||state.team.jokerUsedRoundId)return;
  const id=`${state.user.uid}_${r.id}`;await setDoc(doc(db,'quizzes',state.quiz.id,'jokerClaims',id),{teamUid:state.user.uid,roundId:r.id,createdAt:serverTimestamp()});toast('Joker played!');
}
function submittedAnswersHtml(r,sub){return `<div class="answer-grid" style="margin-top:10px">${(r.inputs||[]).map((inp,i)=>`<div class="answer-row"><span class="muted">${escapeHtml(inp.label||`Q${i+1}`)}:</span> <strong>${escapeHtml(Array.isArray(sub.answers?.[i])?sub.answers[i].join(' / '):(sub.answers?.[i]??'—'))}</strong></div>`).join('')}</div>`}

function renderLeaderboardGate(){
  const box=$('#leaderboardArea');
  box.classList.add('hidden');
  state.leaderUnsub?.();
  state.leaderUnsub=null;
}
function startTimerLoop(){clearInterval(state.timer);state.timer=setInterval(()=>{const el=$('#teamTimer');if(!el||!state.quiz?.timerEndsAt)return;const ms=state.quiz.timerEndsAt-Date.now();el.textContent=msToClock(ms);el.classList.toggle('danger',ms<10000)},250)}
