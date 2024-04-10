<p align="center" style="margin-bottom: 0px !important;">
  <img width="200" src="https://github.com/gl91306/launcherpi/blob/new-code/renderer/images/icon.png?raw=true" alt="Launcher Pi Logo" align="center">
</p>
<h1 align="center" style="margin-top: 0px;">A Minecraft Launcher for Raspberry Pi computers.</h1>

# Big thanks to:
- klopix for MS account testing

## Things that work:
 - Microsoft accounts (MSA)
 - Multiple accounts
 - All versions from 1.5 to 1.19, excluding snaphots (Actually all the snapshots from 1.13 and above work, just not from 1.12 and below)
 - Forge. Every single forge version should work as well
 - Optifine (The standalone launcher, not the forge mod)
 - 64 bit and 32 bit

## Things that do not work:
- Mojang Account sign in (removed as MC only works with MSA now)
- Realms (until we can figure out the --session token realms and sometimes servers do not work)

## Working on:
 - A settings menu (You cant change things like java path, args, ram, etc)

## Things that are untested:
 - Fabric (and all its included mods)
 - Other non Forge/Fabric mod loaders and their mods
 - Standalone mods (eg LabyMod)
we need testers, if you can please open an issue and document what you tried and if it worked

How to install
 - Make sure npm and node are installed
```
git clone https://github.com/gl91306/launcherpi.git
cd launcherpi
npm i
npm start
```
