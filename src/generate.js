const FS = require("fs");

const PATHS = {
    HTML  : "../html/",
    OUTPUT: "../docs/"
};

const TEMPLATES = getTemplates();
const DETAILS = getBankDetails();
const RESULTS = JSON.parse(FS.readFileSync("../output.json", "utf8"));

var countries = [];
var cards = [];


for (countryCode in RESULTS) {

    let countryResults = RESULTS[countryCode];

    let countryName = DETAILS[countryCode].name;
    let countryCards = [];

    countries.push({
        countryCode,
        countryName
    });

    for (bankName in countryResults) {

        let bankResults = countryResults[bankName];

        let urlSafeBankName = makeUrlSafe(bankName);
        let bankDomain = DETAILS[countryCode]["banks"][bankName];

    }

}


/**
 * Function to make a string safe for use in URL.
 */
function makeUrlSafe(str) {

    str = str.toLowerCase();
    str = str.replace(/ /g, "-");
    str = str.replace(/&/g, "-");
    str = str.replace(/'/g, "");

    return str;

}

/**
 * Function to read in and prepare HTML files.
 */
function getTemplates() {

    let filenames = FS.readdirSync(PATHS.HTML);

    let templates = {};

    for (filename of filenames) {

        let key = filename.substring(0, filename.indexOf('.'));
        templates[key] = FS.readFileSync(PATHS.HTML + filename, "utf8");

    }

    let ret = {};

    for (key in templates) {

        if (key.toLowerCase().includes("header") ||
            key.toLowerCase().includes("footer")) {

            continue;
        }

        if (key.startsWith("template")) {
            ret[key.toUpperCase()] = templates[key];
            continue;
        }

        templates[key] = templates[key]
            .replace("$header", templates.templateHeader)
            .replace("$footer", templates.templateFooter);

        ret[key.toUpperCase()] = templates[key];

    }

    return ret;

}


/**
 * Function to get details of banks from JSON file.
 */
function getBankDetails() {

    const FILE = JSON.parse(FS.readFileSync("../banks.json", "utf8"));

    let details = {};

    for (countryObject of FILE) {

        let countryCode = countryObject.code;

        details[countryCode] = {
            name: countryObject.name,
            banks: {}
        };

        for (bankObject of countryObject.list) {

            details[countryCode]["banks"][bankObject.name] = bankObject.domain;

        }

    }

    return details;

}
