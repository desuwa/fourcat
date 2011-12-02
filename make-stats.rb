#!/usr/bin/env ruby
require 'erubis'
require 'json'
require 'zlib'

# Application root
approot = File.expand_path(File.dirname(__FILE__))

# Directory containing daily stats files
stats_dir = File.join(approot, 'stats')

# Template for stats page generation
template_file = File.join(approot, 'views', 'stats.html')

# Output HTML file
output_file = File.join(approot, 'public', 'stats.html')

# Compress output?
precompress = false

# ----------------

stats_files = Dir.glob(stats_dir + '/*-daily')

output = []

stats_files.each do |filename|
	output << File.open(filename, 'r') do |f|
		'"' + File.basename(filename).split('-')[0] + '":' + f.read
	end
end

output = output.empty? ? false : "{\n" + output.join(",\n") + "\n}"

html = Erubis::FastEruby.new(
	File.open(template_file, 'r:UTF-8') { |f| f.read }
).evaluate(:output => output)

File.open(output_file, 'w:UTF-8') { |f| f.write html }

Zlib::GzipWriter.open(output_file + '.gz') { |f| f.write html } if precompress

puts "Done"
