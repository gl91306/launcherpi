#!/usr/bin/env python

# encoding: utf-8

# Copyright (C) 2021  Théo Rozier
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

"""
Core module of PortableMC, it provides a flexible API to download and start Minecraft.
"""

from typing import cast, Generator, Callable, Optional, Tuple, Dict, Type, List
from http.client import HTTPConnection, HTTPSConnection, HTTPResponse
from urllib import parse as url_parse, request as url_request
from urllib.request import Request as UrlRequest
from urllib.error import HTTPError
from json import JSONDecodeError
from zipfile import ZipFile
from uuid import uuid4
from os import path
import platform
import hashlib
import shutil
import base64
import json
import sys
import os
import re


__all__ = [
    "LAUNCHER_NAME", "LAUNCHER_VERSION", "LAUNCHER_AUTHORS", "LAUNCHER_COPYRIGHT", "LAUNCHER_URL",
    "Context", "Version", "StartOptions", "Start", "VersionManifest",
    "AuthSession", "YggdrasilAuthSession", "MicrosoftAuthSession", "AuthDatabase",
    "DownloadEntry", "DownloadList", "DownloadProgress", "DownloadEntryProgress",
    "BaseError", "JsonRequestError", "AuthError", "VersionError", "JvmLoadingError", "DownloadError",
    "json_request", "json_simple_request",
    "merge_dict",
    "interpret_rule_os", "interpret_rule", "interpret_args",
    "replace_vars", "replace_list_vars",
    "get_minecraft_dir", "get_minecraft_os", "get_minecraft_arch", "get_minecraft_archbits", "get_minecraft_jvm_os",
    "can_extract_native",
    "LEGACY_JVM_ARGUMENTS"
]


LAUNCHER_NAME = "portablemc"
LAUNCHER_VERSION = "2.0.4"
LAUNCHER_AUTHORS = ["Théo Rozier <contact@theorozier.fr>", "Github contributors"]
LAUNCHER_COPYRIGHT = "PortableMC  Copyright (C) 2021  Théo Rozier"
LAUNCHER_URL = "https://github.com/mindstorm38/portablemc"


class Context:

    """
    This class is used to manage an installation context for Minecraft. This context can be reused multiple
    times to install multiple versions. A context stores multiple important paths but all these paths can be
    changed after the construction and before preparing versions.
    """

    def __init__(self, main_dir: Optional[str] = None, work_dir: Optional[str] = None):

        """
        Construct a Minecraft context. The main directory `main_dir` is used to construct versions, assets, libraries
        and JVM directories, but it is not stored afterward. The working directory `work_dir` (also named "game
        directory"), however it is stored as-is.\n
        By default `main_dir` is set to the default .minecraft (https://minecraft.fandom.com/fr/wiki/.minecraft) and
        `work_dir` is set by default to the value of `main_dir`.
        """

        main_dir = get_minecraft_dir() if main_dir is None else path.realpath(main_dir)
        self.work_dir = main_dir if work_dir is None else path.realpath(work_dir)
        self.versions_dir = path.join(main_dir, "versions")
        self.assets_dir = path.join(main_dir, "assets")
        self.libraries_dir = path.join(main_dir, "libraries")
        self.jvm_dir = path.join(main_dir, "jvm")
        self.bin_dir = path.join(self.work_dir, "bin")

    def has_version_metadata(self, version: str) -> bool:
        """ Return True if the given version has a metadata file. """
        return path.isfile(path.join(self.versions_dir, version, f"{version}.json"))

    def get_version_dir(self, version_id: str) -> str:
        return path.join(self.versions_dir, version_id)

    def list_versions(self) -> Generator[Tuple[str, int], None, None]:
        """ A generator method that yields all versions (version, mtime) that have a version metadata file. """
        if path.isdir(self.versions_dir):
            for version in os.listdir(self.versions_dir):
                try:
                    yield version, path.getmtime(path.join(self.versions_dir, version, f"{version}.json"))
                except OSError:
                    pass


class Version:

    """
    This class is used to manage the installation of a version and then run it.\n
    All public function in this class can be executed multiple times, however they might add duplicate URLs to
    the download list. The game still requires some parts to be prepared before starting.
    """

    def __init__(self, context: Context, version_id: str):

        """ Construct a new version, using a specific context and the exact version ID you want to start. """

        self.context = context
        self.id = version_id

        self.manifest: Optional[VersionManifest] = None
        self.dl = DownloadList()

        self.version_meta: Optional[dict] = None
        self.version_dir: Optional[str] = None
        self.version_jar_file: Optional[str] = None

        self.assets_index_version: Optional[int] = None
        self.assets_virtual_dir: Optional[str] = None
        self.assets_count: Optional[int] = None

        self.logging_file: Optional[str] = None
        self.logging_argument: Optional[str] = None

        self.classpath_libs: List[str] = []
        self.native_libs: List[str] = []

        self.jvm_version: Optional[str] = None
        self.jvm_exec: Optional[str] = None

    def prepare_meta(self, *, recursion_limit: int = 50):

        """
        Prepare all metadata files for this version, this take `inheritsFrom` key into account and all parents metadata
        files are downloaded. You can change the limit of parents metadata to download with the `recursion_limit`
        argument, if the number of parents exceed this argument, a `VersionError` is raised with
        `VersionError.TO_MUCH_PARENTS` and the version ID as argument. Each metadata file is downloaded (if not already
        cached) in their own directory named after the version ID, the directory is placed in the `versions_dir` of the
        context.\n
        This method will load the official Mojang version manifest, however you can set the `manifest` attribute of this
        object before with a custom manifest if you want to support more versions.\n
        If any version in the inherit tree is not found, a `VersionError` is raised with `VersionError.NOT_FOUND` and
        the version ID as argument.\n
        This method can raise `JsonRequestError` for any error for requests to JSON file.
        """

        version_meta, version_dir = self._prepare_meta_internal(self.id)
        while "inheritsFrom" in version_meta:
            if recursion_limit <= 0:
                raise VersionError(VersionError.TO_MUCH_PARENTS, self.id)
            recursion_limit -= 1
            parent_meta, _ = self._prepare_meta_internal(version_meta["inheritsFrom"])
            del version_meta["inheritsFrom"]
            merge_dict(version_meta, parent_meta)

        self.version_meta, self.version_dir = version_meta, version_dir

    def _prepare_meta_internal(self, version_id: str) -> Tuple[dict, str]:

        version_dir = self.context.get_version_dir(version_id)
        version_meta_file = path.join(version_dir, f"{version_id}.json")

        try:
            with open(version_meta_file, "rt") as version_meta_fp:
                return json.load(version_meta_fp), version_dir
        except (OSError, JSONDecodeError):
            version_super_meta = self._ensure_version_manifest().get_version(version_id)
            if version_super_meta is not None:
                content = json_simple_request(version_super_meta["url"])
                os.makedirs(version_dir, exist_ok=True)
                with open(version_meta_file, "wt") as version_meta_fp:
                    json.dump(content, version_meta_fp, indent=2)
                return content, version_dir
            else:
                raise VersionError(VersionError.NOT_FOUND, version_id)

    def _ensure_version_manifest(self) -> 'VersionManifest':
        if self.manifest is None:
            self.manifest = VersionManifest()
        return self.manifest

    def _check_version_meta(self):
        if self.version_meta is None:
            raise ValueError("You should install metadata first.")

    def prepare_jar(self):

        """
        Must be called once metadata file are prepared, using `prepare_meta`, if not, `ValueError` is raised.\n
        If the metadata provides a client download URL, and the version JAR file doesn't exists or have not the expected
        size, it's added to the download list to be downloaded to the same directory as the metadata file.\n
        If no download URL is provided by metadata and the JAR file does not exists, a VersionError is raised with
        `VersionError.JAR_NOT_FOUND` and the version ID as argument.
        """

        self._check_version_meta()
        self.version_jar_file = path.join(self.version_dir, f"{self.id}.jar")
        client_download = self.version_meta.get("downloads", {}).get("client")
        if client_download is not None:
            entry = DownloadEntry.from_meta(client_download, self.version_jar_file, name=f"{self.id}.jar")
            if not path.isfile(entry.dst) or path.getsize(entry.dst) != entry.size:
                self.dl.append(entry)
        elif not path.isfile(self.version_jar_file):
            raise VersionError(VersionError.JAR_NOT_FOUND, self.id)

    def prepare_assets(self):

        """
        Must be called once metadata file are prepared, using `prepare_meta`, if not, `ValueError` is raised.\n
        This method download the asset index file (if not already cached) named after the asset version into the
        directory `indexes` placed into the directory `assets_dir` of the context. Once ready, the asset index file
        is analysed and each object is checked, if it does not exist or not have the expected size, it is downloaded
        to the `objects` directory placed into the directory `assets_dir` of the context.\n
        If the metadata doesn't provide an `assetIndex`, the process is skipped.\n
        This method also set the `assets_count` attribute with the number of assets for this version.\n
        This method can raise `JsonRequestError` if it fails to load the asset index file.
        """

        self._check_version_meta()

        assets_indexes_dir = path.join(self.context.assets_dir, "indexes")
        asset_index_info = self.version_meta.get("assetIndex")
        if asset_index_info is None:
            return

        assets_index_version = self.version_meta.get("assets", asset_index_info.get("id", None))
        if assets_index_version is None:
            return

        assets_index_file = path.join(assets_indexes_dir, f"{assets_index_version}.json")

        try:
            with open(assets_index_file, "rb") as assets_index_fp:
                assets_index = json.load(assets_index_fp)
        except (OSError, JSONDecodeError):
            asset_index_url = asset_index_info["url"]
            assets_index = json_simple_request(asset_index_url)
            os.makedirs(assets_indexes_dir, exist_ok=True)
            with open(assets_index_file, "wt") as assets_index_fp:
                json.dump(assets_index, assets_index_fp)

        assets_objects_dir = path.join(self.context.assets_dir, "objects")
        assets_virtual_dir = path.join(self.context.assets_dir, "virtual", assets_index_version)
        assets_mapped_to_resources = assets_index.get("map_to_resources", False)  # For version <= 13w23b
        assets_virtual = assets_index.get("virtual", False)  # For 13w23b < version <= 13w48b (1.7.2)

        for asset_id, asset_obj in assets_index["objects"].items():
            asset_hash = asset_obj["hash"]
            asset_hash_prefix = asset_hash[:2]
            asset_size = asset_obj["size"]
            asset_file = path.join(assets_objects_dir, asset_hash_prefix, asset_hash)
            if not path.isfile(asset_file) or path.getsize(asset_file) != asset_size:
                asset_url = f"https://resources.download.minecraft.net/{asset_hash_prefix}/{asset_hash}"
                self.dl.append(DownloadEntry(asset_url, asset_file, size=asset_size, sha1=asset_hash, name=asset_id))

        def finalize():
            if assets_mapped_to_resources or assets_virtual:
                for asset_id_to_cpy in assets_index["objects"].keys():
                    if assets_mapped_to_resources:
                        resources_asset_file = path.join(self.context.work_dir, "resources", asset_id_to_cpy)
                        if not path.isfile(resources_asset_file):
                            os.makedirs(path.dirname(resources_asset_file), exist_ok=True)
                            shutil.copyfile(asset_file, resources_asset_file)
                    if assets_virtual:
                        virtual_asset_file = path.join(assets_virtual_dir, asset_id_to_cpy)
                        if not path.isfile(virtual_asset_file):
                            os.makedirs(path.dirname(virtual_asset_file), exist_ok=True)
                            shutil.copyfile(asset_file, virtual_asset_file)

        self.dl.add_callback(finalize)
        self.assets_index_version = assets_index_version
        self.assets_virtual_dir = assets_virtual_dir
        self.assets_count = len(assets_index["objects"])

    def prepare_logger(self):

        """
        Must be called once metadata file are prepared, using `prepare_meta`, if not, `ValueError` is raised.\n
        This method check the metadata for a client logging configuration, it it doesn't exist the configuration is
        added to the download list.
        """

        self._check_version_meta()
        client_logging = self.version_meta.get("logging", {}).get("client")
        if client_logging is not None:
            logging_file_info = client_logging["file"]
            logging_file = path.join(self.context.assets_dir, "log_configs", logging_file_info["id"])
            download_entry = DownloadEntry.from_meta(logging_file_info, logging_file, name=logging_file_info["id"])
            if not path.isfile(logging_file) or path.getsize(logging_file) != download_entry.size:
                self.dl.append(download_entry)
            self.logging_file = logging_file
            self.logging_argument = client_logging["argument"]

    def prepare_libraries(self):

        """
        Must be called once metadata file are prepared, using `prepare_meta`, if not, `ValueError` is raised.\n
        If the version JAR file is not set, a ValueError is raised because it is required to be added in classpath.\n
        This method check all libraries found in the metadata, each library is downloaded if not already stored. Real
        Java libraries are added to the classpath list and native libraries are added to the native list.
        """

        self._check_version_meta()

        if self.version_jar_file is None:
            raise ValueError("The version JAR file must be prepared before calling this method.")

        self.classpath_libs.clear()
        self.classpath_libs.append(self.version_jar_file)
        self.native_libs.clear()

        for lib_obj in self.version_meta["libraries"]:

            if "rules" in lib_obj:
                if not interpret_rule(lib_obj["rules"]):
                    continue

            lib_name: str = lib_obj["name"]
            lib_dl_name = lib_name
            lib_natives: Optional[dict] = lib_obj.get("natives")

            if lib_natives is not None:
                lib_classifier = lib_natives.get(get_minecraft_os())
                if lib_classifier is None:
                    continue  # If natives are defined, but the OS is not supported, skip.
                lib_dl_name += f":{lib_classifier}"
                archbits = get_minecraft_archbits()
                if len(archbits):
                    lib_classifier = lib_classifier.replace("${arch}", archbits)
                lib_libs = self.native_libs
            else:
                lib_classifier = None
                lib_libs = self.classpath_libs

            lib_path: Optional[str] = None
            lib_dl_entry: Optional[DownloadEntry] = None
            lib_dl: Optional[dict] = lib_obj.get("downloads")

            if lib_dl is not None:

                if lib_classifier is not None:
                    lib_dl_classifiers = lib_dl.get("classifiers")
                    lib_dl_meta = None if lib_dl_classifiers is None else lib_dl_classifiers.get(lib_classifier)
                else:
                    lib_dl_meta = lib_dl.get("artifact")

                if lib_dl_meta is not None:
                    print(lib_dl_meta["url"])
                    from urllib.parse import urlparse
                    o = urlparse(lib_dl_meta["url"])
                    print(o.path)
                    #print(url_parse(lib_dl_meta["url"]).path)
                    lib_path = path.join(self.context.libraries_dir, o.path[1:])
                    print("amongus")
                    print(self.context.libraries_dir)
                    print(o.path[1:])
                    print(path.join(self.context.libraries_dir, o.path[1:]))
                    lib_dl_entry = DownloadEntry.from_meta(lib_dl_meta, lib_path, name=lib_dl_name)

            if lib_dl_entry is None:

                lib_name_parts = lib_name.split(":")
                if len(lib_name_parts) != 3:
                    continue  # If the library name is not maven-formatted, skip.

                vendor, package, version = lib_name_parts
                jar_file = f"{package}-{version}.jar" if lib_classifier is None else f"{package}-{version}-{lib_classifier}.jar"
                lib_path_raw = "/".join((*vendor.split("."), package, version, jar_file))
                lib_path = path.join(self.context.libraries_dir, lib_path_raw)

                if not path.isfile(lib_path):
                    lib_repo_url: Optional[str] = lib_obj.get("url")
                    if lib_repo_url is None:
                        continue  # If the file doesn't exists, and no server url is provided, skip.
                    lib_dl_entry = DownloadEntry(f"{lib_repo_url}{lib_path_raw}", lib_path, name=lib_dl_name)

            lib_libs.append(lib_path)
            if lib_dl_entry is not None and (not path.isfile(lib_path) or path.getsize(lib_path) != lib_dl_entry.size):
                self.dl.append(lib_dl_entry)

    def prepare_jvm(self):

        """
        Must be called once metadata file are prepared, using `prepare_meta`, if not, `ValueError` is raised.\n
        This method ensure that the JVM adapted to this version is downloaded to the `jvm_dir` of the context.\n
        This method can raise `JvmLoadingError` with `JvmLoadingError.UNSUPPORTED_ARCH` if Mojang does not provide
        a JVM for your current architecture, or `JvmLoadingError.UNSUPPORTED_VERSION` if the required JVM version is
        not provided by Mojang. It can also raise `JsonRequestError` when failing to get JSON files.\n
        """

        self._check_version_meta()
        jvm_version_type = self.version_meta.get("javaVersion", {}).get("component", "jre-legacy")

        jvm_dir = path.join(self.context.jvm_dir, jvm_version_type)
        self.jvm_exec = path.join(jvm_dir, "bin", "javaw.exe" if sys.platform == "win32" else "java")

        if not path.isfile(self.jvm_exec):

            all_jvm_meta = json_simple_request("https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json")
            jvm_arch_meta = all_jvm_meta.get(get_minecraft_jvm_os())
            if jvm_arch_meta is None:
                raise JvmLoadingError(JvmLoadingError.UNSUPPORTED_ARCH)

            jvm_meta = jvm_arch_meta.get(jvm_version_type)
            if jvm_meta is None:
                raise JvmLoadingError(JvmLoadingError.UNSUPPORTED_VERSION)

            jvm_manifest = json_simple_request(jvm_meta[0]["manifest"]["url"])["files"]

            # Here we try to parse the version name given by Mojang. Some replacement and limitation in the number
            # of numbers allows the parsing to be more compliant with the real version stored in the 'release' file.
            self.jvm_version = ".".join(jvm_meta[0]["version"]["name"].split(".")[:3]).replace("8u51", "1.8.0_51")

            jvm_exec_files = []
            os.makedirs(jvm_dir, exist_ok=True)
            for jvm_file_path_suffix, jvm_file in jvm_manifest.items():
                if jvm_file["type"] == "file":
                    jvm_file_path = path.join(jvm_dir, jvm_file_path_suffix)
                    if not path.isfile(jvm_file_path):
                        jvm_download_info = jvm_file["downloads"]["raw"]
                        self.dl.append(DownloadEntry.from_meta(jvm_download_info, jvm_file_path, name=jvm_file_path_suffix))
                        if jvm_file.get("executable", False):
                            jvm_exec_files.append(jvm_file_path)

            def finalize():
                for exec_file in jvm_exec_files:
                    os.chmod(exec_file, 0o777)

            self.dl.add_callback(finalize)

        else:

            self.jvm_version = "unknown"
            jvm_release = path.join(jvm_dir, "release")
            if path.isfile(jvm_release):
                with open(jvm_release, "rt") as jvm_release_fh:
                    for line in jvm_release_fh.readlines():
                        line = line.rstrip()
                        if line.startswith("JAVA_VERSION=\"") and line[-1] == "\"":
                            self.jvm_version = line[14:-1]

    def download(self, *, progress_callback: 'Optional[Callable[[DownloadProgress], None]]' = None):
        """ Download all missing files computed in `prepare_` methods. """
        self.dl.download_files(progress_callback=progress_callback)
        self.dl.reset()

    def install(self, *, jvm: bool = False):
        """ Prepare (meta, jar, assets, logger, libs, jvm) and download the version with optional JVM installation. """
        self.prepare_meta()
        self.prepare_jar()
        self.prepare_assets()
        self.prepare_logger()
        self.prepare_libraries()
        if jvm:
            self.prepare_jvm()
        self.download()

    def start(self, opts: 'Optional[StartOptions]' = None):
        """ Faster method to start the version. This actually use `Start` class, however, you can use it directly. """
        start = Start(self)
        start.prepare(opts or StartOptions())
        start.start()


class StartOptions:

    def __init__(self):
        self.auth_session: Optional[AuthSession] = None
        self.uuid: Optional[str] = None
        self.username: Optional[str] = None
        self.demo: bool = False
        self.resolution: Optional[Tuple[int, int]] = None
        self.disable_multiplayer: bool = False
        self.disable_chat: bool = False
        self.server_address: Optional[str] = None
        self.server_port: Optional[int] = None
        self.jvm_exec: Optional[str] = None
        self.features: Dict[str, bool] = {}  # Additional features

    @classmethod
    def with_online(cls, auth_session: 'AuthSession') -> 'StartOptions':
        opts = StartOptions()
        opts.auth_session = auth_session
        return opts

    @classmethod
    def with_offline(cls, username: Optional[str], uuid: Optional[str]) -> 'StartOptions':
        opts = StartOptions()
        opts.username = username
        opts.uuid = uuid
        return opts


class Start:

    """
    Class used to control the starting procedure of Minecraft, it is made in order to allow the user to customize
    every argument given to the executable.
    """

    def __init__(self, version: Version):

        self.version = version

        self.args_replacements: Dict[str, str] = {}
        self.main_class: Optional[str] = None
        self.jvm_args: List[str] = []
        self.game_args: List[str] = []

        self.bin_dir_factory: Callable[[str], str] = self.default_bin_dir_factory
        self.runner: Callable[[List[str], str], None] = self.default_runner

    def _check_version(self):
        if self.version.version_meta is None:
            raise ValueError("You should install the version metadata first.")

    def get_username(self) -> str:
        return self.args_replacements.get("auth_player_name", "n/a")

    def get_uuid(self) -> str:
        return self.args_replacements.get("auth_uuid", "n/a")

    def prepare(self, opts: StartOptions):

        """
        This method is used to prepare internal arguments arrays, main class and arguments variables according to the
        version of this object and the given options. After this method you can call multiple times the `start` method.
        However before calling the `start` method you can changer `args_replacements`, `main_class`, `jvm_args`,
        `game_args`.\n
        This method can raise a `ValueError` if the version metadata has no `mainClass` or if no JVM executable was set
        in the given options nor downloaded by `Version` instance. You can ignore these errors if you ensure that
        """

        self._check_version()

        # Main class
        self.main_class = self.version.version_meta.get("mainClass")
        if self.main_class is None:
            raise ValueError("The version metadata has no main class to start.")

        # Prepare JVM exec
        jvm_exec = opts.jvm_exec
        if jvm_exec is None:
            jvm_exec = self.version.jvm_exec
            if jvm_exec is None:
                raise ValueError("No JVM executable set in options or downloaded by the version.")

        # Features
        features = {
            "is_demo_user": opts.demo,
            "has_custom_resolution": opts.resolution is not None,
            **opts.features
        }

        # Auth
        if opts.auth_session is not None:
            uuid = opts.auth_session.uuid
            username = opts.auth_session.username
        else:
            uuid = uuid4().hex if opts.uuid is None else opts.uuid.replace("-", "").lower()
            username = uuid[:8] if opts.username is None else opts.username[:16]  # Max username length is 16

        # Arguments replacements
        self.args_replacements = {
            # Game
            "auth_player_name": username,
            "version_name": self.version.id,
            "game_directory": self.version.context.work_dir,
            "assets_root": self.version.context.assets_dir,
            "assets_index_name": self.version.assets_index_version,
            "auth_uuid": uuid,
            "auth_access_token": "" if opts.auth_session is None else opts.auth_session.format_token_argument(False),
            "auth_xuid": "" if opts.auth_session is None else opts.auth_session.get_xuid(),
            "clientid": "" if opts.auth_session is None else opts.auth_session.client_id,
            "user_type": "" if opts.auth_session is None else opts.auth_session.user_type,
            "version_type": self.version.version_meta.get("type", ""),
            # Game (legacy)
            "auth_session": "" if opts.auth_session is None else opts.auth_session.format_token_argument(True),
            "game_assets": self.version.assets_virtual_dir,
            "user_properties": "{}",
            # JVM
            "natives_directory": "",
            "launcher_name": LAUNCHER_NAME,
            "launcher_version": LAUNCHER_VERSION,
            "classpath": path.pathsep.join(self.version.classpath_libs)
        }

        if opts.resolution is not None:
            self.args_replacements["resolution_width"] = str(opts.resolution[0])
            self.args_replacements["resolution_height"] = str(opts.resolution[1])

        # Arguments
        modern_args = self.version.version_meta.get("arguments", {})
        modern_jvm_args = modern_args.get("jvm")
        modern_game_args = modern_args.get("game")

        self.jvm_args.clear()
        self.game_args.clear()

        # JVM arguments
        self.jvm_args.append(jvm_exec)
        interpret_args(LEGACY_JVM_ARGUMENTS if modern_jvm_args is None else modern_jvm_args, features, self.jvm_args)

        # JVM argument for logging config
        if self.version.logging_argument is not None and self.version.logging_file is not None:
            self.jvm_args.append(self.version.logging_argument.replace("${path}", self.version.logging_file))

        # JVM argument for launch wrapper JAR path
        if self.main_class == "net.minecraft.launchwrapper.Launch":
            self.jvm_args.append(f"-Dminecraft.client.jar={self.version.version_jar_file}")
        mversion = self.version.id.split("-", 1)[0]
        print(mversion)
        if float(mversion[2:]) == 13 or float(mversion[2:]) > 13:
            self.jvm_args.append(f"-Dorg.lwjgl.librarypath=/home/pi/lwjgl3arm32")
            self.jvm_args.append(f"-Dorg.lwjgl.util.Debug=true")
            print("version 1.13 and above, lwjglnum is threeeeeeeeee")
        if float(mversion[2:]) < 13:
            self.jvm_args.append(f"-Dorg.lwjgl.librarypath=/home/pi/lwjgl2arm32")
            self.jvm_args.append(f"-Dorg.lwjgl.util.Debug=true")
            print("version 1.12 and below, lwjglnum is twooooooooooo")
        # Game arguments
        if modern_game_args is None:
            self.game_args.extend(self.version.version_meta.get("minecraftArguments", "").split(" "))
        else:
            interpret_args(modern_game_args, features, self.game_args)

        if opts.disable_multiplayer:
            self.game_args.append("--disableMultiplayer")
        if opts.disable_chat:
            self.game_args.append("--disableChat")

        if opts.server_address is not None:
            self.game_args.extend(("--server", opts.server_address))
        if opts.server_port is not None:
            self.game_args.extend(("--port", str(opts.server_port)))

    def start(self):

        """
        Start the game using configured attributes `args_replacements`, `main_class`, `jvm_args`, `game_args`.
        You can easily configure these attributes with the `prepare` method.\n
        This method actually use the `bin_dir_factory` of this object to produce a path where to extract binaries, by
        default a random UUID is appended to the common `bin_dir` of the context. The `runner` argument is also used to
        run the game, by default is uses the `subprocess.run` method. These two attributes can be changed before calling
        this method.
        """

        if self.main_class is None:
            raise ValueError("Main class should be set before starting the game.")

        bin_dir = self.bin_dir_factory(self.version.context.bin_dir)
        cleaned = False

        def cleanup():
            nonlocal cleaned
            if not cleaned:
                shutil.rmtree(bin_dir, ignore_errors=True)
                cleaned = True

        import atexit
        atexit.register(cleanup)

        for native_lib in self.version.native_libs:
            with ZipFile(native_lib, "r") as native_zip:
                for native_zip_info in native_zip.infolist():
                    if can_extract_native(native_zip_info.filename):
                        native_zip.extract(native_zip_info, bin_dir)

        self.args_replacements["natives_directory"] = "/home/pi/lwjgl2arm32"

        self.runner([
            *replace_list_vars(self.jvm_args, self.args_replacements),
            self.main_class,
            *replace_list_vars(self.game_args, self.args_replacements)
        ], self.version.context.work_dir)

        cleanup()

    @staticmethod
    def default_bin_dir_factory(common_bin_dir: str) -> str:
        return path.join(common_bin_dir, str(uuid4()))

    @staticmethod
    def default_runner(args: List[str], cwd: str) -> None:
        import subprocess
        my_env = os.environ.copy()
        my_env["MESA_GL_VERSION_OVERRIDE"] = "4.5"
        subprocess.run(args, cwd=cwd, env=my_env)


class VersionManifest:

    def __init__(self):
        self.data: Optional[dict] = None

    def _ensure_data(self) -> dict:
        if self.data is None:
            self.data = json_simple_request("https://launchermeta.mojang.com/mc/game/version_manifest.json")
        return self.data

    # @classmethod
    # def load_from_url(cls):
    #     """ Load the version manifest from the official URL. Can raise `JsonRequestError` if failed. """
    #     return cls(json_simple_request("https://launchermeta.mojang.com/mc/game/version_manifest.json"))

    def filter_latest(self, version: str) -> Tuple[str, bool]:
        if version in ("release", "snapshot"):
            latest = self._ensure_data()["latest"].get(version)
            if latest is not None:
                return latest, True
        return version, False

    def get_version(self, version: str) -> Optional[dict]:
        version, _alias = self.filter_latest(version)
        for version_data in self._ensure_data()["versions"]:
            if version_data["id"] == version:
                return version_data
        return None

    def all_versions(self) -> list:
        return self._ensure_data()["versions"]


class AuthSession:

    type = "raw"
    user_type = ""
    fields = "access_token", "username", "uuid", "client_id"

    @classmethod
    def fix_data(cls, data: dict):
        pass

    def __init__(self):
        self.access_token = ""
        self.username = ""
        self.uuid = ""
        self.client_id = ""

    def format_token_argument(self, legacy: bool) -> str:
        return f"token:{self.access_token}:{self.uuid}" if legacy else self.access_token

    def get_xuid(self) -> str:
        """ Getter specific to Microsoft, but common to auth sessions because it's used in `Start.prepare`. """
        return ""

    def validate(self) -> bool:
        return True

    def refresh(self):
        pass

    def invalidate(self):
        pass


class YggdrasilAuthSession(AuthSession):
    

    type = "yggdrasil"
    user_type = "mojang"
    fields = "access_token", "username", "uuid", "client_id"

    @classmethod

    def fix_data(cls, data: dict):
        client_token = data.pop("client_token")
        if client_token is not None:
            data["client_id"] = client_token
    
    def __init__(self):
        super().__init__()

    def validate(self) -> bool:
        return self.request("validate", {
            "accessToken": self.access_token,
            "clientToken": self.client_id
        }, False)[0] == 204

    def refresh(self):
        _, res = self.request("refresh", {
            "accessToken": self.access_token,
            "clientToken": self.client_id
        })
        self.access_token = res["accessToken"]
        self.username = res["selectedProfile"]["name"]  # Refresh username if renamed (does it works? to check.).

    def invalidate(self):
        self.request("invalidate", {
            "accessToken": self.access_token,
            "clientToken": self.client_id
        }, False)

    @classmethod
    def authenticate(cls, client_id: str, email: str, password: str) -> 'YggdrasilAuthSession':
        _, res = cls.request("authenticate", {
            "agent": {
                "name": "Minecraft",
                "version": 1
            },
            "username": email,
            "password": password,
            "clientToken": client_id
        })
        sess = cls()
        sess.access_token = res["accessToken"]
        sess.username = res["selectedProfile"]["name"]
        sess.uuid = res["selectedProfile"]["id"]
        sess.client_id = res["clientToken"]
        return sess

    @classmethod
    def request(cls, req: str, payload: dict, error: bool = True) -> Tuple[int, dict]:
        code, res = json_request(f"https://authserver.mojang.com/{req}", "POST",
                                 data=json.dumps(payload).encode("ascii"),
                                 headers={"Content-Type": "application/json"},
                                 ignore_error=True)
        if error and code != 200:
            raise AuthError(AuthError.YGGDRASIL, res["errorMessage"])
        return code, res


class MicrosoftAuthSession(AuthSession):

    type = "microsoft"
    user_type = "msa"
    fields = "access_token", "username", "uuid", "client_id", "refresh_token", "app_id", "redirect_uri", "xuid"

    @classmethod

    def fix_data(cls, data: dict):
        if "app_id" not in data:
            client_id = data.pop("client_id")
            if client_id is not None:
                data["app_id"] = client_id
        if "client_id" not in data or not len(data["client_id"]):
            data["client_id"] = str(uuid4())
        if "xuid" not in data:
            data["xuid"] = cls.decode_jwt_payload(data["access_token"])["xuid"]

    def __init__(self):
        super().__init__()
        self.refresh_token = ""
        self.app_id = ""
        self.redirect_uri = ""
        self.xuid = ""
        self._new_username: Optional[str] = None

    def get_xuid(self) -> str:
        return self.xuid

    def validate(self) -> bool:
        self._new_username = None
        code, res = self.mc_request_profile(self.access_token)
        if code == 200:
            username = res["name"]
            if self.username != username:
                self._new_username = username
                return False
            return True
        return False

    def refresh(self):
        if self._new_username is not None:
            self.username = self._new_username
            self._new_username = None
        else:
            res = self.authenticate_base({
                "client_id": self.app_id,
                "redirect_uri": self.redirect_uri,
                "refresh_token": self.refresh_token,
                "grant_type": "refresh_token",
                "scope": "xboxlive.signin"
            })
            self.access_token = res["access_token"]
            self.username = res["username"]
            self.uuid = res["uuid"]

    @staticmethod
    def get_authentication_url(app_id: str, redirect_uri: str, email: str, nonce: str):
        return "https://login.live.com/oauth20_authorize.srf?{}".format(url_parse.urlencode({
            "client_id": app_id,
            "redirect_uri": redirect_uri,
            "response_type": "code id_token",
            "scope": "xboxlive.signin offline_access openid email",
            "login_hint": email,
            "nonce": nonce,
            "response_mode": "form_post"
        }))

    @staticmethod
    def get_logout_url(app_id: str, redirect_uri: str):
        return "https://login.live.com/oauth20_logout.srf?{}".format(url_parse.urlencode({
            "client_id": app_id,
            "redirect_uri": redirect_uri
        }))

    @classmethod
    def check_token_id(cls, token_id: str, email: str, nonce: str) -> bool:
        id_token_payload = cls.decode_jwt_payload(token_id)
        return id_token_payload["nonce"] == nonce and id_token_payload["email"] == email

    @classmethod
    def authenticate(cls, client_id: str, app_id: str, code: str, redirect_uri: str) -> 'MicrosoftAuthSession':
        res = cls.authenticate_base({
            "client_id": app_id,
            "redirect_uri": redirect_uri,
            "code": code,
            "grant_type": "authorization_code",
            "scope": "xboxlive.signin"
        })
        sess = cls()

        sess.access_token = res["access_token"]
        sess.username = res["username"]
        sess.uuid = res["uuid"]
        sess.client_id = client_id
        sess.refresh_token = res["refresh_token"]
        sess.app_id = app_id
        sess.redirect_uri = redirect_uri
        sess.xuid = cls.decode_jwt_payload(res["access_token"])["xuid"]
        return sess

    @classmethod
    def authenticate_base(cls, request_token_payload: dict) -> dict:

        # Microsoft OAuth
        _, res = cls.ms_request("https://login.live.com/oauth20_token.srf", request_token_payload, payload_url_encoded=True)
        ms_refresh_token = res.get("refresh_token")

        # Xbox Live Token
        _, res = cls.ms_request("https://user.auth.xboxlive.com/user/authenticate", {
            "Properties": {
                "AuthMethod": "RPS",
                "SiteName": "user.auth.xboxlive.com",
                "RpsTicket": "d={}".format(res["access_token"])
            },
            "RelyingParty": "http://auth.xboxlive.com",
            "TokenType": "JWT"
        })

        xbl_token = res["Token"]
        xbl_user_hash = res["DisplayClaims"]["xui"][0]["uhs"]

        # Xbox Live XSTS Token
        _, res = cls.ms_request("https://xsts.auth.xboxlive.com/xsts/authorize", {
            "Properties": {
                "SandboxId": "RETAIL",
                "UserTokens": [xbl_token]
            },
            "RelyingParty": "rp://api.minecraftservices.com/",
            "TokenType": "JWT"
        })
        xsts_token = res["Token"]

        if xbl_user_hash != res["DisplayClaims"]["xui"][0]["uhs"]:
            raise AuthError(AuthError.MICROSOFT_INCONSISTENT_USER_HASH)

        # MC Services Auth
        _, res = cls.ms_request("https://api.minecraftservices.com/authentication/login_with_xbox", {
            "identityToken": f"XBL3.0 x={xbl_user_hash};{xsts_token}"
        })
        mc_access_token = res["access_token"]

        # MC Services Profile
        code, res = cls.mc_request_profile(mc_access_token)

        if code == 404:
            raise AuthError(AuthError.MICROSOFT_DOES_NOT_OWN_MINECRAFT)
        elif code == 401:
            raise AuthError(AuthError.MICROSOFT_OUTDATED_TOKEN)
        elif "error" in res or code != 200:
            raise AuthError(AuthError.MICROSOFT, res.get("errorMessage", res.get("error", "Unknown error")))

        return {
            "refresh_token": ms_refresh_token,
            "access_token": mc_access_token,
            "username": res["name"],
            "uuid": res["id"]
        }

    @classmethod
    def ms_request(cls, url: str, payload: dict, *, payload_url_encoded: bool = False) -> Tuple[int, dict]:
        data = (url_parse.urlencode(payload) if payload_url_encoded else json.dumps(payload)).encode("ascii")
        content_type = "application/x-www-form-urlencoded" if payload_url_encoded else "application/json"
        return json_request(url, "POST", data=data, headers={"Content-Type": content_type})

    @classmethod
    def mc_request_profile(cls, bearer: str) -> Tuple[int, dict]:
        url = "https://api.minecraftservices.com/minecraft/profile"
        return json_request(url, "GET", headers={"Authorization": f"Bearer {bearer}"}, ignore_error=True)

    @classmethod
    def base64url_decode(cls, s: str) -> bytes:
        rem = len(s) % 4
        if rem > 0:
            s += "=" * (4 - rem)
        return base64.urlsafe_b64decode(s)

    @classmethod
    def decode_jwt_payload(cls, jwt: str) -> dict:
        return json.loads(cls.base64url_decode(jwt.split(".")[1]))


class AuthDatabase:

    types = {
        YggdrasilAuthSession.type: YggdrasilAuthSession,
        MicrosoftAuthSession.type: MicrosoftAuthSession
    }

    def __init__(self, filename: str, legacy_filename: str):
        self.filename = filename
        self.legacy_filename = legacy_filename
        self.sessions: Dict[str, Dict[str, AuthSession]] = {}
        self.client_id: Optional[str] = None

    def load(self):
        self.sessions.clear()
        if not path.isfile(self.filename):
            self._load_legacy_and_delete()
        try:
            with open(self.filename, "rb") as fp:
                data = json.load(fp)
                self.client_id = data.get("client_id")
                for typ, sess_type in self.types.items():
                    typ_data = data.get(typ)
                    if typ_data is not None:
                        sessions = self.sessions[typ] = {}
                        sessions_data = typ_data["sessions"]
                        for email, sess_data in sessions_data.items():
                            # Use class method fix_data to migrate data from older versions of the auth database.
                            sess_type.fix_data(sess_data)
                            sess = sess_type()
                            for field in sess_type.fields:
                                setattr(sess, field, sess_data.get(field, ""))
                            sessions[email] = sess
        except (OSError, KeyError, TypeError, JSONDecodeError):
            pass

    def _load_legacy_and_delete(self):
        try:
            with open(self.legacy_filename, "rt") as fp:
                for line in fp.readlines():
                    parts = line.split(" ")
                    if len(parts) == 5:
                        sess = YggdrasilAuthSession()
                        sess.access_token = parts[4]
                        sess.username = parts[2]
                        sess.uuid = parts[3]
                        sess.client_id = parts[1]
                        self.put(parts[0], sess)
            os.remove(self.legacy_filename)
        except OSError:
            pass

    def save(self):
        if not path.isfile(self.filename):
            os.makedirs(path.dirname(self.filename), exist_ok=True)
        with open(self.filename, "wt") as fp:
            data = {}
            if self.client_id is not None:
                data["client_id"] = self.client_id
            for typ, sessions in self.sessions.items():
                if typ not in self.types:
                    continue
                sess_type = self.types[typ]
                sessions_data = {}
                data[typ] = {"sessions": sessions_data}
                for email, sess in sessions.items():
                    sess_data = sessions_data[email] = {}
                    for field in sess_type.fields:
                        sess_data[field] = getattr(sess, field)
            json.dump(data, fp, indent=2)

    def get(self, email: str, sess_type: Type[AuthSession]) -> Optional[AuthSession]:
        sessions = self.sessions.get(sess_type.type)
        return None if sessions is None else sessions.get(email)

    def put(self, email: str, sess: AuthSession):
        sessions = self.sessions.get(sess.type)
        if sessions is None:
            if sess.type not in self.types:
                raise ValueError("Given session's type is not supported.")
            sessions = self.sessions[sess.type] = {}
        sessions[email] = sess

    def remove(self, email: str, sess_type: Type[AuthSession]) -> Optional[AuthSession]:
        sessions = self.sessions.get(sess_type.type)
        if sessions is not None:
            session = sessions.get(email)
            if session is not None:
                del sessions[email]
                return session

    def get_client_id(self) -> str:
        if self.client_id is None or len(self.client_id) != 36:
            self.client_id = str(uuid4())
        return self.client_id


class DownloadEntry:

    __slots__ = "url", "size", "sha1", "dst", "name"

    def __init__(self, url: str, dst: str, *, size: Optional[int] = None, sha1: Optional[str] = None, name: Optional[str] = None):
        self.url = url
        self.dst = dst
        self.size = size
        self.sha1 = sha1
        self.name = url if name is None else name

    @classmethod
    def from_meta(cls, info: dict, dst: str, *, name: Optional[str] = None) -> 'DownloadEntry':
        return DownloadEntry(info["url"], dst, size=info["size"], sha1=info["sha1"], name=name)


class DownloadList:

    __slots__ = "entries", "callbacks", "count", "size"

    def __init__(self):
        self.entries: Dict[str, List[DownloadEntry]] = {}
        self.callbacks: List[Callable[[], None]] = []
        self.count = 0
        self.size = 0

    def append(self, entry: DownloadEntry):
        url_parsed = url_parse.urlparse(entry.url)
        if url_parsed.scheme not in ("http", "https"):
            raise ValueError("Illegal URL scheme for HTTP connection.")
        host_key = f"{int(url_parsed.scheme == 'https')}{url_parsed.netloc}"
        entries = self.entries.get(host_key)
        if entries is None:
            self.entries[host_key] = entries = []
        entries.append(entry)
        self.count += 1
        if entry.size is not None:
            self.size += entry.size

    def reset(self):
        self.entries.clear()
        self.callbacks.clear()

    def add_callback(self, callback: Callable[[], None]):
        self.callbacks.append(callback)

    def download_files(self, *, progress_callback: 'Optional[Callable[[DownloadProgress], None]]' = None):

        """
        Downloads the given list of files. Even if some downloads fails, it continue and raise DownloadError(fails)
        only at the end (but not calling callbacks), where 'fails' is a dict associating the entry URL and its error
        ('not_found', 'invalid_size', 'invalid_sha1').
        """

        if len(self.entries):

            headers = {}
            buffer = bytearray(65536)
            total_size = 0
            fails: Dict[str, str] = {}
            max_try_count = 3

            if progress_callback is not None:
                progress = DownloadProgress(self.size)
                entry_progress = DownloadEntryProgress()
                progress.entries.append(entry_progress)
            else:
                progress = None
                entry_progress = None

            for host, entries in self.entries.items():

                conn_type = HTTPSConnection if (host[0] == "1") else HTTPConnection
                conn = conn_type(host[1:])
                max_entry_idx = len(entries) - 1
                headers["Connection"] = "keep-alive"

                for i, entry in enumerate(entries):

                    last_entry = (i == max_entry_idx)
                    if last_entry:
                        headers["Connection"] = "close"

                    size_target = 0 if entry.size is None else entry.size
                    error = None

                    for _ in range(max_try_count):

                        try:
                            conn.request("GET", entry.url, None, headers)
                            res = conn.getresponse()
                        except ConnectionError:
                            error = DownloadError.CONN_ERROR
                            continue

                        if res.status != 200:
                            error = DownloadError.NOT_FOUND
                            continue

                        sha1 = None if entry.sha1 is None else hashlib.sha1()
                        size = 0
                        print("|")
                        print("V")
                        print(entry.dst)
                        os.makedirs(path.dirname(entry.dst), exist_ok=True)
                        with open(entry.dst, "wb") as dst_fp:
                            while True:
                                read_len = res.readinto(buffer)
                                if not read_len:
                                    break
                                buffer_view = buffer[:read_len]
                                size += read_len
                                total_size += read_len
                                if sha1 is not None:
                                    sha1.update(buffer_view)
                                dst_fp.write(buffer_view)
                                if progress_callback is not None:
                                    progress.size = total_size
                                    entry_progress.name = entry.name
                                    entry_progress.total = size_target
                                    entry_progress.size = size
                                    progress_callback(progress)

                        if entry.size is not None and size != entry.size:
                            error = DownloadError.INVALID_SIZE
                        elif entry.sha1 is not None and sha1.hexdigest() != entry.sha1:
                            error = DownloadError.INVALID_SHA1
                        else:
                            break

                        total_size -= size  # If error happened, subtract the size and restart from latest total_size.

                    else:
                        fails[entry.url] = error  # If the break was not triggered, an error should be set.

                conn.close()

            if len(fails):
                raise DownloadError(fails)

        for callback in self.callbacks:
            callback()


class DownloadEntryProgress:

    __slots__ = "name", "size", "total"

    def __init__(self):
        self.name = ""
        self.size = 0
        self.total = 0


class DownloadProgress:

    __slots__ = "entries", "size", "total"

    def __init__(self, total: int):
        self.entries: List[DownloadEntryProgress] = []
        self.size: int = 0  # Size can be greater that total, this happen if any DownloadEntry has an unknown size.
        self.total = total


class BaseError(Exception):

    def __init__(self, code: str):
        super().__init__()
        self.code = code


class JsonRequestError(BaseError):

    INVALID_RESPONSE_NOT_JSON = "invalid_response_not_json"

    def __init__(self, code: str, url: str, method: str, status: int, data: bytes):
        super().__init__(code)
        self.url = url
        self.method = method
        self.status = status
        self.data = data


class AuthError(BaseError):

    YGGDRASIL = "yggdrasil"
    MICROSOFT = "microsoft"
    MICROSOFT_INCONSISTENT_USER_HASH = "microsoft.inconsistent_user_hash"
    MICROSOFT_DOES_NOT_OWN_MINECRAFT = "microsoft.does_not_own_minecraft"
    MICROSOFT_OUTDATED_TOKEN = "microsoft.outdated_token"

    def __init__(self, code: str, details: Optional[str] = None):
        super().__init__(code)
        self.details = details


class VersionError(BaseError):

    NOT_FOUND = "not_found"
    TO_MUCH_PARENTS = "to_much_parents"
    JAR_NOT_FOUND = "jar_not_found"

    def __init__(self, code: str, version: str):
        super().__init__(code)
        self.version = version


class JvmLoadingError(BaseError):
    UNSUPPORTED_ARCH = "unsupported_arch"
    UNSUPPORTED_VERSION = "unsupported_version"


class DownloadError(Exception):

    CONN_ERROR = "conn_error"
    NOT_FOUND = "not_found"
    INVALID_SIZE = "invalid_size"
    INVALID_SHA1 = "invalid_sha1"

    def __init__(self, fails: Dict[str, str]):
        super().__init__()
        self.fails = fails


def json_request(url: str, method: str, *,
                 data: Optional[bytes] = None,
                 headers: Optional[dict] = None,
                 ignore_error: bool = False,
                 timeout: Optional[float] = None) -> Tuple[int, dict]:

    """
    Make a request for a JSON API at specified URL. Might raise `JsonRequestError` if failed.\n
    The parameter `ignore_error` can be used to ignore JSONDecodeError handling and just return a dict with a
    single key 'raw' and the raw data on failure, instead of raising an `JsonRequestError` with
    `JsonRequestError.INVALID_RESPONSE_NOT_JSON`.
    """

    if headers is None:
        headers = {}
    if "Accept" not in headers:
        headers["Accept"] = "application/json"

    try:
        req = UrlRequest(url, data, headers, method=method)
        res: HTTPResponse = url_request.urlopen(req, timeout=timeout)
    except HTTPError as err:
        res = cast(HTTPResponse, err)

    try:
        data = res.read()
        return res.status, json.loads(data)
    except JSONDecodeError:
        if ignore_error:
            return res.status, {"raw": data}
        else:
            raise JsonRequestError(JsonRequestError.INVALID_RESPONSE_NOT_JSON, url, method, res.status, data)


def json_simple_request(url: str, *, ignore_error: bool = False, timeout: Optional[int] = None) -> dict:
    """ Make a GET request for a JSON API at specified URL. Might raise `JsonRequestError` if failed. """
    return json_request(url, "GET", ignore_error=ignore_error, timeout=timeout)[1]


def merge_dict(dst: dict, other: dict):

    """
    Merge the 'other' dict into the 'dst' dict. For every key/value in 'other', if the key is present in 'dst'
    it does nothing. Unless values in both dict are also dict, in this case the merge is recursive. If the
    value in both dict are list, the 'dst' list is extended (.extend()) with the one of 'other'.
    """

    for k, v in other.items():
        if k in dst:
            if isinstance(dst[k], dict) and isinstance(other[k], dict):
                merge_dict(dst[k], other[k])
            elif isinstance(dst[k], list) and isinstance(other[k], list):
                dst[k].extend(other[k])
        else:
            dst[k] = other[k]


def interpret_rule_os(rule_os: dict) -> bool:
    os_name = rule_os.get("name")
    if os_name is None or os_name == get_minecraft_os():
        os_arch = rule_os.get("arch")
        if os_arch is None or os_arch == get_minecraft_arch():
            os_version = rule_os.get("version")
            if os_version is None or re.search(os_version, platform.version()) is not None:
                return True
    return False


def interpret_rule(rules: List[dict], features: Optional[dict] = None) -> bool:
    allowed = False
    for rule in rules:
        rule_os = rule.get("os")
        if rule_os is not None and not interpret_rule_os(rule_os):
            continue
        rule_features: Optional[dict] = rule.get("features")
        if rule_features is not None:
            feat_valid = True
            for feat_name, feat_expected in rule_features.items():
                if features.get(feat_name) != feat_expected:
                    feat_valid = False
                    break
            if not feat_valid:
                continue
        allowed = (rule["action"] == "allow")
    return allowed


def interpret_args(args: list, features: dict, dst: List[str]):
    for arg in args:
        if isinstance(arg, str):
            dst.append(arg)
        else:
            rules = arg.get("rules")
            if rules is not None:
                if not interpret_rule(rules, features):
                    continue
            arg_value = arg["value"]
            if isinstance(arg_value, list):
                dst.extend(arg_value)
            elif isinstance(arg_value, str):
                dst.append(arg_value)


def replace_vars(txt: str, replacements: Dict[str, str]) -> str:
    try:
        return txt.replace("${", "{").format_map(replacements)
    except KeyError:
        return txt


def replace_list_vars(lst: List[str], replacements: Dict[str, str]) -> Generator[str, None, None]:
    return (replace_vars(elt, replacements) for elt in lst)


def get_minecraft_dir() -> str:
    home = path.expanduser("~")
    return {
        "Linux": path.join(home, ".minecraft"),
        "Windows": path.join(home, "AppData", "Roaming", ".minecraft"),
        "Darwin": path.join(home, "Library", "Application Support", "minecraft")
    }.get(platform.system())


_minecraft_os: Optional[str] = None
def get_minecraft_os() -> str:
    """ Return the current OS identifier used in rules matching, 'linux', 'windows', 'osx' and '' if not found. """
    global _minecraft_os
    if _minecraft_os is None:
        _minecraft_os = {"Linux": "linux", "Windows": "windows", "Darwin": "osx"}.get(platform.system(), "")
    return _minecraft_os


_minecraft_arch: Optional[str] = None
def get_minecraft_arch() -> str:
    """ Return the architecture to use in rules matching, 'x86', 'x86_64' or '' if not found. """
    global _minecraft_arch
    if _minecraft_arch is None:
        machine = platform.machine().lower()
        _minecraft_arch = "x86" if machine in ("i386", "i686") else "x86_64" if machine in ("x86_64", "amd64", "ia64") else ""
    return _minecraft_arch


_minecraft_archbits: Optional[str] = None
def get_minecraft_archbits() -> str:
    """ Return the address size of the architecture used for rules matching, '64', '32', or '' if not found. """
    global _minecraft_archbits
    if _minecraft_archbits is None:
        raw_bits = platform.architecture()[0]
        _minecraft_archbits = "64" if raw_bits == "64bit" else "32" if raw_bits == "32bit" else ""
    return _minecraft_archbits


_minecraft_jvm_os: Optional[str] = None
def get_minecraft_jvm_os() -> str:
    """ Return the OS identifier used to choose the right JVM to download. """
    global _minecraft_jvm_os
    if _minecraft_jvm_os is None:
        _minecraft_jvm_os = {
            "osx": {"x86": "mac-os"},
            "linux": {"x86": "linux-i386", "x86_64": "linux"},
            "windows": {"x86": "windows-x86", "x86_64": "windows-x64"}
        }.get(get_minecraft_os(), {}).get(get_minecraft_arch())
    return _minecraft_jvm_os


def can_extract_native(filename: str) -> bool:
    """ Return True if a file should be extracted to binaries directory. """
    return not filename.startswith("META-INF") and not filename.endswith(".git") and not filename.endswith(".sha1")


LEGACY_JVM_ARGUMENTS = [
    {
        "rules": [{"action": "allow", "os": {"name": "osx"}}],
        "value": ["-XstartOnFirstThread"]
    },
    {
        "rules": [{"action": "allow", "os": {"name": "windows"}}],
        "value": "-XX:HeapDumpPath=MojangTricksIntelDriversForPerformance_javaw.exe_minecraft.exe.heapdump"
    },
    {
        "rules": [{"action": "allow", "os": {"name": "windows", "version": "^10\\."}}],
        "value": ["-Dos.name=Windows 10", "-Dos.version=10.0"]
    },
    "-Djava.library.path=/home/pi/lwjgl3arm32",
    "-Dminecraft.launcher.brand=${launcher_name}",
    "-Dminecraft.launcher.version=${launcher_version}",
    "-Dorg.lwjgl.librarypath=/home/pi/lwjgl3arm32",
    "-cp",
    "${classpath}"
]


if __name__ == "__main__":

    from typing import cast, Union, Any, List, Dict, Optional, Type, Tuple
    from argparse import ArgumentParser, Namespace, HelpFormatter
    from http.server import HTTPServer, BaseHTTPRequestHandler
    from importlib.machinery import SourceFileLoader
    from urllib import parse as url_parse
    #print(url_parse)
    from urllib.error import URLError
    from json import JSONDecodeError
    from datetime import datetime
    from types import ModuleType
    import importlib.util
    from os import path
    import webbrowser
    import webview
    import traceback
    import platform
    import socket
    import shutil
    import uuid
    import json
    import time
    import sys
    import os
    
    
    
    EXIT_OK = 0
    EXIT_FAILURE = 1
    EXIT_WRONG_USAGE = 9
    EXIT_VERSION_NOT_FOUND = 10
    EXIT_DOWNLOAD_ERROR = 13
    EXIT_AUTH_ERROR = 14
    EXIT_DEPRECATED_ARGUMENT = 16
    EXIT_JSON_REQUEST_ERROR = 18
    EXIT_JVM_LOADING_ERROR = 19
    
    AUTH_DB_FILE_NAME = "portablemc_auth.json"
    AUTH_DB_LEGACY_FILE_NAME = "portablemc_tokens"
    
    MS_AZURE_APP_ID = "708e91b5-99f8-4a1d-80ec-e746cbb24771"
    
    JVM_ARGS_DEFAULT = ["-Xmx1G",
                       "-XX:+UnlockExperimentalVMOptions",
                       "-XX:+UseG1GC",
                       "-XX:G1NewSizePercent=20",
                       "-XX:G1ReservePercent=20",
                       "-XX:MaxGCPauseMillis=50",
                       "-XX:G1HeapRegionSize=32M"]
    
    
    class CliContext(Context):
        def __init__(self, ns: Namespace):
            super().__init__(ns.main_dir, ns.work_dir)
            self.ns = ns
    
    
    class CliAddonMeta:
    
        __slots__ = ("id", "data", "name", "version", "authors", "description", "requires")
    
        def __init__(self, data: Dict[str, Any], addon_id: str):
            self.id = addon_id
            self.data = data
            self.name = str(self.data.get("name", addon_id))
            self.version = str(self.data.get("version", "n/a"))
            self.authors = self.data.get("authors")
            self.description = str(self.data.get("description", "n/a"))
            self.requires = self.data.get("requires")
            if not isinstance(self.authors, list):
                self.authors: List[str] = []
            if not isinstance(self.requires, dict):
                self.requires: Dict[str, str] = {}
    
    
    class CliAddon:
        __slots__ = ("module", "meta")
        def __init__(self, module: ModuleType, meta: CliAddonMeta):
            self.module = module
            self.meta = meta
    
    
    class CliInstallError(BaseError):
        NOT_FOUND = "not_found"
        INVALID_DIR = "invalid_dir"
        INVALID_META = "invalid_meta"
        ALREADY_INSTALLED = "already_installed"
    
    
    def main(args: Optional[List[str]] = None):
    
        load_addons()
    
        parser = register_arguments()
        ns = parser.parse_args(args or sys.argv[1:])
    
        command_handlers = get_command_handlers()
        command_attr = "subcommand"
        while True:
            command = getattr(ns, command_attr)
            handler = command_handlers.get(command)
            if handler is None:
                parser.print_help()
                sys.exit(EXIT_WRONG_USAGE)
            elif callable(handler):
                handler(ns, new_context(ns))
            elif isinstance(handler, dict):
                command_attr = f"{command}_{command_attr}"
                command_handlers = handler
                continue
            sys.exit(EXIT_OK)
    
    
    # Addons
    
    addons: Dict[str, CliAddon] = {}
    addons_dirs: List[str] = []
    addons_loaded: bool = False
    
    def load_addons():
    
        global addons, addons_loaded, addons_dirs
    
        if addons_loaded:
            raise ValueError("Addons already loaded.")
    
        addons_loaded = True
    
        home = path.expanduser("~")
        system = platform.system()
    
        if __name__ == "__main__":
            # In single-file mode, we need to support the addons directory directly next to the script.
            addons_dirs.append(path.join(path.dirname(__file__), "addons"))
        else:
            # In development mode, we need to support addons directory in the parent directory.
            dev_dir = path.dirname(path.dirname(__file__))
            if path.isfile(path.join(dev_dir, ".gitignore")):
                addons_dirs.append(path.join(dev_dir, "addons"))
    
        if system == "Linux":
            addons_dirs.append(path.join(os.getenv("XDG_DATA_HOME", path.join(home, ".local", "share")), "portablemc", "addons"))
        elif system == "Windows":
            addons_dirs.append(path.join(home, "AppData", "Local", "portablemc", "addons"))
        elif system == "Darwin":
            addons_dirs.append(path.join(home, "Library", "Application Support", "portablemc", "addons"))
    
        for addons_dir in addons_dirs:
    
            if not path.isdir(addons_dir):
                continue
    
            for addon_id in os.listdir(addons_dir):
                if not addon_id.endswith(".dis") and addon_id != "__pycache__":
    
                    addon_path = path.join(addons_dir, addon_id)
                    if not path.isdir(addon_path):
                        continue  # If not terminated with '.py' and not a dir
    
                    addon_init_path = path.join(addon_path, "__init__.py")
                    addon_meta_path = path.join(addon_path, "addon.json")
                    if not path.isfile(addon_init_path) or not path.isfile(addon_meta_path):
                        continue  # If __init__.py is not found in dir
    
                    if not addon_id.isidentifier():
                        print_message("addon.invalid_identifier", {"addon": addon_id, "path": addon_path}, critical=True)
                        continue
    
                    with open(addon_meta_path, "rb") as addon_meta_fp:
                        try:
                            addon_meta = json.load(addon_meta_fp)
                            if not isinstance(addon_meta, dict):
                                print_message("addon.invalid_meta", {"addon": addon_id, "path": addon_meta_path}, critical=True)
                                continue
                        except JSONDecodeError:
                            print_message("addon.invalid_meta", {"addon": addon_id, "path": addon_meta_path}, trace=True, critical=True)
                            continue
    
                    existing_module = addons.get(addon_id)
                    if existing_module is not None:
                        print_message("addon.defined_twice", {
                            "addon": addon_id,
                            "path1": path.dirname(existing_module.__file__),
                            "path2": addon_path
                        }, critical=True)
                        continue
    
                    module_name = f"_pmc_addon_{addon_id}"
                    existing_module = sys.modules.get(module_name)
                    if existing_module is not None:
                        print_message("addon.module_conflict", {
                            "addon": addon_id,
                            "addon_path": addon_path,
                            "module": module_name,
                            "module_path": path.dirname(existing_module.__file__)
                        }, critical=True)
                        continue
    
                    loader = SourceFileLoader(module_name, addon_init_path)
                    spec = importlib.util.spec_from_file_location(module_name, addon_init_path, loader=loader,
                                                                  submodule_search_locations=[addon_path])
                    module = importlib.util.module_from_spec(spec)
                    sys.modules[module_name] = module
    
                    try:
                        loader.exec_module(module)
                        addons[addon_id] = CliAddon(module, CliAddonMeta(addon_meta, addon_id))
                    except Exception as e:
                        if isinstance(e, ImportError):
                            print_message("addon.import_error", {"addon": addon_id}, trace=True, critical=True)
                        else:
                            print_message("addon.unknown_error", {"addon": addon_id}, trace=True, critical=True)
                        del sys.modules[module_name]
    
        self_module = sys.modules[__name__]
        for addon_id, addon in addons.items():
            if hasattr(addon.module, "load") and callable(addon.module.load):
                addon.module.load(self_module)
    
    
    def get_addon(id_: str) -> Optional[CliAddon]:
        return addons.get(id_)
    
    
    # CLI Parser
    
    def register_arguments() -> ArgumentParser:
        _ = get_message
        parser = ArgumentParser(allow_abbrev=False, prog="portablemc", description=_("args"))
        parser.add_argument("--main-dir", help=_("args.main_dir"))
        parser.add_argument("--work-dir", help=_("args.work_dir"))
        register_subcommands(parser.add_subparsers(title="subcommands", dest="subcommand"))
        return parser
    
    
    def register_subcommands(subparsers):
        _ = get_message
        register_search_arguments(subparsers.add_parser("search", help=_("args.search")))
        register_start_arguments(subparsers.add_parser("start", help=_("args.start")))
        register_login_arguments(subparsers.add_parser("login", help=_("args.login")))
        register_logout_arguments(subparsers.add_parser("logout", help=_("args.logout")))
        register_show_arguments(subparsers.add_parser("show", help=_("args.show")))
        register_addon_arguments(subparsers.add_parser("addon", help=_("args.addon")))
    
    
    def register_search_arguments(parser: ArgumentParser):
        parser.add_argument("-l", "--local", help=get_message("args.search.local"), action="store_true")
        parser.add_argument("input", nargs="?")
    
    
    def register_start_arguments(parser: ArgumentParser):
        _ = get_message
        parser.formatter_class = new_help_formatter_class(32)
        parser.add_argument("--dry", help=_("args.start.dry"), action="store_true")
        parser.add_argument("--disable-mp", help=_("args.start.disable_multiplayer"), action="store_true")
        parser.add_argument("--disable-chat", help=_("args.start.disable_chat"), action="store_true")
        parser.add_argument("--demo", help=_("args.start.demo"), action="store_true")
        parser.add_argument("--resol", help=_("args.start.resol"), type=decode_resolution)
        parser.add_argument("--jvm", help=_("args.start.jvm"))
        parser.add_argument("--jvm-args", help=_("args.start.jvm_args"))
        parser.add_argument("--no-better-logging", help=_("args.start.no_better_logging"), action="store_true")
        parser.add_argument("--anonymise", help=_("args.start.anonymise"), action="store_true")
        parser.add_argument("-t", "--temp-login", help=_("args.start.temp_login"), action="store_true")
        parser.add_argument("-l", "--login", help=_("args.start.login"))
        parser.add_argument("-m", "--microsoft", help=_("args.start.microsoft"), action="store_true")
        parser.add_argument("-u", "--username", help=_("args.start.username"), metavar="NAME")
        parser.add_argument("-i", "--uuid", help=_("args.start.uuid"))
        parser.add_argument("-s", "--server", help=_("args.start.server"))
        parser.add_argument("-p", "--server-port", type=int, help=_("args.start.server_port"), metavar="PORT")
        parser.add_argument("version", nargs="?", default="release")
    
    
    def register_login_arguments(parser: ArgumentParser):
        parser.add_argument("-m", "--microsoft", help=get_message("args.login.microsoft"), action="store_true")
        parser.add_argument("email_or_username")
    
    
    def register_logout_arguments(parser: ArgumentParser):
        parser.add_argument("-m", "--microsoft", help=get_message("args.logout.microsoft"), action="store_true")
        parser.add_argument("email_or_username")
    
    
    def register_show_arguments(parser: ArgumentParser):
        _ = get_message
        subparsers = parser.add_subparsers(title="subcommands", dest="show_subcommand")
        subparsers.required = True
        subparsers.add_parser("about", help=_("args.show.about"))
        subparsers.add_parser("auth", help=_("args.show.auth"))
    
    
    def register_addon_arguments(parser: ArgumentParser):
        _ = get_message
        subparsers = parser.add_subparsers(title="subcommands", dest="addon_subcommand")
        subparsers.required = True
        subparsers.add_parser("list", help=_("args.addon.list"))
        subparsers.add_parser("dirs", help=_("args.addon.dirs"))
        show_parser = subparsers.add_parser("show", help=_("args.addon.show"))
        show_parser.add_argument("addon_id")
    
    
    def new_help_formatter_class(max_help_position: int) -> Type[HelpFormatter]:
    
        class CustomHelpFormatter(HelpFormatter):
            def __init__(self, prog):
                super().__init__(prog, max_help_position=max_help_position)
    
        return CustomHelpFormatter
    
    
    def decode_resolution(raw: str):
        return tuple(int(size) for size in raw.split("x"))
    
    
    # Commands handlers
    
    def get_command_handlers():
        return {
            "search": cmd_search,
            "start": cmd_start,
            "login": cmd_login,
            "logout": cmd_logout,
            "show": {
                "about": cmd_show_about,
                "auth": cmd_show_auth,
            },
            "addon": {
                "list": cmd_addon_list,
                "show": cmd_addon_show,
                "dirs": cmd_addon_dirs
            }
        }
    
    
    def cmd_search(ns: Namespace, ctx: CliContext):
    
        _ = get_message
        table = []
        search = ns.input
        no_version = (search is None)
        if ns.local:
            for version_id, mtime in ctx.list_versions():
                if no_version or search in version_id:
                    print(version_id)
                    #sys.stdout.flush()
                    table.append((version_id, format_iso_date(mtime)))
        else:
            manifest = load_version_manifest(ctx)
            search, alias = manifest.filter_latest(search)
            for version_data in manifest.all_versions():
                version_id = version_data["id"]
                print(version_id)
                if no_version or (alias and search == version_id) or (not alias and search in version_id):
                    table.append((
                        version_data["type"],
                        version_id,
                        format_iso_date(version_data["releaseTime"]),
                        _("search.flags.local") if ctx.has_version_metadata(version_id) else ""
                    ))
    
        if len(table):
            table.insert(0, (
                _("search.name"),
                _("search.last_modified")
            ) if ns.local else (
                _("search.type"),
                _("search.name"),
                _("search.release_date"),
                _("search.flags")
            ))
            #print_table(table, header=0)
            sys.exit(EXIT_OK)
        else:
            print_message("search.not_found")
            sys.exit(EXIT_VERSION_NOT_FOUND)
    
    
    def cmd_start(ns: Namespace, ctx: CliContext):
    
        try:
    
            version = new_version(ctx, ns.version)
    
            print_task("", "start.version.resolving", {"version": version.id})
            version.prepare_meta()
            print_task("OK", "start.version.resolved", {"version": version.id}, done=True)
    
            print_task("", "start.version.jar.loading")
            version.prepare_jar()
            print_task("OK", "start.version.jar.loaded", done=True)
    
            print_task("", "start.assets.checking")
            version.prepare_assets()
            print_task("OK", "start.assets.checked", {"count": version.assets_count}, done=True)
    
            print_task("", "start.logger.loading")
            version.prepare_logger()
    
            if ns.no_better_logging or version.logging_file is None:
                print_task("OK", "start.logger.loaded", done=True)
            else:
    
                replacement = "<PatternLayout pattern=\"%d{HH:mm:ss.SSS} [%t] %-5level %logger{36} - %msg%n\"/>"
                old_logging_file = version.logging_file
                better_logging_file = path.join(path.dirname(old_logging_file), f"portablemc-{path.basename(old_logging_file)}")
                version.logging_file = better_logging_file
    
                def _pretty_logger_finalize():
                    if not path.isfile(better_logging_file):
                        with open(old_logging_file, "rt") as old_logging_fh:
                            with open(better_logging_file, "wt") as better_logging_fh:
                                better_logging_fh.write(old_logging_fh.read()
                                                        .replace("<XMLLayout />", replacement)
                                                        .replace("<LegacyXMLLayout />", replacement))
    
                version.dl.add_callback(_pretty_logger_finalize)
                print_task("OK", "start.logger.loaded_pretty", done=True)
    
            print_task("", "start.libraries.loading")
            version.prepare_libraries()
            libs_count = len(version.classpath_libs) + len(version.native_libs)
            print_task("OK", "start.libraries.loaded", {"count": libs_count}, done=True)
    
            if ns.jvm is None:
                print_task("", "start.jvm.loading")
                version.prepare_jvm()
                print_task("OK", "start.jvm.loaded", {"version": version.jvm_version}, done=True)
    
            pretty_download(version.dl)
            version.dl.reset()
    
            if ns.dry:
                return
    
            start_opts = new_start_options(ctx)
            start_opts.disable_multiplayer = ns.disable_mp
            start_opts.disable_chat = ns.disable_chat
            start_opts.demo = ns.demo
            start_opts.server_address = ns.server
            start_opts.server_port = ns.server_port
            start_opts.jvm_exec = ns.jvm
    
            if ns.resol is not None and len(ns.resol) == 2:
                start_opts.resolution = ns.resol
    
            if ns.login is not None:
                start_opts.auth_session = prompt_authenticate(ctx, ns.login, not ns.temp_login, ns.microsoft, ns.anonymise)
                if start_opts.auth_session is None:
                    sys.exit(EXIT_AUTH_ERROR)
            else:
                if ns.microsoft:
                    print_task("WARN", "auth.microsoft_requires_email", done=True)
                start_opts.uuid = ns.uuid
                start_opts.username = ns.username
    
            print_task("", "start.starting")
    
            start = new_start(ctx, version)
            start.prepare(start_opts)
            print(start.jvm_args)
            start.jvm_args.extend(JVM_ARGS_DEFAULT)
            print(start.jvm_args)
    
            print_task("OK", "start.starting_info", {
                "username": start.args_replacements.get("auth_player_name", "n/a"),
                "uuid": start.args_replacements.get("auth_uuid", "n/a")
            }, done=True)
    
            start.start()
    
            sys.exit(EXIT_OK)
    
        except VersionError as err:
            print_task("FAILED", f"start.version.error.{err.code}", {"version": err.version}, done=True)
            sys.exit(EXIT_VERSION_NOT_FOUND)
        except JvmLoadingError as err:
            print_task("FAILED", f"start.jvm.error.{err.code}", done=True)
            sys.exit(EXIT_JVM_LOADING_ERROR)
        except JsonRequestError as err:
            print_task("FAILED", f"json_request.error.{err.code}", {
                "url": err.url,
                "method": err.method,
                "status": err.status,
                "data": err.data,
            }, done=True, keep_previous=True)
            sys.exit(EXIT_JSON_REQUEST_ERROR)
        except (URLError, socket.gaierror, socket.timeout) as err:
            print_task("FAILED", "error.socket", {"reason": str(err)}, done=True, keep_previous=True)
            sys.exit(EXIT_FAILURE)
    
    
    def cmd_login(ns: Namespace, ctx: CliContext):
        #print("login works")
        sess = prompt_authenticate(ctx, ns.email_or_username, True, ns.microsoft)
        sys.exit(EXIT_AUTH_ERROR if sess is None else EXIT_OK)
    
    
    def cmd_logout(ns: Namespace, ctx: CliContext):
        task_args = {"email": ns.email_or_username}
        print_task("", "logout.microsoft.pending" if ns.microsoft else "logout.yggdrasil.pending", task_args)
        auth_db = new_auth_database(ctx)
        auth_db.load()
        session = auth_db.remove(ns.email_or_username, MicrosoftAuthSession if ns.microsoft else YggdrasilAuthSession)
        if session is not None:
            session.invalidate()
            auth_db.save()
            print_task("OK", "logout.success", task_args, done=True)
            sys.exit(EXIT_OK)
        else:
            print_task("FAILED", "logout.unknown_session", task_args, done=True)
            sys.exit(EXIT_AUTH_ERROR)
    
    
    def cmd_show_about(_ns: Namespace, _ctx: CliContext):
        print(f"Version: {LAUNCHER_VERSION}")
        print(f"Authors: {', '.join(LAUNCHER_AUTHORS)}")
        print(f"Website: {LAUNCHER_URL}")
        print(f"License: {LAUNCHER_COPYRIGHT}")
        print( "         This program comes with ABSOLUTELY NO WARRANTY. This is free software,")
        print( "         and you are welcome to redistribute it under certain conditions.")
        print( "         See <https://www.gnu.org/licenses/gpl-3.0.html>.")
    
    
    def cmd_show_auth(_ns: Namespace, ctx: CliContext):
        auth_db = new_auth_database(ctx)
        auth_db.load()
        lines = [("Type", "Email", "Username", "UUID")]  # Intentionally not i18n for now
        for auth_type, auth_type_sessions in auth_db.sessions.items():
            for email, sess in auth_type_sessions.items():
                lines.append((auth_type, email, sess.username, sess.uuid))
        print_table(lines, header=0)
    
    
    def cmd_addon_list(_ns: Namespace, _ctx: CliContext):
    
        _ = get_message
    
        lines = [(
            _("addon.list.id", count=len(addons)),
            _("addon.list.name"),
            _("addon.list.version"),
            _("addon.list.authors"),
        )]
    
        for addon_id, addon in addons.items():
            lines.append((
                addon_id,
                addon.meta.name,
                addon.meta.version,
                ", ".join(addon.meta.authors)
            ))
    
        print_table(lines, header=0)
    
    
    def cmd_addon_show(ns: Namespace, _ctx: CliContext):
    
        addon_id = ns.addon_id
        addon = addons.get(addon_id)
    
        if addon is None:
            print_message("addon.show.not_found", {"addon": addon_id})
            sys.exit(EXIT_FAILURE)
        else:
            _ = get_message
            print_message("addon.show.name", {"name": addon.meta.name})
            print_message("addon.show.version", {"version": addon.meta.version})
            print_message("addon.show.authors", {"authors": ", ".join(addon.meta.authors)})
            print_message("addon.show.description", {"description": addon.meta.description})
            if len(addon.meta.requires):
                print_message("addon.show.requires")
                for requirement, version in addon.meta.requires.items():
                    print(f"   {requirement}: {version}")
            sys.exit(EXIT_OK)
    
    
    def cmd_addon_dirs(_ns: Namespace, _ctx: CliContext):
        print_message("addon.dirs.title")
        for addons_dir in addons_dirs:
            msg_args = {"path": path.abspath(addons_dir)}
            print_message("addon.dirs.entry" if path.isdir(addons_dir) else "addon.dirs.entry.not_existing", msg_args)
    
    
    # Constructors to override
    
    def new_context(ns: Namespace) -> CliContext:
        return CliContext(ns)
    
    
    def load_version_manifest(_ctx: CliContext) -> VersionManifest:
        return VersionManifest()
    
    
    def new_auth_database(ctx: CliContext) -> AuthDatabase:
        return AuthDatabase(path.join(ctx.work_dir, AUTH_DB_FILE_NAME), path.join(ctx.work_dir, AUTH_DB_LEGACY_FILE_NAME))
    
    
    def new_version(ctx: CliContext, version_id: str) -> Version:
        manifest = load_version_manifest(ctx)
        version_id, _alias = manifest.filter_latest(version_id)
        version = Version(ctx, version_id)
        version.manifest = manifest
        return version
    
    
    def new_start(_ctx: CliContext, version: Version) -> Start:
        return Start(version)
    
    
    def new_start_options(_ctx: CliContext) -> StartOptions:
        return StartOptions()
    
    
    # CLI utilities
    
    def mixin(name: Optional[str] = None, into: Optional[object] = None):
        def mixin_decorator(func):
            orig_obj = into or sys.modules[__name__]
            orig_name = name or func.__name__
            orig_func = getattr(orig_obj, orig_name)
            def wrapper(*args, **kwargs):
                return func(orig_func, *args, **kwargs)
            setattr(orig_obj, orig_name, wrapper)
            return func
        return mixin_decorator
    
    
    def format_iso_date(raw: Union[str, float]) -> str:
        if isinstance(raw, float):
            return datetime.fromtimestamp(raw).strftime("%c")
        else:
            return datetime.fromisoformat(str(raw)).strftime("%c")
    
    
    def format_bytes(n: int) -> str:
        """ Return a byte with suffix B, kB, MB and GB. The string is always 7 chars unless the size exceed 1 TB. """
        if n < 1000:
            return "{:6d}B".format(int(n))
        elif n < 1000000:
            return "{:5.1f}kB".format(int(n / 100) / 10)
        elif n < 1000000000:
            return "{:5.1f}MB".format(int(n / 100000) / 10)
        else:
            return "{:5.1f}GB".format(int(n / 100000000) / 10)
    
    
    def anonymise_email(email: str) -> str:
        def anonymise_part(email_part: str) -> str:
            return f"{email_part[0]}{'*' * (len(email_part) - 2)}{email_part[-1]}"
        parts = []
        for i, part in enumerate(email.split("@", maxsplit=1)):
            if i == 0:
                parts.append(anonymise_part(part))
            else:
                parts.append(".".join((anonymise_part(server_part) if j == 0 else server_part for j, server_part in enumerate(part.split(".", maxsplit=1)))))
        return "@".join(parts)
    
    
    _term_width = 0
    _term_width_update_time = 0
    def get_term_width() -> int:
        global _term_width, _term_width_update_time
        now = time.monotonic()
        if now - _term_width_update_time > 1:
            _term_width_update_time = now
            _term_width = shutil.get_terminal_size().columns
        return _term_width
    
    
    # Pretty download
    
    def pretty_download(dl_list: DownloadList):
    
        """
        Download a `DownloadList` with a pretty progress bar using the `print_task` function
        """
    
        start_time = time.perf_counter()
        last_print_time: Optional[bool] = None
        called_once = False
    
        dl_text = get_message("download.downloading")
        non_path_len = len(dl_text) + 21
    
        def progress_callback(progress: DownloadProgress):
            nonlocal called_once, last_print_time
            now = time.perf_counter()
            if last_print_time is None or (now - last_print_time) > 0.1:
                last_print_time = now
                speed = format_bytes(int(progress.size / (now - start_time)))
                percentage = min(100.0, progress.size / progress.total * 100.0)
                entries = ", ".join((entry.name for entry in progress.entries))
                path_len = max(0, min(80, get_term_width()) - non_path_len - len(speed))
                print(f"[      ] {dl_text} {entries[:path_len].ljust(path_len)} {percentage:6.2f}% {speed}/s\r", end="")
                called_once = True
    
        def complete_task(error: bool = False):
            if called_once:
                result_text = get_message("download.downloaded",
                                          count=dl_list.count,
                                          size=format_bytes(dl_list.size).lstrip(" "),
                                          duration=(time.perf_counter() - start_time))
                if error:
                    result_text = get_message("download.errors", count=result_text)
                result_len = max(0, min(80, get_term_width()) - 9)
                template = "\r[FAILED] {}" if error else "\r[  OK  ] {}"
                print(template.format(result_text[:result_len].ljust(result_len)))
    
        try:
            dl_list.callbacks.insert(0, complete_task)
            dl_list.download_files(progress_callback=progress_callback)
        except DownloadError as err:
            complete_task(True)
            for entry_url, entry_error in err.args[0]:
                entry_error_msg = get_message(f"download.error.{entry_error}")
                print(f"         {entry_url}: {entry_error_msg}")
        finally:
            dl_list.callbacks.pop(0)
    
    
    # Authentication
    
    def prompt_authenticate(ctx: CliContext, email: str, cache_in_db: bool, microsoft: bool, anonymise: bool = False) -> Optional[AuthSession]:
    
        """
        Prompt the user to login using the given email (or legacy username) for specific service (Microsoft or
        Yggdrasil) and return the :class:`AuthSession` if successful, None otherwise. This function handles task
        printing and all exceptions are caught internally.
        """
        #print("promt auth")
        auth_db = new_auth_database(ctx)
        auth_db.load()
    
        task_text = "auth.microsoft" if microsoft else "auth.yggdrasil"
        task_text_args = {"email": anonymise_email(email) if anonymise else email}
        print_task("", task_text, task_text_args)
    
        session = auth_db.get(email, MicrosoftAuthSession if microsoft else YggdrasilAuthSession)
        if session is not None:
            try:
                if microsoft:
                    session = prompt_microsoft_authenticate(auth_db.get_client_id(), email)
                else:
                    session = prompt_yggdrasil_authenticate(auth_db.get_client_id(), email)
                if not session.validate():
                    print_task("", "auth.refreshing")
                    session.refresh()
                    auth_db.save()
                    print_task("OK", "auth.refreshed", task_text_args, done=True)
                else:
                    print_task("OK", "auth.validated", task_text_args, done=True)
                return session
            except AuthError as err:
                print_task("FAILED", f"auth.error.{err.code}", {"details": err.details}, done=True, keep_previous=True)
    
        print_task("..", task_text, task_text_args, done=True)
    
        try:
            if microsoft:
                session = prompt_microsoft_authenticate(auth_db.get_client_id(), email)
            else:
                session = prompt_yggdrasil_authenticate(auth_db.get_client_id(), email)
            if session is None:
                return None
            if cache_in_db:
                print_task("", "auth.caching")
                auth_db.put(email, session)
                auth_db.save()
            print_task("OK", "auth.logged_in", done=True)
            return session
        except AuthError as err:
            print_task("FAILED", f"auth.error.{err.code}", {"details": err.details}, done=True, keep_previous=True)
            return None
    
    
    def prompt_yggdrasil_authenticate(client_id: str, email_or_username: str) -> Optional[YggdrasilAuthSession]:
        print_task(None, "auth.yggdrasil.enter_password")
        password = prompt(password=True)
        if password is None:
            print_task("FAILED", "cancelled")
            return None
        else:
            return YggdrasilAuthSession.authenticate(client_id, email_or_username, password)
    
    
    def prompt_microsoft_authenticate(client_id: str, email: str) -> Optional[MicrosoftAuthSession]:
    
        server_port = 12782
        app_id = MS_AZURE_APP_ID
        redirect_auth = "http://localhost:{}".format(server_port)
        code_redirect_uri = "{}/code".format(redirect_auth)
        exit_redirect_uri = "{}/exit".format(redirect_auth)
    
        nonce = uuid.uuid4().hex
    
        #if not webbrowser.open(MicrosoftAuthSession.get_authentication_url(client_id, code_redirect_uri, email, nonce), new=1, autoraise=True):
        #    print_task("FAILED", "auth.microsoft.no_browser", done=True)
        #    return None
        print(MicrosoftAuthSession.get_authentication_url(app_id, code_redirect_uri, email, nonce))
        webview.create_window("Microsoft Login", url=MicrosoftAuthSession.get_authentication_url(app_id, code_redirect_uri, email, nonce), html='', js_api=None, width=800, height=600, x=None, y=None, resizable=True, fullscreen=False, min_size=(200, 100), hidden=False, frameless=False, minimized=False, confirm_close=False, background_color='#FFF', text_select=False)
        if not webview.start():
            print_task("FAILED", "auth.microsoft.failed_to_authenticate", done=True)
            return None
    
        class AuthServer(HTTPServer):
    
            def __init__(self):
                super().__init__(("", server_port), RequestHandler)
                self.timeout = 0.5
                self.ms_auth_done = False
                self.ms_auth_id_token: Optional[str] = None
                self.ms_auth_code: Optional[str] = None
    
        class RequestHandler(BaseHTTPRequestHandler):
    
            server_version = "PortableMC/{}".format(LAUNCHER_VERSION)
    
            def __init__(self, request: bytes, client_address: Tuple[str, int], auth_server: AuthServer) -> None:
                super().__init__(request, client_address, auth_server)
    
            def log_message(self, _format: str, *args: Any):
                return
    
            def send_auth_response(self, msg: str):
                self.end_headers()
                self.wfile.write("{}{}".format(msg, "\n\nClose this tab and return to the launcher." if cast(AuthServer, self.server).ms_auth_done else "").encode())
                self.wfile.flush()
    
            def do_POST(self):
                if self.path.startswith("/code") and self.headers.get_content_type() == "application/x-www-form-urlencoded":
                    content_length = int(self.headers.get("Content-Length"))
                    qs = url_parse.parse_qs(self.rfile.read(content_length).decode())
                    auth_server = cast(AuthServer, self.server)
                    if "code" in qs and "id_token" in qs:
                        self.send_response(307)
                        # We logout the user directly after authorization, this just clear the browser cache to allow
                        # another user to authenticate with another email after. This doesn't invalide the access token.
                        self.send_header("Location", MicrosoftAuthSession.get_logout_url(app_id, exit_redirect_uri))
                        auth_server.ms_auth_id_token = qs["id_token"][0]
                        auth_server.ms_auth_code = qs["code"][0]
                        self.send_auth_response("Redirecting...")
                    elif "error" in qs:
                        self.send_response(400)
                        auth_server.ms_auth_done = True
                        self.send_auth_response("Error: {} ({}).".format(qs["error_description"][0], qs["error"][0]))
                    else:
                        self.send_response(404)
                        self.send_auth_response("Missing parameters.")
                else:
                    self.send_response(404)
                    self.send_auth_response("Unexpected page.")
    
            def do_GET(self):
                auth_server = cast(AuthServer, self.server)
                if self.path.startswith("/exit"):
                    self.send_response(200)
                    auth_server.ms_auth_done = True
                    self.send_auth_response("Logged in.")
                else:
                    self.send_response(404)
                    self.send_auth_response("Unexpected page.")
    
        print_task("", "auth.microsoft.opening_browser_and_listening")
    
        try:
            with AuthServer() as server:
                while not server.ms_auth_done:
                    server.handle_request()
        except KeyboardInterrupt:
            pass
    
        if server.ms_auth_code is None:
            print_task("FAILED", "auth.microsoft.failed_to_authenticate", done=True)
            return None
        else:
            print_task("", "auth.microsoft.processing")
            if MicrosoftAuthSession.check_token_id(server.ms_auth_id_token, email, nonce):
                return MicrosoftAuthSession.authenticate(app_id, server.ms_auth_code, code_redirect_uri)
            else:
                print_task("FAILED", "auth.microsoft.incoherent_dat", done=True)
                return None
    
    # Messages
    
    def get_message_raw(key: str, kwargs: Optional[dict]) -> str:
        try:
            return messages[key].format_map(kwargs or {})
        except KeyError:
            return key
    
    def get_message(key: str, **kwargs) -> str:
        return get_message_raw(key, kwargs)
    
    
    def print_message(key: str, kwargs: Optional[dict] = None, *, end: str = "\n", trace: bool = False, critical: bool = False):
        if critical:
            print("\033[31m", end="")
        print(get_message_raw(key, kwargs), end=end)
        if trace:
            traceback.print_exc()
        if critical:
            print("\033[0m", end="")
    
    
    def prompt(password: bool = False) -> Optional[str]:
        #print("print")
        try:
            return input("")
        except KeyboardInterrupt:
            return None
    
    
    def print_table(lines: List[Tuple[str, ...]], *, header: int = -1):
        if not len(lines):
            return
        columns_count = len(lines[0])
        columns_length = [0] * columns_count
        for line in lines:
            if len(line) != columns_count:
                raise ValueError(f"Inconsistent cell count '{line}', expected {columns_count}.")
            for i, cell in enumerate(line):
                cell_len = len(cell)
                if columns_length[i] < cell_len:
                    columns_length[i] = cell_len
        format_string = "│ {} │".format(" │ ".join((f"{{:{length}s}}" for length in columns_length)))
        columns_lines = ["─" * length for length in columns_length]
        print("┌─{}─┐".format("─┬─".join(columns_lines)))
        for i, line in enumerate(lines):
            print(format_string.format(*line))
            if i == header:
                print("├─{}─┤".format("─┼─".join(columns_lines)))
        print("└─{}─┘".format("─┴─".join(columns_lines)))
    
    
    _print_task_last_len = 0
    def print_task(status: Optional[str], msg_key: str, msg_args: Optional[dict] = None, *, done: bool = False, keep_previous: bool = False):
        if keep_previous:
            print()
        global _print_task_last_len
        len_limit = max(0, get_term_width() - 9)
        msg = get_message_raw(msg_key, msg_args)[:len_limit]
        missing_len = max(0, _print_task_last_len - len(msg))
        status_header = "\r         " if status is None else "\r[{:^6s}] ".format(status)
        _print_task_last_len = 0 if done else len(msg)
        print(status_header, msg, " " * missing_len, sep="", end="\n" if done else "", flush=True)
    
    
    messages = {
        # Addons
        "addon.invalid_identifier": "Invalid identifier for the addon '{addon}' at '{path}'.",
        "addon.invalid_meta": "Invalid metadata file for the addon '{addon}' defined at '{path}'.",
        "addon.module_conflict": "The addon '{addon}' at '{addon_path}' is internally conflicting with the "
                                 "module '{module}' at '{module_path}', cannot be loaded.",
        "addon.defined_twice": "The addon '{addon}' is defined twice, both at '{path1}' and '{path2}'.",
        "addon.import_error": "The addon '{addon}' has failed to build because some packages is missing:",
        "addon.unknown_error": "The addon '{addon}' has failed to build for unknown reason:",
        "addon.failed_to_build": "Failed to build addon '{addon}' (contact addon's authors):",
        # Args root
        "args": "PortableMC is an easy to use portable Minecraft launcher in only one Python "
                "script! This single-script launcher is still compatible with the official "
                "(Mojang) Minecraft Launcher stored in .minecraft and use it.",
        "args.main_dir": "Set the main directory where libraries, assets and versions. "
                         "This argument can be used or not by subcommand.",
        "args.work_dir": "Set the working directory where the game run and place for examples "
                         "saves, screenshots (and resources for legacy versions), it also store "
                         "runtime binaries and authentication. "
                         "This argument can be used or not by subcommand.",
        # Args search
        "args.search": "Search for Minecraft versions.",
        "args.search.local": "Search only for local installed Minecraft versions.",
        # Args start
        "args.start": "Start a Minecraft version, default to the latest release.",
        "args.start.dry": "Simulate game starting.",
        "args.start.disable_multiplayer": "Disable the multiplayer buttons (>= 1.16).",
        "args.start.disable_chat": "Disable the online chat (>= 1.16).",
        "args.start.demo": "Start game in demo mode.",
        "args.start.resol": "Set a custom start resolution (<width>x<height>).",
        "args.start.jvm": "Set a custom JVM 'javaw' executable path. If this argument is omitted a public build "
                          "of a JVM is downloaded from Mojang services.",
        "args.start.jvm_args": "Change the default JVM arguments.",
        "args.start.no_better_logging": "Disable the better logging configuration built by the launcher in "
                                        "order to improve the log readability in the console.",
        "args.start.anonymise": "Anonymise your email or username for authentication messages.",
        "args.start.temp_login": "Flag used with -l (--login) to tell launcher not to cache your session if "
                                 "not already cached, disabled by default.",
        "args.start.login": "Use a email (or deprecated username) to authenticate using Mojang services (it override --username and --uuid).",
        "args.start.microsoft": "Login using Microsoft account, to use with -l (--login).",
        "args.start.username": "Set a custom user name to play.",
        "args.start.uuid": "Set a custom user UUID to play.",
        "args.start.server": "Start the game and auto-connect to this server address (since 1.6).",
        "args.start.server_port": "Set the server address port (given with -s, --server, since 1.6).",
        # Args login
        "args.login": "Login into your account and save the session.",
        "args.login.microsoft": "Login using Microsoft account.",
        # Args logout
        "args.logout": "Logout and invalidate a session.",
        "args.logout.microsoft": "Logout from a Microsoft account.",
        # Args show
        "args.show": "Show and debug various data.",
        "args.show.about": "Display authors, version and license of PortableMC.",
        "args.show.auth": "Debug the authentication database and supported services.",
        # Args addon
        "args.addon": "Addons management subcommands.",
        "args.addon.list": "List addons.",
        "args.addon.dirs": "Display the list of directories where you can place addons.",
        "args.addon.show": "Show an addon details.",
        # Common
        "continue_using_main_dir": "Continue using this main directory ({})? (y/N) ",
        "cancelled": "Cancelled.",
        # Json Request
        f"json_request.error.{JsonRequestError.INVALID_RESPONSE_NOT_JSON}": "Invalid JSON response from {method} {url}, status: {status}, data: {data}",
        # Misc errors
        f"error.socket": "This operation requires an operational network, but a socket error happened: {reason}",
        # Command search
        "search.type": "Type",
        "search.name": "Identifier",
        "search.release_date": "Release date",
        "search.last_modified": "Last modified",
        "search.flags": "Flags",
        "search.flags.local": "local",
        "search.not_found": "No version match the input.",
        # Command logout
        "logout.yggdrasil.pending": "Logging out {email} from Mojang...",
        "logout.microsoft.pending": "Logging out {email} from Microsoft...",
        "logout.success": "Logged out {email}.",
        "logout.unknown_session": "No session for {email}.",
        # Command addon list
        "addon.list.id": "ID ({count})",
        "addon.list.name": "Name",
        "addon.list.version": "Version",
        "addon.list.authors": "Authors",
        # Command addon show
        "addon.show.not_found": "Addon '{addon}' not found.",
        "addon.show.name": "Name: {name}",
        "addon.show.version": "Version: {version}",
        "addon.show.authors": "Authors: {authors}",
        "addon.show.description": "Description: {description}",
        "addon.show.requires": "Requires:",
        # Command addon dirs
        "addon.dirs.title": "You can place your addons in the following directories:",
        "addon.dirs.entry": "  {path}",
        "addon.dirs.entry.not_existing": "  {path} (not existing)",
        # Command start
        "start.version.resolving": "Resolving version {version}... ",
        "start.version.resolved": "Resolved version {version}.",
        "start.version.jar.loading": "Loading version JAR... ",
        "start.version.jar.loaded": "Loaded version JAR.",
        f"start.version.error.{VersionError.NOT_FOUND}": "Version {version} not found.",
        f"start.version.error.{VersionError.TO_MUCH_PARENTS}": "The version {version} has to much parents.",
        f"start.version.error.{VersionError.JAR_NOT_FOUND}": "Version {version} JAR not found.",
        "start.assets.checking": "Checking assets... ",
        "start.assets.checked": "Checked {count} assets.",
        "start.logger.loading": "Loading logger... ",
        "start.logger.loaded": "Loaded logger.",
        "start.logger.loaded_pretty": "Loaded pretty logger.",
        "start.libraries.loading": "Loading libraries... ",
        "start.libraries.loaded": "Loaded {count} libraries.",
        "start.jvm.loading": "Loading Java... ",
        "start.jvm.loaded": "Loaded Mojang Java {version}.",
        f"start.jvm.error.{JvmLoadingError.UNSUPPORTED_ARCH}": "No JVM download was found for your platform architecture, "
                                                               "use --jvm argument to set the JVM executable of path to it.",
        f"start.jvm.error.{JvmLoadingError.UNSUPPORTED_VERSION}": "No JVM download was found, use --jvm argument to set the "
                                                                  "JVM executable of path to it.",
        "start.starting": "Starting the game...",
        "start.starting_info": "Username: {username} ({uuid})",
        # Pretty download
        "download.downloading": "Downloading",
        "download.downloaded": "Downloaded {count} files, {size} in {duration:.1f}s.",
        "download.errors": "{count} errors happened, can't continue.",
        f"download.error.{DownloadError.CONN_ERROR}": "Connection error",
        f"download.error.{DownloadError.NOT_FOUND}": "Not found",
        f"download.error.{DownloadError.INVALID_SIZE}": "Invalid size",
        f"download.error.{DownloadError.INVALID_SHA1}": "Invalid SHA1",
        # Auth common
        "auth.refreshing": "Invalid session, refreshing...",
        "auth.refreshed": "Session refreshed for {email}.",
        "auth.validated": "Session validated for {email}.",
        "auth.caching": "Caching your session...",
        "auth.logged_in": "Logged in",
        "auth.microsoft_requires_email": "Even if you are using -m (`--microsoft`), you must use `-l` argument with your Microsoft email.",
        # Auth Yggdrasil
        "auth.yggdrasil": "Authenticating {email} with Mojang...",
        "auth.yggdrasil.enter_password": "Password: ",
        f"auth.error.{AuthError.YGGDRASIL}": "{details}",
        # Auth Microsoft
        "auth.microsoft": "Authenticating {email} with Microsoft...",
        "auth.microsoft.no_browser": "Failed to open Microsoft login page, no web browser is supported.",
        "auth.microsoft.opening_browser_and_listening": "Opened authentication page in browser...",
        "auth.microsoft.failed_to_authenticate": "Failed to authenticate.",
        "auth.microsoft.processing": "Processing authentication against Minecraft services...",
        "auth.microsoft.incoherent_data": "Incoherent authentication data, please retry.",
        f"auth.error.{AuthError.MICROSOFT_INCONSISTENT_USER_HASH}": "Inconsistent user hash.",
        f"auth.error.{AuthError.MICROSOFT_DOES_NOT_OWN_MINECRAFT}": "This account does not own Minecraft.",
        f"auth.error.{AuthError.MICROSOFT_OUTDATED_TOKEN}": "The token is no longer valid.",
        f"auth.error.{AuthError.MICROSOFT}": "Misc error: {details}."
    }

    main()
