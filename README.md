# 4cat
4chan thread catalog generator.

## System requirements
- Ruby 2.0 or higher.
- Gems
  - `daemons` if you want to use the provided daemonizer.
  - `erubis` for html output.
  - `nokogiri` with libxml 2.7.7 or higher.
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

***

> **Symbol**: `spoiler_text`  
  **Type**: true, false  
  **Default**: `false`

Hide spoilered text in the catalog.

***

> **Symbol**: `remove_{exif,oekaki,fortune}`  
  **Type**: true, false  
  **Default**: `false`

Remove EXIF/Oekaki/Fortune metadata.

***

> **Symbol**: `filename_tag`  
  **Type**: true, false  
  **Default**: `false`

Generate a filterable tags from filenames.

***

> **Symbol**: `archive`  
  **Type**: String, nil  
  **Default**: `nil`

Fuuka style archive host. ex: `archive.example.com`
