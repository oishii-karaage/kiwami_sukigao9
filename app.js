const candidates = Array.from({length:100},(_,i)=>({
  id:i+1,name:`候補者 ${String(i+1).padStart(3,'0')}`,
  image:`https://picsum.photos/seed/sukigao${i+1}/500/500`
}));

let q=0, qChoices=Array.from({length:25},()=>[]), qualified=[];
let battles=[], b=0, ratings=new Map(), history=[];

function show(id){document.querySelectorAll('.screen').forEach(x=>x.classList.remove('active'));document.getElementById(id).classList.add('active')}
function startQual(){q=0;qChoices=Array.from({length:25},()=>[]);qualified=[];show('qual');renderQual()}
function renderQual(){
  const start=q*4, group=candidates.slice(start,start+4), sel=qChoices[q]||[];
  document.getElementById('qualInfo').textContent=`第${q+1}/25組　選択済み ${qualified.length}人（この組から最大3人）`;
  document.getElementById('qualBar').style.width=`${(q/25)*100}%`;
  document.getElementById('qualGrid').innerHTML=group.map(c=>`
    <div class="card ${sel.includes(c.id)?'selected':''}" onclick="toggleQual(${c.id})">
      <img src="${c.image}" alt=""><div class="name">${c.name}</div>
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
  if(qChoices[q].length>3)return;
  if(q===24){
    qualified=qChoices.flat().map(id=>candidates.find(c=>c.id===id));
    show('qualDone');document.getElementById('qualDoneText').textContent=`本戦進出者は ${qualified.length}人です。`;
  }else{q++;renderQual()}
}
function startBattle(){
  // 1人あたり約10比較を目安に、同一ペアを避けて生成
  ratings=new Map(qualified.map(c=>[c.id,1500]));
  battles=[];history=[];b=0;
  const target=Math.max(0,Math.floor(qualified.length*10/2));
  const pairs=[];const used=new Set();
  while(pairs.length<target && used.size < qualified.length*(qualified.length-1)/2){
    const a=qualified[Math.floor(Math.random()*qualified.length)];
    const z=qualified[Math.floor(Math.random()*qualified.length)];
    if(a.id===z.id)continue;
    const key=a.id<z.id?`${a.id}-${z.id}`:`${z.id}-${a.id}`;
    if(used.has(key))continue;
    used.add(key);pairs.push(Math.random()<.5?[a,z]:[z,a]);
  }
  battles=pairs;renderBattle();show('battle');
}
function renderBattle(){
  if(b>=battles.length){finishBattle();return}
  const [a,z]=battles[b];
  document.getElementById('battleInfo').textContent=`${b+1} / ${battles.length}`;
  document.getElementById('battleBar').style.width=`${(b/battles.length)*100}%`;
  document.getElementById('duel').innerHTML=[a,z].map(c=>`
    <div class="card" onclick="answer('win',${c.id})"><img src="${c.image}" alt=""><div class="name">${c.name}</div></div>`).join('');
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
  const h=history.pop(); const a=qualified.find(c=>c.id===h.a),z=qualified.find(c=>c.id===h.z);
  // 直前結果をEloから取り消すため、全履歴を再計算
  ratings=new Map(qualified.map(c=>[c.id,1500]));
  history.forEach(x=>applyElo(qualified.find(c=>c.id===x.a),qualified.find(c=>c.id===x.z),x.outcome));
  renderBattle();
}
function finishBattle(){
  const ranked=qualified.slice().sort((a,z)=>ratings.get(z.id)-ratings.get(a.id));
  const top=ranked.slice(0,9);
  document.getElementById('top9').innerHTML=top.map((c,i)=>`
    <div class="card"><img src="${c.image}" alt=""><div class="place">${i+1}位</div><div class="name">${c.name}</div></div>`).join('');
  document.getElementById('ranking').innerHTML=ranked.map((c,i)=>`
    <div class="card"><img src="${c.image}" alt=""><div class="place">${i+1}位</div><div class="name">${c.name}</div></div>`).join('');
  show('result');
}
