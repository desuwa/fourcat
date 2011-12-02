defaults: {
  #stats: true,
  #precompress: true,
  #write_rss: true,
  #web_uri: 'http://catalog.neet.tv/',
},

boards: {
  a: {
    title: '/a/ - Animu & Mango',
    page_count: [ 16, 3, 1 ],
  },
  
  jp: {
    proxy: 'http://fuuka.warosu.org/jp/thread/',
    refresh_delay: 120,
    refresh_range: [ 60, 240 ],
  },
}
