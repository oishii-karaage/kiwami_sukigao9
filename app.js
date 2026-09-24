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
  const targetPairs=180;

  // 予選結果を本戦の対戦カードに反映する。
  // 個人が選ばれていることを最優先し、その次に「その人の属する4人組で
  // 何人選ばれたか」を重視する。選ばれていない人・グループにも登場枠を残す。
  const selectedSet=new Set(qChoices.flat());
  const prelimGroupById=new Map();
  const groupSelectedCount=Array(25).fill(0);
  qChoices.forEach((chosen,g)=>{
    groupSelectedCount[g]=chosen.length;
    chosen.forEach(id=>prelimGroupById.set(id,g));
  });
  const savedGroupMap=new Map();
  if(prelimGroups){
    prelimGroups.forEach((group,g)=>group.forEach(id=>savedGroupMap.set(id,g)));
  }
  const groupOf=id=>savedGroupMap.has(id)?savedGroupMap.get(id):prelimGroupById.get(id);

  // 予選での情報から「出やすさ」を作る。全員に最低限の出番を残す。
  function baseWeight(id){
    const selected=selectedSet.has(id);
    const g=groupOf(id);
    const gc=(g===undefined)?0:groupSelectedCount[g];
    return 1 + (selected?3.5:0) + gc*1.0;
  }

  const scheduled=new Map(ids.map(id=>[id,0]));
  const used=new Set();
  const keyOf=(a,z)=>a<z?`${a}-${z}`:`${z}-${a}`;

  function pairScore(a,z){
    const wa=baseWeight(a), wz=baseWeight(z);
    // 予選で反応が強かった候補・グループを優先しつつ、
    // すでに多く登場した候補にはペナルティをかける。
    const fairnessA=1/(1+scheduled.get(a)*0.8);
    const fairnessZ=1/(1+scheduled.get(z)*0.8);
    return wa*fairnessA + wz*fairnessZ + Math.random()*0.25;
  }

  while(battles.length<targetPairs){
    let best=null,bestScore=-Infinity;
    // 候補を全探索し、予選情報＋出場回数でカードを選ぶ。
    for(let i=0;i<ids.length;i++){
      for(let j=i+1;j<ids.length;j++){
        const a=ids[i],z=ids[j],key=keyOf(a,z);
        if(used.has(key))continue;
        const score=pairScore(a,z);
        if(score>bestScore){best=[a,z];bestScore=score;}
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
