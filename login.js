Object.size = function(obj) {
  return Object.keys(obj).length;
}

storage = window.localStorage
//storage.setItem('currentuser', 'Undefined')

// Yoinked directly from portablemc.py, so all credit for this id goes to the makers of portablemc
//var MS_AZURE_APP_ID = "708e91b5-99f8-4a1d-80ec-e746cbb24771"

const request = require('request-promise');
var output = document.getElementById('output');
var email = document.getElementById("email")
var pass = document.getElementById("pass")
const fs = require('fs')
const os = require("os");
const webview = require('webview')
const  session  = require('electron')
console.log(session)
const homedir = os.homedir();
var minecraftpath = homedir + "/.minecraft"
console.log(minecraftpath)
var correctlog
const https = require('https');
const { stringify } = require('querystring');

uuid = localStorage.getItem('currentuser')
allaccounts = localStorage.getItem('allaccs')
console.log(uuid)
if (fs.existsSync(minecraftpath + "/pilauncher_accounts.json")) {
  document.querySelector("body > span > p:nth-child(5)").style.display = '';
  document.getElementById('accounts').style.display = '';
  const fileName = minecraftpath + "/pilauncher_accounts.json";
  const mcjson = require(fileName);
  if (mcjson.accounts === undefined || mcjson.accounts === "undefined") {
    console.log(mcjson.accounts)
    document.getElementById("logout").disabled = true
    document.getElementById("accounts").style.display = 'none';
    console.log("No accounts in json file")
  } else if (Object.keys(mcjson.accounts).length == 0) {
    console.log(mcjson.accounts)
    document.getElementById("logout").disabled = true
    document.querySelector("body > span > p:nth-child(5)").style.display = 'none';
    document.getElementById("accounts").style.display = 'none';
    console.log("No accounts in json file")
  } else {
    console.log(mcjson.accounts)
    document.getElementById("logout").disabled = false
    document.getElementById("accounts").style.display = '';
    var allaccounts = JSON.parse(localStorage.getItem('allaccs'));
    console.log(localStorage.getItem('allaccs'))
    if (localStorage.getItem('allaccs') == null) {
      const allaccs = []
      for (var name in mcjson.accounts) {
        allaccs.push(name)
      }
      console.log(allaccs)
      localStorage.setItem("allaccs", JSON.stringify(allaccs));
    }
    console.log(allaccounts)
    for (i in allaccounts) {
      console.log(i)
      thingy = allaccounts[i]
      var option = document.createElement("option");
      const fileName = minecraftpath + "/pilauncher_accounts.json";
      const mcjson = require(fileName);
      username = mcjson.accounts[thingy].username
      console.log(username)
      option.text = username;
      option.value = thingy;
      option.className = "allaccs"
      option.id = thingy
      document.getElementById("accounts").appendChild(option);
    }
  }
} else if (uuid === undefined || uuid === null || uuid === "undefined" || uuid === "null" || fs.existsSync(minecraftpath + "/pilauncher_accounts.json") == false) {
  document.getElementById("logout").disabled = true
  document.querySelector("body > span > p:nth-child(5)").style.display = 'none';
  document.getElementById('accounts').style.display = 'none';
  console.log("No account to log out from")
} else if (uuid != undefined || uuid != null) {
  console.log('what')
}
document.getElementById('accounts').addEventListener('change', function() {
  storage.setItem('currentuser', this.value)
});
function createauthfile(path) {
  var defaultdict = {
    accounts: {

    }
  }
  var dictstring = JSON.stringify(defaultdict, null, 2);
  fs.writeFile(path, dictstring, function(err, result) {
    if(err) console.log('error', err);
})
}

function sendreq(method, hostname, path, headers, data) {
  console.log("sending...")
  const jsondata = JSON.stringify(data)
  
  const options = {
    hostname: hostname,
    path: path,
    method: method,
    headers: headers
  }
  if (path == '/authenticate') {
    console
    const req = https.request(options, res => {
      var body = ''
      res.on('data', (d)=>{
          body+=d;
      });
      res.on('end', ()=>{
          resp = JSON.parse(body);
          console.log(resp);
          if (resp.selectedProfile === undefined) {
            correctlog = false
            console.log("Incorrect credentials!")
            output.innerHTML = "Incorrect credentials!"
          } else if (resp.selectedProfile.id != undefined) {
            output.innerHTML = "Login verified!"
            parser(resp, 'Login')
          }
  
      })
    })
    req.on('error', error => {
      console.error(error)
    })
    
    req.write(jsondata)
    req.end()
    return data
  } else if (path == '/invalidate') {
    const req = https.request(options, res => {
      var body = ''
      res.on('data', (d)=>{
          body+=d;
      });
      res.on('end', ()=>{
          resp = body
          console.log(resp);
          if (resp == '') {
            const allaccs = []
            const uuid = localStorage.getItem('currentuser')
            const fileName = minecraftpath + "/pilauncher_accounts.json";
            const mcjson = require(fileName);
            delete mcjson.accounts[localStorage.getItem('currentuser')]
            fs.writeFile(fileName, JSON.stringify(mcjson, null, 2), function writeJSON(err) {
              if (err) return console.log(err);
              //console.log(JSON.stringify(mcjson));
              console.log('writing to ' + fileName);
            });
            //storage.removeItem('allaccs');
            for (var name in mcjson.accounts) {
              allaccs.push(name)
            }
            console.log(allaccs)
            localStorage.setItem("allaccs", JSON.stringify(allaccs));
            var allaccounts = JSON.parse(localStorage.getItem('allaccs'));
            if (mcjson.accounts[uuid] === undefined) {
              document.getElementById("logout").disabled = true
              output.innerHTML = "No accounts to log out from!"
            } else {
              output.innerHTML = "Logged out sucessfully!"
              document.getElementById("logout").disabled = false
            }
            localStorage.setItem('currentuser', allaccounts[0])
            console.log("logged out!")
          } else if (resp != '') {
            console.log("idk error?")
            console.log(resp)
          }
  
      })
    })
    req.on('error', error => {
      console.error(error)
    })
    console.log(jsondata)
    req.write(jsondata)
    req.end()
    return data
  }
  
  
  
}
function parser(myjson, type) {
  if (type == "Login") {
    accessToken = myjson.accessToken
    clientToken = myjson.clientToken
    id = myjson.selectedProfile.id
    username = myjson.selectedProfile.name
    accountjson = {
      [id]: {
        "accessToken": accessToken,
        "clientToken": clientToken,
        "uuid": id,
        "username": username,
        "type": "mojang",
        'xuid': 'idk'
      }
    }
    console.log(accountjson)
    const fileName = minecraftpath + "/pilauncher_accounts.json";
    const mcjson = require(fileName);
    console.log(mcjson.accounts[myjson.selectedProfile.id])
    console.log(myjson.selectedProfile.id)
    var allaccs = [];
    if (mcjson.accounts[myjson.selectedProfile.id] === undefined || mcjson.accounts[myjson.selectedProfile.id].uuid != myjson.selectedProfile.id) {
      mcjson.accounts = accountjson
      fs.writeFile(fileName, JSON.stringify(mcjson, null, 2), function writeJSON(err) {
        if (err) return console.log(err);
        //console.log(JSON.stringify(mcjson));
        console.log('writing to ' + fileName);
      });
      for (var name in mcjson.accounts) {
        allaccs.push(name)
      }
      console.log(allaccs)
      localStorage.setItem("allaccs", JSON.stringify(allaccs));
      document.getElementById("logout").disabled = false
    } else if (mcjson.accounts[myjson.selectedProfile.id].uuid == myjson.selectedProfile.id) {
      console.log("account aldready logged in!")
      mcjson.accounts = accountjson
      fs.writeFile(fileName, JSON.stringify(mcjson, null, 2), function writeJSON(err) {
        if (err) return console.log(err);
        //console.log(JSON.stringify(mcjson));
        console.log('writing to ' + fileName);
      });
      for (var name in mcjson.accounts) {
        allaccs.push(name)
      }
      console.log(allaccs)
      localStorage.setItem("allaccs", JSON.stringify(allaccs));
      output.innerHTML = "Account aldready logged on!"
    }
    storage.setItem('currentuser', myjson.selectedProfile.id)
  }
}

function parserms(myjson, type) {
  if (type == "Microsoft") {
    accessToken = myjson.accessToken
    refreshToken = myjson.refreshToken
    id = myjson.uuid
    username = myjson.username
    accountjson = {
      [id]: {
        "accessToken": accessToken,
        "clientToken": refreshToken,
        "refreshToken": refreshToken,
        "uuid": id,
        "username": username,
        "type": "msa",
        'xuid': myjson.xuid
      }
    }
    console.log(accountjson)
    const fileName = minecraftpath + "/pilauncher_accounts.json";
    const mcjson = require(fileName);
    var allaccs = [];
    if (mcjson.accounts[id] === undefined || mcjson.accounts[id].uuid != id) {
      mcjson.accounts = accountjson
      fs.writeFile(fileName, JSON.stringify(mcjson, null, 2), function writeJSON(err) {
        if (err) return console.log(err);
        //console.log(JSON.stringify(mcjson));
        console.log('writing to ' + fileName);
      });
      for (var name in mcjson.accounts) {
        allaccs.push(name)
      }
      console.log(allaccs)
      localStorage.setItem("allaccs", JSON.stringify(allaccs));
      document.getElementById("logout").disabled = false
    } else if (mcjson.accounts[id].uuid == id) {
      console.log("account aldready logged in!")
      mcjson.accounts = accountjson
      fs.writeFile(fileName, JSON.stringify(mcjson, null, 2), function writeJSON(err) {
        if (err) return console.log(err);
        //console.log(JSON.stringify(mcjson));
        console.log('writing to ' + fileName);
      });
      for (var name in mcjson.accounts) {
        allaccs.push(name)
      }
      console.log(allaccs)
      localStorage.setItem("allaccs", JSON.stringify(allaccs));
      output.innerHTML = "Account aldready logged on!"
    }
    storage.setItem('currentuser', id)
  }
}

document.getElementById("exit").addEventListener("click", function (e) {
  window.close();
});

document.getElementById("login").addEventListener("click", function (e) {
  console.log(email.value)

  if (!(fs.existsSync(minecraftpath + "/pilauncher_accounts.json"))) {
    console.log(minecraftpath + "/pilauncher_accounts.json","doesnt exist!")
    createauthfile(minecraftpath + "/pilauncher_accounts.json")
    console.log(minecraftpath + "/pilauncher_accounts.json","exists!")
    sendreq('POST', 'authserver.mojang.com', '/authenticate', {
      'Content-Type': 'application/json'
    }, {
      "agent": {                              // defaults to Minecraft
          "name": "Minecraft",                // For Mojang's other game Scrolls, "Scrolls" should be used
          "version": 1                        // This number might be increased
                                              // by the vanilla client in the future
      },
      "username": email.value,      // Can be an email address or player name for
                                              // unmigrated accounts
      "password": pass.value,
      "requestUser": true                     // optional; default: false; true adds the user object to the response
    })
  } else if (fs.existsSync(minecraftpath + "/pilauncher_accounts.json")) {
    console.log(minecraftpath + "/pilauncher_accounts.json","exists!")
    sendreq('POST', 'authserver.mojang.com', '/authenticate', {
      'Content-Type': 'application/json'
    }, {
      "agent": {                              // defaults to Minecraft
          "name": "Minecraft",                // For Mojang's other game Scrolls, "Scrolls" should be used
          "version": 1                        // This number might be increased
                                              // by the vanilla client in the future
      },
      "username": email.value,      // Can be an email address or player name for
                                              // unmigrated accounts
      "password": pass.value,
      "requestUser": true                     // optional; default: false; true adds the user object to the response
    })
  }
});

document.getElementById("logout").addEventListener("click", function (e) {
  console.log(email.value)
  const fileName = minecraftpath + "/pilauncher_accounts.json";
  const mcjson = require(fileName);
  uuid = localStorage.getItem('currentuser')
  var accessToken
  var clientToken
  console.log(uuid)
  if (uuid === undefined || uuid === null) {
    document.getElementById("logout").disabled = true
    console.log("No account to log out from")
  } else {
    document.getElementById("logout").disabled = false
    accessToken = mcjson.accounts[uuid].accessToken
    clientToken = mcjson.accounts[uuid].clientToken
  }

  if (!(fs.existsSync(minecraftpath + "/pilauncher_accounts.json"))) {
    console.log(minecraftpath + "/pilauncher_accounts.json","doesnt exist!")
    createauthfile(minecraftpath + "/pilauncher_accounts.json")
    console.log(minecraftpath + "/pilauncher_accounts.json","exists!")
    console.log(accessToken)
    sendreq('POST', 'authserver.mojang.com', '/invalidate', {
      'Content-Type': 'application/json'
    }, {
      "accessToken": accessToken,
      "clientToken": clientToken
    })
  } else if (fs.existsSync(minecraftpath + "/pilauncher_accounts.json")) {
    console.log(minecraftpath + "/pilauncher_accounts.json","exists!")
    console.log(accessToken)
    sendreq('POST', 'authserver.mojang.com', '/invalidate', {
      'Content-Type': 'application/json'
    }, {
      "accessToken": accessToken,
      "clientToken": clientToken
    })
  }
});

document.getElementById("loginms").addEventListener("click", function (e) {
  console.log(email.value)

  if (!(fs.existsSync(minecraftpath + "/pilauncher_accounts.json"))) {
    fs.mkdirSync(minecraftpath + "/pilauncher_accounts.json", { recursive: true });
  }
  console.log(minecraftpath + "/pilauncher_accounts.json","exists!")
  mywin = window.open('https://login.live.com/oauth20_authorize.srf?client_id=000000004C12AE6F&response_type=code&redirect_uri=https://login.live.com/oauth20_desktop.srf&scope=XboxLive.signin%20offline_access&state=NOT_NEEDED', '_blank', 'frame=false,nodeIntegration=no')
  console.log(mywin)
  //mywin.eval(document.cookie.split(";").forEach(function(c) { document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); }))
  console.log(mywin.location.href)
  while (!(mywin.location.href.includes('https://login.live.com/oauth20_desktop.srf?code='))) {
    //console.log(mywin.location.href)
  }
  console.log(mywin.location.href)
  result = mywin.location.href.slice(48)
  console.log(result)
  code = result.split("&")[0]
  mywin.close()
  console.log(code)
  almost = ''
  var msaccessToken;
  var refreshToken;
  bill = request.post('https://login.live.com/oauth20_token.srf', {
    form: {
      client_id: '000000004C12AE6F',
      redirect_uri: 'https://login.live.com/oauth20_desktop.srf',
      code: code,
      grant_type: 'authorization_code'
    }
  }).then(function (output) {
    almost = output;
    allmost = JSON.parse(almost)
    msaccessToken = allmost.access_token
    refreshToken1 = allmost.refresh_token
    console.log(refreshToken1)
    console.log(msaccessToken)
    data = {
      "Properties": {
          "AuthMethod": "RPS",
          "SiteName": "user.auth.xboxlive.com",
          "RpsTicket": "d=" + msaccessToken // your access token from step 2 here
      },
      "RelyingParty": "http://auth.xboxlive.com",
      "TokenType": "JWT"
    }
    fetch('https://user.auth.xboxlive.com/user/authenticate', {
      method: 'POST', // or 'PUT'
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(data),
    }).then(response => response.json())
    .then(data => {
      var refreshToken2 = refreshToken1
      xboxToken = data.Token
      xboxUHS = data.DisplayClaims.xui[0].uhs
      console.log(xboxToken)
      console.log(xboxUHS)
      data1 = {
        "Properties": {
            "SandboxId": "RETAIL",
            "UserTokens": [
                xboxToken // from above
            ]
        },
        "RelyingParty": "rp://api.minecraftservices.com/",
        "TokenType": "JWT"
      }
      fetch('https://xsts.auth.xboxlive.com/xsts/authorize', {
        method: 'POST', // or 'PUT'
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(data1),
      }).then(response => response.json())
      .then(data => {
        var refreshToken3 = refreshToken2
        console.log(data)
        xstsToken = data.Token
        console.log(xstsToken)
        data2 = {
          "identityToken": "XBL3.0 x=" + xboxUHS + ";" + xstsToken
        }
        fetch('https://api.minecraftservices.com/authentication/login_with_xbox', {
          method: 'POST', // or 'PUT'
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(data2),
        }).then(response => response.json())
        .then(data => {
          var refreshToken = refreshToken3
          console.log(data)
          accessToken = data.access_token
          console.log(accessToken)
          console.log(refreshToken)
          fetch('https://api.minecraftservices.com/entitlements/mcstore', {
            method: 'GET', // or 'PUT'
            headers: {
              'Authorization': 'Bearer ' + accessToken
            }
          }).then(response => response.json())
          .then(data => {
            console.log(data)
            if (data.items.length == 0) {
              console.log("no minecraft bought")
              document.getElementById('output').innerHTML = "No Minecraft Account Associated with this Account!"
            } else if (data.items.length != 0) {
              document.getElementById('output').innerHTML = "Login Verified!"
              console.log("YAYY! MINECRAft")
              fetch('https://api.minecraftservices.com/minecraft/profile', {
                method: 'GET', // or 'PUT'
                headers: {
                  'Authorization': 'Bearer ' + accessToken
                }
              }).then(response => response.json)
              .then(data => {
                console.log(data)
                msparserjsdata = {
                  'acessToken': accessToken,
                  'refreshToken': refreshToken,
                  'uuid': data.id,
                  'username': data['name'],
                  'xuid': xboxUHS
                }
                parserms(msparserjsdata, 'Microsoft')
              })
            }
          })
        })
      })
    })
  })
});