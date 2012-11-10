# encoding: utf-8
require 'fileutils'
require 'htmlentities'
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
  
  VERSION     = '1.3.2'
  
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
    :precompress      => false,
    :stats            => false,
    :proxy            => nil,
    :debug            => false,
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
    :remove_exif      => false,
    :remove_oekaki    => false,
    :country_flags    => false,
    :req_delay        => 1.2,
    :req_timeout      => 10,
    :retries          => 2,
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
    
    @omitted_regex = /([0-9]+)[^.]+([0-9]+)?/
    
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
    
    # Thumbnail server url for spoiler revealing
    @thumbs_url = "//0.thumbs.4chan.org/#{@opts.slug}/thumb/"
    
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
    
    @pagination_pattern = Regexp.new(
      '\[(?:<a href="[0-9]{1,2}">|<strong>)([0-9]{1,2})(?:</a>|</strong>)\] '
    )
    
    @server = 
      if @opts.use_ssl
        require 'net/https'
        'https'
      else
        'http'
      end
    @server << '://boards.4chan.org/'
    
    @pages_uri = URI.parse(@server)
    
    # Number of dropped pages during a refresh cycle
    @pages_dropped = 0
    
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
        elsif resp.code == '302'
          raise HTTPFound, 'HTTP 302'
        else
          raise "Skipping after HTTP #{resp.code}: #{http.address}#{path}"
        end
      end
    rescue Timeout::Error, Errno::ECONNRESET, HTTPFound => e
      if try > @opts.retries
        raise "Skipping after #{e.message}: #{http.address}#{path}"
      end
      @log.debug "Retrying after #{e.message} (#{try}): #{http.address}#{path}"
      if e === HTTPFound
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
    path << "#{page_num}" unless page_num.zero?
    
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
      if thread[:s]
        threads[id][:s] = thread[:s]
        threads[id][:splr] = true if thread[:splr]
      end
      if thread[:r] != 0
        threads[id][:r] = thread[:r]
        threads[id][:i] = thread[:i] if thread[:i]
      end
      if @opts.country_flags
        threads[id][:loc] = thread[:loc]
        threads[id][:locname] = thread[:locname]
      end
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
      :pagesize   => @opts.page_size,
      :server     => "#{@server}#{@board}/"
    }
    
    json[:flags] = true if @opts.country_flags
    
    if @opts.write_json && @opts.write_html
      @json_cache = json.to_json
    else
      json.to_json
    end
  end
  
  # Generates links to threads
  # @param [Integer] id Thread id
  # @return [String] the thread's URL
  def link_to_thread(id)
    "#{@server}#{@board}/res/#{id}#{@opts.extension}"
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
    @pages_dropped = 0
    @this_high_reply = @last_high_reply
    
    for run in 0...@opts.page_count.length
      @log.debug "Run #{run}"
      
      @next_page_empty = false
      
      threads[run] = []
      
      for page in 0...@opts.page_count[run]
        if @next_page_empty
          @log.debug "Page #{page} is empty, breaking"
          break
        end
        while active_workers >= @opts.workers_limit
          sleep(@opts.req_delay)
        end
        @log.debug "Page #{page}"
        workers["#{run}-#{page}"] = Thread.new(threads[run], page) do |th, page|
          begin
            active_workers += 1
            th[page] = scan_threads(get_page(page))
          rescue HTTPNotFound => e
            @log.debug "Page #{page} not found"
            @next_page_empty = true
          rescue StandardError => e
            @pages_dropped += 1
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
        if thread[:src]
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
            threadlist[id].delete(:src)
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
    
    unless @first_run
      adjust_speed(new_threads, new_replies)
    else
      @first_run = false
    end
    
    @log.debug "Delay is #{@opts.refresh_delay} (#{new_threads}/#{new_replies})"
    
    if @opts.no_partial && @pages_dropped > 0
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
    doc = Nokogiri::HTML.parse(html)
    
    nextpage = doc.xpath(
      'html/body/div[@class="pagelist desktop"]/div[@class="next"]')[0]
    
    if nextpage && nextpage.children[0]
      unless nextpage.children[0].name == 'form'
        @next_page_empty = true
      end
    else
      @log.debug('Can not find the page navigation')
    end
    
    nodes = doc.xpath(
      'html/body/form[@id="delform"]/div[@class="board"]/div[@class="thread"]'
    )
    
    if nodes.empty?
      raise 'Can not find any threads'
    end
    
    threads = {}
    
    nodes.each do |n|
      th = {}
      
      # Thread id
      th[:id] = n['id'][1..-1]
      
      unless op = n.xpath("div[@id='pc#{th[:id]}']/div[@id='p#{th[:id]}']")[0]
        raise "Can not find the OP for thread #{th[:id]}"
      end
      
      unless postinfo = op.xpath(".//div[@id='pi#{th[:id]}']")[0]
        raise "Can not find the postinfo for thread #{th[:id]}"
      end
      
      # Link to thread
      th[:href] = link_to_thread(th[:id])
      
      # Sticky thread?
      th[:sticky] = !postinfo.xpath('.//img[@title="Sticky"]').empty?
      
      # Title
      if th[:title] = postinfo.xpath("span[@class='subject']")[0]
        th[:title] = th[:title].inner_html
      else
        @log.warn("Can not find the title for thread #{th[:id]}")
        th[:title] = ''
      end
      
      # Comment
      if msg = op.xpath('blockquote[@class="postMessage"]')[0]
        # Comment too long. Click here to view the full text.
        if meta = msg.xpath('span[@class="abbr"]')[0]
          meta.remove
        end
        
        # Remove EXIF meta
        if @opts.remove_exif
          if (meta = msg.last_element_child) && meta['class'] == 'exif'
            meta.remove
          end
        end
        
        # Remove Oekaki meta
        if @opts.remove_oekaki
          if (meta = msg.last_element_child) && meta.name == 'small'
            meta.remove
          end
        end
        
        # Spoilers
        if @opts.spoiler_text && !msg.text.empty?
          spoilers = msg.xpath('span[@class="spoiler"]')
          if spoilers.empty?
            has_spoilers = false
          else
            has_spoilers = true
            spoilers.each do |s|
              if s.content == ''
                s.remove
              else
                s.inner_html =
                  "[spoiler]#{s.inner_html.gsub(TAG_REGEX, '')}[/spoiler]"
              end
            end
          end
        else
          has_spoilers = false
        end
        th[:body] = msg.inner_html.gsub(LB_REGEX, "\n")
        th[:body].gsub!(TAG_REGEX, '')
      else
        @log.warn("Can not find the message body for thread #{th[:id]}")
        th[:body] = ''
      end
      
      if has_spoilers
        th[:body].gsub!(/\[\/?spoiler\]/, BB_TAGS) 
      end
      
      # Teaser
      th[:teaser] =
        unless th[:title].empty?
          unless th[:body].empty?
            "#{th[:title]}: #{th[:body].gsub(/\n+/, ' ')}"
          else
            th[:title]
          end
        else
          th[:body].gsub(/\n+/, ' ')
        end
      
      th[:teaser].gsub!(PB_REGEX, '')
      
      th[:body].gsub!("\n", '<br>')
      
      # Thumbnail
      thumb = op.xpath("div[@id='f#{th[:id]}']")[0]
      
      if !thumb || @opts.text_only
        th[:s] = @thumb_404
      else
        thumb = thumb.xpath('.//img')[0]
        if !thumb || thumb['src'].include?('deleted')
          th[:s] = @thumb_404
        elsif thumb['src'].include?('spoiler')
          th[:s] = @spoiler_pic
          th[:splr] = true
          th[:src] = @thumbs_url + thumb.parent['href'][-17, 13] + 's.jpg'
        else
          th[:src] = thumb['src']
        end
      end
      
      # Author
      author = op.xpath(
        ".//div[@id='pi#{th[:id]}']/span[contains(@class, 'nameBlock')]"
      )
      if author[0]
        if (@opts.country_flags &&
          (flag = author.xpath('.//img[@class="countryFlag"]')[0])
        )
          th[:loc] = flag['alt'].downcase
          th[:locname] = flag['title']
        end
        if userid = author.xpath(".//span[contains(@class, 'posteruid')]")[0]
          userid.remove
        end
        author = author[0].text.gsub(TAG_REGEX, '').strip
        author.gsub!(PB_REGEX, '')
        th[:author] = author if author != @opts.default_name
      else
        @log.warn("Can not find the author for thread #{th[:id]}") 
      end
      
      # Omitted replies and images
      th[:r] = 0
      th[:i] = 0
      replies = n.xpath('div[@class="postContainer replyContainer"]')
      replies.each do |r|
        reply_id = r['id'][2..-1].to_i
        @this_high_reply = reply_id if reply_id > @this_high_reply
        th[:r] += 1
        th[:i] += 1 if r.xpath('.//div[@class="file"]')[0]
      end
      
      if omitted = n.xpath('span[@class="summary desktop"]')[0]
        if omitted = omitted.text.scan(/([0-9]+)[^.0-9]+([0-9]+)?/)[0]
          th[:r] += omitted[0].to_i
          th[:i] += omitted[1].to_i if omitted[1]
        else
          @log.warn("Can not parse omitted replies for thread #{th[:id]}") 
        end
      end
      
      # Timestamp UTC
      if th[:date] = op.xpath(".//span[@class='dateTime']")[0]
        th[:date] = Time.at(th[:date]['data-utc'].to_i)
      else
        @log.warn("Can not find the timestamp for thread #{th[:id]}")
        th[:date] = Time.now
      end
      
      threads[th[:id].to_i] = th
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
    @log.debug 'Writing ' << path
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
              title << ": " << th[:title] if th[:title] != ''
              xml.title title
              src = @rss_content_uri +
                if th[:s]
                  "images/#{th[:s]}"
                else
                  @opts.slug + "/src/#{id}.jpg"
                end
              xml.description(
                '<img src="' << src << '" alt="' << "#{id}" << '" />' <<
                '<p>' << th[:body] << '</p>'
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
    
    write_content(output, @rss_file)
    write_content(output, @rss_file + '.gz', true) if @opts.precompress
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
