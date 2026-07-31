/**
 * Podcast Analytics Dashboard
 * Fetches analytics.json and renders Chart.js visualizations.
 */

// Country flag emoji lookup
const countryFlags = {
  FR: '🇫🇷', BE: '🇧🇪', CH: '🇨🇭', CA: '🇨🇦', MA: '🇲🇦', 
  TN: '🇹🇳', DZ: '🇩🇿', LU: '🇱🇺', SN: '🇸🇳', CI: '🇨🇮',
  DE: '🇩🇪', US: '🇺🇸', GB: '🇬🇧', NL: '🇳🇱', ES: '🇪🇸',
  IT: '🇮🇹', PT: '🇵🇹', JP: '🇯🇵', XX: '🌍'
};

const AWS_ORANGE = '#FF9900';
const AWS_DARK = '#232F3E';

function getChartColors() {
  const isDark = document.documentElement.getAttribute('data-bs-theme') === 'dark';
  return {
    primary: AWS_ORANGE,
    secondary: isDark ? '#ff990066' : '#ff990033',
    text: isDark ? '#e0e0e0' : '#333333',
    grid: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
    line: isDark ? '#66b2ff' : '#0066cc',
  };
}

function formatNumber(n) {
  return new Intl.NumberFormat('fr-FR').format(n);
}

async function loadAnalytics() {
  try {
    // Try relative URL first (works in production where page and data share same origin)
    // Falls back to absolute URL for local development
    let url = '../data/analytics.json';
    
    // If on localhost, fetch from production CloudFront
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      url = 'https://podcast.stormacq.net/awsfr/data/analytics.json';
    }

    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (err) {
    console.error('Failed to load analytics:', err);
    document.getElementById('kpi-downloads').textContent = 'Erreur';
    document.getElementById('kpi-listeners').textContent = 'de chargement';
    document.getElementById('kpi-episodes').textContent = '—';
    return null;
  }
}

function renderKPIs(data) {
  document.getElementById('kpi-downloads').textContent = formatNumber(data.summary.totalDownloads30d);
  document.getElementById('kpi-listeners').textContent = formatNumber(data.summary.uniqueListeners30d);
  document.getElementById('kpi-episodes').textContent = formatNumber(data.summary.totalEpisodes);
  
  const genAt = document.getElementById('generated-at');
  if (genAt && data.generatedAt) {
    const d = new Date(data.generatedAt);
    genAt.textContent = `Dernière mise à jour : ${d.toLocaleDateString('fr-FR')} à ${d.toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'})}`;
  }
}

function renderMonthlyDownloads(data) {
  const colors = getChartColors();
  const ctx = document.getElementById('chart-monthly-downloads');
  if (!ctx) return;

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.monthlyDownloads.map(d => d.month),
      datasets: [{
        label: 'Downloads',
        data: data.monthlyDownloads.map(d => d.count),
        backgroundColor: colors.secondary,
        borderColor: colors.primary,
        borderWidth: 1,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: colors.text }, grid: { color: colors.grid } },
        y: { ticks: { color: colors.text }, grid: { color: colors.grid }, beginAtZero: true }
      }
    }
  });
}

function renderMonthlyListeners(data) {
  const colors = getChartColors();
  const ctx = document.getElementById('chart-monthly-listeners');
  if (!ctx) return;

  new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.monthlyListeners.map(d => d.month),
      datasets: [{
        label: 'Auditeurs uniques',
        data: data.monthlyListeners.map(d => d.count),
        borderColor: colors.line,
        backgroundColor: colors.line + '33',
        fill: true,
        tension: 0.3,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: colors.text }, grid: { color: colors.grid } },
        y: { ticks: { color: colors.text }, grid: { color: colors.grid }, beginAtZero: true }
      }
    }
  });
}

function renderTopEpisodes(data) {
  const colors = getChartColors();
  const ctx = document.getElementById('chart-top-episodes');
  if (!ctx) return;

  const episodes = data.episodeDownloads.slice(0, 25);
  
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: episodes.map(e => `Ep ${e.episode}${e.title ? ' - ' + e.title.substring(0, 30) : ''}`),
      datasets: [{
        label: 'Downloads',
        data: episodes.map(e => e.totalDownloads),
        backgroundColor: colors.primary,
        borderColor: colors.primary,
        borderWidth: 1,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: colors.text }, grid: { color: colors.grid }, beginAtZero: true },
        y: { ticks: { color: colors.text, font: { size: 11 } }, grid: { display: false } }
      }
    }
  });
}

function renderCountries(data) {
  const tbody = document.querySelector('#table-countries tbody');
  if (!tbody || !data.topCountries) return;

  const total = data.topCountries.reduce((s, c) => s + c.count, 0);
  
  tbody.innerHTML = data.topCountries.slice(0, 10).map(c => {
    const flag = countryFlags[c.countryCode] || '🌍';
    const pct = ((c.count / total) * 100).toFixed(1);
    return `<tr><td>${flag} ${c.countryCode}</td><td>${formatNumber(c.count)}</td><td>${pct}%</td></tr>`;
  }).join('');
}

function renderOP3Comparison(data) {
  const tbody = document.querySelector('#table-op3-comparison tbody');
  if (!tbody) return;

  if (!data.op3Comparison) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-muted">Données OP3 non disponibles</td></tr>';
    return;
  }

  const op3 = data.op3Comparison;
  const rows = [];

  // Downloads 30d comparison
  const cfDl = data.summary.totalDownloads30d;
  const op3Dl = op3.monthlyDownloads30d;
  rows.push(makeComparisonRow('Downloads (30j)', cfDl, op3Dl));

  // Weekly avg
  if (op3.weeklyAvgDownloads) {
    const cfWeekly = Math.round(cfDl / 4.3);
    rows.push(makeComparisonRow('Moy. hebdo', cfWeekly, op3.weeklyAvgDownloads));
  }

  // Per-episode comparisons (top 5)
  if (op3.episodeDownloads && data.episodeDownloads) {
    op3.episodeDownloads.slice(0, 5).forEach(opEp => {
      const cfEp = data.episodeDownloads.find(e => e.episode === opEp.episode);
      if (cfEp) {
        rows.push(makeComparisonRow(`Ep ${opEp.episode} (total)`, cfEp.totalDownloads, opEp.op3DownloadsAll));
      }
    });
  }

  tbody.innerHTML = rows.join('');
}

function makeComparisonRow(label, cfValue, op3Value) {
  if (!cfValue || !op3Value) return '';
  const diff = ((cfValue - op3Value) / op3Value * 100);
  const sign = diff >= 0 ? '+' : '';
  const icon = Math.abs(diff) < 10 ? '✅' : '⚠️';
  return `<tr><td>${label}</td><td>${formatNumber(cfValue)}</td><td>${formatNumber(op3Value)}</td><td>${icon} ${sign}${diff.toFixed(1)}%</td></tr>`;
}

// Init
document.addEventListener('DOMContentLoaded', async () => {
  const data = await loadAnalytics();
  if (!data) return;

  renderKPIs(data);
  renderMonthlyDownloads(data);
  renderMonthlyListeners(data);
  renderTopEpisodes(data);
  renderCountries(data);
  renderOP3Comparison(data);
});
