# /Users/vergsparda/projects/spamolov/server.rb
require 'sinatra'
require 'async/websocket'
require 'async/websocket/adapters/rack'
require 'json'

require_relative 'lib/twitch_client'

set :server, :falcon
set :public_folder, File.dirname(__FILE__)

get '/' do
  send_file 'index.html'
end

get '/websocket' do
  response = Async::WebSocket::Adapters::Rack.open(request.env) do |browser_ws|
    begin
      puts "WebSocket connection open"

      # Wait for the initial 'join' message from the client
      if message = browser_ws.read
        data = JSON.parse(message)
        puts "Received from client: #{data}"

        if data['action'] == 'join'
          # The TwitchIrcClient will now run in its own async task,
          # handling the connection to Twitch and forwarding messages.
          TwitchIrcClient.new(
            browser_ws,
            data['channel'],
            data['user'],
            {} # Placeholder for settings
          ).run
        end
      end
    rescue => e
      puts "WebSocket connection failed or closed: #{e.message}"
    end
  end

  response || [400, {}, ["Please connect using a WebSocket."]]
end
