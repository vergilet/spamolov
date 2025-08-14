import * as ui from './ui.js';
import { setupVocabulary, spamRuleDefinitions } from './filter.js';
import { translations } from './i18n.js';

let socket = null;
let mainMessageCount = 0;
let spamMessageCount = 0;

function updateConnectionStatus(state, message) {
  switch (state) {
    case 'connecting':
      ui.elements.setConnectButtonState('connecting');
      break;
    case 'connected':
      ui.elements.setConnectButtonState('connected');
      ui.elements.statusEl.textContent = `Connected to server. Waiting for messages on #${ui.elements.channelInput.value}`;
      break;
    case 'error':
      ui.elements.setConnectButtonState('disconnected');
      ui.elements.statusEl.textContent = `Error: ${message}`;
      break;
    case 'disconnected':
    default:
      ui.elements.setConnectButtonState('disconnected');
      ui.elements.statusEl.textContent = 'Disconnected from server.';
      break;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  setupVocabulary();
  ui.setupEventListeners(connect, disconnect);
  ui.elements.loadSettings(spamRuleDefinitions);
  ui.elements.renderSettingsToggles(spamRuleDefinitions);
  ui.elements.applySpamVisibility();
  ui.elements.applyFullscreenMode();
});

function connect() {
  const channel = ui.elements.channelInput.value.trim();
  const user = ui.elements.currentUserInput.value.trim();

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  socket = new WebSocket(`${protocol}//${host}/websocket`);

  socket.onopen = () => {
    updateConnectionStatus('connected');
    socket.send(JSON.stringify({ action: 'join', channel: channel, user: user }));
  };

  socket.onmessage = (event) => {
    const response = JSON.parse(event.data);

    if (response.type === 'error') {
      updateConnectionStatus('error', response.payload);
      return;
    }

    if (response.type === 'message') {
      const { category, payload } = response;
      const { spam_reason, highlight_details, ...message } = payload;

      const spamResult = spam_reason ? { reason: spam_reason } : null;

      const chatLine = ui.elements.createChatLine(
        message.badges,
        message.displayName,
        message.content,
        message.color,
        message.tags,
        spamResult,
        highlight_details
      );

      if (category === 'spam') {
        spamMessageCount++;
        ui.elements.spamChat.appendChild(chatLine);
        ui.elements.scrollToBottom(ui.elements.spamChat);
      } else {
        mainMessageCount++;
        ui.elements.mainChat.appendChild(chatLine);
        ui.elements.scrollToBottom(ui.elements.mainChat);
      }
      ui.elements.updatePercentageDisplay(mainMessageCount, spamMessageCount);
    }
  };

  socket.onclose = () => updateConnectionStatus('disconnected');
  socket.onerror = (err) => updateConnectionStatus('error', 'WebSocket connection failed.');
}

function disconnect() {
  if (socket) {
    socket.close();
    socket = null;
    updateConnectionStatus('disconnected');
  }
}
