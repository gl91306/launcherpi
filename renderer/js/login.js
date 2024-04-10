const { BrowserWindow, ipcMain, session } = require('@electron/remote');
const axios = require('axios');
const fs = require("fs");
const os = require("os");
const path = require("path");

Object.size = function (obj) {
    return Object.keys(obj).length;
}

storage = window.localStorage;
//storage.setItem('currentuser', 'Undefined');

// Yoinked directly from portablemc.py, so all credit for this id goes to the makers of portablemc
//var MS_AZURE_APP_ID = "708e91b5-99f8-4a1d-80ec-e746cbb24771";
const APP_client_id = '000000004C12AE6F';

var output = document.getElementById('output');
var acc = document.getElementById("accounts");
var cacc = document.getElementById('chooseanacc');

//console.log(session);
const homedir = os.homedir();
var minecraftpath = path.join(homedir, ".minecraft");
var pilauncher_accountJson = path.join(minecraftpath, "pilauncher_accounts.json");
console.log("MC Path:", minecraftpath);

uuid = localStorage.getItem('currentuser');
allaccounts = localStorage.getItem('allaccs');
//console.log(uuid);

// Ensure auth file exists:
if (!(fs.existsSync(pilauncher_accountJson))) {
    createauthfile(pilauncher_accountJson);
};

function displayAccount(mcuserid) {
    //console.log(mcuserid);
    const mcjson = require(pilauncher_accountJson);
    var activeSkin, username;
    var user_div = document.createElement("div");
    var username_text = document.createElement("p");
    var mc_username_text = document.createElement("small");
    var user_skin_preview = document.createElement("div");
    username = mcjson.accounts[mcuserid].mcusername;
    activeSkin = mcjson.accounts[mcuserid].textures && mcjson.accounts[mcuserid].textures.skins ? mcjson.accounts[mcuserid].textures.skins.find(skin => skin.state === "ACTIVE") : null;
    username_text.innerText = username;
    username_text.style.marginLeft = "10px";
    //mc_username_text.innerText = username;
    //mc_username_text.style.marginLeft = "10px";
    user_div.className = "account-hover-overlay";
    user_div.id = mcuserid;
    user_div.style.display = "inline-flex";
    if (activeSkin != null) {
        user_skin_preview.classList = "mc-face-viewer-8x";
        user_skin_preview.style.backgroundImage = `url('${activeSkin.url.replace(/^http:/, 'https:')}')`;
    } else {
        user_skin_preview.style.width = "64px";
        user_skin_preview.style.backgroundImage = `url('fa/6.4.2/svgs/solid/circle-question.svg')`;
        user_skin_preview.style.backgroundRepeat = 'no-repeat';
    };
    user_div.appendChild(user_skin_preview);
    user_div.appendChild(username_text);
    //user_div.appendChild(mc_username_text);
    user_div.addEventListener("click", () => {
        storage.setItem('currentuser', mcuserid);
        console.log("Set user id to:", mcuserid);
        window.location.href = path.join(__dirname, 'launch.html');
    });
    acc.appendChild(user_div);
};

function listAccounts() {
    const mcjson = require(path.join(minecraftpath, "pilauncher_accounts.json"));
    console.log("Availible accounts: ", mcjson.accounts);
    //document.getElementById("logout").disabled = false;
    acc.style.display = '';
    var allaccounts = JSON.parse(localStorage.getItem('allaccs'));
    console.log(localStorage.getItem('allaccs'));
    if (localStorage.getItem('allaccs') == null || localStorage.getItem('allaccs') == undefined) {
        const allaccs = []
        for (var name in mcjson.accounts) {
            allaccs.push(name)
        }
        console.log(allaccs)
        localStorage.setItem("allaccs", JSON.stringify(allaccs));
    };
    console.log(allaccounts);
    for (i in allaccounts) {
        //console.log(i)
        mcuserid = allaccounts[i];
        //console.log(mcuserid);
        displayAccount(mcuserid);
    };
};

if (fs.existsSync(pilauncher_accountJson)) {
    cacc.style.display = '';
    acc.style.display = '';

    const mcjson = require(path.join(minecraftpath, "pilauncher_accounts.json"));

    if (!mcjson.accounts || Object.keys(mcjson.accounts).length === 0) {
        //console.log(mcjson.accounts);
        //document.getElementById("logout").disabled = true;
        acc.style.display = 'none';
        console.log("No accounts in json file");
    } else {
        listAccounts();
    }
} else if (!uuid || !fs.existsSync(pilauncher_accountJson)) {
    //document.getElementById("logout").disabled = true;
    acc.style.display = 'none';
    console.log("No account to log out from");
    createauthfile(pilauncher_accountJson);
}

function createauthfile(path) {
    var defaultdict = {
        accounts: {}
    }
    var dictstring = JSON.stringify(defaultdict, null, 2);
    fs.writeFile(path, dictstring, function (err, result) {
        if (err) console.log('error', err);
    });
}

function parserms(myjson) {
    //console.log(myjson)
    accessToken = myjson.accessToken;
    refreshToken = myjson.refreshToken;
    id = myjson.uuid;
    //username = myjson.username;
    mcusername = myjson.mcusername;
    accountjson = {
        [id]: {
            "accessToken": accessToken,
            "uuid": id,
            //"username": username,
            "mcusername": mcusername,
            "type": "msa",
            'xuid': myjson.xuid,
            "textures": myjson.textures
        }
    };
    //console.log(accountjson)
    const mcjson = require(pilauncher_accountJson);
    var allaccs = [];
    if (mcjson.accounts[id] === undefined || mcjson.accounts[id].uuid != id) {
        mcjson.accounts = accountjson;
        fs.writeFile(pilauncher_accountJson, JSON.stringify(mcjson, null, 2), function writeJSON(err) {
            if (err) return console.log(err);
            //console.log(JSON.stringify(mcjson));
            console.log('writing to ' + pilauncher_accountJson);
        });
        for (var name in mcjson.accounts) {
            allaccs.push(name);
        };
        console.log(allaccs);
        localStorage.setItem("allaccs", JSON.stringify(allaccs));
        acc.innerHTML = "";
        listAccounts();
        //document.getElementById("logout").disabled = false;
    } else if (mcjson.accounts[id].uuid == id) {
        console.log("Account already logged in!");
        output.innerHTML = "Account already logged in.";
    };
    storage.setItem('currentuser', id);
};

document.getElementById("loginms").addEventListener("click", async function (e) {
    var msaccessToken, refreshToken, xboxToken, xboxUHS, xstsToken, accessToken;

    if (!(fs.existsSync(pilauncher_accountJson))) {
        createauthfile(pilauncher_accountJson);
    };

    await session.defaultSession.clearStorageData({
        origin: "login.live.com",
        storages: ['cookies', 'caches', 'indexdb']
    });

    const LoginWithXboxWindow = new BrowserWindow({ modal: true, show: false, autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'js', 'xbox-login-preload.js') } });
    LoginWithXboxWindow.loadURL(`https://login.live.com/oauth20_authorize.srf?client_id=${APP_client_id}&response_type=code&redirect_uri=https://login.live.com/oauth20_desktop.srf&scope=XboxLive.Signin%20XboxLive.offline_access&state=NOT_NEEDED`);
    LoginWithXboxWindow.once('ready-to-show', () => {
        LoginWithXboxWindow.show();
    });
    ipcMain.on('code', (event, message) => {
        //console.log(event, message);
        if (message !== "none") {
            const formData = new URLSearchParams();
            formData.append('client_id', APP_client_id);
            formData.append('redirect_uri', 'https://login.live.com/oauth20_desktop.srf');
            formData.append('code', message);
            formData.append('grant_type', 'authorization_code');
            axios.post('https://login.live.com/oauth20_token.srf', formData).then(response => {
                //console.log(response.data);
                const resp = response.data;
                msaccessToken = resp.access_token;
                refreshToken = resp.refresh_token;
                console.log("MS Account Token:", msaccessToken);
                console.log("Refresh Token:", refreshToken);

                const data = {
                    "Properties": {
                        "AuthMethod": "RPS",
                        "SiteName": "user.auth.xboxlive.com",
                        "RpsTicket": "d=" + msaccessToken
                    },
                    "RelyingParty": "http://auth.xboxlive.com",
                    "TokenType": "JWT"
                };

                return axios.post('https://user.auth.xboxlive.com/user/authenticate', data, {
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }
                });
            }).then(response => {
                xboxToken = response.data.Token;
                xboxUHS = response.data.DisplayClaims.xui[0].uhs;
                console.log("Xbox Token:", xboxToken);
                console.log("Xbox UHS:", xboxUHS);

                const data1 = {
                    "Properties": {
                        "SandboxId": "RETAIL",
                        "UserTokens": [
                            xboxToken
                        ]
                    },
                    "RelyingParty": "rp://api.minecraftservices.com/",
                    "TokenType": "JWT"
                };

                return axios.post('https://xsts.auth.xboxlive.com/xsts/authorize', data1, {
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }
                });
            }).then(response => {
                xstsToken = response.data.Token;
                console.log("xstsToken:", xstsToken);

                const data2 = {
                    "identityToken": "XBL3.0 x=" + xboxUHS + ";" + xstsToken
                };

                return axios.post('https://api.minecraftservices.com/authentication/login_with_xbox', data2, {
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }
                });
            }).then(response => {
                accessToken = response.data.access_token;
                console.log("Access Token:", accessToken);
                console.log("Refresh Token:", refreshToken);

                return axios.get('https://api.minecraftservices.com/entitlements/mcstore', {
                    headers: {
                        'Authorization': 'Bearer ' + accessToken
                    }
                });
            }).then(response => {
                if (response.data.items.length == 0) {
                    console.log("no minecraft bought");
                    output.innerHTML = "No Minecraft Account Associated with this Account!";
                } else if (response.data.items.length != 0) {
                    output.innerHTML = "Login Verified!";
                    return axios.get('https://api.minecraftservices.com/minecraft/profile', {
                        headers: {
                            'Authorization': 'Bearer ' + accessToken
                        }
                    });
                }
            }).then(response => {
                console.log('-----------MC Account info-----------');
                console.log(response.data.id);
                console.log(response.data['name']);
                const msparserjsdata = {
                    'accessToken': accessToken,
                    'refreshToken': refreshToken,
                    'uuid': response.data.id,
                    'mcusername': response.data['name'],
                    'xuid': xboxUHS,
                    'textures': {
                        'skins': response.data.skins,
                        'capes': response.data.capes
                    }
                };
                parserms(msparserjsdata);
            }).catch(error => {
                console.error(error);
            });
        } else {
            alert("failed to login with microsoft.");
        };
        LoginWithXboxWindow.close();
    });
});