### DeliciousAPI.js

A JavaScript library for interacting with delicious.com feeds API. Plays well with Delicious (maximum 1 req/s)

An md5 library is an optional dependency - you will need it if you want to get bookmarks data, based on a website's URL.


#### Example

    var dapi = new DeliciousAPI();
	
	//get bookmarks
	dapi.bookmarks({
		tag:'javascript',
		popular:true,
		max: 10,
		callback:function(deliciousDict) {
			console.log(deliciousDict);
		}
	});

For more extensive example, see _example/_ directory.
