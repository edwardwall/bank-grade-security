const FS = require("fs");
const HTTP = require("http");
const HTTPS = require("https");

var countries = {};
var banks = [];
var results = {};

var interval;

const banksFile = JSON.parse(FS.readFileSync("../banks.json", "utf8"));

const CATEGORIES = convertCategories({
    "HTTPS": [
        "Upgrade HTTP",
        "HSTS Preload"
    ],
    "Miscellaneous Headers": [
        "Server Header",
        "X-Powered-By Header",
        "ASP.NET Version"
    ]
});

// Read banks from file
for (countryObject of banksFile) {

    let countryCode = countryObject.code.toLowerCase();
    countries[countryCode] = countryObject.name;

    for (bankObject of countryObject.list) {

        bankObject.country = countryCode;
        banks.push(bankObject);

    }

}

banks = banks.sort((a, b) => {
    return a < b;
})

interval = setInterval(begin, 1000); // 1 second

/**
 * Function to begin testing of the next bank.
 */
async function begin() {

    let bankObject = banks.splice(0, 1)[0];

    // check if this was final element in list
    if (0 == banks.length) {
        clearInterval(interval);
    }

    let data = {
        country: bankObject.country,
        name: bankObject.name
    };

    startHttpChainFollow(data, {
        protocol: "http:",
        hostname: bankObject.domain,
        path: "/",
        headers: {}
    });

}


/**
 * An Object containing basic information about a bank.
 * @typedef {Object} BankDataObject
 * @property {string} country - The 2 character code for the bank's country.
 * @property {string} name - The name of the bank.
 */


/**
 * Function to receive reports from async functions about results.
 *
 * @param {BankDataObject} data
 * @param {string} title - The title of the metric being reported.
 * @param {string|boolean} result - The result of the test to be stored.
 * @param {boolean} [onlyIfUndefined] - Indicates that the result should only
 *      be saved if the current value is undefined, used to ensure only first
 *      result is saved.
 */
async function report(data, title, result, onlyIfUndefined) {

    if (undefined === results[data.country]) {
        results[data.country] = {};
    }

    if (undefined === results[data.country][data.name]) {

        results[data.country][data.name] = {};

        for (metric in CATEGORIES) {

            let cat = CATEGORIES[metric];

            if (undefined === results[data.country][data.name][cat]) {
                results[data.country][data.name][cat] = {};
            }

            results[data.country][data.name][cat][metric] = "";

        }

    }

    let reportCategory = CATEGORIES[title];

    if (!onlyIfUndefined ||
        "" === results[data.country][data.name][reportCategory][metric]) {

        results[data.country][data.name][reportCategory][metric] = result;
    }

    FS.writeFile("../output.json", JSON.stringify(results, null, 4), () => {});

}


/**
 * Function to begin series of HTTP requests to follow HTTP redirection chain.
 * @param {BankDataObject} data
 */
async function startHttpChainFollow(data, options) {

    data.chainCount = 0;
    data.cookies = {};

    followChain(data, options);

}


/**
 * Function to follow HTTP redirection chain.
 *
 * @param {BankDataObject} data
 * @param {number} data.chainCount - The count of requests in this chain.
 * @param {number} data.cookies - The cookies set by previous requests.
 * @param {Object} options - The options for the HTTP request.
 * @param {string} options.protocol - The protocol to use, HTTP or HTTPS.
 * @param {string} options.hostname - The hostname to target with the request.
 * @param {string} options.path - The path to request.
 */
async function followChain(data, options) {

    data.chainCount += 1;
    if (data.chainCount > 10) {
        throw data.name + " - Too Many Redirects";
    }

    let testUpgrade = false;
    if (undefined === data.upgradeTested) {
        testUpgrade = true;
        data.upgradeTested = true;
    }

    let cookies = [];
    for (key in data.cookies) {
        cookies.push(key + "=" + data.cookies[key]);
    }
    options.headers.cookie = cookies.join("; ");

    // Make HTTP(S) request
    ("https:" === options.protocol ? HTTPS : HTTP).get(options, (res) => {

        let location;

        try {
            location = res.headers.location;
        } catch (e) {}

        if (undefined === location) {
            location = "";
        }

        let status = res.statusCode;

        checkMiscHeaders(data, res.headers);

    })

}


/**
 * Function to check for and report miscellaneous headers.
 *
 * @param {BankDataObject} data
 * @param {Object} headers - The headers from the HTTP response.
 */
async function checkMiscHeaders(data, headers) {

    let server = headers["server"];
    let powered = headers["x-powered-by"];
    let aspVersion = headers["x-aspnet-version"];
    let aspMvcVersion = headers["x-aspnetmvc-version"];

    if (server) {
        report(data, "Server Header", server, true);
    }

    if (powered) {
        report(data, "X-Powered-By Header", powered, true);
    }

    if (aspVersion) {
        report(data, "ASP.NET Version", aspVerison, true);
    } else if (aspMvcVersion) {
        report(data, "ASP.NET Version", aspMvcVersion, true);
    }

}


/**
 * Function to convert categories, to allow reverse lookup.
 *
 * @param {Object} categories - The categories to be converted.
 */
function convertCategories(categories) {

    let reversedCats = {};

    for (category in categories) {
        for (metric of categories[category]) {

            reversedCats[metric] = category;

        }
    }

    return reversedCats;

}
