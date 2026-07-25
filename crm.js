/* ===== Mandrudi Plattform — CRM-Modul (Phase 1) =====
   Portierung des bestehenden, ausgereiften CRM-Tools (kapilmandru-lgtm.github.io/crm) in die Plattform.
   Übernommen (fast unverändert): Dashboard, Lead-Score, Stunden-Erfassung, 7 Sprachen, CSV/Excel-Import,
   Excel-Pipeline-Sync (pipeline_1.xlsx), Outlook-Anbindung (Microsoft Graph), Export/Backup.
   Ausgetauscht: Login (nutzt jetzt die Plattform-Anmeldung, kein zweiter Login) + Datenbank
   (crm_projects/crm_companies/crm_contacts/crm_deals/crm_activities statt eigener Supabase-Instanz).
   Bewusst NICHT übernommen (siehe Absprache): Team-Panel, Zielkunden-Pool, OneDrive-Datei-Backup —
   das alles bleibt vorerst nur im Stand-alone-Tool.
*/
(function(){
"use strict";

var root=null; // #view-crm
function $(s){return root?root.querySelector(s):null;}
function MP(){return window.MP||{};}
function supaClient(){return MP().supa;}

/* ============================ Daten-Modell (Stages/Types) ============================ */
var DEFAULT_STAGES=[
  {id:"lead",name:"Anfrage",color:"#8b5cf6",t:{en:"Inquiry",fr:"Demande",es:"Solicitud",it:"Richiesta",pt:"Pedido",nl:"Aanvraag"}},
  {id:"kontaktiert",name:"Vorgestellt",color:"#2f6bff",t:{en:"Presented",fr:"Présenté",es:"Presentado",it:"Presentato",pt:"Apresentado",nl:"Voorgesteld"}},
  {id:"angebot",name:"Interview",color:"#0ea5e9",t:{en:"Interview",fr:"Entretien",es:"Entrevista",it:"Colloquio",pt:"Entrevista",nl:"Interview"}},
  {id:"verhandlung",name:"Nach Interview ✓",color:"#e6a417",t:{en:"After interview ✓",fr:"Après entretien ✓",es:"Tras entrevista ✓",it:"Dopo colloquio ✓",pt:"Após entrevista ✓",nl:"Na interview ✓"}},
  {id:"gewonnen",name:"Aktives Projekt",color:"#1eae6b",t:{en:"Active project",fr:"Projet actif",es:"Proyecto activo",it:"Progetto attivo",pt:"Projeto ativo",nl:"Actief project"}},
  {id:"verloren",name:"Abgelehnt",color:"#e0483d",t:{en:"Rejected",fr:"Refusé",es:"Rechazado",it:"Rifiutato",pt:"Rejeitado",nl:"Afgewezen"}}
];
var STAGE_IDS=["lead","kontaktiert","angebot","verhandlung","gewonnen","verloren"];
var PROJECT_STAGE_DEFAULTS={
  "IT Service Sales":[
    {id:"lead",name:"Lead",color:"#8b5cf6",t:{en:"Lead"}},
    {id:"kontaktiert",name:"Erstgespräch",color:"#2f6bff",t:{en:"First call"}},
    {id:"angebot",name:"Angebot",color:"#0ea5e9",t:{en:"Proposal"}},
    {id:"verhandlung",name:"Verhandlung",color:"#e6a417",t:{en:"Negotiation"}},
    {id:"gewonnen",name:"Gewonnen",color:"#1eae6b",t:{en:"Won"}},
    {id:"verloren",name:"Verloren",color:"#e0483d",t:{en:"Lost"}}
  ]
};
function stageLabel(s){return (s&&s.t&&s.t[lang])||(s&&s.name)||"";}
function curStagesRaw(){var p=store&&store.projects&&store.projects.find(function(x){return x.id===store.current;});
  if(p&&Array.isArray(p.stages)&&p.stages.length)return p.stages;
  if(p&&PROJECT_STAGE_DEFAULTS[p.name])return PROJECT_STAGE_DEFAULTS[p.name];
  return DEFAULT_STAGES;}
function curStages(){return curStagesRaw().map(function(s){return Object.assign({},s,{name:stageLabel(s)});});}
var ACT_TYPES={call:{l:"Anruf",i:"☎",c:"#2f6bff"},meeting:{l:"Termin",i:"◷",c:"#8b5cf6"},
  email:{l:"E-Mail",i:"✉",c:"#0ea5e9"},task:{l:"Aufgabe",i:"✓",c:"#1eae6b"},followup:{l:"Follow-up",i:"↻",c:"#e6a417"},
  timesheet:{l:"Stunden",i:"⏱",c:"#14b8a6"}};
var AV=["#2f6bff","#8b5cf6","#1eae6b","#e6a417","#e0483d","#0ea5e9","#ec4899","#14b8a6"];

/* ============================ i18n ============================ */
var LANGS=[["de","🇩🇪 Deutsch"],["en","🇬🇧 English"],["fr","🇫🇷 Français"],["es","🇪🇸 Español"],["it","🇮🇹 Italiano"],["pt","🇵🇹 Português"],["nl","🇳🇱 Nederlands"]];
var T={
 de:{nav_dash:"Dashboard",nav_cont:"Kontakte",nav_comp:"Firmen",nav_deal:"Deals",nav_act:"Aktivitäten",h_search:"Suchen…",h_outlook:"Outlook",h_export:"Export",h_import:"Import",h_new:"+ Neu",p_label:"Projekt",p_rename:"✎ Umbenennen",p_delete:"🗑 Löschen",sub_dash:"Überblick über dein Geschäft",sub_cont:"Alle Personen",sub_comp:"Alle Unternehmen",sub_deal:"Verkaufs-Pipeline",sub_act:"Aufgaben & Termine",d_contacts:"Kontakte",d_openDeals:"Offene Deals",d_activeProj:"Aktive Projekte",d_avgRate:"Ø Tagessatz",d_firms:"Firmen",d_pipeline:"Pipeline",d_rateVol:"Tagessatz-Vol.",d_overOpen:"über offene Deals",d_pipByPhase:"Pipeline nach Phase",d_board:"Board",d_showAll:"Alle einblenden",d_hidden:"Ausgeblendet — zum Einblenden klicken:",d_upcoming:"Anstehende Aktivitäten",d_all:"Alle",d_latest:"Neueste Deals",d_newInq:"Neue Anfragen",d_noNewInq:"Keine neuen Anfragen",d_noTasks:"Keine offenen Aufgaben",d_noDeals:"Noch keine Deals",c_done:"Erledigt",lang_label:"Sprache"},
 en:{nav_dash:"Dashboard",nav_cont:"Contacts",nav_comp:"Companies",nav_deal:"Deals",nav_act:"Activities",h_search:"Search…",h_outlook:"Outlook",h_export:"Export",h_import:"Import",h_new:"+ New",p_label:"Project",p_rename:"✎ Rename",p_delete:"🗑 Delete",sub_dash:"Overview of your business",sub_cont:"All people",sub_comp:"All companies",sub_deal:"Sales pipeline",sub_act:"Tasks & appointments",d_contacts:"Contacts",d_openDeals:"Open deals",d_activeProj:"Active projects",d_avgRate:"Avg. daily rate",d_firms:"companies",d_pipeline:"pipeline",d_rateVol:"daily-rate vol.",d_overOpen:"across open deals",d_pipByPhase:"Pipeline by stage",d_board:"Board",d_showAll:"Show all",d_hidden:"Hidden — click to show:",d_upcoming:"Upcoming activities",d_all:"All",d_latest:"Latest deals",d_newInq:"New inquiries",d_noNewInq:"No new inquiries",d_noTasks:"No open tasks",d_noDeals:"No deals yet",c_done:"Done",lang_label:"Language"},
 fr:{nav_dash:"Tableau de bord",nav_cont:"Contacts",nav_comp:"Sociétés",nav_deal:"Deals",nav_act:"Activités",h_search:"Rechercher…",h_outlook:"Outlook",h_export:"Exporter",h_import:"Importer",h_new:"+ Nouveau",p_label:"Projet",p_rename:"✎ Renommer",p_delete:"🗑 Supprimer",sub_dash:"Aperçu de votre activité",sub_cont:"Toutes les personnes",sub_comp:"Toutes les sociétés",sub_deal:"Pipeline commercial",sub_act:"Tâches et rendez-vous",d_contacts:"Contacts",d_openDeals:"Deals ouverts",d_activeProj:"Projets actifs",d_avgRate:"Taux journalier moy.",d_firms:"sociétés",d_pipeline:"pipeline",d_rateVol:"vol. tarif journ.",d_overOpen:"sur deals ouverts",d_pipByPhase:"Pipeline par phase",d_board:"Tableau",d_showAll:"Tout afficher",d_hidden:"Masqué — cliquer pour afficher :",d_upcoming:"Activités à venir",d_all:"Toutes",d_latest:"Derniers deals",d_newInq:"Nouvelles demandes",d_noNewInq:"Aucune nouvelle demande",d_noTasks:"Aucune tâche ouverte",d_noDeals:"Aucun deal",c_done:"Terminé",lang_label:"Langue"},
 es:{nav_dash:"Panel",nav_cont:"Contactos",nav_comp:"Empresas",nav_deal:"Deals",nav_act:"Actividades",h_search:"Buscar…",h_outlook:"Outlook",h_export:"Exportar",h_import:"Importar",h_new:"+ Nuevo",p_label:"Proyecto",p_rename:"✎ Renombrar",p_delete:"🗑 Eliminar",sub_dash:"Resumen de tu negocio",sub_cont:"Todas las personas",sub_comp:"Todas las empresas",sub_deal:"Embudo de ventas",sub_act:"Tareas y citas",d_contacts:"Contactos",d_openDeals:"Deals abiertos",d_activeProj:"Proyectos activos",d_avgRate:"Tarifa diaria media",d_firms:"empresas",d_pipeline:"embudo",d_rateVol:"vol. tarifa diaria",d_overOpen:"sobre deals abiertos",d_pipByPhase:"Pipeline por fase",d_board:"Tablero",d_showAll:"Mostrar todo",d_hidden:"Oculto — clic para mostrar:",d_upcoming:"Próximas actividades",d_all:"Todas",d_latest:"Últimos deals",d_newInq:"Nuevas solicitudes",d_noNewInq:"Sin solicitudes nuevas",d_noTasks:"Sin tareas abiertas",d_noDeals:"Aún sin deals",c_done:"Hecho",lang_label:"Idioma"},
 it:{nav_dash:"Dashboard",nav_cont:"Contatti",nav_comp:"Aziende",nav_deal:"Deals",nav_act:"Attività",h_search:"Cerca…",h_outlook:"Outlook",h_export:"Esporta",h_import:"Importa",h_new:"+ Nuovo",p_label:"Progetto",p_rename:"✎ Rinomina",p_delete:"🗑 Elimina",sub_dash:"Panoramica della tua attività",sub_cont:"Tutte le persone",sub_comp:"Tutte le aziende",sub_deal:"Pipeline di vendita",sub_act:"Attività e appuntamenti",d_contacts:"Contatti",d_openDeals:"Deal aperti",d_activeProj:"Progetti attivi",d_avgRate:"Tariffa giorn. media",d_firms:"aziende",d_pipeline:"pipeline",d_rateVol:"vol. tariffa giorn.",d_overOpen:"su deal aperti",d_pipByPhase:"Pipeline per fase",d_board:"Bacheca",d_showAll:"Mostra tutti",d_hidden:"Nascosto — clicca per mostrare:",d_upcoming:"Attività in arrivo",d_all:"Tutte",d_latest:"Ultimi deal",d_newInq:"Nuove richieste",d_noNewInq:"Nessuna nuova richiesta",d_noTasks:"Nessun compito aperto",d_noDeals:"Ancora nessun deal",c_done:"Fatto",lang_label:"Lingua"},
 pt:{nav_dash:"Painel",nav_cont:"Contactos",nav_comp:"Empresas",nav_deal:"Deals",nav_act:"Atividades",h_search:"Pesquisar…",h_outlook:"Outlook",h_export:"Exportar",h_import:"Importar",h_new:"+ Novo",p_label:"Projeto",p_rename:"✎ Renomear",p_delete:"🗑 Excluir",sub_dash:"Visão geral do seu negócio",sub_cont:"Todas as pessoas",sub_comp:"Todas as empresas",sub_deal:"Funil de vendas",sub_act:"Tarefas e compromissos",d_contacts:"Contactos",d_openDeals:"Deals abertos",d_activeProj:"Projetos ativos",d_avgRate:"Taxa diária média",d_firms:"empresas",d_pipeline:"funil",d_rateVol:"vol. taxa diária",d_overOpen:"sobre deals abertos",d_pipByPhase:"Pipeline por fase",d_board:"Quadro",d_showAll:"Mostrar tudo",d_hidden:"Oculto — clique para mostrar:",d_upcoming:"Próximas atividades",d_all:"Todas",d_latest:"Últimos deals",d_newInq:"Novos pedidos",d_noNewInq:"Sem novos pedidos",d_noTasks:"Nenhuma tarefa aberta",d_noDeals:"Ainda sem deals",c_done:"Concluído",lang_label:"Idioma"},
 nl:{nav_dash:"Dashboard",nav_cont:"Contacten",nav_comp:"Bedrijven",nav_deal:"Deals",nav_act:"Activiteiten",h_search:"Zoeken…",h_outlook:"Outlook",h_export:"Exporteren",h_import:"Importeren",h_new:"+ Nieuw",p_label:"Project",p_rename:"✎ Hernoemen",p_delete:"🗑 Verwijderen",sub_dash:"Overzicht van je bedrijf",sub_cont:"Alle personen",sub_comp:"Alle bedrijven",sub_deal:"Verkooppijplijn",sub_act:"Taken & afspraken",d_contacts:"Contacten",d_openDeals:"Open deals",d_activeProj:"Actieve projecten",d_avgRate:"Gem. dagtarief",d_firms:"bedrijven",d_pipeline:"pijplijn",d_rateVol:"dagtarief-vol.",d_overOpen:"over open deals",d_pipByPhase:"Pijplijn per fase",d_board:"Bord",d_showAll:"Alles tonen",d_hidden:"Verborgen — klik om te tonen:",d_upcoming:"Aankomende activiteiten",d_all:"Alle",d_latest:"Nieuwste deals",d_newInq:"Nieuwe aanvragen",d_noNewInq:"Geen nieuwe aanvragen",d_noTasks:"Geen open taken",d_noDeals:"Nog geen deals",c_done:"Klaar",lang_label:"Taal"}
};
var lang=localStorage.getItem("crm-lang")||"de";
function tr(k){return (T[lang]&&T[lang][k])||T.de[k]||k;}
function setLang(l){if(!T[l])return;lang=l;localStorage.setItem("crm-lang",l);applyStaticLang();renderAll();}
function applyStaticLang(){
  var ld=$("#crmLangDrop");
  if(ld&&!ld.options.length)ld.innerHTML=LANGS.map(function(c){return '<option value="'+c[0]+'">'+c[1]+'</option>';}).join("");
  if(root)root.querySelectorAll("[data-i18n]").forEach(function(el){el.textContent=tr(el.dataset.i18n);});
  if(root)root.querySelectorAll("[data-i18n-ph]").forEach(function(el){el.placeholder=tr(el.dataset.i18nPh);});
  if(ld)ld.value=lang;
}

/* ============================ Helfer ============================ */
function uid(){try{return crypto.randomUUID();}catch(e){return Date.now().toString(36)+Math.random().toString(36).slice(2,7);}}
function esc(s){return s==null?"":String(s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});}
function eur(n){return new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(n||0);}
function initials(s){return (s||"?").trim().split(/\s+/).map(function(w){return w[0];}).slice(0,2).join("").toUpperCase();}
function avColor(s){var sum=0;for(var i=0;i<(s||"x").length;i++)sum+=s.charCodeAt(i);return AV[sum%AV.length];}
function toast(m){var t=$("#crmToast");if(!t)return;t.textContent=m;t.classList.add("show");clearTimeout(t._t);t._t=setTimeout(function(){t.classList.remove("show");},1900);}
function byId(arr,id){return arr.find(function(x){return x.id===id;});}
function companyName(id){var c=byId(db.companies,id);return c?c.name:"";}
function contactName(id){var c=byId(db.contacts,id);return c?(c.firstName+" "+c.lastName).trim():"";}
function stageOf(id){var S=curStages();return S.find(function(s){return s.id===id;})||S[0];}
function matchSearch(text){return !state.search||text.toLowerCase().indexOf(state.search.toLowerCase())>=0;}
function daysInfo(d){if(!d)return{cls:"fut",txt:""};var t=new Date();t.setHours(0,0,0,0);var dd=new Date(d);dd.setHours(0,0,0,0);
  var diff=Math.round((dd-t)/86400000);
  if(diff<0)return{cls:"over",txt:Math.abs(diff)+"T überfällig"};
  if(diff===0)return{cls:"today",txt:"Heute"};
  return{cls:"fut",txt:dd.toLocaleDateString("de-DE")};}
function inDays(n){var d=new Date();d.setDate(d.getDate()+n);return d.toISOString().slice(0,10);}
function toMs(t){if(!t)return 0;if(typeof t==="number")return t;var ms=new Date(t).getTime();return isNaN(ms)?0:ms;}

/* ============================ Datenmodell / Store ============================ */
function blankData(){return {contacts:[],companies:[],deals:[],activities:[]};}
var store=null, db=null;
var state={view:"dashboard",search:""}, saveTimer=null;
var sel=new Set(), visibleIds=[];
var hiddenStages=new Set(JSON.parse(localStorage.getItem("crm-hiddenStages")||"[]"));
var loadedIds={};

async function ensureTenant(){
  var m=MP(); if(m.tenantId)return m.tenantId;
  var sb=supaClient(); if(!sb||!m.user)return null;
  try{var r=await sb.from("profiles").select("tenant_id").eq("id",m.user.id).single(); if(r.data){m.tenantId=r.data.tenant_id;return r.data.tenant_id;}}catch(e){}
  try{ await sb.rpc("ensure_my_profile");
    var r2=await sb.from("profiles").select("tenant_id").eq("id",m.user.id).single();
    if(r2.data){m.tenantId=r2.data.tenant_id;return r2.data.tenant_id;}
  }catch(e){}
  return null;
}
function useProject(id){if(store&&store.data[id]){store.current=id;db=store.data[id];}}

/* ---- Supabase <-> internes Modell ---- */
var coIn=function(r){return {id:r.id,createdAt:toMs(r.created_at),name:r.name||"",industry:r.industry||"",website:r.website||"",phone:r.phone||"",address:r.address||"",notes:r.notes||""};};
var coOut=function(c,pid,tid){return {id:c.id,tenant_id:tid,project_id:pid,name:c.name||"",industry:c.industry||"",website:c.website||"",phone:c.phone||"",address:c.address||"",notes:c.notes||""};};
var ctIn=function(r){return {id:r.id,createdAt:toMs(r.created_at),firstName:r.first_name||"",lastName:r.last_name||"",companyId:r.company_id||"",position:r.position||"",title:r.title||"",lastContact:r.last_contact||"",email:r.email||"",phone:r.phone||"",tags:r.tags||[],notes:r.notes||""};};
var ctOut=function(c,pid,tid){return {id:c.id,tenant_id:tid,project_id:pid,first_name:c.firstName||"",last_name:c.lastName||"",company_id:c.companyId||null,position:c.position||"",title:c.title||"",last_contact:c.lastContact||null,email:c.email||"",phone:c.phone||"",tags:c.tags||[],notes:c.notes||""};};
var dlIn=function(r){return {id:r.id,createdAt:toMs(r.created_at),title:r.title||"",value:+r.value||0,stage:r.stage||"lead",companyId:r.company_id||"",contactId:r.contact_id||"",closeDate:r.close_date||"",notes:r.notes||"",done:!!r.done,candidate:r.candidate||""};};
var dlOut=function(d,pid,tid){return {id:d.id,tenant_id:tid,project_id:pid,title:d.title||"",value:+d.value||0,stage:d.stage||"lead",company_id:d.companyId||null,contact_id:d.contactId||null,close_date:d.closeDate||null,notes:d.notes||"",done:!!d.done,candidate:d.candidate||""};};
var acIn=function(r){return {id:r.id,createdAt:toMs(r.created_at),title:r.title||"",type:r.type||"task",dueDate:r.due_date||"",done:!!r.done,contactId:r.contact_id||"",dealId:r.deal_id||"",notes:r.notes||""};};
var acOut=function(a,pid,tid){return {id:a.id,tenant_id:tid,project_id:pid,title:a.title||"",type:a.type||"task",due_date:a.dueDate||null,done:!!a.done,contact_id:a.contactId||null,deal_id:a.dealId||null,notes:a.notes||""};};

async function sbAll(sb,table,pid){
  var out=[],size=1000,from=0;
  while(true){
    var r=await sb.from(table).select("*").eq("project_id",pid).order("created_at").range(from,from+size-1);
    if(r.error)return {data:out,error:r.error};
    var d=r.data||[]; out=out.concat(d);
    if(d.length<size)break; from+=size;
  }
  return {data:out};
}
async function sbUpsertAll(table,rows){
  var sb=supaClient();
  for(var i=0;i<rows.length;i+=500){
    var r=await sb.from(table).upsert(rows.slice(i,i+500));
    if(r.error)throw r.error;
  }
}
async function sbDel(pid,table,arr,ids){
  var sb=supaClient();
  var keep=new Set(arr.map(function(x){return x.id;}));
  var toDel=(ids||new Set());
  var del=[...toDel].filter(function(id){return !keep.has(id);});
  for(var i=0;i<del.length;i+=200){
    var chunk=del.slice(i,i+200);
    var r=await sb.from(table).delete().eq("project_id",pid).in("id",chunk);
    if(r.error)throw r.error;
  }
}
async function loadFromSupabase(){
  var sb=supaClient(); if(!sb)return;
  var pr=await sb.from("crm_projects").select("*").order("created_at");
  store={v:2,projects:(pr.data||[]).map(function(p){return {id:p.id,name:p.name,stages:(Array.isArray(p.stages)&&p.stages.length)?p.stages:null};}),current:null,data:{}};
  loadedIds={};
  for(var i=0;i<store.projects.length;i++){
    var p=store.projects[i];
    var res=await Promise.all([sbAll(sb,"crm_companies",p.id),sbAll(sb,"crm_contacts",p.id),sbAll(sb,"crm_deals",p.id),sbAll(sb,"crm_activities",p.id)]);
    store.data[p.id]={companies:(res[0].data||[]).map(coIn),contacts:(res[1].data||[]).map(ctIn),deals:(res[2].data||[]).map(dlIn),activities:(res[3].data||[]).map(acIn)};
    loadedIds[p.id]={companies:new Set((res[0].data||[]).map(function(x){return x.id;})),contacts:new Set((res[1].data||[]).map(function(x){return x.id;})),deals:new Set((res[2].data||[]).map(function(x){return x.id;})),activities:new Set((res[3].data||[]).map(function(x){return x.id;}))};
  }
  if(store.projects.length){useProject(store.projects[0].id);}else{db=blankData();}
}
function scheduleSave(){clearTimeout(saveTimer);saveTimer=setTimeout(save,400);}
async function save(){
  if(!store||!store.current)return;
  var sb=supaClient(); if(!sb)return;
  var tid=await ensureTenant(); if(!tid)return;
  var pid=store.current,d=db;
  try{
    if(d.companies.length)await sbUpsertAll("crm_companies",d.companies.map(function(c){return coOut(c,pid,tid);}));
    if(d.contacts.length)await sbUpsertAll("crm_contacts",d.contacts.map(function(c){return ctOut(c,pid,tid);}));
    if(d.deals.length)await sbUpsertAll("crm_deals",d.deals.map(function(x){return dlOut(x,pid,tid);}));
    if(d.activities.length)await sbUpsertAll("crm_activities",d.activities.map(function(x){return acOut(x,pid,tid);}));
    var li=loadedIds[pid]||{companies:new Set(),contacts:new Set(),deals:new Set(),activities:new Set()};
    await sbDel(pid,"crm_activities",d.activities,li.activities);
    await sbDel(pid,"crm_deals",d.deals,li.deals);
    await sbDel(pid,"crm_contacts",d.contacts,li.contacts);
    await sbDel(pid,"crm_companies",d.companies,li.companies);
    loadedIds[pid]={companies:new Set(d.companies.map(function(x){return x.id;})),contacts:new Set(d.contacts.map(function(x){return x.id;})),deals:new Set(d.deals.map(function(x){return x.id;})),activities:new Set(d.activities.map(function(x){return x.id;}))};
    writeJsonFile();
  }catch(e){ toast("Speichern fehlgeschlagen: "+(e.message||e)); }
}

/* ---- Projekte ---- */
function promptNewProject(){var n=prompt("Name des neuen Projekts:","");if(n&&n.trim())newProject(n.trim());}
async function newProject(name){
  var tid=await ensureTenant(); if(!tid){toast("Firma nicht ermittelt.");return;}
  var sb=supaClient();
  var r=await sb.from("crm_projects").insert({tenant_id:tid,name:name}).select().single();
  if(r.error){toast("Fehler: "+r.error.message);return;}
  var pid=r.data.id;
  store.projects.push({id:pid,name:name}); store.data[pid]=blankData(); loadedIds[pid]={companies:new Set(),contacts:new Set(),deals:new Set(),activities:new Set()};
  useProject(pid); sel.clear(); state.view="dashboard"; state.search=""; renderAll(); toast("Projekt „"+name+"“ angelegt");
}
async function renameProject(id){
  var p=store.projects.find(function(x){return x.id===id;}); if(!p)return;
  var n=prompt("Projekt umbenennen:",p.name); if(!n||!n.trim())return;
  p.name=n.trim();
  var sb=supaClient(); await sb.from("crm_projects").update({name:p.name}).eq("id",id);
  renderAll();
}
async function deleteProject(id){
  if(store.projects.length<=1){alert("Das letzte Projekt kann nicht gelöscht werden.");return;}
  var p=store.projects.find(function(x){return x.id===id;}); if(!p)return;
  if(!confirm("Projekt „"+p.name+"“ mit ALLEN Daten unwiderruflich löschen?"))return;
  var sb=supaClient(); var r=await sb.from("crm_projects").delete().eq("id",id);
  if(r.error){toast("Fehler: "+r.error.message);return;}
  store.projects=store.projects.filter(function(x){return x.id!==id;}); delete store.data[id];
  if(store.current===id)useProject(store.projects[0].id);
  renderAll(); toast("Projekt gelöscht");
}
async function switchProject(id){ if(!store||id===store.current)return; useProject(id); sel.clear(); state.view="dashboard"; state.search=""; renderAll(); }
function renderProjectSel(){
  var el=$("#crmProjsel"); if(!el||!store)return;
  el.innerHTML='<label>'+esc(tr("p_label")).toUpperCase()+'</label>'
    +'<div class="prow"><select id="crmProjDrop">'+store.projects.map(function(p){return '<option value="'+p.id+'" '+(p.id===store.current?"selected":"")+'>'+esc(p.name)+'</option>';}).join("")+'</select>'
    +'<button title="Neues Projekt starten" id="crmProjAdd">+</button></div>'
    +'<div class="pactions"><span id="crmProjRename">'+tr("p_rename")+'</span><span id="crmProjStages" title="Pipeline-Phasen dieses Projekts benennen">⚙ Phasen</span><span id="crmProjDelete">'+tr("p_delete")+'</span></div>';
  el.querySelector("#crmProjDrop").addEventListener("change",function(e){switchProject(e.target.value);});
  el.querySelector("#crmProjAdd").addEventListener("click",promptNewProject);
  el.querySelector("#crmProjRename").addEventListener("click",function(){renameProject(store.current);});
  el.querySelector("#crmProjStages").addEventListener("click",stagesForm);
  el.querySelector("#crmProjDelete").addEventListener("click",function(){deleteProject(store.current);});
}
async function setProjectStages(id,arr){
  var p=store.projects.find(function(x){return x.id===id;}); if(!p)return;
  p.stages=(Array.isArray(arr)&&arr.length)?arr:null;
  var sb=supaClient(); await sb.from("crm_projects").update({stages:p.stages}).eq("id",id);
  renderAll(); toast("Phasen aktualisiert");
}
function resetProjectStages(id){setProjectStages(id,null);closeModal();}
function stagesForm(){
  var cur=curStagesRaw();
  var get=function(id){return cur.find(function(s){return s.id===id;})||DEFAULT_STAGES.find(function(s){return s.id===id;});};
  var p=store.projects.find(function(x){return x.id===store.current;});
  openModal('<div class="mh"><h3>Pipeline-Phasen · '+esc(p?p.name:"")+'</h3><button class="x" onclick="MPCRM._close()">×</button></div>'
    +'<form id="crmStagesForm">'
    +'<p style="margin:0 0 14px;color:var(--muted);font-size:13px">Benenne die Phasen dieses Projekts. Reihenfolge bleibt gleich; bestehende Deals behalten ihre Phase.</p>'
    +STAGE_IDS.map(function(id,i){var s=get(id);return '<div style="display:flex;gap:10px;align-items:center;margin-bottom:8px">'
      +'<input type="color" name="c_'+id+'" value="'+s.color+'" style="width:44px;height:38px;padding:2px;border:1px solid var(--line);border-radius:8px;flex:0 0 auto;cursor:pointer">'
      +'<input name="n_'+id+'" value="'+esc(stageLabel(s))+'" placeholder="Phase '+(i+1)+'" required style="flex:1">'
      +'</div>';}).join("")
    +'<div class="mf" style="display:flex;justify-content:space-between;gap:10px;margin-top:18px">'
    +'<button type="button" class="btn sec" id="crmStagesReset">Zurücksetzen</button>'
    +'<span style="display:flex;gap:10px"><button type="button" class="btn sec" onclick="MPCRM._close()">Abbrechen</button>'
    +'<button type="submit" class="btn">Speichern</button></span></div></form>');
  var f=$("#crmStagesForm");
  f.addEventListener("submit",function(e){e.preventDefault();
    var arr=STAGE_IDS.map(function(id){return {id:id,name:(f.elements["n_"+id].value||"").trim()||id,color:f.elements["c_"+id].value};});
    setProjectStages(store.current,arr); closeModal();
  });
  $("#crmStagesReset").addEventListener("click",function(){ if(confirm("Auf Standard-Phasen zurücksetzen?"))resetProjectStages(store.current); });
}

/* ============================ Realtime ============================ */
var rtChannel=null,lastLocalWrite=0,rtReady=false;
function ownEcho(){return (Date.now()-lastLocalWrite)<1800;}
function startRealtime(){
  var sb=supaClient(); if(!sb)return;
  try{ if(rtChannel){sb.removeChannel(rtChannel);rtChannel=null;} }catch(e){}
  var ch=sb.channel("mp-crm-live");
  ["crm_companies","crm_contacts","crm_deals","crm_activities"].forEach(function(t){
    ch.on("postgres_changes",{event:"*",schema:"public",table:t},function(){ if(!rtReady||ownEcho())return; loadFromSupabase().then(function(){var keep=store&&store.current;if(keep&&store.data[keep])useProject(keep);renderAll();}); });
  });
  ch.on("postgres_changes",{event:"*",schema:"public",table:"crm_projects"},function(){ if(!rtReady||ownEcho())return; loadFromSupabase().then(function(){var keep=store&&store.current;if(keep&&store.data[keep])useProject(keep);renderAll();}); });
  setSbStatus(false);
  sb.auth.getSession().then(function(r){ try{sb.realtime.setAuth((r.data.session||{}).access_token);}catch(e){}
    ch.subscribe(function(status){ setSbStatus(status==="SUBSCRIBED"); });
  });
  rtChannel=ch;
}
function setSbStatus(ok){
  var dot=$("#crmSbDot"),lbl=$("#crmSbLbl"); if(!dot)return;
  dot.classList.toggle("ok",!!ok);
  lbl.textContent="Supabase: "+(ok?"Live":"getrennt");
}

/* ============================ JSON-Datei-Verbindung (lokales Backup) ============================ */
var jsonFileHandle=null;
function setJsonStatus(ok){
  var dot=$("#crmJsonDot"),lbl=$("#crmJsonLbl"),btn=$("#crmJsonBtn"); if(!dot)return;
  dot.classList.toggle("ok",!!ok);
  lbl.textContent="JSON: "+(ok?"verbunden":"nicht verbunden");
  if(btn)btn.textContent=ok?"Andere Datei…":"JSON-Datei verbinden";
}
async function writeJsonFile(){
  if(!jsonFileHandle)return;
  try{ var w=await jsonFileHandle.createWritable(); await w.write(JSON.stringify(db,null,2)); await w.close(); }catch(e){}
}
async function connectJsonFile(){
  if(!window.showSaveFilePicker){ toast("Braucht Chrome oder Edge (Dateizugriff)."); return; }
  try{
    var h=jsonFileHandle?(await window.showOpenFilePicker({types:[{description:"CRM JSON",accept:{"application/json":[".json"]}}]}))[0]
      :await window.showSaveFilePicker({suggestedName:"crm-backup.json",types:[{description:"CRM JSON",accept:{"application/json":[".json"]}}]});
    jsonFileHandle=h; await idbSet("crmJsonHandle",h);
    await writeJsonFile(); setJsonStatus(true); toast("JSON-Datei verbunden");
  }catch(e){ if(e.name!=="AbortError")toast("Fehler: "+e.message); }
}
async function tryReconnectJson(){
  try{
    var h=await idbGet("crmJsonHandle"); if(!h)return;
    if((await h.queryPermission({mode:"readwrite"}))==="granted"){ jsonFileHandle=h; setJsonStatus(true); }
    else{ setJsonStatus(false); }
  }catch(e){ setJsonStatus(false); }
}

/* ============================ Views ============================ */
var TITLEKEYS={dashboard:["nav_dash","sub_dash"],contacts:["nav_cont","sub_cont"],companies:["nav_comp","sub_comp"],deals:["nav_deal","sub_deal"],activities:["nav_act","sub_act"]};
var ENTITY_LABEL={contacts:"Kontakte",companies:"Firmen",deals:"Deals",activities:"Aktivitäten"};

function renderAll(){
  if(!root)return;
  renderProjectSel();
  var bc=$("#crmB-contacts"); if(bc)bc.textContent=db.contacts.length;
  var bco=$("#crmB-companies"); if(bco)bco.textContent=db.companies.length;
  var bd=$("#crmB-deals"); if(bd)bd.textContent=db.deals.filter(function(d){return d.stage!=="gewonnen"&&d.stage!=="verloren";}).length;
  var ba=$("#crmB-activities"); if(ba)ba.textContent=db.activities.filter(function(a){return !a.done;}).length;
  root.querySelectorAll("#crmNav a").forEach(function(a){a.classList.toggle("active",a.dataset.view===state.view);});
  $("#crmViewTitle").textContent=tr(TITLEKEYS[state.view][0]);
  $("#crmViewSub").textContent=tr(TITLEKEYS[state.view][1]);
  ({dashboard:viewDashboard,contacts:viewContacts,companies:viewCompanies,deals:viewDeals,activities:viewActivities}[state.view])();
}
function emptyBox(t){return '<div class="empty"><div class="big">◔</div>'+t+'</div>';}

/* ---- Scoring / Next-Action ---- */
var STALE_DAYS=7;
function lastTouch(d){var acts=db.activities.filter(function(a){return a.dealId===d.id||(d.contactId&&a.contactId===d.contactId);});
  var ts=acts.map(function(a){return toMs(a.createdAt);}); return ts.length?Math.max.apply(Math,ts):toMs(d.createdAt);}
function daysSince(ts){return ts?Math.floor((Date.now()-ts)/86400000):999;}
function staleOpenDeals(){
  return db.deals.filter(function(d){return d.stage!=="gewonnen"&&d.stage!=="verloren"&&!d.done;})
    .map(function(d){return {d:d,days:daysSince(lastTouch(d))};})
    .filter(function(x){return x.days>=STALE_DAYS;})
    .filter(function(x){return !db.activities.some(function(a){return a.dealId===x.d.id&&!a.done;});})
    .sort(function(a,b){return b.days-a.days;});
}
function dealScore(d){
  var acts=db.activities.filter(function(a){return a.dealId===d.id;});
  var days=daysSince(lastTouch(d));
  var score=Math.max(0,40-Math.round(days*40/14));
  score+=Math.min(40,acts.length*10);
  score+=d.value?20:0;
  return Math.max(0,Math.min(100,score));
}
function scoreColor(s){return s>=70?"var(--green)":s>=40?"var(--amber)":"var(--red)";}

/* ---- Stunden-Erfassung (nutzt Aktivitäten-Typ "timesheet") ---- */
function dealTimeEntries(id){return db.activities.filter(function(a){return a.type==="timesheet"&&a.dealId===id;}).sort(function(a,b){return (b.dueDate||"").localeCompare(a.dueDate||"");});}
function parseHoursFromTitle(t){var m=(t||"").match(/^(\d+(?:[.,]\d+)?)\s*h\b/i);return m?parseFloat(m[1].replace(",",".")):0;}
function dealHoursSum(id){return Math.round(dealTimeEntries(id).reduce(function(s,a){return s+parseHoursFromTitle(a.title);},0)*100)/100;}
function timesheetForm(dealId){
  var d=byId(db.deals,dealId); if(!d)return;
  var entries=dealTimeEntries(dealId),sum=dealHoursSum(dealId);
  openModal('<div class="mh"><h3>⏱ Stunden — '+esc(d.title)+'</h3><button class="x" onclick="MPCRM._close()">×</button></div>'
    +'<div class="mb"><div class="kv"><div class="k">Gesamt erfasst</div><div class="v"><b>'+sum.toLocaleString("de-DE")+' h</b></div></div>'
    +(entries.length?'<div class="detail-sec"><h4>Einträge</h4>'+entries.map(function(a){return '<div class="kv"><div class="v">'+(a.dueDate?new Date(a.dueDate).toLocaleDateString("de-DE"):"—")+' · '+esc(a.title)+'</div><div class="right"><span style="cursor:pointer;color:var(--red)" onclick="MPCRM._delAct(\''+a.id+'\');MPCRM._timesheet(\''+dealId+'\')" title="Löschen">✕</span></div></div>';}).join("")+'</div>':"")
    +'<div class="detail-sec"><h4>Neuer Eintrag</h4><form id="crmTsForm"><div class="row2"><div class="fld"><label>Datum</label><input name="date" type="date" value="'+inDays(0)+'"></div>'
    +'<div class="fld"><label>Stunden *</label><input name="hours" type="number" step="0.25" min="0.25" required></div></div>'
    +'<div class="fld"><label>Tätigkeit</label><input name="desc" placeholder="z. B. Onsite-Support"></div></form></div></div>'
    +'<div class="mf"><button class="btn sec" onclick="MPCRM._close()">Schließen</button><button class="btn" onclick="MPCRM._saveTs(\''+dealId+'\')">Eintragen</button></div>');
}
function saveTimesheet(dealId){
  var f=$("#crmTsForm"); if(!f)return;
  var hours=parseFloat((f.elements.hours.value||"0").replace(",","."))||0; if(hours<=0)return;
  var desc=f.elements.desc.value;
  db.activities.push({id:uid(),createdAt:Date.now(),done:true,type:"timesheet",title:hours+"h"+(desc?" – "+desc:""),dueDate:f.elements.date.value||inDays(0),contactId:"",dealId:dealId,notes:desc||""});
  scheduleSave(); timesheetForm(dealId); renderAll(); toast("Stunden erfasst");
}

function followUpDeal(id){
  var d=byId(db.deals,id); if(!d)return;
  activityForm({type:"followup",title:"Follow-up: "+d.title,dueDate:inDays(3),contactId:d.contactId||"",dealId:id,
    notes:"Profil gesendet — nachfassen ("+(companyName(d.companyId)||contactName(d.contactId)||"")+")"});
}
function toggleDealDone(id,ch){var d=byId(db.deals,id); if(d){d.done=ch;scheduleSave();renderAll();}}

function viewDashboard(){
  var open=db.deals.filter(function(d){return d.stage!=="gewonnen"&&d.stage!=="verloren";});
  var pipe=open.reduce(function(s,d){return s+(+d.value||0);},0);
  var won=db.deals.filter(function(d){return d.stage==="gewonnen";});
  var wonSum=won.reduce(function(s,d){return s+(+d.value||0);},0);
  var avgRate=open.length?Math.round(pipe/open.length):0;
  var openAct=db.activities.filter(function(a){return !a.done;});
  var upcoming=openAct.slice().sort(function(a,b){return (a.dueDate||"9").localeCompare(b.dueDate||"9");}).slice(0,6);
  var recentDeals=db.deals.slice().sort(function(a,b){return b.createdAt-a.createdAt;}).slice(0,5);
  var newInq=db.deals.filter(function(d){return d.stage==="lead";}).sort(function(a,b){return b.createdAt-a.createdAt;}).slice(0,6);
  var stale=staleOpenDeals();
  var stageData=curStages().map(function(s){var it=db.deals.filter(function(d){return d.stage===s.id;});return {s:s,n:it.length,sum:it.reduce(function(a,d){return a+(+d.value||0);},0)};});
  var visStages=stageData.filter(function(x){return !hiddenStages.has(x.s.id);});
  var maxSum=Math.max.apply(Math,[1].concat(visStages.map(function(x){return x.sum;})));
  $("#crmContent").innerHTML='<div class="stats">'
    +'<div class="stat"><span class="ic">◔</span><div class="lbl">'+tr("d_contacts")+'</div><div class="val">'+db.contacts.length+'</div><div class="foot">'+db.companies.length+' '+tr("d_firms")+'</div></div>'
    +'<div class="stat"><span class="ic">◆</span><div class="lbl">'+tr("d_openDeals")+'</div><div class="val">'+open.length+'</div><div class="foot">'+eur(pipe)+' '+tr("d_pipeline")+'</div></div>'
    +'<div class="stat"><span class="ic">✓</span><div class="lbl">'+tr("d_activeProj")+'</div><div class="val">'+won.length+'</div><div class="foot">'+eur(wonSum)+' '+tr("d_rateVol")+'</div></div>'
    +'<div class="stat"><span class="ic">€</span><div class="lbl">'+tr("d_avgRate")+'</div><div class="val">'+eur(avgRate)+'</div><div class="foot">'+tr("d_overOpen")+'</div></div></div>'
    +'<div class="panel" style="margin-bottom:20px"><div class="ph"><h3>'+tr("d_pipByPhase")+'</h3>'
    +(hiddenStages.size?'<button class="btn sm sec" onclick="MPCRM._showAllStages()">'+tr("d_showAll")+'</button>':"")
    +'<button class="btn sm sec" onclick="MPCRM._go(\'deals\')">'+tr("d_board")+'</button></div>'
    +'<div style="padding:15px 18px">'+visStages.map(function(x){return '<div style="display:flex;align-items:center;gap:12px;margin-bottom:11px">'
      +'<div style="width:150px;font-weight:600;font-size:13px;display:flex;align-items:center;gap:7px"><span class="dot-s" style="background:'+x.s.color+'"></span>'+esc(x.s.name)+'<span onclick="MPCRM._toggleStage(\''+x.s.id+'\')" style="margin-left:auto;cursor:pointer;color:var(--muted);opacity:.5;font-size:14px">⊘</span></div>'
      +'<div style="flex:1;background:#eef1f7;border-radius:6px;height:22px;overflow:hidden"><div style="width:'+Math.round(x.sum/maxSum*100)+'%;background:'+x.s.color+';height:100%;border-radius:6px"></div></div>'
      +'<div style="width:52px;text-align:right;font-size:12.5px;color:var(--muted)">'+x.n+' St.</div>'
      +'<div style="width:92px;text-align:right;font-weight:700">'+eur(x.sum)+'</div></div>';}).join("")
    +(visStages.length?"":'<div class="muted" style="padding:4px 0">Alle Phasen ausgeblendet.</div>')
    +(hiddenStages.size?'<div style="margin-top:10px;padding-top:11px;border-top:1px solid var(--line);font-size:12.5px;color:var(--muted)">'+tr("d_hidden")+' '+stageData.filter(function(x){return hiddenStages.has(x.s.id);}).map(function(x){return '<span onclick="MPCRM._toggleStage(\''+x.s.id+'\')" style="cursor:pointer;display:inline-block;background:#eef1f7;border-radius:20px;padding:3px 11px;margin:3px 3px;font-weight:600;color:var(--ink)"><span class="dot-s" style="background:'+x.s.color+';margin-right:6px"></span>'+esc(x.s.name)+' +</span>';}).join("")+'</div>':"")
    +'</div></div>'
    +'<div class="panel" style="margin-bottom:20px"><div class="ph"><h3>'+tr("d_newInq")+(newInq.length?' <span class="pill" style="background:'+stageOf("lead").color+'22;color:'+stageOf("lead").color+';margin-left:2px">'+newInq.length+'</span>':"")+'</h3><button class="btn sm sec" onclick="MPCRM._go(\'deals\')">'+tr("d_board")+'</button></div>'
    +(newInq.length?'<table><tbody>'+newInq.map(function(d){return '<tr onclick="MPCRM._openDeal(\''+d.id+'\')"><td><b>'+esc(d.title)+'</b><div class="meta muted">'+esc(companyName(d.companyId)||"—")+(d.contactId&&contactName(d.contactId)?" · "+esc(contactName(d.contactId)):"")+'</div></td>'
      +'<td class="right muted" style="font-size:12px;white-space:nowrap">'+(d.createdAt?new Date(d.createdAt).toLocaleDateString("de-DE",{day:"2-digit",month:"short"}):"")+'</td>'
      +'<td class="right"><b>'+(d.value?eur(d.value):"")+'</b></td></tr>';}).join("")+'</tbody></table>':emptyBox(tr("d_noNewInq")))
    +'</div>'
    +'<div class="panel" style="margin-bottom:20px"><div class="ph"><h3>🎯 Nächste Schritte'+(stale.length?' <span class="pill" style="background:#e0483d22;color:var(--red);margin-left:2px">'+stale.length+'</span>':"")+'</h3></div>'
    +(stale.length?'<table><tbody>'+stale.map(function(x){return '<tr onclick="MPCRM._openDeal(\''+x.d.id+'\')"><td><b>'+esc(x.d.title)+'</b><div class="meta muted">'+esc(companyName(x.d.companyId)||contactName(x.d.contactId)||"—")+'</div></td>'
      +'<td class="right muted" style="font-size:12px;white-space:nowrap">'+x.days+' Tage ohne Aktivität</td>'
      +'<td class="right"><span onclick="event.stopPropagation();MPCRM._followUp(\''+x.d.id+'\')" style="cursor:pointer;color:var(--brand);font-weight:600;white-space:nowrap">↻ Follow-up</span></td></tr>';}).join("")+'</tbody></table>':emptyBox("Alles auf dem neuesten Stand — keine Deals ohne Aktivität"))
    +'</div>'
    +'<div class="grid2"><div class="panel"><div class="ph"><h3>'+tr("d_upcoming")+'</h3><button class="btn sm sec" onclick="MPCRM._go(\'activities\')">'+tr("d_all")+'</button></div>'
    +(upcoming.length?upcoming.map(function(a){return actRow(a);}).join(""):emptyBox(tr("d_noTasks")))+'</div>'
    +'<div class="panel"><div class="ph"><h3>'+tr("d_latest")+'</h3><button class="btn sm sec" onclick="MPCRM._go(\'deals\')">'+tr("d_pipByPhase").split(" ")[0]+'</button></div>'
    +(recentDeals.length?'<table><tbody>'+recentDeals.map(function(d){return '<tr onclick="MPCRM._openDeal(\''+d.id+'\')"><td><b>'+esc(d.title)+'</b><div class="meta muted">'+esc(companyName(d.companyId)||"—")+'</div></td>'
      +'<td class="right"><span class="pill" style="background:'+stageOf(d.stage).color+'22;color:'+stageOf(d.stage).color+'">'+esc(stageOf(d.stage).name)+'</span></td>'
      +'<td class="right"><b>'+eur(d.value)+'</b></td></tr>';}).join("")+'</tbody></table>':emptyBox(tr("d_noDeals")))+'</div></div>';
}
function toggleStage(id){hiddenStages.has(id)?hiddenStages.delete(id):hiddenStages.add(id); localStorage.setItem("crm-hiddenStages",JSON.stringify([...hiddenStages])); renderAll();}
function showAllStages(){hiddenStages.clear(); localStorage.setItem("crm-hiddenStages","[]"); renderAll();}

function bulkBar(){
  if(!sel.size)return "";
  var all=visibleIds.length&&visibleIds.every(function(x){return sel.has(x);});
  var selAll=(state.view==="deals"||state.view==="activities")?'<button class="btn ghost sm" onclick="MPCRM._toggleAllSel('+(!all)+')">'+(all?"Nichts":"Alle")+' auswählen</button>':"";
  return '<div class="bulkbar"><span class="cnt">'+sel.size+' ausgewählt</span><button class="btn danger sm" onclick="MPCRM._bulkDelete()">🗑 Löschen</button>'+selAll+'<button class="btn ghost sm" onclick="MPCRM._clearSel()">Auswahl aufheben</button></div>';
}
function selCheckbox(id,extra){return '<input type="checkbox" class="selbox"'+(extra||"")+' '+(sel.has(id)?"checked":"")+' onclick="event.stopPropagation();MPCRM._toggleSel(event,\''+id+'\',this.checked)">';}
function toggleSel(e,id,ch){ if(ch)sel.add(id); else sel.delete(id);
  var el=e.target.closest("tr,.card,.act"); if(el)el.classList.toggle("selrow",ch);
  var bb=$("#crmBulkbar"); if(bb)bb.innerHTML=bulkBar();
  var all=visibleIds.length&&visibleIds.every(function(x){return sel.has(x);});
  var h=root.querySelector("thead .selbox"); if(h)h.checked=all; }
function toggleAllSel(ch){visibleIds.forEach(function(id){ch?sel.add(id):sel.delete(id);}); renderAll();}
function clearSel(){sel.clear();renderAll();}
function bulkDelete(){
  var n=sel.size; if(!n)return; var key=state.view,lbl=ENTITY_LABEL[key]||"Einträge";
  if(!confirm(n+" "+lbl+" unwiderruflich löschen?"))return;
  db[key]=db[key].filter(function(x){return !sel.has(x.id);}); sel.clear();
  scheduleSave(); renderAll(); toast(n+" gelöscht");
}

function viewContacts(){
  var rows=db.contacts.filter(function(c){return matchSearch(c.firstName+" "+c.lastName+" "+companyName(c.companyId)+" "+c.email+" "+(c.tags||[]).join(" "));})
    .sort(function(a,b){return (a.lastName||a.firstName).localeCompare(b.lastName||b.firstName);});
  visibleIds=rows.map(function(c){return c.id;});
  sel.forEach(function(id){if(!byId(db.contacts,id))sel.delete(id);});
  var allSel=rows.length&&rows.every(function(c){return sel.has(c.id);});
  $("#crmContent").innerHTML='<div id="crmBulkbar">'+bulkBar()+'</div><div class="panel">'
    +(rows.length?'<table><thead><tr><th style="width:40px"><input type="checkbox" class="selbox" '+(allSel?"checked":"")+' onclick="MPCRM._toggleAllSel(this.checked)"></th>'
      +'<th>Name</th><th>Titel</th><th>Firma</th><th>E-Mail</th><th>Telefon</th><th>Letzter Kontakt</th><th>Tags</th></tr></thead><tbody>'
      +rows.map(function(c){return '<tr class="'+(sel.has(c.id)?"selrow":"")+'" onclick="MPCRM._openContact(\''+c.id+'\')">'
        +'<td onclick="event.stopPropagation()">'+selCheckbox(c.id)+'</td>'
        +'<td><div class="cellname"><span class="av" style="background:'+avColor(c.firstName+c.lastName)+'">'+initials(c.firstName+" "+c.lastName)+'</span><div><b>'+esc(c.firstName)+' '+esc(c.lastName)+'</b><div class="meta">'+esc(c.position||"")+'</div></div></div></td>'
        +'<td>'+esc(c.title||"—")+'</td><td>'+esc(companyName(c.companyId)||"—")+'</td>'
        +'<td>'+(c.email?'<a class="link" href="mailto:'+esc(c.email)+'" onclick="event.stopPropagation()">'+esc(c.email)+'</a>':"—")+'</td>'
        +'<td>'+esc(c.phone||"—")+'</td><td>'+(c.lastContact?new Date(c.lastContact).toLocaleDateString("de-DE"):"—")+'</td>'
        +'<td>'+((c.tags||[]).map(function(t){return '<span class="tag">'+esc(t)+'</span>';}).join("")||"—")+'</td></tr>';}).join("")+'</tbody></table>'
    :emptyBox(db.contacts.length?"Keine Treffer":"Noch keine Kontakte — klicke oben auf „+ Neu“"))+'</div>';
}
function viewCompanies(){
  var rows=db.companies.filter(function(c){return matchSearch(c.name+" "+c.industry+" "+c.website);}).sort(function(a,b){return a.name.localeCompare(b.name);});
  visibleIds=rows.map(function(c){return c.id;});
  sel.forEach(function(id){if(!byId(db.companies,id))sel.delete(id);});
  var allSel=rows.length&&rows.every(function(c){return sel.has(c.id);});
  $("#crmContent").innerHTML='<div id="crmBulkbar">'+bulkBar()+'</div><div class="panel">'
    +(rows.length?'<table><thead><tr><th style="width:40px"><input type="checkbox" class="selbox" '+(allSel?"checked":"")+' onclick="MPCRM._toggleAllSel(this.checked)"></th>'
      +'<th>Firma</th><th>Branche</th><th>Kontakte</th><th>Offene Deals</th><th>Website</th></tr></thead><tbody>'
      +rows.map(function(c){var nc=db.contacts.filter(function(x){return x.companyId===c.id;}).length;
        var nd=db.deals.filter(function(x){return x.companyId===c.id&&x.stage!=="gewonnen"&&x.stage!=="verloren";}).length;
        return '<tr class="'+(sel.has(c.id)?"selrow":"")+'" onclick="MPCRM._openCompany(\''+c.id+'\')"><td onclick="event.stopPropagation()">'+selCheckbox(c.id)+'</td>'
        +'<td><div class="cellname"><span class="av" style="background:'+avColor(c.name)+';border-radius:9px">'+initials(c.name)+'</span><b>'+esc(c.name)+'</b></div></td>'
        +'<td>'+esc(c.industry||"—")+'</td><td>'+nc+'</td><td>'+nd+'</td>'
        +'<td>'+(c.website?'<a class="link" href="'+esc(/^https?:/.test(c.website)?c.website:"https://"+c.website)+'" target="_blank" onclick="event.stopPropagation()">'+esc(c.website)+'</a>':"—")+'</td></tr>';}).join("")+'</tbody></table>'
    :emptyBox(db.companies.length?"Keine Treffer":"Noch keine Firmen — klicke oben auf „+ Neu“"))+'</div>';
}
function viewDeals(){
  var list=db.deals.filter(function(d){return matchSearch(d.title+" "+companyName(d.companyId)+" "+contactName(d.contactId)+" "+(d.candidate||""));});
  visibleIds=list.map(function(d){return d.id;});
  sel.forEach(function(id){if(!byId(db.deals,id))sel.delete(id);});
  var visS=curStages().filter(function(s){return !hiddenStages.has(s.id);});
  $("#crmContent").innerHTML='<div id="crmBulkbar">'+bulkBar()+'</div>'
    +(hiddenStages.size?'<div style="margin-bottom:12px;font-size:12.5px;color:var(--muted);display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span>Ausgeblendete Spalten:</span>'
      +curStages().filter(function(s){return hiddenStages.has(s.id);}).map(function(s){return '<span onclick="MPCRM._toggleStage(\''+s.id+'\')" style="cursor:pointer;background:#eef1f7;border-radius:20px;padding:3px 11px;font-weight:600;color:var(--ink)"><span class="dot-s" style="background:'+s.color+';margin-right:6px"></span>'+esc(s.name)+' +</span>';}).join("")
      +'<button class="btn sm sec" onclick="MPCRM._showAllStages()">Alle einblenden</button></div>':"")
    +(visS.length?'<div class="board" style="grid-template-columns:repeat('+visS.length+',minmax(180px,1fr))">'+visS.map(function(s){
      var items=list.filter(function(d){return d.stage===s.id;});
      var sum=items.reduce(function(a,d){return a+(+d.value||0);},0);
      return '<div class="col" data-stage="'+s.id+'" ondragover="MPCRM._dragOver(event)" ondragleave="MPCRM._dragLeave(event)" ondrop="MPCRM._dropDeal(event)">'
        +'<h4><span class="dot-s" style="background:'+s.color+'"></span>'+esc(s.name)+'<span class="cnt">'+items.length+'</span><span class="sum">'+eur(sum)+'</span><span onclick="MPCRM._toggleStage(\''+s.id+'\')" style="cursor:pointer;margin-left:8px;color:var(--muted);opacity:.5;font-size:13px">⊘</span></h4>'
        +items.map(function(d){return '<div class="card '+(sel.has(d.id)?"selrow":"")+' '+(d.done?"donecard":"")+'" draggable="true" ondragstart="MPCRM._dragStart(event,\''+d.id+'\')" onclick="MPCRM._openDeal(\''+d.id+'\')">'
          +'<span style="float:right">'+selCheckbox(d.id)+'</span>'
          +'<div class="t">'+esc(d.title)+'</div>'
          +'<div class="v">'+eur(d.value)+' <span class="pill" style="background:'+scoreColor(dealScore(d))+'22;color:'+scoreColor(dealScore(d))+';font-size:11px;margin-left:4px" title="Lead-Score">★ '+dealScore(d)+'</span></div>'
          +'<div class="c">'+esc(companyName(d.companyId)||contactName(d.contactId)||"—")+'</div>'
          +(d.candidate?'<div class="c">👤 '+esc(d.candidate)+'</div>':"")
          +(d.closeDate?'<div class="c">◷ '+new Date(d.closeDate).toLocaleDateString("de-DE")+'</div>':"")
          +(dealHoursSum(d.id)?'<div class="c">⏱ '+dealHoursSum(d.id)+'h erfasst</div>':"")
          +'<div onclick="event.stopPropagation()" style="margin-top:8px;font-size:12px;display:flex;align-items:center;justify-content:space-between;gap:6px">'
          +'<label style="color:'+(d.done?"var(--green)":"var(--muted)")+';font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:5px"><input type="checkbox" style="width:15px;height:15px;accent-color:var(--green);cursor:pointer" '+(d.done?"checked":"")+' onclick="event.stopPropagation();MPCRM._toggleDealDone(\''+d.id+'\',this.checked)"> '+(d.done?tr("c_done")+" ✓":tr("c_done"))+'</label>'
          +'<span onclick="event.stopPropagation();MPCRM._followUp(\''+d.id+'\')" title="Follow-up planen" style="cursor:pointer;color:var(--brand);font-weight:600;white-space:nowrap">↻ Follow-up</span></div>'
          +'<div onclick="event.stopPropagation()" style="margin-top:6px;font-size:12px;text-align:right"><span onclick="event.stopPropagation();MPCRM._timesheet(\''+d.id+'\')" title="Stunden erfassen" style="cursor:pointer;color:var(--brand);font-weight:600;white-space:nowrap">⏱ Stunden</span></div>'
          +'</div>';}).join("")+'</div>';}).join("")+'</div>':'<div class="empty"><div class="big">◆</div>Alle Spalten ausgeblendet.</div>');
}
function actRow(a,selectable){
  var t=ACT_TYPES[a.type]||ACT_TYPES.task, di=daysInfo(a.dueDate);
  var rel=a.contactId?contactName(a.contactId):(a.dealId?(byId(db.deals,a.dealId)||{}).title:"");
  return '<div class="act '+(a.done?"done":"")+' '+(selectable&&sel.has(a.id)?"selrow":"")+'">'
    +(selectable?selCheckbox(a.id,' style="margin-top:2px"'):"")
    +'<input type="checkbox" class="cb" '+(a.done?"checked":"")+' onclick="event.stopPropagation();MPCRM._toggleAct(\''+a.id+'\')">'
    +'<div class="aic" style="background:'+t.c+'1a;color:'+t.c+'">'+t.i+'</div>'
    +'<div class="body" onclick="MPCRM._openActivity(\''+a.id+'\')" style="cursor:pointer"><div class="at">'+esc(a.title)+'</div><div class="am">'+t.l+(rel?" · "+esc(rel):"")+(a.notes?" · "+esc(a.notes):"")+'</div></div>'
    +'<div class="due '+di.cls+'">'+(a.done?"Erledigt":di.txt)+'</div></div>';
}
function viewActivities(){
  var list=db.activities.filter(function(a){return matchSearch(a.title+" "+a.notes+" "+contactName(a.contactId));});
  visibleIds=list.map(function(a){return a.id;});
  sel.forEach(function(id){if(!byId(db.activities,id))sel.delete(id);});
  var open=list.filter(function(a){return !a.done;}).sort(function(a,b){return (a.dueDate||"9").localeCompare(b.dueDate||"9");});
  var done=list.filter(function(a){return a.done;}).sort(function(a,b){return b.createdAt-a.createdAt;});
  $("#crmContent").innerHTML='<div id="crmBulkbar">'+bulkBar()+'</div>'
    +'<div class="panel" style="margin-bottom:20px"><div class="ph"><h3>Offen ('+open.length+')</h3></div>'
    +(open.length?open.map(function(a){return actRow(a,true);}).join(""):emptyBox("Keine offenen Aufgaben"))+'</div>'
    +(done.length?'<div class="panel"><div class="ph"><h3>Erledigt ('+done.length+')</h3></div>'+done.map(function(a){return actRow(a,true);}).join("")+'</div>':"");
}
function toggleAct(id){var a=byId(db.activities,id); a.done=!a.done; scheduleSave(); renderAll();}

/* ---- Drag & Drop ---- */
var dragId=null;
function dragStart(e,id){dragId=id; e.dataTransfer.effectAllowed="move";}
function dragOver(e){e.preventDefault(); e.currentTarget.classList.add("dragover");}
function dragLeave(e){e.currentTarget.classList.remove("dragover");}
function dropDeal(e){e.preventDefault(); e.currentTarget.classList.remove("dragover");
  var d=byId(db.deals,dragId); if(d){d.stage=e.currentTarget.dataset.stage; scheduleSave(); renderAll();} dragId=null;}

/* ---- Modal / Formulare ---- */
function closeModal(){ var ov=$("#crmOverlay"); if(ov)ov.classList.remove("show"); var m=$("#crmModal"); if(m)m.innerHTML=""; }
function openModal(html){ var m=$("#crmModal"); m.innerHTML=html; $("#crmOverlay").classList.add("show"); var f=m.querySelector("input,select,textarea"); if(f)setTimeout(function(){f.focus();},40); }
function companyOptions(sel_){return '<option value="">— keine —</option>'+db.companies.slice().sort(function(a,b){return a.name.localeCompare(b.name);}).map(function(c){return '<option value="'+c.id+'" '+(c.id===sel_?"selected":"")+'>'+esc(c.name)+'</option>';}).join("");}
function contactOptions(sel_){return '<option value="">— keiner —</option>'+db.contacts.slice().sort(function(a,b){return (a.lastName||"").localeCompare(b.lastName||"");}).map(function(c){return '<option value="'+c.id+'" '+(c.id===sel_?"selected":"")+'>'+esc(c.firstName+" "+c.lastName)+'</option>';}).join("");}

function contactForm(c){ c=c||{};
  openModal('<div class="mh"><h3>'+(c.id?"Kontakt bearbeiten":"Neuer Kontakt")+'</h3><button class="x" onclick="MPCRM._close()">×</button></div>'
    +'<div class="mb"><form id="crmForm">'
    +'<div class="row2"><div class="fld"><label>Vorname *</label><input name="firstName" required value="'+esc(c.firstName)+'"></div><div class="fld"><label>Nachname</label><input name="lastName" value="'+esc(c.lastName)+'"></div></div>'
    +'<div class="row2"><div class="fld"><label>Titel</label><input name="title" value="'+esc(c.title)+'" placeholder="z. B. Dr."></div><div class="fld"><label>Letzter Kontakt</label><input name="lastContact" type="date" value="'+esc(c.lastContact)+'"></div></div>'
    +'<div class="row2"><div class="fld"><label>Firma</label><select name="companyId">'+companyOptions(c.companyId)+'</select></div><div class="fld"><label>Position</label><input name="position" value="'+esc(c.position)+'"></div></div>'
    +'<div class="row2"><div class="fld"><label>E-Mail</label><input name="email" type="email" value="'+esc(c.email)+'"></div><div class="fld"><label>Telefon</label><input name="phone" value="'+esc(c.phone)+'"></div></div>'
    +'<div class="fld"><label>Tags (mit Komma trennen)</label><input name="tags" value="'+esc((c.tags||[]).join(", "))+'"></div>'
    +'<div class="fld"><label>Notizen</label><textarea name="notes">'+esc(c.notes)+'</textarea></div></form></div>'
    +'<div class="mf">'+(c.id?'<button class="btn danger" onclick="MPCRM._delContact(\''+c.id+'\')">Löschen</button>':"")
    +'<button class="btn sec" onclick="MPCRM._close()">Abbrechen</button><button class="btn" onclick="MPCRM._saveContact(\''+(c.id||"")+'\')">Speichern</button></div>');
}
function saveContact(id){
  var f=$("#crmForm"); var d=Object.fromEntries(new FormData(f));
  d.tags=d.tags.split(",").map(function(t){return t.trim();}).filter(Boolean);
  if(id){Object.assign(byId(db.contacts,id),d);}else{db.contacts.push(Object.assign({id:uid(),createdAt:Date.now()},d));}
  scheduleSave(); closeModal(); renderAll(); toast("Kontakt gespeichert");
}
function delContact(id){ if(!confirm("Diesen Kontakt löschen?"))return; db.contacts=db.contacts.filter(function(c){return c.id!==id;}); scheduleSave(); closeModal(); renderAll(); toast("Gelöscht"); }
function openContact(id){
  var c=byId(db.contacts,id); var deals=db.deals.filter(function(d){return d.contactId===id;}); var acts=db.activities.filter(function(a){return a.contactId===id;});
  openModal('<div class="mh"><h3>'+esc(c.firstName)+' '+esc(c.lastName)+'</h3><button class="x" onclick="MPCRM._close()">×</button></div>'
    +'<div class="mb"><div class="cellname" style="margin-bottom:14px"><span class="av" style="background:'+avColor(c.firstName+c.lastName)+';width:44px;height:44px;font-size:16px">'+initials(c.firstName+" "+c.lastName)+'</span><div><b style="font-size:16px">'+esc(c.firstName)+' '+esc(c.lastName)+'</b><div class="muted">'+esc(c.position||"")+(c.position&&c.companyId?" · ":"")+esc(companyName(c.companyId))+'</div></div></div>'
    +'<div class="kv"><div class="k">E-Mail</div><div class="v">'+(c.email?'<a class="link" href="mailto:'+esc(c.email)+'">'+esc(c.email)+'</a>':"—")+'</div></div>'
    +'<div class="kv"><div class="k">Telefon</div><div class="v">'+esc(c.phone||"—")+'</div></div>'
    +'<div class="kv"><div class="k">Titel</div><div class="v">'+esc(c.title||"—")+'</div></div>'
    +'<div class="kv"><div class="k">Tags</div><div class="v">'+((c.tags||[]).map(function(t){return '<span class="tag">'+esc(t)+'</span>';}).join("")||"—")+'</div></div>'
    +(c.notes?'<div class="detail-sec"><h4>Notizen</h4><div>'+esc(c.notes)+'</div></div>':"")
    +(deals.length?'<div class="detail-sec"><h4>Deals</h4>'+deals.map(function(d){return '<div class="kv"><div class="v">'+esc(d.title)+'</div><div class="right"><span class="pill" style="background:'+stageOf(d.stage).color+'22;color:'+stageOf(d.stage).color+'">'+esc(stageOf(d.stage).name)+'</span> <b>'+eur(d.value)+'</b></div></div>';}).join("")+'</div>':"")
    +'</div><div class="mf"><button class="btn sec" onclick="MPCRM._close()">Schließen</button><button class="btn" onclick="MPCRM._contactForm(\''+c.id+'\')">Bearbeiten</button></div>');
}

function companyForm(c){ c=c||{};
  openModal('<div class="mh"><h3>'+(c.id?"Firma bearbeiten":"Neue Firma")+'</h3><button class="x" onclick="MPCRM._close()">×</button></div>'
    +'<div class="mb"><form id="crmForm">'
    +'<div class="fld"><label>Firmenname *</label><input name="name" required value="'+esc(c.name)+'"></div>'
    +'<div class="row2"><div class="fld"><label>Branche</label><input name="industry" value="'+esc(c.industry)+'"></div><div class="fld"><label>Website</label><input name="website" value="'+esc(c.website)+'"></div></div>'
    +'<div class="row2"><div class="fld"><label>Telefon</label><input name="phone" value="'+esc(c.phone)+'"></div><div class="fld"><label>Adresse</label><input name="address" value="'+esc(c.address)+'"></div></div>'
    +'<div class="fld"><label>Notizen</label><textarea name="notes">'+esc(c.notes)+'</textarea></div></form></div>'
    +'<div class="mf">'+(c.id?'<button class="btn danger" onclick="MPCRM._delCompany(\''+c.id+'\')">Löschen</button>':"")
    +'<button class="btn sec" onclick="MPCRM._close()">Abbrechen</button><button class="btn" onclick="MPCRM._saveCompany(\''+(c.id||"")+'\')">Speichern</button></div>');
}
function saveCompany(id){
  var f=$("#crmForm"); var d=Object.fromEntries(new FormData(f));
  if(id){Object.assign(byId(db.companies,id),d);}else{db.companies.push(Object.assign({id:uid(),createdAt:Date.now()},d));}
  scheduleSave(); closeModal(); renderAll(); toast("Firma gespeichert");
}
function delCompany(id){ if(!confirm("Diese Firma löschen? Verknüpfte Kontakte/Deals bleiben erhalten."))return; db.companies=db.companies.filter(function(c){return c.id!==id;}); scheduleSave(); closeModal(); renderAll(); toast("Gelöscht"); }
function openCompany(id){
  var c=byId(db.companies,id); var cts=db.contacts.filter(function(x){return x.companyId===id;}); var deals=db.deals.filter(function(d){return d.companyId===id;});
  openModal('<div class="mh"><h3>'+esc(c.name)+'</h3><button class="x" onclick="MPCRM._close()">×</button></div>'
    +'<div class="mb"><div class="kv"><div class="k">Branche</div><div class="v">'+esc(c.industry||"—")+'</div></div>'
    +'<div class="kv"><div class="k">Website</div><div class="v">'+(c.website?'<a class="link" target="_blank" href="'+esc(/^https?:/.test(c.website)?c.website:"https://"+c.website)+'">'+esc(c.website)+'</a>':"—")+'</div></div>'
    +'<div class="kv"><div class="k">Telefon</div><div class="v">'+esc(c.phone||"—")+'</div></div>'
    +'<div class="kv"><div class="k">Adresse</div><div class="v">'+esc(c.address||"—")+'</div></div>'
    +(c.notes?'<div class="detail-sec"><h4>Notizen</h4><div>'+esc(c.notes)+'</div></div>':"")
    +(cts.length?'<div class="detail-sec"><h4>Kontakte ('+cts.length+')</h4>'+cts.map(function(x){return '<div class="kv"><div class="v">'+esc(x.firstName)+' '+esc(x.lastName)+'</div><div class="muted">'+esc(x.position||"")+'</div></div>';}).join("")+'</div>':"")
    +(deals.length?'<div class="detail-sec"><h4>Deals ('+deals.length+')</h4>'+deals.map(function(d){return '<div class="kv"><div class="v">'+esc(d.title)+'</div><div class="right"><span class="pill" style="background:'+stageOf(d.stage).color+'22;color:'+stageOf(d.stage).color+'">'+esc(stageOf(d.stage).name)+'</span> <b>'+eur(d.value)+'</b></div></div>';}).join("")+'</div>':"")
    +'</div><div class="mf"><button class="btn sec" onclick="MPCRM._close()">Schließen</button><button class="btn" onclick="MPCRM._companyForm(\''+c.id+'\')">Bearbeiten</button></div>');
}

function dealForm(d){ d=d||{};
  openModal('<div class="mh"><h3>'+(d.id?"Deal bearbeiten":"Neuer Deal")+'</h3><button class="x" onclick="MPCRM._close()">×</button></div>'
    +'<div class="mb"><form id="crmForm">'
    +'<div class="fld"><label>Titel *</label><input name="title" required value="'+esc(d.title)+'"></div>'
    +'<div class="row2"><div class="fld"><label>Wert (€)</label><input name="value" type="number" min="0" step="100" value="'+esc(d.value)+'"></div><div class="fld"><label>Phase</label><select name="stage">'+curStages().map(function(s){return '<option value="'+s.id+'" '+(s.id===(d.stage||"lead")?"selected":"")+'>'+esc(s.name)+'</option>';}).join("")+'</select></div></div>'
    +'<div class="row2"><div class="fld"><label>Firma</label><select name="companyId">'+companyOptions(d.companyId)+'</select></div><div class="fld"><label>Ansprechpartner</label><select name="contactId">'+contactOptions(d.contactId)+'</select></div></div>'
    +'<div class="row2"><div class="fld"><label>Kandidat</label><input name="candidate" value="'+esc(d.candidate)+'" placeholder="Name des Kandidaten/Beraters"></div><div class="fld"><label>Abschlussdatum</label><input name="closeDate" type="date" value="'+esc(d.closeDate)+'"></div></div>'
    +'<div class="fld"><label style="display:flex;align-items:center;gap:9px;cursor:pointer;font-weight:600"><input type="checkbox" name="done" '+(d.done?"checked":"")+' style="width:17px;height:17px;accent-color:var(--green)"> Als erledigt markieren</label></div>'
    +'<div class="fld"><label>Notizen</label><textarea name="notes">'+esc(d.notes)+'</textarea></div></form></div>'
    +'<div class="mf">'+(d.id?'<button class="btn danger" onclick="MPCRM._delDeal(\''+d.id+'\')">Löschen</button><button class="btn sec" onclick="MPCRM._followUp(\''+d.id+'\')">↻ Follow-up</button>':"")
    +'<button class="btn sec" onclick="MPCRM._close()">Abbrechen</button><button class="btn" onclick="MPCRM._saveDeal(\''+(d.id||"")+'\')">Speichern</button></div>');
}
function saveDeal(id){
  var f=$("#crmForm"); var d=Object.fromEntries(new FormData(f)); d.value=+d.value||0; d.done=f.elements.done.checked;
  if(id){Object.assign(byId(db.deals,id),d);}else{db.deals.push(Object.assign({id:uid(),createdAt:Date.now()},d));}
  scheduleSave(); closeModal(); renderAll(); toast("Deal gespeichert");
}
function delDeal(id){ if(!confirm("Diesen Deal löschen?"))return; db.deals=db.deals.filter(function(d){return d.id!==id;}); scheduleSave(); closeModal(); renderAll(); toast("Gelöscht"); }
function openDeal(id){dealForm(byId(db.deals,id));}

function activityForm(a){ a=a||{};
  openModal('<div class="mh"><h3>'+(a.id?"Aktivität bearbeiten":"Neue Aktivität")+'</h3><button class="x" onclick="MPCRM._close()">×</button></div>'
    +'<div class="mb"><form id="crmForm">'
    +'<div class="fld"><label>Titel *</label><input name="title" required value="'+esc(a.title)+'"></div>'
    +'<div class="row2"><div class="fld"><label>Typ</label><select name="type">'+Object.keys(ACT_TYPES).map(function(k){return '<option value="'+k+'" '+(k===(a.type||"task")?"selected":"")+'>'+ACT_TYPES[k].i+' '+ACT_TYPES[k].l+'</option>';}).join("")+'</select></div>'
    +'<div class="fld"><label>Fällig am</label><input name="dueDate" type="date" value="'+esc(a.dueDate)+'"></div></div>'
    +'<div class="row2"><div class="fld"><label>Kontakt</label><select name="contactId">'+contactOptions(a.contactId)+'</select></div>'
    +'<div class="fld"><label>Deal</label><select name="dealId"><option value="">— keiner —</option>'+db.deals.map(function(d){return '<option value="'+d.id+'" '+(d.id===a.dealId?"selected":"")+'>'+esc(d.title)+'</option>';}).join("")+'</select></div></div>'
    +'<div class="fld"><label>Notizen</label><textarea name="notes">'+esc(a.notes)+'</textarea></div></form></div>'
    +'<div class="mf">'+(a.id?'<button class="btn danger" onclick="MPCRM._delActivity(\''+a.id+'\')">Löschen</button>':"")
    +'<button class="btn sec" onclick="MPCRM._close()">Abbrechen</button><button class="btn" onclick="MPCRM._saveActivity(\''+(a.id||"")+'\')">Speichern</button></div>');
}
function saveActivity(id){
  var f=$("#crmForm"); var d=Object.fromEntries(new FormData(f));
  if(id){Object.assign(byId(db.activities,id),d);}else{db.activities.push(Object.assign({id:uid(),createdAt:Date.now(),done:false},d));}
  scheduleSave(); closeModal(); renderAll(); toast("Aktivität gespeichert");
}
function delActivity(id){ if(!confirm("Diese Aktivität löschen?"))return; db.activities=db.activities.filter(function(a){return a.id!==id;}); scheduleSave(); closeModal(); renderAll(); toast("Gelöscht"); }
function openActivity(id){activityForm(byId(db.activities,id));}

/* ============================ CSV/XLSX Parser ============================ */
function detectDelim(txt){var head=txt.split(/\r?\n/)[0]||"";
  var counts={",":(head.match(/,/g)||[]).length,";":(head.match(/;/g)||[]).length,"\t":(head.match(/\t/g)||[]).length};
  return Object.entries(counts).sort(function(a,b){return b[1]-a[1];})[0][0];}
function parseCSV(txt,delim){
  txt=txt.replace(/^﻿/,""); delim=delim||detectDelim(txt);
  var rows=[],row=[],val="",q=false;
  for(var i=0;i<txt.length;i++){var c=txt[i];
    if(q){if(c==='"'){if(txt[i+1]==='"'){val+='"';i++;}else q=false;}else val+=c;}
    else{if(c==='"')q=true; else if(c===delim){row.push(val);val="";} else if(c==="\n"){row.push(val);rows.push(row);row=[];val="";} else if(c==="\r"){} else val+=c;}}
  if(val!==""||row.length){row.push(val);rows.push(row);}
  return rows.filter(function(r){return r.some(function(x){return x.trim()!=="";});});
}
async function inflateRaw(bytes){ var ds=new DecompressionStream("deflate-raw"); var s=new Response(new Blob([bytes]).stream().pipeThrough(ds)); return new Uint8Array(await s.arrayBuffer()); }
async function readXlsx(buf){
  var dv=new DataView(buf),u8=new Uint8Array(buf);
  var eo=-1; for(var i=u8.length-22;i>=0;i--){if(dv.getUint32(i,true)===0x06054b50){eo=i;break;}}
  if(eo<0)throw new Error("Keine gültige xlsx-Datei");
  var cdCount=dv.getUint16(eo+10,true),cdOff=dv.getUint32(eo+16,true);
  var dec=new TextDecoder(),files={},p=cdOff,entries=[];
  for(var n=0;n<cdCount;n++){
    if(dv.getUint32(p,true)!==0x02014b50)break;
    var method=dv.getUint16(p+10,true),csize=dv.getUint32(p+20,true);
    var fnLen=dv.getUint16(p+28,true),exLen=dv.getUint16(p+30,true),cmLen=dv.getUint16(p+32,true);
    var lho=dv.getUint32(p+42,true);
    var name=dec.decode(u8.subarray(p+46,p+46+fnLen));
    entries.push({name:name,method:method,csize:csize,lho:lho}); p+=46+fnLen+exLen+cmLen;
  }
  async function extract(e){
    var lfnLen=dv.getUint16(e.lho+26,true),lexLen=dv.getUint16(e.lho+28,true);
    var start=e.lho+30+lfnLen+lexLen,raw=u8.subarray(start,start+e.csize);
    var bytes=e.method===0?raw:await inflateRaw(raw); return dec.decode(bytes);
  }
  function want(e){return e.name==="xl/sharedStrings.xml"||/^xl\/worksheets\/sheet/.test(e.name);}
  for(var j=0;j<entries.length;j++){if(want(entries[j]))files[entries[j].name]=await extract(entries[j]);}
  var shared=[]; var ss=files["xl/sharedStrings.xml"];
  if(ss){var m1; var re1=/<si>([\s\S]*?)<\/si>/g;
    while((m1=re1.exec(ss))){var t="";var re2=/<t[^>]*>([\s\S]*?)<\/t>/g,m2; while((m2=re2.exec(m1[1])))t+=m2[1]; shared.push(unxml(t));}}
  var sheetName=Object.keys(files).filter(function(k){return /^xl\/worksheets\/sheet/.test(k);}).sort()[0];
  var xml=files[sheetName]||"",rows=[];
  var rm,reRow=/<row[^>]*>([\s\S]*?)<\/row>/g;
  while((rm=reRow.exec(xml))){
    var cells=[]; var cm,reCell=/<c\s+r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g;
    while((cm=reCell.exec(rm[1]))){
      var col=colIdx(cm[1]),attr=cm[2],inner=cm[3],v="",isStr=/t="s"/.test(attr);
      var vm=inner.match(/<v>([\s\S]*?)<\/v>/); var im=inner.match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/);
      if(im)v=unxml(im[1]); else if(vm)v=isStr?(shared[+vm[1]]!=null?shared[+vm[1]]:""):unxml(vm[1]);
      cells[col]=v;
    }
    for(var k=0;k<cells.length;k++)if(cells[k]==null)cells[k]="";
    rows.push(cells);
  }
  return rows.filter(function(r){return r.some(function(x){return (x||"").trim()!=="";});});
}
function colIdx(a){var n=0; for(var i=0;i<a.length;i++)n=n*26+(a.charCodeAt(i)-64); return n-1;}
function unxml(s){return s.replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#(\d+);/g,function(_,d){return String.fromCharCode(+d);}).replace(/&amp;/g,"&");}

/* ============================ Excel-Pipeline-Sync (pipeline_1.xlsx) ============================ */
var PIPE_TITLE2STAGE={"anfragen":"lead","interviews":"angebot","nach interview no":"verloren","nach interview yes":"verhandlung","aktive projekte":"gewonnen"};
function pipeNorm(s){return (""+(s==null?"":s)).toLowerCase().replace(/\s+/g," ").trim();}
function pipeNum(v){v=(""+(v==null?"":v)).replace(/[^\d.,-]/g,"").replace(/\.(?=\d{3}(\D|$))/g,"").replace(",","."); var n=parseFloat(v); return isNaN(n)?0:n;}
function pipeDate(v){v=(""+(v==null?"":v)).trim(); if(/^\d{4,5}$/.test(v)){var d=new Date(Date.UTC(1899,11,30+ +v)); return d.toISOString().slice(0,10);} if(/^\d{4}-\d{2}-\d{2}/.test(v))return v.slice(0,10); return "";}
function pipeTitle(modul,berater,kunde){var l=[modul,berater].filter(Boolean).join(" – "); return (l?l+" @ ":"")+(kunde||"?");}
async function readXlsxAllSheets(buf){
  var dv=new DataView(buf),u8=new Uint8Array(buf),dec=new TextDecoder();
  var eo=-1; for(var i=u8.length-22;i>=0;i--){if(dv.getUint32(i,true)===0x06054b50){eo=i;break;}}
  if(eo<0)throw new Error("Keine gueltige xlsx-Datei");
  var cdCount=dv.getUint16(eo+10,true),cdOff=dv.getUint32(eo+16,true),entries=[],p=cdOff;
  for(var n=0;n<cdCount;n++){ if(dv.getUint32(p,true)!==0x02014b50)break;
    var method=dv.getUint16(p+10,true),csize=dv.getUint32(p+20,true),fnLen=dv.getUint16(p+28,true),exLen=dv.getUint16(p+30,true),cmLen=dv.getUint16(p+32,true),lho=dv.getUint32(p+42,true);
    entries.push({name:dec.decode(u8.subarray(p+46,p+46+fnLen)),method:method,csize:csize,lho:lho}); p+=46+fnLen+exLen+cmLen; }
  var files={};
  for(var j=0;j<entries.length;j++){var e=entries[j]; if(e.name==="xl/sharedStrings.xml"||/^xl\/worksheets\/sheet/.test(e.name)){
    var lfn=dv.getUint16(e.lho+26,true),lex=dv.getUint16(e.lho+28,true),st=e.lho+30+lfn+lex,raw=u8.subarray(st,st+e.csize);
    var bytes=e.method===0?raw:await inflateRaw(raw); files[e.name]=dec.decode(bytes); } }
  var shared=[]; var ss=files["xl/sharedStrings.xml"];
  if(ss){var m1,re1=/<si>([\s\S]*?)<\/si>/g; while((m1=re1.exec(ss))){var t="";var m2,re2=/<t[^>]*>([\s\S]*?)<\/t>/g; while((m2=re2.exec(m1[1])))t+=m2[1]; shared.push(unxml(t));}}
  var sheetNames=Object.keys(files).filter(function(k){return /^xl\/worksheets\/sheet/.test(k);}).sort(function(a,b){return a.localeCompare(b,undefined,{numeric:true});});
  var sheets=[];
  for(var s=0;s<sheetNames.length;s++){
    var xml=files[sheetNames[s]]||"",rows=[];
    var rm,reRow=/<row[^>]*>([\s\S]*?)<\/row>/g;
    while((rm=reRow.exec(xml))){ var cells=[]; var cm,reCell=/<c\s+r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g;
      while((cm=reCell.exec(rm[1]))){ var col=colIdx(cm[1]),attr=cm[2],inner=cm[3],v="",isStr=/t="s"/.test(attr);
        var vm=inner.match(/<v>([\s\S]*?)<\/v>/),im=inner.match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/);
        if(im)v=unxml(im[1]); else if(vm)v=isStr?(shared[+vm[1]]!=null?shared[+vm[1]]:""):unxml(vm[1]); cells[col]=v; }
      for(var k=0;k<cells.length;k++)if(cells[k]==null)cells[k]=""; rows.push(cells); }
    sheets.push(rows);
  }
  return sheets;
}
function pipelineRows(sheets){
  var out=[];
  sheets.forEach(function(rows){ var title=pipeNorm((rows[0]&&rows[0][0])||""); var stage=PIPE_TITLE2STAGE[title]; if(!stage)return;
    var hdr=false;
    rows.forEach(function(r){ var kunde=(r[1]||"").trim();
      if(!hdr){ if(pipeNorm(kunde).indexOf("kunde")>=0)hdr=true; return; }
      var kn=pipeNorm(kunde); if(!kunde||kn==="summe gesamt"||kn==="mittelwert")return;
      var modul=(r[4]||"").trim(),berater=(r[5]||"").trim();
      out.push({stage:stage,kunde:kunde,kontakt:(r[2]||"").trim(),vorgestellt:pipeDate(r[3]),modul:modul,berater:berater,rateTag:pipeNum(r[6]),rateHrs:pipeNum(r[7]),title:pipeTitle(modul,berater,kunde)});
    });
  });
  return out;
}
function pipelineCompare(rows){
  var byTitle=new Map(); db.deals.forEach(function(d){var k=pipeNorm(d.title); if(!byTitle.has(k))byTitle.set(k,d);});
  var toAdd=[],toUpdate=[],seen=new Set();
  rows.forEach(function(pr){ var k=pipeNorm(pr.title); seen.add(k); var d=byTitle.get(k);
    if(!d){toAdd.push(pr);return;}
    var ch={};
    if(d.stage!==pr.stage)ch.Phase=[d.stage,pr.stage];
    if(Math.round(+d.value||0)!==Math.round(pr.rateTag||0))ch["Rate/Tag"]=[d.value,pr.rateTag];
    if((d.closeDate||"")!==(pr.vorgestellt||""))ch.Datum=[d.closeDate,pr.vorgestellt];
    if(Object.keys(ch).length)toUpdate.push({deal:d,ch:ch});
  });
  var onlyCrm=db.deals.filter(function(d){return !seen.has(pipeNorm(d.title));});
  return {toAdd:toAdd,toUpdate:toUpdate,onlyCrm:onlyCrm};
}
function pipeStageName(id){var s=DEFAULT_STAGES.find(function(x){return x.id===id;}); return s?s.name:id;}
async function pipelineSyncOpen(){
  var cur=store&&store.projects.find(function(p){return p.id===store.current;});
  if(!cur||pipeNorm(cur.name)!=="sap"){ alert("Der Excel-Sync gilt für das Projekt „SAP“. Bitte oben links zu SAP wechseln."); return; }
  if(!window.showOpenFilePicker){ alert("Der Excel-Sync braucht Chrome oder Edge (Dateizugriff)."); return; }
  var h=await idbGet("crmPipelineHandle");
  openModal('<div class="mh"><h3>🔄 Excel-Sync — pipeline_1.xlsx</h3><button class="x" onclick="MPCRM._close()">×</button></div>'
    +'<div class="mb"><p class="muted" style="margin-top:0">Gleicht deine SAP-Pipeline-Excel mit dem CRM ab. <b>Stufe A</b>: liest die Excel, deine Datei wird dabei <b>nicht</b> verändert.</p>'
    +'<div id="crmPipeStep">'+(h?'<button class="btn" onclick="MPCRM._pipeRun()">🔍 Excel → CRM</button> <button class="btn sec" onclick="MPCRM._pipeWriteOpen()">📤 CRM → Excel</button><div class="muted" style="margin-top:6px">Datei verbunden.</div>':'<button class="btn" onclick="MPCRM._pipeConnect()">📄 pipeline_1.xlsx verbinden</button>')+'</div></div>');
}
async function pipelineConnect(){
  try{ var picked=await window.showOpenFilePicker({types:[{description:"Excel",accept:{"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":[".xlsx"]}}]});
    await idbSet("crmPipelineHandle",picked[0]); pipelineRun();
  }catch(e){ if(e.name!=="AbortError")alert("Fehler: "+e.message); }
}
async function pipelineRun(){
  try{ var h=await idbGet("crmPipelineHandle"); if(!h){pipelineConnect();return;}
    if(h.queryPermission&&(await h.queryPermission({mode:"read"}))!=="granted"){ if((await h.requestPermission({mode:"read"}))!=="granted"){alert("Kein Lesezugriff auf die Datei.");return;} }
    var step=$("#crmPipeStep"); if(step)step.innerHTML='<span class="muted">Lese Excel…</span>';
    var file=await h.getFile(); var sheets=await readXlsxAllSheets(await file.arrayBuffer());
    var rows=pipelineRows(sheets); var diff=pipelineCompare(rows); window._crmPsync=diff; pipelinePreview(diff,rows.length);
  }catch(e){ var step=$("#crmPipeStep"); if(step)step.innerHTML='<span style="color:var(--red)">Fehler: '+esc(e.message)+'</span>'; }
}
function pipelinePreview(diff,total){
  var add=diff.toAdd.length?diff.toAdd.map(function(p){return '<tr><td>'+esc(p.title)+'</td><td>'+esc(pipeStageName(p.stage))+'</td><td class="right">'+(p.rateTag?eur(p.rateTag):"")+'</td></tr>';}).join(""):'<tr><td colspan="3" class="muted">—</td></tr>';
  var upd=diff.toUpdate.length?diff.toUpdate.map(function(u){return '<tr><td>'+esc(u.deal.title)+'</td><td>'+Object.keys(u.ch).map(function(k){return k+": "+esc(k==="Phase"?pipeStageName(u.ch[k][0]):(""+u.ch[k][0]||"—"))+" → "+esc(k==="Phase"?pipeStageName(u.ch[k][1]):(""+u.ch[k][1]||"—"));}).join("<br>")+'</td></tr>';}).join(""):'<tr><td colspan="2" class="muted">—</td></tr>';
  var step=$("#crmPipeStep"); if(!step)return;
  step.innerHTML='<div style="margin-bottom:8px">Excel gelesen: <b>'+total+'</b> Zeilen · <span style="color:#1eae6b">'+diff.toAdd.length+' neu</span> · <span style="color:#e6a417">'+diff.toUpdate.length+' geändert</span> · <span class="muted">'+diff.onlyCrm.length+' nur im CRM (bleiben)</span></div>'
    +'<div style="max-height:230px;overflow:auto;border:1px solid var(--line);border-radius:8px;padding:8px;margin-bottom:10px"><b style="color:#1eae6b">Neu ins CRM ('+diff.toAdd.length+')</b><table style="width:100%;font-size:12.5px"><tbody>'+add+'</tbody></table>'
    +'<b style="color:#e6a417;display:block;margin-top:10px">Geändert ('+diff.toUpdate.length+')</b><table style="width:100%;font-size:12.5px"><tbody>'+upd+'</tbody></table></div>'
    +((diff.toAdd.length||diff.toUpdate.length)?'<button class="btn" onclick="MPCRM._pipeApply()">✔ Ins CRM übernehmen</button> ':'<span class="muted">Nichts zu übernehmen — CRM ist auf Stand. </span>')
    +'<button class="btn sec" onclick="MPCRM._close()">Schließen</button>';
}
function pipelineApply(){
  var diff=window._crmPsync; if(!diff)return; var nAdd=0,nUpd=0;
  diff.toAdd.forEach(function(pr){ var cid=findOrCreateCompany(pr.kunde); var ctid="";
    if(pr.kontakt&&pr.kontakt.indexOf(" ")>0){ var ex=db.contacts.find(function(x){return x.companyId===cid&&pipeNorm(contactName(x.id))===pipeNorm(pr.kontakt);});
      if(ex)ctid=ex.id; else{ var parts=pr.kontakt.split(/\s+/); var c={id:uid(),createdAt:Date.now(),firstName:parts[0],lastName:parts.slice(1).join(" "),companyId:cid,position:"",title:"",lastContact:"",email:"",phone:"",tags:["Pipeline"],notes:""}; db.contacts.push(c); ctid=c.id; } }
    db.deals.push({id:uid(),createdAt:Date.now(),title:pr.title,value:pr.rateTag,stage:pr.stage,companyId:cid,contactId:ctid,closeDate:pr.vorgestellt||"",done:false,candidate:pr.berater||"",notes:pr.rateHrs?("Rate/Std: "+pr.rateHrs):""}); nAdd++; });
  diff.toUpdate.forEach(function(u){ var d=u.deal; if(u.ch.Phase)d.stage=u.ch.Phase[1]; if(u.ch["Rate/Tag"])d.value=u.ch["Rate/Tag"][1]; if(u.ch.Datum)d.closeDate=u.ch.Datum[1]; nUpd++; });
  window._crmPsync=null; scheduleSave(); closeModal(); state.view="deals"; sel.clear(); state.search=""; renderAll();
  toast("Excel → CRM: "+nAdd+" neu, "+nUpd+" aktualisiert");
}
var _crcTab=(function(){var t=new Uint32Array(256); for(var n=0;n<256;n++){var c=n; for(var k=0;k<8;k++)c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1); t[n]=c>>>0;} return t;})();
function crc32(u8){var c=0xFFFFFFFF; for(var i=0;i<u8.length;i++)c=_crcTab[(c^u8[i])&0xFF]^(c>>>8); return (c^0xFFFFFFFF)>>>0;}
async function deflateRaw(u8){var cs=new CompressionStream("deflate-raw"); var s=new Response(new Blob([u8]).stream().pipeThrough(cs)); return new Uint8Array(await s.arrayBuffer());}
function parseZipEntries(u8){
  var dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength);
  var eo=-1; for(var i=u8.length-22;i>=0;i--){if(dv.getUint32(i,true)===0x06054b50){eo=i;break;}}
  if(eo<0)throw new Error("EOCD nicht gefunden");
  var cdCount=dv.getUint16(eo+10,true),cdOff=dv.getUint32(eo+16,true),dec=new TextDecoder(),p=cdOff,items=[];
  for(var n=0;n<cdCount;n++){ if(dv.getUint32(p,true)!==0x02014b50)break;
    var method=dv.getUint16(p+10,true),crc=dv.getUint32(p+16,true),csize=dv.getUint32(p+20,true),usize=dv.getUint32(p+24,true),fnLen=dv.getUint16(p+28,true),exLen=dv.getUint16(p+30,true),cmLen=dv.getUint16(p+32,true),lho=dv.getUint32(p+42,true);
    var name=dec.decode(u8.subarray(p+46,p+46+fnLen)); var lfn=dv.getUint16(lho+26,true),lex=dv.getUint16(lho+28,true),ds=lho+30+lfn+lex;
    items.push({name:name,method:method,crc:crc,csize:csize,usize:usize,comp:u8.subarray(ds,ds+csize)}); p+=46+fnLen+exLen+cmLen; }
  return items;
}
async function buildXlsx(origU8,replace){
  var items=parseZipEntries(origU8),enc=new TextEncoder();
  for(var x=0;x<items.length;x++){ var it=items[x]; if(replace[it.name]){ var u=replace[it.name],def=await deflateRaw(u); it.method=8;it.crc=crc32(u);it.usize=u.length;it.csize=def.length;it.comp=def; } }
  var parts=[],central=[],offset=0;
  items.forEach(function(it){ var nb=enc.encode(it.name);
    var lh=new Uint8Array(30+nb.length),l=new DataView(lh.buffer);
    l.setUint32(0,0x04034b50,true);l.setUint16(4,20,true);l.setUint16(8,it.method,true);l.setUint32(14,it.crc,true);l.setUint32(18,it.csize,true);l.setUint32(22,it.usize,true);l.setUint16(26,nb.length,true);lh.set(nb,30);
    parts.push(lh,it.comp);
    var ch=new Uint8Array(46+nb.length),c=new DataView(ch.buffer);
    c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(10,it.method,true);c.setUint32(16,it.crc,true);c.setUint32(20,it.csize,true);c.setUint32(24,it.usize,true);c.setUint16(28,nb.length,true);c.setUint32(42,offset,true);ch.set(nb,46);
    central.push(ch); offset+=lh.length+it.comp.length; });
  var cdLen=0; central.forEach(function(c){cdLen+=c.length;});
  var eocd=new Uint8Array(22),e=new DataView(eocd.buffer);
  e.setUint32(0,0x06054b50,true);e.setUint16(8,items.length,true);e.setUint16(10,items.length,true);e.setUint32(12,cdLen,true);e.setUint32(16,offset,true);
  var out=new Uint8Array(offset+cdLen+22),q=0;
  parts.forEach(function(pt){out.set(pt,q);q+=pt.length;}); central.forEach(function(c){out.set(c,q);q+=c.length;}); out.set(eocd,q);
  return out;
}
function xmlEsc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function xCellT(ref,s,t){t=(t==null?"":String(t));return t?'<c r="'+ref+'" s="'+s+'" t="inlineStr"><is><t>'+xmlEsc(t)+'</t></is></c>':'<c r="'+ref+'" s="'+s+'" t="n" />';}
function xCellN(ref,s,n){return (n==null||n==="")?'<c r="'+ref+'" s="'+s+'" t="n" />':'<c r="'+ref+'" s="'+s+'" t="n"><v>'+n+'</v></c>';}
function xlsxSheetRewrite(xml,deals){
  var st={A:4,B:5,C:5,D:6,E:4,F:4,G:7,H:7};
  var r6=xml.match(/<row r="6"[^>]*>([\s\S]*?)<\/row>/);
  if(r6)Object.keys(st).forEach(function(col){var cm=r6[1].match(new RegExp('<c r="'+col+'6" s="(\\d+)"')); if(cm)st[col]=+cm[1];});
  var rows="";
  deals.forEach(function(d,i){var r=6+i;
    rows+='<row r="'+r+'" ht="15" customHeight="1">'+xCellN("A"+r,st.A,i+1)+xCellT("B"+r,st.B,d.kunde)+xCellT("C"+r,st.C,d.kontakt)+xCellN("D"+r,st.D,d.serial)+xCellT("E"+r,st.E,d.modul)+xCellT("F"+r,st.F,d.berater)+xCellN("G"+r,st.G,d.rateTag)+xCellN("H"+r,st.H,d.rateHrs)+'</row>';});
  var last=Math.max(30,5+deals.length);
  var out=xml.replace(/(<row r="5"[^>]*>[\s\S]*?<\/row>)([\s\S]*?)(<\/sheetData>)/,function(m,a,b,c){return a+rows+c;});
  out=out.split("G6:G30").join("G6:G"+last).split("H6:H30").join("H6:H"+last).split("A1:H30").join("A1:H"+last);
  return out;
}
function isoToSerial(iso){if(!iso)return ""; var d=new Date(iso+"T00:00:00Z"); if(isNaN(d.getTime()))return ""; return Math.round((d.getTime()-Date.UTC(1899,11,30))/86400000);}
function dealToRow(d){
  var kunde=companyName(d.companyId); if(!kunde){var m=(d.title||"").match(/@ (.+)$/); kunde=m?m[1].trim():(d.title||"");}
  var kontakt=contactName(d.contactId)||"";
  var modul="",berater=""; var m2=(d.title||"").match(/^(.*?) – (.*?) @ /); if(m2){modul=m2[1];berater=m2[2];}
  var rt=+d.value||0;
  return {kunde:kunde,kontakt:kontakt,serial:isoToSerial(d.closeDate),modul:modul,berater:berater,rateTag:rt||"",rateHrs:rt?Math.round(rt/8*100)/100:""};
}
function pipeGroupDeals(){var g={}; db.deals.forEach(function(d){(g[d.stage]=g[d.stage]||[]).push(dealToRow(d));}); return g;}
function pipeDownload(u8,name){var b=new Blob([u8],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}); var a=document.createElement("a"); a.href=URL.createObjectURL(b); a.download=name; document.body.appendChild(a); a.click(); setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},1500);}
function pipelineWriteOpen(){
  var step=$("#crmPipeStep"); if(!step)return;
  var g=pipeGroupDeals();
  var stages=[["lead","Anfragen"],["angebot","Interviews"],["verloren","Nach Interview NO"],["verhandlung","Nach Interview YES"],["gewonnen","Aktive Projekte"]];
  var rowsHtml=stages.map(function(x){return '<tr><td>'+x[1]+'</td><td class="right"><b>'+((g[x[0]]||[]).length)+'</b> Deals</td></tr>';}).join("");
  var kt=(g["kontaktiert"]||[]).length;
  step.innerHTML='<div style="margin-bottom:8px">So wird <b>pipeline_1.xlsx</b> geschrieben — Formeln &amp; Layout bleiben erhalten:</div>'
    +'<table style="width:100%;font-size:12.5px;margin-bottom:8px"><tbody>'+rowsHtml+'</tbody></table>'
    +(kt?'<div class="muted" style="font-size:12px;margin-bottom:8px">Hinweis: '+kt+' Deal(s) in Phase „Vorgestellt" haben kein Excel-Blatt.</div>':"")
    +'<div style="font-size:12px;color:#1eae6b;margin-bottom:10px">✔ Vor dem Schreiben wird automatisch ein Backup heruntergeladen.</div>'
    +'<button class="btn" onclick="MPCRM._pipeWriteApply()">📤 Jetzt in Excel schreiben</button> <button class="btn sec" onclick="MPCRM._close()">Abbrechen</button>';
}
async function pipelineWriteApply(){
  var step=$("#crmPipeStep");
  try{
    var h=await idbGet("crmPipelineHandle"); if(!h){alert("Bitte zuerst die Datei verbinden.");return;}
    if(h.queryPermission&&(await h.queryPermission({mode:"readwrite"}))!=="granted"){ if((await h.requestPermission({mode:"readwrite"}))!=="granted"){alert("Kein Schreibzugriff erlaubt.");return;} }
    if(step)step.innerHTML='<span class="muted">Lese Excel + Backup…</span>';
    var file=await h.getFile(); var buf=await file.arrayBuffer(); var origU8=new Uint8Array(buf.slice(0));
    var ts=new Date().toISOString().replace(/:/g,"-").replace("T","_").slice(0,16);
    pipeDownload(origU8,"pipeline_1_backup_"+ts+".xlsx");
    var g=pipeGroupDeals(); var items=parseZipEntries(origU8); var replace={};
    for(var i=0;i<items.length;i++){ var it=items[i]; if(/^xl\/worksheets\/sheet/.test(it.name)){
      var xml=new TextDecoder().decode(it.method===0?it.comp:await inflateRaw(it.comp));
      var tm=xml.match(/<c r="A1"[^>]*><is><t>([^<]*)<\/t>/); var stage=PIPE_TITLE2STAGE[pipeNorm(tm?tm[1]:"")];
      if(stage)replace[it.name]=new TextEncoder().encode(xlsxSheetRewrite(xml,g[stage]||[]));
    }}
    if(step)step.innerHTML='<span class="muted">Schreibe Excel…</span>';
    var out=await buildXlsx(origU8,replace);
    var w=await h.createWritable(); await w.write(out); await w.close();
    closeModal(); toast("Excel aktualisiert ✔ — Backup liegt in Downloads.");
  }catch(e){ if(step)step.innerHTML='<span style="color:var(--red)">Fehler: '+esc(e.message)+'</span>'; }
}
/* kleine IndexedDB-Ablage nur für den Excel-Datei-Handle (kein CRM-Datenspeicher) */
function idbOpen(){return new Promise(function(res,rej){var r=indexedDB.open("mp-crm-kv",1); r.onupgradeneeded=function(){r.result.createObjectStore("kv");}; r.onsuccess=function(){res(r.result);}; r.onerror=function(){rej(r.error);};});}
async function idbSet(k,v){var d=await idbOpen(); return new Promise(function(res){var t=d.transaction("kv","readwrite"); t.objectStore("kv").put(v,k); t.oncomplete=res;});}
async function idbGet(k){var d=await idbOpen(); return new Promise(function(res){var t=d.transaction("kv","readonly"); var q=t.objectStore("kv").get(k); q.onsuccess=function(){res(q.result);};});}

/* ============================ Import (CSV/Excel) ============================ */
var IMPORT_FIELDS={
  contacts:[["firstName","Vorname"],["lastName","Nachname"],["fullName","Name (voll, wird getrennt)"],["company","Firma (Name)"],["position","Position"],["email","E-Mail"],["phone","Telefon"],["tags","Tags"],["notes","Notizen"]],
  companies:[["name","Firmenname"],["industry","Branche"],["website","Website"],["phone","Telefon"],["address","Adresse"],["notes","Notizen"]],
  deals:[["title","Titel"],["value","Wert (€)"],["stage","Phase"],["company","Firma (Name)"],["contact","Kontakt (Name)"],["closeDate","Abschlussdatum"],["notes","Notizen"]],
  activities:[["title","Titel"],["type","Typ"],["dueDate","Fällig am"],["contact","Kontakt (Name)"],["notes","Notizen"]]
};
var GUESS={firstName:["vorname","first","given"],lastName:["nachname","last","surname","familien"],fullName:["name","kontakt","ansprech"],company:["firma","company","unternehmen","organisation","account"],
  position:["position","titel","rolle","funktion","job"],email:["mail","e-mail","email"],phone:["telefon","phone","tel","mobil","handy"],tags:["tag","kategorie","label","schlagwort"],
  notes:["notiz","note","bemerkung","kommentar","info"],name:["firma","name","company","unternehmen"],industry:["branche","industry","sektor"],website:["web","url","homepage","seite"],
  address:["adresse","address","anschrift","ort","straße","strasse"],title:["titel","title","betreff","bezeichnung","name"],value:["wert","value","betrag","umsatz","summe","preis","amount"],
  stage:["phase","stage","status"],contact:["kontakt","contact","ansprech","person"],closeDate:["abschluss","close","datum","date"],dueDate:["fällig","faellig","due","datum","date","termin"],type:["typ","type","art"]};
var imp={type:"contacts",headers:[],rows:[],map:{},hasHeader:true};
function importWizard(){
  imp={type:(state.view in IMPORT_FIELDS?state.view:"contacts"),headers:[],rows:[],map:{},fileInfo:[],hasHeader:true};
  openModal('<div class="mh"><h3>Daten importieren</h3><button class="x" onclick="MPCRM._close()">×</button></div>'
    +'<div class="mb"><div class="fld"><label>Importieren als</label><select id="crmImpType">'+Object.entries(ENTITY_LABEL).map(function(e){return '<option value="'+e[0]+'" '+(e[0]===imp.type?"selected":"")+'>'+e[1]+'</option>';}).join("")+'</select></div>'
    +'<div class="fld"><label>Dateien (CSV, TSV oder Excel .xlsx) — mehrere möglich</label><input type="file" id="crmImpFile" accept=".csv,.tsv,.txt,.xlsx" multiple></div>'
    +'<div class="muted" style="font-size:12.5px">Mehrere Dateien werden zusammengeführt. Erste Zeile = Spaltenüberschriften. Firmen werden automatisch angelegt und verknüpft.</div>'
    +'<div id="crmImpStep2"></div></div>'
    +'<div class="mf"><button class="btn sec" onclick="MPCRM._close()">Abbrechen</button><button class="btn" id="crmImpGo" disabled onclick="MPCRM._runImport()">Importieren</button></div>');
  $("#crmImpType").addEventListener("change",function(e){imp.type=e.target.value;});
  $("#crmImpFile").addEventListener("change",function(e){handleImportFiles(e.target.files);});
}
async function parseAnyFile(file){ if(/\.xlsx$/i.test(file.name))return readXlsx(await file.arrayBuffer()); return parseCSV(await file.text()); }
var normH=function(s){return (s||"").trim().toLowerCase();};
async function handleImportFiles(fileList){
  var files=Array.prototype.slice.call(fileList); if(!files.length)return;
  var step2=$("#crmImpStep2"); step2.innerHTML='<div class="muted" style="padding:14px 0">'+files.length+' Datei(en) werden gelesen…</div>';
  imp.headers=[]; imp.rows=[]; imp.fileInfo=[];
  try{
    for(var fi=0;fi<files.length;fi++){ var file=files[fi]; var rows;
      try{rows=await parseAnyFile(file);}catch(e){imp.fileInfo.push({name:file.name,count:0,note:"Fehler: "+e.message});continue;}
      if(!rows.length){imp.fileInfo.push({name:file.name,count:0,note:"leer"});continue;}
      var headers=rows[0].map(function(h){return (h||"").trim();}),data=rows.slice(1);
      if(!imp.headers.length){ imp.headers=headers; imp.rows=imp.rows.concat(data); imp.fileInfo.push({name:file.name,count:data.length,note:""}); }
      else{
        var master=imp.headers.map(normH);
        var idxMap=headers.map(function(h){return master.indexOf(normH(h));});
        var matched=idxMap.filter(function(i){return i>=0;}).length,note="";
        data.forEach(function(r){ var nr=new Array(imp.headers.length).fill("");
          if(matched>0){ for(var c=0;c<r.length;c++){var t=idxMap[c]; if(t>=0)nr[t]=r[c];} }
          else{ for(var c2=0;c2<Math.min(r.length,nr.length);c2++)nr[c2]=r[c2]; }
          imp.rows.push(nr);
        });
        note=matched>0?(matched<headers.length||idxMap.some(function(i){return i<0;})?"per Spaltennamen zugeordnet":""):"andere Spalten — nach Position übernommen";
        imp.fileInfo.push({name:file.name,count:data.length,note:note});
      }
    }
    if(!imp.headers.length)throw new Error("Keine lesbaren Daten gefunden");
    autoMap(); renderMapping();
  }catch(e){ step2.innerHTML='<div class="pill" style="background:#fdeceb;color:var(--red);padding:8px 12px;display:block">Fehler: '+esc(e.message)+'</div>'; }
}
function autoMap(){
  imp.map={}; var used=new Set();
  IMPORT_FIELDS[imp.type].forEach(function(fl){ var field=fl[0]; var keys=GUESS[field]||[field]; var best=-1;
    imp.headers.forEach(function(h,i){ if(used.has(i))return; var hl=h.toLowerCase(); if(keys.some(function(k){return hl===k;}))best=i; });
    if(best<0)imp.headers.forEach(function(h,i){ if(used.has(i)||best>=0)return; var hl=h.toLowerCase(); if(keys.some(function(k){return hl.indexOf(k)>=0;}))best=i; });
    if(best>=0){imp.map[field]=best; used.add(best);}
  });
}
function renderMapping(){
  var fields=IMPORT_FIELDS[imp.type];
  function opts(sel_){ return '<option value="">— nicht importieren —</option>'+imp.headers.map(function(h,i){return '<option value="'+i+'" '+(i===sel_?"selected":"")+'>'+esc(h||("Spalte "+(i+1)))+'</option>';}).join(""); }
  var preview=imp.rows.slice(0,3); var fi=imp.fileInfo||[];
  $("#crmImpStep2").innerHTML=(fi.length>1?'<div class="detail-sec"><h4>'+fi.length+' Dateien geladen</h4>'+fi.map(function(f){return '<div class="kv"><div class="v">'+esc(f.name)+'</div><div class="right muted">'+f.count+' Zeilen'+(f.note?" · "+esc(f.note):"")+'</div></div>';}).join("")+'</div>':"")
    +'<div class="detail-sec"><h4>Spalten zuordnen — '+imp.rows.length+' Zeilen erkannt</h4>'
    +fields.map(function(fl){return '<div class="kv" style="align-items:center"><div class="k" style="width:180px">'+fl[1]+'</div><div class="v"><select class="crmMapSel" data-field="'+fl[0]+'">'+opts(imp.map[fl[0]])+'</select></div></div>';}).join("")+'</div>'
    +'<div class="detail-sec"><h4>Vorschau</h4><div style="overflow-x:auto;border:1px solid var(--line);border-radius:8px"><table><thead><tr>'+imp.headers.map(function(h){return '<th>'+esc(h)+'</th>';}).join("")+'</tr></thead><tbody>'
    +preview.map(function(r){return '<tr>'+imp.headers.map(function(_,i){return '<td>'+esc(r[i]||"")+'</td>';}).join("")+'</tr>';}).join("")+'</tbody></table></div></div>';
  root.querySelectorAll(".crmMapSel").forEach(function(sel_){ sel_.addEventListener("change",function(e){ imp.map[e.target.dataset.field]=e.target.value===""?undefined:+e.target.value; }); });
  $("#crmImpGo").disabled=false;
}
function findOrCreateCompany(name){ name=(name||"").trim(); if(!name)return "";
  var c=db.companies.find(function(x){return x.name.toLowerCase()===name.toLowerCase();});
  if(!c){c={id:uid(),createdAt:Date.now(),name:name,industry:"",website:"",phone:"",address:"",notes:""}; db.companies.push(c);}
  return c.id;
}
function findContactByName(name){ name=(name||"").trim().toLowerCase(); if(!name)return "";
  var c=db.contacts.find(function(x){return (x.firstName+" "+x.lastName).trim().toLowerCase()===name;}); return c?c.id:"";
}
function impDate(v){ v=(v||"").trim(); if(!v)return "";
  if(/^\d{4}-\d{2}-\d{2}/.test(v))return v.slice(0,10);
  if(/^\d{4,5}$/.test(v)){var d=new Date(Date.UTC(1899,11,30+ +v)); return d.toISOString().slice(0,10);}
  var m=v.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})/); if(m){var y=+m[3]; if(y<100)y+=2000; return y+"-"+String(+m[2]).padStart(2,"0")+"-"+String(+m[1]).padStart(2,"0");}
  var dd=new Date(v); return isNaN(dd)?"":dd.toISOString().slice(0,10);
}
function impStage(v){ v=(v||"").trim().toLowerCase(); var s=curStagesRaw().find(function(x){return x.id===v||x.name.toLowerCase()===v;}); return s?s.id:"lead"; }
function impType(v){ v=(v||"").trim().toLowerCase(); for(var k in ACT_TYPES){ if(k===v||ACT_TYPES[k].l.toLowerCase()===v)return k; } return "task"; }
function cell(r,f){ var i=imp.map[f]; return i==null?"":(r[i]||"").trim(); }
function runImport(){
  var count=0,t=imp.type;
  imp.rows.forEach(function(r){
    if(t==="contacts"){
      var fn=cell(r,"firstName"),ln=cell(r,"lastName");
      if(!fn&&!ln&&imp.map.fullName!=null){var parts=cell(r,"fullName").split(/\s+/); fn=parts.shift()||""; ln=parts.join(" ");}
      if(!fn&&!ln)return;
      db.contacts.push({id:uid(),createdAt:Date.now(),firstName:fn,lastName:ln,companyId:findOrCreateCompany(cell(r,"company")),position:cell(r,"position"),
        email:cell(r,"email"),phone:cell(r,"phone"),tags:cell(r,"tags").split(/[,;]/).map(function(x){return x.trim();}).filter(Boolean),notes:cell(r,"notes")}); count++;
    }else if(t==="companies"){
      var name=cell(r,"name"); if(!name)return;
      db.companies.push({id:uid(),createdAt:Date.now(),name:name,industry:cell(r,"industry"),website:cell(r,"website"),phone:cell(r,"phone"),address:cell(r,"address"),notes:cell(r,"notes")}); count++;
    }else if(t==="deals"){
      var title=cell(r,"title"); if(!title)return;
      db.deals.push({id:uid(),createdAt:Date.now(),title:title,value:parseFloat((cell(r,"value")||"0").replace(/[^\d,.-]/g,"").replace(",","."))||0,
        stage:impStage(cell(r,"stage")),companyId:findOrCreateCompany(cell(r,"company")),contactId:findContactByName(cell(r,"contact")),closeDate:impDate(cell(r,"closeDate")),notes:cell(r,"notes")}); count++;
    }else if(t==="activities"){
      var title2=cell(r,"title"); if(!title2)return;
      db.activities.push({id:uid(),createdAt:Date.now(),done:false,title:title2,type:impType(cell(r,"type")),dueDate:impDate(cell(r,"dueDate")),contactId:findContactByName(cell(r,"contact")),dealId:"",notes:cell(r,"notes")}); count++;
    }
  });
  scheduleSave(); closeModal(); state.view=t; renderAll(); toast(count+" "+ENTITY_LABEL[t]+" importiert");
}

/* ============================ Export / Backup ============================ */
function download(name,text,mime){ var b=new Blob([text],{type:mime||"text/plain"}); var u=URL.createObjectURL(b); var a=document.createElement("a"); a.href=u; a.download=name; a.click(); setTimeout(function(){URL.revokeObjectURL(u);},1500); }
function csvCell(v){ v=v==null?"":String(v); return /[",;\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; }
function toCSV(rows,cols){ var head=cols.map(function(c){return csvCell(c.label);}).join(","); var body=rows.map(function(r){return cols.map(function(c){return csvCell(c.get(r));}).join(",");}).join("\n"); return "﻿"+head+"\n"+body; }
function ymd(){return new Date().toISOString().slice(0,10);}
function exportJSON(){ download("crm-backup-"+ymd()+".json",JSON.stringify(db,null,2),"application/json"); toast("Backup gespeichert"); }
function exportContactsCSV(){ download("kontakte-"+ymd()+".csv",toCSV(db.contacts,[
  {label:"Vorname",get:function(c){return c.firstName;}},{label:"Nachname",get:function(c){return c.lastName;}},{label:"Firma",get:function(c){return companyName(c.companyId);}},
  {label:"Position",get:function(c){return c.position;}},{label:"E-Mail",get:function(c){return c.email;}},{label:"Telefon",get:function(c){return c.phone;}},
  {label:"Tags",get:function(c){return (c.tags||[]).join("; ");}},{label:"Notizen",get:function(c){return c.notes;}}]),"text/csv"); toast("Kontakte exportiert"); }
function exportCompaniesCSV(){ download("firmen-"+ymd()+".csv",toCSV(db.companies,[
  {label:"Firmenname",get:function(c){return c.name;}},{label:"Branche",get:function(c){return c.industry;}},{label:"Website",get:function(c){return c.website;}},
  {label:"Telefon",get:function(c){return c.phone;}},{label:"Adresse",get:function(c){return c.address;}},{label:"Notizen",get:function(c){return c.notes;}}]),"text/csv"); toast("Firmen exportiert"); }
function exportDealsCSV(){ download("deals-"+ymd()+".csv",toCSV(db.deals,[
  {label:"Titel",get:function(d){return d.title;}},{label:"Wert",get:function(d){return d.value;}},{label:"Phase",get:function(d){return stageOf(d.stage).name;}},
  {label:"Firma",get:function(d){return companyName(d.companyId);}},{label:"Kontakt",get:function(d){return contactName(d.contactId);}},{label:"Kandidat",get:function(d){return d.candidate;}},
  {label:"Abschlussdatum",get:function(d){return d.closeDate;}},{label:"Erledigt",get:function(d){return d.done?"ja":"nein";}},{label:"Notizen",get:function(d){return d.notes;}}]),"text/csv"); toast("Deals exportiert"); }
function exportActivitiesCSV(){ download("aktivitaeten-"+ymd()+".csv",toCSV(db.activities,[
  {label:"Titel",get:function(a){return a.title;}},{label:"Typ",get:function(a){return (ACT_TYPES[a.type]||{}).l||a.type;}},{label:"Fällig",get:function(a){return a.dueDate;}},
  {label:"Erledigt",get:function(a){return a.done?"ja":"nein";}},{label:"Kontakt",get:function(a){return contactName(a.contactId);}},{label:"Notizen",get:function(a){return a.notes;}}]),"text/csv"); toast("Aktivitäten exportiert"); }
function exportMenu(){
  openModal('<div class="mh"><h3>Export / Backup</h3><button class="x" onclick="MPCRM._close()">×</button></div>'
    +'<div class="mb"><p class="muted" style="margin-top:0">Lade deine Daten herunter — als vollständiges Backup oder einzelne Listen als CSV.</p>'
    +'<button class="btn block" style="margin-bottom:12px" onclick="MPCRM._exp(\'json\')">⬇ Vollständiges Backup (JSON)</button>'
    +'<div class="row2"><button class="btn sec block" onclick="MPCRM._exp(\'contacts\')">Kontakte (CSV)</button><button class="btn sec block" onclick="MPCRM._exp(\'companies\')">Firmen (CSV)</button></div>'
    +'<div class="row2" style="margin-top:10px"><button class="btn sec block" onclick="MPCRM._exp(\'deals\')">Deals (CSV)</button><button class="btn sec block" onclick="MPCRM._exp(\'activities\')">Aktivitäten (CSV)</button></div></div>'
    +'<div class="mf"><button class="btn sec" onclick="MPCRM._close()">Schließen</button></div>');
}
function doExport(kind){ ({json:exportJSON,contacts:exportContactsCSV,companies:exportCompaniesCSV,deals:exportDealsCSV,activities:exportActivitiesCSV})[kind](); }

/* ============================ Outlook / Microsoft Graph ============================ */
var msalInstance=null,msalAccount=null;
var GRAPH_SCOPES=["Mail.Read","User.Read"];
function getClientId(){return localStorage.getItem("crmMsalClientId")||"09a95784-e6d7-4dd5-a060-eae4c7cd4feb";}
function initMsal(){
  if(msalInstance)return msalInstance;
  if(typeof msal==="undefined"){alert("Microsoft-Login-Bibliothek nicht geladen.\n\nBraucht Internet UND die Seite muss über http(s)/localhost laufen.");return null;}
  if(!getClientId()){alert("Bitte zuerst die Azure Client-ID eintragen und speichern.");return null;}
  msalInstance=new msal.PublicClientApplication({auth:{clientId:getClientId(),authority:"https://login.microsoftonline.com/common",redirectUri:location.origin+location.pathname},cache:{cacheLocation:"localStorage"}});
  return msalInstance;
}
async function graphToken(){
  var app=initMsal(); if(!app)return null;
  var acct=msalAccount||app.getAllAccounts()[0];
  try{
    if(!acct){var r=await app.loginPopup({scopes:GRAPH_SCOPES}); acct=r.account;}
    msalAccount=acct;
    var t=await app.acquireTokenSilent({scopes:GRAPH_SCOPES,account:acct}); return t.accessToken;
  }catch(e){
    try{var r2=await app.acquireTokenPopup({scopes:GRAPH_SCOPES}); msalAccount=r2.account; return r2.accessToken;}
    catch(e2){alert("Anmeldung fehlgeschlagen: "+(e2.message||e2)); return null;}
  }
}
async function fetchOutlookInquiries(){
  var tok=await graphToken(); if(!tok)return;
  toast("Anfragen werden geladen…");
  var url="https://graph.microsoft.com/v1.0/me/messages?$top=50&$select=subject,from,receivedDateTime,bodyPreview,internetMessageId&$orderby=receivedDateTime%20desc";
  var msgs=[];
  try{ var r=await fetch(url,{headers:{Authorization:"Bearer "+tok}}); var j=await r.json(); if(j.error)throw new Error(j.error.message); msgs=j.value||[]; }
  catch(e){ alert("Graph-Fehler: "+(e.message||e)); return; }
  var me=((msalAccount&&msalAccount.username)||"").toLowerCase();
  var rx=/(sap|projekt|project|consultant|berater|remote|freelance|anfrage|opportunity|position|rate|ewm|s\/4|inhouse)/i;
  var items=msgs.filter(function(m){return m.from&&m.from.emailAddress&&(m.from.emailAddress.address||"").toLowerCase()!==me;})
    .map(function(m){return {id:m.internetMessageId,subject:m.subject||"(kein Betreff)",fromName:(m.from.emailAddress.name||""),fromAddr:(m.from.emailAddress.address||""),date:(m.receivedDateTime||"").slice(0,10),preview:m.bodyPreview||"",isSap:rx.test((m.subject||"")+" "+(m.bodyPreview||""))};});
  showInquiryReview(items);
}
function showInquiryReview(items){
  var done=new Set(JSON.parse(localStorage.getItem("crmOutlookImportedIds")||"[]"));
  var fresh=items.filter(function(i){return i.id&&!done.has(i.id);});
  window._crmInq=fresh;
  openModal('<div class="mh"><h3>Outlook-Anfragen ('+fresh.length+' neu)</h3><button class="x" onclick="MPCRM._close()">×</button></div>'
    +'<div class="mb" style="max-height:58vh;overflow:auto">'+(fresh.length?fresh.map(function(i,ix){return '<label style="display:flex;gap:10px;padding:9px 0;border-bottom:1px solid var(--line);cursor:pointer"><input type="checkbox" class="selbox crmInqCb" data-ix="'+ix+'" '+(i.isSap?"checked":"")+'>'
      +'<div style="flex:1;min-width:0"><div style="font-weight:600">'+esc(i.subject)+'</div><div class="muted" style="font-size:12px">'+esc(i.fromName)+' · '+esc(i.fromAddr)+' · '+i.date+(i.isSap?' · <span style="color:var(--brand);font-weight:700">SAP</span>':"")+'</div></div></label>';}).join(""):'<div class="empty"><div class="big">✉</div>Keine neuen Anfragen gefunden.</div>')+'</div>'
    +'<div class="mf"><button class="btn sec" onclick="MPCRM._close()">Abbrechen</button><button class="btn" onclick="MPCRM._importInquiries()">Ausgewählte als Deals übernehmen</button></div>');
}
function domainRoot(addr){var p=(addr.split("@")[1]||"").split("."); return p.length>=2?p[p.length-2]:(addr||"");}
function cap(s){return s?s.charAt(0).toUpperCase()+s.slice(1):s;}
function importInquiries(){
  var done=new Set(JSON.parse(localStorage.getItem("crmOutlookImportedIds")||"[]")); var n=0;
  root.querySelectorAll(".crmInqCb:checked").forEach(function(b){
    var i=(window._crmInq||[])[+b.dataset.ix]; if(!i)return;
    var isCo=/(gmbh|ag|ltd|se|kg|group|consulting|recruitment|partners|solutions)/i.test(i.fromName);
    var compName=isCo?i.fromName:cap(domainRoot(i.fromAddr));
    var cid=findOrCreateCompany(compName); var ctid="";
    if(i.fromName&&i.fromName.indexOf(" ")>=0&&!isCo){
      var ex=db.contacts.find(function(x){return x.email&&x.email.toLowerCase()===i.fromAddr.toLowerCase();});
      if(ex){ctid=ex.id;} else{ var parts=i.fromName.split(/\s+/); var c={id:uid(),createdAt:Date.now(),firstName:parts[0],lastName:parts.slice(1).join(" "),companyId:cid,position:"",email:i.fromAddr,phone:"",tags:["Outlook-Anfrage"],notes:""}; db.contacts.push(c); ctid=c.id; }
    }
    db.deals.push({id:uid(),createdAt:Date.now(),title:i.subject,value:0,stage:"lead",companyId:cid,contactId:ctid,closeDate:i.date,notes:"Aus Outlook ("+i.date+"): "+i.preview.slice(0,220)});
    done.add(i.id); n++;
  });
  localStorage.setItem("crmOutlookImportedIds",JSON.stringify([...done]));
  scheduleSave(); closeModal(); state.view="deals"; state.search=""; sel.clear(); renderAll();
  toast(n+" Anfrage(n) als Deals übernommen");
}
function saveClientId(){ var v=$("#crmMsalCid").value.trim(); localStorage.setItem("crmMsalClientId",v); msalInstance=null; toast("Client-ID gespeichert"); }
function outlookMenu(){
  var served=location.protocol!=="file:";
  openModal('<div class="mh"><h3>Outlook-Anbindung</h3><button class="x" onclick="MPCRM._close()">×</button></div>'
    +'<div class="mb"><p class="muted" style="margin-top:0">Holt eingehende Anfragen aus deinem Outlook direkt als Deals (Phase „Anfrage") ins CRM. Einmalige Azure-Einrichtung nötig — Redirect-URI dieser Plattform-URL muss in der Azure-App hinterlegt sein.</p>'
    +(served?"":'<p style="background:#fdeceb;color:var(--red);padding:9px 12px;border-radius:8px;font-size:13px;margin-top:0">Diese Seite läuft als Datei. Für den Microsoft-Login bitte über http(s)/localhost öffnen.</p>')
    +'<div class="fld"><label>Azure App Client-ID</label><input id="crmMsalCid" value="'+esc(getClientId())+'" placeholder="11111111-2222-3333-4444-555555555555"></div>'
    +'<div class="row2"><button class="btn sec block" onclick="MPCRM._saveClientId()">ID speichern</button><button class="btn block" onclick="MPCRM._fetchOutlook()">Anfragen abrufen</button></div>'
    +'<p class="muted" style="font-size:12px;margin-bottom:0">Beim ersten Abruf öffnet sich das Microsoft-Login-Fenster. Es werden nur E-Mails gelesen (Mail.Read).</p></div>'
    +'<div class="mf"><button class="btn sec" onclick="MPCRM._close()">Schließen</button></div>');
}

/* ============================ Aufbau (open) ============================ */
function go(v){state.view=v;state.search="";sel.clear();var si=$("#crmSearchInput");if(si)si.value="";renderAll();}

var CRM_CSS_TEMPLATE=null;
function injectCss(){
  if(document.getElementById("crm-module-css"))return;
  var css=[
    ".crmapp{display:block;width:100%;--bg:#f4f6fb;--panel:#ffffff;--ink:#1f2733;--muted:#6b7688;--line:#e4e8f0;--brand:#2f6bff;--brand-d:#1f4fd6;--green:#1eae6b;--amber:#e6a417;--red:#e0483d;--purple:#8b5cf6;--shadow:0 1px 3px rgba(18,28,45,.08),0 8px 24px rgba(18,28,45,.06);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:var(--bg);color:var(--ink);font-size:14px;line-height:1.45;border-radius:14px;overflow:hidden}",
    ".crmapp button{font-family:inherit;font-size:inherit;cursor:pointer}",
    ".crmapp input,.crmapp select,.crmapp textarea{font-family:inherit;font-size:14px}",
    ".crmapp .app{display:flex;flex-direction:row;min-height:82vh}",
    ".crmapp .nav a .badge{margin-left:auto;background:rgba(255,255,255,.14);color:#fff;border-radius:20px;padding:1px 8px;font-size:11px;font-weight:600;margin-bottom:0}",
    ".crmapp .nav a.active .badge{background:rgba(255,255,255,.25)}",
    ".crmapp .side{width:216px;flex-shrink:0;background:#0f1626;color:#c7d0e0;display:flex;flex-direction:column}",
    ".crmapp .projsel{padding:14px 12px 12px}",
    ".crmapp .projsel label{font-size:10px;letter-spacing:.6px;color:#7c8aa5;font-weight:700;display:block;margin-bottom:5px}",
    ".crmapp .projsel .prow{display:flex;gap:6px}",
    ".crmapp .projsel select{flex:1;min-width:0;background:#1b2436;color:#e6ebf5;border:1px solid rgba(255,255,255,.14);border-radius:8px;padding:7px 8px;font-weight:600}",
    ".crmapp .projsel .prow button{background:var(--brand);color:#fff;border:none;border-radius:8px;width:34px;flex-shrink:0;font-size:18px;line-height:1;cursor:pointer}",
    ".crmapp .projsel .pactions{display:flex;gap:12px;margin-top:7px;font-size:11px;color:#8494ad}",
    ".crmapp .projsel .pactions span{cursor:pointer}",
    ".crmapp .langsel{padding:0 12px 9px}",
    ".crmapp .langsel select{width:100%;background:#1b2436;color:#e6ebf5;border:1px solid rgba(255,255,255,.14);border-radius:8px;padding:6px 8px;font-weight:600;font-size:12.5px}",
    ".crmapp .storage{padding:10px 12px 14px;border-top:1px solid rgba(255,255,255,.08)}",
    ".crmapp .storage .st-row{display:flex;align-items:center;gap:7px;margin-bottom:7px;color:#9aa6bd;font-size:12px}",
    ".crmapp .storage .st-dot{width:8px;height:8px;border-radius:50%;background:#e0483d;flex:0 0 auto}",
    ".crmapp .storage .st-dot.ok{background:#1eae6b}",
    ".crmapp .storage .btn{margin-top:2px}",
    ".crmapp .nav{padding:6px 10px;flex:1}",
    ".crmapp .nav a{display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:9px;color:#c7d0e0;text-decoration:none;font-weight:500;margin-bottom:2px;cursor:pointer}",
    ".crmapp .nav a:hover{background:rgba(255,255,255,.06);color:#fff}",
    ".crmapp .nav a.active{background:var(--brand);color:#fff}",
    ".crmapp .nav a .ic{width:18px;text-align:center;font-size:15px}",
    ".crmapp .nav a .badge{margin-left:auto;background:rgba(255,255,255,.14);border-radius:20px;padding:1px 8px;font-size:11px;font-weight:600}",
    ".crmapp .btn{border:none;border-radius:8px;padding:8px 12px;font-weight:600;background:var(--brand);color:#fff}",
    ".crmapp .btn:hover{background:var(--brand-d)}",
    ".crmapp .btn.sm{padding:5px 10px;font-size:12.5px;border-radius:7px}",
    ".crmapp .btn.block{width:100%}",
    ".crmapp .btn.sec{background:#eef1f7;color:var(--ink)}",
    ".crmapp .btn.sec:hover{background:#e2e7f0}",
    ".crmapp .btn.danger{background:#fdeceb;color:var(--red)}",
    ".crmapp .main{flex:1;min-width:0;display:flex;flex-direction:column}",
    ".crmapp .top{background:var(--panel);border-bottom:1px solid var(--line);padding:16px 26px;display:flex;align-items:center;gap:16px;flex-wrap:wrap}",
    ".crmapp .top h1{margin:0;font-size:20px;font-weight:700}",
    ".crmapp .top .sub{color:var(--muted);font-size:12.5px;margin-top:1px}",
    ".crmapp .search{margin-left:auto;position:relative}",
    ".crmapp .search input{width:220px;padding:9px 12px 9px 34px;border:1px solid var(--line);border-radius:9px;background:#fff}",
    ".crmapp .search .mag{position:absolute;left:11px;top:9px;color:var(--muted)}",
    ".crmapp .content{padding:24px 26px;flex:1;overflow:auto}",
    ".crmapp .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px}",
    ".crmapp .stat{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;box-shadow:var(--shadow)}",
    ".crmapp .stat .lbl{color:var(--muted);font-size:12.5px;font-weight:600;text-transform:uppercase}",
    ".crmapp .stat .val{font-size:28px;font-weight:800;margin-top:6px}",
    ".crmapp .stat .foot{font-size:12px;color:var(--muted);margin-top:4px}",
    ".crmapp .stat .ic{float:right;font-size:20px;opacity:.9}",
    ".crmapp .panel{background:var(--panel);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);overflow:hidden}",
    ".crmapp .panel .ph{display:flex;align-items:center;padding:15px 18px;border-bottom:1px solid var(--line);gap:8px}",
    ".crmapp .panel .ph h3{margin:0;font-size:15px}",
    ".crmapp .panel .ph .btn{margin-left:auto}",
    ".crmapp .grid2{display:grid;grid-template-columns:1fr 1fr;gap:20px}",
    ".crmapp table{width:100%;border-collapse:collapse}",
    ".crmapp th{text-align:left;font-size:11.5px;text-transform:uppercase;color:var(--muted);font-weight:600;padding:11px 18px;border-bottom:1px solid var(--line);background:#fafbfd}",
    ".crmapp td{padding:12px 18px;border-bottom:1px solid var(--line);vertical-align:middle}",
    ".crmapp tr:last-child td{border-bottom:none}",
    ".crmapp tbody tr:hover{background:#f8faff;cursor:pointer}",
    ".crmapp tr.selrow{background:#eaf1ff!important}",
    ".crmapp .card.donecard{opacity:.62;background:#f4f7f4}",
    ".crmapp .card.donecard .t{text-decoration:line-through}",
    ".crmapp .card.selrow{outline:2px solid var(--brand);outline-offset:-1px}",
    ".crmapp .selbox{width:17px;height:17px;accent-color:var(--brand);cursor:pointer;vertical-align:middle}",
    ".crmapp .bulkbar{display:flex;align-items:center;gap:12px;background:#0f1626;color:#fff;padding:11px 16px;border-radius:11px;margin-bottom:14px}",
    ".crmapp .bulkbar .cnt{font-weight:700}",
    ".crmapp .av{width:32px;height:32px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:12px;flex-shrink:0}",
    ".crmapp .cellname{display:flex;align-items:center;gap:10px}",
    ".crmapp .cellname .meta{font-size:12px;color:var(--muted)}",
    ".crmapp .tag{display:inline-block;background:#eef1f7;color:#4a566b;border-radius:20px;padding:2px 9px;font-size:11.5px;font-weight:600;margin:1px}",
    ".crmapp .pill{display:inline-block;border-radius:20px;padding:3px 10px;font-size:11.5px;font-weight:700}",
    ".crmapp .empty{padding:48px 20px;text-align:center;color:var(--muted)}",
    ".crmapp .empty .big{font-size:34px;margin-bottom:8px}",
    ".crmapp .muted{color:var(--muted)}",
    ".crmapp .link{color:var(--brand);text-decoration:none;font-weight:600}",
    ".crmapp .link:hover{text-decoration:underline}",
    ".crmapp .right{text-align:right}",
    ".crmapp .board{display:grid;grid-template-columns:repeat(6,minmax(180px,1fr));gap:14px;overflow-x:auto;padding-bottom:8px}",
    ".crmapp .col{background:#eef1f7;border-radius:13px;padding:10px;min-height:120px}",
    ".crmapp .col.dragover{outline:2px dashed var(--brand);outline-offset:-2px}",
    ".crmapp .col h4{margin:2px 4px 10px;font-size:12.5px;display:flex;align-items:center;gap:6px}",
    ".crmapp .col h4 .cnt{background:#fff;border-radius:20px;padding:0 8px;font-size:11px;color:var(--muted)}",
    ".crmapp .col h4 .sum{margin-left:auto;font-size:11px;color:var(--muted);font-weight:600}",
    ".crmapp .card{background:#fff;border-radius:10px;padding:11px 12px;margin-bottom:9px;border:1px solid var(--line);cursor:grab}",
    ".crmapp .card .t{font-weight:600;margin-bottom:4px}",
    ".crmapp .card .v{font-weight:800;color:var(--green)}",
    ".crmapp .card .c{font-size:12px;color:var(--muted);margin-top:3px}",
    ".crmapp .dot-s{width:9px;height:9px;border-radius:50%;display:inline-block}",
    ".crmapp .act{display:flex;align-items:flex-start;gap:12px;padding:13px 18px;border-bottom:1px solid var(--line)}",
    ".crmapp .act:last-child{border-bottom:none}",
    ".crmapp .act .cb{margin-top:2px;width:19px;height:19px;flex-shrink:0;cursor:pointer;accent-color:var(--brand)}",
    ".crmapp .act.done .at{text-decoration:line-through;color:var(--muted)}",
    ".crmapp .act .aic{width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0}",
    ".crmapp .act .body{flex:1;min-width:0}",
    ".crmapp .act .at{font-weight:600}",
    ".crmapp .act .am{font-size:12.5px;color:var(--muted);margin-top:2px}",
    ".crmapp .act .due{font-size:12px;font-weight:600;white-space:nowrap}",
    ".crmapp .due.over{color:var(--red)} .crmapp .due.today{color:var(--amber)} .crmapp .due.fut{color:var(--muted)}",
    ".crmapp .ov{position:fixed;inset:0;background:rgba(15,22,38,.5);display:none;align-items:flex-start;justify-content:center;z-index:1000;padding:40px 16px;overflow:auto}",
    ".crmapp .ov.show{display:flex}",
    ".crmapp .modal{background:#fff;border-radius:16px;width:100%;max-width:560px;box-shadow:0 20px 60px rgba(0,0,0,.3);color:var(--ink)}",
    ".crmapp .modal .mh{padding:18px 22px;border-bottom:1px solid var(--line);display:flex;align-items:center}",
    ".crmapp .modal .mh h3{margin:0;font-size:17px}",
    ".crmapp .modal .mh .x{margin-left:auto;background:none;border:none;font-size:22px;color:var(--muted);line-height:1}",
    ".crmapp .modal .mb{padding:20px 22px}",
    ".crmapp .modal .mf{padding:15px 22px;border-top:1px solid var(--line);display:flex;gap:10px;justify-content:flex-end}",
    ".crmapp .fld{margin-bottom:14px}",
    ".crmapp .fld label{display:block;font-weight:600;font-size:12.5px;margin-bottom:5px;color:#42506a}",
    ".crmapp .fld input,.crmapp .fld select,.crmapp .fld textarea{width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:9px;background:#fff}",
    ".crmapp .fld textarea{resize:vertical;min-height:70px}",
    ".crmapp .row2{display:grid;grid-template-columns:1fr 1fr;gap:12px}",
    ".crmapp .detail-sec{margin-top:18px}",
    ".crmapp .detail-sec h4{font-size:12px;text-transform:uppercase;color:var(--muted);margin:0 0 8px}",
    ".crmapp .kv{display:flex;padding:6px 0;border-bottom:1px solid var(--line)}",
    ".crmapp .kv .k{width:120px;color:var(--muted);font-size:13px}",
    ".crmapp .kv .v{flex:1;font-weight:500}",
    ".crmapp .toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:#0f1626;color:#fff;padding:11px 20px;border-radius:10px;font-weight:600;z-index:1100;opacity:0;transition:.25s;pointer-events:none}",
    ".crmapp .toast.show{opacity:1}",
    "@media(max-width:820px){.crmapp .stats{grid-template-columns:1fr 1fr}.crmapp .grid2{grid-template-columns:1fr}.crmapp .side{width:70px}.crmapp .brand span,.crmapp .nav a .txt{display:none}}"
  ].join("\n");
  var st=document.createElement("style"); st.id="crm-module-css"; st.textContent=css; document.head.appendChild(st);
}

function open(){
  var view=document.getElementById("view-crm"); if(!view)return;
  injectCss();
  view.innerHTML="";
  var tt=MP().t; view.appendChild((function(){var h=document.createElement("h2");h.textContent=(tt&&tt("nav_crm"))||"CRM";return h;})());
  if(!supaClient()||!MP().user){
    var p=document.createElement("p"); p.className="lead"; p.textContent="Bitte melde dich an, um das CRM zu nutzen.";
    view.appendChild(p); return;
  }
  var wrap=document.createElement("div"); wrap.className="crmapp"; wrap.innerHTML=
    '<div class="app"><aside class="side">'
    +'<div class="projsel" id="crmProjsel"></div>'
    +'<nav class="nav" id="crmNav">'
    +'<a data-view="dashboard" class="active"><span class="ic">▚</span><span class="txt" data-i18n="nav_dash">Dashboard</span></a>'
    +'<a data-view="contacts"><span class="ic">◔</span><span class="txt" data-i18n="nav_cont">Kontakte</span><span class="badge" id="crmB-contacts">0</span></a>'
    +'<a data-view="companies"><span class="ic">▤</span><span class="txt" data-i18n="nav_comp">Firmen</span><span class="badge" id="crmB-companies">0</span></a>'
    +'<a data-view="deals"><span class="ic">◆</span><span class="txt" data-i18n="nav_deal">Deals</span><span class="badge" id="crmB-deals">0</span></a>'
    +'<a data-view="activities"><span class="ic">✓</span><span class="txt" data-i18n="nav_act">Aktivitäten</span><span class="badge" id="crmB-activities">0</span></a>'
    +'</nav>'
    +'<div class="langsel"><select id="crmLangDrop"></select></div>'
    +'<div class="storage" id="crmStorageBox">'
    +'<div class="st-row"><span class="st-dot" id="crmSbDot"></span><span id="crmSbLbl">Supabase: getrennt</span></div>'
    +'<div class="st-row"><span class="st-dot" id="crmJsonDot"></span><span id="crmJsonLbl">JSON: nicht verbunden</span></div>'
    +'<button class="btn sec sm block" id="crmJsonBtn">JSON-Datei verbinden</button>'
    +'</div>'
    +'</aside>'
    +'<main class="main"><header class="top"><div><h1 id="crmViewTitle">Dashboard</h1><div class="sub" id="crmViewSub">Überblick über dein Geschäft</div></div>'
    +'<div class="search"><span class="mag">⌕</span><input id="crmSearchInput" data-i18n-ph="h_search" placeholder="Suchen…" autocomplete="off"></div>'
    +'<button class="btn sec" id="crmOutlookBtn">✉ <span data-i18n="h_outlook">Outlook</span></button>'
    +'<button class="btn sec" id="crmExportBtn">⬇ <span data-i18n="h_export">Export</span></button>'
    +'<button class="btn sec" id="crmImportBtn">⇪ <span data-i18n="h_import">Import</span></button>'
    +'<button class="btn sec" id="crmPipeSyncBtn">🔄 Excel-Sync</button>'
    +'<button class="btn" id="crmAddBtn"><span data-i18n="h_new">+ Neu</span></button></header>'
    +'<div class="content" id="crmContent"></div></main></div>'
    +'<div class="ov" id="crmOverlay"><div class="modal" id="crmModal"></div></div>'
    +'<div class="toast" id="crmToast"></div>';
  view.appendChild(wrap);
  root=view;

  root.querySelectorAll("#crmNav a").forEach(function(a){a.addEventListener("click",function(){go(a.dataset.view);});});
  $("#crmSearchInput").addEventListener("input",function(e){state.search=e.target.value;renderAll();});
  $("#crmAddBtn").addEventListener("click",function(){({contacts:contactForm,companies:companyForm,deals:dealForm,activities:activityForm}[state.view]||function(){})();});
  $("#crmImportBtn").addEventListener("click",importWizard);
  $("#crmExportBtn").addEventListener("click",exportMenu);
  $("#crmOutlookBtn").addEventListener("click",outlookMenu);
  $("#crmPipeSyncBtn").addEventListener("click",pipelineSyncOpen);
  $("#crmOverlay").addEventListener("click",function(e){if(e.target===$("#crmOverlay"))closeModal();});
  $("#crmLangDrop").addEventListener("change",function(e){setLang(e.target.value);});
  $("#crmJsonBtn").addEventListener("click",connectJsonFile);
  tryReconnectJson();

  var loading=document.createElement("p"); loading.className="lead"; loading.textContent="Lädt …";
  $("#crmContent").appendChild(loading);

  loadFromSupabase().then(function(){
    rtReady=false; startRealtime();
    applyStaticLang();
    renderAll();
    rtReady=true;
  });
}

/* ============================ Öffentliche API (für inline onclick-Handler) ============================ */
window.MPCRM={
  open:open,
  _close:closeModal,
  _go:go,
  _openDeal:openDeal,_openContact:openContact,_openCompany:openCompany,_openActivity:openActivity,
  _contactForm:function(id){contactForm(byId(db.contacts,id));},
  _companyForm:function(id){companyForm(byId(db.companies,id));},
  _dealForm:function(id){dealForm(byId(db.deals,id));},
  _saveContact:saveContact,_delContact:delContact,
  _saveCompany:saveCompany,_delCompany:delCompany,
  _saveDeal:saveDeal,_delDeal:delDeal,
  _saveActivity:saveActivity,_delActivity:delActivity,
  _toggleAct:toggleAct,_toggleDealDone:toggleDealDone,_followUp:followUpDeal,
  _timesheet:timesheetForm,_saveTs:saveTimesheet,
  _toggleSel:toggleSel,_toggleAllSel:toggleAllSel,_clearSel:clearSel,_bulkDelete:bulkDelete,
  _toggleStage:toggleStage,_showAllStages:showAllStages,
  _dragStart:dragStart,_dragOver:dragOver,_dragLeave:dragLeave,_dropDeal:dropDeal,
  _runImport:runImport,
  _exp:doExport,
  _pipeConnect:pipelineConnect,_pipeRun:pipelineRun,_pipeApply:pipelineApply,_pipeWriteOpen:pipelineWriteOpen,_pipeWriteApply:pipelineWriteApply,
  _fetchOutlook:fetchOutlookInquiries,_importInquiries:importInquiries,_saveClientId:saveClientId,
  _delAct:function(id){db.activities=db.activities.filter(function(a){return a.id!==id;});scheduleSave();}
};
})();
