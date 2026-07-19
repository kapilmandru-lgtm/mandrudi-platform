/* ===== Mandrudi Plattform — DMS-Modul (Phase 1) ===== */
(function(){
"use strict";

var S={ folder:"", trash:false, showHidden:false, q:"", group:"" };
var folders=[];          // {id,name,parent_id}
var currentRows=[];      // aktuell angezeigte Dokumente
var selected=new Set();  // ausgewählte Dokument-IDs (Mehrfachauswahl)
var expanded=new Set();  // im Baum aufgeklappte Ordner
var docCounts={}, unfiledCount=0; // Beleg-Anzahl je Ordner / ohne Ordner (ohne Papierkorb)

function el(tag,cls,txt){var e=document.createElement(tag); if(cls)e.className=cls; if(txt!=null)e.textContent=txt; return e;}
function MP(){return window.MP||{};}
function supa(){return MP().supa;}
function msg(t,err){var m=document.getElementById("dms-msg"); if(m){m.textContent=t||""; m.className="dms-msg"+(err?" err":"");}}
function isAuthErr(err){var m=((err&&err.message)||err||"")+""; return /permission denied|jwt|not authenticated|auth session|session.*missing|unauthorized|row-level|\b401\b|\b403\b/i.test(m);}
function handleErr(err,fallback){ if(isAuthErr(err)){ if(MP().requireLogin)MP().requireLogin(); return true; } msg(fallback+((err&&err.message)?(": "+err.message):""),true); return false; }
function uuid(){try{return crypto.randomUUID();}catch(e){return Date.now()+"_"+Math.floor(Math.random()*1e9);}}
function fmtSize(b){ if(b==null)return""; if(b<1024)return b+" B"; if(b<1048576)return (b/1024).toFixed(0)+" KB"; return (b/1048576).toFixed(1)+" MB"; }
function fmtDate(s){try{return new Date(s).toLocaleDateString();}catch(e){return"";}}
function fmtDateObj(dt){try{return dt.toLocaleDateString();}catch(e){return"";}}
// Beleg-Datum aus dem Namen lesen (z.B. "Tankbeleg 30.05.2020 27,50€.jpeg"); sonst Upload-Datum
function parseNameDate(name){ var m=/(\d{2})\.(\d{2})\.(\d{4})/.exec(name||""); if(!m)return null; var dd=+m[1],mo=+m[2],y=+m[3]; if(mo<1||mo>12||dd<1||dd>31)return null; var dt=new Date(y,mo-1,dd); return isNaN(dt.getTime())?null:dt; }
function docDate(d){ return parseNameDate(d.name) || new Date(d.created_at); }
function folderName(id){for(var i=0;i<folders.length;i++)if(folders[i].id===id)return folders[i].name; return "";}
function folderById(id){for(var i=0;i<folders.length;i++)if(folders[i].id===id)return folders[i]; return null;}
function childrenOf(pid){ return folders.filter(function(f){ return (f.parent_id||null)===(pid||null); }); }
function folderPath(id){ var path=[], f=folderById(id), guard=0; while(f&&guard++<30){ path.unshift(f); f=f.parent_id?folderById(f.parent_id):null; } return path; }
// Ordner-Liste fuer Dropdowns: Unterordner eingerueckt (Tiefe sichtbar)
function folderOptions(){
  var out=[];
  (function walk(pid,depth){
    childrenOf(pid).forEach(function(f){
      var pre=""; for(var i=0;i<depth;i++)pre+="  ";
      out.push({id:f.id, label:(depth?pre+"↳ ":"")+f.name});
      walk(f.id,depth+1);
    });
  })(null,0);
  return out;
}

/* ---------- Beleg-Typen: kanonisch DE in der DB, Anzeige in App-Sprache ---------- */
var TYPE_LABELS={
  "Tankbeleg":       {de:"Tankbeleg",       en:"Fuel receipt",       fr:"Reçu carburant",   es:"Recibo combustible", it:"Scontrino carburante",  ro:"Bon combustibil"},
  "Restaurantbeleg": {de:"Restaurantbeleg", en:"Restaurant receipt", fr:"Reçu restaurant",  es:"Recibo restaurante", it:"Scontrino ristorante",  ro:"Bon restaurant"},
  "Hotelbeleg":      {de:"Hotelbeleg",      en:"Hotel receipt",      fr:"Reçu hôtel",  es:"Recibo hotel",       it:"Scontrino hotel",       ro:"Bon hotel"},
  "Rechnung":        {de:"Rechnung",        en:"Invoice",            fr:"Facture",               es:"Factura",            it:"Fattura",               ro:"Factură"},
  "Beleg":           {de:"Beleg",           en:"Receipt",            fr:"Reçu",             es:"Recibo",             it:"Ricevuta",              ro:"Bon"}
};
var TYPE_RE=/^(Tankbeleg|Restaurantbeleg|Hotelbeleg|Rechnung|Beleg)(?=$|[ .])/;
function curLang(){ return MP().lang||"de"; }
function typeLabel(key){ var e=TYPE_LABELS[key]; if(!e)return key; return e[curLang()]||key; }
// Anzeige-Name: deutscher Typ-Praefix (kanonisch in DB) -> Label in aktueller Sprache
function displayName(name){ var m=TYPE_RE.exec(name||""); if(!m)return name||""; return typeLabel(m[1])+String(name).slice(m[1].length); }
// Nutzer-Eingabe (evtl. uebersetzter Typ-Praefix) -> kanonischer DB-Name (DE)
function canonicalName(input){
  var s=String(input||"").trim(); if(!s)return s;
  var bestKey=null, bestLen=0;
  Object.keys(TYPE_LABELS).forEach(function(key){
    var langs=TYPE_LABELS[key];
    Object.keys(langs).forEach(function(lg){
      var lab=langs[lg], nx=s.charAt(lab.length);
      if(lab.length>bestLen && s.slice(0,lab.length).toLowerCase()===lab.toLowerCase() && (nx===""||nx===" "||nx===".")){ bestKey=key; bestLen=lab.length; }
    });
  });
  return bestKey? bestKey+s.slice(bestLen) : s;
}
// Kategorie-Eingabe: uebersetztes Label -> deutscher Schluessel (sonst unveraendert)
function canonicalType(v){
  var s=String(v||"").trim(); if(!s)return s; var out=s;
  Object.keys(TYPE_LABELS).forEach(function(key){
    var langs=TYPE_LABELS[key];
    Object.keys(langs).forEach(function(lg){ if(langs[lg].toLowerCase()===s.toLowerCase())out=key; });
  });
  return out;
}
// Suchbegriff um deutsche Typ-Namen ergaenzen (DB-Namen sind DE): "fuel" findet "Tankbeleg"
function searchTerms(q){
  var terms=[q], ql=q.toLowerCase();
  Object.keys(TYPE_LABELS).forEach(function(key){
    var langs=TYPE_LABELS[key], hit=false;
    Object.keys(langs).forEach(function(lg){ if(langs[lg].toLowerCase().indexOf(ql)>=0)hit=true; });
    if(hit&&terms.indexOf(key)<0)terms.push(key);
  });
  return terms;
}

async function ensureTenant(){
  var m=MP(); if(m.tenantId)return m.tenantId;
  if(!supa()||!m.user)return null;
  try{var r=await supa().from("profiles").select("tenant_id").eq("id",m.user.id).single(); if(r.data){m.tenantId=r.data.tenant_id;return r.data.tenant_id;}}catch(e){}
  // Kein Profil gefunden -> selbst nachlegen (Selbstheilung), dann erneut lesen.
  try{
    await supa().rpc("ensure_my_profile");
    var r2=await supa().from("profiles").select("tenant_id").eq("id",m.user.id).single();
    if(r2.data){m.tenantId=r2.data.tenant_id;return r2.data.tenant_id;}
  }catch(e){}
  return null;
}

/* ---------- Aufbau ---------- */
function open(){
  var root=document.getElementById("view-dms"); if(!root)return;
  root.innerHTML="";
  var tt=MP().t; root.appendChild(el("h2",null,(tt&&tt("nav_dms"))||"Dokumente"));

  if(!supa()||!MP().user){
    root.appendChild(el("p","lead","Bitte melde dich an, um Dokumente zu verwalten. Im Demo-Modus wird nur die Oberflaeche gezeigt."));
    return;
  }

  var wrap=el("div","dms-wrap");
  var tree=el("div","dms-tree"); tree.id="dms-tree";
  var main=el("div","dms-main");
  wrap.appendChild(tree); wrap.appendChild(main);

  var bar=el("div","dms-bar");
  var up=el("button","btn btn-primary","Hochladen"); var fileIn=el("input"); fileIn.type="file"; fileIn.multiple=true; fileIn.style.display="none";
  up.onclick=function(){fileIn.click();}; fileIn.onchange=function(){ var fs=Array.prototype.slice.call(fileIn.files); fileIn.value=""; if(fs.length)doUpload(fs); };
  var nf=el("button","btn","+ Ordner"); nf.title="Neuen Ordner im aktuellen Ordner anlegen"; nf.onclick=newFolder;
  var zip=el("button","btn","Ordner als ZIP"); zip.onclick=downloadZip;
  var search=el("input","dms-search"); search.placeholder="Suchen..."; search.oninput=function(){S.q=search.value.trim(); clearTimeout(search._t); search._t=setTimeout(loadDocs,250);};
  var hidW=el("label","dms-chk"); var hid=el("input"); hid.type="checkbox"; hid.onchange=function(){S.showHidden=hid.checked; loadDocs();}; hidW.appendChild(hid); hidW.appendChild(el("span",null,"Verborgene"));
  var trash=el("button","btn","Papierkorb"); trash.id="dms-trashbtn"; trash.onclick=function(){S.trash=!S.trash; trash.classList.toggle("btn-primary",S.trash); trash.textContent=S.trash?"Zurueck":"Papierkorb"; loadDocs(); renderCrumb();};

  var grp=el("select","dms-sel"); grp.id="dms-group";
  grp.appendChild(new Option("Sortieren: keine",""));
  grp.appendChild(new Option("nach Tag","day"));
  grp.appendChild(new Option("nach Woche","week"));
  grp.appendChild(new Option("nach Monat","month"));
  grp.value=S.group; grp.onchange=function(){S.group=grp.value; renderDocs(currentRows);};

  var ana=el("button","btn","Analyse"); ana.onclick=analyze;

  [up,fileIn,nf,zip,ana,search,grp,hidW,trash].forEach(function(x){bar.appendChild(x);});
  main.appendChild(bar);
  var m=el("div","dms-msg",""); m.id="dms-msg"; m.setAttribute("role","status"); main.appendChild(m);
  selected=new Set();
  var selbar=el("div","dms-selbar"); selbar.id="dms-selbar"; main.appendChild(selbar);
  var crumb=el("div","dms-crumb"); crumb.id="dms-crumb"; main.appendChild(crumb);
  var list=el("div","dms-list"); list.id="dms-list"; main.appendChild(list);
  root.appendChild(wrap);

  loadFolders().then(loadDocs);
}

/* ---------- Ordner ---------- */
async function loadFolders(){
  var r=await supa().from("folders").select("id,name,parent_id").order("name");
  folders=(r&&r.data)||[];
  // Falls der gewaehlte Ordner nicht mehr existiert (geloescht), zurueck zur Hauptliste
  if(S.folder && !folderById(S.folder))S.folder="";
  renderTree();
}
async function newFolder(){
  var here=S.folder?(" (in \""+folderName(S.folder)+"\")"):"";
  var name=prompt("Name des neuen Ordners"+here+":"); if(!name)return;
  var tid=await ensureTenant(); if(!tid){msg("Firma nicht ermittelt.",true);return;}
  var r=await supa().from("folders").insert({tenant_id:tid, name:name, parent_id:S.folder||null});
  if(r.error){msg("Fehler: "+r.error.message,true);return;}
  if(S.folder)expanded.add(S.folder);
  await loadFolders(); msg("Ordner angelegt.");
}
async function renameFolder(f){
  var v=prompt("Neuer Ordnername:",f.name); if(v===null||!v.trim())return;
  var r=await supa().from("folders").update({name:v.trim()}).eq("id",f.id);
  if(r.error){msg("Fehler: "+r.error.message,true);return;}
  await loadFolders(); renderCrumb(); msg("Ordner umbenannt.");
}
async function deleteFolder(f){
  var kids=childrenOf(f.id).length;
  if(!confirm("Ordner \""+f.name+"\" loeschen?"+(kids?" Unterordner werden mitgeloescht.":"")+" Enthaltene Belege landen wieder in der Hauptliste."))return;
  var r=await supa().from("folders").delete().eq("id",f.id);
  if(r.error){msg("Fehler: "+r.error.message,true);return;}
  if(S.folder===f.id)S.folder="";
  await loadFolders(); loadDocs(); msg("Ordner geloescht.");
}

/* ---------- Ordner-Baum ---------- */
async function loadCounts(){
  try{
    var r=await supa().from("documents").select("folder_id").is("deleted_at",null);
    docCounts={}; unfiledCount=0;
    ((r&&r.data)||[]).forEach(function(row){ if(row.folder_id)docCounts[row.folder_id]=(docCounts[row.folder_id]||0)+1; else unfiledCount++; });
  }catch(e){}
}
function selectFolder(id){
  S.folder=id||"";
  if(S.trash){ S.trash=false; var tb=document.getElementById("dms-trashbtn"); if(tb){tb.classList.remove("btn-primary"); tb.textContent="Papierkorb";} }
  folderPath(S.folder).forEach(function(f){ expanded.add(f.id); }); // Pfad aufklappen
  renderTree(); loadDocs();
}
function treeRow(f){
  var kids=childrenOf(f.id);
  var row=el("div","tree-item"+(S.folder===f.id?" active":""));
  var tg=el("span","tree-toggle",kids.length?(expanded.has(f.id)?"▾":"▸"):" ");
  if(kids.length){ tg.title=expanded.has(f.id)?"Zuklappen":"Aufklappen"; tg.onclick=function(ev){ ev.stopPropagation(); if(expanded.has(f.id))expanded.delete(f.id); else expanded.add(f.id); renderTree(); }; }
  row.appendChild(tg);
  row.appendChild(el("span","tree-name",f.name));
  if(S.folder===f.id){
    var acts=el("span","tree-act");
    var rn=el("button","tree-btn","✎"); rn.title="Ordner umbenennen"; rn.onclick=function(ev){ev.stopPropagation(); renameFolder(f);};
    var dl=el("button","tree-btn","×"); dl.title="Ordner loeschen"; dl.onclick=function(ev){ev.stopPropagation(); deleteFolder(f);};
    acts.appendChild(rn); acts.appendChild(dl); row.appendChild(acts);
  }
  var n=docCounts[f.id]||0; if(n)row.appendChild(el("span","tree-count",String(n)));
  row.onclick=function(){ selectFolder(f.id); };
  return {row:row, kids:kids};
}
function renderTree(){
  var tree=document.getElementById("dms-tree"); if(!tree)return; tree.innerHTML="";
  tree.appendChild(el("div","tree-head","Ordner"));
  var rootRow=el("div","tree-item tree-root"+((!S.folder&&!S.trash)?" active":""));
  rootRow.appendChild(el("span","tree-toggle"," "));
  rootRow.appendChild(el("span","tree-name","Hauptliste"));
  if(unfiledCount)rootRow.appendChild(el("span","tree-count",String(unfiledCount)));
  rootRow.title="Belege ohne Ordner";
  rootRow.onclick=function(){ selectFolder(""); };
  tree.appendChild(rootRow);
  (function walk(pid,container){
    childrenOf(pid).forEach(function(f){
      var t=treeRow(f);
      container.appendChild(t.row);
      if(t.kids.length&&expanded.has(f.id)){ var kb=el("div","tree-kids"); container.appendChild(kb); walk(f.id,kb); }
    });
  })(null,tree);
  if(!folders.length)tree.appendChild(el("div","tree-empty","Noch keine Ordner – „+ Ordner“ legt einen an."));
}
function renderCrumb(){
  var c=document.getElementById("dms-crumb"); if(!c)return; c.innerHTML="";
  if(S.trash){ c.appendChild(el("span","crumb-cur","Papierkorb")); return; }
  if(!S.folder){
    c.appendChild(el("span","crumb-cur","Hauptliste"));
    c.appendChild(el("span","crumb-hint", S.q?" · Suche in allen Ordnern":" · Belege ohne Ordner"));
    return;
  }
  var home=el("a","crumb-link","Hauptliste"); home.href="#"; home.onclick=function(e){e.preventDefault(); selectFolder("");};
  c.appendChild(home);
  var path=folderPath(S.folder);
  path.forEach(function(f,i){
    c.appendChild(el("span","crumb-sep"," / "));
    if(i===path.length-1){ c.appendChild(el("span","crumb-cur",f.name)); }
    else{ var a=el("a","crumb-link",f.name); a.href="#"; a.onclick=(function(id){return function(e){e.preventDefault(); selectFolder(id);};})(f.id); c.appendChild(a); }
  });
  if(S.q)c.appendChild(el("span","crumb-hint"," · Suche im Ordner"));
}

/* ---------- Dokumente laden ---------- */
async function loadDocs(){
  selected.clear();
  var list=document.getElementById("dms-list"); if(!list)return; list.textContent="Laedt ...";
  var qy=supa().from("documents").select("*").order("created_at",{ascending:false});
  if(S.trash){ qy=qy.not("deleted_at","is",null); } // Papierkorb ist global (kein Ordner-Filter)
  else {
    qy=qy.is("deleted_at",null); if(!S.showHidden)qy=qy.eq("is_hidden",false);
    if(S.folder)qy=qy.eq("folder_id",S.folder);
    else if(!S.q)qy=qy.is("folder_id",null); // Hauptliste = nur Belege ohne Ordner; Suche ohne Ordner sucht ueberall
  }
  if(S.q){
    var terms=searchTerms(S.q);
    if(terms.length>1 && !/[,()]/.test(S.q))qy=qy.or(terms.map(function(t){return "name.ilike.%"+t+"%";}).join(","));
    else qy=qy.ilike("name","%"+S.q+"%");
  }
  var r=await qy;
  if(r.error){list.textContent=""; handleErr(r.error,"Fehler beim Laden"); return;}
  currentRows=(r.data||[]).slice().sort(function(a,b){ return docDate(b)-docDate(a); }); // nach Beleg-Datum, neueste zuerst
  renderDocs(currentRows);
  renderCrumb();
  loadCounts().then(renderTree); // Zaehler im Baum aktuell halten
}

function renderDocs(rows){
  var list=document.getElementById("dms-list"); if(!list)return; list.innerHTML="";
  if(!rows.length){ list.appendChild(el("p","lead", S.trash?"Papierkorb ist leer.":"Noch keine Dokumente. Klick auf \"Hochladen\".")); return; }
  if(S.group){
    var lastKey=null;
    rows.forEach(function(d){
      var dd=docDate(d); var k=groupKey(dd,S.group);
      if(k!==lastKey){ lastKey=k; list.appendChild(el("div","doc-group",groupLabel(dd,S.group))); }
      list.appendChild(docRow(d));
    });
  } else {
    rows.forEach(function(d){ list.appendChild(docRow(d)); });
  }
  updateSelBar();
}
// Mehrfachauswahl-Leiste (Alle auswählen + Sammel-Verschieben)
function updateSelBar(){
  var sb=document.getElementById("dms-selbar"); if(!sb)return; sb.innerHTML="";
  if(S.trash || !currentRows.length) return;
  var allW=el("label","dms-chk"); var all=el("input"); all.type="checkbox";
  all.checked = selected.size>0 && selected.size===currentRows.length;
  all.onchange=function(){ if(all.checked){currentRows.forEach(function(d){selected.add(d.id);});} else {selected.clear();} renderDocs(currentRows); };
  allW.appendChild(all); allW.appendChild(el("span",null,"Alle auswählen")); sb.appendChild(allW);
  if(selected.size>0){
    sb.appendChild(el("span","dms-selcount",selected.size+" ausgewählt"));
    var fsel=el("select","dms-sel"); fsel.id="dms-bulk-folder";
    fsel.appendChild(new Option("In Ordner verschieben...",""));
    fsel.appendChild(new Option("Hauptliste (kein Ordner)","__root"));
    folderOptions().forEach(function(o){fsel.appendChild(new Option(o.label,o.id));});
    fsel.appendChild(new Option("+ Neuer Ordner...","__new"));
    sb.appendChild(fsel);
    sb.appendChild(btn("Verschieben","btn-sm btn-primary",bulkMove));
    sb.appendChild(btn("Ausgewählte auslesen","btn-sm",bulkRead));
    sb.appendChild(btn("Ausgewählte löschen","btn-sm btn-danger",bulkDelete));
    sb.appendChild(btn("Auswahl aufheben","btn-sm",function(){selected.clear();renderDocs(currentRows);}));
  }
}
async function bulkMove(){
  if(!selected.size)return;
  var sel=document.getElementById("dms-bulk-folder"); var val=sel?sel.value:"";
  if(!val){msg("Bitte zuerst einen Ziel-Ordner waehlen.",true);return;}
  var target;
  if(val==="__new"){
    var name=prompt("Name des neuen Ordners:"); if(!name)return;
    var tid=await ensureTenant(); if(!tid){msg("Firma nicht ermittelt.",true);return;}
    var r=await supa().from("folders").insert({tenant_id:tid,name:name,parent_id:S.folder||null}).select("id").single();
    if(r.error){msg("Fehler: "+r.error.message,true);return;}
    target=r.data.id; if(S.folder)expanded.add(S.folder); await loadFolders();
  } else { target=(val==="__root")?null:val; }
  var ids=[]; selected.forEach(function(id){ids.push(id);});
  var r2=await supa().from("documents").update({folder_id:target}).in("id",ids);
  if(r2.error){msg("Fehler: "+r2.error.message,true);return;}
  msg(ids.length+" Dokument(e) verschoben."); selected.clear(); loadDocs();
}
async function bulkDelete(){
  if(!selected.size)return;
  var ids=[]; selected.forEach(function(id){ids.push(id);});
  if(!confirm(ids.length+" Dokument(e) in den Papierkorb verschieben?"))return;
  var r=await supa().from("documents").update({deleted_at:new Date().toISOString()}).in("id",ids);
  if(r.error){msg("Fehler: "+r.error.message,true);return;}
  msg(ids.length+" Dokument(e) in den Papierkorb verschoben."); selected.clear(); loadDocs();
}
async function bulkRead(){
  if(!selected.size)return;
  var docs=currentRows.filter(function(d){return selected.has(d.id);});
  if(!docs.length)return;
  var read=0, lastErr=null;
  for(var i=0;i<docs.length;i++){
    msg("Lese Beleg "+(i+1)+"/"+docs.length+" … (lokal, beim ersten Foto lädt kurz das OCR-Paket)");
    try{ await processDoc(docs[i]); read++; }catch(e){ lastErr=e; }
  }
  if(read===0 && docs.length>0){
    if(isAuthErr(lastErr)){ MP().requireLogin&&MP().requireLogin(); loadDocs(); return; }
    msg("Auslesen fehlgeschlagen (0/"+docs.length+"): "+String((lastErr&&lastErr.message)||lastErr||"unbekannter Fehler"),true);
    loadDocs(); return;
  }
  msg(read+"/"+docs.length+" ausgelesen & umbenannt"+(read<docs.length?" (Rest nicht erkannt – bitte Namen anklicken)":"")+".");
  selected.clear(); loadDocs();
}
function docRow(d){
  var row=el("div","doc"+(d.is_hidden?" doc-hidden":""));
  if(!S.trash){
    var cb=el("input"); cb.type="checkbox"; cb.className="doc-check"; cb.checked=selected.has(d.id);
    cb.onchange=function(){ if(cb.checked)selected.add(d.id); else selected.delete(d.id); updateSelBar(); };
    row.appendChild(cb);
  }
  var main=el("div","doc-main doc-clickable"); main.title="Klicken: Beleg anzeigen"; main.onclick=function(){openPreview(d);};
  var nm=el("div","doc-name"); var nb=el("b","doc-name-b",displayName(d.name)); nb.onmouseenter=function(){hoverPreview(d,nb);}; nb.onmouseleave=hideHover; nm.appendChild(nb); if(d.is_hidden)nm.appendChild(el("span","doc-badge","verborgen")); main.appendChild(nm);
  var meta=[]; if(d.category)meta.push(typeLabel(d.category)); if(d.amount!=null)meta.push(Number(d.amount).toFixed(2)+" €"); if(d.folder_id&&d.folder_id!==S.folder)meta.push("Ordner: "+folderName(d.folder_id)); if(d.size_bytes!=null)meta.push(fmtSize(d.size_bytes)); var pd=parseNameDate(d.name); meta.push(pd?("Beleg: "+fmtDateObj(pd)):("Upload: "+fmtDate(d.created_at)));
  main.appendChild(el("div","doc-meta",meta.join(" · ")));
  if(d.tags&&d.tags.length)main.appendChild(el("div","doc-tags",d.tags.map(function(t){return "#"+t;}).join(" ")));
  row.appendChild(main);

  var act=el("div","doc-act");
  if(S.trash){
    act.appendChild(btn("Wiederherstellen","btn-sm",function(){restore(d);}));
    act.appendChild(btn("Endgueltig loeschen","btn-sm btn-danger",function(){hardDelete(d);}));
  } else {
    act.appendChild(btn("Download","btn-sm",function(){download(d);}));
    var mv=el("select","btn-sm dms-move"); mv.appendChild(new Option("Ordner verschieben...",""));
    mv.appendChild(new Option("Hauptliste (kein Ordner)","__root"));
    folderOptions().forEach(function(o){mv.appendChild(new Option(o.label,o.id));});
    if(d.folder_id)mv.value=d.folder_id;
    mv.onchange=function(){ if(!mv.value)return; moveFolder(d, mv.value==="__root"?null:mv.value); }; act.appendChild(mv);
    act.appendChild(btn("Kategorie","btn-sm",function(){setCategory(d);}));
    act.appendChild(btn("Betrag","btn-sm",function(){setAmount(d);}));
    act.appendChild(btn("Auslesen","btn-sm",function(){readReceipt(d);}));
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
  var u=MP().user, done=0, errs=[], newDocs=[];
  for(var i=0;i<files.length;i++){
    var f=files[i]; msg("Lade hoch ("+(i+1)+"/"+files.length+"): "+f.name+" ...");
    var safe=f.name.replace(/[^A-Za-z0-9._-]+/g,"_"); var path=tid+"/"+uuid()+"_"+safe;
    var upr=await supa().storage.from("documents").upload(path,f,{upsert:false});
    if(upr.error){errs.push("Storage: "+(upr.error.message||JSON.stringify(upr.error)));continue;}
    var ins=await supa().from("documents").insert({tenant_id:tid, owner:u.id, name:f.name, storage_path:path, size_bytes:f.size, folder_id:S.folder||null}).select().single();
    if(ins.error){errs.push("DB: "+(ins.error.message||JSON.stringify(ins.error)));continue;}
    done++; if(ins.data)newDocs.push(ins.data);
  }
  if(errs.length){ if(!handleErr({message:errs[0]}, done+" ok, "+errs.length+" Fehler -> "+errs[0])){} loadDocs(); return; }
  // Neue Belege automatisch auslesen + umbenennen (lokal; bei Fotos etwas langsamer)
  var read=0, lastErr=null;
  for(var j=0;j<newDocs.length;j++){
    msg("Lese Beleg "+(j+1)+"/"+newDocs.length+" … (lokal, beim ersten Foto lädt kurz das OCR-Paket)");
    try{ await processDoc(newDocs[j]); read++; }catch(e){ lastErr=e; }
  }
  if(read===0 && newDocs.length>0){
    if(isAuthErr(lastErr)){ MP().requireLogin&&MP().requireLogin(); loadDocs(); return; }
    msg(done+" hochgeladen, aber Auslesen fehlgeschlagen: "+String((lastErr&&lastErr.message)||lastErr||"unbekannt"),true);
    loadDocs(); return;
  }
  msg(done+" hochgeladen · "+read+" automatisch benannt"+(read<newDocs.length?" (Rest bitte per „Auslesen“)":"")+". Bitte Vorschläge prüfen.");
  loadDocs();
}
async function download(d){
  msg("Lade herunter ...");
  var r=await supa().storage.from("documents").download(d.storage_path);
  if(r.error){msg("Download-Fehler: "+r.error.message,true);return;}
  triggerDownload(r.data,displayName(d.name)); msg("");
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
  for(var i=0;i<currentRows.length;i++){ var d=currentRows[i]; var r=await supa().storage.from("documents").download(d.storage_path); if(!r.error)zip.file(displayName(d.name),r.data); }
  var blob=await zip.generateAsync({type:"blob"});
  triggerDownload(blob,(S.folder?folderName(S.folder):"Dokumente")+".zip"); msg("ZIP heruntergeladen.");
}
async function moveFolder(d,fid){ var r=await supa().from("documents").update({folder_id:fid}).eq("id",d.id); if(r.error)msg("Fehler: "+r.error.message,true); else loadDocs(); }
async function setCategory(d){ var c=prompt("Kategorie fuer \""+displayName(d.name)+"\":", d.category?typeLabel(d.category):""); if(c===null)return; var r=await supa().from("documents").update({category:canonicalType(c)||null}).eq("id",d.id); if(r.error)msg("Fehler: "+r.error.message,true); else loadDocs(); }
async function setAmount(d){
  var v=prompt("Betrag (€) für \""+displayName(d.name)+"\" – z.B. 149,90 (leer = löschen):", d.amount!=null?String(d.amount).replace(".",","):"");
  if(v===null)return; v=String(v).replace(/\./g,"").replace(",",".").trim();
  var num=(v==="")?null:Number(v);
  if(num!==null && isNaN(num)){msg("Bitte eine gültige Zahl eingeben.",true);return;}
  var r=await supa().from("documents").update({amount:num}).eq("id",d.id);
  if(r.error)msg("Fehler: "+r.error.message,true); else loadDocs();
}
function round2(n){return Math.round(n*100)/100;}
function loadXLSX(){return new Promise(function(res,rej){ if(window.XLSX)return res(); var s=el("script"); s.src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"; s.onload=res; s.onerror=rej; document.head.appendChild(s); });}
async function analyze(){
  var rows=currentRows;
  if(!rows.length){msg("Keine Dokumente zum Analysieren.",true);return;}
  msg("Erstelle Excel-Auswertung ...");
  try{ await loadXLSX(); }catch(e){ msg("Excel-Bibliothek konnte nicht geladen werden.",true); return; }
  var data=rows.map(function(d){ return {
    Name:displayName(d.name), Datum:fmtDateObj(docDate(d)), Kategorie:(d.category?typeLabel(d.category):""),
    Ordner:(d.folder_id?folderName(d.folder_id):""), Betrag:(d.amount!=null?Number(d.amount):""), Hochgeladen:fmtDate(d.created_at)
  };});
  var total=0, n=0, byCat={}, byMonth={};
  rows.forEach(function(d){ if(d.amount!=null){ var a=Number(d.amount); total+=a; n++;
    var c=d.category?typeLabel(d.category):"(ohne Kategorie)"; byCat[c]=(byCat[c]||0)+a;
    var mo=groupLabel(docDate(d),"month"); byMonth[mo]=(byMonth[mo]||0)+a; }});
  var sum=[["Beleg-Auswertung",""],["Dokumente gesamt",rows.length],["davon mit Betrag",n],["Summe Betrag",round2(total)],["",""],["Summe je Kategorie",""]];
  Object.keys(byCat).forEach(function(k){sum.push([k,round2(byCat[k])]);});
  sum.push(["",""],["Summe je Monat",""]);
  Object.keys(byMonth).forEach(function(k){sum.push([k,round2(byMonth[k])]);});
  var wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Dokumente");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sum), "Zusammenfassung");
  XLSX.writeFile(wb, "Beleg-Analyse.xlsx");
  msg(rows.length+" Belege analysiert · Summe "+round2(total).toFixed(2)+" € · Excel heruntergeladen.");
}
async function toggleHidden(d){ var r=await supa().from("documents").update({is_hidden:!d.is_hidden}).eq("id",d.id); if(r.error)msg("Fehler: "+r.error.message,true); else loadDocs(); }
async function softDelete(d){ if(!confirm("\""+displayName(d.name)+"\" in den Papierkorb verschieben?"))return; var r=await supa().from("documents").update({deleted_at:new Date().toISOString()}).eq("id",d.id); if(r.error)msg("Fehler: "+r.error.message,true); else {msg("In den Papierkorb verschoben."); loadDocs();} }
async function restore(d){ var r=await supa().from("documents").update({deleted_at:null}).eq("id",d.id); if(r.error)msg("Fehler: "+r.error.message,true); else loadDocs(); }
async function hardDelete(d){
  if(!confirm("\""+displayName(d.name)+"\" ENDGUELTIG loeschen? Das kann nicht rueckgaengig gemacht werden."))return;
  await supa().storage.from("documents").remove([d.storage_path]);
  var r=await supa().from("documents").delete().eq("id",d.id);
  if(r.error)msg("Fehler: "+r.error.message,true); else {msg("Endgueltig geloescht."); loadDocs();}
}

// ===== Lokaler Beleg-Helfer: liest Typ + Betrag aus (PDF-Text zuerst, tesseract.js-OCR-Fallback) =====
function loadScript(src,g){return new Promise(function(res,rej){ if(g&&window[g])return res(); var s=el("script"); s.src=src; s.onload=res; s.onerror=rej; document.head.appendChild(s); });}
function blobToImage(blob){return new Promise(function(res,rej){var u=URL.createObjectURL(blob);var im=new Image();im.onload=function(){URL.revokeObjectURL(u);res(im);};im.onerror=rej;im.src=u;});}
async function ocrCanvas(cv){
  await loadScript("https://cdn.jsdelivr.net/npm/tesseract.js@5.0.4/dist/tesseract.min.js","Tesseract");
  var r=await window.Tesseract.recognize(cv,"deu+eng");
  return (r&&r.data&&r.data.text)||"";
}
async function extractText(blob,name){
  var isPdf=/\.pdf$/i.test(name||"")||blob.type==="application/pdf";
  if(isPdf){
    await loadScript("https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js","pdfjsLib");
    var L=window.pdfjsLib; L.GlobalWorkerOptions.workerSrc="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
    var buf=await blob.arrayBuffer();
    var pdf=await L.getDocument({data:buf}).promise;
    var text="";
    for(var i=1;i<=pdf.numPages;i++){ var pg=await pdf.getPage(i); var tc=await pg.getTextContent(); text+=tc.items.map(function(it){return it.str;}).join(" ")+"\n"; }
    if(text.replace(/\s/g,"").length>20) return text;         // digitales PDF -> Text vorhanden
    var p1=await pdf.getPage(1); var vp=p1.getViewport({scale:2});
    var cv=document.createElement("canvas"); cv.width=vp.width; cv.height=vp.height;
    await p1.render({canvasContext:cv.getContext("2d"),viewport:vp}).promise;
    return await ocrCanvas(cv);
  }
  var img=await blobToImage(blob);
  var c2=document.createElement("canvas"); c2.width=img.naturalWidth||img.width; c2.height=img.naturalHeight||img.height;
  c2.getContext("2d").drawImage(img,0,0); return await ocrCanvas(c2);
}
function classifyDoc(text){
  var t=(text||"").toLowerCase().replace(/\s+/g," ");
  if(/tankstelle|zapfs|kraftstoff|diesel|super\s?e?10|super\s?95|benzin|\bliter\b|adblue|\baral\b|\bshell\b|\besso\b|\bjet\b|\bomv\b|\bavia\b|\bagip\b|\bhem\b|\bbft\b|total\s?energ|totalenerg/.test(t))return "Tankbeleg";
  if(/restaurant|gaststätt|gaststaett|gasthaus|gasthof|wirtshaus|brauhaus|men[uü]|trinkgeld|speise|bewirtung|caf[eé]|imbiss|pizz|döner|doener|kebab|sushi|trattoria|mcdonald|burger\s?king|getränk|tisch\s?nr|kellner/.test(t))return "Restaurantbeleg";
  if(/hotel|übernacht|uebernacht|zimmer\s?nr|zimmernr|pension|boarding|logis/.test(t))return "Hotelbeleg";
  if(/rechnung|invoice|ust-?id|umsatzsteuer|mehrwertsteuer|\bmwst\b|rechnungsnummer|rechnungs-?nr|leistungsdatum|steuernummer|zahlungsziel/.test(t))return "Rechnung";
  return "Beleg";
}
function parseAmt(s){ s=String(s).replace(/\s/g,""); s=s.replace(/\.(?=\d{3}(\D|$))/g,""); s=s.replace(",","."); return Number(s); }
function extractAmount(text){
  var t=text||"", m, out=[];
  var re=/(?:summe|gesamt|total|betrag|zu\s?zahlen|zahlbetrag|rechnungsbetrag|zu\s?zahlender|brutto|endbetrag|endsumme)[^0-9\-]{0,18}(\d{1,3}(?:[.\s]\d{3})*[.,]\d{2})/gi;
  while((m=re.exec(t))){ var v=parseAmt(m[1]); if(!isNaN(v))out.push(v); }
  if(out.length) return Math.max.apply(null,out);
  var re2=/(\d{1,3}(?:[.\s]\d{3})*[.,]\d{2})/g;
  while((m=re2.exec(t))){ var v2=parseAmt(m[1]); if(!isNaN(v2))out.push(v2); }
  return out.length?Math.max.apply(null,out):null;
}
function pad2(n){ return ("0"+n).slice(-2); }
function validDate(d,mo,y){
  var curY=(new Date()).getFullYear();
  if(mo<1||mo>12||d<1||d>31) return false;
  if(y<2010||y>curY) return false;                 // kein Zukunftsdatum, kein Unsinn
  var dim=[31,(y%4===0&&(y%100!==0||y%400===0))?29:28,31,30,31,30,31,31,30,31,30,31];
  return d<=dim[mo-1];
}
function extractDate(text){
  var t=text||"", m;
  var re=/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/g;   // TT.MM.JJ(JJ)
  while((m=re.exec(t))){
    var d=parseInt(m[1],10), mo=parseInt(m[2],10), y=parseInt(m[3],10); if(m[3].length===2)y+=2000;
    if(validDate(d,mo,y)) return pad2(d)+"."+pad2(mo)+"."+y;   // erstes GÜLTIGES Datum
  }
  var re2=/(\d{4})-(\d{1,2})-(\d{1,2})/g;              // JJJJ-MM-TT
  while((m=re2.exec(t))){
    var y2=parseInt(m[1],10), mo2=parseInt(m[2],10), d2=parseInt(m[3],10);
    if(validDate(d2,mo2,y2)) return pad2(d2)+"."+pad2(mo2)+"."+y2;
  }
  return null;
}
function fileExt(name){ var m=(name||"").match(/\.[A-Za-z0-9]+$/); return m?m[0]:""; }
function fmtAmt(a){ return a.toFixed(2).replace(".",","); }
// Name = Typ + (gültiges Datum) + (Betrag) -> eindeutig & informativ, z.B. "Tankbeleg 30.05.2020 27,50€.jpeg"
function makeName(type,date,amount,origName){
  var s=(type||"Beleg");
  if(date) s+=" "+date;
  if(amount!=null) s+=" "+fmtAmt(amount)+"€";
  return s+fileExt(origName);
}
// Kern: liest 1 Beleg, setzt Kategorie + Betrag + benennt um. Wirft bei Fehler.
async function processDoc(d){
  var r=await supa().storage.from("documents").download(d.storage_path);
  if(r.error) throw new Error("[Download] "+(r.error.message||JSON.stringify(r.error)));
  var text=await extractText(r.data,d.name);
  var type=classifyDoc(text), amt=extractAmount(text), date=extractDate(text);
  var upd={ category:type, name:makeName(type,date,amt,d.name) };
  if(amt!=null) upd.amount=amt;
  var u=await supa().from("documents").update(upd).eq("id",d.id);
  if(u.error) throw new Error("[Speichern] "+(u.error.message||JSON.stringify(u.error)));
  return { type:type, amount:amt, name:upd.name };
}
async function readReceipt(d){
  msg("Lese Beleg … (beim ersten Foto lädt kurz das OCR-Paket)");
  try{ var res=await processDoc(d); msg("Erkannt & umbenannt: "+displayName(res.name)+(res.amount!=null?(" · "+res.amount.toFixed(2)+" €"):"")+" — bitte prüfen."); loadDocs(); }
  catch(e){
    var em=String(e&&e.message||e);
    // Session prüfen, um Rechte- von Anmelde-Problem zu unterscheiden
    var hasSession=false; try{ var s=await supa().auth.getSession(); hasSession=!!(s.data&&s.data.session); }catch(_){}
    if(!hasSession){ if(MP().requireLogin)MP().requireLogin("Sitzung abgelaufen – bitte neu anmelden, dann erneut auslesen."); return; }
    msg("Auslesen fehlgeschlagen (Sitzung aktiv): "+em,true);
  }
}
async function renameDoc(d){
  var v=prompt("Neuer Name:", displayName(d.name)); if(v===null||!v.trim())return;
  // Uebersetzter Typ-Praefix wird kanonisch (DE) gespeichert, damit alle Sprachen ihn uebersetzen koennen
  var r=await supa().from("documents").update({name:canonicalName(v)}).eq("id",d.id);
  if(r.error)msg("Fehler: "+r.error.message,true); else loadDocs();
}

// ===== Beleg-Vorschau (privater Speicher -> signierte, zeitlich begrenzte URL) =====
var urlCache={};
function isImgName(n){ return /\.(jpe?g|png|gif|webp|bmp|heic|heif|avif)$/i.test(n||""); }
function isPdfName(n){ return /\.pdf$/i.test(n||""); }
async function previewUrl(d){
  if(urlCache[d.id]) return urlCache[d.id];
  // bewährter Download-Weg (kein signierter Link nötig) -> lokale Objekt-URL
  var r=await supa().storage.from("documents").download(d.storage_path);
  if(r.error||!r.data) throw new Error((r.error&&r.error.message)||"Datei-Download fehlgeschlagen");
  var blob=r.data;
  if(isPdfName(d.name) && blob.type!=="application/pdf"){ blob=blob.slice(0,blob.size,"application/pdf"); }
  var u=URL.createObjectURL(blob);
  urlCache[d.id]=u; return u;
}
// Klick -> großes Popup (Lightbox)
async function openPreview(d){
  var ov=el("div","dms-modal"), inner=el("div","dms-modal-inner"), bar=el("div","dms-modal-bar");
  function close(){ ov.remove(); document.removeEventListener("keydown",onKey); }
  function onKey(e){ if(e.key==="Escape")close(); }
  bar.appendChild(el("b",null,displayName(d.name)));
  bar.appendChild(el("span","dms-modal-spacer"));
  bar.appendChild(btn("Umbenennen","btn-sm",function(){ close(); renameDoc(d); }));
  bar.appendChild(btn("Download","btn-sm",function(){ download(d); }));
  bar.appendChild(btn("Schließen","btn-sm",close));
  inner.appendChild(bar);
  var body=el("div","dms-modal-body"); body.textContent="Lädt …"; inner.appendChild(body);
  ov.appendChild(inner); ov.onclick=function(e){ if(e.target===ov)close(); };
  document.addEventListener("keydown",onKey); document.body.appendChild(ov);
  try{
    var url=await previewUrl(d); body.textContent="";
    if(isImgName(d.name)){ var im=el("img","dms-modal-img"); im.onerror=function(){ body.textContent="Bild konnte nicht angezeigt werden."; }; im.src=url; body.appendChild(im); }
    else if(isPdfName(d.name)){ var fr=el("iframe","dms-modal-frame"); fr.src=url; body.appendChild(fr); }
    else { body.appendChild(el("p",null,"Keine Bildvorschau für diesen Dateityp – bitte herunterladen.")); }
  }catch(e){ body.textContent="Vorschau fehlgeschlagen: "+String(e&&e.message||e); }
}
// Maus über Namen -> kleines Thumbnail (nur Bilder)
var hoverEl=null, hoverTimer=null, hoverId=null;
function ensureHover(){ if(!hoverEl){ hoverEl=el("div","dms-hover"); hoverEl.style.display="none"; document.body.appendChild(hoverEl); } return hoverEl; }
function hoverPreview(d,anchor){
  if(!isImgName(d.name))return;
  clearTimeout(hoverTimer);
  hoverTimer=setTimeout(function(){
    var h=ensureHover(); hoverId=d.id; h.innerHTML=""; h.style.display="block";
    h.appendChild(el("div","dms-hover-load","Lädt …"));
    var r=anchor.getBoundingClientRect();
    h.style.left=Math.max(8,Math.min(r.left,window.innerWidth-244))+"px";
    h.style.top=Math.min(r.bottom+8,window.innerHeight-244)+"px";
    previewUrl(d).then(function(u){ if(h.style.display==="none"||hoverId!==d.id)return; h.innerHTML=""; var im=el("img"); im.src=u; h.appendChild(im); })
      .catch(function(){ if(hoverId===d.id)h.style.display="none"; });
  },220);
}
function hideHover(){ clearTimeout(hoverTimer); hoverId=null; if(hoverEl)hoverEl.style.display="none"; }

window.MPDMS={ open:open };
})();
