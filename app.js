const DEFAULT_CANDIDATES = Array.from({length:100},(_,i)=>({
  id:i+1,
  group:'', name:`候補者 ${String(i+1).padStart(3,'0')}`,
  image:`https://picsum.photos/seed/sukigao${i+1}/500/500`
}));

function loadCandidates(){
  try{
    const raw=localStorage.getItem('sukigao9_candidates');
    if(!raw) return DEFAULT_CANDIDATES;
    const saved=JSON.parse(raw);
    if(!Array.isArray(saved) || saved.length!==100) return DEFAULT_CANDIDATES;
    return saved.map((c,i)=>({
      id:i+1,
      group:(c.group||'').trim(), name:(c.name||`候補者 ${String(i+1).padStart(3,'0')}`).trim(),
      image:c.image||DEFAULT_CANDIDATES[i].image
    }));
  }catch(e){ return DEFAULT_CANDIDATES; }
}

const candidates = loadCandidates();
let q=0, qChoices=Array.from({length:25},()=>[]), qualified=[];
const prelimGroups = loadPrelimGroups();

function loadPrelimGroups(){
  try{
    const raw=localStorage.getItem('sukigao9_prelim_groups');
    if(!raw)return null;
    const x=JSON.parse(raw);
    if(!Array.isArray(x)||x.length!==25||x.some(g=>!Array.isArray(g)||g.length!==4))return null;
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
let battles=[], b=0, ratings=new Map(), history=[];

function show(id){
  document.querySelectorAll('.screen').forEach(x=>x.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
function startQual(){
  q=0;qChoices=Array.from({length:25},()=>[]);qualified=[];
  show('qual');renderQual();
}
function renderQual(){
  const ids=getPrelimGroup(q);
  const group=ids.map(id=>candidates.find(c=>c.id===id)).filter(Boolean), sel=qChoices[q]||[];
  document.getElementById('qualInfo').textContent=`第${q+1}/25組　選択済み ${qualified.length}人（この組から最大3人）`;
  document.getElementById('qualBar').style.width=`${(q/25)*100}%`;
  document.getElementById('qualGrid').innerHTML=group.map(c=>`
    <div class="card ${sel.includes(c.id)?'selected':''}" onclick="toggleQual(${c.id})">
      <img src="${c.image}" alt=""><div class="group">${escapeHtml(c.group||"")}</div><div class="name">${escapeHtml(c.name)}</div>
    </div>`).join('');
  document.getElementById('qualBack').disabled=q===0;
}
function toggleQual(id){
  let sel=qChoices[q]; const ix=sel.indexOf(id);
  if(ix>=0) sel.splice(ix,1); else if(sel.length<3) sel.push(id);
  renderQual();
}
function qualBack(){if(q>0){q--;renderQual()}}
function qualNext(){
  if(q===24){
    qualified=qChoices.flat().map(id=>candidates.find(c=>c.id===id)).filter(Boolean);
    show('qualDone');
    document.getElementById('qualDoneText').textContent=`本戦進出者は ${qualified.length}人です。`;
  }else{q++;renderQual()}
}
function startBattle(){
  ratings=new Map(candidates.map(c=>[c.id,1500]));
  battles=[];history=[];b=0;
  const ids=candidates.map(c=>c.id);
  const targetPairs=Math.floor(ids.length*8/2);
  const scheduled=new Map(ids.map(id=>[id,0]));
  const used=new Set();
  const keyOf=(a,z)=>a<z?`${a}-${z}`:`${z}-${a}`;
  while(battles.length<targetPairs){
    let best=null,bestScore=Infinity;
    for(let i=0;i<ids.length;i++){
      for(let j=i+1;j<ids.length;j++){
        const a=ids[i],z=ids[j],key=keyOf(a,z);
        if(used.has(key))continue;
        const score=scheduled.get(a)+scheduled.get(z)+Math.random()*0.2;
        if(score<bestScore){best=[a,z];bestScore=score;}
      }
    }
    if(!best)break;
    const [a,z]=best;
    used.add(keyOf(a,z));
    scheduled.set(a,scheduled.get(a)+1);
    scheduled.set(z,scheduled.get(z)+1);
    const ca=candidates.find(c=>c.id===a),cz=candidates.find(c=>c.id===z);
    battles.push(Math.random()<0.5?[ca,cz]:[cz,ca]);
  }
  renderBattle();
  show('battle');
}

function renderBattle(){
  if(b>=battles.length){finishBattle();return}
  const [a,z]=battles[b];
  document.getElementById('battleInfo').textContent=`${b+1} / ${battles.length}`;
  document.getElementById('battleBar').style.width=`${(b/battles.length)*100}%`;
  document.getElementById('duel').innerHTML=[a,z].map(c=>`
    <div class="card" onclick="answer('win',${c.id})"><img src="${c.image}" alt=""><div class="group">${escapeHtml(c.group||"")}</div><div class="name">${escapeHtml(c.name)}</div></div>`).join('');
  document.getElementById('battleBack').disabled=b===0;
}
function expected(ra,rb){return 1/(1+10**((rb-ra)/400))}
function applyElo(a,z,outcome){
  const K=32,ra=ratings.get(a.id),rz=ratings.get(z.id);
  const ea=expected(ra,rz),ez=1-ea;
  let sa=outcome==='a'?1:outcome==='d'?.5:0;
  ratings.set(a.id,ra+K*(sa-ea));ratings.set(z.id,rz+K*((1-sa)-ez));
}
function answer(type,id){
  const [a,z]=battles[b];
  const outcome=type==='draw'?'d':(id===a.id?'a':'b');
  applyElo(a,z,outcome);history.push({b,outcome,a:a.id,z:z.id});
  b++;renderBattle();
}
function battleBack(){
  if(b===0)return;
  b--;
  history.pop();
  ratings=new Map(candidates.map(c=>[c.id,1500]));
  history.forEach(x=>applyElo(qualified.find(c=>c.id===x.a),qualified.find(c=>c.id===x.z),x.outcome));
  renderBattle();
}
function finishBattle(){
  const ranked=candidates.slice().sort((a,z)=>ratings.get(z.id)-ratings.get(a.id));
  const top=ranked.slice(0,9);
  document.getElementById('top9').innerHTML=top.map((c,i)=>`
    <div class="card"><img src="${c.image}" alt=""><div class="place">${i+1}位</div><div class="group">${escapeHtml(c.group||"")}</div><div class="name">${escapeHtml(c.name)}</div></div>`).join('');
  document.getElementById('ranking').innerHTML=ranked.map((c,i)=>`
    <div class="card"><img src="${c.image}" alt=""><div class="place">${i+1}位</div><div class="group">${escapeHtml(c.group||"")}</div><div class="name">${escapeHtml(c.name)}</div></div>`).join('');
  show('result');
}
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

document.getElementById('candidateStatus').textContent =
  localStorage.getItem('sukigao9_candidates')
  ? (prelimGroups ? '登録済みの候補者データと予選グループ設定を使用しています。' : '登録済みの候補者データを使用しています。予選グループは登録順です。')
  : '現在は仮候補100人です。「候補者を管理する」から写真と名前を登録できます。';
