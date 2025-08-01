import { elements, setupEventListeners } from './ui.js';
import { connectToTwitch, handleMessage } from './twitch.js';
import { getSpamResult, setupVocabulary, spamRuleDefinitions } from './filter.js';

let mainMessageCount = 0;
let spamMessageCount = 0;
let activityChecker = null;
let lastMessageTimestamp = 0;

function updateConnectionStatus(state, message) {
  clearInterval(activityChecker);
  elements.statusLight.classList.remove('bg-green-500', 'bg-yellow-500', 'bg-red-500', 'bg-gray-500');

  switch (state) {
    case 'connecting':
      elements.statusLight.classList.add('bg-yellow-500');
      // Do not change the text while connecting
      break;
    case 'connected':
      elements.statusLight.classList.add('bg-green-500');
      lastMessageTimestamp = Date.now();
      activityChecker = setInterval(() => {
        const secondsSince = Math.round((Date.now() - lastMessageTimestamp) / 1000);
        if (secondsSince > 20) {
          elements.statusLight.classList.remove('bg-green-500');
          elements.statusLight.classList.add('bg-yellow-500');
          elements.statusEl.textContent = `Connection stale (last message ${secondsSince}s ago)`;
        } else {
          elements.statusLight.classList.remove('bg-yellow-500');
          elements.statusLight.classList.add('bg-green-500');
          elements.statusEl.textContent = `Connected to #${elements.channelInput.value.trim().toLowerCase()} (last message ${secondsSince}s ago)`;
        }
      }, 1000);
      break;
    case 'error':
      elements.statusLight.classList.add('bg-red-500');
      elements.statusEl.textContent = message;
      break;
    case 'disconnected':
    default:
      elements.statusLight.classList.add('bg-gray-500');
      elements.statusEl.textContent = message || 'Enter a channel and press Connect.';
      break;
  }
}


function onMessage(message) {
  try {
    lastMessageTimestamp = Date.now(); // Update timestamp for ANY message from server
    const parsedMessage = handleMessage(message);
    if (!parsedMessage) return;

    const channelName = elements.channelInput.value.trim();
    const moderatorName = elements.moderatorInput.value.trim();
    const spamResult = getSpamResult(parsedMessage.content, parsedMessage.tags, channelName, moderatorName, elements.settings);

    const chatLine = elements.createChatLine(parsedMessage.badges, parsedMessage.displayName, parsedMessage.content, parsedMessage.color, parsedMessage.tags, spamResult);

    if (spamResult && spamResult.reason === 'Зрада?') {
      mainMessageCount++;
      elements.mainChat.appendChild(chatLine);
      elements.scrollToBottom(elements.mainChat);
    } else if (spamResult) {
      spamMessageCount++;
      elements.spamChat.appendChild(chatLine);
      elements.scrollToBottom(elements.spamChat);
    } else {
      mainMessageCount++;
      elements.mainChat.appendChild(chatLine);
      elements.scrollToBottom(elements.mainChat);
    }
    elements.updatePercentageDisplay(mainMessageCount, spamMessageCount);
  } catch (e) {
    console.error("Failed to process message:", message, e);
  }
}

function onConnect() {
  mainMessageCount = 0;
  spamMessageCount = 0;
  elements.updatePercentageDisplay(mainMessageCount, spamMessageCount);
  elements.mainChat.innerHTML = '';
  elements.spamChat.innerHTML = '';
}

window.addEventListener('DOMContentLoaded', () => {
  const wordCount = setupVocabulary();
  console.log(`Vocabulary loaded with ${wordCount} words.`);

  setupEventListeners(connect);
  elements.loadSettings(spamRuleDefinitions);

  if (Object.keys(elements.settings.rules).length === 0) {
    Object.keys(spamRuleDefinitions).forEach(key => elements.settings.rules[key] = true);
    elements.saveSettings();
  }

  elements.renderSettingsToggles(spamRuleDefinitions);
  elements.applySpamVisibility();

  const params = new URLSearchParams(window.location.search);
  const channelFromUrl = params.get('channel');
  const moderatorFromUrl = params.get('username');
  if (channelFromUrl) {
    elements.channelInput.value = channelFromUrl;
    localStorage.setItem('twitchChannel', channelFromUrl);
  }
  if (moderatorFromUrl) {
    elements.moderatorInput.value = moderatorFromUrl;
    localStorage.setItem('twitchModerator', moderatorFromUrl);
  }
  if (elements.channelInput.value) {
    connect();
  }
});

function connect() {
  connectToTwitch(elements.channelInput.value, onMessage, onConnect, updateConnectionStatus);
}
