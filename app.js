import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, collection, getDocs,
  serverTimestamp, query, orderBy, onSnapshot, runTransaction
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js?v=410";

const TEAM_ACCOUNTS = [
  { team:"YoByronWatkins", email:"byronwatkins@gmail.com", draftPosition:1 },
  { team:"erics2423", email:"erics2423@yahoo.com", draftPosition:2 },
  { team:"BenMoore13", email:"biggtyme13@gmail.com", draftPosition:3 },
  { team:"Vandorjp", email:"joevandorn@gmail.com", draftPosition:4 },
  { team:"LouGarou", email:"nate.hagemann@gmail.com", draftPosition:5 },
  { team:"BKnappy", email:"bronsonknapp13@gmail.com", draftPosition:6 },
  { team:"Tsummers3", email:"trey.summers3@gmail.com", draftPosition:7 },
  { team:"Peckin", email:"justinrmandaro@gmail.com", draftPosition:8, commissioner:true },
  { team:"Jonredcorn08", email:"jstyner0425@email.campbell.edu", draftPosition:9 },
  { team:"Jimmer44", email:"jmiakisz@gmail.com", draftPosition:10 },
  { team:"PiratesJs", email:"bjcurrie12@gmail.com", draftPosition:11 },
  { team:"CalBrewski", email:"caleb.ds.lucas@gmail.com", draftPosition:12 }
];
const BASE_ORDER = TEAM_ACCOUNTS.map(x=>x.team);
const COMMISSIONER_EMAIL="justinrmandaro@gmail.com";
const TOTAL_PICKS=72;
const DRAFT_STATE_REF_PATH=["draft","main"];

const app=initializeApp(firebaseConfig);
const auth=getAuth(app);
const db=getFirestore(app);
const $=id=>document.getElementById(id);
const screens=["loadingScreen","authScreen","pendingScreen","rejectedScreen","app"];
let currentProfile=null;
let liveDraftState=null;
let unsubscribeDraft=null;
let unsubscribeSelections=null;
let draftSelections={};
let players=[];
let playerLevelFilter="ALL";
let playerPositionFilter="ALL";
let playerSortKey="fantasy_points";
let playerSortDirection="desc";
let selectedPlayerId=null;
let commissionerDraftMode=null;
let assumedTeam=null;

function normalizeEmail(v){return String(v||"").trim().toLowerCase()}
function accountForEmail(email){return TEAM_ACCOUNTS.find(x=>x.email===normalizeEmail(email))}
function accountForTeam(team){return TEAM_ACCOUNTS.find(x=>x.team===team)}
function showOnly(id){screens.forEach(x=>$(x).classList.toggle("hidden",x!==id))}
function setMessage(id,text="",type=""){const el=$(id);el.textContent=text;el.className=`message ${type}`.trim();el.classList.toggle("hidden",!text)}
function actingTeam(){
  if(currentProfile?.role==="commissioner"&&assumedTeam)return assumedTeam;
  return currentProfile?.team||null;
}
function refreshSignedInIdentity(){
  if(!$("signedInTeam")||!currentProfile)return;
  $("signedInTeam").innerHTML=`${safe(currentProfile.team)}${assumedTeam?`<span class="assumed-team-chip">Testing as ${safe(assumedTeam)}</span>`:""}`;
}
function toast(text){$("toast").textContent=text;$("toast").classList.add("show");setTimeout(()=>$("toast").classList.remove("show"),2200)}
function safe(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function friendlyError(error){
  const code=error?.code||"";
  return ({
    "auth/email-already-in-use":"An account already exists for this email.",
    "auth/invalid-credential":"The email or password is incorrect.",
    "auth/invalid-email":"Enter a valid email address.",
    "auth/weak-password":"Your password must contain at least six characters.",
    "permission-denied":"Firebase blocked this action. Publish the Milestone 2 Firestore rules."
  })[code]||error?.message||"Something went wrong."
}
function ownerForOverallPick(index){
  const round=Math.floor(index/12);
  const slot=index%12;
  return round%2===0 ? BASE_ORDER[slot] : BASE_ORDER[11-slot];
}
function columnForOverallPick(index){
  const round=Math.floor(index/12),slot=index%12;
  return round%2===0?slot:11-slot;
}
function overallIndexForCell(round,column){
  return round%2===0 ? round*12+column : round*12+(11-column);
}
function roundPick(index){return {round:Math.floor(index/12)+1,pick:(index%12)+1}}

$("assumeIdentitySelect").innerHTML=`<option value="">Commissioner (Peckin)</option>`+
  BASE_ORDER.map(team=>`<option value="${team}">${team}</option>`).join("");
$("assumeIdentitySelect").onchange=()=>{
  assumedTeam=$("assumeIdentitySelect").value||null;
  const notice=$("assumedIdentityNotice");
  if(assumedTeam){
    notice.textContent=`Testing as ${assumedTeam}.`;
    notice.classList.remove("hidden");
  }else{
    notice.textContent="";
    notice.classList.add("hidden");
  }
  refreshSignedInIdentity();
  updatePlayerDraftButton();
};

$("registerTeam").innerHTML=`<option value="">Choose your assigned team</option>`+
  TEAM_ACCOUNTS.map(x=>`<option value="${x.team}">${x.team}</option>`).join("");

document.querySelectorAll("[data-auth-tab]").forEach(button=>button.onclick=()=>{
  document.querySelectorAll("[data-auth-tab]").forEach(x=>x.classList.toggle("active",x===button));
  const register=button.dataset.authTab==="register";
  $("registerForm").classList.toggle("hidden",!register);
  $("signInForm").classList.toggle("hidden",register);
  setMessage("authMessage");
});
$("registerTeam").onchange=()=>{const a=accountForTeam($("registerTeam").value);if(a)$("registerEmail").value=a.email};

$("registerForm").onsubmit=async event=>{
  event.preventDefault();setMessage("authMessage");
  const displayName=$("registerName").value.trim(),requestedTeam=$("registerTeam").value;
  const email=normalizeEmail($("registerEmail").value),password=$("registerPassword").value;
  const assigned=accountForTeam(requestedTeam);
  if(!assigned||assigned.email!==email)return setMessage("authMessage","That email does not match the selected draft team.","error");
  try{
    const credential=await createUserWithEmailAndPassword(auth,email,password);
    const commissioner=email===COMMISSIONER_EMAIL;
    await setDoc(doc(db,"users",credential.user.uid),{
      uid:credential.user.uid,displayName,email,requestedTeam,
      team:commissioner?"Peckin":null,draftPosition:commissioner?8:null,
      role:commissioner?"commissioner":"member",status:commissioner?"approved":"pending",
      createdAt:serverTimestamp(),approvedAt:commissioner?serverTimestamp():null,
      approvedBy:commissioner?credential.user.uid:null
    });
  }catch(error){setMessage("authMessage",friendlyError(error),"error")}
};
$("signInForm").onsubmit=async event=>{
  event.preventDefault();setMessage("authMessage");
  try{await signInWithEmailAndPassword(auth,normalizeEmail($("signInEmail").value),$("signInPassword").value)}
  catch(error){setMessage("authMessage",friendlyError(error),"error")}
};
$("forgotPassword").onclick=async()=>{
  const email=normalizeEmail($("signInEmail").value);
  if(!email)return setMessage("authMessage","Enter your email first.","error");
  try{await sendPasswordResetEmail(auth,email);setMessage("authMessage","Password-reset email sent.","success")}
  catch(error){setMessage("authMessage",friendlyError(error),"error")}
};
document.querySelectorAll("[data-signout]").forEach(b=>b.onclick=()=>signOut(auth));
$("pendingRefresh").onclick=()=>loadCurrentUser(auth.currentUser,true);

async function loadCurrentUser(user,manual=false){
  if(!user){cleanupDraftListener();showOnly("authScreen");return}
  try{
    const ref=doc(db,"users",user.uid),snap=await getDoc(ref);
    if(!snap.exists()){
      const assigned=accountForEmail(user.email);
      if(!assigned){await signOut(auth);return}
      const commissioner=normalizeEmail(user.email)===COMMISSIONER_EMAIL;
      await setDoc(ref,{uid:user.uid,displayName:user.email.split("@")[0],email:normalizeEmail(user.email),requestedTeam:assigned.team,
        team:commissioner?"Peckin":null,draftPosition:commissioner?8:null,role:commissioner?"commissioner":"member",
        status:commissioner?"approved":"pending",createdAt:serverTimestamp()});
      return loadCurrentUser(user);
    }
    const profile=snap.data();currentProfile=profile;
    if(profile.status==="pending"){$("pendingTeam").textContent=profile.requestedTeam||"—";showOnly("pendingScreen");if(manual)toast("Approval is still pending");return}
    if(profile.status==="rejected"){$("rejectedMessage").textContent=profile.rejectionReason||"Registration rejected.";showOnly("rejectedScreen");return}
    if(profile.status!=="approved"){showOnly("pendingScreen");return}
    $("signedInEmail").textContent=profile.email;refreshSignedInIdentity();
    const commissioner=profile.role==="commissioner";
    $("commissionerToggle").classList.toggle("hidden",!commissioner);
    $("commissionerRail").classList.toggle("hidden",!commissioner);
    showOnly("app");
    renderBoard();
    subscribeToDraft();
    if(!players.length) await loadPlayers();
    if(commissioner)await loadMemberDashboard();
  }catch(error){showOnly("authScreen");setMessage("authMessage",friendlyError(error),"error")}
}
function cleanupDraftListener(){
  if(unsubscribeDraft){unsubscribeDraft();unsubscribeDraft=null}
  if(unsubscribeSelections){unsubscribeSelections();unsubscribeSelections=null}
}

function subscribeToDraft(){
  cleanupDraftListener();
  $("connectionChip").textContent="Connecting…";$("connectionChip").classList.remove("live");
  const ref=doc(db,...DRAFT_STATE_REF_PATH);
  unsubscribeDraft=onSnapshot(ref,snap=>{
    $("connectionChip").textContent="Live";$("connectionChip").classList.add("live");
    liveDraftState=snap.exists()?snap.data():null;
    renderDraftState();
    if(selectedPlayerId)updatePlayerDraftButton();
  },error=>{
    $("connectionChip").textContent="Connection error";
    setMessage("draftControlMessage",friendlyError(error),"error");
  });
  unsubscribeSelections=onSnapshot(collection(db,"draftSelections"),snapshot=>{
    draftSelections={};
    snapshot.docs.forEach(d=>{const data=d.data();draftSelections[String(data.pickIndex)]={id:d.id,...data}});
    renderDraftState();
    renderPlayerRows();
    if(selectedPlayerId)updatePlayerDraftButton();
  },error=>{console.error(error);toast("Draft selections could not be synchronized")});
}
function currentOwnerForPick(index){
  const storedOwners=liveDraftState?.pickOwners;
  if(Array.isArray(storedOwners) && storedOwners[index]) return storedOwners[index];
  return ownerForOverallPick(index);
}
function tradeDetailForPick(index){
  const details=liveDraftState?.tradeDetails;
  if(!details) return null;
  return Array.isArray(details) ? details[index] : details[String(index)] || null;
}
function openTradeDetail(index){
  const detail=tradeDetailForPick(index);
  if(!detail) return;
  const sent=(detail.sent || []).join(", ") || "No draft assets";
  const received=(detail.received || []).join(", ") || "No draft assets";
  alert(`Trade details for Pick #${index+1}\n\n${detail.fromTeam || "Original owner"} sent:\n${sent}\n\n${detail.toTeam || "New owner"} sent:\n${received}`);
}
window.openC2CTradeDetail=openTradeDetail;

function playerById(id){return players.find(player=>player.id===id)}
function draftedPlayerIds(){return new Set(Object.values(draftSelections).map(selection=>selection.playerId))}
function renderBoard(){
  const html=[];
  const currentColumn=liveDraftState?.initialized&&liveDraftState.currentPick<TOTAL_PICKS
    ? columnForOverallPick(liveDraftState.currentPick):null;
  for(let col=0;col<12;col++){
    html.push(`<div class="owner-header ${currentColumn===col?"on-clock":""}" style="grid-column:${col+1};grid-row:1">${BASE_ORDER[col]}</div>`);
  }
  for(let round=0;round<6;round++){
    for(let col=0;col<12;col++){
      const index=overallIndexForCell(round,col);
      const selection=draftSelections[String(index)];
      const player=selection?playerById(selection.playerId):null;
      const status=!liveDraftState?.initialized?"Waiting":index<liveDraftState.currentPick?"Complete":index===liveDraftState.currentPick?"On the clock":"Upcoming";
      const originalOwner=ownerForOverallPick(index),currentOwner=currentOwnerForPick(index);
      const traded=currentOwner!==originalOwner,detail=tradeDetailForPick(index);
      html.push(`<div class="pick-tile ${index===liveDraftState?.currentPick?"current":""} ${index<(liveDraftState?.currentPick??0)?"past":""} ${traded?"traded":""} ${player?"has-player":""}" style="grid-column:${col+1};grid-row:${round+2}">
        <div class="pick-topline"><div class="pick-label">Pick #${index+1}</div>${traded?`<div class="traded-to">To: ${safe(currentOwner)}</div>`:""}</div>
        ${player?`<div class="pick-player-name">${safe(player.name)}</div><div class="pick-player-meta">${safe(player.position)} • ${safe(player.team||player.school||"—")}</div>`:`<div class="empty-pick">${status}</div>`}
        ${traded?`<button class="trade-detail-footer" type="button" ${detail?`onclick="openC2CTradeDetail(${index})"`:"disabled"}>${detail?"View trade details":"Trade details will appear here"}</button>`:(player?`<div class="pick-status-footer">${status}</div>`:"")}
      </div>`);
    }
  }
  $("draftBoard").innerHTML=html.join("");
}
function renderDraftState(){
  const state=liveDraftState;
  if(!state?.initialized){
    $("onClockTeam").textContent="Draft not initialized";$("pickSummary").textContent="Peckin must initialize the live draft.";
    $("overallPickDisplay").textContent="—";$("liveStatusChip").textContent="Waiting for commissioner";
    $("liveStatusChip").className="status-chip waiting";$("pausedBanner").classList.add("hidden");
  }else if(state.currentPick>=TOTAL_PICKS||state.status==="complete"){
    $("onClockTeam").textContent="Draft complete";$("pickSummary").textContent="All 72 selections have been completed.";
    $("overallPickDisplay").textContent="72";$("liveStatusChip").textContent="Draft complete";
    $("liveStatusChip").className="status-chip complete";$("pausedBanner").classList.add("hidden");
  }else{
    const rp=roundPick(state.currentPick);
    $("onClockTeam").textContent=ownerForOverallPick(state.currentPick);
    $("pickSummary").textContent=`Round ${rp.round}, Pick ${rp.pick}`;
    $("overallPickDisplay").textContent=state.currentPick+1;
    const paused=state.status==="paused";
    $("liveStatusChip").textContent=paused?"Draft paused":"Draft live";
    $("liveStatusChip").className=`status-chip ${paused?"paused":"running"}`;
    $("pausedBanner").classList.toggle("hidden",!paused);
  }
  $("pauseResumeDraft").textContent=state?.status==="paused"?"Resume Draft":"Pause Draft";
  renderBoard();
}

async function writeDraftState(data){
  if(currentProfile?.role!=="commissioner")return;
  try{await setDoc(doc(db,...DRAFT_STATE_REF_PATH),{...data,updatedAt:serverTimestamp(),updatedBy:auth.currentUser.uid},{merge:true})}
  catch(error){setMessage("draftControlMessage",friendlyError(error),"error")}
}
$("initializeDraft").onclick=async()=>{
  if(liveDraftState?.initialized&&!confirm("The draft is already initialized. Reinitialize at Pick #1?"))return;
  await setDoc(doc(db,...DRAFT_STATE_REF_PATH),{
    initialized:true,status:"running",currentPick:0,currentOwner:ownerForOverallPick(0),totalPicks:TOTAL_PICKS,
    rounds:6,teams:BASE_ORDER,pickOwners:Array.from({length:TOTAL_PICKS},(_,i)=>ownerForOverallPick(i)),createdAt:serverTimestamp(),updatedAt:serverTimestamp(),updatedBy:auth.currentUser.uid
  });
  toast("Draft initialized");
};
$("pauseResumeDraft").onclick=async()=>{
  if(!liveDraftState?.initialized)return toast("Initialize the draft first");
  const status=liveDraftState.status==="paused"?"running":"paused";
  await writeDraftState({status});toast(status==="paused"?"Draft paused":"Draft resumed");
};

$("resetDraftState").onclick=async()=>{
  if(!confirm("Reset the entire draft and remove every selection?"))return;
  try{
    const snapshot=await getDocs(collection(db,"draftSelections"));
    for(const selectionDoc of snapshot.docs){
      const data=selectionDoc.data();
      await runTransaction(db,async transaction=>{
        transaction.delete(selectionDoc.ref);
        transaction.delete(doc(db,"playerLocks",data.playerId));
      });
    }
    await setDoc(doc(db,...DRAFT_STATE_REF_PATH),{
      initialized:false,status:"waiting",currentPick:0,currentOwner:null,totalPicks:TOTAL_PICKS,
      rounds:6,teams:BASE_ORDER,pickOwners:Array.from({length:TOTAL_PICKS},(_,i)=>ownerForOverallPick(i)),
      updatedAt:serverTimestamp(),updatedBy:auth.currentUser.uid
    });
    commissionerDraftMode=null;toast("Entire draft reset");
  }catch(error){toast(error.message||"Could not reset draft")}
};

$("commissionerToggle").onclick=$("commissionerRail").onclick=()=>{
  closePlayerDrawer();
  $("commissionerDrawer").classList.add("open");
  updateDrawerBackdrop();
};
$("closeCommissioner").onclick=closeCommissionerDrawer;
$("refreshMembers").onclick=loadMemberDashboard;

async function loadMemberDashboard(){
  if(currentProfile?.role!=="commissioner")return;
  try{
    const snapshot=await getDocs(query(collection(db,"users"),orderBy("createdAt","asc")));
    const users=snapshot.docs.map(d=>({id:d.id,...d.data()})),pending=users.filter(x=>x.status==="pending"),approved=users.filter(x=>x.status==="approved");
    const assigned=new Set(approved.map(x=>x.team).filter(Boolean));
    $("pendingCount").textContent=pending.length;$("approvedCount").textContent=approved.length;
    $("availableCount").textContent=TEAM_ACCOUNTS.filter(x=>!assigned.has(x.team)).length;
    $("pendingUsers").innerHTML=pending.length?pending.map(renderPendingUser).join(""):`<div class="empty-state">No pending registrations.</div>`;
    $("approvedUsers").innerHTML=approved.length?approved.map(renderApprovedUser).join(""):`<div class="empty-state">No approved users.</div>`;
    document.querySelectorAll("[data-approve-user]").forEach(b=>b.onclick=()=>approveUser(b.dataset.approveUser));
    document.querySelectorAll("[data-reject-user]").forEach(b=>b.onclick=()=>rejectUser(b.dataset.rejectUser));
    document.querySelectorAll("[data-revoke-user]").forEach(b=>b.onclick=()=>revokeUser(b.dataset.revokeUser));
  }catch(error){setMessage("memberMessage",friendlyError(error),"error")}
}
function teamOptions(selected){return TEAM_ACCOUNTS.map(x=>`<option value="${x.team}" ${x.team===selected?"selected":""}>${x.team}</option>`).join("")}
function renderPendingUser(user){return `<div class="member-row"><div><h4>${safe(user.displayName)}</h4><p>${safe(user.email)}</p></div><div><strong>Requested: ${safe(user.requestedTeam)}</strong></div><select id="assign-${user.id}">${teamOptions(user.requestedTeam)}</select><div class="member-actions"><button class="btn green" data-approve-user="${user.id}">Approve</button><button class="btn danger" data-reject-user="${user.id}">Reject</button></div></div>`}
function renderApprovedUser(user){return `<div class="member-row"><div><h4>${safe(user.team)}</h4><p>${safe(user.email)}</p></div><div><span class="role-chip ${user.role==="commissioner"?"commissioner":""}">${safe(user.role)}</span></div>${user.role==="commissioner"?"":`<div class="member-actions"><button class="btn danger" data-revoke-user="${user.id}">Return to Pending</button></div>`}</div>`}
async function approveUser(uid){
  const team=$(`assign-${uid}`).value,account=accountForTeam(team);
  try{
    const userSnap=await getDoc(doc(db,"users",uid)),profile=userSnap.data();
    if(normalizeEmail(profile.email)!==account.email)return setMessage("memberMessage",`The registered email does not match ${team}.`,"error");
    const all=await getDocs(collection(db,"users"));
    if(all.docs.some(d=>d.id!==uid&&d.data().status==="approved"&&d.data().team===team))return setMessage("memberMessage",`${team} is already assigned.`,"error");
    await updateDoc(doc(db,"users",uid),{team,draftPosition:account.draftPosition,role:"member",status:"approved",approvedAt:serverTimestamp(),approvedBy:auth.currentUser.uid,rejectionReason:null});
    toast(`${team} approved`);loadMemberDashboard();
  }catch(error){setMessage("memberMessage",friendlyError(error),"error")}
}
async function rejectUser(uid){const reason=prompt("Reason for rejection:","Email or team selection needs correction.");if(reason===null)return;await updateDoc(doc(db,"users",uid),{status:"rejected",rejectionReason:reason,approvedBy:auth.currentUser.uid});loadMemberDashboard()}
async function revokeUser(uid){if(!confirm("Return this account to Pending?"))return;await updateDoc(doc(db,"users",uid),{status:"pending",team:null,draftPosition:null,approvedAt:null,approvedBy:auth.currentUser.uid});loadMemberDashboard()}


function parseCsv(text){
  const rows=[];let row=[],cell="",quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i],next=text[i+1];
    if(ch==='"'&&quoted&&next==='"'){cell+='"';i++}
    else if(ch==='"'){quoted=!quoted}
    else if(ch===','&&!quoted){row.push(cell);cell=""}
    else if((ch==='\n'||ch==='\r')&&!quoted){
      if(ch==='\r'&&next==='\n')i++;
      row.push(cell);cell="";
      if(row.some(value=>value!==""))rows.push(row);
      row=[];
    }else cell+=ch;
  }
  if(cell!==""||row.length){row.push(cell);rows.push(row)}
  if(!rows.length)return[];
  const headers=rows.shift().map(x=>x.trim());
  return rows.map(values=>Object.fromEntries(headers.map((h,i)=>[h,(values[i]??"").trim()])));
}
async function fetchCsv(path){
  const response=await fetch(path,{cache:"no-store"});
  if(!response.ok)throw new Error(`Could not load ${path}`);
  return parseCsv(await response.text());
}
async function loadPlayers(){
  try{
    const [nfl,ncaa]=await Promise.all([
      fetchCsv("./data/nfl-players.csv?v=300"),
      fetchCsv("./data/ncaa-players.csv?v=300")
    ]);
    players=[...nfl,...ncaa].filter(p=>p.name).sort((a,b)=>a.name.localeCompare(b.name));
    $("playerCountBadge").textContent=players.length;
    renderPlayerRows();
  }catch(error){
    console.error(error);
    $("playerRows").innerHTML=`<tr><td colspan="6">Could not load the player CSV files.</td></tr>`;
    toast("Player pool could not be loaded");
  }
}
function playerSortValue(player,key){
  if(key==="fantasy_points"){
    const value=Number(player.fantasy_points);
    return Number.isFinite(value)?value:-Infinity;
  }
  if(key==="class_year"){
    const raw=String(player.class_year||"").trim();
    const classOrder={"FR":1,"FRESHMAN":1,"SO":2,"SOPHOMORE":2,"JR":3,"JUNIOR":3,"SR":4,"SENIOR":4,"GR":5,"GRADUATE":5};
    return classOrder[raw.toUpperCase()] ?? raw.toLowerCase();
  }
  return String(player[key]||"").toLowerCase();
}
function comparePlayerValues(a,b){
  if(typeof a==="number"&&typeof b==="number")return a-b;
  return String(a).localeCompare(String(b),undefined,{numeric:true,sensitivity:"base"});
}
function filteredPlayers(){
  const term=$("playerSearch").value.trim().toLowerCase();
  const filtered=players.filter(player=>{
    const levelOk=playerLevelFilter==="ALL"||player.level===playerLevelFilter;
    const positionOk=playerPositionFilter==="ALL"||player.position===playerPositionFilter;
    const haystack=`${player.name} ${player.team} ${player.school} ${player.position} ${player.level} ${player.class_year}`.toLowerCase();
    return levelOk&&positionOk&&(!term||haystack.includes(term));
  });
  return filtered.sort((a,b)=>{
    const primary=comparePlayerValues(playerSortValue(a,playerSortKey),playerSortValue(b,playerSortKey));
    if(primary!==0)return playerSortDirection==="asc"?primary:-primary;
    return a.name.localeCompare(b.name);
  });
}
function displayFantasyPoints(player){
  const value=String(player.fantasy_points||"").trim();
  return value?`${Number(value).toFixed(1)}`:"Pending";
}
function renderPlayerRows(){
  if(!$("playerRows"))return;
  const list=filteredPlayers(),drafted=draftedPlayerIds();
  $("playerCountBadge").textContent=list.filter(player=>!drafted.has(player.id)).length;
  $("playerRows").innerHTML=list.length?list.map(player=>{
    const isDrafted=drafted.has(player.id);
    const selection=Object.values(draftSelections).find(item=>item.playerId===player.id);
    return `<tr class="${isDrafted?"drafted":""}" data-player-id="${safe(player.id)}">
      <td class="player-name-cell"><strong>${safe(player.name)}</strong><span>${isDrafted?`Drafted Pick #${Number(selection.pickIndex)+1}`:(player.level==="NFL"?`Sleeper roster ${safe(player.source_roster)} • ${safe(player.roster_slot)}`:"Fantrax player pool")}</span></td>
      <td><span class="level-pill ${player.level.toLowerCase()}">${safe(player.level)}</span></td>
      <td><span class="position-pill">${safe(player.position)}</span></td>
      <td>${safe(player.team||player.school||"—")}</td><td>${safe(player.class_year||"—")}</td>
      <td class="${player.fantasy_points?"fp-value":"fp-pending"}">${isDrafted?`<span class="drafted-label">DRAFTED</span>`:displayFantasyPoints(player)}</td>
    </tr>`;
  }).join(""):`<tr><td colspan="6">No players match the selected filters.</td></tr>`;
  document.querySelectorAll("#playerRows tr[data-player-id]").forEach(row=>{row.onclick=()=>openPlayerProfile(row.dataset.playerId)});
}
function openPlayerProfile(id){
  const player=players.find(x=>x.id===id);if(!player)return;
  selectedPlayerId=id;
  $("playerModalLevel").textContent=`${player.level} player profile`;$("playerModalName").textContent=player.name;
  $("playerModalMeta").textContent=player.level==="NFL"?`${player.position} • ${player.team}`:`${player.position} • ${player.team} • ${player.class_year||"Class not listed"}`;
  $("playerModalPosition").textContent=player.position||"—";$("playerModalTeam").textContent=player.team||player.school||"—";
  $("playerModalClass").textContent=player.class_year||"Not listed";$("playerModalFP").textContent=displayFantasyPoints(player);
  $("playerModalNote").textContent=player.level==="NFL"?"2025 PPR fantasy-point total from FantasyPros. This may differ from your Sleeper league because of custom scoring settings.":"Fantasy-point total supplied by the Fantrax roster export.";
  updatePlayerDraftButton();$("playerModal").classList.remove("hidden");
}
function closePlayerProfile(){$("playerModal").classList.add("hidden");selectedPlayerId=null}

function closePlayerDrawer(){
  $("playerDrawer").classList.remove("open");
  updateDrawerBackdrop();
}
function closeCommissionerDrawer(){
  $("commissionerDrawer").classList.remove("open");
  updateDrawerBackdrop();
}
function updateDrawerBackdrop(){
  let backdrop=$("drawerBackdrop");
  if(!backdrop){
    backdrop=document.createElement("div");
    backdrop.id="drawerBackdrop";
    backdrop.className="drawer-backdrop";
    document.body.appendChild(backdrop);
    backdrop.addEventListener("click",()=>{
      closePlayerDrawer();
      closeCommissionerDrawer();
    });
  }
  const anyOpen=$("playerDrawer").classList.contains("open")||$("commissionerDrawer").classList.contains("open");
  backdrop.classList.toggle("show",anyOpen);
}
$("playerRail").onclick=()=>{
  closeCommissionerDrawer();
  $("playerDrawer").classList.add("open");
  updateDrawerBackdrop();
  renderPlayerRows();
};
$("closePlayerDrawer").onclick=closePlayerDrawer;
$("closePlayerModal").onclick=closePlayerProfile;
$("playerModal").onclick=event=>{if(event.target===$("playerModal"))closePlayerProfile()};
$("playerSearch").oninput=renderPlayerRows;
document.querySelectorAll("[data-level]").forEach(button=>button.onclick=()=>{
  playerLevelFilter=button.dataset.level;
  document.querySelectorAll("[data-level]").forEach(x=>x.classList.toggle("active",x===button));
  renderPlayerRows();
});
document.querySelectorAll("[data-position]").forEach(button=>button.onclick=()=>{
  playerPositionFilter=button.dataset.position;
  document.querySelectorAll("[data-position]").forEach(x=>x.classList.toggle("active",x===button));
  renderPlayerRows();
});


function currentPickOwner(){
  if(!liveDraftState?.initialized||liveDraftState.currentPick>=TOTAL_PICKS)return null;
  return liveDraftState.currentOwner||currentOwnerForPick(liveDraftState.currentPick);
}
function normalDraftAllowed(){
  return currentProfile&&liveDraftState?.initialized&&liveDraftState.status==="running"&&liveDraftState.currentPick<TOTAL_PICKS&&(currentProfile.role==="commissioner"||actingTeam()===currentPickOwner());
}
function updatePlayerDraftButton(){
  if(!$("draftPlayerButton"))return;
  const player=playerById(selectedPlayerId),drafted=player&&draftedPlayerIds().has(player.id);
  const editing=currentProfile?.role==="commissioner"&&commissionerDraftMode?.type==="edit";
  const forcing=currentProfile?.role==="commissioner"&&commissionerDraftMode?.type==="force";
  const allowed=!drafted&&(editing||forcing||normalDraftAllowed());
  $("draftPlayerButton").disabled=!allowed;
  if(drafted){$("draftPlayerButton").textContent="Player Already Drafted";$("draftPlayerHint").textContent="This player is no longer available."}
  else if(editing){$("draftPlayerButton").textContent="Save Replacement Player";$("draftPlayerHint").textContent=`Replace Pick #${commissionerDraftMode.pickIndex+1}.`}
  else if(forcing){$("draftPlayerButton").textContent="Force Draft Player";$("draftPlayerHint").textContent=`Force Pick #${liveDraftState.currentPick+1} for ${currentPickOwner()}.`}
  else if(normalDraftAllowed()){$("draftPlayerButton").textContent="Draft Player";$("draftPlayerHint").textContent=`Draft for ${currentPickOwner()} at Pick #${liveDraftState.currentPick+1}${assumedTeam?` while testing as ${assumedTeam}`:""}.`}
  else if(liveDraftState?.status==="paused"){$("draftPlayerButton").textContent="Draft Paused";$("draftPlayerHint").textContent="The commissioner must resume the draft."}
  else{$("draftPlayerButton").textContent="Not Your Pick";$("draftPlayerHint").textContent=currentPickOwner()?`${currentPickOwner()} is on the clock.`:"The draft is not ready."}
}
async function saveDraftSelection(){
  const player=playerById(selectedPlayerId);if(!player)return;
  const editMode=currentProfile?.role==="commissioner"&&commissionerDraftMode?.type==="edit";
  const forceMode=currentProfile?.role==="commissioner"&&commissionerDraftMode?.type==="force";
  if(!editMode&&!forceMode&&!normalDraftAllowed())return;
  const targetIndex=editMode?commissionerDraftMode.pickIndex:liveDraftState.currentPick;
  const owner=currentOwnerForPick(targetIndex);
  try{
    await runTransaction(db,async transaction=>{
      const draftRef=doc(db,...DRAFT_STATE_REF_PATH),pickRef=doc(db,"draftSelections",String(targetIndex)),lockRef=doc(db,"playerLocks",player.id);
      const draftSnap=await transaction.get(draftRef),pickSnap=await transaction.get(pickRef),lockSnap=await transaction.get(lockRef);
      if(!draftSnap.exists())throw new Error("Draft state not found.");
      const state=draftSnap.data();
      if(lockSnap.exists())throw new Error("This player has already been drafted.");
      if(editMode){if(pickSnap.exists())throw new Error("Remove the existing pick before replacing it.")}
      else{
        if(state.currentPick!==targetIndex)throw new Error("The pick changed. Reopen the player card.");
        if(pickSnap.exists())throw new Error("This pick already has a selection.");
        if(!forceMode&&state.status!=="running")throw new Error("The draft is paused.");
      }
      const selection={pickIndex:targetIndex,pickNumber:targetIndex+1,playerId:player.id,playerName:player.name,playerPosition:player.position,playerTeam:player.team||player.school||"",ownerTeam:owner,draftedByUid:auth.currentUser.uid,draftedByTeam:actingTeam(),forcedByCommissioner:forceMode,draftedAt:serverTimestamp()};
      transaction.set(pickRef,selection);transaction.set(lockRef,{playerId:player.id,pickIndex:targetIndex,draftedByUid:auth.currentUser.uid});
      if(!editMode){const next=Math.min(TOTAL_PICKS,targetIndex+1);transaction.update(draftRef,{currentPick:next,currentOwner:next<TOTAL_PICKS?currentOwnerForPick(next):null,status:next>=TOTAL_PICKS?"complete":"running",updatedAt:serverTimestamp(),updatedBy:auth.currentUser.uid})}
    });
    commissionerDraftMode=null;closePlayerProfile();toast(`${player.name} drafted`);
  }catch(error){console.error(error);toast(error.message||"Player could not be drafted")}
}
$("draftPlayerButton").onclick=saveDraftSelection;
function highestFantasyAvailablePlayer(){
  const drafted=draftedPlayerIds();
  return [...players]
    .filter(player=>!drafted.has(player.id))
    .sort((a,b)=>{
      const diff=(Number(b.fantasy_points)||0)-(Number(a.fantasy_points)||0);
      return diff!==0?diff:a.name.localeCompare(b.name);
    })[0]||null;
}
async function forceBestAvailablePick(){
  if(currentProfile?.role!=="commissioner")return;
  if(!liveDraftState?.initialized)return toast("Initialize the draft first");
  if(liveDraftState.currentPick>=TOTAL_PICKS)return toast("The draft is complete");
  if(!players.length)return toast("The player pool is still loading");
  const player=highestFantasyAvailablePlayer();
  if(!player)return toast("No eligible players remain");

  const pickIndex=liveDraftState.currentPick;
  const owner=currentPickOwner();
  if(!confirm(`Force Pick #${pickIndex+1}: ${player.name} (${player.fantasy_points||0} FP) for ${owner}?`))return;

  try{
    await runTransaction(db,async transaction=>{
      const draftRef=doc(db,...DRAFT_STATE_REF_PATH);
      const pickRef=doc(db,"draftSelections",String(pickIndex));
      const lockRef=doc(db,"playerLocks",player.id);
      const draftSnap=await transaction.get(draftRef);
      const pickSnap=await transaction.get(pickRef);
      const lockSnap=await transaction.get(lockRef);
      if(!draftSnap.exists())throw new Error("Draft state not found.");
      if(draftSnap.data().currentPick!==pickIndex)throw new Error("The current pick changed.");
      if(pickSnap.exists())throw new Error("This pick already has a selection.");
      if(lockSnap.exists())throw new Error("This player has already been drafted.");

      transaction.set(pickRef,{
        pickIndex,pickNumber:pickIndex+1,playerId:player.id,playerName:player.name,
        playerPosition:player.position,playerTeam:player.team||player.school||"",
        ownerTeam:owner,draftedByUid:auth.currentUser.uid,draftedByTeam:actingTeam(),
        forcedByCommissioner:true,draftedAt:serverTimestamp()
      });
      transaction.set(lockRef,{playerId:player.id,pickIndex,draftedByUid:auth.currentUser.uid});

      const next=Math.min(TOTAL_PICKS,pickIndex+1);
      transaction.update(draftRef,{
        currentPick:next,currentOwner:next<TOTAL_PICKS?currentOwnerForPick(next):null,
        status:next>=TOTAL_PICKS?"complete":draftSnap.data().status==="paused"?"paused":"running",
        updatedAt:serverTimestamp(),updatedBy:auth.currentUser.uid
      });
    });
    toast(`${player.name} force drafted`);
  }catch(error){
    console.error(error);
    toast(error.message||"Could not force the pick");
  }
}

async function undoLastPick(){
  const completed=Object.values(draftSelections).sort((a,b)=>b.pickIndex-a.pickIndex);if(!completed.length)return toast("There are no picks to undo");
  const last=completed[0];if(!confirm(`Undo Pick #${last.pickIndex+1}: ${last.playerName}?`))return;
  try{await runTransaction(db,async transaction=>{transaction.delete(doc(db,"draftSelections",String(last.pickIndex)));transaction.delete(doc(db,"playerLocks",last.playerId));transaction.update(doc(db,...DRAFT_STATE_REF_PATH),{currentPick:last.pickIndex,currentOwner:currentOwnerForPick(last.pickIndex),status:"paused",updatedAt:serverTimestamp(),updatedBy:auth.currentUser.uid})});toast("Last pick undone. Draft paused.")}
  catch(error){toast(error.message||"Could not undo pick")}
}
async function editPick(){
  const completed=Object.values(draftSelections).sort((a,b)=>a.pickIndex-b.pickIndex);if(!completed.length)return toast("There are no picks to edit");
  const response=prompt("Enter the overall pick number to edit:",String(completed.at(-1).pickIndex+1));if(response===null)return;
  const target=completed.find(x=>x.pickIndex===Number(response)-1);if(!target)return toast("That completed pick was not found");
  if(!confirm(`Replace ${target.playerName} at Pick #${target.pickIndex+1}?`))return;
  try{await runTransaction(db,async transaction=>{transaction.delete(doc(db,"draftSelections",String(target.pickIndex)));transaction.delete(doc(db,"playerLocks",target.playerId));transaction.update(doc(db,...DRAFT_STATE_REF_PATH),{status:"paused",updatedAt:serverTimestamp(),updatedBy:auth.currentUser.uid})});commissionerDraftMode={type:"edit",pickIndex:target.pickIndex};$("playerDrawer").classList.add("open");updateDrawerBackdrop();toast("Choose the replacement player")}
  catch(error){toast(error.message||"Could not edit pick")}
}

document.querySelectorAll("[data-sort]").forEach(button=>{
  button.addEventListener("click",()=>{
    const key=button.dataset.sort;
    if(playerSortKey===key){
      playerSortDirection=playerSortDirection==="asc"?"desc":"asc";
    }else{
      playerSortKey=key;
      playerSortDirection=key==="fantasy_points"?"desc":"asc";
    }
    document.querySelectorAll("[data-sort]").forEach(sortButton=>{
      const active=sortButton.dataset.sort===playerSortKey;
      sortButton.classList.toggle("active",active);
      const arrow=sortButton.querySelector(".sort-arrow");
      if(arrow)arrow.textContent=active?(playerSortDirection==="asc"?"▲":"▼"):"";
    });
    renderPlayerRows();
  });
});

// Clicking the uncovered draft-board area closes either open drawer.
document.addEventListener("click",event=>{
  const playerOpen=$("playerDrawer").classList.contains("open");
  const commissionerOpen=$("commissionerDrawer").classList.contains("open");
  if(!playerOpen&&!commissionerOpen)return;

  const insidePlayer=$("playerDrawer").contains(event.target)||$("playerRail").contains(event.target);
  const insideCommissioner=$("commissionerDrawer").contains(event.target)
    ||$("commissionerRail").contains(event.target)
    ||(!$("commissionerToggle").classList.contains("hidden")&&$("commissionerToggle").contains(event.target));

  const modalOpen=!$("playerModal").classList.contains("hidden");
  if(playerOpen&&!modalOpen&&!insidePlayer)closePlayerDrawer();
  if(commissionerOpen&&!insideCommissioner)closeCommissionerDrawer();
});


$("advancePick").textContent="Force Pick";$("previousPick").textContent="Undo Last Pick";
$("advancePick").onclick=forceBestAvailablePick;
$("previousPick").onclick=undoLastPick;
const editButton=document.createElement("button");editButton.id="editCompletedPick";editButton.className="btn";editButton.textContent="Edit Pick";editButton.onclick=editPick;$("resetDraftState").before(editButton);

onAuthStateChanged(auth,user=>user?loadCurrentUser(user):loadCurrentUser(null));
