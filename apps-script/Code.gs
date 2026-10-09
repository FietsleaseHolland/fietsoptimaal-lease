/**
 * Ontvangt bakfiets-leaseaanvragen van het formulier en zet ze in deze Google Sheet.
 * Stuurt de klant een bevestiging via MailerSend en het team een melding (zonder IBAN).
 *
 * Instellingen staan in Projectinstellingen -> Scripteigenschappen (zie README.md):
 *   NOTIFY_EMAIL           e-mailadres(sen) voor de melding, komma-gescheiden
 *   MAILERSEND_API_TOKEN   API-token van MailerSend (leeg = geen bevestiging naar de klant)
 *   MAIL_FROM              afzender, op een domein dat in MailerSend is geverifieerd (bijv. noreply@fietsleaseholland.nl)
 *   MAIL_FROM_NAME         naam van de afzender (standaard "Fietslease Holland")
 *   MAIL_REPLY_TO          optioneel: antwoordadres voor de klant
 */

var SHEET_NAME = 'Aanvragen';
var COLUMNS = [
  'Ontvangen', 'Referentie', 'Status', 'Bron', 'Priv\u00e9/zakelijk',
  'Voorletters', 'Achternaam', 'Geboortedatum', 'E-mail', 'Telefoon',
  'Straat', 'Huisnummer', 'Toevoeging', 'Postcode', 'Plaats',
  'Bedrijfsnaam', 'KVK-nummer', 'Btw-nummer', 'Tekeningsbevoegde', 'IBAN',
  'Model', 'Uitvoering', 'Kleur', 'Pluspakket', 'Opties',
  'Looptijd (mnd)', 'Maandprijs incl. btw', 'Totaalprijs incl. btw', 'Opmerkingen', 'Idempotency-key',
];

function doPost(e) {
  try {
    var data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    return json(handle(data));
  } catch (err) {
    console.error(err);
    return json({ ok: false, message: 'Je aanvraag kon niet worden verwerkt. Probeer het later opnieuw.' });
  }
}

/** Handig om te testen: open de web-app-URL in je browser. */
function doGet() {
  return json({ ok: true, service: 'bakfiets-lease-aanvragen' });
}

function handle(d) {
  if (d.website) return { ok: false, message: 'Je aanvraag kon niet worden verstuurd.' }; // honeypot
  var c = d.customer || {};
  var b = d.business || null;
  var bike = d.bike || {};

  // Controle (het formulier controleert ook, maar de URL is openbaar)
  var errors = [];
  if (!/^[A-Za-z.\s]{1,15}$/.test(c.initials || '')) errors.push('voorletters');
  if (!c.lastName) errors.push('achternaam');
  if (!/^\d{1,2}[-\/. ]\d{1,2}[-\/. ]\d{4}$/.test(c.birthDate || '')) errors.push('geboortedatum');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.email || '')) errors.push('e-mailadres');
  if (String(c.phone || '').replace(/[^\d+]/g, '').length < 10) errors.push('telefoonnummer');
  if (!c.street || !c.city || !/^\d+$/.test(c.houseNumber || '')) errors.push('adres');
  if (!/^[1-9]\d{3}\s?[A-Za-z]{2}$/.test(c.postalCode || '')) errors.push('postcode');
  if (c.leaseVia === 'zakelijk') {
    if (!b || !b.company || !/^\d{8}$/.test(b.kvk || '') || !/^NL\d{9}B\d{2}$/i.test(b.vatNumber || '') || !b.signatory || !b.iban) errors.push('bedrijfsgegevens');
  }
  if (!bike.name) errors.push('bakfiets');
  if (errors.length) return { ok: false, message: 'Controleer je ' + errors.join(', ') + '.' };

  var cache = CacheService.getScriptCache();
  var key = String(d.idempotencyKey || '').slice(0, 80);
  if (key && cache.get('idem:' + key)) return { ok: true, reference: cache.get('idem:' + key) };

  // Rem tegen misbruik: max. 3 aanvragen per e-mailadres en 40 in totaal per 10 minuten
  var mailKey = 'mail:' + String(c.email).toLowerCase();
  var perMail = Number(cache.get(mailKey) || 0);
  var total = Number(cache.get('total') || 0);
  if (perMail >= 3 || total >= 40) return { ok: false, message: 'Er zijn net al aanvragen gedaan. Probeer het over 10 minuten opnieuw.' };

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  var reference;
  try {
    if (key && cache.get('idem:' + key)) return { ok: true, reference: cache.get('idem:' + key) };
    reference = newReference();
    var sheet = getSheet();
    var row = [
      new Date(), reference, 'Nieuw', d.partner || '', c.leaseVia === 'zakelijk' ? 'Zakelijk' : 'Priv\u00e9',
      c.initials, c.lastName, c.birthDate, c.email, c.phone,
      c.street, c.houseNumber, c.addition, c.postalCode, c.city,
      b ? b.company : '', b ? b.kvk : '', b ? b.vatNumber : '', b ? b.signatory : '', b ? b.iban : '',
      bike.name, bike.version === 'dog' ? 'Dog' : (bike.model === 'vanrixtel' ? 'Family' : ''), bike.colorName,
      d.plusPackage ? 'Ja' : 'Nee', optionNames(d, false), d.termMonths, d.monthlyInclVat, d.totalInclVat, c.remarks, key,
    ].map(function (v, i) { return i === 0 ? v : cell(v); });
    sheet.appendRow(row);
    if (key) cache.put('idem:' + key, reference, 6 * 3600);
    cache.put(mailKey, String(perMail + 1), 600);
    cache.put('total', String(total + 1), 600);
  } finally {
    lock.releaseLock();
  }

  // Mails mogen de aanvraag nooit laten mislukken: die staat al in de sheet
  try { sendConfirmation(reference, d); } catch (err) { console.error('Bevestiging mislukt', err); }
  try { sendNotification(reference, d); } catch (err) { console.error('Melding mislukt', err); }
  return { ok: true, reference: reference };
}

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(COLUMNS);
    sheet.getRange(1, 1, 1, COLUMNS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    // Alles als tekst (behalve de datum), zodat telefoonnummers, postcodes en datums niet worden omgezet
    sheet.getRange(2, 2, sheet.getMaxRows() - 1, COLUMNS.length - 1).setNumberFormat('@');
    sheet.getRange(2, 1, sheet.getMaxRows() - 1, 1).setNumberFormat('dd-mm-yyyy hh:mm');
  }
  return sheet;
}

/** Voorkomt dat een waarde als formule wordt uitgevoerd (bijv. "=HYPERLINK(...)"). */
function cell(v) {
  if (v === null || v === undefined) return '';
  var s = String(v).slice(0, 2000);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

/** Gekozen extra's zonder de fiets zelf; met withPlus = false ook zonder pluspakket (dat heeft een eigen kolom). */
function optionNames(d, withPlus) {
  return (d.lines || []).slice(1)
    .map(function (l) { return String(l.label).replace(/\s*\((inbegrepen|50% korting)\)/, ''); })
    .filter(function (n) { return withPlus !== false || n.indexOf('Pluspakket') !== 0; })
    .join(', ');
}

function newReference() {
  var date = Utilities.formatDate(new Date(), 'Europe/Amsterdam', 'yyMMdd');
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var rnd = '';
  for (var i = 0; i < 4; i++) rnd += chars.charAt(Math.floor(Math.random() * chars.length));
  return 'FO-' + date + '-' + rnd;
}

function eur(n) {
  if (n === null || n === undefined || n === '') return 'op aanvraag';
  return '\u20ac ' + Number(n).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; });
}

function bikeLine(d) {
  var bike = d.bike || {};
  var version = bike.version === 'dog' ? 'Dog \u00b7 ' : (bike.model === 'vanrixtel' ? 'Family \u00b7 ' : '');
  return bike.name + ' \u00b7 ' + version + bike.colorName + ' \u00b7 ' + d.termMonths + ' maanden';
}

function sendConfirmation(reference, d) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('MAILERSEND_API_TOKEN');
  var from = props.getProperty('MAIL_FROM');
  if (!token || !from) return;
  var c = d.customer;
  var extras = optionNames(d) || 'geen';
  var html =
    '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#2b302b;max-width:560px">' +
    '<p>Beste ' + esc(c.initials + ' ' + c.lastName) + ',</p>' +
    '<p>Bedankt voor je aanvraag. We hebben hem goed ontvangen.</p>' +
    '<table style="border-collapse:collapse;margin:16px 0;font-size:14px">' +
    row('Referentie', reference) +
    row('Bakfiets', bikeLine(d)) +
    row('Extra\u2019s', extras) +
    row('Leaseprijs', eur(d.monthlyInclVat) + ' per maand, incl. btw') +
    '</table>' +
    '<p><b>Zo gaat het verder</b></p>' +
    '<ol style="padding-left:18px;margin:0 0 16px">' +
    '<li>We bekijken je aanvraag. Binnen 48 uur is alles geregeld.</li>' +
    '<li>Je ontvangt het leasecontract. Pas als je het digitaal tekent, is het definitief.</li>' +
    '<li>Fietsoptimaal maakt je bakfiets rijklaar en spreekt de levering met je af.</li>' +
    '</ol>' +
    '<p>Je aanvraag is gratis en vrijblijvend. Heb je een vraag? Beantwoord deze e-mail en vermeld je referentie.</p>' +
    '<p>Met vriendelijke groet,<br>Fietslease Holland</p></div>';
  var text = 'Beste ' + c.initials + ' ' + c.lastName + ',\n\nBedankt voor je aanvraag. Referentie: ' + reference +
    '\nBakfiets: ' + bikeLine(d) + '\nExtra\u2019s: ' + extras + '\nLeaseprijs: ' + eur(d.monthlyInclVat) + ' per maand, incl. btw' +
    '\n\nBinnen 48 uur is alles geregeld. Je ontvangt het leasecontract; pas als je het digitaal tekent, is het definitief.' +
    '\n\nMet vriendelijke groet,\nFietslease Holland';
  var body = {
    from: { email: from, name: props.getProperty('MAIL_FROM_NAME') || 'Fietslease Holland' },
    to: [{ email: c.email, name: c.initials + ' ' + c.lastName }],
    subject: 'Je bakfiets-leaseaanvraag ' + reference,
    html: html,
    text: text,
  };
  var replyTo = props.getProperty('MAIL_REPLY_TO');
  if (replyTo) body.reply_to = { email: replyTo };
  var res = UrlFetchApp.fetch('https://api.mailersend.com/v1/email', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 300) throw new Error('MailerSend ' + res.getResponseCode() + ': ' + res.getContentText());
}

function row(label, value) {
  return '<tr><td style="padding:4px 16px 4px 0;color:#5f635e;vertical-align:top">' + esc(label) + '</td><td style="padding:4px 0">' + esc(value) + '</td></tr>';
}

/** Melding aan het team (sales). Bewust zonder IBAN, geboortedatum en adres: die staan alleen in de sheet. */
function sendNotification(reference, d) {
  var to = PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL');
  if (!to) return;
  var c = d.customer;
  var zakelijk = c.leaseVia === 'zakelijk';
  MailApp.sendEmail({
    to: to,
    name: 'Bakfiets leaseformulier',
    subject: 'Nieuwe aanvraag ' + reference + ' \u00b7 ' + (d.bike || {}).name + ' \u00b7 ' + (zakelijk ? 'zakelijk' : 'priv\u00e9'),
    htmlBody: notificationHtml(reference, d, SpreadsheetApp.getActiveSpreadsheet().getUrl()),
    body: 'Nieuwe bakfiets-leaseaanvraag ' + reference + '\n' + c.initials + ' ' + c.lastName + ' \u00b7 ' + c.email + ' \u00b7 ' + c.phone +
      '\n' + bikeLine(d) + '\nLeaseprijs: ' + eur(d.monthlyInclVat) + ' p/m\n\nAlle gegevens: ' + SpreadsheetApp.getActiveSpreadsheet().getUrl(),
  });
}

/** Opmaak van de salesmail: inline stijlen en tabellen, zodat hij in Outlook en Gmail hetzelfde oogt. */
function notificationHtml(reference, d, sheetUrl) {
  var c = d.customer;
  var b = d.business;
  var bike = d.bike || {};
  var zakelijk = c.leaseVia === 'zakelijk';
  var green = '#5b7835', ink = '#121612', muted = '#5f635e', line = '#e6e6e3', soft = '#f5f5f4';
  function label(s) { return '<div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:' + muted + ';font-weight:bold;margin:0 0 8px">' + esc(s) + '</div>'; }
  function kv(k, v) { return '<tr><td style="padding:3px 16px 3px 0;color:' + muted + ';font-size:14px;vertical-align:top;white-space:nowrap">' + esc(k) + '</td><td style="padding:3px 0;color:' + ink + ';font-size:14px">' + v + '</td></tr>'; }
  var extras = optionNames(d) || 'Geen';
  var phoneHref = String(c.phone || '').replace(/[^\d+]/g, '');
  return '' +
    '<div style="background:' + soft + ';padding:24px 12px;font-family:Arial,Helvetica,sans-serif">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid ' + line + ';border-radius:10px">' +
    '<tr><td style="padding:24px 24px 8px">' +
      '<div style="display:inline-block;background:' + (zakelijk ? '#e8eef7' : '#eef3e6') + ';color:' + (zakelijk ? '#2f4f7f' : green) + ';font-size:12px;font-weight:bold;padding:3px 10px;border-radius:999px">' + (zakelijk ? 'Zakelijk' : 'Priv\u00e9') + ' \u00b7 via ' + esc(d.partner || 'formulier') + '</div>' +
      '<h1 style="margin:12px 0 4px;font-size:20px;line-height:1.3;color:' + ink + '">Nieuwe bakfiets-leaseaanvraag</h1>' +
      '<div style="font-size:14px;color:' + muted + '">Referentie <b style="color:' + ink + '">' + esc(reference) + '</b> \u00b7 ' + esc(Utilities.formatDate(new Date(), 'Europe/Amsterdam', 'dd-MM-yyyy HH:mm')) + '</div>' +
    '</td></tr>' +
    '<tr><td style="padding:16px 24px">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + soft + ';border-radius:8px"><tr>' +
        '<td style="padding:16px">' +
          '<div style="font-size:16px;font-weight:bold;color:' + ink + '">' + esc(bike.name) + '</div>' +
          '<div style="font-size:14px;color:' + muted + ';margin-top:2px">' + esc((bike.version === 'dog' ? 'Dog \u00b7 ' : (bike.model === 'vanrixtel' ? 'Family \u00b7 ' : '')) + bike.colorName + ' \u00b7 ' + d.termMonths + ' maanden') + '</div>' +
          '<div style="font-size:14px;color:' + ink + ';margin-top:8px">Extra\u2019s: ' + esc(extras) + '</div>' +
        '</td>' +
        '<td style="padding:16px;text-align:right;vertical-align:top;white-space:nowrap">' +
          '<div style="font-size:22px;font-weight:bold;color:' + ink + '">' + esc(eur(d.monthlyInclVat)) + '</div>' +
          '<div style="font-size:12px;color:' + muted + '">per maand incl. btw</div>' +
        '</td>' +
      '</tr></table>' +
    '</td></tr>' +
    '<tr><td style="padding:8px 24px 0">' + label('Klant') +
      '<table role="presentation" cellpadding="0" cellspacing="0">' +
        kv('Naam', esc(c.initials + ' ' + c.lastName)) +
        kv('E-mail', '<a href="mailto:' + esc(c.email) + '" style="color:' + green + '">' + esc(c.email) + '</a>') +
        kv('Telefoon', '<a href="tel:' + esc(phoneHref) + '" style="color:' + green + '">' + esc(c.phone) + '</a>') +
        kv('Plaats', esc(c.city)) +
        (c.remarks ? kv('Opmerking', esc(c.remarks)) : '') +
      '</table>' +
    '</td></tr>' +
    (zakelijk && b ? '<tr><td style="padding:16px 24px 0">' + label('Bedrijf') +
      '<table role="presentation" cellpadding="0" cellspacing="0">' +
        kv('Bedrijfsnaam', esc(b.company)) +
        kv('KVK-nummer', esc(b.kvk)) +
        kv('Tekeningsbevoegd', esc(b.signatory)) +
      '</table></td></tr>' : '') +
    '<tr><td style="padding:24px">' +
      '<a href="' + esc(sheetUrl) + '" style="display:inline-block;background:' + green + ';color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 20px;border-radius:8px">Open de aanvraag in de sheet</a>' +
      '<div style="font-size:12px;color:' + muted + ';margin-top:12px">Adres, geboortedatum' + (zakelijk ? ', btw-nummer en IBAN staan' : ' staan') + ' alleen in de sheet.</div>' +
    '</td></tr>' +
    '</table></div>';
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
