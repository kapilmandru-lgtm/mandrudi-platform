/* ===== Mandrudi Plattform — PM-Modul (Phase 1: Projekte, Aufgaben, Kanban-Board) ===== */
(function(){
"use strict";

var S={ projectId:null };
var projects=[];
var tasks=[];
var profiles=[];
var dragTaskId=null;

var STATUSES=[
  {id:"todo", label:"Offen"},
  {id:"doing",label:"In Arbeit"},
  {id:"done", label:"Erledigt"}
];

function el(tag,cls,txt){var e=document.createElement(tag); if(cls)e.className=cls; if(txt!=null)e.textContent=txt; return e;}
function btn(txt,cls,fn){var b=el("button","btn "+cls,txt); b.onclick=fn; return b;}
function MP(){return window.MP||{};}
function supa(){return MP().supa;}
function msg(t,err){var m=document.getElementById("pm-msg"); if(m){m.textContent=t||""; m.className="dms-msg"+(err?" err":"");}}
function isAuthErr(err){var m=((err&&err.message)||err||"")+""; return /permission denied|jwt|not authenticated|auth session|session.*missing|unauthorized|row-level|\b401\b|\b403\b/i.test(m);}
function handleErr(err,fallback){ if(isAuthErr(err)){ if(MP().requireLogin)MP().requireLogin(); return true; } msg(fallback+((err&&err.message)?(": "+err.message):""),true); return false; }

async function ensureTenant(){
  var m=MP(); if(m.tenantId)return m.tenantId;
  if(!supa()||!m.user)return null;
  try{var r=await supa().from("profiles").select("tenant_id").eq("id",m.user.id).single(); if(r.data){m.tenantId=r.data.tenant_id;return r.data.tenant_id;}}catch(e){}
  try{
    await supa().rpc("ensure_my_profile");
    var r2=await supa().from("profiles").select("tenant_id").eq("id",m.user.id).single();
    if(r2.data){m.tenantId=r2.data.tenant_id;return r2.data.tenant_id;}
  }catch(e){}
  return null;
}

function todayStr(){ return new Date().toISOString().slice(0,10); }
function fmtDate(s){ if(!s)return""; try{ var d=new Date(s+"T00:00:00"); return d.toLocaleDateString(); }catch(e){ return s; } }
function projectById(id){ for(var i=0;i<projects.length;i++)if(projects[i].id===id)return projects[i]; return null; }
function profileName(id){ if(!id)return""; for(var i=0;i<profiles.length;i++)if(profiles[i].id===id)return profiles[i].display_name||"?"; return "?"; }
function taskCount(pid,status){ return tasks.filter(function(x){return x.project_id===pid && (!status||x.status===status);}).length; }

/* ---------- Aufbau ---------- */
function open(){
  var root=document.getElementById("view-pm"); if(!root)return;
  root.innerHTML="";
  var tt=MP().t; root.appendChild(el("h2",null,(tt&&tt("nav_pm"))||"Projekte"));

  if(!supa()||!MP().user){
    root.appendChild(el("p","lead","Bitte melde dich an, um Projekte zu verwalten. Im Demo-Modus wird nur die Oberfläche gezeigt."));
    return;
  }

  var wrap=el("div","dms-wrap pm-wrap");
  var side=el("div","dms-tree pm-side"); side.id="pm-side";
  var main=el("div","dms-main");
  wrap.appendChild(side); wrap.appendChild(main);

  var bar=el("div","dms-bar");
  var addTask=btn("+ Aufgabe","btn-primary",function(){ if(!S.projectId){msg("Bitte zuerst links ein Projekt wählen oder anlegen.",true);return;} taskForm({}); });
  addTask.id="pm-addtask";
  bar.appendChild(addTask);
  main.appendChild(bar);

  var m=el("div","dms-msg",""); m.id="pm-msg"; m.setAttribute("role","status"); main.appendChild(m);
  var head=el("div","pm-boardhead"); head.id="pm-boardhead"; main.appendChild(head);
  var board=el("div","pm-board"); board.id="pm-board"; main.appendChild(board);

  root.appendChild(wrap);

  Promise.all([loadProjects(),loadProfiles()]).then(function(){
    if(!S.projectId && projects.length)S.projectId=projects[0].id;
    renderProjects();
    loadTasks();
  });
}

/* ---------- Projekte ---------- */
async function loadProjects(){
  var r=await supa().from("pm_projects").select("*").eq("archived",false).order("created_at");
  if(r.error){ handleErr(r.error,"Fehler beim Laden der Projekte"); return; }
  projects=r.data||[];
  if(S.projectId && !projectById(S.projectId))S.projectId=projects.length?projects[0].id:null;
}
async function loadProfiles(){
  try{
    var r=await supa().from("profiles").select("id,display_name").order("display_name");
    profiles=(r&&r.data)||[];
  }catch(e){ profiles=[]; }
}
function selectProject(id){ S.projectId=id; renderProjects(); loadTasks(); }
async function newProject(){
  var name=prompt("Name des neuen Projekts:"); if(!name)return;
  var tid=await ensureTenant(); if(!tid){msg("Firma nicht ermittelt.",true);return;}
  var r=await supa().from("pm_projects").insert({tenant_id:tid,name:name}).select().single();
  if(r.error){msg("Fehler: "+r.error.message,true);return;}
  await loadProjects(); S.projectId=r.data.id; renderProjects(); loadTasks(); msg("Projekt angelegt.");
}
async function renameProject(p){
  var v=prompt("Neuer Projektname:",p.name); if(v===null||!v.trim())return;
  var r=await supa().from("pm_projects").update({name:v.trim()}).eq("id",p.id);
  if(r.error){msg("Fehler: "+r.error.message,true);return;}
  await loadProjects(); renderProjects(); renderBoardHead(); msg("Projekt umbenannt.");
}
async function deleteProject(p){
  if(!confirm("Projekt \""+p.name+"\" löschen? Alle Aufgaben darin werden mitgelöscht."))return;
  var r=await supa().from("pm_projects").delete().eq("id",p.id);
  if(r.error){msg("Fehler: "+r.error.message,true);return;}
  if(S.projectId===p.id)S.projectId=null;
  await loadProjects(); if(!S.projectId && projects.length)S.projectId=projects[0].id;
  renderProjects(); loadTasks(); msg("Projekt gelöscht.");
}
function renderProjects(){
  var side=document.getElementById("pm-side"); if(!side)return; side.innerHTML="";
  side.appendChild(el("div","tree-head","Projekte"));
  var addRow=el("div","tree-item","+ Projekt"); addRow.style.fontWeight="700"; addRow.style.color="var(--accent-600)";
  addRow.onclick=newProject; side.appendChild(addRow);
  if(!projects.length)side.appendChild(el("div","tree-empty","Noch keine Projekte – „+ Projekt“ legt eins an."));
  projects.forEach(function(p){
    var row=el("div","tree-item"+(S.projectId===p.id?" active":""));
    row.appendChild(el("span","tree-name",p.name));
    var n=taskCount(p.id); if(n)row.appendChild(el("span","tree-count",String(n)));
    if(S.projectId===p.id){
      var acts=el("span","tree-act");
      var rn=el("button","tree-btn","✎"); rn.title="Projekt umbenennen"; rn.onclick=function(ev){ev.stopPropagation();renameProject(p);};
      var dl=el("button","tree-btn","×"); dl.title="Projekt löschen"; dl.onclick=function(ev){ev.stopPropagation();deleteProject(p);};
      acts.appendChild(rn); acts.appendChild(dl); row.appendChild(acts);
    }
    row.onclick=function(){selectProject(p.id);};
    side.appendChild(row);
  });
}
function renderBoardHead(){
  var head=document.getElementById("pm-boardhead"); if(!head)return; head.innerHTML="";
  var p=S.projectId?projectById(S.projectId):null;
  head.appendChild(el("h3",null,p?p.name:"Kein Projekt ausgewählt"));
}

/* ---------- Aufgaben ---------- */
async function loadTasks(){
  var board=document.getElementById("pm-board"); if(!board)return;
  renderBoardHead();
  if(!S.projectId){ board.innerHTML=""; board.appendChild(el("div","empty","Wähle links ein Projekt oder lege eins an.")); return; }
  board.textContent="Lädt …";
  var r=await supa().from("pm_tasks").select("*").eq("project_id",S.projectId).order("created_at");
  if(r.error){ board.innerHTML=""; handleErr(r.error,"Fehler beim Laden der Aufgaben"); return; }
  tasks=r.data||[];
  renderProjects(); // Zähler aktualisieren
  renderBoard();
}
function renderBoard(){
  var board=document.getElementById("pm-board"); if(!board)return; board.innerHTML="";
  var list=tasks.filter(function(t){return t.project_id===S.projectId;});
  STATUSES.forEach(function(st){
    var col=el("div","pm-col"); col.dataset.status=st.id;
    col.ondragover=function(ev){ev.preventDefault(); col.classList.add("dragover");};
    col.ondragleave=function(){col.classList.remove("dragover");};
    col.ondrop=function(ev){ev.preventDefault(); col.classList.remove("dragover"); if(dragTaskId)setStatus(dragTaskId,st.id); dragTaskId=null;};
    var items=list.filter(function(t){return t.status===st.id;});
    var h=el("div","pm-col-head"); h.appendChild(el("span",null,st.label)); h.appendChild(el("span","pm-col-count",String(items.length)));
    col.appendChild(h);
    items.forEach(function(t){ col.appendChild(taskCard(t)); });
    board.appendChild(col);
  });
}
function taskCard(t){
  var overdue = t.due_date && t.due_date<todayStr() && t.status!=="done";
  var card=el("div","pm-card"); card.draggable=true;
  card.ondragstart=function(){ dragTaskId=t.id; };
  var title=el("div","pm-card-title",t.title); title.onclick=function(){taskForm(t);};
  card.appendChild(title);
  if(t.description)card.appendChild(el("div","pm-card-desc",t.description));
  var meta=el("div","pm-card-meta");
  if(t.assignee)meta.appendChild(el("span",null,"👤 "+profileName(t.assignee)));
  if(t.due_date)meta.appendChild(el("span",overdue?"pm-overdue":null,"◷ "+fmtDate(t.due_date)));
  card.appendChild(meta);
  var acts=el("div","pm-card-act");
  var idx=STATUSES.findIndex(function(s){return s.id===t.status;});
  if(idx>0){ var prev=btn("←","btn-sm",function(ev){ev.stopPropagation();setStatus(t.id,STATUSES[idx-1].id);}); acts.appendChild(prev); }
  if(idx<STATUSES.length-1){ var next=btn("→","btn-sm",function(ev){ev.stopPropagation();setStatus(t.id,STATUSES[idx+1].id);}); acts.appendChild(next); }
  var del=btn("🗑","btn-sm btn-danger",function(ev){ev.stopPropagation();deleteTask(t);});
  acts.appendChild(del);
  card.appendChild(acts);
  return card;
}
async function setStatus(id,status){
  var r=await supa().from("pm_tasks").update({status:status}).eq("id",id);
  if(r.error){msg("Fehler: "+r.error.message,true);return;}
  await loadTasks();
}
async function deleteTask(t){
  if(!confirm("Aufgabe \""+t.title+"\" löschen?"))return;
  var r=await supa().from("pm_tasks").delete().eq("id",t.id);
  if(r.error){msg("Fehler: "+r.error.message,true);return;}
  await loadTasks(); msg("Aufgabe gelöscht.");
}

/* ---------- Checkliste / Kommentare / DMS-Anhänge (Increment 2) ---------- */
async function loadChecklist(taskId){ var r=await supa().from("pm_checklist_items").select("*").eq("task_id",taskId).order("created_at"); return r.error?[]:(r.data||[]); }
async function loadComments(taskId){ var r=await supa().from("pm_comments").select("*").eq("task_id",taskId).order("created_at"); return r.error?[]:(r.data||[]); }
async function loadTaskDocs(taskId){ var r=await supa().from("pm_task_documents").select("id,document_id,documents(id,name)").eq("task_id",taskId); return r.error?[]:(r.data||[]); }
async function loadAllDocs(){ try{ var r=await supa().from("documents").select("id,name").is("deleted_at",null).order("name"); return r.error?[]:(r.data||[]); }catch(e){ return []; } }

function checklistSection(t,checklist){
  var sec=el("div","pm-sec");
  sec.appendChild(el("h4","pm-sec-h","Checkliste"));
  checklist.forEach(function(ci){
    var row=el("div","pm-cl-row");
    var cb=el("input"); cb.type="checkbox"; cb.checked=!!ci.done;
    cb.onchange=async function(){ await supa().from("pm_checklist_items").update({done:cb.checked}).eq("id",ci.id); reopen(t); };
    row.appendChild(cb);
    row.appendChild(el("span",ci.done?"pm-cl-done":null,ci.text));
    var del=btn("✕","btn-sm",async function(){ await supa().from("pm_checklist_items").delete().eq("id",ci.id); reopen(t); });
    row.appendChild(del);
    sec.appendChild(row);
  });
  var addRow=el("div","pm-row");
  var inp=el("input","pm-input"); inp.placeholder="Neuer Punkt …";
  var add=btn("+","btn-sm",async function(){
    if(!inp.value.trim())return;
    var tid=await ensureTenant(); if(!tid)return;
    await supa().from("pm_checklist_items").insert({tenant_id:tid,task_id:t.id,text:inp.value.trim()});
    reopen(t);
  });
  addRow.appendChild(inp); addRow.appendChild(add);
  sec.appendChild(addRow);
  return sec;
}
function commentsSection(t,comments){
  var sec=el("div","pm-sec");
  sec.appendChild(el("h4","pm-sec-h","Kommentare"));
  comments.forEach(function(c){
    var row=el("div","pm-cm-row");
    row.appendChild(el("div","pm-cm-meta",(profileName(c.author)||"?")+" · "+fmtDate((c.created_at||"").slice(0,10))));
    row.appendChild(el("div",null,c.body));
    sec.appendChild(row);
  });
  var ta=el("textarea","pm-input pm-textarea"); ta.placeholder="Kommentar schreiben …";
  var send=btn("Kommentieren","btn-sm",async function(){
    if(!ta.value.trim())return;
    var tid=await ensureTenant(); if(!tid)return;
    await supa().from("pm_comments").insert({tenant_id:tid,task_id:t.id,author:(MP().user||{}).id||null,body:ta.value.trim()});
    reopen(t);
  });
  sec.appendChild(ta); sec.appendChild(send);
  return sec;
}
function docsSection(t,taskDocs,allDocs){
  var sec=el("div","pm-sec");
  sec.appendChild(el("h4","pm-sec-h","Anhänge (aus Dokumente)"));
  var linkedIds=taskDocs.map(function(td){return td.document_id;});
  taskDocs.forEach(function(td){
    var row=el("div","pm-doc-row");
    row.appendChild(el("span",null,"📄 "+((td.documents&&td.documents.name)||"Dokument")));
    var rm=btn("✕","btn-sm",async function(){ await supa().from("pm_task_documents").delete().eq("id",td.id); reopen(t); });
    row.appendChild(rm);
    sec.appendChild(row);
  });
  var avail=allDocs.filter(function(d){return linkedIds.indexOf(d.id)<0;});
  if(avail.length){
    var addRow=el("div","pm-row");
    var sel=el("select","pm-input");
    avail.forEach(function(d){ sel.appendChild(new Option(d.name,d.id)); });
    var add=btn("Anhängen","btn-sm",async function(){
      if(!sel.value)return;
      var tid=await ensureTenant(); if(!tid)return;
      await supa().from("pm_task_documents").insert({tenant_id:tid,task_id:t.id,document_id:sel.value});
      reopen(t);
    });
    addRow.appendChild(sel); addRow.appendChild(add);
    sec.appendChild(addRow);
  } else if(!allDocs.length){
    sec.appendChild(el("div","lead","Noch keine Dokumente im DMS-Modul vorhanden."));
  }
  return sec;
}
function reopen(t){ closeAnyModal(); taskForm(t); }
function closeAnyModal(){ var ov=document.querySelector(".dms-modal"); if(ov)ov.remove(); }

/* ---------- Aufgaben-Formular (Modal) ---------- */
async function taskForm(t){
  var isNew=!t.id;
  var checklist=[], comments=[], taskDocs=[], allDocs=[];
  if(!isNew){
    var res=await Promise.all([loadChecklist(t.id),loadComments(t.id),loadTaskDocs(t.id),loadAllDocs()]);
    checklist=res[0]; comments=res[1]; taskDocs=res[2]; allDocs=res[3];
  }
  var ov=el("div","dms-modal"), inner=el("div","dms-modal-inner"), bar=el("div","dms-modal-bar");
  function close(){ ov.remove(); document.removeEventListener("keydown",onKey); }
  function onKey(ev){ if(ev.key==="Escape")close(); }
  bar.appendChild(el("b",null,isNew?"Neue Aufgabe":"Aufgabe bearbeiten"));
  bar.appendChild(el("span","dms-modal-spacer"));
  bar.appendChild(btn("×","btn-sm",close));
  inner.appendChild(bar);

  var body=el("div","dms-modal-body pm-form");
  var title=el("input","pm-input"); title.placeholder="Titel *"; title.value=t.title||"";
  var desc=el("textarea","pm-input pm-textarea"); desc.placeholder="Beschreibung"; desc.value=t.description||"";
  var row=el("div","pm-row");
  var assignee=el("select","pm-input");
  assignee.appendChild(new Option("— kein Zuständiger —",""));
  profiles.forEach(function(p){ var o=new Option(p.display_name||p.id,p.id); if(t.assignee===p.id)o.selected=true; assignee.appendChild(o); });
  var due=el("input","pm-input"); due.type="date"; due.value=t.due_date||"";
  row.appendChild(assignee); row.appendChild(due);
  var statusSel=el("select","pm-input");
  STATUSES.forEach(function(s){ var o=new Option(s.label,s.id); if((t.status||"todo")===s.id)o.selected=true; statusSel.appendChild(o); });

  body.appendChild(title); body.appendChild(desc); body.appendChild(row); body.appendChild(statusSel);
  if(!isNew){
    body.appendChild(checklistSection(t,checklist));
    body.appendChild(docsSection(t,taskDocs,allDocs));
    body.appendChild(commentsSection(t,comments));
  }
  inner.appendChild(body);

  var foot=el("div","dms-modal-bar");
  if(!isNew){ foot.appendChild(btn("Löschen","btn-sm btn-danger",function(){ close(); deleteTask(t); })); }
  foot.appendChild(el("span","dms-modal-spacer"));
  foot.appendChild(btn("Abbrechen","btn-sm",close));
  var save=btn("Speichern","btn-sm btn-primary",async function(){
    if(!title.value.trim()){ title.focus(); return; }
    var fields={ title:title.value.trim(), description:desc.value, assignee:assignee.value||null, due_date:due.value||null, status:statusSel.value };
    var r;
    if(isNew){
      var tid=await ensureTenant(); if(!tid){msg("Firma nicht ermittelt.",true);return;}
      r=await supa().from("pm_tasks").insert(Object.assign({tenant_id:tid,project_id:S.projectId},fields));
    } else {
      r=await supa().from("pm_tasks").update(fields).eq("id",t.id);
    }
    if(r.error){msg("Fehler: "+r.error.message,true);return;}
    close(); await loadTasks(); msg(isNew?"Aufgabe angelegt.":"Aufgabe gespeichert.");
  });
  foot.appendChild(save);
  inner.appendChild(foot);

  ov.appendChild(inner); ov.onclick=function(ev){ if(ev.target===ov)close(); };
  document.addEventListener("keydown",onKey); document.body.appendChild(ov);
  setTimeout(function(){title.focus();},30);
}

window.MPPM={ open:open };
})();
