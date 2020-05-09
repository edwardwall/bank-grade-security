const FS = require("fs");
const TLS = require("tls");
const URL = require("url");
const PATH = require("path");
const HTTP = require("http");
const HTTPS = require("https");

const CATEGORIES = convertCategories({
    "HTTPS": [
        "Upgrade HTTP", // Check that insecure HTTP request is immediately upgraded to HTTPS
        "Secure Redirection Chain", // Check that all parts of the redirection chain use HTTPS
        "HTTP Strict Transport Security", // Check that website uses HSTS
        "HSTS Preload" // Check that website uses HSTS Preloading
    ],
    "Security Headers": [
        "XSS Protection",
        "Framing Protection",
        "MIME Type Sniffing Protection"
    ],
    "TLS": [
        "Strong TLS Supported", // Check that TLS >= v1.2 is supported by server
        "Weak TLS Disabled", // Check that TLS < v1.2 is not supported by server
        "Forward Secrecy" // Check that server uses Forward Secrecy
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

// Declare global variables
var banks = [];
var results = {};
var interval;

// Read banks from directory
for (filename of FS.readdirSync(PATH.resolve(__dirname, "../banks/"))) {

    let file;
    file = FS.readFileSync(PATH.resolve(__dirname, "../banks/", filename), "utf8");
    file = JSON.parse(file);

    // Sanity check, ensure filename matches file contents
    if (filename != (file.code + ".json")) {
        throw "Incorrect filename - " + file.code + " " + filename;
    }

    for (bankObject of file.list) {

        bankObject.country = file.code;
        banks.push(bankObject);

    }

}

// Sort in reverse alphabetical order, so pop() takes elements alphabetically
banks = banks.sort((a, b) => {
    return a.name < b.name;
});

interval = setInterval(begin, 1000); // 1 second

/**
 * Function to begin testing of the next bank.
 */
async function begin() {

    let data = banks.pop();

    // check if this was final element in list
    if (0 == banks.length) {
        clearInterval(interval);
        interval = setTimeout(writeResults, 10000); // 10 seconds
    }

    // Default reports
    report(data, "Upgrade HTTP", false);
    report(data, "Secure Redirection Chain", true);

    data.chainCount = 0;
    data.cookies = {};

    followChain(data, {
        protocol: "http:",
        hostname: data.domain,
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

}


/**
 * Function to write results to file.
 */
async function writeResults() {

    let date = new Date();

    let year  = String(date.getFullYear());
    let month = String(date.getMonth() + 1);

    if (1 === month.length) {
        month = "0" + month;
    }

    // Ensure that history directory exists
    try {
        FS.mkdirSync(PATH.resolve(__dirname, "../history/"));
    } catch (e) {}

    FS.writeFile(PATH.resolve(__dirname, "../history/", year+month+".json"),
        JSON.stringify(results, null, 4),
        (e) => {
            if (e) {
                // Cannot write to file, write to console to prevent losing results
                console.log("Write to file failed, the results are:");
                console.log(JSON.stringify(results));
                throw e;
            } else {
                console.log("Write successful.");
            }
        });

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

    checkHsts(data, url.hostname, headers);
    checkDnssec(data, url.hostname);
    checkCaa(data);
    checkProtocols(data, url.hostname);
    checkSecurityHeaders(data, headers);

}


/**
 * Function to test whether website uses HSTS.
 *
 * @param {BankDataObject} data
 * @param {string} hostname
 * @param {Object} headers
 */
async function checkHsts(data, hostname, headers) {

    let stsHeader = headers["strict-transport-security"];

    let usesHsts = false;
    let usesPreload = false;

    if (stsHeader) {

        stsHeader = stsHeader.replace(/ /g, ""); // remove spaces
        stsHeader = stsHeader.split(";");

        let maxAge = "max-age=";

        for (directive of stsHeader) {

            if (directive.startsWith(maxAge)) {
                let age = directive.substring(maxAge.length);
                age = parseInt(age);
                usesHsts = (0 < age);
            }

            if (directive.includes("preload")) {
                usesPreload = true;
            }

        }

    }

    report(data, "HTTP Strict Transport Security", usesHsts);
    report(data, "HSTS Preload", false);

    if (usesHsts && usesPreload) {

        let url = "https://hstspreload.org/api/v2/status?domain=" + hostname;

        get(data, url, (data, headers, body) => {

            body = JSON.parse(body);
            report(data, "HSTS Preload", ("preloaded" === body.status));

        });

    }

}


/**
 * Function to check DNSSEC usage.
 *
 * @param {BankDataObject} data
 * @param {string} hostname
 */
async function checkDnssec(data, hostname) {

    get(data, "https://dns.google.com/resolve?type=DS&name=" + hostname, (data, headers, body) => {

        body = JSON.parse(body);
        report(data, "DNS Security Extensions", (!!body.Answer));

    });

}

/**
 * Function to check CAA usage.
 *
 * @param {BankDataObject} data
 */
async function checkCaa(data) {

    get(data, "https://dns.google.com/resolve?type=CAA&name=" + data.domain, (data, headers, body) => {

        body = JSON.parse(body);
        report(data, "Certification Authority Authorization", !!body.Answer);

    });

}


/**
 * Function to check the TLS/SSL Protocols suppoted by the server.
 *
 * @param {BankDataObject} data
 * @param {string} hostname
 */
async function checkProtocols(data, hostname) {

    report(data, "Forward Secrecy", false);

    let strongTest = "Strong TLS Supported";
    let weakTest = "Weak TLS Disabled";

    report(data, strongTest, false);
    report(data, weakTest, true);

    checkProtocol(data, {
        host: hostname,
        minVersion: "TLSv1.2"
    }, strongTest, true);

    checkProtocol(data, {
        host: hostname,
        maxVersion: "TLSv1.1",
        minVersion: "TLSv1"
    }, weakTest, false);

    checkProtocol(data, {
        host: hostname,
        secureProtocol: "SSLv3_method"
    }, weakTest, false);

}


/**
 * Function to perform specific protocol test.
 *
 * @param {BankDataObject} data
 * @param {Object} options
 * @param {string} reportTitle
 * @param {boolean} isSuccessGood
 */
async function checkProtocol(data, options, reportTitle, isSuccessGood) {

    options.port = 443;

    try {

        let socket = TLS.connect(options, () => {

            checkForwardSecrecy(data, socket.getCipher());

            report(data, reportTitle, isSuccessGood);
            socket.destroy();

        }).on("error", (err) => {
            socket.destroy();
        });

    } catch (e) {}

}


/**
 * Function to check whether cipher suite supports Forward Secrecy.
 *
 * @param {BankDataObject} data
 * @param {string} cipher
 */
async function checkForwardSecrecy(data, cipher) {

    let find = [
        "DHE",
        "ECDHE"
    ];

    for (str of find) {

        if (cipher.name.startsWith(str)) {
            report(data, "Forward Secrecy", true);
        }

    }

}


/**
 * Function to check for presence of security headers.
 *
 * @param {BankDataObject} data
 * @param {Object} headers
 */
async function checkSecurityHeaders(data, headers) {

    // Default values
    report(data, "XSS Protection", false);
    report(data, "Framing Protection", false);
    report(data, "MIME Type Sniffing Protection", false);

    checkHttpHeaders(data, headers);

    if (headers["content-security-policy"]) {
        checkCsp(data, headers["content-security-policy"]);
    }

}


/**
 * Function to check HTTP headers for security.
 *
 * @param {BankDataObject} data
 * @param {Object} headers
 */
async function checkHttpHeaders(data, headers) {

    let xXssProtection = headers["x-xss-protection"];
    let xFrameOptions = headers["x-frame-options"];
    let xContentTypeOptions = headers["x-content-type-options"];

    if (xXssProtection && (xXssProtection.startsWith("1"))) {
        report(data, "XSS Protection", true);
    }

    if (xFrameOptions) {

        xFrameOptions = xFrameOptions.toLowerCase();
        xFrameOptions += " "; // Aids testing for wildcards

        let directive = (
            xFrameOptions.includes("deny ") ||
            xFrameOptions.includes("sameorigin ") ||
            xFrameOptions.includes("allow-from ")
        );

        let allowFromWildcard = (
            xFrameOptions.includes(" * ") ||
            xFrameOptions.includes("http://* ") ||
            xFrameOptions.includes("https://* ")
        );

        if (directive && !allowFromWildcard) {
            report(data, "Framing Protection", true);
        }

    }

    if (xContentTypeOptions &&
        xContentTypeOptions.toLowerCase().includes("nosniff")) {

        report(data, "MIME Type Sniffing Protection", true);
    }

}


/**
 * Function to check Content Security Policy.
 *
 * @param {BankDataObject} data
 * @param {Object} header
 */
async function checkCsp(data, header) {

    let defaultSrc = false;
    let scriptSrcExists = false;
    let scriptSrc = false;

    let frameAncestors = false;

    for (directive of header.split(";")) {

        directive += " "; // Aids testing for wildcards
        directive = directive.trim(); // Remove spaces at beginning

        if (directive.startsWith("default-src ")) {
            defaultSrc = performXssCheck(directive);
        }

        if (directive.startsWith("script-src ")) {
            scriptSrcExists = true;
            scriptSrc = performXssCheck(directive);
        }

        if (directive.startsWith("frame-ancestors ")) {
            frameAncestors = performAncestorsCheck(directive);
        }

    }

    if (scriptSrcExists) {
        if (scriptSrc) {
            report(data, "XSS Protection", true);
        }
    } else if (defaultSrc) {
        report(data, "XSS Protection", true);
    }

    if (frameAncestors) {
        report(data, "Framing Protection", true);
    }

    /**
     * Internal Function to check for unsafe inline or wildcard scripts.
     */
    function performXssCheck(directive) {

        return ! (
            directive.includes("'unsafe-inline'") ||
            directive.includes(" * ") ||
            directive.includes("http: ") ||
            directive.includes("http://* ") ||
            directive.includes("https: ") ||
            directive.includes("https://* ")
        );

    }

    /**
     * Internal Function to check for unsafe frame ancestors.
     */
    function performAncestorsCheck(directive) {

        return ! (
            directive.includes(" * ") ||
            directive.includes("http: ") ||
            directive.includes("http://* ") ||
            directive.includes("https: ") ||
            directive.includes("https://* ")
        );

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
        report(data, "ASP.NET Version", aspVersion, true);
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
