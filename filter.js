import { get7TVEmoteUrl } from './emotes.js';

let badWordsLookup = {};
let recentBigMessages = [];

export function setupVocabulary() {
  if (typeof BAD_WORDS_VOCABULARY_PAIRS !== 'undefined') {
    badWordsLookup = BAD_WORDS_VOCABULARY_PAIRS.reduce((acc, pair) => {
      const key = Object.keys(pair)[0];
      acc[key.toLowerCase()] = pair[key];
      return acc;
    }, {});
  }
  return Object.keys(badWordsLookup).length;
}

export const spamRuleDefinitions = {
  notInTime: {
    label: "🔥 Чи не на часі?",
    test: (message) => {
      const words = message.toLowerCase().split(/[^a-zA-Z\u0400-\u04FF0-9]+/).filter(Boolean);
      const foundWords = [];
      words.forEach(word => {
        if (badWordsLookup[word]) {
          if (!foundWords.some(fw => fw.ru === word)) {
            foundWords.push({ ru: word, ua: badWordsLookup[word] });
          }
        }
      });
      return foundWords.length > 0 ? { reason: "Зрада?", words: foundWords } : null;
    }
  },
  botMessage: {
    label: "🤖 Фільтрувати ботяру (StreamElements)",
    test: (message, tags) => {
      const displayName = tags['display-name'] || (tags.prefix ? tags.prefix.split('!')[0] : '');
      if (displayName.toLowerCase() === 'streamelements') {
        return { reason: "Бот" };
      }
      return null;
    }
  },
  mentions: {
    label: "💬 Діалоги чатерсів @user",
    test: (message, tags, channelName, moderatorName) => {
      const mentionRegex = /@(\w+)/g;
      const mentions = (message.match(mentionRegex) || []).map(m => m.substring(1).toLowerCase());
      if (mentions.length === 0) return null;
      const moderator = moderatorName ? moderatorName.toLowerCase() : '';
      const channel = channelName ? channelName.toLowerCase() : '';
      const isAllowedMention = mentions.some(mention => mention === moderator || mention === channel);
      return isAllowedMention ? null : { reason: "Діалог" };
    }
  },
  foreignLang: {
    label: "🛑 Лише Українська та Англійська мови",
    test: (message) => {
      const cleanMessage = message.replace(/[\u{E0000}-\u{E007F}]/gu, '');
      const FOREIGN_CHARS_REGEX = /[^a-zA-Z\u0400-\u04FF0-9\s\p{P}\p{S}]/u;
      if (FOREIGN_CHARS_REGEX.test(cleanMessage)) {
        return { reason: "Іноземне" };
      }
      return null;
    }
  },
  russianChars: {
    label: "🧟 Фільтрувати терористичне",
    test: (message) => /[ыэёъ]/i.test(message) ? { reason: "Russian Chars" } : null
  },
  commandOnly: {
    label: "📋 Фільтрувати команди (!drops, etc.)",
    test: (message) => /^![a-zA-Z\u0400-\u04FF0-9_]+/.test(message.trim()) ? { reason: "Команда" } : null
  },
  link: {
    label: "🔗 Фільтрувати посилання",
    test: (message) => /(https?:\/\/[^\s]+|\w+\.\w+\/\S+)/i.test(message) ? { reason: "Посилання" } : null
  },
  allCaps: {
    label: "🔠 Фільтрувати КАПС",
    test: (message) => {
      const words = message.split(' ').filter(w => w.length > 1);
      const nonEmoteWords = words.filter(word => !get7TVEmoteUrl(word));
      if (nonEmoteWords.length > 1 && nonEmoteWords.every(word => word === word.toUpperCase() && /[A-Z]/.test(word))) {
        return { reason: "КАПС" };
      }
      return null;
    }
  },
  emoteOnly: {
    label: "🤣 Фільтрувати лише емодзі",
    test: (message, tags) => {
      const cleanMessage = message.replace(/[\u{E0000}-\u{E007F}]/gu, '').trim();
      if (cleanMessage.length === 0) return null;

      const nativeEmotes = new Set();
      if (tags && typeof tags.emotes === 'string' && tags.emotes) {
        tags.emotes.split('/').forEach(range => {
          const [id, positions] = range.split(':');
          if (!positions) return;
          positions.split(',').forEach(pos => {
            const [start, end] = pos.split('-').map(Number);
            nativeEmotes.add(message.substring(start, end + 1));
          });
        });
      }

      const words = cleanMessage.split(' ').filter(w => w.length > 0);

      const allAreEmotes = words.every(word => {
        return nativeEmotes.has(word) || get7TVEmoteUrl(word);
      });

      if (allAreEmotes && words.length > 0) {
        return { reason: "Емодзі" };
      }

      return null;
    }
  },
  copypasta: {
    label: "🍝 Лише одна Паста",
    test: (message) => {
      const COPYPASTA_MIN_LENGTH = 50;
      const COPYPASTA_TIME_WINDOW_MS = 60000;
      const now = Date.now();
      recentBigMessages = recentBigMessages.filter(msg => now - msg.timestamp < COPYPASTA_TIME_WINDOW_MS);

      const cleanMessage = message.replace(/[\u{E0000}-\u{E007F}]/gu, '').trim();

      if (cleanMessage.length >= COPYPASTA_MIN_LENGTH) {
        if (recentBigMessages.some(msg => msg.text === cleanMessage)) {
          return { reason: "Паста" };
        }
        recentBigMessages.push({ text: cleanMessage, timestamp: now });
      }
      return null;
    }
  }
};

export function getSpamResult(message, tags, channelName, moderatorName, settings) {
  for (const ruleKey in spamRuleDefinitions) {
    if (settings.rules[ruleKey]) {
      const result = spamRuleDefinitions[ruleKey].test(message, tags, channelName, moderatorName);
      if (result) return result;
    }
  }
  return null;
}
