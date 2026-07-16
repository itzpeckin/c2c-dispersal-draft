import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, collection, getDocs,
  serverTimestamp, query, orderBy, onSnapshot
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js?v=202";

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

function normalizeEmail(v){return String(v||"").trim().toLowerCase()}
function accountForEmail(email){return TEAM_ACCOUNTS.find(x=>x.email===normalizeEmail(email))}
function accountForTeam(team){return TEAM_ACCOUNTS.find(x=>x.team===team)}
function showOnly(id){screens.forEach(x=>$(x).classList.toggle("hidden",x!==id))}
function setMessage(id,text="",type=""){const el=$(id);el.textContent=text;el.className=`message ${type}`.trim();el.classList.toggle("hidden",!text)}
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
    $("signedInTeam").textContent=profile.team;$("signedInEmail").textContent=profile.email;
    const commissioner=profile.role==="commissioner";
    $("commissionerToggle").classList.toggle("hidden",!commissioner);
    $("commissionerRail").classList.toggle("hidden",!commissioner);
    showOnly("app");
    renderBoard();
    subscribeToDraft();
    if(commissioner)await loadMemberDashboard();
  }catch(error){showOnly("authScreen");setMessage("authMessage",friendlyError(error),"error")}
}
function cleanupDraftListener(){if(unsubscribeDraft){unsubscribeDraft();unsubscribeDraft=null}}

function subscribeToDraft(){
  cleanupDraftListener();
  $("connectionChip").textContent="Connecting…";$("connectionChip").classList.remove("live");
  const ref=doc(db,...DRAFT_STATE_REF_PATH);
  unsubscribeDraft=onSnapshot(ref,snap=>{
    $("connectionChip").textContent="Live";$("connectionChip").classList.add("live");
    liveDraftState=snap.exists()?snap.data():null;
    renderDraftState();
  },error=>{
    $("connectionChip").textContent="Connection error";
    setMessage("draftControlMessage",friendlyError(error),"error");
  });
}
function renderBoard(){
  const html=[];
  for(let col=0;col<12;col++){
    const currentColumn=liveDraftState?.initialized&&liveDraftState.currentPick<TOTAL_PICKS
      ? columnForOverallPick(liveDraftState.currentPick):null;
    html.push(`<div class="owner-header ${currentColumn===col?"on-clock":""}">${BASE_ORDER[col]}</div>`);
  }
  for(let round=0;round<6;round++){
    for(let col=0;col<12;col++){
      const index=overallIndexForCell(round,col),rp=roundPick(index);
      const status=!liveDraftState?.initialized?"Waiting":
        index<liveDraftState.currentPick?"Passed":
        index===liveDraftState.currentPick?"On the clock":"Upcoming";
      html.push(`<div class="pick-tile ${index===liveDraftState?.currentPick?"current":""} ${index<(liveDraftState?.currentPick??0)?"past":""}">
        <div class="pick-label">Pick #${index+1}</div>
        <div class="pick-owner">${ownerForOverallPick(index)}</div>
        <div class="pick-state">Round ${rp.round}, Pick ${rp.pick} • ${status}</div>
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
    initialized:true,status:"running",currentPick:0,totalPicks:TOTAL_PICKS,
    rounds:6,teams:BASE_ORDER,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),updatedBy:auth.currentUser.uid
  });
  toast("Draft initialized");
};
$("pauseResumeDraft").onclick=async()=>{
  if(!liveDraftState?.initialized)return toast("Initialize the draft first");
  const status=liveDraftState.status==="paused"?"running":"paused";
  await writeDraftState({status});toast(status==="paused"?"Draft paused":"Draft resumed");
};
$("advancePick").onclick=async()=>{
  if(!liveDraftState?.initialized)return toast("Initialize the draft first");
  const next=Math.min(TOTAL_PICKS,(liveDraftState.currentPick??0)+1);
  await writeDraftState({currentPick:next,status:next>=TOTAL_PICKS?"complete":liveDraftState.status==="paused"?"paused":"running"});
};
$("previousPick").onclick=async()=>{
  if(!liveDraftState?.initialized)return toast("Initialize the draft first");
  await writeDraftState({currentPick:Math.max(0,(liveDraftState.currentPick??0)-1),status:"paused"});
};
$("resetDraftState").onclick=async()=>{
  if(!confirm("Reset the live draft to an uninitialized state?"))return;
  await setDoc(doc(db,...DRAFT_STATE_REF_PATH),{
    initialized:false,status:"waiting",currentPick:0,totalPicks:TOTAL_PICKS,
    rounds:6,teams:BASE_ORDER,updatedAt:serverTimestamp(),updatedBy:auth.currentUser.uid
  });
  toast("Live draft state reset");
};

$("commissionerToggle").onclick=$("commissionerRail").onclick=()=>{$("commissionerDrawer").classList.add("open")};
$("closeCommissioner").onclick=()=>$("commissionerDrawer").classList.remove("open");
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

onAuthStateChanged(auth,user=>user?loadCurrentUser(user):loadCurrentUser(null));
