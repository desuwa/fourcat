$.fourcat = function(opts) {
  
  var fc = this,
  
  defaults = {
    // Order: 'date' or 'alt'
    orderby: 'date',
    // Thumbnail size: 'small' or 'large'
    thsize: 'small',
    // Show teaser
    extended: true,
    // Redirect to the archive
    proxy: false,
    // Cookie domain
    cookieDomain: document.domain,
    // Cookie path
    cookiePath: '/',
    // Thumbnails server url
    contentUrl: '/',
    // Filter complete words
    filterFullWords: true,
    // Filters color palette
    filterColors: [
      ['#E0B0FF', '#F2F3F4', '#7DF9FF', '#FFFF00'],
      ['#FBCEB1', '#FFBF00', '#ADFF2F', '#0047AB']
    ],
    threadsPerPage: 10
  },
  
  catalog = {},
  
  options = {},
  
  baseFilter = {
    active: 1,
    pattern: '',
    color: '',
    hidden: 0,
    top: 0,
    hits: 0
  },
  
  activeTheme = {},
  
  activeFilters = {},
  
  // Tooltip options
  tipopts = {
    id: 'th-tip',
    title: tipCb,
    html: true,
    gravity: $.fn.tipsy.autoWE,
    delayIn: 350
  },
  
  pinnedThreads = {},
  
  hiddenThreads = {},
  hiddenThreadsCount = 0,
  
  quickFilterPattern = false,
  
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
  
  $threads = $('#threads'),
  $thumbs,
  $refresh = $('#refresh').tipsy({ gravity: 'sw' }),
  $qfCtrl = $('#qf-ctrl').click(toggleQuickfilter);
  $proxyCtrl = $('#proxy-ctrl').tipsy({ gravity: 'se' }),
  $teaserCtrl = $('#teaser-ctrl'),
  $sizeCtrl = $('#size-ctrl'),
  $orderCtrl = $('#order-ctrl').tipsy(),
  $themePanel = $('#theme'),
  $hiddenCount = $('#hidden-count'),
  $hiddenLabel = $('#hidden-label'),
  $filtersPanel = $('#filters'),
  $filterList = $('#filter-list'),
  $filterRgb = $('#filter-rgb').keyup(filterSetCustomColor),
  $filterRgbOk = $('#filter-rgb-ok').click(selectFilterColor),
  $filteredCount = $('#filtered-count'),
  $filteredLabel = $('#filtered-label'),
  
  $filterPalette = null,
  
  $('#qf-ok').click(applyQuickfilter);
  $('#qf-clear').click(toggleQuickfilter);
  
  $('#theme-ctrl').click(showThemeEditor);
  
  $('#filters-ctrl').click(showFilters);
  
  // Enterprise Grade polyfilling
  if (!Array.prototype.indexOf) {
    Array.prototype.indexOf = function () { return -1; }
  }
  
  if ('HTMLMenuItemElement' in window) {
    document.getElementById('ctxmenu-main').innerHTML = 
      '<menuitem label="Show hidden threads" id="ctxitem-unhide"></menuitem>'
      + '<menuitem label="Unpin threads" id="ctxitem-unpin"></menuitem>';
    $('#ctxitem-unhide').click(clearHiddenThreads);
    $('#ctxitem-unpin').click(clearPinnedThreads);
  }
  
  $('#filters-clear-hidden').click(clearHiddenThreads);

  $(window).resize(centerThreads);
  
  fc.loadCatalog = function(c) {
    catalog = c;
    fc.loadStorage();
    updateTime();
    $refresh[0].setAttribute('data-tip', $refresh[0].getAttribute('data-label')
      + ' ' + fc.getDuration(catalog.delay, true));
    fc.setProxy(options.proxy, true);
    fc.buildThreads();
    centerThreads();
    clearInterval(pulseInterval);
    pulseInterval = setInterval(updateTime, 10000);
  }
  
  function getRegexSpecials() {
    var specials = ['/', '.', '*', '+', '?', '(', ')', '[', ']', '{', '}', '\\' ];
    return new RegExp('(\\' + specials.join('|\\') + ')', 'g');
  }
  
  function getThreadPage(tid) {
    return 0 | (catalog.order.alt.indexOf(tid) / options.threadsPerPage);
  }
  
  function toggleQuickfilter() {
    var qfcnt = document.getElementById('qf-cnt');
    if ($qfCtrl.hasClass('active')) {
      clearQuickfilter();
      qfcnt.style.display = 'none';
      $qfCtrl.removeClass('active');
      $('#qf-box').off('keyup').off('keydown');
    }
    else {
      qfcnt.style.display = 'inline';
      $('#qf-box').keyup(function(e) {
        if (e.keyCode == '13') {
          applyQuickfilter();
        }
      }).keydown(function(e) {
        if (e.keyCode == '27') {
          toggleQuickfilter();
        }
      }).focus()[0].value = '';
      $qfCtrl.addClass('active');
    }
  }
  
  function applyQuickfilter() {
    var qfstr = document.getElementById('qf-box').value;
    if (qfstr != '') {
      var regexEscape = getRegexSpecials();
      qfstr = qfstr.replace(regexEscape, '\\$1');
      quickFilterPattern = new RegExp(qfstr, 'i');
      fc.buildThreads();
    }
  }
  
  function clearQuickfilter() {
    var qfstr = document.getElementById('qf-box').value;
    quickFilterPattern = false;
    fc.buildThreads();
  }
  
  function bindGlobalShortcuts() {
    if (hasWebStorage && hasNativeJSON) {
      $threads[0].onclick = function(e) {
        e = e || window.event;
        var el = (e.target || e.srcElement);
        if (el.className.indexOf('thumb') != -1) {
          if ((e.altKey && !activeTheme.altKey)
            || (e.ctrlKey && activeTheme.altKey)) {
            var tid = el.getAttribute('data-id');
            if (pinnedThreads[tid] >= 0) {
              delete pinnedThreads[tid];
            }
            else {
              pinnedThreads[tid] = catalog.threads[tid].r || 0;
            }
            localStorage.setItem('pin-' + catalog.slug, JSON.stringify(pinnedThreads));
            fc.buildThreads();
            if (e.preventDefault) e.preventDefault();
            else e.returnValue = false;
          }
          else if (e.shiftKey) {
            if (!hiddenThreads) {
              hiddenThreads = {};
            }
            hiddenThreads[el.getAttribute('data-id')] = true;
            localStorage.setItem('hide-' + catalog.slug, JSON.stringify(hiddenThreads));
            el.parentNode.parentNode.style.display = 'none';
            ++hiddenThreadsCount;
            $hiddenCount[0].innerHTML = hiddenThreadsCount;
            $hiddenLabel.show();
            if (e.preventDefault) e.preventDefault();
            else e.returnValue = false;
          }
        }
      };
    }
  }
  
  function clearHiddenThreads() {
    hiddenThreads = {};
    localStorage.removeItem('hide-' + catalog.slug);
    if (hiddenThreadsCount > 0) {
      fc.buildThreads();
    }
    return false;
  }
  
  function clearPinnedThreads() {
    pinnedThreads = {};
    localStorage.removeItem('pin-' + catalog.slug);
    fc.buildThreads();
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
  
  function enableButton($el) {
    $el.addClass('active');
    if ($el.hasClass('clickbox')) {
      $el[0].innerHTML = '&#x2714;';
    }
  }
  
  function disableButton($el) {
    $el.removeClass('active');
    if ($el.hasClass('clickbox')) {
      $el[0].innerHTML = '';
    }
  }
  
  function toggleButton($el) {
    if ($el.hasClass('active')) {
      disableButton($el);
    }
    else {
      enableButton($el);
    }
  }
  
  function onThumbMouseIn() {
    var
      $this = $(this),
      ofsDiff = this.offsetLeft - $this.closest('.thread')[0].offsetLeft,
      oldWidth = this.offsetWidth,
      oldHeight = this.offsetHeight,
      newWidth, newHeight;
    
    $this.clone().insertAfter($this);
    
    $this.addClass('scaled');
    
    newWidth = this.offsetWidth;
    newHeight = this.offsetHeight;
    
    offsetX = (-(newWidth - oldWidth) / 2) + ofsDiff;
    offsetY = -(newHeight - oldHeight) / 2;
    
    this.style.marginLeft = offsetX + 'px';
    this.style.marginTop = offsetY + 'px';
  }
  
  function onThumbMouseOut() {
    var $this = $(this);
    $this.next().remove();
    
    $this.removeClass('scaled');
    this.style.marginLeft = '';
    this.style.marginTop = '';
  }
  
  // Bound to window.onresize
  function centerThreads() {
    if (!$thumbs) return;
    
    var
      thumbswidth = $thumbs.closest('.thread').outerWidth(true),
      threadswidth = $threads[0].offsetWidth,
      rowsize = (0 | (threadswidth / thumbswidth)) * thumbswidth;
    
    if (rowsize == 0) {
      return;
    }
    
    $threads[0].style.paddingLeft = ((threadswidth - rowsize) / 2) + 'px';
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
        rawFilters = $.parseJSON(rawFilters);
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
  fc.loadFilters = function() {
    if (!hasWebStorage) return;
    
    activeFilters = {};
    
    var rawFilters = localStorage.getItem('filters');
    if (!rawFilters) return;
    
    rawFilters = $.parseJSON(rawFilters);
    
    var
      wordSepS, wordSepE, orJoin,
      regexType = /^\/(.*)\/(i?)$/,
      regexOrNorm = /\s*\|+\s*/g,
      regexWc = /\\\*/g, replWc = '[^\\s]*',
      regexEscape = getRegexSpecials(),
      match, inner, words, rawPattern, pattern, orOp, orCluster, type;
    
    if (options.filterFullWords) {
      wordSepS = '(?:^|\\b)';
      wordSepE = '(?:$|\\b)';
      orJoin = wordSepS + '|' + wordSepE;
    }
    else {
      wordSepS = wordSepE = '';
      orJoin = '|';
    }
    
    try {
      for (var fid in rawFilters) {
        if (rawFilters[fid].active && rawFilters[fid].pattern != '') {
          rawPattern = rawFilters[fid].pattern;
          if (rawPattern[0] == '#') {
            type = 1;
            pattern = rawPattern.slice(1).replace(regexEscape, '\\$1');
          }
          else {
            type = 0;
            if (match = rawPattern.match(regexType)) {
              pattern = new RegExp(match[1], match[2]);
            }
            else if (rawPattern[0] == '"' && rawPattern[rawPattern.length - 1] == '"') {
              pattern = new RegExp(rawPattern.slice(1, -1).replace(regexEscape, '\\$1'));
            }
            else {
              words = rawPattern.replace(regexOrNorm, '|').split(' ');
              pattern = '';
              for (var w = words.length - 1; w >= 0; w--) {
                if (words[w].indexOf('|') != -1) {
                  orOp = words[w].split('|');
                  orCluster = [];
                  for (var v = orOp.length - 1; v >= 0; v--) {
                    if (orOp[v] != '') {
                      orCluster.push(orOp[v].replace(regexEscape, '\\$1'));
                    }
                  }
                  inner = orCluster.join('|').replace(regexWc, replWc);
                  pattern += ('(?=.*' + wordSepS + '(' + inner + ')' + wordSepE + ')');
                }
                else {
                  inner = words[w].replace(regexEscape, '\\$1').replace(regexWc, replWc);
                  pattern += ('(?=.*' + wordSepS + inner + wordSepE + ')');
                }
              }
              pattern = new RegExp(pattern, 'i');
            }
          }
          //console.log('Resulting regex: ' + pattern);
          activeFilters[fid] = {
            type: type,
            pattern: pattern,
            fid: fid,
            hidden: rawFilters[fid].hidden,
            color: rawFilters[fid].color,
            bright: rawFilters[fid].bright,
            top: rawFilters[fid].top,
            hits: 0
          };
        }
      }
    }
    catch (err) {
      alert('There was an error processing one of the filters: '
        + err + ' in: ' + rawPattern);
    }
  }
  
  function saveFilters() {
    var rawFilters = {}, $msg = $('#filters-msg');
    
    $filterList.children('tr').each(function(i, e) {
      var
        $cols = $(e).children('td'),
        $color = $($cols[2]).children('span'),
        f = {
          active: parseInt($($cols[0]).children('span').attr('data-active')),
          pattern: $($cols[1]).children('input').val(),
          hidden: parseInt($($cols[3]).children('span').attr('data-hide')),
          top: parseInt($($cols[4]).children('span').attr('data-top'))
        };
      if ($color.attr('data-nocolor') === undefined) {
        f.color = $color.css('background-color');
        if (getColorBrightness(f.color) > 125) {
          f.bright = true;
        }
      }
      rawFilters[i] = f;
    });
    
    if (rawFilters['0']) {
      localStorage.setItem('filters', JSON.stringify(rawFilters));
    }
    else {
      localStorage.removeItem('filters');
    }
    
    $msg.html('Done').attr('class', 'msg-ok').show().delay(2000).fadeOut(500);
    
    fc.loadFilters();
    fc.buildThreads();
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
  
  function buildFilter(filter, id) {
    var td, span, tr, input, cls;
    
    tr = document.createElement('tr');
    tr.id = 'filter-' + id;
    
    // On
    td = document.createElement('td');
    span = document.createElement('span');
    span.setAttribute('data-active', filter.active);
    cls = 'button clickbox';
    if (filter.active) {
      cls += ' active';
      span.innerHTML = '&#x2714;';
    }
    span.setAttribute('class', cls);
    $(span).on('click', {type: 'active'}, toggleFilter);
    td.appendChild(span);
    tr.appendChild(td);
    
    // Pattern
    td = document.createElement('td');
    input = document.createElement('input');
    input.type = 'text';
    input.value = filter.pattern;
    td.appendChild(input);
    tr.appendChild(td);
    
    // Color
    td = document.createElement('td');
    span = document.createElement('span');
    span.id = 'filter-color-' + id
    span.setAttribute('class', 'button clickbox');
    if (!filter.color) {
      span.setAttribute('data-nocolor', '1');
      span.innerHTML = '&#x2215;';
    }
    else {
      span.style.background = filter.color;
    }
    $(span).on('click', {fid: id}, showFilterPalette);
    td.appendChild(span);
    tr.appendChild(td);
    
    // Hide
    td = document.createElement('td');
    span = document.createElement('span');
    cls = 'button clickbox filter-hide';
    span.setAttribute('data-hide', filter.hidden);
    if (filter.hidden) {
      cls += ' active';
      span.innerHTML = '&#x2714;';
    }
    span.setAttribute('class', cls);
    $(span).on('click', {type: 'hide', xor: 'top'}, toggleFilter);
    td.appendChild(span);
    tr.appendChild(td);
    
    // Top
    td = document.createElement('td');
    span = document.createElement('span');
    cls = 'button clickbox filter-top';
    span.setAttribute('data-top', filter.top);
    if (filter.top) {
      cls += ' active';
      span.innerHTML = '&#x2714;';
    }
    span.setAttribute('class', cls);
    $(span).on('click', {type: 'top', xor: 'hide'}, toggleFilter);
    td.appendChild(span);
    tr.appendChild(td);
    
    // Del
    td = document.createElement('td');
    span = document.createElement('span');
    span.setAttribute('data-target', id);
    span.setAttribute('class', 'button clickbox');
    span.innerHTML = '&#x2716;';
    $(span).on('click', deleteFilter)
    td.appendChild(span);
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
    $filterList[0].appendChild(buildFilter(baseFilter, getNextFilterId()));
  }
  
  function getNextFilterId() {
    var len, tmp = $filterList[0].getElementsByTagName('tr');
    if (!(len = tmp.length)) {
      return 0;
    }
    else {
      return tmp[len - 1].getAttribute('id').slice(7) + 1;
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
      var
        buttons = ['notipsy', 'magnify', 'altKey'],
        theme = localStorage.getItem('theme');
      
      theme = theme ? JSON.parse(theme) : {};
      
      for (var i = buttons.length - 1; i >= 0; i--) {
        if (theme[buttons[i]]) {
          enableButton($('#theme-' + buttons[i]));
        }
        else {
          disableButton($('#theme-' + buttons[i]));
        }
      }
      
      if (theme.css) {
        document.getElementById('theme-css').value = theme.css;
      }
      
      $('#theme-notipsy, #theme-magnify, #theme-altKey')
        .click(function() { toggleButton($(this)) });
      
      $('#theme-save').click(saveTheme);
      $('#theme-close').click(closeThemeEditor);
        
      $('#theme-msg').hide();
      $themePanel.show();
    }
  }
  
  function closeThemeEditor() {    
    $('#theme-save, #theme-close, #theme-notipsy, #theme-magnify, #theme-altKey')
      .off('click');
    $themePanel.hide();
  }
  
  fc.loadTheme = function() {
    if (!hasWebStorage) return;
    
    var customTheme = localStorage.getItem('theme');
    
    if (!customTheme) return;
    
    activeTheme = $.parseJSON(customTheme);
    applyTheme(activeTheme);
  }
  
  function applyTheme(customTheme) {
    var style;
      
    if (customTheme.notipsy) {
      if (customTheme.notipsy != activeTheme.notipsy) {
        $thumbs
          .off('mouseenter.tipsy')
          .off('mouseleave.tipsy');
      }
    }
    else {
      if (activeTheme.notipsy != customTheme.notipsy) {
        $thumbs.tipsy(tipopts);
      }
    }
    
    if (customTheme.magnify) {
      if (activeTheme.magnify != customTheme.magnify
          && options.thsize == 'small') {
        $thumbs
          .on('mouseenter.scale', onThumbMouseIn)
          .on('mouseleave.scale', onThumbMouseOut);
      }
    }
    else {
      if (activeTheme.magnify != customTheme.magnify) {
        $thumbs
          .off('mouseenter.scale')
          .off('mouseleave.scale');
      }
    }
    
    style = document.getElementById('custom-css')
    if (style) {
      (document.head || document.getElementsByTagName('head')[0]).removeChild(style);
    }
    
    if (customTheme.css) {
      style = document.createElement('style');
      style.setAttribute('type', 'text/css');
      style.setAttribute('id', 'custom-css');
      
      if (style.styleSheet) {
        style.styleSheet.cssText = customTheme.css;
      }
      else {
        style.innerHTML = customTheme.css;
      }
      // Allows to add in-page css inside a style tag with 'event-css' as id
      (document.head || document.getElementsByTagName('head')[0])
        .insertBefore(style, document.getElementById('event-css'));
    }
  }
  
  // Applies and saves the theme to localStorage
  function saveTheme() {
    var css, style, rebuild, customTheme = {};
    
    if ($('#theme-notipsy').hasClass('active')) {
      customTheme.notipsy = true;
    }
    
    if ($('#theme-magnify').hasClass('active')) {
      customTheme.magnify = true;
    }
    
    if ($('#theme-altKey').hasClass('active')) {
      customTheme.altKey = true;
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
    
    $('#theme-msg')
      .html('Theme saved')
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
  fc.loadStorage = function() {
    if (hasWebStorage && hasNativeJSON) {
      hiddenThreads = loadThreadList('hide-' + catalog.slug);
      pinnedThreads = loadThreadList('pin-' + catalog.slug);
    }
  }
  
  // Loads cookie stored settings
  fc.loadSettings = function() {
    var settings = $.parseJSON($.cookie('4cat'));
    if (settings) {
      $.extend(options, settings);
    }
  }    
  
  // Saves settings to a cookie
  function saveSettings() {
    var settings = [];
    if (options.orderby != defaults.orderby) {
      settings.push('"orderby":"' + options.orderby + '"');
    }
    if (options.thsize != defaults.thsize) {
      settings.push('"thsize":"' + options.thsize + '"');
    }
    if (options.extended != defaults.extended) {
      settings.push('"extended":' + (options.extended ? 'true' : 'false'));
    }
    if (options.proxy != defaults.proxy) {
      settings.push('"proxy":' + (options.proxy ? 'true' : 'false'));
    }
    if (settings.length > 0) {
      settings = '{' + settings.join(',') + '}';
      $.cookie('4cat', settings, {
        expires: 30,
        path: options.cookiePath,
        domain: options.cookieDomain
      });
    }
    else {
      $.cookie('4cat', null, {
        path: options.cookiePath,
        domain: options.cookieDomain
      });
    }
  }
  
  fc.setSize = function(size, init) {
    var cls;
    if (size == 'small') {
      $sizeCtrl.html($sizeCtrl.attr('data-lbl-large'));
      cls = 'small';
      if ($thumbs && activeTheme.magnify) {
        $thumbs
          .on('mouseenter.scale', onThumbMouseIn)
          .on('mouseleave.scale', onThumbMouseOut);
      }
      options.thsize = 'small';
    }
    else {
      $sizeCtrl.html($sizeCtrl.attr('data-lbl-small'));
      cls = 'large';
      if ($thumbs && activeTheme.magnify) {
        $thumbs
          .off('mouseenter.scale')
          .off('mouseleave.scale');
      }
      options.thsize = 'large';
    }
    if (options.extended) {
      cls = 'extended-' + cls;
    }
    $threads.attr('class', cls);
    if (!init) {
      centerThreads();
      saveSettings();
    }
  }
  
  fc.setExtended = function(mode, init) {
    var cls = '';
    if (mode) {
      $teaserCtrl.html($teaserCtrl.attr('data-lbl-hide'));
      $('.teaser').css('display', 'block');
      cls = 'extended-';
      options.extended = 1;
    }
    else {
      $teaserCtrl.html($teaserCtrl.attr('data-lbl-show'));
      $('.teaser').css('display', 'none');
      options.extended = false;
    }
    cls += options.thsize;
    $threads.attr('class', cls);
    if (!init) {
      saveSettings();
    }
  }
  
  fc.setProxy = function(mode, init) {
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
      fc.buildThreads();
    }
  }
  
  fc.setOrder = function(order, init) {
    var lbl = document.getElementById('ordered-by');
    if (order == 'date') {
      $orderCtrl.html($orderCtrl.attr('data-lbl-alt'));
      lbl.innerHTML = 'creation date';
      options.orderby = 'date';
    }
    else if (order == 'alt') {
      $orderCtrl.html($orderCtrl.attr('data-lbl-r'));
      lbl.innerHTML = 'bump date';
      options.orderby = 'alt';
    }
    else {
      $orderCtrl.html($orderCtrl.attr('data-lbl-date'));
      lbl.innerHTML = 'reply count';
      options.orderby = 'r';
    }
    if (!init) {
      saveSettings();
      fc.buildThreads();
    }
  }
    
  $sizeCtrl.click(function() {
    fc.setSize(options.thsize == 'small' ? 'large' : 'small');
  });
  
  $orderCtrl.click(function() {
    if (options.orderby == 'date') {
      fc.setOrder('alt');
    }
    else if (options.orderby == 'alt') {
      fc.setOrder('r');
    }
    else {
      fc.setOrder('date');
    }
  });
  
  $teaserCtrl.click(function() {
    fc.setExtended(options.extended == false ? 1 : false);
  });
  
  $proxyCtrl.click(function() {
    fc.setProxy(!options.proxy);
  });
  
  fc.buildThreads = function() {
    var
      tip, i, j, fid, id, entry, thread, af, hl, onTop, pinned, provider,
      rDiff, onPage, filtered = 0, html = '';
    
    if ($threads[0].hasChildNodes()) {
      tip = document.getElementById('th-tip');
      if (tip) {
        document.body.removeChild(tip);
      }
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
      provider = catalog.server + 'res/';
    }
    
    hiddenThreadsCount = 0;
    
    threadloop: for (i = 0; i < catalog.count; ++i) {
      id = catalog.order[options.orderby][i];
      entry = catalog.threads[id];
      hl = onTop = pinned = false;
      if(!quickFilterPattern) {
        if (hiddenThreads[id]) {
          ++hiddenThreadsCount;
          continue;
        }
        if (pinnedThreads[id] >= 0) {
          pinned = onTop = true;
        }
        else {
          for (fid in activeFilters) {
            af = activeFilters[fid];
            if ((af.type == 0 && entry.teaser.search(af.pattern) != -1)
              || (af.type == 1 && entry.author && entry.author.search(af.pattern) != -1)) {
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
      }
      else if (entry.teaser.search(quickFilterPattern) == -1) {
        continue;
      }
      thread = '<div id="thread-' + id
      + '" class="thread"><a target="_blank" href="'
      + provider + id + catalog.ext + '"><img alt="" id="thumb-'
      + id + '" class="thumb';
      
      if (hl.color) {
        thread += ' hl" style="border-color: ' + hl.color;
      }
      else if (pinned) {
        thread += ' pinned';
      }
      thread += '" src="' + options.contentUrl
      + (entry.s ?
        ('images/' + entry.s) :
        (catalog.slug + '/src/' + id + '.jpg')
        ) + '" data-id="' + id + '" /></a>';
      
      thread += '<div title="(R)eplies / (I)mages'
        + (onTop ? ' / (P)age' : '') + '" id="meta-' + id + '" class="meta">';
      
      if (entry.r) {
        thread += 'r:<b>' + entry.r + '</b>';
        if (pinned) {
          rDiff = entry.r - pinnedThreads[id];
          if (rDiff > 0) {
            thread += ' (+' + rDiff + ')';
            pinnedThreads[id] = entry.r;
          }
          else {
            thread += '(+0)';
          }
        }
        if (entry.i) {
          thread += ' / i:<b>' + entry.i + '</b>';
        }
      }
      
      if (onTop && (page = getThreadPage(id)) >= 0) {
        if (entry.r) {
          thread += ' / ';
        }
        thread += 'p:<b>' + page + '</b>';
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
        html = thread + '</div>' + html;
      }
      else {
        html += thread + '</div>';
      }
    }
    html += '<div class="clear"></div>';
    
    for (j in pinnedThreads) {
      localStorage.setItem('pin-' + catalog.slug, JSON.stringify(pinnedThreads));
      break;
    }
    
    $threads[0].innerHTML = html;
    $thumbs = $threads.find('.thumb');
    
    if (options.thsize == 'small' && activeTheme.magnify) {
      $thumbs
        .on('mouseenter.scale', onThumbMouseIn)
        .on('mouseleave.scale', onThumbMouseOut);
    }
    
    if (!activeTheme.notipsy) {
      $thumbs.tipsy(tipopts);
    }
    
    if (filtered > 0) {
      $filteredCount.html(filtered);
      $filteredLabel.show();
    }
    else {
      $filteredLabel.hide();
    }
    
    if (hiddenThreadsCount > 0) {
      $hiddenCount.html(hiddenThreadsCount)
      $hiddenLabel.show();
    }
    else {
      $hiddenLabel.hide();
    }
  }
  
  // Updates the 'Refreshed ago' counter
  function updateTime() {
    var delta = (new Date().getTime() / 1000) - catalog.mtime;
    if (delta > 300) {
      clearInterval(pulseInterval);
      pulseInterval = setInterval(updateTime, 60000);
    }
    document.getElementById('updated').innerHTML = fc.getDuration(delta, true);
  }
  
  // Tipsy tooltip callback
  function tipCb() {
    var thread = catalog.threads[this.getAttribute('data-id')];
    
    return fc.getTip(
      (thread.author ? thread.author : catalog.anon),
      thread.date,
      (!options.extended ? thread.teaser : null)
    );
  }
  
  if (opts) {
    $.extend(options, defaults, opts);
  }
  else {
    options = defaults;
  }
  
  bindGlobalShortcuts();
  
  fc.loadSettings();
  fc.loadTheme();
  fc.loadFilters();
  
  fc.setSize(options.thsize, true);
  fc.setOrder(options.orderby, true);
  fc.setExtended(options.extended, true);
};

$.fourcat.prototype.getTip = function(author, date, teaser) {
  var tip = 'Posted by <em>' + author + '</em> ';
  
  tip += this.getDuration((new Date().getTime() / 1000) - date) + ' ago';
  
  if (teaser) {
    tip += '<br />' + teaser;
  }
  
  return tip;
};

$.fourcat.prototype.getDuration = function(delta, precise) {
  var count;
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
      return count + ' hours';
    }
    else {
      return 'one hour';
    }
  }
  count = 0 | (delta / 86400);
  if (count > 1) {
    return count + ' days';
  }
  else {
    return 'one day';
  }
};

/*!
tipsy tooltips
(c) 2008-2010 jason frame [jason@onehackoranother.com]
released under the MIT license
*/
(function($) {
  
  function maybeCall(thing, ctx) {
    return (typeof thing == 'function') ? (thing.call(ctx)) : thing;
  };
  
  function Tipsy(element, options) {
    this.$element = $(element);
    this.options = options;
    this.enabled = true;
  };
  
  Tipsy.prototype = {
    show: function() {
      var title = this.getTitle();
      if (title && this.enabled) {
        var $tip = this.tip();
        
        $tip.find('.tipsy-inner')[this.options.html ? 'html' : 'text'](title);
        $tip[0].className = 'tipsy'; // reset classname in case of dynamic gravity
        $tip.remove()
          .css({top: 0, left: 0, visibility: 'hidden', display: 'block'})
          .prependTo(document.body);
        
        var pos = {
          top: this.$element[0].offsetTop
            + ((this.$element[0].offsetParent === null)
              ? 0 : this.$element[0].offsetParent.offsetTop),
          left: this.$element[0].offsetLeft
            + ((this.$element[0].offsetParent === null)
              ? 0 : this.$element[0].offsetParent.offsetLeft),
          width: this.$element[0].offsetWidth,
          height: this.$element[0].offsetHeight
        };
        
        var actualWidth = $tip[0].offsetWidth,
          actualHeight = $tip[0].offsetHeight,
          gravity = maybeCall(this.options.gravity, this.$element[0]);
        
        var tp;
        switch (gravity.charAt(0)) {
          case 'n':
            tp = {
              top: pos.top + pos.height + this.options.offset,
              left: pos.left + pos.width / 2 - actualWidth / 2
            };
            break;
          case 's':
            tp = {
              top: pos.top - actualHeight - this.options.offset,
              left: pos.left + pos.width / 2 - actualWidth / 2
            };
            break;
          case 'e':
            tp = {
              top: pos.top + pos.height / 2 - actualHeight / 2,
              left: pos.left - actualWidth - this.options.offset
            };
            break;
          case 'w':
            tp = {
              top: pos.top + pos.height / 2 - actualHeight / 2,
              left: pos.left + pos.width + this.options.offset
            };
            break;
        }
        
        if (tp.top <= 0) {
          return;
        }
        
        if (gravity.length == 2) {
          if (gravity.charAt(1) == 'w') {
            tp.left = pos.left + pos.width / 2 - 15;
          } else {
            tp.left = pos.left + pos.width / 2 - actualWidth + 15;
          }
        }
        
        $tip.css(tp).addClass('tipsy-' + gravity);
        $tip.find('.tipsy-arrow')[0].className = 'tipsy-arrow tipsy-arrow-' + gravity.charAt(0);
        if (this.options.className) {
          $tip.addClass(maybeCall(this.options.className, this.$element[0]));
        }
        if (this.options.id) {
          $tip[0].id = this.options.id;
        }
        if (this.options.fade) {
          $tip.stop()
            .css({opacity: 0, display: 'block', visibility: 'visible'})
            .animate({opacity: this.options.opacity});
        } else {
          $tip.css({visibility: 'visible', opacity: this.options.opacity});
        }
      }
    },
    
    hide: function() {
      if (this.options.fade) {
        this.tip().stop().fadeOut(function() { $(this).remove(); });
      } else {
        this.tip().remove();
      }
    },
    
    getTitle: function() {
      var title, $e = this.$element, o = this.options;
      var title, o = this.options;
      if (typeof o.title == 'string') {
        title = $e[0].getAttribute(o.title);
      } else if (typeof o.title == 'function') {
        title = o.title.call($e[0]);
      }
      return title || o.fallback;
    },
    
    tip: function() {
      if (!this.$tip) {
        this.$tip = document.createElement('div');
        this.$tip.setAttribute('class', 'tipsy');
        this.$tip.innerHTML = '<div class="tipsy-arrow"></div><div class="tipsy-inner"></div>';
        this.$tip = $(this.$tip);
      }
      return this.$tip;
    },
    
    validate: function() {
      if (!this.$element[0].parentNode) {
        this.hide();
        this.$element = null;
        this.options = null;
      }
    },
    
    enable: function() { this.enabled = true; },
    disable: function() { this.enabled = false; },
    toggleEnabled: function() { this.enabled = !this.enabled; }
  };
  
  $.fn.tipsy = function(options) {
    
    if (options === true) {
      return this.data('tipsy');
    } else if (typeof options == 'string') {
      var tipsy = this.data('tipsy');
      if (tipsy) tipsy[options]();
      return this;
    }
    
    options = $.extend({}, $.fn.tipsy.defaults, options);
    
    function get(ele) {
      var tipsy = $.data(ele, 'tipsy');
      if (!tipsy) {
        tipsy = new Tipsy(ele, $.fn.tipsy.elementOptions(ele, options));
        $.data(ele, 'tipsy', tipsy);
      }
      return tipsy;
    }
    
    function enter() {
      var tipsy = get(this);
      tipsy.hoverState = 'in';
      if (options.delayIn == 0) {
        tipsy.show();
      } else {
        //tipsy.fixTitle();
        setTimeout(
          function() { if (tipsy.hoverState == 'in') tipsy.show(); },
          options.delayIn
        );
      }
    };
    
    function leave() {
      var tipsy = get(this);
      tipsy.hoverState = 'out';
      if (options.delayOut == 0) {
        tipsy.hide();
      } else {
        setTimeout(
          function() { if (tipsy.hoverState == 'out') tipsy.hide(); },
          options.delayOut
        );
      }
    };
    
    this.each(function() { get(this); });
    
    if (options.trigger != 'manual') {
      var
        eventIn  = options.trigger == 'hover' ? 'mouseenter.tipsy' : 'focus',
        eventOut = options.trigger == 'hover' ? 'mouseleave.tipsy' : 'blur';
      this.on(eventIn, enter).on(eventOut, leave);
    }
    
    return this;
    
  };
  
  $.fn.tipsy.defaults = {
    id: null,
    className: null,
    delayIn: 250,
    delayOut: 0,
    fade: false,
    fallback: '',
    gravity: 's',
    html: false,
    offset: 0,
    opacity: 1.0,
    title: 'data-tip',
    trigger: 'hover'
  };
  
  $.fn.tipsy.elementOptions = function(ele, options) {
    return $.metadata ? $.extend({}, options, $(ele).metadata()) : options;
  };
  
  $.fn.tipsy.autoNS = function() {
    return $(this).offset().top > ($(document).scrollTop() + $(window).height() / 2) ? 's' : 'n';
  };
  
  $.fn.tipsy.autoWE = function() {
    return $(this).offset().left > ($(document).scrollLeft() + $(window).width() / 2) ? 'e' : 'w';
  };

   $.fn.tipsy.autoBounds = function(margin, prefer) {
    return function() {
      var dir = {ns: prefer[0], ew: (prefer.length > 1 ? prefer[1] : false)},
        boundTop = $(document).scrollTop() + margin,
        boundLeft = $(document).scrollLeft() + margin,
        $this = $(this);

      if ($this.offset().top < boundTop) dir.ns = 'n';
      if ($this.offset().left < boundLeft) dir.ew = 'w';
      if ($(window).width() + $(document).scrollLeft() - $this.offset().left < margin) dir.ew = 'e';
      if ($(window).height() + $(document).scrollTop() - $this.offset().top < margin) dir.ns = 's';

      return dir.ns + (dir.ew ? dir.ew : '');
    }
  };
  
})(jQuery);

/*!
 * Cookie plugin
 * Copyright (c) 2006 Klaus Hartl (stilbuero.de)
 * Dual licensed under the MIT and GPL licenses
 */

jQuery.cookie = function(name, value, options) {
  if (typeof value != 'undefined') { // name and value given, set cookie
    options = options || {};
    if (value === null) {
      value = '';
      options.expires = -1;
    }
    var expires = '';
    if (options.expires && (typeof options.expires == 'number' || options.expires.toUTCString)) {
      var date;
      if (typeof options.expires == 'number') {
          date = new Date();
          date.setTime(date.getTime() + (options.expires * 24 * 60 * 60 * 1000));
      } else {
          date = options.expires;
      }
      expires = '; expires=' + date.toUTCString(); // use expires attribute, max-age is not supported by IE
    }
    // CAUTION: Needed to parenthesize options.path and options.domain
    // in the following expressions, otherwise they evaluate to undefined
    // in the packed version for some reason...
    var path = options.path ? '; path=' + (options.path) : '';
    var domain = options.domain ? '; domain=' + (options.domain) : '';
    var secure = options.secure ? '; secure' : '';
    document.cookie = [name, '=', encodeURIComponent(value), expires, path, domain, secure].join('');
  } else { // only name given, get cookie
    var cookieValue = null;
    if (document.cookie && document.cookie != '') {
      var cookies = document.cookie.split(';');
      for (var i = 0; i < cookies.length; i++) {
        var cookie = jQuery.trim(cookies[i]);
        // Does this cookie string begin with the name we want?
        if (cookie.substring(0, name.length + 1) == (name + '=')) {
          cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
          break;
        }
      }
    }
    return cookieValue;
  }
};
