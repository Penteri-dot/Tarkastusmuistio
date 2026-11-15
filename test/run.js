// Ytimen testit: tekee esimerkkitarkastukset kaikista tyypeistä ja kirjoittaa docx/pdf/json-tiedostot.
const fs = require("fs"), path = require("path");
const KT = require(path.join(__dirname, "core.built.js"));
const I = JSON.parse(fs.readFileSync(path.join(__dirname, "imgs.json")));
const out = path.join(__dirname, "out"); fs.mkdirSync(out, { recursive: true });
let fails = 0;
function ok(c, msg){ if(!c){ fails++; console.log("FAIL:", msg); } }

// 1. Kuntotarkastus
let k = KT.fresh("kunto", { tarkastaja: "Antti Saarelainen", patevyys: "PKA", yritys: "Testi Oy, 040 123 4567" });
Object.assign(k.meta, { osoite: "Kalliotie 5 A, 00100 Helsinki", tilaaja: "Matti Meikäläinen", tilaajaYht: "matti@example.com", rakennusvuosi: "1972" });
k.cover.photos.push(I.a); k.cover.captions.push("Julkisivu etelästä");
k.osat.lahto.text = "Tarkastus tehtiin asuntokaupan yhteydessä.\nMyyjän mukaan kylpyhuone remontoitu 2015.";
k.osat.lasna.text = "Matti Meikäläinen, tilaaja\nAntti Saarelainen, tarkastaja";
KT.listItem(k, "k0-0").tila = "ok";
const li = KT.listItem(k, "k0-1"); li.tila = "korj"; li.text = "Maanpinta viettää sokkeliin päin itäsivulla."; li.photos.push(I.b); li.captions.push("Itäsivu");
KT.listItem(k, "k3-1").tila = "huom";
k.havainnot[0].title = "Makuuhuone (ÄÖÅ-testi: €, –, ³, °C)";
k.havainnot[0].text = "Ulkoseinän alaosassa kohonneita pintakosteuslukemia. ".repeat(6);
k.havainnot[0].photos.push(I.b, I.c); k.havainnot[0].captions.push("Seinän alaosa", "");
k.havainnot[0].ehdotus = "Rakenneavaus ja kosteusmittaus."; k.havainnot[0].kiire = "Heti";
const s1 = KT.blankSub(); s1.title = "Pintakosteus"; s1.text = "Kohonneet lukemat 0,5 m matkalla."; k.havainnot[0].sub.push(s1);
const h2 = KT.blankHav(); h2.title = "Kylpyhuone"; h2.text = "Lattiakaivon ympärillä halkeama."; h2.ehdotus = "Seuranta."; h2.kiire = "Seuranta"; k.havainnot.push(h2);
k.iv.tyyppi = "Koneellinen poisto"; k.iv.peTapa = "Mitattu"; k.iv.peTulos = "-5 Pa"; k.iv.ehdotus = "Venttiilien puhdistus"; k.iv.kiire = "1–2 v";
k.mittaukset.ilma[0].t = "2,5"; k.mittaukset.ilma[0].rh = "85"; k.mittaukset.ilma[1].t = "21"; k.mittaukset.ilma[1].rh = "35";
k.mittaukset.korkeus.push({ paikka: "Itäsivu", lattia: "12", runko: "20" });
k.mittaukset.porareika.push({ menetelma: "Porareikä", paikka: "Makuuhuone", rakenne: "Alapohja", t: "18", rh: "92", photos: [I.c], captions: ["Mittauspiste"] });
k.osat.yhteenveto.text = "Kohde on ikäisekseen tavanomaisessa kunnossa. Makuuhuoneen ulkoseinän kosteus selvitettävä.";
for(let n = 0; n < 12; n++){ const h = KT.blankHav(); h.title = "Lisähavainto " + n; h.text = "Teksti ".repeat(40); k.havainnot.push(h); }

// 2. Ostokatselmus
let o = KT.fresh("osto", { tarkastaja: "Antti" });
Object.assign(o.meta, { osoite: "Rautatienkatu 10 B 12, 15110 Lahti", kohde: "2h+k, 48 m²", hinta: "129 000 €", taloyhtio: "As Oy Testi / Isännöinti Oy" });
o.osat.taustat.text = "Vastike 4,20 €/m². Putkiremontti PTS:ssä 2029.";
KT.listItem(o, "o1-0").tila = "korj"; KT.listItem(o, "o1-0").text = "Kylpyhuone alkuperäinen 1985.";
o.havainnot[0].title = "Kylpyhuone"; o.havainnot[0].ehdotus = "Remontti"; o.havainnot[0].kiire = "1–2 v"; o.havainnot[0].kustannus = "12000";
const oh = KT.blankHav(); oh.title = "Parveke"; oh.ehdotus = "Lattian pinnoitus"; oh.kustannus = "800 €"; o.havainnot.push(oh);
o.osat.paatos.valinta = "Harkitaan"; o.osat.paatos.text = "Tarjous 115 000 €, perusteena kylpyhuone.";

// 3. Muuttotarkastus
let m = KT.fresh("muutto", { vuokranantaja: "Platinum Asunnot Oy", tarkastaja: "Antti" });
Object.assign(m.meta, { laji: "Poismuutto", osoite: "Vesijärvenkatu 3 A 5, Lahti", vuokralainen: "Liisa Vuokralainen", avaimet: "3" });
KT.listItem(m, "m0-0").tila = "ok"; KT.listItem(m, "m3-1").tila = "korj"; KT.listItem(m, "m3-1").text = "Uunin luukun lasi rikki";
m.havainnot[0].title = "Uuni"; m.havainnot[0].ehdotus = "Luukun lasin vaihto"; m.havainnot[0].kiire = "Vuokralainen"; m.havainnot[0].kustannus = "150";
m.mittaukset.mittari[0].lukema = "123,4 m³";
m.osat.sovitut.text = "Vakuudesta vähennetään 150 €.";
m.sign.vuokranantaja = { name: "Antti Saarelainen", img: I.sig }; m.sign.vuokralainen = { name: "Liisa Vuokralainen", img: null };
m.sign._place = { name: "Lahti" };

for(const [name, insp] of [["kunto", k], ["osto", o], ["muutto", m]]){
  const rep = KT.buildReport(insp);
  ok(rep.blocks[0].t === "cover", name + " cover");
  const docx = KT.buildDocx(rep), pdf = KT.buildPdf(rep);
  fs.writeFileSync(path.join(out, name + ".docx"), docx);
  fs.writeFileSync(path.join(out, name + ".pdf"), pdf);
  const j = KT.exportJson(insp), back = KT.importJson(JSON.parse(JSON.stringify(j)));
  ok(back.id === insp.id && back.tyyppi === insp.tyyppi, name + " json roundtrip");
  console.log(name, rep.filename, "blocks", rep.blocks.length, "h1:", rep.blocks.filter(b => b.t === "h1").map(b => b.text).join(" | "));
  const tables = rep.blocks.filter(b => b.t === "table");
  if(name !== "muutto") console.log("  toimenpiteet:", JSON.stringify(tables[0].rows.slice(0, 3)), tables[0].foot || "");
}
ok(KT.measCalc("ilma", { t: "21", rh: "35" }).short === "6,4", "ah calc " + KT.measCalc("ilma", { t: "21", rh: "35" }).short);
ok(KT.measCalc("korkeus", { lattia: "12" }).warn, "h15");
ok(!KT.hasContent(KT.fresh("kunto", { tarkastaja: "X" })), "fresh empty");
ok(KT.hasContent(k), "has content");
// kmu-tuonti
const kmu = { muoto: "kmu-muistio", versio: 1, muistio: { id: "abc", meta: { osoite: "Testi 1" }, osat: { lahto: { text: "L", photos: [], captions: [] }, iv: { tyyppi: "Painovoimainen" } }, havainnot: [{ title: "H", text: "t", sub: [] }], coverPhotos: [], mittaukset: { ilma: [{ paikka: "Ulko", t: "1", rh: "80" }] } } };
const ki = KT.importJson(kmu); ok(ki.osat.lahto.text === "L" && ki.iv.tyyppi === "Painovoimainen" && ki.havainnot[0].title === "H", "kmu import");
// Siivous: viallinen tai pahantahtoinen varmuuskopio
const evil = { muoto: "tarkastusmuistio", versio: 1, tarkastus: { id: 'x" onclick="alert(1)', tyyppi: "constructor", meta: { osoite: { a: 1 } },
  cover: { photos: ['x" onerror="alert(1)', I.a], captions: ["huono", "hyvä"] }, havainnot: [{ id: "<script>", title: 5, sub: "x", photos: "y" }, null],
  lista: { 'k0-0': { tila: "hax" }, 'bad"key': { tila: "ok" } }, mittaukset: { ilma: "x", korkeus: [{ paikka: { x: 1 }, lattia: 12 }, 7] }, sign: { a: { img: "javascript:1", name: [] } } } };
const ev = KT.importJson(evil);
ok(/^[a-z0-9]+$/.test(ev.id) && ev.tyyppi === "kunto" && ev.meta.osoite === "", "sanitize id/type/meta");
ok(ev.cover.photos.length === 1 && ev.cover.captions[0] === "hyvä", "sanitize photos");
ok(ev.havainnot.length === 1 && ev.havainnot[0].title === "5" && ev.havainnot[0].sub.length === 0 && /^[a-z0-9]+$/.test(ev.havainnot[0].id), "sanitize hav");
ok(ev.lista["k0-0"].tila === "" && !ev.lista['bad"key'], "sanitize lista");
ok(ev.mittaukset.ilma.length === 2 && ev.mittaukset.korkeus.length === 1 && ev.mittaukset.korkeus[0].lattia === "12" && ev.mittaukset.korkeus[0].paikka === "", "sanitize meas");
ok(ev.sign.a.img === null && ev.sign.a.name === "", "sanitize sign");
KT.buildPdf(KT.buildReport(ev)); KT.buildDocx(KT.buildReport(ev));
let threw = 0; for(const bad of [null, 5, {}, { muoto: "tarkastusmuistio", versio: 2, tarkastus: {} }, { muoto: "tarkastusmuistio", tarkastus: "x" }, { muoto: "kmu-muistio", muistio: 3 }]){ try { KT.importJson(bad); } catch(e){ threw++; } }
ok(threw === 6, "bad imports rejected " + threw);
ok(KT.money("1 500") === 1500 && KT.money("1500,50 €") === 1500.5 && isNaN(KT.money("1500–2000")) && isNaN(KT.money("noin 500")), "money");
// Pitkä sisällysluettelo: 120 havaintoa -> kaikki otsikot mahtuvat luetteloon
const big = KT.fresh("kunto", {}); big.meta.osoite = "Pitkä 1"; big.havainnot = [];
for(let n = 0; n < 120; n++){ const h = KT.blankHav(); h.title = "Havainto numero " + n; h.text = "x"; big.havainnot.push(h); }
const bigPdf = Buffer.from(KT.buildPdf(KT.buildReport(big))); fs.writeFileSync(path.join(out, "big.pdf"), bigPdf);
ok(bigPdf.toString("latin1").includes("1.120 Havainto numero 119"), "toc holds all entries");
console.log(fails ? fails + " FAIL" : "ALL OK");
