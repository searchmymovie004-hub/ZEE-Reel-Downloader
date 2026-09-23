const form = document.querySelector('#download-form');
const input = document.querySelector('#reel-url');
const pasteButton = document.querySelector('#paste-button');
const downloadButton = document.querySelector('#download-button');
const status = document.querySelector('#status');
const result = document.querySelector('#result');
const videoLink = document.querySelector('#video-link');
const audioLink = document.querySelector('#audio-link');
const againButton = document.querySelector('#again-button');

function showError(message) {
  status.textContent = message;
  result.hidden = true;
}

function setLoading(isLoading) {
  downloadButton.disabled = isLoading;
  downloadButton.classList.toggle('loading', isLoading);
  downloadButton.querySelector('.button-label').textContent = isLoading ? 'Processing…' : 'Download Reel';
}

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

form.addEventListener('submit', async (event) => {
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
  } catch (error) {
    showError(error.message || 'The Reel could not be processed right now. Please try again.');
  } finally {
    setLoading(false);
  }
});

againButton.addEventListener('click', () => {
  result.hidden = true;
  input.value = '';
  status.textContent = '';
  input.focus();
});
