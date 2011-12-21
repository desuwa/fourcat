# 4cat
Thread catalog generator for 4chan and other futaba style boards.

## System requirements
- Ruby 1.9.2 or better.
- Gems
  - `htmlentities`
  - `daemons` if you want to use the provided daemonizer.
  - `erubis` for html output.
  - `nokogiri` if you want RSS feeds.
- A webserver, anything that can serve static files is fine.

## Usage
To manually refresh a board use `refresh.rb <slug>` 
Example: `./refresh.rb jp` will generate a catalog for /jp/ under `./public/jp/`  
Use this to test your installation or, if you host multiple boards, to pre-fetch thumbnails and minimize hammering during the first run.

To continuously run the crawler use `run.rb`  
The script will start, kill and reload worker threads according to the settings in `config.rb`  
Pass `-gentle <seconds>` as argument to add a delay betwen the start of each worker thread.

To run the crawler in the background use `daemon.rb`  
You can pass additional arguments to the daemonized script by separating them with two *hyphens*: `daemon.rb start -- -gentle 20` 
To reload the configuration file, send a `SIGHUP` to the process, or use `daemon.rb reload`. Only board specific settings will be reloaded.

## Settings
Settings are stored inside the `config.rb` file as a Ruby Hash (minus the wrapping curly brackets). 
Check `fourcat.rb` for the complete list of available options.

Some basic options:

> **Symbol**: `page_count`  
  **Type**: Array of Integers  
  **Default**: `[ 16, 2 ]`

Maximum number of pages to fetch per run during a refresh cycle.  
By default, the crawler will fetch the first 16 pages during the first run, then 2 pages during the second run.  
This is usually fine for moderately slow boards like /tg/ or /tv/.  
For fast moving boards you will probably need to add a third run: `[ 16, 3, 1]`.  
Other comatose boards will do fine with `[ 16, 1 ]`

***

> **Symbol**: `refresh_delay`  
  **Type**: Integer  
  **Default**: `60`

Base refresh delay in seconds. Will be (loosely) adjusted according to the board's speed.

***

> **Symbol**: `refresh_range`  
  **Type**: Array of Integers  
  **Default**: `[ 60, 300 ]`

Minimum and maximum refresh delays.

***

> **Symbol**: `request_delay`  
  **Type**: Float  
  **Default**: `1.2`

Delay, in seconds, between http requests.

***

> **Symbol**: `teaser_length`  
  **Type**: Integer  
  **Default**: `200`

Excerpt (teaser) character length.

***

> **Symbol**: `title`  
  **Type**: String  
  **Default**: `/<board's remote slug>/ - Catalog`

Board's title. Also used in RSS feeds.

***

> **Symbol**: `write_rss`  
  **Type**: true, false  
  **Default**: `false`

Generate RSS feed.  
You will need to set the `web_uri` option to point to your catalog's base URL.

***

> **Symbol**: `stats`  
  **Type**: true, false  
  **Default**: `false`

Track statistics.
This doesn't generate any HTML, you will need to set up a cron task to run `make_stats.rb` for that.
