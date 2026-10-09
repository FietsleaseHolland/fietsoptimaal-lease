/*!
 * Embed voor het bakfiets-leaseformulier van Fietslease Holland.
 * Maakt van een gewoon iframe een iframe dat meegroeit met de inhoud (geen dubbele scrollbalk) en
 * laat scrollen binnen het formulier (naar een stap, foutmelding of bedankscherm) de pagina eromheen meescrollen.
 * Zonder dit script werkt het iframe ook: dan heeft het een vaste hoogte en scrollt het zelf.
 *
 * Gebruik:
 *   <iframe data-fietslease-bakfiets src="https://…/" title="Bakfiets lease aanvragen"
 *     style="display:block;width:100%;height:85vh;min-height:640px;border:0"></iframe>
 *   <script src="https://…/embed.js" async></script>
 * Optioneel: data-offset="90" op het iframe als de site een vaste (sticky) menubalk heeft van 90 px.
 */
(function () {
  function init(frame) {
    if (frame.__flhLease) return;
    frame.__flhLease = true;
    var origin = new URL(frame.src, location.href).origin;
    var offset = parseInt(frame.getAttribute('data-offset') || '16', 10);

    function hello() {
      try { frame.contentWindow.postMessage({ type: 'lease-form:hello' }, origin); } catch (e) {}
    }

    window.addEventListener('message', function (e) {
      if (e.source !== frame.contentWindow || e.origin !== origin || !e.data) return;
      if (e.data.type === 'lease-form:height' && e.data.height > 0) {
        frame.style.height = e.data.height + 'px';
        frame.style.minHeight = '0';
        frame.setAttribute('scrolling', 'no');
        frame.contentWindow.postMessage({ type: 'lease-form:ack' }, origin);
      } else if (e.data.type === 'lease-form:scroll') {
        var y = frame.getBoundingClientRect().top + window.pageYOffset + (e.data.top || 0) - offset;
        var smooth = !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
        window.scrollTo({ top: Math.max(0, y), behavior: smooth ? 'smooth' : 'auto' });
      }
    });
    frame.addEventListener('load', hello);
    hello();
  }

  function scan() {
    var frames = document.querySelectorAll('iframe[data-fietslease-bakfiets]');
    for (var i = 0; i < frames.length; i++) init(frames[i]);
  }
  scan();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan);
})();
