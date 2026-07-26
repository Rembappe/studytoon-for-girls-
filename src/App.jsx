import { useState, useEffect, useRef } from "react";

const FB = "https://studytoon-dad1f-default-rtdb.firebaseio.com/studytoon_cute";

async function fbGet(path="") {
  try { const r = await fetch(`${FB}/${path}.json`); return await r.json(); } catch { return null; }
}
async function fbSet(path="", data) {
  try { await fetch(`${FB}/${path}.json`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify(data) }); return true; } catch { return false; }
}

// 今日の日付キー
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

// 日付シードからマップ生成（ブロック型）
function generateMap(seed, W, H) {
  const cells = new Array(W*H).fill(0); // 0=壁 1=床
  // シード付き疑似乱数
  let s = seed;
  const rand = () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
  // 道路グリッド（縦横の通路）
  const vRoads = [Math.floor(W*0.3), Math.floor(W*0.5), Math.floor(W*0.7)];
  const hRoads = [Math.floor(H*0.3), Math.floor(H*0.5), Math.floor(H*0.7)];
  // 全部壁にしてから通路を開ける
  for (let y=0; y<H; y++) for (let x=0; x<W; x++) {
    const isVRoad = vRoads.some(rx => Math.abs(x-rx)<=1);
    const isHRoad = hRoads.some(ry => Math.abs(y-ry)<=1);
    if (isVRoad || isHRoad) cells[y*W+x] = 1;
    // ランダムで追加通路
    else if (rand() < 0.15) cells[y*W+x] = 1;
  }
  // 端も通路に
  for (let x=0; x<W; x++) { cells[0*W+x]=1; cells[(H-1)*W+x]=1; }
  for (let y=0; y<H; y++) { cells[y*W+0]=1; cells[y*W+W-1]=1; }
  return cells;
}

// 塗り広がりBFS
function spread(ink, cells, playerIdx, amount, W, H) {
  const newInk = [...ink];
  const front = [];
  for (let i=0; i<W*H; i++) {
    if (newInk[i] !== playerIdx) continue;
    const x=i%W, y=Math.floor(i/W);
    [[x-1,y],[x+1,y],[x,y-1],[x,y+1]].forEach(([nx,ny])=>{
      if (nx>=0&&nx<W&&ny>=0&&ny<H) {
        const ni=ny*W+nx;
        if (cells[ni]===1 && newInk[ni]===-1) front.push(ni);
      }
    });
  }
  // シャッフル
  for (let i=front.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[front[i],front[j]]=[front[j],front[i]];}
  let added=0;
  for (const idx of front) {
    if (added>=amount) break;
    if (newInk[idx]===-1) { newInk[idx]=playerIdx; added++; }
  }
  return newInk;
}

const COLORS = [
  {hex:"#FF2D78", light:"#FF8AB5", dark:"#99003a", name:"ピンク"},
  {hex:"#A8FF00", light:"#D4FF7A", dark:"#4d7a00", name:"ライム"},
  {hex:"#00E5FF", light:"#7FF5FF", dark:"#007a88", name:"シアン"},
  {hex:"#FF6B00", light:"#FFAA66", dark:"#883a00", name:"オレンジ"},
  {hex:"#B400FF", light:"#D966FF", dark:"#5c0088", name:"パープル"},
  {hex:"#FFE600", light:"#FFF27A", dark:"#887a00", name:"イエロー"},
  {hex:"#00FF9C", light:"#7AFFCC", dark:"#008852", name:"グリーン"},
  {hex:"#FF4444", light:"#FF9999", dark:"#882222", name:"レッド"},
];

const MAP_W = 32, MAP_H = 24;
const MINS_PER_CELL = 10; // 10分で1マス

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [screen, setScreen] = useState("join"); // join|home|match|record
  const [myName, setMyName] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [players, setPlayers] = useState({}); // {name: {colorIdx}}
  const [matches, setMatches] = useState({}); // {matchId: {p1,p2,ink,date}}
  const [activeMatch, setActiveMatch] = useState(null);
  const [inputH, setInputH] = useState("");
  const [inputM, setInputM] = useState("");
  const [challengeTarget, setChallengeTarget] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const cvs = useRef(null);

  useEffect(() => { loadAll(); }, []);
  useEffect(() => {
    const iv = setInterval(() => loadAll(), 8000);
    return () => clearInterval(iv);
  }, []);

  async function loadAll() {
    const data = await fbGet();
    if (data) {
      if (data.players) setPlayers(data.players);
      if (data.matches) setMatches(data.matches);
    }
    setLoaded(true);
  }

  async function saveAll(newPlayers, newMatches) {
    setSyncing(true);
    await fbSet("", { players: newPlayers || players, matches: newMatches || matches });
    setSyncing(false);
  }

  function getMatchId(a, b) {
    return [a,b].sort().join("__") + "__" + todayKey();
  }

  function getOrCreateMatch(p1, p2) {
    const id = getMatchId(p1, p2);
    if (matches[id]) return { id, match: matches[id] };
    const dateNum = parseInt(todayKey().replace(/-/g,""));
    const seed = dateNum ^ (p1+p2).split("").reduce((s,c)=>s+c.charCodeAt(0),0);
    const cells = generateMap(seed, MAP_W, MAP_H);
    // 初期配置
    const ink = new Array(MAP_W*MAP_H).fill(-1);
    // p1は左側、p2は右側からスタート
    const startCells1 = [], startCells2 = [];
    for (let i=0; i<MAP_W*MAP_H; i++) {
      if (cells[i]!==1) continue;
      const x=i%MAP_W;
      if (x < MAP_W*0.2) startCells1.push(i);
      if (x > MAP_W*0.8) startCells2.push(i);
    }
    startCells1.slice(0,5).forEach(i=>ink[i]=0);
    startCells2.slice(0,5).forEach(i=>ink[i]=1);
    const match = { p1, p2, cells: Array.from(cells), ink, date: todayKey(), mins1:0, mins2:0 };
    return { id, match, isNew: true };
  }

  async function joinGame() {
    if (!nameInput.trim()) return;
    const name = nameInput.trim();
    const newPlayers = { ...players };
    if (!newPlayers[name]) {
      newPlayers[name] = { colorIdx: Object.keys(newPlayers).length % COLORS.length };
    }
    setPlayers(newPlayers);
    setMyName(name);
    await saveAll(newPlayers, matches);
    setScreen("home");
  }

  async function challengePlayer(target) {
    const { id, match, isNew } = getOrCreateMatch(myName, target);
    const newMatches = { ...matches };
    if (isNew) newMatches[id] = match;
    setMatches(newMatches);
    if (isNew) await saveAll(players, newMatches);
    setActiveMatch({ id, ...newMatches[id] });
    setScreen("match");
  }

  async function submitStudy() {
    const h=parseInt(inputH||"0"), m=parseInt(inputM||"0");
    const total=h*60+m;
    if (!total) return;
    const cells = Math.floor(total / MINS_PER_CELL);
    // 自分が参加している今日のマッチ全部に反映
    const newMatches = { ...matches };
    const today = todayKey();
    Object.keys(newMatches).forEach(id => {
      const match = newMatches[id];
      if (match.date !== today) return;
      const isP1 = match.p1 === myName;
      const isP2 = match.p2 === myName;
      if (!isP1 && !isP2) return;
      const playerIdx = isP1 ? 0 : 1;
      const newInk = spread(match.ink, match.cells, playerIdx, cells, MAP_W, MAP_H);
      newMatches[id] = {
        ...match,
        ink: newInk,
        mins1: isP1 ? (match.mins1||0)+total : match.mins1||0,
        mins2: isP2 ? (match.mins2||0)+total : match.mins2||0,
      };
    });
    setMatches(newMatches);
    if (activeMatch) {
      const updated = newMatches[activeMatch.id];
      if (updated) setActiveMatch({ id: activeMatch.id, ...updated });
    }
    await saveAll(players, newMatches);
    setInputH(""); setInputM("");
    setScreen(activeMatch ? "match" : "home");
  }

  // マッチ統計
  function getMatchStats(match) {
    const total = match.ink.filter((v,i)=>match.cells[i]===1).length || 1;
    const c0 = match.ink.filter(v=>v===0).length;
    const c1 = match.ink.filter(v=>v===1).length;
    return { pct0: Math.round(c0/total*100), pct1: Math.round(c1/total*100) };
  }

  function getPlayerColor(name) {
    const p = players[name];
    if (!p) return COLORS[0];
    return COLORS[p.colorIdx % COLORS.length];
  }

  // Canvas描画
  useEffect(() => {
    if (!cvs.current || !activeMatch || screen !== "match") return;
    const canvas = cvs.current;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    const cw = Math.floor(W / MAP_W), ch = Math.floor(H / MAP_H);
    ctx.fillStyle = "#1a1a2a";
    ctx.fillRect(0,0,W,H);
    const col0 = getPlayerColor(activeMatch.p1);
    const col1 = getPlayerColor(activeMatch.p2);
    for (let y=0; y<MAP_H; y++) for (let x=0; x<MAP_W; x++) {
      const idx = y*MAP_W+x;
      const cell = activeMatch.cells[idx];
      const ink = activeMatch.ink[idx];
      const px = x*cw, py = y*ch;
      if (cell === 0) {
        ctx.fillStyle = (x+y)%2===0?"#0d0d1a":"#111128";
      } else if (ink === 0) {
        ctx.fillStyle = (x+y)%2===0?col0.hex+"cc":col0.dark+"dd";
      } else if (ink === 1) {
        ctx.fillStyle = (x+y)%2===0?col1.hex+"cc":col1.dark+"dd";
      } else {
        ctx.fillStyle = (x+y)%2===0?"#2a2a3a":"#252535";
      }
      ctx.fillRect(px,py,cw,ch);
    }
  }, [activeMatch, screen]);

  const myColor = getPlayerColor(myName);
  const todayMatches = Object.entries(matches).filter(([,m])=>m.date===todayKey()&&(m.p1===myName||m.p2===myName));

  const css = `
    *{box-sizing:border-box}body{margin:0;font-family:'Segoe UI',sans-serif}
    @keyframes inkpop{0%{transform:scale(0.8);opacity:0}100%{transform:scale(1);opacity:1}}
    @keyframes flow{0%{transform:translateX(-100%)}100%{transform:translateX(0)}}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
    .btn{border:none;border-radius:20px;padding:12px 24px;font-size:14px;font-weight:900;cursor:pointer;transition:all 0.15s;letter-spacing:1px}
    .btn:hover{transform:scale(1.05)}
    .btn:active{transform:scale(0.97)}
    .panel{background:#ffffff18;border-radius:16px;padding:16px;backdrop-filter:blur(10px)}
    input{background:#ffffff22;border:2px solid #ffffff44;color:#fff;border-radius:12px;padding:10px 14px;font-size:14px;outline:none;width:100%;font-family:inherit}
    input::placeholder{color:#ffffff66}
    input:focus{border-color:#fff}
    ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#ffffff33;border-radius:2px}
  `;

  if (!loaded) return (
    <div style={{height:"100vh",background:"linear-gradient(135deg,#1a0030,#003060)",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16,color:"#fff",fontFamily:"sans-serif"}}>
      <div style={{fontSize:36,fontWeight:900,letterSpacing:4}}>🦑 STUDYTOON</div>
      <div style={{fontSize:12,opacity:0.6,animation:"pulse 1s infinite"}}>接続中...</div>
      <style>{`@keyframes pulse{0%,100%{opacity:0.6}50%{opacity:0.2}}`}</style>
    </div>
  );

  // JOIN
  if (screen==="join") return (
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#1a0030,#003060)",display:"flex",alignItems:"center",justifyContent:"center",padding:20,color:"#fff"}}>
      <style>{css}</style>
      <div style={{width:"100%",maxWidth:400,textAlign:"center"}}>
        <div style={{fontSize:48,marginBottom:8}}>🦑</div>
        <div style={{fontSize:32,fontWeight:900,letterSpacing:4,marginBottom:4,background:"linear-gradient(90deg,#FF2D78,#A8FF00,#00E5FF)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>STUDYTOON</div>
        <div style={{fontSize:12,opacity:0.6,marginBottom:24,letterSpacing:2}}>勉強でインクを塗りあおう！</div>

        {/* 再ログイン */}
        {Object.keys(players).length>0&&(
          <div className="panel" style={{marginBottom:16,textAlign:"left"}}>
            <div style={{fontSize:12,opacity:0.7,marginBottom:10}}>👤 前回のプレイヤーを選択</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {Object.keys(players).map(p=>{
                const pColor = COLORS[players[p].colorIdx%COLORS.length];
                return(
                  <button key={p} onClick={()=>{setMyName(p);setScreen("home");}} style={{background:"#ffffff11",border:`2px solid ${pColor.hex}55`,borderRadius:12,padding:"10px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:10,color:"#fff",transition:"all 0.15s"}}>
                    <div style={{width:10,height:10,borderRadius:3,background:pColor.hex,flexShrink:0}}/>
                    <span style={{fontSize:14,fontWeight:900,color:pColor.hex}}>{p}</span>
                    <span style={{marginLeft:"auto",fontSize:11,opacity:0.5}}>▶ 再開</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 新規参加 */}
        <div className="panel" style={{marginBottom:16,textAlign:"left"}}>
          <div style={{fontSize:12,opacity:0.7,marginBottom:10}}>🆕 新しく参加する</div>
          <input placeholder="名前を入力..." value={nameInput} onChange={e=>setNameInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&joinGame()} style={{marginBottom:12}}/>
          <button className="btn" style={{background:"linear-gradient(135deg,#FF2D78,#b400ff)",color:"#fff",width:"100%",fontSize:15,padding:"13px"}} onClick={joinGame} disabled={!nameInput.trim()}>
            🎮 参加する！
          </button>
        </div>
      </div>
    </div>
  );

  // HOME
  if (screen==="home") return (
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#1a0030,#003060)",color:"#fff",padding:16}}>
      <style>{css}</style>
      {/* ヘッダー */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:24}}>🦑</span>
          <span style={{fontSize:18,fontWeight:900,letterSpacing:2}}>STUDYTOON</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:10,height:10,borderRadius:3,background:myColor.hex}}/>
          <span style={{fontSize:12,opacity:0.8}}>{myName}</span>
          {syncing&&<span style={{fontSize:10,opacity:0.5,animation:"pulse 1s infinite"}}>SYNC</span>}
        </div>
      </div>

      {/* 今日の日付 */}
      <div style={{textAlign:"center",marginBottom:20}}>
        <div style={{fontSize:11,opacity:0.5,letterSpacing:2,marginBottom:4}}>TODAY'S BATTLE</div>
        <div style={{fontSize:20,fontWeight:900}}>{todayKey()}</div>
      </div>

      {/* 今日のマッチ一覧 */}
      {todayMatches.length>0&&(
        <div style={{marginBottom:20}}>
          <div style={{fontSize:11,opacity:0.6,letterSpacing:2,marginBottom:10}}>進行中のマッチ</div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {todayMatches.map(([id,match])=>{
              const opponent = match.p1===myName?match.p2:match.p1;
              const isP1 = match.p1===myName;
              const stats = getMatchStats(match);
              const myPct = isP1?stats.pct0:stats.pct1;
              const oppPct = isP1?stats.pct1:stats.pct0;
              const oppColor = getPlayerColor(opponent);
              return(
                <button key={id} onClick={()=>{setActiveMatch({id,...match});setScreen("match");}} style={{background:"#ffffff15",border:`2px solid ${myColor.hex}44`,borderRadius:16,padding:"14px 16px",cursor:"pointer",textAlign:"left",transition:"all 0.15s",color:"#fff"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:8,height:8,borderRadius:2,background:myColor.hex}}/>
                      <span style={{fontSize:13,fontWeight:900}}>{myName}</span>
                      <span style={{fontSize:11,opacity:0.5}}>vs</span>
                      <div style={{width:8,height:8,borderRadius:2,background:oppColor.hex}}/>
                      <span style={{fontSize:13,fontWeight:900}}>{opponent}</span>
                    </div>
                    <span style={{fontSize:12,fontWeight:900,color:myPct>oppPct?myColor.hex:oppPct>myPct?oppColor.hex:"#fff"}}>{myPct}% - {oppPct}%</span>
                  </div>
                  {/* ミニゲージ */}
                  <div style={{height:6,borderRadius:4,overflow:"hidden",background:"#ffffff22",display:"flex"}}>
                    <div style={{width:`${myPct}%`,background:myColor.hex,transition:"width 0.5s"}}/>
                    <div style={{width:`${oppPct}%`,background:oppColor.hex,transition:"width 0.5s"}}/>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 新しい対戦相手に挑戦 */}
      <div style={{marginBottom:20}}>
        <div style={{fontSize:11,opacity:0.6,letterSpacing:2,marginBottom:10}}>誰と戦う？</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {Object.keys(players).filter(p=>p!==myName).map(p=>{
            const matchId = getMatchId(myName,p);
            const todayMatch = matches[matchId+"__"+todayKey()] || matches[Object.keys(matches).find(k=>k.includes([myName,p].sort().join("__"))&&k.includes(todayKey()))||""];
            const alreadyPlaying = todayMatches.some(([,m])=>(m.p1===p||m.p2===p));
            const pColor = getPlayerColor(p);
            return(
              <button key={p} onClick={()=>challengePlayer(p)} style={{background:alreadyPlaying?"#ffffff08":"#ffffff15",border:`2px solid ${pColor.hex}${alreadyPlaying?"22":"66"}`,borderRadius:14,padding:"12px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:10,color:"#fff",opacity:alreadyPlaying?0.6:1}}>
                <div style={{width:10,height:10,borderRadius:3,background:pColor.hex}}/>
                <span style={{fontSize:14,fontWeight:900,color:pColor.hex}}>{p}</span>
                <span style={{marginLeft:"auto",fontSize:11,opacity:0.6}}>{alreadyPlaying?"対戦中 →":"挑戦する ⚔️"}</span>
              </button>
            );
          })}
          {Object.keys(players).filter(p=>p!==myName).length===0&&(
            <div style={{fontSize:12,opacity:0.4,textAlign:"center",padding:"20px 0"}}>まだ他のプレイヤーがいません</div>
          )}
        </div>
      </div>

      {/* 勉強記録ボタン */}
      <button className="btn" style={{background:`linear-gradient(135deg,${myColor.hex},${myColor.dark})`,color:"#fff",width:"100%",fontSize:15,padding:"14px"}} onClick={()=>setScreen("record")}>
        📚 勉強時間を記録
      </button>
    </div>
  );

  // MATCH詳細
  if (screen==="match"&&activeMatch) {
    const isP1 = activeMatch.p1===myName;
    const opponent = isP1?activeMatch.p2:activeMatch.p1;
    const oppColor = getPlayerColor(opponent);
    const stats = getMatchStats(activeMatch);
    const myPct = isP1?stats.pct0:stats.pct1;
    const oppPct = isP1?stats.pct1:stats.pct0;
    return(
      <div style={{height:"100vh",background:"linear-gradient(180deg,#1a0030,#003060)",color:"#fff",display:"flex",flexDirection:"column"}}>
        <style>{css}</style>
        {/* ヘッダー */}
        <div style={{padding:"10px 16px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
          <button onClick={()=>setScreen("home")} style={{background:"none",border:"none",color:"#fff",cursor:"pointer",fontSize:20,opacity:0.7}}>←</button>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <div style={{width:8,height:8,borderRadius:2,background:myColor.hex}}/>
            <span style={{fontSize:13,fontWeight:900}}>{myName}</span>
            <span style={{fontSize:11,opacity:0.5}}>vs</span>
            <div style={{width:8,height:8,borderRadius:2,background:oppColor.hex}}/>
            <span style={{fontSize:13,fontWeight:900}}>{opponent}</span>
          </div>
          <div style={{marginLeft:"auto",fontSize:11,opacity:0.5}}>{todayKey()}</div>
        </div>

        {/* マップ */}
        <div style={{flex:1,position:"relative",overflow:"hidden"}}>
          <canvas ref={cvs} width={MAP_W*14} height={MAP_H*14} style={{display:"block",width:"100%",height:"100%",imageRendering:"pixelated"}}/>
        </div>

        {/* インクゲージ */}
        <div style={{padding:"12px 16px",flexShrink:0,background:"#00000044"}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <div style={{width:10,height:10,borderRadius:2,background:myColor.hex}}/>
              <span style={{fontSize:13,fontWeight:900}}>{myName}</span>
            </div>
            <div style={{fontSize:20,fontWeight:900}}>
              <span style={{color:myColor.hex}}>{myPct}%</span>
              <span style={{opacity:0.4,margin:"0 8px"}}>vs</span>
              <span style={{color:oppColor.hex}}>{oppPct}%</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:13,fontWeight:900}}>{opponent}</span>
              <div style={{width:10,height:10,borderRadius:2,background:oppColor.hex}}/>
            </div>
          </div>
          {/* メインゲージ */}
          <div style={{height:16,borderRadius:8,overflow:"hidden",background:"#ffffff22",display:"flex",position:"relative"}}>
            {/* 左から自分色 */}
            <div style={{width:`${myPct}%`,background:`linear-gradient(90deg,${myColor.hex},${myColor.light})`,transition:"width 0.8s ease"}}/>
            {/* 中間の空白 */}
            <div style={{flex:1,background:"#ffffff11"}}/>
            {/* 右から相手色 */}
            <div style={{width:`${oppPct}%`,background:`linear-gradient(90deg,${oppColor.light},${oppColor.hex})`,transition:"width 0.8s ease"}}/>
          </div>
          {/* 勉強時間 */}
          <div style={{display:"flex",justifyContent:"space-between",marginTop:6,fontSize:11,opacity:0.6}}>
            <span>📚 {Math.floor((isP1?activeMatch.mins1:activeMatch.mins2)/60)}h{(isP1?activeMatch.mins1:activeMatch.mins2)%60}m</span>
            <span>{Math.floor((isP1?activeMatch.mins2:activeMatch.mins1)/60)}h{(isP1?activeMatch.mins2:activeMatch.mins1)%60}m 📚</span>
          </div>
        </div>

        {/* 記録ボタン */}
        <div style={{padding:"10px 16px 20px",flexShrink:0}}>
          <button className="btn" style={{background:`linear-gradient(135deg,${myColor.hex},${myColor.dark})`,color:"#fff",width:"100%",fontSize:14}} onClick={()=>setScreen("record")}>
            📚 勉強時間を記録して塗り広げる！
          </button>
        </div>
      </div>
    );
  }

  // RECORD
  if (screen==="record") return (
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#1a0030,#003060)",color:"#fff",padding:20}}>
      <style>{css}</style>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:24}}>
        <button onClick={()=>setScreen(activeMatch?"match":"home")} style={{background:"none",border:"none",color:"#fff",cursor:"pointer",fontSize:20,opacity:0.7}}>←</button>
        <span style={{fontSize:18,fontWeight:900}}>📚 勉強時間を記録</span>
      </div>
      <div className="panel" style={{marginBottom:16}}>
        <div style={{fontSize:12,opacity:0.7,marginBottom:12}}>今日何時間勉強した？</div>
        <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:16}}>
          <div style={{flex:1}}>
            <input type="number" placeholder="0" min="0" value={inputH} onChange={e=>setInputH(e.target.value)}/>
            <div style={{fontSize:11,opacity:0.5,textAlign:"center",marginTop:4}}>時間</div>
          </div>
          <span style={{fontSize:24,opacity:0.4}}>:</span>
          <div style={{flex:1}}>
            <input type="number" placeholder="0" min="0" max="59" value={inputM} onChange={e=>setInputM(e.target.value)}/>
            <div style={{fontSize:11,opacity:0.5,textAlign:"center",marginTop:4}}>分</div>
          </div>
        </div>
        <div style={{fontSize:11,opacity:0.5,marginBottom:16,background:"#ffffff11",borderRadius:10,padding:"10px 14px",lineHeight:1.8}}>
          {MINS_PER_CELL}分 = 1マス塗れる<br/>
          今日の全マッチに一括反映されます🦑
        </div>
        <button className="btn" style={{background:`linear-gradient(135deg,${myColor.hex},${myColor.dark})`,color:"#fff",width:"100%",fontSize:15,padding:"14px"}} onClick={submitStudy} disabled={!parseInt(inputH||"0")&&!parseInt(inputM||"0")}>
          🎨 インクを塗る！
        </button>
      </div>
      {/* 今日のマッチ一覧（確認用） */}
      {todayMatches.length>0&&(
        <div className="panel">
          <div style={{fontSize:11,opacity:0.6,marginBottom:10}}>今日のマッチ（全部に反映）</div>
          {todayMatches.map(([id,match])=>{
            const opponent=match.p1===myName?match.p2:match.p1;
            const isP1=match.p1===myName;
            const stats=getMatchStats(match);
            const myPct=isP1?stats.pct0:stats.pct1;
            const oppPct=isP1?stats.pct1:stats.pct0;
            const oppColor=getPlayerColor(opponent);
            return(
              <div key={id} style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}>
                  <span>vs <span style={{color:oppColor.hex,fontWeight:900}}>{opponent}</span></span>
                  <span style={{color:myColor.hex,fontWeight:900}}>{myPct}%</span>
                </div>
                <div style={{height:6,borderRadius:4,overflow:"hidden",background:"#ffffff22",display:"flex"}}>
                  <div style={{width:`${myPct}%`,background:myColor.hex}}/>
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
