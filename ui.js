import { get7TVEmoteUrl } from './emotes.js';

export const elements = {
  body: document.body,
  connectBtn: document.getElementById('connectBtn'),
  connectIcon: document.getElementById('connect-icon'),
  disconnectIcon: document.getElementById('disconnect-icon'),
  connectingIcon: document.getElementById('connecting-icon'),
  channelInput: document.getElementById('channel'),
  currentUserInput: document.getElementById('currentUser'),
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
  fullscreenBtn: document.getElementById('fullscreen-btn'),
  fullscreenIcon: document.getElementById('fullscreen-icon'),
  exitFullscreenIcon: document.getElementById('exit-fullscreen-icon'),
  fullscreenInfo: document.getElementById('fullscreen-info'),
  fsChannelLabel: document.getElementById('fs-channel-label'),
  fsUserLabel: document.getElementById('fs-user-label'),
  normalHeaderContent: document.querySelector('.normal-header-content'),
  chatGrid: document.getElementById('chat-grid'),
  mainChatContainer: document.getElementById('main-chat-container'),
  spamChatContainer: document.getElementById('spam-chat-container'),
  mainChatPercentageEl: document.getElementById('main-chat-percentage'),
  spamChatPercentageEl: document.getElementById('spam-chat-percentage'),
  globalTooltip: document.getElementById('global-tooltip'),
  copyNotification: document.getElementById('copy-notification'),
  settings: { rules: {}, isSpamVisible: true, isFullscreen: false },
  isConnected: false,

  setConnectButtonState(state) {
    this.connectBtn.disabled = false;
    this.connectBtn.classList.remove('bg-indigo-600', 'hover:bg-indigo-700', 'bg-red-600', 'hover:bg-red-700', 'bg-gray-500', 'cursor-not-allowed');

    this.connectIcon.classList.add('hidden');
    this.disconnectIcon.classList.add('hidden');
    this.connectingIcon.classList.add('hidden');

    switch (state) {
      case 'connected':
        this.isConnected = true;
        this.connectBtn.classList.add('bg-red-600', 'hover:bg-red-700');
        this.disconnectIcon.classList.remove('hidden');
        break;
      case 'connecting':
        this.isConnected = false;
        this.connectBtn.disabled = true;
        this.connectBtn.classList.add('bg-gray-500', 'cursor-not-allowed');
        this.connectingIcon.classList.remove('hidden');
        break;
      case 'disconnected':
      default:
        this.isConnected = false;
        this.connectBtn.classList.add('bg-indigo-600', 'hover:bg-indigo-700');
        this.connectIcon.classList.remove('hidden');
        break;
    }
  },

  createChatLine(badges, username, message, color, tags, spamResult, highlightDetails) {
    const line = document.createElement('div');
    line.className = 'chat-line';

    if (highlightDetails?.highlightType === 'CurrentUser') {
      line.classList.add('mention-moderator');
    } else if (highlightDetails?.highlightType === 'Channel') {
      line.classList.add('mention-channel');
    }

    const timestamp = tags['tmi-sent-ts'];
    if (timestamp) {
      const date = new Date(parseInt(timestamp));
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const timeString = `${hours}:${minutes}`;
      const timeSpan = document.createElement('span');
      timeSpan.className = 'chat-timestamp';
      timeSpan.textContent = timeString;
      line.appendChild(timeSpan);
    }

    let finalColor = color;
    if (typeof finalColor === 'string' && (finalColor === '#0000FF' || finalColor.toLowerCase() === 'rgb(0, 0, 255)')) {
      finalColor = '#60a5fa';
    } else if (!finalColor) {
      finalColor = '#FFFFFF';
    }

    const userContainer = document.createElement('span');
    userContainer.style.fontWeight = 'bold';

    const badgeSpan = document.createElement('span');
    badgeSpan.innerHTML = badges;
    userContainer.appendChild(badgeSpan);

    const nameSpan = document.createElement('span');
    nameSpan.style.color = finalColor;
    nameSpan.textContent = username;
    userContainer.appendChild(nameSpan);

    userContainer.appendChild(document.createTextNode(': '));
    line.appendChild(userContainer);

    const messageSpan = document.createElement('span');
    if (spamResult && spamResult.reason && spamResult.reason !== 'Зрада?') {
      const labelSpan = document.createElement('span');
      labelSpan.className = 'spam-label';
      labelSpan.textContent = spamResult.reason;
      messageSpan.appendChild(labelSpan);
    }

    const contentFragment = buildMessageContent(message, tags, highlightDetails, this.settings);
    messageSpan.appendChild(contentFragment);

    line.appendChild(messageSpan);
    return line;
  },

  scrollToBottom(element) {
    const isScrolledToBottom = element.scrollHeight - element.clientHeight <= element.scrollTop + 150;
    if (isScrolledToBottom) {
      element.scrollTop = element.scrollHeight;
    }
  },

  enforceMessageLimit(chatElement, maxMessages) {
    while (chatElement.children.length > maxMessages) {
      chatElement.removeChild(chatElement.firstChild);
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
        isSpamVisible: loaded.isSpamVisible !== false,
        isFullscreen: loaded.isFullscreen === true
      };
    } else {
      this.settings = { rules: {}, isSpamVisible: true, isFullscreen: false };
    }
    this.channelInput.value = localStorage.getItem('twitchChannel') || '';
    this.currentUserInput.value = localStorage.getItem('twitchCurrentUser') || '';
    this.updateFullscreenLabels();
  },

  renderSettingsToggles(spamRuleDefinitions) {
    this.rulesContainer.innerHTML = '';
    const rulesGrid = document.createElement('div');
    rulesGrid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4';

    for (const key in spamRuleDefinitions) {
      const rule = spamRuleDefinitions[key];
      const isChecked = this.settings.rules[key] !== false;

      const ruleCard = document.createElement('div');
      ruleCard.className = 'bg-gray-900/50 p-4 rounded-lg flex flex-col justify-between border border-gray-700';

      const contentDiv = document.createElement('div');
      contentDiv.innerHTML = `
            <h3 class="font-semibold text-white">${rule.label}</h3>
            <p class="text-sm text-gray-400 mt-1">${rule.description || ''}</p>
        `;

      const toggleLabel = document.createElement('label');
      toggleLabel.className = 'flex items-center justify-between cursor-pointer mt-4 pt-4 border-t border-gray-700';
      toggleLabel.innerHTML = `
            <span class="text-sm font-medium text-gray-300">Увімкнено</span>
            <div class="relative">
                <input type="checkbox" id="toggle-${key}" class="sr-only toggle-checkbox" ${isChecked ? 'checked' : ''}>
                <div class="block bg-gray-600 w-10 h-6 rounded-full toggle-label"></div>
                <div class="dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition transform ${isChecked ? 'translate-x-4' : ''}"></div>
            </div>
        `;

      const checkbox = toggleLabel.querySelector('input');
      const dot = toggleLabel.querySelector('.dot');
      checkbox.addEventListener('change', () => {
        this.settings.rules[key] = checkbox.checked;
        dot.classList.toggle('translate-x-4', checkbox.checked);
        this.saveSettings();
      });

      ruleCard.appendChild(contentDiv);
      ruleCard.appendChild(toggleLabel);
      rulesGrid.appendChild(ruleCard);
    }
    this.rulesContainer.appendChild(rulesGrid);
  },

  applySpamVisibility() {
    this.spamChatContainer.classList.toggle('hidden', !this.settings.isSpamVisible);
    this.mainChatContainer.classList.toggle('md:col-span-2', !this.settings.isSpamVisible);
    this.spamVisibleIcon.classList.toggle('hidden', !this.settings.isSpamVisible);
    this.spamHiddenIcon.classList.toggle('hidden', this.settings.isSpamVisible);
  },

  applyFullscreenMode() {
    this.body.classList.toggle('fullscreen', this.settings.isFullscreen);
    this.fullscreenIcon.classList.toggle('hidden', this.settings.isFullscreen);
    this.exitFullscreenIcon.classList.toggle('hidden', !this.settings.isFullscreen);
    this.updateFullscreenLabels();
    setTimeout(() => {
      this.mainChat.scrollTop = this.mainChat.scrollHeight + 150;
      this.spamChat.scrollTop = this.spamChat.scrollHeight + 150;
    }, 800);

  },

  updateFullscreenLabels() {
    const channelName = this.channelInput.value;
    if (channelName) {
      this.fsChannelLabel.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207"></path></svg><span>${channelName}</span>`;
      this.fsChannelLabel.classList.add('flex');
      this.fsChannelLabel.classList.remove('hidden');
    } else {
      this.fsChannelLabel.classList.add('hidden');
      this.fsChannelLabel.classList.remove('flex');
    }

    const userName = this.currentUserInput.value;
    if (userName) {
      this.fsUserLabel.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg><span>${userName}</span>`;
      this.fsUserLabel.classList.add('flex');
      this.fsUserLabel.classList.remove('hidden');
    } else {
      this.fsUserLabel.classList.add('hidden');
      this.fsUserLabel.classList.remove('flex');
    }
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

function buildMessageContent(message, tags, highlightDetails, settings) {
  const fragment = document.createDocumentFragment();
  const emotes = tags?.emotes;
  let tempMessage = message;
  const placeholderMap = {};

  if (emotes && typeof emotes === 'string' && emotes.length > 0) {
    const emoteList = [];
    emotes.split('/').forEach(emoteData => {
      const [id, positions] = emoteData.split(':');
      positions.split(',').forEach(pos => {
        const [start, end] = pos.split('-').map(Number);
        emoteList.push({ id, start, end, text: message.substring(start, end + 1) });
      });
    });
    emoteList.sort((a, b) => b.start - a.start);

    emoteList.forEach((emote, i) => {
      const placeholder = `__TW_EMOTE_${i}__`;
      tempMessage = tempMessage.substring(0, emote.start) + placeholder + tempMessage.substring(emote.end + 1);
      const img = document.createElement('img');
      img.src = `https://static-cdn.jtvnw.net/emoticons/v2/${emote.id}/default/dark/1.0`;
      img.className = 'emote';
      img.alt = emote.text;
      placeholderMap[placeholder] = img;
    });
  }

  const messageParts = tempMessage.split(/(__TW_EMOTE_\d+__|\s+)/).filter(Boolean);

  messageParts.forEach(part => {
    if (placeholderMap[part]) {
      fragment.appendChild(placeholderMap[part].cloneNode());
      return;
    }

    const sevenTvUrl = get7TVEmoteUrl(part);
    if (sevenTvUrl) {
      const img = document.createElement('img');
      img.src = sevenTvUrl;
      img.className = 'emote';
      img.alt = part;
      fragment.appendChild(img);
    } else if (settings.rules.notInTime && highlightDetails && highlightDetails.wordsToHighlight.length > 0) {
      const highlightMap = highlightDetails.wordsToHighlight.reduce((acc, word) => {
        acc[word.ru.toLowerCase()] = word.ua;
        return acc;
      }, {});

      const wordRegex = new RegExp(`(\\p{L}+)`, 'gu');
      const subParts = part.split(wordRegex);

      subParts.forEach(subPart => {
        const lowerSubPart = subPart.toLowerCase();
        if (highlightMap[lowerSubPart]) {
          const span = document.createElement('span');
          span.className = 'highlighted-word';
          span.setAttribute('data-tooltip', highlightMap[lowerSubPart]);
          span.textContent = subPart;
          fragment.appendChild(span);
        } else {
          fragment.appendChild(document.createTextNode(subPart));
        }
      });
    } else {
      fragment.appendChild(document.createTextNode(part));
    }
  });

  return fragment;
}


export function setupEventListeners(connectCallback, disconnectCallback) {
  elements.connectBtn.addEventListener('click', () => {
    if (elements.isConnected) {
      disconnectCallback();
    } else {
      connectCallback();
    }
  });
  elements.channelInput.addEventListener('keyup', (e) => e.key === 'Enter' && connectCallback());
  elements.currentUserInput.addEventListener('keyup', (e) => e.key === 'Enter' && connectCallback());

  elements.channelInput.addEventListener('blur', () => {
    localStorage.setItem('twitchChannel', elements.channelInput.value);
    elements.updateFullscreenLabels();
  });
  elements.currentUserInput.addEventListener('blur', () => {
    localStorage.setItem('twitchCurrentUser', elements.currentUserInput.value);
    elements.updateFullscreenLabels();
  });

  elements.settingsBtn.addEventListener('click', () => elements.settingsModal.classList.remove('hidden'));
  elements.closeSettingsBtn.addEventListener('click', () => elements.settingsModal.classList.add('hidden'));
  elements.settingsModal.addEventListener('click', (e) => {
    if (e.target === elements.settingsModal) elements.settingsModal.classList.add('hidden');
  });

  elements.toggleSpamBtn.addEventListener('click', () => {
    elements.settings.isSpamVisible = !elements.settings.isSpamVisible;
    elements.saveSettings();
    elements.applySpamVisibility();
    setTimeout(() => {
      elements.mainChat.scrollTop = elements.mainChat.scrollHeight;
      elements.spamChat.scrollTop = elements.spamChat.scrollHeight;
    }, 0);
  });

  elements.fullscreenBtn.addEventListener('click', () => {
    elements.settings.isFullscreen = !elements.settings.isFullscreen;
    elements.saveSettings();
    elements.applyFullscreenMode();
  });

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
