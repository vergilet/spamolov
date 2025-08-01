import { loadEmotes } from './emotes.js';

let socket = null;
let onMessageCallback = null;
let onConnectCallback = null;
let updateStatusCallback = null;

export function connectToTwitch(channel, onMessage, onConnect, updateStatus) {
  if (!channel) {
    updateStatus('error', 'Please enter a channel name.');
    return;
  }
  if (socket && socket.readyState !== WebSocket.CLOSED) {
    socket.close();
  }

  onMessageCallback = onMessage;
  onConnectCallback = onConnect;
  updateStatusCallback = updateStatus;

  onConnectCallback();
  updateStatusCallback('connecting', `Connecting to #${channel}...`);
  socket = new WebSocket('wss://irc-ws.chat.twitch.tv:443');

  socket.onopen = () => {
    updateStatusCallback('connected');
    socket.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
    socket.send('PASS oauth:dummytoken');
    socket.send(`NICK justinfan${Math.floor(Math.random() * 100000)}`);
    socket.send(`JOIN #${channel}`);

    loadEmotes(channel);
  };

  socket.onmessage = (event) => {
    event.data.split('\r\n').filter(msg => msg.length > 0).forEach(onMessageCallback);
  };

  socket.onerror = (error) => {
    console.error('WebSocket Error:', error);
    updateStatusCallback('error', 'Connection error. Check console.');
  };

  socket.onclose = () => updateStatusCallback('disconnected');
}

export function handleMessage(message) {
  if (message.startsWith('PING')) {
    socket.send('PONG :tmi.twitch.tv');
    return null;
  }
  const parsedMessage = parseIRCMessage(message);
  if (parsedMessage && parsedMessage.command === 'PRIVMSG') {
    return {
      displayName: parsedMessage.tags['display-name'] || parsedMessage.prefix.split('!')[0],
      color: parsedMessage.tags['color'] || '#FFFFFF',
      content: parsedMessage.params[1],
      badges: createBadgeIcons(parsedMessage.tags.badges),
      tags: parsedMessage.tags
    };
  } else if (parsedMessage?.command === 'NOTICE' && parsedMessage?.params[1]?.includes("Login authentication failed")) {
    updateStatusCallback('error', "Failed to join. Channel may not exist.");
    socket.close();
  }
  return null;
}

function createBadgeIcons(badgesStr) {
  if (!badgesStr || typeof badgesStr !== 'string') return '';
  const badges = {
    'broadcaster': `<svg class="badge" style="color: #e91916;" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a1 1 0 011 1v1.334a3.334 3.334 0 013.334 3.333h1.333a1 1 0 110 2h-1.333a3.334 3.334 0 01-3.334 3.333V17a1 1 0 11-2 0v-5.333A3.334 3.334 0 016.666 8.333H5.333a1 1 0 110-2h1.333A3.334 3.334 0 0110 3.001V3a1 1 0 011-1z"></path></svg>`,
    'vip': `<svg class="badge" style="color: #e00ac1;" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path></svg>`,
    'moderator': `<svg class="badge" style="color: #34d399;" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 18.5c5.166 0 9.666-3.583 11.334-8.5A11.954 11.954 0 0010 1.5c-5.166 0-9.666 3.583-11.334 8.5zM10 15a5 5 0 100-10 5 5 0 000 10z" clip-rule="evenodd"></path></svg>`,
    'subscriber': `<svg class="badge" style="color: #f59e0b;" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>`,
  };
  let html = '';
  badgesStr.split(',').forEach(part => {
    const badgeName = part.split('/')[0];
    if (badges[badgeName]) html += badges[badgeName];
  });
  return html;
}

function parseIRCMessage(message) {
  const parsedMessage = { tags: {}, prefix: null, command: null, params: [] };
  let position = 0, nextspace = 0;
  if (message[position] === '@') {
    nextspace = message.indexOf(' ');
    if (nextspace === -1) return parsedMessage;
    message.slice(1, nextspace).split(';').forEach(tag => {
      const [key, value] = tag.split('=');
      parsedMessage.tags[key] = value || true;
    });
    position = nextspace + 1;
  }
  while (message[position] === ' ') position++;
  if (message[position] === ':') {
    nextspace = message.indexOf(' ', position);
    if (nextspace === -1) return parsedMessage;
    parsedMessage.prefix = message.slice(position + 1, nextspace);
    position = nextspace + 1;
    while (message[position] === ' ') position++;
  }
  nextspace = message.indexOf(' ', position);
  if (nextspace === -1) {
    if (message.length > position) parsedMessage.command = message.slice(position);
    return parsedMessage;
  }
  parsedMessage.command = message.slice(position, nextspace);
  position = nextspace + 1;
  while (position < message.length) {
    nextspace = message.indexOf(' ', position);
    if (message[position] === ':') {
      parsedMessage.params.push(message.slice(position + 1));
      break;
    }
    if (nextspace !== -1) {
      parsedMessage.params.push(message.slice(position, nextspace));
      position = nextspace + 1;
    } else {
      parsedMessage.params.push(message.slice(position));
      break;
    }
  }
  return parsedMessage;
}
