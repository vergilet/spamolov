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
  mentions: {
    label: "💬 Спілкування між чатерсами @username",
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
      const allowedPattern = /^[a-zA-Z\u0400-\u04FF\u02BC\u2019\u201C\u201D0-9\s\p{P}\p{S}\u0131\u0456]*$/u;
      return !allowedPattern.test(message) ? { reason: "Іноземне" } : null;
    }
  },
  russianChars: {
    label: "🧟 Фільтрувати терористичне",
    test: (message) => /[ыэёъ]/i.test(message) ? { reason: "Терорист" } : null
  },
  commandOnly: {
    label: "📋 Фільтрувати команди (!drops)",
    test: (message) => /^![a-zA-Z\u0400-\u04FF0-9_]+/.test(message.trim()) ? { reason: "Команда" } : null
  },
  link: {
    label: "🔗 Фільтрувати посиланням",
    test: (message) => /(https?:\/\/[^\s]+|\w+\.\w+\/\S+)/i.test(message) ? { reason: "Посилання" } : null
  },
  allCaps: {
    label: "🔠 Фільтрувати КАПС",
    test: (message) => {
      const words = message.split(' ').filter(w => w.trim().length > 0 && /[a-zA-Z\u0400-\u04FF]/.test(w));
      if (words.length > 0 && words.every(word => word === word.toUpperCase())) {
        return { reason: "КАПС" };
      }
      return null;
    }
  },
  emoteOnly: {
    label: "🤣 Фільтрувати лише емодзі",
    test: (message, tags) => {
      if (tags && typeof tags.emotes === 'string' && tags.emotes) {
        let charIsEmote = new Array(message.length).fill(false);
        tags.emotes.split('/').forEach(range => {
          const [id, positions] = range.split(':');
          if (!positions) return;
          positions.split(',').forEach(pos => {
            const [start, end] = pos.split('-').map(Number);
            for (let i = start; i <= end; i++) {
              if (i < charIsEmote.length) charIsEmote[i] = true;
            }
          });
        });
        if (![...message].some((char, i) => !charIsEmote[i] && char !== ' ')) {
          return { reason: "Лише емодзі", tags: { emotes: tags.emotes } };
        }
      }
      return null;
    }
  },
  copypasta: {
    label: "🍝 Лише одна копія Паста",
    test: (message) => {
      const COPYPASTA_MIN_LENGTH = 25;
      const COPYPASTA_TIME_WINDOW_MS = 60000;
      const now = Date.now();
      recentBigMessages = recentBigMessages.filter(msg => now - msg.timestamp < COPYPASTA_TIME_WINDOW_MS);
      if (message.length >= COPYPASTA_MIN_LENGTH) {
        if (recentBigMessages.some(msg => msg.text === message)) {
          return { reason: "Паста" };
        }
        recentBigMessages.push({ text: message, timestamp: now });
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
