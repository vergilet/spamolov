# frozen_string_literal: true

require 'json'

# A Ruby port of the filter.js logic.
module ChatFilter
  # Load the vocabulary from the JS file. In a real app, this would come from a database.
  raw_js = File.read(File.join(__dir__, 'vocabulary.js'))
  json_string = raw_js.match(/=\s*(\[.*\]);/m)[1].gsub(/(\w+):/, '"\1":')
  BAD_WORDS_PAIRS = JSON.parse(json_string)
  BAD_WORDS_LOOKUP = BAD_WORDS_PAIRS.each_with_object({}) do |pair, acc|
    key = pair.keys.first
    acc[key.downcase] = pair[key]
  end

  # Regex constants
  INVISIBLE_CHARS_REGEX = /[\u{E0000}-\u{E007F}\u200B-\u200D\uFEFF]/
  EMOJI_PRESENTATION_REGEX = /\p{Emoji_Presentation}/
  RUSSIAN_CHARS_REGEX = /[ыэёъ]/i
  COMMAND_REGEX = /^![a-zA-Z\u0400-\u04FF0-9_]+/
  LINK_REGEX = /(https?:\/\/[^\s]+|\w+\.\w+\/\S+)/i
  REPEATED_4_PLUS_CHARS_REGEX = /([\p{L}\p{N}])\1{3,}/
  REPEATED_2_OR_3_CHAR_GROUP_REGEX = /(.{2,3})\1{2,}/
  FOREIGN_CHARS_REGEX = /[^a-zA-Z\u0400-\u04FFʼ0-9\s\p{P}\p{S}]/u

  # Stateful tracking
  @recent_big_messages = []
  @recent_user_messages = {}

  def self.get_spam_result(message, tags, channel_name, current_user_name, settings)
    # This is a simplified port. A full implementation would check settings.rules for each rule.
    # For now, we assume all rules are enabled.
    
    # Note: Emote-related rules are omitted as they rely on client-side 7TV emote data.

    [
      method(:single_char_message),
      method(:gifted_subs),
      method(:user_repeat),
      method(:bot_message),
      method(:mentions),
      method(:foreign_lang),
      method(:russian_chars),
      method(:command_only),
      method(:link),
      method(:all_caps),
      method(:repetitive_chars),
      method(:gibberish),
      method(:copypasta)
    ].each do |rule|
      result = rule.call(message, tags, channel_name, current_user_name)
      return result if result
    end

    nil
  end

  def self.get_highlight_details(message, channel_name, current_user_name, settings)
    details = { highlightType: nil, wordsToHighlight: [] }
    lower_message = message.downcase
    current_user = current_user_name&.downcase || ''
    channel = channel_name&.downcase || ''

    details[:highlightType] = 'CurrentUser' if current_user && lower_message.include?("@#{current_user}")
    details[:highlightType] = 'Channel' if channel && lower_message.include?("@#{channel}")

    # Highlight rule for Russian words
    found_words = []
    message.downcase.scan(/\p{L}+/).each do |word|
      if BAD_WORDS_LOOKUP[word] && !found_words.any? { |fw| fw['ru'] == word }
        found_words << { 'ru' => word, 'ua' => BAD_WORDS_LOOKUP[word] }
      end
    end

    details[:wordsToHighlight] = found_words if found_words.any?
    details
  end

  # --- Individual Rule Implementations ---

  def self.single_char_message(message, *, **)
    clean_message = message.gsub(INVISIBLE_CHARS_REGEX, '').strip
    if clean_message.length == 1 && !clean_message.match?(EMOJI_PRESENTATION_REGEX)
      { reason: 'Один символ' }
    end
  end

  def self.gifted_subs(_message, tags, *, **)
    msg_id = tags['msg-id']
    if msg_id == 'subgift' || msg_id == 'submysterygift'
      { reason: 'Подарунок' }
    end
  end

  def self.user_repeat(message, tags, *, **)
    user_id = tags['user-id']
    return unless user_id

    now = Time.now.to_f
    clean_message = message.gsub(INVISIBLE_CHARS_REGEX, '').strip
    last_message = @recent_user_messages[user_id]

    if last_message && last_message[:text] == clean_message && (now - last_message[:timestamp] < 120)
      return { reason: 'Повтор' }
    end

    @recent_user_messages[user_id] = { text: clean_message, timestamp: now }
    nil
  end

  def self.bot_message(message, tags, *, **)
    display_name = (tags['display-name'] || '').downcase
    if display_name == 'streamelements' || message.downcase.start_with?('streamelements:')
      { reason: 'Бот' }
    end
  end

  def self.mentions(message, _tags, channel_name, current_user_name)
    mentions = message.scan(/@(\w+)/).flatten.map(&:downcase)
    return if mentions.empty?

    allowed_mentions = [current_user_name&.downcase, channel_name&.downcase].compact
    return if mentions.any? { |m| allowed_mentions.include?(m) }

    { reason: 'Діалог' }
  end

  def self.foreign_lang(message, *, **)
    clean_message = message.gsub(INVISIBLE_CHARS_REGEX, '').strip.gsub(LINK_REGEX, '').gsub(COMMAND_REGEX, '')
    if clean_message.match?(FOREIGN_CHARS_REGEX)
      { reason: 'Іноземне' }
    end
  end

  def self.russian_chars(message, *, **)
    { reason: 'Терористичне' } if message.match?(RUSSIAN_CHARS_REGEX)
  end

  def self.command_only(message, *, **)
    { reason: 'Команда' } if message.strip.match?(COMMAND_REGEX)
  end

  def self.link(message, *, **)
    { reason: 'Посилання' } if message.match?(LINK_REGEX)
  end

  def self.all_caps(message, *, **)
    # Simplified version for brevity
    clean_message = message.gsub(INVISIBLE_CHARS_REGEX, '').strip
    letters = clean_message.scan(/\p{L}/)
    return if letters.length < 4

    uppercase_letters = clean_message.scan(/\p{Lu}/)
    ratio = uppercase_letters.length.to_f / letters.length
    { reason: 'КАПС' } if ratio > 0.75
  end

  def self.repetitive_chars(message, *, **)
    clean_message = message.gsub(INVISIBLE_CHARS_REGEX, '').strip
    unique_chars = clean_message.split('').uniq
    return { reason: 'Сміття' } if unique_chars.size == 1 && clean_message.length > 3

    message_without_spaces = clean_message.gsub(/\s+/, '').downcase
    len = message_without_spaces.length
    return if len < 4

    alphanumeric_only = message_without_spaces.gsub(/[^a-zA-Z0-9а-яА-ЯіІїЇєЄґҐ]/, '')
    return { reason: 'Сміття' } if alphanumeric_only.match?(REPEATED_4_PLUS_CHARS_REGEX)
    return { reason: 'Сміття' } if message_without_spaces.match?(REPEATED_2_OR_3_CHAR_GROUP_REGEX)

    if len >= 7
      unique_chars_count = message_without_spaces.split('').uniq.size
      return { reason: 'Сміття' } if unique_chars_count <= 2 && len >= 7
      return { reason: 'Сміття' } if unique_chars_count <= 3 && len >= 10
      return { reason: 'Сміття' } if len > 12 && (unique_chars_count.to_f / len) < 0.35
    end
    nil
  end

  def self.gibberish(message, *, **)
    clean_message = message.gsub(/\s+/, '')
    return if clean_message.length < 10

    non_alphanum = clean_message.scan(/[^a-zA-Z\u0400-\u04FF0-9]/).length
    return { reason: 'Нісенітниця' } if (non_alphanum.to_f / clean_message.length) > 0.6
    return { reason: 'Нісенітниця' } if !message.include?(' ') && message.length > 25

    vowels = (clean_message.scan(/[аеиоуієїяюaeiou]/i) || []).length
    consonants = (clean_message.scan(/[бвгґджзйклмнпрстфхцчшщbcdfghjklmnpqrstvwxyz]/i) || []).length
    if vowels + consonants > 10
      if (vowels.to_f / (consonants + 1)) < 0.1 || (consonants.to_f / (vowels + 1)) > 8
        return { reason: 'Нісенітниця' }
      end
    end
    nil
  end

  def self.copypasta(message, *, **)
    now = Time.now.to_f
    @recent_big_messages.reject! { |msg| now - msg[:timestamp] > 60 }

    clean_message = message.gsub(INVISIBLE_CHARS_REGEX, '').strip
    if clean_message.length >= 50
      if @recent_big_messages.any? { |msg| msg[:text] == clean_message }
        return { reason: 'Паста' }
      end
      @recent_big_messages << { text: clean_message, timestamp: now }
    end
    nil
  end
end
