/* ===================================================================
   Tarkastusmuistio – ydin: tietomalli, pohjat, raportti, Word ja PDF.
   Ei ulkoisia kirjastoja eikä verkkokutsuja.
   =================================================================== */
var KT = (function(){
  "use strict";

  var APP_NAME = "Tarkastusmuistio";
  var APP_VERSION = "1.1 (15.11.2026)";
  var JSON_FORMAT = "tarkastusmuistio";
  var MAX_PHOTOS = 12;

  /* ---------------- apufunktiot ---------------- */
  function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function pad2(n){ return String(n).padStart(2, "0"); }
  function todayISO(){ var d = new Date(); return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
  function fmtDate(iso){
    if(!iso) return "";
    var p = String(iso).split("-");
    return p.length === 3 ? parseInt(p[2], 10) + "." + parseInt(p[1], 10) + "." + p[0] : iso;
  }
  function num(v){
    if(v === undefined || v === null) return NaN;
    v = String(v).replace(/\s/g, "").replace(",", ".").replace("−", "-");
    return v === "" ? NaN : parseFloat(v);
  }
  /* Rahasumma: hyväksytään vain puhdas luku ("1 500", "1500,50 €"), ei esim. vaihteluväliä */
  function money(v){
    var t = String(v === undefined || v === null ? "" : v).replace(/[\s\u00a0€]/g, "").replace(",", ".");
    return /^-?\d+(\.\d+)?$/.test(t) ? parseFloat(t) : NaN;
  }
  function fmt1(x){ return x.toFixed(1).replace(".", ","); }
  function fmtEur(x){
    var s = Math.round(x).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return s + " €";
  }
  /* Vesihöyryn määrä g/m³ lämpötilasta ja suhteellisesta kosteudesta (Magnus) */
  function absHum(t, rh){
    var ps = 6.112 * Math.exp(17.67 * t / (t + 243.5));
    return ps * rh * 2.1674 / (273.15 + t);
  }
  function clone(o){ return JSON.parse(JSON.stringify(o)); }
  function trim(s){ return (s === undefined || s === null) ? "" : String(s).trim(); }

  /* ---------------- vakiot ---------------- */
  var TILAT = [
    { k: "ok", l: "Kunnossa", short: "OK" },
    { k: "huom", l: "Huomioitavaa", short: "Huom." },
    { k: "korj", l: "Korjattava", short: "Korjattava" },
    { k: "et", l: "Ei tarkastettu", short: "Ei tark." }
  ];
  function tilaLabel(k){ for(var i = 0; i < TILAT.length; i++) if(TILAT[i].k === k) return TILAT[i].l; return ""; }

  /* Mittaustaulukot. Kentän tyyppi: text (oletus), num tai chips. */
  var MEAS = {
    ilma: { name: "Ilman lämpötila ja kosteus", note: "Ulkoilma, asuinhuone ja tilat, joissa tehdään porareikämittauksia. Vesihöyryn määrä lasketaan.",
      fields: [{k:"paikka", l:"Paikka", full:true}, {k:"t", l:"Lämpötila °C", type:"num", neg:true}, {k:"rh", l:"RH %", type:"num"}],
      calc: "ah", initial: [{paikka:"Ulkoilma"}, {paikka:"Asuinhuone"}] },
    korkeus: { name: "Korkeuserot", note: "Maanpinnan ja lattian pienin korkeusero sekä puurungon alaosan etäisyys maasta. Alle 15 cm on riski.",
      fields: [{k:"paikka", l:"Kohta", full:true}, {k:"lattia", l:"Maanpinta–lattia cm", type:"num"}, {k:"runko", l:"Puurunko–maa cm", type:"num"}],
      calc: "h15" },
    ryomintatila: { name: "Ryömintätilan korkeus", note: "Matalin korkeus tarkastettavissa olevalla alueella.",
      fields: [{k:"paikka", l:"Kohta", full:true}, {k:"korkeus", l:"Matalin korkeus cm", type:"num", full:true}, {k:"huom", l:"Tarkenne", full:true}] },
    salaoja: { name: "Salaojakaivot", note: "Salaojaputken alareunan syvyys kaivon kannesta noin ±5 cm tarkkuudella.",
      fields: [{k:"kaivo", l:"Kaivo / sijainti", full:true}, {k:"putki", l:"Putken alareuna kannesta cm", type:"num", full:true},
               {k:"liete", l:"Lietettä", type:"chips", opts:["Ei", "Vähän", "Paljon"], full:true}, {k:"kunto", l:"Kaivon kunto", full:true}] },
    porareika: { name: "Porareikä- ja rasiaporamittaukset", note: "Rakenteen kosteus. Vesihöyryn määrä lasketaan.",
      fields: [{k:"menetelma", l:"Menetelmä", type:"chips", opts:["Porareikä", "Rasiapora-avaus"], full:true}, {k:"paikka", l:"Paikka", full:true},
               {k:"rakenne", l:"Rakenne", full:true}, {k:"t", l:"Lämpötila °C", type:"num", neg:true}, {k:"rh", l:"RH %", type:"num"},
               {k:"puu", l:"Puun kosteus %", type:"num"}, {k:"huom", l:"Havainto", full:true}],
      calc: "ah", photos: true },
    kallistus: { name: "Märkätilojen kallistukset", note: "Vesivaa'alla tai vettä valuttamalla.",
      fields: [{k:"tila", l:"Tila", full:true}, {k:"tulos", l:"Kallistus kaivoon", type:"chips", opts:["Hyvä", "Riittämätön", "Vastakallistus"], full:true}] },
    vesi: { name: "Käyttövesi", note: "Lämpimän veden lämpötila kauimmaisesta sekoittimesta.",
      fields: [{k:"paikka", l:"Sekoitin / paikka", full:true}, {k:"t", l:"Lämmin vesi °C", type:"num"}, {k:"virtaama", l:"Virtaama", type:"chips", opts:["Ok", "Heikko"]}] },
    kartoitus: { name: "Kosteuskartoitus tiloittain", note: "Pintakosteusosoittimella. Pisteväli ja tulos.",
      fields: [{k:"tila", l:"Tila", full:true}, {k:"vali", l:"Pisteväli", type:"chips", opts:["0,2–0,5 m", "1–3 m"], full:true},
               {k:"tulos", l:"Tulos", type:"chips", opts:["Ei poikkeavaa", "Poikkeava"], full:true}, {k:"huom", l:"Tarkenne", full:true}] },
    iv: { name: "Ilmanvaihdon virtaussuunta", note: "Merkkisavulla tai paperilla venttiileittäin.",
      fields: [{k:"venttiili", l:"Tila / venttiili", full:true}, {k:"suunta", l:"Suunta", type:"chips", opts:["Poisto", "Tulo", "Ei virtausta"], full:true}, {k:"huom", l:"Tarkenne", full:true}] },
    mittari: { name: "Mittarilukemat", note: "Kirjaa lukemat luovutushetkellä. Mittarista voi ottaa kuvan.",
      fields: [{k:"mittari", l:"Mittari", full:true}, {k:"lukema", l:"Lukema", full:true}, {k:"huom", l:"Tarkenne", full:true}],
      initial: [{mittari:"Kylmä vesi"}, {mittari:"Lämmin vesi"}, {mittari:"Sähkö"}], photos: true },
    muut: { name: "Muut mittaukset", note: "Esim. lämmitysverkoston paine tai radonmittauksen tulos.",
      fields: [{k:"mittaus", l:"Mittaus", full:true}, {k:"arvo", l:"Tulos", full:true}] }
  };

  /* Tarkistuslistat: [kategoria, [kohdat]] */
  function mkList(prefix, cats){
    return cats.map(function(c, ci){
      return { id: prefix + ci, name: c[0], items: c[1].map(function(l, ii){ return { id: prefix + ci + "-" + ii, l: l }; }) };
    });
  }
  var LISTS = {
    kunto: mkList("k", [
      ["Perustukset ja sokkeli", ["Sokkeli, halkeamat ja rapautuminen", "Maanpinnan kallistus rakennuksesta poispäin", "Salaojat ja tarkastuskaivot", "Sadevesijärjestelmä (kourut, syöksyt, kaivot)"]],
      ["Julkisivu ja vesikatto", ["Julkisivuverhous ja maalipinnat", "Ikkunat ja ulko-ovet", "Vesikate, pellitykset ja läpiviennit", "Yläpohja ja ullakko (tuuletus, eristeet, jäljet)"]],
      ["Sisätilat", ["Lattiat ja alapohja", "Seinät ja katot", "Kosteus- ja vauriojäljet, hajut"]],
      ["Märkätilat", ["Vedeneristys ja pintamateriaalit", "Lattiakaivot ja kallistukset", "Saunan rakenteet"]],
      ["Talotekniikka", ["Käyttövesi- ja viemäriputket", "Lämmitysjärjestelmä", "Sähköjärjestelmä ja keskus", "Ilmanvaihtolaitteet"]],
      ["Piha ja ulkorakennukset", ["Piharakenteet ja terassit", "Ulkorakennukset ja katokset"]]
    ]),
    osto: mkList("o", [
      ["Taloyhtiö ja yleiset tilat", ["Porraskäytävä ja yleisilme", "Julkisivu, ikkunat ja parvekkeet ulkoa", "Kellari-, varasto- ja saunatilat", "Piha ja pysäköinti"]],
      ["Märkätilat", ["Kylpyhuoneen ikä ja pinnat", "Lattiakaivo ja kallistukset", "Saumat, silikonit ja kosteusjäljet", "WC ja kalusteet"]],
      ["Keittiö", ["Kalusteet ja työtasot", "Kodinkoneet", "Astianpesukone ja vuotosuoja"]],
      ["Pinnat ja ovet", ["Lattiat", "Seinät ja katot", "Väliovet ja ulko-ovi"]],
      ["Ikkunat ja parveke", ["Ikkunoiden kunto ja tiivisteet", "Parvekkeen pinnat ja lasitus"]],
      ["Tekniikka", ["Sähköt (keskus, pistorasiat, valaisimet)", "Lämmitys ja patterit", "Ilmanvaihto ja venttiilit", "Vesikalusteet ja vedenpaine"]],
      ["Asumisviihtyvyys", ["Hajut ja tunkkaisuus", "Melu ja naapurusto", "Valoisuus ja ilmansuunnat"]]
    ]),
    muutto: mkList("m", [
      ["Eteinen", ["Lattia", "Seinät ja katto", "Ulko-ovi ja lukot", "Kaapit"]],
      ["Olohuone", ["Lattia", "Seinät ja katto", "Ikkunat ja verhotangot", "Pistorasiat ja valaisimet"]],
      ["Makuuhuone(et)", ["Lattia", "Seinät ja katto", "Ikkunat", "Kaapit"]],
      ["Keittiö", ["Kalusteet ja työtaso", "Liesi ja uuni", "Jääkaappi ja pakastin", "Astianpesukone", "Liesituuletin ja rasvasuodatin"]],
      ["Kylpyhuone ja WC", ["Lattia ja lattiakaivo", "Seinät", "WC-istuin ja allas", "Suihku ja hanat", "Peili ja kaapit"]],
      ["Sauna", ["Kiuas", "Lauteet ja paneelit"]],
      ["Parveke ja varasto", ["Parveke", "Varastokoppi"]],
      ["Yleistä", ["Palovaroittimet", "Siisteys"]]
    ])
  };

  /* Tarkastustyypit. Osion tyypit: text, checklist, havainnot, iv, choice, sign. */
  var TEMPLATES = {
    kunto: {
      name: "Kuntotarkastus", icon: "🏠", reportTitle: "Kuntotarkastusraportti",
      desc: "Kiinteistön tai asunnon yleistarkastus: havainnot, ilmanvaihto ja mittaukset.",
      meta: [
        {k:"osoite", l:"Kohteen osoite", full:true},
        {k:"tilaaja", l:"Tilaaja", full:true},
        {k:"tilaajaYht", l:"Tilaajan yhteystiedot", full:true, ph:"Puhelin ja sähköposti"},
        {k:"pvm", l:"Tarkastuspäivä", type:"date"},
        {k:"rakennusvuosi", l:"Rakennusvuosi"},
        {k:"tarkastaja", l:"Tarkastaja", keep:true},
        {k:"patevyys", l:"Pätevyys", keep:true, ph:"Esim. PKA"},
        {k:"yritys", l:"Tarkastajan yritys ja yhteystiedot", full:true, keep:true}
      ],
      sections: [
        {k:"lahto", type:"text", name:"Lähtötiedot", ph:"Tarkastuksen syy ja tausta, tilaajan kertomat asiat", photos:true},
        {k:"asiak", type:"text", name:"Lähtöasiakirjat", ph:"Piirustukset, aiemmat raportit, huoltokirja… Asiakirjoista voi ottaa kuvia.", photos:true},
        {k:"lasna", type:"text", name:"Läsnäolijat", ph:"Nimet ja roolit"},
        {k:"lista", type:"checklist", list:"kunto", name:"Tarkistuslista"},
        {k:"hav", type:"havainnot", name:"Havainnot"},
        {k:"iv", type:"iv", name:"Ilmanvaihto"},
        {k:"rajaus", type:"text", name:"Rajaukset", ph:"Mitä ei tarkastettu ja miksi"},
        {k:"yhteenveto", type:"text", name:"Yhteenveto ja johtopäätökset", ph:"Kohteen kunto yleisesti ja tärkeimmät havainnot. Raportissa tämä on ensimmäinen luku."}
      ],
      report: ["yhteenveto", "@toimenpiteet", "lahto", "asiak", "lasna", "rajaus", "lista", "hav", "iv", "@mittaukset", "@allekirjoitus"],
      meas: ["ilma", "korkeus", "ryomintatila", "salaoja", "porareika", "kallistus", "vesi", "kartoitus", "iv", "muut"],
      kiireLabel: "Kiireellisyys", kiireet: ["Heti", "1–2 v", "3–5 v", "Seuranta"], cost: null
    },
    osto: {
      name: "Ostokatselmus", icon: "🔑", reportTitle: "Ostokatselmus",
      desc: "Oma katselmus ennen asunnon ostoa: tarkistuslista, havainnot ja kustannusarviot.",
      meta: [
        {k:"osoite", l:"Kohteen osoite", full:true},
        {k:"kohde", l:"Huoneisto ja pinta-ala", ph:"Esim. 2h+k, 48 m²"},
        {k:"hinta", l:"Pyyntihinta", ph:"Velaton hinta"},
        {k:"rakennusvuosi", l:"Rakennusvuosi"},
        {k:"pvm", l:"Katselmuspäivä", type:"date"},
        {k:"taloyhtio", l:"Taloyhtiö ja isännöitsijä", full:true},
        {k:"valittaja", l:"Välittäjä / esittelijä", full:true},
        {k:"tarkastaja", l:"Katselmoija", full:true, keep:true}
      ],
      sections: [
        {k:"taustat", type:"text", name:"Kohteen ja taloyhtiön tiedot", ph:"Vastike, lainaosuus, tehdyt ja tulevat remontit (PTS), tilinpäätöksen huomiot…", photos:true},
        {k:"lista", type:"checklist", list:"osto", name:"Tarkistuslista"},
        {k:"hav", type:"havainnot", name:"Havainnot"},
        {k:"kysy", type:"text", name:"Kysyttävää ja selvitettävää", ph:"Asiat, jotka kysytään välittäjältä tai isännöitsijältä"},
        {k:"paatos", type:"choice", name:"Johtopäätös", opts:["Jatketaan", "Harkitaan", "Ei jatkoon"], ph:"Kokonaiskuva, neuvotteluvara ja tarjouksen perusteet"}
      ],
      report: ["paatos", "@toimenpiteet", "taustat", "lista", "hav", "kysy", "@mittaukset"],
      meas: ["ilma", "kallistus", "vesi", "kartoitus", "muut"],
      kiireLabel: "Kiireellisyys", kiireet: ["Heti", "1–2 v", "3–5 v", "Seuranta"], cost: "Kustannusarvio €"
    },
    muutto: {
      name: "Muuttotarkastus", icon: "📦", reportTitle: "Muuttotarkastuspöytäkirja",
      desc: "Vuokra-asunnon sisään- tai poismuutto: huonekohtainen lista, mittarit ja allekirjoitukset.",
      meta: [
        {k:"laji", l:"Tarkastuksen laji", type:"chips", opts:["Sisäänmuutto", "Poismuutto", "Välitarkastus"], full:true},
        {k:"osoite", l:"Huoneiston osoite", full:true},
        {k:"vuokranantaja", l:"Vuokranantaja", full:true, keep:true},
        {k:"vuokralainen", l:"Vuokralainen", full:true},
        {k:"vuokralainenYht", l:"Vuokralaisen yhteystiedot", full:true, ph:"Puhelin, sähköposti, uusi osoite"},
        {k:"pvm", l:"Tarkastuspäivä", type:"date"},
        {k:"avaimet", l:"Avaimet (kpl)"},
        {k:"tarkastaja", l:"Tarkastaja", full:true, keep:true}
      ],
      sections: [
        {k:"lista", type:"checklist", list:"muutto", name:"Huoneiden tarkistus"},
        {k:"hav", type:"havainnot", name:"Vauriot ja huomautukset"},
        {k:"sovitut", type:"text", name:"Sovitut asiat", ph:"Korjaukset, siivous, vakuuden palautus, aikataulut"},
        {k:"allekirj", type:"sign", name:"Allekirjoitukset", roles:[["vuokranantaja", "Vuokranantaja"], ["vuokralainen", "Vuokralainen"]]}
      ],
      report: ["sovitut", "@toimenpiteet", "lista", "hav", "@mittaukset", "allekirj"],
      meas: ["mittari", "muut"],
      kiireLabel: "Vastuu", kiireet: ["Vuokralainen", "Vuokranantaja", "Sovitaan"], cost: "Korvaus €"
    }
  };
  var IV_TYYPIT = ["Koneellinen poisto", "Painovoimainen", "Koneellinen tulo ja poisto"];
  var PE_TAVAT = ["Mitattu", "Kokeellinen"];

  /* ---------------- tietomalli ---------------- */
  function blankPart(){ return { text: "", photos: [], captions: [] }; }
  function blankSub(){ return { id: uid(), title: "", text: "", photos: [], captions: [] }; }
  function blankHav(){ var h = blankSub(); h.ehdotus = ""; h.kiire = ""; h.kustannus = ""; h.sub = []; return h; }
  function fresh(tyyppi, remembered){
    var T = TEMPLATES[tyyppi];
    var insp = { id: uid(), app: JSON_FORMAT, versio: 1, tyyppi: tyyppi, created: Date.now(), meta: {}, cover: blankPart(),
      osat: {}, lista: {}, havainnot: [blankHav()], iv: null, ovi: blankPart(), mittaukset: {}, sign: {} };
    T.meta.forEach(function(f){ insp.meta[f.k] = (f.keep && remembered && remembered[f.k]) || ""; });
    if(insp.meta.pvm === "") insp.meta.pvm = todayISO();
    return normalize(insp);
  }
  /* Tuotu tai tallennettu tieto siivotaan aina: vain kelvolliset kuvat ja tunnisteet, kentät merkkijonoina.
     Näin viallinen tai pahantahtoinen varmuuskopio ei voi rikkoa sovellusta eikä ujuttaa sivulle koodia. */
  var IMG_RE = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+\/]+=*$/;
  function okImg(s){ return typeof s === "string" && IMG_RE.test(s); }
  function okId(s){ return typeof s === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(s); }
  function str(v){ return typeof v === "string" ? v : (typeof v === "number" ? String(v) : ""); }
  function isObj(o){ return !!o && typeof o === "object" && !Array.isArray(o); }
  function fixPhotos(p){
    var ph = Array.isArray(p.photos) ? p.photos : [], cp = Array.isArray(p.captions) ? p.captions : [], a = [], b = [];
    ph.forEach(function(src, i){ if(okImg(src)){ a.push(src); b.push(str(cp[i])); } });
    p.photos = a; p.captions = b;
  }
  function fixPart(p){ p = isObj(p) ? p : blankPart(); p.text = str(p.text); fixPhotos(p); return p; }
  function fixSub(s){ s = fixPart(s); s.id = okId(s.id) ? s.id : uid(); s.title = str(s.title); return s; }
  function fixHav(h){
    h = fixSub(h);
    var sub = Array.isArray(h.sub) ? h.sub : [];
    ["ehdotus", "kiire", "kustannus"].forEach(function(k){ h[k] = str(h[k]); });
    h.sub = sub.filter(isObj).map(function(x){ x = fixSub(x); delete x.sub; return x; });
    return h;
  }
  function normalize(i){
    if(!isObj(i)) throw new Error("Tiedosto on vioittunut.");
    i.tyyppi = TEMPLATES.hasOwnProperty(i.tyyppi) ? i.tyyppi : "kunto";
    var T = TEMPLATES[i.tyyppi];
    i.id = okId(i.id) ? i.id : uid();
    i.meta = isObj(i.meta) ? i.meta : {};
    Object.keys(i.meta).forEach(function(k){ i.meta[k] = str(i.meta[k]); });
    T.meta.forEach(function(f){ if(i.meta[f.k] === undefined) i.meta[f.k] = ""; });
    i.cover = fixPart(i.cover);
    i.osat = isObj(i.osat) ? i.osat : {};
    T.sections.forEach(function(s){
      if(s.type === "text" || s.type === "choice"){ i.osat[s.k] = fixPart(i.osat[s.k]); if(s.type === "choice") i.osat[s.k].valinta = str(i.osat[s.k].valinta); }
    });
    var L = isObj(i.lista) ? i.lista : {};
    i.lista = {};
    Object.keys(L).forEach(function(k){
      if(!okId(k) || !isObj(L[k])) return;
      var x = fixPart(L[k]); x.tila = tilaLabel(x.tila) ? x.tila : ""; i.lista[k] = x;
    });
    i.havainnot = (Array.isArray(i.havainnot) ? i.havainnot : []).filter(isObj).map(fixHav);
    if(!i.havainnot.length) i.havainnot.push(blankHav());
    i.iv = fixPart(i.iv);
    ["tyyppi", "peTapa", "peTulos", "peText", "ehdotus", "kiire", "kustannus"].forEach(function(k){ i.iv[k] = str(i.iv[k]); });
    i.ovi = fixPart(i.ovi);
    i.mittaukset = isObj(i.mittaukset) ? i.mittaukset : {};
    T.meas.forEach(function(g){
      if(!Array.isArray(i.mittaukset[g])){ i.mittaukset[g] = (MEAS[g].initial || []).map(function(r){ return Object.assign({}, r); }); return; }
      i.mittaukset[g] = i.mittaukset[g].filter(isObj);
      i.mittaukset[g].forEach(function(r){
        Object.keys(r).forEach(function(k){ if(k !== "photos" && k !== "captions") r[k] = str(r[k]); });
        if(r.photos !== undefined || r.captions !== undefined) fixPhotos(r);
      });
    });
    var S = isObj(i.sign) ? i.sign : {};
    i.sign = {};
    Object.keys(S).forEach(function(k){ if(okId(k) && isObj(S[k])) i.sign[k] = { name: str(S[k].name), img: okImg(S[k].img) ? S[k].img : null }; });
    if(i.savedAt !== undefined && typeof i.savedAt !== "number") i.savedAt = Date.now();
    return i;
  }
  function findHav(insp, id){
    for(var a = 0; a < insp.havainnot.length; a++){
      var h = insp.havainnot[a];
      if(h.id === id) return { h: h, list: insp.havainnot, idx: a };
      for(var b = 0; b < h.sub.length; b++) if(h.sub[b].id === id) return { h: h.sub[b], list: h.sub, parent: h, idx: b };
    }
    return null;
  }
  function listItem(insp, id){
    if(!insp.lista[id]) insp.lista[id] = { tila: "", text: "", photos: [], captions: [] };
    return insp.lista[id];
  }
  function filled(p){ return !!(p && ((trim(p.text)) || (p.photos && p.photos.length))); }
  function subFilled(s){ return filled(s) || !!trim(s.title); }
  function ehdFilled(x){ return !!(trim(x.ehdotus) || x.kiire || trim(x.kustannus)); }
  function havFilled(h){ return subFilled(h) || ehdFilled(h) || h.sub.some(subFilled); }
  function ivFilled(i){ var v = i.iv; return filled(v) || !!(v.tyyppi || v.peTapa || trim(v.peTulos) || trim(v.peText)) || ehdFilled(v) || filled(i.ovi); }
  function listItemFilled(it){ return !!(it && (it.tila || filled(it))); }
  function listFilled(insp, listKey){
    return LISTS[listKey].some(function(c){ return c.items.some(function(it){ return listItemFilled(insp.lista[it.id]); }); });
  }
  function signFilled(insp){ return Object.keys(insp.sign).some(function(k){ var s = insp.sign[k]; return s && (s.img || trim(s.name)); }); }
  /* Rivi on tyhjä, jos vain ensimmäinen (paikka-)kenttä on täytetty, kuten valmiiksi annetuissa riveissä */
  function rowEmpty(gid, r){ return MEAS[gid].fields.slice(1).every(function(f){ return !trim(r[f.k]); }) && !(r.photos && r.photos.length); }
  function measFilled(insp){
    var T = TEMPLATES[insp.tyyppi];
    return T.meas.some(function(g){ return (insp.mittaukset[g] || []).some(function(r){ return !rowEmpty(g, r); }); });
  }
  function sectionFilled(insp, s){
    if(s.type === "text") return filled(insp.osat[s.k]);
    if(s.type === "choice") return filled(insp.osat[s.k]) || !!insp.osat[s.k].valinta;
    if(s.type === "checklist") return listFilled(insp, s.list);
    if(s.type === "havainnot") return insp.havainnot.some(havFilled);
    if(s.type === "iv") return ivFilled(insp);
    if(s.type === "sign") return signFilled(insp);
    return false;
  }
  function hasContent(insp){
    var T = TEMPLATES[insp.tyyppi];
    return T.meta.some(function(f){ return f.k !== "pvm" && !f.keep && trim(insp.meta[f.k]); }) || filled(insp.cover) ||
      T.sections.some(function(s){ return sectionFilled(insp, s); }) || measFilled(insp);
  }
  function listStats(insp, cat){
    var done = 0;
    cat.items.forEach(function(it){ var x = insp.lista[it.id]; if(x && x.tila) done++; });
    return { done: done, total: cat.items.length };
  }
  /* Mittausrivin laskettu arvo */
  function measCalc(gid, r){
    var g = MEAS[gid];
    if(g.calc === "ah"){
      var t = num(r.t), rh = num(r.rh);
      if(!isNaN(t) && !isNaN(rh) && rh >= 0 && rh <= 100) return { text: "Vesihöyryä " + fmt1(absHum(t, rh)) + " g/m³", short: fmt1(absHum(t, rh)) };
    }
    if(g.calc === "h15"){
      var a = num(r.lattia), b = num(r.runko), w = [];
      if(!isNaN(a) && a < 15) w.push("maanpinta–lattia alle 15 cm");
      if(!isNaN(b) && b < 15) w.push("puurunko–maa alle 15 cm");
      if(w.length) return { text: "Riski: " + w.join(", "), short: "Alle 15 cm", warn: true };
      if(!isNaN(a) || !isNaN(b)) return { text: "Ei alle 15 cm", short: "OK" };
    }
    return null;
  }

  /* Tiedoston nimi: "Osoite - Kuntotarkastusraportti 2026-11-15" */
  function fileBase(insp){
    var T = TEMPLATES[insp.tyyppi];
    var a = trim(insp.meta.osoite).replace(/[\\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").slice(0, 60) || "Kohde";
    return a + " - " + T.reportTitle + " " + (insp.meta.pvm || todayISO());
  }

  /* ---------------- raportin rakenne (yhteinen Wordille, PDF:lle ja esikatselulle) ---------------- */
  function buildReport(insp){
    insp = normalize(clone(insp));
    var T = TEMPLATES[insp.tyyppi], blocks = [], photoNo = 0, chap = 0;
    var secByKey = {}; T.sections.forEach(function(s){ secByKey[s.k] = s; });
    var m = insp.meta;

    function photos(p, out){
      if(!p.photos.length) return;
      out.push({ t: "photos", items: p.photos.map(function(src, i){ photoNo++; return { src: src, cap: "Kuva " + photoNo + (trim(p.captions[i]) ? ". " + trim(p.captions[i]) : "") }; }) });
    }
    function textPhotos(p, out){ if(trim(p.text)) out.push({ t: "p", text: trim(p.text) }); photos(p, out); }
    function ehdBlock(x, out){
      if(!ehdFilled(x)) return;
      var parts = [];
      if(x.kiire) parts.push(T.kiireLabel + ": " + x.kiire);
      if(T.cost && trim(x.kustannus)) parts.push(T.cost.replace(" €", "") + ": " + trim(x.kustannus) + (/€/.test(x.kustannus) ? "" : " €"));
      out.push({ t: "action", text: trim(x.ehdotus), meta: parts.join(" · ") });
    }
    function chapter(name, body){
      if(!body.length) return;
      chap++;
      blocks.push({ t: "h1", text: chap + ". " + name });
      body.forEach(function(b){ if(b.t === "h2" && b.num) b.text = chap + "." + b.num + " " + b.text; blocks.push(b); });
    }

    /* Toimenpiteet koottuna */
    var actions = [];
    var havNum = {}, havChap = 0;
    function collectHav(){
      var hs = insp.havainnot.filter(havFilled);
      hs.forEach(function(h, a){
        havNum[h.id] = String(a + 1);
        h.sub.filter(subFilled).forEach(function(s, b){ havNum[s.id] = (a + 1) + "." + (b + 1); });
      });
      return hs;
    }
    var havList = collectHav();

    /* Kansilehti */
    var kv = [];
    T.meta.forEach(function(f){
      var v = trim(m[f.k]);
      if(f.type === "date") v = fmtDate(v);
      if(v) kv.push([f.l, v]);
    });
    var subtitle = T.name + (m.laji ? " – " + m.laji : "");
    blocks.push({ t: "cover", title: T.reportTitle, subtitle: subtitle, address: trim(m.osoite), photo: insp.cover.photos[0] || null, kv: kv });
    blocks.push({ t: "toc" });

    /* Luvut */
    var chapterNames = {};
    T.report.forEach(function(key){
      var body = [];
      if(key === "@toimenpiteet"){
        var rows = [], total = 0, hasCost = false;
        var order = {}; T.kiireet.forEach(function(k, i){ order[k] = i; });
        havList.forEach(function(h){
          if(ehdFilled(h)) rows.push({ hav: h.id, title: trim(h.title) || "Havainto", text: trim(h.ehdotus), kiire: h.kiire, cost: trim(h.kustannus) });
        });
        if(T.sections.some(function(s){ return s.type === "iv"; }) && ehdFilled(insp.iv)) rows.push({ kohta: "Ilmanvaihto", text: trim(insp.iv.ehdotus), kiire: insp.iv.kiire, cost: trim(insp.iv.kustannus) });
        T.sections.filter(function(s){ return s.type === "checklist"; }).forEach(function(s){
          LISTS[s.list].forEach(function(c){ c.items.forEach(function(it){
            var x = insp.lista[it.id];
            if(x && x.tila === "korj") rows.push({ kohta: c.name + ": " + it.l, text: trim(x.text) || "Korjattava", kiire: "", cost: "" });
          }); });
        });
        if(!rows.length) return;
        rows.sort(function(a, b){ var oa = a.kiire in order ? order[a.kiire] : 99, ob = b.kiire in order ? order[b.kiire] : 99; return oa - ob; });
        var head = ["Kohta", "Toimenpide", T.kiireLabel], widths = [3, 5, 2];
        if(T.cost){ head.push(T.cost); widths = [3, 4.4, 1.8, 1.8]; }
        var trows = rows.map(function(r){
          var row = [r.hav ? { hav: r.hav, title: r.title } : r.kohta, r.text || "–", r.kiire || "–"];
          if(T.cost){
            var c = money(r.cost);
            if(!isNaN(c)){ total += c; hasCost = true; row.push(fmtEur(c)); } else row.push(r.cost || "–");
          }
          return row;
        });
        var tb = { t: "table", head: head, rows: trows, widths: widths };
        if(T.cost && hasCost) tb.foot = ["Yhteensä", "", "", fmtEur(total)];
        body.push(tb);
        chapter(T.kiireLabel === "Vastuu" ? "Korjattavat ja korvattavat" : "Toimenpide-ehdotukset", body);
        return;
      }
      if(key === "@mittaukset"){
        T.meas.forEach(function(gid){
          var g = MEAS[gid], rows = (insp.mittaukset[gid] || []).filter(function(r){ return !rowEmpty(gid, r); });
          if(!rows.length) return;
          var head = g.fields.map(function(f){ return f.l; }), widths = g.fields.map(function(f){ return f.full ? 2 : 1; });
          if(g.calc === "ah"){ head.push("Vesihöyry g/m³"); widths.push(1); }
          if(g.calc === "h15"){ head.push("Arvio"); widths.push(1); }
          body.push({ t: "h2", text: g.name });
          body.push({ t: "table", head: head, rows: rows.map(function(r){
            var row = g.fields.map(function(f){ return trim(r[f.k]) || "–"; });
            if(g.calc){ var c = measCalc(gid, r); row.push(c ? c.short : "–"); }
            return row;
          }), widths: widths });
          rows.forEach(function(r){ if(r.photos && r.photos.length) photos(fixPart(r), body); });
        });
        chapter("Mittaukset", body);
        return;
      }
      if(key === "@allekirjoitus"){
        if(!trim(m.tarkastaja)) return;
        blocks.push({ t: "spacer" });
        blocks.push({ t: "sign", place: "", parties: [{ role: [trim(m.tarkastaja), trim(m.patevyys)].filter(Boolean).join(", "), name: trim(m.yritys), img: null }], date: fmtDate(m.pvm) });
        return;
      }
      var s = secByKey[key];
      if(!s || !sectionFilled(insp, s)) return;
      if(s.type === "text"){ textPhotos(insp.osat[s.k], body); chapter(s.name, body); return; }
      if(s.type === "choice"){
        var o = insp.osat[s.k];
        if(o.valinta) body.push({ t: "verdict", text: o.valinta });
        textPhotos(o, body); chapter(s.name, body); return;
      }
      if(s.type === "checklist"){
        LISTS[s.list].forEach(function(c){
          var rows = [], det = [];
          c.items.forEach(function(it){
            var x = insp.lista[it.id];
            if(!listItemFilled(x)) return;
            rows.push([it.l, tilaLabel(x.tila) || "–", trim(x.text) || ""]);
            if(x.photos.length){ det.push({ t: "p", text: it.l, bold: true }); photos(x, det); }
          });
          if(!rows.length) return;
          body.push({ t: "h2", text: c.name });
          body.push({ t: "table", head: ["Kohta", "Tila", "Huomiot"], rows: rows, widths: [3, 1.6, 5], status: 1 });
          det.forEach(function(d){ body.push(d); });
        });
        chapter(s.name, body); return;
      }
      if(s.type === "havainnot"){
        havList.forEach(function(h){
          body.push({ t: "h2", num: havNum[h.id], text: trim(h.title) || "Havainto" });
          textPhotos(h, body);
          h.sub.filter(subFilled).forEach(function(sb){
            body.push({ t: "h3", text: "" , num: havNum[sb.id], raw: trim(sb.title) || "Tarkennus" });
            textPhotos(sb, body);
          });
          ehdBlock(h, body);
        });
        /* h3-numerointi luvun mukaan */
        var cnum = chap + 1; havChap = cnum;
        body.forEach(function(b){ if(b.t === "h3"){ b.text = cnum + "." + b.num + " " + b.raw; } });
        chapter(s.name, body); return;
      }
      if(s.type === "iv"){
        var v = insp.iv, kvr = [];
        if(v.tyyppi) kvr.push(["Järjestelmä", v.tyyppi]);
        if(v.peTapa || trim(v.peTulos)) kvr.push(["Paine-ero", [v.peTapa, trim(v.peTulos)].filter(Boolean).join(": ")]);
        if(kvr.length) body.push({ t: "kv", rows: kvr });
        if(trim(v.peText)) body.push({ t: "p", text: trim(v.peText) });
        textPhotos(v, body);
        if(filled(insp.ovi)){ body.push({ t: "h2", text: "Oviraot" }); textPhotos(insp.ovi, body); }
        ehdBlock(v, body);
        chapter(s.name, body); return;
      }
      if(s.type === "sign"){
        var parties = s.roles.map(function(r){ var x = insp.sign[r[0]] || {}; return { role: r[1], name: trim(x.name), img: x.img || null }; });
        body.push({ t: "sign", place: trim((insp.sign._place || {}).name), parties: parties, date: fmtDate(m.pvm) });
        chapter(s.name, body); return;
      }
    });
    /* Toimenpidetaulukon havaintonumerot vasta, kun havaintoluvun numero tiedetään */
    blocks.forEach(function(b){
      if(b.t !== "table") return;
      b.rows.forEach(function(r){
        if(r[0] && typeof r[0] === "object") r[0] = (havChap ? havChap + "." : "") + havNum[r[0].hav] + " " + r[0].title;
      });
    });

    return {
      title: T.reportTitle, typeName: T.name, address: trim(m.osoite), date: fmtDate(m.pvm),
      header: T.reportTitle + (trim(m.osoite) ? " · " + trim(m.osoite) : ""),
      company: trim(m.yritys) || trim(m.vuokranantaja) || "",
      filename: fileBase(insp), blocks: blocks
    };
  }

  /* ---------------- ZIP (tallennus ilman pakkausta) ---------------- */
  var CRC = (function(){ var t = new Uint32Array(256); for(var n = 0; n < 256; n++){ var c = n; for(var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8){ var c = 0xFFFFFFFF; for(var i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function utf8(s){ return new TextEncoder().encode(s); }
  function concat(chunks){
    var len = 0; chunks.forEach(function(c){ len += c.length; });
    var out = new Uint8Array(len), o = 0; chunks.forEach(function(c){ out.set(c, o); o += c.length; });
    return out;
  }
  function zip(files){
    var parts = [], central = [], offset = 0;
    var d = new Date(), dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
        dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    files.forEach(function(f){
      var name = utf8(f.name), data = typeof f.data === "string" ? utf8(f.data) : f.data, crc = crc32(data);
      var h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, dosTime, true); h.setUint16(12, dosDate, true); h.setUint32(14, crc, true);
      h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      var c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, dosTime, true); c.setUint16(14, dosDate, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true);
      c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
      central.push(new Uint8Array(c.buffer), name);
      offset += 30 + name.length + data.length;
    });
    var cen = concat(central), e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, cen.length, true); e.setUint32(16, offset, true);
    return concat(parts.concat([cen, new Uint8Array(e.buffer)]));
  }

  /* ---------------- kuvat ---------------- */
  function b64ToBytes(b64){
    if(typeof atob === "function"){ var bin = atob(b64), u = new Uint8Array(bin.length); for(var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
    return new Uint8Array(Buffer.from(b64, "base64"));
  }
  function dataUrlInfo(src){
    var m = /^data:(image\/[a-z]+);base64,(.*)$/.exec(src || "");
    if(!m) return null;
    var bytes = b64ToBytes(m[2]), info = { mime: m[1], bytes: bytes, w: 0, h: 0, comps: 3 };
    if(m[1] === "image/png"){
      info.w = (bytes[16] << 24 | bytes[17] << 16 | bytes[18] << 8 | bytes[19]) >>> 0;
      info.h = (bytes[20] << 24 | bytes[21] << 16 | bytes[22] << 8 | bytes[23]) >>> 0;
      return info;
    }
    /* JPEG: etsi SOF-merkki */
    var i = 2;
    while(i < bytes.length){
      if(bytes[i] !== 0xFF){ i++; continue; }
      var mk = bytes[i + 1];
      if(mk === 0xD8 || mk === 0x01 || (mk >= 0xD0 && mk <= 0xD7)){ i += 2; continue; }
      var len = bytes[i + 2] << 8 | bytes[i + 3];
      if((mk >= 0xC0 && mk <= 0xCF) && mk !== 0xC4 && mk !== 0xC8 && mk !== 0xCC){
        info.h = bytes[i + 5] << 8 | bytes[i + 6]; info.w = bytes[i + 7] << 8 | bytes[i + 8]; info.comps = bytes[i + 9];
        return info;
      }
      i += 2 + len;
    }
    return info.w ? info : null;
  }
  function fit(w, h, maxW, maxH){ var s = Math.min(maxW / w, maxH / h, 1e9); return { w: w * s, h: h * s }; }

  /* ---------------- Word (.docx) ---------------- */
  function xesc(s){ return String(s === undefined || s === null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ""); }
  function buildDocx(rep){
    var TW = 9638; /* tekstialueen leveys, twip (A4, 2 cm marginaalit) */
    var media = [], rels = [], body = [], picId = 0;
    function run(text, rpr){
      var lines = String(text).split("\n");
      return lines.map(function(l, i){ return "<w:r>" + (rpr ? "<w:rPr>" + rpr + "</w:rPr>" : "") + (i ? "<w:br/>" : "") + '<w:t xml:space="preserve">' + xesc(l) + "</w:t></w:r>"; }).join("");
    }
    function para(runs, ppr){ return "<w:p>" + (ppr ? "<w:pPr>" + ppr + "</w:pPr>" : "") + runs + "</w:p>"; }
    function image(src, maxW, maxH){
      var info = dataUrlInfo(src);
      if(!info || !info.w) return "";
      var ext = info.mime === "image/png" ? "png" : "jpeg";
      picId++;
      var name = "media/kuva" + picId + "." + ext, rid = "rIdImg" + picId;
      media.push({ name: "word/" + name, data: info.bytes });
      rels.push('<Relationship Id="' + rid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="' + name + '"/>');
      var f = fit(info.w, info.h, maxW, maxH), cx = Math.round(f.w * 635), cy = Math.round(f.h * 635);
      return '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:docPr id="' + picId + '" name="Kuva ' + picId + '"/>' +
        '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
        '<pic:pic><pic:nvPicPr><pic:cNvPr id="' + picId + '" name="kuva' + picId + '"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
        '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
    }
    function cell(content, w, opts){
      opts = opts || {};
      var pr = '<w:tcW w:w="' + w + '" w:type="dxa"/>' + (opts.shade ? '<w:shd w:val="clear" w:color="auto" w:fill="' + opts.shade + '"/>' : "") +
        (opts.span ? '<w:gridSpan w:val="' + opts.span + '"/>' : "");
      return "<w:tc><w:tcPr>" + pr + "</w:tcPr>" + (content || "<w:p/>") + "</w:tc>";
    }
    function table(rowsXml, widths, borders){
      var b = borders ? '<w:tblBorders><w:top w:val="single" w:sz="4" w:color="BFC5C9"/><w:bottom w:val="single" w:sz="4" w:color="BFC5C9"/><w:insideH w:val="single" w:sz="4" w:color="BFC5C9"/><w:insideV w:val="single" w:sz="4" w:color="BFC5C9"/><w:left w:val="single" w:sz="4" w:color="BFC5C9"/><w:right w:val="single" w:sz="4" w:color="BFC5C9"/></w:tblBorders>' : '<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>';
      return '<w:tbl><w:tblPr><w:tblW w:w="' + TW + '" w:type="dxa"/><w:tblLayout w:type="fixed"/>' + b + '<w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>' +
        widths.map(function(w){ return '<w:gridCol w:w="' + w + '"/>'; }).join("") + "</w:tblGrid>" + rowsXml + "</w:tbl>" + para("", '<w:spacing w:after="60"/>');
    }
    function widthsOf(fr){ var tot = fr.reduce(function(s, f){ return s + f; }, 0); return fr.map(function(f){ return Math.floor(TW * f / tot); }); }
    function smallP(text, rpr){ return para(run(text, rpr || ""), '<w:pStyle w:val="Taulukko"/>'); }

    var tocItems = [];
    rep.blocks.forEach(function(b){
      if(b.t === "cover"){
        body.push(para(run(b.title), '<w:pStyle w:val="Title"/>'));
        body.push(para(run(b.subtitle, '<w:color w:val="55625F"/><w:sz w:val="24"/>'), '<w:spacing w:after="240"/>'));
        if(b.address) body.push(para(run(b.address, '<w:b/><w:sz w:val="32"/>'), '<w:spacing w:after="240"/>'));
        if(b.photo) body.push(para(image(b.photo, TW, 7200), '<w:spacing w:after="240"/>'));
        if(b.kv.length){
          var w = widthsOf([1, 2]);
          body.push(table(b.kv.map(function(r){ return "<w:tr>" + cell(smallP(r[0], '<w:color w:val="55625F"/>'), w[0]) + cell(smallP(r[1], "<w:b/>"), w[1]) + "</w:tr>"; }).join(""), w, true));
        }
        body.push(para('<w:r><w:br w:type="page"/></w:r>'));
      } else if(b.t === "toc"){
        body.push("@@TOC@@");
      } else if(b.t === "h1"){
        tocItems.push({ lvl: 1, text: b.text });
        body.push(para(run(b.text), '<w:pStyle w:val="Heading1"/>'));
      } else if(b.t === "h2"){
        tocItems.push({ lvl: 2, text: b.text });
        body.push(para(run(b.text), '<w:pStyle w:val="Heading2"/>'));
      } else if(b.t === "h3"){
        body.push(para(run(b.text), '<w:pStyle w:val="Heading3"/>'));
      } else if(b.t === "p"){
        body.push(para(run(b.text, b.bold ? "<w:b/>" : ""), (b.bold ? "<w:keepNext/>" : "") + '<w:spacing w:after="120"/>'));
      } else if(b.t === "verdict"){
        body.push(para(run(b.text, '<w:b/><w:color w:val="FFFFFF"/><w:sz w:val="26"/>'), '<w:shd w:val="clear" w:color="auto" w:fill="1E3A52"/><w:spacing w:before="60" w:after="160"/><w:ind w:left="120" w:right="120"/>'));
      } else if(b.t === "action"){
        var ar = run("Toimenpide-ehdotus: ", "<w:b/>") + run(b.text || "–");
        if(b.meta) ar += run("\n" + b.meta, '<w:color w:val="55625F"/>');
        body.push(para(ar, '<w:shd w:val="clear" w:color="auto" w:fill="FFF1E6"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="6" w:color="E2600C"/></w:pBdr><w:spacing w:before="60" w:after="160"/><w:ind w:left="160"/>'));
      } else if(b.t === "kv"){
        var w2 = widthsOf([1, 2]);
        body.push(table(b.rows.map(function(r){ return "<w:tr>" + cell(smallP(r[0], '<w:color w:val="55625F"/>'), w2[0]) + cell(smallP(r[1]), w2[1]) + "</w:tr>"; }).join(""), w2, true));
      } else if(b.t === "table"){
        var ws = widthsOf(b.widths);
        var xml = '<w:tr><w:trPr><w:tblHeader/></w:trPr>' + b.head.map(function(h, i){ return cell(smallP(h, "<w:b/>"), ws[i], { shade: "E6EAED" }); }).join("") + "</w:tr>";
        b.rows.forEach(function(r){
          xml += '<w:tr><w:trPr><w:cantSplit/></w:trPr>' + r.map(function(c, i){
            var rpr = "";
            if(b.status === i){ if(c === "Korjattava") rpr = '<w:b/><w:color w:val="C62A2A"/>'; else if(c === "Huomioitavaa") rpr = '<w:b/><w:color w:val="B26A00"/>'; else if(c === "Kunnossa") rpr = '<w:color w:val="1F7A4D"/>'; }
            return cell(smallP(c, rpr), ws[i]);
          }).join("") + "</w:tr>";
        });
        if(b.foot) xml += "<w:tr>" + b.foot.map(function(c, i){ return cell(smallP(c, "<w:b/>"), ws[i], { shade: "F3F4F2" }); }).join("") + "</w:tr>";
        body.push(table(xml, ws, true));
      } else if(b.t === "photos"){
        var cw = Math.floor(TW / 2), rowsX = "";
        for(var i = 0; i < b.items.length; i += 2){
          rowsX += '<w:tr><w:trPr><w:cantSplit/></w:trPr>';
          for(var j = 0; j < 2; j++){
            var it = b.items[i + j];
            rowsX += cell(it ? para(image(it.src, cw - 200, 4300), '<w:keepNext/><w:spacing w:after="40"/>') + para(run(it.cap), '<w:pStyle w:val="Caption"/>') : "", cw);
          }
          rowsX += "</w:tr>";
        }
        body.push(table(rowsX, [cw, cw], false));
      } else if(b.t === "spacer"){
        body.push(para("", '<w:spacing w:before="480"/>'));
      } else if(b.t === "sign"){
        var n = b.parties.length, sw = widthsOf(b.parties.map(function(){ return 1; }));
        body.push(para(run((b.place ? b.place + ", " : "") + (b.date || "")), '<w:keepNext/><w:spacing w:before="240" w:after="120"/>'));
        var sx = "<w:tr><w:trPr><w:cantSplit/></w:trPr>" + b.parties.map(function(p, i){
          var c = (p.img ? para(image(p.img, sw[i] - 400, 1200)) : para("", '<w:spacing w:before="720"/>')) +
            para(run(" "), '<w:pBdr><w:top w:val="single" w:sz="6" w:space="1" w:color="182225"/></w:pBdr><w:ind w:right="400"/>') +
            smallP(p.name || "Nimenselvennys", p.name ? "<w:b/>" : '<w:color w:val="8A9490"/>') + smallP(p.role, '<w:color w:val="55625F"/>');
          return cell(c, sw[i]);
        }).join("") + "</w:tr>";
        body.push(table(sx, sw, false));
        void n;
      }
    });

    /* Sisällysluettelo: kenttä, jonka Word päivittää avattaessa. Valmiina myös otsikkolista. */
    var toc = para(run("Sisällysluettelo"), '<w:pStyle w:val="TOCHeading"/>');
    var entries = tocItems.length ? tocItems : [{ lvl: 1, text: " " }];
    entries.forEach(function(t, i){
      var r = "";
      if(i === 0) r += '<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-2" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>';
      r += run(t.text);
      if(i === entries.length - 1) r += '<w:r><w:fldChar w:fldCharType="end"/></w:r>';
      toc += para(r, '<w:pStyle w:val="TOC' + t.lvl + '"/>');
    });
    toc += para('<w:r><w:br w:type="page"/></w:r>');
    var bodyXml = body.join("").replace("@@TOC@@", toc);

    var NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
    var sect = '<w:sectPr><w:headerReference w:type="default" r:id="rIdHdr"/><w:footerReference w:type="default" r:id="rIdFtr"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1300" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/><w:titlePg/></w:sectPr>';
    var doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ' + NS + "><w:body>" + bodyXml + sect + "</w:body></w:document>";
    var header = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ' + NS + ">" + para(run(rep.header, '<w:color w:val="55625F"/><w:sz w:val="16"/>') + run("\t" + (rep.date || ""), '<w:color w:val="55625F"/><w:sz w:val="16"/>'), '<w:tabs><w:tab w:val="right" w:pos="9638"/></w:tabs><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="4" w:color="BFC5C9"/></w:pBdr>') + "</w:hdr>";
    var fr = '<w:rPr><w:color w:val="55625F"/><w:sz w:val="16"/></w:rPr>';
    var footer = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ' + NS + "><w:p><w:pPr><w:jc w:val=\"center\"/></w:pPr>" +
      "<w:r>" + fr + '<w:t xml:space="preserve">Sivu </w:t></w:r><w:r>' + fr + '<w:fldChar w:fldCharType="begin"/></w:r><w:r>' + fr + '<w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r>' + fr + '<w:fldChar w:fldCharType="separate"/></w:r><w:r>' + fr + "<w:t>1</w:t></w:r><w:r>" + fr + '<w:fldChar w:fldCharType="end"/></w:r>' +
      "<w:r>" + fr + '<w:t xml:space="preserve"> / </w:t></w:r><w:r>' + fr + '<w:fldChar w:fldCharType="begin"/></w:r><w:r>' + fr + '<w:instrText xml:space="preserve"> NUMPAGES </w:instrText></w:r><w:r>' + fr + '<w:fldChar w:fldCharType="separate"/></w:r><w:r>' + fr + "<w:t>1</w:t></w:r><w:r>" + fr + '<w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>';
    var styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="fi-FI"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="1200" w:after="120"/></w:pPr><w:rPr><w:b/><w:color w:val="14293B"/><w:sz w:val="52"/></w:rPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:pBdr><w:bottom w:val="single" w:sz="8" w:space="3" w:color="1E3A52"/></w:pBdr><w:spacing w:before="360" w:after="160"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="14293B"/><w:sz w:val="30"/></w:rPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:color w:val="1E3A52"/><w:sz w:val="23"/></w:rPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="160" w:after="60"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:i/><w:sz w:val="21"/></w:rPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="160"/></w:pPr><w:rPr><w:i/><w:color w:val="55625F"/><w:sz w:val="16"/></w:rPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Taulukko"><w:name w:val="Taulukko"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="18"/></w:rPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="TOCHeading"><w:name w:val="TOC Heading"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="200"/></w:pPr><w:rPr><w:b/><w:color w:val="14293B"/><w:sz w:val="30"/></w:rPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="TOC1"><w:name w:val="toc 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9628"/></w:tabs><w:spacing w:before="80" w:after="40"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="TOC2"><w:name w:val="toc 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9628"/></w:tabs><w:spacing w:after="20"/><w:ind w:left="240"/></w:pPr></w:style>' +
      "</w:styles>";
    var settings = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:updateFields w:val="true"/><w:defaultTabStop w:val="709"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>';
    var docRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '<Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>' +
      '<Relationship Id="rIdHdr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>' +
      '<Relationship Id="rIdFtr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>' +
      rels.join("") + "</Relationships>";
    var ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' +
      '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' +
      '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>';
    var rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>';
    var now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
    var core = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      "<dc:title>" + xesc(rep.title + (rep.address ? " – " + rep.address : "")) + "</dc:title><dc:creator>" + APP_NAME + "</dc:creator>" +
      '<dcterms:created xsi:type="dcterms:W3CDTF">' + now + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + now + "</dcterms:modified></cp:coreProperties>";
    return zip([
      { name: "[Content_Types].xml", data: ct }, { name: "_rels/.rels", data: rootRels }, { name: "docProps/core.xml", data: core },
      { name: "word/document.xml", data: doc }, { name: "word/styles.xml", data: styles }, { name: "word/settings.xml", data: settings },
      { name: "word/header1.xml", data: header }, { name: "word/footer1.xml", data: footer }, { name: "word/_rels/document.xml.rels", data: docRels }
    ].concat(media));
  }

  /* ---------------- PDF ---------------- */
  /* @@WIDTHS@@ */
  var CP1252 = { 0x20AC:0x80, 0x201A:0x82, 0x0192:0x83, 0x201E:0x84, 0x2026:0x85, 0x2020:0x86, 0x2021:0x87, 0x02C6:0x88, 0x2030:0x89, 0x0160:0x8A, 0x2039:0x8B, 0x0152:0x8C, 0x017D:0x8E,
    0x2018:0x91, 0x2019:0x92, 0x201C:0x93, 0x201D:0x94, 0x2022:0x95, 0x2013:0x96, 0x2014:0x97, 0x02DC:0x98, 0x2122:0x99, 0x0161:0x9A, 0x203A:0x9B, 0x0153:0x9C, 0x017E:0x9E, 0x0178:0x9F,
    0x2212:0x2D, 0x2010:0x2D, 0x2011:0x2D, 0x00A0:0x20, 0x202F:0x20, 0x2009:0x20 };
  function pdfBytesOf(s){
    var out = [];
    for(var i = 0; i < s.length; i++){
      var c = s.charCodeAt(i);
      if(c >= 0xD800 && c <= 0xDBFF){ i++; continue; } /* emojit pois */
      if(CP1252[c] !== undefined) out.push(CP1252[c]);
      else if(c === 9) out.push(32);
      else if(c >= 32 && c < 256 && !(c >= 0x80 && c < 0xA0)) out.push(c);
      else if(c === 0x2265){ out.push(0x3E, 0x3D); } else if(c === 0x2264){ out.push(0x3C, 0x3D); }
      else if(c >= 0x2600) { /* symbolit pois */ }
      else out.push(0x3F);
    }
    return out;
  }
  function textW(s, bold, size){
    var W = bold ? HELVB : HELV, b = pdfBytesOf(s), w = 0;
    for(var i = 0; i < b.length; i++) w += (b[i] >= 32 ? W[b[i] - 32] : 278);
    return w * size / 1000;
  }
  function wrap(text, bold, size, maxW){
    var out = [];
    String(text).split("\n").forEach(function(par){
      var words = par.split(/ +/), line = "";
      if(!par.length){ out.push(""); return; }
      words.forEach(function(wd){
        var test = line ? line + " " + wd : wd;
        if(textW(test, bold, size) <= maxW || !line){
          /* yksittäinen liian pitkä sana katkaistaan */
          if(!line && textW(wd, bold, size) > maxW){
            var part = "";
            for(var i = 0; i < wd.length; i++){ if(textW(part + wd[i], bold, size) > maxW){ out.push(part); part = ""; } part += wd[i]; }
            line = part;
          } else line = test;
        } else { out.push(line); line = wd; if(textW(wd, bold, size) > maxW){ var p2 = ""; for(var j = 0; j < wd.length; j++){ if(textW(p2 + wd[j], bold, size) > maxW){ out.push(p2); p2 = ""; } p2 += wd[j]; } line = p2; } }
      });
      out.push(line);
    });
    return out;
  }
  function pdfStr(s){
    var b = pdfBytesOf(s), o = "(";
    for(var i = 0; i < b.length; i++){ var c = b[i]; if(c === 0x28 || c === 0x29 || c === 0x5C) o += "\\" + String.fromCharCode(c); else o += String.fromCharCode(c); }
    return o + ")";
  }
  function buildPdf(rep){
    var PW = 595.28, PH = 841.89, ML = 56.7, MR = 56.7, MT = 64, MB = 58, CW = PW - ML - MR;
    var NAVY = "0.078 0.161 0.231", NAVY2 = "0.118 0.227 0.322", SOFT = "0.333 0.384 0.373", INK = "0.094 0.133 0.145", ORANGE = "0.886 0.376 0.047", LINE = "0.75 0.77 0.79";
    var pages = [], pg = null, y = 0, images = [], imgIndex = {}, tocPages = [], tocEntries = [];
    function newPage(isCover){ pg = { ops: [], cover: !!isCover }; pages.push(pg); y = isCover ? 70 : MT; }
    function Y(v){ return (PH - v).toFixed(2); }
    function text(x, yTop, s, size, bold, color, italic){
      pg.ops.push("BT /" + (bold ? "F2" : italic ? "F3" : "F1") + " " + size + " Tf " + (color || INK) + " rg " + x.toFixed(2) + " " + Y(yTop + size * 0.8) + " Td " + pdfStr(s) + " Tj ET");
    }
    function line(x1, y1, x2, y2, color, wdt){ pg.ops.push((color || LINE) + " RG " + (wdt || 0.6) + " w " + x1.toFixed(2) + " " + Y(y1) + " m " + x2.toFixed(2) + " " + Y(y2) + " l S"); }
    function rect(x, yTop, w, h, color){ pg.ops.push(color + " rg " + x.toFixed(2) + " " + Y(yTop + h) + " " + w.toFixed(2) + " " + h.toFixed(2) + " re f"); }
    function tocLineH(lvl){ return lvl === 1 ? 4 + 10.5 * 1.6 : 9.5 * 1.6; }
    function ensure(h){ if(y + h > PH - MB){ newPage(); return true; } return false; }
    function img(src){
      if(imgIndex[src] !== undefined) return images[imgIndex[src]];
      var info = dataUrlInfo(src);
      if(!info || !info.w || info.mime !== "image/jpeg") return null;
      info.name = "Im" + (images.length + 1); imgIndex[src] = images.length; images.push(info); return info;
    }
    function drawImg(info, x, yTop, w, h){ pg.ops.push("q " + w.toFixed(2) + " 0 0 " + h.toFixed(2) + " " + x.toFixed(2) + " " + Y(yTop + h) + " cm /" + info.name + " Do Q"); }
    function paragraph(s, size, bold, color, indent, lead, italic){
      lead = lead || size * 1.38; indent = indent || 0;
      wrap(s, bold, size, CW - indent).forEach(function(l){ ensure(lead); text(ML + indent, y, l, size, bold, color, italic); y += lead; });
    }
    function tableDraw(head, rows, fr, foot, statusCol, kvMode){
      var tot = fr.reduce(function(s, f){ return s + f; }, 0), ws = fr.map(function(f){ return CW * f / tot; }), size = 8.6, lead = 11.2, pad = 4;
      function rowH(cells, bold){ var mx = 1; cells.forEach(function(c, i){ mx = Math.max(mx, wrap(c, bold, size, ws[i] - 2 * pad).length); }); return mx * lead + 2 * pad; }
      function drawRow(cells, bold, shade, colorFn){
        var h = rowH(cells, bold);
        if(shade) rect(ML, y, CW, h, shade);
        var x = ML;
        cells.forEach(function(c, i){
          var col = colorFn ? colorFn(i, c) : null, isB = bold || (col && col.b);
          wrap(c, isB, size, ws[i] - 2 * pad).forEach(function(l, k){ text(x + pad, y + pad + k * lead, l, size, isB, col ? col.c : (kvMode && i === 0 ? SOFT : INK)); });
          x += ws[i];
        });
        line(ML, y + h, ML + CW, y + h);
        y += h;
      }
      function drawHead(){ if(head){ ensure(rowH(head, true) + 20); line(ML, y, ML + CW, y); drawRow(head, true, "0.902 0.918 0.929"); } else line(ML, y, ML + CW, y); }
      drawHead();
      rows.forEach(function(r){
        if(y + rowH(r, false) > PH - MB){ newPage(); drawHead(); }
        drawRow(r, false, null, statusCol === undefined ? null : function(i, c){
          if(i !== statusCol) return null;
          if(c === "Korjattava") return { c: "0.776 0.165 0.165", b: true };
          if(c === "Huomioitavaa") return { c: "0.698 0.416 0", b: true };
          if(c === "Kunnossa") return { c: "0.122 0.478 0.302" };
          return null;
        });
      });
      if(foot){ ensure(rowH(foot, true)); drawRow(foot, true, "0.953 0.957 0.949"); }
      y += 8;
    }

    rep.blocks.forEach(function(b){
      if(b.t === "cover"){
        newPage(true);
        rect(0, 0, PW, 8, ORANGE);
        y = 80;
        text(ML, y, b.title, 28, true, NAVY); y += 38;
        text(ML, y, b.subtitle, 12.5, false, SOFT); y += 30;
        if(b.address){ wrap(b.address, true, 17, CW).forEach(function(l){ text(ML, y, l, 17, true, INK); y += 22; }); y += 10; }
        var ci = b.photo ? img(b.photo) : null;
        if(ci){ var f = fit(ci.w, ci.h, CW, 340); drawImg(ci, ML, y, f.w, f.h); y += f.h + 22; }
        if(b.kv.length) tableDraw(null, b.kv, [1, 2], null, undefined, true);
      } else if(b.t === "toc"){
        newPage();
        text(ML, y, "Sisällysluettelo", 15, true, NAVY); y += 30;
        tocPages.push({ page: pg, y: y });
        /* Varataan sisällysluettelolle niin monta sivua kuin otsikoita on */
        var sim = y;
        rep.blocks.forEach(function(q){
          if(q.t !== "h1" && q.t !== "h2") return;
          var hgt = tocLineH(q.t === "h1" ? 1 : 2);
          if(sim + hgt > PH - MB){ newPage(); tocPages.push({ page: pg, y: MT }); sim = MT; }
          sim += hgt;
        });
        newPage();
      } else if(b.t === "h1"){
        if(y > MT + 1) { ensure(90); if(y > MT + 1) y += 14; }
        tocEntries.push({ lvl: 1, text: b.text, page: pages.length });
        text(ML, y, b.text, 15, true, NAVY); y += 22;
        line(ML, y, ML + CW, y, NAVY2, 1.2); y += 12;
      } else if(b.t === "h2"){
        ensure(70); y += 6;
        tocEntries.push({ lvl: 2, text: b.text, page: pages.length });
        paragraph(b.text, 11.5, true, NAVY2); y += 3;
      } else if(b.t === "h3"){
        ensure(60); y += 3;
        paragraph(b.text, 10.5, true, INK, 0, 0, false); y += 2;
      } else if(b.t === "p"){
        if(b.bold) ensure(240);
        paragraph(b.text, 10, !!b.bold, INK); y += 6;
      } else if(b.t === "verdict"){
        ensure(34); rect(ML, y, CW, 26, NAVY2); text(ML + 10, y + 7, b.text, 13, true, "1 1 1"); y += 36;
      } else if(b.t === "action"){
        var lines = wrap("Toimenpide-ehdotus: " + (b.text || "–"), false, 9.5, CW - 22), metaL = b.meta ? wrap(b.meta, false, 9, CW - 22) : [];
        var h = (lines.length + metaL.length) * 13 + 12;
        ensure(Math.min(h, 200));
        if(y + h > PH - MB){ newPage(); }
        rect(ML, y, CW, h, "1 0.945 0.902"); rect(ML, y, 3, h, ORANGE);
        var yy = y + 6;
        lines.forEach(function(l, i){
          if(i === 0 && l.indexOf("Toimenpide-ehdotus:") === 0){ text(ML + 12, yy, "Toimenpide-ehdotus:", 9.5, true); text(ML + 12 + textW("Toimenpide-ehdotus: ", true, 9.5), yy, l.slice(20), 9.5, false); }
          else text(ML + 12, yy, l, 9.5, false);
          yy += 13;
        });
        metaL.forEach(function(l){ text(ML + 12, yy, l, 9, false, SOFT); yy += 13; });
        y += h + 10;
      } else if(b.t === "kv"){
        tableDraw(null, b.rows, [1, 2], null, undefined, true);
      } else if(b.t === "table"){
        tableDraw(b.head, b.rows, b.widths, b.foot, b.status);
      } else if(b.t === "photos"){
        var gap = 14, cw = (CW - gap) / 2, maxH = 205;
        for(var i = 0; i < b.items.length; i += 2){
          var pair = [b.items[i], b.items[i + 1]].filter(Boolean), dims = [], rowH = 0;
          pair.forEach(function(it){
            var info = img(it.src), f = info ? fit(info.w, info.h, cw, maxH) : { w: cw, h: 40 }, cap = wrap(it.cap, false, 8.3, cw);
            dims.push({ info: info, f: f, cap: cap }); rowH = Math.max(rowH, f.h + 6 + cap.length * 10.5);
          });
          ensure(rowH + 6);
          dims.forEach(function(d, k){
            var x = ML + k * (cw + gap);
            if(d.info) drawImg(d.info, x, y, d.f.w, d.f.h); else rect(x, y, cw, 40, "0.9 0.9 0.9");
            d.cap.forEach(function(l, n){ text(x, y + d.f.h + 5 + n * 10.5, l, 8.3, false, SOFT, true); });
          });
          y += rowH + 10;
        }
      } else if(b.t === "spacer"){
        y += 24;
      } else if(b.t === "sign"){
        ensure(130);
        text(ML, y, (b.place ? b.place + ", " : "") + (b.date || ""), 10, false); y += 22;
        var n = b.parties.length, sw = (CW - (n - 1) * 24) / n, top = y;
        b.parties.forEach(function(p, k){
          var x = ML + k * (sw + 24), info = p.img ? img(p.img) : null;
          if(info){ var f = fit(info.w, info.h, sw, 56); drawImg(info, x, top + 56 - f.h, f.w, f.h); }
          line(x, top + 60, x + sw, top + 60, INK, 0.8);
          text(x, top + 66, p.name || "Nimenselvennys", 9.5, !!p.name, p.name ? INK : "0.54 0.58 0.56");
          text(x, top + 80, p.role, 9, false, SOFT);
        });
        y = top + 100;
      }
    });

    /* sisällysluettelo */
    if(tocPages.length){
      var keep = pg, ti = 0; pg = tocPages[0].page; var ty = tocPages[0].y;
      tocEntries.forEach(function(e){
        if(ty + tocLineH(e.lvl) > PH - MB){ if(!tocPages[ti + 1]) return; ti++; pg = tocPages[ti].page; ty = tocPages[ti].y; }
        var ind = e.lvl === 1 ? 0 : 16, size = e.lvl === 1 ? 10.5 : 9.5, bold = e.lvl === 1, label = e.text;
        if(e.lvl === 1) ty += 4;
        var maxW = CW - ind - 40; while(textW(label, bold, size) > maxW && label.length > 4) label = label.slice(0, -2);
        if(label !== e.text) label = label.replace(/\s+\S*$/, "") + "…";
        text(ML + ind, ty, label, size, bold);
        var lw = textW(label, bold, size), pn = String(e.page), pw = textW(pn, bold, size);
        var dots = ""; var dw = textW(".", false, size); var span = CW - ind - lw - pw - 10;
        for(var d = 0; d < span / (dw * 2); d++) dots += ". ";
        text(ML + ind + lw + 5, ty, dots, size, false, "0.6 0.62 0.62");
        text(ML + CW - pw, ty, pn, size, bold);
        ty += size * 1.6;
      });
      pg = keep;
    }
    /* ylä- ja alatunniste */
    var N = pages.length;
    pages.forEach(function(p, i){
      pg = p;
      if(!p.cover){
        var hdr = rep.header; while(textW(hdr, false, 7.8) > CW - 80 && hdr.length > 5) hdr = hdr.slice(0, -2);
        text(ML, 30, hdr, 7.8, false, SOFT);
        if(rep.date) text(ML + CW - textW(rep.date, false, 7.8), 30, rep.date, 7.8, false, SOFT);
        line(ML, 42, ML + CW, 42);
      }
      var ft = "Sivu " + (i + 1) + " / " + N; text((PW - textW(ft, false, 7.8)) / 2, PH - 34, ft, 7.8, false, SOFT);
    });

    /* kokoaminen */
    var chunks = [], offsets = [], pos = 0, objCount = 0;
    function addRaw(u8){ chunks.push(u8); pos += u8.length; }
    function latin(s){ var u = new Uint8Array(s.length); for(var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; }
    function obj(n, body, stream){
      offsets[n] = pos;
      addRaw(latin(n + " 0 obj\n" + body + (stream ? "\nstream\n" : "\nendobj\n")));
      if(stream){ addRaw(stream); addRaw(latin("\nendstream\nendobj\n")); }
    }
    var nFontBase = 3, nImgBase = 6, nPageBase = nImgBase + images.length;
    objCount = nPageBase + pages.length * 2 - 1;
    addRaw(latin("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n"));
    obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
    var kids = pages.map(function(_, i){ return (nPageBase + i * 2 + 1) + " 0 R"; }).join(" ");
    obj(2, "<< /Type /Pages /Kids [" + kids + "] /Count " + pages.length + " >>");
    obj(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    obj(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    obj(5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>");
    var xobj = images.map(function(im, i){ return "/" + im.name + " " + (nImgBase + i) + " 0 R"; }).join(" ");
    images.forEach(function(im, i){
      var cs = im.comps === 1 ? "/DeviceGray" : im.comps === 4 ? "/DeviceCMYK /Decode [1 0 1 0 1 0 1 0]" : "/DeviceRGB";
      obj(nImgBase + i, "<< /Type /XObject /Subtype /Image /Width " + im.w + " /Height " + im.h + " /ColorSpace " + cs + " /BitsPerComponent 8 /Filter /DCTDecode /Length " + im.bytes.length + " >>", im.bytes);
    });
    var res = "<< /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >>" + (xobj ? " /XObject << " + xobj + " >>" : "") + " >>";
    pages.forEach(function(p, i){
      var content = latin(p.ops.join("\n"));
      obj(nPageBase + i * 2, "<< /Length " + content.length + " >>", content);
      obj(nPageBase + i * 2 + 1, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + PW + " " + PH + "] /Resources " + res + " /Contents " + (nPageBase + i * 2) + " 0 R >>");
    });
    var infoN = objCount + 1;
    obj(infoN, "<< /Title " + pdfStr(rep.title + (rep.address ? " - " + rep.address : "")) + " /Producer (" + APP_NAME + ") >>");
    var xref = pos, x = "xref\n0 " + (infoN + 1) + "\n0000000000 65535 f \n";
    for(var k = 1; k <= infoN; k++) x += String(offsets[k] || 0).padStart(10, "0") + " 00000 n \n";
    x += "trailer\n<< /Size " + (infoN + 1) + " /Root 1 0 R /Info " + infoN + " 0 R >>\nstartxref\n" + xref + "\n%%EOF\n";
    addRaw(latin(x));
    return concat(chunks);
  }

  /* ---------------- JSON-varmuuskopio ---------------- */
  function exportJson(insp){
    var m = clone(insp); delete m.savedAt;
    return { muoto: JSON_FORMAT, versio: 1, sovellus: APP_VERSION, viety: new Date().toISOString(), tarkastus: m };
  }
  /* Tuonti: oma muoto sekä alkuperäisen Kuntotarkastusmuistion (kmu-muistio) tallennus */
  function importJson(d){
    if(d && d.muoto === JSON_FORMAT && d.versio > 1) throw new Error("Tiedosto on tehty uudemmalla sovellusversiolla. Päivitä sovellus.");
    if(d && d.muoto === JSON_FORMAT && d.tarkastus) return normalize(d.tarkastus);
    if(d && d.muoto === "kmu-muistio" && d.muistio){
      var k = d.muistio, o = k.osat || {};
      if(typeof k !== "object") throw new Error("Tiedosto on vioittunut.");
      var insp = { id: k.id || uid(), app: JSON_FORMAT, versio: 1, tyyppi: "kunto", meta: k.meta || {},
        cover: { photos: k.coverPhotos || [], captions: k.coverCaptions || [] },
        osat: { lahto: o.lahto, asiak: o.asiak, lasna: o.lasna, rajaus: o.rajaus, yhteenveto: o.yhteenveto },
        iv: o.iv, ovi: o.ovi, havainnot: k.havainnot || [], mittaukset: k.mittaukset || {}, lista: {}, sign: {} };
      return normalize(insp);
    }
    throw new Error("Tiedosto ei ole Tarkastusmuistion varmuuskopio.");
  }

  return {
    APP_NAME: APP_NAME, APP_VERSION: APP_VERSION, MAX_PHOTOS: MAX_PHOTOS, TEMPLATES: TEMPLATES, LISTS: LISTS, MEAS: MEAS, TILAT: TILAT,
    IV_TYYPIT: IV_TYYPIT, PE_TAVAT: PE_TAVAT,
    uid: uid, todayISO: todayISO, fmtDate: fmtDate, num: num, clone: clone, trim: trim,
    fresh: fresh, normalize: normalize, blankHav: blankHav, blankSub: blankSub, findHav: findHav, listItem: listItem,
    filled: filled, havFilled: havFilled, subFilled: subFilled, sectionFilled: sectionFilled, hasContent: hasContent, listStats: listStats,
    measCalc: measCalc, money: money, rowEmpty: rowEmpty, fileBase: fileBase,
    buildReport: buildReport, buildDocx: buildDocx, buildPdf: buildPdf, exportJson: exportJson, importJson: importJson,
    dataUrlInfo: dataUrlInfo
  };
})();
if(typeof module !== "undefined") module.exports = KT;
