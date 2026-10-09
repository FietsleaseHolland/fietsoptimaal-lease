# Bakfiets lease – aanvraagformulier voor Fietsoptimaal

Losse pagina waarmee klanten van Fietsoptimaal een bakfiets samenstellen en vrijblijvend een lease aanvragen bij Fietslease Holland. De pagina komt op een subdomein van Fietslease Holland en Fietsoptimaal plaatst hem als iframe op zijn site.

- `index.html` – het formulier (alles in één bestand, geen build nodig)
- `img/` – productfoto's (van Fietsoptimaal, met toestemming)
- `iframe-test.html` – testpagina die het formulier als iframe toont, met knoppen voor desktop-, tablet- en telefoonbreedte

## Lokaal bekijken

```bash
python3 -m http.server 8000
```

Open daarna `http://localhost:8000/iframe-test.html`.

## Prijzen aanpassen

Alles staat bovenin het script in `index.html`:

- `MODELS` – modellen, kleuren, opties. Prijzen **excl. btw**, zoals in "FIETSLEASE HOLLAND OPZET.xlsx". De pagina toont ze incl. btw (× 1,21).
- `PLUS_ITEMS` – inhoud van het pluspakket (winkelwaarde incl. btw).
- `STAFFEL` – de E-Bike-staffel uit "250506 staffellijst FLH.xlsx": totaalprijs incl. btw wordt afgerond naar de eerstvolgende staffel. De regel van € 5.449 (36 mnd stond op € 210) is op `null` gezet en valt terug op de volgende staffel.

## Embedcode voor de partner

Vervang `https://lease.fietsleaseholland.nl/` door de echte URL.

```html
<iframe id="flh-bakfiets-lease" src="https://lease.fietsleaseholland.nl/" title="Bakfiets lease aanvragen" style="display:block;width:100%;height:2400px;border:0" loading="lazy"></iframe>
<script>
  (function () {
    var frame = document.getElementById('flh-bakfiets-lease');
    var origin = new URL(frame.src, location.href).origin;
    window.addEventListener('message', function (e) {
      if (e.origin !== origin || !e.data || e.data.type !== 'lease-form:height') return;
      frame.style.height = e.data.height + 'px';
    });
  })();
</script>
```

Het formulier stuurt zijn hoogte naar de partnerpagina, zodat het iframe meegroeit en er geen tweede scrollbalk komt.

## Nog te doen

- Versturen koppelen aan de backend (nu wordt de aanvraag alleen in de console gelogd, zie `buildPayload()`).
- Subdomein inrichten en daar alleen framing door de site van de partner toestaan (`Content-Security-Policy: frame-ancestors https://www.fietsoptimaal.nl`).
