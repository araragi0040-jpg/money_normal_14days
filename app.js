const KEY="atarimae_update_v004";
const PREV_KEY="atarimae_update_v003";
const LEGACY_KEY="money_normal_14days_v002";
const BODY=["胸","左胸","みぞおち","お腹","喉","顎","肩","頭","その他","特になし"];
const REACTIONS=["不安","罪悪感","損したくない","相手への配慮","現実的な心配","欲張りに感じる","自分勝手に感じる","義務感","よく分からない"];

const clone=x=>JSON.parse(JSON.stringify(x));
const esc=s=>String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const escA=s=>esc(s).replace(/"/g,"&quot;");
const nowISO=()=>new Date().toISOString();

function freshState(){
 return {
   schemaVersion:4, appVersion:"v004",
   profile:{displayName:"",createdAt:nowISO()},
   activePhase:1,
   phases:{
    "1":{status:"not_started",startedAt:null,completedAt:null,baseline:[],finalAssessment:[],finalReflection:"",records:{}},
    "2":{status:"locked",startedAt:null,completedAt:null,baseline:[],finalAssessment:[],finalReflection:"",records:{}},
    "3":{status:"locked",startedAt:null,completedAt:null,baseline:[],finalAssessment:[],finalReflection:"",records:{}}
   },
   backup:{lastExportAt:null}, drafts:{}, meta:{}
 };
}
function normalizeState(s){
 if(!s||typeof s!=="object") s=freshState();
 s.schemaVersion=4; s.appVersion="v004";
 s.profile=s.profile||{displayName:"",createdAt:nowISO()};
 s.phases=s.phases||{};
 for(const p of ["1","2","3"]){
   s.phases[p]=s.phases[p]||{};
   Object.assign(s.phases[p],{
     status:s.phases[p].status|| (p==="1"?"not_started":"locked"),
     startedAt:s.phases[p].startedAt||null,
     completedAt:s.phases[p].completedAt||null,
     baseline:s.phases[p].baseline||[],
     finalAssessment:s.phases[p].finalAssessment||[],
     finalReflection:s.phases[p].finalReflection||"",
     records:s.phases[p].records||{}
   });
 }
 if(s.phases["1"].status==="completed" && s.phases["2"].status==="locked") s.phases["2"].status="not_started";
 if(s.phases["2"].status==="completed" && s.phases["3"].status==="locked") s.phases["3"].status="not_started";
 s.activePhase=Number(s.activePhase||1);
 s.backup=s.backup||{lastExportAt:null}; s.drafts=s.drafts||{}; s.meta=s.meta||{};
 return s;
}
function migrateLegacy(){
 try{
   const raw=localStorage.getItem(LEGACY_KEY);
   if(!raw) return null;
   const old=JSON.parse(raw); if(!old?.records) return null;
   const s=freshState();
   s.profile.createdAt=old.startDate||nowISO();
   s.phases["1"].baseline=(old.baseline||[]).map((x,i)=>({id:PROGRAM.phases["1"].baseline[i]?.id||("b"+i),label:x.label,score:Number(x.score)}));
   s.phases["1"].records=clone(old.records);
   const n=Object.values(old.records).filter(r=>r?.savedAt).length;
   s.phases["1"].status=n>=14?"completed":"active";
   s.phases["1"].startedAt=old.startDate||null;
   if(n>=14){s.phases["1"].completedAt=nowISO();s.phases["2"].status="not_started";s.activePhase=2}
   s.meta.migratedFrom="v002";
   return s;
 }catch(e){return null}
}
function load(){
 // Important: keep v003 key intact for rollback. v004 always creates a separate copy.
 try{
   const current=localStorage.getItem(KEY);
   if(current)return normalizeState(JSON.parse(current));
   const prev=localStorage.getItem(PREV_KEY);
   if(prev){const migrated=normalizeState(JSON.parse(prev));migrated.meta.migratedFrom="v003-localStorage";save(migrated);return migrated}
 }catch(e){console.error("データ読み込みに失敗",e)}
 const migrated=migrateLegacy();if(migrated){const x=normalizeState(migrated);save(x);return x}
 const s=freshState();save(s);return s;
}
function save(s,silent=false){
 try{localStorage.setItem(KEY,JSON.stringify(s));return true}
 catch(e){console.error("保存できません",e);if(!silent)alert("保存できませんでした。容量・ブラウザ設定を確認し、JSONバックアップを保存してください。");return false}
}
let state=load(), activePhase=state.activePhase, activeDay=1, timer=null, remain=60;

function phaseCfg(p){return PROGRAM.phases[String(p)]}
function phaseData(p){return state.phases[String(p)]}
function countDays(p){return Object.values(phaseData(p).records||{}).filter(r=>r?.savedAt).length}
function nextDay(p){for(let i=1;i<=14;i++) if(!phaseData(p).records[String(i)]?.savedAt)return i;return 14}
function phaseAvgDay(p,d){const r=phaseData(p).records[String(d)];const a=r?.statements?.map(x=>Number(x.score)).filter(Number.isFinite)||[];return a.length?a.reduce((x,y)=>x+y,0)/a.length:null}
function ensurePhaseStatus(){
 let changed=false;
 for(let p=1;p<=3;p++){
   const pd=phaseData(p);
   if(p>1 && phaseData(p-1).status==="completed" && pd.status==="locked"){pd.status="not_started";changed=true}
   if(countDays(p)>=14 && pd.finalAssessment.length && pd.status!=="completed"){
     pd.status="completed";pd.completedAt=pd.completedAt||nowISO();changed=true;
   }
 }
 if(changed)save(state,true);
}
ensurePhaseStatus();

function goto(id){
 document.querySelectorAll(".screen").forEach(x=>x.classList.add("hidden"));
 document.getElementById(id).classList.remove("hidden");
 document.querySelectorAll("[data-nav]").forEach(x=>x.classList.toggle("active",x.dataset.nav===id));
 if(id==="home")renderHome();
 if(id==="progress")renderProgress();
 if(id==="data")renderData();
 window.scrollTo({top:0,behavior:"smooth"});
}
function statusLabel(p){
 const s=phaseData(p).status;
 return s==="completed"?"完了":s==="active"?"進行中":s==="locked"?"未解放":"未開始";
}
function renderHome(){
 ensurePhaseStatus();
 const current=getCurrentTarget();
 const hero=document.getElementById("heroCard");
 if(current.type==="phaseBaseline"){
   hero.innerHTML=`<span class="badge">次のステップ</span><h2 style="margin-top:10px">${esc(phaseCfg(current.phase).title)}</h2><div class="quote">まず、現在地を0〜10で測ります。</div><div class="row" style="margin-top:13px"><button onclick="openBaseline(${current.phase})">開始時チェックへ</button></div>`;
 }else if(current.type==="day"){
   const c=phaseCfg(current.phase), d=c.days[current.day-1];
   hero.innerHTML=`<div class="row between"><div><span class="badge">${esc(c.shortTitle)} / DAY ${current.day}</span><h2 style="margin-top:8px">${esc(d.title)}</h2></div><b>${countDays(current.phase)}/14</b></div><div class="progress"><div style="width:${countDays(current.phase)/14*100}%"></div></div><div class="quote">${esc(d.theme)}</div><div class="notice" style="margin-top:10px">${esc(d.action)}</div><button onclick="openDay(${current.phase},${current.day})" style="margin-top:13px">今日の実践へ</button>`;
 }else if(current.type==="final"){
   hero.innerHTML=`<span class="badge">14日完了</span><h2 style="margin-top:10px">${esc(phaseCfg(current.phase).title)}を振り返る</h2><div class="quote">開始時と同じ項目を、今の感覚でもう一度採点します。</div><button onclick="openFinal(${current.phase})" style="margin-top:13px">最終チェックへ</button>`;
 }else if(current.type==="done"){
   hero.innerHTML=`<span class="badge done">42日間 完了</span><h2 style="margin-top:10px">Phase 1〜3 完了</h2><div class="quote">記録を振り返り、次に更新したい“当たり前”を見つける段階です。</div><button onclick="goto('progress')" style="margin-top:13px">変化を見る</button>`;
 }
 let road="";
 for(const p of [1,2,3]){
   const pd=phaseData(p), cfg=phaseCfg(p);
   const cls=(current.phase===p?" current":"");
   road+=`<div class="phase-card${cls}"><div class="phase-head"><div><div class="phase-title">${esc(cfg.title)}</div><div class="small">${esc(cfg.summary)}</div></div><span class="badge ${pd.status==="completed"?"done":pd.status==="locked"?"lock":""}">${statusLabel(p)}</span></div><div class="progress"><div style="width:${countDays(p)/14*100}%"></div></div><div class="row between"><span class="small">${countDays(p)}/14日</span><button class="ghost" onclick="viewPhase(${p})">見る</button></div></div>`;
 }
 document.getElementById("phaseRoadmap").innerHTML=road;
 renderBackupReminder();
}
function getCurrentTarget(){
 ensurePhaseStatus();
 for(const p of [1,2,3]){
   const pd=phaseData(p);
   if(p>1 && phaseData(p-1).status!=="completed")break;
   if(pd.status==="completed")continue;
   if(!pd.baseline.length)return{type:"phaseBaseline",phase:p};
   if(countDays(p)<14)return{type:"day",phase:p,day:nextDay(p)};
   if(!pd.finalAssessment.length)return{type:"final",phase:p};
 }
 return{type:"done",phase:3};
}
function openCurrent(){
 const t=getCurrentTarget();
 if(t.type==="phaseBaseline")openBaseline(t.phase);
 else if(t.type==="day")openDay(t.phase,t.day);
 else if(t.type==="final")openFinal(t.phase);
 else goto("progress");
}
function openBaseline(p){
 activePhase=p;
 const cfg=phaseCfg(p), pd=phaseData(p);
 let rows=cfg.baseline.map((x,i)=>{
   const val=pd.baseline.find(b=>b.id===x.id)?.score ?? 5;
   return `<div class="statement"><div>${esc(x.label)}</div><div class="scoreline"><span>0</span><input id="base${i}" type="range" min="0" max="10" value="${val}" oninput="document.getElementById('baseV${i}').textContent=this.value"><span class="score" id="baseV${i}">${val}</span></div></div>`;
 }).join("");
 document.getElementById("todayContent").innerHTML=`<div class="card"><span class="badge">${esc(cfg.shortTitle)}</span><h2 style="margin-top:8px">${esc(cfg.title)}｜開始時チェック</h2><div class="notice">「達成できているか」ではなく、今どれくらい自然に感じるかを0〜10でつけます。</div>${rows}<button onclick="saveBaseline(${p})" style="margin-top:14px">この点数で始める</button></div>`;
 goto("today");
}
function saveBaseline(p){
 const cfg=phaseCfg(p), pd=phaseData(p);
 pd.baseline=cfg.baseline.map((x,i)=>({id:x.id,label:x.label,score:Number(document.getElementById("base"+i).value)}));
 pd.status="active";pd.startedAt=pd.startedAt||new Date().toISOString().slice(0,10);state.activePhase=p;save(state);openDay(p,nextDay(p));
}
function openDay(p,d){
 hideModal(); activePhase=p;activeDay=d;const cfg=phaseCfg(p), day=cfg.days[d-1], rec=state.drafts[`${p}-${d}`]||phaseData(p).records[String(d)]||{};
 let sts=cfg.statements.map((s,i)=>{
   const old=rec.statements?.[i]||{score:5,bodies:[],bodyMemo:"",reactionTypes:[]};
   return `<div class="statement"><div class="quote">${esc(s)}</div><label>当たり前度</label><div class="scoreline"><span>0</span><input id="score${i}" type="range" min="0" max="10" value="${old.score??5}" oninput="document.getElementById('sv${i}').textContent=this.value"><span class="score" id="sv${i}">${old.score??5}</span></div><label>身体反応</label><div class="tags" id="body${i}">${BODY.map(x=>`<span class="tag ${old.bodies?.includes(x)?"on":""}" onclick="this.classList.toggle('on');captureDayDraft()">${x}</span>`).join("")}</div><input id="bm${i}" type="text" value="${escA(old.bodyMemo||"")}" placeholder="例：胸がズンとする"><label>この反応は何っぽい？</label><div class="tags" id="react${i}">${REACTIONS.map(x=>`<span class="tag reaction ${old.reactionTypes?.includes(x)?"on":""}" onclick="this.classList.toggle('on');captureDayDraft()">${x}</span>`).join("")}</div></div>`;
 }).join("");
 document.getElementById("todayContent").innerHTML=`
 <div class="card"><div class="row between"><div><span class="badge">${esc(cfg.shortTitle)} / DAY ${d}</span><h2 style="margin-top:8px">${esc(day.title)}</h2></div><button class="ghost" onclick="goto('home')">戻る</button></div><div class="quote">${esc(day.theme)}</div><div class="notice" style="margin-top:9px">${esc(day.action)}</div></div>
 <div class="card"><h2>① 身体をみる</h2><div class="small">無理に緩めず、60秒だけ呼吸・胸・腹・顎・肩などを観察します。</div><div class="timer" id="timer">01:00</div><div class="row" style="justify-content:center"><button id="timerBtn" onclick="startTimer()">60秒スタート</button><button class="secondary" onclick="resetTimer()">リセット</button></div></div>
 <div class="card"><h2>② 文章を声に出す</h2>${sts}</div>
 <div class="card"><h2>③ 今日の実験</h2>
   <label>今日、試したこと／場面</label><textarea id="did">${esc(rec.did||"")}</textarea>
   ${p>=2?`<label>${p===3?"今、扱っている望み・選んだ方向":"最初に『自分はどうしたい？』と感じた？"}</label><textarea id="want">${esc(rec.want||"")}</textarea>`:""}
   ${p===3?`<label>今日の取り組み方</label><select id="actionType"><option value="">選ばなくてもOK</option>${["考えた・言葉にした","調べた・整理した","実際に行動した","誰かと話した・頼った","待つ・変える・手放すを選んだ"].map(x=>`<option value="${x}" ${rec.actionType===x?"selected":""}>${x}</option>`).join("")}</select>`:""}
   <label>やる前に、何が起こると思っていた？</label><textarea id="prediction">${esc(rec.prediction||rec.pred||"")}</textarea>
   <label>実際には何が起きた？</label><textarea id="actual">${esc(rec.actual||"")}</textarea>
   <label>今日の一言</label><textarea id="note">${esc(rec.note||"")}</textarea>
   ${p===3?`<label>次にできる小さな一歩（未定・保留でもOK）</label><textarea id="nextStep">${esc(rec.nextStep||"")}</textarea>`:""}
   <div class="small" id="draftInfo" style="margin-top:9px">入力内容はこの端末に一時保存されます。「保存」で記録が確定します。</div>
   <button onclick="saveDay()" style="margin-top:13px">DAY ${d} を保存</button>
 </div>`;
 goto("today");resetTimer(); document.getElementById("todayContent").oninput=captureDayDraft; document.getElementById("todayContent").onchange=captureDayDraft;
}
function readDayFields(){
 const cfg=phaseCfg(activePhase);
 const rec={statements:[],did:v("did"),want:activePhase>=2?v("want"):"",prediction:v("prediction"),actual:v("actual"),note:v("note"),actionType:activePhase===3?v("actionType"):"",nextStep:activePhase===3?v("nextStep"):""};
 cfg.statements.forEach((_,i)=>rec.statements.push({statement:cfg.statements[i],score:Number(document.getElementById("score"+i).value),bodies:[...document.querySelectorAll("#body"+i+" .tag.on")].map(x=>x.textContent),bodyMemo:v("bm"+i),reactionTypes:[...document.querySelectorAll("#react"+i+" .tag.on")].map(x=>x.textContent)}));
 return rec;
}
function captureDayDraft(){
 if(document.getElementById("today").classList.contains("hidden")||!document.getElementById("score0"))return;
 state.drafts[`${activePhase}-${activeDay}`]=readDayFields();
 const ok=save(state,true);
 const e=document.getElementById("draftInfo");if(e)e.textContent=ok?"入力途中の内容を、この端末に一時保存しました。":"一時保存に失敗しました。入力内容をコピーして保護してください。";
}
function saveDay(){
 const rec=readDayFields();rec.savedAt=nowISO();
 const pd=phaseData(activePhase),old=pd.records[String(activeDay)];
 pd.records[String(activeDay)]=rec;const oldStatus=pd.status;
 pd.status=oldStatus==="completed"?"completed":"active";state.activePhase=activePhase;
 const previousDraft=state.drafts[`${activePhase}-${activeDay}`];delete state.drafts[`${activePhase}-${activeDay}`];
 if(!save(state)){pd.records[String(activeDay)]=old;pd.status=oldStatus;if(previousDraft)state.drafts[`${activePhase}-${activeDay}`]=previousDraft;return}
 if(countDays(activePhase)>=14 && !pd.finalAssessment.length)openFinal(activePhase);else goto("home");
}
function v(id){return document.getElementById(id)?.value.trim()||""}
function openFinal(p){
 activePhase=p;const cfg=phaseCfg(p),pd=phaseData(p);
 let rows=cfg.baseline.map((x,i)=>{const val=pd.finalAssessment.find(b=>b.id===x.id)?.score ?? 5;return `<div class="statement"><div>${esc(x.label)}</div><div class="scoreline"><span>0</span><input id="fin${i}" type="range" min="0" max="10" value="${val}" oninput="document.getElementById('finV${i}').textContent=this.value"><span class="score" id="finV${i}">${val}</span></div></div>`}).join("");
 document.getElementById("todayContent").innerHTML=`<div class="card"><span class="badge">${esc(cfg.shortTitle)}</span><h2 style="margin-top:8px">${esc(cfg.title)}｜最終チェック</h2><div class="notice">開始時と同じ項目を、今の感覚で採点します。</div>${rows}<label>このPhaseで「思っていたより大丈夫だったこと」「変わったこと」</label><textarea id="finalReflection">${esc(pd.finalReflection||"")}</textarea><button onclick="saveFinal(${p})" style="margin-top:13px">Phase ${p} を完了する</button></div>`;
 goto("today");
}
function saveFinal(p){
 const cfg=phaseCfg(p),pd=phaseData(p);
 pd.finalAssessment=cfg.baseline.map((x,i)=>({id:x.id,label:x.label,score:Number(document.getElementById("fin"+i).value)}));
 pd.finalReflection=v("finalReflection");pd.status="completed";pd.completedAt=nowISO();
 if(p<3){state.phases[String(p+1)].status="not_started";state.activePhase=p+1}else state.activePhase=3;
 save(state);goto("home");
}
function viewPhase(p){
 const pd=phaseData(p),cfg=phaseCfg(p);
 let comp=comparisonHTML(p);
 let days=`<div class="daygrid">${Array.from({length:14},(_,i)=>{const d=i+1,done=!!pd.records[String(d)]?.savedAt;return `<div class="day ${done?"done":""}" onclick="${done?`openDay(${p},${d})`:""}">${d}${done?'<span class="dot"></span>':""}</div>`}).join("")}</div>`;
 showModal(`<div class="row between"><div><span class="badge">${statusLabel(p)}</span><h2 style="margin-top:8px">${esc(cfg.title)}</h2></div><button class="ghost" onclick="hideModal()">閉じる</button></div><div class="small">${esc(cfg.summary)}</div>${comp}<h3>日別記録</h3>${days}${pd.finalReflection?`<h3>振り返り</h3><div class="notice">${esc(pd.finalReflection)}</div>`:""}`);
}
function comparisonHTML(p){
 const pd=phaseData(p),cfg=phaseCfg(p);if(!pd.baseline.length)return`<div class="notice" style="margin-top:10px">開始時チェックはまだありません。</div>`;
 const finalMap=Object.fromEntries((pd.finalAssessment||[]).map(x=>[x.id,x.score]));
 return `<h3>Before / After</h3>${pd.baseline.map(b=>{const f=finalMap[b.id];const delta=Number.isFinite(f)?f-b.score:null;return `<div class="compare"><span>${esc(b.label)}</span><b>${b.score}</b><span>→</span><b>${Number.isFinite(f)?f:"-"}</b></div>`}).join("")}`;
}
function renderProgress(){
 let html="";
 for(const p of [1,2,3]){
   const cfg=phaseCfg(p),pd=phaseData(p);const vals=[];for(let d=1;d<=14;d++){const a=phaseAvgDay(p,d);if(a!==null)vals.push({d,a})}
   html+=`<div class="card"><div class="row between"><h2>${esc(cfg.title)}</h2><span class="badge">${statusLabel(p)}</span></div>${comparisonHTML(p)}<h3>日ごとの4文章平均</h3>${vals.length?`<div class="chart">${vals.map(x=>`<div class="barwrap"><div class="bar" style="height:${x.a/10*100}%"></div><div class="barlabel">${x.d}</div></div>`).join("")}</div>`:`<div class="small">まだ日次記録がありません。</div>`}${pd.finalReflection?`<h3>振り返り</h3><div class="notice">${esc(pd.finalReflection)}</div>`:""}</div>`;
 }
 document.getElementById("progressContent").innerHTML=html;
}
function renderData(){
 const total=[1,2,3].reduce((sum,p)=>sum+countDays(p),0);
 document.getElementById("dataSummary").innerHTML=`${[1,2,3].map(p=>`Phase ${p}：${countDays(p)}/14日（${statusLabel(p)}）`).join("<br>")}<br>合計：${total}/42日<br>最終バックアップ：${state.backup.lastExportAt?new Date(state.backup.lastExportAt).toLocaleString():"未保存"}`;
}
function renderBackupReminder(){
 const el=document.getElementById("backupReminder"), total=countDays(1)+countDays(2), last=state.backup.lastExportAt?new Date(state.backup.lastExportAt):null;
 const old=!last || (Date.now()-last.getTime()>3*86400000);
 if(total>=3&&old)el.innerHTML=`<h2>バックアップ推奨</h2><div class="notice warn">記録が増えています。端末変更やブラウザデータ削除に備えてJSONを保存しておくと安心です。</div><button onclick="downloadJSON()" style="margin-top:10px">今バックアップする</button>`;
 else el.innerHTML=`<h2>データ保存</h2><div class="small">記録はこのブラウザに保存されています。固定URLで使い、定期的にJSONバックアップを保存してください。</div>`;
}
function startTimer(){
 if(timer)return;const btn=document.getElementById("timerBtn");if(btn)btn.textContent="進行中";
 timer=setInterval(()=>{remain--;drawTimer();if(remain<=0){clearInterval(timer);timer=null;navigator.vibrate?.(200);if(btn)btn.textContent="完了"}},1000);
}
function resetTimer(){if(timer)clearInterval(timer);timer=null;remain=60;drawTimer();const b=document.getElementById("timerBtn");if(b)b.textContent="60秒スタート"}
function drawTimer(){const e=document.getElementById("timer");if(e)e.textContent="00:"+String(remain).padStart(2,"0")}
function showModal(x){document.getElementById("modalBox").innerHTML=x;document.getElementById("modal").classList.remove("hidden")}
function hideModal(){document.getElementById("modal").classList.add("hidden")}
document.getElementById("modal").addEventListener("click",e=>{if(e.target.id==="modal")hideModal()});

function buildText(){
 let t=`【${PROGRAM.name}｜v004 ChatGPT解析用】\n`;
 for(const p of [1,2,3]){
   const cfg=phaseCfg(p),pd=phaseData(p);t+=`\n■${cfg.title}\n状態：${statusLabel(p)} / ${countDays(p)}/14日\n`;
   if(pd.baseline.length){t+="開始時：\n"+pd.baseline.map(x=>`- ${x.label}：${x.score}/10`).join("\n")+"\n"}
   if(pd.finalAssessment.length){t+="終了時：\n"+pd.finalAssessment.map(x=>`- ${x.label}：${x.score}/10`).join("\n")+"\n"}
   for(let d=1;d<=14;d++){
    const r=pd.records[String(d)];if(!r?.savedAt)continue;t+=`\nDAY ${d}｜${cfg.days[d-1].phase}｜${cfg.days[d-1].title}\n`;
    r.statements?.forEach((s,i)=>{t+=`${i+1}. ${s.statement||cfg.statements[i]}\n   当たり前度：${s.score}/10\n   身体：${(s.bodies||[]).join("、")||"なし"}${s.bodyMemo?"／"+s.bodyMemo:""}\n   反応の種類：${(s.reactionTypes||[]).join("、")||"未記録"}\n`});
    t+=`試したこと：${r.did||"未記録"}\n${p>=2?`最初の望み：${r.want||"未記録"}\n`:""}${p===3?`今日の取り組み方：${r.actionType||"未記録"}\n次の小さな一歩：${r.nextStep||"未記録"}\n`:""}予想：${r.prediction||r.pred||"未記録"}\n実際：${r.actual||"未記録"}\n一言：${r.note||"未記録"}\n`;
   }
   if(pd.finalReflection)t+=`\n振り返り：${pd.finalReflection}\n`;
 }
 t+=`\n■ChatGPTへの依頼\nPhaseごとの変化、身体反応、予測と現実のズレ、繰り返す価値観・Money Script、新しく育った当たり前、次に扱うテーマを分析してください。過度な因果断定は避け、本人の記録を中心に整理してください。`;
 document.getElementById("exportPreview").textContent=t;return t;
}
async function copyText(){const t=buildText();try{await navigator.clipboard.writeText(t);alert("コピーしました")}catch(e){alert("コピーできませんでした")}}
async function shareText(){const t=buildText();if(navigator.share){try{await navigator.share({title:PROGRAM.name,text:t})}catch(e){}}else copyText()}
function blob(name,text,type){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function downloadJSON(){state.backup.lastExportAt=nowISO();save(state);blob("atarimae-update-v004-backup.json",JSON.stringify(state,null,2),"application/json");renderBackupReminder()}
function downloadCSV(){
 const rows=[["phase","day","day_theme","statement","score","body","body_memo","reaction_type","did","want","prediction","actual","note","action_type","next_step"]];
 for(const p of [1,2,3])for(let d=1;d<=14;d++){const r=phaseData(p).records[String(d)];if(!r?.savedAt)continue;(r.statements||[]).forEach((s,i)=>rows.push([p,d,phaseCfg(p).days[d-1].title,s.statement||phaseCfg(p).statements[i],s.score,(s.bodies||[]).join("|"),s.bodyMemo||"",(s.reactionTypes||[]).join("|"),r.did||"",r.want||"",r.prediction||r.pred||"",r.actual||"",r.note||"",r.actionType||"",r.nextStep||""]))}
 const q=x=>'"'+String(x??"").replace(/"/g,'""')+'"';blob("atarimae-update-v004.csv","\ufeff"+rows.map(r=>r.map(q).join(",")).join("\n"),"text/csv;charset=utf-8");
}
function mergeStates(existing,incoming){
 const merged=normalizeState(clone(existing));
 for(const p of ["1","2","3"]){
   const a=merged.phases[p],b=incoming.phases[p];
   for(const field of ["baseline","finalAssessment"]){if(!a[field]?.length && b[field]?.length)a[field]=clone(b[field])}
   for(const field of ["startedAt","completedAt","finalReflection"]){if(!a[field]&&b[field])a[field]=b[field]}
   for(const [d,record] of Object.entries(b.records||{})){
     if(!a.records[d]||!a.records[d].savedAt)a.records[d]=clone(record);
   }
   if(b.status==="completed" && (a.status!=="completed") && countObj(a.records)>=14 && a.finalAssessment.length)a.status="completed";
   if(a.status==="locked"&&b.status!=="locked"&&p!=="1")a.status=b.status;
 }
 if(incoming.profile?.displayName&&!merged.profile.displayName)merged.profile.displayName=incoming.profile.displayName;
 merged.meta={...(incoming.meta||{}),...(merged.meta||{})};
 return normalizeState(merged);
}
async function importFile(){
 const file=document.getElementById("importFile").files[0];if(!file)return alert("ファイルを選択してください");
 const txt=await file.text();let imported=null;
 try{
   if(file.name.toLowerCase().endsWith(".json")){
     const x=JSON.parse(txt);
     if([3,4].includes(x.schemaVersion)&&x.phases)imported=normalizeState(x);
     else if(x.records)imported=normalizeState(legacyToV3(x));
   }else if(file.name.toLowerCase().endsWith(".csv"))imported=csvToV3(txt);
 }catch(e){console.error(e)}
 if(!imported)return alert("読み込める形式ではありませんでした。JSONまたは対応CSVを選択してください。");
 const mode=document.getElementById("importMode").value;
 const overview=[1,2,3].map(p=>`Phase ${p}: ${countObj(imported.phases[String(p)].records)}/14日`).join("\n");
 if(mode==="replace"){
   if(!confirm(`置き換えモードです。\n現在のv004記録は消え、読み込んだ内容に置き換わります。\n先に現在のデータのJSONをバックアップしてください。\n\n読み込む内容：\n${overview}\n\n本当に続けますか？`))return;
 }else{
   if(!confirm(`既存の日別記録を優先して、バックアップの未登録データ・未設定の評価を取り込みます。\n\n読み込む内容：\n${overview}\n\nよろしいですか？`))return;
 }
 const old=state;
 const newState=mode==="replace"?normalizeState(imported):mergeStates(state,imported);
 state=newState;
 if(!save(state)){state=old;return}
 ensurePhaseStatus();
 document.getElementById("migrationStatus").classList.remove("hidden");
 document.getElementById("migrationStatus").textContent=`読み込み完了（${mode==="merge"?"既存データを保持して統合":"置き換え"}）。`;
 goto("home");
}
function legacyToV3(old){
 const s=freshState();s.phases["1"].baseline=(old.baseline||[]).map((x,i)=>({id:phaseCfg(1).baseline[i]?.id||("b"+i),label:x.label,score:Number(x.score)}));s.phases["1"].records=clone(old.records||{});s.phases["1"].startedAt=old.startDate||null;s.phases["1"].status=countObj(old.records)>=14?"completed":"active";if(s.phases["1"].status==="completed"){s.phases["2"].status="not_started";s.activePhase=2}s.meta.migratedFrom="v002-json";return s;
}
function csvToV3(txt){
 const lines=parseCSV(txt.replace(/^\ufeff/,""));if(lines.length<2)return null;
 const h=lines[0],ix=n=>h.indexOf(n),get=(row,name)=>ix(name)<0?"":(row[ix(name)]||"");
 if(ix("day")<0||ix("statement")<0)return null;
 const s=freshState();
 for(const row of lines.slice(1)){
   if(row.every(x=>!x))continue;
   const d=Number(get(row,"day")),p=Number(get(row,"phase")||1);if(!Number.isInteger(d)||d<1||d>14||![1,2,3].includes(p))continue;
   const pd=s.phases[String(p)],key=String(d);
   if(!pd.records[key])pd.records[key]={statements:[],did:get(row,"did"),want:get(row,"want"),prediction:get(row,"prediction"),actual:get(row,"actual"),note:get(row,"note"),actionType:get(row,"action_type"),nextStep:get(row,"next_step"),savedAt:"date-not-in-csv"};
   pd.records[key].statements.push({statement:get(row,"statement"),score:Number(get(row,"score")||5),bodies:get(row,"body").split("|").filter(Boolean),bodyMemo:get(row,"body_memo"),reactionTypes:get(row,"reaction_type").split("|").filter(Boolean)});
 }
 for(let p=1;p<=3;p++){
   const pd=s.phases[String(p)],n=countObj(pd.records);
   if(n)pd.status="active";
 }
 if(s.phases["1"].status==="completed"&&s.phases["2"].status==="locked")s.phases["2"].status="not_started";
 if(s.phases["2"].status==="completed"&&s.phases["3"].status==="locked")s.phases["3"].status="not_started";
 s.meta.migratedFrom="CSV";return s;
}
function parseCSV(t){
 const rows=[];let row=[],cell="",q=false;
 for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c==='"'&&t[i+1]==='"'){cell+='"';i++}else if(c==='"')q=false;else cell+=c}else{if(c==='"')q=true;else if(c===','){row.push(cell);cell=""}else if(c==='\n'){row.push(cell.replace(/\r$/,""));rows.push(row);row=[];cell=""}else cell+=c}}
 if(cell||row.length){row.push(cell);rows.push(row)}return rows;
}
function countObj(o){return Object.values(o||{}).filter(r=>r?.savedAt||r?.statements).length}
function resetAll(){if(confirm("この端末のv004記録を初期化します。v003側の原本は残ります。バックアップがないデータは戻せません。")){state=freshState();if(save(state))location.reload()}}

renderHome();
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(console.warn));