import { auth,db,googleProvider,signInWithPopup,onAuthStateChanged,doc,collection,onSnapshot } from './firebase.js';
import { $, escapeHtml, mediaEmbed, formatScore, msToClock } from './core.js?v=20260924-media4';
const state={user:null,quiz:null,rounds:[],hostRound:null,teams:[],unsubs:[],hostUnsub:null,timer:null};
const qid=new URLSearchParams(location.search).get('quiz');
$('#presentSignIn')?.addEventListener('click',()=>signInWithPopup(auth,googleProvider));
onAuthStateChanged(auth,user=>{state.user=user;if(!qid){renderMessage('No quiz selected','Open presentation mode from the host dashboard.');return}if(!user||user.isAnonymous){renderLogin();return}subscribe()});
function cleanup(){state.unsubs.forEach(x=>x?.());state.unsubs=[];state.hostUnsub?.();state.hostUnsub=null}
function subscribe(){cleanup();state.unsubs.push(onSnapshot(doc(db,'quizzes',qid),s=>{if(!s.exists())return renderMessage('Quiz not found','');state.quiz={id:s.id,...s.data()};subscribeHostRound();render()}));state.unsubs.push(onSnapshot(collection(db,'quizzes',qid,'rounds'),s=>{state.rounds=s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.order-b.order);subscribeHostRound();render()}));state.unsubs.push(onSnapshot(collection(db,'quizzes',qid,'teams'),s=>{state.teams=s.docs.map(d=>d.data()).sort((a,b)=>(b.totalScore||0)-(a.totalScore||0));render()}));}
function currentRound(){return state.rounds.find(r=>r.id===state.quiz?.currentRoundId)||null}
function addFullscreenButton(){
  const card=document.querySelector('.present-card');
  if(!card || document.getElementById('globalFullscreenBtn'))return;
  const btn=document.createElement('button');
  btn.id='globalFullscreenBtn';
  btn.className='btn ghost';
  btn.textContent='⛶ Fullscreen presentation';
  btn.style.cssText='position:absolute;right:22px;bottom:22px;z-index:20';
  btn.onclick=async()=>{try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen();}catch(e){}};
  card.style.position='relative';
  card.appendChild(btn);
}

function subscribeHostRound(){const r=currentRound();if(!r||state.hostRid===r.id)return;state.hostUnsub?.();state.hostRid=r.id;state.hostUnsub=onSnapshot(doc(db,'quizzes',qid,'hostRounds',r.id),s=>{state.hostRound=s.data()||{questions:[]};render()})}
function renderLogin(){$('#presentContent').innerHTML='<h1>Host sign-in required</h1><p class="muted">The presentation screen can see question text and answers, so it is host-only.</p><button id="presentSignIn2" class="btn primary big">Sign in with Google</button>';$('#presentSignIn2').onclick=()=>signInWithPopup(auth,googleProvider)}
function renderMessage(title,msg){$('#presentContent').innerHTML=`<h1>${escapeHtml(title)}</h1><p class="muted">${escapeHtml(msg)}</p>`}
function render(){if(!state.quiz)return;const r=currentRound();if(state.quiz.revealLeaderboard){renderLeaderboard();addFullscreenButton();return}if(!r){renderLobby();addFullscreenButton();return}if(!state.hostRound)return;const q=state.hostRound.questions?.[r.currentQuestion||0];if(!q){renderRoundSplash(r);addFullscreenButton();return}if(r.status==='ready'||r.status==='closed'){renderRoundSplash(r);addFullscreenButton();return}renderQuestion(r,q);addFullscreenButton()}
function renderLobby(){$('#presentContent').innerHTML=`<div class="present-head"><div class="present-round">${escapeHtml(state.quiz.title||'Live Pub Quiz')}</div><div class="pill">JOIN CODE</div></div><div style="margin:auto;text-align:center"><div class="muted" style="font-size:1.5rem">Join at the team page using</div><div class="quiz-code" style="font-size:clamp(4rem,15vw,10rem);margin-top:18px">${escapeHtml(state.quiz.joinCode||'')}</div><p class="muted">${state.teams.length} team${state.teams.length===1?'':'s'} joined</p></div>`}
function renderRoundSplash(r){$('#presentContent').innerHTML=`<div class="present-head"><div class="present-round">ROUND ${(r.order??0)+1}</div><div class="pill">${escapeHtml(r.type||'round')}</div></div><div style="margin:auto;text-align:center"><div style="font-size:clamp(4rem,12vw,8rem)">${r.icon||'🎲'}</div><h1 class="present-prompt" style="margin:20px 0">${escapeHtml(r.title)}</h1><p style="font-size:clamp(1.1rem,2vw,1.7rem);color:var(--muted)">${escapeHtml(r.instructions||'')}</p>${r.jokerAllowed!==false?'<div class="pill">🃏 Joker available</div>':''}</div>`}
function answerText(q){if(q.answerMode==='split')return(q.partAnswers||[]).map(p=>`${p.label}: ${(p.accepted||[])[0]||'—'}`).join(' • ');if(['number','closest'].includes(q.answerMode))return String(q.numericAnswer??'—');return (q.accepted||[])[0]||'—'}
function renderQuestion(r,q){
  const idx=r.currentQuestion||0,reveal=r.status==='revealed',media=q.mediaUrl||'';
  const main=media
    ? `<div id="projectorMedia">${mediaEmbed(media)}</div>${q.fallbackMediaUrl?`<div style="text-align:center;margin-top:10px"><button id="useFallbackMedia" class="btn ghost">Video unavailable? Use backup</button></div>`:''}`
    : `<div style="margin:auto;text-align:center"><div class="muted" style="font-size:clamp(1.2rem,2vw,1.8rem)">Listen to the host</div><div class="quiz-code" style="font-size:clamp(4rem,14vw,9rem);margin-top:16px">Q${idx+1}</div></div>`;
  $('#presentContent').innerHTML=`<div class="present-head"><div class="present-round">${r.icon||'🎲'} ${escapeHtml(r.title)}</div><div class="actions"><div class="present-qnum">Question ${idx+1} / ${r.questionCount}</div><button id="fullscreenPresent" class="btn ghost">⛶ Fullscreen</button></div></div>${main}${reveal?`<div><div class="muted" style="text-align:center">ANSWER</div><div class="present-answer">${escapeHtml(answerText(q))}</div></div>`:''}${state.quiz.timerEndsAt?'<div style="text-align:right"><div id="presentTimer" class="timer">--:--</div></div>':''}`;

  $('#fullscreenPresent')?.addEventListener('click',async()=>{
    try{
      if(!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    }catch(e){}
  });

  $('#useFallbackMedia')?.addEventListener('click',()=>{
    const box=$('#projectorMedia');
    if(box) box.innerHTML=mediaEmbed(q.fallbackMediaUrl||'');
    $('#useFallbackMedia')?.remove();
  });

  startTimer();
}
function renderLeaderboard(){const top=Number(state.quiz.revealTopN||5),rows=[...state.teams].slice(0,top>0?top:state.teams.length);$('#presentContent').innerHTML=`<div class="present-head"><div class="present-round">${escapeHtml(state.quiz.title||'Live Pub Quiz')}</div><div class="pill">🏆 LEADERBOARD</div></div><h1 style="font-size:clamp(2.5rem,6vw,5rem);margin:28px 0">Leaderboard</h1><div class="leaderboard" style="margin:auto 0">${rows.map((t,i)=>`<div class="leader-row" style="padding:clamp(12px,2vh,24px) clamp(16px,2vw,30px)"><div class="place" style="font-size:clamp(1.8rem,4vw,3.4rem)">${i+1}</div><div class="name" style="font-size:clamp(1.4rem,3vw,2.5rem)">${escapeHtml(t.name)}</div><div class="score" style="font-size:clamp(1.8rem,4vw,3.4rem)">${formatScore(t.totalScore)}</div></div>`).join('')}</div>`}
function startTimer(){clearInterval(state.timer);state.timer=setInterval(()=>{const el=$('#presentTimer');if(!el||!state.quiz?.timerEndsAt)return;const ms=state.quiz.timerEndsAt-Date.now();el.textContent=msToClock(ms);el.classList.toggle('danger',ms<10000)},200)}
