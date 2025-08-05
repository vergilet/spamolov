import * as ui from './ui.js';
import { connectToTwitch, disconnectFromTwitch, handleMessage } from './twitch.js';
import { getSpamResult, getHighlightDetails, setupVocabulary, spamRuleDefinitions } from './filter.js';
import { translations } from './i18n.js';

const MAX_MESSAGES_PER_CHAT = 300;
let mainMessageCount = 0;
let spamMessageCount = 0;
let activityChecker = null;
let lastMessageTimestamp = 0;

function updateConnectionStatus(state, message) {
  clearInterval(activityChecker);
  ui.elements.statusLight.classList.remove('bg-green-500', 'bg-yellow-500', 'bg-red-500', 'bg-gray-500');

  switch (state) {
    case 'connecting':
      ui.elements.statusLight.classList.add('bg-yellow-500');
      ui.elements.statusEl.textContent = translations.statusConnectingText;
      ui.elements.setConnectButtonState('connecting');
      break;
    case 'connected':
      ui.elements.statusLight.classList.add('bg-green-500');
      ui.elements.setConnectButtonState('connected');
      lastMessageTimestamp = Date.now();
      activityChecker = setInterval(() => {
        const secondsSince = Math.round((Date.now() - lastMessageTimestamp) / 1000);
        if (secondsSince > 20) {
          ui.elements.statusLight.classList.remove('bg-green-500');
          ui.elements.statusLight.classList.add('bg-yellow-500');
          ui.elements.statusEl.textContent = `${translations.statusStale} (${secondsSince} ${translations.statusSecondsAgo})`;
        } else {
          ui.elements.statusLight.classList.remove('bg-yellow-500');
          ui.elements.statusLight.classList.add('bg-green-500');
          ui.elements.statusEl.textContent = `${translations.statusConnected}${ui.elements.channelInput.value.trim().toLowerCase()} (${secondsSince} ${translations.statusSecondsAgo})`;
        }
      }, 1000);
      break;
    case 'error':
      ui.elements.statusLight.classList.add('bg-red-500');
      ui.elements.statusEl.textContent = message;
      ui.elements.setConnectButtonState('disconnected');
      break;
    case 'disconnected':
    default:
      ui.elements.statusLight.classList.add('bg-gray-500');
      ui.elements.statusEl.textContent = message || translations.statusDefault;
      ui.elements.setConnectButtonState('disconnected');
      break;
  }
}


function onMessage(message) {
  try {
    lastMessageTimestamp = Date.now();
    const parsedMessage = handleMessage(message);
    if (!parsedMessage) return;

    const channelName = ui.elements.channelInput.value.trim();
    const currentUserName = ui.elements.currentUserInput.value.trim().toLowerCase();

    if (!parsedMessage.isSystemMessage && currentUserName && parsedMessage.displayName.toLowerCase() === currentUserName) {
      const highlightDetails = getHighlightDetails(parsedMessage.content, channelName, currentUserName, ui.elements.settings);
      const chatLine = ui.elements.createChatLine(parsedMessage.badges, parsedMessage.displayName, parsedMessage.content, parsedMessage.color, parsedMessage.tags, null, highlightDetails);

      const chatEl = ui.elements.mainChat;
      const shouldAutoScroll = chatEl.scrollHeight - chatEl.clientHeight <= chatEl.scrollTop + 150;

      mainMessageCount++;
      chatEl.appendChild(chatLine);

      if (shouldAutoScroll) {
        chatEl.scrollTop = chatEl.scrollHeight;
      }

      ui.elements.enforceMessageLimit(chatEl, MAX_MESSAGES_PER_CHAT);
      ui.elements.updatePercentageDisplay(mainMessageCount, spamMessageCount);
      return;
    }

    const spamResult = getSpamResult(parsedMessage.content, parsedMessage.tags, channelName, currentUserName, ui.elements.settings);

    if (spamResult) {
      const chatEl = ui.elements.spamChat;
      const shouldAutoScroll = chatEl.scrollHeight - chatEl.clientHeight <= chatEl.scrollTop + 150;

      spamMessageCount++;
      const chatLine = ui.elements.createChatLine(parsedMessage.badges, parsedMessage.displayName, parsedMessage.content, parsedMessage.color, parsedMessage.tags, spamResult, null);
      chatEl.appendChild(chatLine);

      if (shouldAutoScroll) {
        chatEl.scrollTop = chatEl.scrollHeight;
      }
      ui.elements.enforceMessageLimit(chatEl, MAX_MESSAGES_PER_CHAT);

    } else {
      const chatEl = ui.elements.mainChat;
      const shouldAutoScroll = chatEl.scrollHeight - chatEl.clientHeight <= chatEl.scrollTop + 150;

      mainMessageCount++;
      const highlightDetails = getHighlightDetails(parsedMessage.content, channelName, currentUserName, ui.elements.settings);
      const chatLine = ui.elements.createChatLine(parsedMessage.badges, parsedMessage.displayName, parsedMessage.content, parsedMessage.color, parsedMessage.tags, null, highlightDetails);

      if (parsedMessage.isSystemMessage) {
        chatLine.classList.add('system-notification');
      }

      chatEl.appendChild(chatLine);

      if (shouldAutoScroll) {
        chatEl.scrollTop = chatEl.scrollHeight;
      }
      ui.elements.enforceMessageLimit(chatEl, MAX_MESSAGES_PER_CHAT);
    }
    ui.elements.updatePercentageDisplay(mainMessageCount, spamMessageCount);
  } catch (e) {
    console.error("Failed to process message:", message, e);
  }
}

function onConnect() {
  mainMessageCount = 0;
  spamMessageCount = 0;
  ui.elements.updatePercentageDisplay(mainMessageCount, spamMessageCount);
  ui.elements.mainChat.innerHTML = '';
  ui.elements.spamChat.innerHTML = '';
}

window.addEventListener('DOMContentLoaded', () => {
  setupVocabulary();
  ui.setupEventListeners(connect, disconnect);
  ui.elements.loadSettings(spamRuleDefinitions);

  let settingsUpdated = false;
  for (const ruleKey in spamRuleDefinitions) {
    if (ui.elements.settings.rules[ruleKey] === undefined) {
      ui.elements.settings.rules[ruleKey] = true;
      settingsUpdated = true;
    }
  }

  if (settingsUpdated) {
    ui.elements.saveSettings();
  }

  ui.elements.renderSettingsToggles(spamRuleDefinitions);
  ui.elements.applySpamVisibility();
  ui.elements.applyFullscreenMode();

  const params = new URLSearchParams(window.location.search);
  const channelFromUrl = params.get('channel');
  const currentUserFromUrl = params.get('username');
  if (channelFromUrl) {
    ui.elements.channelInput.value = channelFromUrl;
    localStorage.setItem('twitchChannel', channelFromUrl);
  }
  if (currentUserFromUrl) {
    ui.elements.currentUserInput.value = currentUserFromUrl;
    localStorage.setItem('twitchCurrentUser', currentUserFromUrl);
  }
  if (ui.elements.channelInput.value) {
    connect();
  }
});

function connect() {
  connectToTwitch(ui.elements.channelInput.value, onMessage, onConnect, updateConnectionStatus);
}

function disconnect() {
  disconnectFromTwitch();
}
