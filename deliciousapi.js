/* 
 * Copyright (c) 2010 Mateusz Armatys
 * http://www.sharpnose.eu/
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 *   * Redistributions of source code must retain the above copyright notice,
 *     this list of conditions and the following disclaimer.
 *   * Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution.
 *   * Neither the name of Redis nor the names of its contributors may be used
 *     to endorse or promote products derived from this software without
 *     specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */

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
    
    $.ajax({
        dataType: 'jsonp',
        error: function(XMLHttpRequest, textStatus, errorThrown) {
            console.error("Error while downloading data.");
            that.queue.push(query);
            query.callback(null, textStatus);
            that.processQueue();
        },
        success: function(data, textStatus, XMLHttpRequest) {
            that.lastApiCall = (new Date()).getTime();
            query.callback(data, textStatus);
            that.busy = false;
            that.processQueue();
        },
        url: query.url
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
