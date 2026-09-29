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
const videoQuality = document.querySelector('#video-quality');
const audioQuality = document.querySelector('#audio-quality');
const status = document.querySelector('#status');
const wakeStatus = document.querySelector('#wake-status');
const result = document.querySelector('#result');
const videoLink = document.querySelector('#video-link');
const audioLink = document.querySelector('#audio-link');
const againButton = document.querySelector('#again-button');
const copyLinkButton = document.querySelector('#copy-link-button');
const historySection = document.querySelector('#history');
const historyList = document.querySelector('#history-list');
const clearHistoryButton = document.querySelector('#clear-history');
const downloadsCount = document.querySelector('#downloads-count');
const averageRating = document.querySelector('#average-rating');
const reviewCount = document.querySelector('#review-count');
const reviewForm = document.querySelector('#review-form');
const reviewMessage = document.querySelector('#review-message');
const reviewStatus = document.querySelector('#review-status');

function showError(message) {
  status.textContent = message;
  result.hidden = true;
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

async function requestDownload(url, payload) {
  let response;
  try {
    response = await fetch('/api/download', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
  } catch (error) {
    setWakeMessage('The server is waking up. Retrying once…');
    await new Promise(resolve => setTimeout(resolve, 1600));
    response = await fetch('/api/download', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
  }
  return response;
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
    videoLink.href = data.video_url; audioLink.href = data.audio_url; result.hidden = false;
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

againButton.addEventListener('click', () => { result.hidden = true; input.value = ''; status.textContent = ''; input.focus(); });
