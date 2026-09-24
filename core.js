export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}
export function slugifyCode(value = '') { return String(value).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); }
export function randomCode(length = 6) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let out = '';
  crypto.getRandomValues(new Uint32Array(length)).forEach(n => out += alphabet[n % alphabet.length]); return out;
}
export function randomId(prefix = '') { return prefix + crypto.randomUUID().replaceAll('-', '').slice(0, 16); }
export function normalizeAnswer(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/^the\s+/, '').replace(/&/g, 'and').replace(/[^a-z0-9.+\-/\s]/g, '').replace(/\s+/g, ' ');
}
export function levenshtein(a = '', b = '') {
  a = normalizeAnswer(a); b = normalizeAnswer(b); const m=a.length,n=b.length; if(!m)return n;if(!n)return m;
  const prev=Array.from({length:n+1},(_,i)=>i),cur=new Array(n+1);
  for(let i=1;i<=m;i++){cur[0]=i;for(let j=1;j<=n;j++){const cost=a[i-1]===b[j-1]?0:1;cur[j]=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+cost);}for(let j=0;j<=n;j++)prev[j]=cur[j];} return prev[n];
}

// Damerau-Levenshtein also treats an adjacent letter swap as one typo,
// e.g. "jupitre" → "jupiter".
export function typoDistance(a = '', b = '') {
  a = normalizeAnswer(a); b = normalizeAnswer(b);
  const m=a.length,n=b.length;
  if(!m)return n;if(!n)return m;
  const d=Array.from({length:m+1},()=>Array(n+1).fill(0));
  for(let i=0;i<=m;i++)d[i][0]=i;
  for(let j=0;j<=n;j++)d[0][j]=j;
  for(let i=1;i<=m;i++){
    for(let j=1;j<=n;j++){
      const cost=a[i-1]===b[j-1]?0:1;
      d[i][j]=Math.min(
        d[i-1][j]+1,
        d[i][j-1]+1,
        d[i-1][j-1]+cost
      );
      if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1]){
        d[i][j]=Math.min(d[i][j],d[i-2][j-2]+1);
      }
    }
  }
  return d[m][n];
}
export function similarity(a,b){const x=normalizeAnswer(a),y=normalizeAnswer(b);if(!x&&!y)return 1;const maxLen=Math.max(x.length,y.length);return maxLen?1-typoDistance(x,y)/maxLen:0;}
export function markOne(question,response){
  const max=Number(question.points??1),mode=question.answerMode||'text';
  if(mode==='number'){const got=Number(response),target=Number(question.numericAnswer),tol=Math.abs(Number(question.tolerance??0));if(!Number.isFinite(got))return{points:0,status:'wrong',note:'Not a number'};return Math.abs(got-target)<=tol?{points:max,status:'correct',note:`Within ±${tol}`}:{points:0,status:'wrong',note:`Expected ${target}${tol?` ±${tol}`:''}`};}
  if(mode==='split'){const parts=Array.isArray(response)?response:[],keys=question.partAnswers||[];let points=0;const details=[];keys.forEach((key,i)=>{const accepted=(key.accepted||[]).map(normalizeAnswer),ok=accepted.includes(normalizeAnswer(parts[i]||'')),p=Number(key.points??1);if(ok)points+=p;details.push(ok?'correct':'wrong');});return{points,status:points===max?'correct':points?'partial':'wrong',note:details.join(', ')};}
  const accepted=(question.accepted||[]).map(normalizeAnswer).filter(Boolean),got=normalizeAnswer(response);
  if(accepted.includes(got))return{points:max,status:'correct',note:'Exact accepted answer'};

  let bestScore=0,bestDistance=Infinity,bestKey='';
  for(const key of accepted){
    const dist=typoDistance(got,key),score=similarity(got,key);
    if(score>bestScore || (score===bestScore && dist<bestDistance)){
      bestScore=score;bestDistance=dist;bestKey=key;
    }
  }

  // Auto-accept obvious typos, but be stricter with very short answers
  // so "bat" does not become "cat" just because one letter differs.
  const longest=Math.max(got.length,bestKey.length);
  const autoTypo =
    got &&
    (
      (longest>=4 && bestDistance===1) ||
      (longest>=8 && bestDistance<=2 && bestScore>=0.78)
    );

  if(autoTypo)return{
    points:max,
    status:'correct',
    note:`Accepted spelling variation → ${bestKey}`
  };

  if(got && (bestDistance<=2 || bestScore>=0.72))return{
    points:0,
    status:'review',
    note:`Possible spelling/near match → ${bestKey} (${Math.round(bestScore*100)}%)`
  };

  return{points:0,status:'wrong',note:'No accepted match'};
}
export function formatScore(value){const n=Number(value||0);return Number.isInteger(n)?String(n):n.toFixed(1).replace(/\.0$/,'');}
export function roundMaxPoints(round){return(round.questions||[]).reduce((sum,q)=>sum+Number(q.points??1),0);}
export function inputDescriptor(question,idx){const mode=question.answerMode||'text';return{id:question.id||`q${idx+1}`,label:question.shortLabel||`Question ${idx+1}`,mode,partLabels:mode==='split'?(question.partAnswers||[]).map((p,j)=>p.label||`Part ${j+1}`):[],choices:mode==='choice'?(question.choices||['A','B','C','D']):[],placeholder:question.placeholder||''};}
export function beep(freq=700,duration=.12){try{const ctx=new(window.AudioContext||window.webkitAudioContext)(),osc=ctx.createOscillator(),gain=ctx.createGain();osc.frequency.value=freq;osc.connect(gain);gain.connect(ctx.destination);gain.gain.setValueAtTime(.08,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+duration);osc.start();osc.stop(ctx.currentTime+duration);}catch{}}
export function msToClock(ms){const total=Math.max(0,Math.ceil(ms/1000)),m=Math.floor(total/60),s=total%60;return`${m}:${String(s).padStart(2,'0')}`;}
export function mediaEmbed(url=''){if(!url)return'';const safe=escapeHtml(url),yt=url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([A-Za-z0-9_-]{6,})/);if(yt)return`<div class="media-frame"><iframe src="https://www.youtube.com/embed/${yt[1]}" allow="autoplay; encrypted-media" allowfullscreen></iframe></div>`;if(/\.(mp3|wav|ogg|m4a)(\?|$)/i.test(url))return`<audio controls preload="metadata" src="${safe}"></audio>`;if(/\.(mp4|webm|mov)(\?|$)/i.test(url))return`<video controls preload="metadata" src="${safe}"></video>`;return`<img class="question-media" src="${safe}" alt="Question media">`;}
export const sampleQuiz={title:'Year 9 & 10 Pub Quiz',settings:{jokersPerTeam:1,revealTopN:5,allowTeamNames:true},rounds:[
{title:'Zoomed In',icon:'🔎',type:'picture',instructions:'Identify the object from the close-up image.',jokerAllowed:true,questions:Array.from({length:5},(_,i)=>({id:`zoom${i+1}`,prompt:`Zoomed-in image ${i+1}`,mediaUrl:'',answerMode:'text',accepted:['replace me'],points:1}))},
{title:'What on Earth?',icon:'🌍',type:'standard',instructions:'Weird but true general knowledge.',jokerAllowed:true,questions:[
{id:'weird1',prompt:'Which animal is famous for producing cube-shaped droppings?',answerMode:'text',accepted:['wombat','a wombat'],points:1},
{id:'weird2',prompt:'Which planet has the shortest day in our Solar System?',answerMode:'text',accepted:['jupiter'],points:1},
{id:'weird3',prompt:'What is the only mammal capable of true sustained flight?',answerMode:'text',accepted:['bat','bats'],points:1},
{id:'weird4',prompt:'What colour is a polar bear’s skin beneath its fur?',answerMode:'text',accepted:['black','dark','dark grey','dark gray'],points:1},
{id:'weird5',prompt:'What is the largest organ of the human body?',answerMode:'text',accepted:['skin','the skin'],points:1}]},
{title:'Name That Tune',icon:'🎵',type:'music',instructions:'Name the song and artist from the clip.',jokerAllowed:true,questions:Array.from({length:5},(_,i)=>({id:`music${i+1}`,prompt:`Play music clip ${i+1}`,mediaUrl:'',answerMode:'split',points:2,partAnswers:[{label:'Song',accepted:['replace me'],points:1},{label:'Artist',accepted:['replace me'],points:1}]}))},
{title:'Science or Nonsense?',icon:'🧪',type:'choice',instructions:'Decide whether each statement is true or false.',jokerAllowed:true,questions:[
{id:'sci1',prompt:'Wombat droppings can be cube-shaped.',answerMode:'choice',choices:['True','False'],accepted:['true'],points:1},
{id:'sci2',prompt:'Sound travels faster in air than in steel.',answerMode:'choice',choices:['True','False'],accepted:['false'],points:1},
{id:'sci3',prompt:'Octopuses have three hearts.',answerMode:'choice',choices:['True','False'],accepted:['true'],points:1},
{id:'sci4',prompt:'Lightning never strikes the same place twice.',answerMode:'choice',choices:['True','False'],accepted:['false'],points:1},
{id:'sci5',prompt:'A day on Venus is longer than a year on Venus.',answerMode:'choice',choices:['True','False'],accepted:['true'],points:1}]},
{title:'The Connection',icon:'🔗',type:'connection',instructions:'Answer the clues, then identify the connection.',jokerAllowed:true,questions:[
{id:'con1',prompt:'Connection set 1 — clue 1',answerMode:'text',accepted:['replace me'],points:1},{id:'con2',prompt:'Connection set 1 — clue 2',answerMode:'text',accepted:['replace me'],points:1},{id:'con3',prompt:'Connection set 1 — clue 3',answerMode:'text',accepted:['replace me'],points:1},{id:'con4',prompt:'Connection set 1 — clue 4',answerMode:'text',accepted:['replace me'],points:1},{id:'con5',prompt:'What connects all four answers?',answerMode:'text',accepted:['replace me'],points:2}]},
{title:'Mystery Sounds',icon:'🔊',type:'music',instructions:'Identify the sound.',jokerAllowed:true,questions:Array.from({length:5},(_,i)=>({id:`sound${i+1}`,prompt:`Mystery sound ${i+1}`,mediaUrl:'',answerMode:'text',accepted:['replace me'],points:1}))},
{title:'Picture Round',icon:'🖼️',type:'picture',instructions:'Identify each image.',jokerAllowed:true,questions:Array.from({length:8},(_,i)=>({id:`pic${i+1}`,prompt:`Picture ${i+1}`,mediaUrl:'',answerMode:'text',accepted:['replace me'],points:1}))},
{title:'Closest Wins',icon:'🎯',type:'closest',instructions:'Closest answer wins. Exact knowledge not required.',jokerAllowed:false,closestScoring:[3,2,1],questions:[
{id:'close1',prompt:'How many bones are in the adult human body?',answerMode:'closest',numericAnswer:206,points:3,closestRule:'absolute'},
{id:'close2',prompt:'Approximately how many kilometres is Earth’s equatorial circumference?',answerMode:'closest',numericAnswer:40075,points:3,closestRule:'absolute'},
{id:'close3',prompt:'How tall is the Sky Tower in Auckland, in metres?',answerMode:'closest',numericAnswer:328,points:3,closestRule:'absolute'}]}
]};