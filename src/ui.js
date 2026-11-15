/* ===================================================================
   Tarkastusmuistio – käyttöliittymä ja tallennus laitteen omaan muistiin
   =================================================================== */
(function(){
  "use strict";
  var T = KT.TEMPLATES;

  /* ---------------- tallennus: IndexedDB, varalla localStorage ---------------- */
  var DB_NAME = "tarkastusmuistio", idb = null;
  function idbOpen(){
    return new Promise(function(res){
      try {
        if(!window.indexedDB) return res(null);
        var rq = indexedDB.open(DB_NAME, 1);
        rq.onupgradeneeded = function(){ rq.result.createObjectStore("kv"); };
        rq.onsuccess = function(){ res(rq.result); };
        rq.onerror = function(){ res(null); };
      } catch(e){ res(null); }
    });
  }
  function dbGet(key){
    if(!idb){ try { var r = localStorage.getItem("tm_" + key); return Promise.resolve(r ? JSON.parse(r) : null); } catch(e){ return Promise.resolve(null); } }
    return new Promise(function(res){
      try { var rq = idb.transaction("kv", "readonly").objectStore("kv").get(key); rq.onsuccess = function(){ res(rq.result === undefined ? null : rq.result); }; rq.onerror = function(){ res(null); }; }
      catch(e){ res(null); }
    });
  }
  var warned = false;
  function storageFail(e){
    console.error(e);
    if(warned) return; warned = true;
    notify("Tallennus laitteen muistiin epäonnistui (muisti voi olla täynnä). Älä sulje sovellusta: vie tarkastus heti talteen Raportit-välilehdeltä.");
  }
  function dbSet(key, val){
    if(!idb){ try { localStorage.setItem("tm_" + key, JSON.stringify(val)); return Promise.resolve(true); } catch(e){ storageFail(e); return Promise.resolve(false); } }
    return new Promise(function(res){
      try {
        var tx = idb.transaction("kv", "readwrite");
        tx.objectStore("kv").put(val, key);
        tx.oncomplete = function(){ res(true); };
        tx.onerror = tx.onabort = function(){ storageFail(tx.error); res(false); };
      } catch(e){ storageFail(e); res(false); }
    });
  }

  function dbDel(key){
    if(!idb){ try { localStorage.removeItem("tm_" + key); } catch(e){} return Promise.resolve(true); }
    return new Promise(function(res){
      try { var tx = idb.transaction("kv", "readwrite"); tx.objectStore("kv").delete(key); tx.oncomplete = function(){ res(true); }; tx.onerror = tx.onabort = function(){ res(false); }; }
      catch(e){ res(false); }
    });
  }
  function dbKeys(){
    if(!idb){ try { return Promise.resolve(Object.keys(localStorage).filter(function(k){ return k.indexOf("tm_") === 0; }).map(function(k){ return k.slice(3); })); } catch(e){ return Promise.resolve([]); } }
    return new Promise(function(res){
      try { var rq = idb.transaction("kv", "readonly").objectStore("kv").getAllKeys(); rq.onsuccess = function(){ res(rq.result || []); }; rq.onerror = function(){ res([]); }; }
      catch(e){ res([]); }
    });
  }

  var state = { cur: null, history: [], remembered: {}, tab: "tarkastus", view: null, open: {}, more: {} };
  var timer = null;
  function saveCur(){ clearTimeout(timer); timer = null; return dbSet("current", state.cur); }
  function saveSoon(){ clearTimeout(timer); timer = setTimeout(saveCur, 400); }
  function flush(){ if(timer) saveCur(); }
  /* Jokainen raportti omalla avaimellaan, jotta tallennus ei kirjoita kaikkia raportteja kuvineen uudelleen */
  function saveRep(r){ return dbSet("r:" + r.id, r); }
  function delRep(id){ return dbDel("r:" + id); }
  function sameAsSaved(){
    var s = state.cur && findHist(state.cur.id);
    return !!s && JSON.stringify(Object.assign({}, s, { savedAt: 0 })) === JSON.stringify(Object.assign({}, state.cur, { savedAt: 0 }));
  }
  function isUnsaved(){ return !!state.cur && KT.hasContent(state.cur) && !sameAsSaved(); }
  document.addEventListener("visibilitychange", function(){ if(document.visibilityState === "hidden") flush(); });
  window.addEventListener("pagehide", flush);

  /* ---------------- apurit ---------------- */
  function esc(s){ return String(s === undefined || s === null ? "" : s).replace(/[&<>"']/g, function(c){ return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function tpl(){ return T[state.cur.tyyppi]; }
  function getObj(path){
    var a = path.split("/"), o, rest;
    if(a[0] === "hav"){ var f = KT.findHav(state.cur, a[1]); o = f && f.h; rest = a.slice(2); }
    else if(a[0] === "lista"){ o = KT.listItem(state.cur, a[1]); rest = a.slice(2); }
    else if(a[0] === "mitt"){ o = state.cur.mittaukset[a[1]][parseInt(a[2], 10)]; if(o){ o.photos = o.photos || []; o.captions = o.captions || []; } rest = a.slice(3); }
    else if(a[0] === "sign"){ o = state.cur.sign[a[1]] || (state.cur.sign[a[1]] = { name: "", img: null }); rest = a.slice(2); }
    else { o = state.cur; rest = a; }
    for(var i = 0; i < rest.length && o; i++) o = o[rest[i]];
    return o;
  }
  function ref(path){ var i = path.lastIndexOf("/"); return { o: getObj(path.slice(0, i)), k: path.slice(i + 1) }; }
  function busy(msg){
    var b = document.getElementById("busy");
    if(!msg){ if(b) b.remove(); return; }
    if(!b){ b = document.createElement("div"); b.id = "busy"; b.className = "busy"; document.body.appendChild(b); }
    b.textContent = msg;
  }
  /* Omat dialogit (selaimen alert/confirm eivät toimi kaikissa näkymissä) */
  function ask(msg, yes, no){
    return new Promise(function(res){
      closeSheet();
      var h = '<div class="sheet-bg" id="sheet"><div class="sheet"><div class="ask">' + esc(msg).replace(/\n/g, "<br>") + '</div><div class="ask-btns">' +
        (no === null ? "" : '<button class="btn ghost" data-r="0">' + esc(no || "Peruuta") + '</button>') + '<button class="btn primary" data-r="1">' + esc(yes || "OK") + "</button></div></div></div>";
      document.body.insertAdjacentHTML("beforeend", h);
      var el = document.getElementById("sheet");
      el.addEventListener("click", function(e){
        var b = e.target.closest("[data-r]");
        if(b || (e.target === el && no !== null)){ closeSheet(); res(!!(b && b.getAttribute("data-r") === "1")); }
      });
    });
  }
  function notify(msg){ return ask(msg, "OK", null); }
  function toast(msg){ busy(msg); setTimeout(function(){ busy(null); }, 2600); }

  /* ---------------- näkymät ---------------- */
  var app = document.getElementById("app");
  function render(){
    var y = window.scrollY;
    var h = topbar() + '<main id="main">';
    if(state.tab === "ohje") h += renderHelp();
    else if(state.tab === "raportit") h += renderReports();
    else if(!state.cur) h += renderChooser();
    else if(state.tab === "mittaukset") h += renderMeas();
    else h += renderInspection();
    h += "</main>";
    if(state.cur && (state.tab === "tarkastus" || state.tab === "mittaukset"))
      h += '<div class="bottombar"><button class="btn primary" data-a="save">Tallenna raportti</button><button class="btn ghost" data-a="new">Uusi</button></div>';
    app.innerHTML = h;
    initSignatures();
    window.scrollTo(0, y);
  }
  function topbar(){
    var c = state.cur, t = c ? T[c.tyyppi] : null;
    var h = '<header class="top"><div class="top-in"><div class="brand-row"><div class="brand">TARKASTUS<span>MUISTIO</span></div>' +
      '<button class="help" data-a="tab" data-v="ohje">Ohje</button></div>';
    if(c) h += '<div class="addr"><span class="badge">' + t.icon + " " + esc(t.name) + '</span> <span id="top-addr">' + esc(c.meta.osoite || "Osoite puuttuu") + "</span></div>";
    h += '</div><nav class="tabs">';
    [["tarkastus", "Tarkastus"], ["mittaukset", "Mittaukset"], ["raportit", "Raportit" + (state.history.length ? " (" + state.history.length + ")" : "")]].forEach(function(x){
      if(x[0] === "mittaukset" && !c) return;
      h += '<button class="tab' + (state.tab === x[0] ? " on" : "") + '" data-a="tab" data-v="' + x[0] + '">' + x[1] + "</button>";
    });
    return h + "</nav></header>";
  }
  function renderChooser(){
    var h = '<div class="intro"><h2>Aloita uusi tarkastus</h2><p>Valitse tarkastuksen tyyppi. Kaikki tiedot ja kuvat tallentuvat vain tähän laitteeseen.</p></div>';
    Object.keys(T).forEach(function(k){
      h += '<button class="choose" data-a="pick" data-v="' + k + '"><span class="ic">' + T[k].icon + '</span><span><b>' + esc(T[k].name) + "</b><small>" + esc(T[k].desc) + "</small></span></button>";
    });
    return h + '<p class="muted center">Varmuuskopion (.json) voi tuoda Raportit-välilehdeltä.</p>';
  }
  function field(path, f, val){
    var full = f.full ? " full" : "", h = '<div class="fi' + full + '"><label>' + esc(f.l) + "</label>";
    if(f.type === "chips") h += chips(path, f.opts, val);
    else if(f.type === "date") h += '<input type="date" data-p="' + path + '" value="' + esc(val) + '">';
    else if(f.type === "num" && f.neg) h += '<div class="pm"><input inputmode="decimal" data-p="' + path + '" value="' + esc(val) + '"><button class="pmb" data-a="neg" data-v="' + path + '" aria-label="Vaihda etumerkki">±</button></div>';
    else if(f.type === "num") h += '<input inputmode="decimal" data-p="' + path + '" value="' + esc(val) + '" placeholder="' + esc(f.ph || "") + '">';
    else h += '<input data-p="' + path + '" value="' + esc(val) + '" placeholder="' + esc(f.ph || "") + '"' + (f.keep ? ' data-keep="' + f.k + '"' : "") + ">";
    return h + "</div>";
  }
  function chips(path, opts, val, cls){
    return '<div class="chips">' + opts.map(function(o){
      var v = typeof o === "string" ? o : o.k, l = typeof o === "string" ? o : o.l;
      return '<button class="chip' + (cls ? " " + cls + "-" + v : "") + (val === v ? " on" : "") + '" data-chip="' + path + '" data-v="' + esc(v) + '">' + esc(l) + "</button>";
    }).join("") + "</div>";
  }
  function textarea(path, val, ph, rows){ return '<textarea data-p="' + path + '" rows="' + (rows || 3) + '" placeholder="' + esc(ph || "") + '">' + esc(val) + "</textarea>"; }
  function photos(path, obj){
    var n = obj.photos.length, full = n >= KT.MAX_PHOTOS;
    var h = '<div class="ph-bar"><label class="ph-add' + (full ? " dis" : "") + '">📷 ' + (full ? "Enintään " + KT.MAX_PHOTOS + " kuvaa" : "Lisää kuvia") +
      '<input type="file" accept="image/*" multiple data-photos="' + path + '"' + (full ? " disabled" : "") + "></label>" + (n ? '<span class="muted">' + n + " / " + KT.MAX_PHOTOS + "</span>" : "") + "</div>";
    if(n){
      h += '<div class="ph-list">';
      obj.photos.forEach(function(src, i){
        h += '<div class="ph"><div class="th"><img src="' + esc(src) + '" alt=""><button class="x" data-delphoto="' + path + '" data-i="' + i + '" aria-label="Poista kuva">×</button></div>' +
          '<textarea class="cap" data-p="' + path + "/captions/" + i + '" rows="2" placeholder="Kuvateksti">' + esc(obj.captions[i] || "") + "</textarea></div>";
      });
      h += "</div>";
    }
    return h;
  }
  function ehdBox(path, x){
    var t = tpl();
    var h = '<div class="ehd"><label class="lbl">Toimenpide-ehdotus</label>' + textarea(path + "/ehdotus", x.ehdotus, "Mitä pitäisi tehdä", 2) +
      '<label class="lbl">' + esc(t.kiireLabel) + "</label>" + chips(path + "/kiire", t.kiireet, x.kiire);
    if(t.cost) h += '<label class="lbl">' + esc(t.cost) + '</label><input inputmode="decimal" class="cost" data-p="' + path + '/kustannus" value="' + esc(x.kustannus) + '" placeholder="esim. 1500">';
    return h + "</div>";
  }
  function secHead(n, name){ return '<div class="sh"><span class="num">' + n + "</span><h3>" + esc(name) + "</h3></div>"; }

  function renderInspection(){
    var c = state.cur, t = tpl(), h = "";
    h += '<section class="card">' + secHead("", "Perustiedot") + '<div class="grid">';
    t.meta.forEach(function(f){ h += field("meta/" + f.k, f, c.meta[f.k]); });
    h += '</div><label class="lbl">Yleiskuvat – ensimmäinen tulee kansilehdelle</label>' + photos("cover", c.cover) + "</section>";
    h += '<p class="tip">🎤 Vinkki: sanele tekstit puhelimen näppäimistön mikrofonilla.</p>';
    t.sections.forEach(function(s, si){
      var n = String(si + 1);
      if(s.type === "text"){
        h += '<section class="card">' + secHead(n, s.name) + textarea("osat/" + s.k + "/text", c.osat[s.k].text, s.ph, 4) + (s.photos ? photos("osat/" + s.k, c.osat[s.k]) : "") + "</section>";
      } else if(s.type === "choice"){
        h += '<section class="card">' + secHead(n, s.name) + chips("osat/" + s.k + "/valinta", s.opts, c.osat[s.k].valinta, "verdict") + textarea("osat/" + s.k + "/text", c.osat[s.k].text, s.ph, 4) + "</section>";
      } else if(s.type === "checklist"){
        h += '<section class="card nopad"><div class="padx">' + secHead(n, s.name) + '<p class="muted small">Merkitse tila. Korjattavat kohdat tulevat raportin toimenpidetaulukkoon.</p></div>';
        KT.LISTS[s.list].forEach(function(cat){
          var st = KT.listStats(c, cat), open = !!state.open[cat.id];
          h += '<div class="cat"><button class="cat-h" data-a="cat" data-v="' + cat.id + '"><span class="cat-n">' + esc(cat.name) + '</span><span class="cat-c' + (st.done === st.total ? " done" : "") + '">' + st.done + "/" + st.total + '</span><span class="chev' + (open ? " open" : "") + '">›</span></button>';
          if(open){
            h += '<div class="cat-b">';
            cat.items.forEach(function(it){
              var x = c.lista[it.id] || { tila: "", text: "", photos: [] };
              var show = state.more[it.id] || (x.tila && x.tila !== "ok") || KT.filled(x);
              h += '<div class="li' + (x.tila ? " t-" + x.tila : "") + '"><div class="li-l">' + esc(it.l) + "</div>" + chips("lista/" + it.id + "/tila", KT.TILAT.map(function(q){ return { k: q.k, l: q.short }; }), x.tila, "st");
              if(show){ KT.listItem(c, it.id); h += textarea("lista/" + it.id + "/text", x.text, "Huomiot", 2) + photos("lista/" + it.id, c.lista[it.id]); }
              else h += '<button class="link" data-a="more" data-v="' + it.id + '">+ huomio tai kuva</button>';
              h += "</div>";
            });
            if(st.done < st.total) h += '<button class="link pad" data-a="allok" data-v="' + cat.id + '">✓ Merkitse loput kunnossa</button>';
            h += "</div>";
          }
          h += "</div>";
        });
        h += "</section>";
      } else if(s.type === "havainnot"){
        h += '<section class="card">' + secHead(n, s.name);
        c.havainnot.forEach(function(hv, a){
          h += havHtml(hv, n + "." + (a + 1), false, c.havainnot.length);
        });
        h += '<button class="add" data-a="addhav">+ Lisää havainto</button></section>';
      } else if(s.type === "iv"){
        var v = c.iv;
        h += '<section class="card">' + secHead(n, s.name) + '<label class="lbl">Järjestelmä</label>' + chips("iv/tyyppi", KT.IV_TYYPIT, v.tyyppi) +
          '<label class="lbl">Paine-ero</label>' + chips("iv/peTapa", KT.PE_TAVAT, v.peTapa) +
          '<div class="grid"><div class="fi"><label>Tulos</label><input data-p="iv/peTulos" value="' + esc(v.peTulos) + '" placeholder="esim. −5 Pa"></div></div>' +
          textarea("iv/peText", v.peText, "Paine-eron selostus", 2) + '<label class="lbl">Havainnot ilmanvaihdosta</label>' + textarea("iv/text", v.text, "Venttiilit, kanavat, kone…", 3) + photos("iv", v) +
          '<label class="lbl">Oviraot</label>' + textarea("ovi/text", c.ovi.text, "Oviraot ja korvausilma", 2) + photos("ovi", c.ovi) + ehdBox("iv", v) + "</section>";
      } else if(s.type === "sign"){
        h += '<section class="card">' + secHead(n, s.name) + '<div class="grid"><div class="fi full"><label>Paikka</label><input data-p="sign/_place/name" value="' + esc((c.sign._place || {}).name || "") + '" placeholder="esim. Lahti"></div></div>';
        s.roles.forEach(function(r){
          var x = c.sign[r[0]] || {};
          h += '<div class="sig"><label class="lbl">' + esc(r[1]) + "</label>" +
            (x.img ? '<img class="sig-img" src="' + esc(x.img) + '" alt="Allekirjoitus">' : '<canvas class="sig-pad" data-sig="' + r[0] + '"></canvas><div class="muted small">Allekirjoita sormella yllä olevaan kenttään.</div>') +
            '<div class="row"><input data-p="sign/' + r[0] + '/name" value="' + esc(x.name || "") + '" placeholder="Nimenselvennys"><button class="link" data-a="clearsig" data-v="' + r[0] + '">Tyhjennä</button></div></div>';
        });
        h += "</section>";
      }
    });
    return h;
  }
  function havHtml(hv, numTxt, isSub, count){
    var p = "hav/" + hv.id, filled = isSub ? KT.subFilled(hv) : KT.havFilled(hv);
    var h = '<div class="hav' + (isSub ? " sub" : "") + (filled ? " filled" : "") + '"><div class="hav-h"><span class="hnum">' + numTxt + "</span>" +
      '<input class="ttl" data-p="' + p + '/title" value="' + esc(hv.title) + '" placeholder="' + (isSub ? "Tarkennus, esim. Pintakosteus" : "Otsikko, esim. Makuuhuone") + '" data-title="' + hv.id + '">' +
      ((count > 1 || isSub) ? '<button class="del" data-a="delhav" data-v="' + hv.id + '" aria-label="Poista">🗑</button>' : "") + "</div>" +
      textarea(p + "/text", hv.text, "Havainto", 3) + photos(p, hv);
    if(!isSub){
      hv.sub.forEach(function(sb, b){ h += havHtml(sb, numTxt + "." + (b + 1), true); });
      h += '<button class="link" data-a="addsub" data-v="' + hv.id + '">+ Lisää alahavainto</button>' + ehdBox(p, hv);
    }
    return h + "</div>";
  }
  function renderMeas(){
    var c = state.cur, t = tpl(), h = '<p class="tip">Kirjaa vain tehdyt mittaukset. Tyhjät rivit eivät tule raporttiin. Desimaalipilkku käy.</p>';
    t.meas.forEach(function(gid){
      var g = KT.MEAS[gid], rows = c.mittaukset[gid];
      h += '<section class="card"><h3 class="mh">' + esc(g.name) + '</h3><p class="muted small">' + esc(g.note) + "</p>";
      rows.forEach(function(r, i){
        var p = "mitt/" + gid + "/" + i;
        h += '<div class="mrow"><div class="mrow-h"><span>Rivi ' + (i + 1) + '</span><button class="link red" data-a="delrow" data-v="' + gid + '" data-i="' + i + '">Poista rivi</button></div><div class="grid">';
        g.fields.forEach(function(f){ h += field(p + "/" + f.k, f, r[f.k]); });
        h += "</div>";
        var calc = KT.measCalc(gid, r);
        if(g.calc) h += '<div class="calc' + (calc && calc.warn ? " warn" : "") + '" id="calc-' + gid + "-" + i + '">' + (calc ? esc(calc.text) : "") + "</div>";
        if(g.photos){ getObj(p); h += photos(p, r); }
        h += "</div>";
      });
      h += '<button class="add" data-a="addrow" data-v="' + gid + '">+ Lisää rivi</button></section>';
    });
    return h;
  }
  function renderReports(){
    if(state.view) return renderReportView();
    var h = "";
    if(isUnsaved()){
      h += '<h3 class="lh">Kesken oleva</h3><div class="rcard"><div class="rmain" data-a="tab" data-v="tarkastus"><b>' + esc(state.cur.meta.osoite || "Osoite puuttuu") + "</b><small>" + esc(T[state.cur.tyyppi].name) + " · " + esc(KT.fmtDate(state.cur.meta.pvm)) + "</small></div>" +
        '<button class="btn sm" data-a="export" data-v="cur">Vie</button></div>';
    }
    h += '<h3 class="lh">Tallennetut raportit</h3>';
    if(!state.history.length) h += '<div class="empty">Ei vielä tallennettuja raportteja.<br><small>Paina tarkastuksen lopuksi <b>Tallenna raportti</b>.</small></div>';
    state.history.slice().sort(function(a, b){ return (b.savedAt || 0) - (a.savedAt || 0); }).forEach(function(r){
      h += '<div class="rcard"><div class="rmain" data-a="openrep" data-v="' + r.id + '"><b>' + esc(r.meta.osoite || "Osoite puuttuu") + "</b><small>" + T[r.tyyppi].icon + " " + esc(T[r.tyyppi].name) + " · " + esc(KT.fmtDate(r.meta.pvm)) +
        " · tallennettu " + new Date(r.savedAt).toLocaleDateString("fi-FI") + '</small></div><button class="rdel" data-a="delrep" data-v="' + r.id + '" aria-label="Poista">×</button></div>';
    });
    h += '<section class="card"><h3 class="mh">Tuo varmuuskopio</h3><p class="muted small">Valitse aiemmin viety .json-tiedosto. Toimii myös alkuperäisen Kuntotarkastusmuistion tiedostoilla.</p><label class="ph-add">📂 Valitse tiedosto<input type="file" accept=".json,application/json" data-import="1"></label></section>';
    h += '<p class="muted center small" id="quota"></p>';
    setTimeout(showQuota, 0);
    return h;
  }
  function showQuota(){
    var el = document.getElementById("quota");
    if(!el || !navigator.storage || !navigator.storage.estimate) return;
    navigator.storage.estimate().then(function(e){ if(e && e.usage !== undefined) el.textContent = "Laitteen muistia käytössä " + (e.usage / 1048576).toFixed(1) + " Mt"; }).catch(function(){});
  }
  function renderReportView(){
    var r = findHist(state.view);
    if(!r){ state.view = null; return renderReports(); }
    var rep = KT.buildReport(r);
    return '<div class="rv-top"><button class="link" data-a="back">‹ Raportit</button></div>' +
      '<div class="rv-btns"><button class="btn primary sm" data-a="export" data-v="' + r.id + '">Vie / jaa</button><button class="btn ghost sm" data-a="edit" data-v="' + r.id + '">Avaa muokattavaksi</button><button class="btn ghost sm red" data-a="delrep" data-v="' + r.id + '">Poista</button></div>' +
      '<article class="doc">' + blocksToHtml(rep.blocks) + "</article>";
  }
  function blocksToHtml(blocks){
    function t(s){ return esc(s).replace(/\n/g, "<br>"); }
    return blocks.map(function(b){
      switch(b.t){
        case "cover": return '<h1>' + t(b.title) + '</h1><div class="muted">' + t(b.subtitle) + "</div><h2>" + t(b.address) + "</h2>" + (b.photo ? '<img class="dcover" src="' + esc(b.photo) + '">' : "") +
          '<table class="kv">' + b.kv.map(function(r){ return "<tr><td>" + t(r[0]) + "</td><td>" + t(r[1]) + "</td></tr>"; }).join("") + "</table>";
        case "toc": return "";
        case "h1": return '<h2 class="dh1">' + t(b.text) + "</h2>";
        case "h2": return '<h3 class="dh2">' + t(b.text) + "</h3>";
        case "h3": return '<h4 class="dh3">' + t(b.text) + "</h4>";
        case "p": return '<p class="dp">' + (b.bold ? "<b>" + t(b.text) + "</b>" : t(b.text)) + "</p>";
        case "verdict": return '<div class="dverdict">' + t(b.text) + "</div>";
        case "action": return '<div class="daction"><b>Toimenpide-ehdotus:</b> ' + t(b.text || "–") + (b.meta ? '<div class="muted">' + t(b.meta) + "</div>" : "") + "</div>";
        case "kv": return '<table class="kv">' + b.rows.map(function(r){ return "<tr><td>" + t(r[0]) + "</td><td>" + t(r[1]) + "</td></tr>"; }).join("") + "</table>";
        case "table": return '<div class="tw"><table class="dt"><tr>' + b.head.map(function(x){ return "<th>" + t(x) + "</th>"; }).join("") + "</tr>" +
          b.rows.map(function(r){ return "<tr>" + r.map(function(x, i){ return "<td" + (b.status === i ? ' class="s-' + esc(x) + '"' : "") + ">" + t(x) + "</td>"; }).join("") + "</tr>"; }).join("") +
          (b.foot ? "<tr class=\"foot\">" + b.foot.map(function(x){ return "<td>" + t(x) + "</td>"; }).join("") + "</tr>" : "") + "</table></div>";
        case "photos": return '<div class="dph">' + b.items.map(function(it){ return '<figure><img src="' + esc(it.src) + '"><figcaption>' + t(it.cap) + "</figcaption></figure>"; }).join("") + "</div>";
        case "sign": return '<div class="dsign"><div>' + t((b.place ? b.place + ", " : "") + (b.date || "")) + "</div>" + b.parties.map(function(p){ return '<div class="dsp">' + (p.img ? '<img src="' + esc(p.img) + '">' : '<div class="sp"></div>') + "<b>" + t(p.name || "Nimenselvennys") + "</b><div class=\"muted\">" + t(p.role) + "</div></div>"; }).join("") + "</div>";
        default: return "";
      }
    }).join("");
  }
  function renderHelp(){
    return '<div class="rv-top"><button class="link" data-a="tab" data-v="tarkastus">‹ Takaisin</button></div><article class="doc helpdoc">' +
      "<h1>Ohje</h1><p class=\"muted\">" + esc(KT.APP_NAME) + " · versio " + esc(KT.APP_VERSION) + "</p>" +
      "<h3>Tiedot pysyvät tässä laitteessa</h3><p>Sovellus ei lähetä mitään internetiin. Kaikki teksti ja kuvat tallentuvat automaattisesti tämän selaimen muistiin heti kirjoittaessa. Jos selaimen sivustotiedot tyhjennetään, tarkastukset poistuvat – vie siis tärkeät raportit talteen.</p>" +
      "<h3>Kotivalikkoon</h3><p>iPhone: Safari → Jaa → <b>Lisää Koti-valikkoon</b>. Android: Chrome → ⋮ → <b>Lisää aloitusnäytölle</b>. Kun sovellus on kerran avattu, se toimii myös ilman verkkoyhteyttä.</p>" +
      "<h3>Tarkastustyypit</h3><p><b>Kuntotarkastus</b> – ammattimainen yleistarkastus havaintoineen, ilmanvaihtoineen ja mittauksineen.<br><b>Ostokatselmus</b> – oma katselmus ennen ostoa; havainnoille kustannusarviot, jotka lasketaan yhteen.<br><b>Muuttotarkastus</b> – vuokra-asunnon huonekohtainen tarkistus, mittarilukemat ja allekirjoitukset sormella.</p>" +
      "<h3>Kirjaaminen</h3><p>Täytä vain tarvittava; tyhjät kohdat eivät tule raporttiin. Tarkistuslistassa napauta tila (OK, Huom., Korjattava, Ei tark.). <i>Korjattava</i>-kohdat tulevat raportin toimenpidetaulukkoon. Havaintoihin voi lisätä alahavaintoja (esim. 4.1 → 4.1.1) ja toimenpide-ehdotuksen. Tarkastajan tiedot muistetaan seuraavaan tarkastukseen.</p>" +
      "<h3>Kuvat</h3><p>📷 Lisää kuvia avaa kameran tai gallerian. Kohtaan mahtuu " + KT.MAX_PHOTOS + " kuvaa. Kuvat pienennetään tallennettaessa; alkuperäiset jäävät galleriaan. Kuvateksti tulee raporttiin kuvan alle.</p>" +
      "<h3>Raportti</h3><p><b>Tallenna raportti</b> siirtää tarkastuksen Raportit-listaan ja avaa viennin: <b>PDF</b>, <b>Word</b> (muokattava) tai <b>varmuuskopio .json</b>. <i>Jaa</i> avaa puhelimen jakovalikon (sähköposti, WhatsApp, Tiedostot), <i>Lataa</i> tallentaa laitteelle. Word kysyy avattaessa kenttien päivitystä – vastaa Kyllä, niin sisällysluettelo saa sivunumerot.</p>" +
      "<h3>Siirto toiseen laitteeseen</h3><p>Vie raportti .json-tiedostona ja tuo se toisessa laitteessa: Raportit → Tuo varmuuskopio. Alkuperäisen Kuntotarkastusmuistion .json-tiedostot käyvät myös.</p></article>";
  }

  /* ---------------- toiminnot ---------------- */
  function findHist(id){ for(var i = 0; i < state.history.length; i++) if(state.history[i].id === id) return state.history[i]; return null; }
  function rememberKeep(){
    var t = tpl(), changed = false;
    t.meta.forEach(function(f){ if(f.keep && state.remembered[f.k] !== state.cur.meta[f.k]){ state.remembered[f.k] = state.cur.meta[f.k]; changed = true; } });
    if(changed) dbSet("remembered", state.remembered);
  }
  function startNew(type){
    state.cur = KT.fresh(type, state.remembered);
    state.open = {}; state.more = {}; state.tab = "tarkastus";
    saveCur(); render(); window.scrollTo(0, 0);
  }
  function saveReport(){
    flush();
    if(!KT.hasContent(state.cur)){ notify("Tarkastuksessa ei ole vielä sisältöä."); return; }
    var copy = KT.clone(state.cur); copy.savedAt = Date.now();
    var idx = -1; state.history.forEach(function(h, i){ if(h.id === copy.id) idx = i; });
    if(idx > -1) state.history[idx] = copy; else state.history.push(copy);
    saveRep(copy).then(function(ok){ render(); openExport(copy, ok ? "Raportti tallennettu" : "Tallennus epäonnistui – vie tiedosto nyt"); });
  }
  function canShareFiles(){
    try { return !!(navigator.canShare && navigator.canShare({ files: [new File(["x"], "x.pdf", { type: "application/pdf" })] })); } catch(e){ return false; }
  }
  function makeFile(insp, fmt){
    var rep = KT.buildReport(insp), data, mime, ext;
    if(fmt === "pdf"){ data = KT.buildPdf(rep); mime = "application/pdf"; ext = ".pdf"; }
    else if(fmt === "docx"){ data = KT.buildDocx(rep); mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"; ext = ".docx"; }
    else { data = JSON.stringify(KT.exportJson(insp)); mime = "application/json"; ext = ".json"; }
    return { blob: new Blob([data], { type: mime }), name: rep.filename + ext, mime: mime };
  }
  /* Claude-artefaktina ajettaessa lataukset kulkevat alustan oman latausikkunan kautta */
  var dlCap = null;
  try { if(window.claude && typeof window.claude.use === "function") window.claude.use("downloads").then(function(n){ dlCap = n; }).catch(function(){}); } catch(e){}
  function download(f){
    if(dlCap){
      dlCap.save({ filename: f.name, data: f.blob }).then(function(){ toast("Tallennettu: " + f.name); })
        .catch(function(e){ if(!e || e.code !== "declined") notify("Tiedostoa ei voitu tallentaa tässä näkymässä (" + ((e && e.code) || "virhe") + ")."); });
      return;
    }
    var url = URL.createObjectURL(f.blob), a = document.createElement("a");
    a.href = url; a.download = f.name; document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); }, 4000);
    toast("Tallennettu: " + f.name);
  }
  /* Tiedosto tehdään heti napautuksen aikana: jakovalikko (iOS) vaatii, että se avataan suoraan käyttäjän napautuksesta */
  function deliver(insp, fmt, mode){
    var f;
    try { f = makeFile(insp, fmt); } catch(e){ console.error(e); notify("Tiedoston teko epäonnistui: " + e.message); return; }
    if(mode === "share" && canShareFiles()){
      var file = new File([f.blob], f.name, { type: f.mime });
      navigator.share({ files: [file], title: f.name }).catch(function(e){ if(e && e.name !== "AbortError") download(f); });
    } else download(f);
  }
  function openExport(insp, title){
    closeSheet();
    var share = canShareFiles(), name = KT.fileBase(insp);
    var rows = [["pdf", "PDF", "Valmis luettavaksi ja lähetettäväksi"], ["docx", "Word (.docx)", "Muokattava raporttiluonnos"], ["json", "Varmuuskopio (.json)", "Kaikki tiedot ja kuvat – voi tuoda takaisin"]];
    var h = '<div class="sheet-bg" id="sheet"><div class="sheet"><h3>' + esc(title || "Vie raportti") + '</h3><div class="muted small fname">' + esc(name) + "</div>";
    rows.forEach(function(r){
      h += '<div class="exp"><div><b>' + r[1] + "</b><small>" + r[2] + "</small></div>" +
        (share ? '<button class="btn sm primary" data-x="share" data-f="' + r[0] + '">Jaa</button>' : "") +
        '<button class="btn sm ' + (share ? "ghost" : "primary") + '" data-x="dl" data-f="' + r[0] + '">Lataa</button></div>';
    });
    h += '<button class="sheet-close" data-x="close">Sulje</button></div></div>';
    document.body.insertAdjacentHTML("beforeend", h);
    var el = document.getElementById("sheet");
    el.addEventListener("click", function(e){
      var b = e.target.closest("[data-x]");
      if(e.target === el || (b && b.getAttribute("data-x") === "close")){ closeSheet(); return; }
      if(b) deliver(insp, b.getAttribute("data-f"), b.getAttribute("data-x") === "share" ? "share" : "dl");
    });
  }
  function closeSheet(){ var s = document.getElementById("sheet"); if(s) s.remove(); }
  function readPhoto(file){
    return new Promise(function(res, rej){
      var url = URL.createObjectURL(file), im = new Image();
      im.onload = function(){
        var max = 1600, s = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
        var c = document.createElement("canvas"); c.width = Math.round(im.naturalWidth * s); c.height = Math.round(im.naturalHeight * s);
        var g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg", 0.8));
      };
      im.onerror = function(){ URL.revokeObjectURL(url); rej(new Error("Kuvaa ei voitu lukea")); };
      im.src = url;
    });
  }
  function addPhotos(path, files){
    var obj = getObj(path); if(!obj) return;
    var room = KT.MAX_PHOTOS - obj.photos.length, list = Array.prototype.slice.call(files, 0, Math.max(0, room)), skipped = files.length - list.length, fail = 0;
    busy("Lisätään kuvia…");
    var chain = Promise.resolve();
    list.forEach(function(f){ chain = chain.then(function(){ return readPhoto(f).then(function(d){ obj.photos.push(d); obj.captions.push(""); }).catch(function(){ fail++; }); }); });
    chain.then(function(){
      busy(null); saveCur(); render();
      var msgs = [];
      if(skipped > 0) msgs.push(skipped + " kuvaa jätettiin pois: kohtaan mahtuu enintään " + KT.MAX_PHOTOS + " kuvaa.");
      if(fail) msgs.push(fail + " kuvaa ei voitu lukea.");
      if(msgs.length) notify(msgs.join("\n\n"));
    });
  }
  function importFile(file){
    var rd = new FileReader();
    rd.onload = async function(){
      try {
        var insp = KT.importJson(JSON.parse(rd.result));
        var ex = findHist(insp.id);
        if(ex && !(await ask("Raportti \"" + (insp.meta.osoite || "") + "\" on jo listassa. Korvataanko se?", "Korvaa", "Tuo kopiona"))) insp.id = KT.uid();
        insp.savedAt = Date.now();
        state.history = state.history.filter(function(h){ return h.id !== insp.id; }).concat([insp]);
        saveRep(insp).then(function(){ render(); toast("Tuotu: " + (insp.meta.osoite || "raportti")); });
      } catch(e){ notify(e.message || "Tiedostoa ei voitu lukea."); }
    };
    rd.readAsText(file);
  }

  /* ---------------- allekirjoitus sormella ---------------- */
  function initSignatures(){
    app.querySelectorAll("canvas[data-sig]").forEach(function(cv){
      var role = cv.getAttribute("data-sig"), dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
      cv.width = w * dpr; cv.height = h * dpr;
      var g = cv.getContext("2d"); g.scale(dpr, dpr); g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);
      g.lineWidth = 2.2; g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = "#111";
      var drawing = false, drew = false;
      function pt(e){ var r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
      cv.addEventListener("pointerdown", function(e){ drawing = true; cv.setPointerCapture(e.pointerId); var p = pt(e); g.beginPath(); g.moveTo(p[0], p[1]); e.preventDefault(); });
      cv.addEventListener("pointermove", function(e){ if(!drawing) return; var p = pt(e); g.lineTo(p[0], p[1]); g.stroke(); drew = true; e.preventDefault(); });
      function end(){
        if(!drawing) return; drawing = false;
        if(!drew) return;
        var s = state.cur.sign[role] || (state.cur.sign[role] = { name: "", img: null });
        s.img = cv.toDataURL("image/jpeg", 0.85);
        saveSoon();
      }
      cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end); cv.addEventListener("pointerleave", end);
    });
  }
  /* ---------------- tapahtumat ---------------- */
  app.addEventListener("input", function(e){
    var el = e.target, p = el.getAttribute("data-p");
    if(!p || !state.cur) return;
    var r = ref(p); if(!r.o) return;
    r.o[r.k] = el.value;
    if(p === "meta/osoite"){ var ta = document.getElementById("top-addr"); if(ta) ta.textContent = el.value || "Osoite puuttuu"; }
    if(el.hasAttribute("data-keep")) rememberKeep();
    if(p.indexOf("mitt/") === 0){
      var a = p.split("/"), cel = document.getElementById("calc-" + a[1] + "-" + a[2]);
      if(cel){ var c = KT.measCalc(a[1], state.cur.mittaukset[a[1]][+a[2]]); cel.textContent = c ? c.text : ""; cel.className = "calc" + (c && c.warn ? " warn" : ""); }
    }
    saveSoon();
  });
  app.addEventListener("change", function(e){
    var el = e.target;
    if(el.hasAttribute("data-photos") && el.files && el.files.length){ addPhotos(el.getAttribute("data-photos"), el.files); el.value = ""; }
    else if(el.hasAttribute("data-import") && el.files && el.files[0]){ importFile(el.files[0]); el.value = ""; }
  });
  app.addEventListener("click", async function(e){
    var chip = e.target.closest("[data-chip]");
    if(chip){
      var r = ref(chip.getAttribute("data-chip")), v = chip.getAttribute("data-v");
      r.o[r.k] = r.o[r.k] === v ? "" : v;
      saveCur(); render(); return;
    }
    var del = e.target.closest("[data-delphoto]");
    if(del){
      var o = getObj(del.getAttribute("data-delphoto")), i = +del.getAttribute("data-i");
      o.photos.splice(i, 1); o.captions.splice(i, 1); saveCur(); render(); return;
    }
    var b = e.target.closest("[data-a]"); if(!b) return;
    var a = b.getAttribute("data-a"), v = b.getAttribute("data-v");
    if(a === "tab"){ flush(); state.tab = v; state.view = null; render(); window.scrollTo(0, 0); }
    else if(a === "pick") startNew(v);
    else if(a === "new"){
      flush();
      var unsaved = isUnsaved();
      if(unsaved && !(await ask("Aloitetaanko uusi tarkastus?\n\nKesken olevaa ei ole tallennettu raportiksi, ja se poistuu.", "Aloita uusi"))) return;
      state.cur = null; dbSet("current", null); state.tab = "tarkastus"; render(); window.scrollTo(0, 0);
    }
    else if(a === "save") saveReport();
    else if(a === "cat"){ state.open[v] = !state.open[v]; render(); }
    else if(a === "more"){ state.more[v] = true; render(); }
    else if(a === "allok"){
      KT.LISTS[tpl().sections.filter(function(s){ return s.type === "checklist"; })[0].list].forEach(function(c){
        if(c.id !== v) return; c.items.forEach(function(it){ var x = KT.listItem(state.cur, it.id); if(!x.tila) x.tila = "ok"; });
      });
      saveCur(); render();
    }
    else if(a === "addhav"){ var h = KT.blankHav(); state.cur.havainnot.push(h); saveCur(); render(); focusTitle(h.id); }
    else if(a === "addsub"){ var f = KT.findHav(state.cur, v), s = KT.blankSub(); f.h.sub.push(s); saveCur(); render(); focusTitle(s.id); }
    else if(a === "delhav"){
      var fh = KT.findHav(state.cur, v); if(!fh) return;
      var has = fh.parent ? KT.subFilled(fh.h) : KT.havFilled(fh.h);
      if(has && !(await ask("Poistetaanko havainto" + (fh.h.title ? " \"" + fh.h.title + "\"" : "") + (fh.h.sub && fh.h.sub.length ? " alahavaintoineen" : "") + "?", "Poista"))) return;
      fh.list.splice(fh.idx, 1);
      if(!state.cur.havainnot.length) state.cur.havainnot.push(KT.blankHav());
      saveCur(); render();
    }
    else if(a === "neg"){
      var nr = ref(v), nv = String(nr.o[nr.k] || "").trim().replace(/^−/, "-");
      nr.o[nr.k] = nv.charAt(0) === "-" ? nv.slice(1) : "-" + nv;
      saveCur(); render();
    }
    else if(a === "addrow"){ state.cur.mittaukset[v].push({}); saveCur(); render(); }
    else if(a === "delrow"){
      var rows = state.cur.mittaukset[v], ix = +b.getAttribute("data-i");
      if(!KT.rowEmpty(v, rows[ix]) && !(await ask("Poistetaanko rivi?", "Poista"))) return;
      rows.splice(ix, 1); saveCur(); render();
    }
    else if(a === "clearsig"){ var sg = state.cur.sign[v]; if(sg) sg.img = null; saveCur(); render(); }
    else if(a === "export"){ flush(); openExport(v === "cur" ? state.cur : findHist(v)); }
    else if(a === "openrep"){ state.view = v; render(); window.scrollTo(0, 0); }
    else if(a === "back"){ state.view = null; render(); }
    else if(a === "edit"){
      var rp = findHist(v); if(!rp) return;
      if(state.cur && state.cur.id !== rp.id && isUnsaved() &&
         !(await ask("Kesken olevaa tarkastusta ei ole tallennettu raportiksi. Korvataanko se tällä raportilla?", "Korvaa"))) return;
      state.cur = KT.normalize(KT.clone(rp)); delete state.cur.savedAt;
      saveCur(); state.view = null; state.tab = "tarkastus"; render(); window.scrollTo(0, 0);
    }
    else if(a === "delrep"){
      var rr = findHist(v); if(!rr) return;
      if(!(await ask("Poistetaanko raportti \"" + (rr.meta.osoite || "") + "\" pysyvästi?", "Poista"))) return;
      state.history = state.history.filter(function(x){ return x.id !== v; }); state.view = null; delRep(v); render();
    }
  });
  function focusTitle(id){ var el = app.querySelector('[data-title="' + id + '"]'); if(el){ el.focus(); el.scrollIntoView({ block: "center" }); } }

  /* ---------------- käynnistys ---------------- */
  idbOpen().then(function(db){
    idb = db;
    return Promise.all([dbGet("current"), dbGet("remembered"), dbKeys(), dbGet("history")]);
  }).then(function(v){
    function safe(x){ try { return x ? KT.normalize(x) : null; } catch(e){ console.error(e); return null; } }
    state.cur = safe(v[0]);
    state.remembered = (v[1] && typeof v[1] === "object") ? v[1] : {};
    var keys = v[2].filter(function(k){ return typeof k === "string" && k.indexOf("r:") === 0; });
    return Promise.all(keys.map(dbGet)).then(function(reps){
      state.history = reps.map(safe).filter(Boolean);
      /* Version 1.0 tallennus (kaikki raportit yhdessä) siirretään uuteen muotoon */
      var old = (Array.isArray(v[3]) ? v[3] : []).map(safe).filter(Boolean).filter(function(r){ return !findHist(r.id); });
      if(!old.length) return;
      state.history = state.history.concat(old);
      return Promise.all(old.map(saveRep)).then(function(oks){ if(oks.every(Boolean)) return dbDel("history"); });
    });
  }).then(render);
  try { if(navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch(e){}
  try {
    if("serviceWorker" in navigator && /^https?:$/.test(location.protocol) && window.self === window.top)
      navigator.serviceWorker.register("sw.js").catch(function(){});
  } catch(e){}
})();
