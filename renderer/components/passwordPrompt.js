export function createPasswordPrompt(state) {
  const modal = document.getElementById('password-modal');
  const hostLabel = document.getElementById('password-host');
  const message = document.getElementById('password-message');
  const attemptLabel = document.getElementById('password-attempt');
  const input = document.getElementById('password-input');
  const remember = document.getElementById('password-remember');
  const rememberText = document.getElementById('password-remember-text');
  const submitButton = document.getElementById('password-submit');
  const cancelButton = document.getElementById('password-cancel');

  if (!modal || !input || !submitButton || !cancelButton || !state || !state.api) {
    return {
      enqueue: () => {}
    };
  }

  const queue = [];
  let activeRequest = null;

  function buildMessage(payload) {
    if (payload && payload.error) {
      return `Authentication failed. ${payload.error}`;
    }
    if (payload && payload.reason === 'sftp') {
      return 'Remote authentication required for file access.';
    }
    return 'SSH is requesting your password.';
  }

  function updateRememberAvailability(payload) {
    if (!remember) return;
    const available = Boolean(payload && payload.rememberAvailable);
    remember.disabled = !available;
    if (rememberText) {
      rememberText.textContent = available
        ? 'Remember password for this host'
        : 'Remember password for this host (unavailable)';
    }
  }

  function showPrompt(payload) {
    activeRequest = payload;
    if (hostLabel) {
      const label = payload && (payload.hostLabel || payload.hostAlias) ? (payload.hostLabel || payload.hostAlias) : 'SSH host';
      hostLabel.textContent = label;
    }
    if (message) {
      message.textContent = buildMessage(payload);
    }
    if (attemptLabel) {
      const attempt = payload && payload.attempt ? payload.attempt : 1;
      const max = payload && payload.maxAttempts ? payload.maxAttempts : 1;
      attemptLabel.textContent = max > 1 ? `Attempt ${attempt} of ${max}` : '';
    }
    updateRememberAvailability(payload);
    input.value = '';
    if (remember) {
      remember.checked = false;
    }
    modal.classList.add('open');
    input.focus();
  }

  function hidePrompt() {
    modal.classList.remove('open');
    activeRequest = null;
  }

  function showNext() {
    if (activeRequest || !queue.length) return;
    showPrompt(queue.shift());
  }

  function submit() {
    if (!activeRequest) return;
    if (!state.api || typeof state.api.respondPassword !== 'function') {
      hidePrompt();
      showNext();
      return;
    }
    const payload = {
      requestId: activeRequest.requestId,
      tabId: activeRequest.tabId,
      action: 'submit',
      password: input.value || '',
      remember: remember ? Boolean(remember.checked) : false
    };
    state.api.respondPassword(payload);
    hidePrompt();
    showNext();
  }

  function cancel() {
    if (!activeRequest) return;
    if (state.api && typeof state.api.respondPassword === 'function') {
      state.api.respondPassword({
        requestId: activeRequest.requestId,
        tabId: activeRequest.tabId,
        action: 'cancel'
      });
    }
    hidePrompt();
    showNext();
  }

  submitButton.addEventListener('click', () => submit());
  cancelButton.addEventListener('click', () => cancel());
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    }
  });
  window.addEventListener('keydown', (event) => {
    if (!activeRequest) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    }
  });

  if (typeof state.api.onSshPasswordRequest === 'function') {
    state.api.onSshPasswordRequest((payload) => {
      queue.push(payload);
      showNext();
    });
  }

  return {
    enqueue: (payload) => {
      queue.push(payload);
      showNext();
    }
  };
}
