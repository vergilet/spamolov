let emoteCache = {};

async function getTwitchUserId(channelName) {
  // Using a public proxy to get user info without requiring a token
  const response = await fetch(`https://api.ivr.fi/v2/twitch/user?login=${channelName}`);
  if (!response.ok) {
    console.error(`Failed to get Twitch ID for ${channelName}`);
    return null;
  }
  const data = await response.json();
  return data[0]?.id;
}

async function fetch7TVEmotes(twitchId) {
  const response = await fetch(`https://7tv.io/v3/users/twitch/${twitchId}`);
  if (!response.ok) {
    console.error(`Failed to get 7TV emotes for Twitch ID ${twitchId}`);
    return [];
  }
  const data = await response.json();
  return data.emote_set?.emotes || [];
}

async function fetchGlobal7TVEmotes() {
  const response = await fetch(`https://7tv.io/v3/emote-sets/global`);
  if (!response.ok) {
    console.error('Failed to get global 7TV emotes');
    return [];
  }
  const data = await response.json();
  return data.emotes || [];
}

function processEmoteList(emotes) {
  emotes.forEach(emote => {
    const name = emote.name;
    // Find the best image format to use, prioritizing webp
    const file = emote.data.host.files.find(f => f.format === 'WEBP') || emote.data.host.files[0];
    if (file) {
      const url = `${emote.data.host.url}/${file.name}`;
      emoteCache[name] = url;
    }
  });
}

export async function loadEmotes(channelName) {
  emoteCache = {}; // Clear cache for new channel
  const twitchId = await getTwitchUserId(channelName);
  if (!twitchId) return;

  const [channelEmotes, globalEmotes] = await Promise.all([
    fetch7TVEmotes(twitchId),
    fetchGlobal7TVEmotes()
  ]);

  processEmoteList(channelEmotes);
  processEmoteList(globalEmotes);
  console.log(`Loaded ${Object.keys(emoteCache).length} 7TV emotes for channel ${channelName}.`);
}

export function get7TVEmoteUrl(emoteName) {
  return emoteCache[emoteName];
}
