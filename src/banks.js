const FS = require("./filesystem.js");

module.exports = {
    read,
    sort
};

/**
 * Read banks from JSON files and populate banks array.
 * @param {string} path
 * @returns {Object}
 * @throws if any bank file has incorrect format.
 * @throws if bank file contents does not match filename.
 * @throws if any bank object in any bank file has incorrect format.
 */
function read(path) {

    let banks = [];
    let countries = {};

    for (filename of FS.readDirectory(path)) {
        let file = JSON.parse(FS.readFile(path + filename));

        // Ensure file has correct format.
        if (!(file.code && file.name && file.list)) {
            throw Error(`File has incorrect format - ${filename}`);
        }

        // Ensure filename matches file contents.
        if ((file.code + ".json") !== filename) {
            throw Error(`Filename does not match contents - ${filename}`);
        }

        countries[file.code] = {
            name: file.name,
            cards: []
        };

        for (bankObject of file.list) {

            // Ensure bank has correct format.
            if (!(bankObject.name && bankObject.domain)) {
                throw Error(`Bank has incorrect format in ${filename} ` +
                    JSON.stringify(bankObject));
            }

            bankObject.country = {
                code: file.code,
                name: file.name
            };

            banks.push(bankObject);
        }
    }

    return {
        banks,
        countries
    };

}

/**
 * Sort banks alphabetically.
 * @param {Object[]} banks
 * @returns {Object[]}
 * @throws if any bank is duplicated.
 */
function sort(banks) {
    return banks.sort((a, b) => {
        if (a.name > b.name) {
            return 1;
        } else if (a.name < b.name) {
            return -1;
        }

        if (a.country.code > b.country.code) {
            return 1;
        } else if (a.country.code < b.country.code) {
            return -1;
        }

        // Should never get here.
        // Both banks have the same name and country.
        throw Error("Bank duplicated\n - " + JSON.stringify(a) + "\n - " + JSON.stringify(b));
    });
}
