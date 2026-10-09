# Bakfiets lease – aanvraagformulier voor Fietsoptimaal

Losse pagina waarmee klanten van Fietsoptimaal een bakfiets samenstellen en vrijblijvend een lease aanvragen bij Fietslease Holland. De pagina komt op een subdomein van Fietslease Holland en Fietsoptimaal plaatst hem als iframe op zijn site.

- `index.html` – het formulier (alles in één bestand, geen build nodig)
- `img/` – productfoto's (van Fietsoptimaal, met toestemming)
- `embed.js` – klein script voor de partnerpagina: iframe groeit mee en scrollen werkt goed
- `iframe-test.html` – testpagina die het formulier als iframe toont, met knoppen voor verschillende breedtes

## Lokaal bekijken

```bash
python3 -m http.server 8000
```

Open daarna `http://localhost:8000/iframe-test.html`.

## Prijzen aanpassen

Alles staat bovenin het script in `index.html`:

- `MODELS` – modellen, kleuren, opties. Prijzen **excl. btw**, zoals in "FIETSLEASE HOLLAND OPZET.xlsx". De pagina toont ze incl. btw (× 1,21).
- `PLUS_ITEMS` – inhoud van het pluspakket (winkelwaarde incl. btw).
- `STAFFEL` – de E-Bike-staffel uit "250506 staffellijst FLH.xlsx": totaalprijs incl. btw wordt afgerond naar de eerstvolgende staffel. (De regel van € 5.449 bij 36 mnd stond op € 210 en is op `null` gezet; met de huidige modellen kom je daar niet.)
- `GPS_THRESHOLD` – boven € 4.999 fietswaarde (incl. btw) wordt GPS-beveiliging automatisch toegevoegd (eis verzekering). Alleen bij modellen met een `gps`-veld (de Royals).

## Inbouwen op de site van de partner

Plak dit op de pagina waar het formulier moet komen. In WordPress: blok **Aangepaste HTML**; in Elementor: widget **HTML**.

```html
<iframe data-fietslease-bakfiets src="https://fietsleaseholland.github.io/fietsoptimaal-lease/" title="Bakfiets lease aanvragen" style="display:block;width:100%;height:85vh;min-height:640px;border:0" loading="lazy"></iframe>
<script src="https://fietsleaseholland.github.io/fietsoptimaal-lease/embed.js" async></script>
```

(Na livegang worden beide URL's het subdomein van Fietslease Holland.)

**Wat de partner moet weten**

- Zet het in een vak van **volledige breedte** van de inhoud, zonder vaste hoogte of extra binnenmarge. Het formulier past zich zelf aan: twee kolommen vanaf 960 px breed, één kolom daaronder, telefoonweergave tot 320 px.
- Heeft de site een **vaste menubalk** bovenin? Zet dan de hoogte ervan op het iframe, bijvoorbeeld `data-offset="90"`. Dan valt een stap of foutmelding niet onder de menubalk als het formulier ernaartoe scrollt.
- De pagina van de partner heeft al een viewport-meta (`<meta name="viewport" content="width=device-width, initial-scale=1">`); dat is bij vrijwel elke site al zo.

**Hoe het werkt**

- *Met* `embed.js`: het iframe groeit mee met de inhoud, er is geen tweede scrollbalk, en scrollen binnen het formulier (naar een stap, foutmelding of het bedankscherm) scrollt de partnerpagina mee.
- *Zonder* `embed.js` (bijvoorbeeld als een CMS scripts weghaalt): het iframe blijft 85% van de schermhoogte en scrollt zelf. Alles blijft werken: de samenvatting blijft staan en op telefoon is er een balk met de maandprijs onderin.
- Testen kan op `iframe-test.html` met knoppen voor desktop, laptop, tablet, telefoon en 320 px. Met `?zonder-script` zie je de tweede situatie.

## Nog te doen

- Aanvragen gaan naar een Google Sheet via Apps Script: zie [apps-script/README.md](apps-script/README.md). Zolang `SUBMIT_URL` in `index.html` leeg is, staat het formulier in demomodus.
- Subdomein inrichten en daar alleen framing door de site van de partner toestaan (`Content-Security-Policy: frame-ancestors https://www.fietsoptimaal.nl`).
