# Aanvragen naar Google Sheets (+ bevestiging via MailerSend)

Het formulier stuurt elke aanvraag naar een Google Apps Script. Dat script:

1. zet de aanvraag als nieuwe regel in het tabblad **Aanvragen** van de sheet;
2. stuurt de klant een bevestiging via **MailerSend**;
3. stuurt het team een korte melding met een link naar de sheet. In die melding staan geen IBAN, geboortedatum of adres.

## Eenmalig instellen (± 15 minuten)

### 1. Sheet en script
1. Maak een nieuwe Google Sheet, bijvoorbeeld "Bakfiets leaseaanvragen Fietsoptimaal". Gebruik bij voorkeur het zakelijke Google-account (Workspace).
2. Menu **Extensies → Apps Script**.
3. Vervang de inhoud van `Code.gs` door de inhoud van [`Code.gs`](Code.gs) uit deze map en sla op.

### 2. Instellingen
In Apps Script: **Projectinstellingen** (tandwiel) → **Scripteigenschappen** → toevoegen:

| Eigenschap | Waarde |
|---|---|
| `NOTIFY_EMAIL` | adres(sen) voor de melding, bijv. `info@fietsleaseholland.nl` |
| `MAILERSEND_API_TOKEN` | API-token uit MailerSend (Integrations → API tokens), met recht *Email: full access* |
| `MAIL_FROM` | afzender op jullie geverifieerde domein in MailerSend, bijv. `noreply@fietsleaseholland.nl` |
| `MAIL_FROM_NAME` | `Fietslease Holland` |
| `MAIL_REPLY_TO` | optioneel: adres waar antwoorden van klanten heen gaan |

Zet het token nooit in de code of in de repo, alleen hier.

### 3. Publiceren als web-app
1. **Implementeren → Nieuwe implementatie** → type **Web-app**.
2. *Uitvoeren als*: **Ik**. *Wie heeft toegang*: **Iedereen**. Dat moet zo, anders kan het formulier niets versturen. Alleen het script schrijft in de sheet; de sheet zelf blijft privé.
3. Geef toestemming als Google erom vraagt (sheet bewerken, e-mail sturen, externe verzoeken voor MailerSend).
4. Kopieer de **web-app-URL** (eindigt op `/exec`).
5. Zet die URL in `index.html` bij `const SUBMIT_URL = '…'`.

Testen: open de web-app-URL in je browser. Als het goed staat, zie je `{"ok":true,...}`.

Na een wijziging in `Code.gs`: **Implementeren → Implementaties beheren → bewerken → Nieuwe versie**. Dan blijft de URL hetzelfde.

## Goed om te weten
- **Privacy:** de sheet bevat persoonsgegevens en bij zakelijke aanvragen ook een IBAN. Deel de sheet alleen met wie de aanvragen behandelt. Gebruik bij voorkeur Google Workspace, met verwerkersovereenkomst.
- **Misbruik:** de web-app-URL is openbaar. Het script controleert alle velden opnieuw en heeft een honeypot. Het laat maximaal 3 aanvragen per e-mailadres en 40 in totaal per 10 minuten toe. Waarden die met `=`, `+`, `-` of `@` beginnen, worden als tekst opgeslagen, zodat er geen formules worden uitgevoerd.
- **Dubbel klikken:** elke aanvraag heeft een eigen sleutel. Opnieuw versturen na een netwerkfout geeft dezelfde referentie en geen tweede regel.
- **Prijzen:** de maand- en totaalprijs komen uit het formulier. Controleer ze bij het opstellen van het contract.
