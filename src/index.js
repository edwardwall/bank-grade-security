const FS = require("fs");
const PATH = require("path");

const WSS = require("../../../website-security-scanner/src/main.js");

const PATHS = {
    BANKS: "../banks/",
    HTML: "../html/",
    HISTORY: "../history/",
    OUTPUT: "../docs/",
    RESOURCES: "../resources/",
    IMAGES: "../images/"
};

const TEMPLATES = getTemplates();

var banks = [];
var countries = {};
var sitemap = ["https://bankgradesecurity.com/"];

for (filename of FS.readdirSync(PATH.resolve(__dirname, PATHS.BANKS))) {

    let file;
    file = FS.readFileSync(PATH.resolve(__dirname, PATHS.BANKS, filename), "utf8");
    file = JSON.parse(file);

    // Sanity check, ensure filename matches file contents
    if (filename !== (file.code + ".json")) {
        throw Error("Filename does not match contents - " + filename);
    }

    countries[file.code] = {
        name: file.name,
        banks: []
    };

    for (bankObject of file.list) {

        countries[file.code].banks.push(bankObject);

        bankObject.country = {
            code: file.code,
            name: file.name
        };
        banks.push(bankObject);

    }

}

const DELAY = 5000; // 5 seconds

console.log("~~ Bank Grade Security");
console.log("Found", banks.length, "banks from", Object.keys(countries).length, "countries");
console.log("Estimated time for scanning is", Math.ceil((banks.length * DELAY) / (60 * 1000)), "minutes");
console.log();

// Sort into alphabetical order
banks.sort((a, b) => {
    if (a.name > b.name) {
        return 1;
    } else if (a.name < b.name) {
        return -1;
    }

    if (a.country > b.country) {
        return -1;
    }

    return 1;
});


var index = 0;

async function begin() {

    return new Promise((resolve, reject) => {

        let bank = banks[index];
        index += 1;

        let scanner = new WSS(bank.domain);

        scanner.scan()
        .then((results) => {

            banks[index - 1].results = results;

            if (banks.length > index) { // call recursively

                setTimeout(() => {
                    begin()
                    .then(() => {
                        resolve();
                    });
                }, DELAY);

            } else { // last element
                resolve();
            }

        });

    });

}

begin()
.then(createWebsite);

function createWebsite() {

    writeStandardFiles();

    let cards = [];

    for (code in countries) {
        countries[code].cards = [];
    }

    for (bank of banks) {

        let results = processResults(bank.results);

        let score = calculateScore(results);
        let grade = calculateGrade(score);
        let urlName = makeUrlSafe(bank.name);

        writeBankPage(bank.country, bank.name, urlName, bank.domain,
            score, grade, results);

        let card = {
            score,
            name: bank.name,
            html: makeCard(bank.country.code, bank.name, urlName,
                    bank.domain, score, grade)
        };

        countries[bank.country.code].cards.push(card);
        cards.push(card);

    }

    for (code in countries) {
        writeCountryPage(code, countries[code].name, countries[code].cards);
    }

    writeHomePage(cards);
    writeFile("sitemap.txt", sitemap.join("\n" + "https://bankgradesecurity.com"));

}


function processResults(results) {

    let response = {};

    response.HTTPS = {
        "Upgrade HTTP": results.upgradeToHttps.result,
        "Secure Redirection": results.secureRedirectionChain.result,
        "Accepts HTTPS": results.accepts.https,
        "HSTS": results.hsts.result,
        "HSTS Preloaded": false
    };

    if (response.HTTPS.HSTS) {
        response.HTTPS["HSTS Preloaded"] = results.hsts.data.preloaded
    }

    response.TLS = {
        "TLS 1.3 Enabled": results.tlsProtocols.data["1.3"],
        "Old TLS Disabled": !(results.tlsProtocols.data["1.1"] || results.tlsProtocols.data["1.0"]),
        "Forward Secrecy": results.forwardSecrecy.result
    };

    response.DNS = {
        "DNSSEC": results.dnssec.result,
        "CAA": results.caa.result
    };

    return response;

}

/**
 * Function to calculate a bank's score from the results.
 * @param {Object} results
 * @returns {number}
 */
function calculateScore(results) {

    let total = 0;
    let score = 0;

    for (category in results) {
        for (metric in results[category]) {

            total += 1;

            if (results[category][metric]) {
                score += 1;
            }

        }
    }

    score *= 100;
    score /= total;
    score = Math.round(score);

    return score;

}

/**
 * Function to return a bank's grade from the score.
 * @param {number} score
 * @returns {string}
 */
function calculateGrade(score) {

    score = Math.floor(score / 20);
    return ["E", "D", "C", "B", "A", "Z"][score];

}

/**
 * Function to make a string safe for use in URL.
 * @param {string} str
 * @returns {string}
 */
function makeUrlSafe(str) {
    return str
        .toLowerCase()
        .replace(/ /g, "-")
        .replace(/&/g, "-")
        .replace(/'/g, "");
}

/**
 * Function to write a given file to the given location.
 * @param {string} file
 * @param {string} location
 */
function writeFile(file, location) {

    FS.writeFileSync(PATH.resolve(__dirname, PATHS.OUTPUT, location), file);

}

/**
 * Function to write bank HTML file.
 * @param {Object} country
 * @param {string} bankName
 * @param {string} urlSafeBankName
 * @param {string} domain
 * @param {number} score
 * @param {string} grade
 * @param {Object} results
 */
function writeBankPage(country, bankName, urlSafeBankName, domain,
    score, grade, results, previous) {

    try {
        FS.mkdirSync(PATH.resolve(__dirname, PATHS.OUTPUT, country.code));
    } catch (e) {}

    let page = TEMPLATES.BANK;

    page = page.replace(/\$countryCode/g, country.code);
    page = page.replace(/\$upperCountryCode/g, country.code.toUpperCase());
    page = page.replace(/\$name/g, bankName);
    page = page.replace(/\$score/g, score);
    page = page.replace(/\$grade/g, grade);

    page = page.replace(/\$countryName/g, country.name);
    page = page.replace(/\$domain/g, domain);

    page = page.replace(/\$explanation/g, bankName + " " + getExplanation(grade));
    page = page.replace(/\$urlSafeName/g, urlSafeBankName);

    page = page.replace("$main", makeBankMain(results));

    let path = country.code + "/" + urlSafeBankName + ".html";

    writeFile(page, path);
    sitemap.push(path);

}

/**
 * Function to create a country's HTML page.
 * @param {string} code
 * @param {string} name
 * @param {Object[]} cards
 */
function writeCountryPage(code, name, cards) {

    let page = TEMPLATES.COUNTRY;

    page = page.replace(/\$countryCode/g, code);
    page = page.replace(/\$countryName/g, name);

    cards = sortCards(cards);

    let main = "";

    for (card of cards) {
        main += card.html;
    }

    page = page.replace("$main", main);

    writeFile(page, code+".html");
    sitemap.push(code + ".html");

}

/**
 * Function to create the homepage.
 * @param {Object[]} cards
 */
function writeHomePage(cards) {

    let page = TEMPLATES.HOMEPAGE;

    let replace = [];

    for (country of countries) {
        replace.push(
            "<a href=https://bankgradesecurity.com/" + country.countryCode +
            ">" + country.countryName + "</a>"
        );
    }

    page = page.replace("$countries", replace.join("\n"));
    card = sortCards(cards);

    let main = "";

    for (card of cards) {
        main += card.html;
    }

    page = page.replace("$main", main);

    writeFile(page, "index.html");

}

/**
 * Function to sort HTML cards.
 * @param {Object[]} cards
 */
function sortCards(cards) {

    return cards.sort((a, b) => {

        if (a.score < b.score) {
            return 1;
        } else if (a.score > b.score) {
            return -1;
        }

        if (a.name < b.name) {
            return -1;
        } else if (a.name > b.name) {
            return 1;
        }

        return 0;

    });

}

/**
 * Function to make the main section of the bank HTML page.
 * @param {Object} results
 * @returns {string}
 */
function makeBankMain(results) {

    let main = "";

    let categoryHtmlTop = "<section><div class=top>$category</div>";
    let categoryHtmlBottom = "</section>";

    for (category in results) {
        main += categoryHtmlTop.replace("$category", category);

        for (metric in results[category]) {
            let result = results[category][metric];
            let grade;
            let check;

            if ("boolean" == typeof result) {
                grade = (result ? "A" : "E");
                check = (result ? "&check;" : "&cross;");
            } else {
                grade = "";
                check = (("" === result) ? "<i>hidden</i>" : htmlEncode(result));
            }

            main +=
                "<div class=measure>\
                <span>" + metric + "</span>\
                <div class=results>\
                <div class=\"result "+grade+"\">"+check+"</div>\
                </div>\
                </div>";
        }

        main += categoryHtmlBottom;
    }

    return main;

}

/**
 * Function to encode unsafe HTML characters.
 * @param {string} string
 * @returns {string}
 */
function htmlEncode(string) {

    let replace = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;"
    };

    for (c in replace) {
        string = string.split(c).join(replace[c]);
    }

    return string;

}

/**
 * Function to return the grade-based explanation.
 * @param {string} grade
 * @returns {string}
 */
function getExplanation(grade) {

    if (grade == "Z") {
        return "has excellent website security. They have passed every test.";

    } else if (grade == "A") {
        return "has very good security. They have passed almost every test.";

    } else if (grade == "B") {
        return "has above average security. They have passed most of the tests.";

    } else if (grade == "C") {
        return "has average security. They have failed around half of the tests.";

    } else if (grade == "D") {
        return "has below average security. They have failed most of the tests.";

    } else if (grade == "E") {
        return "has very bad security. They have failed almost every on of the tests.";
    }

}

/**
 * Function to create a bank's HTML card.
 * @param {string} countryCode
 * @param {string} bankName
 * @param {string} urlSafeBankName
 * @param {string} domain
 * @param {number} score
 * @param {string} grade
 * @returns {string}
 */
function makeCard(countryCode, bankName, urlSafeBankName, domain, score, grade) {

    let card =
        "<a class=card href=https://bankgradesecurity.com/"+countryCode+"/"+urlSafeBankName+">\
        <div class=\"grade "+grade+">" +score+ "</div>\
        <div class=name>" +bankName+ "</div>\
        <div class=details>" +countryCode.toUpperCase()+ "</div><div class=details>" +domain+ "</div>\
        </a>";

    return card;
}

/**
 * Function to read in and prepare HTML files.
 * @returns {Object}
 */
function getTemplates() {

    let filenames = FS.readdirSync(PATH.resolve(__dirname, PATHS.HTML));
    let files = {};

    for (filename of filenames) {
        files[filename] = FS.readFileSync(PATH.resolve(__dirname, PATHS.HTML, filename), "utf8");
    }

    let templates = {};

    for (filename in files) {

        if (filename.toLowerCase().includes("header") ||
            filename.toLowerCase().includes("footer")) {

            continue;
        }

        files[filename] = files[filename]
            .replace("$header", files["templateHeader.html"])
            .replace("$footer", files["templateFooter.html"]);

        let key = filename.substring(0, filename.indexOf(".")); // remove file extension

        templates[key.toUpperCase()] = files[filename];
    }

    return templates;
}

/**
 * Function to move standard files into website directory.
 */
function writeStandardFiles() {

    writeFile("bankgradesecurity.com", "CNAME");// CNAME for GitHub

    const DIR = "resources/";

    try {
        FS.mkdirSync(PATH.resolve(__dirname, PATHS.OUTPUT, DIR));
    } catch (e) {}


    for (directory of [PATHS.RESOURCES, PATHS.IMAGES]) {

        let files = FS.readdirSync(PATH.resolve(__dirname, directory));

        for (filename of files) {

            let file = FS.readFileSync(PATH.resolve(__dirname, directory, filename));
            writeFile(file, DIR + filename);

        }

    }

}
