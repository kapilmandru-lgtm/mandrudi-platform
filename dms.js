/* ===== Mandrudi Plattform — DMS-Modul (Phase 1) ===== */
(function(){
"use strict";

var S={ folder:"", trash:false, showHidden:false, q:"", group:"" };
var folders=[];          // {id,name}
var currentRows=[];      // aktuell angezeigte Dokumente

function el(tag,cls,txt){var e=document.createElement(tag); if(cls)e.className=cls; if(txt!=null)e.textContent=txt; return e;}
function MP(){return window.MP||{};}
function supa(){return MP().supa;}
function msg(t,err){var m=document.getElementById("dms-msg"); if(m){m.textContent=t||""; m.className="dms-msg"+(err?" err":"");}}
function uuid(){try{return crypto.randomUUID();}catch(e){return Date.now()+"_"+Math.floor(Math.random()*1e9);}}
function fmtSize(b){ if(b==null)return""; if(b<1024)return b+" B"; if(b<1048576)return (b/1024).toFixed(0)+" KB"; return (b/1048576).toFixed(1)+" MB"; }
function fmtDate(s){try{return new Date(s).toLocaleDateString();}catch(e){return"";}}
function folderName(id){for(var i=0;i<folders.length;i++)if(folders[i].id===id)return folders[i].name; return "";}

async function ensureTenant(){
  var m=MP(); if(m.tenantId)return m.tenantId;
  if(!supa()||!m.user)return null;
  try{var r=await supa().from("profiles").select("tenant_id").eq("id",m.user.id).single(); if(r.data){m.tenantId=r.data.tenant_id;return r.data.tenant_id;}}catch(e){}
  return null;
}

/* ---------- Aufbau ---------- */
function open(){
  var root=document.getElementById("view-dms"); if(!root)return;
  root.innerHTML="";
  root.appendChild(el("h2",null,"Dokumente"));

  if(!supa()||!MP().user){
    root.appendChild(el("p","lead","Bitte melde dich an, um Dokumente zu verwalten. Im Demo-Modus wird nur die Oberflaeche gezeigt."));
    return;
  }

  var bar=el("div","dms-bar");
  var up=el("button","btn btn-primary","Hochladen"); var fileIn=el("input"); fileIn.type="file"; fileIn.multiple=true; fileIn.style.display="none";
  up.onclick=function(){fileIn.click();}; fileIn.onchange=function(){ if(fileIn.files.length)doUpload(fileIn.files); fileIn.value=""; };
  var nf=el("button","btn","+ Ordner"); nf.onclick=newFolder;
  var fsel=el("select","dms-sel"); fsel.id="dms-folder"; fsel.onchange=function(){S.folder=fsel.value; loadDocs();};
  var zip=el("button","btn","Ordner als ZIP"); zip.onclick=downloadZip;
  var search=el("input","dms-search"); search.placeholder="Suchen..."; search.oninput=function(){S.q=search.value.trim(); clearTimeout(search._t); search._t=setTimeout(loadDocs,250);};
  var hidW=el("label","dms-chk"); var hid=el("input"); hid.type="checkbox"; hid.onchange=function(){S.showHidden=hid.checked; loadDocs();}; hidW.appendChild(hid); hidW.appendChild(el("span",null,"Verborgene"));
  var trash=el("button","btn","Papierkorb"); trash.id="dms-trashbtn"; trash.onclick=function(){S.trash=!S.trash; trash.classList.toggle("btn-primary",S.trash); trash.textContent=S.trash?"Zurueck":"Papierkorb"; loadDocs();};

  var grp=el("select","dms-sel"); grp.id="dms-group";
  grp.appendChild(new Option("Sortieren: keine",""));
  grp.appendChild(new Option("nach Tag","day"));
  grp.appendChild(new Option("nach Woche","week"));
  grp.appendChild(new Option("nach Monat","month"));
  grp.value=S.group; grp.onchange=function(){S.group=grp.value; renderDocs(currentRows);};

  [up,fileIn,nf,fsel,zip,search,grp,hidW,trash].forEach(function(x){bar.appendChild(x);});
  root.appendChild(bar);
  var m=el("div","dms-msg",""); m.id="dms-msg"; m.setAttribute("role","status"); root.appendChild(m);
  var list=el("div","dms-list"); list.id="dms-list"; root.appendChild(list);

  loadFolders().then(loadDocs);
}

/* ---------- Ordner ---------- */
async function loadFolders(){
  var r=await supa().from("folders").select("id,name").order("name");
  folders=(r&&r.data)||[];
  var sel=document.getElementById("dms-folder"); if(sel){ sel.innerHTML=""; sel.appendChild(new Option("Alle Ordner","")); folders.forEach(function(f){sel.appendChild(new Option(f.name,f.id));}); sel.value=S.folder; }
}
async function newFolder(){
  var name=prompt("Name des neuen Ordners:"); if(!name)return;
  var tid=await ensureTenant(); if(!tid){msg("Firma nicht ermittelt.",true);return;}
  var r=await supa().from("folders").insert({tenant_id:tid, name:name});
  if(r.error){msg("Fehler: "+r.error.message,true);return;}
  await loadFolders(); msg("Ordner angelegt.");
}

/* ---------- Dokumente laden ---------- */
async function loadDocs(){
  var list=document.getElementById("dms-list"); if(!list)return; list.textContent="Laedt ...";
  var qy=supa().from("documents").select("*").order("created_at",{ascending:false});
  if(S.trash){ qy=qy.not("deleted_at","is",null); }
  else { qy=qy.is("deleted_at",null); if(!S.showHidden)qy=qy.eq("is_hidden",false); }
  if(S.folder)qy=qy.eq("folder_id",S.folder);
  if(S.q)qy=qy.ilike("name","%"+S.q+"%");
  var r=await qy;
  if(r.error){list.textContent=""; msg("Fehler beim Laden: "+r.error.message,true); return;}
  currentRows=r.data||[]; renderDocs(currentRows);
}

function renderDocs(rows){
  var list=document.getElementById("dms-list"); if(!list)return; list.innerHTML="";
  if(!rows.length){ list.appendChild(el("p","lead", S.trash?"Papierkorb ist leer.":"Noch keine Dokumente. Klick auf \"Hochladen\".")); return; }
  if(S.group){
    var lastKey=null;
    rows.forEach(function(d){
      var k=groupKey(d.created_at,S.group);
      if(k!==lastKey){ lastKey=k; list.appendChild(el("div","doc-group",groupLabel(d.created_at,S.group))); }
      list.appendChild(docRow(d));
    });
  } else {
    rows.forEach(function(d){ list.appendChild(docRow(d)); });
  }
}
function docRow(d){
  var row=el("div","doc"+(d.is_hidden?" doc-hidden":""));
  var main=el("div","doc-main");
  var nm=el("div","doc-name"); nm.appendChild(el("b",null,d.name)); if(d.is_hidden)nm.appendChild(el("span","doc-badge","verborgen")); main.appendChild(nm);
  var meta=[]; if(d.category)meta.push(d.category); if(d.folder_id)meta.push("Ordner: "+folderName(d.folder_id)); if(d.size_bytes!=null)meta.push(fmtSize(d.size_bytes)); meta.push(fmtDate(d.created_at));
  main.appendChild(el("div","doc-meta",meta.join(" · ")));
  if(d.tags&&d.tags.length)main.appendChild(el("div","doc-tags",d.tags.map(function(t){return "#"+t;}).join(" ")));
  row.appendChild(main);

  var act=el("div","doc-act");
  if(S.trash){
    act.appendChild(btn("Wiederherstellen","btn-sm",function(){restore(d);}));
    act.appendChild(btn("Endgueltig loeschen","btn-sm btn-danger",function(){hardDelete(d);}));
  } else {
    act.appendChild(btn("Download","btn-sm",function(){download(d);}));
    var mv=el("select","btn-sm dms-move"); mv.appendChild(new Option("Ordner verschieben...","")); folders.forEach(function(f){mv.appendChild(new Option(f.name,f.id));}); if(d.folder_id)mv.value=d.folder_id;
    mv.onchange=function(){moveFolder(d,mv.value||null);}; act.appendChild(mv);
    act.appendChild(btn("Kategorie","btn-sm",function(){setCategory(d);}));
    act.appendChild(btn(d.is_hidden?"Einblenden":"Verbergen","btn-sm",function(){toggleHidden(d);}));
    act.appendChild(btn("Loeschen","btn-sm btn-danger",function(){softDelete(d);}));
  }
  row.appendChild(act);
  return row;
}
// ----- Gruppierung nach Tag / Woche / Monat -----
function p2(n){return (n<10?"0":"")+n;}
function cap(s){return s?s.charAt(0).toUpperCase()+s.slice(1):s;}
function isoWeek(d){ var t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())); var day=t.getUTCDay()||7; t.setUTCDate(t.getUTCDate()+4-day); var ys=new Date(Date.UTC(t.getUTCFullYear(),0,1)); return Math.ceil((((t-ys)/86400000)+1)/7); }
function groupKey(s,mode){ var d=new Date(s);
  if(mode==="day")return d.getFullYear()+"-"+p2(d.getMonth()+1)+"-"+p2(d.getDate());
  if(mode==="month")return d.getFullYear()+"-"+p2(d.getMonth()+1);
  if(mode==="week")return d.getFullYear()+"-KW"+p2(isoWeek(d));
  return ""; }
function groupLabel(s,mode){ var d=new Date(s);
  if(mode==="day")return cap(d.toLocaleDateString(undefined,{weekday:"long",day:"numeric",month:"long",year:"numeric"}));
  if(mode==="month")return cap(d.toLocaleDateString(undefined,{month:"long",year:"numeric"}));
  if(mode==="week")return "KW "+isoWeek(d)+" · "+d.getFullYear();
  return ""; }
function btn(txt,cls,fn){var b=el("button","btn "+cls,txt); b.onclick=fn; return b;}

/* ---------- Aktionen ---------- */
async function doUpload(files){
  var tid=await ensureTenant(); if(!tid){msg("Firma nicht ermittelt.",true);return;}
  var u=MP().user, done=0, errs=[];
  for(var i=0;i<files.length;i++){
    var f=files[i]; msg("Lade hoch ("+(i+1)+"/"+files.length+"): "+f.name+" ...");
    var safe=f.name.replace(/[^A-Za-z0-9._-]+/g,"_"); var path=tid+"/"+uuid()+"_"+safe;
    var upr=await supa().storage.from("documents").upload(path,f,{upsert:false});
    if(upr.error){errs.push("Storage: "+(upr.error.message||JSON.stringify(upr.error)));continue;}
    var ins=await supa().from("documents").insert({tenant_id:tid, owner:u.id, name:f.name, storage_path:path, size_bytes:f.size, folder_id:S.folder||null});
    if(ins.error){errs.push("DB: "+(ins.error.message||JSON.stringify(ins.error)));continue;}
    done++;
  }
  if(errs.length){ msg(done+" ok, "+errs.length+" Fehler -> "+errs[0], true); }
  else { msg(done+" Dokument(e) hochgeladen."); }
  loadDocs();
}
async function download(d){
  msg("Lade herunter ...");
  var r=await supa().storage.from("documents").download(d.storage_path);
  if(r.error){msg("Download-Fehler: "+r.error.message,true);return;}
  triggerDownload(r.data,d.name); msg("");
}
function triggerDownload(blob,name){
  var url=URL.createObjectURL(blob); var a=el("a"); a.href=url; a.download=name||"datei"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){URL.revokeObjectURL(url);},3000);
}
function loadJSZip(){return new Promise(function(res,rej){ if(window.JSZip)return res(); var s=el("script"); s.src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"; s.onload=res; s.onerror=rej; document.head.appendChild(s); });}
async function downloadZip(){
  if(!currentRows.length){msg("Keine Dokumente zum Herunterladen.",true);return;}
  msg("Erstelle ZIP aus "+currentRows.length+" Dokument(en) ...");
  try{ await loadJSZip(); }catch(e){ msg("ZIP-Bibliothek konnte nicht geladen werden.",true); return; }
  var zip=new window.JSZip();
  for(var i=0;i<currentRows.length;i++){ var d=currentRows[i]; var r=await supa().storage.from("documents").download(d.storage_path); if(!r.error)zip.file(d.name,r.data); }
  var blob=await zip.generateAsync({type:"blob"});
  triggerDownload(blob,(S.folder?folderName(S.folder):"Dokumente")+".zip"); msg("ZIP heruntergeladen.");
}
async function moveFolder(d,fid){ var r=await supa().from("documents").update({folder_id:fid}).eq("id",d.id); if(r.error)msg("Fehler: "+r.error.message,true); else loadDocs(); }
async function setCategory(d){ var c=prompt("Kategorie fuer \""+d.name+"\":", d.category||""); if(c===null)return; var r=await supa().from("documents").update({category:c||null}).eq("id",d.id); if(r.error)msg("Fehler: "+r.error.message,true); else loadDocs(); }
async function toggleHidden(d){ var r=await supa().from("documents").update({is_hidden:!d.is_hidden}).eq("id",d.id); if(r.error)msg("Fehler: "+r.error.message,true); else loadDocs(); }
async function softDelete(d){ if(!confirm("\""+d.name+"\" in den Papierkorb verschieben?"))return; var r=await supa().from("documents").update({deleted_at:new Date().toISOString()}).eq("id",d.id); if(r.error)msg("Fehler: "+r.error.message,true); else {msg("In den Papierkorb verschoben."); loadDocs();} }
async function restore(d){ var r=await supa().from("documents").update({deleted_at:null}).eq("id",d.id); if(r.error)msg("Fehler: "+r.error.message,true); else loadDocs(); }
async function hardDelete(d){
  if(!confirm("\""+d.name+"\" ENDGUELTIG loeschen? Das kann nicht rueckgaengig gemacht werden."))return;
  await supa().storage.from("documents").remove([d.storage_path]);
  var r=await supa().from("documents").delete().eq("id",d.id);
  if(r.error)msg("Fehler: "+r.error.message,true); else {msg("Endgueltig geloescht."); loadDocs();}
}

window.MPDMS={ open:open };
})();
