const download = require("download-file");
const Promise = require("promise");

function async_get_file(url,options) {
    return new Promise(function (resolve, reject) {
        download(url, options, function (err) {
            if(err) 
                reject(err);        
            else
                resolve();
        });
    });
}

module.exports=async_get_file;