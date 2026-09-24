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

const form = document.querySelector('#download-form');
const input = document.querySelector('#reel-url');
const pasteButton = document.querySelector('#paste-button');
const downloadButton = document.querySelector('#download-button');
const status = document.querySelector('#status');
const result = document.querySelector('#result');
const videoLink = document.querySelector('#video-link');
const audioLink = document.querySelector('#audio-link');
const againButton = document.querySelector('#again-button');
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
  downloadButton.querySelector('.button-label').textContent = isLoading ? 'Processing…' : 'Download Reel';
}

function recordSuccessfulDownload() {
  return runTransaction(downloadsRef, current => (Number(current) || 0) + 1);
}

function renderReviews(snapshot) {
  const reviews = snapshot.val() || {};
  const values = Object.values(reviews).filter(item => item && Number(item.rating) >= 1 && Number(item.rating) <= 5);
  const total = values.reduce((sum, item) => sum + Number(item.rating), 0);
  reviewCount.textContent = values.length.toLocaleString();
  averageRating.textContent = values.length ? `${(total / values.length).toFixed(1)} ★` : '—';
}

onValue(downloadsRef, snapshot => {
  downloadsCount.textContent = (Number(snapshot.val()) || 0).toLocaleString();
}, () => { downloadsCount.textContent = '—'; });

onValue(reviewsRef, renderReviews, () => {
  averageRating.textContent = '—';
  reviewCount.textContent = '—';
});

pasteButton.addEventListener('click', async () => {
  try {
    input.value = await navigator.clipboard.readText();
    input.focus();
    status.textContent = '';
  } catch {
    input.focus();
    status.textContent = 'Paste permission was unavailable. Please paste the link manually.';
  }
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  const url = input.value.trim();
  if (!url) {
    showError('Paste a public Instagram Reel URL to continue.');
    input.focus();
    return;
  }
  setLoading(true);
  status.textContent = '';
  result.hidden = true;
  try {
    const response = await fetch('/api/download', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({url})
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) throw new Error(data.error || 'Unable to process this Reel.');
    videoLink.href = data.video_url;
    audioLink.href = data.audio_url;
    result.hidden = false;
    recordSuccessfulDownload().catch(() => console.info('Download count could not be updated.'));
  } catch (error) {
    showError(error.message || 'The Reel could not be processed right now. Please try again.');
  } finally {
    setLoading(false);
  }
});

reviewForm.addEventListener('submit', async event => {
  event.preventDefault();
  const selected = reviewForm.querySelector('input[name="rating"]:checked');
  if (!selected) {
    reviewStatus.textContent = 'Please choose a star rating first.';
    return;
  }
  const submitButton = reviewForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  reviewStatus.textContent = 'Saving your review…';
  try {
    const reviewRef = push(reviewsRef);
    await set(reviewRef, {
      rating: Number(selected.value),
      message: reviewMessage.value.trim().slice(0, 280),
      createdAt: serverTimestamp()
    });
    reviewForm.reset();
    reviewStatus.textContent = 'Thanks for your feedback!';
  } catch (error) {
    reviewStatus.textContent = 'Reviews are temporarily unavailable. Please try again later.';
  } finally {
    submitButton.disabled = false;
  }
});

againButton.addEventListener('click', () => {
  result.hidden = true;
  input.value = '';
  status.textContent = '';
  input.focus();
});
