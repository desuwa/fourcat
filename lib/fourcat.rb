# encoding: utf-8
require 'fileutils'
require 'htmlentities'
require 'json'
require 'logger'
require 'net/http'
require 'ostruct'
require 'stringio'
require 'time'
require 'uri'
require 'zlib'

module Fourcat

class Catalog
  
  VERSION     = '0.9.7'
  
  TAG_REGEX   = /<[^>]+>/i
  PB_REGEX    = /[\u2028\u2029]/
  LB_REGEX    = /<br\s?\/?>/i
  BB_TAGS     = { '[spoiler]' => '<s>', '[/spoiler]' => '</s>' }
  
  PURGE_SKIP  = 0.25
  
  @defaults = {
    :approot          => File.expand_path(File.dirname(__FILE__) + '/../'),
    :loglevel         => Logger::WARN,
    :title            => nil,
    :public_dir       => nil,
    :default_name     => 'Anonymous',
    :default_title    => '',
    :default_comment  => '',
    :precompress      => false,
    :stats            => false,
    :proxy            => nil,
    :debug            => false,
    :front_page       => '',
    :extension        => '',
    :text_only        => false,
    :write_html       => true,
    :html_template    => 'catalog.html',
    :write_rss        => false,
    :write_json       => false,
    :rss_desc         => nil,
    :web_uri          => nil,
    :content_uri      => nil,
    :user_agent       => "4cat/#{VERSION}",
    :spoiler_text     => false,
    :spoiler_mark     => 'spoiler',
    :filedeleted_mark => 'filedeleted',
    :threads_pattern  => Regexp.new(
      '<img src="?(http://[^\s"]+)?[^<]+(?:</a>)?' <<
      '<a name="0"></a>\s+<input type=checkbox name="[0-9]+" value=delete>' <<
      '<span class="filetitle">([^<]*)</span>\s+' <<
      '<span class="postername">(.*)</span>\s' <<
      '<span class="posttime">([^<]+)</span>\s' <<
      '([^\[]+)\[<a href="res/([0-9]+)">Reply</a>\]</span>\s' <<
      '<blockquote>(.*)</blockquote>' <<
      '(?:<span class="omittedposts">([0-9]+)[^<0-9]+([0-9]+)?)?'
    ),
    :replies_pattern  => Regexp.new(
      '<span id="norep([0-9]+)"><a href="res/([0-9]+).+</span>(<br>)?'
    ),
    :date_pattern     => Regexp.new(
      '([0-9]{2})/([0-9]{2})/([0-9]{2})[^0-9]+([0-9]{2}):([0-9]{2})'
    ),
    :pages_pattern    => Regexp.new(
      '\[<a href="[0-9]{1,2}">([0-9]{1,2})</a>\] '
    ),
    :spoiler_xpath    => './span[@class="spoiler"]',
    :datemap =>
    {
      :year   => 2,
      :month  => 0,
      :day    => 1,
      :hour   => 3,
      :minute => 4,
      :second => nil
    },
    :matchmap =>
    {
      :thumb  => 0,
      :title  => 1,
      :author => 2,
      :date   => 3,
      :status => 4,
      :id     => 5,
      :body   => 6,
      :orep   => 7,
      :oimg   => 8
    },
    :utc_offset     => Time.zone_offset('EST'),
    :req_delay      => 1.2,
    :req_timeout    => 10,
    :retries        => 2,
    :no_partial     => true,
    :page_count     => [16, 2],
    :refresh_delay  => 60,
    :refresh_range  => [60, 300],
    :refresh_step   => 10,
    :refresh_thres  => nil,
    :teaser_length  => 200,
    :server         => 'http://boards.4chan.org/',
    :relative_urls  => false,
    :workers_limit  => 3
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
  # @option opts [String] default_title
  #   Default title for threads
  #
  # @option opts [String] default_comment
  #   Default comment for threads
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
  # @option opts [String] front_page
  #   Page 0 remote file name
  #
  # @option opts [String] extension
  #   Remote files extension, including the dot
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
  # @option opts [Regexp] threads_pattern Threads regex
  # @option opts [Regexp] replies_pattern Omitted replies and images regex
  # @option opts [Regexp] date_pattern    Date regex
  # @option opts [Regexp] pages_pattern   Page navigation menu regex
  # @option opts [String] spoiler_xpath   Spoiler tags xpath
  # @option opts [Hash]   datemap         Parens match map for the date pattern
  # @option opts [Hash]   matchmap        Parens match map for threads pattern
  #
  # @option opts [Integer] utc_offset
  #   Remote server UTC offset in seconds, defaults to Time.zone_offset('EST')
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
  # @option opts [Integer] teaser_length
  #   Excerpt (teaser) character length. 0 disables teaser generation.
  #   Defaults to 200
  #
  # @option opts [String] server
  #   Remote server URL, defaults to 'http://boards.4chan.org/'
  #
  # @option opts [true, false] relative_urls
  #   Use relative urls for thumbnails. Defaults to false.
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
    
    if @opts.write_html
      require 'erubis'
      @tpl_file = @templates_dir << @opts.html_template
      unless File.exists?(@tpl_file)
        raise "Can't find template #{@tpl_file}" 
      end
      @tpl_mtime = File.mtime(@tpl_file)
      @template = load_template(@tpl_file)
    end
    
    if @opts.write_rss || @opts.spoiler_text
      require 'nokogiri'
      if @opts.write_rss 
        raise "RSS writer: web_uri can't be empty" if !@opts.web_uri
        @opts.rss_desc ||= "Meanwhile, on /#{@opts.slug}/"
      end
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
    
    @entities = HTMLEntities.new
    
    @last_refresh_time = 0
    
    # Thumbnails that appear to be dead will be placed here and
    # deleted during the next refresh cycle
    @delete_queue = []
    
    # Previous refresh cycle highest thread and reply ids
    @last_high_thread = 0
    @last_high_reply = 0
    
    # For stats tracking
    @last_hour = false
    
    # For stats tracking and speed adjustment
    @first_run = true
    
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
    
    @pages_uri = URI.parse(@opts.server)
    
    # Number of dropped pages during a refresh cycle
    @pages_dropped = 0
    
    # If too much pages were dropped, the thumbnail purging is skipped
    @page_drop_limit = (@opts.page_count[0] * PURGE_SKIP).ceil
    
    # jsonified threadlist cache for when write_json and write_html are true
    @json_cache = nil
    
    # Last full refresh cycle time (Time UTC)
    @last_full_cycle = 0
    
    # Last successful write time (Time UTC)
    @mtime = 0
    
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
  
  # Cleans up stuff
  def cleanup
    @log.close unless @opts.debug
    @stats_io.close if @stats_io
  end
  
  # Counts images and replies and tracks the highest reply id
  # @param [String] html page HTML to process
  # @return [Hash]
  def count_replies(html)
    reply_count = { :rep => Hash.new(0), :img => Hash.new(0) }
    replies = html.scan(@opts.replies_pattern)
    replies.each do |r|
      reply_id = r[0].to_i
      @this_high_reply = reply_id if reply_id > @this_high_reply
      reply_count[:rep][r[1]] += 1
      reply_count[:img][r[1]] += 1 if r[2]
    end
    reply_count
  end
  
  # Generates the excerpt (teaser)
  # @param [String] str Comment body
  # @param [true, false] has_spoilers Teaser contains spoilers
  # @return [String]
  def cut_teaser(str, has_spoilers = false)
    teaser = @entities.decode(str)
    if teaser.length > @opts.teaser_length
      teaser = @entities.encode(teaser[0, @opts.teaser_length])
      if has_spoilers
        teaser.gsub!(/\[[\/spoiler\]]{0,8}$/, '')
        o = teaser.scan(/\[spoiler\]/).length
        c = teaser.scan(/\[\/spoiler\]/).length
        if (d = o - c) > 0
          teaser << '[/spoiler]' * d
        end
      end
      teaser << '…'
    else
      str
    end
  end
  
  # HTTP requests
  # @param [Net::HTTP] http HTTP object to use for the connection
  # @param [String] path
  # @return [String] Response body
  def fetch(http, path)
    try = 1
    begin
      resp = http.request_get(path, @headers)
      if resp.code != '200'
        if resp.code == '404'
          raise HTTPNotFound, "Not Found #{http.address}#{path}"
        elsif resp.code == '302'
          raise HTTPFound, 'HTTP 302'
        else
          raise HTTPError, "HTTP #{resp.code}"
        end
      end
    rescue HTTPNotFound => e
      raise e
    rescue Timeout::Error, HTTPError => e
      if try > @opts.retries
        raise "Skipping after #{e.message}: #{http.address}#{path}"
      end
      @log.debug "Retrying after #{e.message} (#{try}): #{http.address}#{path}"
      if e.kind_of?(HTTPFound)
        try += @opts.retries
        path << '?4cat'
      else
        try += 1
      end
      sleep(@opts.req_delay)
      retry
    end
    resp
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
    if @opts.relative_urls
      uri = @pages_uri
      uri.path = url
    else
      uri = URI.parse(url)
    end
    http = Net::HTTP.new(uri.host, uri.port)
    http.open_timeout = http.read_timeout = @opts.req_timeout
    fetch(http, uri.path).body
  end
  
  # Fetches a page
  # @param [Fixnum] page_num Page number
  # @see #fetch
  def get_page(page_num)
    http = Net::HTTP.new(@pages_uri.host, @pages_uri.port)
    http.open_timeout = http.read_timeout = @opts.req_timeout
    
    path = "#{@pages_uri.path}#{@board}/" <<
      if page_num.zero?
        @opts.front_page
      else
        "#{page_num}#{@opts.extension}"
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
      @log.debug("Repacking invalid UTF-8 string: #{path}")
      data = data.unpack('C*').pack('U*')
    end
    
    data
  end
  
  # Creates board specific directories
  def init_dirs
    if !File.directory?(@thumbs_dir)
      @log.debug 'First run: creating directories'
      FileUtils.mkdir_p(@thumbs_dir)
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
      threads[id][:teaser] = thread[:teaser] if thread[:teaser]
      threads[id][:author] = thread[:author] if thread[:author]
      threads[id][:r] = thread[:r] if thread[:r] != 0
      threads[id][:i] = thread[:i] if thread[:i]
      threads[id][:s] = thread[:s] if thread[:s]
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
      :server     => "#{@opts.server}#{@board}/",
      :ext        => @opts.extension,
    }.to_json
    
    if @opts.write_json && @opts.write_html
      @json_cache = json
    else
      json
    end
  end
  
  # Generates links to threads
  # @param [Integer] id Thread id
  # @return [String] the thread's URL
  def link_to_thread(id)
    "#{@opts.server}#{@board}/res/#{id}#{@opts.extension}"
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
    
    cycle_start = Time.now.utc
    threads = []
    workers = {}
    active_workers = 0
    @pages_dropped = 0
    @max_page = nil
    @this_high_reply = @last_high_reply
    
    for run in 0...@opts.page_count.length
      @log.debug "Run #{run}"
      
      threads[run] = {}
      
      for page in 0...@opts.page_count[run]
        if @max_page && @max_page < page
          @log.debug "Page #{page} is empty, breaking"
          break
        end
        if workers[lw = "#{run - 1}-#{page}"] && workers[lw].alive?
          @log.debug "Last run worker is still alive, skipping page #{page}"
          next
        end
        while active_workers >= @opts.workers_limit
          sleep(@opts.req_delay)
        end
        @log.debug "Page #{page}"
        workers["#{run}-#{page}"] = Thread.new(threads[run], page) do |th, page|
          begin
            active_workers += 1
            html = get_page(page)
            @max_page =
              if @max_page = html.scan(@opts.pages_pattern).last
                @max_page[0].to_i
              else
                @log.error "Pattern: can't find max page"
                @opts.page_count[run] - 1
              end unless @max_page
            th[page] = scan_threads(html) if @max_page >= page
          rescue HTTPNotFound => e
            @log.debug "Page #{page} not found"
            @max_page = page
          rescue StandardError => e
            @pages_dropped += 1
            @log.error get_error(e)
          ensure
            active_workers -= 1
          end
        end
        sleep @opts.req_delay
      end
    end
    
    wait_for_workers(workers)
    
    threadlist = {}
    stickies = []
    natural_order = []
    new_threads = 0
    
    run = threads.length - 1
    while run >= 0
      page_order = []
      threads[run].each_value do |page_threads|
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
    
    order = {}
    order[:alt] = natural_order.flatten.unshift(*stickies)
    order[:date] = order[:alt].sort { |x, y| y <=> x }
    order[:r] = order[:alt].sort do |x, y|
      threadlist[y][:r] <=> threadlist[x][:r]
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
      
      threadlist.each do |id, thread|
        if !thread[:s]
          thumblist["#{@thumbs_dir}#{id}.jpg".freeze] = [ thread[:src], id ]
        end
      end
      
      remote_thumbs = thumblist.keys
      local_thumbs = Dir.glob("#{@thumbs_dir}*.jpg")
      new_thumbs = remote_thumbs - local_thumbs
      
      if @pages_dropped >= @page_drop_limit
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
        @log.debug "Thumbnail (#{id}) #{src}"
        workers[id] = Thread.new do
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
            threadlist[id][:s] = @thumb_404
          ensure
            active_workers -= 1
          end
        end
        sleep @opts.req_delay
      end
      
      wait_for_workers(workers)
    end
    
    unless @first_run
      adjust_speed(new_threads, new_replies)
    else
      @first_run = false
    end
    
    @log.debug "Delay is #{@opts.refresh_delay} (#{new_threads}/#{new_replies})"
    
    if @opts.no_partial && @pages_dropped > 0 &&
        (cycle_start - @last_full_cycle).to_i < @opts.refresh_range[1]
      @log.warn 'Incomplete refresh cycle, skipping output'
    else
      @mtime = Time.now.utc
      
      if @pages_dropped == 0 || @last_full_cycle == 0
        @last_full_cycle = @mtime 
      end
      
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
        write_rss(threadlist, order[:date])
      rescue StandardError => e
        @log.error 'write_rss: ' << get_error(e)
      end if @opts.write_rss
     
      @json_cache = nil if @json_cache
    end
    
    update_stats(new_threads, new_replies) if @opts.stats
    
    @log.debug 'Done'
  end

  # Scans the page for threads
  # @param [String] html raw HTML to process
  # @return [Hash{thread_id(Integer) => Hash}] a Hash of threads
  def scan_threads(html)
    if (matches = html.scan(@opts.threads_pattern))[0] == nil
      raise "Pattern: can't find any threads"
    end
    
    reply_count = count_replies(html)
    
    threads = {}
    
    mm = @opts.matchmap
    dm = @opts.datemap
    
    matches.each do |t|
      # Skipping threads with no image
      next if t[mm[:thumb]] == nil
      
      thread = {}
      
      # Link to thread
      thread[:href] = link_to_thread(t[mm[:id]])
      
      # Sticky thread? [true, false]
      thread[:sticky] = t[mm[:status]].include?('sticky') if mm[:status] != nil
      
      # Title [String]
      t[mm[:title]].gsub!(TAG_REGEX, '')
      thread[:title] = t[mm[:title]]
      
      # Comment [String]
      thread[:body] =
        if @opts.spoiler_text && !t[mm[:body]].empty?
          t[mm[:body]].gsub!(/\[\/spoiler\]/, BB_TAGS)
          frag = Nokogiri::HTML.fragment(t[mm[:body]], 'utf-8')
          nodes = frag.xpath('./span[@class="spoiler"]')
          if nodes.empty?
            has_spoilers = false
            t[mm[:body]]
          else
            has_spoilers = true
            nodes.each do |node|
              node.remove if node.content == ''
              node.replace(Nokogiri::HTML.fragment(
                "[spoiler]#{node.inner_html}[/spoiler]", 'utf-8'))
            end
            frag.to_s
          end
        else
          has_spoilers = false
          t[mm[:body]]
        end
      thread[:body].gsub!(LB_REGEX, "\n")
      thread[:body].gsub!(TAG_REGEX, '')
      
      # Teaser [String, nil]
      if @opts.teaser_length > 0
        thread[:teaser] =
          if thread[:title] != @opts.default_title
            if thread[:body] != @opts.default_comment
              cut_teaser("#{thread[:title]}: #{thread[:body]}", has_spoilers)
            else
              cut_teaser(thread[:title])
            end
          else
            cut_teaser(thread[:body], has_spoilers)
          end
        thread[:teaser].gsub!(/\n+/, ' ')
        thread[:teaser].gsub!(PB_REGEX, '')
      end
      thread[:body].gsub!("\n", '<br>')
      
      if has_spoilers
        thread[:body].gsub!(/\[\/?spoiler\]/, BB_TAGS) 
        thread[:teaser].gsub!(/\[\/?spoiler\]/, BB_TAGS)
      end
      
      # Thumbnail filename or special file (spoiler, 404) [String]
      if @opts.text_only || t[mm[:thumb]].include?(@opts.filedeleted_mark)
        thread[:s] = @thumb_404
      elsif t[mm[:thumb]].include?(@opts.spoiler_mark)
        thread[:s] = @spoiler_pic
      end
      
      # Thumbnail URL [String]
      thread[:src] = t[mm[:thumb]]
      
      # Author [String]
      t[mm[:author]].strip!
      t[mm[:author]].gsub!(PB_REGEX, '')
      t[mm[:author]].gsub!(TAG_REGEX, '') # Staff vanity posts clean up
      
      thread[:author] = t[mm[:author]] if t[mm[:author]] != @opts.default_name
      
      # Omitted replies [Integer]
      thread[:r] = reply_count[:rep][t[mm[:id]]]
      thread[:r] += t[mm[:orep]].to_i if t[mm[:orep]]
      
      # Omitted images [Integer]
      if mm[:oimg] != nil
        thread[:i] = reply_count[:img][t[mm[:id]]]
        thread[:i] += t[mm[:oimg]].to_i
      end
      
      # Date UTC [Time]
      d = t[mm[:date]].scan(@opts.date_pattern)[0]
      
      if (d == nil)
        @log.error "Pattern: can't find the date"
        thread[:date] = Time.now.utc
      else
        d[dm[:year]] = (d[dm[:year]].to_i + 2000) if d[dm[:year]][3] == nil
        thread[:date] =
          Time.utc(
            d[dm[:year]],
            d[dm[:month]],
            d[dm[:day]],
            d[dm[:hour]],
            d[dm[:minute]],
            dm[:second] ? d[dm[:second]] : nil
          ) - @opts.utc_offset
      end
      
      threads[t[mm[:id]].to_i] = thread
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
  
  # Waits until all workers are dead
  # @param [Hash] workers Hash of workers
  def wait_for_workers(workers)
    while !workers.empty?
      @log.debug 'Waiting for workers...'
      workers.each do |k, w|
        while w && w.alive?
          sleep 1
        end
        workers.delete(k)
      end
    end
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
    
    File.open(@board_file, 'w:UTF-8') do |f|
      @log.debug "Writing #{@board_file}"
      f.write(html)
    end
    
    if @opts.precompress
      Zlib::GzipWriter.open("#{@board_file}.gz") do |f|
        @log.debug "Writing #{@board_file}.gz"
        f.write(html)
      end
    end
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
    
    File.open(@json_file, 'w:UTF-8') do |f|
      @log.debug "Writing #{@json_file}"
      f.write(data)
    end
    
    if @opts.precompress
      Zlib::GzipWriter.open("#{@json_file}.gz") do |f|
        @log.debug "Writing #{@json_file}.gz"
        f.write(data)
      end
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
              xml.title "No.#{id}"
              src = @rss_content_uri +
                if th[:s]
                  "images/#{th[:s]}"
                else
                  @opts.slug + "/src/#{id}.jpg"
                end
              xml.description(
                '<img src="' << src << '" alt="' << "#{id}" << '" />' <<
                '<p>' << (th[:teaser] || th[:body]) << '</p>'
              )
              xml.link "#{th[:href]}"
              xml.guid "#{th[:href]}"
              xml.pubDate th[:date].rfc2822.to_s
            }
          end
        }
      }
    end
    
    output = builder.to_xml(:indent => 0, :encoding => 'UTF-8')
    File.open("#{@board_dir}feed.rss", 'w:UTF-8') do |f|
      @log.debug "Writing #{@board_dir}feed.rss"
      f.write(output)
    end
    
    if @opts.precompress
      Zlib::GzipWriter.open("#{@board_dir}feed.rss.gz") do |f|
        @log.debug "Writing #{@board_dir}feed.rss.gz"
        f.write(output)
      end
    end
  end

end

# Raised on HTTP responses other than 200 and 404
class HTTPError < StandardError; end

# Raised on HTTP 404
class HTTPNotFound < HTTPError; end

# Raised on HTTP 302
class HTTPFound < HTTPError; end

# Raised when asked to halt
class CatalogHalt < StandardError; end

end
