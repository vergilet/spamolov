# frozen_string_literal: true

require 'async/http'
require 'async/websocket'
require 'json'
require_relative '../filter'
require_relative 'emote_handler'

# This class handles a single connection to a Twitch channel
class TwitchIrcClient
  BADGE_SVGS = {
    'broadcaster' => '<svg class="badge" style="color: #ef4444;" fill="currentColor" viewBox="0 0 20 20"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"></path><path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.523 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"></path></svg>',
    'vip' => '<svg class="badge" style="color: #ec4899;" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path></svg>',
    'moderator' => '<svg class="badge" style="color: #22c55e;" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clip-rule="evenodd"></path></svg>',
    'subscriber' => '<svg class="badge" style="color: #f59e0b;" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>'
  }.freeze

  def initialize(client_ws, channel, username, settings)
    @client_ws = client_ws
    @channel = channel
    @username = username
    @settings = settings
    @twitch_ws = nil
    @emote_handler = EmoteHandler.new
  end

  def run
    puts "Loading 7TV emotes for ##{@channel}..."
    @emote_handler.load_emotes(@channel)
    puts "Emotes loaded."

    endpoint = Async::HTTP::Endpoint.parse('wss://irc-ws.chat.twitch.tv:443')
    Async::WebSocket::Client.connect(endpoint) do |twitch_ws|
      @twitch_ws = twitch_ws
      nick = "justinfan#{rand(100_000)}"
      puts "Connecting to Twitch as #{nick} and joining ##{@channel}"
      @twitch_ws.write "CAP REQ :twitch.tv/tags twitch.tv/commands\r\n"
      @twitch_ws.write "PASS oauth:dummytoken\r\n"
      @twitch_ws.write "NICK #{nick}\r\n"
      @twitch_ws.write "JOIN ##{@channel}\r\n"
      @twitch_ws.flush
      puts "Twitch connection established, waiting for messages..."

      while (message = @twitch_ws.read)
        message.buffer.split("\r\n").each do |line|
          handle_irc_message(line)
        end
      end
    end
  rescue => e
    puts "Twitch connection error: #{e.message}"
    @client_ws.write({ type: 'error', payload: "Error connecting to ##{@channel}. Check channel name." }.to_json)
    @client_ws.flush
  end

  private

  def handle_irc_message(line)
    parsed = parse_irc(line)
    return if parsed.nil? || parsed[:command].nil?

    case parsed[:command]
    when 'PING'
      @twitch_ws.write "PONG :tmi.twitch.tv\r\n"
      @twitch_ws.flush
    when 'PRIVMSG'
      process_chat_message(parsed)
    when 'USERNOTICE'
      process_chat_message(parsed, system_message: true)
    when 'NOTICE'
      if parsed.dig(:params, 1)&.include?('Login authentication failed')
        @client_ws.write({ type: 'error', payload: "Failed to join. Channel may not exist." }.to_json)
        @client_ws.flush
        @twitch_ws.close
      end
    end
  end

  def process_chat_message(parsed, system_message: false)
    content = system_message ? parsed.dig(:tags, 'system-msg')&.gsub('\\s', ' ') : parsed.dig(:params, 1)
    return if content.nil? || content.empty?

    parsed_content = @emote_handler.parse_message(content)

    message_payload = {
      displayName: parsed.dig(:tags, 'display-name') || parsed.dig(:tags, 'login') || parsed[:prefix]&.split('!')&.first,
      color: parsed.dig(:tags, 'color') || '#FFFFFF',
      content: parsed_content,
      badges: create_badge_icons(parsed.dig(:tags, 'badges')),
      tags: parsed[:tags],
      isSystemMessage: system_message
    }

    spam_result = ChatFilter.get_spam_result(content, message_payload[:tags], @channel, @username, @settings)
    highlight_details = ChatFilter.get_highlight_details(content, @channel, @username, @settings)

    response = {
      type: 'message',
      category: spam_result ? 'spam' : 'main',
      payload: message_payload.merge(
        spam_reason: spam_result ? spam_result[:reason] : nil,
        highlight_details: highlight_details
      )
    }
    @client_ws.write(response.to_json)
    @client_ws.flush
  end

  def create_badge_icons(badges_str)
    return '' if badges_str.nil? || badges_str.empty?

    badges_str.split(',').map do |part|
      badge_name = part.split('/').first
      BADGE_SVGS[badge_name] || ''
    end.join
  end

  def parse_irc(line)
    parsed = { tags: {}, prefix: nil, command: nil, params: [] }
    position = 0

    if line[position] == '@'
      next_space = line.index(' ', position)
      return nil if next_space.nil?
      tags_part = line[1...next_space]
      tags_part.split(';').each do |tag|
        key, value = tag.split('=', 2)
        parsed[:tags][key] = value || true
      end
      position = next_space + 1
    end

    position += 1 while line[position] == ' '

    if line[position] == ':'
      next_space = line.index(' ', position)
      return nil if next_space.nil?
      parsed[:prefix] = line[(position + 1)...next_space]
      position = next_space + 1
      position += 1 while line[position] == ' '
    end

    next_space = line.index(' ', position)
    if next_space.nil?
      parsed[:command] = line[position..-1] if line.length > position
      return parsed
    end

    parsed[:command] = line[position...next_space]
    position = next_space + 1

    while position < line.length
      if line[position] == ':'
        parsed[:params] << line[(position + 1)..-1]
        break
      end

      next_space = line.index(' ', position)
      if next_space
        parsed[:params] << line[position...next_space]
        position = next_space + 1
      else
        parsed[:params] << line[position..-1]
        break
      end
    end

    parsed
  end
end
