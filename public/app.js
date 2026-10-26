const $=id=>document.getElementById(id);let state=null,picked=null,ws,dragIndex=null,handOrder=[],reorderFrom=null,suppressClick=false,lastShownResultId=null,acknowledgedResultId=null;
const saved=localStorage.getItem('domino-name')||'';
$('nickname').value=saved;$('entryName').value=saved;
const inviteRoom=new URLSearchParams(location.search).get('room')?.toUpperCase()||'';
let joinedRoom=null;
function send(m){if(ws?.readyState===1)ws.send(JSON.stringify(m))}
function toast(s){$('toast').textContent=s;$('toast').style.display='block';setTimeout(()=>$('toast').style.display='none',3500)}
function showRoom(code){joinedRoom=code;$('roomLanding').hidden=true;$('gameMain').hidden=false;$('roomBar').hidden=false;$('roomLabel').textContent='Sala '+code;history.replaceState(null,'','/?room='+encodeURIComponent(code));document.body.classList.add('has-room')}
function showLanding(){joinedRoom=null;$('roomLanding').hidden=false;$('gameMain').hidden=true;$('roomBar').hidden=true;history.replaceState(null,'','/');}
function currentName(){return $('entryName').value.trim().slice(0,22)||saved||'Convidado'}
function onConnected(){if(inviteRoom)send({type:'hello',room:inviteRoom,token:sessionStorage.getItem('domino-room-token-'+inviteRoom)||''});$('connection').textContent='● Conectado'}
function connect(){ws=new WebSocket((location.protocol==='https:'?'wss':'ws')+'://'+location.host+'/socket');ws.onopen=()=>{onConnected();if(joinedRoom&&!inviteRoom)send({type:'hello',room:joinedRoom,token:sessionStorage.getItem('domino-room-token-'+joinedRoom)||''})};ws.onclose=()=>{$('connection').textContent='● Reconectando...';setTimeout(connect,1500)};ws.onmessage=e=>{let m=JSON.parse(e.data);if(m.type==='identity'){sessionStorage.setItem('domino-room-token-'+m.room,m.token)}else if(m.type==='roomJoined'){showRoom(m.room);if(currentName())send({type:'name',name:currentName()})}else if(m.type==='error'){toast(m.message);$('landingError').textContent=m.message}else if(m.type==='state'){state=m;render()}}}
setInterval(()=>{if(ws?.readyState===1&&joinedRoom)send({type:'ping'})},25000);
$('createRoom').onclick=()=>{if(joinedRoom)return;const name=currentName();localStorage.setItem('domino-name',name);send({type:'createRoom',name})};
$('joinRoom').onclick=()=>{const code=$('entryCode').value.trim().toUpperCase();if(!/^[A-Z2-9]{6}$/.test(code))return toast('Digite o código de 6 caracteres.');const name=currentName();localStorage.setItem('domino-name',name);location.href='/?room='+code};
$('copyInvite').onclick=async()=>{const link=location.origin+'/?room='+joinedRoom;try{await navigator.clipboard.writeText(link);toast('Link copiado!')}catch{prompt('Copie o link:',link)}};
$('leaveRoom').onclick=()=>{location.href='/'};
if(inviteRoom){$('entryCode').value=inviteRoom;$('landingError').textContent='Entrando na sala '+inviteRoom+'…'}
connect();
$('saveName').onclick=()=>{let n=$('nickname').value.trim();if(!n)return toast('Digite seu nome.');localStorage.setItem('domino-name',n);send({type:'name',name:n})};$('watch').onclick=()=>send({type:'seat',seat:-1});
function setup(){return{type:'config',mode:$('mode').value,players:Number($('playerCount').value),deal:Number($('deal').value),noBuy:$('noBuy').checked,teams:[0,1,2,3].map(i=>Number($('team'+i)?.value??i%2))}}$('apply').onclick=()=>send(setup());$('start').onclick=()=>{send(setup());send({type:'start'})};$('next').onclick=()=>send({type:'start'});$('buy').onclick=()=>send({type:'buy'});$('pass').onclick=()=>send({type:'pass'});$('settingsBtn').onclick=()=>{const lobby=$('lobby');lobby.hidden=!lobby.hidden;document.body.classList.toggle('lobby-open',!lobby.hidden);requestAnimationFrame(refreshBoard)};
function updateSetup(){let n=Number($('playerCount').value);if(n<4){$('mode').value='solo';$('deal').value='7'}$('mode').disabled=n<4;$('deal').disabled=n<4;$('noBuyWrap').hidden=n<4||$('deal').value!=='6';$('teamSetup').hidden=n<4||$('mode').value==='solo'}$('mode').onchange=updateSetup;$('playerCount').onchange=updateSetup;$('deal').onchange=updateSetup;$('left').onclick=()=>play('left');$('right').onclick=()=>play('right');$('cancel').onclick=()=>$('sideDialog').close();
const patterns={0:[],1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
function tile(t,click=false){let d=document.createElement('div');d.className='tile'+(t[0]===t[1]?' double':'')+(click?' clickable':'');for(let n of t){let h=document.createElement('div');h.className='half';for(let k of patterns[n]){let dot=document.createElement('i');dot.className='pip c'+(n%4);dot.style.gridColumn=k%3+1;dot.style.gridRow=Math.floor(k/3)+1;h.append(dot)}d.append(h)}return d}
function tileKey(t){return t[0]+'-'+t[1]}
function orderedHand(hand){const keys=hand.map(tileKey);handOrder=handOrder.filter(k=>keys.includes(k));for(const k of keys)if(!handOrder.includes(k))handOrder.push(k);return handOrder.map(k=>({tile:hand[keys.indexOf(k)],index:keys.indexOf(k),key:k}))}
function moveHandTile(from,to){if(from===to||from===null||to===null)return;const key=handOrder.splice(from,1)[0];handOrder.splice(to,0,key);suppressClick=true;render();setTimeout(()=>suppressClick=false,100)}
function options(t){let c=state.game.chain;if(!c.length)return ['left','right'];return ['left','right'].filter(side=>t.includes(side==='left'?c[0][0]:c[c.length-1][1]))}
function play(side){$('sideDialog').close();if(picked!==null){if(!options(state.game.hand[picked]).includes(side))return toast('Essa peça não encaixa nessa ponta.');send({type:'play',index:picked,side});picked=null;document.querySelectorAll('.dropzone').forEach(z=>z.classList.remove('available'))}}
function choose(i){let g=state.game,t=g.hand[i];if(!g.chain.length&&g.opening!==null&&(t[0]!==g.opening||t[1]!==g.opening))return toast('A primeira peça deve ser o carroção '+g.opening+'-'+g.opening);let opts=options(t);if(!opts.length)return toast('Essa peça não encaixa.');picked=i;if(opts.length===2&&g.chain.length){document.querySelectorAll('.dropzone').forEach(z=>z.classList.toggle('available',opts.includes(z.dataset.side)));toast('Peça selecionada: escolha um dos contornos nas pontas.')}else play(opts[0])}
for(let side of ['left','right']){let z=$('drop'+side[0].toUpperCase()+side.slice(1));z.ondragover=e=>{if(dragIndex===null)return;e.preventDefault();z.classList.add('over')};z.ondragleave=()=>z.classList.remove('over');z.ondrop=e=>{e.preventDefault();z.classList.remove('over');if(dragIndex===null)return;picked=dragIndex;dragIndex=null;play(side)};z.onclick=()=>{if(picked!==null)play(side)};z.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();if(picked!==null)play(side)}}}
$('confirmOpening').onclick=()=>{send({type:'chooseOpening',seat:Number($('openingSeat').value),double:Number($('openingDouble').value)});$('openingDialog').close()};
function render(){let s=state,g=s.game,playing=g?.status==='playing',mine=s.self>=0,turn=playing&&g.turn===s.self;
document.body.classList.toggle('in-game',!!g);document.body.classList.toggle('spectating',!mine);if(g && !document.body.dataset.initialFold){$('lobby').hidden=true;document.body.dataset.initialFold='yes';document.body.classList.remove('lobby-open')}if(!g)delete document.body.dataset.initialFold;
$('hostControls').hidden=!s.isHost||!!g;$('mode').value=s.config.mode;$('deal').value=s.config.deal;$('noBuy').checked=!!s.config.noBuy;$('playerCount').value=s.config.players;updateSetup();$('teamSetup').hidden=s.config.mode!=='teams';$('chairs').innerHTML='';s.seats.forEach((p,i)=>{if(i>=s.config.players)return;let b=document.createElement('button');b.className='chair'+(i===s.self?' mine':'')+(p?' taken':'');b.textContent=`Cadeira ${i+1}\n${p?.name||'Livre'}`;b.style.whiteSpace='pre-line';b.disabled=!!g||!!p&&i!==s.self;b.onclick=()=>send({type:'seat',seat:i});$('chairs').append(b)});
$('teams').innerHTML='';s.seats.forEach((p,i)=>{let d=document.createElement('div');d.className='teamRow';let label=document.createElement('span');label.textContent=p?.name||`Cadeira ${i+1}`;let sel=document.createElement('select');sel.id='team'+i;[0,1].forEach(n=>{let o=document.createElement('option');o.value=n;o.textContent='Dupla '+(n+1);sel.append(o)});sel.value=s.config.teams[i];d.append(label,sel);$('teams').append(d)});
$('round').textContent=g?`Rodada ${s.round} • ${s.config.mode==='teams'?'Duplas':'Individual'}`:'Aguardando partida';$('stock').textContent=g?(s.config.noBuy?`${g.stock} peças reservadas (sem compra)`:`Monte: ${g.stock} peças`):`${s.config.deal} peças por pessoa`;
for(let i=0;i<4;i++){let d=$('p'+i),p=s.seats[i],team=s.config.mode==='teams'?s.config.teams[i]:i;d.hidden=i>=s.config.players;d.className='player corner '+['bottom','left','top','right'][(i-(s.self>=0?s.self:0)+4)%4]+(playing&&g.turn===i?' active':'');d.innerHTML='';let b=document.createElement('b');b.textContent=p?.name||'Cadeira '+(i+1);let line=document.createElement('span');line.textContent=`${s.config.mode==='teams'?'Dupla '+(team+1):'Individual'} • ${s.scores[team]} pts${g?' • '+g.counts[i]+' peças':''}`;d.append(b,line);if(playing&&g.turn===i){let pulse=document.createElement('em');pulse.className='turn-label';pulse.textContent='● VEZ DE JOGAR';d.append(pulse)}}
$('chain').innerHTML='';if(g?.chain.length)layoutChain(g.chain);else {const left=$('dropLeft'),right=$('dropRight');left.hidden=true;right.hidden=!g;right.classList.add('vertical');right.style.left='50%';right.style.top='50%';right.style.width='35px';right.style.height='68px'}$('announcement').textContent=s.log;$('hand').innerHTML='';if(mine&&g)orderedHand(g.hand).forEach(({tile:t,index:i},position)=>{let d=tile(t,turn);d.classList.add('hand-tile');d.dataset.position=position;
// Organizar as peças é permitido mesmo fora da sua vez.
d.draggable=true;d.ondragstart=e=>{reorderFrom=position;dragIndex=turn?i:null;d.classList.add('dragging');e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',String(position))};
d.ondragover=e=>{e.preventDefault();e.stopPropagation();d.classList.add('reorder-target')};d.ondragleave=()=>d.classList.remove('reorder-target');
d.ondrop=e=>{e.preventDefault();e.stopPropagation();document.querySelectorAll('.reorder-target').forEach(x=>x.classList.remove('reorder-target'));moveHandTile(reorderFrom,position);reorderFrom=null;dragIndex=null};
d.ondragend=()=>{d.classList.remove('dragging');reorderFrom=null;dragIndex=null};
if(turn)d.onclick=()=>{if(!suppressClick)choose(i)};
let touch=null,preview=null;
const endTouch=()=>{if(preview){preview.remove();preview=null}document.querySelectorAll('.dropzone.over').forEach(z=>z.classList.remove('over'));touch=null};
d.addEventListener('pointerdown',e=>{
 if(e.pointerType==='mouse')return;
 touch={x:e.clientX,y:e.clientY,moved:false};
 d.setPointerCapture(e.pointerId);
});
d.addEventListener('pointermove',e=>{
 if(!touch)return;
 let dx=e.clientX-touch.x,dy=e.clientY-touch.y;
 if(Math.hypot(dx,dy)<10&&!touch.moved)return;
 touch.moved=true;
 if(!preview){preview=d.cloneNode(true);preview.classList.add('touch-preview');document.body.append(preview)}
 preview.style.left=e.clientX+'px';preview.style.top=e.clientY+'px';
 let target=document.elementFromPoint(e.clientX,e.clientY)?.closest('.dropzone');
 document.querySelectorAll('.dropzone').forEach(z=>z.classList.toggle('over',z===target&&turn));
});
d.addEventListener('pointerup',e=>{
 if(!touch)return;
 if(touch.moved){
  const target=document.elementFromPoint(e.clientX,e.clientY);
  let zone=target?.closest('.dropzone'),other=target?.closest('.hand-tile');
  if(other&&other!==d)moveHandTile(position,Number(other.dataset.position));
  else if(zone&&turn){picked=i;play(zone.dataset.side)}
  suppressClick=true;setTimeout(()=>suppressClick=false,100);
 }
 endTouch();
});
d.addEventListener('pointercancel',endTouch);
$('hand').append(d)});

$('handArea').classList.toggle('your-turn',!!turn);
$('turnNotice').hidden=!playing;
$('turnNotice').classList.toggle('own-turn',!!turn);
$('turnNoticeText').textContent=turn?'SUA VEZ DE JOGAR':`VEZ DE ${s.seats[g.turn]?.name||'JOGADOR'}`;
let finalResult=g?.roundResult;
$('turn').textContent=!g?'Escolha uma cadeira':!playing?(finalResult?.matchWinner!==null&&finalResult?.matchWinner!==undefined?`🏆 ${finalResult.matchWinnerLabel} venceu a partida!`:finalResult?.winner!==null&&finalResult?.winner!==undefined?`🏅 ${finalResult.winnerLabel} venceu a rodada!`:'Rodada encerrada — empate'):!mine?'Você está assistindo':turn?`${s.seats[s.self]?.name||'Você'} • sua vez de jogar`:`${s.seats[s.self]?.name||'Você'} • vez de ${s.seats[g.turn]?.name||'jogador'}`;let playable=turn&&g.hand.some(t=>options(t).length);$('buy').hidden=!turn||playable||(g.stock===0||s.config.noBuy);$('pass').hidden=!turn||playable||(g.stock>0&&!s.config.noBuy);$('next').hidden=!s.isHost||!g||g.status==='playing'||(s.config.mode==='teams'&&g.status==='ended'&&g.winner!==null&&g.openingChoice!==null);
$('next').textContent=g?.status==='matchOver'?'Nova partida':'Próxima rodada';$('hint').textContent=!g?`O administrador inicia quando ${s.config.players} cadeiras estiverem ocupadas.`:!mine?'Espectadores não podem ver as mãos.':!turn?'Aguarde sua vez.':playable?'Arraste para outra peça para organizar sua mão, ou para uma ponta para jogar.':(g.stock&&!s.config.noBuy)?'Compre até encontrar uma peça jogável.':'Sem peças jogáveis: passe a vez.';
let choice=g?.status==='ended'&&s.config.mode==='teams'&&g.winner!==null&&g.openingChoice!==null&&s.self>=0&&s.config.teams[s.self]===g.winner;if(choice){$('openingSeat').innerHTML='';s.seats.forEach((p,i)=>{if(s.config.teams[i]===g.winner){let o=document.createElement('option');o.value=i;o.textContent=p?.name||'Cadeira '+(i+1);$('openingSeat').append(o)}});$('openingDouble').innerHTML='';for(let n=6;n>=0;n--){let o=document.createElement('option');o.value=n;o.textContent=n+'-'+n;$('openingDouble').append(o)}if(acknowledgedResultId===g.roundResult?.id&&!$('winnerDialog').open&&!$('closedDialog').open&&!$('openingDialog').open)$('openingDialog').showModal()}else if($('openingDialog').open)$('openingDialog').close();
}

// Motor geométrico da mesa. A peça da saída é o centro fixo lógico.
// As duas pontas crescem independentemente: esquerda vira para CIMA,
// direita vira para BAIXO. Cada cotovelo ocupa uma peça vertical de verdade.
// O tamanho é ajustado ao espaço disponível antes de desenhar.
const BOARD_LONG=68,BOARD_SHORT=35,BOARD_GAP=3;
let endpointPositions={left:null,right:null};
function originIndex(g){
 if(Number.isInteger(g.originIndex))return Math.max(0,Math.min(g.chain.length-1,g.originIndex));
 let i=g.chain.findIndex(t=>t[0]===g.opening&&t[1]===g.opening);
 return i>=0?i:Math.floor(g.chain.length/2);
}
function geometryFor(chain,origin,scale,W,H){
 const sw=W/scale,sh=H/scale,pad=9/scale;
 const anchor=chain[origin],anchorDouble=anchor[0]===anchor[1];
 const anchorW=anchorDouble?BOARD_SHORT:BOARD_LONG;
 const positions=Array(chain.length);
 positions[origin]={x:0,y:0,vertical:false,dbl:anchorDouble,reverse:false};
 let ghosts={};
 for(const [side,indices] of [
  ['left',Array.from({length:origin},(_,j)=>origin-j-1)],
  ['right',Array.from({length:chain.length-origin-1},(_,j)=>origin+j+1)]
 ]){
  const sign=side==='right'?1:-1;
  let dir=sign,down=sign,y=0,boundary=sign*anchorW/2;
  const outer=sign*(sw/2-pad),inner=sign*(anchorW/2+BOARD_GAP+4);
  const plan=(dbl,record)=>{
   const along=dbl?BOARD_SHORT:BOARD_LONG;
   const test=boundary+dir*(BOARD_GAP+along);
   let crossing=dir>0?test>Math.max(outer,inner):test<Math.min(outer,inner);
   // A primeira fileira sempre tem prioridade sobre uma curva, mas
   // evitamos linhas tão estreitas que não caiba nenhuma peça inteira.
   if(crossing){
    const oldDir=dir;
    const x=boundary-oldDir*BOARD_SHORT/2;
    const cy=y+down*(BOARD_SHORT/2+BOARD_LONG/2+BOARD_GAP);
    const item={x,y:cy,vertical:true,dbl,reverse:false};
    y+=down*(BOARD_SHORT+BOARD_LONG+BOARD_GAP*2);
    boundary=x-oldDir*BOARD_SHORT/2;
    dir=-oldDir;
    return item;
   }
   const x=boundary+dir*(BOARD_GAP+along/2);
   boundary+=dir*(BOARD_GAP+along);
   return {x,y,vertical:false,dbl,reverse:dir!==sign};
  };
  for(const i of indices){let t=chain[i];positions[i]=plan(t[0]===t[1]);}
  // Fantasma do próximo lugar: passa exatamente pelo mesmo algoritmo,
  // portanto não fica solto no meio da mesa.
  ghosts[side]=plan(false);
 }
 const bounds=[];
 for(const p of [...positions,...Object.values(ghosts)]){
  if(!p)continue;
  const width=p.vertical||p.dbl?BOARD_SHORT:BOARD_LONG;
  const height=p.vertical||p.dbl?BOARD_LONG:BOARD_SHORT;
  bounds.push({x1:p.x-width/2,x2:p.x+width/2,y1:p.y-height/2,y2:p.y+height/2});
 }
 const minX=Math.min(...bounds.map(p=>p.x1)),maxX=Math.max(...bounds.map(p=>p.x2));
 const minY=Math.min(...bounds.map(p=>p.y1)),maxY=Math.max(...bounds.map(p=>p.y2));
 return {positions,ghosts,minX,maxX,minY,maxY,spanW:(maxX-minX)*scale,spanH:(maxY-minY)*scale,scale};
}
function layoutChain(chain){
 const area=$('chain');
 const W=area.clientWidth,H=area.clientHeight;
 if(!W||!H||!chain.length)return;
 area.replaceChildren();
 $('dropLeft').hidden=false;$('dropRight').hidden=false;
 const anchor=originIndex(state.game);
 // Busca binária: usar a maior escala que mantém inclusive as pontas
 // jogáveis dentro da mesa, sem deslocar nada para fora do tabuleiro.
 let lo=.14,hi=1,solution=geometryFor(chain,anchor,lo,W,H);
 for(let k=0;k<26;k++){
  let mid=(lo+hi)/2,tryIt=geometryFor(chain,anchor,mid,W,H);
  if(tryIt.spanW<=W-8&&tryIt.spanH<=H-8){solution=tryIt;lo=mid}
  else hi=mid;
 }
 const {scale,positions,ghosts,minX,maxX,minY,maxY}=solution;
 const offsetX=(W-(maxX-minX)*scale)/2-minX*scale;
 const offsetY=(H-(maxY-minY)*scale)/2-minY*scale;
 const point=p=>({x:p.x*scale+offsetX,y:p.y*scale+offsetY});
 positions.forEach((p,i)=>{
  let d=tile(chain[i]);d.classList.add('board-tile');
  const q=point(p);
  d.style.left=q.x+'px';d.style.top=q.y+'px';
  // Carroções ficam SEMPRE verticais; somente peças normais viram nos Ls.
  d.style.transform=`translate(-50%,-50%) rotate(${p.vertical&&!p.dbl?90:(!p.dbl&&p.reverse?180:0)}deg) scale(${scale})`;
  area.append(d);
 });
 endpointPositions={};
 for(const side of ['left','right']){
  let z=$('drop'+side[0].toUpperCase()+side.slice(1));
  let p=ghosts[side],q=point(p);
  const horizontal=!p.vertical;
  const width=(horizontal?BOARD_LONG:BOARD_SHORT)*scale;
  const height=(horizontal?BOARD_SHORT:BOARD_LONG)*scale;
  z.style.left=q.x+'px';z.style.top=q.y+'px';
  z.style.width=width+'px';z.style.height=height+'px';
  z.classList.toggle('vertical',!horizontal);
  z.dataset.side=side;
  z.setAttribute('aria-label',`Jogar na ponta ${side==='left'?'esquerda':'direita'}`);
  z.title=`Jogar na ponta ${side==='left'?'esquerda':'direita'}`;
  endpointPositions[side]={x:q.x,y:q.y};
 }
}
// Exibir o resultado uma vez para cada conclusão de rodada, inclusive espectadores.
// O servidor envia um ID estável e o nome completo do vencedor; não interpretamos o log.
function acknowledgeResult(dialog){
 const r=state?.game?.roundResult;
 if(r)acknowledgedResultId=r.id;
 dialog.close();
 if(state)render(); // após reconhecer o resultado, liberar a escolha de saída da dupla
}
$('closeResult').onclick=()=>acknowledgeResult($('closedDialog'));
$('closeWinner').onclick=()=>acknowledgeResult($('winnerDialog'));
for(const id of ['winnerDialog','closedDialog']){
 const el=$(id);
 el.addEventListener('cancel',e=>{e.preventDefault();acknowledgeResult(el)});
}
const originalRender=render;
render=function(){
 originalRender();
 const g=state?.game,r=g?.roundResult;
 if(!r||lastShownResultId===r.id)return;
 lastShownResultId=r.id;
 // Evita sobrepor duas janelas modais e funciona para jogos encerrados por batida ou fechados.
 if($('openingDialog').open)$('openingDialog').close();
 const isFinal=r.matchWinner!==null;
 if(r.kind==='closed'){
  $('closedHeadline').textContent=isFinal?'🏆 Fim da partida — jogo fechado':'Rodada encerrada — jogo fechado';
  const details=$('closedDetails');details.replaceChildren();
  const intro=document.createElement('p');intro.textContent='Pontos restantes nas peças de cada jogador:';details.append(intro);
  g.closedResult?.individual?.forEach(x=>{
   const row=document.createElement('p');row.className='result-row';
   const person=document.createElement('span');person.textContent=x.name+(state.config.mode==='teams'?' · Dupla '+(x.team+1):'');
   const score=document.createElement('strong');score.textContent=x.points+' pontos';
   row.append(person,score);details.append(row)
  });
  if(state.config.mode==='teams'){
   const h=document.createElement('h4');h.textContent='Total por dupla';details.append(h);
   g.closedResult?.totals?.forEach(x=>{
    const row=document.createElement('p');row.className='result-row';
    const team=document.createElement('span');team.textContent='Dupla '+(x.group+1);
    const score=document.createElement('strong');score.textContent=x.points+' pontos';
    row.append(team,score);details.append(row)
   })
  }
  const verdict=document.createElement('div');verdict.className='result-verdict';
  verdict.textContent=r.winner===null?'🤝 Empate — ninguém pontua.':`🏅 ${r.winnerLabel} venceu a rodada (+${r.points} ponto${r.points===1?'':'s'}).`;
  details.append(verdict);
  if(isFinal){const final=document.createElement('div');final.className='result-champion';final.textContent=`🏆 ${r.matchWinnerLabel} VENCEU A PARTIDA!`;details.append(final)}
  $('closedDialog').showModal();
 } else {
  $('winnerHeadline').textContent=isFinal?'🏆 CAMPEÃO DA PARTIDA!':'🏅 VENCEDOR DA RODADA';
  $('winnerName').textContent=isFinal?r.matchWinnerLabel:r.winnerLabel;
  $('winnerInfo').textContent=(r.actorName?`${r.actorName} bateu. `:'')+`+${r.points} ponto${r.points===1?'':'s'} nesta rodada. ${r.winnerLabel}: ${r.winningScore} ponto${r.winningScore===1?'':'s'} no placar.`;
  $('winnerDialog').classList.toggle('championship',isFinal);
  $('winnerDialog').showModal();
 }
};
let resizePending=false;function refreshBoard(){if(resizePending)return;resizePending=true;requestAnimationFrame(()=>{resizePending=false;if(state?.game?.chain?.length)layoutChainReset()})}
window.addEventListener('resize',refreshBoard);if(window.visualViewport)window.visualViewport.addEventListener('resize',refreshBoard);
if(typeof ResizeObserver!=='undefined')new ResizeObserver(refreshBoard).observe($('chain'));


function layoutChainReset(){$('chain').replaceChildren();layoutChain(state.game.chain)}
