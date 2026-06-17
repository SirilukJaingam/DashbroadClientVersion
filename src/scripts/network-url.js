// LAN share URL badge (reads meta injected by Vite plugin)
(function detectNetworkUrl() {
    const badge = document.getElementById('networkBadge');
    const label = document.getElementById('networkUrlLabel');
    if (!badge || !label) return;
    const meta = document.querySelector('meta[name="network-lan-ip"]');
    const lanIP = meta ? meta.getAttribute('content') : null;
    const port = window.location.port || '4173';
    const url = lanIP ? `http://${lanIP}:${port}/` : `http://${window.location.hostname}:${port}/`;
    label.textContent = url;
    badge.title = 'Click to copy — share this link with colleagues on your network';
})();

window.copyNetworkUrl = function copyNetworkUrl() {
    const badge = document.getElementById('networkBadge');
    const label = document.getElementById('networkUrlLabel');
    const url = label.textContent;
    if (!url || url === '…') return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => flashCopied(badge)).catch(() => fallbackCopy(url, badge));
    } else {
        fallbackCopy(url, badge);
    }
};

function fallbackCopy(text, badge) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
        document.execCommand('copy');
        flashCopied(badge);
    } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
}

function flashCopied(badge) {
    badge.classList.add('copied');
    const span = badge.querySelector('span');
    const saved = span.textContent;
    span.textContent = 'Copied!';
    setTimeout(() => {
        span.textContent = saved;
        badge.classList.remove('copied');
    }, 1800);
}
