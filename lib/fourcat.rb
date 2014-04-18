# encoding: utf-8
require 'fileutils'
require 'json'
require 'logger'
require 'net/http'
require 'nokogiri'
require 'ostruct'
require 'time'
require 'uri'
require 'zlib'

module Fourcat

class Catalog
  
  VERSION     = '3.7.0'
  
  BB_TAGS     = { 
    '[spoiler]' => '<s>',
    '[/spoiler]' => '</s>'
  }
  
  ENTITIES    = { '<' => '&lt;', '>' => '&gt;' }
  
  @defaults = {
    :approot            => File.expand_path(File.dirname(__FILE__) + '/../'),
    :loglevel           => Logger::WARN,
    :title              => nil,
    :public_dir         => nil,
    :default_name       => 'Anonymous',
    :precompress        => false,
    :stats              => false,
    :archive            => nil,
    :archive_ssl        => false,
    :debug              => false,
    :text_only          => false,
    :nsfw               => false,
    :tagged             => false,
    :es_host            => 'localhost:9200',
    :local_host         => nil,
    :filename_tag       => false,
    :skipwords          => nil,
    :deep_search        => false,
    :activity_range     => nil,
    :write_html         => true,
    :html_template      => 'catalog.html',
    :write_replies      => true,
    :image_replies      => false,
    :write_rss          => false,
    :write_json         => false,
    :rss_desc           => nil,
    :web_uri            => nil,
    :content_uri        => nil,
    :user_agent         => "4cat/#{VERSION}",
    :spoiler_text       => false,
    :spoiler_size       => [100, 100],
    :thumb404_size      => [125, 125],
    :remove_exif        => false,
    :remove_oekaki      => false,
    :remove_fortune     => false,
    :country_flags      => false,
    :req_delay          => 1.0,
    :req_delay_media    => 0.5,
    :req_timeout        => 30,
    :req_timeout_media  => 10,
    :retries            => 3,
    :refresh_delay      => 60,
    :refresh_range      => [30, 120],
    :refresh_step       => 10,
    :refresh_thres      => 5,
    :use_ssl            => false,
    :proxy_addr         => nil,
    :proxy_port         => nil,
    :workers_limit      => 3,
  }
  
  def self.defaults=(opts)
    @defaults = opts
  end
  
  def self.defaults
    @defaults
  end
  
  attr_accessor :opts
  
  begin
    require_relative 'fourcat-es.rb'
    include Fourcat::ES
  rescue LoadError
  end
  
  # Constructor
  #
  # @param [String, Symbol] board
  #   Remote board slug, ex: :jp or 'jp'
  #
  # @param [Hash] opts
  #   Options, will be merged with the defaults
  #
  # @option opts [String] approot
  #   Application root
  #
  # @option opts [Fixnum] loglevel
  #   Logging severity, defaults to Logger::WARN
  #
  # @option opts [true, false] use_json_api
  #   Use the JSON API. Defaults to false (parse the HTML)
  #
  # @option opts [String] slug
  #   Local board slug, defaults to the remote slug
  #
  # @option opts [String] title
  #   Board's title, defaults to '/:slug/ - Catalog'
  #
  # @option opts [String] public_dir
  #   Content directory.
  #   Defaults to 'approot/public/'
  #
  # @option opts [String] default_name
  #   Default author for threads
  #
  # @option opts [true, false] precompress
  #   Compress output, defaults to false
  #
  # @option opts [true, false] stats
  #   Compile statistics, defaults to false
  #
  # @option opts [String, nil] proxy
  #   Fuuka style archive URL. ex: 'http://archive.example.com/jp/thread/'
  #
  # @option opts [true, false] debug
  #   Log everything to STDERR
  #
  # @option opts [true, false] text_only
  #   Don't fetch thumbnails. Defaults to false
  #
  # @option opts [true, false] write_html
  #   Generate HTML, requires 'erubis' gem
  #
  # @option opts [String] html_template
  #   Erubis template for HTML generation
  #
  # @option opts [true, false] write_rss
  #   Generate RSS Feed, requires 'nokogiri' gem, 'web_uri' needs to be set
  #
  # @option opts [true, false] write_json
  #   Generate JSON
  #
  # @option opts [String] rss_desc
  #   RSS feed description, defaults to 'Meanwhile on /:slug/'
  #
  # @option opts [String] web_uri
  #   Catalog root URL, required for RSS feeds, ex: 'http://catalog.neet.tv/'
  #
  # @option opts [String] content_uri
  #   Thumbnails server URL, defaults to nil, ex: 'http://static.neet.tv/'
  #
  # @option opts [String] user_agent
  #   User Agent string, defaults to '4cat/{VERSION}'
  #
  # @option opts [String, false] spoiler_text
  #   Handle spoiler tags. Defaults to false.
  #
  # @option opts [true, false] remove_exif
  #   Remove EXIF meta. Defaults to false.
  #
  # @option opts [true, false] remove_oekaki
  #   Remove Oekaki meta. Defaults to false.
  #
  # @option opts [true, false] remove_fortune
  #   Remove Fortune meta. Defaults to false.
  #
  # @option opts [true, false] country_flags
  #   Display country flags.
  #
  # @option opts [true, false] filename_tag
  #   Generate a filterable tags from filenames.
  #
  # @option opts [Numeric] req_delay
  #   Delay in seconds between requests, defaults to 1.0
  #
  # @option opts [Numeric] req_delay_media
  #   Delay in seconds between requests for files, defaults to 0.5
  #
  # @option opts [Numeric] req_timeout Socket open/read timeouts in seconds,
  #   defaults to 30
  # 
  # @option opts [Numeric] req_timeout_media Same as req_timeout but for files,
  #   defaults to 10
  # 
  # @option opts [String] local_host Bind to a specific IP
  # 
  # @option opts [String] proxy_addr Proxy IP
  # 
  # @option opts [Numeric] proxy_port Proxy port
  # 
  # @option opts [Fixnum] workers_limit
  #   Maximum number of HTTP worker threads,
  #   prevents hammering on laggy days. Defaults to 3
  #
  # @option opts [Integer] retries
  #   Number of retries before dropping the page or thumbnail, defaults to 2
  #
  # @option opts [true,false] no_partial
  #   Aborts the refresh cycle if a page can't be retrived and if the refresh
  #   delay is less than the maximum allowed. Defaults to true
  #
  # @option opts [Array<Integer>] page_count
  #   Maximum number of pages to fetch for each run.
  #   The default value of [16, 2] means that during a refresh cycle,
  #   the crawler will first fetch 16 pages, then will get the first 2 pages.
  #   This is fine for moderately fast boards, faster boards may need
  #   additional runs in order to avoid missing threads.
  #
  # @option opts [Integer] page_size
  #   Number of treads per page. Defaults to 15
  #
  # @option opts [Numeric] refresh_delay
  #   Base refresh delay in seconds, defaults to 60
  #
  # @option opts [Array(Numeric, Numeric)] refresh_range
  #   Min and max refresh delays in seconds, defaults to [60, 300]
  #
  # @option opts [Numeric] refresh_step
  #   Refresh delay modifier in seconds. For every new thread crawled,
  #   the refresh delay is reduced by refresh_step. If no new threads were
  #   found the refresh delay is increased by refresh_step. Defaults to 10
  #
  # @option opts [Integer, nil] refresh_thres
  #   Reduces the refresh delay by 'refresh_delay' if the number of new replies
  #   is greater than the 'refresh_thres'. Defaults to nil (disabled)
  #
  # @option opts [String, false] use_ssl
  #   Use HTTP/SSL. Defaults to false.
  #
  # @example Initialize a catalog
  #   catalog = Catalog.new('jp', {
  #     title: '/jp/ - Neet Pride Worldwide',
  #     refresh_delay: 120,
  #     refresh_range: [ 120, 300 ]
  #   })
  #
  def initialize(board, opts = {})
    # Too lazy to validate every option properly
    raise "Invalid board #{board}" if (@board = board.to_s).empty?
    
    @opts = OpenStruct.new(
      opts ? self.class.defaults.merge(opts) : self.class.defaults
    )
    
    @opts.slug ||= @board # Local short name for the board
    
    @opts.title ||= "/#{@opts.slug}/ - Catalog"
    
    if @opts.public_dir
      @opts.public_dir << '/' if @opts.public_dir[-1, 1] != '/'
    else
      @opts.public_dir = File.join(@opts.approot, '/public/')
    end
    
    if @opts.web_uri
      @opts.web_uri << '/' if @opts.web_uri[-1, 1] != '/'
    end
    
    if @opts.content_uri
      @opts.content_uri << '/' if @opts.content_uri[-1, 1] != '/'
    end
    
    @rss_content_uri = @opts.content_uri || @opts.web_uri
    
    # Board directory
    @board_dir = @opts.public_dir + @opts.slug + '/'
    
    # Thumbnails directory
    @thumbs_dir = @board_dir + 'src/'
    
    # Templates directory
    @templates_dir = File.join(@opts.approot, '/views/')
    
    # Stats directory
    @stats_dir = File.join(@opts.approot, '/stats/')
    
    if @opts.write_replies
      # Replies directory
      @replies_dir = @board_dir + 'replies/'
      @replies_stamps = {}
    end
    
    if @opts.write_html
      require 'erubis'
      @tpl_file = @templates_dir << @opts.html_template
      unless File.exists?(@tpl_file)
        raise "Can't find template #{@tpl_file}" 
      end
      @tpl_mtime = File.mtime(@tpl_file)
      @template = load_template(@tpl_file)
    end
    
    if @opts.write_rss 
      raise "RSS writer: web_uri can't be empty" if !@opts.web_uri
      @opts.rss_desc ||= "Meanwhile, on /#{@opts.slug}/"
    end
    
    @headers = {
      'User-Agent' => @opts.user_agent,
      'Accept-Encoding' => 'gzip'
    }
    
    # Local HTML file
    @board_file = @board_dir + 'index.html'
    
    # Local RSS file
    @rss_file = @board_dir + 'feed.rss'
    
    # Local JSON file
    @json_file = @board_dir + 'threads.json'
    
    @last_refresh_time = 0
    
    # Previous refresh cycle highest thread and reply ids
    @last_high_thread = 0
    @last_high_reply = 0
    @new_threads_count = 0
    
    # For stats tracking
    @skip_stats = true
    @last_hour = false
    
    # Thumbnail server url for spoiler revealing
    @thumbs_url = "//thumbs.4chan.org/#{@opts.slug}/thumb/"
    
    # Checking for the spoiler file (spoiler-SLUG.png)
    @spoiler_pic =
      if File.exist?(@opts.public_dir + "images/spoiler-#{@opts.slug}.png")
        "spoiler-#{@opts.slug}.png"
      else
        'spoiler-default.png'
      end
    
    # Checking for the placeholder file (thumb-404-SLUG.png)
    @thumb_404 =
      if File.exist?(@opts.public_dir + "images/thumb-404-#{@opts.slug}.png")
        "thumb-404-#{@opts.slug}.png"
      else
        'thumb-404.png'
      end
    
    if @opts.use_ssl
      require 'net/https'
    end
    
    if @opts.tagged || @opts.activity_range
      @elasticsearch = Elasticsearch::Client.new(host: @opts.es_host)
      
      @tag_status = {}
      @global_terms = {}
      @global_terms_timestamp = 0
    end
    
    @api_server = 'api.4chan.org'
    
    # jsonified threadlist cache for when write_json and write_html are true
    @json_cache = nil
    
    # Last successful write time (Time UTC)
    @mtime = 0
    
    @thread_cache = {}
    
    @halt = false
  end
  
  # Runs the main loop
  def run
    init_logger
    init_dirs
    
    @log.unknown "Running 4cat #{VERSION}"
    
    init_stats if @opts.stats
    
    loop do
      delta = Time.now.to_i - @last_refresh_time
      if delta < @opts.refresh_delay
        sleep(@opts.refresh_delay - delta)
      end
      @last_refresh_time = Time.now.to_i
      begin
        refresh
        raise CatalogHalt if @halt
      rescue Exception => e
        if e.kind_of?(CatalogHalt)
          @log.unknown 'Halting'
          raise e
        else
          @log.error get_error(e)
        end
      end
    end
    
    cleanup
  end
  
  # Runs the crawler once
  def run_once
    init_logger
    init_dirs
    refresh
    cleanup
  end
  
  # Tells the crawler to stop after the current refresh cycle
  def halt
    @halt = true
  end
  
  # Adjusts the refresh speed
  # @param [Fixnum] new_replies_count New replies since the last refresh cycle
  def adjust_speed(new_replies_count)
    if new_replies_count > @opts.refresh_thres
      multiplier = new_replies_count / @opts.refresh_thres
      @opts.refresh_delay -= @opts.refresh_step * multiplier
    else
      @opts.refresh_delay += @opts.refresh_step
    end
    
    if @opts.refresh_delay < @opts.refresh_range[0]
      @opts.refresh_delay = @opts.refresh_range[0]
    elsif @opts.refresh_delay > @opts.refresh_range[1]
      @opts.refresh_delay = @opts.refresh_range[1]
    end
  end
  
  # Cleans up stuff
  def cleanup
    @log.close unless @opts.debug
    @stats_io.close if @stats_io
  end
  
  # HTTP requests
  # @param [Net::HTTP] http HTTP object to use for the connection
  # @param [String] path
  # @return [String] Response body
  def fetch(http, path)
    if @opts.use_ssl
      http.use_ssl = true
      http.verify_mode = OpenSSL::SSL::VERIFY_NONE
    end
    
    if @opts.local_host
      http.local_host = @opts.local_host
    end
    
    try = 1
    begin
      resp = http.request_get(path, @headers)
      
      if resp.code != '200'
        if resp.code == '404'
          raise HTTPNotFound, "Not Found #{http.address}#{path}"
        elsif resp.kind_of?(Net::HTTPServerError)
          raise HTTPServerError, "HTTP #{resp.code}: #{http.address}#{path}"
        end
      end
    rescue Timeout::Error, Errno::ECONNRESET, EOFError, HTTPServerError => e
      if try > @opts.retries
        raise "Skipping after #{e.message}: #{http.address}#{path}"
      end
      @log.debug "Retrying after #{e.message} (#{try}): #{http.address}#{path}"
      try += 1
      sleep(@opts.req_delay)
      retry
    end
    resp
  end
  
  def get_catalog
    http = Net::HTTP.new(@api_server, nil, @opts.proxy_addr, @opts.proxy_port)
    http.open_timeout = http.read_timeout = @opts.req_timeout
    
    resp = fetch(http, "/#{@opts.slug}/catalog.json")
    
    data = 
      if resp['content-encoding'] == 'gzip'
        Zlib::GzipReader.new(StringIO.new(resp.body)).read
      else
        resp.body
      end
    
    data.force_encoding(Encoding::UTF_8)
    
    data
  end
  
  # Generates an error message from an exception
  # @param [Exception] e Exception
  def get_error(e)
    "#{e.message} (#{e.backtrace.first})"
  end
  
  # Fetches a thumbnail
  # @param [String] url
  # @see #fetch
  def get_image(url)
    uri = URI.parse(url)
    http = Net::HTTP.new(uri.host, nil, @opts.proxy_addr, @opts.proxy_port)
    http.open_timeout = http.read_timeout = @opts.req_timeout_media
    fetch(http, uri.path).body
  end
  
  # Creates board specific directories
  def init_dirs
    if !File.directory?(@thumbs_dir)
      @log.debug 'Creating thumbs dir'
      FileUtils.mkdir_p(@thumbs_dir)
    end
    if @opts.write_replies && !File.directory?(@replies_dir)
      @log.debug 'Creating replies dir'
      FileUtils.mkdir_p(@replies_dir)
    end
  end
  
  # Sets up the logger object
  def init_logger
    if @opts.debug == true
      @log = Logger.new(STDERR)
      @log.level = Logger::DEBUG
    else
      log_dir = File.join(@opts.approot, 'logs')
      FileUtils.mkdir(log_dir) unless File.directory?(log_dir)
      log_file = File.join(log_dir, "fourcat.#{@opts.slug}.log")
      @log = Logger.new(log_file, 2, 262144)
      @log.level = @opts.loglevel
    end
  end
  
  # Creates or reopens the stats file
  def init_stats
    FileUtils.mkdir(@stats_dir) unless File.directory?(@stats_dir)
    
    time_now = Time.now.utc
    this_hour = time_now.hour
    last_hour_limit = time_now.to_i - 3599
    
    filename = "#{@stats_dir}#{@opts.slug}-current"
    
    mtime = 0
    
    if File.exist?(filename)
      entry = File.open(filename, 'r:UTF-8') do |f|
        f.read.split("\n")[-1].to_s.split(':')
      end
      if entry.length > 0
        mtime = entry[0].to_i
        @last_high_reply = @last_high_thread = entry[1].to_i
        @skip_stats = false
      end
    end
    
    if mtime > last_hour_limit && Time.at(mtime).utc.hour == this_hour
      @log.debug 'init_stats: reopening file'
      @last_hour = this_hour
      @stats_io = File.open(filename, 'a+:UTF-8')
    else
      @log.debug 'init_stats: creating new file'
      @stats_io = File.open(filename, 'w+:UTF-8')
    end
  end
  
  # Returns the thread list as JSON
  # @see #refresh
  def jsonify_threads(threadlist, order)
    return @json_cache if @json_cache
    
    page_size = false
    
    threads = {}
    
    threadlist.each do |id, thread|
      page_size = thread[:page_size] unless page_size
      
      th = {
        :date => thread[:date].to_i
      }
      
      th[:teaser] = thread[:teaser] || ''
      th[:author] = thread[:author] if thread[:author]
      th[:sticky] = thread[:sticky] if thread[:sticky]
      th[:w] = thread[:w]
      th[:h] = thread[:h]
      
      th[:tags] = thread[:tags] if thread[:tags]
      th[:file] = thread[:file] if thread[:file]
      
      if thread[:s]
        th[:s] = thread[:s]
        if thread[:splr]
          th[:splr] = true 
          th[:sw] = thread[:sw]
          th[:sh] = thread[:sh]
        end
      end
      
      if thread[:r] != 0
        th[:r] = thread[:r]
        th[:i] = thread[:i] if thread[:i]
      end
      
      if @opts.country_flags
        th[:loc] = thread[:loc]
        th[:locname] = thread[:locname]
      end
      
      th[:lr] = thread[:lr] if thread[:lr]
      
      th[:act] = thread[:act] if thread[:act]
      
      threads[id] = th
    end
    
    json = {
      :threads    => threads,
      :order      => order,
      :count      => threads.size,
      :slug       => @opts.slug,
      :delay      => @opts.refresh_delay,
      :anon       => @opts.default_name,
      :mtime      => @mtime.to_i,
      :pagesize   => page_size,
      :deep_search => @opts.deep_search
    }
    
    if @opts.activity_range
      json[:activity_range] = @opts.activity_range
    end
    
    if @opts.archive
      json[:proxy] = @opts.archive
      json[:proxy_ssl] = @opts.archive_ssl
    end
    
    json[:flags] = true if @opts.country_flags
    
    json[:nsfw] = true if @opts.nsfw
    
    if @opts.write_json && @opts.write_html
      @json_cache = json.to_json
      @json_cache.gsub!(/[\u2028\u2029]/, '')
      @json_cache
    else
      json.to_json.gsub(/[\u2028\u2029]/, '')
    end
  end
  
  # Generates links to threads
  # @param [Integer] id Thread id
  # @return [String] the thread's URL
  def link_to_thread(id)
    "http://boards.4chan.org/#{@board}/res/#{id}#{@opts.extension}"
  end
  
  # Creates a new erubis template from a file
  # @param [String] filename Path to the html template
  # @return [Erubis::FastEruby]
  def load_template(filename)
    Erubis::FastEruby.new(
      File.open(filename, 'r:UTF-8') { |f| f.read },
      :bufvar => '@_out_buf'
    )
  end
  
  # Removes dead thumbnails and updates the deletion queue
  # @param [Array<String>] remote an Array of absolute paths
  # @param [Array<String>] local an Array of absolute paths
  def purge_thumbnails(local, remote)
    dead = local - remote
    if dead.length > 0
      begin
        FileUtils.rm(dead, force: true)
        #@log.debug "Purged #{dead.length} dead thumbnails."
      rescue StandardError => e
        @log.error 'purge_thumbnails: ' << get_error(e)
      end
    end
  end
  
  # Updates the catalog
  def refresh
    @log.debug "Refreshing /#{@opts.slug}/"
    
    @this_high_reply = @last_high_reply
    @this_high_thread = @last_high_thread
    @new_threads_count = 0
    
    catalog = get_catalog
    threads = parse_catalog(catalog)
    
    @thread_cache = threads
    
    # Bailing out on empty threadlist
    if threads.empty?
      adjust_speed(0)
      update_stats(0, 0) if @opts.stats
      return @log.error 'Breaking on empty threadlist'
    end
    
    if @opts.tagged
      tag_threads(threads)
    end
    
    # Sorting orders
    order = {}
    
    # Bump date (natural)
    order[:alt] = threads.keys
    
    # Creation date
    order[:date] = order[:alt].sort do |x, y|
      y <=> x
    end
    
    # Reply count
    order[:r] = order[:alt].sort do |x, y|
      threads[y][:r] <=> threads[x][:r]
    end
    
    # Last reply date
    order[:lr] = order[:alt].sort do |x, y|
      threads[y][:lrdate] <=> threads[x][:lrdate]
    end
    
    # Activity
    if @opts.activity_range
      order[:act] = get_activity_order(threads, order[:alt])
    end
    
    # Fetching thumbnails
    unless @opts.text_only
      thumbnails = {}
      
      threads.each do |id, thread|
        if thread[:src]
          thumbnails["#{@thumbs_dir}#{id}.jpg".freeze] = [ thread[:src], id ]
        end
        
        if @opts.image_replies && thread[:imgs]
          i = 0
          thread[:imgs].each do |img|
            key = "#{@thumbs_dir}#{img[1]}.jpg".freeze
            # url, post id, thread id, reply index
            thumbnails[key] = [ img[0], img[1], id, img[2] ]
            i += 1
          end
        end
      end
      
      remote_thumbs = thumbnails.keys
      local_thumbs = Dir.glob("#{@thumbs_dir}*.jpg")
      new_thumbs = remote_thumbs - local_thumbs
      
      workers = {}
      active_workers = 0
      
      #@log.debug "Fetching thumbnails"
      
      new_thumbs.each do |file|
        while active_workers >= @opts.workers_limit
          sleep(@opts.req_delay)
        end
        
        th = thumbnails[file]
        # image url
        src = th[0]
        # post id
        id = th[1]
        # thread id (replies only)
        tid = th[2]
        # reply index
        rindex = th[3]
        
        #@log.debug "Thumbnail (#{id}) #{src}"
        workers[id] = Thread.new(src, id, tid, rindex) do |src, id, tid, rindex|
          begin
            active_workers += 1
            data = get_image(src)
            write_image(id, data)
          rescue StandardError => e
            if e.kind_of?(HTTPNotFound)
              @log.debug e.message
            else
              @log.error get_error(e)
            end
            if tid
              threads[tid][:replies][rindex].delete(:img)
            else
              threads[id][:s] = @thumb_404
              threads[id][:w], threads[id][:h] = @opts.thumb404_size
              threads[id].delete(:src)
            end
          ensure
            active_workers -= 1
          end
        end
        sleep @opts.req_delay_media
      end
      
      while active_workers > 0
        sleep 0.5
      end
      
      purge_thumbnails(local_thumbs, remote_thumbs)
    end
    
    if @this_high_reply > @last_high_reply
      new_replies_count = @this_high_reply - @last_high_reply
      @last_high_reply = @this_high_reply
    else
      new_replies_count = 0
    end
    
    if @this_high_thread > @last_high_thread
      @last_high_thread = @this_high_thread
    end
    
    if !@skip_stats
      adjust_speed(new_replies_count)
      update_stats(@new_threads_count, new_replies_count) if @opts.stats
      #@log.debug "Stats: #{@new_threads_count}/#{new_replies_count}"
    else
      @log.debug 'First run, skipping stats'
      @skip_stats = false
    end
    
    @mtime = Time.now.utc
    
    begin
      write_json(threads, order)
    rescue StandardError => e
      @log.error 'write_json: ' << get_error(e)
    end if @opts.write_json
    
    begin
      write_html(threads, order)
    rescue StandardError => e
      @log.error 'write_html: ' << get_error(e)
    end if @opts.write_html
    
    begin
      write_replies(threads)
    rescue StandardError => e
      @log.error 'write_replies: ' << get_error(e)
    end if @opts.write_replies
   
    begin
      write_rss(threads, order[:date])
    rescue StandardError => e
      @log.error 'write_rss: ' << get_error(e)
    end if @opts.write_rss
   
    @json_cache = nil if @json_cache
  end
  
  def format_author(post)
    author = post[:name] ? post[:name].to_s : ''
    author << " #{post[:trip]}" if post[:trip]
    author << " ## #{post[:capcode].capitalize}" if post[:capcode]
    if !author.empty? && author != @opts.default_name
      author.gsub!(/&#039;/, "'")
      author
    else
      nil
    end
  rescue
    @log.warn 'format_author: ' << get_error($!)
    nil
  end
  
  def format_body(post, is_reply = false)
    return nil if !post[:com]
    
    body = post[:com].to_s
    
    # Remove EXIF meta
    if @opts.remove_exif
      body.gsub!(/(<br>)+<span class="abbr">.+$/, '')
    end
    
    # Remove Oekaki meta
    if @opts.remove_oekaki
      body.gsub!(/<br><br><small><b>Oekaki Post<\/b>.+?<\/small>/, '')
    end
    
    # Remove fortune
    if @opts.remove_fortune
      body.gsub!(/<span class="fortune".+?<\/span>/, '')
    end
    
    has_spoilers = body.include?('<s>')
    
    if has_spoilers
      body.gsub!(/\[\/spoiler\]/, '')
      
      frag = Nokogiri::HTML.fragment(body, 'utf-8')
      
      nodes = frag.xpath('./s')
      nodes.each do |node|
        node.replace("[spoiler]#{node.inner_html}[/spoiler]")
      end
      
      body = frag.to_s
    end
    
    if !is_reply
      body.gsub!(/<br>/i, "\n")
    else
      body.gsub!(/(?:<br>)+/i, "\n")
    end
    body.gsub!(/<[^>]+>/i, '')
    body.gsub!(/[<>]/, ENTITIES)
    
    if has_spoilers
      body.gsub!(/\[\/?spoiler\]/, BB_TAGS) 
    end
    
    body
  rescue
    @log.warn 'format_body: ' << get_error($!)
    nil
  end
  
  def format_teaser(title, body)
    teaser =
      if title
        if body
          "#{title}:\n#{body}"
        else
          title
        end
      else
        body
      end
    
    teaser.gsub!(/&#039;/, "'") if teaser
    
    teaser
  end
  
  def format_op(post)
    # Pulling from cache
    if th = @thread_cache[post[:no]]
      th[:act] = nil if th[:act]
      if post[:filedeleted]
        th[:s] = @thumb_404
        th[:w], th[:h] = @opts.thumb404_size
      end
    else
      th = {}
      
      th[:id] = post[:no]
      th[:date] = post[:time].to_i
      
      th[:author] = format_author(post)
      
      th[:title] = post[:sub]
      th[:body] = format_body(post)
      th[:teaser] = format_teaser(th[:title], th[:body])
      
      # Thumbnail
      if !post[:tim] || post[:filedeleted] || @opts.text_only
        th[:s] = @thumb_404
        th[:w], th[:h] = @opts.thumb404_size
      else
        if post[:spoiler]
          th[:s] = @spoiler_pic
          th[:splr] = true
          th[:w], th[:h] = @opts.spoiler_size
          th[:sw] = post[:tn_w]
          th[:sh] = post[:tn_h]
        else
          th[:w] = post[:tn_w]
          th[:h] = post[:tn_h]
        end
        th[:src] = "#{@thumbs_url}#{post[:tim]}s.jpg"
      end
      
      # Flags
      if (@opts.country_flags && post[:country])
        th[:loc] = post[:country].downcase
        th[:locname] = post[:country_name]
      end
      
      # Filename tag
      if @opts.filename_tag && post[:filename] && !(post[:filename] =~ /^[0-9]+$/)
        file_tag = post[:filename].gsub(/\[[^\]]+\]/, '')
        file_tag.gsub!(/&#039;/, "'")
        file_tag.gsub!(/\([^\)]+\)/, '')
        file_tag.gsub!(/\.(?:mkv|mp4|avi).*$/, '')
        file_tag.gsub!(/[._\s]+/, ' ')
        
        if !file_tag.empty? && !(file_tag =~ /[a-f0-9]{32,}/)
          th[:file] = file_tag
            .split(/([-',a-zA-Z]+)/)
            .reject { |m| m.strip!; m.empty? }
            .join(' ')
        end
      end
    end
    
    th[:r] = post[:replies]
    th[:i] = post[:images]
    
    if post[:sticky]
      th[:sticky] = true
    elsif th[:sticky]
      th.delete(:sticky)
    end
    
    th
  end
  
  # Parses the decoded JSON API response
  # @param [Hash] json decoded JSON API response
  # @return [Hash{thread_id(Integer) => Hash}] a Hash of threads
  def parse_catalog(json)
    catalog = JSON.parse(json, symbolize_names: true)
    
    threadlist = {}
    
    catalog.each do |page|
      threads = page[:threads]
      
      page_size = threads.size
      
      threads.each do |t|
        th = format_op(t)
        
        tid = th[:id]
        
        if tid > @last_high_thread
          @new_threads_count += 1
          @this_high_thread = tid if tid > @this_high_thread
        end
        
        th[:page_size] = page_size
        
        # Last reply
        if th[:r] > 0
          th[:lrdate] = t[:last_replies].last[:time].to_i
          
          if @opts.write_replies
            repstamp = 0
            last_replies = []
            last_replies_map = {}
            img_replies = []
            
            cached_replies = th[:replies_map] || {}
            
            author = nil
            i = 0
            while r = t[:last_replies][i]
              repstamp += r[:no]
              
              @this_high_reply = r[:no] if r[:no] > @this_high_reply
              
              unless rep = cached_replies[r[:no]]
                rep = {}
                rep[:date] = r[:time].to_i
                author = format_author(r)
                rep[:author] = author if author
                teaser = format_teaser(r[:sub], format_body(r, true))
                rep[:teaser] = teaser if teaser
              end
              
              if r[:tim] && !r[:filedeleted]
                if @opts.image_replies && !@opts.text_only
                  if r[:spoiler]
                    rep[:s] = @spoiler_pic
                    rep[:splr] = true
                    rep[:w], rep[:h] = @opts.spoiler_size
                    rep[:sw] = r[:tn_w]
                    rep[:sh] = r[:tn_h]
                  else
                    rep[:w] = r[:tn_w]
                    rep[:h] = r[:tn_h]
                  end
                  
                  rep[:img] = r[:no]
                  img_replies << [ "#{@thumbs_url}#{r[:tim]}s.jpg", r[:no], i ]
                end
              end
              
              last_replies << rep
              last_replies_map[r[:no]] = rep
              
              i += 1
            end
            
            th[:repstamp] = repstamp
            th[:replies] = last_replies
            th[:replies_map] = last_replies_map
            th[:imgs] = img_replies
            
            th[:lr] = { date: rep[:date] }
            th[:lr][:author] = author if author
          else
            unless rep = th[:lr]
              rep = {}
              rep[:date] = r[:time].to_i
              author = format_author(r)
              rep[:author] = author if author
            end
            
            th[:lr] = rep
          end
        else
          th[:lrdate] = t[:time].to_i
        end
        
        threadlist[tid] = th
      end
    end
    
    threadlist
  end
  
  # Updates stats
  # @param [Fixnum] new_threads New threads since the last refresh cycle
  # @param [Fixnum] new_replies New replies since the last refresh cycle
  def update_stats(new_threads, new_replies)
    now = Time.now.utc
    if @last_hour
      if @last_hour != now.hour
        begin
          file = @stats_dir + @opts.slug + '-daily'
          if File.exists?(file)
            stats = JSON.parse(File.open(file, 'r:UTF-8') { |f| f.read })
          else
            stats = Hash.new { |h, k| h[k] = Array.new(24, 0) }
          end
          stats['threads'][@last_hour] = 0
          stats['replies'][@last_hour] = 0
          @stats_io.rewind
          lines = @stats_io.read.split("\n")
          lines.map do |line|
            vals = line.split(':')
            stats['threads'][@last_hour] += vals[2].to_i
            stats['replies'][@last_hour] += vals[3].to_i
          end
          File.open(file, 'w:UTF-8') { |f| f.write(stats.to_json) }
        rescue StandardError => e
          @log.error 'update_stats: daily: ' << get_error(e)
        ensure
          @stats_io.reopen(@stats_io.path, 'w+')
        end
      end
      begin
        line = "#{now.to_i}:#{@last_high_reply}:#{new_threads}:#{new_replies}\n"
        @stats_io.write(line)
        @stats_io.flush
      rescue StandardError => e
        @log.error 'update_stats: current: ' << get_error(e)
      end
    else
      @log.debug 'update_stats: skipping first run'
    end
    @last_hour = now.hour
  end
  
  # File writer
  # @param [String] data
  # @param [String] path
  # @param [true, false] gzip
  def write_content(data, path, gzip = false)
    tmp = path + '.tmp'
    if gzip
      Zlib::GzipWriter.open(tmp) { |f| f.write(data) }
    else
      File.open(tmp, 'w:UTF-8') { |f| f.write(data) }
    end
    File.rename(tmp, path)
  end
  
  # Renders the HTML page
  # @see #refresh
  def write_html(threads, order)
    # Template changed?
    if (mtime = File.mtime(@tpl_file)) > @tpl_mtime
      @log.unknown 'Reloading template'
      @tpl_mtime = mtime
      @template = load_template(@tpl_file)
    end
    
    html = @template.result(binding())
    
    write_content(html, @board_file)
    write_content(html, @board_file + '.gz', true) if @opts.precompress
  end
  
  # Writes thumbnail files
  # @param [Integer] id Image id
  def write_image(id, data)
    File.open("#{@thumbs_dir}#{id}.jpg", 'wb') { |f| f.write(data) }
  end
  
  # Outputs the thread list as JSON
  # @see #refresh
  def write_json(threads, order)
    data = jsonify_threads(threads, order)
    write_content(data, @json_file)
    write_content(data, @json_file + '.gz', true) if @opts.precompress
  end
  
  # Outputs last replies as JSON
  # @see #refresh
  def write_replies(threads)
    stamps = {}
    current = []
    old = Dir.glob("#{@replies_dir}*.json")
    
    threads.each do |id, thread|
      next unless thread[:replies]
      file = "#{@replies_dir}#{id}.json"
      current << file
      if @replies_stamps[id] != thread[:repstamp]
        stamps[id] = thread[:repstamp]
        data = thread[:replies].to_json
        write_content(data, file)
      end
    end
    
    @replies_stamps = stamps
    
    purgelist = old - current
    
    return if purgelist.empty?
    
    begin
      FileUtils.rm(purgelist, force: true)
      #@log.debug "Purged #{purgelist.length} dead reply file(s)."
    rescue StandardError => e
      @log.error 'write_replies: ' << get_error(e)
    end
  end
  
  # Generates the RSS feed
  # @see #refresh
  def write_rss(threads, order)
    now = Time.now.gmtime.rfc2822
    builder = Nokogiri::XML::Builder.new do |xml|
      xml.rss('version' => '2.0') {
        xml.channel {
          xml.title @opts.title
          xml.description @opts.rss_desc
          xml.link @opts.web_uri + @opts.slug + '/'
          xml.lastBuildDate now
          order.each do |id|
            th = threads[id]
            xml.item {
              title = "No.#{id}"
              title << ": " << th[:title] if th[:title]
              xml.title title
              src = @rss_content_uri +
                if th[:s]
                  "images/#{th[:s]}"
                else
                  @opts.slug + "/src/#{id}.jpg"
                end
              xml.description(
                '<img src="' << src << '" alt="' << "#{id}" << '" />' <<
                '<p>' <<
                  (th[:body] ? th[:body].gsub("\n", '<br>') : '') <<
                '</p>'
              )
              xml.link link_to_thread(th[:id])
              xml.guid "#{th[:id]}"
              xml.pubDate Time.at(th[:date]).rfc2822.to_s
            }
          end
        }
      }
    end
    
    output = builder.to_xml(:indent => 0, :encoding => 'UTF-8')
    
    write_content(output, @rss_file)
    write_content(output, @rss_file + '.gz', true) if @opts.precompress
  end

end

# Raised on HTTP responses other than 200 and 404
class HTTPError < StandardError; end

# Raised on HTTP 404
class HTTPNotFound < HTTPError; end

# Raised on HTTP 5xx
class HTTPServerError < HTTPError; end

# Raised when asked to halt
class CatalogHalt < StandardError; end

end
