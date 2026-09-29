import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-analytics.js';
import { getDatabase, onValue, push, ref, runTransaction, serverTimestamp, set } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js';

const firebaseConfig = {
  apiKey: 'AIzaSyBUV5Zg9OuWOZdhVFpSHPbygJ052k5oqMw',
  authDomain: 'baby-galley.firebaseapp.com',
  databaseURL: 'https://baby-galley-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'baby-galley',
  storageBucket: 'baby-galley.firebasestorage.app',
  messagingSenderId: '231049916521',
  appId: '1:231049916521:web:446142d7af30782b3432f8',
  measurementId: 'G-W28MY1HGS9'
};

const app = initializeApp(firebaseConfig);
try { getAnalytics(app); } catch (error) { console.info('Analytics is unavailable in this browser.'); }
const db = getDatabase(app);
const downloadsRef = ref(db, 'zee-reel-downloader/stats/downloads');
const reviewsRef = ref(db, 'zee-reel-downloader/reviews');
const HISTORY_KEY = 'zee-reel-download-history-v1';

const form = document.querySelector('#download-form');
const input = document.querySelector('#reel-url');
const pasteButton = document.querySelector('#paste-button');
const downloadButton = document.querySelector('#download-button');
const previewButton = document.querySelector('#preview-button');
const previewCard = document.querySelector('#preview-card');
const previewImage = document.querySelector('#preview-image');
const previewTitle = document.querySelector('#preview-title');
const previewCreator = document.querySelector('#preview-creator');
const previewMeta = document.querySelector('#preview-meta');
const videoQuality = document.querySelector('#video-quality');
const audioQuality = document.querySelector('#audio-quality');
const status = document.querySelector('#status');
const wakeStatus = document.querySelector('#wake-status');
const result = document.querySelector('#result');
const videoLink = document.querySelector('#video-link');
const audioLink = document.querySelector('#audio-link');
const againButton = document.querySelector('#again-button');
const copyLinkButton = document.querySelector('#copy-link-button');
const shareResultButton = document.querySelector('#share-result-button');
const historySection = document.querySelector('#history');
const historyList = document.querySelector('#history-list');
const clearHistoryButton = document.querySelector('#clear-history');
const downloadsCount = document.querySelector('#downloads-count');
const averageRating = document.querySelector('#average-rating');
const reviewCount = document.querySelector('#review-count');
const reviewForm = document.querySelector('#review-form');
const reviewMessage = document.querySelector('#review-message');
const reviewStatus = document.querySelector('#review-status');
const queueButton = document.querySelector('#queue-button');
const queuePanel = document.querySelector('#queue-panel');
const queueList = document.querySelector('#queue-list');
const queueCount = document.querySelector('#queue-count');
const processQueue = document.querySelector('#process-queue');
const dropZone = document.querySelector('#drop-zone');
const themeButton = document.querySelector('#theme-button');
const installBanner = document.querySelector('#install-banner');
const installButton = document.querySelector('#install-button');
const dismissInstall = document.querySelector('#dismiss-install');
const resultModal = document.querySelector('#result-modal');
const closeModal = document.querySelector('#close-modal');
const modalVideoLink = document.querySelector('#modal-video-link');
const modalAudioLink = document.querySelector('#modal-audio-link');
let deferredInstallPrompt;
const downloadQueue = [];

function showError(message) {
  status.textContent = message;
  result.hidden = true;
}

function renderQueue() {
  queueList.textContent = '';
  downloadQueue.forEach((url, index) => { const item = document.createElement('li'); item.textContent = url; const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.onclick = () => { downloadQueue.splice(index, 1); renderQueue(); }; item.appendChild(remove); queueList.appendChild(item); });
  queueCount.textContent = `${downloadQueue.length} link${downloadQueue.length === 1 ? '' : 's'}`;
  queuePanel.hidden = downloadQueue.length === 0;
}

function setLoading(isLoading) {
  downloadButton.disabled = isLoading;
  downloadButton.classList.toggle('loading', isLoading);
  downloadButton.querySelector('.button-label').textContent = isLoading ? 'Processing…' : 'Download media';
}

function setWakeMessage(message = '') {
  wakeStatus.textContent = message;
  wakeStatus.hidden = !message;
}

function recordSuccessfulDownload() {
  return runTransaction(downloadsRef, current => (Number(current) || 0) + 1);
}

function getHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}

function saveHistory(url, videoUrl, audioUrl) {
  const history = getHistory().filter(item => item.url !== url);
  history.unshift({url, videoUrl, audioUrl, createdAt: Date.now()});
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 8)));
  renderHistory();
}

function renderHistory() {
  const history = getHistory();
  historySection.hidden = history.length === 0;
  historyList.textContent = '';
  history.forEach(item => {
    const row = document.createElement('div');
    row.className = 'history-row';
    const text = document.createElement('span');
    text.textContent = item.url;
    const use = document.createElement('button');
    use.type = 'button';
    use.textContent = 'Use again';
    use.addEventListener('click', () => { input.value = item.url; input.focus(); document.querySelector('#downloader').scrollIntoView({behavior: 'smooth'}); });
    row.append(text, use);
    historyList.appendChild(row);
  });
}

function renderReviews(snapshot) {
  const reviews = snapshot.val() || {};
  const values = Object.values(reviews).filter(item => item && Number(item.rating) >= 1 && Number(item.rating) <= 5);
  const total = values.reduce((sum, item) => sum + Number(item.rating), 0);
  reviewCount.textContent = values.length.toLocaleString();
  averageRating.textContent = values.length ? `${(total / values.length).toFixed(1)} ★` : '—';
}

onValue(downloadsRef, snapshot => { downloadsCount.textContent = (Number(snapshot.val()) || 0).toLocaleString(); }, () => { downloadsCount.textContent = '—'; });
onValue(reviewsRef, renderReviews, () => { averageRating.textContent = '—'; reviewCount.textContent = '—'; });
renderHistory();

pasteButton.addEventListener('click', async () => {
  try { input.value = await navigator.clipboard.readText(); input.focus(); status.textContent = ''; }
  catch { input.focus(); status.textContent = 'Paste permission was unavailable. Please paste the link manually.'; }
});

previewButton.addEventListener('click', async () => {
  const url = input.value.trim();
  if (!url) { showError('Paste a public Instagram link before previewing.'); input.focus(); return; }
  previewButton.disabled = true;
  previewButton.textContent = 'Loading preview…';
  try {
    const response = await fetch('/api/preview', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({url})});
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) throw new Error(data.error || 'Preview unavailable.');
    previewTitle.textContent = data.title || 'Public Instagram media';
    previewCreator.textContent = data.creator || 'Instagram';
    const details = [data.duration ? `${Math.round(data.duration)}s` : '', data.width && data.height ? `${data.width}×${data.height}` : '', data.filesize ? `${(data.filesize / 1048576).toFixed(1)} MB` : ''].filter(Boolean);
    previewMeta.textContent = details.join(' · ');
    if (data.thumbnail) { previewImage.src = data.thumbnail; previewImage.hidden = false; } else previewImage.hidden = true;
    previewCard.hidden = false;
    status.textContent = data.preview_available === false ? 'Thumbnail details are unavailable, but this public link can still be downloaded.' : '';
  } catch (error) {
    previewTitle.textContent = 'Public Instagram media';
    previewCreator.textContent = 'Ready to try downloading';
    previewMeta.textContent = 'Metadata unavailable';
    previewImage.hidden = true;
    previewCard.hidden = false;
    status.textContent = error.message || 'Preview details unavailable. You can still download this link.';
  } finally {
    previewButton.disabled = false;
    previewButton.innerHTML = 'Preview link <span>✦</span>';
  }
});

async function requestDownload(url, payload) {
  let response;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { response = await fetch('/api/download', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)}); }
    catch (error) { response = null; }
    if (response && response.ok) return response;
    if (attempt < 2) { setWakeMessage(`Temporary issue. Retrying in ${attempt + 2}s…`); await new Promise(resolve => setTimeout(resolve, (attempt + 2) * 1000)); }
  }
  return response || new Response(JSON.stringify({error: 'The server is unavailable. Please try again.'}), {status: 503});
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const url = input.value.trim();
  if (!url) { showError('Paste a public Instagram link to continue.'); input.focus(); return; }
  setLoading(true); status.textContent = ''; result.hidden = true; setWakeMessage('');
  const wakeTimer = setTimeout(() => setWakeMessage('Free server wake-up can take a few seconds…'), 4000);
  try {
    const response = await requestDownload(url, {url, video_quality: videoQuality.value, audio_quality: audioQuality.value});
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) throw new Error(data.error || 'Unable to process this media.');
    videoLink.href = data.video_url; audioLink.href = data.audio_url; result.hidden = false; modalVideoLink.href = data.video_url; modalAudioLink.href = data.audio_url; resultModal.hidden = false;
    saveHistory(url, data.video_url, data.audio_url);
    recordSuccessfulDownload().catch(() => console.info('Download count could not be updated.'));
  } catch (error) { showError(error.message || 'The media could not be processed right now. Please try again.'); }
  finally { clearTimeout(wakeTimer); setWakeMessage(''); setLoading(false); }
});

copyLinkButton.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(window.location.origin); copyLinkButton.textContent = 'Copied!'; setTimeout(() => { copyLinkButton.textContent = 'Copy site link'; }, 1600); }
  catch { copyLinkButton.textContent = 'Copy unavailable'; }
});

clearHistoryButton.addEventListener('click', () => { localStorage.removeItem(HISTORY_KEY); renderHistory(); });

reviewForm.addEventListener('submit', async event => {
  event.preventDefault();
  const selected = reviewForm.querySelector('input[name="rating"]:checked');
  if (!selected) { reviewStatus.textContent = 'Please choose a star rating first.'; return; }
  const submitButton = reviewForm.querySelector('button[type="submit"]'); submitButton.disabled = true; reviewStatus.textContent = 'Saving your review…';
  try {
    const reviewRef = push(reviewsRef);
    await set(reviewRef, {rating: Number(selected.value), message: reviewMessage.value.trim().slice(0, 280), createdAt: serverTimestamp()});
    reviewForm.reset(); reviewStatus.textContent = 'Thanks for your feedback!';
  } catch { reviewStatus.textContent = 'Reviews are temporarily unavailable. Please try again later.'; }
  finally { submitButton.disabled = false; }
});

againButton.addEventListener('click', () => { result.hidden = true; resultModal.hidden = true; input.value = ''; status.textContent = ''; input.focus(); });
shareResultButton.addEventListener('click', async () => { const share = {title: 'NEXORA DOWNLOADER', text: 'Download public Instagram media with NEXORA', url: window.location.href}; try { if (navigator.share) await navigator.share(share); else { await navigator.clipboard.writeText(window.location.href); shareResultButton.textContent = 'Link copied!'; setTimeout(() => shareResultButton.textContent = 'Share result', 1600); } } catch { shareResultButton.textContent = 'Share cancelled'; } });
const languageButton = document.querySelector('#language-button');
const translations = { en: {pasteTitle: 'Paste your Instagram link', pasteSub: 'We’ll fetch publicly available media for you.'}, ml: {pasteTitle: 'നിങ്ങളുടെ Instagram ലിങ്ക് പേസ്റ്റ് ചെയ്യുക', pasteSub: 'പബ്ലിക് മീഡിയ ഞങ്ങൾ കണ്ടെത്തും.'}, hi: {pasteTitle: 'अपना Instagram लिंक पेस्ट करें', pasteSub: 'हम सार्वजनिक मीडिया प्राप्त करेंगे।'} };
let language = localStorage.getItem('nexora-language') || 'en';
function applyLanguage(next) { language = next; localStorage.setItem('nexora-language', next); document.querySelectorAll('[data-i18n]').forEach(node => { const key = node.dataset.i18n; if (translations[next][key]) node.textContent = translations[next][key]; }); languageButton.textContent = next === 'en' ? 'മലയാളം / हिन्दी' : 'English / हिन्दी'; }
languageButton.addEventListener('click', () => applyLanguage(language === 'en' ? 'ml' : language === 'ml' ? 'hi' : 'en')); applyLanguage(language);



queueButton.addEventListener('click', () => { const url = input.value.trim(); if (!url) { showError('Paste a link before adding it to the queue.'); return; } if (!downloadQueue.includes(url)) downloadQueue.push(url); input.value = ''; renderQueue(); });
processQueue.addEventListener('click', async () => { const items = [...downloadQueue]; downloadQueue.length = 0; renderQueue(); for (const url of items) { input.value = url; form.dispatchEvent(new Event('submit', {cancelable:true})); await new Promise(resolve => { const timer = setInterval(() => { if (!downloadButton.disabled) { clearInterval(timer); resolve(); } }, 300); }); } });
dropZone.addEventListener('dragover', event => { event.preventDefault(); dropZone.classList.add('drag-active'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-active'));
dropZone.addEventListener('drop', event => { event.preventDefault(); dropZone.classList.remove('drag-active'); const text = event.dataTransfer.getData('text/plain'); if (text) { input.value = text.trim(); previewButton.focus(); } });
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferredInstallPrompt = event; installBanner.hidden = false; });
installButton.addEventListener('click', async () => { if (!deferredInstallPrompt) return; deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; installBanner.hidden = true; });
dismissInstall.addEventListener('click', () => { installBanner.hidden = true; localStorage.setItem('nexora-install-dismissed', '1'); });
closeModal.addEventListener('click', () => { resultModal.hidden = true; });
resultModal.addEventListener('click', event => { if (event.target === resultModal) resultModal.hidden = true; });
function applyTheme(theme) { document.body.classList.toggle('light-theme', theme === 'light'); localStorage.setItem('nexora-theme', theme); themeButton.textContent = theme === 'light' ? '☀' : '◐'; }
themeButton.addEventListener('click', () => applyTheme(document.body.classList.contains('light-theme') ? 'dark' : 'light'));
applyTheme(localStorage.getItem('nexora-theme') || 'dark');
if (localStorage.getItem('nexora-install-dismissed') === '1') installBanner.hidden = true;
