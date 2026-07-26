import { useState, useEffect, useRef } from "react";

const FB = "https://studytoon-dad1f-default-rtdb.firebaseio.com/studytoon_cute";

async function fbGet(path="") {
  try { const r = await fetch(`${FB}/${path}.json`); return await r.json(); } catch { return null; }
}
async function fbSet(path="", data) {
  try { await fetch(`${FB}/${path}.json`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify(data) }); return true; } catch { return false; }
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

// スプラっぽいマップ生成
function generateMap(seed, W, H) {
  const cells = new Array(W * H).fill(0);
  let s = seed;
  const rand = () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };

  // メイン通路（横）
  const hLanes = [Math.floor(H*0.25), Math.floor(H*0.5), Math.floor(H*0.75)];
  // メイン通路（縦）
  const vLanes = [Math.floor(W*0.2), Math.floor(W*0.4), Math.floor(W*0.6), Math.floor(W*0.8)];

  for (let y=0; y<H; y++) for (let x=0; x<W; x++) {
    const isH = hLanes.some(ry => Math.abs(y-ry)<=2);
    const isV = vLanes.some(rx => Math.abs(x-rx)<=2);
    const isEdge = x<=1||x>=W-2||y<=1||y>=H-2;
    // ランダムブロック（建物っぽい）
    const bx = Math.floor(x/4), by = Math.floor(y/4);
    const blockSeed = (bx*31+by*17+seed)&0xffff;
    const isBlock = (blockSeed % 3 === 0) && !isH && !isV && !isEdge;
    if (isH || isV || isEdge || !isBlock) cells[y*W+x] = 1;
  }

  // 中央エリアを開ける
  const cx=Math.floor(W/2), cy=Math.floor(H/2);
  for (let dy=-3;dy<=3;dy++) for (let dx=-3;dx<=3;dx++) {
    const nx=cx+dx, ny=cy+dy;
    if(nx>=0&&nx<W&&ny>=0&&ny<H) cells[ny*W+nx]=1;
  }
  return cells;
}

function spread(ink, cells, playerIdx, amount, W, H) {
  const newInk = [...ink];
  const front = [];
  for (let i=0; i<W*H; i++) {
    if (newInk[i] !== playerIdx) continue;
    const x=i%W, y=Math.floor(i/W);
    [[x-1,y],[x+1,y],[x,y-1],[x,y+1]].forEach(([nx,ny])=>{
      if(nx>=0&&nx<W&&ny>=0&&ny<H){
        const ni=ny*W+nx;
        if(cells[ni]===1&&newInk[ni]===-1) front.push(ni);
      }
    });
  }
  for(let i=front.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[front[i],front[j]]=[front[j],front[i]];}
  let added=0;
  for(const idx of front){
    if(added>=amount) break;
    if(newInk[idx]===-1){newInk[idx]=playerIdx;added++;}
  }
  return newInk;
}

const COLORS=[
  {hex:"#FF2D78",light:"#FF8AB5",dark:"#99003a",name:"ピンク"},
  {hex:"#A8FF00",light:"#D4FF7A",dark:"#4d7a00",name:"ライム"},
  {hex:"#00E5FF",light:"#7FF5FF",dark:"#007a88",name:"シアン"},
  {hex:"#FF6B00",light:"#FFAA66",dark:"#883a00",name:"オレンジ"},
  {hex:"#B400FF",light:"#D966FF",dark:"#5c0088",name:"パープル"},
  {hex:"#FFE600",light:"#FFF27A",dark:"#887a00",name:"イエロー"},
  {hex:"#00FF9C",light:"#7AFFCC",dark:"#008852",name:"グリーン"},
  {hex:"#FF4444",light:"#FF9999",dark:"#882222",name:"レッド"},
];

const MAP_W=36, MAP_H=28, MINS_PER_CELL=10;

// 猫ドット絵（左向き）
function drawCatLeft(ctx, x, y, size, color) {
  const s = size;
  // 体
  ctx.fillStyle = "#e8e8e8";
  ctx.beginPath(); ctx.ellipse(x, y+s*1.5, s*1.2, s, 0, 0, Math.PI*2); ctx.fill();
  // 頭
  ctx.beginPath(); ctx.arc(x-s*0.8, y, s*0.9, 0, Math.PI*2); ctx.fill();
  // 耳
  ctx.fillStyle = "#d0d0d0";
  ctx.beginPath(); ctx.moveTo(x-s*1.5,y-s*0.5); ctx.lineTo(x-s*1.1,y-s*1.3); ctx.lineTo(x-s*0.7,y-s*0.5); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x-s*0.9,y-s*0.5); ctx.lineTo(x-s*0.5,y-s*1.1); ctx.lineTo(x-s*0.2,y-s*0.5); ctx.fill();
  // 耳内側
  ctx.fillStyle = color+"88";
  ctx.beginPath(); ctx.moveTo(x-s*1.4,y-s*0.6); ctx.lineTo(x-s*1.1,y-s*1.1); ctx.lineTo(x-s*0.8,y-s*0.6); ctx.fill();
  // 目
  ctx.fillStyle = "#FFD700";
  ctx.beginPath(); ctx.ellipse(x-s*1.0,y-s*0.1,s*0.2,s*0.25,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#000"; ctx.beginPath(); ctx.ellipse(x-s*1.0,y-s*0.1,s*0.08,s*0.22,0,0,Math.PI*2); ctx.fill();
  // 鼻
  ctx.fillStyle="#ffaaaa";
  ctx.beginPath(); ctx.arc(x-s*1.3,y+s*0.15,s*0.1,0,Math.PI*2); ctx.fill();
  // ヒゲ
  ctx.strokeStyle="#888"; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(x-s*1.4,y+s*0.1); ctx.lineTo(x-s*1.9,y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x-s*1.4,y+s*0.2); ctx.lineTo(x-s*1.9,y+s*0.3); ctx.stroke();
  // ネクタイ
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(x-s*0.3,y+s*0.5); ctx.lineTo(x-s*0.1,y+s*0.8); ctx.lineTo(x-s*0.3,y+s*1.1); ctx.lineTo(x-s*0.5,y+s*0.8); ctx.fill();
  // しっぽ
  ctx.strokeStyle="#d0d0d0"; ctx.lineWidth=s*0.3; ctx.lineCap="round";
  ctx.beginPath(); ctx.moveTo(x+s*1.0,y+s*1.5); ctx.quadraticCurveTo(x+s*1.8,y+s*0.8,x+s*1.5,y); ctx.stroke();
}

function drawCatRight(ctx, x, y, size, color) {
  ctx.save(); ctx.scale(-1,1); drawCatLeft(ctx,-x,y,size,color); ctx.restore();
}

export default function App() {
  const cvs = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [screen, setScreen] = useState("join");
  const [myName, setMyName] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [players, setPlayers] = useState({});
  const [matches, setMatches] = useState({});
  const [activeMatch, setActiveMatch] = useState(null);
  const [inputH, setInputH] = useState("");
  const [inputM, setInputM] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [resultAnim, setResultAnim] = useState(false);

  useEffect(()=>{loadAll();},[]);
  useEffect(()=>{
    const iv=setInterval(()=>loadAll(),8000);
    return()=>clearInterval(iv);
  },[]);

  async function loadAll() {
    const data = await fbGet();
    if(data){
      if(data.players) setPlayers(data.players);
      if(data.matches) setMatches(data.matches);
    }
    setLoaded(true);
  }

  async function saveAll(newPlayers, newMatches) {
    setSyncing(true);
    await fbSet("",{players:newPlayers||players, matches:newMatches||matches});
    setSyncing(false);
  }

  function getMatchId(a,b){ return [a,b].sort().join("__")+"__"+todayKey(); }

  async function challengePlayer(target) {
    const id = getMatchId(myName, target);
    let match = matches[id];
    if(!match) {
      const dateNum = parseInt(todayKey().replace(/-/g,""));
      const seed = dateNum ^ (myName+target).split("").reduce((s,c)=>s+c.charCodeAt(0),0);
      const cells = generateMap(seed, MAP_W, MAP_H);
      const ink = new Array(MAP_W*MAP_H).fill(-1);
      // 左側スタート（p1）
      for(let y=0;y<MAP_H;y++) for(let x=0;x<6;x++){
        if(cells[y*MAP_W+x]===1) ink[y*MAP_W+x]=0;
      }
      // 右側スタート（p2）
      for(let y=0;y<MAP_H;y++) for(let x=MAP_W-6;x<MAP_W;x++){
        if(cells[y*MAP_W+x]===1) ink[y*MAP_W+x]=1;
      }
      const p1=[myName,target].sort()[0], p2=[myName,target].sort()[1];
      match={p1,p2,cells:Array.from(cells),ink,date:todayKey(),mins1:0,mins2:0};
      const newMatches={...matches,[id]:match};
      setMatches(newMatches);
      await saveAll(players,newMatches);
    }
    setActiveMatch({id,...match});
    setResultAnim(false);
    setScreen("match");
  }

  async function joinGame() {
    if(!nameInput.trim()) return;
    const name=nameInput.trim();
    const newPlayers={...players};
    if(!newPlayers[name]) newPlayers[name]={colorIdx:Object.keys(newPlayers).length%COLORS.length};
    setPlayers(newPlayers); setMyName(name);
    await saveAll(newPlayers,matches);
    setScreen("home");
  }

  async function submitStudy() {
    const h=parseInt(inputH||"0"),m=parseInt(inputM||"0");
    const total=h*60+m; if(!total) return;
    const cells=Math.floor(total/MINS_PER_CELL);
    const newMatches={...matches};
    const today=todayKey();
    Object.keys(newMatches).forEach(id=>{
      const match=newMatches[id];
      if(match.date!==today) return;
      const isP1=match.p1===myName, isP2=match.p2===myName;
      if(!isP1&&!isP2) return;
      const playerIdx=isP1?0:1;
      const newInk=spread(match.ink,match.cells,playerIdx,cells,MAP_W,MAP_H);
      newMatches[id]={...match,ink:newInk,
        mins1:isP1?(match.mins1||0)+total:match.mins1||0,
        mins2:isP2?(match.mins2||0)+total:match.mins2||0};
    });
    setMatches(newMatches);
    if(activeMatch){
      const updated=newMatches[activeMatch.id];
      if(updated) setActiveMatch({id:activeMatch.id,...updated});
    }
    await saveAll(players,newMatches);
    setInputH("");setInputM("");
    setScreen(activeMatch?"match":"home");
  }

  function getStats(match) {
    const floor=match.cells.filter(c=>c===1).length||1;
    const c0=match.ink.filter(v=>v===0).length;
    const c1=match.ink.filter(v=>v===1).length;
    return{pct0:Math.round(c0/floor*100),pct1:Math.round(c1/floor*100)};
  }
  function getPlayerColor(name){
    const p=players[name]; if(!p) return COLORS[0];
    return COLORS[p.colorIdx%COLORS.length];
  }

  // Canvas描画
  useEffect(()=>{
    if(!cvs.current||!activeMatch||(screen!=="match"&&screen!=="result")) return;
    const canvas=cvs.current;
    const ctx=canvas.getContext("2d");
    const W=canvas.width,H=canvas.height;
    const cw=Math.floor(W/MAP_W),ch=Math.floor(H/MAP_H);
    ctx.fillStyle="#0a0a1a"; ctx.fillRect(0,0,W,H);
    const col0=getPlayerColor(activeMatch.p1);
    const col1=getPlayerColor(activeMatch.p2);
    for(let y=0;y<MAP_H;y++) for(let x=0;x<MAP_W;x++){
      const idx=y*MAP_W+x;
      const cell=activeMatch.cells[idx];
      const ink=activeMatch.ink[idx];
      const px=x*cw,py=y*ch;
      if(cell===0){
        // 壁：立体感
        ctx.fillStyle=(x+y)%2===0?"#08081a":"#0d0d22";
        ctx.fillRect(px,py,cw,ch);
        // 壁の角
        ctx.fillStyle="#ffffff08";
        ctx.fillRect(px,py,1,ch);
        ctx.fillRect(px,py,cw,1);
      } else if(ink===0){
        ctx.fillStyle=(x+y)%2===0?col0.hex+"ee":col0.dark+"ff";
        ctx.fillRect(px,py,cw,ch);
        // インクの光沢
        ctx.fillStyle="#ffffff22";
        ctx.fillRect(px,py,cw,2);
      } else if(ink===1){
        ctx.fillStyle=(x+y)%2===0?col1.hex+"ee":col1.dark+"ff";
        ctx.fillRect(px,py,cw,ch);
        ctx.fillStyle="#ffffff22";
        ctx.fillRect(px,py,cw,2);
      } else {
        ctx.fillStyle=(x+y)%2===0?"#1a1a2e":"#16162a";
        ctx.fillRect(px,py,cw,ch);
      }
    }
    // 国境線（インクの縁）
    for(let y=0;y<MAP_H;y++) for(let x=0;x<MAP_W;x++){
      const idx=y*MAP_W+x; if(activeMatch.ink[idx]<0||activeMatch.cells[idx]===0) continue;
      const px=x*cw,py=y*ch;
      const col=activeMatch.ink[idx]===0?col0:col1;
      [[1,0],[0,1],[-1,0],[0,-1]].forEach(([dx,dy])=>{
        const nx=x+dx,ny=y+dy;
        if(nx<0||nx>=MAP_W||ny<0||ny>=MAP_H) return;
        const ni=ny*MAP_W+nx;
        if(activeMatch.ink[ni]!==activeMatch.ink[idx]){
          ctx.fillStyle=col.light+"cc";
          if(dx===1) ctx.fillRect(px+cw-1,py,2,ch);
          if(dx===-1) ctx.fillRect(px-1,py,2,ch);
          if(dy===1) ctx.fillRect(px,py+ch-1,cw,2);
          if(dy===-1) ctx.fillRect(px,py-1,cw,2);
        }
      });
    }
  },[activeMatch,screen]);

  const myColor=getPlayerColor(myName);
  const todayMatches=Object.entries(matches).filter(([,m])=>m.date===todayKey()&&(m.p1===myName||m.p2===myName));

  const css=`
    *{box-sizing:border-box}body{margin:0;font-family:'Segoe UI',sans-serif;-webkit-tap-highlight-color:transparent}
    @keyframes winslide{0%{opacity:0;transform:translateX(-60px)}100%{opacity:1;transform:translateX(0)}}
    @keyframes loseslide{0%{opacity:0;transform:translateX(60px)}100%{opacity:1;transform:translateX(0)}}
    @keyframes pctpop{0%{opacity:0;transform:scale(0.5)}60%{transform:scale(1.1)}100%{opacity:1;transform:scale(1)}}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
    @keyframes inkflow{0%{transform:scaleX(0)}100%{transform:scaleX(1)}}
    @keyframes stripe{0%{background-position:0 0}100%{background-position:40px 0}}
    .btn{border:none;border-radius:20px;padding:12px 24px;font-size:14px;font-weight:900;cursor:pointer;transition:all 0.15s;letter-spacing:1px;touch-action:manipulation}
    .btn:hover{transform:scale(1.05)}.btn:active{transform:scale(0.95)}
    .panel{background:#ffffff18;border-radius:16px;padding:16px;backdrop-filter:blur(10px)}
    input{background:#ffffff22;border:2px solid #ffffff44;color:#fff;border-radius:12px;padding:12px 14px;font-size:16px;outline:none;width:100%;font-family:inherit}
    input::placeholder{color:#ffffff66}
    input:focus{border-color:#fff}
    ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#ffffff33;border-radius:2px}
  `;

  if(!loaded) return(
    <div style={{height:"100vh",background:"linear-gradient(135deg,#1a0030,#003060)",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16,color:"#fff"}}>
      <div style={{fontSize:36,fontWeight:900,letterSpacing:4}}>🦑 STUDYTOON</div>
      <div style={{fontSize:12,opacity:0.6,animation:"pulse 1s infinite"}}>接続中...</div>
      <style>{`@keyframes pulse{0%,100%{opacity:0.6}50%{opacity:0.2}}`}</style>
    </div>
  );

  // ─── JOIN ────────────────────────────────────────────
  if(screen==="join") return(
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#1a0030,#003060)",display:"flex",alignItems:"center",justifyContent:"center",padding:20,color:"#fff"}}>
      <style>{css}</style>
      <div style={{width:"100%",maxWidth:420,textAlign:"center"}}>
        <div style={{fontSize:52,marginBottom:8}}>🦑</div>
        <div style={{fontSize:34,fontWeight:900,letterSpacing:4,marginBottom:4,background:"linear-gradient(90deg,#FF2D78,#A8FF00,#00E5FF)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>STUDYTOON</div>
        <div style={{fontSize:12,opacity:0.6,marginBottom:28,letterSpacing:2}}>勉強でインクを塗りあおう！</div>
        {Object.keys(players).length>0&&(
          <div className="panel" style={{marginBottom:16,textAlign:"left"}}>
            <div style={{fontSize:12,opacity:0.7,marginBottom:10}}>👤 前回のプレイヤーを選択</div>
            {Object.keys(players).map(p=>{
              const pc=COLORS[players[p].colorIdx%COLORS.length];
              return(
                <button key={p} onClick={()=>{setMyName(p);setScreen("home");}} style={{background:"#ffffff11",border:`2px solid ${pc.hex}55`,borderRadius:12,padding:"12px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:10,color:"#fff",width:"100%",marginBottom:8,fontSize:15}}>
                  <div style={{width:12,height:12,borderRadius:3,background:pc.hex,flexShrink:0}}/>
                  <span style={{fontWeight:900,color:pc.hex}}>{p}</span>
                  <span style={{marginLeft:"auto",fontSize:12,opacity:0.5}}>▶ 再開</span>
                </button>
              );
            })}
          </div>
        )}
        <div className="panel" style={{textAlign:"left"}}>
          <div style={{fontSize:12,opacity:0.7,marginBottom:10}}>🆕 新しく参加する</div>
          <input placeholder="名前を入力..." value={nameInput} onChange={e=>setNameInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&joinGame()} style={{marginBottom:12}}/>
          <button className="btn" style={{background:"linear-gradient(135deg,#FF2D78,#b400ff)",color:"#fff",width:"100%",fontSize:16,padding:"14px"}} onClick={joinGame} disabled={!nameInput.trim()}>
            🎮 参加する！
          </button>
        </div>
      </div>
    </div>
  );

  // ─── HOME ────────────────────────────────────────────
  if(screen==="home") return(
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#1a0030,#003060)",color:"#fff",padding:"16px 16px 100px"}}>
      <style>{css}</style>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:22}}>🦑</span>
          <span style={{fontSize:17,fontWeight:900,letterSpacing:2}}>STUDYTOON</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:10,height:10,borderRadius:3,background:myColor.hex}}/>
          <span style={{fontSize:13,opacity:0.8}}>{myName}</span>
          <button onClick={()=>{setMyName("");setScreen("join");}} style={{background:"#ffffff22",border:"none",color:"#fff",borderRadius:8,padding:"5px 10px",fontSize:12,cursor:"pointer"}}>退出</button>
        </div>
      </div>
      <div style={{textAlign:"center",marginBottom:20}}>
        <div style={{fontSize:11,opacity:0.5,letterSpacing:2,marginBottom:4}}>TODAY</div>
        <div style={{fontSize:18,fontWeight:900}}>{todayKey()}</div>
      </div>
      {todayMatches.length>0&&(
        <div style={{marginBottom:20}}>
          <div style={{fontSize:11,opacity:0.6,letterSpacing:2,marginBottom:10}}>⚔️ 進行中のマッチ</div>
          {todayMatches.map(([id,match])=>{
            const opp=match.p1===myName?match.p2:match.p1;
            const isP1=match.p1===myName;
            const stats=getStats(match);
            const myPct=isP1?stats.pct0:stats.pct1;
            const oppPct=isP1?stats.pct1:stats.pct0;
            const oppColor=getPlayerColor(opp);
            const winning=myPct>oppPct;
            return(
              <button key={id} onClick={()=>{setActiveMatch({id,...match});setResultAnim(false);setScreen("match");}} style={{background:"#ffffff15",border:`2px solid ${winning?myColor.hex+"88":"#ffffff33"}`,borderRadius:16,padding:"14px 16px",cursor:"pointer",textAlign:"left",color:"#fff",width:"100%",marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{width:8,height:8,borderRadius:2,background:myColor.hex}}/>
                    <span style={{fontSize:13,fontWeight:900}}>{myName}</span>
                    <span style={{fontSize:11,opacity:0.4}}>vs</span>
                    <div style={{width:8,height:8,borderRadius:2,background:oppColor.hex}}/>
                    <span style={{fontSize:13,fontWeight:900}}>{opp}</span>
                  </div>
                  <span style={{fontSize:13,fontWeight:900,color:winning?myColor.hex:oppColor.hex}}>{myPct}% - {oppPct}%</span>
                </div>
                <div style={{height:8,borderRadius:4,overflow:"hidden",background:"#ffffff22",display:"flex"}}>
                  <div style={{width:`${myPct}%`,background:`linear-gradient(90deg,${myColor.hex},${myColor.light})`,transition:"width 0.5s"}}/>
                  <div style={{flex:1,background:"#ffffff11"}}/>
                  <div style={{width:`${oppPct}%`,background:`linear-gradient(90deg,${oppColor.light},${oppColor.hex})`,transition:"width 0.5s"}}/>
                </div>
              </button>
            );
          })}
        </div>
      )}
      <div style={{marginBottom:20}}>
        <div style={{fontSize:11,opacity:0.6,letterSpacing:2,marginBottom:10}}>🎯 誰と戦う？</div>
        {Object.keys(players).filter(p=>p!==myName).length===0
          ?<div style={{fontSize:12,opacity:0.4,textAlign:"center",padding:"20px 0"}}>まだ他のプレイヤーがいません</div>
          :Object.keys(players).filter(p=>p!==myName).map(p=>{
            const pc=getPlayerColor(p);
            const already=todayMatches.some(([,m])=>m.p1===p||m.p2===p);
            return(
              <button key={p} onClick={()=>challengePlayer(p)} style={{background:already?"#ffffff08":"#ffffff15",border:`2px solid ${pc.hex}${already?"22":"66"}`,borderRadius:14,padding:"13px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:10,color:"#fff",width:"100%",marginBottom:8,opacity:already?0.7:1}}>
                <div style={{width:10,height:10,borderRadius:3,background:pc.hex}}/>
                <span style={{fontSize:14,fontWeight:900,color:pc.hex}}>{p}</span>
                <span style={{marginLeft:"auto",fontSize:12,opacity:0.6}}>{already?"対戦中 →":"挑戦する ⚔️"}</span>
              </button>
            );
          })
        }
      </div>
      <button className="btn" style={{background:`linear-gradient(135deg,${myColor.hex},${myColor.dark})`,color:"#fff",width:"100%",fontSize:15,padding:"15px"}} onClick={()=>setScreen("record")}>
        📚 勉強時間を記録
      </button>
    </div>
  );

  // ─── MATCH ───────────────────────────────────────────
  if(screen==="match"&&activeMatch){
    const isP1=activeMatch.p1===myName;
    const opp=isP1?activeMatch.p2:activeMatch.p1;
    const oppColor=getPlayerColor(opp);
    const stats=getStats(activeMatch);
    const myPct=isP1?stats.pct0:stats.pct1;
    const oppPct=isP1?stats.pct1:stats.pct0;
    const winning=myPct>oppPct;
    return(
      <div style={{height:"100vh",background:"#0a0a1a",color:"#fff",display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <style>{css}</style>
        {/* ヘッダー */}
        <div style={{padding:"10px 14px",display:"flex",alignItems:"center",gap:10,background:"#000000aa",flexShrink:0}}>
          <button onClick={()=>{setActiveMatch(null);setScreen("home");}} style={{background:"none",border:"none",color:"#fff",cursor:"pointer",fontSize:22,opacity:0.7,padding:4}}>←</button>
          <div style={{display:"flex",alignItems:"center",gap:6,flex:1,justifyContent:"center"}}>
            <div style={{width:8,height:8,borderRadius:2,background:myColor.hex}}/>
            <span style={{fontSize:13,fontWeight:900,color:myColor.hex}}>{myName}</span>
            <span style={{fontSize:11,opacity:0.4}}>vs</span>
            <span style={{fontSize:13,fontWeight:900,color:oppColor.hex}}>{opp}</span>
            <div style={{width:8,height:8,borderRadius:2,background:oppColor.hex}}/>
          </div>
          <span style={{fontSize:11,opacity:0.4}}>{activeMatch.date}</span>
        </div>
        {/* マップ */}
        <div style={{flex:1,overflow:"hidden",position:"relative"}}>
          <canvas ref={cvs} width={MAP_W*13} height={MAP_H*13} style={{width:"100%",height:"100%",display:"block",imageRendering:"pixelated"}}/>
        </div>
        {/* ゲージ */}
        <div style={{background:"#000000cc",padding:"10px 14px",flexShrink:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <div style={{width:10,height:10,borderRadius:2,background:myColor.hex}}/>
              <span style={{fontSize:13,fontWeight:900}}>{myName}</span>
            </div>
            <div style={{fontSize:22,fontWeight:900,letterSpacing:2}}>
              <span style={{color:myColor.hex}}>{myPct}%</span>
              <span style={{opacity:0.3,margin:"0 8px"}}>vs</span>
              <span style={{color:oppColor.hex}}>{oppPct}%</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:13,fontWeight:900}}>{opp}</span>
              <div style={{width:10,height:10,borderRadius:2,background:oppColor.hex}}/>
            </div>
          </div>
          <div style={{height:18,borderRadius:9,overflow:"hidden",background:"#ffffff22",display:"flex"}}>
            <div style={{width:`${myPct}%`,background:`linear-gradient(90deg,${myColor.hex},${myColor.light})`,transition:"width 1s ease"}}/>
            <div style={{flex:1,background:"#ffffff08"}}/>
            <div style={{width:`${oppPct}%`,background:`linear-gradient(90deg,${oppColor.light},${oppColor.hex})`,transition:"width 1s ease"}}/>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:4,fontSize:11,opacity:0.5}}>
            <span>📚{Math.floor((isP1?activeMatch.mins1:activeMatch.mins2)/60)}h{(isP1?activeMatch.mins1:activeMatch.mins2)%60}m</span>
            <span>{Math.floor((isP1?activeMatch.mins2:activeMatch.mins1)/60)}h{(isP1?activeMatch.mins2:activeMatch.mins1)%60}m📚</span>
          </div>
        </div>
        {/* ボタン */}
        <div style={{padding:"10px 14px 20px",background:"#000000cc",display:"flex",gap:10,flexShrink:0}}>
          <button className="btn" style={{background:`linear-gradient(135deg,${myColor.hex},${myColor.dark})`,color:"#fff",flex:1,fontSize:14}} onClick={()=>setScreen("record")}>
            📚 勉強して塗る！
          </button>
          <button className="btn" style={{background:"#ffffff22",color:"#fff",fontSize:14,padding:"12px 16px"}} onClick={()=>{setResultAnim(true);setScreen("result");}}>
            結果 🏆
          </button>
        </div>
      </div>
    );
  }

  // ─── RESULT（スプラ風）────────────────────────────────
  if(screen==="result"&&activeMatch){
    const isP1=activeMatch.p1===myName;
    const opp=isP1?activeMatch.p2:activeMatch.p1;
    const oppColor=getPlayerColor(opp);
    const stats=getStats(activeMatch);
    const myPct=isP1?stats.pct0:stats.pct1;
    const oppPct=isP1?stats.pct1:stats.pct0;
    const winning=myPct>=oppPct;
    const label=myPct===oppPct?"DRAW!":winning?"WIN!":"LOSE...";
    const labelColor=myPct===oppPct?"#FFE600":winning?"#A8FF00":"#FF2D78";
    return(
      <div style={{height:"100vh",overflow:"hidden",position:"relative",background:"#0a0a1a",color:"#fff"}}>
        <style>{css}</style>
        {/* ストライプ背景 */}
        <div style={{position:"absolute",inset:0,background:`repeating-linear-gradient(45deg,${winning?myColor.hex+"22":"#FF2D7822"} 0px,${winning?myColor.hex+"22":"#FF2D7822"} 20px,transparent 20px,transparent 40px)`,animation:"stripe 2s linear infinite"}}/>
        {/* WIN/LOSE テキスト */}
        <div style={{position:"absolute",top:"10%",left:0,right:0,textAlign:"center",fontSize:72,fontWeight:900,color:labelColor,textShadow:"4px 4px 0px #000",letterSpacing:4,animation:"pctpop 0.6s ease 0.2s both"}}>
          {label}
        </div>
        {/* マップ（中央） */}
        <div style={{position:"absolute",top:"18%",left:"50%",transform:"translateX(-50%)",width:"55vw",maxWidth:280,aspectRatio:"1.3"}}>
          <canvas ref={cvs} width={MAP_W*8} height={MAP_H*8} style={{width:"100%",height:"100%",display:"block",imageRendering:"pixelated",borderRadius:8,boxShadow:"0 0 30px #00000088"}}/>
        </div>
        {/* 左の猫（自分） */}
        <div style={{position:"absolute",bottom:"18%",left:"-2%",animation:`${winning?"winslide":"loseslide"} 0.5s ease 0.3s both`}}>
          <canvas id="catL" width={120} height={120} ref={el=>{
            if(!el)return;
            const ctx=el.getContext("2d");
            ctx.clearRect(0,0,120,120);
            drawCatLeft(ctx,70,70,18,myColor.hex);
          }}/>
        </div>
        {/* 右の猫（相手） */}
        <div style={{position:"absolute",bottom:"18%",right:"-2%",animation:`${!winning?"winslide":"loseslide"} 0.5s ease 0.3s both`}}>
          <canvas id="catR" width={120} height={120} ref={el=>{
            if(!el)return;
            const ctx=el.getContext("2d");
            ctx.clearRect(0,0,120,120);
            drawCatRight(ctx,50,70,18,oppColor.hex);
          }}/>
        </div>
        {/* スコアバー */}
        <div style={{position:"absolute",bottom:"4%",left:"5%",right:"5%"}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
            <div style={{textAlign:"left"}}>
              <div style={{fontSize:11,opacity:0.7,marginBottom:2}}>{myName}</div>
              <div style={{fontSize:36,fontWeight:900,color:myColor.hex,animation:"pctpop 0.5s ease 0.6s both",opacity:0}}>{myPct}.0%</div>
              <div style={{fontSize:11,opacity:0.5}}>📚{Math.floor((isP1?activeMatch.mins1:activeMatch.mins2)/60)}h{(isP1?activeMatch.mins1:activeMatch.mins2)%60}m</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:11,opacity:0.7,marginBottom:2}}>{opp}</div>
              <div style={{fontSize:36,fontWeight:900,color:oppColor.hex,animation:"pctpop 0.5s ease 0.8s both",opacity:0}}>{oppPct}.0%</div>
              <div style={{fontSize:11,opacity:0.5}}>{Math.floor((isP1?activeMatch.mins2:activeMatch.mins1)/60)}h{(isP1?activeMatch.mins2:activeMatch.mins1)%60}m📚</div>
            </div>
          </div>
          {/* ゲージ */}
          <div style={{height:22,borderRadius:11,overflow:"hidden",background:"#ffffff22",display:"flex",boxShadow:"0 2px 10px #00000066"}}>
            <div style={{width:`${myPct}%`,background:`linear-gradient(90deg,${myColor.hex},${myColor.light})`,transition:"width 1s ease"}}/>
            <div style={{flex:1,background:"#ffffff08"}}/>
            <div style={{width:`${oppPct}%`,background:`linear-gradient(90deg,${oppColor.light},${oppColor.hex})`,transition:"width 1s ease"}}/>
          </div>
          <div style={{display:"flex",gap:10,marginTop:14}}>
            <button className="btn" style={{background:"#ffffff22",color:"#fff",flex:1,fontSize:13}} onClick={()=>setScreen("match")}>← マップに戻る</button>
            <button className="btn" style={{background:`linear-gradient(135deg,${myColor.hex},${myColor.dark})`,color:"#fff",flex:1,fontSize:13}} onClick={()=>{setActiveMatch(null);setScreen("home");}}>ホームへ 🏠</button>
          </div>
        </div>
      </div>
    );
  }

  // ─── RECORD ──────────────────────────────────────────
  if(screen==="record") return(
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#1a0030,#003060)",color:"#fff",padding:20}}>
      <style>{css}</style>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:24}}>
        <button onClick={()=>setScreen(activeMatch?"match":"home")} style={{background:"none",border:"none",color:"#fff",cursor:"pointer",fontSize:22,opacity:0.7,padding:4}}>←</button>
        <span style={{fontSize:18,fontWeight:900}}>📚 勉強時間を記録</span>
      </div>
      <div className="panel" style={{marginBottom:16}}>
        <div style={{fontSize:13,opacity:0.7,marginBottom:14}}>今日何時間勉強した？</div>
        <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:16}}>
          <div style={{flex:1}}>
            <input type="number" placeholder="0" min="0" value={inputH} onChange={e=>setInputH(e.target.value)} style={{fontSize:24,textAlign:"center",padding:"14px"}}/>
            <div style={{fontSize:12,opacity:0.5,textAlign:"center",marginTop:6}}>時間</div>
          </div>
          <span style={{fontSize:28,opacity:0.4,fontWeight:900}}>:</span>
          <div style={{flex:1}}>
            <input type="number" placeholder="0" min="0" max="59" value={inputM} onChange={e=>setInputM(e.target.value)} style={{fontSize:24,textAlign:"center",padding:"14px"}}/>
            <div style={{fontSize:12,opacity:0.5,textAlign:"center",marginTop:6}}>分</div>
          </div>
        </div>
        <div style={{fontSize:11,opacity:0.5,marginBottom:14,background:"#ffffff11",borderRadius:10,padding:"10px 14px",lineHeight:1.8}}>
          {MINS_PER_CELL}分 = 1マス塗れる 🎨<br/>
          今日の全マッチに一括反映されます
        </div>
        <button className="btn" style={{background:`linear-gradient(135deg,${myColor.hex},${myColor.dark})`,color:"#fff",width:"100%",fontSize:16,padding:"15px"}} onClick={submitStudy} disabled={!parseInt(inputH||"0")&&!parseInt(inputM||"0")}>
          🎨 インクを塗る！
        </button>
      </div>
      {todayMatches.length>0&&(
        <div className="panel">
          <div style={{fontSize:11,opacity:0.6,marginBottom:10}}>今日のマッチ（全部に反映）</div>
          {todayMatches.map(([id,match])=>{
            const opp=match.p1===myName?match.p2:match.p1;
            const isP1=match.p1===myName;
            const stats=getStats(match);
            const myPct=isP1?stats.pct0:stats.pct1;
            const oppPct=isP1?stats.pct1:stats.pct0;
            const oppColor=getPlayerColor(opp);
            return(
              <div key={id} style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}>
                  <span>vs <span style={{color:oppColor.hex,fontWeight:900}}>{opp}</span></span>
                  <span style={{color:myColor.hex,fontWeight:900}}>{myPct}%</span>
                </div>
                <div style={{height:8,borderRadius:4,overflow:"hidden",background:"#ffffff22",display:"flex"}}>
                  <div style={{width:`${myPct}%`,background:myColor.hex}}/>
                  <div style={{flex:1,background:"#ffffff11"}}/>
                  <div style={{width:`${oppPct}%`,background:oppColor.hex}}/>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return null;
}
