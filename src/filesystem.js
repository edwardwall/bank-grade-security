const FS = require("fs");
const PATH = require("path");

module.exports = {
    readDirectory,
    makeDirectory,
    readFile,
    writeFile
};

/**
 * Function to read directory.
 * @param {string} path
 * @returns {Array}
 */
function readDirectory(path) {
    return FS.readdirSync(PATH.resolve(__dirname, path));
}

/**
 * Function to make directory.
 * @param {string} path
 */
function makeDirectory(path) {
    FS.mkdirSync(PATH.resolve(__dirname, path));
}

/**
 * Function to read file.
 * @param {string} file
 * @returns {string}
 */
function readFile(file) {
    return FS.readFileSync(PATH.resolve(__dirname, file), "utf8");
}

/**
 * Function to write a given file to the given location.
 * @param {string} location
 * @param {string} file
 */
function writeFile(location, file) {
    FS.writeFileSync(PATH.resolve(__dirname, PATHS.OUTPUT, location), file);
}
