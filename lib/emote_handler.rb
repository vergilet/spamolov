# frozen_string_literal: true

require 'net/http'
require 'json'

# Fetches and manages 7TV emotes
class EmoteHandler
  SEVENTV_GLOBAL_EMOTES_URL = 'https://7tv.io/v3/emote-sets/global'
  SEVENTV_CHANNEL_EMOTES_URL = 'https://7tv.io/v3/users/twitch/{channel_id}'

  def initialize
    @emotes = {}
    @user_id_cache = {}
  end

  # For a given message, returns an array of text and emote segments
  def parse_message(message)
    message.split(' ').map do |word|
      url = @emotes[word]
      if url
        { type: 'emote', name: word, url: url }
      else
        { type: 'text', content: word }
      end
    end
  end

  def load_emotes(channel_name)
    load_global_emotes
    load_channel_emotes(channel_name)
  end

  private

  def fetch_json(url)
    uri = URI(url)
    response = Net::HTTP.get_response(uri)
    return nil unless response.is_a?(Net::HTTPSuccess)

    JSON.parse(response.body)
  end

  def load_global_emotes
    data = fetch_json(SEVENTV_GLOBAL_EMOTES_URL)
    return unless data && data['emotes']

    data['emotes'].each do |emote|
      name = emote['name']
      url = emote_url(emote['id'])
      @emotes[name] = url
    end
  end

  def load_channel_emotes(channel_name)
    # 7TV API requires the Twitch User ID, not the login name.
    # This is a placeholder for fetching the user ID.
    # In a real application, you would use the Twitch API here.
    user_id = get_twitch_user_id(channel_name)
    return unless user_id

    url = SEVENTV_CHANNEL_EMOTES_URL.gsub('{channel_id}', user_id)
    data = fetch_json(url)
    return unless data && data['emote_set'] && data['emote_set']['emotes']

    data['emote_set']['emotes'].each do |emote|
      name = emote['name']
      url = emote_url(emote['data']['id'])
      @emotes[name] = url
    end
  end
  
  # This is a temporary solution. A robust implementation would use the Twitch Helix API
  # and handle rate limits and caching.
  def get_twitch_user_id(channel_name)
    return @user_id_cache[channel_name] if @user_id_cache[channel_name]

    # This is a public, undocumented API used by 7TV's website.
    # It's not ideal but avoids needing a full Twitch API client with OAuth for this example.
    url = "https://7tv.io/v3/users/twitch?login=#{channel_name}"
    data = fetch_json(url)
    
    if data && data['user'] && data['user']['id']
        user_id = data['user']['id']
        @user_id_cache[channel_name] = user_id
        return user_id
    end

    nil
  end

  def emote_url(id)
    # 7TV provides multiple image sizes, 1x is the smallest.
    "https://cdn.7tv.app/emote/#{id}/1x.webp"
  end
end
