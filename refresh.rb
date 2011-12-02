#!/usr/bin/env ruby
# encoding: utf-8

require_relative 'lib/fourcat.rb'

# Application root
approot = File.expand_path(File.dirname(__FILE__))

Signal.trap('INT') do
  puts 'Good bye'
  exit
end

unless board = ARGV[0]
  puts "Usage\t: #{File.basename($0)} board"
  puts "\nIf config.rb is found in the current directory, the script will use it."
  exit
end

if File.file?(config_file = File.join(approot, 'config.rb'))
  puts 'Using config.rb'
  config = eval File.open(config_file, 'r:UTF-8') { |f| '{' + f.read + '}' }
else
  config = {}
end

if config[:boards]
  opts = config[:boards][board] || config[:boards][board.to_sym] || {}
else
  opts = {}
end

opts[:debug] = true

Fourcat::Catalog.defaults.merge!(config[:defaults]) if config[:defaults]

Fourcat::Catalog.new(board, opts).run_once
