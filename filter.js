import { get7TVEmoteUrl } from './emotes.js';

let badWordsLookup = {};
let recentBigMessages = [];
let recentUserMessages = {};

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

export function clearUserRepeatHistory() {
  recentUserMessages = {};
}

const highlightRule = {
  label: "🔥 Чи не на часі?",
  description: "Підсвічує російські слова та пропонує українські відповідники.",
  test: (message) => {
    const words = message.toLowerCase().match(/\p{L}+/gu) || [];
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
};

const hardSpamRules = {
  singleCharMessage: {
    label: "📏 Фільтрувати повідомлення з одного символу",
    description: "Блокує повідомлення, що складаються з одного символу (наприклад, '1', '?', 'а'), окрім емодзі.",
    test: (message) => {
      const cleanMessage = message.replace(/[\u{E0000}-\u{E007F}\u200B-\u200D\uFEFF]/gu, '').trim();
      if (cleanMessage.length === 1) {
        const isKnownEmote = get7TVEmoteUrl(cleanMessage);
        const isDisplayableEmoji = /\p{Emoji_Presentation}/u.test(cleanMessage);
        if (!isKnownEmote && !isDisplayableEmoji) {
          return { reason: "Один символ" };
        }
      }
      return null;
    }
  },
  giftedSubs: {
    label: "🎁 Фільтрувати подарункові підписки",
    description: "Переміщує системні повідомлення про подарункові підписки до спам-чату.",
    test: (message, tags) => {
      const msgId = tags['msg-id'];
      if (msgId === 'subgift' || msgId === 'submysterygift') {
        return { reason: "Подарунок" };
      }
      return null;
    }
  },
  userRepeat: {
    label: "👯‍♀️ Фільтрувати повтори від одного юзера",
    description: "Блокує однакові повідомлення від одного й того ж користувача протягом хвилини.",
    test: (message, tags) => {
      const USER_REPEAT_TIME_WINDOW_MS = 60000;
      const userId = tags['user-id'];
      if (!userId) return null;

      const now = Date.now();
      const cleanMessage = message.replace(/[\u{E0000}-\u{E007F}\u200B-\u200D\uFEFF]/gu, '').trim();

      const lastMessage = recentUserMessages[userId];

      if (lastMessage && lastMessage.text === cleanMessage && (now - lastMessage.timestamp < USER_REPEAT_TIME_WINDOW_MS)) {
        return { reason: "Повтор" };
      }

      recentUserMessages[userId] = { text: cleanMessage, timestamp: now };

      return null;
    }
  },
  botMessage: {
    label: "🤖 Фільтрувати ботяру (StreamElements)",
    description: "Блокує повідомлення від відомих ботів, таких як StreamElements.",
    test: (message, tags) => {
      const displayName = (tags['display-name'] || (tags.prefix ? tags.prefix.split('!')[0] : '')).toLowerCase();
      if (displayName === 'streamelements' || message.toLowerCase().startsWith('streamelements:')) {
        return { reason: "Бот" };
      }
      return null;
    }
  },
  mentions: {
    label: "💬 Діалоги чатерсів @user",
    description: "Блокує повідомлення, що містять згадки (@user), окрім згадок стрімера або модератора.",
    test: (message, tags, channelName, currentUserName) => {
      const mentionRegex = /@(\w+)/g;
      const mentions = (message.match(mentionRegex) || []).map(m => m.substring(1).toLowerCase());
      if (mentions.length === 0) return null;

      const currentUser = currentUserName ? currentUserName.toLowerCase() : '';
      const channel = channelName ? channelName.toLowerCase() : '';

      const isAllowedMention = mentions.some(mention => mention === currentUser || mention === channel);

      return isAllowedMention ? null : { reason: "Діалог" };
    }
  },
  foreignLang: {
    label: "🛑 Лише Українська та Англійська мови",
    description: "Блокує повідомлення, що містять символи, які не належать до українського чи англійського алфавітів.",
    test: (message) => {
      const cleanMessage = message.replace(/[\u{E0000}-\u{E007F}]/gu, '').trim();
      const FOREIGN_CHARS_REGEX = /[^a-zA-Z\u0400-\u04FFʼ0-9\s\p{P}\p{S}\u2000-\u3300\uFE0F\uD83C-\uDBFF\uDC00-\uDFFF]/u;
      if (FOREIGN_CHARS_REGEX.test(cleanMessage)) {
        return { reason: "Іноземне" };
      }
      return null;
    }
  },
  russianChars: {
    label: "🧟 Фільтрувати терористичне",
    description: "Блокує повідомлення, що містять символи російського алфавіту (ы, э, ё, ъ).",
    test: (message) => /[ыэёъ]/i.test(message) ? { reason: "Терористичне" } : null
  },
  commandOnly: {
    label: "📋 Фільтрувати команди (!drops, etc.)",
    description: "Блокує повідомлення, що починаються з символу '!' і виглядають як команди.",
    test: (message) => /^![a-zA-Z\u0400-\u04FF0-9_]+/.test(message.trim()) ? { reason: "Команда" } : null
  },
  link: {
    label: "🔗 Фільтрувати посилання",
    description: "Блокує повідомлення, що містять посилання (http, .com, тощо).",
    test: (message) => /(https?:\/\/[^\s]+|\w+\.\w+\/\S+)/i.test(message) ? { reason: "Посилання" } : null
  },
  allCaps: {
    label: "🔠 Фільтрувати КАПС",
    description: "Блокує повідомлення, написані переважно великими літерами.",
    test: (message) => {
      const cleanMessage = message.replace(/[\u{E0000}-\u{E007F}]/gu, '').trim();
      const words = cleanMessage.split(' ').filter(w => w.length > 0 && !get7TVEmoteUrl(w));

      if (words.length === 0) return null;

      const textToCheck = words.join('');
      const letters = textToCheck.match(/\p{L}/gu) || [];

      if (letters.length < 4) return null;

      const uppercaseLetters = textToCheck.match(/\p{Lu}/gu) || [];

      const uppercaseRatio = uppercaseLetters.length / letters.length;

      if (uppercaseRatio > 0.75) {
        return { reason: "КАПС" };
      }

      return null;
    }
  },
  repetitiveChars: {
    label: "😂 Фільтрувати сміх та флуд",
    description: "Блокує повідомлення, що складаються з повторюваних символів або груп символів (наприклад, 'ахахах', 'лоллол').",
    test: (message, tags) => {
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

      const isStandardEmoji = (str) => /\p{Emoji_Presentation}/u.test(str);

      const textOnlyWords = message.split(' ').filter(word => {
        return !nativeEmotes.has(word) && !get7TVEmoteUrl(word) && !isStandardEmoji(word);
      });

      const messageWithoutEmotes = textOnlyWords.join(' ');
      const cleanMessage = messageWithoutEmotes.replace(/[\u{E0000}-\u{E007F}\u200B-\u200D\uFEFF]/gu, '').trim();

      if (cleanMessage.length < 2) {
        return null;
      }

      const uniqueChars = new Set(cleanMessage.split(''));
      if (uniqueChars.size === 1) {
        return { reason: "Сміття" };
      }

      const messageWithoutSpaces = cleanMessage.replace(/\s/g, '').toLowerCase();
      const len = messageWithoutSpaces.length;

      if (len >= 4) {
        const alphanumericOnly = message.replace(/[^a-zA-Z0-9а-яА-ЯіІїЇєЄґҐ]/g, '');
        if (/([\p{L}\p{N}])\1{3,}/u.test(alphanumericOnly)) {
          return { reason: "Сміття" };
        }

        if (/(.{2,3})\1{2,}/.test(messageWithoutSpaces)) {
          return { reason: "Сміття" };
        }
      }

      if (len >= 7 && len < 30) {
        const uniqueCharsInLongerMsg = new Set(messageWithoutSpaces.split('')).size;
        if (uniqueCharsInLongerMsg <= 2) {
          return { reason: "Сміття" };
        }
        if (len >= 10 && uniqueCharsInLongerMsg <= 3) {
          return { reason: "Сміття" };
        }
        const ratio = uniqueCharsInLongerMsg / len;
        if (len > 12 && ratio < 0.35) {
          return { reason: "Сміття" };
        }
      }

      return null;
    }
  },
  gibberish: {
    label: "⌨️ Фільтрувати нісенітниці",
    description: "Блокує беззмістовні набори символів, які не схожі на звичайні слова.",
    test: (message) => {
      const cleanMessage = message.replace(/\s/g, '');
      if (cleanMessage.length < 10) return null;

      const nonAlphanum = (cleanMessage.match(/[^a-zA-Z\u0400-\u04FF0-9]/g) || []).length;
      if (nonAlphanum / cleanMessage.length > 0.6) {
        return { reason: "Нісенітниця" };
      }

      if (!message.includes(' ') && message.length > 25) {
        return { reason: "Нісенітниця" };
      }

      const vowels = (cleanMessage.match(/[аеиоуієїяюaeiou]/gi) || []).length;
      const consonants = (cleanMessage.match(/[бвгґджзйклмнпрстфхцчшщbcdfghjklmnpqrstvwxyz]/gi) || []).length;
      if (vowels + consonants > 10 && (vowels / (consonants + 1) < 0.1 || consonants / (vowels + 1) > 8)) {
        return { reason: "Нісенітниця" };
      }

      return null;
    }
  },
  emoteOnly: {
    label: "🤣 Фільтрувати лише емодзі",
    description: "Блокує повідомлення, що складаються виключно з емодзі Twitch, 7TV або стандартних емодзі.",
    test: (message, tags) => {
      const messageWithoutMentions = message.replace(/@(\w+)/g, '');
      const cleanMessage = messageWithoutMentions.replace(/[\u{E0000}-\u{E007F}]/gu, '').trim();
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

      const isOnlyEmoji = (str) => {
        if (/^\d+$/.test(str)) {
          return false;
        }
        const emojiRegex = /^(\p{Emoji_Presentation}|\p{Emoji_Modifier_Base}|\p{Emoji_Component}|\u200d)+$/u;
        return emojiRegex.test(str);
      };

      const allAreEmotes = words.every(word => {
        return nativeEmotes.has(word) || get7TVEmoteUrl(word) || isOnlyEmoji(word);
      });

      if (allAreEmotes && words.length > 0) {
        return { reason: "Емодзі" };
      }

      return null;
    }
  },
  copypasta: {
    label: "🍝 Лише одна Паста",
    description: "Блокує довгі повідомлення (копіпасти), які повторюються в чаті протягом хвилини.",
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

export const spamRuleDefinitions = { ...hardSpamRules, notInTime: highlightRule };

export function getSpamResult(message, tags, channelName, currentUserName, settings) {
  for (const ruleKey in hardSpamRules) {
    if (settings.rules[ruleKey]) {
      const result = hardSpamRules[ruleKey].test(message, tags, channelName, currentUserName);
      if (result) {
        return result;
      }
    }
  }
  return null;
}

export function getHighlightDetails(message, channelName, currentUserName, settings) {
  const details = {
    highlightType: null,
    wordsToHighlight: []
  };

  const lowerMessage = message.toLowerCase();
  const currentUser = currentUserName ? currentUserName.toLowerCase() : '';
  const channel = channelName ? channelName.toLowerCase() : '';

  if (currentUser && lowerMessage.includes(`@${currentUser}`)) {
    details.highlightType = 'CurrentUser';
  } else if (channel && lowerMessage.includes(`@${channel}`)) {
    details.highlightType = 'Channel';
  }

  if (settings.rules.notInTime) {
    const highlightResult = highlightRule.test(message);
    if (highlightResult) {
      details.wordsToHighlight = highlightResult.words;
    }
  }

  return details;
}
