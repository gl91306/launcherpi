# ![pilauncher_logo](https://github.com/gl91306/launcherpi/blob/new-code/renderer/images/icon.png?raw=true) launcherpi 
A Minecraft Launcher for Raspberry Pi computers.
# ALSO BIG THANKS TO KLOPIX FOR MS ACCOUNT TESTINGGG
# WE NEED TESTERS FOR FABRIC AND LABYMOD. IF YOU WANT TO TEST TRY USING THESE MODLOADERS WITH LAUNCHERPI AND OPEN AN ISSUE TO TELL ME IF IT WORKS OR NOT
Things that work:
 - Mojang accounts [No longer used]
 - Microsoft accounts
 - Multiple accounts
 - All versions from 1.5 to 1.19, excluding snaphots (Actually all the snapshots from 1.13 and above work, just not from 1.12 and below)
 - Forge. Every single forge version should work as well
 - Using a diffrent microsoft account to log in
 - Optifine (The standalone launcher, not the forge mod)
 - 64 bit and 32 bit

Things that dont work:
 - A settings menu (You cant change things like java path, args, ram, etc)

Things that are untested:
 - Fabric (and all its included mods)
 - Other non Forge/Fabric mod loaders and their mods
 - Standalone mods (eg LabyMod)

How to install
 - Make sure npm and node are installed
```
git clone https://github.com/gl91306/launcherpi.git
cd launcherpi
npm i
npm start
```
