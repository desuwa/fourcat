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
      ['#E0B0FF', '#F2F3F4', '#7DF9FF', '#722F37'],
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
    top: 0
  },
  
  baseTheme = {
    0: '8C92AC',
    1: '555555',
    2: 'FFA500',
    3: '000000',
    4: 'FFFFFF',
    5: '000000',
    bg: '', r: '', f: '',
    h: '', v: '',
    notipsy: false, magnify: false, altKey: false
  },
  
  activeTheme = {},
  
  activeFilters = [],
  filtersChanged = false,
  
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
  hasCSSTransform = (
    document.body.style.MozTransform !== undefined ||
    document.body.style.WebkitTransform !== undefined ||
    document.body.style.OTransform !== undefined ||
    document.body.style.msTransform !== undefined
  ),
  
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
  $filterPalette = $('#filter-palette'),
  
  $('#qf-ok').click(applyQuickfilter);
  $('#qf-clear').click(toggleQuickfilter);
  
  $('#theme-ctrl').click(showThemeEditor);
  
  $('#filters-ctrl').click(showFilters);
  
  // Enterprise Grade polyfilling
  if (!Array.prototype.indexOf) {
    Array.prototype.indexOf = function () { return -1; }
  }
  
  if ('HTMLMenuItemElement' in window) {
    $('#ctxmenu-main')
      .html(
        '<menuitem label="Show hidden threads" id="ctxitem-unhide"></menuitem>'
        + '<menuitem label="Unpin threads" id="ctxitem-unpin"></menuitem>'
      );
    $('#ctxitem-unhide').click(clearHiddenThreads);
    $('#ctxitem-unpin').click(clearPinnedThreads);
  }
  
  $(window).resize(centerThreads);
  
  this.loadCatalog = function(c) {
    catalog = c;
    updateTime();
    $refresh[0].title =
      $refresh.attr('data-title') + ' ' + fc.getDuration(catalog.delay, true);
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
      $('#qf-box').unbind('keyup').unbind('keydown');
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
            if (!pinnedThreads[catalog.slug]) {
              pinnedThreads[catalog.slug] = {};
            }
            var tid = el.getAttribute('data-id');
            if (pinnedThreads[catalog.slug][tid] >= 0) {
              delete pinnedThreads[catalog.slug][tid];
            }
            else {
              pinnedThreads[catalog.slug][tid] = catalog.threads[tid].r || 0;
            }
            sessionStorage.setItem('pin', JSON.stringify(pinnedThreads));
            fc.buildThreads();
            if (e.preventDefault) e.preventDefault();
            else e.returnValue = false;
          }
          else if (e.shiftKey) {
            if (!hiddenThreads[catalog.slug]) {
              hiddenThreads[catalog.slug] = {};
            }
            hiddenThreads[catalog.slug][el.getAttribute('data-id')] = true;
            sessionStorage.setItem('hide', JSON.stringify(hiddenThreads));
            el.parentNode.parentNode.style.display = 'none';
            ++hiddenThreadsCount;
            $hiddenCount.html(hiddenThreadsCount)
            $hiddenLabel.show();
            if (e.preventDefault) e.preventDefault();
            else e.returnValue = false;
          }
        }
      };
    }
  }
  
  function clearHiddenThreads() {
    hiddenThreads[catalog.slug] = {};
    sessionStorage.setItem('hide', JSON.stringify(hiddenThreads));
    if (hiddenThreadsCount > 0) {
      fc.buildThreads();
    }
  }
  
  function clearPinnedThreads() {
    pinnedThreads[catalog.slug] = {};
    sessionStorage.setItem('pin', JSON.stringify(pinnedThreads));
    fc.buildThreads();
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
      $el.html('&#x2714;');
    }
  }
  
  function disableButton($el) {
    $el.removeClass('active');
    if ($el.hasClass('clickbox')) {
      $el.html('');
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
      $thread = $this.closest('.thread');
    
    $this.clone().insertAfter($this);
    
    $this.addClass('scaled');
    
    var
      center = this.offsetWidth / 2,
      offset = $thread[0].offsetWidth / 2 - center;
    
    if (!activeTheme.notipsy) {
      $this.data('tipsy').options.offset = center * 0.8;
    }
    
    this.style.marginLeft = offset + 'px';
  }
  
  function onThumbMouseOut() {
    var $this = $(this);
    $this.next().remove();
    
    if (!activeTheme.notipsy) {
      $this.data('tipsy').options.offset = 0;
    }
    
    $this.removeClass('scaled');
    this.style.marginLeft = '';
  }
  
  // Bound to window.onresize
  function centerThreads() {
    if (!$thumbs) return;
    
    var
      thumbswidth = $thumbs.closest('.thread').outerWidth(true),
      threadswidth = $threads[0].offsetWidth,
      rowsize = (0 | (threadswidth / thumbswidth)) * thumbswidth,
      pad = (threadswidth - rowsize) / 2;
    
    $threads[0].style.paddingLeft = pad + 'px';
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
            $(document.createElement('span')).attr('class', 'colorsample')
            .css('background-color', options.filterColors[i][j])
            .click(selectFilterColor)
          )
        );
      }
      $palette.append($row);
    }
  }
  
  function showFilterPalette(e) {
    var
      $this = $(this),
      pos = $this.position();
    
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
      
      $('#filters-clear-hidden').bind('click', function() {
        clearHiddenThreads();
        $('#filters-msg')
          .html('Done')
          .attr('class', 'msg-ok')
          .show().delay(2000)
          .fadeOut(500);
        return false;
      });
      var rawFilters = localStorage.getItem('filters');
      if (rawFilters) {
        rawFilters = $.parseJSON(rawFilters);
        for (var i in rawFilters) {
          $filterList.append(buildFilter(rawFilters[i]));
        }
      }
      $filtersPanel.show();
      filtersChanged = false;
    }
  }
  
  function closeFilters() {
    $('#filters-close').unbind('click');
    $('#filters-add').unbind('click');
    $('#filters-save').unbind('click');
    $('#filter-palette-close').unbind('click');
    $('#filter-palette-clear').unbind('click');
    $('#filters-help-open').unbind('click');
    $('#filters-help-close').unbind('click');
    $('#filters-clear-hidden').unbind('click');
    
    $('#filters-msg').hide();
    $filtersPanel.hide();
    $filterList.children('tr').remove();
  }
  
  // Loads patterns from the localStorage and builds regexps
  fc.loadFilters = function() {
    if (!hasWebStorage) return;
    
    activeFilters = [];
    
    var rawFilters = localStorage.getItem('filters');
    if (!rawFilters) return;
    
    rawFilters = $.parseJSON(rawFilters);
    
    var
      wordSep = options.filterFullWords ? '\\b' : '',
      orJoin = wordSep + '|' + wordSep,
      regexType = /^\/(.*)\/(i?)$/,
      regexOrNorm = /\s*\|+\s*/g,
      regexWc = /\\\*/g,
      regexEscape = getRegexSpecials(),
      match, inner, words, rawPattern, pattern, orOp, orCluster, type;
    
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
                  inner = orCluster.join(orJoin).replace(regexWc, '.*');
                  pattern += ('(?=.*(' + wordSep + inner + wordSep + '))');
                }
                else {
                  inner = words[w].replace(regexEscape, '\\$1').replace(regexWc, '.*');
                  pattern += ('(?=.*' + wordSep + inner + wordSep + ')');
                }
              }
              pattern = '^' + pattern + '.*$';
              pattern = new RegExp(pattern, 'i');
            }
          }
          //console.log('Resulting regex: ' + pattern);
          activeFilters.push( {
              type: type,
              pattern: pattern,
              fid: fid,
              hidden: rawFilters[fid].hidden,
              color: rawFilters[fid].color,
              bright: rawFilters[fid].bright,
              top: rawFilters[fid].top
            }
          );
        }
      }
    }
    catch (err) {
      alert('There was an error processing one of the filters: ' + err);
    }
  }
  
  function saveFilters() {
    var rawFilters = {};
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
    var $msg = $('#filters-msg');
    if (filtersChanged) {
      filtersChanged = false;
      $msg.html('Filters saved')
        .attr('class', 'msg-ok').show().delay(2000).fadeOut(500);
      fc.loadFilters();
      fc.buildThreads();
    }
    else {
      $msg.html('No changes')
        .attr('class', 'msg-error').show().delay(2000).fadeOut(500);
    }
  }
  
  function filterSetCustomColor() {
    var $this = $(this);
    if ($this.val().search(/^[A-F0-9]{6}$/i) != -1) {
      $filterRgbOk.css('background-color', '#' + $this.val());
    }
  }
  
  function closeFilterPalette() {
    $filterPalette.hide();
  }
  
  function buildFilter(filter) {
    var $td, $span, $tr, $tmp, id;
    filter = $.extend({}, baseFilter, filter);
    $tmp = $filterList.children('tr');
    if ($tmp.length == 0) {
      id = 0;
    }
    else {
      id = parseInt($tmp.last().attr('id').split('-')[1]) + 1;
    }
    $tr = $(document.createElement('tr')).attr('id', 'filter-' + id);
    
    $td = $(document.createElement('td'));
    $span = $(document.createElement('span'))
      .attr({'data-active': filter.active, 'class': 'clickbox'})
      .click({type: 'active'}, toggleFilter);
      if (filter.active) $span.addClass('active').html('&#x2714;');
    $td.html($span);
    $tr.append($td);
    
    $td = $(document.createElement('td'))
      .html($(document.createElement('input'))
        .attr({'type': 'text', 'value': filter.pattern})
        .change(onFilterChanged)
      );
    $tr.append($td);
    
    $td = $(document.createElement('td'));
    $span = $(document.createElement('span'))
      .attr({'class': 'colorsample', 'id': 'filter-color-' + id})
      .click({fid: id}, showFilterPalette);
    if (filter.color == '') {
      $span.attr('data-nocolor', '1')
        .html('&#x2215;')
        .css('background-color', '#555')
    }
    else {
      $span.css('background-color', filter.color)
    }
    $td.html($span);
    $tr.append($td);
    
    $td = $(document.createElement('td'));
    $span = $(document.createElement('span'))
      .attr({'data-hide': filter.hidden, 'class': 'clickbox filter-hide'})
      .click({type: 'hide', xor: 'top'}, toggleFilter);
      if (filter.hidden) $span.addClass('active').html('&#x2714;');
    $td.html($span);
    $tr.append($td);
    
    $td = $(document.createElement('td'));
    $span = $(document.createElement('span'))
      .attr({'data-top': filter.top, 'class': 'clickbox filter-top'})
      .click({type: 'top', xor: 'hide'}, toggleFilter);
      if (filter.top) $span.addClass('active').html('&#x2714;');
    $td.html($span);
    $tr.append($td);
    
    $td = $(document.createElement('td'))
      .html($(document.createElement('span'))
        .attr({'data-target': id, 'class': 'clickbox'})
        .html('&#x2716;')
        .click(deleteFilter)
      );
    $tr.append($td);
    
    return $tr;
  }
  
  function onFilterChanged() {
    if (!filtersChanged) filtersChanged = true;
  }
  
  function selectFilterColor(clear) {
    var $target = $('#filter-color-' + $filterPalette.attr('data-target'));
    if (clear === true) {
      $target.attr('data-nocolor', '1')
        .html('&#x2215;')
        .css('background-color', '#555');
    }
    else {
      $target.removeAttr('data-nocolor')
        .html('').css('background-color', $(this).css('background-color'));
    }
    onFilterChanged();
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
    $filterList.append(buildFilter);
    onFilterChanged();
  }
  
  function deleteFilter() {
    $('#filter-' + $(this).attr('data-target')).remove();
    onFilterChanged();
  }
  
  function toggleFilter(e) {
    var
      $this = $(this),
      attr = 'data-' + e.data.type;
    
    if ($this.attr(attr) == '0') {
      $this.attr(attr, '1').addClass('active').html('&#x2714;');
      if (e.data.xor) {
        $sel = $this.parent().parent().find('.filter-' + e.data.xor)
          .attr('data-'  + e.data.xor, '0').removeClass('active').html('');
      }
    }
    else {
      $this.attr(attr, '0').removeClass('active').html('');
      if (e.data.xor) {
        $sel = $this.parent().parent().children('.filter-' + e.data.xor)
          .attr('data-' + e.data.xor, '1').addClass('active').html('&#x2714;');
      }
    }
    onFilterChanged();
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
      var customTheme = localStorage.getItem('theme');
      
      if (customTheme) {
        customTheme = JSON.parse(customTheme);
      }
      
      editTheme(customTheme);
      
      $('#theme-save').click(saveTheme);
      $('#theme-clear').click(resetTheme);
      $('#theme-close').click(closeThemeEditor);
      
      $('#theme-bg').find('.radio').click(toggleRadio);
      $('#theme-bg-f, #theme-notipsy, #theme-magnify, #theme-altKey')
        .click(function() { toggleButton($(this)) });
      $('#theme-bg-clear').click(function() { $('#theme-bg-url').val('') });
      
      $('#theme-msg').hide();
      $themePanel.show();
    }
  }
  
  function editTheme(customTheme) {
    var theme, val, radioset, btn,
      buttons = ['notipsy', 'magnify', 'altKey'];
    
    theme = $.extend({}, baseTheme, customTheme);
    
    for (var i = buttons.length - 1; i >= 0; i--) {
      if (theme[buttons[i]]) {
        enableButton($('#theme-' + buttons[i]));
      }
      else {
        disableButton($('#theme-' + buttons[i]));
      }
    }
    
    for (var i = 0; i < 6; ++i) {
      val = theme[i];
      $('#theme-color-' + i)[0].value = val;
    }
    
    $('#theme-bg').find('.radioset').each(function() {
      radioset = this.getAttribute('data-radio');
      $(this).children('.radio').each(function() {
        if (theme[radioset] == this.getAttribute('data-opt')) {
          $(this).addClass('active');
        }
        else {
          $(this).removeClass('active');
        }
      });
    });
    
    var $fixed = $('#theme-bg-f');
    if (theme.f) {
      $fixed.addClass('active');
    }
    else {
      $fixed.removeClass('active');
    }
    
    $('#theme-bg-url')[0].value = theme.bg ? theme.bg : '';
  }
  
  function closeThemeEditor() {
    $('#theme-save').unbind('click');
    $('#theme-clear').unbind('click');
    $('#theme-close').unbind('click');
    
    $('#theme-bg').find('.radio').unbind('click');
    $('#theme-bg-f, #theme-notipsy, #theme-magnify, #theme-bg-clear, #theme-altKey')
      .unbind('click');
    $themePanel.hide();
  }
  
  fc.loadTheme = function() {
    if (!hasWebStorage) return;
    
    var customTheme = localStorage.getItem('theme');
    
    if (!customTheme) return;
    
    activeTheme = $.parseJSON(customTheme);
    applyTheme(activeTheme);
  }
  
  function applyTheme(customTheme, save) {
    var btn, css = '', bg = [], color, style, dummy;
      
    if (customTheme.notipsy) {
      if (customTheme.notipsy != activeTheme.notipsy) {
        $thumbs
          .unbind('mouseenter.tipsy')
          .unbind('mouseleave.tipsy');
      }
    }
    else {
      if (activeTheme.notipsy != customTheme.notipsy) {
        $thumbs.tipsy(tipopts);
      }
    }
    
    if (customTheme.magnify) {
      if (activeTheme.magnify != customTheme.magnify
          && options.thsize == 'small' && hasCSSTransform) {
        $thumbs
          .bind('mouseenter.scale', onThumbMouseIn)
          .bind('mouseleave.scale', onThumbMouseOut);
      }
    }
    else {
      if (activeTheme.magnify != customTheme.magnify && hasCSSTransform) {
        $thumbs
          .unbind('mouseenter.scale')
          .unbind('mouseleave.scale');
      }
    }
    
    function checkColor(id) {
      var c = customTheme[id];
      if (!c) {
        delete customTheme[id];
        return false;
      }
      if (c.length == 3) {
        c = c + c;
      }
      if (!c.match(/^[0-9a-f]{6}$/i)) {
        delete customTheme[id];
        return false;
      }
      return '#' + customTheme[id] + '!important;}';
    }
    
    if (color = checkColor(0)) {
      css += 'body,.panel{background-color:' + color;
    }
    if (color = checkColor(1)) {
      css += '.button,.clickbox{background-color:' + color;
      css += '.panel,.thumb{border-color:' + color;
    }
    if (color = checkColor(2)) {
      css += '.button:hover,.active{background-color:' + color;
      css += '.thumb:hover{border-color:' + color;
    }
    if (color = checkColor(3)) {
      css += 'body{color:' + color;
      css += 'hr{border-color:' + color;
    }
    if (color = checkColor(4)) {
      css += 'a,.button,.clickbox{color:' + color;
    }
    if (color = checkColor(5)) {
      css += 'a:hover,.button:hover,.clickbox:hover,.active{color:' + color;
    }
    
    if (customTheme.bg) {
      bg.push('url("' + customTheme.bg + '")');
      if (customTheme.r) {
        bg.push(customTheme.r);
      }
      if (customTheme.h) {
        bg.push(customTheme.h);
      }
      else {
        bg.push('left');
      }
      if (customTheme.v) {
        bg.push(customTheme.v);
      }
      else {
        bg.push('top');
      }
      if (customTheme.f) {
        bg.push(customTheme.f);
      }
      dummy = document.createElement('div')
      dummy.style.background = bg.join(' ');
      css += 'body{background:' + dummy.style.background + ';}';
    }
    
    style = document.getElementById('custom-style');
    if (style) {
      (document.head || document.getElementsByTagName('head')[0]).removeChild(style);
    }
    
    if (css != '') {
      style = document.createElement('style');
      style.setAttribute('type', 'text/css');
      style.setAttribute('id', 'custom-style');
      
      if (style.styleSheet) {
        style.styleSheet.cssText = css;
      }
      else {
        style.innerHTML = css;
      }
      
      (document.head || document.getElementsByTagName('head')[0]).appendChild(style);
    }
    
    if (save === true) {
      localStorage.removeItem('theme');
      
      for (var i in customTheme) {
        localStorage.setItem('theme', JSON.stringify(customTheme));
        break;
      }
      
      activeTheme = customTheme;
    }
  }
  
  // Applies and saves the theme to localStorage
  function saveTheme() {
    var val, style, rebuild, customTheme = {};
    
    if ($('#theme-notipsy').hasClass('active')) {
      customTheme.notipsy = true;
    }
    
    if ($('#theme-magnify').hasClass('active')) {
      customTheme.magnify = true;
    }
    
    if ($('#theme-altKey').hasClass('active')) {
      customTheme.altKey = true;
    }
    
    var clrVal = function(id) {
      return $('#theme-color-' + id)[0].value.toUpperCase();
    };
    
    val = clrVal(0);
    if (val != baseTheme[0]) {
      customTheme[0] = val;
    }
    
    val = clrVal(1);
    if (val != baseTheme[1]) {
      customTheme[1] = val;
      customTheme[2] = clrVal(2);
    }
    else {
      val = clrVal(2);
      if (val != baseTheme[2]) {
        customTheme[2] = val;
      }
    }
    
    val = clrVal(3);
    if (val != baseTheme[3]) {
      customTheme[3] = val;
    }
    
    val = clrVal(4);
    if (val != baseTheme[4]) {
      customTheme[4] = val;
      customTheme[5] = clrVal(5);
    }
    else {
      val = clrVal(5);
      if (val != baseTheme[5]) {
        customTheme[5] = val;
      }
    }
    
    if ((val = document.getElementById('theme-bg-url').value) != '') {
      customTheme.bg = val;
      
      $('#theme-bg').find('.radioset').each(function() {
        if (val = $(this).children('.active')[0]) {
          customTheme[this.getAttribute('data-radio')] = val.getAttribute('data-opt');
        }
      });
      
      if ($('#theme-bg-f').hasClass('active')) {
        customTheme.f = 'fixed';
      }
    }
    
    applyTheme(customTheme, true);
    
    $('#theme-msg')
      .html('Theme saved')
      .attr('class', 'msg-ok')
      .show().delay(2000).fadeOut(500);
  }
  
  // Resets the theme without applying it
  function resetTheme() {
    editTheme(baseTheme);
    $('#theme-msg')
      .html('Default theme loaded')
      .attr('class', 'msg-ok')
      .show().delay(2000).fadeOut(500);
  }
  
  // Loads data from sessionStorage
  fc.loadSession = function() {
    if (hasWebStorage && hasNativeJSON) {
      var
        hide = sessionStorage.getItem('hide'),
        pin = sessionStorage.getItem('pin');
      
      if (hide) hiddenThreads = JSON.parse(hide);
      if (pin) pinnedThreads = JSON.parse(pin);
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
      if ($thumbs && hasCSSTransform && activeTheme.magnify) {
        $thumbs
          .bind('mouseenter.scale', onThumbMouseIn)
          .bind('mouseleave.scale', onThumbMouseOut);
      }
      options.thsize = 'small';
    }
    else {
      $sizeCtrl.html($sizeCtrl.attr('data-lbl-small'));
      cls = 'large';
      if ($thumbs && hasCSSTransform && activeTheme.magnify) {
        $thumbs
          .unbind('mouseenter.scale')
          .unbind('mouseleave.scale');
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
    if (order == 'date') {
      $orderCtrl.html($orderCtrl.attr('data-lbl-alt'));
      $('#ordered-date').show();
      $('#ordered-alt').hide();
      options.orderby = 'date';
    }
    else {
      $orderCtrl.html($orderCtrl.attr('data-lbl-date'));
      $('#ordered-date').hide();
      $('#ordered-alt').show();
      options.orderby = 'alt';
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
    fc.setOrder(options.orderby == 'date' ? 'alt' : 'date');
  });
  
  $teaserCtrl.click(function() {
    fc.setExtended(options.extended == false ? 1 : false);
  });
  
  $proxyCtrl.click(function() {
    fc.setProxy(!options.proxy);
  });
  
  fc.buildThreads = function() {
    if ($threads[0].hasChildNodes()) {
      var tip = document.getElementById('th-tip');
      if (tip) {
        document.body.removeChild(tip);
      }
      $threads.empty();
    }
    
    if (catalog.count == 0) {
      $threads.html('Empty threadlist').css('text-align', 'center');
      return;
    }
    
    var
      id, entry, thread, af, hl, onTop, pinned, provider,
      hasHidden, hasPinned, rDiff, onPage,
      filtered = 0,
      html = '',
      afLength = activeFilters.length;
    
    if (options.proxy && catalog.proxy) {
      provider = catalog.proxy;
    }
    else {
      provider = catalog.server + 'res/';
    }
    
    hasHidden = !!hiddenThreads[catalog.slug];
    hasPinned = !!pinnedThreads[catalog.slug];
    
    hiddenThreadsCount = 0;
    
    threadloop: for (var i = 0; i < catalog.count; ++i) {
      id = catalog.order[options.orderby][i];
      entry = catalog.threads[id];
      hl = onTop = pinned = false;
      if(!quickFilterPattern) {
        if (hasHidden && hiddenThreads[catalog.slug][id]) {
          ++hiddenThreadsCount;
          continue;
        }
        if (hasPinned && pinnedThreads[catalog.slug][id] >= 0) {
          pinned = onTop = true;
        }
        else {
          for (var fid = 0; fid < afLength; ++fid) {
            af = activeFilters[fid];
            if ((af.type == 0 && entry.teaser.search(af.pattern) != -1)
              || (af.type == 1 && entry.author && entry.author.search(af.pattern) != -1)) {
              if (af.hidden) {
                ++filtered;
                continue threadloop;
              }
              hl = af;
              onTop = !!af.top;
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
      
      if (hl) {
        thread += '" style="border:3px solid ' + hl.color + '!important';
      }
      else if (pinned) {
        thread += '" style="border:3px dashed #F5F5F5 !important';
      }
      thread += '" src="' + options.contentUrl
      + (entry.s ? 'images/' : (catalog.slug + '/src/'))
      + entry.file + '" data-id="' + id + '" /></a>';
      
      thread += '<div title="(R)eplies / (I)mages'
        + (onTop ? ' / (P)age' : '') + '" id="meta-' + id + '" class="meta">';
      
      if (entry.r) {
        thread += 'r:<b>' + entry.r + '</b>';
        if (pinned) {
          rDiff = entry.r - pinnedThreads[catalog.slug][id];
          thread += ' (' + (rDiff >= 0 ? ('+' + rDiff) : rDiff) + ')';
          pinnedThreads[catalog.slug][id] = entry.r;
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
    
    if (hasPinned) {
      sessionStorage.setItem('pin', JSON.stringify(pinnedThreads));
    }
    
    $thumbs = $threads.html(html).find('.thumb');
    
    if (options.thsize == 'small' && hasCSSTransform && activeTheme.magnify) {
      $thumbs
        .bind('mouseenter.scale', onThumbMouseIn)
        .bind('mouseleave.scale', onThumbMouseOut);
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
    $.extend(baseTheme, opts.baseTheme);
  }
  else {
    options = defaults;
  }
  
  buildFilterPalette();
  bindGlobalShortcuts();
  
  fc.loadSettings();
  fc.loadSession();
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
    this.fixTitle();
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
    
    fixTitle: function() {
      var $e = this.$element;
      if ($e.attr('title') || typeof($e.attr('data-original-title')) != 'string') {
        $e.attr('data-original-title', $e.attr('title') || '').removeAttr('title');
      }
    },
    
    getTitle: function() {
      var title, $e = this.$element, o = this.options;
      this.fixTitle();
      var title, o = this.options;
      if (typeof o.title == 'string') {
        title = $e.attr(o.title == 'title' ? 'data-original-title' : o.title);
      } else if (typeof o.title == 'function') {
        title = o.title.call($e[0]);
      }
      title = ('' + title).replace(/(^\s*|\s*$)/, '');
      return title || o.fallback;
    },
    
    tip: function() {
      if (!this.$tip) {
        this.$tip = $('<div class="tipsy"></div>')
          .html('<div class="tipsy-arrow"></div><div class="tipsy-inner"></div>');
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
        tipsy.fixTitle();
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
    
    if (!options.live) this.each(function() { get(this); });
    
    if (options.trigger != 'manual') {
      var binder   = options.live ? 'live' : 'bind',
        eventIn  = options.trigger == 'hover' ? 'mouseenter.tipsy' : 'focus',
        eventOut = options.trigger == 'hover' ? 'mouseleave.tipsy' : 'blur';
      this[binder](eventIn, enter)[binder](eventOut, leave);
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
    live: false,
    offset: 0,
    opacity: 1.0,
    title: 'title',
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
