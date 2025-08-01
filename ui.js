export const elements = {
  connectBtn: document.getElementById('connectBtn'),
  channelInput: document.getElementById('channel'),
  moderatorInput: document.getElementById('moderator'),
  statusEl: document.getElementById('status'),
  statusLight: document.getElementById('status-light'),
  mainChat: document.getElementById('main-chat'),
  spamChat: document.getElementById('spam-chat'),
  settingsBtn: document.getElementById('settings-btn'),
  settingsModal: document.getElementById('settings-modal'),
  closeSettingsBtn: document.getElementById('close-settings-btn'),
  rulesContainer: document.getElementById('rules-container'),
  toggleSpamBtn: document.getElementById('toggle-spam-btn'),
  spamVisibleIcon: document.getElementById('spam-visible-icon'),
  spamHiddenIcon: document.getElementById('spam-hidden-icon'),
  chatGrid: document.getElementById('chat-grid'),
  mainChatContainer: document.getElementById('main-chat-container'),
  spamChatContainer: document.getElementById('spam-chat-container'),
  mainChatPercentageEl: document.getElementById('main-chat-percentage'),
  spamChatPercentageEl: document.getElementById('spam-chat-percentage'),
  globalTooltip: document.getElementById('global-tooltip'),
  copyNotification: document.getElementById('copy-notification'),
  settings: { rules: {}, isSpamVisible: true },

  updateConnectionStatus(state, message) {
    // Implementation in main.js
  },

  createChatLine(badges, username, message, color, tags, spamResult) {
    const line = document.createElement('div');
    line.className = 'chat-line';
    const userSpan = document.createElement('span');
    userSpan.style.color = color;
    userSpan.style.fontWeight = 'bold';
    userSpan.innerHTML = `${badges}${username}: `;
    const messageSpan = document.createElement('span');
    if (spamResult && spamResult.reason) {
      const labelSpan = document.createElement('span');
      labelSpan.className = 'spam-label';
      labelSpan.textContent = spamResult.reason;
      messageSpan.appendChild(labelSpan);
    }

    const contentFragment = buildMessageContent(message, tags, spamResult, this.settings);
    messageSpan.appendChild(contentFragment);

    line.appendChild(userSpan);
    line.appendChild(messageSpan);
    return line;
  },

  scrollToBottom(element) {
    const isScrolledToBottom = element.scrollHeight - element.clientHeight <= element.scrollTop + 150;
    if (isScrolledToBottom) {
      element.scrollTop = element.scrollHeight;
    }
  },

  saveSettings() {
    localStorage.setItem('twitchFilterSettings', JSON.stringify(this.settings));
  },

  loadSettings(spamRuleDefinitions) {
    const savedSettings = localStorage.getItem('twitchFilterSettings');
    if (savedSettings) {
      const loaded = JSON.parse(savedSettings);
      this.settings = {
        rules: loaded.rules || {},
        isSpamVisible: loaded.isSpamVisible !== false
      };
    } else {
      this.settings = { rules: {}, isSpamVisible: true };
    }
    this.channelInput.value = localStorage.getItem('twitchChannel') || '';
    this.moderatorInput.value = localStorage.getItem('twitchModerator') || '';
  },

  renderSettingsToggles(spamRuleDefinitions) {
    this.rulesContainer.innerHTML = '';
    for (const key in spamRuleDefinitions) {
      const rule = spamRuleDefinitions[key];
      const isChecked = this.settings.rules[key] !== false;

      const label = document.createElement('label');
      label.className = 'flex items-center justify-between cursor-pointer';
      label.innerHTML = `
                <span class="text-gray-300">${rule.label}</span>
                <div class="relative">
                    <input type="checkbox" id="toggle-${key}" class="sr-only toggle-checkbox" ${isChecked ? 'checked' : ''}>
                    <div class="block bg-gray-600 w-14 h-8 rounded-full toggle-label"></div>
                    <div class="dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition transform ${isChecked ? 'translate-x-6' : ''}"></div>
                </div>
            `;
      const checkbox = label.querySelector('input');
      const dot = label.querySelector('.dot');
      checkbox.addEventListener('change', () => {
        this.settings.rules[key] = checkbox.checked;
        dot.classList.toggle('translate-x-6', checkbox.checked);
        this.saveSettings();
      });
      this.rulesContainer.appendChild(label);
    }
  },

  applySpamVisibility() {
    this.spamChatContainer.classList.toggle('hidden', !this.settings.isSpamVisible);
    this.mainChatContainer.classList.toggle('md:col-span-2', !this.settings.isSpamVisible);
    this.spamVisibleIcon.classList.toggle('hidden', !this.settings.isSpamVisible);
    this.spamHiddenIcon.classList.toggle('hidden', this.settings.isSpamVisible);
  },

  updatePercentageDisplay(mainCount, spamCount) {
    const totalMessages = mainCount + spamCount;
    if (totalMessages === 0) {
      this.mainChatPercentageEl.textContent = '';
      this.spamChatPercentageEl.textContent = '';
      return;
    }
    const mainPercentage = (mainCount / totalMessages) * 100;
    const spamPercentage = (spamCount / totalMessages) * 100;
    this.mainChatPercentageEl.textContent = `${mainPercentage.toFixed(1)}%`;
    this.spamChatPercentageEl.textContent = `${spamPercentage.toFixed(1)}%`;
  }
};

function buildMessageContent(message, tags, spamResult, settings) {
  const fragment = document.createDocumentFragment();
  const emotes = tags?.emotes;

  if (emotes && typeof emotes === 'string' && emotes.length > 0) {
    // Parse emotes and create a sorted list
    const emoteList = [];
    emotes.split('/').forEach(emoteData => {
      const [id, positions] = emoteData.split(':');
      positions.split(',').forEach(pos => {
        const [start, end] = pos.split('-').map(Number);
        emoteList.push({ id, start, end });
      });
    });
    emoteList.sort((a, b) => a.start - b.start);

    let lastIndex = 0;
    emoteList.forEach(emote => {

      if (emote.start > lastIndex) {
        fragment.appendChild(document.createTextNode(message.substring(lastIndex, emote.start)));
      }
      // Add the emote image
      const img = document.createElement('img');
      img.src = `https://static-cdn.jtvnw.net/emoticons/v2/${emote.id}/default/dark/1.0`;
      img.className = 'emote';
      fragment.appendChild(img);
      lastIndex = emote.end + 1;
    });

    // Add any remaining text after the last emote
    if (lastIndex < message.length) {
      fragment.appendChild(document.createTextNode(message.substring(lastIndex)));
    }
  } else {
    fragment.appendChild(document.createTextNode(message));
  }

  // Apply word highlighting to text nodes
  if (settings.rules.notInTime && spamResult && spamResult.reason === 'Зрада?' && spamResult.words) {
    const highlightMap = spamResult.words.reduce((acc, word) => {
      acc[word.ru.toLowerCase()] = word.ua;
      return acc;
    }, {});

    const regex = new RegExp(`(${Object.keys(highlightMap).join('|')})`, 'gi');

    fragment.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent;
        const parts = text.split(regex);
        if (parts.length > 1) {
          const newFragment = document.createDocumentFragment();
          parts.forEach(part => {
            const lowerPart = part.toLowerCase();
            if (highlightMap[lowerPart]) {
              const span = document.createElement('span');
              span.className = 'highlighted-word';
              span.setAttribute('data-tooltip', highlightMap[lowerPart]);
              span.textContent = part;
              newFragment.appendChild(span);
            } else {
              newFragment.appendChild(document.createTextNode(part));
            }
          });
          node.parentNode.replaceChild(newFragment, node);
        }
      }
    });
  }

  return fragment;
}


export function setupEventListeners(connectCallback) {
  elements.connectBtn.addEventListener('click', connectCallback);
  elements.channelInput.addEventListener('keyup', (e) => e.key === 'Enter' && connectCallback());
  elements.moderatorInput.addEventListener('keyup', (e) => e.key === 'Enter' && connectCallback());

  elements.channelInput.addEventListener('blur', () => localStorage.setItem('twitchChannel', elements.channelInput.value));
  elements.moderatorInput.addEventListener('blur', () => localStorage.setItem('twitchModerator', elements.moderatorInput.value));

  elements.settingsBtn.addEventListener('click', () => elements.settingsModal.classList.remove('hidden'));
  elements.closeSettingsBtn.addEventListener('click', () => elements.settingsModal.classList.add('hidden'));
  elements.settingsModal.addEventListener('click', (e) => {
    if (e.target === elements.settingsModal) elements.settingsModal.classList.add('hidden');
  });

  elements.toggleSpamBtn.addEventListener('click', () => {
    elements.settings.isSpamVisible = !elements.settings.isSpamVisible;
    elements.saveSettings();
    elements.applySpamVisibility();
  });

  // Tooltip and copy logic
  elements.mainChat.addEventListener('mouseover', (e) => {
    if (e.target.classList.contains('highlighted-word')) {
      showTooltip(e);
    }
  });
  elements.mainChat.addEventListener('mouseout', (e) => {
    if (e.target.classList.contains('highlighted-word')) {
      hideTooltip();
    }
  });
  elements.mainChat.addEventListener('click', (e) => {
    if (e.target.classList.contains('highlighted-word')) {
      const wordElement = e.target;
      const ukrainianWord = wordElement.getAttribute('data-tooltip');
      const textToCopy = `А може "${ukrainianWord}", чи не на часі?`;

      const textArea = document.createElement("textarea");
      textArea.value = textToCopy;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);

      showCopyNotification();

      const originalCursor = wordElement.style.cursor;
      wordElement.style.cursor = 'copy';
      setTimeout(() => {
        wordElement.style.cursor = originalCursor || 'pointer';
      }, 800);
    }
  });
}

function showTooltip(event) {
  const tooltipText = "🇺🇦 " + event.target.getAttribute('data-tooltip');
  if (!tooltipText) return;

  elements.globalTooltip.textContent = tooltipText;
  const rect = event.target.getBoundingClientRect();

  elements.globalTooltip.style.left = `${rect.left + (rect.width / 2)}px`;
  elements.globalTooltip.style.top = `${rect.top}px`;
  elements.globalTooltip.style.transform = 'translateX(-50%) translateY(-100%) translateY(-8px)';

  elements.globalTooltip.classList.remove('hidden');
  elements.globalTooltip.style.opacity = '1';
}

function hideTooltip() {
  elements.globalTooltip.style.opacity = '0';
  setTimeout(() => {
    elements.globalTooltip.classList.add('hidden');
  }, 0);
}

function showCopyNotification() {
  elements.copyNotification.classList.remove('opacity-0', 'translate-y-2');
  setTimeout(() => {
    elements.copyNotification.classList.add('opacity-0', 'translate-y-2');
  }, 800);
}
