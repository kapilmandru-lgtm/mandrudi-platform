/* ===== Mandrudi Plattform – App (Phase 0) ===== */
(function(){
"use strict";

/* ---- Tool-Registry: die 16 bestehenden Tools als Add-ons ---- */
var TOOLS=[
 {s:"reifegrad-check",n:"Reifegrad-Check",d:"Digitaler Reifegrad Ihrer Lieferkette – Score & Empfehlungen.",c:"sc"},
 {s:"s4hana-readiness-check",n:"S/4HANA-Readiness",d:"Wie bereit sind Sie für die Migration? Lücken & Schritte.",c:"sc"},
 {s:"ewm-tm-eignungs-check",n:"EWM/TM-Eignung",d:"Lohnt sich SAP EWM (Lager) oder TM (Transport)?",c:"sc"},
 {s:"lager-kpi-rechner",n:"Lager-KPI-Rechner",d:"Umschlag, Reichweite, Kapitalbindung, Pick-Leistung.",c:"sc"},
 {s:"sicherheitsbestand-rechner",n:"Sicherheitsbestand",d:"Optimaler Sicherheits- und Meldebestand nach Servicegrad.",c:"sc"},
 {s:"roi-rechner",n:"ROI-/Einsparungs-Rechner",d:"Einsparpotenzial in €/Jahr aus Automatisierung & Bestand.",c:"sc"},
 {s:"oee-rechner",n:"OEE-Rechner",d:"Gesamtanlageneffektivität: Verfügbarkeit × Leistung × Qualität.",c:"sc"},
 {s:"durchlaufzeit-analyzer",n:"Durchlaufzeit-Analyzer",d:"Wertschöpfungsanteil vs. Verschwendung im Prozess.",c:"sc"},
 {s:"ki-potenzial-check",n:"KI-Potenzial-Check",d:"Die drei passendsten KI-Use-Cases für Ihren Betrieb.",c:"dig"},
 {s:"ki-reifegrad-check",n:"KI-Reifegrad-Check",d:"Ist Ihre Organisation bereit für KI? (Daten, Skills, Governance)",c:"dig"},
 {s:"digitalisierungsgrad-check",n:"Digitalisierungsgrad-Check",d:"Wie digital ist Ihr Unternehmen insgesamt?",c:"dig"},
 {s:"prozess-automatisierung-check",n:"Prozess-Automatisierung",d:"Welche Prozesse zuerst automatisieren? Top-3 mit Ansatz.",c:"dig"},
 {s:"automatisierungs-rechner",n:"Automatisierungs-Rechner",d:"Einsparung €/Jahr, freigesetzte Kapazität & Amortisation.",c:"dig"},
 {s:"ki-roi-rechner",n:"KI-/Digitalprojekt-ROI",d:"Rechnet sich Ihr Vorhaben? Netto, Amortisation, ROI.",c:"dig"},
 {s:"co2-logistik-rechner",n:"CO₂-/ESG-Rechner",d:"Grobe Emissions-Schätzung aus Transport und Lager.",c:"dig"},
 {s:"projekt-konfigurator",n:"Projekt-Konfigurator",d:"In 3 Fragen zum passenden Leistungspaket.",c:"both"}
];
var TOOL_BASE="https://tools.mandrudi.com/";

/* ---- i18n (Chrome vollständig; Detailtexte fallen auf DE zurück) ---- */
var I18N={
 de:{app_name:"Mandrudi Plattform",auth_sub:"Modulare Werkzeuge für Supply Chain, Dokumente & Projekte.",
  auth_email:"E-Mail",auth_pass:"Passwort",auth_login:"Anmelden",auth_register:"Registrieren",auth_demo:"Ohne Konto ansehen (Demo)",
  logout:"Abmelden",nav_dashboard:"Übersicht",nav_dms:"Dokumente",nav_pm:"Projekte",nav_tools:"Tools & Add-ons",
  phase0:"Phase 0 · Gerüst",dash_hi:"Willkommen",dash_sub:"Wähle links ein Modul. Dokumente und Projekte kommen als Nächstes; die Tools sind bereits als Add-ons verfügbar.",
  dash_dms:"Ablegen, suchen, teilen",dash_pm:"Aufgaben & Boards",dash_tools:"16 Rechner & Checks",soon:"In Phase 1",
  dms_intro:"Das Dokumentenmanagement (DMS) wird hier gebaut. Geplant:",
  dms_f1:"PDF hochladen (Original behalten)",dms_f2:"Suche, Ordner & Tags",dms_f3:"Versionen, unveränderbare Ablage, Aufbewahrungsfristen (GoBD)",
  dms_f4:"Dokumente per E-Mail teilen",dms_f5:"Nach Excel exportieren & auswerten (Charts)",dms_f6:"Rollen & Rechte je Nutzer",
  pm_intro:"Das Projektmanagement (PM) dockt als zweites Modul an denselben Kern an. Geplant:",
  pm_f1:"Projekte, Aufgaben (Liste & Board), Zuständige, Fälligkeiten",pm_f2:"Kommentare & Aktivität",pm_f3:"Verknüpfung zu DMS-Dokumenten",
  tools_intro:"Deine bestehenden Tools – je Bedarf zuschalten. Aktive Tools öffnest du direkt hier.",
  back:"Zurück",open_new:"Neuer Tab ↗",cat_sc:"Supply Chain",cat_dig:"Mandrudi Digital",cat_both:"Für beide",open_tool:"Öffnen"},
 en:{app_name:"Mandrudi Platform",auth_sub:"Modular tools for supply chain, documents & projects.",
  auth_email:"Email",auth_pass:"Password",auth_login:"Sign in",auth_register:"Register",auth_demo:"View without account (demo)",
  logout:"Sign out",nav_dashboard:"Overview",nav_dms:"Documents",nav_pm:"Projects",nav_tools:"Tools & Add-ons",
  phase0:"Phase 0 · Skeleton",dash_hi:"Welcome",dash_sub:"Pick a module on the left. Documents and projects are next; the tools are already available as add-ons.",
  dash_dms:"Store, search, share",dash_pm:"Tasks & boards",dash_tools:"16 calculators & checks",soon:"In phase 1",
  dms_intro:"The document management (DMS) is built here. Planned:",tools_intro:"Your existing tools – enable as needed. Open active tools right here.",
  pm_intro:"Project management (PM) docks onto the same core as the second module. Planned:",
  back:"Back",open_new:"New tab ↗",cat_sc:"Supply Chain",cat_dig:"Mandrudi Digital",cat_both:"For both",open_tool:"Open"},
 fr:{app_name:"Plateforme Mandrudi",auth_sub:"Outils modulaires pour supply chain, documents & projets.",
  auth_email:"E-mail",auth_pass:"Mot de passe",auth_login:"Se connecter",auth_register:"S'inscrire",auth_demo:"Voir sans compte (démo)",
  logout:"Déconnexion",nav_dashboard:"Aperçu",nav_dms:"Documents",nav_pm:"Projets",nav_tools:"Outils & Add-ons",
  phase0:"Phase 0 · Ossature",dash_hi:"Bienvenue",dash_sub:"Choisissez un module à gauche. Documents et projets à venir ; les outils sont déjà disponibles en add-ons.",
  dash_dms:"Classer, chercher, partager",dash_pm:"Tâches & tableaux",dash_tools:"16 calculateurs & checks",soon:"En phase 1",
  dms_intro:"La gestion documentaire (DMS) se construit ici. Prévu :",tools_intro:"Vos outils existants – à activer selon les besoins. Ouvrez les outils actifs ici.",
  pm_intro:"La gestion de projet (PM) s'ajoute au même cœur comme deuxième module. Prévu :",
  back:"Retour",open_new:"Nouvel onglet ↗",cat_sc:"Supply Chain",cat_dig:"Mandrudi Digital",cat_both:"Pour les deux",open_tool:"Ouvrir"},
 es:{app_name:"Plataforma Mandrudi",auth_sub:"Herramientas modulares para supply chain, documentos y proyectos.",
  auth_email:"Correo",auth_pass:"Contraseña",auth_login:"Iniciar sesión",auth_register:"Registrarse",auth_demo:"Ver sin cuenta (demo)",
  logout:"Cerrar sesión",nav_dashboard:"Resumen",nav_dms:"Documentos",nav_pm:"Proyectos",nav_tools:"Herramientas & Add-ons",
  phase0:"Fase 0 · Estructura",dash_hi:"Bienvenido",dash_sub:"Elija un módulo a la izquierda. Documentos y proyectos vienen después; las herramientas ya están disponibles como add-ons.",
  dash_dms:"Guardar, buscar, compartir",dash_pm:"Tareas y tableros",dash_tools:"16 calculadoras y checks",soon:"En fase 1",
  dms_intro:"La gestión documental (DMS) se construye aquí. Previsto:",tools_intro:"Sus herramientas existentes – actívelas según necesite. Abra las activas aquí.",
  pm_intro:"La gestión de proyectos (PM) se acopla al mismo núcleo como segundo módulo. Previsto:",
  back:"Atrás",open_new:"Nueva pestaña ↗",cat_sc:"Supply Chain",cat_dig:"Mandrudi Digital",cat_both:"Para ambos",open_tool:"Abrir"},
 it:{app_name:"Piattaforma Mandrudi",auth_sub:"Strumenti modulari per supply chain, documenti e progetti.",
  auth_email:"E-mail",auth_pass:"Password",auth_login:"Accedi",auth_register:"Registrati",auth_demo:"Guarda senza account (demo)",
  logout:"Esci",nav_dashboard:"Panoramica",nav_dms:"Documenti",nav_pm:"Progetti",nav_tools:"Strumenti & Add-on",
  phase0:"Fase 0 · Struttura",dash_hi:"Benvenuto",dash_sub:"Scegli un modulo a sinistra. Documenti e progetti in arrivo; gli strumenti sono già disponibili come add-on.",
  dash_dms:"Archivia, cerca, condividi",dash_pm:"Attività e board",dash_tools:"16 calcolatori e check",soon:"In fase 1",
  dms_intro:"La gestione documentale (DMS) si costruisce qui. Previsto:",tools_intro:"I tuoi strumenti esistenti – attivali all'occorrenza. Apri quelli attivi qui.",
  pm_intro:"La gestione progetti (PM) si aggancia allo stesso nucleo come secondo modulo. Previsto:",
  back:"Indietro",open_new:"Nuova scheda ↗",cat_sc:"Supply Chain",cat_dig:"Mandrudi Digital",cat_both:"Per entrambi",open_tool:"Apri"},
 ro:{app_name:"Platforma Mandrudi",auth_sub:"Instrumente modulare pentru supply chain, documente și proiecte.",
  auth_email:"E-mail",auth_pass:"Parolă",auth_login:"Autentificare",auth_register:"Înregistrare",auth_demo:"Vizualizare fără cont (demo)",
  logout:"Deconectare",nav_dashboard:"Prezentare",nav_dms:"Documente",nav_pm:"Proiecte",nav_tools:"Instrumente & Add-on-uri",
  phase0:"Faza 0 · Schelet",dash_hi:"Bun venit",dash_sub:"Alegeți un modul în stânga. Documente și proiecte urmează; instrumentele sunt deja disponibile ca add-on-uri.",
  dash_dms:"Stocare, căutare, partajare",dash_pm:"Sarcini și panouri",dash_tools:"16 calculatoare și check-uri",soon:"În faza 1",
  dms_intro:"Managementul documentelor (DMS) se construiește aici. Planificat:",tools_intro:"Instrumentele existente – activați după nevoie. Deschideți-le pe cele active aici.",
  pm_intro:"Managementul de proiect (PM) se conectează la același nucleu ca al doilea modul. Planificat:",
  back:"Înapoi",open_new:"Filă nouă ↗",cat_sc:"Supply Chain",cat_dig:"Mandrudi Digital",cat_both:"Pentru ambele",open_tool:"Deschide"}
};
var lang="de";
function t(k){var d=I18N[lang]||I18N.de;return (d[k]!=null?d[k]:(I18N.de[k]!=null?I18N.de[k]:null));}
function setLang(l){
  if(!I18N[l])l="de"; lang=l; document.documentElement.lang=l; try{localStorage.setItem("mp-lang",l);}catch(e){}
  document.querySelectorAll("[data-i18n]").forEach(function(el){var v=t(el.getAttribute("data-i18n"));if(v!=null)el.textContent=v;});
  document.querySelectorAll("[data-i18n-ph]").forEach(function(el){var v=t(el.getAttribute("data-i18n-ph"));if(v!=null)el.setAttribute("placeholder",v);});
  var s=document.getElementById("langSel"); if(s)s.value=l;
  renderTools();
}

/* ---- Theme ---- */
function applyTheme(mode){document.documentElement.setAttribute("data-theme",mode);try{localStorage.setItem("mp-theme",mode);}catch(e){}}
function toggleTheme(){var cur=document.documentElement.getAttribute("data-theme");
  if(!cur){cur=window.matchMedia&&matchMedia("(prefers-color-scheme:dark)").matches?"dark":"light";}
  applyTheme(cur==="dark"?"light":"dark");}

/* ---- Navigation ---- */
function show(view){
  document.querySelectorAll(".view").forEach(function(v){v.classList.add("hidden");});
  var el=document.getElementById("view-"+view); if(el)el.classList.remove("hidden");
  document.querySelectorAll(".nav-item").forEach(function(b){b.classList.toggle("active",b.getAttribute("data-view")===view);});
}

/* ---- Add-ons (Tools) ---- */
function enabledSet(){try{return new Set(JSON.parse(localStorage.getItem("mp-tools")||"[]"));}catch(e){return new Set();}}
function saveEnabled(set){try{localStorage.setItem("mp-tools",JSON.stringify([].concat.apply([],[Array.from(set)])));}catch(e){}}
function renderTools(){
  var grid=document.getElementById("toolGrid"); if(!grid)return;
  var en=enabledSet(); grid.innerHTML="";
  TOOLS.forEach(function(tool){
    var card=document.createElement("div"); card.className="tool-card"+(en.has(tool.s)?"":" off");
    var cat=document.createElement("div"); cat.className="tc-cat"; cat.textContent=t("cat_"+tool.c); card.appendChild(cat);
    var nm=document.createElement("div"); nm.className="tc-name"; nm.textContent=tool.n; card.appendChild(nm);
    var ds=document.createElement("div"); ds.className="tc-desc"; ds.textContent=tool.d; card.appendChild(ds);
    var row=document.createElement("div"); row.className="tc-row";
    var open=document.createElement("button"); open.className="btn btn-primary btn-sm"; open.textContent=t("open_tool");
    open.disabled=!en.has(tool.s); open.style.opacity=en.has(tool.s)?"1":".5";
    open.onclick=function(){openTool(tool);};
    var sw=document.createElement("label"); sw.className="switch";
    var cb=document.createElement("input"); cb.type="checkbox"; cb.checked=en.has(tool.s);
    cb.onchange=function(){var s=enabledSet(); if(cb.checked)s.add(tool.s); else s.delete(tool.s); saveEnabled(s); renderTools();};
    var sl=document.createElement("span"); sl.className="slider"; sw.appendChild(cb); sw.appendChild(sl);
    row.appendChild(open); row.appendChild(sw); card.appendChild(row); grid.appendChild(card);
  });
}
function openTool(tool){
  var url=TOOL_BASE+tool.s+"/?lang="+lang;
  document.getElementById("frameTitle").textContent=tool.n;
  document.getElementById("frameOpen").href=url;
  document.getElementById("toolFrame").src=url;
  show("frame");
}

/* ---- Auth ---- */
var supa=null, DEMO=true;
function enterApp(email){
  document.getElementById("auth").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  document.getElementById("userEmail").textContent=email||"";
  show("dashboard");
}
function authMsg(msg,err){var m=document.getElementById("authMsg");m.textContent=msg||"";m.className="auth-msg"+(err?" err":"");}

function loadScript(src){return new Promise(function(res,rej){var s=document.createElement("script");s.src=src;s.onload=res;s.onerror=rej;document.head.appendChild(s);});}

async function initAuth(){
  var cfg=window.MP_CONFIG||{};
  var noteEl=document.getElementById("authMode");
  if(cfg.SUPABASE_URL && cfg.SUPABASE_ANON){
    DEMO=false;
    try{
      await loadScript("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js");
      supa=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON);
      var ses=await supa.auth.getSession();
      if(ses.data.session){enterApp(ses.data.session.user.email);}
      noteEl.textContent="";
    }catch(e){DEMO=true; noteEl.textContent="Supabase nicht erreichbar – Demo-Modus.";}
  }else{
    DEMO=true; noteEl.textContent="Demo-Modus (lokal). Login wird echt, sobald das Supabase-Konto in config.js eingetragen ist.";
  }
  // buttons
  document.getElementById("btnDemo").onclick=function(){enterApp("demo@lokal");};
  document.getElementById("btnLogin").onclick=async function(){
    if(DEMO){authMsg("Noch kein Login eingerichtet – nutze „Demo\" oder trage Supabase in config.js ein.",true);return;}
    var e=val("authEmail"),p=val("authPass"); if(!e||!p){authMsg("Bitte E-Mail und Passwort eingeben.",true);return;}
    authMsg("…");var r=await supa.auth.signInWithPassword({email:e,password:p});
    if(r.error)authMsg(r.error.message,true); else enterApp(r.data.user.email);
  };
  document.getElementById("btnRegister").onclick=async function(){
    if(DEMO){authMsg("Registrierung braucht das Supabase-Konto (config.js).",true);return;}
    var e=val("authEmail"),p=val("authPass"); if(!e||!p){authMsg("Bitte E-Mail und Passwort eingeben.",true);return;}
    authMsg("…");var r=await supa.auth.signUp({email:e,password:p});
    if(r.error)authMsg(r.error.message,true); else authMsg("Konto erstellt – bitte E-Mail bestätigen, dann anmelden.");
  };
  document.getElementById("btnLogout").onclick=async function(){
    if(supa){try{await supa.auth.signOut();}catch(e){}}
    document.getElementById("app").classList.add("hidden");
    document.getElementById("auth").classList.remove("hidden");
    authMsg("");
  };
}
function val(id){return (document.getElementById(id)||{}).value||"";}

/* ---- Logo ---- */
function loadLogo(){
  fetch("assets/logo.txt").then(function(r){return r.text();}).then(function(src){
    src=src.trim(); if(!src)return;
    var a=document.getElementById("authLogo"),b=document.getElementById("brandLogo");
    if(a)a.src=src; if(b)b.src=src;
  }).catch(function(){});
}

/* ---- Init ---- */
function init(){
  // theme
  var th=null; try{th=localStorage.getItem("mp-theme");}catch(e){} if(th)applyTheme(th);
  document.getElementById("themeBtn").onclick=toggleTheme;
  // lang
  var l=null; try{l=localStorage.getItem("mp-lang");}catch(e){}
  var br=(navigator.language||"de").slice(0,2).toLowerCase();
  setLang(I18N[l]?l:(I18N[br]?br:"de"));
  document.getElementById("langSel").onchange=function(){setLang(this.value);};
  // nav
  document.querySelectorAll("[data-view]").forEach(function(b){b.addEventListener("click",function(){show(b.getAttribute("data-view"));});});
  document.getElementById("frameBack").onclick=function(){document.getElementById("toolFrame").src="about:blank";show("tools");};
  renderTools(); loadLogo(); initAuth();
}
if(document.readyState!=="loading")init(); else document.addEventListener("DOMContentLoaded",init);
})();
