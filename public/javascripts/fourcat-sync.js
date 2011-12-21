(function() {
  
  var boards = {
    'a': true, 'jp': true, 'tg': true, 'lit': true,
    'sp': true, 'g': true, 'co': true, 'm': true,
    'mu': true, 'tv': true, 'v': true
  },
  
  origins = {
    'http://board.4chan.org': true,
    'http://sys.4chan.org': true
  },
  
  methods = {
    pin: function(cmd) {
      if (isNaN(cmd.r = parseInt(cmd.r))) { throw 'Bad reply count'; }
      setThread('pin', cmd.slug, cmd.pid, cmd.r);
    },
    
    unpin: function(cmd) {
      unsetThread('pin', cmd.slug, cmd.pid);
    },
    
    hide: function(cmd) {
      setThread('hide', cmd.slug, cmd.pid, true);
    },
    
    unhide: function(cmd) {
      unsetThread('hide', cmd.slug, cmd.pid);
    }
  };
  
  function setThread(type, slug, pid, value) {
    var threads, key;
    
    if (!boards[slug]) { throw 'Bad board: ' + slug; }
    if (!(pid = parseInt(pid))) { throw 'Bad post id'; }
    
    key = type + '-' + slug;
    
    threads = getItem(key) || {};
    threads[pid] = value;
    
    setItem(key, threads);
  }
  
  function unsetThread(type, slug, pid) {
    var threads, key;
    
    if (!boards[slug]) { throw 'Bad board: ' + slug; }
    if (!(pid = parseInt(pid))) { throw 'Bad post id'; }
    
    key = type + '-' + slug;
    
    if (threads = getItem(key)) {
      delete threads[pid];
      setItem(key, threads);
    }
  }
  
  function getItem(key) {
    var item = localStorage.getItem(key);
    return item ? JSON.parse(item) : null;
  }
  
  function setItem(key, value) {
    return localStorage.setItem(key, JSON.stringify(value));
  }
  
  function getMsg(msg) {
    var commands;
    
    try {
      if (!origins[msg.origin]) {
        throw 'Bad origin: ' + msg.origin;
      }
      
      if (!Array.isArray(commands = JSON.parse(msg.data))) {
        throw 'Bad request';
      }
      
      for (var i = 0, j = commands.length; i < j; ++i) {
        if (!methods[commands[i].type]) {
          throw 'Bad method: ' + commands[i].type;
        }
        else {
          methods[commands[i].type](commands[i], msg.origin);
        }
      }
    }
    catch (e) {
      return sendMsg(msg.origin, 'error', e.message || e);
    }
  }
  
  function sendMsg(o, type, data) {
    top.postMessage(JSON.stringify({ type: type, data: data }), o);
  }
  
  window.addEventListener('message', getMsg, false);
  
})();
