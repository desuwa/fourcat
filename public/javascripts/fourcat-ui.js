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
    // Hide highlighted and pinned threads
    hidepinned: false,
    // Small thumbnail size
    smallsize: 150,
    // Columns margin for the wide layout
    columnMargin: 3,
    // Thumbnails server url
    contentUrl: '/',
    // Search API url
    apiUrl: '//api.neet.tv/v1/',
    // Sync API url
    syncUrl: 'https://sync.neet.tv/',
    // Filters color palette
    filterColors: [
      ['#E0B0FF', '#F2F3F4', '#7DF9FF', '#FFFF00'],
      ['#FBCEB1', '#FFBF00', '#ADFF2F', '#0047AB'],
      ['#00A550', '#007FFF', '#AF0A0F', '#B5BD68']
    ],
    server: '//boards.4chan.org/',
    tooltipDelay: 350
  },
  
  keybinds = {
    84: toggleHidePinned, // T
    83: focusQuickFilter, // S
    82: refreshWindow, // R
    88: cycleOrder // X
  },
  
  catalog = {},
  
  lastReplies = {},
  
  options = {},
  
  basicSettings = [ 'orderby', 'thsize', 'extended', 'proxy', 'hidepinned' ],
  
  tooltipTimeout = null,
  hasTooltip = false,
  expandedThumbnail = null,
  isStyleSheetLoaded = true,
  isCtrlKeyPressed = false,
  
  activeTheme = {},
  
  activeFilters = {},
  
  matchedFilters = {},
  
  pinnedThreads = {},
  
  hiddenThreads = {},
  hiddenThreadsCount = 0,
  
  quickFilterPattern = false,
  quickFilterTimeout = null,
  quickFilterXHR = null,
  
  syncEnabled = false,
  syncTimeout = null,
  syncProcessing = false,
  syncMaxDelay = 3600000,
  syncQueue = {},
  
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
  
  loadTheme();
  
  // ---
  
  fc.init = function(c, opts) {
    catalog = c;
    
    $threads = $('#threads');
    $refresh = $('#refresh');
    $qfCtrl = $('#qf-ctrl').click(toggleQuickFilter);
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
    $('#theme-ctrl').click(showThemeEditor);
    $('#filters-ctrl').click(showFilters);
    
    applyTheme(activeTheme, true);
    
    $(document).on('mouseover', onMouseOver);
    $(document).on('mouseout', onMouseOut);
    
    $('#totop').find('.button').click(function() { window.scrollTo(0, 0); });
    
    document.getElementById('pinned-ctrl')
      .addEventListener('click', toggleHidePinned, false);
    
    if (hasContextMenu) {
      buildContextMenu();
    }
    
    $sizeCtrl.click(function() {
      setSize(options.thsize == 'small' ? 'large' : 'small');
    });
    
    $('#order-ctrl').click(cycleOrder);
    $('#order-cnt').on('click', onOrderListClick)
      .on('mouseover', showOrderMenu)
      .on('mouseout', hideOrderMenu);
    
    $teaserCtrl.click(function() {
      setExtended(!options.extended);
    });
    
    $proxyCtrl.click(function() {
      setProxy(!options.proxy);
    });
    
    if (opts) {
      $.extend(defaults, opts);
    }
    
    loadSettings();
    loadFilters();
    loadStorage();
    
    initSync();
    
    initMergeGroups();
    
    bindGlobalShortcuts();
    
    setOrder(options.orderby, true);
    setSize(options.thsize, true);
    setExtended(options.extended, true);
    setProxy(options.proxy, true);
    setHidePinned(options.hidepinned, true);
    applyLayout(true);
    
    updateTime();
    
    $refresh[0].setAttribute('data-tip', $refresh[0].getAttribute('data-label')
      + ' ' + getDuration(catalog.delay, true));
    
    if (!catalog.nsfw || !showDisclaimer()) {
      buildThreads();
    }
    
    clearInterval(pulseInterval);
    pulseInterval = setInterval(updateTime, 10000);
  }
  
  function showDisclaimer() {
    var btn, cnt;
    
    if (!hasWebStorage) {
      return false;
    }
    
    if (localStorage.getItem('disclaimer')) {
      return false;
    }
    
    cnt = document.createElement('div');
    cnt.className = 'backdrop';
    cnt.innerHTML = '<div id="disclaimer" class="panel">'
      + '<h3>Hello friend</h3>'
      + 'The content of this site is for mature audiences only '
      + 'and may not be suitable for minors. '
      + 'If you are a minor or it is illegal for you to access '
      + 'mature images and language, do not proceed.'
      + '<div class="panel-footer">'
      + '<a href="" id="disclaimer-accept" class="button">Proceed</span>'
      + '<a href="/" class="button">Go back</span>'
      + '</div></div>';
    document.body.appendChild(cnt);
    
    btn = document.getElementById('disclaimer-accept');
    btn.addEventListener('click', acceptDisclaimer, false);
    
    return true;
  }
  
  function acceptDisclaimer() {
    localStorage.setItem('disclaimer', '1');
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
    var act, t = e.target;
    
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
      if (t.className.indexOf('meta-r') != -1 && !t.hasAttribute('data-ready')) {
        setActivityTooltip(t);
      }
      tooltipTimeout = setTimeout(showTooltip, options.tooltipDelay, t);
    }
  }
  
  function onMouseOut(e) {
    if (expandedThumbnail) {
      collapseThumbnail(expandedThumbnail);
    }
  }
  
  function setActivityTooltip(t) {
    var activity, tid, val;
    
    t.setAttribute('data-ready', 1);
    
    tid = +t.parentNode.id.split('-')[1];
    
    if (activity = catalog.threads[tid].act) {
      val = Math.round(activity / catalog.activity_range * 100) / 100;
      t.setAttribute('data-tip', 'Replies (activity: ' + val + ')');
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
    
    if (t.hasAttribute('data-tiphtml')) {
      el.innerHTML = t.getAttribute('data-tip');
    }
    else {
      el.textContent = t.getAttribute('data-tip');
    }
    
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
  
  function getFilterMatch(tid, thread) {
    var res, filter;
    
    filter = matchedFilters[tid];
    
    if (!filter) {
      return false;
    }
    
    res = thread[filter[0]].match(filter[1].pattern);
    
    res = res[1] || res[0];
    
    if (res === '') {
      return filter[1].pattern.toString()
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/&/g, '&amp;');
    }
    else {
      return res.replace(/<[^>]*>/g, '')
    }
  }
  
  function showPostPreview(t) {
    var tid, reply, tip, now, pos, el, rect, docWidth, style, page, filterMatch;
    
    tid = t.getAttribute('data-id');
    
    thread = catalog.threads[tid];
    
    now = Date.now() / 1000;
    
    if (filter = getFilterMatch(tid, thread)) {
      page = '<span class="post-page">via ' + filter + '</span>';
    }
    else if (page = getThreadPage(tid)) {
      page = '<span class="post-page">page ' + page + '</span>';
    }
    else {
      page = '';
    }
    
    tip = '<div class="post-op"><span class="post-label">Posted by </span>'
      + '<span class="post-author">'
      + (thread.author || catalog.anon) + ' </span>'
      + '<span class="post-ago">'
      + getDuration(now - thread.date)
      + ' ago</span>' + page;
    
    if (!options.extended && thread.teaser) {
      tip += '<p class="post-teaser">' + thread.teaser + '</p>';
    }
    
    tip += '</div>';
    
    if (thread.lr) {
      if (thread.replies) {
        tip += buildLastReplies(thread.replies);
      }
      else if (isCtrlKeyPressed || activeTheme.replies) {
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
        
        menu.insertBefore(li, more);
        menu.insertBefore(document.createTextNode(' '), more);
      }
    }
  }
  
  function hideTooltip() {
    document.body.removeChild(document.getElementById('tooltip'));
    hasTooltip = false;
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
  
  function focusQuickFilter() {
    var qf;
    
    if ($qfCtrl.hasClass('active')) {
      clearQuickFilter(true);
    }
    else {
      toggleQuickFilter();
    }
  }
  
  function toggleQuickFilter() {
    var qfcnt, qfbox, qfdeep;
    
    qfcnt = document.getElementById('qf-cnt');
    qfbox = document.getElementById('qf-box');
    qfdeep = document.getElementById('qf-deep');
    
    if ($qfCtrl.hasClass('active')) {
      clearQuickFilter();
      qfcnt.style.display = 'none';
      $qfCtrl.removeClass('active');
      qfbox.removeEventListener('keydown', onQuickFilterKeyDown, false);
      qfbox.removeEventListener('keyup', onQuickFilterKeyUp, false);
      qfbox.blur();
      
      if (catalog.deep_search) {
        qfdeep.removeEventListener('click', toggleDeepSearch, false);
        
        if (qfdeep.className.indexOf(' active') == -1) {
          qfdeep.className += ' active';
        }
      }
    }
    else {
      if (catalog.deep_search) {
        qfdeep.addEventListener('click', toggleDeepSearch, false);
        
        if (activeTheme.quicksearch) {
          qfdeep.className = qfdeep.className.replace(/ active/, '');
        }
      }
      
      qfcnt.style.display = 'inline';
      qfbox.addEventListener('keydown', onQuickFilterKeyDown, false);
      qfbox.addEventListener('keyup', onQuickFilterKeyUp, false);
      qfbox.value = '';
      qfbox.focus();
      $qfCtrl.addClass('active');
    }
  }
  
  function toggleDeepSearch(e, noApply) {
    var el = document.getElementById('qf-deep');
    
    clearTimeout(quickFilterTimeout);
    
    if (el.className.indexOf(' active') != -1) {
      el.className = el.className.replace(/ active/, '');
    }
    else {
      el.className += ' active';
    }
    
    if (!noApply) {
      applyQuickFilter();
    }
  }
  
  function onQuickFilterKeyUp(e) {
    if (e.keyCode == 13) {
      clearTimeout(quickFilterTimeout);
      applyQuickFilter();
    }
    else if (e.keyCode == 9 && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      
      if (catalog.deep_search) {
        toggleDeepSearch();
      }
    }
  }
  
  function onQuickFilterKeyDown(e) {
    var keyCode = e.keyCode;
    
    if (keyCode == 16 || keyCode == 17 || keyCode == 13) {
      return;
    }
    
    if (keyCode == 9 && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      return;
    }
    
    clearTimeout(quickFilterTimeout);
    
    if (keyCode == 27) {
      toggleQuickFilter();
      return;
    }
    
    quickFilterTimeout = setTimeout(applyQuickFilter, 350);
  }
  
  function applyQuickFilter() {
    var qfstr, regexEscape;
    
    qfstr = document.getElementById('qf-box').value;
    
    if (qfstr != '') {
      if (catalog.deep_search
        && document.getElementById('qf-deep').className.indexOf(' active') != -1) {
        applyDeepFilter(qfstr);
      }
      else {
        regexEscape = getRegexSpecials();
        qfstr = qfstr.replace(regexEscape, '\\$1');
        quickFilterPattern = new RegExp(qfstr, 'i');
        buildThreads();
      }
    }
    else {
      clearQuickFilter();
    }
  }
  
  function clearQuickFilter(focus) {
    var qf = document.getElementById('qf-box');
    
    clearTimeout(quickFilterTimeout);
    
    if (quickFilterXHR) {
      quickFilterXHR.abort();
      quickFilterXHR = null;
    }
    
    if (focus) {
      qf.value = '';
      qf.focus();
    }
    else {
      quickFilterPattern = false;
      
      buildThreads();
    }
  }
  
  function applyDeepFilter(query) {
    if (quickFilterXHR) {
      quickFilterXHR.abort();
      quickFilterXHR = null;
    }
    
    quickFilterXHR = new XMLHttpRequest();
    quickFilterXHR.open('GET',
      options.apiUrl + 'filter?board=' + catalog.slug + '&q=' + query
    );
    quickFilterXHR.onload = quickFilterXHR.onerror = onSearchLoaded;
    showSpinner();
    quickFilterXHR.send(null);
  }
  
  function onSearchLoaded() {
    var data;
    
    if (this.status != 200) {
      showError('Bad HTTP status');
      return;
    }
    
    data = JSON.parse(this.responseText);
    
    if (data.error) {
      showError(data.error);
      return;
    }
    
    quickFilterPattern = data;
    
    buildThreads();
  }
  
  function showError(msg) {
    var el = document.getElementById('threads');
    
    if (msg) {
      msg = ' (' + msg + ')';
    }
    else {
      msg = '';
    }
    
    el.innerHTML = '<div class="error">Something went wrong' + msg + '</div>';
  }
  
  function showSpinner(type) {
    var el = document.getElementById('threads');
    
    el.innerHTML = '<span class="'
      + (type || 'unya')
      + '-spinner"><span></span><span></span></span>';
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
      '<menuitem label="Report" data-cmd="report"' + icon + '></menuitem>' +
      '<menu label="Attention"><menu label="this"><menu label="menu"><menu label="will"><menu label="soon"><menu label="be"><menu label="removed"><menu label="because"><menu label="it"><menuitem label="sucks"></menuitem></menu></menu></menu></menu></menu></menu></menu></menu></menu>';
    
    $('#ctxmenu-thread').click(onThreadContextClick);
  }
  
  function bindGlobalShortcuts() {
    if (hasWebStorage && hasNativeJSON) {
      $threads.on('mousedown', onMouseDown);
    }
    
    $threads[0].addEventListener('click', onClick, false);
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
    var cmd, tid;
    
    if (e.target.className.indexOf('thumb') != -1) {
      clearTimeout(tooltipTimeout);
      if (e.which == 1 && (e.altKey || e.shiftKey)) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
    else if (cmd = e.target.getAttribute('data-cmd')) {
      e.preventDefault();
      e.stopPropagation();
      
      tid = e.target.parentNode.parentNode.id.split('-')[1];
      
      if (cmd == 'pin') {
        toggleThreadPin(tid);
      }
      else if (cmd == 'hide') {
        toggleThreadHide(tid);
      }
      else if (cmd == 'report') {
        reportThread(tid);
      }
    }
  }
  
  function initSync() {
    var now, id, ts, el;
    
    if (!hasWebStorage) {
      return;
    }
    
    if (id = localStorage.getItem('sync-id')) {
      syncEnabled = true;
      
      if (el = document.getElementById('sync-now')) {
        el.addEventListener('click', onSyncNowClick, false);
        el.className = el.className.replace(' hidden', '');
      }
      
      now = Date.now();
      ts = +getSyncTs().ts;
      
      if (!ts || ts <= (now - syncMaxDelay)) {
        syncStatus(id);
      }
    }
    else if (location.hash) {
      id = location.hash.split('/');
      if (id[1] == 'enable-sync' && id[2]) {
        if (confirm('Enable Sync using the provided key?')) {
          enableSync(id[2]);
        }
        
        if (window.history && history.replaceState) {
          history.replaceState(null, '', location.href.split('#', 1)[0]);
        }
      }
    }
  }
  
  function onSyncNowClick() {
    var id = localStorage.getItem('sync-id');
    
    if (!id) {
      syncEnabled = false;
      Feedback.error("Syncing doesn't seem to be enabled on this machine");
    }
    else {
      syncStatus(id, true);
    }
  }
  
  function onSyncManagerClick(e) {
    var cmd;
    
    if (cmd = e.target.getAttribute('data-cmd')) {
      e.preventDefault();
      e.stopPropagation();
      
      switch (cmd) {
        case 'sync-create':
          showCreateSync();
          break;
        case 'sync-reg':
          enableSync();
          break;
        case 'sync-close':
          closeSyncManager();
          break;
        case 'sync-captcha-reload':
          syncLoadCaptcha();
          break;
        case 'sync-submit':
          syncSubmit();
          break;
        case 'sync-qrcode':
          showSyncQRCode();
          break;
        case 'sync-off':
          disableSync();
          break;
        case 'sync-purge':
          purgeSync();
          break;
      };
    }
  }
  
  function showSyncManager() {
    var el, html, key, status;
    
    if (document.getElementById('sync-panel')) {
      return false;
    }
    
    el = document.createElement('div');
    el.id = 'sync-panel';
    el.className = 'panel';
    
    key = localStorage.getItem('sync-id');
    
    if (!key) {
      status = '<p>Use this to synchronize your filters, pinned '
        + 'and hidden threads across multiple computers.<br>'
        + 'Your data will be kept on neet.tv servers. '
        + 'This data is not encrypted and is only associated with a randomly '
        + 'generated key, no personally identifiable information is stored.<br>'
        + 'Make sure to keep local backups of your filters, just in case.</p>';
    }
    else {
     syncEnabled = true;
     status = 'Your sync key: <div><b>' + key + '</b></div>'
        + '<hr>'
        + '<span data-cmd="sync-qrcode" class="button">QR Code</span> '
        + '<span data-cmd="sync-off" class="button">Disable</span> '
        + '<span data-cmd="sync-purge" class="button">Wipe Data</span>';
    }
    
    html = '<h3>Manage Sync</h3>'
      + status
      + '<hr>'
      + '<div id="sync-ctrl"' + (syncEnabled ? ' class="hidden">' : '>')
        + '<span data-cmd="sync-create" class="button">Create New Key</span> '
        + '<span data-cmd="sync-reg" class="button">Use Existing Key</span> '
        + '<hr>'
      + '</div>'
      + '<div id="sync-create-cnt" class="hidden">'
        + '<h4>Verification</h4>'
        + '<div id="captcha-cnt"></div>'
        + '<form id="captcha-form"><input type="text" '
          + 'placeholder="You know what to do" id="captcha-response"></form>'
        + '<span data-cmd="sync-submit" class="button">Submit</span> '
        + '<span data-cmd="sync-captcha-reload" class="button">Reload</span>'
        + '<hr>'
      + '</div>'
      + '<div id="sync-qr-cnt" class="hidden"></div>'
      + '<span data-cmd="sync-close" class="right button">Close</span>'
      ;
    
    el.style.top = window.pageYOffset + 50 + 'px';
    
    el.innerHTML = html;
    
    document.body.appendChild(el);
    
    el.addEventListener('click', onSyncManagerClick, false);
    
    el.style.display = 'block';
    
    return true;
  }
  
  function closeSyncManager() {
    var el, ar;
    
    el = document.getElementById('sync-panel');
    
    if (!el) {
      return false;
    }
    
    el.removeEventListener('click', onSyncManagerClick, false);
    
    el.parentNode.removeChild(el);
    
    return true;
  }
  
  function showSyncQRCode() {
    var el = document.getElementById('sync-qr-cnt');
    
    el.innerHTML = '<img alt="" src="' + options.syncUrl + 'qrcode?url='
      + encodeURIComponent(location.protocol + '//' + location.host
      + '/' + catalog.slug + '/#/enable-sync/')
      + localStorage.getItem('sync-id') + '"><hr>';
    
    el.className = '';
  }
  
  function showCreateSync() {
    syncLoadCaptcha();
    $('#sync-create-cnt').removeClass('hidden');
  }
  
  function enableSync(id) {
    var el;
    
    id = id || prompt('Enter your sync key');
    
    if (!id) {
      return;
    }
    
    if (!/^[a-zA-Z0-9]+$/.test(id)) {
      return Feedback.error('Invalid key.');
    }
    
    localStorage.setItem('sync-id', id);
    syncEnabled = true;
    
    if (el = document.getElementById('sync-now')) {
      el.addEventListener('click', onSyncNowClick, false);
      el.className = el.className.replace(' hidden', '');
    }
    
    syncStatus(id);
    
    if (closeSyncManager()) {
      showSyncManager();
    }
  }
  
  function disableSync() {
    var key, el;
    
    if (!confirm('Syncing will be disabled on this machine.')) {
      return;
    }
    
    if (el = document.getElementById('sync-now')) {
      el.removeEventListener('click', onSyncNowClick, false);
      el.className = el.className + ' hidden';
    }
    
    syncEnabled = false;
    localStorage.removeItem('sync-id');
    localStorage.removeItem('sync-ts');
    
    if (closeSyncManager()) {
      showSyncManager();
    }
  }
  
  function purgeSync() {
    var xhr, id;
    
    if (!confirm('All data associated with this sync key will be deleted from the server.')) {
      return;
    }
    
    id = localStorage.getItem('sync-id');
    
    if (!id) {
      feedback.error("Syncing doesn't seem to be enabled on this machine");
    }
    
    xhr = new XMLHttpRequest();
    xhr.open('POST', options.syncUrl + 'v1/purge');
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    xhr.onload = onPurgeSyncLoaded;
    xhr.onerror = onSyncError;
    xhr.withFeedback = true;
    
    Feedback.notify('Processing…', false);
    
    xhr.send('id=' + id);
  }
  
  function onPurgeSyncLoaded() {
    var resp = JSON.parse(this.responseText);
    
    if (resp.error) {
      return Feedback.error(resp.error);
    }
    
    Feedback.notify('Done');
    
    syncEnabled = false;
    localStorage.removeItem('sync-id');
    localStorage.removeItem('sync-ts');
    
    if (closeSyncManager()) {
      showSyncManager();
    }
  }
  
  function onCaptchaLoaded() {
    var cnt, resp = JSON.parse(this.responseText);
    
    if (resp.error) {
      return Feedback.error(resp.error);
    }
    
    cnt = document.getElementById('captcha-cnt');
    
    if (!cnt) {
      return;
    }
    
    cnt.removeAttribute('data-loading');
    cnt.innerHTML = '<img src="data:image/png;base64,' + resp.src + '" alt="">';
    cnt.setAttribute('data-key', resp.key);
  }
  
  function syncLoadCaptcha() {
    var cnt, xhr;
    
    cnt = document.getElementById('captcha-cnt');
    
    if (!cnt || cnt.hasAttribute('data-loading')) {
      return;
    }
    
    cnt.setAttribute('data-loading', '1');
    
    document.getElementById('captcha-response').value = '';
    cnt.textContent = 'Loading…';
    
    xhr = new XMLHttpRequest();
    xhr.open('GET', '//captcha.neet.tv/challenge');
    xhr.onload = onCaptchaLoaded;
    xhr.send(null);
  }
  
  function syncSubmit(e) {
    var cnt, input, challenge, response, xhr;
    
    e && e.preventDefault();
    
    cnt = document.getElementById('captcha-cnt');
    
    if (cnt.hasAttribute('data-loading')) {
      return;
    }
    
    cnt.setAttribute('data-loading', '1');
    
    input = document.getElementById('captcha-response');
    
    challenge = cnt.getAttribute('data-key');
    response = input.value;
    
    cnt.textContent = 'Processing…';
    input.value = '';
    
    xhr = new XMLHttpRequest();
    xhr.open('POST', options.syncUrl + 'v1/create');
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    xhr.onload = onSubmitSyncLoaded;
    xhr.send('c=' + challenge + '&r=' + response);
  }
  
  function onSubmitSyncLoaded() {
    var cnt, resp = JSON.parse(this.responseText);
    
    cnt = document.getElementById('captcha-cnt');
    
    if (!cnt) {
      return;
    }
    
    cnt.removeAttribute('data-loading');
    
    if (!resp.id) {
      Feedback.error(resp.error || 'Something went wrong');
      syncLoadCaptcha();
      return;
    }
    
    Feedback.notify('Welcome');
    
    enableSync(resp.id);
    
    $('#sync-create-cnt').addClass('hidden');
  }
  
  function syncStatus(id, withFeedback) {
    var xhr;
    
    if (syncProcessing) {
      console.log('Sync: Already syncing');
      return;
    }
    
    id = id || localStorage.getItem('sync-id');
    
    if (!id) {
      console.log('syncStatus: Missing sync key');
      return;
    }
    
    syncProcessing = true;
    
    if (withFeedback) {
      Feedback.notify('Syncing…', false);
    }
    
    xhr = new XMLHttpRequest();
    xhr.open('GET', options.syncUrl + 'v1/status?id=' + id);
    xhr.syncId = id;
    xhr.withFeedback = withFeedback;
    xhr.onerror = onSyncError;
    xhr.onload = onSyncStatusLoaded;
    xhr.send(null);
  }
  
  function onSyncStatusLoaded() {
    var i, key, item, items, get, set, req, xhr, local_ts, remote_ts, data, syncTs;
    
    syncProcessing = false;
    
    items = JSON.parse(this.responseText);
    
    if (items.error) {
      return Feedback.error('Sync: ' + items.error);
    }
    
    syncTs = getSyncTs();
    syncTs.ts = Date.now();
    
    get = [];
    set = {};
    
    for (key in items) {
      local_ts = syncTs[key] || 0;
      remote_ts = items[key] || 0;
      
      if (remote_ts > local_ts) {
        get.push(key);
      }
      else if (local_ts > remote_ts) {
        data = localStorage.getItem(key);
        
        if (data) {
          set[key] = {
            ts: local_ts,
            data: JSON.parse(data)
          };
        }
        else {
          delete syncTs[key];
        }
      }
    }
    
    setSyncTs(syncTs);
    
    req = {};
    
    if (get.length) {
      req['get'] = get;
    }
    
    for (i in set) {
      req['set'] = set;
      break;
    }
    
    if (!req['get'] && !req['set']) {
      if (this.withFeedback) {
        Feedback.notify('Done');
      }
      return;
    }
    
    req.id = this.syncId;
    
    xhr = new XMLHttpRequest();
    xhr.open('POST', options.syncUrl + 'v1/sync');
    xhr.withFeedback = this.withFeedback;
    xhr.onload = onSyncLoaded;
    xhr.onerror = onSyncError;
    xhr.send(JSON.stringify(req));
  }
  
  function onSyncError() {
    var msg = 'Sync: Connection Error';
    
    syncProcessing = false;
    
    resetSyncTs();
    
    if (this.withFeedback) {
      Feedback.error(msg);
    }
    else {
      console.log(msg);
    }
  }
  
  function getSyncTs() {
    var data = localStorage.getItem('sync-ts');
    
    return data ? JSON.parse(data) : {};
  }
  
  function setSyncTs(data) {
    return localStorage.setItem('sync-ts', JSON.stringify(data));
  }
  
  function resetSyncTs() {
    var tsData = getSyncTs();
    delete tsData.ts;
    setSyncTs(tsData);
  }
  
  function onSyncLoaded() {
    var items, key, value, local_ts, filters, syncTs;
    
    items = JSON.parse(this.responseText);
    
    if (items.error) {
      return Feedback.error('Sync: ' + items.error);
    }
    
    if (this.withFeedback) {
      Feedback.notify('Done');
    }
    
    syncTs = getSyncTs();
    syncTs.ts = Date.now();
    
    for (key in items) {
      value = items[key];
      
      local_ts = syncTs[key] || 0;
      
      if (+local_ts > +value['ts']) {
        continue;
      }
      
      localStorage.setItem(key, JSON.stringify(value['data']));
      
      syncTs[key] = value['ts'];
    }
    
    setSyncTs(syncTs);
    
    loadFilters();
    loadStorage();
    buildThreads();
    
    if ($filtersPanel[0].style.display == 'block') {
      $filterList[0].textContent = '';
      
      if (filters = localStorage.getItem('filters')) {
        buildFiltersTable(JSON.parse(filters));
      }
    }
  }
  
  function onSyncQueueProcessed() {
    var items;
    
    items = JSON.parse(this.responseText);
    
    if (items.error) {
      return Feedback.error('Sync: ' + items.error);
    }
  }
  
  function syncPush(key) {
    var ts, tsData;
    
    if (!syncEnabled) {
      return;
    }
    
    ts = Math.round(Date.now() / 1000);
    
    tsData = getSyncTs();
    tsData[key] = ts;
    setSyncTs(tsData);
    
    syncQueue[key] = ts;
    
    if (syncTimeout) {
      clearTimeout(syncTimeout);
    }
    
    syncTimeout = setTimeout(syncProcessQueue, 1000);
  }
  
  function syncProcessQueue() {
    var set, xhr, key;
    
    set = {};
    
    for (key in syncQueue) {
      set[key] = {
        ts: syncQueue[key],
        data: JSON.parse(localStorage.getItem(key))
      }
    }
    
    syncQueue = {};
    
    xhr = new XMLHttpRequest();
    xhr.open('POST', options.syncUrl + 'v1/sync');
    xhr.onload = onSyncQueueProcessed;
    xhr.onerror = onSyncError;
    xhr.send(JSON.stringify({
      id: localStorage.getItem('sync-id'),
      set: set
    }));
  }
  
  function toggleThreadPin(tid) {
    var key, meta, page;
    
    key = 'pin-' + catalog.slug;
    
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
    
    localStorage.setItem(key, JSON.stringify(pinnedThreads));
    syncPush(key);
  }
  
  function toggleThreadHide(tid) {
    var key = 'hide-' + catalog.slug;
    
    hiddenThreads[tid] = 1;
    localStorage.setItem(key, JSON.stringify(hiddenThreads));
    syncPush(key);
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
      || el.nodeName == 'INPUT'
      || e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) {
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
    var key = 'hide-' + catalog.slug;
    
    localStorage.removeItem(key);
    syncPush(key);
    
    hiddenThreads = {};
    
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
  
  function showFilterPalette(el) {
    var cnt, elPos, pPos;
    
    if (!$filterPalette) {
      $filterPalette = $('#filter-palette');
      buildFilterPalette();
    }
    
    $filterPalette.attr('data-target', el.getAttribute('data-id'));
    
    cnt = $filterPalette[0];
    
    pPos = $filtersPanel[0].getBoundingClientRect();
    elPos = el.getBoundingClientRect();
    
    $filterPalette.show();
    
    cnt.style.top = (elPos.top - pPos.top) + 'px';
    cnt.style.left = (elPos.left - pPos.left - cnt.offsetWidth - 5) + 'px';
  }
  
  function showFilters() {
    var data;
    
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
      $filtersPanel.click(onFilterEditorClick);
      
      $('#filters-input').on('change', onFiltersFileChanged);
      
      if (data = localStorage.getItem('filters')) {
        buildFiltersTable(JSON.parse(data));
      }
      
      $filtersPanel[0].style.top = window.pageYOffset + 30 + 'px';
      
      $filtersPanel.show();
    }
  }
  
  function onFilterEditorClick(e) {
    var t, cmd;
    
    t = e.target;
    
    if (cmd = t.getAttribute('data-cmd')) {
      switch (cmd) {
        case 'filter-save':
          saveFilters();
          break;
        case 'filter-close':
          closeFilters();
          break;
        case 'filter-add':
          addEmptyFilter();
          break;
        case 'filter-move-up':
          onMoveFilterUp(t);
          break;
        case 'filter-toggle-active':
          toggleFilter(t, 'active');
          break;
        case 'filter-toggle-top':
          toggleFilter(t, 'top', 'hide');
          break;
        case 'filter-toggle-hide':
          toggleFilter(t, 'hide', 'top');
          break;
        case 'filter-toggle-strict':
          toggleFilter(t, 'strict');
          break;
        case 'filter-delete':
          deleteFilter(t);
          break;
        case 'filter-show-palette':
          showFilterPalette(t);
          break;
        case 'filter-close-palette':
          closeFilterPalette();
          break;
        case 'filter-clear-palette':
          clearFilterColor();
          break;
        case 'filter-open-help':
          showFiltersHelp();
          break;
        case 'filter-import':
          onImportFiltersClick(t);
          break;
        case 'filter-export':
          onExportFiltersClick(t, e);
          break;
      };
    }
  }
  
  function showFiltersHelp() {
    var el = $('#filters-protip');
    $('#filters-help-close').on('click', hideFiltersHelp);
    el[0].style.top = window.pageYOffset + 30 + 'px';
    el.show();
  }
  
  function hideFiltersHelp() {
    $('#filters-help-close').off('click');
    $('#filters-protip').hide();
  }
  
  function buildFiltersTable(rawFilters) {
    var i, filterId;
    
    filterId = 0;
    
    for (i in rawFilters) {
      $filterList.append(buildFilter(rawFilters[i], filterId));
      ++filterId;
    }
    
    updateFilterHitCount();
  }
  
  function closeFilters() {
    $filtersPanel.off('click');
    $('#filters-input').off('change');
    
    $('#filters-msg').hide();
    $filtersPanel.hide();
    $filterList.children('tr').remove();
  }
  
  function onExportFiltersClick(el, e) {
    var data, w;
    
    if (data = localStorage.getItem('filters')) {
      if (navigator.appName == 'Microsoft Internet Explorer') {
        w = window.open();
        w.document.write(data);
        w.document.close()
      }
      else {
        el.href = 'data:text/plain;charset=UTF-8,' + encodeURIComponent(data);
      }
    }
    else {
      e.preventDefault();
      alert('Nothing to export');
    }
  }
  
  function onImportFiltersClick(el) {
    var type = el.getAttribute('data-type');
    
    if (type == 'file') {
      importFiltersFromFile();
    }
    else if (type == 'string') {
      importFiltersFromString();
    }
  }
  
  function importFiltersFromFile() {
    if (!window.FileReader) {
      return alert("Your browser doesn't support FileReader API");
    }
    
    document.getElementById('filters-input').click();
  }
  
  function importFiltersFromString() {
    var str = prompt('Paste your previously exported filters here');
    
    if (!str) {
      return;
    }
    
    loadImportedFilters(str);
  }
  
  function onFiltersFileChanged(e) {
    var r, file;
    
    file = e.target.files[0];
    
    if (!file) {
      return;
    }
    
    r = new FileReader();
    r.onload = function(e) { loadImportedFilters(e.target.result); };
    r.readAsText(file);
  }
  
  function loadImportedFilters(str) {
    var data;
    
    try {
      data = JSON.parse(str);
      $filterList.children('tr').remove();
      buildFiltersTable(data);
    }
    catch (e) {
      alert('Error while reading the file:\n' + e.toString());
    }
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
      
    wordSepS = '(?=[\\s\\S]*\\b(';
    wordSepE = ')\\b)';
    
    try {
      for (fid in rawFilters) {
        rf = rawFilters[fid];
        if (rf.active && rf.pattern != '') {
          if (rf.boards && (' ' + rf.boards + ' ').indexOf(' ' + catalog.slug + ' ') == -1) {
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
            strict: rf.strict,
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
        top:    +(cols[6].firstElementChild.getAttribute('data-top')),
        strict: +(cols[7].firstElementChild.getAttribute('data-strict'))
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
    
    syncPush('filters');
    
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
  
  function onMoveFilterUp(el) {
    var tr, prev;
    
    tr = el.parentNode.parentNode;
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
    td.firstChild.setAttribute('data-cmd', 'filter-move-up');
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
    el.setAttribute('data-cmd', 'filter-toggle-active');
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
    el.setAttribute('data-cmd', 'filter-show-palette');
    el.setAttribute('data-id', id);
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
    el.setAttribute('data-cmd', 'filter-toggle-hide');
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
    el.setAttribute('data-cmd', 'filter-toggle-top');
    td.appendChild(el);
    tr.appendChild(td);
    
    // Strict
    td = document.createElement('td');
    el = document.createElement('span');
    cls = 'button clickbox filter-strict';
    el.setAttribute('data-strict', filter.strict || 0);
    if (filter.strict) {
      cls += ' active';
      el.innerHTML = '&#x2714;';
    }
    el.setAttribute('class', cls);
    el.setAttribute('data-cmd', 'filter-toggle-strict');
    td.appendChild(el);
    tr.appendChild(td);
    
    // Del
    td = document.createElement('td');
    el = document.createElement('span');
    el.setAttribute('data-target', id);
    el.setAttribute('class', 'button clickbox');
    el.innerHTML = '&#x2716;';
    el.setAttribute('data-cmd', 'filter-delete');
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
  
  function deleteFilter(el) {
    var el, t = el.getAttribute('data-target');
    
    el = document.getElementById('filter-' + t);
    el.parentNode.removeChild(el);
  }
  
  function toggleFilter(el, type, xorType) {
    var i, p, attr, xorEl;
    
    attr = 'data-' + type;
    
    if (el.getAttribute(attr) !== '1') {
      el.setAttribute(attr, '1');
      el.className += ' active';
      el.innerHTML = '&#x2714;';
      
      if (xorType) {
        p = el.parentNode.parentNode;
        
        xorEl = p.getElementsByClassName('filter-' + xorType)[0];
        
        if (!xorEl) {
          return;
        }
        
        xorEl.setAttribute('data-'  + xorType, '0');
        xorEl.className = xorEl.className.replace(' active', '');
        xorEl.textContent = '';
      }
    }
    else {
      el.setAttribute(attr, '0');
      el.className = el.className.replace(' active', '');
      el.textContent = '';
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
      
      $('#sync-manage').click(showSyncManager);
      
      $('#theme-save').click(saveTheme);
      $('#theme-close').click(closeThemeEditor);
        
      $('#theme-msg').hide();
      
      $themePanel[0].style.top = window.pageYOffset + 30 + 'px';
      
      $themePanel.show();
    }
  }
  
  function closeThemeEditor() {    
    var i, btn, buttons;
    
    if (document.getElementById('sync-panel')) {
      return;
    }
    
    buttons =
      document.getElementById('theme-set').getElementsByClassName('button');
      
    for (i = 0; btn = buttons[i]; ++i) {
      disableButton(btn);
      btn.removeEventListener('click', toggleButton, false);
    }
    
    $('#sync-manage').off('click');
    
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
      slugs[i].style.display = 'inline-block';
    }
    
    if (more = document.getElementById('more-slugs-btn')) {
      more.style.display = 'none';
      more.removeEventListener('click', resetCustomMenu, false);
    }
    
    nav.style.display = '';
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
            slugs[i].style.display = 'inline-block';
          }
        }
        
        if (more = document.getElementById('more-slugs-btn')) {
          if (hasHidden) {
            more.addEventListener('click', resetCustomMenu, false);
            more.style.display = 'inline-block';
          }
          else {
            more.style.display = 'none';
          }
        }
        
        nav.style.display = '';
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
      $.extend(options, defaults, JSON.parse(settings));
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
    var el, sel, ctrl;
    
    sel = 'order-' + order;
    
    if (el = document.getElementById(sel)) {
      document.getElementById('order-cnt').className = sel;
      
      ctrl = document.getElementById('order-ctrl');
      
      if (ctrl.className.indexOf(' disabled') != -1) {
        ctrl.className = ctrl.className.replace(' disabled', '');
      }
      
      if (order == 'act' && !catalog.order.act) {
        ctrl.className += ' disabled';
      }
      
      ctrl.textContent = el.textContent;
      
      options.orderby = order;
    }
    
    if (!init) {
      saveSettings();
      buildThreads();
    }
  }
  
  function cycleOrder() {
    var o = { date: 'alt', alt: 'r', r: 'lr', lr: 'act', act: 'date' };
    setOrder(o[options.orderby]);
  }
  
  function setHidePinned(mode, init) {
    var el = document.getElementById('pinned-ctrl');
    
    if (mode) {
      el.className = el.className.replace('-hide', '-show');
      el.setAttribute('data-tip', 'Show pinned threads');
      options.hidepinned = true;
    }
    else {
      el.className = el.className.replace('-show', '-hide');
      el.setAttribute('data-tip', 'Hide pinned threads');
      el.textContent = '';
      options.hidepinned = false;
    }
    
    if (!init) {
      saveSettings();
      buildThreads();
    }
  }
  
  function toggleHidePinned() {
    setHidePinned(!options.hidepinned);
  }
  
  function setPinnedCount(count) {
    var el = document.getElementById('pinned-ctrl');
    el.innerHTML = '<span>' + count + '</span>';
  }
  
  function buildThreads() {
    var
      i, j, fid, id, entry, thread, af, hl, onTop, pinned, provider, src,
      rDiff, onPage, filtered = 0, ratio, maxSize, imgWidth, imgHeight, calcSize,
      matched, order, score, count, isDeepSearch, pinnedCount, hidePinned,
      pattern,
      html = '', topHtml = '';
    
    if ($threads[0].hasChildNodes()) {
      $threads.empty();
    }
    
    if (catalog.count == 0) {
      $threads.html('Empty threadlist').css('text-align', 'center');
      return;
    }
    
    if (options.proxy && catalog.proxy) {
      provider = catalog.proxy + '/' + catalog.slug + '/thread/';
      
      if (catalog.proxy_ssl) {
        provider = '//' + provider;
      }
      else {
        provider = 'http://' + provider;
      }
    }
    else {
      provider = options.server + catalog.slug + '/res/';
    }
    
    hiddenThreadsCount = 0;
    
    for (fid in activeFilters) {
      activeFilters[fid].hits = 0;
    }
    
    calcSize = options.thsize == 'small';
    
    calcActivity = false;
    
    matchedFilters = {};
    
    if (quickFilterPattern && !quickFilterPattern.test) {
      isDeepSearch = true;
      order = quickFilterPattern.hits;
      count = quickFilterPattern.total;
    }
    else {
      isDeepSearch = false;
      order = catalog.order[options.orderby];
      if (options.orderby == 'act' && !order) {
        order = catalog.order.lr;
      }
      count = catalog.count;
    }
    
    hidePinned = options.hidepinned;
    pinnedCount = 0;
    
    threadloop: for (i = 0; i < count; ++i) {
      id = order[i];
      
      entry = catalog.threads[id];
      
      hl = onTop = pinned = matched = false;
      
      if(!quickFilterPattern) {
        if (hiddenThreads[id]) {
          ++hiddenThreadsCount;
          continue;
        }
        for (fid in activeFilters) {
          af = activeFilters[fid];
          pattern = af.pattern;
          // Standard filter
          if (af.type == 0) {
            // Hide teaser filter
            if (af.hidden) {
              if (pattern.test(entry.teaser)) {
                ++filtered;
                af.hits += 1;
                continue threadloop;
              }
            }
            // Highlighting teaser filter
            else if (pattern.test(entry.teaser)) {
              matched = true;
              matchedFilters[id] = [ 'teaser', af ];
              break;
            }
            // Highlighting filename filter
            else if (entry.file && pattern.test(entry.file)) {
              matched = true;
              matchedFilters[id] = [ 'file', af ];
              break;
            }
            // Highlighting tags filter
            else if (!af.strict && entry.tags && pattern.test(entry.tags)) {
              matched = true;
              matchedFilters[id] = [ 'tags', af ];
              break;
            }
          }
          // Author filter
          else if (af.type == 1 && pattern.test(entry.author)) {
            // Hide author filter
            if (af.hidden) {
              ++filtered;
              af.hits += 1;
              continue threadloop;
            }
            // Highlighting author filter
            matched = true;
            matchedFilters[id] = [ 'author', af ];
            break;
          }
        }
        // Non-Hide match
        if (matched) {
          hl = af;
          onTop = !!af.top;
          af.hits += 1;
          if (onTop && hidePinned) {
            pinnedCount += 1;
            continue threadloop;
          }
        }
      }
      else if (isDeepSearch) {
        if (!entry) {
          continue;
        }
        score = quickFilterPattern.scores[i];
      }
      else if (!quickFilterPattern.test(entry.teaser)
        && (!entry.tags || !quickFilterPattern.test(entry.tags))
        && (!entry.file || !quickFilterPattern.test(entry.file))) {
        continue;
      }
      
      if (pinnedThreads[id] >= 0) {
        if (hidePinned) {
          pinnedCount += 1;
          continue;
        }
        pinned = onTop = true;
      }
      
      thread = '<article id="thread-' + id
      + '" class="thread"><div class="thread-ctrl"><span data-tip="Pin/Unpin" data-cmd="pin" class="icon icon-angle-circled-up"></span><span data-tip="Hide" data-cmd="hide" class="icon icon-cancel-circled"></span><span data-tip="Report" data-cmd="report" class="icon icon-attention-circled"></span></div><a target="_blank" href="'
      + provider + id + '">'
      + (score ? ('<span data-tip="Score" class="score">' + score + '</span>') : '')
      + '<img alt="" id="thumb-' + id + '" class="thumb';
      
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
      + options.contentUrl + src + '" data-id="' + id + '"></a>';
      
      if (catalog.flags) {
        thread += '<div class="flag flag-' + entry.loc + '" data-tip="'
        + entry.locname + '"></div>';
      }
      
      thread += '<div id="meta-' + id + '" class="meta">';
      
      if (entry.sticky) {
        thread += '<span class="meta-cell sticky" data-tip="Sticky">●</span>';
      }
      
      if (entry.r) {
        thread += '<span class="meta-cell meta-r" data-tip="Replies">' + entry.r;
        
        if (pinned) {
          rDiff = entry.r - pinnedThreads[id];
          if (rDiff > 0) {
            thread += '<ins class="meta-ins" data-tip="New replies">(+' + rDiff + ')</ins>';
            pinnedThreads[id] = entry.r;
          }
        }
        
        thread += '</span>';
        
        if (entry.i) {
          thread += '<span class="meta-cell meta-i" data-tip="Images">' + entry.i + '</span>';
        }
      }
      
      if (onTop && (page = getThreadPage(id))) {
        thread += '<span class="meta-cell meta-p" data-tip="Page">' + page + '</span>';
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
      
      if (onTop || (entry.sticky && activeTheme.stickies)) {
        topHtml += thread + '</article>';
      }
      else {
        html += thread + '</article>';
      }
    }
    
    if (topHtml !== '') {
      html = topHtml + html;
    }
    
    if (html === '') {
      html = '<div id="no-threads"><h3>Nothing found.</h3>';
      
      if (quickFilterPattern) {
        if (isDeepSearch) {
          html += '<p>Make sure you are searching for whole words '
            + 'or use a wildcard * suffix to get partial matches.</p>'
            + '<p>Hit <i>Tab</i> to switch to simple search mode.'
            + ' Simple mode supports partial matches by default but'
            + ' can only search inside opening posts.<br>You can set your'
            + ' preferred search mode in the Settings menu.</p>';
        }
        else if (catalog.deep_search) {
          html += '<p>Hit <i>Tab</i> to switch to full thread mode'
            + ' and extend your search to reply posts.<br>You can set your'
            + ' preferred search mode in the Settings menu.</p>';
        }
      }
      html += '</div>';
    }
    else {
      html += '<div class="clear"></div>';
    }
    
    if (hidePinned) {
      setPinnedCount(quickFilterPattern ? '~' : pinnedCount);
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

var Feedback = {
  messageTimeout: null,
  
  showMessage: function(msg, type, timeout) {
    var el;
    
    this.hideMessage();
    
    el = document.createElement('div');
    el.id = 'feedback';
    el.title = 'Dismiss';
    el.innerHTML = '<span class="feedback-' + type + '">' + msg + '</span>';
    
    el.addEventListener('click', this.hideMessage, false);
    
    document.body.appendChild(el);
    
    if (timeout) {
      this.messageTimeout = setTimeout(this.hideMessage, timeout);
    }
  },
  
  hideMessage: function() {
    var el = document.getElementById('feedback');
    
    if (el) {
      if (this.messageTimeout) {
        clearTimeout(this.messageTimeout);
        this.messageTimeout = null;
      }
      
      el.removeEventListener('click', this.hideMessage, false);
      
      document.body.removeChild(el);
    }
  },
  
  error: function(msg, timeout) {
    if (timeout === undefined) {
      timeout = 5000;
    }
    this.showMessage(msg || 'Something went wrong', 'error', 5000);
  },
  
  notify: function(msg, timeout) {
    if (timeout === undefined) {
      timeout = 3000;
    }
    this.showMessage(msg, 'notify', timeout);
  }
}
