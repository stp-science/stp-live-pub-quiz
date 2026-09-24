import {
  auth, db, googleProvider, signInWithPopup, onAuthStateChanged, signOut,
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where,
  onSnapshot, getDocs, serverTimestamp, writeBatch
} from './firebase.js?v=20260924-ai-debug3';
import {
  $, $$, escapeHtml, randomCode, randomId, inputDescriptor, sampleQuiz,
  markOne, formatScore, mediaEmbed
} from './core.js?v=20260924-ai3';
import { judgeQuizAnswers } from './ai-marking.js?v=20260924-ai-fallback1';

const state = {
  user:null, quizzes:[], quiz:null, rounds:[], hostRounds:new Map(), teams:[], submissions:[], jokerClaims:[],
  detailUnsubs:[], quizListUnsub:null, selectingQuizId:null, detailGeneration:0, editRoundId:null, editing:null, marks:new Map(), aiMarking:false
};

function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.remove('hidden');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.add('hidden'),2500)}
function cleanupDetails(){state.detailUnsubs.forEach(fn=>fn?.());state.detailUnsubs=[]}
function cleanupAll(){cleanupDetails();state.quizListUnsub?.();state.quizListUnsub=null}
function isHostUser(user){return user && !user.isAnonymous}
function quizId(){return state.quiz?.id}
function currentRound(){return state.rounds.find(r=>r.id===state.quiz?.currentRoundId)||null}
function teamName(uid){return state.teams.find(t=>t.uid===uid)?.name || 'Unknown team'}


$('#signInBtn').onclick=()=>signInWithPopup(auth,googleProvider).catch(e=>toast(e.message));
$('#signOutBtn').onclick=()=>signOut(auth);

onAuthStateChanged(auth, user=>{
  state.user=user;
  const ok=isHostUser(user);
  $('#authGate').classList.toggle('hidden',ok);
  $('#hostApp').classList.toggle('hidden',!ok);
  $('#signOutBtn').classList.toggle('hidden',!ok);
  cleanupAll();
  state.quiz=null; state.rounds=[]; state.teams=[]; state.submissions=[]; state.jokerClaims=[];
  if(ok) subscribeQuizzes();
});

function subscribeQuizzes(){
  const q=query(collection(db,'quizzes'),where('hostUid','==',state.user.uid));
  state.quizListUnsub?.();
  state.quizListUnsub=onSnapshot(q,snap=>{
    state.quizzes=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
    renderQuizSelect();

    // Keep the current quiz selected while it still exists. Only auto-select
    // when nothing is selected yet, or if the current quiz was actually deleted.
    if(state.quiz && state.quizzes.some(x=>x.id===state.quiz.id)) return;

    const wanted=localStorage.getItem('stpHostQuiz');
    const next=state.quizzes.find(x=>x.id===wanted)||state.quizzes[0];
    if(next && next.id!==state.selectingQuizId) selectQuiz(next.id);
    else if(!next && !state.selectingQuizId){state.quiz=null;renderAll()}
  },err=>{console.error('Quiz list listener failed',err);toast('Quiz list error: '+err.message)});
}

function renderQuizSelect(){
  $('#quizSelect').innerHTML=state.quizzes.length?state.quizzes.map(q=>`<option value="${q.id}">${escapeHtml(q.title||'Untitled')}</option>`).join(''):'<option>No quizzes yet</option>';
  if(quizId()) $('#quizSelect').value=quizId();
}
$('#quizSelect').onchange=e=>selectQuiz(e.target.value);

async function selectQuiz(id){
  if(!id || state.selectingQuizId===id) return;
  if(state.quiz?.id===id && state.detailUnsubs.length) return;

  state.selectingQuizId=id;
  const generation=++state.detailGeneration;
  cleanupDetails();
  state.editRoundId=null;state.editing=null;state.hostRounds.clear();state.marks.clear();state.markContext=null;

  // Clear the old quiz immediately so stale round/status data cannot remain visible
  // while the new quiz is loading.
  state.quiz={id,title:'Loading quiz…',joinCode:'',joinOpen:false,revealLeaderboard:false,revealTopN:5,currentRoundId:null};
  state.rounds=[];state.teams=[];state.submissions=[];state.jokerClaims=[];
  renderAll();

  try{
    const snap=await getDoc(doc(db,'quizzes',id));
    if(generation!==state.detailGeneration)return;
    if(!snap.exists()) throw new Error('Quiz no longer exists.');
    state.quiz={id:snap.id,...snap.data()};
    localStorage.setItem('stpHostQuiz',id);
    await ensureBuiltInQuizContent(id);
    if(generation!==state.detailGeneration)return;
    renderAll();
    subscribeQuizDetail(id,generation);
  }catch(e){
    if(generation!==state.detailGeneration)return;
    console.error('Select quiz failed',e);
    toast('Could not open quiz: '+e.message);
  }finally{
    if(generation===state.detailGeneration)state.selectingQuizId=null;
  }
}

async function ensureBuiltInQuizContent(id){
  if(state.quiz?.title!=='Year 9 & 10 Pub Quiz 2026' || Number(state.quiz?.contentVersion||0)>=10)return;
  try{
    const roundsSnap=await getDocs(collection(db,'quizzes',id,'rounds'));
    const batch=writeBatch(db);
    let changed=false;

    for(const rd of roundsSnap.docs){
      const title=rd.data().title;
      if(title!=='Name That Tune' && title!=='Watch Closely')continue;
      const hrRef=doc(db,'quizzes',id,'hostRounds',rd.id);
      const hrSnap=await getDoc(hrRef);
      if(!hrSnap.exists())continue;
      const data=hrSnap.data();
      const questions=structuredClone(data.questions||[]);

      if(title==='Name That Tune'){
        const links=[
          'https://www.youtube.com/watch?v=DiTd771WumE',
          'https://www.youtube.com/watch?v=V9PVRfjEBTI',
          'https://www.youtube.com/watch?v=4NRXx6U8ABQ',
          'https://www.youtube.com/watch?v=LFasFq4GJYM',
          'https://www.youtube.com/watch?v=HgzGwKwLmgM'
        ];
        questions.forEach((q,i)=>{if(links[i]){q.hostLink=links[i];q.hostLinkLabel='Open song';}});
        batch.update(hrRef,{questions});
        changed=true;
      }

      if(title==='Watch Closely'){
        const newQuestions=[
        {id:'watch1',prompt:'After using the toothbrushes in his ears, what does Paddington do with what comes out?',mediaUrl:'https://www.dailymotion.com/video/x7uzno3',hostLink:'https://www.dailymotion.com/video/x7uzno3',hostLinkLabel:'Open Paddington clip',answerMode:'text',accepted:['licks it','lick it','tastes it','taste it','eats it','puts it in his mouth','puts them in his mouth'],points:1},
        {id:'watch2',prompt:'What liquid does Paddington drink just before putting his head into the toilet?',mediaUrl:'',answerMode:'text',accepted:['mouthwash','mouth wash'],points:1},
        {id:'watch3',prompt:'What does Paddington use as a shield when the shower head turns on him?',mediaUrl:'',answerMode:'text',accepted:['toilet lid','toilet seat lid','toilet seat','lid','the toilet lid'],points:1},
        {id:'watch4',prompt:'What happens to the shower head after Paddington turns the shower on?',mediaUrl:'',answerMode:'text',accepted:['comes loose','it comes loose','comes off','it comes off','flies around','it flies around','sprays around','it sprays around','comes loose and sprays around','flies around spraying water'],points:1},
        {id:'watch5',prompt:'Where does Paddington’s runaway bathtub finally end up?',mediaUrl:'',answerMode:'text',accepted:['kitchen','the kitchen'],points:1}
      ];
        batch.update(hrRef,{questions:newQuestions});
        batch.update(rd.ref,{
          instructions:'Play the Paddington bathroom clip once. Students watch only — do not show the questions until the clip finishes. Do not replay until all answers are submitted.',
          inputs:newQuestions.map(inputDescriptor),
          questionCount:5,
          maxPoints:5
        });
        changed=true;
      }
    }

    batch.update(doc(db,'quizzes',id),{contentVersion:10,updatedAt:serverTimestamp()});
    await batch.commit();
    state.hostRounds.clear();
    state.quiz.contentVersion=10;
    if(changed)toast('Quiz media links updated');
  }catch(e){
    console.error('Quiz content update failed',e);
    toast('Could not update quiz media links: '+(e?.message||e));
  }
}

function subscribeQuizDetail(id,generation=state.detailGeneration){
  const valid=()=>generation===state.detailGeneration && state.quiz?.id===id;

  state.detailUnsubs.push(onSnapshot(doc(db,'quizzes',id),snap=>{
    if(!valid()||!snap.exists())return;
    state.quiz={id:snap.id,...snap.data()};renderAll();
  },err=>{if(valid()){console.error('Quiz listener failed',err);toast('Quiz listener error: '+err.message)}}));

  state.detailUnsubs.push(onSnapshot(collection(db,'quizzes',id,'rounds'),snap=>{
    if(!valid())return;
    state.rounds=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.order-b.order);renderAll();
  },err=>{if(valid()){console.error('Rounds listener failed',err);toast('Rounds error: '+err.message)}}));

  state.detailUnsubs.push(onSnapshot(collection(db,'quizzes',id,'teams'),snap=>{
    if(!valid())return;
    state.teams=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.totalScore||0)-(a.totalScore||0));renderAll();
  },err=>{if(valid()){console.error('Teams listener failed',err);toast('Teams error: '+err.message)}}));

  state.detailUnsubs.push(onSnapshot(collection(db,'quizzes',id,'submissions'),snap=>{
    if(!valid())return;
    state.submissions=snap.docs.map(d=>({id:d.id,...d.data()}));renderAll();
  },err=>{if(valid()){console.error('Submissions listener failed',err);toast('Submissions error: '+err.message)}}));

  state.detailUnsubs.push(onSnapshot(collection(db,'quizzes',id,'jokerClaims'),snap=>{
    if(!valid())return;
    state.jokerClaims=snap.docs.map(d=>({id:d.id,...d.data()}));renderAll();
  },err=>{if(valid()){console.error('Joker listener failed',err);toast('Joker error: '+err.message)}}));
}

async function createQuiz(template){
  const id=randomId('quiz_'), joinCode=randomCode(6);
  const src=template?structuredClone(sampleQuiz):{title:'New Pub Quiz',settings:{jokersPerTeam:1,revealTopN:5},rounds:[]};
  try{
    // Create the parent quiz first. Firestore rules for rounds verify that this
    // quiz already exists and belongs to the signed-in host.
    const parentBatch=writeBatch(db);
    parentBatch.set(doc(db,'quizzes',id),{
      title:src.title,hostUid:state.user.uid,joinCode,status:'lobby',joinOpen:true,contentVersion:Number(src.contentVersion||0),
      currentRoundId:null,revealLeaderboard:false,revealTopN:src.settings?.revealTopN||5,
      timerEndsAt:null,createdAt:serverTimestamp(),updatedAt:serverTimestamp()
    });
    parentBatch.set(doc(db,'joinCodes',joinCode),{quizId:id,active:true,hostUid:state.user.uid});
    await parentBatch.commit();

    // Now that the parent exists, the host is authorised to create its rounds.
    if(src.rounds.length){
      const roundsBatch=writeBatch(db);
      src.rounds.forEach((round,idx)=>{
        const rid=randomId('round_');
        const publicRound={
          title:round.title,icon:round.icon||'🎲',type:round.type||'standard',
          instructions:round.instructions||'',order:idx,status:'closed',
          currentQuestion:0,questionCount:round.questions.length,
          inputs:round.questions.map(inputDescriptor),
          jokerAllowed:round.jokerAllowed!==false,
          maxPoints:round.questions.reduce((s,q)=>s+Number(q.points||1),0)
        };
        roundsBatch.set(doc(db,'quizzes',id,'rounds',rid),publicRound);
        roundsBatch.set(doc(db,'quizzes',id,'hostRounds',rid),{
          questions:round.questions,closestScoring:round.closestScoring||[3,2,1]
        });
      });
      await roundsBatch.commit();
    }

    localStorage.setItem('stpHostQuiz',id);
    await selectQuiz(id);
    toast(template?'Pub quiz created and loaded':'Blank quiz created and loaded');
  }catch(e){
    console.error('Create quiz failed',e);
    toast('Could not create quiz: '+(e?.message||e));
  }
}
$('#createSampleBtn').onclick=()=>createQuiz(true);
$('#createBlankBtn').onclick=()=>createQuiz(false);

$('#deleteQuizBtn').onclick=async()=>{
  if(!state.quiz)return;
  const id=quizId(),title=state.quiz.title||'this quiz',joinCode=state.quiz.joinCode||'';
  if(!confirm(`Delete "${title}"? This permanently removes its rounds, teams, submissions and scores.`))return;

  const btn=$('#deleteQuizBtn');
  btn.disabled=true;btn.textContent='Deleting…';
  try{
    const subcollections=['rounds','hostRounds','teams','submissions','jokerClaims','leaderboard'];

    // Delete child documents first.
    for(const sub of subcollections){
      const snap=await getDocs(collection(db,'quizzes',id,sub));
      if(!snap.empty){
        let batch=writeBatch(db),count=0;
        for(const d of snap.docs){
          batch.delete(d.ref);count++;
          if(count===400){
            await batch.commit();
            batch=writeBatch(db);count=0;
          }
        }
        if(count)await batch.commit();
      }
    }

    const finalBatch=writeBatch(db);
    if(joinCode) finalBatch.delete(doc(db,'joinCodes',joinCode));
    finalBatch.delete(doc(db,'quizzes',id));
    await finalBatch.commit();

    localStorage.removeItem('stpHostQuiz');
    state.detailGeneration++;
    cleanupDetails();
    state.quiz=null;state.rounds=[];state.teams=[];state.submissions=[];state.jokerClaims=[];
    state.hostRounds.clear();state.marks.clear();state.markContext=null;
    renderAll();
    toast('Quiz deleted');
  }catch(e){
    console.error('Delete quiz failed',e);
    toast('Could not delete quiz: '+(e?.message||e));
  }finally{
    btn.disabled=false;btn.textContent='Delete quiz';
  }
};

function renderAll(){
  if(!state.quiz){$('#quizSummary').innerHTML='<p class="muted">Create a quiz to get started.</p>';$('#joinCode').textContent='------';return}
  $('#quizSelect').value=state.quiz.id;
  $('#joinCode').textContent=state.quiz.joinCode||'------';
  $('#quizSummary').innerHTML=`<h2 style="margin-bottom:6px">${escapeHtml(state.quiz.title)}</h2><div class="actions"><span class="pill">${state.rounds.length} rounds</span><span class="pill">${state.teams.length} teams</span><span class="pill">${state.quiz.joinOpen?'Joining open':'Joining closed'}</span></div>`;
  $('#presentLink').href=`present.html?quiz=${encodeURIComponent(state.quiz.id)}`;
  $('#toggleJoinBtn').textContent=state.quiz.joinOpen?'Close joining':'Open joining';
  $('#teamCount').textContent=`${state.teams.length} team${state.teams.length===1?'':'s'}`;
  $('#quizTitleInput').value=state.quiz.title||'';$('#revealTopNInput').value=state.quiz.revealTopN??5;renderRoundLists();renderLivePanel();renderLeaderboard();renderTeamManager();renderMarkHeader();
}

$('#copyJoinBtn').onclick=async()=>{if(!state.quiz)return;const url=new URL('team.html',location.href);url.searchParams.set('code',state.quiz.joinCode);await navigator.clipboard.writeText(url.href);toast('Team link copied')};
$('#toggleJoinBtn').onclick=()=>state.quiz&&updateDoc(doc(db,'quizzes',quizId()),{joinOpen:!state.quiz.joinOpen,updatedAt:serverTimestamp()});

function renderRoundLists(){
  const live=$('#liveRoundList'), build=$('#buildRoundList');
  if(!state.rounds.length){live.innerHTML=build.innerHTML='<p class="muted">No rounds yet.</p>';return}
  live.innerHTML=state.rounds.map((r,i)=>`<div class="list-row ${r.id===state.quiz.currentRoundId?'active':''}"><div><strong>${r.icon||'🎲'} ${i+1}. ${escapeHtml(r.title)}</strong><div class="muted tiny">${escapeHtml(r.type)} • ${r.questionCount||0} questions • <span class="status-${r.status}">${r.status||'closed'}</span></div></div><button class="btn ghost" data-live-round="${r.id}">Select</button></div>`).join('');
  build.innerHTML=state.rounds.map((r,i)=>`<div class="list-row ${r.id===state.editRoundId?'active':''}"><div><strong>${r.icon||'🎲'} ${i+1}. ${escapeHtml(r.title)}</strong><div class="muted tiny">${r.questionCount||0} questions</div></div><div class="actions"><button class="btn ghost" data-move-round="${r.id}" data-dir="-1" ${i===0?'disabled':''}>↑</button><button class="btn ghost" data-move-round="${r.id}" data-dir="1" ${i===state.rounds.length-1?'disabled':''}>↓</button><button class="btn ghost" data-edit-round="${r.id}">Edit</button></div></div>`).join('');
  $$('[data-live-round]').forEach(b=>b.onclick=()=>setCurrentRound(b.dataset.liveRound));
  $$('[data-edit-round]').forEach(b=>b.onclick=()=>editRound(b.dataset.editRound));
  $$('[data-move-round]').forEach(b=>b.onclick=()=>moveRound(b.dataset.moveRound,Number(b.dataset.dir)));
}


async function moveRound(rid,dir){
  const idx=state.rounds.findIndex(r=>r.id===rid),j=idx+dir;if(idx<0||j<0||j>=state.rounds.length)return;
  const a=state.rounds[idx],b=state.rounds[j],batch=writeBatch(db);batch.update(doc(db,'quizzes',quizId(),'rounds',a.id),{order:b.order});batch.update(doc(db,'quizzes',quizId(),'rounds',b.id),{order:a.order});await batch.commit();
}

$('#saveQuizSettingsBtn').onclick=async()=>{
  if(!state.quiz)return;const title=$('#quizTitleInput').value.trim()||'Untitled Pub Quiz';const revealTopN=Math.max(0,Number($('#revealTopNInput').value||0));await updateDoc(doc(db,'quizzes',quizId()),{title,revealTopN,updatedAt:serverTimestamp()});toast('Quiz settings saved');
};

async function setCurrentRound(rid){
  const batch=writeBatch(db);
  const old=currentRound();
  if(old && old.id!==rid && ['open','ready'].includes(old.status)) batch.update(doc(db,'quizzes',quizId(),'rounds',old.id),{status:'closed'});
  batch.update(doc(db,'quizzes',quizId()),{currentRoundId:rid,revealLeaderboard:false,timerEndsAt:null,updatedAt:serverTimestamp()});
  batch.update(doc(db,'quizzes',quizId(),'rounds',rid),{status:'ready',currentQuestion:0});
  await batch.commit();
}

function hostAnswerText(q){
  if(!q)return'';
  if(q.answerMode==='split')return(q.partAnswers||[]).map(p=>`${p.label}: ${(p.accepted||[])[0]||'—'}`).join(' • ');
  if(['number','closest'].includes(q.answerMode))return String(q.numericAnswer??'—');
  return (q.accepted||[])[0]||'—';
}

function currentRoundSubmissions(){const r=currentRound();return r?state.submissions.filter(s=>s.roundId===r.id):[]}
function currentRoundClaims(){const r=currentRound();return r?state.jokerClaims.filter(j=>j.roundId===r.id):[]}

function renderLivePanel(){
  const r=currentRound(), box=$('#currentRoundPanel');
  if(!r){box.innerHTML='<p class="muted">Select a round to begin.</p>';return}
  const subs=currentRoundSubmissions();
  const submitted=new Set(subs.map(s=>s.teamUid));
  const waiting=state.teams.filter(t=>!submitted.has(t.uid));
  const timer=state.quiz.timerEndsAt?Math.max(0,state.quiz.timerEndsAt-Date.now()):null;
  const hostRound=state.hostRounds.get(r.id);
  if(!hostRound){
    loadHostRound(r.id).then(()=>renderLivePanel()).catch(e=>console.error('Host media preview failed',e));
  }
  const currentIndex=Math.max(0,Math.min((r.currentQuestion||0),(r.questionCount||1)-1));
  const currentHostQuestion=hostRound?.questions?.[currentIndex];
  const currentMedia=currentHostQuestion?.mediaUrl||'';
  const mediaPreview=currentMedia
    ? `<div class="card" style="margin-top:12px;padding:12px"><div class="muted tiny" style="margin-bottom:8px">HOST PREVIEW — ITEM ${currentIndex+1}</div><div style="max-height:360px;overflow:auto">${mediaEmbed(currentMedia)}</div></div>`
    : `<div class="card" style="margin-top:12px;padding:12px"><div class="muted tiny">HOST PREVIEW — ITEM ${currentIndex+1}</div><p class="muted" style="margin-bottom:0">No media on this item. The projector will show the question number only.</p></div>`;
  box.innerHTML=`<div class="muted tiny">CURRENT ROUND</div><h2>${r.icon||'🎲'} ${escapeHtml(r.title)}</h2><p>${escapeHtml(r.instructions||'')}</p><div class="actions"><span class="pill">Status: <strong class="status-${r.status}">${r.status}</strong></span><span class="pill">${subs.length}/${state.teams.length} submitted</span><span class="pill">${currentRoundClaims().length} joker${currentRoundClaims().length===1?'':'s'}</span></div><div class="divider"></div><div class="actions"><button class="btn primary" id="readyBtn">Ready</button><button class="btn good" id="openBtn">Open answers</button><button class="btn danger" id="lockBtn">Lock round</button><button class="btn ghost" id="revealBtn">Reveal answers</button></div><div class="divider"></div><div class="card" style="padding:14px;background:#091525"><div class="muted tiny">READ ALOUD — QUESTION ${currentIndex+1}</div><div style="font-size:1.12rem;font-weight:850;line-height:1.35;margin-top:7px">${escapeHtml(currentHostQuestion?.prompt||`Question ${currentIndex+1}`)}</div>${currentHostQuestion?.hostLink?`<div class="actions" style="margin-top:12px"><a class="btn good" target="_blank" rel="noopener noreferrer" href="${escapeHtml(currentHostQuestion.hostLink)}">▶ ${escapeHtml(currentHostQuestion.hostLinkLabel||'Open media')}</a></div>`:''}<div style="margin-top:12px;padding:10px 12px;border-radius:10px;background:#102235;border:1px solid #27415f"><div class="muted tiny">HOST ANSWER</div><div style="font-weight:900;font-size:1.05rem;margin-top:4px">${escapeHtml(hostAnswerText(currentHostQuestion))}</div></div></div><div class="divider"></div><h3>Current item</h3><p class="muted tiny">Question text above is host-only. The projector shows only media or the question number.</p><div class="actions"><button class="btn ghost" id="prevQBtn">← Previous item</button><span class="pill">Item ${Math.min((r.currentQuestion||0)+1,r.questionCount||1)} / ${r.questionCount||0}</span><button class="btn ghost" id="nextQBtn">Next item →</button></div>${mediaPreview}<div class="divider"></div><h3>Timer</h3><div class="actions"><button class="btn ghost" data-timer="30">30 sec</button><button class="btn ghost" data-timer="60">60 sec</button><button class="btn ghost" data-timer="90">90 sec</button><button class="btn ghost" data-timer="0">Stop</button>${timer!==null?`<span class="pill">Timer running</span>`:''}</div><div class="divider"></div><h3>Still waiting</h3><p class="muted">${waiting.length?waiting.map(t=>escapeHtml(t.name)).join(', '):'Everyone has submitted.'}</p>`;
  $('#readyBtn').onclick=()=>setRoundStatus('ready');
  $('#openBtn').onclick=()=>setRoundStatus('open');
  $('#lockBtn').onclick=()=>setRoundStatus('locked');
  $('#revealBtn').onclick=()=>setRoundStatus('revealed');
  $('#prevQBtn').onclick=()=>moveQuestion(-1);$('#nextQBtn').onclick=()=>moveQuestion(1);
  $$('[data-timer]',box).forEach(b=>b.onclick=()=>setTimer(Number(b.dataset.timer)));
}
async function setRoundStatus(status){
  const r=currentRound();if(!r)return;
  await updateDoc(doc(db,'quizzes',quizId(),'rounds',r.id),{status});
  if(status==='locked'){
    $('.tab').forEach(x=>x.classList.remove('active'));
    document.querySelector('[data-tab="mark"]')?.classList.add('active');
    $('.tab-panel').forEach(p=>p.classList.add('hidden'));
    $('#tab-mark')?.classList.remove('hidden');
    toast('Round locked — marking automatically…');
    await prepareMarking();
    await autoMark();
  }
}
async function moveQuestion(delta){const r=currentRound();if(!r)return;const next=Math.max(0,Math.min((r.questionCount||1)-1,(r.currentQuestion||0)+delta));await updateDoc(doc(db,'quizzes',quizId(),'rounds',r.id),{currentQuestion:next})}
async function setTimer(seconds){await updateDoc(doc(db,'quizzes',quizId()),{timerEndsAt:seconds?Date.now()+seconds*1000:null})}

$$('.tab').forEach(btn=>btn.onclick=()=>{ $$('.tab').forEach(x=>x.classList.remove('active'));btn.classList.add('active');$$('.tab-panel').forEach(p=>p.classList.add('hidden'));$(`#tab-${btn.dataset.tab}`).classList.remove('hidden');if(btn.dataset.tab==='mark')prepareMarking(); });

$('#addRoundBtn').onclick=async()=>{
  if(!state.quiz)return; const rid=randomId('round_'), order=state.rounds.length;
  await setDoc(doc(db,'quizzes',quizId(),'rounds',rid),{title:'New Round',icon:'🎲',type:'standard',instructions:'',order,status:'closed',currentQuestion:0,questionCount:1,inputs:[{id:'q1',label:'Question 1',mode:'text',partLabels:[],choices:[],placeholder:''}],jokerAllowed:true,maxPoints:1});
  await setDoc(doc(db,'quizzes',quizId(),'hostRounds',rid),{questions:[{id:'q1',prompt:'Question 1',answerMode:'text',accepted:['answer'],points:1}],closestScoring:[3,2,1]});
  editRound(rid);
};

async function editRound(rid){
  state.editRoundId=rid; const pub=state.rounds.find(r=>r.id===rid); if(!pub)return;
  const snap=await getDoc(doc(db,'quizzes',quizId(),'hostRounds',rid));
  state.editing={...structuredClone(pub),questions:structuredClone(snap.data()?.questions||[]),closestScoring:structuredClone(snap.data()?.closestScoring||[3,2,1])};
  renderRoundLists();renderRoundEditor();
}

function renderRoundEditor(){
  const r=state.editing, el=$('#roundEditor'); if(!r){el.innerHTML='<p class="muted">Choose a round to edit it.</p>';return}
  el.innerHTML=`<div class="actions" style="justify-content:space-between"><h2>Edit round</h2><div class="actions"><button id="deleteRoundBtn" class="btn danger">Delete</button><button id="saveRoundBtn" class="btn good">Save round</button></div></div><div class="grid two"><div class="field"><label>Round title</label><input id="roundTitle" value="${escapeHtml(r.title)}"></div><div class="field"><label>Icon / emoji</label><input id="roundIcon" value="${escapeHtml(r.icon||'🎲')}"></div></div><div class="field" style="margin-top:10px"><label>Instructions teams can see</label><textarea id="roundInstructions">${escapeHtml(r.instructions||'')}</textarea></div><div class="grid two" style="margin-top:10px"><div class="field"><label>Round type</label><select id="roundType">${['standard','picture','music','choice','connection','closest'].map(x=>`<option ${r.type===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="field"><label>Joker</label><select id="jokerAllowed"><option value="yes" ${r.jokerAllowed!==false?'selected':''}>Allowed</option><option value="no" ${r.jokerAllowed===false?'selected':''}>Not allowed</option></select></div></div><div class="divider"></div><div class="actions" style="justify-content:space-between"><h3>Questions</h3><button id="addQuestionBtn" class="btn primary">+ Add question</button></div><div id="questionEditors" class="round-editor">${r.questions.map((q,i)=>questionEditorHtml(q,i)).join('')}</div>`;
  $('#addQuestionBtn').onclick=()=>{collectRoundForm();state.editing.questions.push({id:randomId('q_'),prompt:`Question ${state.editing.questions.length+1}`,answerMode:'text',accepted:[''],points:1});renderRoundEditor()};
  $('#saveRoundBtn').onclick=saveRound;
  $('#deleteRoundBtn').onclick=deleteCurrentRound;
  $$('[data-del-q]',el).forEach(b=>b.onclick=()=>{collectRoundForm();state.editing.questions.splice(Number(b.dataset.delQ),1);renderRoundEditor()});
  $$('[data-mode]',el).forEach(s=>s.onchange=()=>{collectRoundForm();renderRoundEditor()});
}

function questionEditorHtml(q,i){
  const mode=q.answerMode||'text';
  let answerFields='';
  if(['text','choice'].includes(mode)) answerFields=`<div class="field"><label>Accepted answers (one per line)</label><textarea data-q="${i}" data-f="accepted">${escapeHtml((q.accepted||[]).join('\n'))}</textarea></div>${mode==='choice'?`<div class="field"><label>Choices (one per line)</label><textarea data-q="${i}" data-f="choices">${escapeHtml((q.choices||['A','B','C','D']).join('\n'))}</textarea></div>`:''}`;
  if(['number','closest'].includes(mode)) answerFields=`<div class="grid two"><div class="field"><label>${mode==='closest'?'Target number':'Correct number'}</label><input type="number" step="any" data-q="${i}" data-f="numericAnswer" value="${q.numericAnswer??''}"></div><div class="field"><label>${mode==='closest'?'Closest rule':'Tolerance ±'}</label>${mode==='closest'?`<select data-q="${i}" data-f="closestRule"><option value="absolute" ${(q.closestRule||'absolute')==='absolute'?'selected':''}>Closest either side</option><option value="withoutGoingOver" ${q.closestRule==='withoutGoingOver'?'selected':''}>Closest without going over</option></select>`:`<input type="number" step="any" data-q="${i}" data-f="tolerance" value="${q.tolerance??0}">`}</div></div>`;
  if(mode==='split') answerFields=`<div class="grid two"><div class="field"><label>Part 1 label</label><input data-q="${i}" data-f="part1label" value="${escapeHtml(q.partAnswers?.[0]?.label||'Song')}"></div><div class="field"><label>Part 1 accepted answers</label><textarea data-q="${i}" data-f="part1answers">${escapeHtml((q.partAnswers?.[0]?.accepted||[]).join('\n'))}</textarea></div><div class="field"><label>Part 2 label</label><input data-q="${i}" data-f="part2label" value="${escapeHtml(q.partAnswers?.[1]?.label||'Artist')}"></div><div class="field"><label>Part 2 accepted answers</label><textarea data-q="${i}" data-f="part2answers">${escapeHtml((q.partAnswers?.[1]?.accepted||[]).join('\n'))}</textarea></div></div>`;
  return `<details class="question-editor" open><summary>Q${i+1}: ${escapeHtml(q.prompt||'Untitled')}</summary><div class="q-grid"><div class="field"><label>Question / host prompt</label><textarea data-q="${i}" data-f="prompt">${escapeHtml(q.prompt||'')}</textarea></div><div><div class="field"><label>Answer mode</label><select data-q="${i}" data-f="answerMode" data-mode>${['text','choice','number','split','closest'].map(x=>`<option ${mode===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="field" style="margin-top:8px"><label>Points</label><input type="number" min="0" step="0.5" data-q="${i}" data-f="points" value="${q.points??1}"></div></div></div><div class="field" style="margin-top:10px"><label>Image / audio / video / YouTube URL (optional)</label><input data-q="${i}" data-f="mediaUrl" value="${escapeHtml(q.mediaUrl||'')}"></div><div style="margin-top:10px">${answerFields}</div><div class="actions" style="margin-top:10px"><button class="btn danger" data-del-q="${i}">Remove question</button></div></details>`;
}

function collectRoundForm(){
  const r=state.editing;if(!r)return;
  r.title=$('#roundTitle')?.value??r.title;r.icon=$('#roundIcon')?.value??r.icon;r.instructions=$('#roundInstructions')?.value??r.instructions;r.type=$('#roundType')?.value??r.type;r.jokerAllowed=$('#jokerAllowed')?.value!=='no';
  $$('[data-q]').forEach(el=>{const i=Number(el.dataset.q), f=el.dataset.f, q=r.questions[i];if(!q)return;const v=el.value;if(f==='accepted'||f==='choices')q[f]=v.split('\n').map(x=>x.trim()).filter(Boolean);else if(f==='points'||f==='numericAnswer'||f==='tolerance')q[f]=v===''?'':Number(v);else if(f==='part1label'||f==='part1answers'||f==='part2label'||f==='part2answers'){}else q[f]=v;});
  r.questions.forEach((q,i)=>{if(q.answerMode==='split'){const p1l=$(`[data-q="${i}"][data-f="part1label"]`)?.value||'Part 1',p2l=$(`[data-q="${i}"][data-f="part2label"]`)?.value||'Part 2';const p1a=($(`[data-q="${i}"][data-f="part1answers"]`)?.value||'').split('\n').map(x=>x.trim()).filter(Boolean),p2a=($(`[data-q="${i}"][data-f="part2answers"]`)?.value||'').split('\n').map(x=>x.trim()).filter(Boolean);q.partAnswers=[{label:p1l,accepted:p1a,points:Number(q.points||2)/2},{label:p2l,accepted:p2a,points:Number(q.points||2)/2}]}});
}

async function saveRound(){
  collectRoundForm();const r=state.editing;if(!r)return;
  const inputs=r.questions.map(inputDescriptor),maxPoints=r.questions.reduce((s,q)=>s+Number(q.points||1),0);
  await updateDoc(doc(db,'quizzes',quizId(),'rounds',r.id),{title:r.title,icon:r.icon,type:r.type,instructions:r.instructions,jokerAllowed:r.jokerAllowed,questionCount:r.questions.length,inputs,maxPoints});
  await setDoc(doc(db,'quizzes',quizId(),'hostRounds',r.id),{questions:r.questions,closestScoring:r.closestScoring||[3,2,1]});toast('Round saved');
}
async function deleteCurrentRound(){
  const r=state.editing;if(!r||!confirm(`Delete “${r.title}”?`))return;
  const batch=writeBatch(db);batch.delete(doc(db,'quizzes',quizId(),'rounds',r.id));batch.delete(doc(db,'quizzes',quizId(),'hostRounds',r.id));if(state.quiz.currentRoundId===r.id)batch.update(doc(db,'quizzes',quizId()),{currentRoundId:null});await batch.commit();state.editing=null;state.editRoundId=null;renderRoundEditor();toast('Round deleted');
}

function renderMarkHeader(){const r=currentRound();$('#markSubtitle').textContent=r?`${r.title} • ${currentRoundSubmissions().length} submissions • status: ${r.status}`:'Select a round first.'}
async function loadHostRound(rid){if(state.hostRounds.has(rid))return state.hostRounds.get(rid);const snap=await getDoc(doc(db,'quizzes',quizId(),'hostRounds',rid));const data=snap.data()||{questions:[]};state.hostRounds.set(rid,data);return data}

async function prepareMarking(){
  const r=currentRound(), area=$('#markingArea');state.marks.clear();state.markContext=null;if(!r){area.innerHTML='<p class="muted">Select a round first.</p>';return}
  const host=await loadHostRound(r.id), subs=currentRoundSubmissions();
  if(!subs.length){area.innerHTML='<p class="muted">No teams have submitted this round yet.</p>';$('#autoMarkBtn').disabled=true;$('#saveMarksBtn').disabled=true;return}
  state.markContext={round:r,host,subs};
  area.innerHTML=subs.map(s=>`<div class="card" style="margin-top:12px"><div class="actions" style="justify-content:space-between"><h3>${escapeHtml(teamName(s.teamUid))}</h3><span class="pill" data-team-total="${s.teamUid}">Not marked</span></div><div id="mark-${s.teamUid}" class="answer-grid"></div></div>`).join('');
  $('#autoMarkBtn').disabled=false;$('#saveMarksBtn').disabled=true;
}

$('#autoMarkBtn').onclick=()=>autoMark();

async function autoMark(){
  const ctx=state.markContext;if(!ctx||state.aiMarking)return;
  const btn=$('#autoMarkBtn');
  state.aiMarking=true;
  btn.disabled=true;
  btn.textContent='Marking…';
  $('#saveMarksBtn').disabled=true;
  try{
    if(ctx.round.type==='closest'){
      autoMarkClosest(ctx);
      toast('Automatic marking complete');
    }else{
      await autoMarkStandard(ctx);
    }
    $('#saveMarksBtn').disabled=false;
  }catch(e){
    console.error('Automatic marking failed',e);
    const detail=(e?.message||String(e)).slice(0,500);
    toast('AI check unavailable — see error on Mark screen');
    const area=$('#markingArea');
    if(area){
      const err=document.createElement('div');
      err.className='card';
      err.style.cssText='margin-top:12px;border:1px solid #8a3540;background:#32171c';
      err.innerHTML='<strong>AI marking error</strong><div class="muted tiny" style="margin-top:6px;word-break:break-word"></div>';
      err.querySelector('div').textContent=detail;
      area.prepend(err);
    }
    if(state.marks.size)$('#saveMarksBtn').disabled=false;
  }finally{
    state.aiMarking=false;
    btn.disabled=false;
    btn.textContent='Re-run marking';
  }
}

async function autoMarkStandard(ctx){
  const aiItems=[];
  ctx.subs.forEach(sub=>{
    const results=ctx.host.questions.map((q,i)=>markOne(q,sub.answers?.[i]));
    const claim=state.jokerClaims.find(j=>j.teamUid===sub.teamUid&&j.roundId===ctx.round.id);
    const team=state.teams.find(t=>t.uid===sub.teamUid);
    const mult=claim&&!team?.jokerUsedRoundId?2:1;
    state.marks.set(sub.teamUid,{results,mult,sub});
    renderTeamMarks(sub.teamUid,ctx.host.questions,results,mult);

    ctx.host.questions.forEach((q,i)=>{
      const mode=q.answerMode||'text';
      const response=sub.answers?.[i];
      const result=results[i];
      if(mode!=='text'||result.status==='correct')return;
      const answer=String(response??'').trim();
      if(!answer)return;
      aiItems.push({
        id:sub.id+':'+i,
        teamUid:sub.teamUid,
        questionIndex:i,
        question:q.prompt||('Question '+(i+1)),
        expectedAnswers:(q.accepted||[]).map(String).filter(Boolean),
        studentAnswer:answer
      });
    });
  });

  if(!aiItems.length){
    toast('Automatic marking complete — no AI checks needed');
    return;
  }

  toast('Checking '+aiItems.length+' answer'+(aiItems.length===1?'':'s')+' with AI…');
  const judgements=await judgeQuizAnswers(aiItems);

  for(const item of aiItems){
    const judgement=judgements.get(item.id);
    if(!judgement)continue;
    const entry=state.marks.get(item.teamUid);
    const res=entry?.results?.[item.questionIndex];
    const q=ctx.host.questions[item.questionIndex];
    if(!entry||!res||!q)continue;
    if(judgement.verdict==='correct'){
      res.points=Number(q.points??1);
      res.status='correct';
      res.note='AI accepted: '+judgement.reason;
    }else if(judgement.verdict==='review'){
      res.points=0;
      res.status='review';
      res.note='AI review: '+judgement.reason;
    }else{
      res.points=0;
      res.status='wrong';
      res.note='AI checked: '+judgement.reason;
    }
  }

  for(const sub of ctx.subs){
    const entry=state.marks.get(sub.teamUid);
    if(entry)renderTeamMarks(sub.teamUid,ctx.host.questions,entry.results,entry.mult);
  }

  const reviews=[...state.marks.values()].reduce((n,e)=>n+e.results.filter(r=>r.status==='review').length,0);
  toast(reviews?'AI marking complete — '+reviews+' answer'+(reviews===1?'':'s')+' need teacher review':'AI marking complete');
}
function autoMarkClosest(ctx){
  const scoring=ctx.host.closestScoring||[3,2,1];const resultsByTeam=new Map(ctx.subs.map(s=>[s.teamUid,ctx.host.questions.map(()=>({points:0,status:'wrong',note:''}))]));
  ctx.host.questions.forEach((q,qi)=>{
    const target=Number(q.numericAnswer);
    const ranked=ctx.subs.map(s=>{const n=Number(s.answers?.[qi]);let d=Number.isFinite(n)?Math.abs(n-target):Infinity;if(q.closestRule==='withoutGoingOver'&&n>target)d=Infinity;return{uid:s.teamUid,n,d}}).sort((a,b)=>a.d-b.d);
    ranked.forEach((item,index)=>{const tiedFirst=ranked.findIndex(x=>x.d===item.d);const pts=Number.isFinite(item.d)?Number(scoring[tiedFirst]||0):0;resultsByTeam.get(item.uid)[qi]={points:pts,status:pts?'correct':'wrong',note:Number.isFinite(item.d)?`Answer ${item.n}; distance ${item.d}`:'Invalid / over target'};});
  });
  ctx.subs.forEach(sub=>{const results=resultsByTeam.get(sub.teamUid);state.marks.set(sub.teamUid,{results,mult:1,sub});renderTeamMarks(sub.teamUid,ctx.host.questions,results,1)});
}

function renderTeamMarks(uid,questions,results,mult){
  const box=$(`#mark-${CSS.escape(uid)}`);if(!box)return;
  const sub=state.marks.get(uid)?.sub;box.innerHTML=questions.map((q,i)=>{const res=results[i],answer=Array.isArray(sub.answers?.[i])?sub.answers[i].join(' / '):(sub.answers?.[i]??'');return `<div class="answer-row ${res.status}"><div class="mark-grid"><div><strong>Q${i+1}</strong><div class="muted tiny">${escapeHtml(q.prompt)}</div></div><div><div>Team: <strong>${escapeHtml(answer)}</strong></div><div class="muted tiny">${escapeHtml(res.note||'')}</div></div><div class="field"><label>Points</label><input type="number" min="0" step="0.5" value="${res.points}" data-mark-uid="${uid}" data-mark-i="${i}"></div></div></div>`}).join('');
  const raw=results.reduce((s,r)=>s+Number(r.points||0),0);$(`[data-team-total="${CSS.escape(uid)}"]`).textContent=`${formatScore(raw)}${mult===2?' × 2 joker':''}`;
  $$(`[data-mark-uid="${CSS.escape(uid)}"]`).forEach(inp=>inp.oninput=()=>{const entry=state.marks.get(uid);entry.results[Number(inp.dataset.markI)].points=Number(inp.value||0);const raw2=entry.results.reduce((s,r)=>s+Number(r.points||0),0);$(`[data-team-total="${CSS.escape(uid)}"]`).textContent=`${formatScore(raw2)}${entry.mult===2?' × 2 joker':''}`;});
}

$('#saveMarksBtn').onclick=async()=>{
  const ctx=state.markContext;if(!ctx||!state.marks.size)return;
  const existingMarked=state.submissions.filter(s=>s.marked&&s.roundId!==ctx.round.id);
  const totals=new Map(state.teams.map(t=>[t.uid,Number(t.manualAdjustment||0)]));
  existingMarked.forEach(s=>totals.set(s.teamUid,(totals.get(s.teamUid)||0)+Number(s.score||0)));
  const batch=writeBatch(db);
  for(const [uid,entry] of state.marks){
    const raw=entry.results.reduce((s,r)=>s+Number(r.points||0),0),score=raw*entry.mult;
    totals.set(uid,(totals.get(uid)||0)+score);
    batch.update(doc(db,'quizzes',quizId(),'submissions',entry.sub.id),{marked:true,markResults:entry.results,rawScore:raw,jokerMultiplier:entry.mult,score,markedAt:serverTimestamp()});
    if(entry.mult===2) batch.update(doc(db,'quizzes',quizId(),'teams',uid),{jokerUsedRoundId:ctx.round.id});
  }
  state.teams.forEach(t=>{const score=totals.get(t.uid)||0;batch.update(doc(db,'quizzes',quizId(),'teams',t.uid),{totalScore:score});batch.set(doc(db,'quizzes',quizId(),'leaderboard',t.uid),{name:t.name,score},{merge:true});});
  batch.update(doc(db,'quizzes',quizId(),'rounds',ctx.round.id),{status:'marked'});
  await batch.commit();toast('Scores saved');$('#saveMarksBtn').disabled=true;
};

function renderLeaderboard(){
  const sorted=[...state.teams].sort((a,b)=>(b.totalScore||0)-(a.totalScore||0));
  $('#hostLeaderboard').innerHTML=sorted.length?sorted.map((t,i)=>`<div class="leader-row"><div class="place">${i+1}</div><div class="name">${escapeHtml(t.name)}</div><div class="score">${formatScore(t.totalScore)}</div></div>`).join(''):'<p class="muted">No teams yet.</p>';

  const live=!!state.quiz?.revealLeaderboard;
  $('#toggleLeaderboardBtn').textContent=live?'Hide leaderboard':'Reveal leaderboard';
  const badge=$('#leaderboardVisibility');
  if(badge){
    badge.textContent=live?'🟢 LIVE on projector':'⚫ Hidden from projector';
    badge.classList.toggle('status-open',live);
  }
}

$('#toggleLeaderboardBtn').onclick=async()=>{
  if(!state.quiz)return;
  const btn=$('#toggleLeaderboardBtn');
  const revealing=!state.quiz.revealLeaderboard;
  btn.disabled=true;
  try{
    // Keep the public leaderboard snapshot in sync before making it visible.
    if(revealing){
      const batch=writeBatch(db);
      state.teams.forEach(t=>{
        batch.set(
          doc(db,'quizzes',quizId(),'leaderboard',t.uid),
          {name:t.name,score:Number(t.totalScore||0)},
          {merge:true}
        );
      });
      batch.update(doc(db,'quizzes',quizId()),{revealLeaderboard:true,updatedAt:serverTimestamp()});
      await batch.commit();
      toast('Leaderboard is now LIVE on the projector');
    }else{
      await updateDoc(doc(db,'quizzes',quizId()),{revealLeaderboard:false,updatedAt:serverTimestamp()});
      toast('Leaderboard hidden from the projector');
    }
  }catch(e){
    console.error('Leaderboard toggle failed',e);
    toast('Leaderboard error: '+(e?.message||e));
  }finally{
    btn.disabled=false;
  }
};

function renderTeamManager(){
  $('#teamManager').innerHTML=state.teams.length?state.teams.map(t=>`<div class="list-row"><div><strong>${escapeHtml(t.name)}</strong><div class="muted tiny">${t.jokerUsedRoundId?'Joker used':'Joker available'} • adjustment ${formatScore(t.manualAdjustment||0)}</div></div><div class="actions"><button class="btn ghost" data-adjust="${t.uid}">Adjust</button><button class="btn danger" data-remove-team="${t.uid}">Remove</button></div></div>`).join(''):'<p class="muted">No teams have joined.</p>';
  $$('[data-adjust]').forEach(b=>b.onclick=async()=>{const t=state.teams.find(x=>x.uid===b.dataset.adjust);const val=prompt(`Manual score adjustment for ${t.name}`,String(t.manualAdjustment||0));if(val===null)return;const n=Number(val);if(!Number.isFinite(n))return toast('Enter a number');const marked=state.submissions.filter(s=>s.teamUid===t.uid&&s.marked).reduce((s,x)=>s+Number(x.score||0),0);await updateDoc(doc(db,'quizzes',quizId(),'teams',t.uid),{manualAdjustment:n,totalScore:marked+n});await setDoc(doc(db,'quizzes',quizId(),'leaderboard',t.uid),{name:t.name,score:marked+n},{merge:true})});
  $$('[data-remove-team]').forEach(b=>b.onclick=async()=>{const t=state.teams.find(x=>x.uid===b.dataset.removeTeam);if(confirm(`Remove ${t.name}?`)){await deleteDoc(doc(db,'quizzes',quizId(),'teams',t.uid));await deleteDoc(doc(db,'quizzes',quizId(),'leaderboard',t.uid)).catch(()=>{})}});
}

// Keyboard shortcuts for fast live hosting.
document.addEventListener('keydown',e=>{
  if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;
  if(e.key==='ArrowRight')moveQuestion(1); if(e.key==='ArrowLeft')moveQuestion(-1);
  if(e.key.toLowerCase()==='o')setRoundStatus('open'); if(e.key.toLowerCase()==='l')setRoundStatus('locked');
});
