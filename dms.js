/* ===== Mandrudi Plattform — DMS-Modul (Phase 1) ===== */
(function(){
"use strict";

var S={ folder:"", trash:false, showHidden:false, q:"", group:"" };
var folders=[];          // {id,name}
var currentRows=[];      // aktuell angezeigte Dokumente
var selected=new Set();  // ausgewählte Dokument-IDs (Mehrfachauswahl)

function el(tag,cls,txt){var e=document.createElement(tag); if(cls)e.className=cls; if(txt!=null)e.textContent=txt; return e;}
function MP(){return window.MP||{};}
function supa(){return MP().supa;}
function msg(t,err){var m=document.getElementById("dms-msg"); if(m){m.textContent=t||""; m.className="dms-msg"+(err?" err":"");}}
function isAuthErr(err){var m=((err&&err.message)||err||"")+""; return /permission denied|jwt|not authenticated|auth session|session.*missing|unauthorized|row-level|\b401\b|\b403\b/i.test(m);}
function handleErr(err,fallback){ if(isAuthErr(err)){ if(MP().requireLogin)MP().requireLogin(); return true; } msg(fallback+((err&&err.message)?(": "+err.message):""),true); return false; }
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
  up.onclick=function(){fileIn.click();}; fileIn.onchange=function(){ var fs=Array.prototype.slice.call(fileIn.files); fileIn.value=""; if(fs.length)doUpload(fs); };
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

  var ana=el("button","btn","Analyse"); ana.onclick=analyze;

  [up,fileIn,nf,fsel,zip,ana,search,grp,hidW,trash].forEach(function(x){bar.appendChild(x);});
  root.appendChild(bar);
  var m=el("div","dms-msg",""); m.id="dms-msg"; m.setAttribute("role","status"); root.appendChild(m);
  selected=new Set();
  var selbar=el("div","dms-selbar"); selbar.id="dms-selbar"; root.appendChild(selbar);
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
  selected.clear();
  var list=document.getElementById("dms-list"); if(!list)return; list.textContent="Laedt ...";
  var qy=supa().from("documents").select("*").order("created_at",{ascending:false});
  if(S.trash){ qy=qy.not("deleted_at","is",null); }
  else { qy=qy.is("deleted_at",null); if(!S.showHidden)qy=qy.eq("is_hidden",false); }
  if(S.folder)qy=qy.eq("folder_id",S.folder);
  if(S.q)qy=qy.ilike("name","%"+S.q+"%");
  var r=await qy;
  if(r.error){list.textContent=""; handleErr(r.error,"Fehler beim Laden"); return;}
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
    folders.forEach(function(f){fsel.appendChild(new Option(f.name,f.id));});
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
  var target;
  if(val==="__new"){
    var name=prompt("Name des neuen Ordners:"); if(!name)return;
    var tid=await ensureTenant(); if(!tid){msg("Firma nicht ermittelt.",true);return;}
    var r=await supa().from("folders").insert({tenant_id:tid,name:name}).select("id").single();
    if(r.error){msg("Fehler: "+r.error.message,true);return;}
    target=r.data.id; await loadFolders();
  } else { target=val||null; }
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
  var main=el("div","doc-main");
  var nm=el("div","doc-name"); var nb=el("b","doc-name-b",d.name); nb.title="Klicken zum Umbenennen"; nb.onclick=function(){renameDoc(d);}; nm.appendChild(nb); if(d.is_hidden)nm.appendChild(el("span","doc-badge","verborgen")); main.appendChild(nm);
  var meta=[]; if(d.category)meta.push(d.category); if(d.amount!=null)meta.push(Number(d.amount).toFixed(2)+" €"); if(d.folder_id)meta.push("Ordner: "+folderName(d.folder_id)); if(d.size_bytes!=null)meta.push(fmtSize(d.size_bytes)); meta.push(fmtDate(d.created_at));
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
async function setAmount(d){
  var v=prompt("Betrag (€) für \""+d.name+"\" – z.B. 149,90 (leer = löschen):", d.amount!=null?String(d.amount).replace(".",","):"");
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
    Name:d.name, Datum:fmtDate(d.created_at), Kategorie:d.category||"",
    Ordner:(d.folder_id?folderName(d.folder_id):""), Betrag:(d.amount!=null?Number(d.amount):"")
  };});
  var total=0, n=0, byCat={}, byMonth={};
  rows.forEach(function(d){ if(d.amount!=null){ var a=Number(d.amount); total+=a; n++;
    var c=d.category||"(ohne Kategorie)"; byCat[c]=(byCat[c]||0)+a;
    var mo=groupLabel(d.created_at,"month"); byMonth[mo]=(byMonth[mo]||0)+a; }});
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
async function softDelete(d){ if(!confirm("\""+d.name+"\" in den Papierkorb verschieben?"))return; var r=await supa().from("documents").update({deleted_at:new Date().toISOString()}).eq("id",d.id); if(r.error)msg("Fehler: "+r.error.message,true); else {msg("In den Papierkorb verschoben."); loadDocs();} }
async function restore(d){ var r=await supa().from("documents").update({deleted_at:null}).eq("id",d.id); if(r.error)msg("Fehler: "+r.error.message,true); else loadDocs(); }
async function hardDelete(d){
  if(!confirm("\""+d.name+"\" ENDGUELTIG loeschen? Das kann nicht rueckgaengig gemacht werden."))return;
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
  var t=(text||"").toLowerCase();
  if(/tankstelle|diesel|super\s?e?10|super\s?95|benzin|liter|aral|shell|esso|\bjet\b|totalenerg/.test(t))return "Tankbeleg";
  if(/restaurant|gastst|men[uü]|trinkgeld|speisen|bewirtung|caf[eé]|imbiss|pizzeria/.test(t))return "Restaurantbeleg";
  if(/hotel|übernacht|zimmer\s?nr|logis/.test(t))return "Hotelbeleg";
  if(/rechnung|invoice|ust-?id|umsatzsteuer|rechnungsnummer|leistungsdatum|steuernummer/.test(t))return "Rechnung";
  return "Beleg";
}
function parseAmt(s){ s=String(s).replace(/\s/g,""); s=s.replace(/\.(?=\d{3}(\D|$))/g,""); s=s.replace(",","."); return Number(s); }
function extractAmount(text){
  var t=text||"", m, out=[];
  var re=/(?:summe|gesamt|total|betrag|zu\s?zahlen|brutto|endbetrag)[^0-9\-]{0,18}(\d{1,3}(?:[.\s]\d{3})*[.,]\d{2})/gi;
  while((m=re.exec(t))){ var v=parseAmt(m[1]); if(!isNaN(v))out.push(v); }
  if(out.length) return Math.max.apply(null,out);
  var re2=/(\d{1,3}(?:[.\s]\d{3})*[.,]\d{2})/g;
  while((m=re2.exec(t))){ var v2=parseAmt(m[1]); if(!isNaN(v2))out.push(v2); }
  return out.length?Math.max.apply(null,out):null;
}
function extractDate(text){
  var m=(text||"").match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);
  if(m){ var dd=("0"+m[1]).slice(-2), mm=("0"+m[2]).slice(-2), yy=m[3]; if(yy.length===2)yy="20"+yy; return dd+"."+mm+"."+yy; }
  var m2=(text||"").match(/(\d{4})-(\d{2})-(\d{2})/);
  if(m2) return m2[3]+"."+m2[2]+"."+m2[1];
  return null;
}
function fileExt(name){ var m=(name||"").match(/\.[A-Za-z0-9]+$/); return m?m[0]:""; }
function makeName(type,date,origName){ return (type||"Beleg")+(date?(" "+date):"")+fileExt(origName); }
// Kern: liest 1 Beleg, setzt Kategorie + Betrag + benennt um. Wirft bei Fehler.
async function processDoc(d){
  var r=await supa().storage.from("documents").download(d.storage_path);
  if(r.error) throw new Error(r.error.message);
  var text=await extractText(r.data,d.name);
  var type=classifyDoc(text), amt=extractAmount(text), date=extractDate(text);
  var upd={ category:type, name:makeName(type,date,d.name) };
  if(amt!=null) upd.amount=amt;
  var u=await supa().from("documents").update(upd).eq("id",d.id);
  if(u.error) throw new Error(u.error.message);
  return { type:type, amount:amt, name:upd.name };
}
async function readReceipt(d){
  msg("Lese Beleg … (beim ersten Foto lädt kurz das OCR-Paket)");
  try{ var res=await processDoc(d); msg("Erkannt & umbenannt: "+res.name+(res.amount!=null?(" · "+res.amount.toFixed(2)+" €"):"")+" — bitte prüfen."); loadDocs(); }
  catch(e){ msg("Auslesen fehlgeschlagen: "+String(e&&e.message||e),true); }
}
async function renameDoc(d){
  var v=prompt("Neuer Name:", d.name); if(v===null||!v.trim())return;
  var r=await supa().from("documents").update({name:v.trim()}).eq("id",d.id);
  if(r.error)msg("Fehler: "+r.error.message,true); else loadDocs();
}

window.MPDMS={ open:open };
})();
