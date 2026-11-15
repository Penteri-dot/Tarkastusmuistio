# Tarkastusmuistio

Puhelimen selaimessa toimiva muistio kolmeen tarkastukseen:

| Tyyppi | Käyttö | Erityistä |
|---|---|---|
| 🏠 **Kuntotarkastus** | Kiinteistön tai asunnon yleistarkastus | Rakenneosien tarkistuslista, havainnot, ilmanvaihto, 10 mittaustaulukkoa (vesihöyry g/m³ ja 15 cm riskiraja lasketaan) |
| 🔑 **Ostokatselmus** | Oma katselmus ennen asunnon ostoa | Tarkistuslista, kustannusarviot havainnoille (summa raporttiin), johtopäätös Jatketaan / Harkitaan / Ei jatkoon |
| 📦 **Muuttotarkastus** | Vuokra-asunnon sisään- ja poismuutto | Huonekohtainen lista, mittarilukemat, vastuu ja korvaus, allekirjoitukset sormella |

Raportti viedään **PDF:nä**, **Word-tiedostona** (kansilehti, sisällysluettelo, kuvanumerointi, toimenpidetaulukko) tai **JSON-varmuuskopiona**, jonka voi tuoda takaisin. Tuonti tukee myös alkuperäisen *Kuntotarkastusmuistion* (`kmu-muistio`) JSON-tiedostoja.

## Yksityisyys

- Ei palvelinta, ei kirjautumista, ei ulkoisia kirjastoja eikä fontteja.
- Tiedot ja kuvat tallentuvat vain selaimen omaan tietokantaan (IndexedDB) siinä laitteessa, jolla ne kirjataan.
- Sivun `Content-Security-Policy` estää selaimen tasolla kaikki verkkokutsut (`connect-src 'none'`), joten sovellus ei pysty lähettämään tietoja minnekään.
- Offline: kun sivu on kerran avattu verkko-osoitteesta, service worker pitää sovelluksen käytettävissä ilman verkkoa.

## Rakenne

```
index.html            valmis sovellus (yksi tiedosto) – tätä käytetään
sw.js, manifest…      offline-tuki ja kotivalikon kuvake
src/core.js           tietomalli, tarkastuspohjat, Word- ja PDF-generaattori
src/ui.js             käyttöliittymä ja tallennus
src/shell.html        HTML-runko ja tyylit
build.py              kokoaa src/-osat index.html:ksi
test/                 Node-testit (run.js) ja selaintesti (ui_test.py)
```

Muutokset tehdään `src/`-kansioon ja ajetaan `python3 build.py`.
Pohjat (tarkistuslistat, kentät, mittaukset) ovat `src/core.js`:n alussa (`TEMPLATES`, `LISTS`, `MEAS`), joten uuden tarkastustyypin tai listakohdan lisääminen on pelkkää tietoa.

## Testit

```
python3 test/make_images.py
python3 build.py
node test/run.js          # tekee esimerkkiraportit kansioon test/out/
```

## Käyttöönotto puhelimessa

Repo on julkinen ilman GitHub Pagesia. Jos haluat sovelluksen omaan osoitteeseen, ota käyttöön *Settings → Pages → Deploy from branch → main / root*, jolloin osoite on `https://penteri-dot.github.io/tarkastusmuistio/`.

Toteutus on itsenäinen uudelleenkirjoitus, jonka toiminnallisuus on saanut innoituksen Ins. tsto Kärkimaa Oy:n Kuntotarkastusmuistiosta.
