/* Copyright (c) 2010 Mateusz Armatys
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to
 * deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
 * sell copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
 * IN THE SOFTWARE.
 */

(function() {

globalThis = this;

var DeliciousAPI = function(params) {
    if (this === globalThis) throw 'Use "new" operator to create a DeliciousAPI object.';
    params = params || {};
    
    this.maxTries = params.maxTries || 3;
    this.timeBetween = params.timeBetween || 1000; //[milliseconds]
    
    /* private */
    this.baseHost = "http://feeds.delicious.com/v2/json/";
    this.queue = [];
    this.busy = false; //'true' when downloading from delicious
    this.lastApiCall = 0; //last successful API call to delicious
}

/** Performs a JSONP request with given parameters:
 * {String} params.url path to JSONP resource
 * {Object} params.data object with request data
 * {Function} params.callback function to call after successful download
 * {Function} params.failed function to call after error or timeout
 * {String} params.name name of a parameter, that remote server treats as a callback
 **/
DeliciousAPI.prototype.jsonp = function(params) {
	var n, buf, scriptEl, timer, url, queryConn;
	var timeout = 30000;
	var that = this;
	var uid = 'dapi_jsonp_' + new Date().getTime();
	
	if (/\?/.test(params.url)) {
		queryConn = '&';
	} else {
		queryConn = '?';
	}
	
	url = params.url + queryConn + (params.name || 'jsonp') + '=' + uid;
	
	!params.cache && (url += '&unique=' + new Date().getTime());
	
	if (params.data) {
		for (n in params.data) {
			if (!params.data[n]) continue;
			buf = '&' + n + '=' + params.data[n];
			url += encodeURI(buf);
		}
	}
	
	/* set callback if specified */
	if (params.callback) {
		window[uid] = function(data) {
			delete window[uid];
			clearTimeout(timer);
			params.callback(data);
			
			setTimeout(function() {
				scriptEl.parentNode.removeChild(scriptEl);
			}, 1);
		};
	}
	
	timer = setTimeout(function() {
		delete window[uid];
		document.body.removeChild(scriptEl);
		if (params.failed) params.failed();
	}, timeout);
	
	scriptEl = this.createJS(url);
	document.body.appendChild(scriptEl);
}

/* Creates a new SCRIPT element
 * @param {String} path path to JavaScript resource
 * @return {Element} a SCRIPT Element
 **/
DeliciousAPI.prototype.createJS = function(path) {
	var el = document.createElement('SCRIPT');
	el.setAttribute('type', 'text/javascript');
	el.setAttribute('async', 'async');
	el.setAttribute('src', path);
	return el;
}

/**
 * Processes <code>this.requestQueue</code>.
 * This method is called automatically, but it can be called at arbitrary times.
 **/
DeliciousAPI.prototype.processQueue = function() {
    if (this.busy) return;
    
    //check the time of a last call
    var now = (new Date()).getTime();
    var delta = now - this.lastApiCall;
    var that = this;
    
    if (delta < this.timeBetween) {
        setTimeout(function() {
            that.processQueue();
        }, this.timeBetween - delta);
        return;
    }
    
    this.busy = true;
    var query = this.queue.shift();
    var that = this;
    
    if (! query) return;
    
    this.jsonp({
    	url: query.url,
    	name: 'callback',
    	callback: function(data) {
            that.lastApiCall = (new Date()).getTime();
            query.callback(data, '200 OK');
            that.busy = false;
            that.processQueue();
        },
        failed: function() {
            console.error("Error while downloading data.");
            that.queue.push(query);
            query.callback(null, 'Could not download JSONP resource.');
            that.processQueue();
        }
    });
}

/**
 * Fetches bookmarks according to parameters:
 * max - maximum number of downloaded bookmarks (can be used with all other params but 'url' and 'hash')
 *
 * url - get bookmarks with this URL (only as a single param)
 * hash - get bookmarks with this md5 hash (only as a single param)
 *
 * user - get bookmarks of user (can be used with 'tag' param)
 *
 * tag - get bookmarks tagged with 'tag' (can be used with 'user' or 'popular')
 * popular - only popular bookmarks
 *
 * callback - function that is called after data was received 'callback(deliciousData)'
 *          deliciousData is a list of objects
 **/
DeliciousAPI.prototype.bookmarks = function(params) {
    params.max = params.max || 50;
    
    if (params.url) {
        params.hash = hex_md5(params.url);
        this.bookmarks_for_hash(params);
    } else if (params.hash) {
        this.bookmarks_for_hash(params);
    } else if (params.user) {
        this.bookmarks_for_user(params);
    } else if (params.tag) {
        this.bookmarks_for_tag(params);
    } else {
        throw("Invalid or incomplete parameters (bookmarks).");
    }
    
    this.processQueue();
}

/**
 * Fetches tags according to parameters:
 *
 * user - get tags of user
 * tag - get tags, that are related to 'tag' (can be used only with 'user' param)
 *
 * callback - function called after data was received
 **/
DeliciousAPI.prototype.tags = function(params) {
    if (params.user) {
        if (params.tag) {
            this.related_tags_for_user(params);
        } else {
            this.tags_for_user(params);
        }
    } else {
        throw("Invalid or incomplete parameters (tags).");
    }
    
    this.processQueue();
}

DeliciousAPI.prototype.info = function(params) {
    if (params.url) {
        params.hash = hex_md5(params.url);
        this.urlhash_info(params);
    } else if (params.hash) {
        this.urlhash_info(params);
    } else {
        throw("Invalid or incomplete parameters (info).");
    }
    
    this.processQueue();
}


/*** ======= ***/
/*** PRIVATE ***/

/**
 * Fetches data about given website.
 **/
DeliciousAPI.prototype.urlhash_info = function(params) {
    if (params.hash.length !== 32) {
        console.error("Invalid URL hash.");
        return;
    }
    
    var url = this.baseHost + "urlinfo/" + params.hash;
    this.queue.push({url:url, callback:params.callback});
}

/**
 * Fetches bookmarks for given resource, represented as md5 hash string
 **/
DeliciousAPI.prototype.bookmarks_for_hash = function(params) {
    if (params.hash.length !== 32) {
        console.error("Invalid URL hash.");
        return;
    }
    
    var url = this.baseHost + "url/" + params.hash + "?count=" + params.max;
    this.queue.push({url:url, callback:params.callback});
}

/**
 * Fetches bookmarks of user <code>params.user</code>.
 **/
DeliciousAPI.prototype.bookmarks_for_user = function(params) {
    if (params.user.length <= 0) {
        console.error("Username is empty.");
        return;
    }
    
    var url = this.baseHost + params.user;
    if (params.tag) {
        url += "/" + params.tag;
    }
    
    url += "?count=" + params.max;
    this.queue.push({url:url, callback:params.callback});
}

/**
 * Fetches bookmarks tagged with <code>params.tag</code>.
 **/
DeliciousAPI.prototype.bookmarks_for_tag = function(params) {
    if (params.tag.length <= 0) {
        console.error("Tag is empty.");
        return;
    }
    
    var url = this.baseHost;
    if (params.popular) {
        url += "popular/";
    } else {
        url += "tag/";
    }
    
    url += params.tag + "?count=" + params.max;
    this.queue.push({url:url, callback:params.callback});
}

/**
 * Fetches all public tags of user <code>params.user</code>.
 **/
DeliciousAPI.prototype.tags_for_user = function(params) {
    if (params.user.length <= 0) {
        console.error("Username is empty.");
        return;
    }
    
    var url = this.baseHost + "tags/" + params.user;
    this.queue.push({url:url, callback:params.callback});
}

/**
 * Fetches all public tags of user <code>params.user</code>, that are related to <code>params.tag</code>.
 **/
DeliciousAPI.prototype.related_tags_for_user = function(params) {
    if (params.user.length <= 0 || params.tag.length <= 0) {
        console.error("Username or tag is empty.");
        return;
    }
    
    var url = this.baseHost + "tags/" + user + "/" + params.tag;
    this.queue.push({url:url, callback:params.callback});
}

globalThis.DeliciousAPI = DeliciousAPI;

})();
