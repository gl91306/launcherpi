const { exec } = require('child_process');
const path = require('path');
const process = require('process');
const packageJson = require('./package.json');

// Electorn builder:
const electronBuilderPath = path.join('node_modules', 'electron-builder', 'cli.js');

// Parse command-line arguments:
const supportedPlatforms = ['win', 'mac', 'linux'];
const supportedArchitectures = ['x64', 'armv7l', 'arm64', 'ia32'];
const args = process.argv.slice(2);
const carch = args.includes('--arch') ? args[args.indexOf('--arch') + 1] : null;
const cplatform = args.includes('--platform') ? args[args.indexOf('--platform') + 1] : null;
const pack = args.includes('--pack') || null;

var platform, arch, build_args;

//console.log(supportedPlatforms, supportedArchitectures, cplatform, carch);

// Platform Name:
if (cplatform != null) {
    if (!supportedPlatforms.includes(cplatform)) {
        console.error('Invalid platform specified. Supported platforms: ' + supportedPlatforms.join(', '));
        process.exit(1);
    };
    platform = cplatform;
} else {
    switch (process.platform) {
        case "win32":
            platform = "win";
            break;

        case "darwin":
            platform = "mac";
            break;

        case "linux":
            platform = "linux";
            break;

        default:
            // Build for all:
            platform = "mwl";
            break;
    }
};

// Platform Arch:
if (carch != null) {
    arch = carch;
    if (!supportedArchitectures.includes(arch)) {
        console.error('Invalid arch specified. Supported architectures: ' + supportedArchitectures.join(', '));
        process.exit(1);
    };
} else {
    switch (process.arch) {
        case "arm":
            arch = "armv7l";
            break;
        default:
            arch = process.arch;
    };
};

// Generate artifactname:
const artifactname = `${packageJson.build.productName}-${packageJson.version}-${platform}-${arch}`;

// Additional build arguments:
const additionalArgs = process.argv.slice(4);

// Cli Args:
build_args = [
    electronBuilderPath,
    `--${platform}`,
    `--${arch}`,
    `-c.artifactName="${artifactname}` + '.${ext}"'/*,
    ...additionalArgs*/
];

if (pack) {
    build_args.push(`--dir`);
}

// Make cli:
cli = `node ${build_args.join(' ')}`;

// Build app with custom cli options:
console.info(`CLI: ${cli}`);
console.info(`Building ${artifactname}`);
exec(cli, (error, stdout, stderr) => {
    if (error) {
        console.error('Error during build:', error, stderr);
        console.log(`Please trying running this manualy:`, cli);
        return;
    };

    console.log('Build successful');
    console.log(stdout);
});