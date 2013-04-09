$.fourcat = function() {
  
  var fc = this,
  
  defaults = {
    // Order: 'date', 'alt' or 'r'
    orderby: 'date',
    // Thumbnail size: 'small' or 'large'
    thsize: 'small',
    // Show teaser
    extended: true,
    // Redirect to the archive
    proxy: false,
    // Small thumbnail size
    smallsize: 150,
    // Columns margin for the wide layout
    columnMargin: 3,
    // Thumbnails server url
    contentUrl: '/',
    // Filters color palette
    filterColors: [
      ['#E0B0FF', '#F2F3F4', '#7DF9FF', '#FFFF00'],
      ['#FBCEB1', '#FFBF00', '#ADFF2F', '#0047AB'],
      ['#00A550', '#007FFF', '#AF0A0F', '#B5BD68']
    ],
    server: 'http://boards.4chan.org/',
    tooltipDelay: 350
  },
  
  keybinds = {
    83: focusQuickfilter, // S
    82: refreshWindow, // R
    88: cycleOrder // X
  },
  
  catalog = {},
  
  lastReplies = {},
  
  options = {},
  
  basicSettings = [ 'orderby', 'thsize', 'extended', 'proxy' ],
  
  tooltipTimeout = null,
  hasTooltip = false,
  expandedThumbnail = null,
  isStyleSheetLoaded = true,
  isCtrlKeyPressed = false,
  
  activeTheme = {},
  
  activeFilters = {},
  
  pinnedThreads = {},
  
  hiddenThreads = {},
  hiddenThreadsCount = 0,
  
  quickFilterPattern = false,
  
  hasContextMenu = 'HTMLMenuItemElement' in window,
  hasNativeJSON = typeof JSON != 'undefined',
  hasWebStorage = (function() {
    try {
      localStorage.getItem('filters');
      return true;
    } catch(e) {
      return false;
    }
  })(),
  
  pulseInterval = null,
  
  $threads,
  $thumbs,
  $refresh,
  $qfCtrl,
  $proxyCtrl,
  $teaserCtrl,
  $sizeCtrl,
  $themePanel,
  $hiddenCount,
  $hiddenLabel,
  $filtersPanel,
  $filterList,
  $filterRgb,
  $filterRgbOk,
  $filteredCount,
  $filteredLabel,
  $filterPalette = null,
  
  ctxCmds;
  
  if (!Array.prototype.indexOf) {
    Array.prototype.indexOf = function () { return -1; }
  }
  
  loadTheme();
  
  // ---
  
  fc.init = function(opts) {
    $threads = $('#threads');
    $refresh = $('#refresh');
    $qfCtrl = $('#qf-ctrl').click(toggleQuickfilter);
    $proxyCtrl = $('#proxy-ctrl');
    $teaserCtrl = $('#teaser-ctrl');
    $sizeCtrl = $('#size-ctrl');
    $themePanel = $('#theme');
    $hiddenCount = $('#hidden-count');
    $hiddenLabel = $('#hidden-label');
    $filtersPanel = $('#filters');
    $filterList = $('#filter-list');
    $filterRgb = $('#filter-rgb').keyup(filterSetCustomColor);
    $filterRgbOk = $('#filter-rgb-ok').click(selectFilterColor);
    $filteredCount = $('#filtered-count');
    $filteredLabel = $('#filtered-label');
    $('#filters-clear-hidden').click(clearHiddenThreads);
    $('#qf-clear').click(toggleQuickfilter);
    $('#theme-ctrl').click(showThemeEditor);
    $('#filters-ctrl').click(showFilters);
    
    applyTheme(activeTheme, true);
    
    $(document).on('mouseover', onMouseOver);
    $(document).on('mouseout', onMouseOut);
    
    $('#totop').find('.button').click(function() { window.scrollTo(0, 0); });
    
    if (hasContextMenu) {
      buildContextMenu();
    }
    
    $sizeCtrl.click(function() {
      setSize(options.thsize == 'small' ? 'large' : 'small');
    });
    
    $('#order-ctrl').click(cycleOrder);
    $('#order-cnt')
      .on('click', onOrderListClick)
      .on('mouseover', showOrderMenu)
      .on('mouseout', hideOrderMenu);
    
    $teaserCtrl.click(function() {
      setExtended(!options.extended);
    });
    
    $proxyCtrl.click(function() {
      setProxy(!options.proxy);
    });
    
    $.extend(options, defaults, opts);
    
    loadSettings();
    
    initMergeGroups();
    
    bindGlobalShortcuts();
    
    setOrder(options.orderby, true);
    setSize(options.thsize, true);
    setExtended(options.extended, true);
    applyLayout(true);
  }
  
  function showOrderMenu() {
    document.getElementById('order-list').style.display = 'block';
  }
  
  function hideOrderMenu() {
    document.getElementById('order-list').style.display = 'none';
  }
  
  function onOrderListClick(e) {
    var order;
    if (order = e.target.getAttribute('data-order')) {
      hideOrderMenu();
      setOrder(order);
    }
  }
  
  function onMouseOver(e) {
    var t = e.target;
    
    if (tooltipTimeout) {
      clearTimeout(tooltipTimeout);
      tooltipTimeout = null;
    }
    if (hasTooltip) {
      hideTooltip();
    }
    if ($(t).hasClass('thumb')) {
      if (activeTheme.magnify && options.thsize == 'small') {
        expandThumbnail(t);
      }
      tooltipTimeout = setTimeout(showPostPreview, options.tooltipDelay, t);
    }
    else if (t.hasAttribute('data-tip')) {
      showTooltip(t);
    }
  }
  
  function onMouseOut(e) {
    if (expandedThumbnail) {
      collapseThumbnail(expandedThumbnail);
    }
  }
  
  function expandThumbnail(t) {
    var
      left, top, css,
      $this = $(t),
      oldWidth = t.offsetWidth,
      oldHeight = t.offsetHeight,
      newWidth, newHeight;
    
    left = t.offsetLeft;
    top = t.offsetTop;
    
    $this.clone().insertAfter($this);
    
    expandedThumbnail = $this[0];
    
    $this.addClass('scaled');
    
    newWidth = t.offsetWidth;
    newHeight = t.offsetHeight;
    
    offsetX = -(newWidth - oldWidth) / 2;
    offsetY = -(newHeight - oldHeight) / 2;
    
    if (activeTheme.wide) {
      offsetX += left;
      offsetY += top;
      css = 'top:0;left:0';
    }
    else {
      css = '';
    }
    
    t.style.cssText = 'margin-left:' + offsetX
      + 'px;margin-top:' + offsetY + 'px;' + css;
  }
  
  function collapseThumbnail(t) {
    var $this = $(t);
    expandedThumbnail = null;
    $this.next().remove();
    
    $this.removeClass('scaled');
    t.style.marginLeft = '';
    t.style.marginTop = '';
  }
  
  function showTooltip(t) {
    var el, rect, style, left;
    
    rect = t.getBoundingClientRect();
    
    el = document.createElement('div');
    el.id = 'tooltip';
    el.textContent = t.getAttribute('data-tip');
    
    document.body.appendChild(el);
    
    left = rect.left - (el.offsetWidth - t.offsetWidth) / 2;
    
    if (left < 0) {
      left = rect.left;
    }
    else if (left + el.offsetWidth > document.documentElement.clientWidth) {
      left = rect.left - el.offsetWidth + t.offsetWidth;
    }
    
    style = el.style;
    style.top = (rect.top - el.offsetHeight + window.pageYOffset - 5) + 'px';
    style.left = left + window.pageXOffset + 'px';
    
    hasTooltip = true;
  }
  
  function buildLastReplies(replies) {
    var i, reply, now, label, src, height, width, cls = '', html = '';
    
    now = Date.now() / 1000;
    
    if (replies instanceof Array) {
      label = 'Reply from ';
    }
    else {
      replies = [ replies ];
      label = 'Last reply by ';
      cls = ' post-last';
    }
    
    for (i = 0; reply = replies[i]; ++i) {
      html += '<div class="post-reply' + cls + '">'
        + '<div class="post-label">' + label
        + '<span class="post-author">'
        + (reply.author || catalog.anon) + ' </span>'
        + getDuration(now - reply.date)
        + ' ago</div>';
      
      if (reply.img) {
        width = reply.w;
        height = reply.h;
        
        if (reply.s) {
          if (reply.splr && activeTheme.nospoiler) {
            width = reply.sw;
            height = reply.sh;
            src = catalog.slug + '/src/' + reply.img + '.jpg';
          }
          else {
            src = 'images/' + reply.s;
          }
        }
        else {
          src = catalog.slug + '/src/' + reply.img + '.jpg';
        }
        
        html += '<img class="post-thumb" src="/' + src + '" width="'
          + width + '" height="' + height + '">';
      }
      
      if (reply.teaser) {
        html += '<p class="post-teaser">' + reply.teaser + '</p>';
      }
      
      html += '</div>';
    }
    
    return html;
  }
  
  function fetchLastReplies(tid) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'replies/' + tid + '.json', true);
    xhr.onload = function() {
      var el;
      if (this.status == 200) {
        lastReplies[tid] = JSON.parse(this.responseText);
        el = document.getElementById('tooltip');
        if (el && el.getAttribute('data-tid') == tid) {
          el.style.top = el.style.left = '';
          el.innerHTML += buildLastReplies(lastReplies[tid]);
          adjustPostPreview(document.getElementById('thumb-' + tid), el);
        }
      }
      else {
        this.onerror();
      }
    }
    xhr.onerror = function() {
      console.log('Error fetching last replies (' + this.status + ')');
    }
    xhr.send(null);
  }
  
  function showPostPreview(t) {
    var tid, reply, tip, now, pos, el, rect, docWidth, style, page;
    
    thread = catalog.threads[tid = t.getAttribute('data-id')];
    
    now = Date.now() / 1000;
    
    tip = '<div class="post-op"><span class="post-label">Posted by </span>'
      + '<span class="post-author">'
      + (thread.author || catalog.anon) + ' </span>'
      + '<span class="post-ago">'
      + getDuration(now - thread.date)
      + ' ago </span>'
      + ((page = getThreadPage(tid)) > 0 ? ('<span class="post-page"> (page '
      + page + ')</span>') : '');
    
    if (!options.extended && thread.teaser) {
      tip += '<p class="post-teaser">' + thread.teaser + '</p>';
    }
    
    tip += '</div>';
    
    if (thread.lr) {
      if (isCtrlKeyPressed || activeTheme.replies) {
        if (lastReplies[tid]) {
          tip += buildLastReplies(lastReplies[tid]);
        }
        else {
          fetchLastReplies(tid);
        }
      }
      else {
        tip += buildLastReplies(thread.lr);
      }
    }
    
    el = document.createElement('div');
    el.id = 'tooltip';
    el.setAttribute('data-tid', tid);
    el.className = 'post-preview';
    el.innerHTML = tip;
    document.body.appendChild(el);
    
    adjustPostPreview(t, el);
    
    hasTooltip = true;
  }
  
  function adjustPostPreview(thumb, tip) {
    var i, el, style, rect, docWidth, clientHeight, pos, top, bottom, imgs,
      natHeight, natWidth;
    
    style = tip.style;
    style.position = 'fixed';
    
    imgs = tip.getElementsByClassName('post-thumb');
    
    for (i = 0; el = imgs[i]; ++i) {
      natHeight = +el.getAttribute('height');
      if (natHeight != el.clientHeight) {
        natWidth = +el.getAttribute('width');
        el.width = el.clientHeight * natWidth / natHeight;
      }
    }
    
    rect = thumb.getBoundingClientRect();
    docWidth = document.documentElement.offsetWidth;
    clientHeight = document.documentElement.clientHeight;
    
    if ((docWidth - rect.right) < (0 | (docWidth * 0.3))) {
      pos = rect.left - tip.offsetWidth - 5;
    }
    else {
      pos = rect.left + rect.width + 5;
    }
    
    bottom = rect.top + tip.offsetHeight;
    
    if (bottom > clientHeight) {
      top = rect.top - (bottom - clientHeight) - 20;
    }
    else {
      top = rect.top;
    }
    if (top < 0) {
      top = 3;
    }
    
    style.position = '';
    
    style.left = pos + window.pageXOffset + 'px';
    style.top = top + window.pageYOffset + 'px';
  }
  
  function initMergeGroups() {
    var i, data, group, more, menu, li, a, boards;
    
    if (!hasWebStorage) {
      return;
    }
    
    if (data = localStorage.getItem('merge-groups')) {
      data = data.split(/(?:\r\n|\r|\n)+/);
      more = document.getElementById('more-slugs-btn');
      menu = more.parentNode;
      
      for (i = 0; group = data[i]; ++i) {
        boards = group.split(/[^a-z0-9]+/i).join(',');
        
        li = document.createElement('li');
        li.className = 'merge-slug';
        a = document.createElement('a');
        a.className = 'button';
        a.href = '/digest.html#/merge/' + boards;
        a.textContent = '/' + boards + '/';
        li.appendChild(a);
        li.appendChild(document.createTextNode(' '));
        
        menu.insertBefore(li, more);
      }
    }
  }
  
  function hideTooltip() {
    document.body.removeChild(document.getElementById('tooltip'));
    hasTooltip = false;
  }
  
  fc.loadCatalog = function(c) {
    catalog = c;
    loadFilters();
    setProxy(options.proxy, true);
    setSSL(activeTheme.usessl);
    loadStorage();
    updateTime();
    $refresh[0].setAttribute('data-tip', $refresh[0].getAttribute('data-label')
      + ' ' + getDuration(catalog.delay, true));
    buildThreads();
    clearInterval(pulseInterval);
    pulseInterval = setInterval(updateTime, 10000);
  }
  
  function setSSL(val) {
    if (val === undefined) {
      return;
    }
    if (val) {
      options.server = options.server.replace(/^http:/, 'https:');
    }
    else {
      options.server = options.server.replace(/^https:/, 'http:');
    }
  }
  
  function getRegexSpecials() {
    var specials = ['/', '.', '*', '+', '?', '(', ')', '[', ']', '{', '}', '\\' ];
    return new RegExp('(\\' + specials.join('|\\') + ')', 'g');
  }
  
  function getThreadPage(tid) {
    return 0 | (catalog.order.alt.indexOf(+tid) / catalog.pagesize);
  }
  
  // Requires proper expiration headers
  function refreshWindow() {
    location.href = location.href;
  }
  
  function debounce(delay, fn) {
    var timeout;
    
    return function() {
      var args = arguments, context = this;
      
      clearTimeout(timeout);
      timeout = setTimeout(function () {
        fn.apply(context, args);
      }, delay);
    };
  }
  
  function focusQuickfilter() {
    var qf;
    
    if ($qfCtrl.hasClass('active')) {
      clearQuickfilter(true);
    }
    else {
      toggleQuickfilter();
    }
  }
  
  function toggleQuickfilter() {
    var qfcnt = document.getElementById('qf-cnt');
    if ($qfCtrl.hasClass('active')) {
      clearQuickfilter();
      qfcnt.style.display = 'none';
      $qfCtrl.removeClass('active');
      $('#qf-box').off('keyup').off('keydown')[0].blur();
    }
    else {
      qfcnt.style.display = 'inline';
      $('#qf-box')
        .keyup(debounce(250, applyQuickfilter))
        .keydown(function(e) {
          if (e.keyCode == 27) {
            toggleQuickfilter();
          }
        })
        .focus()[0].value = '';
      $qfCtrl.addClass('active');
    }
  }
  
  function applyQuickfilter(e) {
    var qfstr;
    
    if (e && (e.keyCode == 16 || e.keyCode == 17)) {
      return;
    }
    
    qfstr = document.getElementById('qf-box').value;
    
    if (qfstr != '') {
      var regexEscape = getRegexSpecials();
      qfstr = qfstr.replace(regexEscape, '\\$1');
      quickFilterPattern = new RegExp(qfstr, 'i');
      buildThreads();
    }
    else {
      clearQuickfilter();
    }
  }
  
  function clearQuickfilter(focus) {
    var qf = document.getElementById('qf-box')
    if (focus) {
      qf.value = '';
      qf.focus();
    }
    else {
      quickFilterPattern = false;
      buildThreads();
    }
  }
  
  function buildContextMenu() {
    var icon = ' icon="/favicon.ico"';
    
    ctxCmds = {
      pin: toggleThreadPin,
      hide: toggleThreadHide,
      report: reportThread
    }
    
    document.getElementById('ctxmenu-thread').innerHTML = 
      '<menuitem label="Pin/Unpin" data-cmd="pin"' + icon + '></menuitem>' +
      '<menuitem label="Hide" data-cmd="hide"' + icon + '></menuitem>' +
      '<menuitem label="Report" data-cmd="report"' + icon + '></menuitem>';
    
    $('#ctxmenu-thread').click(onThreadContextClick);
  }
  
  function bindGlobalShortcuts() {
    if (hasWebStorage && hasNativeJSON) {
      $threads.on('mousedown', onMouseDown);
      $threads.on('click', onClick);
    }
    
    document.addEventListener('keyup', onKeyUp, false);
    document.addEventListener('keydown', onKeyDown, false);
  }
  
  function onMouseDown(e) {
    var tid, el = e.target;
    
    if (el.className.indexOf('thumb') != -1) {
      tid = el.getAttribute('data-id');
      if (e.which == 3) {
        $threads[0].setAttribute('contextmenu', 'ctxmenu-thread');
        document.getElementById('ctxmenu-thread').target = tid;
      }
      else if (e.which == 1) {
        if (e.altKey) {
          toggleThreadPin(tid);
        }
        else if (e.shiftKey) {
          toggleThreadHide(tid)
        }
        return false;
      }
      clearTimeout(tooltipTimeout);
    }
    else {
      $threads[0].removeAttribute('contextmenu');
    }
  }
  
  function onClick(e) {
    if (e.target.className.indexOf('thumb') != -1) {
      clearTimeout(tooltipTimeout);
      if (e.which == 1 && (e.altKey || e.shiftKey)) {
        e.preventDefault();
      }
    }
  }
  
  function toggleThreadPin(tid) {
    var meta, page;
    
    if (pinnedThreads[tid] >= 0) {
      delete pinnedThreads[tid];
      buildThreads();
    }
    else {
      pinnedThreads[tid] = catalog.threads[tid].r || 0;
      if (!activeTheme.wide) {
        buildThreads();
      }
      else {
        document.getElementById('thumb-' + tid).className += ' pinned';
        meta = document.getElementById('meta-' + tid);
        meta.title += ' / (P)age';
        page = 'P:<b>' + getThreadPage(tid) + '</b>';
        if (meta.innerHTML) {
          meta.innerHTML += ' / ' + page;
        }
        else {
          meta.innerHTML = page;
        }
      }
    }
    
    localStorage.setItem('pin-' + catalog.slug, JSON.stringify(pinnedThreads));
  }
  
  function toggleThreadHide(tid) {
    hiddenThreads[tid] = true;
    localStorage.setItem('hide-' + catalog.slug, JSON.stringify(hiddenThreads));
    document.getElementById('thread-' + tid).style.display = 'none';
    ++hiddenThreadsCount;
    $hiddenCount[0].textContent = hiddenThreadsCount;
    $hiddenLabel.show();
  }
  
  function reportThread(tid) {
    window.open(
      'http://sys.4chan.org/' + catalog.slug +
      '/imgboard.php?mode=report&no=' + tid,
      Date.now(), 
      'toolbar=0,scrollbars=0,location=0,status=1,menubar=0,resizable=1,' +
      'width=600,height=170'
    );
  }
  
  function onThreadContextClick(e) {
    var cmd = e.target.getAttribute('data-cmd');
    ctxCmds[cmd](document.getElementById('ctxmenu-thread').target);
  }
  
  function onKeyUp(e) {
    var el = e.target;
    
    if (e.keyCode == 17) {
      isCtrlKeyPressed = false;
    }
    
    if (activeTheme.nobinds
      || el.nodeName == 'TEXTAREA'
      || el.nodeName == 'INPUT') {
      return;
    }
    
    if (keybinds[e.keyCode]) {
      keybinds[e.keyCode]();
    }
  }
  
  function onKeyDown(e) {
    if (e.keyCode == 17 && !isCtrlKeyPressed) {
      isCtrlKeyPressed = true;
    }
  }
  
  function clearHiddenThreads() {
    hiddenThreads = {};
    localStorage.removeItem('hide-' + catalog.slug);
    if (hiddenThreadsCount > 0) {
      buildThreads();
    }
    return false;
  }
  
  function clearPinnedThreads() {
    pinnedThreads = {};
    localStorage.removeItem('pin-' + catalog.slug);
    buildThreads();
    return false;
  }
  
  function toggleRadio() {
    var $this = $(this);
    if ($this.hasClass('active')) {
      $this.removeClass('active');
    }
    else {
      $this.parent().find('.active').removeClass('active');
      $this.addClass('active');
    }
  }
  
  function enableButton(el) {
    el.className += ' active';
    el.innerHTML = '&#x2714;';
  }
  
  function disableButton(el) {
    el.className = el.className.replace(' active', '');
    el.innerHTML = '';
  }
  
  function toggleButton(e) {
    var el = e.target || e;
    if (/ active/.test(el.className)) {
      disableButton(el);
    }
    else {
      enableButton(el);
    }
  }
  
  // Generate the color palette for the filters
  function buildFilterPalette() {
    var
      $row,
      $palette = $('#filter-color-table').children('tbody'),
      rows = options.filterColors.length,
      cols = 0;
    
    if (rows > 0) {
      cols = options.filterColors[0].length;
      $('#filter-color-table').children('tfoot').find('td')
        .attr('colspan', cols);
    }
    for (var i = 0; i < rows; ++i) {
      $row = $(document.createElement('tr'));
      for (var j = 0; j < cols; ++j) {
        $row.append(
          $(document.createElement('td')).append(
            $(document.createElement('span')).attr('class', 'button clickbox')
            .css('background', options.filterColors[i][j])
            .click(selectFilterColor)
          )
        );
      }
      $palette.append($row);
    }
  }
  
  function showFilterPalette(e) {
    var pos = $(this).position();
    
    if (!$filterPalette) {
      $filterPalette = $('#filter-palette');
      buildFilterPalette();
    }
    
    $filterPalette.attr('data-target', e.data.fid);
    $filterPalette.css({
      'top': pos.top + 'px',
      'left': (pos.left - $filterPalette.width() - 20) + 'px'
    });
    
    $filterPalette.show();
  }
  
  function showFilters() {
    if (!hasWebStorage) {
      alert("Your browser doesn't support Local Storage");
      return;
    }
    if (!hasNativeJSON) {
      alert("Your browser doesn't support native JSON");
      return;
    }
    if ($filtersPanel.css('display') != 'none') {
      closeFilters();
      return;
    }
    if ($themePanel.css('display') == 'none') {
      $('#filters-close').click(closeFilters);
      
      $('#filters-add').click(addEmptyFilter);
      $('#filters-save').click(saveFilters);
      
      $('#filter-palette-close').click(closeFilterPalette);
      $('#filter-palette-clear').click(clearFilterColor);
      
      $('#filters-help-open').click(function() { $('#filters-protip').show(); });
      $('#filters-help-close').click(function() { $('#filters-protip').hide(); });
      
      var rawFilters = localStorage.getItem('filters'), filterId = 0;
      if (rawFilters) {
        rawFilters = JSON.parse(rawFilters);
        for (var i in rawFilters) {
          $filterList.append(buildFilter(rawFilters[i], filterId));
          ++filterId;
        }
        updateFilterHitCount();
      }
      $filtersPanel.show();
    }
  }
  
  function closeFilters() {
    $('#filters-close').off('click');
    $('#filters-add').off('click');
    $('#filters-save').off('click');
    $('#filter-palette-close').off('click');
    $('#filter-palette-clear').off('click');
    $('#filters-help-open').off('click');
    $('#filters-help-close').off('click');
    
    $('#filters-msg').hide();
    $filtersPanel.hide();
    $filterList.children('tr').remove();
  }
  
  // Loads patterns from the localStorage and builds regexps
  function loadFilters() {
    if (!hasWebStorage) return;
    
    activeFilters = {};
    
    var rawFilters = localStorage.getItem('filters');
    if (!rawFilters) return;
    
    rawFilters = JSON.parse(rawFilters);
    
    var
      rf, fid, v, w, wordcount,
      wordSepS, wordSepE, orJoin,
      regexType = /^\/(.*)\/([im]*)$/,
      regexOrNorm = /\s*\|+\s*/g,
      regexWc = /\\\*/g, replWc = '[^\\s]*',
      regexEscape = getRegexSpecials(),
      match, inner, words, rawPattern, pattern, orOp, orCluster, type;
      
    wordSepS = '(?=[\\s\\S]*\\b';
    wordSepE = '\\b)';
    
    try {
      for (fid in rawFilters) {
        rf = rawFilters[fid];
        if (rf.active && rf.pattern != '') {
          if (rf.boards && rf.boards.split(' ').indexOf(catalog.slug) == -1) {
            continue;
          }
          rawPattern = rf.pattern;
          if (rawPattern.charAt(0) == '#') {
            type = 1;
            pattern = new RegExp(rawPattern.slice(1).replace(regexEscape, '\\$1'));
          }
          else {
            type = 0;
            if (match = rawPattern.match(regexType)) {
              pattern = new RegExp(match[1], match[2]);
            }
            else if (rawPattern.charAt(0) == '"' && rawPattern.charAt(rawPattern.length - 1) == '"') {
              pattern = new RegExp(rawPattern.slice(1, -1).replace(regexEscape, '\\$1'));
            }
            else {
              words = rawPattern.replace(regexOrNorm, '|').split(' ');
              pattern = '';
              wordcount = words.length;
              for (w = 0; w < wordcount; ++w) {
                if (words[w].indexOf('|') != -1) {
                  orOp = words[w].split('|');
                  orCluster = [];
                  for (v = orOp.length - 1; v >= 0; v--) {
                    if (orOp[v] != '') {
                      orCluster.push(orOp[v].replace(regexEscape, '\\$1'));
                    }
                  }
                  inner = orCluster.join('|').replace(regexWc, replWc);
                  pattern += wordSepS + '(' + inner + ')' + wordSepE;
                }
                else {
                  inner = words[w].replace(regexEscape, '\\$1').replace(regexWc, replWc);
                  pattern += wordSepS + inner + wordSepE;
                }
              }
              pattern = new RegExp('^' + pattern, 'im');
            }
          }
          //console.log('Resulting regex: ' + pattern);
          activeFilters[fid] = {
            type: type,
            pattern: pattern,
            boards: rf.boards,
            fid: fid,
            hidden: rf.hidden,
            color: rf.color,
            bright: rf.bright,
            top: rf.top,
            hits: 0
          };
        }
      }
    }
    catch (err) {
      alert('There was an error processing one of the filters: '
        + err + ' in: ' + rf.pattern);
    }
  }
  
  function saveFilters() {
    var rawFilters = {}, $msg = $('#filters-msg'), cols, color, f;
    
    $filterList.children('tr').each(function(i, e) {
      cols = e.children;
      f = {
        active: +(cols[1].firstElementChild.getAttribute('data-active')),
        pattern:  cols[2].firstElementChild.value,
        boards:   cols[3].firstElementChild.value,
        hidden: +(cols[5].firstElementChild.getAttribute('data-hide')),
        top:    +(cols[6].firstElementChild.getAttribute('data-top'))
      };
      color = cols[4].firstElementChild;
      if (!color.hasAttribute('data-nocolor')) {
        f.color = color.style.backgroundColor;
        if (getColorBrightness(f.color) > 125) {
          f.bright = true;
        }
      }
      rawFilters[i] = f;
    });
    
    if (rawFilters[0]) {
      localStorage.setItem('filters', JSON.stringify(rawFilters));
    }
    else {
      localStorage.removeItem('filters');
    }
    
    $msg.html('Done').attr('class', 'msg-ok').show().delay(2000).fadeOut(500);
    
    loadFilters();
    buildThreads();
    updateFilterHitCount();
  }
  
  function filterSetCustomColor() {
    var $this = $(this);
    if ($this.val().search(/^[A-F0-9]{6}$/i) != -1) {
      $filterRgbOk.css({ visibility: 'visible', background: '#' + $this.val() });
    }
    else {
      $filterRgbOk.css({ visibility: 'hidden' });
    }
  }
  
  function closeFilterPalette() {
    $filterPalette.hide();
  }
  
  function onMoveFilterUp(e) {
    var tr, prev;
    
    tr = e.target.parentNode.parentNode;
    prev = tr.previousElementSibling;
    
    if (prev) {
      tr.parentNode.insertBefore(tr, prev);
    }
  }
  
  function buildFilter(filter, id) {
    var td, tr, el, cls;
    
    tr = document.createElement('tr');
    tr.id = 'filter-' + id;
    
    // Drag
    td = document.createElement('td');
    td.innerHTML = '<div title="Move up" class="filter-up">&#x25b2;</div>';
    $(td.firstChild).on('click', onMoveFilterUp);
    tr.appendChild(td);
    
    // On
    td = document.createElement('td');
    el = document.createElement('span');
    el.setAttribute('data-active', filter.active);
    cls = 'button clickbox';
    if (filter.active) {
      cls += ' active';
      el.innerHTML = '&#x2714;';
    }
    el.setAttribute('class', cls);
    $(el).on('click', {type: 'active'}, toggleFilter);
    td.appendChild(el);
    tr.appendChild(td);
    
    // Pattern
    td = document.createElement('td');
    el = document.createElement('input');
    el.type = 'text';
    el.value = filter.pattern;
    el.className = 'filter-pattern';
    td.appendChild(el);
    tr.appendChild(td);
    
    // Boards
    td = document.createElement('td');
    el = document.createElement('input');
    el.type = 'text';
    el.value = filter.boards || '';
    el.className = 'filter-boards';
    td.appendChild(el);
    tr.appendChild(td);
    
    // Color
    td = document.createElement('td');
    el = document.createElement('span');
    el.id = 'filter-color-' + id
    el.setAttribute('class', 'button clickbox');
    if (!filter.color) {
      el.setAttribute('data-nocolor', '1');
      el.innerHTML = '&#x2215;';
    }
    else {
      el.style.background = filter.color;
    }
    $(el).on('click', {fid: id}, showFilterPalette);
    td.appendChild(el);
    tr.appendChild(td);
    
    // Hide
    td = document.createElement('td');
    el = document.createElement('span');
    cls = 'button clickbox filter-hide';
    el.setAttribute('data-hide', filter.hidden);
    if (filter.hidden) {
      cls += ' active';
      el.innerHTML = '&#x2714;';
    }
    el.setAttribute('class', cls);
    $(el).on('click', {type: 'hide', xor: 'top'}, toggleFilter);
    td.appendChild(el);
    tr.appendChild(td);
    
    // Top
    td = document.createElement('td');
    el = document.createElement('span');
    cls = 'button clickbox filter-top';
    el.setAttribute('data-top', filter.top);
    if (filter.top) {
      cls += ' active';
      el.innerHTML = '&#x2714;';
    }
    el.setAttribute('class', cls);
    $(el).on('click', {type: 'top', xor: 'hide'}, toggleFilter);
    td.appendChild(el);
    tr.appendChild(td);
    
    // Del
    td = document.createElement('td');
    el = document.createElement('span');
    el.setAttribute('data-target', id);
    el.setAttribute('class', 'button clickbox');
    el.innerHTML = '&#x2716;';
    $(el).on('click', deleteFilter)
    td.appendChild(el);
    tr.appendChild(td);
    
    // Match count
    td = document.createElement('td');
    td.id = 'fhc-' + id;
    tr.appendChild(td);
    
    return tr;
  }
  
  function selectFilterColor(clear) {
    var $target = $('#filter-color-' + $filterPalette.attr('data-target'));
    if (clear === true) {
      $target.attr('data-nocolor', '1')
        .html('&#x2215;')
        .css('background', '');
    }
    else {
      $target.removeAttr('data-nocolor')
        .html('').css('background', $(this).css('background-color'));
    }
    closeFilterPalette();
  }
  
  function clearFilterColor() {
    selectFilterColor(true);
  }
  
  function getColorBrightness(color) {
    var components, r, g, b;
    if (color[0] == '#') {
      components = color.substring(1)
        .replace(/([0-9A-F]{2})/ig, '0x$1,').split(',');
    }
    else {
      components = color.replace(/[^0-9,]+/g, '').split(',');
    }
    r = parseInt(components[0]);
    g = parseInt(components[1]);
    b = parseInt(components[2]);
    return ((r * 0.299) + (g * 0.587) + (b * 0.114));
  }
  
  function addEmptyFilter() {
    var baseFilter = {
      active: 1,
      pattern: '',
      boards: '',
      color: '',
      hidden: 0,
      top: 0,
      hits: 0
    };
    $filterList[0].appendChild(buildFilter(baseFilter, getNextFilterId()));
  }
  
  function getNextFilterId() {
    var i, j, max, rows = $filterList[0].children;
    
    if (!rows.length) {
      return 0;
    }
    else {
      max = 0;
      for (i = 0; j = rows[i]; ++i) {
        j = +j.id.slice(7);
        if (j > max) {
          max = j;
        }
      }
      return max + 1;
    }
  }
  
  function deleteFilter() {
    $('#filter-' + $(this).attr('data-target')).remove();
  }
  
  function toggleFilter(e) {
    var $this = $(this), attr = 'data-' + e.data.type, xorEle;
    
    if ($this.attr(attr) == '0') {
      $this.attr(attr, '1').addClass('active')[0].innerHTML = '&#x2714;';
      if (e.data.xor) {
        xorEle = $this.parent().parent().find('.filter-' + e.data.xor)
          .attr('data-'  + e.data.xor, '0').removeClass('active')[0]
            .innerHTML = '';
      }
    }
    else {
      $this.attr(attr, '0').removeClass('active')[0].innerHTML = '';
    }
  }
  
  function updateFilterHitCount() {
    var i, rows = $filterList[0].getElementsByTagName('tr');
    for (i = 0, j = rows.length; i < j; ++i) {
      document.getElementById('fhc-' + rows[i].id.slice(7))
        .innerHTML = activeFilters[i] ? '&times;' + activeFilters[i].hits : '';
    }
  }
  
  function showThemeEditor() {
    var i, btn, buttons, ss, field, theme;
    
    if (!hasWebStorage) {
      alert("Your browser doesn't support Local Storage");
      return;
    }
    
    if (!hasNativeJSON) {
      alert("Your browser doesn't support native JSON");
      return;
    }
    
    if ($themePanel.css('display') != 'none') {
      closeThemeEditor();
      return;
    }
    
    if ($filtersPanel.css('display') == 'none') {
      buttons =
        document.getElementById('theme-set').getElementsByClassName('button');
      
      theme = localStorage.getItem('theme');
      theme = theme ? JSON.parse(theme) : {};
      
      for (i = 0; btn = buttons[i]; ++i) {
        if (theme[btn.id.slice(6)]) {
          enableButton(btn);
        }
        btn.addEventListener('click', toggleButton, false);
      }
      
      if (theme.menu && (field = document.getElementById('theme-menu'))) {
        field.value = theme.menu;
      }
      
      if (theme.ss) {
        ss = document.getElementById('theme-ss');
        for (var i = ss.options.length - 1; i >= 0; i--) {
          if (ss.options[i].value == theme.ss) {
            ss.selectedIndex = i;
            break;
          }
        }
      }
      
      if (theme.css) {
        document.getElementById('theme-css').value = theme.css;
      }
      
      $('#theme-save').click(saveTheme);
      $('#theme-close').click(closeThemeEditor);
        
      $('#theme-msg').hide();
      $themePanel.show();
    }
  }
  
  function closeThemeEditor() {    
    var i, btn, buttons;
    
    buttons =
      document.getElementById('theme-set').getElementsByClassName('button');
      
    for (i = 0; btn = buttons[i]; ++i) {
      disableButton(btn);
      btn.removeEventListener('click', toggleButton, false);
    }
    
    $('#theme-save').off('click');
    $('#theme-close').off('click');
    
    $themePanel.hide();
  }
  
  function resetCustomMenu() {
    var i, j, nav, slugs, more;
    
    if (!document.getElementsByClassName) {
      return;
    }
    
    nav = document.getElementById('topnav');
    nav.style.display = 'none';
    
    slugs = nav.getElementsByClassName('slug');
    
    for (i = 0, j = slugs.length; i < j; ++i) {
      slugs[i].style.display = 'inline';
    }
    
    if (more = document.getElementById('more-slugs-btn')) {
      more.style.display = 'none';
      more.removeEventListener('click', resetCustomMenu, false);
    }
    
    nav.style.display = 'block';
  }
  
  function loadTheme() {
    if (!hasWebStorage) return;
    
    var customTheme = localStorage.getItem('theme');
    
    if (!customTheme) return;
    
    activeTheme = JSON.parse(customTheme);
  }
  
  function applyTheme(customTheme, nocss) {
    var i, j, head, header, nav, slugs, slughash, hasHidden, style, link, more;
    
    if (customTheme.menu) {
      if (document.getElementsByClassName) {
        slugs = customTheme.menu.split(' ');
        slughash = {};
        for (i = 0, j = slugs.length; i < j; ++i) {
          slughash['/' + slugs[i] + '/'] = true;
        }
        
        nav = document.getElementById('topnav');
        nav.style.display = 'none';
        
        slugs = nav.getElementsByClassName('slug');
        
        for (i = 0, j = slugs.length; i < j; ++i) {
          if (!slughash[slugs[i].firstChild.textContent]) {
            slugs[i].style.display = 'none';
            hasHidden = true;
          }
          else {
            slugs[i].style.display = 'inline';
          }
        }
        
        if (more = document.getElementById('more-slugs-btn')) {
          if (hasHidden) {
            more.addEventListener('click', resetCustomMenu, false);
            more.style.display = 'inline';
          }
          else {
            more.style.display = 'none';
          }
        }
        
        nav.style.display = 'block';
      }
    }
    else if (customTheme.menu != activeTheme.menu) {
      resetCustomMenu();
    }
    
    if (nocss || activeTheme.wide != customTheme.wide) {
      if (customTheme.wide) {
        $(window).on('resize', debounce(100, packThreads));
        $threads.addClass('wide');
      }
      else {
        $(window).off('resize');
        $threads.removeClass('wide');
      }
    }
    
    if (!nocss) {
      fc.applyCSS(customTheme);
    }
  }
  
  fc.applyCSS = function(customTheme) {
    var head, link, style, el, version;
    
    if (!customTheme) {
      customTheme = activeTheme;
    }
    
    head = document.head || document.getElementsByTagName('head')[0];
    
    if (customTheme.ss) {
      el = document.getElementById('base-css');
      if (!(version = el.getAttribute('data-preset-version'))) {
        version = '0';
      }
      if (!(link = document.getElementById('preset-css'))) {
        isStyleSheetLoaded = false;
        link = document.createElement('link');
        link.type = 'text/css';
        link.rel = 'stylesheet';
        link.id = 'preset-css';
        link.href = '/stylesheets/' + customTheme.ss + '.css?' + version;
        link.addEventListener('load', onStyleSheetLoaded, false);
        head.insertBefore(link, el.nextSibling);
      }
      else if (customTheme.ss != activeTheme.ss) {
        isStyleSheetLoaded = false;
        link.href = '/stylesheets/' + customTheme.ss + '.css?' + version;
      }
    }
    else {
      if (activeTheme.ss != customTheme.ss
        && (el = document.getElementById('preset-css'))) {
        head.removeChild(el);
      }
    }
    
    if (style = document.getElementById('custom-css')) {
      head.removeChild(style);
    }
    
    if (customTheme.css) {
      style = document.createElement('style');
      style.type = 'text/css';
      style.id = 'custom-css';
      
      if (style.styleSheet) {
        style.styleSheet.cssText = customTheme.css;
      }
      else {
        style.innerHTML = customTheme.css;
      }
      // Allows to add in-page css inside a style tag with 'event-css' as id
      head.insertBefore(style, document.getElementById('event-css'));
    }
  }
  
  function onStyleSheetLoaded() {
    isStyleSheetLoaded = true;
    if (activeTheme.wide) {
      packThreads();
    }
  }
  
  // Applies and saves the theme to localStorage
  function saveTheme() {
    var i, btn, buttons, ss, field, css, style, customTheme = {};
    
    buttons =
      document.getElementById('theme-set').getElementsByClassName('button');
    
    for (i = 0; btn = buttons[i]; ++i) {
      if (/ active/.test(btn.className)) {
        customTheme[btn.id.slice(6)] = true;
      }
    }
    
    if (customTheme.usessl != activeTheme.usessl) {
      setSSL(!!customTheme.usessl);
    }
    
    ss = document.getElementById('theme-ss');
    if (ss.value != '0') {
      customTheme.ss = ss.value;
    }
    
    field = document.getElementById('theme-menu');
    if (field && (field.value != '')) {
      customTheme.menu = field.value;
    }
    
    if ((css = document.getElementById('theme-css').value) != '') {
      customTheme.css = css;
    }
    
    applyTheme(customTheme);
    
    localStorage.removeItem('theme');
    
    for (var i in customTheme) {
      localStorage.setItem('theme', JSON.stringify(customTheme));
      break;
    }
    
    activeTheme = customTheme;
    
    buildThreads();
    
    $('#theme-msg')
      .html('Done')
      .attr('class', 'msg-ok')
      .show().delay(2000).fadeOut(500);
  }
  
  // Loads threads from local storage
  function loadThreadList(key) {
    var i, threads, mod = false, ft = catalog.order.date[0];
    if (threads = localStorage.getItem(key)) {
      threads = JSON.parse(threads);
      for (i in threads) {
        if (!catalog.threads[i] && i < ft) {
          delete threads[i];
          mod = true;
        }
      }
      for (i in threads) {
        if (mod) { localStorage.setItem(key, JSON.stringify(threads)); }
        return threads;
      }
      localStorage.removeItem(key);
    }
    return {};
  }
  
  // Loads data from webStorage
  function loadStorage() {
    if (hasWebStorage && hasNativeJSON) {
      hiddenThreads = loadThreadList('hide-' + catalog.slug);
      pinnedThreads = loadThreadList('pin-' + catalog.slug);
    }
  }
  
  // Loads basic settings from localStorage
  function loadSettings() {
    var settings;
    if (hasWebStorage && hasNativeJSON
      && (settings = localStorage.getItem('settings'))) {
      $.extend(options, JSON.parse(settings));
    }
    else {
      $.extend(options, defaults);
    }
  }    
  
  // Saves basic settings to localStorage
  function saveSettings() {
    var i, key, settings;
    if (!hasWebStorage || !hasNativeJSON) {
      return;
    }
    settings = {};
    for (i = basicSettings.length - 1; i >= 0; i--) {
      key = basicSettings[i];
      if (options[key] != defaults[key]) {
        settings[key] = options[key];
      }
    }
    for (i in settings) {
      localStorage.setItem('settings', JSON.stringify(settings));
      return;
    }
    localStorage.removeItem('settings');
  }
  
  function applyLayout(init) {
    var cls = [];
    
    if (activeTheme.wide) {
      cls.push('wide');
    }
    
    if (options.extended) {
      cls.push('extended');
    }
    
    cls.push(options.thsize);
    
    $threads[0].className = cls.join(' ');
    
    if (!init && activeTheme.wide) {
      packThreads();
    }
  }
  
  function setSize(size, init) {
    if (size == 'small') {
      $sizeCtrl[0].textContent = 'Large';
      options.thsize = 'small';
    }
    else {
      $sizeCtrl[0].textContent = 'Small';
      options.thsize = 'large';
    }
    if (!init) {
      saveSettings();
      applyLayout(true);
      buildThreads();
    }
  }
  
  function setExtended(mode, init) {
    if (mode) {
      $teaserCtrl[0].textContent = 'Hide';
      options.extended = true;
    }
    else {
      $teaserCtrl[0].textContent = 'Show';
      options.extended = false;
    }
    if (!init) {
      saveSettings();
      applyLayout();
    }
  }
  
  function setProxy(mode, init) {
    if (!catalog.proxy) {
      $proxyCtrl.hide();
      return;
    }
    if (mode) {
      $proxyCtrl.addClass('active');
      options.proxy = true;
    }
    else {
      $proxyCtrl.removeClass('active');
      options.proxy = false;
    }
    if (!init) {
      saveSettings();
      buildThreads();
    }
  }
  
  function setOrder(order, init) {
    var el, sel;
    
    if (el = document.getElementById(sel = 'order-' + order)) {
      document.getElementById('order-cnt').className = sel;
      document.getElementById('order-ctrl').textContent = el.textContent;
      options.orderby = order;
    }
    if (!init) {
      saveSettings();
      buildThreads();
    }
  }
  
  function cycleOrder() {
    var o = { date: 'alt', alt: 'r', r: 'lr', lr: 'date' };
    setOrder(o[options.orderby]);
  }
  
  function buildThreads() {
    var
      i, j, fid, id, entry, thread, af, hl, onTop, pinned, provider, src,
      rDiff, onPage, filtered = 0, ratio, maxSize, imgWidth, imgHeight, calcSize,
      html = '', topHtml = '';
    
    if ($threads[0].hasChildNodes()) {
      $threads.empty();
    }
    
    if (catalog.count == 0) {
      $threads.html('Empty threadlist').css('text-align', 'center');
      return;
    }
    
    if (options.proxy && catalog.proxy) {
      provider = catalog.proxy;
    }
    else {
      provider = options.server + catalog.slug + '/res/';
    }
    
    hiddenThreadsCount = 0;
    
    for (fid in activeFilters) {
      activeFilters[fid].hits = 0;
    }
    
    calcSize = options.thsize == 'small';
    
    threadloop: for (i = 0; i < catalog.count; ++i) {
      id = catalog.order[options.orderby][i];
      entry = catalog.threads[id];
      hl = onTop = pinned = false;
      if(!quickFilterPattern) {
        if (hiddenThreads[id]) {
          ++hiddenThreadsCount;
          continue;
        }
        for (fid in activeFilters) {
          af = activeFilters[fid];
          if ((af.type == 0 && af.pattern.test(entry.teaser))
            || (af.type == 1 && af.pattern.test(entry.author))) {
            if (af.hidden) {
              ++filtered;
              af.hits += 1;
              continue threadloop;
            }
            hl = af;
            onTop = !!af.top;
            af.hits += 1;
            break;
          }
        }
      }
      else if (!quickFilterPattern.test(entry.teaser)) {
        continue;
      }
      
      if (pinnedThreads[id] >= 0) {
        pinned = onTop = true;
      }
      
      thread = '<article id="thread-' + id
      + '" class="thread"><a target="_blank" href="'
      + provider + id + '"><img alt="" id="thumb-'
      + id + '" class="thumb';
      
      if (hl.color) {
        thread += ' hl" style="border-color: ' + hl.color;
      }
      else if (pinned) {
        thread += ' pinned';
      }
      
      imgWidth = entry.w;
      imgHeight = entry.h;
      
      if (entry.s) {
        if (entry.splr && activeTheme.nospoiler) {
          src = catalog.slug + '/src/' + id + '.jpg';
          imgWidth = entry.sw;
          imgHeight = entry.sh
        }
        else {
          src = 'images/' + entry.s;
        }
      }
      else {
        src = catalog.slug + '/src/' + id + '.jpg';
      }
      
      if (calcSize) {
        maxSize = options.smallsize;
        if (imgWidth > maxSize) {
          ratio = maxSize / imgWidth;
          imgWidth = maxSize;
          imgHeight = imgHeight * ratio;
        }
        if (imgHeight > maxSize) {
          ratio = maxSize / imgHeight;
          imgHeight = maxSize;
          imgWidth = imgWidth * ratio;
        }
      }
      
      thread += '" width="' + imgWidth + '" height="' + imgHeight + '" src="'
      + options.contentUrl + src + '" data-id="' + id + '" /></a>';
      
      if (catalog.flags) {
        thread += '<div class="flag flag-' + entry.loc + '" data-tip="'
        + entry.locname + '"></div>';
      }
      
      thread += '<div title="(R)eplies / (I)mages'
        + (onTop ? ' / (P)age' : '') + '" id="meta-' + id + '" class="meta">';
      
      if (entry.sticky) {
        thread += '<span class="sticky" title="Sticky">●</span>';
      }
      
      if (entry.r) {
        thread += 'R:<b>' + entry.r + '</b>';
        if (pinned) {
          rDiff = entry.r - pinnedThreads[id];
          if (rDiff > 0) {
            thread += ' (+' + rDiff + ')';
            pinnedThreads[id] = entry.r;
          }
        }
        if (entry.i) {
          thread += ' / I:<b>' + entry.i + '</b>';
        }
      }
      
      if (onTop && (page = getThreadPage(id)) >= 0) {
        if (entry.r) {
          thread += ' / ';
        }
        thread += 'P:<b>' + page + '</b>';
      }
      
      thread += '</div>';
      
      if (entry.teaser) {
        thread += '<div class="teaser';
        if (hl.color) {
          if (hl.bright) {
            thread += ' hl-high"';
          }
          else {
            thread += ' hl-low"';
          }
          thread += ' style="color:' + hl.color;
        }
        thread += '">' + entry.teaser + '</div>';
      }
      
      if (onTop) {
        topHtml += thread + '</article>';
      }
      else {
        html += thread + '</article>';
      }
    }
    
    if (topHtml) {
      html = topHtml + html + '<div class="clear"></div>';
    }
    else {
      html += '<div class="clear"></div>';
    }
    
    for (j in pinnedThreads) {
      localStorage.setItem('pin-' + catalog.slug, JSON.stringify(pinnedThreads));
      break;
    }
    
    $threads[0].innerHTML = html;
    
    if (activeTheme.wide && isStyleSheetLoaded) {
      packThreads();
    }
    
    if (filtered > 0) {
      $filteredCount[0].textContent = filtered;
      $filteredLabel[0].style.display = 'inline';
    }
    else {
      $filteredLabel[0].style.display = 'none';
    }
    
    if (hiddenThreadsCount > 0) {
      $hiddenCount[0].textContent = hiddenThreadsCount;
      $hiddenLabel[0].style.display = 'inline';
    }
    else {
      $hiddenLabel[0].style.display = 'none';
    }
  }
  
  function packThreads() {
    var i, j, nodes, colWidth, colCount, leftOffset, cntHeight, colHeights,
      el, offsetTop, index, margin;
    
    nodes = document.getElementsByClassName('thread');
    
    if (!nodes[0]) {
      return;
    }
    
    margin = options.columnMargin;
    
    cntWidth = $threads[0].clientWidth;
    colWidth = nodes[0].offsetWidth + margin;
    colCount = (0 | (cntWidth / colWidth)) || 1;
    
    leftOffset = 0 | ((cntWidth - colCount * colWidth) / 2);
    
    cntHeight = 0;
    colHeights = [];
    positions = [];
    
    for (i = 0; i < colCount; ++i) {
      colHeights.push(0);
    }
    
    for (i = 0; el = nodes[i]; ++i) {
      offsetTop = null;
      index = 0;
      for (j = colCount - 1; j >= 0; j--) {
        if (offsetTop == null || offsetTop > colHeights[j]) {
          offsetTop = colHeights[j] + margin;
          index = j;
        }
      }
      positions.push('position: absolute;top: '
        + offsetTop + 'px;left:' + (leftOffset + index * colWidth) + 'px');
      colHeights[index] = offsetTop + el.offsetHeight;
    }
    
    $threads[0].style.display = 'none';
    $threads[0].style.height = Math.max.apply(null, colHeights) + 'px';
    
    for (i = 0; el = nodes[i]; ++i) {
      el.style.cssText = positions[i];
    }
    
    $threads[0].style.display = '';
  }
  
  // Updates the 'Refreshed ago' counter
  function updateTime() {
    var delta = (new Date().getTime() / 1000) - catalog.mtime;
    if (delta > 300) {
      clearInterval(pulseInterval);
      pulseInterval = setInterval(updateTime, 60000);
    }
    document.getElementById('updated').innerHTML = getDuration(delta, true);
  }
  
  function getDuration(delta, precise) {
    var count, head, tail;
    if (delta < 2) {
      return 'less than a second';
    }
    if (precise && delta < 300) {
      return (0 | delta) + ' seconds';
    }
    if (delta < 60) {
      return (0 | delta) + ' seconds';
    }
    if (delta < 3600) {
      count = 0 | (delta / 60);
      if (count > 1) {
        return count + ' minutes';
      }
      else {
        return 'one minute';
      }
    }
    if (delta < 86400) {
      count = 0 | (delta / 3600);
      if (count > 1) {
        head = count + ' hours';
      }
      else {
        head = 'one hour';
      }
      tail = 0 | (delta / 60 - count * 60);
      if (tail > 1) {
        head += ' and ' + tail + ' minutes';
      }
      return head;
    }
    count = 0 | (delta / 86400);
    if (count > 1) {
      head = count + ' days';
    }
    else {
      head = 'one day';
    }
    tail = 0 | (delta / 3600 - count * 24);
    if (tail > 1) {
      head += ' and ' + tail + ' hours';
    }
    return head;
  }
};
