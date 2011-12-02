#!/usr/bin/env ruby
# encoding: utf-8

require_relative 'lib/fourcat.rb'

include Fourcat

# Application root
approot = File.expand_path(File.dirname(__FILE__))

# Sleep time for the watchdog thread
SLEEP_TIME = 60

# Configuration file
config_file = File.join(approot, 'config.rb')

log_dir = File.join(approot, 'logs')
log_file = File.join(log_dir,'fourcat.cluster.log')

FileUtils.mkdir(log_dir) unless File.directory?(log_dir)

catalogs  = {}
workers   = {}
deleted   = []
created   = []

@log = Logger.new(log_file, 1, 128000)
@log.level = Logger::INFO

@log.info 'Starting'

# Creates a thread for a given catalog
def spawn_worker(catalog)
  Thread.new do
    begin
      catalog.run
    rescue CatalogHalt;
    rescue
      @log.error("/#{board}/ exited: #{$!.message}: #{$!.backtrace.first}")
    end
  end
end

# Loads the configuration file
def load_config(cfg)
  begin
    eval File.open(cfg, 'r:UTF-8') { |f| '{' + f.read + '}' }
  rescue Exception
    @log.error("Bad config file: #{$!.message}")
    false
  end
end

exit unless config = load_config(config_file)

Catalog.defaults.merge!(config[:defaults]) if config[:defaults]

gentle = (gentle = ARGV.index('-gentle')) ? ARGV[gentle + 1].to_i : false

@log.info "Worker creation interval set to #{gentle} seconds" if gentle

config[:boards].each do |board, opts|
  begin
      catalogs[board] = Catalog.new(board, opts)
  rescue
    @log.fatal("/#{board}/ startup failed: #{$!.message}")
    exit
  end
  workers[board] = spawn_worker(catalogs[board])
  sleep gentle if gentle
end

watchdog = Thread.new do
  loop do
    sleep(SLEEP_TIME)
    
    if workers.empty?
      @log.info('No more workers to watch, exiting')
      @log.close
      exit
    end
    
    deleted.each do |board|
      catalogs.delete(board)
      workers.delete(board)
    end
    
    created.each do |board|
      workers[board] = nil
    end
    
    workers.each do |board, worker|
      unless worker && worker.alive?
        @log.info("Starting /#{board}/")
        catalogs[board] = Catalog.new(board, config[:boards][board])
        workers[board] = spawn_worker(catalogs[board])
      end
    end
    
    deleted = []
    created = []
  end
end

Signal.trap('HUP') do
  @log.info 'Checking for changes in the configuration file'
  new_config = load_config(config_file)
  next if !config
  new_config[:boards].each do |board, opts|
    if !config[:boards][board]
      created << board
      @log.info "Creation scheduled for #{board}"
    elsif config[:boards][board] != opts
      catalogs[board].halt
      @log.info "Restart scheduled for #{board}"
    end
  end
  (config[:boards].keys - new_config[:boards].keys).each do |board|
    catalogs[board].halt
    deleted << board
    @log.info "Deletion scheduled for #{board}"
  end
  config[:boards] = new_config[:boards]
end if Signal.list.include?('HUP')

watchdog.join
