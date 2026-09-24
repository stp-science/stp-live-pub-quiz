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
  if(mode==='split'){
    const parts=Array.isArray(response)?response:[],keys=question.partAnswers||[];
    let points=0;const details=[];
    keys.forEach((key,i)=>{
      const accepted=(key.accepted||[]).map(normalizeAnswer).filter(Boolean);
      const got=normalizeAnswer(parts[i]||'');
      let ok=accepted.includes(got),spelling=false;
      if(!ok&&got){
        for(const ans of accepted){
          const dist=typoDistance(got,ans),score=similarity(got,ans),longest=Math.max(got.length,ans.length);
          if((longest>=4&&dist===1)||(longest>=8&&dist<=2&&score>=0.78)){ok=true;spelling=true;break;}
        }
      }
      const p=Number(key.points??1);
      if(ok)points+=p;
      details.push(ok?(spelling?'spelling accepted':'correct'):'wrong');
    });
    return{points,status:points===max?'correct':points?'partial':'wrong',note:details.join(', ')};
  }
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
export function mediaEmbed(url=''){
  if(!url)return'';
  const safe=escapeHtml(url);
  const yt=url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([A-Za-z0-9_-]{6,})/);
  if(yt){
    let extras='';
    try{
      const parsed=new URL(url);
      const start=Math.max(0,parseInt(parsed.searchParams.get('start')||'0',10)||0);
      const end=Math.max(0,parseInt(parsed.searchParams.get('end')||'0',10)||0);
      const bits=[];
      if(start)bits.push('start='+start);
      if(end)bits.push('end='+end);
      if(bits.length)extras='?'+bits.join('&');
    }catch(e){}
    return`<div class="media-frame"><iframe src="https://www.youtube.com/embed/${yt[1]}${extras}" allow="autoplay; encrypted-media" allowfullscreen></iframe></div>`;
  }
  const vm=url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if(vm)return`<div class="media-frame"><iframe src="https://player.vimeo.com/video/${vm[1]}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>`;
  const dm=url.match(/dailymotion\.com\/video\/([A-Za-z0-9]+)/);
  if(dm)return`<div class="media-frame"><iframe src="https://www.dailymotion.com/embed/video/${dm[1]}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>`;
  if(/\.(mp3|wav|ogg|m4a)(\?|$)/i.test(url))return`<audio controls preload="metadata" src="${safe}"></audio>`;
  if(/\.(mp4|webm|mov)(\?|$)/i.test(url))return`<video controls preload="metadata" src="${safe}"></video>`;
  return`<img class="question-media" src="${safe}" alt="Question media">`;
}
export const sampleQuiz={
  contentVersion:9,
  title:'Year 9 & 10 Pub Quiz 2026',
  settings:{jokersPerTeam:1,revealTopN:5,allowTeamNames:true},
  rounds:[
    {
      title:'Zoomed In',icon:'🔎',type:'picture',
      instructions:'Five extreme close-ups. Ask only: “What is this?”',
      jokerAllowed:true,
      questions:[
        {id:'zoom1',prompt:'What is this?',mediaUrl:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Tennis_ball_closeup.jpg',answerMode:'text',accepted:['tennis ball','a tennis ball'],points:1},
        {id:'zoom2',prompt:'What is this?',mediaUrl:'https://commons.wikimedia.org/wiki/Special:Redirect/file/LCD_pixels_RGB.jpg',answerMode:'text',accepted:['screen pixels','pixels','lcd pixels','display pixels','computer screen pixels','phone screen pixels','screen'],points:1},
        {id:'zoom3',prompt:'What is this?',mediaUrl:'https://commons.wikimedia.org/wiki/Special:Redirect/file/BallpointMacro.jpg',answerMode:'text',accepted:['ballpoint pen','pen tip','ballpoint pen tip','biro','biro tip','pen'],points:1},
        {id:'zoom4',prompt:'What is this?',mediaUrl:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Zipper_slider_0000_02.jpg',answerMode:'text',accepted:['zip','zipper','zipper slider','zip slider'],points:1},
        {id:'zoom5',prompt:'What is this?',mediaUrl:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Kiwifruit_skin..jpg',answerMode:'text',accepted:['kiwi fruit','kiwifruit','kiwi','kiwi skin','kiwifruit skin'],points:1}
      ]
    },
    {
      title:'What on Earth?',icon:'🌍',type:'standard',
      instructions:'Five weird-but-true general knowledge questions.',
      jokerAllowed:true,
      questions:[
        {id:'weird1',prompt:'Which country has more ancient pyramids than Egypt?',answerMode:'text',accepted:['sudan'],points:1},
        {id:'weird2',prompt:'Which animal has fingerprints remarkably similar to human fingerprints?',answerMode:'text',accepted:['koala','koalas','a koala'],points:1},
        {id:'weird3',prompt:'Which planet is less dense than water and would theoretically float in an ocean large enough?',answerMode:'text',accepted:['saturn'],points:1},
        {id:'weird4',prompt:'Which country has the world’s only national flag that is not rectangular or square?',answerMode:'text',accepted:['nepal'],points:1},
        {id:'weird5',prompt:'What food can remain edible for an extremely long time when stored properly and has been found preserved in ancient tombs?',answerMode:'text',accepted:['honey'],points:1}
      ]
    },
    {
      title:'Name That Tune',icon:'🎵',type:'music',
      instructions:'Play about 6–8 seconds from your music service. One point for song title and one for artist. Keep the projector on the question number so the title is not revealed.',
      jokerAllowed:true,
      questions:[
        {id:'music1',prompt:'Music clip 1 — play APT. (about 6–8 seconds).',mediaUrl:'',hostLink:'https://www.youtube.com/watch?v=DiTd771WumE',hostLinkLabel:'Open song',answerMode:'split',points:2,partAnswers:[
          {label:'Song',accepted:['apt','apt.'],points:1},
          {label:'Artist',accepted:['rose and bruno mars','rosé and bruno mars','bruno mars and rose','bruno mars and rosé','rose & bruno mars','rosé & bruno mars'],points:1}
        ]},
        {id:'music2',prompt:'Music clip 2 — play BIRDS OF A FEATHER (about 6–8 seconds).',mediaUrl:'',hostLink:'https://www.youtube.com/watch?v=V9PVRfjEBTI',hostLinkLabel:'Open song',answerMode:'split',points:2,partAnswers:[
          {label:'Song',accepted:['birds of a feather'],points:1},
          {label:'Artist',accepted:['billie eilish'],points:1}
        ]},
        {id:'music3',prompt:'Music clip 3 — play Blinding Lights (about 6–8 seconds).',mediaUrl:'',hostLink:'https://www.youtube.com/watch?v=4NRXx6U8ABQ',hostLinkLabel:'Open song',answerMode:'split',points:2,partAnswers:[
          {label:'Song',accepted:['blinding lights'],points:1},
          {label:'Artist',accepted:['the weeknd','weeknd'],points:1}
        ]},
        {id:'music4',prompt:'Music clip 4 — play Royals (about 6–8 seconds).',mediaUrl:'',hostLink:'https://www.youtube.com/watch?v=LFasFq4GJYM',hostLinkLabel:'Open song',answerMode:'split',points:2,partAnswers:[
          {label:'Song',accepted:['royals'],points:1},
          {label:'Artist',accepted:['lorde'],points:1}
        ]},
        {id:'music5',prompt:'Music clip 5 — play Don’t Stop Me Now (about 6–8 seconds).',mediaUrl:'',hostLink:'https://www.youtube.com/watch?v=HgzGwKwLmgM',hostLinkLabel:'Open song',answerMode:'split',points:2,partAnswers:[
          {label:'Song',accepted:["don't stop me now",'dont stop me now'],points:1},
          {label:'Artist',accepted:['queen'],points:1}
        ]}
      ]
    },
    {
      title:'Watch Closely',icon:'👀',type:'video',
      instructions:'Play the Paddington bathroom clip once. Students watch only — do not show the questions until the clip finishes. Do not replay until all answers are submitted.',
      jokerAllowed:true,
      questions:[
        {id:'watch1',prompt:'After using the toothbrushes in his ears, what does Paddington do with what comes out?',mediaUrl:'https://www.dailymotion.com/video/x7uzno3',hostLink:'https://www.dailymotion.com/video/x7uzno3',hostLinkLabel:'Open Paddington clip',answerMode:'text',accepted:['licks it','lick it','tastes it','taste it','eats it','puts it in his mouth','puts them in his mouth'],points:1},
        {id:'watch2',prompt:'What liquid does Paddington drink just before putting his head into the toilet?',mediaUrl:'',answerMode:'text',accepted:['mouthwash','mouth wash'],points:1},
        {id:'watch3',prompt:'What does Paddington use as a shield when the shower head turns on him?',mediaUrl:'',answerMode:'text',accepted:['toilet lid','toilet seat lid','toilet seat','lid','the toilet lid'],points:1},
        {id:'watch4',prompt:'What happens to the shower head after Paddington turns the shower on?',mediaUrl:'',answerMode:'text',accepted:['comes loose','it comes loose','comes off','it comes off','flies around','it flies around','sprays around','it sprays around','comes loose and sprays around','flies around spraying water'],points:1},
        {id:'watch5',prompt:'Where does Paddington’s runaway bathtub finally end up?',mediaUrl:'',answerMode:'text',accepted:['kitchen','the kitchen'],points:1}
      ]
    },
    {
      title:'Which One Is Fake?',icon:'🤔',type:'choice',
      instructions:'Read A, B and C aloud. Two statements are true; one is fake. Teams enter A, B or C.',
      jokerAllowed:true,
      questions:[
        {id:'fake1',prompt:'A: Wombats can produce cube-shaped droppings. B: Octopuses have three hearts. C: Flamingos are naturally born bright pink. Which one is fake?',answerMode:'choice',choices:['A','B','C'],accepted:['C','c'],points:1},
        {id:'fake2',prompt:'A: Post-it Notes were invented to stop pages falling out of library books. B: Bubble Wrap was originally intended as textured wallpaper. C: The microwave oven idea followed an engineer noticing food melting near radar equipment. Which one is fake?',answerMode:'choice',choices:['A','B','C'],accepted:['A','a'],points:1},
        {id:'fake3',prompt:'A: Your skin is your largest organ. B: Adults normally have more bones than newborn babies. C: The classic “tongue map” with separate taste zones is a myth. Which one is fake?',answerMode:'choice',choices:['A','B','C'],accepted:['B','b'],points:1},
        {id:'fake4',prompt:'A: A day on Venus is longer than a year on Venus. B: Footprints on the Moon can remain for millions of years because there is almost no weather or erosion. C: The Sun is the largest star known to exist. Which one is fake?',answerMode:'choice',choices:['A','B','C'],accepted:['C','c'],points:1}
      ]
    },
    {
      title:'What’s the Connection?',icon:'🔗',type:'connection',
      instructions:'Read the four clues. Teams identify what connects all four. Two points each.',
      jokerAllowed:true,
      questions:[
        {id:'con1',prompt:'Kākāpō — Kiwi — Ostrich — Emu. What connects all four?',answerMode:'text',accepted:['flightless birds','flightless bird','birds that cannot fly','birds that cant fly','cannot fly','cant fly'],points:2},
        {id:'con2',prompt:'Wednesday — Thing — Morticia — Gomez. What connects all four?',answerMode:'text',accepted:['the addams family','addams family','addams'],points:2},
        {id:'con3',prompt:'Mercury — Gemini — Apollo — Artemis. What connects all four?',answerMode:'text',accepted:['nasa space programmes','nasa space programs','nasa programs','nasa programmes','space programs','space programmes','nasa missions','space missions'],points:2},
        {id:'con4',prompt:'Mustang — Beetle — Panda — Golf. What connects all four?',answerMode:'text',accepted:['car models','cars','car names','models of cars','vehicle models'],points:2}
      ]
    },
    {
      title:'Closest Wins',icon:'🎯',type:'closest',
      instructions:'Final round. Teams enter one number only. Closest answer gets 3 points, second gets 2, third gets 1. Joker unavailable.',
      jokerAllowed:false,closestScoring:[3,2,1],
      questions:[
        {id:'close1',prompt:'What is the average distance from Earth to the Moon, in kilometres?',answerMode:'closest',numericAnswer:384400,points:3,closestRule:'absolute',placeholder:'km'},
        {id:'close2',prompt:'How many litres of water would fill a pool measuring 50 m × 25 m × 2 m?',answerMode:'closest',numericAnswer:2500000,points:3,closestRule:'absolute',placeholder:'litres'},
        {id:'close3',prompt:'How tall is Auckland’s Sky Tower, in metres?',answerMode:'closest',numericAnswer:328,points:3,closestRule:'absolute',placeholder:'metres'}
      ]
    }
  ]
};