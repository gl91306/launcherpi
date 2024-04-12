const { spawn } = require('child_process');
const onezip = require('onezip');
const axios = require('axios');
const request = require('request');
const crypto = require('crypto');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Paths:
const homedir = os.homedir();
var minecraftpath = path.join(homedir, ".minecraft");
var pilauncher_accountJson = path.join(minecraftpath, "pilauncher_accounts.json");
var javaPath, localjavaPath = path.join(minecraftpath, 'java');
console.log("MC Path:", minecraftpath);
console.log("Java Path:", localjavaPath);

// Other Vars:
var versionlist, lwjglnum, uuid, bitness, ext, sep;
const platform = os.platform();
const arch = os.arch();

if (arch == "arm") {
  bitness = "32";
} else {
  bitness = "64";
};

if (platform == "win32") {
  ext = ".exe";
  sep = ";";
} else {
  ext = "";
  sep = ":";
}

// Other:
Object.size = function (obj) {
  return Object.keys(obj).length;
}

String.prototype.interpolate = function (params) {
  const names = Object.keys(params);
  const vals = Object.values(params);
  return new Function(...names, `return \`${this}\`;`)(...vals);
}

// Elements:
var logger = document.getElementById("islog");
var launchBtn = document.getElementById("launchbutton");
var progs = document.getElementById('progressBar');
progs.style.display = 'none';

// Helper Functions:
function doesexist(file) {
  if (fs.existsSync(file)) {
    return true
  } else {
    return false
  };
};

function exist(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, {
      recursive: true
    });
  } else if (fs.existsSync(dir)) { };
};

function extractFile(filePath, outputPath) {
  const fileExtension = filePath.split('.').pop().toLowerCase();
  if (fileExtension === 'zip') {
    // ZIP file
    return new Promise((resolve, reject) => {
      const extract = onezip.extract(filePath, outputPath);

      extract.on('file', (name) => {
        //console.log(name);
      });

      extract.on('start', (percent) => {
        console.log('extracting started');
      });

      extract.on('progress', (percent) => {
        console.log(`${percent}%`);
      });

      extract.on('error', (error) => {
        console.error(error);
        reject(error);
      });

      extract.on('end', () => {
        //console.log('done');
        resolve(outputPath);
      });
    });
  } else if (fileExtension === 'gz') {
    // TAR.GZ file
    return new Promise((resolve, reject) => {
      exec(`tar -xzf ${filePath} -C ${outputPath}`, (error, stdout, stderr) => {
        if (error) {
          console.error(error);
          reject(error);
          return;
        }
        resolve(outputPath);
      });
    });
  } else {
    throw new Error('Unsupported file format');
  };
};

// Function to calculate the SHA-256 hash of a file
function calculateHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', data => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
};

// Function to delete a file
function deleteFile(filePath) {
  fs.unlinkSync(filePath);
};

async function downloadFile(url, output) {
  const fileExtension = url.split('.').pop();
  const fileName = url.split('/').pop();
  let outputPath = output;

  console.log( `Downloading file: ${fileName} from: ${url}`);

  /*Save variable to know progress*/
  let received_bytes = 0;
  let total_bytes = 0;
  let percentage = 0;

  return new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(outputPath);

    const req = request.get({
      method: 'GET',
      uri: url
    });

    req.pipe(writer);

    req.on('response', function (data) {
      /*Change the total bytes value to get progress later*/
      total_bytes = parseInt(data.headers['content-length']);
    });

    req.on('data', function (chunk) {
      /*Update the received bytes*/
      received_bytes += chunk.length;

      percentage = (received_bytes * 100) / total_bytes;
      console.log(percentage.toFixed(2).split('.')[0].trim() + "% | " + received_bytes + " bytes out of " + total_bytes + " bytes.");
    });

    req.on('end', function () {
      writer.end();
      resolve(outputPath);
    });

    req.on('error', (err) => {
      fs.unlink(outputPath, () => reject(err));
    });
  });
};

/* ensure required dirs exist */
exist(minecraftpath);
exist(minecraftpath + '/java');
exist(minecraftpath + '/libraries');
exist(minecraftpath + '/versions');
exist(minecraftpath + '/assets');

console.log("Checking login status...");
const mcjson = require(pilauncher_accountJson);
if (mcjson.accounts === undefined || mcjson.accounts === "undefined" || Object.keys(mcjson.accounts).length == 0) {
  logger.innerHTML = "Log in first";
  launchBtn.disabled = true;
  console.log("log in first");
} else {
  launchBtn.disabled = false;
  localStorage.setItem('currentuser', Object.keys(mcjson.accounts)[0]);
  uuid = localStorage.getItem('currentuser');
  console.log(uuid);
  mcusername = mcjson.accounts[uuid].mcusername;
  logger.innerHTML = `Logged in as ${mcusername}`;
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

  setResolution(x, y) {
    this.resolution = [x, y];
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
        //console.log(substitutableWord);
        for (var i in this.substitutor) {
          if (i == substitutableWord) {
            //console.log("Replacing", i, this.substitutor[i]);
            finalWord = finalWord.replaceAll("${" + substitutableWord + "}", this.substitutor[i]);
            //console.log(finalWord);
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
//var onedotsixteen = minecraftjson = require('/home/pi/.minecraft/versions/1.17.1-forge-37.1.1/1.17.1-forge-37.1.1.json')
//var onedotsixteenprofile = new Profile("test", "iconpath", "1.17.1-forge-37.1.1");
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
          //console.log(myentry)
          if (typeof myentry === 'string') {
            var newobj = {
              "value": [
                myentry
              ],
              "compatibilityRules": []
            };
            this.arguments[entry].push(newobj);
          } else {
            this.arguments[entry].push(myentry);
            //console.log(myentry)
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
    // Java download urls
    const JAVA_URLS = {
      windows: {
        x64: {
          url: 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.9%2B9/OpenJDK17U-jre_x86-32_windows_hotspot_17.0.9_9.zip',
          hash_url: 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.9%2B9/OpenJDK17U-jre_x86-32_windows_hotspot_17.0.9_9.zip.sha256.txt'
        }
      },
      mac: {
        arm64: {
          url: 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.9%2B9/OpenJDK17U-jre_aarch64_mac_hotspot_17.0.9_9.tar.gz',
          hash_url: 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.9%2B9/OpenJDK17U-jre_aarch64_mac_hotspot_17.0.9_9.tar.gz.sha256.txt'
        },
        x64: {
          url: 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.9%2B9/OpenJDK17U-jre_x64_mac_hotspot_17.0.9_9.tar.gz',
          hash_url: 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.9%2B9/OpenJDK17U-jre_x64_mac_hotspot_17.0.9_9.tar.gz.sha256.txt'
        }
      },
      linux: {
        arm64: {
          url: 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.9%2B9/OpenJDK17U-jre_aarch64_linux_hotspot_17.0.9_9.tar.gz',
          hash_url: 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.9%2B9/OpenJDK17U-jre_aarch64_linux_hotspot_17.0.9_9.tar.gz.sha256.txt'
        },
        arm: {
          url: 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.9%2B9/OpenJDK17U-jre_arm_linux_hotspot_17.0.9_9.tar.gz',
          hash_url: 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.9%2B9/OpenJDK17U-jre_arm_linux_hotspot_17.0.9_9.tar.gz.sha256.txt'
        },
        x64: {
          url: 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.9%2B9/OpenJDK17U-jre_x64_linux_hotspot_17.0.9_9.tar.gz',
          hash_url: 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.9%2B9/OpenJDK17U-jre_x64_linux_hotspot_17.0.9_9.tar.gz.sha256.txt'
        }
      }
    };

    // Function to get the download and hash URL based on the operating system and architecture
    function getJavaUrl() {
      switch (platform) {
        case 'win32': // TODO: check for arch type and throw error on unsupported arch
          return JAVA_URLS.windows.x64;
        case 'darwin': // MacOS
          switch (arch) {
            case 'arm64': // M1 and M2
              return JAVA_URLS.mac.arm64;
            default: // Default x64
              return JAVA_URLS.mac.x64;
          }
        case 'linux':
          switch (arch) {
            case 'arm': // 32-bit
              return JAVA_URLS.linux.arm;
            case 'arm64': // 64-bit
              return JAVA_URLS.linux.arm64;
            default: // Other Linux platforms (x64)
              return JAVA_URLS.linux.x64;
          }
        default:
          throw new Error('Unsupported platform, ', platform);
      }
    }

    // Download java if it isn't there
    if (!fs.existsSync(minecraftpath + `/java/jdk-17.0.9+9-jre/bin/java${ext}`)) {
      logger.innerHTML = 'Downloading Java';
      console.log('Downloading Java 17 JRE...');

      const outFile = path.join(localjavaPath, 'jre-17.zip');
      const writer = fs.createWriteStream(outFile);

      progs.style.display = "";

      const javaUrl = getJavaUrl();
      return new Promise((resolve, reject) => {
        request({
          method: 'GET',
          url: javaUrl.url,
          headers: {
            'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0`
          }
        })
          .on('response', (response) => {
            let received_bytes = 0;
            const total_bytes = parseInt(response.headers['content-length'], 10);

            response.on('data', (chunk) => {
              received_bytes += chunk.length;
              const percentage = (received_bytes * 100) / total_bytes;
              progs.style.width = `${percentage}%`
              console.log(`${percentage.toFixed(2)}% | ${received_bytes} bytes out of ${total_bytes} bytes.`);
            });

            response.on('end', async () => {
              console.log(`Java 17 JRE downloaded to ${outFile}`);
              console.log('Downloading sha256.txt...');
              const downloadedJREsha256Path = await downloadFile(javaUrl.hash_url, path.join(localjavaPath, 'java17-sha246.txt'));
              console.log(`Java 17 sha256.txt downloaded to ${downloadedJREsha256Path}`);

              // Verify SHA-256 hash
              console.log('Verifying SHA-256 hash...');
              const sha256Hash = fs.readFileSync(downloadedJREsha256Path, {
                encoding: 'utf8',
                flag: 'r'
              }).split(" ")[0].trim();
              const calculatedHash = await calculateHash(outFile);
              if (calculatedHash !== sha256Hash) {
                reject(new Error('SHA-256 hash verification failed'));
                return;
              }
              console.log('SHA-256 hash verification successful.');

              // Extract Java 17 JRE
              console.log('Extracting Java 17 JRE...');
              const outpath = await extractFile(outFile, localjavaPath);
              console.log('Java 17 JRE extracted.', outpath);

              // Clean up downloaded files
              console.log('Cleaning up downloaded files...');
              deleteFile(outFile);
              deleteFile(downloadedJREsha256Path);
              console.log('Downloaded files cleaned up.');
              logger.innerHTML = 'Finished';
              javaPath = path.join(localjavaPath, "/jdk-17.0.9+9-jre/bin/java");
              resolve(true);
            });
          })
          .on('error', (err) => {
            fs.unlink(outFile, () => {
              console.error('Download failed:', err.message);
              resolve(false);
            });
          })
          .pipe(writer);
      });
    } else {
      javaPath = path.join(localjavaPath, `/jdk-17.0.9+9-jre/bin/java${ext}`);
      return true;
    }
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
          if (library.rules[i].os.name.includes(platform)) {
            allowIt = true;
          } else {
            allowIt = false;
          }
        }
      } else if (library.rules[i].action == "disallow") {
        if (library.rules[i].os == undefined) {
          allowIt = false;
        } else {
          if (library.rules[i].os.name.includes(platform)) {
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
    //console.log(basedir + filename)
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
      //console.log(library)
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
        //console.log(file);
        if (file == undefined || (download = this.createDownload(url, local = targetDirectory + "/libraries/" + file)) == undefined) continue;
        neededFiles.push(download);
      }
    }
    console.log(neededFiles)
    return neededFiles;
  }

  async downloadLibraries() {
    // ebic progress bar code
    //var progressBar = document.getElementById('myProgress')
    var bar = document.getElementById('progressBar')
    //progressBar.style.display = ''
    //progressBar.style.width = '100%'
    bar.style.display = ''
    bar.style.width = '0%'


    var downloads = this.resolve().getRequiredDownloadables(platform, minecraftpath);
    logger.innerHTML = 'Downloading Libraries...';
    for (var i in downloads) {
      var percent = (i / downloads.length) * 100;
      bar.style.width = percent.toString() + '%'
      logger.innerHTML = 'Downloading ' + downloads[i][0];
      exist(path.dirname(downloads[i][1]));
      await downloadFile(downloads[i][0], downloads[i][1]);
    }
    //progressBar.style.display = 'none'
    //progressBar.style.width = '0%'
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
      if (!fs.existsSync(clientJarPath)) {
        await downloadFile(clientJarLink, clientJarPath);
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
          result.arguments.push({
            [entry]: arguments_
          });
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
    return {
      accountType: mcjson.accounts[Object.keys(mcjson.accounts)[0]].type
    }
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
          if (argument[ruleVar][i].os.name.includes(platform)) {
            allowIt = true;
          } else {
            allowIt = false;
          }
        }
      } else if (argument[ruleVar][i].action == "disallow") {
        if (argument[ruleVar][i].os == undefined) {
          allowIt = false;
        } else {
          if (argument[ruleVar][i].os.name.includes(platform)) {
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
    withArguments: function (...string) {
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
    if (!fs.existsSync(minecraftpath + '/assets/indexes/' + assets + '.json')) {
      await downloadFile(assetIndex.url, minecraftpath + '/assets/indexes/' + assets + '.json')
      console.log('assets are ready')
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
      //console.log(needDown.length)
      //console.log(needDown)
      //document.getElementById('myProgress').style.display = '';
      //document.getElementById('myProgress').style.width = '100%';
      progs.style.display = ''
      progs.style.width = '0%'
      for (var i in allAssets.objects) {
        var currentHash = allAssets.objects[i].hash
        var tooChar = currentHash.substring(0, 2);
        //console.log(minecraftpath + '/assets/objects/' + tooChar + '/' + currentHash)
        if ((fs.existsSync(minecraftpath + '/assets/objects/' + tooChar + '/' + currentHash))) {
          //console.log(fs.existsSync(minecraftpath + '/assets/objects/' + tooChar + '/' + currentHash))
        } else {
          var link = 'https://resources.download.minecraft.net/' + tooChar + '/' + currentHash;
          var fpath = minecraftpath + '/assets/objects/' + tooChar + '/' + currentHash;
          exist(minecraftpath + '/assets/objects/' + tooChar)
          logger.innerHTML = 'Downloading: ' + i
          var myIndex = needDown.indexOf(i)
          var percent = myIndex * 100 / needDown.length;
          //console.log(percent)
          progs.style.width = percent.toString() + '%'
          await downloadFile(link, fpath)
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
    //console.log(this.resolve())
    return this.lwjglnum;
  }

  async downloadNatives() {
    logger.innerHTML = 'Downloading Natives';

    // Download lwjgl if it isnt there
    var lwjglLink = `https://raw.githubusercontent.com/gl91306/lunar/master/lwjgl${this.getLwjglNum()}arm${bitness}.zip`;
    var lwjglPath = path.join(minecraftpath, `natives/lwjgl${this.getLwjglNum()}arm${bitness}`);
    if (!fs.existsSync(lwjglPath)) {
      exist(lwjglPath);
      const outFile = path.join(minecraftpath, 'natives', `lwjgl${this.getLwjglNum()}arm${bitness}.zip`);
      const writer = fs.createWriteStream(outFile);

      progs.style.display = "";

      return new Promise((resolve, reject) => {
        request({
          method: 'GET',
          url: lwjglLink
        })
          .on('response', (response) => {
            let received_bytes = 0;
            const total_bytes = parseInt(response.headers['content-length'], 10);

            response.on('data', (chunk) => {
              received_bytes += chunk.length;
              const percentage = (received_bytes * 100) / total_bytes;
              progs.style.width = `${percentage}%`
              console.log(`${percentage.toFixed(2)}% | ${received_bytes} bytes out of ${total_bytes} bytes.`);
            });

            response.on('end', async () => {
              console.log(`lwjgl downloaded to ${outFile}`);
              // Extract lwjgl
              console.log('Extracting lwjgl...');
              const outpath = await extractFile(outFile, lwjglPath);
              console.log('lwjgl extracted.', outpath);

              // Clean up downloaded files
              console.log('Cleaning up downloaded files...');
              deleteFile(outFile);
              console.log('Downloaded files cleaned up.');
              resolve(true);
            });
          })
          .on('error', (err) => {
            fs.unlink(outFile, () => {
              console.error('Download failed:', err.message);
              resolve(false);
            });
          })
          .pipe(writer);
      })
    }
    logger.innerHTML = 'Finished';
    console.log("lwjglnum is", this.getLwjglNum())
  }

  getNativesPath() {
    let lwjglPath;
    switch (platform) {
      case "win32":
        lwjglPath = path.join(minecraftpath, 'natives', `lwjgl${this.getLwjglNum()}win32${bitness}`);
        break;
      case 'darwin':
        lwjglPath = path.join(minecraftpath, 'natives', `lwjgl${this.getLwjglNum()}darwin${bitness}`);
        break;
      case 'linux':
        lwjglPath = path.join(minecraftpath, 'natives', `lwjgl${this.getLwjglNum()}arm${bitness}`);
        break;
      default:
        break;
    }
    return lwjglPath;
  }

  createArgumentsSubstitutor(selectedProfile) {
    var args = {};
    args["auth_access_token"] = mcjson.accounts[uuid].accessToken;
    args["user_properties"] = {};
    args["user_property_map"] = '';
    if (localStorage.getItem('currentuser') != null || localStorage.getItem('currentuser') != undefined) {
      args["auth_player_name"] = mcjson.accounts[uuid].mcusername;
      args["auth_uuid"] = uuid;
      args["user_type"] = mcjson.accounts[uuid].type.toLowerCase();
    } else {
      args["auth_player_name"] = "TechnobladeNeverDies";
      args["auth_uuid"] = "b876ec32e396476ba1158438d83c67d4";
      args["user_type"] = "msa";
    }
    // Todo: add profiles
    args["profile_name"] = selectedProfile.getName();
    args["version_name"] = this.getId();
    args["game_directory"] = minecraftpath;
    args["library_directory"] = path.join(minecraftpath, "libraries");
    args["game_assets"] = path.join(minecraftpath, "assets");
    args["assets_root"] = path.join(minecraftpath, "assets");
    args["assets_index_name"] = this.resolve().assetIndex.id;
    args["version_type"] = this.getType();
    // Todo: add selectable profiles
    if (selectedProfile.getResolution() != undefined) {
      args["resolution_width"] = selectedProfile.getResolution()[0];
      args["resolution_height"] = selectedProfile.getResolution()[1];
    } else {
      args["resolution_width"] = "854";
      args["resolution_height"] = "480";
    }
    args["language"] = "en-us";
    args["launcher_name"] = "launcherpi";
    args["launcher_version"] = "1.0.1";
    // TODO! lwjgl switching
    args["natives_directory"] = this.getNativesPath();
    args["classpath"] = this.resolve().getClassPath(minecraftpath).join(`${sep}`)
    args["classpath_separator"] = `${sep}`
    args["primary_jar"] = path.join(minecraftpath, 'versions', `${this.id}/${this.getJar()}.jar`);
    args["clientid"] = "708e91b5-99f8-4a1d-80ec-e746cbb24771";
    args["auth_xuid"] = mcjson.accounts[uuid].xuid;
    return new Substitutor(args);
  }

  addArguments(type, featureMatcher, builder, substitutor) {
    if (this.arguments[Object.keys(this.arguments)[0]] != undefined) {
      //console.log(this.arguments, {})
      //console.log(this.arguments == {})
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
        if (platform == "win32") {
          builder.withArguments("-XX:HeapDumpPath=MojangTricksIntelDriversForPerformance_javaw.exe_minecraft.exe.heapdump");
          //if (platform.includes("windows10")) {
          //  builder.withArguments("-Dos.name=Windows 10", "-Dos.version=10.0");
          //}
        } else if (platform == "darwin") {
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
    var profile = new Profile("Default", path.join(__dirname, '..', 'images', 'logo.png'), this.id);
    var substitutor = this.createArgumentsSubstitutor(profile);

    let LaunchPath;
    var javaLibArgs = this.resolve().addArguments("jvm", settings.featureMatcher, this.resolve().builder, substitutor);
    var mainClass = this.getMainClass();
    var userArgs = this.resolve().addArguments("game", settings.featureMatcher, this.resolve().builder, substitutor);
    //console.log(javaLibArgs)
    //console.log(mainClass)
    //console.log(userArgs)
    LaunchPath = `${javaLibArgs} ${mainClass} ${userArgs}`;
    console.log(LaunchPath);
    return LaunchPath;
  }

  async launch() {
    await this.downloadJava();
    console.log("java done");
    await this.downloadLibraries();
    console.log("libs done");
    await this.downloadNatives();
    console.log("natives done");
    await this.downloadALLAssets();
    console.log("gamefiles done");
    await this.downloadClientJar();
    console.log("client done");
    progs.style.display = "none";
    var args = this.getFullLaunchPath().split(" ");
    //console.log(javaPath);
    //console.log(javaPath, args.toString())
    var minecraft = spawn(javaPath, args, {
      env: {
        ...process.env,
        MESA_GL_VERSION_OVERRIDE: "4.6"
      }
    })
    logger.innerHTML = 'Game has launched';
    minecraft.stdout.setEncoding('utf8');
    minecraft.stdout.on('data', function (data) {
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

async function launch() {
  logger.innerHTML = 'Launching...';
  exist(minecraftpath)
  exist(minecraftpath + '/libraries')
  exist(minecraftpath + '/versions')
  exist(minecraftpath + '/assets/indexes')
  exist(minecraftpath + '/assets/objects')
  selectedversionthing = document.getElementById('subject').options[document.getElementById('subject').selectedIndex].text
  if (selectedversionthing == "Installed:" || selectedversionthing == "") {
    logger.innerHTML = 'Please choose a version';
    return;
  }
  exist(minecraftpath + '/versions/' + selectedversionthing)
  var minecraftjson
  if (!fs.existsSync(path.join(minecraftpath, 'versions', selectedversionthing, selectedversionthing + '.json'))) {
    var myurl
    for (var i in rawdata.versions) {
      if (rawdata.versions[i].id == selectedversionthing) {
        myurl = rawdata.versions[i].url
      }
    }

    await downloadFile(myurl, path.join(minecraftpath, 'versions', selectedversionthing, selectedversionthing + '.json'))
  }
  logger.innerHTML = 'fixed empty directories';
  minecraftjson = require(path.join(minecraftpath, 'versions', selectedversionthing, selectedversionthing + '.json'));

  var version = new MinecraftVersion(minecraftjson);
  version.launch();
};

// Check for current installed versions:
fs.readdir(path.join(minecraftpath, 'versions'), function (err, files) {
  if (err) {
    return console.log('Unable to scan directory: ' + err);
  }
  //listing all files using forEach
  console.log('current installed versions', files);
  versionlist = files
  for (var i in files) {
    const versions = document.createElement("option");
    //console.log(i)
    const versionname = files[i];
    versions.innerHTML = versionname;

    const versionselect = document.getElementById("subject");
    versionselect.appendChild(versions);
  }
  document.getElementById("subject").appendChild(document.createElement("option"));
});

var rawdata, rawraw = [];
fetch('https://launchermeta.mojang.com/mc/game/version_manifest.json', {
  'method': 'GET'
})
  .then(response => response.json())
  .then(data => {
    for (var i in data.versions) {
      rawraw.push(data.versions[i].id)
    }
    console.log(data)
    rawdata = data
    versionlistraw = rawraw
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
  });

launchBtn.addEventListener("click", async () => {
  launch();
});