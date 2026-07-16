import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, collection,
  getDocs, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js?v=101";

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

const COMMISSIONER_EMAIL = "justinrmandaro@gmail.com";
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = id => document.getElementById(id);
const screens = ["loadingScreen","authScreen","pendingScreen","rejectedScreen","app"];

function showOnly(id){
  screens.forEach(screenId => $(screenId).classList.toggle("hidden", screenId !== id));
}
function normalizeEmail(value){ return String(value || "").trim().toLowerCase(); }
function accountForEmail(email){ return TEAM_ACCOUNTS.find(x => x.email === normalizeEmail(email)); }
function accountForTeam(team){ return TEAM_ACCOUNTS.find(x => x.team === team); }

function setMessage(id, text="", type=""){
  const el=$(id);
  el.textContent=text;
  el.className=`message ${type}`.trim();
  el.classList.toggle("hidden", !text);
}
function friendlyError(error){
  const code=error?.code || "";
  const messages={
    "auth/email-already-in-use":"An account already exists for this email. Use Sign In instead.",
    "auth/invalid-credential":"The email or password is incorrect.",
    "auth/invalid-email":"Enter a valid email address.",
    "auth/weak-password":"Your password must contain at least six characters.",
    "auth/too-many-requests":"Too many attempts were made. Wait a few minutes and try again.",
    "permission-denied":"Firebase blocked this action. Confirm the Firestore rules were published."
  };
  return messages[code] || error?.message || "Something went wrong. Please try again.";
}
function toast(text){
  $("toast").textContent=text;
  $("toast").classList.add("show");
  window.setTimeout(()=>$("toast").classList.remove("show"),2200);
}

function populateTeams(){
  $("registerTeam").innerHTML = `<option value="">Choose your assigned team</option>` +
    TEAM_ACCOUNTS.map(x=>`<option value="${x.team}">${x.team}</option>`).join("");
}
populateTeams();

document.querySelectorAll("[data-auth-tab]").forEach(button=>{
  button.addEventListener("click",()=>{
    document.querySelectorAll("[data-auth-tab]").forEach(x=>x.classList.toggle("active",x===button));
    const register=button.dataset.authTab==="register";
    $("registerForm").classList.toggle("hidden",!register);
    $("signInForm").classList.toggle("hidden",register);
    setMessage("authMessage");
  });
});

$("registerTeam").addEventListener("change",()=>{
  const account=accountForTeam($("registerTeam").value);
  if(account) $("registerEmail").value=account.email;
});

$("registerForm").addEventListener("submit",async event=>{
  event.preventDefault();
  setMessage("authMessage");
  const displayName=$("registerName").value.trim();
  const requestedTeam=$("registerTeam").value;
  const email=normalizeEmail($("registerEmail").value);
  const password=$("registerPassword").value;
  const assigned=accountForTeam(requestedTeam);

  if(!assigned || assigned.email!==email){
    setMessage("authMessage","That email does not match the selected draft team. Use the assigned email address.","error");
    return;
  }

  try{
    const credential=await createUserWithEmailAndPassword(auth,email,password);
    const isCommissioner=email===COMMISSIONER_EMAIL;
    await setDoc(doc(db,"users",credential.user.uid),{
      uid:credential.user.uid,
      displayName,
      email,
      requestedTeam,
      team:isCommissioner?"Peckin":null,
      draftPosition:isCommissioner?8:null,
      role:isCommissioner?"commissioner":"member",
      status:isCommissioner?"approved":"pending",
      createdAt:serverTimestamp(),
      approvedAt:isCommissioner?serverTimestamp():null,
      approvedBy:isCommissioner?credential.user.uid:null
    });
    toast(isCommissioner?"Commissioner account created":"Account created");
  }catch(error){
    console.error(error);
    setMessage("authMessage",friendlyError(error),"error");
  }
});

$("signInForm").addEventListener("submit",async event=>{
  event.preventDefault();
  setMessage("authMessage");
  try{
    await signInWithEmailAndPassword(auth,normalizeEmail($("signInEmail").value),$("signInPassword").value);
  }catch(error){
    console.error(error);
    setMessage("authMessage",friendlyError(error),"error");
  }
});

$("forgotPassword").addEventListener("click",async()=>{
  const email=normalizeEmail($("signInEmail").value);
  if(!email){
    setMessage("authMessage","Enter your email above, then click Forgot password.","error");
    return;
  }
  try{
    await sendPasswordResetEmail(auth,email);
    setMessage("authMessage","Password-reset email sent. Check your inbox and spam folder.","success");
  }catch(error){
    setMessage("authMessage",friendlyError(error),"error");
  }
});

document.querySelectorAll("[data-signout]").forEach(button=>button.addEventListener("click",()=>signOut(auth)));
$("pendingRefresh").addEventListener("click",()=>loadCurrentUser(auth.currentUser,true));
$("refreshMembers").addEventListener("click",loadMemberDashboard);

async function loadCurrentUser(user,manual=false){
  if(!user){ showOnly("authScreen"); return; }
  try{
    const ref=doc(db,"users",user.uid);
    const snap=await getDoc(ref);
    if(!snap.exists()){
      const assigned=accountForEmail(user.email);
      if(!assigned){
        await signOut(auth);
        showOnly("authScreen");
        setMessage("authMessage","This email is not assigned to a draft team.","error");
        return;
      }
      const isCommissioner=normalizeEmail(user.email)===COMMISSIONER_EMAIL;
      await setDoc(ref,{
        uid:user.uid,displayName:user.email.split("@")[0],email:normalizeEmail(user.email),
        requestedTeam:assigned.team,team:isCommissioner?"Peckin":null,
        draftPosition:isCommissioner?8:null,role:isCommissioner?"commissioner":"member",
        status:isCommissioner?"approved":"pending",createdAt:serverTimestamp()
      });
      return loadCurrentUser(user);
    }

    const profile=snap.data();
    if(profile.status==="pending"){
      $("pendingTeam").textContent=profile.requestedTeam || "Not selected";
      showOnly("pendingScreen");
      if(manual) toast("Approval is still pending");
      return;
    }
    if(profile.status==="rejected"){
      $("rejectedMessage").textContent=profile.rejectionReason || "The commissioner rejected this registration.";
      showOnly("rejectedScreen");
      return;
    }
    if(profile.status!=="approved"){
      showOnly("pendingScreen");
      return;
    }

    $("signedInTeam").textContent=profile.team;
    $("signedInEmail").textContent=profile.email;
    $("memberWelcome").textContent=profile.role==="commissioner"
      ? "You are signed in as Peckin with commissioner access."
      : `You are signed in as ${profile.team}.`;
    $("commissionerDashboard").classList.toggle("hidden",profile.role!=="commissioner");
    showOnly("app");
    if(profile.role==="commissioner") await loadMemberDashboard();
  }catch(error){
    console.error(error);
    showOnly("authScreen");
    setMessage("authMessage",friendlyError(error),"error");
  }
}

async function loadMemberDashboard(){
  if(!auth.currentUser) return;
  setMessage("memberMessage");
  try{
    const snapshot=await getDocs(query(collection(db,"users"),orderBy("createdAt","asc")));
    const users=snapshot.docs.map(d=>({id:d.id,...d.data()}));
    const pending=users.filter(x=>x.status==="pending");
    const approved=users.filter(x=>x.status==="approved");
    const assignedTeams=new Set(approved.map(x=>x.team).filter(Boolean));
    const available=TEAM_ACCOUNTS.filter(x=>!assignedTeams.has(x.team));

    $("pendingCount").textContent=pending.length;
    $("approvedCount").textContent=approved.length;
    $("availableCount").textContent=available.length;

    $("pendingUsers").innerHTML=pending.length ? pending.map(renderPendingUser).join("") :
      `<div class="empty-state">There are no pending registrations.</div>`;

    $("approvedUsers").innerHTML=approved.length ? approved.map(renderApprovedUser).join("") :
      `<div class="empty-state">No accounts have been approved.</div>`;

    document.querySelectorAll("[data-approve-user]").forEach(button=>button.addEventListener("click",()=>approveUser(button.dataset.approveUser)));
    document.querySelectorAll("[data-reject-user]").forEach(button=>button.addEventListener("click",()=>rejectUser(button.dataset.rejectUser)));
    document.querySelectorAll("[data-revoke-user]").forEach(button=>button.addEventListener("click",()=>revokeUser(button.dataset.revokeUser)));
  }catch(error){
    console.error(error);
    setMessage("memberMessage",friendlyError(error),"error");
  }
}

function safe(value){
  return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
}
function teamOptions(selected){
  return TEAM_ACCOUNTS.map(x=>`<option value="${x.team}" ${x.team===selected?"selected":""}>${x.team}</option>`).join("");
}
function renderPendingUser(user){
  return `<div class="member-row">
    <div><h4>${safe(user.displayName)}</h4><p>${safe(user.email)}</p></div>
    <div><p>Requested team</p><strong>${safe(user.requestedTeam)}</strong></div>
    <div><select id="assign-${user.id}">${teamOptions(user.requestedTeam)}</select></div>
    <div class="member-actions">
      <button class="btn green" data-approve-user="${user.id}">Approve</button>
      <button class="btn danger" data-reject-user="${user.id}">Reject</button>
    </div>
  </div>`;
}
function renderApprovedUser(user){
  return `<div class="member-row">
    <div><h4>${safe(user.team)}</h4><p>${safe(user.email)}</p></div>
    <div><span class="role-chip ${user.role==="commissioner"?"commissioner":""}">${safe(user.role)}</span></div>
    <div><p>${safe(user.displayName)}</p></div>
    <div class="member-actions">
      ${user.role==="commissioner"?"":`<button class="btn danger" data-revoke-user="${user.id}">Return to Pending</button>`}
    </div>
  </div>`;
}

async function approveUser(uid){
  const team=$(`assign-${uid}`).value;
  const account=accountForTeam(team);
  if(!account) return;
  try{
    const userSnap=await getDoc(doc(db,"users",uid));
    if(!userSnap.exists()) throw new Error("User record was not found.");
    const profile=userSnap.data();
    if(normalizeEmail(profile.email)!==account.email){
      setMessage("memberMessage",`The registered email does not match ${team}. Choose the team assigned to ${profile.email}.`,"error");
      return;
    }

    const all=await getDocs(collection(db,"users"));
    const duplicate=all.docs.some(d=>d.id!==uid && d.data().status==="approved" && d.data().team===team);
    if(duplicate){
      setMessage("memberMessage",`${team} is already assigned to another approved account.`,"error");
      return;
    }

    await updateDoc(doc(db,"users",uid),{
      team,
      draftPosition:account.draftPosition,
      role:"member",
      status:"approved",
      approvedAt:serverTimestamp(),
      approvedBy:auth.currentUser.uid,
      rejectionReason:null
    });
    toast(`${team} approved`);
    await loadMemberDashboard();
  }catch(error){
    setMessage("memberMessage",friendlyError(error),"error");
  }
}
async function rejectUser(uid){
  const reason=window.prompt("Optional reason for rejection:","Email or team selection needs to be corrected.");
  if(reason===null) return;
  try{
    await updateDoc(doc(db,"users",uid),{
      status:"rejected",rejectionReason:reason,approvedAt:null,approvedBy:auth.currentUser.uid
    });
    toast("Registration rejected");
    await loadMemberDashboard();
  }catch(error){ setMessage("memberMessage",friendlyError(error),"error"); }
}
async function revokeUser(uid){
  if(!window.confirm("Return this member to Pending status?")) return;
  try{
    await updateDoc(doc(db,"users",uid),{
      status:"pending",team:null,draftPosition:null,approvedAt:null,approvedBy:auth.currentUser.uid
    });
    toast("Account returned to pending");
    await loadMemberDashboard();
  }catch(error){ setMessage("memberMessage",friendlyError(error),"error"); }
}

onAuthStateChanged(auth,user=>{
  if(user) loadCurrentUser(user);
  else showOnly("authScreen");
});
