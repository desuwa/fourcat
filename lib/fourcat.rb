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
  
  VERSION     = '2.3.0'
  
  BB_TAGS     = { 
    '[spoiler]' => '<s>',
    '[/spoiler]' => '</s>'
  }
  
  ENTITIES    = { '<' => '&lt;', '>' => '&gt;' }
  
  PURGE_SKIP  = 0.25
  
  @defaults = {
    :approot          => File.expand_path(File.dirname(__FILE__) + '/../'),
    :loglevel         => Logger::WARN,
    :use_json_api     => false,
    :title            => nil,
    :public_dir       => nil,
    :default_name     => 'Anonymous',
    :precompress      => false,
    :stats            => false,
    :proxy            => nil,
    :debug            => false,
    :text_only        => false,
    :write_html       => true,
    :html_template    => 'catalog.html',
    :write_replies    => true,
    :image_replies    => false,
    :write_rss        => false,
    :write_json       => false,
    :rss_desc         => nil,
    :web_uri          => nil,
    :content_uri      => nil,
    :user_agent       => "4cat/#{VERSION}",
    :spoiler_text     => false,
    :spoiler_size     => [100, 100],
    :thumb404_size    => [125, 125],
    :remove_exif      => false,
    :remove_oekaki    => false,
    :country_flags    => false,
    :req_delay        => 1.0,
    :req_delay_media  => 0.5,
    :req_timeout      => 10,
    :retries          => 3,
    :no_partial       => true,
    :page_count       => [11, 2],
    :page_size        => 15,
    :refresh_delay    => 60,
    :refresh_range    => [60, 300],
    :refresh_step     => 10,
    :refresh_thres    => nil,
    :use_ssl          => false,
    :workers_limit    => 3
  }
  
  def self.defaults=(opts)
    @defaults = opts
  end
  
  def self.defaults
    @defaults
  end
  
  attr_accessor :opts
  
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
  # @option opts [true, false] country_flags
  #   Display country flags.
  #
  # @option opts [Numeric] req_delay
  #   Delay in seconds between requests, defaults to 1.2
  #
  # @option opts req_timeout Socket open/read timeouts in seconds,
  #   defaults to 10
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
    
    if @opts.proxy
      @opts.proxy << '/' if @opts.proxy[-1, 1] != '/'
    end
    
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
    
    # Thumbnails that appear to be dead will be placed here and
    # deleted during the next refresh cycle
    @delete_queue = []
    
    # Previous refresh cycle highest thread and reply ids
    @this_high_reply = 0
    @last_high_thread = 0
    @last_high_reply = 0
    
    # For stats tracking
    @last_hour = false
    
    # For stats tracking and speed adjustment
    @first_run = true
    
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
    
    @server = 
      if @opts.use_ssl
        require 'net/https'
        'https'
      else
        'http'
      end
    
    if @opts.use_json_api
      @server << '://api.4chan.org/'
    else
      @server << '://boards.4chan.org/'
    end
    
    @pages_uri = URI.parse(@server)
    
    # If too much pages were dropped, the thumbnail purging is skipped
    @page_drop_limit = (@opts.page_count[0] * PURGE_SKIP).ceil
    
    # jsonified threadlist cache for when write_json and write_html are true
    @json_cache = nil
    
    # Last successful write time (Time UTC)
    @mtime = 0
    
    @halt = false
  end
  
  # Runs the main loop
  def run
    init_logger
    init_dirs
    
    @log.unknown "Running 4cat #{VERSION}"
    @log.unknown "Data source is #{@server}"
    
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
        else
          @log.fatal get_error(e)
        end
        cleanup
        raise e
      end
    end
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
  # @param [Fixnum] new_threads New threads since the last refresh cycle
  # @param [Fixnum] new_replies New replies since the last refresh cycle
  def adjust_speed(new_threads, new_replies)
    if new_threads > 0
      @opts.refresh_delay -= new_threads * @opts.refresh_step
    else
      if @opts.refresh_thres && (new_replies > @opts.refresh_thres)
        @opts.refresh_delay -= @opts.refresh_step
      else
        @opts.refresh_delay += @opts.refresh_step
      end
    end
    if @opts.refresh_delay < @opts.refresh_range[0]
      @opts.refresh_delay = @opts.refresh_range[0]
    elsif @opts.refresh_delay > @opts.refresh_range[1]
      @opts.refresh_delay = @opts.refresh_range[1]
    end
  end
  
  def check_catalog(threadlist, order)
    cat = get_catalog
    check = JSON.parse(cat, symbolize_names: true);
    check.each do |c|
      c[:threads].each do |t|
        if !threadlist[t[:no]] && t[:no] < @last_high_thread
          thread = format_post_json(t)
          
          if @opts.write_replies
            reps = "#{@replies_dir}#{t[:no]}.json"
            if File.exist?(reps)
              thread[:replies] = JSON.parse(
                File.open(reps, 'r:UTF-8') { |f| f.read },
                symbolize_names: true
              )
              thread[:lr] = thread[:replies].last.clone
              thread[:lr].delete(:teaser)
              lrdate = thread[:lr][:date]
            else
              lrdate = thread[:date]
            end
          else
            lrdate = thread[:date]
          end
          
          thread[:lrdate] = lrdate
          
          threadlist[t[:no]] = thread
          
          order_index = (c[:page] + 1) * @opts.page_size - 1
          if order[order_index]
            order.insert(order_index, t[:no])
          else
            order << t[:no]
          end
        end
      end
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
    
    try = 1
    begin
      resp = http.request_get(path, @headers)
      if resp.code != '200'
        if resp.code == '404'
          raise HTTPNotFound, "Not Found #{http.address}#{path}"
        elsif resp.code == '503'
          raise HTTPServiceUnavailable, 'Service Unavailable'
        else
          raise "Skipping after HTTP #{resp.code}: #{http.address}#{path}"
        end
      end
    rescue Timeout::Error, Errno::ECONNRESET, EOFError, HTTPServiceUnavailable => e
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
    http = Net::HTTP.new('api.4chan.org')
    http.open_timeout = http.read_timeout = @opts.req_timeout
    
    path = "/#{@opts.slug}/catalog.json"
    
    resp = fetch(http, path)
    
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
    http = Net::HTTP.new(uri.host, @pages_uri.port)
    http.open_timeout = http.read_timeout = @opts.req_timeout
    fetch(http, uri.path).body
  end
  
  # Fetches a page
  # @param [Fixnum] page_num Page number
  # @see #fetch
  def get_page(page_num)
    http = Net::HTTP.new(@pages_uri.host, @pages_uri.port)
    http.open_timeout = http.read_timeout = @opts.req_timeout
    
    path = "#{@pages_uri.path}#{@board}/"
    if @opts.use_json_api
      path << "#{page_num}.json"
    elsif page_num > 0
      path << "#{page_num}"
    end
    
    resp = fetch(http, path)
    
    data = 
      if resp['content-encoding'] == 'gzip'
        Zlib::GzipReader.new(StringIO.new(resp.body)).read
      else
        resp.body
      end
    
    data.force_encoding(Encoding::UTF_8)
    
    unless data.valid_encoding?
      @log.debug("Re-encoding invalid UTF-8 string: #{path}")
      data.encode!('UTF-16LE', 'UTF-8', {
        :invalid => :replace, :undef => :replace, :replace => ''
      })
      data.encode!('UTF-8', 'UTF-16LE')
    end
    
    data
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
    threads = {}
    threadlist.each do |id, thread|
      threads[id] = {
        :date => thread[:date].to_i
      }
      threads[id][:teaser] = thread[:teaser] || ''
      threads[id][:author] = thread[:author] if thread[:author]
      threads[id][:sticky] = thread[:sticky] if thread[:sticky]
      threads[id][:w] = thread[:w]
      threads[id][:h] = thread[:h]
      if thread[:s]
        threads[id][:s] = thread[:s]
        if thread[:splr]
          threads[id][:splr] = true 
          threads[id][:sw] = thread[:sw]
          threads[id][:sh] = thread[:sh]
        end
      end
      if thread[:r] != 0
        threads[id][:r] = thread[:r]
        threads[id][:i] = thread[:i] if thread[:i]
      end
      if @opts.country_flags
        threads[id][:loc] = thread[:loc]
        threads[id][:locname] = thread[:locname]
      end
      threads[id][:lr] = thread[:lr] if thread[:lr]
    end
    
    json = {
      :threads    => threads,
      :order      => order,
      :count      => threads.size,
      :slug       => @opts.slug,
      :delay      => @opts.refresh_delay,
      :anon       => @opts.default_name,
      :mtime      => @mtime.to_i,
      :proxy      => @opts.proxy,
      :pagesize   => @opts.page_size
    }
    
    json[:flags] = true if @opts.country_flags
    
    if @opts.write_json && @opts.write_html
      @json_cache = json.to_json.gsub(/[\u2028\u2029]/, '')
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
    @log.debug 'Purging dead thumbnails'
    dead = local - remote
    if dead.length > 0
      purgelist = dead & @delete_queue
      @delete_queue = dead - @delete_queue
      begin
        FileUtils.rm(purgelist, force: true)
        @log.debug "Purged #{purgelist.length} dead thumbnails."
      rescue StandardError => e
        @log.error 'purge_thumbnails: ' << get_error(e)
      end
    else
      @log.debug 'Nothing to purge.'
    end
  end
  
  # Updates the catalog
  def refresh
    @log.debug "Refreshing /#{@opts.slug}/"
    
    threads = []
    workers = {}
    active_workers = 0
    pages_dropped = 0
    @this_high_reply = @last_high_reply
    
    for run in 0...@opts.page_count.length
      @log.debug "Run #{run}"
      
      @sticky_count = 0
      
      threads[run] = []
      
      range = if run == 0
        0..@opts.page_count[run]
      else
        0...@opts.page_count[run]
      end
      
      break_next = false
      
      for page in range
        break if break_next
        if run == 0 && page == @opts.page_count[0] && @sticky_count < 2
          break
        end
        while active_workers >= @opts.workers_limit
          sleep(@opts.req_delay)
        end
        @log.debug "Page #{page}"
        workers["#{run}-#{page}"] =
        Thread.new(threads[run], page) do |th, page|
          begin
            active_workers += 1
            th[page] = parse_response(get_page(page))
          rescue HTTPNotFound => e
            break_next = true
            @log.debug "Page #{page} not found"
          rescue StandardError => e
            pages_dropped += 1
            @log.error get_error(e)
          ensure
            active_workers -= 1
          end
        end
        sleep @opts.req_delay
      end
      
      while active_workers > 0
        sleep 0.5
      end
    end
    
    threadlist = {}
    stickies = []
    natural_order = []
    new_threads = 0
    
    run = threads.length - 1
    
    while run >= 0
      page_order = []
      threads[run].each do |page_threads|
        next unless page_threads
        
        page_threads.each do |id, thread|
          next if threadlist.has_key?(id)
          threadlist[id] = thread
          if id > @last_high_thread
            new_threads += 1
          end
          next if thread[:sticky] && stickies << id
          page_order << id
        end
      end
      
      natural_order << page_order
      run -= 1
    end
    
    # Bailing out on empty threadlist
    if threadlist.empty?
      adjust_speed(0, 0)
      update_stats(0, 0) if @opts.stats
      return @log.error 'Breaking on empty threadlist'
    end
    
    # Sorting orders
    order = {}
    
    # Bump date (natural)
    order[:alt] = natural_order.flatten.unshift(*stickies)
    
    # Checking for missed threads
    if pages_dropped == 0
      begin
        check_catalog(threadlist, order[:alt])
      rescue StandardError => e
        @log.error 'threadlist check: ' << get_error(e)
      end
    end
    
    # Creation date
    order[:date] = order[:alt].sort { |x, y| y <=> x }
    # Reply count
    order[:r] = order[:alt].sort do |x, y|
      threadlist[y][:r] <=> threadlist[x][:r]
    end
    # Last reply date
    order[:lr] = order[:alt].sort do |x, y|
      threadlist[y][:lrdate] <=> threadlist[x][:lrdate]
    end
    
    @last_high_thread = order[:date][0]
    if @this_high_reply > @last_high_reply
      new_replies = @this_high_reply - @last_high_reply
      @last_high_reply = @this_high_reply
    else
      new_replies = 0
    end
    
    # Fetching thumbnails
    unless @opts.text_only
      thumblist = {}
      
      threadlist.each do |tid, thread|
        if thread[:src]
          thumblist["#{@thumbs_dir}#{tid}.jpg".freeze] = [ thread[:src], tid ]
        end
        
        if @opts.image_replies && thread[:imgs]
          i = 0
          thread[:imgs].each do |img|
            key = "#{@thumbs_dir}#{img[1]}.jpg".freeze
            thumblist[key] = [ img[0], img[1], tid, img[2] ]
            i += 1
          end
        end
      end
      
      remote_thumbs = thumblist.keys
      local_thumbs = Dir.glob("#{@thumbs_dir}*.jpg")
      new_thumbs = remote_thumbs - local_thumbs
      
      if pages_dropped >= @page_drop_limit
        @log.warn 'Too many pages dropped, skipping purge'
      else
        purge_thumbnails(local_thumbs, remote_thumbs)
      end
      
      workers = {}
      active_workers = 0
      
      new_thumbs.each do |file|
        while active_workers >= @opts.workers_limit
          sleep(@opts.req_delay)
        end
        
        src = thumblist[file][0]
        id = thumblist[file][1]
        tid = thumblist[file][2]
        rindex = thumblist[file][3]
        
        @log.debug "Thumbnail (#{id}) #{src}"
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
              threadlist[tid][:replies][rindex].delete(:img)
            else
              threadlist[id][:s] = @thumb_404
              threadlist[id][:w], threadlist[id][:h] = @opts.thumb404_size
              threadlist[id].delete(:src)
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
    end
    
    unless @first_run
      adjust_speed(new_threads, new_replies)
    else
      @first_run = false
    end
    
    @log.debug "Delay is #{@opts.refresh_delay} (#{new_threads}/#{new_replies})"
    
    if @opts.no_partial && pages_dropped > 0
      @log.warn 'Incomplete refresh cycle, skipping output'
    else
      @mtime = Time.now.utc
      
      begin
        write_json(threadlist, order)
      rescue StandardError => e
        @log.error 'write_json: ' << get_error(e)
      end if @opts.write_json
      
      begin
        write_html(threadlist, order)
      rescue Exception => e
        @log.error 'write_html: ' << get_error(e)
      end if @opts.write_html
      
      begin
        write_replies(threadlist)
      rescue StandardError => e
        @log.error 'write_replies: ' << get_error(e)
      end if @opts.write_replies
     
      begin
        write_rss(threadlist, order[:date])
      rescue StandardError => e
        @log.error 'write_rss: ' << get_error(e)
      end if @opts.write_rss
     
      @json_cache = nil if @json_cache
    end
    
    update_stats(new_threads, new_replies) if @opts.stats
  end
  
  def format_author(post)
    author = post[:name] ? post[:name].to_s : ''
    author << " #{post[:trip]}" if post[:trip]
    author << " ## #{post[:capcode].capitalize}" if post[:capcode]
    if !author.empty? && author != @opts.default_name
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
    if title
      if body
        "#{title}:\n#{body}"
      else
        title
      end
    else
      body
    end
  end
  
  def format_post_json(post)
    th = {}
    
    th[:id] = post[:no]
    th[:r] = post[:replies]
    th[:i] = post[:images]
    th[:date] = post[:time].to_i
    
    if post[:sticky]
      th[:sticky] = true
    end
    
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
    
    th
  end
  
  def parse_response(data)
    if @opts.use_json_api
      parse_json(JSON.parse(data, symbolize_names: true))
    else
      parse_html(data)
    end
  end
  
  # Scans the page for threads
  # @param [String] html raw HTML to process
  # @return [Hash] a Hash of threads, same format as the decoded JSON API response
  def parse_html(html)
    threads = []
    
    thread_html = html.scan(/<div class="thread" id="t[0-9]+">.*?<\/div><hr>/)
    
    thread_html.each do |t|
      posts = []
      
      post_html = t.scan(/<div class="postContainer [^>]+>.*?<\/blockquote><\/div>/)
      
      rep_count = -1
      img_count = -1
      
      post_html.each do |p|
        post = {}
        
        rep_count += 1
        
        inner = p.scan(/<div id="p([0-9]+)" class="post [^"]+"><div.*?<\/div>.*?<span class="subject">([^<]*)<\/span> <span class="nameBlock([^"]*)?">(.*?)<span class="dateTime" data-utc="([0-9]+)">.*?<blockquote class="postMessage" id="m[0-9]+">(.*?)<\/blockquote>/m)[0]
        
        post[:no] = inner[0].to_i
        
        if file = p.scan(/<div class="file"(.*?)class="fileThumb[^<]+<img src="([^>]+)>/)[0]
          filemeta = file[0]
          src = file[1]
          if src.include?('deleted')
            post[:filedeleted] = true
          elsif src.include?('spoiler')
            img_count += 1
            
            post[:spoiler] = true
            
            img_dims = filemeta.scan(/B, ([0-9]+)x([0-9]+)/)[0]
            
            tn_w = img_dims[0].to_i
            tn_h = img_dims[1].to_i
            
            max_size = 250.0;
            
            if (tn_w > max_size)
              ratio = max_size / tn_w;
              tn_w = max_size;
              tn_h = (tn_h * ratio).round(1);
            end
            
            if (tn_h > max_size)
              ratio = max_size / tn_h;
              tn_h = max_size;
              tn_w = (tn_w * ratio).round(1);
            end
            post[:tim] = filemeta.scan(/File: <a href=".*?\/([0-9]+)\.[a-z]+"/)[0][0].to_i
            post[:tn_w] = tn_w
            post[:tn_h] = tn_h
          else
            img_count += 1
            post[:tim] = src.scan(/\/([0-9]+)s\.jpg"/)[0][0].to_i
            tn_dims = src.scan(/height: ([0-9]+)px; width: ([0-9]+)px/)[0]
            post[:tn_w] = tn_dims[1]
            post[:tn_h] = tn_dims[0]
          end
        end
        
        # Subject
        if !inner[1].empty?
          post[:sub] = inner[1]
        end
        
        # Nameblock
        name = inner[3]
        
        # Capcode
        if !(capcode = inner[2]).empty?
          if capcode = capcode.scan(/ capcode([^\s]+)/)[0]
            post[:capcode] = capcode[0].downcase
            name.sub!(/<strong class="capcode .*?<\/strong>/, '')
          end
        end
        
        if @opts.country_flags && name.include?('class="countryFlag">')
          flag = name.scan(/alt="([^"]+)" title="([^"]+)" class="countryFlag">/)[0]
          post[:country] = flag[0]
          post[:country_name] = flag[1]
        end
        
        if name.include?('<span class="posteruid')
          name.sub!(/<span class="posteruid [^<]+<[^<]+<[^<]+<\/span>/, '')
        end
        
        name.gsub!(/<[^>]+>/i, '')
        name.strip!
        
        post[:name] = name
        
        # Timestamp UTC
        post[:time] = inner[4].to_i
        
        if !(com = inner[5]).empty?
          if com.include?('<span class="abbr">')
            com.sub!(/<br><span class="abbr">.*?<\/span>/, '')
          end
          post[:com] = com
        end
        
        posts << post
      end
      
      img_count = 0 if img_count < 0
      
      if summary = t.scan(/<span class="summary desktop">([0-9]+)[^.0-9]+([0-9]+)?/)[0]
        rep_count += summary[0].to_i if summary[0]
        img_count += summary[1].to_i if summary[1]
      end
      
      posts[0][:replies] = rep_count
      posts[0][:images] = img_count
      
      posts[0][:sticky] = true if t.include?('"stickyIcon retina">')
      
      threads << { posts: posts }
    end
    
    parse_json({ threads: threads })
  end
  
  # Parses the decoded JSON API response
  # @param [Hash] json decoded JSON API response
  # @return [Hash{thread_id(Integer) => Hash}] a Hash of threads
  def parse_json(json)
    threads = {}
    
    json[:threads].each do |t|
      
      th = format_post_json(t[:posts][0])
      
      @sticky_count += 1 if th[:sticky]
      
      # Last reply
      r = t[:posts].last
      th[:lrdate] = r[:time].to_i
      if th[:r] > 0
        if @opts.write_replies
          repstamp = 0
          last_replies = []
          img_replies = []
          
          i = 1
          while r = t[:posts][i]
            repstamp += r[:no]
            
            rep = {}
            rep[:date] = r[:time].to_i
            author = format_author(r)
            rep[:author] = author if author
            teaser = format_teaser(r[:sub], format_body(r, true))
            rep[:teaser] = teaser if teaser
            
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
                img_replies << [ "#{@thumbs_url}#{r[:tim]}s.jpg", r[:no], i - 1 ]
              end
            end
            
            last_replies << rep
            
            i += 1
          end
          
          th[:repstamp] = repstamp
          th[:replies] = last_replies
          th[:imgs] = img_replies
          
          th[:lr] = { date: rep[:date] }
          th[:lr][:author] = author if author
        else
          rep = {}
          rep[:date] = r[:time].to_i
          author = format_author(r)
          rep[:author] = author if author
          
          th[:lr] = rep
        end
      end
      
      # Post rate stats
      t[:posts].each do |r|
        @this_high_reply = r[:no] if r[:no] > @this_high_reply
      end
      
      threads[th[:id]] = th
    end
    
    threads
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
  def write_html(threadlist, order)
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
  def write_json(threadlist, order)
    data = jsonify_threads(threadlist, order)
    write_content(data, @json_file)
    write_content(data, @json_file + '.gz', true) if @opts.precompress
  end
  
  # Outputs last replies as JSON
  # @see #refresh
  def write_replies(threadlist)
    stamps = {}
    current = []
    old = Dir.glob("#{@replies_dir}*.json")
    
    threadlist.each do |id, thread|
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
      @log.debug "Purged #{purgelist.length} dead reply file(s)."
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

# Raised on HTTP 503
class HTTPServiceUnavailable < HTTPError; end

# Raised when asked to halt
class CatalogHalt < StandardError; end

end
