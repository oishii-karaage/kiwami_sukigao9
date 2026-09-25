const EMBEDDED_DATA = (window.SUKIGAO9_DATA && Array.isArray(window.SUKIGAO9_DATA.candidates)) ? window.SUKIGAO9_DATA : {candidates:[],prelimGroups:[]};
const DEFAULT_CANDIDATES = EMBEDDED_DATA.candidates.length===100 ? EMBEDDED_DATA.candidates : Array.from({length:100},(_,i)=>({
  id:i+1,
  group:'', name:`候補者 ${String(i+1).padStart(3,'0')}`,
  image:`https://picsum.photos/seed/sukigao${i+1}/500/500`
}));
const DEFAULT_GROUPS = Array.isArray(EMBEDDED_DATA.prelimGroups) && EMBEDDED_DATA.prelimGroups.length===25
  ? EMBEDDED_DATA.prelimGroups : Array.from({length:25},(_,g)=>DEFAULT_CANDIDATES.slice(g*4,g*4+4).map(c=>c.id));

function isPlaceholderData(saved){
  if(!Array.isArray(saved) || saved.length!==100 || DEFAULT_CANDIDATES.length!==100) return false;
  const placeholderCount=saved.filter(c=>/^候補者\s*\d{3}$/.test(String(c?.name||''))).length;
  return placeholderCount>=90;
}
function loadCandidates(){
  try{
    const raw=localStorage.getItem('sukigao9_candidates');
    if(!raw){
      localStorage.setItem('sukigao9_candidates',JSON.stringify(DEFAULT_CANDIDATES));
      return DEFAULT_CANDIDATES;
    }
    const saved=JSON.parse(raw);
    if(!Array.isArray(saved) || saved.length!==100 || isPlaceholderData(saved)){
      localStorage.setItem('sukigao9_candidates',JSON.stringify(DEFAULT_CANDIDATES));
      return DEFAULT_CANDIDATES;
    }
    return saved.map((c,i)=>({
      id:i+1,
      group:(c.group||'').trim(), name:(c.name||DEFAULT_CANDIDATES[i].name).trim(),
      image:c.image||DEFAULT_CANDIDATES[i].image
    }));
  }catch(e){
    try{localStorage.setItem('sukigao9_candidates',JSON.stringify(DEFAULT_CANDIDATES));}catch(_){}
    return DEFAULT_CANDIDATES;
  }
}

const candidates = loadCandidates();
let q=0, qChoices=Array.from({length:25},()=>[]), qualified=[];
const prelimGroups = loadPrelimGroups();

function loadPrelimGroups(){
  try{
    const raw=localStorage.getItem('sukigao9_prelim_groups');
    if(!raw){
      localStorage.setItem('sukigao9_prelim_groups',JSON.stringify(DEFAULT_GROUPS));
      return DEFAULT_GROUPS;
    }
    const x=JSON.parse(raw);
    if(!Array.isArray(x)||x.length!==25||x.some(g=>!Array.isArray(g)||g.length!==4)){
      localStorage.setItem('sukigao9_prelim_groups',JSON.stringify(DEFAULT_GROUPS));
      return DEFAULT_GROUPS;
    }
    const ids=x.flat();
    if(ids.length!==100||new Set(ids).size!==100)return null;
    const valid=new Set(candidates.map(c=>c.id));
    if(ids.some(id=>!valid.has(id)))return null;
    return x;
  }catch(e){return null;}
}
function getPrelimGroup(n){
  if(prelimGroups)return prelimGroups[n];
  return candidates.slice(n*4,n*4+4).map(c=>c.id);
}

function show(id){
  document.querySelectorAll('.screen').forEach(x=>x.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0,0);
}
function startQual(){
  q=0; qChoices=Array.from({length:25},()=>[]); qualified=[];
  show('qual'); renderQual();
}
function renderQual(){
  const group=getPrelimGroup(q).map(id=>candidates.find(c=>c.id===id)).filter(Boolean);
  const sel=qChoices[q]||[];
  document.getElementById('qualInfo').textContent=`組 ${q+1} / 25　　　　　　　　　${Math.min(100,q*4)} / 100人`;
  document.getElementById('qualBar').style.width=`${q*4}%`;
  document.getElementById('qualGrid').innerHTML=group.map(c=>`
    <div class="card ${sel.includes(c.id)?'selected':''}" onclick="toggleQual(${c.id})">
      <img src="${c.image}" alt=""><div class="group">${escapeHtml(c.group||'')}</div><div class="name">${escapeHtml(c.name)}</div>
    </div>`).join('');
  document.getElementById('qualBack').disabled=q===0;
}
function toggleQual(id){
  const sel=qChoices[q], i=sel.indexOf(id);
  if(i>=0)sel.splice(i,1);
  else if(sel.length<3)sel.push(id);
  renderQual();
}
function qualBack(){if(q>0){q--;renderQual();}}
function qualNext(){
  if(q===24){
    qualified=qChoices.flat().map(id=>candidates.find(c=>c.id===id)).filter(Boolean);
    show('qualDone');
  }else{q++;renderQual();}
}

let battles=[], b=0, history=[];
let score=new Map(), appearances=new Map(), historyLog=[];
let rating=new Map();
let targetMatches=180, exploreMatches=50;
let usedPairKeys=new Set();

function initStats(){
  score=new Map(candidates.map(c=>[c.id,0]));
  appearances=new Map(candidates.map(c=>[c.id,0]));
  rating=new Map(candidates.map(c=>[c.id,1000]));
  historyLog=[];
}

function groupMap(){
  const m=new Map();
  if(prelimGroups){prelimGroups.forEach((g,gi)=>g.forEach(id=>m.set(id,gi)));}
  else candidates.forEach((c,i)=>m.set(c.id,Math.floor(i/4)));
  return m;
}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function pairKey(a,z){return a<z?`${a}-${z}`:`${z}-${a}`;}
function selectedData(){
  const selected=new Set(qChoices.flat());
  const groupCount=Array(25).fill(0);
  qChoices.forEach((x,g)=>groupCount[g]=x.length);
  return {selected,groupCount};
}
function candidateValue(id){
  const a=appearances.get(id)||0;
  const s=score.get(id)||0;
  return a?s/a:0;
}
function deterministicNoise(a,z,step){
  let x=(a*73856093 ^ z*19349663 ^ step*83492791)>>>0;
  x=(x^(x>>>13))>>>0;x=(x*1274126177)>>>0;
  return (x%1000)/100000;
}
function choosePair(stage){
  const {selected,groupCount}=selectedData();
  const gm=groupMap();
  const ids=candidates.map(c=>c.id);
  let best=null,bestScore=-Infinity;

  for(let i=0;i<ids.length;i++){
    const a=ids[i];
    for(let j=i+1;j<ids.length;j++){
      const z=ids[j];
      const key=pairKey(a,z);
      if(usedPairKeys.has(key))continue;

      const ga=gm.get(a),gz=gm.get(z);
      const aa=appearances.get(a)||0,az=appearances.get(z)||0;
      const va=candidateValue(a),vz=candidateValue(z);
      let sc=0;

      sc+=(4-Math.min(4,aa))*2.2+(4-Math.min(4,az))*2.2;

      if(stage===1){
        sc+=(selected.has(a)?0.35:0)+(selected.has(z)?0.35:0);
        sc+=(groupCount[ga]||0)*0.08+(groupCount[gz]||0)*0.08;
        if(ga===gz)sc-=8;
        if(aa===0)sc+=4;
        if(az===0)sc+=4;
      }else if(stage===2){
        sc+=(selected.has(a)?0.5:0)+(selected.has(z)?0.5:0);
        sc+=Math.max(0,va)*3+Math.max(0,vz)*3;
        sc+=(groupCount[ga]||0)*0.35+(groupCount[gz]||0)*0.35;
        sc+=Math.max(0,3-Math.abs(va-vz))*2;
        if(ga===gz)sc-=2;
      }else{
        sc+=Math.max(0,5-Math.abs(va-vz))*5;
        sc+=Math.abs(aa-az)*-0.4;
        sc+=Math.max(0,va)+Math.max(0,vz);
      }
      sc+=deterministicNoise(a,z,usedPairKeys.size);

      if(sc>bestScore){bestScore=sc;best=[a,z];}
    }
  }
  return best;
}

function startBattle(){
  initStats();
  battles=[];
  b=0;
  usedPairKeys=new Set();

  const p=qChoices.flat().length;
  targetMatches=clamp(140+p*2,150,240);
  exploreMatches=clamp(35+Math.round(p*0.6),40,75);

  // 先に本戦画面を表示してから、現在の回答状況に応じたペアを生成する。
  // 一度生成したペアは battles に保持するので、戻っても同じペアになる。
  show('battle');
  renderBattle();
}

function currentStage(){
  if(b<exploreMatches)return 1;
  if(b<Math.floor(targetMatches*0.72))return 2;
  return 3;
}

function nextBattlePair(){
  const pair=choosePair(currentStage());
  if(!pair)return null;
  const cards=pair.map(id=>candidates.find(c=>c.id===id)).filter(Boolean);
  if(cards.length!==2)return null;
  battles[b]=cards;
  usedPairKeys.add(pairKey(pair[0],pair[1]));
  return cards;
}

function renderBattle(){
  if(b>=targetMatches){
    finishBattle();
    return;
  }

  // まだ一度も表示していない位置だけ新しいペアを生成する。
  // 戻る→進む場合は、既に保存された battles[b] をそのまま使う。
  const pair=battles[b]||nextBattlePair();
  if(!pair){
    finishBattle();
    return;
  }

  const [a,z]=pair;
  document.getElementById('battleBar').style.width=
    `${targetMatches ? (b/targetMatches)*100 : 100}%`;

  document.getElementById('duel').innerHTML=[a,z].map(c=>`
    <div class="card" onclick="answer('win',${c.id})">
      <img src="${c.image}" alt="">
      <div class="group">${escapeHtml(c.group||"")}</div>
      <div class="name">${escapeHtml(c.name)}</div>
    </div>`).join('');

  document.getElementById('drawArea').innerHTML=`
    <button class="btn draw" onclick="answer('both')">どっちも好き</button>
    <button class="btn draw not-like" onclick="answer('neither')">どっちも好きじゃない</button>`;

  document.getElementById('battleBack').disabled=b===0;
}

function expectedScore(ra,rz){
  return 1/(1+Math.pow(10,(rz-ra)/400));
}
function updateRating(a,z,type){
  const ra=rating.get(a.id)||1000,rz=rating.get(z.id)||1000;
  const ea=expectedScore(ra,rz),ez=1-ea;
  const K=28;
  let sa,sz;
  if(type==='win'){sa=1;sz=0;}
  else if(type==='lose'){sa=0;sz=1;}
  else if(type==='both'){sa=0.5;sz=0.5;}
  else{sa=0;sz=0;}
  rating.set(a.id,ra+K*(sa-ea));
  rating.set(z.id,rz+K*(sz-ez));
}
function applyResult(a,z,type){
  if(type==='win'){
    score.set(a.id,(score.get(a.id)||0)+2);
    score.set(z.id,(score.get(z.id)||0)-1);
  }else if(type==='lose'){
    score.set(a.id,(score.get(a.id)||0)-1);
    score.set(z.id,(score.get(z.id)||0)+2);
  }else if(type==='both'){
    score.set(a.id,(score.get(a.id)||0)+1);
    score.set(z.id,(score.get(z.id)||0)+1);
  }else if(type==='neither'){
    score.set(a.id,(score.get(a.id)||0)-1);
    score.set(z.id,(score.get(z.id)||0)-1);
  }
  appearances.set(a.id,(appearances.get(a.id)||0)+1);
  appearances.set(z.id,(appearances.get(z.id)||0)+1);
  updateRating(a,z,type);
}

function answer(type,id){
  if(b>=targetMatches)return;

  const pair=battles[b];
  if(!pair)return;

  const [a,z]=pair;
  let t=type;
  if(type==='win'&&id===z.id)t='lose';

  applyResult(a,z,t);
  historyLog.push({b,a:a.id,z:z.id,type:t});
  b++;

  // targetMatches回目の回答を選択した直後に結果画面へ。
  if(b>=targetMatches){
    finishBattle();
    return;
  }
  renderBattle();
}

function battleBack(){
  if(b===0)return;

  // 直前の回答だけ取り消す。battles と usedPairKeys は残すので、
  // 戻ってから進んでも同じペアが表示される。
  b--;
  historyLog.pop();

  // historyLogを退避してから統計を初期化し、ここまでの回答を再適用する。
  const savedHistory=historyLog.slice();
  initStats();
  for(const h of savedHistory){
    const a=candidates.find(c=>c.id===h.a);
    const z=candidates.find(c=>c.id===h.z);
    if(a&&z)applyResult(a,z,h.type);
  }
  historyLog=savedHistory;

  renderBattle();
}

function finishBattle(){
  const ranked=candidates.slice().sort((a,z)=>{
    const ra=rating.get(a.id)||1000,rz=rating.get(z.id)||1000;
    if(rz!==ra)return rz-ra;
    return (score.get(z.id)||0)-(score.get(a.id)||0);
  });

  const top=ranked.slice(0,9);
  document.getElementById('top9').innerHTML=top.map((c,i)=>`
    <div class="card"><img src="${c.image}" alt="">
      <div class="place">${i+1}位</div>
      <div class="group">${escapeHtml(c.group||"")}</div>
      <div class="name">${escapeHtml(c.name)}</div>
    </div>`).join('');

  document.getElementById('ranking').innerHTML=ranked.map((c,i)=>`
    <div class="card"><img src="${c.image}" alt="">
      <div class="place">${i+1}位</div>
      <div class="group">${escapeHtml(c.group||"")}</div>
      <div class="name">${escapeHtml(c.name)}</div>
    </div>`).join('');

  document.querySelector('#result .muted').textContent=
    `比較回数 ${historyLog.length}回。予選での選択と本戦での評価をもとに、好き度を集計しています。`;

  let shareBtn=document.getElementById('shareResultX');
  if(!shareBtn){
    shareBtn=document.createElement('button');
    shareBtn.id='shareResultX';
    shareBtn.className='btn';
    shareBtn.textContent='結果画像をXに投稿';
    shareBtn.onclick=shareResultOnX;
    const restart=document.querySelector('#result button.btn');
    restart.parentNode.insertBefore(shareBtn,restart);
  }

  show('result');
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
