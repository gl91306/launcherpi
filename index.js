const fs = require('fs');
const https = require('https');
const http = require('http');
const os = require('os');
const { spawn } = require('child_process');
const homedir = os.homedir();
var minecraftpath = homedir + "/.minecraft";
var getversion;
var versionlist;
var getinstalledversion;
var javapath = "/opt/jdk/jdk-17.0.1+12/bin/java";
var email = "Not logged on";
var logger = document.getElementById("islog")

async function download(url, filePath) {
  process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
  const proto = !url.charAt(4).localeCompare('s') ? https : http;

  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filePath);
    let fileInfo = null;

    const request = proto.get(url, response => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
        return;
      }

      fileInfo = {
        mime: response.headers['content-type'],
        size: parseInt(response.headers['content-length'], 10),
      };
      response.pipe(file);
    });

    // The destination stream is ended by the time it's called
    file.on('finish', () => resolve(fileInfo));

    request.on('error', err => {
      console.log('request err')
      fs.unlink(filePath, () => reject(err));
    });

    file.on('error', err => {
      console.log('FILE ERROR')
      fs.unlink(filePath, () => reject(err));
    });

    request.end();
  });
}

function exist(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  } else if (fs.existsSync(dir)) {
  }
}

exist(minecraftpath)
exist(minecraftpath + '/libraries')
exist(minecraftpath + '/versions')
exist(minecraftpath + '/assets')

console.log(logger.innerHTML)
const fileName = minecraftpath + "/pilauncher_accounts.json";
const mcjson = require(fileName);
if (mcjson.accounts === undefined || mcjson.accounts === "undefined" || mcjson.accounts.length == 0) {

  logger.innerHTML = "Log in first"
  document.getElementById("launchbutton").disabled = true
} else {
  logger.innerHTML = "Logged on as "
  document.getElementById("launchbutton").disabled = false
  uuid = localStorage.getItem('currentuser')
  console.log(uuid)
  username = mcjson.accounts[uuid].username
  logger.innerHTML = logger.innerHTML + username
}

document.getElementById('myProgress').style.display = 'none';
progs = document.getElementById('myBar')
progs.style.display = 'none';

String.prototype.interpolate = function(params) {
  const names = Object.keys(params);
  const vals = Object.values(params);
  return new Function(...names, `return \`${this}\`;`)(...vals);
}

fs.readdir(minecraftpath + '/versions', function (err, files) {
  if (err) {
      return console.log('Unable to scan directory: ' + err);
  } 
  //listing all files using forEach
  console.log(files)
  versionlist = files
  for (i in files) {
    const versions = document.createElement("option");
    //console.log(i)
    const versionname = files[i];
    versions.innerHTML = versionname

    const versionselect = document.getElementById("subject");
    versionselect.appendChild(versions)
  }
  document.getElementById("subject").appendChild(document.createElement("option"))
})


var rawraw = []
var rawdata
fetch('https://launchermeta.mojang.com/mc/game/version_manifest.json', {'method': 'GET'})
.then(response => response.json())
.then(data => {
  for (i in data.versions) {
    rawraw.push(data.versions[i].id)
  }
  console.log(data)
  rawdata = data
  versionlistraw = rawraw
  console.log("afhgigfdinstalled")
  console.log(versionlistraw)
  for (i in versionlistraw) {
    //console.log(versionlist)
    const versions = document.createElement("option");
    //console.log(i)
    const versionname = versionlistraw[i];
    versions.innerHTML = versionname

    const versionselect = document.getElementById("subject");
    versionselect.appendChild(versions);
  }
})


async function launch() {
  logger.innerHTML = 'Launching...';
  exist(minecraftpath)
  exist(minecraftpath + '/libraries')
  exist(minecraftpath + '/versions')
  exist(minecraftpath + '/assets/indexes')
  exist(minecraftpath + '/assets/objects')
  selectedversionthing = document.getElementById('subject').options[document.getElementById('subject').selectedIndex].text
  exist(minecraftpath + '/versions/' + selectedversionthing)
  mcarguments = ''
  var minecraftjson
  if ((fs.existsSync(minecraftpath + '/versions/' + selectedversionthing + '/' + selectedversionthing + '.json'))) {
    
  } else {
    var myurl
    for (i in rawdata.versions) {
      if (rawdata.versions[i].id == selectedversionthing) {
        myurl = rawdata.versions[i].url
      }
    }
    await download(myurl, minecraftpath + '/versions/' + selectedversionthing + '/' + selectedversionthing + '.json')
  }
  console.log('thumbsup')
  logger.innerHTML = 'fixed empy directories';
  minecraftjson = require(minecraftpath + '/versions/' + selectedversionthing + '/' + selectedversionthing + '.json')
  mainClass = minecraftjson.mainClass
  assets = minecraftjson.assets
  libraries = minecraftjson.libraries
  var realzlibraries
  downloads = minecraftjson.downloads
  uuid = localStorage.getItem('currentuser')
  lwjglnum = "3"
  mcarguments = ''

  // Download Asset file
  logger.innerHTML = 'Downloading asset file';
  console.log(minecraftpath + '/assets/indexes/' + assets + '.json')
  if ((fs.existsSync(minecraftpath + '/assets/indexes/' + assets + '.json'))) {
    
  } else {
    await download(minecraftjson.assetIndex.url, minecraftpath + '/assets/indexes/' + assets + '.json')
    console.log('assets are readys')
    logger.innerHTML = 'Missing asset file created';
  }

  if (selectedversionthing.includes("forge")) {
    realzminecraftjson = require(minecraftpath + '/versions/' + selectedversionthing.split('-forge')[0] + '/' + selectedversionthing.split('-forge')[0] + '.json')
    realzlibraries = realzminecraftjson.libraries
    console.log("forge boi")
    console.log(selectedversionthing)
    if (parseInt(selectedversionthing.split('-forge')[0].split("1.")[1]) >= 13) {
      lwjglnum = "3"
      console.log("lwjglnumber is threee")
      mcarguments = minecraftjson.arguments.game.join(" ").interpolate({
        version_name: selectedversionthing,
        version_type: 'release',
        game_directory: minecraftpath,
        assets_root: minecraftpath + '/assets',
        assets_index_name: assets,
        auth_uuid: localStorage.getItem('currentuser'),
        auth_access_token: mcjson.accounts[uuid].accessToken,
        user_type: mcjson.accounts[uuid].type.toLowerCase(),
        auth_player_name: mcjson.accounts[uuid].username,
        user_properties: '{}',
        clientid: mcjson.accounts[uuid].clientToken,
        auth_xuid: mcjson.accounts[uuid].xuid
      });
    } else if (parseInt(selectedversionthing.split('-forge')[0].split("1.")[1]) < 13) {
      lwjglnum = "2"
      console.log("lwjglnumber is twoooo")
      mcarguments = minecraftjson.minecraftArguments.interpolate({
        version_name: selectedversionthing,
        game_directory: minecraftpath,
        assets_root: minecraftpath + '/assets',
        assets_index_name: assets,
        auth_uuid: localStorage.getItem('currentuser'),
        auth_access_token: mcjson.accounts[uuid].accessToken,
        user_type: mcjson.accounts[uuid].type.toLowerCase(),
        auth_player_name: mcjson.accounts[uuid].username,
        user_properties: '{}',
        clientid: mcjson.accounts[uuid].clientToken,
        game_assets: minecraftpath + '/assets'
      });
    }
  } else {
    if (parseInt(selectedversionthing.split("1.")[1]) >= 13) {
      lwjglnum = "3"
      console.log("lwjglnumber is threee")
      mcarguments = minecraftjson.arguments.game.join(" ").interpolate({
        version_name: selectedversionthing,
        version_type: 'release',
        game_directory: minecraftpath,
        assets_root: minecraftpath + '/assets',
        assets_index_name: assets,
        auth_uuid: localStorage.getItem('currentuser'),
        auth_access_token: mcjson.accounts[uuid].accessToken,
        user_type: mcjson.accounts[uuid].type.toLowerCase(),
        auth_player_name: mcjson.accounts[uuid].username,
        user_properties: '{}',
        clientid: mcjson.accounts[uuid].clientToken,
        version_type: 'release',
        auth_xuid: mcjson.accounts[uuid].xuid
      });
    } else if (parseInt(selectedversionthing.split("1.")[1]) < 13) {
      lwjglnum = "2"
      console.log("lwjglnumber is twoooo")
      mcarguments = minecraftjson.minecraftArguments.interpolate({
        version_name: selectedversionthing,
        game_directory: minecraftpath,
        assets_root: minecraftpath + '/assets',
        assets_index_name: assets,
        auth_uuid: localStorage.getItem('currentuser'),
        auth_access_token: mcjson.accounts[uuid].accessToken,
        user_type: mcjson.accounts[uuid].type.toLowerCase(),
        auth_player_name: mcjson.accounts[uuid].username,
        user_properties: '{}',
        clientid: mcjson.accounts[uuid].clientToken,
        version_type: 'release',
        game_assets: minecraftpath + '/assets'
      });
    }
  }
  logger.innerHTML = 'Downloading asset files';
  // Download missing asset files
  console.log('Starting Assets check')
  needDown = []
  allAssets = require(minecraftpath + '/assets/indexes/' + assets + '.json')
  for (i in allAssets.objects) {
    currentHash = allAssets.objects[i].hash
    tooChar = currentHash.substring(0, 2);
    //console.log(minecraftpath + '/assets/objects/' + tooChar + '/' + currentHash)
    if ((fs.existsSync(minecraftpath + '/assets/objects/' + tooChar + '/' + currentHash))) {
      
    } else {
      //console.log(currentKey)
      needDown.push(i)
    }
  }
  if (needDown.length > 0) {
    console.log(needDown.length)
    console.log(needDown)
    document.getElementById('myProgress').style.display = '';
    progs.style.display = ''
    progs.style.width = '0%'
    for (i in allAssets.objects) {
      currentHash = allAssets.objects[i].hash
      tooChar = currentHash.substring(0, 2);
      //console.log(minecraftpath + '/assets/objects/' + tooChar + '/' + currentHash)
      if ((fs.existsSync(minecraftpath + '/assets/objects/' + tooChar + '/' + currentHash))) {
        //console.log(fs.existsSync(minecraftpath + '/assets/objects/' + tooChar + '/' + currentHash))
      } else {
        link = 'http://resources.download.minecraft.net/' + tooChar + '/' + currentHash;
        fpath = minecraftpath + '/assets/objects/' + tooChar + '/' + currentHash;
        exist(minecraftpath + '/assets/objects/' + tooChar)
        logger.innerHTML = 'Downloading: ' + i
        myIndex = needDown.indexOf(i)
        var percent = myIndex*100 / needDown.length;
        console.log(percent)
        progs.style.width = percent.toString() + '%'
        await download(link, fpath)
      }
    }
  } else {

  }
  logger.innerHTML = 'Downloaded assets';
  console.log('assets are ready')
  document.getElementById('myProgress').style.display = 'none';
  progs.style.display = 'none'
  
  /** Start organizing launch args **/
  // Orgainize Java launch args
  args = []
  javaargsraw = "-Xmx1G -Dorg.lwjgl.util.Debug=true -Dorg.lwjgl.librarypath=/home/pi/lwjgl" + lwjglnum + "arm32 -Djava.library.path=/home/pi/lwjgl" + lwjglnum + "arm32 -Xmn128M -Dminecraft.launcher.brand=java-minecraft-launcher -Dminecraft.launcher.version=1.6.93 -Dminecraft.client.jar=" + minecraftpath + "/versions/" + selectedversionthing + "/" + selectedversionthing + ".jar"
  javaargs = javaargsraw.split(" ")
  for (i in javaargs) {
    args.push(javaargs[i])
  }
  // Organize library args
  args.push('-cp')
  javalibargsraw = []
  logger.innerHTML = 'Downloading libraries...';
  for (i in libraries) {
    //if (libraries[i].rules == undefined) {
      if (selectedversionthing.includes("forge")) {
        //javapath = "/opt/jdk/jdk1.8.0_251/jre/bin/java"
        console.log(libraries[i])
        firstpath = minecraftpath + '/libraries'
        path1 = '/' + libraries[i].name.split(":")[0].replace(/\./g,'/')
        path2 = libraries[i].name.split(":")[1]
        path3 = libraries[i].name.split(":")[2]
        console.log(path1)
        console.log(path2)
        console.log(path3)
        finalpath = path1 + '/' + path2 + '/' + path3 + '/' + path2 + '-' + path3 + '.jar'
        fullpath = firstpath + finalpath
        if (fs.existsSync(fullpath)) {
          console.log(fullpath)
          javalibargsraw.push(fullpath)
        } else if (!(fs.existsSync(fullpath))) {
          tommy = false
          mydir = fullpath.split(fullpath.split('/')[fullpath.split('/').length - 1])[0].slice(0, -1)
          if (!fs.existsSync(mydir)){
              console.log('mydir not there lmao')
              fs.mkdirSync(mydir, { recursive: true });
          }
          console.log(fullpath, 'does not exist')
          console.log(fs.existsSync(fullpath))
          var url = libraries[i].url;
          console.log('trying download of this')
          console.log(fullpath)
          console.log(url)

          // real compilcated stuff here

          await download(url, fullpath)
          console.log(url)
          javalibargsraw.push(fullpath)
        }


      } else if (libraries[i].natives == undefined && !(selectedversionthing.includes("forge"))) {
        console.log(libraries[i])
        firstpath = minecraftpath + '/libraries'
        lastpath = libraries[i].downloads.artifact.url.split("https://libraries.minecraft.net")[1]
        fullpath = firstpath + lastpath
        if (fs.existsSync(fullpath)) {
          console.log(fullpath)
          javalibargsraw.push(fullpath)
        } else if (!(fs.existsSync(fullpath))) {
          tommy = false
          mydir = fullpath.split(fullpath.split('/')[fullpath.split('/').length - 1])[0].slice(0, -1)
          if (!fs.existsSync(mydir)){
              console.log('mydir not there lmao')
              fs.mkdirSync(mydir, { recursive: true });
          }
          console.log(fullpath, 'does not exist')
          console.log(fs.existsSync(fullpath))
          var url = libraries[i].downloads.artifact.url;
          console.log('trying download of this')
          console.log(fullpath)
          console.log(url)

          // real compilcated stuff here

          await download(url, fullpath)
          console.log(url)
          javalibargsraw.push(fullpath)
        }
        
      }
    //}
  }
  //console.log(javalibargsraw)

  if (selectedversionthing.includes("forge")) {
    if (selectedversionthing.split('-forge')[0].split('1.')[1] >= 17) {
      console.log('javaversion is 16')
      javapath = "/opt/jdk/jdk-16.0.1+9-jre/bin/java"
    } else if (selectedversionthing.split('-forge')[0].split('1.')[1] < 17) {
      console.log('javaversion is 8')
      javapath = "/opt/jdk/jdk1.8.0_251/jre/bin/java"
    } else {
      console.log('must be a new snapshot or smth idk, well just keep it as java 16')
      javapath = "/opt/jdk/jdk-16.0.1+9-jre/bin/java"
    }
    for (i in realzlibraries) {
      //if (libraries[i].rules == undefined) {
        if (selectedversionthing.includes("forge")) {
          //javapath = "/opt/jdk/jdk1.8.0_251/jre/bin/java"
          console.log(realzlibraries[i])
          firstpath = minecraftpath + '/libraries'
          path1 = '/' + realzlibraries[i].name.split(":")[0].replace(/\./g,'/')
          path2 = realzlibraries[i].name.split(":")[1]
          path3 = realzlibraries[i].name.split(":")[2]
          console.log(path1)
          console.log(path2)
          console.log(path3)
          finalpath = path1 + '/' + path2 + '/' + path3 + '/' + path2 + '-' + path3 + '.jar'
          fullpath = firstpath + finalpath
          console.log(fullpath)
          javalibargsraw.push(fullpath)
        }
      //}
    }
  }
  logger.innerHTML = 'Finished downloading libraries';
  logger.innerHTML = 'Downloading client jar file';

  // Download client jar if it isnt there
  clientJarLink = minecraftjson.downloads.client.url
  clientJarPath = minecraftpath + "/versions/" + selectedversionthing + "/" + selectedversionthing + ".jar"
  if ((fs.existsSync(clientJarPath))) {
    console.log(fs.existsSync(clientJarPath))
  } else {
    await download(clientJarLink, clientJarPath)
  }
  logger.innerHTML = 'Finished';
  logger.innerHTML = 'Launching';

  // Launch the dang thing
  javalibsargs = javalibargsraw.join(':')
  javalibsargs = javalibsargs + ':' + minecraftpath + "/versions/" + selectedversionthing + "/" + selectedversionthing + ".jar"
  args.push(javalibsargs)
  args.push(mainClass)
  console.log(mcarguments)
  finalmcargments = mcarguments.split(" ")
  for (i in finalmcargments) {
    args.push(finalmcargments[i])
  }
  console.log(args)
  minecraft = spawn(javapath, args, { env: { ...process.env, MESA_GL_VERSION_OVERRIDE: "4.5" } })
  logger.innerHTML = 'Game has launched';
  minecraft.stdout.setEncoding('utf8');
  minecraft.stdout.on('data', function(data) {

    console.log('stdout: ' + data);

  });
  minecraft.stderr.on('data', (data) => {
    console.error(`stderr: ${data}`);
    logger.innerHTML = 'ERROR: \nCheck console for further details';
  });
  
  minecraft.on('close', (code) => {
    console.log(`child process exited with code ${code}`);
    logger.innerHTML = 'Game closed'
  });
  


};

document.getElementById("exit").addEventListener("click", function (e) {
  window.close();
}); 


