#!/usr/bin/env ruby

require 'daemons'

Daemons.run File.join(File.dirname(__FILE__), 'run.rb')
