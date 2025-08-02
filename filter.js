import { get7TVEmoteUrl } from './emotes.js';

/*
TEST CASES TO COVER:

Repetitive/Gibberish/Laughter:
- "АХАХАХАХААХАХАХАХАХА"
- "ЖХІВХЗВАЄЗХЄВАЗХЖВА_ХЩЗВЗХАЄХЗВА"
- "ахаххахахахаххахаха"
- "ГИГИГИГИГИГИГИГИГИГИГИ"
- "ВХАЗВАХЗЗХВАЗХВАЗХВАЗХВАХЗ"
- "хаххахахахахаххахаххаха"
- "хапzhaahphzphdaphphhdbzdbєзьзщлхщлхщзх"
- "АХАХАХХАХАХААЗХХХААХАХАХАХА"
- "ІВ)_ПЩДДУЦ+_ЩЦП_+ЩП+_Ц№НЩ_+"ЕН№"
- "))))))"
- "нііііііііііііііііііііііііііііі"
- "ахвхвахвах"
- "пхааххахах"
- "ахаххаххаха"
- "хахахахахахахв"
- "ахахахах"
- "бляяяяяя"
- "авхахаххаахахвхахах"
- "сххахахаха"
- "єєєє"
- "єєєєєєєєє"
- "хаахахахха"
- "ахаахаахааа"
- "аххахахахахах"
- "єсхпхпхп"
- "аххахахахахахахаха"
- "хаахахаххахахахаахах"

All Caps:
- "ДУШИЛКА ПІШЛА"
- "ВООООУК"
- "ПРАДА ГУЧІ?"
- "МАШАВСЕСАМА trembaaSalute"

Bot Messages:
- "StreamElements: ziuzeus за донати Ви можете змінювати перебіг гри | прайс-лист на САЙТІ - https://mine.thetremba.com"

Emote Only:
- "rap 󠀀"
- "rap rap eminemRap"

Bad Words:
- "а я не знав шо у марії мат за матом, буду знать, дякую"

Commands:
- "!айкос"
- "!рулетка 100"

*/

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

// This rule only highlights words, it doesn't move the message to spam
const highlightRule = {
  label: "🔥 Чи не на часі?",
  test: (message) => {
    const words = message.toLowerCase().match(/\p{L}+/gu) || []; // Use Unicode property escapes to correctly match words
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

// These rules will always move a message to the spam chat
const hardSpamRules = {
  botMessage: {
    label: "🤖 Фільтрувати ботяру (StreamElements)",
    test: (message, tags) => {
      const displayName = (tags['display-name'] || (tags.prefix ? tags.prefix.split('!')[0] : '')).toLowerCase();
      if (displayName === 'streamelements' || message.toLowerCase().startsWith('streamelements:')) {
        return { reason: "Бот" };
      }
      return null;
    }
  },
  mentionAndEmotes: {
    label: "📢 Фільтрувати згадки з емодзі",
    test: (message, tags, channelName, moderatorName) => {
      const mentionRegex = /@(\w+)/g;
      const mentions = (message.match(mentionRegex) || []);
      if (mentions.length === 0) return null;

      let messageWithoutMentions = message;
      mentions.forEach(mention => {
        messageWithoutMentions = messageWithoutMentions.replace(mention, '');
      });

      const cleanMessage = messageWithoutMentions.replace(/[\u{E0000}-\u{E007F}]/gu, '').trim();
      if (cleanMessage.length === 0) return null; // Only mentions, no emotes

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
      const allAreEmotes = words.every(word => nativeEmotes.has(word) || get7TVEmoteUrl(word));

      if (allAreEmotes) {
        return { reason: "Згадка + емодзі" };
      }
      return null;
    }
  },
  mentions: {
    label: "💬 Діалоги чатерсів @user",
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
    test: (message) => /[ыэёъ]/i.test(message) ? { reason: "Терористичне" } : null
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
    test: (message) => {
      const cleanMessage = message.replace(/\s/g, '');
      if (cleanMessage.length < 5) return null;

      if (/(.)\1{4,}/i.test(cleanMessage)) {
        return { reason: "Повтори" };
      }

      const uniqueChars = new Set(cleanMessage.toLowerCase().split('')).size;

      if (cleanMessage.length >= 6 && uniqueChars <= 2) {
        return { reason: "Повтори" };
      }

      if (cleanMessage.length >= 8 && uniqueChars <= 3) {
        return { reason: "Повтори" };
      }

      const ratio = uniqueChars / cleanMessage.length;
      if (cleanMessage.length > 12 && ratio < 0.3) {
        return { reason: "Повтори" };
      }
      return null;
    }
  },
  gibberish: {
    label: "⌨️ Фільтрувати нісенітниці",
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

export const spamRuleDefinitions = { ...hardSpamRules, notInTime: highlightRule };

export function getSpamResult(message, tags, channelName, currentUserName, settings) {
  for (const ruleKey in hardSpamRules) {
    if (settings.rules[ruleKey]) {
      const result = hardSpamRules[ruleKey].test(message, tags, channelName, currentUserName);
      if (result) return result;
    }
  }

  if (settings.rules.notInTime) {
    return highlightRule.test(message);
  }

  return null;
}
