const http=require('http');
const {WebSocketServer}=require('ws');
const Redis=require('ioredis');
const crypto=require('crypto');
const redisUrl=process.env.REDIS_URL;
const db=redisUrl?new Redis(redisUrl,{maxRetriesPerRequest:2}):null;
const pub=redisUrl?new Redis(redisUrl,{maxRetriesPerRequest:null}):null;
const sub=redisUrl?new Redis(redisUrl,{maxRetriesPerRequest:null}):null;
const PREFIX='domino:room:v13:';
const ROOM_RE=/^[A-Z2-9]{6}$/;
const localRooms=new Map();
let currentRoom=null;
const roomKey=code=>PREFIX+code;
const roomCode=()=>crypto.randomBytes(5).toString('hex').toUpperCase().replace(/[01]/g,'A').slice(0,6);
async function roomExists(code){return db?!!(await db.exists(roomKey(code))):localRooms.has(code)};
async function readRoom(code){return db?JSON.parse(await db.get(roomKey(code))||'null'):localRooms.get(code)||null};
async function saveRoom(code,s){if(db)await db.set(roomKey(code),JSON.stringify(s),'EX',60*60*24*7);else localRooms.set(code,structuredClone(s))};
const sockets=new Map();
const initial=()=>({seats:[null,null,null,null],host:null,config:{mode:'teams',players:4,deal:7,noBuy:false,teams:[0,1,0,1]},game:null,scores:[0,0,0,0],round:0,nextOpening:null,finishEvent:0,log:'Escolha uma cadeira para começar.',players:{}});
let state=initial();
let seats,host,config,game,scores,round,nextOpening,finishEvent,log,players;
function load(s){state=s;({seats,host,config,game,scores,round,nextOpening,finishEvent,log,players}=s)}
function snapshot(){Object.assign(state,{seats,host,config,game,scores,round,nextOpening,finishEvent,log,players});return state}
function send(ws,obj){if(ws.readyState===1)ws.send(JSON.stringify(obj))}
function name(i){return players[seats[i]]?.name||`Jogador ${i+1}`}
function view(id){const seat=seats.indexOf(id);return {type:'state',room:currentRoom,self:seat,isHost:id===host,seats:seats.map(pid=>pid?{name:players[pid]?.name||'Desconectado',online:!!players[pid]&&Date.now()-(players[pid].seen||0)<90000}:null),config,scores,round,log,game:game?{status:game.status,turn:game.turn,chain:game.chain,originIndex:game.originIndex,counts:game.hands.map(h=>h.length),stock:game.stock.length,noBuy:config.noBuy,hand:seat<0?[]:game.hands[seat],last:game.last,winner:game.winner,opening:game.opening,openingChoice:game.openingChoice,closedResult:game.closedResult||null,roundResult:game.roundResult||null}:null}}
function publish(){/* broadcast is handled after each committed transaction */}
function announce(msg){log=msg;publish()}
const tiles=()=>{let a=[];for(let i=0;i<=6;i++)for(let j=i;j<=6;j++)a.push([i,j]);for(let i=a.length-1;i>0;i--){let k=Math.floor(Math.random()*(i+1));[a[i],a[k]]=[a[k],a[i]]}return a};
const teamOf=i=>config.mode==='teams'?config.teams[i]:i;
const groups=()=>config.mode==='teams'?[0,1]:Array.from({length:config.players},(_,i)=>i);
const ends=()=>game.chain.length?[game.chain[0][0],game.chain.at(-1)[1]]:null;
const options=t=>{let e=ends();return !e?['left','right']:['left','right'].filter(s=>s==='left'?t.includes(e[0]):t.includes(e[1]))};



function beginRound(){let a=tiles();game={hands:[[],[],[],[]],stock:[],chain:[],originIndex:0,turn:0,status:'playing',last:'',winner:null,opening:null,openingChoice:null,closedResult:null,roundResult:null};for(let i=0;i<config.players;i++)game.hands[i]=a.splice(0,config.deal);game.stock=a;
if(nextOpening&&config.mode==='teams'){const {seat,double}=nextOpening;nextOpening=null;const idx=game.hands[seat].findIndex(t=>t[0]===double&&t[1]===double);if(idx<0){let holder=game.hands.findIndex(h=>h.some(t=>t[0]===double&&t[1]===double));if(holder>=0){let j=game.hands[holder].findIndex(t=>t[0]===double&&t[1]===double);[game.hands[holder][j],game.hands[seat][0]]=[game.hands[seat][0],game.hands[holder][j]]}else{let j=game.stock.findIndex(t=>t[0]===double&&t[1]===double);if(j>=0)[game.stock[j],game.hands[seat][0]]=[game.hands[seat][0],game.stock[j]]}}game.turn=seat;game.opening=double;game.openingChoice=true}
else{let found=false;for(let n=6;n>=0&&!found;n--)for(let i=0;i<config.players;i++)if(game.hands[i].some(t=>t[0]===n&&t[1]===n)){game.turn=i;game.opening=n;found=true;break}if(!found){game.turn=0;game.opening=null}}
round++;announce(`Rodada ${round}: ${name(game.turn)} começa${game.opening!==null?' com '+game.opening+'-'+game.opening:''}.`)}

function groupLabel(w){
 if(w===null)return 'Empate';
 if(config.mode==='solo')return name(w);
 const members=Array.from({length:config.players},(_,i)=>i).filter(i=>teamOf(i)===w).map(name);
 return `Dupla ${w+1} (${members.join(' e ')})`;
}
function finish(winner,points,msg,actor=null){
 game.status='ended';game.winner=winner;
 if(config.mode==='teams'&&winner!==null)game.openingChoice=winner;
 let matchWinner=null;
 if(winner!==null){
  scores[winner]+=points;
  const win=groups().find(g=>scores[g]>=4);
  if(win!==undefined){game.status='matchOver';matchWinner=win;msg+=` 🏆 ${groupLabel(win)} venceu a partida!`}
 }
 game.roundResult={
  id:++finishEvent,kind:game.closedResult?'closed':'batida',winner,
  winnerLabel:groupLabel(winner),points,actorName:actor===null?null:name(actor),
  matchWinner,matchWinnerLabel:matchWinner===null?null:groupLabel(matchWinner),
  winningScore:winner===null?null:scores[winner]
 };
 announce(msg)
}
function blocked(){if(game.stock.length&&!config.noBuy)return false;return game.hands.slice(0,config.players).every(h=>!h.some(t=>options(t).length))}
function settle(){
 const individual=game.hands.slice(0,config.players).map((h,i)=>({seat:i,name:name(i),team:teamOf(i),points:h.flat().reduce((a,b)=>a+b,0)}));
 const totals=groups().map(g=>({group:g,points:individual.filter(p=>p.team===g).reduce((a,p)=>a+p.points,0)}));
 const min=Math.min(...totals.map(x=>x.points)),winners=totals.filter(x=>x.points===min);
 const winner=winners.length===1?winners[0].group:null;
 game.closedResult={individual,totals,tie:winner===null,winner};
 const detail=individual.map(p=>`${p.name}: ${p.points}`).join(' • ');
 if(winner===null)finish(null,0,`Jogo fechado! ${detail}. Empate: ninguém pontua.`);
 else finish(winner,1,`Jogo fechado! ${detail}. ${config.mode==='teams'?'Dupla '+(winner+1):name(winner)} venceu a rodada (+1 ponto).`);
}
function act(c,msg){let seat=seats.indexOf(c.id),isHost=c.id===host;const fail=s=>send(c.ws,{type:'error',message:s});if(msg.type==='name'){players[c.id].name=String(msg.name||'Convidado').trim().slice(0,22)||'Convidado';publish();return}if(msg.type==='seat'){if(game)return fail('As cadeiras só podem ser trocadas antes da partida.');let i=Number(msg.seat);if(i===-1){if(seat>=0)seats[seat]=null;publish();return}if(!Number.isInteger(i)||i<0||i>3||seats[i]&&seats[i]!==c.id)return fail('Cadeira indisponível.');if(seat>=0)seats[seat]=null;seats[i]=c.id;publish();return}if(msg.type==='config'){if(!isHost||game)return fail('Somente o anfitrião configura antes da partida.');if(!['teams','solo'].includes(msg.mode)||![2,3,4].includes(msg.players)||![6,7].includes(msg.deal)|| (msg.players!==4&&(msg.mode!=='solo'||msg.deal!==7)))return fail('Configuração inválida. Para 2 ou 3 jogadores, use individual com 7 peças.');let teams=msg.teams;if(!Array.isArray(teams)||teams.length!==4||teams.some(v=>v!==0&&v!==1)||teams.filter(v=>v===0).length!==2)return fail('Escolha exatamente dois jogadores em cada dupla.');config={mode:msg.mode,players:msg.players,deal:msg.deal,noBuy:msg.deal===6&&msg.noBuy===true,teams};publish();return}if(msg.type==='start'){if(!isHost)return fail('Somente o anfitrião inicia.');const occupied=seats.map((id,i)=>({id,i})).filter(x=>x.id&&players[x.id]&&Date.now()-(players[x.id].seen||0)<90000);if(occupied.length!==config.players)return fail(`São necessários exatamente ${config.players} jogadores conectados (atualmente ${occupied.length}).`);if(config.players<4){const ids=occupied.map(x=>x.id);seats.splice(0,4,...ids,...Array(4-ids.length).fill(null))};if(game&&game.status==='playing')return fail('A rodada ainda está acontecendo.');if(!game||game.status==='matchOver'){scores=[0,0,0,0];round=0;nextOpening=null}if(game&&game.status==='ended'&&config.mode==='teams'&&game.winner!==null&&!nextOpening)return fail('A dupla vencedora deve escolher quem sai e qual carroção.');beginRound();return}if(msg.type==='chooseOpening'){if(!game||game.status!=='ended'||config.mode!=='teams'||game.winner===null)return fail('Não há escolha de saída pendente.');if(seat<0||teamOf(seat)!==game.winner)return fail('Somente a dupla vencedora escolhe a saída.');let who=Number(msg.seat),double=Number(msg.double);if(!Number.isInteger(who)||who<0||who>=4||teamOf(who)!==game.winner||!Number.isInteger(double)||double<0||double>6)return fail('Escolha um parceiro e um carroção válido.');nextOpening={seat:who,double};game.openingChoice=null;announce(`A dupla vencedora escolheu ${name(who)} para sair com ${double}-${double}.`);return}if(!game||game.status!=='playing')return fail('Não há rodada em andamento.');if(seat!==game.turn)return fail('Não é sua vez.');let h=game.hands[seat];if(msg.type==='play'){let i=Number(msg.index),side=msg.side;if(!Number.isInteger(i)||i<0||i>=h.length||!['left','right'].includes(side))return fail('Jogada inválida.');let t=h[i],opts=options(t);if(!game.chain.length&&game.opening!==null&&(t[0]!==game.opening||t[1]!==game.opening))return fail(`A saída deve ser com o carroção ${game.opening}-${game.opening}.`);if(!opts.includes(side))return fail('Essa peça não encaixa nessa ponta.');let both=game.chain.length>0&&opts.length===2,car=t[0]===t[1],e=ends();h.splice(i,1);if(!e)game.chain.push(t);else if(side==='left'){game.chain.unshift(t[1]===e[0]?t:[t[1],t[0]]);game.originIndex++}else game.chain.push(t[0]===e[1]?t:[t[1],t[0]]);game.last=`${name(seat)} jogou ${t.join('-')}.`;if(!h.length){let pts=both?(car?4:2):1,w=teamOf(seat);finish(w,pts,`${name(seat)} bateu! ${pts} ponto(s) para ${config.mode==='teams'?'dupla '+(w+1):name(seat)}.`,seat);return}if(blocked()){settle();return}game.turn=(seat+1)%config.players;announce(game.last);return}if(msg.type==='buy'){if(h.some(t=>options(t).length))return fail('Você tem peça jogável e precisa utilizá-la.');if(config.noBuy)return fail('Nesta modalidade não há compras. Passe a vez.');if(!game.stock.length)return fail('O monte acabou. Use Passar.');let t=game.stock.shift();h.push(t);announce(`${name(seat)} comprou uma peça.`);return}if(msg.type==='pass'){if(h.some(t=>options(t).length))return fail('Você tem uma peça que pode jogar: é obrigatório jogar.');if(game.stock.length&&!config.noBuy)return fail('Ainda há peças no monte: é obrigatório comprar até encontrar uma peça jogável.');game.last=`${name(seat)} passou a vez.`;if(blocked()){settle();return}game.turn=(seat+1)%config.players;announce(game.last);return}fail('Ação desconhecida.')}

const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,service:'domino-rooms',version:13}))});
const wss=new WebSocketServer({server});
const sequenceByRoom=new Map();
let globalQueue=Promise.resolve();
function sendRoom(code){for(const [ws,c] of sockets){if(c.room===code&&c.id)send(ws,view(c.id))}}
async function withRoom(code,fn,creating=false){
 const key=roomKey(code),lock=key+':lock',token=crypto.randomUUID();
 let acquired=!db;
 if(db){for(let i=0;i<70;i++){if(await db.set(lock,token,'PX',10000,'NX')==='OK'){acquired=true;break}await new Promise(r=>setTimeout(r,35+i*2))}}
 if(!acquired)throw Error('Sala ocupada. Tente novamente.');
 try{
  const room=await readRoom(code);
  if(!creating&&!room)throw Error('Esta sala não existe ou expirou.');
  if(creating&&room)throw Error('Código de sala já utilizado.');
  currentRoom=code;load(room||initial());
  await fn();await saveRoom(code,snapshot());
  sendRoom(code);
  if(pub)await pub.publish('domino:events:v13',code);
 }finally{if(db)await db.eval("if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end",1,lock,token)}
}
function transaction(code,fn,ws,creating=false){
 const prev=globalQueue;
 const task=prev.catch(()=>{}).then(()=>withRoom(code,fn,creating)).catch(e=>{if(ws)send(ws,{type:'error',message:e.message||'Erro na sala.'});console.error(e.message)});
 sequenceByRoom.set(code,task);globalQueue=task;return task;
}
if(sub)sub.subscribe('domino:events:v13').then(()=>sub.on('message',(_channel,code)=>{
 if(!ROOM_RE.test(code))return;
 globalQueue=globalQueue.catch(()=>{}).then(async()=>{const room=await readRoom(code);if(room){currentRoom=code;load(room);sendRoom(code)}}).catch(console.error);
})).catch(console.error);
wss.on('connection',ws=>{
 const c={id:null,room:null,ws};sockets.set(ws,c);
 ws.on('message',data=>{
  let msg;try{msg=JSON.parse(String(data))}catch{return send(ws,{type:'error',message:'Mensagem inválida.'})}
  if(msg.type==='createRoom'){
   if(c.room)return send(ws,{type:'error',message:'Você já está numa sala.'});
   const create=async()=>{
    let code;for(let i=0;i<12;i++){const candidate=roomCode();if(!await roomExists(candidate)){code=candidate;break}}
    if(!code)throw Error('Não foi possível criar uma sala.');
    await transaction(code,()=>{
      const token=crypto.randomUUID();c.id=token;c.room=code;
      host=token;players[token]={name:String(msg.name||'Anfitrião').trim().slice(0,22)||'Anfitrião',seen:Date.now()};
      seats[0]=token;send(ws,{type:'identity',token,room:code});send(ws,{type:'roomJoined',room:code,host:true});
    },ws,true);
   };
   create().catch(e=>send(ws,{type:'error',message:e.message}));return;
  }
  if(msg.type==='hello'){
   const code=String(msg.room||'').toUpperCase();
   if(!ROOM_RE.test(code))return send(ws,{type:'error',message:'Código inválido. Use o link de convite.'});
   if(c.room&&c.room!==code)return send(ws,{type:'error',message:'Já conectado a outra sala.'});
   return transaction(code,()=>{
    const token=typeof msg.token==='string'&&/^[a-f0-9-]{36}$/.test(msg.token)?msg.token:crypto.randomUUID();
    c.id=token;c.room=code;
    if(!players[token])players[token]={name:'Convidado',seen:Date.now()};
    players[token].seen=Date.now();
    // O dono não é transferido automaticamente: só o criador é administrador.
    send(ws,{type:'identity',token,room:code});send(ws,{type:'roomJoined',room:code,host:token===host});
   },ws)
  }
  if(!c.id||!c.room)return send(ws,{type:'error',message:'Crie uma sala ou acesse um link de convite.'});
  transaction(c.room,()=>{
   if(!players[c.id])players[c.id]={name:'Convidado',seen:Date.now()};
   players[c.id].seen=Date.now();
   if(msg.type!=='ping')act(c,msg);
  },ws);
 });
 ws.on('close',()=>sockets.delete(ws));
});
module.exports=server;
