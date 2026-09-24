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
let battleStage='explore', stageOneEnd=0, finalists=[];

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
    document.getElementById('qualDoneText').textContent=`本戦では100人全員が登場します。まず広く比較し、その後「好き」と選んだ人だけで決選投票を行います。`;
  }else{q++;renderQual()}
}

function startBattle(){
  ratings=new Map(candidates.map(c=>[c.id,1500]));
  battles=[];history=[];b=0;battleStage='explore';stageOneEnd=0;finalists=[];
  const ids=candidates.map(c=>c.id);
  const selectedSet=new Set(qChoices.flat());
  const savedGroupMap=new Map();
  if(prelimGroups) prelimGroups.forEach((group,g)=>group.forEach(id=>savedGroupMap.set(id,g)));
  const groupSelectedCount=Array(25).fill(0);
  qChoices.forEach((chosen,g)=>groupSelectedCount[g]=chosen.length);
  const groupOf=id=>savedGroupMap.has(id)?savedGroupMap.get(id):Math.floor((id-1)/4);
  const priority=id=>{
    const g=groupOf(id), gc=groupSelectedCount[g]||0;
    return (selectedSet.has(id)?100:0) + gc*20 + ((id*17)%19)/100;
  };
  const keyOf=(a,z)=>a<z?`${a}-${z}`:`${z}-${a}`;

  // 前半120試合。各候補の出場回数を先に固定するので、ランダムな出現回数で順位が揺れない。
  // 予選で選ばれた人・選出人数の多いグループをやや多く登場させつつ、全員に最低2試合を保証する。
  const ordered=ids.slice().sort((a,z)=>priority(z)-priority(a));
  const appearances=new Map(ids.map(id=>[id,2]));
  let extra=40;
  for(const id of ordered){
    if(extra<=0)break;
    appearances.set(id,3); extra--;
  }
  const remaining=new Map(appearances);
  const used=new Set();
  let guard=0;
  while(battles.length<120 && guard<20000){
    guard++;
    let best=null,bestScore=-Infinity;
    for(let i=0;i<ids.length;i++){
      const a=ids[i];
      if((remaining.get(a)||0)<=0)continue;
      for(let j=i+1;j<ids.length;j++){
        const z=ids[j];
        if((remaining.get(z)||0)<=0)continue;
        const key=keyOf(a,z);
        if(used.has(key))continue;
        const score=(priority(a)+priority(z)) + (remaining.get(a)+remaining.get(z))*0.5;
        if(score>bestScore){best=[a,z];bestScore=score;}
      }
    }
    if(!best)break;
    const [a,z]=best;
    used.add(keyOf(a,z));
    remaining.set(a,remaining.get(a)-1);remaining.set(z,remaining.get(z)-1);
    battles.push([candidates.find(c=>c.id===a),candidates.find(c=>c.id===z)]);
  }
  stageOneEnd=battles.length;
  renderBattle();
  show('battle');
}

function renderBattle(){
  if(b>=battles.length){finishStageOrBattle();return;}
  const [a,z]=battles[b];
  const label=battleStage==='explore' ? `探索 ${b+1} / ${stageOneEnd}` : `決選 ${b-stageOneEnd+1} / ${battles.length-stageOneEnd}`;
  document.getElementById('battleInfo').textContent=label;
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
function getWinnersFromExplore(){
  const wins=new Set();
  history.filter(x=>x.b<stageOneEnd).forEach(x=>{
    if(x.outcome==='a')wins.add(x.a);
    else if(x.outcome==='b')wins.add(x.z);
  });
  return Array.from(wins);
}
function makeFinalStage(){
  const winners=getWinnersFromExplore();
  const selectedSet=new Set(qChoices.flat());
  const winnerRank=winners.slice().sort((a,z)=>{
    const sa=ratings.get(a)+(selectedSet.has(a)?10:0), sz=ratings.get(z)+(selectedSet.has(z)?10:0);
    return sz-sa;
  });
  // 後半に進むのは、本戦前半で実際に「好き」と選ばれた人だけ。
  // その中から上位30人を決選投票へ。
  finalists=winnerRank.slice(0,30).map(id=>candidates.find(c=>c.id===id));
  if(finalists.length<2){
    finishBattle();
    return;
  }
  // 決選は30人×4試合＝60試合。各人の比較回数を固定し、重複対戦は作らない。
  const n=finalists.length;
  const rounds=Math.min(4,Math.floor((n-1)/2));
  const finalPairs=[];
  const used=new Set();
  for(let r=0;r<rounds;r++){
    for(let i=0;i<Math.floor(n/2);i++){
      const a=finalists[(i+r)%n], z=finalists[(n-1-i+r)%n];
      const key=a.id<z.id?`${a.id}-${z.id}`:`${z.id}-${a.id}`;
      if(a.id===z.id||used.has(key))continue;
      used.add(key);finalPairs.push([a,z]);
    }
  }
  // 30人なら60試合。人数が少ない場合でも、可能な範囲で決選を行う。
  battles=battles.slice(0,stageOneEnd).concat(finalPairs.slice(0,60));
  battleStage='final';
  b=stageOneEnd;
  renderBattle();
}
function finishStageOrBattle(){
  if(battleStage==='explore'){
    makeFinalStage();
    return;
  }
  finishBattle();
}
function battleBack(){
  if(b===0)return;
  // 決選開始地点まで戻った場合は、決選カード生成前の状態に戻す。
  b--;
  history=history.filter(x=>x.b!==b);
  ratings=new Map(candidates.map(c=>[c.id,1500]));
  history.forEach(x=>{
    const a=candidates.find(c=>c.id===x.a),z=candidates.find(c=>c.id===x.z);
    if(a&&z)applyElo(a,z,x.outcome);
  });
  if(b<stageOneEnd)battleStage='explore';
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
