const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
    'ipcRender', {
    send: (message) => {
        ipcRenderer.send('code', message);
    }
});

const loginBackground = "https://cdn.oxmc-servers.online/uploads/images/wallpaper_minecraft_pc_bundle_2058x1440.png";

window.addEventListener('DOMContentLoaded', async () => {
    var main = document.getElementById("middle");

    if (main) {
        main.style.backgroundImage = `url('${loginBackground}')`;
        main.style.backgroundRepeat = "none";
        main.style.backgroundPosition = "center center";
        main.style.backgroundSize = "cover";
    }

    function gup(name) {
        name = name.replace(/[\[]/, "\\\[").replace(/[\]]/, "\\\]");
        var regexS = "[\\?&]" + name + "=([^&#]*)";
        var regex = new RegExp(regexS);
        var results = regex.exec(window.location.href);
        if (results == null)
            return "";
        else
            return decodeURIComponent(results[1].replace(/\+/g, " "));
    };

    //console.log(window.location);

    if (window.location.host == "login.live.com" && window.location.origin === "https://login.live.com" && window.location.pathname == "/oauth20_desktop.srf") {
        let code = gup('code');
        if (code) {
            console.log("Auth code is: ", code);
            ipcRenderer.send('code', code);
        } else {
            ipcRenderer.send('code', 'none');
        };
    };
});