const FS = require("fs");
const URL = require("url");
const HTTP = require("http");
const HTTPS = require("https");

var countries = {};
var banks = [];
var results = {};

var interval;

const banksFile = JSON.parse(FS.readFileSync("../banks.json", "utf8"));

const CATEGORIES = convertCategories({
    "HTTPS": [
        "Upgrade HTTP", // Check that insecure HTTP request is immediately upgraded to HTTPS
        "Secure Redirection Chain", // Check that all parts of the redirection chain use HTTPS
        "HTTP Strict Transport Security", // Check that website uses HSTS
        "HSTS Preload" // Check that website uses HSTS Preloading
    ],
    "DNS": [
        "DNS Security Extensions", // Check that website uses DNSSEC
        "Certification Authority Authorization" // Check that website uses CAA
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

    // Default reports
    report(data, "Upgrade HTTP", false);
    report(data, "Secure Redirection Chain", true);

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

    if ((!onlyIfUndefined) ||
        ("" === results[data.country][data.name][reportCategory][title])) {

        results[data.country][data.name][reportCategory][title] = result;
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
 * Function to make a generic HTTPS GET request and callback.
 *
 * @param {BankDataObject} data
 * @param {URL} url
 * @param {function} callback
 */
async function get(data, url, callback) {

    HTTPS.get(url, (res) => {

        let body = "";

        res.on("data", (chunk) => {
            body += chunk.toString();
        });

        res.on("end", () => {
            callback(data, res.headers, body);
        });

    }).on("error", (err) => {
        callback(data);
    });

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

    let testHttpUpgrade = false;
    if (undefined === data.httpUpgradeTested) {
        testHttpUpgrade = true;
        data.httpUpgradeTested = true;
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

        // HTTP redirect
        if ((300 <= status) && (400 > status)) {

            location = URL.parse(location);

            let nextOptions = {
                headers: {}
            };

            nextOptions.protocol = (location.protocol ? location.protocol : options.protocol);
            nextOptions.hostname = (location.hostname ? location.hostname : options.hostname);

            if (null === location.path) {
                nextOptions.path = "/"; // default to root path
            } else if ("/" === location.path.substring(0, 1)) {
                nextOptions.path = location.path;
            } else {
                nextOptions.path = options.path.substring(0, options.path.lastIndexOf("/") + 1);
                nextOptions.path += location.path;
            }

            if (testHttpUpgrade && ("https:" === nextOptions.protocol)) {
                report(data, "Upgrade HTTP", true);
            }

            if ("http:" === nextOptions.protocol) {
                report(data, "Secure Redirection Chain", false);
            }

            followChain(data, nextOptions);

        } else if (300 > status) { // HTTP Success

            let body = "";

            res.on("data", (chunk) => {
                body += chunk.toString();
            });

            res.on("end", () => {
                analyse(data, options, res.headers, body);
            });

        } else {

            console.log("Error in followChain() - Invalid status code returned");
            console.log(options);
            throw "HTTP " + status + " on " + URL.format(options);

        }

    }).on("error", (err) => { // Error on HTTP request

        if ("http:" === options.protocol) {
            // Some disallow HTTP connections, so try HTTPS
            options.protocol = "https:";
            followChain(data, options);
        } else {
            // Some have invalid certificates
            report(data, "Secure Redirection Chain", false);
            options.rejectUnauthorized = false;
            followChain(data, options);
        }

    });

}


/**
 * Function to analyses headers and HTML returned from page.
 *
 * @param {BankDataObject} data
 * @param {URL} url - The URL to which the request was made.
 * @param {Object} headers - The HTTP response headers.
 * @param {string} body - The HTML page returned.
 */
async function analyse(data, url, headers, body) {

    checkHsts(data, url, headers);
    checkDnssec(data, url.hostname);
    checkCaa(data, url.hostname);

}


/**
 * Function to test whether website uses HSTS.
 *
 * @param {BankDataObject} data
 * @param {URL} url
 * @param {Object} headers
 */
async function checkHsts(data, url, headers) {

    let stsHeader = headers["strict-transport-security"];

    if (undefined === stsHeader) {

        report(data, "HTTP Strict Transport Security", false);
        report(data, "HSTS Preload", false);

    } else {

        stsHeader = stsHeader.replace(/ /g, ""); // remove spaces
        stsHeader = stsHeader.split(";");

        let age = 0;
        let preload = false;

        for (part of stsHeader) {

            let maxAge = "max-age=";

            if (part.startsWith(maxAge)) {
                age = part.substring(maxAge.length);
                age = parseInt(age);
            }

            if ("preload" === part) {
                preload = true;
            }

        }

        report(data, "HTTP Strict Transport Security", (0 < age));

        if (false === preload) {
            report(data, "HSTS Preload", false);
        } else {
            get(data,
                "https://hstspreload.org/api/v2/status?domain=" + url.hostname,
                hstsPreloadCallback);
        }

    }

}


/**
 * Function to receive HSTS Preload response.
 *
 * @param {BankDataObject} data
 * @param {Object} headers
 * @param {string} body
 */
async function hstsPreloadCallback(data, headers, body) {

    body = JSON.parse(body);
    report(data, "HSTS Preload", ("preloaded" === body.status));

}


/**
 * Function to check DNSSEC usage.
 *
 * @param {BankDataObject} data
 * @param {string} hostname
 */
async function checkDnssec(data, hostname) {

    get(data, "https://dns.google.com/resolve?type=DS&name=" + hostname, dnssecCallback);

}


/**
 * Function to receive DNSSEC response.
 *
 * @param {BankDataObject} data
 * @param {Object} headers
 * @param {string} body
 */
async function dnssecCallback(data, headers, body) {

    body = JSON.parse(body);
    report(data, "DNS Security Extensions", (!!body.Answer));

}

/**
 * Function to check CAA usage.
 *
 * @param {BankDataObject} data
 * @param {string} hostname
 */
async function checkCaa(data, hostname) {

    get(data, "https://dns.google.com/resolve?type=CAA&name=" + hostname, caaCallback);

}


/**
 * Function to receive CAA response.
 *
 * @param {BankDataObject} data
 * @param {Object} headers
 * @param {string} body
 */
async function checkCaa(data, headers, body) {

    body = JSON.parse(body);

    if (body.Answer) {
        report(data, "Certification Authority Authorization", true);
    } else {

        let domain;
        let query = body.Question[0].name;
        query = query.substring(0, query.length - 1); // remove trailing dot

        if (body.Authority) {
            domain = body.Authority[0].name;
            domain = domain.substring(0, domain.length - 1); // remove trailing dot
        } else {
            domain = query.split(".");
            domain.splice(0, 1);
            domain = domain.join(".");
        }

        if (domain === query) {
            report(data, "Certification Authority Authorization", false);
        } else {
            checkCaa(data, domain);
        }

    }

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
