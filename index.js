const fs = require('fs');
const { http, https } = require('follow-redirects');
const os = require('os');
const { spawn } = require('child_process');
const homedir = os.homedir();
const path = require('path');
const extract = require('extract-zip');
var targz = require('tar.gz');
var minecraftpath = homedir + "/.minecraft";
var getversion;
var versionlist;
var getinstalledversion;
var javapath = "java";
var email = "Not logged on";
var logger = document.getElementById("islog");
var currentOS = "linux";
var uuid;
var lwjglnum;
var bitness = "64";

var arch = process.arch;
console.log(arch);
if (arch == "arm") {
  bitness = "32";
} else {
  bitness = "64";
}

Object.size = function(obj) {
  return Object.keys(obj).length;
}

function exist(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  } else if (fs.existsSync(dir)) {
  }
}

async function download(url, filePath) {
  exist(path.dirname(filePath));
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

async function downloadZipToDir(zipurl, destination) {
  await download(zipurl, "/tmp/" + path.basename(destination));
  try {
    await extract("/tmp/" + path.basename(destination), { dir: destination })
    console.log('Extraction complete')
  } catch (err) {
    console.warn(err);
  }
}

async function downloadTarToDir(tarurl, destination) {
  await download(tarurl, "/tmp/" + path.basename(destination));
  var extract = await new targz().extract("/tmp/" + path.basename(destination), destination, function(err){
    if(err)
      console.log(err);

    console.log('The extraction has ended!');
  });
}


function doesexist(file) {
  if (fs.existsSync(file)) {
    return true
  } else {
    return false
  }
}

exist(minecraftpath)
exist(minecraftpath + '/libraries')
exist(minecraftpath + '/versions')
exist(minecraftpath + '/assets')

console.log(logger.innerHTML)
const fileName = minecraftpath + "/pilauncher_accounts.json";
const mcjson = require(fileName);
if (mcjson.accounts === undefined || mcjson.accounts === "undefined" || Object.keys(mcjson.accounts).length == 0) {

  logger.innerHTML = "Log in first"
  document.getElementById("launchbutton").disabled = true
} else {
  logger.innerHTML = "Logged on as "
  document.getElementById("launchbutton").disabled = false
  localStorage.setItem('currentuser', Object.keys(mcjson.accounts)[0])
  uuid = localStorage.getItem('currentuser')
  console.log(uuid)
  username = mcjson.accounts[uuid].username
  logger.innerHTML = logger.innerHTML + username
}

class Profile {
  name;
  icon;
  version;
  resolution;

  constructor(name, icon, version) {
    this.name = name;
    this.icon = icon;
    this.version = version;
    this.resolution = undefined;
  }

  getName() {
    return this.name;
  }

  setName(name) {
    this.name = name;
  }

  getResolution() {
    return this.resolution;
  }

  setResolution(x,y) {
    this.resolution = [x ,y];
  }
}

class Substitutor {
  substitutor;

  constructor(substitutor) {
    this.substitutor = substitutor
  }

  replace(string) {
    if (string.includes("${")) {
      var finalWord = string;
      for (var i in string.split("${")) {
        if (i == 0) {
          continue
        }
        var substitutableWord = string.split("${")[i].split("}")[0];
        console.log(substitutableWord);
        for (var i in this.substitutor) {
          if (i == substitutableWord) {
            console.log("yess! replaceing", i, this.substitutor[i]);
            finalWord = finalWord.replaceAll("${" + substitutableWord + "}", this.substitutor[i]);
            console.log(finalWord);
          }
        }
      }
      return finalWord;
    } else {
      return string
    }
  }
}

// temp
var onedotsixteen = minecraftjson = require('/home/pi/.minecraft/versions/1.17.1-forge-37.1.1/1.17.1-forge-37.1.1.json')
var onedotsixteenprofile = new Profile("test", "iconpath", "1.17.1-forge-37.1.1");
var settings = {};
settings['featureMatcher'] = "has_custom_resolution,";

class MinecraftVersion {
  inheritsFrom;
  id;
  time;
  releaseTime;
  type;
  minecraftArguments;
  libraries = [];
  mainClass;
  minimumLauncherVersion;
  incompatibilityReason;
  assets;
  compatibilityRules = [];
  jar;
  savableVersion;
  downloads = [];
  assetIndex;
  arguments = {};
  lwjglnum = "3";
  constructor(versiondata) {
    this.inheritsFrom = versiondata.inheritsFrom;
    this.id = versiondata.id;
    this.time = versiondata.time;
    this.releaseTime = versiondata.releaseTime;
    this.type = versiondata.type;
    this.minecraftArguments = versiondata.minecraftArguments;
    this.mainClass = versiondata.mainClass;
    this.minimumLauncherVersion = versiondata.minimumLauncherVersion;
    this.incompatibilityReason = versiondata.incompatibilityReason;
    this.assets = versiondata.assets;
    this.jar = versiondata.jar;
    this.downloads = versiondata.downloads;
    this.assetIndex = versiondata.assetIndex;

    if (versiondata.libraries != undefined) {
      for (var i in versiondata.libraries) {
        this.libraries.push(versiondata.libraries[i])
      }
    }
    if (versiondata.arguments != undefined) {
      for (var entry in versiondata.arguments) {
        this.arguments[entry] = []
        for (var i in versiondata.arguments[entry]) {
          var myentry = versiondata.arguments[entry][i];
          console.log(myentry)
          if (typeof myentry === 'string') {
            var newobj = {
              "value": [
                myentry
              ],
              "compatibilityRules": []
            };
            this.arguments[entry].push(newobj);
          } else {
            console.log("yeeee")
            this.arguments[entry].push(myentry);
            console.log(myentry)
          }
        }
      }
    }
    if (versiondata.compatibilityRules != undefined) {
      for (var i in versiondata.compatibilityRules) {
        this.compatibilityRules.push(versiondata.compatibilityRules[i])
      }
    }
  }

  getId() {
    return this.id;
  }

  getType() {
    return this.type;
  }

  getUpdatedTime() {
    return this.time;
  }

  getReleaseTime() {
    return this.releaseTime;
  }

  getLibraries() {
    return this.libraries;
  }

  getMainClass() {
    return this.mainClass;
  }

  getJar() {
    return this.jar == undefined ? this.id : this.jar;
  }

  setType(type) {
    if (type == undefined) {
      throw new Error("Release type cannot be null");
    }
      this.type = type;
  }

  async downloadJava() {
    logger.innerHTML = 'Downloading Java';

    // Download java if it isnt there
    var javaLink;
    var javaPath = minecraftpath + "/java";

    if (fs.existsSync(minecraftpath + "/java/jdk-17.0.3+7-jre/bin/java")) {

    } else {
      if (bitness == "32") {
        javaLink = "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.3%2B7/OpenJDK17U-jre_arm_linux_hotspot_17.0.3_7.tar.gz";
      } else if (bitness == "64") {
        javaLink = "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.3%2B7/OpenJDK17U-jre_aarch64_linux_hotspot_17.0.3_7.tar.gz";
      }
      await downloadTarToDir(javaLink, javaPath);
    }
    logger.innerHTML = 'Finished';
    javapath = minecraftpath + "/java/jdk-17.0.3+7-jre/bin/java";
  }
  
  appliesToCurrentEnvironment(library) {
    var allowIt = false;
    if (library.rules == undefined) {
      return true;
    }
    for (var i in library.rules) {
      if (library.rules[i].action == "alllow") {
        if (library.rules[i].os == undefined) {
          allowIt = true;
        } else {
          if (library.rules[i].os.name.includes(currentOS)) {
            allowIt = true;
          } else {
            allowIt = false;
          }
        }
      } else if (library.rules[i].action == "disallow") {
        if (library.rules[i].os == undefined) {
          allowIt = false;
        } else {
          if (library.rules[i].os.name.includes(currentOS)) {
            allowIt = false;
          } else {
            allowIt = true;
          }
        }
      }
    }
    return allowIt;
  }
  
  getRelevantLibraries() {
    var result = [];
    for (var library in this.libraries) {
      if (!this.appliesToCurrentEnvironment(this.libraries[library])) continue;
      result.push(this.libraries[library]);
    }
    return result;
  }
  getArtifactPath(library, classifier) {
    var split = library.name.split(":");
    var basedir = split[0].replaceAll(".", "/") + "/" + split[1] + "/" + split[2] + "/";
    var filename = split[1] + "-" + split[2] + "-" + classifier + ".jar";
    console.log(basedir + filename)
    return basedir + filename;
  }

  getArtifactPath(library) {
    var split = library.name.split(":");
    var basedir = split[0].replaceAll(".", "/") + "/" + split[1] + "/" + split[2] + "/";
    var filename = split[1] + "-" + split[2] + ".jar";
    return basedir + filename;
  }

  getClassPath(base) {
    var libraries = this.getRelevantLibraries();
    var result = [];
    for (var library in libraries) {
      if (libraries[library].natives != undefined) continue;
      result.push(base + "/libraries/" + this.getArtifactPath(libraries[library]));
    }
    result.push(base + "/versions/" + this.getJar() + "/" + this.getJar() + ".jar");
    return result;
  }

  getRequiredFiles(os) {
    var neededFiles = [];
    for (var i in this.getRelevantLibraries()) {
      var library = this.getRelevantLibraries()[i];
      if (library.natives != undefined) {
        var natives = library.natives[os];
        if (natives == undefined) continue;
        neededFiles.push("/libraries/" + this.getArtifactPath(library, natives));
        continue;
      }
      neededFiles.push("/libraries/" + this.getArtifactPath(library));
    }
    return neededFiles;
  }

  createDownload(url, local) {
    //console.log(doesexist(local), local)
    if (doesexist(local)) {
      return undefined;
    } else {
      return [url, local];
    }
  }
  
  getRequiredDownloadables(os, targetDirectory) {
    var neededFiles = [];
    for (var i in this.getRelevantLibraries()) {
      var library = this.getRelevantLibraries()[i];
      var download;
      var local;
      var file = undefined;
      console.log(library)
      if (library.downloads == undefined) {
        
      } else {
        var classifier = undefined;
        var url;
        if (library.natives != undefined) {
          classifier = library.natives[os];
          if (classifier != undefined) {
            file = this.getArtifactPath(library, classifier);
            if (library.downloads.artifact != undefined) {
              url = library.downloads.artifact.url;
            } else {
              url = library.downloads.classifiers[classifier].url;
            }
          }
        } else {
          file = this.getArtifactPath(library);
          url = library.downloads.artifact.url;
        }
        console.log(file);
        if (file == undefined || (download = this.createDownload(url, local = targetDirectory + "/libraries/" + file)) == undefined) continue;
        neededFiles.push(download);
      }
    }
    console.log(neededFiles)
    return neededFiles;
  }

  async downloadLibraries() {
    // ebic progress bar code
    var progressBar = document.getElementById('myProgress')
    var bar = document.getElementById('myBar')
    progressBar.style.display = ''
    progressBar.style.width = '100%'
    bar.style.display = ''
    bar.style.width = '0%'


    var downloads = this.resolve().getRequiredDownloadables(currentOS, minecraftpath);
    logger.innerHTML = 'Downloading Libraries...';
    for (var i in downloads) {
      var percent = (i / downloads.length)*100;
      bar.style.width = percent.toString() + '%'
      logger.innerHTML = 'Downloading ' + downloads[i][0];
      await download(downloads[i][0], downloads[i][1]);
    }
    progressBar.style.display = 'none'
    progressBar.style.width = '0%'
    bar.style.display = 'none'
    bar.style.width = '0%'
    logger.innerHTML = 'Finished Downloading Libraries';
  }

  async downloadClientJar() {
    logger.innerHTML = 'Downloading client jar file';

    // Download client jar if it isnt there
    if (this.downloads != undefined) {
      var clientJarLink = this.resolve().downloads.client.url;
      var clientJarPath = minecraftpath + "/versions/" + this.getJar() + "/" + this.getJar() + ".jar";
      if ((fs.existsSync(clientJarPath))) {
        console.log(fs.existsSync(clientJarPath));
      } else {
        await download(clientJarLink, clientJarPath);
      }
    }
    logger.innerHTML = 'Finished';
  }

  toString() {
    return "CompleteVersion{id='" + this.id + '\'' + ", updatedTime=" + this.time + ", releasedTime=" + this.time + ", type=" + this.type + ", libraries=" + JSON.stringify(this.libraries) + ", mainClass='" + this.mainClass + '\'' + ", jar='" + this.jar + '\'' + ", minimumLauncherVersion=" + this.minimumLauncherVersion + '}';
  }

  getMinecraftArguments() {
    return this.minecraftArguments;
  }

  getMinimumLauncherVersion() {
    return this.minimumLauncherVersion;
  }

  getIncompatibilityReason() {
    return this.incompatibilityReason;
  }

  getInheritsFrom() {
    return this.inheritsFrom;
  }

  resolve() {
    if (this.inheritsFrom == undefined) {
      return this;
    }
    // make it install the parent version if its not installed
    var parent = require(minecraftpath + '/versions/' + this.inheritsFrom + '/' + this.inheritsFrom + '.json')
    var result = new MinecraftVersion(parent);
    //    if (!parentSync.isInstalled() || !parentSync.isUpToDate() || parentSync.getLatestSource() != VersionSyncInfo.VersionSource.LOCAL) {
    //      versionManager.installVersion(parent);
    //    } (use this code)
    result.savableVersion = this;
    result.inheritsFrom = undefined;
    result.id = this.id;
    result.time = this.time;
    result.releaseTime = this.releaseTime;
    result.type = this.type;
    if (this.minecraftArguments != undefined) {
      result.minecraftArguments = this.minecraftArguments;
    }
    if (this.mainClass != undefined) {
      result.mainClass = this.mainClass;
    }
    if (this.incompatibilityReason != undefined) {
      result.incompatibilityReason = this.incompatibilityReason;
    }
    if (this.assets != undefined) {
      result.assets = this.assets;
    }
    if (this.jar != undefined) {
      result.jar = this.jar;
    }
    if (this.libraries != undefined) {
      var newLibraries = [];
      for (var library in this.libraries) {
        newLibraries.push(this.libraries[library]);
      }
      for (var library in result.libraries) {
        newLibraries.push(result.libraries[library]);
      }
      result.libraries = newLibraries;
    }
    if (this.arguments != undefined) {
      if (result.arguments == undefined) {
        result.arguments = {};
      }
      for (var entry in this.arguments) {
        var arguments_ = result.arguments[entry];
        if (arguments_ == undefined) {
          arguments_ = [];
          result.arguments.push({[entry]:arguments_});
        }
        for (var i in this.arguments[entry]) {
          var myentry = this.arguments[entry][i];
          if (typeof myentry === 'string') {
            var newobj = {
              "value": [
                myentry
              ],
              "compatibilityRules": []
            };
            result.arguments[entry].push(newobj);
          } else if (myentry.compatibilityRules === undefined) {
            var newobj = {
              "value": [
                myentry.value[0]
              ],
              "compatibilityRules": []
            };
            this.arguments[entry].push(newobj);
          } else {
            result.arguments[entry].push(myentry);
          }
        }
        
        //arguments_.push(this.arguments[entry]);
        //console.log(arguments_)
      }
    }
    if (this.compatibilityRules != undefined) {
      for (compatibilityRule in this.compatibilityRules) {
          result.compatibilityRules.push(this.compatibilityRules[compatibilityRule]);
      }
    }
    return result;
  }

  getSavableVersion() {
    return this.savableVersion;
  }

  getDownloadURL(type) {
    if (this.downloads === undefined) {
      return this.resolve().downloads[type];
    } else {
      return this.downloads[type];
    }
  }

  getAssetIndex() {
    if (this.assetIndex == undefined) {
      this.assetIndex = this.resolve().assetIndex;
    }
    return this.assetIndex;
  }

  createFeatureMatcher() {
    return {accountType: mcjson.accounts[Object.keys(mcjson.accounts)[0]].type}
  }

  argAppliesToCurrentEnvironment(argument) {
    var ruleVar = "rules";
    if (argument.rules != undefined) {
      ruleVar = "rules";
    } else if (argument.compatibilityRules != undefined) {
      ruleVar = "compatibilityRules";
    }
    var allowIt = false;
    if (argument[ruleVar][0] == undefined) {
      return true;
    }
    for (var i in argument[ruleVar]) {
      if (argument[ruleVar][i].action == "alllow") {
        if (argument[ruleVar][i].os == undefined) {
          allowIt = true;
        } else {
          if (argument[ruleVar][i].os.name.includes(currentOS)) {
            allowIt = true;
          } else {
            allowIt = false;
          }
        }
      } else if (argument[ruleVar][i].action == "disallow") {
        if (argument[ruleVar][i].os == undefined) {
          allowIt = false;
        } else {
          if (argument[ruleVar][i].os.name.includes(currentOS)) {
            allowIt = false;
          } else {
            allowIt = true;
          }
        }
      }
    }
    return allowIt;
  }

  builder = {
    arguments: [],
    withArguments: function(...string) {
      this.arguments.push(...string);
    }
  }

  apply(argument, output, substitutor) {
    if (this.argAppliesToCurrentEnvironment(argument)) {
      for (var i in argument.value) {
        output.withArguments(substitutor.replace(argument.value[i]));
      }
    }
  }

  async downloadAssets(assetIndex, assets) {
    if ((fs.existsSync(minecraftpath + '/assets/indexes/' + assets + '.json'))) {
    
    } else {
      await download(assetIndex.url, minecraftpath + '/assets/indexes/' + assets + '.json')
      console.log('assets are readys')
      logger.innerHTML = 'Missing asset file created';
    }

    var needDown = []
    var allAssets = require(minecraftpath + '/assets/indexes/' + assets + '.json')
    for (var i in allAssets.objects) {
      var currentHash = allAssets.objects[i].hash
      var tooChar = currentHash.substring(0, 2);
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
      document.getElementById('myProgress').style.width = '100%';
      progs.style.display = ''
      progs.style.width = '0%'
      for (var i in allAssets.objects) {
        var currentHash = allAssets.objects[i].hash
        var tooChar = currentHash.substring(0, 2);
        //console.log(minecraftpath + '/assets/objects/' + tooChar + '/' + currentHash)
        if ((fs.existsSync(minecraftpath + '/assets/objects/' + tooChar + '/' + currentHash))) {
          //console.log(fs.existsSync(minecraftpath + '/assets/objects/' + tooChar + '/' + currentHash))
        } else {
          var link = 'http://resources.download.minecraft.net/' + tooChar + '/' + currentHash;
          var fpath = minecraftpath + '/assets/objects/' + tooChar + '/' + currentHash;
          exist(minecraftpath + '/assets/objects/' + tooChar)
          logger.innerHTML = 'Downloading: ' + i
          var myIndex = needDown.indexOf(i)
          var percent = myIndex*100 / needDown.length;
          console.log(percent)
          progs.style.width = percent.toString() + '%'
          await download(link, fpath)
        }
      }
    }
    return allAssets
  }

  async downloadALLAssets() {
    await this.downloadAssets(this.resolve().getAssetIndex(), this.resolve().getAssetIndex().id);
  }

  getLwjglNum() {
    var number = this.inheritsFrom == undefined ? this.getId() : this.inheritsFrom;
    var nummy = parseFloat(number.split("1.")[1]);
    if (nummy < 13) {
      this.lwjglnum = "2";
    } else if (nummy >= 13 && nummy < 19) {
      this.lwjglnum = "3old";
    } else {
      this.lwjglnum = "3";
    }
    console.log(this.resolve())
    return this.lwjglnum;
  }

  async downloadNatives() {
    logger.innerHTML = 'Downloading Natives';

    // Download lwjgl if it isnt there
    var lwjglLink = "https://raw.githubusercontent.com/gl91306/lunar/master/lwjgl" + this.getLwjglNum() + "arm" + bitness + ".zip";
    var lwjglPath = minecraftpath + "/natives/lwjgl" + this.getLwjglNum() + "arm" + bitness;
    if ((fs.existsSync(lwjglPath))) {
      console.log(fs.existsSync(lwjglPath));
    } else {
      await downloadZipToDir(lwjglLink, lwjglPath);
    }
    logger.innerHTML = 'Finished';
    console.log("lwjglnum is", this.getLwjglNum())
  }

  getNativesPath() {
    return minecraftpath + "/natives/lwjgl" + this.getLwjglNum() + "arm" + bitness;
  }

  createArgumentsSubstitutor(selectedProfile) {
    var map = {};
    map["auth_access_token"] = mcjson.accounts[uuid].accessToken;
    map["user_properties"] = '{}';
    map["user_property_map"] = '';
    if (mcjson.accounts[uuid].type == "mojang") {
      map["auth_session"] = "token:" + mcjson.accounts[uuid].accessToken + ":" + uuid;
    } else if (mcjson.accounts[uuid].type != "msa") {
      map["auth_session"] = mcjson.accounts[uuid].accessToken;
    }
    if (localStorage.getItem('currentuser') != null || localStorage.getItem('currentuser') != undefined) {
      map["auth_player_name"] = mcjson.accounts[uuid].username;
      map["auth_uuid"] = uuid;
      map["user_type"] = mcjson.accounts[uuid].type.toLowerCase();
    } else {
      map["auth_player_name"] = "TechnobladeNeverDies";
      map["auth_uuid"] = "b876ec32e396476ba1158438d83c67d4";
      map["user_type"] = "msa";
    }
    // todo add profiles
    map["profile_name"] = selectedProfile.getName();
    map["version_name"] = this.getId();
    map["game_directory"] = minecraftpath;
    map["library_directory"] = minecraftpath + "/libraries"
    map["game_assets"] = minecraftpath + '/assets';
    map["assets_root"] = minecraftpath + '/assets';
    map["assets_index_name"] = this.resolve().assetIndex.id;
    map["version_type"] = this.getType();
    // ADD! add selectable profiles
    if (selectedProfile.getResolution() != undefined) {
      map["resolution_width"] = selectedProfile.getResolution()[0];
      map["resolution_height"] = selectedProfile.getResolution()[1];
    } else {
      console.log("??????????????????????/")
      map["resolution_width"] = "854";
      map["resolution_height"] = "480";
    }
    map["language"] = "en-us";
    map["launcher_name"] = "launcherpi";
    map["launcher_version"] = "1.0.1";
    // // todo ADD! lwjgl switching
    map["natives_directory"] = this.getNativesPath();
    map["classpath"] = this.resolve().getClassPath(minecraftpath).join(":")
    map["classpath_separator"] = ":"
    map["primary_jar"] = minecraftpath + "/versions/" + this.getJar() + "/" + this.getJar() + ".jar";
    map["clientid"] = "708e91b5-99f8-4a1d-80ec-e746cbb24771";
    map["auth_xuid"] = mcjson.accounts[uuid].xuid;
    return new Substitutor(map);
  }

  addArguments(type, featureMatcher, builder, substitutor) {
    if (this.arguments[Object.keys(this.arguments)[0]] != undefined) {
      console.log(this.arguments, {})
      console.log(this.arguments == {})
      var args = this.arguments[type];
      console.log(args);
      if (args != undefined) {
        for (var i in args) {
          var argument = args[i];
          this.apply(argument, builder, substitutor);
        }
      }
    } else if (this.minecraftArguments != undefined) {
      if (type == "game") {
        for (var arg in this.minecraftArguments.split(" ")) {
          builder.withArguments(substitutor.replace(this.minecraftArguments.split(" ")[arg]));
        }
        if (featureMatcher.includes("is_demo_user")) {
          builder.withArguments("--demo");
        }
        if (featureMatcher.includes("has_custom_resolution")) {
          builder.withArguments("--width", substitutor.replace("${resolution_width}"), "--height", substitutor.replace("${resolution_height}"));
        }
      } else if (type == "jvm") {
        if (currentOS.includes("windows")) {
          builder.withArguments("-XX:HeapDumpPath=MojangTricksIntelDriversForPerformance_javaw.exe_minecraft.exe.heapdump");
          if (currentOS.includes("windows10")) {
            builder.withArguments("-Dos.name=Windows 10", "-Dos.version=10.0");
          }
        } else if (currentOS.includes("osx")) {
          builder.withArguments(substitutor.replace("-Xdock:icon=${asset=icons/minecraft.icns}"), "-Xdock:name=Minecraft");
        }
        builder.withArguments(substitutor.replace("-Djava.library.path=${natives_directory}"));
        builder.withArguments(substitutor.replace("-Dminecraft.launcher.brand=${launcher_name}"));
        builder.withArguments(substitutor.replace("-Dminecraft.launcher.version=${launcher_version}"));
        builder.withArguments(substitutor.replace("-Dminecraft.client.jar=${primary_jar}"));
        builder.withArguments("-cp", substitutor.replace("${classpath}"));
      }
    }
    return builder.arguments.join(" ")
  }

  getFullLaunchPath() {
    var substitutor = this.createArgumentsSubstitutor(onedotsixteenprofile);

    var fullArgPath = "";
    var javaLibArgs = this.resolve().addArguments("jvm", settings.featureMatcher, this.resolve().builder, substitutor);
    console.log(javaLibArgs)
    fullArgPath += javaLibArgs
    var mainClass = this.getMainClass();
    console.log(mainClass)
    fullArgPath += " " + mainClass + " ";
    var userArgs = this.resolve().addArguments("game", settings.featureMatcher, this.resolve().builder, substitutor);
    console.log(userArgs)
    fullArgPath += userArgs;
    var FullLaunchPath = fullArgPath;
    console.log(FullLaunchPath.replaceAll("  ", " "))
    return FullLaunchPath.replaceAll("  ", " ");
  }

  async launch() {
    await this.downloadJava();
    console.log("java done");
    await this.downloadLibraries();
    console.log("libs done");
    await this.downloadNatives();
    console.log("natives done");
    await this.downloadALLAssets();
    console.log("gamefiels done");
    await this.downloadClientJar();
    console.log("client done");
    var args = this.getFullLaunchPath().split(" ");
    console.log(args)
    var minecraft = spawn(javapath, args, { env: { ...process.env, MESA_GL_VERSION_OVERRIDE: "4.6" } })
    logger.innerHTML = 'Game has launched';
    minecraft.stdout.setEncoding('utf8');
    minecraft.stdout.on('data', function(data) {

      console.log('stdout: ' + data);

    });
    minecraft.stderr.on('data', (data) => {
      console.warn(`stderr: ${data}`);
      logger.innerHTML = 'ERROR: \nCheck console for further details';
    });
    
    minecraft.on('close', (code) => {
      console.log(`child process exited with code ${code}`);
      logger.innerHTML = 'Game closed'
    });
  }
}

// temp

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
  for (var i in files) {
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
  for (var i in data.versions) {
    rawraw.push(data.versions[i].id)
  }
  console.log(data)
  rawdata = data
  versionlistraw = rawraw
  console.log("afhgigfdinstalled")
  console.log(versionlistraw)
  for (var i in versionlistraw) {
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
  var minecraftjson
  if (!(fs.existsSync(minecraftpath + '/versions/' + selectedversionthing + '/' + selectedversionthing + '.json'))) {
    var myurl
    for (var i in rawdata.versions) {
      if (rawdata.versions[i].id == selectedversionthing) {
        myurl = rawdata.versions[i].url
      }
    }
    await download(myurl, minecraftpath + '/versions/' + selectedversionthing + '/' + selectedversionthing + '.json')
  }
  console.log('thumbsup');
  logger.innerHTML = 'fixed empty directories';
  minecraftjson = require(minecraftpath + '/versions/' + selectedversionthing + '/' + selectedversionthing + '.json');

  // I SPENT TO LONG TO OPJECT ORIENT THE COMMENTED CODE TO THIS OMG
  var version = new MinecraftVersion(minecraftjson);
  version.launch();


  /**mainClass = minecraftjson.mainClass
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
        clientid: '708e91b5-99f8-4a1d-80ec-e746cbb24771',
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
        clientid: '708e91b5-99f8-4a1d-80ec-e746cbb24771',
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
        clientid: '708e91b5-99f8-4a1d-80ec-e746cbb24771',
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
        clientid: '708e91b5-99f8-4a1d-80ec-e746cbb24771',
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
  for (var i in allAssets.objects) {
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
    for (var i in allAssets.objects) {
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
  
  /** Start organizing launch args 
  // Orgainize Java launch args
  args = []
  javaargsraw = "-Xmx1G -Dorg.lwjgl.util.Debug=true -Dorg.lwjgl.librarypath=/home/pi/lwjgl" + lwjglnum + "arm32 -Djava.library.path=/home/pi/lwjgl" + lwjglnum + "arm32 -Xmn128M -Dminecraft.launcher.brand=java-minecraft-launcher -Dminecraft.launcher.version=1.6.93 -Dminecraft.client.jar=" + minecraftpath + "/versions/" + selectedversionthing + "/" + selectedversionthing + ".jar"
  javaargs = javaargsraw.split(" ")
  for (var i in javaargs) {
    args.push(javaargs[i])
  }
  // Organize library args
  args.push('-cp')
  javalibargsraw = []
  logger.innerHTML = 'Downloading libraries...';
  for (var i in libraries) {
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
    for (var i in realzlibraries) {
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
  for (var i in finalmcargments) {
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
  });*/
  


};

document.getElementById("exit").addEventListener("click", function (e) {
  window.close();
}); 


